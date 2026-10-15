// 视觉小说: the workbench of the galgame view of the story. 开演 opens the stage over the tavern page (from the latest
// reply, from the start, or from a message picked here); 视觉小说模式 puts a 📖 button on every message to start from
// there. 立绘: each character of the open card has a page of standing pictures — the usual one, five 表情 picked by a
// line's 情绪, and 动作 of their own picked by words in the story — drawn with the drawing engine (the 画风 in use, the
// 立绘 rule, their looks from the 角色 App, on a flat key colour that is taken off) or uploaded. A 表情 is drawn with
// the usual one's seed, so the face and clothes stay as close as the engine allows. 观感: text speed, the pause of 自动,
// the text box (also in the tavern's or the phone's colours), its size, effects, voice and the 旁白.
import {createView, esc, heading, help, toggle, avatar, menu} from './common.js';
import {icon} from './icons.js';
import {VN_SPEED_NAMES, VN_WAITS, VN_FONTS, VN_BOXES, SPRITE_RULE, EXPRESSIONS, cutBackground, eraseAt, opaqueBounds} from '../core/vn.js';

const SWATCH = {night: ['#1c1d3c', '#ff8fb1'], day: ['#ffffff', '#4f9cf5'], sakura: ['#ffe3ee', '#e85d8f'], ink: ['#161310', '#c9a45c'], tavern: ['#2a2a30', '#e18a24'], phone: ['var(--card)', 'var(--accent)']};
const segmented = (key, value, list) => `<div class="segmented" style="margin:0">${list.map(([k, l]) => `<button type="button" data-vn-set="${key}" data-value="${esc(k)}" aria-pressed="${String(value) === String(k)}">${l}</button>`).join('')}</div>`;
const checker = url => url ? `<img src="${esc(url)}" alt="" loading="lazy" draggable="false">` : '';
/** 跟随小手机: the phone's colours now, for the stage on the tavern page (which cannot read them itself). */
function phonePalette(win, el) {
  const css = win.getComputedStyle(el), v = name => css.getPropertyValue(name).trim();
  return {box: v('--card'), box2: v('--card2'), ink: v('--ink'), soft: v('--ink2'), plate: v('--accent'), plateInk: v('--on-accent'), line: v('--line')};
}

export function vnApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'vn');
  const state = () => api.getState().vn;
  const save = patch => { try { api.saveVn(patch); } catch (error) { ctx.notify(error.message, {error: true}); } render(); };
  const inTavern = () => typeof api.vnStart === 'function';
  const castNow = () => { try { return api.vnCast?.() || []; } catch { return []; } };
  const castOf = name => castNow().find(c => c.name === name) || {name, appearance: '', sprite: '', seed: -1, looks: {}, actions: []};
  /** Every look of a character: the usual one, the 表情, their 动作. */
  const looksOf = c => [{id: '', label: '平常', tags: '', sprite: c.sprite},
    ...EXPRESSIONS.map(e => ({id: e.id, label: e.label, tags: e.tags, sprite: c.looks[e.id]?.sprite || ''})),
    ...c.actions.map(a => ({id: a.id, label: a.label, tags: a.tags, sprite: c.looks[a.id]?.sprite || '', action: a}))];

  function castRows() {
    const cast = castNow();
    if (!cast.length) return '<p class="hint">这张卡还没有登记的角色。正文里出现过的角色会自动登记，也可以在角色 App 里添加。</p>';
    return `<div class="vn-cast-list">${cast.map(c => {
      const made = looksOf(c).filter(l => l.sprite).length, shown = c.sprite || looksOf(c).find(l => l.sprite)?.sprite || '';
      return `<button type="button" class="vn-cast-row" data-action="vn-looks" data-name="${esc(c.name)}">
      <span class="vn-sprite-thumb${shown ? ' has' : ''}">${shown ? checker(shown) : avatar(c.name, 'none', 44)}</span>
      <span class="vn-cast-text"><strong>${esc(c.name)}</strong><small>${made ? `${made} 张立绘${c.actions.length ? ` · ${c.actions.length} 个动作` : ''}` : c.appearance ? '还没有立绘' : '还没有立绘 · 没写外貌'}</small></span>
      ${icon('next')}</button>`;
    }).join('')}</div>`;
  }

  function render() {
    const s = state();
    // 跟随小手机: the copy of the phone's colours is kept up to date (another skin, dark mode).
    if (s.box === 'phone') { const p = phonePalette(ctx.win, v.root); if (JSON.stringify(p) !== JSON.stringify(s.palette)) try { api.saveVn({palette: p}); } catch { /* not a colour the stage takes */ } }
    v.draw(heading('视觉小说', '', 'Visual Novel')
      + `<div class="vn-hero"><strong class="vn-hero-title">开演</strong>
        <p>把酒馆里的剧情放成 galgame：背景、立绘、对话框，配音一句一句来。看到最后还能直接写下一段。</p>
        <div class="actions"><button type="button" class="primary" data-action="vn-start" data-from="latest">${icon('play', true)}从最新一条开始</button><button type="button" class="secondary" data-action="vn-pick">选一条开始</button><button type="button" class="secondary" data-action="vn-start" data-from="first">从头开始</button></div>
        ${inTavern() ? '' : '<p class="hint">要在酒馆里打开小手机才能开演。</p>'}</div>`
      + `<div class="group">${toggle('vn-enabled', '视觉小说模式', s.enabled, '打开后，酒馆里每条消息的按钮栏多一个📖，点它就从那条开始看。关着也能在这里开演。')}</div>`
      + `<div class="group-title"><span>立绘</span>${help('点一个角色，给 TA 画立绘：平常的一张，开心、生气、难过、惊讶、害羞五种表情，还能加自己的动作（比如抱臂、托腮）。台词的情绪对上哪种表情就换哪张，正文里出现动作的词就换成那个动作。\n\n用绘图 App 现在的引擎和画风画，外貌用角色 App 里登记的，背景画成纯绿色（角色穿绿色就换蓝色）再去掉，浅色衣服和头发缝都好处理。表情用平常那张的种子画，脸和衣服会尽量一样。也可以上传自己的图。\n\n立绘存在酒馆的图片文件夹里，换设备也能看到。没有立绘的角色，说话时在对话框左边显示头像。')}</div>
        <div class="group">${castRows()}
        <details class="vn-rule" data-group="vn-rule"><summary>立绘要求</summary>
          <p class="hint">每张立绘都会带上这些。画风、外貌、表情动作和纯色背景插件会自己加；这里写了 background 就不另加背景。</p>
          <textarea data-field="vn-rule" rows="3" aria-label="立绘要求">${esc(s.rule)}</textarea>
          <div class="actions"><button type="button" class="text-button" data-action="vn-rule-reset">恢复默认</button></div></details></div>`
      + `<div class="group-title"><span>观感</span></div><div class="group pad">
        <div class="field"><span>文字速度</span>${segmented('speed', s.speed, VN_SPEED_NAMES.map((n, i) => [i, n]))}</div>
        <div class="field"><span>自动播放停顿${help('「自动」时，一句显示完（有配音的等配音读完）再停这么久翻页。没有配音的句子按字数多停一会儿，够读完。')}</span>${segmented('wait', s.wait, VN_WAITS.map((n, i) => [i, n + ' 秒']))}</div>
        <div class="field"><span>对话框${help('跟随酒馆：用酒馆主题（用户设置里的主题颜色）的颜色。跟随小手机：用小手机现在的皮肤和日间 / 夜间的颜色，换了皮肤再打开一次这个 App 就会跟上。')}</span><div class="vn-boxes">${Object.entries(VN_BOXES).map(([k, l]) => `<button type="button" class="vn-box-pick" data-vn-set="box" data-value="${k}" aria-pressed="${s.box === k}" style="--a:${SWATCH[k][0]};--b:${SWATCH[k][1]}"><i></i>${l}</button>`).join('')}</div></div>
        <div class="field"><span>对话框透明度</span><input type="range" data-field="vn-opacity" min="30" max="100" step="2" value="${Math.round(s.opacity * 100)}" aria-label="对话框透明度"></div>
        <div class="field"><span>字号</span>${segmented('font', s.font, Object.entries(VN_FONTS))}</div>
        ${toggle('vn-effects', '特效', s.effects, '背景慢慢推近、换图时闪一下、角色说话时跳一下、生气时画面震动、换表情时淡入淡出。手机或电脑设置了「减弱动态效果」时自动关掉。')}
        ${toggle('vn-voice', '播放配音', s.voice, '有音色的台词显示时自动读出来。在记录里可以再听一次。语音总开关关着时不播。')}
        ${toggle('vn-narrate', '旁白读叙述', s.narrate, '台词以外的叙述也读出来，用设置里「整篇朗读」选的旁白声音：系统朗读免费；用配音引擎的话要先在角色 App 里给「旁白」选音色，按字数花额度。正文里的音效、氛围音和背景音乐，演到那里就会响（要开着音效和自动放的背景音乐）。')}</div>`
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

  // ---------- one character's 立绘 ----------
  let sheet = null;
  function looks(name) {
    const d = sheet = ctx.dialog('立绘 · ' + name, '');
    const paint = () => {
      if (!d.live) return;
      const c = castOf(name), all = looksOf(c), missing = all.filter(l => l.id && !l.action && !l.sprite);
      d.body.innerHTML = `<p class="hint">${c.sprite ? '表情会用平常那张的种子画，脸和衣服尽量一样。' : '先画「平常」这张：表情会用它的种子画，脸和衣服更一致。'}点一张可以画、上传或去掉。</p>
        <div class="vn-looks">${all.map(l => `<button type="button" class="vn-look${l.sprite ? ' has' : ''}" data-look="${esc(l.id)}"><span class="vn-look-pic">${l.sprite ? checker(l.sprite) : `<i>${icon(l.action ? 'hand' : l.id ? 'smile' : 'person')}</i>`}</span><strong>${esc(l.label)}</strong><small>${l.sprite ? '已画' : l.action ? '动作' : l.id ? '表情' : '平常'}</small></button>`).join('')}</div>
        <div class="actions"><button type="button" class="secondary" data-action="vn-add-action">${icon('add')}加一个动作</button>${missing.length ? `<button type="button" class="primary" data-action="vn-all" ${c.sprite ? '' : 'disabled'}>${icon('paint')}画没画的 ${missing.length} 种表情</button>` : ''}</div>`;
    };
    paint();
    d.onClose(() => { if (sheet === d) sheet = null; render(); });
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-look], [data-action]');
      if (!b) return;
      try {
        if (b.dataset.action === 'vn-add-action') { await editAction(name); looks(name); return; }
        if (b.dataset.action === 'vn-all') { await drawAll(name); looks(name); return; }
        const c = castOf(name), l = looksOf(c).find(x => x.id === b.dataset.look);
        if (!l) return;
        const key = await menu(ctx, `${name} · ${l.label}`, [
          {key: 'draw', icon: 'paint', label: l.sprite ? '重画' : '画这张', note: l.id ? (c.seed >= 0 ? '用平常那张的种子，加上「' + (l.tags || l.label) + '」' : '加上「' + (l.tags || l.label) + '」') : '外貌和立绘要求可以先改'},
          {key: 'upload', icon: 'import', label: '上传图片', note: '用自己的图，白底、纯色底或透明 PNG 都行'},
          l.action && {key: 'edit', icon: 'edit', label: '改这个动作', note: '名字、怎么画、什么时候用'},
          l.sprite && {key: 'remove', icon: 'trash', label: '去掉这张', danger: true},
          l.action && {key: 'delete', icon: 'trash', label: '删掉这个动作', danger: true}]);
        if (key === 'draw') draw(name, l);
        else if (key === 'upload') upload(name, l);
        else if (key === 'edit') { await editAction(name, l.action); looks(name); }
        else if (key === 'remove' && await ctx.confirm(`去掉「${name} · ${l.label}」？`, '酒馆里的图片文件也会删掉。')) { await api.vnSprite(name, null, {look: l.id}); ctx.notify('去掉了'); looks(name); }
        else if (key === 'delete' && await ctx.confirm(`删掉动作「${l.label}」？`, '画好的这张也会删掉。')) { if (l.sprite) await api.vnSprite(name, null, {look: l.id}); changeActions(name, list => list.filter(a => a.id !== l.id)); looks(name); }
        else if (key == null) looks(name);
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  function changeActions(name, fn) {
    const s = state(), entry = s.cast[name] || {sprite: '', looks: {}, actions: []};
    api.saveVn({cast: {...s.cast, [name]: {...entry, actions: fn([...(entry.actions || [])])}}});
  }
  /** 动作: its name, what to draw (English tags) and the words in the story that bring it on. */
  function editAction(name, action = null) {
    return new Promise(resolve => {
      const d = ctx.dialog(action ? '改动作' : '加一个动作', `<div class="group pad">
        <div class="field"><span>名字</span><input data-field="a-label" maxlength="12" value="${esc(action?.label || '')}" placeholder="比如 抱臂"></div>
        <div class="field"><span>怎么画${help('写给绘图模型的英文 tag，比如 crossed arms、hand on own chin、waving、pointing at viewer。')}</span><input data-field="a-tags" value="${esc(action?.tags || '')}" placeholder="crossed arms"></div>
        <div class="field"><span>什么时候用${help('台词前面的叙述（或台词的情绪）里出现这些词，就换成这张。用逗号或空格隔开，比如：抱臂、抱着手臂、双臂交叉。')}</span><input data-field="a-words" value="${esc((action?.words || []).join('、'))}" placeholder="抱臂、双臂交叉"></div></div>
        <div class="actions"><button type="button" class="primary" data-action="a-save">${icon('check')}保存</button></div>`);
      d.onClose(() => resolve());
      d.body.addEventListener('click', e => {
        if (!e.target.closest('[data-action=a-save]')) return;
        const val = k => d.body.querySelector(`[data-field=${k}]`).value.trim();
        const label = val('a-label'), tags = val('a-tags'), words = val('a-words').split(/[,，、;；\s]+/).filter(Boolean);
        if (!label) { ctx.notify('写个名字', {error: true}); return; }
        if (!words.length) words.push(label);
        try {
          changeActions(name, list => action ? list.map(a => a.id === action.id ? {...a, label, tags, words} : a) : [...list, {id: 'a-' + Date.now().toString(36), label, tags, words}]);
          d.close();
        } catch (error) { ctx.notify(error.message, {error: true}); }
      });
    });
  }

  // ---------- drawing ----------
  const paidLabel = () => api.getState().draw.engine === 'gpt' ? '要花钱' : '会扣 Anlas';
  async function generate(name, l, {appearance, rule, extra} = {}) {
    const c = castOf(name), seed = l.id && c.seed >= 0 ? c.seed : -1;
    const request = api.vnSpriteRequest(name, {appearance, rule, extra: extra ?? l.tags, seed});
    const result = await api.generateImage({...request, allowPaid: true, name: '立绘', key: 'vn:' + name + ':' + (l.id || 'base'), label: `立绘 · ${name}${l.id ? ' · ' + l.label : ''}`});
    const photo = await api.getPhoto(result.photoId);
    if (!photo?.blob) throw Error('画好了，但没在相册里找到这张图');
    return {blob: photo.blob, seed: result.seed};
  }
  /** 画这张: their looks, the 立绘 rule and this look's tags can be changed for this one picture before it is drawn. */
  function draw(name, l) {
    const c = castOf(name);
    const d = ctx.dialog(`画立绘 · ${name} · ${l.label}`, '');
    let appearance = c.appearance, rule = state().rule, extra = l.tags;
    const paint = () => {
      const ready = api.drawReady(), request = api.vnSpriteRequest(name, {appearance, rule, extra}), paid = ready && api.drawQuote(request.params)?.free === false;
      d.body.innerHTML = `<div class="group pad">
        <div class="field"><span>外貌${help('角色 App 里登记的外貌，只在这次生成用；想一直这样画，去角色 App 里改。')}</span><textarea data-field="vn-looks" rows="4" placeholder="比如 1girl, long black hair, red eyes, school uniform">${esc(appearance)}</textarea></div>
        ${l.id ? `<div class="field"><span>这张的${l.action ? '动作' : '表情'}</span><input data-field="vn-extra" value="${esc(extra)}"></div>` : ''}
        <div class="field"><span>立绘要求</span><textarea data-field="vn-rule-once" rows="3">${esc(rule)}</textarea></div></div>
        ${ready ? '' : `<p class="hint">${esc(api.drawMissing())}，先在引擎 App 里填好。</p>`}
        <div class="actions"><button type="button" class="primary" data-action="vn-go" ${ready ? '' : 'disabled'}>${paid ? icon('alert') + `生成（${paidLabel()}）` : icon('paint') + '生成'}</button></div>`;
    };
    paint();
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action=vn-go]');
      if (!b) return;
      const val = k => d.body.querySelector(`[data-field=${k}]`)?.value;
      appearance = val('vn-looks') ?? appearance; rule = val('vn-rule-once') ?? rule; extra = val('vn-extra') ?? extra;
      b.disabled = true; b.innerHTML = '<span class="vn-dots">正在画</span>';
      try {
        const made = await generate(name, l, {appearance, rule, extra});
        if (d.live) d.close();
        review(name, made.blob, {look: l, seed: made.seed, again: () => draw(name, l)});
      } catch (error) {
        if (d.live) paint();
        if (!error.cancelled) ctx.notify(error.message, {error: true});
      }
    });
  }
  /** 画没画的表情: one after another, each with its background taken off as it comes; each can be redone later. */
  async function drawAll(name) {
    const c = castOf(name), todo = looksOf(c).filter(l => l.id && !l.action && !l.sprite);
    if (!todo.length) return;
    if (!api.drawReady()) throw Error(api.drawMissing());
    const request = api.vnSpriteRequest(name, {extra: todo[0].tags, seed: c.seed});
    if (api.drawQuote(request.params)?.free === false && !await ctx.confirm(`画 ${todo.length} 张表情？`, `每张都${paidLabel()}。`)) return;
    let done = 0;
    for (const l of todo) {
      ctx.notify(`正在画${name}的「${l.label}」（${done + 1}/${todo.length}）`);
      const made = await generate(name, l);
      await api.vnSprite(name, await processed(made.blob, {cut: true, strength: 40, taps: []}).then(trim), {look: l.id});
      done++;
    }
    ctx.notify(`画好了 ${done} 种表情，不满意的点开重画`);
  }
  function upload(name, l) {
    const input = ctx.doc.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', () => { const file = input.files?.[0]; if (file) review(name, file, {look: l}); });
    input.click();
  }

  // ---------- background ----------
  const loadImage = blob => new Promise((resolve, reject) => { const url = ctx.win.URL.createObjectURL(blob), img = new ctx.win.Image(); img.onload = () => { ctx.win.URL.revokeObjectURL(url); resolve(img); }; img.onerror = () => { ctx.win.URL.revokeObjectURL(url); reject(Error('这张图打不开')); }; img.src = url; });
  /** The picture on a canvas with its background taken off (cut) and the taps (点一下去掉) applied. */
  async function processed(blob, {cut, strength, taps}, canvas = ctx.doc.createElement('canvas')) {
    const img = blob instanceof ctx.win.HTMLImageElement ? blob : await loadImage(blob);
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const g = canvas.getContext('2d', {willReadFrequently: true});
    if (!g) throw Error('这个浏览器不能处理图片');
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, canvas.width, canvas.height);
    if (cut) cutBackground(data.data, canvas.width, canvas.height, strength);
    for (const t of taps) eraseAt(data.data, canvas.width, canvas.height, t.x, t.y, strength);
    g.putImageData(data, 0, 0);
    return canvas;
  }
  /** Trimmed to the figure, as a PNG. */
  function trim(canvas) {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height), box = opaqueBounds(data.data, canvas.width, canvas.height, 6);
    let out = canvas;
    if (box && (box.width < canvas.width || box.height < canvas.height)) {
      out = ctx.doc.createElement('canvas'); out.width = box.width; out.height = box.height;
      out.getContext('2d').drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    }
    return new Promise((resolve, reject) => out.toBlob(b => b ? resolve(b) : reject(Error('没能存成图片')), 'image/png'));
  }
  /**
   * Shows the picture with the background taken off. A tap on what is left (a gap in the hair) takes that patch too;
   * 撤销 puts the last one back. 用这张 keeps it as this look of the character.
   */
  async function review(name, blob, {look, seed, again = null}) {
    let img;
    try { img = await loadImage(blob); } catch (error) { ctx.notify(error.message, {error: true}); return; }
    const d = ctx.dialog(`立绘 · ${name} · ${look.label}`, `<div class="vn-review"><div class="vn-review-pic"><canvas></canvas></div>
      <p class="hint">还有没去掉的地方（比如头发缝里），在图上点一下就去掉。</p>
      <div class="group pad">${toggle('vn-cut', '去掉背景', true, '把纯色背景变成透明。人物边缘被吃掉了就调小强度，背景没去干净就调大，或者在图上点。')}
      <div class="field"><span>强度</span><input type="range" data-field="vn-strength" min="8" max="120" step="2" value="40" aria-label="去背景强度"></div></div>
      <div class="actions"><button type="button" class="secondary" data-action="vn-undo" disabled>${icon('undo')}撤销</button>${again ? `<button type="button" class="secondary" data-action="vn-again">${icon('refresh')}再画一张</button>` : ''}<button type="button" class="primary" data-action="vn-use">${icon('check')}用这张</button></div></div>`);
    const canvas = d.body.querySelector('canvas'), opts = {cut: true, strength: 40, taps: []};
    let busy = Promise.resolve();
    const paint = () => { busy = busy.then(() => processed(img, opts, canvas)).catch(error => ctx.notify(error.message, {error: true})); d.body.querySelector('[data-action=vn-undo]').disabled = !opts.taps.length; return busy; };
    paint();
    canvas.addEventListener('click', e => {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      opts.taps.push({x: (e.clientX - r.left) / r.width * canvas.width, y: (e.clientY - r.top) / r.height * canvas.height});
      paint();
    });
    d.body.addEventListener('change', e => {
      if (e.target.dataset.field === 'vn-cut') { opts.cut = e.target.checked; paint(); }
      if (e.target.dataset.field === 'vn-strength') { opts.strength = Number(e.target.value); paint(); }
    });
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'vn-undo') { opts.taps.pop(); paint(); return; }
      if (b.dataset.action === 'vn-again') { d.close(); again(); return; }
      if (b.dataset.action !== 'vn-use') return;
      b.disabled = true;
      try {
        if (!api.vnSprite) throw Error('要在酒馆里打开小手机才能保存立绘');
        await busy;
        await api.vnSprite(name, await trim(canvas), {look: look.id, seed});
        ctx.notify(`「${name} · ${look.label}」换好了`);
        d.close();
        if (look.id || castOf(name).actions.length) looks(name); else render();
      } catch (error) { ctx.notify(error.message, {error: true}); b.disabled = false; }
    });
  }

  v.on('click', '[data-action=vn-start]', el => start(el.dataset.from === 'first' || el.dataset.from === 'latest' ? el.dataset.from : Number(el.dataset.from)));
  v.on('click', '[data-action=vn-pick]', () => pick());
  v.on('click', '[data-action=vn-looks]', el => looks(el.dataset.name));
  v.on('click', '[data-action=vn-rule-reset]', () => save({rule: SPRITE_RULE}));
  v.on('click', '[data-vn-set]', el => {
    const k = el.dataset.vnSet, raw = el.dataset.value;
    save(k === 'box' ? {box: raw, ...(raw === 'phone' ? {palette: phonePalette(ctx.win, v.root)} : {})} : {[k]: k === 'font' ? raw : Number(raw)});
  });
  v.root.addEventListener('change', e => {
    const f = e.target.dataset.field;
    if (f === 'vn-enabled') { save({enabled: e.target.checked}); ctx.notify(e.target.checked ? '酒馆的每条消息上多了📖，点它从那条开始看' : '消息上的📖收起来了'); }
    else if (f === 'vn-effects') save({effects: e.target.checked});
    else if (f === 'vn-voice') save({voice: e.target.checked});
    else if (f === 'vn-narrate') save({narrate: e.target.checked});
    else if (f === 'vn-opacity') save({opacity: Number(e.target.value) / 100});
    else if (f === 'vn-rule') save({rule: e.target.value});
  });
  v.refresh = render;
  render();
  return v;
}
