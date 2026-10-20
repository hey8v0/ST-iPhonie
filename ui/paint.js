// 画画: drawing with a finger on a phone and a pen on a tablet or drawing pad, on the model of Procreate's phone app.
// 作品 (the works, kept in this browser) open into the canvas: tools at the top (画笔, 橡皮, 吸管, 图层, 颜色), size and
// opacity on the side with undo and redo, the picture in the middle (ui/paint/stage.js does the touching).
// Works are kept as they change (ui/paint/store.js); 存到相册 puts a flat copy in the album.
import {createView, esc, btn, help, menu, empty} from './common.js';
import {saveFile} from '../download.js';
import {allBrushes, userBrushes, saveUserBrushes, cleanBrush, BRUSHES, FIELDS, tipMask, coloredTip} from './paint/brushes.js';
import {importBrushFile} from './paint/brush-import.js';
import {createPicture, undo, redo, flatten, stampOf, taperAt, layerInfo, floodFill, lassoFill, setSelection, invertSelection, clearSelected, copySelected, startTransform, commitTransform, cancelTransform, beginAdjust, showAdjust, endAdjust} from './paint/engine.js';
import {adjusted} from './paint/adjust.js';
import {layersPanel} from './paint/layers-panel.js';
import {createStage} from './paint/stage.js';
import {paintStore} from './paint/store.js';
import {hsvToRgb, rgbToHsv, rgbToHex, hexToRgb, colorWheel} from './paint/color.js';

const SIZES = [['portrait', '竖向', 1200, 1600], ['square', '方形', 1500, 1500], ['landscape', '横向', 1600, 1200], ['phone', '手机壁纸', 1080, 1920]];
const TOOLS_KEY = 'st-iphonie-paint-tools';
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  brush: svg('<path d="M14.5 3.5l6 6-9 9c-1.2 1.2-3.3 1.4-5 .6L3 21l1.9-3.5c-.8-1.7-.6-3.8.6-5z" fill="currentColor"/>'),
  eraser: svg('<path d="M3.5 15.5 13 6l5 5-9.5 9.5H6z" fill="currentColor"/><path d="M11 21h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  pick: svg('<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L17 9l1 1-1.5 1.5-1-1L8 18H5v-3l7.5-7.5-1-1L13 5l1 1z" fill="currentColor"/>'),
  layers: svg('<path d="M12 3 2 8l10 5 10-5z" fill="currentColor"/><path d="m2 12 10 5 10-5M2 16l10 5 10-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  undo: svg('<path d="M9 7H4V2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 7A8 8 0 1 1 6 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  redo: svg('<path d="M15 7h5V2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 7A8 8 0 1 0 18 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  smudge: svg('<path d="M9 3c1.6 2.6 2.4 4.6 2.4 6a2.4 2.4 0 0 1-4.8 0C6.6 7.6 7.4 5.6 9 3z" fill="currentColor"/><path d="M11 13c2 1 3 3 2.6 5.2M14.5 11.5c2.6 1.4 4 4 3.5 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  more: svg('<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
};
const stamp = at => new Date(at).toLocaleString('zh-CN', {hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});
// The size slider runs on a curve: fine control for thin brushes, still up to 400 px.
const toSlider = px => Math.round(Math.sqrt((px - 1) / 399) * 1000);
const fromSlider = v => Math.max(1, Math.round(1 + 399 * (v / 1000) ** 2));
// A phone in the tavern is the whole screen already; 全屏 is for the floating phone on a computer or a tablet.
const PHONE_SCREEN = '(pointer: coarse) and (max-width: 540px), (max-width: 360px)';

/** 对称辅助's choices: [kind, name, note]. */
const SYMMETRY = [['', '关闭', '只画一处'], ['v', '左右对称', '沿竖直的中线对称'], ['h', '上下对称', '沿水平的中线对称'], ['quad', '四向对称', '左右和上下一起'], ['radial', '径向对称', '绕中心转六份，像万花筒']];

export function paintApp(ctx) {
  const v = createView(ctx, 'paint'), store = paintStore(ctx.win), keys = new ctx.win.AbortController();
  let mode = 'gallery', pic = null, work = null, stage = null, saving = null, saveTimer = 0, savedAt = 0, full = false;
  // The tools: which brush each of 画画 and 橡皮 uses, at what size and opacity; the colour and the ones used before.
  const tools = (() => { try { return JSON.parse(ctx.win.localStorage.getItem(TOOLS_KEY) || 'null') || {}; } catch { return {}; } })();
  tools.kind ||= 'brush'; tools.color ||= '#2b2b3a'; tools.recent ||= [];
  tools.brush ||= {id: 'ink', size: 10, opacity: 1}; tools.eraser ||= {id: 'round', size: 40, opacity: 1}; tools.smudge ||= {id: 'soft', size: 40, opacity: .6};
  tools.shape ||= 'rect'; tools.fill ||= {threshold: .12, sample: 'layer'};
  let hsv = rgbToHsv(hexToRgb(tools.color) || [0, 0, 0]);
  const keepTools = () => { try { ctx.win.localStorage.setItem(TOOLS_KEY, JSON.stringify(tools)); } catch { /* this visit only */ } };
  const brushOf = id => allBrushes(ctx.win).find(b => b.id === id) || BRUSHES[1];
  // The size and opacity on the side: the brush's, the smudge's or the eraser's (the others use the brush's).
  const current = () => tools[['eraser', 'smudge'].includes(tools.kind) ? tools.kind : 'brush'];
  const kindOf = k => ['eraser', 'smudge'].includes(k) ? k : 'brush';

  // ---------- 作品 ----------
  async function renderGallery() {
    mode = 'gallery'; v.root.dataset.mode = 'gallery';
    let works = [];
    try { works = await store.list(); } catch (error) { ctx.notify(error.message, {error: true}); }
    if (mode !== 'gallery' || v.disposed) return;
    v.draw(`<header class="page-heading"><div><span class="eyebrow">Paint</span><h1><span>画画</span></h1></div><div class="heading-actions">${btn('paint-new', '＋ 新画布', 'chip-button')}</div></header>`
      + (works.length ? `<div class="paint-works">${works.map(w => `<div class="paint-work"><button type="button" class="paint-thumb" data-work="${esc(w.id)}" aria-label="打开 ${esc(w.name)}"><img data-thumb="${esc(w.id)}" alt=""></button><span class="paint-work-name"><strong>${esc(w.name)}</strong><small>${w.width}×${w.height} · ${esc(stamp(w.updatedAt))}</small></span>${btn('work-more', I.more, 'icon-button', `data-id="${esc(w.id)}" aria-label="${esc(w.name)} 的选项"`)}</div>`).join('')}</div>`
        : empty('还没有作品', '点右上角「新画布」开始画。手机上用手指画，电脑上可以接数位板，笔的压力会让线条有粗细。', 'draw'))
      + '<p class="hint">作品存在这个浏览器里。两指捏合缩放、旋转，两指点一下撤销、三指点一下重做；按住不动取色。</p>');
    for (const img of v.root.querySelectorAll('[data-thumb]')) { const w = works.find(x => x.id === img.dataset.thumb); if (w?.thumb) img.src = ctx.win.URL.createObjectURL(w.thumb); }
  }
  function newSheet() {
    const d = ctx.dialog('新画布', `<div class="pick-list">${SIZES.map(([k, l, wd, ht]) => `<button type="button" class="list-row" data-size="${k}"><span class="paint-size-shape" style="aspect-ratio:${wd}/${ht}"></span><span><strong>${l}</strong><small>${wd} × ${ht}</small></span></button>`).join('')}</div>`);
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-size]');
      if (!b) return;
      const [, , width, height] = SIZES.find(s => s[0] === b.dataset.size);
      d.close();
      work = {id: 'w' + Date.now().toString(36), name: '作品 ' + stamp(Date.now()), createdAt: Date.now()};
      openEditor(createPicture(ctx.doc, {width, height}));
      savedAt = -1;
      save();
    });
  }
  async function openWork(id) {
    const w = await store.get(id);
    if (!w) { ctx.notify('这幅作品已经不在了'); return renderGallery(); }
    const layers = await Promise.all((w.layers || []).map(async l => ({...l, image: l.blob ? await ctx.win.createImageBitmap(l.blob).catch(() => null) : null})));
    work = {id: w.id, name: w.name, createdAt: w.createdAt || w.updatedAt};
    openEditor(createPicture(ctx.doc, {width: w.width, height: w.height, background: w.background, showBackground: w.showBackground !== false, layers: layers.length ? layers : null, active: w.active, groups: w.groups || []}));
    savedAt = pic.changed;
  }
  async function workMenu(id) {
    const works = await store.list(), w = works.find(x => x.id === id);
    if (!w) return;
    const pickd = await menu(ctx, w.name, [{key: 'rename', icon: 'edit', label: '重命名'}, {key: 'album', icon: 'image', label: '存到相册'}, {key: 'delete', icon: 'trash', label: '删除', danger: true}]);
    if (pickd === 'rename') {
      const d = ctx.dialog('作品名字', `<div class="field"><input data-field="work-name" maxlength="40" value="${esc(w.name)}"></div><div class="actions">${btn('work-name-save', '保存', 'primary')}</div>`);
      d.body.addEventListener('click', async e => { if (!e.target.closest('[data-action=work-name-save]')) return; const name = d.body.querySelector('[data-field=work-name]').value.trim() || w.name; d.close(); await store.rename(id, name); renderGallery(); });
    }
    if (pickd === 'album') { const full = await store.get(id); const layers = await Promise.all(full.layers.map(async l => ({...l, image: l.blob ? await ctx.win.createImageBitmap(l.blob) : null}))); await toAlbum(createPicture(ctx.doc, {...full, layers}), full.name); }
    if (pickd === 'delete' && await ctx.confirm('删除这幅作品？', '删掉就找不回来了（存到相册的那份还在）。')) { await store.remove(id); renderGallery(); }
  }

  // ---------- 保存 ----------
  const blobOf = canvas => new Promise(resolve => canvas.toBlob ? canvas.toBlob(b => resolve(b), 'image/png') : resolve(null));
  /** Keeps the work as it is (layers and a small picture for the list); once at a time, only when it changed. */
  function save() {
    if (!pic || !work || savedAt === pic.changed || pic.float) return saving || Promise.resolve();
    const p = pic, at = p.changed, w = work;
    saving = (saving || Promise.resolve()).then(async () => {
      const groups = (p.groups || []).map(g=>({...g}));
      const layers = await Promise.all(p.layers.map(async l => ({...layerInfo(l), blob: await blobOf(l.canvas)})));
      const flat = flatten(p), s = Math.min(1, 360 / Math.max(p.width, p.height)), t = ctx.doc.createElement('canvas');
      t.width = Math.round(p.width * s); t.height = Math.round(p.height * s);
      t.getContext('2d')?.drawImage(flat, 0, 0, t.width, t.height);
      await store.put({id: w.id, name: w.name, width: p.width, height: p.height, background: p.background, showBackground: p.showBackground, active: p.active, createdAt: w.createdAt, updatedAt: Date.now(), thumb: await blobOf(t), layers, groups});
      if (pic === p) savedAt = at;
    }).catch(error => ctx.notify('作品没存上：' + error.message, {error: true})).finally(() => { saving = null; });
    return saving;
  }
  const saveSoon = () => { ctx.win.clearTimeout(saveTimer); saveTimer = ctx.win.setTimeout(save, 1500); };
  async function toAlbum(p, name) {
    const blob = await blobOf(flatten(p));
    if (!blob) throw Error('这个浏览器做不出图片');
    await ctx.api.addPhoto({name: `${name}.png`, blob});
    ctx.notify('已存到相册');
  }

  // ---------- 画布 ----------
  function openEditor(p) {
    closeEditor();
    pic = p; mode = 'edit'; v.root.dataset.mode = 'edit';
    v.draw(`<div class="paint-edit">
      <div class="paint-top">
        ${btn('paint-gallery', '作品', 'paint-text')}${btn('paint-actions', I.more, 'paint-tool', 'aria-label="更多：选区、变形、全屏……"')}
        <span class="grow"></span>
        ${btn('tool-brush', I.brush, 'paint-tool', 'aria-label="画笔（再点一下选笔刷）"')}${btn('tool-smudge', I.smudge, 'paint-tool', 'aria-label="涂抹（再点一下选笔刷）"')}${btn('tool-eraser', I.eraser, 'paint-tool', 'aria-label="橡皮（再点一下选笔刷）"')}${btn('paint-layers', I.layers, 'paint-tool', 'aria-label="图层"')}
        <button type="button" class="paint-swatch" data-action="paint-color" aria-label="颜色（拖到画上就是油漆桶）"></button>
      </div>
      <div class="paint-stage" data-paint-stage>
        <div class="paint-side">
          <div class="paint-vslider" data-paint="size" role="slider" tabindex="0" aria-orientation="vertical" aria-label="大小" aria-valuemin="1" aria-valuemax="400"><i></i></div>
          <span class="paint-side-value" data-paint-size-value></span>
          ${btn('tool-pick', '', 'paint-pick', 'aria-label="吸管：点一下再点画上的颜色"')}
          <div class="paint-vslider" data-paint="opacity" role="slider" tabindex="0" aria-orientation="vertical" aria-label="不透明度" aria-valuemin="1" aria-valuemax="100"><i></i></div>
          ${btn('paint-undo', I.undo, 'paint-side-btn', 'aria-label="撤销"')}${btn('paint-redo', I.redo, 'paint-side-btn', 'aria-label="重做"')}
        </div>
      </div>
      <div class="paint-bar" data-paint-bar hidden></div>
    </div>`);
    stage = createStage({doc: ctx.doc, win: ctx.win, host: v.root.querySelector('[data-paint-stage]'), pic,
      tool: () => ({kind: tools.kind, brush: brushOf(current().id), size: current().size, opacity: current().opacity, color: tools.color, shape: tools.shape}),
      picked: color => setColor(color, {keep: false}),
      stroked: ({quiet = false} = {}) => { if (!quiet) saveSoon(); syncSide(); },
      filled: at => fillAt(at),
      selected: points => { if (!setSelection(pic, points)) ctx.notify('框小了一点，没选上'); stage.render(); syncBar(); },
      lassoed: (points, {erase}) => {
        if (activeLayer().locked) { ctx.notify('这个图层锁定了：在图层里左滑解锁'); return; }
        const t = current();
        if (lassoFill(pic, points, {color: tools.color, erase, opacity: t.opacity * brushOf(t.id).opacity})) { stage.render(); syncSide(); saveSoon(); }
      },
      undo: () => doUndo(), redo: () => doRedo(), locked: () => ctx.notify('这个图层锁定了：在图层里左滑解锁')});
    tipMask(ctx.doc, brushOf(tools.brush.id)).onready = () => stage?.render();
    syncTools();
  }
  function closeEditor() { if (stage) { stage.dispose(); stage = null; } }
  function syncTools() {
    for (const k of ['brush', 'smudge', 'eraser', 'pick']) v.root.querySelector(`[data-action=tool-${k}]`)?.setAttribute('aria-pressed', String(tools.kind === k));
    // 选区 and 变形 live in ⋯: it shows when one of them is in use.
    v.root.querySelector('[data-action=paint-actions]')?.setAttribute('aria-pressed', String(['select', 'transform'].includes(tools.kind)));
    const pickBtn = v.root.querySelector('.paint-pick');
    if (pickBtn) pickBtn.style.background = tools.color;
    syncBar();
    const sw = v.root.querySelector('.paint-swatch');
    if (sw) sw.style.background = tools.color;
    syncSide();
  }
  function syncSide() {
    const t = current(), off = !['brush', 'eraser', 'smudge'].includes(tools.kind), lasso = !off && tools.kind !== 'smudge' && !!brushOf(t.id).lasso;
    for (const el of v.root.querySelectorAll('.paint-vslider')) {
      const size = el.dataset.paint === 'size';
      el.style.setProperty('--v', String(size ? toSlider(t.size) / 1000 : t.opacity));
      el.setAttribute('aria-valuenow', String(size ? t.size : Math.round(t.opacity * 100)));
      // 柳叶笔 has no size: what is drawn round is filled.
      el.setAttribute('aria-disabled', String(off || (size && lasso)));
    }
    const val = v.root.querySelector('[data-paint-size-value]');
    if (val) val.textContent = off || lasso ? '' : String(t.size);
    for (const [a, can] of [['paint-undo', pic?.history.length], ['paint-redo', pic?.future.length]]) { const b = v.root.querySelector(`[data-action=${a}]`); if (b) b.disabled = !can; }
  }
  function setColor(color, {keep = true} = {}) {
    tools.color = color; hsv = rgbToHsv(hexToRgb(color), hsv.h);
    if (keep) { tools.recent = [color, ...tools.recent.filter(c => c !== color)].slice(0, 12); }
    keepTools(); syncTools();
  }
  function doUndo() {
    if (!pic || stage?.busy) return;
    // While something is lifted, undo puts it back as it was.
    if (pic.float) { cancelTransform(pic); tools.kind = 'brush'; syncTools(); stage.render(); return; }
    if (undo(pic)) { stage.render(); syncSide(); saveSoon(); }
  }
  function doRedo() { if (pic && !stage?.busy && !pic.float && redo(pic)) { stage.render(); syncSide(); saveSoon(); } }
  async function leaveEditor() { if (pic?.float) commitTransform(pic); setFull(false); closeEditor(); await save(); pic = null; work = null; renderGallery(); }
  // ---------- 全屏 ----------
  function canFull() { let float = false; try { float = !!ctx.api.panelFloating?.(); } catch { /* outside the tavern */ } return float || !ctx.win.matchMedia?.(PHONE_SCREEN).matches; }
  /** The picture fills the whole window (the tavern's too), without the phone around it; again to go back. */
  function setFull(on) {
    if (full === !!on) return;
    full = !!on;
    stage?.fitOnResize();
    try { ctx.api.panelFull?.(full); } catch { /* outside the tavern: this page only */ }
    ctx.doc.documentElement.toggleAttribute('data-paint-full', full);
  }

  // ---------- 工具 ----------
  /** Changes the tool; leaving 变形 puts what was lifted down. */
  function useTool(kind) {
    if (tools.kind === 'transform' && kind !== 'transform' && pic?.float) { commitTransform(pic); saveSoon(); }
    if (kind === 'transform' && !pic.float) {
      if (!startTransform(pic)) { ctx.notify(activeLayer().locked ? '这个图层锁定了' : '这个图层上还没有东西可以变形'); return; }
    }
    tools.kind = kind; keepTools(); syncTools(); stage?.render();
  }
  const activeLayer = () => pic.layers.find(l => l.id === pic.active);
  /** 油漆桶 at a picture point, with the colour in use. */
  function fillAt(at) {
    if (!at) return;
    if (activeLayer().locked) { ctx.notify('这个图层锁定了'); return; }
    if (floodFill(pic, at.x, at.y, tools.color, {threshold: tools.fill.threshold, sample: tools.fill.sample, opacity: tools.brush.opacity})) { stage.render(); syncSide(); saveSoon(); }
  }
  /** The bar under the picture: for 选区 (box or freehand, invert, copy, clear, deselect) and 变形 (flip, done). */
  function syncBar() {
    const bar = v.root.querySelector('[data-paint-bar]');
    if (!bar) return;
    const sel = !!pic?.selection;
    if (tools.kind === 'select') {
      bar.innerHTML = `<div class="segmented paint-shape">${[['rect', '矩形'], ['lasso', '手绘']].map(([k, l]) => `<button type="button" data-shape="${k}" aria-pressed="${tools.shape === k}">${l}</button>`).join('')}</div>`
        + btn('sel-invert', '反选', 'chip-button', sel ? '' : 'disabled') + btn('sel-copy', '拷贝成新图层', 'chip-button', sel ? '' : 'disabled') + btn('sel-clear', '清除内容', 'chip-button', sel ? '' : 'disabled') + btn('sel-none', '取消选择', 'chip-button', sel ? '' : 'disabled') + btn('sel-done', '完成', 'primary');
      bar.hidden = false; return;
    }
    if (tools.kind === 'transform' && pic?.float) {
      bar.innerHTML = btn('tf-flip-x', '水平翻转', 'chip-button') + btn('tf-flip-y', '垂直翻转', 'chip-button') + btn('tf-reset', '复原', 'chip-button') + btn('tf-cancel', '取消', 'chip-button') + btn('tf-done', '完成', 'primary');
      bar.hidden = false; return;
    }
    // A selection made earlier still holds the strokes in it: the way out stays in sight with any tool.
    if (sel && !pic.float) { bar.innerHTML = btn('sel-none', '取消选择', 'primary') + btn('sel-invert', '反选', 'chip-button'); bar.hidden = false; return; }
    bar.hidden = true; bar.innerHTML = '';
  }

  /**
   * 全屏 on: a sheet opens as a small window by the button that opened it, as on Procreate, instead of across the
   * whole screen. wide: room for two columns (the brush library).
   */
  function popover(anchor, wide = false) {
    if (!full || !anchor?.isConnected) return;
    const overlay = [...ctx.doc.querySelectorAll('.overlay')].at(-1), sheet = overlay?.querySelector('.sheet');
    if (!sheet) return;
    const box = overlay.getBoundingClientRect(), r = anchor.getBoundingClientRect(), width = Math.min(wide ? 460 : 340, box.width - 16), top = Math.round(r.bottom - box.top + 8);
    overlay.classList.add('pop');
    Object.assign(sheet.style, {width: width + 'px', left: Math.round(Math.min(Math.max(8, r.left - box.left + r.width / 2 - width / 2), box.width - width - 8)) + 'px', top: top + 'px', maxHeight: Math.max(200, box.height - top - 12) + 'px'});
  }
  const toolButton = kind => v.root.querySelector(`[data-action=tool-${kind}]`);
  // ---------- 颜色 ----------
  function colorSheet() {
    const was = tools.color;
    const d = ctx.dialog('颜色', `<div class="paint-color">
      <canvas class="paint-wheel" width="240" height="240" data-wheel></canvas>
      <div class="paint-color-row"><span class="paint-chip" data-was style="background:${esc(was)}" title="原来的"></span><span class="paint-chip" data-now title="现在的"></span><input class="paint-hex" data-field="hex" maxlength="7" spellcheck="false" aria-label="颜色代码"></div>
      <div class="paint-recent" data-recent></div>
      <div class="paint-fill-set"><div class="field"><div class="meter-label"><span>油漆桶的阈值${help('把右上角的颜色圆点拖到画上，就用这个颜色填满那一块（油漆桶）；电脑上也可以按 G 再点。\n\n阈值越大，颜色差得越多也算同一块。\n\n参照：只看正在画的这个图层，或者看整幅画（有「参考」图层时只看参考图层，适合线稿和上色分层）。')}</span><output data-fill-out>${Math.round(tools.fill.threshold * 100)}%</output></div><input class="slider" type="range" min="0" max="60" value="${Math.round(tools.fill.threshold * 100)}" data-fill-threshold></div>
        <div class="segmented" style="margin:0">${[['layer', '参照这个图层'], ['all', '参照整幅画']].map(([k, l]) => `<button type="button" data-fill-sample="${k}" aria-pressed="${tools.fill.sample === k}">${l}</button>`).join('')}</div></div></div>`);
    popover(v.root.querySelector('.paint-swatch'));
    const c = d.body.querySelector('[data-wheel]'), ratio = Math.min(2, ctx.win.devicePixelRatio || 1);
    c.width = c.height = 240 * ratio; c.style.width = c.style.height = '240px';
    c.getContext('2d')?.scale(ratio, ratio);
    const wheel = colorWheel(c, 240);
    const paint = () => {
      const hex = rgbToHex(hsvToRgb(hsv));
      wheel.draw(hsv);
      d.body.querySelector('[data-now]').style.background = hex;
      const box = d.body.querySelector('[data-field=hex]'); if (ctx.doc.activeElement !== box) box.value = hex;
      d.body.querySelector('[data-recent]').innerHTML = tools.recent.map(x => `<button type="button" class="paint-chip" data-recent-color="${esc(x)}" style="background:${esc(x)}" aria-label="${esc(x)}"></button>`).join('');
    };
    const apply = () => { tools.color = rgbToHex(hsvToRgb(hsv)); keepTools(); syncTools(); paint(); };
    let from = '';
    const at = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * 240 / r.width, (e.clientY - r.top) * 240 / r.height]; };
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', e => { const got = wheel.pick(...at(e)); if (!got) return; from = got.part; try { c.setPointerCapture(e.pointerId); } catch { /* fine */ } hsv = {...hsv, ...got}; delete hsv.part; apply(); });
    c.addEventListener('pointermove', e => { if (!from) return; const got = wheel.pick(...at(e), from); if (got) { hsv = {...hsv, ...got}; delete hsv.part; apply(); } });
    c.addEventListener('pointerup', () => { from = ''; });
    d.body.addEventListener('input', e => { if (e.target.matches('[data-fill-threshold]')) { tools.fill.threshold = Number(e.target.value) / 100; d.body.querySelector('[data-fill-out]').textContent = e.target.value + '%'; keepTools(); } });
    d.body.addEventListener('click', e => { const b = e.target.closest('[data-fill-sample]'); if (!b) return; tools.fill.sample = b.dataset.fillSample; keepTools(); for (const x of d.body.querySelectorAll('[data-fill-sample]')) x.setAttribute('aria-pressed', String(x === b)); });
    d.body.addEventListener('change', e => { if (e.target.dataset.field === 'hex') { const rgb = hexToRgb(e.target.value); if (rgb) { hsv = rgbToHsv(rgb, hsv.h); apply(); } else e.target.value = tools.color; } });
    d.body.addEventListener('click', e => {
      const r = e.target.closest('[data-recent-color]'); if (r) { hsv = rgbToHsv(hexToRgb(r.dataset.recentColor), hsv.h); apply(); }
      if (e.target.closest('[data-was]')) { hsv = rgbToHsv(hexToRgb(was), hsv.h); apply(); }
    });
    d.onClose(() => { if (tools.color !== was) setColor(tools.color); });
    paint();
  }

  // ---------- 笔刷 ----------
  function preview(canvasEl, brush) {
    const g = canvasEl.getContext('2d'), w = canvasEl.width, h = canvasEl.height;
    if (!g) return;
    const draw = () => {
      g.clearRect(0, 0, w, h);
      if (brush.lasso) {
        g.fillStyle = ctx.win.getComputedStyle(v.root).getPropertyValue('--ink').trim() || '#222'; g.globalAlpha = brush.opacity;
        g.beginPath(); g.moveTo(14, h * .62); g.bezierCurveTo(w * .3, -h * .15, w * .7, h * .05, w - 14, h * .38); g.bezierCurveTo(w * .7, h * 1.15, w * .3, h * .95, 14, h * .62); g.fill();
        g.globalAlpha = 1; return;
      }
      const tip = coloredTip(ctx.doc, brush, ctx.win.getComputedStyle(v.root).getPropertyValue('--ink').trim() || '#222'), size = Math.min(h * .7, Math.max(4, brush.size * .5));
      for (let i = 0; i <= 120; i++) {
        const t = i / 120, x = 12 + t * (w - 24), y = h / 2 + Math.sin(t * Math.PI * 2) * h * .22, p = Math.sin(t * Math.PI);
        const st = stampOf(brush, size, p), sz = st.size * taperAt(brush, size, t * (w - 24), w - 24);
        g.globalAlpha = Math.min(1, st.alpha * 2.2) * brush.opacity; g.drawImage(tip, x - sz / 2, y - sz / 2, sz, sz);
      }
      g.globalAlpha = 1;
    };
    const mask = tipMask(ctx.doc, brush);
    if (mask.ready) draw(); else mask.onready = draw;
  }
  function brushSheet(kind) {
    const d = ctx.dialog(kind === 'eraser' ? '橡皮用的笔刷' : kind === 'smudge' ? '涂抹用的笔刷' : '笔刷库', '');
    // Groups down the left, the chosen group's brushes on the right, as on Procreate. 柳叶笔 fills, so it cannot smudge.
    let group = brushOf(tools[kindOf(kind)].id).group;
    const paint = () => {
      const list = allBrushes(ctx.win).filter(b => kind !== 'smudge' || !b.lasso), mine = tools[kindOf(kind)].id, groups = [...new Set(list.map(b => b.group))];
      const builtGroups = new Set(BRUSHES.map(b => b.group));
      if (!groups.includes(group)) group = groups[0];
      d.body.innerHTML = `<div class="pb-lib"><nav class="pb-groups">${groups.map(gname => `<button type="button" data-brush-group="${esc(gname)}" aria-pressed="${gname === group}">${esc(gname)}</button>`).join('')}
        <label class="pb-import file-button">＋ 导入<input type="file" data-brush-file aria-label="导入笔刷：Procreate、Photoshop 的笔刷或一张图片"></label></nav>
        <div class="pb-list">${builtGroups.has(group) ? '' : `<div class="actions">${btn('brush-group-delete', '删除这组', 'chip-button', `data-group="${esc(group)}"`)}</div>`}<div class="pick-list">${list.filter(b => b.group === group).map(b => `<div class="list-row paint-brush-row${b.id === mine ? ' on' : ''}"><button type="button" class="paint-brush-pick" data-brush="${esc(b.id)}"><strong>${esc(b.name)}</strong><canvas width="220" height="44" data-brush-preview="${esc(b.id)}"></canvas></button></div>`).join('')}</div></div></div>`;
      for (const c of d.body.querySelectorAll('[data-brush-preview]')) preview(c, list.find(b => b.id === c.dataset.brushPreview));
    };
    popover(toolButton(kind), true);
    d.body.addEventListener('click', e => { const gb = e.target.closest('[data-brush-group]'); if (gb) { group = gb.dataset.brushGroup; paint(); } });
    paint();
    d.body.addEventListener('click', e => {
      // Tap a brush to use it; tap the one in use again for its settings (as on Procreate).
      const b = e.target.closest('[data-brush]');
      if (b && b.dataset.brush === tools[kindOf(kind)].id && tools.kind === kind) { d.close(); studio(b.dataset.brush, kind); return; }
      if (b) { const brush = brushOf(b.dataset.brush), t = tools[kindOf(kind)]; t.id = brush.id; t.size = Math.round(brush.size); t.opacity = kind === 'smudge' ? .6 : 1; tools.kind = kind; keepTools(); tipMask(ctx.doc, brush).onready = () => stage?.render(); d.close(); syncTools(); return; }
      const group = e.target.closest('[data-action=brush-group-delete]')?.dataset.group;
      if (group) ctx.win.Promise.resolve(ctx.confirm(`删除「${group}」这组笔刷？`, '画好的画不受影响。')).then(ok => {
        if (!ok) return brushSheet(kind);
        const gone = new Set(userBrushes(ctx.win).filter(b => b.group === group).map(b => b.id));
        saveUserBrushes(ctx.win, userBrushes(ctx.win).filter(b => !gone.has(b.id)));
        for (const t of [tools.brush, tools.eraser, tools.smudge]) if (gone.has(t.id)) t.id = 'round';
        keepTools(); brushSheet(kind);
      });
    });
    d.body.addEventListener('change', async e => {
      const file = e.target.closest('[data-brush-file]')?.files?.[0];
      if (!file) return;
      e.target.value = '';
      try {
        ctx.notify('正在读笔刷……');
        const brushes = await importBrushFile(ctx.doc, ctx.win, file);
        if (!saveUserBrushes(ctx.win, [...userBrushes(ctx.win), ...brushes])) throw Error('这个浏览器存不下这么多笔刷了，先删掉一些导入的');
        ctx.notify(brushes.length > 1 ? `导入了 ${brushes.length} 支笔刷（「${brushes[0].group}」）` : `导入了笔刷「${brushes[0].name}」`);
        group = brushes[0].group; paint();
      } catch (error) { ctx.notify('没导入：' + error.message, {error: true}); }
    });
  }
  /** 笔刷工作室: every setting of a brush, with a stroke to try it on; built-in ones can go back to how they were. */
  function studio(id, kind) {
    const base = brushOf(id), built = BRUSHES.find(b => b.id === id);
    let b = {taper: 0, ...base};
    const d = ctx.dialog(`调整「${base.name}」`, `<canvas class="paint-studio-preview" width="300" height="70" data-studio-preview></canvas>
      <div class="field"><span>名字</span><input data-studio="name" maxlength="30" value="${esc(b.name)}"></div>
      ${FIELDS.filter(([k]) => !base.lasso || k === 'opacity').map(([k, label, min, max, step]) => `<div class="field"><div class="meter-label"><span>${label}</span><output data-out="${k}">${k === 'size' ? Math.round(b[k]) : Math.round(b[k] * 100) + '%'}</output></div><input class="slider" type="range" data-studio="${k}" min="${min}" max="${max}" step="${step}" value="${b[k]}"></div>`).join('')}
      <div class="actions">${built ? btn('studio-reset', '恢复默认', 'secondary') : btn('studio-delete', '删除这个笔刷', 'danger')}${btn('studio-save', '保存', 'primary')}</div>`);
    const show = () => preview(d.body.querySelector('[data-studio-preview]'), b);
    show();
    popover(toolButton(kind), true);
    d.body.addEventListener('input', e => {
      const k = e.target.dataset.studio;
      if (!k) return;
      if (k === 'name') { b.name = e.target.value; return; }
      b[k] = Number(e.target.value);
      d.body.querySelector(`[data-out="${k}"]`).textContent = k === 'size' ? String(Math.round(b[k])) : Math.round(b[k] * 100) + '%';
      show();
    });
    d.body.addEventListener('click', async e => {
      const a = e.target.closest('[data-action]')?.dataset.action;
      const others = userBrushes(ctx.win).filter(x => x.id !== id);
      if (a === 'studio-save') { saveUserBrushes(ctx.win, [...others, cleanBrush(b)]); d.close(); ctx.notify('笔刷已保存'); brushSheet(kind); }
      if (a === 'studio-reset') { saveUserBrushes(ctx.win, others); d.close(); ctx.notify('已恢复默认'); brushSheet(kind); }
      if (a === 'studio-delete' && await ctx.confirm('删除这个笔刷？', '画好的画不受影响。')) { saveUserBrushes(ctx.win, others); for (const t of [tools.brush, tools.eraser, tools.smudge]) if (t.id === id) t.id = 'round'; keepTools(); brushSheet(kind); }
    });
  }

  // ---------- 图层 ----------
  function layerSheet() {
    layersPanel({ctx, pic, color: () => tools.color, changed: ({quiet = false} = {}) => { stage.render(); if (!quiet) { syncSide(); saveSoon(); } }});
    popover(v.root.querySelector('[data-action=paint-layers]'));
  }

  // ---------- 调整 ----------
  /** The layer in use, its colours and blur changed with sliders and seen on the picture as they move; 应用 keeps it (undoable). */
  function adjustSheet() {
    const a = beginAdjust(pic);
    if (!a) { ctx.notify(pic.float ? '先放下正在变形的东西' : '这个图层锁定了'); return; }
    const values = {hue: 0, saturation: 100, brightness: 100, blur: 0};
    const rows = [['hue', '色相', -180, 180, '°'], ['saturation', '饱和度', 0, 200, '%'], ['brightness', '亮度', 0, 200, '%'], ['blur', '模糊', 0, 40, 'px']];
    // Small, so the picture above it shows what the sliders do.
    const d = ctx.dialog('调整 · 当前图层', `<div class="adjust-panel">${rows.map(([k, label, min, max, unit]) => `<label class="adjust-row"><span>${label}</span><input class="slider" type="range" min="${min}" max="${max}" step="1" value="${values[k]}" data-adjust="${k}" aria-label="${label}"><output data-adjust-out="${k}">${values[k]}${unit}</output></label>`).join('')}</div>
      <div class="actions adjust-actions">${btn('adjust-reset', '复原', 'secondary')}${btn('adjust-apply', '应用', 'primary')}</div>`);
    let kept = false, frame = 0;
    const show = () => { frame = 0; showAdjust(pic, a, adjusted(ctx.doc, a.copy, {hue: values.hue, saturation: values.saturation / 100, brightness: values.brightness / 100, blur: values.blur})); stage.render(); };
    d.body.addEventListener('input', e => {
      const k = e.target.dataset.adjust;
      if (!k) return;
      values[k] = Number(e.target.value);
      d.body.querySelector(`[data-adjust-out="${k}"]`).textContent = values[k] + rows.find(r => r[0] === k)[4];
      if (!frame) frame = ctx.win.requestAnimationFrame(show);
    });
    d.body.addEventListener('click', e => {
      if (e.target.closest('[data-action=adjust-reset]')) {
        Object.assign(values, {hue: 0, saturation: 100, brightness: 100, blur: 0});
        for (const el of d.body.querySelectorAll('[data-adjust]')) { el.value = values[el.dataset.adjust]; d.body.querySelector(`[data-adjust-out="${el.dataset.adjust}"]`).textContent = values[el.dataset.adjust] + rows.find(r => r[0] === el.dataset.adjust)[4]; }
        show();
      }
      if (e.target.closest('[data-action=adjust-apply]')) { if (frame) { ctx.win.cancelAnimationFrame(frame); show(); } kept = endAdjust(pic, a, true); d.close(); stage.render(); syncSide(); saveSoon(); ctx.notify('调整好了，可以撤销'); }
    });
    d.onClose(() => { if (frame) ctx.win.cancelAnimationFrame(frame); if (!kept) { endAdjust(pic, a, false); stage.render(); } });
  }
  // ---------- 对称辅助 ----------
  async function symmetryMenu() {
    const now = pic.symmetry?.kind || '';
    const picked = await menu(ctx, '对称辅助', SYMMETRY.map(([k, label, note]) => ({key: k || 'off', icon: k === now ? 'check' : 'swap', label, note})));
    if (picked == null) return;
    const kind = picked === 'off' ? '' : picked;
    pic.symmetry = kind ? {kind, n: 6} : null;
    stage.render();
    if (kind) ctx.notify(`${SYMMETRY.find(([k]) => k === kind)[1]}：虚线是对称轴`);
  }

  async function actions() {
    const asked = menu(ctx, work?.name || '作品', [
      {key: 'select', icon: 'eye', label: tools.kind === 'select' ? '退出选区' : '选区', note: '框选或手绘一块，之后只在里面画'},
      {key: 'transform', icon: 'swap', label: tools.kind === 'transform' ? '放下（完成变形）' : '变形', note: '移动、缩放、旋转、翻转选区里的东西或整个图层'},
      canFull() && {key: 'full', icon: 'float', label: full ? '退出全屏' : '全屏', note: full ? '回到小手机里' : '画布铺满整个窗口'},
      {key: 'adjust', icon: 'sliders', label: '调整', note: '当前图层的色相、饱和度、亮度和模糊'},
      {key: 'symmetry', icon: 'swap', label: '对称辅助', note: SYMMETRY.find(([k]) => k === (pic.symmetry?.kind || ''))[1] + '：画一笔，对称的地方也画上'},
      {key: 'album', icon: 'image', label: '存到相册', note: '把所有图层合成一张放进相册'},
      {key: 'download', icon: 'download', label: '下载 PNG'},
      {key: 'fit', icon: 'next', label: '适应屏幕', note: '回到整张画都看得见的样子'},
      {key: 'flip', icon: 'swap', label: stage.flipped ? '翻转回来' : '左右翻转画面', note: '只是换个方向看，检查画歪了没有；画本身不变'},
      {key: 'rename', icon: 'edit', label: '重命名'}]);
    popover(v.root.querySelector('[data-action=paint-actions]'));
    const a = await asked;
    try {
      if (a === 'select') useTool(tools.kind === 'select' ? 'brush' : 'select');
      if (a === 'transform') { if (tools.kind === 'transform') { commitTransform(pic); saveSoon(); useTool('brush'); } else useTool('transform'); }
      if (a === 'full') setFull(!full);
      if (a === 'album') await toAlbum(pic, work.name);
      if (a === 'download') { const blob = await blobOf(flatten(pic)); if (blob) ctx.notify('已下载 ' + await saveFile(ctx.doc, blob, work.name)); }
      if (a === 'adjust') adjustSheet();
      if (a === 'symmetry') await symmetryMenu();
      if (a === 'fit') stage.fit();
      if (a === 'flip') { stage.flip(); ctx.notify(stage.flipped ? '画面左右翻转了（画本身没变）' : '翻转回来了'); }
      if (a === 'rename') {
        const d = ctx.dialog('作品名字', `<div class="field"><input data-field="work-name" maxlength="40" value="${esc(work.name)}"></div><div class="actions">${btn('work-name-save', '保存', 'primary')}</div>`);
        d.body.addEventListener('click', e => { if (!e.target.closest('[data-action=work-name-save]')) return; work.name = d.body.querySelector('[data-field=work-name]').value.trim() || work.name; d.close(); pic.changed++; save(); });
      }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  }

  // ---------- 点按 ----------
  v.on('click', '[data-action]', async el => {
    switch (el.dataset.action) {
      case 'paint-new': newSheet(); break;
      case 'work-more': await workMenu(el.dataset.id); break;
      case 'paint-gallery': await leaveEditor(); break;
      case 'paint-actions': await actions(); break;
      case 'tool-brush': case 'tool-smudge': case 'tool-eraser': {
        const kind = el.dataset.action.slice(5);
        if (tools.kind === kind) brushSheet(kind); else useTool(kind);
        break;
      }
      case 'tool-pick': useTool(tools.kind === 'pick' ? 'brush' : 'pick'); break;
      case 'sel-invert': invertSelection(pic); stage.render(); break;
      case 'sel-copy': if (copySelected(pic)) { stage.render(); syncSide(); saveSoon(); ctx.notify('拷贝成了新图层'); } break;
      case 'sel-clear': if (clearSelected(pic)) { stage.render(); syncSide(); saveSoon(); } else ctx.notify('这个图层锁定了'); break;
      case 'sel-none': setSelection(pic, null); stage.render(); syncBar(); break;
      case 'sel-done': useTool('brush'); break;
      case 'tf-flip-x': case 'tf-flip-y': { const t = pic.float.t; pic.float.t = el.dataset.action === 'tf-flip-x' ? {...t, sx: -t.sx} : {...t, sy: -t.sy}; stage.render(); break; }
      case 'tf-reset': { const b = pic.float.box; pic.float.t = {cx: b[0] + b[2] / 2, cy: b[1] + b[3] / 2, sx: 1, sy: 1, angle: 0}; stage.render(); break; }
      case 'tf-cancel': cancelTransform(pic); useTool('brush'); break;
      case 'tf-done': commitTransform(pic); saveSoon(); useTool('brush'); break;
      case 'paint-layers': layerSheet(); break;
      case 'paint-color': colorSheet(); break;
      case 'paint-undo': doUndo(); break;
      case 'paint-redo': doRedo(); break;
    }
  });
  v.on('click', '[data-work]', el => openWork(el.dataset.work));
  v.on('click', '[data-shape]', el => { tools.shape = el.dataset.shape; keepTools(); syncBar(); });
  // 油漆桶 as on Procreate: the colour dot dragged onto the picture fills where it is let go.
  let drop = null, dropped = 0;
  v.root.addEventListener('click', e => { if (Date.now() - dropped < 400 && e.target.closest('.paint-swatch')) { e.stopPropagation(); e.preventDefault(); } }, true);
  v.root.addEventListener('pointerdown', e => {
    const sw = e.target.closest('.paint-swatch');
    if (!sw || mode !== 'edit') return;
    drop = {id: e.pointerId, x: e.clientX, y: e.clientY, dot: null};
    try { sw.setPointerCapture(e.pointerId); } catch { /* fine */ }
  });
  v.root.addEventListener('pointermove', e => {
    if (!drop || e.pointerId !== drop.id) return;
    if (!drop.dot && Math.hypot(e.clientX - drop.x, e.clientY - drop.y) < 12) return;
    if (!drop.dot) { drop.dot = ctx.doc.createElement('span'); drop.dot.className = 'paint-drop'; drop.dot.style.background = tools.color; v.root.querySelector('.paint-edit').append(drop.dot); }
    const r = v.root.getBoundingClientRect();
    drop.dot.style.transform = `translate(${e.clientX - r.left - 16}px, ${e.clientY - r.top - 16}px)`;
  });
  const letGo = e => {
    if (!drop || e.pointerId !== drop.id) return;
    const d = drop;
    drop = null;
    if (!d.dot) return;
    d.dot.remove();
    // A drag is not a tap: no colour sheet after it (only that click on the dot, if one comes at once).
    dropped = Date.now();
    if (e.type === 'pointerup') fillAt(stage?.pictureAt(e.clientX, e.clientY));
  };
  v.root.addEventListener('pointerup', letGo);
  v.root.addEventListener('pointercancel', letGo);
  // The side sliders, drawn here (a native range turned upright stays sideways in some WebViews): dragged like
  // Procreate's, from where they are (a touch does not jump them), up for more.
  const setSlider = (kind, f) => {
    const t = current(), x = Math.min(1, Math.max(0, f));
    if (kind === 'size') t.size = fromSlider(Math.round(x * 1000)); else t.opacity = Math.max(.01, Math.round(x * 100) / 100);
    syncSide();
    // The brush's real size and strength, shown on the picture while it changes.
    stage?.preview({size: t.size, opacity: t.opacity * (brushOf(t.id)?.opacity ?? 1), color: tools.kind === 'eraser' ? '#ffffff' : tools.color});
  };
  const sliderAt = kind => kind === 'size' ? toSlider(current().size) / 1000 : current().opacity;
  let sliding = null;
  v.root.addEventListener('pointerdown', e => {
    const el = e.target.closest('.paint-vslider');
    if (!el || el.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault();
    sliding = {id: e.pointerId, kind: el.dataset.paint, y: e.clientY, from: sliderAt(el.dataset.paint), h: el.getBoundingClientRect().height || 120};
    try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    el.dataset.active = '';
  });
  v.root.addEventListener('pointermove', e => { if (sliding?.id === e.pointerId) setSlider(sliding.kind, sliding.from + (sliding.y - e.clientY) / sliding.h); });
  const slid = e => { if (sliding?.id !== e.pointerId) return; sliding = null; for (const el of v.root.querySelectorAll('.paint-vslider[data-active]')) delete el.dataset.active; keepTools(); };
  v.root.addEventListener('pointerup', slid);
  v.root.addEventListener('pointercancel', slid);
  v.root.addEventListener('keydown', e => {
    const el = e.target.closest?.('.paint-vslider'), step = {ArrowUp: .02, ArrowRight: .02, ArrowDown: -.02, ArrowLeft: -.02}[e.key];
    if (!el || !step || el.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault(); setSlider(el.dataset.paint, sliderAt(el.dataset.paint) + step); keepTools();
  });
  // Keys while drawing on a computer: undo and redo, the tools, the size, space to move the picture.
  ctx.doc.addEventListener('keydown', e => {
    if (mode !== 'edit' || !stage || ctx.visible?.('paint') === false || e.target.closest?.('input, textarea, select, [contenteditable], .sheet')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if (mod && k === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod) return;
    if (k === ' ') { e.preventDefault(); stage.space(true); return; }
    const t = current();
    if (k === '[' || k === ']') { t.size = Math.max(1, Math.min(400, Math.round(t.size * (k === ']' ? 1.15 : 1 / 1.15)) + (k === ']' ? 1 : 0))); keepTools(); syncSide(); return; }
    if (k === 'enter' && pic?.float) { commitTransform(pic); saveSoon(); useTool('brush'); return; }
    const kind = {b: 'brush', s: 'smudge', e: 'eraser', i: 'pick', g: 'fill', l: 'select', v: 'transform'}[k];
    if (kind) useTool(kind);
  }, {signal: keys.signal});
  ctx.doc.addEventListener('keyup', e => { if (e.key === ' ') stage?.space(false); }, {signal: keys.signal});

  // Esc and the phone's back step out of 全屏, 变形 and 选区 first, then out of the picture.
  v.back = () => {
    if (mode !== 'edit') return false;
    if (full) setFull(false);
    else if (pic?.float) { cancelTransform(pic); useTool('brush'); }
    else if (pic?.selection) { setSelection(pic, null); stage.render(); syncBar(); }
    else leaveEditor();
    return true;
  };
  v.leave = () => { setFull(false); if (mode === 'edit') { if (pic?.float) { commitTransform(pic); useTool('brush'); } save(); } };
  v.refresh = () => { if (mode === 'gallery') renderGallery(); };
  const dispose = v.dispose;
  v.dispose = () => { setFull(false); keys.abort(); ctx.win.clearTimeout(saveTimer); save(); closeEditor(); store.close(); dispose(); };
  renderGallery();
  return v;
}
