// 扫雷: open every square without a mine. A number says how many mines touch it. The first square is never a mine.
// Flag with a long press (or 插旗 mode, or a right click); tapping a number whose mines are all flagged opens the rest
// around it. The best is the fewest seconds.
import {rand} from './kit.js';

const N = 10, MINES = 15;
const around = (x, y) => [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N);

/** Mines laid away from (sx, sy) and its neighbours: a grid of {mine, n}. */
export function layMines(sx, sy, count = MINES, random = rand) {
  const grid = Array.from({length: N}, () => Array.from({length: N}, () => ({mine: false, n: 0, open: false, flag: false})));
  const keep = new Set([[sx, sy], ...around(sx, sy)].map(([x, y]) => y * N + x));
  let laid = 0;
  while (laid < count) { const i = random(N * N); if (keep.has(i) || grid[Math.floor(i / N)][i % N].mine) continue; grid[Math.floor(i / N)][i % N].mine = true; laid++; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) grid[y][x].n = around(x, y).filter(([a, b]) => grid[b][a].mine).length;
  return grid;
}
/** Opens (x, y), and around it while there are no numbers: how many opened; -1 when it was a mine. */
export function openAt(grid, x, y) {
  const first = grid[y][x];
  if (first.open || first.flag) return 0;
  if (first.mine) { first.open = true; return -1; }
  let opened = 0;
  const todo = [[x, y]];
  while (todo.length) {
    const [a, b] = todo.pop(), cell = grid[b][a];
    if (cell.open || cell.flag || cell.mine) continue;
    cell.open = true; opened++;
    if (!cell.n) todo.push(...around(a, b));
  }
  return opened;
}

export default {
  id: 'mines', name: '扫雷', icon: '💣', colors: ['#c9d3e3', '#6a7b99'], note: `${N}×${N}，${MINES} 个雷`, unit: '秒', lower: true,
  how: '点开格子；长按（电脑上右键）或打开「插旗」再点是插旗。数字旁的旗插够了，点数字能一次翻开周围。',
  make({doc, win, host, api, saved}) {
    const el = doc.createElement('div');
    el.className = 'mines';
    el.style.setProperty('--n', N);
    host.append(el);
    host.insertAdjacentHTML('beforeend', '<div class="actions mines-tools"><button type="button" class="chip-button" data-mines="flag" aria-pressed="false">🚩 插旗</button><span class="game-status" data-mines-left></span></div>');
    let grid, started, over, flagging = false, clock = 0, press = null;
    const seconds = () => started ? Math.max(1, Math.round((Date.now() - started) / 1000)) : 0;
    function draw() {
      el.innerHTML = (grid || Array.from({length: N}, () => Array.from({length: N}, () => ({})))).flatMap((row, y) => row.map((c, x) => {
        const shown = c.open ? (c.mine ? '💥' : c.n || '') : over && c.mine ? '💣' : c.flag ? '🚩' : '';
        return `<button type="button" class="mine${c.open ? ' open' : ''}${c.open && c.mine ? ' boom' : ''}" data-x="${x}" data-y="${y}"${c.open && c.n ? ` data-n="${c.n}"` : ''} aria-label="${x + 1} 列 ${y + 1} 行">${shown}</button>`;
      })).join('');
      const flags = grid ? grid.flat().filter(c => c.flag).length : 0;
      host.querySelector('[data-mines-left]').textContent = `还剩 ${MINES - flags} 个雷`;
    }
    function finish(won) {
      over = true; win.clearInterval(clock); draw();
      if (!won) api.sound?.('boom');
      api.over(won ? {score: seconds(), win: true, text: `用了 ${seconds()} 秒排完了雷`} : {text: '踩到雷了'});
    }
    function check() { if (grid.flat().every(c => c.mine || c.open)) finish(true); }
    function open(x, y) {
      if (over) return;
      if (!grid) { grid = layMines(x, y); started = Date.now(); clock = win.setInterval(() => api.score(seconds()), 1000); api.score(1); }
      const c = grid[y][x];
      if (flagging && !c.open) { c.flag = !c.flag; api.sound?.('flag'); draw(); return; }
      if (c.open && c.n) {
        // A number with its mines flagged: the rest around it opens.
        const near = around(x, y);
        if (near.filter(([a, b]) => grid[b][a].flag).length === c.n) for (const [a, b] of near) if (openAt(grid, a, b) < 0) return finish(false);
        draw(); check(); return;
      }
      if (openAt(grid, x, y) < 0) return finish(false);
      api.sound?.('open'); draw(); check();
    }
    function flag(x, y) { if (over || !grid || grid[y][x].open) return; grid[y][x].flag = !grid[y][x].flag; api.sound?.('flag'); draw(); }
    const cellOf = e => { const b = e.target.closest('.mine'); return b ? [Number(b.dataset.x), Number(b.dataset.y)] : null; };
    el.addEventListener('pointerdown', e => { const at = cellOf(e); if (!at || e.button > 0) return; press = {at, timer: win.setTimeout(() => { press.long = true; flag(...at); }, 420)}; });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, () => { if (press) win.clearTimeout(press.timer); });
    el.addEventListener('click', e => { const at = cellOf(e); if (!at) return; if (press?.long) { press = null; return; } press = null; open(...at); });
    el.addEventListener('contextmenu', e => { const at = cellOf(e); if (!at) return; e.preventDefault(); flag(...at); });
    host.addEventListener('click', e => { const b = e.target.closest('[data-mines=flag]'); if (!b) return; flagging = !flagging; b.setAttribute('aria-pressed', String(flagging)); });
    function restart() { win.clearInterval(clock); grid = null; started = 0; over = false; api.score(0); draw(); }
    // The game left off: its time goes on from where it was.
    if (saved?.grid?.length === N) { grid = saved.grid; started = Date.now() - (Number(saved.elapsed) || 0); over = false; clock = win.setInterval(() => api.score(seconds()), 1000); api.score(seconds()); draw(); } else restart();
    return {restart, state: () => over || !grid ? null : {grid, elapsed: Date.now() - started}, dispose() { win.clearInterval(clock); host.innerHTML = ''; }};
  },
};
