// Phone chat, tavern side. Replies are generated separately from the story with the tavern's connected model
// (generateRaw): the prompt carries the chat preset, each contact's persona or character card, the user's persona,
// recent story messages and the chat history. Nothing is written into the story unless the user brings a chat
// into it; that text is injected once, into the next story reply.
import {buildChatRequest, parseChatReply, bringText, plainStory, activeChatPreset, messageLine, cleanTagged, chatContacts} from './core/chat.js';
import {worldInfoFor, loreOptions} from './host-lore.js';
import {pictureInputs} from './core/draw.js';
import {storyLines} from './core/moments.js';

export function createChatHost({context, settings, backend, notice, memory = null, onCall = () => {}}) {
  const busy = new Map();
  let pending = null;

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
  function reply(threadId) {
    if (busy.has(threadId)) return busy.get(threadId);
    const job = (async () => {
      const ctx = context();
      const thread = await backend.chats.get(threadId);
      if (!thread) throw Error('这段聊天已不存在');
      const s = settings(), preset = activeChatPreset(s.chat), people = members(thread), voiceFormat = backend.voiceFormat(), user = userName();
      // Voice switched off: nobody sends voice messages.
      if (s.general.voiceEnabled === false) for (const p of people) p.voice = false;
      backend.emit('chat', {threadId, typing: true});
      const recent = story(preset);
      // 世界书: scanned over who is in the chat, the recent story and the chat itself, as the story's own request would be.
      const lore = preset.lore === false ? '' : await worldInfoFor(context, {...loreOptions(preset), persona: userPersona(), characters: people.map(p => p.persona || p.card).join('\n'),
        texts: [people.map(p => p.name).join('、'), ...recent.map(r => `${r.name}: ${r.text}`), ...thread.messages.slice(-preset.history).map(m => messageLine(m, user))]});
      // 记忆: the written-up older chat, and older messages that match the latest ones.
      const query = thread.messages.filter(m => m.kind !== 'system').slice(-6).map(m => messageLine(m, user)).join('\n');
      const remembered = memory ? (await memory.contextFor(thread, {query}).catch(() => ({text: ''}))).text : '';
      const prompt = buildChatRequest({preset, thread, members: people, story: recent, user, userPersona: userPersona(), voiceFormat, lore, memory: remembered, earlier: memory?.storyMemory() || '', images: !!backend.drawReady?.(), stickers: settings().chat.stickers || []});
      const text = cleanTagged(await backend.generateText(ctx, {prompt, trimNames: false}), preset.cleanTags);
      const items = parseChatReply(text, {members: people, user, voiceFormat, voiceNames: people.filter(p => p.voice).map(p => p.name), stickers: settings().chat.stickers || []});
      if (!items.length) throw Error('这次没有收到消息，可以再试一次');
      const before = new Set((await backend.chats.get(threadId))?.messages.map(m => m.id) || []);
      const saved = await backend.chatMutate(threadId, () => settle(threadId, items));
      memory?.after(threadId);
      // The new photos with tags are drawn when the free tier covers them; the others wait for 画出来.
      for (const m of saved?.messages || []) if (!before.has(m.id) && m.kind === 'photo' && m.imageTags && !m.photoId) drawPhoto(threadId, m.id).catch(() => {});
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
    let calling = null;
    let latest = thread;
    for (const item of items) {
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
    const saved = out.length ? await backend.chats.append(threadId, out) : latest;
    if (calling) setTimeout(() => onCall(calling.from, calling.reason), 1200);
    return saved;
  }

  /** Prepares chat messages to be carried into the next story reply. */
  async function bring(threadId, ids) {
    const thread = await backend.chats.get(threadId);
    if (!thread) throw Error('这段聊天已不存在');
    const chosen = thread.messages.filter(m => ids.includes(m.id) && m.kind !== 'system');
    if (!chosen.length) throw Error('请先选择要带进剧情的消息');
    const preset = activeChatPreset(settings().chat);
    pending = {threadId, name: thread.name, count: chosen.length, text: bringText(preset, {thread, messages: chosen, user: userName()})};
    await backend.chatMutate(threadId, () => backend.chats.append(threadId, [{from: 'me', kind: 'system', text: `${chosen.length} 条消息会带进下一次正文`}], {read: true}));
    return {...pending};
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
      pending = null;
      notice(`和${used.name}的聊天已带进这次正文`);
      backend.emit('chat', {threadId: used.threadId, bring: false});
    }
    return [entry];
  }

  /** Draws a contact's photo (its tags). Without allowPaid, only when the free tier covers it. */
  async function drawPhoto(threadId, messageId, {allowPaid = false} = {}) {
    const m = (await backend.chats.get(threadId))?.messages.find(x => x.id === messageId);
    if (!m?.imageTags) throw Error('这张照片没有画图用的描述');
    const set = patch => backend.chatMutate(threadId, () => backend.chats.updateMessage(threadId, messageId, patch));
    if (!backend.drawReady()) { await set({imageState: 'failed', imageNote: backend.drawMissing()}); return null; }
    try {
      // The sender's saved look only when the photo shows a person (a selfie), not a view or a meal.
      const person = /(\d+(?:girl|boy|other)s?|solo|selfie|portrait|upper body|cowboy shot)/i.test(m.imageTags);
      const input = pictureInputs(settings(), {prompt: m.imageTags, characters: person ? [m.from] : []}, '');
      await set({imageState: 'waiting', imageNote: ''});
      const result = await backend.generateImage({...input, allowPaid, name: `聊天-${m.from}`, key: `chat-photo:${messageId}`, label: `聊天 · ${m.from}`});
      await set({photoId: result.photoId, imageState: 'done', imageNote: ''});
      return result.photoId;
    } catch (error) {
      await set({imageState: 'failed', imageNote: error.code === 'PAID' ? backend.paidPrompt().note : error.message}).catch(() => {});
      throw error;
    }
  }

  return {
    reply, bring, bringPlan, drawPhoto,
    typing: threadId => busy.has(threadId),
    pendingBring: () => pending && {threadId: pending.threadId, name: pending.name, count: pending.count},
    cancelBring: () => { const threadId = pending?.threadId; pending = null; if (threadId) backend.emit('chat', {threadId, bring: false}); }
  };
}
