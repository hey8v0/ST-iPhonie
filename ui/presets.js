import {createView, esc, btn, field, input, select, textArea, toggle, heading, help, groupTitle, plate, menu} from './common.js';
import {icon, glyph} from './icons.js';
import {APPS} from './apps.js';
import {MARK_CHOICES} from '../core/voice-fx.js';
import {CONTRACT_PROMPT, READING_PROMPT, DEFAULT_PROMPT, DEFAULT_FORMAT, FREE_FORMAT, FREE_PROMPT, FREE_CONTRACT_PROMPT} from '../core/protocol.js';
import {saveFile} from '../download.js';
import {promptRulesSheet} from './prompt-rules.js';
// The voice preset's rule entries that can go back to what ships.
const RULE_DEFAULTS = {contract: CONTRACT_PROMPT, reading: READING_PROMPT};

const positions = [['in_chat', '聊天内'], ['before_prompt', '主提示词之前'], ['in_prompt', '主提示词之后']];
const roles = [['system', '系统'], ['user', '用户'], ['assistant', '助手']];
// Preset kinds: voice (dialogue tags), chat (phone chat replies, 朋友圈, and bringing chats into the story), drawing
// (<img> tags in the chat text). A chat rule says where it is used: 私聊, 群聊, 朋友圈.
const KINDS = [['tts', '配音', 'listen'], ['chat', '聊天', 'chat'], ['draw', '绘图', 'draw']];
const USES = [['dm', '私聊'], ['group', '群聊'], ['moments', '朋友圈'], ['call', '电话'], ['forum', '论坛'], ['peek', '查手机'], ['story', '正文']];
// Drawing rules: which engines an entry is sent with (none ticked or all ticked: every engine).
const ENGINE_USES = [['nai', 'NovelAI'], ['gpt', 'GPT 生图'], ['comfy', 'ComfyUI']];
// One preset as a file (导出 / 导入): to keep, to share, or to hand to an AI to rewrite and bring back.
export const PRESET_FILE = 'st-iphonie-preset';
/**
 * A preset file read back: {kind, preset} (no id: it is saved as a new preset). A bare preset (an AI may hand back
 * just that) counts as the kind being shown. Entries are checked here; the rest is checked when it is saved.
 */
export function readPresetFile(text, shownKind) {
  let data; try { data = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch { throw Error('这个文件不是预设（不是有效的 JSON）'); }
  const wrapped = data?.format === PRESET_FILE, preset = wrapped ? data.preset : data, kind = wrapped ? data.kind : shownKind;
  if (!KINDS.some(k => k[0] === kind)) throw Error('认不出这是哪一类预设');
  if (!preset || typeof preset !== 'object' || Array.isArray(preset) || !Array.isArray(preset.entries)) throw Error('文件里没有预设的条目');
  const ids = new Set(), entries = preset.entries.filter(e => e && typeof e === 'object' && typeof e.text === 'string').map(e => {
    let id = typeof e.id === 'string' && /^[\w-]{1,64}$/.test(e.id) && !ids.has(e.id) ? e.id : crypto.randomUUID();
    ids.add(id);
    return {...e, id, title: String(e.title ?? '').slice(0, 80), enabled: e.enabled !== false};
  });
  if (!entries.length) throw Error('文件里没有预设的条目');
  const {id, ...rest} = preset;
  return {kind, preset: {...rest, name: String(rest.name || '').trim().slice(0, 60) || '导入的预设', entries}};
}

export function presetsApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'presets'), drafts = new Map();
  v.on('click', '[data-action=system-rules]', () => promptRulesSheet(ctx));
  let current = null, currentKind = 'tts', kind = 'tts';
  // Drafts changed since they were opened or saved: their bar says 未保存, also after the page is drawn again.
  const dirty = new Set(), draftKey = () => currentKind + ':' + (current?.id || 'new');
  const mark = () => { dirty.add(draftKey()); const el = v.root.querySelector('[data-save-state]'); if (el) el.textContent = '未保存'; };
  /** A fresh copy of the shipped preset of a kind: new entry ids, no preset id. */
  const shipped = k => {
    const base = structuredClone(k === 'chat' ? api.defaultChatPreset : k === 'draw' ? api.defaultDrawPreset : api.defaultVoicePreset);
    // The voice preset's built-in entries keep their ids (the rules and 心声和电话 are known by them); others get new ones.
    base.entries = base.entries.map(e => ({...e, id: e.id && (k !== 'tts' || ['dialogue', 'reading', 'contract', 'effects'].includes(e.id)) ? e.id : crypto.randomUUID()}));
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
      body = (kind === 'draw' && !draw.enabled ? '<p class="hint">正文出图没有开启，在「设置 → 正文 → 正文出图」里打开后，使用中的绘图预设才会加进聊天请求。</p>' : '')
        + o.list().map(p => `<button class="preset-card" data-action="edit-preset" data-kind="${kind}" data-id="${esc(p.id)}"${p.id === active ? ' data-active' : ''}>${tile(app)}<span><strong>${esc(p.name || '未命名预设')}</strong><small>${kind === 'chat' ? `读正文 ${p.context} 条 · 聊天记录 ${p.history} 条` : kind === 'draw' ? `每条回复 ${p.count} 张 · ${p.entries.length} 条规则` : `${p.entries.length} 条规则 · ${esc(positions.find(x => x[0] === p.injection.position)?.[1] || '')}`}</small></span>${p.id === active ? plate('使用中') : icon('next')}</button>`).join('')
        + `<div class="actions">${btn('restore-default', icon('refresh') + '加回默认预设', 'text-button')}${help(kind === 'draw'
          ? '绘图预设是给正文模型看的出图规则：什么时候出图、标签怎么写。画师串和固定 tag 在绘图 App 的“画风”里。'
          : kind === 'chat'
          ? '聊天预设决定手机里的联系人怎么回消息、朋友圈怎么发、能看到多少剧情，以及“带进剧情”时怎么写进下一次正文。每条规则可以选用在私聊、群聊还是朋友圈。手机聊天和朋友圈单独生成，不会写进正文。'
          : '配音预设让模型把台词写成带 TTS 标签的格式。角色配音不在预设里，切换预设不会改动角色。')}</div>`;
    }
    v.draw(heading('预设', btn('add-menu', icon('add'), 'round-button', `aria-label="新增${label}预设"`), 'Preset · 3 类') + tabs + `<button class="list-row" data-action="system-rules">${icon('sliders')}<span><strong>系统提示词</strong><small>输出格式、附加规则与请求模板</small></span>${icon('next')}</button>` + body);
  }

  /** What the phone reads of the 世界书, in a few words: left out, and books it alone reads (0.9.37). */
  const loreLine = p => {
    const books = (p.loreSkipBooks || []).length, entries = (p.loreSkipEntries || []).length, extra = (p.loreExtraBooks || []).length;
    return [books || entries ? `不读 ${books} 本、${entries} 条` : '', extra ? `只给手机 ${extra} 本` : ''].filter(Boolean).join(' · ') || '按触发条件读取';
  };
  /** The 世界书 line: how much is left out (picked in a sheet), and the tags cleaned away (status bars). */
  function loreFields(p) {
    return `${p.storyMode === 'exact' ? '<p class="hint" data-keep-hint>正文选了「照正文原样」：正文触发的世界书已经在那一份里，这里只另读「只给手机」的书，不会重复。</p>' : ''}<div class="setting-row"><span class="row-text"><strong>手机读哪些世界书</strong><small>${esc(loreLine(p))}</small></span>${btn('lore-pick', '选择', 'chip-button')}</div>
      `;
  }
  /** A sheet listing the books turned on now and their entries: switch one off and the phone leaves it out. */
  async function pickLore() {
    const d = ctx.dialog('手机读哪些世界书', '<p class="hint">正在读取世界书……</p>');
    let books = [];
    const read = async () => { books = await api.loreBooks?.({extra: current.loreExtraBooks || []}) || []; };
    try { await read(); } catch (error) { d.body.innerHTML = `<p class="hint error-copy">${esc(error.message)}</p>`; return; }
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
      const extra = current.loreExtraBooks || [];
      d.body.querySelector('[data-lore-extra-line]').textContent = extra.length ? extra.join('、') : '酒馆里没开的书，挂上就只有手机读，正文读不到';
    };
    d.body.innerHTML = `<div class="setting-row lore-extra"><span class="row-text"><strong>再挂几本只给手机读的</strong><small data-lore-extra-line></small></span>${btn('lore-extra', '挂书', 'chip-button')}</div>
      <div class="lore-tools"><div class="vibe-search">${icon('search')}<input type="search" data-lore-search placeholder="搜索书名、条目标题、关键词" aria-label="搜索世界书"></div>${btn('lore-try', '试一句', 'chip-button')}</div>
      <p class="hint" style="padding:6px 2px">列出的是现在开着的世界书（全局、角色卡、聊天、人设绑定的）和里面启用的条目。勾选表示允许读取，仍按常驻、关键词、扫描深度和预算触发；不会强制全文载入。关掉的手机就不读，正文照常用。改完点「保存预设」才生效。</p>
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
    d.body.addEventListener('click', e => { if (e.target.closest('[data-action=lore-extra]')) { e.preventDefault(); pickExtraLore(async () => { try { await read(); } catch { /* the list as it was */ } if (d.live) paint(); }); } });
    d.body.addEventListener('click', e => { if (e.target.closest('[data-action=lore-try]')) { e.preventDefault(); tryLore(); } });
    d.onClose(() => render());
  }
  /**
   * 试一句 (0.9.38): a chat's latest lines (and a line more) scanned as its next reply would be, with what this preset
   * leaves out even before it is saved: the entries that come in, the ones too many for 世界书最多, and why each other
   * one does not (those whose keywords are not there at all, folded away).
   */
  async function tryLore() {
    const d = ctx.dialog('试一句', '<p class="hint">正在读取聊天……</p>', {over: true});
    let threads = [];
    try { threads = [...await api.listThreads?.() || []].sort((a, b) => (b.last?.at || 0) - (a.last?.at || 0)); } catch { /* a line alone */ }
    if (!d.live) return;
    const nameOf = t => t.name || (t.members || []).join('、') || '聊天';
    d.body.innerHTML = `<div class="lore-try">
      <div class="field"><span>哪个聊天</span><span class="select"><select data-try-chat aria-label="哪个聊天">${threads.map(t => `<option value="${esc(t.id)}">${esc(nameOf(t))}</option>`).join('')}<option value="">不用聊天，只试这一句</option></select></span></div>
      <div class="field"><span>再说一句</span><textarea data-try-text rows="2" maxlength="2000" placeholder="可以不写" aria-label="再说一句"></textarea></div>
      ${btn('lore-try-run', '试一试', 'primary')}
      <div data-try-out></div></div>`;
    const out = d.body.querySelector('[data-try-out]');
    const rows = (list, note) => list.map(x => `<div class="lore-entry"><span class="row-text"><strong>${esc(x.title)}</strong><small>${esc([x.book, note(x)].filter(Boolean).join(' · '))}</small></span></div>`).join('');
    const run = async () => {
      const threadId = d.body.querySelector('[data-try-chat]').value, text = d.body.querySelector('[data-try-text]').value.trim();
      if (!threadId && !text) { out.innerHTML = '<p class="hint">写一句话，或者选一个聊天。</p>'; return; }
      out.innerHTML = '<p class="hint">正在扫……</p>';
      try {
        const r = await api.loreTry({threadId, text, preset: {loreSkipBooks: current.loreSkipBooks, loreSkipEntries: current.loreSkipEntries, loreExtraBooks: current.loreExtraBooks, cleanTags: current.cleanTags, loreMax: current.loreMax, history: current.history}});
        if (!d.live) return;
        const quiet = r.others.filter(o => o.why.startsWith('这段话里没有')), missed = r.others.filter(o => !quiet.includes(o));
        out.innerHTML = `<p class="hint">扫的是最近 ${r.depth} 段 · 酒馆的世界书预算 ${Number(r.budget.tokens).toLocaleString()} token</p>`
          + groupTitle(`带上 ${r.kept.length} 条 · ${r.kept.reduce((n, x) => n + x.chars, 0).toLocaleString()} 字`) + (rows(r.kept, x => `${x.why} · ${x.chars} 字`) || '<p class="hint">一条也没有。</p>')
          + (r.over.length ? groupTitle(`放不下 ${r.over.length} 条`) + `<p class="hint">${esc(r.over[0].why)}</p>` + rows(r.over, x => `${x.chars} 字`) : '')
          + (missed.length ? groupTitle(`没带上 ${missed.length} 条`) + rows(missed, x => x.why) : '')
          + (quiet.length ? `<details class="lore-quiet"><summary>另外 ${quiet.length} 条：这段话里没有它们的关键词</summary>${rows(quiet, x => x.why)}</details>` : '');
      } catch (error) { if (d.live) out.innerHTML = `<p class="hint error-copy">${esc(error.message)}</p>`; }
    };
    d.body.addEventListener('click', e => { if (e.target.closest('[data-action=lore-try-run]')) { e.preventDefault(); run(); } });
  }
  /** 只给手机读的书 (0.9.37): any book of the tavern's; one the tavern has on is read anyway, so it is shown as such. */
  async function pickExtraLore(done) {
    const d = ctx.dialog('只给手机读的书', '<p class="hint">正在读取世界书……</p>', {over: true});
    let names = [], on = new Set();
    try {
      names = await api.loreNames?.() || [];
      on = new Set((await api.loreBooks?.() || []).map(b => b.name));
    } catch (error) { d.body.innerHTML = `<p class="hint error-copy">${esc(error.message)}</p>`; return; }
    if (!d.live) return;
    const picked = new Set(current.loreExtraBooks || []);
    let query = '';
    const paint = () => {
      const shown = names.filter(n => !query || n.toLowerCase().includes(query));
      d.body.querySelector('[data-extra-list]').innerHTML = shown.map(n => `<label class="lore-entry${on.has(n) ? ' off' : ''}"><span class="row-text"><strong>${esc(n)}</strong><small>${on.has(n) ? '酒馆里开着，手机已经在读' : picked.has(n) ? '只给手机读' : '没开'}</small></span>
        <input class="switch" type="checkbox" data-extra-book="${esc(n)}" ${picked.has(n) || on.has(n) ? 'checked' : ''} ${on.has(n) ? 'disabled' : ''} aria-label="只给手机读「${esc(n)}」"></label>`).join('')
        || `<p class="hint">${query ? '没有搜到。' : '酒馆里还没有世界书。'}</p>`;
    };
    d.body.innerHTML = `<div class="vibe-search">${icon('search')}<input type="search" data-extra-search placeholder="搜索书名" aria-label="搜索世界书"></div>
      <p class="hint" style="padding:6px 2px">挂上的书只给手机读，正文读不到；手机读它们也按常驻和关键词触发，和酒馆的规则一样。改完点「保存预设」。</p>
      <div class="lore-list" data-extra-list></div>`;
    paint();
    d.body.addEventListener('input', e => { if (e.target.matches('[data-extra-search]')) { query = e.target.value.trim().toLowerCase(); paint(); } });
    d.body.addEventListener('change', e => {
      const name = e.target.dataset.extraBook;
      if (name === undefined) return;
      if (e.target.checked) picked.add(name); else picked.delete(name);
      current.loreExtraBooks = names.filter(n => picked.has(n)).concat([...picked].filter(n => !names.includes(n)));
      mark(); paint();
    });
    d.onClose(() => done());
  }
  /** 记忆 of the phone chats (core/memory.js): the switch and how it is written up and searched. */
  // (0.9.44) The editor's reading part is four folds, one per thing read: 正文 (recent replies and other plugins' story
  // memory), 世界书, 手机聊天 (the chat history and its own memory), and 带进正文 (how chat goes the other way).
  function memoryFields(p) {
    const m = p.memory || {}, on = m.enabled !== false;
    const num = (key, label, value, min, max, note) => field(label, input('memory.' + key, value, 'number', `min="${min}" max="${max}" step="1"`), note);
    return `${toggle('memory.enabled', '记住更早的聊天', on, '聊得久了，「读取聊天记录」之外的消息模型就看不到了。打开后，更早的消息会自动整理成摘要，摘要多了再合成阶段总结、长期总览（每整理一次调用一次文字模型）；回消息、打电话、查手机和朋友圈都会带上。每段聊天的记忆在聊天右上角「⋯ → 记忆」里看和改。')}
      ${on ? num('batch', '每次整理多少条', m.batch ?? 40, 10, 200, '「读取聊天记录」那么多条之外的消息，攒够这么多条整理成一段聊天摘要。')
        + num('stage', '几段摘要合成一份阶段总结', m.stage ?? 5, 2, 20, '')
        + num('epic', '几份总结再合成长期总览', m.epic ?? 4, 2, 20, '长期总览也会继续往上合，记忆再长也不会越带越多。')
        + num('recall', '每次想起几段旧聊天', m.recall ?? 3, 0, 10, '按最近几句话，从更早的原话里找出最相关的几段一起带上（0 不找）。默认在本地找，不花钱；在「引擎 → 向量模型」里填了 Embedding 接口后按意思找，更准。') : ''}`;
  }
  /**
   * 剧情记忆来源: other plugins' story memory (剧情剪辑台, the tavern's 总结, or any that puts it into the tavern's
   * extension prompts) read into the phone's requests as 更早的剧情. The ones there now are listed to pick from.
   */
  function storyFields(m) {
    const keys = m.storyKeys || [], list = storyList;
    const rows = list ? (list.length ? list.map(x => `<details class="story-source-detail"><summary class="story-source"><span><b>${esc(x.name || x.key)}</b><small>${x.chars || 0} 字 · 点开看全文</small></span><input type="checkbox" class="switch" data-story-key="${esc(x.key)}" aria-label="读 ${esc(x.name || x.key)}" ${keys.includes(x.key) ? 'checked' : ''}></summary><div class="story-source-meta">${esc(x.key)} · ${x.position === 1 ? '聊天内第 ' + (x.depth ?? 0) + ' 层' : x.position === 0 ? '主提示词后' : x.position === 2 ? '主提示词前' : '位置 ' + (x.position ?? '未提供')} · ${['系统', '用户', '助手'][x.role] || '系统'}</div><pre class="story-source-full">${esc(x.text || x.preview || '现在是空的')}</pre></details>`).join('')
      : '<p class="hint">酒馆现在没有注入任何扩展提示词。记忆插件一般在聊过几轮、或者生成过一次后才会有内容。</p>') : '';
    return `<div class="story-field"><span>剧情记忆来源${help('手机按所选模式读取正文。装了记忆插件（剧情剪辑台、酒馆自带的总结，或者别的把整理好的剧情注入给模型的插件）的话，勾上它注入的那一项，聊天、电话、查手机、朋友圈和论坛就会多带一段「更早的剧情」，记得很久以前的事。\n\n点「读取」列出酒馆现在注入的内容，看开头就知道是哪个插件的。剧情剪辑台和酒馆总结默认就勾着。把记忆写进世界书的插件不用勾，小手机本来就读世界书。')}</span>
      <small class="hint" style="margin:0">${keys.length ? '在读：' + keys.map(k => esc(storyName(k))).join('、') : '没有在读'}</small>
      ${api.storySources ? `<div class="actions" style="margin:6px 0 0">${btn('story-sources', icon('refresh') + (list ? '重新读取' : '读取当前注入的内容'), 'secondary')}</div>` : ''}
      ${list ? `<div class="story-sources">${rows}</div>` : ''}</div>`;
  }
  /** How this preset's story writes 心声 and 电话 besides the emotion word: the marks wrapped around them. */
  function marksFields(p) {
    const m = p.marks || {inner: [], phone: []};
    const row = (kind, label, info) => {
      const mine = m[kind] || [], own = mine.filter(x => !MARK_CHOICES.includes(x));
      return `<div class="field"><span>${label}${help(info)}</span><div class="use-row">${MARK_CHOICES.map(c => `<label class="use-chip"><input type="checkbox" data-mark="${kind}" data-pair="${esc(c)}" ${mine.includes(c) ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div><input type="text" data-mark-own="${kind}" aria-label="${label}：其他写法" value="${esc(own.join(' '))}" placeholder="其他写法，如 《…》"></div>`;
    };
    return row('inner', '心声怎么认', '台词的情绪字段写了「心声·」的，一直会当心声念（带回响）。\n\n有的正文预设有自己的心声写法，比如用 *星号* 或 `反引号` 包住心声：勾上对应的写法，包在里面的台词也当心声念；列表里没有的，在下面的框里写开头和结尾，中间用 … 隔开。\n\n很多预设用 *星号* 写动作，那样就别勾星号。正文预设根本不写心声的话，可以停用下面的「心声和电话」条目。')
      + row('phone', '电话怎么认', '情绪字段写了「电话·」的，会念成电话听筒里的声音。正文预设用别的符号标电话里的话（比如【…】）的话，在这里勾上它。');
  }
  const storyName = key => storyList?.find(x => x.key === key)?.name || ({bakemono_memory: '剧情剪辑台', '1_memory': '酒馆总结'})[key] || key;
  let storyList = null;
  // The editor keeps to what is changed most (name, format, the rules); the rest folds away, each rule is one row that
  // opens in a sheet, and what is rare (发送预览, 恢复成默认内容, 删除预设) sits in the 「⋯」 of the title.
  const ruleHelp = (e, draw, chat) => draw ? '可以用 {{出图格式}}、{{出图数量}}、{{角色列表}}。插件会在最后自动加上格式和张数的硬性要求。'
    : chat ? '可以用 {{用户}}、{{对象}}；写语音消息规则时用 {{语音格式}}（手机固定用默认的台词格式，不跟配音预设走）、{{可发语音}}。用在朋友圈的规则只能用 {{用户}}。插件会在最后自动加上输出格式的硬性要求。'
    : e.id === 'reading' ? '{{朗读规则}} 会换成这段剧情里每个说话者按自己的引擎和模型该怎么写（情绪、语气标签）。可以在前后加字；不想要就停用这一条。'
    : e.id === 'contract' ? '{{格式}} 换成上面的台词格式；{{错误示例}} {{正确示例}} 会按台词格式自动写出例子，改了格式也不会对不上。可以随便改，改乱了点「恢复这一条」。'
    : '启用规则的合计文字需包含 {{格式}} 和 {{语言}}。';
  /** The small line under a rule's row: where it goes, or how it starts. */
  function ruleNote(e, draw, chat) {
    if (chat) { const used = USES.filter(([u]) => (e.use || []).includes(u)).map(([, l]) => l); return used.length ? used.join(' · ') : '哪里都没用'; }
    if (draw) return e.engines?.length ? '只给 ' + ENGINE_USES.filter(([k]) => e.engines.includes(k)).map(([, l]) => l).join('、') : '三个引擎都用';
    const text = String(e.text || '').replace(/\s+/g, ' ').trim();
    return (e.injection ? '单独插入位置 · ' : '') + (text ? text.slice(0, 40) : '还是空的');
  }
  const fold = (group, title, note, body, info = '') => `<details data-group="${group}"><summary>${esc(title)}${info ? ' ' + help(info) : ''}${note ? `<small class="fold-note">${esc(note)}</small>` : ''}</summary><div class="fold-body">${body}</div></details>`;

  const storyModes = [['tavern', '跟着酒馆', '隐藏的楼不读，其余从新往旧读到字数上限'], ['exact', '照正文原样', '和正文模型看到的一样，最费 token'], ['recent', '只读最近几条', '自己定条数'], ['off', '不读', '手机不知道剧情']];
  const modeOf = p => p.storyMode || (Number(p.context) === 0 ? 'off' : 'tavern');
  const storyModeName = p => storyModes.find(x => x[0] === modeOf(p))?.[1] || '跟着酒馆';
  let exactInfo = null, exactTicket = 0;
  function cleanFields(p) {
    return field('清洗标签', input('cleanTags', Array.isArray(p.cleanTags) ? p.cleanTags.join(', ') : p.cleanTags || '', 'text', 'placeholder="比如 status, 状态栏"'), '写标签名，逗号隔开。正文和手机回复里用这些标签包住的内容会去掉，世界书条目里的也一样。照正文原样时只清洗接上的新楼，已存历史保持原样。');
  }
  function readFields(p) {
    const mode = modeOf(p);
    const choice = `<div class="story-modes" role="radiogroup" aria-label="怎么读正文"><div class="field"><span>怎么读正文</span></div>${storyModes.map(([id, title, note]) => `<label class="story-mode"><input type="radio" name="story-mode" data-story-mode="${id}" ${mode === id ? 'checked' : ''}><span><strong>${title}</strong><small>${note}</small></span></label>`).join('')}</div>`;
    if (mode === 'off') return choice + '<p class="hint" data-keep-hint>手机不读取正文剧情。</p>';
    if (mode === 'exact') return choice + `<p class="hint story-cost" data-keep-hint>每次聊天都会把正文那一整份发过去，可能几万到十几万 token；没有存的时候自动改用「跟着酒馆」。${help('使用最新可见角色回复生成时保存的聊天补全提示词，保留历史的原始顺序，再接上新楼。正文预设中能认出的写作要求默认去掉；未认出的内容保留。文本补全不支持。')}</p>${groupTitle('正文预设')}<button class="list-row" data-action="story-entries"><span><strong>正文预设的条目</strong><small>只列认得出的条目 · 默认全关</small></span>${icon('next')}</button><p class="hint" data-exact-status data-keep-hint>${esc(exactStatus())}</p>${groupTitle('新楼层')}${cleanFields(p)}`;
    return choice + groupTitle('读取范围') + (mode === 'recent' ? field('最近几条', input('context', p.context || 6, 'number', 'min="1" max="100" step="1"')) : '')
      + field('每条最多（字）', input('storyEach', p.storyEach ?? 4000, 'number', 'min="0" step="500"'), '超长正文取前面这些字；0 不限制。')
      + field('一共最多（字）', input('storyTotal', p.storyTotal ?? 20000, 'number', 'min="0" step="1000"'), '从新往旧读到上限；0 不限制。')
      + groupTitle('内容处理') + cleanFields(p) + groupTitle('更早的剧情') + storyFields(p.memory || {}) + '<p class="hint" data-keep-hint>酒馆正则（仅提示词）会自动照样套用。</p>';
  }
  const exactStatus = () => !exactInfo ? '正在读取已保存的提示词……' : exactInfo.available ? '可以用：角色回复生成时存了提示词' : `现在用不了：${exactInfo.reason}，会改用跟着酒馆`;
  async function loadExactInfo() {
    const ticket = ++exactTicket, p = current;
    try { exactInfo = await api.storyExactInfo?.(p) || {available: false, reason: '当前酒馆没有提供已存提示词接口', entries: []}; }
    catch { exactInfo = {available: false, reason: '已存提示词读取失败', entries: []}; }
    if (ticket !== exactTicket || current !== p) return;
    const el = v.root.querySelector('[data-exact-status]'); if (el) el.textContent = exactStatus();
  }
  async function storyEntries() {
    await loadExactInfo();
    const p = current, info = exactInfo;
    const d = ctx.dialog('正文预设的条目', info.entries?.length ? `<div class="group story-sources">${info.entries.map(e => `<label class="story-source"><span><b>${esc(e.title)}</b><small>${esc(e.text.slice(0, 90))}</small></span><input type="checkbox" class="switch" data-exact-entry="${esc(e.id)}" ${p.storyEntries?.[info.presetName]?.[e.id] ? 'checked' : ''}></label>`).join('')}</div>` : `<p class="hint">${esc(info.available ? '这份提示词里没有认得出的预设条目。' : exactStatus())}</p>`, {over: true});
    d.body.addEventListener('change', ev => { const id = ev.target.dataset.exactEntry; if (!id) return; p.storyEntries ||= {}; p.storyEntries[info.presetName] ||= {}; p.storyEntries[info.presetName][id] = ev.target.checked; mark(); });
  }
  v.on('change', '[data-story-mode]', el => { if (!current || !el.checked) return; current.storyMode = el.dataset.storyMode; if (current.storyMode === 'recent' && !Number(current.context)) current.context = 6; mark(); render(); if (current.storyMode === 'exact') loadExactInfo(); });
  v.root.addEventListener('click', ev => { if (ev.target.matches('[data-story-key]')) ev.stopPropagation(); }, true);
  v.on('click', '[data-action="story-entries"]', () => storyEntries());

  function renderEditor() {
    const p = current, o = ops(currentKind), draw = currentKind === 'draw', chat = currentKind === 'chat';
    const used = p.id && p.id === o.active();
    const basics = chat ? ''
      : draw ? field('每条回复出图数量', input('count', p.count ?? 1, 'number', `min="1" max="${api.drawCountMax}" step="1"`), '每条回复固定出这么多张图。规则里写 {{出图数量}} 会换成这个数字；插件还会在规则最后加一段硬性要求，让张数更稳定。张数越多，出图越久。\n\n规则里写 {{出图格式}} 会换成下面这段（回复后单独配图时，还会多一行「位置」）；{{角色列表}} 会换成已登记的角色和他们的固定外貌。别的插件要排除出图内容时，排除标签填 <img></img>。\n\n' + api.picTagFormat)
      : field('正文显示', select('voiceLayout', p.format===FREE_FORMAT?'free':'paired', [['paired','译文与原文配对'],['free','自由正文 · 只渲染 tts 标签']]), '自由正文保留对白的语言和排版，英语、双语括号都可以。标签内仍写角色、情绪、朗读原文。') + field('台词格式', textArea('format', p.format, 'class="code short" rows="3"'), '配对模式：{译文}、{角色}、{情绪}、{文本} 各保留一次。自由正文模式：<tts>{角色}|{情绪}|{文本}</tts>，前面的正文不限制格式。译文供阅读，原语言供语音生成。默认格式是成对的 <tts></tts>，别的插件要排除语音原文时，排除标签填 <tts></tts>。\n\n这里的格式只管正文；手机里的语音消息和电话固定用默认格式，不跟着改。');
    const marks = p.marks || {inner: [], phone: []}, marked = (marks.inner || []).length + (marks.phone || []).length;
    const folds = chat
      ? fold('preset-read', '正文', storyModeName(p) + (p.memory?.storyKeys?.length && !['exact', 'off'].includes(modeOf(p)) ? ` · 记忆插件 ${p.memory.storyKeys.length} 项` : ''), readFields(p), '手机这边知道多少剧情。')
        + fold('preset-lore', '世界书', p.lore === false ? '不带' : loreLine(p),
          `${toggle('lore', '带上世界书', p.lore !== false, '聊天、电话、朋友圈、论坛和查手机按触发条件带上酒馆的世界书：和写正文时一样，常驻的条目，以及在名字、最近的正文和聊天里触发关键词的条目（当前角色卡的世界书、全局和聊天绑定的世界书都算）。人设写在世界书里的话要打开。\n\n条目多的话会多占一些上下文。')}${p.lore !== false ? loreFields(p) + field('世界书最多（字）', input('loreMax', p.loreMax ?? 30000, 'number', 'min="0" step="1000"'), '手机读世界书时最多放这么多字，只放整条。0 表示插件不另外限制，只按酒馆「世界书」设置里的预算（占上下文的百分比）来。手机的每次请求（聊天、朋友圈、论坛、查手机、电话）都按这些条件读取世界书，放得越多越费 token，也越慢。') : ''}`)
        + fold('preset-memory', '手机聊天', `最近 ${p.history} 条 · 记忆${p.memory?.enabled !== false ? '开' : '关'}`,
          `${field('读取聊天记录', input('history', p.history, 'number', 'min="2" max="500" step="1"'), '回消息时带上最近多少条手机聊天，原样给模型看。')}${memoryFields(p)}
          ${field('每次刷新朋友圈最多几条', input('posts', p.posts ?? 2, 'number', 'min="1" max="5" step="1"'), '在动态里刷新时，由模型挑 1 到这么多个人发动态。')}`, '手机里聊过的话，模型能看到多少、更早的怎么记住。')
        + fold('preset-bring', '带进正文', '', `${field('带进剧情的写法', textArea('bring', p.bring, 'class="code" rows="4"'), '选中的聊天消息会按这段文字注入下一次正文，只用一次。需要包含 {{聊天记录}}；也可以用 {{用户}}、{{对象}}。')}${injection(p.injection)}
          <p class="hint">挑哪些消息、哪些聊天一直带着，在「设置 → 正文和手机」里，或者聊天顶上的「带进剧情」。</p>`, '反过来：手机里的聊天怎么写进正文、插在正文请求的哪里。深度与身份仅在聊天内插入时生效。')
      : (draw ? '' : fold('preset-marks', '心声和电话', marked ? `多认 ${marked} 种写法` : '看情绪字段', marksFields(p)))
        + fold('preset-injection', '默认插入设置', positions.find(x => x[0] === p.injection.position)?.[1] || '', injection(p.injection), '深度与身份仅在聊天内插入时生效；条目可以单独覆盖。');
    v.draw(heading(p.id ? '编辑预设' : '新预设', btn('preset-more', icon('more'), 'round-button', 'aria-label="更多"'), draw ? 'Drawing Preset' : chat ? 'Chat Preset' : 'Voice Preset')
      + `<div class="group pad">${field('名称', input('name', p.name))}${basics}</div>${folds}
        ${groupTitle(draw ? '出图规则' : chat ? '规则' : '提示词条目', btn('add-entry', icon('add') + '条目', 'chip-button'))}
        <div class="group entry-list">${p.entries.map((e, i) => `<div class="setting-row entry-row${e.enabled ? '' : ' off'}"><button type="button" class="entry-open" data-action="open-entry" data-index="${i}"><span class="row-text"><strong>${esc(e.title || '未命名条目')}</strong><small>${esc(ruleNote(e, draw, chat))}</small></span></button><input class="switch" type="checkbox" data-entry-on="${i}" aria-label="启用「${esc(e.title || '未命名条目')}」" ${e.enabled ? 'checked' : ''}></div>`).join('') || '<p class="hint">还没有规则，点右上角「条目」加一条。</p>'}</div>
        <div class="savebar"><span class="save-state" data-save-state>${dirty.has(draftKey()) ? '未保存' : '草稿'}</span>${p.id && !used ? btn('use-preset', '使用', 'secondary') : ''}${btn('save-preset', '保存预设', 'primary')}</div>`);
  }
  /** One rule in a sheet: name, where it goes, the text; moving and deleting at the bottom. */
  function openEntry(i) {
    const e = current?.entries[i];
    if (!e) return;
    const draw = currentKind === 'draw', chat = currentKind === 'chat';
    const d = ctx.dialog(e.title || '未命名条目', `<div data-entry="${i}">
      ${field('名称', input('title', e.title))}
      ${draw ? `<div class="field"><span>用在哪个引擎${help('勾了哪个，用那个引擎画图时才把这条规则发给模型。都勾或都不勾就是三个都用。在绘图 App 顶上选用哪个画。')}</span><div class="use-row">${ENGINE_USES.map(([u, l]) => `<label class="use-chip"><input type="checkbox" data-engine-use="${u}" ${!e.engines?.length || e.engines.includes(u) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>` : ''}
      ${chat ? `<div class="field"><span>用在${help('私聊、群聊、朋友圈、电话、论坛、查手机都是各自单独的一次请求。勾了哪几个，这条规则就在那几次请求里各出现一次。勾「正文」的话，写正文时也带上。')}</span><div class="use-row">${USES.map(([u, l]) => `<label class="use-chip"><input type="checkbox" data-use="${u}" ${(e.use || []).includes(u) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>` : ''}
      ${field(draw || chat ? '规则' : '提示词', textArea('text', e.text, 'class="code" rows="10"'), ruleHelp(e, draw, chat))}
      ${!draw && !chat ? toggle('customInjection', '单独设置插入位置', !!e.injection) + (e.injection ? injection(e.injection, i) : '') : ''}
      <div class="entry-tools">${btn('entry-up', icon('up') + '上移', 'text-button', i === 0 ? 'disabled' : '')}${btn('entry-down', icon('down') + '下移', 'text-button', i === current.entries.length - 1 ? 'disabled' : '')}${!draw && !chat && RULE_DEFAULTS[e.id] ? btn('entry-default', icon('refresh') + '恢复这一条', 'text-button') : ''}${btn('delete-entry', icon('trash') + '删除', 'text-button danger-text')}</div></div>`);
    let next = null;
    d.onClose(() => { render(); if (next !== null) openEntry(next); });
    d.body.addEventListener('input', ev => { const el = ev.target; if (el.matches('[data-field]') && el.type !== 'checkbox' && el.tagName !== 'SELECT') update(el, false); });
    d.body.addEventListener('change', ev => {
      const el = ev.target;
      if (el.matches('[data-use]')) setUse(el);
      else if (el.matches('[data-engine-use]')) setEngines(el);
      else if (el.matches('[data-field]') && (el.type === 'checkbox' || el.tagName === 'SELECT')) { update(el, false); if (el.dataset.field === 'customInjection') { next = i; d.close(); } }
    });
    d.body.addEventListener('click', async ev => {
      const action = ev.target.closest('[data-action]')?.dataset.action;
      if (action === 'entry-up' || action === 'entry-down') {
        const to = i + (action === 'entry-up' ? -1 : 1);
        if (to < 0 || to >= current.entries.length) return;
        [current.entries[i], current.entries[to]] = [current.entries[to], current.entries[i]];
        mark(); next = to; d.close();
      } else if (action === 'entry-default') {
        current.entries[i] = {...current.entries[i], text: current.format===FREE_FORMAT&&e.id==='contract'?FREE_CONTRACT_PROMPT:RULE_DEFAULTS[e.id]};
        d.body.querySelector('[data-field=text]').value = current.entries[i].text;
        mark(); ctx.notify('这一条换回默认了，记得保存');
      } else if (action === 'delete-entry') {
        if (await ctx.confirm('删除这条规则？', '保存预设后生效。')) { current.entries.splice(i, 1); mark(); render(); }
      }
    });
  }

  const render = () => current ? renderEditor() : renderList();
  function edit(k, id) {
    const key = k + ':' + id;
    current = drafts.get(key) || structuredClone(ops(k).list().find(p => p.id === id));
    if (!current) return;
    currentKind = k;
    drafts.set(key, current);
    render();
    if (k === 'chat' && modeOf(current) === 'exact') loadExactInfo();
  }
  v.showKind = k => { current = null; kind = k; render(); };
  v.back = () => { if (!current) return false; current = null; render(); return true; };
  v.refresh = () => { if (!current) render(); };

  function update(el, redraw) {
    const key = el.dataset.field, index = el.closest('[data-entry]')?.dataset.entry;
    if(key==='voiceLayout') {
      const free=el.value==='free';current.format=free?FREE_FORMAT:DEFAULT_FORMAT;
      const pairs=[[DEFAULT_PROMPT,FREE_PROMPT],[CONTRACT_PROMPT,FREE_CONTRACT_PROMPT]];
      for(const entry of current.entries)for(const [paired,open] of pairs)if(entry.text===(free?paired:open))entry.text=free?open:paired;
      mark();render();return;
    }
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
  function setEngines(el) {
    const entry = current?.entries[Number(el.closest('[data-entry]')?.dataset.entry)];
    if (!entry) return;
    const list = [...el.closest('.use-row').querySelectorAll('[data-engine-use]')].filter(x => x.checked).map(x => x.dataset.engineUse);
    if (!list.length || list.length === ENGINE_USES.length) delete entry.engines; else entry.engines = list;
    mark();
  }
  v.on('change', '[data-story-key]', el => {
    if (!current) return;
    const keys = new Set(current.memory?.storyKeys || []);
    if (el.checked) keys.add(el.dataset.storyKey); else keys.delete(el.dataset.storyKey);
    current.memory = {...current.memory, storyKeys: [...keys]};
    mark();
    const line = el.closest('.story-field')?.querySelector('small.hint');
    if (line) line.textContent = keys.size ? '在读：' + [...keys].map(storyName).join('、') : '没有在读';
  });
  function setUse(el) {
    const entry = current?.entries[Number(el.closest('[data-entry]')?.dataset.entry)];
    if (!entry) return;
    entry.use = USES.map(([u]) => u).filter(u => u === el.dataset.use ? el.checked : (entry.use || []).includes(u));
    mark();
  }
  // A rule's switch on its row.
  v.on('change', '[data-entry-on]', el => {
    const entry = current?.entries[Number(el.dataset.entryOn)];
    if (!entry) return;
    entry.enabled = el.checked;
    el.closest('.entry-row')?.classList.toggle('off', !el.checked);
    mark();
  });
  v.on('change', '[data-field]', el => {
    if (current && (el.type === 'checkbox' || el.tagName === 'SELECT')) update(el, true);
  });
  /** 心声怎么认 / 电话怎么认: the ticked marks and the user's own, kept on the draft. */
  function setMarks(kind) {
    if (!current) return;
    const ticked = [...v.root.querySelectorAll(`[data-mark="${kind}"]`)].filter(x => x.checked).map(x => x.dataset.pair);
    const own = (v.root.querySelector(`[data-mark-own="${kind}"]`)?.value || '').split(/[\s,，、]+/).filter(Boolean);
    current.marks = {inner: [], phone: [], ...current.marks, [kind]: [...new Set([...ticked, ...own])]};
    mark();
  }
  v.on('change', '[data-mark]', el => setMarks(el.dataset.mark));
  v.on('input', '[data-mark-own]', el => setMarks(el.dataset.markOwn));
  function save() {
    const key = draftKey();
    current = ops(currentKind).save(current);
    dirty.delete(key);
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
      // ＋: a new preset, or one from a file (a label holds the file input, so phones open the picker on the tap).
      case 'add-menu': {
        const label = KINDS.find(k => k[0] === kind)[1];
        const d = ctx.dialog('新增' + label + '预设', `<div class="pick-list">
          <button type="button" class="list-row" data-pick="new">${icon('add')}<span><strong>新建</strong><small>从默认内容开始改</small></span></button>
          <label class="list-row file-button">${icon('import')}<span><strong>从文件导入</strong><small>导出过的预设文件，或 AI 改好的</small></span><input type="file" accept=".json,application/json,text/plain" aria-label="选择预设文件"></label></div>`);
        d.body.querySelector('[data-pick=new]').addEventListener('click', () => { d.close(); newPreset(); });
        d.body.querySelector('input[type=file]').addEventListener('change', async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          d.close();
          try { await importPreset(file); } catch (error) { ctx.notify(error.message, {error: true}); }
        });
        break;
      }
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
      case 'save-preset': save(); break;
      case 'use-preset': save(); ops(currentKind).use(current.id); render(); break;
      case 'lore-pick': await pickLore(); break;
      case 'add-entry':
        current.entries.push({id: crypto.randomUUID(), title: '新条目', enabled: true, text: '', ...(currentKind === 'chat' ? {use: ['dm', 'group']} : {})});
        mark();
        render();
        openEntry(current.entries.length - 1);
        break;
      case 'open-entry': openEntry(index); break;
      case 'preset-more': {
        const picked = await menu(ctx, current.name || '预设', [
          {key: 'preview', icon: 'eye', label: '发送预览', note: '看看发给模型的是什么'},
          {key: 'reset', icon: 'refresh', label: '恢复成默认内容', note: '条目、格式和插入位置换成默认的，名字不变'},
          {key: 'export', icon: 'download', label: '导出成文件', note: '整份存成一个文件，可以交给 AI 改，改好从「＋」导入'},
          current.id && {key: 'delete', icon: 'trash', label: '删除预设', danger: true}]);
        if (picked === 'preview') preview();
        if (picked === 'reset') await resetContent();
        if (picked === 'export') await exportPreset();
        if (picked === 'delete' && await ctx.confirm('删除这个预设？', '角色配音和画风不会被删除。')) { ops(currentKind).remove(current.id); drafts.delete(currentKind + ':' + current.id); current = null; render(); }
        break;
      }
      case 'story-sources': {
        try { storyList = api.storySources(); } catch (error) { ctx.notify(error.message, {error: true}); break; }
        render();
        break;
      }
    }
  });
  function newPreset() {
    currentKind = kind;
    current = drafts.get(kind + ':new') || {...shipped(kind), name: kind === 'chat' ? '新聊天预设' : kind === 'draw' ? '新出图规则' : '新预设'};
    drafts.set(kind + ':new', current);
    render();
  }
  /** The preset as it is now (unsaved edits too), without its id: one file. */
  async function exportPreset() {
    const {id, ...preset} = structuredClone(current), label = KINDS.find(k => k[0] === currentKind)[1];
    const text = JSON.stringify({format: PRESET_FILE, version: 1, kind: currentKind, preset}, null, 2);
    try { ctx.notify('已导出 ' + await saveFile(ctx.doc, new Blob([text], {type: 'application/json'}), `${label}预设 ${current.name || ''}`.trim())); }
    catch (error) { ctx.notify(error.message, {error: true}); }
  }
  /** A preset file saved as a new preset of its kind (a name already used gets a number), then opened. */
  async function importPreset(file) {
    if (file.size > 2000000) throw Error('文件太大了，不像是一个预设');
    const {kind: k, preset} = readPresetFile(await file.text(), kind);
    const names = ops(k).list().map(p => p.name);
    let name = preset.name, n = 2;
    while (names.includes(name)) name = `${preset.name}（${n++}）`;
    const saved = ops(k).save({...shipped(k), ...preset, name});
    kind = k;
    edit(k, saved.id);
    ctx.notify(`已导入「${saved.name}」${saved.id === ops(k).active() ? '' : '，要用它就点下面的「使用」'}`);
  }
  // Puts the shipped rules, format and insertion back into this preset; its name stays. Saving makes it stick.
  async function resetContent() {
    if (!await ctx.confirm('恢复成默认内容？', '这个预设的条目、格式和插入位置会换成默认的，名字不变。保存之后才生效，不保存就不会改动。')) return;
    current = {...shipped(currentKind), id: current.id, name: current.name};
    drafts.set(currentKind + ':' + (current.id || 'new'), current);
    render();
    mark();
    ctx.notify('已换成默认内容，记得保存');
  }
  function preview() {
    const o = ops(currentKind), error = o.validate(current);
    if (error) { ctx.notify(error, {error: true}); return; }
    // The chat preset's preview holds one request per place (私聊, 群聊, 朋友圈…): shown one at a time, since all of them
    // in a row read as if every request carried every copy.
    const parts = String(o.preview(current)).split(/^━━ (.+?) ━━\n+/m), scenes = [];
    for (let k = 1; k < parts.length; k += 2) scenes.push([parts[k], parts[k + 1].trim()]);
    if (scenes.length < 2) { ctx.dialog('发送预览', `<pre class="code-preview">${esc(parts.join(''))}</pre>`); return; }
    const d = ctx.dialog('发送预览', `<div class="field"><div class="use-row">${scenes.map(([name], k) => `<label class="use-chip"><input type="radio" name="pv-scene" value="${k}" ${k ? '' : 'checked'}><span>${esc(name.replace(/（.*）/, ''))}</span></label>`).join('')}</div></div>
      <p class="hint">每个地方是单独的一次请求，用到时才发。条目勾了几个地方，就在那几次请求里各出现一次，不会叠在一起。</p><pre class="code-preview" data-pv-scene="${esc(scenes[0][0])}">${esc(scenes[0][1])}</pre>`);
    d.body.addEventListener('change', e => { const k = Number(e.target.value), pre = d.body.querySelector('.code-preview'); if (!scenes[k]) return; pre.dataset.pvScene = scenes[k][0]; pre.textContent = scenes[k][1]; pre.scrollTop = 0; });
  }
  render();
  return v;
}
