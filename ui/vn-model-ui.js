// 视觉小说 › 立绘 › 模型: a character's VRM or Live2D model. The card on their 立绘 page; picking a .vrm, a Live2D .zip or
// (where the browser can) a whole Live2D folder, packed into one zip here; and the preview, where it moves as on the
// stage: try each 情绪 and the mouth, choose the 取景 and nudge its size and height, and for Live2D which 表情 / 动作
// each 情绪 brings (guessed from their names until changed). The model file is kept in the tavern (host-vn.js).
import {esc, menu, size, select} from './common.js';
import {icon} from './icons.js';
import {modelLabel, MODEL_FRAMES, writeZip, live2dMap} from '../core/model-files.js';

const FEELS = [['', '平常'], ['开心', '开心'], ['生气', '生气'], ['难过', '难过'], ['惊讶', '惊讶'], ['害羞', '害羞']];
const MAPPED = [['happy', '开心'], ['angry', '生气'], ['sad', '难过'], ['surprised', '惊讶'], ['shy', '害羞']];
const SAMPLE = '你好呀，今天也要一起加油哦！嗯……真的吗？太好了！';
const LIMIT = 300 * 1024 * 1024;

/** The model's card on a character's 立绘 page. */
export function modelCard(model) {
  if (!model) return `<button type="button" class="vn-model-card empty" data-action="vn-model">${icon('person')}<span><strong>用 VRM / Live2D 模型</strong><small>视觉小说里会动、会眨眼，跟着配音对口型</small></span>${icon('add')}</button>`;
  return `<button type="button" class="vn-model-card" data-action="vn-model">${icon('person')}<span><strong>${esc(model.title || model.file)}</strong><small>${esc(modelLabel(model))} · ${esc(MODEL_FRAMES[model.frame] || '半身')}${model.size ? ' · ' + size(model.size) : ''} · 视觉小说里代替立绘</small></span>${icon('next')}</button>`;
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
async function upload(ctx, api, name, folder) {
  const file = await pick(ctx, folder);
  if (!file) return null;
  if (file.size > LIMIT) throw Error('模型文件太大了（超过 300 MB）');
  ctx.notify(`正在把模型存进酒馆（${size(file.size)}）…`);
  const model = await api.vnModel(name, file);
  ctx.notify(`${name}换上了模型：${modelLabel(model)}`);
  return model;
}

/** The card was tapped: pick a model (none yet), or preview / change / take away the one there. */
export async function modelMenu(ctx, api, name, model) {
  if (!api.vnModel) throw Error('要在酒馆里打开小手机才能设置模型');
  const folders = 'webkitdirectory' in ctx.doc.createElement('input') && !ctx.win.matchMedia?.('(pointer: coarse)').matches;
  const picks = [
    {key: 'file', icon: 'import', label: model ? '换一个模型' : '选 .vrm 或 .zip 文件', note: 'VRM 0.x / 1.0 直接选 .vrm；Live2D（Cubism 2、3、4 都行）把整个模型文件夹压成 .zip'},
    folders && {key: 'folder', icon: 'import', label: '选 Live2D 模型文件夹', note: '不用压缩，直接选有 .model3.json 或 .model.json 的那个文件夹'},
  ];
  const key = await menu(ctx, '模型 · ' + name, model ? [{key: 'preview', icon: 'play', label: '预览和调整', note: '试表情和口型，选取景、大小、高低' + (model.kind === 'live2d' ? '，每种情绪用哪个表情 / 动作' : '')}, ...picks, {key: 'remove', icon: 'trash', label: '去掉模型', note: '视觉小说里换回立绘；酒馆里的模型文件也会删掉', danger: true}] : picks);
  if (key === 'preview') return modelPreview(ctx, api, name, model);
  if (key === 'file' || key === 'folder') { const made = await upload(ctx, api, name, key === 'folder'); if (made) return modelPreview(ctx, api, name, made); return; }
  if (key === 'remove' && await ctx.confirm(`去掉${name}的模型？`, '酒馆里的模型文件也会删掉，立绘还在。')) { await api.vnModel(name, null, {remove: true}); ctx.notify('去掉了'); }
}

/** The model moving as on the stage, with its settings under it. Resolves when the sheet is closed. */
export async function modelPreview(ctx, api, name, model) {
  let m = {...model};
  const d = ctx.dialog('模型 · ' + name, `<div class="vn-model-stage" data-model-stage><p class="hint">正在读模型…</p></div>
    <div class="vn-model-feel" role="group" aria-label="试表情">${FEELS.map(([w, l], i) => `<button type="button" class="chip-button" data-feel="${esc(w)}" aria-pressed="${i === 0}">${l}</button>`).join('')}<button type="button" class="chip-button" data-model-talk>${icon('play')}试口型</button></div>
    <div class="segmented" role="group" aria-label="取景">${Object.entries(MODEL_FRAMES).map(([k, l]) => `<button type="button" data-model-frame="${k}" aria-pressed="${m.frame === k}">${l}</button>`).join('')}</div>
    <label class="vn-model-slider"><span>大小</span><input class="slider" type="range" min="60" max="200" step="5" value="${Math.round((m.zoom || 1) * 100)}" data-model-set="zoom" aria-label="大小"></label>
    <label class="vn-model-slider"><span>高低</span><input class="slider" type="range" min="-40" max="40" step="2" value="${Math.round((m.lift || 0) * 100)}" data-model-set="lift" aria-label="高低"></label>
    <div data-model-map></div>
    <p class="hint" data-keep-hint>${esc(modelLabel(m))} · ${esc(m.file)}${m.size ? ' · ' + size(m.size) : ''}。有模型时视觉小说用它演，立绘留着备用（模型读出来之前、读不出来时用）。配音播放时嘴跟着声音动，没有配音就跟着打字动。${m.kind === 'live2d' ? 'Live2D 的运行核心第一次用时从 Live2D 官网读（Cubism 2 的从 jsDelivr），要能连上。' : ''}</p>`);
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
    if (m.kind === 'live2d') paintMap();
  } catch (error) {
    stage.innerHTML = `<p class="hint" data-keep-hint>${esc(error.message)}</p>`;
  }
  /** Live2D: the 表情 kept on (its look), and which 表情 and 动作 each 情绪 brings. */
  function paintMap() {
    const info = actor.info, box = d.body.querySelector('[data-model-map]');
    if (!box || !info) return;
    const on = kept(), map = live2dMap(info, m.map, on), motions = Object.entries(info.motions || {}).flatMap(([g, n]) => Array.from({length: n}, (_, i) => [`${g}:${i}`, n > 1 ? `${g} ${i + 1}` : g]));
    box.innerHTML = `${info.expressions.length ? `<div class="group-title"><span>一直开着的表情（外观）</span></div><div class="vn-model-feel">${info.expressions.map(e => `<button type="button" class="chip-button" data-look="${esc(e)}" aria-pressed="${on.includes(e)}">${esc(e)}</button>`).join('')}</div><p class="hint">捏人模型的样子（比如「我的」）存在表情里，选上它才是你捏的样子。</p>` : ''}
      ${!info.expressions.some(e => !on.includes(e)) && !motions.length ? '<p class="hint" data-keep-hint>这个模型没有自带的情绪表情和动作：开心、生气这些用眉毛、眼睛、嘴角、脸红、歪头这些通用参数做出来。</p>' : `<div class="group-title"><span>每种情绪用哪个表情 / 动作</span></div><div class="vn-model-map">${MAPPED.map(([id, label]) => `<div class="vn-model-map-row"><b>${label}</b>${select('map-e-' + id, map[id]?.expression || '', [['', '通用表情'], ...info.expressions.filter(e => !on.includes(e)).map(e => [e, e])], `data-map="${id}" data-part="expression"`)}${select('map-m-' + id, map[id]?.motion || '', [['', '不做动作'], ...motions], `data-map="${id}" data-part="motion"`)}</div>`).join('')}</div>
      <p class="hint">按名字猜的，可以改；试表情时就用这里选的。选「通用表情」的情绪，用眉毛、眼睛、嘴角、脸红、歪头这些每个模型都有的参数做出来。</p>`}`;
  }
  async function save(change) {
    m = {...m, ...change};
    actor?.frame(change);
    try { m = await api.vnModel(name, null, change) || m; } catch (error) { ctx.notify(error.message, {error: true}); }
  }
  d.body.addEventListener('click', e => {
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
