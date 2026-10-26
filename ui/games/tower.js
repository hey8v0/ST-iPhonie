// 叠叠高: a block slides to and fro over the tower; a tap drops it. What hangs over the block below falls off, so the
// tower narrows; drop it right on (nearly) and it keeps its width. Miss the tower: the end. Faster as it grows.
import {canvas, color, loop} from './kit.js';

/** Where a dropped block lands on the one below: {left, width} of what stays, perfect (within `snap`), or null (missed). */
export function land(below, x, width, snap = 4) {
  if (Math.abs(x - below.left) <= snap) return {left: below.left, width: below.width, perfect: true};
  const left = Math.max(x, below.left), right = Math.min(x + width, below.left + below.width);
  return right - left > 0 ? {left, width: right - left, perfect: false} : null;
}

export default {
  id: 'tower', name: '叠叠高', icon: '🏗️', colors: ['#ffd6e7', '#e8599a'], note: '叠得越高越好', live: true,
  how: '方块左右来回滑，点一下（或空格）放下。超出下面那块的部分会掉下去，正好对齐就不会变窄。没叠上就结束了。',
  make({doc, win, host, api, saved}) {
    const w = Math.min(340, Math.max(240, host.clientWidth || 300)), h = Math.round(w * 1.35), bh = 22, base = w * .55;
    const {canvas: c, g} = canvas(doc, w, h);
    c.className = 'game-canvas';
    c.style.touchAction = 'none';
    host.append(c);
    let tower, moving, dir, speed, falling, over, view, combo;
    const hue = i => `hsl(${(i * 17 + 330) % 360} 78% 66%)`;
    const tick = loop(win, dt => {
      const t = dt / 16.67;
      if (!over) {
        moving.left += dir * speed * t;
        if (moving.left + moving.width > w + 10) { moving.left = w + 10 - moving.width; dir = -1; }
        if (moving.left < -10) { moving.left = -10; dir = 1; }
      }
      for (const f of falling) { f.vy += .5 * t; f.y += f.vy * t; f.left += f.vx * t; }
      falling = falling.filter(f => f.y < h + 200);
      // The view rises with the tower.
      const want = Math.max(0, tower.length - 9) * bh;
      view += (want - view) * Math.min(1, .12 * t);
      draw();
      if (over && !falling.length) tick.stop();
    });
    const yOf = level => h - 30 - (level + 1) * bh + view;
    function draw() {
      if (!g) return;
      g.fillStyle = color(host, '--card2', '#fff3f8'); g.fillRect(0, 0, w, h);
      tower.forEach((b, i) => { g.fillStyle = hue(i); g.fillRect(b.left, yOf(i), b.width, bh - 2); });
      if (!over) { g.fillStyle = hue(tower.length); g.fillRect(moving.left, yOf(tower.length), moving.width, bh - 2); }
      for (const f of falling) { g.globalAlpha = .8; g.fillStyle = f.color; g.fillRect(f.left, f.y, f.width, bh - 2); g.globalAlpha = 1; }
      g.fillStyle = color(host, '--ink', '#333'); g.font = '800 28px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(String(tower.length - 1), w / 2, 44);
      if (combo > 1) { g.font = '700 13px system-ui, sans-serif'; g.fillText(`完美 ×${combo}`, w / 2, 64); }
    }
    function drop() {
      if (over) return;
      const below = tower.at(-1), level = tower.length, got = land(below, moving.left, moving.width);
      if (!got) {
        falling.push({left: moving.left, width: moving.width, y: yOf(level), vy: 0, vx: dir * 2, color: hue(level)});
        over = true; api.sound?.('lose');
        api.over({score: tower.length - 1, text: `叠了 ${tower.length - 1} 层`});
        return;
      }
      // What hangs over falls off.
      const cutL = got.left - moving.left, cutR = moving.left + moving.width - (got.left + got.width);
      if (!got.perfect && cutL > 0) falling.push({left: moving.left, width: cutL, y: yOf(level), vy: 0, vx: -1.5, color: hue(level)});
      if (!got.perfect && cutR > 0) falling.push({left: got.left + got.width, width: cutR, y: yOf(level), vy: 0, vx: 1.5, color: hue(level)});
      combo = got.perfect ? combo + 1 : 0;
      tower.push({left: got.left, width: got.width});
      api.score(tower.length - 1); api.sound?.(got.perfect ? 'match' : 'place');
      speed = Math.min(7, 2.2 + tower.length * .12);
      dir = tower.length % 2 ? 1 : -1;
      moving = {left: dir > 0 ? -got.width : w - 0, width: got.width};
    }
    c.addEventListener('pointerdown', e => { e.preventDefault(); drop(); });
    function restart() {
      tower = [{left: (w - base) / 2, width: base}]; dir = 1; speed = 2.2; moving = {left: -base, width: base};
      falling = []; over = false; view = 0; combo = 0; api.score(0); tick.start();
    }
    restart();
    return {restart, pause() { tick.stop(); }, resume() { if (!over) tick.start(); }, key(e) { if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') { drop(); return true; } return false; }, dispose() { tick.stop(); c.remove(); }};
  },
};
