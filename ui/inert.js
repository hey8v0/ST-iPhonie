// Phone-scoped inert fallback: native support stays native. Older browsers also need keyboard,
// scripted-focus and event protection; pointer-events alone cannot isolate stacked dialogs.
export function inertController(root) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const native = 'inert' in win.HTMLElement.prototype;
  const blocked = new Map(), tabs = new Map();
  const selector = 'a[href],area[href],button,input,select,textarea,iframe,summary,[tabindex],[contenteditable],audio[controls],video[controls]';
  const inside = el => el?.nodeType === 1 && [...blocked.keys()].some(node => node === el || node.contains(el));
  const restoreTab = (el, value) => value === null ? el.removeAttribute('tabindex') : el.setAttribute('tabindex', value);
  function reconcile() {
    for (const [el, value] of tabs) if (!inside(el)) { restoreTab(el, value); tabs.delete(el); }
    for (const node of blocked.keys()) {
      for (const el of [node, ...node.querySelectorAll(selector)]) {
        if (!el.matches(selector)) continue;
        if (!tabs.has(el)) tabs.set(el, el.getAttribute('tabindex'));
        if (el.getAttribute('tabindex') !== '-1') el.setAttribute('tabindex', '-1');
      }
    }
    if (inside(doc.activeElement)) doc.activeElement.blur?.();
  }
  const events = ['click', 'dblclick', 'contextmenu', 'pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'keydown', 'focusin'];
  const pointers = new Set(), touches = new Set();
  const guard = event => {
    const blockedTarget = inside(event.target);
    // Pulling down control center makes its starting surface inert mid-gesture. Let that
    // existing gesture finish (click is still blocked), while refusing any new lower-layer start.
    if (event.type === 'pointerdown') { const id = event.pointerId ?? 0; pointers.delete(id); if (!blockedTarget) pointers.add(id); }
    if (event.type === 'pointerup' || event.type === 'pointercancel') { if (pointers.delete(event.pointerId ?? 0)) return; }
    if (event.type === 'touchstart') for (const touch of event.changedTouches || []) { touches.delete(touch.identifier); if (!blockedTarget) touches.add(touch.identifier); }
    if (event.type === 'touchend' || event.type === 'touchcancel') {
      const ended = [...(event.changedTouches || [])], continuing = ended.length && ended.every(t => touches.has(t.identifier));
      for (const touch of ended) touches.delete(touch.identifier);
      if (continuing) return;
    }
    if (!blockedTarget) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'focusin') event.target.blur?.();
  };
  const observer = native ? null : new win.MutationObserver(reconcile);
  if (!native) for (const type of events) root.addEventListener(type, guard, {capture: true, passive: false});
  let watching = false, disposed = false;
  return {
    set(el, value) {
      if (disposed) return;
      if (native) { el.inert = !!value; return; }
      if (value && !blocked.has(el)) {
        blocked.set(el, {aria: el.getAttribute('aria-hidden'), inert: el.hasAttribute('inert')});
        el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true');
      } else if (!value && blocked.has(el)) {
        const saved = blocked.get(el); blocked.delete(el);
        el.toggleAttribute('inert', saved.inert);
        if (saved.aria === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', saved.aria);
      }
      reconcile();
      if (blocked.size && !watching) { observer.observe(root, {subtree: true, childList: true, attributes: true, attributeFilter: ['tabindex', 'href', 'contenteditable', 'controls']}); watching = true; }
      else if (!blocked.size && watching) { observer.disconnect(); watching = false; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      for (const type of events) root.removeEventListener(type, guard, true);
      for (const [el, saved] of blocked) {
        el.toggleAttribute('inert', saved.inert);
        if (saved.aria === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', saved.aria);
      }
      blocked.clear(); pointers.clear(); touches.clear();
      for (const [el, value] of tabs) restoreTab(el, value);
      tabs.clear();
    }
  };
}
