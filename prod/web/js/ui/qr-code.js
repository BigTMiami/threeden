// @ts-check
/**
 * qr-code.js — a QR code for a link, drawn as an SVG, with no outside code.
 *
 *   qrSvg('https://3den.example/#join-ab12cd34', { size: 240 })  → <svg>
 *   qrMatrix(text) → { size, modules: boolean[][] }  (true = dark)
 *
 * Byte mode, error correction level M (about 15% of the code can be
 * damaged and it still reads), versions 1–10 (up to 213 bytes, plenty for
 * an invite link). The mask with the lowest penalty is chosen, as the
 * standard asks. Written after Project Nayuki's QR code generator (MIT).
 */

const ECC_PER_BLOCK_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;

function rawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (ver) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * BLOCKS_M[ver];

// ─── Reed–Solomon over GF(256) ─────────────────────────────────────────────

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ /** @type {number} */ (result.shift());
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
  }
  return result;
}

// ─── Encoding ──────────────────────────────────────────────────────────────

function encodeData(bytes, ver) {
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4); // byte mode
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacityBits = dataCodewords(ver) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
  for (let pad = 0xec; codewords.length < dataCodewords(ver); pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

function addEccAndInterleave(data, ver) {
  const numBlocks = BLOCKS_M[ver];
  const eccLen = ECC_PER_BLOCK_M[ver];
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - eccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - eccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

function alignmentPositions(ver, size) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function buildMatrix(codewords, ver, mask) {
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { modules[y][x] = dark; fixed[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  const align = alignmentPositions(ver, size);
  align.forEach((ax, i) => align.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  // Format bits (level M = 0b00), both copies, and the dark module.
  const data = (0 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const format = ((data << 10) | rem) ^ 0x5412;
  const bit = (value, i) => ((value >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(format, i));
  set(8, 7, bit(format, 6));
  set(8, 8, bit(format, 7));
  set(7, 8, bit(format, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(format, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(format, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(format, i));
  set(8, size - 8, true);

  if (ver >= 7) {
    let vrem = ver;
    for (let i = 0; i < 12; i++) vrem = (vrem << 1) ^ ((vrem >>> 11) * 0x1f25);
    const vbits = (ver << 12) | vrem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, bit(vbits, i));
      set(b, a, bit(vbits, i));
    }
  }

  // The data, in the zigzag, then the mask.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fixed[y][x] && i < codewords.length * 8) {
          modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
  return modules;
}

/** Rules 1, 2, and 4 of the standard's mask penalty (runs, 2×2 blocks, balance). */
function penalty(modules) {
  const size = modules.length;
  let score = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        const cur = pass ? modules[b][a] : modules[a][b];
        const prev = pass ? modules[b - 1][a] : modules[a][b - 1];
        if (cur === prev) { run++; if (run === 5) score += 3; else if (run > 5) score += 1; } else run = 1;
      }
    }
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
  }
  const dark = modules.flat().filter(Boolean).length;
  score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return score;
}

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  while (ver <= MAX_VERSION && bytes.length + 2 + (ver <= 9 ? 0 : 1) > dataCodewords(ver)) ver++;
  if (ver > MAX_VERSION) throw new Error('Too long for a QR code here');
  const codewords = addEccAndInterleave(encodeData(bytes, ver), ver);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const modules = buildMatrix(codewords, ver, mask);
    const score = penalty(modules);
    if (!best || score < best.score) best = { modules, score };
  }
  return { size: best.modules.length, modules: best.modules, version: ver };
}

/** The code as an SVG element (black on white, a 4-module quiet zone). */
export function qrSvg(text, { size = 240, label = 'QR code' } = {}) {
  const { size: n, modules } = qrMatrix(text);
  const total = n + 8;
  let path = '';
  modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + 4},${y + 4}h1v1h-1z`; }));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(total));
  bg.setAttribute('height', String(total));
  bg.setAttribute('fill', '#fff');
  const ink = document.createElementNS(ns, 'path');
  ink.setAttribute('d', path);
  ink.setAttribute('fill', '#000');
  svg.append(bg, ink);
  return svg;
}
