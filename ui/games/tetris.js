// 俄罗斯方块: turn and move the falling pieces; a full row goes. Faster every ten rows. Pieces come in shuffled sets
// of seven, so none is missing for long.
import {swipes, pad, padKeys, canvas, color, loop, shuffle} from './kit.js';

const W = 10, H = 20;
export const PIECES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const COLORS = {I: '#4cc9f0', O: '#ffd166', T: '#b388ff', S: '#5fd38d', Z: '#ff6b81', J: '#4d7cfe', L: '#ff9f43'};
const POINTS = [0, 100, 300, 500, 800];

/** A piece's cells turned clockwise (in its 4×4 box; O stays). */
export function turned(kind, cells) {
  if (kind === 'O') return cells;
  const size = kind === 'I' ? 4 : 3;
  return cells.map(([x, y]) => [size - 1 - y, x]);
}
/** Whether the cells at (px, py) fit the board (rows of '' or a kind). */
export const fits = (board, cells, px, py) => cells.every(([x, y]) => { const bx = px + x, by = py + y; return bx >= 0 && bx < W && by < H && (by < 0 || !board[by][bx]); });
/** The board with full rows taken out: {board, cleared}. */
export function clearRows(board) {
  const kept = board.filter(row => row.some(x => !x));
  const cleared = board.length - kept.length;
  return {board: [...Array.from({length: cleared}, () => Array(W).fill('')), ...kept], cleared};
}

export default {
  id: 'tetris', name: '俄罗斯方块', icon: '🧱', colors: ['#a9c8ff', '#5b6ef0'], note: '消掉整行', live: true,
  how: '左右滑或 ←→ 移动，点一下或 ↑ 转，↓ 加速，往下一划（或空格）直接落下。',
  make({doc, win, host, api, saved}) {
    // The board, the pad under it and nothing to scroll: the cells as big as the room left on the screen allows.
    const view = host.closest('.view'), room = view ? view.clientHeight - (host.getBoundingClientRect().top - view.getBoundingClientRect().top) - 110 : 420;
    const width = Math.min(340, Math.max(220, host.clientWidth || 300)), cell = Math.max(13, Math.floor(Math.min((width - 70) / W, (room > 200 ? room : 420) / H))), bw = cell * W, bh = cell * H;
    const {canvas: c, g} = canvas(doc, bw + 64, bh);
    c.className = 'game-canvas';
    host.append(c);
    host.insertAdjacentHTML('beforeend', pad('<button type="button" class="pad-key pad-drop" data-pad="drop" aria-label="落下">落</button>', {row: true, labels: {up: '转'}}));
    // Held, the arrows go on moving; turning and dropping happen once a press.
    const stopPad = padKeys(host, (d, again) => { if (!(again && (d === 'up' || d === 'drop'))) act(d === 'up' ? 'turn' : d); }, {hold: 110});
    let board, piece, bag, next, score, lines, level, wait, over;
    const speed = () => Math.max(90, 800 - (level - 1) * 75);
    const tick = loop(win, dt => {
      wait -= dt;
      if (wait > 0) return;
      wait = speed();
      if (!fall()) settle();
      draw();
    });
    const take = () => { if (!bag.length) bag = shuffle(Object.keys(PIECES)); return bag.pop(); };
    function spawn() {
      const kind = next; next = take();
      piece = {kind, cells: PIECES[kind], x: 3, y: kind === 'I' ? -1 : 0};
      if (!fits(board, piece.cells, piece.x, piece.y)) { over = true; tick.stop(); draw(); api.over({score, text: `消了 ${lines} 行`}); }
    }
    function fall() { if (!fits(board, piece.cells, piece.x, piece.y + 1)) return false; piece.y++; return true; }
    function settle() {
      for (const [x, y] of piece.cells) if (piece.y + y >= 0) board[piece.y + y][piece.x + x] = piece.kind;
      const done = clearRows(board);
      board = done.board;
      if (done.cleared) { lines += done.cleared; score += POINTS[done.cleared] * level; level = 1 + Math.floor(lines / 10); api.score(score); }
      api.sound?.(done.cleared ? 'line' : 'drop', {count: done.cleared});
      spawn();
    }
    function act(what) {
      if (over || !tick.running) return;
      if (what === 'left' || what === 'right') { const dx = what === 'left' ? -1 : 1; if (fits(board, piece.cells, piece.x + dx, piece.y)) piece.x += dx; }
      else if (what === 'down') { if (fall()) { score += 1; api.score(score); } else { settle(); } wait = speed(); }
      else if (what === 'drop') { let n = 0; while (fall()) n++; score += n * 2; api.score(score); settle(); wait = speed(); }
      else if (what === 'turn') {
        const cells = turned(piece.kind, piece.cells);
        // Against a wall it steps aside to turn.
        for (const kick of [0, -1, 1, -2, 2]) if (fits(board, cells, piece.x + kick, piece.y)) { piece.cells = cells; piece.x += kick; api.sound?.('turn'); break; }
      }
      draw();
    }
    function block(x, y, kind, size = cell, alpha = 1) {
      g.globalAlpha = alpha; g.fillStyle = COLORS[kind];
      g.fillRect(x + 1, y + 1, size - 2, size - 2);
      g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x + 1, y + 1, size - 2, Math.max(2, size * .18));
      g.globalAlpha = 1;
    }
    function draw() {
      if (!g) return;
      g.clearRect(0, 0, bw + 64, bh);
      g.fillStyle = color(host, '--card2', '#f3f7fd'); g.fillRect(0, 0, bw, bh);
      g.strokeStyle = color(host, '--dot', '#bcdaf8'); g.lineWidth = .5;
      for (let x = 1; x < W; x++) { g.beginPath(); g.moveTo(x * cell, 0); g.lineTo(x * cell, bh); g.stroke(); }
      board.forEach((row, y) => row.forEach((k, x) => { if (k) block(x * cell, y * cell, k); }));
      if (piece && !over) {
        let gy = piece.y; while (fits(board, piece.cells, piece.x, gy + 1)) gy++;
        for (const [x, y] of piece.cells) if (gy + y >= 0) block((piece.x + x) * cell, (gy + y) * cell, piece.kind, cell, .22);
        for (const [x, y] of piece.cells) if (piece.y + y >= 0) block((piece.x + x) * cell, (piece.y + y) * cell, piece.kind);
      }
      // Beside the board: what comes next, the rows and the level.
      const ink = color(host, '--ink2', '#56637f'), small = Math.min(14, Math.floor(56 / 4));
      g.fillStyle = ink; g.font = '700 11px system-ui, sans-serif';
      g.fillText('下一个', bw + 10, 14);
      for (const [x, y] of PIECES[next]) block(bw + 8 + x * small, 24 + y * small, next, small);
      g.fillStyle = ink; g.fillText('行数', bw + 10, 90); g.font = '800 16px system-ui, sans-serif'; g.fillText(String(lines), bw + 10, 110);
      g.font = '700 11px system-ui, sans-serif'; g.fillText('等级', bw + 10, 136); g.font = '800 16px system-ui, sans-serif'; g.fillText(String(level), bw + 10, 156);
    }
    function restart() {
      tick.stop();
      board = Array.from({length: H}, () => Array(W).fill('')); bag = []; next = take(); score = 0; lines = 0; level = 1; wait = speed(); over = false;
      spawn(); draw(); api.score(0);
      tick.start();
    }
    swipes(c, d => act(d === 'up' ? 'turn' : d === 'down' ? 'drop' : d), {tap: () => act('turn')});
    if (saved?.board?.length === H && saved.piece) { ({board, piece, bag, next, score, lines, level} = saved); wait = speed(); over = false; draw(); api.score(score); } else restart();
    return {
      restart,
      state: () => over ? null : {board, piece, bag, next, score, lines, level},
      key(e) {
        const what = {ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'turn', ' ': 'drop', a: 'left', d: 'right', s: 'down', w: 'turn', x: 'turn'}[e.key];
        if (!what) return false;
        act(what); return true;
      },
      pause() { if (over || !tick.running) return false; tick.stop(); },
      resume() { if (!over) { wait = 400; tick.start(); } },
      dispose() { tick.stop(); stopPad(); host.innerHTML = ''; },
    };
  },
};
