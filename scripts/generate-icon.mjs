#!/usr/bin/env node
/**
 * Writes build/icon.png, the 1024x1024 placeholder app icon: a dark rounded
 * square with a blue "BC" monogram. Shapes are drawn with signed distance
 * functions and encoded with node:zlib, so no image library or download is
 * needed. electron-builder derives the .icns and .ico files from this PNG.
 *
 *   node scripts/generate-icon.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 1024;
const BACKGROUND = [0x08, 0x09, 0x0a];
const MONOGRAM = [0x31, 0x76, 0xd2];
// macOS icon grid: an 824 px tile centred on the 1024 px canvas.
const TILE = { center: 512, half: 412, radius: 185 };
const HALF_STROKE = 28; // letters use a 56 px stroke

/** Straight strokes as [x1, y1, x2, y2]. */
const SEGMENTS = [
  [254, 362, 254, 662], // B stem
  [254, 362, 324, 362], // B top
  [254, 504, 334, 504], // B middle
  [254, 662, 334, 662], // B bottom
];
/** Curved strokes: centre, radius and covered angle range in degrees (y axis points down). */
const ARCS = [
  { cx: 324, cy: 433, r: 71, from: -90, to: 90 }, // B upper bowl
  { cx: 334, cy: 583, r: 79, from: -90, to: 90 }, // B lower bowl
  { cx: 655, cy: 512, r: 150, from: 40, to: 320 }, // C, open to the right
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function segmentDistance(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = clamp01(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function arcDistance(px, py, { cx, cy, r, from, to }) {
  let angle = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
  while (angle < from) angle += 360;
  while (angle >= from + 360) angle -= 360;
  if (angle <= to) return Math.abs(Math.hypot(px - cx, py - cy) - r);
  const end = (degrees) => [cx + r * Math.cos((degrees * Math.PI) / 180), cy + r * Math.sin((degrees * Math.PI) / 180)];
  const [ax, ay] = end(from);
  const [bx, by] = end(to);
  return Math.min(Math.hypot(px - ax, py - ay), Math.hypot(px - bx, py - by));
}

function tileDistance(px, py) {
  const inner = TILE.half - TILE.radius;
  const qx = Math.abs(px - TILE.center) - inner;
  const qy = Math.abs(py - TILE.center) - inner;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - TILE.radius;
}

const stride = SIZE * 4 + 1;
const raw = Buffer.alloc(stride * SIZE); // RGBA rows, each prefixed with PNG filter type 0
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const px = x + 0.5;
    const py = y + 0.5;
    const tile = clamp01(0.5 - tileDistance(px, py));
    if (tile === 0) continue; // transparent outside the tile
    let distance = Infinity;
    if (px > 200 && px < 840 && py > 300 && py < 730) {
      for (const segment of SEGMENTS) distance = Math.min(distance, segmentDistance(px, py, segment));
      for (const arc of ARCS) distance = Math.min(distance, arcDistance(px, py, arc));
    }
    const ink = clamp01(HALF_STROKE + 0.5 - distance);
    const offset = y * stride + 1 + x * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      raw[offset + channel] = Math.round(BACKGROUND[channel] + (MONOGRAM[channel] - BACKGROUND[channel]) * ink);
    }
    raw[offset + 3] = Math.round(tile * 255);
  }
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // colour type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
const outFile = path.join(root, "build", "icon.png");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, png);
console.log(`wrote ${path.relative(root, outFile)} (${SIZE}x${SIZE}, ${png.length} bytes)`);
