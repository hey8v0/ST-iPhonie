// 视觉小说 effects drawn on a canvas over the stage: weather that stays (rain, snow, petals, leaves, stars, fireflies,
// embers) and light that comes and goes around whoever speaks (glints of warm light, soft bokeh). Nothing runs while
// nothing shows: the frame loop stops when the sky is clear and the last particle is gone. On a phone (lite) the canvas
// is drawn at its CSS size and with fewer particles.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
/** How many of each at 1920×1080; fewer on a phone, a few more on a big screen. */
const COUNT = {rain: 170, snow: 110, petals: 34, leaves: 26, stars: 90, fireflies: 26, embers: 42};

const KINDS = {
  rain: {
    make: (w, h, fill) => ({x: rand(-0.1 * w, 1.15 * w), y: fill ? rand(-h, h) : rand(-h * 0.3, -10), len: rand(14, 28), v: rand(950, 1350), a: rand(0.25, 0.55)}),
    move: (p, dt) => { p.y += p.v * dt; p.x -= p.v * 0.16 * dt; },
    out: (p, w, h) => p.y - p.len > h,
    // All the drops in one path: one stroke a frame instead of one a drop.
    drawAll(g, list) { g.strokeStyle = 'rgba(200,218,255,.42)'; g.lineWidth = 1.2; g.beginPath(); for (const p of list) { g.moveTo(p.x, p.y); g.lineTo(p.x + p.len * 0.16, p.y - p.len); } g.stroke(); },
  },
  snow: {
    make: (w, h, fill) => ({x: rand(0, w), y: fill ? rand(-h, h) : rand(-60, -6), r: rand(1.4, 4.2), v: rand(28, 80), t: rand(0, TAU), sway: rand(14, 40)}),
    move: (p, dt) => { p.t += dt * 1.3; p.y += p.v * dt; p.x += Math.sin(p.t) * p.sway * dt; },
    out: (p, w, h) => p.y - p.r > h,
    drawAll(g, list) { g.fillStyle = 'rgba(255,255,255,.78)'; g.beginPath(); for (const p of list) { g.moveTo(p.x + p.r, p.y); g.arc(p.x, p.y, p.r, 0, TAU); } g.fill(); },
  },
  petals: {
    make: (w, h, fill) => ({x: rand(-0.2 * w, w), y: fill ? rand(-h, h) : rand(-60, -10), s: rand(5, 10), vx: rand(25, 70), vy: rand(40, 90), r: rand(0, TAU), vr: rand(-2, 2), t: rand(0, TAU), hue: rand(330, 350), light: rand(82, 92)}),
    move: (p, dt) => { p.t += dt * 2.2; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; },
    out: (p, w, h) => p.y - p.s > h || p.x - p.s > w,
    draw(g, p) { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.abs(Math.cos(p.t)) * 0.7 + 0.3); g.fillStyle = `hsla(${p.hue},85%,${p.light}%,.9)`; g.beginPath(); g.ellipse(0, 0, p.s, p.s * 0.6, 0, 0, TAU); g.fill(); g.restore(); },
  },
  leaves: {
    make: (w, h, fill) => ({x: rand(-0.2 * w, w), y: fill ? rand(-h, h) : rand(-60, -10), s: rand(7, 13), vx: rand(30, 80), vy: rand(50, 100), r: rand(0, TAU), vr: rand(-2.5, 2.5), t: rand(0, TAU), hue: rand(18, 42)}),
    move: (p, dt) => { p.t += dt * 1.8; p.x += (p.vx + Math.sin(p.t) * 30) * dt; p.y += p.vy * dt; p.r += p.vr * dt; },
    out: (p, w, h) => p.y - p.s > h || p.x - p.s > w,
    draw(g, p) { g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.abs(Math.cos(p.t)) * 0.6 + 0.4); g.fillStyle = `hsla(${p.hue},72%,48%,.9)`; g.beginPath(); g.moveTo(-p.s, 0); g.quadraticCurveTo(0, -p.s * 0.7, p.s, 0); g.quadraticCurveTo(0, p.s * 0.7, -p.s, 0); g.fill(); g.restore(); },
  },
  stars: {
    // Stars stay where they are and twinkle; they go out one by one when the sky changes.
    make: (w, h) => ({x: rand(0, w), y: rand(0, h * 0.62), r: rand(0.5, 1.8), t: rand(0, TAU), v: rand(1.2, 3), life: 1}),
    move: (p, dt, on) => { p.t += p.v * dt; if (!on) p.life -= dt * rand(0.3, 1.2); },
    out: p => p.life <= 0,
    draw(g, p) { const a = Math.max(0, (0.45 + Math.sin(p.t) * 0.45) * p.life); g.fillStyle = `rgba(255,250,230,${a})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); if (p.r > 1.4) { g.fillStyle = `rgba(255,250,230,${a * 0.25})`; g.beginPath(); g.arc(p.x, p.y, p.r * 3, 0, TAU); g.fill(); } },
  },
  fireflies: {
    make: (w, h) => ({x: rand(0, w), y: rand(h * 0.25, h), t: rand(0, TAU), vx: rand(-20, 20), vy: rand(-14, 14), r: rand(1.6, 3), life: 1}),
    move: (p, dt, on, w, h) => { p.t += dt * 2; p.x += (p.vx + Math.sin(p.t * 0.7) * 16) * dt; p.y += (p.vy + Math.cos(p.t * 0.5) * 12) * dt; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < h * 0.15 || p.y > h) p.vy *= -1; if (!on) p.life -= dt * 0.6; },
    out: p => p.life <= 0,
    draw(g, p) { const a = Math.max(0, (0.5 + Math.sin(p.t * 1.7) * 0.5) * p.life), grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6); grd.addColorStop(0, `rgba(230,255,140,${a})`); grd.addColorStop(1, 'rgba(230,255,140,0)'); g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, p.r * 6, 0, TAU); g.fill(); },
  },
  embers: {
    make: (w, h, fill) => ({x: rand(0, w), y: fill ? rand(h * 0.3, h * 1.1) : h + rand(0, 40), r: rand(1, 2.6), vy: rand(40, 110), t: rand(0, TAU), top: rand(h * 0.15, h * 0.6)}),
    move: (p, dt) => { p.t += dt * 3; p.y -= p.vy * dt; p.x += Math.sin(p.t) * 18 * dt; },
    out: p => p.y < p.top,
    draw(g, p) { const a = Math.min(1, (p.y - p.top) / 120) * (0.6 + Math.sin(p.t * 2) * 0.3); g.fillStyle = `rgba(255,${Math.round(150 + Math.sin(p.t) * 40)},70,${Math.max(0, a)})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); },
  },
};

/** Light, as small pictures drawn once and stamped (a gradient per particle per frame costs too much on a phone). */
const LIGHT = {warm: [255, 222, 168], white: [255, 250, 240], pink: [255, 176, 206], gold: [255, 206, 120]};
function lightSprite(doc, color, kind) {
  const c = doc.createElement('canvas'), n = 64;
  c.width = c.height = n;
  let g = null;
  try { g = c.getContext('2d'); } catch { /* none */ }
  if (!g) return null;
  const [r, gr, b] = LIGHT[color] || LIGHT.white, rgba = a => `rgba(${r},${gr},${b},${a})`;
  if (kind === 'bokeh') {
    // A soft disc, a little brighter at the rim, as an out-of-focus light.
    const d = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    d.addColorStop(0, rgba(.55)); d.addColorStop(.72, rgba(.62)); d.addColorStop(.86, rgba(.4)); d.addColorStop(1, rgba(0));
    g.fillStyle = d; g.fillRect(0, 0, n, n);
  } else if (kind === 'flare') {
    // A four-pointed glint: two thin streaks crossed over a small glow.
    const d = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    d.addColorStop(0, rgba(1)); d.addColorStop(.18, rgba(.5)); d.addColorStop(.45, rgba(0));
    g.fillStyle = d; g.fillRect(0, 0, n, n);
    for (const [w, h] of [[n, 2.2], [2.2, n]]) { const l = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); l.addColorStop(0, rgba(.95)); l.addColorStop(1, rgba(0)); g.fillStyle = l; g.fillRect((n - w) / 2, (n - h) / 2, w, h); }
  } else {
    const d = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    d.addColorStop(0, rgba(1)); d.addColorStop(.25, rgba(.55)); d.addColorStop(.6, rgba(.12)); d.addColorStop(1, rgba(0));
    g.fillStyle = d; g.fillRect(0, 0, n, n);
  }
  return c;
}

/** host: the element the canvas covers (its first child after `after`, so the text box stays on top). lite: a phone. */
export function createFx({doc, host, after = null, lite = false}) {
  const win = doc.defaultView;
  const canvas = doc.createElement('canvas');
  canvas.className = 'vn-fx';
  canvas.setAttribute('aria-hidden', 'true');
  if (after?.after) after.after(canvas); else host.append(canvas);
  let g = null, tried = false, raf = 0, w = 0, h = 0, dpr = 1, last = 0, weather = '';
  let sky = [], bits = [];
  const ctx = () => { if (!tried) { tried = true; try { g = canvas.getContext('2d'); } catch { g = null; } } return g; };
  const scale = () => Math.min(1.4, Math.max(0.45, (w * h) / (1920 * 1080))) * (lite ? 0.55 : 1);
  const sprites = new Map(), spriteOf = (color, kind) => { const key = color + kind; if (!sprites.has(key)) sprites.set(key, lightSprite(doc, color, kind)); return sprites.get(key); };
  function size() {
    dpr = lite ? 1 : Math.min(2, win.devicePixelRatio || 1);
    w = host.clientWidth || win.innerWidth; h = host.clientHeight || win.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  function run() {
    if (raf || !ctx()) return;
    size();
    last = win.performance.now();
    raf = win.requestAnimationFrame(frame);
  }
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // The sky: each one that leaves comes back while the weather lasts.
    const kinds = new Set(sky.map(p => p.kind));
    for (const kind of kinds) {
      const k = KINDS[kind], on = kind === weather;
      for (let i = 0; i < sky.length; i++) {
        const p = sky[i];
        if (p.kind !== kind) continue;
        k.move(p, dt, on, w, h);
        if (k.out(p, w, h)) { if (on && kind !== 'stars' && kind !== 'fireflies') sky[i] = {...k.make(w, h, false), kind}; else p.gone = true; }
      }
    }
    sky = sky.filter(p => !p.gone);
    g.globalCompositeOperation = 'source-over';
    for (const kind of new Set(sky.map(p => p.kind))) {
      const k = KINDS[kind], list = sky.filter(p => p.kind === kind);
      if (kind === 'fireflies') g.globalCompositeOperation = 'lighter';
      if (k.drawAll) k.drawAll(g, list); else for (const p of list) k.draw(g, p);
      g.globalCompositeOperation = 'source-over';
    }
    // The light around the speaker: it grows in and fades out, added to what is under it.
    g.globalCompositeOperation = 'lighter';
    for (const b of bits) {
      b.life -= dt / b.span;
      b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt;
      const sprite = spriteOf(b.color, b.kind);
      if (!sprite || b.life <= 0) continue;
      const a = Math.sin(Math.PI * Math.min(1, 1 - b.life)) * b.peak * (b.kind === 'flare' ? 0.75 + 0.25 * Math.sin(b.t * 7) : 1);
      g.globalAlpha = Math.max(0, a);
      const s = b.s * (b.kind === 'bokeh' ? 1 : 0.8 + 0.2 * Math.sin(b.t * 3));
      g.drawImage(sprite, b.x - s, b.y - s, s * 2, s * 2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    bits = bits.filter(b => b.life > 0);
    if (weather || sky.length || bits.length) raf = win.requestAnimationFrame(frame);
    else { raf = 0; g.clearRect(0, 0, w, h); }
  }

  return {
    /** The weather now ('' or 'clear' for none): the old one drifts away, the new one comes in. */
    weather(kind = '') {
      kind = KINDS[kind] ? kind : '';
      if (kind === weather) return;
      weather = kind;
      if (!kind) { if (sky.length) run(); return; }
      if (!ctx()) return;
      size();
      const n = Math.round(COUNT[kind] * scale());
      const have = sky.filter(p => p.kind === kind).length;
      for (let i = have; i < n; i++) sky.push({...KINDS[kind].make(w, h, true), kind});
      run();
    },
    get current() { return weather; },
    /**
     * Light around a point (x, y in the stage's pixels): 'glints' (warm motes rising, a few glints among them) or
     * 'bokeh' (soft out-of-focus lights drifting over the upper stage).
     */
    burst(kind, x, y) {
      if (!ctx()) return;
      if (!raf) size();
      const few = lite ? 0.6 : 1, mote = (o) => bits.push({t: rand(0, TAU), ...o});
      if (kind === 'glints') {
        for (let i = 0; i < Math.round(16 * few); i++) mote({kind: 'glow', color: i % 4 ? 'warm' : 'gold', x: x + rand(-170, 170), y: y + rand(-60, 110), vx: rand(-12, 12), vy: rand(-70, -26), s: rand(5, 15), peak: rand(.45, .9), life: 1, span: rand(1.6, 2.6)});
        for (let i = 0; i < Math.round(4 * few); i++) mote({kind: 'flare', color: 'white', x: x + rand(-140, 140), y: y + rand(-50, 70), vx: 0, vy: rand(-18, -6), s: rand(16, 30), peak: rand(.6, .95), life: 1, span: rand(1.1, 1.7)});
      } else if (kind === 'bokeh') {
        for (let i = 0; i < Math.round(12 * few); i++) mote({kind: 'bokeh', color: i % 3 ? 'pink' : 'white', x: x + rand(-0.4, 0.4) * w, y: rand(0.08, 0.62) * h, vx: rand(-14, 14), vy: rand(-22, -6), s: rand(16, 46), peak: rand(.22, .48), life: 1, span: rand(2.4, 3.6)});
      }
      run();
    },
    resize() { if (raf) size(); },
    /** Everything at once (closing, effects turned off). */
    clear() { weather = ''; sky = []; bits = []; if (raf) { win.cancelAnimationFrame(raf); raf = 0; } g?.clearRect(0, 0, w, h); },
    dispose() { this.clear(); canvas.remove(); },
  };
}
