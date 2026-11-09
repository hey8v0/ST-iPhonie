// 生成器, tavern side (core/generator.js): reads the open card, the user's 人设, the 世界书 the tavern would turn on and the
// recent story; asks the phone's text model. An opening is written into the chat (a new version of the greeting while the
// chat has only that, else added at the end after the phone asked); a 人设 is saved as a tavern persona; a 走向 picked is
// told to the next story reply once; a 小剧场 is kept and read aloud with the roles' voices. One request at a time.
import {openingRequest, cleanOpening, personaRequest, parsePersona, directionsRequest, parseDirections, directionText, theaterRequest, parseTheater} from './core/generator.js';
import {activeChatPreset} from './core/chat.js';
import {readStoryLines} from './story-exact.js';
import {languageName} from './core/languages.js';
import {modelRules} from './core/state.js';
import {NARRATOR} from './core/narration.js';
import {worldInfoFor, loreOptions} from './host-lore.js';

export function createGeneratorHost({context, settings, backend, notice = () => {}, memory = null, personas = () => import('/scripts/personas.js'), fetcher = (...args) => globalThis.fetch(...args)}) {
  const userName = () => context()?.name1 || '我';
  const userPersona = () => String(context()?.powerUserSettings?.persona_description || '').slice(0, 3000);
  /** The card open now (not a group): what the requests read of it. */
  function card(ctx = context()) {
    const c = ctx?.groupId ? null : ctx?.characters?.[ctx?.characterId];
    if (!c?.name) return null;
    const data = c.data || {};
    return {name: c.name, description: c.description || data.description || '', personality: c.personality || data.personality || '', scenario: c.scenario || data.scenario || '',
      examples: c.mes_example || data.mes_example || '', greetings: [c.first_mes || data.first_mes, ...(Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [])].filter(g => typeof g === 'string' && g.trim())};
  }
  /** What the phone shows of the card: its name, and whether an opening goes in as a new version of the greeting. */
  function cardInfo() {
    const ctx = context(), c = card(ctx), chat = ctx?.chat || [];
    return {name: c?.name || '', group: !!ctx?.groupId, messages: chat.length, greetingOnly: chat.length === 1 && !chat[0]?.is_user && !chat[0]?.is_system};
  }
  async function lore(c, texts, always = []) {
    const preset = activeChatPreset(settings().chat);
    if (preset.lore === false) return '';
    return worldInfoFor(context, {...loreOptions(preset), report: (...args) => backend.reportDiagnostic?.(...args), persona: userPersona(), characters: c ? [c.description, c.personality].filter(Boolean).join('\n') : '', texts: texts.filter(Boolean), always: always.filter(Boolean)});
  }
  /** A role's own tavern card (one of the same name), for someone the 角色 App has nothing written about. */
  function cardOf(name, ctx = context()) {
    const ch = ctx?.characters?.find(x => x?.name === name), data = ch?.data || {};
    if (!ch) return '';
    const personality = ch.personality || data.personality || '';
    return [ch.description || data.description || '', personality && '性格：' + personality].filter(Boolean).join('\n').replaceAll('{{char}}', name).replaceAll('{{user}}', userName()).trim().slice(0, 1200);
  }
  /**
   * This card's people (角色 App; 旁白 is the reading voice, not one of them), each with what is written about them: the
   * 角色 App's words, else their own tavern card. The open card's own character is the card itself.
   */
  function castOf(c, ctx = context()) {
    const list = backend.contacts().filter(x => x.source === 'role' && x.name !== NARRATOR).slice(0, 16)
      .map(x => ({name: x.name, persona: String(x.persona || '').trim() || (x.name === c?.name ? '' : cardOf(x.name, ctx))}));
    if (!list.length && c) list.push({name: c.name, persona: ''});
    return list;
  }
  /** What the 世界书 is looked through with for these people: their names (however deep the tavern scans, with what
   *  the user asked for) and what is written about them. */
  const castNames = cast => cast.map(x => x.name), castPersonas = cast => cast.map(x => x.persona);
  let busy = '';
  function run(kind, task) {
    if (busy) return Promise.reject(Error('上一个还在写，等它写好了再来'));
    busy = kind;
    backend.emit('generator', {busy: kind});
    return Promise.resolve().then(task).finally(() => { busy = ''; backend.emit('generator', {busy: ''}); });
  }
  const ask = (ctx, prompt) => backend.generateText(ctx, {use: 'generator', prompt, trimNames: false});

  // ---------- 开场白 ----------
  /** form: {mode 'random' | 'brief', brief, focus, length}; before + wish: 「照这句改一改」. */
  function opening(form = {}) {
    return run('opening', async () => {
      const ctx = context(), c = card(ctx);
      if (!c) throw Error(ctx?.groupId ? '群聊没有单独的角色卡：打开一张角色卡再写开场白' : '先在酒馆里打开一张角色卡');
      const brief = form.mode === 'brief' ? String(form.brief || '').trim() : '';
      if (form.mode === 'brief' && !brief && !form.before) throw Error('先写下想要的开场情境');
      const cast = castOf(c, ctx), lw = await lore(c, [c.description, c.scenario, c.greetings[0], ...castPersonas(cast)], [brief, form.focus, form.wish, ...castNames(cast)]);
      const text = cleanOpening(await ask(ctx, openingRequest({prompts: settings().promptRules, card: c, user: userName(), persona: userPersona(), lore: lw, cast, brief, focus: form.focus, length: form.length, before: form.before || '', wish: form.wish || ''})));
      if (!text) throw Error('模型没写出开场白，再试一次');
      return text;
    });
  }
  /**
   * Into the chat: with only the greeting there, a new version of it (shown at once); with more, {how: 'ask', messages}
   * until the phone asked and says append; then a new message of the card's at the end. Never into the card itself.
   */
  async function writeOpening(text, {append = false} = {}) {
    const ctx = context(), words = String(text || '').trim();
    if (!words) throw Error('开场白是空的');
    if (ctx?.groupId) throw Error('群聊里不能直接写入：复制下来自己贴');
    if (!card(ctx)) throw Error('先在酒馆里打开一张角色卡');
    const chat = ctx.chat || [], first = chat[0], now = new Date().toISOString(), stamp = () => ({send_date: now, gen_started: null, gen_finished: null, extra: {}});
    if (chat.length === 1 && first && !first.is_user && !first.is_system) {
      const swipes = Array.isArray(first.swipes) && first.swipes.length ? first.swipes : [first.mes];
      const info = Array.isArray(first.swipe_info) ? [...first.swipe_info] : [];
      while (info.length < swipes.length) info.push({send_date: first.send_date, gen_started: null, gen_finished: null, extra: {}});
      Object.assign(first, {swipes: [...swipes, words], swipe_info: [...info.slice(0, swipes.length), stamp()], swipe_id: swipes.length, mes: words});
      await ctx.saveChat?.();
      if (typeof ctx.reloadCurrentChat === 'function') await ctx.reloadCurrentChat(); else ctx.updateMessageBlock?.(0, first);
      return {how: 'swipe', index: swipes.length + 1};
    }
    if (chat.length && !append) return {how: 'ask', messages: chat.length};
    const message = {name: ctx.name2, is_user: false, is_system: false, send_date: now, mes: words, extra: {}, swipes: [words], swipe_id: 0, swipe_info: [stamp()]};
    chat.push(message);
    ctx.addOneMessage?.(message);
    await ctx.saveChat?.();
    return {how: 'append'};
  }

  // ---------- User 人设 ----------
  function persona(form = {}) {
    return run('persona', async () => {
      const ctx = context(), c = card(ctx), cast = castOf(c, ctx);
      const lw = c ? await lore(c, [c.description, c.scenario, ...castPersonas(cast)], [form.wish, ...castNames(cast)]) : '';
      const got = parsePersona(await ask(ctx, personaRequest({prompts: settings().promptRules, card: c, user: userName(), persona: userPersona(), cast, lore: lw, wish: form.wish || '', length: form.length})));
      if (!got.description) throw Error('模型没写出人设，再试一次');
      return got;
    });
  }
  /** Saved as a tavern persona (as one made in the tavern without a picture: the default picture). */
  async function savePersona({name, description} = {}) {
    const ctx = context(), pu = ctx?.powerUserSettings, who = String(name || '').trim().slice(0, 40), words = String(description || '').trim();
    if (!who) throw Error('先给人设起个名字');
    if (!words) throw Error('人设是空的');
    if (!pu || typeof pu.personas !== 'object' || typeof pu.persona_descriptions !== 'object') throw Error('这个酒馆存不了人设');
    const avatarId = `${Date.now()}-${who.replace(/[^a-zA-Z0-9]/g, '') || 'persona'}.png`;
    let mod = null;
    try { mod = await personas(); } catch { /* the settings are written directly below */ }
    if (typeof mod?.initPersona === 'function') await mod.initPersona(avatarId, who, words, '');
    else { pu.personas[avatarId] = who; pu.persona_descriptions[avatarId] = {description: words, position: 0, depth: 2, role: 0, lorebook: '', title: ''}; ctx.saveSettingsDebounced?.(); }
    try {
      const picture = await (await fetcher('img/user-default.png')).blob(), form = new FormData(), headers = {...(ctx.getRequestHeaders?.() || {})};
      form.append('avatar', new File([picture], 'avatar.png', {type: 'image/png'}));
      form.append('overwrite_name', avatarId);
      delete headers['Content-Type'];
      await fetcher('/api/avatars/upload', {method: 'POST', headers, cache: 'no-cache', body: form});
    } catch { /* the persona is kept without its picture file */ }
    try { await mod?.getUserAvatars?.(true, avatarId); } catch { /* the tavern lists it next time */ }
    return {avatarId, name: who};
  }
  async function usePersona(avatarId) {
    let mod = null;
    try { mod = await personas(); } catch { /* below */ }
    if (typeof mod?.setUserAvatar !== 'function') throw Error('这个酒馆不能从这里换人设：在酒馆的人设管理里选');
    await mod.setUserAvatar(String(avatarId || ''));
  }

  // ---------- 接下来的走向 ----------
  function directions(form = {}) {
    return run('direction', async () => {
      const ctx = context(), c = card(ctx), s = settings(), preset = activeChatPreset(s.chat), user = userName(), story = await readStoryLines(ctx?.chat || [], preset, user);
      if (!story.length) throw Error('正文还没开始：先写几轮再来想走向');
      const cast = castOf(c, ctx), lw = await lore(c, [...castPersonas(cast), ...story.map(r => `${r.name}: ${r.text}`)], [form.wish, ...castNames(cast)]);
      const list = parseDirections(await ask(ctx, directionsRequest({prompts: s.promptRules, card: c, user, persona: userPersona(), lore: lw, cast, earlier: memory?.storyMemory?.() || '', story, count: 4, wish: form.wish || ''})));
      if (!list.length) throw Error('模型没写出走向，再试一次');
      return list;
    });
  }
  // The one picked waits for the next story reply of this chat (another chat does not get it).
  let pending = null;
  const chatId = () => { try { return String(context()?.getCurrentChatId?.() ?? context()?.chatId ?? ''); } catch { return ''; } };
  const steering = () => pending && pending.chat === chatId() ? {title: pending.title, text: pending.text} : null;
  function steer(d) {
    const text = String(d?.text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    pending = text ? {title: String(d.title || '').replace(/\s+/g, ' ').trim().slice(0, 40), text, chat: chatId()} : null;
    backend.emit('generator', {steer: steering()});
    return steering();
  }
  /** For a story request: the 走向 picked, told once (a dry run, a quiet or an impersonate request leave it). */
  function storyPlan(type, dryRun) {
    const d = steering();
    if (!d) return [];
    const plan = [{key: 'sttts.entry.direction', text: directionText(settings().promptRules, d, userName()), position: 1, depth: 1, role: 0}];
    if (type && !['quiet', 'impersonate'].includes(type) && !dryRun) {
      pending = null;
      backend.emit('generator', {steer: null});
      notice(`走向「${d.title || d.text.slice(0, 12)}」带进这次正文了`);
    }
    return plan;
  }

  // ---------- 小剧场 ----------
  /** form: {kind 'script' | 'card', source 'story' | 'card', length, wish, focus}. Kept; answers what was kept. */
  function theater(form = {}) {
    return run('theater', async () => {
      const ctx = context(), c = card(ctx), s = settings(), preset = activeChatPreset(s.chat), user = userName(), fromStory = form.source !== 'card', script = form.kind !== 'card';
      const story = fromStory ? await readStoryLines(ctx?.chat || [], preset, user) : [];
      if (!c && !story.length) throw Error('先在酒馆里打开一张角色卡');
      const cast = castOf(c, ctx);
      const voiced = script ? s.routes.filter(r => r.voice && r.name !== NARRATOR && (r.name === user || cast.some(x => x.name === r.name))).map(r => ({name: r.name, language: languageName(r.language || s.general.defaultLanguage || 'zh')})) : [];
      const lw = await lore(c, [...castPersonas(cast), ...story.map(r => `${r.name}: ${r.text}`)], [form.wish, form.focus, ...castNames(cast)]);
      const voiceFormat = backend.voiceFormat();
      const prompt = theaterRequest({prompts: s.promptRules, form, card: c, user, persona: userPersona(), lore: lw, earlier: fromStory ? memory?.storyMemory?.() || '' : '', story, cast, voiced, voiceFormat, voiceRules: voiced.length ? modelRules(s, voiced.map(v => v.name)) : ''});
      const got = parseTheater(await ask(ctx, prompt), {kind: script ? 'script' : 'card', voiceFormat, voiced: voiced.map(v => v.name)});
      return backend.saveTheater({...got, form: script ? 'script' : 'card', source: fromStory ? 'story' : 'card', wish: String(form.wish || '')});
    });
  }
  /** A script read aloud: the roles with their voices; the 旁白 lines only while 整篇朗读 is on. */
  async function playTheater(id) {
    const piece = (await backend.theaters()).find(x => x.id === id);
    if (piece?.form !== 'script') throw Error('这段小剧场不能念');
    const lines = piece.lines.filter(l => !l.narration || settings().narration?.enabled === true);
    return backend.speak(lines);
  }
  return {opening, writeOpening, cardInfo, persona, savePersona, usePersona, directions, steer, steering, storyPlan, theater, playTheater, busy: () => busy};
}
