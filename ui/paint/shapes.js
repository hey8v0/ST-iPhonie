// 速创形状 (Procreate's QuickShape): a stroke held still at its end becomes the shape it was meant to be — a straight
// line, an ellipse (a circle when it is nearly round), a rectangle, or a line with a few corners. While still held,
// the shape follows the pen. Points are {x, y, p} in picture px; nothing here draws.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** How far p is from the segment a–b. */
function offSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  if (!len) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** The corners a line keeps when it is drawn again with fewer points (Ramer–Douglas–Peucker). */
function corners(points, tolerance) {
  if (points.length < 3) return points.slice();
  let far = 0, at = 0;
  for (let i = 1; i < points.length - 1; i++) { const d = offSegment(points[i], points[0], points.at(-1)); if (d > far) { far = d; at = i; } }
  if (far <= tolerance) return [points[0], points.at(-1)];
  return [...corners(points.slice(0, at + 1), tolerance).slice(0, -1), ...corners(points.slice(at), tolerance)];
}

/**
 * The shape a stroke was meant to be, or null when it looks like a free stroke. scale: picture px per screen px
 * (a hand's wobble is measured on the screen).
 */
export function fitShape(points, scale = 1) {
  if (!points || points.length < 4) return null;
  const a = points[0], b = points.at(-1);
  let length = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, p = 0;
  for (let i = 0; i < points.length; i++) {
    const q = points[i];
    if (i) length += dist(points[i - 1], q);
    x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); p += q.p ?? 1;
  }
  const pressure = p / points.length, w = x1 - x0, h = y1 - y0, size = Math.max(w, h);
  if (size * (1 / scale) < 24) return null;
  const wobble = Math.max(6 * scale, size * .05);
  // Straight: nothing far from the line between its ends, and it did not double back.
  const span = dist(a, b);
  if (span > length * .8 && points.every(q => offSegment(q, a, b) <= wobble)) return {kind: 'line', a: {...a}, b: {...b}, pressure};
  // Closed (the end came back near the start): an ellipse or a rectangle, whichever it is closer to.
  if (span < size * .3) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = w / 2, ry = h / 2, small = Math.max(1, Math.min(rx, ry));
    let round = 0, square = 0;
    for (const q of points) {
      const r = Math.hypot((q.x - cx) / (rx || 1), (q.y - cy) / (ry || 1));
      round += Math.abs(r - 1) * small;
      square += Math.min(Math.abs(q.x - x0), Math.abs(q.x - x1), Math.abs(q.y - y0), Math.abs(q.y - y1));
    }
    round /= points.length * small; square /= points.length * small;
    if (Math.min(round, square) > .16) return null;
    if (square < round * .8) return {kind: 'rect', x0, y0, x1, y1, pressure};
    // Nearly round: a circle.
    if (Math.abs(rx - ry) / Math.max(rx, ry, 1) < .14) { const r = (rx + ry) / 2; return {kind: 'ellipse', cx, cy, rx: r, ry: r, circle: true, pressure}; }
    return {kind: 'ellipse', cx, cy, rx, ry, pressure};
  }
  // Open with a few corners: a line through them.
  const kept = corners(points, wobble * 1.4);
  if (kept.length >= 3 && kept.length <= 6) return {kind: 'poly', points: kept.map(q => ({x: q.x, y: q.y})), pressure};
  return null;
}

/** The points a shape is drawn through (the brush stamps along them). */
export function shapePoints(shape) {
  const p = shape.pressure ?? 1, at = (x, y) => ({x, y, p});
  if (shape.kind === 'line') return [at(shape.a.x, shape.a.y), at(shape.b.x, shape.b.y)];
  if (shape.kind === 'rect') { const {x0, y0, x1, y1} = shape; return [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)]; }
  if (shape.kind === 'poly') return shape.points.map(q => at(q.x, q.y));
  const n = Math.max(24, Math.min(160, Math.round((shape.rx + shape.ry) / 3))), out = [];
  for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2; out.push(at(shape.cx + Math.cos(t) * shape.rx, shape.cy + Math.sin(t) * shape.ry)); }
  return out;
}

/** The shape while it is still held: its end (or its size) follows the pen. anchor: where the pen was when it snapped. */
export function reshape(shape, anchor, pen) {
  if (shape.kind === 'line') return {...shape, b: {x: pen.x, y: pen.y}};
  if (shape.kind === 'poly') return {...shape, points: [...shape.points.slice(0, -1), {x: pen.x, y: pen.y}]};
  if (shape.kind === 'rect') {
    // The corner nearest where it snapped goes with the pen; the opposite one stays.
    const fx = Math.abs(anchor.x - shape.x0) < Math.abs(anchor.x - shape.x1) ? shape.x1 : shape.x0;
    const fy = Math.abs(anchor.y - shape.y0) < Math.abs(anchor.y - shape.y1) ? shape.y1 : shape.y0;
    return {...shape, x0: Math.min(fx, pen.x), x1: Math.max(fx, pen.x), y0: Math.min(fy, pen.y), y1: Math.max(fy, pen.y)};
  }
  // An ellipse grows or shrinks about its middle as the pen moves away from it or nearer.
  const was = Math.hypot(anchor.x - shape.cx, anchor.y - shape.cy) || 1, now = Math.hypot(pen.x - shape.cx, pen.y - shape.cy), k = Math.max(.05, now / was);
  return {...shape, rx: shape.rx * k, ry: shape.ry * k};
}

export const SHAPE_NAMES = {line: '直线', ellipse: '椭圆', rect: '矩形', poly: '折线'};
export const shapeName = s => s.circle ? '圆' : SHAPE_NAMES[s.kind] || '';
