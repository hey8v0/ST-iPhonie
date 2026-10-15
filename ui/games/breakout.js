// 打砖块: keep the ball up with the paddle and break every brick. Three balls; a cleared wall comes back faster.
import {canvas, color, loop} from './kit.js';

const COLS = 8, ROWS = 6, ROW_COLORS = ['#ff6b81', '#ff9f43', '#ffd166', '#5fd38d', '#4cc9f0', '#b388ff'];

/** Where a ball hitting the paddle goes: further from the middle, more to the side. Returns [vx, vy] at `speed`. */
export function bounce(hit, speed) {
  const angle = Math.max(-1, Math.min(1, hit)) * (Math.PI / 3);
  return [speed * Math.sin(angle), -speed * Math.cos(angle)];
}

export default {
  id: 'breakout', name: '打砖块', icon: '🏓', colors: ['#ffd0a8', '#f0703c'], note: '三个球', live: true,
  how: '按住屏幕左右拖（或 ←→）移动挡板，点一下发球；接住球，把砖块全打掉。',
  make({doc, win, host, api, saved}) {
    const w = Math.min(340, Math.max(240, host.clientWidth || 300)), h = Math.round(w * 1.25);
    const {canvas: c, g} = canvas(doc, w, h);
    c.className = 'game-canvas';
    c.style.touchAction = 'none';
    host.append(c);
    const bw = w / COLS, bh = 16, top = 46, pw = w * .22, ph = 10, py = h - 28, r = 6;
    let bricks, paddle, ball, vx, vy, speed, lives, score, level, held, over, keys = {left: false, right: false};
    const tick = loop(win, dt => {
      const t = dt / 16.67;
      if (keys.left) paddle = Math.max(pw / 2, paddle - 7 * t);
      if (keys.right) paddle = Math.min(w - pw / 2, paddle + 7 * t);
      if (held) { ball = [paddle, py - r - 1]; draw(); return; }
      // In small steps, so a fast ball does not pass through a brick.
      const steps = Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) * t / 4);
      for (let s = 0; s < steps && !over && !held; s++) move(t / steps);
      draw();
    });
    function move(t) {
      ball = [ball[0] + vx * t, ball[1] + vy * t];
      if (ball[0] < r) { ball[0] = r; vx = Math.abs(vx); }
      if (ball[0] > w - r) { ball[0] = w - r; vx = -Math.abs(vx); }
      if (ball[1] < r) { ball[1] = r; vy = Math.abs(vy); }
      if (vy > 0 && ball[1] + r >= py && ball[1] + r <= py + ph + 6 && Math.abs(ball[0] - paddle) <= pw / 2 + r) {
        [vx, vy] = bounce((ball[0] - paddle) / (pw / 2), speed); ball[1] = py - r; api.sound?.('bounce');
      }
      if (ball[1] > h + r) { lives--; if (lives <= 0) { over = true; tick.stop(); draw(); api.over({score, text: `打到了第 ${level} 关`}); } else { held = true; api.sound?.('miss'); } return; }
      const col = Math.floor(ball[0] / bw), row = Math.floor((ball[1] - top) / bh);
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS && bricks[row][col]) {
        bricks[row][col] = 0; score += (ROWS - row) * 10; api.score(score); api.sound?.('brick');
        // From the side or from above/below: whichever edge is nearer.
        const cx = (col + .5) * bw, cy = top + (row + .5) * bh;
        if (Math.abs(ball[0] - cx) / bw > Math.abs(ball[1] - cy) / bh) vx = -vx; else vy = -vy;
        if (bricks.every(rw => rw.every(b => !b))) { level++; speed += .8; wall(); held = true; }
      }
    }
    function wall() { bricks = Array.from({length: ROWS}, () => Array(COLS).fill(1)); }
    function draw() {
      if (!g) return;
      g.fillStyle = color(host, '--card2', '#f3f7fd'); g.fillRect(0, 0, w, h);
      bricks.forEach((rw, y) => rw.forEach((b, x) => { if (!b) return; g.fillStyle = ROW_COLORS[y]; g.fillRect(x * bw + 2, top + y * bh + 2, bw - 4, bh - 4); }));
      g.fillStyle = color(host, '--accent', '#3a9cf0');
      g.beginPath(); g.roundRect ? g.roundRect(paddle - pw / 2, py, pw, ph, 5) : g.rect(paddle - pw / 2, py, pw, ph); g.fill();
      g.fillStyle = color(host, '--ink', '#1d2a48');
      g.beginPath(); g.arc(ball[0], ball[1], r, 0, Math.PI * 2); g.fill();
      g.font = '700 12px system-ui, sans-serif'; g.fillStyle = color(host, '--ink2', '#56637f');
      g.fillText(`第 ${level} 关`, 10, 22); g.fillText('●'.repeat(Math.max(0, lives)), w - 10 - lives * 12, 22);
      if (held && !over) { g.textAlign = 'center'; g.fillText('点一下发球', w / 2, h * .62); g.textAlign = 'left'; }
    }
    function serve() { if (!held || over) return; held = false; [vx, vy] = bounce((Math.random() - .5) * .6, speed); }
    const follow = e => { const rect = c.getBoundingClientRect(); paddle = Math.max(pw / 2, Math.min(w - pw / 2, (e.clientX - rect.left) * (w / rect.width))); };
    let down = null;
    c.addEventListener('pointerdown', e => { down = {x: e.clientX, moved: false}; try { c.setPointerCapture(e.pointerId); } catch { /* not tracked */ } });
    c.addEventListener('pointermove', e => { if (!down && e.pointerType !== 'mouse') return; if (down && Math.abs(e.clientX - down.x) > 4) down.moved = true; follow(e); });
    c.addEventListener('pointerup', () => { if (down && !down.moved) serve(); down = null; });
    function restart() {
      tick.stop();
      wall(); paddle = w / 2; ball = [w / 2, py - r - 1]; speed = 4.2; lives = 3; score = 0; level = 1; held = true; over = false;
      api.score(0); draw(); tick.start();
    }
    if (saved?.bricks?.length === ROWS) { ({bricks, lives, score, level, speed} = saved); paddle = w / 2; ball = [w / 2, py - r - 1]; held = true; over = false; api.score(score); draw(); } else restart();
    return {
      restart,
      state: () => over ? null : {bricks, lives, score, level, speed},
      key(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a') { keys.left = e.type !== 'keyup'; return true; }
        if (e.key === 'ArrowRight' || e.key === 'd') { keys.right = e.type !== 'keyup'; return true; }
        if (e.key === ' ' || e.key === 'ArrowUp') { serve(); return true; }
        return false;
      },
      keyup(e) { if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false; if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false; },
      pause() { if (over || !tick.running) return false; tick.stop(); keys = {left: false, right: false}; },
      resume() { if (!over) tick.start(); },
      dispose() { tick.stop(); host.innerHTML = ''; },
    };
  },
};
