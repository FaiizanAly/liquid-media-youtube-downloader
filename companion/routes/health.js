/**
 * Health Route Handler - GET /api/health
 */

const { detectInstalledTools } = require('../services/mediaProcessor');

async function handleHealth(req, res) {
  const tools = await detectInstalledTools();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    service: 'Liquid Media Companion',
    version: '1.0.0',
    ffmpegAvailable: tools.ffmpeg,
    ytdlpAvailable: tools.ytdlp,
    tools: {
      ffmpeg: tools.ffmpeg,
      ytdlp: tools.ytdlp
    },
    timestamp: Date.now()
  }));
}

module.exports = { handleHealth };
