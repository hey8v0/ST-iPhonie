// 记忆, tavern side: writes up the older messages of each phone chat in layers after replies (core/memory.js), and
// gives the chat, call, 查手机, 朋友圈 and (when switched on) story requests what a chat remembers: the written-up
// layers and the older messages that match what is being talked about now. Writing uses the 文字模型 and costs one
// request per summary; searching is local unless a 向量模型 is set up.
import {currentDm} from './core/chats.js';
import {nextBatch, nextMerge, addNode, buildMemoryRequest, parseMemory, memoryText, chunks, recall, recallText, textKey, transcript, roots, storyMemoryText, unwritten, STORY_MEMORY} from './core/memory.js';
import {activeChatPreset} from './core/chat.js';

// How many requests one go may make: after a reply only a little (a long backlog is caught up over several replies),
// when the user asks for it more.
const AUTO_STEPS = 2, MANUAL_STEPS = 12;

export function createMemoryHost({context, settings, backend, notice = () => {}}) {
  const busy = new Map(), status = new Map();
  let storyText = '', storyTimer = 0, storyRun = 0, storyError = '', storyDone = Promise.resolve(), storyFor = null, closed = false;
  // Which card the story memory is for (the open character, or the group).
  const cardKey = () => { const ctx = context(); return ctx ? `${ctx.groupId || ''}|${ctx.name2 || ''}` : ''; };
  const userName = () => context()?.name1 || '我';
  const options = () => activeChatPreset(settings().chat).memory;
  const windowSize = () => activeChatPreset(settings().chat).history;
  const who = thread => thread.type === 'group' ? thread.name : thread.members[0] || thread.name;
  const note = (threadId, patch) => { status.set(threadId, {...status.get(threadId), ...patch}); backend.emit('memory', {threadId}); };

  /** Writes up what is due in one chat: batches of older messages, then merges. force: 立即整理. */
  function tidy(threadId, {force = false} = {}) {
    if (busy.has(threadId)) return busy.get(threadId);
    const job = (async () => {
      const o = options();
      if (!o.enabled && !force) return 0;
      let steps = 0, written = 0;
      note(threadId, {busy: true, error: ''});
      try {
        while (steps < (force ? MANUAL_STEPS : AUTO_STEPS) && !closed) {
          const thread = await backend.chats.get(threadId);
          if (!thread) return written;
          const book = await backend.memoryBook(threadId), name = who(thread), user = userName(), group = thread.type === 'group';
          const batch = nextBatch(thread, book, {window: windowSize(), batch: o.batch, force: force && !written});
          const merge = batch.length ? null : nextMerge(book, {stage: o.stage, epic: o.epic});
          if (!batch.length && !merge) break;
          steps++;
          const prompt = buildMemoryRequest(batch.length ? {prompts: settings().promptRules, level: 0, messages: batch, user, who: name, group} : {prompts: settings().promptRules, level: merge.level, nodes: merge.nodes, user, who: name, group});
          const text = parseMemory(await backend.generateText(context(), {prompt, trimNames: false}));
          await backend.memoryChange(threadId, current => batch.length
            ? addNode(current, {level: 0, text, from: batch[0].at, to: batch.at(-1).at, count: batch.length}, {through: batch.at(-1)})
            // The nodes merged may have been deleted or merged meanwhile: only those still open are covered.
            : addNode(current, {level: merge.level, text, covers: merge.nodes.map(n => n.id).filter(id => roots(current).some(r => r.id === id))}), name, book);
          written++;
        }
        note(threadId, {busy: false, error: '', at: Date.now()});
        if (written) refreshStory();
        return written;
      } catch (error) {
        note(threadId, {busy: false, error: error.message});
        if (force) throw error;
        return written;
      }
    })().finally(() => busy.delete(threadId));
    busy.set(threadId, job);
    return job;
  }
  /** After a reply (or a call) in a chat: write up in the background; failures are kept for the 记忆 page. */
  function after(threadId) { if (options().enabled) tidy(threadId).catch(() => {}); }

  /** Vectors of the pieces and of the query, when a 向量模型 is set up; null otherwise (or when it fails: local only). */
  async function vectors(threadId, pieces, query) {
    if (!backend.embedReady()) return null;
    try {
      const model = settings().embed.model + '@' + settings().embed.url;
      const saved = await backend.memoryVectors(threadId), items = saved?.model === model ? {...saved.items} : {};
      const missing = [...new Set(pieces.map(p => textKey(p.text)))].filter(key => !items[key]), texts = new Map(pieces.map(p => [textKey(p.text), p.text]));
      if (missing.length) {
        const made = await backend.embed(missing.map(key => texts.get(key)));
        missing.forEach((key, i) => { items[key] = made[i]; });
        // Only the pieces there still are.
        const keep = new Set(pieces.map(p => textKey(p.text)));
        for (const key of Object.keys(items)) if (!keep.has(key)) delete items[key];
        await backend.memorySaveVectors(threadId, {model, items});
      }
      const [q] = await backend.embed([query]);
      return new Map([...Object.entries(items), ['query', q]]);
    } catch (error) {
      note(threadId, {vectorError: error.message});
      return null;
    }
  }

  /**
   * What a chat remembers, for a request: the written-up layers and, when `query` (the latest messages) is given, the
   * older messages that match it. thread: the chat (with messages). Returns {text, used} — '' when memory is off.
   */
  async function contextFor(thread, {query = '', cap, recallCount, record = true} = {}) {
    const o = options();
    if (!o.enabled || !thread) return {text: '', used: null};
    const name = who(thread), book = await backend.memoryBook(thread.id);
    const kept = memoryText(book, {who: thread.type === 'group' ? `群聊「${name}」` : `和${name}`, ...(cap ? {cap} : {})});
    let found = [];
    const limit = recallCount ?? o.recall;
    if (limit && String(query).trim()) {
      const pieces = chunks(thread, {window: windowSize(), user: userName()});
      if (pieces.length) found = recall(pieces, query, {limit, vectors: await vectors(thread.id, pieces, query)});
    }
    const text = [kept, recallText(found, {who: thread.type === 'group' ? '群里' : `和${name}`})].filter(Boolean).join('\n\n');
    const used = {at: Date.now(), nodes: roots(book).length, recalled: found.map(p => ({from: p.from, to: p.to, score: p.score, text: p.text.slice(0, 300)})), vector: found.some(p => p.semantic !== null)};
    if (record) note(thread.id, {used});
    return {text, used};
  }
  /** The private chat with someone (their memory is what 查手机 and 朋友圈 can draw on). */
  async function privateChat(name) {
    const thread = currentDm(await backend.threads(), name);
    return thread ? backend.chats.get(thread.id) : null;
  }
  /** The memory of private chats with these people, for 查手机 and 朋友圈 (written-up layers only, kept short). */
  async function aboutPeople(names, {cap = 2500} = {}) {
    if (!options().enabled) return '';
    const parts = [];
    for (const name of names) {
      const thread = await privateChat(name);
      if (!thread) continue;
      const {text} = await contextFor(thread, {cap: Math.max(600, Math.floor(cap / Math.max(1, names.length))), recallCount: 0, record: false});
      if (text) parts.push(text);
    }
    return parts.join('\n\n');
  }

  // 正文: the phone chats with the people of the open card (their memory and the last messages), ready before inject()
  // asks, since the story's prompt is put together without waiting.
  function refreshStory(delay = 300) {
    clearTimeout(storyTimer);
    storyFor = cardKey();
    // Only the latest run writes: an older one still reading (for the card open before) would put back its answer.
    const run = ++storyRun, put = text => { if (run === storyRun) storyText = text; };
    let finish;
    storyDone = new Promise(resolve => { finish = resolve; });
    storyTimer = setTimeout(async () => {
      try {
        const o = options(), ctx = context();
        if (!ctx) { put(''); return; }
        if (o.story) await moveOldSwitch(ctx);
        // 一直带着: the chats (of the card open now) the user marked, each with its written-up memory and every message
        // not written up yet, so nothing in between is missed; too many of those: the newest, and a write-up now.
        // Only the chats of the card open now: made in it, or with one of its characters.
        const key = backend.cardKey?.() || '', names = cardNames(ctx);
        const marked = (await backend.threads()).filter(t => t.story && ((key && t.space === key) || t.members.some(n => names.has(n))));
        const parts = [], user = userName(), budget = Math.max(1200, Math.floor(6000 / Math.max(1, marked.length)));
        for (const row of marked) {
          const thread = await backend.chats.get(row.id);
          if (!thread) continue;
          const name = who(thread), group = thread.type === 'group';
          const {text} = await contextFor(thread, {cap: budget, recallCount: 0, record: false});
          const fresh = unwritten(thread, o.enabled ? await backend.memoryBook(thread.id) : null).filter(m => m.kind !== 'system');
          const kept = [];
          for (let i = fresh.length - 1, size = 0; i >= 0; i--) {
            const line = transcript([fresh[i]], user);
            if (kept.length && size + line.length > budget) break;
            kept.unshift(fresh[i]); size += line.length;
          }
          if (o.enabled && kept.length < fresh.length) tidy(thread.id, {force: true}).catch(() => {});
          const recent = kept.length ? `【${user}和${group ? `群聊「${name}」` : name}在手机上${text ? '后来' : ''}的聊天${kept.length < fresh.length ? `（最近 ${kept.length} 条）` : ''}】\n${transcript(kept, user)}` : '';
          if (text || recent) parts.push([text, recent].filter(Boolean).join('\n'));
        }
        put(parts.length ? `【小手机】（${user}和角色们在手机上聊过的事，角色都记得；剧情里自然提起就好，不用复述）\n${parts.join('\n\n')}` : '');
        if (run === storyRun) storyError = '';
      } catch (error) { put(''); if (run === storyRun) storyError = error.message; }
      finish();
    }, delay);
  }
  /** The characters of the card open now (the character, or the group's members). */
  function cardNames(ctx) {
    const names = new Set([ctx.name2].filter(Boolean));
    if (ctx.groupId) for (const member of ctx.groups?.find(g => g.id === ctx.groupId)?.members || []) { const n = ctx.characters?.find(c => c.avatar === member)?.name; if (n) names.add(n); }
    return names;
  }
  /**
   * Before 0.7.52 one switch (预设 → 聊天 → 记忆「正文也带上」) brought the open card's private chats; now each chat
   * has its own (带进剧情 → 一直带着). Those chats are marked once and the old switch is put off.
   */
  async function moveOldSwitch(ctx) {
    for (const name of cardNames(ctx)) {
      const thread = await privateChat(name);
      if (thread && !thread.story) await backend.chatMutate(thread.id, () => backend.chats.update(thread.id, {story: true})).catch(() => {});
    }
    const preset = activeChatPreset(settings().chat);
    try { backend.saveChatPreset({...preset, memory: {...preset.memory, story: false}}); } catch { /* tried again next time */ }
  }
  /** Waits (a little) for the story memory being worked out, so a story request right after changing cards has it. */
  function storyReady(limit = 1500) {
    // Worked out for another card (the card changed and the tavern has not said so yet): again, now.
    if (storyFor !== cardKey()) refreshStory(0);
    return Promise.race([storyDone, new Promise(r => setTimeout(r, limit))]);
  }
  /** Prompt entries for inject(): the phone memory for the story, placed like 带进剧情. */
  function storyPlan() {
    if (!storyText) return [];
    const i = activeChatPreset(settings().chat).injection, inChat = i.position === 'in_chat';
    return [{key: 'sttts.entry.memory', text: storyText, position: {in_chat: 1, in_prompt: 0, before_prompt: 2}[i.position], depth: inChat ? i.depth : 0, role: inChat ? {system: 0, user: 1, assistant: 2}[i.role] : 0}];
  }
  // The phone's chats change: worked out again (the tavern side calls refreshStory once the phone's data is open, and
  // when the open card or the settings change).
  const unsubscribe = backend.subscribe?.(event => { if (event.type === 'chat' && !event.typing || event.type === 'memory' && event.reset) refreshStory(); });

  /** 更早的剧情: what the picked memory plugins put into the tavern's extension prompts. */
  function storyMemory() { return storyMemoryText(context()?.extensionPrompts, options().storyKeys); }
  /** Every extension prompt there is now (not the phone's own), for picking which hold story memory. */
  function storySources() {
    const prompts = context()?.extensionPrompts || {}, picked = new Set(options().storyKeys);
    const found = Object.entries(prompts).filter(([key, p]) => !key.startsWith('sttts.') && typeof p?.value === 'string' && p.value.trim())
      .map(([key, p]) => ({key, name: STORY_MEMORY[key] || '', chars: p.value.trim().length, preview: p.value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 90), picked: picked.has(key)}));
    // Picked keys that have nothing in them right now are listed too, so they can be unpicked.
    for (const key of picked) if (!found.some(x => x.key === key)) found.push({key, name: STORY_MEMORY[key] || '', chars: 0, preview: '', picked: true});
    return found;
  }

  return {
    storyMemory, storySources,
    tidy, after, contextFor, aboutPeople, storyPlan, storyReady, refreshStory,
    status: threadId => ({...status.get(threadId), busy: busy.has(threadId), ...(storyError ? {storyError} : {})}),
    close() { closed = true; clearTimeout(storyTimer); unsubscribe?.(); }
  };
}
