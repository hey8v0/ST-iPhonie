// 宠物 (0.9.36): the pets' pixel pictures, drawn here from small maps (no picture files): each kind is a left half
// mirrored into a whole 20×20, with its eyes, mouth and legs put on for each frame. A frame strip per kind is drawn once
// as an SVG picture and used as a CSS background (steps between frames are the browser's).
export const PET_SIZE = 20;
export const PET_FRAMES = Object.freeze(['stand', 'blink', 'walk1', 'walk2', 'happy', 'sad', 'held', 'eat']);

const mirror = half => half.map(row => row + [...row].reverse().join(''));
// Eyes, 3 wide and 2 high ('_' keeps what is there); sad ones are mirrored for the right eye.
const EYES = {open: ['ew_', 'ee_'], closed: ['___', 'kkk'], happy: ['_k_', 'k_k'], sad: ['k__', '_kk'], wide: ['ee_', 'ee_']};
const FACE = {stand: 'open', blink: 'closed', walk1: 'open', walk2: 'open', happy: 'happy', sad: 'sad', held: 'wide', eat: 'closed'};

export const PET_ART = Object.freeze({
  cat: {
    palette: {k: '#4a2f1c', b: '#f4a95c', d: '#d9823b', l: '#ffe2bd', w: '#ffffff', e: '#2b1b10', p: '#ff9fb0', c: '#7fc8ff'},
    half: [
      '..........', '..........', '...kk.....', '..kbbk....', '..kbpbk...', '..kbbbbkkk', '.kbbdbbbbb', '.kbbbbbbbb', '.kbbbbbbbb', '.kbbbbbbbb',
      '.kbpbbbbbp', '.kbbbbbbbk', '..kbbbbbbb', '...kkbbbbb', '....kbblll', '...kbbllll', '...kbbllll', '...kbbblll', '...kbbkbbb', '....kk.kkk'],
    // The tail, curled up on the right.
    extra: {12: {17: 'k'}, 13: {17: 'd', 18: 'k'}, 14: {17: 'd', 18: 'k'}, 15: {17: 'd', 18: 'k'}, 16: {17: 'k'}},
    eyes: [[4, 8], [13, 8]], mouth: [9, 11, ['pp']],
    legs: {
      walk1: {18: '...kbbkbbbbbbbbbk...', 19: '....kk.kkkkkkkkk....'},
      walk2: {18: '...kbbbbbbbbbkbbk...', 19: '....kkkkkkkkk.kk....'},
      held: {18: '...kbbkbbbbbbkbbk...', 19: '...kbk.k....k.kbk...'},
    },
  },
  chick: {
    palette: {k: '#7a5410', b: '#ffd84a', d: '#f0b92a', l: '#fff3a8', w: '#ffffff', e: '#3a2a08', o: '#ff9a2e', r: '#ff5a4a', p: '#ffb0a0', c: '#7fc8ff'},
    half: [
      '..........', '........kk', '.......krr', '.......kkk', '.....kkbbb', '....kbbbbb', '...kbbbbbb', '..kbbbbbbb', '..kbbbbbbb', '..kbbbbbbb',
      '..kbpbbbbo', '.kbbbbbbbk', 'kdbbbbbbbb', 'kddbbbbbbb', 'kdbbbbbbbb', '.kbbbbbbbb', '..kbbbbbbb', '...kkbbbbb', '.....kkkkk', '......o.o.'],
    extra: {10: {9: 'o', 10: 'o'}},
    eyes: [[5, 8], [12, 8]], mouth: [9, 11, ['oo']],
    legs: {
      walk1: {19: '.....o.o....o.o.....'},
      walk2: {19: '......o.o.....o.o...'},
      held: {18: '.....kkkkkkkkkk.....', 19: '......o..oo..o......'},
    },
  },
  slime: {
    palette: {k: '#2e7a5a', b: '#7ee6b0', d: '#4fc48c', l: '#e2fff0', w: '#ffffff', e: '#1d4a38', p: '#ff9fc0', c: '#7fc8ff'},
    half: [
      '..........', '..........', '..........', '..........', '..........', '.......kkk', '.....kkbbb', '....kbbbbb', '...kbllbbb', '...kblbbbb',
      '..kbbbbbbb', '..kbbbbbbb', '..kbpbbbbb', '.kbbbbbbbb', '.kbbbbbbbb', '.kbbbbbbbb', '.kdbbbbbbb', '.kddbbbbbb', '..kddddddd', '...kkkkkkk'],
    extra: {},
    eyes: [[5, 10], [12, 10]], mouth: [9, 13, ['kk']],
    legs: {
      walk1: {17: '.kddbbbbbbbbbbbbddk.', 18: '.kkdddddddddddddkk..', 19: '..kkkkkkkkkkkkkk....'},
      walk2: {17: '.kddbbbbbbbbbbbbddk.', 18: '..kkdddddddddddddkk.', 19: '....kkkkkkkkkkkkkk..'},
      held: {18: '..kddddddddddddddk..', 19: '...kk..kkkkkk..kk...'},
    },
  },
  crab: {
    palette: {k: '#7a2a22', b: '#ff6b5a', d: '#d94a3c', l: '#ffb3a7', w: '#ffffff', e: '#2a0f0c', p: '#ffb0b8', c: '#7fc8ff'},
    half: [
      '..........', '.kk.......', 'kbbk......', 'kbkbk.....', 'kbbbk.....', '.kbbk.....', '..kbk.....', '...kb.....', '...kbk....', '....kkkkkk',
      '...kbbbbbb', '..kbbbbbbb', '..kbbbbbbb', '..kbpbbbbb', '..kbbbbbbb', '...kddbbbb', '...kkddddd', '..k.kkkkkk', '.k..k.k..k', '...k.k.k..'],
    extra: {},
    eyes: [[5, 11], [12, 11]], mouth: [9, 14, ['kk']],
    legs: {
      walk1: {18: '..k.k.k..kk..k.k.k..', 19: '.k.k.k........k.k.k.'},
      walk2: {18: '.k..k.k..kk..k.k..k.', 19: '...k.k.k....k.k.k...'},
      held: {17: '..k.kkkkkkkkkkkk.k..', 18: '..k..k.k....k.k..k..', 19: '..k..k.k....k.k..k..'},
    },
  },
});

/** One frame of a kind as rows of palette letters. */
export function petFrame(kind, frame) {
  const art = PET_ART[kind];
  const rows = mirror(art.half).map(r => [...r]);
  for (const [y, cells] of Object.entries(art.extra || {})) for (const [x, ch] of Object.entries(cells)) rows[y][x] = ch;
  for (const [y, row] of Object.entries(art.legs?.[frame] || {})) if (row.length === PET_SIZE) rows[y] = [...row];
  const eye = EYES[FACE[frame] || 'open'];
  art.eyes.forEach(([x, y], side) => eye.forEach((line, dy) => [...line].forEach((ch, dx) => {
    const col = side && FACE[frame] === 'sad' ? x + 2 - dx : x + dx;
    if (ch !== '_') rows[y + dy][col] = ch;
  })));
  // A tear under a sad eye; an open mouth eating or held up.
  if (FACE[frame] === 'sad') { const [x, y] = art.eyes[0]; rows[y + 2][x] = 'c'; }
  if (frame === 'eat' || frame === 'held') { const [x, y, [m]] = art.mouth; [...m].forEach((ch, dx) => { rows[y][x + dx] = frame === 'eat' ? 'p' : ch; }); }
  return rows.map(r => r.join(''));
}

const strips = new Map();
/**
 * The frames of a kind side by side as a picture (an SVG data: address, a run of one colour one rectangle), made once.
 * SVG rather than a canvas: some browsers blur what a canvas gives back (against fingerprinting), and it stays sharp.
 */
export function petStrip(kind) {
  if (strips.has(kind)) return strips.get(kind);
  const palette = PET_ART[kind]?.palette;
  if (!palette) return '';
  const rects = [];
  PET_FRAMES.forEach((frame, i) => petFrame(kind, frame).forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      let n = 1;
      while (x + n < row.length && row[x + n] === row[x]) n++;
      if (palette[row[x]]) rects.push(`<rect x="${i * PET_SIZE + x}" y="${y}" width="${n}" height="1" fill="${palette[row[x]]}"/>`);
      x += n;
    }
  }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PET_SIZE * PET_FRAMES.length} ${PET_SIZE}" width="${PET_SIZE * 2 * PET_FRAMES.length}" height="${PET_SIZE * 2}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  strips.set(kind, url);
  return url;
}
