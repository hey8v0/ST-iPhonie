import {icon} from './icons.js';

// Store editing commands rather than full-size pixel buffers. A new edit drops the redo branch.
export function cutoutHistory(initial = {cut: true, strength: 40, taps: []}) {
  let states = [structuredClone(initial)], index = 0;
  return {
    get value() { return structuredClone(states[index]); },
    get canUndo() { return index > 0; },
    get canRedo() { return index < states.length - 1; },
    edit(value) {
      if (JSON.stringify(value) === JSON.stringify(states[index])) return false;
      states = states.slice(0, index + 1);
      states.push(structuredClone(value)); index++;
      return true;
    },
    undo() { if (!index) return false; index--; return true; },
    redo() { if (index >= states.length - 1) return false; index++; return true; }
  };
}

const CSS = `
.sttts-cutout{position:fixed;left:0;top:0;box-sizing:border-box;margin:0;padding:0;border:0;max-width:none;max-height:none;width:100vw;height:100vh;height:100dvh;z-index:40001;background:#111522;color:#fff;touch-action:none;overscroll-behavior:contain;user-select:none;-webkit-user-select:none;font:14px/1.4 system-ui,sans-serif}
.sttts-cutout::backdrop{background:transparent}
.sttts-cutout-stage{position:absolute;inset:64px 0 88px;overflow:hidden;touch-action:none}
.sttts-cutout-stage canvas{position:absolute;left:0;top:0;display:block;max-width:none;max-height:none;transform-origin:0 0;cursor:crosshair;touch-action:none;background:conic-gradient(#cbd0da 25%,#fff 0 50%,#cbd0da 0 75%,#fff 0) 0 0/16px 16px}
.sttts-cutout-top{position:absolute;top:max(12px,env(safe-area-inset-top));right:12px}
.sttts-cutout-bar{position:absolute;bottom:max(14px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:4px;border-radius:28px;background:#252b40;max-width:calc(100vw - 16px);box-sizing:border-box;overflow-x:auto;scrollbar-width:none}
.sttts-cutout button{all:unset;box-sizing:border-box;display:grid;place-items:center;flex-shrink:0;width:44px;height:44px;border-radius:50%;cursor:pointer;color:#fff}
.sttts-cutout button:hover{background:#ffffff18}.sttts-cutout button:focus-visible{outline:2px solid #7cc4ff}.sttts-cutout button:disabled{opacity:.3;cursor:default}
.sttts-cutout .icon{width:22px;height:22px}.sttts-cutout [data-cutout=redo] svg{transform:scaleX(-1)}
.sttts-cutout output{min-width:48px;text-align:center;font-variant-numeric:tabular-nums;font-size:12px}
`;

/** Moves the live preview canvas into a full-screen editor and restores it on close. */
export function openCutoutEditor({doc, canvas, history, onErase, onUndo, onRedo, onDownload, onClose = () => {}}) {
  const focus = doc.activeElement;
  // Match the album's full-page presentation when the phone is embedded in a same-origin frame.
  try { while (doc.defaultView.parent !== doc.defaultView && doc.defaultView.parent.document.body) doc = doc.defaultView.parent.document; } catch {}
  const win = doc.defaultView, controller = new win.AbortController();
  const listen = (el, name, fn, options = {}) => el.addEventListener(name, fn, {...options, signal: controller.signal});
  if (!doc.getElementById('sttts-cutout-style')) {
    const style = doc.createElement('style'); style.id = 'sttts-cutout-style'; style.textContent = CSS; doc.head.append(style);
  }
  const placeholder = canvas.ownerDocument.createComment('cutout-preview'), oldStyle = canvas.getAttribute('style');
  canvas.before(placeholder);
  // The phone itself uses showModal() on mobile: a z-index overlay in body is always behind that top layer.
  const root = doc.createElement(typeof win.HTMLDialogElement?.prototype.showModal === 'function' ? 'dialog' : 'div');
  root.className = 'sttts-cutout'; root.tabIndex = -1;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '编辑去背景');
  const button = (action, label, art) => `<button type="button" data-cutout="${action}" aria-label="${label}" title="${label}">${art}</button>`;
  root.innerHTML = `<div class="sttts-cutout-stage"></div><div class="sttts-cutout-top">${button('close', '完成', icon('check'))}</div><div class="sttts-cutout-bar">${button('undo', '撤回', icon('undo'))}${button('redo', '重做', icon('undo'))}${button('out', '缩小', '−')}<output></output>${button('in', '放大', '+')}${button('download', '下载', icon('download'))}</div>`;
  const stage = root.querySelector('.sttts-cutout-stage'); doc.body.append(root);
  try { root.showModal?.(); }
  catch (error) { root.remove(); placeholder.remove(); throw error; }
  // Only take the preview out after the editor has successfully entered the visible layer.
  stage.append(canvas);
  let scale = 1, fit = 1, x = 0, y = 0, closed = false, downloading = false;
  const pointers = new Map(); let gesture = null;
  const size = () => ({w: stage.clientWidth || win.innerWidth, h: stage.clientHeight || Math.max(1, win.innerHeight - 152)});
  const point = e => { const r = stage.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
  function refresh() {
    root.querySelector('[data-cutout=undo]').disabled = !history.canUndo;
    root.querySelector('[data-cutout=redo]').disabled = !history.canRedo;
    root.querySelector('[data-cutout=download]').disabled = downloading;
  }
  function apply() {
    const {w, h} = size(), cw = canvas.width * scale, ch = canvas.height * scale;
    x = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, x));
    y = ch <= h ? (h - ch) / 2 : Math.min(0, Math.max(h - ch, y));
    canvas.style.width = `${canvas.width}px`; canvas.style.height = `${canvas.height}px`;
    canvas.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    root.querySelector('output').textContent = `${Math.round(scale * 100)}%`;
  }
  function home() { const {w, h} = size(); fit = Math.min(w / canvas.width, h / canvas.height); scale = fit; x = y = 0; apply(); }
  function zoom(next, px, py) {
    next = Math.max(fit, Math.min(Math.max(12, fit * 12), next));
    x = px - (px - x) * next / scale; y = py - (py - y) * next / scale; scale = next;
  }
  function close() {
    if (closed) return;
    closed = true; controller.abort(); pointers.clear();
    if (root.open) root.close();
    placeholder.replaceWith(canvas);
    if (oldStyle === null) canvas.removeAttribute('style'); else canvas.setAttribute('style', oldStyle);
    root.remove(); if (focus?.isConnected) focus.focus({preventScroll: true}); onClose();
  }
  listen(stage, 'pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const p = point(e);
    if (!pointers.size) gesture = {max: 0, moved: false, cancelled: false, started: win.performance.now()};
    pointers.set(e.pointerId, {...p, startX: p.x, startY: p.y});
    gesture.max = Math.max(gesture.max, pointers.size);
    stage.setPointerCapture?.(e.pointerId);
  });
  listen(stage, 'pointermove', e => {
    const before = pointers.get(e.pointerId); if (!before) return;
    const p = point(e), all = [...pointers.values()];
    if (Math.hypot(p.x - before.startX, p.y - before.startY) > 8) gesture.moved = true;
    if (pointers.size === 2) {
      const other = all.find(v => v !== before), cx = (before.x + other.x) / 2, cy = (before.y + other.y) / 2;
      const distance = Math.hypot(before.x - other.x, before.y - other.y);
      if (distance > 0) zoom(scale * Math.hypot(p.x - other.x, p.y - other.y) / distance, cx, cy);
      x += (p.x - before.x) / 2; y += (p.y - before.y) / 2;
    } else if (pointers.size === 1 && gesture.moved) { x += p.x - before.x; y += p.y - before.y; }
    Object.assign(before, p); apply();
  });
  function finish(e, cancelled = false) {
    const p = pointers.get(e.pointerId); if (!p) return;
    const end = point(e);
    if (Math.hypot(end.x - p.startX, end.y - p.startY) > 8) gesture.moved = true;
    gesture.cancelled ||= cancelled;
    pointers.delete(e.pointerId);
    if (pointers.size) return;
    if (!gesture.cancelled && !gesture.moved) {
      if (gesture.max === 1) {
        const px = (end.x - x) / scale, py = (end.y - y) / scale;
        if (px >= 0 && py >= 0 && px < canvas.width && py < canvas.height) onErase({x: px, y: py});
      } else if (win.performance.now() - gesture.started < 350) {
        if (gesture.max === 2) onUndo();
        if (gesture.max === 3) onRedo();
      }
    }
    gesture = null; refresh();
  }
  listen(stage, 'pointerup', e => finish(e));
  listen(stage, 'pointercancel', e => finish(e, true));
  listen(stage, 'lostpointercapture', e => finish(e, true));
  listen(stage, 'wheel', e => { e.preventDefault(); if (gesture) gesture.moved = true; const p = point(e); zoom(scale * Math.exp(-e.deltaY * .002), p.x, p.y); apply(); }, {passive: false});
  listen(root, 'click', async e => {
    const action = e.target.closest('[data-cutout]')?.dataset.cutout;
    if (action === 'close') close();
    if (action === 'undo') onUndo();
    if (action === 'redo') onRedo();
    if (action === 'in' || action === 'out') { const {w, h} = size(); zoom(scale * (action === 'in' ? 1.5 : 1 / 1.5), w / 2, h / 2); apply(); }
    if (action === 'download' && !downloading) {
      downloading = true; refresh();
      try { await onDownload(doc); } finally { downloading = false; }
    }
    refresh();
  });
  listen(root, 'keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
      e.preventDefault(); e.stopPropagation();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) onRedo(); else onUndo(); refresh();
    }
    if (e.key === 'Tab') {
      const buttons = [...root.querySelectorAll('button')].filter(b => !b.disabled), i = buttons.indexOf(doc.activeElement);
      e.preventDefault(); buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
  });
  const cancelGesture = () => { pointers.clear(); gesture = null; };
  listen(win, 'blur', cancelGesture);
  listen(win, 'resize', () => { cancelGesture(); home(); });
  listen(win, 'pagehide', close);
  listen(root, 'cancel', e => { e.preventDefault(); close(); });
  listen(root, 'close', close);
  home(); refresh(); root.focus({preventScroll: true});
  return {close, refresh};
}
