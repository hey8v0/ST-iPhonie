// 跳一跳: hold to gather strength, let go to jump to the next platform; how far depends on how long you held.
// The middle of a platform scores more (and more again in a row). Missing it: the end.
import {canvas, color, loop, rand} from './kit.js';

/** Where a jump lands: 'center' (within a fifth of the middle), 'on', or 'off' the platform {x, w}. */
export function landing(x, p) {
  if (x < p.x || x > p.x + p.w) return 'off';
  return Math.abs(x - (p.x + p.w / 2)) <= p.w * .2 ? 'center' : 'on';
}
/** How far a press of `ms` throws (px), up to a limit. */
export const reach = ms => Math.min(1500, ms) * .26;

export default {
  id: 'hop', name: '跳一跳', icon: '🐰', colors: ['#d0bfff', '#7048e8'], note: '按住蓄力跳', live: true,
  how: '按住屏幕（或空格）蓄力，松开就跳；按得越久跳得越远。跳到台子中间分更多，连续跳中多加分。',
  make({doc, win, host, api}) {
    const w = Math.min(340, Math.max(240, host.clientWidth || 300)), h = Math.round(w * 1.1), ground = h * .68;
    const {canvas: c, g} = canvas(doc, w, h);
    c.className = 'game-canvas';
    c.style.touchAction = 'none';
    host.append(c);
    let plats, at, me, holding, held, jump, cam, score, streak, over, pop;
    const COLORS = ['#ffa8a8', '#ffd8a8', '#b2f2bb', '#a5d8ff', '#d0bfff', '#fcc2d7', '#99e9f2'];
    function more() {
      const last = plats.at(-1), width = Math.max(26, 64 - score * .6 + rand(24));
      plats.push({x: last.x + last.w + 34 + rand(Math.min(160, 70 + score * 2)), w: width, color: COLORS[rand(COLORS.length)]});
    }
    const tick = loop(win, dt => {
      if (holding) held += dt;
      if (jump) {
        jump.t += dt / 520;
        const k = Math.min(1, jump.t);
        me.x = jump.from + (jump.to - jump.from) * k;
        me.y = -Math.sin(Math.PI * k) * (50 + (jump.to - jump.from) * .25);
        if (k >= 1) {
          jump = null; me.y = 0;
          const where = landing(me.x, plats[at + 1]);
          if (where === 'off') { over = true; me.fall = 0; api.sound?.('lose'); api.over({score, text: `跳了 ${score} 分`}); }
          else {
            at++; streak = where === 'center' ? streak + 1 : 0;
            const add = where === 'center' ? 2 * streak : 1;
            score += add; api.score(score); pop = {text: '+' + add, t: 0};
            api.sound?.(where === 'center' ? 'match' : 'place');
            more();
          }
        }
      }
      if (over && me.fall != null) { me.fall += dt / 16.67; me.y = me.fall * me.fall * .4; if (me.y > h) tick.stop(); }
      if (pop) pop.t += dt;
      // The view follows, keeping the platform you stand on a third of the way across.
      const want = plats[at].x + plats[at].w / 2 - w * .3;
      cam += (want - cam) * Math.min(1, dt / 220);
      draw();
    });
    function draw() {
      if (!g) return;
      g.fillStyle = color(host, '--card2', '#f6f3ff'); g.fillRect(0, 0, w, h);
      for (const p of plats) {
        const x = p.x - cam;
        if (x > w || x + p.w < 0) continue;
        g.fillStyle = p.color; g.fillRect(x, ground, p.w, h - ground);
        g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x + p.w * .3, ground, p.w * .4, 3);
      }
      const squash = holding ? Math.min(.35, held / 1500 * .35) : 0, bx = me.x - cam, by = ground + me.y;
      g.fillStyle = color(host, '--ink', '#333');
      g.beginPath(); g.ellipse(bx, by - 15 * (1 - squash), 9, 15 * (1 - squash), 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(bx, by - 34 * (1 - squash), 8, 0, Math.PI * 2); g.fill();
      if (holding) { g.fillStyle = color(host, '--accent', '#7048e8'); g.fillRect(bx - 20, by + 8, 40 * Math.min(1, held / 1500), 4); }
      if (pop && pop.t < 700) { g.globalAlpha = 1 - pop.t / 700; g.font = '800 18px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(pop.text, bx, by - 56 - pop.t / 25); g.globalAlpha = 1; }
    }
    function press() { if (over || jump || holding) return; holding = true; held = 0; api.sound?.('tap'); }
    function release() {
      if (!holding) return;
      holding = false;
      jump = {from: me.x, to: me.x + reach(held), t: 0};
      api.sound?.('bounce');
    }
    c.addEventListener('pointerdown', e => { e.preventDefault(); c.setPointerCapture?.(e.pointerId); press(); });
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', release);
    function restart() {
      plats = [{x: 20, w: 70, color: COLORS[0]}]; at = 0; me = {x: 55, y: 0}; holding = false; held = 0; jump = null; cam = 0; score = 0; streak = 0; over = false; pop = null;
      for (let i = 0; i < 4; i++) more();
      api.score(0); tick.start();
    }
    restart();
    return {restart, pause() { tick.stop(); }, resume() { if (!over) tick.start(); }, key(e) { if (e.key === ' ' && !e.repeat) { press(); return true; } return e.key === ' '; }, keyup(e) { if (e.key === ' ') release(); }, dispose() { tick.stop(); c.remove(); }};
  },
};
