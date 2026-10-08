import {createView, esc, engines, btn, field, input, select, textArea, heading, help, groupTitle, plate, avatar, languageField, languageName, typedLanguages, toggle} from './common.js';
import {VOICE_GENDERS, VOICE_AGES, poolLine, readPoolFile, poolFile, guessVoice} from '../core/auto-voice.js';
import {saveFile} from '../download.js';
import {icon, halo} from './icons.js';

function barcode(seed) {
  let h = 0, bars = '';
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = 0; i < 40; i++) { h = (h * 1103515245 + 12345) >>> 0; bars += `<i style="flex:${1 + (h >>> 28) % 3}"></i>`; }
  return bars;
}
const number = i => 'No.' + String(i + 1).padStart(3, '0');

export function rolesApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'roles'), drafts = new Map(), voiceNames = new Map();
  let current = null;
  const changed = () => { const el = v.root.querySelector('[data-save-state]'); if (el) el.textContent = '未保存'; };
  // A MiMo voice description can run to a few sentences: cards show its start, the editor shows it whole.
  const voiceLabel = voice => { const name = voiceNames.get(voice) || favorites().find(f => f.voice === voice)?.name || voice; return name.length > 16 ? name.slice(0, 15) + '…' : name; };
  // 音色收藏夹 (stored as voicePool: 自动挑音色 picks from it first): voices kept with a name and a note of the user's own.
  const favorites = () => api.getState().voicePool || [];
  const isFavorite = (engine, voice) => favorites().some(f => f.engine === engine && f.voice === voice);

  function renderList() {
    const roles = api.getState().routes;
    const cards = roles.map((r, i) => {
      const voiced = !!r.voice, engine = voiced ? r.engine : 'none';
      return `<button class="role-card" data-action="edit-role" data-id="${esc(r.id)}" data-engine="${engine}">
        <span class="role-top"><span class="role-no">${number(i)}</span>${voiced ? halo() : ''}${avatar(r.name, engine, 54)}</span>
        <span class="role-body"><strong>${esc(r.name)}</strong>${voiced
          ? `<span>${plate(engines[r.engine])}</span><small>${esc(voiceLabel(r.voice))}<br>${esc(r.language ? languageName(r.language) : '跟随默认语言')}</small>${r.autoVoice ? '<small class="auto-chip">自动挑的</small>' : ''}`
          : '<small class="unset">待选择音色</small><small>出现在聊天里时会等你配音</small>'}</span></button>`;
    }).join('');
    v.draw(heading('角色', help('给聊天里说话的角色配一个声音。也可以直接点聊天里的声波，遇到没配过的角色会带你来这里。') + btn('add-role', icon('add'), 'round-button', 'aria-label="新增角色"'), `Character · ${String(roles.length).padStart(2, '0')}`)
      + autoGroup()
      + `<div class="role-grid">${cards}<button class="role-card add" data-action="add-role">${icon('add')}新增角色</button></div>`
      );
  }
  /** 自动挑音色: the switch, and the 音色收藏夹 it picks from first. */
  function autoGroup() {
    const state = api.getState(), on = state.general.autoVoice === true, pool = state.voicePool || [];
    return `<div class="group">${toggle('autoVoice', '自动挑音色', on, '大世界卡里角色多，可以打开这个：新角色第一次说话时，文字模型按 TA 在正文里的样子（角色卡、说过的话、剧情里的描写）挑一个音色填上，标「自动挑的」，不满意随时换或重新挑。\n\n先从「音色收藏夹」里挑（标好男女、年龄的更容易挑中）；收藏夹里没有对得上的，再去引擎的音色库里搜（Fish 用公开音色库，MiniMax 用系统音色，ElevenLabs 用你账号里的音色）。挑一次会调用一两次文字模型。')}
      <button class="list-row" data-action="voice-pool"><span><strong>音色收藏夹</strong><small>${pool.length ? `${pool.length} 个音色 · 角色页填音色时可以直接选` : '还是空的：在「从列表选」里点 ♡，或在收藏夹里手动添加'}</small></span>${icon('next')}</button></div>`;
  }

  function renderEditor() {
    const r = current, c = api.getState().connections[r.engine], schema = api.engineSchema(r.engine);
    const saved = api.getState().routes.findIndex(x => x.id === r.id), pending = api.pendingRole() === r.name && !!r.name;
    const voiced = !!r.voice, model = r.model || c.model;
    const mimo = r.engine !== 'mimo' ? '' : /voicedesign$/.test(model) ? 'design' : /voiceclone$/.test(model) ? 'clone' : 'preset';
    v.draw(heading(r.id ? '角色配音' : '新增角色', '', 'Voice Route')
      + (pending ? `<div class="banner">${icon('alert')}<span>播放停在「${esc(r.name)}」这里，选好音色后可以继续。</span></div>` : '')
      + (r.autoVoice && voiced ? `<div class="banner auto-banner">${icon('wave')}<span>这个音色是自动挑的${r.autoReason ? `（${esc(r.autoReason)}）` : ''}。不满意可以从列表换一个，或者${api.autoPickVoice ? '' : '在酒馆里打开小手机后'}「重新挑」。</span>${api.autoPickVoice && r.id ? btn('repick-voice', '重新挑', 'chip-button') : ''}</div>` : '')
      + `<div class="id-card${voiced ? '' : ' none'}" data-engine="${r.engine}">
          <div class="id-top"><span>VOICE ID CARD</span>${plate(saved >= 0 ? number(saved) : 'NEW')}</div>
          <div class="id-main"><span class="id-photo">${halo()}${avatar(r.name || '新', voiced ? r.engine : 'none', 76)}</span>
            <div style="min-width:0;flex:1"><div class="id-name" data-id-name>${esc(r.name || '新角色')}</div>
            <div class="id-fields"><span>ENGINE</span><span>${engines[r.engine]}</span><span>VOICE</span><span data-id-voice>${esc(voiced ? voiceLabel(r.voice) : '未选择')}</span><span>LANG</span><span>${esc(r.language ? languageName(r.language) : '跟随默认')}</span></div></div></div>
          <div class="barcode">${barcode((r.name || '') + r.engine + (r.voice || ''))}</div><span class="id-stamp">${voiced ? '已配音' : '待配音'}</span>
        </div>
        <div class="group pad">${field('角色名称', input('name', r.name, 'text', 'placeholder="与台词里的说话者一致"'))}</div>
        ${groupTitle('引擎', help('每个角色在各家引擎里各自记住一套音色和模型，切过去再切回来不会丢。'))}
        <div class="engine-tabs">${Object.entries(engines).map(([k, label]) => {
          const bound = k === r.engine ? r.voice : r.bindings?.[k]?.voice;
          return `<button class="engine-tab" data-action="route-engine" data-engine="${k}" aria-pressed="${r.engine === k}" title="${esc(label + '：' + (bound ? voiceLabel(bound) : '未选音色'))}">${label}<small>${esc(bound ? voiceLabel(bound) : '未选音色')}</small></button>`;
        }).join('')}</div>
        ${groupTitle('声音')}
        <div class="group pad" data-engine="${r.engine}">
          <div class="voice-row"><span class="disc">${icon('wave')}</span><div>${voiced ? `<strong>${esc(voiceLabel(r.voice))}</strong><small class="mono">${esc(mimo === 'design' ? '音色设计' : r.voice)}</small>` : '<strong class="unset">还没有选择音色</strong><small>从列表或收藏夹选择，或在下面粘贴音色 ID</small>'}</div>${mimo === 'design' ? '' : btn('pick-voice', '从列表选', 'chip-button')}</div>
          ${mimo !== 'design' && (voiced || favorites().some(f => f.engine === r.engine)) ? `<div class="actions fav-actions">${favorites().some(f => f.engine === r.engine) ? btn('pick-favorite', icon('heart', true) + '从收藏夹选', 'chip-button') : ''}${voiced ? (isFavorite(r.engine, r.voice) ? '<small class="hint">这个音色已收藏</small>' : btn('pool-add', icon('heart') + '收藏这个音色', 'text-button')) : ''}</div>` : ''}
          ${mimo === 'design'
            ? field('音色描述', textArea('voice', r.voice, 'rows="3" placeholder="例如：二十岁出头的女生，声音清亮，带点慵懒，说话慢悠悠的"'), '用一到四句话描述：性别年龄、音色质感、情绪语气、语速节奏。不要写混响、回声这类后期效果，也不要写“普通”“正常”这种模糊的词。')
            : field(mimo === 'clone' ? '克隆样本' : '音色 ID', input('voice', r.voice, 'text', `placeholder="${mimo === 'clone' ? '填克隆样本的名字，或从列表选择' : '粘贴音色 ID 或从列表选择'}" autocomplete="off"`))}
          ${field('模型', select('model', r.model || '', [['', '跟随引擎 · ' + c.model], ...schema.models.map(m => [m.id, m.id, !m.supported])]))}
          ${languageField('language', r.language || '', true, typedLanguages(api.getState()))}
        </div>
        ${groupTitle('绘图')}
        <div class="group pad">${field('外貌 tag', textArea('appearance', r.appearance || '', 'class="code" rows="3" placeholder="例如 1girl, long silver hair, blue eyes, slender"'), '这个角色入画时会自动补上这些 tag，让长相保持一致。写英文 danbooru tag，逗号分隔，只写不会变的特征：1girl 或 1boy、发型发色、瞳色、体型、显眼的特征；衣服、表情、动作让模型按剧情写。已有作品里的角色，把识别 tag 放最前，比如 hatsune miku (vocaloid)。\n\n新角色第一次入画时，模型写的外貌会自动填到这里，可以随时改。')}</div>
        <div class="savebar" data-engine="${r.engine}"><span class="save-state" data-save-state>草稿</span>${btn('audition', icon('play', true) + '试听', 'secondary')}${btn('save-role', '保存', 'primary')}</div>
        ${pending ? `<div class="actions" data-engine="${r.engine}">${btn('continue-role', '保存并继续朗读', 'primary')}</div>` : ''}
        ${r.id ? `<div class="actions">${btn('delete-role', '删除角色配音', 'danger')}</div>` : ''}`);
  }

  const render = () => current ? renderEditor() : renderList();
  /**
   * One voice of the 收藏夹, new or kept: a name and a note of the user's own, and (for 自动挑音色) gender and age.
   * entry: {engine, voice, model, name, ...}; index: its place when it is already kept. done(saved) after saving.
   */
  function favoriteForm(entry, {index = -1, done = () => {}} = {}) {
    const fresh = index < 0, manual = fresh && !entry.voice;
    const d = ctx.dialog(manual ? '添加音色' : fresh ? '收藏音色' : '收藏的音色', `<div class="group pad">
      ${manual ? field('引擎', select('fav-engine', entry.engine || 'fish', Object.entries(engines))) + field('音色 ID', input('fav-voice', '', 'text', 'autocomplete="off" placeholder="粘贴音色 ID"')) : `<div class="field"><span>音色 ID</span><small class="mono fav-id">${esc(engines[entry.engine])} · ${esc(entry.voice)}</small></div>`}
      ${field('名字', input('fav-name', entry.name || '', 'text', 'maxlength="60" placeholder="自己认得出的名字"'))}
      ${field('备注', input('fav-style', entry.style || '', 'text', 'maxlength="120" placeholder="例如：温柔、清亮、适合姐姐角色"'), '写什么都行；自动挑音色时也会参考这里的描述。')}
      ${field('性别', select('fav-gender', entry.gender || '', [['', '不限'], ...Object.entries(VOICE_GENDERS)]))}
      ${field('年龄', select('fav-age', entry.age || '', [['', '不限'], ...Object.entries(VOICE_AGES)]), '自动挑音色时，性别和年龄对得上才会选这个音色。')}</div>
      <div class="actions">${fresh ? '' : btn('fav-remove', icon('trash') + '取消收藏', 'danger')}${btn('fav-save', fresh ? '收藏' : '保存', 'primary')}</div>`);
    d.body.addEventListener('click', e => {
      const value = k => d.body.querySelector(`[data-field=${k}]`)?.value.trim() || '';
      const list = [...favorites()];
      if (e.target.closest('[data-action=fav-remove]')) { list.splice(index, 1); api.saveVoicePool(list); d.close(); ctx.notify('已取消收藏'); done(); return; }
      if (!e.target.closest('[data-action=fav-save]')) return;
      const engine = manual ? value('fav-engine') : entry.engine, voice = manual ? value('fav-voice') : entry.voice;
      if (!voice) { ctx.notify('先填音色 ID', {error: true}); return; }
      if (fresh && isFavorite(engine, voice)) { ctx.notify('这个音色已经在收藏夹里了', {error: true}); return; }
      const next = {...entry, engine, voice, name: value('fav-name'), style: value('fav-style'), gender: value('fav-gender'), age: value('fav-age')};
      if (fresh) list.push(next); else list[index] = next;
      api.saveVoicePool(list);
      d.close(); ctx.notify(fresh ? '已收藏' : '已保存'); done();
    });
  }
  function addToPool(r) { favoriteForm({engine: r.engine, voice: r.voice, model: r.model || '', name: voiceNames.get(r.voice) || r.name + ' 的音色'}, {done: render}); }
  /** 从收藏夹选: the kept voices of this engine; one tapped goes into the role being edited. */
  function pickFavorite() {
    const target = current, list = favorites().filter(f => f.engine === target.engine);
    const d = ctx.dialog('从收藏夹选', `<div class="group" data-engine="${target.engine}">${list.map(f => `<button class="list-row" data-voice="${esc(f.voice)}"><span class="disc">${icon('heart', true)}</span><span><strong>${esc(f.name)}</strong><small>${esc(poolLine({...f, name: ''}) || '')}</small><small class="mono">${esc(f.voice)}</small></span>${icon('next')}</button>`).join('')}</div>`);
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-voice]');
      if (!b) return;
      const f = list.find(x => x.voice === b.dataset.voice);
      target.voice = f.voice;
      if (f.model) target.model = f.model;
      target.autoVoice = false;
      voiceNames.set(f.voice, f.name);
      d.close();
      if (current === target) { render(); changed(); }
    });
  }
  function poolSheet() {
    const draw = () => { const pool = favorites(); return pool.length
      ? `<div class="group">${pool.map((v, i) => `<button class="list-row" data-engine="${v.engine}" data-action="pool-edit" data-index="${i}"><span>${plate(engines[v.engine])}</span><span style="flex:1;min-width:0"><strong>${esc(v.name)}</strong><small>${esc(poolLine({...v, name: ''}) || '没有备注')}</small><small class="mono">${esc(v.voice)}</small></span>${icon('next')}</button>`).join('')}</div>`
      : '<p class="hint">还没有音色。在角色页「从列表选」里点 ♡ 收藏，或点上面的「添加音色」填音色 ID。</p>'; };
    const d = ctx.dialog('音色收藏夹', `<p class="help-copy">收藏用得上的音色，名字和备注随便写。角色页填音色时点「从收藏夹选」；自动挑音色也先从这里挑（标了性别和年龄的更容易挑中）。</p>
      <div class="actions">${btn('pool-manual', icon('add') + '添加音色', 'secondary')}<label class="secondary file-button">${icon('import')}导入<input type="file" data-pool-file accept=".json,application/json" aria-label="选择音色收藏文件"></label>${btn('pool-export', icon('download') + '导出', 'secondary')}</div>
      <p class="hint">可以导入别人分享的音色文件（ST-iPhonie 导出的，或 FishDialogue 的音色库 JSON）。文件里没写男女和年龄的，按名字和描述猜（少女、大叔、妈妈……），猜不出就留空。</p><div data-pool>${draw()}</div>`);
    const redraw = () => { if (!d.live) return; d.body.querySelector('[data-pool]').innerHTML = draw(); if (!current) render(); };
    // A pool file adds its voices (those already in the pool stay as they are).
    d.body.addEventListener('change', e => {
      if (!e.target.matches('[data-pool-file]')) return;
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      file.text().then(text => {
        const before = api.getState().voicePool || [], read = readPoolFile(text);
        const after = api.saveVoicePool([...before, ...read]);
        redraw();
        const added = after.length - before.length;
        ctx.notify(added ? `导入了 ${added} 个音色${read.length > added ? `（${read.length - added} 个已经收藏过）` : ''}` : '这些音色都已经收藏过了');
      }).catch(error => ctx.notify(error.message, {error: true}));
    });
    d.body.addEventListener('click', e => {
      if (e.target.closest('[data-action=pool-export]')) {
        e.preventDefault();
        const pool = api.getState().voicePool || [];
        if (!pool.length) { ctx.notify('收藏夹还是空的'); return; }
        saveFile(ctx.doc, new Blob([poolFile(pool)], {type: 'application/json'}), '音色收藏夹.json').then(name => ctx.notify('已下载 ' + name)).catch(error => ctx.notify(error.message, {error: true}));
        return;
      }
      // The form replaces this sheet (one sheet at a time); the 收藏夹 comes back after it.
      const back = () => { if (!current) render(); poolSheet(); };
      if (e.target.closest('[data-action=pool-manual]')) { favoriteForm({engine: current?.engine || 'fish', voice: ''}, {done: back}); return; }
      const b = e.target.closest('[data-action=pool-edit]');
      if (!b) return;
      const index = Number(b.dataset.index);
      favoriteForm(favorites()[index], {index, done: back});
    });
  }

  function edit(id) {
    const saved = api.getState().routes.find(r => r.id === id);
    if (!saved) { ctx.notify('角色已不存在'); return; }
    current = drafts.get(id) || structuredClone(saved);
    drafts.set(id, current);
    render();
  }
  // Starts a new draft for a speaker that appeared in chat without a voice.
  function create(name = '') {
    current = drafts.get('new') || {name: '', engine: 'fish', voice: '', model: '', language: '', bindings: {}};
    if (name) current.name = name;
    drafts.set('new', current);
    render();
  }
  v.edit = edit;
  v.create = create;
  v.back = () => { if (!current) return false; current = null; render(); return true; };
  v.refresh = () => { if (!current) render(); };

  v.on('change', '[data-field=autoVoice]', el => { api.updateGeneral({autoVoice: el.checked}); ctx.notify(el.checked ? '新角色第一次说话时会自动挑音色' : '已关闭自动挑音色'); });
  v.on('input', '[data-field]', el => {
    if (!current) return;
    current[el.dataset.field] = el.value;
    if (el.dataset.field === 'voice') current.autoVoice = false;
    changed();
    if (el.dataset.field === 'name') { const n = v.root.querySelector('[data-id-name]'); if (n) n.textContent = el.value || '新角色'; }
    if (el.dataset.field === 'voice') { const n = v.root.querySelector('[data-id-voice]'); if (n) n.textContent = el.value ? voiceLabel(el.value) : '未选择'; }
  });
  // A MiMo model change turns the 音色 field into a description or a clone sample name.
  v.on('change', 'select[data-field]', el => { current[el.dataset.field] = el.value; changed(); if (el.dataset.field === 'model' && current.engine === 'mimo') render(); });
  v.on('click', '[data-action]', async el => {
    switch (el.dataset.action) {
      case 'add-role': create(); break;
      case 'edit-role': edit(el.dataset.id); break;
      case 'route-engine':
        current = api.switchRouteEngine(current, el.dataset.engine);
        drafts.set(current.id || 'new', current);
        render();
        changed();
        break;
      case 'save-role':
      case 'continue-role': {
        const previous = current.id || 'new';
        current = api.saveRoute(current);
        drafts.delete(previous);
        drafts.set(current.id, current);
        render();
        v.root.querySelector('[data-save-state]').textContent = '已保存';
        ctx.notify('角色配音已保存');
        if (el.dataset.action === 'continue-role') api.resume();
        break;
      }
      case 'audition': api.audition(current); break;
      case 'delete-role':
        if (await ctx.confirm('删除角色配音？', '其他角色的音色和预设会保留。')) {
          api.deleteRoute(current.id);
          drafts.delete(current.id);
          current = null;
          render();
        }
        break;
      case 'pick-voice': pickVoice(); break;
      case 'voice-pool': poolSheet(); break;
      case 'pool-add': addToPool(current); break;
      case 'pick-favorite': pickFavorite(); break;
      case 'repick-voice': {
        const name = current.name;
        await v.busy(el, async () => {
          el.textContent = '正在挑…';
          const route = await api.autoPickVoice(name);
          current = structuredClone(route); drafts.set(route.id, current);
          render(); ctx.notify(`给「${name}」重新挑了：${route.autoName || route.voice}`);
        });
        break;
      }
    }
  });

  function pickVoice() {
    const target = current, engine = target.engine, saved = api.getState().connections[engine], connection = {...saved, model: target.model || saved.model};
    let page = 0, token = '', search = '', epoch = 0;
    const found = new Map();
    const favButton = id => { const on = isFavorite(engine, id); return `<button type="button" class="fav-toggle" data-fav="${esc(id)}" aria-pressed="${on}" aria-label="${on ? '取消收藏' : '收藏'}">${icon('heart', on)}</button>`; };
    const dialog = ctx.dialog('选择音色', `<div class="field"><input class="search" type="search" placeholder="搜索音色" aria-label="搜索音色"></div><div class="actions">${btn('search', '搜索', 'secondary')}</div><div class="group" data-engine="${engine}" data-voices></div>`);
    const load = async more => {
      const ticket = ++epoch;
      if (!more) { page = 0; token = ''; }
      const list = dialog.body.querySelector('[data-voices]');
      if (!more) list.innerHTML = '<p class="hint">正在读取…</p>';
      try {
        const result = await api.voices(engine, connection, {search, page, token});
        if (!dialog.live || ticket !== epoch) return;
        const rows = engine === 'mini' && search ? result.voices.filter(x => x.name.toLowerCase().includes(search.toLowerCase()) || x.id.includes(search)) : result.voices;
        for (const r of rows) voiceNames.set(r.id, r.name);
        for (const r of rows) found.set(r.id, r);
        const html = rows.map(r => `<div class="list-row voice-choice"><button type="button" class="voice-choice-pick" data-voice="${esc(r.id)}"><span class="disc">${icon('wave')}</span><span><strong>${esc(r.name)}</strong><small class="mono">${esc(r.id)}</small></span></button>${favButton(r.id)}</div>`).join('');
        if (!more) list.innerHTML = html || '<p class="hint">没有找到音色，可以直接填写音色 ID。</p>';
        else { list.querySelector('[data-more]')?.remove(); list.insertAdjacentHTML('beforeend', html); }
        if (result.more) list.insertAdjacentHTML('beforeend', '<button class="text-button" data-more>加载更多</button>');
        token = result.token;
        page++;
      } catch (error) {
        if (dialog.live && ticket === epoch) { list.innerHTML = ''; const p = ctx.doc.createElement('p'); p.className = 'error-copy'; p.textContent = error.message; list.append(p); }
      }
    };
    dialog.body.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.fav) {
        // ♡: kept (or let go) right away, named as the list names it; gender and age guessed from that name.
        const id = b.dataset.fav, list = [...favorites()], at = list.findIndex(f => f.engine === engine && f.voice === id);
        if (at >= 0) list.splice(at, 1);
        else { const r = found.get(id) || {name: id}; list.push({engine, voice: id, model: '', name: r.name, style: (r.info || '').slice(0, 120), ...guessVoice(r.name + ' ' + (r.info || ''))}); }
        api.saveVoicePool(list);
        b.outerHTML = favButton(id);
        ctx.notify(at >= 0 ? '已取消收藏' : '已收藏，可以在音色收藏夹里改名字和备注');
        return;
      }
      if (b.dataset.voice) {
        target.voice = b.dataset.voice;
        target.autoVoice = false;
        dialog.close();
        if (current === target) { render(); changed(); }
      } else if (b.hasAttribute('data-more')) { b.disabled = true; load(true); }
      else if (b.dataset.action === 'search') { search = dialog.body.querySelector('input').value.trim(); load(false); }
    });
    load(false);
  }

  render();
  return v;
}
