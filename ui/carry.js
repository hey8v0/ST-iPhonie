// 接住 (carry): a screen change keeps hold of what started it. What is tapped grows into what it opens (an app out of
// its icon as on an iPhone — see launch() —, the call and the notes out of the island, a page out of a card) and
// shrinks back into it on the way out, so the screen is never just swapped for another. Only transform and opacity move (they need no repaint, so the
// phone stays smooth while an app is being built); moves stay short (0.2–0.45 s) and overshoot only a little.
// With reduced motion, or where element.animate is missing (old browsers, the tests), nothing moves and everything
// works the same.

// Springs as CSS linear() curves; browsers without linear() get a cubic-bezier close to them.
const CURVES = {
  // Lands just past its place and back: things that pop out (a note from the island, a card lifting).
  bounce: ['', 'cubic-bezier(.34,1.3,.64,1)'],
  // Settles with a hint of overshoot: big things growing (an app, the call screen).
  soft: ['linear(0, 0.007, 0.028 2.4%, 0.113 5%, 0.508 13.6%, 0.711 19.4%, 0.856 25.6%, 0.948 32.1%, 0.996 39%, 1.018 46.6%, 1.022 54.5%, 1.012 67.6%, 1.003 81.8%, 1)', 'cubic-bezier(.2,.9,.25,1.04)'],
  // Going away: a strong ease-out, no bounce.
  out: ['', 'cubic-bezier(.23,1,.32,1)'],
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
export function grow(win, el, from, {back = false, radius = 16, to = 0, duration = back ? 260 : 400, easing = back ? 'out' : 'soft', fade = back ? 0 : .6} = {}) {
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
/**
 * A full layer (an app, the call screen) opens out of `from` cheaply: a plain stand-in in the source's colours grows
 * from the source to the layer's place (transform only), and the layer fades in over it as it lands; back does the
 * reverse. host: where the stand-in is put (the screen). Returns a promise for the end (null when nothing moves).
 */
export function bloom(win, host, layer, from, {back = false, duration = back ? 300 : 420, paint = null} = {}) {
  if (!moving(win)) return null;
  const r = from?.getBoundingClientRect ? within(from, layer) : from, L = within(layer, host);
  if (!r || !L || !visible(r)) return null;
  const doc = host.ownerDocument, look = from?.getBoundingClientRect ? win.getComputedStyle(from) : null;
  const radius = parseFloat(look?.borderTopLeftRadius) || 16, sx = Math.max(.02, r.width / L.width), sy = Math.max(.02, r.height / L.height);
  const proxy = doc.createElement('div');
  proxy.className = 'carry-proxy';
  proxy.style.cssText = `position:absolute;z-index:60;pointer-events:none;left:${L.left}px;top:${L.top}px;width:${L.width}px;height:${L.height}px;transform-origin:0 0;will-change:transform,opacity;border-radius:${radius / sx}px / ${radius / sy}px;`
    + `background:${paint || (look && look.backgroundImage !== 'none' ? look.backgroundImage + ',' : '') + (look?.backgroundColor && look.backgroundColor !== 'rgba(0, 0, 0, 0)' ? look.backgroundColor : '#000')}`;
  host.append(proxy);
  // The corners: the source's while small (undoing the stretch), the screen's when whole.
  const end = parseFloat(win.getComputedStyle(host).borderTopLeftRadius) || 0;
  const small = {transform: `translate(${r.left}px,${r.top}px) scale(${sx},${sy})`, borderRadius: `${radius / sx}px / ${radius / sy}px`}, whole = {transform: 'translate(0px,0px) scale(1,1)', borderRadius: `${end}px / ${end}px`};
  const ease = curve(win, back ? 'out' : 'soft');
  let grown, shown;
  try {
    grown = proxy.animate(back ? [{...whole, opacity: 0}, {...whole, opacity: 1, offset: .25}, {...small, opacity: 1, offset: .9}, {...small, opacity: 0}] : [{...small, opacity: 1}, {...whole, opacity: 1, offset: .85}, {...whole, opacity: 0}], {duration, easing: ease, fill: 'forwards'});
    shown = layer.animate(back ? [{opacity: 1, transform: 'scale(1)'}, {opacity: 0, transform: 'scale(.94)', offset: .3}, {opacity: 0, transform: 'scale(.94)'}] : [{opacity: 0, transform: 'scale(.94)'}, {opacity: 0, transform: 'scale(.94)', offset: .35}, {opacity: 1, transform: 'scale(1)'}], {duration, easing: 'cubic-bezier(.23,1,.32,1)', fill: back ? 'forwards' : 'none'});
  } catch { proxy.remove(); return null; }
  let stopped = false;
  const done = grown.finished.then(() => { proxy.remove(); return true; }, () => { proxy.remove(); return false; });
  return {finished: done, cancel() { if (stopped) return; stopped = true; grown.cancel(); shown.cancel(); proxy.remove(); }, layer: shown};
}
/**
 * A spring's position at t seconds, 0 → 1, as iOS (SwiftUI) describes one: response (s, how long one swing takes) and
 * damping (1: no overshoot; below 1: a little past and back). velocity: how fast it is already going at the start
 * (in whole distances a second), so a move that turns round keeps its speed instead of hitting a wall.
 */
export function spring(t, {response = .5, damping = 1, velocity = 0} = {}) {
  const w = 2 * Math.PI / response, v = -velocity;
  if (damping >= 1) return 1 - Math.exp(-w * t) * (1 + (v + w) * t);
  const k = damping * w, wd = w * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-k * t) * (Math.cos(wd * t) + (v + k) / wd * Math.sin(wd * t));
}
// Opening barely overshoots (the screen settles, it does not bounce); closing is critically damped, like iOS.
const OPEN = {response: .42, damping: .9, duration: 520}, CLOSE = {response: .36, damping: 1, duration: 420};
const mix = (a, b, o) => a + (b - a) * o, clamp01 = n => Math.min(1, Math.max(0, n));
/**
 * An app opens the way iPhone apps do: its window grows out of the icon, the app already drawn inside it at full
 * size, scaled to the window's width and cut to its height (an outer box stretched to the window, the app inside
 * stretched back), while the icon on top of it fades; the home screen zooms past, toward the icon. back: the window
 * shrinks into the icon and the icon comes back over it. Every frame is worked out from a spring and given as
 * keyframes, so only transform and opacity change on the app (it is never redrawn) and the window never looks stretched.
 * frame: the window (fills host); inner: its one child holding the app; home: the home screen behind.
 * at, speed: how open it is now and how fast that is changing (a launch turned round halfway carries on from there).
 * Returns {finished, cancel(), openness(), speed()} or null when nothing moves.
 */
export function launch(win, host, frame, inner, from, {back = false, at = back ? 1 : 0, speed = 0, home = null} = {}) {
  if (!moving(win) || !inner) return null;
  const box = host.getBoundingClientRect(), W = host.offsetWidth, H = host.offsetHeight;
  if (!box.width || !W || !H) return null;
  // The source in the host's own pixels (the phone itself may be scaled on the page); an icon still springing back
  // from the press is measured at its resting size.
  const k = box.width / W, el = from?.getBoundingClientRect ? from : null, raw = el ? el.getBoundingClientRect() : from;
  if (!raw?.width) return null;
  const w = el?.offsetWidth || raw.width / k, h = el?.offsetHeight || raw.height / k;
  const r = {left: (raw.left + raw.width / 2 - box.left) / k - w / 2, top: (raw.top + raw.height / 2 - box.top) / k - h / 2, width: w, height: h};
  if (!visible({...r, right: W - r.left - r.width, bottom: H - r.top - r.height})) return null;
  const look = el ? win.getComputedStyle(el) : null, iconRadius = parseFloat(look?.borderTopLeftRadius) || 16;
  const screenRadius = parseFloat(win.getComputedStyle(host).borderTopLeftRadius) || 0;
  // The icon over the app while it is small: a copy, at the size the window starts at.
  let icon = null;
  if (el) {
    icon = el.cloneNode(true);
    icon.removeAttribute('id');
    icon.setAttribute('aria-hidden', 'true');
    const band = h * W / w;
    icon.style.cssText += `;position:absolute;left:0;top:${(H - band) / 2}px;width:${w}px;height:${h}px;margin:0;z-index:99;pointer-events:none;transform-origin:0 0;transform:scale(${W / w});transition:none;animation:none`;
    inner.append(icon);
  }
  const {response, damping, duration} = back ? CLOSE : OPEN, to = back ? 0 : 1, span = to - at;
  const velocity = Math.abs(span) > .001 ? speed / span : 0, place = t => mix(at, to, spring(t, {response, damping, velocity}));
  const steps = Math.round(duration / 1000 * 60), outer = [], corners = [], inside = [], fade = [], behind = [];
  for (let i = 0; i <= steps; i++) {
    const o = i === steps ? to : place(i / steps * duration / 1000);
    const left = mix(r.left, 0, o), top = mix(r.top, 0, o), width = mix(r.width, W, o), height = mix(r.height, H, o);
    const sx = Math.max(.01, width / W), sy = Math.max(.01, height / H), round = mix(iconRadius, screenRadius, clamp01(o));
    outer.push({transform: `translate(${left}px,${top}px) scale(${sx},${sy})`});
    corners.push({borderRadius: `${round / sx}px / ${round / sy}px`});
    inside.push({transform: `translate(0px,${(height - H * sx) / 2 / sy}px) scale(1,${sx / sy})`});
    fade.push({opacity: clamp01(1 - o / .4)});
    behind.push({transform: `scale(${mix(1, 1.12, clamp01(o))})`, opacity: clamp01(1 - o * 1.1)});
  }
  const timing = {duration, easing: 'linear', fill: 'both'}, started = win.performance?.now?.() ?? Date.now();
  let moves;
  try {
    frame.style.transformOrigin = '0 0';
    inner.style.transformOrigin = '0 0';
    if (home) home.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
    // The corners on their own: border-radius cannot run off the main thread, and sharing an animation with the
    // transform would keep the transform there too.
    moves = [frame.animate(outer, timing), inner.animate(inside, timing), icon?.animate(fade, timing), home?.animate(behind, timing), frame.animate(corners, timing)].filter(Boolean);
  } catch { icon?.remove(); return null; }
  let stopped = false;
  const elapsed = () => Math.min(duration, (win.performance?.now?.() ?? Date.now()) - started) / 1000;
  const tidy = () => { icon?.remove(); for (const a of moves) a.cancel(); frame.style.transformOrigin = inner.style.transformOrigin = ''; if (home) home.style.transformOrigin = ''; };
  return {
    finished: moves[0].finished.then(() => true, () => false),
    /** How open the window is right now (0: the icon, 1: the whole screen). */
    openness() { const t = elapsed(); return t >= duration / 1000 ? to : place(t); },
    /** How fast it is opening (or, below 0, closing), in whole openings a second. */
    speed() { const t = elapsed(); return t >= duration / 1000 ? 0 : (place(t + .004) - place(t)) / .004; },
    cancel() { if (stopped) return; stopped = true; tidy(); },
  };
}
/** An element flies from where `rect` (a getBoundingClientRect from before) was to where it is now (FLIP). */
export function fly(win, el, rect, {duration = 360, easing = 'bounce'} = {}) {
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
