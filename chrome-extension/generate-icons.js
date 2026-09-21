const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Function to generate a simple RGBA PNG
function createPng(size, r, g, b, a = 255) {
  const width = size;
  const height = size;

  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // filter type: None

    for (let x = 0; x < width; x++) {
      // Rounded corner box with inner '9' circle
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = width / 2 - 1;

      if (dist <= radius) {
        // Inner highlight
        if (dist > radius - 2) {
          rawData[offset++] = Math.min(255, r + 40);
          rawData[offset++] = Math.min(255, g + 40);
          rawData[offset++] = Math.min(255, b + 40);
          rawData[offset++] = a;
        } else {
          rawData[offset++] = r;
          rawData[offset++] = g;
          rawData[offset++] = b;
          rawData[offset++] = a;
        }
      } else {
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0; // transparent
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = makeChunk("IHDR", ihdrData);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(12 + length);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);

  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  chunk.writeUInt32BE(crc, 8 + length);
  return chunk;
}

// CRC32 implementation
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

const iconsDir = path.join(__dirname, "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Theme color: #3b82f6 (59, 130, 246)
fs.writeFileSync(path.join(iconsDir, "icon16.png"), createPng(16, 59, 130, 246));
fs.writeFileSync(path.join(iconsDir, "icon48.png"), createPng(48, 59, 130, 246));
fs.writeFileSync(path.join(iconsDir, "icon128.png"), createPng(128, 59, 130, 246));

console.log("Extension icons generated successfully.");
