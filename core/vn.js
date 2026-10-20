// 视觉小说: the story read as a galgame. Its settings, the story cut into pages (core of the stage in vn-stage.js),
// the 立绘 (with their 表情 and 动作) and the requests that draw them, and the cut-out that takes the plain background
// off a drawn 立绘.
import {skippedRanges, narrationPieces, NARRATION_SKIP, NARRATION_BODY, cleanSkip} from './narration.js';
import {visualEmotion, visualEffects, matchesVisualWord, visualWordEmotion, visualWordHits, doneBy} from './visual-emotion.js';
import {activeStyle, sizeFor} from './draw.js';
import {isV5} from './novelai.js';

/** What a 立绘 asks of the picture, after the 画风 and before the character's own looks. Editable in the app. The
 *  background is added by the plugin (a flat key colour that is easy to take off), unless the rule names one. */
export const SPRITE_RULE = 'solo, cowboy shot, standing, facing viewer, looking at viewer';
const OLD_RULE = 'solo, cowboy shot, standing, facing viewer, looking at viewer, arms at sides, simple background, white background';
export const SPRITE_NEGATIVE = 'multiple views, text, watermark, signature, frame, border, scenery, cropped head, gradient background, shadow';
/** Seconds per character typed, from 慢 to 瞬间 (0: the page shows at once). */
export const VN_SPEEDS = Object.freeze([0.07, 0.045, 0.028, 0.015, 0]);
export const VN_SPEED_NAMES = Object.freeze(['慢', '稍慢', '中', '快', '瞬间']);
export const VN_WAITS = Object.freeze([0.6, 1.2, 2, 3]);
export const VN_FONTS = Object.freeze({s: '小', m: '中', l: '大'});
/** tavern: the tavern's theme colours; phone: the phone's (a copy kept in palette, taken by the 视觉小说 App). */
export const VN_BOXES = Object.freeze({night: '夜幕', day: '晴空', sakura: '樱色', ink: '墨染', tavern: '跟随酒馆', phone: '跟随小手机'});
const LIMIT = {cast: 200, rule: 1000, url: 1000, name: 60, actions: 24, words: 20, label: 12, tags: 300, alts: 8, outfits: 6, appearance: 1500};

/**
 * 表情: one 立绘 each, picked by a line's 情绪 (a word or a director's note, English or Chinese). tags: what is added
 * to the 立绘's prompt to draw it.
 */
export const EXPRESSIONS = Object.freeze([
  {id: 'happy', label: '开心', tags: 'smile, happy, open mouth'},
  {id: 'angry', label: '生气', tags: 'angry, frown, v-shaped eyebrows, clenched teeth'},
  {id: 'sad', label: '难过', tags: 'sad, tears, teary eyes, frown'},
  {id: 'surprised', label: '惊讶', tags: 'surprised, wide-eyed, open mouth'},
  {id: 'shy', label: '害羞', tags: 'blush, embarrassed, looking away, shy'},
]);
/** The 表情 a 情绪 names; in a longer note (「强忍着眼泪，却努力笑着」) the one named first. */
export const expressionOf = visualEmotion;

export const defaultVn = () => ({speed: 2, wait: 1, voice: true, narrate: false, font: 'm', box: 'night', opacity: 0.86, effects: true, rule: SPRITE_RULE, palette: null, skip: [], cast: {}});
const pick = (value, list, fallback) => list.includes(value) ? value : fallback;
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/+-]+\))$/i;
const PALETTE = ['box', 'box2', 'ink', 'soft', 'plate', 'plateInk', 'line'];
function normalizePalette(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const k of PALETTE) { const c = String(p[k] ?? '').trim(); if (!COLOR.test(c)) return null; out[k] = c; }
  return out;
}
const words = (value,max=LIMIT.label) => [...new Set((Array.isArray(value) ? value : String(value ?? '').split(/[,，、;；\s]+/)).map(w => String(w).trim().slice(0, max)).filter(Boolean))].slice(0, LIMIT.words);
/**
 * cast: {name: {sprite, at, seed, alts, mix, looks: {id: {sprite, at, alts, mix}}, actions: [{id, label, tags, words}],
 * outfits: [{id, label, appearance, sprite, at, seed, alts, mix, looks}]}} — each character's 立绘 (files in the
 * tavern's images, so every device sees them). sprite is the usual one; looks hold the 表情 (EXPRESSIONS ids) and 动作
 * (the character's own actions: what to draw, and the words that bring them on). Each picture can have others in its
 * group (alts: [{sprite, at, seed?}]): sprite is the one in use, or with mix they take turns at random. 形象 (outfits:
 * a school uniform, a monk's robe) each have a whole set of their own; which one a chat uses is kept in that chat.
 */
const urlOf = value => text(value, LIMIT.url);
function normalizeAlts(list) {
  const out = [], seen = new Set();
  for (const a of Array.isArray(list) ? list : []) {
    const sprite = urlOf(a?.sprite), seed = Number(a?.seed);
    if (!sprite || seen.has(sprite)) continue;
    seen.add(sprite);
    out.push({sprite, at: Number(a.at) || 0, ...(Number.isInteger(seed) && seed >= 0 ? {seed} : {})});
  }
  return out.slice(0, LIMIT.alts);
}
/** One picture and its group; null when there is none. */
function normalizeGroup(g) {
  const sprite = urlOf(g?.sprite), alts = normalizeAlts(g?.alts).filter(a => a.sprite !== sprite);
  if (!sprite && !alts.length) return null;
  // A group without the one in use: the first of the others is used.
  const [use, ...rest] = sprite ? [{sprite, at: Number(g.at) || 0}, ...alts] : alts;
  return {sprite: use.sprite, at: use.at, alts: rest, mix: g.mix === true && rest.length > 0};
}
/** A set of 立绘: the usual one (with its seed), the 表情 and 动作 pictures. */
function normalizeSet(c, ids) {
  const looks = {};
  for (const [id, look] of Object.entries(c?.looks && typeof c.looks === 'object' ? c.looks : {})) {
    const g = ids.has(id) && normalizeGroup(look);
    if (g) looks[id] = g;
  }
  const base = normalizeGroup(c), seed = Number(c?.seed);
  return {sprite: base?.sprite || '', at: base?.at || 0, alts: base?.alts || [], mix: !!base?.mix,
    ...(base && Number.isInteger(seed) && seed >= 0 ? {seed} : {}), looks};
}
function normalizeCast(value) {
  const cast = {};
  for (const [name, c] of Object.entries(value && typeof value === 'object' ? value : {}).slice(0, LIMIT.cast)) {
    const key = String(name).trim().slice(0, LIMIT.name);
    if (!key || !c || typeof c !== 'object') continue;
    const actions = (Array.isArray(c.actions) ? c.actions : []).slice(0, LIMIT.actions).map(a => ({id: text(a?.id, 40), label: text(a?.label, LIMIT.label), tags: text(a?.tags, LIMIT.tags), words: words(a?.words,a?.kind==='expression'?80:LIMIT.label), ...(a?.kind==='expression'?{kind:'expression'}:{})})).filter(a => /^a-[\w-]+$/.test(a.id) && a.label);
    const ids = new Set([...EXPRESSIONS.map(e => e.id), ...actions.map(a => a.id)]);
    const outfits = (Array.isArray(c.outfits) ? c.outfits : []).slice(0, LIMIT.outfits)
      .map(o => ({id: text(o?.id, 40), label: text(o?.label, LIMIT.label), appearance: text(o?.appearance, LIMIT.appearance), ...normalizeSet(o, ids)}))
      .filter(o => /^o-[\w-]+$/.test(o.id) && o.label);
    const set = normalizeSet(c, ids);
    if (!set.sprite && !Object.keys(set.looks).length && !actions.length && !outfits.length) continue;
    cast[key] = {...set, actions, outfits};
  }
  return cast;
}
export function normalizeVn(value) {
  const base = defaultVn(), v = value && typeof value === 'object' ? value : {};
  const opacity = Number(v.opacity);
  return {
    speed: pick(Number(v.speed), [0, 1, 2, 3, 4], base.speed),
    wait: pick(Number(v.wait), [0, 1, 2, 3], base.wait),
    voice: v.voice !== false,
    narrate: v.narrate === true,
    font: Object.hasOwn(VN_FONTS, v.font) ? v.font : base.font,
    box: Object.hasOwn(VN_BOXES, v.box) ? v.box : base.box,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.3, Math.round(opacity * 100) / 100)) : base.opacity,
    effects: v.effects !== false,
    rule: typeof v.rule === 'string' ? (v.rule === OLD_RULE ? SPRITE_RULE : v.rule.slice(0, LIMIT.rule)) : base.rule,
    palette: normalizePalette(v.palette),
    // 不演的标签: parts of the story the stage leaves out (on top of 整篇朗读's list).
    skip: cleanSkip(v.skip),
    cast: normalizeCast(v.cast),
  };
}

/** The set of 立绘 a character wears: the 形象 (outfit id) when it has pictures, else their own. */
export function setOf(entry, outfit = '') {
  const o = outfit && (entry?.outfits || []).find(x => x.id === outfit);
  return o && (o.sprite || Object.keys(o.looks || {}).length) ? o : entry;
}
/** A picture of a group: the one in use; with mix, any of them at random (another than the one shown, when it can). */
function fromGroup(g, last, random) {
  if (!g?.sprite) return '';
  const pool = [g.sprite, ...(g.alts || []).map(a => a.sprite)];
  if (!g.mix || pool.length < 2) return g.sprite;
  const others = pool.filter(u => u !== last);
  return others[Math.floor(random() * others.length) % others.length];
}
/**
 * The 动作 a line is acted with: the one whose words are found nearest to it, in its 情绪, the story just before it
 * (context) or right after it (after), and done by them (name; names: the others who may be named there).
 * {action, word, where: 'emotion' | 'before' | 'after'} or null.
 */
export function actionFor(actions, {emotion = '', context = '', after = '', name = '', names = []} = {}) {
  const before = String(context || ''), next = String(after || '');
  let best = null;
  for (const a of actions || []) {
    if (a.kind === 'expression') continue;
    for (const w of a.words || []) {
      const found = [
        ...visualWordHits(emotion, w).map(h => ({...h, where: 'emotion', far: 0})),
        ...visualWordHits(before, w).filter(h => !name || doneBy(before, h.at, name, names)).map(h => ({...h, where: 'before', far: before.length - h.end})),
        ...visualWordHits(next, w).filter(h => !name || doneBy(next, h.at, name, names)).map(h => ({...h, where: 'after', far: h.at})),
      ];
      for (const h of found) if (!best || h.far < best.far) best = {action: a, word: h.text, where: h.where, far: h.far};
    }
  }
  return best && {action: best.action, word: best.word, where: best.where};
}

/**
 * The 立绘 to show for a line: its 动作 (actionFor) first, then the 表情 of its 情绪, then the usual one. Only pictures
 * that were made count; '' when the character has none. outfit: the 形象 this chat uses (a 动作 it has no picture of
 * is shown in their own clothes); last: the picture on the stage now (a group taking turns shows another).
 * why: an object told what was chosen and why ({kind: 'action' | 'expression' | 'usual', label, word, where}).
 */
export function pickLook(entry, {emotion = '', context = '', after = '', name = '', names = [], outfit = '', last = '', random = Math.random, why = null} = {}) {
  if (!entry) return '';
  const tell = info => { if (why) Object.assign(why, info); };
  const set = setOf(entry, outfit), looks = set.looks || {};
  const drawn = (entry.actions || []).filter(a => a.kind !== 'expression' && (looks[a.id]?.sprite || entry.looks?.[a.id]?.sprite));
  const act = actionFor(drawn, {emotion, context, after, name, names});
  if (act) { tell({kind: 'action', label: act.action.label, word: act.word, where: act.where}); return fromGroup(looks[act.action.id]?.sprite ? looks[act.action.id] : entry.looks[act.action.id], last, random); }
  const feeling=expressionOf(emotion);
  for(const a of entry.actions||[])if(a.kind==='expression'&&a.words.some(w=>matchesVisualWord(emotion,w)||(feeling&&visualWordEmotion(w)===feeling))){tell({kind:'expression',label:a.label,word:emotion});return looks[a.id]?.sprite?fromGroup(looks[a.id],last,random):(set.sprite?fromGroup(set,last,random):'');}
  const e = expressionOf(emotion);
  if (e && looks[e]?.sprite) { tell({kind: 'expression', label: EXPRESSIONS.find(x => x.id === e)?.label || e, word: emotion}); return fromGroup(looks[e], last, random); }
  tell({kind: 'usual', label: '', word: emotion});
  return set.sprite ? fromGroup(set, last, random) : '';
}

/**
 * A change to one character's pictures, as {entry, gone} (gone: files no longer used). look: '' for the usual one;
 * outfit: the 形象 ('' for their own). url: a new picture — in place of the one in use, or with add, joining its group
 * as the one in use. use: an url of the group to use. drop: an url to take out (true: the one in use; the next one
 * takes its place). mix: whether the group takes turns. dropOutfit: the 形象 goes, with all its pictures.
 */
export function editLook(entry, {look = '', outfit = '', url = '', add = false, use = '', drop = '', mix, seed, dropOutfit = false, now = Date.now()} = {}) {
  const next = structuredClone(entry || {sprite: '', looks: {}, actions: [], outfits: []});
  next.looks ??= {}; next.actions ??= []; next.outfits ??= [];
  const gone = [];
  const filesOf = set => [set.sprite, ...(set.alts || []).map(a => a.sprite), ...Object.values(set.looks || {}).flatMap(g => [g.sprite, ...(g.alts || []).map(a => a.sprite)])].filter(Boolean);
  let set = next;
  if (outfit) {
    const at = next.outfits.findIndex(o => o.id === outfit);
    if (at < 0) throw Error('这个形象已经不在了');
    if (dropOutfit) { gone.push(...filesOf(next.outfits[at])); next.outfits.splice(at, 1); return {entry: next, gone}; }
    set = next.outfits[at];
    set.looks ??= {};
  }
  const g = look ? (set.looks[look] ??= {sprite: '', at: 0, alts: [], mix: false}) : set;
  g.alts ??= [];
  const base = !look, oldSeed = set.seed;
  const putSeed = value => { if (!base) return; if (Number.isInteger(value) && value >= 0) set.seed = value; else delete set.seed; };
  if (url) {
    if (add && g.sprite) g.alts.unshift({sprite: g.sprite, at: g.at || 0, ...(base && Number.isInteger(oldSeed) && oldSeed >= 0 ? {seed: oldSeed} : {})});
    else if (g.sprite && g.sprite !== url) gone.push(g.sprite);
    g.sprite = url; g.at = now;
    putSeed(Number(seed));
    while (g.alts.length > LIMIT.alts) gone.push(g.alts.pop().sprite);
  }
  if (use && use !== g.sprite) {
    const i = g.alts.findIndex(a => a.sprite === use);
    if (i >= 0) {
      const [picked] = g.alts.splice(i, 1);
      if (g.sprite) g.alts.unshift({sprite: g.sprite, at: g.at || 0, ...(base && Number.isInteger(oldSeed) && oldSeed >= 0 ? {seed: oldSeed} : {})});
      g.sprite = picked.sprite; g.at = picked.at || now;
      putSeed(picked.seed);
    }
  }
  if (drop) {
    const target = drop === true ? g.sprite : drop;
    if (target && target === g.sprite) {
      gone.push(target);
      const [after] = g.alts.splice(0, 1);
      g.sprite = after?.sprite || ''; g.at = after?.at || 0;
      putSeed(after?.seed);
    } else if (target) {
      const i = g.alts.findIndex(a => a.sprite === target);
      if (i >= 0) { gone.push(target); g.alts.splice(i, 1); }
    }
  }
  if (typeof mix === 'boolean') g.mix = mix;
  if (g.alts.length === 0) g.mix = false;
  if (look && !g.sprite) delete set.looks[look];
  return {entry: next, gone};
}

/** A text box holds about three lines: longer prose and lines are cut into pages at a sentence end. */
export const PAGE = 90;
const STRONG = ['。', '！', '？', '!', '?', '…', '；', ';', '.'], SOFT = ['，', ',', '、', ' '];
export function pages(value, max = PAGE) {
  const out = [];
  let rest = String(value ?? '').replace(/\s+/g, ' ').trim();
  while (rest) {
    if (rest.length <= max) { out.push(rest); break; }
    const head = rest.slice(0, max), last = list => Math.max(...list.map(c => head.lastIndexOf(c)));
    let cut = last(STRONG);
    if (cut <= max / 3) cut = Math.max(cut, last(SOFT));
    const at = cut > max / 3 ? cut + 1 : max;
    // Closing quotes and brackets stay with what they close.
    let end = at;
    while (end < rest.length && /[」』”’）)】]/.test(rest[end])) end++;
    out.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  return out.filter(Boolean);
}

/**
 * One message as the steps of the stage, in story order:
 *   {kind: 'bg', url}                         a picture of the story becomes the background
 *   {kind: 'say', role, text, line, part, emotion}  a voice line (line: its index among the message's lines; part: its page)
 *   {kind: 'narrate', text}                   the story between them
 *   {kind: 'sound', index} / {kind: 'bgm', index}   a sound tag / a <bgm> of the message, where it is in the story
 * lines: the message's voice lines with their places (start, end); pics: [{start, url}] (drawn pictures only);
 * sounds / bgm: [{start, index}].
 * The parts not read aloud by 整篇朗读 (thinking, status bars, code, the phone's tags) are not shown either.
 */
export function storySteps(raw, lines = [], {pics = [], sounds = [], bgm = [], skip = NARRATION_SKIP, body = NARRATION_BODY, max = PAGE} = {}) {
  const source = String(raw ?? ''), cut = skippedRanges(source, skip, body);
  let masked = source;
  for (const [a, b] of cut) masked = masked.slice(0, a) + masked.slice(a, b).replace(/[^\n]/g, ' ') + masked.slice(b);
  const hidden = (a, b) => cut.some(([s, e]) => a < e && b > s);
  const out = [];
  const prose = (a, b) => { if (b > a) for (const piece of narrationPieces(masked.slice(a, b))) for (const page of pages(piece, max)) out.push({kind: 'narrate', text: page}); };
  const point = (list, kind) => list.filter(p => Number.isFinite(p?.start) && (kind !== 'bg' || p.url)).map(p => ({point: kind, p, start: p.start, end: p.start}));
  const events = [
    ...lines.map((l, i) => ({l, i, start: l?.tagOnly&&Number.isFinite(l.displayStart)?l.displayStart:l?.start, end: l?.end})).filter(x => Number.isFinite(x.start) && Number.isFinite(x.end)),
    ...point(pics, 'bg'), ...point(sounds, 'sound'), ...point(bgm, 'bgm'),
  ].sort((a, b) => a.start - b.start || Number(!a.point) - Number(!b.point));
  let at = 0;
  for (const e of events) {
    if (e.point) {
      prose(at, Math.max(at, e.start)); at = Math.max(at, e.start);
      out.push(e.point === 'bg' ? {kind: 'bg', url: e.p.url} : {kind: e.point, index: e.p.index});
      continue;
    }
    if (e.start < at) continue;
    prose(at, e.start);
    if (!hidden(e.start, e.end)) {
      const shown = String(e.l.translation || e.l.text || '').trim();
      pages(shown, max).forEach((page, part) => out.push({kind: 'say', role: String(e.l.role || ''), text: page, line: e.i, part, emotion: String(e.l.emotion || '')}));
    }
    at = e.end;
  }
  prose(at, source.length);
  // Consecutive images need a page boundary, including galleries with no prose between images.
  for (let i = out.length - 1; i >= 0; i--) if (out[i].kind === 'bg' && (!out[i + 1] || out[i + 1].kind === 'bg')) out.splice(i + 1, 0, {kind: 'narrate', text: '', imageOnly: true});
  return out;
}

/** Pictures other plugins put in the story (<img src>, ![](url)): [{start, url}], where they are. */
export function inlinePictures(raw) {
  const text = String(raw ?? ''), out = [];
  for (const m of text.matchAll(/<img\b[^<>]*?\bsrc\s*=\s*["']([^"']+)["'][^<>]*>|!\[[^\]]*\]\(([^)\s]+)[^)]*\)/gi)) {
    const url = (m[1] || m[2] || '').trim();
    if (/^(https?:|\/|data:image\/|blob:)/i.test(url)) out.push({start: m.index, url});
  }
  return out;
}

/** What the user wrote, as pages said by them (their own message has no voice lines). */
export function userSteps(raw, name, max = PAGE) {
  const out = [];
  for (const piece of narrationPieces(String(raw ?? '').replace(/```[\s\S]*?(?:```|$)/g, ' '))) for (const page of pages(piece, max)) out.push({kind: 'say', role: String(name || '你'), text: page, user: true});
  return out;
}

/** How a line is acted on the stage, from its 情绪 (a word or a director's note): 'shake', 'hop' or ''. */
export const stageMove = emotion => visualEffects(emotion).move;

/**
 * How a line is acted, from its 情绪 (a word or a director's note; the feeling named first wins): move — the speaker
 * shakes, hops, bounces, trembles or sinks; mark — a sign over their head (anger, surprise, sweat, heart, blush, note,
 * drop, dots, sigh); burst — sparkles or hearts around them; tint — the edges of the screen glow red, blue, pink or
 * dark; punch — the picture jumps closer for a moment.
 */
export const lineFx = visualEffects;

/**
 * What the story between the lines does to the stage: weather (the kind named last in it: rain, snow, petals, leaves,
 * stars, fireflies, embers; 'clear' when it stops or they go inside; '' when it says nothing), a flash (lightning,
 * boom), a heartbeat, a blackout (眼前一黑) and memory (回忆, 梦里: the scene turns old-photo coloured).
 */
const WEATHER = [
  ['rain', /下雨|雨水|雨滴|雨点|雨声|大雨|小雨|暴雨|细雨|雨中|雨夜|雨幕|淋雨|阵雨|\brain/gi],
  ['snow', /下雪|雪花|雪片|大雪|飘雪|雪夜|雪地|风雪|\bsnow/gi],
  ['petals', /樱花|花瓣|落英|petal|sakura|cherry blossom/gi],
  ['leaves', /落叶|枯叶|红叶|秋叶|fallen leaves/gi],
  ['stars', /星空|繁星|星星|银河|流星|满天星|starry/gi],
  ['fireflies', /萤火虫|流萤|firefl/gi],
  ['embers', /篝火|火星|余烬|火堆|烛火|炉火|\bember|bonfire/gi],
  ['clear', /雨停|雨势渐歇|雨渐渐停|放晴|雪停|天晴了|走进屋|进了屋|回到室内|关上窗|\bindoors/gi],
];
export function storyFx(text) {
  const t = String(text || '');
  let weather = '', at = -1;
  for (const [kind, re] of WEATHER) for (const m of t.matchAll(re)) if (m.index > at) { at = m.index; weather = kind; }
  return {
    weather,
    flash: /闪电|雷声|雷鸣|惊雷|电光一闪|lightning|thunder/i.test(t) ? 'lightning' : /爆炸|轰的一声|轰然|巨响|炸开|explo/i.test(t) ? 'boom' : '',
    pulse: /心跳|怦怦|砰砰|心脏狂跳|heartbeat/i.test(t),
    blackout: /眼前一黑|昏了过去|晕了过去|昏迷|失去了?意识|失去知觉|black(?:ed)? out/i.test(t),
    memory: /回忆起|回忆里|回忆中|记忆中|记忆里|那年|多年前|很多年前|梦里|梦中|梦境|flashback/i.test(t),
  };
}
/** Whether a CG fills the screen (cut a little at the edges) or is shown whole (its shape is far from the screen's). */
export function coverFits(iw, ih, sw, sh) {
  if (!(iw > 0 && ih > 0 && sw > 0 && sh > 0)) return true;
  const r = (iw / ih) / (sw / sh);
  return r >= 0.72 && r <= 1.38;
}

/** The flat background a 立绘 is drawn on: green, unless the character wears it (then blue, then magenta). */
export function keyColorFor(looks) {
  const l = String(looks || '').toLowerCase();
  if (!/green|emerald|jade|lime|olive|mint|绿|翠/.test(l)) return 'green';
  if (!/blue|azure|navy|cyan|蓝|青/.test(l)) return 'blue';
  return 'magenta';
}
/**
 * The drawing request for a character's 立绘: the 画风 first, then the 立绘 rule, the look's own tags (a 表情 or 动作)
 * and a flat key colour background; their looks as the character. seed: the usual 立绘's, so a 表情 keeps the same face
 * and clothes as far as the engine allows (-1: a new one).
 */
export function spriteRequest(settings, name, {appearance, rule, extra = '', seed = -1} = {}) {
  const draw = settings.draw, style = activeStyle(draw) || {}, vn = normalizeVn(settings.vn);
  const route = (settings.routes || []).find(r => r.name === name);
  const looks = String(appearance ?? route?.appearance ?? '').trim();
  const head = [style.artist, style.positive].map(x => String(x || '').trim()).filter(Boolean);
  const want = String(rule ?? vn.rule).trim(), more = String(extra || '').trim();
  // NovelAI V5 draws a transparent background itself; other engines get a flat key colour to cut out afterwards.
  const clear = (draw.engine === 'nai' || !draw.engine) && isV5(draw.params?.model);
  const backdrop = /background/i.test(want + ',' + more) ? '' : clear ? '2::transparent background::' : `simple background, ${keyColorFor(looks)} background`;
  return {
    prompt: [...head, want, more, backdrop, looks ? '' : name].filter(Boolean).join(', '),
    negative: [String(style.negative || '').trim(), SPRITE_NEGATIVE].filter(Boolean).join(', '),
    characters: looks ? [{prompt: looks, negative: '', position: -1}] : [],
    params: {...draw.params, ...sizeFor(draw.params, '竖'), seed: Number.isInteger(seed) && seed >= 0 ? seed : -1, transparent: clear && !!backdrop},
  };
}

/** A picture that is clear around the edge already (drawn with a transparent background): nothing to cut out. */
export function clearEdges(data, width, height) {
  let clear = 0, all = 0;
  const at = i => { all++; if (data[i * 4 + 3] < 16) clear++; };
  for (let x = 0; x < width; x++) { at(x); at((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { at(y * width); at(y * width + width - 1); }
  return all > 0 && clear / all > .6;
}
/** The colour most of the border has (in 32-step buckets), averaged: [r, g, b]. */
function borderColor(data, width, height) {
  const border = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  const bucket = p => (data[p * 4] >> 3) << 10 | (data[p * 4 + 1] >> 3) << 5 | data[p * 4 + 2] >> 3;
  const counts = new Map();
  for (const p of border) { const k = bucket(p); counts.set(k, (counts.get(k) || 0) + 1); }
  let best = 0, key = 0;
  for (const [k, c] of counts) if (c > best) { best = c; key = k; }
  let r = 0, g = 0, b = 0, m = 0;
  for (const p of border) if (bucket(p) === key) { r += data[p * 4]; g += data[p * 4 + 1]; b += data[p * 4 + 2]; m++; }
  return {color: [r / m, g / m, b / m], border};
}

/**
 * Takes the plain background off a drawn 立绘 (data: RGBA bytes, changed in place; strength 0–255, more takes more).
 * Two ways, by the background's colour (the most common one on the border):
 *  · a strong colour (the green, blue or magenta 立绘 are drawn on): every pixel of that colour goes, wherever it is
 *    (gaps in the hair too), by how much of the colour it has, so pale clothes stay; the colour's tinge on the edges
 *    is taken out;
 *  · white, grey or anything pale (an uploaded picture): from the edges inwards, what is close to it goes; gaps inside
 *    are taken with eraseAt.
 * Returns how many pixels were taken.
 */
export function cutBackground(data, width, height, strength = 40) {
  const n = width * height;
  if (!n || data.length < n * 4) return 0;
  const {color: bg, border} = borderColor(data, width, height);
  // Already see-through around the figure (a PNG made that way): nothing to take.
  if (border.filter(p => data[p * 4 + 3] < 16).length > border.length * 0.6) return 0;
  const top = Math.max(...bg), low = Math.min(...bg);
  if (top - low >= 70) {
    // The key channels: those well above the middle of the background colour.
    const mid = (top + low) / 2, keyed = [0, 1, 2].filter(c => bg[c] > mid), other = [0, 1, 2].filter(c => bg[c] <= mid);
    const amount = (r, g, b) => { const v = [r, g, b]; return Math.min(...keyed.map(c => v[c])) - Math.max(...other.map(c => v[c])); };
    const full = amount(...bg), from = full * Math.max(0.05, 0.36 - strength / 400), to = from + full * 0.22;
    let taken = 0;
    for (let p = 0; p < n; p++) {
      const i = p * 4, a = amount(data[i], data[i + 1], data[i + 2]);
      if (a <= from * 0.6) continue;
      if (a >= to) { data[i + 3] = 0; taken++; continue; }
      if (a > from) data[i + 3] = Math.round(data[i + 3] * (to - a) / (to - from));
      // The tinge of the key colour on the edge: brought down to the other channels.
      const most = Math.max(...other.map(c => data[i + c]));
      for (const c of keyed) if (data[i + c] > most) data[i + c] = most;
    }
    return taken;
  }
  const [r, g, b] = bg, tolerance = strength;
  const far = p => Math.max(Math.abs(data[p * 4] - r), Math.abs(data[p * 4 + 1] - g), Math.abs(data[p * 4 + 2] - b));
  return flood(data, width, height, border.filter(p => far(p) <= tolerance), far, tolerance);
}
/** From the seeds outwards over pixels within tolerance (far(p)), making them see-through; the edge kept soft. */
function flood(data, width, height, seeds, far, tolerance) {
  const n = width * height, seen = new Uint8Array(n), queue = new Int32Array(n);
  let head = 0, tail = 0, taken = 0;
  for (const p of seeds) if (!seen[p]) { seen[p] = 1; queue[tail++] = p; }
  while (head < tail) {
    const p = queue[head++], x = p % width;
    data[p * 4 + 3] = 0; taken++;
    for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
      if (q < 0 || q >= n || seen[q]) continue;
      seen[q] = 1;
      if (data[q * 4 + 3] && far(q) <= tolerance) queue[tail++] = q;
    }
  }
  // Soft edge: a kept pixel next to a taken one keeps part of itself, by how unlike the background it is.
  for (let p = 0; p < n; p++) {
    if (seen[p] !== 1 || data[p * 4 + 3] === 0) continue;
    data[p * 4 + 3] = Math.round(data[p * 4 + 3] * Math.min(1, Math.max(0.25, (far(p) - tolerance) / (tolerance + 24))));
  }
  return taken;
}
/** 点一下去掉: the patch around (x, y) in the colour there (a gap in the hair, a corner left) becomes see-through. */
export function eraseAt(data, width, height, x, y, tolerance = 40) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const p0 = y * width + x;
  if (!data[p0 * 4 + 3]) return 0;
  const [r, g, b] = [data[p0 * 4], data[p0 * 4 + 1], data[p0 * 4 + 2]];
  const far = p => Math.max(Math.abs(data[p * 4] - r), Math.abs(data[p * 4 + 1] - g), Math.abs(data[p * 4 + 2] - b));
  return flood(data, width, height, [p0], far, tolerance);
}

/** The box around what is not see-through (alpha above 8), with a little room: {x, y, width, height}; null when empty. */
export function opaqueBounds(data, width, height, pad = 4) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] <= 8) continue;
    if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
  }
  if (right < 0) return null;
  left = Math.max(0, left - pad); top = Math.max(0, top - pad); right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad);
  return {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
}
