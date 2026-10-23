// Pictures for NovelAI in the drawing app: a base picture fitted for 图生图, a reference fitted for 角色参考, a picture
// as it is for the tools (放大, 导演工具), the brush that marks what 局部重绘 draws again, picking a picture from the
// album or the device, and reading back what a NovelAI PNG was drawn with.
import {esc} from './common.js';
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

/** Picks a picture from the album or the device: its Blob, or null when nothing was picked. */
export function pickPicture(ctx, api, title = '选一张图') {
  return new Promise(async resolve => {
    let done = false;
    const finish = value => { if (done) return; done = true; resolve(value); d.close(); };
    const rows = (await api.listPhotos()).slice(0, 60), urls = [];
    const d = ctx.dialog(title, `<div class="actions" style="margin-top:0"><label class="secondary file-button">${icon('import')}从手机里选<input type="file" data-pick-file accept="image/png,image/jpeg,image/webp" hidden></label></div>
      ${rows.length ? `<p class="hint">或者从相册里选：</p><div class="photo-grid pick-photos">${rows.map(r => `<button type="button" data-pick-photo="${esc(r.id)}" aria-label="选 ${esc(r.name)}"><img alt="${esc(r.name)}"></button>`).join('')}</div>` : '<p class="hint">相册里还没有图。</p>'}`);
    d.onClose?.(() => { for (const url of urls) ctx.win.URL.revokeObjectURL(url); if (!done) { done = true; resolve(null); } });
    d.body.addEventListener('change', e => { const file = e.target.closest('[data-pick-file]')?.files?.[0]; if (file) finish(file); });
    d.body.addEventListener('click', async e => { const id = e.target.closest('[data-pick-photo]')?.dataset.pickPhoto; if (!id) return; const photo = await api.getPhoto(id); if (photo?.blob) finish(photo.blob); });
    for (const row of rows) {
      const photo = await api.getPhoto(row.id).catch(() => null), img = d.body.querySelector(`[data-pick-photo="${CSS.escape(row.id)}"] img`);
      if (!photo?.blob || !img) continue;
      const url = ctx.win.URL.createObjectURL(photo.blob); urls.push(url); img.src = url;
    }
  });
}

/**
 * 局部重绘: paint over what is to be drawn again. Opens over the phone; resolves with the mask (base64 PNG at
 * width×height, white where it is drawn again, in NovelAI's 8-pixel blocks), '' when everything was wiped off, or null
 * when left without saving. mask: the one painted before, to go on with.
 */
export function maskEditor(ctx, {src, width, height, mask = ''}) {
  return new Promise(resolve => {
    const doc = ctx.doc, host = doc.querySelector('.screen') || doc.body, layer = doc.createElement('div');
    layer.className = 'mask-editor';
    layer.innerHTML = `<header><button type="button" data-mask="cancel" class="text-button">取消</button><b>涂出要重画的地方</b><button type="button" data-mask="done" class="primary small">好了</button></header>
      <div class="mask-stage"><div class="mask-frame"><img alt="" src="${esc(src)}"><canvas></canvas></div></div>
      <footer><div class="segmented"><button type="button" data-mask="paint" aria-pressed="true">${icon('paint')}涂</button><button type="button" data-mask="erase" aria-pressed="false">${icon('backspace')}擦</button></div>
        <label class="mask-size"><span>笔刷</span><input type="range" min="2" max="40" value="10" aria-label="笔刷大小"></label>
        <button type="button" data-mask="clear" class="text-button">全部擦掉</button></footer>`;
    host.append(layer);
    // The picture as large as the space allows, in its own shape.
    const stage = layer.querySelector('.mask-stage'), frame = layer.querySelector('.mask-frame');
    const fit = () => { const r = stage.getBoundingClientRect(), k = Math.min((r.width - 24) / width, (r.height - 12) / height); frame.style.width = Math.max(40, width * k) + 'px'; frame.style.height = Math.max(40, height * k) + 'px'; };
    fit(); ctx.win.addEventListener('resize', fit);
    const canvas = layer.querySelector('canvas'), g = canvas.getContext('2d');
    canvas.width = width; canvas.height = height;
    let erase = false, down = false, last = null, painted = false;
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
    canvas.addEventListener('pointerdown', e => { down = true; canvas.setPointerCapture?.(e.pointerId); last = at(e); stroke(last, last); e.preventDefault(); });
    canvas.addEventListener('pointermove', e => { if (!down) return; const p = at(e); stroke(last, p); last = p; e.preventDefault(); });
    const up = () => { down = false; last = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    // Escape, and the phone's back (which sends one), leave the brush without saving and go no further.
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(null); } };
    doc.addEventListener('keydown', key, true);
    const close = value => { doc.removeEventListener('keydown', key, true); ctx.win.removeEventListener('resize', fit); layer.remove(); resolve(value); };
    layer.addEventListener('click', e => {
      const what = e.target.closest('[data-mask]')?.dataset.mask;
      if (what === 'cancel') close(null);
      else if (what === 'paint' || what === 'erase') { erase = what === 'erase'; for (const b of layer.querySelectorAll('[data-mask=paint],[data-mask=erase]')) b.setAttribute('aria-pressed', String(b.dataset.mask === what)); }
      else if (what === 'clear') { g.clearRect(0, 0, width, height); painted = false; }
      else if (what === 'done') close(painted ? blocks(doc, canvas) : '');
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
 * Character positions come back as the 5×5 grid cell nearest their centre (-1 when they had none).
 */
export async function readNovelAI(buffer) {
  const text = await pngText(buffer);
  let c = null;
  try { c = JSON.parse(text.Comment || 'null'); } catch { return null; }
  if (!c || typeof c !== 'object') return null;
  const v4 = c.v4_prompt?.caption, v4n = c.v4_negative_prompt?.caption, coords = c.v4_prompt?.use_coords;
  const cell = ({x, y} = {}) => coords && Number.isFinite(x) && Number.isFinite(y) ? Math.min(4, Math.max(0, Math.round((y - .1) / .2))) * 5 + Math.min(4, Math.max(0, Math.round((x - .1) / .2))) : -1;
  const characters = (v4?.char_captions || []).map((ch, i) => ({prompt: String(ch.char_caption || ''), negative: String(v4n?.char_captions?.[i]?.char_caption || ''), position: cell(ch.centers?.[0])})).filter(ch => ch.prompt.trim());
  const source = String(text.Source || '') + ' ' + String(text.Software || '');
  const model = MODEL_WORDS.find(([version, kind]) => version.test(source) && (!kind || kind.test(source)))?.[2];
  const num = v => Number.isFinite(Number(v)) ? Number(v) : undefined;
  const params = Object.fromEntries(Object.entries({model: NAI_MODELS.includes(model) ? model : undefined, width: num(c.width), height: num(c.height), steps: num(c.steps), scale: num(c.scale),
    sampler: c.sampler, schedule: c.noise_schedule, cfgRescale: num(c.cfg_rescale), seed: num(c.seed)}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const prompt = String(v4?.base_caption ?? c.prompt ?? text.Description ?? '');
  if (!prompt.trim() && !characters.length) return null;
  return {prompt, negative: String(v4n?.base_caption ?? c.uc ?? ''), characters, params};
}
