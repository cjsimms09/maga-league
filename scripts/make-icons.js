#!/usr/bin/env node
/* Generate the home-screen icons.
 *
 * Why generate rather than commit a binary somebody drew once: the icon is four
 * colours and three shapes, it has to exist at several sizes, and a checked-in
 * PNG nobody can regenerate is the thing that goes stale when the palette
 * changes. This script is ~60 lines of PNG encoder and produces every size from
 * one description.
 *
 * No image library — Node's zlib is all a PNG needs. Run:  node scripts/make-icons.js
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'icons');

// The site's palette, so the icon matches the masthead it sits under.
const NAVY = [11, 31, 58];
const RED = [200, 32, 48];
const WHITE = [245, 245, 250];
const GOLD = [245, 196, 69];

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = buf => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // 8-bit RGB
  // One filter byte (0 = none) per scanline, then the row's pixels.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const c = rgb(x, y, width, height);
      raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* A five-pointed star, as a point-in-polygon test. Drawn rather than typeset so
   the icon needs no font — the one thing a pure-Node PNG cannot do. */
function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The mark: navy field, a gold star, and the flag's stripes across the bottom.
 * `pad` insets everything for the maskable variant, where Android crops to a
 * circle and anything near the edge gets eaten.
 */
function makePixel(size, { pad = 0 } = {}) {
  const s = size;
  const inset = s * pad;
  const field = { x0: inset, y0: inset, x1: s - inset, y1: s - inset };
  const w = field.x1 - field.x0;
  const star = starPoints(field.x0 + w / 2, field.y0 + w * 0.42, w * 0.27, w * 0.115);
  const stripeTop = field.y0 + w * 0.68;
  const stripeH = (field.y1 - stripeTop) / 3;

  return (x, y) => {
    // Full-bleed square. Both platforms apply their own corner mask — rounding
    // it here as well produces a rounded icon inside a rounded icon, and on the
    // maskable variant it would clip the stripes at exactly the wrong angle.
    if (x < field.x0 || x > field.x1 || y < field.y0 || y > field.y1) return NAVY;

    if (y >= stripeTop) {
      const band = Math.floor((y - stripeTop) / stripeH);
      return band === 1 ? WHITE : RED;
    }
    if (inPoly(x, y, star)) return GOLD;
    return NAVY;
  };
}

fs.mkdirSync(OUT, { recursive: true });
const built = [];
for (const size of [180, 192, 512]) {
  const file = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(file, png(size, size, makePixel(size)));
  built.push(`icon-${size}.png`);
}
// Maskable: Android crops to whatever shape the launcher uses, so the mark has
// to survive a circle. 12% of padding on every side is the safe-zone rule.
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'),
  png(512, 512, makePixel(512, { pad: 0.12 })));
built.push('icon-maskable-512.png');

console.log('wrote', built.join(', '), 'to public/icons/');
