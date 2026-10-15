// 2048: slide the tiles; two of the same become one, twice as much. A new 2 (sometimes 4) comes after every move.
import {swipes, ARROWS, rand} from './kit.js';

const N = 4;
/** One row slid to the left: {row, gained, moved}. */
export function slideRow(row) {
  const tiles = row.filter(Boolean), out = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === tiles[i + 1]) { out.push(tiles[i] * 2); gained += tiles[i] * 2; i++; }
    else out.push(tiles[i]);
  }
  while (out.length < row.length) out.push(0);
  return {row: out, gained, moved: out.some((x, i) => x !== row[i])};
}
/** The board after a move ('left' | 'right' | 'up' | 'down'): {board, gained, moved}. The board is rows of numbers. */
export function move(board, dir) {
  const n = board.length, get = (r, c) => board[r][c];
  const lines = [];
  for (let i = 0; i < n; i++) {
    const idx = [...Array(n).keys()];
    if (dir === 'left') lines.push(idx.map(c => [i, c]));
    if (dir === 'right') lines.push(idx.map(c => [i, n - 1 - c]));
    if (dir === 'up') lines.push(idx.map(r => [r, i]));
    if (dir === 'down') lines.push(idx.map(r => [n - 1 - r, i]));
  }
  const next = board.map(r => [...r]);
  let gained = 0, moved = false;
  for (const line of lines) {
    const done = slideRow(line.map(([r, c]) => get(r, c)));
    gained += done.gained; moved ||= done.moved;
    line.forEach(([r, c], k) => { next[r][c] = done.row[k]; });
  }
  return {board: next, gained, moved};
}
export const canMove = board => ['left', 'right', 'up', 'down'].some(d => move(board, d).moved);
function addTile(board) {
  const free = [];
  board.forEach((row, r) => row.forEach((x, c) => { if (!x) free.push([r, c]); }));
  if (!free.length) return null;
  const [r, c] = free[rand(free.length)];
  board[r][c] = Math.random() < 0.9 ? 2 : 4;
  return [r, c];
}

export default {
  id: '2048', name: '2048', icon: '2048', colors: ['#ffd27a', '#f08a3c'], note: '合出 2048',
  how: '滑动（或方向键）让方块一起移动，相同的数字撞在一起合成一个。',
  make({doc, host, api, saved}) {
    let board, score, won, fresh = null;
    const el = doc.createElement('div');
    el.className = 'g2048';
    host.append(el);
    function draw() {
      el.innerHTML = board.flatMap((row, r) => row.map((x, c) => `<span class="t2048${x ? ' v' + Math.min(x, 4096) : ''}${fresh && fresh[0] === r && fresh[1] === c ? ' new' : ''}"${x >= 1024 ? ' data-big' : ''}>${x || ''}</span>`)).join('');
      api.score(score);
    }
    function restart() {
      board = Array.from({length: N}, () => Array(N).fill(0)); score = 0; won = false;
      addTile(board); fresh = addTile(board);
      draw();
    }
    function go(dir) {
      if (!canMove(board)) return;
      const done = move(board, dir);
      if (!done.moved) return;
      board = done.board; score += done.gained;
      api.sound?.(done.gained ? 'merge' : 'slide', {value: done.gained});
      fresh = addTile(board);
      draw();
      if (!won && board.flat().includes(2048)) { won = true; api.over({score, win: true, goOn: true, text: '合出了 2048！可以接着玩，冲更高分。'}); }
      else if (!canMove(board)) api.over({score, text: '没地方走了'});
    }
    swipes(el, go);
    if (saved?.board?.length === N) { board = saved.board; score = Number(saved.score) || 0; won = !!saved.won; draw(); } else restart();
    return {
      restart,
      state: () => canMove(board) ? {board, score, won} : null,
      key(e) { const d = ARROWS[e.key]; if (!d) return false; go(d); return true; },
      dispose() { el.remove(); },
    };
  },
};
