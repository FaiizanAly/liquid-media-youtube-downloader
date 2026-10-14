/**
 * Integration Test Suite: Companion Server Endpoints & Security
 */

const assert = require('assert');
const http = require('http');
const { server } = require('../companion/server');

const TEST_PORT = 49123;
const TEST_HOST = '127.0.0.1';
const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Testing Companion Server ---');

  await new Promise((resolve) => server.listen(TEST_PORT, TEST_HOST, resolve));
  console.log(`✓ Test Companion server bound to ${BASE_URL}`);

  try {
    // 1. GET /api/health
    const healthRes = await httpRequest({
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: '/api/health',
      method: 'GET'
    });
    assert.strictEqual(healthRes.statusCode, 200);
    assert.strictEqual(healthRes.json.status, 'ok');
    assert.strictEqual(healthRes.json.version, '1.0.0');
    console.log('✓ GET /api/health returned 200 OK');

    // 2. POST /api/formats (Valid YouTube URL)
    const formatsRes = await httpRequest({
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: '/api/formats',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

    assert.strictEqual(formatsRes.statusCode, 200);
    assert.strictEqual(formatsRes.json.success, true);
    assert.ok(Array.isArray(formatsRes.json.videoFormats));
    assert.ok(Array.isArray(formatsRes.json.audioFormats));
    assert.ok(formatsRes.json.videoFormats.length > 0);
    console.log(`✓ POST /api/formats returned ${formatsRes.json.videoFormats.length} video formats and ${formatsRes.json.audioFormats.length} audio formats`);

    // 3. POST /api/formats (Invalid URL)
    const invalidFormatsRes = await httpRequest({
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: '/api/formats',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { url: 'javascript:alert(1)' });
    assert.strictEqual(invalidFormatsRes.statusCode, 400);
    console.log('✓ POST /api/formats rejected invalid URL with 400 Bad Request');

    // 4. POST /api/jobs (Job creation)
    const createJobRes = await httpRequest({
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: '/api/jobs',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      formatId: '249',
      kind: 'audio',
      title: 'Me at the zoo'
    });
    assert.strictEqual(createJobRes.statusCode, 201);
    assert.strictEqual(createJobRes.json.success, true);
    assert.ok(createJobRes.json.jobId);
    assert.strictEqual(createJobRes.json.jobId.length, 32);
    const jobId = createJobRes.json.jobId;
    console.log(`✓ POST /api/jobs created job ID: ${jobId}`);

    // Poll until completed
    let jobStatusRes = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(r => setTimeout(r, 600));
      jobStatusRes = await httpRequest({
        hostname: TEST_HOST,
        port: TEST_PORT,
        path: `/api/jobs/${jobId}`,
        method: 'GET'
      });
      if (jobStatusRes.json && (jobStatusRes.json.status === 'completed' || jobStatusRes.json.status === 'failed')) {
        break;
      }
    }

    assert.strictEqual(jobStatusRes.statusCode, 200);
    assert.strictEqual(jobStatusRes.json.jobId, jobId);
    assert.strictEqual(jobStatusRes.json.status, 'completed');
    assert.strictEqual(jobStatusRes.json.progress, 100);
    assert.ok(jobStatusRes.json.downloadUrl);
    console.log('✓ GET /api/jobs/:id returned completed status');

    // 6. GET /api/jobs/:id/download (File download stream)
    const downloadRes = await httpRequest({
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: `/api/jobs/${jobId}/download`,
      method: 'GET'
    });
    assert.strictEqual(downloadRes.statusCode, 200);
    assert.ok(decodeURIComponent(downloadRes.headers['content-disposition']).includes('Me at the zoo'));
    console.log('✓ GET /api/jobs/:id/download streamed generated media container');

    // 7. Security: Origin check
    const foreignOriginRes = await httpRequest({
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: '/api/health',
      method: 'GET',
      headers: { 'Origin': 'https://malicious-site.com' }
    });
    assert.strictEqual(foreignOriginRes.statusCode, 403);
    console.log('✓ Companion blocked unauthorized origin with 403 Forbidden');

    // 8. Security: Path Traversal
    const pathTraversalRes = await httpRequest({
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: '/api/jobs/../../etc/passwd/download',
      method: 'GET'
    });
    assert.strictEqual(pathTraversalRes.statusCode, 404);
    console.log('✓ Path traversal attempt blocked');

    // 9. Security: Payload Limit
    const largePayload = JSON.stringify({ data: 'X'.repeat(70000) });
    const payloadLimitRes = await httpRequest({
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: '/api/formats',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, largePayload);
    assert.strictEqual(payloadLimitRes.statusCode, 413);
    console.log('✓ Oversized payload rejected with 413 Payload Too Large');

    console.log('All Companion tests passed successfully!\n');
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Companion tests failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
