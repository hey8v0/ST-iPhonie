import {btn} from './common.js';
import {icon} from './icons.js';
import {loadImage} from './draw-images.js';

// Pixel-art enlargements leave edges at repeated intervals along both axes. Measure those intervals
// using a bounded sample of rows and columns, then keep the strongest alignment for each axis.
function edgeProfile(data, width, height, vertical) {
  const length = vertical ? height : width, cross = vertical ? width : height;
  const across = vertical ? 4 : width * 4, along = vertical ? width * 4 : 4;
  const edges = new Float64Array(length);
  for (let n = 0; n < cross; n += Math.max(1, Math.floor(cross / 96))) {
    for (let i = 1; i < length; i++) {
      const a = n * across + i * along, b = a - along;
      const color = Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
      edges[i] += Math.abs(data[a + 3] - data[b + 3]) * 2 + color * Math.min(data[a + 3], data[b + 3]) / 255;
    }
  }
  return edges;
}
function alignment(edges, size) {
  const phases = new Float64Array(size);
  let total = 0;
  for (let i = 1; i < edges.length; i++) { phases[i % size] += edges[i]; total += edges[i]; }
  const peak = phases.indexOf(Math.max(...phases)), prev = (peak + size - 1) % size, next = (peak + 1) % size;
  const share = total ? (phases[peak] + (size > 3 ? (phases[prev] + phases[next]) * .3 : 0)) / total : 0;
  return {offset: peak, score: Math.max(0, share - 1 / size)};
}
export function pixelGrid(data, width, height) {
  const x = edgeProfile(data, width, height, false), y = edgeProfile(data, width, height, true);
  const max = Math.max(1, Math.min(48, Math.floor(Math.min(width, height) / 5)));
  let best = .18, size = 1;
  for (let n = 2; n <= max; n++) {
    const horizontal = alignment(x, n).score, vertical = alignment(y, n).score;
    const score = Math.min(horizontal, vertical) - n / 500;
    if (score > best) { size = n; best = score; }
  }
  return {size, max, offset(cell) { return [alignment(x, cell).offset, alignment(y, cell).offset]; }};
}
export function snapPixels(data, width, height, cell, [x, y]) {
  // Take the center pixel of each cell, keeping the original palette and alpha. Partial cells at edges stay in the image.
  const left = x ? x - cell : 0, top = y ? y - cell : 0;
  const outWidth = Math.ceil((width - left) / cell), outHeight = Math.ceil((height - top) / cell);
  const result = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let row = 0; row < outHeight; row++) {
    const startY = top + row * cell, middleY = Math.floor((Math.max(0, startY) + Math.min(startY + cell, height) - 1) / 2);
    for (let col = 0; col < outWidth; col++) {
      const startX = left + col * cell, middleX = Math.floor((Math.max(0, startX) + Math.min(startX + cell, width) - 1) / 2);
      const at = (middleY * width + middleX) * 4, to = (row * outWidth + col) * 4;
      for (let channel = 0; channel < 4; channel++) result[to + channel] = data[at + channel];
    }
  }
  return {data: result, width: outWidth, height: outHeight};
}

export async function pixelSheet(ctx, source, save) {
  const image = await loadImage(ctx.win, source), width = image.naturalWidth, height = image.naturalHeight;
  if (width * height > 16e6) throw Error('图片太大，像素对齐最多支持 1600 万像素');
  const original = ctx.doc.createElement('canvas');
  original.width = width;
  original.height = height;
  const parser = original.getContext('2d');
  parser.drawImage(image, 0, 0);
  const bits = parser.getImageData(0, 0, width, height).data, grid = pixelGrid(bits, width, height);
  original.width = original.height = 0;
  const d = ctx.dialog('像素对齐', `<p class="hint" data-keep-hint>把放大过的像素画还原到像素格，保留透明背景。在本机处理，免费。</p>
    <div class="draw-pixel-preview"><canvas aria-label="像素对齐预览"></canvas></div>
    <label class="field"><span>原图每格像素数 <output></output></span><input class="slider" type="range" min="1" max="${grid.max}" value="${grid.size}"></label>
    <p class="hint" data-pixel-size></p><div class="actions">${btn('pixel-save', icon('image') + '保存到相册', 'primary')}</div>`);
  const preview = d.body.querySelector('canvas'), input = d.body.querySelector('input'), button = d.body.querySelector('[data-action=pixel-save]');
  let frame = 0;
  function render() {
    frame = 0;
    const cell = Number(input.value), snapped = snapPixels(bits, width, height, cell, grid.offset(cell));
    preview.width = snapped.width;
    preview.height = snapped.height;
    preview.getContext('2d').putImageData(new ctx.win.ImageData(snapped.data, snapped.width, snapped.height), 0, 0);
    d.body.querySelector('output').textContent = `${cell} px`;
    d.body.querySelector('[data-pixel-size]').textContent = `${width}×${height} → ${snapped.width}×${snapped.height}`;
  }
  render();
  input.addEventListener('input', () => { if (!frame) frame = ctx.win.requestAnimationFrame(render); });
  d.onClose(() => { if (frame) ctx.win.cancelAnimationFrame(frame); });
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (frame) { ctx.win.cancelAnimationFrame(frame); render(); }
      const blob = await new Promise(resolve => preview.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('图片保存失败');
      await save(blob, preview.width, preview.height);
      d.close();
    } catch (error) { ctx.notify(error.message, {error: true}); button.disabled = false; }
  });
}
