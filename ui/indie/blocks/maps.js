// Maps. An empty map used becomes the map of the land round where it was used: 128 × 128 blocks on the game's grid,
// drawn in as its holder walks over it with the map in hand (one block a pixel, the game's colours, brighter where the
// land rises to the north and the sea darker where it is deep). A treasure map (from a shipwreck's or a ruin's chest)
// shows the coast round a buried treasure, two blocks a pixel, with a red X where to dig. Held in the main hand a map
// shows at the bottom of the screen with a white mark for where its holder is. Maps live in the world's save; a stack
// carries its map's number.
import {BLOCKS, ID, MINY} from './blocks.js';
import {landAt, worldOf, BIOMES} from './gen.js';

// the game's map colours: a pixel is base × 4 + shade (0 darker, 1 as is, 2 brighter, 3 darkest); 0 is not drawn yet
const BASE = [null, [127, 178, 56], [247, 233, 163], [199, 199, 199], [255, 0, 0], [160, 160, 255], [167, 167, 167], [0, 124, 0], [255, 255, 255], [164, 168, 184],
  [151, 109, 77], [112, 112, 112], [64, 64, 255], [143, 119, 72], [255, 252, 245], [216, 127, 51], [178, 76, 216], [102, 153, 216], [229, 229, 51], [127, 204, 25],
  [242, 127, 165], [76, 76, 76], [153, 153, 153], [76, 127, 153], [127, 63, 178], [51, 76, 178], [102, 76, 51], [102, 127, 51], [153, 51, 51], [25, 25, 25],
  [250, 238, 77], [92, 219, 213], [74, 128, 255], [0, 217, 58], [129, 86, 49], [112, 2, 0], [209, 177, 161], [100, 100, 100]];
const SHADE = [180, 220, 255, 135];
const GRASS = 1, SAND = 2, FIRE = 4, ICE = 5, PLANT = 7, SNOW = 8, STONE = 11, WATER = 12;
// a treasure map's own colours (the game draws these from the land's kind, not its blocks)
const T_LAND = 200, T_COAST = 201, T_WATER = 202, T_STRIPE = 203;
const TREASURE_RGB = {[T_LAND]: [196, 152, 98], [T_COAST]: [122, 85, 48], [T_WATER]: null, [T_STRIPE]: [190, 166, 120]};
const PAPER = [230, 214, 168];

const toB64 = a => { let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); };
const fromB64 = s => { try { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); } catch { return new Uint8Array(16384); } };

export class Maps {
  /** saved: what toJSON gave; blockColor(id): a block's average colour [r, g, b] (from its picture), for its map colour. */
  constructor(saved = null, blockColor = () => [112, 112, 112]) {
    this.list = new Map(); this.next = saved?.next || 1; this.blockColor = blockColor; this.bases = new Map(); this.step = 0;
    for (const m of saved?.list || []) this.list.set(m.id, {...m, px: fromB64(m.px)});
  }
  toJSON() { return {next: this.next, list: [...this.list.values()].map(m => ({...m, px: toB64(m.px)}))}; }
  get(id) { return this.list.get(id) || null; }
  /** A new map, on the game's grid round (x, z): {id, x, z (its middle), scale, dim, kind, target, px}. */
  add(x, z, dim, scale, kind = 'map', target = null) {
    const size = 128 << scale, cx = Math.floor((x + 64) / size) * size + size / 2 - 64, cz = Math.floor((z + 64) / size) * size + size / 2 - 64;
    const m = {id: this.next++, x: cx, z: cz, scale, dim, kind, target, px: new Uint8Array(16384)};
    this.list.set(m.id, m);
    return m;
  }
  /** An empty map used at (x, z): the stack of the new map. */
  make(x, z, dim) { const m = this.add(x, z, dim, 0); return {id: 'filled_map', n: 1, map: m.id, label: `地图 #${m.id}`}; }
  /**
   * A treasure map for a chest: the coast round a buried treasure (target {x, z}) drawn from the land's kinds (sea or
   * land, the coast darker, the sea striped), its stack. seed: the world's.
   */
  treasure(seed, target) {
    const m = this.add(target.x, target.z, 'overworld', 1, 'treasure', [target.x, target.z]), w = worldOf(seed), k = 2;
    const sea = new Uint8Array(130 * 130);
    for (let py = -1; py <= 128; py++) for (let px = -1; px <= 128; px++) {
      const name = BIOMES[landAt(w, m.x - 128 + px * k, m.z - 128 + py * k).biome].name;
      sea[(py + 1) * 130 + px + 1] = name.endsWith('ocean') || name.endsWith('river') ? 1 : 0;
    }
    for (let py = 0; py < 128; py++) for (let px = 0; px < 128; px++) {
      const at = (dx, dy) => sea[(py + 1 + dy) * 130 + px + 1 + dx];
      m.px[py * 128 + px] = at(0, 0) ? (py % 4 === 0 && (px + (py >> 2)) % 2 === 0 ? T_STRIPE : T_WATER) : at(1, 0) || at(-1, 0) || at(0, 1) || at(0, -1) ? T_COAST : T_LAND;
    }
    return {id: 'filled_map', n: 1, map: m.id, label: '藏宝图'};
  }
  /** A block's map colour (the game's for the common ones; the others the nearest to their picture's colour). */
  baseOf(id) {
    if (this.bases.has(id)) return this.bases.get(id);
    const b = BLOCKS[id], n = b.name;
    let base = n === 'water' || b.water ? WATER : n === 'grass_block' ? GRASS : /_leaves$|^vine$|^lily_pad$/.test(n) || b.shape === 'cross' ? PLANT
      : /^sand$|sandstone|^birch_|^end_stone/.test(n) ? SAND : /^snow|powder_snow/.test(n) ? SNOW : /ice$/.test(n) ? ICE : /^lava$|^fire$/.test(n) ? FIRE : 0;
    if (!base) {
      const [r, g, bl] = this.blockColor(id) || [112, 112, 112];
      let best = STONE, bd = Infinity;
      BASE.forEach((c, i) => { if (!c || i === WATER || i === FIRE) return; const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - bl) ** 2; if (d < bd) { bd = d; best = i; } });
      base = best;
    }
    this.bases.set(id, base);
    return base;
  }
  /**
   * Draws in a little of a map round its holder at (x, z) (each call one in eight of the columns in reach, the game's
   * way): get(x, y, z) and top(x, z) read the loaded world (top: the highest block, or null where nothing is loaded).
   */
  explore(m, x, z, get, top) {
    if (m.kind !== 'map') return false;
    const k = 1 << m.scale, cx = Math.floor((x - m.x) / k) + 64, cz = Math.floor((z - m.z) / k) + 64, reach = 64 / k;
    const step = this.step = (this.step + 1) & 7;
    let changed = false;
    for (let px = Math.max(0, cx - reach); px < Math.min(128, cx + reach); px++) {
      if ((px & 7) !== step) continue;
      let prev = null;
      for (let py = Math.max(0, cz - reach - 1); py < Math.min(128, cz + reach); py++) {
        if ((px - cx) ** 2 + (py - cz) ** 2 > reach * reach) { prev = null; continue; }
        const wx = m.x - 64 * k + px * k, wz = m.z - 64 * k + py * k, h = top(wx, wz);
        if (h == null) { prev = null; continue; }
        let y = h, v = get(wx, y, wz);
        while (y > MINY && (!v || BLOCKS[v & 0xFFF].shape === 'none')) v = get(wx, --y, wz);
        const id = v & 0xFFF, base = this.baseOf(id);
        let shade = 1;
        if (base === WATER) {
          // deeper is darker, a little checkered
          let d = 0;
          while (d < 12 && (get(wx, y - d - 1, wz) & 0xFFF) === ID.water) d++;
          const f = d * 0.1 + ((px + py) & 1) * 0.2;
          shade = f < 0.5 ? 2 : f > 0.9 ? 0 : 1;
        } else if (prev != null) {
          // higher than the pixel to the north is brighter, lower darker
          const f = (y - prev) * 4 / (k + 4) + (((px + py) & 1) - 0.5) * 0.4;
          shade = f > 0.6 ? 2 : f < -0.6 ? 0 : 1;
        }
        prev = y;
        const val = base * 4 + shade;
        if (py >= 0 && m.px[py * 128 + px] !== val) { m.px[py * 128 + px] = val; changed = true; }
      }
    }
    return changed;
  }
  /** Paints a map on a 128 × 128 canvas: the paper, what is drawn, the X of a treasure and the holder's mark. */
  paint(g, m, holder) {
    const img = g.createImageData(128, 128), d = img.data;
    for (let i = 0; i < 16384; i++) {
      const v = m.px[i];
      let c = PAPER;
      if (v >= T_LAND) c = TREASURE_RGB[v] || PAPER;
      else if (v) { const b = BASE[v >> 2], s = SHADE[v & 3]; c = b ? [b[0] * s / 255, b[1] * s / 255, b[2] * s / 255] : PAPER; }
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const k = 1 << m.scale, pos = (x, z) => [(x - m.x) / k + 64, (z - m.z) / k + 64];
    if (m.target) {
      const [tx, ty] = pos(m.target[0], m.target[1]);
      g.strokeStyle = '#b01818'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(tx - 4, ty - 4); g.lineTo(tx + 4, ty + 4); g.moveTo(tx + 4, ty - 4); g.lineTo(tx - 4, ty + 4); g.stroke();
    }
    if (holder && holder.dim === m.dim) {
      const [hx, hy] = pos(holder.x, holder.z), inside = hx >= 0 && hx < 128 && hy >= 0 && hy < 128;
      g.save(); g.translate(Math.max(2, Math.min(126, hx)), Math.max(2, Math.min(126, hy)));
      g.fillStyle = '#ffffff'; g.strokeStyle = '#202020'; g.lineWidth = 1;
      if (inside) {
        // an arrow the way the holder looks (yaw 0 looks north, up the map)
        g.rotate(-holder.yaw);
        g.beginPath(); g.moveTo(0, -4.5); g.lineTo(3.2, 3.5); g.lineTo(0, 1.8); g.lineTo(-3.2, 3.5); g.closePath(); g.fill(); g.stroke();
      } else { g.beginPath(); g.arc(0, 0, 2.2, 0, Math.PI * 2); g.fill(); g.stroke(); }
      g.restore();
    }
  }
}
