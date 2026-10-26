// 合成大西瓜: drop fruit into a box; two of the same that touch become the next bigger one, two watermelons… no more.
// Fruit piling over the line for a moment ends the game. Round fruit with gravity, bumping and settling.
import {canvas, color, loop, rand} from './kit.js';

const FRUITS = ['🍒', '🍓', '🍇', '🍊', '🍋', '🍎', '🍐', '🍑', '🍍', '🥥', '🍉'];
const TINTS = ['#ffb3c1', '#ff8fa3', '#c9a7ff', '#ffc078', '#ffe066', '#ff8787', '#c0eb75', '#ffd8a8', '#ffe8a3', '#e9d8c4', '#8ce99a'];
const SIZE = [11, 15, 20, 25, 31, 37, 43, 51, 59, 68, 78];

/**
 * One step of the box (dt in 1/60 s): gravity, walls, fruit pushing each other apart; two alike that touch merge into
 * the next one (returned in merged as its kind, for the score and a sound). w, h: the box; k: radii scale.
 */
export function step(fruits, {w, h, k = 1, dt = 1}) {
  const merged = [];
  for (const f of fruits) { f.vy += .35 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= .995; }
  for (let pass = 0; pass < 4; pass++) {
    for (const f of fruits) {
      const r = SIZE[f.kind] * k;
      if (f.x < r) { f.x = r; f.vx = Math.abs(f.vx) * .3; }
      if (f.x > w - r) { f.x = w - r; f.vx = -Math.abs(f.vx) * .3; }
      if (f.y > h - r) { f.y = h - r; f.vy = -Math.abs(f.vy) * .15; f.vx *= .9; }
    }
    for (let i = 0; i < fruits.length; i++) for (let j = i + 1; j < fruits.length; j++) {
      const a = fruits[i], b = fruits[j];
      if (a.gone || b.gone) continue;
      const ra = SIZE[a.kind] * k, rb = SIZE[b.kind] * k, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01;
      if (d >= ra + rb) continue;
      if (a.kind === b.kind && a.kind < FRUITS.length - 1) {
        a.gone = b.gone = true;
        const kind = a.kind + 1;
        fruits.push({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: (a.vx + b.vx) / 2, vy: Math.min(a.vy, b.vy) - 1, kind, born: 0});
        merged.push(kind);
        continue;
      }
      // Pushed apart by how much they overlap, the smaller one moving more; the speed into each other is taken away.
      const nx = dx / d, ny = dy / d, over = ra + rb - d, ma = ra * ra, mb = rb * rb, share = mb / (ma + mb);
      a.x -= nx * over * share; a.y -= ny * over * share; b.x += nx * over * (1 - share); b.y += ny * over * (1 - share);
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) { const p = rel * 1.1; a.vx += nx * p * (1 - share); a.vy += ny * p * (1 - share); b.vx -= nx * p * share; b.vy -= ny * p * share; }
    }
    for (let i = fruits.length - 1; i >= 0; i--) if (fruits[i].gone) fruits.splice(i, 1);
  }
  return merged;
}

export default {
  id: 'suika', name: '合成大西瓜', icon: '🍉', colors: ['#c3f0a8', '#40a845'], note: '两个一样的合成大的', live: true,
  how: '左右拖动选位置，松手（或点一下）把水果扔下去；两个一样的碰在一起变成更大的，一直合成到西瓜。水果堆过红线就输了。',
  make({doc, win, host, api, saved}) {
    const w = Math.min(340, Math.max(240, host.clientWidth || 300)), h = Math.round(w * 1.35), k = w / 320, line = 70 * k;
    const {canvas: c, g} = canvas(doc, w, h);
    c.className = 'game-canvas';
    c.style.touchAction = 'none';
    host.append(c);
    let fruits, next, aim, score, cool, overTime, over;
    const pickNext = () => rand(5);
    const tick = loop(win, dt => {
      const t = dt / 16.67;
      cool = Math.max(0, cool - dt);
      for (const f of fruits) f.born += dt;
      for (const kind of step(fruits, {w, h, k, dt: t})) { score += (kind + 1) * 2; api.score(score); api.sound?.('merge', {value: 2 ** (kind + 1)}); if (kind === FRUITS.length - 1) api.sound?.('win'); }
      // Over the line (not a fruit just dropped) for 1.5 s: the end.
      const high = fruits.some(f => f.born > 1200 && f.y - SIZE[f.kind] * k < line && Math.abs(f.vy) < 1.5);
      overTime = high ? overTime + dt : 0;
      if (overTime > 1500) { over = true; tick.stop(); draw(); api.over({score, text: `最大合成到了 ${FRUITS[Math.max(...fruits.map(f => f.kind))]}`}); return; }
      draw();
    });
    function draw() {
      if (!g) return;
      g.fillStyle = color(host, '--card2', '#fff8ef'); g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ff6b6b'; g.setLineDash([6, 6]); g.globalAlpha = overTime ? .9 : .4; g.beginPath(); g.moveTo(0, line); g.lineTo(w, line); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      if (!over) { const r = SIZE[next] * k; ball(aim, line - r - 6, next); g.globalAlpha = .25; g.fillStyle = color(host, '--ink2', '#888'); g.fillRect(aim - .5, line, 1, h - line); g.globalAlpha = 1; }
      for (const f of fruits) ball(f.x, f.y, f.kind);
    }
    function ball(x, y, kind) {
      const r = SIZE[kind] * k;
      g.fillStyle = TINTS[kind]; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.font = `${Math.round(r * 1.35)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(FRUITS[kind], x, y + r * .06);
    }
    const toX = e => { const r = c.getBoundingClientRect(), rad = SIZE[next] * k; return Math.max(rad, Math.min(w - rad, (e.clientX - r.left) / r.width * w)); };
    let down = false;
    c.addEventListener('pointerdown', e => { if (over) return; down = true; aim = toX(e); c.setPointerCapture?.(e.pointerId); });
    c.addEventListener('pointermove', e => { if (over || (!down && e.pointerType !== 'mouse')) return; aim = toX(e); });
    c.addEventListener('pointerup', e => { if (!down || over) return; down = false; aim = toX(e); drop(); });
    function drop() {
      if (cool) return;
      fruits.push({x: aim, y: line - SIZE[next] * k - 6, vx: 0, vy: 0, kind: next, born: 0});
      next = pickNext(); cool = 450; api.sound?.('drop');
    }
    function restart() { fruits = []; next = pickNext(); aim = w / 2; score = 0; cool = 0; overTime = 0; over = false; api.score(0); tick.start(); }
    if (saved?.fruits) { fruits = saved.fruits.map(f => ({...f, vx: 0, vy: 0, born: 2000})); next = saved.next ?? pickNext(); aim = w / 2; score = Number(saved.score) || 0; cool = 0; overTime = 0; over = false; api.score(score); draw(); }
    else restart();
    return {
      restart, state: () => over ? null : {fruits: fruits.map(f => ({x: f.x, y: f.y, kind: f.kind})), next, score},
      pause() { tick.stop(); }, resume() { if (!over) tick.start(); },
      key(e) { if (e.key === 'ArrowLeft') aim = Math.max(SIZE[next] * k, aim - 14); else if (e.key === 'ArrowRight') aim = Math.min(w - SIZE[next] * k, aim + 14); else if (e.key === ' ' || e.key === 'ArrowDown') drop(); else return false; return true; },
      dispose() { tick.stop(); c.remove(); },
    };
  },
};
