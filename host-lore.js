// 世界书 for the phone: chat replies, calls and 朋友圈 are asked for apart from the story (generateRaw), so the tavern
// does not add its World Info to them. This asks the tavern which entries the same scan would turn on (the active
// character's book, global and chat books, constant entries, keywords found in the given text) without changing
// anything (dry run: no activation events, timers left alone), and returns their text for the phone's own prompt.
import {cleanTagged} from './core/chat.js';

// The most of it a phone request takes unless the chat preset says (loreMax; 0: none of our own): whole entries only.
const LORE_MAX = 30000;

/**
 * texts: what to scan, oldest first (the phone conversation, recent story, the contacts' names).
 * persona / characters: the user's persona and the contacts' card text, for entries that also match those.
 * skipBooks / skipEntries: books, and entries ("book#uid", picked in the phone), left out.
 * cleanTags: tags whose blocks are taken out of the text (a status bar the story asks for, which the phone must not copy).
 * Returns '' when the tavern has no World Info for this (or is older than 1.12.14).
 */
export async function worldInfoFor(context, {texts = [], persona = '', characters = '', skipBooks = [], skipEntries = [], cleanTags = [], max: most = LORE_MAX, report = () => {}, load = () => import('/scripts/world-info.js')} = {}) {
  const limit = most || Infinity;
  const note = (kind, error, level = 'error') => { try { report('世界书读取', {kind, message: error?.message || String(error), stack: error?.stack}, level); } catch {} };
  try {
    const ctx = context();
    if (typeof ctx?.getWorldInfoPrompt !== 'function') { note('接口不可用', '当前酒馆没有提供世界书扫描接口，本次未带入世界书', 'warn'); return ''; }
    const scan = texts.map(t => String(t || '').trim()).filter(Boolean).reverse(), max = Number(ctx.maxContext) || 8192;
    const global = {trigger: 'normal', personaDescription: persona, characterDescription: characters, characterPersonality: '', characterDepthPrompt: '', scenario: '', creatorNotes: ''};
    let parts = null;
    // Books or entries left out: the entries themselves are needed (which book, which title). The tavern's checkWorldInfo
    // (1.13.2 and later) gives them; where it cannot be loaded, everything turned on is used.
    if (skipBooks.length || skipEntries.length) {
      try {
        const {checkWorldInfo} = await load();
        const r = await checkWorldInfo(scan, max, true, global);
        parts = [...(r?.allActivatedEntries || [])].filter(e => !skipBooks.includes(e?.world) && !skipEntries.includes(entryId(e?.world, e?.uid)))
          .map(e => typeof ctx.substituteParams === 'function' ? ctx.substituteParams(String(e?.content || '')) : e?.content);
      } catch (error) { note('条目筛选不可用，回退到酒馆已触发内容', error, 'warn'); parts = null; }
    }
    if (!parts) {
      const r = await ctx.getWorldInfoPrompt(scan, max, true, global);
      parts = [r?.worldInfoBefore, r?.worldInfoAfter, ...(r?.anBefore || []), ...(r?.anAfter || []),
        ...(r?.worldInfoDepth || []).flatMap(d => d?.entries || []), ...(r?.worldInfoExamples || []).map(e => e?.content)];
    }
    const seen = new Set(), out = [];
    let used = 0;
    for (const part of parts) {
      const text = cleanTagged(part, cleanTags);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      // One entry too long for what is left is skipped; shorter ones after it may still fit.
      if (used + text.length > limit) { if (!out.length) { out.push(text.slice(0, limit)); used = limit; } continue; }
      out.push(text); used += text.length + 2;
    }
    return out.join('\n\n');
  } catch (error) { note('扫描失败，本次未带入世界书', error); return ''; }
}

/** How an entry is named in a preset's list of entries left out. */
export const entryId = (book, uid) => `${book}#${uid}`;

/**
 * The books the tavern has turned on now (global, the character's own and extra books, the chat's, the persona's), each
 * with its entries that are not switched off: what the phone could read, for picking what it leaves out.
 */
export async function loreBooks(context, load = () => import('/scripts/world-info.js')) {
  const ctx = context(), from = new Map();
  const add = (name, where) => { if (typeof name === 'string' && name.trim()) from.set(name, [...new Set([...(from.get(name) || []), where])]); };
  let wi = null;
  try { wi = await load(); } catch { /* without the module only the character, chat and persona books are known */ }
  for (const name of wi?.selected_world_info || []) add(name, '全局');
  const character = ctx?.characters?.[ctx?.characterId];
  add(character?.data?.extensions?.world, '角色卡');
  const file = String(character?.avatar || '').replace(/\.[^.]+$/, '');
  for (const name of wi?.world_info?.charLore?.find(x => x?.name === file)?.extraBooks || []) add(name, '角色卡');
  add(ctx?.chatMetadata?.world_info, '聊天');
  add(ctx?.powerUserSettings?.persona_description_lorebook, '人设');
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
export const loreOptions = preset => ({skipBooks: preset.loreSkipBooks || [], skipEntries: preset.loreSkipEntries || [], cleanTags: preset.cleanTags || [], max: preset.loreMax ?? LORE_MAX});
