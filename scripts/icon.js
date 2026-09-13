const fs = require("fs"),
  zlib = require("zlib"),
  path = require("path");
function crc(b) {
  let c = 0xffffffff;
  for (const n of b) {
    c ^= n;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    len = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, sum]);
}
const n = 256,
  raw = Buffer.alloc((n * 4 + 1) * n);
function rounded(x, y, l, t, s, r) {
  const dx = Math.max(l + r - x, 0, x - (l + s - r)),
    dy = Math.max(t + r - y, 0, y - (t + s - r));
  return (
    x >= l && x < l + s && y >= t && y < t + s && dx * dx + dy * dy <= r * r
  );
}
for (let y = 0; y < n; y++)
  for (let x = 0; x < n; x++) {
    let color = rounded(x, y, 0, 0, 256, 54) ? [27, 31, 45, 255] : [0, 0, 0, 0];
    for (const [l, t, c] of [
      [48, 48, [185, 163, 255, 255]],
      [136, 48, [218, 204, 255, 255]],
      [48, 136, [155, 134, 218, 255]],
      [136, 136, [117, 99, 171, 255]],
    ])
      if (rounded(x, y, l, t, 72, 16)) color = c;
    raw.set(color, y * (n * 4 + 1) + 1 + x * 4);
  }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(n);
ihdr.writeUInt32BE(n, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.mkdirSync(path.join(__dirname, "../assets"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "../assets/icon.png"), png);
const h = Buffer.alloc(22);
h.writeUInt16LE(1, 2);
h.writeUInt16LE(1, 4);
h.writeUInt16LE(1, 10);
h.writeUInt16LE(32, 12);
h.writeUInt32LE(png.length, 14);
h.writeUInt32LE(22, 18);
fs.writeFileSync(
  path.join(__dirname, "../assets/icon.ico"),
  Buffer.concat([h, png]),
);
