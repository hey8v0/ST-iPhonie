import {createView, esc, btn, field, input, select, textArea, toggle, heading, help, groupTitle, plate, empty} from './common.js';
import {icon, glyph} from './icons.js';
import {APPS} from './apps.js';

const positions = [['in_chat', '聊天内'], ['before_prompt', '主提示词之前'], ['in_prompt', '主提示词之后']];
const roles = [['system', '系统'], ['user', '用户'], ['assistant', '助手']];
// Preset kinds: voice (dialogue tags), chat (phone chat replies, 朋友圈, and bringing chats into the story), drawing
// (<img> tags in the chat text). A chat rule says where it is used: 私聊, 群聊, 朋友圈.
const KINDS = [['tts', '配音', 'listen'], ['chat', '聊天', 'chat'], ['draw', '绘图', 'draw']];
const USES = [['dm', '私聊'], ['group', '群聊'], ['moments', '朋友圈'], ['call', '电话'], ['forum', '论坛'], ['peek', '查手机']];
// Drawing rules: which engines an entry is sent with (none ticked or all ticked: every engine).
const ENGINE_USES = [['nai', 'NovelAI'], ['gpt', 'GPT 生图'], ['comfy', 'ComfyUI']];
const engineScope = e => e.engines?.length ? ' · 只给 ' + ENGINE_USES.filter(([k]) => e.engines.includes(k)).map(([, l]) => l).join('、') : '';

export function presetsApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'presets'), drafts = new Map();
  let current = null, currentKind = 'tts', kind = 'tts';
  const mark = () => { const el = v.root.querySelector('[data-save-state]'); if (el) el.textContent = '未保存'; };
  /** A fresh copy of the shipped preset of a kind: new entry ids, no preset id. */
  const shipped = k => {
    const base = structuredClone(k === 'chat' ? api.defaultChatPreset : k === 'draw' ? api.defaultDrawPreset : api.defaultVoicePreset);
    base.entries = base.entries.map(e => ({...e, id: e.id && k !== 'tts' ? e.id : crypto.randomUUID()}));
    return base;
  };
  const tile = app => { const [t1, t2, tac] = APPS[app].colors; return `<span class="mini-tile" style="--t1:${t1};--t2:${t2};--tac:${tac}">${glyph(app)}</span>`; };
  // Operations differ only in which backend list they touch.
  const ops = k => k === 'draw'
    ? {list: () => api.getState().draw.presets, active: () => api.getState().draw.activePreset, save: p => api.saveDrawPreset(p), remove: id => api.deleteDrawPreset(id), use: id => api.saveDraw({activePreset: id}), preview: p => api.previewDrawPrompt(p), validate: () => ''}
    : k === 'chat'
    ? {list: () => api.getState().chat.presets, active: () => api.getState().chat.activePreset, save: p => api.saveChatPreset(p), remove: id => api.deleteChatPreset(id), use: id => api.selectChatPreset(id), preview: p => api.previewChatPrompt(p), validate: p => api.validateChatPreset(p)}
    : {list: () => api.getState().presets, active: () => api.getState().activePreset, save: p => api.savePreset(p), remove: id => api.deletePreset(id), use: id => api.selectPreset(id), preview: p => api.previewPrompt({...p, id: p.id || 'preview'}), validate: p => api.validatePreset(p)};

  function injection(i, index = 'preset') {
    const attrs = `data-injection-owner="${index}"`;
    const inChat = i.position === 'in_chat';
    return field('插入位置', select('position', i.position, positions, attrs))
      + field('深度', input('depth', i.depth, 'number', `${attrs} min="0" max="10000" step="1" ${inChat ? '' : 'disabled'}`))
      + field('身份', select('role', i.role, roles, `${attrs} ${inChat ? '' : 'disabled'}`));
  }

  function renderList() {
    const [, label, app] = KINDS.find(k => k[0] === kind);
    const tabs = `<div class="segmented">${KINDS.map(([k, l]) => `<button data-action="kind" data-kind="${k}" aria-pressed="${k === kind}">${l}</button>`).join('')}</div>`;
    let body;
    {
      const o = ops(kind), active = o.active();
      const draw = api.getState().draw;
      body = (kind === 'draw' && !draw.enabled ? '<p class="hint">正文出图没有开启，在「设置 · 绘图」里打开后，使用中的绘图预设才会加进聊天请求。</p>' : '')
        + o.list().map(p => `<button class="preset-card" data-action="edit-preset" data-kind="${kind}" data-id="${esc(p.id)}"${p.id === active ? ' data-active' : ''}>${tile(app)}<span><strong>${esc(p.name || '未命名预设')}</strong><small>${kind === 'chat' ? `读正文 ${p.context} 条 · 聊天记录 ${p.history} 条` : kind === 'draw' ? `每条回复 ${p.count} 张 · ${p.entries.length} 条规则` : `${p.entries.length} 条规则 · ${esc(positions.find(x => x[0] === p.injection.position)?.[1] || '')}`}</small></span>${p.id === active ? plate('使用中') : icon('next')}</button>`).join('')
        + `<div class="actions">${btn('restore-default', icon('refresh') + '恢复默认预设', 'secondary')}</div>`
        + `<p class="hint">${kind === 'draw'
          ? '绘图预设是给正文模型看的出图规则：什么时候出图、标签怎么写。画师串和固定 tag 在绘图 App 的“画风”里。'
          : kind === 'chat'
          ? '聊天预设决定手机里的联系人怎么回消息、朋友圈怎么发、能看到多少剧情，以及“带进剧情”时怎么写进下一次正文。每条规则可以选用在私聊、群聊还是朋友圈。手机聊天和朋友圈单独生成，不会写进正文。'
          : '配音预设让模型把台词写成带 TTS 标签的格式。角色配音不在预设里，切换预设不会改动角色。'}</p>`;
    }
    v.draw(heading('预设', btn('add-preset', icon('add'), 'round-button', `aria-label="新增${label}预设"`), 'Preset · 3 类') + tabs + body);
  }

  /** The 世界书 line: how much is left out (picked in a sheet), and the tags cleaned away (status bars). */
  function loreFields(p) {
    const books = (p.loreSkipBooks || []).length, entries = (p.loreSkipEntries || []).length;
    return `<div class="setting-row"><span class="row-text"><strong>手机读哪些世界书</strong><small>${books || entries ? `不读 ${books} 本、${entries} 条` : '现在开着的都读'}</small></span>${btn('lore-pick', '选择', 'chip-button')}</div>
      ${field('清洗标签', input('cleanTags', Array.isArray(p.cleanTags) ? p.cleanTags.join(', ') : String(p.cleanTags ?? ''), 'text', 'placeholder="比如 status, 状态栏" autocomplete="off"'), '写标签名，逗号隔开。世界书里用这些标签包住的内容（比如 <status>…</status>）不给手机，手机回复里要是写了也会去掉。')}`;
  }
  /** A sheet listing the books turned on now and their entries: switch one off and the phone leaves it out. */
  async function pickLore() {
    const d = ctx.dialog('手机读哪些世界书', '<p class="hint">正在读取世界书……</p>');
    let books = [];
    try { books = await api.loreBooks?.() || []; } catch (error) { d.body.innerHTML = `<p class="hint error-copy">${esc(error.message)}</p>`; return; }
    if (!d.live) return;
    const skipBooks = new Set(current.loreSkipBooks || []), skipEntries = new Set(current.loreSkipEntries || []);
    let query = '';
    const hit = (...texts) => !query || texts.some(t => String(t || '').toLowerCase().includes(query));
    const paint = () => {
      const keep = d.body.querySelector('[data-lore-list]')?.scrollTop || 0;
      const rows = books.map(b => {
        const off = skipBooks.has(b.name), shown = b.entries.filter(e => hit(e.title, e.keys.join(' '), e.preview, b.name));
        if (query && !shown.length && !hit(b.name)) return '';
        const left = b.entries.filter(e => skipEntries.has(e.id)).length;
        return `<details class="lore-book${off ? ' off' : ''}" ${query ? 'open' : ''}><summary><span class="row-text"><strong>${esc(b.name)}</strong><small>${esc(b.from.join(' · '))} · ${b.entries.length} 条${left ? `，不读 ${left} 条` : ''}</small></span>
            <input class="switch" type="checkbox" data-lore-book="${esc(b.name)}" ${off ? '' : 'checked'} aria-label="读「${esc(b.name)}」"></summary>
          <div>${shown.map(e => `<label class="lore-entry${skipEntries.has(e.id) ? ' off' : ''}"><span class="row-text"><strong>${esc(e.title)}</strong><small>${e.constant ? '常驻' : e.keys.length ? '关键词：' + esc(e.keys.join('、')) : '没有关键词'}${e.preview ? ' · ' + esc(e.preview) : ''}</small></span>
            <input class="switch" type="checkbox" data-lore-entry="${esc(e.id)}" ${skipEntries.has(e.id) ? '' : 'checked'} ${off ? 'disabled' : ''} aria-label="读「${esc(e.title)}」"></label>`).join('') || '<p class="hint">这本书没有启用的条目。</p>'}</div></details>`;
      }).join('');
      d.body.querySelector('[data-lore-list]').innerHTML = rows || `<p class="hint">${query ? '没有搜到。' : '现在没有开着的世界书。'}</p>`;
      d.body.querySelector('[data-lore-list]').scrollTop = keep;
    };
    d.body.innerHTML = `<div class="vibe-search">${icon('search')}<input type="search" data-lore-search placeholder="搜索书名、条目标题、关键词" aria-label="搜索世界书"></div>
      <p class="hint" style="padding:6px 2px">列出的是现在开着的世界书（全局、角色卡、聊天、人设绑定的）和里面启用的条目。关掉的手机就不读，正文照常用。改完点「保存预设」才生效。</p>
      <div class="lore-list" data-lore-list></div>`;
    paint();
    d.body.addEventListener('input', e => { if (e.target.matches('[data-lore-search]')) { query = e.target.value.trim().toLowerCase(); paint(); } });
    d.body.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.loreBook !== undefined) { if (el.checked) skipBooks.delete(el.dataset.loreBook); else skipBooks.add(el.dataset.loreBook); }
      else if (el.dataset.loreEntry !== undefined) { if (el.checked) skipEntries.delete(el.dataset.loreEntry); else skipEntries.add(el.dataset.loreEntry); }
      else return;
      current.loreSkipBooks = [...skipBooks]; current.loreSkipEntries = [...skipEntries]; mark();
      const open = [...d.body.querySelectorAll('details.lore-book')].map(x => x.open);
      paint();
      d.body.querySelectorAll('details.lore-book').forEach((x, i) => { if (open[i]) x.open = true; });
    });
    // A click on the switch inside a summary must not also open or close the book.
    d.body.addEventListener('click', e => { if (e.target.matches('summary .switch')) e.stopPropagation(); }, true);
    d.onClose(() => render());
  }
  /** 记忆 of the phone chats (core/memory.js): the switch and how it is written up and searched. */
  function memoryFields(p) {
    const m = p.memory || {}, on = m.enabled !== false;
    const num = (key, label, value, min, max, note) => field(label, input('memory.' + key, value, 'number', `min="${min}" max="${max}" step="1"`), note);
    return `<details data-group="preset-memory"><summary>记忆 ${help('聊得久了，最近几十条之外的消息模型就看不到了。打开记忆后，更早的消息会自动整理成摘要，摘要多了再合成阶段总结、长期总览（每整理一次调用一次文字模型）；回消息、打电话、查手机和朋友圈都会带上。每段聊天的记忆在右上角菜单 → 记忆 里看和改。')}</summary><div class="group pad">
      ${toggle('memory.enabled', '记住更早的聊天', on)}
      ${on ? num('batch', '每次整理多少条', m.batch ?? 40, 10, 200, '「读取聊天记录」那么多条之外的消息，攒够这么多条整理成一段聊天摘要。')
        + num('stage', '几段摘要合成一份阶段总结', m.stage ?? 5, 2, 20, '')
        + num('epic', '几份总结再合成长期总览', m.epic ?? 4, 2, 20, '长期总览也会继续往上合，记忆再长也不会越带越多。')
        + num('recall', '每次想起几段旧聊天', m.recall ?? 3, 0, 10, '按最近几句话，从更早的原话里找出最相关的几段一起带上（0 不找）。默认在本地找，不花钱；在「引擎 → 向量模型」里填了 Embedding 接口后按意思找，更准。')
        + toggle('memory.story', '正文也带上手机里的事', m.story === true, '写正文时，把你和当前角色卡里的角色在手机上聊过的事（记忆和最近 10 条聊天）告诉模型，插在「带进剧情」的位置。会多占一些正文的上下文。') : ''}
      ${storyFields(m)}
    </div></details>`;
  }
  /**
   * 剧情记忆来源: other plugins' story memory (剧情剪辑台, the tavern's 总结, or any that puts it into the tavern's
   * extension prompts) read into the phone's requests as 更早的剧情. The ones there now are listed to pick from.
   */
  function storyFields(m) {
    const keys = m.storyKeys || [], list = storyList;
    const rows = list ? (list.length ? list.map(x => `<label class="story-source"><span><b>${esc(x.name || x.key)}</b>${x.name ? `<small class="mono">${esc(x.key)}</small>` : ''}<small>${x.chars ? `${x.chars} 字 · ${esc(x.preview)}${x.chars > 90 ? '…' : ''}` : '现在是空的'}</small></span><input type="checkbox" class="switch" data-story-key="${esc(x.key)}" aria-label="读 ${esc(x.name || x.key)}" ${keys.includes(x.key) ? 'checked' : ''}></label>`).join('')
      : '<p class="hint">酒馆现在没有注入任何扩展提示词。记忆插件一般在聊过几轮、或者生成过一次后才会有内容。</p>') : '';
    return `<div class="story-field"><span>剧情记忆来源${help('小手机只看最近几条正文。装了记忆插件（剧情剪辑台、酒馆自带的总结，或者别的把整理好的剧情注入给模型的插件）的话，勾上它注入的那一项，聊天、电话、查手机、朋友圈和论坛就会多带一段「更早的剧情」，记得很久以前的事。\n\n点「读取」列出酒馆现在注入的内容，看开头就知道是哪个插件的。剧情剪辑台和酒馆总结默认就勾着。把记忆写进世界书的插件不用勾，小手机本来就读世界书。')}</span>
      <small class="hint" style="margin:0">${keys.length ? '在读：' + keys.map(k => esc(storyName(k))).join('、') : '没有在读'}</small>
      ${api.storySources ? `<div class="actions" style="margin:6px 0 0">${btn('story-sources', icon('refresh') + (list ? '重新读取' : '读取当前注入的内容'), 'secondary')}</div>` : ''}
      ${list ? `<div class="story-sources">${rows}</div>` : ''}</div>`;
  }
  const storyName = key => storyList?.find(x => x.key === key)?.name || ({bakemono_memory: '剧情剪辑台', '1_memory': '酒馆总结'})[key] || key;
  let storyList = null;
  function renderEditor() {
    const p = current, o = ops(currentKind), draw = currentKind === 'draw', chat = currentKind === 'chat';
    const used = p.id && p.id === o.active();
    v.draw(heading(p.id ? '编辑预设' : '新预设', '', draw ? 'Drawing Preset' : chat ? 'Chat Preset' : 'Voice Preset')
      + `<div class="group pad">${field('名称', input('name', p.name))}${chat
        ? `${field('读取最近的正文', input('context', p.context, 'number', 'min="0" max="100" step="1"'), '回消息时参考最近几条正文，0 表示不看剧情。')}${field('读取聊天记录', input('history', p.history, 'number', 'min="2" max="500" step="1"'), '回消息时带上最近多少条手机聊天。')}
          ${field('每条正文最多（字）', input('storyEach', p.storyEach ?? 4000, 'number', 'min="0" step="500"'), '一条正文太长时只取前面这么多字。0 表示不限制。中文大约一个字一个 token。')}${field('正文一共最多（字）', input('storyTotal', p.storyTotal ?? 20000, 'number', 'min="0" step="1000"'), '最近的正文优先，加起来超过这么多字就不再往前读。0 表示不限制。')}
          ${field('世界书最多（字）', input('loreMax', p.loreMax ?? 30000, 'number', 'min="0" step="1000"'), '手机读世界书时最多放这么多字，只放整条。0 表示插件不另外限制，只按酒馆「世界书」设置里的预算（占上下文的百分比）来。手机的每次请求（聊天、朋友圈、论坛、查手机、电话）都会带上世界书，放得越多越费 token，也越慢。')}${field('每次刷新朋友圈最多几条', input('posts', p.posts ?? 2, 'number', 'min="1" max="5" step="1"'), '在动态里刷新时，由模型挑 1 到这么多个人发动态。')}${toggle('lore', '带上世界书', p.lore !== false, '聊天、电话和朋友圈也带上酒馆的世界书：和写正文时一样，常驻的条目，以及在名字、最近的正文和聊天里触发关键词的条目（当前角色卡的世界书、全局和聊天绑定的世界书都算）。人设写在世界书里的话要打开。\n\n条目多的话会多占一些上下文。')}${p.lore !== false ? loreFields(p) : ''}${field('带进剧情的写法', textArea('bring', p.bring, 'class="code" rows="4"'), '选中的聊天消息会按这段文字注入下一次正文，只用一次。需要包含 {{聊天记录}}；也可以用 {{用户}}、{{对象}}。')}`
        : draw
        ? `${field('每条回复出图数量', input('count', p.count ?? 1, 'number', `min="1" max="${api.drawCountMax}" step="1"`), '每条回复固定出这么多张图。规则里写 {{出图数量}} 会换成这个数字；插件还会在规则最后加一段硬性要求，让张数更稳定。张数越多，出图越久。')}<div class="field"><span>出图块格式${help('规则里写 {{出图格式}} 会换成下面这段（回复后单独配图时，还会多一行「位置」）；{{角色列表}} 会换成已登记的角色和他们的固定外貌；{{出图数量}} 换成张数。别的插件要排除出图内容时，排除标签填 <img></img>。')}</span><pre class="code-preview" style="margin:0">${esc(api.picTagFormat)}</pre></div>`
        : field('台词格式', textArea('format', p.format, 'class="code"'), '{译文}、{角色}、{情绪}、{文本} 各保留一次。译文供阅读，原语言供语音生成。默认格式是成对的 <tts></tts>，别的插件要排除语音原文时，排除标签填 <tts></tts>。\n\n这里的格式只管正文；手机里的语音消息和电话固定用默认格式，不跟着改。')}</div>
        ${chat ? memoryFields(p) : ''}
        <details data-group="preset-injection"><summary>${chat ? '带进剧情的插入位置' : '默认插入设置'} ${help(chat ? '带进剧情的文字插在正文请求的哪里。深度与身份仅在聊天内插入时生效。' : '深度与身份仅在聊天内插入时生效；条目可以单独覆盖。')}</summary><div>${injection(p.injection)}</div></details>
        ${groupTitle(draw ? '出图规则' : chat ? '聊天与朋友圈规则' : '提示词条目', btn('add-entry', icon('add') + '条目', 'chip-button'))}
        ${p.entries.map((e, i) => `<details data-group="entry:${esc(e.id)}" ${i === 0 ? 'open' : ''}><summary>${esc(e.title || '未命名条目')}${draw ? esc(engineScope(e)) : ''}${e.enabled ? '' : ' · 已停用'}</summary><div data-entry="${i}">
          ${toggle('enabled', '启用此条目', e.enabled)}
          ${field('条目名称', input('title', e.title))}
          ${draw ? `<div class="field"><span>用在哪个引擎${help('勾了哪个，用那个引擎画图时才把这条规则发给模型。都勾或都不勾就是三个都用。在绘图 App 顶上选用哪个画。')}</span><div class="use-row">${ENGINE_USES.map(([u, l]) => `<label class="use-chip"><input type="checkbox" data-engine-use="${u}" ${!e.engines?.length || e.engines.includes(u) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>` : ''}
          ${chat ? `<div class="field"><span>用在</span><div class="use-row">${USES.map(([u, l]) => `<label class="use-chip"><input type="checkbox" data-use="${u}" ${(e.use || []).includes(u) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>` : ''}${field(draw || chat ? '规则' : '提示词', textArea('text', e.text, 'class="code"'), draw ? '可以用 {{出图格式}}、{{出图数量}}、{{角色列表}}。插件会在最后自动加上格式和张数的硬性要求。' : chat ? '可以用 {{用户}}、{{对象}}；写语音消息规则时用 {{语音格式}}（手机固定用默认的台词格式，不跟配音预设走）、{{可发语音}}。用在朋友圈的规则只能用 {{用户}}。插件会在最后自动加上输出格式的硬性要求。' : '启用规则的合计文字需包含 {{格式}} 和 {{语言}}。')}
          ${chat ? '' : toggle('customInjection', '单独设置插入位置', !!e.injection)}${!chat && e.injection ? injection(e.injection, i) : ''}
          <div class="entry-tools">${btn('entry-up', icon('up') + '上移', 'text-button', `data-index="${i}" ${i === 0 ? 'disabled' : ''}`)}${btn('entry-down', icon('down') + '下移', 'text-button', `data-index="${i}" ${i === p.entries.length - 1 ? 'disabled' : ''}`)}${btn('delete-entry', icon('trash') + '删除', 'text-button', `data-index="${i}"`)}</div>
        </div></details>`).join('')}
        <div class="actions">${btn('prompt-preview', icon('eye') + '发送预览', 'secondary')}${p.id ? btn('use-preset', used ? '正在使用' : '保存并使用', 'secondary', used ? 'disabled' : '') : ''}</div>
        <div class="savebar"><span class="save-state" data-save-state>草稿</span>${btn('save-preset', '保存预设', 'primary')}</div>
        <div class="actions">${btn('reset-content', icon('refresh') + '恢复成默认内容', 'secondary')}${p.id ? btn('delete-preset', '删除预设', 'danger') : ''}</div>`);
  }

  const render = () => current ? renderEditor() : renderList();
  function edit(k, id) {
    const key = k + ':' + id;
    current = drafts.get(key) || structuredClone(ops(k).list().find(p => p.id === id));
    if (!current) return;
    currentKind = k;
    drafts.set(key, current);
    render();
  }
  v.showKind = k => { current = null; kind = k; render(); };
  v.back = () => { if (!current) return false; current = null; render(); return true; };
  v.refresh = () => { if (!current) render(); };

  function update(el, redraw) {
    const key = el.dataset.field, index = el.closest('[data-entry]')?.dataset.entry;
    if (el.dataset.injectionOwner !== undefined) {
      const owner = el.dataset.injectionOwner === 'preset' ? current : current.entries[Number(el.dataset.injectionOwner)];
      owner.injection[key] = key === 'depth' ? Number(el.value) : el.value;
    } else if (index !== undefined) {
      const entry = current.entries[Number(index)];
      if (key === 'customInjection') { if (el.checked) entry.injection = structuredClone(current.injection); else delete entry.injection; }
      else entry[key] = el.type === 'checkbox' ? el.checked : el.value;
    } else if (key.startsWith('memory.')) { current.memory = {...current.memory}; current.memory[key.slice(7)] = el.type === 'checkbox' ? el.checked : Number(el.value); }
    else current[key] = el.type === 'checkbox' ? el.checked : el.value;
    mark();
    if (redraw) render();
  }
  v.on('input', '[data-field]', el => { if (current && el.type !== 'checkbox' && el.tagName !== 'SELECT') update(el, false); });
  v.on('change', '[data-engine-use]', el => {
    const entry = current?.entries[Number(el.closest('[data-entry]')?.dataset.entry)];
    if (!entry) return;
    const list = [...el.closest('.use-row').querySelectorAll('[data-engine-use]')].filter(x => x.checked).map(x => x.dataset.engineUse);
    if (!list.length || list.length === ENGINE_USES.length) delete entry.engines; else entry.engines = list;
    const summary = el.closest('details')?.querySelector('summary');
    if (summary) summary.textContent = (entry.title || '未命名条目') + engineScope(entry) + (entry.enabled ? '' : ' · 已停用');
    mark();
  });
  v.on('change', '[data-story-key]', el => {
    if (!current) return;
    const keys = new Set(current.memory?.storyKeys || []);
    if (el.checked) keys.add(el.dataset.storyKey); else keys.delete(el.dataset.storyKey);
    current.memory = {...current.memory, storyKeys: [...keys]};
    mark();
    const line = el.closest('.story-field')?.querySelector('small.hint');
    if (line) line.textContent = keys.size ? '在读：' + [...keys].map(storyName).join('、') : '没有在读';
  });
  v.on('change', '[data-use]', el => {
    const entry = current?.entries[Number(el.closest('[data-entry]')?.dataset.entry)];
    if (!entry) return;
    entry.use = USES.map(([u]) => u).filter(u => u === el.dataset.use ? el.checked : (entry.use || []).includes(u));
    mark();
  });
  v.on('change', '[data-field]', el => {
    if (current && (el.type === 'checkbox' || el.tagName === 'SELECT')) update(el, true);
  });
  function save() {
    const key = currentKind + ':' + (current.id || 'new');
    current = ops(currentKind).save(current);
    drafts.delete(key);
    drafts.set(currentKind + ':' + current.id, current);
    render();
    v.root.querySelector('[data-save-state]').textContent = '已保存';
    ctx.notify('预设已保存');
  }
  v.on('click', '[data-action]', async el => {
    const index = Number(el.dataset.index);
    switch (el.dataset.action) {
      case 'kind': kind = el.dataset.kind; render(); break;
      case 'add-preset':
        currentKind = kind;
        current = drafts.get(kind + ':new') || {...shipped(kind), name: kind === 'chat' ? '新聊天预设' : kind === 'draw' ? '新出图规则' : '新预设'};
        drafts.set(kind + ':new', current);
        render();
        break;
      case 'edit-preset': edit(el.dataset.kind || 'tts', el.dataset.id); break;
      // Adds the shipped preset again, for when it was deleted or edited beyond repair. Nothing else changes.
      case 'restore-default': {
        const names = ops(kind).list().map(p => p.name), base = shipped(kind);
        let name = base.name, n = 2;
        while (names.includes(name)) name = `${base.name}（${n++}）`;
        const saved = ops(kind).save({...base, name});
        ctx.notify(`已添加默认预设「${saved.name}」`);
        render();
        break;
      }
      // Puts the shipped rules, format and insertion back into this preset; its name stays. Saving makes it stick.
      case 'reset-content':
        if (await ctx.confirm('恢复成默认内容？', '这个预设的条目、格式和插入位置会换成默认的，名字不变。保存之后才生效，不保存就不会改动。')) {
          current = {...shipped(currentKind), id: current.id, name: current.name};
          drafts.set(currentKind + ':' + (current.id || 'new'), current);
          render();
          mark();
          ctx.notify('已换成默认内容，记得保存');
        }
        break;
      case 'save-preset': save(); break;
      case 'use-preset': save(); ops(currentKind).use(current.id); render(); break;
      case 'lore-pick': await pickLore(); break;
      case 'add-entry':
        current.entries.push({id: crypto.randomUUID(), title: '新条目', enabled: true, text: ''});
        render();
        v.root.querySelector('details:last-of-type').open = true;
        mark();
        break;
      case 'delete-entry': if (await ctx.confirm('删除这条规则？', '保存预设后生效。')) { current.entries.splice(index, 1); render(); mark(); } break;
      case 'entry-up':
      case 'entry-down': {
        const to = index + (el.dataset.action === 'entry-up' ? -1 : 1);
        if (to >= 0 && to < current.entries.length) { [current.entries[index], current.entries[to]] = [current.entries[to], current.entries[index]]; render(); mark(); }
        break;
      }
      case 'delete-preset':
        if (await ctx.confirm('删除这个预设？', '角色配音和画风不会被删除。')) { ops(currentKind).remove(current.id); drafts.delete(currentKind + ':' + current.id); current = null; render(); }
        break;
      case 'story-sources': {
        try { storyList = api.storySources(); } catch (error) { ctx.notify(error.message, {error: true}); break; }
        render();
        break;
      }
      case 'prompt-preview': {
        const o = ops(currentKind), error = o.validate(current);
        if (error) throw Error(error);
        ctx.dialog('发送预览', `<pre class="code-preview">${esc(o.preview(current))}</pre>`);
        break;
      }
    }
  });
  render();
  return v;
}
