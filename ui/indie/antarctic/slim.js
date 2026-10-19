// 南极结界 · 人物（修长版）: the slimmer body the user asked for after a Stardew mod they like — 16×30, a small face with
// eyes of a few pixels (iris and white) and short brows, no mouth, straight thin legs, top and bottom drawn apart, hair
// with strands of shade. Each pixel is placed by hand in the template; people differ by colors and a few parts.
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const pack = ([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
const unpack = c => [c & 255, c >>> 8 & 255, c >>> 16 & 255];
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

export const CW = 34, CH = 52;

// W eye white under the lashes, N the neck in the chin's shadow, h hair, H hair light, d hair shade (strands), b brows, s/S skin, w eye white, i iris, K bow (or band),
// j/J/L top (light L), a/A sleeves (lit, shade), c collar, t tie, k/q bottom, p legs, f/F shoes.
// The body without hair: the face (forehead, brows, eyes, chin) and everything below. Hair comes from a style.
const TEMPLATE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....ssssssss....',
  '...ssssssssss...',
  '...ssbbssbbss...',
  '...sbWissiWbs...',
  '...sswissiwss...',
  '...sSssssssSs...',
  '.......NN.......',
  '.....jcSScj.....',
  '....jjjccjjj....',
  '...aJjjccjjJa...',
  '...aJLjtcjjJa...',
  '..aAJLjjjjjJAa..',
  '..aAJLjjjjjJAa..',
  '..aAjLjjjjjJAa..',
  '..sSjjjjjjjjSs..',
  '....kkkkkkkk....',
  '....kqkkkkqk....',
  '......pP.Pp.....',
  '......pP.Pp.....',
  '......pP.Pp.....',
  '......pP.Pp.....',
  '......pP.Pp.....',
  '......ff.ff.....',
  '.....fff.fff....',
  '.....FFF.FFF....',
];
// Hair styles over the first 20 rows: h hair, H sheen, d shade, K ribbon; '-' leaves the face as it is. On the head
// (rows 0–11) the hair lies over the face; below (rows 12–19) it hangs behind the body and shows only around it.
export const HAIRS = {
  long: {name: '长直发', rows: [
    '.....hhhhh......',
    '....hhHHhhhh....',
    '...hhHHhhhhhh...',
    '..hhHhhhhhhhhhd.',
    '..hHhhdhhhdhhhd.',
    '..hhhdhhhdhhhhd.',
    '..hhh--hh--hhhd.',
    '..hh--------hd..',
    '..hh--------hd..',
    '..hh--------hd..',
    '..hh--------hd..',
    '..hhhhh--hhhhd..',
    '.hhhhhhhhhhhhhd.',
    '.hhhhhhhhhhhhhd.',
    '.hhhhhhhhhhhhhd.',
    '.hhhhhhhhhhhhhd.',
    '.hhhhhhhhhhhhhd.',
    '.hhhhhhhhhhhhhd.',
    '.dh..........d..',
    '................']},
  twin: {name: '双马尾', rows: [
    '..KK.hhhhh..KK..',
    '.KKKhhHHhhhhKKK.',
    '..KhhHHhhhhhhK..',
    '..hhHhhhhhhhhhd.',
    '..hHhhdhhhdhhhd.',
    '.hhhhdhhhdhhhhdd',
    'hhhhh--hh--hhhdd',
    'hhhh--------hhdd',
    'hhhh--------hhdd',
    'hhhh--------hhdd',
    'hhhh--------hhdd',
    'hhhhhhh--hhhhhdd',
    'hh............dd',
    'hh............dd',
    'hh............dd',
    'hh............dd',
    'dh............hd',
    'dh............hd',
    '.h............h.',
    '................']},
  bob: {name: '短发', rows: [
    '.....hhhhh......',
    '....hhHHhhhh....',
    '...hhHHhhhhhh...',
    '..hhHhhhhhhhhhd.',
    '..hHhhhhhhhdhhd.',
    '..hhhhhhhhdhhhd.',
    '..hhhhhhh--hhhd.',
    '..hhh-------hhd.',
    '..hh--------hhd.',
    '..hh--------hhd.',
    '..hhh------hhhd.',
    '..hhhhh--hhhhd..',
    '..dhh......hhd..',
    '...d........d...',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................']},
  ponytail: {name: '高马尾', rows: [
    '.....hhhhh......',
    '....hhHHhhhh....',
    '...hhHHhhhhhhh..',
    '..hhHhhhhhhhhhdd',
    '..hHhhdhhhdhhhdd',
    '..hhhdhhhdhhhhhd',
    '..hhh--hh--hhhhd',
    '..hh--------hhhd',
    '..h---------hhdd',
    '..h---------h.hd',
    '..hh--------h.hd',
    '..hhhhh--hhh..hd',
    '..............hd',
    '..............hd',
    '..............hd',
    '..............hd',
    '...............d',
    '................',
    '................',
    '................']},
  wavy: {name: '大波浪', rows: [
    '.....hhhhh......',
    '...hhhHHhhhhh...',
    '..hhhHHhhhhhhh..',
    '.hhhHhhhhhhhhhd.',
    '.hhHhhdhhhdhhhdd',
    '.hhhhdhhhdhhhhdd',
    'hhhhh--hh--hhhhd',
    'hhhh--------hhdd',
    'hhhh--------hhdd',
    '.hhh--------hhd.',
    'hhhh--------hhdd',
    'hhhhhhh--hhhhhdd',
    '.hhhhhhhhhhhhhd.',
    'hhhhhhhhhhhhhhdd',
    '.hhhhhhhhhhhhhd.',
    'hhhhhhhhhhhhhhdd',
    '.hhhhhhhhhhhhhd.',
    '.dh..........hd.',
    '................',
    '................']},
};

// Seen from the side, facing left (facing right is the mirror): the face in profile with the nose and one eye, the
// head's back under the hair, a narrower body; arms and legs are drawn by the step (see figure()).
const SIDE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....sssssss.....',
  '...ssssssssss...',
  '...sbbsssssss...',
  '..sbWisssssss...',
  '..sswisssssss...',
  '...sSssssssS....',
  '.....SSNN.......',
  '.....jcNjj......',
  '.....jjcjjj.....',
  '.....jjjjjJ.....',
  '.....LjjjjJ.....',
  '.....LjjjjJ.....',
  '.....LjjjjJ.....',
  '.....jjjjjJ.....',
  '.....jjjjjj.....',
  '.....kkkkkk.....',
  '.....kqkkkk.....',
];
// Hair seen from the side: bangs at the front, the rest over the back of the head; '-' leaves the face.
const SIDE_HAIRS = {
  long: [
    '.....hhhhh......', '...hhhHHhhhh....', '..hhHHhhhhhhh...', '..hHhhhhhhhhhd..', '..hhhhhhhhhhhhd.', '..hhhhhhhhhhhhd.',
    '..hhh--hhhhhhhd.', '..h----hhhhhhhd.', '..-----h-hhhhhdd', '..-----h-hhhhhdd', '...----hhhhhhhdd', '.....--hhhhhhhdd',
    '.......hhhhhhhd.', '........hhhhhhd.', '........hhhhhhd.', '........hhhhhhd.', '.........hhhhhd.', '.........hhhhd..', '..........hhd...', '................'],
  twin: [
    '..KK.hhhhh......', '.KKKhhHHhhhh....', '..KhHHhhhhhhh...', '..hHhhhhhhhhhd..', '..hhhhhhhhhhhhKK', '..hhhhhhhhhhhKKK',
    '..hhh--hhhhhhhhd', '..h----hhhhhhhhd', '..-----h-hhhhhhd', '..-----h-hhhhhhd', '...----hhhhhhhhd', '.....--hhhhhhh.d',
    '.............hhd', '.............hhd', '.............hhd', '.............hhd', '.............dhd', '..............h.', '................', '................'],
  bob: [
    '.....hhhhh......', '...hhhHHhhhh....', '..hhHHhhhhhhh...', '..hHhhhhhhhhhd..', '..hhhhhhhhhhhhd.', '..hhhhhhhhhhhhd.',
    '..hhhhhhhhhhhhd.', '..hh---hhhhhhhd.', '..-----h-hhhhhd.', '..-----h-hhhhhd.', '...----hhhhhhhd.', '.....--hhhhhhd..',
    '.......dhhhhd...', '........dhhd....', '................', '................', '................', '................', '................', '................'],
  ponytail: [
    '.....hhhhh......', '...hhhHHhhhh....', '..hhHHhhhhhhhh..', '..hHhhhhhhhhhhhd', '..hhhhhhhhhhhdhd', '..hhhhhhhhhhh.hd',
    '..hhh--hhhhhh.hd', '..h----hhhhhh.hd', '..-----h-hhhh.hd', '..-----h-hhhd.hd', '...----hhhhh..hd', '.....--hhhh...hd',
    '..............hd', '..............hd', '..............hd', '...............d', '................', '................', '................', '................'],
  wavy: [
    '.....hhhhh......', '..hhhhHHhhhhh...', '.hhhHHhhhhhhhh..', '.hhHhhhhhhhhhhd.', '.hhhhhhhhhhhhhdd', '.hhhhhhhhhhhhhdd',
    '.hhhh--hhhhhhhhd', '.hh----hhhhhhhdd', '.h-----h-hhhhhdd', '..-----h-hhhhhhd', '...----hhhhhhhdd', '.....--hhhhhhhhd',
    '.......hhhhhhhdd', '.......hhhhhhhhd', '........hhhhhhdd', '.......hhhhhhhhd', '........hhhhhhd.', '.........dhhhd..', '................', '................'],
};

export const PEOPLE = {
  frost: {name: '霜 · 兽人族 · 猫', note: '中央市集卖旧货，总在晒太阳。', ears: 'cat', hair: 'twin', legs: 'skin',
    colors: {h: '#d6dae6', H: '#f3f5fb', d: '#a2a8bd', b: '#7c8196', s: '#ffe6d4', S: '#f0c4a8', w: '#ffffff', i: '#c8323c', K: '#2a2630',
      j: '#b8403a', J: '#86292a', L: '#d9625a', c: '#f4efe8', t: '#2a2630', k: '#2c2a33', q: '#4a4654', f: '#7a4a2e', F: '#4f2f20'},
    sky: ['#a9cfe6', '#e6f2f8']},
  hero: {name: '你 · 新移民', note: '刚坐破冰船到鲸湾，在郊外有一块地。', hair: 'long', legs: 'pants', clip: true,
    colors: {h: '#3b2a33', H: '#6e5060', d: '#25191f', b: '#25191f', s: '#ffe1c8', S: '#efbc9c', w: '#ffffff', i: '#a85a34', K: '#6ff0e0',
      j: '#4a9e96', J: '#2f6f6a', L: '#78c9b9', c: '#e25a46', t: '#a8392e', k: '#3b3f63', q: '#555a85', p: '#3b3f63', P: '#2a2d4a', f: '#7a4a32', F: '#4f2f22'},
    sky: ['#a8d8f0', '#e3f4fb']},
  fox: {name: '橘 · 兽人族向导', note: '在迎接站做向导，耳朵比消息还灵。', ears: 'fox', tail: 'fox', hair: 'ponytail', legs: 'skin',
    colors: {h: '#e8823a', H: '#ffbe73', d: '#b85a24', b: '#9a4a1e', s: '#ffe4cc', S: '#efbd98', w: '#ffffff', i: '#d99a18', K: '#e8823a',
      j: '#7fae5a', J: '#56803e', L: '#a6d27a', c: '#fff6e6', t: '#d9a441', k: '#5a4632', q: '#7a6248', f: '#6a4630', F: '#45291c', e: '#ffd0c8', n: '#fff4ea'},
    sky: ['#f6c9b0', '#fff0e2']},
  water: {name: '澜 · 水系元素种族', note: '西部群岛的摆渡人，雾季也照样送信。', hair: 'wavy', legs: 'pants', drops: true,
    colors: {h: '#5ab4e0', H: '#b4ecff', d: '#3a7fb5', b: '#2f6a9a', s: '#fde8dc', S: '#ecc4b4', w: '#ffffff', i: '#2f7fc8', K: '#5ab4e0',
      j: '#f1ece2', J: '#c4baa8', L: '#ffffff', c: '#4f7fa8', t: '#e0b84a', k: '#3a4a6a', q: '#52648a', p: '#3a4a6a', P: '#28344c', f: '#5a6a80', F: '#3a4658'},
    sky: ['#9fd0e8', '#dff3fb']},
};

const GROUP = {h: 'hair', H: 'hair', d: 'hair', D: 'hair', X: 'hair', a: 'arm', A: 'arm', b: 'brow', s: 'skin', S: 'skin', N: 'skin', w: 'eye', W: 'eye', i: 'eye', K: 'bow', e: 'ear',
  j: 'top', J: 'top', L: 'top', c: 'collar', t: 'collar', k: 'bottom', q: 'bottom', p: 'legs', P: 'legs', f: 'shoes', F: 'shoes'};
const SEAMS = [['hair', 'skin'], ['hair', 'top'], ['hair', 'arm'], ['hair', 'collar'], ['arm', 'skin'], ['arm', 'top'], ['top', 'bottom'], ['top', 'skin'], ['top', 'collar'], ['bottom', 'legs'], ['bottom', 'skin'], ['legs', 'shoes'], ['skin', 'shoes']];
const seam = (a, b) => SEAMS.some(([x, y]) => x === a && y === b);
function figure(p, {view = 'front', step = 0} = {}) {
  const side = view === 'side', base = side ? [...SIDE, ...Array(8).fill('................')] : TEMPLATE;
  const TOP = 4, rows = [...Array(TOP)].map(() => Array(16).fill('.')).concat(base.map(r => r.split('')));
  const at = (x, y) => rows[y + TOP]?.[x], put = (x, y, ch) => { if (rows[y + TOP]) rows[y + TOP][x] = ch; };
  if (side) { // legs and the near arm, by the step: standing, or striding with the arm swinging the other way
    const legs = step === 1 ? [[[7, 22], [6, 23], [6, 24], [5, 25], [5, 26]], [[8, 22], [9, 23], [9, 24], [10, 25], [10, 26]]]
      : step === 3 ? [[[8, 22], [9, 23], [9, 24], [10, 25], [10, 26]], [[7, 22], [6, 23], [6, 24], [5, 25], [5, 26]]] : [[[7, 22], [7, 23], [7, 24], [7, 25], [7, 26]]];
    legs.forEach((leg, k) => {
      for (const [x, y] of leg) { put(x, y, k ? 'P' : 'p'); put(x + 1, y, 'P'); }
      const [fx] = leg.at(-1), lift = k && step ? -1 : 0;
      for (let x = fx - 2; x <= fx + 1; x++) { put(x, 27 + lift, 'f'); put(x, 28 + lift, 'F'); }
      put(fx - 1, 26 + lift, 'f'); put(fx, 26 + lift, 'f');
    });
    const sw = step === 1 ? 1 : step === 3 ? -1 : 0; // the arm swings against the front leg
    for (let y = 14; y < 19; y++) { const dx = Math.round((y - 14) / 4 * sw); put(7 + dx, y, 'a'); put(8 + dx, y, 'A'); }
    put(7 + sw, 19, 's'); put(8 + sw, 19, 'S');
  }
  // the hair style: over the face on the head, behind the body below it
  (side ? SIDE_HAIRS[p.hair] || SIDE_HAIRS.long : (HAIRS[p.hair] || HAIRS.long).rows).forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || ch === '-') return;
    if (y < 12 || at(x, y) === '.') put(x, y, ch);
  }));
  if (p.clip && !side) { put(3, 4, 'K'); put(4, 3, 'K'); put(3, 3, 'K'); }
  if (p.clip && side) { put(4, 4, 'K'); put(5, 3, 'K'); put(4, 3, 'K'); }
  // bottom: bare legs, or trousers the color of the bottom
  if (p.legs === 'skin') for (let y = 22; y < 27; y++) for (let x = 0; x < 16; x++) { const c = at(x, y); if (c === 'p') put(x, y, 's'); if (c === 'P') put(x, y, 'S'); }
  // ears
  if (side && p.ears) { const x = 9; put(x, -1, 'h'); put(x + 1, -1, p.ears === 'fox' ? 'e' : 'h'); put(x, -2, 'h'); put(x + 1, -2, 'h'); put(x + (p.ears === 'fox' ? 1 : 0), -3, 'd'); if (p.ears === 'fox') put(x + 1, -4, 'd'); }
  else if (p.ears === 'cat') for (const [x, dir] of [[3, 1], [12, -1]]) { put(x, -1, 'h'); put(x + dir, -1, 'e'); put(x, -2, 'h'); put(x + dir, -2, 'h'); put(x, -3, 'd'); }
  if (!side && p.ears === 'fox') for (const [x, dir] of [[3, 1], [12, -1]]) { for (let k = 1; k <= 4; k++) { put(x, -k + 1, 'h'); put(x + dir, -k + 1 + (k > 3 ? 1 : 0), k > 1 ? 'e' : 'h'); } put(x, -4, 'd'); put(x + dir * 2, 0, 'h'); }
  const LEVELS = ['D', 'd', 'h', 'H', 'X'], light = [-.35, -.45, .82], len = Math.hypot(...light);
  const shadeAt = (x, y) => {
    let nx, ny;
    if (y <= 11) { nx = (x - 8) / 7.5; ny = (y - 5) / 7.5; }
    else { const cx = x < 8 ? 2 : 13.5; nx = (x - cx) / 2.2; ny = .25 + (y - 11) / 14; }
    nx = Math.max(-1, Math.min(1, nx)); ny = Math.max(-1, Math.min(1, ny));
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny * .6));
    return (nx * light[0] + ny * light[1] + nz * light[2]) / len;
  };
  const hairy = ch => GROUP[ch] === 'hair';
  const shaded = rows.map((row, y) => row.map((ch, x) => {
    if (!hairy(ch)) return ch;
    // the form only darkens where the hair turns away; the light comes from the hand-placed sheen (H) and its brightest pixels
    const b = shadeAt(x, y - TOP); let level = b > .93 ? 3 : b > .45 ? 2 : b > .1 ? 1 : 0;
    if (ch === 'H') level = b > .82 ? 4 : Math.max(level, 3);
    const strand = ch === 'd' && hairy(row[x - 1]) && hairy(row[x + 1]);
    if (strand) level = Math.max(0, level - 1);
    return LEVELS[level];
  }));
  shaded.forEach((row, y) => { rows[y] = row; });
  // facing away: the face and the front of the clothes are hidden by hair and the back of the top
  if (view === 'back') for (let y = 0; y < 30; y++) for (let x = 0; x < 16; x++) {
    const ch = at(x, y), g = GROUP[ch];
    if (y <= 12 && (g === 'skin' || g === 'eye' || g === 'brow')) put(x, y, x >= 12 ? 'd' : 'h');
    if (y > 12 && (ch === 'c' || ch === 't' || ch === 'L')) put(x, y, 'j');
    if (y > 12 && y < 19 && (ch === 'S' || ch === 'N') && x > 4 && x < 11) put(x, y, 'h');
  }
  // walking: one foot lifted a pixel on steps 1 and 3
  if (!side && (step === 1 || step === 3)) {
    const left = step === 1;
    for (let y = 26; y < 29; y++) for (let x = 0; x < 16; x++) if ((x <= 7) === left && at(x, y + 1) !== undefined && GROUP[at(x, y + 1)] === 'shoes') put(x, y, at(x, y + 1));
    for (let x = 0; x < 16; x++) if ((x <= 7) === left) put(x, 29, '.');
  }
  // the hair shades the skin it touches: one pixel under the bangs and beside the side hair
  const skinShade = rows.map((row, y) => row.map((ch, x) => ch === 's' && [[x - 1, y], [x + 1, y], [x, y - 1]].some(([X, Y]) => GROUP[rows[Y]?.[X]] === 'hair')));
  rows.forEach((row, y) => row.forEach((ch, x) => { if (skinShade[y][x]) row[x] = 'S'; }));
  // seams: a pixel darkened where its part meets another (hair round the face, the hem of the jacket, the cuffs...)
  const lines = rows.map((row, y) => row.map((ch, x) => { const g = GROUP[ch]; if (!g) return false;
    return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([X, Y]) => seam(g, GROUP[rows[Y]?.[X]])); }));
  return {rows, lines, TOP};
}

export function card(key) {
  const p = PEOPLE[key], W = CW, H = CH, B = new Uint32Array(W * H);
  const set = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) B[y * W + x] = c; };
  const disc = (cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, c); };
  const sky = p.sky.map(hex), white = pack([255, 255, 255]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = y / 30 + (dither(x, y) - .5) * .3; set(x, y, pack(t < .5 ? sky[0] : sky[1])); }
  for (const [cx, cy, r] of [[7, 8, 2.5], [10, 7, 3.2], [12.5, 9, 2], [26, 13, 2], [28.5, 12, 2.6], [30.5, 14, 1.6]]) disc(cx, cy, r, white);
  const cloudS = pack(sky[1].map(v => v - 16));
  for (let x = 0; x < W; x++) for (let y = 1; y < H - 1; y++) if (B[y * W + x] === white && B[(y + 1) * W + x] !== white) { set(x, y, cloudS); break; }
  for (const [x, y] of [[5, 18], [29, 5], [21, 4], [27, 22], [8, 26]]) set(x, y, white);
  const g0 = pack(hex('#6fa860')), g1 = pack(hex('#8cc27a')), g2 = pack(hex('#a9d690'));
  for (let y = 30; y < H; y++) for (let x = 0; x < W; x++) { const top = 36 + 2.5 * Math.cos((x - 17) / 8); if (y >= top) set(x, y, y < top + 1.5 ? g2 : hash(x, y, 4) > .86 ? g1 : g0); }
  for (let i = 0; i < 20; i++) { const x = hash(i, 1, 9) * W | 0, y = 39 + hash(i, 2, 9) * 11 | 0; set(x, y, g2); set(x, y + 1, g1); }
  const petals = ['#ffb3c8', '#ffffff', '#ffc6d6'].map(h => pack(hex(h))), mid = pack(hex('#ffe08a'));
  for (const [x, y, n] of [[4, 44, 0], [8, 47, 1], [27, 43, 2], [30, 47, 0], [23, 48, 1], [11, 41, 2]]) { const c = petals[n]; set(x, y, c); set(x - 1, y, c); set(x + 1, y, c); set(x, y - 1, c); set(x, y + 1, c); set(x, y, mid); }

  const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
  const colors = {W: mix(p.colors.w, p.colors.S, .55), N: mix(p.colors.S, '#7a4a52', .35), X: mix(p.colors.H, '#ffffff', .22), D: mix(p.colors.d, '#241a2e', .4),
    a: p.colors.j, A: p.colors.J, ...p.colors};
  const f = figure(p), col = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, pack(hex(v))])), ox = 9, oy = 46 - f.rows.length;
  const L = new Uint32Array(W * H), lset = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H && c) L[y * W + x] = c; };
  if (p.tail === 'fox') for (const [x, y] of [[13, 19], [14, 18], [15, 17], [15, 16], [16, 15], [16, 14], [15, 13]]) { lset(ox + x, oy + f.TOP + y, col.h); lset(ox + x + 1, oy + f.TOP + y, y < 15 ? col.n : col.d); }
  const deep = c => { const [r, g, b] = unpack(c); return pack([r * .55 | 0, g * .5 | 0, b * .58 | 0]); };
  f.rows.forEach((row, y) => row.forEach((ch, x) => { if (ch !== '.' && col[ch]) lset(ox + x, oy + y, f.lines[y][x] ? deep(col[ch]) : col[ch]); }));
  if (p.drops) for (const [x, y] of [[0, 14], [15, 10], [1, 6]]) { lset(ox + x, oy + f.TOP + y, col.H); lset(ox + x, oy + f.TOP + y + 1, col.h); }
  // shadow on the grass, then the figure with an outline in the darker shade of each edge
  for (let x = -5; x <= 5; x++) { const X = 17 + x, Y = 46; if (Math.abs(x) < 5) { const [r, g, b] = unpack(B[Y * W + X]); set(X, Y, pack([r * .78 | 0, g * .78 | 0, b * .84 | 0])); } }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (L[i]) { B[i] = L[i]; continue; }
    // which side the figure is on: below (this is its top edge, lit), right (left edge), left (right edge), above (bottom)
    const sides = [[y < H - 1 && L[i + W], .62], [x < W - 1 && L[i + 1], .5], [x > 0 && L[i - 1], .36], [y > 0 && L[i - W], .3]].filter(([c]) => c);
    if (sides.length) {
      const k = sides.reduce((a, [, f]) => a + f, 0) / sides.length + (1 - y / H) * .08, [r, g, b] = unpack(sides[0][0]);
      B[i] = pack([r * k * .95 | 0, g * k * .88 | 0, b * k | 0]);
    }
  }
  const edge = pack(hex('#b49a7a')), cream = pack(hex('#fff7ea')), shade = pack(hex('#e8d9c0'));
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d === 0) set(x, y, edge); else if (d === 1 || d === 2) set(x, y, d === 2 && (y === H - 3 || x === W - 3) ? shade : cream); else if (d === 3) set(x, y, edge);
  }
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) set(x, y, 0);
  return B;
}

/** One person as a sprite of their own (for the world): pixels with the outline, and the row of the feet. */
export function sprite(key, pose = {}) {
  const p = PEOPLE[key];
  const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
  const colors = {W: mix(p.colors.w, p.colors.S, .55), N: mix(p.colors.S, '#7a4a52', .35), X: mix(p.colors.H, '#ffffff', .22), D: mix(p.colors.d, '#241a2e', .4),
    a: p.colors.j, A: p.colors.J, ...p.colors};
  const f = figure(p, pose), col = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, pack(hex(v))]));
  const w = 22, h = f.rows.length + 2, ox = 3, oy = 1, L = new Uint32Array(w * h);
  const lset = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h && c) L[y * w + x] = c; };
  if (p.tail === 'fox') for (const [x, y] of [[13, 19], [14, 18], [15, 17], [15, 16], [16, 15], [16, 14], [15, 13]]) { lset(ox + x, oy + f.TOP + y, col.h); lset(ox + x + 1, oy + f.TOP + y, y < 15 ? col.n : col.d); }
  const deep = c => { const [r, g, b] = unpack(c); return pack([r * .55 | 0, g * .5 | 0, b * .58 | 0]); };
  f.rows.forEach((row, y) => row.forEach((ch, x) => { if (ch !== '.' && col[ch]) lset(ox + x, oy + y, f.lines[y][x] ? deep(col[ch]) : col[ch]); }));
  if (p.drops) for (const [x, y] of [[0, 14], [15, 10], [1, 6]]) { lset(ox + x, oy + f.TOP + y, col.H); lset(ox + x, oy + f.TOP + y + 1, col.h); }
  const out = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (L[i]) { out[i] = L[i]; continue; }
    const sides = [[y < h - 1 && L[i + w], .62], [x < w - 1 && L[i + 1], .5], [x > 0 && L[i - 1], .36], [y > 0 && L[i - w], .3]].filter(([c]) => c);
    if (sides.length) { const k = sides.reduce((a, [, f2]) => a + f2, 0) / sides.length + (1 - y / h) * .08, [r, g, b] = unpack(sides[0][0]); out[i] = pack([r * k * .95 | 0, g * k * .88 | 0, b * k | 0]); }
  }
  if (pose.flip) for (let y = 0; y < h; y++) out.subarray(y * w, y * w + w).reverse();
  return {w, h, px: out, foot: oy + f.rows.length};
}
