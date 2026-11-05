// QR codes for 扫码登录 (0.9.28): a login link the user's own music backend gives is drawn here, to be scanned with a
// phone (or saved to the gallery and scanned from there). Written from the QR Code standard (ISO/IEC 18004): byte mode
// (UTF-8), error correction level M, versions 1-40, the mask with the lowest penalty. No DOM here: qrMatrix gives the
// modules, qrSvg draws them as one path.

const ECC_M_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const ECC_M_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const FORMAT_M = 0; // the two bits of level M in the format information

/** How many modules of a version carry data (all but the function patterns). */
function rawModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}
const dataCodewords = ver => Math.floor(rawModules(ver) / 8) - ECC_M_PER_BLOCK[ver] * ECC_M_BLOCKS[ver];

/** Where the alignment patterns' centres are on each axis. */
function alignmentPositions(ver) {
  if (ver === 1) return [];
  const count = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

// ---------- Reed-Solomon over GF(256), x^8 + x^4 + x^3 + x^2 + 1 ----------
function gfMultiply(x, y) {
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
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}
function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
  }
  return result;
}

/** The data codewords with their error correction, interleaved block by block as the standard lays them out. */
function withErrorCorrection(data, ver) {
  const blocks = ECC_M_BLOCKS[ver], eccLen = ECC_M_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
  const shortBlocks = blocks - raw % blocks, shortLen = Math.floor(raw / blocks);
  const divisor = rsDivisor(eccLen), parts = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const take = shortLen - eccLen + (i < shortBlocks ? 0 : 1), dat = data.slice(k, k + take);
    k += take;
    const ecc = rsRemainder(dat, divisor);
    if (i < shortBlocks) dat.push(0); // a placeholder, left out below
    parts.push([...dat, ...ecc]);
  }
  const out = [];
  for (let i = 0; i < parts[0].length; i++) parts.forEach((block, j) => { if (i !== shortLen - eccLen || j >= shortBlocks) out.push(block[i]); });
  return out;
}

/** The text as data codewords for a version: byte mode, its length, the bytes, the terminator and the padding. */
function encodeBytes(bytes, ver) {
  const bits = [], put = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(ver) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
  return out;
}

/** Of the 8 masks, whether the module at (x, y) is flipped. */
const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  x => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => x * y % 2 + x * y % 3 === 0,
  (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
];

function blankMatrix(ver) {
  const size = ver * 4 + 17, dark = [], fixed = [];
  for (let y = 0; y < size; y++) { dark.push(new Array(size).fill(false)); fixed.push(new Array(size).fill(false)); }
  const set = (x, y, on) => { dark[y][x] = on; fixed[y][x] = true; };
  // timing patterns
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // finder patterns with their separators
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  // alignment patterns (not over the finders)
  const at = alignmentPositions(ver), n = at.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(at[i] + dx, at[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // the format areas are reserved now and written with the mask; the version areas are written once
  drawFormat(dark, fixed, 0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const on = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3);
      set(a, b, on); set(b, a, on);
    }
  }
  return {size, dark, fixed};
}

function drawFormat(dark, fixed, mask) {
  const size = dark.length, data = (FORMAT_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412, bit = i => ((bits >>> i) & 1) !== 0;
  const set = (x, y, on) => { dark[y][x] = on; fixed[y][x] = true; };
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // the dark module
}

/** The codewords into the free modules, two columns at a time in a zigzag from the bottom right. */
function placeCodewords(dark, fixed, codewords) {
  const size = dark.length;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fixed[y][x] && i < codewords.length * 8) {
          dark[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

function applyMask(dark, fixed, mask) {
  const size = dark.length, flip = MASKS[mask];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && flip(x, y)) dark[y][x] = !dark[y][x];
}

/** The standard's penalty for a masked symbol (lower reads better). */
function penalty(dark) {
  const size = dark.length;
  let score = 0;
  // Finder-like runs (dark:light:dark:light:dark as 1:1:3:1:1 of any width, with light 4 wide on a side) are counted
  // from the run lengths, the light border around the symbol counting as light (as the standard's N3 means).
  const finders = history => {
    const n = history[1], core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
    return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
  };
  const line = cells => {
    let total = 0, color = false, run = 0;
    const history = [0, 0, 0, 0, 0, 0, 0], add = length => { if (history[0] === 0) length += size; history.pop(); history.unshift(length); };
    for (const cell of cells) {
      if (cell === color) {
        run++;
        if (run === 5) total += 3; else if (run > 5) total++;
      } else {
        add(run);
        if (!color) total += finders(history) * 40;
        color = cell; run = 1;
      }
    }
    if (color) { add(run); run = 0; }
    add(run + size);
    return total + finders(history) * 40;
  };
  for (let y = 0; y < size; y++) score += line(dark[y]);
  for (let x = 0; x < size; x++) score += line(dark.map(row => row[x]));
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = dark[y][x];
    if (c === dark[y][x + 1] && c === dark[y + 1][x] && c === dark[y + 1][x + 1]) score += 3;
  }
  const darkCount = dark.reduce((n, row) => n + row.filter(Boolean).length, 0), total = size * size;
  score += Math.max(0, Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/**
 * The QR code of a text: {size, dark: rows of booleans (true is a dark module), version, mask}. The smallest version
 * that holds it at level M; too long a text (over 2331 bytes) throws.
 */
export function qrMatrix(text, {mask: wanted = -1} = {}) {
  const bytes = [...new TextEncoder().encode(String(text ?? ''))];
  let ver = 1;
  while (ver <= 40 && 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver) * 8) ver++;
  if (ver > 40) throw Error('这段文字太长，画不成二维码');
  const codewords = withErrorCorrection(encodeBytes(bytes, ver), ver);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    if (wanted >= 0 && mask !== wanted) continue;
    const {size, dark, fixed} = blankMatrix(ver);
    placeCodewords(dark, fixed, codewords);
    applyMask(dark, fixed, mask);
    drawFormat(dark, fixed, mask);
    const score = penalty(dark);
    if (!best || score < best.score) best = {size, dark, version: ver, mask, score};
  }
  const {score, ...out} = best;
  return out;
}

/** The QR code as SVG: a quiet zone of 4 modules, dark modules as one path (crisp at any size). */
export function qrSvg(text, {label = '二维码'} = {}) {
  const {size, dark} = qrMatrix(text), full = size + 8;
  let path = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (dark[y][x]) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  const safe = String(label).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges" role="img" aria-label="${safe}"><rect width="${full}" height="${full}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
