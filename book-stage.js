// 绘本 over the whole tavern page: the book from the phone's 绘本 app opened to read on a big screen (and on a phone,
// without the phone's frame) — two pages at a time where the screen is wide, one filling it where it is tall. ⛶ asks
// the browser for the whole screen as well. Esc or ✕ closes it. The reader itself is book-reader.js.
import {mountBookReader, bookStyles} from './book-reader.js';

const STYLE_ID = 'sttts-book-stage-style';
const CSS = `.sttts-book{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;z-index:32000;background:#121016;opacity:0;transition:opacity .4s}
.sttts-book[data-in]{opacity:1}`;

/**
 * Opens the book: picture(p) → its address; sprite(name, emotion) → a 立绘's; read(lines, onLine) → resolves when read
 * (false: nothing could be); stop(); sound(kind, name): a page's ambience or sound; onClose(at): it was closed at page
 * `at`. Returns {close, refresh, closed}.
 */
export function openBookStage({doc, book, at = 0, picture, sprite, read, stop, sound = null, onClose = () => {}}) {
  bookStyles(doc);
  if (!doc.getElementById(STYLE_ID)) { const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; doc.head.append(s); }
  const shell = doc.createElement('div');
  shell.className = 'sttts-book';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-label', book.title);
  doc.body.append(shell);
  let closed = false;
  const full = () => {
    if (doc.fullscreenElement) doc.exitFullscreen?.().catch(() => {});
    else shell.requestFullscreen?.().catch(() => {});
  };
  const reader = mountBookReader({doc, root: shell, book, picture, sprite, read, stop, sound, at, two: true, onClose: () => close(), onFull: shell.requestFullscreen ? full : null});
  doc.defaultView.requestAnimationFrame(() => shell.setAttribute('data-in', ''));
  shell.querySelector('.bkr')?.focus?.({preventScroll: true});
  function close() {
    if (closed) return;
    closed = true;
    const page = reader.at;
    if (doc.fullscreenElement === shell) doc.exitFullscreen?.().catch(() => {});
    reader.destroy();
    shell.removeAttribute('data-in');
    doc.defaultView.setTimeout(() => shell.remove(), 400);
    onClose(page);
  }
  return {close, refresh: next => reader.refresh(next), get closed() { return closed; }, get at() { return reader.at; }};
}
