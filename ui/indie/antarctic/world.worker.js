// 南极结界 · the world in the background: preparing the scene and lighting it for the hour happen here, so the game
// never stops while the light changes. The page asks: {id, type: 'prepare', season} or {id, type: 'light', hour};
// the answers carry the arrays (the lit ones are handed over without copying).
import {prepare, lightSteps} from './farm.js';

let S = null;
self.onmessage = e => {
  const {id, type} = e.data;
  try {
    if (type === 'prepare') {
      S = prepare({without: ['hero'], season: e.data.season});
      const {F, owner, solid, mat, wd, door, bin, mailbox, chimney, fall} = S;
      // copies (the worker keeps its own for lighting)
      self.postMessage({id, F: F.slice(), owner: owner.slice(), solid, mat: mat.slice(), wd, door, bin, mailbox, chimney, fall});
    } else if (type === 'light') {
      for (const _ of lightSteps(S, e.data.hour, {live: true})) { /* run to the end */ }
      const {px, light, shadow, sun, lamps} = S;
      S.px = S.light = S.shadow = null;
      self.postMessage({id, px, light, shadow, sun, lamps}, [px.buffer, light.buffer, shadow.buffer]);
    }
  } catch (error) { self.postMessage({id, error: String(error?.stack || error)}); }
};
