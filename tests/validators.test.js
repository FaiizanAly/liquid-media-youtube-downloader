/**
 * Test Suite: Validators
 */

const assert = require('assert');
const validators = require('../js/validators');

console.log('--- Testing Validators ---');

// 1. isValidUrl
assert.strictEqual(validators.isValidUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
assert.strictEqual(validators.isValidUrl('http://127.0.0.1:48123/api/health'), true);
assert.strictEqual(validators.isValidUrl('javascript:alert(1)'), false);
assert.strictEqual(validators.isValidUrl('file:///etc/passwd'), false);
assert.strictEqual(validators.isValidUrl('not_a_url'), false);
assert.strictEqual(validators.isValidUrl(''), false);
console.log('✓ isValidUrl passed');

// 2. isYouTubeUrl
assert.strictEqual(validators.isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
assert.strictEqual(validators.isYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), true);
assert.strictEqual(validators.isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'), true);
assert.strictEqual(validators.isYouTubeUrl('https://vimeo.com/123456'), false);
assert.strictEqual(validators.isYouTubeUrl('https://google.com'), false);
console.log('✓ isYouTubeUrl passed');

// 3. extractYouTubeVideoId
assert.strictEqual(validators.extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.strictEqual(validators.extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s&ab_channel=Artist'), 'dQw4w9WgXcQ');
assert.strictEqual(validators.extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.strictEqual(validators.extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.strictEqual(validators.extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.strictEqual(validators.extractYouTubeVideoId('https://www.youtube.com/watch?v=invalid_short_id'), null);
assert.strictEqual(validators.extractYouTubeVideoId('https://example.com/video'), null);
console.log('✓ extractYouTubeVideoId passed');

// 4. isDirectMediaUrl
assert.strictEqual(validators.isDirectMediaUrl('https://example.com/media/sample.mp4'), true);
assert.strictEqual(validators.isDirectMediaUrl('https://example.com/audio/track.mp3'), true);
assert.strictEqual(validators.isDirectMediaUrl('https://example.com/stream.webm'), true);
assert.strictEqual(validators.isDirectMediaUrl('https://example.com/page.html'), false);
console.log('✓ isDirectMediaUrl passed');

// 5. sanitizeFilename
const clean1 = validators.sanitizeFilename('Dangerous / : * ? " < > | Name', 'mp4');
assert.strictEqual(clean1.includes('/'), false);
assert.strictEqual(clean1.includes(':'), false);
assert.strictEqual(clean1.includes('<'), false);
assert.strictEqual(clean1.endsWith('.mp4'), true);

const clean2 = validators.sanitizeFilename('../../../etc/passwd', 'mp4');
assert.strictEqual(clean2.includes('..'), false);
assert.strictEqual(clean2.endsWith('.mp4'), true);

const clean3 = validators.sanitizeFilename('A'.repeat(150), 'mp3');
assert.strictEqual(clean3.endsWith('.mp3'), true);
assert.ok(clean3.length <= 110);
console.log('✓ sanitizeFilename passed');

// 6. isAllowedOrigin
assert.strictEqual(validators.isAllowedOrigin('chrome-extension://abcdefghijklmnop/popup.html'), true);
assert.strictEqual(validators.isAllowedOrigin('http://127.0.0.1:48123'), true);
assert.strictEqual(validators.isAllowedOrigin('http://localhost:3000'), true);
assert.strictEqual(validators.isAllowedOrigin('null'), true);
assert.strictEqual(validators.isAllowedOrigin('https://malicious-site.com'), false);
console.log('✓ isAllowedOrigin passed');

console.log('All Validator tests passed successfully!\n');
