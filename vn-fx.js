// Effects drawn on a canvas over a stage (the 视觉小说's, a page of a 绘本): weather that stays — rain, a storm (rain
// and lightning), snow, petals, leaves, stars, shooting stars, fireflies, embers, fog, dust in the light, sparkles,
// bubbles, wind, fireworks; several at once — and light that comes and goes around whoever speaks (warm glints, soft
// bokeh, little hearts). Nothing runs while nothing shows: the frame loop stops when the sky is clear and the last
// particle is gone. On a phone (lite) the canvas is drawn at its CSS size and with fewer particles.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
/** How many of each at 1920×1080 (fewer on a phone, a few more on a big screen); kinds that come and go have none. */
const COUNT = {rain: 170, storm: 260, snow: 110, petals: 34, leaves: 26, stars: 90, fireflies: 26, embers: 42, fog: 8, dust: 70, sparkles: 46, bubbles: 40, wind: 24};
/** Everything the sky can hold. */
export const FX_KINDS = Object.freeze([...Object.keys(COUNT), 'shooting', 'fireworks']);
const FIRE = [[255, 120, 140], [255, 200, 90], [130, 200, 255], [190, 140, 255], [140, 255, 170], [255, 160, 70]];

const rainMake = (w, h, fill, heavy = false) => ({x: rand(-0.1 * w, 1.15 * w), y: fill ? rand(-h, h) : rand(-h * 0.3, -10), len: rand(heavy ? 20 : 14, heavy ? 36 : 28), v: rand(heavy ? 1250 : 950, heavy ? 1650 : 1350), a: rand(0.25, 0.55)});
const KINDS = {
  rain: {
    make: (w, h, fill) => rainMake(w, h, fill),
    move: (p, dt) => { p.y += p.v * dt; p.x -= p.v * 0.16 * dt; },
    out: (p, w, h) => p.y - p.len > h,
    // All the drops in one path: one stroke a frame instead of one a drop.
    drawAll(g, list) { g.strokeStyle = 'rgba(200,218,255,.42)'; g.lineWidth = 1.2; g.beginPath(); for (const p of list) { g.moveTo(p.x, p.y); g.lineTo(p.x + p.len * 0.16, p.y - p.len); } g.stroke(); },
  },
  storm: {
    make: (w, h, fill) => rainMake(w, h, fill, true),
    move: (p, dt) => { p.y += p.v * dt; p.x -= p.v * 0.28 * dt; },
    out: (p, w, h) => p.y - p.len > h,
    drawAll(g, list) { g.strokeStyle = 'rgba(190,206,240,.5)'; g.lineWidth = 1.4; g.beginPath(); for (const p of list) { g.moveTo(p.x, p.y); g.lineTo(p.x + p.len * 0.28, p.y - p.len); } g.stroke(); },
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
    stays: true,
    draw(g, p) { const a = Math.max(0, (0.45 + Math.sin(p.t) * 0.45) * p.life); g.fillStyle = `rgba(255,250,230,${a})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); if (p.r > 1.4) { g.fillStyle = `rgba(255,250,230,${a * 0.25})`; g.beginPath(); g.arc(p.x, p.y, p.r * 3, 0, TAU); g.fill(); } },
  },
  fireflies: {
    make: (w, h) => ({x: rand(0, w), y: rand(h * 0.25, h), t: rand(0, TAU), vx: rand(-20, 20), vy: rand(-14, 14), r: rand(1.6, 3), life: 1}),
    move: (p, dt, on, w, h) => { p.t += dt * 2; p.x += (p.vx + Math.sin(p.t * 0.7) * 16) * dt; p.y += (p.vy + Math.cos(p.t * 0.5) * 12) * dt; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < h * 0.15 || p.y > h) p.vy *= -1; if (!on) p.life -= dt * 0.6; },
    out: p => p.life <= 0,
    stays: true, light: true,
    draw(g, p) { const a = Math.max(0, (0.5 + Math.sin(p.t * 1.7) * 0.5) * p.life), grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6); grd.addColorStop(0, `rgba(230,255,140,${a})`); grd.addColorStop(1, 'rgba(230,255,140,0)'); g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, p.r * 6, 0, TAU); g.fill(); },
  },
  embers: {
    make: (w, h, fill) => ({x: rand(0, w), y: fill ? rand(h * 0.3, h * 1.1) : h + rand(0, 40), r: rand(1, 2.6), vy: rand(40, 110), t: rand(0, TAU), top: rand(h * 0.15, h * 0.6)}),
    move: (p, dt) => { p.t += dt * 3; p.y -= p.vy * dt; p.x += Math.sin(p.t) * 18 * dt; },
    out: p => p.y < p.top,
    draw(g, p) { const a = Math.min(1, (p.y - p.top) / 120) * (0.6 + Math.sin(p.t * 2) * 0.3); g.fillStyle = `rgba(255,${Math.round(150 + Math.sin(p.t) * 40)},70,${Math.max(0, a)})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); },
  },
  fog: {
    // Big soft clouds of mist drifting across, low on the stage.
    make: (w, h, fill) => ({x: fill ? rand(-0.3 * w, w) : -rand(0.3, 0.5) * w, y: rand(h * 0.25, h * 1.05), r: rand(0.28, 0.5) * Math.max(w, h), vx: rand(10, 26), a: rand(0.1, 0.2), life: fill ? 1 : 0, grow: 1}),
    move: (p, dt, on) => { p.x += p.vx * dt; p.life = Math.max(0, Math.min(1, p.life + (on ? dt * 0.35 : -dt * 0.5))); if (!on && !p.life) p.gone = true; },
    out: (p, w) => p.x - p.r > w,
    sprite: 'fog',
    draw(g, p, img) { if (!img) return; g.globalAlpha = p.a * p.life; g.drawImage(img, p.x - p.r, p.y - p.r * 0.55, p.r * 2, p.r * 1.1); g.globalAlpha = 1; },
  },
  dust: {
    // Motes floating in the light, twinkling now and then.
    make: (w, h) => ({x: rand(0, w), y: rand(0, h), r: rand(0.6, 1.9), vx: rand(-8, 8), vy: rand(-10, 4), t: rand(0, TAU), v: rand(0.8, 2.2), life: 1}),
    move: (p, dt, on, w, h) => { p.t += p.v * dt; p.x += (p.vx + Math.sin(p.t) * 5) * dt; p.y += p.vy * dt; if (p.x < 0) p.x += w; if (p.x > w) p.x -= w; if (p.y < 0) p.y += h; if (p.y > h) p.y -= h; if (!on) p.life -= dt * 0.7; },
    out: p => p.life <= 0,
    stays: true, light: true,
    draw(g, p) { const a = Math.max(0, (0.35 + Math.sin(p.t) * 0.3) * p.life); g.fillStyle = `rgba(255,240,205,${a})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); },
  },
  sparkles: {
    // Glints rising slowly, each lighting up and going out.
    make: (w, h, fill) => ({x: rand(0, w), y: fill ? rand(h * 0.1, h) : rand(h * 0.4, h), s: rand(5, 13), vy: rand(-26, -8), t: 0, span: rand(1.6, 3.2), color: Math.random() < 0.3 ? 'gold' : 'white'}),
    move: (p, dt) => { p.t += dt; p.y += p.vy * dt; },
    out: p => p.t > p.span,
    light: true, sprite: 'flare',
    draw(g, p, img, imgs) { const s = imgs?.[p.color]; if (!s) return; g.globalAlpha = Math.max(0, Math.sin(Math.PI * p.t / p.span)) * 0.9; g.drawImage(s, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2); g.globalAlpha = 1; },
  },
  bubbles: {
    make: (w, h, fill) => ({x: rand(0, w), y: fill ? rand(0, h * 1.1) : h + rand(10, 60), r: rand(2.5, 9), vy: rand(30, 80), t: rand(0, TAU), sway: rand(8, 22)}),
    move: (p, dt) => { p.t += dt * 2; p.y -= p.vy * dt; p.x += Math.sin(p.t) * p.sway * dt; },
    out: p => p.y + p.r < 0,
    draw(g, p) { g.strokeStyle = 'rgba(220,240,255,.55)'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, TAU); g.fill(); },
  },
  wind: {
    // Streaks of a gust going across.
    make: (w, h, fill) => ({x: fill ? rand(-w, w) : rand(-0.6 * w, -0.1 * w), y: rand(0, h), len: rand(80, 220), v: rand(700, 1200), a: rand(0.08, 0.2), bend: rand(-18, 18)}),
    move: (p, dt) => { p.x += p.v * dt; },
    out: (p, w) => p.x - p.len > w,
    drawAll(g, list) { g.lineWidth = 1.1; for (const p of list) { g.strokeStyle = `rgba(255,255,255,${p.a})`; g.beginPath(); g.moveTo(p.x - p.len, p.y); g.quadraticCurveTo(p.x - p.len / 2, p.y + p.bend, p.x, p.y); g.stroke(); } },
  },
  shooting: {
    // Now and then a star falls across the upper sky.
    make: (w, h) => { const left = Math.random() < 0.5; return {x: left ? rand(0, w * 0.5) : rand(w * 0.5, w), y: rand(0, h * 0.35), vx: (left ? 1 : -1) * rand(700, 1000), vy: rand(220, 380), t: 0, span: rand(0.6, 1.1), len: rand(90, 170)}; },
    move: (p, dt) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; },
    out: p => p.t > p.span,
    every: [1.8, 4.5], light: true,
    draw(g, p) { const a = Math.sin(Math.PI * Math.min(1, p.t / p.span)), d = Math.hypot(p.vx, p.vy), ux = p.vx / d, uy = p.vy / d, grd = g.createLinearGradient(p.x, p.y, p.x - ux * p.len, p.y - uy * p.len); grd.addColorStop(0, `rgba(255,255,240,${a})`); grd.addColorStop(1, 'rgba(255,255,240,0)'); g.strokeStyle = grd; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - ux * p.len, p.y - uy * p.len); g.stroke(); },
  },
  fireworks: {
    // A rocket climbs with a little trail, bursts in a bloom of light into a ring of falling sparks that trail too.
    make: (w, h) => ({x: rand(w * 0.15, w * 0.85), y: h + 10, vy: -rand(h * 0.9, h * 1.25), top: rand(h * 0.12, h * 0.42), color: FIRE[Math.floor(Math.random() * FIRE.length)], rocket: true, t: 0, k: Math.max(1, Math.min(2.4, w / 800))}),
    move: (p, dt) => { p.t += dt; if (p.bloom) return; if (p.rocket) { p.y += p.vy * dt; p.vy *= Math.pow(0.42, dt); if (p.y <= p.top || p.vy > -60) { p.burst = true; p.rocket = false; } return; } p.vy += 150 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.986; },
    out: p => !p.rocket && p.t > p.span,
    every: [0.9, 2.2], light: true,
    draw(g, p) {
      const [r, gr, b] = p.color, k = p.k || 1;
      if (p.rocket) {
        g.strokeStyle = `rgba(${r},${gr},${b},.55)`; g.lineWidth = 1.6 * k; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y + 22 * k); g.stroke();
        g.fillStyle = `rgba(255,250,235,.95)`; g.beginPath(); g.arc(p.x, p.y, 2.2 * k, 0, TAU); g.fill(); return;
      }
      const a = Math.max(0, 1 - p.t / p.span);
      if (p.bloom) { const s = 70 * k * (0.6 + p.t / p.span), grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s); grd.addColorStop(0, `rgba(${r},${gr},${b},${0.55 * a})`); grd.addColorStop(1, `rgba(${r},${gr},${b},0)`); g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, s, 0, TAU); g.fill(); return; }
      g.strokeStyle = `rgba(${r},${gr},${b},${a * 0.5})`; g.lineWidth = 1.8 * k; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); g.stroke();
      g.fillStyle = `rgba(${r},${gr},${b},${a})`; g.beginPath(); g.arc(p.x, p.y, 2.4 * k, 0, TAU); g.fill();
    },
  },
};

/** Light, as small pictures drawn once and stamped (a gradient per particle per frame costs too much on a phone). */
const LIGHT = {warm: [255, 222, 168], white: [255, 250, 240], pink: [255, 176, 206], gold: [255, 206, 120], fog: [236, 240, 246]};
function lightSprite(doc, color, kind) {
  const c = doc.createElement('canvas'), n = kind === 'fog' ? 128 : 64;
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
  } else if (kind === 'heart') {
    // A small soft heart (drawn, not a character of any font).
    g.fillStyle = rgba(.9);
    g.beginPath(); g.moveTo(n / 2, n * 0.82);
    g.bezierCurveTo(n * 0.08, n * 0.5, n * 0.18, n * 0.12, n / 2, n * 0.32);
    g.bezierCurveTo(n * 0.82, n * 0.12, n * 0.92, n * 0.5, n / 2, n * 0.82);
    g.fill();
  } else if (kind === 'fog') {
    const d = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    d.addColorStop(0, rgba(1)); d.addColorStop(.5, rgba(.55)); d.addColorStop(1, rgba(0));
    g.fillStyle = d; g.fillRect(0, 0, n, n);
  } else {
    const d = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    d.addColorStop(0, rgba(1)); d.addColorStop(.25, rgba(.55)); d.addColorStop(.6, rgba(.12)); d.addColorStop(1, rgba(0));
    g.fillStyle = d; g.fillRect(0, 0, n, n);
  }
  return c;
}
/** Kinds asked for: 'rain+fog', ['rain', 'fog'] or '' (clear); only those the sky knows. */
const kindsOf = value => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[+\s,]+/)).filter(k => KINDS[k]))];

/** host: the element the canvas covers (its first child after `after`, so the text box stays on top). lite: a phone. */
export function createFx({doc, host, after = null, lite = false}) {
  const win = doc.defaultView;
  const canvas = doc.createElement('canvas');
  canvas.className = 'vn-fx';
  canvas.setAttribute('aria-hidden', 'true');
  if (after?.after) after.after(canvas); else host.append(canvas);
  let g = null, tried = false, raf = 0, w = 0, h = 0, dpr = 1, last = 0, active = new Set(), clock = {}, storm = 0, stormNext = 0;
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
  function spawn(kind, n = 1) {
    const k = KINDS[kind];
    for (let i = 0; i < n; i++) {
      const p = {...k.make(w, h, false), kind};
      sky.push(p);
      // A firework's burst: its sparks join the sky where it bursts.
      if (kind === 'fireworks') p.onBurst = true;
    }
  }
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // Kinds that come and go: one now and then while they are asked for.
    for (const kind of active) {
      const k = KINDS[kind];
      if (!k.every) continue;
      clock[kind] = (clock[kind] ?? rand(0.2, 1)) - dt;
      if (clock[kind] <= 0) { spawn(kind, kind === 'shooting' && Math.random() < 0.25 ? 2 : 1); clock[kind] = rand(...k.every) / (lite ? 0.8 : 1); }
    }
    // The sky: each one that leaves comes back while its weather lasts.
    const born = [];
    for (let i = 0; i < sky.length; i++) {
      const p = sky[i], k = KINDS[p.kind], on = active.has(p.kind);
      k.move(p, dt, on, w, h);
      if (p.burst && p.kind === 'fireworks') {
        p.burst = false; p.gone = true;
        const n = Math.round(rand(48, 76) * (lite ? 0.6 : 1)), k = p.k || 1;
        born.push({kind: 'fireworks', x: p.x, y: p.y, t: 0, span: .45, color: p.color, bloom: true, k});
        for (let j = 0; j < n; j++) { const a = TAU * j / n + rand(-0.05, 0.05), v = rand(90, 230) * k; born.push({kind: 'fireworks', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, span: rand(1.1, 1.9), color: p.color, k}); }
        continue;
      }
      if (p.gone) continue;
      if (k.out(p, w, h)) { if (on && !k.stays && !k.every) sky[i] = {...k.make(w, h, false), kind: p.kind}; else p.gone = true; }
    }
    sky = sky.filter(p => !p.gone).concat(born);
    for (const kind of new Set(sky.map(p => p.kind))) {
      const k = KINDS[kind], list = sky.filter(p => p.kind === kind);
      g.globalCompositeOperation = k.light ? 'lighter' : 'source-over';
      const img = k.sprite ? spriteOf(k.sprite === 'fog' ? 'fog' : 'white', k.sprite) : null, imgs = k.sprite === 'flare' ? {white: spriteOf('white', 'flare'), gold: spriteOf('gold', 'flare')} : null;
      if (k.drawAll) k.drawAll(g, list); else for (const p of list) k.draw(g, p, img, imgs);
    }
    g.globalCompositeOperation = 'source-over';
    // A storm's lightning: now and then the whole sky goes white for a moment, twice.
    if (active.has('storm')) {
      stormNext -= dt;
      if (stormNext <= 0) { storm = 1; stormNext = rand(5, 11); }
    }
    if (storm > 0) {
      const flicker = storm > 0.7 ? 1 : storm > 0.55 ? 0.15 : storm > 0.4 ? 0.8 : storm * 0.6;
      g.fillStyle = `rgba(235,240,255,${0.55 * flicker})`; g.fillRect(0, 0, w, h);
      storm -= dt * 1.6;
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
      const s = b.s * (b.kind === 'bokeh' || b.kind === 'heart' ? 1 : 0.8 + 0.2 * Math.sin(b.t * 3));
      if (b.kind === 'heart') { g.save(); g.translate(b.x, b.y); g.rotate(Math.sin(b.t * 2) * 0.25); g.drawImage(sprite, -s, -s, s * 2, s * 2); g.restore(); }
      else g.drawImage(sprite, b.x - s, b.y - s, s * 2, s * 2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    bits = bits.filter(b => b.life > 0);
    if (active.size || sky.length || bits.length || storm > 0) raf = win.requestAnimationFrame(frame);
    else { raf = 0; g.clearRect(0, 0, w, h); }
  }

  return {
    /**
     * The weather now: one kind, several ('rain+fog' or a list), or '' / 'clear' for none. What goes drifts away (stars
     * and fireflies go out one by one); what comes in fills the sky.
     */
    weather(kinds = '') {
      const want = kindsOf(kinds), key = want.join('+');
      if (key === [...active].join('+')) return;
      active = new Set(want);
      if (!want.length) { if (sky.length) run(); return; }
      if (!ctx()) return;
      size();
      for (const kind of want) {
        if (!COUNT[kind]) continue;
        const n = Math.round(COUNT[kind] * scale()), have = sky.filter(p => p.kind === kind).length;
        for (let i = have; i < n; i++) sky.push({...KINDS[kind].make(w, h, true), kind});
      }
      if (want.includes('storm')) stormNext = rand(1, 3);
      run();
    },
    get current() { return [...active].join('+'); },
    /** A storm's lightning right now (the story names it). */
    lightning() { if (!ctx()) return; if (!raf) size(); storm = 1; run(); },
    /**
     * Light around a point (x, y in the stage's pixels): 'glints' (warm motes rising, a few glints among them), 'bokeh'
     * (soft out-of-focus lights drifting over the upper stage) or 'hearts' (small soft hearts floating up).
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
      } else if (kind === 'hearts') {
        for (let i = 0; i < Math.round(9 * few); i++) mote({kind: 'heart', color: i % 3 ? 'pink' : 'white', x: x + rand(-150, 150), y: y + rand(-20, 120), vx: rand(-10, 10), vy: rand(-60, -28), s: rand(7, 15), peak: rand(.5, .85), life: 1, span: rand(1.8, 2.8)});
      }
      run();
    },
    resize() { if (raf) size(); },
    /** Everything at once (closing, effects turned off). */
    clear() { active = new Set(); sky = []; bits = []; storm = 0; if (raf) { win.cancelAnimationFrame(raf); raf = 0; } g?.clearRect(0, 0, w, h); },
    dispose() { this.clear(); canvas.remove(); },
  };
}
