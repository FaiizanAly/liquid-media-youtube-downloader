/**
 * Pure Node.js PNG Icon Generator
 * Generates valid, crisp RGBA PNG icons without external dependencies.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table for PNG chunk checksums
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);

  return Buffer.concat([lenBuf, combined, crcBuf]);
}

function generatePng(size) {
  // RGBA buffer with filter byte per scanline
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;

  const center = size / 2;
  const radius = size * 0.44;

  for (let y = 0; y < size; y++) {
    rawData[offset++] = 0; // Filter: None

    for (let x = 0; x < size; x++) {
      // Rounded squircle / icon background
      const dx = (x - center) / radius;
      const dy = (y - center) / radius;
      const distSquircle = Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dy), 4);

      if (distSquircle <= 1.0) {
        // macOS Blue Gradient
        const gradientRatio = (x + y) / (size * 2);
        let r = Math.round(10 * (1 - gradientRatio) + 0 * gradientRatio);
        let g = Math.round(132 * (1 - gradientRatio) + 98 * gradientRatio);
        let b = Math.round(255 * (1 - gradientRatio) + 196 * gradientRatio);
        let a = 255;

        // Inner droplet / play symbol highlight in center
        const dropDx = (x - center) / (size * 0.24);
        const dropDy = (y - center) / (size * 0.24);
        const dropDist = Math.sqrt(dropDx * dropDx + dropDy * dropDy);

        if (dropDist < 0.8) {
          // Inner droplet glow
          r = Math.min(255, r + 110);
          g = Math.min(255, g + 80);
          b = Math.min(255, b + 50);
        }

        // Delicate top specular highlight
        if (y < size * 0.25) {
          const highlight = 1 - (y / (size * 0.25));
          r = Math.min(255, r + Math.round(60 * highlight));
          g = Math.min(255, g + Math.round(70 * highlight));
          b = 255;
        }

        rawData[offset++] = r;
        rawData[offset++] = g;
        rawData[offset++] = b;
        rawData[offset++] = a;
      } else if (distSquircle <= 1.15) {
        // Anti-aliased outer edge
        const edgeAlpha = Math.round(255 * (1 - (distSquircle - 1.0) / 0.15));
        rawData[offset++] = 0;
        rawData[offset++] = 113;
        rawData[offset++] = 227;
        rawData[offset++] = Math.max(0, edgeAlpha);
      } else {
        // Fully transparent background
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);   // Bit depth: 8
  ihdrData.writeUInt8(6, 9);   // Color type: RGBA
  ihdrData.writeUInt8(0, 10);  // Compression
  ihdrData.writeUInt8(0, 11);  // Filter
  ihdrData.writeUInt8(0, 12);  // Interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

[16, 48, 128].forEach(size => {
  const pngBuf = generatePng(size);
  const outPath = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`Generated icon: ${outPath} (${size}x${size}, ${pngBuf.length} bytes)`);
});
