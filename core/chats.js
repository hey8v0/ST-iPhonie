// Phone chat history, kept in this browser (IndexedDB) and scoped to the tavern account like the other local data.
// Thread: {id, type:'dm'|'group', name, members:[name], unread, createdAt, updatedAt, messages:[Message]}
// Message: {id, from:'me'|name, kind, text, at, quote?:{from,text}} plus, by kind:
//   voice: translation, emotion · photo: photoId? (none when a contact describes a photo in words), imageTags? (to draw
//         it), imageState?: 'waiting'|'done'|'failed', imageNote?
//   redpacket: amount, state:'sent'|'opened', openedBy? · transfer: amount, state:'sent'|'accepted'|'returned'
//   location: text = place, detail = address · pat: target (who was patted) · dice: text = 1..6
//   notice: text = what `from` did, with {对方} standing for `target` · recall: a withdrawn message · system: app notes
//   gift: gift:{name, emoji, price}, state:'sent'|'accepted'|'returned', openedBy? (a present; price 0 when a character sends it)
//   call: dir:'in'|'out' (from is who called), state:'answered'|'missed'|'declined'|'cancelled', duration (seconds),
//         lines:[{from, text, translation, emotion}] what was said, voicemail:[{text, translation, emotion}] a missed call's message
// list() returns threads without their messages, plus the last message for previews, pinned threads first.
// A thread can be pinned (置顶) or muted (免打扰: its unread messages do not count toward the app's badge).
// friend (删好友, private chats only): {by:'me'|'them', at, requests:[{text, at}]} — by 'me': the user deleted the contact
// (the chat is put away; what the contact sends meanwhile waits as 好友申请 in requests); by 'them': the contact deleted
// the user (the user's messages are refused until a 好友申请 is accepted). refused: when the user last turned down a 好友申请.
// blocked (黑名单, private chats only): {at, held:[{kind, text, at}], requests:[{text, at}], refused} — the user blocked the
// contact: what they send meanwhile is held (拦截记录, never in the chat), a 好友申请 waits in requests; the chat stays.
// streak (聊天火花): days in a row, up to today or yesterday, on which both the user and the other side wrote.
// alts (重新回复的几个版本, the last round only): {after: the user's message the round answers ('' at the start), versions:
// [[Message]], shown: which one is in messages}. Any message added after it, or that message deleted, ends them.
// watch (旁观群, group chats only, 0.9.35): the user is not in the group — its members talk among themselves and the user
// only looks on (nothing can be sent there). Made by the user, or by a contact (「[建群]」 without the user).
//   post (0.9.35): a forum post shared — post:{id ('' when it is not on the forum), title, author, text}
//   outfit (0.9.35): clothes from the 衣柜 shown — outfit:{name, text, owner ('me' or whose 衣柜), photoId?}
//   letter (0.9.36, 慢递信件): letter:{text, arriveAt (when it reaches the other side), opened, answered}
//   pat: suffix (0.9.36, 拍一拍后缀) — the patted one's own words after it, as they were then.
// notice (0.9.36, groups): 群公告 {text, by, at}; nicks: 群昵称 {name ('me' the user): nickname}.
// post (0.9.36, private chats): letters on their way to the user — [{id, from, text, sentAt, arriveAt}], put in the chat
// as a letter when they arrive.
import {connectionLost, lostError, breath} from './idb.js';
import {cleanBoard, BOARDS} from './board.js';

export const CHAT_STORE_LIMITS = Object.freeze({messages: 1000, text: 4000, members: 20, fileText: 30000, versions: 10, held: 50});
export const MUTE_DURATIONS = Object.freeze({'600000': '10 分钟', '3600000': '1 小时', '43200000': '12 小时', '86400000': '1 天', '0': '解除'});
export const cleanSilenced = (value, members) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([n, until]) => members.includes(n) && Number.isFinite(until) && until > 0));
export const canGroupSpeak = (thread, name, now = Date.now()) => thread.type !== 'group' || name === 'me' || (thread.members.includes(name) && !(thread.silenced?.[name] > now));
/** A chat's last round: the contacts' messages after the user's last one (after: that message's id, '' at the start). */
export function lastRound(messages) {
  const list = Array.isArray(messages) ? messages : [], at = list.findLastIndex(m => m.from === 'me' && m.kind !== 'system');
  return {after: at >= 0 ? String(list[at].id) : '', round: list.slice(at + 1).filter(m => m.from !== 'me')};
}
const KINDS = ['text', 'voice', 'photo', 'sticker', 'system', 'redpacket', 'transfer', 'location', 'pat', 'dice', 'notice', 'recall', 'call', 'gift', 'song', 'file', 'forward', 'game', 'post', 'outfit', 'book', 'letter'];
/** 消息回应 (0.9.34): the emoji one can put on a message, one each person (the user's and the contacts'). */
export const REACTIONS = Object.freeze(['❤️', '😂', '👍', '😮', '😢', '🎉']);
const EMOJI = /\p{Extended_Pictographic}/u;
/** One emoji (with its joiners and skin tones), or '' when the text holds none. */
export const oneEmoji = value => {
  const text = String(value ?? '').trim();
  if (!EMOJI.test(text)) return '';
  const seg = globalThis.Intl?.Segmenter ? [...new Intl.Segmenter('zh', {granularity: 'grapheme'}).segment(text)].map(s => s.segment) : [...text];
  return (seg.find(s => EMOJI.test(s)) || '').slice(0, 16);
};
/** A message's reactions: [{from, emoji}], one a person (the last counts), at most 20. */
export function cleanReactions(list) {
  const by = new Map();
  for (const r of Array.isArray(list) ? list : []) { const from = clip(r?.from, 40).trim(), emoji = oneEmoji(r?.emoji); if (from && emoji) { by.delete(from); by.set(from, emoji); } }
  return [...by].slice(-20).map(([from, emoji]) => ({from, emoji}));
}
// 群游戏 (0.9.34): a card in a group chat, its state kept with it.
//   vote:  {type, question, options [2–6], votes [{from, option (index), why}], open}
//   truth: {type, pool [names, 'me' the user], target, choice '' | '真心话' | '大冒险'}
//   chain: {type, mode 'idiom' | 'story', entries [{from, text}], open, loser}
// 小游戏对战 (0.9.35, private chats): 井字棋 'ttt' and 五子棋 'gomoku' (core/board.js) — {type, them, first, moves [{by, at}],
// resigned} kept, turn, winner, line and open worked out from them.
export const GAME_LIMITS = Object.freeze({options: 6, option: 30, question: 80, why: 60, entries: 60, entry: 120, pool: 30});
export const CHAIN_MODES = Object.freeze({idiom: '成语接龙', story: '故事接龙'});
export function cleanGame(g) {
  const type = String(g?.type || '');
  if (BOARDS[type]) return cleanBoard(g, fail);
  if (type === 'vote') {
    const options = (Array.isArray(g.options) ? g.options : []).map(o => clip(o, GAME_LIMITS.option).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, GAME_LIMITS.options);
    const question = clip(g.question, GAME_LIMITS.question).replace(/\s+/g, ' ').trim();
    if (!question) throw fail('投票要有一个问题');
    if (options.length < 2) throw fail('投票至少要两个选项');
    const by = new Map();
    for (const v of Array.isArray(g.votes) ? g.votes : []) { const from = clip(v?.from, 40).trim(), option = Math.round(Number(v?.option)); if (from && option >= 0 && option < options.length) { by.delete(from); by.set(from, {from, option, why: clip(v.why, GAME_LIMITS.why).trim()}); } }
    return {type, question, options, votes: [...by.values()], open: g.open !== false};
  }
  if (type === 'truth') {
    const pool = [...new Set((Array.isArray(g.pool) ? g.pool : []).map(n => clip(n, 40).trim()).filter(Boolean))].slice(0, GAME_LIMITS.pool);
    const target = clip(g.target, 40).trim();
    if (!pool.length || !pool.includes(target)) throw fail('转盘没有转到人');
    return {type, pool, target, choice: ['真心话', '大冒险'].includes(g.choice) ? g.choice : ''};
  }
  if (type === 'chain') {
    const entries = (Array.isArray(g.entries) ? g.entries : []).map(e => ({from: clip(e?.from, 40).trim(), text: clip(e?.text, GAME_LIMITS.entry).replace(/\s+/g, ' ').trim()})).filter(e => e.from && e.text).slice(0, GAME_LIMITS.entries);
    if (!entries.length) throw fail('接龙要有第一句');
    return {type, mode: g.mode === 'story' ? 'story' : 'idiom', entries, open: g.open !== false && entries.length < GAME_LIMITS.entries, loser: clip(g.loser, 40).trim()};
  }
  throw fail('不认识的群游戏');
}
/** What a game card is called (its text, for previews and search). */
export function gameTitle(g) {
  if (g.type === 'vote') return `投票：${g.question}`;
  if (g.type === 'truth') return `真心话大冒险：转到了${g.target === 'me' ? '你' : g.target}`;
  if (BOARDS[g.type]) return `${BOARDS[g.type].name}：${g.winner === 'draw' ? '平局' : g.winner === 'me' ? '你赢了' : g.winner ? `${g.winner}赢了` : g.turn === 'me' ? '轮到你' : `轮到${g.them}`}`;
  return `${CHAIN_MODES[g.mode]}：${g.entries[0]?.text || ''}`;
}
/** 合并转发 (0.9.33): at most this many messages in one record, each this long. */
export const FORWARD_LIMITS = Object.freeze({items: 80, text: 500, title: 60});
/** A forum post or clothes shown in a chat (0.9.35): how long each part may be. note: what the one who shared it said. */
export const SHARE_LIMITS = Object.freeze({title: 60, text: 600, note: 200});
/** 慢递信件 (0.9.36): how long a letter may be; 群公告 and 群昵称. */
export const LETTER_LIMITS = Object.freeze({text: 3000, post: 10});
export const GROUP_LIMITS = Object.freeze({notice: 300, nick: 16});
const timeOf = v => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0;
/** A group's 群公告, checked; null when there is none. */
export function cleanNotice(n) {
  const text = clip(n?.text, GROUP_LIMITS.notice).trim();
  return text ? {text, by: clip(n.by, 40).trim() || 'me', at: timeOf(n.at)} : null;
}
/** A group's 群昵称: {name: nickname}, the empty ones and the same as the name left out. */
export function cleanNicks(value) {
  const out = {};
  for (const [who, nick] of Object.entries(value && typeof value === 'object' ? value : {}).slice(0, 40)) {
    const name = clip(who, 40).trim(), n = clip(nick, GROUP_LIMITS.nick).replace(/\s+/g, ' ').trim();
    if (name && n && n !== name) out[name] = n;
  }
  return out;
}
/** Letters on their way to the user (a private chat's post), checked. */
export function cleanPost(list) {
  return (Array.isArray(list) ? list : []).filter(l => l && String(l.text ?? '').trim()).slice(0, LETTER_LIMITS.post)
    .map(l => ({id: clip(l.id, 64) || Math.random().toString(36).slice(2, 10), from: clip(l.from, 40).trim(), text: clip(l.text, LETTER_LIMITS.text).trim(), sentAt: timeOf(l.sentAt), arriveAt: timeOf(l.arriveAt)}))
    .filter(l => l.from);
}
const CALL_STATES = ['answered', 'missed', 'declined', 'cancelled'];
const spoken = (list, max, withFrom) => (Array.isArray(list) ? list : []).slice(-max).filter(l => l && String(l.text || l.translation || '').trim()).map(l => ({...(withFrom ? {from: clip(l.from, 40).trim() || 'me'} : {}), text: clip(l.text || l.translation, 1000), translation: clip(l.translation || l.text, 1000), emotion: clip(l.emotion || 'calm', 100)}));
const STATES = {redpacket: ['sent', 'opened'], transfer: ['sent', 'accepted', 'returned'], gift: ['sent', 'accepted', 'returned']};
/** The messages that can be edited: their words; a photo keeps its picture. */
export const EDITABLE_KINDS = Object.freeze(['text', 'voice', 'photo']);
const requestsOf = list => (Array.isArray(list) ? list : []).filter(r => r && String(r.text || '').trim()).slice(-10).map(r => ({text: clip(r.text, 300).trim(), at: Number.isFinite(r.at) ? r.at : 0}));
const refusedOf = v => Number.isFinite(v) && v > 0 ? {refused: v} : {};
/** A private chat's 删好友 state, checked; null when there is none. */
export function cleanFriend(f) {
  if (!f || typeof f !== 'object' || !['me', 'them'].includes(f.by)) return null;
  return {by: f.by, at: Number.isFinite(f.at) ? f.at : 0, requests: requestsOf(f.requests), ...refusedOf(f.refused)};
}
/** A private chat's 黑名单 state, checked; null when there is none. */
export function cleanBlocked(b) {
  if (!b || typeof b !== 'object') return null;
  const held = (Array.isArray(b.held) ? b.held : []).filter(h => h && String(h.text || '').trim()).slice(-CHAT_STORE_LIMITS.held)
    .map(h => ({kind: clip(h.kind, 20).trim() || 'text', text: clip(h.text, 500).trim(), at: Number.isFinite(h.at) ? h.at : 0}));
  return {at: Number.isFinite(b.at) ? b.at : 0, held, requests: requestsOf(b.requests), ...refusedOf(b.refused)};
}
/** The words a search looks through in a message. */
export function messageWords(m) {
  switch (m?.kind) {
    case 'text': case 'photo': case 'sticker': case 'redpacket': case 'transfer': return m.text || '';
    case 'voice': return [m.text, m.translation].filter(Boolean).join(' ');
    case 'location': return [m.text, m.detail].filter(Boolean).join(' ');
    case 'gift': return m.gift?.name || '';
    case 'song': return [m.song?.title, m.song?.artist].filter(Boolean).join(' ');
    case 'file': return m.name || '';
    case 'call': return [...(m.lines || []), ...(m.voicemail || [])].map(l => l.translation || l.text || '').join(' ');
    case 'forward': return [m.title, ...(m.items || []).map(i => i.text)].filter(Boolean).join(' ');
    case 'game': return [m.text, ...(m.game?.options || []), ...(m.game?.entries || []).map(e => e.text)].filter(Boolean).join(' ');
    case 'post': return [m.post?.title, m.post?.author, m.post?.text, m.post?.note].filter(Boolean).join(' ');
    case 'outfit': return [m.outfit?.name, m.outfit?.text, m.outfit?.note].filter(Boolean).join(' ');
    case 'book': return [m.book?.title, m.book?.subtitle].filter(Boolean).join(' ');
    case 'letter': return m.letter?.text || '';
    default: return '';
  }
}
/**
 * The messages whose words hold what is asked, in any case, the newest first: {hits: [{thread, id, from, at, before,
 * hit, after}] (at most limit, with the words around the find), total}.
 */
export function searchThreads(threads, query, {limit = 60, around = 16, tail = 44} = {}) {
  const q = String(query ?? '').trim().toLowerCase(), found = [];
  if (!q) return {hits: [], total: 0};
  for (const t of threads) for (const m of t.messages || []) {
    const words = messageWords(m), at = words.toLowerCase().indexOf(q);
    if (at >= 0) found.push({t, m, words, at});
  }
  found.sort((a, b) => b.m.at - a.m.at);
  return {total: found.length, hits: found.slice(0, limit).map(({t, m, words, at}) => {
    const from = Math.max(0, at - around), end = at + q.length;
    return {thread: t.id, id: m.id, from: m.from, at: m.at, before: (from ? '…' : '') + words.slice(from, at), hit: words.slice(at, end), after: words.slice(end, end + tail)};
  })};
}
/**
 * A message as one line of a forwarded record (合并转发): its words, and what it is when it is not words alone. The one
 * who sent it is the record's from, not part of this.
 */
export function forwardLine(m) {
  switch (m?.kind) {
    case 'voice': return `[语音] ${m.translation || m.text || ''}`;
    case 'photo': return `[图片]${m.text ? ' ' + m.text : ''}`;
    case 'sticker': return `[表情包] ${m.text || ''}`;
    case 'redpacket': return `[红包] ${m.text || '恭喜发财，大吉大利'}`;
    case 'transfer': return `[转账 ¥${m.amount}]${m.text ? ' ' + m.text : ''}`;
    case 'gift': return `[礼物] ${m.gift?.name || ''}${m.text ? ' ' + m.text : ''}`;
    case 'location': return `[位置] ${m.text || ''}${m.detail ? '（' + m.detail + '）' : ''}`;
    case 'song': return `[音乐] ${m.song?.title || ''}${m.song?.artist ? ' - ' + m.song.artist : ''}${m.text ? ' ' + m.text : ''}`;
    case 'file': return `[文件] ${m.name || ''}`;
    case 'dice': return `[骰子] ${m.text} 点`;
    case 'call': return '[语音通话]';
    case 'forward': return `[聊天记录] ${m.title || ''}`;
    case 'game': return `[${BOARDS[m.game?.type] ? '小游戏' : '群游戏'}] ${m.text || ''}`;
    case 'post': return `[帖子] ${m.post?.title || String(m.post?.text || '').slice(0, 30)}${m.post?.note ? ' ' + m.post.note : ''}`;
    case 'outfit': return `[穿搭] ${m.outfit?.name || ''}${m.outfit?.note ? ' ' + m.outfit.note : ''}`;
    case 'book': return `[绘本] ${m.book?.title || ''}`;
    case 'letter': return `[信] ${String(m.letter?.text || '').slice(0, 60)}`;
    default: return m?.text || '';
  }
}
/** Money as a string with two decimals, 0.01 to 200000; null when the value is not an amount. */
export function money(value) {
  const n = Math.round(Number(String(value ?? '').replace(/[¥￥,，\s元]/g, '')) * 100) / 100;
  return Number.isFinite(n) && n >= 0.01 && n <= 200000 ? n.toFixed(2) : null;
}
const fail = (message, code = 'INVALID') => Object.assign(new Error(message), {code});
const clip = (value, max) => String(value ?? '').slice(0, max);

function cleanMessage(m, id, at) {
  if (!m || typeof m !== 'object') throw fail('消息格式无效');
  const kind = KINDS.includes(m.kind) ? m.kind : 'text';
  const from = clip(m.from, 40).trim();
  if (!from) throw fail('消息缺少发送人');
  const out = {id, from, kind, text: clip(m.text, CHAT_STORE_LIMITS.text), at};
  if (Number.isFinite(m.updatedAt) && m.updatedAt > 0) out.updatedAt = m.updatedAt;
  if (kind === 'voice') { out.translation = clip(m.translation, CHAT_STORE_LIMITS.text); out.emotion = clip(m.emotion, 100); }
  if (kind === 'photo' && m.photoId) out.photoId = clip(m.photoId, 512);
  if (kind === 'photo' && m.imageTags) out.imageTags = clip(m.imageTags, 6000);
  if (kind === 'photo' && Array.isArray(m.imageVersions)) out.imageVersions = [...new Set(m.imageVersions.filter(x => typeof x === 'string' && x).map(x => clip(x, 512)))].slice(-100);
  if (kind === 'photo' && ['waiting', 'done', 'failed'].includes(m.imageState)) out.imageState = m.imageState;
  if (kind === 'photo' && m.imageNote) out.imageNote = clip(m.imageNote, 200);
  if (kind === 'gift') {
    const g = m.gift && typeof m.gift === 'object' ? m.gift : {};
    out.gift = {name: clip(g.name, 20).trim(), emoji: [...clip(g.emoji, 16).trim()].slice(0, 2).join('') || '🎁', price: Math.max(0, Math.min(99999, Math.round(Number(g.price) * 100) / 100 || 0))};
    if (!out.gift.name) throw fail('礼物缺少名字');
  }
  if (STATES[kind]) {
    if (kind !== 'gift') { out.amount = money(m.amount); if (!out.amount) throw fail('金额无效'); }
    out.state = STATES[kind].includes(m.state) ? m.state : 'sent';
    if (m.openedBy) out.openedBy = clip(m.openedBy, 40);
  }
  if (kind === 'location') out.detail = clip(m.detail, 200);
  // A document the user sent: its name and the words in it (what the contact reads); the file itself is not kept.
  if (kind === 'file') {
    out.name = clip(m.name, 120).trim(); out.size = Math.max(0, Math.round(Number(m.size) || 0)); out.fileText = clip(m.fileText, CHAT_STORE_LIMITS.fileText);
    if (!out.name) throw fail('文件缺少名字');
    if (!out.fileText.trim()) throw fail('文件里没有能读的文字');
  }
  // A song shared: what it is (played from the 歌单 or the user's music sources when tapped).
  if (kind === 'song') { const s = m.song && typeof m.song === 'object' ? m.song : {}; out.song = {title: clip(s.title, 120).trim(), artist: clip(s.artist, 120).trim(), ...(s.draft ? {draft: clip(s.draft, 200)} : {})}; if (!out.song.title) throw fail('歌曲缺少名字'); }
  // A sticker keeps its address, so it still shows after it leaves the collection; a role's own (表情包 drawn for them,
  // 0.9.33) is a photo of the album.
  if (kind === 'sticker') { out.text = clip(m.text, 20); out.url = /^https?:\/\//i.test(String(m.url || '')) ? clip(m.url, 2000) : ''; if (m.photoId) out.photoId = clip(m.photoId, 512); }
  // 合并转发: a record of messages from another chat — its title and the lines, each who said it and what.
  if (kind === 'forward') {
    out.title = clip(m.title, FORWARD_LIMITS.title).trim() || '聊天记录';
    out.items = (Array.isArray(m.items) ? m.items : []).filter(i => i && String(i.text ?? '').trim()).slice(0, FORWARD_LIMITS.items).map(i => ({from: clip(i.from, 40).trim() || '？', text: clip(i.text, FORWARD_LIMITS.text).trim()}));
    if (!out.items.length) throw fail('转发的聊天记录是空的');
    out.text = out.title;
  }
  if (kind === 'pat' || kind === 'notice') out.target = clip(m.target, 40).trim() || 'me';
  // 拍一拍后缀: the patted one's own words, kept with the pat as they were.
  if (kind === 'pat' && String(m.suffix ?? '').trim()) out.suffix = clip(m.suffix, 20).trim();
  // 慢递信件: the words, when it reaches the other side, opened (a letter that came), answered (a letter of the user's).
  if (kind === 'letter') {
    const l = m.letter && typeof m.letter === 'object' ? m.letter : {};
    out.letter = {text: clip(l.text, LETTER_LIMITS.text).trim(), arriveAt: timeOf(l.arriveAt), opened: l.opened === true, answered: l.answered === true};
    if (!out.letter.text) throw fail('信是空的');
    out.text = out.letter.text.slice(0, 30);
  }
  if (kind === 'dice') out.text = String(Math.min(6, Math.max(1, Math.round(Number(m.text)) || 1)));
  // A contact's recall keeps what they said (said): the user may peek at it; what they are told is that it was not seen.
  if (kind === 'recall') { out.text = ''; if (from !== 'me' && String(m.said ?? '').trim()) out.said = clip(m.said, 1000).trim(); }
  if (kind === 'game') { out.game = cleanGame(m.game); out.text = gameTitle(out.game); }
  // 论坛 × 聊天: a post shared (its id links back to it on the forum while it is there).
  if (kind === 'post') {
    const s = m.post && typeof m.post === 'object' ? m.post : {};
    out.post = {id: clip(s.id, 512).trim(), title: clip(s.title, SHARE_LIMITS.title).trim(), author: clip(s.author, 40).trim(), text: clip(s.text, SHARE_LIMITS.text).trim(), ...(String(s.note ?? '').trim() ? {note: clip(s.note, SHARE_LIMITS.note).trim()} : {})};
    if (!out.post.title && !out.post.text) throw fail('分享的帖子是空的');
    out.text = out.post.title || out.post.text.slice(0, 30);
  }
  // 衣柜 × 聊天: clothes shown (whose 衣柜 they are from: 'me', or the one they were put together for).
  if (kind === 'outfit') {
    const s = m.outfit && typeof m.outfit === 'object' ? m.outfit : {};
    out.outfit = {name: clip(s.name, 40).trim() || '一身衣服', text: clip(s.text, SHARE_LIMITS.text).trim(), owner: clip(s.owner, 80).trim() || 'me', ...(s.photoId ? {photoId: clip(s.photoId, 512)} : {}), ...(String(s.note ?? '').trim() ? {note: clip(s.note, SHARE_LIMITS.note).trim()} : {})};
    if (!out.outfit.text) throw fail('这身衣服还没有描述');
    out.text = out.outfit.name;
  }
  // 绘本 × 聊天 (0.9.40): a picture book sent to be read (its words go with it; its id opens it in the 绘本 App while it is there).
  if (kind === 'book') {
    const s = m.book && typeof m.book === 'object' ? m.book : {};
    out.book = {id: clip(s.id, 80).trim(), title: clip(s.title, 40).trim(), subtitle: clip(s.subtitle, 60).trim(), theme: clip(s.theme, 20).trim(), spreads: Math.max(0, Math.min(999, Math.round(Number(s.spreads) || 0))), coverId: clip(s.coverId, 512).trim(), text: clip(s.text, 3000).trim()};
    if (!out.book.title) throw fail('分享的绘本是空的');
    out.text = `《${out.book.title}》`;
  }
  // 消息回应: the emoji people put on it.
  if (Array.isArray(m.reactions) && !['system', 'notice', 'pat', 'recall'].includes(kind)) { const reactions = cleanReactions(m.reactions); if (reactions.length) out.reactions = reactions; }
  if (kind === 'call') {
    out.dir = m.dir === 'out' ? 'out' : 'in';
    out.state = CALL_STATES.includes(m.state) ? m.state : 'missed';
    out.duration = Math.max(0, Math.min(86400, Math.round(Number(m.duration) || 0)));
    out.lines = spoken(m.lines, 80, true);
    out.voicemail = spoken(m.voicemail, 4, false);
  }
  if (m.quote?.text && ['text', 'voice'].includes(kind)) out.quote = {from: clip(m.quote.from, 40), text: clip(m.quote.text, 200)};
  // Sent by a story reply (正文联动手机): which reply (chat|message) and which version of it.
  if (typeof m.story === 'string' && m.story) { out.story = clip(m.story, 300); out.storyVer = clip(m.storyVer, 40); }
  const textless = ['photo', 'system', 'redpacket', 'transfer', 'pat', 'dice', 'recall', 'call', 'gift', 'file'];
  if (!textless.includes(kind) && !out.text.trim()) throw fail('消息内容为空');
  return out;
}
/** A chat's 重新回复 versions, checked (a message that does not hold is left out); null when fewer than two are left. */
function cleanAlts(a, makeId) {
  if (!a || typeof a !== 'object' || !Array.isArray(a.versions)) return null;
  const versions = a.versions.slice(-CHAT_STORE_LIMITS.versions).map(list => (Array.isArray(list) ? list : []).slice(0, 100).flatMap(m => {
    try { return [cleanMessage(m, clip(m?.id || makeId(), 512), Number.isFinite(m?.at) ? m.at : 0)]; } catch { return []; }
  }));
  if (versions.length < 2) return null;
  return {after: clip(a.after, 512), versions, shown: Math.max(0, Math.min(versions.length - 1, Math.round(Number(a.shown)) || 0))};
}

// Where the pages of a browser see that one of them wrote (a page with no storage of its own: only itself).
const pageStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const REVISIONS = new Map();

export class ChatStore {
  #scope; #factory; #now; #id; #storage; #db = null; #opening = null; #closed = false; #madeAt = 0;
  // What the list shows of each thread, id → summary. Reading it from the store means reading every message of every chat, and the
  // phone asks for the list on every change of the settings; so it is kept, and follows the writes. #revision: what another page's
  // write would change. #day: a streak depends on the date. #writes: a read that overlapped a write is not kept.
  #summaries = null; #revision = ''; #day = ''; #writes = 0; #writing = new Set();
  constructor(scope, {indexedDB = globalThis.indexedDB, now = Date.now, id = () => globalThis.crypto.randomUUID(), storage = pageStorage()} = {}) {
    this.#scope = String(scope); this.#factory = indexedDB; this.#now = now; this.#id = id; this.#storage = storage;
  }
  #revisionNow(next) {
    const key = 'st-iphonie-chats-rev:' + this.#scope;
    try { if (this.#storage) { if (next) this.#storage.setItem(key, next); return this.#storage.getItem(key) || ''; } } catch { /* as if there were none */ }
    if (next) REVISIONS.set(key, next);
    return REVISIONS.get(key) || '';
  }
  /** A write has gone through: the summaries follow it (change, for one thread), or go; the other pages are told. */
  #wrote(change) {
    const kept = this.#summaries && this.#revisionNow() === this.#revision;
    this.#writes++;
    const next = this.#revisionNow(this.#now().toString(36) + Math.random().toString(36).slice(2, 8));
    if (kept && change) { change(this.#summaries); this.#revision = next; }
    else this.#summaries = null;
  }
  async #open() {
    if (this.#closed) throw fail('聊天记录已关闭', 'CLOSED');
    if (this.#db) return this.#db;
    if (!this.#factory?.open) throw fail('浏览器不支持本地保存聊天记录，请检查存储权限', 'STORAGE_UNAVAILABLE');
    this.#opening ||= new Promise((resolve, reject) => {
      const req = this.#factory.open('st-iphonie-chats-v1', 1);
      req.onupgradeneeded = () => { const store = req.result.createObjectStore('threads', {keyPath: ['scope', 'id']}); store.createIndex('scope', 'scope'); };
      req.onerror = () => reject(fail('无法打开聊天记录，请检查浏览器的存储权限', 'STORAGE_UNAVAILABLE'));
      req.onblocked = () => reject(fail('另一个页面占用了聊天记录，请关闭旧页面后重试', 'STORAGE_BLOCKED'));
      req.onsuccess = () => {
        if (this.#closed) { req.result.close(); reject(fail('聊天记录已关闭', 'CLOSED')); return; }
        this.#db = req.result;
        const db = this.#db;
        db.onversionchange = () => { db.close(); this.#summaries = null; if (this.#db === db) this.#db = null; };
        db.onclose = () => { if (this.#db === db) this.#db = null; };
        resolve(db);
      };
    }).finally(() => { this.#opening = null; });
    return this.#opening;
  }
  #tx(mode, work) {
    const job = this.#run(mode, work);
    if (mode === 'readwrite') { this.#writing.add(job); const over = () => this.#writing.delete(job); job.then(over, over); }
    return job;
  }
  // A dropped connection (iPhone Safari after the page sat in the background) is reopened once; nothing was written.
  async #run(mode, work, again = true) {
    const db = await this.#open();
    try {
      return await new Promise((resolve, reject) => {
        let result, own, tx, change = null;
        try { tx = db.transaction('threads', mode); } catch (error) { reject(this.#closed ? fail('聊天记录已关闭', 'CLOSED') : lostError(error)); return; }
        const store = tx.objectStore('threads');
        tx.oncomplete = () => { if (mode === 'readwrite') this.#wrote(change); resolve(result); };
        tx.onabort = () => reject(own || (connectionLost(tx.error) ? lostError(tx.error) : fail(tx.error?.name === 'QuotaExceededError' ? '设备存储空间不足，聊天没有保存' : '聊天记录没有保存，请重试', 'STORAGE')));
        work(store, value => { result = value; }, error => { own = error; tx.abort(); }, fn => { change = fn; });
      });
    } catch (error) {
      if (error?.code !== 'STORAGE_LOST' || this.#closed) throw error;
      if (this.#db === db) { try { db.close(); } catch {} this.#db = null; }
      if (again) { await breath(); return this.#run(mode, work, false); }
      throw error;
    }
  }
  #get(store, id, then) {
    const req = store.get([this.#scope, String(id)]);
    req.onsuccess = () => then(req.result || null);
  }
  #public(row) {
    if (!row) return null;
    const {scope, ...rest} = row;
    return structuredClone({pinned: false, muted: false, ...rest});
  }
  #summary(row) {
    const {scope, messages, alts, blocked, ...rest} = row;
    // A blocked chat's 拦截记录 stays out of the list: only how much there is.
    return structuredClone({pinned: false, muted: false, ...rest, ...(blocked ? {blocked: {at: blocked.at, requests: blocked.requests, count: blocked.held.length, ...refusedOf(blocked.refused)}} : {}), count: messages.length, last: messages.filter(m => m.kind !== 'system').at(-1) || null, streak: this.#streak(messages)});
  }
  #streak(messages) {
    const day = at => { const d = new Date(at); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    const mine = new Set(), theirs = new Set();
    for (const m of messages) if (!['system', 'notice', 'recall'].includes(m.kind)) (m.from === 'me' ? mine : theirs).add(day(m.at));
    const both = [...mine].filter(d => theirs.has(d)).sort((a, b) => b - a);
    const today = day(this.#now()), DAY = 86400000;
    if (!both.length || today - both[0] > DAY) return 0;
    let n = 1;
    while (n < both.length && both[n - 1] - both[n] <= DAY + 3600000 && both[n - 1] - both[n] >= DAY - 3600000) n++;
    return n;
  }

  async list() {
    // What was asked to be written before this is in the answer, as when every list came from the store.
    while (this.#writing.size) await Promise.allSettled([...this.#writing]);
    const day = new Date(this.#now()).toDateString();
    if (!this.#summaries || this.#day !== day || this.#revision !== this.#revisionNow()) {
      this.#summaries = null;
      const writes = this.#writes, revision = this.#revisionNow();
      const rows = await this.#tx('readonly', (store, done) => { const req = store.index('scope').getAll(this.#scope); req.onsuccess = () => done(req.result); });
      const summaries = new Map(rows.map(row => [row.id, this.#summary(row)]));
      if (writes !== this.#writes) return this.#ordered(summaries);
      this.#summaries = summaries; this.#revision = revision; this.#day = day;
    }
    return this.#ordered(this.#summaries);
  }
  /** Pinned first, then the latest; each caller gets a copy of its own. */
  #ordered(summaries) {
    return [...summaries.values()].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(t => structuredClone(t));
  }
  async get(id) {
    return this.#tx('readonly', (store, done) => this.#get(store, id, row => done(this.#public(row))));
  }
  async create({type = 'dm', name = '', members = [], space = '', save = '', windowOf = '', watch = false} = {}) {
    const list = [...new Set((Array.isArray(members) ? members : []).map(m => clip(m, 40).trim()).filter(Boolean))];
    if (!list.length) throw fail('请选择聊天对象');
    if (list.length > CHAT_STORE_LIMITS.members) throw fail('群聊最多 20 人');
    if (type === 'group' && list.length < 2) throw fail('群聊至少要选两个人');
    // Later than the one before, even in the same millisecond: the window started last is the one in use (openedLast).
    const now = this.#madeAt = Math.max(this.#now(), this.#madeAt + 1), row = {scope: this.#scope, id: this.#id(), type: type === 'group' ? 'group' : 'dm', name: clip(name, 40).trim() || (type === 'group' ? list.join('、').slice(0, 40) : list[0]), members: type === 'group' ? list : [list[0]], unread: 0, createdAt: now, updatedAt: now, messages: [], ...(space ? {space: clip(space, 300)} : {}), ...(save ? {save: clip(save, 400)} : {}), ...(type === 'group' && windowOf ? {windowOf: clip(windowOf, 512)} : {}), ...(type === 'group' && watch === true ? {watch: true} : {})};
    await this.#tx('readwrite', (store, done, abort, after) => { store.put(row); after(list => list.set(row.id, this.#summary(row))); done(); });
    return this.#public(row);
  }
  async #change(id, change) {
    return this.#tx('readwrite', (store, done, abort, after) => this.#get(store, id, row => {
      if (!row) { abort(fail('这段聊天已不存在', 'MISSING')); return; }
      try { change(row); } catch (error) { abort(error); return; }
      if (row.messages.length > CHAT_STORE_LIMITS.messages) row.messages = row.messages.slice(-CHAT_STORE_LIMITS.messages);
      store.put(row);
      after(list => list.set(row.id, this.#summary(row)));
      done(this.#public(row));
    }));
  }
  async update(id, {name, members, pinned, muted, friend, blocked, befriended, story, open, label, notice, nicks, post, manage} = {}) {
    return this.#change(id, row => {
      if (manage) {
        if (row.type !== 'group' || row.watch) throw fail('旁观群不能管理成员');
        const chosen = [...new Set((manage.names || []).map(n => clip(n, 40).trim()).filter(Boolean))];
        const now = this.#now(), notes = [];
        if (manage.action === 'invite') {
          const added = chosen.filter(n => n !== 'me' && !row.members.includes(n));
          if (row.members.length + added.length > CHAT_STORE_LIMITS.members) throw fail('群成员已达到上限');
          row.members.push(...added);
          notes.push(...added.map(n => `你邀请 ${n} 加入了群聊`));
        } else if (manage.action === 'remove') {
          const removed = chosen.filter(n => row.members.includes(n));
          if (row.members.length - removed.length < 1) throw fail('群里至少保留一位联系人');
          row.members = row.members.filter(n => !removed.includes(n));
          notes.push(...removed.map(n => `${n} 被移出了群聊`));
          for (const n of removed) { if (row.nicks) delete row.nicks[n]; }
        } else if (manage.action === 'silence') {
          if (!Object.hasOwn(MUTE_DURATIONS, manage.duration)) throw fail('请选择禁言时长');
          row.silenced = {...row.silenced};
          for (const n of chosen.filter(n => row.members.includes(n))) {
            if (Number(manage.duration)) row.silenced[n] = now + Number(manage.duration); else delete row.silenced[n];
            notes.push(Number(manage.duration) ? `${n} 被禁言 ${MUTE_DURATIONS[manage.duration]}` : `${n} 的禁言解除了`);
          }
        } else throw fail('群管理操作无效');
        row.silenced = cleanSilenced(row.silenced, row.members);
        row.messages.push(...notes.map((text, i) => cleanMessage({from: 'me', kind: 'notice', text}, this.#id(), now + i)));
        row.updatedAt = now;
      }
      // 群公告 (null takes it away) and 群昵称 (merged; an empty one taken away), groups only.
      if (notice !== undefined && row.type === 'group') { const n = cleanNotice(notice); if (n) row.notice = n; else delete row.notice; }
      if (nicks !== undefined && row.type === 'group') {
        const merged = {...row.nicks};
        for (const [who, nick] of Object.entries(nicks && typeof nicks === 'object' ? nicks : {})) { if (nick) merged[who] = nick; else delete merged[who]; }
        const kept = cleanNicks(merged);
        if (Object.keys(kept).length) row.nicks = kept; else delete row.nicks;
      }
      // Letters on their way (private chats): the list as it is now.
      if (post !== undefined && row.type === 'dm') { const kept = cleanPost(post); if (kept.length) row.post = kept; else delete row.post; }
      // 聊天窗口: a private chat can have several; the one opened last is the one the list shows and replies go to.
      if (open === true) row.openedAt = this.#now();
      if (label !== undefined) { const text = clip(label, 40).trim(); if (text) row.label = text; else delete row.label; }
      // 一直带着: the story always knows this chat (its memory and what is not written up yet).
      if (story !== undefined) { if (story === true) row.story = true; else delete row.story; }
      if (friend !== undefined && row.type === 'dm') { const f = cleanFriend(friend); if (f) row.friend = f; else delete row.friend; }
      if (blocked !== undefined && row.type === 'dm') { const b = cleanBlocked(blocked); if (b) row.blocked = b; else delete row.blocked; }
      // befriended: when the user last took them back (a 好友申请 passed, or 添加), told to the story for a while.
      if (befriended !== undefined && row.type === 'dm') { if (Number.isFinite(befriended) && befriended > 0) row.befriended = befriended; else delete row.befriended; }
      if (pinned !== undefined) row.pinned = pinned === true;
      if (muted !== undefined) row.muted = muted === true;
      if (name !== undefined) row.name = clip(name, 40).trim() || row.name;
      if (members !== undefined && row.type === 'group') {
        const list = [...new Set(members.map(m => clip(m, 40).trim()).filter(Boolean))];
        if (list.length < 2) throw fail('群聊至少要选两个人');
        row.members = list.slice(0, CHAT_STORE_LIMITS.members);
      }
      if (name !== undefined || members !== undefined) row.updatedAt = this.#now();
    });
  }
  /** Adds messages. Replies count as unread unless `read` is set (the chat is open on screen). */
  async append(id, messages, {read = false} = {}) {
    return this.#change(id, row => {
      const now = this.#now();
      const added = messages.filter(m => m.kind === 'system' || canGroupSpeak(row, m.from, now)).map((m, i) => cleanMessage(m, this.#id(), now + i));
      row.messages.push(...added);
      // Anything coming after the last round ends its versions (it is no longer the last).
      if (added.length) delete row.alts;
      if (!read) row.unread += added.filter(m => m.from !== 'me' && !['system', 'notice', 'recall'].includes(m.kind)).length;
      row.updatedAt = now;
    });
  }
  /**
   * 重新回复 came back: the chat's last round (the contacts' messages after the user's last one) gives way to these
   * messages and stays among the round's versions (at most CHAT_STORE_LIMITS.versions), to be shown again. after: the
   * user's message the round answered when it was asked; a chat that moved on since is not changed.
   */
  async replaceRound(id, after, messages, {read = false} = {}) {
    return this.#change(id, row => {
      const last = lastRound(row.messages);
      if (last.after !== String(after ?? '')) throw fail('这段聊天已经变了，这次重新回复没有写入', 'CHANGED');
      const now = this.#now(), added = messages.filter(m => canGroupSpeak(row, m.from, now)).map((m, i) => cleanMessage(m, this.#id(), now + i)), old = new Set(last.round.map(m => m.id));
      // The versions so far (the one showing as it is now: edited, drawn, some deleted), or the round being replaced.
      const kept = row.alts?.after === last.after ? row.alts.versions.map((list, i) => i === row.alts.shown ? last.round : list) : last.round.length ? [last.round] : [];
      const versions = [...kept, added].slice(-CHAT_STORE_LIMITS.versions);
      row.messages = [...row.messages.filter(m => !old.has(m.id)), ...added];
      if (versions.length > 1) row.alts = structuredClone({after: last.after, versions, shown: versions.length - 1}); else delete row.alts;
      if (!read) row.unread += added.filter(m => m.from !== 'me' && !['system', 'notice', 'recall'].includes(m.kind)).length;
      row.updatedAt = now;
    });
  }
  /**
   * Another version of the last round shows. Its messages come back with new ids (the ones they had were deleted from
   * the chat, maybe on another device too); the round that showed goes back among the versions as it is now.
   */
  async showRound(id, index) {
    return this.#change(id, row => {
      const alts = row.alts, last = lastRound(row.messages);
      if (!alts || alts.after !== last.after || !alts.versions[index]) throw fail('这一轮的回复版本已经不在了', 'MISSING');
      if (index === alts.shown) return;
      const old = new Set(last.round.map(m => m.id)), back = alts.versions[index].map(m => ({...structuredClone(m), id: this.#id()}));
      alts.versions[alts.shown] = structuredClone(last.round);
      alts.versions[index] = back;
      alts.shown = index;
      row.messages = [...row.messages.filter(m => !old.has(m.id)), ...structuredClone(back)];
      row.updatedAt = Math.max(this.#now(), (row.updatedAt || 0) + 1);
    });
  }
  /**
   * Changes one message: {state, openedBy} for a red packet or transfer, {text, translation} to edit its words, or
   * {recall: true} to withdraw it (the message keeps its place and sender and loses its content).
   */
  async updateMessage(id, messageId, patch = {}) {
    return this.#change(id, row => {
      const m = row.messages.find(x => x.id === messageId);
      if (!m) throw fail('这条消息已不存在', 'MISSING');
      m.updatedAt = Math.max(this.#now(), (m.updatedAt || m.at || 0) + 1);
      if (patch.recall) {
        for (const key of Object.keys(m)) if (!['id', 'from', 'at', 'updatedAt'].includes(key)) delete m[key];
        Object.assign(m, {kind: 'recall', text: ''});
        return;
      }
      // 消息回应: {react: {from, emoji}} — the same again takes it off, another emoji takes the place of theirs.
      if (patch.react) {
        if (['system', 'notice', 'pat', 'recall'].includes(m.kind)) throw fail('这条消息不能回应');
        const from = clip(patch.react.from, 40).trim(), emoji = oneEmoji(patch.react.emoji), had = (m.reactions || []).find(r => r.from === from);
        if (!from) throw fail('不知道是谁回应的');
        const rest = (m.reactions || []).filter(r => r.from !== from);
        m.reactions = cleanReactions(emoji && had?.emoji !== emoji ? [...rest, {from, emoji}] : rest);
        if (!m.reactions.length) delete m.reactions;
        return;
      }
      // 慢递信件: opened, answered.
      if (patch.letter) {
        if (m.kind !== 'letter') throw fail('这条消息不是信');
        if (patch.letter.opened !== undefined) m.letter.opened = patch.letter.opened === true;
        if (patch.letter.answered !== undefined) m.letter.answered = patch.letter.answered === true;
        return;
      }
      // 群游戏: its state (a vote, a pick, a line of the chain), checked as a whole.
      if (patch.game) {
        if (m.kind !== 'game') throw fail('这条消息不是群游戏');
        m.game = cleanGame({...m.game, ...patch.game, type: m.game.type});
        m.text = gameTitle(m.game);
        return;
      }
      if ('text' in patch) {
        if (!EDITABLE_KINDS.includes(m.kind)) throw fail('这条消息不能编辑');
        const text = clip(patch.text, CHAT_STORE_LIMITS.text).trim();
        if (!text && m.kind !== 'photo') throw fail('消息不能是空的');
        m.text = text;
        if (m.kind === 'voice' && 'translation' in patch) m.translation = clip(patch.translation, CHAT_STORE_LIMITS.text).trim();
        return;
      }
      // A contact's photo: its drawing (photoId '' takes the picture away again).
      if (m.kind === 'photo' && ['photoId', 'imageState', 'imageNote', 'imageTags', 'imageVersions'].some(k => k in patch)) {
        if ('imageTags' in patch) m.imageTags = clip(patch.imageTags, 6000);
        if ('imageVersions' in patch) m.imageVersions = [...new Set((Array.isArray(patch.imageVersions) ? patch.imageVersions : []).filter(x => typeof x === 'string' && x).map(x => clip(x, 512)))].slice(-100);
        if ('photoId' in patch) { if (patch.photoId) m.photoId = clip(patch.photoId, 512); else delete m.photoId; }
        if ('imageState' in patch) { if (['waiting', 'done', 'failed'].includes(patch.imageState)) m.imageState = patch.imageState; else delete m.imageState; }
        if ('imageNote' in patch) { if (patch.imageNote) m.imageNote = clip(patch.imageNote, 200); else delete m.imageNote; }
        return;
      }
      if (!STATES[m.kind]) throw fail('这条消息不能修改');
      if (patch.state !== undefined) {
        if (!STATES[m.kind].includes(patch.state)) throw fail('状态无效');
        m.state = patch.state;
      }
      if (patch.openedBy !== undefined) m.openedBy = clip(patch.openedBy, 40);
    });
  }
  /** A 好友申请 from a contact the user deleted or blocked: kept with the chat until the user answers it. */
  async addRequest(id, texts) {
    return this.#change(id, row => {
      const now = this.#now(), list = (Array.isArray(texts) ? texts : [texts]).map(t => clip(t, 300).trim()).filter(Boolean), add = old => [...old, ...list.map((text, i) => ({text, at: now + i}))];
      if (row.blocked) row.blocked = cleanBlocked({...row.blocked, requests: add(row.blocked.requests)});
      else if (row.friend?.by === 'me') row.friend = cleanFriend({...row.friend, requests: add(row.friend.requests)});
      else throw fail('TA 还是你的好友');
      row.updatedAt = now;
    });
  }
  /** What a blocked contact sends: kept as 拦截记录 (not in the chat, not unread). */
  async hold(id, items) {
    return this.#change(id, row => {
      if (!row.blocked) throw fail('TA 不在黑名单里');
      const now = this.#now(), list = (Array.isArray(items) ? items : [items]).filter(Boolean).map((h, i) => ({kind: h.kind || 'text', text: h.text, at: now + i}));
      row.blocked = cleanBlocked({...row.blocked, held: [...row.blocked.held, ...list]});
    });
  }
  async removeMessages(id, ids) {
    const drop = new Set(ids);
    return this.#change(id, row => {
      row.messages = row.messages.filter(m => !drop.has(m.id));
      // The user's message the last round answered is gone: so are the round's other versions.
      if (row.alts && lastRound(row.messages).after !== row.alts.after) delete row.alts;
    });
  }
  async markRead(id) {
    return this.#change(id, row => { row.unread = 0; });
  }
  async remove(id) {
    return this.#tx('readwrite', (store, done, abort, after) => { store.delete([this.#scope, String(id)]); after(list => list.delete(String(id))); done(true); });
  }
  async unread() {
    return (await this.list()).reduce((n, t) => n + (t.muted ? 0 : t.unread), 0);
  }
  /** Every thread with its messages, for a backup. */
  async exportThreads() {
    const rows = await this.#tx('readonly', (store, done) => { const req = store.index('scope').getAll(this.#scope); req.onsuccess = () => done(req.result); });
    return rows.map(row => this.#public(row));
  }
  /** Puts backup threads back with their ids, checked like new ones, in one transaction. replace: other threads go. */
  async importThreads(threads, {replace = false, merge} = {}) {
    if (!Array.isArray(threads)) throw fail('备份里的聊天记录无效');
    const now = this.#now(), prepare = values => values.map(t => {
      if (!t || typeof t !== 'object' || !t.id) throw fail('备份里的聊天记录无效');
      const members = [...new Set((Array.isArray(t.members) ? t.members : []).map(m => clip(m, 40).trim()).filter(Boolean))].slice(0, CHAT_STORE_LIMITS.members);
      if (!members.length) throw fail('备份里有一段聊天没有聊天对象');
      const messages = (Array.isArray(t.messages) ? t.messages : []).slice(-CHAT_STORE_LIMITS.messages).map(m => cleanMessage(m, clip(m?.id || this.#id(), 512), Number.isFinite(m?.at) ? m.at : now));
      const row = {scope: this.#scope, id: clip(t.id, 512), type: t.type === 'group' ? 'group' : 'dm', name: clip(t.name, 40).trim() || members.join('、').slice(0, 40), members: t.type === 'group' ? members : [members[0]], pinned: t.pinned === true, muted: t.muted === true, ...(t.story === true ? {story: true} : {}), ...(Number.isFinite(t.openedAt) ? {openedAt: t.openedAt} : {}), ...(typeof t.label === 'string' && t.label.trim() ? {label: clip(t.label, 40).trim()} : {}), ...(t.type === 'group' && t.windowOf ? {windowOf: clip(t.windowOf, 512)} : {}), ...(t.type === 'group' ? {silenced: cleanSilenced(t.silenced, members)} : {}), ...(t.type === 'group' && t.watch === true ? {watch: true} : {}), ...(t.type === 'group' && cleanNotice(t.notice) ? {notice: cleanNotice(t.notice)} : {}), ...(t.type === 'group' && Object.keys(cleanNicks(t.nicks)).length ? {nicks: cleanNicks(t.nicks)} : {}), ...(t.type !== 'group' && cleanPost(t.post).length ? {post: cleanPost(t.post)} : {}),
        unread: Math.max(0, Math.min(CHAT_STORE_LIMITS.messages, Math.round(Number(t.unread)) || 0)), createdAt: Number.isFinite(t.createdAt) ? t.createdAt : now, updatedAt: Number.isFinite(t.updatedAt) ? t.updatedAt : now, messages, ...(t.space ? {space: clip(t.space, 300)} : {}), ...(t.save ? {save: clip(t.save, 400)} : {}), ...(t.type !== 'group' && cleanFriend(t.friend) ? {friend: cleanFriend(t.friend)} : {}), ...(t.type !== 'group' && cleanBlocked(t.blocked) ? {blocked: cleanBlocked(t.blocked)} : {}), ...(t.type !== 'group' && Number.isFinite(t.befriended) && t.befriended > 0 ? {befriended: t.befriended} : {})};
      // 重新回复的版本 come along with a backup or a sync, while they still belong to the chat's last round.
      const alts = cleanAlts(t.alts, () => this.#id());
      if (alts && lastRound(messages).after === alts.after) row.alts = alts;
      return row;
    });
    const rows = prepare(threads);
    return this.#tx('readwrite', (store, done, abort) => {
      const write = incoming => { for (const row of incoming) store.put(row); done(incoming.length); };
      if (!replace) { write(rows); return; }
      const req = store.index('scope').getAll(this.#scope);
      req.onsuccess = () => {
        try {
          const incoming = merge ? prepare(merge(req.result.map(row => this.#public(row)))) : rows;
          for (const row of req.result) store.delete([this.#scope, row.id]);
          write(incoming);
        } catch (error) { abort(error); }
      };
    });
  }
  close() { this.#closed = true; this.#summaries = null; this.#db?.close(); this.#db = null; }
}

// ---------- 聊天窗口 ----------
const openedLast = (a, b) => Math.max(b.openedAt || 0, b.createdAt || 0) - Math.max(a.openedAt || 0, a.createdAt || 0);
/** A contact's private chats (聊天窗口), the one in use first: the one opened (or started) last. */
export function dmWindows(threads, name) {
  return (threads || []).filter(t => t.type === 'dm' && t.members.length === 1 && t.members[0] === name).sort(openedLast);
}
/** The private chat with a contact that is in use, or undefined. */
export const currentDm = (threads, name) => dmWindows(threads, name)[0];
/** Which group a group chat is a window of: the first one's id (windowOf), kept when that one is deleted. */
export const groupKey = t => t.windowOf || t.id;
/** The 聊天窗口 a chat belongs with, the one in use first: a contact's private chats, or one group's windows. */
export function chatWindows(threads, thread) {
  if (thread?.type !== 'group') return dmWindows(threads, thread?.members?.[0]);
  const key = groupKey(thread);
  return (threads || []).filter(t => t.type === 'group' && groupKey(t) === key).sort(openedLast);
}
/** The window in use among a chat's windows, or undefined. */
export const currentWindow = (threads, thread) => chatWindows(threads, thread)[0];

