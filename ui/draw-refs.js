// The 参考图 tab of the drawing app. NovelAI: a base picture — 图生图 (draw over it, as strongly as asked) or, with an
// area painted, 局部重绘 (draw only that again) — and 角色参考 (NovelAI's Precise Reference: the same character, style
// or both in a new picture; V4.5 only). GPT: up to 16 pictures it draws after, known by their order (图 1, 图 2 …),
// each with what it is in the user's words. Kept for this visit of the app; the pictures go with the next drawing.
import {esc, btn, help} from './common.js';
import {icon} from './icons.js';
import {takesReference, REFERENCE_ANLAS, MAX_REFERENCES, NAI_MAX_PIXELS} from '../core/novelai.js';
import {GPT_MAX_REFS, gptTakesRefs} from '../core/image-engines.js';
import {fitBase, fitReference, fitGptReference, pickPicture, maskEditor, focusedBase, padBase} from './draw-images.js';

const KINDS = [['character', '角色'], ['style', '画风'], ['both', '角色+画风']];
const MAX_REFS = MAX_REFERENCES;
const slider = (key, label, value, min, max, step, note = '', index = -1) => `<div class="field"><div class="meter-label"><span>${label}${note ? help(note) : ''}</span><output>${Number(value).toFixed(2)}</output></div><input class="slider" type="range" data-ref-slider="${key}"${index >= 0 ? ` data-index="${index}"` : ''} min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"></div>`;

export function refPanel({ctx, api, rerender, shown}) {
  /** base: {image, width, height, preview, strength, noise, mask}; refs: [{image, preview, kind, strength, fidelity}]. */
  let base = null;
  const refs = [];
  const model = () => api.getState().draw.params.model;
  /** GPT's: [{image, type, preview, label}]. */
  const gptRefs = [];
  const gpt = () => api.getState().draw.engine === 'gpt', gptModel = () => api.getState().draw.gpt.model;

  /** Is part of the base drawn again: a mask, or a 聚焦 box (which is all drawn again when nothing is painted in it). */
  const repaint = () => !!(base?.mask || base?.focus);
  function baseHTML() {
    if (!base) return `<div class="ref-empty"><div class="actions">${btn('ref-base-pick', icon('import') + '选一张', 'secondary')}${shown() ? btn('ref-base-shown', icon('image') + '用上面这张', 'secondary') : ''}</div></div>`;
    return `<div class="ref-card"><div class="ref-thumb" style="aspect-ratio:${base.width}/${base.height}"><img src="${esc(base.preview)}" alt="底图">${base.mask ? `<span class="ref-mask" style="-webkit-mask-image:url(data:image/png;base64,${base.mask});mask-image:url(data:image/png;base64,${base.mask})" aria-hidden="true"></span>` : ''}${base.focus ? `<span class="ref-focus" style="left:${base.focus.x / base.width * 100}%;top:${base.focus.y / base.height * 100}%;width:${base.focus.w / base.width * 100}%;height:${base.focus.h / base.height * 100}%" aria-hidden="true"></span>` : ''}</div>
      <div class="ref-main"><p class="ref-title"><b>${repaint() ? (base.focus ? '聚焦重绘' : '局部重绘') : '图生图'}</b><small>${base.width}×${base.height}</small></p>
        ${slider('strength', '强度', base.strength, .01, repaint() ? 1 : .99, .01, repaint() ? '涂出来的地方重画得多彻底：1 是全部重画；低一些保留原来那块的样子，只改一点（V4 及以后）。' : '越高越不像原图：0.3 左右小修，0.7 左右重画但保留构图。')}
        ${repaint() ? '' : slider('noise', '噪声', base.noise, 0, .99, .01, '给原图加噪点，让细节多一些变化。一般 0 到 0.1。')}
        ${repaint() ? `<div class="setting-row"><span>盖回原图${help('开着时，没涂的地方一个像素都不变；关掉让 AI 整张微调，接缝更自然，但别处也可能有细微变化。')}</span><input class="switch" type="checkbox" data-ref-overlay aria-label="盖回原图" ${base.overlay === false ? '' : 'checked'}></div>` : ''}
        <div class="actions ref-actions">${btn('ref-mask', icon('paint') + (repaint() ? '改涂的地方' : '涂出要重画的地方'), 'secondary small')}${btn('ref-pad', icon('expand') + '扩图', 'secondary small')}${repaint() ? btn('ref-unmask', '不涂了', 'text-button') : ''}${btn('ref-base-clear', icon('trash'), 'text-button', 'aria-label="去掉底图"')}</div></div></div>`;
  }
  function refsHTML() {
    if (!takesReference(model())) return `<p class="hint ref-note" data-keep-hint>${icon('alert')}角色参考只有 V4.5 能用（V5 还不支持）。在「参数」里把模型换成 V4.5 才会生效。</p>`;
    return (refs.length ? refs.map((r, i) => `<div class="ref-card"><div class="ref-thumb"><img src="${esc(r.preview)}" alt="参考 ${i + 1}"></div>
      <div class="ref-main"><div class="segmented ref-kinds" role="group" aria-label="参考什么">${KINDS.map(([k, l]) => `<button type="button" data-action="ref-kind" data-index="${i}" data-kind="${k}" aria-pressed="${r.kind === k}">${l}</button>`).join('')}</div>
        ${slider('strength', '强度', r.strength, -1, 1, .01, '参考有多大分量。太高容易连姿势、构图都照搬。负数是往反方向走，遇到特别差的参考图时有用。', i)}
        ${slider('fidelity', '保真度', r.fidelity, -1, 1, .01, '越高越贴近参考图里的细节（发型、衣服的花纹）；低一些只留大概的样子。', i)}
        <div class="actions ref-actions">${btn('ref-remove', icon('trash') + '去掉', 'text-button', `data-index="${i}"`)}</div></div></div>`).join('') : '')
      + (refs.length < MAX_REFS ? `<div class="actions">${btn('ref-add', icon('add') + '加一张参考', 'secondary')}${shown() ? btn('ref-add-shown', icon('image') + '用上面这张', 'secondary') : ''}</div>` : '');
  }
  function gptHTML() {
    const g = api.getState().draw.gpt, takes = gptTakesRefs(g.model);
    const cards = gptRefs.map((r, i) => `<div class="ref-card"><div class="ref-thumb"><img src="${esc(r.preview)}" alt="图 ${i + 1}"><span class="ref-num">图 ${i + 1}</span></div>
      <div class="ref-main"><label class="field"><span>这是什么</span><input type="text" data-ref-label data-index="${i}" maxlength="80" value="${esc(r.label)}" placeholder="可不填" aria-label="图 ${i + 1} 是什么"></label>
        <div class="actions ref-actions">${i ? btn('ref-up', icon('up') + '往前', 'text-button', `data-index="${i}"`) : ''}${btn('ref-remove', icon('trash') + '去掉', 'text-button', `data-index="${i}"`)}</div></div></div>`).join('');
    const add = btn('ref-add', icon('add') + '加参考图', 'secondary') + (shown() ? btn('ref-add-shown', icon('image') + '用上面这张', 'secondary') : '');
    return `<div class="ref-section gpt-refs"><p class="hint ref-about" data-keep-hint>放几张图给 GPT 照着画：角色、衣服、物件、画风都行，最多 ${GPT_MAX_REFS} 张。按顺序是图 1、图 2……，提示词里可以直接写「图 1 的女孩坐在图 2 的沙发上」；填了「这是什么」的，会一起告诉 GPT。</p>`
      + (takes ? '' : `<p class="hint ref-note" data-keep-hint>${icon('alert')}${esc(g.model)} 不能带参考图。在「参数」里换成 gpt-image 模型才会生效。</p>`)
      + (/^\/proxy\//.test(g.url) ? `<p class="hint ref-note" data-keep-hint>${icon('alert')}GPT 的接口地址是酒馆转发（/proxy/ 开头），转发带不了图：要用参考图，接口地址得填直连的中转。</p>` : '')
      + cards
      + (gptRefs.length >= GPT_MAX_REFS ? '' : gptRefs.length ? `<div class="actions">${add}</div>` : `<div class="ref-empty"><div class="actions">${add}</div></div>`)
      + (gptRefs.length && takes ? `<p class="hint ref-cost" data-keep-hint>${icon('alert')}带参考图时走 GPT 的改图接口（/images/edits），中转要支持它；参考图算进输入的费用，图越多越贵。</p>` : '')
      + '</div>';
  }
  /** A fold of this tab: closed until it holds something (or is opened), its state on the right of its title. */
  const fold = (group, glyph, title, sub, pill, on, body) => `<details class="ref-fold" data-group="${group}"${on ? ' open' : ''}><summary>${icon(glyph)}<span class="ref-fold-title"><b>${title}</b><small>${sub}</small></span><span class="ref-pill${on ? ' on' : ''}">${esc(pill)}</span></summary><div class="fold-body ref-section">${body}</div></details>`;
  function html() {
    if (gpt()) return gptHTML();
    const takes = takesReference(model());
    const cost = [refs.length && takes && `每张参考每张图多扣 ${REFERENCE_ANLAS} Anlas，用参考时不带 Vibe`].filter(Boolean);
    return fold('ref-base', 'image', '底图', '图生图 · 局部重绘', base ? (repaint() ? (base.focus ? '聚焦重绘' : '局部重绘') : '图生图') : '没有', !!base,
        `<p class="hint ref-about" data-keep-hint>放一张图，按它的构图和颜色重画；涂出一块就只重画那一块。</p>${baseHTML()}`)
      + fold('ref-refs', 'person', '角色参考', 'NovelAI 精确参考 · V4.5', !takes ? (refs.length ? 'V5 不用' : 'V4.5 才有') : refs.length ? `${refs.length} 张` : '没有', refs.length > 0,
        `<p class="hint ref-about" data-keep-hint>放一张角色的图，新图里就是这个人；选「画风」只学画法。每张每张图多扣 ${REFERENCE_ANLAS} Anlas。</p>${refsHTML()}`)
      + (cost.length ? `<p class="hint ref-cost" data-keep-hint>${icon('alert')}${cost.map(esc).join('；')}。</p>` : '');
  }

  /** The shown result as a Blob (for 用上面这张). */
  async function shownBlob() { const r = shown(); if (!r) return null; const photo = await api.getPhoto(r.photoId); return photo?.blob || null; }
  async function setBase(blob) {
    if (!blob) return;
    const fitted = await fitBase(ctx.win, blob);
    base = {...fitted, strength: .7, noise: base?.noise ?? 0, mask: '', focus: null, overlay: true};
    rerender();
  }
  async function addRef(blob) {
    if (!blob || refs.length >= MAX_REFS) return;
    refs.push({...await fitReference(ctx.win, blob), kind: 'character', strength: .6, fidelity: .5});
    rerender();
  }
  /** GPT: one picture or several (picked together), as many as there is room for. */
  async function addGptRefs(picked) {
    const list = [picked].flat().filter(Boolean), room = GPT_MAX_REFS - gptRefs.length;
    if (!list.length) return;
    for (const blob of list.slice(0, room)) gptRefs.push({...await fitGptReference(ctx.win, blob), label: ''});
    if (list.length > room) ctx.notify(`最多 ${GPT_MAX_REFS} 张，多出来的 ${list.length - room} 张没有放进去`);
    rerender();
  }

  /** 扩图: empty space added around the picture and masked, so only it is drawn. */
  function padSheet() {
    const sides = {top: 0, left: 0, right: 0, bottom: 0}, names = {top: '上', left: '左', right: '右', bottom: '下'};
    const d = ctx.dialog('扩图', '');
    const total = () => [base.width + sides.left + sides.right, base.height + sides.top + sides.bottom];
    const draw = () => {
      const [w, h] = total(), over = w * h > NAI_MAX_PIXELS;
      d.body.innerHTML = `<div class="group pad"><div class="pad-sides">${Object.entries(names).map(([k, l]) => `<div class="field"><span>${l}</span><div class="pad-step">${btn('pad-less', '−', 'chip-button', `data-side="${k}" aria-label="${l}边少一点"`)}<output>${sides[k]}</output>${btn('pad-more', '+', 'chip-button', `data-side="${k}" aria-label="${l}边多一点"`)}</div></div>`).join('')}</div>
        <p class="hint" data-keep-hint>扩到 ${w}×${h}${over ? '，太大了（最多约 2048×1536）' : ''}</p>
        <div class="actions">${btn('pad-go', icon('expand') + '扩图', 'primary', over || w === base.width && h === base.height ? 'disabled' : '')}</div></div>`;
    };
    draw();
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      try {
        if (b.dataset.action === 'pad-more') { sides[b.dataset.side] += 64; draw(); }
        else if (b.dataset.action === 'pad-less') { sides[b.dataset.side] = Math.max(0, sides[b.dataset.side] - 64); draw(); }
        else if (b.dataset.action === 'pad-go') { const next = await padBase(ctx.win, base, sides); base = {...base, ...next, focus: null, strength: 1, overlay: true}; d.close(); rerender(); }
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** Clicks of this tab (data-action ref-*). True when it was one. */
  async function click(el) {
    const i = Number(el.dataset.index);
    try {
      switch (el.dataset.action) {
        case 'ref-base-pick': await setBase(await pickPicture(ctx, api, '选一张底图')); return true;
        case 'ref-base-shown': await setBase(await shownBlob()); return true;
        case 'ref-base-clear': base = null; rerender(); return true;
        case 'ref-unmask': base.mask = ''; base.focus = null; base.strength = .7; rerender(); return true;
        case 'ref-mask': {
          const was = repaint(), picked = await maskEditor(ctx, {src: base.preview, width: base.width, height: base.height, mask: base.mask, focus: base.focus});
          // The first painting draws that area again fully (as NovelAI's own 局部重绘 starts); a strength set after stays.
          if (picked && base) { base.mask = picked.mask; base.focus = picked.focus; if (!was && repaint()) base.strength = 1; if (was && !repaint()) base.strength = .7; rerender(); }
          return true;
        }
        case 'ref-pad': padSheet(); return true;
        case 'ref-add': if (gpt()) await addGptRefs(await pickPicture(ctx, api, '选参考图', {multiple: true})); else await addRef(await pickPicture(ctx, api, '选一张参考图')); return true;
        case 'ref-add-shown': if (gpt()) await addGptRefs(await shownBlob()); else await addRef(await shownBlob()); return true;
        case 'ref-remove': (gpt() ? gptRefs : refs).splice(i, 1); rerender(); return true;
        case 'ref-up': if (i > 0 && gptRefs[i]) { [gptRefs[i - 1], gptRefs[i]] = [gptRefs[i], gptRefs[i - 1]]; rerender(); } return true;
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

  function overlay(el) { if (base) base.overlay = el.checked; }
  /** What a GPT 参考图 is, as typed (no redraw, so typing goes on). */
  function label(el) { const r = gptRefs[Number(el.dataset.index)]; if (r) r.label = el.value.slice(0, 80); }

  return {
    html, click, slide, label, overlay,
    /** Uses a picture from elsewhere in the app (a result's tools). */
    useAsBase: setBase, useAsRef: addRef,
    /** What goes with the next drawing: NovelAI's base and references, or GPT's references. */
    async payload() {
      if (gpt()) return {base: null, refs: gptTakesRefs(gptModel()) ? gptRefs.map(r => ({image: r.image, type: r.type, label: r.label.trim()})) : []};
      const asked = takesReference(model()) ? refs.map(r => ({image: r.image, kind: r.kind, strength: r.strength, fidelity: r.fidelity})) : [];
      if (base?.focus) { const {request, compose} = await focusedBase(ctx.win, base); return {base: request, refs: asked, focus: compose}; }
      return {base: base ? {image: base.image, width: base.width, height: base.height, strength: base.strength, noise: base.noise, overlay: base.overlay, ...(base.mask ? {mask: base.mask} : {})} : null, refs: asked};
    },
    /** For the quote: whether a base picture is set and how many references go. */
    extra() { return {base: !!base, refs: takesReference(model()) ? refs.length : 0, ...(base ? {size: base.focus ? {width: 1024, height: 1024} : {width: base.width, height: base.height}} : {})}; },
    /** A short word for the tab (底图 / 参考 counts). */
    badge() { const n = gpt() ? gptRefs.length : (base ? 1 : 0) + refs.length; return n ? String(n) : ''; }
  };
}
