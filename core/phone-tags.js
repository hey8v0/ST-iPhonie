import {escapeHTML} from './protocol.js';

const THOUGHT = /^(?:think|thinking|reasoning|thought|analysis)$/;
const PHONE_OPEN = /<(?:phone|iphonie)(?=[\s/>])/i;

/** Offsets point into the original reply, including any reasoning or literal examples. */
export function phoneTagSpans(text, reasoning) {
  if (!PHONE_OPEN.test(text)) return [];
  const {prefix, suffix} = reasoning || {};
  const blocks = [];
  // Code and comments are consumed first so their tag examples never affect the parser state.
  const tokens = /<!--[\s\S]*?(?:-->|(?![\s\S]))|^[ \t]*(`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)[\s\S]*?(?:^[ \t]*\1[ \t]*\r?$|(?![\s\S]))|(`+)[^\r\n]*?\2|<(\/?)(think|thinking|reasoning|thought|analysis|phone|iphonie)(?=[\s/>])([^<>]*)>/gim;
  if (typeof prefix === 'string' && prefix && typeof suffix === 'string' && suffix) {
    const start = text.length - text.trimStart().length;
    if (text.startsWith(prefix, start)) {
      const end = text.indexOf(suffix, start + prefix.length);
      if (end < 0) return [];
      tokens.lastIndex = end + suffix.length;
    }
  }
  let thought = '', open = null;
  for (let match; (match = tokens.exec(text));) {
    const [, , inlineCode, closing, rawName, attrs] = match;
    if (!rawName) {
      if (!inlineCode) open = null;
      continue;
    }
    const name = rawName.toLowerCase();
    if (thought) {
      if (closing && name === thought) thought = '';
      continue;
    }
    if (THOUGHT.test(name)) {
      open = null;
      if (!closing && !/\/\s*$/.test(attrs)) thought = name;
    } else if (closing) {
      if (open?.name === name && !attrs.trim()) {
        blocks.push({start: open.start, end: tokens.lastIndex, group: open.group, text: text.slice(open.content, match.index).trim()});
      }
      open = null;
    } else if (!/\/\s*$/.test(attrs)) {
      // A new opener ends an unfinished candidate. It cannot close the earlier block.
      const group = (attrs.match(/(?:^|\s)group\s*=\s*["'“”「『]?([^"'“”」』>]+)/i)?.[1] || '').trim();
      open = {name, start: match.index, content: tokens.lastIndex, group};
    }
  }
  return blocks;
}

/** Replace only the recognized phone blocks. The rest stays byte-for-byte the same. */
export function renderPhoneNotes(value, reasoning) {
  const text = String(value ?? '');
  let out = '', at = 0;
  for (const block of phoneTagSpans(text, reasoning)) {
    const names = new Set(block.text.split(/\n/).map(line => line.match(/^\s*\**\s*[[【]?([^\]】:：\n]{1,40}?)[\]】]?\s*[:：]/)?.[1]?.trim()).filter(Boolean));
    out += text.slice(at, block.start);
    if (names.size) {
      const who = escapeHTML([...names].join('、'));
      const message = block.group ? `群「${escapeHTML(block.group)}」里 ${who} 说了话` : `${who} 给你发了消息`;
      out += `<span class="sttts-phone-note">📱 ${message}</span>`;
    }
    at = block.end;
  }
  return out + text.slice(at);
}
