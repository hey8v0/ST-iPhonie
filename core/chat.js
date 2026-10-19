// Chat app logic without DOM or network: chat presets, manual contacts, the reply prompt, the reply parser,
// and the text that carries a phone chat into the next story reply ("带进剧情").
//
// A chat preset holds the rules the model follows when it answers in the phone, how many recent story messages
// and chat messages it sees, and the template used when a chat is brought into the story.
import {promptRule} from './prompt-rules.js';
import {songOf, listeningNote} from './music.js';
import {normalizeWallet, defaultWallet, PREMIUM, guessEmoji, yuan} from './wallet.js';
import {parseDialogue, isPlaceholderRole} from './protocol.js';
import {money} from './chats.js';
import {callSummary} from './call.js';
import {languageName} from './languages.js';
import {normalizeMemory} from './memory.js';

// loreMax, storyEach, storyTotal: characters (0: no limit of the phone's own; the tavern's World Info budget still applies).
export const CHAT_LIMITS = Object.freeze({contacts: 200, persona: 4000, story: 100, history: 500, chars: 2_000_000});

// Where a rule is used: private chats, group chats, 朋友圈 (posts, likes and comments), 电话 (voice calls).
export const RULE_USES = Object.freeze(['dm', 'group', 'moments', 'call', 'forum', 'peek', 'story']);
export const DEFAULT_CHAT_ENTRIES = Object.freeze([
  {id: 'style', title: '短信口吻', text: '你在一个手机聊天软件里，以联系人本人的身份回复{{用户}}。像真的在发手机消息：口语，可以用语气词和颜文字，不写动作、旁白和心理描写，不加引号。发几条、每条多长，按这个人的性格、说话习惯和当下的心情来：话少的人可能只回一个字、一个表情；话多的人会连着发好几条；习惯打长段的人一条就是一大段；激动、委屈、兴奋或者有很多话想说的时候，可以一口气发很多条。不要每次都发差不多的条数和长度。', use: ['dm', 'group']},
  {id: 'persona', title: '守住人设', text: '严格按每个联系人的人设、和{{用户}}的关系、说话习惯来回复。最近的剧情只作背景：可以提到发生过的事，但不要复述剧情，也不要替{{用户}}说话。', use: ['dm', 'group']},
  {id: 'group', title: '群聊', text: '群聊里谁接话、几个人接话，看话题和各自性格：冷场时可能只有一个人回，热闹的话题可以好几个人抢着说；每个人发多少也按各自的说话习惯。成员之间也可以互相回应、吐槽。', use: ['group']},
  {id: 'features', title: '手机功能', text: '你们是在手机上聊天，可以像真人一样用手机功能，但要有理由、看场合，大多数时候还是发文字：\n- 照片：分享正在看的东西、自拍、吃的、窗外的景色，或者{{用户}}问起时。写成「名字：[图片] 一句话描述照片里拍到的画面」，写清楚看得见的东西。\n- 位置：约见面、说自己在哪、让{{用户}}来找时。写成「名字：[位置] 地点」。\n- 红包：节日、道谢、道歉、哄人、庆祝、开玩笑时，金额和身份、关系相称。写成「名字：[红包 ¥金额] 祝福语」。\n- 转账：还钱、付账、给零花钱这类真的涉及钱的事，只在私聊里用。写成「名字：[转账 ¥金额] 备注」。\n- 拍一拍：想引起注意、撒娇、打招呼，或者{{用户}}很久没回时。写成「名字：[拍一拍]」。\n- {{用户}}发来的红包和转账，收不收按人设来：客气的人可能先推辞，嘴硬的人嘴上说不要，正直的人会退还不该收的钱。收下红包写「名字：[领取红包]」，收下转账写「名字：[收款]」，退还转账写「名字：[退还]」，通常再跟一句话。\n- {{用户}}撤回消息、拍了拍谁、掷骰子、发来照片或位置时，可以自然地接话。\n一轮回复里最多用一次这些功能，不要连着几轮都发红包或照片。', use: ['dm', 'group']},
  {id: 'voice', title: '语音消息', text: '情绪强烈、不方便打字，或者想让对方听到声音时，可以发语音消息，偶尔发就好。语音消息整条写成：{{语音格式}}\n能发语音的人和各自的语音语言：{{可发语音}}', use: ['dm', 'group']},
  {id: 'post', title: '顺手发朋友圈', use: ['dm', 'group'], text: '聊天里发生了让人有感触的事（开心、委屈、被逗笑、吵了架、想念对方），很偶尔可以顺手发一条朋友圈，大多数时候不发。朋友圈是给所有朋友看的，可以含蓄、意有所指，不要直接复述聊天内容。'},
  {id: 'm-style', title: '朋友圈口吻', use: ['moments'], text: '你在替联系人发朋友圈。像真人发动态：一两句话到一小段，写日常、心情、吐槽、见闻，或者对最近发生的事的感受。口语、自然，可以用表情和颜文字，不写旁白、动作描写和心理描写。每个人发的内容和语气都要符合自己的人设和说话习惯，彼此不要雷同。'},
  {id: 'm-persona', title: '朋友圈里守住人设', use: ['moments'], text: '朋友圈是发给所有朋友看的，不是单独对{{用户}}说话。可以含蓄地提到和{{用户}}之间的事，但不要把只有两个人知道的秘密直接写出来，除非人设就是这样。最近的剧情只作背景，不要复述剧情，也不要替{{用户}}说话或发动态。'},
  {id: 'm-interact', title: '点赞和评论', use: ['moments'], text: '别人发动态时，关系好的联系人会点赞或评论；评论简短口语，可以互相接话、吐槽、开玩笑。{{用户}}评论时，被评论的人一定会回复，别的人看到了也可以接话。'},
  {id: 'm-picture', title: '朋友圈配图', use: ['moments'], text: '有画面感的动态可以配一张图，大约三成的动态配图就好：自拍、吃的、风景、宠物、正在看的东西。配图写成英文 danbooru tag，描述画面本身。'},
  {id: 'c-dial', title: '打电话', use: ['dm'], text: '想马上听到{{用户}}的声音、有急事、吵完架想和好、半夜睡不着想念的时候，很偶尔可以直接打电话过去。大多数时候发消息就好，只有真的有理由时才打。'},
  {id: 'f-style', title: '论坛口吻', use: ['forum'], text: '论坛是公开的，谁都能看：发帖和回帖的有角色，也有不认识的网友（路人）。路人有自己的网名和说话习惯，吃瓜、八卦、玩梗、抬杠、安利、求助都可以，口吻像真的网友，别都是好话。角色在论坛上用自己的名字，发言符合人设；公开场合说话一般比私聊更注意分寸，除非人设就是这样。话题可以来自这个世界里公开发生的事、人人都知道的设定、日常生活和身边的事；剧情里私下发生的事，论坛上的人不知道。'},
  {id: 'p-style', title: 'TA 的手机', use: ['peek'], text: '{{用户}}正在偷看{{对象}}的手机。手机里的东西都要像真的：{{对象}}和朋友、家人、同事或别的角色的聊天，搜索记录，备忘录，相册。内容要符合{{对象}}的人设、生活和最近发生的事，聊天对象各有各的说话方式；可以藏着{{对象}}没对{{用户}}说出口的心思、小秘密或者反差，但不要编出和剧情矛盾的大事件。'},
  {id: 's-text', title: '正文里主动发消息', use: ['story'], text: '剧情里有人这时会给{{用户}}发手机消息的话（刚分开、说好到了报个平安、在别处想起{{用户}}、有事找{{用户}}、吵完架想和好……），可以让 TA 在手机上发几条消息。像真的短信：口语、简短，看人设和剧情来，也可以发 [图片]、[位置]、[红包 ¥金额] 这些。不用每次都发，剧情里没有合适的时候就不发。'},
  {id: 'c-style', title: '通话口吻', use: ['call'], text: '你在和{{用户}}打语音电话，说的每一句都会被念出来。像真人打电话一样说话：口语，会接话、会反问，会有停顿和语气词。说多少按人设和情境来：话少的人三言两语，健谈的人、激动的时候、正在讲一件事的时候可以一口气说一大段；不要每次都说差不多长。身边发生的小事用说的话带出来（比如「等一下，我这边有点吵」），不写动作、旁白、心理描写和表情符号。守住人设和你们的关系，最近的剧情和聊天可以自然提起。'}
]);
export const DEFAULT_BRING = '以下是{{用户}}刚才在手机上和{{对象}}的聊天记录。接下来的正文可以自然地承接、提到或回应这段聊天，不要原样复述：\n{{聊天记录}}';
const DEFAULT_INJECTION = {position: 'in_chat', depth: 1, role: 'system'};
// rev 2 (0.6): presets made earlier get the 手机功能 entry once; deleting it afterwards sticks.
// rev 3 (0.6.19): rules say where they are used (私聊 / 群聊 / 朋友圈); presets made earlier get 顺手发朋友圈 and the
// four 朋友圈 rules once, and their own rules keep applying to both kinds of chat as before.
// rev 4 (0.6.20): 来电; presets made earlier get 打电话 and 通话口吻 once.
// rev 5 (0.6.42): how much a contact says follows the person, not a fixed 一到三条 / 一到三句; rules still holding the old
// default words get the new ones, rules the user changed stay as they are.
// rev 6 (0.6.45): 论坛 and 查手机; presets made earlier get 论坛口吻 and TA 的手机 once.
// rev 7 (0.7.3): characters text the user from the story; presets made earlier get 正文里主动发消息 once.
const PRESET_REV = 7;
const OLD_RULES = Object.freeze({style: '你在一个手机聊天软件里，以联系人本人的身份回复{{用户}}。像真的在发手机消息：口语、简短，一次发一到三条，每条一两句话。可以用语气词和颜文字，不写动作、旁白和心理描写，不加引号。', group: '群聊里每次由一到三位成员接话，谁接话看话题和各自性格，成员之间也可以互相回应、吐槽。', 'c-style': '你在和{{用户}}打语音电话，说的每一句都会被念出来。像真人打电话一样说话：口语、句子短，一次说一到三句；会接话、会反问，会有停顿和语气词。身边发生的小事用说的话带出来（比如「等一下，我这边有点吵」），不写动作、旁白、心理描写和表情符号。守住人设和你们的关系，最近的剧情和聊天可以自然提起。'});
const DEFAULT_PRESET = {id: 'default', name: '日常短信', rev: PRESET_REV, context: 6, history: 30, storyEach: 4000, storyTotal: 20000, loreMax: 30000, posts: 2, lore: true, loreSkipBooks: [], loreSkipEntries: [], cleanTags: [], bring: DEFAULT_BRING, injection: DEFAULT_INJECTION, entries: DEFAULT_CHAT_ENTRIES.map(e => ({...e, enabled: true}))};

// How voice messages read in the phone: only the voice bar until the user asks for 转文字 (or `auto`),
// then the translation, the original line, or both.
export const VOICE_TEXT_MODES = Object.freeze(['translation', 'original', 'both']);
const DEFAULT_VOICE_TEXT = {mode: 'translation', auto: false};
export function normalizeVoiceText(v = {}) {
  return {mode: VOICE_TEXT_MODES.includes(v?.mode) ? v.mode : DEFAULT_VOICE_TEXT.mode, auto: v?.auto === true};
}

export function defaultChat() {
  return {presets: [{...structuredClone(DEFAULT_PRESET), memory: normalizeMemory()}], activePreset: 'default', contacts: [], voiceText: {...DEFAULT_VOICE_TEXT}, profile: normalizeProfile(), starred: [], avatars: {}, partition: 'none', pace: true, wallet: defaultWallet(), stickers: [], proactive: normalizeProactive(), remarks: {}, netNames: {}};
}

const text = (value, max) => String(value ?? '').slice(0, max);
const count = (value, min, max, fallback) => { const n = Math.round(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

/** Tag names whose blocks are taken out of 世界书 text and of phone replies (status bars and the like). */
export const tagList = value => [...new Set((Array.isArray(value) ? value : String(value ?? '').split(/[\s,，、;；]+/))
  .map(t => String(t).trim().replace(/^<\/?|\/?>$/g, '')).filter(t => /^[\w\u4e00-\u9fff:.-]{1,40}$/.test(t)))].slice(0, 30);
const lineList = (value, max = 100) => [...new Set((Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/)).map(t => String(t).trim().slice(0, 200)).filter(Boolean))].slice(0, max);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Takes out <tag …>…</tag> blocks (and <tag/>) of the given names, then collapses the blank lines left behind. */
export function cleanTagged(text, tags) {
  let out = String(text ?? '');
  for (const tag of tagList(tags)) {
    const t = escapeRe(tag);
    out = out.replace(new RegExp(`<${t}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${t}\\s*>`, 'gi'), '').replace(new RegExp(`<${t}(?:\\s[^>]*)?\\/>`, 'gi'), '');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function normalizeChatPreset(p = {}) {
  let entries = Array.isArray(p.entries) ? p.entries : [];
  if (!(Number(p.rev) >= 2) && entries.length && !entries.some(e => e.id === 'features')) {
    const at = entries.findIndex(e => e.id === 'voice');
    const added = {...DEFAULT_CHAT_ENTRIES.find(e => e.id === 'features'), enabled: true};
    entries = at < 0 ? [...entries, added] : [...entries.slice(0, at), added, ...entries.slice(at)];
  }
  if (!(Number(p.rev) >= 3) && entries.length) {
    const missing = DEFAULT_CHAT_ENTRIES.filter(e => ['post', 'm-style', 'm-persona', 'm-interact', 'm-picture'].includes(e.id) && !entries.some(x => x.id === e.id));
    entries = [...entries, ...missing.map(e => ({...e, enabled: true}))];
  }
  if (!(Number(p.rev) >= 4) && entries.length) {
    const missing = DEFAULT_CHAT_ENTRIES.filter(e => ['c-dial', 'c-style'].includes(e.id) && !entries.some(x => x.id === e.id));
    entries = [...entries, ...missing.map(e => ({...e, enabled: true}))];
  }
  if (!(Number(p.rev) >= 6) && entries.length) {
    const missing = DEFAULT_CHAT_ENTRIES.filter(e => ['f-style', 'p-style'].includes(e.id) && !entries.some(x => x.id === e.id));
    entries = [...entries, ...missing.map(e => ({...e, enabled: true}))];
  }
  if (!(Number(p.rev) >= 7) && entries.length && !entries.some(e => e.id === 's-text')) entries = [...entries, {...DEFAULT_CHAT_ENTRIES.find(e => e.id === 's-text'), enabled: true}];
  if (!(Number(p.rev) >= 5) && entries.length) {
    entries = entries.map(e => OLD_RULES[e?.id] && e.text === OLD_RULES[e.id] ? {...e, text: DEFAULT_CHAT_ENTRIES.find(x => x.id === e.id).text} : e);
  }
  return {
    id: String(p.id || crypto.randomUUID()), name: text(p.name, 60) || '聊天预设', rev: PRESET_REV,
    context: count(p.context, 0, CHAT_LIMITS.story, DEFAULT_PRESET.context),
    history: count(p.history, 2, CHAT_LIMITS.history, DEFAULT_PRESET.history),
    // How much story and 世界书 a phone request takes, in characters; 0: no limit.
    storyEach: count(p.storyEach, 0, CHAT_LIMITS.chars, DEFAULT_PRESET.storyEach),
    storyTotal: count(p.storyTotal, 0, CHAT_LIMITS.chars, DEFAULT_PRESET.storyTotal),
    loreMax: count(p.loreMax, 0, CHAT_LIMITS.chars, DEFAULT_PRESET.loreMax),
    posts: count(p.posts, 1, 5, DEFAULT_PRESET.posts),
    // 世界书: entries the tavern would turn on are added to chat, call and 朋友圈 requests (host-lore.js).
    lore: p.lore !== false,
    // Books and entries ("book#uid") left out of the phone's 世界书, and tags whose blocks are cleaned away.
    loreSkipBooks: lineList(p.loreSkipBooks),
    loreSkipEntries: lineList(p.loreSkipEntries, 1000),
    cleanTags: tagList(p.cleanTags),
    bring: text(p.bring ?? DEFAULT_BRING, 4000),
    injection: {...DEFAULT_INJECTION, ...p.injection, depth: count(p.injection?.depth, 0, 10000, DEFAULT_INJECTION.depth)},
    // 记忆: older chat written up in layers and searched (core/memory.js).
    memory: normalizeMemory(p.memory),
    entries: entries.map(e => ({id: String(e.id || crypto.randomUUID()), title: text(e.title, 80), enabled: e.enabled !== false, text: text(e.text, 20000), use: ruleUse(e)}))
  };
}

/** Where a rule is used; a rule saved before rules had places is used where the shipped rule of that id is, else in both chats. */
function ruleUse(e) {
  if (Array.isArray(e.use)) return RULE_USES.filter(u => e.use.includes(u));
  return [...(DEFAULT_CHAT_ENTRIES.find(d => d.id === e.id)?.use || ['dm', 'group'])];
}

// The user in the chat app (QQ style): shown name (empty: the tavern's persona name), status, signature, and looks.
export const PROFILE_STATUS = Object.freeze({online: '在线', qme: 'Q我吧', busy: '忙碌', away: '离开', hidden: '隐身'});
export const BUBBLES = Object.freeze({default: '默认', candy: '糖果', mint: '薄荷', night: '星空', ink: '描边'});
export const FRAMES = Object.freeze({none: '无', star: '星星', cat: '猫耳', flower: '花环', halo: '光环'});
export const BACKGROUNDS = Object.freeze({none: '无', clouds: '云朵', stars: '星空', grid: '格子', sakura: '樱花'});
export function normalizeProfile(p = {}) {
  const pick = (value, list, fallback) => Object.hasOwn(list, value) ? value : fallback;
  return {name: text(p.name, 40).trim(), status: pick(p.status, PROFILE_STATUS, 'online'), statusText: text(p.statusText, 20).trim(), signature: text(p.signature, 80).trim(),
    // Bought looks (PREMIUM) are kept like the free ones; the backend checks they were bought before they are put on.
    bubble: pick(p.bubble, {...BUBBLES, ...PREMIUM.bubble}, 'default'), frame: pick(p.frame, {...FRAMES, ...PREMIUM.frame}, 'none'), background: pick(p.background, {...BACKGROUNDS, ...PREMIUM.background}, 'none'), backgroundPhoto: text(p.backgroundPhoto, 512)};
}

/**
 * Avatar choices by name ('me' is the user): a photo from the album, or plain text (the first letter). A name that is
 * not listed shows the tavern's own avatar when there is one (character card, persona), else the first letter.
 */
/**
 * Other names by person: 备注 (remarks: what the user calls a contact in the chat app — only the user sees it) and
 * 网名 (netNames: the names on the forum; 'me' is the user's). {name: other name}.
 */
export function normalizeNames(value, max = 30) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const [name, other] of Object.entries(value).slice(0, CHAT_LIMITS.contacts * 2)) {
    const key = text(name, 40).trim(), v = text(other, max).trim();
    if (key && v && v !== key) out[key] = v;
  }
  return out;
}
export function normalizeAvatars(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  // Names ('me' for the user) and groups ('g:' + the chat's id).
  for (const [name, a] of Object.entries(value).slice(0, CHAT_LIMITS.contacts * 2)) {
    const key = text(name, 40).trim();
    if (!key || !a || typeof a !== 'object') continue;
    if (a.kind === 'photo' && a.photoId) out[key] = {kind: 'photo', photoId: text(a.photoId, 512)};
    else if (a.kind === 'text') out[key] = {kind: 'text'};
  }
  return out;
}

export function normalizeContact(c = {}) {
  return {id: String(c.id || crypto.randomUUID()), name: text(c.name, 40).trim(), persona: text(c.persona, CHAT_LIMITS.persona), ...(c.space ? {space: text(c.space, 300)} : {})};
}

// ---------- 表情包 ----------
// Stickers are pictures on the web, kept by name and address: {name, url}. Names are what the model writes.
export const STICKER_LIMIT = 300;
const stickerUrl = value => { const url = String(value ?? '').trim(); return /^https?:\/\/\S+$/i.test(url) && url.length <= 2000 ? url : ''; };
export const stickerName = value => String(value ?? '').replace(/[\s,，、;；|｜:：<>"'`\[\]【】]+/g, '').slice(0, 20);
export function normalizeStickers(list) {
  const out = new Map();
  for (const s of Array.isArray(list) ? list : []) {
    const name = stickerName(s?.name), url = stickerUrl(s?.url);
    if (name && url) { out.delete(name); out.set(name, {name, url}); }
  }
  return [...out.values()].slice(-STICKER_LIMIT);
}
/**
 * Stickers pasted as text: 「名字URL, 名字URL」, one per line or separated by commas, with or without a colon or space
 * between the name and the address. A name again replaces the old one.
 */
export function parseStickers(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/([^\s,，、;；\n]*?)\s*[:：|｜=]?\s*(https?:\/\/[^\s,，、;；"'<>]+)/gi)) {
    const name = stickerName(m[1]);
    if (name) out.push({name, url: m[2]});
  }
  return normalizeStickers(out);
}
/** The sticker a line names: the same name, else one that contains the other (two characters at least). */
export function findSticker(stickers, name) {
  const want = stickerName(name);
  if (!want) return null;
  return stickers.find(s => s.name === want) || stickers.find(s => Math.min(s.name.length, want.length) >= 2 && (s.name.includes(want) || want.includes(s.name))) || null;
}

export function normalizeChat(value) {
  const base = defaultChat();
  if (!value || typeof value !== 'object') return base;
  const presets = (Array.isArray(value.presets) && value.presets.length ? value.presets : base.presets).map(normalizeChatPreset);
  const contacts = (Array.isArray(value.contacts) ? value.contacts : []).slice(0, CHAT_LIMITS.contacts).map(normalizeContact).filter(c => c.name);
  const starred = [...new Set((Array.isArray(value.starred) ? value.starred : []).map(n => text(n, 40).trim()).filter(Boolean))].slice(0, CHAT_LIMITS.contacts);
  return {presets, activePreset: presets.some(p => p.id === value.activePreset) ? value.activePreset : presets[0].id, contacts, voiceText: normalizeVoiceText(value.voiceText), profile: normalizeProfile(value.profile), wallet: normalizeWallet(value.wallet), starred, avatars: normalizeAvatars(value.avatars), partition: value.partition === 'card' ? 'card' : 'none', pace: value.pace !== false, stickers: normalizeStickers(value.stickers), proactive: normalizeProactive(value.proactive), remarks: normalizeNames(value.remarks, 20), netNames: normalizeNames(value.netNames, 30)};
}

// ---------- 主动发消息: characters text the user on their own ----------
/**
 * on: the story may have characters text the user (<phone> in a story reply, no request of its own); every: besides,
 * every this many story replies someone may text first (0: never; one phone request each), at most dailyMax a day.
 */
// dailyMax 0: no limit a day.
export function normalizeProactive(value = {}) {
  return {on: value?.on === true, every: count(value?.every, 0, 100, 0), dailyMax: count(value?.dailyMax, 0, 99, 3)};
}
export const PHONE_TAG = /<phone\b([^>]*)>([\s\S]*?)<\/phone\s*>/gi;
/**
 * What a story reply sent to the phone: [{group, text}] for each <phone>…</phone> (group: the group chat's name of
 * <phone group="群名">, '' for private messages).
 */
export const phoneParts = text => [...String(text ?? '').matchAll(PHONE_TAG)].map(m => ({group: (m[1].match(/group\s*=\s*["'“”「『]?([^"'“”」』>]+)/)?.[1] || '').trim(), text: m[2].trim()})).filter(p => p.text);
/** The inside of each <phone>…</phone>. */
export const phoneBlocks = text => phoneParts(text).map(p => p.text);
/**
 * How things that happen on the user's phone are written: messages, photos (in words; with drawing tags when pictures
 * can be drawn), 位置, money, presents, songs, a call (the phone rings), 朋友圈, group messages.
 * after: for the request made after the reply (回复后单独), which reads the finished story; else for the story itself.
 */
export function phoneFormat({user = '我', names = [], groups = [], images = false, after = false} = {}) {
  const list = names.join('、');
  return [after ? '【手机上的事】' : '【发到手机上的事】',
    after ? `读这段正文：里面写到有人用手机联系${user}（发消息、发照片、转账、发红包、送礼物、分享歌曲、打电话），或者有人发了朋友圈，就把这些事在${user}的手机上真的发出来，内容和正文写的对得上；剧情里有人这时自然会给${user}发消息的，也可以发。`
      : `剧情里有人这时会用手机联系${user}（发消息、发照片、转账、打电话……），或者正文里写到了这样的事，就在正文写完的地方另起一行写 <phone></phone>（预设要求写在正文后面的状态栏、选项这些照常写在它后面，不要省略），把这些事在${user}的手机上真的发出来，内容和正文写的对得上。`,
    `${after ? '' : '<phone></phone> 里'}一件事一行：`,
    '- 消息：「名字：消息」，可以连着发几条',
    `- 照片：「名字：[图片] 一句话描述照片里拍到的画面${images ? '｜画这张照片用的英文 danbooru tag（只写照片里真有的：拍的是猫就写 cat，画面里没有人就写 no humans、不写 1girl 1boy；只有拍到自己时才写 1girl 或 1boy 和 selfie；再写构图、光线）' : ''}」`,
    '- 位置：「名字：[位置] 地点」',
    '- 红包、转账：「名字：[红包 ¥金额] 祝福语」「名字：[转账 ¥金额] 备注」',
    '- 礼物：「名字：[礼物 物品名] 附言」',
    '- 分享歌曲：「名字：[分享歌曲] 歌名 - 歌手｜想说的话」',
    `- 打电话：「名字：[打电话] 为什么打」（${user}的手机会响，每次最多一个）`,
    `- 发朋友圈：「名字：[朋友圈] 动态内容」（发给所有朋友看的，不是发给${user}的）`,
    groups.length ? (after ? `群里的消息另起一段，第一行写「群：群名」，下面一样一行一件事；群名只能是：${groups.join('、')}。` : `群里的消息另写一段 <phone group="群名"></phone>；群名只能是：${groups.join('、')}。`) : '',
    `名字只能是：${list}。不要替${user}发，不写语音标签。这些只出现在${user}的手机上，不写进正文的叙述里。${after ? '正文里没有这样的事、也没人要发消息，就只写「无」。' : '没有这样的事就不写。'}`].filter(Boolean).join('\n');
}
const storyRules = (preset, user, list) => (preset?.entries || []).filter(e => e.enabled && e.text?.trim() && (e.use || []).includes('story')).map(e => fill(e.text, {'用户': user, '联系人': list, '对象': list}));
/**
 * The rule for the story request: the chat preset's 正文 rules ({{用户}}, {{联系人}}), and how to write what happens
 * on the phone. '' when there is no rule or no one to send them.
 */
export function storyTextRule(preset, {user = '我', names = [], groups = [], images = false} = {}) {
  const used = storyRules(preset, user, names.join('、'));
  if (!used.length || !names.length) return '';
  return [...used, phoneFormat({user, names, groups, images})].join('\n\n');
}
/** The same for the request made after the reply (回复后单独配音/配图): it reads the story and writes the phone part. */
export function phoneAfterRule(preset, {user = '我', names = [], groups = [], images = false} = {}) {
  const used = storyRules(preset, user, names.join('、'));
  if (!used.length || !names.length) return '';
  return [...used, phoneFormat({user, names, groups, images, after: true})].join('\n\n');
}
/** A request made after the reply (its system and user messages) with the phone part asked for at the end. */
export function withPhone(prompt, rule) {
  if (!rule) return prompt;
  const [system, user, ...rest] = prompt;
  return [{...system, content: `${system.content}\n\n${rule}\n\n【这次还要做一件事】上面要输出的都写完以后，最后另起一行写「【手机】」，下面按【手机上的事】的格式写；没有就在「【手机】」下面只写「无」。`},
    {...user, content: `${user.content}\n（最后别忘了「【手机】」那一段。）`}, ...rest];
}
/** An answer split: what comes before 「【手机】」, and the phone part as <phone> blocks ('' when there is none). */
export function phoneSection(reply) {
  const text = String(reply ?? ''), at = text.search(/^[ \t]*[【\[]手机[】\]][ \t]*/m);
  if (at < 0) return {rest: text, phone: ''};
  const tail = text.slice(at).replace(/^[ \t]*[【\[]手机[】\]][ \t]*/, ''), end = tail.search(/^[ \t]*【(?!手机)[^】\n]{1,10}】[ \t]*$/m);
  const body = (end < 0 ? tail : tail.slice(0, end)).trim(), rest = text.slice(0, at) + (end < 0 ? '' : tail.slice(end));
  if (!body || /^无[。.]?$/.test(body)) return {rest, phone: ''};
  // 「群：群名」 starts a group's part.
  const blocks = [], add = (group, lines) => { const t = lines.join('\n').trim(); if (t) blocks.push(group ? `<phone group="${group.replace(/["<>]/g, '')}">\n${t}\n</phone>` : `<phone>\n${t}\n</phone>`); };
  let group = '', lines = [];
  for (const line of body.split(/\r?\n/)) {
    const g = line.match(/^\s*(?:群聊?|群名)\s*[:：]\s*(.+?)\s*$/);
    if (g) { add(group, lines); group = g[1]; lines = []; continue; }
    if (/^\s*无[。.]?\s*$/.test(line)) continue;
    lines.push(line);
  }
  add(group, lines);
  return {rest, phone: blocks.join('\n')};
}

export function validateChatPreset(p) {
  if (!p?.name?.trim()) throw Error('请填写聊天预设名称');
  const i = p.injection;
  if (!['in_chat', 'in_prompt', 'before_prompt'].includes(i?.position) || !['system', 'user', 'assistant'].includes(i?.role)) throw Error('插入位置或身份无效');
  if (!p.entries.some(e => e.enabled && e.text.trim() && (e.use.includes('dm') || e.use.includes('group')))) throw Error('至少启用一条用在私聊或群聊的规则');
  if (!p.bring.includes('{{聊天记录}}')) throw Error('带进剧情的模板需要包含 {{聊天记录}}');
  return p;
}

export function validateContact(c, routes = []) {
  if (!c.name || isPlaceholderRole(c.name)) throw Error('请填写联系人名字');
  if (routes.some(r => r.name === c.name)) throw Error('角色 App 里已经有这个名字，直接从角色里选就好');
  return c;
}

export const activeChatPreset = chat => chat.presets.find(p => p.id === chat.activePreset) || chat.presets[0];

/** Everyone the user can message: story roles (角色 App) first, then manual contacts. */
/**
 * 分区: with partition 'card' the phone keeps one set of chats, 朋友圈, 论坛 and 查手机 per tavern character card (or
 * group). space: {key, name, members} of the card open now. Items carry the key they were made under; items from before
 * (no key) are shared by every card.
 */
export const inSpace = (item, space) => !space?.key || !item?.space || item.space === space.key;
/** The space to filter by: the open card's, when partition is on and a card is open; else null (everything). */
export const activeSpace = (settings, space) => settings.chat?.partition === 'card' && space?.key ? space : null;
export function chatContacts(settings, space = null) {
  // A card's contacts: its own character(s), the roles that have spoken (or been named) in its story, roles added to
  // it, and contacts added under it. A role no story has met yet is in none until one does: it used to be in every
  // card, so that roles made before cards were kept (most of them) made every card's phone look the same. A role
  // made while a card is open belongs to that card; any role can be added from 联系人 →「＋」.
  const here = r => !space?.key || (space.members || []).includes(r.name) || (Array.isArray(r.cards) && r.cards.includes(space.key));
  const roles = settings.routes.filter(r => !isPlaceholderRole(r.name) && here(r)).map(r => ({name: r.name, source: 'role', voice: !!r.voice, engine: r.voice ? r.engine : 'none', language: r.language || settings.general.defaultLanguage,
    // 角色资料: written in the 角色 App, else a contact of the same name's (a contact given a voice keeps who they are).
    persona: String(r.persona || settings.chat.contacts.find(c => c.name === r.name)?.persona || '').slice(0, CHAT_LIMITS.persona)}));
  const manual = settings.chat.contacts.filter(c => !roles.some(r => r.name === c.name) && inSpace(c, space)).map(c => ({name: c.name, source: 'manual', id: c.id, voice: false, engine: 'none', language: '', persona: c.persona}));
  return [...roles, ...manual];
}

const nameOf = (who, me) => who === 'me' ? me : who;
export const DEFAULT_BLESSING = '恭喜发财，大吉大利';
const TRANSFER_STATE = {sent: '待收款', accepted: '已收款', returned: '已退还'};
/** 「X 领取了 Y 的红包」-style lines; `me` is how the user is called (你 on screen, the user's name in prompts). */
export const noticeText = (m, me) => nameOf(m.from, me) + String(m.text).replaceAll('{对方}', nameOf(m.target, me));
export const patText = (m, me) => `${nameOf(m.from, me)}拍了拍${nameOf(m.target, me)}`;

/** How a chat message reads in a transcript. */
export function messageLine(m, user) {
  const who = nameOf(m.from, user), quote = m.quote ? `「回复 ${nameOf(m.quote.from, user)}：${m.quote.text}」` : '';
  switch (m.kind) {
    case 'system': return '';
    case 'voice': return `${who}：${quote}[语音] ${m.translation || m.text}`;
    case 'photo': return `${who}：[图片]${m.text ? ' ' + m.text : ''}`;
    case 'sticker': return `${who}：[表情包] ${m.text}`;
    case 'redpacket': return `${who}：[红包 ¥${m.amount}] ${m.text || DEFAULT_BLESSING}（${m.state === 'opened' ? nameOf(m.openedBy, user) + '已领取' : '还没领取'}）`;
    case 'transfer': return `${who}：[转账 ¥${m.amount}]${m.text ? ' ' + m.text : ''}（${TRANSFER_STATE[m.state] || '待收款'}）`;
    case 'gift': return `${who}：[礼物 ${m.gift?.name || ''}${m.gift?.price ? ' ¥' + yuan(m.gift.price) : ''}]${m.text ? ' ' + m.text : ''}（${m.state === 'accepted' ? '已收下' : m.state === 'returned' ? '被退还了' : '还没收下'}）`;
    case 'location': return `${who}：[位置] ${m.text}${m.detail ? '（' + m.detail + '）' : ''}`;
    case 'song': return `${who}：${quote}[分享歌曲] ${m.song?.title || ''}${m.song?.artist ? ' - ' + m.song.artist : ''}${m.text ? ' ' + m.text : ''}`;
    case 'pat': return `（${patText(m, user)}）`;
    case 'dice': return `${who}：[骰子] ${m.text} 点`;
    case 'notice': return `（${noticeText(m, user)}）`;
    case 'recall': return `（${who}撤回了一条消息）`;
    case 'call': return `（${who}${m.dir === 'out' ? '打了语音电话过去' : '打来语音电话'}：${callSummary(m)}）${m.lines?.length ? '通话里说了：' + m.lines.slice(-6).map(l => `${nameOf(l.from, user)}：${l.translation || l.text}`).join(' / ') : ''}${m.voicemail?.length ? '语音留言：' + m.voicemail.map(l => l.translation || l.text).join(' ') : ''}`;
    default: return `${who}：${quote}${m.text}`;
  }
}

const fill = (template, values) => Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), template);

/**
 * Chat-style request for one reply turn.
 * members: [{name, persona, card, voice, language}] (card: the tavern character card text, when there is one)
 * story: [{name, text}] recent story messages, oldest first.
 */
/**
 * What the people on the phone know of the story: what they were there for, were told, or said on the phone — not
 * the rest the reader saw. names: who speaks (a chat's members, the one on the call). group: a group chat.
 */
export function knowsRule(names, user, {prompts = {}, group = false} = {}) {
  const who = names.length === 1 ? names[0] : '每个人';
  return [`【${names.length === 1 ? names[0] : '各人'}知道什么】`,
    promptRule(prompts, "chat.knowsRule.001", {"对象": (who), "用户": (user), "动态内容3": (names.length === 1 ? ' TA ' : '自己'), "用户_4": (user)}),
    promptRule(prompts, "chat.knowsRule.002", {"动态内容1": (names.length === 1 ? names[0] : '一个人'), "用户": (user), "动态内容3": (names.length === 1 ? names[0] : '这个人'), "用户_4": (user)}),
    promptRule(prompts, "chat.knowsRule.003", {"用户": (user)}),
    promptRule(prompts, "chat.knowsRule.004", {"动态内容1": (names.length === 1 ? names[0] : '一个人')}),
    group ? promptRule(prompts, "chat.knowsRule.005") : ''].filter(Boolean).join('\n');
}
export function buildChatRequest({prompts = {}, preset, thread, members, story = [], user = '我', userPersona = '', voiceFormat, lore = '', memory = '', earlier = '', images = false, stickers = [], asking = '', music = null, forum = '', nudge = false}) {
  const group = thread.type === 'group';
  const partner = group ? thread.name : members[0]?.name || thread.name;
  const speakers = members.filter(m => m.voice);
  const values = {
    '用户': user, '对象': partner,
    '语音格式': voiceFormat,
    '可发语音': speakers.length ? speakers.map(m => `${m.name}（${languageName(m.language || 'zh')}）`).join('、') : promptRule(prompts, "chat.buildChatRequest.001")
  };
  const used = preset.entries.filter(e => e.enabled && e.text.trim() && e.use.includes(group ? 'group' : 'dm')).filter(e => speakers.length || e.id !== 'voice');
  const rules = used.map(e => fill(e.text, values)), posting = used.some(e => e.id === 'post' || /朋友圈/.test(e.text)), dialing = !group && used.some(e => e.id === 'c-dial');
  const people = members.map(m => `- ${m.name}：${(m.persona || m.card || '').trim() || '（没有资料，按剧情里的表现来）'}`).join('\n');
  const names = members.map(m => m.name).join('、');
  const system = [
    rules.join('\n\n'),
    `【聊天对象】\n${people}`,
    lore.trim() ? promptRule(prompts, "chat.buildChatRequest.002", {"动态内容1": (lore.trim())}) : '',
    userPersona.trim() ? promptRule(prompts, "chat.buildChatRequest.003", {"用户": (user), "用户_2": (user), "动态内容3": (userPersona.trim())}) : '',
    earlier.trim() ? promptRule(prompts, "chat.buildChatRequest.004", {"动态内容1": (group ? '群里每个人' : partner), "动态内容2": (earlier.trim())}) : '',
    story.length ? promptRule(prompts, "chat.buildChatRequest.005", {"动态内容1": (group ? '群里每个人' : partner), "动态内容2": (story.map(s => `${s.name}：${s.text}`).join('\n'))}) : '',
    forum.trim() ? promptRule(prompts, 'chat.publicForum', {'论坛内容': forum.trim()}) : '',
    memory.trim(),
    story.length || earlier.trim() ? knowsRule(group ? members.map(m => m.name) : [partner], user, {group, prompts}) : '',
    ['【输出格式】',
      promptRule(prompts, "chat.buildChatRequest.006", {"角色名单": (names)}),
      promptRule(prompts, "chat.buildChatRequest.007", {"用户": (user)}),
      speakers.length ? promptRule(prompts, "chat.buildChatRequest.008", {"语音格式": (voiceFormat), "动态内容2": (speakers.map(m => `${m.name}：${languageName(m.language || 'zh')}`).join('，'))}) : '',
      promptRule(prompts, "chat.buildChatRequest.009", {"动态内容1": (images ? promptRule(prompts, "chat.buildChatRequest.010") : ''), "用户": (user), "用户_3": (user), "用户_4": (user)}),
      promptRule(prompts, "chat.buildChatRequest.011", {"用户": (user), "用户_2": (user)}),
      stickers.length ? promptRule(prompts, "chat.buildChatRequest.012", {"动态内容1": (stickers.slice(-80).map(s => s.name ?? s).join('、'))}) : '',
      dialing ? promptRule(prompts, "chat.buildChatRequest.013", {"用户": (user)}) : '',
      posting ? promptRule(prompts, "chat.buildChatRequest.014", {"用户": (user)}) : '',
      music?.share ? promptRule(prompts, "chat.buildChatRequest.015", {"用户": (user)}) : '',
      !group && !asking ? promptRule(prompts, "chat.buildChatRequest.016", {"用户": (user), "用户_2": (user), "用户_3": (user), "用户_4": (user), "聊天对象": (partner), "用户_6": (user)}) : ''].filter(Boolean).join('\n'),
    music?.listening ? listeningNote(music.listening, user, prompts) : '',
    asking ? ['【好友申请】', promptRule(prompts, "chat.buildChatRequest.017", {"聊天对象": (partner), "用户": (user), "用户_3": (user), "验证消息": (asking)}), promptRule(prompts, "chat.buildChatRequest.018", {"聊天对象": (partner), "聊天对象_2": (partner), "聊天对象_3": (partner)})].join('\n') : ''
  ].filter(Boolean).join('\n\n');
  const history = thread.messages.filter(m => m.kind !== 'system').slice(-preset.history);
  const last = history.at(-1);
  // 主动找你: whether to text at all is the model's to judge, by the preset's 「正文里主动发消息」 rule; [不发] is no.
  const when = nudge ? preset.entries.find(e => e.id === 's-text' && e.enabled && e.text.trim()) : null;
  const turn = nudge ? [promptRule(prompts, "chat.buildChatRequest.019", {"聊天对象": (partner), "用户": (user)}), when ? `什么时候会发：${fill(when.text, values)}` : promptRule(prompts, "chat.buildChatRequest.020"), promptRule(prompts, "chat.buildChatRequest.021")].join('\n')
    : asking ? promptRule(prompts, "chat.buildChatRequest.022", {"用户": (user), "聊天对象": (partner)}) : !history.length ? `（聊天刚开始：${group ? '群里有人' : partner}主动给${user}发消息。）`
    : last.from === 'me' ? `（现在轮到${group ? '群里的成员' : partner}回复${user}。）`
    : `（${group ? '群里' : partner}可以继续说，或者换个话题。）`;
  const transcript = history.length ? `【${group ? thread.name + '（群聊）' : '和' + partner}的聊天记录】\n${history.map(m => messageLine(m, user)).filter(Boolean).join('\n')}\n\n` : '';
  return [{role: 'system', content: system}, {role: 'user', content: transcript + turn}];
}

const NAME_LINE = /^\s*(?:\*\*)?[[【]?([^\]】:：\n]{1,40}?)[\]】]?(?:\*\*)?\s*[:：]\s*(.*)$/;
const unquote = s => s.trim().replace(/^[「“"『](.*)[」”"』]$/s, '$1').trim();
const SPECIAL = /^\s*[[【]\s*(表情包|表情|收下礼物|退还礼物|礼物|送礼|图片|照片|位置|定位|红包|转账|拍一拍|领取红包|领取|收下|收款|退还|退回|朋友圈|发朋友圈|动态|打电话|语音通话|来电|分享歌曲|分享音乐|分享歌|歌曲|音乐|删除好友|删好友|拉黑|通过好友申请|通过好友|同意好友|接受好友|拒绝好友申请|拒绝好友)\s*([^\]】]*)[\]】]\s*(.*)$/;
const LUCKY = ['6.66', '8.88', '5.20', '13.14', '16.80', '1.88'];
/**
 * A phone-feature line (「[红包 ¥8.88] 祝福」 and the like) as a message; {kind:'claim', action} for taking or returning
 * the user's red packet or transfer. null when the line is ordinary text.
 */
function special(from, content, {names, user, stickers = []}) {
  const m = content.match(SPECIAL);
  if (!m) return null;
  const [, what, arg, rest] = m, text = unquote(rest || '').replace(/<[^>]+>/g, '');
  switch (what) {
    // A 朋友圈 post made while chatting: it goes to 朋友圈, not into the chat.
    case '朋友圈': case '发朋友圈': case '动态': { const said = (text || arg.trim()).slice(0, 2000); return said ? {from, kind: 'moment', text: said} : null; }
    // A voice call placed from the chat: the phone rings after this reply.
    case '打电话': case '语音通话': case '来电': return {from, kind: 'call', reason: (text || arg.trim()).slice(0, 200)};
    // A song shared (「[分享歌曲] 歌名 - 歌手｜想说的话」): a card the user can play.
    case '分享歌曲': case '分享音乐': case '分享歌': case '歌曲': case '音乐': { const [what, ...note] = (arg.trim() ? arg.trim() + (text ? '｜' + text : '') : text).split(/[|｜]/); const song = songOf(what); return song.title ? {from, kind: 'song', song, text: note.join(' ').trim().slice(0, 200)} : null; }
    // 删好友: the contact deletes the user; answering the user's 好友申请.
    case '删除好友': case '删好友': case '拉黑': return {from, kind: 'unfriend'};
    case '通过好友': case '通过好友申请': case '同意好友': case '接受好友': return {from, kind: 'befriend'};
    case '拒绝好友': case '拒绝好友申请': return {from, kind: 'refuse', text: (text || arg.trim()).slice(0, 200)};
    case '图片': case '照片': {
      // 「描述｜英文 tag」: the tags draw it when a drawing engine is set up (Chinese words in them are left out).
      const [said, ...tags] = (text || arg.trim()).split(/[|｜]/);
      const imageTags = tags.join(',').replace(/[一-鿿]+/g, ' ').split(/[,，]/).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ').slice(0, 600);
      return said.trim() ? {from, kind: 'photo', text: said.trim().slice(0, 500), ...(imageTags ? {imageTags} : {})} : null;
    }
    // A sticker of the user's collection; a name it does not have stays words.
    case '表情包': case '表情': { const said = arg.trim() || text, s = findSticker(stickers, said); return s ? {from, kind: 'sticker', text: s.name, url: s.url} : said ? {from, kind: 'text', text: `[${said.slice(0, 20)}]`} : null; }
    case '位置': case '定位': { const place = arg.trim() || text; return place ? {from, kind: 'location', text: place.slice(0, 100)} : null; }
    case '红包': return {from, kind: 'redpacket', amount: money(arg) || LUCKY[[...from + text].length % LUCKY.length], text: text.slice(0, 40) || DEFAULT_BLESSING, state: 'sent'};
    case '转账': { const amount = money(arg); return amount ? {from, kind: 'transfer', amount, text: text.slice(0, 40), state: 'sent'} : null; }
    case '拍一拍': { const target = arg.trim(); return {from, kind: 'pat', target: target && target !== from && target !== user && names.includes(target) ? target : 'me'}; }
    // A present for the user (「[礼物 花束] 附言」); taking or returning the user's present.
    case '礼物': case '送礼': { const name = (arg.trim() || text).slice(0, 20).trim(); return name ? {from, kind: 'gift', gift: {name, emoji: guessEmoji(name), price: 0}, text: arg.trim() ? text.slice(0, 60) : '', state: 'sent'} : null; }
    case '收下礼物': return {from, kind: 'claim', action: 'accept', what: 'gift'};
    case '退还礼物': return {from, kind: 'claim', action: 'return', what: 'gift'};
    case '退还': case '退回': return {from, kind: 'claim', action: 'return'};
    default: return {from, kind: 'claim', action: 'accept', what: what === '领取红包' ? 'redpacket' : what === '收款' ? 'transfer' : ''};
  }
}

/**
 * Turns the model's reply into chat messages. Lines look like 「名字：内容」; a voice line holds a voice tag
 * in `voiceFormat`. Voice from someone without a voice becomes a text message with the translation.
 */
export function parseChatReply(reply, {members, user = '我', voiceFormat, voiceNames = [], stickers = []}) {
  const names = members.map(m => m.name), out = [];
  const body = String(reply || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```[a-z]*\n?|```/g, '');
  for (const raw of body.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const m = raw.match(NAME_LINE);
    let from = null, content = raw;
    if (m && names.includes(m[1].trim())) { from = m[1].trim(); content = m[2]; }
    else if (m && (m[1].trim() === user || m[1].trim() === '我')) continue;
    else if (names.length === 1) from = names[0];
    else if (out.length) from = out.at(-1).from;
    if (!from || !content.trim()) continue;
    const feature = special(from, content, {names, user, stickers});
    if (feature) { out.push(feature); if (out.length >= 12) break; continue; }
    const voice = voiceFormat ? parseDialogue(content, voiceFormat)[0] : null;
    if (voice) {
      if (voiceNames.includes(from)) out.push({from, kind: 'voice', text: voice.text.trim(), translation: voice.translation.trim(), emotion: voice.emotion});
      else out.push({from, kind: 'text', text: voice.translation.trim()});
      continue;
    }
    const plain = unquote(content.replace(/<[^>]+>/g, ''));
    if (plain) out.push({from, kind: 'text', text: plain.slice(0, 4000)});
    if (out.length >= 12) break;
  }
  return out;
}

/** The text injected into the next story reply when the user brings chat messages into the story. */
export function bringText(preset, {thread, messages, user = '我'}) {
  const partner = thread.type === 'group' ? thread.name : thread.members[0] || thread.name;
  const lines = messages.map(m => messageLine(m, user)).filter(Boolean).join('\n');
  return fill(preset.bring, {'用户': user, '对象': partner, '聊天记录': lines});
}

/** Removes voice/picture tags and markup from a story message, for the chat prompt. Code blocks, styles and scripts
 *  (the HTML 小剧场 some presets write) are not story: they are left out whole instead of becoming a wall of CSS. */
export function plainStory(textValue) {
  return String(textValue || '')
    .replace(/```[\s\S]*?(?:```|$)|<(style|script)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<!--[\s\S]*?(?:-->|$)/gi, ' ')
    .replace(/<tts\b[^>]*>[\s\S]*?<\/tts\s*>/gi, '')
    .replace(/<(sfx|ambience)\b[^>]*>[^<>]*<\/\1\s*>/gi, '')
    .replace(/<img\b[^>]*>[^<]*<\/img\s*>|<img\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
