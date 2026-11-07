// A long grid of photos, the way a phone's album keeps one: every stretch of photos has its place on the page at its right
// height, and only the stretches near the screen really have their tiles. Thousands of tiles on a page are paid for on
// every frame and every touch, however few of them show; so are their small pictures, read when they come near and let go.
import {esc} from './common.js';
import {eachThumb} from './thumbs.js';

/** Tiles in a stretch, in whole rows so a long day goes on without a seam (phone.css .photo-piece works out its height). */
const PIECE = 24;
/** How far off the screen a stretch is there already, so a flick does not outrun it. */
const NEAR = 900;

/**
 * tile(row, url): a tile's HTML, url being its small picture when that is known; its <img> has data-photo. html(groups, classes)
 * gives the grid for [{label, rows}]; mount(scroller) goes with it, once that is on the page. Without html, mount leaves none.
 */
export function photoWall({api, win, tile}) {
  const urls = new Map();
  let scroller = null, pieces = [], draft = null, where = new Map(), watcher = null;
  const put = (piece, id, blob) => {
    if (!urls.has(id)) urls.set(id, win.URL.createObjectURL(blob));
    for (const b of piece.el.children) if (b.dataset.id === id) { const img = b.querySelector('img'); if (img) img.src = urls.get(id); }
  };
  function fill(piece) {
    if (piece.live) return;
    piece.live = true;
    const turn = ++piece.turn;
    piece.el.innerHTML = piece.rows.map(row => tile(row, urls.get(row.id))).join('');
    const want = piece.rows.filter(row => !urls.has(row.id));
    if (want.length) eachThumb(api, want, (id, blob) => put(piece, id, blob), () => piece.turn === turn && pieces.includes(piece)).catch(() => {});
  }
  function empty(piece) {
    if (!piece.live) return;
    piece.live = false;
    piece.turn++;
    piece.el.textContent = '';
    for (const {id} of piece.rows) if (urls.has(id)) { win.URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  }
  function html(groups, classes = '') {
    draft = {pieces: [], where: new Map()};
    return groups.map(({label, rows}) => {
      let out = label ? `<h3 class="photo-day">${esc(label)}</h3>` : '';
      for (let at = 0; at < rows.length; at += PIECE) {
        const piece = {rows: rows.slice(at, at + PIECE), el: null, live: false, turn: 0};
        for (const row of piece.rows) draft.where.set(row.id, piece);
        out += `<div class="photo-grid photo-piece${classes}" style="--rows:${Math.ceil(piece.rows.length / 3)}" data-piece="${draft.pieces.push(piece) - 1}"></div>`;
      }
      return out;
    }).join('');
  }
  function mount(root) {
    watcher?.disconnect();
    watcher = null;
    scroller = root;
    pieces = draft?.pieces || [];
    where = draft?.where || new Map();
    draft = null;
    for (const el of root.querySelectorAll('[data-piece]')) if (pieces[el.dataset.piece]) pieces[el.dataset.piece].el = el;
    // A draft the page never drew (the grid was made for a page that turned out the same as before, or a page without
    // a grid came instead): its pieces have no element and are not on the page (0.9.39: they threw on the second visit).
    pieces = pieces.filter(piece => piece.el);
    for (const [id, piece] of where) if (!piece.el) where.delete(id);
    if (win.IntersectionObserver) {
      // Hidden behind another app, everything counts as off the screen, and stays as it is for coming back.
      watcher = new win.IntersectionObserver(entries => { if (scroller.clientHeight) for (const e of entries) { const piece = pieces[e.target.dataset.piece]; if (piece) (e.isIntersecting ? fill : empty)(piece); } }, {root, rootMargin: `${NEAR}px 0px`});
      // What shows comes at once, not a frame later.
      if (root.clientHeight) { const box = root.getBoundingClientRect(); for (const piece of pieces) { const r = piece.el.getBoundingClientRect(); if (r.bottom > box.top - NEAR && r.top < box.bottom + NEAR) fill(piece); } }
      for (const piece of pieces) watcher.observe(piece.el);
    } else pieces.forEach(fill);
    // The pictures of another page's stretches go.
    for (const [id, url] of urls) if (!where.get(id)?.live) { win.URL.revokeObjectURL(url); urls.delete(id); }
  }
  /** The tile of a photo, on the screen: its stretch comes if it was away, the page goes to it. Null when it is not in the grid. */
  function reveal(id) {
    const piece = where.get(id);
    if (!piece?.el?.isConnected) return null;
    fill(piece);
    const el = [...piece.el.children].find(b => b.dataset.id === id);
    if (!el) return null;
    const box = scroller.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) scroller.scrollTop += r.top - box.top - (box.height - r.height) / 2;
    return el;
  }
  function stop() {
    watcher?.disconnect();
    watcher = null;
    pieces.forEach(empty);
    for (const url of urls.values()) win.URL.revokeObjectURL(url);
    urls.clear();
    pieces = [];
    where = new Map();
  }
  return {html, mount, reveal, stop};
}
