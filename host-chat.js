// Phone chat, tavern side. Replies are generated separately from the story with the tavern's connected model
// (generateRaw): the prompt carries the chat preset, each contact's persona or character card, the user's persona,
// recent story messages and the chat history. Nothing is written into the story unless the user brings a chat
// into it; that text is injected once, into the next story reply.
import {roleStore, findRoute} from './core/routes.js';
import {bubbleRequest, splitBubbleAnswer} from './core/bubble-css.js';
import {currentDm, currentWindow, lastRound} from './core/chats.js';
import {buildChatRequest, parseChatReply, bringText, activeChatPreset, messageLine, cleanTagged, chatContacts, storyTextRule, phoneAfterRule, phoneParts, inSpace, STICKER_MOODS} from './core/chat.js';
import {worldInfoFor, loreOptions} from './host-lore.js';
import {pictureInputs, photoPicture, tagTextRequest, tagTextAnswer, sizeFor} from './core/draw.js';
import {storyLines} from './core/moments.js';
import {forumContext} from './core/forum.js';
import {promptOn} from './core/prompt-rules.js';
import {activeText} from './core/llm.js';
import {requestAssistantText, hasCompletionService, loadCompletionModule} from './host-assistant.js';

/** 看图: the user's latest photos (at most this many, in the chat window) go along to a model that sees. */
export const CHAT_PICTURES = 3;
/** A photo as the model gets it: at most 1024 px on the long side, JPEG (on white, for see-through pictures). */
export async function pictureUrl(blob, doc = globalThis.document, side = 1024) {
  const bitmap = await createImageBitmap(blob), scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = doc.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); g.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close?.();
  return canvas.toDataURL('image/jpeg', .85);
}

const BRING_KEY = 'sttts.bring';
/** The note older versions wrote into the chat for a choice; the chat shows the pending choice by itself now. */
export const BRING_NOTE = /^\d+ 条消息会带进下一次正文$/;

// 按现实时间主动找你: the page's one clock (clockTimer), whichever chat host is the latest.
let clockTimer = null;
export function createChatHost({context, settings, backend, notice, memory = null, onCall = () => {}, onPosts = () => {},storage = globalThis.localStorage, loadCompletion = loadCompletionModule, picture = pictureUrl, ask = requestAssistantText}) {
  // busy: the reply being written for a chat (one at a time); stops: what lets it go (停止回复).
  const busy = new Map(), stops = new Map();
  const stopped = () => Object.assign(new Error('已停止回复'), {name: 'AbortError'});
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
  async function answerFor(ctx, request, pics, signal) {
    if (!pics.length) return backend.generateText(ctx, {use: 'chat', prompt: request([]), trimNames: false, signal});
    try { return await ask(ctx, backend, settings(), request(pics), {label: '聊天 · 看图', use: 'chat', signal}); }
    catch (error) {
      if (signal?.aborted) throw error;
      backend.reportDiagnostic?.('聊天 · 看图', error, 'warn');
      const answer = await backend.generateText(ctx, {use: 'chat', prompt: request([]), trimNames: false, signal});
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
  /** reroll: 重新回复这一轮 — the last round is asked again as if it were not there, and is replaced only when the new one
   *  came (it stays among the round's versions); one that fails or is stopped changes nothing. */
  function reply(threadId, {nudge = false, reroll = false, cue = '', time = 0} = {}) {
    if (busy.has(threadId)) return busy.get(threadId);
    const controller = new AbortController(), signal = controller.signal;
    const job = (async () => {
      const ctx = context();
      const thread = await backend.chats.get(threadId);
      if (!thread) throw Error('这段聊天已不存在');
      const last = reroll ? lastRound(thread.messages) : null;
      if (last) { const old = new Set(last.round.map(m => m.id)); thread.messages = thread.messages.filter(m => !old.has(m.id)); }
      if (thread.friend?.by === 'me') throw Error(`你已经删除了${thread.members[0]}，在「联系人 → 新的朋友」里加回来才能聊天`);
      if (thread.friend?.by === 'them') throw Error(`${thread.members[0]}已经把你删了，先发送好友申请`);
      if (thread.blocked) throw Error(`你已把${thread.members[0]}拉黑了，移出黑名单才能聊天`);
      const s = settings(), preset = activeChatPreset(s.chat), people = members(thread), voiceFormat = backend.voiceFormat(), user = userName();
      // Voice switched off: nobody sends voice messages.
      if (s.general.voiceEnabled === false) for (const p of people) p.voice = false;
      if (!nudge) backend.emit('chat', {threadId, typing: true});
      const recent = story(preset), forumSpace = s.chat.partition === 'card' ? {key: thread.space || backend.cardKey()} : s.chat.partition === 'chat' ? backend.here() : null;
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
      // 私聊带同群消息: what was said lately in the groups the contact is in too
      let shared = '';
      if (thread.type === 'dm' && promptOn(s.promptRules, 'chat-groups')) {
        try { shared = await sharedGroups(thread.members[0], user); } catch (error) { backend.reportDiagnostic?.('聊天 · 同群消息', error, 'warn'); }
      }
      const remembered = memory ? (await memory.contextFor(thread, {query}).catch(() => ({text: ''}))).text : '';
      const request = pics => buildChatRequest({prompts: settings().promptRules, preset, thread, members: people, story: recent, user, userPersona: userPersona(), voiceFormat, lore, forum, groups: shared, memory: remembered, earlier: memory?.storyMemory() || '', images: !!backend.drawReady?.(), stickers: stickersFor(people.map(p => p.name)), nudge, cue, time: time || Date.now(), music: {share: s.music?.share !== false, listening: s.music?.share !== false ? backend.listening : null}, pictures: pics});
      const answer = cleanTagged(await answerFor(ctx, request, await pictures(ctx, thread, preset), signal), preset.cleanTags);
      // 停止 while it was being written: what comes late is let go (the tavern's own generation cannot be stopped).
      if (signal.aborted) throw stopped();
      // 「[不发]」 (also as 「名字：[不发]」) is a no, not a message.
      const text = nudge ? answer.split('\n').filter(line => !/\[不发\]/.test(line)).join('\n') : answer;
      const items = parseChatReply(text, {members: people, user, voiceFormat, voiceNames: people.filter(p => p.voice).map(p => p.name), stickers: stickersFor(people.map(p => p.name))});
      if (!items.length && nudge) return null;
      if (!items.length) throw Error('这次没有收到消息，可以再试一次');
      const before = new Set((await backend.chats.get(threadId))?.messages.map(m => m.id) || []);
      const saved = await backend.chatMutate(threadId, () => settle(threadId, items, last));
      memory?.after(threadId);
      // The new photos with tags are drawn when the free tier covers them; the others wait for 画出来.
      for (const m of saved?.messages || []) if (!before.has(m.id) && m.kind === 'photo' && !m.photoId && (m.imageTags || backend.drawReady?.())) drawPhoto(threadId, m.id).catch(() => {});
      // Asked for and come while the user is elsewhere: the phone says so (its note opens the chat); 主动找你 says it itself.
      const fresh = (saved?.messages || []).filter(m => !before.has(m.id) && m.from !== 'me' && !['system', 'notice', 'recall'].includes(m.kind));
      if (!nudge && fresh.length) backend.emit('chat', {threadId, incoming: {from: fresh.at(-1).from, text: fresh.at(-1).text || '', kind: fresh.at(-1).kind, count: fresh.length}});
      return saved;
    })().catch(error => { throw signal.aborted ? stopped() : error; })
      .finally(() => { busy.delete(threadId); stops.delete(threadId); backend.emit('chat', {threadId, typing: false}); });
    busy.set(threadId, job); stops.set(threadId, controller);
    return job;
  }

  /**
   * Stores a reply. A claim takes (or returns) the user's latest red packet or transfer that is still waiting,
   * and leaves a notice where it happened.
   */
  async function settle(threadId, items, round = null) {
    const thread = await backend.chats.get(threadId), taken = new Set(), out = [], posts = [];
    let calling = null, cutting = false;
    const whispers = [];
    let latest = thread;
    for (const item of items) {
      // 「[删除好友]」: the contact deletes the user (private chats only; the user finds out on their next message).
      if (item.kind === 'unfriend') { if (thread.type === 'dm') cutting = true; continue; }
      // Answers to a 好友申请 (handled where it was asked), and a 好友申请 between friends: not messages.
      if (item.kind === 'befriend' || item.kind === 'refuse' || item.kind === 'request') continue;
      // 「[朋友圈] …」: posted to 朋友圈 while chatting, not a chat message.
      if (item.kind === 'moment') { posts.push({author: item.from, text: item.text, ...(item.imageTags ? {imageTags: item.imageTags} : {}), source: 'chat', space: thread?.space || backend.cardKey(), ...(thread?.save || backend.saveKey() ? {save: thread?.save || backend.saveKey()} : {})}); continue; }
      // 「[私聊] …」 in a group: said to the user alone — it goes to that one's private chat (in a private chat it is just
      // a message).
      if (item.kind === 'dm') { if (thread.type === 'group') whispers.push(item); else out.push({from: item.from, kind: 'text', text: item.text}); continue; }
      // 「[打电话] …」: the contact calls right after this reply (private chats only; one call).
      if (item.kind === 'call') { if (thread.type === 'dm' && !calling) calling = item; continue; }
      // 消息回应: on the user's latest message (the same emoji already there stays; one without an emoji is let go).
      if (item.kind === 'react') {
        if (!item.emoji) continue;
        const target = latest.messages.findLast(m => m.from === 'me' && !['system', 'notice', 'pat', 'recall'].includes(m.kind));
        if (target && target.reactions?.find(r => r.from === item.from)?.emoji !== item.emoji) latest = await backend.chats.updateMessage(threadId, target.id, {react: {from: item.from, emoji: item.emoji}});
        continue;
      }
      // 群游戏: a vote on the open vote (its option found by its words), a line or a 认输 on the open 接龙.
      if (item.kind === 'vote' || item.kind === 'chain') {
        const type = item.kind === 'vote' ? 'vote' : 'chain', card = latest.messages.findLast(m => m.kind === 'game' && m.game?.type === type && m.game.open);
        if (!card) { if (item.kind === 'chain' && item.text) out.push({from: item.from, kind: 'text', text: item.text}); continue; }
        const g = card.game;
        if (type === 'vote') {
          const said = item.option.replace(/^[「“"]|[」”"]$/g, '').trim(), index = [g.options.indexOf(said), g.options.findIndex(o => said.includes(o)), g.options.findIndex(o => o.includes(said))].find(i => i >= 0);
          if (index === undefined) continue;
          latest = await backend.chats.updateMessage(threadId, card.id, {game: {votes: [...g.votes.filter(v => v.from !== item.from), {from: item.from, option: index, why: item.why}]}});
        } else latest = await backend.chats.updateMessage(threadId, card.id, {game: item.give ? {open: false, loser: item.from} : {entries: [...g.entries, {from: item.from, text: item.text}]}});
        continue;
      }
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
    // Their pictures are drawn the way 朋友圈's own are (onPosts).
    if (posts.length) await backend.momentsMutate(() => backend.moments.add(posts)).then(onPosts).catch(() => {});
    // 重新回复: the new round takes the old one's place (which stays among its versions).
    let saved = !out.length ? latest : round ? await backend.replaceChatRound(threadId, round.after, out) : await backend.chats.append(threadId, out);
    if (cutting) { saved = await backend.chats.update(threadId, {friend: {by: 'them', at: Date.now(), requests: []}}); calling = null; refreshCuts(); }
    if (calling) setTimeout(() => onCall(calling.from, calling.reason), 1200);
    // (a moment after the group's own messages)
    if (whispers.length) setTimeout(() => whisper(whispers).catch(error => backend.reportDiagnostic?.('聊天 · 私聊', error, 'warn')), 900);
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
        const tags = tagTextAnswer(await backend.generateText(context(), {use: 'picture', prompt: tagTextRequest(settings(), m.text, 'translate'), plainText: true, trimNames: false, responseLength: Math.min(6000, 1500 + m.text.length * 3)})).replace(/\s+/g, ' ').trim().slice(0, 6000);
        if (!tags) throw Error('没把照片的描述写成画图用的 tag，再点一次试试');
        m.imageTags = tags;
        await set({imageTags: tags});
      }
      // The saved looks of who the photo shows: the people its description names, else the sender (a selfie).
      const names = [...settings().routes.map(r => r.name), userName()];
      const input = pictureInputs(settings(), photoPicture(settings(), {text: m.text, tags: m.imageTags, owner: m.from, names}), '');
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
  /** One line of the 拦截记录 for what a blocked contact sent (a message, a call, a picture…). */
  const HELD = {call: '来电', photo: '图片', sticker: '表情包', voice: '语音', location: '位置', redpacket: '红包', transfer: '转账', gift: '礼物', song: '分享歌曲', moment: '朋友圈', dm: '私聊', pat: '拍一拍'};
  const heldOf = i => {
    const words = i.kind === 'voice' ? i.translation || i.text : i.kind === 'call' ? i.reason : i.kind === 'song' ? [i.song?.title, i.song?.artist].filter(Boolean).join(' - ') : ['redpacket', 'transfer'].includes(i.kind) ? [i.amount, i.text].filter(Boolean).join(' ') : i.text;
    return {kind: i.kind || 'text', text: ((HELD[i.kind] ? `[${HELD[i.kind]}] ` : '') + String(words || '').trim()).trim()};
  };
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
      const prompt = buildChatRequest({prompts: settings().promptRules, preset, thread, members: people, story: recent, user, userPersona: userPersona(), voiceFormat: '', memory: remembered, earlier: memory?.storyMemory() || '', images: !!backend.drawReady?.(), stickers: stickersFor(people.map(p => p.name)), asking: said});
      const reply = cleanTagged(await backend.generateText(ctx, {use: 'chat', prompt, trimNames: false}), preset.cleanTags);
      const items = parseChatReply(reply, {members: people.map(p => ({...p, voice: false})), user, voiceFormat: '', voiceNames: [], stickers: stickersFor(people.map(p => p.name))});
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
      const lately = at => at > 0 && Date.now() - at < 2 * 86400000;
      cuts = list.filter(t => t.type === 'dm' && (t.friend || t.blocked || lately(t.befriended))).map(t => ({name: t.members[0], by: t.friend?.by || '', blocked: !!t.blocked, refused: Math.max(t.friend?.refused || 0, t.blocked?.refused || 0), accepted: !t.friend && !t.blocked ? t.befriended : 0, space: t.space || '', save: t.save || ''}));
      groups = list.filter(t => t.type === 'group').map(t => ({name: t.name, space: t.space || '', save: t.save || ''}));
    }).catch(() => {});
  }
  refreshCuts();
  backend.subscribe?.(event => { if (event?.type === 'chat' && event.friend) refreshCuts(); });
  /** The story knows who deleted or blocked whom on the phone (a 冷战 shows in the story too), and a 好友申请 just turned down. */
  function friendsPlan() {
    if (!cutsLoaded) refreshCuts();
    const here = backend.here?.(), user = userName(), list = cuts.filter(c => inSpace(c, here));
    if (!list.length) return [];
    const blocked = list.filter(c => c.blocked).map(c => c.name), mine = list.filter(c => c.by === 'me' && !c.blocked).map(c => c.name), theirs = list.filter(c => c.by === 'them').map(c => c.name);
    const refused = list.filter(c => c.refused && Date.now() - c.refused < 2 * 86400000).map(c => c.name), accepted = list.filter(c => c.accepted).map(c => c.name);
    // How to ask, said only when the story can send to the phone at all (正文联动手机).
    const how = settings().chat.proactive?.on ? `（<phone> 里单独一行写「名字：[好友申请] 验证消息」）` : '', they = names => names.length > 1 ? 'TA 们' : 'TA';
    const text = ['【手机上的好友关系】',
      mine.length ? `${user}在手机上把${mine.join('、')}删了好友：${they(mine)}发的消息${user}收不到，只能发好友申请${how}。` : '',
      blocked.length ? `${user}在手机上把${blocked.join('、')}拉黑了：${they(blocked)}发的消息、打的电话${user}都收不到（${they(blocked)}自己知道被拉黑了），只能发好友申请${how}。` : '',
      refused.length ? `${refused.join('、')}发来的好友申请刚被${user}拒绝了。` : '',
      accepted.length ? `${user}刚在手机上把${accepted.join('、')}加回了好友（通过了好友申请），现在又能互发消息了。` : '',
      theirs.length ? `${theirs.join('、')}在手机上把${user}删了好友：${user}发的消息会被拒收。` : ''].filter(Boolean).join(' ');
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
    if (list) groups = list.filter(t => t.type === 'group').map(t => ({name: t.name, space: t.space || '', save: t.save || ''}));
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
    return here || backend.chatMutate(null, () => backend.chats.create({type: 'dm', members: [name], ...backend.spaceTag()}));
  }
  /** What someone in a group said to the user alone (「[私聊]」): into their private chat, unread, with a note. */
  async function whisper(items) {
    const byName = new Map();
    for (const item of items) byName.set(item.from, [...(byName.get(item.from) || []), {from: item.from, kind: 'text', text: item.text}]);
    for (const [name, list] of byName) {
      const t = await dmWith(name);
      // one who has deleted the user does not write to them; one the user blocked is held
      if (t.friend?.by === 'them') continue;
      if (t.blocked) { await backend.holdMessages(t.id, list.map(heldOf)).catch(() => {}); continue; }
      if (await arrive(t.id, list)) notice(`${name} 私聊了你`);
    }
  }
  /** The groups here the contact is in too (the two talked in last): their latest messages, for a private chat's request. */
  async function sharedGroups(name, user) {
    const groups = (await backend.threads()).filter(t => t.type === 'group' && t.members.includes(name) && t.last).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2), parts = [];
    for (const g of groups) {
      const lines = ((await backend.chats.get(g.id))?.messages || []).filter(m => m.kind !== 'system').slice(-12).map(m => messageLine(m, user)).filter(Boolean);
      if (lines.length) parts.push(`「${g.name}」\n${lines.join('\n')}`);
    }
    return parts.join('\n\n');
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
            const items = parseChatReply(kept(part.text, members), {members: [...members].map(name => ({name, voice: false})), user: userName(), voiceFormat: '', voiceNames: [], stickers: stickersFor([...members])}).filter(onPhone);
            try { const n = items.length ? await arrive(thread.id, items, from) : 0; if (n) { sent += n; notice(`群「${thread.name}」有 ${n} 条新消息`); } } catch { /* not worth interrupting the story */ }
          }
        }
        const items = blocks.flatMap(b => parseChatReply(kept(b), {members: people, user: userName(), voiceFormat: '', voiceNames: [], stickers: stickersFor(people.map(p => p.name))})).filter(onPhone);
        const byName = new Map();
        for (const item of items) if (contacts.some(c => c.name === item.from)) byName.set(item.from, [...(byName.get(item.from) || []), item]);
        for (const [name, list] of byName) {
          try {
            const thread = await dmWith(name);
            // Blocked by the user: a 好友申请 waits for an answer; anything else is held (拦截记录), without a word.
            if (thread.blocked) {
              const asks = list.filter(i => i.kind === 'request'), rest = list.filter(i => i.kind !== 'request').map(heldOf).filter(h => h.text);
              if (asks.length) { const said = asks.map(i => i.text).filter(Boolean).join(' ') || `我是${name}`; await backend.friendRequest(thread.id, said); sent += 1; notice(`${name} 请求添加你为好友：${said.slice(0, 40)}`); }
              if (rest.length) await backend.holdMessages(thread.id, rest).catch(() => {});
              continue;
            }
            // Deleted by the user: what they send waits as 好友申请 (its 验证消息, when they wrote one).
            if (thread.friend?.by === 'me') {
              const asked = list.filter(i => i.kind === 'request').map(i => i.text).filter(Boolean);
              const texts = asked.length ? asked : list.filter(i => ['text', 'voice'].includes(i.kind)).map(i => i.translation || i.text).filter(Boolean);
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
  /** On the phone's turn with nothing sent: someone is asked whether they would text first now (they may say no). cue:
   *  the real-time moment (按现实时间主动找你) — then it answers whether someone texted. */
  async function nudge({cue = '', time = 0} = {}) {
    const ctx = context();
    // The card's own character first, else someone from the 角色 App.
    // Not someone who is not friends with the user right now (either way).
    const apart = new Set((await backend.threads()).filter(t => t.type === 'dm' && (t.friend || t.blocked)).map(t => t.members[0]));
    const roles = backend.contacts().filter(c => c.source === 'role' && !apart.has(c.name)), now = ctx?.name2;
    const name = roles.find(c => c.name === now)?.name || roles[Math.floor(Math.random() * roles.length)]?.name;
    if (!name) return;
    try {
      const thread = await dmWith(name), before = new Set((await backend.chats.get(thread.id))?.messages.map(x => x.id) || []);
      const saved = await reply(thread.id, {nudge: true, cue, time});
      const fresh = (saved?.messages || []).filter(x => !before.has(x.id) && x.from !== 'me');
      // Only messages sent count toward the day; 「[不发]」 does not.
      if (!fresh.length) return false;
      notice(`${name} 给你发来 ${fresh.length} 条消息`); backend.emit('chat', {threadId: thread.id, incoming: {from: name, text: fresh.at(-1).text || '', kind: fresh.at(-1).kind, count: fresh.length}});
      counted();
      return true;
    } catch { return false; /* not worth interrupting the story */ }
  }

  // ---------- 按现实时间主动找你 (0.9.33) ----------
  // With 现实时间 on (系统提示词) and its switch on (正文联动手机), while the tavern page is open: in the morning (7–10),
  // at bedtime (22–24) and after a long quiet (no message for 6 hours, 9–22), someone may text first — each moment once a
  // day, within the day's limit, never from 1 to 7 in the morning. One phone request each; they may say no ([不发]).
  const CLOCK_KEY = 'sttts.phoneClock', QUIET = 6 * 3600_000;
  const dayOf = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  function clockDone(day) { try { const saved = JSON.parse(storage?.getItem(CLOCK_KEY) || 'null'); return saved?.day === day ? saved : {day}; } catch { return {day}; } }
  let clockBusy = false;
  /** One look at the time (the clock does it every few minutes); answers the moment someone was asked for, or ''. */
  async function clockTick(now = new Date()) {
    const s = settings(), o = s.chat.proactive || {}, h = now.getHours();
    if (clockBusy || !o.clock || !promptOn(s.promptRules, 'now') || busy.size || (h >= 1 && h < 7) || (o.dailyMax > 0 && today().n >= o.dailyMax)) return '';
    const done = clockDone(dayOf(now));
    let cue = h >= 7 && h < 10 && !done.morning ? 'morning' : h >= 22 && !done.night ? 'night' : '';
    if (!cue && h >= 9 && h < 22 && !done.quiet) {
      const last = Math.max(0, ...(await backend.threads()).map(t => Number(t.last?.at) || 0));
      if (last && now.getTime() - last >= QUIET) cue = 'quiet';
    }
    if (!cue) return '';
    // Taken before asking: a failed or refused one is not asked again today.
    try { storage?.setItem(CLOCK_KEY, JSON.stringify({...done, [cue]: now.getTime()})); } catch { /* this session only */ }
    clockBusy = true;
    try { await nudge({cue, time: now.getTime()}); } finally { clockBusy = false; }
    return cue;
  }
  /** The clock while the page is open (index.js starts it): a first look after a minute, then every five. One for the
   *  page: a host made again takes it over. */
  function startClock({every = 5 * 60_000, first = 60_000, timers = globalThis} = {}) {
    timers.clearTimeout?.(clockTimer?.first); timers.clearInterval?.(clockTimer?.every);
    const look = () => { clockTick().catch(() => {}); };
    clockTimer = {first: timers.setTimeout(look, first), every: timers.setInterval(look, every)};
    // (Where timers can keep a process alive, as in Node, these do not.)
    clockTimer.first?.unref?.(); clockTimer.every?.unref?.();
    return () => { timers.clearTimeout(clockTimer.first); timers.clearInterval(clockTimer.every); clockTimer = null; };
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

  /** What the story sends to the phone is messages: a 回应, a vote or a line of 接龙 belong to a chat being answered. */
  const onPhone = item => !['react', 'vote', 'chain'].includes(item.kind);
  /** The stickers these people may send: the user's collection, and each one's own (角色专属表情包, only they send those). */
  function stickersFor(names) {
    const s = settings(), routes = backend.seen?.routes || s.routes, own = s.chat.roleStickers || {};
    return [...(s.chat.stickers || []), ...[...new Set(names)].flatMap(name => (own[roleStore(findRoute(routes, name)) || name] || []).map(x => ({...x, owner: name})))];
  }
  /**
   * 角色专属表情包: one sticker drawn for a role (a mood of STICKER_MOODS, its tags; wish: how they should look, in the
   * user's words, turned into tags once), with their saved look, square. Kept as theirs. A picture that costs money is
   * only drawn with allowPaid (the phone asks first); before that not even the words for its tags are spent.
   */
  const styleTags = new Map();
  async function drawRoleSticker({name, mood, wish = '', allowPaid = false} = {}) {
    if (!backend.drawReady()) throw Error(backend.drawMissing() || '还没有设置绘图引擎');
    const paid = () => Object.assign(Error(backend.paidPrompt().note), {code: 'PAID', prompt: backend.paidPrompt()});
    if (!allowPaid && backend.drawQuote?.()?.free === false) throw paid();
    const s = settings(), feel = STICKER_MOODS.find(m => m[0] === mood) || [String(mood || '').slice(0, 20), ''], words = String(wish || '').trim();
    if (!feel[0]) throw Error('选一个表情');
    if (words && !styleTags.has(words)) styleTags.set(words, tagTextAnswer(await backend.generateText(context(), {use: 'picture', prompt: tagTextRequest(s, words, 'translate'), plainText: true, trimNames: false, responseLength: 1500})).replace(/\s+/g, ' ').trim());
    const tags = ['solo', 'chibi', 'sticker', 'upper body', 'simple background', 'white background', feel[1], styleTags.get(words) || ''].filter(Boolean).join(', ');
    const input = pictureInputs(s, photoPicture(s, {text: `${name}的表情包：${feel[0]}`, tags, owner: name, names: [name]}), '');
    const side = sizeFor(s.draw.params, 'square');
    input.params = {...input.params, width: side.width, height: side.height};
    let made;
    try { made = await backend.generateImage({...input, allowPaid, name: `表情包-${name}-${feel[0]}`, key: `sticker:${name}:${feel[0]}:${Date.now()}`, label: `表情包 · ${name}`}); }
    catch (error) { if (error?.code === 'PAID') throw paid(); throw error; }
    const key = roleStore(findRoute(backend.seen?.routes || s.routes, name)) || name, list = s.chat.roleStickers?.[key] || [];
    backend.saveChatOptions({roleStickers: {[key]: [...list.filter(x => x.name !== feel[0]), {name: feel[0], photoId: made.photoId}]}});
    return {name: feel[0], photoId: made.photoId};
  }
  /**
   * 自定义气泡 「让模型改」: the two CSS texts rewritten to a wish by the phone's text model ({me, them}; the side not
   * asked for comes back as it was). What it wrote is only shown; it is kept when the user saves it.
   */
  async function bubbleRewrite({me = '', them = '', wish = '', side = ''} = {}) {
    if (!String(wish).trim()) throw Error('先写下想要什么样的气泡');
    const answer = await backend.generateText(context(), {use: 'chat', prompt: bubbleRequest({prompts: settings().promptRules, user: userName(), me, them, side, wish}), plainText: true, trimNames: false, responseLength: 4000});
    const got = splitBubbleAnswer(answer);
    if (!got || !(got.me || got.them)) throw Error('模型没写出气泡的 CSS，再试一次');
    return {me: side === 'them' ? me : got.me || me, them: side === 'me' ? them : got.them || them};
  }

  return {
    bubbleRewrite, drawRoleSticker, clockTick, startClock,
    reply, bring, bringPlan, tidyNotes, drawPhoto, storyPlan, storyReplied, deliver, phoneAfter, phoneAfterPlan, askFriend,
    reroll: threadId => reply(threadId, {reroll: true}),
    /** 停止回复: the reply being written for this chat is let go. */
    cancel: threadId => { stops.get(threadId)?.abort(); },
    seesPictures: () => sees(),
    typing: threadId => busy.has(threadId),
    pendingBring: () => pending && {threadId: pending.threadId, name: pending.name, count: pending.count},
    cancelBring: () => { const p = pending; pending = null; keepBring(); return dropNote(p).finally(() => { if (p) backend.emit('chat', {threadId: p.threadId, bring: false}); }); }
  };
}
