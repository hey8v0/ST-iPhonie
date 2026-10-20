// 调整 for a layer of 画画: 色相, 饱和度, 亮度 (one colour matrix, as CSS filters do it) and 模糊. The colours are
// worked out pixel by pixel, so it looks the same everywhere (a canvas filter is missing in older Safari); a blur
// uses the canvas's own when there is one, and three box blurs in a row (close to a Gaussian one) when not.

/** The 3×3 matrix of hue-rotate(deg), saturate(s) and brightness(b), in that order. */
export function colorMatrix({hue = 0, saturation = 1, brightness = 1} = {}) {
  const a = hue * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), k = saturation;
  const H = [.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928,
    .213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283,
    .213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072];
  const S = [.213 + .787 * k, .715 - .715 * k, .072 - .072 * k, .213 - .213 * k, .715 + .285 * k, .072 - .072 * k, .213 - .213 * k, .715 - .715 * k, .072 + .928 * k];
  const m = (A, B) => [0, 1, 2].flatMap(r => [0, 1, 2].map(col => A[r * 3] * B[col] + A[r * 3 + 1] * B[3 + col] + A[r * 3 + 2] * B[6 + col]));
  return m(S, H).map(v => v * brightness);
}
/** RGBA pixels with the matrix applied (alpha kept). */
export function recolor(data, matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p], gg = data[p + 1], bl = data[p + 2];
    data[p] = a * r + b * gg + c * bl; data[p + 1] = d * r + e * gg + f * bl; data[p + 2] = g * r + h * gg + i * bl;
  }
  return data;
}
/** A box blur of radius r over RGBA pixels, three times across and down (premultiplied, so see-through edges stay clean). */
export function boxBlur(data, width, height, radius) {
  const r = Math.max(0, Math.round(radius));
  if (!r) return data;
  for (let p = 0; p < data.length; p += 4) { const al = data[p + 3] / 255; data[p] *= al; data[p + 1] *= al; data[p + 2] *= al; }
  const buf = new Float32Array(data.length), pass = (src, dst, w, h, stepI, stepJ) => {
    for (let j = 0; j < h; j++) {
      const base = j * stepJ;
      for (let ch = 0; ch < 4; ch++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[base + Math.min(w - 1, Math.max(0, k)) * stepI + ch];
        for (let x = 0; x < w; x++) {
          dst[base + x * stepI + ch] = sum / (2 * r + 1);
          sum += src[base + Math.min(w - 1, x + r + 1) * stepI + ch] - src[base + Math.max(0, x - r) * stepI + ch];
        }
      }
    }
  };
  for (let n = 0; n < 3; n++) { pass(data, buf, width, height, 4, width * 4); pass(buf, data, height, width, width * 4, 4); }
  for (let p = 0; p < data.length; p += 4) { const al = data[p + 3] / 255; if (al > 0) { data[p] /= al; data[p + 1] /= al; data[p + 2] /= al; } }
  return data;
}
let canvasBlur = null;
/** Whether this browser's canvas blurs by itself. */
function blursItself(doc) {
  if (canvasBlur !== null) return canvasBlur;
  try { const g = doc.createElement('canvas').getContext('2d'); g.filter = 'blur(2px)'; canvasBlur = g.filter === 'blur(2px)'; } catch { canvasBlur = false; }
  return canvasBlur;
}
/**
 * The source canvas adjusted, as a new canvas: hue in degrees (-180…180), saturation and brightness as factors
 * (1 = as it is), blur in picture px.
 */
export function adjusted(doc, source, {hue = 0, saturation = 1, brightness = 1, blur = 0} = {}) {
  const w = source.width, h = source.height, out = doc.createElement('canvas');
  out.width = w; out.height = h;
  const g = out.getContext('2d', {willReadFrequently: true});
  if (!g) return source;
  const colour = hue || saturation !== 1 || brightness !== 1;
  if (blur > 0 && blursItself(doc)) { g.filter = `blur(${blur}px)`; g.drawImage(source, 0, 0); g.filter = 'none'; }
  else g.drawImage(source, 0, 0);
  if (!colour && !(blur > 0 && !blursItself(doc))) return out;
  const img = g.getImageData(0, 0, w, h);
  if (blur > 0 && !blursItself(doc)) boxBlur(img.data, w, h, blur / 2);
  if (colour) recolor(img.data, colorMatrix({hue, saturation, brightness}));
  g.putImageData(img, 0, 0);
  return out;
}
