// Independent conversations with the phone's text model. Nothing here writes to the tavern story or selects its preset.
import {promptText} from './core/prompt-rules.js';
import {ASSISTANT_IMAGE_SLOT, ASSISTANT_LIMITS, ASSISTANT_WANTS_MUSIC, assistantMusicRule, buildAssistantPrompt, normalizeAssistant, assistantHistory, assistantMeta, assistantReasoningFormat, assistantReasoningTimer, assistantThoughts, assistantWantsImage, assistantConfirmsImage, assistantDirectImage, assistantClip, assistantJoin, assistantFirstTitle, assistantTitleText} from './core/assistant.js';
import {activeText, customRequest, streamText, responseMetadata, failure, replyText} from './core/llm.js';
import {modelRules} from './core/state.js';
import {promptPlan, dialogueContract} from './core/protocol.js';
import {tavernAssistantPresets, buildTavernAssistantMessages} from './assistant-presets.js';
import {readStoryExact} from './story-exact.js';
import {activeChatPreset} from './core/chat.js';
import {createAssistantContext} from './assistant-context.js';
import {assistantBlocks, assistantDrawGuide, pictureInputs} from './core/draw.js';
import {createAssistantMemoryHost, assistantMemoryThread} from './host-assistant-memory.js';

// 智能界面: small native pieces of UI the model may put in a reply (like ChatGPT's visual answers), drawn by the phone
// with its own theme. Only when they make the answer clearer; the reply text stays the main thing.
export const ASSISTANT_VISUALS = promptText({}, 'assistant', 'visuals');
const cancelled = () => Object.assign(new Error('已取消助手回复'), {name: 'AbortError'});
const checkSignal = signal => { if (signal?.aborted) throw cancelled(); };
export const loadCompletionModule = () => import('/scripts/openai.js');
export const hasCompletionService = ctx => ctx.mainApi === 'openai' && ctx.ChatCompletionService?.presetToGeneratePayload && ctx.ChatCompletionService?.sendRequest;

/** Capture before awaiting: the saved preset and live connection can change while reference material is prepared. */
async function completionSnapshot(ctx, presetName, load = loadCompletionModule) {
  const current = structuredClone(ctx.chatCompletionSettings || {});
  const saved = presetName ? ctx.getPresetManager?.('openai')?.getCompletionPresetByName(presetName) : {};
  if (presetName && !saved) throw Error('这个酒馆预设已经不在了，请重新选择');
  const selected = structuredClone(saved || {}), module = await load(), mapping = module.settingsToUpdate;
  if (!mapping || typeof mapping !== 'object') throw Error('当前酒馆版本未提供聊天补全设置映射，请更新酒馆');
  const settings = {...current};
  for (const [key, value] of Object.entries(selected)) {
    const field = mapping[key]?.[1];
    if (field && value !== undefined) settings[field] = structuredClone(value);
  }
  // Convert the complete effective settings back to preset keys so presetToGeneratePayload cannot reread changed
  // sampling/connection fields from its live oai_settings fallback. The same settings determine reference budget.
  const preset = Object.fromEntries(Object.entries(mapping).filter(([, row]) => row?.[1] && Object.hasOwn(settings, row[1])).map(([key, row]) => [key, structuredClone(settings[row[1]])]));
  if (settings.bias_presets !== undefined) preset.bias_presets = structuredClone(settings.bias_presets);
  const modelOf = ctx.getChatCompletionModel || module.getChatCompletionModel;
  if (typeof modelOf !== 'function') throw Error('当前酒馆版本未提供模型读取接口，请更新酒馆');
  const model = modelOf(settings);
  // OpenRouter's website model intentionally uses null; other sources require an actual model identifier.
  if (!(typeof model === 'string' && model.trim()) && !(model === null && settings.chat_completion_source === 'openrouter')) throw Error('请先在酒馆选择可用的聊天补全模型');
  return {settings, preset, model};
}

/** Uses the current connection, but passes a request-local preset and an independent abort signal. */
export async function requestAssistantText(ctx, backend, settings, messages, options = {}) {
  const prompt = messages.filter(m => typeof m.content !== 'string' || m.content.trim());
  const run = () => requestAssistantTextRaw(ctx, backend, settings, prompt, options);
  const result = await (backend.requestLog ? backend.requestLog.run(options.label || '助手', {connection: activeText(settings.text).source, messages: prompt}, run) : run());
  backend.ledger?.text(options.use || 'assistant', prompt, typeof result === 'string' ? result : result?.text);
  return result;
}
async function requestAssistantTextRaw(ctx, backend, settings, messages, {presetName = '', signal, completion, loadCompletion = loadCompletionModule, details = false, reasoningFormat = assistantReasoningFormat(ctx.powerUserSettings?.reasoning), now, onProgress} = {}) {
  const text = activeText(settings.text), timer = assistantReasoningTimer(reasoningFormat, now);
  const progress = (content, meta) => {
    checkSignal(signal); timer.observe(content, meta.reasoning || '');
    onProgress?.(content, {...meta, ...timer.metadata()});
  };
  if (text.source === 'custom') {
    const result = await customRequest({text, key: backend.textKeys.get(text.id) || '', prompt: messages, signal, details, onProgress: progress, fetch: backend.textFetch || globalThis.fetch});
    if (details) Object.assign(result.meta, timer.metadata());
    return result;
  }
  const service = ctx.ChatCompletionService;
  if (hasCompletionService(ctx)) {
    const snapshot = completion || await completionSnapshot(ctx, presetName, loadCompletion);
    checkSignal(signal);
    const payload = await service.presetToGeneratePayload(structuredClone(snapshot.preset), {}, {messages: structuredClone(messages), model: snapshot.model, stream: true});
    checkSignal(signal);
    // No retries after a sent request: a retry is a deliberate user action in the Assistant app.
    // A request-local raw stream retains the model/provider fields ST's extracted generator omits.
    // Keep the service fallback for older hosts; never intercept global fetch or other conversations.
    const module = details && typeof ctx.getRequestHeaders === 'function' ? await loadCompletion() : null;
    const meta = {requestedModel: snapshot.model || 'OpenRouter 自动选择'};
    if (module?.getStreamingReply) {
      checkSignal(signal);
      const response = await (backend.textFetch || globalThis.fetch)('/api/backends/chat-completions/generate', {method: 'POST', headers: ctx.getRequestHeaders(), cache: 'no-cache', body: JSON.stringify(payload), signal});
      if (!response.ok) throw failure(response.status, await response.text());
      const state = {reasoning: '', images: [], signature: '', toolSignatures: {}};
      const info = {onChunk: raw => responseMetadata(raw, meta), onProgress: content => progress(content, {...meta, reasoning: state.reasoning || meta.reasoning || ''}), chunkText: raw => {
        if (raw?.choices?.[0]?.index > 0) return '';
        return module.getStreamingReply(raw, state, {chatCompletionSource: payload.chat_completion_source, overrideShowThoughts: true});
      }};
      let answer = await streamText(response, info);
      if (info.finish) meta.finish = info.finish;
      if (!answer && info.raw) {
        let json;
        try { json = JSON.parse(info.raw); } catch { throw Error('文字模型：接口返回的不是 JSON，地址可能填错了'); }
        if (json.error) throw failure(response.status, info.raw);
        responseMetadata(json, meta);
        if (json.choices?.[0]?.finish_reason) meta.finish = json.choices[0].finish_reason;
        try { answer = replyText(json); } catch { answer = json.content?.filter(p => p.type === 'text').map(p => p.text).join('') || json.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') || ''; }
      }
      checkSignal(signal);
      if (state.reasoning) meta.reasoning = state.reasoning;
      return {text: answer, meta: {...meta, ...timer.metadata()}};
    }
    if (backend.requestLog) { const id = backend.requestLog.add('助手酒馆最终请求', payload); backend.requestLog.finish(id, {state: '已交给酒馆发送'}); }
    const response = await service.sendRequest(payload, true, signal);
    if (typeof response !== 'function') return details ? {text: String(response?.content || ''), meta: {...meta, reasoning: response?.reasoning || ''}} : String(response?.content || '');
    let result = '';
    for await (const chunk of response()) { checkSignal(signal); if (typeof chunk.text === 'string') result = chunk.text; if (details && typeof chunk.state?.reasoning === 'string') meta.reasoning = chunk.state.reasoning; if (details) progress(result, meta); }
    return details ? {text: result, meta: {...meta, ...timer.metadata()}} : result;
  }
  // Older taverns expose generateRaw only. It has no request-local cancellation; its late answer is discarded.
  checkSignal(signal);
  if (settings.assistant?.readContext) throw Error('当前酒馆旧生成接口会重新展开宏，无法原样传递正文快照；请改用聊天补全或助手自定义文字连接');
  if (typeof ctx.generateRaw !== 'function') throw Error('当前酒馆版本未提供独立文本生成接口');
  // generateRaw expands arbitrary SillyTavern macros in every message, including user text. Break only the macro
  // opener in this request copy; retained conversation text stays exact, and no persona/state macro runs a second time.
  const prompt = messages.map(message => ({...message, content: String(message.content || '').replaceAll('{{', '{\u200b{')}));
  return ctx.generateRaw({prompt, api: ctx.mainApi, trimNames: false});
}

/** Whether the conversation is about pictures (the drawing guide is sent then, not with every message). */
export function assistantTalksPictures(messages) {
  return (messages || []).slice(-6).some(m => m.meta?.image || /<img\b|画|图|插画|提示词|tag|构图|画风|生图|prompt|外貌|立绘|头像|壁纸|出图/i.test(String(m.text || '')));
}
/**
 * The model's answer to 「画吧」: an 出图块 with words around it (or, from older habits, JSON with prompt/before/after).
 * Returns {prompt: what is stored and drawn (the block itself), imageReply: the words with the picture's place}.
 */
export function assistantPicture(text, style = {}) {
  const raw = String(text || '').trim(), [tag] = assistantBlocks(raw);
  if (tag) {
    const block = raw.slice(tag.start, tag.end), rest = assistantBlocks(raw.slice(tag.end)).reduceRight((out, t) => out.slice(0, t.start) + out.slice(t.end), raw.slice(tag.end));
    const before = raw.slice(0, tag.start).replace(/```[a-z]*\s*$/i, '').trim() || '我按刚才的方案画了一张：', after = rest.replace(/^\s*```/, '').trim();
    if (block.length > 5000) throw Error('助手的出图块太长了，请重试');
    if (before.length + after.length > 30000 || [before, after].some(t => t.includes(ASSISTANT_IMAGE_SLOT))) throw Error('图片回复内容格式无效，请重试');
    return {prompt: block, imageReply: [before, ASSISTANT_IMAGE_SLOT, after].filter(Boolean).join('\n\n')};
  }
  let value; try { value = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw Error('助手没有返回有效的绘图提示词，请重试'); }
  if (typeof value?.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 5000) throw Error('助手的绘图提示词为空或过长，请重试');
  const before = typeof value.before === 'string' ? value.before.trim() : '我按刚才的要求画了一张：', after = typeof value.after === 'string' ? value.after.trim() : '';
  if (before.length + after.length > 30000 || [before, after].some(t => t.includes(ASSISTANT_IMAGE_SLOT))) throw Error('图片回复内容格式无效，请重试');
  return {prompt: [style.artist, style.positive, value.prompt.trim()].filter(Boolean).join(', ').slice(0, 6000), imageReply: [before, ASSISTANT_IMAGE_SLOT, after].filter(Boolean).join('\n\n')};
}
/** What goes to the drawing engine: an 出图块 exactly as in the story (画风, each person's saved look, 站位, size); an
 *  older plain prompt as it was. */
export function assistantInputs(settings, prompt, style = {}) {
  const [tag] = /<img\b/i.test(prompt) ? assistantBlocks(prompt) : [];
  if (tag) { const {names, ...input} = pictureInputs(settings, tag, ''); return {...input, negative: [input.negative, tag.negative].filter(Boolean).join(', ')}; }
  return {prompt, negative: style.negative || ''};
}

export function createAssistantHost({context, settings, backend, presets = tavernAssistantPresets, buildContext, request = requestAssistantText, loadCompletion = loadCompletionModule, regex = null, exact = readStoryExact}) {
  const jobs = new Map(), snapshots = createAssistantContext(context);
  const memory = createAssistantMemoryHost({context, settings, backend, request: (messages, {signal, settings: state}) => {
    const assistant = normalizeAssistant(state.assistant);
    const presetName = assistant.source === 'tavern' && assistant.tavernPreset.startsWith('openai:') ? assistant.tavernPreset.slice(7) : '';
    return request(context(), backend, {...state, assistant: {...assistant, readContext: false}}, messages, {signal, presetName, loadCompletion, details: false});
  }});
  const remember = thread => { memory.after(thread.id); return thread; };
  const contextBuilder = buildContext || (async (ctx, options) => {
    const result = await exact(ctx, activeChatPreset(options.settings.chat), {entries: options.settings.assistant.tavernEntries});
    return result.available ? result : snapshots.build(ctx, options);
  });
  let closed = false, lastContext = null;
  const titling = new Map(), unique = (value, i, all) => all.indexOf(value) === i;
  const thoughtsOf = (...values) => values.map(value => String(value || '').trim()).filter(Boolean).filter(unique).join('\n\n');
  /**
   * 自动起标题: one short request for a title (the user's first words, and the first reply when those are too few to go
   * by), put on only while the conversation still has the title it started with.
   */
  function nameThread(id, expected, asked, answered, s, presetName) {
    if (closed || titling.has(id)) return;
    const controller = new AbortController();
    titling.set(id, controller);
    const said = [`用户：${assistantClip(asked, 600)}`, answered ? `助手：${assistantClip(answered, 600)}` : ''].filter(Boolean).join('\n');
    const content = promptText(s.promptRules, 'assistant', 'title', {'对话': said});
    if (!content.trim()) { titling.delete(id); return; }
    Promise.resolve().then(() => request(context(), backend, {...s, assistant: {...s.assistant, readContext: false}}, [{role: 'user', content}], {presetName, signal: controller.signal, loadCompletion, details: false, label: '助手起标题'}))
      .then(raw => { const title = assistantTitleText(typeof raw === 'string' ? raw : raw?.text); if (title && !closed && !backend.closed) return backend.autoTitleAssistantThread(id, title, expected); })
      .catch(() => { /* the title stays the first words */ })
      .finally(() => { if (titling.get(id) === controller) titling.delete(id); });
  }
  /**
   * 停止, or an error after the words began: what was written is kept as the reply, marked (cut) so 接着写 can go on
   * from it. Nothing is kept when the conversation changed meanwhile (the backend refuses then).
   */
  async function keepPartial(id, job, keep, cut) {
    const progress = job.progress;
    if (!keep || progress?.phase !== 'responding') return null;
    const raw = String(progress.text || ''), words = assistantThoughts(raw, keep.reasoningFormat);
    if (!words.text.trim()) return null;
    const meta = {...progress.meta, reasoningFormat: keep.reasoningFormat, elapsedMs: performance.now() - keep.started, cut};
    if (keep.target) {
      const text = assistantClip(assistantJoin(keep.target.text, words.text));
      return backend.continueAssistantMessage(id, keep.target.id, {text, meta: assistantMeta({...keep.target.meta, reasoning: thoughtsOf(keep.target.meta?.reasoning, progress.meta?.reasoning, words.reasoning), elapsedMs: (keep.target.meta?.elapsedMs || 0) + meta.elapsedMs, cut})}, keep.revision);
    }
    if (keep.rerollId) return backend.addAssistantVariant(id, keep.rerollId, {text: assistantClip(raw), meta: assistantMeta(meta)}, keep.revision);
    return backend.appendAssistantMessage(id, {role: 'assistant', text: assistantClip(raw), meta: assistantMeta(meta)}, keep.last.id, keep.revision);
  }
  const chatKey = ctx => ctx?.getCurrentChatId?.() ?? ctx?.chatId ?? null;
  const checkOpen = () => { if (closed || backend.closed) throw Error('助手已关闭'); };
  async function contextInfo() {
    const ctx = context(), count = (ctx?.chat || []).filter(m => m && !m.is_system && String(m.mes || '').trim()).length;
    const saved = buildContext ? null : await exact(ctx, {...activeChatPreset(settings().chat), lore: false}, {entries: settings().assistant?.tavernEntries || {}});
    const available = count > 0;
    const same = lastContext && lastContext.chat === ctx?.chat && lastContext.chatId === chatKey(ctx);
    return {...(buildContext ? {available, count, label: '正文上下文'} : saved?.available ? saved.info : snapshots.info()),
      ...(!available ? {reason: '请先在酒馆打开有正文的聊天，或关闭「读取正文上下文」'} : {}),
      ...(same ? {last: {...lastContext.info}} : {})};
  }
  async function selectedPreset(ctx, s) {
    if (s.assistant.source !== 'tavern') return {name: '', rules: [{role: 'system', content: buildAssistantPrompt(s, {voiceRules: modelRules(s)})}], markers: undefined};
    const list = await presets(ctx), preset = list.find(p => p.id === s.assistant.tavernPreset);
    if (!preset) throw Error('请先在助手设置里选择一个酒馆预设');
    const overrides = s.assistant.tavernEntries[preset.id] || {};
    const enabled = e => typeof overrides[e.id] === 'boolean' ? overrides[e.id] : e.enabled;
    // Only names expand here: raw card/story macros must not bypass the processed snapshot.
    const macroContext = {name1: ctx.name1, name2: ctx.name2};
    const rules = buildTavernAssistantMessages(preset, overrides, macroContext);
    return {name: preset.name, rules, markers: new Set(preset.entries.filter(e => e.marker && enabled(e)).map(e => e.id))};
  }
  async function reply(id, text = '', rerollId = '', {allowPaid = false, redraw = false, continueFrom = ''} = {}) {
    checkOpen();
    if (jobs.has(id)) throw Error('这段助手对话正在回复，请等一下或先取消');
    if (typeof text !== 'string') throw Error('助手消息格式无效');
    const controller = new AbortController(), job = {controller};
    // keep: what a reply cut short by 停止 or an error is saved with, from when its words are asked for until they came
    let keep = null;
    jobs.set(id, job);
    backend.emit('assistant', {threadId: id, busy: true});
    try {
      const ctx = context(), s = structuredClone(settings()), reasoningFormat = assistantReasoningFormat(ctx.powerUserSettings?.reasoning);
      s.assistant = normalizeAssistant(s.assistant);
      const capturedCC = structuredClone(ctx.chatCompletionSettings || {});
      const selectedName = s.assistant.source === 'tavern' && s.assistant.tavernPreset.startsWith('openai:') ? s.assistant.tavernPreset.slice(7) : '';
      checkSignal(controller.signal);
      let thread = await backend.assistantThread(id);
      if (!thread) throw Error('这条助手会话已经不在了');
      const adding = !!text.trim() && !continueFrom;
      // 接着写: the conversation's last reply, one with words (not a picture), goes on from where it stopped.
      const target = continueFrom ? thread.messages.at(-1) : null;
      if (continueFrom && (target?.id !== continueFrom || target.role !== 'assistant')) throw Error('只能接着写最后一条回复');
      if (target?.meta?.image) throw Error('带图片的回复不能接着写');
      const targetIndex = rerollId ? thread.messages.findIndex(m => m.id === rerollId && m.role === 'assistant') : -1;
      if (rerollId && targetIndex < 0) throw Error('这条回复已经不在了');
      if (rerollId && (thread.messages[targetIndex].variants?.length || 1) >= ASSISTANT_LIMITS.variants) throw Error('这条消息已有 20 个回复版本');
      if (!rerollId && !target && thread.messages.length > ASSISTANT_LIMITS.messages - (adding ? 2 : 1)) throw Error('这段助手对话已满，请新建对话后继续');
      // 重新绘制 (redraw): the same block drawn again, words kept. 重 roll: the whole reply anew (words, block, picture).
      const oldImage = rerollId && redraw && thread.messages[targetIndex].meta?.image;
      if (redraw && !oldImage) throw Error('这条回复没有图片');
      if (!oldImage && s.assistant.readContext && ctx.streamingProcessor && !ctx.streamingProcessor.isFinished) throw Error('正文正在生成，请等正文完成后再读取上下文');
      const completion = !oldImage && activeText(s.text).source === 'tavern' && hasCompletionService(ctx) ? await completionSnapshot(ctx, selectedName, loadCompletion) : null;
      checkSignal(controller.signal);
      if (adding) thread = await backend.appendAssistantMessage(id, {role: 'user', text});
      const historyMessages = rerollId ? thread.messages.slice(0, targetIndex) : target ? thread.messages.slice(0, -1) : thread.messages;
      const last = historyMessages.at(-1), revision = thread.revision || 0;
      if (!last || (!rerollId && !target && last.role !== 'user')) throw Error('请先发一条消息给助手');
      // 自动起标题 in the first round: asked at once beside the reply when the user's words say enough, else after the
      // first reply (from both). Not for a conversation renamed by hand, or one that already had a reply.
      const firstUser = thread.messages.find(m => m.role === 'user');
      const naming = !rerollId && !target && !!firstUser && !thread.titleEdited && !thread.messages.some(m => m.role === 'assistant') && thread.title === assistantFirstTitle(firstUser);
      const asked = naming ? thread.messages.filter(m => m.role === 'user').map(m => m.text || (m.attachments || []).map(f => f.name).join('、')).join('\n').trim() : '';
      // Two requests at once only where each has its own (an older tavern's generateRaw is one at a time).
      const titleNow = naming && [...asked].length >= 8 && (activeText(s.text).source === 'custom' || hasCompletionService(ctx));
      if (titleNow) nameThread(id, thread.title, asked, '', s, selectedName);
      checkSignal(controller.signal);
      // 「帮我画……」 gets an 出图块 card first; the picture is drawn on 画这张, or on a go-ahead right after a card (that
      // card, as written). A go-ahead after a talk without a card still writes one and draws it.
      // 重 roll answers the same turn again by the same rules: 「帮我画」 gets a new card, a go-ahead draws again.
      // 「直接画……」 skips the card: the block is written and drawn in one go.
      const wants = !oldImage && !target && assistantWantsImage(historyMessages), confirming = wants && assistantConfirmsImage(historyMessages), direct = wants && assistantDirectImage(historyMessages);
      const shown = confirming ? historyMessages.findLast(m => m.role === 'assistant') : null;
      const card = shown && !shown.meta?.image ? assistantBlocks(assistantThoughts(shown.text, shown.meta?.reasoningFormat).text).at(-1) : null;
      const cardText = card ? assistantThoughts(shown.text, shown.meta?.reasoningFormat).text.slice(card.start, card.end) : '';
      const drawing = !!oldImage || !!cardText || confirming || direct;
      const proposing = wants && !drawing;
      checkSignal(controller.signal);
      if (drawing) {
        if (!backend.drawReady()) throw Error(backend.drawMissing());
        if (backend.drawQuote().free === false && !allowPaid) throw Object.assign(Error('生图需要确认费用'), {code: 'PAID'});
      }
      const chosen = oldImage || cardText ? {name: '', rules: []} : await selectedPreset(ctx, s);
      checkSignal(controller.signal);
      // The drawing guide (the user's own 绘图预设 and 画风) when pictures are being drawn or talked about.
      const guide = !oldImage && !cardText && backend.drawReady?.() && (drawing || wants || assistantTalksPictures(historyMessages)) ? assistantDrawGuide(s) : '';
      const rules = [...chosen.rules.filter(r => r.content.trim()), {role: 'system', content: promptText(s.promptRules, 'assistant', 'images')}, ...(guide ? [{role: 'system', content: guide}] : []), ...(s.assistant.visuals !== false && !oldImage && !cardText ? [{role: 'system', content: promptText(s.promptRules, 'assistant', 'visuals')}] : [])];
      // Voice is a reply capability, independent of the selected assistant preset and story reference cleanup.
      if (!drawing && s.general.voiceEnabled !== false) {
        const engineRules = modelRules(s), format = backend.voiceFormat();
        const parts = [...promptPlan(s, engineRules).map(p => p.text), dialogueContract(format), engineRules];
        rules.push({role: 'system', content: promptText(s.promptRules, 'assistant', 'voice', {'引擎规则': [...new Set(parts.filter(Boolean))].join('\n\n')})});
      }
      // 放歌: the phone's 音乐 plays what the reply names; the 歌单 is told only when the user talks about music.
      if (!oldImage && !cardText) {
        const said = String(historyMessages.findLast(m => m.role === 'user')?.text || ''), asked = ASSISTANT_WANTS_MUSIC.test(said) || /歌|音乐|曲/.test(said);
        const library = asked ? await backend.listSongs?.().catch(() => []) || [] : [];
        const ready = (s.music?.sources || []).some(x => x.enabled) || library.length > 0 || (!asked && !!backend.listSongs);
        rules.push({role: 'system', content: assistantMusicRule({prompts: s.promptRules, ready, library, listening: backend.listening, asked})});
      }
      if (s.assistant.memory.enabled && !oldImage && !cardText) {
        const query = assistantMemoryThread({...thread, messages: historyMessages.slice(-6)}).messages.map(message => message.text).join('\n');
        const recalled = await memory.contextFor({...thread, messages: historyMessages}, {query, history: s.assistant.history, reroll: !!rerollId, signal: controller.signal, config: s.assistant.memory});
        if (recalled.text) rules.push({role: 'system', content: promptText(s.promptRules, 'assistant', 'memory', {'记忆': recalled.text})});
      }
      const prefix = [{role: 'system', content: promptText(s.promptRules, 'assistant', 'identity')}, ...rules.map(({role, content}) => ({role, content}))];
      // With memory off, retain the previous full-history behavior. With it on, only this recent window is verbatim.
      const recent = s.assistant.memory.enabled ? historyMessages.slice(-s.assistant.history) : historyMessages;
      const history = assistantHistory([...recent, ...(target ? [target] : [])].map(m => m.role === 'assistant' && !m.meta?.reasoningFormat ? {...m, meta: {...m.meta, reasoningFormat}} : m), {textOnly: activeText(s.text).source === 'tavern' && !hasCompletionService(ctx)});
      let reference = [];
      if (s.assistant.readContext && !oldImage && !cardText) {
        const active = context().streamingProcessor;
        if (active && !active.isFinished) throw Error('正文正在生成，请等正文完成后再读取上下文');
        const chat = ctx.chat, key = chatKey(ctx);
        const result = await contextBuilder(ctx, {prefix, history, signal: controller.signal, settings: s, chatCompletionSettings: completion?.settings || capturedCC, markers: chosen.markers});
        checkSignal(controller.signal);
        const now = context();
        if (now.chat !== chat || chatKey(now) !== key) throw Error('正文聊天已切换，请重新发送');
        reference = result.messages;
        lastContext = {chat, chatId: key, info: result.info};
      }
      if (proposing) rules.push({role: 'system', content: promptText(s.promptRules, 'assistant', 'propose')});
      const normal = rules.filter(r => r.position !== 1).map(({role, content}) => ({role, content}));
      const messages = [{role: 'system', content: promptText(s.promptRules, 'assistant', 'identity')}, ...normal, ...reference, ...(reference.length ? [{role: 'system', content: promptText(s.promptRules, 'assistant', 'reference')}] : []), ...history];
      for (const rule of rules.filter(r => r.position === 1).sort((a, b) => b.depth - a.depth || b.order - a.order)) {
        messages.splice(Math.max(1 + normal.length + reference.length + (reference.length ? 1 : 0), messages.length - rule.depth), 0, {role: rule.role, content: rule.content});
      }
      if (target) {
        const shownWords = assistantThoughts(target.text, target.meta?.reasoningFormat || reasoningFormat).text;
        messages.push({role: 'system', content: promptText(s.promptRules, 'assistant', 'continue', {'末尾': shownWords.slice(-300)}) || '请从上一条回复断开的地方接着往下写，不要重复已经写过的内容。'});
      }
      checkSignal(controller.signal);
      const started = performance.now(), startedAt = Date.now();
      job.progress = {id: crypto.randomUUID(), threadId: id, rerollId, continueId: target?.id || '', startedAt, phase: 'waiting', text: '', meta: {reasoningFormat}};
      let lastProgress = 0;
      const onProgress = (content, metadata = {}) => {
        if (controller.signal.aborted || closed || jobs.get(id) !== job || !job.progress) return;
        const meta = assistantMeta({...metadata, reasoningFormat}), part = assistantThoughts(content, reasoningFormat);
        const partialMarker = [reasoningFormat.prefix, '<think>', '<thinking>'].filter(Boolean).some(marker => content.trim() && marker.startsWith(content.trim()) && marker !== content.trim());
        const phase = Number.isFinite(meta.reasoningMs) || part.text.trim() && !partialMarker ? 'responding' : meta.reasoning || part.reasoning || part.thinking ? 'thinking' : 'waiting';
        const changed = phase !== job.progress.phase;
        job.progress = {...job.progress, phase, text: assistantClip(content), meta};
        const stamp = performance.now();
        if (changed || stamp - lastProgress >= 80) { lastProgress = stamp; backend.emit('assistant', {threadId: id, progress: true}); }
      };
      backend.emit('assistant', {threadId: id, progress: true});
      if (drawing) {
        const engine = s.draw.engine, styleId = (engine === 'nai' ? '' : s.draw[engine]?.style) || s.draw.activeStyle;
        const style = s.draw.styles.find(row => row.id === styleId) || s.draw.styles[0] || {};
        job.progress.phase = 'prompting'; backend.emit('assistant', {threadId: id, progress: true});
        let prompt = oldImage?.prompt || cardText, imageReply = oldImage ? thread.messages[targetIndex].text : cardText ? ['按这个方案画好了：', ASSISTANT_IMAGE_SLOT].join('\n\n') : '';
        if (!prompt) {
          messages.push({role: 'system', content: promptText(s.promptRules, 'assistant', 'draw')});
          const prepared = await request(ctx, backend, s, messages, {presetName: chosen.name, signal: controller.signal, completion, loadCompletion, details: true, reasoningFormat});
          checkSignal(controller.signal);
          ({prompt, imageReply} = assistantPicture(assistantThoughts(typeof prepared === 'string' ? prepared : prepared?.text, reasoningFormat).text, style));
        }
        checkSignal(controller.signal); checkOpen();
        const before = await backend.assistantThread(id);
        if (!before || (before.revision || 0) !== revision) throw Error('助手会话已变化，这次生图已停止');
        if (JSON.stringify(settings().draw) !== JSON.stringify(s.draw)) throw Error('绘图设置已变化，请重新生成');
        const key = 'assistant-image:' + crypto.randomUUID();
        const stop = () => backend.drawQueue.cancel(key);
        controller.signal.addEventListener('abort', stop, {once: true});
        job.progress.phase = 'drawing'; job.progress.text = imageReply; backend.emit('assistant', {threadId: id, progress: true});
        try {
          checkSignal(controller.signal);
          const image = await backend.generateImage({...assistantInputs(s, prompt, style), allowPaid, name: 'assistant', key, label: '助手生图'});
          checkSignal(controller.signal); checkOpen();
          const value = {text: imageReply, meta: {elapsedMs: performance.now() - started, requestedModel: image.params?.model || (engine === 'comfy' ? s.draw.comfy.model : s.draw[engine]?.model) || engine, image: {photoId: image.photoId, prompt}}};
          job.progress = null;
          const saved = rerollId ? await backend.addAssistantVariant(id, rerollId, value, revision) : await backend.appendAssistantMessage(id, {role: 'assistant', ...value}, last.id, revision);
          if (naming && !titleNow) nameThread(id, thread.title, asked, imageReply.replaceAll(ASSISTANT_IMAGE_SLOT, ''), s, selectedName);
          return remember(saved);
        } finally { controller.signal.removeEventListener('abort', stop); }
      }
      keep = {last, revision, target, rerollId, started, reasoningFormat};
      const result = await request(ctx, backend, s, messages, {presetName: chosen.name, signal: controller.signal, completion, loadCompletion, details: true, reasoningFormat, onProgress});
      keep = null;
      let answer = typeof result === 'string' ? result : String(result?.text || '');
      // length: the model's 最长回复 ended it mid-way (each API says so its own way); 接着写 can go on from there.
      let cut = /^(?:length|max_tokens)$/i.test(String(result?.meta?.finish || '')) ? 'length' : '';
      checkSignal(controller.signal); checkOpen();
      if (target) {
        const added = assistantThoughts(answer, reasoningFormat);
        if (!added.text.trim()) throw Error('助手这次没有接着写，可以再试一次');
        let joined = assistantJoin(target.text, added.text);
        if (joined.length > ASSISTANT_LIMITS.reply) { joined = assistantClip(joined); cut = 'limit'; }
        const meta = assistantMeta({...target.meta, ...(result?.meta?.reportedModel ? {reportedModel: result.meta.reportedModel} : {}), reasoning: thoughtsOf(target.meta?.reasoning, result?.meta?.reasoning, added.reasoning), elapsedMs: (target.meta?.elapsedMs || 0) + performance.now() - started, cut});
        job.progress = null;
        return remember(await backend.continueAssistantMessage(id, target.id, {text: joined, meta}, revision));
      }
      if (!answer.trim()) throw Error('助手这次没有返回内容，可以重试');
      // A reply longer than one may be kept: its beginning is kept (never all of it lost), marked so 接着写 can go on.
      if (answer.length > ASSISTANT_LIMITS.reply) { answer = assistantClip(answer); cut = 'limit'; }
      const meta = assistantMeta({...result?.meta, reasoningFormat, elapsedMs: performance.now() - started, cut});
      // Clearing/deleting/editing a conversation during a request cannot attach its reply to different messages.
      const current = await backend.assistantThread(id);
      checkSignal(controller.signal); checkOpen();
      if (!current || (current.revision || 0) !== revision || (!rerollId && current.messages.at(-1)?.id !== last.id)) throw Error('助手会话已变化，这次回复没有写入');
      job.progress = null;
      const saved = rerollId ? await backend.addAssistantVariant(id, rerollId, {text: answer, meta}, revision) : await backend.appendAssistantMessage(id, {role: 'assistant', text: answer, meta}, last.id, revision);
      if (naming && !titleNow) nameThread(id, thread.title, asked, assistantThoughts(answer, reasoningFormat).text, s, selectedName);
      return remember(saved);
    } catch (error) {
      const aborted = controller.signal.aborted;
      if (keep && !closed && !backend.closed) {
        try { const saved = await keepPartial(id, job, keep, aborted ? 'stopped' : 'error'); if (saved) remember(saved); } catch { /* the conversation changed meanwhile: nothing kept */ }
      }
      if (aborted) throw cancelled();
      throw error;
    } finally {
      if (jobs.get(id) === job) jobs.delete(id);
      if (!closed && !backend.closed) backend.emit('assistant', {threadId: id, busy: false});
    }
  }
  /** 画这张 on an 出图块 card: draws that block as it is (no model request) into a new reply. */
  async function drawBlock(id, block, {allowPaid = false} = {}) {
    checkOpen();
    if (jobs.has(id)) throw Error('这段助手对话正在回复，请等一下或先取消');
    const [tag] = assistantBlocks(String(block || ''));
    if (!tag || String(block).length > 5000) throw Error('这个出图块读不出来，请让助手重新写一个');
    if (!backend.drawReady()) throw Error(backend.drawMissing());
    if (backend.drawQuote().free === false && !allowPaid) throw Object.assign(Error('生图需要确认费用'), {code: 'PAID'});
    const controller = new AbortController(), job = {controller};
    jobs.set(id, job);
    backend.emit('assistant', {threadId: id, busy: true});
    try {
      const s = structuredClone(settings()), engine = s.draw.engine, thread = await backend.assistantThread(id);
      if (!thread) throw Error('这条助手会话已经不在了');
      if (thread.messages.length >= ASSISTANT_LIMITS.messages) throw Error('这段助手对话已满，请新建对话后继续');
      const revision = thread.revision || 0, last = thread.messages.at(-1), started = performance.now();
      const text = String(block).slice(tag.start, tag.end), imageReply = ['按这张出图块画好了：', ASSISTANT_IMAGE_SLOT].join('\n\n');
      const key = 'assistant-image:' + crypto.randomUUID(), stop = () => backend.drawQueue.cancel(key);
      controller.signal.addEventListener('abort', stop, {once: true});
      job.progress = {id: crypto.randomUUID(), threadId: id, rerollId: '', startedAt: Date.now(), phase: 'drawing', text: imageReply, meta: {}};
      backend.emit('assistant', {threadId: id, progress: true});
      try {
        const image = await backend.generateImage({...assistantInputs(s, text), allowPaid, name: 'assistant', key, label: '助手生图'});
        checkSignal(controller.signal); checkOpen();
        const value = {text: imageReply, meta: {elapsedMs: performance.now() - started, requestedModel: image.params?.model || (engine === 'comfy' ? s.draw.comfy.model : s.draw[engine]?.model) || engine, image: {photoId: image.photoId, prompt: text}}};
        job.progress = null;
        return remember(await backend.appendAssistantMessage(id, {role: 'assistant', ...value}, last?.id ?? null, revision));
      } finally { controller.signal.removeEventListener('abort', stop); }
    } catch (error) {
      if (controller.signal.aborted) throw cancelled();
      throw error;
    } finally {
      if (jobs.get(id) === job) jobs.delete(id);
      if (!closed && !backend.closed) backend.emit('assistant', {threadId: id, busy: false});
    }
  }
  return {
    drawBlock,
    memoryTidy: (id, options) => { checkOpen(); return memory.tidy(id, options); },
    memoryStatus: id => memory.status(id),
    memoryCancel: id => memory.cancel(id),
    presets: () => { checkOpen(); return presets(context()); },
    reasoningFormat: () => assistantReasoningFormat(context()?.powerUserSettings?.reasoning),
    display: (text, role, depth) => {
      if (!regex?.getRegexedString) return text;
      const placement = role === 'user' ? regex.regex_placement.USER_INPUT : regex.regex_placement.AI_OUTPUT;
      return regex.getRegexedString(text, placement, {isMarkdown: true, depth});
    },
    context: contextInfo, reply: (id, text, options) => reply(id, text, '', options), reroll: (id, messageId, options) => reply(id, '', messageId, {...options, redraw: false}),
    redraw: (id, messageId, options) => reply(id, '', messageId, {...options, redraw: true}),
    progress: id => structuredClone(jobs.get(id)?.progress || null),
    busy: id => jobs.has(id),
    cancel(id) { jobs.get(id)?.controller.abort(); memory.cancel(id); },
    close() { snapshots.close(); memory.close(); closed = true; for (const job of jobs.values()) job.controller.abort(); jobs.clear(); for (const naming of titling.values()) naming.abort(); titling.clear(); lastContext = null; },
  };
}
