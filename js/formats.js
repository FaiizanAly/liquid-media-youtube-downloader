/**
 * Liquid Media - Format Normalization & Sorting Utilities
 * Works across Browser (MV3) and Node.js environments.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.LiquidFormats = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Standard Format Object Schema:
   * {
   *   id: string,                   // Unique stable format identifier
   *   kind: 'video' | 'audio',      // Media kind
   *   label: string,                // Display label (e.g., '1080p60', '320 kbps')
   *   resolution: number | null,    // Height in pixels (e.g., 1080) for video
   *   bitrateKbps: number | null,   // Bitrate in kbps (e.g., 320)
   *   container: string,            // 'mp4', 'webm', 'm4a', 'mp3', etc.
   *   videoCodec: string | null,    // 'h264', 'vp9', 'av1', etc.
   *   audioCodec: string | null,    // 'aac', 'opus', 'mp3', etc.
   *   fps: number | null,           // 60, 30, etc.
   *   estimatedBytes: number | null,// Size in bytes if known
   *   estimatedSize: string | null, // Formatted size string (e.g., '85.4 MB')
   *   downloadCapability: 'direct' | 'companion_merge' | 'companion_convert',
   *   source: 'youtube' | 'direct_html5' | 'companion',
   *   downloadUrl: string | null,   // Direct URL if capability is 'direct'
   *   requiresCompanion: boolean    // true if companion service is required
   * }
   */

  /**
   * Formats byte count to human readable string (e.g. '12.4 MB').
   * @param {number|null|undefined} bytes
   * @returns {string|null}
   */
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || isNaN(bytes) || bytes <= 0) {
      return null;
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(size < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
  }

  /**
   * Normalizes a raw format object into the standard Liquid Media format schema.
   * @param {Object} raw
   * @returns {Object}
   */
  function normalizeFormat(raw) {
    const isVideo = raw.kind === 'video' || (raw.resolution && raw.resolution > 0) || (raw.height && raw.height > 0);
    const height = raw.resolution || raw.height || null;
    const bitrate = raw.bitrateKbps || raw.bitrate || null;
    const container = (raw.container || raw.ext || (isVideo ? 'mp4' : 'm4a')).toLowerCase();

    let label = raw.label;
    if (!label) {
      if (isVideo && height) {
        label = `${height}p${raw.fps && raw.fps > 30 ? raw.fps : ''}`;
      } else if (!isVideo && bitrate) {
        label = `${bitrate} kbps`;
      } else {
        label = container.toUpperCase();
      }
    }

    const estimatedBytes = raw.estimatedBytes || raw.filesize || raw.filesize_approx || null;
    const estimatedSize = raw.estimatedSize || formatBytes(estimatedBytes);

    const capability = raw.downloadCapability ||
      (raw.requiresCompanion || raw.hasSeparateStreams ? 'companion_merge' : 'direct');

    return {
      id: String(raw.id || `${raw.kind || (isVideo ? 'vid' : 'aud')}_${height || bitrate || 'def'}_${container}`),
      kind: isVideo ? 'video' : 'audio',
      label,
      resolution: height ? Number(height) : null,
      bitrateKbps: bitrate ? Number(bitrate) : null,
      container,
      videoCodec: raw.videoCodec || raw.vcodec || (isVideo ? 'h264' : null),
      audioCodec: raw.audioCodec || raw.acodec || (!isVideo ? 'aac' : null),
      fps: raw.fps ? Number(raw.fps) : null,
      estimatedBytes,
      estimatedSize,
      downloadCapability: capability,
      source: raw.source || 'direct_html5',
      downloadUrl: raw.downloadUrl || raw.url || null,
      requiresCompanion: capability !== 'direct'
    };
  }

  /**
   * Creates a normalized format for a direct HTML5 video or audio element.
   * @param {string} mediaUrl
   * @param {string} [typeHint]
   * @param {number} [fileSizeBytes]
   * @returns {Object}
   */
  function createDirectMediaFormat(mediaUrl, typeHint = 'video', fileSizeBytes = null) {
    const urlObj = new URL(mediaUrl);
    const pathname = urlObj.pathname.toLowerCase();

    let ext = 'mp4';
    if (pathname.endsWith('.webm')) ext = 'webm';
    else if (pathname.endsWith('.m4a')) ext = 'm4a';
    else if (pathname.endsWith('.mp3')) ext = 'mp3';
    else if (pathname.endsWith('.ogg')) ext = 'ogg';
    else if (pathname.endsWith('.wav')) ext = 'wav';
    else if (pathname.endsWith('.flac')) ext = 'flac';

    const isAudio = ['m4a', 'mp3', 'ogg', 'wav', 'flac'].includes(ext) || typeHint === 'audio';

    return normalizeFormat({
      id: `direct_${Date.now()}_${ext}`,
      kind: isAudio ? 'audio' : 'video',
      label: isAudio ? `${ext.toUpperCase()} Source` : `Direct ${ext.toUpperCase()}`,
      container: ext,
      videoCodec: isAudio ? null : (ext === 'webm' ? 'vp9' : 'h264'),
      audioCodec: isAudio ? (ext === 'mp3' ? 'mp3' : 'aac') : 'aac',
      estimatedBytes: fileSizeBytes,
      downloadCapability: 'direct',
      source: 'direct_html5',
      downloadUrl: mediaUrl,
      requiresCompanion: false
    });
  }

  /**
   * Sorts video formats in descending resolution, then fps, then preferred container (MP4 first).
   * @param {Array<Object>} formats
   * @returns {Array<Object>}
   */
  function sortVideoFormats(formats) {
    if (!Array.isArray(formats)) return [];
    return [...formats].sort((a, b) => {
      const resA = a.resolution || 0;
      const resB = b.resolution || 0;
      if (resB !== resA) return resB - resA;

      const fpsA = a.fps || 30;
      const fpsB = b.fps || 30;
      if (fpsB !== fpsA) return fpsB - fpsA;

      // Prefer MP4 over WebM for broader native device playback compatibility
      if (a.container === 'mp4' && b.container !== 'mp4') return -1;
      if (b.container === 'mp4' && a.container !== 'mp4') return 1;

      return 0;
    });
  }

  /**
   * Sorts audio formats in descending bitrate, with AAC/MP3 preferred.
   * @param {Array<Object>} formats
   * @returns {Array<Object>}
   */
  function sortAudioFormats(formats) {
    if (!Array.isArray(formats)) return [];
    return [...formats].sort((a, b) => {
      const brA = a.bitrateKbps || 0;
      const brB = b.bitrateKbps || 0;
      if (brB !== brA) return brB - brA;

      // Prefer M4A/MP3 over raw OPUS/WebM for audio player compatibility
      const prefA = ['mp3', 'm4a'].includes(a.container) ? 1 : 0;
      const prefB = ['mp3', 'm4a'].includes(b.container) ? 1 : 0;
      return prefB - prefA;
    });
  }

  return {
    formatBytes,
    normalizeFormat,
    createDirectMediaFormat,
    sortVideoFormats,
    sortAudioFormats
  };
});
