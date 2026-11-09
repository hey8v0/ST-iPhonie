// Shared by every album viewer, including imported comic pages.
export function zoomPoint({z, x, y}, next, cx, cy, loose = false) {
  next = Math.min(5, Math.max(loose ? .6 : 1, next));
  return {z: next, x: cx - (cx - x) * next / z, y: cy - (cy - y) * next / z};
}
