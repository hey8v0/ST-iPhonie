// 自动挑音色, tavern side: when a character speaks for the first time (or 重新挑 in the 角色 App), the text model picks
// their voice — from the 候选音色池 first, else from the voice library of the engine most roles use — and the route is
// saved marked as picked automatically (autoVoice, with the reason). One character at a time.
import {normalizePool, poolLine, voiceProfile, pickRequest, parsePick, searchRequest, parseSearch} from './core/auto-voice.js';
import {plainStory} from './core/chat.js';
import {findRoute} from './core/routes.js';

const ENGINE_NAMES = {fish: 'Fish Audio', mini: 'MiniMax', eleven: 'ElevenLabs', mimo: 'MiMo', doubao: '豆包语音', custom: '自己的接口'};

/** saidBy(name): what that character said in the story (their lines' translations), newest last. */
export function createVoiceHost({context, settings, backend, saidBy = () => []}) {
  const working = new Map();
  let chain = Promise.resolve();
  const ask = prompt => backend.generateText(context(), {prompt, trimNames: false, responseLength: 1500});

  function profileOf(name) {
    const ctx = context(), card = ctx?.characters?.find?.(c => c?.name === name);
    const story = [];
    for (const m of (ctx?.chat || []).slice(-40)) {
      if (m?.is_system) continue;
      for (const part of plainStory(String(m?.mes || '')).split(/\n+/)) if (part.includes(name)) story.push(`${m.name || ''}：${part.trim().slice(0, 200)}`);
    }
    return voiceProfile({name, card: card ? [card.description, card.personality].filter(Boolean).join('\n') : '', said: saidBy(name), story});
  }
  /** The engine to search: the one most voiced roles use, else Fish (its public library needs no account). */
  function libraryEngine() {
    const counts = {};
    for (const r of settings().routes) if (r.voice && ['fish', 'mini', 'eleven'].includes(r.engine)) counts[r.engine] = (counts[r.engine] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'fish';
  }
  async function fromLibrary(profile, engine) {
    const want = parseSearch(await ask(searchRequest(profile, engine, settings().promptRules)));
    const connection = settings().connections[engine];
    let found = [];
    if (engine === 'fish') {
      for (const word of want.words.length ? want.words : ['']) {
        try { found.push(...(await backend.voices('fish', connection, {search: word})).voices); } catch { /* one search failing leaves the others */ }
      }
      const seen = new Set();
      found = found.filter(v => !seen.has(v.id) && seen.add(v.id)).sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 40);
    } else {
      found = (await backend.voices(engine, connection, {})).voices;
      // A long list: the voices whose description says the right gender first.
      const fits = v => !want.gender || (want.gender === 'female' ? /female|woman|girl|女/i : /\bmale\b|\bman\b|boy|男/i).test(`${v.name} ${v.info || ''}`);
      if (found.length > 60) found = [...found.filter(fits), ...found.filter(v => !fits(v))];
      found = found.slice(0, 60);
    }
    if (!found.length) return null;
    const candidates = found.map(v => ({engine, voice: v.id, model: '', name: v.name, label: v.info ? `${v.name} — ${v.info}` : v.name}));
    const chosen = parsePick(await ask(pickRequest(profile, candidates, {allowNone: false, prompts: settings().promptRules})), candidates.length);
    return chosen ? {...candidates[chosen.index], reason: chosen.reason, from: `${ENGINE_NAMES[engine]} 音色库`} : null;
  }
  async function choose(name, force) {
    const route = findRoute(settings().routes, name);
    if (route?.voice && !force) return route;
    const profile = profileOf(name), pool = normalizePool(settings().voicePool);
    let chosen = null;
    if (pool.length) {
      const candidates = pool.map(v => ({...v, label: `[${ENGINE_NAMES[v.engine]}] ${poolLine(v)}`}));
      const picked = parsePick(await ask(pickRequest(profile, candidates, {prompts: settings().promptRules})), candidates.length);
      if (picked) chosen = {...candidates[picked.index], reason: picked.reason, from: '候选池'};
    }
    if (!chosen) chosen = await fromLibrary(profile, libraryEngine());
    if (!chosen) throw Error(`没能给「${name}」挑到音色，可以在角色 App 里手动选`);
    return backend.saveRoute({...(route || {}), name, engine: chosen.engine, voice: chosen.voice, model: chosen.model || '',
      autoVoice: true, autoName: chosen.name, autoReason: `${chosen.from}：${chosen.reason || chosen.name}`});
  }
  /** Picks a voice for name (force: again, though they have one). Resolves to the saved route. */
  function pick(name, {force = false} = {}) {
    if (working.has(name)) return working.get(name);
    const job = chain.then(() => choose(name, force)).finally(() => working.delete(name));
    chain = job.catch(() => {});
    working.set(name, job);
    return job;
  }
  return {pick, busy: name => working.has(name)};
}
