import {promptRule} from './prompt-rules.js';
// 来电 (voice calls) without DOM or network: call options, the request for each turn of a call, and the reply parser.
//
// A call is spoken: every line the contact says is written in the voice format of the active voice preset (the same
// tags as story dialogue), so it can be read aloud with the contact's own voice. Rules come from the chat preset, the
// ones used in 电话. The finished call is kept in the private chat as one message of kind 'call'.
import {parseDialogue} from './protocol.js';
import {messageLine, knowsRule} from './chat.js';
import {languageName} from './languages.js';

// perTurn: lines kept from one answer (each is read aloud one after another); a talkative contact may say a lot.
export const CALL_LIMITS = Object.freeze({lines: 80, perTurn: 10, ring: [15, 60], history: 12});

/** auto: characters call on their own every `every` story replies, at most `dailyMax` a day; ring: seconds before a missed call. */
export function defaultCalls() {
  return {auto: false, every: 12, dailyMax: 1, ring: 30};
}
const count = (value, min, max, fallback) => { const n = Math.round(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
export function normalizeCalls(value) {
  const base = defaultCalls();
  if (!value || typeof value !== 'object') return base;
  return {auto: value.auto === true, every: count(value.every, 1, 100, base.every), dailyMax: count(value.dailyMax, 1, 10, base.dailyMax), ring: count(value.ring, ...CALL_LIMITS.ring, base.ring)};
}

const fill = (template, values) => Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), String(template));
const who = (from, user) => from === 'me' ? user : from;

/** How the call reads in a transcript (the prompt of the next turn, or the chat history). */
export function callTranscript(lines, user) {
  return lines.map(l => `${who(l.from, user)}：${l.translation || l.text}`).join('\n');
}
/** Seconds as 3:07 or 1:02:09. */
export function callClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * The request for one turn of a call.
 * mode: 'incoming' (the contact called and the user just answered), 'outgoing' (the user called and the contact just
 * picked up), 'reply' (the user said something), 'voicemail' (the user did not answer; the contact leaves a message).
 * contact: {name, persona, card, voice, language}; voiceRules: how this contact's lines are read (engine tags).
 */
export function buildCallRequest({prompts = {}, preset, mode, contact, lines = [], history = [], story = [], user = '我', userPersona = '', voiceFormat, voiceRules = '', reason = '', lore = '', memory = '', earlier = ''}) {
  const name = contact.name, voiced = !!contact.voice && !!voiceFormat;
  const spoken = languageName(contact.language || 'zh');
  const values = {'用户': user, '对象': name, '语音格式': voiceFormat || '', '可发语音': voiced ? `${name}（${spoken}）` : '（只说中文）'};
  const rules = preset.entries.filter(e => e.enabled && e.text.trim() && e.use.includes('call')).map(e => fill(e.text, values));
  const situation = {
    incoming: `${name}给${user}打了语音电话，${user}刚刚接通。${reason ? `（打来的原因：${reason}）` : promptRule(prompts, "call.buildCallRequest.001")}`,
    outgoing: promptRule(prompts, "call.buildCallRequest.002", {"用户": (user), "角色名": (name), "角色名_3": (name), "角色名_4": (name), "用户_5": (user)}),
    reply: `你们正在通话。`,
    voicemail: promptRule(prompts, "call.buildCallRequest.003", {"角色名": (name), "用户": (user), "用户_3": (user), "角色名_4": (name), "动态内容5": (reason ? `（打来的原因：${reason}）` : '')})
  }[mode];
  const turn = {
    incoming: promptRule(prompts, "call.buildCallRequest.004", {"角色名": (name)}),
    outgoing: promptRule(prompts, "call.buildCallRequest.005", {"角色名": (name), "用户": (user)}),
    reply: lines.at(-1)?.from === 'me' ? promptRule(prompts, "call.buildCallRequest.006", {"角色名": (name), "用户": (user)}) : `（${user}没有接话，${name}接着往下说。）`,
    voicemail: promptRule(prompts, "call.buildCallRequest.007", {"角色名": (name)})
  }[mode];
  const system = [
    rules.join('\n\n'),
    `【通话对象】\n- ${name}：${(contact.persona || contact.card || '').trim() || '（没有资料，按剧情里的表现来）'}`,
    lore.trim() ? promptRule(prompts, "call.buildCallRequest.008", {"角色名": (name), "动态内容2": (lore.trim())}) : '',
    userPersona.trim() ? promptRule(prompts, "call.buildCallRequest.009", {"用户": (user), "用户_2": (user), "角色名": (name), "动态内容4": (userPersona.trim())}) : '',
    earlier.trim() ? promptRule(prompts, "call.buildCallRequest.010", {"角色名": (name), "动态内容2": (earlier.trim())}) : '',
    story.length ? promptRule(prompts, "call.buildCallRequest.011", {"角色名": (name), "动态内容2": (story.map(s => `${s.name}：${s.text}`).join('\n'))}) : '',
    memory.trim(),
    story.length || earlier.trim() ? knowsRule([name], user, {prompts}) : '',
    history.length ? `【${name}和${user}最近的手机聊天】\n${history.map(m => messageLine(m, user)).filter(Boolean).join('\n')}` : '',
    `【现在】\n${situation}`,
    ['【输出格式】',
      promptRule(prompts, "call.buildCallRequest.012", {"角色名": (name), "动态内容2": (CALL_LIMITS.perTurn - 1), "动态内容3": (voiced ? promptRule(prompts, "call.buildCallRequest.013", {"语音格式": (voiceFormat), "角色名": (name)}) : '，直接写说的话，不加名字和引号')}),
      voiced ? promptRule(prompts, "call.buildCallRequest.014", {"角色名": (name), "动态内容2": (spoken), "角色名_3": (name), "动态内容4": (spoken), "动态内容5": (spoken === '中文' ? '' : '，不要写成中文'), "用户": (user)}) : '',
      promptRule(prompts, "call.buildCallRequest.015", {"用户": (user)}),
      mode === 'voicemail' ? '' : promptRule(prompts, "call.buildCallRequest.016", {"角色名": (name)}),
      voiced && voiceRules ? voiceRules : ''].filter(Boolean).join('\n')
  ].filter(Boolean).join('\n\n');
  const said = lines.length ? `【通话内容】\n${callTranscript(lines, user)}\n\n` : '';
  return [{role: 'system', content: system}, {role: 'user', content: said + turn}];
}

const HANGUP = /^\s*[[【(（]\s*(挂断|挂电话|挂了|结束通话)\s*[\]】)）]\s*$/;
/**
 * The contact's lines from the model's reply: [{text, translation, emotion}] (text is what is read aloud; translation
 * is what the user reads) and whether the contact hangs up. Lines with the voice tag keep the original language.
 */
export function parseCallReply(reply, {name, user = '我', voiceFormat, voiced = false}) {
  const body = String(reply || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```[a-z]*\n?|```/g, '');
  const out = [];
  let hangup = false;
  for (let raw of body.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (HANGUP.test(raw) || /[[【]\s*挂断\s*[\]】]/.test(raw)) { hangup = true; raw = raw.replace(/[[【]\s*(挂断|挂电话|挂了|结束通话)\s*[\]】]/g, ''); if (!raw.trim()) continue; }
    const named = raw.match(/^\s*(?:\*\*)?([^:：\n]{1,40}?)(?:\*\*)?\s*[:：]\s*(.*)$/);
    let content = raw;
    if (named && named[1].trim() === name) content = named[2];
    else if (named && [user, '我', '旁白'].includes(named[1].trim())) continue; // the user's line, written by mistake
    const voice = voiceFormat ? parseDialogue(content, voiceFormat)[0] : null;
    if (voice) {
      const translation = voice.translation.trim(), text = voice.text.trim();
      if (voiced && text) out.push({text, translation: translation || text, emotion: voice.emotion || 'calm'});
      else if (translation || text) out.push({text: translation || text, translation: translation || text, emotion: voice.emotion || 'calm'});
    } else {
      const plain = content.replace(/<[^>]+>/g, '').trim().replace(/^[「“"『](.*)[」”"』]$/s, '$1').trim();
      if (plain) out.push({text: plain.slice(0, 600), translation: plain.slice(0, 600), emotion: 'calm'});
    }
    if (out.length >= CALL_LIMITS.perTurn) break;
  }
  return {lines: out, hangup};
}

/** Short words for how a call ended, as the chat shows it. */
export function callSummary(m) {
  const mine = m.dir === 'out';
  if (m.state === 'answered') return `语音通话 ${callClock(m.duration)}`;
  if (m.state === 'missed') return mine ? '对方无人接听' : m.voicemail?.length ? '未接来电 · 有语音留言' : '未接来电';
  if (m.state === 'declined') return mine ? '对方已拒绝' : '已拒绝';
  return mine ? '已取消' : '对方已取消';
}
