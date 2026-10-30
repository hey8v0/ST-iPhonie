import {createView, esc, engines, btn, field, input, select, textArea, heading, help, groupTitle, plate, avatar, languageField, languageName, typedLanguages, toggle} from './common.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {layerSort} from './layer-sort.js';
import {layerTree} from '../core/layers.js';
import {lookTest} from '../core/draw.js';
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
  // The 音色收藏夹's names by voice: read once per drawing of the list (each read of the settings copies all of them, and
  // asking once per role made the list slower with every role).
  const poolNames = () => new Map(favorites().map(f => [f.voice, f.name]));
  const voiceLabel = (voice, pool = poolNames()) => { const name = voiceNames.get(voice) || pool.get(voice) || voice; return name.length > 16 ? name.slice(0, 15) + '…' : name; };
  // 音色收藏夹 (stored as voicePool: 自动挑音色 picks from it first): voices kept with a name and a note of the user's own.
  const favorites = () => api.getState().voicePool || [];
  const isFavorite = (engine, voice) => favorites().some(f => f.engine === engine && f.voice === voice);

  // ---------- the list: rows that go the way Procreate's layers do ----------
  let listDrawn = '', query = '', filter = '', swipe = null, sort = null, seenCard = null;
  const space = () => api.phoneSpace?.() || {};
  const inCard = (r, sp) => !!sp.key && ((sp.members || []).includes(r.name) || !!r.cards?.includes(sp.key));
  /** What the 筛选 chips ask for. */
  const FILTERS = {card: ['这张卡', inCard], voice: ['待配音', r => !r.voice], look: ['没外貌', r => !r.appearance?.trim()]};
  const tree = () => layerTree(api.getState().routes, api.getState().roleGroups).map(e => e.style ? {style: e.style.id} : {group: {...e.group}, styles: e.styles.map(r => r.id)});
  const groupName = () => { const taken = new Set(api.getState().roleGroups.map(g => g.name)); for (let n = 1; ; n++) { const name = n === 1 ? '新建组' : `新建组 ${n}`; if (!taken.has(name)) return name; } };
  /** Picked rows as roles: a group's row stands for its roles. */
  const rolesOf = ids => [...new Set(ids.flatMap(id => id.startsWith('g:') ? tree().find(e => e.group?.id === id.slice(2))?.styles || [] : [id]))];
  function roleRow(r, pool) {
    const voiced = !!r.voice, engine = voiced ? r.engine : 'none';
    const actions = [...(voiced ? [{key: 'audition', label: '试听', icon: 'play'}] : []), {key: 'edit', label: '改', icon: 'edit'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}];
    return swipeRow(r.id, `<button type="button" class="list-row role-row" data-action="edit-role" data-id="${esc(r.id)}" data-engine="${engine}">${avatar(r.name, engine, 44)}<span class="role-row-text"><strong>${esc(r.name)}</strong>${voiced
      ? `<small>${plate(engines[r.engine])}<span class="role-voice">${esc(voiceLabel(r.voice, pool))}</span>${r.autoVoice ? ' <span class="auto-chip">自动挑的</span>' : ''}</small>`
      : '<small class="unset">待配音</small>'}</span></button>`, actions, {label: r.name});
  }
  const GROUP_ACTIONS = [{key: 'rename', label: '改名', icon: 'edit'}, {key: 'ungroup', label: '解散', icon: 'layers'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}];
  function listRows() {
    const state = api.getState(), pool = poolNames(), sp = space(), word = query.trim().toLowerCase();
    if (word || filter) {
      const shown = state.routes.filter(r => (!filter || FILTERS[filter][1](r, sp)) && (!word || [r.name, ...(r.aliases || []), r.voice ? voiceLabel(r.voice, pool) : ''].join(' ').toLowerCase().includes(word)));
      return shown.map(r => roleRow(r, pool)).join('') || '<p class="hint role-none">没有这样的角色</p>';
    }
    return layerTree(state.routes, state.roleGroups).map(e => e.style ? roleRow(e.style, pool) : swipeRow('g:' + e.group.id, `<div class="list-row style-group-row" aria-expanded="${e.group.open}"><span class="style-group-chevron">${icon('chevron')}</span><span class="style-group-art">${icon('layers')}</span><span><strong data-group-name>${esc(e.group.name)}</strong><small>${e.styles.length} 个角色${e.styles.some(r => !r.voice) ? ` · ${e.styles.filter(r => !r.voice).length} 个待配音` : ''}</small></span>${sp.key && e.group.card === sp.key ? '<span class="chip">在玩</span>' : ''}</div>`, GROUP_ACTIONS, {className: 'style-group', label: e.group.name})
      + `<div class="style-group-body" data-group-body="${esc(e.group.id)}"${e.group.open ? '' : ' data-closed'}><div class="style-group-inner">${e.styles.map(r => roleRow(r, pool)).join('')}</div></div>`).join('');
  }
  // (Whatever was being looked for stays in sight when so many have been deleted that the box would otherwise go.)
  function listTools(roles) {
    const sp = space(), chips = Object.entries(FILTERS).map(([key, [label, test]]) => [key, label, roles.filter(r => test(r, sp)).length]).filter(([key, , n]) => n > 0 || filter === key);
    return (roles.length > 8 || query ? `<div class="field role-search"><input class="search" type="search" data-role-search value="${esc(query)}" placeholder="搜索名字、别名、音色" aria-label="搜索角色" autocomplete="off"></div>` : '')
      + ((roles.length > 3 || filter) && chips.length ? `<div class="grid-choices role-filters" role="group" aria-label="筛选">${chips.map(([key, label, n]) => `<button type="button" data-action="role-filter" data-key="${key}" aria-pressed="${filter === key}">${label} · ${n}</button>`).join('')}</div>` : '');
  }
  function listHTML(rows = listRows()) {
    const roles = api.getState().routes;
    return heading('角色', help('给聊天里说话的角色配一个声音。也可以直接点聊天里的声波，遇到没配过的角色会带你来这里。') + btn('add-role', icon('add'), 'round-button', 'aria-label="新增角色"'), `Character · ${String(roles.length).padStart(2, '0')}`)
      + autoGroup() + listTools(roles)
      + (roles.length ? `<div class="group style-list role-list" data-role-list>${rows}</div>` : `<div class="actions">${btn('add-role', icon('add') + '新增角色', 'secondary')}</div>`);
  }
  /** Only the rows: typing in the search box keeps the keyboard up, and a moved row glides. */
  function paintRows() {
    const list = v.root.querySelector('[data-role-list]'), rows = listRows();
    if (list) list.innerHTML = rows;
    listDrawn = listHTML(rows);
  }
  /** The list as put in order. Drafts go along (one saved later would put its role back in the group it was in); a group opened or shut has already changed by itself, nothing needs drawing again for it. */
  function keepOrder(next) {
    for (const r of api.arrangeRoles(next)) { const draft = drafts.get(r.id); if (!draft) continue; if (r.group) draft.group = r.group; else delete draft.group; }
    listDrawn = listHTML();
  }
  function renderList() {
    if (v.root.querySelector('.role-list.sorting')) return;
    // Those met before there were groups go in the groups of their cards, once.
    if (!api.getState().roleGroupsSorted) api.sortRolesByCard?.(api.tavernCards?.() || []);
    const html = listHTML();
    // Reopening 角色 draws the list again only when something in it changed: with dozens of roles, drawing them all
    // again for nothing was most of the time it took. (A switch flipped but not saved still gets drawn again.)
    if (html === listDrawn && v.root.querySelector('[data-role-list]') && swipe && ![...v.root.querySelectorAll('input[type=checkbox]')].some(b => b.checked !== b.defaultChecked)) return;
    listDrawn = html;
    swipe?.dispose(); swipe = null;
    v.draw(html);
    mountList();
  }
  /** Coming in with another card in the tavern: its group opens, and is brought into view. */
  function showPlaying() {
    if (v.disposed || current) return;
    // Made before it is on the page, there is nothing to measure yet.
    if (!v.root.isConnected) { ctx.win.setTimeout(showPlaying, 0); return; }
    const key = space().key || '';
    if (key === seenCard) return;
    const first = seenCard === null;
    seenCard = key;
    if (!key || query || filter) return;
    const state = api.getState(), group = state.roleGroups.find(g => g.card === key);
    if (!group || !sort) return;
    if (!group.open) sort.toggle(group.id);
    const row = sort.rowOf('g:' + group.id);
    if (!row) return;
    // (The phone may be growing out of its icon just now: in the view's own pixels.)
    const box = v.root.getBoundingClientRect(), top = (row.getBoundingClientRect().top - box.top) / (box.height / v.root.offsetHeight || 1);
    if (!first || top > v.root.clientHeight * .6) v.root.scrollTop += top - 8;
  }
  function mountList() {
    const list = v.root.querySelector('[data-role-list]');
    if (!list) return;
    sort = layerSort({ctx, list, tree, commit: keepOrder, paint: paintRows, groupName, scroller: () => v.root});
    swipe = mountSwipeList(list, {ctx,
      hint: '点一下改，按住可以拖动排序；左滑：试听、改、删除；右滑：多选、建组、合并；点组：展开或收起',
      mouseHint: '点一下改，按住可以拖动排序；⋯ 或右键：试听、改、删除；Ctrl / ⌘ 点：多选、建组、合并；点组：展开或收起',
      sort: {start: (row, point) => query || filter ? null : sort.lift(row, point)},
      onTap: id => { if (id.startsWith('g:')) sort.toggle(id.slice(2)); },
      onAction: async (key, id) => {
        try {
          if (id.startsWith('g:')) {
            const gid = id.slice(2), entry = tree().find(e => e.group?.id === gid);
            if (!entry) return;
            if (key === 'rename') sort.rename(gid);
            else if (key === 'ungroup') sort.arrange(tree().flatMap(e => e.group?.id === gid ? e.styles.map(style => ({style})) : [e]));
            else if (key === 'delete' && await ctx.confirm(`删除组「${entry.group.name}」？`, `里面的 ${entry.styles.length} 个角色和他们的音色设置会一起删掉。只想拆开组，用「解散」。`)) dropRoles(entry.styles);
            return;
          }
          const role = api.getState().routes.find(r => r.id === id);
          if (!role) return;
          if (key === 'edit') edit(id);
          else if (key === 'audition') api.audition(role);
          else if (key === 'delete' && await ctx.confirm(`删除角色「${role.name}」？`, '其他角色的音色和预设会保留。')) dropRoles([id]);
        } catch (error) { ctx.notify(error.message, {error: true}); }
      },
      bulk: [{key: 'group', label: '建组', icon: 'layers'}, {key: 'merge', label: '合并', icon: 'person'}, ...(api.autoPickVoice ? [{key: 'voice', label: '挑音色', icon: 'wave'}] : []), {key: 'delete', label: '删除', icon: 'trash', danger: true}],
      onBulk: async (key, ids) => {
        const picked = rolesOf(ids);
        if (key === 'group') return sort.makeGroup(ids);
        if (key === 'merge') return mergeRoles(picked);
        if (key === 'voice') return pickVoices(picked);
        if (key === 'delete' && await ctx.confirm(`删除这 ${picked.length} 个角色？`, '他们的音色设置会一起删掉，其他角色保留。')) dropRoles(picked);
      }});
  }
  function dropRoles(ids) {
    api.deleteRoutes(ids);
    for (const id of ids) drafts.delete(id);
    listDrawn = ''; render();
  }
  /** Picked roles that are one person (the same name written two ways): the one with a voice stays. */
  async function mergeRoles(ids) {
    const roles = ids.map(id => api.getState().routes.find(r => r.id === id)).filter(Boolean);
    if (roles.length < 2) { ctx.notify('至少选两个角色才能合并'); return; }
    const keep = roles.find(r => r.voice) || roles[0], others = roles.filter(r => r !== keep);
    if (!await ctx.confirm(`合并成「${keep.name}」？`, `${others.map(r => r.name).join('、')} 会变成这个角色的别名，以后都用同一个音色。没写的外貌和资料从被合并的人那里补上。`)) return;
    api.mergeRoutes(roles.map(r => r.id));
    for (const r of others) drafts.delete(r.id);
    drafts.delete(keep.id);
    listDrawn = ''; render();
    ctx.notify(`已合并成「${keep.name}」`);
  }
  /** 挑音色 for the picked roles that have none, one after another. */
  async function pickVoices(ids) {
    const roles = ids.map(id => api.getState().routes.find(r => r.id === id)).filter(r => r && !r.voice);
    if (!roles.length) { ctx.notify('选中的角色都有音色了'); return; }
    if (!await ctx.confirm(`给 ${roles.length} 个角色挑音色？`, '每个角色会调用一两次文字模型。')) return;
    let done = 0, failed = '';
    for (const r of roles) {
      ctx.notify(`正在挑「${r.name}」（${done + 1}/${roles.length}）`);
      try { await api.autoPickVoice(r.name); done++; } catch (error) { failed = error.message; }
    }
    listDrawn = ''; render();
    ctx.notify(failed ? `挑好了 ${done} 个，有的没挑成：${failed}` : `挑好了 ${done} 个`, failed ? {error: true} : undefined);
  }
  /** 自动挑音色: the switch, and the 音色收藏夹 it picks from first. */
  function autoGroup() {
    const state = api.getState(), on = state.general.autoVoice === true, pool = state.voicePool || [];
    return `<div class="group">${toggle('autoVoice', '自动挑音色', on, '大世界卡里角色多，可以打开这个：新角色第一次说话时，文字模型按 TA 在正文里的样子（角色卡、说过的话、剧情里的描写）挑一个音色填上，标「自动挑的」，不满意随时换或重新挑。\n\n先从「音色收藏夹」里挑（标好男女、年龄的更容易挑中）；收藏夹里没有对得上的，再去引擎的音色库里搜（Fish 用公开音色库，MiniMax 用系统音色，ElevenLabs 用你账号里的音色）。挑一次会调用一两次文字模型。')}
      <button class="list-row" data-action="voice-pool"><span><strong>音色收藏夹</strong><small>${pool.length ? `${pool.length} 个音色 · 角色页填音色时可以直接选` : '还是空的：在「从列表选」里点 ♡，或在收藏夹里手动添加'}</small></span>${icon('next')}</button></div>`;
  }

  function renderEditor() {
    listDrawn = '';
    swipe?.dispose(); swipe = null;
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
        <div class="group pad">${field('角色名称', input('name', r.name, 'text', 'placeholder="与台词里的说话者一致"'))}
          ${field('别名', input('aliases', Array.isArray(r.aliases) ? r.aliases.join('、') : r.aliases || '', 'text', 'placeholder="正文里的其他叫法，用逗号隔开"'), '正文里有时写全名、有时只写名或姓，比如「夏尔」和「夏尔·凡多姆海恩」：把其他叫法填在这里，都用这个角色的音色，不会再多出一个角色。全名里带「·」的会自动认出来。')}
          ${api.getState().roleGroups.length ? field('分组', select('group', r.group || '', [['', '不分组'], ...api.getState().roleGroups.map(g => [g.id, g.name])])) : ''}</div>
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
            : field(mimo === 'clone' ? '克隆样本' : r.engine === 'custom' ? '音色' : '音色 ID', input('voice', r.voice, 'text', `placeholder="${mimo === 'clone' ? '填克隆样本的名字，或从列表选择' : r.engine === 'custom' ? '「自己的接口」里音色的名字，或从列表选择' : '粘贴音色 ID 或从列表选择'}" autocomplete="off"`))}
        </div>
        <details data-group="role-model"><summary>模型和台词语言<small class="fold-note">${esc((r.model || '跟随引擎') + ' · ' + (r.language ? languageName(r.language) : '跟随默认'))}</small></summary><div class="fold-body">
          ${field('模型', select('model', r.model || '', [['', '跟随引擎 · ' + c.model], ...schema.models.map(m => [m.id, m.id, !m.supported])]))}
          ${languageField('language', r.language || '', true, typedLanguages(api.getState()))}
        </div></details>
        <details data-group="role-persona"><summary>角色资料<small class="fold-note">${r.persona?.trim() ? r.persona.trim().length + ' 字' : '没写（读角色卡）'}</small></summary><div class="fold-body">${field('角色资料', textArea('persona', r.persona || '', 'rows="4" maxlength="4000" placeholder="例如：Hina，17 岁，学生会会长，嘴硬心软，和小春是青梅竹马"'), '聊天、论坛、朋友圈、查手机和电话写这个人时用的资料：身份、性格、说话方式、和谁是什么关系。\n\n酒馆里有这个人的角色卡时，不写也会读角色卡；写了就用这里的。没出场过、也没有角色卡的人（比如只在别的卡里出现的），在这里写几句，模型就不用凭空猜了。世界书照常按名字去找，最近的剧情也一直会带上。')}</div></details>
        <details data-group="role-look"><summary>外貌 tag<small class="fold-note">${esc(r.appearance?.trim() ? r.appearance.trim().slice(0, 24) : '没写')}${r.negative?.trim() ? ' · 有固定负面' : ''}</small></summary><div class="fold-body">${field('外貌 tag', textArea('appearance', r.appearance || '', 'class="code" rows="3" placeholder="例如 1girl, long silver hair, blue eyes, slender"'), '这个角色入画时会自动补上这些 tag，让长相保持一致。写英文 danbooru tag，逗号分隔，只写不会变的特征：1girl 或 1boy、发型发色、瞳色、体型、显眼的特征；衣服、表情、动作让模型按剧情写。已有作品里的角色，把识别 tag 放最前，比如 hatsune miku (vocaloid)。\n\n新角色第一次入画时，模型写的外貌会自动填到这里，可以随时改。')}
          ${field('固定负面', textArea('negative', r.negative || '', 'class="code" rows="2" maxlength="1000" placeholder="例如 glasses, short hair, freckles"'), '这个角色每次入画都不要出现的 tag，写总被画错的地方。\n\nNovelAI V4 以后这是这个人自己的负面；V3 和 ComfyUI 没有分人的负面，会合进整张图的。多人同框时，性别和人数类的词会自动去掉，不然会把别人也压掉。GPT 生图不读负面。')}
          <div class="actions role-try">${btn('role-try', icon('paint') + '试画一张', 'secondary')}${help('用现在写的外貌和负面、在用的画风画一张半身像，看看对不对，不用先保存。图也会存进相册。要扣 Anlas 或花钱时会先问。')}</div>
          ${tried && tried.id === (r.id || 'new') ? `<div class="role-tried"><img src="${esc(tried.url)}" alt="试画的图"></div>` : ''}</div></details>
        <div class="savebar" data-engine="${r.engine}"><span class="save-state" data-save-state>草稿</span>${btn('audition', icon('play', true) + '试听', 'secondary')}${btn('save-role', '保存', 'primary')}</div>
        ${pending ? `<div class="actions" data-engine="${r.engine}">${btn('continue-role', '保存并继续朗读', 'primary')}</div>` : ''}
        ${r.id ? `<div class="actions">${btn('delete-role', icon('trash') + '删除角色配音', 'text-button danger-text')}</div>` : ''}`);
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
    // Each voice: a tap edits it; swiped left 改 / 删除; swiped right picked, to export or delete several.
    const draw = () => { const pool = favorites(); return pool.length
      ? `<div class="group" data-pool-list>${pool.map((v, i) => swipeRow(String(i), `<div class="list-row" data-engine="${v.engine}"><span style="flex:none">${plate(engines[v.engine])}</span><span style="flex:1;min-width:0"><strong>${esc(v.name)}</strong><small>${esc(poolLine({...v, name: ''}) || '没有备注')}</small><small class="mono">${esc(v.voice)}</small></span>${icon('next')}</div>`,
        [{key: 'edit', label: '改', icon: 'edit'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}], {label: v.name})).join('')}</div>`
      : '<p class="hint">还没有音色。在角色页「从列表选」里点 ♡ 收藏，或点右上角的「＋」填音色 ID。</p>'; };
    const d = ctx.dialog('音色收藏夹', `<div class="row-heading fav-heading"><span>收藏的音色 ${help('收藏用得上的音色，名字和备注随便写。角色页填音色时点「从收藏夹选」；自动挑音色也先从这里挑（标了性别和年龄的更容易挑中）。\n\n可以导入别人分享的音色文件（ST-iPhonie 导出的，或 FishDialogue 的音色库 JSON）。文件里没写男女和年龄的，按名字和描述猜（少女、大叔、妈妈……），猜不出就留空。')}</span><span class="fav-tools"><label class="chip-button file-button">${icon('import')}导入<input type="file" data-pool-file accept=".json,application/json" aria-label="选择音色收藏文件"></label>${btn('pool-export', icon('download') + '导出', 'chip-button')}</span></div>
      <div data-pool>${draw()}</div>`, {add: '添加音色'});
    let swipe = null;
    const exportVoices = pool => {
      if (!pool.length) { ctx.notify('收藏夹还是空的'); return Promise.resolve(); }
      return saveFile(ctx.doc, new Blob([poolFile(pool)], {type: 'application/json'}), '音色收藏夹.json').then(name => ctx.notify('已下载 ' + name));
    };
    const dropVoices = async indexes => {
      if (!await ctx.confirm(indexes.length > 1 ? `删除这 ${indexes.length} 个音色？` : '删除这个音色？', '只是从收藏夹拿掉，用着它的角色不受影响。')) return;
      const gone = new Set(indexes);
      api.saveVoicePool((api.getState().voicePool || []).filter((_, i) => !gone.has(i)));
      if (!current) render();
      poolSheet();
    };
    const mount = () => {
      swipe?.dispose(); swipe = null;
      const list = d.body.querySelector('[data-pool-list]');
      if (!list) return;
      swipe = mountSwipeList(list, {ctx,
        onTap: id => { const index = Number(id); favoriteForm(favorites()[index], {index, done: () => { if (!current) render(); poolSheet(); }}); },
        onAction: (key, id) => {
          const index = Number(id);
          if (key === 'edit') favoriteForm(favorites()[index], {index, done: () => { if (!current) render(); poolSheet(); }});
          else if (key === 'delete') dropVoices([index]).catch(error => ctx.notify(error.message, {error: true}));
        },
        bulk: [{key: 'export', label: '导出', icon: 'download'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}],
        onBulk: (key, ids) => { const indexes = ids.map(Number); return key === 'export' ? exportVoices(indexes.map(i => (api.getState().voicePool || [])[i]).filter(Boolean)) : dropVoices(indexes); }});
    };
    mount();
    d.onClose(() => swipe?.dispose());
    d.overlay.addEventListener('click', e => { if (e.target.closest('[data-sheet-add]')) favoriteForm({engine: current?.engine || 'fish', voice: ''}, {done: () => { if (!current) render(); poolSheet(); }}); });
    const redraw = () => { if (!d.live) return; d.body.querySelector('[data-pool]').innerHTML = draw(); mount(); if (!current) render(); };
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
        exportVoices(api.getState().voicePool || []).catch(error => ctx.notify(error.message, {error: true}));
      }
    });
  }

  function edit(id) {
    if (!current) listScroll = v.root.scrollTop;
    const saved = api.getState().routes.find(r => r.id === id);
    if (!saved) { ctx.notify('角色已不存在'); return; }
    current = drafts.get(id) || structuredClone(saved);
    drafts.set(id, current);
    render();
    v.root.scrollTop = 0;
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
  // Back on the list where it was left.
  let listScroll = 0;
  v.back = () => { if (!current) return false; current = null; render(); v.root.scrollTop = listScroll; showPlaying(); return true; };
  v.refresh = () => { if (!current) { render(); showPlaying(); } };

  v.on('input', '[data-role-search]', el => { query = el.value; swipe?.done(); paintRows(); });
  const dispose = v.dispose;
  v.dispose = () => { swipe?.dispose(); swipe = null; if (tried) ctx.win.URL.revokeObjectURL(tried.url); dispose(); };
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
      case 'role-filter': filter = filter === el.dataset.key ? '' : el.dataset.key; swipe?.done(); for (const b of v.root.querySelectorAll('[data-action=role-filter]')) b.setAttribute('aria-pressed', String(b.dataset.key === filter)); paintRows(); break;
      case 'role-try': await tryLook(el); break;
      case 'edit-role': edit(el.dataset.id); break;
      case 'route-engine':
        current = api.switchRouteEngine(current, el.dataset.engine);
        drafts.set(current.id || 'new', current);
        render();
        changed();
        break;
      case 'save-role':
      case 'continue-role': {
        // An 别名 that is another role's name: that role was this one all along, so it can be merged in.
        const aliases = api.cleanAliases(current.aliases, current.name);
        const twins = api.getState().routes.filter(x => x.id !== current.id && aliases.includes(x.name));
        if (twins.length && await ctx.confirm(`把「${twins.map(x => x.name).join('」「')}」合并进来？`, `${twins.length > 1 ? '这些名字' : '这个名字'}现在是单独的角色。合并后删掉${twins.length > 1 ? '它们' : '它'}，以后都用「${current.name.trim()}」的音色。`)) {
          // Its cards too (分区); a role that is everyone's stays so.
          if (current.cards?.length) current.cards = twins.some(x => !x.cards?.length) ? [] : [...new Set([...current.cards, ...twins.flatMap(x => x.cards)])];
          for (const x of twins) { api.deleteRoute(x.id); drafts.delete(x.id); }
        }
        const previous = current.id || 'new';
        current = api.saveRoute(current);
        if (tried?.id === previous) tried.id = current.id;
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

  /** 试画一张: this look as it stands, on the 画风 in use. */
  let tried = null;
  async function tryLook(el) {
    if (!current.appearance?.trim()) { ctx.notify('先写外貌 tag'); return; }
    if (!api.drawReady()) { ctx.notify(api.drawMissing(), {error: true}); return; }
    const input = lookTest(api.getState(), current), ask = api.paidPrompt(), paid = api.drawQuote(input.params).free === false, name = current.name?.trim() || '新角色', id = current.id || 'new';
    if (paid && !await ctx.confirm(ask.title, ask.text)) return;
    const label = el.innerHTML;
    await v.busy(el, async () => {
      el.textContent = '正在画…';
      try {
        const made = await api.generateImage({...input, allowPaid: paid, name: '试画-' + name, label: `试画 · ${name}`}), photo = await api.getPhoto(made.photoId);
        if (!photo?.blob) return;
        if (tried) ctx.win.URL.revokeObjectURL(tried.url);
        tried = {id, url: ctx.win.URL.createObjectURL(photo.blob)};
        if (current && (current.id || 'new') === id) { render(); changed(); }
      } finally { el.innerHTML = label; }
    });
  }

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
  showPlaying();
  return v;
}
