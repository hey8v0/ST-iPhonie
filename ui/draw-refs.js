// The 参考图 tab of the drawing app. NovelAI: a base picture — 图生图 (draw over it, as strongly as asked) or, with an
// area painted, 局部重绘 (draw only that again) — and 角色参考 (NovelAI's Precise Reference: the same character, style
// or both in a new picture, plus outfit references in V5). GPT: up to 16 pictures, known by their order (图 1, 图 2 …),
// each with what it is in the user's words. Kept for this visit of the app; the pictures go with the next drawing.
import {esc, btn, help} from './common.js';
import {icon} from './icons.js';
import {saveFile, zipFiles} from '../download.js';
import {isV5, takesReference, referenceTitle, referenceCaption, REFERENCE_ANLAS, REFERENCE_KINDS, MAX_REFERENCES, NAI_MAX_PIXELS} from '../core/novelai.js';
import {readZip} from '../core/model-files.js';
import {GPT_MAX_REFS, gptTakesRefs} from '../core/image-engines.js';
import {fitBase, fitReference, fitGptReference, pickPicture, maskEditor, focusedBase, padBase} from './draw-images.js';

const KINDS = [['character', '角色'], ['style', '画风'], ['both', '角色+画风']];
const MAX_REFS = MAX_REFERENCES;
const slider = (key, label, value, min, max, step, note = '', index = -1) => `<div class="field"><div class="meter-label"><span>${label}${note ? help(note) : ''}</span><output>${Number(value).toFixed(2)}</output></div><input class="slider" type="range" data-ref-slider="${key}"${index >= 0 ? ` data-index="${index}"` : ''} min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"></div>`;

export function refPanel({ctx, api, rerender, shown}) {
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
  const usedRefs = () => takesReference(model(), {mask: repaint()})
    ? refs.filter(r => r.enabled !== false && (isV5(model()) || r.kind !== 'outfit')) : [];
  const baseTools = () => ctx.paintBase ? `<div class="actions ref-base-tools">${btn('ref-paint-base', icon('paint') + '画布', 'secondary')}${btn('ref-pose', icon('person') + '3D 摆姿', 'secondary')}</div>` : '';
  function baseHTML() {
    if (!base) return `<div class="ref-empty"><div class="actions">${btn('ref-base-pick', icon('import') + '选一张', 'secondary')}${shown() ? btn('ref-base-shown', icon('image') + '用上面这张', 'secondary') : ''}</div></div>` + baseTools();
    return `<div class="ref-card ref-base-card"><div class="ref-card-head"><div class="ref-thumb" style="aspect-ratio:${base.width}/${base.height};width:${Math.min(56, 80 * base.width / base.height)}px"><img src="${esc(base.preview)}" alt="底图">${base.mask ? `<span class="ref-mask" style="background:${esc(look().color)};-webkit-mask-image:url(data:image/png;base64,${base.mask});mask-image:url(data:image/png;base64,${base.mask})" aria-hidden="true"></span>` : ''}${base.focus ? `<span class="ref-focus" style="left:${base.focus.x / base.width * 100}%;top:${base.focus.y / base.height * 100}%;width:${base.focus.w / base.width * 100}%;height:${base.focus.h / base.height * 100}%" aria-hidden="true"></span>` : ''}</div>
      <p class="ref-title"><b>${repaint() ? (base.focus ? '聚焦重绘' : '局部重绘') : '图生图'}</b><small>${base.width}×${base.height}</small></p>
      ${btn('ref-base-clear', icon('trash'), 'ref-remove', 'aria-label="去掉底图"')}</div>
      <div class="ref-main">
        ${slider('strength', '强度', base.strength, .01, repaint() ? 1 : .99, .01, repaint() ? '涂出来的地方重画得多彻底：1 是全部重画；低一些保留原来那块的样子，只改一点（V4 及以后）。' : '越高越不像原图：0.3 左右小修，0.7 左右重画但保留构图。')}
        ${repaint() ? '' : slider('noise', '噪声', base.noise, 0, .99, .01, '给原图加噪点，让细节多一些变化。一般 0 到 0.1。')}
        ${repaint() && !base.focus ? `<div class="setting-row"><span>盖回原图${help('开着时，没涂的地方一个像素都不变；关掉让 AI 整张微调，接缝更自然，但别处也可能有细微变化。')}</span><input class="switch" type="checkbox" data-ref-overlay aria-label="盖回原图" ${base.overlay === false ? '' : 'checked'}></div>` : ''}
        <div class="actions ref-actions">${btn('ref-mask', icon('paint') + (repaint() ? '改涂的地方' : '涂出要重画的地方'), 'secondary small')}${btn('ref-pad', icon('expand') + '扩图 · 裁剪', 'secondary small')}${repaint() ? btn('ref-unmask', '不涂了', 'text-button') : ''}</div></div></div>` + baseTools();
  }
  function refsHTML() {
    if (!takesReference(model())) return `<p class="hint ref-note" data-keep-hint>${icon('alert')}参考图支持 V4.5 和 V5，可在「参数」里切换模型。</p>`;
    const v5 = isV5(model()), kinds = v5 ? [...KINDS, ['outfit', '服装']] : KINDS;
    return (refs.length ? refs.map((r, i) => `<div class="ref-card ref-director${r.enabled === false ? ' off' : ''}">
      <div class="ref-card-head"><div class="ref-thumb"><img src="${esc(r.preview)}" alt=""></div>
        <div class="ref-director-caption"><b>参考图 ${i + 1}</b><label><span>本次启用</span><input class="switch" type="checkbox" data-ref-on data-index="${i}" aria-label="本次启用参考图 ${i + 1}"${r.enabled === false ? '' : ' checked'}></label></div>
        ${btn('ref-remove', icon('trash'), 'ref-remove', `data-index="${i}" aria-label="移除参考图 ${i + 1}"`)}
      </div>
      <div class="ref-main"><div class="segmented ref-kinds${v5 ? ' ref-kinds-v5' : ''}" role="group" aria-label="参考什么">${kinds.map(([k, l]) => `<button type="button" data-action="ref-kind" data-index="${i}" data-kind="${k}" aria-pressed="${r.kind === k}">${l}</button>`).join('')}</div>
        ${v5 ? slider('strengthV5', '强度', r.strengthV5, 0, 5, .05, '越高越接近参考图。', i)
          : r.kind === 'outfit' ? '<p class="hint ref-note">服装参考只在 V5 生效。</p>'
          : slider('strength', '强度', r.strength, -1, 1, .01, '越高越贴近参考图，负数往反方向调整。', i)
            + slider('fidelity', '保真度', r.fidelity, -1, 1, .01, '越高越贴近参考图里的细节。', i)}
        ${v5 && (r.kind === 'character' || r.kind === 'both') ? `<label class="ref-outfit"><span>保留参考图穿搭</span><input class="switch" type="checkbox" data-ref-same-outfit data-index="${i}"${r.sameOutfit ? ' checked' : ''}></label>` : ''}
      </div></div>`).join('') : '')
      + (refs.length < MAX_REFS ? `<div class="actions">${btn('ref-add', icon('add') + '加一张参考', 'secondary')}${shown() ? btn('ref-add-shown', icon('image') + '用上面这张', 'secondary') : ''}</div>` : '')
      + `<div class="ref-zip"><div class="ref-zip-label">参考图压缩包 ${help('压缩包保存每张图、参考类型和当前模型的参考设置。也可以导入 NovelAI 官网导出的包。')}</div><div class="ref-zip-actions"><label class="secondary file-button">${icon('upload')}导入<input type="file" data-ref-zip accept=".zip,application/zip" aria-label="导入${referenceTitle(model())}压缩包"></label>${refs.length ? btn('ref-export', icon('download') + '导出全部', 'secondary') : ''}</div></div>`;
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
    const v5 = isV5(model()), takes = takesReference(model()), count = usedRefs().length;
    const paused = v5 && repaint() ? 'V5 局部重绘时不使用精准参考。' : '';
    const cost = [count && `${count} 张参考，每张出图额外 ${count * REFERENCE_ANLAS} Anlas${v5 ? '' : '，用参考时不带 Vibe'}`, repaint() && !count && api.vibePlan().used.length && '局部重绘不带 Vibe，这张不会用'].filter(Boolean);
    return fold('ref-base', 'image', '底图', '图生图 · 局部重绘', base ? (repaint() ? (base.focus ? '聚焦重绘' : '局部重绘') : '图生图') : '没有', !!base,
        `<p class="hint ref-about" data-keep-hint>从一张图、手绘草稿或 3D 姿势开始，也可以涂出要重画的范围。</p>${baseHTML()}`)
      + fold('ref-refs', 'person', referenceTitle(model()), v5 ? 'NovelAI · V5' : 'NovelAI · V4.5', paused ? '暂不使用' : !takes ? '当前不可用' : count ? `${count} 张启用` : '没有启用', refs.length > 0,
        `<p class="hint ref-about" data-keep-hint>${paused || `${v5 ? '选择参考角色、画风或服装' : '选择参考角色、画风，或同时参考两者'}。每张参考图会为每张出图加收 ${REFERENCE_ANLAS} Anlas。`}</p>${refsHTML()}`)
      + (cost.length ? `<p class="hint ref-cost" data-keep-hint>${icon('alert')}${cost.map(esc).join('；')}。</p>` : '');
  }

  /** The shown result as a Blob (for 用上面这张). */
  async function shownBlob() { const r = shown(); if (!r) return null; const photo = await api.getPhoto(r.photoId); return photo?.blob || null; }
  async function setBase(blob, area) {
    if (!blob) return;
    const fitted = await fitBase(ctx.win, blob, area);
    base = {...fitted, strength: .7, noise: base?.noise ?? 0, mask: '', focus: null, overlay: true};
    rerender();
  }
  async function paintBase(usePose) {
    const {width, height} = base || api.getState().draw.params;
    const picture = base ? new ctx.win.Blob([Uint8Array.from(ctx.win.atob(base.image), c => c.charCodeAt(0))], {type: 'image/png'}) : null;
    const paint = pose => ctx.paintBase({base: picture, pose, width, height}, blob => setBase(blob, width * height));
    if (usePose) {
      const {poseSheet} = await import('./draw-pose.js');
      await poseSheet(ctx, {width, height, base: picture, use: paint});
    } else paint(null);
  }
  async function addRef(blob) {
    if (!blob || refs.length >= MAX_REFS) return;
    const r = {blob, kind: 'character', strength: .6, strengthV5: 1, fidelity: .5};
    r.preview = (await fittedRef(r, isV5(model()))).preview;
    if (refs.length < MAX_REFS) refs.push(r);
    rerender();
  }
  function fittedRef(ref, v5) {
    const key = v5 ? 'v5' : 'v45';
    return ref[key] ??= fitReference(ctx.win, ref.blob, {v5}).catch(error => { delete ref[key]; throw error; });
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
    const files = [], meta = [], modelV5 = isV5(model());
    for (const [i, r] of [...refs].entries()) {
      const filename = `reference_${i + 1}.png`;
      const v5 = modelV5 || r.kind === 'outfit', {image} = await fittedRef(r, v5);
      files.push({name: filename, blob: new ctx.win.Blob([Uint8Array.from(ctx.win.atob(image), c => c.charCodeAt(0))], {type: 'image/png'})});
      meta.push({filename, description: referenceCaption(r, v5), fidelity: v5 ? 1 : r.fidelity, strength: v5 ? r.strengthV5 : r.strength, information_extracted: 1, enabled: r.enabled !== false,
        strengthV5: r.strengthV5, strengthV45: r.strength, fidelityV45: r.fidelity, sameOutfit: !!r.sameOutfit});
    }
    files.push({name: 'metadata.json', blob: new ctx.win.Blob([JSON.stringify(meta, null, 2)], {type: 'application/json'})});
    ctx.notify('已下载 ' + await saveFile(ctx.doc, await zipFiles(files), 'reference_images.zip'));
  }
  /** A zip of references, from here or from NovelAI's own 导出全部. */
  async function importRefs(file) {
    const entries = readZip(new Uint8Array(await file.arrayBuffer())), meta = entries.get('metadata.json');
    if (!meta) throw Error('压缩包里没有参考图的 metadata.json');
    const rows = JSON.parse(new TextDecoder().decode(await meta.bytes()));
    const num = (v, fallback, min = -1, max = 1) => v != null && Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
    const v5 = isV5(model());
    let added = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      const entry = entries.get(String(row?.filename));
      if (!entry || refs.length >= MAX_REFS) continue;
      const caption = row.description;
      const kind = caption === 'character_mainoutfit' ? 'character' : caption === 'character&style_anyoutfit' ? 'both'
        : Object.keys(REFERENCE_KINDS).find(k => REFERENCE_KINDS[k] === caption) || 'both';
      const r = {blob: new ctx.win.Blob([await entry.bytes()], {type: 'image/png'}), kind, enabled: row.enabled !== false,
        sameOutfit: row.sameOutfit ?? (caption === 'character_mainoutfit' || caption === 'character&style'),
        strength: num(row.strengthV45 ?? row.strength, .6), fidelity: num(row.fidelityV45 ?? row.fidelity, .5), strengthV5: num(row.strengthV5 ?? row.strength, 1, 0, 5)};
      r.preview = (await fittedRef(r, v5)).preview;
      if (refs.length >= MAX_REFS) break;
      refs.push(r);
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
        case 'ref-paint-base': await paintBase(false); return true;
        case 'ref-pose': await paintBase(true); return true;
        case 'ref-unmask': base.mask = ''; base.focus = null; base.strength = .7; rerender(); return true;
        case 'ref-mask': {
          const was = repaint(), picked = await maskEditor(ctx, {src: base.preview, width: base.width, height: base.height, mask: base.mask, focus: base.focus, look: look(), onLook: maskLook => api.saveDraw({maskLook})});
          // The first painting draws that area again fully (as NovelAI's own 局部重绘 starts); a strength set after stays.
          if (picked && base) { base.mask = picked.mask; base.focus = picked.focus; if (!was && repaint()) base.strength = 1; if (was && !repaint()) base.strength = .7; rerender(); }
          return true;
        }
        case 'ref-pad': padSheet(); return true;
        case 'ref-add': if (gpt()) await addGptRefs(await pickPicture(ctx, api, '选参考图', {multiple: GPT_MAX_REFS - gptRefs.length})); else await addRef(await pickPicture(ctx, api, '选一张参考图')); return true;
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
  function switched(el) { const r = refs[Number(el.dataset.index)]; if (!r) return; if (el.hasAttribute('data-ref-same-outfit')) r.sameOutfit = el.checked; else r.enabled = el.checked; rerender(); }
  /** What a GPT 参考图 is, as typed (no redraw, so typing goes on). */
  function label(el) { const r = gptRefs[Number(el.dataset.index)]; if (r) r.label = el.value.slice(0, 80); }

  return {
    html, click, slide, label, overlay, switched,
    snapshot() {
      const {preview, ...picture} = base || {};
      return {base: base && picture, refs: refs.map(({v5, v45, ...ref}) => ref), gptRefs};
    },
    restore(saved) {
      if (!saved) return;
      if (saved.base?.image) base = {...saved.base, preview: `data:image/png;base64,${saved.base.image}`};
      refs.splice(0, refs.length, ...(saved.refs || []).filter(r => r.blob && r.preview).slice(0, MAX_REFS));
      gptRefs.splice(0, gptRefs.length, ...(saved.gptRefs || []).slice(0, GPT_MAX_REFS));
    },
    /** A zip picked in 导入压缩包. */
    async zip(file) { try { await importRefs(file); } catch (error) { ctx.notify(error.message, {error: true}); } },
    /** Uses a picture from elsewhere in the app (a result's tools). */
    useAsBase: setBase, useAsRef: addRef,
    /** A picture opened from the story (GPT): the 参考图 of the people in it, in their order, named; a file gone is left out. */
    async useRoleRefs(list) {
      const wanted = (list || []).filter(r => r?.path), seen = new Set();
      if (!wanted.length) return;
      gptRefs.length = 0;
      for (const r of wanted) {
        if (seen.has(r.path) || gptRefs.length >= GPT_MAX_REFS) continue;
        seen.add(r.path);
        try { const response = await ctx.win.fetch(r.path, {cache: 'no-store'}); if (response.ok) gptRefs.push({...await fitGptReference(ctx.win, await response.blob()), label: String(r.name || '').slice(0, 80)}); }
        catch { /* gone: left out */ }
      }
      rerender();
    },
    /** What goes with the next drawing: NovelAI's base and references, or GPT's references. */
    async payload() {
      if (gpt()) return {base: null, refs: gptTakesRefs(gptModel()) ? gptRefs.map(r => ({image: r.image, type: r.type, label: r.label.trim()})) : []};
      const v5 = isV5(model());
      const asked = await Promise.all(usedRefs().map(async r => ({image: (await fittedRef(r, v5)).image, kind: r.kind, strength: v5 ? r.strengthV5 : r.strength, fidelity: r.fidelity, sameOutfit: r.sameOutfit})));
      if (base?.focus) { const {request, compose} = await focusedBase(ctx.win, base); return {base: request, refs: asked, focus: compose}; }
      return {base: base ? {image: base.image, width: base.width, height: base.height, strength: base.strength, noise: base.noise, overlay: base.overlay, ...(base.mask ? {mask: base.mask} : {})} : null, refs: asked};
    },
    /** For the quote: whether a base picture is set and how many references go. */
    extra() { return {base: !!base, mask: repaint(), refs: usedRefs().length, ...(base ? {size: base.focus ? {width: 1024, height: 1024} : {width: base.width, height: base.height}} : {})}; },
    /** A short word for the tab (底图 / 参考 counts). */
    badge() { const n = gpt() ? gptRefs.length : (base ? 1 : 0) + refs.length; return n ? String(n) : ''; }
  };
}
