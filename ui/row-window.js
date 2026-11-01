// A long list of rows, kept the way the album keeps its photos (photo-wall.js): every stretch of rows has its place on the page, and
// only the stretches near the screen really have their rows. Rows are as tall as their words, so each one's height is remembered from
// when it was on the page: a stretch off the screen is as tall as it was, and a list drawn again (a row deleted) stays where it is.

/** Rows in a stretch. */
const PIECE = 24;
/** How far off the screen a stretch is there already, so a flick does not outrun it. */
const NEAR = 1200;
/** A row's height before any has been seen. */
const GUESS = 72;

/**
 * id(item): who it is. row(item): its HTML, asked each time it comes near. filled(element): rows have come in this element (their pictures
 * can follow). html(items) gives the stretches, with their rows where the screen is now, so that rows of a list drawn again can glide;
 * mount(list, scroller) goes with it, once that is on the page.
 */
export function rowWindow({win, id, row, filled = () => {}}) {
  const tall = new Map();
  let scroller = null, pieces = [], draft = [], watcher = null;
  // As laid out, to the fraction: an app opening again is scaled while it grows, and hidden it measures nothing.
  const tallOf = el => parseFloat(win.getComputedStyle(el).height) || 0;
  // What lies between the rows (a gap, a margin) goes with them: the sum is the stretch's height to the fraction.
  const remember = piece => {
    const rows = [...piece.el.children], heights = rows.map(tallOf);
    if (!rows.length || !heights.every(Boolean)) return;
    const between = (tallOf(piece.el) - heights.reduce((a, b) => a + b)) / rows.length;
    rows.forEach((el, i) => tall.set(id(piece.items[i]), heights[i] + between));
  };
  function fill(piece) {
    if (piece.live) return;
    piece.live = true;
    piece.el.style.height = '';
    piece.el.innerHTML = piece.items.map(row).join('');
    filled(piece.el);
  }
  function empty(piece) {
    if (!piece.live) return;
    piece.live = false;
    remember(piece);
    piece.el.style.height = tallOf(piece.el) + 'px';
    piece.el.textContent = '';
  }
  function html(items) {
    const seen = scroller?.clientHeight, view = seen || win.innerHeight || 800, y = seen ? scroller.scrollTop : 0, first = pieces[0]?.el;
    for (const piece of pieces) if (piece.live && piece.el.isConnected) remember(piece);
    const guess = tall.size ? [...tall.values()].reduce((a, b) => a + b) / tall.size : GUESS;
    let at = seen && first?.isConnected ? first.getBoundingClientRect().top - scroller.getBoundingClientRect().top + y : 0, out = '';
    draft = [];
    for (let i = 0; i < items.length; i += PIECE) {
      const part = items.slice(i, i + PIECE), height = part.reduce((n, item) => n + (tall.get(id(item)) ?? guess), 0), live = at < y + view + NEAR && at + height > y - NEAR;
      out += `<div class="row-piece" data-piece="${draft.length}"${live ? `>${part.map(row).join('')}` : ` style="height:${height}px">`}</div>`;
      draft.push({items: part, live, el: null});
      at += height;
    }
    return out;
  }
  function mount(list, root) {
    watcher?.disconnect();
    watcher = null;
    scroller = root;
    pieces = draft;
    draft = [];
    pieces.forEach((piece, i) => { piece.el = list.children[i]; if (piece.live) filled(piece.el); });
    if (!win.IntersectionObserver) { pieces.forEach(fill); return; }
    // Hidden behind another app, everything counts as off the screen, and stays as it is for coming back.
    watcher = new win.IntersectionObserver(entries => { if (scroller.clientHeight) for (const e of entries) { const piece = pieces[e.target.dataset.piece]; if (piece) (e.isIntersecting ? fill : empty)(piece); } }, {root, rootMargin: `${NEAR}px 0px`});
    for (const piece of pieces) watcher.observe(piece.el);
  }
  function stop() {
    watcher?.disconnect();
    watcher = null;
    pieces = [];
    draft = [];
  }
  return {html, mount, stop};
}
