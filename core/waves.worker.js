// Draws the phone's bar's sound waves off the page's thread (floating-waves.js). Told what the bar is doing and which waves
// went out, it goes on by itself until they have faded: other plugins keeping the page busy cannot slow it.
import {clearWaves, paintWaves} from './floating-waves.js';

const ripples = [];
let ctx = null, st = null, waiting = false, painted = false;

function nextFrame() {
  if (waiting) return;
  waiting = true;
  if (self.requestAnimationFrame) self.requestAnimationFrame(draw); else setTimeout(draw, 16);
}
function draw() {
  waiting = false;
  if (!ctx || !st) return;
  const drawing = paintWaves(ctx, st, ripples, performance.now());
  if (!drawing && painted) clearWaves(ctx);
  painted = drawing;
  if (drawing) nextFrame();
}
self.onmessage = ({data}) => {
  if (data.canvas) {
    ctx = data.canvas.getContext('2d');
    if (!ctx) self.postMessage('no canvas');
    return;
  }
  st = data.state;
  for (const wave of data.ripples) ripples.push({amp: wave.amp, kind: wave.kind, t0: performance.now()});
  nextFrame();
};
