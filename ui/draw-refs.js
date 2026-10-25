// The 参考图 tab of the drawing app (NovelAI): a base picture — 图生图 (draw over it, as strongly as asked) or, with an
// area painted, 局部重绘 (draw only that again) — and 角色参考 (NovelAI's Precise Reference: the same character, style
// or both in a new picture; V4.5 only). Kept for this visit of the app; the pictures go with the next drawing.
import {esc, btn, help} from './common.js';
import {icon} from './icons.js';
import {takesReference, REFERENCE_ANLAS} from '../core/novelai.js';
import {fitBase, fitReference, pickPicture, maskEditor} from './draw-images.js';

const KINDS = [['character', '角色'], ['style', '画风'], ['both', '角色+画风']];
const MAX_REFS = 4;
const slider = (key, label, value, min, max, step, note = '', index = -1) => `<div class="field"><div class="meter-label"><span>${label}${note ? help(note) : ''}</span><output>${Number(value).toFixed(2)}</output></div><input class="slider" type="range" data-ref-slider="${key}"${index >= 0 ? ` data-index="${index}"` : ''} min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"></div>`;

export function refPanel({ctx, api, rerender, shown}) {
  /** base: {image, width, height, preview, strength, noise, mask}; refs: [{image, preview, kind, strength, fidelity}]. */
  let base = null;
  const refs = [];
  const model = () => api.getState().draw.params.model;

  function baseHTML() {
    if (!base) return `<div class="ref-empty"><div class="actions">${btn('ref-base-pick', icon('import') + '选一张', 'secondary')}${shown() ? btn('ref-base-shown', icon('image') + '用上面这张', 'secondary') : ''}</div></div>`;
    return `<div class="ref-card"><div class="ref-thumb" style="aspect-ratio:${base.width}/${base.height}"><img src="${esc(base.preview)}" alt="底图">${base.mask ? `<span class="ref-mask" style="-webkit-mask-image:url(data:image/png;base64,${base.mask});mask-image:url(data:image/png;base64,${base.mask})" aria-hidden="true"></span>` : ''}</div>
      <div class="ref-main"><p class="ref-title"><b>${base.mask ? '局部重绘' : '图生图'}</b><small>${base.width}×${base.height}</small></p>
        ${slider('strength', '强度', base.strength, .01, .99, .01, base.mask ? '涂出来的地方重画得多彻底：越高越不像原来那块。' : '越高越不像原图：0.3 左右小修，0.7 左右重画但保留构图。')}
        ${base.mask ? '' : slider('noise', '噪声', base.noise, 0, .99, .01, '给原图加噪点，让细节多一些变化。一般 0 到 0.1。')}
        <div class="actions ref-actions">${btn('ref-mask', icon('paint') + (base.mask ? '改涂的地方' : '涂出要重画的地方'), 'secondary small')}${base.mask ? btn('ref-unmask', '不涂了', 'text-button') : ''}${btn('ref-base-clear', icon('trash'), 'text-button', 'aria-label="去掉底图"')}</div></div></div>`;
  }
  function refsHTML() {
    if (!takesReference(model())) return `<p class="hint ref-note" data-keep-hint>${icon('alert')}角色参考只有 V4.5 能用（V5 还不支持）。在「参数」里把模型换成 V4.5 才会生效。</p>`;
    return (refs.length ? refs.map((r, i) => `<div class="ref-card"><div class="ref-thumb"><img src="${esc(r.preview)}" alt="参考 ${i + 1}"></div>
      <div class="ref-main"><div class="segmented ref-kinds" role="group" aria-label="参考什么">${KINDS.map(([k, l]) => `<button type="button" data-action="ref-kind" data-index="${i}" data-kind="${k}" aria-pressed="${r.kind === k}">${l}</button>`).join('')}</div>
        ${slider('strength', '强度', r.strength, 0, 1, .01, '参考有多大分量。太高容易连姿势、构图都照搬。', i)}
        ${slider('fidelity', '保真度', r.fidelity, 0, 1, .01, '越高越贴近参考图里的细节（发型、衣服的花纹）；低一些只留大概的样子。', i)}
        <div class="actions ref-actions">${btn('ref-remove', icon('trash') + '去掉', 'text-button', `data-index="${i}"`)}</div></div></div>`).join('') : '')
      + (refs.length < MAX_REFS ? `<div class="actions">${btn('ref-add', icon('add') + '加一张参考', 'secondary')}${shown() ? btn('ref-add-shown', icon('image') + '用上面这张', 'secondary') : ''}</div>` : '');
  }
  /** A fold of this tab: closed until it holds something (or is opened), its state on the right of its title. */
  const fold = (group, glyph, title, sub, pill, on, body) => `<details class="ref-fold" data-group="${group}"${on ? ' open' : ''}><summary>${icon(glyph)}<span class="ref-fold-title"><b>${title}</b><small>${sub}</small></span><span class="ref-pill${on ? ' on' : ''}">${esc(pill)}</span></summary><div class="fold-body ref-section">${body}</div></details>`;
  function html() {
    const takes = takesReference(model());
    const cost = [base && '有底图的图不在 Opus 免费档里，每张都扣 Anlas', refs.length && takes && `每张参考每张图多扣 ${REFERENCE_ANLAS} Anlas，用参考时不带 Vibe`].filter(Boolean);
    return fold('ref-base', 'image', '底图', '图生图 · 局部重绘', base ? (base.mask ? '局部重绘' : '图生图') : '没有', !!base,
        `<p class="hint ref-about" data-keep-hint>放一张图，按它的构图和颜色重画；在上面涂出一块，就只重画那一块。画出来的尺寸跟底图的形状走。</p>${baseHTML()}`)
      + fold('ref-refs', 'person', '角色参考', 'NovelAI 精确参考 · V4.5', !takes ? (refs.length ? 'V5 不用' : 'V4.5 才有') : refs.length ? `${refs.length} 张` : '没有', refs.length > 0,
        `<p class="hint ref-about" data-keep-hint>放一张角色的图，新图里就是这个人；选「画风」只学画法。最多 ${MAX_REFS} 张，每张每张图多扣 ${REFERENCE_ANLAS} Anlas。</p>${refsHTML()}`)
      + (cost.length ? `<p class="hint ref-cost" data-keep-hint>${icon('alert')}${cost.map(esc).join('；')}。</p>` : '');
  }

  /** The shown result as a Blob (for 用上面这张). */
  async function shownBlob() { const r = shown(); if (!r) return null; const photo = await api.getPhoto(r.photoId); return photo?.blob || null; }
  async function setBase(blob) {
    if (!blob) return;
    const fitted = await fitBase(ctx.win, blob);
    base = {...fitted, strength: base?.strength ?? .7, noise: base?.noise ?? 0, mask: ''};
    rerender();
  }
  async function addRef(blob) {
    if (!blob || refs.length >= MAX_REFS) return;
    refs.push({...await fitReference(ctx.win, blob), kind: 'character', strength: .6, fidelity: .5});
    rerender();
  }

  /** Clicks of this tab (data-action ref-*). True when it was one. */
  async function click(el) {
    const i = Number(el.dataset.index);
    try {
      switch (el.dataset.action) {
        case 'ref-base-pick': await setBase(await pickPicture(ctx, api, '选一张底图')); return true;
        case 'ref-base-shown': await setBase(await shownBlob()); return true;
        case 'ref-base-clear': base = null; rerender(); return true;
        case 'ref-unmask': base.mask = ''; rerender(); return true;
        case 'ref-mask': {
          const mask = await maskEditor(ctx, {src: base.preview, width: base.width, height: base.height, mask: base.mask});
          // The first painting draws that area again fully (as NovelAI's own 局部重绘 starts); a strength set after stays.
          if (mask !== null && base) { if (mask && !base.mask) base.strength = .99; base.mask = mask; rerender(); }
          return true;
        }
        case 'ref-add': await addRef(await pickPicture(ctx, api, '选一张参考图')); return true;
        case 'ref-add-shown': await addRef(await shownBlob()); return true;
        case 'ref-remove': refs.splice(i, 1); rerender(); return true;
        case 'ref-kind': refs[i].kind = el.dataset.kind; rerender(); return true;
      }
    } catch (error) { ctx.notify(error.message, {error: true}); return true; }
    return false;
  }
  /** A slider moved: shown at once, kept for the next drawing. */
  function slide(el) {
    const value = Number(el.value), key = el.dataset.refSlider, i = Number(el.dataset.index);
    el.previousElementSibling.querySelector('output').textContent = value.toFixed(2);
    if (Number.isInteger(i) && el.dataset.index !== undefined) { if (refs[i]) refs[i][key] = value; }
    else if (base) base[key] = value;
  }

  return {
    html, click, slide,
    /** Uses a picture from elsewhere in the app (a result's tools). */
    useAsBase: setBase, useAsRef: addRef,
    /** What goes with the next drawing (NovelAI only). */
    payload() {
      return {base: base ? {image: base.image, width: base.width, height: base.height, strength: base.strength, noise: base.noise, ...(base.mask ? {mask: base.mask} : {})} : null,
        refs: takesReference(model()) ? refs.map(r => ({image: r.image, kind: r.kind, strength: r.strength, fidelity: r.fidelity})) : []};
    },
    /** For the quote: whether a base picture is set and how many references go. */
    extra() { return {base: !!base, refs: takesReference(model()) ? refs.length : 0}; },
    /** A short word for the tab (底图 / 参考 counts). */
    badge() { const n = (base ? 1 : 0) + refs.length; return n ? String(n) : ''; }
  };
}
