// 南极结界 · 农场上的东西: how what lies about the farm looks — weeds (by season), twigs, pebbles, rocks, stumps, pines
// from a cone to a tree, things to forage (their bag picture laid on the ground), and what one makes and sets down
// (a chest, a sprinkler, a campfire, fences that join up). Each is a thing of the world like assets.js makes, with
// normals for the light. Paths are paving painted into the ground instead (pathAlbedo).
import {object, cylinder, disc, norm, C, hash, noise, rock, stump as stumpArt} from './assets.js';
import {iconPixels} from './icons.js';

const UP = [0, 0, 1], FRONT = [0, 1, 0];
const WOOD = ['#3a2416', '#5a3a24', '#7a5034', '#9a6a44', '#b8865a'].map(C);
const STONE = ['#4e4e5a', '#6a6a78', '#8a8a98', '#a8a8b6', '#c4c4d0'].map(C);
const GRASS = [['#2f6b2a', '#3f8a36', '#5aa848', '#7cc35a'], ['#2a6a26', '#3a8a32', '#56aa44', '#80cc5a'], ['#6a6a2a', '#8a7a34', '#a8903e', '#c8a850'], ['#6a6a4a', '#8a8462', '#a89e7a', '#dfe8ee']];
const PINE = [['#163a26', '#1f5232', '#2a6a3e', '#3a8a4e', '#56a862'], ['#163a26', '#1f5232', '#2a6a3e', '#3a8a4e', '#56a862'], ['#183a28', '#22503a', '#2e6844', '#3e8250', '#5a9a62'], ['#163a2e', '#1f4e3a', '#2a6446', '#7a9a92', '#c8dade']];

/** The look of a thing on the farm: th from game.js (id, stage), the season, a seed from its tile, the fence's joins. */
export function thingArt(th, season, seed = 1, joins = 0) {
  switch (th.id) {
    case 'weed': return weed(seed, season);
    case 'twig': return twig(seed);
    case 'pebble': return pebble(seed);
    case 'rock': return rock(seed, false);
    case 'stump': return stumpArt();
    case 'tree': return pine(th.stage ?? 3, season, seed);
    case 'chest': return chest();
    case 'sprinkler': return sprinkler();
    case 'campfire': return campfire();
    case 'fence': return fence(joins);
    default: return forage(th.id);
  }
}

function weed(seed, season) {
  const g = GRASS[season].map(C);
  return object(16, 14, set => {
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (hash(k, seed, 1) - .5) * 2.2, len = 5 + hash(k, seed, 2) * 7, bend = (hash(k, seed, 3) - .5) * .5;
      for (let r = 0; r < len; r++) { const x = 8 + Math.cos(a + bend * r / len) * r * .9, y = 13 + Math.sin(a + bend * r / len) * r; set(x, y, r > len - 2 ? g[3] : r > len * .5 ? g[2] : k % 2 ? g[1] : g[0]); }
    }
    if (season === 3) for (let k = 0; k < 2; k++) set(4 + hash(k, seed, 5) * 8, 4 + hash(k, seed, 6) * 4, C('#e6eef4')); // a little rime
  }, {round: 2, fx: 8, fy: 13, shapes: []});
}
function twig(seed) {
  return object(18, 10, set => {
    const dir = hash(seed, 1) > .5 ? 1 : -1;
    for (let k = 0; k < 14; k++) { const x = 2 + k, y = 6 + Math.round(Math.sin(k * .7 + seed) * .8) - (dir > 0 ? k * .2 : (13 - k) * .2); set(x, y, WOOD[3]); set(x, y + 1, WOOD[1]); }
    for (const [x0, y0, dx, dy] of [[7, 5, 1, -1], [11, 6, 1, 1], [5, 6, -1, 1]]) for (let k = 0; k < 3; k++) set(x0 + dx * k, y0 + dy * k * .7, WOOD[2]);
    set(2, 6, C('#c8a070')); set(15, 5, C('#c8a070'));
  }, {round: 2, fx: 9, fy: 8, shapes: []});
}
function pebble(seed) {
  return object(13, 10, set => {
    const cx = 6.5, cy = 6, rx = 5.4, ry = 3.6;
    for (let y = 0; y < 10; y++) for (let x = 0; x < 13; x++) {
      const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry, d = dx * dx + dy * dy + (noise(x, y, 3, seed) - .5) * .35; if (d > 1) continue;
      const lit = -dx * .5 - dy * .9; set(x, y, lit > .6 ? STONE[4] : lit > .1 ? STONE[3] : lit > -.4 ? STONE[2] : STONE[1]);
    }
  }, {round: 3, fx: 6.5, fy: 8, shapes: [{t: 'sphere', x: 0, y: -1, z: 1, r: 4}]});
}
// a pine from a cone in the earth, a sprout, a sapling, to a young tree; snow on its tiers in winter
function pine(stage, season, seed) {
  const p = PINE[season].map(C);
  if (stage === 0) return object(12, 8, set => { disc(set, 6, 5, 4.5, C('#5a3a24'), .45, UP); disc(set, 6, 3.5, 2, C('#7a5034'), 1); set(6, 2, C('#9a6a44')); }, {round: 2, fx: 6, fy: 6, shapes: []});
  if (stage === 1) return object(10, 12, set => { for (let y = 5; y < 11; y++) set(5, y, p[1]); for (const [x, y] of [[3, 4], [4, 5], [7, 4], [6, 5], [4, 7], [6, 7], [5, 3]]) set(x, y, p[3]); }, {round: 2, fx: 5, fy: 10, shapes: []});
  const W = stage === 2 ? 18 : 34, H = stage === 2 ? 26 : 54, tiers = stage === 2 ? 3 : 5, trunk = stage === 2 ? 4 : 8;
  return object(W, H, set => {
    const cx = W / 2;
    for (let y = H - trunk - 2; y < H - 1; y++) for (let x = Math.round(cx - 1.5); x < cx + 1.5; x++) set(x, y, x < cx - .5 ? WOOD[3] : WOOD[1]);
    for (let t = 0; t < tiers; t++) {
      const top = 1 + t * (H - trunk - 4) / tiers * .9, bottom = top + (H - trunk) / tiers * 1.35, half = 2.5 + t * (W / 2 - 3) / Math.max(1, tiers - 1);
      for (let y = Math.floor(top); y < bottom; y++) {
        const k = (y - top) / (bottom - top), wdt = half * Math.pow(k, .85) + .8;
        for (let x = Math.round(cx - wdt); x <= cx + wdt; x++) {
          const u = (x - cx) / wdt, edge = k > .82 && (x + y + seed) % 3 === 0;
          let c = u < -.45 ? p[3] : u < .1 ? p[2] : u < .6 ? p[1] : p[0];
          if (k > .9) c = p[0];
          if (season === 3 && k < .14 && Math.abs(u) < .7 && (x + y) % 2) c = k < .07 ? p[4] : p[3]; // frost on the tier tips
          if (!edge) set(x, y, c);
        }
      }
    }
  }, {round: stage === 2 ? 3 : 5, fx: W / 2, fy: H - 2, shapes: [{t: 'cyl', x: 0, y: -1, r: 1.5, h: trunk}]});
}
// something to forage lies on the ground: its bag picture, a little smaller
function forage(id) {
  const px = iconPixels(id);
  return object(16, 16, set => { for (const [x, y, col] of px) set(x, y, C(col)); }, {outline: false, round: 3, fx: 8, fy: 14, shapes: []});
}
function chest() {
  return object(18, 20, set => {
    for (let y = 3; y < 9; y++) for (let x = 1; x < 17; x++) set(x, y, y < 5 ? WOOD[4] : (x % 5 === 0 ? WOOD[2] : WOOD[3]), norm(0, .45, .9));
    for (let x = 2; x < 16; x++) set(x, 2, WOOD[4], UP);
    for (let y = 9; y < 19; y++) for (let x = 1; x < 17; x++) set(x, y, y === 9 ? WOOD[0] : y > 16 ? WOOD[1] : x % 5 === 0 ? WOOD[1] : WOOD[2], FRONT);
    for (const x0 of [3, 13]) for (let y = 2; y < 19; y++) set(x0, y, y < 9 ? C('#9a9aaa') : C('#6a6a7a'), y < 9 ? norm(0, .45, .9) : FRONT);
    for (let y = 8; y < 12; y++) for (let x = 8; x < 10; x++) set(x, y, y === 10 ? C('#8a6a1a') : C('#e0b84a'), FRONT);
  }, {round: 2, fx: 9, fy: 18, shapes: [{t: 'box', x0: -8, x1: 8, y0: -6, y1: 0, h: 14}]});
}
function sprinkler() {
  return object(16, 14, set => {
    cylinder(set, 8, 8, 12, 5.5, 2, (u, v, part) => part === 'top' ? STONE[3] : u < -.3 ? STONE[2] : u < .4 ? STONE[1] : STONE[0]);
    cylinder(set, 8, 3, 8, 1.6, .7, (u, v, part) => part === 'top' ? C('#c8a04a') : u < 0 ? C('#e0c070') : C('#a07a2a'));
    for (const [x, y] of [[4, 4], [12, 4], [8, 1]]) set(x, y, C('#6ab8e0'));
  }, {round: 2, fx: 8, fy: 12, shapes: [{t: 'cyl', x: 0, y: -1, r: 5, h: 6}]});
}
function campfire() {
  return object(24, 16, set => {
    // logs crossed in the middle, a ring of stones round them (the flames are drawn live after dusk)
    for (const [a, b] of [[[5, 11], [18, 7]], [[6, 7], [19, 11]]]) for (let k = 0; k <= 14; k++) { const x = a[0] + (b[0] - a[0]) * k / 14, y = a[1] + (b[1] - a[1]) * k / 14; set(x, y, WOOD[3]); set(x, y + 1, WOOD[1]); }
    disc(set, 12, 9, 2.4, C('#2a1a12'), .6, UP);
    for (let k = 0; k < 11; k++) { const a = k / 11 * Math.PI * 2, x = 12 + Math.cos(a) * 9.5, y = 9 + Math.sin(a) * 4.4; disc(set, x, y, 1.8, STONE[1 + (k % 3)], .8); set(x - .5, y - 1, STONE[4]); }
  }, {round: 2, fx: 12, fy: 13, shapes: []});
}
// a fence post with rails to the fences beside it: joins 1 right, 2 left, 4 up, 8 down
function fence(joins) {
  return object(16, 38, set => {
    const post = (y0, y1) => { for (let y = y0; y < y1; y++) { set(6, y, WOOD[4], FRONT); set(7, y, WOOD[3], FRONT); set(8, y, WOOD[3], FRONT); set(9, y, WOOD[1], FRONT); } for (let x = 6; x < 10; x++) set(x, y0, WOOD[4], UP); };
    if (joins & 4) for (let y = 4; y < 22; y++) { set(7, y, WOOD[2], norm(-.5, .5, .5)); set(8, y, WOOD[1], norm(.5, .5, .5)); } // rails running back to the post behind
    post(18, 36);
    for (const ry of [23, 29]) {
      if (joins & 1) for (let x = 10; x < 16; x++) { set(x, ry, WOOD[4], UP); set(x, ry + 1, WOOD[2], FRONT); }
      if (joins & 2) for (let x = 0; x < 6; x++) { set(x, ry, WOOD[4], UP); set(x, ry + 1, WOOD[2], FRONT); }
    }
  }, {outline: true, round: 2, fx: 8, fy: 35, shapes: [{t: 'box', x0: -2, x1: 2, y0: -2, y1: 0, h: 17}]});
}

/** Paving for a path tile: three or four flat stones with earth between them (an albedo, or null between stones). */
export function pathAlbedo(lx, ly, tx, ty) {
  const cells = [[4, 4, 4.2, 3.4], [11.5, 3.5, 3.6, 3.2], [3.5, 11.5, 3.5, 3.3], [11, 11.5, 4.2, 3.6]];
  for (const [cx, cy, rx, ry] of cells) {
    const jx = (hash(tx, ty, cx | 0) - .5) * 1.4, jy = (hash(tx, ty, cy | 0) - .5) * 1.2, dx = (lx + .5 - cx - jx) / rx, dy = (ly + .5 - cy - jy) / ry, d = dx * dx + dy * dy;
    if (d > 1) continue;
    const lit = -dx * .4 - dy * .8, v = 150 + lit * 26 + (hash(lx, ly, tx * 7 + ty) - .5) * 10;
    return d > .78 ? [v * .62, v * .6, v * .58] : [v, v * .97, v * .94];
  }
  return [92, 72, 52];
}
