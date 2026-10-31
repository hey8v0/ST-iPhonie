// The sound waves beside the phone's bar: arcs out of its edge, rings round the block, a glow breathing with the voice
// behind the bar, and while it is carried a glow on the edge it would go to. The same drawing on the page's thread and in
// the worker (waves.worker.js), where however busy the page is they keep going.
export const WAVES_W = 132, WAVES_H = 180;

export function clearWaves(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** One frame for what the bar is doing (st), taking out the waves that have finished. False when nothing is left to draw:
 *  nothing is painted then, and the caller clears what it painted before. */
export function paintWaves(ctx, st, ripples, now) {
  const {dpr, docked, carried, launching, glowing, v, rgb, right, left, x, w, h, r} = st;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const wave = ripples[i];
    if (now - wave.t0 >= (wave.kind === 'arc' ? 1300 : 1050) || (wave.kind === 'arc') !== docked || carried || launching) ripples.splice(i, 1);
  }
  if (!ripples.length && !glowing) return false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, WAVES_W, WAVES_H);
  const edge = right ? WAVES_W : 0, cy = WAVES_H / 2, cx = x - left;
  const radial = (at, radius, alpha) => {
    const fill = ctx.createRadialGradient(at, cy, 2, at, cy, radius);
    fill.addColorStop(0, `rgba(${rgb},${alpha})`);
    fill.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, WAVES_W, WAVES_H);
  };
  if (carried) radial(edge, 80, .3);
  else if (glowing) radial(cx, 30 + v * 28, .18 + v * .32);
  ctx.lineCap = 'round';
  for (const wave of ripples) {
    const a = (now - wave.t0) / (wave.kind === 'arc' ? 1300 : 1050), e = 1 - Math.pow(1 - a, 2.4), fade = Math.pow(1 - a, 1.6) * (.38 + .5 * wave.amp);
    if (wave.kind === 'arc') {
      // An arc whose two ends fade out, so each wave reads as sound rather than a drawn line.
      const radius = 14 + e * (50 + 22 * wave.amp), span = .55 + .3 * wave.amp, from = right ? Math.PI - span : -span, to = from + span * 2;
      let paint = `rgba(${rgb},${fade})`;
      if (ctx.createConicGradient) {
        const f = (to - from) / (Math.PI * 2);
        paint = ctx.createConicGradient(from, edge, cy);
        paint.addColorStop(0, `rgba(${rgb},0)`);
        paint.addColorStop(f * .32, `rgba(${rgb},${fade})`);
        paint.addColorStop(f * .68, `rgba(${rgb},${fade})`);
        paint.addColorStop(f, `rgba(${rgb},0)`);
        paint.addColorStop(1, `rgba(${rgb},0)`);
      }
      ctx.strokeStyle = paint;
      ctx.lineWidth = 1.2 + 2.5 * (1 - a) * (.6 + .4 * wave.amp);
      ctx.beginPath();
      ctx.arc(edge, cy, radius, from, to);
      ctx.stroke();
    } else {
      const grow = e * 18, ww = w + grow * 2, hh = h + grow * 2;
      ctx.strokeStyle = `rgba(${rgb},${fade})`;
      ctx.lineWidth = 1 + 2 * (1 - a);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - ww / 2, cy - hh / 2, ww, hh, r + grow); else ctx.rect(cx - ww / 2, cy - hh / 2, ww, hh);
      ctx.stroke();
    }
  }
  return true;
}
