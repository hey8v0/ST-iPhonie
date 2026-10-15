// 画画的画面: shows the picture turned, moved and zoomed, and turns pens, fingers and the mouse into strokes and
// gestures, as on Procreate:
// - a pen, a finger or the mouse draws (画笔, 橡皮, 涂抹); once a pen has been seen, fingers no longer draw;
// - two fingers pinch, turn and move the picture; a quick pinch in puts the whole picture back on screen; a quick
//   two-finger tap undoes, three fingers redo;
// - holding still for a moment picks the colour under the point;
// - 柳叶笔 (a brush with lasso): draw round a shape and it is filled, or with 橡皮 emptied, when the pen lifts;
// - 选区: drag a box, or draw round what to select; 变形: drag to move, the corners to scale, the dot above to turn,
//   two fingers to scale and turn;
// - on a computer: the wheel zooms where the pointer is, space or the middle button drags the picture.
import {beginStroke, extendStroke, endStroke, compose, colorAt, steady, tracePath, floatCorners} from './engine.js';

const HOLD = 480, TAP = 280, HANDLE = 24, SNAP = 320;
/** The view's turn, place and zoom: picture point → screen point, and back. */
export function viewMath(t) {
  const cos = Math.cos(t.angle), sin = Math.sin(t.angle);
  return {
    toScreen: (x, y) => ({x: t.x + (x * cos - y * sin) * t.scale, y: t.y + (x * sin + y * cos) * t.scale}),
    toPicture: (x, y) => { const dx = (x - t.x) / t.scale, dy = (y - t.y) / t.scale; return {x: dx * cos + dy * sin, y: -dx * sin + dy * cos}; },
  };
}
/** The view that shows the whole picture in a box w×h, upright. */
export function fitView(pic, w, h) {
  const scale = Math.min((w - 24) / pic.width, (h - 24) / pic.height);
  return {scale, angle: 0, x: (w - pic.width * scale) / 2, y: (h - pic.height * scale) / 2};
}

/**
 * host: the element the canvas fills. tool(): {kind: 'brush'|'eraser'|'smudge'|'pick'|'fill'|'select'|'transform',
 * brush, size, opacity, color, shape ('rect'|'lasso' for 选区)}. picked(color): the eyedropper found a colour.
 * stroked(): the picture changed. filled(point): 油漆桶 at a point. selected(points): an outline was drawn.
 * lassoed(points, {erase}): a 柳叶笔 outline to fill (or empty).
 * undo(), redo(), locked(): a stroke on a locked layer.
 */
export function createStage({doc, win, host, pic, tool, picked, stroked, filled = () => {}, selected = () => {}, lassoed = () => {}, undo, redo, locked = () => {}}) {
  const canvas = doc.createElement('canvas');
  canvas.className = 'paint-view';
  canvas.style.touchAction = 'none';
  // iPad / iPhone: holding a finger still (the eyedropper) must not select the picture or lift it out as a preview.
  for (const type of ['touchstart', 'touchend']) canvas.addEventListener(type, e => { if (e.cancelable) e.preventDefault(); }, {passive: false});
  host.append(canvas);
  const g = canvas.getContext('2d');
  let w = 0, h = 0, ratio = 1, view = null, raf = 0, penSeen = false, spaceDown = false, flipped = false;
  const pointers = new Map();
  let drawing = null, gesture = null, panning = null, taps = null, outline = null, moving = null, refit = false, glide = 0;

  function size() {
    const r = host.getBoundingClientRect();
    ratio = Math.min(3, win.devicePixelRatio || 1);
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    if (!view || refit) { view = fitView(pic, w, h); refit = false; }
    render();
  }
  // Picture px ⇄ screen px, with 左右翻转画面.
  const toScreen = (x, y) => viewMath(view).toScreen(flipped ? pic.width - x : x, y);
  const toPicture = (x, y) => { const p = viewMath(view).toPicture(x, y); return {x: flipped ? pic.width - p.x : p.x, y: p.y}; };
  function render() {
    win.cancelAnimationFrame(raf); raf = 0;
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.save();
    g.translate(view.x, view.y); g.rotate(view.angle); g.scale(view.scale, view.scale);
    if (flipped) { g.translate(pic.width, 0); g.scale(-1, 1); }
    g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 18 / view.scale;
    g.fillStyle = '#fff'; g.fillRect(0, 0, pic.width, pic.height);
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    if (!pic.showBackground) checker();
    g.imageSmoothingEnabled = view.scale < 2;
    compose(pic, g);
    g.restore();
    overlays();
  }
  // Behind a picture without its background: a light chequer, so what is see-through shows.
  function checker() {
    const cell = 16 / view.scale;
    g.fillStyle = '#e6e6ea';
    for (let y = 0; y < pic.height; y += cell) for (let x = (Math.floor(y / cell) % 2) * cell; x < pic.width; x += cell * 2) g.fillRect(x, y, Math.min(cell, pic.width - x), Math.min(cell, pic.height - y));
  }
  // On top, in screen px: the selection's dashed outline, the one being drawn, and the 变形 box with its handles.
  function ants(points) {
    const s = points.map(([x, y]) => toScreen(x, y));
    g.save(); g.lineWidth = 1.5;
    for (const [color, offset] of [['#fff', 0], ['#222', 5]]) { g.strokeStyle = color; g.setLineDash([5, 5]); g.lineDashOffset = offset; tracePath(g, s.map(p => [p.x, p.y])); g.stroke(); }
    g.restore();
  }
  function overlays() {
    if (pic.selection && !pic.float) ants(pic.selection.points);
    if (outline?.fill && outline.points.length > 1) {
      // 柳叶笔: the shape shows filled as it is drawn (emptying shows light), with its edge.
      const s = outline.points.map(([x, y]) => toScreen(x, y));
      g.save(); g.globalAlpha = .55; g.fillStyle = outline.erase ? '#ffffff' : outline.color; tracePath(g, s.map(p => [p.x, p.y])); g.fill(); g.restore();
      ants(outline.points);
    } else if (outline?.points.length > 1) ants(outline.points);
    const f = pic.float;
    if (!f) return;
    const c = floatCorners(f).map(([x, y]) => toScreen(x, y)), top = rotateHandle();
    g.save(); g.strokeStyle = '#3a9cf0'; g.lineWidth = 1.5;
    tracePath(g, c.map(p => [p.x, p.y])); g.stroke();
    const mid = {x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2};
    g.beginPath(); g.moveTo(mid.x, mid.y); g.lineTo(top.x, top.y); g.stroke();
    for (const p of [...c, top]) { g.beginPath(); g.arc(p.x, p.y, p === top ? 7 : 6, 0, Math.PI * 2); g.fillStyle = p === top ? '#3a9cf0' : '#fff'; g.fill(); g.stroke(); }
    g.restore();
  }
  // The dot that turns a lifted piece: a little above the middle of its top edge.
  function rotateHandle() {
    const c = floatCorners(pic.float).map(([x, y]) => toScreen(x, y)), mid = {x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2}, centre = {x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2};
    const dx = mid.x - centre.x, dy = mid.y - centre.y, len = Math.hypot(dx, dy) || 1;
    return {x: mid.x + dx / len * 30, y: mid.y + dy / len * 30};
  }
  const later = () => { if (!raf) raf = win.requestAnimationFrame(render); };
  const local = e => { const r = canvas.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
  // Pressure: a pen's own; a mouse or a finger (most report nothing useful) presses fully.
  const pressure = e => e.pointerType === 'pen' ? Math.max(.02, e.pressure || 0) : 1;
  function point(e) { const s = local(e), p = toPicture(s.x, s.y); return {x: p.x, y: p.y, p: pressure(e), sx: s.x, sy: s.y}; }

  // ---------- drawing ----------
  function startDrawing(e) {
    const t = tool(), at = point(e);
    if (t.kind === 'pick') { drawing = {id: e.pointerId, pick: true}; pick(at); return; }
    if (t.kind === 'fill') { drawing = {id: e.pointerId, done: true}; filled(at); return; }
    if (t.kind === 'select') { outline = {id: e.pointerId, shape: t.shape, start: at, points: [[at.x, at.y]]}; drawing = {id: e.pointerId, outline: true}; return; }
    if (t.brush?.lasso && (t.kind === 'brush' || t.kind === 'eraser')) {
      outline = {id: e.pointerId, shape: 'lasso', fill: true, erase: t.kind === 'eraser', color: t.color, start: at, points: [[at.x, at.y]]};
      drawing = {id: e.pointerId, outline: true, at: Date.now(), start: at, moved: 0}; return;
    }
    if (t.kind === 'transform') { startMoving(e, at); return; }
    const brush = {...t.brush, opacity: t.brush.opacity * t.opacity};
    drawing = {id: e.pointerId, start: at, smooth: at, raw: at, moved: 0, at: Date.now(), streamline: brush.streamline};
    if (!beginStroke(pic, {brush, size: t.size, color: t.color, erase: t.kind === 'eraser', smudge: t.kind === 'smudge'}, at)) { drawing = null; locked(); return; }
    // Held still: the eyedropper instead.
    drawing.hold = win.setTimeout(() => { if (drawing && !drawing.pick && drawing.moved < 6) { endStroke(pic, {cancel: true}); drawing.pick = true; pick(drawing.raw); later(); } }, HOLD);
    later();
  }
  function moveDrawing(e) {
    if (drawing.pick) { pick(point(e)); return; }
    if (drawing.done) return;
    if (drawing.outline) {
      const at = point(e), s = outline.start;
      drawing.moved = Math.max(drawing.moved || 0, Math.hypot(at.sx - (drawing.start?.sx ?? at.sx), at.sy - (drawing.start?.sy ?? at.sy)));
      if (outline.shape === 'rect') outline.points = [[s.x, s.y], [at.x, s.y], [at.x, at.y], [s.x, at.y]];
      else { const last = outline.points.at(-1); if (Math.hypot(at.x - last[0], at.y - last[1]) * view.scale > 2) outline.points.push([at.x, at.y]); }
      later(); return;
    }
    const list = e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e];
    for (const ev of list) {
      const raw = point(ev);
      drawing.moved = Math.max(drawing.moved, Math.hypot(raw.sx - drawing.start.sx, raw.sy - drawing.start.sy));
      drawing.raw = raw;
      drawing.smooth = steady(drawing.smooth, raw, drawing.streamline);
      extendStroke(pic, drawing.smooth);
    }
    later();
  }
  function endDrawing(cancel = false) {
    const d = drawing;
    drawing = null;
    if (!d) return;
    win.clearTimeout(d.hold);
    if (d.pick || d.done) return;
    if (d.outline) { const o = outline; outline = null; if (!cancel) { if (o.fill) lassoed(o.points, {erase: o.erase}); else selected(o.points); } later(); return; }
    // The steadied line catches up with where the pen lifted.
    if (!cancel && d.raw && d.raw !== d.smooth) extendStroke(pic, d.raw);
    if (endStroke(pic, {cancel})) stroked();
    later();
  }
  function pick(at) { const c = colorAt(pic, at.x, at.y); if (c) picked(c); }

  // ---------- 变形 ----------
  function startMoving(e, at) {
    const f = pic.float;
    if (!f) return;
    const s = local(e), corners = floatCorners(f).map(([x, y]) => toScreen(x, y)), top = rotateHandle();
    const t = {...f.t}, centre = {x: t.cx, y: t.cy};
    let mode = 'move';
    if (Math.hypot(s.x - top.x, s.y - top.y) < HANDLE) mode = 'turn';
    else if (corners.some(c => Math.hypot(s.x - c.x, s.y - c.y) < HANDLE)) mode = 'scale';
    moving = {id: e.pointerId, mode, t, at, dist: Math.hypot(at.x - centre.x, at.y - centre.y) || 1, angle: Math.atan2(at.y - centre.y, at.x - centre.x)};
  }
  function moveMoving(e) {
    const f = pic.float, at = point(e), m = moving, t = m.t;
    if (!f) return;
    if (m.mode === 'move') f.t = {...t, cx: t.cx + at.x - m.at.x, cy: t.cy + at.y - m.at.y};
    if (m.mode === 'scale') { const k = Math.max(.02, Math.hypot(at.x - t.cx, at.y - t.cy) / m.dist); f.t = {...t, sx: t.sx * k, sy: t.sy * k}; }
    if (m.mode === 'turn') f.t = {...t, angle: t.angle + Math.atan2(at.y - t.cy, at.x - t.cx) - m.angle};
    later();
  }

  // ---------- two fingers: the picture, or a lifted piece ----------
  const two = () => [...pointers.values()].filter(p => p.type === 'touch').slice(0, 2);
  function startGesture() {
    const [a, b] = two();
    win.cancelAnimationFrame(glide); glide = 0;
    const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
    gesture = {view: {...view}, mid, at: Date.now(), k: 1, dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, angle: Math.atan2(b.y - a.y, b.x - a.x), piece: pic.float && tool().kind === 'transform' ? {...pic.float.t, mid: toPicture(mid.x, mid.y)} : null};
  }
  function moveGesture() {
    const [a, b] = two();
    if (!a || !b) return;
    const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, k = Math.hypot(b.x - a.x, b.y - a.y) / gesture.dist, turn = Math.atan2(b.y - a.y, b.x - a.x) - gesture.angle;
    gesture.k = k;
    if (gesture.piece && pic.float) {
      // The piece follows the fingers: scaled and turned about where they started, moved with them.
      const p = gesture.piece, now = toPicture(mid.x, mid.y), dir = flipped ? -1 : 1, cos = Math.cos(turn * dir), sin = Math.sin(turn * dir);
      const ox = p.cx - p.mid.x, oy = p.cy - p.mid.y;
      pic.float.t = {...p, cx: now.x + (ox * cos - oy * sin) * k, cy: now.y + (ox * sin + oy * cos) * k, sx: p.sx * k, sy: p.sy * k, angle: p.angle + turn * dir};
      delete pic.float.t.mid;
      later(); return;
    }
    const scale = Math.min(40, Math.max(.05, gesture.view.scale * k));
    let angle = gesture.view.angle + turn;
    // Close to upright, it snaps upright.
    const turns = angle / (Math.PI / 2), near = Math.round(turns);
    if (Math.abs(turns - near) < .04) angle = near * Math.PI / 2;
    const p = viewMath(gesture.view).toPicture(gesture.mid.x, gesture.mid.y), cos = Math.cos(angle), sin = Math.sin(angle);
    view = {scale, angle, x: mid.x - (p.x * cos - p.y * sin) * scale, y: mid.y - (p.x * sin + p.y * cos) * scale};
    later();
  }
  /** To the view that shows the whole picture, gliding there (about a fifth of a second). */
  function fitSmooth() {
    const from = {...view}, to = fitView(pic, w, h), start = win.performance?.now?.() ?? Date.now();
    let turn = to.angle - from.angle;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    win.cancelAnimationFrame(glide);
    const step = now => {
      const t = Math.min(1, (now - start) / 220), e = 1 - (1 - t) ** 3;
      view = {scale: from.scale + (to.scale - from.scale) * e, angle: from.angle + turn * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e};
      if (t >= 1) view = to;
      render();
      glide = t < 1 && !gesture ? win.requestAnimationFrame(step) : 0;
    };
    glide = win.requestAnimationFrame(step);
  }
  function zoomAt(x, y, factor) {
    const p = viewMath(view).toPicture(x, y), scale = Math.min(40, Math.max(.05, view.scale * factor)), cos = Math.cos(view.angle), sin = Math.sin(view.angle);
    view = {...view, scale, x: x - (p.x * cos - p.y * sin) * scale, y: y - (p.x * sin + p.y * cos) * scale};
    later();
  }

  canvas.addEventListener('pointerdown', e => {
    const s = local(e);
    pointers.set(e.pointerId, {x: s.x, y: s.y, type: e.pointerType});
    try { canvas.setPointerCapture(e.pointerId); } catch { /* a pointer no longer tracked */ }
    if (e.pointerType === 'pen') penSeen = true;
    if (e.pointerType === 'touch') {
      const touches = [...pointers.values()].filter(p => p.type === 'touch').length;
      taps = touches === 1 ? {at: Date.now(), most: 1, moved: 0} : taps && {...taps, most: Math.max(taps.most, touches)};
      if (touches >= 2) {
        // A second finger soon after the first: it was a gesture, not a stroke.
        if (drawing && pointers.get(drawing.id)?.type === 'touch') endDrawing(Date.now() - (drawing.at || 0) < 260 || (drawing.moved || 0) < 12 || !!drawing.outline);
        if (moving && pointers.get(moving.id)?.type === 'touch') moving = null;
        if (touches === 2) startGesture();
        return;
      }
      if (penSeen && tool().kind !== 'transform') return;
    }
    if (e.button === 1 || (e.button === 0 && spaceDown)) { panning = {x: s.x, y: s.y, view: {...view}}; e.preventDefault(); return; }
    if (e.button > 0 || drawing || moving) return;
    startDrawing(e);
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const s = local(e);
    if (taps && p.type === 'touch') taps.moved = Math.max(taps.moved, Math.hypot(s.x - p.x, s.y - p.y));
    p.x = s.x; p.y = s.y;
    if (gesture && p.type === 'touch') { moveGesture(); return; }
    if (panning) { view = {...panning.view, x: panning.view.x + s.x - panning.x, y: panning.view.y + s.y - panning.y}; later(); return; }
    if (moving?.id === e.pointerId) { moveMoving(e); return; }
    if (drawing?.id === e.pointerId) moveDrawing(e);
  });
  const up = e => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (drawing?.id === e.pointerId) endDrawing(e.type === 'pointercancel');
    if (moving?.id === e.pointerId) { moving = null; stroked({quiet: true}); }
    if (panning && !pointers.size) panning = null;
    if (p?.type === 'touch') {
      const left = [...pointers.values()].filter(x => x.type === 'touch').length;
      if (left < 2 && gesture) {
        if (gesture.piece) stroked({quiet: true});
        // A quick pinch in, as in the album: the whole picture again.
        else if (Date.now() - gesture.at < SNAP && gesture.k < .7) fitSmooth();
        gesture = null;
      }
      if (!left && taps) {
        // A quick tap with two fingers undoes, with three redoes.
        if (Date.now() - taps.at < TAP + 120 && taps.moved < 14) { if (taps.most === 2) undo(); if (taps.most === 3) redo(); }
        taps = null;
      }
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); const s = local(e); zoomAt(s.x, s.y, Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015))); }, {passive: false});
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  const resize = win.ResizeObserver ? new win.ResizeObserver(() => size()) : null;
  resize?.observe(host);
  size();

  return {
    render: later,
    fit() { view = fitView(pic, w, h); later(); },
    /** The next change of size (全屏 on or off) shows the whole picture again. */
    fitOnResize() { refit = true; win.setTimeout(() => { refit = false; }, 600); },
    flip() { flipped = !flipped; later(); },
    get flipped() { return flipped; },
    zoomBy(factor) { zoomAt(w / 2, h / 2, factor); },
    /** The picture point under a point on the page (clientX, clientY), or null off the picture. */
    pictureAt(clientX, clientY) { const r = canvas.getBoundingClientRect(), p = toPicture(clientX - r.left, clientY - r.top); return p.x >= 0 && p.y >= 0 && p.x < pic.width && p.y < pic.height ? p : null; },
    /** Space held: the picture is dragged instead of drawn on. */
    space(on) { spaceDown = on; canvas.style.cursor = on ? 'grab' : ''; },
    get view() { return {...view}; },
    get busy() { return !!drawing || !!moving; },
    dispose() { resize?.disconnect(); win.cancelAnimationFrame(raf); win.cancelAnimationFrame(glide); if (drawing) endDrawing(true); canvas.remove(); },
  };
}
