// 把这一页拼回去 (0.9.40): a page's picture cut into 3×3 pieces and shuffled; two taps swap two pieces (or one piece is
// dragged onto another); back in order, the page turns. Nothing of the book changes. Pure DOM: the pieces are
// buttons showing their part of the picture, so no canvas is needed (works where the picture would taint one).
import {esc} from './common.js';
import {icon} from './icons.js';

export const PUZZLE_SIDE = 3;

/** Piece order shuffled so that it is not solved; random(): 0..1. */
export function shuffled(n = PUZZLE_SIDE * PUZZLE_SIDE, random = Math.random) {
  const order = Array.from({length: n}, (_, i) => i);
  for (let round = 0; round < 10; round++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    if (!solved(order)) return order;
  }
  // (All tries came out solved: the last two pieces swapped is enough.)
  [order[n - 1], order[n - 2]] = [order[n - 2], order[n - 1]];
  return order;
}
export const solved = order => order.every((piece, at) => piece === at);
/** The piece's part of the picture, for a button `at` showing piece `piece`. */
export const pieceStyle = (piece, side = PUZZLE_SIDE) => `background-position:${(piece % side) * 100 / (side - 1)}% ${Math.floor(piece / side) * 100 / (side - 1)}%;background-size:${side * 100}% ${side * 100}%`;

/**
 * Opens the puzzle over the page. url: the picture; title: whose page; onDone(): the puzzle is solved (the sheet closes
 * by itself a moment later). Returns the dialog.
 */
export function openPuzzle(ctx, {url, title = '', onDone = () => {}, random = Math.random} = {}) {
  const side = PUZZLE_SIDE, motion = !ctx.win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let order = shuffled(side * side, random), picked = -1, moves = 0, done = false;
  const d = ctx.dialog('把这一页拼回去', `<p class="hint" data-keep-hint>${esc(title ? title + '的图' : '这一页的图')}打乱了：点两块交换，拼回原样就翻页。</p>
    <div class="bk-puzzle" role="group" aria-label="拼图" style="--side:${side}">${order.map((piece, at) => `<button type="button" class="bk-piece" data-at="${at}" data-piece="${piece}" style="background-image:url('${esc(url)}');${pieceStyle(piece, side)}" aria-label="第 ${at + 1} 块"></button>`).join('')}</div>
    <div class="bk-puzzle-bar"><span data-bk-moves>0 步</span><button type="button" class="chip-button" data-bk-shuffle>${icon('refresh')}重新打乱</button></div>`, {over: true});
  const grid = d.body.querySelector('.bk-puzzle'), pieces = () => [...grid.querySelectorAll('.bk-piece')];
  const paint = () => {
    pieces().forEach((b, at) => { const piece = order[at]; b.dataset.piece = String(piece); b.setAttribute('style', `background-image:url('${url.replace(/'/g, '%27')}');${pieceStyle(piece, side)}`); b.classList.toggle('picked', at === picked); b.classList.toggle('home', piece === at); });
    d.body.querySelector('[data-bk-moves]').textContent = `${moves} 步`;
  };
  const swap = (a, b) => {
    if (a === b || a < 0 || b < 0) return;
    [order[a], order[b]] = [order[b], order[a]];
    moves++; picked = -1; paint();
    if (motion && typeof grid.animate === 'function') for (const at of [a, b]) pieces()[at]?.animate?.([{transform: 'scale(.86)'}, {transform: 'scale(1)'}], {duration: 220, easing: 'cubic-bezier(.2,1.4,.3,1)'});
    if (solved(order) && !done) {
      done = true;
      grid.classList.add('solved'); grid.setAttribute('aria-label', '拼好了');
      d.body.querySelector('[data-bk-moves]').textContent = `拼好了 · ${moves} 步`;
      ctx.win.setTimeout(() => { try { onDone(); } finally { d.close(); } }, motion ? 900 : 300);
    }
  };
  grid.addEventListener('click', e => {
    if (done) return;
    const b = e.target.closest('.bk-piece');
    if (!b) return;
    const at = Number(b.dataset.at);
    if (picked < 0) { picked = at; paint(); return; }
    swap(picked, at);
  });
  // A piece dragged onto another (pointer events; the tap above does the rest).
  let drag = null;
  grid.addEventListener('pointerdown', e => { const b = e.target.closest('.bk-piece'); if (!b || done) return; drag = {from: Number(b.dataset.at), x: e.clientX, y: e.clientY, moved: false}; });
  grid.addEventListener('pointermove', e => { if (drag && !drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) drag.moved = true; });
  grid.addEventListener('pointerup', e => {
    if (!drag) return;
    const to = ctx.doc.elementFromPoint?.(e.clientX, e.clientY)?.closest?.('.bk-piece');
    if (drag.moved && to) { picked = -1; swap(drag.from, Number(to.dataset.at)); }
    drag = null;
  });
  grid.addEventListener('pointercancel', () => { drag = null; });
  d.body.querySelector('[data-bk-shuffle]').addEventListener('click', () => { if (done) return; order = shuffled(side * side, random); picked = -1; moves = 0; paint(); });
  paint();
  return d;
}
