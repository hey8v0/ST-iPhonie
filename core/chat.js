// Chat app logic without DOM or network: chat presets, manual contacts, the reply prompt, the reply parser,
// and the text that carries a phone chat into the next story reply ("带进剧情").
//
// A chat preset holds the rules the model follows when it answers in the phone, how many recent story messages
// and chat messages it sees, and the template used when a chat is brought into the story.
import {promptText, promptOn, promptTemplate, fillPrompt} from './prompt-rules.js';
import {songOf, listeningNote} from './music.js';
import {normalizeWallet, defaultWallet, PREMIUM, guessEmoji, yuan} from './wallet.js';
import {parseDialogue, isPlaceholderRole} from './protocol.js';
import {money, oneEmoji, CHAIN_MODES} from './chats.js';
import {callSummary} from './call.js';
import {languageName} from './languages.js';
import {normalizeMemory} from './memory.js';
import {OTHER_PICTURES, NARRATOR} from './narration.js';
import {normalizeBubbleSets, normalizeBubbleOf} from './bubble-css.js';
import {BOARDS, boardText, cellName} from './board.js';
import {ownerName} from './wardrobe.js';
import {normalizePets} from './pets.js';

/** Another plugin's picture prompt kept in a reply (柏宝绘's <bbi_image>): not story, left out whole. */
const OTHER_PICTURE_BLOCKS = new RegExp(`<(${OTHER_PICTURES.join('|')})\\b[^>]*>[\\s\\S]*?(?:<\\/\\1\\s*>|$)`, 'gi');

const PERIODS = [[5, '凌晨'], [8, '早上'], [11, '上午'], [13, '中午'], [17, '下午'], [19, '傍晚'], [24, '晚上']];
/** How long `ms` is, said the way people say it: 40 分钟, 3 个小时, 2 天, 3 个月. */
function span(ms) {
  const minutes = Math.round(ms / 60000), hours = Math.round(ms / 3600000), days = Math.round(ms / 86400000);
  return minutes < 60 ? `${minutes} 分钟` : hours < 24 ? `${hours} 个小时` : days < 60 ? `${days} 天` : `${Math.round(days / 30)} 个月`;
}
/**
 * 现实时间 (a block of 系统提示词, off unless turned on): the date and time on this device for the chat and call requests,
 * and how long it has been since `last` (the other side's last message) when that is half an hour or more. '' when off.
 */
export function clockText(prompts, {now = Date.now(), last = 0} = {}) {
  if (!promptOn(prompts, 'now')) return '';
  const d = new Date(now), h = d.getHours(), pad = n => String(n).padStart(2, '0'), gap = last > 0 ? now - last : 0;
  return promptText(prompts, 'now', 'text', {'日期': `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}`,
    '时刻': `${PERIODS.find(([end]) => h < end)[1]} ${pad(h)}:${pad(d.getMinutes())}`, '隔了多久': gap >= 30 * 60000 ? span(gap) : ''});
}
/** When the other side of a chat last said something (system lines and the user's own left out). */
export const lastTheirs = messages => [...(messages || [])].reverse().find(m => m.from !== 'me' && m.kind !== 'system' && m.at > 0)?.at || 0;

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
const DEFAULT_PRESET = {id: 'default', name: '日常短信', rev: PRESET_REV, storyMode: 'tavern', storyEntries: {}, context: 6, history: 30, storyEach: 4000, storyTotal: 20000, loreMax: 30000, posts: 2, lore: true, loreSkipBooks: [], loreSkipEntries: [], loreExtraBooks: [], cleanTags: [], bring: DEFAULT_BRING, injection: DEFAULT_INJECTION, entries: DEFAULT_CHAT_ENTRIES.map(e => ({...e, enabled: true}))};

// How voice messages read in the phone: only the voice bar until the user asks for 转文字 (or `auto`),
// then the translation, the original line, or both.
export const VOICE_TEXT_MODES = Object.freeze(['translation', 'original', 'both']);
const DEFAULT_VOICE_TEXT = {mode: 'translation', auto: false};
export function normalizeVoiceText(v = {}) {
  return {mode: VOICE_TEXT_MODES.includes(v?.mode) ? v.mode : DEFAULT_VOICE_TEXT.mode, auto: v?.auto === true};
}

export function defaultChat() {
  return {presets: [{...structuredClone(DEFAULT_PRESET), memory: normalizeMemory()}], activePreset: 'default', contacts: [], voiceText: {...DEFAULT_VOICE_TEXT}, profile: normalizeProfile(), starred: [], avatars: {}, partition: 'none', pace: true, wallet: defaultWallet(), stickers: [], proactive: normalizeProactive(), remarks: {}, netNames: {}, bubbleSets: [], bubbleOf: {}, roleStickers: {}, bgOf: {}, statusOf: {}, peeked: {}, autoReply: false, patOf: {}, pets: normalizePets()};
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
    storyMode: ['tavern', 'exact', 'recent', 'off'].includes(p.storyMode) ? p.storyMode : Number(p.context) === 0 ? 'off' : 'tavern',
    storyEntries: Object.fromEntries(Object.entries(p.storyEntries && typeof p.storyEntries === 'object' ? p.storyEntries : {}).filter(([name, entries]) => !['__proto__', 'constructor', 'prototype'].includes(name) && name.length <= 200 && entries && typeof entries === 'object' && !Array.isArray(entries)).slice(0, 100).map(([name, entries]) => [name,
      Object.fromEntries(Object.entries(entries).filter(([id, enabled]) => !['__proto__', 'constructor', 'prototype'].includes(id) && id.length <= 200 && typeof enabled === 'boolean').slice(0, 500))])),
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
    // Books the phone reads too though the tavern has them off (0.9.37): the story never sees them.
    loreExtraBooks: lineList(p.loreExtraBooks),
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
// 质感 bubbles and 氛围 backgrounds (ui/aura.css, ui/chat-scenes.js): material and soft colour, each with a day and a night
// look. The ones from before (drawn pictures) become the nearest new one (OLD_LOOKS).
export const BUBBLES = Object.freeze({default: '默认', paper: '纸张', jelly: '果冻', frost: '磨砂', glow: '夜光'});
export const FRAMES = Object.freeze({none: '无', star: '星星', cat: '猫耳', flower: '花环', halo: '光环'});
export const BACKGROUNDS = Object.freeze({none: '无', sky: '晴空', dusk: '黄昏', blush: '樱粉', mint: '薄荷', lavender: '薰衣草', deep: '深海', paper: '纸张'});
const OLD_LOOKS = {bubble: {candy: 'jelly', mint: 'jelly', night: 'glow', ink: 'paper'}, background: {clouds: 'sky', stars: 'lavender', grid: 'paper', sakura: 'blush', 'aura-sky': 'sky', 'aura-dusk': 'dusk', 'aura-blush': 'blush', 'aura-deep': 'deep', 'aura-night': 'lavender'}};
export function normalizeProfile(p = {}) {
  const pick = (value, list, fallback) => Object.hasOwn(list, value) ? value : fallback;
  return {name: text(p.name, 40).trim(), status: pick(p.status, PROFILE_STATUS, 'online'), statusText: text(p.statusText, 20).trim(), signature: text(p.signature, 80).trim(),
    // 拍一拍后缀 (0.9.36): what follows when someone pats the user (「拍了拍你的小脑袋」).
    patSuffix: text(p.patSuffix, 20).trim(),
    // Bought looks (PREMIUM) are kept like the free ones; the backend checks they were bought before they are put on.
    // 'custom:<id>': a set of 自定义气泡 (one that is gone shows the default).
    // 关键词彩蛋 (0.9.34): on unless turned off.
    eggs: p.eggs !== false,
    bubble: /^custom:bset-[a-z0-9]{4,40}$/.test(String(p.bubble || '')) ? p.bubble : pick(OLD_LOOKS.bubble[p.bubble] || p.bubble, {...BUBBLES, ...PREMIUM.bubble}, 'default'), frame: pick(p.frame, {...FRAMES, ...PREMIUM.frame}, 'none'), background: pick(OLD_LOOKS.background[p.background] || p.background, {...BACKGROUNDS, ...PREMIUM.background}, 'none'), backgroundPhoto: text(p.backgroundPhoto, 512)};
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
  return {id: String(c.id || crypto.randomUUID()), name: text(c.name, 40).trim(), persona: text(c.persona, CHAT_LIMITS.persona), ...(c.space ? {space: text(c.space, 300)} : {}), ...(c.save ? {save: text(c.save, 400)} : {})};
}

// ---------- 表情包 ----------
// Stickers are pictures on the web, kept by name and address: {name, url}. Names are what the model writes.
export const STICKER_LIMIT = 300;
const stickerUrl = value => { const url = String(value ?? '').trim(); return /^https?:\/\/\S+$/i.test(url) && url.length <= 2000 ? url : ''; };
export const stickerName = value => String(value ?? '').replace(/[\s,，、;；|｜:：<>"'`\[\]【】]+/g, '').slice(0, 20);
export function normalizeStickers(list) {
  const out = new Map();
  for (const s of Array.isArray(list) ? list : []) {
    const name = stickerName(s?.name), url = stickerUrl(s?.url), photoId = String(s?.photoId || '').slice(0, 512);
    if (name && (url || photoId)) { out.delete(name); out.set(name, photoId ? {name, photoId} : {name, url}); }
  }
  return [...out.values()].slice(-STICKER_LIMIT);
}
/**
 * Stickers pasted as text: 「名字URL, 名字URL」, one per line or separated by commas, with or without a colon or space
 * between the name and the address. A name again replaces the old one.
 */
export function parseStickers(text) {
  // Each address, then the word right before it. (Looked for the other way round, a long paste with few addresses took seconds.)
  const out = [], all = String(text ?? '');
  let from = 0;
  for (const m of all.matchAll(/https?:\/\/[^\s,，、;；"'<>]+/gi)) {
    let end = m.index;
    while (end > from && /\s/.test(all[end - 1])) end--;
    if (end > from && /[:：|｜=]/.test(all[end - 1])) end--;
    while (end > from && /\s/.test(all[end - 1])) end--;
    let start = end;
    while (start > from && !/[\s,，、;；]/.test(all[start - 1])) start--;
    const name = stickerName(all.slice(start, end));
    if (name) out.push({name, url: m[0]});
    from = m.index + m[0].length;
  }
  return normalizeStickers(out);
}
// Names are compared without quotes and brackets of any kind: a name kept as 配文“陷入沉思” is written back by models as
// 配文"陷入沉思" (stickerName drops only the plain ones), and then it showed as words (0.9.27).
const stickerKey = value => stickerName(value).replace(/[“”‘’「」『』﹁﹂﹃﹄＂＇〝〞〟‟„‚‛《》〈〉（）()]/g, '');
/** The sticker a line names: the same name, else one that contains the other (two characters at least). */
export function findSticker(stickers, name) {
  const want = stickerKey(name);
  if (!want) return null;
  const keyed = stickers.map(s => [s, stickerKey(s.name)]);
  return keyed.find(([, key]) => key === want)?.[0] || keyed.find(([, key]) => Math.min(key.length, want.length) >= 2 && (key.includes(want) || want.includes(key)))?.[0] || null;
}

/**
 * 每个人的聊天背景 (0.9.34): {person's own key: a background (a free one or one of the shop) | 'photo:<photo id>'}. A
 * private chat with them shows it instead of the user's own.
 */
export function normalizeBgOf(value) {
  const out = {}, keys = {...BACKGROUNDS, ...PREMIUM.background};
  for (const [who, bg] of Object.entries(value && typeof value === 'object' ? value : {}).slice(0, 400)) {
    const v = String(bg || '');
    if (who && (Object.hasOwn(keys, v) || /^photo:.{1,512}$/.test(v))) out[String(who).slice(0, 80)] = v;
  }
  return out;
}

// ---------- 角色专属表情包 (0.9.33) ----------
// A role's own stickers: pictures drawn for them (or picked from the album), kept by the role's own key (同名角色 of
// different cards apart) as {name, photoId}. Only that role sends them. The moods that can be drawn, with their tags.
export const STICKER_MOODS = Object.freeze([
  ['开心', 'happy, big smile, open mouth, sparkle'], ['委屈', 'pout, teary eyes, puppy eyes'], ['生气', 'angry, puffed cheeks, anger vein'],
  ['晚安', 'sleepy, closed eyes, pillow, zzz'], ['比心', 'heart hands, wink, smile'], ['疑惑', 'confused, head tilt, question mark'],
  ['哭哭', 'crying, streaming tears, wavy mouth'], ['得意', 'smug, smirk, hand on hip'], ['害羞', 'blush, embarrassed, covering face'],
  ['震惊', 'surprised, shocked, open mouth, wide-eyed'], ['摸摸头', 'headpat, happy, closed eyes'], ['加油', 'fist pump, determined, clenched hands']]);
export const ROLE_STICKER_LIMIT = 30;
export function normalizeRoleStickers(value) {
  const out = {};
  for (const [who, list] of Object.entries(value && typeof value === 'object' ? value : {}).slice(0, 200)) {
    const kept = new Map();
    for (const s of Array.isArray(list) ? list : []) { const name = stickerName(s?.name), photoId = String(s?.photoId || '').slice(0, 512); if (name && photoId) { kept.delete(name); kept.set(name, {name, photoId}); } }
    if (kept.size) out[String(who).slice(0, 80)] = [...kept.values()].slice(-ROLE_STICKER_LIMIT);
  }
  return out;
}
/** The stickers a request may name: the user's collection, then each one's own ({owner}) — only they send those. */
function stickerList(list) {
  const shared = list.filter(s => !s?.owner).slice(-80).map(s => s.name ?? s), own = new Map();
  for (const s of list) if (s?.owner) own.set(s.owner, [...(own.get(s.owner) || []), s.name]);
  return [shared.join('、'), ...[...own].map(([who, names]) => `${who}自己的（只有${who}能发）：${names.slice(0, ROLE_STICKER_LIMIT).join('、')}`)].filter(Boolean).join('；');
}

export function normalizeChat(value) {
  const base = defaultChat();
  if (!value || typeof value !== 'object') return base;
  const presets = (Array.isArray(value.presets) && value.presets.length ? value.presets : base.presets).map(normalizeChatPreset);
  const contacts = (Array.isArray(value.contacts) ? value.contacts : []).slice(0, CHAT_LIMITS.contacts).map(normalizeContact).filter(c => c.name);
  const starred = [...new Set((Array.isArray(value.starred) ? value.starred : []).map(n => text(n, 40).trim()).filter(Boolean))].slice(0, CHAT_LIMITS.contacts);
  return {presets, activePreset: presets.some(p => p.id === value.activePreset) ? value.activePreset : presets[0].id, contacts, voiceText: normalizeVoiceText(value.voiceText), profile: normalizeProfile(value.profile), wallet: normalizeWallet(value.wallet), starred, avatars: normalizeAvatars(value.avatars), partition: ['card', 'chat'].includes(value.partition) ? value.partition : 'none', ...(value.firstSaves && typeof value.firstSaves === 'object' ? {firstSaves: Object.fromEntries(Object.entries(value.firstSaves).filter(([, v]) => typeof v === 'string').slice(-500))} : {}), pace: value.pace !== false, stickers: normalizeStickers(value.stickers), proactive: normalizeProactive(value.proactive), remarks: normalizeNames(value.remarks, 20), netNames: normalizeNames(value.netNames, 30),
    // 自定义气泡 (core/bubble-css.js): the sets, and whose set is whose.
    bubbleSets: normalizeBubbleSets(value.bubbleSets), bubbleOf: normalizeBubbleOf(value.bubbleOf), roleStickers: normalizeRoleStickers(value.roleStickers), bgOf: normalizeBgOf(value.bgOf),
    // 状态和签名, 查手机 × 聊天 (0.9.35).
    statusOf: normalizeStatusOf(value.statusOf), peeked: normalizePeeked(value.peeked),
    // 0.9.36: 自动回复 (off unless turned on), 拍一拍后缀 of each person by their own key, 宠物.
    autoReply: value.autoReply === true, patOf: normalizeNames(value.patOf, 20), pets: normalizePets(value.pets)};
}

// ---------- 状态和签名 (0.9.35) ----------
// A contact's status and signature on the phone, kept by their own key (同名角色 apart): what they set themselves in a
// reply (「[状态] 忙碌｜在开会」「[签名] …」) — {status, text, at, signature, signAt}. What they set lasts STATUS_KEEP; after
// that (or before they ever set one) the phone guesses by the time (contactStatus).
export const STATUS_KEEP = 6 * 3600_000;
const STATUS_WORDS = [[/隐身/, 'hidden'], [/[Qq]我|找我/, 'qme'], [/忙|工作|上班|开会|上课|考试|学习|作业|加班|训练|排练|值班/, 'busy'], [/离开|睡|休息|不在|外出|出门|路上|洗澡|吃饭|勿扰/, 'away'], [/在线|有空|闲/, 'online']];
/** The status a word means (忙碌 → busy, 睡觉中 → away …); '' when it means none. */
export const statusWord = word => STATUS_WORDS.find(([re]) => re.test(String(word ?? '')))?.[1] || '';
export function normalizeStatusOf(value) {
  const out = {}, time = v => Number.isFinite(v) && v > 0 ? v : 0;
  for (const [who, s] of Object.entries(value && typeof value === 'object' ? value : {}).slice(0, 400)) {
    if (!who || !s || typeof s !== 'object') continue;
    const status = Object.hasOwn(PROFILE_STATUS, s.status) ? s.status : 'online', words = text(s.text, 20).trim(), signature = text(s.signature, 80).trim(), at = time(s.at), signAt = time(s.signAt);
    const kept = {...(at ? {status, text: words, at} : {}), ...(signature ? {signature, signAt} : {})};
    if (Object.keys(kept).length) out[String(who).slice(0, 80)] = kept;
  }
  return out;
}
/**
 * How a contact shows on the phone now: {status, text, signature, set}. What they set within STATUS_KEEP (set: true);
 * else a guess by the time — 在线 for a while after they wrote, 睡觉中 from 1 to 7, 忙碌 in weekday working hours.
 */
export function contactStatus(saved, {now = Date.now(), lastAt = 0} = {}) {
  const signature = saved?.signature || '';
  if (saved?.at && now - saved.at < STATUS_KEEP) return {status: saved.status, text: saved.text || '', signature, set: true};
  if (lastAt && now - lastAt < 15 * 60_000) return {status: 'online', text: '', signature, set: false};
  const d = new Date(now), h = d.getHours(), weekday = d.getDay() >= 1 && d.getDay() <= 5;
  if (h >= 1 && h < 7) return {status: 'away', text: '睡觉中', signature, set: false};
  if (weekday && ((h >= 9 && h < 12) || (h >= 14 && h < 18))) return {status: 'busy', text: '', signature, set: false};
  return {status: 'online', text: '', signature, set: false};
}
/** A status as one short line: 「忙碌 · 在开会」. */
export const statusText = s => `${PROFILE_STATUS[s?.status] || PROFILE_STATUS.online}${s?.text ? ' · ' + s.text : ''}`;

// ---------- 查手机 × 聊天 (0.9.35) ----------
// Whose phone the user looked into lately: {their own key: {at, what}} (what: the parts opened, 「聊天、相册」). The next
// private chat with them is told once (they may notice); after three days it is forgotten.
export const PEEK_NOTICE_DAYS = 3;
export function normalizePeeked(value, now = Date.now()) {
  const out = {};
  for (const [who, p] of Object.entries(value && typeof value === 'object' ? value : {}).slice(0, 200)) {
    const at = Number(p?.at);
    if (who && Number.isFinite(at) && at > 0 && now - at < PEEK_NOTICE_DAYS * 86_400_000) out[String(who).slice(0, 80)] = {at, what: text(p.what, 60).trim()};
  }
  return out;
}

// ---------- 主动发消息: characters text the user on their own ----------
/**
 * on: the story may have characters text the user (<phone> in a story reply, no request of its own); every: besides,
 * every this many story replies someone may text first (0: never; one phone request each), at most dailyMax a day.
 */
// dailyMax 0: no limit a day.
// clock (0.9.33): with 现实时间 on, someone may also text first by the real time — in the morning, at bedtime, after a
// long quiet — while the tavern page is open (host-chat.js clockTick).
export function normalizeProactive(value = {}) {
  return {on: value?.on === true, every: count(value?.every, 0, 100, 0), dailyMax: count(value?.dailyMax, 0, 99, 3), clock: value?.clock === true};
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
export function phoneFormat({user = '我', names = [], groups = [], images = false, after = false, status = false, make = false} = {}) {
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
    `- 发朋友圈：「名字：[朋友圈] 动态内容${images ? '｜配图用的英文 danbooru tag（有画面感才配，不配图就不写｜和后面的 tag）' : ''}」（发给所有朋友看的，不是发给${user}的）`,
    // 0.9.35: what someone is doing shows on the phone; a few of them may start a group (the user in it only when named).
    status ? '- 改在线状态或个性签名：「名字：[状态] 忙碌｜在做什么」「名字：[签名] 新签名」（在做的事、心情变了才改）' : '',
    make ? `- 拉群：「名字：[建群] 群名｜成员1、成员2」（拉${user}就把${user}写进成员；不写就是只有他们几个的群）` : '',
    `私聊是一对一的：${after ? '' : '<phone></phone> 里'}每个人的每一条都是他单独发给${user}的，只有他和${user}看得到，发到他和${user}的私聊窗口里。所以：`,
    `- 每条都是对${user}说的（「你」就是${user}），不对别人说话、不喊别人的名字让对方接话；想说别人的事，就当着${user}的面说起他。`,
    `- 几个人都发消息时，各发各的：彼此看不到对方发了什么，不回应、不引用、不接着别人私聊里的话，也不知道别人给${user}发过消息（正文里当面说过、${user}告诉过他的除外）。`,
    `- 消息内容只能是他这时会知道的事：没在场的人不知道刚才当面发生了什么。`,
    groups.length ? (after ? `几个人在一起聊、互相能看到的，只能发在群里：另起一段，第一行写「群：群名」，下面一样一行一件事；群名只能是：${groups.join('、')}。` : `几个人在一起聊、互相能看到的，只能发在群里：另写一段 <phone group="群名"></phone>；群名只能是：${groups.join('、')}。`) : '',
    `名字只能是：${list}。不要替${user}发，不写语音标签。这些只出现在${user}的手机上，不写进正文的叙述里。${after ? '正文里没有这样的事、也没人要发消息，就只写「无」。' : '没有这样的事就不写。'}`].filter(Boolean).join('\n');
}
const storyRules = (preset, user, list) => (preset?.entries || []).filter(e => e.enabled && e.text?.trim() && (e.use || []).includes('story')).map(e => fill(e.text, {'用户': user, '联系人': list, '对象': list}));
/**
 * The rule for the story request: the chat preset's 正文 rules ({{用户}}, {{联系人}}), and how to write what happens
 * on the phone. '' when there is no rule or no one to send them.
 */
export function storyTextRule(preset, {user = '我', names = [], groups = [], images = false, status = false, make = false} = {}) {
  const used = storyRules(preset, user, names.join('、'));
  if (!used.length || !names.length) return '';
  return [...used, phoneFormat({user, names, groups, images, status, make})].join('\n\n');
}
/** The same for the request made after the reply (回复后单独配音/配图): it reads the story and writes the phone part. */
export function phoneAfterRule(preset, {user = '我', names = [], groups = [], images = false, status = false, make = false} = {}) {
  const used = storyRules(preset, user, names.join('、'));
  if (!used.length || !names.length) return '';
  return [...used, phoneFormat({user, names, groups, images, after: true, status, make})].join('\n\n');
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
export const inSpace = (item, space) => {
  if (!space?.key) return true;
  if (!space.card) return !item?.space || item.space === space.key;
  // 按聊天: what was made in this tavern chat; what has no chat of its own (from before) stays with the first one of its card.
  if (item?.save === space.key || item?.space === space.key) return true;
  return !item?.save && !!space.first && (!item?.space || item.space === space.card);
};
/**
 * The space to filter by: the open card's with partition 'card'; with 'chat' (one phone per tavern chat, so a new chat
 * of the same card starts from nothing) that chat's, key `card#chat`, card its card, first whether it holds the card's
 * older things. null: everything (partition off, or no card open).
 */
export function activeSpace(settings, space) {
  const how = settings.chat?.partition;
  if (!space?.key || (how !== 'card' && how !== 'chat')) return null;
  if (how === 'card' || !space.save) return space;
  return {...space, key: `${space.key}#${space.save}`, card: space.key, first: settings.chat.firstSaves?.[space.key] === space.save};
}
/** Whether a role belongs to the space: by being tagged there (see tagRoles). */
export const roleInSpace = (r, space) => Array.isArray(r.cards) && (r.cards.includes(space.key) || (!!space.first && r.cards.includes(space.card)));
export function chatContacts(settings, space = null) {
  // A card's contacts: its own character(s), the roles that have spoken (or been named) in its story, roles added to
  // it, and contacts added under it. A role no story has met yet is in none until one does: it used to be in every
  // card, so that roles made before cards were kept (most of them) made every card's phone look the same. A role
  // made while a card is open belongs to that card; any role can be added from 联系人 →「＋」.
  const here = r => !space?.key || (space.members || []).includes(r.name) || roleInSpace(r, space);
  // 旁白 is the voice that reads the story (整篇朗读), not someone to talk to.
  const roles = settings.routes.filter(r => !isPlaceholderRole(r.name) && r.name !== NARRATOR && here(r)).map(r => ({name: r.name, source: 'role', voice: !!r.voice, engine: r.voice ? r.engine : 'none', language: r.language || settings.general.defaultLanguage,
    // 角色资料: written in the 角色 App, else a contact of the same name's (a contact given a voice keeps who they are).
    persona: String(r.persona || settings.chat.contacts.find(c => c.name === r.name)?.persona || '').slice(0, CHAT_LIMITS.persona)}));
  // (Contacts of one name in different cards: with 分区 off everything is in one list, and a name is one person there.)
  const manual = settings.chat.contacts.filter(c => !roles.some(r => r.name === c.name) && inSpace(c, space)).filter((c, i, all) => all.findIndex(x => x.name === c.name) === i).map(c => ({name: c.name, source: 'manual', id: c.id, voice: false, engine: 'none', language: '', persona: c.persona}));
  return [...roles, ...manual];
}

const nameOf = (who, me) => who === 'me' ? me : who;
export const DEFAULT_BLESSING = '恭喜发财，大吉大利';
const TRANSFER_STATE = {sent: '待收款', accepted: '已收款', returned: '已退还'};
/** 「X 领取了 Y 的红包」-style lines; `me` is how the user is called (你 on screen, the user's name in prompts). */
export const noticeText = (m, me) => nameOf(m.from, me) + String(m.text).replaceAll('{对方}', nameOf(m.target, me));
export const patText = (m, me) => `${nameOf(m.from, me)}拍了拍${nameOf(m.target, me)}${m.suffix || ''}`;

/** How a chat message reads in a transcript. */
export function messageLine(m, user) {
  const line = messageWordsFor(m, user);
  // 消息回应: who put which emoji on it.
  return line && m.reactions?.length ? `${line}（${m.reactions.map(r => `${nameOf(r.from, user)}贴了${r.emoji}`).join('，')}）` : line;
}
function messageWordsFor(m, user) {
  const who = nameOf(m.from, user), quote = m.quote ? `「回复 ${nameOf(m.quote.from, user)}：${m.quote.text}」` : '';
  switch (m.kind) {
    // 群游戏: the card as it is now.
    case 'game': return gameLine(m, user);
    case 'system': return '';
    case 'voice': return `${who}：${quote}[语音] ${m.translation || m.text}`;
    case 'photo': return `${who}：[图片${m.seen ? m.seen : ''}]${m.text ? ' ' + m.text : ''}`;
    case 'file': return `${who}：[文件 ${m.name}]${m.text ? ' ' + m.text : ''}`;
    case 'sticker': return `${who}：[表情包] ${m.text}`;
    // 慢递信件 (0.9.36): one on its way is not read yet by the other side.
    case 'letter': return m.letter?.arriveAt > Date.now() && !m.letter?.answered ? `（${who}寄出了一封信，还在路上，对方还没收到）` : `${who}：[信]\n${String(m.letter?.text || '').slice(0, 1500)}\n[信结束]`;
    // 论坛 × 聊天 and 衣柜 × 聊天 (0.9.35): what was shared, as it reads.
    case 'post': return `${who}：[分享帖子] 「${m.post?.title || ''}」${m.post?.author ? `（发帖的人：${nameOf(m.post.author, user)}）` : ''}${m.post?.text ? '\n  ' + m.post.text : ''}${m.post?.note ? '\n  ' + who + '说：' + m.post.note : ''}`;
    // 绘本 × 聊天 (0.9.40): the book's words go with the card, so the reader can say what they thought.
    case 'book': return `${who}：[分享绘本] 《${m.book?.title || ''}》${m.book?.subtitle ? ' · ' + m.book.subtitle : ''}（${m.book?.spreads || 0} 个跨页）\n${String(m.book?.text || '').slice(0, 3000)}\n[绘本结束]`;
    case 'outfit': return `${who}：[分享穿搭] ${ownerName(m.outfit?.owner, user)}的一身「${m.outfit?.name || ''}」：${m.outfit?.text || ''}${m.outfit?.note ? '｜' + m.outfit.note : ''}`;
    // 合并转发: the record as it was forwarded, so whoever gets it can read it.
    case 'forward': return `${who}：[转发的聊天记录：${m.title}]\n${(m.items || []).map(i => `  ${i.from}：${i.text}`).join('\n')}\n[聊天记录结束]`.slice(0, 4000);
    case 'redpacket': return `${who}：[红包 ¥${m.amount}] ${m.text || DEFAULT_BLESSING}（${m.state === 'opened' ? nameOf(m.openedBy, user) + '已领取' : '还没领取'}）`;
    case 'transfer': return `${who}：[转账 ¥${m.amount}]${m.text ? ' ' + m.text : ''}（${TRANSFER_STATE[m.state] || '待收款'}）`;
    case 'gift': return `${who}：[礼物 ${m.gift?.name || ''}${m.gift?.price ? ' ¥' + yuan(m.gift.price) : ''}]${m.text ? ' ' + m.text : ''}（${m.state === 'accepted' ? '已收下' : m.state === 'returned' ? '被退还了' : '还没收下'}）`;
    case 'location': return `${who}：[位置] ${m.text}${m.detail ? '（' + m.detail + '）' : ''}`;
    case 'song': return `${who}：${quote}[分享歌曲] ${m.song?.title || ''}${m.song?.artist ? ' - ' + m.song.artist : ''}${m.text ? ' ' + m.text : ''}`;
    case 'pat': return `（${patText(m, user)}）`;
    case 'dice': return `${who}：[骰子] ${m.text} 点`;
    case 'notice': return `（${noticeText(m, user)}）`;
    // A contact's recall: they know what they said, and believe it was not seen (the user's peek is never told).
    case 'recall': return m.said && m.from !== 'me' ? `（${who}发了一条又马上撤回了：「${m.said}」。${nameOf('me', user)}看到的只有「${who}撤回了一条消息」）` : `（${who}撤回了一条消息）`;
    case 'call': return `（${who}${m.dir === 'out' ? '打了语音电话过去' : '打来语音电话'}：${callSummary(m)}）${m.lines?.length ? '通话里说了：' + m.lines.slice(-6).map(l => `${nameOf(l.from, user)}：${l.translation || l.text}`).join(' / ') : ''}${m.voicemail?.length ? '语音留言：' + m.voicemail.map(l => l.translation || l.text).join(' ') : ''}`;
    default: return `${who}：${quote}${m.text}`;
  }
}

// ---------- 群游戏 (0.9.34) ----------
/** A game card as one line of the chat record. */
function gameLine(m, user) {
  const g = m.game || {}, who = nameOf(m.from, user);
  if (g.type === 'vote') return `${who}：[发起投票] ${g.question}（选项：${g.options.join('、')}）${g.votes.length ? `已投：${g.votes.map(v => `${nameOf(v.from, user)}投了「${g.options[v.option]}」${v.why ? '（' + v.why + '）' : ''}`).join('，')}` : ''}${g.open ? '' : '（投票已结束）'}`;
  if (g.type === 'truth') return `（${who}转了真心话大冒险的转盘，转到了${nameOf(g.target, user)}${g.choice ? `，${nameOf(g.target, user)}选了${g.choice}` : ''}）`;
  if (g.type === 'chain') return `${who}：[发起${CHAIN_MODES[g.mode]}] 接龙记录：${g.entries.map(e => `${nameOf(e.from, user)}：${e.text}`).join(' → ')}${g.loser ? `（${nameOf(g.loser, user)}认输了）` : g.open ? '' : '（已结束）'}`;
  if (BOARDS[g.type]) return `（${who}开了一盘${BOARDS[g.type].name}，${nameOf(g.first, user)}先下${g.winner ? '：' + boardResult(g, user) : '，还没下完'}）`;
  return `${who}：[群游戏]`;
}
/**
 * The games going on in a chat, as the turn tells them (the 群游戏 block of 系统提示词): the latest open vote and 接龙
 * in what the request reads, and a 真心话大冒险 turn not yet played out (the latest card, nothing said after it but by
 * its target's choice).
 */
export function gameNotes(prompts, messages, user = '我') {
  const games = messages.filter(m => m.kind === 'game' && m.game), out = [];
  const vote = games.findLast(m => m.game.type === 'vote' && m.game.open), chain = games.findLast(m => m.game.type === 'chain' && m.game.open), truth = games.at(-1)?.game?.type === 'truth' ? games.at(-1) : null;
  if (vote) { const g = vote.game; out.push(promptText(prompts, 'games', 'vote', {'用户': user, '问题': g.question, '选项': g.options.map(o => `「${o}」`).join('、'), '已投': g.votes.map(v => nameOf(v.from, user)).join('、')})); }
  if (truth && messages.indexOf(truth) >= messages.length - 8) { const g = truth.game; out.push(promptText(prompts, 'games', 'truth', {'用户': user, '谁': nameOf(g.target, user), '是用户': g.target === 'me', '已选': g.choice})); }
  if (chain) { const g = chain.game; out.push(promptText(prompts, 'games', 'chain', {'用户': user, '玩法': CHAIN_MODES[g.mode], '最后一句': `${nameOf(g.entries.at(-1).from, user)}：${g.entries.at(-1).text}`, '成语': g.mode === 'idiom'})); }
  // 小游戏对战 (0.9.35): the board going on (or just over: they may say something about it), as it stands.
  const board = games.findLast(m => BOARDS[m.game.type]);
  if (board && (board.game.open || messages.indexOf(board) >= messages.length - 4)) {
    const g = board.game, last = g.moves.at(-1), size = BOARDS[g.type].size;
    out.push(promptText(prompts, 'games', 'board', {'用户': user, '对象': g.them, '棋': BOARDS[g.type].name, '五子棋': g.type === 'gomoku',
      '棋子': g.first === g.them ? '×' : '○', '对方棋子': g.first === 'me' ? '×' : '○', '棋盘': boardText(g),
      '刚下': last ? `${nameOf(last.by, user)}下在了 ${cellName(last.at, size)}` : '', '结果': boardResult(g, user), '轮到': g.turn === g.them, '等用户': g.turn === 'me'}));
  }
  return out.join('\n');
}
/** How a board game ended, said for the record: 「小林赢了」「平局」「凛认输了」 ('' while it goes on). */
export function boardResult(g, user = '我') {
  if (g.winner === 'draw') return '平局';
  if (g.resigned) return `${nameOf(g.resigned, user)}认输了`;
  return g.winner ? `${nameOf(g.winner, user)}赢了` : '';
}
/**
 * 世界书 by turns (0.9.38): the tavern scans the last few entries it is given for keywords (its 扫描深度, 2 by default) —
 * in the story, the last two messages. A phone chat or call is many short lines, so the lines one side said in a row go
 * as one entry: the depth then covers the user's last turn and the one before it, as it does in the story.
 * lines: [{me, text}] oldest first. Answers the turns' texts, oldest first.
 */
export function scanTurns(lines) {
  const out = [];
  let side = null;
  for (const {me, text} of lines) {
    const words = String(text ?? '').trim();
    if (!words) continue;
    if (out.length && side === !!me) out[out.length - 1] += '\n' + words;
    else { out.push(words); side = !!me; }
  }
  return out;
}
// ---------- 防复读 (0.9.36) ----------
// Words people use a lot without meaning much: not taken for someone's habit.
const COMMON = new Set(['我们', '你们', '他们', '什么', '怎么', '没有', '可以', '就是', '这个', '那个', '知道', '今天', '现在', '一下', '还是', '不是', '已经', '真的', '因为', '所以', '但是', '然后', '如果', '时候', '自己', '一个', '这样', '那样', '觉得', '我也', '你也', '是不', '不过']);
/**
 * What each of these people keeps using lately (their last 12 lines, at least 4): an opening (the first two to four
 * characters), an ending (the last two before the stops) or a face (an emoji or 颜文字) in three lines or more.
 * [{name, words}] — at most three words each, the most used first.
 */
export function repeatsOf(messages, names) {
  const out = [];
  // What the user wrote lately, to tell a quote of theirs from any other quote.
  const mine = messages.filter(m => m.from === 'me').slice(-30).map(m => String(m.kind === 'voice' ? m.translation || m.text : m.text || '')).join('\n');
  for (const name of names) {
    const lines = messages.filter(m => m.from === name && ['text', 'voice'].includes(m.kind)).slice(-12).map(m => String(m.kind === 'voice' ? m.translation || m.text : m.text || '').trim()).filter(Boolean);
    if (lines.length < 4) continue;
    const seen = new Map(), add = (word, line) => { if (word && !COMMON.has(word)) { const s = seen.get(word) || new Set(); s.add(line); seen.set(word, s); } };
    lines.forEach((line, i) => {
      const head = line.match(/^[\p{Script=Han}\p{L}]{2,}/u)?.[0] || '';
      for (const n of [4, 3, 2]) if (head.length >= n) add(head.slice(0, n), i);
      const tail = line.replace(/[\s。，！？!?.,~～…]+$/u, '').match(/[\p{Script=Han}]{2}$/u)?.[0];
      add(tail, i);
      for (const face of line.match(/\p{Extended_Pictographic}|[(（][^()（）\s]{2,12}[)）][^\s，。]{0,3}/gu) || []) add(face, i);
    });
    // The longest of words that come in the same lines stands for them (「嘿嘿嘿」 over 「嘿嘿」).
    const words = [...seen].filter(([, s]) => s.size >= 3).sort((a, b) => b[1].size - a[1].size || b[0].length - a[0].length).map(([w]) => w);
    const kept = words.filter((w, i) => !words.slice(0, i).some(x => x.includes(w) || w.includes(x))).slice(0, 3);
    // Quoting the user's own words back (“…”「…」) in two of these lines or more: a habit the memory may have taught.
    const quoting = lines.filter(line => (line.match(/[“"「『]([^”"」』]{3,40})[”"」』]/gu) || []).some(q => mine.includes(q.slice(1, -1).trim()))).length >= 2;
    if (kept.length || quoting) out.push({name, words: kept, quoting});
  }
  return out;
}

// ---------- 慢递信件 (0.9.36) ----------
const dateText = at => { const d = new Date(at); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}月${d.getDate()}日`; };
/** The request for a letter back: who writes it, what they know (story, memory, the phone chat), and the letter that came. */
export function letterRequest({prompts = {}, partner, persona = '', user = '我', userPersona = '', lore = '', memory = '', earlier = '', story = [], history = [], letter = '', sentAt = 0, now = Date.now()}) {
  const system = promptText(prompts, 'letter', 'system', {'用户': user, '对象': partner, '对象资料': String(persona || '').trim() || '（没有资料，按剧情里的表现来）',
    '世界书': lore.trim(), '用户设定': userPersona.trim(), '更早的剧情': earlier.trim(), '最近的剧情': story.map(s => `${s.name}：${s.text}`).join('\n'),
    '记忆': memory.trim(), '聊天记录': history.filter(m => m.kind !== 'letter').map(m => messageLine(m, user)).filter(Boolean).slice(-20).join('\n')});
  return [{role: 'system', content: system}, {role: 'user', content: promptText(prompts, 'letter', 'ask', {'用户': user, '对象': partner, '来信': letter, '寄出': dateText(sentAt), '收到': dateText(now)})}];
}
/** A letter as the model wrote it: the words, without fences or a heading of its own. */
export const letterText = answer => String(answer ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```[a-z]*\n?|```/g, '').replace(/^\s*(?:【?回信】?|回信[:：])\s*\n/, '').trim().slice(0, 3000);

/** 状态和签名 (0.9.35): how to change them, and what the people of this chat set (statuses: {name: contactStatus}). */
function statusPart(prompts, members, statuses) {
  if (!promptOn(prompts, 'status')) return '';
  const lines = members.map(m => {
    const s = statuses[m.name], said = [s?.set ? `状态是「${statusText(s)}」` : '', s?.signature ? `个性签名是「${s.signature}」` : ''].filter(Boolean);
    return said.length ? `${m.name}现在${said.join('，')}` : '';
  }).filter(Boolean);
  return promptText(prompts, 'status', 'rule', {'现在': lines.join('；')});
}
/** 绘本 × 聊天 (0.9.40): the user sent a picture book into this chat just now: they read it and say what they thought. */
function bookNote(prompts, history, user) {
  const at = history.findLastIndex(m => m.kind === 'book' && m.from === 'me');
  if (at < 0 || at < history.length - 4 || !promptOn(prompts, 'book-share')) return '';
  return promptText(prompts, 'book-share', 'rule', {'用户': user, '书名': history[at].book?.title || ''});
}
/** 衣柜 × 聊天 (0.9.35): the user just showed this contact clothes put together for them: they may put them on. */
function outfitNote(prompts, history, partner, user) {
  const at = history.findLastIndex(m => m.kind === 'outfit' && m.from === 'me');
  const m = history[at];
  if (!m || at < history.length - 4 || ownerName(m.outfit?.owner, user) !== partner || m.outfit?.owner === 'me') return '';
  return promptText(prompts, 'wardrobe', 'chat', {'用户': user, '对象': partner, '名字': m.outfit.name});
}

const fill = (template, values) => Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), template);

/** The words of the files still in the chat window: the latest three, at most 30000 characters together. */
export const CHAT_FILES = Object.freeze({count: 3, chars: 30000});
function filesText(history, user) {
  let room = CHAT_FILES.chars;
  const files = history.filter(m => m.kind === 'file' && m.fileText).slice(-CHAT_FILES.count).reverse().map(m => {
    const words = m.fileText.slice(0, Math.max(0, room)); room -= words.length;
    return words ? `【${nameOf(m.from, user)}发来的文件：${m.name}】\n${words}${words.length < m.fileText.length ? '\n（后面太长，没有发出来）' : ''}\n【文件结束】` : '';
  }).filter(Boolean).reverse();
  return files.length ? files.join('\n\n') + '\n\n' : '';
}

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
  const one = names.length === 1 ? names[0] : '';
  return promptText(prompts, 'knows', 'text', {'谁': one || '各人', '每个人': one || '每个人', '用户': user, '告诉': one ? ' TA ' : '自己', '某人': one || '一个人', '那人': one || '这个人', '群聊': group});
}
/**
 * 0.9.35: statuses {name: contactStatus} of the people here (状态和签名); peeked: what the user looked at on this
 * contact's phone lately (true: something, not known what; '' when nothing — 查手机 × 聊天); posts [{title, author}] lately on the forum (论坛 × 聊天);
 * outfit: what they have just changed into (cue 'outfit', 衣柜 × 聊天). cue 'group': a group chats on its own (群里自己聊).
 * A 旁观群 (thread.watch) is talked in without the user.
 */
export function buildChatRequest({prompts = {}, preset, thread, members, story = [], exact = [], user = '我', userPersona = '', voiceFormat, lore = '', memory = '', earlier = '', images = false, stickers = [], asking = '', music = null, forum = '', groups = '', privateChats = '', nudge = false, cue = '', pictures = [], time = Date.now(), statuses = {}, peeked = '', posts = [], outfit = '', pats = {}}) {
  if (exact.length) { story = []; earlier = ''; }
  const group = thread.type === 'group', watch = group && thread.watch === true;
  const partner = group ? thread.name : members[0]?.name || thread.name;
  const speakers = members.filter(m => m.voice);
  const values = {
    '用户': user, '对象': partner,
    '语音格式': voiceFormat,
    '可发语音': speakers.length ? speakers.map(m => `${m.name}（${languageName(m.language || 'zh')}）`).join('、') : promptText(prompts, 'chat', 'noVoice')
  };
  const used = preset.entries.filter(e => e.enabled && e.text.trim() && e.use.includes(group ? 'group' : 'dm')).filter(e => speakers.length || e.id !== 'voice');
  const rules = used.map(e => fill(e.text, values)), posting = used.some(e => e.id === 'post' || /朋友圈/.test(e.text)), dialing = !group && used.some(e => e.id === 'c-dial');
  const system = promptText(prompts, 'chat', 'system', {
    '预设规则': rules.join('\n\n'), '用户': user, '聊天对象': partner, '谁': group ? '群里每个人' : partner,
    '聊天对象资料': members.map(m => `- ${m.name}：${(m.persona || m.card || '').trim() || '（没有资料，按剧情里的表现来）'}`).join('\n'),
    '世界书': lore.trim(), '用户设定': userPersona.trim(), '更早的剧情': earlier.trim(), '最近的剧情': story.map(s => `${s.name}：${s.text}`).join('\n'),
    '论坛': forum.trim() ? promptText(prompts, 'chat-forum', 'text', {'论坛内容': forum.trim()}) : '',
    // a private chat: what was said lately in the groups the contact is in too
    '同群': !group && groups.trim() ? promptText(prompts, 'chat-groups', 'text', {'用户': user, '对象': partner, '群消息': groups.trim()}) : '',
    '记忆': memory.trim(),
    '知情范围': story.length || earlier.trim() ? knowsRule(group ? members.map(m => m.name) : [partner], user, {group, prompts}) : '',
    '名单': members.map(m => m.name).join('、'),
    '语音': speakers.length > 0, '语音格式': voiceFormat, '语音语言': speakers.map(m => `${m.name}：${languageName(m.language || 'zh')}`).join('，'),
    '出图': images, '表情包': stickerList(stickers), '打电话': dialing, '朋友圈': posting, '分享歌曲': !!music?.share, '删好友': !group && !asking, '私聊': group && !watch,
    '正在听': music?.listening ? listeningNote(music.listening, user, prompts) : '', '好友申请': asking, '看图': pictures.length > 0,
    // 拍一拍后缀 (0.9.36): who here has none yet (they may give themselves one).
    '没后缀': members.filter(m => !pats[m.name]).map(m => m.name).join('、')});
  // 0.9.35: what else this chat knows and can do, each a block of 系统提示词 of its own.
  const extra = [
    (() => { const quiet = group ? Object.entries(thread.silenced || {}).filter(([n, until]) => thread.members.includes(n) && until > time).map(([n]) => n) : []; return quiet.length ? `群管理：${quiet.join('、')}正在禁言，禁言者不得发言；只有当前名单中的成员可以发言。` : ''; })(),
    group && promptOn(prompts, 'knows') ? privateChats : '',
    // 旁观群: the user is not in it, and nobody there knows the user sees it.
    // (told whether the block is on or not: off, it only stops the contacts starting groups)
    watch ? fillPrompt(promptTemplate(prompts, 'watch', 'system'), {'用户': user, '群名': thread.name, '名单': members.map(m => m.name).join('、')}) : '',
    // 建群: someone may start a group, with the user or without.
    !watch && promptOn(prompts, 'watch') ? promptText(prompts, 'watch', 'make', {'用户': user}) : '',
    statusPart(prompts, members, statuses),
    !watch && promptOn(prompts, 'memo') ? promptText(prompts, 'memo', 'rule', {'用户': user}) : '',
    !watch && posts.length && promptOn(prompts, 'forum-share') ? promptText(prompts, 'forum-share', 'rule', {'用户': user, '帖子': posts.slice(0, 8).map(p => `「${p.title}」${p.author ? `（${p.author}）` : ''}`).join('、')}) : '',
    // 0.9.36: a group's 群公告 and 群昵称, and how to change them or @ someone.
    group ? promptText(prompts, 'group-extra', 'rule', {'用户': user, '群公告': thread.notice?.text || '', '群昵称': Object.entries(thread.nicks || {}).map(([who, nick]) => `${nameOf(who, user)}在群里叫「${nick}」`).join('，')}) : ''].filter(Boolean);
  // pictures: [{id, url}] — photos sent along for a model that sees; the record numbers them [图片1], [图片2]… in order.
  const seen = new Map(pictures.map((p, i) => [p.id, i + 1]));
  const history = thread.messages.filter(m => m.kind !== 'system').slice(-preset.history).map(m => seen.has(m.id) ? {...m, seen: seen.get(m.id)} : m);
  const last = history.at(-1), now = !nudge && !asking;
  // 主动找你: whether to text at all is the model's to judge, by the preset's 「正文里主动发消息」 rule; [不发] is no.
  const when = nudge ? preset.entries.find(e => e.id === 's-text' && e.enabled && e.text.trim()) : null;
  // A 旁观群 goes on among its members; a group asked by the clock (群里自己聊) may also keep quiet.
  const turn = watch ? fillPrompt(promptTemplate(prompts, 'watch', 'turn'), {'用户': user, '群名': thread.name, '主动': nudge})
    : group && cue === 'group' ? promptText(prompts, 'now', 'group', {'用户': user, '群名': thread.name})
    : promptText(prompts, 'chat', 'turn', {'用户': user, '聊天对象': partner,
    '主动': nudge, '什么时候发': when ? fill(when.text, values) : '', '好友申请': !nudge && asking,
    '刚开始': now && !history.length ? (group ? '群里有人' : partner) : '',
    '轮到回复': now && last?.from === 'me' ? (group ? '群里的成员' : partner) : '',
    '接着说': now && last && last.from !== 'me' ? (group ? '群里' : partner) : ''});
  const transcript = history.length ? `【${group ? thread.name + '（群聊）' : '和' + partner}的聊天记录】\n${history.map(m => messageLine(m, user)).filter(Boolean).join('\n')}\n\n` : '';
  // 现实时间, when turned on: ahead of the record, the way a phone shows the time above the messages.
  const clock = clockText(prompts, {now: time, last: lastTheirs(thread.messages)});
  // 按现实时间主动找你: what the moment is (早上, 睡前, 很久没聊), under the time.
  const moment = clock && nudge && ['morning', 'night', 'quiet'].includes(cue) ? promptText(prompts, 'now', cue, {'对象': partner, '用户': user}) : '';
  // 防复读 (0.9.36): the openers, endings and faces someone here keeps using lately, to be left this time.
  const repeats = promptOn(prompts, 'variety') ? repeatsOf(history, members.map(m => m.name)) : [];
  // Someone @'d in the user's last message (groups): they answer.
  const lastMine = history.findLast(m => m.from === 'me'), atted = group && lastMine ? members.map(m => m.name).filter(n => String(lastMine.text || '').includes('@' + n) || (thread.nicks?.[n] && String(lastMine.text || '').includes('@' + thread.nicks[n]))) : [];
  // Under the record: the games going on here (how to play them), and in a private chat what was peeked at on their phone
  // (told once: they may notice), clothes the user just showed them, what they have just changed into.
  const games = [gameNotes(prompts, history, user),
    !group && peeked && promptOn(prompts, 'peek-notice') ? promptText(prompts, 'peek-notice', 'text', {'用户': user, '对象': partner, '看了什么': typeof peeked === 'string' ? peeked : ''}) : '',
    !group ? outfitNote(prompts, history, partner, user) : '',
    bookNote(prompts, history, user),
    !group && nudge && cue === 'outfit' && outfit ? promptText(prompts, 'wardrobe', 'changed', {'用户': user, '对象': partner, '衣着': outfit}) : '',
    atted.length && last?.from === 'me' ? promptText(prompts, 'group-extra', 'at', {'用户': user, '谁': atted.join('、')}) : '',
    repeats.length ? promptText(prompts, 'variety', 'text', {'复读': repeats.map(r => `${r.name}${r.words.length ? '：' + r.words.map(w => `「${w}」`).join('') : ''}${r.quoting ? `${r.words.length ? '，还' : '老'}用引号重复${user}说过的话（别再引用，用自己的话回）` : ''}`).join('；')}) : ''].filter(Boolean).join('\n');
  const text = (clock ? clock + (moment ? '\n' + moment : '') + '\n\n' : '') + transcript + filesText(history, user) + (games ? games + '\n\n' : '') + turn;
  return [...exactBackground(exact), {role: 'system', content: [system, ...extra].join('\n\n')}, {role: 'user', content: pictures.length ? [{type: 'text', text}, ...pictures.map(p => ({type: 'image_url', image_url: {url: p.url}}))] : text}];
}

const NAME_LINE = /^\s*(?:\*\*)?[[【]?([^\]】:：\n]{1,40}?)[\]】]?(?:\*\*)?\s*[:：]\s*(.*)$/;
const unquote = s => s.trim().replace(/^[「“"『](.*)[」”"』]$/s, '$1').trim();
const SPECIAL = /^\s*[[【]\s*(引用|发群公告|群公告|改群名|改群昵称|群昵称|改拍一拍后缀|拍一拍后缀|建群|拉群|改状态|状态|个性签名|改签名|签名|落子|下棋|悔棋|备忘录|记备忘|备忘|提醒|分享帖子|转发帖子|穿上|换上|表情回应|贴表情|回应|撤回|投票|接龙|认输|表情包|表情|收下礼物|退还礼物|礼物|送礼|图片|照片|位置|定位|红包|转账|拍一拍|领取红包|领取|收下|收款|退还|退回|朋友圈|发朋友圈|动态|配图|打电话|语音通话|来电|分享歌曲|分享音乐|分享歌|歌曲|音乐|私聊|私信|悄悄话|私发|删除好友|删好友|拉黑|通过好友申请|通过好友|同意好友|接受好友|拒绝好友申请|拒绝好友|发送好友申请|好友申请|申请好友|加好友)\s*([^\]】]*)[\]】]\s*(.*)$/;
const LUCKY = ['6.66', '8.88', '5.20', '13.14', '16.80', '1.88'];
// Drawing tags from what the model wrote: the English words (Chinese in them is left out), comma separated.
const tagsOf = s => String(s).replace(/[一-鿿]+/g, ' ').split(/[,，]/).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ').slice(0, 600);
// A post's picture: 「（配图：描述｜english tags）」 or 「[配图] tags」 after the text, or 「动态｜english tags」.
const PICTURE = /\s*[（(【[]\s*配图\s*[:：\]】]\s*([\s\S]*?)\s*[）)\]】]?\s*$/;
function postPicture(text) {
  const m = text.match(PICTURE);
  if (m) { const [said, ...tags] = m[1].split(/[|｜]/); return {text: text.slice(0, m.index).trim(), imageTags: tagsOf(tags.length ? tags.join(',') : said)}; }
  const bar = text.match(/^([\s\S]+?)\s*[|｜]\s*([\x20-\x7e]{3,})$/);
  return bar && /[a-z]/i.test(bar[2]) ? {text: bar[1].trim(), imageTags: tagsOf(bar[2])} : {text, imageTags: ''};
}
/**
 * A phone-feature line (「[红包 ¥8.88] 祝福」 and the like) as a message; {kind:'claim', action} for taking or returning
 * the user's red packet or transfer. null when the line is ordinary text.
 */
function special(from, content, {names, user, stickers = []}) {
  const m = content.match(SPECIAL);
  if (!m) return null;
  const [, what, arg, rest] = m, text = unquote(rest || '').replace(/<[^>]+>/g, '');
  const all = (arg.trim() ? arg.trim() + (text ? '｜' + text : '') : text).trim();
  switch (what) {
    // 引用 (0.9.36): 「[引用 那句话里的几个字] 回复的话」 — the host finds the line in the chat (one not found: just words).
    case '引用': {
      const [find, ...rest] = arg.trim() ? [arg.trim(), text] : text.split(/[|｜]/);
      const said = (arg.trim() ? text : rest.join(' ')).trim();
      return said ? {from, kind: 'quote', find: String(find || '').replace(/^[「“"]|[」”"]$/g, '').trim().slice(0, 60), text: said.slice(0, 4000)} : null;
    }
    // 群公告, 改群名, 群昵称 (0.9.36, groups): the host changes the group and leaves a line.
    case '发群公告': case '群公告': return all ? {from, kind: 'board', text: all.slice(0, 300)} : null;
    case '改群名': return all ? {from, kind: 'rename', text: all.replace(/^[「“"]|[」”"]$/g, '').trim().slice(0, 40)} : null;
    case '改群昵称': case '群昵称': return all ? {from, kind: 'nick', text: all.replace(/^[「“"]|[」”"]$/g, '').trim().slice(0, 16)} : null;
    // 拍一拍后缀 (0.9.36): their own words after a pat (「的小脑袋」), kept as theirs.
    case '改拍一拍后缀': case '拍一拍后缀': return all ? {from, kind: 'pat-suffix', text: all.replace(/^[「“"]|[」”"]$/g, '').trim().slice(0, 20)} : null;
    // 旁观群 and groups a contact makes (0.9.35): 「[建群] 群名｜成员1、成员2」 — the host makes it (the user in it only when named).
    case '建群': case '拉群': {
      const [name, ...rest] = all.split(/[|｜]/), list = [...new Set(rest.join('、').split(/[、,，;；\s]+/).map(n => n.trim()).filter(Boolean))].slice(0, 20);
      return name.trim() && list.length ? {from, kind: 'group', name: name.trim().slice(0, 40), members: list} : null;
    }
    // 状态和签名 (0.9.35): 「[状态] 忙碌｜在开会」 (a known status, or a few words it is read from), 「[签名] …」. A status
    // bar some presets write (「【状态】心情：开心」) is not one: it stays words.
    case '改状态': case '状态': {
      const [word, ...rest] = all.split(/[|｜]/), key = Object.entries(PROFILE_STATUS).find(([, label]) => label === word.trim())?.[0] || statusWord(word), more = rest.join(' ').trim();
      if (!word.trim() || /[:：]/.test(all) || word.trim().length > 12 || !key) return null;
      return {from, kind: 'status', status: key, text: (more || (PROFILE_STATUS[key] === word.trim() ? '' : word.trim())).slice(0, 20)};
    }
    case '个性签名': case '改签名': case '签名': return all && all.length <= 80 && !/[:：]\s*$/.test(all) ? {from, kind: 'sign', text: all.replace(/^[「“"]|[」”"]$/g, '').trim()} : null;
    // 小游戏对战 (0.9.35): 「[落子] B2」 on the open board (the host finds the cell); 「[悔棋]」 takes back one's own last move.
    case '落子': case '下棋': return all ? {from, kind: 'move', cell: all.slice(0, 60)} : null;
    case '悔棋': return {from, kind: 'undo'};
    // 备忘录 × 聊天 (0.9.35): 「[备忘] 要记的事｜什么时候提醒」 — into the user's 备忘录, reminded at that time.
    case '备忘录': case '记备忘': case '备忘': case '提醒': { const [what, ...when] = all.split(/[|｜]/); return what.trim() ? {from, kind: 'memo', text: what.trim().slice(0, 200), when: when.join(' ').trim().slice(0, 40)} : null; }
    // 论坛 × 聊天 (0.9.35): 「[分享帖子] 帖子标题｜想说的话」 — the post found on the forum by its title.
    case '分享帖子': case '转发帖子': { const [title, ...note] = all.split(/[|｜]/); return title.trim() ? {from, kind: 'share-post', title: title.trim().replace(/^[「“"《]|[」”"》]$/g, '').slice(0, 60), note: note.join(' ').trim().slice(0, 200)} : null; }
    // 衣柜 × 聊天 (0.9.35): putting on the clothes the user put together for them.
    case '穿上': case '换上': return {from, kind: 'wear', text: all.slice(0, 200)};
    // 消息回应 (0.9.34): an emoji on the user's latest message — put there by the host, not a message.
    case '表情回应': case '贴表情': case '回应': return {from, kind: 'react', emoji: oneEmoji(arg) || oneEmoji(text)};
    // Sent and taken back at once: the user sees 「撤回了一条消息」 (and may peek at it); the contact believes it unseen.
    case '撤回': { const said = (arg.trim() ? arg.trim() + (text ? ' ' + text : '') : text).trim().slice(0, 1000); return said ? {from, kind: 'recall', said} : null; }
    // 群游戏: a vote (「[投票] 选项｜理由」), a line of the 接龙, giving up — the host puts them on the open card.
    case '投票': { const [choice, ...why] = (arg.trim() ? arg.trim() + (text ? '｜' + text : '') : text).split(/[|｜]/); return choice.trim() ? {from, kind: 'vote', option: choice.trim().slice(0, 30), why: why.join(' ').trim().slice(0, 60)} : null; }
    case '接龙': { const said = (arg.trim() ? arg.trim() + (text ? ' ' + text : '') : text).trim(); return said ? {from, kind: 'chain', text: said.slice(0, 120)} : null; }
    case '认输': return {from, kind: 'chain', give: true};
    // A 朋友圈 post made while chatting: it goes to 朋友圈, not into the chat.
    case '朋友圈': case '发朋友圈': case '动态': {
      const {text: said, imageTags} = postPicture(text || arg.trim());
      return said ? {from, kind: 'moment', text: said.slice(0, 2000), ...(imageTags ? {imageTags} : {})} : null;
    }
    // The picture of the post just above, on a line of its own.
    case '配图': { const imageTags = tagsOf((text || arg.trim().replace(/^[:：]\s*/, '')).split(/[|｜]/).at(-1));return imageTags ? {from, kind: 'moment-picture', imageTags} : null; }
    // A voice call placed from the chat: the phone rings after this reply.
    case '打电话': case '语音通话': case '来电': return {from, kind: 'call', reason: (text || arg.trim()).slice(0, 200)};
    // A song shared (「[分享歌曲] 歌名 - 歌手｜想说的话」): a card the user can play.
    case '分享歌曲': case '分享音乐': case '分享歌': case '歌曲': case '音乐': { const [what, ...note] = (arg.trim() ? arg.trim() + (text ? '｜' + text : '') : text).split(/[|｜]/); const song = songOf(what); return song.title ? {from, kind: 'song', song, text: note.join(' ').trim().slice(0, 200)} : null; }
    // 「[私聊] …」 in a group: what someone says to the user alone (it goes to that one's private chat, not the group).
    case '私聊': case '私信': case '悄悄话': case '私发': { const said = (arg.trim() ? arg.trim() + (text ? ' ' + text : '') : text).slice(0, 4000); return said ? {from, kind: 'dm', text: said} : null; }
    // 删好友: the contact deletes the user; answering the user's 好友申请.
    case '删除好友': case '删好友': case '拉黑': return {from, kind: 'unfriend'};
    case '通过好友': case '通过好友申请': case '同意好友': case '接受好友': return {from, kind: 'befriend'};
    case '拒绝好友': case '拒绝好友申请': return {from, kind: 'refuse', text: (text || arg.trim()).slice(0, 200)};
    // 好友申请 from someone the user deleted or blocked (its words are the 验证消息); between friends it means nothing.
    case '发送好友申请': case '好友申请': case '申请好友': case '加好友': return {from, kind: 'request', text: (arg.trim().replace(/^[:：]\s*/, '') + (arg.trim() && text ? ' ' : '') + text).trim().slice(0, 100)};
    case '图片': case '照片': {
      // 「描述｜英文 tag」: the tags draw it when a drawing engine is set up (Chinese words in them are left out).
      const [said, ...tags] = (text || arg.trim()).split(/[|｜]/);
      const imageTags = tagsOf(tags.join(','));
      return said.trim() ? {from, kind: 'photo', text: said.trim().slice(0, 500), ...(imageTags ? {imageTags} : {})} : null;
    }
    // A sticker of the user's collection; a name it does not have stays words.
    case '表情包': case '表情': { const said = arg.trim() || text, s = findSticker(stickers.filter(x => !x?.owner || x.owner === from), said); return s ? {from, kind: 'sticker', text: s.name, ...(s.photoId ? {photoId: s.photoId} : {url: s.url})} : said ? {from, kind: 'text', text: `[${said.slice(0, 20)}]`} : null; }
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
export function exactBackground(exact = []) {
  // 照正文原样 (0.9.46): the story's own messages as one framed block of background. Passed as they were (turns ending
  // in a story reply) the model took them for its own conversation and wrote story in the phone chat. One message, the
  // same text while the story stands, so a prefix cache still holds.
  if (!exact.length) return [];
  const body = exact.map(m => `[${({system: '系统', user: '用户', assistant: '正文'})[m.role] || m.role}]\n${typeof m.content === 'string' ? m.content : ''}`).join('\n\n');
  return [{role: 'system', content: `【正文那边的完整上下文 · 只当背景】\n下面是正文模型上一次看到的内容和之后的新楼层，让你知道剧情走到了哪里、谁知道什么。里面的写作要求、输出格式、字数、「继续写」之类的指令都不是给你的：不要续写正文，不要用正文的格式。\n\n${body}\n\n【正文上下文结束】接下来你在手机里，按后面的说明回消息。`}];
}
export function parseChatReply(reply, {members, user = '我', voiceFormat, voiceNames = [], stickers = [], strictNames = false}) {
  const names = members.map(m => m.name), out = [];
  const body = String(reply || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```[a-z]*\n?|```/g, '');
  for (const raw of body.split(/\r?\n/)) {
    if (out.length >= 30) break;
    if (!raw.trim()) continue;
    const m = raw.match(NAME_LINE);
    let from = null, content = raw;
    if (m && names.includes(m[1].trim())) { from = m[1].trim(); content = m[2]; }
    else if (m && (m[1].trim() === user || m[1].trim() === '我')) continue;
    else if (m && strictNames) continue;
    else if (names.length === 1) from = names[0];
    else if (out.length) from = out.at(-1).from;
    if (!from || !content.trim()) continue;
    // 「（配图：…）」 on the line after a post is that post's picture, not a message.
    const post = out.at(-1)?.kind === 'moment' && !out.at(-1).imageTags ? out.at(-1) : null;
    if (post && /^\s*[（(]\s*配图\s*[:：]/.test(content)) { const imageTags = postPicture('x' + content.trim()).imageTags; if (imageTags) post.imageTags = imageTags; continue; }
    const feature = special(from, content, {names, user, stickers});
    if (feature?.kind === 'moment-picture') { if (post) post.imageTags = feature.imageTags; continue; }
    if (feature) { out.push(feature); continue; }
    const voice = voiceFormat ? parseDialogue(content, voiceFormat)[0] : null;
    if (voice) {
      if (voiceNames.includes(from)) out.push({from, kind: 'voice', text: wholeChatLine(voice.text.trim()), translation: wholeChatLine(voice.translation.trim()), emotion: voice.emotion});
      else out.push({from, kind: 'text', text: wholeChatLine(voice.translation.trim())});
      continue;
    }
    const plain = unquote(content.replace(/<[^>]+>/g, ''));
    if (plain) out.push({from, kind: 'text', text: wholeChatLine(plain)});
  }
  return out;
}

/** Keep whole sentences at the storage ceiling; visibly mark an overlong unsplit sentence. */
export function wholeChatLine(text) {
  if (text.length <= 4000) return text;
  const part = text.slice(0, 3970), end = Math.max(...['。', '！', '？', '!', '?', '\n'].map(c => part.lastIndexOf(c)));
  return (end >= 0 ? part.slice(0, end + 1) : part) + '（后续内容过长，已省略）';
}

/** The text injected into the next story reply when the user brings chat messages into the story. */
export function bringText(preset, {thread, messages, user = '我'}) {
  const partner = thread.type === 'group' ? thread.name : thread.members[0] || thread.name;
  const lines = messages.map(m => messageLine(m, user)).filter(Boolean).join('\n');
  return fill(preset.bring, {'用户': user, '对象': partner, '聊天记录': lines});
}

/** Removes voice/picture tags and markup from a story message, for the chat prompt. Code blocks, styles and scripts
 *  (the HTML 小剧场 some presets write) are not story: they are left out whole instead of becoming a wall of CSS. */
export function plainStory(textValue, tags = []) {
  return cleanTagged(textValue, ['think', 'thinking', 'phone', 'status', 'statusbar', '状态栏', ...tagList(tags)])
    .replace(/```[\s\S]*?(?:```|$)|<(style|script)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<!--[\s\S]*?(?:-->|$)/gi, ' ')
    .replace(/<tts\b[^>]*>[\s\S]*?<\/tts\s*>/gi, '')
    .replace(/<(sfx|ambience)\b[^>]*>[^<>]*<\/\1\s*>/gi, '')
    .replace(/<img\b[^>]*>[^<]*<\/img\s*>|<img\b[^>]*>/gi, '')
    .replace(OTHER_PICTURE_BLOCKS, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
