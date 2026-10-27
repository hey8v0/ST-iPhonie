// The page's copy of the world near the player (blocks and light), kept from the worker's columns. The player's own
// changes show here at once and stay over older copies from the worker until it has taken them in.
import {MINY, HEIGHT} from './blocks.js';

const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
export class Mirror {
  constructor() { this.cols = new Map(); this.pending = new Map(); this.seq = 0; }
  column(m) {
    this.cols.set(key(m.cx, m.cz), {cx: m.cx, cz: m.cz, sections: m.sections, light: m.light, topSec: m.topSec, biome: m.biome, height: m.height});
    // what the worker has taken in is no longer pending; the rest goes back over the new copy
    for (const [k, p] of this.pending) {
      if (p.seq <= m.ack) { this.pending.delete(k); continue; }
      if (p.x >> 4 === m.cx && p.z >> 4 === m.cz) this.write(p.x, p.y, p.z, p.v);
    }
  }
  drop(cx, cz) { this.cols.delete(key(cx, cz)); }
  has(x, z) { return this.cols.has(key(x >> 4, z >> 4)); }
  get(x, y, z) {
    if (y < MINY || y >= MINY + HEIGHT) return 0;
    const c = this.cols.get(key(x >> 4, z >> 4));
    if (!c) return 0;
    const s = c.sections[(y - MINY) >> 4];
    return s ? s[((y - MINY) & 15) << 8 | (z & 15) << 4 | (x & 15)] : 0;
  }
  /** Light at a block: [sky, block] levels. */
  light(x, y, z) {
    if (y >= MINY + HEIGHT) return [15, 0];
    const c = this.cols.get(key(x >> 4, z >> 4));
    if (!c || y < MINY) return [15, 0];
    const si = (y - MINY) >> 4, s = c.light[si];
    const l = s ? s[((y - MINY) & 15) << 8 | (z & 15) << 4 | (x & 15)] : si > c.topSec ? 0xF0 : 0;
    return [l >> 4, l & 15];
  }
  biome(x, z) { const c = this.cols.get(key(x >> 4, z >> 4)); return c ? c.biome[(z & 15) * 16 + (x & 15)] : 0; }
  write(x, y, z, v) {
    const c = this.cols.get(key(x >> 4, z >> 4));
    if (!c) return;
    const si = (y - MINY) >> 4;
    let s = c.sections[si];
    if (!s) { if (!v) return; s = c.sections[si] = new Uint16Array(4096); }
    s[((y - MINY) & 15) << 8 | (z & 15) << 4 | (x & 15)] = v;
  }
  /** The player's change: here now, and a message for the worker. */
  set(x, y, z, v) {
    this.write(x, y, z, v);
    const seq = ++this.seq;
    this.pending.set(`${x},${y},${z}`, {x, y, z, v, seq});
    return {type: 'set', x, y, z, v, seq};
  }
}
