import {icon} from './icons.js';

const IDLE = 1000, SIDES = 6, HANDLE = 44;
const MIN_VIEW_HEIGHT = 144, MIN_SCROLL_RANGE = 480, MIN_SCROLL_SCREENS = 1.5;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const overflow = value => value === 'auto' || value === 'scroll' || value === 'overlay';
const longEnough = (height, distance) =>
  height >= MIN_VIEW_HEIGHT && distance >= Math.max(MIN_SCROLL_RANGE, height * MIN_SCROLL_SCREENS);

/** One handle follows the long scroll area that was just scrolled, including nested lists and sheets. */
export function installFastScroll(win, root, signal) {
  const layer = root.ownerDocument.createElement('div');
  layer.className = 'fast-scroll';
  layer.hidden = true;
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<button type="button" role="slider" aria-label="快速滚动" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" disabled><span aria-hidden="true">' + icon('fastScroll') + '</span></button><span class="fast-scroll-label" aria-hidden="true"></span>';
  root.append(layer);
  const handle = layer.firstElementChild, label = layer.lastElementChild;
  let active = null, timer = 0, frame = 0, drag = null, travel = 0, sections = [];
  const range = el => Math.max(0, el.scrollHeight - el.clientHeight);
  const idle = () => {
    win.clearTimeout(timer);
    if (active && !drag && handle.ownerDocument.activeElement !== handle) timer = win.setTimeout(() => hide(false), IDLE);
  };

  function hide(immediate = true) {
    win.clearTimeout(timer);
    win.cancelAnimationFrame(frame);
    frame = 0;
    const pointer = drag?.pointer;
    active?.removeAttribute('data-fast-scrolling');
    active = drag = null;
    sections = [];
    if (pointer !== undefined && handle.hasPointerCapture?.(pointer)) handle.releasePointerCapture(pointer);
    layer.classList.remove('dragging');
    layer.removeAttribute('data-visible');
    layer.setAttribute('aria-hidden', 'true');
    handle.disabled = true;
    if (!immediate) return;
    layer.hidden = true;
    if (layer.parentElement !== root) root.append(layer);
  }

  function update() {
    frame = 0;
    if (!active || !root.contains(active) || active.closest('[hidden],[inert],.overlay-out')) return hide();
    const height = active.clientHeight, max = range(active);
    if (!longEnough(height, max)) return hide();
    const boundary = active.closest('.sheet') || root;
    if (layer.parentElement !== boundary) boundary.append(layer);
    const rootBox = boundary.getBoundingClientRect(), box = active.getBoundingClientRect();
    const scaleY = rootBox.height / boundary.offsetHeight || 1, scaleX = rootBox.width / boundary.offsetWidth || 1;
    let top = Math.max(box.top, rootBox.top), bottom = Math.min(box.bottom, rootBox.bottom);
    for (let parent = active.parentElement; parent && parent !== boundary; parent = parent.parentElement) {
      if (win.getComputedStyle(parent).overflowY === 'visible') continue;
      const clip = parent.getBoundingClientRect();
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
    const visibleHeight = (bottom - top) / scaleY;
    const left = Math.max(box.left, rootBox.left), right = Math.min(box.right, rootBox.right);
    if (visibleHeight < 96 || right <= left) return hide();
    travel = visibleHeight - HANDLE - SIDES * 2;
    const ratio = clamp(active.scrollTop / max, 0, 1), percent = Math.round(ratio * 100);
    Object.assign(layer.style, {
      top: ((top - rootBox.top) / scaleY - boundary.clientTop) + 'px',
      left: ((left - rootBox.left) / scaleX - boundary.clientLeft) + 'px',
      width: ((right - left) / scaleX) + 'px', height: visibleHeight + 'px'
    });
    layer.style.setProperty('--fast-scroll-top', (SIDES + travel * ratio) + 'px');
    handle.setAttribute('aria-valuenow', String(percent));
    if (drag) {
      let start = 0, end = sections.length;
      while (start < end) {
        const middle = (start + end) >> 1;
        if (sections[middle].getBoundingClientRect().top <= top + 18) start = middle + 1;
        else end = middle;
      }
      label.textContent = sections[Math.max(0, start - 1)]?.textContent || percent + '%';
    }
    if (handle.disabled) {
      if (layer.hidden) {
        layer.hidden = false;
        // Commit the resting style before the first fade-in from a closed page or sheet.
        void layer.offsetWidth;
      }
      handle.disabled = false;
      layer.removeAttribute('aria-hidden');
      layer.dataset.visible = '';
    }
  }

  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(update); };
  root.addEventListener('scroll', event => {
    const el = event.target;
    if (!(el instanceof win.HTMLElement) || el === root || (drag && el !== active)) return;
    if (el !== active) {
      if (el.matches('textarea,input,select') || el.isContentEditable
        || !longEnough(el.clientHeight, range(el)) || !overflow(win.getComputedStyle(el).overflowY)) return;
      active = el;
    }
    schedule();
    idle();
  }, {capture: true, passive: true, signal});

  handle.addEventListener('pointerdown', event => {
    if (!active || drag || event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    drag = {pointer: event.pointerId, y: event.clientY, ratio: active.scrollTop / range(active),
      distance: travel * (layer.getBoundingClientRect().height / layer.offsetHeight || 1)};
    sections = [...active.querySelectorAll('.photo-day')];
    active.setAttribute('data-fast-scrolling', '');
    layer.classList.add('dragging');
    win.clearTimeout(timer);
    schedule();
  }, {signal});
  function scrollTo(top) {
    active.scrollTop = clamp(top, 0, range(active));
    schedule();
  }
  handle.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId || !active) return;
    scrollTo((drag.ratio + (event.clientY - drag.y) / drag.distance) * range(active));
  }, {signal});
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(type, event => {
    if (drag?.pointer !== event.pointerId) return;
    drag = null;
    sections = [];
    active?.removeAttribute('data-fast-scrolling');
    layer.classList.remove('dragging');
    idle();
  }, {signal});
  handle.addEventListener('keydown', event => {
    if (!active) return;
    const page = active.clientHeight, top = active.scrollTop;
    const next = {ArrowUp: top - 48, ArrowDown: top + 48, PageUp: top - page, PageDown: top + page, Home: 0, End: range(active)}[event.key];
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    scrollTo(next);
  }, {signal});
  handle.addEventListener('focus', () => win.clearTimeout(timer), {signal});
  handle.addEventListener('blur', idle, {signal});
  win.addEventListener('resize', () => { if (active) schedule(); }, {signal});
  win.addEventListener('blur', () => hide(), {signal});
  signal.addEventListener('abort', () => { hide(); layer.remove(); }, {once: true});
  return hide;
}
