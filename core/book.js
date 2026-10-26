// 绘本: a stretch of the story turned into a picture book — pages of a few sentences each, a picture on most, read
// aloud in the narrator's and the characters' voices. Two ways to make one: 原文 (the story as written, cut into pages;
// its own pictures and voice lines kept) and 改写 (the text model retells it as a picture book: a title, chapters,
// short pages, what to draw on each, who says what). Pure logic here; the app (ui/book.js) asks for the text, the
// pictures and the voices.
import {THEME_IDS, BOOK_THEMES, guessTheme} from './book-themes.js';

export const BOOK_LIMIT = {pages: 300, text: 400, title: 40, books: 60, lines: 16};
const text = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const LAYOUTS = ['top', 'full', 'frame'];

/**
 * A page: {kind: 'cover' | 'chapter' | 'page' | 'end', text, picture, prompt, layout, lines}. picture: where its picture
 * is — {url} (one of the story's, in the tavern) or {id} (one drawn for the book, kept with it) or null; prompt: what
 * to draw when there is none (English tags); lines: what is read aloud, in order — [{role ('' = the narrator), text,
 * emotion, from?: {id, line}}] (from: a voice line of the story, so its voice is the one already made).
 */
export function normalizePage(p) {
  const kind = ['cover', 'chapter', 'page', 'end'].includes(p?.kind) ? p.kind : 'page';
  const pic = p?.picture && typeof p.picture === 'object' ? (typeof p.picture.id === 'string' && p.picture.id ? {id: p.picture.id.slice(0, 80)} : typeof p.picture.url === 'string' && /^(\/|https?:|data:image\/|blob:)/.test(p.picture.url) ? {url: p.picture.url.slice(0, 2000)} : null) : null;
  const lines = (Array.isArray(p?.lines) ? p.lines : []).map(l => ({role: text(l?.role, 40), text: text(l?.text, BOOK_LIMIT.text), emotion: text(l?.emotion, 40), ...(l?.from && Number.isInteger(l.from.id) && Number.isInteger(l.from.line) ? {from: {id: l.from.id, line: l.from.line}} : {})})).filter(l => l.text).slice(0, BOOK_LIMIT.lines);
  return {kind, text: text(p?.text, BOOK_LIMIT.text * 2), picture: pic, prompt: text(p?.prompt, 600), layout: LAYOUTS.includes(p?.layout) ? p.layout : '', lines};
}
/** A book as kept: {id, title, subtitle, author, theme, mode, source: {chat, from, to}, pages, at, made}. */
export function normalizeBook(b) {
  // A book too long keeps its cover and its last page (完), whatever is cut between.
  let list = Array.isArray(b?.pages) ? b.pages : [];
  if (list.length > BOOK_LIMIT.pages) list = [...list.slice(0, BOOK_LIMIT.pages - 1), list.at(-1)];
  const pages = list.map(normalizePage);
  return {
    id: text(b?.id, 60) || 'b-' + Date.now().toString(36),
    title: text(b?.title, BOOK_LIMIT.title) || '无题', subtitle: text(b?.subtitle, 60), author: text(b?.author, 40),
    theme: THEME_IDS.includes(b?.theme) ? b.theme : 'fairy', mode: b?.mode === 'retell' ? 'retell' : 'story',
    source: {chat: text(b?.source?.chat, 200), name: text(b?.source?.name, 80), from: Number(b?.source?.from) || 0, to: Number(b?.source?.to) || 0},
    pages, at: Number(b?.at) || Date.now(), made: Number(b?.made) || Number(b?.at) || Date.now(),
  };
}

/**
 * The story's words without what is not story: a card's template ({{角色的名字}}, {{当前好感度数值}}/100 — a status bar
 * written as placeholders) is taken out, and what is left with no words in it (numbers, signs) is dropped ('').
 */
export function storyWords(value) {
  const t = String(value || '').replace(/\{\{[^{}]*\}\}/g, '').trim();
  return /[\p{L}]/u.test(t) ? t : '';
}

/** Text cut into pieces of at most `size` characters, at a sentence's end where it can (else a comma, else anywhere). */
export function sentences(value, size = 160) {
  const out = [];
  let rest = String(value || '').trim();
  while (rest.length > size) {
    const head = rest.slice(0, size), at = list => Math.max(...list.map(c => head.lastIndexOf(c)));
    let cut = at(['。', '！', '？', '…', '；', '!', '?', ';']);
    if (cut < size / 3) cut = Math.max(cut, at(['，', '、', ',', ' ']));
    let end = cut >= size / 3 ? cut + 1 : size;
    while (end < rest.length && /[」』”’）)】]/.test(rest[end])) end++;
    out.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** What a page's text shows: the narration as paragraphs, a character's lines as 名字：「…」. */
export function pageText(lines) {
  let out = '', last = '';
  for (const l of lines) {
    const piece = l.role ? `${l.role === last ? '' : l.role + '：'}「${l.text.replace(/^[「“"]|[」”"]$/g, '')}」` : l.text;
    out += (out ? (l.role && l.role === last ? '' : '\n') : '') + piece;
    last = l.role;
  }
  return out;
}

/**
 * 原文: the story's messages ([{id, user, steps}] — host-vn.js bookSource, steps as core/vn.js storySteps) as pages of
 * about `size` characters each. A picture of the story starts a page with it; a voice line keeps its place in the
 * story (from) so its voice is the one already made; the user's own words are said by the user.
 */
export function storyPages(messages, {size = 160} = {}) {
  const pages = [];
  let lines = [], picture = null, count = 0;
  const flush = () => { if (lines.length || picture) pages.push(normalizePage({kind: 'page', lines, text: pageText(lines), picture})); lines = []; picture = null; count = 0; };
  for (const m of messages || []) for (const s of m.steps || []) {
    if (s.kind === 'bg') { flush(); picture = {url: s.url}; continue; }
    if (s.kind !== 'say' && s.kind !== 'narrate') continue;
    const whole = storyWords(s.text);
    if (!whole) continue;
    // A long stretch of story goes over pages, cut at sentence ends; a line of someone's stays on one page.
    // A page with a picture holds about half as many words (they sit beside it, or over it).
    for (const t of s.kind === 'narrate' ? sentences(whole, picture ? Math.round(size * .55) : size) : [whole]) {
      if (count && count + t.length > (picture ? size * .55 : size)) flush();
      const prev = lines.at(-1);
      if (s.kind === 'say' && s.part && prev?.from?.line === s.line && prev.from.id === m.id) prev.text += t;
      else lines.push(s.kind === 'say' ? {role: s.role || '', text: t, emotion: s.emotion || '', ...(s.user ? {} : Number.isInteger(s.line) ? {from: {id: m.id, line: s.line}} : {})} : {role: '', text: t, emotion: ''});
      count += t.length;
    }
  }
  flush();
  return pages.map(p => ({...p, text: pageText(p.lines)}));
}

/** The story as a script for the text model: 旁白 lines, 名字「…」 lines, and [图N] where a picture of it stands. */
export function storyScript(messages) {
  const out = [], pictures = [];
  for (const m of messages || []) for (const s of m.steps || []) {
    if (s.kind === 'bg') { pictures.push(s.url); out.push(`[图${pictures.length}]`); }
    else if (s.kind === 'narrate' && storyWords(s.text)) out.push(storyWords(s.text));
    else if (s.kind === 'say' && storyWords(s.text)) out.push(`${s.role || '某人'}「${storyWords(s.text)}」${s.emotion ? `（${s.emotion}）` : ''}`);
  }
  return {script: out.join('\n'), pictures};
}

const THEME_LIST = THEME_IDS.map(id => `${id}（${BOOK_THEMES[id].label}）`).join('、');
/**
 * What the text model is asked, to retell a part of the story as a picture book. part: {index, of} when a long story
 * is retold in parts (the title and kind come with the first; later parts go on from `before`, the last page so far).
 */
export function retellPrompt(script, {pages = 12, cast = [], part = null, before = ''} = {}) {
  const system = `你是一位绘本编辑，把一段角色扮演的故事改写成一本绘本。要求：
- 保留故事里发生的事和人物说的关键的话，按顺序讲；可以删去重复和琐碎的部分，语气生动、适合朗读。
- 一共写 ${pages} 页左右；每页 40 到 110 个汉字，一页讲一个画面。
- 每页给出 lines：这一页朗读的内容，按顺序拆成几段，旁白的 role 写空字符串，人物说话的 role 写人物名字（只能用：${cast.join('、') || '故事里的名字'}），text 是那段文字（人物的话不带引号），emotion 写这段话的情绪（可空）。把这一页的 lines 连起来就是这一页的全部文字。
- 每页给出 picture：故事里已有的图（脚本里写着 [图N]）正好配得上这一页，就写数字 N；否则写 0，并在 scene 里用英文逗号分隔的绘图标签描述这一页的画面（人物用名字、他们在做什么、表情、地点、时间、气氛，不写画风）。
- 在新的段落开始的那一页加 chapter：章节名（4 到 10 个字），整本书 2 到 6 章。
${part && part.index > 0 ? `- 这是整个故事的第 ${part.index + 1} 部分（共 ${part.of} 部分），接着前面写，不要重复前面的内容，不要写标题。` : `- 给这本绘本起一个书名 title（2 到 12 个字）和一句副标题 subtitle，判断故事类型 genre（只能选一个：${THEME_LIST}），写一句封面画面 cover（英文绘图标签）。`}
只输出一个 JSON 对象，不要任何别的文字：{${part && part.index > 0 ? '' : '"title":"","subtitle":"","genre":"","cover":"",'}"pages":[{"chapter":"","lines":[{"role":"","text":"","emotion":""}],"picture":0,"scene":""}]}`;
  const user = `${before ? `前面最后一页写到：${before}\n\n` : ''}故事脚本：\n${script}`;
  return {system, user};
}

/** The first JSON object in the model's answer (it may wrap it in a code block or talk around it). */
export function jsonIn(answer) {
  const s = String(answer || ''), start = s.indexOf('{');
  if (start < 0) throw Error('文字模型没有给出绘本内容');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { break; }
    }
  }
  // A last try: the model often leaves a trailing comma or a cut-off end.
  try { return JSON.parse(s.slice(start).replace(/,\s*([}\]])/g, '$1')); } catch { throw Error('文字模型给的绘本内容读不出来，再试一次'); }
}

/**
 * The model's answer made into pages: {title, subtitle, genre, cover, pages}. pictures: the story's pictures ([图N]
 * is pictures[N-1]); cast: the names it may use (others are the narrator). A chapter heading becomes a page of its own.
 */
export function retoldPages(answer, {pictures = [], cast = []} = {}) {
  const data = typeof answer === 'string' ? jsonIn(answer) : answer || {};
  const names = new Set(cast), pages = [];
  for (const raw of Array.isArray(data.pages) ? data.pages : []) {
    const chapter = text(raw?.chapter, 30);
    if (chapter) pages.push(normalizePage({kind: 'chapter', text: chapter}));
    const lines = (Array.isArray(raw?.lines) ? raw.lines : typeof raw?.text === 'string' ? [{role: '', text: raw.text}] : [])
      .map(l => ({role: names.has(text(l?.role, 40)) ? text(l.role, 40) : '', text: text(l?.text, BOOK_LIMIT.text).replace(/^[「“"]|[」”"]$/g, ''), emotion: text(l?.emotion, 40)})).filter(l => l.text);
    if (!lines.length) continue;
    const n = Number(raw?.picture), url = Number.isInteger(n) && n > 0 ? pictures[n - 1] : '';
    pages.push(normalizePage({kind: 'page', lines, text: pageText(lines), picture: url ? {url} : null, prompt: url ? '' : text(raw?.scene, 600)}));
  }
  if (!pages.some(p => p.kind === 'page')) throw Error('文字模型没有写出绘本的页');
  return {title: text(data.title, BOOK_LIMIT.title), subtitle: text(data.subtitle, 60), genre: THEME_IDS.includes(data.genre) ? data.genre : '', cover: text(data.cover, 600), pages};
}

/**
 * A whole book from its pages: the cover first, 完 at the end, the kind of story (the model's, else guessed from the
 * words), and how many pages to ask for: about one per 180 characters of story, 8 to 30.
 */
export function bookOf({id, title, subtitle = '', author = '', theme = '', mode = 'story', source = {}, pages, cover = '', coverPicture = null}) {
  const words = pages.map(p => p.text).join('\n');
  return normalizeBook({id, title: title || '无题', subtitle, author, theme: theme || guessTheme(words), mode, source,
    pages: [{kind: 'cover', text: '', picture: coverPicture, prompt: cover}, ...pages, {kind: 'end', text: '完'}]});
}
export const pagesFor = chars => Math.max(8, Math.min(30, Math.round(chars / 180)));
/** A long script in parts the model can take at once (cut between lines), each with its share of the pages. */
export function scriptParts(script, max = 9000) {
  const out = [];
  let part = '';
  for (const line of script.split('\n')) { if (part && part.length + line.length > max) { out.push(part); part = ''; } part += (part ? '\n' : '') + line; }
  if (part) out.push(part);
  return out;
}
/** The picture prompt of a page: what happens on it, the theme's style, and who is in it (their looks). */
export function picturePrompt(page, theme, looks = {}) {
  const who = Object.keys(looks).filter(name => (page.prompt || page.text || '').includes(name));
  return {prompt: [page.prompt || '', BOOK_THEMES[theme]?.art || ''].filter(Boolean).join(', '), people: who.map(name => ({name, looks: looks[name]}))};
}
/**
 * A page's lines from its words as edited: a line 名字：「…」 is that person's (when they are in the book), the rest is
 * the 旁白's. A line the same as one before keeps its voice line of the story (from) and its 情绪.
 */
export function linesFromText(value, cast = [], old = []) {
  const names = new Set(cast), out = [];
  for (const raw of String(value || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([^「：:\s]{1,20})[：:]\s*「([\s\S]+)」$/.exec(line);
    const role = m && names.has(m[1]) ? m[1] : '', text = role ? m[2].trim() : line;
    const same = old.find(l => l.text === text && l.role === role);
    out.push(same ? {...same} : {role, text, emotion: ''});
  }
  return out;
}
