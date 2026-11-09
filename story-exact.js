// Read-only host adapters shared by phone chat and Assistant. Dependencies are injectable in tests.
import {storyLines} from './core/moments.js';
import {plainStory} from './core/chat.js';
import {tavernAssistantPresets} from './assistant-presets.js';
import {worldInfoFor, loreOptions} from './host-lore.js';

export function createStoryRegex(load = () => import('/scripts/extensions/regex/engine.js')) {
  let pending;
  return async () => {
    pending ||= Promise.resolve().then(load).then(m => (text, {user, depth}) => m.getRegexedString(text,
      user ? m.regex_placement.USER_INPUT : m.regex_placement.AI_OUTPUT, {isPrompt: true, depth})).catch(() => text => text);
    return pending;
  };
}
export const storyRegex = createStoryRegex();
export async function readStoryLines(chat, preset, user) {
  return storyLines(chat, preset, user, {regex: await storyRegex()});
}
const textOf = value => typeof value === 'string' ? value : Array.isArray(value)
  ? value.filter(p => p?.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n') : '';

export function createStoryExact({load = () => import('/scripts/itemized-prompts.js'), presets = tavernAssistantPresets,
  regex = storyRegex, lore = worldInfoFor} = {}) {
  let pending;
  return async (context, preset = {}, {entries = preset.storyEntries || {}} = {}) => {
    const ctx = typeof context === 'function' ? context() : context || {};
    const unavailable = reason => ({available: false, reason, messages: [], entries: []});
    let source;
    try { pending ||= Promise.resolve().then(load); source = (await pending).itemizedPrompts; }
    catch { return unavailable('当前酒馆读不到已保存的正文提示词'); }
    const chat = ctx.chat || [];
    const saved = (Array.isArray(source) ? source : []).filter(p => Number.isInteger(Number(p?.mesId)) && Number(p.mesId) >= 0
      && chat[Number(p.mesId)] && !chat[Number(p.mesId)].is_system && !chat[Number(p.mesId)].is_user && p.rawPrompt)
      .sort((a, b) => Number(b.mesId) - Number(a.mesId))[0];
    if (!saved) return unavailable('当前聊天没有为可见的角色回复保存提示词');
    if (saved.main_api !== 'openai' || !Array.isArray(saved.rawPrompt)) return unavailable('这份正文使用文本补全，暂时只支持聊天补全的已存提示词');
    const raw = structuredClone(saved.rawPrompt);
    const original = raw.map(m => textOf(m.content)).join('\n\n');
    let definitions = [];
    try { definitions = (await presets(ctx)).find(p => p.name === saved.presetName)?.entries || []; } catch { /* unknown entries stay verbatim */ }
    const recognized = definitions.filter(e => !e.marker && e.text?.trim()).flatMap(e => {
      let text;
      try { text = ctx.substituteParams ? ctx.substituteParams(e.text) : e.text; } catch { return []; }
      return text?.trim() && raw.some(m => textOf(m.content).includes(text)) ? [{...e, text}] : [];
    });
    const overrides = entries[saved.presetName] || entries[`openai:${saved.presetName}`] || {};
    const own = Object.entries(ctx.extensionPrompts || {}).filter(([k]) => k.startsWith('sttts.')).map(([, p]) => p?.value).filter(v => typeof v === 'string' && v.trim());
    const removals = recognized.filter(e => overrides[e.id] !== true).map(e => e.text).sort((a, b) => b.length - a.length);
    const messages = raw.flatMap(m => {
      let content = textOf(m.content);
      // A short entry (「继续」, a bare name) is only taken out when it is the whole message: cut inside other messages
      // it would eat words out of the story itself.
      for (const text of removals) content = content.trim() === text.trim() ? '' : text.trim().length >= 30 ? content.split(text).join('') : content;
      // The phone's own rules (sttts.*) are known exactly and always come out, however short.
      for (const text of own) content = content.split(text).join('');
      if (!content.trim()) return [];
      return [{...m, content}];
    });
    const applyRegex = await regex();
    const visible = chat.slice(Number(saved.mesId)).filter(m => m && !m.is_system), added = [];
    for (const [i, m] of visible.entries()) {
      let content = String(m.mes || '');
      try { content = applyRegex(content, {user: !!m.is_user, depth: visible.length - 1 - i}); } catch { /* retain readable content */ }
      content = plainStory(content, preset.cleanTags || []);
      if (content) added.push({role: m.is_user ? 'user' : 'assistant', content: `${m.name || (m.is_user ? ctx.name1 || '用户' : ctx.name2 || '角色')}：${content}`});
    }
    messages.push(...added);
    if (preset.lore !== false && added.length) {
      const extra = await lore(() => ctx, {...loreOptions(preset), excludeText: original, texts: added.map(m => m.content)});
      if (extra?.trim() && !original.includes(extra.trim())) messages.push({role: 'system', content: `【新楼层触发的世界书】\n${extra}`});
    }
    return {available: true, reason: '', messages, presetName: saved.presetName || '', mesId: Number(saved.mesId), entries: recognized,
      info: {available: true, label: '已保存的正文提示词', count: messages.length, included: messages.length, total: messages.length, truncated: false}};
  };
}
export const readStoryExact = createStoryExact();
