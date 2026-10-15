// 数字华容道: slide the tiles into the empty place until they read 1 to 15 in order. Shuffled by real slides, so it
// can always be solved.
import {swipes, ARROWS, rand} from './kit.js';

const N = 4;
const solved = tiles => tiles.every((t, i) => t === (i === N * N - 1 ? 0 : i + 1));
/** The tiles after moving the one at index i into the empty place, or null when it is not next to it. */
export function slideTile(tiles, i) {
  const e = tiles.indexOf(0), [ex, ey, x, y] = [e % N, Math.floor(e / N), i % N, Math.floor(i / N)];
  if (Math.abs(ex - x) + Math.abs(ey - y) !== 1) return null;
  const next = [...tiles]; next[e] = tiles[i]; next[i] = 0;
  return next;
}
/** A board shuffled by `count` random slides from the solved one. */
export function shuffled(count = 200, random = rand) {
  let tiles = [...Array(N * N - 1).keys()].map(i => i + 1).concat(0), back = -1;
  for (let k = 0; k < count; k++) {
    const e = tiles.indexOf(0), options = [e - N, e + N, e % N ? e - 1 : -1, e % N < N - 1 ? e + 1 : -1].filter(i => i >= 0 && i < N * N && i !== back);
    const i = options[random(options.length)];
    back = e; tiles = slideTile(tiles, i);
  }
  return solved(tiles) ? shuffled(count, random) : tiles;
}

export default {
  id: 'slide', name: '数字华容道', icon: '🧩', colors: ['#b8ecff', '#3aa6d6'], note: '1 到 15 排好', unit: '步', lower: true,
  how: '点空格旁边的数字（或滑动、方向键）把它推进空格，排成 1 到 15。',
  make({doc, host, api, saved}) {
    const el = doc.createElement('div');
    el.className = 'slide';
    host.append(el);
    let tiles, moves, done;
    // A tile in its place is marked slide-placed (it was 'home', which is the phone's own home screen: full size, on top).
    function draw() { el.innerHTML = tiles.map((t, i) => t ? `<button type="button" class="slide-tile${t === i + 1 ? ' slide-placed' : ''}" data-tile="${i}">${t}</button>` : '<span class="slide-hole"></span>').join(''); }
    function push(i) {
      if (done) return;
      const next = slideTile(tiles, i);
      if (!next) return;
      tiles = next; moves++; api.score(moves); api.sound?.('slide'); draw();
      if (solved(tiles)) { done = true; api.over({score: moves, win: true, text: `${moves} 步排好了`}); }
    }
    // A swipe or an arrow moves the tile on that side of the hole the other way, into it.
    function go(dir) {
      const e = tiles.indexOf(0), x = e % N;
      const i = {up: e + N, down: e - N, left: x < N - 1 ? e + 1 : -1, right: x ? e - 1 : -1}[dir];
      if (i >= 0 && i < N * N) push(i);
    }
    // A tap moves the tile under the finger as the finger lifts, not by the click after it: the board is drawn anew
    // after every move, and quick taps in a row were taken by the browser as a double tap (zooming the page in).
    // A click that is not a tap (keyboard, screen reader) still moves its tile.
    let tapped = 0;
    swipes(el, go, {min: 30, tap: (x, y, e) => { const b = doc.elementFromPoint?.(e.clientX, e.clientY)?.closest('[data-tile]'); if (b && el.contains(b)) { tapped = Date.now(); push(Number(b.dataset.tile)); } }});
    // A finger held or tapping fast must not select, zoom or bring up the browser's menus. Pointer events still come;
    // only the browser's own touch handling is stopped.
    for (const type of ['touchstart', 'touchend']) el.addEventListener(type, e => { if (e.cancelable) e.preventDefault(); }, {passive: false});
    el.addEventListener('click', e => { const b = e.target.closest('[data-tile]'); if (b && Date.now() - tapped > 500) push(Number(b.dataset.tile)); });
    function restart() { tiles = shuffled(); moves = 0; done = false; api.score(0); draw(); }
    if (saved?.tiles?.length === N * N) { tiles = saved.tiles; moves = Number(saved.moves) || 0; done = false; api.score(moves); draw(); } else restart();
    return {restart, state: () => done ? null : {tiles, moves}, key(e) { const d = ARROWS[e.key]; if (!d) return false; go(d); return true; }, dispose() { el.remove(); }};
  },
};
