// 绘本: a stretch of the story made into a picture book — told by pictures first and words second. Most pages are one
// big picture or a few panels; on some a character stands in a scene as their 立绘 cut out of paper, with a speech
// bubble; some are photos taped on paper with notes in hand; a few have no words at all. What words there are come
// few, set as captions, bubbles, a thought, a shout, a whisper; the reading aloud says more. Each page is directed: its
// mood (the colour of its light), a camera move over its picture, effects (rain, fog, lightning, a heartbeat …), the
// way the page before turns into it, the ambience and a sound as it opens. Two ways to make one: 改编
// (the text model makes the story a picture book: the pages, what each shows, who stands in it, the few words and
// what is read aloud) and 原文 (the story as written, cut into pages, its pictures and voice lines kept).
// Pure logic here; ui/book.js asks for the words, the pictures and the voices; core/book-pages.js lays pages out.
import {THEME_IDS, BOOK_THEMES, guessTheme} from './book-themes.js';
import {ORNAMENT_IDS} from './book-ornaments.js';

export const BOOK_LIMIT = {pages: 240, shots: 3, props: 2, texts: 6, text: 400, title: 40, lines: 16, line: 400, doodles: 3, fx: 3, sound: 40};
const text = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
// The words a page shows and reads have no emoji (its little pictures are drawn): a pictograph shown in colour goes
// with its skin tone, joiners and keycap; signs written as text (★ ♪ ♥ → ✓) stay.
const EMOJI = /[#*0-9]\uFE0F?\u20E3|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)(?:\p{Emoji_Modifier}|\uFE0F|[\u{E0020}-\u{E007F}])*(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*|\uFE0F/gu;
export const noEmoji = value => String(value || '').replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').trim();
const words = (v, n) => typeof v === 'string' ? noEmoji(v).slice(0, n) : '';

/** How a page is laid out: its name, how many pictures it takes [least, most], and what it is for (told the model). */
export const LAYOUTS = Object.freeze({
  bleed: {label: '满版大图', shots: [1, 1], count: '1 张图', note: '一张图铺满整页，字很少或没有'},
  stage: {label: '人物登场', shots: [0, 1], count: '1 张没有人的背景', note: '场景作背景，人物的立绘像剪纸一样站在上面说话'},
  panels: {label: '分镜', shots: [2, 3], count: '2 到 3 张图', note: '像漫画一样分成两三格，讲一个连续的动作或表情的变化'},
  polaroid: {label: '相片拼贴', shots: [2, 3], count: '2 到 3 张图', note: '几张照片贴在纸上，配手写的字，适合回忆、日常的小片段'},
  vignette: {label: '小画留白', shots: [1, 1], count: '1 张图', note: '一张小画放在大片留白里，配一句话，适合安静、抒情的时刻'},
  shout: {label: '大字', shots: [1, 1], count: '1 张图', note: '画面上一个很大的拟声词或喊叫，适合冲击、惊吓、高潮'},
  letter: {label: '信纸', shots: [0, 1], count: '0 到 1 张小照片', note: '写在信纸或日记上的话，适合心里话、书信、独白'},
  spread: {label: '跨页大图', shots: [1, 1], count: '1 张横图', note: '横着的一大幅场景，大屏上占满两页，适合壮观的场面或重要的转折'},
  title: {label: '章节页', shots: [0, 1], note: '章节名'},
  classic: {label: '图文', shots: [0, 1], note: '上面一张图，下面是原文'},
});
export const LAYOUT_IDS = Object.freeze(Object.keys(LAYOUTS));
/** Kinds of words on a page: caption (旁白), bubble (said), think (thought), shout, whisper, title (a chapter's name). */
export const TEXT_KINDS = Object.freeze(['caption', 'bubble', 'think', 'shout', 'whisper', 'title']);
export const TEXT_LABELS = Object.freeze({caption: '旁白', bubble: '说话', think: '心里话', shout: '大字', whisper: '小声', title: '标题'});
const SIDES = ['left', 'right', 'center'];

/** A page's mood: the colour of its light and how its camera likes to move. */
export const MOODS = Object.freeze({calm: '平静', warm: '温暖', joy: '欢快', sad: '悲伤', tense: '紧张', scary: '恐怖', love: '心动', mystery: '神秘', epic: '壮阔', funny: '滑稽', dream: '梦幻', angry: '愤怒'});
/** A camera move over a page's picture. */
export const CAMERAS = Object.freeze({still: '不动', push: '慢慢推近', pull: '慢慢拉远', left: '向左移', right: '向右移', rise: '向上摇', fall: '向下摇', drift: '缓缓漂移', zoom: '猛地推近', tilt: '倾斜', shake: '手持晃动'});
/** Effects on a page: weather and light drawn over it (vn-fx.js), and what the page itself does. */
export const FX = Object.freeze({rain: '雨', storm: '暴风雨', snow: '雪', petals: '花瓣', leaves: '落叶', stars: '星空', shooting: '流星', fireflies: '萤火虫', embers: '火星', fog: '雾', dust: '光尘', sparkles: '闪光', bubbles: '气泡', wind: '风', fireworks: '烟花',
  lightning: '闪电', flash: '白光一闪', quake: '震动', heartbeat: '心跳', glitch: '画面故障', rays: '光束', glow: '柔光', dark: '暗角', memory: '回忆'});
/** How the page before turns into this one. */
export const TURNS = Object.freeze({curl: '翻页', fade: '淡入', black: '黑场', white: '白闪', slide: '滑过', zoom: '推进', iris: '圆形展开', wipe: '擦过'});
const ids = (list, known, n) => [...new Set((Array.isArray(list) ? list : typeof list === 'string' ? list.split(/[\s,，、+]+/) : []).map(x => String(x || '').trim()).filter(x => Object.hasOwn(known, x)))].slice(0, n);

const pictureOf = p => p && typeof p === 'object' ? (typeof p.id === 'string' && p.id ? {id: p.id.slice(0, 80)} : typeof p.url === 'string' && /^(\/|https?:|data:image\/|blob:|user\/)/.test(p.url) ? {url: p.url.slice(0, 2000)} : null) : null;
const lineOf = l => ({role: text(l?.role, 40), text: words(l?.text, BOOK_LIMIT.line), emotion: text(l?.emotion, 40), ...(l?.from && Number.isInteger(l.from.id) && Number.isInteger(l.from.line) ? {from: {id: l.from.id, line: l.from.line}} : {})});
/** Who a page's words and reading speak with. */
export const textsOfLines = lines => lines.map(l => ({kind: l.role ? 'bubble' : 'caption', text: l.text, who: l.role}));

/**
 * A page: {kind: 'cover' | 'scene' | 'end', layout, shots: [{prompt, picture, people}], cast: [{name, emotion, at}],
 * texts: [{kind, text, who}], doodles: [drawing id], props: [{prompt, picture}], lines: [{role, text, emotion, from?}],
 * mood, camera, fx: [effect], turn, sound: {ambience, sfx}} — mood … turn: '' / [] when it leaves them to be chosen
 * from its words (core/book-pages.js directionOf); sound: names in the 音效 library ('停' stops the ambience).
 * picture: {url} (one of the story's) or {id} (drawn for the book, in 相册) or null; people: whether the picture shows
 * people (a scene behind standing characters does not); cast: who stands on the page as their 立绘 (stage); props:
 * small things drawn and cut out, stuck on the page like stickers; texts: the few words shown; lines: what is read
 * aloud (from: a voice line of the story, so its voice is the one already made). A page of a book made before
 * ({kind: 'page' | 'chapter', text, picture, prompt, layout, lines}) becomes one of these.
 */
export function normalizePage(p) {
  if (p?.kind === 'page' || p?.kind === 'chapter') {
    const lines = (Array.isArray(p.lines) ? p.lines : []).map(lineOf).filter(l => l.text);
    if (p.kind === 'chapter') return normalizePage({kind: 'scene', layout: 'title', texts: [{kind: 'title', text: p.text}], lines: [{role: '', text: p.text}], shots: p.picture ? [{picture: p.picture}] : []});
    const shots = p.picture || p.prompt ? [{picture: p.picture, prompt: p.prompt, people: true}] : [];
    return normalizePage({kind: 'scene', layout: p.layout === 'full' && shots.length ? 'bleed' : 'classic', shots, lines, texts: lines.length ? textsOfLines(lines) : [{kind: 'caption', text: p.text}]});
  }
  const kind = ['cover', 'scene', 'end'].includes(p?.kind) ? p.kind : 'scene';
  let layout = kind === 'scene' && LAYOUT_IDS.includes(p?.layout) ? p.layout : 'bleed';
  let shots = (Array.isArray(p?.shots) ? p.shots : []).slice(0, BOOK_LIMIT.shots).map(s => ({prompt: text(s?.prompt, 600), picture: pictureOf(s?.picture), people: s?.people !== false}));
  if (kind === 'scene') {
    const [least, most] = LAYOUTS[layout].shots;
    // Too few pictures for the layout: the one that fits what there is.
    if (shots.length < least) layout = shots.length >= 2 ? 'panels' : shots.length ? 'bleed' : 'letter';
    shots = shots.slice(0, LAYOUTS[layout].shots[1]);
  } else shots = shots.slice(0, 1);
  const cast = (Array.isArray(p?.cast) ? p.cast : []).slice(0, 3).map(c => ({name: text(c?.name, 40), emotion: text(c?.emotion, 40), at: SIDES.includes(c?.at) ? c.at : 'center'})).filter(c => c.name);
  const texts = (Array.isArray(p?.texts) ? p.texts : []).slice(0, BOOK_LIMIT.texts).map(t => ({kind: TEXT_KINDS.includes(t?.kind) ? t.kind : 'caption', text: words(t?.text, BOOK_LIMIT.text), who: text(t?.who, 40)})).filter(t => t.text);
  // The emoji stickers of books made before go: drawings only.
  const doodles = ids(p?.doodles, Object.fromEntries(ORNAMENT_IDS.map(k => [k, 1])), BOOK_LIMIT.doodles);
  const props = (Array.isArray(p?.props) ? p.props : []).slice(0, BOOK_LIMIT.props).map(x => ({prompt: text(x?.prompt, 300), picture: pictureOf(x?.picture)})).filter(x => x.prompt || x.picture);
  const lines = (Array.isArray(p?.lines) ? p.lines : []).map(lineOf).filter(l => l.text).slice(0, BOOK_LIMIT.lines);
  const sound = {ambience: text(p?.sound?.ambience, BOOK_LIMIT.sound), sfx: text(p?.sound?.sfx, BOOK_LIMIT.sound)};
  return {kind, layout: kind === 'scene' ? layout : kind, shots, cast: layout === 'stage' ? cast : [], texts, doodles, props, lines,
    mood: Object.hasOwn(MOODS, p?.mood) ? p.mood : '', camera: Object.hasOwn(CAMERAS, p?.camera) ? p.camera : '', fx: ids(p?.fx, FX, BOOK_LIMIT.fx), turn: Object.hasOwn(TURNS, p?.turn) ? p.turn : '', sound};
}
/** A book as kept: {id, version: 2, title, subtitle, author, theme, art, mode, source, pages, at, made}. */
export function normalizeBook(b) {
  // A book too long keeps its cover and its last page, whatever is cut between.
  let list = Array.isArray(b?.pages) ? b.pages : [];
  if (list.length > BOOK_LIMIT.pages) list = [...list.slice(0, BOOK_LIMIT.pages - 1), list.at(-1)];
  return {
    id: text(b?.id, 60) || 'b-' + Date.now().toString(36), version: 2,
    title: words(b?.title, BOOK_LIMIT.title) || '无题', subtitle: words(b?.subtitle, 60), author: text(b?.author, 40),
    theme: THEME_IDS.includes(b?.theme) ? b.theme : 'fairy', art: b?.art === 'app' ? 'app' : 'book', mode: b?.mode === 'story' ? 'story' : 'retell',
    source: {chat: text(b?.source?.chat, 200), name: text(b?.source?.name, 80), from: Number(b?.source?.from) || 0, to: Number(b?.source?.to) || 0},
    pages: list.map(normalizePage), at: Number(b?.at) || Date.now(), made: Number(b?.made) || Number(b?.at) || Date.now(),
  };
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
 * 原文: the story's messages ([{id, user, steps}] — host-vn.js bookSource) as pages of about `size` characters. A
 * picture of the story makes a page of its own (the picture over the whole page, a little of the story over it); the
 * rest are 图文 pages (a picture drawn for each above its words, when pictures are drawn). A voice line keeps its
 * place in the story (from), so its voice is the one already made.
 */
export function storyPages(messages, {size = 150} = {}) {
  const pages = [];
  let lines = [], picture = null, count = 0, sound = {ambience: '', sfx: ''};
  const flush = () => {
    if (!lines.length && !picture) return;
    pages.push(normalizePage({...(picture ? {kind: 'scene', layout: 'bleed', shots: [{picture}]} : {kind: 'scene', layout: 'classic'}), lines, texts: textsOfLines(lines), sound}));
    lines = []; picture = null; count = 0; sound = {ambience: '', sfx: ''};
  };
  for (const m of messages || []) for (const s of m.steps || []) {
    if (s.kind === 'bg') { flush(); picture = {url: s.url}; continue; }
    // The story's own sounds (host-book.js names them): its ambience and a sound go with the page they fall in.
    if (s.kind === 'sound' && s.sound?.name) { if (s.sound.kind === 'ambience') sound.ambience = s.sound.stop ? '停' : s.sound.name; else sound.sfx ||= s.sound.name; continue; }
    if (s.kind !== 'say' && s.kind !== 'narrate') continue;
    const whole = storyWords(s.text);
    if (!whole) continue;
    // Over a picture there is room for less.
    const room = () => picture ? Math.round(size * .5) : size;
    for (const t of s.kind === 'narrate' ? sentences(whole, room()) : [whole]) {
      if (count && count + t.length > room()) flush();
      const prev = lines.at(-1);
      if (s.kind === 'say' && s.part && prev?.from?.line === s.line && prev.from.id === m.id) prev.text += t;
      else lines.push(s.kind === 'say' ? {role: s.role || '', text: t, emotion: s.emotion || '', ...(s.user ? {} : Number.isInteger(s.line) ? {from: {id: m.id, line: s.line}} : {})} : {role: '', text: t, emotion: ''});
      count += t.length;
    }
  }
  flush();
  return pages;
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
const LAYOUT_LIST = Object.entries(LAYOUTS).filter(([id]) => id !== 'classic' && id !== 'title').map(([id, l]) => `${id}：${l.note}（${l.count}）`).join('\n  ');
const listOf = table => Object.entries(table).map(([id, label]) => `${id}（${label}）`).join('、');
/**
 * What the text model is asked, to make a part of the story a picture book. cast: who may speak; staged: who has a
 * 立绘 to stand on a page with. part: {index, of} when a long story is made in parts (the title, kind and cover come
 * with the first; later parts go on from `before`).
 */
export function retellPrompt(script, {pages = 12, cast = [], staged = [], part = null, before = '', sounds = null} = {}) {
  const ambience = (sounds?.ambience || []).slice(0, 60), sfx = (sounds?.sfx || []).slice(0, 80);
  const first = !part || part.index === 0;
  const system = `你是一位绘本作家兼美术编辑，要把一段角色扮演的故事做成一本「以画面为主、文字为辅」的绘本：靠一页接一页连续的画面讲故事、表达情感，文字只是点睛。要求：
- 按顺序讲故事里发生的事，挑最有画面感、最有情绪的时刻；琐碎的部分可以删。一共 ${pages} 页左右，一页一个画面或一组分镜；前后页的画面要接得上（同一个地点、衣着、时间写成一样的标签）。
- 字要少：每页显示的字（texts）合起来不超过 30 个字，大约三分之一的页一个字都不放，只靠画面。书名、texts、read 里都不要用 emoji。texts 的 kind：caption 旁白（短短一句，像诗）、bubble 人物说的话（写上 who）、think 心里话（写上 who）、shout 大喊或拟声词（一两个字到一句短话，比如「砰！」「哇——」）、whisper 轻声。
- 每页选一个版式 layout，经常换，不要连着两页用同一种（bleed 可以多一些）：
  ${LAYOUT_LIST}
- shots：这一页的图，每张写 scene（英文、逗号分隔的绘图标签：画面里有什么、人物用名字、在做什么、表情、镜头远近和角度、地点、时间、光线、气氛；不写画风）和 people（画面里画不画人：true / false）。分镜和相片的几张图要是同一时刻的不同镜头或连续的动作。故事里已有的图（脚本里的 [图N]）正好配得上，就写 "picture": N，不用写 scene。
- stage：人物用他们自己的立绘像剪纸一样站在场景上（有立绘的只有：${staged.join('、') || '没有人，所以不要用 stage'}），shots 只画没有人的背景，people 写 false；cast 写站上来的人（name、emotion 情绪、at：left / right / center），一到三个，说话的气泡会放在他们头上。
- props：可以给这一页加零到两个小物件贴纸（英文绘图标签，比如 "red umbrella"、"letter with wax seal"、"steaming teacup"），画出来剪下来贴在页面上，大概四页用一次就好。doodles：零到两个手绘小装饰，只能从这些里选：${ORNAMENT_IDS.join('、')}（不要用 emoji）。
- 演出（让每一页都不一样，跟着情节走）：mood 这一页的情绪基调（只能选一个：${listOf(MOODS)}）；camera 镜头怎么动（${listOf(CAMERAS)}）；fx 零到两个效果（${listOf(FX)}），故事里写到下雨、起雾、打雷、心跳、回忆这些就加上；turn 翻到这一页的方式（${listOf(TURNS)}），新章节用 black，惊吓、冲击用 white 或 zoom，温柔的用 fade 或 iris。${ambience.length || sfx.length ? `
- 声音：ambience 这一页开始的环境声，换场景时才写，写「停」就停下（只能从这些里选：${ambience.join('、') || '没有'}）；sfx 翻到这一页时响一下的音效（只能从这些里选：${sfx.join('、') || '没有'}）。都可以空着。` : ''}
- read：讲故事的人读这一页时说的话（20 到 80 个字，比显示的字多，可以描述画面），按顺序分段：旁白的 role 写空字符串，人物说的话 role 写人物名字（只能用：${cast.join('、') || '故事里的名字'}），emotion 写情绪（可空）。没有字的页也要有 read。
- 一段新的情节开始时，在那一页写 chapter：章节名（4 到 10 个字），整本书 2 到 5 章。
${first ? `- 给这本绘本起书名 title（2 到 12 个字）和一句副标题 subtitle，判断故事类型 genre（只能选一个：${THEME_LIST}），写封面画面 cover（英文绘图标签，主角要在画面里，构图留出上方写书名的地方），最后一页的一句话 ending（可空）。` : `- 这是整个故事的第 ${part.index + 1} 部分（共 ${part.of} 部分），接着前面往下做，不要重复，不要写书名。`}
只输出一个 JSON 对象，不要任何别的文字：{${first ? '"title":"","subtitle":"","genre":"","cover":"","ending":"",' : ''}"pages":[{"chapter":"","layout":"bleed","shots":[{"scene":"","people":true}],"cast":[],"texts":[{"kind":"caption","text":"","who":""}],"props":[],"doodles":[],"mood":"","camera":"","fx":[],"turn":"",${ambience.length || sfx.length ? '"ambience":"","sfx":"",' : ''}"read":[{"role":"","text":"","emotion":""}]}]}`;
  const user = `${before ? `前面最后一页讲到：${before}\n\n` : ''}故事脚本：\n${script}`;
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
 * The model's answer made into pages: {title, subtitle, genre, cover, ending, pages}. pictures: the story's pictures
 * ([图N] is pictures[N-1]); cast: the names that may speak (others are the 旁白); staged: those with a 立绘 (a stage
 * page with someone who has none draws the people into its picture instead). A chapter makes a page of its own.
 */
export function retoldPages(answer, {pictures = [], cast = [], staged = []} = {}) {
  const data = typeof answer === 'string' ? jsonIn(answer) : answer || {};
  const names = new Set(cast), standing = new Set(staged), pages = [];
  const clean = s => words(s, BOOK_LIMIT.text).replace(/^[「“"]|[」”"]$/g, '');
  for (const raw of Array.isArray(data.pages) ? data.pages : []) {
    const chapter = words(raw?.chapter, 30);
    if (chapter) pages.push(normalizePage({kind: 'scene', layout: 'title', texts: [{kind: 'title', text: chapter}], lines: [{role: '', text: chapter}]}));
    const shots = (Array.isArray(raw?.shots) ? raw.shots : []).map(s => {
      const n = Number(s?.picture), url = Number.isInteger(n) && n > 0 ? pictures[n - 1] : '';
      return {prompt: url ? '' : text(s?.scene ?? s?.prompt, 600), picture: url ? {url} : null, people: s?.people !== false};
    }).filter(s => s.prompt || s.picture);
    let layout = LAYOUT_IDS.includes(raw?.layout) ? raw.layout : 'bleed', castOn = (Array.isArray(raw?.cast) ? raw.cast : []).filter(c => names.has(text(c?.name, 40)));
    // Standing on the page takes a 立绘: without one, the people are drawn into the picture.
    if (layout === 'stage' && (!castOn.length || castOn.some(c => !standing.has(text(c.name, 40))))) {
      layout = 'bleed';
      for (const s of shots) { s.people = true; if (castOn.length && s.prompt) s.prompt = [...castOn.map(c => text(c.name, 40)), s.prompt].join(', '); }
      castOn = [];
    }
    const texts = (Array.isArray(raw?.texts) ? raw.texts : []).map(t => ({kind: TEXT_KINDS.includes(t?.kind) && t.kind !== 'title' ? t.kind : 'caption', text: clean(t?.text), who: names.has(text(t?.who, 40)) ? text(t.who, 40) : ''})).filter(t => t.text);
    const lines = (Array.isArray(raw?.read) ? raw.read : Array.isArray(raw?.lines) ? raw.lines : []).map(l => ({role: names.has(text(l?.role, 40)) ? text(l.role, 40) : '', text: clean(l?.text), emotion: text(l?.emotion, 40)})).filter(l => l.text);
    const props = (Array.isArray(raw?.props) ? raw.props : []).map(x => ({prompt: text(typeof x === 'string' ? x : x?.scene ?? x?.prompt, 300)})).filter(x => x.prompt);
    if (!shots.length && !texts.length && !lines.length) continue;
    pages.push(normalizePage({kind: 'scene', layout, shots, cast: castOn, texts, doodles: raw?.doodles, props, lines,
      mood: raw?.mood, camera: raw?.camera, fx: raw?.fx, turn: raw?.turn, sound: {ambience: raw?.ambience ?? raw?.sound?.ambience, sfx: raw?.sfx ?? raw?.sound?.sfx}}));
  }
  if (!pages.some(p => p.layout !== 'title')) throw Error('文字模型没有写出绘本的页');
  varyLayouts(pages);
  return {title: words(data.title, BOOK_LIMIT.title), subtitle: words(data.subtitle, 60), genre: THEME_IDS.includes(data.genre) ? data.genre : '', cover: text(data.cover, 600), ending: words(data.ending, 60), pages};
}

/**
 * Pages that look the same three times running: the one in the middle takes another layout that fits what it has (a
 * picture with a line or none: a small picture in white space; a shout: the big word over it).
 */
export function varyLayouts(pages) {
  const run = p => p.kind === 'scene' && p.layout !== 'title' ? p.layout : '';
  for (let i = 1; i + 1 < pages.length; i++) {
    const p = pages[i];
    if (!run(p) || run(pages[i - 1]) !== run(p) || run(pages[i + 1]) !== run(p)) continue;
    if (p.layout !== 'bleed' || p.shots.length !== 1) continue;
    if (p.texts.some(t => t.kind === 'shout')) p.layout = 'shout';
    else if (p.texts.length <= 1) p.layout = 'vignette';
  }
  return pages;
}
/** All the words of some pages (to guess the kind of story from). */
export const wordsOf = pages => pages.flatMap(p => [...p.texts.map(t => t.text), ...p.lines.map(l => l.text)]).join('\n');
/**
 * A whole book from its pages: the cover first (its picture: drawn from `cover`, else coverPicture), the end last
 * (with `ending`), the kind of story (the model's, else guessed from the words).
 */
export function bookOf({id, title, subtitle = '', author = '', theme = '', art = 'book', mode = 'retell', source = {}, pages, cover = '', coverPicture = null, ending = ''}) {
  return normalizeBook({id, title: title || '无题', subtitle, author, theme: theme || guessTheme(wordsOf(pages)), art, mode, source,
    pages: [{kind: 'cover', shots: cover || coverPicture ? [{prompt: cover, picture: coverPicture, people: true}] : []}, ...pages,
      {kind: 'end', texts: ending ? [{kind: 'caption', text: ending}] : [], lines: ending ? [{role: '', text: ending}] : []}]});
}
/** Pages to ask for: a picture book tells less a page — about one per 260 characters of story, 8 to 24. */
export const pagesFor = chars => Math.max(8, Math.min(24, Math.round(chars / 260)));
/** A long script in parts the model can take at once (cut between lines). */
export function scriptParts(script, max = 9000) {
  const out = [];
  let part = '';
  for (const line of script.split('\n')) { if (part && part.length + line.length > max) { out.push(part); part = ''; } part += (part ? '\n' : '') + line; }
  if (part) out.push(part);
  return out;
}
/** What a page reads aloud: its lines (else its words); the cover its title. */
export function readOf(book, p) {
  if (p.kind === 'cover') return [{role: '', text: book.title + (book.subtitle ? '。' + book.subtitle : ''), emotion: ''}];
  if (p.lines.length) return p.lines;
  return p.texts.map(t => ({role: t.kind === 'bubble' || t.kind === 'think' ? t.who : '', text: t.text, emotion: ''}));
}
/** Everyone in a book (speaking, standing, named in its words). */
export const castOf = book => [...new Set(book.pages.flatMap(p => [...p.lines.map(l => l.role), ...p.texts.map(t => t.who), ...p.cast.map(c => c.name)]).filter(Boolean))];
/** The shape a picture is drawn in: 横 (wide), 竖 (tall) or 方, by where it goes. */
export function shotShape(page, index) {
  if (page.kind !== 'scene') return '竖';
  if (page.layout === 'spread') return '横';
  if (page.layout === 'polaroid') return '方';
  if (page.layout === 'panels') return page.shots.length === 2 || index === 0 ? '横' : '竖';
  return '竖';
}
/**
 * What is still to be drawn: [{page, shot} | {page, prop}] — the pictures and things planned and not drawn yet. all:
 * also a picture for every 图文 page without one (原文: each written from the page's words).
 */
export function missingPictures(book, all = false) {
  const out = [];
  book.pages.forEach((p, page) => {
    p.shots.forEach((s, shot) => { if (!s.picture && s.prompt) out.push({page, shot}); });
    if (all && p.kind === 'scene' && p.layout === 'classic' && !p.shots.length) out.push({page, shot: 0});
    p.props.forEach((x, prop) => { if (!x.picture && x.prompt) out.push({page, prop}); });
  });
  return out;
}
/**
 * The lines read aloud from a page's words as edited (one a line): 名字：「…」 (or 名字：…) is that person's, when they
 * are in the book; the rest is the 旁白's. A line the same as one before keeps its voice line (from) and 情绪.
 */
export function linesFromText(value, cast = [], old = []) {
  const names = new Set(cast), out = [];
  for (const raw of String(value || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([^「：:\s]{1,20})[：:]\s*(?:「([\s\S]+)」|([\s\S]+))$/.exec(line);
    const role = m && names.has(m[1]) ? m[1] : '', said = role ? (m[2] ?? m[3]).trim() : line;
    const same = old.find(l => l.text === said && l.role === role);
    out.push(same ? {...same} : {role, text: said, emotion: ''});
  }
  return out;
}
/** A page's lines as text to edit: the 旁白's as they are, someone's as 名字：「…」. */
export const linesText = lines => lines.map(l => l.role ? `${l.role}：「${l.text}」` : l.text).join('\n');
