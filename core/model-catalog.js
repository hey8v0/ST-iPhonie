// Shared discovery rules for the built-in speech engines. A directory tells us what
// exists, not which HTTP/WebSocket protocol a newly released model speaks.
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/;
export const voiceModelId = (engine, id) =>
  ['fish', 'mini', 'eleven', 'mimo', 'doubao'].includes(engine) &&
  typeof id === 'string' && ID.test(id);

/** Models seen on a provider's directory; no API keys or account data are retained. */
export function parseVoiceModels(engine, json) {
  const rows = engine === 'eleven' ? json : json?.data;
  if (!Array.isArray(rows)) throw Error('模型目录不是列表');
  const byId = new Map();
  for (const entry of rows.slice(0, 500)) {
    if (!entry || typeof entry !== 'object') continue;
    if (engine === 'eleven' && entry.can_do_text_to_speech !== true) continue;
    const raw = String(engine === 'eleven' ? entry.model_id || '' : entry.id || '');
    const id = engine === 'fish' ? raw.replace(/^fish-audio\//, '') : raw;
    if (!voiceModelId(engine, id)) continue;
    byId.set(id, {id, name: String(entry.name || entry.title || id).slice(0, 100)});
  }
  return [...byId.values()];
}

/** Keep stable presets, add live models, and never hide the model already saved. */
export function mergeVoiceModels(engine, preset, live = [], selected = '') {
  const models = new Map();
  for (const id of preset) if (voiceModelId(engine, id)) models.set(id, {id, name:id, supported:true, reason:''});
  for (const row of live) if (voiceModelId(engine, row.id)) {
    const old = models.get(row.id);
    models.set(row.id, {...old, id:row.id, name:row.name || row.id, supported:true, reason:''});
  }
  if (voiceModelId(engine, selected) && !models.has(selected))
    models.set(selected, {id:selected, name:selected, supported:true, reason:'手动填写或上次保存的模型，请以实际接口能力为准'});
  return [...models.values()];
}

/** Only a known, explicitly adapted model may opt in to a different transport. */
export const voiceTransport = (engine, model) =>
  engine === 'eleven' && model === 'eleven_v4_turbo' ? 'eleven-dialogue-ws' : 'http';
