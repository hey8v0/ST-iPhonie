// 视觉小说: the workbench of the galgame view of the story. 开演 opens the stage over the tavern page (from the latest
// reply, from the start, or from a message picked here); 视觉小说模式 puts a 📖 button on every message to start from
// there. 立绘: each character of the open card gets a standing picture, drawn with the drawing engine (the 画风 in use,
// the 立绘 rule, their looks from the 角色 App) or uploaded; a plain background is taken off before it is kept. 观感:
// text speed, the pause of 自动, the text box's look and size, effects and voice on the stage.
import {createView, esc, heading, help, toggle, avatar, menu} from './common.js';
import {icon} from './icons.js';
import {VN_SPEED_NAMES, VN_WAITS, VN_FONTS, VN_BOXES, SPRITE_RULE, cutBackground, opaqueBounds} from '../core/vn.js';

const SWATCH = {night: ['#1c1d3c', '#ff8fb1'], day: ['#ffffff', '#4f9cf5'], sakura: ['#ffe3ee', '#e85d8f'], ink: ['#161310', '#c9a45c']};
const segmented = (key, value, list) => `<div class="segmented" style="margin:0">${list.map(([k, l]) => `<button type="button" data-vn-set="${key}" data-value="${esc(k)}" aria-pressed="${String(value) === String(k)}">${l}</button>`).join('')}</div>`;

export function vnApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'vn');
  const state = () => api.getState().vn;
  const save = patch => { try { api.saveVn(patch); } catch (error) { ctx.notify(error.message, {error: true}); } render(); };
  const inTavern = () => typeof api.vnStart === 'function';

  function castRows() {
    let cast = [];
    try { cast = api.vnCast?.() || []; } catch { cast = []; }
    if (!cast.length) return '<p class="hint">这张卡还没有登记的角色。正文里出现过的角色会自动登记，也可以在角色 App 里添加。</p>';
    return `<div class="vn-cast-list">${cast.map(c => `<div class="vn-cast-row">
      <span class="vn-sprite-thumb${c.sprite ? ' has' : ''}">${c.sprite ? `<img src="${esc(c.sprite)}" alt="" loading="lazy" draggable="false">` : avatar(c.name, 'none', 44)}</span>
      <span class="vn-cast-text"><strong>${esc(c.name)}</strong><small>${c.sprite ? '有立绘' : c.appearance ? '还没有立绘' : '还没有立绘 · 没写外貌'}</small>
      <button type="button" class="chip-button" data-action="vn-draw" data-name="${esc(c.name)}">${icon('paint')}${c.sprite ? '重画立绘' : '生成立绘'}</button></span>
      <button type="button" class="nav-button" data-action="vn-more" data-name="${esc(c.name)}" aria-label="${esc(c.name)} 的更多操作">${icon('more')}</button></div>`).join('')}</div>`;
  }

  function render() {
    const s = state();
    v.draw(heading('视觉小说', '', 'Visual Novel')
      + `<div class="vn-hero"><strong class="vn-hero-title">开演</strong>
        <p>把酒馆里的剧情放成 galgame：背景、立绘、对话框，配音一句一句来。看到最后还能直接写下一段。</p>
        <div class="actions"><button type="button" class="primary" data-action="vn-start" data-from="latest">${icon('play', true)}从最新一条开始</button><button type="button" class="secondary" data-action="vn-pick">选一条开始</button><button type="button" class="secondary" data-action="vn-start" data-from="first">从头开始</button></div>
        ${inTavern() ? '' : '<p class="hint">要在酒馆里打开小手机才能开演。</p>'}</div>`
      + `<div class="group">${toggle('vn-enabled', '视觉小说模式', s.enabled, '打开后，酒馆里每条消息的按钮栏多一个📖，点它就从那条开始看。关着也能在这里开演。')}</div>`
      + `<div class="group-title"><span>立绘</span>${help('用绘图 App 现在的引擎和画风画，外貌用角色 App 里登记的。画好后先去掉纯色背景再存进酒馆的图片文件夹，换设备也能看到。也可以上传自己的图（最好是透明背景的 PNG）。\n\n没有立绘的角色，说话时在对话框左边显示头像。')}</div>
        <div class="group">${castRows()}
        <details class="vn-rule" data-group="vn-rule"><summary>立绘要求</summary>
          <p class="hint">每张立绘都会带上这些（画风和外貌插件会自己加）。白色纯背景最好去背景。</p>
          <textarea data-field="vn-rule" rows="3" aria-label="立绘要求">${esc(s.rule)}</textarea>
          <div class="actions"><button type="button" class="text-button" data-action="vn-rule-reset">恢复默认</button></div></details></div>`
      + `<div class="group-title"><span>观感</span></div><div class="group pad">
        <div class="field"><span>文字速度</span>${segmented('speed', s.speed, VN_SPEED_NAMES.map((n, i) => [i, n]))}</div>
        <div class="field"><span>自动播放停顿${help('「自动」时，一句显示完（有配音的等配音读完）再停这么久翻页。没有配音的句子按字数多停一会儿，够读完。')}</span>${segmented('wait', s.wait, VN_WAITS.map((n, i) => [i, n + ' 秒']))}</div>
        <div class="field"><span>对话框</span><div class="vn-boxes">${Object.entries(VN_BOXES).map(([k, l]) => `<button type="button" class="vn-box-pick" data-vn-set="box" data-value="${k}" aria-pressed="${s.box === k}" style="--a:${SWATCH[k][0]};--b:${SWATCH[k][1]}"><i></i>${l}</button>`).join('')}</div></div>
        <div class="field"><span>对话框透明度</span><input type="range" data-field="vn-opacity" min="30" max="100" step="2" value="${Math.round(s.opacity * 100)}" aria-label="对话框透明度"></div>
        <div class="field"><span>字号</span>${segmented('font', s.font, Object.entries(VN_FONTS))}</div>
        ${toggle('vn-effects', '特效', s.effects, '背景慢慢推近、换图时闪一下、角色说话时跳一下、生气时画面震动。手机或电脑设置了「减弱动态效果」时自动关掉。')}
        ${toggle('vn-voice', '播放配音', s.voice, '有音色的台词显示时自动读出来。在记录里可以再听一次。语音总开关关着时不播。')}</div>`
      + `<p class="hint vn-keys">电脑上：Enter / 空格 / 滚轮向下翻页，滚轮向上或 ↑ 看记录，按住 Ctrl 快进，A 自动，H 隐藏，Esc 退出。手机上点屏幕翻页。</p>`);
  }

  async function start(from) {
    if (!inTavern()) throw Error('要在酒馆里打开小手机才能开演');
    await api.vnStart(from);
  }
  async function pick() {
    const rows = api.recentMessages?.(30) || [];
    if (!rows.length) throw Error('这个聊天还没有内容');
    const key = await menu(ctx, '从哪一条开始？', rows.map(r => ({key: String(r.id), icon: r.user ? 'person' : 'chat', label: `#${r.id} · ${r.name}`, note: r.preview || '（没有文字）'})));
    if (key != null) await start(Number(key));
  }

  // ---------- 立绘 ----------
  const loadImage = blob => new Promise((resolve, reject) => { const url = ctx.win.URL.createObjectURL(blob), img = new ctx.win.Image(); img.onload = () => resolve({img, url}); img.onerror = () => { ctx.win.URL.revokeObjectURL(url); reject(Error('这张图打不开')); }; img.src = url; });
  /** The picture with its plain background taken off (cut) and trimmed to the figure, as a PNG. */
  async function processed(blob, {cut, tolerance}) {
    const {img, url} = await loadImage(blob);
    try {
      const canvas = ctx.doc.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const g = canvas.getContext('2d', {willReadFrequently: true});
      if (!g) return blob;
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, canvas.width, canvas.height);
      if (cut) cutBackground(data.data, canvas.width, canvas.height, tolerance);
      g.putImageData(data, 0, 0);
      const box = opaqueBounds(data.data, canvas.width, canvas.height, 6);
      let out = canvas;
      if (box && (box.width < canvas.width || box.height < canvas.height)) {
        out = ctx.doc.createElement('canvas'); out.width = box.width; out.height = box.height;
        out.getContext('2d').drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
      }
      return await new Promise(resolve => out.toBlob(b => resolve(b || blob), 'image/png'));
    } finally { ctx.win.URL.revokeObjectURL(url); }
  }
  /** Shows the picture with the background taken off; 用这张 keeps it as the character's 立绘. */
  function review(name, blob, {cut = true, again = null} = {}) {
    const d = ctx.dialog('立绘 · ' + name, '');
    let tolerance = 40, shown = '', made = null, epoch = 0;
    const paint = async () => {
      const mine = ++epoch;
      d.body.innerHTML = `<div class="vn-review"><div class="vn-review-pic"><span class="vn-dots">处理中</span></div>
        <div class="group pad">${toggle('vn-cut', '去掉背景', cut, '把画面边缘的纯色背景（通常是白色）变成透明。人物边缘被吃掉了就调小强度，背景没去干净就调大。')}
        <div class="field"><span>去背景强度</span><input type="range" data-field="vn-tol" min="8" max="120" step="2" value="${tolerance}" ${cut ? '' : 'disabled'} aria-label="去背景强度"></div></div>
        <div class="actions">${again ? `<button type="button" class="secondary" data-action="vn-again">${icon('refresh')}再画一张</button>` : ''}<button type="button" class="primary" data-action="vn-use" disabled>${icon('check')}用这张</button></div></div>`;
      try { made = await processed(blob, {cut, tolerance}); } catch (error) { made = null; ctx.notify(error.message, {error: true}); }
      if (mine !== epoch || !d.live) return;
      if (shown) ctx.win.URL.revokeObjectURL(shown);
      shown = made ? ctx.win.URL.createObjectURL(made) : '';
      d.body.querySelector('.vn-review-pic').innerHTML = shown ? `<img src="${esc(shown)}" alt="">` : '<span>没能处理这张图</span>';
      const use = d.body.querySelector('[data-action=vn-use]');
      if (use) use.disabled = !made;
    };
    paint();
    d.onClose(() => { epoch++; if (shown) ctx.win.URL.revokeObjectURL(shown); });
    d.body.addEventListener('change', e => {
      if (e.target.dataset.field === 'vn-cut') { cut = e.target.checked; paint(); }
      if (e.target.dataset.field === 'vn-tol') { tolerance = Number(e.target.value); paint(); }
    });
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'vn-again') { d.close(); again(); return; }
      if (b.dataset.action !== 'vn-use' || !made) return;
      b.disabled = true;
      try {
        if (!api.vnSprite) throw Error('要在酒馆里打开小手机才能保存立绘');
        await api.vnSprite(name, made);
        ctx.notify(`「${name}」的立绘换好了`);
        d.close(); render();
      } catch (error) { ctx.notify(error.message, {error: true}); b.disabled = false; }
    });
  }
  /** 生成: their looks and the 立绘 rule can be changed for this one picture before it is drawn. */
  function draw(name) {
    const cast = (api.vnCast?.() || []).find(c => c.name === name) || {name, appearance: ''};
    const d = ctx.dialog('画立绘 · ' + name, '');
    let looks = cast.appearance, rule = state().rule;
    const paint = () => {
      const ready = api.drawReady(), request = api.vnSpriteRequest(name, {appearance: looks, rule}), quote = ready ? api.drawQuote(request.params) : null, paid = quote?.free === false;
      d.body.innerHTML = `<div class="group pad">
        <div class="field"><span>外貌${help('角色 App 里登记的外貌，只在这次生成用；想一直这样画，去角色 App 里改。')}</span><textarea data-field="vn-looks" rows="4" placeholder="比如 1girl, long black hair, red eyes, school uniform">${esc(looks)}</textarea></div>
        <div class="field"><span>立绘要求</span><textarea data-field="vn-rule-once" rows="3">${esc(rule)}</textarea></div></div>
        ${ready ? '' : `<p class="hint">${esc(api.drawMissing())}，先在引擎 App 里填好。</p>`}
        <div class="actions"><button type="button" class="primary" data-action="vn-go" ${ready ? '' : 'disabled'}>${paid ? icon('alert') + (api.getState().draw.engine === 'gpt' ? '生成（要花钱）' : '生成（会扣 Anlas）') : icon('paint') + '生成'}</button></div>`;
    };
    paint();
    d.body.addEventListener('change', e => {
      if (e.target.dataset.field === 'vn-looks') looks = e.target.value;
      if (e.target.dataset.field === 'vn-rule-once') rule = e.target.value;
    });
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action=vn-go]');
      if (!b) return;
      looks = d.body.querySelector('[data-field=vn-looks]').value; rule = d.body.querySelector('[data-field=vn-rule-once]').value;
      b.disabled = true; b.innerHTML = '<span class="vn-dots">正在画</span>';
      try {
        const request = api.vnSpriteRequest(name, {appearance: looks, rule});
        const result = await api.generateImage({...request, allowPaid: true, name: '立绘', key: 'vn:' + name, label: '立绘 · ' + name});
        const photo = await api.getPhoto(result.photoId);
        if (!photo?.blob) throw Error('画好了，但没在相册里找到这张图');
        if (d.live) d.close();
        review(name, photo.blob, {cut: true, again: () => draw(name)});
      } catch (error) {
        if (d.live) { paint(); }
        if (!error.cancelled) ctx.notify(error.message, {error: true});
      }
    });
  }
  function upload(name) {
    const input = ctx.doc.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', () => { const file = input.files?.[0]; if (file) review(name, file, {cut: false}); });
    input.click();
  }
  async function more(name) {
    const has = !!state().cast?.[name]?.sprite;
    const key = await menu(ctx, name, [
      {key: 'upload', icon: 'import', label: '上传图片', note: '用自己的立绘，最好是透明背景的 PNG'},
      has && {key: 'remove', icon: 'trash', label: '去掉立绘', note: '说话时改成在对话框里显示头像', danger: true}]);
    if (key === 'upload') upload(name);
    if (key === 'remove' && await ctx.confirm('去掉「' + name + '」的立绘？', '酒馆里的图片文件也会删掉。')) { await api.vnSprite(name, null); ctx.notify('已去掉立绘'); render(); }
  }

  v.on('click', '[data-action=vn-start]', el => start(el.dataset.from === 'first' || el.dataset.from === 'latest' ? el.dataset.from : Number(el.dataset.from)));
  v.on('click', '[data-action=vn-pick]', () => pick());
  v.on('click', '[data-action=vn-draw]', el => draw(el.dataset.name));
  v.on('click', '[data-action=vn-more]', el => more(el.dataset.name));
  v.on('click', '[data-action=vn-rule-reset]', () => save({rule: SPRITE_RULE}));
  v.on('click', '[data-vn-set]', el => { const k = el.dataset.vnSet, raw = el.dataset.value; save({[k]: k === 'box' || k === 'font' ? raw : Number(raw)}); });
  v.root.addEventListener('change', e => {
    const f = e.target.dataset.field;
    if (f === 'vn-enabled') { save({enabled: e.target.checked}); ctx.notify(e.target.checked ? '酒馆的每条消息上多了📖，点它从那条开始看' : '消息上的📖收起来了'); }
    else if (f === 'vn-effects') save({effects: e.target.checked});
    else if (f === 'vn-voice') save({voice: e.target.checked});
    else if (f === 'vn-opacity') save({opacity: Number(e.target.value) / 100});
    else if (f === 'vn-rule') save({rule: e.target.value});
  });
  v.refresh = render;
  render();
  return v;
}
