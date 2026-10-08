// 接住 (carry): a screen change keeps hold of what started it. What is tapped grows into what it opens (an app out of
// its icon, the call and the notes out of the island, a page out of a card) and shrinks back into it on the way out,
// so the screen is never just swapped for another. The moves run on spring curves: quick out, a small overshoot, then
// still. With reduced motion, or where element.animate is missing (old browsers, the tests), nothing moves and
// everything works the same.

// Springs as CSS linear() curves; browsers without linear() get a cubic-bezier close to them.
const CURVES = {
  // Lands with one small bounce: things that pop out (a note from the island, a card lifting).
  bounce: ['linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1)', 'cubic-bezier(.34,1.4,.64,1)'],
  // Settles with a hint of overshoot: big things growing (an app, the call screen).
  soft: ['linear(0, 0.007, 0.028 2.4%, 0.113 5%, 0.508 13.6%, 0.711 19.4%, 0.856 25.6%, 0.948 32.1%, 0.996 39%, 1.018 46.6%, 1.022 54.5%, 1.012 67.6%, 1.003 81.8%, 1)', 'cubic-bezier(.2,.9,.25,1.04)'],
  // Going away: no bounce, quick at the end.
  out: ['', 'cubic-bezier(.4,0,.2,1)'],
};
export function curve(win, name) {
  const [spring, plain] = CURVES[name] || CURVES.soft;
  return spring && win.CSS?.supports?.('transition-timing-function', 'linear(0, 1)') ? spring : plain;
}
export const moving = win => typeof win.Element?.prototype?.animate === 'function' && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Where `el` is inside `box`, measured now: {top, left, width, height, right, bottom} in box pixels. */
export function within(el, box) {
  const r = el?.getBoundingClientRect?.(), b = box?.getBoundingClientRect?.();
  if (!r || !b || !r.width || !b.width) return null;
  return {top: r.top - b.top, left: r.left - b.left, width: r.width, height: r.height, right: b.right - r.right, bottom: b.bottom - r.bottom, box: b};
}
/** Whether a rect from within() can be seen in its box (an icon on another home page cannot). */
export const visible = r => !!r && r.left > -r.width / 2 && r.top > -r.height / 2 && r.right > -r.width / 2 && r.bottom > -r.height / 2;

/** The island inside `el`; where it is not drawn (a real phone shows it only while something plays), a pill of its
 *  size at its place, so things still come out of the top middle. */
export function islandIn(island, el) {
  const r = within(island, el);
  if (r) return r;
  const b = el?.getBoundingClientRect?.();
  if (!b?.width) return null;
  // The island's top in the screen they share, made relative to el.
  const screen = el.offsetParent?.getBoundingClientRect?.(), islandTop = parseFloat(el.ownerDocument.defaultView.getComputedStyle(island).top) || 10;
  const w = Math.min(118, b.width), h = 33, top = screen ? islandTop - (b.top - screen.top) : 0;
  return {top, left: (b.width - w) / 2, width: w, height: h, right: (b.width - w) / 2, bottom: b.height - top - h, box: b};
}
/**
 * The layer `el` grows out of `from` (an element, or a rect inside el from within()), or with back shrinks into it.
 * The whole layer is scaled down to the source's width and clipped to its height, so it reads as the source becoming
 * the layer (an app zooming out of its icon). radius: the source's corners; to: the layer's own.
 * Returns the Animation, or null when nothing moves (then the caller just shows or hides the layer).
 */
export function grow(win, el, from, {back = false, radius = 16, to = 0, duration = back ? 380 : 540, easing = back ? 'out' : 'soft', fade = back ? 0 : .6} = {}) {
  if (!moving(win)) return null;
  const r = from?.getBoundingClientRect ? within(from, el) : from;
  if (!r || !visible(r)) return null;
  const W = r.box.width, H = r.box.height, s = Math.max(.02, r.width / W);
  const dx = r.left + r.width / 2 - W / 2, dy = r.top + r.height / 2 - H / 2;
  // In the layer's own pixels: what is left of its height once scaled to the source's width.
  const cut = Math.max(0, (H - r.height / s) / 2);
  const small = {transform: `translate(${dx}px,${dy}px) scale(${s})`, clipPath: `inset(${cut}px 0px ${cut}px 0px round ${radius / s}px)`, opacity: fade};
  const whole = {transform: 'translate(0px,0px) scale(1)', clipPath: `inset(0px 0px 0px 0px round ${to}px)`, opacity: 1};
  try {
    return el.animate(back ? [whole, {...small, opacity: fade || 0}] : [small, whole], {duration, easing: curve(win, easing), fill: back ? 'forwards' : 'none'});
  } catch { return null; }
}
/** An element flies from where `rect` (a getBoundingClientRect from before) was to where it is now (FLIP). */
export function fly(win, el, rect, {duration = 520, easing = 'bounce'} = {}) {
  if (!moving(win) || !rect?.width || !el) return null;
  const now = el.getBoundingClientRect();
  if (!now.width) return null;
  const s = rect.width / now.width, dx = rect.left - now.left + (rect.width - now.width) / 2, dy = rect.top - now.top + (rect.height - now.height) / 2;
  try { return el.animate([{transform: `translate(${dx}px,${dy}px) scale(${s})`}, {transform: 'none'}], {duration, easing: curve(win, easing)}); } catch { return null; }
}
/** A short move on an element (keyframes), on a named curve; null when nothing moves. */
export function nudge(win, el, frames, {duration = 420, easing = 'bounce', fill = 'none'} = {}) {
  if (!moving(win) || !el) return null;
  try { return el.animate(frames, {duration, easing: curve(win, easing), fill}); } catch { return null; }
}
