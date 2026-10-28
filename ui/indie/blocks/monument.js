// Ocean monuments, made with the land one column at a time (like villages): one try in each 32 × 32 chunks of deep
// sea. A monument is the game's: 58 × 58 and 23 high from y 39, prismarine all through and full of water. In front two
// wings (stepped pyramids, an elder guardian in each) with the entrance between them; behind, the main building
// stepping in three rings up to the roof, where the third elder guardian keeps the room at the top. Inside the
// building a pyramid of small rooms (6 × 2 × 6 inside, two thick walls between) joined by doorways and holes, the
// entrance hall behind the gate, the core room with its eight gold blocks shut in dark prismarine, and rooms whose
// ceilings are hung with wet sponges. Legs of prismarine bricks go down to the sea floor. The monument is built once in
// its own frame (the entrance towards −z) and turned to one of four ways.
import {hash, rng} from './noise.js';
import {ID, BLOCKS, SEA, MINY} from './blocks.js';
import {landAt, worldOf, getBlock, setBlock, BIOMES} from './gen.js';

const REGION = 32 * 16, W = 58, H = 23;
/** The monument's floor: 24 under the sea's top, as in the game (39). */
export const MONUMENT_Y = SEA - 24;
const at = (x, y, z) => (y * W + z) * W + x;

/** The monument of a region (cached), or null: {x0, z0, turn, elders: [[x, y, z] …]} (world places). */
const monuments = new Map();
export function monumentIn(seed, rx, rz) {
  const key = `${seed}|${rx}|${rz}`;
  if (monuments.has(key)) return monuments.get(key);
  if (monuments.size > 2000) monuments.clear();
  const r = rng(Math.floor(hash(seed + 7331, rx, 0, rz) * 2147483647)), w = worldOf(seed);
  // the game's spacing 32, separation 5: a chunk in the first 27 of each way
  const cx = rx * REGION + 16 * Math.floor(r() * 27) + 8, cz = rz * REGION + 16 * Math.floor(r() * 27) + 8;
  let m = null;
  const deep = (x, z, depth) => { const l = landAt(w, x, z); return BIOMES[l.biome].name.endsWith('ocean') && l.h <= SEA - depth; };
  if (deep(cx, cz, 19) && [[-29, -29], [29, -29], [-29, 29], [29, 29], [0, -29], [0, 29], [-29, 0], [29, 0]].every(([dx, dz]) => deep(cx + dx, cz + dz, 9))) {
    const turn = Math.floor(r() * 4), x0 = cx - 29, z0 = cz - 29;
    m = {x0, z0, turn, seed: Math.floor(r() * 2147483647)};
    m.elders = ELDERS.map(([x, y, z]) => { const [wx, wz] = toWorld(m, x, z); return [wx + 0.5, MONUMENT_Y + y, wz + 0.5]; });
  }
  monuments.set(key, m);
  return m;
}
/** The monuments whose ground (and the cleared water round it) reaches a spot. */
export function monumentsNear(seed, x, z, margin = 6) {
  const rx = Math.floor(x / REGION), rz = Math.floor(z / REGION), out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const m = monumentIn(seed, rx + dx, rz + dz);
    if (m && x >= m.x0 - margin && x < m.x0 + W + margin && z >= m.z0 - margin && z < m.z0 + W + margin) out.push(m);
  }
  return out;
}
/** Whether a point is inside a monument's box (guardians come there). */
export const inMonument = (m, x, y, z) => x >= m.x0 && x < m.x0 + W && z >= m.z0 && z < m.z0 + W && y >= MONUMENT_Y && y < MONUMENT_Y + H;

// a place in the monument's own frame (0 … 57, the entrance at z 0) in the world, and back
function toWorld(m, x, z) {
  switch (m.turn) {
    case 1: return [m.x0 + W - 1 - z, m.z0 + x];
    case 2: return [m.x0 + W - 1 - x, m.z0 + W - 1 - z];
    case 3: return [m.x0 + z, m.z0 + W - 1 - x];
    default: return [m.x0 + x, m.z0 + z];
  }
}
function toLocal(m, wx, wz) {
  const a = wx - m.x0, b = wz - m.z0;
  switch (m.turn) {
    case 1: return [b, W - 1 - a];
    case 2: return [W - 1 - a, W - 1 - b];
    case 3: return [W - 1 - b, a];
    default: return [a, b];
  }
}

// the three elder guardians: in each wing, and in the room under the roof
const ELDERS = [[12, 3, 6], [45, 3, 6], [28, 14, 28]];

// ---------- the building, in its own frame ----------
const plans = new Map();
/** The monument's blocks (0: left as the sea and its floor are) and the columns its legs go down from. */
function plan(m) {
  if (plans.has(m.seed)) return plans.get(m.seed);
  if (plans.size > 8) plans.clear();
  const P = new Uint16Array(W * H * W), legs = [], r = rng(m.seed);
  const GRAY = ID.prismarine, LIGHT = ID.prismarine_bricks, BLACK = ID.dark_prismarine, LAMP = ID.sea_lantern, WATER = ID.water;
  const put = (x, y, z, v) => { if (x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < W) P[at(x, y, z)] = v; };
  const box = (x0, y0, z0, x1, y1, z1, v) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, v); };
  const water = (x0, y0, z0, x1, y1, z1) => box(x0, y0, z0, x1, y1, z1, WATER);
  water(0, 0, 0, W - 1, H - 1, W - 1);

  // the wings: stepped pyramids at the front corners (x 0 … 24 and 33 … 57), open at the back
  for (const [x, right] of [[0, false], [33, true]]) {
    box(x, 0, 0, x + 24, 0, 20, GRAY);
    water(x, 1, 0, x + 24, 10, 20);
    for (let j = 0; j < 4; j++) {
      box(x + j, j + 1, j, x + j, j + 1, 20, LIGHT);
      box(x + j + 7, j + 5, j + 7, x + j + 7, j + 5, 20, LIGHT);
      box(x + 17 - j, j + 5, j + 7, x + 17 - j, j + 5, 20, LIGHT);
      box(x + 24 - j, j + 1, j, x + 24 - j, j + 1, 20, LIGHT);
      box(x + j + 1, j + 1, j, x + 23 - j, j + 1, j, LIGHT);
      box(x + j + 8, j + 5, j + 7, x + 16 - j, j + 5, j + 7, LIGHT);
    }
    box(x + 4, 4, 4, x + 6, 4, 20, GRAY); box(x + 7, 4, 4, x + 17, 4, 6, GRAY); box(x + 18, 4, 4, x + 20, 4, 20, GRAY);
    box(x + 11, 8, 11, x + 13, 8, 20, GRAY);
    for (const z of [12, 15, 18]) put(x + 12, 9, z, LIGHT);
    const a = x + (right ? 19 : 5), b = x + (right ? 5 : 19);
    for (let z = 20; z >= 5; z -= 3) put(a, 5, z, LIGHT);
    for (let z = 19; z >= 7; z -= 3) put(b, 5, z, LIGHT);
    for (let k = 0; k < 4; k++) put(right ? x + 24 - (17 - k * 3) : x + 17 - k * 3, 5, 5, LIGHT);
    put(b, 5, 5, LIGHT);
    // the cross of prismarine in the middle, and the elder's room round it: four pillars with lamps on top
    box(x + 11, 1, 12, x + 13, 7, 12, GRAY); box(x + 12, 1, 11, x + 12, 7, 13, GRAY);
    put(x + 12, 8, 12, LAMP);
    for (const [px, pz] of [[7, 5], [17, 5], [7, 16], [17, 16]]) { box(x + px, 1, pz, x + px, 2, pz, LIGHT); put(x + px, 3, pz, LAMP); }
    box(x + 9, 0, 3, x + 15, 0, 9, BLACK);
  }
  // the way in between the wings: arches with lamps
  water(25, 0, 0, 32, 8, 20);
  for (let i = 0; i < 4; i++) {
    const z = 5 + i * 4;
    box(24, 2, z, 24, 4, z, LIGHT); box(22, 4, z, 23, 4, z, LIGHT); put(25, 5, z, LIGHT); put(26, 6, z, LIGHT); put(26, 5, z, LAMP);
    box(33, 2, z, 33, 4, z, LIGHT); box(34, 4, z, 35, 4, z, LIGHT); put(32, 5, z, LIGHT); put(31, 6, z, LIGHT); put(31, 5, z, LAMP);
    box(27, 6, z, 30, 6, z, GRAY);
  }
  box(25, 0, 0, 32, 0, 20, GRAY);
  // the front of the main building, with the gate
  box(15, 0, 21, 42, 0, 21, GRAY);
  box(21, 12, 21, 36, 12, 21, GRAY); box(17, 11, 21, 40, 11, 21, GRAY); box(16, 10, 21, 41, 10, 21, GRAY); box(15, 7, 21, 42, 9, 21, GRAY);
  box(16, 6, 21, 41, 6, 21, GRAY); box(17, 5, 21, 40, 5, 21, GRAY); box(21, 4, 21, 36, 4, 21, GRAY);
  box(22, 3, 21, 26, 3, 21, GRAY); box(31, 3, 21, 35, 3, 21, GRAY); box(23, 2, 21, 25, 2, 21, GRAY); box(32, 2, 21, 34, 2, 21, GRAY);
  box(28, 4, 20, 29, 4, 21, LIGHT);
  for (const [x, y] of [[27, 3], [30, 3], [26, 2], [31, 2], [25, 1], [32, 1]]) put(x, y, 21, LIGHT);
  for (let i = 0; i < 7; i++) { put(28 - i, 6 + i, 21, BLACK); put(29 + i, 6 + i, 21, BLACK); }
  for (let i = 0; i < 4; i++) { put(28 - i, 9 + i, 21, BLACK); put(29 + i, 9 + i, 21, BLACK); }
  put(28, 12, 21, BLACK); put(29, 12, 21, BLACK);
  for (let i = 0; i < 3; i++) { box(22 - i * 2, 8, 21, 22 - i * 2, 9, 21, BLACK); box(35 + i * 2, 8, 21, 35 + i * 2, 9, 21, BLACK); }
  water(15, 13, 21, 42, 15, 21); water(26, 1, 21, 31, 3, 21);
  for (const [x, top] of [[15, 6], [16, 5], [17, 4], [18, 4], [19, 4], [20, 4], [21, 3], [22, 2], [23, 1], [24, 1], [42, 6], [41, 5], [37, 4], [38, 4], [39, 4], [40, 4], [36, 3], [35, 2], [33, 1], [34, 1]]) water(x, 1, 21, x, top, 21);
  // the outer ring (to y 4), the middle (to 8), the upper (to 12) and the roof (to 16): each steps in as it rises
  box(0, 0, 21, 6, 0, 57, GRAY); water(0, 1, 21, 6, 7, 57); box(4, 4, 21, 6, 4, 53, GRAY);
  box(51, 0, 21, 57, 0, 57, GRAY); water(51, 1, 21, 57, 7, 57); box(51, 4, 21, 53, 4, 53, GRAY);
  box(7, 0, 51, 50, 0, 57, GRAY); water(7, 1, 51, 50, 10, 57);
  for (let i = 0; i < 4; i++) {
    box(i, i + 1, 21, i, i + 1, 57 - i, LIGHT); box(57 - i, i + 1, 21, 57 - i, i + 1, 57 - i, LIGHT); box(i + 1, i + 1, 57 - i, 56 - i, i + 1, 57 - i, LIGHT);
  }
  for (let z = 23; z < 53; z += 3) { put(5, 5, z, LIGHT); put(52, 5, z, LIGHT); }
  put(5, 5, 52, LIGHT); put(52, 5, 52, LIGHT);
  box(4, 1, 52, 6, 3, 52, GRAY); box(5, 1, 51, 5, 3, 53, GRAY); box(51, 1, 52, 53, 3, 52, GRAY); box(52, 1, 51, 52, 3, 53, GRAY);
  box(7, 0, 21, 13, 0, 50, GRAY); water(7, 1, 21, 13, 10, 50); box(11, 8, 21, 13, 8, 53, GRAY);
  box(44, 0, 21, 50, 0, 50, GRAY); water(44, 1, 21, 50, 10, 50); box(44, 8, 21, 46, 8, 53, GRAY);
  for (let i = 0; i < 4; i++) { box(i + 7, i + 5, 21, i + 7, i + 5, 54, LIGHT); box(50 - i, i + 5, 21, 50 - i, i + 5, 54, LIGHT); }
  for (let z = 21; z <= 45; z += 3) { put(12, 9, z, LIGHT); put(45, 9, z, LIGHT); }
  box(14, 0, 44, 43, 0, 50, GRAY); water(14, 1, 44, 43, 10, 50);
  for (let x = 12; x <= 45; x += 3) {
    put(x, 9, 45, LIGHT); put(x, 9, 52, LIGHT);
    if ([12, 18, 24, 33, 39, 45].includes(x)) {
      for (const [y, z] of [[9, 47], [9, 50], [10, 45], [10, 46], [10, 51], [10, 52], [11, 47], [11, 50], [12, 48], [12, 49]]) put(x, y, z, LIGHT);
    }
  }
  for (let i = 0; i < 3; i++) box(8 + i, 5 + i, 54, 49 - i, 5 + i, 54, GRAY);
  box(11, 8, 54, 46, 8, 54, LIGHT); box(14, 8, 44, 43, 8, 53, GRAY);
  box(14, 0, 21, 20, 0, 43, GRAY); water(14, 1, 22, 20, 14, 43); box(18, 12, 22, 20, 12, 39, GRAY); box(18, 12, 21, 20, 12, 21, LIGHT);
  box(37, 0, 21, 43, 0, 43, GRAY); water(37, 1, 22, 43, 14, 43); box(37, 12, 22, 39, 12, 39, GRAY); box(37, 12, 21, 39, 12, 21, LIGHT);
  for (let i = 0; i < 4; i++) { box(i + 14, i + 9, 21, i + 14, i + 9, 43 - i, LIGHT); box(43 - i, i + 9, 21, 43 - i, i + 9, 43 - i, LIGHT); }
  for (let z = 23; z <= 39; z += 3) { put(19, 13, z, LIGHT); put(38, 13, z, LIGHT); }
  box(21, 0, 37, 36, 0, 43, GRAY); water(21, 1, 37, 36, 14, 43); box(21, 12, 37, 36, 12, 39, GRAY);
  for (let i = 0; i < 4; i++) box(15 + i, i + 9, 43 - i, 42 - i, i + 9, 43 - i, LIGHT);
  for (let x = 21; x <= 36; x += 3) put(x, 13, 38, LIGHT);
  box(21, 0, 22, 36, 0, 36, GRAY); water(21, 1, 22, 36, 22, 36);
  for (let i = 0; i < 4; i++) {
    box(21 + i, 13 + i, 21 + i, 36 - i, 13 + i, 21 + i, LIGHT); box(21 + i, 13 + i, 36 - i, 36 - i, 13 + i, 36 - i, LIGHT);
    box(21 + i, 13 + i, 22 + i, 21 + i, 13 + i, 35 - i, LIGHT); box(36 - i, 13 + i, 22 + i, 36 - i, 13 + i, 35 - i, LIGHT);
  }
  box(25, 16, 25, 32, 16, 32, GRAY);
  for (const [x, z] of [[25, 25], [32, 25], [25, 32], [32, 32]]) box(x, 17, z, x, 19, z, LIGHT);
  for (const [x, z, ix, iz] of [[26, 26, 27, 27], [26, 31, 27, 30], [31, 31, 30, 30], [31, 26, 30, 27]]) { put(x, 20, z, LIGHT); put(ix, 21, iz, LIGHT); put(ix, 20, iz, LAMP); }
  box(28, 21, 27, 29, 21, 27, GRAY); box(27, 21, 28, 27, 21, 29, GRAY); box(28, 21, 30, 29, 21, 30, GRAY); box(30, 21, 28, 30, 21, 29, GRAY);

  // the rooms inside: a pyramid of cells 8 × 4 × 8 (six by four on the ground, four by three above, two by two at the
  // top), joined at random from the entrance hall
  const cells = new Map(), cellKey = (i, j, k) => `${i},${j},${k}`;
  const floors = [[0, 5, 0, 3], [1, 4, 0, 2], [2, 3, 0, 1]];
  floors.forEach(([i0, i1, k0, k1], j) => { for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) cells.set(cellKey(i, j, k), {i, j, k, open: new Set()}); });
  const core = c => c.i >= 2 && c.i <= 3 && c.k >= 1 && c.k <= 2 && c.j <= 1, hall = c => c.j === 0 && c.k === 0 && (c.i === 2 || c.i === 3);
  const STEPS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
  const near = c => STEPS.map(([a, b, d]) => cells.get(cellKey(c.i + a, c.j + b, c.k + d))).filter(Boolean);
  const join = (a, b) => { a.open.add(cellKey(b.i, b.j, b.k)); b.open.add(cellKey(a.i, a.j, a.k)); };
  // a tree from the hall reaching every room (the core is entered from the hall and from one side), a few loops more
  const seen = new Set([cellKey(2, 0, 0), cellKey(3, 0, 0)]), front = [cells.get(cellKey(2, 0, 0)), cells.get(cellKey(3, 0, 0))];
  join(front[0], front[1]);
  while (front.length) {
    const c = front.splice(Math.floor(r() * front.length), 1)[0];
    for (const n of near(c).sort(() => r() - 0.5)) {
      const k = cellKey(n.i, n.j, n.k);
      if (seen.has(k) || core(n)) continue;
      seen.add(k); join(c, n); front.push(n);
    }
  }
  for (const c of cells.values()) if (!core(c) && r() < 0.12) { const n = near(c).filter(n => !core(n))[Math.floor(r() * 6)]; if (n) join(c, n); }
  const base = c => [5 + c.i * 8, 1 + c.j * 4, 22 + c.k * 8];
  const sponges = [...cells.values()].filter(c => !core(c) && !hall(c) && !cells.has(cellKey(c.i, c.j + 1, c.k))).sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 3));
  for (const c of cells.values()) {
    if (core(c)) continue;
    const [x, y, z] = base(c);
    box(x, y, z, x + 7, y + 3, z + 7, r() < 0.5 ? LIGHT : GRAY);
    box(x, y, z, x + 7, y, z + 7, GRAY);
    water(x + 1, y + 1, z + 1, x + 6, y + 2, z + 6);
    // doorways two wide and two high; a hole in the floor or ceiling between floors
    for (const [a, b, d] of STEPS) {
      const n = cells.get(cellKey(c.i + a, c.j + b, c.k + d));
      if (!n || !c.open.has(cellKey(n.i, n.j, n.k))) continue;
      if (b === 1) water(x + 3, y + 3, z + 3, x + 4, y + 3, z + 4);
      else if (b === -1) water(x + 3, y, z + 3, x + 4, y, z + 4);
      else if (a) water(a > 0 ? x + 7 : x, y + 1, z + 3, a > 0 ? x + 7 : x, y + 2, z + 4);
      else water(x + 3, y + 1, d > 0 ? z + 7 : z, x + 4, y + 2, d > 0 ? z + 7 : z);
    }
    if (hall(c)) continue;
    // what is in a room: a pillar with a lamp, lamps in the corners, or a ring of dark prismarine on the floor
    const kind = r();
    if (kind < 0.3) { box(x + 3, y + 1, z + 3, x + 4, y + 2, z + 4, LIGHT); put(x + 3 + Math.floor(r() * 2), y + 2, z + 3 + Math.floor(r() * 2), LAMP); }
    else if (kind < 0.55) for (const [px, pz] of [[1, 1], [6, 1], [1, 6], [6, 6]]) put(x + px, y + 1, z + pz, LAMP);
    else if (kind < 0.75) { box(x + 1, y, z + 1, x + 6, y, z + 6, BLACK); box(x + 2, y, z + 2, x + 5, y, z + 5, GRAY); put(x + 3, y + 3, z + 3, LAMP); }
    else put(x + 3 + Math.floor(r() * 2), y + 3, z + 3 + Math.floor(r() * 2), LAMP);
  }
  // the entrance hall: the two cells behind the gate made one, the gate opened into it, lamps along the walls
  water(22, 2, 22, 35, 3, 28); water(26, 1, 21, 31, 3, 22);
  for (const x of [22, 35]) for (const z of [23, 27]) put(x, 2, z, LAMP);
  // the core room: two by two cells, two floors high; dark prismarine round its walls, and in the middle eight gold
  // blocks shut in dark prismarine; doorways from the hall and from the side
  box(21, 1, 30, 36, 8, 45, LIGHT); water(22, 2, 31, 35, 7, 44);
  box(22, 1, 31, 35, 1, 44, GRAY);
  for (const [x0, x1, z0, z1] of [[22, 22, 31, 44], [35, 35, 31, 44], [22, 35, 31, 31], [22, 35, 44, 44]]) box(x0, 2, z0, x1, 2, z1, BLACK);
  box(27, 3, 36, 30, 6, 39, BLACK); box(28, 4, 37, 29, 5, 38, ID.gold_block);
  for (const [x, z] of [[24, 33], [33, 33], [24, 42], [33, 42]]) { box(x, 2, z, x, 6, z, LIGHT); put(x, 4, z, LAMP); }
  water(27, 2, 30, 30, 3, 30); water(27, 2, 29, 30, 3, 29);
  water(36, 2, 37, 36, 3, 38); water(37, 2, 37, 37, 3, 38);
  // wet sponges hanging from the ceilings of a few rooms at the top of their stacks
  for (const c of sponges) {
    const [x, y, z] = base(c);
    for (let px = 1; px <= 6; px++) for (let pz = 1; pz <= 6; pz++) if (r() < 0.6) put(x + px, y + (r() < 0.25 ? 2 : 3), z + pz, ID.wet_sponge);
  }
  // a hole up from the top floor into the room under the roof
  water(28, 12, 30, 29, 13, 31);

  // legs: four by four of bricks round the edge every nine, down to the sea floor (none where the gate is)
  for (let j = 0; j < 7; j++) for (let k = 0; k < 7; k++) {
    if ((j !== 0 && j !== 6 && k !== 0 && k !== 6) || (k === 0 && j === 3)) continue;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { put(j * 9 + a, 0, k * 9 + b, LIGHT); legs.push((k * 9 + b) * W + j * 9 + a); }
  }
  const p = {P, legs: new Set(legs)};
  plans.set(m.seed, p);
  return p;
}

/** Draws the parts of monuments in a column (after the land, before the sea's plants grow back over it). */
export function drawMonuments(col, seed) {
  const x0 = col.cx * 16, z0 = col.cz * 16;
  for (const m of monumentsNear(seed, x0 + 8, z0 + 8, 30)) {
    if (m.x0 - 6 >= x0 + 16 || m.x0 + W + 6 <= x0 || m.z0 - 6 >= z0 + 16 || m.z0 + W + 6 <= z0) continue;
    const {P, legs} = plan(m);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = x0 + x, wz = z0 + z;
      const ox = Math.max(m.x0 - wx, wx - (m.x0 + W - 1), 0), oz = Math.max(m.z0 - wz, wz - (m.z0 + W - 1), 0), out = Math.max(ox, oz);
      if (out > 5) continue;
      if (out) {
        // round it the sea floor is cut back in steps, so the monument stands clear
        for (let y = MONUMENT_Y + 2 * (out - 1); y <= SEA; y++) { const v = getBlock(col, x, y, z); if (v && (v & 0xFFF) !== ID.water) setBlock(col, x, y, z, y === SEA && BIOMES[col.biome[z * 16 + x]].cold ? ID.ice : ID.water); }
        continue;
      }
      const [lx, lz] = toLocal(m, wx, wz);
      for (let y = 0; y <= SEA - MONUMENT_Y; y++) {
        const v = y < H ? P[at(lx, y, lz)] : ID.water;
        setBlock(col, x, MONUMENT_Y + y, z, v || ID.water);
      }
      if (legs.has(lz * W + lx)) for (let y = MONUMENT_Y - 1; y > MINY; y--) {
        const v = getBlock(col, x, y, z), b = BLOCKS[v & 0xFFF];
        if (v && b.solid && b.shape === 'cube') break;
        setBlock(col, x, y, z, ID.prismarine_bricks);
      }
    }
  }
}
