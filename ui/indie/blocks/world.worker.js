// The worker that makes and keeps the world (world.js): the page tells it where the player is and what the player
// changed; it answers with columns (blocks and light), meshes, drops and sounds.
import {World} from './world.js';
import {openStore} from './db.js';
import {BY_NAME} from './blocks.js';

let world = null;
const post = (msg, transfer = []) => postMessage(msg, transfer);
const yieldNow = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = r; ch.port2.postMessage(0); });

onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const store = m.worldId ? await openStore(m.worldId, BY_NAME) : null;
      world = new World({seed: m.seed, tex: name => m.layers[name] ?? 0, post, store, radius: m.radius, worldId: m.worldId});
      world.center = m.center;
      world.wave = m.wave !== false;
      setInterval(() => world.step(), 50);
      setInterval(() => world.flush().catch(err => post({type: 'error', message: String(err?.message || err)})), 15000);
      loop();
    } else if (!world) return;
    else if (m.type === 'center') { world.center = [m.cx, m.cz]; if (m.radius) world.radius = m.radius; }
    else if (m.type === 'set') { world.set(m.x, m.y, m.z, m.v); world.ack = m.seq; }
    else if (m.type === 'day') { world.dayDark = m.dark; world.snowing = !!m.snow; }
    else if (m.type === 'explode') { const r = world.explode(m.x, m.y, m.z, m.power); post({type: 'exploded', id: m.id, ...r}); }
    else if (m.type === 'meal') post({type: 'meal', x: m.x, y: m.y, z: m.z, took: world.meal(m.x, m.y, m.z)});
    else if (m.type === 'flush') { await world.flush(); post({type: 'flushed', id: m.id}); }
    else if (m.type === 'remesh') { world.wave = m.wave !== false; for (const c of world.cols.values()) for (let si = 0; si < c.sections.length; si++) if (c.sections[si]) world.dirty.add(c.k * 32 + si); }
  } catch (err) { post({type: 'error', message: String(err?.message || err)}); }
};
async function loop() {
  for (;;) {
    let more = false;
    try { more = await world.work(); } catch (err) { post({type: 'error', message: String(err?.stack || err)}); }
    if (more) await yieldNow(); else await new Promise(r => setTimeout(r, 40));
  }
}
