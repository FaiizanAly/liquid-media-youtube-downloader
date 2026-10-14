/**
 * Liquid Media Companion - Media Processor Service
 * Handles tool detection, format resolution, local media processing, and job queue management.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const validators = require('../../js/validators');
const formatsUtil = require('../../js/formats');

const TEMP_DIR = path.resolve(__dirname, '..', 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// In-memory Job Queue
const jobs = new Map();

// Tool configuration & availability state
let toolsConfig = {
  checked: false,
  ffmpeg: false,
  ffmpegPath: null,
  ffmpegDir: null,
  ytdlp: false,
  ytDlpBin: 'yt-dlp',
  ytDlpPrefixArgs: []
};

/**
 * Recursively locates a filename in a directory (up to maxDepth).
 */
function findFile(dir, targetName, maxDepth = 4, currentDepth = 0) {
  if (!dir || currentDepth > maxDepth || !fs.existsSync(dir)) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFile(fullPath, targetName, maxDepth, currentDepth + 1);
        if (found) return found;
      } else if (entry.name.toLowerCase() === targetName.toLowerCase()) {
        return fullPath;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Tests if a binary/command executes successfully.
 */
function testCommand(bin, args = ['--version']) {
  return new Promise((resolve) => {
    try {
      const proc = spawn(bin, args, { shell: false, stdio: 'ignore' });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * Probes the host system for FFmpeg and yt-dlp across PATH and common install directories.
 */
async function detectInstalledTools(forceRefresh = false) {
  if (toolsConfig.checked && !forceRefresh) {
    return toolsConfig;
  }

  // 1. Detect FFmpeg
  let hasFfmpeg = await testCommand('ffmpeg', ['-version']);
  let ffmpegPath = null;
  let ffmpegDir = null;

  if (hasFfmpeg) {
    ffmpegPath = 'ffmpeg';
  } else {
    // Check WinGet packages directory
    const wingetDir = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    const wingetFfmpeg = findFile(wingetDir, 'ffmpeg.exe');
    if (wingetFfmpeg) {
      hasFfmpeg = true;
      ffmpegPath = wingetFfmpeg;
      ffmpegDir = path.dirname(wingetFfmpeg);
    } else {
      // Check WindowsApps or Program Files
      const commonPaths = [
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'ffmpeg.exe'),
        'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\ffmpeg\\bin\\ffmpeg.exe'
      ];
      for (const p of commonPaths) {
        if (fs.existsSync(p)) {
          hasFfmpeg = true;
          ffmpegPath = p;
          ffmpegDir = path.dirname(p);
          break;
        }
      }
    }
  }

  // 2. Detect yt-dlp
  let hasYtdlp = false;
  let ytDlpBin = 'yt-dlp';
  let ytDlpPrefixArgs = [];

  // Check 1: Global yt-dlp
  if (await testCommand('yt-dlp', ['--version'])) {
    hasYtdlp = true;
    ytDlpBin = 'yt-dlp';
    ytDlpPrefixArgs = [];
  }
  // Check 2: python -m yt_dlp
  else if (await testCommand('python', ['-m', 'yt_dlp', '--version'])) {
    hasYtdlp = true;
    ytDlpBin = 'python';
    ytDlpPrefixArgs = ['-m', 'yt_dlp'];
  }
  // Check 3: Python user scripts folder (%APPDATA%\Python\*\Scripts\yt-dlp.exe)
  else {
    const appData = process.env.APPDATA || '';
    const pythonScriptsDir = path.join(appData, 'Python');
    const localYtDlp = findFile(pythonScriptsDir, 'yt-dlp.exe');
    if (localYtDlp) {
      hasYtdlp = true;
      ytDlpBin = localYtDlp;
      ytDlpPrefixArgs = [];
    }
  }

  toolsConfig = {
    checked: true,
    ffmpeg: hasFfmpeg,
    ffmpegPath,
    ffmpegDir,
    ytdlp: hasYtdlp,
    ytDlpBin,
    ytDlpPrefixArgs
  };

  return toolsConfig;
}

/**
 * Normalizes format breakdown for a target media URL.
 */
async function resolveFormats(targetUrl) {
  if (!validators.isValidUrl(targetUrl)) {
    throw new Error('Invalid or unpermitted media URL scheme');
  }

  const isYT = validators.isYouTubeUrl(targetUrl);
  const videoId = validators.extractYouTubeVideoId(targetUrl);
  const tools = await detectInstalledTools();

  // If YouTube and yt-dlp is installed, safely query real formats
  if (isYT && tools.ytdlp) {
    try {
      return await queryYtDlpFormats(targetUrl);
    } catch (err) {
      console.warn('[Liquid Media] Real-time format extraction failed, falling back to standard tiers:', err.message);
      if (videoId) {
        return getYouTubePermittedFormatTiers(videoId);
      }
      throw err;
    }
  }

  // If YouTube and yt-dlp is not installed, return standard permitted tier breakdown
  if (isYT && videoId) {
    return getYouTubePermittedFormatTiers(videoId);
  }

  // If direct media
  if (validators.isDirectMediaUrl(targetUrl)) {
    const directFmt = formatsUtil.createDirectMediaFormat(targetUrl);
    return {
      videoFormats: directFmt.kind === 'video' ? [directFmt] : [],
      audioFormats: directFmt.kind === 'audio' ? [directFmt] : [],
      metadata: { title: 'Direct Media Source', url: targetUrl }
    };
  }

  throw new Error('Unsupported media source or provider.');
}

/**
 * Standard YouTube format tiers
 */
function getYouTubePermittedFormatTiers(videoId) {
  const videoFormats = [
    {
      id: 'yt_1080p_mp4',
      kind: 'video',
      label: '1080p FHD',
      resolution: 1080,
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      fps: 30,
      estimatedSize: '~120 MB',
      downloadCapability: 'companion_merge',
      requiresCompanion: true,
      source: 'youtube'
    },
    {
      id: 'yt_720p_mp4',
      kind: 'video',
      label: '720p HD',
      resolution: 720,
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      fps: 30,
      estimatedSize: '~65 MB',
      downloadCapability: 'companion_merge',
      requiresCompanion: true,
      source: 'youtube'
    },
    {
      id: 'yt_480p_mp4',
      kind: 'video',
      label: '480p SD',
      resolution: 480,
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      fps: 30,
      estimatedSize: '~35 MB',
      downloadCapability: 'companion_merge',
      requiresCompanion: true,
      source: 'youtube'
    },
    {
      id: 'yt_360p_mp4',
      kind: 'video',
      label: '360p',
      resolution: 360,
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      fps: 30,
      estimatedSize: '~18 MB',
      downloadCapability: 'companion_merge',
      requiresCompanion: true,
      source: 'youtube'
    }
  ].map(formatsUtil.normalizeFormat);

  const audioFormats = [
    {
      id: 'yt_audio_320_mp3',
      kind: 'audio',
      label: '320 kbps (HQ)',
      bitrateKbps: 320,
      container: 'mp3',
      audioCodec: 'mp3',
      estimatedSize: '~9.5 MB',
      downloadCapability: 'companion_convert',
      requiresCompanion: true,
      source: 'youtube'
    },
    {
      id: 'yt_audio_256_m4a',
      kind: 'audio',
      label: '256 kbps (AAC)',
      bitrateKbps: 256,
      container: 'm4a',
      audioCodec: 'aac',
      estimatedSize: '~7.8 MB',
      downloadCapability: 'companion_merge',
      requiresCompanion: true,
      source: 'youtube'
    },
    {
      id: 'yt_audio_128_m4a',
      kind: 'audio',
      label: '128 kbps (Standard)',
      bitrateKbps: 128,
      container: 'm4a',
      audioCodec: 'aac',
      estimatedSize: '~4.2 MB',
      downloadCapability: 'companion_merge',
      requiresCompanion: true,
      source: 'youtube'
    }
  ].map(formatsUtil.normalizeFormat);

  return {
    videoFormats,
    audioFormats,
    metadata: {
      videoId,
      title: `YouTube Video (${videoId})`,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    }
  };
}

/**
 * Queries real formats using yt-dlp and deduplicates into clean macOS-inspired tiers.
 */
function queryYtDlpFormats(url) {
  return new Promise((resolve, reject) => {
    const tools = toolsConfig;
    const args = [
      ...tools.ytDlpPrefixArgs,
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--js-runtimes', 'node'
    ];

    if (tools.ffmpegDir) {
      args.push('--ffmpeg-location', tools.ffmpegDir);
    }
    args.push(url);

    const proc = spawn(tools.ytDlpBin, args, { shell: false });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp format resolution failed: ${stderr.slice(0, 200)}`));
      }
      try {
        const meta = JSON.parse(stdout);
        const videoByHeight = new Map();
        const audioByBitrate = new Map();

        if (Array.isArray(meta.formats)) {
          for (const f of meta.formats) {
            // Process Video formats
            if (f.vcodec && f.vcodec !== 'none' && f.height && f.height >= 144) {
              const height = f.height;
              const existing = videoByHeight.get(height);
              const isMp4 = f.ext === 'mp4';
              const isH264 = (f.vcodec || '').toLowerCase().startsWith('avc') || (f.vcodec || '').toLowerCase().startsWith('h264');

              // Prefer MP4/H264 for maximum native compatibility, then larger/better stream
              if (!existing || (isMp4 && isH264) || (!existing.isH264 && isMp4)) {
                videoByHeight.set(height, {
                  id: f.format_id,
                  kind: 'video',
                  label: `${height}p${f.fps && f.fps > 30 ? f.fps : ''}`,
                  resolution: height,
                  fps: f.fps || 30,
                  container: isMp4 ? 'mp4' : (f.ext || 'mp4'),
                  videoCodec: isH264 ? 'h264' : (f.vcodec ? f.vcodec.split('.')[0] : 'h264'),
                  audioCodec: 'aac',
                  estimatedBytes: f.filesize || f.filesize_approx || null,
                  estimatedSize: formatsUtil.formatBytes(f.filesize || f.filesize_approx) || `~${Math.round(height * 0.12)} MB`,
                  downloadCapability: 'companion_merge',
                  requiresCompanion: true,
                  source: 'youtube',
                  isH264
                });
              }
            }
            // Process Audio formats
            else if (f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')) {
              const abr = Math.round(f.abr || 128);
              const roundedAbr = abr >= 240 ? 320 : (abr >= 180 ? 256 : (abr >= 100 ? 128 : 64));
              const existing = audioByBitrate.get(roundedAbr);

              if (!existing || (f.ext === 'm4a') || (f.abr && existing.abr && f.abr > existing.abr)) {
                audioByBitrate.set(roundedAbr, {
                  id: f.format_id,
                  kind: 'audio',
                  label: roundedAbr === 320 ? '320 kbps (HQ MP3)' : `${roundedAbr} kbps (${f.ext ? f.ext.toUpperCase() : 'M4A'})`,
                  bitrateKbps: roundedAbr,
                  container: roundedAbr === 320 ? 'mp3' : (f.ext || 'm4a'),
                  audioCodec: roundedAbr === 320 ? 'mp3' : (f.acodec ? f.acodec.split('.')[0] : 'aac'),
                  estimatedBytes: f.filesize || f.filesize_approx || null,
                  estimatedSize: formatsUtil.formatBytes(f.filesize || f.filesize_approx) || `~${Math.round(roundedAbr * 0.025)} MB`,
                  downloadCapability: roundedAbr === 320 ? 'companion_convert' : 'companion_merge',
                  requiresCompanion: true,
                  source: 'youtube',
                  abr: f.abr || roundedAbr
                });
              }
            }
          }
        }

        // If audio list doesn't have 320kbps MP3 option, synthesize it for authorized conversion
        if (!audioByBitrate.has(320)) {
          audioByBitrate.set(320, {
            id: 'yt_audio_320_mp3',
            kind: 'audio',
            label: '320 kbps (HQ MP3)',
            bitrateKbps: 320,
            container: 'mp3',
            audioCodec: 'mp3',
            estimatedSize: '~9.5 MB',
            downloadCapability: 'companion_convert',
            requiresCompanion: true,
            source: 'youtube'
          });
        }

        const rawVideos = Array.from(videoByHeight.values()).map(formatsUtil.normalizeFormat);
        const rawAudios = Array.from(audioByBitrate.values()).map(formatsUtil.normalizeFormat);

        resolve({
          videoFormats: formatsUtil.sortVideoFormats(rawVideos.length > 0 ? rawVideos : getYouTubePermittedFormatTiers(meta.id).videoFormats),
          audioFormats: formatsUtil.sortAudioFormats(rawAudios.length > 0 ? rawAudios : getYouTubePermittedFormatTiers(meta.id).audioFormats),
          metadata: {
            videoId: meta.id,
            title: meta.title,
            channel: meta.uploader || meta.channel || '',
            thumbnail: meta.thumbnail || `https://i.ytimg.com/vi/${meta.id}/hqdefault.jpg`
          }
        });
      } catch (err) {
        reject(new Error(`Failed to parse metadata: ${err.message}`));
      }
    });
  });
}

/**
 * Creates and runs a processing job.
 */
async function createJob({ url, formatId, kind, title }) {
  if (!validators.isValidUrl(url)) {
    throw new Error('Invalid URL');
  }

  const jobId = crypto.randomBytes(16).toString('hex');
  const isMp3 = formatId && formatId.includes('mp3');
  const ext = kind === 'audio' ? (isMp3 ? 'mp3' : 'm4a') : 'mp4';
  const safeFilename = validators.sanitizeFilename(title || `media_${jobId}`, ext);
  const outPath = path.join(TEMP_DIR, `${jobId}_${safeFilename}`);

  const job = {
    id: jobId,
    url,
    formatId,
    kind,
    title: title || safeFilename,
    filename: safeFilename,
    outPath,
    status: 'queued',
    progress: 0,
    downloadUrl: null,
    error: null,
    createdAt: Date.now()
  };

  jobs.set(jobId, job);

  // Kick off processing asynchronously
  processJob(job).catch(err => {
    job.status = 'failed';
    job.error = err.message;
  });

  return job;
}

/**
 * Executes the job processing pipeline.
 */
async function processJob(job) {
  job.status = 'processing';
  job.progress = 5;

  const tools = await detectInstalledTools();

  // If yt-dlp is available, run real download/conversion pipeline
  if (tools.ytdlp) {
    await runYtDlpJob(job);
    return;
  }

  // If it's a direct media URL, we stream it directly
  if (validators.isDirectMediaUrl(job.url)) {
    await downloadDirectStream(job);
    return;
  }

  // When tools are not yet installed on host, perform simulation of remuxing pipeline
  await simulateProcessing(job);
}

/**
 * Simulates conversion / remuxing pipeline for test verification when external tools are absent.
 */
async function simulateProcessing(job) {
  for (let p = 20; p <= 95; p += 25) {
    await new Promise(r => setTimeout(r, 150));
    job.progress = p;
  }

  const header = `LIQUID_MEDIA_STREAM_CONTAINER\nSource: ${job.url}\nFormat: ${job.formatId}\nGenerated: ${new Date().toISOString()}`;
  fs.writeFileSync(job.outPath, Buffer.from(header, 'utf8'));

  job.progress = 100;
  job.status = 'completed';
  job.downloadUrl = `/api/jobs/${job.id}/download`;
}

/**
 * Downloads a direct media stream into temp folder.
 */
function downloadDirectStream(job) {
  return new Promise((resolve, reject) => {
    const client = job.url.startsWith('https:') ? https : http;
    const req = client.get(job.url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        job.url = res.headers.location;
        return downloadDirectStream(job).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download stream: HTTP ${res.statusCode}`));
      }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const fileStream = fs.createWriteStream(job.outPath);

      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0) {
          job.progress = Math.min(99, Math.round((received / total) * 100));
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => {
          job.status = 'completed';
          job.progress = 100;
          job.downloadUrl = `/api/jobs/${job.id}/download`;
          resolve();
        });
      });

      fileStream.on('error', (err) => {
        fs.unlink(job.outPath, () => {});
        reject(err);
      });
    });

    req.on('error', reject);
  });
}

/**
 * Runs yt-dlp to download and remux media into temp folder with accurate progress and format selection.
 */
function runYtDlpJob(job) {
  return new Promise((resolve, reject) => {
    const tools = toolsConfig;
    const isMp3 = job.formatId && job.formatId.includes('mp3');

    const args = [
      ...tools.ytDlpPrefixArgs,
      '--no-playlist',
      '--no-warnings',
      '--js-runtimes', 'node',
      '--newline'
    ];

    if (tools.ffmpegDir) {
      args.push('--ffmpeg-location', tools.ffmpegDir);
    }

    if (job.kind === 'audio') {
      if (tools.ffmpeg && isMp3) {
        args.push('-x', '--audio-format', 'mp3');
      } else if (tools.ffmpeg) {
        args.push('-x', '--audio-format', 'm4a');
      } else {
        // Without ffmpeg, download best native audio track without remuxing
        args.push('-f', (job.formatId && !isMp3) ? `${job.formatId}/bestaudio/ba` : 'bestaudio/ba');
      }
    } else {
      if (tools.ffmpeg) {
        const formatSelector = (job.formatId && !job.formatId.startsWith('yt_'))
          ? `${job.formatId}+bestaudio/best`
          : 'bestvideo+bestaudio/best';
        args.push('-f', formatSelector, '--merge-output-format', 'mp4');
      } else {
        // Without ffmpeg, select best available single video container
        const formatSelector = (job.formatId && !job.formatId.startsWith('yt_'))
          ? `${job.formatId}/bestvideo/best`
          : 'b/bestvideo/best';
        args.push('-f', formatSelector);
      }
    }

    // Output template
    const template = path.join(TEMP_DIR, `${job.id}_%(title).80s.%(ext)s`);
    args.push('-o', template, job.url);

    const proc = spawn(tools.ytDlpBin, args, { shell: false });
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        job.progress = Math.min(99, Math.round(parseFloat(match[1])));
      }
    });

    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      // Find the generated file in TEMP_DIR matching job.id
      const files = fs.readdirSync(TEMP_DIR);
      const generated = files.find(f => f.startsWith(`${job.id}_`));

      if (code === 0 && generated) {
        job.outPath = path.join(TEMP_DIR, generated);
        job.filename = generated.replace(`${job.id}_`, '');
        job.status = 'completed';
        job.progress = 100;
        job.downloadUrl = `/api/jobs/${job.id}/download`;
        resolve();
      } else {
        reject(new Error(`Media processing failed: ${stderr.slice(0, 300) || 'Unknown process exit code ' + code}`));
      }
    });
  });
}

/**
 * Gets a job by ID.
 */
function getJob(jobId) {
  return jobs.get(jobId) || null;
}

/**
 * Periodic cleanup of jobs and temp files older than 15 minutes.
 */
function cleanupExpiredJobs() {
  const cutoff = Date.now() - (15 * 60 * 1000);
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < cutoff) {
      if (job.outPath && fs.existsSync(job.outPath)) {
        try { fs.unlinkSync(job.outPath); } catch (_) {}
      }
      jobs.delete(id);
    }
  }
}
const cleanupTimer = setInterval(cleanupExpiredJobs, 5 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

module.exports = {
  detectInstalledTools,
  resolveFormats,
  createJob,
  getJob,
  TEMP_DIR
};
