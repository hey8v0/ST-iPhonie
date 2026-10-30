// Pictures for NovelAI in the drawing app: a base picture fitted for 图生图, a reference fitted for 角色参考, a picture
// as it is for the tools (放大, 导演工具), the brush that marks what 局部重绘 draws again, picking a picture from the
// album or the device, and reading back what a NovelAI PNG was drawn with.
import {esc} from './common.js';
import {thumbBlob} from './thumbs.js';
import {icon} from './icons.js';
import {REFERENCE_SIZES, NAI_MODELS} from '../core/novelai.js';

/** A blob as a loaded <img> (its object URL is let go once it is drawn). */
export function loadImage(win, blob) {
  return new Promise((resolve, reject) => {
    const url = win.URL.createObjectURL(blob), img = new win.Image();
    img.onload = () => { win.URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { win.URL.revokeObjectURL(url); reject(Error('这张图打不开')); };
    img.src = url;
  });
}
const base64Of = canvas => canvas.toDataURL('image/png').split(',')[1];
function canvasOf(doc, width, height) { const c = doc.createElement('canvas'); c.width = width; c.height = height; return c; }

/**
 * 图生图: the picture in its own shape at a size NovelAI draws (sides in multiples of 64, about `area` pixels; never
 * bigger than it is unless it is small). {image (base64 PNG), width, height, preview (data URL)}.
 */
export async function fitBase(win, blob, area = 1024 * 1024) {
  const img = await loadImage(win, blob), ratio = img.naturalWidth / img.naturalHeight;
  const round = n => Math.max(64, Math.round(n / 64) * 64);
  const width = round(Math.sqrt(area * ratio)), height = round(Math.sqrt(area / ratio));
  const canvas = canvasOf(win.document, width, height);
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return {image: base64Of(canvas), width, height, preview: canvas.toDataURL('image/jpeg', .8)};
}

/** 角色参考: the picture fitted whole into the reference size nearest its shape, the rest black. {image, preview}. */
export async function fitReference(win, blob) {
  const img = await loadImage(win, blob), ratio = img.naturalWidth / img.naturalHeight;
  const [width, height] = REFERENCE_SIZES.reduce((best, s) => Math.abs(Math.log(s[0] / s[1] / ratio)) < Math.abs(Math.log(best[0] / best[1] / ratio)) ? s : best);
  const canvas = canvasOf(win.document, width, height), g = canvas.getContext('2d'), k = Math.min(width / img.naturalWidth, height / img.naturalHeight);
  g.fillStyle = '#000'; g.fillRect(0, 0, width, height);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  g.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  const thumb = canvasOf(win.document, 160, Math.round(160 * img.naturalHeight / img.naturalWidth));
  thumb.getContext('2d').drawImage(img, 0, 0, thumb.width, thumb.height);
  return {image: base64Of(canvas), preview: thumb.toDataURL('image/jpeg', .8)};
}

/**
 * A GPT 参考图: the picture in its own shape, no longer than `side` on its long side, as JPEG on white (every relay
 * takes JPEG, and it keeps 16 of them small to send): {image (base64), type, width, height, preview}.
 */
export async function fitGptReference(win, blob, side = 1536) {
  const img = await loadImage(win, blob), k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * k)), height = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = canvasOf(win.document, width, height), g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, width, height); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, width, height);
  const thumb = canvasOf(win.document, 160, Math.max(1, Math.round(160 * height / width)));
  thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return {image: canvas.toDataURL('image/jpeg', .92).split(',')[1], type: 'image/jpeg', width, height, preview: thumb.toDataURL('image/jpeg', .8)};
}

/** A picture redrawn at width×height (增强 sends it larger): {image (base64 PNG), width, height, preview}. */
export async function scaledPicture(win, blob, width, height) {
  const img = await loadImage(win, blob), canvas = canvasOf(win.document, width, height), g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, width, height);
  return {image: base64Of(canvas), width, height, preview: canvas.toDataURL('image/jpeg', .8)};
}
/** NovelAI's biggest picture for 增强 (pixels). */
export const ENHANCE_MAX = 3145728;
/** The 增强 sizes a picture can go to: ×2, ×1.5, ×1 (sides in multiples of 64), the ones within ENHANCE_MAX. */
export const enhanceSizes = (width, height) => [2, 1.5, 1].map(k => [k, Math.round(width * k / 64) * 64, Math.round(height * k / 64) * 64]).filter(([, w, h]) => w * h <= ENHANCE_MAX);

/** A picture as it is, for 放大 and 导演工具: {image (base64 PNG), width, height}. */
export async function pictureData(win, blob) {
  const img = await loadImage(win, blob), canvas = canvasOf(win.document, img.naturalWidth, img.naturalHeight);
  canvas.getContext('2d').drawImage(img, 0, 0);
  return {image: base64Of(canvas), width: img.naturalWidth, height: img.naturalHeight};
}

/** Picks a picture from the album or the device: its Blob, or null when nothing was picked. multiple: several files
 *  may be picked from the device at once, and the answer is a list (one from the album). */
export function pickPicture(ctx, api, title = '选一张图', {multiple = false} = {}) {
  return new Promise(async resolve => {
    let done = false;
    const finish = value => { if (done) return; done = true; resolve(value); d.close(); };
    const rows = (await api.listPhotos()).slice(0, 60), urls = [];
    const d = ctx.dialog(title, `<div class="actions" style="margin-top:0"><label class="secondary file-button">${icon('import')}从手机里选${multiple ? '（可以多选）' : ''}<input type="file" data-pick-file accept="image/png,image/jpeg,image/webp"${multiple ? ' multiple' : ''} hidden></label></div>
      ${rows.length ? `<p class="hint">或者从相册里选：</p><div class="photo-grid pick-photos">${rows.map(r => `<button type="button" data-pick-photo="${esc(r.id)}" aria-label="选 ${esc(r.name)}"><img alt="${esc(r.name)}"></button>`).join('')}</div>` : '<p class="hint">相册里还没有图。</p>'}`);
    d.onClose?.(() => { for (const url of urls) ctx.win.URL.revokeObjectURL(url); if (!done) { done = true; resolve(null); } });
    d.body.addEventListener('change', e => { const files = [...(e.target.closest('[data-pick-file]')?.files || [])]; if (files.length) finish(multiple ? files : files[0]); });
    d.body.addEventListener('click', async e => { const id = e.target.closest('[data-pick-photo]')?.dataset.pickPhoto; if (!id) return; const photo = await api.getPhoto(id); if (photo?.blob) finish(multiple ? [photo.blob] : photo.blob); });
    for (const row of rows) {
      const blob = await thumbBlob(api, row), img = d.body.querySelector(`[data-pick-photo="${CSS.escape(row.id)}"] img`);
      if (!blob || !img) continue;
      const url = ctx.win.URL.createObjectURL(blob); urls.push(url); img.src = url;
    }
  });
}

/**
 * 局部重绘: paint over what is to be drawn again. Opens over the phone; resolves with {mask (base64 PNG at width×height,
 * white where it is drawn again, in NovelAI's 8-pixel blocks; '' when nothing is painted), focus}, or null when left
 * without saving. mask: the one painted before, to go on with. focus: {x, y, w, h, context} — 聚焦重绘's box, drawn large.
 */
export function maskEditor(ctx, {src, width, height, mask = '', focus = null}) {
  return new Promise(resolve => {
    const doc = ctx.doc, host = doc.querySelector('.screen') || doc.body, layer = doc.createElement('div');
    layer.className = 'mask-editor';
    layer.innerHTML = `<header><button type="button" data-mask="cancel" class="text-button">取消</button><b>涂出要重画的地方</b><button type="button" data-mask="done" class="primary small">好了</button></header>
      <div class="mask-stage"><div class="mask-frame"><img alt="" src="${esc(src)}"><canvas></canvas><span class="mask-box" hidden></span></div></div>
      <footer><div class="segmented"><button type="button" data-mask="paint" aria-pressed="true">${icon('paint')}涂</button><button type="button" data-mask="erase" aria-pressed="false">${icon('backspace')}擦</button><button type="button" data-mask="focus" aria-pressed="false">${icon('expand')}聚焦</button></div>
        <label class="mask-size"><span>笔刷</span><input type="range" min="2" max="40" value="10" aria-label="笔刷大小"></label>
        <label class="mask-context" hidden><span>周围参考</span><input type="range" min="0" max="256" step="16" value="${focus?.context ?? 64}" aria-label="周围留多少给 AI 参考"></label>
        <button type="button" data-mask="clear" class="text-button">全部擦掉</button></footer>
      <p class="mask-tip" hidden>框出要细化的地方（比如脸）：这块放大后重画，细节更多。框里不涂就整块重画。</p>`;
    host.append(layer);
    // The picture as large as the space allows, in its own shape.
    const stage = layer.querySelector('.mask-stage'), frame = layer.querySelector('.mask-frame');
    const fit = () => { const r = stage.getBoundingClientRect(), k = Math.min((r.width - 24) / width, (r.height - 12) / height); frame.style.width = Math.max(40, width * k) + 'px'; frame.style.height = Math.max(40, height * k) + 'px'; };
    fit(); ctx.win.addEventListener('resize', fit);
    const canvas = layer.querySelector('canvas'), g = canvas.getContext('2d');
    canvas.width = width; canvas.height = height;
    let erase = false, down = false, last = null, painted = false, mode = 'paint', box = focus ? {x: focus.x, y: focus.y, w: focus.w, h: focus.h} : null, from = null;
    const boxEl = layer.querySelector('.mask-box');
    const showBox = () => { boxEl.hidden = !box; if (box) Object.assign(boxEl.style, {left: box.x / width * 100 + '%', top: box.y / height * 100 + '%', width: box.w / width * 100 + '%', height: box.h / height * 100 + '%'}); };
    showBox();
    if (mask) { const old = new ctx.win.Image(); old.onload = () => { g.drawImage(old, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ff2e6a'; g.fillRect(0, 0, width, height); g.globalCompositeOperation = 'source-over'; painted = true; }; old.src = 'data:image/png;base64,' + mask; }
    const brush = () => Number(layer.querySelector('.mask-size input').value) / 100 * Math.max(width, height) / 4;
    const at = e => { const r = canvas.getBoundingClientRect(); return {x: (e.clientX - r.left) / r.width * width, y: (e.clientY - r.top) / r.height * height}; };
    function stroke(from, to) {
      g.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
      // Pink to see on any picture; the mask itself is read from where something is painted (blocks()).
      g.strokeStyle = g.fillStyle = '#ff2e6a'; g.lineWidth = brush() * 2; g.lineCap = g.lineJoin = 'round';
      g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(to.x, to.y); g.stroke();
      if (!erase) painted = true;
    }
    canvas.addEventListener('pointerdown', e => { down = true; canvas.setPointerCapture?.(e.pointerId); last = at(e); if (mode === 'focus') { from = last; box = null; showBox(); } else stroke(last, last); e.preventDefault(); });
    canvas.addEventListener('pointermove', e => {
      if (!down) return;
      const p = at(e);
      if (mode === 'focus') { const x = Math.max(0, Math.min(from.x, p.x)), y = Math.max(0, Math.min(from.y, p.y)); box = {x, y, w: Math.min(width, Math.max(from.x, p.x)) - x, h: Math.min(height, Math.max(from.y, p.y)) - y}; showBox(); }
      else { stroke(last, p); last = p; }
      e.preventDefault();
    });
    const up = () => { down = false; last = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    // Escape, and the phone's back (which sends one), leave the brush without saving and go no further.
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(null); } };
    doc.addEventListener('keydown', key, true);
    const close = value => { doc.removeEventListener('keydown', key, true); ctx.win.removeEventListener('resize', fit); layer.remove(); resolve(value); };
    layer.addEventListener('click', e => {
      const what = e.target.closest('[data-mask]')?.dataset.mask;
      if (what === 'cancel') close(null);
      else if (what === 'paint' || what === 'erase' || what === 'focus') {
        mode = what; erase = what === 'erase';
        for (const b of layer.querySelectorAll('[data-mask=paint],[data-mask=erase],[data-mask=focus]')) b.setAttribute('aria-pressed', String(b.dataset.mask === what));
        layer.querySelector('.mask-size').hidden = what === 'focus'; layer.querySelector('.mask-context').hidden = what !== 'focus'; layer.querySelector('.mask-tip').hidden = what !== 'focus';
      }
      else if (what === 'clear') { g.clearRect(0, 0, width, height); painted = false; box = null; showBox(); }
      else if (what === 'done') {
        const big = box && box.w >= 16 && box.h >= 16;
        close({mask: painted ? blocks(doc, canvas) : '', focus: big ? {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h), context: Number(layer.querySelector('.mask-context input').value)} : null});
      }
    });
  });
}
/** The mask in NovelAI's blocks: each 8×8 block all white (drawn again) or left alone, as its own app sends it. */
function blocks(doc, canvas) {
  const {width, height} = canvas, small = canvasOf(doc, Math.ceil(width / 8), Math.ceil(height / 8)), sg = small.getContext('2d');
  sg.imageSmoothingEnabled = true; sg.drawImage(canvas, 0, 0, small.width, small.height);
  const data = sg.getImageData(0, 0, small.width, small.height);
  for (let i = 0; i < data.data.length; i += 4) { const on = data.data[i + 3] > 24; data.data[i] = data.data[i + 1] = data.data[i + 2] = 255; data.data[i + 3] = on ? 255 : 0; }
  sg.putImageData(data, 0, 0);
  const out = canvasOf(doc, width, height), og = out.getContext('2d');
  og.imageSmoothingEnabled = false; og.drawImage(small, 0, 0, small.width * 8, small.height * 8);
  return base64Of(out);
}

const pictureOf = (win, base64) => { const bytes = Uint8Array.from(win.atob(base64), c => c.charCodeAt(0)); return loadImage(win, new win.Blob([bytes], {type: 'image/png'})); };
/**
 * 聚焦重绘: the box and what is around it, enlarged to about a megapixel, is what NovelAI draws ({request}); the rest of
 * the picture stays here to put it back with composeFocused ({compose}). Nothing painted in the box: all of it is drawn.
 */
export async function focusedBase(win, base) {
  const doc = win.document, {focus, width, height} = base, context = focus.context ?? 64;
  const x0 = Math.max(0, Math.floor(focus.x - context)), y0 = Math.max(0, Math.floor(focus.y - context)), x1 = Math.min(width, Math.ceil(focus.x + focus.w + context)), y1 = Math.min(height, Math.ceil(focus.y + focus.h + context));
  const cw = x1 - x0, ch = y1 - y0, k = Math.sqrt(1048576 / (cw * ch)), tw = Math.max(64, Math.floor(cw * k / 64) * 64), th = Math.max(64, Math.floor(ch * k / 64) * 64);
  const picture = canvasOf(doc, tw, th), pg = picture.getContext('2d');
  pg.imageSmoothingQuality = 'high'; pg.drawImage(await pictureOf(win, base.image), x0, y0, cw, ch, 0, 0, tw, th);
  const painted = canvasOf(doc, tw, th), mg = painted.getContext('2d');
  if (base.mask) { mg.imageSmoothingEnabled = false; mg.drawImage(await pictureOf(win, base.mask), x0, y0, cw, ch, 0, 0, tw, th); }
  const sx = tw / cw, sy = th / ch, inBox = () => { mg.fillStyle = '#fff'; mg.fillRect((focus.x - x0) * sx, (focus.y - y0) * sy, focus.w * sx, focus.h * sy); };
  if (!base.mask || !mg.getImageData(0, 0, tw, th).data.some((v, i) => i % 4 === 3 && v > 24)) inBox();
  const mask = blocks(doc, painted);
  return {request: {image: base64Of(picture), mask, width: tw, height: th, strength: base.strength, noise: 0, overlay: true},
    compose: {image: base.image, width, height, x: x0, y: y0, w: cw, h: ch, mask}};
}
/** The enlarged part back in the whole picture, through its mask with a soft edge: a PNG. */
export async function composeFocused(win, {image, width, height, x, y, w, h, mask}, blob) {
  const doc = win.document, whole = canvasOf(doc, width, height), g = whole.getContext('2d'), part = canvasOf(doc, w, h), pg = part.getContext('2d');
  g.drawImage(await pictureOf(win, image), 0, 0, width, height);
  pg.imageSmoothingQuality = 'high'; pg.drawImage(await loadImage(win, blob), 0, 0, w, h);
  pg.globalCompositeOperation = 'destination-in'; pg.drawImage(await pictureOf(win, mask), 0, 0, w, h);
  g.drawImage(part, x, y);
  return new Promise((resolve, reject) => whole.toBlob(out => out ? resolve(out) : reject(Error('合成图片失败')), 'image/png'));
}
/** 扩图: the picture with empty space around it, and a mask of just that space: {image, mask, width, height, preview}. */
export async function padBase(win, base, {top = 0, left = 0, right = 0, bottom = 0}) {
  const doc = win.document, width = base.width + left + right, height = base.height + top + bottom;
  const picture = canvasOf(doc, width, height), g = picture.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, width, height);
  g.drawImage(await pictureOf(win, base.image), left, top, base.width, base.height);
  const space = canvasOf(doc, width, height), sg = space.getContext('2d');
  sg.fillStyle = '#fff'; sg.fillRect(0, 0, width, height);
  sg.clearRect(left, top, base.width, base.height);
  return {image: base64Of(picture), mask: blocks(doc, space), width, height, preview: picture.toDataURL('image/jpeg', .8)};
}

// ---------- 读参数 ----------
/** The text chunks of a PNG ({keyword: text}); {} when it is not a PNG. */
export async function pngText(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer), out = {};
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return out;
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at), type = String.fromCharCode(...bytes.subarray(at + 4, at + 8)), data = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'tEXt' || type === 'iTXt') {
      const zero = data.indexOf(0), key = new TextDecoder('latin1').decode(data.subarray(0, zero));
      let text = data.subarray(zero + 1);
      if (type === 'iTXt') {
        const compressed = text[0], rest = text.subarray(2), lang = rest.indexOf(0), trans = rest.indexOf(0, lang + 1);
        text = rest.subarray(trans + 1);
        if (compressed && typeof DecompressionStream === 'function') text = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
      }
      out[key] = new TextDecoder(type === 'tEXt' ? 'latin1' : 'utf-8').decode(text);
      if (type === 'tEXt') try { out[key] = new TextDecoder('utf-8', {fatal: true}).decode(text); } catch { /* latin1 it is */ }
    }
    if (type === 'IEND') break;
    at += 12 + length;
  }
  return out;
}
const MODEL_WORDS = [[/V5/i, /curated/i, 'nai-diffusion-5-curated'], [/V5/i, null, 'nai-diffusion-5-full'], [/V4\.5/i, /curated/i, 'nai-diffusion-4-5-curated'], [/V4\.5/i, null, 'nai-diffusion-4-5-full'],
  [/V4/i, /curated/i, 'nai-diffusion-4-curated-preview'], [/V4/i, null, 'nai-diffusion-4-full'], [/V3/i, /furry/i, 'nai-diffusion-furry-3'], [/V3/i, null, 'nai-diffusion-3']];
/**
 * What a NovelAI PNG was drawn with: {prompt, negative, characters: [{prompt, negative, position}], params: {model?,
 * width, height, steps, scale, sampler, schedule, cfgRescale, seed}}, or null when the picture says nothing of it.
 * Character positions come back as the 5×5 grid cell nearest their centre (-1 when they had none), and for V5, which
 * places people anywhere, also as the centre itself.
 */
export async function readNovelAI(buffer) {
  const text = await pngText(buffer);
  let c = null;
  try { c = JSON.parse(text.Comment || 'null'); } catch { return null; }
  if (!c || typeof c !== 'object') return null;
  const v4 = c.v4_prompt?.caption, v4n = c.v4_negative_prompt?.caption, coords = c.v4_prompt?.use_coords;
  const cell = ({x, y} = {}) => coords && Number.isFinite(x) && Number.isFinite(y) ? Math.min(4, Math.max(0, Math.round((y - .1) / .2))) * 5 + Math.min(4, Math.max(0, Math.round((x - .1) / .2))) : -1;
  const characters = (v4?.char_captions || []).map((ch, i) => ({prompt: String(ch.char_caption || ''), negative: String(v4n?.char_captions?.[i]?.char_caption || ''), position: cell(ch.centers?.[0]), ...(coords && /V5/i.test(String(text.Source || '') + String(text.Software || '')) && Number.isFinite(ch.centers?.[0]?.x) && Number.isFinite(ch.centers?.[0]?.y) ? {center: {x: ch.centers[0].x, y: ch.centers[0].y}} : {})})).filter(ch => ch.prompt.trim());
  const source = String(text.Source || '') + ' ' + String(text.Software || '');
  const model = MODEL_WORDS.find(([version, kind]) => version.test(source) && (!kind || kind.test(source)))?.[2];
  const num = v => Number.isFinite(Number(v)) ? Number(v) : undefined;
  const params = Object.fromEntries(Object.entries({model: NAI_MODELS.includes(model) ? model : undefined, width: num(c.width), height: num(c.height), steps: num(c.steps), scale: num(c.scale),
    sampler: c.sampler, schedule: c.noise_schedule, cfgRescale: num(c.cfg_rescale), seed: num(c.seed),
    // What the settings had added is in the prompt already: read back, the presets start off so as not to add it twice.
    quality: 'none', ucPreset: 'none', decrisper: c.dynamic_thresholding === true ? true : undefined, variety: c.skip_cfg_above_sigma ? true : undefined,
    smea: c.sm === true ? (c.sm_dyn === true ? 'dyn' : 'on') : c.sm === false ? 'off' : undefined}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const prompt = String(v4?.base_caption ?? c.prompt ?? text.Description ?? '');
  if (!prompt.trim() && !characters.length) return null;
  return {prompt, negative: String(v4n?.base_caption ?? c.uc ?? ''), characters, params};
}
