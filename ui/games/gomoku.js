// 五子棋: you (black) against the phone (white); five in a row wins. The phone weighs every free point near the stones
// by the lines it would make for itself and the ones it would break for you. The best is the fewest moves to a win.
import {canvas, color} from './kit.js';

const N = 15, DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const at = (b, x, y) => x < 0 || y < 0 || x >= N || y >= N ? -1 : b[y][x];

/** Whether the stone at (x, y) makes five or more in a row. */
export function five(b, x, y) {
  const who = b[y][x];
  if (!who) return false;
  return DIRS.some(([dx, dy]) => {
    let n = 1;
    for (const s of [1, -1]) for (let k = 1; at(b, x + dx * k * s, y + dy * k * s) === who; k++) n++;
    return n >= 5;
  });
}
/** How good a stone of `who` at (x, y) would be for its lines: runs and how open their ends are. */
function worth(b, x, y, who) {
  let total = 0;
  for (const [dx, dy] of DIRS) {
    let n = 1, open = 0;
    for (const s of [1, -1]) {
      let k = 1;
      while (at(b, x + dx * k * s, y + dy * k * s) === who) { n++; k++; }
      if (at(b, x + dx * k * s, y + dy * k * s) === 0) open++;
    }
    total += n >= 5 ? 1e6 : n === 4 ? (open === 2 ? 5e4 : open ? 4e3 : 0) : n === 3 ? (open === 2 ? 3e3 : open ? 150 : 0) : n === 2 ? (open === 2 ? 120 : open ? 15 : 0) : (open === 2 ? 8 : open ? 2 : 0);
  }
  return total;
}
/** The phone's move for `who` (1 black, 2 white): [x, y]. */
export function bestMove(b, who) {
  const other = who === 1 ? 2 : 1;
  let best = null, top = -1;
  const any = b.some(row => row.some(Boolean));
  if (!any) return [7, 7];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (b[y][x]) continue;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (at(b, x + dx, y + dy) > 0) { near = true; break; }
    if (!near) continue;
    const score = worth(b, x, y, who) * 1.1 + worth(b, x, y, other) + Math.random();
    if (score > top) { top = score; best = [x, y]; }
  }
  return best;
}

export default {
  id: 'gomoku', name: '五子棋', icon: '⚫', colors: ['#f3d9a4', '#b9844a'], note: '和手机下一盘', unit: '步', lower: true,
  how: '你执黑先下，点交叉点落子；先连成五个的赢。最好成绩是用最少的步数赢。',
  make({doc, win, host, api, saved}) {
    const size = Math.min(340, Math.max(240, host.clientWidth || 300)), gap = size / N;
    const {canvas: c, g} = canvas(doc, size, size);
    c.className = 'game-canvas gomoku-board';
    host.append(c);
    const note = doc.createElement('p'); note.className = 'game-status'; host.append(note);
    host.insertAdjacentHTML('beforeend', '<div class="actions"><button type="button" class="chip-button" data-gomoku="undo">悔一步</button></div>');
    let b, moves, last, over, thinking, timer = 0;
    const px = i => gap * (i + .5);
    function draw() {
      if (!g) return;
      g.fillStyle = '#e9c88f'; g.fillRect(0, 0, size, size);
      g.strokeStyle = '#7a5a2c'; g.lineWidth = 1;
      for (let i = 0; i < N; i++) { g.beginPath(); g.moveTo(px(0), px(i)); g.lineTo(px(N - 1), px(i)); g.stroke(); g.beginPath(); g.moveTo(px(i), px(0)); g.lineTo(px(i), px(N - 1)); g.stroke(); }
      g.fillStyle = '#7a5a2c';
      for (const [x, y] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]) { g.beginPath(); g.arc(px(x), px(y), 2.5, 0, Math.PI * 2); g.fill(); }
      b.forEach((row, y) => row.forEach((s, x) => {
        if (!s) return;
        const grad = g.createRadialGradient(px(x) - gap * .15, px(y) - gap * .15, gap * .05, px(x), px(y), gap * .45);
        grad.addColorStop(0, s === 1 ? '#666' : '#fff'); grad.addColorStop(1, s === 1 ? '#111' : '#cfcfcf');
        g.fillStyle = grad; g.beginPath(); g.arc(px(x), px(y), gap * .43, 0, Math.PI * 2); g.fill();
      }));
      if (last) { g.fillStyle = color(host, '--pink', '#ff7eaa'); g.beginPath(); g.arc(px(last[0]), px(last[1]), gap * .12, 0, Math.PI * 2); g.fill(); }
    }
    const say = text => { note.textContent = text; };
    function place(x, y, who) { b[y][x] = who; last = [x, y]; moves.push([x, y]); }
    function phone() {
      thinking = true; say('手机在想……');
      timer = win.setTimeout(() => {
        thinking = false;
        const m = bestMove(b, 2);
        if (!m) { over = true; draw(); api.over({text: '下满了，平局'}); return; }
        place(m[0], m[1], 2); api.sound?.('place'); draw();
        if (five(b, m[0], m[1])) { over = true; say('手机赢了'); api.over({text: '手机连成了五个，再来一局？'}); return; }
        say('轮到你（黑）');
      }, 260);
    }
    function tap(e) {
      if (over || thinking) return;
      const r = c.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / (r.width / N)), y = Math.floor((e.clientY - r.top) / (r.height / N));
      if (x < 0 || y < 0 || x >= N || y >= N || b[y][x]) return;
      place(x, y, 1); api.sound?.('place'); draw();
      const mine = moves.filter((_, i) => i % 2 === 0).length;
      api.score(mine);
      if (five(b, x, y)) { over = true; say('你赢了！'); api.over({score: mine, win: true, text: `用了 ${mine} 步赢下手机`}); return; }
      phone();
    }
    function undo() {
      if (thinking || over || moves.length < 2) return;
      for (const [x, y] of moves.splice(-2)) b[y][x] = 0;
      last = moves.at(-1) || null; draw(); api.score(Math.ceil(moves.length / 2)); say('退回了一步');
    }
    function restart() {
      win.clearTimeout(timer);
      b = Array.from({length: N}, () => Array(N).fill(0)); moves = []; last = null; over = false; thinking = false;
      draw(); api.score(0); say('你执黑先下');
    }
    c.addEventListener('click', tap);
    host.addEventListener('click', e => { if (e.target.closest('[data-gomoku=undo]')) undo(); });
    if (saved?.b?.length === N && saved.moves?.length) {
      b = saved.b; moves = saved.moves; last = moves.at(-1); over = false; thinking = false;
      draw(); api.score(Math.ceil(moves.length / 2));
      // Left while the phone was thinking: it moves now.
      if (moves.length % 2) phone(); else say('轮到你（黑）');
    } else restart();
    return {restart, state: () => over || !moves.length ? null : {b, moves}, dispose() { win.clearTimeout(timer); host.innerHTML = ''; }};
  },
};
