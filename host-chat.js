// Phone chat, tavern side. Replies are generated separately from the story with the tavern's connected model
// (generateRaw): the prompt carries the chat preset, each contact's persona or character card, the user's persona,
// recent story messages and the chat history. Nothing is written into the story unless the user brings a chat
// into it; that text is injected once, into the next story reply.
import {currentDm, currentWindow} from './core/chats.js';
import {buildChatRequest, parseChatReply, bringText, plainStory, activeChatPreset, messageLine, cleanTagged, chatContacts, storyTextRule, phoneAfterRule, phoneParts, inSpace} from './core/chat.js';
import {worldInfoFor, loreOptions} from './host-lore.js';
import {pictureInputs, photoCast, photoTags, tagTextRequest, tagTextAnswer} from './core/draw.js';
import {storyLines} from './core/moments.js';
import {forumContext} from './core/forum.js';
import {promptOn} from './core/prompt-rules.js';
import {activeText} from './core/llm.js';
import {requestAssistantText, hasCompletionService, loadCompletionModule} from './host-assistant.js';

/** 看图: the user's latest photos (at most this many, in the chat window) go along to a model that sees. */
export const CHAT_PICTURES = 3;
/** A photo as the model gets it: at most 1024 px on the long side, JPEG (on white, for see-through pictures). */
async function pictureUrl(blob, doc = globalThis.document, side = 1024) {
  const bitmap = await createImageBitmap(blob), scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = doc.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); g.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close?.();
  return canvas.toDataURL('image/jpeg', .85);
}

const BRING_KEY = 'sttts.bring';
/** The note older versions wrote into the chat for a choice; the chat shows the pending choice by itself now. */
export const BRING_NOTE = /^\d+ 条消息会带进下一次正文$/;

export function createChatHost({context, settings, backend, notice, memory = null, onCall = () => {}, storage = globalThis.localStorage, loadCompletion = loadCompletionModule, picture = pictureUrl, ask = requestAssistantText}) {
  const busy = new Map();
  // 看图. A tavern connection sees when the tavern says so (its 发送内联图片, and a model it knows takes pictures); a
  // custom connection is tried. A model that failed with pictures and answered without them is not sent any again
  // until the page is reloaded.
  const blind = new Set();
  const seeKey = ctx => { const t = activeText(settings().text); if (t.source === 'custom') return `custom:${t.id}:${t.model}`; let model = ''; try { model = ctx?.getChatCompletionModel?.() || ''; } catch { /* older tavern */ } return `tavern:${ctx?.chatCompletionSettings?.chat_completion_source || ''}:${model}`; };
  async function sees(ctx = context()) {
    if (blind.has(seeKey(ctx))) return false;
    if (activeText(settings().text).source === 'custom') return true;
    if (!hasCompletionService(ctx)) return false;
    try { return !!(await loadCompletion()).isImageInliningSupported?.(); } catch { return false; }
  }
  /** The user's latest photos in the chat window, ready to send, when the model sees ([] otherwise). */
  async function pictures(ctx, thread, preset) {
    const photos = thread.messages.filter(m => m.kind !== 'system').slice(-preset.history).filter(m => m.kind === 'photo' && m.from === 'me' && m.photoId).slice(-CHAT_PICTURES);
    if (!photos.length || !await sees(ctx)) return [];
    const out = [];
    for (const m of photos) {
      try { const row = await backend.library.getPhoto(m.photoId); if (row?.blob) out.push({id: m.id, url: await picture(row.blob)}); }
      catch (error) { backend.reportDiagnostic?.('聊天 · 看图', error, 'warn'); }
    }
    return out;
  }
  /** The contact's answer; with pictures, through the request that carries them, and in words only if that fails. */
  async function answerFor(ctx, request, pics) {
    if (!pics.length) return backend.generateText(ctx, {prompt: request([]), trimNames: false});
    try { return await ask(ctx, backend, settings(), request(pics), {label: '聊天 · 看图'}); }
    catch (error) {
      backend.reportDiagnostic?.('聊天 · 看图', error, 'warn');
      const answer = await backend.generateText(ctx, {prompt: request([]), trimNames: false});
      blind.add(seeKey(ctx));
      return answer;
    }
  }
  // What the next story reply brings along; kept over a page reload (it used to be lost without a word).
  let pending = (() => { try { const p = JSON.parse(storage?.getItem(BRING_KEY) || 'null'); return p?.threadId && p.text ? p : null; } catch { return null; } })();
  const keepBring = () => { try { if (pending) storage?.setItem(BRING_KEY, JSON.stringify(pending)); else storage?.removeItem(BRING_KEY); } catch { /* this visit only */ } };
  /** A note「N 条消息会带进下一次正文」an older version wrote for the choice goes when that choice is replaced, cancelled or used. */
  const dropNote = p => p?.noteId ? backend.chatMutate(p.threadId, () => backend.chats.removeMessages(p.threadId, [p.noteId])).catch(() => {}) : Promise.resolve();

  const userName = () => context()?.name1 || '我';
  const userPersona = () => String(context()?.powerUserSettings?.persona_description || '').slice(0, 1500);

  /** Character card text for a contact that is also a tavern character. */
  function card(name) {
    const c = context()?.characters?.find(ch => ch?.name === name);
    if (!c) return '';
    return [c.description, c.personality && '性格：' + c.personality].filter(Boolean).join('\n')
      .replaceAll('{{char}}', name).replaceAll('{{user}}', userName()).slice(0, 2000);
  }
  // The same recent story as the other apps (core/moments.js storyLines), as much as the chat preset says.
  const story = preset => storyLines(context()?.chat || [], preset, userName());
  function members(thread) {
    // This card's contact first; a member the card's story has not met is still who they are (voice and all).
    const s = settings(), contacts = backend.contacts(), all = chatContacts(s);
    return thread.members.map(name => {
      const c = contacts.find(x => x.name === name) || all.find(x => x.name === name);
      return {name, persona: c?.persona || '', card: c?.persona ? '' : card(name), voice: !!c?.voice, language: c?.language || s.general.defaultLanguage};
    });
  }

  /** Asks the model for the contact's next messages and stores them. One request per chat at a time. */
  /** nudge: 主动找你 — the contact may also choose not to text (null then), and no 正在输入 shows meanwhile. */
  function reply(threadId, {nudge = false} = {}) {
    if (busy.has(threadId)) return busy.get(threadId);
    const job = (async () => {
      const ctx = context();
      const thread = await backend.chats.get(threadId);
      if (!thread) throw Error('这段聊天已不存在');
      if (thread.friend?.by === 'me') throw Error(`你已经删除了${thread.members[0]}，在「联系人 → 新的朋友」里加回来才能聊天`);
      if (thread.friend?.by === 'them') throw Error(`${thread.members[0]}已经把你删了，先发送好友申请`);
      const s = settings(), preset = activeChatPreset(s.chat), people = members(thread), voiceFormat = backend.voiceFormat(), user = userName();
      // Voice switched off: nobody sends voice messages.
      if (s.general.voiceEnabled === false) for (const p of people) p.voice = false;
      if (!nudge) backend.emit('chat', {threadId, typing: true});
      const recent = story(preset), forumSpace = s.chat.partition === 'card' ? {key: thread.space || backend.cardKey()} : null;
      let forum = '';
      if (promptOn(s.promptRules, 'chat-forum')) {
        try { forum = forumContext((await backend.apps.list('forum')).filter(p => inSpace(p, forumSpace)), user, s.chat.netNames); }
        catch (error) { backend.reportDiagnostic?.('聊天 · 论坛读取', error, 'warn'); }
      }
      // 世界书: scanned over who is in the chat, the recent story and the chat itself, as the story's own request would be.
      const lore = preset.lore === false ? '' : await worldInfoFor(context, {...loreOptions(preset), report: (...args) => backend.reportDiagnostic?.(...args), persona: userPersona(), characters: people.map(p => p.persona || p.card).join('\n'),
        texts: [forum, people.map(p => p.name).join('、'), ...recent.map(r => `${r.name}: ${r.text}`), ...thread.messages.slice(-preset.history).map(m => messageLine(m, user))]});
      // 记忆: the written-up older chat, and older messages that match the latest ones.
      const query = thread.messages.filter(m => m.kind !== 'system').slice(-6).map(m => messageLine(m, user)).join('\n');
      const remembered = memory ? (await memory.contextFor(thread, {query}).catch(() => ({text: ''}))).text : '';
      const request = pics => buildChatRequest({prompts: settings().promptRules, preset, thread, members: people, story: recent, user, userPersona: userPersona(), voiceFormat, lore, forum, memory: remembered, earlier: memory?.storyMemory() || '', images: !!backend.drawReady?.(), stickers: settings().chat.stickers || [], nudge, music: {share: s.music?.share !== false, listening: s.music?.share !== false ? backend.listening : null}, pictures: pics});
      const answer = cleanTagged(await answerFor(ctx, request, await pictures(ctx, thread, preset)), preset.cleanTags);
      // 「[不发]」 (also as 「名字：[不发]」) is a no, not a message.
      const text = nudge ? answer.split('\n').filter(line => !/\[不发\]/.test(line)).join('\n') : answer;
      const items = parseChatReply(text, {members: people, user, voiceFormat, voiceNames: people.filter(p => p.voice).map(p => p.name), stickers: settings().chat.stickers || []});
      if (!items.length && nudge) return null;
      if (!items.length) throw Error('这次没有收到消息，可以再试一次');
      const before = new Set((await backend.chats.get(threadId))?.messages.map(m => m.id) || []);
      const saved = await backend.chatMutate(threadId, () => settle(threadId, items));
      memory?.after(threadId);
      // The new photos with tags are drawn when the free tier covers them; the others wait for 画出来.
      for (const m of saved?.messages || []) if (!before.has(m.id) && m.kind === 'photo' && !m.photoId && (m.imageTags || backend.drawReady?.())) drawPhoto(threadId, m.id).catch(() => {});
      return saved;
    })().finally(() => { busy.delete(threadId); backend.emit('chat', {threadId, typing: false}); });
    busy.set(threadId, job);
    return job;
  }

  /**
   * Stores a reply. A claim takes (or returns) the user's latest red packet or transfer that is still waiting,
   * and leaves a notice where it happened.
   */
  async function settle(threadId, items) {
    const thread = await backend.chats.get(threadId), taken = new Set(), out = [], posts = [];
    let calling = null, cutting = false;
    let latest = thread;
    for (const item of items) {
      // 「[删除好友]」: the contact deletes the user (private chats only; the user finds out on their next message).
      if (item.kind === 'unfriend') { if (thread.type === 'dm') cutting = true; continue; }
      if (item.kind === 'befriend' || item.kind === 'refuse') continue;
      // 「[朋友圈] …」: posted to 朋友圈 while chatting, not a chat message.
      if (item.kind === 'moment') { posts.push({author: item.from, text: item.text, source: 'chat', space: thread?.space || backend.cardKey()}); continue; }
      // 「[打电话] …」: the contact calls right after this reply (private chats only; one call).
      if (item.kind === 'call') { if (thread.type === 'dm' && !calling) calling = item; continue; }
      if (item.kind !== 'claim') { out.push(item); continue; }
      const kinds = item.what ? [item.what] : item.action === 'return' ? ['transfer'] : ['redpacket', 'transfer', 'gift'];
      const target = thread.messages.findLast(m => m.from === 'me' && kinds.includes(m.kind) && m.state === 'sent' && !taken.has(m.id));
      if (!target) continue;
      taken.add(target.id);
      const state = target.kind === 'redpacket' ? 'opened' : item.action === 'return' ? 'returned' : 'accepted';
      if (target.kind === 'redpacket' && item.action === 'return') continue;
      latest = await backend.chats.updateMessage(threadId, target.id, {state, openedBy: item.from});
      // A transfer or a gift sent back: its money returns to the wallet.
      const back = state === 'returned' ? (target.kind === 'gift' ? target.gift.price : Number(target.amount)) : 0;
      if (back > 0) backend.walletMove(back, {kind: 'refund', note: target.kind === 'gift' ? target.gift.name : target.text, who: item.from});
      const gift = target.kind === 'gift';
      out.push({from: item.from, kind: 'notice', target: 'me', text: {opened: '领取了{对方}的红包', accepted: gift ? '收下了{对方}的礼物' : '收下了{对方}的转账', returned: gift ? '退还了{对方}的礼物' : '退还了{对方}的转账'}[state]});
    }
    if (posts.length) await backend.momentsMutate(() => backend.moments.add(posts)).catch(() => {});
    let saved = out.length ? await backend.chats.append(threadId, out) : latest;
    if (cutting) { saved = await backend.chats.update(threadId, {friend: {by: 'them', at: Date.now(), requests: []}}); calling = null; refreshCuts(); }
    if (calling) setTimeout(() => onCall(calling.from, calling.reason), 1200);
    return saved;
  }

  // What waits to be carried into the story goes when its chat, or any of its messages, is deleted before then (it
  // used to go in once all the same). A choice from before 0.8.47 has no ids: only its chat is checked.
  async function checkPending() {
    const p = pending;
    if (!p) return;
    const thread = await backend.chats.get(p.threadId).catch(() => null), have = new Set((thread?.messages || []).map(m => m.id));
    if (pending !== p || (thread && (p.ids || []).every(id => have.has(id)))) return;
    pending = null; keepBring();
    backend.emit('chat', {threadId: p.threadId, bring: false});
  }
  backend.subscribe?.(event => { if (event?.type === 'chat' && !event.typing && event.bring === undefined && pending && event.threadId === pending.threadId) checkPending().catch(() => {}); });

  /** Prepares chat messages to be carried into the next story reply. */
  async function bring(threadId, ids) {
    const thread = await backend.chats.get(threadId);
    if (!thread) throw Error('这段聊天已不存在');
    const chosen = thread.messages.filter(m => ids.includes(m.id) && m.kind !== 'system');
    if (!chosen.length) throw Error('请先选择要带进剧情的消息');
    const preset = activeChatPreset(settings().chat), before = pending;
    // A new choice takes the place of the one before (only one goes into the story), and so does its note.
    pending = null; keepBring();
    await dropNote(before);
    pending = {threadId, name: thread.name, count: chosen.length, ids: chosen.map(m => m.id), text: bringText(preset, {thread, messages: chosen, user: userName()})};
    keepBring();
    return {...pending, replaced: before ? before.count : 0};
  }

  /**
   * Prompt entries for inject(). A real story reply (not a dry run, a quiet request or an impersonation) uses the pending
   * chat once; the entry stays until the next inject() clears the sttts.entry.* keys.
   */
  function bringPlan(type, dryRun) {
    if (!pending) return [];
    const i = activeChatPreset(settings().chat).injection, inChat = i.position === 'in_chat';
    const entry = {key: 'sttts.entry.bring', text: pending.text, position: {in_chat: 1, in_prompt: 0, before_prompt: 2}[i.position], depth: inChat ? i.depth : 0, role: inChat ? {system: 0, user: 1, assistant: 2}[i.role] : 0};
    if (type && !['quiet', 'impersonate'].includes(type) && !dryRun) {
      const used = pending;
      pending = null; keepBring();
      notice(`和${used.name}的聊天已带进这次正文`);
      dropNote(used).then(() => backend.chatMutate(used.threadId, () => backend.chats.append(used.threadId, [{from: 'me', kind: 'system', text: `${used.count} 条消息已带进正文`}], {read: true}))).catch(() => {})
        .finally(() => backend.emit('chat', {threadId: used.threadId, bring: false}));
    }
    return [entry];
  }

  /** Draws a contact's photo (its tags). Without allowPaid, only when the free tier covers it. */
  async function drawPhoto(threadId, messageId, {allowPaid = false} = {}) {
    const m = (await backend.chats.get(threadId))?.messages.find(x => x.id === messageId);
    if (!m || m.kind !== 'photo' || !(m.imageTags || m.text?.trim())) throw Error('这张照片没有画图用的描述');
    const set = patch => backend.chatMutate(threadId, () => backend.chats.updateMessage(threadId, messageId, patch));
    if (!backend.drawReady()) { await set({imageState: 'failed', imageNote: backend.drawMissing()}); return null; }
    try {
      // The model wrote only the description (no 「｜英文 tag」, common with a long one): its words become the tags
      // once, kept with the photo.
      if (!m.imageTags) {
        // Drawn on its own (not asked for) only when it costs nothing: no words spent turning it into tags otherwise.
        if (!allowPaid && backend.drawQuote?.()?.free === false) throw Object.assign(Error('要花钱'), {code: 'PAID'});
        await set({imageState: 'waiting', imageNote: ''});
        const tags = tagTextAnswer(await backend.generateText(context(), {prompt: tagTextRequest(settings(), m.text, 'translate'), plainText: true, trimNames: false, responseLength: Math.min(6000, 1500 + m.text.length * 3)})).replace(/\s+/g, ' ').trim().slice(0, 6000);
        if (!tags) throw Error('没把照片的描述写成画图用的 tag，再点一次试试');
        m.imageTags = tags;
        await set({imageTags: tags});
      }
      // The saved looks of who the photo shows: the people its description names, else the sender (a selfie).
      const names = [...settings().routes.map(r => r.name), userName()], drawn = photoTags({text: m.text, tags: m.imageTags, owner: m.from, names});
      const cast = photoCast({text: m.text, tags: drawn, owner: m.from, names});
      const input = pictureInputs(settings(), {prompt: drawn, characters: cast}, '');
      await set({imageState: 'waiting', imageNote: ''});
      const result = await backend.generateImage({...input, allowPaid, name: `聊天-${m.from}`, key: `chat-photo:${messageId}`, label: `聊天 · ${m.from}`});
      await backend.chatMutate(threadId, async () => {
        const current = (await backend.chats.get(threadId))?.messages.find(x => x.id === messageId);
        if (!current || current.kind !== 'photo') return;
        await backend.chats.updateMessage(threadId, messageId, {photoId: result.photoId,
          imageVersions: [...new Set([...(current.imageVersions || []), current.photoId, result.photoId].filter(Boolean))], imageState: 'done', imageNote: ''});
      });
      return result.photoId;
    } catch (error) {
      await set({imageState: 'failed', imageNote: error.code === 'PAID' ? backend.paidPrompt().note : error.message}).catch(() => {});
      throw error;
    }
  }

  // ---------- 删好友 ----------
  /** 发送好友申请 to someone who deleted the user: they decide (one model request). {accepted, thread}. */
  function askFriend(threadId, text) {
    if (busy.has(threadId)) return busy.get(threadId);
    const job = (async () => {
      const ctx = context(), said = String(text || '').trim().slice(0, 100) || `我是${userName()}`;
      const thread = await backend.chats.get(threadId);
      if (!thread) throw Error('这段聊天已不存在');
      if (thread.friend?.by !== 'them') throw Error('TA 还是你的好友');
      const name = thread.members[0], s = settings(), preset = activeChatPreset(s.chat), people = members(thread), user = userName();
      await backend.chatMutate(threadId, () => backend.chats.append(threadId, [{from: 'me', kind: 'system', text: `你发送了好友申请：「${said}」`}], {read: true}));
      backend.emit('chat', {threadId, typing: true});
      const recent = story(preset);
      const remembered = memory ? (await memory.contextFor(thread, {query: said}).catch(() => ({text: ''}))).text : '';
      const prompt = buildChatRequest({prompts: settings().promptRules, preset, thread, members: people, story: recent, user, userPersona: userPersona(), voiceFormat: '', memory: remembered, earlier: memory?.storyMemory() || '', images: !!backend.drawReady?.(), stickers: s.chat.stickers || [], asking: said});
      const reply = cleanTagged(await backend.generateText(ctx, {prompt, trimNames: false}), preset.cleanTags);
      const items = parseChatReply(reply, {members: people.map(p => ({...p, voice: false})), user, voiceFormat: '', voiceNames: [], stickers: s.chat.stickers || []});
      const yes = items.findIndex(i => i.kind === 'befriend'), no = items.find(i => i.kind === 'refuse');
      if (yes < 0 || (no && items.indexOf(no) < yes)) {
        const saved = await backend.chatMutate(threadId, () => backend.chats.append(threadId, [{from: 'me', kind: 'system', text: `${name}没有通过你的好友申请${no?.text ? '：' + no.text : ''}`}], {read: true}));
        return {accepted: false, thread: saved};
      }
      await backend.chats.update(threadId, {friend: null});
      await backend.chats.append(threadId, [{from: 'me', kind: 'system', text: `${name}通过了你的好友申请，现在可以开始聊天了`}], {read: true});
      const rest = items.slice(yes + 1).filter(i => !['befriend', 'refuse', 'unfriend'].includes(i.kind));
      const saved = rest.length ? await backend.chatMutate(threadId, () => settle(threadId, rest)) : await backend.chats.get(threadId);
      refreshCuts();
      backend.emit('chat', {threadId, friend: true});
      return {accepted: true, thread: saved};
    })().finally(() => { busy.delete(threadId); backend.emit('chat', {threadId, typing: false}); });
    busy.set(threadId, job);
    return job;
  }
  // Who is not friends with whom on the phone (every card's), for the story: kept here because inject() cannot wait.
  // The group chats' names too, for the story's phone rule (<phone group="…">).
  let cuts = [], cutsLoaded = false, groups = [];
  function refreshCuts() {
    Promise.resolve().then(() => backend.chats.list()).then(list => {
      cutsLoaded = true;
      cuts = list.filter(t => t.type === 'dm' && t.friend).map(t => ({name: t.members[0], by: t.friend.by, space: t.space || ''}));
      groups = list.filter(t => t.type === 'group').map(t => ({name: t.name, space: t.space || ''}));
    }).catch(() => {});
  }
  refreshCuts();
  backend.subscribe?.(event => { if (event?.type === 'chat' && event.friend) refreshCuts(); });
  /** The story knows who deleted whom on the phone (a 冷战 shows in the story too). */
  function friendsPlan() {
    if (!cutsLoaded) refreshCuts();
    const here = backend.here?.(), user = userName(), list = cuts.filter(c => inSpace(c, here));
    if (!list.length) return [];
    const mine = list.filter(c => c.by === 'me').map(c => c.name), theirs = list.filter(c => c.by === 'them').map(c => c.name);
    const text = ['【手机上的好友关系】', mine.length ? `${user}在手机上把${mine.join('、')}删了好友：TA 们发不了消息给${user}，只能发好友申请。` : '', theirs.length ? `${theirs.join('、')}在手机上把${user}删了好友：${user}发的消息会被拒收。` : ''].filter(Boolean).join(' ');
    return [{key: 'sttts.entry.friends', text, position: 1, depth: 2, role: 0}];
  }

  // ---------- 主动发消息 ----------
  /** The group chats of this card (分区), by name, once each. */
  const groupNames = () => { const here = backend.here?.(); return [...new Set(groups.filter(g => inSpace(g, here)).map(g => g.name))]; };
  /**
   * 正文联动手机 with 回复后单独配音 or 配图 on: the phone part goes in that request (after the reply) instead of the
   * story's own, so the story request stays as it is.
   */
  function phoneAfter() {
    const s = settings();
    return s.chat.proactive?.on === true && ((s.general.voiceEnabled !== false && s.general.voiceMode === 'separate') || (s.draw.enabled && s.draw.mode === 'separate'));
  }
  /** The phone part's rule for that request; '' when there is no one to send anything, or it is not the phone's turn. */
  async function phoneAfterPlan() {
    if (!phoneTurn()) return '';
    const list = await backend.chats.list().catch(() => null);
    if (list) groups = list.filter(t => t.type === 'group').map(t => ({name: t.name, space: t.space || ''}));
    return phoneAfterRule(activeChatPreset(settings().chat), {user: userName(), names: backend.contacts().map(c => c.name), groups: groupNames(), images: !!backend.drawReady?.()});
  }
  /** The 正文 rule for the story request while 正文联动手机 is on: who can send what, and how (<phone>). */
  function storyPlan() {
    const s = settings(), friends = friendsPlan();
    if (!s.chat.proactive?.on || phoneAfter() || !phoneTurn()) return friends;
    refreshCuts();
    const text = storyTextRule(activeChatPreset(s.chat), {user: userName(), names: backend.contacts().map(c => c.name), groups: groupNames(), images: !!backend.drawReady?.()});
    return [...(text ? [{key: 'sttts.entry.phone', text, position: 1, depth: 0, role: 0}] : []), ...friends];
  }
  const SENT_KEY = 'sttts.phoneSent', DAY_KEY = 'sttts.phoneDay';
  const hash = text => { let h = 0; for (const c of String(text)) h = (h * 31 + c.codePointAt(0)) | 0; return (h >>> 0).toString(36); };
  function sentBefore(key) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(SENT_KEY) || '[]'); } catch { /* none kept */ }
    if (list.includes(key)) return true;
    try { localStorage.setItem(SENT_KEY, JSON.stringify([...list, key].slice(-300))); } catch { /* this session only */ }
    return false;
  }
  /** The private chat with `name` here (this card, with 分区), made when there is none yet. */
  async function dmWith(name) {
    const here = currentDm(await backend.threads(), name);
    return here || backend.chatMutate(null, () => backend.chats.create({type: 'dm', members: [name], space: backend.cardKey()}));
  }
  /** Messages that came to the phone: kept unread, said on the island, and photos drawn when that costs nothing. */
  async function arrive(threadId, items, from = null) {
    const before = new Set((await backend.chats.get(threadId))?.messages.map(m => m.id) || []);
    if (from) items = items.map(item => ({...item, story: from.story, storyVer: from.ver}));
    const saved = await backend.chatMutate(threadId, () => settle(threadId, items));
    const fresh = (saved?.messages || []).filter(m => !before.has(m.id) && m.from !== 'me');
    for (const m of fresh) if (m.kind === 'photo' && !m.photoId && (m.imageTags || backend.drawReady?.())) drawPhoto(threadId, m.id).catch(() => {});
    const last = fresh.at(-1);
    if (last) backend.emit('chat', {threadId, incoming: {from: last.from, text: last.text || '', kind: last.kind, count: fresh.length}});
    return fresh.length;
  }
  // How often the phone reaches out, whoever does it (the story writing <phone>, or someone asked by nudge): with
  // `every` set, the phone has one turn in that many story replies — the story may send then, else someone is asked;
  // at most dailyMax times a day (0: no limit). Out of turn the story is not told it can use the phone at all.
  let quiet = 0;
  function today() {
    let day = {day: new Date().toDateString(), n: 0};
    try { const saved = JSON.parse(localStorage.getItem(DAY_KEY) || 'null'); if (saved?.day === day.day) day = saved; } catch { /* this session only */ }
    return day;
  }
  function counted() {
    const day = today(); day.n++;
    try { localStorage.setItem(DAY_KEY, JSON.stringify(day)); } catch { /* counted for this session */ }
  }
  /** Whether the next story reply may reach out on the phone. */
  function phoneTurn() {
    const o = settings().chat.proactive || {};
    if (!o.on || (o.dailyMax > 0 && today().n >= o.dailyMax)) return false;
    return !(o.every > 0) || quiet >= o.every - 1;
  }
  /** A story reply finished: what it sent to the phone (<phone>) arrives, once per version of the reply; when it is
   * the phone's turn and nothing came, someone is asked whether they would text first (one phone request). */
  async function storyReplied(id) {
    const o = settings().chat.proactive || {};
    if (!o.on) { quiet = 0; return; }
    const sent = await deliver(id);
    if (sent) { quiet = 0; counted(); return; }
    if (!(o.every > 0) || ++quiet < o.every) return;
    quiet = 0;
    if (!(o.dailyMax > 0 && today().n >= o.dailyMax)) await nudge();
  }
  /**
   * What a story reply sent to the phone (<phone>) arrives, once per version of the reply: private messages (and
   * photos, money, calls, 朋友圈…) to each sender's chat, <phone group="…"> to that group. Returns how many arrived.
   */
  async function deliver(id) {
    const ctx = context(), s = settings();
    if (!s.chat.proactive?.on) return 0;
    const index = Number.isInteger(Number(id)) ? Number(id) : (ctx?.chat?.length || 0) - 1, m = ctx?.chat?.[index];
    let sent = 0;
    if (m && !m.is_user && !m.is_system && typeof m.mes === 'string') {
      const parts = phoneParts(m.mes), blocks = parts.filter(p => !p.group).map(p => p.text), grouped = parts.filter(p => p.group);
      const story = [ctx.getCurrentChatId?.() || ctx.chatId || '', index].join('|'), ver = hash(parts.map(p => p.group + '|' + p.text).join('\n'));
      const key = story + '|' + ver, from = {story, ver};
      // Rolled again (重 roll, a new swipe): what the earlier version sent goes; this one sends its own.
      const gone = await withdraw(story, ver).catch(() => 0);
      if (gone && !parts.length) notice(`重新生成了这条回复，之前发到手机上的 ${gone} 条消息撤回了`);
      if (parts.length && !sentBefore(key)) {
        const contacts = backend.contacts(), people = contacts.map(c => ({name: c.name, voice: false}));
        // A line from someone who is not in the phone (a passer-by, the user) is left out, not given to the one before.
        const known = new Set(contacts.map(c => c.name)), named = line => line.match(/^\s*(?:\*\*)?[[【]?([^\]】:：\n]{1,40}?)[\]】]?(?:\*\*)?\s*[:：]/)?.[1]?.trim();
        const kept = (b, only = known) => b.split(/\r?\n/).filter(line => { const who = named(line); return !who || only.has(who); }).join('\n');
        // A group's part goes to the group (the window in use), from its members.
        if (grouped.length) {
          const threads = await backend.threads();
          for (const part of grouped) {
            const first = threads.find(t => t.type === 'group' && t.name === part.group), thread = first && currentWindow(threads, first);
            if (!thread) continue;
            const members = new Set(thread.members.filter(n => known.has(n)));
            const items = parseChatReply(kept(part.text, members), {members: [...members].map(name => ({name, voice: false})), user: userName(), voiceFormat: '', voiceNames: [], stickers: s.chat.stickers || []});
            try { const n = items.length ? await arrive(thread.id, items, from) : 0; if (n) { sent += n; notice(`群「${thread.name}」有 ${n} 条新消息`); } } catch { /* not worth interrupting the story */ }
          }
        }
        const items = blocks.flatMap(b => parseChatReply(kept(b), {members: people, user: userName(), voiceFormat: '', voiceNames: [], stickers: s.chat.stickers || []}));
        const byName = new Map();
        for (const item of items) if (contacts.some(c => c.name === item.from)) byName.set(item.from, [...(byName.get(item.from) || []), item]);
        for (const [name, list] of byName) {
          try {
            const thread = await dmWith(name);
            // Deleted by the user: what they send waits as 好友申请.
            if (thread.friend?.by === 'me') {
              const texts = list.filter(i => ['text', 'voice'].includes(i.kind)).map(i => i.translation || i.text).filter(Boolean);
              if (texts.length) { await backend.friendRequest(thread.id, texts.join(' ')); sent += 1; notice(`${name} 请求添加你为好友：${texts.join(' ').slice(0, 40)}`); }
              continue;
            }
            // They had deleted the user and text again: they added the user back.
            if (thread.friend?.by === 'them') { await backend.chats.update(thread.id, {friend: null}); await backend.chats.append(thread.id, [{from: 'me', kind: 'system', text: `${name}重新添加了你为好友`}]); refreshCuts(); }
            const n = await arrive(thread.id, list, from); if (n) { sent += n; notice(`${name} 给你发来 ${n} 条消息`); }
          } catch { /* a failed delivery is not worth interrupting the story */ }
        }
      }
    }
    return sent;
  }
  /**
   * A story reply rolled again: the messages its earlier versions sent to the phone are taken out, unless the user has
   * answered after them (then the talk stays as it went). Returns how many went.
   */
  async function withdraw(story, ver) {
    let gone = 0;
    for (const t of await backend.threads()) {
      const list = (await backend.chats.get(t.id))?.messages || [], old = list.filter(m => m.story === story && m.storyVer !== ver);
      if (!old.length) continue;
      const after = list.slice(list.indexOf(old.at(-1)) + 1);
      if (after.some(m => m.from === 'me' && m.kind !== 'system')) continue;
      await backend.chatMutate(t.id, () => backend.chats.removeMessages(t.id, old.map(m => m.id)));
      gone += old.length;
      backend.emit('chat', {threadId: t.id});
    }
    return gone;
  }
  /** On the phone's turn with nothing sent: someone is asked whether they would text first now (they may say no). */
  async function nudge() {
    const ctx = context();
    // The card's own character first, else someone from the 角色 App.
    // Not someone who is not friends with the user right now (either way).
    const apart = new Set((await backend.threads()).filter(t => t.type === 'dm' && t.friend).map(t => t.members[0]));
    const roles = backend.contacts().filter(c => c.source === 'role' && !apart.has(c.name)), now = ctx?.name2;
    const name = roles.find(c => c.name === now)?.name || roles[Math.floor(Math.random() * roles.length)]?.name;
    if (!name) return;
    try {
      const thread = await dmWith(name), before = new Set((await backend.chats.get(thread.id))?.messages.map(x => x.id) || []);
      const saved = await reply(thread.id, {nudge: true});
      const fresh = (saved?.messages || []).filter(x => !before.has(x.id) && x.from !== 'me');
      // Only messages sent count toward the day; 「[不发]」 does not.
      if (!fresh.length) return;
      notice(`${name} 给你发来 ${fresh.length} 条消息`); backend.emit('chat', {threadId: thread.id, incoming: {from: name, text: fresh.at(-1).text || '', kind: fresh.at(-1).kind, count: fresh.length}});
      counted();
    } catch { /* not worth interrupting the story */ }
  }

  /**
   * Older versions wrote「N 条消息会带进下一次正文」into the chat and could lose the choice itself (a reload), leaving
   * notes that promised forever what would never happen. They are taken out of this card's chats.
   */
  async function tidyNotes() {
    await checkPending().catch(() => {});
    for (const t of await backend.chats.list()) {
      const thread = await backend.chats.get(t.id), stale = (thread?.messages || []).filter(m => m.kind === 'system' && BRING_NOTE.test(m.text || '')).map(m => m.id);
      if (stale.length) await backend.chatMutate(t.id, () => backend.chats.removeMessages(t.id, stale)).catch(() => {});
    }
  }

  return {
    reply, bring, bringPlan, tidyNotes, drawPhoto, storyPlan, storyReplied, deliver, phoneAfter, phoneAfterPlan, askFriend,
    seesPictures: () => sees(),
    typing: threadId => busy.has(threadId),
    pendingBring: () => pending && {threadId: pending.threadId, name: pending.name, count: pending.count},
    cancelBring: () => { const p = pending; pending = null; keepBring(); return dropNote(p).finally(() => { if (p) backend.emit('chat', {threadId: p.threadId, bring: false}); }); }
  };
}
