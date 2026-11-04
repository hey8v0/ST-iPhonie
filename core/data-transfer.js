// Portable conversation data for backup and sync. Validate before writing anything: unlike live normalization,
// imports must not silently truncate messages, repair broken memory graphs or invent IDs/timestamps.
import {ASSISTANT_LIMITS, assertAssistantThread, assistantAttachments, assistantMeta} from './assistant.js';
import {MEMORY_LIMITS, bookId} from './memory.js';

const fail = (field, detail = '格式无效') => { throw Object.assign(Error(`备份或同步数据损坏：${field}${detail}`), {code: 'DATA_TRANSFER'}); };
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const object = (value, field) => { if (!record(value)) fail(field); return value; };
const list = (value, field, max = Infinity) => {
  if (!Array.isArray(value) || value.length > max || Object.keys(value).filter(key => /^(0|[1-9]\d*)$/.test(key)).length !== value.length) fail(field);
  return value;
};
const string = (value, field, max, {empty = false, id = false} = {}) => {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || (id && (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)))) fail(field);
  return value;
};
const number = (value, field, max = Number.MAX_SAFE_INTEGER, integer = true) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) fail(field);
  return value;
};
const optionalNumber = (row, key, field, max, integer = true) => row[key] === undefined ? undefined : number(row[key], `${field}.${key}`, max, integer);
const flag = (row, key, field) => { if (row[key] !== undefined && typeof row[key] !== 'boolean') fail(`${field}.${key}`); return row[key]; };
const unique = (rows, field) => { const ids = new Set(); for (const row of rows) { if (ids.has(row.id)) fail(field, '包含重复 ID'); ids.add(row.id); } return rows; };
const generation = (row, field) => row.memoryRevision === undefined ? 0 : number(row.memoryRevision, `${field}.memoryRevision`);

/** One portable memory book. Scope, local concurrency versions and unrecognized fields are omitted. */
export function normalizeMemoryBook(value) {
  const b = object(value, '记忆'), threadId = string(b.threadId, '记忆.threadId', 512, {id: true});
  if (b.id !== bookId(threadId) || b.kind !== 'memory') fail('记忆.id/kind');
  generation(b, '记忆');
  const at = number(b.at, '记忆.at'), name = b.name === undefined ? '' : string(b.name, '记忆.name', 60, {empty: true});
  const through = b.through === undefined ? '' : string(b.through, '记忆.through', 512, {empty: true, id: true});
  const throughAt = b.throughAt === undefined ? 0 : number(b.throughAt, '记忆.throughAt');
  const nodes = unique(list(b.nodes, '记忆.nodes', MEMORY_LIMITS.nodes).map((value, index) => {
    const n = object(value, `记忆.nodes[${index}]`), field = `记忆.nodes[${index}]`;
    const id = string(n.id, field + '.id', 100, {id: true}), level = number(n.level, field + '.level', 9);
    const text = string(n.text, field + '.text', MEMORY_LIMITS.text);
    const from = number(n.from, field + '.from'), to = number(n.to, field + '.to');
    if (from > to) fail(field, '的时间范围无效');
    const count = n.count === undefined ? 0 : number(n.count, field + '.count', 100000);
    const covers = list(n.covers === undefined ? [] : n.covers, field + '.covers', 50).map(id => string(id, field + '.covers', 100, {id: true}));
    if (new Set(covers).size !== covers.length) fail(field + '.covers', '包含重复 ID');
    const coveredBy = n.coveredBy === undefined ? '' : string(n.coveredBy, field + '.coveredBy', 100, {empty: true, id: true});
    const edited = flag(n, 'edited', field);
    return {id, level, text, from, to, count, covers, coveredBy, at: number(n.at, field + '.at'), ...(edited !== undefined ? {edited} : {})};
  }), '记忆.nodes');
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) {
    for (const id of node.covers) {
      const child = byId.get(id);
      if (!child || child.level >= node.level || child.coveredBy !== node.id) fail('记忆覆盖关系');
    }
    if (node.coveredBy) {
      const parent = byId.get(node.coveredBy);
      if (!parent || parent.level <= node.level || !parent.covers.includes(node.id)) fail('记忆覆盖关系');
    }
  }
  return {id: bookId(threadId), kind: 'memory', threadId, name, at, through, throughAt, nodes};
}

export function normalizeMemoryBooks(rows) { return unique(list(rows, '记忆列表').map(normalizeMemoryBook), '记忆列表'); }

function metadata(value, field) {
  const meta = object(value, field);
  optionalNumber(meta, 'elapsedMs', field, 86400000, false);
  optionalNumber(meta, 'reasoningMs', field, 86400000, false);
  for (const key of ['requestedModel', 'reportedModel', 'provider']) if (meta[key] !== undefined) string(meta[key], `${field}.${key}`, 200, {empty: true});
  if (meta.reasoning !== undefined) string(meta.reasoning, field + '.reasoning', ASSISTANT_LIMITS.text, {empty: true});
  if (meta.reasoningFormat !== undefined) {
    object(meta.reasoningFormat, field + '.reasoningFormat');
    for (const key of ['prefix', 'suffix']) if (meta.reasoningFormat[key] !== undefined) string(meta.reasoningFormat[key], `${field}.reasoningFormat.${key}`, 2000, {empty: true});
  }
  if (meta.image !== undefined) {
    object(meta.image, field + '.image');
    string(meta.image.photoId, field + '.image.photoId', 200, {id: true});
    if (meta.image.prompt !== undefined) string(meta.image.prompt, field + '.image.prompt', 6000, {empty: true});
  }
  return assistantMeta(meta);
}

function message(value, index) {
  const m = object(value, `助手消息[${index}]`), field = `助手消息[${index}]`;
  const id = string(m.id, field + '.id', 200, {id: true});
  if (!['user', 'assistant'].includes(m.role)) fail(field + '.role');
  const text = string(m.text, field + '.text', m.role === 'assistant' ? ASSISTANT_LIMITS.reply : ASSISTANT_LIMITS.text, {empty: true}), at = number(m.at, field + '.at');
  let attachments;
  if (m.attachments !== undefined) {
    if (m.role !== 'user') fail(field + '.attachments');
    // The live attachment validator already checks sizes, image data URLs and text payloads without truncation.
    try { attachments = assistantAttachments(list(m.attachments, field + '.attachments', ASSISTANT_LIMITS.attachments)); }
    catch (error) { fail(field + '.attachments', `无效（${error.message}）`); }
  }
  if (!text.trim() && !attachments?.length) fail(field + '.text', '不能为空');
  const meta = m.meta === undefined ? undefined : metadata(m.meta, field + '.meta');
  if (m.role === 'user' && meta !== undefined) fail(field + '.meta');
  const editedAt = optionalNumber(m, 'editedAt', field);
  let variants, selected;
  if (m.variants !== undefined || m.selected !== undefined) {
    if (m.role !== 'assistant') fail(field + '.variants');
    variants = list(m.variants, field + '.variants', ASSISTANT_LIMITS.variants).map((value, i) => {
      const variant = object(value, `${field}.variants[${i}]`);
      return {text: string(variant.text, `${field}.variants[${i}].text`, ASSISTANT_LIMITS.reply), at: number(variant.at, `${field}.variants[${i}].at`),
        ...(variant.meta === undefined ? {} : {meta: metadata(variant.meta, `${field}.variants[${i}].meta`)})};
    });
    if (!variants.length) fail(field + '.variants');
    selected = number(m.selected, field + '.selected', variants.length - 1);
    const active = variants[selected];
    if (active.text !== text || active.at !== at || JSON.stringify(active.meta) !== JSON.stringify(meta)) fail(field + '.selected', '与当前回复不匹配');
  }
  return {id, role: m.role, text, at, ...(attachments !== undefined ? {attachments} : {}), ...(meta !== undefined ? {meta} : {}),
    ...(editedAt !== undefined ? {editedAt} : {}), ...(variants ? {variants, selected} : {})};
}

/** Full assistant conversations with their matching book. Vectors are deliberately rebuilt on each device.
 * Local revision/memoryRevision values are checked, then stripped; an importer assigns fresh local generations. */
export function normalizeAssistantThreads(rows) {
  return unique(list(rows, '助手会话列表').map((value, index) => {
    const row = object(value, `助手会话[${index}]`), field = `助手会话[${index}]`;
    try { assertAssistantThread(row); } catch { fail(field); }
    const id = string(row.id, field + '.id', 200, {id: true});
    if (!id.startsWith('assistant:') || id.length === 'assistant:'.length) fail(field + '.id');
    optionalNumber(row, 'revision', field); const memoryRevision = generation(row, field);
    const title = string(row.title, field + '.title', ASSISTANT_LIMITS.title);
    const createdAt = number(row.createdAt, field + '.createdAt'), updatedAt = number(row.updatedAt, field + '.updatedAt'), at = number(row.at, field + '.at');
    const restoredAt = optionalNumber(row, 'restoredAt', field);
    const titleEdited = flag(row, 'titleEdited', field);
    const messages = unique(list(row.messages, field + '.messages', ASSISTANT_LIMITS.messages).map(message), field + '.messages');
    let memory = null;
    if (row.memory !== undefined && row.memory !== null) {
      memory = normalizeMemoryBook(row.memory);
      if (memory.threadId !== id || generation(row.memory, field + '.memory') !== memoryRevision) fail(field + '.memory', '不属于当前会话版本');
    }
    return {id, kind: 'assistant', title, createdAt, updatedAt, at, ...(restoredAt !== undefined ? {restoredAt} : {}), ...(titleEdited !== undefined ? {titleEdited} : {}), messages, memory};
  }), '助手会话列表');
}
