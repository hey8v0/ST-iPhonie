// 绘本: a stretch of the story made into a picture book, laid out the way picture books are — in spreads, the two pages
// seen together when the book lies open. A few sentences on each tell what happens (so the words alone tell the
// story), and they are what is read aloud; the pictures show the rest. Each spread takes one of the layouts picture
// books use — a small picture alone in white space, a picture filling one page with the words on the page across, a
// picture in a frame, a picture across both pages with room left in it for the words, a picture fading into the paper,
// only the foreground drawn with the words in the open space above it, two small moments side by side, someone's 立绘
// standing on the paper — chosen to follow the story's rise and fall: quiet at the start, growing, across both pages at
// the height of it, quiet again at the end. Two ways to make one: 改编 (the text model makes the story a picture
// book) and 原文 (the story as written, a picture and a page of its words to each spread).
// Pure logic here; ui/book.js asks for the words, the pictures and the voices; core/book-pages.js lays spreads out.
import {THEME_IDS, BOOK_THEMES, guessTheme} from './book-themes.js';

export const BOOK_LIMIT = {spreads: 60, pictures: 2, words: 16, word: 400, title: 40, heading: 24, sound: 40, fx: 2};
const text = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
// The words a page shows and reads have no emoji: a pictograph shown in colour goes with its skin tone, joiners and
// keycap; signs written as text (★ ♪ ♥ → ✓) stay.
const EMOJI = /[#*0-9]️?⃣|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)(?:\p{Emoji_Modifier}|️|[\u{E0020}-\u{E007F}])*(?:‍\p{Extended_Pictographic}️?\p{Emoji_Modifier}?)*|️/gu;
export const noEmoji = value => String(value || '').replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').trim();
const words = (v, n) => typeof v === 'string' ? noEmoji(v).slice(0, n) : '';

/**
 * How a spread is laid out: its name, how many pictures it takes, their shape (横 wide, 竖 tall, 方 square), what it is
 * for (told the model). halves: shown on a phone as two pages one after the other (the others are laid across both
 * pages and shown as one).
 */
export const SPREADS = Object.freeze({
  quiet: {label: '留白', pictures: 1, shape: '方', halves: true, note: '一边是大片留白里的一小幅图（一个人或一样东西，白底），另一边是字；适合开头、结尾、安静或孤单的时刻'},
  page: {label: '单页大图', pictures: 1, shape: '竖', halves: true, note: '一页是铺满的图，对页是字；最常用，适合一般的情节'},
  window: {label: '画框', pictures: 1, shape: '横', halves: false, note: '一幅横图装在画框里横跨两页，字在画框下面；适合交代场景、事情正在发生'},
  spread: {label: '跨页大图', pictures: 1, shape: '横', halves: false, note: '一幅横图铺满两页，字写在画面留出的天空或地面上；最紧张、最壮观、最重要的转折，一本书一到两次'},
  fade: {label: '渐隐', pictures: 1, shape: '横', halves: false, note: '一幅横图在上面或下面慢慢淡进纸里，字在淡出来的白纸上；适合回忆、梦、心情慢慢变化'},
  ground: {label: '只画前景', pictures: 1, shape: '横', halves: false, note: '只画下面的地面、房子或人物（白底，上面是空的），字写在上面大片的空白里；适合走路、出发、远望、等待'},
  pair: {label: '两个瞬间', pictures: 2, shape: '方', halves: true, note: '左右两页各一小幅图，像连着的两个瞬间（前和后、对比、你和我），各配一两句'},
  stage: {label: '人物出场', pictures: 0, halves: true, note: '一个人的立绘像剪纸一样站在留白的纸上，可以说一句话（气泡），对页是字；适合人物第一次出场或一句很有分量的话'},
  text: {label: '只有字', pictures: 0, halves: true, note: '只有字，没有图'},
});
export const SPREAD_IDS = Object.freeze(Object.keys(SPREADS));
/** The weather drawn over a spread (vn-fx.js): only what a story's sky or air does. */
export const WEATHER = Object.freeze({rain: '雨', storm: '暴风雨', snow: '雪', petals: '花瓣', leaves: '落叶', stars: '星空', shooting: '流星', fireflies: '萤火虫', embers: '火星', fog: '雾', bubbles: '气泡', wind: '风', fireworks: '烟花'});
const SIDES = ['left', 'right'];
const ids = (list, known, n) => [...new Set((Array.isArray(list) ? list : typeof list === 'string' ? list.split(/[\s,，、+]+/) : []).map(x => String(x || '').trim()).filter(x => Object.hasOwn(known, x)))].slice(0, n);

const pictureOf = p => p && typeof p === 'object' ? (typeof p.id === 'string' && p.id ? {id: p.id.slice(0, 80)} : typeof p.url === 'string' && /^(\/|https?:|data:image\/|blob:|user\/)/.test(p.url) ? {url: p.url.slice(0, 2000)} : null) : null;
/**
 * A piece of a spread's words: who says it ('' the 旁白), the words, how it is said, whether it is shown in a speech
 * bubble (and on which side of the picture the speaker is), and the story's voice line it is (from: its voice is the
 * one already made).
 */
const wordOf = w => {
  const role = text(w?.role ?? w?.who, 40);
  return {role, text: words(w?.text, BOOK_LIMIT.word), emotion: text(w?.emotion, 40), bubble: !!role && w?.bubble === true, at: w?.at === 'left' ? 'left' : 'right',
    ...(w?.from && Number.isInteger(w.from.id) && Number.isInteger(w.from.line) ? {from: {id: w.from.id, line: w.from.line}} : {})};
};
// A heading a model wrote with its number in it (「第一章 失踪的多春鱼」): the number goes, the reader shows none.
const headingOf = v => words(v, 40).replace(/^第\s*[0-9一二三四五六七八九十百]+\s*[章节回幕部][\s:：·、.-]*/, '').slice(0, BOOK_LIMIT.heading);

/**
 * A spread: {layout, side, space, tone, heading, pictures: [{prompt, picture, people}], words, cast: [{name, emotion}],
 * fx, sound: {ambience, sfx}}. side: the page the picture (or the 立绘) is on, the words on the other — for spreads
 * laid across both pages, the page the words are on. space: where a picture across both pages leaves room for the
 * words (top: sky; bottom: ground); tone: whether that room is light (dark words on it) or dark (white words).
 * picture: {url} (one of the story's) or {id} (drawn for the book, in 相册) or null; people: whether it shows people.
 * cast: who stands on a 人物出场 spread as their 立绘. sound: names in the 音效 library ('停' stops the ambience).
 */
export function normalizeSpread(s) {
  let layout = Object.hasOwn(SPREADS, s?.layout) ? s.layout : 'page';
  const pictures = (Array.isArray(s?.pictures) ? s.pictures : []).slice(0, BOOK_LIMIT.pictures).map(p => ({prompt: text(p?.prompt ?? p?.scene, 600), picture: pictureOf(p?.picture), people: p?.people !== false}));
  const cast = (Array.isArray(s?.cast) ? s.cast : []).slice(0, 2).map(c => ({name: text(c?.name, 40), emotion: text(c?.emotion, 40)})).filter(c => c.name);
  // A 人物出场 spread with nobody to stand on it, a spread planned with pictures that has none: the nearest that fits.
  if (layout === 'stage' && !cast.length) layout = pictures.length ? 'page' : 'text';
  if (layout === 'pair' && pictures.length < 2) layout = pictures.length ? 'page' : 'text';
  const sound = {ambience: text(s?.sound?.ambience, BOOK_LIMIT.sound), sfx: text(s?.sound?.sfx, BOOK_LIMIT.sound)};
  return {layout, side: SIDES.includes(s?.side) ? s.side : 'right', space: s?.space === 'top' ? 'top' : 'bottom', tone: s?.tone === 'dark' ? 'dark' : 'light', heading: headingOf(s?.heading),
    pictures, words: (Array.isArray(s?.words) ? s.words : []).map(wordOf).filter(w => w.text).slice(0, BOOK_LIMIT.words),
    cast: layout === 'stage' ? cast : [], fx: ids(s?.fx, WEATHER, BOOK_LIMIT.fx), sound};
}

/**
 * The pages of a book made before (one picture a page, each with a few words shown and more read) as spreads: a page
 * with a picture becomes a picture and a page of its words (what was read, now shown), a chapter page the heading of
 * the next, a page across two a spread across both, photos and panels two moments, a small picture white space round
 * it, a 立绘 page someone standing on the paper (the first two; later ones their background on a page). The pages of
 * the first 绘本 ({kind: 'page' | 'chapter'}) too.
 */
function fromPages(pages) {
  let cover = null, ending = '', heading = '', k = 0, stood = 0;
  const spreads = [];
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    const shots = Array.isArray(p.shots) ? p.shots : p.picture || p.prompt ? [{picture: p.picture, prompt: p.prompt}] : [];
    if (p.kind === 'cover') { cover = {prompt: shots[0]?.prompt || '', picture: shots[0]?.picture || null}; continue; }
    if (p.kind === 'end') { ending = (Array.isArray(p.texts) ? p.texts : [])[0]?.text || ''; continue; }
    if (p.kind === 'chapter' || p.layout === 'title') { heading = (Array.isArray(p.texts) ? p.texts[0]?.text : '') || p.text || ''; continue; }
    const read = Array.isArray(p.lines) && p.lines.length ? p.lines : Array.isArray(p.texts) && p.texts.length ? p.texts.map(t => ({role: t.who || '', text: t.text})) : p.text ? [{role: '', text: p.text}] : [];
    const pics = shots.filter(s => s?.picture || s?.prompt);
    // Someone standing on the paper twice at most: later ones show the place drawn for them.
    const layout = p.layout === 'spread' && pics.length ? 'spread' : p.layout === 'stage' && Array.isArray(p.cast) && p.cast.length && (stood++ < 2 || !pics.length) ? 'stage'
      : (p.layout === 'panels' || p.layout === 'polaroid') && pics.length > 1 ? 'pair' : p.layout === 'vignette' && pics.length ? 'quiet' : pics.length ? 'page' : 'text';
    spreads.push({layout, side: k++ % 2 ? 'left' : 'right', heading, pictures: pics.map(s => ({prompt: s.prompt, picture: s.picture, people: s.people})),
      words: read.map(l => ({role: l.role, text: l.text, emotion: l.emotion, from: l.from})), cast: p.cast, fx: p.fx, sound: p.sound});
    heading = '';
  }
  return {cover, ending, spreads};
}

/** A book as kept: {id, version: 3, title, subtitle, author, theme, art, mode, source, cover, spreads, ending, at, made}. */
export function normalizeBook(b) {
  const made = Array.isArray(b?.spreads) ? {cover: b.cover, spreads: b.spreads, ending: b.ending} : fromPages(Array.isArray(b?.pages) ? b.pages : []);
  return {
    id: text(b?.id, 60) || 'b-' + Date.now().toString(36), version: 3,
    title: words(b?.title, BOOK_LIMIT.title) || '无题', subtitle: words(b?.subtitle, 60), author: text(b?.author, 40),
    theme: THEME_IDS.includes(b?.theme) ? b.theme : 'fairy', art: b?.art === 'app' ? 'app' : 'book', mode: b?.mode === 'story' ? 'story' : 'retell',
    source: {chat: text(b?.source?.chat, 200), name: text(b?.source?.name, 80), from: Number(b?.source?.from) || 0, to: Number(b?.source?.to) || 0},
    cover: {prompt: text(made.cover?.prompt, 600), picture: pictureOf(made.cover?.picture)},
    spreads: (Array.isArray(made.spreads) ? made.spreads : []).slice(0, BOOK_LIMIT.spreads).map(normalizeSpread),
    ending: words(made.ending, 80), at: Number(b?.at) || Date.now(), made: Number(b?.made) || Number(b?.at) || Date.now(),
  };
}

// ---------- sheets: the cover, each spread, the last page ----------
/** How many sheets a book has: the cover, its spreads, the last page. */
export const sheetCount = book => book.spreads.length + 2;
/** Sheet n: {kind: 'cover'} | {kind: 'spread', spread, index} | {kind: 'end'}. */
export function sheetOf(book, n) {
  if (n <= 0) return {kind: 'cover'};
  if (n > book.spreads.length) return {kind: 'end'};
  return {kind: 'spread', spread: book.spreads[n - 1], index: n - 1};
}

/**
 * The story's words without what is not story: a card's template ({{角色的名字}}, {{当前好感度数值}}/100 — a status bar
 * written as placeholders) is taken out, and what is left with no words in it (numbers, signs) is dropped ('').
 */
export function storyWords(value) {
  const t = String(value || '').replace(/\{\{[^{}]*\}\}/g, '').trim();
  return /\p{L}/u.test(t) ? t : '';
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

/**
 * 原文: the story's messages ([{id, user, steps}] — host-vn.js bookSource) as spreads of about `size` characters: a
 * picture on one page (the story's own, where it has one there; else drawn later from the words), the words on the
 * other, the picture's side turning from spread to spread. A voice line keeps its place in the story (from), so its
 * voice is the one already made.
 */
export function storySpreads(messages, {size = 180} = {}) {
  const spreads = [];
  let lines = [], picture = null, count = 0, sound = {ambience: '', sfx: ''};
  const flush = () => {
    if (!lines.length) return;
    spreads.push(normalizeSpread({layout: 'page', side: spreads.length % 2 ? 'left' : 'right', pictures: [{prompt: '', picture, people: true}], words: lines, sound}));
    lines = []; picture = null; count = 0; sound = {ambience: '', sfx: ''};
  };
  for (const m of messages || []) for (const s of m.steps || []) {
    // A picture of the story goes with the words that come after it (those before it are a spread of their own).
    if (s.kind === 'bg') { flush(); picture = {url: s.url}; continue; }
    // The story's own sounds (host-book.js names them): its ambience and a sound go with the spread they fall in.
    if (s.kind === 'sound' && s.sound?.name) { if (s.sound.kind === 'ambience') sound.ambience = s.sound.stop ? '停' : s.sound.name; else sound.sfx ||= s.sound.name; continue; }
    if (s.kind !== 'say' && s.kind !== 'narrate') continue;
    const whole = storyWords(s.text);
    if (!whole) continue;
    for (const t of s.kind === 'narrate' ? sentences(whole, size) : [whole]) {
      if (count && count + t.length > size) flush();
      const prev = lines.at(-1);
      if (s.kind === 'say' && s.part && prev?.from?.line === s.line && prev.from.id === m.id) prev.text += t;
      else lines.push(s.kind === 'say' ? {role: s.role || '', text: t, emotion: s.emotion || '', ...(s.user ? {} : Number.isInteger(s.line) ? {from: {id: m.id, line: s.line}} : {})} : {role: '', text: t, emotion: ''});
      count += t.length;
    }
  }
  flush();
  return spreads;
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
const LAYOUT_LIST = Object.entries(SPREADS).filter(([id]) => id !== 'text').map(([id, l]) => `${id}（${l.label}）：${l.note}${l.pictures ? `（${l.pictures} 张${l.shape}图）` : ''}`).join('\n  ');
const listOf = table => Object.entries(table).map(([id, label]) => `${id}（${label}）`).join('、');
/**
 * What the text model is asked, to make a part of the story a picture book of about `spreads` spreads. cast: who may
 * speak; staged: who has a 立绘 to stand on a spread with. part: {index, of} when a long story is made in parts (the
 * title, kind and cover come with the first; later parts go on from `before`).
 */
export function retellPrompt(script, {spreads = 12, cast = [], staged = [], part = null, before = '', sounds = null} = {}) {
  const ambience = (sounds?.ambience || []).slice(0, 60), sfx = (sounds?.sfx || []).slice(0, 80);
  const first = !part || part.index === 0, last = !part || part.index === part.of - 1;
  const system = `你是一位绘本作家兼美术编辑，要把一段角色扮演的故事做成一本真正的绘本。绘本是按「跨页」设计的：翻开时左右两页一起看。读者只看书上的字也能明白发生了什么，画面再补上字里没说的东西（表情、动作、环境、气氛）。要求：
- 一共 ${spreads} 个跨页左右。按顺序讲故事里发生的事，挑最有画面、最有情绪的时刻，琐碎的部分可以删。前后的画面要接得上（同一个地点、衣着、时间写成一样的标签）。
- 字（words）：每个跨页一到三句，合起来 20 到 80 个字，用第三人称讲故事，像真正绘本里的句子：短、具体、有节奏，可以有一点诗意。书上印的字就是朗读的字。按顺序分段：叙述的 role 写空字符串；人物说的话单独成一段，role 写人物名字（只能用：${cast.join('、') || '故事里的名字'}），emotion 写情绪（可空），引出说话的叙述写成「某某小声说：」这样。不要只写拟声词，不要写「第一章」，不要用 emoji。
- 气泡：大约四个跨页里最多一个，把一句最关键的台词做成对话气泡（那一段 bubble 写 true，at 写说话的人在画面的左边还是右边：left / right），其他台词都写在叙述里。
- 版式（layout），跟着故事的起伏安排，不要连着两个跨页用同一种（page 可以多一些）：
  ${LAYOUT_LIST}
  节奏：开头一两个跨页用 quiet 或 page，让读者慢慢进入；中间 page、window、pair、fade、ground 换着用；最紧张、最壮观、最重要的转折用 spread（整本书一到两次）；结尾回到 quiet 或 fade，安静地收住。
- 图（pictures）：版式要几张就写几张，每张写 scene（英文、逗号分隔的绘图标签：画面里有什么、人物用名字、在做什么、表情、镜头远近和角度、地点、时间、光线、气氛；不写画风，不写构图里的空白，空白会按版式自动加）和 people（画面里画不画人：true / false）。故事里已有的图（脚本里的 [图N]）正好配得上，就写 "picture": N，不用写 scene。
- side：图（stage 是立绘）放在左页还是右页（left / right），字在另一页，跨页之间换着放；window、spread、fade、ground 的 side 是字写在左页还是右页。
- spread 版式还要写 space 和 tone：画面在哪里留出写字的空白（top：上面是天空或空白；bottom：下面是地面、水面或空白），那片空白是亮的（light：白天的天空、白墙、雪地）还是暗的（dark：夜空、阴影）。
- stage：人物的立绘像剪纸一样站在留白的纸上（有立绘的只有：${staged.join('、') || '没有人，所以不要用 stage'}），不写 pictures，cast 写一到两个人（name、emotion）；整本书最多两次。
- heading：故事长、一段新的情节开始时，可以在那个跨页写一个小标题（4 到 10 个字），整本书零到三个；故事不长就不写。
- fx：这个跨页的天气，零到两个，只能选：${listOf(WEATHER)}；故事里写到下雨、下雪、起雾、花瓣、萤火虫、星空、烟花这些才写。${ambience.length || sfx.length ? `
- 声音：ambience 这个跨页开始的环境声，换场景时才写，写「停」就停下（只能从这些里选：${ambience.join('、') || '没有'}）；sfx 翻到这里时响一下的音效（只能从这些里选：${sfx.join('、') || '没有'}）。都可以空着。` : ''}
${first ? `- 给这本绘本起书名 title（2 到 12 个字）和一句副标题 subtitle，判断故事类型 genre（只能选一个：${THEME_LIST}），写封面画面 cover（英文绘图标签，主角要在画面里，构图在上方留出写书名的地方）。` : `- 这是整个故事的第 ${part.index + 1} 部分（共 ${part.of} 部分），接着前面往下做，不要重复，不要写书名。`}${last ? '\n- 写最后一页的一句话 ending（一句收尾的话，可空）。' : ''}
只输出一个 JSON 对象，不要任何别的文字：{${first ? '"title":"","subtitle":"","genre":"","cover":"",' : ''}${last ? '"ending":"",' : ''}"spreads":[{"layout":"page","side":"right","space":"","tone":"","heading":"","pictures":[{"scene":"","people":true}],"cast":[],"words":[{"role":"","text":"","emotion":"","bubble":false,"at":""}],"fx":[]${ambience.length || sfx.length ? ',"ambience":"","sfx":""' : ''}}]}`;
  const user = `${before ? `前面最后一个跨页讲到：${before}\n\n` : ''}故事脚本：\n${script}`;
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
  // A last try: the model often leaves a trailing comma.
  try { return JSON.parse(s.slice(start).replace(/,\s*([}\]])/g, '$1')); } catch { throw Error('文字模型给的绘本内容读不出来，再试一次'); }
}

/**
 * The model's answer made into spreads: {title, subtitle, genre, cover, ending, spreads}. pictures: the story's
 * pictures ([图N] is pictures[N-1]); cast: the names that may speak (others are the 旁白); staged: those with a 立绘 (a
 * 人物出场 spread with someone who has none draws them alone in white space instead). Laid out to the story's pace
 * (paceSpreads).
 */
export function retoldSpreads(answer, {pictures = [], cast = [], staged = []} = {}) {
  const data = typeof answer === 'string' ? jsonIn(answer) : answer || {};
  const names = new Set(cast), standing = new Set(staged), out = [];
  const clean = s => words(s, BOOK_LIMIT.word).replace(/^[「“"]|[」”"]$/g, '');
  const raws = Array.isArray(data.spreads) ? data.spreads : Array.isArray(data.pages) ? data.pages : [];
  for (const raw of raws) {
    let layout = Object.hasOwn(SPREADS, raw?.layout) ? raw.layout : 'page';
    const shots = (Array.isArray(raw?.pictures) ? raw.pictures : Array.isArray(raw?.shots) ? raw.shots : []).map(s => {
      const n = Number(s?.picture), url = Number.isInteger(n) && n > 0 ? pictures[n - 1] : '';
      return {prompt: url ? '' : text(s?.scene ?? s?.prompt, 600), picture: url ? {url} : null, people: s?.people !== false};
    }).filter(s => s.prompt || s.picture);
    let castOn = (Array.isArray(raw?.cast) ? raw.cast : []).map(c => ({name: text(c?.name, 40), emotion: text(c?.emotion, 40)})).filter(c => names.has(c.name));
    // Standing on the paper takes a 立绘: without one, they are drawn alone in white space.
    if (layout === 'stage' && (!castOn.length || castOn.some(c => !standing.has(c.name)))) {
      layout = 'quiet';
      if (!shots.length) shots.push({prompt: castOn.map(c => [c.name, c.emotion].filter(Boolean).join(', ')).join(', '), picture: null, people: true});
      castOn = [];
    }
    const said = (Array.isArray(raw?.words) ? raw.words : Array.isArray(raw?.read) ? raw.read : []).map(w => ({role: names.has(text(w?.role ?? w?.who, 40)) ? text(w.role ?? w.who, 40) : '', text: clean(w?.text), emotion: text(w?.emotion, 40), bubble: w?.bubble === true, at: w?.at})).filter(w => w.text);
    if (!said.length && !shots.length && !castOn.length) continue;
    out.push({layout, side: raw?.side, space: raw?.space, tone: raw?.tone, heading: raw?.heading ?? raw?.chapter, pictures: shots, words: said, cast: castOn, fx: raw?.fx,
      sound: {ambience: raw?.ambience ?? raw?.sound?.ambience, sfx: raw?.sfx ?? raw?.sound?.sfx}});
  }
  if (!out.length) throw Error('文字模型没有写出绘本的跨页');
  return {title: words(data.title, BOOK_LIMIT.title), subtitle: words(data.subtitle, 60), genre: THEME_IDS.includes(data.genre) ? data.genre : '', cover: text(data.cover, 600), ending: words(data.ending, 80), spreads: paceSpreads(out)};
}

/**
 * Spreads laid out to the story's pace, whatever the model chose: every spread has the pictures its layout takes (a
 * picture still to be drawn has the words to go by); someone stands on the paper at most twice; a picture across both
 * pages at most twice — and once at least, past the middle, in a book of six spreads or more; no layout three times
 * running; the first opens quietly; the picture and the words change sides from spread to spread where the model said
 * nothing; only one speech bubble a spread.
 */
export function paceSpreads(list) {
  const spreads = list.map(s => ({...s, pictures: [...(s.pictures || [])], words: [...(s.words || [])]}));
  let stood = 0;
  spreads.forEach((s, i) => {
    if (!Object.hasOwn(SPREADS, s.layout)) s.layout = 'page';
    if (s.layout === 'stage' && ++stood > 2) { s.layout = 'quiet'; s.pictures = [{prompt: (s.cast || []).map(c => [c.name, c.emotion].filter(Boolean).join(', ')).join(', '), picture: null, people: true}]; s.cast = []; }
    if (s.layout === 'pair' && s.pictures.length < 2) s.layout = 'page';
    const want = SPREADS[s.layout].pictures;
    while (s.pictures.length < want) s.pictures.push({prompt: '', picture: null, people: true});
    if (!SIDES.includes(s.side)) s.side = i % 2 ? 'left' : 'right';
    let bubbles = 0;
    s.words = s.words.map(w => ({...w, bubble: !!w.bubble && !!w.role && ++bubbles === 1}));
  });
  const wide = () => spreads.filter(s => s.layout === 'spread').length;
  // Too many across both pages: the later ones in a frame.
  while (wide() > 2) { const k = spreads.findLastIndex(s => s.layout === 'spread'); spreads[k].layout = 'window'; }
  // None: the fullest moment past the middle (the most words, a picture) goes across both pages.
  if (spreads.length >= 6 && !wide()) {
    const later = spreads.map((s, i) => ({s, i})).filter(({s, i}) => i >= spreads.length / 2 && i < spreads.length - 1 && SPREADS[s.layout].pictures === 1 && s.layout !== 'quiet');
    const best = later.sort((a, b) => b.s.words.reduce((n, w) => n + w.text.length, 0) - a.s.words.reduce((n, w) => n + w.text.length, 0))[0];
    if (best) Object.assign(best.s, {layout: 'spread', space: best.s.space === 'bottom' ? 'bottom' : 'top'});
  }
  // The book opens quietly.
  if (spreads[0] && ['spread', 'ground'].includes(spreads[0].layout)) spreads[0].layout = 'page';
  // The same layout three times running: the middle one framed (or on a page, when it was framed).
  for (let i = 1; i + 1 < spreads.length; i++) {
    const s = spreads[i];
    if (s.layout !== spreads[i - 1].layout || s.layout !== spreads[i + 1].layout || SPREADS[s.layout].pictures !== 1) continue;
    s.layout = s.layout === 'window' ? 'page' : 'window';
  }
  return spreads.map(normalizeSpread);
}

/** All the words of some spreads (to guess the kind of story from). */
export const wordsOf = spreads => spreads.flatMap(s => s.words.map(w => w.text)).join('\n');
/**
 * A whole book from its spreads: its cover (drawn from `cover`, else coverPicture), its last line (`ending`), the
 * kind of story (the model's, else guessed from the words).
 */
export function bookOf({id, title, subtitle = '', author = '', theme = '', art = 'book', mode = 'retell', source = {}, spreads, cover = '', coverPicture = null, ending = ''}) {
  return normalizeBook({id, title: title || '无题', subtitle, author, theme: theme || guessTheme(wordsOf(spreads)), art, mode, source, spreads,
    cover: {prompt: cover, picture: coverPicture}, ending});
}
/** Spreads to ask for: about one for every 420 characters of story, 6 to 16. */
export const spreadsFor = chars => Math.max(6, Math.min(16, Math.round(chars / 420)));
/** A long script in parts the model can take at once (cut between lines). */
export function scriptParts(script, max = 9000) {
  const out = [];
  let part = '';
  for (const line of script.split('\n')) { if (part && part.length + line.length > max) { out.push(part); part = ''; } part += (part ? '\n' : '') + line; }
  if (part) out.push(part);
  return out;
}
/** A spread's words as lines read aloud. */
export const linesOf = list => list.map(w => ({role: w.role, text: w.text, emotion: w.emotion, ...(w.from ? {from: w.from} : {})}));
/** What sheet n reads aloud: the cover its title; a spread its words; the last page its last line. */
export function readOf(book, n) {
  const sheet = sheetOf(book, n);
  if (sheet.kind === 'cover') return [{role: '', text: book.title + (book.subtitle ? '。' + book.subtitle : ''), emotion: ''}];
  if (sheet.kind === 'end') return book.ending ? [{role: '', text: book.ending, emotion: ''}] : [];
  return linesOf(sheet.spread.words);
}
/** Everyone in a book (speaking, standing). */
export const castOf = book => [...new Set(book.spreads.flatMap(s => [...s.words.map(w => w.role), ...s.cast.map(c => c.name)]).filter(Boolean))];
/** The shape picture k of a spread is drawn in: 横 (wide), 竖 (tall) or 方; the cover is tall. */
export const shapeOf = spread => spread ? SPREADS[spread.layout].shape || '竖' : '竖';
/**
 * What a picture is drawn with besides what it shows, by where it goes: alone in white space, room left for the words
 * in the sky or on the ground, only the foreground on white.
 */
export function composeOf(spread) {
  switch (spread?.layout) {
    case 'quiet': return 'simple background, white background, full body, centered, negative space';
    case 'pair': return 'simple background, upper body, close-up';
    case 'window': return 'wide shot, cinematic composition';
    case 'spread': return spread.space === 'top' ? 'wide shot, panorama, empty sky, negative space at top, low horizon' : 'wide shot, panorama, negative space at bottom, empty foreground';
    case 'fade': return 'wide shot, panorama, soft light, soft edges';
    case 'ground': return 'white background, simple background, scenery at bottom, empty upper half, no sky';
    default: return '';
  }
}
/**
 * What is still to be drawn: [{sheet, k}] — the cover (sheet 0) and each spread's pictures planned and not drawn yet.
 * all: also those with nothing written for them (原文: each written from its spread's words).
 */
export function missingPictures(book, all = false) {
  const out = [];
  if (!book.cover.picture && (book.cover.prompt || all)) out.push({sheet: 0, k: 0});
  book.spreads.forEach((s, i) => {
    for (let k = 0; k < SPREADS[s.layout].pictures; k++) { const p = s.pictures[k]; if (!p?.picture && (p?.prompt || all)) out.push({sheet: i + 1, k}); }
  });
  return out;
}
