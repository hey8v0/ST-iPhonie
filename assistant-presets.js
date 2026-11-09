// Assistant copies of saved Chat Completion prompts. Reading and toggling these never selects or saves a tavern preset.
const MARKERS = new Set(['chatHistory', 'dialogueExamples', 'charDescription', 'charPersonality', 'scenario', 'personaDescription', 'worldInfoBefore', 'worldInfoAfter']);
const TITLES = {chatHistory: '聊天记录', dialogueExamples: '对话示例', charDescription: '角色描述', charPersonality: '角色性格', scenario: '场景', personaDescription: '用户人设', worldInfoBefore: '世界书（前）', worldInfoAfter: '世界书（后）'};
const readContext = context => typeof context === 'function' ? context() : context || {};
const integer = (value, fallback) => Number.isFinite(Number(value)) && value !== null && value !== '' ? Math.max(0, Math.trunc(Number(value))) : fallback;
const roleOf = role => ['system', 'user', 'assistant'].includes(role) ? role : 'system';
const unavailable = () => Error('暂时读不到酒馆的聊天补全预设；请先在酒馆保存一个含提示词条目的聊天补全预设，或使用助手自带预设');

function promptOrder(preset, ctx, promptManager) {
  const orders = Array.isArray(preset.prompt_order) ? preset.prompt_order : [];
  if (orders.some(item => typeof item?.identifier === 'string')) return orders;
  const lists = orders.filter(item => Array.isArray(item?.order));
  if (!lists.length) return null;
  const config = promptManager?.configuration?.promptOrder;
  const active = promptManager?.activeCharacter?.id;
  const groupOrCharacter = ctx.groupId !== undefined && ctx.groupId !== null && ctx.groupId !== '' ? ctx.groupId : ctx.characterId;
  const candidates = config?.strategy === 'global'
    ? [config.dummyId, active, 100001, groupOrCharacter]
    : [active, groupOrCharacter, config?.dummyId, 100001];
  for (const id of candidates) {
    if (id === undefined || id === null || id === '') continue;
    const found = lists.find(item => String(item.character_id) === String(id));
    if (found) return found.order;
  }
  return lists[0].order;
}

function entriesOf(preset, ctx, promptManager) {
  let prompts = Array.isArray(preset?.prompts) ? preset.prompts : [];
  // Older saved CC presets may still use the three fields migrated by the host prompt manager.
  if (!prompts.length) prompts = ['main', 'nsfw', 'jailbreak']
    .filter(id => typeof preset?.[`${id}_prompt`] === 'string' && preset[`${id}_prompt`].trim())
    .map(id => ({identifier: id, name: id === 'main' ? '主提示词' : id === 'jailbreak' ? '历史后提示词' : '补充提示词', content: preset[`${id}_prompt`], role: 'system'}));
  const definitions = new Map();
  for (const [index, prompt] of prompts.entries()) {
    if (!prompt || typeof prompt !== 'object') continue;
    const id = String(prompt.identifier || `entry-${index}`);
    if (!definitions.has(id)) definitions.set(id, prompt);
  }
  const order = promptOrder(preset, ctx, promptManager), ordered = [], seen = new Set();
  const add = (id, enabled) => {
    const prompt = definitions.get(id);
    if (!prompt || seen.has(id)) return;
    seen.add(id);
    ordered.push({id, title: String(prompt.name || TITLES[id] || id), text: String(prompt.content || ''),
      enabled, role: roleOf(prompt.role), marker: prompt.marker === true || (prompt.marker === undefined && MARKERS.has(id)),
      depth: integer(prompt.injection_depth, 4), position: Number(prompt.injection_position) === 1 ? 1 : 0,
      order: integer(prompt.injection_order, 100)});
  };
  for (const entry of order || []) if (entry?.identifier) add(String(entry.identifier), entry.enabled === true);
  // Entries outside this order are available to enable in Assistant, but are off by default just as in the tavern.
  for (const [id, prompt] of definitions) add(id, order ? false : prompt.enabled !== false);
  return ordered;
}

/**
 * context is the host context or its getter. load is injectable for hosts/tests without /scripts/openai.js.
 * Returns saved presets only; getPresetSettings(name) is deliberately avoided because it exports current settings.
 */
export async function tavernAssistantPresets(context, {load = () => import('/scripts/openai.js')} = {}) {
  const ctx = readContext(context);
  let manager;
  try { manager = ctx.getPresetManager?.('openai'); } catch { throw unavailable(); }
  if (!manager) throw unavailable();
  let promptManager = ctx.promptManager;
  if (!promptManager) { try { promptManager = (await load()).promptManager; } catch { /* older host: use the saved order and current character */ } }
  let list;
  try { list = manager.getPresetList?.(); } catch { /* named lookup may still be supported */ }
  let names;
  try { names = manager.getAllPresets?.(); } catch { throw unavailable(); }
  if (!Array.isArray(names)) names = Array.isArray(list?.preset_names) ? list.preset_names : Object.keys(list?.preset_names || {});
  const results = [];
  for (const name of [...new Set(names.filter(name => typeof name === 'string' && name.trim()))]) {
    let preset;
    try {
      const index = Array.isArray(list?.preset_names) ? list.preset_names.indexOf(name) : list?.preset_names?.[name];
      const saved = typeof manager.getCompletionPresetByName === 'function' ? manager.getCompletionPresetByName(name) : list?.presets?.[index];
      if (!saved || typeof saved !== 'object') continue;
      preset = structuredClone(saved);
    } catch { continue; }
    const entries = entriesOf(preset, ctx, promptManager);
    if (entries.length) results.push({id: `openai:${name}`, name, entries});
  }
  if (!results.length) throw unavailable();
  return results;
}

// Host substituteParams and getCharacterCardFields can execute variable/custom macros. Expand only ordinary data here.
function substituteData(text, ctx) {
  const character = ctx.characters?.[ctx.characterId] || {}, card = character.data || {};
  const user = String(ctx.name1 || ''), char = String(ctx.name2 || character.name || card.name || '');
  const group = ctx.groups?.find(item => String(item?.id) === String(ctx.groupId));
  const members = (group?.members || []).map(avatar => ctx.characters?.find(item => item?.avatar === avatar)?.name).filter(Boolean).join(', ');
  const values = {user, char, name1: user, name2: char, group: members || char, charifnotgroup: members || char,
    description: character.description ?? card.description ?? '', personality: character.personality ?? card.personality ?? '',
    scenario: ctx.chatMetadata?.scenario || character.scenario || card.scenario || '',
    persona: ctx.powerUserSettings?.persona_description || '',
    mesexamples: ctx.chatMetadata?.mes_example || character.mes_example || card.mes_example || '',
    firstmessage: character.first_mes ?? card.first_mes ?? '', creator_notes: card.creator_notes || '',
    charversion: card.character_version || ''};
  return String(text).replace(/\{\{\s*([a-z_][a-z_0-9]*)\s*\}\}/gi, (match, key) => Object.hasOwn(values, key.toLowerCase()) ? String(values[key.toLowerCase()]) : match);
}

/**
 * Pure request-local rules in entry order. overrides maps entry identifiers to booleans; false disables, true enables.
 * Marker entries describe host context slots and produce no rule text. Position/depth/order are metadata for the caller.
 * Unsupported macros remain literal; this does not execute scripts, slash commands, variables, random or custom macros.
 */
export function buildTavernPresetMessages(preset, overrides = {}, context = {}) {
  const ctx = readContext(context), result = [];
  for (const entry of Array.isArray(preset?.entries) ? preset.entries : []) {
    const enabled = typeof overrides?.[entry.id] === 'boolean' ? overrides[entry.id] : entry.enabled === true;
    if (!enabled || entry.marker) continue;
    const content = substituteData(entry.text || '', ctx);
    if (!content.trim()) continue;
    result.push({role: roleOf(entry.role), content, depth: integer(entry.depth, 4), position: Number(entry.position) === 1 ? 1 : 0, order: integer(entry.order, 100)});
  }
  return result;
}

// Keep the assistant contract while sharing the exact same expansion and ordering.
export const buildTavernAssistantMessages = buildTavernPresetMessages;
