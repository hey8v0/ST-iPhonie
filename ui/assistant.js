import {createView, esc, btn, heading, field, select, toggle, copyText, menu} from './common.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {openImageViewer} from '../image-viewer.js';
import {downloadAction, shareAction} from '../download.js';
import {ASSISTANT_FILE_ACCEPT} from '../assistant-files.js';
import {ASSISTANT_IMAGE_SLOT, ASSISTANT_LIMITS, ASSISTANT_WANTS_MUSIC, assistantAttachments, assistantThoughts} from '../core/assistant.js';
import {songOf} from '../core/music.js';
import {icon, glyph} from './icons.js';
import {assistantMarkdown, assistantHTMLMarkdown} from './assistant-markdown.js';
import {parsePictures} from '../core/draw.js';
import {normalizeMemory} from '../core/memory.js';
import {memorySheet} from './chat-memory.js';

// Model HTML never enters the phone document. The preview has an opaque origin;
// scripts can manipulate their own document, but cannot access the host or make API requests.
export function assistantPreviewDocument(html, {auto = false, theme = {}, dark = false} = {}) {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https:; img-src data: https:; font-src data: https:; media-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
  const themeCSS = Object.entries(theme).filter(([key, value]) => /^--[a-zA-Z0-9-]+$/.test(key) && /^[#(),.%\w\s-]+$/.test(value)).map(([key, value]) => `${key}:${value}`).join(';');
  const themeSync = `<script>addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='assistant-theme')return;const root=document.documentElement;root.style.colorScheme=event.data.dark?'dark':'light';for(const [key,value] of Object.entries(event.data.theme||{})){if(/^--SmartTheme[A-Za-z]+Color$/.test(key)&&typeof value==='string'&&/^[#(),.%\\w\\s-]+$/.test(value))root.style.setProperty(key,value);}});</script>`;
  const sizing = auto ? `<script>(()=>{let queued=false,last=0;const send=()=>{queued=false;const body=document.body,box=body.getBoundingClientRect(),style=getComputedStyle(body),range=document.createRange();range.selectNodeContents(body);const content=range.getBoundingClientRect();const height=Math.max(24,Math.ceil(Math.max(box.bottom,content.bottom)+Math.max(0,parseFloat(style.marginBottom)||0)));if(height!==last){last=height;parent.postMessage({type:'assistant-html-size',height},'*');}};const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(send);}};new ResizeObserver(schedule).observe(document.body);new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});addEventListener('load',schedule,true);addEventListener('resize',schedule);document.fonts?.ready.then(schedule);schedule();})();</script>` : '';
  // A widget hands the user's choice back to the chat (iphonie.send); the phone takes it only after a tap in this frame.
  const bridge = `<script>window.iphonie=Object.freeze({send:text=>parent.postMessage({type:'assistant-send',text:String(text||'').slice(0,500)},'*')});</script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(policy)}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--ink:var(--SmartThemeBodyColor,#25314b);--muted:var(--SmartThemeEmColor,#65718a);--accent:var(--SmartThemeQuoteColor,#7dadd6);--accent-ink:var(--SmartThemeUnderlineColor,#2d6392);--line:var(--SmartThemeBorderColor,#dce5ef);--card:var(--SmartThemeBlurTintColor,#fff)}${auto ? "html,body{height:auto!important;min-height:0!important}" : ""}html{color-scheme:${dark ? 'dark' : 'light'};background:var(--SmartThemeChatTintColor,#fff);${themeCSS}}body{display:flow-root;background:var(--SmartThemeChatTintColor,#fff);margin:${auto ? 0 : 12}px;color:var(--SmartThemeBodyColor,#25314b);font:14px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}img,video,canvas,svg{max-width:100%}button,input,textarea,select{font:inherit}pre{white-space:pre-wrap}p{margin:.65em 0}p:first-child{margin-top:0}p:last-child{margin-bottom:0}h1,h2,h3,h4,h5,h6{line-height:1.4;margin:.9em 0 .45em}ul,ol{padding-left:1.5em;margin:.6em 0}li{margin:.25em 0}blockquote{margin:.6em 0;padding-left:1em;border-left:2px solid var(--SmartThemeQuoteColor,#7dadd6)}table{border-collapse:collapse;max-width:100%}td,th{padding:4px 8px;border:1px solid var(--SmartThemeBorderColor,#dce5ef)}</style>${bridge}</head><body>${themeSync}${String(html)}${sizing}</body></html>`;
}

/** Keep every part of a mixed reply; only explicitly labelled HTML fences become previews. */
export function assistantParts(text, {beautified = false} = {}) {
  const value = String(text || ''), parts = [];
  const fences = /```([^\n`]*)\n([\s\S]*?)```/g;
  let at = 0, match;
  while ((match = fences.exec(value))) {
    if (match.index > at) parts.push({kind: 'text', text: value.slice(at, match.index)});
    const language = match[1].trim(), only = parsePictures(match[2]).filter(t => t.spec);
    const kind = /^html?$/i.test(language) ? 'html' : visualFence(language, match[2]) ? 'ui' : only.length === 1 && !match[2].slice(0, only[0].start).trim() && !match[2].slice(only[0].end).trim() ? 'picture' : 'code';
    parts.push({kind, language, text: kind === 'ui' || kind === 'picture' ? match[2].trim() : match[2]});
    at = fences.lastIndex;
  }
  if (at < value.length) parts.push({kind: 'text', text: value.slice(at)});
  if (!parts.length) parts.push({kind: 'text', text: value});
  // <content> is a story envelope, even when prose inside contains HTML-looking tags.
  // Only a real HTML root or an explicitly labelled HTML fence gets the interactive preview.
  const expanded = []; let story = false;
  for (const part of parts) {
    if (part.kind === 'html' && /^\s*<content\b/i.test(part.text)) part.kind = 'text';
    if (part.kind !== 'text') { expanded.push(part); continue; }
    const wrapper = /`[^`\n]*`|<\/?content\b[^>]*>/gi;
    let cursor = 0, found;
    while ((found = wrapper.exec(part.text))) {
      if (found[0].startsWith('`')) continue;
      if (found.index > cursor) expanded.push({kind: 'text', text: part.text.slice(cursor, found.index), ...(story ? {story: true} : {})});
      story = !found[0].startsWith('</'); cursor = wrapper.lastIndex;
    }
    if (cursor < part.text.length) expanded.push({kind: 'text', text: part.text.slice(cursor), ...(story ? {story: true} : {})});
  }
  // 出图块 (<img>…</img> with 画幅/场景/角色 lines) in the reply become picture cards.
  const pictured = [];
  for (const part of expanded) {
    const blocks = part.kind === 'text' && !part.story ? parsePictures(part.text).filter(t => t.spec) : [];
    if (!blocks.length) { pictured.push(part); continue; }
    let from = 0;
    for (const t of blocks) {
      if (t.start > from) pictured.push({kind: 'text', text: part.text.slice(from, t.start)});
      pictured.push({kind: 'picture', text: part.text.slice(t.start, t.end)}); from = t.end;
    }
    if (from < part.text.length) pictured.push({kind: 'text', text: part.text.slice(from)});
  }
  // 「[放歌] 歌名 - 歌手｜一句话」 lines become song cards.
  const sung = [], line = /^[ \t]*(?:[-*>][ \t]*)?\[(?:放歌|点歌|分享歌曲|歌曲)\][ \t]*([^\n]+?)[ \t]*$/gm;
  for (const part of pictured) {
    if (part.kind !== 'text' || part.story) { sung.push(part); continue; }
    let from = 0, found;
    line.lastIndex = 0;
    while ((found = line.exec(part.text))) {
      const [what, ...note] = found[1].split(/[|｜]/), song = songOf(what);
      if (!song.title) continue;
      if (found.index > from) sung.push({kind: 'text', text: part.text.slice(from, found.index)});
      sung.push({kind: 'song', text: found[0].trim(), song, note: note.join('｜').trim()});
      from = line.lastIndex;
    }
    if (from < part.text.length) sung.push({kind: 'text', text: part.text.slice(from)});
  }
  expanded.splice(0, expanded.length, ...sung.filter(part => part.kind !== 'text' || part.text.trim() || sung.length === 1));
  for (const part of expanded) if (part.kind === 'text' && !part.story && /^\s*<(?:!doctype\s+html|html|head|body|div|section|article|button|script|style|form|table|canvas|svg|p|span|h[1-6]|ul|ol|details|a|img)\b/i.test(part.text)) part.kind = 'html';

  if (beautified) for (const part of expanded) {
    if (part.kind === 'text' && /<(?:div|section|article|button|script|style|form|table|canvas|svg|p|span|h[1-6]|ul|ol|details|a|img)\b/i.test(part.text.replace(/`[^`\n]*`/g, ''))) part.kind = 'html';
    if (part.kind === 'html') part.auto = true;
  }
  return expanded;
}

export function assistantVoiceLines(api, text) {
  return assistantParts(assistantThoughts(text).text).flatMap(part => partVoiceLines(api, part));
}

function partVoiceLines(api, part) {
  if (part.kind === 'picture' || part.kind === 'ui' || part.kind === 'song') return [];
  if (part.kind === 'code' && !/^(?:tts|text|plaintext)?$/i.test(part.language)) return [];
  // Mask non-dialogue HTML without changing offsets. Generated HTML always stays in the iframe.
  const sample = part.kind === 'html' ? part.text.replace(/<!--[^]*?(?:-->|$)|<(script|style)\b[^>]*>[^]*?(?:<\/\1\s*>|$)/gi, value => ' '.repeat(value.length)) : part.text;
  let lines; try { lines = api.parse(sample)?.lines || []; } catch { return []; }
  let end = 0;
  return [...lines].sort((a, b) => a.start - b.start).filter(line => {
    if (!Number.isInteger(line.start) || !Number.isInteger(line.end) || line.start < end || line.end <= line.start || line.end > sample.length) return false;
    end = line.end; return true;
  });
}

const prose = assistantMarkdown;

/** Use parser offsets rather than a tag regex, so custom dialogue formats render too. */
function inlineDialogue(part, lines, attrs, offset) {
  const utterance = (line, i) => `<span class="assistant-utterance">“${esc(line.translation || line.text)}”<button type="button" class="assistant-wave" data-action="voice-line" ${attrs} data-line="${offset + i}" aria-label="朗读 ${esc(line.role || '旁白')} 的台词" title="朗读 ${esc(line.role || '旁白')} 的台词"><span aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></button></span>`;
  if (part.kind === 'html') return lines.map(utterance).join('\n');
  let out = '', at = 0, marker = 'IPHONIEVOICE';
  while (part.text.includes(marker)) marker += 'X';
  lines.forEach((line, i) => { out += part.text.slice(at, line.start) + `${marker}${i}END`; at = line.end; });
  out = prose(out + part.text.slice(at));
  return out.replace(new RegExp(marker + '(\\d+)END', 'g'), (_, i) => utterance(lines[Number(i)], Number(i)));
}

// ---------- 出图块 cards and 智能界面 ----------
const VISUAL_TYPES = ['choices', 'cards', 'compare', 'steps', 'checklist', 'timeline', 'stats', 'bars', 'quiz', 'form', 'tip'];
/**
 * A ```ui block's JSON, forgiving what models often get wrong: “curly” quotes as delimiters, // comments on their own
 * line, a comma before } or ], several objects one after another instead of an array. null when still unreadable.
 */
export function looseVisual(raw) {
  const text = String(raw || '').trim();
  const tries = [text];
  const fixed = text.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
  tries.push(fixed, fixed.replace(/[“”]/g, '"'), '[' + fixed.replace(/}\s*\n\s*{/g, '},{') + ']', '[' + fixed.replace(/[“”]/g, '"').replace(/}\s*\n\s*{/g, '},{') + ']');
  for (const attempt of tries) { try { return JSON.parse(attempt); } catch { /* next */ } }
  return null;
}
const visualFence = (language, body) => /^(?:ui|json\s*ui|ui\s*json|ui-?json|intelligent[-\s]?ui)$/i.test(language.trim()) || (/^(?:json|json5|javascript|js)?$/i.test(language.trim()) && looksVisual(body));
/**
 * The tavern's display regex (beautifying cards, quote bubbles…) is meant for prose: run over a ```ui block or an
 * 出图块 it breaks them (a quote rule wrapping every "…" in a <span>). They are set aside while it runs.
 */
export function shieldVisuals(text, display) {
  const kept = [];
  let marker = 'IPHONIEKEEP';
  while (String(text).includes(marker)) marker += 'X';
  const hold = value => { kept.push(value); return `${marker}${kept.length - 1}END`; };
  let out = String(text).replace(/```([^\n`]*)\n([\s\S]*?)```/g, (all, language, body) => visualFence(language, body) || /^html?$/i.test(language.trim()) ? hold(all) : all);
  for (const t of parsePictures(out).filter(t => t.spec).reverse()) out = out.slice(0, t.start) + hold(out.slice(t.start, t.end)) + out.slice(t.end);
  if (!kept.length) return display(text);
  return String(display(out)).replace(new RegExp(marker + '(\\d+)END', 'g'), (all, i) => kept[Number(i)] ?? all);
}
function looksVisual(raw) {
  const value = looseVisual(raw);
  return (Array.isArray(value) ? value : [value]).some(x => x && typeof x === 'object' && VISUAL_TYPES.includes(x.type));
}
const str = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : Number.isFinite(value) ? String(value) : '';
const list = (value, max) => Array.isArray(value) ? value.slice(0, max) : [];
/** A song the reply puts on: a card like the chat's; a tap plays it (and the cards after it). */
export function assistantSongHTML(part, attrs = '') {
  const {title, artist} = part.song;
  return `<button type="button" class="song-card aui-song" data-action="as-song" ${attrs} aria-label="播放 ${esc(title)}"><span class="sg-disc" aria-hidden="true">${icon('music')}</span><span class="sg-text"><strong>${esc(title)}</strong>${artist ? `<small>${esc(artist)}</small>` : ''}${part.note ? `<em>${esc(part.note)}</em>` : ''}</span><span class="sg-play" aria-hidden="true">${icon('play', true)}</span></button>`;
}

const SIZE_NAMES = {竖: '竖图', 横: '横图', 方: '方图', portrait: '竖图', landscape: '横图', square: '方图'};
/** An 出图块 as a card: what it draws, 复制 and 画这张. */
export function assistantPictureHTML(text, attrs = '', {live = false} = {}) {
  const [tag] = parsePictures(text).filter(t => t.spec);
  if (!tag) return `<pre class="assistant-code"><code>${esc(text)}</code></pre>`;
  const spec = tag.spec, size = SIZE_NAMES[String(spec.size || '').trim().split(/\s*[/／]\s*/)[0]] || (spec.size ? spec.size : '竖图');
  const row = (label, body) => `<div class="aui-pic-row"><span>${esc(label)}</span><p>${body}</p></div>`;
  return `<div class="aui aui-pic"><div class="aui-pic-head">${icon('image')}<strong>出图块</strong><span class="aui-tag">${esc(size)}</span></div>`
    + (spec.tags ? row('场景', esc(spec.tags)) : '')
    + spec.cast.map(c => row(c.name, `${esc(c.tags)}${c.negative ? `<small>不要：${esc(c.negative)}</small>` : ''}${c.position ? `<small>站位 ${esc(c.position)}</small>` : ''}`)).join('')
    + spec.register.map(r => row('新外貌', `<b>${esc(r.name)}</b> ${esc(r.appearance)}`)).join('')
    + (live ? '' : `<div class="aui-tools">${btn('pic-copy', icon('copy') + '复制', 'text-button', attrs)}${btn('pic-draw', icon('paint') + '画这张', 'aui-go', attrs)}</div>`)
    + '</div>';
}
function visualPiece(x, attrs, key) {
  const title = str(x.title, 80) ? `<p class="aui-title">${esc(str(x.title, 80))}</p>` : '';
  const send = (text, inner, cls = 'aui-chip') => `<button type="button" class="${cls}" data-action="ui-send" ${attrs} data-text="${esc(text)}">${inner}</button>`;
  switch (x.type) {
    case 'choices': {
      const options = list(x.options, 8).map(o => str(o, 80)).filter(Boolean);
      return options.length ? `<div class="aui aui-choices">${title}<div class="aui-chips">${options.map(o => send(o, esc(o))).join('')}</div></div>` : '';
    }
    case 'cards': {
      const items = list(x.items, 8).filter(i => i && str(i.title, 60));
      if (!items.length) return '';
      return `<div class="aui aui-cards-wrap">${title}<div class="aui-cards">${items.map(i => {
        const inner = `<strong>${esc(str(i.title, 60))}</strong>${str(i.text, 240) ? `<span>${esc(str(i.text, 240))}</span>` : ''}${list(i.tags, 6).map(t => str(t, 20)).filter(Boolean).length ? `<span class="aui-tags">${list(i.tags, 6).map(t => str(t, 20)).filter(Boolean).map(t => `<i>${esc(t)}</i>`).join('')}</span>` : ''}`;
        return str(i.send, 300) ? send(str(i.send, 300), inner, 'aui-card') : `<div class="aui-card">${inner}</div>`;
      }).join('')}</div></div>`;
    }
    case 'compare': {
      const columns = list(x.columns, 5).map(c => str(c, 40)), rows = list(x.rows, 12).filter(Array.isArray).map(r => r.slice(0, columns.length || 5).map(c => str(c, 120)));
      if (!rows.length) return '';
      return `<div class="aui aui-compare">${title}<div class="aui-table"><table>${columns.some(Boolean) ? `<thead><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    }
    case 'steps': {
      const items = list(x.items, 12).map(i => str(typeof i === 'object' && i ? i.text || i.title : i, 240)).filter(Boolean);
      return items.length ? `<div class="aui aui-steps">${title}<ol>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ol></div>` : '';
    }
    case 'form': {
      const fields = list(x.fields, 6).filter(f => f && str(f.label, 40));
      if (!fields.length) return '';
      return `<div class="aui aui-form" data-form-title="${esc(str(x.title, 80))}">${title}${fields.map((f, n) => {
        const label = str(f.label, 40), options = list(f.options, 8).map(o => str(o, 40)).filter(Boolean);
        return `<div class="aui-field" data-label="${esc(label)}"><span>${esc(label)}</span>${options.length
          ? `<div class="aui-chips">${options.map(o => `<label class="aui-chip aui-pick"><input type="radio" name="aui-${esc(key)}-${n}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div>`
          : `<input type="text" maxlength="200" placeholder="${esc(str(f.placeholder, 60))}" aria-label="${esc(label)}">`}</div>`;
      }).join('')}<div class="aui-tools">${btn('ui-form', esc(str(x.submit, 20) || '发送'), 'aui-go', attrs)}</div></div>`;
    }
    case 'checklist': {
      const items = list(x.items, 15).map(i => str(typeof i === 'object' && i ? i.text || i.title : i, 160)).filter(Boolean);
      return items.length ? `<div class="aui aui-check">${title}${items.map(i => `<label class="aui-check-row"><input type="checkbox"><span>${esc(i)}</span></label>`).join('')}</div>` : '';
    }
    case 'timeline': {
      const items = list(x.items, 12).filter(i => i && (str(i.text, 200) || str(i.title, 80)));
      return items.length ? `<div class="aui aui-timeline">${title}<ol>${items.map(i => `<li><b>${esc(str(i.time, 30) || str(i.title, 30))}</b><span>${esc(str(i.text, 200) || (str(i.time, 30) ? str(i.title, 80) : ''))}</span></li>`).join('')}</ol></div>` : '';
    }
    case 'stats': {
      const items = list(x.items, 6).filter(i => i && str(i.label, 20) && str(i.value, 20));
      return items.length ? `<div class="aui aui-stats-wrap">${title}<div class="aui-stats">${items.map(i => `<div class="aui-stat"><b>${esc(str(i.value, 20))}</b><span>${esc(str(i.label, 20))}</span>${str(i.note, 40) ? `<small>${esc(str(i.note, 40))}</small>` : ''}</div>`).join('')}</div></div>` : '';
    }
    case 'quiz': {
      const options = list(x.options, 6).map(o => str(o, 80)).filter(Boolean), answer = Number(x.answer);
      if (!str(x.question, 200) || options.length < 2) return '';
      return `<div class="aui aui-quiz" data-answer="${Number.isInteger(answer) && answer >= 0 && answer < options.length ? answer : -1}"><p class="aui-title">${esc(str(x.question, 200))}</p><div class="aui-quiz-options">${options.map((o, n) => `<button type="button" class="aui-chip" data-action="ui-quiz" data-n="${n}">${esc(o)}</button>`).join('')}</div>${str(x.explain, 300) ? `<p class="aui-explain" hidden>${esc(str(x.explain, 300))}</p>` : ''}</div>`;
    }
    case 'bars': {
      const items = list(x.items, 12).filter(i => i && str(i.label, 30) && Number.isFinite(Number(i.value)));
      if (!items.length) return '';
      const most = Math.max(...items.map(i => Math.abs(Number(i.value))), 1), unit = str(x.unit, 10);
      return `<div class="aui aui-bars">${title}${items.map(i => `<div class="aui-bar"><span>${esc(str(i.label, 30))}</span><i style="--w:${Math.round(Math.abs(Number(i.value)) / most * 100)}%"></i><b>${esc(String(Number(i.value)))}${esc(unit)}</b></div>`).join('')}</div>`;
    }
    case 'tip': {
      const text = str(x.text, 300);
      return text ? `<div class="aui aui-tip" data-tone="${x.tone === 'warn' ? 'warn' : 'info'}">${icon(x.tone === 'warn' ? 'alert' : 'star')}<span>${esc(text)}</span></div>` : '';
    }
    default: return '';
  }
}
/** A ```ui block as native pieces; anything unreadable stays a code block. */
export function assistantVisualHTML(raw, attrs = '', key = '') {
  const value = looseVisual(raw);
  if (!value) return `<pre class="assistant-code"><code>${esc(raw)}</code></pre>`;
  const html = (Array.isArray(value) ? value : [value]).filter(x => x && typeof x === 'object').slice(0, 5).map((x, i) => visualPiece(x, attrs, `${key}-${i}`)).join('');
  return html ? `<div class="assistant-ui">${html}</div>` : `<pre class="assistant-code"><code>${esc(raw)}</code></pre>`;
}
/** While a reply streams in: a ```ui block or an 出图块 still being written shows as a placeholder, not half a card. */
function streamingParts(text) {
  let body = String(text || ''), pending = '';
  const fences = body.match(/```/g)?.length || 0;
  if (fences % 2) { const at = body.lastIndexOf('```'); if (/^```\s*ui\b/i.test(body.slice(at))) { pending = 'ui'; body = body.slice(0, at); } else if (/^```\s*html?\b/i.test(body.slice(at))) { pending = 'widget'; body = body.slice(0, at); } }
  const open = body.search(/<img\b(?![^>]*\bsrc\s*=)[^>]*>(?![\s\S]*<\/img\s*>)/i);
  if (!pending && open >= 0) { pending = 'picture'; body = body.slice(0, open); }
  return {parts: assistantParts(body), pending};
}

export function assistantApp(ctx) {
  const {api, win} = ctx, v = createView(ctx, 'assistant');
  let active = true, liveClock = null;
  let mode = 'chat', threadId = null, thread = null, epoch = 0, selectionEpoch = 0, presetsEpoch = 0, settings = null;
  let tavern = [], tavernLoading = false, tavernError = '', settingsSaving = false;
  let renderedThreadId = null, renderedMessages = new Map(), renameId = null, editing = null;
  const imageURLs = new Map(), imageLoads = new Set();
  const fileDrafts = new Map(), fileReads = new Set(), displayCache = new Map();
  const attachments = (id = threadId) => fileDrafts.get(id) || [];
  const drafts = new Map(), errors = new Map(), pending = new Map();
  const state = () => api.getState().assistant || {};
  const busy = id => pending.has(id) || !!api.assistantBusy?.(id);
  function closePreviews() {
    for (const slot of v.root.querySelectorAll('[data-preview-mid]')) slot.replaceChildren();
  }
  const draftKey = id => `st-iphonie-assistant-draft:${api.getState().scope || 'local'}:${id || 'new'}`;
  function draft(id = threadId) {
    if (!drafts.has(id)) { let saved = ''; try { saved = win.sessionStorage.getItem(draftKey(id)) || ''; } catch {} drafts.set(id, saved); }
    return drafts.get(id);
  }
  function saveDraft(value, id = threadId) {
    drafts.set(id, value);
    try { if (value) win.sessionStorage.setItem(draftKey(id), value); else win.sessionStorage.removeItem(draftKey(id)); } catch { /* still retained while the phone is open */ }
  }
  function contextCopy(s = state()) {
    if (!s.readContext) return '不读取正文上下文';
    const c = api.assistantContext?.();
    return c?.available ? c.label || '最近一次正文发送快照' : c?.reason || '请先在当前酒馆聊天发送一次正文，完成后再读取快照。';
  }
  function attachmentHTML(files, removable = false) {
    return files.length ? `<div class="assistant-attachments">${files.map((file, i) => `<div class="assistant-attachment">${file.kind === 'image' ? `<img src="${esc(file.data)}" alt="${esc(file.name)}" loading="lazy">` : icon('book')}<span>${esc(file.name)}</span>${removable ? btn('remove-file', icon('close'), 'icon-button', `data-file="${i}" aria-label="移除附件 ${esc(file.name)}"`) : ''}</div>`).join('')}</div>` : '';
  }
  function replyInfo(m) {
    const meta = m.meta || {}, reported = meta.reportedModel?.trim(), model = reported || meta.requestedModel?.trim();
    return `${Number.isFinite(meta.elapsedMs) ? `<span class="assistant-elapsed">· ${(meta.elapsedMs / 1000).toFixed(1)}s</span>` : ''}${model ? `<span class="assistant-model" title="${esc((reported ? '接口报告模型：' : '请求模型：') + model)}">· ${esc(model)}</span>` : ''}`;
  }
  function resizeComposer() {
    const box = v.root.querySelector('[data-assistant-draft]');
    if (!box) return;
    const messages = v.root.querySelector('.assistant-messages'), bottom = messages && messages.scrollHeight - messages.clientHeight - messages.scrollTop < 70;
    const scroll = box.scrollTop, style = win.getComputedStyle(box);
    const minimum = parseFloat(style.minHeight) || 36, maximum = parseFloat(style.maxHeight) || 116;
    const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    box.style.height = 'auto';
    const needed = box.scrollHeight + border;
    box.style.height = `${Math.min(maximum, Math.max(minimum, needed))}px`;
    box.style.overflowY = needed > maximum ? 'auto' : 'hidden'; box.scrollTop = scroll;
    if (bottom) messages.scrollTop = messages.scrollHeight;
  }
  let composerWidth = 0;
  const composerObserver = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(entries => {
    const width = entries[0]?.contentRect.width;
    if (width > 0 && width !== composerWidth) { composerWidth = width; resizeComposer(); }
  }) : null;
  composerObserver?.observe(v.root);
  const editingMessage = m => editing?.threadId === threadId && editing.mid === m.id;
  function userBody(m, attrs) {
    if (!editingMessage(m)) return `<div class="assistant-prose">${esc(m.text)}</div>`;
    return `<div class="assistant-edit"><textarea data-edit-message aria-label="编辑已发送消息" rows="3" maxlength="100000" ${editing.saving ? 'disabled' : ''}>${esc(editing.text)}</textarea><div class="assistant-message-tools">${btn('save-edit', editing.saving ? '保存中' : '保存', 'text-button', `${attrs} ${editing.saving ? 'disabled' : ''}`)}${btn('cancel-edit', '取消', 'text-button', `${attrs} ${editing.saving ? 'disabled' : ''}`)}</div></div>`;
  }
  const thoughtsFor = m => assistantThoughts(m.text, m.meta?.reasoningFormat || api.assistantReasoningFormat?.());
  function displayText(m) {
    const text = m.role === 'assistant' ? thoughtsFor(m).text : m.text;
    const depth = Math.max(0, (thread?.messages.length || 1) - 1 - (thread?.messages.findIndex(row => row.id === m.id) ?? 0));
    const key = JSON.stringify([threadId, m.id, m.text, text, m.role, depth]);
    if (displayCache.get(m.id)?.key !== key) displayCache.set(m.id, {key, text: api.assistantDisplay ? (m.role === 'assistant' ? shieldVisuals(text, value => api.assistantDisplay(value, m.role, depth)) : api.assistantDisplay(text, m.role, depth)) : text});
    return displayCache.get(m.id).text;
  }
  function partsFor(m) {
    const visible = displayText(m);
    const options = {beautified: visible !== thoughtsFor(m).text};
    if (m.meta?.image && options.beautified && visible.includes(ASSISTANT_IMAGE_SLOT)) return assistantParts(visible.replaceAll(ASSISTANT_IMAGE_SLOT, ''), options);
    if (m.meta?.image && visible.includes(ASSISTANT_IMAGE_SLOT)) {
      const at = visible.indexOf(ASSISTANT_IMAGE_SLOT);
      return [...assistantParts(visible.slice(0, at), options), {kind: 'image', text: ''}, ...assistantParts(visible.slice(at + ASSISTANT_IMAGE_SLOT.length), options)];
    }
    return assistantParts(visible, options);
  }
  const imageButton = (m, attrs) => `<div class="assistant-image-wrap"><button class="assistant-image" data-action="image" ${attrs} data-image-photo="${esc(m.meta.image.photoId)}" aria-label="查看生成的图片">正在读取图片…</button>${btn('redraw', icon('refresh'), 'assistant-redraw', `${attrs} aria-label="重新绘制这张图" title="重新绘制这张图（说明文字不变）"`)}</div>`;
  const voiceFor = m => partsFor(m).flatMap(part => partVoiceLines(api, part));
  function messageHTML(m, index, messages) {
    const attrs = `data-mid="${esc(m.id)}"`;
    if (m.role === 'user') return `<article class="assistant-message is-user" ${attrs}>${messages?.[index - 1]?.role === 'user' ? '' : '<span class="assistant-who">我</span>'}<div class="assistant-bubble">${userBody(m, attrs)}${attachmentHTML(m.attachments || [])}</div><details class="assistant-actions" data-group="actions-${esc(m.id)}"><summary aria-label="消息操作" title="消息操作">${icon('more')}</summary><div class="assistant-message-tools">${btn('copy', icon('copy') + '复制原文', 'text-button', attrs)}${btn('edit-message', icon('edit') + '编辑', 'text-button', attrs)}${btn('delete-message', icon('trash') + '删除', 'text-button', attrs)}</div></details></article>`;
    const visible = displayText(m), thoughts = thoughtsFor(m), reasoning = [m.meta?.reasoning?.trim(), thoughts.reasoning].filter(Boolean).filter((value, i, all) => all.indexOf(value) === i).join('\n\n');
    const parts = partsFor(m), lines = voiceFor(m); let offset = 0;
    return `<article class="assistant-message" ${attrs}><span class="assistant-who">${icon('star')}助手${replyInfo(m)}</span><div class="assistant-bubble">${reasoning ? `<details class="assistant-reasoning" data-group="reasoning-${esc(m.id)}"><summary${Number.isFinite(m.meta?.reasoningMs) ? ' title="从请求开始到推理结束的流式观测时间"' : ''}>${Number.isFinite(m.meta?.reasoningMs) ? `思考了 ${(m.meta.reasoningMs / 1000).toFixed(1)} 秒` : '思考内容'}</summary><div class="assistant-prose">${prose(reasoning)}</div></details>` : ''}${parts.map((p, i) => {
      if (p.kind === 'image') return imageButton(m, attrs);
      if (p.kind === 'picture') return assistantPictureHTML(p.text, `${attrs} data-part="${i}"`);
      if (p.kind === 'song') return assistantSongHTML(p, `${attrs} data-part="${i}"`);
      if (p.kind === 'ui') return assistantVisualHTML(p.text, `${attrs} data-part="${i}"`, `${m.id}-${i}`);
      const spoken = partVoiceLines(api, p), rendered = inlineDialogue(p, spoken, attrs, offset); offset += spoken.length;
      if (p.kind === 'text') return `<div class="assistant-prose">${rendered}</div>`;
      if (p.kind === 'code') {
        return spoken.length ? `<div class="assistant-prose">${rendered}</div>` : `<pre class="assistant-code"><code>${esc(p.text)}</code></pre>`;
      }
      const key = `${m.id}:${i}`;
      return `<div class="assistant-html${p.auto ? ' assistant-beautified' : ''}"><div data-preview-mid="${esc(m.id)}" data-preview-part="${i}" data-auto></div>${p.auto ? '' : `<details data-group="source-${esc(key)}"><summary>查看源码</summary><pre class="assistant-code"><code>${esc(p.text)}</code></pre></details>`}</div>${spoken.length ? `<div class="assistant-prose">${rendered}</div>` : ''}`;
    }).join('')}${m.meta?.image && !parts.some(p => p.kind === 'image') ? imageButton(m, attrs) : ''}</div><details class="assistant-actions" data-group="actions-${esc(m.id)}"><summary aria-label="消息操作" title="消息操作">${icon('more')}</summary><div class="assistant-message-tools">${lines.length ? btn('voice-all', icon('wave') + '整条播放', 'text-button', attrs) : ''}${btn('copy', icon('copy') + '复制原文', 'text-button', attrs)}${btn('reroll', icon('refresh') + '重 roll', 'text-button', attrs)}${btn('delete-message', icon('trash') + '删除', 'text-button', attrs)}</div></details>${(m.variants?.length || 1) > 1 ? `<div class="assistant-variants">${btn('variant', '‹', 'icon-button', `${attrs} data-selected="${(m.selected || 0) - 1}" aria-label="上一个回复" ${m.selected > 0 ? '' : 'disabled'}`)}<span>${(m.selected || 0) + 1} / ${m.variants.length}</span>${btn('variant', '›', 'icon-button', `${attrs} data-selected="${(m.selected || 0) + 1}" aria-label="下一个回复" ${(m.selected || 0) < m.variants.length - 1 ? '' : 'disabled'}`)}</div>` : ''}</article>`;
  }
  function mountImages() {
    for (const slot of v.root.querySelectorAll('[data-image-photo]')) {
      const id = slot.dataset.imagePhoto;
      if (imageURLs.has(id)) { if (!slot.querySelector('img')) slot.innerHTML = `<img src="${esc(imageURLs.get(id))}" alt="助手生成的图片">`; continue; }
      if (imageLoads.has(id)) continue;
      imageLoads.add(id);
      Promise.resolve().then(() => api.getPhoto(id)).then(photo => {
        if (v.disposed) return;
        if (!photo) { slot.textContent = '图片已从相册移除'; return; }
        const url = win.URL.createObjectURL(photo.blob); imageURLs.set(id, url); mountImages();
      }).catch(() => { if (!v.disposed) slot.textContent = '图片读取失败，重新打开会话可重试'; }).finally(() => imageLoads.delete(id));
    }
  }
  async function replyWithCost(run) {
    try { return await run({allowPaid: false}); }
    catch (error) {
      if (error.code !== 'PAID') throw error;
      const ask = api.getState().draw.engine === 'gpt' ? api.paidPrompt() : {title: '这张图会扣 Anlas', text: '按当前绘图参数生成会消耗 Anlas，实际扣费以 NovelAI 结算为准。'};
      if (!await ctx.confirm(ask.title, ask.text)) throw Object.assign(Error('已取消生图'), {name: 'AbortError'});
      return run({allowPaid: true});
    }
  }
  function previewTheme() {
    const style = win.getComputedStyle(v.root), color = name => style.getPropertyValue(name).trim();
    const theme = {'--SmartThemeBodyColor': color('--ink') || '#25314b', '--SmartThemeEmColor': color('--ink2') || '#65718a', '--SmartThemeQuoteColor': color('--accent') || '#7dadd6', '--SmartThemeUnderlineColor': color('--accent-ink') || '#2d6392', '--SmartThemeBorderColor': color('--line') || '#dce5ef', '--SmartThemeBlurTintColor': color('--card') || '#ffffff', '--SmartThemeChatTintColor': color('--card') || '#ffffff'};
    return {theme, dark: ctx.doc.documentElement.dataset.theme === 'dark'};
  }
  // Update the isolated document in place; changing srcdoc would replay the card's scripts.
  const themeObserver = new win.MutationObserver(() => {
    if (v.disposed) return;
    const update = {type: 'assistant-theme', ...previewTheme()};
    for (const frame of v.root.querySelectorAll('.assistant-preview')) frame.contentWindow?.postMessage(update, '*');
  });
  themeObserver.observe(ctx.doc.documentElement, {attributes: true, attributeFilter: ['data-theme', 'data-skin']});
  function mountCodeCopies() {
    for (const pre of v.root.querySelectorAll('.assistant-messages pre')) {
      if (!pre.querySelector(':scope > code') || pre.parentElement.classList.contains('assistant-code-block')) continue;
      const block = ctx.doc.createElement('div'); block.className = 'assistant-code-block';
      const button = ctx.doc.createElement('button'); button.type = 'button'; button.className = 'assistant-code-copy';
      button.dataset.action = 'copy-code'; button.setAttribute('aria-label', '复制代码块'); button.title = '复制代码块';
      button.innerHTML = icon('copy') + '<span>复制</span>';
      pre.before(block); block.append(button, pre);
    }
  }
  function mountPreviews() {
    for (const slot of v.root.querySelectorAll('[data-preview-mid]')) {
      if (slot.querySelector('iframe')) continue;
      const message = thread?.messages.find(m => m.id === slot.dataset.previewMid);
      const part = message && partsFor(message)[Number(slot.dataset.previewPart)];
      if (message?.role !== 'assistant' || part?.kind !== 'html') continue;
      const frame = ctx.doc.createElement('iframe');
      frame.className = 'assistant-preview assistant-auto-preview'; frame.title = part.auto ? '助手正则美化' : '助手 HTML 交互预览';
      frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; autoplay 'none'");
      frame.srcdoc = assistantPreviewDocument(part.auto ? assistantHTMLMarkdown(part.text, ctx.doc) : part.text, {auto: true, ...previewTheme()});
      frame.addEventListener('load', () => frame.contentWindow?.postMessage({type: 'assistant-theme', ...previewTheme()}, '*'));
      slot.append(frame);
    }
  }
  const messageKey = (m, i, list) => JSON.stringify([m.role, m.text, m.role === 'assistant' ? displayText(m) : '', m.meta, m.selected, m.variants?.length, list[i - 1]?.role, editingMessage(m), editingMessage(m) && editing.saving]);
  function patchChat(html, list) {
    const previous = v.root.querySelector('.assistant-chat');
    if (!previous || renderedThreadId !== threadId) v.draw(html);
    else {
      const template = ctx.doc.createElement('template'); template.innerHTML = html;
      const incoming = template.content.querySelector('.assistant-chat');
      previous.querySelector('.assistant-context').replaceChildren(...incoming.querySelector('.assistant-context').childNodes);
      const target = previous.querySelector('.assistant-messages'), wanted = new Set();
      const key = el => el.dataset.mid ? `message:${el.dataset.mid}` : el.className;
      const existing = new Map([...target.children].map(el => [key(el), el]));
      const messages = new Map(list.map((m, i) => [m.id, messageKey(m, i, list)]));
      const children = [...incoming.querySelector('.assistant-messages').children], keys = new Set(children.map(key));
      for (const child of [...target.children]) if (!keys.has(key(child))) child.remove();
      let index = 0;
      for (const fresh of children) {
        const old = existing.get(key(fresh)), before = renderedMessages.get(fresh.dataset.mid), now = messages.get(fresh.dataset.mid);
        const unchanged = fresh.dataset.mid ? before && now && before === now : old?.innerHTML === fresh.innerHTML;
        const node = old && unchanged ? old : fresh;
        if (old && !unchanged) {
          for (const detail of old.querySelectorAll('details[open][data-group]')) {
            for (const next of fresh.querySelectorAll('details[data-group]')) if (next.dataset.group === detail.dataset.group) next.open = true;
          }
          old.replaceWith(fresh);
        }
        // Existing message nodes stay attached, including their iframe browsing contexts.
        // Appending a reply or changing the busy indicator must not replay an HTML script.
        if (target.children[index] !== node) target.insertBefore(node, target.children[index] || null);
        wanted.add(node); index++;
      }
      for (const child of [...target.children]) if (!wanted.has(child)) child.remove();
      const composer = previous.querySelector('.assistant-composer'), nextComposer = incoming.querySelector('.assistant-composer');
      const tray = composer.querySelector('[data-attachment-tray]'), nextTray = nextComposer.querySelector('[data-attachment-tray]');
      if (tray.innerHTML !== nextTray.innerHTML) tray.replaceChildren(...nextTray.childNodes);
      composer.querySelector('[data-action=attach]').disabled = nextComposer.querySelector('[data-action=attach]').disabled;
      const box = composer.querySelector('textarea'); if (box.value !== draft()) box.value = draft();
      const button = composer.querySelector('.assistant-send'), nextButton = nextComposer.querySelector('.assistant-send');
      if (button.outerHTML === nextButton.outerHTML) button.disabled = nextButton.disabled;
      else button.replaceWith(nextButton);
    }
    renderedThreadId = threadId; renderedMessages = new Map(list.map((m, i) => [m.id, messageKey(m, i, list)]));
  }
  function liveHTML(progress) {
    if (!progress) return '';
    const elapsed = Math.max(0, Date.now() - progress.startedAt), meta = progress.meta || {};
    if (['prompting', 'drawing'].includes(progress.phase)) {
      const label = `<span role="status">${progress.phase === 'prompting' ? '正在整理绘图提示词' : '正在生成图片'} · ${(elapsed / 1000).toFixed(1)} 秒</span>`;
      const chunks = progress.text?.split(ASSISTANT_IMAGE_SLOT);
      const content = progress.phase === 'drawing' && chunks?.length === 2 ? `<div class="assistant-prose">${prose(chunks[0])}</div><div class="assistant-image-pending">${label}</div><div class="assistant-prose">${prose(chunks[1])}</div>` : label;
      return `<article class="assistant-live"><span class="assistant-who">${icon('star')}助手</span><div class="assistant-bubble">${content}</div></article>`;
    }
    const part = assistantThoughts(progress.text, meta.reasoningFormat), show = state().stream !== false;
    const reason = [meta.reasoning, part.reasoning].filter(Boolean).filter((s, i, all) => all.indexOf(s) === i).join('\n\n');
    const phase = progress.phase, seconds = ((phase === 'responding' && Number.isFinite(meta.reasoningMs) ? meta.reasoningMs : elapsed) / 1000).toFixed(1);
    const label = phase === 'thinking' ? `正在思考 · ${seconds} 秒` : phase === 'responding' ? Number.isFinite(meta.reasoningMs) ? `思考了 ${seconds} 秒` : '思考内容' : `等待回复 · ${seconds} 秒`;
    // Incomplete HTML/regex scripts are not executed on every token. Final output is beautified once complete.
    const streaming = show && phase === 'responding' ? streamingParts(part.text) : null;
    const skeleton = label => `<div class="aui aui-skeleton" role="status"><i></i><span>${label}</span></div>`;
    const body = streaming ? streaming.parts.map(p => p.kind === 'html' ? skeleton('正在做界面…') : p.kind === 'ui' ? assistantVisualHTML(p.text) : p.kind === 'picture' ? assistantPictureHTML(p.text, '', {live: true}) : p.kind === 'song' ? assistantSongHTML(p) : p.kind === 'code' ? `<pre class="assistant-code"><code>${esc(p.text)}</code></pre>` : `<div class="assistant-prose">${prose(p.text)}</div>`).join('')
      + (streaming.pending === 'ui' || streaming.pending === 'widget' ? skeleton(streaming.pending === 'widget' ? '正在做界面…' : '正在生成界面…') : streaming.pending === 'picture' ? skeleton('正在写出图块…') : '') : '';
    return `<article class="assistant-live"><span class="assistant-who">${icon('star')}助手${progress.rerollId ? ' · 重新生成' : ''}${replyInfo({meta:{...meta,elapsedMs:elapsed}})}</span><div class="assistant-bubble">${reason || phase === 'thinking' ? `<details class="assistant-reasoning" data-group="live-${esc(progress.id)}"><summary>${label}</summary>${show && reason ? `<div class="assistant-prose">${prose(reason)}</div>` : ''}</details>` : ''}${phase === 'waiting' ? `<span role="status">${label}</span>` : phase === 'responding' ? `<span class="assistant-stream-status" role="status">正在回复 · ${(elapsed / 1000).toFixed(1)} 秒</span>` : ''}${body}</div></article>`;
  }
  function syncClock(running) {
    if (running && !liveClock && active) liveClock = win.setInterval(() => { if (!v.disposed && active && mode === 'chat') drawChat(); }, 250);
    if ((!running || !active) && liveClock) { win.clearInterval(liveClock); liveClock = null; }
  }
  let lastWidgetSend = 0;
  const resizePreview = event => {
    // iphonie.send from a widget: only from a frame of this app the user has tapped into (it has the focus), not
    // more than once a second and a half, and only into the conversation on screen.
    if (event.data?.type === 'assistant-send' && typeof event.data.text === 'string') {
      const frame = [...v.root.querySelectorAll('.assistant-preview')].find(f => f.contentWindow === event.source);
      const text = event.data.text.trim().slice(0, 500), now = Date.now();
      if (!frame || !text || ctx.doc.activeElement !== frame || now - lastWidgetSend < 1500 || mode !== 'chat') return;
      lastWidgetSend = now; sendNow(text); return;
    }
    if (event.data?.type !== 'assistant-html-size' || !Number.isFinite(event.data.height)) return;
    for (const frame of v.root.querySelectorAll('.assistant-auto-preview')) if (event.source === frame.contentWindow) {
      const scroll = v.root.querySelector('.assistant-messages'), bottom = scroll && scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 70;
      frame.style.height = `${Math.max(24, Math.min(100000, Math.ceil(event.data.height)))}px`;
      if (bottom) scroll.scrollTop = scroll.scrollHeight;
    }
  };
  win.addEventListener('message', resizePreview);
  function drawChat() {
    const waiting = busy(threadId), saving = pending.get(threadId)?.kind === 'save', list = thread?.messages || [], error = errors.get(threadId), last = list.at(-1);
    const progress = waiting && !saving ? api.assistantProgress?.(threadId) : null;
    syncClock(!!progress);
    const previous = v.root.querySelector('[data-assistant-draft]'), focused = previous === ctx.doc.activeElement;
    const selection = focused ? [previous.selectionStart, previous.selectionEnd] : null;
    const scroller = v.root.querySelector('.assistant-messages'), bottom = !scroller || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 70;
    v.root.classList.add('assistant-chat-mode');
    patchChat(`<div class="assistant-chat"><header class="assistant-header"><div><span class="eyebrow">Assistant</span><h1>助手</h1></div><div class="heading-actions">${btn('threads', icon('layers'), 'round-button', 'aria-label="会话记录"')}${btn('new', icon('add'), 'round-button', 'aria-label="新建会话"')}${threadId && api.assistantMemoryBook ? btn('memory', icon('book'), 'round-button', 'aria-label="会话记忆"') : ''}${btn('settings', icon('sliders'), 'round-button', 'aria-label="助手设置"')}</div></header><div class="assistant-context">${icon(state().readContext ? 'book' : 'bubble')}<span>${esc(contextCopy())}</span></div><div class="assistant-messages" data-keep-scroll="assistant-messages" aria-label="助手对话" role="log">${list.length ? `<p class="assistant-conversation-title">${esc(thread.title || '当前会话')}</p>` + list.map(messageHTML).join('') : `<div class="assistant-welcome"><span class="assistant-mascot">${glyph('assistant')}</span><h2>陪你聊聊，帮你想想</h2></div>`}${progress ? liveHTML(progress) : waiting ? `<div class="assistant-wait" role="status"><i></i><span>${saving ? '正在发送……' : '正在准备回复……'}</span></div>` : ''}${error ? `<p class="assistant-error" role="alert">${esc(error)}</p>` : ''}${!waiting && error && last?.role === 'user' ? `<div class="assistant-retry">${btn('retry', icon('refresh') + '重新回复', 'secondary small')}</div>` : ''}</div><div class="assistant-composer"><div data-attachment-tray>${attachmentHTML(attachments(), true)}${fileReads.has(threadId) ? '<span class="hint">正在读取附件……</span>' : ''}</div><input type="file" data-assistant-files accept="${ASSISTANT_FILE_ACCEPT}" multiple hidden><details class="assistant-add-menu"><summary class="assistant-attach" aria-label="添加" title="添加">${icon('add')}</summary><div class="assistant-add-options">${btn('attach', icon('book') + '添加附件', 'text-button', `aria-label="附加文件" ${fileReads.has(threadId) || pending.get(threadId)?.kind === 'save' ? 'disabled' : ''}`)}${btn('draw-image', icon('image') + '生图', 'text-button')}</div></details><textarea data-assistant-draft aria-label="发给助手的消息" placeholder="想说点什么……" rows="1">${esc(draft())}</textarea>${waiting ? btn('cancel', icon('stop'), 'assistant-send', 'aria-label="停止回复"') : sendButton()}</div></div>`, list);
    mountCodeCopies(); mountPreviews(); mountImages(); resizeComposer();
    for (const button of v.root.querySelectorAll('[data-action=reroll],[data-action=redraw],[data-action=delete-message],[data-action=edit-message]')) button.disabled = waiting;
    const editSave = v.root.querySelector('[data-action=save-edit]'); if (editSave) editSave.disabled = waiting || !!editing?.saving;
    const next = v.root.querySelector('.assistant-messages'); if (bottom) next.scrollTop = next.scrollHeight;
    if (focused) { const box = v.root.querySelector('[data-assistant-draft]'); box.focus({preventScroll: true}); box.setSelectionRange(...selection); }
  }
  /** Conversations deleted (one, or several picked in 会话记录), with their messages. */
  async function dropThreads(ids) {
    if (!await ctx.confirm(ids.length > 1 ? `删除这 ${ids.length} 个助手会话？` : '删除这个助手会话？', '会话里的消息会一并删除。')) return;
    for (const id of ids) {
      api.assistantCancel?.(id); await api.deleteAssistantThread(id); saveDraft('', id); fileDrafts.delete(id); errors.delete(id);
      if (id === threadId) { threadId = null; thread = null; }
    }
    return render();
  }
  let threadSwipe = null;
  async function render() {
    if (v.disposed) return;
    const ticket = ++epoch, id = threadId, currentMode = mode;
    if (mode === 'settings') { drawSettings(); return; }
    if (mode === 'threads') {
      const rows = await api.assistantThreads();
      if (v.disposed || ticket !== epoch || currentMode !== mode) return;
      v.root.classList.remove('assistant-chat-mode');
      const titled = r => r.title || '新会话';
      v.draw(heading('会话记录', btn('new', icon('add'), 'round-button', 'aria-label="新建会话"'), 'Assistant') + `<div class="group" data-thread-list>${rows.length ? rows.map(r => renameId === r.id
        ? `<div class="assistant-thread-row"><div class="assistant-rename"><input data-thread-title value="${esc(r.title)}" maxlength="80" aria-label="会话名字">${btn('save-title', '保存', 'text-button', `data-id="${esc(r.id)}"`)}${btn('cancel-title', '取消', 'text-button')}</div></div>`
        : swipeRow(r.id, `<div class="assistant-thread-row"><button data-action="thread" data-id="${esc(r.id)}"><strong>${esc(titled(r))}</strong><small>${esc(r.preview || `${r.messageCount || 0} 条消息`)}</small></button></div>`,
          [{key: 'rename', label: '改名', icon: 'edit'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}], {label: titled(r)})).join('') : '<p class="hint">还没有会话。和助手说第一句话吧。</p>'}</div>`);
      threadSwipe?.dispose();
      const list = v.root.querySelector('[data-thread-list]');
      threadSwipe = rows.length ? mountSwipeList(list, {ctx,
        onAction: (key, id) => { if (key === 'rename') { renameId = id; render(); } else if (key === 'delete') dropThreads([id]).catch(error => ctx.notify(error.message, {error: true})); },
        bulk: [{key: 'delete', label: '删除', icon: 'trash', danger: true}], onBulk: (key, ids) => dropThreads(ids)}) : null;
      return;
    }
    const row = id ? await api.assistantThread(id) : null;
    if (v.disposed || ticket !== epoch || id !== threadId || currentMode !== mode) return;
    if (id && !row) threadId = null;
    if (renderedThreadId !== threadId) displayCache.clear();
    thread = row; drawChat();
  }
  function drawSettings() {
    const s = settings || state(), built = s.presets?.find(p => p.id === s.activePreset), external = tavern.find(p => p.id === s.tavernPreset);
    const entries = s.source === 'tavern' ? external?.entries || [] : built?.entries || [];
    v.root.classList.remove('assistant-chat-mode');
    v.draw(heading('助手设置', btn('save-settings', settingsSaving ? '保存中' : '完成', 'primary small', settingsSaving ? 'disabled' : ''), 'Assistant') + `<div class="group">${field('预设来源', select('source', s.source, [['builtin', '助手预设'], ['tavern', '酒馆预设']]))}${s.source === 'tavern' ? field('酒馆预设', select('tavernPreset', s.tavernPreset, [['', '选择一个预设'], ...tavern.map(p => [p.id, p.name])])) : field('助手预设', `<div class="music-selfhost">${select('activePreset', s.activePreset, s.presets.map(p => [p.id, p.name]))}${btn('preset-tools', icon('more'), 'round-button', 'aria-label="新建、另存为、删除助手预设"')}</div>`) + `${field('预设名称', `<input data-preset-name value="${esc(built?.name || '')}" maxlength="80" aria-label="预设名称">`)}`}${toggle('stream', '流式显示', s.stream !== false, '开启后边生成边显示；关闭后等待完整回复。思考状态仍实时更新。')}${toggle('visuals', '智能界面', s.visuals !== false, '用文字说不清、或者做成界面更好玩的时候，助手会在回答里现做一个能用的小界面：小游戏、计算器、能拖动的图表、资料面板……平时还是用文字回答。关掉后只用文字。')}${toggle('readContext', '读取正文上下文', s.readContext, '打开后，助手会读最近一次正文请求的完整快照，保留当次正则、预设与注入；不含随后生成的回复。刷新或切换正文后，请先发送一次正文。关掉时只带助手提示词和这个会话。')}${s.readContext ? `<p class="hint">${esc(contextCopy(s))}</p>` : ''}</div>${memorySettings(s)}${s.source === 'tavern' && tavernLoading ? '<p class="hint" role="status">正在读取酒馆预设……</p>' : ''}${s.source === 'tavern' && tavernError ? `<p class="assistant-error" role="alert">${esc(tavernError)}</p>${btn('reload-presets', '重新读取', 'secondary small')}` : ''}<div class="group-title"><span>${s.source === 'tavern' ? '预设条目' : '助手提示词'}</span><small>${entries.length} 条</small>${s.source === 'builtin' ? btn('add-entry', icon('add'), 'text-button', 'aria-label="添加条目"') : ''}</div><div class="assistant-entries">${entries.map(entry => {
      const enabled = s.source === 'tavern' ? s.tavernEntries?.[s.tavernPreset]?.[entry.id] ?? entry.enabled !== false : entry.enabled !== false;
      return `<details class="group assistant-entry" data-group="entry-${esc(entry.id)}"><summary><span>${esc(entry.title || entry.id)}${entry.marker ? '<small> · 上下文位置</small>' : ''}</span><input class="switch" type="checkbox" data-entry="${esc(entry.id)}" aria-label="启用 ${esc(entry.title || entry.id)}" ${enabled ? 'checked' : ''}></summary>${s.source === 'builtin' ? `<div class="assistant-entry-edit"><input data-entry-title="${esc(entry.id)}" value="${esc(entry.title)}" maxlength="100" aria-label="条目名称">${btn('delete-entry', icon('trash'), 'text-button', `data-entry-id="${esc(entry.id)}" aria-label="删除条目"`)}</div><textarea data-entry-text="${esc(entry.id)}" aria-label="${esc(entry.title || entry.id)}的内容" rows="6">${esc(entry.text)}</textarea>` : `<pre class="assistant-code">${esc(entry.text || (entry.marker ? '正文快照完整保留当次发送内容，不由此处的条目开关裁剪。' : '这个条目没有文字内容。'))}</pre>`}</details>`;
    }).join('')}</div>`);
  }
  function memorySettings(s) {
    const m = normalizeMemory(s.memory);
    const number = (key, label, value, min, max) => field(label, '<input type="number" data-field="' + key + '" value="' + value + '" min="' + min + '" max="' + max + '" step="1">');
    return '<details class="group pad" data-group="assistant-memory"><summary>记忆</summary>'
      + toggle('memory.enabled', '记住更早的助手对话', m.enabled, '每段会话单独保存。较早的消息整理成摘要、阶段总结和长期总览；整理会调用助手的文字模型。')
      + (m.enabled ? number('history', '原样读取最近的消息', s.history ?? 30, 2, 500)
        + number('memory.batch', '每多少条旧消息整理一次', m.batch, 10, 200)
        + number('memory.stage', '几份摘要合成阶段总结', m.stage, 2, 20)
        + number('memory.epic', '几份总结合成长期总览', m.epic, 2, 20)
        + number('memory.recall', '检索几段相关旧对话', m.recall, 0, 10)
        + '<p class="hint">检索默认在本机进行；配置了向量模型后也会使用它。会话右上角的记忆按钮可以查看、修改、删除或立即整理。编辑旧消息、换回复版本后会重新整理。</p>' : '<p class="hint">关闭后沿用完整会话历史，已有记忆保留。</p>')
      + '</details>';
  }
  async function loadPresets() {
    const ticket = ++presetsEpoch; tavernLoading = true; tavernError = '';
    if (mode === 'settings') drawSettings();
    try { const result = await api.assistantPresets?.(); if (ticket === presetsEpoch) tavern = result || []; }
    catch (error) { if (ticket === presetsEpoch) tavernError = error.message; }
    finally { if (ticket === presetsEpoch) { tavernLoading = false; if (!v.disposed && mode === 'settings') drawSettings(); } }
  }
  function sendButton() {
    const writing = !!draft().trim() || attachments().length > 0, ready = !fileReads.has(threadId) && (writing || thread?.messages.at(-1)?.role === 'user');
    const label = writing ? '发送消息' : '让助手回复';
    return btn('send', icon(writing ? 'send' : 'bubble'), 'assistant-send', `aria-label="${label}" title="${label}" ${ready ? '' : 'disabled'}`);
  }
  async function send(retry = false) {
    if (busy(threadId) || fileReads.has(threadId)) return;
    const files = retry ? [] : attachments();
    const text = retry ? '' : draft().trim();
    if (!text && !files.length && (!threadId || thread?.messages.at(-1)?.role !== 'user')) return;
    // Lock before the first await: double Enter cannot create/send two conversations.
    const originalId = threadId, selected = selectionEpoch, job = {cancelled: false, kind: text || files.length ? 'save' : 'reply'}; pending.set(originalId, job);
    if (!retry) { saveDraft('', originalId); fileDrafts.delete(originalId); }
    drawChat();
    let id = originalId;
    try {
      if (!id) {
        const row = await api.newAssistantThread(); id = row.id; pending.set(id, job);
        if (pending.get(originalId) === job) pending.delete(originalId);
        if (threadId === originalId && selected === selectionEpoch) { threadId = id; thread = row; saveDraft(draft(originalId), id); saveDraft('', originalId); if (attachments(originalId).length) { fileDrafts.set(id, attachments(originalId)); fileDrafts.delete(originalId); } }
      }
      errors.delete(id); await render();
      if (job.cancelled) throw Object.assign(Error('已取消助手回复'), {name: 'AbortError'});
      if (text || files.length) {
        const current = await api.assistantThread(id);
        if (!current || current.messages.length >= 499) throw Error('这段助手对话已满，请新建对话后继续');
        if (job.cancelled) throw Object.assign(Error('已取消发送'), {name: 'AbortError'});
        await api.appendAssistantMessage(id, {role: 'user', text, attachments: files});
        job.saved = true;
      } else { await replyWithCost(options => { if (job.cancelled) throw Object.assign(Error('已取消'), {name: 'AbortError'}); return api.assistantReply(id, undefined, options); }); await playAsked(id).catch(() => {}); }
    } catch (error) {
      if (error?.name !== 'AbortError') errors.set(id, error.message || '回复没有完成，请重试。');
      // If generation failed before saving the user message, put the unsent text back.
      if (!job.saved) {
        if (text && !draft(id)) saveDraft(text, id);
        if (files.length) fileDrafts.set(id, [...files, ...attachments(id)]);
      }
    } finally { for (const key of [originalId, id]) if (pending.get(key) === job) pending.delete(key); if (!v.disposed) await render(); }
  }
  /** Plays the reply's songs from one of them (through the phone's 音乐, which finds each by name). */
  function playSongs(message, from = 0) {
    const songs = partsFor(message).filter(p => p.kind === 'song');
    if (!songs.length || !api.musicPlayList) return;
    ctx.notify(`正在找「${songs[from].song.title}」……`);
    api.musicPlayList(songs.map(p => ({title: p.song.title, artist: p.song.artist, from: 'assistant'})), from).catch(error => ctx.notify(error.message, {error: true}));
  }
  /** A fresh reply to「放首歌」: its first song starts at once (a reroll or an old reply waits for a tap). */
  async function playAsked(id) {
    const row = await api.assistantThread(id), reply = row?.messages.at(-1), asked = row?.messages.findLast(m => m.role === 'user');
    if (reply?.role === 'assistant' && asked && ASSISTANT_WANTS_MUSIC.test(asked.text || '')) playSongs(reply, 0);
  }
  /** A tap on a 智能界面 button: sends that text and asks for the reply at once. */
  async function sendNow(text) {
    if (!text || busy(threadId) || fileReads.has(threadId)) return;
    saveDraft(text); await send();
    if (!errors.get(threadId) && thread?.messages.at(-1)?.role === 'user') await send(true);
  }
  async function drawBlock(block) {
    if (!block || busy(threadId)) return;
    const id = threadId, job = {kind: 'reply'}; pending.set(id, job); errors.delete(id); drawChat();
    try { await replyWithCost(options => { if (job.cancelled) throw Object.assign(Error('已取消'), {name: 'AbortError'}); return api.assistantDrawBlock(id, block, options); }); }
    catch (error) { if (error.name !== 'AbortError') errors.set(id, error.message); }
    finally { if (pending.get(id) === job) pending.delete(id); if (!v.disposed) await render(); }
  }
  async function redraw(message) {
    if (!message?.meta?.image || busy(threadId)) return;
    closePreviews();
    const id = threadId, job = {kind: 'reply'}; pending.set(id, job); errors.delete(id); drawChat();
    try { await replyWithCost(options => { if (job.cancelled) throw Object.assign(Error('已取消'), {name: 'AbortError'}); return api.assistantRedraw(id, message.id, options); }); }
    catch (error) { if (error.name !== 'AbortError') errors.set(id, error.message); }
    finally { if (pending.get(id) === job) pending.delete(id); if (!v.disposed) await render(); }
  }
  async function reroll(message) {
    if (!message || busy(threadId)) return;
    closePreviews();
    const id = threadId, job = {kind: 'reply'}; pending.set(id, job); errors.delete(id); drawChat();
    try { await replyWithCost(options => { if (job.cancelled) throw Object.assign(Error('已取消'), {name: 'AbortError'}); return api.assistantReroll(id, message.id, options); }); }
    catch (error) { if (error.name !== 'AbortError') errors.set(id, error.message); }
    finally { if (pending.get(id) === job) pending.delete(id); if (!v.disposed) await render(); }
  }
  v.on('change', '[data-assistant-files]', async el => {
    const id = threadId, files = [...el.files]; el.value = '';
    if (!files.length || fileReads.has(id) || pending.get(id)?.kind === 'save') return;
    fileReads.add(id); drawChat();
    try { const added = await api.assistantReadFiles(files); if (!v.disposed) fileDrafts.set(id, assistantAttachments([...attachments(id), ...added])); }
    finally { fileReads.delete(id); if (!v.disposed && mode === 'chat') drawChat(); }
  });
  v.on('input', '[data-edit-message]', el => { if (editing?.threadId === threadId) editing.text = el.value; });
  v.on('input', '[data-assistant-draft]', el => {
    saveDraft(el.value); resizeComposer(); const button = v.root.querySelector('[data-action=send]'); if (button) { const template = ctx.doc.createElement('template'); template.innerHTML = sendButton(); button.replaceWith(template.content.firstElementChild); }
  });
  v.on('keydown', '[data-assistant-draft]', (el, event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); return send(); }
  });
  v.on('input', '[data-preset-name]', el => { const p = settings?.presets.find(p => p.id === settings.activePreset); if (p) p.name = el.value; });
  v.on('input', '[data-entry-title]', el => { const entry = settings?.presets.find(p => p.id === settings.activePreset)?.entries.find(e => e.id === el.dataset.entryTitle); if (entry) entry.title = el.value; });
  v.on('input', '[data-entry-text]', el => {
    const p = settings.presets.find(p => p.id === settings.activePreset), entry = p?.entries.find(e => e.id === el.dataset.entryText);
    if (entry) entry.text = el.value;
  });
  v.on('change', '[data-field],[data-entry]', el => {
    if (!settings) return;
    if (el.dataset.entry) {
      if (settings.source === 'tavern') { settings.tavernEntries ||= {}; settings.tavernEntries[settings.tavernPreset] ||= {}; settings.tavernEntries[settings.tavernPreset][el.dataset.entry] = el.checked; }
      else { const entry = settings.presets.find(p => p.id === settings.activePreset)?.entries.find(e => e.id === el.dataset.entry); if (entry) entry.enabled = el.checked; }
      return;
    }
    const key = el.dataset.field, value = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    if (key.startsWith('memory.')) settings.memory = {...normalizeMemory(settings.memory), [key.slice(7)]: value};
    else settings[key] = value;
    drawSettings();
    if (el.dataset.field === 'source' && settings.source === 'tavern') return loadPresets();
  });
  v.on('click', '[data-action]', el => act(el.dataset.action, el));
  async function act(action, el) {
    const message = thread?.messages.find(m => m.id === el.dataset.mid);
    switch (action) {
      // 新建 / 另存为 / 删除 the assistant preset: the 「⋯」 next to it.
      case 'preset-tools': {
        const current = settings?.presets.find(p => p.id === settings.activePreset);
        const picked = await menu(ctx, '助手预设', [{key: 'new-preset', icon: 'add', label: '新建预设'}, {key: 'copy-preset', icon: 'copy', label: '另存为新预设', note: `把「${current?.name || ''}」复制一份`}, current && current.id !== 'companion' && {key: 'delete-preset', icon: 'trash', label: '删除这套预设', danger: true}]);
        if (picked) return act(picked, el);
        return;
      }
      case 'attach': v.root.querySelector('.assistant-add-menu').open = false; v.root.querySelector('[data-assistant-files]').click(); return;
      case 'draw-image':
        v.root.querySelector('.assistant-add-menu').open = false;
        saveDraft('帮我画：' + draft().replace(/^帮我画[：:]\s*/, '')); drawChat(); v.root.querySelector('[data-assistant-draft]')?.focus(); return;
      case 'image': {
        const id = message?.meta?.image?.photoId, src = imageURLs.get(id);
        if (!src) return;
        const photo = await api.getPhoto(id); if (v.disposed) return;
        if (!photo) { ctx.notify('这张图片已从相册移除'); imageURLs.delete(id); win.URL.revokeObjectURL(src); el.textContent = '图片已从相册移除'; return; }
        openImageViewer({doc: ctx.doc, src, alt: '助手生成的图片', from: el.querySelector('img'), info: photo.info, actions: [downloadAction(ctx.doc, async () => ({source: photo.blob, name: photo.name}), ctx.notify), shareAction(ctx.doc, async () => ({source: photo.blob, name: photo.name}), ctx.notify)]}); return;
      }
      case 'remove-file': fileDrafts.set(threadId, attachments().filter((_, i) => i !== Number(el.dataset.file))); drawChat(); return;
      case 'reroll': return reroll(message);
      case 'redraw': return redraw(message);
      case 'ui-quiz': {
        const quiz = el.closest('.aui-quiz');
        if (!quiz || quiz.dataset.done) return;
        quiz.dataset.done = '1';
        const right = Number(quiz.dataset.answer);
        for (const b of quiz.querySelectorAll('[data-action=ui-quiz]')) { b.disabled = true; if (Number(b.dataset.n) === right) b.dataset.right = ''; }
        if (Number(el.dataset.n) !== right && right >= 0) el.dataset.wrong = '';
        const explain = quiz.querySelector('.aui-explain'); if (explain) explain.hidden = false;
        return;
      }
      case 'variant': if (message && !busy(threadId)) { closePreviews(); await api.selectAssistantVariant(threadId, message.id, Number(el.dataset.selected)); await render(); } return;
      case 'edit-message':
        if (message?.role !== 'user' || busy(threadId)) return;
        editing = {threadId, mid: message.id, original: message.text, text: message.text, saving: false}; drawChat();
        v.root.querySelector('[data-edit-message]')?.focus(); return;
      case 'cancel-edit': if (!editing?.saving) { editing = null; drawChat(); } return;
      case 'save-edit': {
        const edit = editing;
        if (!edit || edit.threadId !== threadId || edit.saving || busy(threadId)) return;
        edit.saving = true; drawChat();
        try { await api.editAssistantMessage(edit.threadId, edit.mid, edit.text, edit.original); if (editing === edit) editing = null; }
        finally { edit.saving = false; if (!v.disposed) await render(); }
        return;
      }
      case 'delete-message': {
        const id = threadId;
        if (!message || busy(id) || !await ctx.confirm('删除这条消息？', message.role === 'assistant' ? '这条回复的所有版本都会删除。' : '消息和所附文件会一起删除。')) return;
        await api.deleteAssistantMessage(id, message.id); await render(); return;
      }
      case 'rename-thread': renameId = el.dataset.id; return render();
      case 'cancel-title': renameId = null; return render();
      case 'save-title': await api.renameAssistantThread(el.dataset.id, v.root.querySelector('[data-thread-title]').value); renameId = null; return render();
      case 'send': return send();
      case 'retry': return send(true);
      case 'cancel': { const job = pending.get(threadId); if (job) job.cancelled = true; api.assistantCancel?.(threadId); return; }
      case 'memory': if (threadId) memorySheet(ctx, {threadId, title: thread?.title || '助手', assistant: true}); return;
      case 'threads': closePreviews(); mode = 'threads'; return render();
      case 'thread': closePreviews(); selectionEpoch++; threadId = el.dataset.id; thread = null; mode = 'chat'; return render();
      case 'new': closePreviews(); selectionEpoch++; threadId = null; thread = null; mode = 'chat'; return render();
      case 'delete-thread': return dropThreads([el.dataset.id]);
      case 'new-preset':
      case 'copy-preset': {
        if (!settings || settings.source !== 'builtin') return;
        if (settings.presets.length >= ASSISTANT_LIMITS.presets) { ctx.notify('最多保存 100 套助手预设'); return; }
        const current = settings.presets.find(p => p.id === settings.activePreset);
        const preset = {id: win.crypto.randomUUID(), name: action === 'copy-preset' ? `${current.name} 副本`.slice(0, 80) : '新预设', entries: action === 'copy-preset' ? structuredClone(current.entries) : []};
        const saved = state().presets?.find(p => p.id === current.id);
        if (action === 'copy-preset' && saved) settings.presets = settings.presets.map(p => p.id === current.id ? structuredClone(saved) : p);
        settings.presets.push(preset); settings.activePreset = preset.id; drawSettings(); v.root.querySelector('[data-preset-name]')?.focus(); return;
      }
      case 'delete-preset': {
        if (!settings || settings.source !== 'builtin' || settings.activePreset === 'companion') return;
        if (!await ctx.confirm('删除这套助手预设？', '会话记录会保留。')) return;
        settings.presets = settings.presets.filter(p => p.id !== settings.activePreset); settings.activePreset = 'companion'; drawSettings(); return;
      }
      case 'add-entry': {
        const preset = settings?.source === 'builtin' && settings.presets.find(p => p.id === settings.activePreset); if (!preset) return;
        if (preset.entries.length >= ASSISTANT_LIMITS.entries) { ctx.notify('每套预设最多 50 个条目'); return; }
        const entry = {id: win.crypto.randomUUID(), title: '新条目', text: '', enabled: true}; preset.entries.push(entry); drawSettings();
        const box = v.root.querySelector(`[data-entry-text="${entry.id}"]`); box.closest('details').open = true; box.focus(); return;
      }
      case 'delete-entry': {
        const preset = settings?.source === 'builtin' && settings.presets.find(p => p.id === settings.activePreset); if (!preset) return;
        preset.entries = preset.entries.filter(e => e.id !== el.dataset.entryId); drawSettings(); return;
      }
      case 'settings': closePreviews(); settings = structuredClone(state()); mode = 'settings'; drawSettings(); return loadPresets();
      case 'reload-presets': return loadPresets();
      case 'save-settings':
        if (settingsSaving) return;
        settingsSaving = true;
        try { await api.saveAssistant(settings); settings = null; mode = 'chat'; await render(); }
        finally { settingsSaving = false; } return;
      case 'pic-copy': case 'pic-draw': {
        const part = message && partsFor(message)[Number(el.dataset.part)];
        if (part?.kind !== 'picture') return;
        if (action === 'pic-draw') return drawBlock(part.text);
        ctx.notify(await copyText(win, part.text) ? '出图块已复制' : '没能复制，请长按手动选取');
        return;
      }
      case 'as-song': {
        const parts = message ? partsFor(message) : [], at = Number(el.dataset.part);
        if (parts[at]?.kind !== 'song') return;
        return playSongs(message, parts.slice(0, at).filter(p => p.kind === 'song').length);
      }
      case 'ui-send': return sendNow(el.dataset.text);
      case 'ui-form': {
        const form = el.closest('.aui-form');
        if (!form) return;
        const lines = [...form.querySelectorAll('.aui-field')].map(f => {
          const value = f.querySelector('input[type=radio]:checked')?.value || f.querySelector('input[type=text]')?.value.trim() || '';
          return value ? `${f.dataset.label}：${value}` : '';
        }).filter(Boolean);
        if (!lines.length) { ctx.notify('先选一下或填一下'); return; }
        return sendNow([form.dataset.formTitle, ...lines].filter(Boolean).join('\n'));
      }
      case 'copy-code': {
        const code = el.closest('.assistant-code-block')?.querySelector('pre > code');
        if (!code) return;
        const copied = await copyText(win, code.textContent);
        ctx.notify(copied ? '代码块已复制' : '没能复制，请长按代码手动选取');
        return;
      }
      case 'copy': if (message && await copyText(win, message.meta?.image ? message.text.replaceAll(ASSISTANT_IMAGE_SLOT, '【图片】') : message.text)) ctx.notify('原文已复制'); else ctx.notify('没能复制，请展开源码后手动选取'); return;
      case 'voice-all': if (message?.role === 'assistant') return api.speak(voiceFor(message)); return;
      case 'voice-line': {
        if (message?.role !== 'assistant') return;
        const line = voiceFor(message)[Number(el.dataset.line)]; if (line) return api.speak(line); return;
      }
    }
  }
  v.back = () => {
    if (mode === 'settings') { settings = null; mode = 'chat'; render().catch(e => ctx.notify(e.message, {error: true})); return true; }
    if (mode === 'threads') { mode = 'chat'; render().catch(e => ctx.notify(e.message, {error: true})); return true; }
    return false;
  };
  v.refresh = v.resume = () => { active = true; return render(); };
  v.onAssistant = event => { if (!active) return; if (event.progress) { if (mode === 'chat' && event.threadId === threadId) drawChat(); return; } if (mode !== 'settings' && (!event.threadId || event.threadId === threadId || mode === 'threads')) return render(); };
  v.showing = () => threadId;
  v.leave = () => { active = false; syncClock(false); closePreviews(); displayCache.clear(); };
  const dispose = v.dispose;
  v.dispose = () => { themeObserver.disconnect(); for (const url of imageURLs.values()) win.URL.revokeObjectURL(url); imageURLs.clear(); active = false; syncClock(false); win.removeEventListener('message', resizePreview); composerObserver?.disconnect(); closePreviews(); displayCache.clear(); dispose(); };
  render().catch(error => ctx.notify(error.message, {error: true}));
  return v;
}
