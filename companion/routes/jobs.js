/**
 * Jobs Route Handler - /api/jobs
 * Handles job creation, status polling, and secure file streaming.
 */

const fs = require('fs');
const path = require('path');
const { createJob, getJob, TEMP_DIR } = require('../services/mediaProcessor');
const validators = require('../../js/validators');

const HEX_ID_REGEX = /^[a-fA-F0-9]{32}$/;

/**
 * Handles POST /api/jobs
 */
async function handleCreateJob(req, res, parsedBody) {
  if (!parsedBody || !parsedBody.url) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Missing media URL in request payload' }));
    return;
  }

  const { url, formatId, kind, title } = parsedBody;

  if (!validators.isValidUrl(url)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Invalid URL provided' }));
    return;
  }

  try {
    const job = await createJob({ url, formatId, kind, title });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      jobId: job.id,
      status: job.status
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
}

/**
 * Handles GET /api/jobs/:id
 */
function handleGetJobStatus(req, res, jobId) {
  if (!jobId || !HEX_ID_REGEX.test(jobId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', error: 'Invalid Job ID format' }));
    return;
  }

  const job = getJob(jobId);
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'not_found', error: 'Job not found or expired' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    downloadUrl: job.downloadUrl,
    error: job.error
  }));
}

/**
 * Handles GET /api/jobs/:id/download
 */
function handleDownloadJobFile(req, res, jobId) {
  if (!jobId || !HEX_ID_REGEX.test(jobId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid Job ID' }));
    return;
  }

  const job = getJob(jobId);
  if (!job || job.status !== 'completed' || !job.outPath) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not available or job not completed' }));
    return;
  }

  // Security: prevent path traversal outside temp directory
  const resolvedPath = path.resolve(job.outPath);
  if (!resolvedPath.startsWith(path.resolve(TEMP_DIR))) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Access denied: path traversal attempt blocked' }));
    return;
  }

  if (!fs.existsSync(resolvedPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Generated file expired or missing on disk' }));
    return;
  }

  const stat = fs.statSync(resolvedPath);
  const ext = path.extname(job.filename).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.mp4') contentType = 'video/mp4';
  else if (ext === '.m4a') contentType = 'audio/mp4';
  else if (ext === '.mp3') contentType = 'audio/mpeg';
  else if (ext === '.webm') contentType = 'video/webm';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(job.filename)}"`,
    'Cache-Control': 'no-store'
  });

  const readStream = fs.createReadStream(resolvedPath);
  readStream.pipe(res);
}

module.exports = {
  handleCreateJob,
  handleGetJobStatus,
  handleDownloadJobFile
};
