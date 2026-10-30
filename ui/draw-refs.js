// The 参考图 tab of the drawing app. NovelAI: a base picture — 图生图 (draw over it, as strongly as asked) or, with an
// area painted, 局部重绘 (draw only that again) — and 角色参考 (NovelAI's Precise Reference: the same character, style
// or both in a new picture; V4.5 only). GPT: up to 16 pictures it draws after, known by their order (图 1, 图 2 …),
// each with what it is in the user's words. Kept for this visit of the app; the pictures go with the next drawing.
import {esc, btn, help} from './common.js';
import {icon} from './icons.js';
import {saveFile, zipFiles} from '../download.js';
import {takesReference, REFERENCE_ANLAS, REFERENCE_KINDS, MAX_REFERENCES, NAI_MAX_PIXELS} from '../core/novelai.js';
import {readZip} from '../core/model-files.js';
import {GPT_MAX_REFS, gptTakesRefs} from '../core/image-engines.js';
import {fitBase, fitReference, fitGptReference, pickPicture, maskEditor, focusedBase, padBase} from './draw-images.js';

const KINDS = [['character', '角色'], ['style', '画风'], ['both', '角色+画风']];
const MAX_REFS = MAX_REFERENCES;
const slider = (key, label, value, min, max, step, note = '', index = -1) => `<div class="field"><div class="meter-label"><span>${label}${note ? help(note) : ''}</span><output>${Number(value).toFixed(2)}</output></div><input class="slider" type="range" data-ref-slider="${key}"${index >= 0 ? ` data-index="${index}"` : ''} min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"></div>`;

export function refPanel({ctx, api, rerender, shown}) {
  /** base: {image, width, height, preview, strength, noise, mask}; refs: [{image, preview, kind, strength, fidelity, enabled?}]. */
  let base = null;
  const refs = [];
  const model = () => api.getState().draw.params.model;
  /** GPT's: [{image, type, preview, label}]. */
  const gptRefs = [];
  const gpt = () => api.getState().draw.engine === 'gpt', gptModel = () => api.getState().draw.gpt.model;

  /** Is part of the base drawn again: a mask, or a 聚焦 box (which is all drawn again when nothing is painted in it). */
  const repaint = () => !!(base?.mask || base?.focus);
  const look = () => api.getState().draw.maskLook;
  /** The references that go with a picture: one switched off stays here and is not sent, nor paid for. */
  const usedRefs = () => refs.filter(r => r.enabled !== false);
  function baseHTML() {
    if (!base) return `<div class="ref-empty"><div class="actions">${btn('ref-base-pick', icon('import') + '选一张', 'secondary')}${shown() ? btn('ref-base-shown', icon('image') + '用上面这张', 'secondary') : ''}</div></div>`;
    return `<div class="ref-card"><div class="ref-thumb" style="aspect-ratio:${base.width}/${base.height}"><img src="${esc(base.preview)}" alt="底图">${base.mask ? `<span class="ref-mask" style="background:${esc(look().color)};-webkit-mask-image:url(data:image/png;base64,${base.mask});mask-image:url(data:image/png;base64,${base.mask})" aria-hidden="true"></span>` : ''}${base.focus ? `<span class="ref-focus" style="left:${base.focus.x / base.width * 100}%;top:${base.focus.y / base.height * 100}%;width:${base.focus.w / base.width * 100}%;height:${base.focus.h / base.height * 100}%" aria-hidden="true"></span>` : ''}</div>
      <div class="ref-main"><p class="ref-title"><b>${repaint() ? (base.focus ? '聚焦重绘' : '局部重绘') : '图生图'}</b><small>${base.width}×${base.height}</small></p>
        ${slider('strength', '强度', base.strength, .01, repaint() ? 1 : .99, .01, repaint() ? '涂出来的地方重画得多彻底：1 是全部重画；低一些保留原来那块的样子，只改一点（V4 及以后）。' : '越高越不像原图：0.3 左右小修，0.7 左右重画但保留构图。')}
        ${repaint() ? '' : slider('noise', '噪声', base.noise, 0, .99, .01, '给原图加噪点，让细节多一些变化。一般 0 到 0.1。')}
        ${repaint() ? `<div class="setting-row"><span>盖回原图${help('开着时，没涂的地方一个像素都不变；关掉让 AI 整张微调，接缝更自然，但别处也可能有细微变化。')}</span><input class="switch" type="checkbox" data-ref-overlay aria-label="盖回原图" ${base.overlay === false ? '' : 'checked'}></div>` : ''}
        <div class="actions ref-actions">${btn('ref-mask', icon('paint') + (repaint() ? '改涂的地方' : '涂出要重画的地方'), 'secondary small')}${btn('ref-pad', icon('expand') + '扩图 · 裁剪', 'secondary small')}${repaint() ? btn('ref-unmask', '不涂了', 'text-button') : ''}${btn('ref-base-clear', icon('trash'), 'text-button', 'aria-label="去掉底图"')}</div></div></div>`;
  }
  function refsHTML() {
    if (!takesReference(model())) return `<p class="hint ref-note" data-keep-hint>${icon('alert')}角色参考只有 V4.5 能用（V5 还不支持）。在「参数」里把模型换成 V4.5 才会生效。</p>`;
    return (refs.length ? refs.map((r, i) => `<div class="ref-card${r.enabled === false ? ' off' : ''}"><div class="ref-thumb"><img src="${esc(r.preview)}" alt="参考 ${i + 1}"></div>
      <div class="ref-main"><div class="segmented ref-kinds" role="group" aria-label="参考什么">${KINDS.map(([k, l]) => `<button type="button" data-action="ref-kind" data-index="${i}" data-kind="${k}" aria-pressed="${r.kind === k}">${l}</button>`).join('')}</div>
        ${slider('strength', '强度', r.strength, -1, 1, .01, '参考有多大分量。太高容易连姿势、构图都照搬。负数是往反方向走，遇到特别差的参考图时有用。', i)}
        ${slider('fidelity', '保真度', r.fidelity, -1, 1, .01, '越高越贴近参考图里的细节（发型、衣服的花纹）；低一些只留大概的样子。', i)}
        <div class="actions ref-actions"><input class="switch" type="checkbox" data-ref-on data-index="${i}" aria-label="这次用参考 ${i + 1}"${r.enabled === false ? '' : ' checked'}>${btn('ref-remove', icon('trash') + '去掉', 'text-button', `data-index="${i}"`)}</div></div></div>`).join('') : '')
      + (refs.length < MAX_REFS ? `<div class="actions">${btn('ref-add', icon('add') + '加一张参考', 'secondary')}${shown() ? btn('ref-add-shown', icon('image') + '用上面这张', 'secondary') : ''}</div>` : '')
      + `<div class="actions ref-actions">${refs.length ? btn('ref-export', icon('download') + '全部打包下载', 'text-button') : ''}<label class="text-button file-button">${icon('import')}导入压缩包<input type="file" data-ref-zip accept=".zip,application/zip" aria-label="导入角色参考压缩包" hidden></label>${help('和官网的「导出全部」是同一种 zip，里面带着每张的种类、强度和保真度，两边可以互相导入。')}</div>`;
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
    const cost = [usedRefs().length && takes && `每张参考每张图多扣 ${REFERENCE_ANLAS} Anlas，用参考时不带 Vibe`, repaint() && !usedRefs().length && api.vibePlan().used.length && '局部重绘不带 Vibe，这张不会用'].filter(Boolean);
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

  /**
   * 扩图 · 裁剪: each side moves out (empty space, masked so only it is drawn) or in (cut off), by 64 at a time as NovelAI
   * draws in those steps; out on one side and in on the other shifts the picture. The size can be typed too (it moves the
   * right and bottom edges).
   */
  function padSheet() {
    const sides = {top: 0, left: 0, right: 0, bottom: 0}, names = {top: '上', left: '左', right: '右', bottom: '下'};
    const d = ctx.dialog('扩图 · 裁剪', '');
    const total = () => [base.width + sides.left + sides.right, base.height + sides.top + sides.bottom];
    const draw = () => {
      const [w, h] = total(), over = w * h > NAI_MAX_PIXELS, under = w < 64 || h < 64, same = !Object.values(sides).some(Boolean);
      d.body.innerHTML = `<div class="group pad"><div class="field"><span>尺寸</span><div class="inline-row size-custom"><input type="number" data-pad-size="width" min="64" step="64" value="${w}" aria-label="宽"><span>×</span><input type="number" data-pad-size="height" min="64" step="64" value="${h}" aria-label="高"></div></div>
        <div class="pad-sides">${Object.entries(names).map(([k, l]) => `<div class="field"><span>${l}</span><div class="pad-step">${btn('pad-less', '−', 'chip-button', `data-side="${k}" aria-label="${l}边往里"`)}<output>${sides[k] > 0 ? '+' : ''}${sides[k]}</output>${btn('pad-more', '+', 'chip-button', `data-side="${k}" aria-label="${l}边往外"`)}</div></div>`).join('')}</div>
        ${over ? '<p class="hint error-copy" data-keep-hint>太大了（最多约 2048×1536）</p>' : under ? '<p class="hint error-copy" data-keep-hint>太小了</p>' : ''}
        <div class="actions">${btn('pad-go', icon('expand') + '好了', 'primary', over || under || same ? 'disabled' : '')}</div></div>`;
    };
    draw();
    d.body.addEventListener('change', e => {
      const key = e.target.dataset?.padSize;
      if (!key) return;
      const value = Math.max(64, Math.round(Number(e.target.value) / 64) * 64) || base[key];
      if (key === 'width') { sides.left = 0; sides.right = value - base.width; } else { sides.top = 0; sides.bottom = value - base.height; }
      draw();
    });
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      try {
        if (b.dataset.action === 'pad-more') { sides[b.dataset.side] += 64; draw(); }
        else if (b.dataset.action === 'pad-less') { sides[b.dataset.side] -= 64; draw(); }
        else if (b.dataset.action === 'pad-go') {
          // New space is drawn in full; only cut, the picture stays as it was set.
          const next = await padBase(ctx.win, base, sides), grown = Object.values(sides).some(v => v > 0);
          base = {...base, ...next, focus: null, ...(grown ? {strength: 1, overlay: true} : {})};
          d.close(); rerender();
        }
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** 全部打包下载: the pictures and a metadata.json, the zip NovelAI's own 导出全部 makes. */
  async function exportRefs() {
    const names = new Set(), files = [], meta = [];
    refs.forEach((r, i) => {
      const filename = `reference_${i + 1}.png`;
      names.add(filename);
      files.push({name: filename, blob: new ctx.win.Blob([Uint8Array.from(ctx.win.atob(r.image), c => c.charCodeAt(0))], {type: 'image/png'})});
      meta.push({filename, description: REFERENCE_KINDS[r.kind] || REFERENCE_KINDS.character, fidelity: r.fidelity, strength: r.strength, information_extracted: 1, enabled: r.enabled !== false});
    });
    files.push({name: 'metadata.json', blob: new ctx.win.Blob([JSON.stringify(meta, null, 2)], {type: 'application/json'})});
    ctx.notify('已下载 ' + await saveFile(ctx.doc, await zipFiles(files), 'reference_images.zip'));
  }
  /** A zip of references, from here or from NovelAI's own 导出全部. */
  async function importRefs(file) {
    const entries = readZip(new Uint8Array(await file.arrayBuffer())), meta = entries.get('metadata.json');
    if (!meta) throw Error('压缩包里没有 metadata.json，不是导出的角色参考');
    const rows = JSON.parse(new TextDecoder().decode(await meta.bytes())), kindOf = word => Object.keys(REFERENCE_KINDS).find(k => REFERENCE_KINDS[k] === word) || 'both';
    const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(-1, n)) : fallback; };
    let added = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      const entry = entries.get(String(row?.filename));
      if (!entry || refs.length >= MAX_REFS) continue;
      const blob = new ctx.win.Blob([await entry.bytes()], {type: 'image/png'});
      refs.push({...await fitReference(ctx.win, blob), kind: kindOf(row.description), strength: num(row.strength, .6), fidelity: num(row.fidelity, .5), ...(row.enabled === false ? {enabled: false} : {})});
      added++;
    }
    rerender();
    ctx.notify(added ? `导入了 ${added} 张参考` : '压缩包里没有能用的参考');
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
          const was = repaint(), picked = await maskEditor(ctx, {src: base.preview, width: base.width, height: base.height, mask: base.mask, focus: base.focus, look: look(), onLook: maskLook => api.saveDraw({maskLook})});
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
        case 'ref-export': await exportRefs(); return true;
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
  function switched(el) { const r = refs[Number(el.dataset.index)]; if (!r) return; if (el.checked) delete r.enabled; else r.enabled = false; rerender(); }
  /** What a GPT 参考图 is, as typed (no redraw, so typing goes on). */
  function label(el) { const r = gptRefs[Number(el.dataset.index)]; if (r) r.label = el.value.slice(0, 80); }

  return {
    html, click, slide, label, overlay, switched,
    /** A zip picked in 导入压缩包. */
    async zip(file) { try { await importRefs(file); } catch (error) { ctx.notify(error.message, {error: true}); } },
    /** Uses a picture from elsewhere in the app (a result's tools). */
    useAsBase: setBase, useAsRef: addRef,
    /** What goes with the next drawing: NovelAI's base and references, or GPT's references. */
    async payload() {
      if (gpt()) return {base: null, refs: gptTakesRefs(gptModel()) ? gptRefs.map(r => ({image: r.image, type: r.type, label: r.label.trim()})) : []};
      const asked = takesReference(model()) ? usedRefs().map(r => ({image: r.image, kind: r.kind, strength: r.strength, fidelity: r.fidelity})) : [];
      if (base?.focus) { const {request, compose} = await focusedBase(ctx.win, base); return {base: request, refs: asked, focus: compose}; }
      return {base: base ? {image: base.image, width: base.width, height: base.height, strength: base.strength, noise: base.noise, overlay: base.overlay, ...(base.mask ? {mask: base.mask} : {})} : null, refs: asked};
    },
    /** For the quote: whether a base picture is set and how many references go. */
    extra() { return {base: !!base, mask: repaint(), refs: takesReference(model()) ? usedRefs().length : 0, ...(base ? {size: base.focus ? {width: 1024, height: 1024} : {width: base.width, height: base.height}} : {})}; },
    /** A short word for the tab (底图 / 参考 counts). */
    badge() { const n = gpt() ? gptRefs.length : (base ? 1 : 0) + refs.length; return n ? String(n) : ''; }
  };
}
