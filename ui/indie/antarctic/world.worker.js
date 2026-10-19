// 南极结界 · the world in the background: preparing the scene and lighting it for the hour happen here, so the game
// never stops while the light changes. The page asks: {id, type: 'prepare', season} or {id, type: 'light', hour};
// the answers carry the arrays (the lit ones are handed over without copying).
import {prepare, lightSteps} from './farm.js';

const scenes = {}; // each outdoor map, prepared for its season
self.onmessage = e => {
  const {id, type} = e.data;
  try {
    if (type === 'prepare') {
      const map = e.data.map || 'farm', S = scenes[map] = prepare({map, without: ['hero'], season: e.data.season});
      const {W, H, F, owner, solid, mat, wd, door, bin, mailbox, chimney, fall, river, tideE, spots, cliffFoot} = S;
      // copies (the worker keeps its own for lighting)
      self.postMessage({id, map, W, H, F: F.slice(), owner: owner.slice(), solid, mat: mat.slice(), wd, door, bin, mailbox, chimney, fall, river, tideE, spots, cliffFoot});
    } else if (type === 'light') {
      const S = scenes[e.data.map || 'farm'];
      for (const _ of lightSteps(S, e.data.hour, {live: true, extra: e.data.extra || []})) { /* run to the end */ }
      const {px, light, shadow, sun, lamps} = S;
      S.px = S.light = S.shadow = null;
      self.postMessage({id, px, light, shadow, sun, lamps}, [px.buffer, light.buffer, shadow.buffer]);
    }
  } catch (error) { self.postMessage({id, error: String(error?.stack || error)}); }
};
