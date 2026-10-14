/**
 * Formats Route Handler - POST /api/formats
 */

const { resolveFormats } = require('../services/mediaProcessor');
const validators = require('../../js/validators');

async function handleFormats(req, res, parsedBody) {
  if (!parsedBody || !parsedBody.url) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Missing media URL in request payload' }));
    return;
  }

  const { url } = parsedBody;

  if (!validators.isValidUrl(url)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Invalid URL provided' }));
    return;
  }

  try {
    const data = await resolveFormats(url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      videoFormats: data.videoFormats || [],
      audioFormats: data.audioFormats || [],
      metadata: data.metadata || {}
    }));
  } catch (err) {
    res.writeHead(422, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: err.message || 'Failed to resolve formats for source'
    }));
  }
}

module.exports = { handleFormats };
