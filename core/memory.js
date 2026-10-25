// 记忆: a long memory for each phone chat (private or group), in the way of 剧情剪辑台 (BakemonoMemory). The last few
// dozen messages always go to the model as they are; older ones are written up in layers, each kept in this browser:
//   level 0  聊天摘要   one batch of older messages (dates, who said what, promises, gifts, feelings)
//   level 1  阶段总结   several 摘要 merged
//   level 2+ 长期总览   several 阶段总结 (or 总览) merged again, as many levels as it takes
// A node covered by a higher one is not sent again: the model gets the uncovered nodes (the roots), oldest first.
// On top of that, 想起来的旧聊天: older messages cut into small pieces and searched with the latest messages, so the
// exact words of a long-gone moment can come back. Searching is local (BM25 over Chinese two-character pieces, as in
// 剧情剪辑台) and, with a 向量模型 set up, mixed with embedding similarity.
// No DOM, storage or network here: the plans, the prompts, the parsers, the search and the texts sent to the model.
import {promptText} from './prompt-rules.js';
import {messageLine} from './chat.js';

export const MEMORY_LIMITS = Object.freeze({batch: [10, 200], stage: [2, 20], epic: [2, 20], recall: [0, 10], text: 6000, nodes: 600, chunk: 8, cap: 8000});
export function defaultMemory() {
  // story: the memory also goes into the story's own requests (off: it takes room there). storyKeys: the extension
  // prompts other plugins inject that hold the story's long memory, read into the phone's requests (更早的剧情).
  return {enabled: true, batch: 40, stage: 5, epic: 4, recall: 3, story: false, storyKeys: Object.keys(STORY_MEMORY)};
}
/** Extension prompts of memory plugins the phone knows by name (any other can be picked by hand). */
export const STORY_MEMORY = Object.freeze({bakemono_memory: '剧情剪辑台', '1_memory': '酒馆总结'});
/** The story memory other plugins put into the tavern's extension prompts, for the phone's requests ('' without). */
export function storyMemoryText(prompts, keys, cap = 4000) {
  const parts = [];
  for (const key of keys || []) {
    const value = String(prompts?.[key]?.value ?? '').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (value) parts.push(value);
  }
  const text = parts.join('\n\n');
  return text.length > cap ? '……' + text.slice(-cap) : text;
}
const count = (value, [min, max], fallback) => { const n = Math.round(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
export function normalizeMemory(value) {
  const base = defaultMemory(), v = value && typeof value === 'object' ? value : {};
  return {enabled: v.enabled !== false, batch: count(v.batch, MEMORY_LIMITS.batch, base.batch), stage: count(v.stage, MEMORY_LIMITS.stage, base.stage),
    epic: count(v.epic, MEMORY_LIMITS.epic, base.epic), recall: count(v.recall, MEMORY_LIMITS.recall, base.recall), story: v.story === true,
    storyKeys: Array.isArray(v.storyKeys) ? [...new Set(v.storyKeys.map(k => String(k).trim().slice(0, 120)).filter(k => k && !k.startsWith('sttts.')))].slice(0, 20) : base.storyKeys};
}

// ---------- The book: one per chat ----------
export const bookId = threadId => 'book:' + threadId;
export const LEVEL_NAMES = ['聊天摘要', '阶段总结', '长期总览'];
export const levelName = level => LEVEL_NAMES[Math.min(level, 2)] + (level > 2 ? ` L${level}` : '');
const clip = (value, max) => String(value ?? '').slice(0, max);
/** A book as it is stored: {id, kind: 'memory', threadId, name, at, through, throughAt, nodes: [Node]}. through is the
 *  last message written up. Node: {id, level, text, from, to (times), count (messages), covers (ids), coveredBy, at, edited}. */
export function cleanBook(b, at = Date.now()) {
  const threadId = clip(b?.threadId, 512);
  if (!threadId) throw Error('不知道是哪段聊天的记忆');
  const nodes = (Array.isArray(b.nodes) ? b.nodes : []).slice(-MEMORY_LIMITS.nodes).map(n => ({
    id: clip(n?.id, 100) || crypto.randomUUID(), level: count(n?.level, [0, 9], 0), text: clip(n?.text, MEMORY_LIMITS.text).trim(),
    from: Number(n?.from) || 0, to: Number(n?.to) || 0, count: count(n?.count, [0, 100000], 0),
    covers: (Array.isArray(n?.covers) ? n.covers : []).map(x => clip(x, 100)).slice(0, 50), coveredBy: clip(n?.coveredBy, 100), at: Number(n?.at) || at, ...(n?.edited ? {edited: true} : {})
  })).filter(n => n.text);
  const ids = new Set(nodes.map(n => n.id));
  for (const n of nodes) { if (n.coveredBy && !ids.has(n.coveredBy)) n.coveredBy = ''; n.covers = n.covers.filter(x => ids.has(x)); }
  return {id: bookId(threadId), kind: 'memory', threadId, name: clip(b.name, 60), at, through: clip(b.through, 512), throughAt: Number(b.throughAt) || 0, nodes};
}
export const emptyBook = (threadId, name = '') => cleanBook({threadId, name, nodes: []});
/** The nodes the model gets: not covered by a higher one, oldest first. */
export const roots = book => (book?.nodes || []).filter(n => !n.coveredBy).sort((a, b) => a.from - b.from || a.level - b.level);
const said = thread => (thread?.messages || []).filter(m => m.kind !== 'system');

/** Messages not written up yet: after book.through (or, when that message is gone, after throughAt). */
export function unwritten(thread, book) {
  const list = said(thread);
  if (!book?.through && !book?.throughAt) return list;
  const i = list.findIndex(m => m.id === book.through);
  return i >= 0 ? list.slice(i + 1) : list.filter(m => m.at > (book.throughAt || 0));
}
/**
 * The next batch to write up: older messages than the ones always sent as they are (window), once there are `batch` of
 * them. force (立即整理): whatever older messages there are (at least a few). [] when there is nothing to do.
 */
export function nextBatch(thread, book, {window = 30, batch = 40, force = false} = {}) {
  const waiting = unwritten(thread, book), older = waiting.slice(0, Math.max(0, waiting.length - window));
  if (older.length >= batch) return older.slice(0, batch);
  return force && older.length >= 4 ? older.slice(0, batch * 2) : [];
}
/** The next merge: the oldest `stage` uncovered 摘要 into a 阶段总结, or `epic` uncovered nodes of a higher level into
 *  the next one. null when nothing is due. */
export function nextMerge(book, {stage = 5, epic = 4} = {}) {
  const open = roots(book);
  for (let level = 0; level < 9; level++) {
    const here = open.filter(n => n.level === level), need = level === 0 ? stage : epic;
    if (here.length >= need) return {level: level + 1, nodes: here.slice(0, need)};
  }
  return null;
}
/** Adds a written node to the book: a 摘要 moves `through` on; a merge marks what it covers. */
export function addNode(book, node, {through = null} = {}) {
  const out = structuredClone(book), id = crypto.randomUUID(), at = Date.now();
  const covers = (node.covers || []).filter(x => out.nodes.some(n => n.id === x));
  const from = covers.length ? Math.min(...covers.map(x => out.nodes.find(n => n.id === x).from)) : node.from;
  const to = covers.length ? Math.max(...covers.map(x => out.nodes.find(n => n.id === x).to)) : node.to;
  const total = covers.length ? covers.reduce((s, x) => s + (out.nodes.find(n => n.id === x).count || 0), 0) : node.count;
  out.nodes.push({id, level: node.level, text: clip(node.text, MEMORY_LIMITS.text).trim(), from, to, count: total, covers, coveredBy: '', at});
  for (const n of out.nodes) if (covers.includes(n.id)) n.coveredBy = id;
  if (through) { out.through = through.id; out.throughAt = through.at; }
  out.at = at;
  return out;
}
/** Removes a node: what it covered is uncovered again (and sent again, until merged anew). */
export function removeNode(book, id) {
  const out = structuredClone(book);
  out.nodes = out.nodes.filter(n => n.id !== id);
  for (const n of out.nodes) if (n.coveredBy === id) n.coveredBy = '';
  out.at = Date.now();
  return out;
}

/**
 * The book after messages were deleted (gone: the times they were sent; left: the chat as it is now). A 摘要 made from
 * any of them goes, and so does every 摘要 after it (they would be written again anyway: what is written up goes back
 * to before the first one gone), with the summaries merged from them; the summaries before stand as they were. The
 * messages left there are written up again later, so nothing deleted stays in the memory. Unchanged when no summary
 * held a deleted message.
 */
export function pruneBook(book, gone, left) {
  const times = (gone || []).filter(Number.isFinite);
  const hit = (book?.nodes || []).filter(n => n.level === 0 && times.some(t => t >= n.from && t <= n.to));
  if (!hit.length) return book;
  const earliest = Math.min(...hit.map(n => n.from));
  const drop = new Set(book.nodes.filter(n => n.level === 0 && n.from >= earliest).map(n => n.id));
  // A summary merged from any dropped one goes too (and one merged from that).
  for (let grew = true; grew;) { grew = false; for (const n of book.nodes) if (!drop.has(n.id) && (n.covers || []).some(c => drop.has(c))) { drop.add(n.id); grew = true; } }
  const out = structuredClone(book);
  out.nodes = out.nodes.filter(n => !drop.has(n.id)).map(n => drop.has(n.coveredBy) ? {...n, coveredBy: ''} : n);
  const before = said({messages: left}).filter(m => m.at < earliest).at(-1);
  out.through = before?.id || '';
  out.throughAt = before ? before.at : earliest - 1;
  out.at = Date.now();
  return out;
}

// ---------- Prompts ----------
const pad = n => String(n).padStart(2, '0');
export function day(at) { const d = new Date(at); return `${d.getMonth() + 1}月${d.getDate()}日`; }
export function span(from, to) { const a = day(from), b = day(to); return a === b ? a : `${a}–${b}`; }
const clock = at => { const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** Messages as lines, with the date written where a new day starts and the time on each line. */
export function transcript(messages, user) {
  let last = '';
  const out = [];
  for (const m of messages) {
    const line = messageLine(m, user);
    if (!line) continue;
    const today = day(m.at);
    if (today !== last) { out.push(`【${today}】`); last = today; }
    out.push(`${clock(m.at)} ${line}`);
  }
  return out.join('\n');
}

/**
 * The request that writes up a batch of messages (level 0) or merges nodes (level 1+).
 * who: the chat's name ('和澄音' or a group's name); user: the user's name.
 */
export function buildMemoryRequest({prompts = {}, level, messages = [], nodes = [], user = '我', who = '', group = false}) {
  const where = group ? `群聊「${who}」` : `${user}和${who}的手机聊天`;
  if (level === 0) {
    return [{role: 'system', content: promptText(prompts, 'memory', 'system', {'摘要': true, '哪里': where})},
      {role: 'user', content: `聊天记录：\n${transcript(messages, user)}`}];
  }
  const system = promptText(prompts, 'memory', 'system', {'哪里': where, '下一层': levelName(level - 1), '这一层': levelName(level), '字数': level === 1 ? '300 到 700 字' : '400 到 900 字'});
  return [{role: 'system', content: system},
    {role: 'user', content: nodes.map(n => `【${levelName(n.level)} · ${span(n.from, n.to)}】\n${n.text}`).join('\n\n')}];
}
/** The written text: think blocks, code fences and a stray heading line dropped. */
export function parseMemory(reply) {
  const text = String(reply || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```[a-z]*\n?|```/g, '').trim()
    .replace(/^(?:#+\s*)?(?:聊天摘要|阶段总结|长期总览)[：:]?\s*\n/, '').trim();
  if (text.length < 10) throw Error('这次没有写出摘要，可以再试一次');
  return text.slice(0, MEMORY_LIMITS.text);
}

/** What goes into a request: the roots, oldest first, under a heading. Too long: the newest low-level ones wait out. */
export function memoryText(book, {who = '', cap = MEMORY_LIMITS.cap} = {}) {
  const list = roots(book);
  if (!list.length) return '';
  const keep = new Set();
  let used = 0;
  for (const n of list.slice().sort((a, b) => b.level - a.level || a.from - b.from)) {
    const cost = n.text.length + 30;
    if (used + cost > cap && keep.size) continue;
    keep.add(n.id); used += cost;
  }
  return `【${who}的长期记忆】（更早的聊天整理成的，按时间排；最近的聊天记录另外附上）\n` + list.filter(n => keep.has(n.id)).map(n => `- ${levelName(n.level)}（${span(n.from, n.to)}）：${n.text}`).join('\n');
}

// ---------- 想起来的旧聊天: local search (BM25) and embedding similarity ----------
const STOP = new Set('的了是在与和及或也都而被把对从为有还就又很这那中上下来去后前着过于将并但则所其之吗呢吧啊呀哦嗯哈');
const plainText = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
/** Search terms: Latin words and Chinese two-character pieces (names come back without a dictionary). */
export function terms(value) {
  const text = plainText(value), out = text.match(/[a-z0-9][a-z0-9_.-]+/g) || [];
  const useful = word => [...word].filter(c => !STOP.has(c)).length >= 2;
  for (const run of text.match(/[㐀-鿿]+/g) || []) {
    if (run.length > 2 && run.length <= 8 && useful(run)) out.push(run);
    for (let i = 0; i + 2 <= run.length; i++) { const two = run.slice(i, i + 2); if (useful(two)) out.push(two); }
  }
  return out;
}
/** BM25 scores of the records for the query, scaled 0..1 (1: the best match). Each record: {text}. */
export function lexicalScores(records, query) {
  const docs = records.map(r => { const t = terms(r.text), f = new Map(); for (const x of t) f.set(x, (f.get(x) || 0) + 1); return {f, length: t.length}; });
  const n = docs.filter(d => d.length).length || 1, average = docs.reduce((s, d) => s + d.length, 0) / n || 1, k1 = 1.2, b = .75;
  const scores = docs.map(() => 0), hits = docs.map(() => new Set());
  for (const term of new Set(terms(query))) {
    const having = docs.filter(d => d.f.has(term)).length;
    if (!having) continue;
    const idf = Math.log(1 + (n - having + .5) / (having + .5));
    docs.forEach((d, i) => { const f = d.f.get(term); if (!f) return; scores[i] += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * d.length / average)); hits[i].add(term); });
  }
  const top = Math.max(0, ...scores);
  return scores.map((s, i) => ({lexical: top ? s / top : 0, raw: s, matched: [...hits[i]]}));
}
export function cosine(a = [], b = []) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
/** A string's short hash, for remembering embeddings by text. */
export function textKey(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + String(text).length; }

/**
 * Pieces of the older chat to search: every `chunk` messages before the ones always sent (window), oldest first.
 * {id, from, to, text (lines with dates), messages: ids}.
 */
export function chunks(thread, {window = 30, size = MEMORY_LIMITS.chunk, user = '我'} = {}) {
  const list = said(thread), older = list.slice(0, Math.max(0, list.length - window)), out = [];
  for (let i = 0; i < older.length; i += size) {
    const part = older.slice(i, i + size), text = transcript(part, user);
    if (text.trim()) out.push({id: part[0].id, from: part[0].at, to: part.at(-1).at, text, messages: part.map(m => m.id)});
  }
  return out;
}
/**
 * The pieces worth bringing back for the latest messages (query): scored by BM25 and, when vectors are given (by
 * textKey of each piece and 'query'), by similarity too. Lexical only: a piece needs at least two matched terms.
 * Returns [{...piece, score, matched}] best first, at most `limit`.
 */
export function recall(pieces, query, {limit = 3, vectors = null} = {}) {
  if (!pieces.length || !limit || !String(query || '').trim()) return [];
  const lexical = lexicalScores(pieces, query), q = vectors?.get?.('query');
  const scored = pieces.map((p, i) => {
    const v = q && vectors.get(textKey(p.text)), semantic = v ? Math.max(0, cosine(q, v)) : null;
    const score = semantic === null ? lexical[i].lexical : semantic * .68 + lexical[i].lexical * .32;
    return {...p, score: Math.round(score * 1000) / 1000, semantic, matched: lexical[i].matched};
  });
  return scored.filter(p => p.semantic !== null ? p.score >= .45 : p.matched.length >= 2 && p.score >= .35)
    .sort((a, b) => b.score - a.score || b.from - a.from).slice(0, limit).sort((a, b) => a.from - b.from);
}
export function recallText(found, {who = ''} = {}) {
  return found.length ? `【想起来的旧聊天】（和现在聊的有关的${who}更早的原话，只作参考）\n` + found.map(p => p.text).join('\n……\n') : '';
}
