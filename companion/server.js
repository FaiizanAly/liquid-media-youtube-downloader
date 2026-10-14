/**
 * Liquid Media Companion - Standalone Local Node.js Service
 * Binds strictly to 127.0.0.1, enforces strict origin and input validation.
 */

const http = require('http');
const path = require('path');
const validators = require('../js/validators');
const { handleHealth } = require('./routes/health');
const { handleFormats } = require('./routes/formats');
const { handleCreateJob, handleGetJobStatus, handleDownloadJobFile } = require('./routes/jobs');

const PORT = parseInt(process.env.PORT || '48123', 10);
const HOST = '127.0.0.1'; // Never 0.0.0.0
const MAX_BODY_BYTES = 64 * 1024; // 64 KB payload limit

/**
 * Sets security headers on all responses.
 */
function setSecurityHeaders(res, origin) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'");

  if (origin && validators.isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

/**
 * Buffers and parses JSON body safely.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        tooLarge = true;
        req.resume();
        reject(new Error('Payload Too Large'));
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (tooLarge) return;
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });

    req.on('error', (err) => {
      if (!tooLarge) reject(err);
    });
  });
}

/**
 * Main HTTP Request Handler
 */
async function requestHandler(req, res) {
  const origin = req.headers.origin || null;

  // Validate request origin to protect against malicious web scripts
  if (origin && !validators.isAllowedOrigin(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return;
  }

  setSecurityHeaders(res, origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = parsedUrl.pathname;

  try {
    // GET /api/health
    if (req.method === 'GET' && pathname === '/api/health') {
      await handleHealth(req, res);
      return;
    }

    // POST /api/formats
    if (req.method === 'POST' && pathname === '/api/formats') {
      const body = await readJsonBody(req);
      await handleFormats(req, res, body);
      return;
    }

    // POST /api/jobs
    if (req.method === 'POST' && pathname === '/api/jobs') {
      const body = await readJsonBody(req);
      await handleCreateJob(req, res, body);
      return;
    }

    // Match /api/jobs/:id/download
    const downloadMatch = pathname.match(/^\/api\/jobs\/([a-fA-F0-9]{32})\/download$/);
    if (req.method === 'GET' && downloadMatch) {
      handleDownloadJobFile(req, res, downloadMatch[1]);
      return;
    }

    // Match /api/jobs/:id
    const jobMatch = pathname.match(/^\/api\/jobs\/([a-fA-F0-9]{32})$/);
    if (req.method === 'GET' && jobMatch) {
      handleGetJobStatus(req, res, jobMatch[1]);
      return;
    }

    // 404 Fallback
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  } catch (err) {
    const statusCode = err.message === 'Payload Too Large' ? 413 : 400;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
}

const server = http.createServer(requestHandler);

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[Liquid Media Companion] Service running on http://${HOST}:${PORT}`);
  });
}

module.exports = { server, requestHandler };
