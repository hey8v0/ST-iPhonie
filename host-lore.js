// 世界书 for the phone: chat replies, calls and 朋友圈 are asked for apart from the story (generateRaw), so the tavern
// does not add its World Info to them. This asks the tavern which entries the same scan would turn on (the active
// character's book, global and chat books, constant entries, keywords found in the given text) without changing
// anything (dry run: no activation events, timers left alone), and returns their text for the phone's own prompt.
// Books the phone alone reads (0.9.37, a preset's loreExtraBooks) are not on in the tavern, so its scan does not see them:
// they are scanned here, by the tavern's own rules for keys (scanBooks).
import {cleanTagged} from './core/chat.js';

// The most of it a phone request takes unless the chat preset says (loreMax; 0: none of our own): whole entries only.
const LORE_MAX = 30000;

/**
 * texts: what to scan, oldest first (recent story, the phone conversation by turns): the tavern scans the newest of them
 * as deep as its 扫描深度 says.
 * always: scanned however deep the tavern scans (0.9.38; the names of who is in it, what the user asked for), with the
 * newest of texts: given among texts, they were the oldest and left out as soon as a conversation was two turns long.
 * persona / characters: the user's persona and the contacts' card text, for entries that also match those.
 * skipBooks / skipEntries: books, and entries ("book#uid", picked in the phone), left out.
 * extraBooks: books the phone reads too though the tavern has them off (the story never sees them).
 * cleanTags: tags whose blocks are taken out of the text (a status bar the story asks for, which the phone must not copy).
 * Returns '' when the tavern has no World Info for this (or is older than 1.12.14).
 */
export async function worldInfoFor(context, {texts = [], always = [], persona = '', characters = '', skipBooks = [], skipEntries = [], extraBooks = [], cleanTags = [], excludeText = '', onlyBooks = null, max: most = LORE_MAX, report = () => {}, load = () => import('/scripts/world-info.js'), main = () => import('/script.js'), random = Math.random} = {}) {
  const note = (kind, error, level = 'error') => { try { report('世界书读取', {kind, message: error?.message || String(error), stack: error?.stack}, level); } catch {} };
  try {
    const ctx = context();
    if (typeof ctx?.getWorldInfoPrompt !== 'function') { note('接口不可用', '当前酒馆没有提供世界书扫描接口，本次未带入世界书', 'warn'); return ''; }
    const scan = scanOf(texts, always);
    const parts = await collect(ctx, {scan, persona, characters, skipBooks, skipEntries, extraBooks, load, size: await promptSize(ctx, main), random, note});
    // onlyBooks (照正文原样, 0.9.46): the story's own part already holds what the tavern's books gave; only these are read.
    return budgeted(parts.filter(p => !onlyBooks || onlyBooks.includes(p.world)).filter(p => !excludeText || !excludeText.includes(String(p.content || '').trim()) || !String(p.content || '').trim()), cleanTags, most).filter(p => p.kept).map(p => p.text).join('\n\n');
  } catch (error) { note('扫描失败，本次未带入世界书', error); return ''; }
}

/**
 * The prompt size the tavern's own replies have, which its World Info budget is a share of (0.9.38). The context's
 * maxContext is the text-completion slider alone: on chat completion the phone's scan had a budget of a few thousand
 * tokens where the story had its own, and the entries with the lowest order (often the main characters) never came in.
 * Asked of the tavern as its own generation asks (getMaxPromptTokens; getMaxContextSize before 1.13), else worked out
 * the same way from the API in use.
 */
export async function promptSize(ctx, main = () => import('/script.js')) {
  try {
    const m = await main(), size = Number((m?.getMaxPromptTokens || m?.getMaxContextSize)?.());
    if (size > 0) return size;
  } catch { /* worked out below */ }
  const oai = ctx?.chatCompletionSettings;
  if (ctx?.mainApi === 'openai' && oai) {
    const size = Number(oai.openai_max_context) - (Number(oai.openai_max_tokens) || 0);
    if (size > 0) return size;
  }
  return Number(ctx?.maxContext) || 8192;
}
/** What the tavern scans, newest first: texts (given oldest first), and what is always scanned with the newest. */
function scanOf(texts, always = []) {
  const scan = texts.map(t => String(t || '').trim()).filter(Boolean).reverse(), with_ = always.map(t => String(t || '').trim()).filter(Boolean).join('\n');
  if (with_) scan[0] = scan.length ? `${scan[0]}\n${with_}` : with_;
  return scan;
}
/** What the tavern's scan is given besides the chat (entries that also match the persona or the card). */
const scanData = (persona, characters) => ({trigger: 'normal', personaDescription: persona, characterDescription: characters, characterPersonality: '', characterDepthPrompt: '', scenario: '', creatorNotes: ''});

/**
 * What the phone takes, entry by entry: [{world, uid, content, own}] — the tavern's dry-run scan less what is left out,
 * then the books the phone alone reads (own). Entry by entry from the tavern's checkWorldInfo (1.13.2 and later), so the
 * budget takes whole entries in the tavern's own order, the most important first (0.9.38: before, with nothing left
 * out, the tavern's joined blocks were taken and the budget could cut one in the middle); where it cannot be loaded,
 * what the tavern would put in is used ({content} without world or uid).
 */
async function collect(ctx, {scan, persona, characters, skipBooks = [], skipEntries = [], extraBooks = [], load, size, random = Math.random, note = () => {}}) {
  const max = size || Number(ctx.maxContext) || 8192, subst = text => typeof ctx.substituteParams === 'function' ? ctx.substituteParams(text) : text;
  const global = scanData(persona, characters);
  let parts = null, wi = null;
  try {
    wi = await load();
    if (typeof wi?.checkWorldInfo !== 'function') throw Error('酒馆没有 checkWorldInfo');
    const r = await wi.checkWorldInfo(scan, max, true, global);
    parts = [...(r?.allActivatedEntries || [])].filter(e => !skipBooks.includes(e?.world) && !skipEntries.includes(entryId(e?.world, e?.uid)))
      .map(e => ({world: e?.world, uid: e?.uid, content: subst(String(e?.content || ''))}));
  } catch (error) { if (skipBooks.length || skipEntries.length) note('条目筛选不可用，回退到酒馆已触发内容', error, 'warn'); parts = null; }
  if (!parts) {
    const r = await ctx.getWorldInfoPrompt(scan, max, true, global);
    parts = [r?.worldInfoBefore, r?.worldInfoAfter, ...(r?.anBefore || []), ...(r?.anAfter || []),
      ...(r?.worldInfoDepth || []).flatMap(d => d?.entries || []), ...(r?.worldInfoExamples || []).map(e => e?.content)].map(content => ({content}));
  }
  // The phone's own books, after the tavern's (those come first when the budget is short).
  const own = extraBooks.filter(name => typeof name === 'string' && name.trim() && !skipBooks.includes(name));
  if (own.length) {
    const on = activeBooks(ctx, wi), books = [];
    for (const name of own) {
      if (on.has(name)) continue;
      try { books.push({name, data: await ctx.loadWorldInfo?.(name)}); } catch (error) { note(`读不到只给手机的「${name}」`, error, 'warn'); }
    }
    parts.push(...scanEntries(books, {text: scan.join('\n'), persona, characters, skipEntries, subst, random, defaults: scanDefaults(wi)}).map(e => ({...e, own: true})));
  }
  return parts;
}
const scanDefaults = wi => ({caseSensitive: !!wi?.world_info_case_sensitive, wholeWords: !!wi?.world_info_match_whole_words});
/** 世界书最多: whole entries, the first ones first; one too long for what is left is skipped (shorter ones after it may fit). */
function budgeted(parts, cleanTags, most) {
  const limit = most || Infinity, seen = new Set();
  let used = 0, first = true;
  return parts.map(part => {
    const text = cleanTagged(part.content, cleanTags);
    if (!text || seen.has(text)) return {...part, text, kept: false, same: !!text};
    seen.add(text);
    if (used + text.length > limit) {
      // (Only the joined text of an old tavern can be the first and too long: it is cut to the limit.)
      if (first && part.world == null) { first = false; used = limit; return {...part, text: text.slice(0, limit), kept: true}; }
      return {...part, text, kept: false, over: true};
    }
    first = false; used += text.length + 2;
    return {...part, text, kept: true};
  });
}

/** How an entry is named in a preset's list of entries left out. */
export const entryId = (book, uid) => `${book}#${uid}`;

/** The books the tavern has on now: name → where from (全局, 角色卡 for the card's own and extra books, 聊天, 人设). */
function activeBooks(ctx, wi) {
  const from = new Map();
  const add = (name, where) => { if (typeof name === 'string' && name.trim()) from.set(name, [...new Set([...(from.get(name) || []), where])]); };
  for (const name of wi?.selected_world_info || []) add(name, '全局');
  const character = ctx?.characters?.[ctx?.characterId];
  add(character?.data?.extensions?.world, '角色卡');
  const file = String(character?.avatar || '').replace(/\.[^.]+$/, '');
  for (const name of wi?.world_info?.charLore?.find(x => x?.name === file)?.extraBooks || []) add(name, '角色卡');
  add(ctx?.chatMetadata?.world_info, '聊天');
  add(ctx?.powerUserSettings?.persona_description_lorebook, '人设');
  return from;
}

// A key written as /pattern/flags is a regex, as in the tavern (an unescaped / inside makes it plain text).
const REGEX_KEY = /^\/([\s\S]+?)\/([gimsuy]*)$/;
function keyRegex(key) {
  const m = REGEX_KEY.exec(key);
  if (!m || /(^|[^\\])\//.test(m[1])) return null;
  try { return new RegExp(m[1].replace('\\/', '/'), m[2]); } catch { return null; }
}
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whether one key is in the text: regex, case (the entry's or the tavern's), whole words (one word only). */
function keyHit(text, key, entry, defaults) {
  const regex = keyRegex(key);
  if (regex) { regex.lastIndex = 0; return regex.test(text); }
  const exact = entry.caseSensitive ?? defaults.caseSensitive ?? false, whole = entry.matchWholeWords ?? defaults.wholeWords ?? false;
  const hay = exact ? text : text.toLowerCase(), word = exact ? key : key.toLowerCase();
  if (!whole || /\s/.test(word)) return hay.includes(word);
  return new RegExp(`(?:^|\\W)(${escapeRegex(word)})(?:$|\\W)`).test(hay);
}
/**
 * The entries of books the phone alone reads that turn on for this text, by the tavern's rules: constant ones; else a
 * primary key in the text, and the secondary keys by the entry's logic (AND ANY, NOT ALL, NOT ANY, AND ALL); an entry
 * with a probability under 100 is rolled. Recursion, timers and groups are the tavern's own and are not kept here.
 * books: [{name, data}] (data as loadWorldInfo gives it). Returns their contents, the lower insertion order first.
 */
export function scanBooks(books, options = {}) { return scanEntries(books, options).map(e => e.content); }
/** As scanBooks, with each entry's book and number: [{world, uid, order, content}]. */
function scanEntries(books, {text = '', persona = '', characters = '', skipEntries = [], subst = s => s, defaults = {}, random = Math.random} = {}) {
  const skip = new Set(skipEntries), out = [];
  for (const {name, data} of books) {
    for (const e of Object.values(data?.entries || {})) {
      if (!e || e.disable || skip.has(entryId(name, e.uid)) || !String(e.content ?? '').trim()) continue;
      if (e.useProbability && Number(e.probability ?? 100) < 100 && random() * 100 >= Number(e.probability)) continue;
      if (!e.constant) {
        const hay = [text, e.matchPersonaDescription ? persona : '', e.matchCharacterDescription ? characters : ''].filter(Boolean).join('\n');
        const keys = (Array.isArray(e.key) ? e.key : []).map(k => String(subst(String(k)) ?? '').trim()).filter(Boolean);
        if (!keys.some(k => keyHit(hay, k, e, defaults))) continue;
        const second = e.selective !== false && Array.isArray(e.keysecondary) ? e.keysecondary.map(k => String(subst(String(k)) ?? '').trim()).filter(Boolean) : [];
        if (second.length) {
          const hits = second.map(k => keyHit(hay, k, e, defaults)), any = hits.some(Boolean), all = hits.every(Boolean);
          const logic = Number(e.selectiveLogic ?? 0);
          if (!(logic === 1 ? !all : logic === 2 ? !any : logic === 3 ? all : any)) continue;
        }
      }
      out.push({world: name, uid: e.uid, order: Number(e.order) || 0, content: String(subst(String(e.content)) ?? '')});
    }
  }
  return out.sort((a, b) => a.order - b.order);
}

// ---------- 试一句 (0.9.38) ----------
const LOGIC = ['且任一', '非全部', '非任一', '且全部'];
const titleOf = e => String(e?.comment || '').trim() || (Array.isArray(e?.key) ? e.key.filter(Boolean).slice(0, 3).join('、') : '') || '（没有标题）';
/**
 * The phone's scan of some text, laid open: which entries it takes (and why: constant, a key, the phone's own book),
 * which the budget left out, and for every other entry of the books it reads why it did not come in — the key not in
 * the text, or further back than the scan depth, the secondary keys, a character filter, an inclusion group, a delay
 * or cooldown, a probability, the tavern's own budget. Nothing is asked of a model; nothing is changed (a dry run).
 * texts, always: as worldInfoFor's. Answers {depth, scanned, budget, kept, over, others}.
 */
export async function loreTry(context, {texts = [], always = [], persona = '', characters = '', skipBooks = [], skipEntries = [], extraBooks = [], cleanTags = [], max: most = LORE_MAX, load = () => import('/scripts/world-info.js'), main = () => import('/script.js'), random = Math.random} = {}) {
  const ctx = context();
  if (typeof ctx?.getWorldInfoPrompt !== 'function') throw Error('这个酒馆没有世界书扫描接口（要 1.12.14 以后的版本）');
  let wi = null;
  try { wi = await load(); } catch { /* the defaults */ }
  const scan = scanOf(texts, always), depth = Number(wi?.world_info_depth ?? 2) || 2;
  const size = await promptSize(ctx, main);
  const parts = budgeted(await collect(ctx, {scan, persona, characters, skipBooks, skipEntries, extraBooks, load: async () => wi || load(), size, random}), cleanTags, most);
  // The tavern's budget: a share of the prompt (and a cap, if set). What the same scan turns on with no budget at all
  // tells the entries it left out (a cap holds both scans alike, so those are only guessed at).
  const percent = Number(wi?.world_info_budget ?? 25) || 25, cap = Number(wi?.world_info_budget_cap) || 0;
  const tokens = Math.min(Math.round(percent * size / 100) || 1, cap || Infinity);
  let roomy = null;
  if (typeof wi?.checkWorldInfo === 'function') {
    try { roomy = new Set([...((await wi.checkWorldInfo(scan, 1e9, true, scanData(persona, characters)))?.allActivatedEntries || [])].map(e => entryId(e?.world, e?.uid))); } catch { /* guessed at */ }
  }
  // Every enabled entry of the books the phone reads (the tavern's on, and its own), to name them and say why.
  const on = activeBooks(ctx, wi), names = [...new Set([...on.keys(), ...extraBooks.filter(n => typeof n === 'string' && n.trim())])], entries = new Map();
  for (const name of names) {
    let data = null;
    try { data = await ctx.loadWorldInfo?.(name); } catch { /* a book that cannot be read is left out */ }
    for (const e of Object.values(data?.entries || {})) if (e && !e.disable) entries.set(entryId(name, e.uid), {...e, world: name, own: !on.has(name)});
  }
  const subst = text => typeof ctx.substituteParams === 'function' ? ctx.substituteParams(text) : text, defaults = scanDefaults(wi);
  const keysOf = list => (Array.isArray(list) ? list : []).map(k => String(subst(String(k)) ?? '').trim()).filter(Boolean);
  const hitIn = (e, text) => keysOf(e.key).find(k => keyHit(text, k, e, defaults));
  const near = e => scan.slice(0, e.scanDepth ?? depth).join('\n'), all = scan.join('\n');
  const named = (part, why) => { const e = entries.get(entryId(part.world, part.uid)); return {book: part.world || '', title: e ? titleOf(e) : '（酒馆合在一起的内容）', why, chars: part.text.length}; };
  const whyIn = part => {
    const e = entries.get(entryId(part.world, part.uid));
    if (!e) return '酒馆给的';
    if (e.constant) return '常驻';
    const k = hitIn(e, near(e)) || hitIn(e, all);
    return (part.own ? '只给手机 · ' : '') + (k ? `关键词「${k}」` : '酒馆的规则带上的（递归、向量或别的条目连带）');
  };
  const taken = new Set(parts.map(p => entryId(p.world, p.uid)));
  const kept = parts.filter(p => p.kept).map(p => named(p, whyIn(p)));
  const over = parts.filter(p => p.over).map(p => named(p, `超出「世界书最多」（${most || '不限'} 字），整条没放`));
  const others = [];
  for (const [id, e] of entries) {
    if (taken.has(id)) continue;
    const why = whyNot(e, {skipBooks, skipEntries, near: near(e), all, depth: e.scanDepth ?? depth, keysOf, defaults, hitIn, full: !!roomy?.has(id) && !e.own, known: !!roomy, tokens});
    if (why) others.push({book: e.world, title: titleOf(e), why});
  }
  return {depth, scanned: scan.slice(0, depth).map(t => t.slice(0, 200)), budget: {tokens, size, percent, cap}, kept, over, others};
}
/** Why an enabled entry did not come in, as near as can be told from its settings and the text. full: the same scan
 *  with no budget turns it on, so the tavern's budget left it out. */
function whyNot(e, {skipBooks, skipEntries, near, all, depth, keysOf, defaults, hitIn, full = false, known = false, tokens = 0}) {
  if (skipBooks.includes(e.world)) return '这本书手机不读（在这一页关掉了）';
  if (skipEntries.includes(entryId(e.world, e.uid))) return '这一条手机不读（在这一页关掉了）';
  const rolled = e.useProbability && Number(e.probability ?? 100) < 100;
  if (full && !rolled) return `酒馆的世界书预算（${tokens} token）满了，没排上：它的顺序是 ${Number(e.order) || 0}，酒馆先放顺序数字大的`;
  const limits = [];
  if (e.characterFilter && ((e.characterFilter.names || []).length || (e.characterFilter.tags || []).length)) limits.push(`限定了角色（${e.characterFilter.isExclude ? '不给' : '只给'}：${(e.characterFilter.names || []).join('、') || '某些标签'}）`);
  if (e.group) limits.push(`在包含组「${e.group}」里，同一组只取一条`);
  if (Number(e.delay) > 0) limits.push(`设了延迟（满 ${e.delay} 段才触发）`);
  if (Number(e.cooldown) > 0) limits.push(`设了冷却（${e.cooldown} 段）`);
  if (e.useProbability && Number(e.probability ?? 100) < 100) limits.push(`有 ${e.probability}% 的概率，这次没抽中`);
  if (Array.isArray(e.triggers) && e.triggers.length && !e.triggers.includes('normal')) limits.push('只在某些生成方式下触发');
  const other = known ? '被酒馆别的规则挡住了' : '多半是酒馆的世界书预算满了，或者被它别的规则挡住';
  if (e.constant) return '常驻，但没进来：' + (limits.join('；') || other);
  const keys = keysOf(e.key);
  if (!keys.length) return '';
  const k = hitIn(e, near);
  if (!k) {
    const far = hitIn(e, all);
    return far ? `关键词「${far}」在更早的地方，超出扫描深度（最近 ${depth} 段）` : `这段话里没有它的关键词（${keys.slice(0, 4).join('、')}${keys.length > 4 ? '…' : ''}）`;
  }
  const second = e.selective !== false ? keysOf(e.keysecondary) : [];
  if (second.length) {
    const hits = second.map(x => keyHit(near, x, e, defaults)), any = hits.some(Boolean), every = hits.every(Boolean), logic = Number(e.selectiveLogic ?? 0);
    if (!(logic === 1 ? !every : logic === 2 ? !any : logic === 3 ? every : any)) return `关键词「${k}」对上了，但次要关键词不满足（${LOGIC[logic] || '且任一'}：${second.slice(0, 4).join('、')}）`;
  }
  return `关键词「${k}」对上了，但酒馆没放进来：` + (limits.join('；') || other);
}

/** Every book the tavern has, for picking ones the phone alone reads (sorted, as the tavern lists them). */
export async function loreNames(load = () => import('/scripts/world-info.js')) {
  const wi = await load();
  return [...new Set((wi?.world_names || []).filter(n => typeof n === 'string' && n.trim()))];
}

/**
 * The books the tavern has turned on now (global, the character's own and extra books, the chat's, the persona's) and
 * the ones the phone alone reads (extra: from 只给手机), each with its entries that are not switched off: what the
 * phone could read, for picking what it leaves out.
 */
export async function loreBooks(context, load = () => import('/scripts/world-info.js'), {extra = []} = {}) {
  const ctx = context();
  let wi = null;
  try { wi = await load(); } catch { /* without the module only the character, chat and persona books are known */ }
  const from = activeBooks(ctx, wi);
  for (const name of extra) if (typeof name === 'string' && name.trim() && !from.has(name)) from.set(name, ['只给手机']);
  const books = [];
  for (const [name, where] of from) {
    let data = null;
    try { data = await ctx.loadWorldInfo?.(name); } catch { /* a book that cannot be read is listed without entries */ }
    const entries = Object.values(data?.entries || {}).filter(e => e && !e.disable)
      .sort((a, b) => (a.displayIndex ?? a.uid) - (b.displayIndex ?? b.uid))
      .map(e => { const keys = (Array.isArray(e.key) ? e.key : []).map(String).filter(Boolean).slice(0, 8);
        return {id: entryId(name, e.uid), title: String(e.comment || '').trim() || keys.join('、') || '（没有标题）', keys, constant: !!e.constant, preview: String(e.content || '').replace(/\s+/g, ' ').trim().slice(0, 80)}; });
    books.push({name, from: where, entries});
  }
  return books;
}

/** The 世界书 options of a chat preset, for worldInfoFor. */
export const loreOptions = preset => ({skipBooks: preset.loreSkipBooks || [], skipEntries: preset.loreSkipEntries || [], extraBooks: preset.loreExtraBooks || [], cleanTags: preset.cleanTags || [], max: preset.loreMax ?? LORE_MAX});
