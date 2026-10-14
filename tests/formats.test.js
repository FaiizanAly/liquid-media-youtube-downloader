/**
 * Test Suite: Format Normalization and Sorting
 */

const assert = require('assert');
const formats = require('../js/formats');

console.log('--- Testing Formats ---');

// 1. formatBytes
assert.strictEqual(formats.formatBytes(null), null);
assert.strictEqual(formats.formatBytes(0), null);
assert.strictEqual(formats.formatBytes(1024), '1.0 KB');
assert.strictEqual(formats.formatBytes(1048576), '1.0 MB');
assert.strictEqual(formats.formatBytes(104857600), '100 MB');
console.log('✓ formatBytes passed');

// 2. normalizeFormat
const rawVideo = {
  id: 'raw_1080',
  resolution: 1080,
  container: 'mp4',
  videoCodec: 'h264',
  audioCodec: 'aac',
  fps: 60,
  estimatedBytes: 85000000
};
const normVid = formats.normalizeFormat(rawVideo);
assert.strictEqual(normVid.kind, 'video');
assert.strictEqual(normVid.label, '1080p60');
assert.strictEqual(normVid.container, 'mp4');
assert.strictEqual(normVid.resolution, 1080);
assert.strictEqual(normVid.videoCodec, 'h264');
assert.strictEqual(normVid.fps, 60);
console.log('✓ normalizeFormat passed');

// 3. createDirectMediaFormat
const directFormat = formats.createDirectMediaFormat('https://example.com/videos/stream.mp4');
assert.strictEqual(directFormat.kind, 'video');
assert.strictEqual(directFormat.container, 'mp4');
assert.strictEqual(directFormat.downloadCapability, 'direct');
assert.strictEqual(directFormat.requiresCompanion, false);

const directAudio = formats.createDirectMediaFormat('https://example.com/audio/podcast.mp3');
assert.strictEqual(directAudio.kind, 'audio');
assert.strictEqual(directAudio.container, 'mp3');
assert.strictEqual(directAudio.downloadCapability, 'direct');
console.log('✓ createDirectMediaFormat passed');

// 4. sortVideoFormats
const unsortedVideos = [
  { id: '1', resolution: 720, container: 'mp4' },
  { id: '2', resolution: 1080, container: 'webm' },
  { id: '3', resolution: 1080, container: 'mp4' },
  { id: '4', resolution: 360, container: 'mp4' },
  { id: '5', resolution: 2160, container: 'mp4' }
];
const sortedVideos = formats.sortVideoFormats(unsortedVideos);
assert.strictEqual(sortedVideos[0].resolution, 2160);
assert.strictEqual(sortedVideos[1].resolution, 1080);
assert.strictEqual(sortedVideos[1].container, 'mp4'); // MP4 preferred over WebM for equal res
assert.strictEqual(sortedVideos[2].resolution, 1080);
assert.strictEqual(sortedVideos[3].resolution, 720);
assert.strictEqual(sortedVideos[4].resolution, 360);
console.log('✓ sortVideoFormats passed');

// 5. sortAudioFormats
const unsortedAudio = [
  { id: 'a1', bitrateKbps: 128, container: 'm4a' },
  { id: 'a2', bitrateKbps: 320, container: 'mp3' },
  { id: 'a3', bitrateKbps: 256, container: 'm4a' },
  { id: 'a4', bitrateKbps: 320, container: 'ogg' }
];
const sortedAudio = formats.sortAudioFormats(unsortedAudio);
assert.strictEqual(sortedAudio[0].bitrateKbps, 320);
assert.strictEqual(sortedAudio[0].container, 'mp3'); // MP3 preferred
assert.strictEqual(sortedAudio[1].bitrateKbps, 320);
assert.strictEqual(sortedAudio[2].bitrateKbps, 256);
assert.strictEqual(sortedAudio[3].bitrateKbps, 128);
console.log('✓ sortAudioFormats passed');

console.log('All Format tests passed successfully!\n');
