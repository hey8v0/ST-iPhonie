// 回复后单独配音: the story model writes the reply without any voice rule; afterwards the plugin asks the model once
// more, with the voice preset's rules, to voice the lines already in it. The answer is one row per spoken line, the
// line as the reply has it and the same line in the preset's 台词格式; the plugin puts each in place of its line.
// With 回复后单独配图 on too, both go in one request (combinedRequest).
import {parseDialogue, formatExample, FREE_FORMAT} from './protocol.js';

const OPEN = '“"「『‘\'', CLOSE = '”"」』’\'';
export const VOICE_ARROW = '⇒';

/** What the model is told to do, after the voice preset's own rules (format, reading rules, 硬性规则). */
export function voicePlanRule(format) {
  const sample = formatExample(format, {译文: '今天天气真好', 角色: '小林', 情绪: '开心', 文本: '今天天气真好'});
  return ['【单独配音】',
    '下面这段正文已经写好了。不改正文、不续写，只给里面的台词配音。',
    '找出正文里每一句角色真正说出口的台词（一般在引号里）；旁白、动作、心理描写和没说出口的话都不要。',
    `每句台词输出一行：先写正文里这句台词的原话（一字不差，不带引号），然后写「 ${VOICE_ARROW} 」，再按上面的台词格式写这句台词。一句很长的话可以在 ${VOICE_ARROW} 后面写成好几组，但左边始终是正文里的整句原话。`,
    `例：今天天气真好 ${VOICE_ARROW} ${sample}`,
    '按正文里的先后顺序，一句一行，只输出这些行，不要标题、解释或别的内容。正文里没有台词就只输出「无」。'].join('\n');
}
const voiceSystem = (rules, format) => [String(rules || '').trim(), voicePlanRule(format)].filter(Boolean).join('\n\n');
const story = (message, before) => (before.length ? `【前情】\n${before.map(m => `${m.name}：${m.text}`).join('\n')}\n\n` : '') + `【这段正文】\n${String(message).trim()}`;

/** The request for voicing a reply: rules = the voice preset's prompt for the speakers (promptPlan), joined. */
export function voicePlanRequest({rules, format, message, before = []}) {
  return [{role: 'system', content: voiceSystem(rules, format)}, {role: 'user', content: `${story(message, before)}\n\n（只输出台词行。）`}];
}

/** Voice and pictures in one request: the picture planner's request (planRequest) with the voicing put in front. */
export function combinedRequest({rules, format, pictures}) {
  const [system, user] = pictures;
  const count = String(user.content).match(/（请输出 (\d+) 个出图块。）\s*$/)?.[1] || '1';
  return [{role: 'system', content: `${voiceSystem(rules, format)}\n\n${system.content}\n\n【这次两件事一起做】先写一行「【台词】」，下面一句一行给台词配音；再写一行「【配图】」，下面输出出图块。`},
    {role: 'user', content: String(user.content).replace(/（请输出 \d+ 个出图块。）\s*$/, `（先在【台词】下面一句一行给台词配音；再在【配图】下面输出 ${count} 个出图块。）`)}];
}

/** The rows of an answer: [said, voiced] where voiced reads as at least one line in the format. */
export function voicedRows(reply, format) {
  const rows = [];
  for (const raw of String(reply).split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:[-*•·]|\d+[.、)）])?\s*(.+?)\s*(?:⇒|=>|→|➡)\s*(.+?)\s*$/);
    if (!m) continue;
    const said = m[1].replace(new RegExp(`^[${OPEN}]+|[${CLOSE}]+$`, 'g'), '').trim(), voiced = m[2].trim();
    if (said && parseDialogue(voiced, format).length) rows.push([said, voiced]);
  }
  return rows;
}

/**
 * Puts each voiced line in place of its line in the reply (the quotes around it go too, the format brings its own).
 * Lines are looked for in order, each after the one before; one not found after it is looked for from the start,
 * outside the places already taken. Returns {text, count}.
 */
export function insertVoiced(message, reply, format) {
  const source = String(message), taken = [], spans = [];
  const free = (a, b) => !taken.some(([x, y]) => a < y && b > x);
  const find = (said, from) => {
    for (const text of [said, said.replace(/[。！？!?…~～，,、]+$/, '')]) {
      if (!text) continue;
      for (let at = source.indexOf(text, from); at >= 0; at = source.indexOf(text, at + 1)) {
        let a = at, b = at + text.length;
        if (OPEN.includes(source[a - 1] || '\0') && CLOSE.includes(source[b] || '\0')) { a--; b++; }
        else if (OPEN.includes(source[a - 1] || '\0') && CLOSE.includes(source[b + 1] || '\0') && /[。！？!?…~～，,]/.test(source[b])) { a--; b += 2; }
        if (format===FREE_FORMAT) { const tail=/^\s*[（(][^()（）\n]{1,2000}[）)]/.exec(source.slice(b)); if(tail)b+=tail[0].length; }
        if (free(a, b)) return [a, b];
      }
    }
    return null;
  };
  let cursor = 0;
  for (const [said, voiced] of voicedRows(reply, format)) {
    const span = find(said, cursor) || find(said, 0);
    if (!span) continue;
    taken.push(span); spans.push([...span, format===FREE_FORMAT?source.slice(span[0],span[1])+voiced:voiced]);
    if (span[0] >= cursor) cursor = span[1];
  }
  let out = '', at = 0;
  for (const [a, b, voiced] of spans.sort((x, y) => x[0] - y[0])) { out += source.slice(at, a) + voiced; at = b; }
  return {text: out + source.slice(at), count: spans.length};
}
