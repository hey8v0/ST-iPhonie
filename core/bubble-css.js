// 自定义气泡 (0.9.33): sets of two CSS texts, 我的 (the user's bubbles) and 对方的 (the other side's), written against
// `.bubble` and kept with the chat settings (chat.bubbleSets; chat.bubbleOf picks a set for one person). A set is worn
// as profile.bubble 'custom:<id>'. scopeBubbleCss makes one text reach only the bubbles it is for: every selector goes
// under the set's own (one that does not begin with .bubble is taken as something inside the bubble), @keyframes get
// names of the set's own, and what could reach the network or the rest of the phone is left out: url() other than a
// data: picture, image-set(), @import, @font-face and every other at-rule but @media, @supports and @keyframes,
// position:fixed, expression(), behavior, -moz-binding, and escapes outside strings. No DOM here.

import {promptText} from './prompt-rules.js';

export const BUBBLE_LIMITS = Object.freeze({sets: 20, css: 30000, name: 20, all: 400000, wish: 300});
const SET_ID = /^bset-[a-z0-9]{4,40}$/;
const newId = () => 'bset-' + (globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 16) || Math.random().toString(36).slice(2, 14));

// ---------- templates: different for the two sides, each a starting point ----------
const T = (...lines) => lines.join('\n');
export const BUBBLE_TEMPLATES = Object.freeze([
  {key: 'cream', name: '奶油', me: T(
    '/* 我的气泡。.bubble 就是气泡本身；.bubble::before、.bubble::after 可以加装饰 */',
    '.bubble {',
    '  background: linear-gradient(135deg, #ffbfd0, #ff8fab);',
    '  color: #fff;',
    '  border-radius: 18px 18px 4px 18px;',
    '  padding: 9px 14px;',
    '  box-shadow: 0 4px 12px rgba(255, 120, 150, .35);',
    '  text-shadow: 0 1px 0 rgba(0, 0, 0, .08);',
    '}'), them: T(
    '/* 对方的气泡 */',
    '.bubble {',
    '  background: #fffaf3;',
    '  color: #5b4636;',
    '  border-radius: 18px 18px 18px 4px;',
    '  padding: 9px 14px;',
    '  box-shadow: inset 0 0 0 1.5px #f1dcc6, 0 3px 10px rgba(160, 120, 80, .12);',
    '}')},
  {key: 'comic', name: '漫画', me: T(
    '/* 我的气泡：粗描边、错位阴影，右下角一个小尾巴 */',
    '.bubble {',
    '  background: #ffe45c;',
    '  color: #222;',
    '  border: 2.5px solid #222;',
    '  border-radius: 16px;',
    '  box-shadow: 4px 4px 0 #222;',
    '  font-weight: 600;',
    '}',
    '.bubble::after {',
    '  content: "";',
    '  position: absolute;',
    '  right: -8px;',
    '  bottom: 9px;',
    '  width: 11px;',
    '  height: 11px;',
    '  background: #ffe45c;',
    '  border-right: 2.5px solid #222;',
    '  border-bottom: 2.5px solid #222;',
    '  transform: rotate(-45deg);',
    '}'), them: T(
    '/* 对方的气泡：白底，小尾巴在左下 */',
    '.bubble {',
    '  background: #fff;',
    '  color: #222;',
    '  border: 2.5px solid #222;',
    '  border-radius: 16px;',
    '  box-shadow: -4px 4px 0 #222;',
    '}',
    '.bubble::after {',
    '  content: "";',
    '  position: absolute;',
    '  left: -8px;',
    '  bottom: 9px;',
    '  width: 11px;',
    '  height: 11px;',
    '  background: #fff;',
    '  border-left: 2.5px solid #222;',
    '  border-bottom: 2.5px solid #222;',
    '  transform: rotate(45deg);',
    '}')},
  {key: 'letter', name: '信纸', me: T(
    '/* 我的气泡：蓝色横线信纸，顶上贴一条胶带 */',
    '.bubble {',
    '  background: repeating-linear-gradient(#eef6ff 0 22px, #c9defa 22px 23px);',
    '  color: #2f4b75;',
    '  border-radius: 6px;',
    '  padding: 9px 14px;',
    '  line-height: 23px;',
    '  box-shadow: 0 2px 6px rgba(47, 75, 117, .18);',
    '}',
    '.bubble::before {',
    '  content: "";',
    '  position: absolute;',
    '  top: -7px;',
    '  left: 50%;',
    '  width: 38px;',
    '  height: 14px;',
    '  margin-left: -19px;',
    '  background: rgba(255, 196, 120, .75);',
    '  transform: rotate(-4deg);',
    '}'), them: T(
    '/* 对方的气泡：米色信纸，粉色胶带 */',
    '.bubble {',
    '  background: repeating-linear-gradient(#fffaf0 0 22px, #efdcbf 22px 23px);',
    '  color: #6a4b2a;',
    '  border-radius: 6px;',
    '  padding: 9px 14px;',
    '  line-height: 23px;',
    '  box-shadow: 0 2px 6px rgba(106, 75, 42, .16);',
    '}',
    '.bubble::before {',
    '  content: "";',
    '  position: absolute;',
    '  top: -7px;',
    '  left: 14px;',
    '  width: 34px;',
    '  height: 14px;',
    '  background: rgba(255, 160, 190, .7);',
    '  transform: rotate(5deg);',
    '}')},
]);
export const templateOf = key => BUBBLE_TEMPLATES.find(t => t.key === key) || BUBBLE_TEMPLATES[0];

// ---------- the sets ----------
const css = value => String(value ?? '').replace(/\r\n?/g, '\n').slice(0, BUBBLE_LIMITS.css);
export function normalizeBubbleSet(s, now = Date.now()) {
  return {id: SET_ID.test(s?.id) ? s.id : newId(), name: String(s?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, BUBBLE_LIMITS.name) || '我的气泡',
    me: css(s?.me), them: css(s?.them), at: Number.isFinite(s?.at) && s.at > 0 ? s.at : now};
}
/** At most 20 sets, all of them together not over 400,000 characters; one id once. */
export function normalizeBubbleSets(list) {
  const out = [], seen = new Set();
  let total = 0;
  for (const raw of Array.isArray(list) ? list : []) {
    const set = normalizeBubbleSet(raw);
    if (seen.has(set.id) || (total += set.me.length + set.them.length) > BUBBLE_LIMITS.all) continue;
    seen.add(set.id); out.push(set);
    if (out.length >= BUBBLE_LIMITS.sets) break;
  }
  return out;
}
/** Whose set is whose: {person: set id}, by the person's own key (同名角色 of different cards apart). */
export function normalizeBubbleOf(value) {
  const out = {};
  for (const [who, id] of Object.entries(value && typeof value === 'object' ? value : {}).slice(0, 400)) if (who && SET_ID.test(id)) out[String(who).slice(0, 80)] = id;
  return out;
}
export const wornSet = bubble => /^custom:(bset-[a-z0-9]{4,40})$/.exec(String(bubble || ''))?.[1] || '';

// ---------- reading CSS ----------
/** Splits at `sep` where it is outside (), [] and strings. */
function splitTop(text, sep) {
  const out = [];
  let depth = 0, quote = '', start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth) depth--;
    else if (c === sep && !depth) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out;
}
/** The items of a sheet or a rule's body: {prelude, body} for `prelude { body }`, {prelude} for what ends in `;`. */
function items(text) {
  const out = [];
  let start = 0, quote = '', paren = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') paren++;
    else if (c === ')' && paren) paren--;
    else if (paren) continue;
    else if (c === ';') { const p = text.slice(start, i).trim(); if (p) out.push({prelude: p}); start = i + 1; }
    else if (c === '}') start = i + 1;
    else if (c === '{') {
      let depth = 1, j = i + 1, q = '';
      for (; j < text.length && depth; j++) {
        const x = text[j];
        if (q) { if (x === '\\') j++; else if (x === q) q = ''; continue; }
        if (x === '"' || x === "'") q = x; else if (x === '{') depth++; else if (x === '}') depth--;
      }
      out.push({prelude: text.slice(start, i).trim(), body: text.slice(i + 1, depth ? j : j - 1)});
      start = i = j;
      i--;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push({prelude: rest});
  return out;
}
const PICTURE = /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i;
const URL_CALL = /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
/** Whether a value fetches nothing: every url() a data: picture, no image-set() or src(), no escape outside a string. */
function fetchesNothing(value) {
  const calls = (value.match(/url\s*\(/gi) || []).length;
  let read = 0;
  for (const m of value.matchAll(URL_CALL)) { read++; if (!PICTURE.test(String(m[1] ?? m[2] ?? m[3] ?? '').trim())) return false; }
  if (read !== calls) return false;
  const bare = value.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  return !/\\|image-set\s*\(|(?:^|[^-\w])src\s*\(|expression\s*\(|javascript:|vbscript:/i.test(bare);
}
/** The declarations of a rule that can stay, with the set's @keyframes names in its animations. */
function declarations(list, names, dropped) {
  const out = [];
  for (const raw of list) {
    const at = raw.indexOf(':'), prop = raw.slice(0, at).trim().toLowerCase(), value = raw.slice(at + 1).trim();
    if (at < 1 || !value || !/^(?:--[\w-]+|-?[a-z][a-z-]*)$/.test(prop)) continue;
    if (/^(?:behavior|-moz-binding|-ms-behavior)$/.test(prop)) { dropped.add('不安全的写法'); continue; }
    if (!fetchesNothing(value)) { dropped.add(/url\s*\(|image-set|src\s*\(/i.test(value) ? '外部图片或网址（只能用 data: 开头的内嵌图片）' : '不安全的写法'); continue; }
    if (prop === 'position' && /\bfixed\b/i.test(value)) { dropped.add('position: fixed'); continue; }
    out.push(`${prop}:${/^(?:-webkit-)?animation(?:-name)?$/.test(prop) ? value.replace(/-?[_a-zA-Z][-\w]*/g, w => names.get(w) || w) : value}`);
  }
  return out.join(';');
}
/**
 * One selector under the set's. `.bubble` (or `&`, or in a nested rule the rule it is in) at its start is the bubble;
 * a selector that begins otherwise is taken as something inside the bubble. So what it styles is always the bubble,
 * what is in it or beside it in its message — never the rest of the phone (`:has(.bubble) .x` would have been).
 */
function scoped(selector, scope, parent) {
  const s = selector.trim(), base = parent || scope;
  if (!s) return '';
  const own = parent ? s : s.replace(/^\.bubble(?![\w-])/, '&');
  return (own.startsWith('&') ? base + own.slice(1) : `${base} ${own}`).replace(/&|\.bubble(?![\w-])/g, base);
}
const FRAME = /^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d+(?:\.\d+)?%))*$/i;
function walk(list, out, {scope, names, dropped, parent = '', depth = 0}) {
  if (depth > 5) return;
  for (const {prelude, body} of list) {
    if (body === undefined) { if (/^@/.test(prelude)) dropped.add(prelude.match(/^@[-\w]+/)?.[0] || '@'); continue; }
    const at = /^@([-\w]+)\s*([\s\S]*)$/.exec(prelude);
    if (at) {
      const name = at[1].toLowerCase(), rest = at[2].trim();
      if (name === 'media' || name === 'supports') {
        const inner = [];
        walk(items(body), inner, {scope, names, dropped, parent, depth: depth + 1});
        if (inner.length && !/[{};\\]/.test(rest)) out.push(`@${name} ${rest}{${inner.join('')}}`);
      } else if (/^(?:-webkit-)?keyframes$/.test(name) && names.has(rest)) {
        const frames = items(body).filter(b => b.body !== undefined && FRAME.test(b.prelude)).map(b => `${b.prelude}{${declarations(splitTop(b.body, ';'), names, dropped)}}`);
        out.push(`@keyframes ${names.get(rest)}{${frames.join('')}}`);
      } else dropped.add('@' + name);
      continue;
    }
    const selectors = splitTop(prelude, ',').map(s => scoped(s, scope, parent)).filter(Boolean);
    if (!selectors.length || selectors.some(s => /[{}]/.test(s))) continue;
    const inner = items(body), own = declarations(inner.filter(b => b.body === undefined).map(b => b.prelude), names, dropped);
    if (own) out.push(`${selectors.join(',')}{${own}}`);
    const nested = inner.filter(b => b.body !== undefined);
    if (nested.length) for (const sel of selectors) walk(nested, out, {scope, names, dropped, parent: sel, depth: depth + 1});
  }
}
/**
 * One side's CSS as rules that reach only its bubbles: {css, dropped} — dropped, what was left out (for a word under
 * the box). scope: the selector of those bubbles; id: what the set's @keyframes names begin with.
 */
export function scopeBubbleCss(text, {scope, id}) {
  const source = css(text).replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' '), names = new Map(), dropped = new Set(), out = [];
  for (const m of source.matchAll(/@(?:-webkit-)?keyframes\s+(-?[_a-zA-Z][-\w]*)/g)) names.set(m[1], `${id}-${m[1]}`);
  walk(items(source), out, {scope, names, dropped});
  return {css: (out.length ? `${scope}{position:relative}` : '') + out.join('\n'), dropped: [...dropped]};
}
/** The selectors of a set's two sides in a chat: rows marked data-bset with the set's id, the user's and the others'. */
export const bubbleScope = (id, side) => `.chat-thread .msg.msg[data-bset="${id}"]${side === 'me' ? '.me' : ':not(.me)'} .chat-bubble`;
/** Both sides of a set, ready for a <style>. */
export function setStyles(set, id = set.id) {
  const me = scopeBubbleCss(set.me, {scope: bubbleScope(id, 'me'), id: id + '-m'}), them = scopeBubbleCss(set.them, {scope: bubbleScope(id, 'them'), id: id + '-t'});
  return {css: me.css + '\n' + them.css, dropped: [...new Set([...me.dropped, ...them.dropped])]};
}

// ---------- 让模型改 (the 自定义气泡 block of 系统提示词) ----------
/** side: 'me' or 'them' to change only that one ('' both). */
export function bubbleRequest({prompts = {}, user = '我', me = '', them = '', side = '', wish = ''}) {
  const values = {'用户': user, '我的': css(me).trim() || '（还没写）', '对方的': css(them).trim() || '（还没写）', '只改': side === 'me' ? '我的' : side === 'them' ? '对方的' : '',
    '想要': String(wish ?? '').replace(/\s+/g, ' ').trim().slice(0, BUBBLE_LIMITS.wish)};
  return [{role: 'system', content: promptText(prompts, 'bubble', 'system', values)}, {role: 'user', content: promptText(prompts, 'bubble', 'ask', values)}];
}
/** The same words as one text to give another AI (复制给别的 AI); its answer pasted back is read by splitBubbleAnswer. */
export const bubblePromptText = options => bubbleRequest({...options, wish: options.wish || '（在这里写你想要的样子）'}).map(m => m.content).join('\n\n');

// ---------- written elsewhere ----------
/**
 * Both sides from one text: an answer of a model (here or another AI's, pasted), or a file — <me>…</me> and
 * <them>…</them> (also <我的>/<对方的>), the inside of a ```css fence taken. null when it holds neither.
 */
export function splitBubbleAnswer(text) {
  const body = String(text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  const part = names => { for (const n of names) { const m = body.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`, 'i')); if (m) return m[1].replace(/^\s*```[\w-]*[ \t]*\n?/, '').replace(/\n?```\s*$/, '').trim(); } return null; };
  const me = part(['me', '我的']), them = part(['them', '对方的']);
  return me === null && them === null ? null : {me: me ?? '', them: them ?? ''};
}
/** A file of sets (导出): {kind, sets: [{name, me, them}]}. */
export const BUBBLE_FILE = 'st-iphonie-bubbles';
export const bubbleFile = sets => JSON.stringify({kind: BUBBLE_FILE, version: 1, sets: sets.map(s => ({name: s.name, me: s.me, them: s.them}))}, null, 2);
/** The sets in a file someone gives: one of ours, or a text with <me> and <them>. New ids; [] when it holds none. */
export function readBubbleFile(text, name = '') {
  let data = null;
  try { data = JSON.parse(String(text ?? '')); } catch { /* text, below */ }
  const list = data?.kind === BUBBLE_FILE && Array.isArray(data.sets) ? data.sets : data && typeof data === 'object' && ('me' in data || 'them' in data) ? [data] : null;
  if (list) return list.filter(s => s && typeof s === 'object' && (String(s.me || '').trim() || String(s.them || '').trim())).slice(0, BUBBLE_LIMITS.sets).map(s => normalizeBubbleSet({name: s.name || name, me: s.me, them: s.them}));
  const split = splitBubbleAnswer(text);
  return split && (split.me || split.them) ? [normalizeBubbleSet({name, ...split})] : [];
}
