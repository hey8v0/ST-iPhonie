// 查手机: a look into a character's own phone — their chats with other people, what they searched for, their notes, the
// photos in their album, their shopping cart and wallpaper, their recent calls, what is on their calendar and what they
// have been listening to — made up by the model from who they are and what they know.
// No DOM or network here: the prompt, the parser and the checks on what is stored. One snapshot per character; looking
// again makes a new one.
//
// The model answers in sections, one item per line:
//   【知道】一件事                   what the owner really knows (written first so the rest keeps to it; not stored)
//   【聊天】对象                    a chat with someone; the lines under it are 「名字：内容」
//   【搜索】搜索的内容               one search
//   【备忘录】标题｜内容             one note
//   【相册】照片里拍了什么｜english tags   one photo, described (the tags only when pictures can be drawn)
//   【购物车】商品｜价格｜备注        one thing in the cart
//   【壁纸】画面｜english tags        the wallpaper, like a photo
//   【通话】对象｜呼入/呼出/未接｜时长  one recent call
//   【日程】时间｜事情               one thing on the calendar
//   【音乐】歌名 - 歌手              one song listened to lately
import {promptText} from './prompt-rules.js';
import {messageLine} from './chat.js';
import {songOf} from './music.js';

export const PEEK_LIMITS = Object.freeze({chats: 5, lines: 24, searches: 12, notes: 5, photos: 9, cart: 8, calls: 10, events: 6, songs: 10, knows: 10, text: 600});

const fill = (template, values) => String(template).replace(/\{\{(.+?)\}\}/g, (m, key) => values[key.trim()] ?? m);
const clip = (value, max) => String(value ?? '').slice(0, max);
const short = value => clip(value, 30).replace(/[|｜【】]/g, '').trim();
// What the user wrote in brackets in the story is their own thoughts or a note to the model: nobody in the story heard it.
const unsaid = text => String(text).replace(/（[^（）]*）|\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The request: the preset's rules used in 查手机, the character, the world, the user, the story and the real phone chat
 * between the character and the user (their phone has that chat too, so the other chats may mention the user). The
 * story and the settings are written for the reader, who sees everything; the phone may only hold what its owner knows,
 * so the model first lists that and writes the rest from it.
 */
export function buildPeekRequest({prompts = {}, preset, person, story = [], user = '我', userPersona = '', history = [], lore = '', images = false, memory = '', earlier = '', before = null}) {
  const name = person.name;
  const rules = preset.entries.filter(e => e.enabled && e.text.trim() && (e.use || []).includes('peek')).map(e => fill(e.text, {'用户': user, '对象': name}));
  const said = story.map(s => ({...s, text: s.name === user ? unsaid(s.text) : s.text})).filter(s => s.text);
  const system = promptText(prompts, 'peek', 'system', {'预设规则': rules.join('\n\n'), '用户': user, '主人': name,
    '主人资料': (person.persona || person.card || '').trim() || '（没有资料，按剧情里的表现来）',
    '世界书': lore.trim(), '用户设定': userPersona.trim(), '更早的剧情': earlier.trim(), '最近的剧情': said.map(s => `${s.name}：${s.text}`).join('\n'),
    '记忆': memory.trim(), '上次': before ? peekSummary(before) : '', '聊天记录': history.map(m => messageLine(m, user)).filter(Boolean).join('\n'), '出图': images});
  const ask = promptText(prompts, 'peek', 'ask', {'用户': user, '主人': name, '上次': !!before});
  return [{role: 'system', content: system}, {role: 'user', content: ask}];
}
/** The phone as last seen, short, for 接着上次看. */
export function peekSummary(p) {
  const out = [];
  for (const c of p.chats || []) out.push(`【聊天】${c.with}（最近几句）\n${c.lines.slice(-6).map(l => `${l.from}：${l.text}`).join('\n')}`);
  if (p.searches?.length) out.push(`【搜索】${p.searches.join('；')}`);
  for (const n of p.notes || []) out.push(`【备忘录】${n.title}｜${n.text.slice(0, 120)}`);
  if (p.photos?.length) out.push(`【相册】${p.photos.map(x => x.text).join('；')}`);
  if (p.cart?.length) out.push(`【购物车】${p.cart.map(x => x.name).join('；')}`);
  if (p.wallpaper?.text) out.push(`【壁纸】${p.wallpaper.text}`);
  if (p.calls?.length) out.push(`【通话】${p.calls.map(c => `${c.with}（${CALL_WORDS[c.dir]}）`).join('；')}`);
  if (p.events?.length) out.push(`【日程】${p.events.map(e => `${e.when} ${e.what}`.trim()).join('；')}`);
  if (p.songs?.length) out.push(`【音乐】${p.songs.map(s => [s.title, s.artist].filter(Boolean).join(' - ')).join('；')}`);
  return out.join('\n');
}
/**
 * 接着上次看: what is new put onto the phone as last seen. A chat with the same person goes on (its newest lines kept);
 * new searches, notes, photos, calls and songs come first (a note of the same title is the changed one); the cart and
 * the calendar are as they are now; the wallpaper stays unless it changed. Drawn photos keep their pictures.
 */
export function mergePeek(old, found) {
  if (!old) return found;
  const chats = (old.chats || []).map(c => ({...c, lines: [...c.lines]}));
  for (const c of [...(found.chats || [])].reverse()) {
    const at = chats.findIndex(x => x.with === c.with);
    const lines = at >= 0 ? [...chats[at].lines, ...c.lines].slice(-PEEK_LIMITS.lines) : c.lines;
    if (at >= 0) chats.splice(at, 1);
    chats.unshift({with: c.with, lines});
  }
  const searches = [...new Set([...(found.searches || []), ...(old.searches || [])])].slice(0, PEEK_LIMITS.searches);
  const notes = [...(found.notes || []), ...(old.notes || []).filter(n => !(found.notes || []).some(x => x.title && x.title === n.title))].slice(0, PEEK_LIMITS.notes);
  const photos = [...(found.photos || []), ...(old.photos || [])].slice(0, PEEK_LIMITS.photos);
  const calls = [...(found.calls || []), ...(old.calls || [])].slice(0, PEEK_LIMITS.calls);
  const songKey = s => `${s.title}|${s.artist}`, songs = [...(found.songs || []), ...(old.songs || []).filter(s => !(found.songs || []).some(x => songKey(x) === songKey(s)))].slice(0, PEEK_LIMITS.songs);
  return {...found, chats: chats.slice(0, PEEK_LIMITS.chats), searches, notes, photos, calls, songs,
    events: found.events?.length ? found.events : old.events || [],
    cart: found.cart?.length ? found.cart : old.cart || [], wallpaper: found.wallpaper || old.wallpaper || null};
}

const LINE = /^\s*(?:[-*•]\s*)?[【\[]\s*(聊天|搜索|搜索记录|备忘录|备忘|相册|照片|购物车|购物|壁纸|知道|通话记录|通话|电话|日程|日历|音乐|歌曲|在听)\s*[】\]]\s*(.*)$/;
/** A call's direction from its words: in (呼入, 打来), out (呼出, 打给), missed (未接). */
export const CALL_WORDS = Object.freeze({in: '呼入', out: '呼出', missed: '未接'});
const callDir = word => /未接|没接|错过|missed/i.test(word) ? 'missed' : /呼出|打出|拨出|打给|去电|out/i.test(word) ? 'out' : 'in';
const SAID = /^([^:：\n]{1,30}?)\s*[:：]\s*(.+)$/;
const clean = s => String(s).replace(/<[^>]+>/g, '').trim().replace(/^[「“"](.*)[」”"]$/s, '$1').trim();
/** A described picture: the Chinese description, and the English tags after the bar (Chinese words dropped). */
function picture(value) {
  const [text, ...rest] = value.split(/[|｜]/);
  const tags = rest.join(',').replace(/[一-鿿]+/g, ' ').split(/[,，]/).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ').slice(0, 600);
  return {text: clean(text).slice(0, 200), tags};
}
const price = value => { const n = Number(String(value).replace(/[,，\s]/g, '').match(/\d+(?:\.\d+)?/)?.[0]); return Number.isFinite(n) && n >= 0 ? Math.min(n, 9999999) : 0; };

/** The model's answer as {chats: [{with, lines: [{from, text}]}], searches, notes: [{title, text}], photos: [{text, tags}],
 *  cart: [{name, price, note}], wallpaper: {text, tags} | null, knows: string[]}. */
export function parsePeek(reply, {name, user = '我'} = {}) {
  const body = String(reply || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```[a-z]*\n?|```/g, '');
  const out = {chats: [], searches: [], notes: [], photos: [], cart: [], calls: [], events: [], songs: [], wallpaper: null, knows: []};
  let chat = null, note = null;
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(LINE);
    if (!m) {
      // Lines of the chat being written, or more lines of a note.
      const s = chat && raw.trim().match(SAID);
      if (s && chat.lines.length < PEEK_LIMITS.lines) { const from = short(s[1]), text = clean(s[2]).slice(0, PEEK_LIMITS.text); if (from && text) chat.lines.push({from: from === user ? 'me' : from, text}); }
      else if (note && raw.trim()) note.text = (note.text + '\n' + clean(raw)).slice(0, PEEK_LIMITS.text);
      continue;
    }
    const [, kind, rest] = m, value = clean(rest);
    chat = null; note = null;
    if (kind === '聊天') {
      const other = short(value);
      if (other && other !== name && out.chats.length < PEEK_LIMITS.chats) { chat = {with: other, lines: []}; out.chats.push(chat); }
    } else if (kind.startsWith('搜索')) {
      if (value && out.searches.length < PEEK_LIMITS.searches) out.searches.push(value.slice(0, 100));
    } else if (kind.startsWith('备忘')) {
      const [title, ...text] = value.split(/[|｜]/);
      const entry = text.length ? {title: clean(title).slice(0, 40), text: clean(text.join('｜')).slice(0, PEEK_LIMITS.text)} : {title: '', text: value.slice(0, PEEK_LIMITS.text)};
      if (entry.text && out.notes.length < PEEK_LIMITS.notes) { out.notes.push(entry); note = entry; }
    } else if (kind.startsWith('购物')) {
      const [item, cost = '', ...note] = value.split(/[|｜]/);
      if (clean(item) && out.cart.length < PEEK_LIMITS.cart) out.cart.push({name: clean(item).slice(0, 60), price: price(cost), note: clean(note.join('｜')).slice(0, 100)});
    } else if (kind === '壁纸') {
      const wall = picture(value);
      if (wall.text && !out.wallpaper) out.wallpaper = wall;
    } else if (kind.startsWith('通话') || kind === '电话') {
      const [who, dir = '', long = ''] = value.split(/[|｜]/).map(clean);
      if (short(who) && out.calls.length < PEEK_LIMITS.calls) { const d = callDir(dir); out.calls.push({with: short(who), dir: d, long: d === 'missed' ? '' : long.slice(0, 20)}); }
    } else if (kind === '日程' || kind === '日历') {
      const [when, ...what] = value.split(/[|｜]/);
      const entry = what.length ? {when: clean(when).slice(0, 30), what: clean(what.join('｜')).slice(0, 80)} : {when: '', what: value.slice(0, 80)};
      if (entry.what && out.events.length < PEEK_LIMITS.events) out.events.push(entry);
    } else if (kind === '音乐' || kind === '歌曲' || kind === '在听') {
      const song = songOf(value);
      if (song.title && out.songs.length < PEEK_LIMITS.songs) out.songs.push(song);
    } else if (kind === '知道') {
      if (value && out.knows.length < PEEK_LIMITS.knows) out.knows.push(value.slice(0, 200));
    } else if (value && out.photos.length < PEEK_LIMITS.photos) {
      const photo = picture(value);
      if (photo.text) out.photos.push(photo);
    }
  }
  out.chats = out.chats.filter(c => c.lines.length);
  return out;
}

/** The id of a person's snapshot: one per person (per card, with 分区 on). */
export const peekId = (name, space = '') => 'peek:' + (space ? space + ':' : '') + name;
/** A picture as it is stored: its description, (when it can be drawn) its tags, the drawn picture and how drawing went. */
function cleanPicture(x) {
  const photo = {text: clip(x.text, 200).trim(), tags: clip(x.tags, 600).trim()};
  if (x.photoId) photo.photoId = clip(x.photoId, 512);
  if (['waiting', 'done', 'failed'].includes(x.state)) photo.state = x.state;
  if (x.note) photo.note = clip(x.note, 200);
  return photo;
}
/** A snapshot as it is stored: {id, kind: 'peek', name, at, chats, searches, notes, photos, cart, calls, events, songs, wallpaper?, space?}. */
export function cleanPeek(p, at) {
  const name = short(p?.name);
  if (!name) throw Error('不知道是谁的手机');
  const chats = (Array.isArray(p.chats) ? p.chats : []).slice(0, PEEK_LIMITS.chats).map(c => ({with: short(c?.with),
    lines: (Array.isArray(c?.lines) ? c.lines : []).slice(0, PEEK_LIMITS.lines).map(l => ({from: short(l?.from), text: clip(l?.text, PEEK_LIMITS.text).trim()})).filter(l => l.from && l.text)})).filter(c => c.with && c.lines.length);
  const list = (value, max, size) => (Array.isArray(value) ? value : []).map(x => clip(x, size).trim()).filter(Boolean).slice(0, max);
  const notes = (Array.isArray(p.notes) ? p.notes : []).slice(0, PEEK_LIMITS.notes).map(n => ({title: clip(n?.title, 40).trim(), text: clip(n?.text, PEEK_LIMITS.text).trim()})).filter(n => n.text);
  const photos = (Array.isArray(p.photos) ? p.photos : []).slice(0, PEEK_LIMITS.photos).map(x => typeof x === 'string' ? {text: x} : x || {}).map(cleanPicture).filter(x => x.text);
  const cart = (Array.isArray(p.cart) ? p.cart : []).slice(0, PEEK_LIMITS.cart).map(x => ({name: clip(x?.name, 60).trim(), price: price(x?.price), note: clip(x?.note, 100).trim()})).filter(x => x.name);
  const wall = p.wallpaper && typeof p.wallpaper === 'object' ? cleanPicture(p.wallpaper) : null;
  const calls = (Array.isArray(p.calls) ? p.calls : []).slice(0, PEEK_LIMITS.calls).map(c => ({with: short(c?.with), dir: Object.hasOwn(CALL_WORDS, c?.dir) ? c.dir : 'in', long: c?.dir === 'missed' ? '' : clip(c?.long, 20).trim()})).filter(c => c.with);
  const events = (Array.isArray(p.events) ? p.events : []).slice(0, PEEK_LIMITS.events).map(e => ({when: clip(e?.when, 30).trim(), what: clip(e?.what, 80).trim()})).filter(e => e.what);
  const songs = (Array.isArray(p.songs) ? p.songs : []).slice(0, PEEK_LIMITS.songs).map(s => ({title: clip(s?.title, 120).trim(), artist: clip(s?.artist, 120).trim()})).filter(s => s.title);
  const space = clip(p.space, 300);
  const out = {id: peekId(name, space), kind: 'peek', name, at, chats, searches: list(p.searches, PEEK_LIMITS.searches, 100), notes, photos, cart, calls, events, songs, ...(wall?.text ? {wallpaper: wall} : {}), ...(space ? {space} : {})};
  if (!chats.length && !out.searches.length && !notes.length && !out.photos.length && !cart.length && !calls.length && !events.length && !songs.length) throw Error(`没看到${name}手机里的东西，可以再试一次`);
  return out;
}
