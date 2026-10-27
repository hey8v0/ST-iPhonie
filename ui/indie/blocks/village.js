// Villages, made with the land one column at a time (like the Nether's fortresses): in plains, meadows, deserts,
// savannas, taigas and snowy plains, a few in each 34 × 34 columns. A village grows from its well (and bell) along roads
// of dirt path; beside the roads stand houses (small and big, with beds), farms (wheat, carrots and potatoes round a
// water channel, a composter) and work places (one for each trade, its work block inside), all in the biome's own
// style. A building's floor height comes from the land's height at its middle, so every column draws it the same.
import {hash, rng} from './noise.js';
import {ID, withMeta, BLOCKS, SEA} from './blocks.js';
import {landAt, worldOf, getBlock, setBlock, BIOMES} from './gen.js';

const REGION = 34 * 16;
export const VILLAGE_BIOMES = {plains: 'plains', meadow: 'plains', desert: 'desert', savanna: 'savanna', taiga: 'taiga', snowy_plains: 'snowy'};
const plains = {wall: 'oak_planks', post: 'oak_log', base: 'cobblestone', roof: 'oak_stairs', ridge: 'oak_slab', flat: 'oak_planks', door: 'oak_door', fence: 'oak_fence', bed: 'red_bed'};
export const STYLES = {
  plains,
  desert: {...plains, wall: 'sandstone', post: 'sandstone', base: 'sandstone', roof: null, flat: 'sandstone', bed: 'yellow_bed', parapet: true},
  savanna: {...plains, wall: 'acacia_planks', post: 'acacia_log', roof: null, flat: 'acacia_planks', bed: 'orange_bed'},
  taiga: {...plains, wall: 'spruce_planks', post: 'spruce_log', roof: 'spruce_stairs', ridge: 'cobblestone_slab', flat: 'spruce_planks', door: 'spruce_door', fence: 'spruce_fence', bed: 'brown_bed'},
};
STYLES.snowy = {...STYLES.taiga, snow: true, bed: 'light_blue_bed'};
// the work places, by trade: what stands inside
export const JOBS = ['farmer', 'fisherman', 'shepherd', 'fletcher', 'librarian', 'cleric', 'armorer', 'toolsmith', 'butcher'];
const WORK = {farmer: 'composter', fisherman: 'barrel', shepherd: 'loom', fletcher: 'fletching_table', librarian: 'lectern', cleric: 'brewing_stand', armorer: 'blast_furnace', toolsmith: 'smithing_table', butcher: 'smoker'};
const DIRS = [[0, 1], [-1, 0], [0, -1], [1, 0]];

const villages = new Map();
/** The village of a region (cached), or null: {x, z, y, style, pieces: [{kind, x0, x1, z0, z1, y, door, prof}]}. */
function villageIn(seed, rx, rz) {
  const key = `${seed}|${rx}|${rz}`;
  if (villages.has(key)) return villages.get(key);
  if (villages.size > 2000) villages.clear();
  const r = rng(Math.floor(hash(seed + 911, rx, 0, rz) * 2147483647)), w = worldOf(seed);
  let v = null;
  const cx = rx * REGION + 16 * Math.floor(r() * 26) + 8, cz = rz * REGION + 16 * Math.floor(r() * 26) + 8, l = landAt(w, cx, cz);
  const style = VILLAGE_BIOMES[BIOMES[l.biome]?.name];
  if (r() < 0.75 && style && l.h > SEA && l.mountain < 0.2) {
    const pieces = [{kind: 'well', x0: cx - 2, x1: cx + 2, z0: cz - 2, z1: cz + 2, y: l.h}];
    const free = (x0, z0, x1, z1) => pieces.every(p => x1 < p.x0 - 1 || x0 > p.x1 + 1 || z1 < p.z0 - 1 || z0 > p.z1 + 1);
    let roads = 0;
    for (let d = 0; d < 4; d++) {
      if (r() > 0.85 && !(d >= 2 && roads < 2)) continue;
      roads++;
      const [dx, dz] = DIRS[d], len = 18 + 12 * Math.floor(r() * 3);
      // the road: three wide, from the well's edge out
      const a = 3, b = len;
      pieces.push(dx ? {kind: 'road', x0: cx + Math.min(dx * a, dx * b), x1: cx + Math.max(dx * a, dx * b), z0: cz - 1, z1: cz + 1}
        : {kind: 'road', x0: cx - 1, x1: cx + 1, z0: cz + Math.min(dz * a, dz * b), z1: cz + Math.max(dz * a, dz * b)});
      pieces.push({kind: 'lamp', x0: cx + dx * (len + 1) + (dz ? 2 : 0), x1: cx + dx * (len + 1) + (dz ? 2 : 0), z0: cz + dz * (len + 1) + (dx ? 2 : 0), z1: cz + dz * (len + 1) + (dx ? 2 : 0)});
      // buildings on both sides, their doors to the road
      for (let t = 7; t < len - 2; t += 11) for (const side of [-1, 1]) {
        if (r() > 0.7) continue;
        const q = r(), kind = q < 0.3 ? 'small' : q < 0.5 ? 'big' : q < 0.7 ? 'farm' : 'job';
        const along = kind === 'farm' ? 9 : kind === 'big' ? 7 : 5, deep = kind === 'farm' ? 7 : kind === 'big' ? 7 : 5;
        const off = 2 + 1 + Math.floor(deep / 2), mx = cx + dx * t + (dz ? side * off : 0), mz = cz + dz * t + (dx ? side * off : 0);
        const hx = Math.floor((dx ? along : deep) / 2), hz = Math.floor((dx ? deep : along) / 2);
        const box = [mx - hx, mz - hz, mx + hx, mz + hz];
        const lb = landAt(w, mx, mz);
        if (!free(...box) || lb.h <= SEA || Math.abs(lb.h - l.h) > 8) continue;
        // the door looks back at the road: from a building beside a road along x it faces ∓z
        const door = dx ? (side > 0 ? 2 : 0) : (side > 0 ? 1 : 3);
        pieces.push({kind, x0: box[0], z0: box[1], x1: box[2], z1: box[3], y: lb.h, door, prof: kind === 'job' ? JOBS[Math.floor(r() * JOBS.length)] : kind === 'farm' ? 'farmer' : null});
      }
    }
    v = {x: cx, z: cz, y: l.h, style, pieces};
  }
  villages.set(key, v);
  return v;
}
/** The villages whose land reaches a column (or a point's column): checked over the regions around. */
export function villagesNear(seed, x, z) {
  const rx = Math.floor(x / REGION), rz = Math.floor(z / REGION), out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const v = villageIn(seed, rx + dx, rz + dz); if (v && Math.abs(v.x - x) < 90 && Math.abs(v.z - z) < 90) out.push(v); }
  return out;
}

/** Draws the parts of villages in a column (after the land and its trees). */
export function drawVillages(col, seed) {
  const x0 = col.cx * 16, z0 = col.cz * 16, w = worldOf(seed);
  for (const v of villagesNear(seed, x0 + 8, z0 + 8)) {
    const st = STYLES[v.style], B = n => ID[n];
    const inside = (x, z) => x >= x0 && x < x0 + 16 && z >= z0 && z < z0 + 16;
    const put = (x, y, z, b) => { if (inside(x, z)) setBlock(col, x - x0, y, z - z0, b); };
    const get = (x, y, z) => getBlock(col, x - x0, y, z - z0);
    const touches = p => p.x1 >= x0 && p.x0 < x0 + 16 && p.z1 >= z0 && p.z0 < z0 + 16;
    const ground = v2 => { const b = BLOCKS[v2 & 0xFFF]; return v2 && b.solid && b.shape !== 'cross' && !b.name.endsWith('_leaves') && !b.name.endsWith('_log'); };
    /** The top of the ground at a spot (near a height): the block to stand on. */
    const top = (x, z, near) => { for (let y = near + 12; y > near - 16; y--) { const g = get(x, y, z); if (ground(g) || (g & 0xFFF) === ID.water) return y; } return near; };
    const fill = (x, z, from, to, b) => { for (let y = from; y <= to; y++) put(x, y, z, b); };
    const order = ['road', 'lamp', 'well', 'farm', 'small', 'big', 'job'];
    for (const p of [...v.pieces].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))) {
      if (!touches(p)) continue;
      if (p.kind === 'road') {
        for (let x = Math.max(p.x0, x0); x <= Math.min(p.x1, x0 + 15); x++) for (let z = Math.max(p.z0, z0); z <= Math.min(p.z1, z0 + 15); z++) {
          const y = top(x, z, landAt(w, x, z).h), g = get(x, y, z) & 0xFFF;
          // over water a plank bridge; on land a path, with what grew on it cleared
          put(x, y, z, g === ID.water ? B(st.flat) : B('dirt_path'));
          for (let k = 1; k <= 3; k++) { const a = get(x, y + k, z); if (a && (BLOCKS[a & 0xFFF].replace || BLOCKS[a & 0xFFF].shape === 'cross' || BLOCKS[a & 0xFFF].shape === 'tall' || (a & 0xFFF) === ID.snow)) put(x, y + k, z, 0); }
        }
        continue;
      }
      if (p.kind === 'lamp') {
        if (!inside(p.x0, p.z0)) continue;
        const y = top(p.x0, p.z0, landAt(w, p.x0, p.z0).h);
        fill(p.x0, p.z0, y + 1, y + 2, B(st.fence)); put(p.x0, y + 3, p.z0, B('torch'));
        continue;
      }
      const y = p.y, H = 4, mx = (p.x0 + p.x1) / 2, mz = (p.z0 + p.z1) / 2;
      for (let x = Math.max(p.x0, x0); x <= Math.min(p.x1, x0 + 15); x++) for (let z = Math.max(p.z0, z0); z <= Math.min(p.z1, z0 + 15); z++) {
        // the ground made up to the floor, and room above it
        const g = top(x, z, y);
        if (g < y) fill(x, z, g + 1, y - 1, B(p.kind === 'farm' ? 'dirt' : st.base));
        fill(x, z, y + 1, y + (p.kind === 'farm' ? 3 : H + 5), 0);
        const edge = x === p.x0 || x === p.x1 || z === p.z0 || z === p.z1, corner = (x === p.x0 || x === p.x1) && (z === p.z0 || z === p.z1);
        if (p.kind === 'well') {
          // a ring at the bottom and a low wall round three by three of water; posts at the corners, a roof of slabs
          const water = Math.abs(x - mx) <= 1 && Math.abs(z - mz) <= 1;
          fill(x, z, y - 4, y, water ? B('water') : B('cobblestone'));
          if (water) put(x, y - 4, z, B('cobblestone'));
          if (edge && !corner) put(x, y + 1, z, B('cobblestone'));
          if (corner) fill(x, z, y + 1, y + 3, B(st.fence));
          put(x, y + 4, z, B('cobblestone_slab'));
          continue;
        }
        if (p.kind === 'farm') {
          // a frame of logs (the composter in it by the road); inside, wet farmland and crops along a channel of
          // water down the long middle
          const ns = p.door === 0 || p.door === 2, across = ns ? z : x, mid = ns ? mz : mx;
          const [ddx, ddz] = DIRS[p.door], byRoad = ns ? z === (ddz > 0 ? p.z1 : p.z0) && x === mx : x === (ddx > 0 ? p.x1 : p.x0) && z === mz;
          if (byRoad) put(x, y, z, B('composter'));
          else if (edge) put(x, y, z, B(st.post));
          else if (across === mid) put(x, y, z, B('water'));
          else { put(x, y, z, withMeta(ID.farmland, 1)); const crop = ['wheat', 'carrots', 'potatoes'][Math.floor(hash(seed + 17, p.x0, 0, p.z0) * 3)]; put(x, y + 1, z, withMeta(ID[crop], 2 + Math.floor(hash(seed, x, y, z) * 6))); }
          continue;
        }
        // a house or a work place: a floor, walls with log corners, windows, the door, a roof
        put(x, y, z, edge ? B(st.base) : B(st.flat));
        if (edge) {
          const [ddx, ddz] = DIRS[p.door], doorX = ddx ? (ddx > 0 ? p.x1 : p.x0) : Math.round(mx), doorZ = ddz ? (ddz > 0 ? p.z1 : p.z0) : Math.round(mz);
          const isDoor = x === doorX && z === doorZ;
          for (let k = 1; k <= H - 1; k++) {
            let b = corner ? B(st.post) : B(st.wall);
            if (isDoor && k <= 2) b = withMeta(B(st.door), p.door | (k === 2 ? 8 : 0));
            else if (!corner && k === 2 && ((x + z) & 1) === 0) b = B('glass_pane');
            put(x, y + k, z, b);
          }
          put(x, y + H, z, corner ? B(st.post) : B(st.wall));
        }
      }
      // the well's bell beside it; a farm has no more
      if (p.kind === 'well') { if (inside(p.x1 + 1, p.z1 + 1)) put(p.x1 + 1, top(p.x1 + 1, p.z1 + 1, y) + 1, p.z1 + 1, B('bell')); continue; }
      if (p.kind === 'farm') continue;
      drawRoof(p, y + H, st, put, get, x0, z0);
      // inside: beds, a crafting table, the work block, a torch
      const ix = p.x0 + 1, iz = p.z0 + 1, jx = p.x1 - 1, jz = p.z1 - 1, [ddx, ddz] = DIRS[p.door];
      // the far side from the door
      const back = ddx ? (ddx > 0 ? [ix, null] : [jx, null]) : (ddz > 0 ? [null, iz] : [null, jz]);
      if (p.kind === 'small' || p.kind === 'big') {
        const beds = p.kind === 'big' ? 2 : 1;
        for (let k = 0; k < beds; k++) {
          // the head against the back wall
          const f = (p.door + 2) % 4, [fx, fz] = DIRS[f];
          const hx = back[0] ?? (ix + k * 2), hz = back[1] ?? (iz + k * 2);
          put(hx - fx, y + 1, hz - fz, withMeta(B(st.bed), f)); put(hx, y + 1, hz, withMeta(B(st.bed), f | 4));
        }
        put(back[0] ?? jx, y + 1, back[1] ?? jz, B('crafting_table'));
      } else if (p.kind === 'job') {
        const wx = back[0] ?? Math.round(mx), wz = back[1] ?? Math.round(mz), block = B(WORK[p.prof]);
        put(wx, y + 1, wz, BLOCKS[block].facing ? withMeta(block, p.door) : block);
        if (p.prof === 'librarian') { put(ix, y + 1, iz, B('bookshelf')); put(jx, y + 1, jz, B('bookshelf')); }
        if (p.prof === 'shepherd') put(ix, y + 1, iz, B('white_wool'));
      }
      { const tz = p.door === 0 ? p.z0 + 1 : p.z1 - 1, tx = Math.round(mx); put(tx, y + 3, tz, withMeta(B('torch'), p.door === 0 ? 4 : 3)); }
    }
  }
  // the heights changed
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { let y = col.height[z * 16 + x] + 12; while (y > -64 && !getBlock(col, x, y, z)) y--; col.height[z * 16 + x] = Math.max(col.height[z * 16 + x], y); }
}
/** A roof: stairs falling both ways from a ridge along the long side (the overhang one block out), or a flat one. */
function drawRoof(p, y, st, put, get, x0, z0) {
  const B = n => ID[n];
  if (!st.roof) {
    for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) {
      put(x, y + 1, z, B(st.flat));
      if (st.parapet && (x === p.x0 || x === p.x1 || z === p.z0 || z === p.z1)) put(x, y + 2, z, B(st.wall));
      if (st.snow) put(x, y + 2, z, ID.snow);
    }
    return;
  }
  const alongX = p.x1 - p.x0 >= p.z1 - p.z0;
  const a0 = alongX ? p.z0 - 1 : p.x0 - 1, a1 = alongX ? p.z1 + 1 : p.x1 + 1, l0 = alongX ? p.x0 - 1 : p.z0 - 1, l1 = alongX ? p.x1 + 1 : p.z1 + 1;
  for (let k = 0; a0 + k <= a1 - k; k++) {
    const lo = a0 + k, hi = a1 - k, yy = y + k;
    for (let t = l0; t <= l1; t++) {
      const at = (s, b) => alongX ? put(t, yy, s, b) : put(s, yy, t, b);
      if (lo === hi) at(lo, B(st.ridge));
      else { at(lo, withMeta(B(st.roof), alongX ? 0 : 3)); at(hi, withMeta(B(st.roof), alongX ? 2 : 1)); }
      if (st.snow) { if (lo === hi) (alongX ? put(t, yy + 1, lo, ID.snow) : put(lo, yy + 1, t, ID.snow)); }
      // the gable ends filled in under the slope
      if ((t === l0 + 1 || t === l1 - 1) && k > 0) for (let s = lo + 1; s < hi; s++) at(s, B(st.wall));
    }
  }
}

/** Who lives in the village parts whose middle is in a column: [[kind, x, y, z, extra]] (villagers, the iron golem). */
export function villagersIn(seed, cx, cz) {
  const out = [], x0 = cx * 16, z0 = cz * 16;
  for (const v of villagesNear(seed, x0 + 8, z0 + 8)) for (const p of v.pieces) {
    const mx = Math.floor((p.x0 + p.x1) / 2), mz = Math.floor((p.z0 + p.z1) / 2);
    if (mx < x0 || mx >= x0 + 16 || mz < z0 || mz >= z0 + 16) continue;
    const at = (dx = 0, dz = 0) => [mx + 0.5 + dx, p.y + 1, mz + 0.5 + dz], home = [v.x, v.y, v.z];
    if (p.kind === 'well') { out.push(['iron_golem', v.x + 0.5, p.y + 1, v.z + 3.5, {home}]); out.push(['villager', ...at(3, -3), {home, prof: 'nitwit'}]); }
    if (p.kind === 'small') out.push(['villager', ...at(), {home}]);
    if (p.kind === 'big') out.push(['villager', ...at(-1), {home}], ['villager', ...at(1), {home}]);
    if (p.kind === 'job') out.push(['villager', ...at(), {home, prof: p.prof}]);
    if (p.kind === 'farm') out.push(['villager', mx + 0.5, p.y + 1, mz + 0.5, {home, prof: 'farmer'}]);
  }
  return out;
}
/** The village nearest a point within reach (villagers and the golem keep near it): {x, y, z} or null. */
export function villageNear(seed, x, z, reach = 96) {
  let best = null, bd = reach;
  for (const v of villagesNear(seed, x, z)) { const d = Math.hypot(v.x - x, v.z - z); if (d < bd) { bd = d; best = {x: v.x, y: v.y, z: v.z}; } }
  return best;
}
/** Where villages are around a point (for finding one): [{x, y, z, style}]. */
export function villagesAround(seed, x, z) {
  const rx = Math.floor(x / REGION), rz = Math.floor(z / REGION), out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const v = villageIn(seed, rx + dx, rz + dz); if (v) out.push({x: v.x, y: v.y, z: v.z, style: v.style}); }
  return out;
}
