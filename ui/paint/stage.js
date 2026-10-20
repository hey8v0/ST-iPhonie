// 画画的画面: shows the picture turned, moved and zoomed, and turns pens, fingers and the mouse into strokes and
// gestures, as on Procreate:
// - a pen, a finger or the mouse draws (画笔, 橡皮, 涂抹); once a pen has been seen, fingers no longer draw;
// - two fingers pinch, turn and move the picture; a quick pinch in puts the whole picture back on screen; a quick
//   two-finger tap undoes, three fingers redo;
// - holding still for a moment picks the colour under the point (a ring shows the colour picked over the one before);
// - 速创形状: a stroke held still at its end becomes a line, an ellipse, a rectangle…, which follows the pen until it lifts;
// - 对称 (pic.symmetry): its axes show over the picture; the engine stamps the copies;
// - 柳叶笔 (a brush with lasso): draw round a shape and it is filled, or with 橡皮 emptied, when the pen lifts;
// - 选区: drag a box, or draw round what to select; 变形: drag to move, the corners to scale, the dot above to turn,
//   two fingers to scale and turn;
// - on a computer: the wheel zooms where the pointer is, space or the middle button drags the picture.
import {beginStroke, extendStroke, endStroke, compose, layerPicture, colorAt, steady, tracePath, floatCorners} from './engine.js';
import {fitShape, shapePoints, reshape, shapeName} from './shapes.js';

const HOLD = 480, TAP = 280, HANDLE = 24, SNAP = 320, SHAPE_HOLD = 520;
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
  // desynchronized: the canvas reaches the screen without waiting for the page (a pen's line keeps up with the pen).
  const g = canvas.getContext('2d', {desynchronized: true}) || canvas.getContext('2d');
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
  // ---------- drawing the view ----------
  // A frame costs what is drawn in it. While a stroke goes on, what lies under and over its layer does not change: they
  // are kept as two pictures the size of the screen, and a frame is those two with the layer between. While the view
  // moves (fingers, wheel, gliding), the picture does not change: it is kept whole. Anything else draws it all.
  let split = null, whole = null;
  const inView = c => { c.translate(view.x, view.y); c.rotate(view.angle); c.scale(view.scale, view.scale); if (flipped) { c.translate(pic.width, 0); c.scale(-1, 1); } };
  const screenCanvas = () => { const c = doc.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; return c; };
  /** The sheet: a soft shadow of a few widening rims (a blur each frame costs a phone too much), white, and the chequer. */
  function paper(c) {
    const k = 1 / view.scale;
    c.fillStyle = 'rgba(0,0,0,.035)';
    for (let i = 5; i >= 1; i--) { const d = i * 3.2 * k; c.fillRect(-d, -d + 4 * k, pic.width + 2 * d, pic.height + 2 * d); }
    c.fillStyle = '#fff'; c.fillRect(0, 0, pic.width, pic.height);
    if (!pic.showBackground) checker(c);
  }
  // Behind a picture without its background: a light chequer, so what is see-through shows (one pattern, not a square at a time).
  let tile = null;
  function checker(c) {
    if (!tile) { const t = doc.createElement('canvas'); t.width = t.height = 32; const tg = t.getContext('2d'); if (!tg) return; tg.fillStyle = '#e6e6ea'; tg.fillRect(0, 0, 16, 16); tg.fillRect(16, 16, 16, 16); tile = t; }
    const pattern = c.createPattern?.(tile, 'repeat');
    if (!pattern) return;
    pattern.setTransform?.(new win.DOMMatrix().scale(1 / view.scale));
    c.fillStyle = pattern; c.fillRect(0, 0, pic.width, pic.height);
  }
  /** The index of the layer being stroked when the picture can be drawn as under + it + over; -1 when it cannot. */
  function splitAt() {
    const s = pic.stroke, list = pic.layers, i = s ? list.indexOf(s.layer) : -1;
    if (i < 0 || pic.float || s.layer.clip || (list[i + 1]?.clip && list[i + 1].group === s.layer.group)) return -1;
    if (!s.layer.visible || pic.groups?.some(x => x.id === s.layer.group && !x.visible)) return -1;
    // Over it, a layer blending other than normally mixes with what is under: then the whole picture is drawn.
    for (const l of list.slice(i + 1)) if (l.visible && l.blend !== 'source-over') return -1;
    return i;
  }
  const viewKey = () => `${view.x},${view.y},${view.scale},${view.angle},${flipped},${canvas.width},${canvas.height},${pic.changed},${pic.active}`;
  const pictureKey = () => `${pic.changed},${pic.layers.length},${pic.showBackground},${pic.background},${pic.active}`;
  function render() {
    win.cancelAnimationFrame(raf); raf = 0;
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const at = splitAt();
    if (at >= 0) strokeFrame(at);
    else {
      split = null;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.save(); inView(g);
      paper(g);
      g.imageSmoothingEnabled = view.scale < 2;
      if (pic.float || pic.stroke) { whole = null; compose(pic, g); }
      else {
        if (whole?.key !== pictureKey()) whole = keepWhole();
        if (whole) g.drawImage(whole.canvas, 0, 0); else compose(pic, g);
      }
      g.restore();
    }
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    overlays();
  }
  function keepWhole() {
    const c = doc.createElement('canvas'); c.width = pic.width; c.height = pic.height;
    const cg = c.getContext('2d');
    if (!cg) return null;
    compose(pic, cg, {background: true});
    return {canvas: c, key: pictureKey()};
  }
  /** A frame while a stroke goes on: under, the layer with the stroke, over. */
  function strokeFrame(at) {
    const key = viewKey();
    if (split?.layer !== pic.layers[at] || split.key !== key) {
      const under = screenCanvas(), over = screenCanvas(), ug = under.getContext('2d'), og = over.getContext('2d');
      if (!ug || !og) { split = null; return; }
      for (const c of [ug, og]) { c.setTransform(ratio, 0, 0, ratio, 0, 0); inView(c); c.imageSmoothingEnabled = view.scale < 2; }
      paper(ug);
      compose(pic, ug, {to: at});
      compose(pic, og, {from: at + 1, background: false});
      split = {layer: pic.layers[at], key, under, over};
    }
    const layer = pic.layers[at];
    g.drawImage(split.under, 0, 0);
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.save(); inView(g);
    g.imageSmoothingEnabled = view.scale < 2;
    g.globalAlpha = layer.opacity; g.globalCompositeOperation = layer.blend;
    g.drawImage(layerPicture(pic, layer), 0, 0);
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(split.over, 0, 0);
  }
  // On top, in screen px: the selection's dashed outline, the one being drawn, and the 变形 box with its handles.
  function ants(points) {
    const s = points.map(([x, y]) => toScreen(x, y));
    g.save(); g.lineWidth = 1.5;
    for (const [color, offset] of [['#fff', 0], ['#222', 5]]) { g.strokeStyle = color; g.setLineDash([5, 5]); g.lineDashOffset = offset; tracePath(g, s.map(p => [p.x, p.y])); g.stroke(); }
    g.restore();
  }
  // ---------- over the picture: 对称's axes, the shape's name, the eyedropper's ring, the brush's size ----------
  let banner = null, loupe = null, preview = null, fade = 0;
  function guides() {
    const s = pic.symmetry;
    if (!s?.kind) return;
    const cx = s.cx ?? pic.width / 2, cy = s.cy ?? pic.height / 2, far = Math.hypot(pic.width, pic.height);
    const lines = s.kind === 'radial' ? Array.from({length: s.n || 6}, (_, i) => i * Math.PI / (s.n || 6)) : [...(s.kind !== 'h' ? [Math.PI / 2] : []), ...(s.kind !== 'v' ? [0] : [])];
    g.save();
    // Only over the picture.
    const edge = [[0, 0], [pic.width, 0], [pic.width, pic.height], [0, pic.height]].map(([x, y]) => toScreen(x, y));
    g.beginPath(); edge.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.clip();
    g.lineWidth = 1.2; g.setLineDash([6, 6]);
    for (const [color, offset] of [['rgba(255,255,255,.9)', 0], ['rgba(58,156,240,.9)', 6]]) {
      g.strokeStyle = color; g.lineDashOffset = offset;
      for (const a of lines) { const p = toScreen(cx - Math.cos(a) * far, cy - Math.sin(a) * far), q = toScreen(cx + Math.cos(a) * far, cy + Math.sin(a) * far); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); }
    }
    g.restore();
  }
  function pill(text, x, y) {
    g.save(); g.font = '700 13px system-ui,"PingFang SC","Microsoft YaHei",sans-serif';
    const pw = g.measureText(text).width + 26;
    g.fillStyle = 'rgba(20,24,40,.82)'; g.beginPath(); if (g.roundRect) g.roundRect(x - pw / 2, y - 15, pw, 30, 15); else g.rect(x - pw / 2, y - 15, pw, 30); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 1);
    g.restore();
  }
  function marks() {
    guides();
    // 速创形状's name, a moment at the top.
    if (banner && Date.now() - banner.at < 1200) pill(`${banner.text} · 拖动调整，抬笔完成`, w / 2, 26);
    // The eyedropper: a ring round the point, the colour picked above and the one before below.
    if (loupe) {
      const r = 42;
      g.save(); g.lineWidth = 16;
      g.strokeStyle = loupe.now; g.beginPath(); g.arc(loupe.sx, loupe.sy - 70, r, Math.PI, 0); g.stroke();
      g.strokeStyle = loupe.was; g.beginPath(); g.arc(loupe.sx, loupe.sy - 70, r, 0, Math.PI); g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.95)';
      for (const rr of [r - 8, r + 8]) { g.beginPath(); g.arc(loupe.sx, loupe.sy - 70, rr, 0, Math.PI * 2); g.stroke(); }
      g.restore();
    }
    // The brush's real size on the picture, while its size or opacity is being changed.
    if (preview && Date.now() - preview.at < 900) {
      const r = Math.max(1.5, preview.size * view.scale / 2);
      g.save(); g.globalAlpha = Math.max(.08, Math.min(1, preview.opacity)); g.fillStyle = preview.color;
      g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1; g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.95)'; g.stroke();
      g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(w / 2, h / 2, r + 1.5, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
  }
  function overlays() {
    ahead();
    marks();
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
  /**
   * Where the pen is about to be (the browser's predicted points): the brush's tip stamped there for this frame only,
   * so the line keeps up with a fast pen. The real stroke reaches there in the next frames.
   */
  function ahead() {
    const s = pic.stroke, next = drawing?.predicted;
    if (!s || s.smudge || s.erase || !next?.length || !s.tip || !drawing.smooth) return;
    g.save(); inView(g);
    g.globalAlpha = Math.min(1, s.brush.opacity ?? 1) * .9;
    let from = drawing.smooth, n = 0;
    for (const to of next) {
      const len = Math.hypot(to.x - from.x, to.y - from.y), size = Math.max(1, s.size * (to.p ?? 1)), step = Math.max(1, size * .25);
      for (let d = step; d <= len && n < 24; d += step, n++) { const x = from.x + (to.x - from.x) * d / len, y = from.y + (to.y - from.y) * d / len; g.drawImage(s.tip, x - size / 2, y - size / 2, size, size); }
      from = to;
    }
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
    const brush = {...t.brush, opacity: t.brush.opacity * t.opacity}, params = {brush, size: t.size, color: t.color, erase: t.kind === 'eraser', smudge: t.kind === 'smudge'};
    drawing = {id: e.pointerId, start: at, smooth: at, raw: at, moved: 0, at: Date.now(), streamline: brush.streamline, params, pts: [at], was: t.color};
    if (!beginStroke(pic, params, at)) { drawing = null; locked(); return; }
    // Held still: the eyedropper instead.
    drawing.hold = win.setTimeout(() => { if (drawing && !drawing.pick && drawing.moved < 6) { endStroke(pic, {cancel: true}); drawing.pick = true; pick(drawing.raw); later(); } }, HOLD);
    later();
  }
  function moveDrawing(e) {
    if (drawing.pick) { pick(point(e)); return; }
    // A shape follows the pen until it lifts.
    if (drawing.shape) { const pen = point(e); drawing.shape = reshape(drawing.shape, drawing.anchor, pen); drawing.anchor = pen; drawShape(drawing); later(); return; }
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
      if (drawing.pts.length < 4000) drawing.pts.push(raw);
    }
    // Held still after drawing a while: 速创形状 in a moment (not while 涂抹).
    const d = drawing;
    if (!d.params.smudge && d.moved > 14 && (!d.stillAt || Math.hypot(d.raw.sx - d.stillAt.sx, d.raw.sy - d.stillAt.sy) > 3)) {
      d.stillAt = d.raw; win.clearTimeout(d.shapeTimer); d.shapeTimer = win.setTimeout(() => snapShape(d), SHAPE_HOLD);
    }
    drawing.predicted = (e.getPredictedEvents?.() || []).slice(0, 3).map(point);
    later();
  }
  /** The stroke drawn again as its shape (the brush stamps along it). */
  function drawShape(d) {
    endStroke(pic, {cancel: true});
    const pts = shapePoints(d.shape);
    if (!beginStroke(pic, d.params, pts[0])) return;
    for (const p of pts.slice(1)) extendStroke(pic, p);
  }
  function snapShape(d) {
    if (drawing !== d || d.shape || d.pick) return;
    const shape = fitShape(d.pts, 1 / view.scale);
    if (!shape) return;
    d.shape = shape; d.anchor = d.raw;
    drawShape(d);
    banner = {text: shapeName(shape), at: Date.now()};
    try { win.navigator?.vibrate?.(10); } catch { /* none */ }
    win.setTimeout(later, 1300);
    later();
  }
  function endDrawing(cancel = false) {
    const d = drawing;
    drawing = null;
    loupe = null;
    if (!d) return;
    win.clearTimeout(d.hold); win.clearTimeout(d.shapeTimer);
    if (d.pick || d.done) return;
    if (d.outline) { const o = outline; outline = null; if (!cancel) { if (o.fill) lassoed(o.points, {erase: o.erase}); else selected(o.points); } later(); return; }
    split = null;
    // The steadied line catches up with where the pen lifted.
    if (!cancel && !d.shape && d.raw && d.raw !== d.smooth) extendStroke(pic, d.raw);
    if (endStroke(pic, {cancel})) stroked();
    later();
  }
  function pick(at) { const c = colorAt(pic, at.x, at.y); if (c) { loupe = {sx: at.sx, sy: at.sy, now: c, was: loupe?.was || drawing?.was || tool().color}; picked(c); later(); } }

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
    /** The brush's size shown on the picture for a moment (its size or opacity being changed). */
    preview(brush) { preview = {...brush, at: Date.now()}; later(); win.clearTimeout(fade); fade = win.setTimeout(later, 950); },
    /** Something changed the picture (a layer, a fill, undo…): drawn anew. */
    render() { whole = null; split = null; later(); },
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
