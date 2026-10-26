// 视觉小说 › 立绘 › 模型: a character's VRM or Live2D model. The card on their 立绘 page; picking a .vrm, a Live2D .zip or
// (where the browser can) a whole Live2D folder, packed into one zip here; and the preview, where it moves as on the
// stage: try each 情绪 and the mouth, choose the 取景 and nudge its size and height, and for Live2D which 表情 / 动作
// each 情绪 brings (guessed from their names until changed). The model file is kept in the tavern (host-vn.js).
import {esc, menu, size, select, help} from './common.js';
import {icon} from './icons.js';
import {modelLabel, MODEL_FRAMES, MODEL_LIMIT, writeZip, live2dMap} from '../core/model-files.js';
import {MOVES} from '../core/model-moves.js';

const FEELS = [['', '平常'], ['开心', '开心'], ['生气', '生气'], ['难过', '难过'], ['惊讶', '惊讶'], ['害羞', '害羞']];
const MAPPED = [['happy', '开心'], ['angry', '生气'], ['sad', '难过'], ['surprised', '惊讶'], ['shy', '害羞']];
const SAMPLE = '你好呀，今天也要一起加油哦！嗯……真的吗？太好了！';
const LIMIT = 300 * 1024 * 1024;

/** The models' card on a character's 立绘 page: the one in use (or the 立绘), and how many are kept. c: from vnCast. */
export function modelCard(c) {
  const models = c?.models || [], m = c?.model || null, more = models.length > 1 ? ` · 存了 ${models.length} 个` : '';
  if (!models.length) return `<button type="button" class="vn-model-card empty" data-action="vn-model">${icon('person')}<span><strong>用 VRM / Live2D 模型</strong><small>视觉小说里会动、会眨眼，跟着配音对口型</small></span>${icon('add')}</button>`;
  if (!m) return `<button type="button" class="vn-model-card empty" data-action="vn-model">${icon('person')}<span><strong>现在用立绘</strong><small>存了 ${models.length} 个模型，点开换上</small></span>${icon('next')}</button>`;
  return `<button type="button" class="vn-model-card" data-action="vn-model">${icon('person')}<span><strong>${esc(m.title || m.file)}</strong><small>${esc(modelLabel(m))} · ${esc(MODEL_FRAMES[m.frame] || '半身')}${m.size ? ' · ' + size(m.size) : ''}${more}</small></span>${icon('next')}</button>`;
}

/** A .vrm / .zip, or a folder packed into a zip; null when nothing was picked. */
function pick(ctx, folder) {
  return new Promise((resolve, reject) => {
    const input = ctx.doc.createElement('input');
    input.type = 'file';
    if (folder) input.webkitdirectory = true; else input.accept = '.vrm,.zip,application/zip';
    input.addEventListener('change', async () => {
      try {
        const list = [...(input.files || [])];
        if (!list.length) return resolve(null);
        if (!folder) return resolve(list[0]);
        const total = list.reduce((n, f) => n + f.size, 0);
        if (total > LIMIT) throw Error('这个文件夹太大了（超过 300 MB），请只选模型自己的文件夹');
        const files = await Promise.all(list.map(async f => ({path: f.webkitRelativePath || f.name, bytes: new Uint8Array(await f.arrayBuffer())})));
        const zip = writeZip(files), root = (list[0].webkitRelativePath || '').split('/')[0] || 'live2d';
        resolve(new File([zip], root + '.zip', {type: 'application/zip'}));
      } catch (error) { reject(error); }
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
const folderPick = ctx => 'webkitdirectory' in ctx.doc.createElement('input') && !ctx.win.matchMedia?.('(pointer: coarse)').matches;
/** A new model joins the character's and is put on: a file, or (on a computer) a Live2D folder. null: nothing picked. */
async function addModel(ctx, api, name) {
  let folder = false;
  if (folderPick(ctx)) {
    const key = await menu(ctx, '添加模型 · ' + name, [
      {key: 'file', icon: 'import', label: '选 .vrm 或 .zip 文件', note: 'VRM 0.x / 1.0 直接选 .vrm；Live2D（Cubism 2、3、4 都行）把整个模型文件夹压成 .zip'},
      {key: 'folder', icon: 'import', label: '选 Live2D 模型文件夹', note: '不用压缩，直接选有 .model3.json 或 .model.json 的那个文件夹'}]);
    if (!key) return null;
    folder = key === 'folder';
  }
  const file = await pick(ctx, folder);
  if (!file) return null;
  if (file.size > LIMIT) throw Error('模型文件太大了（超过 300 MB）');
  ctx.notify(`正在把模型存进酒馆（${size(file.size)}）…`);
  const model = await api.vnModel(name, file);
  ctx.notify(`${name}换上了模型：${modelLabel(model)}`);
  return model;
}

/**
 * The card was tapped: with no model yet, add one; else every model kept (the one in use ticked), the 立绘, and 添加模型.
 * A model: put it on, preview and adjust it, or delete it. c: the character, from vnCast.
 */
export async function modelMenu(ctx, api, name, c) {
  if (!api.vnModel) throw Error('要在酒馆里打开小手机才能设置模型');
  const models = c?.models || [], use = c?.useModel || '';
  if (!models.length) { const made = await addModel(ctx, api, name); if (made) return modelPreview(ctx, api, name, made); return; }
  const key = await menu(ctx, '模型 · ' + name, [
    ...models.map(m => ({key: 'm:' + m.id, icon: m.id === use ? 'check' : 'person', label: m.title || m.file, note: `${modelLabel(m)} · ${MODEL_FRAMES[m.frame] || '半身'}${m.size ? ' · ' + size(m.size) : ''}${m.id === use ? ' · 正在用' : ''}`})),
    {key: 'sprite', icon: use ? 'image' : 'check', label: '不用模型，用立绘', note: use ? '模型都留着，随时换回来' : '正在用'},
    models.length < MODEL_LIMIT && {key: 'add', icon: 'add', label: '添加模型', note: `还能存 ${MODEL_LIMIT - models.length} 个，VRM 和 Live2D 都行`}]);
  if (key === 'sprite') { if (use) { await api.vnModel(name, null, {use: ''}); ctx.notify(`${name}换回立绘了`); } return; }
  if (key === 'add') { const made = await addModel(ctx, api, name); if (made) return modelPreview(ctx, api, name, made); return; }
  const m = key && models.find(x => 'm:' + x.id === key);
  if (!m) return;
  const act = await menu(ctx, m.title || m.file, [
    m.id !== use && {key: 'use', icon: 'check', label: '用这个', note: '视觉小说里用它演'},
    {key: 'preview', icon: 'play', label: '预览和调整', note: '试表情和口型，选取景、大小、高低' + (m.kind === 'live2d' ? '，每种情绪用哪个表情 / 动作' : '')},
    {key: 'remove', icon: 'trash', label: '删掉这个模型', note: '酒馆里的这个模型文件也会删掉', danger: true}]);
  if (act === 'use') { await api.vnModel(name, null, {use: m.id}); ctx.notify(`${name}换上了「${m.title || m.file}」`); }
  else if (act === 'preview') return modelPreview(ctx, api, name, m);
  else if (act === 'remove' && await ctx.confirm(`删掉「${m.title || m.file}」？`, '酒馆里的这个模型文件也会删掉；' + (m.id === use ? (models.length > 1 ? '换成存着的下一个模型。' : '换回立绘。') : '正在用的不受影响。'))) { await api.vnModel(name, null, {id: m.id, remove: true}); ctx.notify('删掉了'); }
}

/** The model moving as on the stage, with its settings under it. Resolves when the sheet is closed. */
export async function modelPreview(ctx, api, name, model) {
  let m = {...model};
  const d = ctx.dialog('模型 · ' + name, `<div class="vn-model-stage" data-model-stage><p class="hint">正在读模型…</p></div>
    <div class="vn-model-feel" role="group" aria-label="试表情">${FEELS.map(([w, l], i) => `<button type="button" class="chip-button" data-feel="${esc(w)}" aria-pressed="${i === 0}">${l}</button>`).join('')}<button type="button" class="chip-button" data-model-talk>${icon('play')}试口型</button></div>
    <div class="segmented" role="group" aria-label="取景">${Object.entries(MODEL_FRAMES).map(([k, l]) => `<button type="button" data-model-frame="${k}" aria-pressed="${m.frame === k}">${l}</button>`).join('')}</div>
    <label class="vn-model-slider"><span>大小</span><input class="slider" type="range" min="60" max="200" step="5" value="${Math.round((m.zoom || 1) * 100)}" data-model-set="zoom" aria-label="大小"></label>
    <label class="vn-model-slider"><span>高低</span><input class="slider" type="range" min="-40" max="40" step="2" value="${Math.round((m.lift || 0) * 100)}" data-model-set="lift" aria-label="高低"></label>
    <div data-model-moves></div>
    <div data-model-map></div>
    <p class="hint">${esc(modelLabel(m))} · ${esc(m.file)}${m.size ? ' · ' + size(m.size) : ''}。有模型时视觉小说用它演，立绘留着备用（模型读出来之前、读不出来时用）。配音播放时嘴跟着声音动，没有配音就跟着打字动。${m.kind === 'live2d' ? 'Live2D 的运行核心第一次用时从 Live2D 官网读（Cubism 2 的从 jsDelivr），要能连上。' : ''}</p>`);
  const stage = d.body.querySelector('[data-model-stage]');
  let actor = null, raf = 0, last = 0, talk = 0, closed = false;
  const done = new Promise(resolve => d.onClose(() => { closed = true; ctx.win.cancelAnimationFrame(raf); actor?.dispose(); resolve(); }));
  const frame = now => {
    raf = 0;
    if (closed || !actor) return;
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0;
    last = now;
    if (talk) {
      const t = (now - talk) / 1000, chars = [...SAMPLE], ch = chars[Math.floor(t / .1)];
      if (!ch) { talk = 0; actor.mouth(null); } else actor.mouth(mouthOf(ch, t));
    }
    actor.tick(dt, true);
    raf = ctx.win.requestAnimationFrame(frame);
  };
  /**
   * 动作: try each built-in one; for VRM the user's motion files (shared by every VRM character: add, name, words,
   * delete); for Live2D the model's own motions, each with the words that bring it on in the story.
   */
  const BUILT_IN = MOVES.map(x => `${x.label}（${x.words.filter(w => /[\u4e00-\u9fff]/.test(w)).slice(0, 4).join('、')}）`).join('；');
  function paintMoves() {
    const box = d.body.querySelector('[data-model-moves]');
    if (!box || !actor) return;
    const files = m.kind === 'vrm' ? api.getState().vn.moves || [] : [], acts = m.acts || {};
    const motions = m.kind === 'live2d' ? Object.entries(actor.info.motions || {}).flatMap(([g, n]) => Array.from({length: n}, (_, i) => [`${g}:${i}`, n > 1 ? `${g} ${i + 1}` : g])) : [];
    box.innerHTML = `<div class="group-title"><span>动作${help('正文里台词前后写到这些词，模型就做这个动作（离台词最近的那个）：' + BUILT_IN + '。立绘里加过的同名动作（比如「抱臂」），它的触发词也算。' + (m.kind === 'vrm' ? '\n还能加自己的动作文件（.vrma，VRoid Hub 等处下载，或用动作捕捉录），所有 VRM 角色都能用。' : '\nLive2D 的手臂动作看模型本身：有手臂参数的会摆手臂，模型自带的动作可以在下面写上触发词。'))}</span></div>
      <div class="vn-model-feel" role="group" aria-label="试动作">${MOVES.map(x => `<button type="button" class="chip-button" data-move="${x.id}">${esc(x.label)}</button>`).join('')}${files.map(f => `<button type="button" class="chip-button" data-move="${esc(f.id)}" data-path="${esc(f.path)}">${icon('play')}${esc(f.label)}</button>`).join('')}</div>
      ${m.kind === 'vrm' ? `${files.length ? `<div class="vn-move-files">${files.map(f => `<div class="vn-move-row" data-file="${esc(f.id)}"><input data-move-label value="${esc(f.label)}" aria-label="名字" maxlength="20"><input data-move-words value="${esc(f.words.join('、'))}" placeholder="触发词，用顿号隔开" aria-label="触发词"><button type="button" class="icon-button" data-move-drop aria-label="删掉这个动作文件">${icon('trash')}</button></div>`).join('')}</div>` : ''}
        <div class="actions"><button type="button" class="secondary" data-move-add>${icon('import')}添加动作文件（.vrma）</button></div>` : ''}
      ${motions.length ? `<div class="vn-move-files">${motions.map(([k, label]) => `<div class="vn-move-row" data-motion="${esc(k)}"><button type="button" class="chip-button" data-move-motion="${esc(k)}">${icon('play')}${esc(label)}</button><input data-act-words value="${esc((acts[k] || []).join('、'))}" placeholder="触发词，用顿号隔开" aria-label="${esc(label)} 的触发词"></div>`).join('')}</div>` : ''}`;
  }
  async function addMoveFile() {
    const input = ctx.doc.createElement('input');
    input.type = 'file'; input.accept = '.vrma';
    const file = await new Promise(resolve => { input.addEventListener('change', () => resolve(input.files?.[0] || null)); input.addEventListener('cancel', () => resolve(null)); input.click(); });
    if (!file) return;
    try { await api.vnMoveFile(file); ctx.notify('加好了：在下面写上触发词，正文写到它就做'); } catch (error) { ctx.notify(error.message, {error: true}); }
    paintMoves();
  }
  /** The Live2D 表情 kept on the whole time (its look): set, else guessed. */
  const kept = () => Array.isArray(m.keep) ? m.keep : actor?.info?.keep || [];
  let mouthOf = () => null;
  try {
    const [{createModelActor, modelBytes}, {typedMouth}] = await Promise.all([import('../vn-model.js'), import('../core/model-files.js')]);
    mouthOf = typedMouth;
    const made = await createModelActor({...m}, await modelBytes(m.path));
    if (closed) { made.dispose(); return done; }
    actor = made;
    stage.replaceChildren(actor.canvas);
    raf = ctx.win.requestAnimationFrame(frame);
    paintMoves();
    if (m.kind === 'live2d') paintMap();
  } catch (error) {
    stage.innerHTML = `<p class="hint" data-keep-hint>${esc(error.message)}</p>`;
  }
  /** Live2D: the 表情 kept on (its look), and which 表情 and 动作 each 情绪 brings. */
  function paintMap() {
    const info = actor.info, box = d.body.querySelector('[data-model-map]');
    if (!box || !info) return;
    const on = kept(), map = live2dMap(info, m.map, on), motions = Object.entries(info.motions || {}).flatMap(([g, n]) => Array.from({length: n}, (_, i) => [`${g}:${i}`, n > 1 ? `${g} ${i + 1}` : g]));
    box.innerHTML = `${info.expressions.length ? `<div class="group-title"><span>一直开着的表情（外观）${help('捏人模型的样子（比如 VTube Studio 的「我的」）存在表情里，选上它才是你捏的样子。插件会先猜一个，不对就在这里改。')}</span></div><div class="vn-model-feel">${info.expressions.map(e => `<button type="button" class="chip-button" data-look="${esc(e)}" aria-pressed="${on.includes(e)}">${esc(e)}</button>`).join('')}</div>` : ''}
      ${!info.expressions.some(e => !on.includes(e)) && !motions.length ? '<p class="hint">这个模型没有自带的情绪表情和动作：开心、生气这些用眉毛、眼睛、嘴角、脸红、歪头这些通用参数做出来。</p>' : `<div class="group-title"><span>每种情绪用哪个表情 / 动作</span></div><div class="vn-model-map">${MAPPED.map(([id, label]) => `<div class="vn-model-map-row"><b>${label}</b>${select('map-e-' + id, map[id]?.expression || '', [['', '通用表情'], ...info.expressions.filter(e => !on.includes(e)).map(e => [e, e])], `data-map="${id}" data-part="expression"`)}${select('map-m-' + id, map[id]?.motion || '', [['', '不做动作'], ...motions], `data-map="${id}" data-part="motion"`)}</div>`).join('')}</div>
      <p class="hint">按名字猜的，可以改；试表情时就用这里选的。选「通用表情」的情绪，用眉毛、眼睛、嘴角、脸红、歪头这些每个模型都有的参数做出来。</p>`}`;
  }
  async function save(change) {
    m = {...m, ...change};
    actor?.frame(change);
    try { m = await api.vnModel(name, null, {id: m.id, ...change}) || m; } catch (error) { ctx.notify(error.message, {error: true}); }
  }
  d.body.addEventListener('click', e => {
    const mv = e.target.closest('[data-move], [data-move-motion], [data-move-add], [data-move-drop]');
    if (mv && actor) {
      if (mv.dataset.moveMotion) actor.act({id: 'motion', motion: mv.dataset.moveMotion});
      else if (mv.hasAttribute('data-move-add')) addMoveFile();
      else if (mv.hasAttribute('data-move-drop')) { const id = mv.closest('[data-file]').dataset.file; ctx.confirm('删掉这个动作文件？', '酒馆里的文件也会删掉，所有 VRM 角色都不再用它。').then(ok => ok && api.vnMoveFile(null, {id, remove: true}).then(paintMoves)).catch(error => ctx.notify(error.message, {error: true})); }
      else actor.act(mv.dataset.path ? {id: mv.dataset.move, path: mv.dataset.path} : {id: mv.dataset.move})?.catch?.(error => ctx.notify(error.message, {error: true}));
      return;
    }
    const look = e.target.closest('[data-look]');
    if (look && actor) { const n = look.dataset.look, list = kept().includes(n) ? kept().filter(x => x !== n) : [...kept(), n]; save({keep: list}); paintMap(); return; }
    const b = e.target.closest('[data-feel], [data-model-talk], [data-model-frame]');
    if (!b || !actor && !b.dataset.modelFrame) return;
    if (b.dataset.feel != null) { for (const x of d.body.querySelectorAll('[data-feel]')) x.setAttribute('aria-pressed', String(x === b)); actor.feel(b.dataset.feel); }
    else if (b.hasAttribute('data-model-talk')) talk = ctx.win.performance.now();
    else { for (const x of d.body.querySelectorAll('[data-model-frame]')) x.setAttribute('aria-pressed', String(x === b)); save({frame: b.dataset.modelFrame}); }
  });
  d.body.addEventListener('input', e => {
    const k = e.target.dataset.modelSet;
    if (k) actor?.frame(k === 'zoom' ? {zoom: e.target.value / 100} : {lift: e.target.value / 100});
  });
  d.body.addEventListener('change', e => {
    const line = e.target.closest('[data-file], [data-motion]');
    if (line && (e.target.matches('[data-move-label], [data-move-words]'))) { api.vnMoveFile(null, {id: line.dataset.file, ...(e.target.matches('[data-move-label]') ? {label: e.target.value} : {words: e.target.value})}).catch(error => ctx.notify(error.message, {error: true})); return; }
    if (line && e.target.matches('[data-act-words]')) { const acts = {...(m.acts || {})}; acts[line.dataset.motion] = e.target.value.split(/[,，、;；]/).map(w => w.trim()).filter(Boolean); if (!acts[line.dataset.motion].length) delete acts[line.dataset.motion]; save({acts}); return; }
    const k = e.target.dataset.modelSet;
    if (k) { save(k === 'zoom' ? {zoom: e.target.value / 100} : {lift: e.target.value / 100}); return; }
    const id = e.target.dataset.map;
    if (!id || !actor) return;
    const now = live2dMap(actor.info, m.map, kept()), row = {expression: now[id]?.expression || '', motion: now[id]?.motion || '', [e.target.dataset.part]: e.target.value};
    save({map: {...m.map, [id]: row}});
    const pressed = d.body.querySelector('[data-feel][aria-pressed=true]');
    if (pressed?.dataset.feel === MAPPED.find(x => x[0] === id)?.[1]) { actor.feel(''); actor.feel(pressed.dataset.feel); }
  });
  return done;
}
