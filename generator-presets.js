// Request-local application of a saved preset. Never re-label its instructions
// as optional style advice, or change the tavern's selected preset globally.
import {buildTavernPresetMessages} from './assistant-presets.js';

export function generatorPresetMessages(preset, overrides, ctx, task) {
  const expand = text => typeof ctx.substituteParams === 'function' ? ctx.substituteParams(text) : text;
  const character = ctx.characters?.[ctx.characterId] || {}, card = character.data || {};
  const slots = {
    charDescription: character.description ?? card.description ?? '',
    charPersonality: character.personality ?? card.personality ?? '',
    scenario: ctx.chatMetadata?.scenario || character.scenario || card.scenario || '',
    personaDescription: ctx.powerUserSettings?.persona_description || '',
    dialogueExamples: ctx.chatMetadata?.mes_example || character.mes_example || card.mes_example || '',
  };
  // The generator's task already contains the selected book/context/characters
  // and world information. Place it at chatHistory, where this request belongs.
  const history = [{role: 'user', content: task.map(m => m.content).filter(Boolean).join('\n\n')}];
  const messages = [], injected = [];
  let placed = false;
  for (const entry of preset.entries || []) {
    if (!(typeof overrides?.[entry.id] === 'boolean' ? overrides[entry.id] : entry.enabled)) continue;
    if (entry.marker) {
      if (entry.id === 'chatHistory') { messages.push(...history); placed = true; }
      else if (slots[entry.id]) messages.push({role: entry.role || 'system', content: expand(String(slots[entry.id]))});
      continue;
    }
    // Expand custom/variable macros once through the host when available.
    const source = {...entry, text: expand(entry.text || '')};
    const [rule] = buildTavernPresetMessages({entries: [source]}, {[entry.id]: true}, ctx);
    if (!rule) continue;
    if (rule.position === 1) injected.push(rule);
    else messages.push({role: rule.role, content: rule.content});
  }
  if (!placed) messages.push(...history);
  for (const rule of injected.sort((a,b) => b.depth - a.depth || b.order - a.order)) {
    messages.splice(Math.max(0, messages.length - rule.depth), 0, {role: rule.role, content: rule.content});
  }
  return messages;
}
