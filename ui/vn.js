// 视觉小说: the workbench of the galgame view of the story. 开演 opens the stage over the tavern page (from the latest
// reply, from the start, or from a message picked here); a message's 小手机工具 menu in the tavern starts from that
// message. 立绘: each character of the open card has a page of standing pictures — the usual one, five 表情 picked by a
// line's 情绪, and 动作 of their own picked by words in the story — drawn with the drawing engine (the 画风 in use, the
// 立绘 rule, their looks from the 角色 App, on a flat key colour that is taken off) or uploaded. A 表情 is drawn with
// the usual one's seed, so the face and clothes stay as close as the engine allows. 观感: text speed, the pause of 自动,
// the text box (also in the tavern's or the phone's colours), its size, effects, voice and the 旁白.
import {pagedPicker} from './paged-picker.js';
import {modelCard, modelMenu} from './vn-model-ui.js';
import {modelLabel} from '../core/model-files.js';
import {createView, esc, heading, help, toggle, avatar, menu} from './common.js';
import {icon} from './icons.js';
import {saveFile} from '../download.js';
import {openAlbum} from './album-viewer.js';
import {cutoutHistory, openCutoutEditor} from './cutout-editor.js';
import {VN_SPEED_NAMES, VN_WAITS, VN_FONTS, VN_BOXES, SPRITE_RULE, EXPRESSIONS, cutBackground, clearEdges, eraseAt, opaqueBounds} from '../core/vn.js';

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
  let closeReview = null;
  const dispose = v.dispose;
  // A 立绘 whose file is gone from the tavern shows as 「图丢了」 (redraw, upload or take it away), not a broken picture.
  const lostPicture = e => { const img = e.target; if (img?.tagName === 'IMG') img.closest('.vn-look-pic, .vn-sprite-thumb')?.classList.add('lost'); };
  ctx.doc.addEventListener('error', lostPicture, true);
  v.dispose = () => { closeReview?.(); ctx.doc.removeEventListener('error', lostPicture, true); dispose(); };
  const state = () => api.getState().vn;
  const save = patch => { try { api.saveVn(patch); } catch (error) { ctx.notify(error.message, {error: true}); } render(); };
  const inTavern = () => typeof api.vnStart === 'function';
  const castNow = () => { try { return api.vnCast?.() || []; } catch { return []; } };
  const castOf = name => castNow().find(c => c.name === name) || {name, appearance: '', sprite: '', seed: -1, alts: [], mix: false, looks: {}, actions: [], outfits: []};
  /** The 形象 each character wears in the open chat: {name: outfit id}. */
  const wearNow = () => { try { return api.vnWear?.() || {}; } catch { return {}; } };
  /** The pictures of a 形象 ('' for the character's own set). */
  const setFor = (c, outfit) => outfit ? (c.outfits || []).find(o => o.id === outfit) || null : c;
  const group = g => g?.sprite ? {sprite: g.sprite, alts: g.alts || [], mix: !!g.mix, count: 1 + (g.alts || []).length} : {sprite: '', alts: [], mix: false, count: 0};
  /** Every look of a character in a 形象: the usual one, the 表情, their 动作 (each with its group of pictures). */
  const looksOf = (c, outfit = '') => {
    const set = setFor(c, outfit) || {looks: {}};
    return [{id: '', label: '平常', tags: '', outfit, ...group(set)},
      ...EXPRESSIONS.map(e => ({id: e.id, label: e.label, tags: e.tags, outfit, ...group(set.looks?.[e.id])})),
      ...c.actions.map(a => ({id: a.id, label: a.label, tags: a.tags, outfit, ...group(set.looks?.[a.id]), action: a}))];
  };

  function castRows() {
    const cast = castNow();
    if (!cast.length) return '<p class="hint">这张卡还没有登记的角色。正文里出现过的角色会自动登记，也可以在角色 App 里添加。</p>';
    const worn = wearNow();
    return '<div data-cast-picker></div>';
  }
  function mountCastPicker(){
    const root=v.root.querySelector('[data-cast-picker]');if(!root)return;
    const worn=wearNow();
    pagedPicker(root,{items:castNow(),pageSize:8,placeholder:'搜索角色…',text:c=>c.name,listClass:'vn-cast-list',render:c=>{
      const w = setFor(c, worn[c.name] || '') ? worn[c.name] || '' : '', all = looksOf(c, w);
      const made = all.reduce((n, l) => n + l.count, 0), shown = all.find(l => l.sprite)?.sprite || '';
      return `<button type="button" class="vn-cast-row" data-action="vn-looks" data-name="${esc(c.name)}">
      <span class="vn-sprite-thumb${shown ? ' has' : ''}">${shown ? checker(shown) : avatar(c.name, 'none', 44)}</span>
      <span class="vn-cast-text"><strong>${esc(c.name)}</strong><small>${[c.model ? esc(modelLabel(c.model)) + ' 模型' + ((c.models || []).length > 1 ? `（存了 ${c.models.length} 个）` : '') : (c.models || []).length ? `存了 ${c.models.length} 个模型 · 用立绘` : '', made ? `${made} 张立绘` : (c.models || []).length ? '' : c.appearance ? '还没有立绘' : '还没有立绘 · 没写外貌', c.actions.length ? `${c.actions.length} 个自定义表情／动作` : '', c.outfits.length ? `${c.outfits.length + 1} 套形象` + (w ? `（穿着${esc(setFor(c, w).label)}）` : '') : ''].filter(Boolean).join(' · ')}</small></span>
      ${icon('next')}</button>`;
    }});
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
      + `<div class="group-title"><span>立绘</span>${help('点一个角色，给 TA 画立绘：平常的一张，开心、生气、难过、惊讶、害羞五种表情，还能加自己的动作（比如抱臂、托腮）。台词的情绪对上哪种表情就换哪张，正文里出现动作的词就换成那个动作。\n\n用绘图 App 现在的引擎和画风画，外貌用角色 App 里登记的，背景画成纯绿色（角色穿绿色就换蓝色）再去掉，浅色衣服和头发缝都好处理。表情用平常那张的种子画，脸和衣服会尽量一样。也可以上传自己的图。\n\n立绘存在酒馆的图片文件夹里，换设备也能看到。没有立绘的角色，说话时在对话框左边显示头像。')}</div>
        <div class="group">${castRows()}
        <details class="vn-rule" data-group="vn-rule"><summary>立绘要求</summary>
          <p class="hint">每张立绘都会带上这些。画风、外貌、表情动作和背景插件会自己加（NovelAI V5 直接画透明背景，别的用纯色背景再去掉）；这里写了 background 就不另加背景。</p>
          <textarea data-field="vn-rule" rows="3" aria-label="立绘要求">${esc(s.rule)}</textarea>
          <div class="actions"><button type="button" class="text-button" data-action="vn-rule-reset">恢复默认</button></div></details></div>`
      + `<div class="group-title"><span>观感</span></div><div class="group pad">
        <div class="field"><span>文字速度</span>${segmented('speed', s.speed, VN_SPEED_NAMES.map((n, i) => [i, n]))}</div>
        <div class="field"><span>自动播放停顿${help('「自动」时，一句显示完（有配音的等配音读完）再停这么久翻页。没有配音的句子按字数多停一会儿，够读完。')}</span>${segmented('wait', s.wait, VN_WAITS.map((n, i) => [i, n + ' 秒']))}</div>
        <div class="field"><span>对话框${help('跟随酒馆：用酒馆主题（用户设置里的主题颜色）的颜色。跟随小手机：用小手机现在的皮肤和日间 / 夜间的颜色，换了皮肤再打开一次这个 App 就会跟上。')}</span><div class="vn-boxes">${Object.entries(VN_BOXES).map(([k, l]) => `<button type="button" class="vn-box-pick" data-vn-set="box" data-value="${k}" aria-pressed="${s.box === k}" style="--a:${SWATCH[k][0]};--b:${SWATCH[k][1]}"><i></i>${l}</button>`).join('')}</div></div>
        <div class="field"><span>对话框透明度</span><input type="range" data-field="vn-opacity" min="30" max="100" step="2" value="${Math.round(s.opacity * 100)}" aria-label="对话框透明度"></div>
        <div class="field"><span>字号</span>${segmented('font', s.font, Object.entries(VN_FONTS))}</div>
        ${toggle('vn-effects', '特效', s.effects, '立绘会呼吸，说话时轻轻起伏。台词按情绪演，每种情绪有好几种演法，同一句每次一样、不同的句子不一样：镜头推近、特写（背景虚化）、急推、拉远、晃动，人物跳一下、跺脚、往前一冲、后退、低头、别过脸、凑近，开心的暖光、害羞心动的爱心和柔光，边缘泛红泛蓝；喊出来的话会有切入画面、对话框一震、字一个个砸出来，小声的话字小而轻，害怕时字在抖，难过时字慢慢浮现；安静沉重的时候上下出现电影黑边。叙述里写到点头、摇头、鞠躬、蹦跳、别过脸、歪头这些，立绘就照做。字按标点停顿。叙述里的天气可以几种一起：雨、暴风雨（带闪电）、雪、雾、樱花、落叶、星空、流星、萤火虫、篝火火星、光尘、闪光、气泡、风、烟花；写到夜晚、黄昏、清晨、烛光会换成那时候的光；阳光照进来有光束，一拳打中有冲击画面，画面扭曲有故障效果，还有闪电、爆炸、心跳、眼前一黑、回忆。一条消息开头写着「第二天清晨」「三天后」这种，先出一张时间字卡。正文图片有几种展开方式。手机或电脑设置了「减弱动态效果」时自动关掉。')}
        ${toggle('vn-voice', '播放配音', s.voice, '有音色的台词显示时自动读出来。在记录里可以再听一次。语音总开关关着时不播。')}
        <div class="field"><span>正文标签${help('回复用这些标签包着正文时（比如 <content>…</content>），只演标签里面的，前后的状态栏、摘要、小剧场都不演。写标签名，用顿号或逗号隔开；回复里没有这些标签时照常演整条，清空就总是演整条。和设置里的「整篇朗读」共用。')}</span><input type="text" data-field="vn-body" value="${esc((api.getState().narration?.body || []).join('、'))}" placeholder="content、正文" aria-label="正文标签"></div>
        <div class="field vn-skip"><span>不演的标签${help('正文里这些标签包着的内容不进剧场，比如状态栏、成就美化、生图提示词。<status>…</status> 这种写标签名 status 就行；前后不一样的写成「开头…结尾」，比如 [状态]…[/状态]。[HUD_START]…[HUD_END] 这种 XXX_START / XXX_END 不用写，自动不演。设置里「整篇朗读」跳过的标签也不演。')}</span>
          <div class="vn-chips">${(s.skip || []).map(t => `<span class="vn-chip">${esc(t)}<button type="button" data-skip-del="${esc(t)}" aria-label="不再排除 ${esc(t)}">${icon('close')}</button></span>`).join('') || '<small class="hint">还没有</small>'}</div>
          <div class="vn-skip-add"><input type="text" data-field="vn-skip-new" placeholder="标签名，或 开头…结尾" aria-label="加一个不演的标签"><button type="button" class="secondary" data-action="vn-skip-add">${icon('add')}添加</button></div>
          ${narrationSkip().length ? `<small class="hint">整篇朗读里跳过的也不演：${esc(narrationSkip().join('、'))}</small>` : ''}</div>
        ${toggle('vn-narrate', '旁白读叙述', s.narrate, '台词以外的叙述也读出来，用设置里「整篇朗读」选的旁白声音：系统朗读免费；用配音引擎的话要先在角色 App 里给「旁白」选音色，按字数花额度。正文里的音效、氛围音和背景音乐，演到那里就会响（要开着音效和自动放的背景音乐）。')}</div>`
      + `<p class="hint vn-keys">电脑上：Enter / 空格 / 滚轮向下翻页，← 上一页，滚轮向上或 ↑ 看记录，按住 Ctrl 快进，A 自动，H 隐藏，Esc 退出。手机上点屏幕翻页。</p>`);
    mountCastPicker();
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
  /** What the stage last showed for them and why, so a 动作 that never comes on can be told why. */
  function lastPickNote(name, c) {
    let p = null;
    try { p = api.vnLastPick?.(name); } catch {}
    if (!p) return '';
    const said = p.line ? `「${esc(p.line)}${p.line.length >= 40 ? '…' : ''}」` : '这一句';
    const where = {before: '台词前面写着', after: '台词后面写着', emotion: '情绪里有'}[p.where] || '';
    const acts = c.actions.some(a => a.kind !== 'expression');
    const why = p.kind === 'action' ? `用了动作「${esc(p.label)}」：${where}「${esc(p.word)}」。`
      : p.kind === 'expression' ? `用了表情「${esc(p.label)}」（情绪：${esc(p.word)}）。${acts ? '前后的叙述里没找到动作的触发词。' : ''}`
      : `用了平常那张：${p.word ? `情绪「${esc(p.word)}」没对上画好的表情` : '这句没写情绪'}${acts ? '，前后的叙述里也没找到动作的触发词' : ''}。`;
    return `<p class="hint vn-last-pick" data-keep-hint>上一次演到${said}，${why}</p>`;
  }
  let sheet = null;
  const sheetOutfit = {};
  /** A character's page: their 形象 on top (默认 and their own), then every look of the one picked. */
  function looks(name, outfit = sheetOutfit[name] ?? (wearNow()[name] || '')) {
    if (outfit && !setFor(castOf(name), outfit)) outfit = '';
    sheetOutfit[name] = outfit;
    const d = sheet = ctx.dialog('立绘 · ' + name, '');
    const paint = () => {
      if (!d.live) return;
      const c = castOf(name), set = setFor(c, outfit) || c, all = looksOf(c, outfit), missing = all.filter(l => l.id && !l.action && !l.sprite);
      const worn = setFor(c, wearNow()[name] || '') ? wearNow()[name] || '' : '';
      const chips = [{id: '', label: '默认'}, ...c.outfits.map(o => ({id: o.id, label: o.label}))];
      d.body.innerHTML = `${lastPickNote(name, c)}${api.vnModel ? modelCard(c) : ''}<div class="vn-outfit-control"><button type="button" class="vn-outfit" data-action="vn-pick-outfit">${esc(chips.find(o=>o.id===outfit)?.label||'默认')} ▾</button><button type="button" class="vn-outfit add" data-action="vn-add-outfit">${icon('add')}形象</button></div><div data-look-picker></div>
        <div class="actions">${c.outfits.length && outfit !== worn ? `<button type="button" class="primary" data-action="vn-wear">${icon('check')}穿这套</button>` : ''}${outfit ? `<button type="button" class="secondary" data-action="vn-edit-outfit">${icon('edit')}改形象</button>` : ''}<button type="button" class="secondary" data-action="vn-add-expression" ${c.actions.length>=24?'disabled':''}>${icon('add')}表情</button><button type="button" class="secondary" data-action="vn-add-action" ${c.actions.length>=24?'disabled':''}>${icon('add')}动作</button>${missing.length ? `<button type="button" class="secondary" data-action="vn-all" ${set.sprite ? '' : 'disabled'}>${icon('paint')}补齐 ${missing.length} 种表情</button>` : ''}</div>`;
      pagedPicker(d.body.querySelector('[data-look-picker]'),{items:all,pageSize:9,placeholder:'搜索表情、动作…',listClass:'vn-looks',text:l=>l.label+' '+l.tags,render:l=>`<button type="button" class="vn-look${l.sprite?' has':''}" data-look="${esc(l.id)}"><span class="vn-look-pic">${l.sprite?checker(l.sprite):`<i>${icon(l.action?'hand':l.id?'smile':'person')}</i>`}${l.count>1?`<em class="vn-look-n">${l.mix?'随机 ':''}${l.count}</em>`:''}</span><strong>${esc(l.label)}</strong><small>${l.sprite?l.count+' 张':l.action?(l.action.kind==='expression'?'表情':'动作'):l.id?'表情':'平常'}</small></button>`});

    };
    paint();
    d.onClose(() => { if (sheet === d) sheet = null; render(); });
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-look], [data-action], [data-outfit]');
      if (!b) return;
      try {
        if (b.dataset.outfit != null) { outfit = sheetOutfit[name] = b.dataset.outfit; paint(); return; }
        if (b.dataset.action === 'vn-pick-outfit') { const list=[{id:'',label:'默认'},...castOf(name).outfits];d.close();const picker=ctx.dialog('选择形象','<div data-outfit-picker></div>');pagedPicker(picker.body.querySelector('[data-outfit-picker]'),{items:list,selected:outfit,pageSize:10,placeholder:'搜索形象…',text:o=>o.label,render:o=>`<button type="button" class="list-row" data-outfit="${esc(o.id)}">${icon(o.id===outfit?'check':'person')}<span><strong>${esc(o.label)}</strong></span></button>`});let chosen=outfit;picker.body.addEventListener('click',event=>{const option=event.target.closest('[data-outfit]');if(option){chosen=option.dataset.outfit;picker.close();}});picker.onClose(()=>looks(name,chosen));return; }
        if (b.dataset.action === 'vn-model') { d.close(); try { await modelMenu(ctx, api, name, castOf(name)); } finally { looks(name, outfit); } return; }
        if (b.dataset.action === 'vn-add-outfit') { const id = await editOutfit(name); looks(name, id || outfit); return; }
        if (b.dataset.action === 'vn-edit-outfit') { const gone = await outfitMenu(name, outfit); looks(name, gone ? '' : outfit); return; }
        if (b.dataset.action === 'vn-wear') { api.vnSetWear(name, outfit); ctx.notify(`这个聊天里${name}穿「${setFor(castOf(name), outfit)?.label || '默认'}」`); paint(); return; }
        if (b.dataset.action === 'vn-add-expression') { await editAction(name,null,'expression'); looks(name,outfit); return; }
        if (b.dataset.action === 'vn-add-action') { await editAction(name); looks(name, outfit); return; }
        if (b.dataset.action === 'vn-all') { await drawAll(name, outfit); looks(name, outfit); return; }
        const c = castOf(name), l = looksOf(c, outfit).find(x => x.id === b.dataset.look);
        if (!l) return;
        const set = setFor(c, outfit) || c;
        const key = await menu(ctx, `${name} · ${l.label}`, [
          l.sprite && {key: 'view', icon: 'image', label: '看大图', note: l.count > 1 ? `这组 ${l.count} 张，左右滑着看，可以下载` : '可以下载'},
          {key: 'draw', icon: 'paint', label: l.sprite ? '再画一张' : '画这张', note: l.id ? (set.seed >= 0 ? '用平常那张的种子，加上「' + (l.tags || l.label) + '」' : '加上「' + (l.tags || l.label) + '」') : '外貌和立绘要求可以先改'},
          {key: 'upload', icon: 'import', label: l.sprite ? '再上传一张' : '上传图片', note: '用自己的图，白底、纯色底或透明 PNG 都行'},
          l.count > 1 && {key: 'group', icon: 'gallery', label: `这组图（${l.count} 张）`, note: l.mix ? '正在轮换随机出' : '选用哪一张，或者轮换随机出'},
          l.action && {key: 'edit', icon: 'edit', label: l.action?.kind==='expression'?'改这个表情':'改这个动作', note: '名字、怎么画、什么时候用'},
          l.sprite && {key: 'remove', icon: 'trash', label: '去掉这张', note: l.count > 1 ? '换成这组的下一张' : '', danger: true},
          l.action && {key: 'delete', icon: 'trash', label: l.action?.kind==='expression'?'删掉这个表情':'删掉这个动作', note: '每套形象里的对应图片都会删掉', danger: true}]);
        if (key === 'view') viewSprites(name, l);
        else if (key === 'draw') draw(name, l);
        else if (key === 'upload') upload(name, l);
        else if (key === 'group') groupSheet(name, l);
        else if (key === 'edit') { await editAction(name, l.action); looks(name, outfit); }
        else if (key === 'remove' && await ctx.confirm(`去掉「${name} · ${l.label}」这张？`, '酒馆里的图片文件也会删掉。')) { await api.vnSprite(name, null, {look: l.id, outfit}); ctx.notify('去掉了'); looks(name, outfit); }
        else if (key === 'delete' && await ctx.confirm(`删掉${l.action?.kind==='expression'?'表情':'动作'}「${l.label}」？`, '画好的图也会删掉。')) {
          for (const o of ['', ...c.outfits.map(x => x.id)]) while (looksOf(castOf(name), o).find(x => x.id === l.id)?.sprite) await api.vnSprite(name, null, {look: l.id, outfit: o});
          changeActions(name, list => list.filter(a => a.id !== l.id)); looks(name, outfit);
        }
        else if (key == null) looks(name, outfit);
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** 看大图: the pictures of one look full size, swiped through like the album, each one can be downloaded. */
  function viewSprites(name, l, first = '', back = () => looks(name, l.outfit)) {
    const g = looksOf(castOf(name), l.outfit).find(x => x.id === l.id);
    const all = g?.sprite ? [g.sprite, ...g.alts.map(a => a.sprite)] : [];
    if (!all.length) return;
    const fileName = url => `${name}_${l.label}${all.length > 1 ? '_' + (all.indexOf(url) + 1) : ''}.png`;
    const fetchPicture = async url => { const response = await ctx.win.fetch(url); if (!response.ok) throw Error('读不到这张立绘'); return response.blob(); };
    openAlbum({ctx, host: v.root.closest('.screen') || ctx.doc.body, ids: all, index: Math.max(0, all.indexOf(first)),
      load: async url => ({blob: await fetchPicture(url), name: fileName(url)}),
      actions: [{key: 'download', icon: 'download', label: '下载', run: async url => { ctx.notify('已下载 ' + await saveFile(ctx.doc, await fetchPicture(url), fileName(url))); }}],
      onClose: back});
  }
  /** 这组图: every picture of one look; tap one to use it or take it out; 轮换随机出 lets them take turns. */
  function groupSheet(name, l) {
    const d = ctx.dialog(`${name} · ${l.label} · 这组图`, '');
    const now = () => looksOf(castOf(name), l.outfit).find(x => x.id === l.id);
    const paint = () => {
      const g = now();
      if (!g?.sprite) { d.close(); return; }
      const all = [g.sprite, ...g.alts.map(a => a.sprite)];
      d.body.innerHTML = `<p class="hint">点一张可以换成用它，或者去掉。打开「轮换随机出」，演的时候每句从这组里随机挑一张（不会连着两句同一张）。</p>
        <div data-variant-picker></div>
        <div class="group">${toggle('vn-mix', '轮换随机出', g.mix, '关着时一直用「在用」那张。')}</div>`;
      pagedPicker(d.body.querySelector('[data-variant-picker]'),{items:all.map((url,i)=>({url,i})),pageSize:9,placeholder:'搜索版本编号…',listClass:'vn-looks',text:x=>'版本 '+(x.i+1),render:x=>`<button type="button" class="vn-look has" data-pic="${esc(x.url)}"><span class="vn-look-pic">${checker(x.url)}</span><strong>第 ${x.i+1} 张</strong><small>${!x.i&&!g.mix?'在用':g.mix?'轮换':'备用'}</small></button>`});
    };
    paint();
    d.onClose(() => looks(name, l.outfit));
    d.body.addEventListener('change', async e => {
      if (e.target.dataset.field !== 'vn-mix') return;
      try { await api.vnSprite(name, null, {look: l.id, outfit: l.outfit, mix: e.target.checked}); } catch (error) { ctx.notify(error.message, {error: true}); }
      paint();
    });
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-pic]');
      if (!b) return;
      const u = b.dataset.pic, g = now(), first = g?.sprite === u;
      try {
        const key = await menu(ctx, `${name} · ${l.label}`, [{key: 'view', icon: 'image', label: '看大图', note: '可以下载'}, !first && {key: 'use', icon: 'check', label: '用这张', note: g?.mix ? '轮换时也会出现其他几张' : ''}, {key: 'drop', icon: 'trash', label: '去掉这张', danger: true}]);
        if (key === 'view') { viewSprites(name, l, u, () => groupSheet(name, l)); return; }
        else if (key === 'use') await api.vnSprite(name, null, {look: l.id, outfit: l.outfit, use: u});
        else if (key === 'drop' && await ctx.confirm('去掉这张？', '酒馆里的图片文件也会删掉。')) await api.vnSprite(name, null, {look: l.id, outfit: l.outfit, drop: u});
      } catch (error) { ctx.notify(error.message, {error: true}); }
      if (d.live) paint();
    });
  }
  function changeOutfits(name, fn) {
    const s = state(), entry = s.cast[name] || {sprite: '', looks: {}, actions: [], outfits: []};
    api.saveVn({cast: {...s.cast, [name]: {...entry, outfits: fn([...(entry.outfits || [])])}}});
  }
  /** 形象: its name and the looks to draw it with (clothes, hair); resolves to its id (null when not saved). */
  function editOutfit(name, outfit = null) {
    const c = castOf(name);
    return new Promise(resolve => {
      let saved = null;
      const d = ctx.dialog(outfit ? '改形象' : '加一套形象', `<p class="hint">同一个角色在不同的聊天里可以是不同的样子，比如校服和便服。每套形象有自己的一整套立绘；在角色的立绘页点「这个聊天穿这套」，这个聊天就用它。</p>
        <div class="group pad">
        <div class="field"><span>名字</span><input data-field="o-label" maxlength="12" value="${esc(outfit?.label || '')}" placeholder="比如 校服"></div>
        <div class="field"><span>外貌${help('画这套形象的立绘时用的外貌（英文 tag）。先放了角色 App 里登记的外貌，把衣服、发型改成这套的。')}</span><textarea data-field="o-looks" rows="4">${esc(outfit ? outfit.appearance : c.appearance)}</textarea></div></div>
        <div class="actions"><button type="button" class="primary" data-action="o-save">${icon('check')}保存</button></div>`);
      d.onClose(() => resolve(saved));
      d.body.addEventListener('click', e => {
        if (!e.target.closest('[data-action=o-save]')) return;
        const label = d.body.querySelector('[data-field=o-label]').value.trim(), appearance = d.body.querySelector('[data-field=o-looks]').value.trim();
        if (!label) { ctx.notify('写个名字', {error: true}); return; }
        try {
          const id = outfit?.id || 'o-' + Date.now().toString(36);
          changeOutfits(name, list => outfit ? list.map(o => o.id === id ? {...o, label, appearance} : o) : [...list, {id, label, appearance, sprite: '', looks: {}}]);
          if (!setFor(castOf(name), id)) throw Error('最多 7 套形象');
          saved = id;
          d.close();
        } catch (error) { ctx.notify(error.message, {error: true}); }
      });
    });
  }
  /** 改这套形象: rename it (and its looks) or delete it with its pictures. Resolves to true when it is gone. */
  async function outfitMenu(name, id) {
    const o = setFor(castOf(name), id);
    if (!o) return true;
    const key = await menu(ctx, `${name} · ${o.label}`, [{key: 'edit', icon: 'edit', label: '改名字和外貌'}, {key: 'delete', icon: 'trash', label: '删掉这套形象', note: '这套的立绘都会删掉', danger: true}]);
    if (key === 'edit') { await editOutfit(name, o); return false; }
    if (key === 'delete' && await ctx.confirm(`删掉「${o.label}」？`, '这套形象的立绘文件也会从酒馆删掉。')) {
      await api.vnSprite(name, null, {outfit: id, dropOutfit: true});
      if ((wearNow()[name] || '') === id) try { api.vnSetWear(name, ''); } catch {}
      return true;
    }
    return false;
  }
  function changeActions(name, fn) {
    const s = state(), entry = s.cast[name] || {sprite: '', looks: {}, actions: []};
    api.saveVn({cast: {...s.cast, [name]: {...entry, actions: fn([...(entry.actions || [])])}}});
  }
  /** 动作: its name, what to draw (English tags) and the words in the story that bring it on. */
  function editAction(name, action = null, kind = action?.kind || 'action') {
    const expression=kind==='expression', noun=expression?'表情':'动作';
    return new Promise(resolve => {
      const d = ctx.dialog((action?'改':'加一个')+noun, `<div class="group pad">
        <div class="field"><span>名字</span><input data-field="a-label" maxlength="12" value="${esc(action?.label || '')}" placeholder="${expression?'比如 紧张':'比如 抱臂'}"></div>
        <div class="field"><span>怎么画${help('写给绘图模型的英文 tag，比如 crossed arms、hand on own chin、waving、pointing at viewer。')}</span><input data-field="a-tags" value="${esc(action?.tags || '')}" placeholder="${expression?'nervous expression':'crossed arms'}"></div>
        <div class="field"><span>什么时候用${help(expression?'只匹配台词的情绪；中英文同义词自动对应。多个词用顿号、逗号或分号隔开（全角半角都行），英文短语里的空格会保留。':'台词前后紧挨着的叙述（或台词的情绪）里出现这些词，就换成这张。中文词中间隔一两个字也算：写「抱臂」，「抱着手臂」「抱起双臂」都能对上。叙述里离这个词最近的名字是别人时不算。多个词用顿号、逗号、分号或空格隔开（全角半角都行）。')}</span><input data-field="a-words" value="${esc((action?.words || []).join('、'))}" placeholder="${expression?'紧张、nervous、uneasy':'抱臂、双臂交叉'}"></div></div>
        <div class="actions"><button type="button" class="primary" data-action="a-save">${icon('check')}保存</button></div>`);
      d.onClose(() => resolve());
      d.body.addEventListener('click', e => {
        if (!e.target.closest('[data-action=a-save]')) return;
        const val = k => d.body.querySelector(`[data-field=${k}]`).value.trim();
        const label = val('a-label'), tags = val('a-tags'), words = val('a-words').split(expression?/[,，、;；\n]+/:/[,，、;；\s]+/).map(w=>w.trim()).filter(Boolean);
        if (!label) { ctx.notify('写个名字', {error: true}); return; }
        if (!words.length) words.push(label);
        try {
          changeActions(name, list => action ? list.map(a => a.id === action.id ? {...a, label, tags, words} : a) : [...list, {id: 'a-' + Date.now().toString(36), label, tags, words,...(expression?{kind:'expression'}:{})}]);
          d.close();
        } catch (error) { ctx.notify(error.message, {error: true}); }
      });
    });
  }

  // ---------- drawing ----------
  const paidLabel = () => api.getState().draw.engine === 'gpt' ? '要花钱' : '会扣 Anlas';
  async function generate(name, l, {appearance, rule, extra} = {}) {
    const c = castOf(name), o = l.outfit ? setFor(c, l.outfit) : null, set = o || c, seed = l.id && set.seed >= 0 ? set.seed : -1;
    const request = api.vnSpriteRequest(name, {appearance: appearance ?? (o?.appearance || undefined), rule, extra: extra ?? l.tags, seed});
    const result = await api.generateImage({...request, allowPaid: true, name: '立绘', key: 'vn:' + name + ':' + (l.outfit || '') + ':' + (l.id || 'base'), label: `立绘 · ${name}${o ? ' · ' + o.label : ''}${l.id ? ' · ' + l.label : ''}`});
    const photo = await api.getPhoto(result.photoId);
    if (!photo?.blob) throw Error('画好了，但没在相册里找到这张图');
    return {blob: photo.blob, seed: result.seed};
  }
  /** 画这张: their looks, the 立绘 rule and this look's tags can be changed for this one picture before it is drawn. */
  function draw(name, l) {
    const c = castOf(name), o = l.outfit ? setFor(c, l.outfit) : null;
    const d = ctx.dialog(`画立绘 · ${name}${o ? ' · ' + o.label : ''} · ${l.label}`, '');
    let appearance = o?.appearance || c.appearance, rule = state().rule, extra = l.tags;
    const paint = () => {
      const ready = api.drawReady(), request = api.vnSpriteRequest(name, {appearance, rule, extra}), paid = ready && api.drawQuote(request.params)?.free === false;
      d.body.innerHTML = `<div class="group pad">
        <div class="field"><span>外貌${help(o ? '这套形象的外貌，改了会记在这套形象里。' : '角色 App 里登记的外貌，只在这次生成用；想一直这样画，去角色 App 里改。')}</span><textarea data-field="vn-looks" rows="4" placeholder="比如 1girl, long black hair, red eyes, school uniform">${esc(appearance)}</textarea></div>
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
        if (o && appearance.trim() !== o.appearance) try { changeOutfits(name, list => list.map(x => x.id === o.id ? {...x, appearance: appearance.trim()} : x)); } catch { /* kept for this picture only */ }
        if (d.live) d.close();
        review(name, made.blob, {look: l, seed: made.seed, again: () => draw(name, l)});
      } catch (error) {
        if (d.live) paint();
        if (!error.cancelled) ctx.notify(error.message, {error: true});
      }
    });
  }
  /** 画没画的表情: one after another, each with its background taken off as it comes; each can be redone later. */
  async function drawAll(name, outfit = '') {
    const c = castOf(name), set = setFor(c, outfit) || c, todo = looksOf(c, outfit).filter(l => l.id && !l.action && !l.sprite);
    if (!todo.length) return;
    if (!api.drawReady()) throw Error(api.drawMissing());
    const request = api.vnSpriteRequest(name, {appearance: outfit ? set.appearance || undefined : undefined, extra: todo[0].tags, seed: set.seed});
    if (api.drawQuote(request.params)?.free === false && !await ctx.confirm(`画 ${todo.length} 张表情？`, `每张都${paidLabel()}。`)) return;
    let done = 0;
    for (const l of todo) {
      ctx.notify(`正在画${name}的「${l.label}」（${done + 1}/${todo.length}）`);
      const made = await generate(name, l);
      await api.vnSprite(name, await processed(made.blob, {cut: true, strength: 40, taps: []}).then(trim), {look: l.id, outfit});
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
    // Drawn with a transparent background (NovelAI V5): already cut out.
    if (cut && !clearEdges(data.data, canvas.width, canvas.height)) cutBackground(data.data, canvas.width, canvas.height, strength);
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
   * Shows the cutout; open the preview to edit at full size. Editing commands share an undo/redo history;
   * both download and 用这张 export the latest rendered transparent PNG.
   */
  async function review(name, blob, {look, seed, again = null}) {
    let img;
    try { img = await loadImage(blob); } catch (error) { ctx.notify(error.message, {error: true}); return; }
    if (v.disposed) return;
    const d = ctx.dialog(`立绘 · ${name} · ${look.label}`, `<div class="vn-review"><button type="button" class="vn-review-pic" data-action="vn-edit" aria-label="放大编辑"><canvas></canvas></button>
      <div class="group pad">${toggle('vn-cut', '去掉背景', true)}
      <div class="field"><span>强度</span><input type="range" data-field="vn-strength" min="8" max="120" step="2" value="40" aria-label="去背景强度"></div></div>
      <div class="actions vn-review-actions"><button type="button" class="secondary" data-action="vn-undo" disabled>${icon('undo')}撤回</button><button type="button" class="secondary" data-action="vn-redo" disabled><span class="vn-redo-icon">${icon('undo')}</span>重做</button><button type="button" class="secondary" data-action="vn-download">${icon('download')}下载</button>${again ? `<button type="button" class="secondary" data-action="vn-again">${icon('refresh')}再画一张</button>` : ''}${look.sprite ? `<button type="button" class="secondary" data-action="vn-use" data-replace>${icon('swap')}换掉原来的</button><button type="button" class="primary" data-action="vn-use">${icon('add')}加进这组</button>` : `<button type="button" class="primary" data-action="vn-use">${icon('check')}用这张</button>`}</div></div>`);
    const canvas = d.body.querySelector('canvas'), history = cutoutHistory();
    let busy = Promise.resolve(), editor = null;
    closeReview = () => d.close();
    d.onClose(() => { editor?.close(); closeReview = null; });
    const paint = () => {
      const opts = history.value;
      // Each queued render owns its options; an undo must not mutate an earlier render.
      busy = busy.catch(() => {}).then(() => processed(img, opts, canvas));
      busy.catch(error => ctx.notify(error.message, {error: true}));
      d.body.querySelector('[data-action=vn-undo]').disabled = !history.canUndo;
      d.body.querySelector('[data-action=vn-redo]').disabled = !history.canRedo;
      d.body.querySelector('[data-field=vn-cut]').checked = opts.cut;
      d.body.querySelector('[data-field=vn-strength]').value = opts.strength;
      editor?.refresh();
      return busy;
    };
    const undo = () => { if (history.undo()) paint(); };
    const redo = () => { if (history.redo()) paint(); };
    const edit = value => { if (history.edit(value)) paint(); };
    const download = async (doc = ctx.doc) => {
      try { await busy; await saveFile(doc, await trim(canvas), `${name} · ${look.label}.png`); }
      catch (error) { ctx.notify(error.message, {error: true}); }
    };
    paint();
    d.body.addEventListener('change', e => {
      if (e.target.dataset.field === 'vn-cut') edit({...history.value, cut: e.target.checked});
      if (e.target.dataset.field === 'vn-strength') edit({...history.value, strength: Number(e.target.value)});
    });
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'vn-undo') { undo(); return; }
      if (b.dataset.action === 'vn-redo') { redo(); return; }
      if (b.dataset.action === 'vn-download') { b.disabled = true; await download(); b.disabled = false; return; }
      if (b.dataset.action === 'vn-edit') {
        try {
          await busy;
          if (!d.live || editor) return;
          editor = openCutoutEditor({doc: ctx.doc, canvas, history, onUndo: undo, onRedo: redo, onDownload: download,
            onErase: point => edit({...history.value, taps: [...history.value.taps, point]}), onClose: () => { editor = null; }});
        } catch (error) { ctx.notify(error.message, {error: true}); }
        return;
      }
      if (b.dataset.action === 'vn-again') { d.close(); again(); return; }
      if (b.dataset.action !== 'vn-use') return;
      b.disabled = true;
      try {
        if (!api.vnSprite) throw Error('要在酒馆里打开小手机才能保存立绘');
        await busy;
        const add = !!look.sprite && !b.hasAttribute('data-replace');
        await api.vnSprite(name, await trim(canvas), {look: look.id, outfit: look.outfit || '', seed, add});
        ctx.notify(add ? `加进了「${name} · ${look.label}」这组` : `「${name} · ${look.label}」换好了`);
        d.close();
        looks(name, look.outfit || '');
      } catch (error) { ctx.notify(error.message, {error: true}); b.disabled = false; }
    });
  }

  v.on('click', '[data-action=vn-start]', el => start(el.dataset.from === 'first' || el.dataset.from === 'latest' ? el.dataset.from : Number(el.dataset.from)));
  v.on('click', '[data-action=vn-pick]', () => pick());
  v.on('click', '[data-action=vn-looks]', el => looks(el.dataset.name));
  v.on('click', '[data-action=vn-rule-reset]', () => save({rule: SPRITE_RULE}));
  /** 不演的标签: added one at a time, each shown with its ×. */
  const narrationSkip = () => api.getState().narration?.skip || [];
  function addSkip() {
    const box = v.root.querySelector('[data-field=vn-skip-new]'), value = box?.value.trim();
    if (!value) return;
    const before = state().skip || [];
    save({skip: [...before, value]});
    if ((state().skip || []).length === before.length) ctx.notify('这个已经有了，或者格式不对（前后不一样的写成「开头…结尾」）', {error: true});
  }
  v.on('click', '[data-action=vn-skip-add]', addSkip);
  v.on('click', '[data-skip-del]', el => save({skip: (state().skip || []).filter(t => t !== el.dataset.skipDel)}));
  v.root.addEventListener('keydown', e => { if (e.target.dataset?.field === 'vn-skip-new' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addSkip(); } });
  v.on('click', '[data-vn-set]', el => {
    const k = el.dataset.vnSet, raw = el.dataset.value;
    save(k === 'box' ? {box: raw, ...(raw === 'phone' ? {palette: phonePalette(ctx.win, v.root)} : {})} : {[k]: k === 'font' ? raw : Number(raw)});
  });
  v.root.addEventListener('change', e => {
    const f = e.target.dataset.field;
    if (f === 'vn-effects') save({effects: e.target.checked});
    else if (f === 'vn-voice') save({voice: e.target.checked});
    else if (f === 'vn-narrate') save({narrate: e.target.checked});
    else if (f === 'vn-opacity') save({opacity: Number(e.target.value) / 100});
    else if (f === 'vn-rule') save({rule: e.target.value});
    else if (f === 'vn-body') { try { api.saveNarration({body: e.target.value}); } catch (error) { ctx.notify(error.message, {error: true}); } render(); }
  });
  v.refresh = render;
  render();
  return v;
}
