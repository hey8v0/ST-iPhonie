import {currentDm, chatWindows, currentWindow, groupKey, EDITABLE_KINDS, lastRound, forwardLine, REACTIONS, CHAIN_MODES, GAME_LIMITS} from '../core/chats.js';
import {eggOf, playEgg} from './chat-eggs.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {createView, esc, btn, field, input, textArea, select, toggle, heading, groupTitle, avatar, avatarPicture, empty, help, copyText, menu} from './common.js';
import {songOf} from '../core/music.js';
import {icon} from './icons.js';
import {fly} from './carry.js';
import {openImageViewer} from '../image-viewer.js';
import {viewerHeart} from './photo-heart.js';
import {editTags} from '../host-ask.js';
import {saveFile, downloadAction, shareFile, canShareFiles} from '../download.js';
import {momentsPanel, momentsNew, momentsSeen} from './moments.js';
import {PROFILE_STATUS, BUBBLES, FRAMES, BACKGROUNDS, parseStickers, STICKER_MOODS, ROLE_STICKER_LIMIT, stickerName, contactStatus, statusText} from '../core/chat.js';
import {BOARDS, cellsOf, cellName} from '../core/board.js';
import {NARRATOR} from '../core/narration.js';
import {wornSet} from '../core/bubble-css.js';
import {syncBubbleCss, bubbleSetsSheet, bubblePreview} from './chat-bubbles.js';
import {chatLongImage} from './chat-shot.js';
import {callSummary} from '../core/call.js';
import {preview, BLESSING, patText, noticeText, seconds} from './chat-preview.js';
import {pendant} from './pendants.js';
import {memorySheet} from './chat-memory.js';
import {pictureInputs, photoTags, photoPicture} from '../core/draw.js';
import {chatScene, sceneArt, sceneDark, syncMotion} from './chat-scenes.js';
import {PREMIUM, yuan} from '../core/wallet.js';
import {fileTool, fileBody, showFile, filesToMessages} from './chat-files.js';
import {eachThumb, previewBlob} from './thumbs.js';
import {photoWall} from './photo-wall.js';
import {storyLinkSheet, storyLinkNote} from './story-phone.js';
import {pickerHTML, fillPicker, bindPicker, recentOf, useRecent, pickEmoji} from './emoji-picker.js';
import {popAt} from './msg-pop.js';
import {remindLabel} from '../core/remind.js';
import {petLayer} from './chat-pets.js';
import {petStrip} from './pet-sprites.js';
import {PET_KINDS, PET_LIMITS, adoptPet} from '../core/pets.js';
export {preview};

// Chat app, QQ style: 消息 (conversations, with search, 置顶 and 免打扰), 联系人 (特别关心, friends, groups, profile cards)
// and 动态 (朋友圈, ui/moments.js). Tapping your own avatar opens 我: name, status, signature and 个性装扮 (chat bubble,
// avatar pendant, chat background). Private and group chats have voice messages, manual contacts, and "带进剧情"
// (carry selected messages into the next story reply).
// The + button next to the message box opens the phone features: photos, emoji, red packets, transfers,
// locations, 拍一拍, dice and "let them talk". Long-press (right-click) a message to quote, recall or delete it.
// Sending only puts a message in the chat, so the user can send several in a row. With the box empty, the send button
// turns into 让对方回复 and asks the model. Replies come from the host (api.chatReply); outside the tavern the app still
// stores and shows chats.

// One formatter for every message: making one costs far more than using it.
const CLOCK = new Intl.DateTimeFormat('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false});
const clock = at => { const d = new Date(at); return Number.isNaN(d.getTime()) ? '' : CLOCK.format(d); };
function stamp(at) {
  const d = new Date(at), now = new Date();
  if (d.toDateString() === now.toDateString()) return clock(at);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
const dayLabel = at => { const s = stamp(at); return s.includes(':') ? '今天' : s; };
// A time between messages a while apart, as phones show it: the day first when it changes (today's just the time).
const GAP = 5 * 60 * 1000;
function timeLabel(m, prev) {
  if (!prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString()) { const day = dayLabel(m.at); return day === '今天' ? clock(m.at) : `${day} ${clock(m.at)}`; }
  return m.at - prev.at >= GAP ? clock(m.at) : '';
}
// Messages drawn as a centred line instead of a bubble.
const LINE_KINDS = ['system', 'pat', 'notice', 'recall'];
const quotable = m => ['text', 'voice', 'photo', 'location'].includes(m.kind);
const quoteText = m => m.kind === 'voice' ? m.translation || m.text : m.kind === 'photo' ? '[图片]' + (m.text ? ' ' + m.text : '') : m.kind === 'sticker' ? '[表情包] ' + m.text : m.kind === 'location' ? '[位置] ' + m.text : m.text;
const lineOf = m => ({role: m.from, emotion: m.emotion || 'calm', text: m.text, translation: m.translation || ''});
const WAVE_HEIGHTS = [6, 12, 18, 10, 16, 22, 14, 8, 16, 20, 12, 7, 14, 10];
// Dice pips on a 3×3 grid, by face.
const PIPS = {1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]};

export function chatApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'chat');
  // 备注: what the user calls a contact, shown in the chat app only (the models keep using the real name).
  const remarks = () => api.readState().chat.remarks || {};
  /** What a person's avatar and 备注 are kept under: their name, or a key of their own when another card has someone of that name. */
  const ownKey = name => ctx.routeFor?.(name)?.ownKey || name;
  const shown = name => name === 'me' ? name : remarks()[ownKey(name)] || name;
  /** In a group (0.9.36): someone's 群昵称 when they have one, else their name (备注 first); 'me' is the user. */
  const groupName = (who, t = thread) => who === 'me' ? t?.nicks?.me || myName() : t?.nicks?.[who] || shown(who);
  const you = who => who === 'me' ? '你' : shown(who);
  // mode: list (the tabs) · thread · profile (a contact's card) · me (the user's card and 个性装扮) · contact-edit
  // selecting: the messages picked (null when not picking); pickFor: what for, 'bring' (带进剧情) or 'delete' (多选删除).
  // hits: what the search found in the messages ({q, found}, ui/chat.js findHits); jump: the message to show when the thread is drawn.
  let hits = null, hitTimer = 0, hitTurn = 0, jump = null, knownThreads = [], listEmpty = false;
  let mode = 'list', tab = 'msgs', search = '', searching = false, profileOf = '', threadId = null, thread = null, selecting = null, pickFor = 'bring', contactDraft = null, epoch = 0, stick = false;
  let unreadTotal = 0, freshMoments = 0;
  let panel = null, quote = null;
  const drafts = new Map(), live = typeof api.chatReply === 'function';
  // 草稿: what was typed and not sent stays with its chat in this browser, over a reload or the phone closed and opened.
  const scope = api.getState().scope || 'local', draftKey = id => `st-iphonie-chat-draft:${scope}:${id}`;
  function draftOf(id) {
    if (!drafts.has(id)) { let saved = ''; try { saved = ctx.win.localStorage.getItem(draftKey(id)) || ''; } catch { /* this visit only */ } drafts.set(id, saved); }
    return drafts.get(id);
  }
  function keepDraft(id, text) {
    drafts.set(id, text);
    try { if (text) ctx.win.localStorage.setItem(draftKey(id), text); else ctx.win.localStorage.removeItem(draftKey(id)); } catch { /* this visit only */ }
  }
  // failed: why a chat's last reply did not come (shown under it until the next try); unseen: messages come while the
  // chat was scrolled up; unreadMark: where the unread ones began when the chat was opened ({id, count, show}).
  const failed = new Map();
  let unseen = 0, tailId = null, unreadMark = null;
  const photoURLs = new Map(), bubbleURLs = new Map(), photoSizes = new Map(), recalled = new Map(), transcribed = new Set();
  // peeked: contacts' recalls the user has peeked at (here only: they are never told).
  const peeked = new Set();
  let press = null, pressedAt = 0;
  const voiceText = () => api.readState().chat.voiceText || {mode: 'translation', auto: false};
  /** 转文字 for a voice message: the translation, the original line, or both (original first). */
  function transcriptHTML(m) {
    // The engine's own marks ([sigh], <whisper>…</whisper>, (laughing), <#0.5#>) are for the voice, not for reading.
    const mode = voiceText().mode, original = String(m.text || '').replace(/\[[^\]]*\]|<[^>]*>|\((?:[a-z][a-z\s'-]*)\)/gi, '').replace(/\s{2,}/g, ' ').trim(), translation = m.translation || '';
    if (mode === 'original' || !translation) return `<span class="v-text">${esc(original)}</span>`;
    if (mode === 'both' && original && original !== translation) return `<span class="v-text both"><span class="v-orig">${esc(original)}</span><span>${esc(translation)}</span></span>`;
    return `<span class="v-text">${esc(translation)}</span>`;
  }

  // ---------- 宠物 (0.9.36): they live in the chats (ui/chat-pets.js) ----------
  const pets = () => api.getState().chat.pets || {list: [], show: true};
  const petsLayer = petLayer({win: ctx.win, doc: ctx.doc, pets, onCard: id => petCard(id)});
  const baseDispose = v.dispose.bind(v);
  v.dispose = () => { petsLayer.detach(); baseDispose(); };

  // ---------- The user (我) ----------
  const profile = () => api.readState().chat.profile;
  const myName = () => profile().name || api.userName?.() || '我';
  let switchTimer = 0;
  const myAvatar = size => `<span class="me-av" data-frame="${esc(profile().frame)}" style="--s:${size}px">${avatar(myName(), 'none', size, 'me')}${pendant(profile().frame)}</span>`;
  const statusLine = () => { const p = profile(); return `<i class="qq-dot" data-status="${p.status}"></i>${esc(PROFILE_STATUS[p.status])}${p.statusText ? ' · ' + esc(p.statusText) : ''}`; };
  const starred = () => api.getState().chat.starred || [];
  /** A contact's one line: a manual contact's persona, or where a role comes from. */
  const signatureOf = c => c.source === 'manual' ? (c.persona || '还没有写人设').split('\n')[0].slice(0, 40) : c.voice ? '角色 · 能发语音消息' : '角色 · 还没有配音';
  /** 状态和签名 (0.9.35): how a contact shows now — what they set themselves, else a guess by the time and their last message. */
  const statusOf = (name, threads = knownThreads) => { const dm = currentDm(threads || [], name); return contactStatus(api.getState().chat.statusOf?.[ownKey(name)], {lastAt: dm?.last?.from === name ? dm.last.at : 0}); };
  const statusDot = st => `<i class="qq-dot" data-status="${esc(st.status)}"></i>${esc(statusText(st))}`;
  /** A contact's line in 联系人: their status, and their signature (a manual contact's persona when they set none). */
  const contactLine = (c, threads) => { const st = statusOf(c.name, threads), sig = st.signature || (c.source === 'manual' ? signatureOf(c) : ''); return statusDot(st) + (sig ? ' · ' + esc(sig) : ''); };
  const moments = momentsPanel(ctx, {v, frame: html => frame(html), me: () => ({name: myName(), avatar: myAvatar}), visible: () => ctx.visible?.('chat') !== false && mode === 'list' && tab === 'moments'});
  /** A tab page with the tab bar under it. */
  function frame(html) {
    const tabs = [['msgs', '消息', 'chat'], ['contacts', '联系人', 'person'], ['moments', '动态', 'moments']];
    // data-page: which tab the page is, so only the page switched to rises in (0.9.34: the one left used to do it first,
    // in place, while the new one was still being read — a flash before every switch).
    return `<div class="qq-page" data-page="${tab}">${html}</div><nav class="qq-tabs" aria-label="聊天">${tabs.map(([k, l, g]) => `<button type="button" data-action="tab" data-tab="${k}" aria-pressed="${tab === k}"><span class="qq-tab-ico">${icon(g)}${k === 'msgs' && unreadTotal ? `<b class="badge">${unreadTotal > 99 ? '99+' : unreadTotal}</b>` : k === 'moments' && freshMoments && tab !== 'moments' ? '<b class="qq-dot-new" aria-label="有新动态"></b>' : ''}</span><span>${l}</span></button>`).join('')}</nav>`;
  }
  async function counts() {
    unreadTotal = await api.chatUnread().catch(() => 0);
    freshMoments = momentsNew(await api.listMoments().catch(() => []), momentsSeen(ctx.win));
  }

  const engine = name => ctx.engineOf(name);
  const groupAvatar = (members, size) => `<span class="group-av" style="--s:${size}px">${members.slice(0, 3).map(m => `<i data-engine="${engine(m)}">${esc(m.slice(0, 1))}</i>`).join('')}</span>`;
  // A group's own picture when one was chosen ('g:' + the group's first window), else its members' first letters.
  const threadAvatar = (t, size = 48) => t.type === 'group' ? (avatarPicture('g:' + groupKey(t)) ? avatar(t.name, 'none', size, 'g:' + groupKey(t)) : groupAvatar(t.members, size)) : avatar(t.members[0], engine(t.members[0]), size);
  const pendingBring = () => api.chatPendingBring?.() || null;
  const typing = () => !!threadId && !!api.chatTyping?.(threadId);
  // A reply comes in like on a phone: its messages are stored at once (memory, unread counts and other devices see
  // them all), but the open chat shows the contact's new ones one by one, each after a typing bubble that lasts
  // about as long as typing it would — a short one pops up quickly, a long one keeps the dots going a while.
  const pace = {thread: null, seen: new Set(), hidden: new Set(), queue: [], timer: 0, fresh: null, instant: false};
  const AT_ONCE = ['system', 'recall', 'notice', 'pat'];
  function typeTime(m, first) {
    const len = [...String(m.text || '')].length;
    const ms = m.kind === 'text' ? 420 + len * 55 : m.kind === 'voice' ? 1300 : 800;
    // The first one: the model already took its time writing the reply.
    return Math.round(Math.min(first ? 1100 : 3000, Math.max(first ? 250 : 500, ms)));
  }
  function track(list) {
    if (pace.thread !== threadId) {
      ctx.win.clearTimeout(pace.timer);
      Object.assign(pace, {thread: threadId, seen: new Set(list.map(m => m.id)), hidden: new Set(), queue: [], timer: 0, fresh: null});
      return;
    }
    const on = api.getState().chat.pace !== false;
    for (const m of list) {
      if (pace.seen.has(m.id)) continue;
      pace.seen.add(m.id);
      if (on && !pace.instant && m.from !== 'me' && !AT_ONCE.includes(m.kind)) { pace.hidden.add(m.id); pace.queue.push(m); }
    }
    // Messages deleted while waiting (清空、重新回复) are not waited for.
    const ids = new Set(list.map(m => m.id));
    pace.queue = pace.queue.filter(m => ids.has(m.id));
    for (const id of pace.hidden) if (!ids.has(id)) pace.hidden.delete(id);
    if (pace.queue.length && !pace.timer) nextReveal(true);
  }
  function nextReveal(first) {
    const m = pace.queue[0];
    pace.timer = ctx.win.setTimeout(() => {
      pace.timer = 0;
      if (pace.queue[0] !== m) return;
      pace.queue.shift();
      pace.hidden.delete(m.id);
      pace.fresh = m.id;
      if (pace.queue.length) nextReveal(false);
      if (mode === 'thread' && threadId === pace.thread) render();
    }, typeTime(m, first));
  }
  /**
   * 带进剧情: 这一次 (pick messages for the next story reply, once) or 一直带着 (the story always knows this chat: its
   * memory and whatever is not written up yet). Both can be on; what is picked goes in word for word as well.
   */
  function bringSheet({over = false, onClose = () => render(), beforePick = () => {}} = {}) {
    return storyLinkSheet(ctx, {over, onClose, threadId: mode === 'thread' ? threadId : '', onPick: () => {
      beforePick(); selecting = new Set(); pickFor = 'bring'; panel = null; render();
    }});
  }
  /** The 带进剧情 count; a choice already waiting is replaced by the new one (only one goes into the story). */
  const pickedLabel = n => { const before = pickFor === 'bring' && pendingBring(); return `已选 ${n} 条${before ? `（会替换之前选的 ${before.count} 条）` : ''}`; };

  // ---------- 消息 ----------
  function convRow(t, me) {
    const last = t.last, line = last && LINE_KINDS.includes(last.kind);
    const who = line || !last ? '' : last.from === 'me' ? '我：' : t.type === 'group' ? last.from + '：' : '';
    const atMe = t.type === 'group' && t.unread && last && last.from !== 'me' && String(last.text || '').includes('@' + me) ? '<em class="at-me">[有人@我]</em>' : '';
    const badge = t.unread ? `<span class="badge${t.muted ? ' muted' : ''}">${t.unread > 99 ? '99+' : t.unread}</span>` : '';
    const spark = t.type === 'dm' && t.streak >= 3 ? `<span class="spark" title="聊天火花：连续 ${t.streak} 天">🔥${t.streak}</span>` : '';
    // A chat with words typed and not sent shows them, as phones do.
    const typed = draftOf(t.id).trim(), pvLine = typed ? `<em class="draft-mark">[草稿]</em>${esc(typed)}` : `${atMe}${esc(who + preview(last))}`;
    return `<button class="conv${t.pinned ? ' pinned' : ''}" data-action="open" data-id="${esc(t.id)}" data-conv="${esc(t.id)}">${threadAvatar(t, 50)}<span class="grow"><span class="conv-top"><strong>${esc(t.type === 'group' ? t.name : shown(t.members[0] || t.name))}</strong>${t.type === 'group' ? `<span class="tag-s">${t.watch ? '旁观' : '群'}</span>` : t.label ? `<span class="tag-s">${esc(t.label)}</span>` : ''}${t.type !== 'group' && t.blocked ? '<span class="tag-s tag-blocked">已拉黑</span>' : ''}${spark}<span class="conv-time">${last ? stamp(last.at) : ''}</span></span><span class="conv-bot"><span class="pv">${pvLine}</span>${t.muted ? `<span class="mute-ico" aria-label="免打扰">${icon('mute')}</span>` : ''}${badge}</span></span></button>`;
  }
  /** The messages found, under what the list found by name. */
  function hitsHTML({hits: list, total}) {
    const rows = list.map(h => {
      const t = knownThreads.find(x => x.id === h.thread);
      if (!t) return '';
      const who = h.from === 'me' ? '我：' : t.type === 'group' ? shown(h.from) + '：' : '';
      return `<button class="conv conv-hit" data-action="open-hit" data-id="${esc(t.id)}" data-mid="${esc(h.id)}">${threadAvatar(t, 42)}<span class="grow"><span class="conv-top"><strong>${esc(t.type === 'group' ? t.name : shown(t.members[0] || t.name))}</strong>${t.label ? `<span class="tag-s">${esc(t.label)}</span>` : ''}<span class="conv-time">${stamp(h.at)}</span></span><span class="conv-bot"><span class="pv">${esc(who + h.before)}<mark>${esc(h.hit)}</mark>${esc(h.after)}</span></span></span></button>`;
    }).join('');
    if (rows) return groupTitle(total > list.length ? `聊天记录 · ${total} 条，这里是最新的 ${list.length} 条` : `聊天记录 · ${total} 条`) + `<div class="conv-list qq-list">${rows}</div>`;
    return listEmpty ? `<p class="hint">没有找到「${esc(search)}」</p>` : '';
  }
  /** Looks through the messages a moment after the typing stops, and fills in the place kept for it in the list. */
  function findHits(q) {
    ctx.win.clearTimeout(hitTimer);
    const turn = ++hitTurn;
    hitTimer = ctx.win.setTimeout(async () => {
      const found = await api.searchChatMessages(q).catch(() => ({hits: [], total: 0}));
      if (v.disposed || turn !== hitTurn) return;
      hits = {q, found};
      const box = v.root.querySelector('[data-chat-hits]');
      if (box) box.innerHTML = hitsHTML(found);
    }, 220);
  }
  async function renderMessages(ticket) {
    const [threads] = await Promise.all([api.listThreads(), counts()]);
    if (v.disposed || ticket !== epoch) return;
    knownThreads = threads;
    const q = search.trim().toLowerCase(), me = myName();
    // A chat with someone the user deleted is put away until they are added back.
    const away = new Set(threads.filter(t => t.type === 'dm' && t.friend?.by === 'me').map(t => t.members[0]));
    // 聊天窗口: a contact's (or a group's) other chats stay out of the list (a search finds them too); their unread
    // count goes on the one in use.
    const inUse = t => currentWindow(threads, t)?.id === t.id;
    const unreadOf = t => chatWindows(threads, t).reduce((n, x) => n + (x.unread || 0), 0);
    const rows = threads.filter(t => !(t.type === 'dm' && t.friend?.by === 'me')).filter(t => q ? [t.name, t.label, ...t.members, preview(t.last)].some(x => String(x || '').toLowerCase().includes(q)) : inUse(t)).map(t => ({...t, unread: q ? t.unread : unreadOf(t)}));
    const people = q ? api.chatContacts().filter(c => c.name.toLowerCase().includes(q) && !away.has(c.name) && !threads.some(t => t.type === 'dm' && t.members[0] === c.name)) : [];
    const bring = pendingBring();
    listEmpty = !rows.length && !people.length;
    const known = hits?.q === q;
    v.draw(frame(`<header class="qq-top"><button type="button" class="qq-me" data-action="me" aria-label="我的资料和个性装扮">${myAvatar(42)}<span class="qq-me-text"><strong>${esc(me)}</strong><small>${statusLine()}</small></span></button>${btn('plus-menu', icon('add'), 'round-button', 'aria-label="发起聊天、添加联系人"')}</header>
      <label class="qq-search">${icon('search')}<input data-field="chat-search" type="search" value="${esc(search)}" placeholder="搜索聊天和联系人" aria-label="搜索" autocomplete="off"></label>`
      + (bring ? `<div class="banner bring-banner">${icon('book')}<span>和${esc(bring.name)}的 ${bring.count} 条消息会带进下一次正文</span>${btn('cancel-bring', '取消', 'chip-button')}</div>` : '')
      + (live ? '' : '<div class="banner">' + icon('alert') + '<span>在酒馆里打开小手机时，联系人才会回复。</span></div>')
      + (rows.length ? `<div class="conv-list qq-list">${rows.map(t => convRow(t, me)).join('')}</div>` : q ? '' : empty('还没有聊天', '点右上角的加号，和角色私聊，或者拉一个群。联系人来自角色 App，也可以手动添加。', 'chat'))
      + (people.length ? groupTitle('联系人') + `<div class="group">${people.map(c => `<button class="list-row" data-action="dm-open" data-name="${esc(c.name)}">${avatar(c.name, c.engine, 40)}<span><strong>${esc(shown(c.name))}</strong><small>发消息</small></span>${icon('next')}</button>`).join('')}</div>` : '')
      + (q ? `<div data-chat-hits>${known ? hitsHTML(hits.found) : ''}</div>` : '')));
    if (q) findHits(q);
    else { hitTurn++; ctx.win.clearTimeout(hitTimer); }
    if (searching) { const box = v.root.querySelector('[data-field=chat-search]'); box?.focus({preventScroll: true}); box?.setSelectionRange?.(box.value.length, box.value.length); }
  }

  // ---------- 联系人 ----------
  async function renderContactsTab(ticket) {
    const [threads] = await Promise.all([api.listThreads(), counts()]);
    if (v.disposed || ticket !== epoch) return;
    const cut = threads.filter(t => t.type === 'dm' && t.friend?.by === 'me' && stillHere(t.members[0])), away = new Set(cut.map(t => t.members[0]));
    const contacts = api.chatContacts().filter(c => !away.has(c.name)), stars = starred(), groups = threads.filter(t => t.type === 'group' && currentWindow(threads, t)?.id === t.id);
    const blockedAsks = threads.filter(t => t.type === 'dm' && t.blocked?.requests?.length && t.friend?.by !== 'me');
    const asks = cut.reduce((n, t) => n + (t.friend.requests?.length || t.blocked?.requests?.length ? 1 : 0), 0) + blockedAsks.length;
    const row = c => `<button class="list-row" data-action="profile" data-name="${esc(c.name)}">${avatar(c.name, c.engine, 42)}<span><strong>${esc(c.name)}</strong><small>${contactLine(c, threads)}</small></span>${stars.includes(c.name) ? '<span class="star-mark" aria-label="特别关心">★</span>' : icon('next')}</button>`;
    const special = contacts.filter(c => stars.includes(c.name));
    v.draw(frame(heading('联系人', btn('contact-add', icon('add'), 'round-button', 'aria-label="添加联系人"'), 'Contacts')
      + (cut.length || blockedAsks.length ? `<div class="group"><button class="list-row" data-action="new-friends"><i class="friend-ico" aria-hidden="true">${icon('person')}</i><span><strong>新的朋友</strong><small>${asks ? `${asks} 个好友申请` : `删掉的好友（${cut.length}）可以在这里加回来`}</small></span>${asks ? `<b class="badge friend-badge">${asks}</b>` : icon('next')}</button></div>` : '')
      + (special.length ? groupTitle('特别关心') + `<div class="group">${special.map(row).join('')}</div>` : '')
      + groupTitle(`好友 · ${contacts.length}`, help('角色 App 里的角色会自动出现在这里。开了「按角色卡分开」时，只有这张卡的角色、在这张卡的剧情里说过话或被提到的角色，以及在这张卡里加的联系人；别的角色点右上角的「＋」加进来。剧情之外的人（同学、店员、网友……）也在「＋」里手动添加，写上人设就能聊。'))
      + (contacts.length ? `<div class="group">${contacts.map(row).join('')}</div>` : '<p class="hint">还没有好友。</p>')
      + (groups.length ? groupTitle(`群聊 · ${groups.length}`) + `<div class="group">${groups.map(t => `<button class="list-row" data-action="open" data-id="${esc(t.id)}">${threadAvatar(t, 42)}<span><strong>${esc(t.name)}</strong><small>${t.members.length} 人${t.watch ? ' · 旁观' : ''}</small></span>${icon('next')}</button>`).join('')}</div>` : '')));
  }
  /** ＋ in 联系人: a role from the 角色 App that is not here yet, or someone outside the story by hand. */
  function addContact() {
    const here = new Set(api.chatContacts().map(c => c.name)), roles = (api.rolesHere?.() || api.getState().routes).filter(r => r.name?.trim() && r.name !== NARRATOR && !here.has(r.name));
    const d = ctx.dialog('添加联系人', `<div class="pick-list">
      ${roles.map(r => `<button class="list-row" data-add-role="${esc(r.name)}">${avatar(r.name, r.voice ? r.engine : 'none', 36)}<span><strong>${esc(r.name)}</strong><small>角色 App 里的角色${r.voice ? ' · 能发语音' : ''}</small></span>${icon('add')}</button>`).join('')}
      <button class="list-row" data-add-role="">${icon('edit')}<span><strong>手动添加</strong><small>剧情之外的人（同学、店员、网友……），写上人设就能聊</small></span></button></div>
      ${roles.length ? '' : '<p class="hint">角色 App 里的角色都已经在联系人里了。</p>'}`);
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-add-role]');
      if (!b) return;
      d.close();
      const name = b.dataset.addRole;
      if (!name) { contactDraft = {name: '', persona: ''}; mode = 'contact-edit'; render(); return; }
      try { api.addRoleContact(name); ctx.notify(`已添加 ${name}`); render(); } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  function renderContactForm() {
    v.draw(heading(contactDraft.id ? '编辑联系人' : '新联系人', '', 'Contact')
      + `<div class="group pad">${field('名字', input('contact-name', contactDraft.name, 'text', 'maxlength="40"'))}${field('人设', textArea('contact-persona', contactDraft.persona, 'rows="6" placeholder="性格、身份、和你的关系、说话习惯……"'), '写给模型看的资料。第一行也是资料卡上的签名。角色 App 里的角色会自动读取酒馆角色卡，不用在这里填。')}</div>
      <div class="savebar">${btn('contact-cancel', '取消', 'secondary')}${btn('contact-save', '保存', 'primary')}</div>
      ${contactDraft.id ? `<div class="actions">${btn('contact-delete', '删除联系人', 'danger')}</div>` : ''}`);
  }
  /** A contact's card: send a message, see their posts, 特别关心, 黑名单. */
  async function renderProfile(ticket) {
    const threads = await api.listThreads();
    if (v.disposed || ticket !== epoch) return;
    const c = api.chatContacts().find(x => x.name === profileOf) || api.chatContacts(true).find(x => x.name === profileOf);
    if (!c) { mode = 'list'; return render(); }
    const dm = currentDm(threads, c.name), blocked = !!dm?.blocked;
    const star = starred().includes(c.name), manual = c.source === 'manual' && api.getState().chat.contacts.find(x => x.name === c.name);
    v.draw(`<div class="qq-card" data-engine="${c.engine}"><span class="qq-card-cover" aria-hidden="true"></span>${avatar(c.name, c.engine, 84)}<h2>${esc(shown(c.name))}</h2>${shown(c.name) !== c.name ? `<p class="qq-card-real">昵称：${esc(c.name)}</p>` : ''}<p class="qq-card-status">${statusDot(statusOf(c.name, threads))}</p><p>${esc(statusOf(c.name, threads).signature || signatureOf(c))}</p>
        <div class="qq-card-tags"><span class="chip">${c.source === 'role' ? '角色' : '手动联系人'}</span>${c.voice ? '<span class="chip">能发语音</span>' : ''}${star ? '<span class="chip">★ 特别关心</span>' : ''}</div></div>
      <div class="actions">${btn('profile-chat', icon('chat') + '发消息', 'primary')}${api.callDial && !blocked ? btn('profile-call', icon('phone') + '打电话', 'secondary') : ''}${btn('profile-moments', icon('moments') + 'TA 的动态', 'secondary')}</div>
      <div class="group">${btn('remark', `${icon('edit')}<span><strong>设置备注</strong><small>${esc(remarks()[ownKey(c.name)] || '只有你看得到，聊天里显示这个名字')}</small></span>`, 'list-row')}${btn('avatar-pick', `${icon('image')}<span><strong>换头像</strong><small>${esc(avatarState(c.name))}</small></span>`, 'list-row', `data-key="${esc(c.name)}"`)}${btn('star', `${icon('star', star)}<span><strong>${star ? '取消特别关心' : '设为特别关心'}</strong><small>${star ? '现在排在联系人最上面' : 'TA 会排在联系人最上面'}</small></span>`, 'list-row')}${btn('person-look', `${icon('chat')}<span><strong>聊天装扮</strong><small>${esc(lookLine(c.name))}</small></span>`, 'list-row')}${btn('letters', `${icon('mail')}<span><strong>信件</strong><small>写给 TA 的信和 TA 的回信</small></span>`, 'list-row')}${c.source === 'role' ? btn('role-stickers', `${icon('smile')}<span><strong>专属表情包</strong><small>${ownStickers(c.name).length ? `${ownStickers(c.name).length} 个，聊天时 TA 自己会发` : '画一套，或者从相册里挑'}</small></span>`, 'list-row') : ''}${manual ? `<button class="list-row" data-action="contact-edit" data-id="${esc(manual.id)}">${icon('edit')}<span><strong>编辑资料和人设</strong></span></button>` : ''}</div>
      <div class="actions">${blocked ? btn('unblock', '移出黑名单', 'secondary', `data-id="${esc(dm.id)}"`) : btn('block', '加入黑名单', 'secondary')}${btn('unfriend', '删除好友', 'danger')}</div>`);
    listeningOf(c.name).then(song => { const box = v.root.querySelector('.qq-card'); if (!song || !box || profileOf !== c.name || mode !== 'profile') return; box.insertAdjacentHTML('beforeend', `<button type="button" class="qq-listening" data-action="play-song" data-title="${esc(song.title)}" data-artist="${esc(song.artist)}">${icon('music')}<span>最近在听：${esc(song.title)}${song.artist ? ' - ' + esc(song.artist) : ''}</span></button>`); }).catch(() => {});
  }
  // 0.9.49: someone deleted in the 角色 App (or a contact removed) is gone from 新的朋友 too; their old chat stays as it was.
  const stillHere = name => (api.chatContacts?.(true) || []).some(c => c.name === name);
  /** 新的朋友: contacts the user deleted, and 好友申请 from them or from someone blocked; 通过 or 拒绝 (添加 with none). */
  async function renderFriends(ticket) {
    const threads = await api.listThreads();
    if (v.disposed || ticket !== epoch) return;
    const cut = threads.filter(t => t.type === 'dm' && t.friend?.by === 'me' && stillHere(t.members[0])), blocked = threads.filter(t => t.type === 'dm' && t.blocked?.requests?.length && t.friend?.by !== 'me' && stillHere(t.members[0]));
    if (!cut.length && !blocked.length) { mode = 'list'; tab = 'contacts'; return render(); }
    const row = t => {
      const name = t.members[0], asks = [...(t.friend?.requests || []), ...(t.blocked?.requests || [])], last = asks.at(-1), state = t.blocked ? '已拉黑' : '已删除';
      const tools = asks.length ? btn('friend-no', '拒绝', 'chip-button', `data-id="${esc(t.id)}" aria-label="拒绝 ${esc(name)} 的好友申请"`) + btn('friend-yes', '通过', 'chip-button', `data-id="${esc(t.id)}" aria-label="通过 ${esc(name)} 的好友申请"`)
        : btn('refriend', '添加', 'chip-button', `data-id="${esc(t.id)}" aria-label="把 ${esc(name)} 加回好友"`);
      // The 验证消息 on a line of its own under the row: next to two buttons it had room for a word or two.
      return `<div class="list-row friend-row">${avatar(name, engine(name), 42)}<span><strong>${esc(shown(name))}</strong><small>${state} · ${asks.length > 1 ? `${asks.length} 条好友申请` : asks.length ? '好友申请' : '还没有发来申请'}</small></span>${tools}${last ? `<p class="friend-ask">「${esc(last.text)}」</p>` : ''}</div>`;
    };
    v.draw(heading('新的朋友', '', 'New Friends')
      + `<p class="hint">删掉的好友和拉黑的人发来的好友申请在这里。「通过」就加回来（也移出黑名单），申请里的话会放进聊天；「拒绝」了 TA 会知道。删掉的好友没发申请也能直接「添加」。</p>`
      + `<div class="group">${[...cut, ...blocked].map(row).join('')}</div>`);
  }
  /** 最近在听: the last song this contact shared in your private chat. */
  async function listeningOf(name) {
    const t = currentDm(await api.listThreads(), name);
    if (!t) return null;
    return (await api.getThread(t.id))?.messages.findLast(m => m.kind === 'song' && m.from === name)?.song || null;
  }
  /** The looks of one kind (气泡, 挂件, 背景): the free ones, then the shop's (one not bought yet shows its price). */
  function decoChips(key, list, value) {
    const w = api.wallet();
    // 自定义气泡: one more tile, the set worn (or how many there are) under it.
    const worn = key === 'bubble' ? bubbleSets().find(s => s.id === wornSet(value)) : null, custom = key !== 'bubble' ? ''
      : `<button type="button" class="deco custom-deco" data-action="me-custom" aria-pressed="${!!worn}"><span class="deco-sample" aria-hidden="true">${icon('edit')}</span><span>自定义</span><small class="deco-note">${worn ? esc(worn.name) : bubbleSets().length ? `${bubbleSets().length} 套` : '自己写 CSS'}</small></button>`;
    return `<div class="deco-row">${[...Object.entries(list).map(([k, l]) => [k, l, null]), ...Object.entries(PREMIUM[key] || {}).map(([k, [l, price]]) => [k, l, price])].map(([k, l, price]) => { const owned = price === null || w.owned.includes(key + ':' + k); return `<button type="button" class="deco${price === null ? '' : ' premium'}" data-action="${owned ? 'me-set' : 'me-buy'}" data-key="${key}" data-value="${k}" data-name="${esc(l)}" data-price="${price ?? 0}" data-${key}="${k}" aria-pressed="${value === k}"><span class="deco-sample" aria-hidden="true">${key === 'frame' ? `<span class="me-av" style="--s:36px"><span class="avatar none" style="--s:36px"></span>${pendant(k)}</span>` : key === 'background' ? sceneArt(k) : ''}</span><span>${l}</span>${price === null ? '' : `<small class="deco-price">${owned ? '已拥有' : '¥' + price}</small>`}</button>`; }).join('')}${custom}</div>`;
  }
  const bubbleSets = () => api.getState().chat.bubbleSets || [];
  /** What the previews of 自定义气泡 look like: this chat's background and avatars. */
  function bubbleLook() {
    const p = profile(), bg = p.backgroundPhoto ? 'none' : p.background;
    return {bg, scene: chatScene(bg), me: myAvatar(34), them: avatar('TA', 'none', 34)};
  }
  /** Whose set is whose in a chat: mine (the user's bubbles here) and theirs(name); '' for none (the built-in looks). */
  function bubbleSetsFor(t) {
    const list = bubbleSets(), has = id => id && list.some(s => s.id === id) ? id : '', of = api.getState().chat.bubbleOf || {};
    const worn = has(wornSet(profile().bubble)), own = name => has(of[ownKey(name)]);
    return {mine: (t.type !== 'group' && own(t.members[0])) || worn, theirs: name => own(name) || worn};
  }
  const DECOS = {bubble: ['聊天气泡', BUBBLES], frame: ['头像挂件', FRAMES], background: ['聊天背景', BACKGROUNDS]};
  const decoName = key => { const p = profile(), [, list] = DECOS[key]; if (key === 'background' && p.backgroundPhoto) return '相册里的照片'; if (key === 'bubble' && wornSet(p.bubble)) return bubbleSets().find(s => s.id === wornSet(p.bubble))?.name || '默认'; return list[p[key]] || PREMIUM[key]?.[p[key]]?.[0] || p[key]; };
  /** 我: the card (tap the picture to change it), name and signature, and one row each for the rest. */
  function renderMe() {
    const p = profile(), w = api.wallet();
    v.draw(heading('我', '', 'Me')
      + `<div class="qq-card me" data-bubble="${esc(p.bubble)}"><span class="qq-card-cover" aria-hidden="true"></span><button type="button" class="me-pic" data-action="avatar-pick" data-key="me" aria-label="换头像（${esc(avatarState('me'))}）">${myAvatar(84)}<span class="me-pic-edit" aria-hidden="true">${icon('image')}</span></button><h2>${esc(myName())}</h2><p>${esc(p.signature || '还没有个性签名')}</p><div class="qq-card-tags"><span class="chip">${statusLine()}</span></div></div>`
      + `<div class="group pad">${field('名字', input('me-name', p.name, 'text', `maxlength="40" placeholder="${esc(api.userName?.() || '我')}（跟随酒馆里的用户名）"`))}${field('个性签名', input('me-signature', p.signature, 'text', 'maxlength="80" placeholder="写一句话"'))}</div>
        <div class="group"><button class="list-row" data-action="me-status"><span><strong>状态</strong><small>${statusLine()}</small></span>${icon('next')}</button></div>`
      + groupTitle('钱包与商城')
      + `<div class="group"><button class="list-row" data-action="me-wallet">${icon('wallet')}<span><strong>钱包</strong><small>零钱 ¥${esc(yuan(w.balance))} · 明细和收到的礼物</small></span>${icon('next')}</button><button class="list-row" data-action="me-shop">${icon('shop')}<span><strong>商城</strong><small>更好看的气泡、挂件、背景，送给角色的礼物</small></span>${icon('next')}</button></div>`
      + groupTitle('个性装扮')
      + `<div class="group">${Object.entries(DECOS).map(([key, [label]]) => `<button class="list-row" data-action="me-deco" data-key="${key}"><span><strong>${label}</strong><small>${esc(decoName(key))}</small></span>${icon('next')}</button>`).join('')}${toggle('me-eggs', '关键词彩蛋', p.eggs !== false, '消息里有「生日快乐」「晚安」「想你」「新年快乐」这类话时，聊天里飘过一阵小表情，两秒左右就没了。只在消息刚发出、刚收到时有，系统开了「减少动态效果」就不飘。')}</div>`
      + groupTitle('宠物')
      + `<div class="group"><button class="list-row" data-action="me-pets">${icon('paw')}<span><strong>我的宠物</strong><small>${esc(petsLine())}</small></span>${icon('next')}</button></div>`
      + groupTitle('聊天')
      // 0.9.36: every switch of how the chats go is in one sheet (also from a chat's 「⋯」).
      + `<div class="group"><button class="list-row" data-action="me-chat-settings">${icon('sliders')}<span><strong>聊天设置</strong><small>${esc(settingsLine())}</small></span>${icon('next')}</button></div>`);
  }
  /** 状态: the five, and a few words of one's own. */
  function statusSheet() {
    const draw = () => { const p = profile(); return `<div class="deco-row">${Object.entries(PROFILE_STATUS).map(([k, l]) => `<button type="button" class="status-chip" data-action="me-set" data-key="status" data-value="${k}" aria-pressed="${p.status === k}"><i class="qq-dot" data-status="${k}"></i>${l}</button>`).join('')}</div>
      ${field('自定义状态', input('me-statusText', p.statusText, 'text', 'maxlength="20" placeholder="例如：摸鱼中、在听歌"'))}`; };
    const d = ctx.dialog('状态', draw());
    d.body.addEventListener('click', e => { const b = e.target.closest('[data-action=me-set]'); if (!b) return; api.saveChatOptions({profile: {status: b.dataset.value}}); d.body.innerHTML = draw(); render(); });
    d.body.addEventListener('change', e => { if (e.target.dataset.field !== 'me-statusText') return; try { api.saveChatOptions({profile: {statusText: e.target.value}}); render(); } catch (error) { ctx.notify(error.message, {error: true}); } });
  }
  /** 个性装扮 of one kind in a sheet: tap to put one on, buy one from the shop; the background can be a photo. */
  function decoSheet(key) {
    const [label, list] = DECOS[key];
    const draw = () => { const p = profile(); return decoChips(key, list, p[key]) + (key === 'background' ? `<div class="actions">${btn('me-bg-photo', icon('image') + (p.backgroundPhoto ? '换一张照片当背景' : '用相册里的照片当背景'), 'secondary')}${p.backgroundPhoto ? btn('me-bg-clear', '不用照片', 'text-button') : ''}</div>` : ''); };
    const d = ctx.dialog(label, draw());
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const action = b.dataset.action;
      try {
        if (action === 'me-set') { api.saveChatOptions({profile: {[key]: b.dataset.value}}); d.body.innerHTML = draw(); render(); }
        if (action === 'me-buy') {
          const left = api.wallet().balance, price = Number(b.dataset.price);
          if (!await ctx.confirm(`买下「${b.dataset.name}」？`, `¥${price}，零钱还有 ¥${yuan(left)}。买下以后一直能用。`)) return;
          api.buyDecoration(key, b.dataset.value); api.saveChatOptions({profile: {[key]: b.dataset.value}});
          render(); ctx.notify('买下并换上了');
        }
        if (action === 'me-bg-photo') { d.close(); await pickBackground(); }
        if (action === 'me-custom') { d.close(); bubbleSetsSheet(ctx, api, {look: bubbleLook(), changed: () => render()}); }
        if (action === 'me-bg-clear') { api.saveChatOptions({profile: {backgroundPhoto: ''}}); d.body.innerHTML = draw(); render(); }
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }

  // ---------- Thread ----------
  function bodyHTML(m) {
    const mid = `data-mid="${esc(m.id)}"`;
    switch (m.kind) {
      case 'voice': return `<button class="voice-msg" data-action="voice" ${mid} data-state="ungenerated" aria-label="播放 ${esc(m.from)} 的语音"><span class="v-ico">${icon('play', true)}</span><span class="v-wave">${WAVE_HEIGHTS.map(h => `<i style="height:${h}px"></i>`).join('')}</span><span class="v-sec">${seconds(m)}″</span></button>${voiceText().auto || transcribed.has(m.id) ? transcriptHTML(m) : ''}`;
      case 'photo': return m.photoId
        ? `<button class="chat-photo" data-action="photo" ${mid}${photoSizes.has(m.photoId) ? ` style="${photoSizes.get(m.photoId)}"` : ''} aria-label="查看照片"><img data-chat-photo="${esc(m.photoId)}"${bubbleURLs.get(m.photoId) ? ` src="${esc(bubbleURLs.get(m.photoId))}"` : ''} alt="${esc(m.text || '照片')}"></button>`
        : `<button class="chat-photo described" data-action="message" ${mid}><span class="ph-art">${icon('image')}</span><span class="ph-cap">${esc(m.text)}</span></button>${photoNote(m)}`;
      case 'file': return fileBody(m, mid);
      // A sticker: the picture without a bubble; its name when the picture cannot be loaded.
      case 'sticker': return `<button class="chat-sticker" data-action="sticker" ${mid} aria-label="表情包：${esc(m.text)}" data-name="[${esc(m.text)}]">${m.photoId ? `<img data-sticker-photo="${esc(m.photoId)}"${photoURLs.get(m.photoId) ? ` src="${esc(photoURLs.get(m.photoId))}"` : ''} alt="${esc(m.text)}" draggable="false">` : m.url ? `<img src="${esc(m.url)}" alt="${esc(m.text)}" loading="lazy" referrerpolicy="no-referrer" draggable="false">` : ''}</button>`;
      // 合并转发: the record as a card, its first lines on it; a tap opens all of it.
      case 'forward': return `<button class="fwd-card" data-action="forward-open" ${mid}><strong>${esc(m.title)}</strong><span class="fwd-lines">${(m.items || []).slice(0, 4).map(i => `<span>${esc(i.from)}：${esc(i.text)}</span>`).join('')}</span><small>聊天记录 · ${(m.items || []).length} 条</small></button>`;
      case 'redpacket': {
        const opened = m.state === 'opened';
        return `<button class="packet${opened ? ' done' : ''}" data-action="packet" ${mid}><span class="pk-main"><span class="pk-ico" aria-hidden="true"></span><span class="pk-text"><strong>${esc(m.text || BLESSING)}</strong>${opened ? `<small>${m.openedBy === 'me' ? '你已领取' : esc(you(m.openedBy)) + ' 已领取'}</small>` : ''}</span></span><span class="pk-foot">红包</span></button>`;
      }
      case 'transfer': {
        const state = {sent: m.from === 'me' ? '等对方收款' : '请收款', accepted: '已收款', returned: '已退还'}[m.state] || '';
        return `<button class="packet transfer${m.state !== 'sent' ? ' done' : ''}" data-action="transfer" ${mid}><span class="pk-main"><span class="pk-ico" aria-hidden="true">${icon(m.state === 'returned' ? 'undo' : m.state === 'accepted' ? 'check' : 'swap')}</span><span class="pk-text"><strong>¥${esc(m.amount)}</strong><small>${esc(m.text || state)}</small></span></span><span class="pk-foot">转账${m.text ? ' · ' + esc(state) : ''}</span></button>`;
      }
      case 'gift': {
        const g = m.gift || {}, mine = m.from === 'me';
        const state = m.state === 'accepted' ? (mine ? '对方已收下' : '你已收下') : m.state === 'returned' ? (mine ? '对方退还了' : '你退还了') : mine ? '等对方收下' : '点开收下';
        return `<button class="gift-card${m.state !== 'sent' ? ' done' : ''}" data-action="gift" ${mid}><span class="gc-main"><span class="gc-emoji" aria-hidden="true">${esc(g.emoji || '🎁')}</span><span class="gc-text"><strong>${esc(g.name)}</strong><small>${esc(m.text || state)}</small></span></span><span class="gc-foot">礼物${m.text ? ' · ' + esc(state) : ''}</span></button>`;
      }
      case 'location': return `<button class="loc-card" data-action="message" ${mid}><span class="loc-text"><strong>${esc(m.text)}</strong>${m.detail ? `<small>${esc(m.detail)}</small>` : ''}</span><span class="loc-map" aria-hidden="true">${icon('pin')}</span></button>`;
      case 'dice': {
        const fresh = Date.now() - m.at < 1500;
        return `<button class="dice-msg${fresh ? ' rolling' : ''}" data-action="message" ${mid} data-face="${esc(m.text)}" aria-label="骰子 ${esc(m.text)} 点">${Array.from({length: 9}, (_, i) => `<i${PIPS[m.text]?.includes(i) ? ' class="on"' : ''}></i>`).join('')}</button>`;
      }
      case 'song': return `<button class="song-card" data-action="song" ${mid} aria-label="播放 ${esc(m.song?.title || '')}"><span class="sg-disc" aria-hidden="true">${icon('music')}</span><span class="sg-text"><strong>${esc(m.song?.title || '')}</strong><small>${esc(m.song?.artist || '')}</small>${m.text ? `<em>${esc(m.text)}</em>` : ''}</span><span class="sg-play" aria-hidden="true">${icon(m.song?.draft ? 'edit' : 'play', !m.song?.draft)}</span></button>`;
      case 'game': return gameHTML(m);
      // 慢递信件 (0.9.36): an envelope — the user's says where it is; one that came is sealed until it is opened.
      case 'letter': {
        const l = m.letter || {}, mine = m.from === 'me', there = l.arriveAt <= Date.now();
        const sub = mine ? (there ? (l.answered ? '已送到 · TA 写了回信' : '已送到') : `在路上 · ${remindLabel(l.arriveAt)} 寄到`) : l.opened ? String(l.text || '').replace(/\s+/g, ' ').slice(0, 24) : '点开拆信';
        return `<button class="letter-card${mine ? ' sent' : l.opened ? ' opened' : ' sealed'}" data-action="letter-open" ${mid}><span class="lc-env" aria-hidden="true"><i></i></span><span class="lc-text"><strong>${mine ? `寄给${esc(shown(thread.members[0]))}的信` : `${esc(shown(m.from))}的来信`}</strong><small>${esc(sub)}</small></span></button>`;
      }
      // 论坛 × 聊天 (0.9.35): a forum post as a card; a tap opens it on the forum.
      case 'post': return `<button class="share-card post-card" data-action="post-open" ${mid}><span class="share-kind">${icon('bubble')}论坛帖子</span><strong>${esc(m.post?.title || '（没有标题）')}</strong>${m.post?.text ? `<small>${esc(m.post.text.slice(0, 80))}</small>` : ''}${m.post?.author ? `<em>${esc(m.post.author === 'me' ? '我' : shown(m.post.author))}</em>` : ''}</button>${m.post?.note ? `<span class="chat-bubble share-note">${esc(m.post.note)}</span>` : ''}`;
      // 绘本 × 聊天 (0.9.40): a picture book as a card (its cover when it was drawn); a tap opens it in the 绘本 App.
      case 'book': return `<button class="share-card book-card" data-action="book-open" ${mid}>${m.book?.coverId ? `<img data-chat-photo="${esc(m.book.coverId)}"${bubbleURLs.get(m.book.coverId) ? ` src="${esc(bubbleURLs.get(m.book.coverId))}"` : ''} alt="">` : `<span class="book-ico" aria-hidden="true">${icon('book')}</span>`}<span class="share-text"><span class="share-kind">${icon('book')}绘本</span><strong>《${esc(m.book?.title || '')}》</strong>${m.book?.subtitle ? `<small>${esc(m.book.subtitle)}</small>` : ''}<em>${m.book?.spreads || 0} 个跨页</em></span></button>`;
      // 衣柜 × 聊天 (0.9.35): clothes shown, with a picture of one of the pieces when there is one.
      case 'outfit': return `<button class="share-card outfit-card" data-action="outfit-open" ${mid}>${m.outfit?.photoId ? `<img data-chat-photo="${esc(m.outfit.photoId)}"${bubbleURLs.get(m.outfit.photoId) ? ` src="${esc(bubbleURLs.get(m.outfit.photoId))}"` : ''} alt="">` : `<span class="outfit-ico" aria-hidden="true">${icon('hanger')}</span>`}<span class="share-text"><span class="share-kind">${icon('hanger')}穿搭</span><strong>${esc(m.outfit?.name || '')}</strong><small>${esc(String(m.outfit?.text || '').slice(0, 90))}</small></span></button>`;
      case 'call': return `<button class="call-msg${m.state === 'answered' ? '' : ' missed'}" data-action="call-log" ${mid}>${icon('phone', true)}<span>${esc(callSummary(m))}</span></button>`;
      default: return `<button class="chat-bubble" data-action="message" ${mid}>${atHTML(m.text)}</button>`;
    }
  }
  /** A group's 「@名字」 marked (0.9.36); the user's own name marked as the user's. */
  function atHTML(text) {
    const t = esc(text);
    if (thread?.type !== 'group' || !t.includes('@')) return t;
    // The user by the phone's name, the group's nickname, or the tavern's name (the one the model is told).
    const mine = [myName(), thread.nicks?.me, api.userName?.()].filter(Boolean), names =[...new Set([...thread.members, ...Object.values(thread.nicks || {}), ...mine])].filter(Boolean).sort((a, b) => b.length - a.length);
    const re = new RegExp(`@(${names.map(n => esc(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return t.replace(re, (all, name) => `<span class="at${mine.map(esc).includes(name) ? ' at-me' : ''}">${all}</span>`);
  }
  /** Typing 「@」 in a group: who to @ — their name goes in right after it. */
  function atPicker(el, e) {
    if (thread?.type !== 'group' || thread.watch || !['@', '＠'].includes(e?.data) || e.inputType === 'insertFromPaste') return;
    const at = el.selectionStart;
    if (e.data === '＠') { el.value = el.value.slice(0, at - 1) + '@' + el.value.slice(at); el.setSelectionRange(at, at); }
    const d = sheet('@ 谁', `<div class="pick-list">${thread.members.map(n => `<button type="button" class="list-row" data-action="at-pick" data-name="${esc(n)}">${avatar(n, engine(n), 32)}<span><strong>${esc(groupName(n))}</strong>${thread.nicks?.[n] ? `<small>${esc(n)}</small>` : ''}</span></button>`).join('')}</div>`, {
      'at-pick': btnEl => {
        d.close();
        const box = v.root.querySelector('[data-field=draft]'), name = groupName(btnEl.dataset.name);
        if (!box) return;
        box.value = box.value.slice(0, at) + name + ' ' + box.value.slice(at);
        keepDraft(threadId, box.value); syncSend();
        box.focus({preventScroll: true}); box.setSelectionRange(at + name.length + 1, at + name.length + 1);
      }
    });
  }
  /** 群公告 folded away (×) until a new one comes: kept in this browser by the notice's time. */
  const noticeKey = t => `st-iphonie-notice-hidden:${scope}:${t.id}`;
  const noticeHidden = t => { try { return ctx.win.localStorage.getItem(noticeKey(t)) === String(t.notice?.at || 0); } catch { return false; } };
  function lineHTML(m) {
    const mid = `data-mid="${esc(m.id)}"`;
    // 「N 条消息会带进下一次正文」is the line under the chat while a choice waits; older versions also wrote it in as a note.
    if (m.kind === 'system') return /^\d+ 条消息会带进下一次正文$/.test(m.text || '') ? '' : `<div class="sys">${icon('book')}${esc(m.text)}</div>`;
    if (m.kind === 'pat') return `<div class="note-line" ${mid}>${esc(patText(m))}</div>`;
    if (m.kind === 'notice') return `<div class="note-line" ${mid}>${/红包/.test(m.text) ? '<span class="pk-dot" aria-hidden="true"></span>' : ''}${esc(noticeText(m))}</div>`;
    const again = m.from === 'me' && recalled.has(m.id) ? btn('re-edit', '重新编辑', 'text-button', mid) : '';
    if (m.said && m.from !== 'me') {
      const open = peeked.has(m.id);
      return `<div class="note-line recall-note" ${mid}>${m.id === pace.fresh ? `<span class="recall-ghost" aria-hidden="true">${esc(m.said)}</span>` : ''}<button type="button" class="recall-peek" data-action="peek" ${mid} aria-expanded="${open}" title="点一下偷看">${esc(you(m.from))} 撤回了一条消息${icon('eye')}</button>${open ? `<span class="recall-said">「${esc(m.said)}」</span>` : ''}</div>`;
    }
    return `<div class="note-line" ${mid}>${esc(you(m.from))} 撤回了一条消息${again}</div>`;
  }
  // The 自定义气泡 of the chat being drawn (bubbleSetsFor).
  let bsets = {mine: '', theirs: () => ''};
  // 带进剧情 picks, like forwarding several messages in QQ: the picked ones sit between 从这里开始 and 到这里结束.
  // Dragging a bar takes in every message it passes (one untapped inside stays out); tapping a message toggles it.
  let edges = {};
  const rangeBar = edge => `<div class="range-bar" data-edge="${edge}" role="slider" aria-label="${edge === 'start' ? '拖动改起点' : '拖动改终点'}"><i></i><span>${edge === 'start' ? '从这里开始' : '到这里结束'}</span><i></i></div>`;
  function pickEdges() {
    const ids = thread.messages.filter(m => !LINE_KINDS.includes(m.kind) && selecting?.has(m.id)).map(m => m.id);
    return {first: ids[0], last: ids.at(-1)};
  }
  /** Under a contact's described photo: drawing it now, or 画出来 (it was not free, or it failed). */
  function photoNote(m) {
    // A photo described without tags can be drawn too: its words are turned into tags first (host-chat.js drawPhoto).
    if (!api.chatDrawPhoto || !(m.imageTags || m.text?.trim())) return '';
    if (m.imageState === 'waiting') return '<span class="ph-note">正在画……</span>';
    if (!api.drawReady?.()) return '';
    return `<button type="button" class="ph-note ph-draw" data-action="photo-draw" data-mid="${esc(m.id)}">${esc(m.imageState === 'failed' && m.imageNote ? m.imageNote + ' · ' : '')}画出来</button>`;
  }
  function messageHTML(m, i, list) {
    const when = timeLabel(m, i <= drawn.from ? null : list[i - 1]), day = when ? `<div class="day">${esc(when)}</div>` : '';
    if (LINE_KINDS.includes(m.kind)) return day + lineHTML(m);
    const me = m.from === 'me', group = thread.type === 'group', picked = selecting?.has(m.id);
    const quoted = m.quote ? `<span class="m-quote">${esc(you(m.quote.from))}：${esc(m.quote.text)}</span>` : '';
    const bset = me ? bsets.mine : bsets.theirs(m.from);
    return day + (picked && m.id === edges.first ? rangeBar('start') : '') + `<div class="msg${me ? ' me' : ''}${m.id === pace.fresh ? ' fresh' : ''}" data-engine="${me ? 'none' : engine(m.from)}" data-kind="${m.kind}" data-mid="${esc(m.id)}"${bset ? ` data-bset="${esc(bset)}"` : ''}${picked ? ' data-picked' : ''}>${selecting ? '<span class="pick" aria-hidden="true"></span>' : ''}${me ? `<span class="me-side">${myAvatar(34)}</span>` : `<span class="pat-target" data-pat="${esc(m.from)}" title="双击拍一拍">${avatar(m.from, engine(m.from), 34)}</span>`}<div class="m-body">${group && !me ? `<span class="m-name">${esc(groupName(m.from))}</span>` : ''}${bodyHTML(m)}${quoted}${reactsHTML(m)}</div></div>` + (picked && m.id === edges.last ? rangeBar('end') : '');
  }
  /** 消息回应 under a message: each emoji once, how many put it, the user's own marked; a tap puts the user's on or off. */
  function reactsHTML(m) {
    if (!m.reactions?.length) return '';
    const by = new Map();
    for (const r of m.reactions) by.set(r.emoji, [...(by.get(r.emoji) || []), r.from]);
    return `<span class="m-reacts">${[...by].map(([emoji, who]) => `<button type="button" class="m-react${who.includes('me') ? ' mine' : ''}" data-action="react-chip" data-mid="${esc(m.id)}" data-emoji="${esc(emoji)}" title="${esc(who.map(n => n === 'me' ? myName() : shown(n)).join('、'))}" aria-label="${esc(emoji)} ${who.length}">${emoji}${who.length > 1 ? `<small>${who.length}</small>` : ''}</button>`).join('')}</span>`;
  }
  function toolsHTML() {
    const group = thread.type === 'group';
    const tools = [['photo', 'image', '照片'], ['emoji', 'smile', '表情'], ['redpacket', 'packet', '红包'], ...(group ? [] : [['transfer', 'swap', '转账'], ['gift', 'gift', '礼物']]),
      ['file', 'file', '文件'], ['location', 'pin', '位置'], ['song', 'music', '分享歌'], ['write', 'edit', '写首歌'], ['pat', 'hand', '拍一拍'], ['dice', 'dice', '骰子'], ...(group ? [['game', 'games', '群游戏']] : [['play', 'games', '小游戏'], ['letter', 'mail', '写信']])];
    const tabs = `<div class="emoji-tabs" role="tablist">${[['emoji', '表情'], ['kao', '颜文字'], ['stickers', '表情包']].map(([k, t]) => `<button type="button" role="tab" data-action="panel-${k}" aria-selected="${panel === k}">${t}</button>`).join('')}</div>`;
    if (panel === 'stickers') {
      const list = api.getState().chat.stickers || [];
      return `<div class="chat-panel emoji-panel" role="group" aria-label="表情包">${tabs}
        ${list.length ? `<div class="sticker-grid">${list.slice().reverse().map(s => `<button type="button" class="sticker-cell" data-action="sticker-send" data-name="${esc(s.name)}" aria-label="发表情包：${esc(s.name)}" title="${esc(s.name)}">${stickerImg(s)}<small>${esc(s.name)}</small></button>`).join('')}</div>`
          : '<p class="hint sticker-empty">还没有表情包。点「管理」，从图片导入，或者粘贴「名字+图片网址」；对方也会从里面挑着发。</p>'}
        <div class="panel-foot">${btn('panel-tools', icon('back') + '更多功能', 'text-button')}${btn('stickers-manage', icon('sliders') + '管理', 'text-button')}</div></div>`;
    }
    // 0.9.47: the whole emoji set and the 颜文字 by category, recent first; a tap types it in (several in a row is fine).
    if (panel === 'emoji' || panel === 'kao') return `<div class="chat-panel emoji-panel" role="group" aria-label="${panel === 'kao' ? '颜文字' : '表情'}">${tabs}
      ${pickerHTML(panel, {recent: recentOf(ctx.win.localStorage, panel)})}
      <div class="panel-foot">${btn('panel-tools', icon('back') + '更多功能', 'text-button')}${btn('emoji-del', icon('backspace'), 'round-button', 'aria-label="删除一个字"')}</div></div>`;
    // Pages of 8 (two rows), swiped sideways like WeChat's; the dots show the page and switch it on a tap.
    const pages = [];
    for (let i = 0; i < tools.length; i += 8) pages.push(tools.slice(i, i + 8));
    const page = list => `<div class="tool-grid">${list.map(([action, glyph, label]) => action === 'file' ? fileTool() :
      `<button class="tool" data-action="tool-${action}"><span class="tool-ico" data-tool="${action}">${icon(glyph)}</span><span>${label}</span></button>`).join('')}</div>`;
    return `<div class="chat-panel" role="group" aria-label="更多功能"><div class="tool-pages">${pages.map(page).join('')}</div>${pages.length > 1
      ? `<div class="tool-dots">${pages.map((_, i) => `<button type="button" data-action="tool-page" data-page="${i}" aria-label="第 ${i + 1} 页" aria-current="${i === 0}"></button>`).join('')}</div>` : ''}</div>`;
  }
  /** 旁观群 (0.9.35): no box to write in — the user is not in the group; they can be asked to talk a little. */
  function watchBarHTML() {
    const busy = typing();
    return `<div class="watch-bar" role="status">${icon('eye')}<span>你不在这个群里，只能看</span>${live ? btn('watch-talk', busy ? '正在聊…' : '让他们聊几句', 'chip-button', busy ? 'disabled' : '') : ''}</div>`;
  }
  function composerHTML() {
    const group = thread.type === 'group';
    return `<div class="composer-wrap">
      ${quote ? `<div class="quote-bar"><span>回复 ${esc(you(quote.from))}：${esc(quote.text)}</span>${btn('quote-off', icon('close'), 'round-button', 'aria-label="取消引用"')}</div>` : ''}
      <div class="composer">${btn('panel', icon('add'), 'round-button plus', `aria-label="更多功能" aria-expanded="${!!panel}"`)}<input class="field-in" data-field="draft" value="${esc(draftOf(threadId))}" placeholder="${group ? '发到群聊…' : '发消息…'}" enterkeyhint="send" autocomplete="off" aria-label="消息">${sendButton()}</div>
      ${panel ? toolsHTML() : ''}</div>`;
  }
  // Only the latest messages are drawn: a chat is drawn again for every message that comes and every time the typing
  // dots come or go, and a long one drawn whole took a second or more each time on a phone (a thread keeps up to 1000).
  // Scrolling up to the top draws the next earlier ones above, where they were.
  const SHOWN = 60;
  let drawn = {thread: null, count: SHOWN, from: 0, first: null}, older = null;
  function showOlder() {
    const msgs = v.root.querySelector('.msgs');
    if (older || !msgs || !drawn.from) return;
    older = {fromBottom: msgs.scrollHeight - msgs.scrollTop};
    drawn.count += SHOWN;
    render();
  }
  /** again: only the typing dots came or went, nothing in the chat changed: drawn from the chat as it was read.
   *  reading: reads of the chat on their way (a drawing from the chat in hand would come before them and stand in
   *  their place, without what they were bringing). */
  let reading = 0;
  async function renderThread(ticket, again = false) {
    let loaded = thread;
    if (!again || thread?.id !== threadId) { reading++; try { loaded = await api.getThread(threadId); } finally { reading--; } }
    if (v.disposed || ticket !== epoch) return;
    thread = loaded;
    if (!thread) { mode = 'list'; threadId = null; older = null; return render(); }
    if (drawn.thread !== threadId) {
      drawn = {thread: threadId, count: SHOWN, from: 0, first: null};
      // A chat opened: where its unread messages begin (a note offers to go up there when they are not on the screen).
      unseen = 0; tailId = null; unreadMark = null;
      let left = thread.unread || 0;
      for (let k = thread.messages.length - 1; k >= 0 && left > 0; k--) {
        const m = thread.messages[k];
        if (m.from !== 'me' && !['system', 'notice', 'recall'].includes(m.kind) && !--left) unreadMark = {id: m.id, count: thread.unread, show: false, checked: false};
      }
    }
    if (thread.unread) api.markThreadRead(threadId).catch(() => {});
    const group = thread.type === 'group', contacts = api.chatContacts(true);
    const voiced = thread.members.filter(n => contacts.find(c => c.name === n)?.voice).length;
    // 旁观群 (0.9.35): the user is not in it. A private chat shows how the other one is now (状态, 0.9.35).
    const sub = group ? (thread.watch ? `${thread.members.length} 人 · 你不在群里` : `${thread.members.length} 人 · ${voiced} 人能发语音`) : '';
    const dmStatus = group ? null : contactStatus(api.getState().chat.statusOf?.[ownKey(thread.members[0])], {lastAt: thread.messages.findLast(m => m.from === thread.members[0])?.at || 0});
    const bring = pendingBring(), scroller = v.root.querySelector('.msgs'), atBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    const focused = ctx.doc.activeElement?.dataset?.field === 'draft' && v.root.contains(ctx.doc.activeElement);
    track(thread.messages);
    const list = thread.messages.filter(m => !pace.hidden.has(m.id)), waiting = pace.queue[0];
    // Who the typing bubble is for: the next message waiting to show, or the contact while the reply is written.
    const typer = typing() || waiting ? (waiting?.from || (group ? '' : thread.members[0])) : null;
    edges = selecting?.size ? pickEdges() : {};
    // While picking, the first picked one is drawn too (到最早 picks back to the very first message).
    const firstPicked = edges.first ? list.findIndex(m => m.id === edges.first) : -1;
    // At the bottom: the latest ones. Scrolled up: the same first message stays first, so one coming in does not move
    // what is being read.
    const kept = older || atBottom || stick ? -1 : list.findIndex(m => m.id === drawn.first);
    if ((atBottom || stick) && !older) drawn.count = SHOWN;
    drawn.from = kept >= 0 ? kept : Math.max(0, list.length - drawn.count);
    if (firstPicked >= 0 && firstPicked < drawn.from) drawn.from = firstPicked;
    // Come from a search (or the unread note): from a little before that message.
    const target = jump ? list.findIndex(m => m.id === jump) : -1;
    if (target >= 0 && target - 5 < drawn.from) drawn.from = Math.max(0, target - 5);
    drawn.count = list.length - drawn.from; drawn.first = list[drawn.from]?.id ?? null;
    // 新消息 that come while the chat is scrolled up wait below: counted for the note that takes the chat down to them.
    const tail = list.at(-1)?.id ?? null;
    if (tailId && tail !== tailId && !atBottom && !stick) {
      const from = list.findIndex(m => m.id === tailId);
      if (from >= 0) unseen += list.slice(from + 1).filter(m => m.from !== 'me' && !LINE_KINDS.includes(m.kind)).length;
    }
    if (atBottom || stick) unseen = 0;
    tailId = tail;
    // 重新回复的版本: under the last round, while it is the last thing in the chat and nothing is being written.
    const alts = thread.alts, round = alts ? lastRound(thread.messages) : null;
    const versions = alts?.versions?.length > 1 && round.after === alts.after && round.round.length && typer === null && !selecting ? alts : null;
    const why = typer === null ? failed.get(threadId) : '';
    bsets = bubbleSetsFor(thread);
    const custom = !!bsets.mine || thread.members.some(n => bsets.theirs(n));
    if (custom) syncBubbleCss(ctx.doc, bubbleSets());
    const rowsWanted = [];
    if (drawn.from) rowsWanted.push({key: 'older', html: `<button type="button" class="chat-older" data-action="older">${icon('back')}更早的 ${drawn.from} 条消息</button>`});
    if (list.length) list.slice(drawn.from).forEach((m, j) => rowsWanted.push({key: 'm:' + m.id, html: messageHTML(m, drawn.from + j, list)}));
    else rowsWanted.push({key: 'empty', html: `<p class="chat-empty">${thread.watch ? (live ? '群里还没人说话，点下面的「让他们聊几句」。' : '在酒馆里打开小手机时，他们才会聊。') : live ? '发几条消息都行，发完点右下角的气泡按钮让对方回复；输入框空着时发送键就会变成它。也可以直接点它，让对方先开口。' : '在酒馆里打开小手机时，联系人才会回复。'}</p>`});
    if (versions) rowsWanted.push({key: 'versions', html: `<div class="chat-versions" role="group" aria-label="这一轮回复的版本">${btn('version', '‹', 'icon-button', `data-to="${versions.shown - 1}" aria-label="上一个版本" ${versions.shown > 0 ? '' : 'disabled'}`)}<span>${versions.shown + 1} / ${versions.versions.length}</span>${btn('version', '›', 'icon-button', `data-to="${versions.shown + 1}" aria-label="下一个版本" ${versions.shown < versions.versions.length - 1 ? '' : 'disabled'}`)}</div>`});
    if (bring?.threadId === threadId) rowsWanted.push({key: 'bring', html: `<div class="sys">${icon('book')}${bring.count} 条消息会带进下一次正文 ${btn('cancel-bring', '取消', 'text-button')}</div>`});
    if (why) rowsWanted.push({key: 'failed', html: `<div class="sys chat-failed" role="alert">${icon('alert')}<span>没回复成功：${esc(why)}</span><small>点右下角的气泡再试一次</small></div>`});
    if (typer !== null) rowsWanted.push({key: 'typing', html: `<div class="msg typing-row" data-engine="${typer ? engine(typer) : 'none'}">${avatar(typer || '…', typer ? engine(typer) : 'none', 34)}<div class="m-body"><div class="chat-bubble typing" aria-label="对方正在输入"><i></i><i></i><i></i></div></div></div>`});
    const look = profile();
    // 每个人的聊天背景: a private chat with someone who has one shows theirs.
    const own = group ? '' : api.getState().chat.bgOf?.[ownKey(thread.members[0])] || '', ownPhoto = own.startsWith('photo:') ? own.slice(6) : '';
    const bgPhoto = own ? ownPhoto : look.backgroundPhoto;
    const bg = bgPhoto ? 'photo' : own || look.background, scene = chatScene(bg);
    drawThread(`<div class="chat-thread${selecting ? ' selecting' : ''}" data-thread="${esc(threadId)}" data-bubble="${esc(bsets.mine ? 'custom' : look.bubble)}" data-bg="${esc(bg)}"${custom ? ' data-bsets' : ''}${scene ? ` data-scene data-tone="${sceneDark(bg) ? 'dark' : 'light'}"` : ''}>
      <div class="th-head" data-engine="${group ? 'none' : engine(thread.members[0])}">${threadAvatar(thread, 38)}<div class="th-title"><strong>${esc(group ? thread.name : shown(thread.members[0] || thread.name))}</strong><small>${dmStatus ? statusDot(dmStatus) + (voiced ? '' : ' · 只发文字') : esc(sub)}</small></div>
        ${btn('bring', selecting ? '取消' : icon('book') + `<span class="bring-label">${thread.story ? '一直带着' : '带进剧情'}</span>`, 'chip-button', selecting ? '' : `aria-label="带进剧情" title="${thread.story ? '正文一直记得这段聊天' : '带进剧情'}"${thread.story ? ' data-on' : ''}`)}${!group && api.callDial && !thread.blocked ? btn('call', icon('phone'), 'round-button call-go', 'aria-label="语音通话"') : ''}${btn('thread-menu', icon('more'), 'round-button', 'aria-label="更多"')}</div>
      ${group && thread.notice && !noticeHidden(thread) ? `<div class="group-notice"><button type="button" class="gn-main" data-action="notice-open">${icon('bell')}<span class="gn-text">${esc(thread.notice.text)}</span></button>${btn('notice-hide', icon('close'), 'icon-button', 'aria-label="收起群公告"')}</div>` : ''}
      <div class="msgs-wrap" data-bg="${esc(bg)}">${scene}<div class="msgs" role="log" aria-live="polite" data-keep-scroll="msgs-${esc(threadId)}"></div>${jumpChips()}</div>
      ${!group && thread.friend ? `<div class="friend-cut" role="status">${icon('alert')}<span>${thread.friend.by === 'me' ? `你已删除了${esc(thread.members[0])}` : `${esc(thread.members[0])}已把你从好友里删除了`}</span>${thread.friend.by === 'me' ? btn('refriend', '加回好友', 'chip-button', `data-id="${esc(thread.id)}"`) : btn('ask-friend', '发送好友申请', 'chip-button')}</div>` : ''}
      ${!group && thread.blocked ? `<div class="friend-cut is-blocked" role="status">${icon('alert')}<span>你已把${esc(shown(thread.members[0]))}拉黑${thread.blocked.held?.length ? ` · 拦截了 ${thread.blocked.held.length} 条` : ''}</span>${thread.blocked.held?.length ? btn('held', '拦截记录', 'chip-button') : ''}${btn('unblock', '移出黑名单', 'chip-button', `data-id="${esc(thread.id)}"`)}</div>` : ''}
      ${selecting
        ? (pickFor === 'delete'
          ? `<div class="select-bar chat-pick-bar pick-delete" role="toolbar" aria-label="选中的消息"><div class="select-head"><span>${selecting.size ? pickedLabel(selecting.size) : '点一条消息开始，再拖上下的条条多选'}</span><span class="pick-ends">${btn('pick-up', '到最早', 'text-button', selecting.size ? '' : 'disabled')}${btn('pick-down', '到最新', 'text-button', selecting.size ? '' : 'disabled')}</span></div>`
            + `<div class="select-acts">${[['forward-go', 'share', '转发', ''], ['image-go', 'image', '长图', ''], ['delete-go', 'trash', '删除', ' select-danger']].map(([action, ic, label, more]) => `<button type="button" class="select-act${more}" data-action="${action}"${selecting.size ? '' : ' disabled'}>${icon(ic)}<span>${label}</span></button>`).join('')}</div></div>`
          : `<div class="bring-bar"><span>${selecting.size ? pickedLabel(selecting.size) : '点一条消息开始，再拖上下的条条多选'}</span>${btn('bring-go', '带进下一次正文', 'primary', selecting.size ? '' : 'disabled')}</div>`)
        : !group && thread.blocked ? '' : thread.watch ? watchBarHTML() : composerHTML()}
    </div>`, rowsWanted);
    const msgs = v.root.querySelector('.msgs');
    if (scene) syncMotion(v.root, ctx.win);
    // The 表情 panel drawn with the page: its categories and the sections not drawn yet (0.9.47).
    const composer = v.root.querySelector('.composer-wrap');
    if (composer?.querySelector('.ep')) { bindPicker(composer, ctx.win); fillPicker(composer, ctx.win); }
    const found = target >= 0 ? [...msgs.querySelectorAll('.msg[data-mid]')].find(el => el.dataset.mid === jump) : null;
    if (found) { msgs.scrollTop += found.getBoundingClientRect().top - msgs.getBoundingClientRect().top - msgs.clientHeight / 3; found.classList.remove('msg-found'); void found.offsetWidth; found.classList.add('msg-found'); }
    else if (older) msgs.scrollTop = msgs.scrollHeight - older.fromBottom;
    else if (atBottom || stick) msgs.scrollTop = msgs.scrollHeight;
    stick = false; older = null; jump = null;
    pace.fresh = null;
    // Opened with unread messages above what shows: the note that goes up to where they begin.
    if (unreadMark && !unreadMark.checked) {
      unreadMark.checked = true;
      const first = [...msgs.querySelectorAll('.msg[data-mid]')].find(el => el.dataset.mid === unreadMark.id);
      if (!first || first.getBoundingClientRect().top < msgs.getBoundingClientRect().top - 4) { unreadMark.show = true; syncChips(); }
    }
    if (focused) v.root.querySelector('[data-field=draft]')?.focus({preventScroll: true});
    paintVoices();
    paintPhotos();
    if (bgPhoto) photoURL(bgPhoto).then(url => { const box = v.root.querySelector('.msgs'); if (box && url) box.style.backgroundImage = `url("${url}")`; });
    eggs(list);
    // 宠物: after the chat is drawn (the layer stays in .msgs-wrap when it is drawn again); where they were is kept by chat.
    petsLayer.attach(v.root.querySelector('.msgs-wrap'), v.root.querySelector('.msgs'), {key: threadId, box: () => v.root.querySelector('[data-field=draft]')});
  }
  // 关键词彩蛋: the messages shown since this chat was opened, the first one that calls for an egg plays it.
  let eggSeen = {thread: null, ids: new Set()};
  function eggs(list) {
    if (eggSeen.thread !== threadId) { eggSeen = {thread: threadId, ids: new Set(list.map(m => m.id))}; return; }
    const fresh = list.filter(m => !eggSeen.ids.has(m.id));
    for (const m of fresh) eggSeen.ids.add(m.id);
    // New messages attract a nearby companion, including the user's own bubbles.
    const latest = fresh.findLast(m => !LINE_KINDS.includes(m.kind)), shownThread = threadId;
    if (latest) ctx.win.setTimeout(() => {
      if (mode !== 'thread' || threadId !== shownThread || v.disposed) return;
      petsLayer.arrived([...v.root.querySelectorAll('.msg[data-mid]')].find(el => el.dataset.mid === latest.id), ['redpacket', 'gift', 'transfer'].includes(latest.kind), {mine: latest.from === 'me', picture: ['photo', 'sticker'].includes(latest.kind)});
    }, 120);
    if (!fresh.length || profile().eggs === false) return;
    const egg = fresh.map(m => eggOf(m.kind === 'voice' ? m.translation || m.text : m.kind === 'text' ? m.text : '')).find(Boolean);
    if (egg) { playEgg(v.root.querySelector('.msgs-wrap'), egg, ctx.win); petsLayer.cheer(); }
  }
  /** The notes over the messages: 新消息 below (while scrolled up) and where the unread ones began (when opened). */
  function jumpChips() {
    return (unseen ? `<button type="button" class="chat-jump chat-jump-new" data-action="jump-new">${icon('down')}<span>${unseen} 条新消息</span></button>` : '')
      + (unreadMark?.show ? `<button type="button" class="chat-jump chat-jump-unread" data-action="jump-unread">${icon('up')}<span>${unreadMark.count} 条未读</span></button>` : '');
  }
  function syncChips() {
    const wrap = v.root.querySelector('.msgs-wrap');
    if (!wrap) return;
    for (const chip of wrap.querySelectorAll(':scope > .chat-jump')) chip.remove();
    wrap.insertAdjacentHTML('beforeend', jumpChips());
  }
  // A chat is drawn again often: each message of a reply as it shows, the typing dots coming and going. Its rows stay as
  // drawn (rows: key → {html, nodes}): a message that did not change keeps its nodes (its picture, its voice bar), and
  // only new or changed rows are made. The box of messages stays, scrolled where it was, and so does the message box
  // (a new one would put the caret at the start and break off a word the input method is still putting together).
  // Drawing all of it anew each time took about 150 ms (2026-11-05, 60 messages, jsdom).
  const rowCache = new Map();
  function placeRows(box, wanted) {
    const next = new Map(), nodes = [];
    for (const {key, html} of wanted) {
      let row = rowCache.get(key);
      if (!row || row.html !== html) { const t = ctx.doc.createElement('template'); t.innerHTML = html; row = {html, nodes: [...t.content.childNodes]}; }
      next.set(key, row); nodes.push(...row.nodes);
    }
    // In order, moving only what is out of place; what is no longer wanted goes.
    let at = box.firstChild;
    for (const node of nodes) { if (node === at) { at = at.nextSibling; continue; } box.insertBefore(node, at); }
    while (at) { const after = at.nextSibling; at.remove(); at = after; }
    rowCache.clear();
    for (const [key, row] of next) rowCache.set(key, row);
    // The last six messages are the ones whose decorated bubbles move (phone.css), marked on the rows themselves: with
    // :nth-last-child() the browser restyled every message whenever a row came or went at the end.
    const recent = new Set();
    for (let el = box.lastElementChild; el && recent.size < 6; el = el.previousElementSibling) if (el.classList.contains('msg')) recent.add(el);
    for (const el of box.querySelectorAll(':scope > .msg[data-recent]')) if (!recent.has(el)) el.removeAttribute('data-recent');
    for (const el of recent) if (!el.hasAttribute('data-recent')) el.setAttribute('data-recent', '');
  }
  function drawThread(html, wanted) {
    const old = v.root.querySelector('.chat-thread'), box = old?.querySelector('[data-field=draft]');
    const template = ctx.doc.createElement('template');
    template.innerHTML = html;
    const fresh = template.content.querySelector('.chat-thread'), freshBox = fresh?.querySelector('[data-field=draft]');
    const oldWrap = old?.querySelector(':scope > .msgs-wrap'), freshWrap = fresh?.querySelector(':scope > .msgs-wrap');
    const inner = new Map([...v.root.querySelectorAll('[data-keep-scroll]')].map(el => [el.dataset.keepScroll, el.scrollTop]));
    // Another chat, another page, or another scene behind the messages: drawn whole.
    if (!old || old.dataset.thread !== fresh.dataset.thread || old.parentElement !== v.root || !oldWrap || !freshWrap || oldWrap.dataset.bg !== freshWrap.dataset.bg) {
      rowCache.clear();
      v.draw(html);
      placeRows(v.root.querySelector('.msgs'), wanted);
      for (const el of v.root.querySelectorAll('[data-keep-scroll]')) if (inner.has(el.dataset.keepScroll)) el.scrollTop = inner.get(el.dataset.keepScroll);
      return;
    }
    const y = v.root.scrollTop;
    for (const name of old.getAttributeNames()) if (!fresh.hasAttribute(name)) old.removeAttribute(name);
    for (const name of fresh.getAttributeNames()) old.setAttribute(name, fresh.getAttribute(name));
    for (const chip of oldWrap.querySelectorAll(':scope > .chat-jump')) chip.remove();
    for (const chip of [...freshWrap.querySelectorAll(':scope > .chat-jump')]) oldWrap.append(chip);
    const pairs = new Map([[freshWrap, oldWrap]]);
    if (box && freshBox) {
      // From the box outwards: each level gets the new children around the one that holds the box.
      const keep = [box.parentElement, box.parentElement?.parentElement], put = [freshBox.parentElement, freshBox.parentElement?.parentElement];
      if (keep[1]?.parentElement === old && put[1]?.parentElement === fresh) {
        around(keep[1], keep[0], put[1], put[0]);
        around(keep[0], box, put[0], freshBox);
        pairs.set(put[1], keep[1]);
        const text = draftOf(threadId);
        if (box.value !== text) box.value = text;
      }
    }
    keepAround(old, fresh, pairs);
    placeRows(oldWrap.querySelector('.msgs'), wanted);
    for (const el of old.querySelectorAll('[data-keep-scroll]')) if (inner.has(el.dataset.keepScroll)) el.scrollTop = inner.get(el.dataset.keepScroll);
    v.root.scrollTop = y;
  }
  /** `parent` takes `from`'s children, except that `keep` stays where it is, in the place of `instead`. */
  function around(parent, keep, from, instead) {
    for (const node of [...parent.childNodes]) if (node !== keep) node.remove();
    let after = false;
    for (const node of [...from.childNodes]) {
      if (node === instead) { after = true; continue; }
      if (after) parent.append(node); else keep.before(node);
    }
  }
  /** `parent` takes `from`'s children; the ones kept (pairs: the new one → the one kept, in the same order in both) stay
   *  where they are, never taken out and put back (a box of messages would lose its scroll). */
  function keepAround(parent, from, pairs) {
    const kept = new Set(pairs.values());
    for (const node of [...parent.childNodes]) if (!kept.has(node)) node.remove();
    let anchor = parent.firstChild;
    for (const node of [...from.childNodes]) {
      const stay = pairs.get(node);
      if (stay) { anchor = stay.nextSibling; continue; }
      parent.insertBefore(node, anchor);
    }
  }
  // Opens or closes the + panel in place, so the message box keeps its text and focus.
  function syncPanel() {
    const wrap = v.root.querySelector('.composer-wrap');
    if (!wrap) return;
    const msgs = v.root.querySelector('.msgs'), atBottom = msgs && msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    const old = wrap.querySelector('.chat-panel');
    old?.remove();
    if (panel) {
      wrap.insertAdjacentHTML('beforeend', toolsHTML());
      if (!old) wrap.querySelector('.chat-panel').classList.add('enter');
      bindPicker(wrap, ctx.win); fillPicker(wrap, ctx.win);
    }
    wrap.querySelector('[data-action=panel]')?.setAttribute('aria-expanded', String(!!panel));
    if (msgs && atBottom) msgs.scrollTop = msgs.scrollHeight;
  }
  async function paintVoices() {
    const status = api.status();
    for (const el of v.root.querySelectorAll('.voice-msg[data-mid]')) {
      const m = thread?.messages.find(x => x.id === el.dataset.mid);
      if (!m) continue;
      const on = ['playing', 'paused', 'generating'].includes(status.phase) && status.line?.text === m.text && status.line?.role === m.from;
      const state = on ? (status.phase === 'generating' ? 'generating' : 'playing') : await api.lineState(lineOf(m));
      if (!el.isConnected) continue;
      el.dataset.state = state;
      el.querySelector('.v-ico').innerHTML = state === 'generating' ? icon('spin') : icon(state === 'playing' ? 'pause' : 'play', true);
    }
  }
  async function photoViewer(message, img) {
    const id = threadId, mid = message.id;
    const versions = [];
    for (const photoId of [...new Set([...(message.imageVersions || []), message.photoId].filter(Boolean))]) {
      const photo = await api.getPhoto(photoId);
      if (photo) versions.push({photoId, photo, src: await photoURL(photoId)});
    }
    if (v.disposed || threadId !== id || !versions.length) return;
    const current = async () => (await api.getThread(id))?.messages.find(m => m.id === mid);
    const request = m => {
      const names = [...api.getState().routes.map(r => r.name), api.userName?.() || myName()];
      const tags = photoTags({text: m.text, tags: m.imageTags, owner: m.from, names});
      return {...pictureInputs(api.getState(), photoPicture(api.getState(), {text: m.text, tags: m.imageTags, owner: m.from, names})), tag: tags};
    };
    const draw = async tags => {
      const m = await current(); if (!m) throw Error('这条消息已不存在');
      const paid = api.drawQuote?.().free === false, ask = api.paidPrompt?.();
      if (paid && ask && !await ctx.confirm(ask.title, ask.text)) return false;
      if (tags !== undefined) await api.updateChatMessage(id, mid, {imageTags: tags});
      await api.chatDrawPhoto(id, mid, paid);
    };
    // 改提示词再画 the way the story's pictures are: 看中文, and saying in words how to change it.
    const rewrite = async () => {
      const m = await current(); if (!m) throw Error('这条消息已不存在');
      const tags = await editTags({doc: ctx.doc, text: m.imageTags || '', ask: (text, mode, wish) => api.tagText ? api.tagText(text, mode, wish) : Promise.reject(Error('看中文和改要在酒馆里用')),
        about: '这张照片用的英文 tag。改了以后重画也用它；之前画的几版还在，可以左右滑着比。'});
      if (!tags?.trim()) return false;
      await draw(tags.trim());
    };
    let viewer;
    const safe = fn => async i => { viewer?.close(); try { return await fn(i); } catch (error) { ctx.notify(error.message, {error: true}); return false; } };
    const heart = await viewerHeart(api, i => versions[i].photoId, ctx.notify);
    if (v.disposed || threadId !== id) return;
    viewer = openImageViewer({doc: ctx.doc, from: img, caption: message.text || '',
      gallery: {items: versions.map(v => ({src: v.src, alt: message.text || '', info: v.photo.info})), index: Math.max(0, versions.findIndex(v => v.photoId === message.photoId)),
        onIndex: i => api.updateChatMessage(id, mid, {photoId: versions[i].photoId}).catch(error => ctx.notify(error.message))},
      actions: [heart, downloadAction(ctx.doc, i => ({source: versions[i].photo.blob, name: versions[i].photo.name}), ctx.notify),
        ...(message.imageTags && api.chatDrawPhoto ? [
          {label: '重画', run: safe(() => draw())},
          {label: '改提示词再画', run: safe(rewrite)},
          {label: '在绘图中打开', run: safe(async i => { const m = await current(); if (m) ctx.openDraw({...request(m), seed: Number(versions[i].photo.info?.find(row => row[0] === '种子')?.[1])}); })}
        ] : []),
        {label: '删除这版', danger: true, run: safe(async i => { if (!await ctx.confirm('删除这版图片？')) return false; await api.deletePhoto(versions[i].photoId); })},
        {label: '消息选项', run: safe(() => messageMenu(message))}]});
  }

  /** A picker's photos as small pictures (ui/thumbs.js), let go when the picker closes. */
  function pickerThumbs(d, rows) {
    const urls = [], imgs = new Map([...d.body.querySelectorAll('img[data-chat-photo]')].map(img => [img.dataset.chatPhoto, img]));
    d.onClose(() => { for (const url of urls) ctx.win.URL.revokeObjectURL(url); });
    eachThumb(api, rows.filter(r => imgs.has(r.id)), (id, blob) => { const url = ctx.win.URL.createObjectURL(blob); urls.push(url); imgs.get(id).src = url; }, () => d.live).catch(() => {});
  }
  // Album photos sent in the chat; each picture is read once and kept while the app is open. A bubble shows the photo's
  // middle-sized picture once one was made (ui/thumbs.js); the viewer, downloads and the chat background the photo itself.
  async function photoURL(id) {
    if (!photoURLs.has(id)) {
      const photo = await api.getPhoto(id);
      photoURLs.set(id, photo ? ctx.win.URL.createObjectURL(photo.blob) : '');
    }
    return photoURLs.get(id);
  }
  async function bubbleURL(id) {
    if (!bubbleURLs.has(id)) {
      const blob = await previewBlob(api, id);
      bubbleURLs.set(id, blob ? ctx.win.URL.createObjectURL(blob) : await photoURL(id));
    }
    return bubbleURLs.get(id);
  }
  /** Stickers that are photos of the album: the picture itself (a GIF keeps moving), wherever they are drawn. */
  function paintStickers(root = v.root) {
    for (const img of root.querySelectorAll('img[data-sticker-photo]:not([src])')) photoURL(img.dataset.stickerPhoto).then(url => { if (url && img.isConnected) img.src = url; }).catch(() => {});
  }
  async function paintPhotos() {
    paintStickers();
    // A photo seen before comes with the page, in the place it had: scrolled back up a chat, a new message would otherwise throw the page out of where it was.
    for (const img of v.root.querySelectorAll('img[data-chat-photo]')) {
      const id = img.dataset.chatPhoto, url = await bubbleURL(id);
      if (!img.isConnected) continue;
      if (!url) { img.closest('.chat-photo')?.classList.add('missing'); continue; }
      if (img.getAttribute('src') === url) continue;
      img.addEventListener('load', () => { if (img.offsetWidth && img.offsetHeight) photoSizes.set(id, `width:${img.offsetWidth}px;height:${img.offsetHeight}px`); }, {once: true});
      img.src = url;
    }
  }

  // Leaving a list (消息 or 联系人) for a chat, a profile or a form remembers where it was; coming back to the same tab puts it there again.
  let shownMode = 'list', left = null;
  function render(again = false) {
    const ticket = ++epoch;
    if (shownMode === 'list' && mode !== 'list') left = {tab, top: v.root.scrollTop};
    const back = shownMode !== 'list' && mode === 'list' && left?.tab === tab ? left.top : null;
    shownMode = mode;
    v.root.classList.toggle('chat-mode', mode === 'thread');
    v.root.classList.toggle('qq-mode', mode === 'list');
    if (mode !== 'thread') { petsLayer.detach();  }
    if (mode === 'thread') return renderThread(ticket, again);
    if (mode === 'profile') return renderProfile(ticket);
    if (mode === 'me') return renderMe();
    if (mode === 'contact-edit') return renderContactForm();
    if (mode === 'friends') return renderFriends(ticket);
    const done = tab === 'contacts' ? renderContactsTab(ticket) : tab === 'moments' ? counts().then(() => { if (ticket === epoch) return moments.render(); }) : renderMessages(ticket);
    return back === null ? done : Promise.resolve(done).then(() => { if (ticket === epoch) v.root.scrollTop = back; });
  }
  /** at: a message to show in it (from a search), not the latest. */
  function open(id, at = null) {
    threadId = id; mode = 'thread'; selecting = null; stick = !at; jump = at; panel = null; quote = null; drawn.thread = null;
    return render();
  }

  // ---------- Sending ----------
  /** Puts the user's messages in the chat. Nothing goes to the model until the user asks for a reply. */
  async function post(messages) {
    stick = true;
    failed.delete(threadId);
    const asked = asks;
    await api.appendChat(threadId, messages, {read: true});
    // 自动回复: the user's own words (not a letter, which takes its time) set the clock going — unless a reply was asked
    // for by hand while they were being kept.
    if (asked === asks && messages.some(m => m.from === 'me' && !['system', 'letter'].includes(m.kind)) && !thread?.watch) scheduleAuto(threadId);
  }
  // ---------- 自动回复 (0.9.36, off unless turned on in 聊天设置) ----------
  // A few seconds after the user's last message — and no typing since — the other side answers by itself. Asking for a
  // reply by hand (the bubble, a game) takes its place.
  const AUTO_WAIT = 4000;
  let autoTimer = 0, autoFor = null, asks = 0;
  function scheduleAuto(id) {
    if (!live || api.getState().chat.autoReply !== true || !id) return;
    ctx.win.clearTimeout(autoTimer);
    autoFor = id;
    autoTimer = ctx.win.setTimeout(() => { const target = autoFor; autoFor = null; if (target && !api.chatTyping?.(target)) requestReply(target); }, AUTO_WAIT);
  }
  /** Typing again: the reply waits for the user to stop. */
  const holdAuto = () => { if (autoFor) scheduleAuto(autoFor); };
  async function send() {
    const el = v.root.querySelector('[data-field=draft]'), text = el?.value.trim();
    // An empty box asks the other side to reply to everything sent so far.
    if (!text) { if (live && el) requestReply(); return; }
    el.value = '';
    keepDraft(threadId, '');
    syncSend();
    const q = quote;
    quote = null;
    petsLayer.sent();
    await post([{from: 'me', kind: 'text', text, ...(q ? {quote: q} : {})}]);
  }
  /** Paper plane while there is text; 让对方回复 when the box is empty; 停止 while the reply is being written. */
  const sendButton = () => {
    const empty = !(draftOf(threadId)).trim(), group = thread?.type === 'group';
    if (empty && live && typing() && api.chatCancel) return btn('stop-reply', icon('stop'), 'round-button send stop', 'aria-label="停止回复" title="停止回复"');
    return empty
      ? btn('send', icon('bubble'), 'round-button send ask', `aria-label="让${group ? '群里' : '对方'}回复" title="让${group ? '群里' : '对方'}回复" ${live ? '' : 'disabled'}`)
      : btn('send', icon('send'), 'round-button send', 'aria-label="发送" title="发送"');
  };
  function syncSend() {
    const old = v.root.querySelector('.composer .send');
    if (!old) return;
    const next = sendButton();
    if (old.outerHTML === next) return;
    old.insertAdjacentHTML('afterend', next);
    old.remove();
  }
  function requestReply(id = threadId, again = false) {
    if (!live || !id) return;
    asks++;
    if (autoFor === id) { ctx.win.clearTimeout(autoTimer); autoFor = null; }
    failed.delete(id);
    const job = again ? api.chatReroll(id) : api.chatReply(id);
    if (mode === 'thread' && id === threadId) render();
    // 停止 is no failure; one that failed says why under the chat (the bubble asks again), or in a note when elsewhere.
    job.catch(error => {
      if (error?.name === 'AbortError' || v.disposed) return;
      failed.set(id, error?.message || '回复没有完成');
      if (mode === 'thread' && id === threadId) render(); else ctx.notify(error?.message || '回复没有完成');
    });
  }
  /** Runs a sheet's buttons: `handlers[action](button)`; errors become notices. */
  function sheet(title, html, handlers, options = {}) {
    const d = ctx.dialog(title, html, options);
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-action]');
      if (!b || !handlers[b.dataset.action]) return;
      e.preventDefault();
      ctx.win.Promise.resolve().then(() => handlers[b.dataset.action](b)).catch(error => ctx.notify(error.message));
    });
    return d;
  }
  const value = (d, key) => d.body.querySelector(`[data-field=${key}]`)?.value.trim() || '';
  const amountOf = text => {
    const n = Math.round(Number(String(text).replace(/[¥￥,，\s元]/g, '')) * 100) / 100;
    if (!Number.isFinite(n) || n < 0.01 || n > 200000) throw Error('请填写 0.01 到 200000 之间的金额');
    return n.toFixed(2);
  };

  async function sendPhoto() {
    const rows = await api.listPhotos();
    let chosen = null;
    const pieces = photoWall({api, win: ctx.win, tile: (r, url) => `<button data-action="pick-photo" data-id="${esc(r.id)}" aria-pressed="${chosen === r.id}" aria-label="选择 ${esc(r.name)}"><img decoding="async" data-photo="${esc(r.id)}" alt="${esc(r.name)}"${url ? ` src="${esc(url)}"` : ''}></button>`});
    const d = sheet('发送照片', `${pieces.html([{rows}], ' pick-photos')}
      ${rows.length ? '' : '<p class="help-copy">相册里还没有照片，可以直接从本地选一张。</p>'}
      <div class="actions"><label class="secondary file-button">${icon('import')}从本地选<input type="file" data-chat-file accept="image/png,image/jpeg,image/webp,image/avif,image/gif" aria-label="从本地选照片"></label></div>
      ${field('照片说明', input('caption', '', 'text', 'maxlength="200" placeholder="比如：下班路上的晚霞"'), '现在的模型看不到图片本身，只看得到这句说明，写清楚照片里有什么，对方才好接话。\n\n想让对方直接看图：用能识图的模型（比如 Gemini、Claude、GPT-4o 这类），并在酒馆的「AI 回复配置」里打开「发送内联媒体」；用小手机自己的文字连接时，只要模型能识图就行。')}
      <div class="actions">${btn('photo-send', icon('send') + '发送', 'primary', 'disabled')}</div>`, {
      'pick-photo': b => {
        chosen = b.dataset.id;
        for (const x of d.body.querySelectorAll('[data-action=pick-photo]')) x.setAttribute('aria-pressed', String(x === b));
        d.body.querySelector('[data-action=photo-send]').disabled = false;
      },
      'photo-send': async () => {
        if (!chosen) return;
        const caption = value(d, 'caption');
        d.close();
        await post([{from: 'me', kind: 'photo', photoId: chosen, text: caption}]);
      }
    });
    pieces.mount(d.body);
    d.onClose(() => pieces.stop());
    api.chatSeesPictures?.().then(yes => { const box = d.body.querySelector('[data-field=caption]'), info = box?.closest('.field')?.querySelector('.info'); if (!yes || !box) return; box.placeholder = '可以不写，对方看得到照片'; info?.setAttribute('data-help', '现在的模型能看图，对方会直接看到这张照片；说明可以不写，写了就当作你配的话。'); }).catch(() => {});
    d.body.addEventListener('change', e => {
      const file = e.target.closest('[data-chat-file]')?.files?.[0];
      if (!file) return;
      api.addPhoto({name: file.name, blob: file}).then(async photo => {
        const caption = value(d, 'caption');
        d.close();
        await post([{from: 'me', kind: 'photo', photoId: photo.id, text: caption}]);
      }).catch(error => ctx.notify(error.message));
    });
  }
  function sendPacket() {
    const d = sheet('发红包', `<div class="packet-sheet">${field('金额', input('amount', '6.66', 'text', 'inputmode="decimal" maxlength="9"'))}${field('祝福语', input('blessing', '', 'text', `maxlength="40" placeholder="${BLESSING}"`))}</div>
      <div class="actions">${btn('packet-send', '塞钱进红包', 'primary packet-go')}</div>`, {
      'packet-send': async () => {
        const amount = amountOf(value(d, 'amount')), text = value(d, 'blessing') || BLESSING;
        // Paid from the wallet; too little left says so and the sheet stays open.
        await api.sendPaid(threadId, {kind: 'redpacket', amount, text});
        d.close();
        stick = true;
      }
    });
  }
  function sendTransfer() {
    const d = sheet(`转账给${thread.members[0]}`, `${field('金额', input('amount', '', 'text', 'inputmode="decimal" maxlength="9" placeholder="0.00"'))}${field('备注', input('note', '', 'text', 'maxlength="40" placeholder="可以不填"'))}
      <div class="actions">${btn('transfer-send', '转账', 'primary')}</div>`, {
      'transfer-send': async () => {
        const amount = amountOf(value(d, 'amount')), text = value(d, 'note');
        await api.sendPaid(threadId, {kind: 'transfer', amount, text});
        d.close();
        stick = true;
      }
    });
  }
  function sendLocation() {
    const d = sheet('发送位置', `${field('地点', input('place', '', 'text', 'maxlength="100" placeholder="比如：学校后门的便利店"'))}${field('详细地址', input('detail', '', 'text', 'maxlength="200" placeholder="可以不填"'))}
      <div class="actions">${btn('location-send', icon('pin') + '发送', 'primary')}</div>`, {
      'location-send': async () => {
        const text = value(d, 'place');
        if (!text) throw Error('请填写地点');
        const detail = value(d, 'detail');
        d.close();
        await post([{from: 'me', kind: 'location', text, detail}]);
      }
    });
  }
  /** 分享歌: what is playing, a song of the 歌单, or any song typed in; it shows as a card they can play too. */
  async function shareSong() {
    const playing = (() => { try { const t = api.musicStatus?.()?.track; return t?.title && t.from !== 'bgm' ? t : null; } catch { return null; } })();
    const mine = (await api.listSongs?.().catch(() => []) || []).filter(x => x.title).slice(0, 60);
    const name = s => s.artist ? `${s.title} - ${s.artist}` : s.title;
    const row = (s, note = '') => `<button type="button" class="list-row" data-action="song-pick" data-title="${esc(s.title)}" data-artist="${esc(s.artist || '')}">${icon('music')}<span><strong>${esc(s.title)}</strong><small>${esc([s.artist, note].filter(Boolean).join(' · '))}</small></span></button>`;
    const d = sheet('分享歌', `${field('歌', input('song', playing ? name(playing) : '', 'text', 'maxlength="200" placeholder="歌名 - 歌手，比如：晴天 - 周杰伦"'))}${field('想说的话', input('note', '', 'text', 'maxlength="200" placeholder="可以不写"'))}
      <div class="actions">${btn('song-send', icon('send') + '发送', 'primary')}</div>
      ${playing || mine.length ? `<div class="pick-list">${playing ? row(playing, '正在听') : ''}${mine.map(s => row(s)).join('')}</div>` : '<p class="hint">「音乐」里的歌单和正在听的歌会列在这里；也可以直接写歌名。</p>'}`, {
      'song-pick': b => { const box = d.body.querySelector('[data-field=song]'); box.value = name({title: b.dataset.title, artist: b.dataset.artist}); box.focus(); },
      'song-send': async () => {
        const song = songOf(value(d, 'song'));
        if (!song.title) throw Error('写一下歌名');
        const text = value(d, 'note');
        d.close();
        await post([{from: 'me', kind: 'song', song, ...(text ? {text} : {})}]);
      }
    });
  }
  /** A song written in a chat: played once it has been sung, else its page, to read and sing. False when its draft has gone. */
  async function openWritten(song) {
    const draft = await api.getSongDraft?.(song.draft).catch(() => null);
    if (!draft) return false;
    const made = draft.songs.length ? (await api.listSongs().catch(() => [])).find(s => s.id === draft.songs.at(-1)) : null;
    if (made) { api.musicPlayList?.([made], 0, 'library').catch(error => ctx.notify(error.message, {error: true})); return true; }
    ctx.showSongDraft?.(song.draft);
    return true;
  }
  /** Someone in the chat writes a song: the text model writes it as them, and a card comes from them. It is sung from its page, and only then costs anything. */
  function writeSong() {
    const group = thread.type === 'group', remembered = api.getState().music.writing, id = threadId;
    const d = sheet('写首歌', `${group ? field('谁写', `<span class="select"><select data-field="who" aria-label="谁写">${thread.members.map(n => `<option value="${esc(n)}">${esc(shown(n))}</option>`).join('')}</select></span>`) : ''}
      ${field('写什么', textArea('about', '', 'rows="3" maxlength="2000" placeholder="比如：写写我们第一次见面那天。不填就让 TA 自己想"'))}
      ${field('语言', input('language', remembered.language, 'text', 'maxlength="200"'))}
      ${field('曲风', input('genre', remembered.genre, 'text', 'maxlength="200" placeholder="可以不填，TA 自己定"'))}
      <div class="actions">${btn('song-write', icon('send') + '让 TA 写', 'primary')}</div>
      <p class="hint">会调用一次文字模型。写好以后是一张歌卡，点开能看歌词、唱出来。</p>`, {
      'song-write': () => {
        if (!api.songWriteFor) throw Error('要在酒馆里打开小手机，才能让 TA 写');
        const form = {...remembered, who: group ? value(d, 'who') : thread.members[0], about: value(d, 'about'), language: value(d, 'language'), genre: value(d, 'genre')};
        d.close();
        ctx.notify(`${shown(form.who)}在写了，写好了会发过来`);
        api.songWriteFor(id, form).catch(error => ctx.notify(error.message, {error: true}));
      }
    });
  }
  // 拍一拍后缀 (0.9.36): theirs goes with the pat.
  const pat = name => { const suffix = api.getState().chat.patOf?.[ownKey(name)] || ''; return post([{from: 'me', kind: 'pat', target: name, ...(suffix ? {suffix} : {})}]); };
  function choosePat() {
    if (thread.type !== 'group') return pat(thread.members[0]);
    const d = sheet('拍一拍', `<div class="pick-list">${thread.members.map(n => `<button class="list-row" data-action="pat-one" data-name="${esc(n)}">${avatar(n, engine(n), 36)}<span><strong>${esc(n)}</strong></span>${icon('hand')}</button>`).join('')}</div>`, {
      'pat-one': async b => { d.close(); await pat(b.dataset.name); }
    });
  }
  const rollDice = () => post([{from: 'me', kind: 'dice', text: String(1 + Math.floor(Math.random() * 6))}]);
  /** 给表情包起名: the ones just brought in, each with its name in a box; 保存 keeps all the names at once. */
  function nameStickers(names) {
    const all = () => api.getState().chat.stickers || [], fresh = names.map(n => all().find(s => s.name === n)).filter(Boolean);
    if (!fresh.length) return;
    const d = ctx.dialog('给表情包起名', `<p class="help-copy">对方按名字挑着发，写清楚是什么表情，比如「开心」「委屈巴巴」。</p>
      <div class="sticker-names">${fresh.map((s, i) => `<label class="sticker-name">${stickerImg(s)}<input type="text" data-sticker-name="${i}" value="${esc(s.name)}" maxlength="20" aria-label="第 ${i + 1} 个的名字"></label>`).join('')}</div>
      <div class="actions">${btn('sticker-names-save', '保存', 'primary')}</div>`);
    paintStickers(d.body);
    d.body.addEventListener('click', e => {
      if (!e.target.closest('[data-action=sticker-names-save]')) return;
      const next = new Map(fresh.map((s, i) => [s.photoId, stickerName(d.body.querySelector(`[data-sticker-name="${i}"]`).value) || s.name]));
      const others = all().filter(s => !next.has(s.photoId)), taken = new Set(others.map(s => s.name)), renamed = [];
      for (const s of fresh) { let name = next.get(s.photoId), n = 2; while (taken.has(name)) name = stickerName(`${next.get(s.photoId)}${n++}`); taken.add(name); renamed.push({name, photoId: s.photoId}); }
      try { api.saveChatOptions({stickers: [...others, ...renamed]}); } catch (error) { ctx.notify(error.message, {error: true}); return; }
      d.close();
      if (panel === 'stickers') syncPanel();
      ctx.notify(`导入了 ${renamed.length} 个表情包`);
    });
  }

  // ---------- 群游戏 (0.9.34): cards in a group chat; the members play by the 群游戏 block of 系统提示词 ----------
  function gameHTML(m) {
    const g = m.game, mid = `data-mid="${esc(m.id)}"`, name = n => n === 'me' ? myName() : shown(n);
    // 小游戏对战 (0.9.35): the board; the user's cells can be tapped on the user's turn.
    if (BOARDS[g.type]) {
      const size = BOARDS[g.type].size, cells = cellsOf(g), last = g.moves.at(-1)?.at, line = new Set(g.line || []), mark = who => who === g.first ? 'x' : 'o';
      const mine = g.open && g.turn === 'me' && !typing();
      const state = g.winner === 'draw' ? '平局' : g.resigned ? `${g.resigned === 'me' ? '你' : name(g.resigned)}认输了` : g.winner ? (g.winner === 'me' ? '你赢了 🎉' : `${name(g.winner)}赢了`) : g.turn === 'me' ? '轮到你了' : `${name(g.them)}在想……`;
      return `<div class="game-card game-board" data-board="${esc(g.type)}"><span class="game-kind">${g.type === 'ttt' ? '⭕ 井字棋' : '⚫ 五子棋'}</span>`
        + `<div class="board-grid" style="--n:${size}" role="group" aria-label="${BOARDS[g.type].name}的棋盘">${cells.map((who, i) => `<button type="button" class="board-cell" data-action="board-cell" ${mid} data-at="${i}"${who ? ` data-mark="${mark(who)}"` : ''}${i === last ? ' data-last' : ''}${line.has(i) ? ' data-win' : ''} aria-label="${cellName(i, size)}${who ? ' ' + esc(who === 'me' ? '你的' : name(who) + '的') : ''}"${mine && !who ? '' : ' disabled'}></button>`).join('')}</div>`
        + `<span class="game-foot"><span>${esc(state)}</span>${g.open ? btn('board-resign', '认输', 'text-button', mid) : btn('board-again', '再来一局', 'text-button', mid)}</span></div>`;
    }
    if (g.type === 'vote') {
      const total = g.votes.length, mine = g.votes.find(x => x.from === 'me')?.option;
      return `<div class="game-card game-vote"><span class="game-kind">📊 投票</span><strong class="game-title">${esc(g.question)}</strong><div class="vote-opts">${g.options.map((o, i) => {
        const who = g.votes.filter(x => x.option === i), pct = total ? Math.round(who.length / total * 100) : 0;
        return `<button type="button" class="vote-opt" data-action="game-vote" ${mid} data-i="${i}" aria-pressed="${mine === i}"${g.open ? '' : ' disabled'} title="${esc(who.map(x => name(x.from) + (x.why ? '：' + x.why : '')).join('\n'))}"><i style="width:${pct}%"></i><span>${esc(o)}</span><small>${who.length} 票</small>${who.length ? `<em>${esc(who.map(x => name(x.from)).join('、'))}</em>` : ''}</button>`;
      }).join('')}</div><span class="game-foot">${total} 人投了${g.open ? '' : ' · 投票结束了'}${g.open ? btn('game-end', '结束投票', 'text-button', mid) : ''}</span></div>`;
    }
    if (g.type === 'truth') {
      // Just started (by its time, so the very first drawing of it already turns): the wheel turns once.
      const turning = m.from === 'me' && Date.now() - (m.at || 0) < 1500, pool = g.pool.slice(0, 10);
      return `<div class="game-card game-truth${turning ? ' spinning' : ''}"><span class="game-kind">🎲 真心话大冒险</span><span class="truth-wheel" aria-hidden="true" style="--n:${pool.length}">${pool.map((n, i) => `<i style="--i:${i}"${n === g.target ? ' class="hit"' : ''}>${esc(name(n).slice(0, 1))}</i>`).join('')}</span>`
        + `<strong class="game-title">转到了 ${esc(g.target === 'me' ? '你' : name(g.target))}${g.choice ? `：${g.choice}` : ''}</strong>`
        + (g.target === 'me' && !g.choice ? `<span class="game-acts">${btn('game-choice', '真心话', 'chip-button', `${mid} data-choice="真心话"`)}${btn('game-choice', '大冒险', 'chip-button', `${mid} data-choice="大冒险"`)}</span>` : '')
        + `<span class="game-foot">${btn('game-again', '再转一次', 'text-button', mid)}</span></div>`;
    }
    const shownEntries = g.entries.slice(-10), cut = g.entries.length - shownEntries.length;
    return `<div class="game-card game-chain"><span class="game-kind">🔗 ${CHAIN_MODES[g.mode]}</span>${cut ? `<small class="chain-more">前面还有 ${cut} 句</small>` : ''}<ol class="chain-list">${shownEntries.map(e => `<li><b>${esc(name(e.from))}</b><span>${esc(e.text)}</span></li>`).join('')}</ol>`
      + (g.loser ? `<span class="game-foot">${esc(g.loser === 'me' ? '你' : name(g.loser))}认输了</span>` : '')
      + (g.open ? `<span class="game-acts">${btn('game-chain', '接一句', 'chip-button', mid)}${btn('game-end', '结束', 'text-button', mid)}</span>` : g.loser ? '' : '<span class="game-foot">接龙结束了</span>') + '</div>';
  }
  /** 群游戏 from the + panel: which one. A card goes into the group and the group is asked to play (when it can answer). */
  function gameSheet() {
    const d = sheet('群游戏', `<div class="pick-list game-pick">
      <button type="button" class="list-row" data-action="g-vote"><span class="game-ico" aria-hidden="true">📊</span><span><strong>投票</strong><small>一个问题，几个选项</small></span></button>
      <button type="button" class="list-row" data-action="g-truth"><span class="game-ico" aria-hidden="true">🎲</span><span><strong>真心话大冒险</strong><small>转盘抽一个人，也可能是你</small></span></button>
      <button type="button" class="list-row" data-action="g-chain"><span class="game-ico" aria-hidden="true">🔗</span><span><strong>接龙</strong><small>成语接龙或故事接龙</small></span></button></div>`, {
      'g-vote': () => { d.close(); voteSheet(); },
      'g-truth': async () => { d.close(); await spin(); },
      'g-chain': () => { d.close(); chainSheet(); }
    });
  }
  async function startGame(game) {
    await post([{from: 'me', kind: 'game', game}]);
    requestReply();
  }
  function voteSheet() {
    let count = 2;
    const optionsHTML = () => Array.from({length: count}, (_, i) => input('vote-opt-' + i, '', 'text', `maxlength="${GAME_LIMITS.option}" placeholder="选项 ${i + 1}" data-vote-opt`)).join('');
    const d = sheet('发起投票', `${field('问题', input('vote-q', '', 'text', `maxlength="${GAME_LIMITS.question}" placeholder="比如：周末去哪玩？"`))}
      <div class="field"><span>选项</span><div class="vote-inputs" data-vote-inputs>${optionsHTML()}</div></div>
      <div class="actions">${btn('vote-more', icon('add') + '再加一个选项', 'text-button')}${btn('vote-go', '发起', 'primary')}</div>`, {
      'vote-more': () => {
        if (count >= GAME_LIMITS.options) { ctx.notify(`最多 ${GAME_LIMITS.options} 个选项`); return; }
        const box = d.body.querySelector('[data-vote-inputs]'), kept = [...box.querySelectorAll('input')].map(x => x.value);
        count++; box.innerHTML = optionsHTML();
        [...box.querySelectorAll('input')].forEach((x, i) => { x.value = kept[i] || ''; });
        box.querySelectorAll('input')[count - 1]?.focus();
      },
      'vote-go': async () => {
        const question = value(d, 'vote-q'), options = [...d.body.querySelectorAll('[data-vote-opt]')].map(x => x.value.trim()).filter(Boolean);
        if (!question) { ctx.notify('先写下要投什么'); return; }
        if (new Set(options).size < 2) { ctx.notify('至少两个不一样的选项'); return; }
        d.close();
        await startGame({type: 'vote', question, options: [...new Set(options)], votes: [], open: true});
      }
    });
  }
  /** 真心话大冒险: the wheel lands on someone of the group, the user too. */
  async function spin() {
    if (thread?.type !== 'group') return;
    const pool = [...thread.members, 'me'], target = pool[Math.floor(Math.random() * pool.length)];
    await post([{from: 'me', kind: 'game', game: {type: 'truth', pool, target, choice: ''}}]);
    requestReply();
  }
  function chainSheet() {
    let mode = 'idiom';
    const d = sheet('接龙', `<div class="segmented" role="group" aria-label="怎么接">${Object.entries(CHAIN_MODES).map(([k, t]) => `<button type="button" data-chain-mode="${k}" aria-pressed="${k === mode}">${t}</button>`).join('')}</div>
      ${field('第一句', input('chain-first', '', 'text', `maxlength="${GAME_LIMITS.entry}" placeholder="比如：一马当先"`))}
      <div class="actions">${btn('chain-go', '开始', 'primary')}</div>`, {
      'chain-go': async () => {
        const first = value(d, 'chain-first');
        if (!first) { ctx.notify(mode === 'idiom' ? '先写一个成语' : '先写故事的第一句'); return; }
        d.close();
        await startGame({type: 'chain', mode, entries: [{from: 'me', text: first}], open: true});
      }
    });
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-chain-mode]');
      if (!b) return;
      mode = b.dataset.chainMode;
      for (const x of d.body.querySelectorAll('[data-chain-mode]')) x.setAttribute('aria-pressed', String(x === b));
      d.body.querySelector('[data-field=chain-first]').placeholder = mode === 'idiom' ? '比如：一马当先' : '比如：那天放学，雨下得特别大';
    });
  }
  /** 接一句: the user's line on the 接龙, then the group goes on. */
  function chainLine(m) {
    const g = m.game, last = g.entries.at(-1);
    const d = sheet('接一句', `<p class="help-copy">接到：${esc(last.from === 'me' ? myName() : shown(last.from))}：${esc(last.text)}</p>${field(CHAIN_MODES[g.mode], input('chain-next', '', 'text', `maxlength="${GAME_LIMITS.entry}"`))}<div class="actions">${btn('chain-next-go', '接上', 'primary')}</div>`, {
      'chain-next-go': async () => {
        const text = value(d, 'chain-next');
        if (!text) return;
        d.close();
        await api.updateChatMessage(threadId, m.id, {game: {entries: [...g.entries, {from: 'me', text}]}});
        requestReply();
      }
    });
  }

  /** 小游戏对战 (0.9.35): 井字棋 or 五子棋 with the one of this private chat, and who goes first. */
  function playSheet() {
    if (thread?.type !== 'dm') return;
    const them = thread.members[0];
    let first = 'me';
    const d = sheet('小游戏', `<div class="segmented" role="group" aria-label="谁先下">${[['me', '我先'], ['them', `${shown(them)}先`]].map(([k, t]) => `<button type="button" data-play-first="${k}" aria-pressed="${k === first}">${esc(t)}</button>`).join('')}</div>
      <div class="pick-list game-pick">
      <button type="button" class="list-row" data-action="p-ttt"><span class="game-ico" aria-hidden="true">⭕</span><span><strong>井字棋</strong><small>三个连成一线就赢</small></span></button>
      <button type="button" class="list-row" data-action="p-gomoku"><span class="game-ico" aria-hidden="true">⚫</span><span><strong>五子棋</strong><small>九路棋盘，五个连成一线就赢</small></span></button></div>`, {
      'p-ttt': async () => { d.close(); await startBoard('ttt', first === 'me' ? 'me' : them); },
      'p-gomoku': async () => { d.close(); await startBoard('gomoku', first === 'me' ? 'me' : them); }
    });
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-play-first]');
      if (!b) return;
      first = b.dataset.playFirst;
      for (const x of d.body.querySelectorAll('[data-play-first]')) x.setAttribute('aria-pressed', String(x === b));
    });
  }
  async function startBoard(type, first) {
    if (thread?.type !== 'dm') return;
    await post([{from: 'me', kind: 'game', game: {type, them: thread.members[0], first, moves: []}}]);
    if (first !== 'me') requestReply();
  }
  // ---------- 慢递信件 (0.9.36) ----------
  const LETTER_SPANS = Object.freeze({day: ['明天', 1], three: ['三天后', 3], week: ['一周后', 7]});
  /** A letter to the one of this private chat, and when it should get there; TA writes back when it arrives. */
  function letterSheet() {
    if (thread?.type !== 'dm') return;
    const them = thread.members[0];
    let span = 'day';
    const d = sheet(`给${shown(them)}写信`, `<div class="letter-paper writing">${textArea('letter-text', '', `rows="10" maxlength="3000" placeholder="${esc(shown(them))}：\n\n……"`)}</div>
      <div class="field"><span>什么时候寄到</span><div class="segmented" role="group" aria-label="什么时候寄到">${Object.entries(LETTER_SPANS).map(([k, [label]]) => `<button type="button" data-letter-span="${k}" aria-pressed="${k === span}">${label}</button>`).join('')}</div></div>
      <div class="actions">${btn('letter-go', icon('mail') + '寄出', 'primary')}</div>`, {
      'letter-go': async () => {
        const text = value(d, 'letter-text');
        if (!text) { ctx.notify('先写点什么'); return; }
        d.close();
        await post([{from: 'me', kind: 'letter', letter: {text, arriveAt: Date.now() + LETTER_SPANS[span][1] * 86_400_000}}]);
        ctx.notify(`信寄出了，${LETTER_SPANS[span][0]}寄到。TA 收到会回信，回信也要过一阵才到。`);
      }
    });
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-letter-span]');
      if (!b) return;
      span = b.dataset.letterSpan;
      for (const x of d.body.querySelectorAll('[data-letter-span]')) x.setAttribute('aria-pressed', String(x === b));
    });
  }
  /** A letter read: one that came is opened (the first time it unfolds). tid: its chat; partner: who it is with. */
  async function letterView(m, {tid = threadId, partner = thread?.members[0], over = false} = {}) {
    const l = m.letter || {}, mine = m.from === 'me', first = !mine && !l.opened;
    if (first) await api.updateChatMessage(tid, m.id, {letter: {opened: true}}).catch(() => {});
    const d = sheet(mine ? `寄给${shown(partner)}的信` : `${shown(m.from)}的来信`, `<div class="letter-paper${first ? ' unfolding' : ''}"><p class="lp-meta">${esc(new Date(m.at).toLocaleDateString('zh-CN'))}${mine ? (l.arriveAt > Date.now() ? ` 寄出 · ${esc(remindLabel(l.arriveAt))} 寄到` : ' 寄出 · 已送到') : ' 收到'}</p><div class="lp-text">${esc(l.text || '')}</div></div>
      ${tid === threadId ? `<div class="actions">${btn('letter-menu', '消息选项', 'secondary')}</div>` : ''}`, {'letter-menu': () => { d.close(); messageMenu(m); }}, {over});
  }
  /** Every letter with someone (all of their private chats), the newest first, and the ones on their way to the user. */
  async function lettersSheet(name) {
    const threads = (await api.listThreads()).filter(t => t.type === 'dm' && t.members[0] === name), all = [];
    for (const t of threads) for (const m of (await api.getThread(t.id))?.messages || []) if (m.kind === 'letter') all.push({m, tid: t.id});
    all.sort((a, b) => b.m.at - a.m.at);
    const coming = threads.flatMap(t => t.post || []).sort((a, b) => a.arriveAt - b.arriveAt);
    const d = sheet(`和${shown(name)}的信`, (coming.length ? `<p class="hint letter-coming">${coming.map(c => `${esc(shown(name))}的回信在路上，${esc(remindLabel(c.arriveAt))} 寄到`).join('<br>')}</p>` : '')
      + (all.length ? `<div class="group">${all.map(({m, tid}) => `<button type="button" class="list-row" data-action="letter-read" data-tid="${esc(tid)}" data-mid="${esc(m.id)}">${icon('mail')}<span><strong>${m.from === 'me' ? '寄出' : '收到'} · ${esc(stamp(m.at))}</strong><small>${esc(String(m.letter.text).replace(/\s+/g, ' ').slice(0, 30))}</small></span>${icon('next')}</button>`).join('')}</div>`
        : `<p class="hint">还没有和 TA 通过信。在和 TA 的私聊里点「＋ → 写信」。</p>`), {
      'letter-read': async b => { const x = all.find(a => a.m.id === b.dataset.mid); if (x) await letterView(x.m, {tid: x.tid, partner: name, over: true}); }
    });
  }
  /** 衣柜 × 聊天 (0.9.35): clothes shown in a chat, all of it. */
  function outfitSheet(m) {
    const o = m.outfit || {}, owner = String(o.owner || '').replace(/^role:/, '');
    const d = sheet(o.name || '穿搭', `${o.photoId ? '<img class="outfit-photo" alt="">' : ''}<p class="help-copy">${esc(o.text || '')}</p>${o.owner && o.owner !== 'me' ? `<p class="hint">给${esc(shown(owner))}搭的</p>` : ''}
      <div class="actions">${btn('outfit-menu', '消息选项', 'secondary')}</div>`, {'outfit-menu': () => { d.close(); messageMenu(m); }});
    if (o.photoId) bubbleURL(o.photoId).then(url => { const img = d.body.querySelector('.outfit-photo'); if (img && url) img.src = url; }).catch(() => {});
  }

  // ---------- 聊天装扮 of one person (0.9.34): their bubbles (a set of 自定义气泡) and their background ----------
  const backgroundName = v => !v ? '' : v.startsWith('photo:') ? '相册照片' : BACKGROUNDS[v] || PREMIUM.background?.[v]?.[0] || v;
  function lookLine(name) {
    const chat = api.getState().chat, key = ownKey(name), set = bubbleSets().find(s => s.id === chat.bubbleOf?.[key]), bg = backgroundName(chat.bgOf?.[key]);
    return set || bg ? [set && `气泡：${set.name}`, bg && `背景：${bg}`].filter(Boolean).join(' · ') : '跟我的一样';
  }
  function personLookSheet(name) {
    const key = ownKey(name), look = bubbleLook();
    const draw = () => {
      const chat = api.getState().chat, sets = bubbleSets(), mine = chat.bubbleOf?.[key] || '', bg = chat.bgOf?.[key] || '', w = api.wallet();
      syncBubbleCss(ctx.doc, sets);
      const bgs = [...Object.entries(BACKGROUNDS), ...Object.entries(PREMIUM.background || {}).filter(([k]) => w.owned.includes('background:' + k)).map(([k, [l]]) => [k, l])];
      return groupTitle('聊天气泡') + `<div class="group bubble-sets">${[`<button type="button" class="list-row bubble-set-main" data-look-bubble="" aria-pressed="${!mine}"><span class="bubble-set-name"><strong>跟我的一样</strong></span></button>`,
        ...sets.map(s => `<button type="button" class="list-row bubble-set-main" data-look-bubble="${esc(s.id)}" aria-pressed="${mine === s.id}">${bubblePreview(s.id, look, {mini: true})}<span class="bubble-set-name"><strong>${esc(s.name)}</strong></span></button>`)].join('')}</div>`
        + (sets.length ? '' : '<p class="hint">还没有自定义的气泡：在「我 → 个性装扮 → 聊天气泡 → 自定义」里做一套。</p>')
        + groupTitle('聊天背景') + `<div class="deco-row"><button type="button" class="deco" data-look-bg="" data-background="" aria-pressed="${!bg}"><span class="deco-sample look-same" aria-hidden="true">${icon('person')}</span><span>跟我的一样</span></button>${bgs.map(([k, l]) => `<button type="button" class="deco" data-look-bg="${esc(k)}" data-background="${esc(k)}" aria-pressed="${bg === k}"><span class="deco-sample" aria-hidden="true">${sceneArt(k)}</span><span>${esc(l)}</span></button>`).join('')}<button type="button" class="deco" data-look-photo data-background="" aria-pressed="${bg.startsWith('photo:')}"><span class="deco-sample look-same" aria-hidden="true">${icon('image')}</span><span>相册照片</span></button></div>`;
    };
    const d = ctx.dialog(`和${shown(name)}聊天的装扮`, draw());
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-look-bubble], [data-look-bg], [data-look-photo]');
      if (!b) return;
      try {
        if (b.hasAttribute('data-look-photo')) { d.close(); await pickPersonPhoto(name); return; }
        if (b.hasAttribute('data-look-bubble')) api.saveChatOptions({bubbleOf: {[key]: b.dataset.lookBubble || null}});
        else api.saveChatOptions({bgOf: {[key]: b.dataset.lookBg || null}});
        d.body.innerHTML = draw();
        render();
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  async function pickPersonPhoto(name) {
    const rows = await api.listPhotos();
    if (!rows.length) throw Error('相册里还没有照片，先在相册里导入一张');
    const d = ctx.dialog(`选一张和${shown(name)}聊天的背景`, `<div class="photo-grid pick-photos">${rows.slice(0, 30).map(r => `<button data-bg-photo="${esc(r.id)}" aria-label="用 ${esc(r.name)} 当背景"><img data-chat-photo="${esc(r.id)}" alt="${esc(r.name)}"></button>`).join('')}</div>`);
    pickerThumbs(d, rows);
    d.body.addEventListener('click', e => {
      const id = e.target.closest('[data-bg-photo]')?.dataset.bgPhoto;
      if (!id) return;
      d.close();
      try { api.saveChatOptions({bgOf: {[ownKey(name)]: 'photo:' + id}}); render(); personLookSheet(name); } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }

  // ---------- 表情包 ----------
  /** A sticker's picture: an address on the web, or a photo of the album (painted with paintStickers). */
  const stickerImg = s => s.photoId ? `<img data-sticker-photo="${esc(s.photoId)}"${photoURLs.get(s.photoId) ? ` src="${esc(photoURLs.get(s.photoId))}"` : ''} alt="" draggable="false">` : `<img src="${esc(s.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false">`;
  /** Import (「名字URL, 名字URL」), look through, remove; the same text copies them out to share. */
  function manageStickers() {
    const list = () => api.getState().chat.stickers || [];
    const rows = () => list().length ? `<div class="sticker-manage">${list().slice().reverse().map(s => `<div class="sticker-row">${stickerImg(s)}<span><strong>${esc(s.name)}</strong><small>${esc(s.url || '从图片导入的，在相册「表情包」里')}</small></span>${btn('sticker-remove', icon('trash'), 'text-button', `data-name="${esc(s.name)}" aria-label="删除 ${esc(s.name)}"`)}</div>`).join('')}</div>` : '<p class="hint">还没有表情包。</p>';
    const d = ctx.dialog('表情包', `<p class="help-copy">粘贴「名字+图片网址」，一个一行或用逗号隔开，比如：<br><code>开心https://…/a.gif, 委屈https://…/b.png</code><br>名字中间别有空格；同名的会换成新的。对方也会按名字从里面挑着发。</p>
      ${field('导入', textArea('sticker-text', '', 'rows="4" placeholder="开心https://example.com/happy.gif, 生气https://example.com/angry.png"'))}
      <div class="actions">${btn('sticker-import', icon('import') + '导入', 'primary')}${btn('sticker-copy', icon('copy') + '复制全部', 'secondary')}</div>
      <div class="actions sticker-files"><label class="secondary file-button">${icon('image')}<span>从图片导入</span><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple data-sticker-files hidden></label></div>
      ${groupTitle('已有', `<small data-sticker-count>${list().length}</small>`)}<div data-sticker-list>${rows()}</div>
      <div class="actions">${btn('sticker-clear', icon('trash') + '清空表情包', 'danger')}</div>`);
    const redraw = () => { d.body.querySelector('[data-sticker-list]').innerHTML = rows(); d.body.querySelector('[data-sticker-count]').textContent = list().length; paintStickers(d.body); if (panel === 'stickers') syncPanel(); };
    paintStickers(d.body);
    // 从图片导入: into the album (相簿「表情包」), each named after its file; then one page to name them all.
    d.body.addEventListener('change', e => {
      const box = e.target.closest('[data-sticker-files]'), files = [...(box?.files || [])];
      if (!files.length) return;
      box.value = '';
      (async () => {
        if (files.length > 60) ctx.notify('一次最多导入 60 张，先导入前 60 张');
        const taken = new Set(list().map(s => s.name)), made = [];
        for (const [i, file] of files.slice(0, 60).entries()) {
          let name = stickerName(file.name.replace(/\.[^.]+$/, '')) || '表情', n = 2;
          while (taken.has(name)) name = stickerName(`${name.replace(/\d+$/, '')}${n++}`);
          taken.add(name);
          const ext = /gif/.test(file.type) ? 'gif' : /png/.test(file.type) ? 'png' : /webp/.test(file.type) ? 'webp' : 'jpg';
          const photo = await api.addPhoto({name: `表情包-我-${Date.now()}${i ? '-' + i : ''}.${ext}`, blob: file});
          made.push({name, photoId: photo.id});
        }
        api.saveChatOptions({stickers: [...list(), ...made]});
        redraw();
        nameStickers(made.map(s => s.name));
      })().catch(error => ctx.notify(error.message, {error: true}));
    });
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      e.preventDefault();
      (async () => {
        switch (b.dataset.action) {
          case 'sticker-import': {
            const box = d.body.querySelector('[data-field=sticker-text]'), found = parseStickers(box.value);
            if (!found.length) throw Error('没认出表情包：要写成「名字」紧跟「http 开头的图片网址」');
            const before = new Set(list().map(s => s.name));
            api.saveChatOptions({stickers: [...list(), ...found]});
            const fresh = found.filter(s => !before.has(s.name)).length;
            box.value = ''; redraw();
            ctx.notify(`导入了 ${found.length} 个表情包${found.length - fresh ? `（${found.length - fresh} 个同名的换成了新的）` : ''}`);
            break;
          }
          case 'sticker-copy': {
            const web = list().filter(s => s.url);
            if (!web.length) { ctx.notify(list().length ? '从图片导入的表情包在相册里，没有网址可以复制' : '还没有表情包'); break; }
            await copyText(ctx.win, web.map(s => s.name + s.url).join(',\n'));
            ctx.notify(web.length < list().length ? `已复制 ${web.length} 个（从图片导入的在相册里，没有网址）` : '已复制，可以发给别人导入');
            break;
          }
          case 'sticker-remove': api.saveChatOptions({stickers: list().filter(s => s.name !== b.dataset.name)}); redraw(); break;
          case 'sticker-clear':
            if (!list().length || !await ctx.confirm('清空表情包？', `${list().length} 个表情包都会删除（聊天里发过的还在）。`)) break;
            api.saveChatOptions({stickers: []}); redraw(); break;
        }
      })().catch(error => ctx.notify(error.message, {error: true}));
    });
  }
  function insertText(text) {
    const el = v.root.querySelector('[data-field=draft]');
    if (!el) return;
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + text.length;
    keepDraft(threadId, el.value);
    syncSend();
  }
  function deleteChar() {
    const el = v.root.querySelector('[data-field=draft]');
    if (!el?.value) return;
    el.value = [...el.value].slice(0, -1).join('');
    keepDraft(threadId, el.value);
    syncSend();
  }

  // ---------- Red packets and transfers ----------
  function openPacket(m) {
    const mine = m.from === 'me', opened = m.state === 'opened';
    const status = opened ? (m.openedBy === 'me' ? '已存入零钱' : `${esc(you(m.openedBy))} 已领取`) : mine ? '等对方领取' : '';
    const d = sheet(`${you(m.from)}的红包`, `<div class="packet-open${opened || mine ? ' shown' : ''}">${avatar(m.from === 'me' ? '我' : m.from, mine ? 'none' : engine(m.from), 54)}
      <p class="po-from">${esc(mine ? '你发出的红包' : m.from + ' 发出的红包')}</p><p class="po-wish">${esc(m.text || BLESSING)}</p>
      ${opened || mine ? `<p class="po-amount">¥${esc(m.amount)}</p><p class="po-state">${status}</p>` : btn('packet-open', '開', 'packet-coin', 'aria-label="拆开红包"')}</div>`, {
      'packet-open': async () => {
        d.close();
        await api.takeSent(threadId, m.id, true);
        ctx.notify(`领到 ¥${m.amount}，已存入零钱`);
      }
    });
  }
  function openTransfer(m) {
    const mine = m.from === 'me', waiting = m.state === 'sent';
    const state = {sent: mine ? '等对方收款' : '待你收款', accepted: mine ? '对方已收款' : '你已收款', returned: mine ? '对方已退还' : '你已退还'}[m.state];
    const settle = next => async () => {
      d.close();
      await api.takeSent(threadId, m.id, next === 'accepted');
      if (next === 'accepted') ctx.notify(`收下 ¥${m.amount}，已存入零钱`);
    };
    const d = sheet(mine ? '转账' : `${m.from}的转账`, `<div class="transfer-open"><span class="to-ico">${icon(waiting ? 'swap' : m.state === 'accepted' ? 'check' : 'undo')}</span><p class="po-state">${esc(state)}</p><p class="po-amount">¥${esc(m.amount)}</p>${m.text ? `<p class="po-wish">${esc(m.text)}</p>` : ''}</div>
      ${!mine && waiting ? `<div class="actions">${btn('transfer-accept', '收款', 'primary')}</div><div class="actions">${btn('transfer-return', '退还', 'text-button')}</div>` : ''}`, {
      'transfer-accept': settle('accepted'),
      'transfer-return': settle('returned')
    });
  }

  // ---------- 礼物 ----------
  /** The user picks a gift from the shop, pays for it from the wallet and sends it; it can go into the story too. */
  function sendGift() {
    const w = api.wallet(), gifts = api.shopCatalog().gifts;
    let picked = null;
    const d = sheet(`送礼物给${thread.members[0]}`, `<p class="wallet-line">${icon('wallet')}零钱 ¥${esc(yuan(w.balance))}</p>
      <div class="gift-grid">${gifts.map(g => `<button type="button" class="gift-item" data-action="gift-pick" data-id="${esc(g.id)}" aria-pressed="false"${g.price > w.balance ? ' data-short' : ''}><span class="gi-emoji" aria-hidden="true">${esc(g.emoji)}</span><strong>${esc(g.name)}</strong><small>¥${esc(yuan(g.price))}</small></button>`).join('')}</div>
      ${field('附言', input('note', '', 'text', 'maxlength="60" placeholder="可以不写"'))}
      ${toggle('bring', '带进剧情', false, '打开后，下一次正文回复会知道你送了这份礼物（和聊天里的「带进剧情」一样，用一次）。')}
      <div class="actions">${btn('gift-send', icon('gift') + '买下并送出', 'primary')}</div>
      <div class="actions">${btn('gift-shop', icon('shop') + '去商城加自己的礼物', 'text-button')}</div>`, {
      'gift-pick': b => { picked = b.dataset.id; for (const x of d.body.querySelectorAll('.gift-item')) x.setAttribute('aria-pressed', String(x === b)); },
      'gift-send': async () => {
        if (!picked) throw Error('先选一件礼物');
        const note = value(d, 'note'), bring = !!d.body.querySelector('[data-field=bring]')?.checked;
        const saved = await api.sendPaid(threadId, {kind: 'gift', giftId: picked, text: note});
        d.close();
        stick = true;
        const sent = saved?.messages?.findLast?.(m => m.from === 'me' && m.kind === 'gift');
        if (bring && sent) await api.chatBring(threadId, [sent.id]);
      },
      'gift-shop': () => { d.close(); openShop('gifts'); }
    });
  }
  function openGift(m) {
    const mine = m.from === 'me', waiting = m.state === 'sent', g = m.gift || {};
    const state = {sent: mine ? '等对方收下' : '要收下吗？', accepted: mine ? '对方收下了' : '你收下了', returned: mine ? '对方退还了，钱已退回零钱' : '你退还了'}[m.state] || '';
    const d = sheet(mine ? '你送的礼物' : `${m.from}送的礼物`, `<div class="gift-open"><span class="go-emoji" aria-hidden="true">${esc(g.emoji || '🎁')}</span><p class="go-name">${esc(g.name)}</p>${mine && g.price ? `<p class="po-amount">¥${esc(yuan(g.price))}</p>` : ''}${m.text ? `<p class="po-wish">${esc(m.text)}</p>` : ''}<p class="po-state">${esc(state)}</p></div>
      ${!mine && waiting ? `<div class="actions">${btn('gift-accept', '收下', 'primary')}</div><div class="actions">${btn('gift-return', '退还', 'text-button')}</div>` : ''}`, {
      'gift-accept': async () => { d.close(); await api.takeSent(threadId, m.id, true); ctx.notify(`收下了「${g.name}」，在钱包的「收到的礼物」里`); },
      'gift-return': async () => { d.close(); await api.takeSent(threadId, m.id, false); }
    });
  }

  // ---------- 钱包 and 商城 ----------
  const when = at => { if (!at) return ''; const t = new Date(at); return `${t.getMonth() + 1}月${t.getDate()}日 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
  function openWallet() {
    const w = api.wallet(), kinds = api.shopCatalog().ledgerKinds;
    const d = sheet('钱包', `<div class="wallet-card"><small>零钱</small><strong>¥${esc(yuan(w.balance))}</strong><span>领到的红包、收下的转账存进来；发红包、转账、买装扮和礼物从这里出。</span></div>
      <div class="actions">${btn('wallet-shop', icon('shop') + '去商城', 'secondary')}</div>
      ${groupTitle('收到的礼物')}${w.received.length ? `<div class="gift-grid received">${w.received.map(r => `<div class="gift-item"><span class="gi-emoji" aria-hidden="true">${esc(r.emoji)}</span><strong>${esc(r.name)}</strong><small>${esc(r.from)} 送的</small></div>`).join('')}</div>` : '<p class="hint">还没有收到礼物。角色送的礼物，点开收下就会放在这里。</p>'}
      ${groupTitle('明细')}${w.ledger.length ? `<div class="group">${newest(w.ledger).slice(0, 5).map(e => ledgerRow(e, kinds)).join('')}${w.ledger.length > 5 ? `<button type="button" class="list-row" data-action="wallet-all"><span><strong>全部明细</strong><small>${w.ledger.length} 条，按月分开</small></span>${icon('next')}</button>` : ''}</div>` : '<p class="hint">还没有收支。</p>'}`, {
      'wallet-shop': () => { d.close(); openShop(); },
      'wallet-all': () => ledgerSheet(w.ledger, kinds)
    });
  }
  // 明细 (0.9.47): the wallet shows the five newest; the whole list is by month, each with what came in and went out,
  // drawn a few months at a time.
  const newest = list => list.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const ledgerRow = (e, kinds) => `<div class="setting-row ledger-row"><span><strong>${esc(kinds[e.kind] || e.kind)}${e.who ? ' · ' + esc(e.who) : ''}</strong><small>${esc([e.note, when(e.at)].filter(Boolean).join(' · '))}</small></span><b class="${e.amount > 0 ? 'in' : 'out'}">${e.amount > 0 ? '+' : '−'}¥${esc(yuan(Math.abs(e.amount)))}</b></div>`;
  function ledgerSheet(ledger, kinds) {
    const months = [];
    for (const e of newest(ledger)) {
      const t = new Date(e.at || 0), key = `${t.getFullYear()}-${t.getMonth()}`;
      let m = months.at(-1);
      if (m?.key !== key) months.push(m = {key, title: t.getFullYear() === new Date().getFullYear() ? `${t.getMonth() + 1}月` : `${t.getFullYear()}年${t.getMonth() + 1}月`, list: [], inn: 0, out: 0});
      m.list.push(e); if (e.amount > 0) m.inn += e.amount; else m.out -= e.amount;
    }
    let shown = 0;
    const d = sheet('全部明细', '', {'ledger-more': () => draw()}, {over: true});
    function draw() {
      const next = [];
      for (let n = 0; shown < months.length && (n < 40 || !next.length); shown++) { next.push(months[shown]); n += months[shown].list.length; }
      d.body.querySelector('[data-action=ledger-more]')?.remove();
      d.body.insertAdjacentHTML('beforeend', next.map(m => `<div class="ledger-month"><h3>${esc(m.title)}</h3><small>收入 ¥${esc(yuan(m.inn))} · 支出 ¥${esc(yuan(m.out))}</small></div><div class="group">${m.list.map(e => ledgerRow(e, kinds)).join('')}</div>`).join('')
        + (shown < months.length ? btn('ledger-more', '看更早的', 'text-button') : ''));
    }
    draw();
  }
  /** A decoration as it looks: the same sample the 个性装扮 chips use. */
  const decoSample = (kind, key) => `<span class="deco-sample" aria-hidden="true">${kind === 'frame' ? `<span class="me-av" style="--s:36px"><span class="avatar none" style="--s:36px"></span>${pendant(key)}</span>` : kind === 'background' ? sceneArt(key) : ''}</span>`;
  function openShop(start = 'decor') {
    let tab = start;
    const d = sheet('商城', '', {
      'shop-tab': b => { tab = b.dataset.tab; draw(); },
      // Two taps to buy: the first one asks, the second one pays.
      'shop-buy': async b => {
        if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = '再点一下买下'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = b.dataset.label; } }, 3000); return; }
        await api.buyDecoration(b.dataset.kind, b.dataset.key);
        ctx.notify('买下了，在「我」的个性装扮里换上');
        draw();
      },
      'shop-wear': async b => { api.saveChatOptions({profile: {[b.dataset.kind]: b.dataset.key}}); ctx.notify('换上了'); draw(); render(); },
      'gift-new': () => { d.close(); editGift(null); },
      'gift-edit': b => { d.close(); editGift(api.wallet().gifts.find(g => g.id === b.dataset.id)); },
      'gift-delete': async b => {
        if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = '再点删除'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = '删除'; } }, 3000); return; }
        api.deleteGift(b.dataset.id); draw();
      }
    });
    function draw() {
      if (!d.live) return;
      const w = api.wallet(), c = api.shopCatalog(), p = profile();
      const decor = Object.entries(c.premium).map(([kind, items]) => groupTitle(c.kinds[kind]) + `<div class="shop-grid">${Object.entries(items).map(([key, [name, price]]) => {
        const owned = w.owned.includes(kind + ':' + key), wearing = p[kind] === key, label = `¥${price} 买下`;
        return `<div class="deco shop-deco premium" data-${kind}="${esc(key)}">${decoSample(kind, key)}<span>${esc(name)}</span>${owned ? (wearing ? '<small class="deco-price">使用中</small>' : btn('shop-wear', '换上', 'chip-button', `data-kind="${kind}" data-key="${esc(key)}"`)) : btn('shop-buy', label, 'chip-button', `data-kind="${kind}" data-key="${esc(key)}" data-label="${label}"${price > w.balance ? ' data-short' : ''}`)}</div>`;
      }).join('')}</div>`).join('');
      const gifts = `<div class="gift-grid">${c.gifts.map(g => `<div class="gift-item${g.own ? ' own' : ''}"><span class="gi-emoji" aria-hidden="true">${esc(g.emoji)}</span><strong>${esc(g.name)}</strong><small>¥${esc(yuan(g.price))}</small>${g.note ? `<small class="gi-note">${esc(g.note)}</small>` : ''}${g.own ? `<span class="gi-tools">${btn('gift-edit', '改', 'text-button', `data-id="${esc(g.id)}"`)}${btn('gift-delete', '删除', 'text-button', `data-id="${esc(g.id)}"`)}</span>` : ''}</div>`).join('')}</div>
        <div class="actions">${btn('gift-new', icon('add') + '自定义礼物', 'secondary')}</div><p class="hint">送礼物：在私聊里点「+」→「礼物」。</p>`;
      d.body.innerHTML = `<p class="wallet-line">${icon('wallet')}零钱 ¥${esc(yuan(w.balance))}</p><div class="segmented" style="margin:0 0 10px">${[['decor', '装扮'], ['gifts', '礼物']].map(([k, l]) => `<button data-action="shop-tab" data-tab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>${tab === 'gifts' ? gifts : decor}`;
    }
    draw();
  }
  /** A gift of the user's own: name, emoji, price and a line about it. */
  function editGift(gift) {
    const g = gift || {name: '', emoji: '🎁', price: 20, note: ''};
    const d = sheet(gift ? '改礼物' : '自定义礼物', `${field('名字', input('gift-name', g.name, 'text', 'maxlength="20" placeholder="比如：手写贺卡、演唱会门票"'))}
      ${field('图标', input('gift-emoji', g.emoji, 'text', 'maxlength="4" placeholder="一个表情，比如 🎫"'))}
      ${field('价格（元）', input('gift-price', g.price, 'text', 'inputmode="decimal" maxlength="8"'))}
      ${field('说明', input('gift-note', g.note, 'text', 'maxlength="60" placeholder="可以不写"'))}
      <div class="actions">${btn('gift-save', '保存', 'primary')}</div>`, {
      'gift-save': async () => {
        const price = Number(value(d, 'gift-price').replace(/[¥￥,，\s元]/g, ''));
        if (!Number.isFinite(price) || price < 0 || price > 99999) throw Error('价格填 0 到 99999');
        api.saveGift({id: gift?.id, name: value(d, 'gift-name'), emoji: value(d, 'gift-emoji'), price, note: value(d, 'gift-note')});
        d.close();
        openShop('gifts');
      }
    });
  }

  // ---------- 角色专属表情包 (0.9.33): drawn for a role or picked from the album; only that role sends them ----------
  const ownStickers = name => api.getState().chat.roleStickers?.[ownKey(name)] || [];
  const keepStickers = (name, list) => api.saveChatOptions({roleStickers: {[ownKey(name)]: list}});
  function roleStickersSheet(name) {
    const draw = () => {
      const list = ownStickers(name);
      return (list.length ? `<div class="role-stickers">${list.map(s => `<button type="button" class="role-sticker" data-sticker="${esc(s.name)}" aria-label="${esc(s.name)}"><img data-chat-photo="${esc(s.photoId)}" alt="" draggable="false"><span>${esc(s.name)}</span></button>`).join('')}</div>`
        : `<p class="hint">还没有。画好或挑好以后，和${esc(shown(name))}聊天时 TA 会自己发这些。</p>`)
        + `<div class="actions">${btn('rs-draw', icon('paint') + '画一套', 'primary')}${btn('rs-album', icon('album') + '从相册加', 'secondary')}</div>`;
    };
    const d = ctx.dialog(`${shown(name)}的表情包`, draw());
    const paint = () => { for (const img of d.body.querySelectorAll('img[data-chat-photo]')) bubbleURL(img.dataset.chatPhoto).then(url => { if (url && img.isConnected) img.src = url; }).catch(() => {}); };
    paint();
    d.body.addEventListener('click', async e => {
      const tile = e.target.closest('[data-sticker]'), action = e.target.closest('[data-action]')?.dataset.action;
      try {
        if (action === 'rs-draw') { d.close(); await drawStickers(name); return; }
        if (action === 'rs-album') { d.close(); await stickerFromAlbum(name); return; }
        if (!tile) return;
        const s = ownStickers(name).find(x => x.name === tile.dataset.sticker);
        if (!s) return;
        const key = await menu(ctx, s.name, [{key: 'rename', icon: 'edit', label: '改名'}, {key: 'remove', icon: 'trash', label: '拿掉', danger: true}]);
        if (key === 'rename') await nameSticker(name, s.photoId, s.name);
        else {
          if (key === 'remove') { keepStickers(name, ownStickers(name).filter(x => x.name !== s.name)); ctx.notify('拿掉了，图片还在相册里'); }
          roleStickersSheet(name);
        }
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** 画一套: the moods picked (the first six they do not have yet), how they should look; one picture after another. */
  async function drawStickers(name) {
    if (api.drawReady && !api.drawReady()) { ctx.notify(api.drawMissing?.() || '还没有设置绘图引擎', {error: true}); return; }
    if (!api.drawRoleSticker) { ctx.notify('在酒馆里打开小手机时才能画', {error: true}); return; }
    const have = new Set(ownStickers(name).map(s => s.name)), chosen = new Set(STICKER_MOODS.map(m => m[0]).filter(m => !have.has(m)).slice(0, 6));
    const d = ctx.dialog(`给${shown(name)}画表情包`, `<div class="deco-row rs-moods">${STICKER_MOODS.map(([m]) => `<button type="button" class="status-chip" data-mood="${esc(m)}" aria-pressed="${chosen.has(m)}">${esc(m)}${have.has(m) ? '<small>已有</small>' : ''}</button>`).join('')}</div>
      ${field('画成什么样（选填）', input('rs-wish', '', 'text', 'maxlength="100" placeholder="比如：Q版、简笔画、厚涂"'))}
      <p class="hint">按角色 App 里${esc(shown(name))}的外貌，用绘图引擎一张一张画。</p><div class="actions">${btn('rs-go', `开始画 ${chosen.size} 张`, 'primary', chosen.size ? '' : 'disabled')}</div>`);
    const go = d.body.querySelector('[data-action=rs-go]');
    d.body.addEventListener('click', e => {
      const mood = e.target.closest('[data-mood]');
      if (mood) {
        if (chosen.has(mood.dataset.mood)) chosen.delete(mood.dataset.mood); else chosen.add(mood.dataset.mood);
        mood.setAttribute('aria-pressed', String(chosen.has(mood.dataset.mood)));
        go.disabled = !chosen.size; go.textContent = `开始画 ${chosen.size} 张`;
        return;
      }
      if (!e.target.closest('[data-action=rs-go]') || !chosen.size) return;
      // The sheet goes (a question about money would take its place anyway); how far it is shows on top.
      const wish = d.body.querySelector('[data-field=rs-wish]').value.trim(), list = [...chosen];
      d.close();
      drawBatch(name, list, wish).catch(error => ctx.notify(error.message, {error: true}));
    });
  }
  /** One picture after another; one that costs money only after a yes (asked once for them all). */
  async function drawBatch(name, list, wish) {
    let allowPaid = false, done = 0;
    try {
      for (const m of list) {
        ctx.notify(`在画「${m}」（${done + 1}/${list.length}）…`);
        for (;;) {
          try { await api.drawRoleSticker({name, mood: m, wish, allowPaid}); break; }
          catch (error) {
            if (error.code !== 'PAID' || allowPaid) throw error;
            const ask = api.paidPrompt();
            if (!await ctx.confirm(ask.title, `${ask.text}\n这次画 ${list.length} 张。`)) { if (done) roleStickersSheet(name); return; }
            allowPaid = true;
          }
        }
        done++;
      }
      ctx.notify(`画好了 ${done} 张，${shown(name)}聊天时会自己发`);
      roleStickersSheet(name);
    } catch (error) {
      ctx.notify(done ? `画好了 ${done} 张，后面的没画成：${error.message}` : error.message, {error: true});
      if (done) roleStickersSheet(name);
    }
  }
  /** 从相册加: a photo of the album as one of theirs, with a name the model writes. */
  async function stickerFromAlbum(name) {
    const rows = await api.listPhotos();
    if (!rows.length) throw Error('相册里还没有照片，先在相册里导入一张');
    const d = ctx.dialog(`选一张当${shown(name)}的表情包`, `<div class="photo-grid pick-photos">${rows.slice(0, 60).map(r => `<button data-sticker-photo="${esc(r.id)}" aria-label="用 ${esc(r.name)}"><img data-chat-photo="${esc(r.id)}" alt="${esc(r.name)}"></button>`).join('')}</div>`);
    pickerThumbs(d, rows);
    d.body.addEventListener('click', e => {
      const id = e.target.closest('[data-sticker-photo]')?.dataset.stickerPhoto;
      if (!id) return;
      d.close();
      nameSticker(name, id, '').catch(error => ctx.notify(error.message, {error: true}));
    });
  }
  /** Its name: what the model writes to send it (short; one of the same name is replaced). */
  async function nameSticker(name, photoId, old) {
    const d = ctx.dialog(old ? '改名' : '起个名字', `${field('名字', input('rs-name', old, 'text', 'maxlength="20" placeholder="比如：开心、晚安、比心"'))}<p class="hint">聊天时模型按这个名字发它，写清楚是什么表情。</p><div class="actions">${btn('rs-save', '保存', 'primary')}</div>`);
    d.body.addEventListener('click', e => {
      if (!e.target.closest('[data-action=rs-save]')) return;
      const label = stickerName(d.body.querySelector('[data-field=rs-name]').value);
      if (!label) { ctx.notify('写个名字', {error: true}); return; }
      const rest = ownStickers(name).filter(x => x.name !== old && x.name !== label);
      if (!old && rest.length >= ROLE_STICKER_LIMIT) { ctx.notify(`一个人最多 ${ROLE_STICKER_LIMIT} 个表情包`, {error: true}); return; }
      keepStickers(name, [...rest, {name: label, photoId}]);
      d.close();
      ctx.notify(old ? '改好了' : `加好了：「${label}」`);
      roleStickersSheet(name);
    });
  }

  // ---------- 合并转发 and 聊天长图 (0.9.33): what the multi-select does with the messages picked ----------
  const pickedMessages = () => thread.messages.filter(m => selecting?.has(m.id) && !LINE_KINDS.includes(m.kind));
  const chatTitle = t => t.type === 'group' ? `群聊「${t.name}」` : `${myName()}和${shown(t.members[0])}`;
  /** 转发: to a chat in use or someone without one yet; it arrives there as one record, from the user. */
  async function forwardPicked() {
    const picked = pickedMessages();
    if (!picked.length) return;
    const threads = await api.listThreads(), away = new Set(threads.filter(t => t.type === 'dm' && (t.friend?.by === 'me' || t.blocked)).map(t => t.members[0]));
    const recent = threads.filter(t => t.id !== threadId && currentWindow(threads, t)?.id === t.id && !(t.type === 'dm' && away.has(t.members[0])));
    const others = api.chatContacts().filter(c => !away.has(c.name) && !threads.some(t => t.type === 'dm' && t.members[0] === c.name));
    const row = (key, face, name, sub) => `<button type="button" class="list-row" data-forward="${esc(key)}">${face}<span><strong>${esc(name)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
    const d = ctx.dialog(`转发 ${picked.length} 条消息`, (recent.length ? groupTitle('最近聊天') + `<div class="group">${recent.map(t => row('t:' + t.id, threadAvatar(t, 38), t.type === 'group' ? t.name : shown(t.members[0]), t.type === 'group' ? `${t.members.length} 人的群` : '')).join('')}</div>` : '')
      + (others.length ? groupTitle('联系人') + `<div class="group">${others.map(c => row('c:' + c.name, avatar(c.name, c.engine, 38), shown(c.name), '')).join('')}</div>` : '')
      + (recent.length || others.length ? '' : '<p class="hint">还没有别的聊天可以转发。</p>'));
    d.body.addEventListener('click', async e => {
      const key = e.target.closest('[data-forward]')?.dataset.forward;
      if (!key) return;
      d.close();
      try {
        const name = key.startsWith('c:') ? key.slice(2) : '', to = name ? (currentDm(await api.listThreads(), name) || await api.createThread({type: 'dm', members: [name]})) : threads.find(t => t.id === key.slice(2));
        if (!to) return;
        const toName = to.type === 'group' ? to.name : shown(to.members[0]);
        if (!await ctx.confirm(`转发给${toName}？`, `${picked.length} 条消息会作为一条聊天记录发过去，${to.type === 'group' ? '群里的人' : 'TA'}能看到里面写了什么。`)) return;
        const items = picked.map(m => ({from: m.from === 'me' ? myName() : shown(m.from), text: forwardLine(m)})).filter(i => i.text.trim());
        await api.appendChat(to.id, [{from: 'me', kind: 'forward', title: `${chatTitle(thread)}的聊天记录`, items}], {read: true});
        selecting = null;
        render();
        ctx.notify(`转发给了${toName}，点这里去看看`, {tap: () => open(to.id)});
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** A record forwarded here: every line of it. */
  function forwardSheet(m) {
    const d = sheet(m.title, `<div class="fwd-record">${(m.items || []).map(i => `<div class="fwd-item"><strong>${esc(i.from)}</strong><p>${esc(i.text)}</p></div>`).join('')}</div>
      <div class="actions">${btn('fwd-menu', '消息选项', 'secondary')}</div>`, {'fwd-menu': () => { d.close(); messageMenu(m); }});
  }
  /** 长图: the picked messages as one picture of this chat as it looks; then to the album, shared or downloaded. */
  async function longImage() {
    const rows = [...v.root.querySelectorAll('.msgs > .msg[data-picked]')];
    if (!rows.length) return;
    // Drawing the picture holds the page for a few seconds on a phone: said first, and the note gets a frame to show.
    ctx.notify(`正在拼 ${rows.length} 条消息的长图……`);
    await new Promise(resolve => ctx.win.requestAnimationFrame(() => ctx.win.setTimeout(resolve, 0)));
    const blob = await chatLongImage(ctx.doc, {thread: v.root.querySelector('.chat-thread'), rows, title: chatTitle(thread)});
    selecting = null;
    render();
    const url = ctx.win.URL.createObjectURL(blob), stamp = new Date(), pad = n => String(n).padStart(2, '0');
    const name = `聊天长图-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`;
    const d = sheet('聊天长图', `<div class="shot-view"><img src="${esc(url)}" alt="聊天长图"></div>
      <div class="actions">${btn('shot-album', icon('album') + '存到相册', 'primary')}${canShareFiles(ctx.win) ? btn('shot-share', icon('share') + '分享', 'secondary') : btn('shot-save', icon('download') + '下载', 'secondary')}</div>`, {
      'shot-album': async () => { await api.addPhoto({name, blob}); d.close(); ctx.notify('存到相册了'); },
      'shot-share': async () => { await shareFile(ctx.doc, blob, name); },
      'shot-save': async () => { ctx.notify('已下载 ' + await saveFile(ctx.doc, blob, name)); }
    });
    d.onClose(() => ctx.win.URL.revokeObjectURL(url));
  }

  // ---------- Menus ----------
  function messageMenu(m) {
    const contact = m.from !== 'me', last = contact && thread.messages.at(-1)?.id === m.id;
    const copyable = ['text', 'voice', 'location', 'photo'].includes(m.kind) && quoteText(m);
    const canRecall = !contact && !['redpacket', 'transfer', 'gift'].includes(m.kind);
    const voice = m.kind === 'voice', open = voice && (voiceText().auto || transcribed.has(m.id));
    const mine = m.reactions?.find(r => r.from === 'me')?.emoji || '';
    // 0.9.47: like QQ — 回应 in a row (the six from 聊天设置 → 常用回应, then 「＋」 for any emoji), the actions as small
    // icons with a word under each, in a dark card pointing at the bubble.
    const quick = api.getState().chat.quickReactions || REACTIONS;
    const items = [
      copyable && ['copy', 'copy', '复制'], quotable(m) && !thread.watch && ['quote', 'reply', '引用'],
      voice && ['transcribe', 'book', open ? '收起文字' : '转文字'], voice && ['download', 'download', '下载'],
      voice && ctx.routeFor(m.from)?.voice && ['retake', 'refresh', '重新配音'], voice && canShareFiles(ctx.win) && ['share', 'share', '分享'],
      EDITABLE_KINDS.includes(m.kind) && ['edit', 'edit', '编辑'], ['pick-delete', 'check', '多选'], canRecall && ['recall', 'undo', '撤回'],
      last && live && !thread.watch && ['reroll', 'refresh', '重新回复'], ['delete', 'trash', '删除', 'danger']].filter(Boolean);
    const d = sheet('消息', `${thread.watch ? '' : `<div class="react-row" role="group" aria-label="回应">${quick.map(e => `<button type="button" data-action="react" data-emoji="${esc(e)}" aria-pressed="${mine === e}" aria-label="回应 ${esc(e)}">${esc(e)}</button>`).join('')}<button type="button" class="react-more" data-action="react-more" aria-label="更多表情">${icon('add')}</button></div>`}
      <div class="mp-grid" role="group" aria-label="操作">${items.map(([key, glyph, label, tone]) => `<button type="button" class="mp-item${tone ? ' ' + tone : ''}" data-action="${key}"><span class="mp-ico">${icon(glyph)}</span><span class="mp-label">${label}</span></button>`).join('')}</div>`, {
      react: async b => { d.close(); await api.updateChatMessage(threadId, m.id, {react: {from: 'me', emoji: b.dataset.emoji}}); },
      'react-more': async () => {
        d.close();
        const emoji = await pickEmoji(ctx, {title: '回应'});
        if (emoji) await api.updateChatMessage(threadId, m.id, {react: {from: 'me', emoji}});
      },
      transcribe: () => {
        d.close();
        if (open && voiceText().auto) { ctx.notify('语音自动转文字开着，可以在右上角「⋯ → 语音消息」里关掉'); return; }
        if (open) transcribed.delete(m.id); else transcribed.add(m.id);
        render();
      },
      download: async () => { d.close(); const {blob, name} = await api.audioFile({line: lineOf(m)}); ctx.notify('已下载 ' + await saveFile(ctx.doc, blob, name)); },
      // 重新配音: this message's audio made anew (and played), the rest of the reply as it was.
      retake: async () => { d.close(); await api.retakeVoice(lineOf(m)); },
      share: async () => { d.close(); const {blob, name} = await api.audioFile({line: lineOf(m)}); await shareFile(ctx.doc, blob, name); },
      quote: () => { d.close(); quote = {from: m.from, text: quoteText(m).slice(0, 200)}; panel = null; render(); },
      edit: () => { d.close(); editMessage(m); },
      copy: async () => { d.close(); ctx.notify(await copyText(ctx.win, m.kind === 'voice' ? m.text : quoteText(m)) ? '已复制' : '这个浏览器不让复制，可以长按文字手动复制'); },
      recall: async () => {
        d.close();
        if (m.kind === 'text') recalled.set(m.id, m.text);
        await api.updateChatMessage(threadId, m.id, {recall: true});
      },
      delete: async () => { d.close(); await api.deleteChatMessages(threadId, [m.id]); },
      // Picking like 带进剧情: this one first, then tap others or drag the bars (到最早 / 到最新 take in all on that side).
      'pick-delete': () => { d.close(); selecting = new Set(LINE_KINDS.includes(m.kind) ? [] : [m.id]); pickFor = 'delete'; panel = null; quote = null; render(); },
      reroll: async () => { d.close(); await reroll(); }
    });
    // Over the bubble when it is on the page (not when opened from another sheet: a letter, a forwarded record…).
    const row = [...v.root.querySelectorAll('.msg[data-mid]')].find(el => el.dataset.mid === m.id);
    popAt(d, row?.querySelector('.m-body > :not(.m-name):not(.m-reacts)') || row?.querySelector('.m-body'), {win: ctx.win, reduced: ctx.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches});
  }
  /** A message's words, the user's or a contact's: what the chat reads from here on. */
  function editMessage(m) {
    const voice = m.kind === 'voice', photo = m.kind === 'photo';
    const d = sheet(photo ? '编辑图片说明' : '编辑消息', `${field(voice ? '说的话' : photo ? '图片说明' : '内容', textArea('edit-text', m.text, `rows="${voice ? 3 : 6}" maxlength="4000"`))}
      ${voice ? field('译文', textArea('edit-translation', m.translation || '', 'rows="3" maxlength="4000"'), '改了说的话，下次播放会重新配音。') : ''}
      <div class="actions">${btn('edit-save', '保存', 'primary')}</div>`, {
      'edit-save': async () => {
        const text = value(d, 'edit-text');
        if (!text && !photo) { ctx.notify('消息不能是空的'); return; }
        await api.updateChatMessage(threadId, m.id, {text, ...(voice ? {translation: value(d, 'edit-translation')} : {})});
        d.close();
        ctx.notify('改好了');
      }
    });
  }
  // 重新回复这一轮: the host asks again and puts the new round in the old one's place only when it came (the old one stays
  // among the versions). A host without it: the contacts' latest messages go first, as before.
  async function reroll() {
    if (api.chatReroll) return requestReply(threadId, true);
    const list = thread.messages, cut = list.findLastIndex(m => m.from === 'me' && m.kind !== 'system');
    const drop = list.slice(cut + 1).filter(m => m.from !== 'me').map(m => m.id);
    if (drop.length) await api.deleteChatMessages(threadId, drop);
    requestReply();
  }
  /** 发起私聊: one row per contact; 发起群聊 (group): tick who comes in, a name if wanted. */
  /** watch (0.9.35): a 旁观群 — the user picks who is in it and only looks on; they start talking at once. */
  function newChat(group = false, watch = false) {
    const contacts = api.chatContacts();
    const d = ctx.dialog(watch ? '拉一个旁观群' : group ? '发起群聊' : '发起私聊', !contacts.length
      ? `<p class="help-copy">还没有联系人。在角色 App 里新增角色，或者手动添加一个联系人。</p><div class="actions">${btn('manage-contacts', icon('add') + '添加联系人', 'primary')}</div>`
      : group
      ? `<div class="pick-list">${contacts.map(c => `<label class="setting-row"><span>${avatar(c.name, c.engine, 28)}${esc(shown(c.name))}</span><input class="switch" type="checkbox" data-member="${esc(c.name)}" aria-label="拉 ${esc(c.name)} 进群"></label>`).join('')}</div>
        ${field('群名', input('group-name', '', 'text', 'maxlength="40" placeholder="可以不填"'))}<div class="actions">${btn('create-group', icon('group') + '建群', 'primary')}</div>`
      : `<div class="pick-list">${contacts.map(c => `<button class="list-row" data-new-dm="${esc(c.name)}">${avatar(c.name, c.engine, 36)}<span><strong>${esc(shown(c.name))}</strong><small>${c.source === 'role' ? (c.voice ? '角色 · 能发语音' : '角色 · 只发文字') : '手动联系人'}</small></span>${icon('next')}</button>`).join('')}</div>`);
    d.body.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      ctx.win.Promise.resolve().then(async () => {
        if (b.dataset.newDm) {
          const existing = currentDm(await api.listThreads(), b.dataset.newDm);
          const t = existing || await api.createThread({type: 'dm', members: [b.dataset.newDm]});
          d.close(); open(t.id);
        }
        if (b.dataset.action === 'create-group') {
          const members = [...d.body.querySelectorAll('[data-member]:checked')].map(x => x.dataset.member);
          const t = await api.createThread({type: 'group', members, name: d.body.querySelector('[data-field=group-name]').value, ...(watch ? {watch: true} : {})});
          d.close(); open(t.id);
          if (watch) requestReply(t.id);
        }
        if (b.dataset.action === 'manage-contacts') { d.close(); mode = 'list'; tab = 'contacts'; contactDraft = null; render(); }
      }).catch(error => ctx.notify(error.message));
    });
  }
  /**
   * 聊天窗口 with one contact or one group, like the tavern's chats: each its own messages and memory. A tap opens one
   * (and makes it the one in use: the list shows it, replies and calls go to it); 新开 starts an empty one; each can be
   * renamed or deleted. Deleting a contact's last one leaves the contact, without a chat; a group's last one, the group.
   */
  async function windowsSheet(base) {
    const group = base.type === 'group', name = base.members[0];
    const d = ctx.dialog(group ? `「${base.name}」的聊天窗口` : `和${shown(name)}的聊天窗口`, '<p class="hint">正在读取……</p>', {add: '新开一个窗口'});
    let swipe = null;
    const paint = async () => {
      const list = chatWindows(await api.listThreads(), base);
      if (!d.live) return;
      const when = at => at ? new Date(at).toLocaleString('zh-CN', {hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
      // A tap opens one; swiped left 改名 / 删除.
      d.body.innerHTML = `<div class="pick-list" data-window-list>${list.map((t, i) => swipeRow(t.id, `<div class="list-row">${icon(i === 0 ? 'check' : 'chat')}<span><strong>${esc(t.label || (t.last ? preview(t.last) : '空的窗口'))}</strong><small>${i === 0 ? '正在用 · ' : ''}${t.count} 条${t.last ? ' · ' + when(t.last.at) : ''}</small></span></div>`,
        [{key: 'rename', label: '改名', icon: 'edit'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}], {label: t.label || ''})).join('')}</div>`;
      swipe?.dispose();
      swipe = mountSwipeList(d.body.querySelector('[data-window-list]'), {ctx,
        onTap: id => run(async () => { d.close(); await api.updateThread(id, {open: true}); open(id); }),
        onAction: (key, id) => run(() => key === 'rename' ? rename(id) : drop(id))});
    };
    const run = task => ctx.win.Promise.resolve().then(task).catch(error => ctx.notify(error.message, {error: true}));
    const rename = async id => {
      const t = (await api.listThreads()).find(x => x.id === id);
      const r = ctx.dialog('窗口的名字', `${field('名字', input('window-label', t?.label || '', 'text', 'maxlength="40" placeholder="比如：第二周目、平行世界"'))}<div class="actions">${btn('window-label-save', '保存', 'primary')}</div>`);
      r.body.addEventListener('click', async ev => { if (!ev.target.closest('[data-action=window-label-save]')) return; await api.updateThread(id, {label: r.body.querySelector('[data-field=window-label]').value}); r.close(); render(); windowsSheet(base); });
    };
    const drop = async id => {
      const last = chatWindows(await api.listThreads(), base).length <= 1;
      if (!await ctx.confirm(last && group ? '删除这个群聊？' : '删除这个聊天窗口？', last && group ? '这是群里最后一个窗口，删掉后这个群就没有了。' : '这个窗口里的聊天记录和记忆会删掉，别的窗口不受影响。')) return windowsSheet(base);
      // Whether it was open is read first: a redraw after the delete leaves a missing chat for the list.
      const wasOpen = id === threadId;
      await api.deleteThread(id);
      const next = currentWindow(await api.listThreads(), base);
      if (!next && group) forgetGroupAvatar(base);
      if (wasOpen) { if (next) open(next.id); else { mode = 'list'; threadId = null; render(); } }
      else render();
      if (next) windowsSheet(base);
    };
    d.onClose(() => swipe?.dispose());
    // 「＋」 works at once, also before the list is read.
    d.overlay.addEventListener('click', e => {
      if (!e.target.closest('[data-sheet-add]')) return;
      run(async () => {
        d.close();
        const now = chatWindows(await api.listThreads(), base)[0] || base;
        const t = await api.createThread(group ? {type: 'group', members: now.members, name: now.name, windowOf: groupKey(base)} : {type: 'dm', members: [name]});
        open(t.id); ctx.notify('新开了一个聊天窗口');
      });
    });
    await paint();
  }
  /** Options for voice messages in every chat: what 转文字 shows, and whether it happens by itself. */
  /** options: {over} — on top of the sheet open now (聊天设置), which comes back when this one shuts. */
  function voiceTextSheet(options = {}) {
    const draw = () => {
      const o = voiceText();
      return `<p class="help-copy">语音消息平时只显示语音条，长按（电脑上右键）选「转文字」才显示文字。</p>
        <div class="field"><span>转文字显示</span><div class="segmented" style="margin:0">${[['translation', '中文译文'], ['original', '原文'], ['both', '原文和译文']].map(([k, l]) => `<button data-action="vt-mode" data-mode="${k}" aria-pressed="${o.mode === k}">${l}</button>`).join('')}</div></div>
        <div class="setting-row"><span>新旧语音都自动转文字</span><input class="switch" type="checkbox" data-field="vt-auto" aria-label="语音自动转文字" ${o.auto ? 'checked' : ''}></div>`;
    };
    const d = sheet('语音消息', `<div class="vt-body">${draw()}</div>`, {
      'vt-mode': b => { api.saveChatOptions({voiceText: {mode: b.dataset.mode}}); d.body.querySelector('.vt-body').innerHTML = draw(); render(); }
    }, options);
    d.body.addEventListener('change', e => {
      if (!e.target.matches('[data-field=vt-auto]')) return;
      try { api.saveChatOptions({voiceText: {auto: e.target.checked}}); render(); } catch (error) { ctx.notify(error.message); }
    });
  }
  /** Where an avatar comes from, in words. */
  function avatarState(key) {
    const chosen = api.getState().chat.avatars?.[ownKey(key)];
    if (chosen?.kind === 'photo') return '用的是相册里的照片';
    if (chosen?.kind === 'text') return '只显示文字';
    return avatarPicture(key) ? (key === 'me' ? '用的是酒馆里当前人设的头像' : '用的是酒馆角色卡的头像') : '只显示文字（酒馆里没有这个头像）';
  }
  /** Picks an avatar for the user ('me') or a contact: an album photo, a new picture, the tavern's avatar, or text. */
  async function avatarSheet(key, {title = '', reset = '用酒馆的头像'} = {}) {
    const rows = (await api.listPhotos()).slice(0, 30), who = key === 'me' ? '我' : key, store = ownKey(key), chosen = api.getState().chat.avatars?.[store];
    const d = ctx.dialog(title || `${who}的头像`, `<p class="help-copy">点一张照片，或者上传一张新的。</p>
      <label class="secondary file-button">${icon('import')}上传图片<input type="file" accept="image/*" data-avatar-file hidden></label>
      ${rows.length ? `<div class="photo-grid pick-photos">${rows.map(r => `<button data-avatar-photo="${esc(r.id)}" aria-label="用 ${esc(r.name)} 当头像"${chosen?.photoId === r.id ? ' aria-pressed="true"' : ''}><img data-chat-photo="${esc(r.id)}" alt=""></button>`).join('')}</div>` : '<p class="hint">相册里还没有照片。</p>'}
      <div class="actions">${btn('avatar-tavern', reset, 'secondary')}${btn('avatar-text', '只显示文字', 'text-button')}</div>`);
    pickerThumbs(d, rows);
    const choose = value => { d.close(); api.saveChatOptions({avatars: {[store]: value}}); ctx.notify('头像已换好'); };
    d.body.addEventListener('click', e => {
      const photo = e.target.closest('[data-avatar-photo]')?.dataset.avatarPhoto;
      if (photo) return choose({kind: 'photo', photoId: photo});
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'avatar-tavern') choose(null);
      if (action === 'avatar-text') choose({kind: 'text'});
    });
    d.body.addEventListener('change', e => {
      const file = e.target.closest('[data-avatar-file]')?.files?.[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { ctx.notify('请选择图片文件'); return; }
      api.addPhoto({name: file.name, blob: file}).then(photo => choose({kind: 'photo', photoId: photo.id})).catch(error => ctx.notify(error.message));
    });
  }
  /** 来电 options: characters calling by themselves (off by default), and how long a call rings. */
  function callsSheet(options = {}) {
    const o = () => api.getState().calls;
    const draw = () => `<div class="setting-row"><span>角色自己打来${help('角色可以给你打语音电话：接通后用 TA 的音色说话，你打字回。打开这里后，每隔几条正文回复，角色可能会自己打来；不打开时，聊天里角色偶尔也会直接打过来（聊天预设的「打电话」规则）。每句话都要调用一次模型并生成语音。')}</span><input class="switch" type="checkbox" data-field="call-auto" aria-label="角色自己打来" ${o().auto ? 'checked' : ''}></div>
      <div class="field"><span>每几条正文回复可能打来一次</span><input data-field="call-every" type="number" min="1" max="100" value="${o().every}"></div>
      <div class="field"><span>每天最多</span><input data-field="call-dailyMax" type="number" min="1" max="10" value="${o().dailyMax}"></div>
      <div class="field"><span>响铃多久算未接（秒）</span><input data-field="call-ring" type="number" min="15" max="60" value="${o().ring}"></div>
      <div class="setting-row"><span class="switch-label">通话声音像听筒${help('打开时，通话里的声音过一遍电话的窄频，像从听筒里传出来；关掉就是原本的声音，和语音缓存里的一样。')}</span><input class="switch" type="checkbox" data-field="call-effect" aria-label="通话声音像听筒" ${o().effect !== false ? 'checked' : ''}></div>`;
    const d = sheet('来电', `<div class="calls-body">${draw()}</div>`, {}, options);
    d.body.addEventListener('change', e => {
      const key = e.target.dataset.field?.replace(/^call-/, '');
      if (!key) return;
      try { api.saveCalls({[key]: key === 'auto' || key === 'effect' ? e.target.checked : Number(e.target.value)}); d.body.querySelector('.calls-body').innerHTML = draw(); } catch (error) { ctx.notify(error.message); }
    });
  }
  // ---------- Decorative companions: adoption and names ----------
  const petFace = (p, size = 40) => `<span class="pet-face" style="--s:${size}px${petStrip(p.kind) ? `;background-image:url(&quot;${petStrip(p.kind)}&quot;)` : ''}" aria-hidden="true"></span>`;
  function petsLine() { return pets().list.map(x => x.name).join('、') || '还没有宠物，领养一只吧'; }
  function petsSheet() {
    const d = sheet('我的宠物', '', {
      'pet-adopt': () => adoptSheet(() => paint(), {over: true}),
      'pet-card': x => petCard(x.dataset.id, () => paint(), {over: true})
    });
    function paint() {
      if (!d.live) return;
      const p = pets();
      d.body.innerHTML = (p.list.length ? `<div class="group">${p.list.map(x => `<button type="button" class="list-row pet-row" data-action="pet-card" data-id="${esc(x.id)}">${petFace(x)}<span><strong>${esc(x.name)}</strong><small>${esc(PET_KINDS[x.kind].name)}</small></span>${icon('next')}</button>`).join('')}</div>`
        : '<p class="hint">领养一只，让它陪你聊天：走走停停、玩小球，还会跑去看新消息。</p>')
        + `<div class="actions">${p.list.length < PET_LIMITS.pets ? btn('pet-adopt', icon('add') + '领养', 'primary') : ''}</div>`
        + `<div class="group pad">${toggle('pets-show', '在聊天里出现', p.show !== false, '点一下、双击或在身上来回摸摸，会有不同反应；也可以拖起来放到气泡上。它们会自己玩、贴贴、一起打盹。关掉后暂时藏起来。')}</div>`;
    }
    paint();
    d.body.addEventListener('change', e => { if (e.target.dataset.field === 'pets-show') { api.saveChatOptions({pets: {...pets(), show: e.target.checked}}); paint(); } });
  }
  function adoptSheet(done = () => {}, {over = false} = {}) {
    let kind = 'cat';
    const d = sheet('领养', `<div class="pet-kinds" role="group" aria-label="领养哪一种">${Object.entries(PET_KINDS).map(([k, x]) => `<button type="button" class="pet-kind" data-pet-kind="${k}" aria-pressed="${k === kind}">${petFace({kind: k}, 56)}<span>${esc(x.name)}</span></button>`).join('')}</div>
      ${field('名字', input('pet-name', '', 'text', `maxlength="${PET_LIMITS.name}" placeholder="比如：团子"`))}<div class="actions">${btn('pet-adopt-go', '带回家', 'primary')}</div>`, {
      'pet-adopt-go': () => {
        const p = pets();
        if (p.list.length >= PET_LIMITS.pets) { ctx.notify(`最多养 ${PET_LIMITS.pets} 只`); return; }
        const pet = adoptPet(kind, value(d, 'pet-name'));
        api.saveChatOptions({pets: {...p, list: [...p.list, pet]}});
        d.close();
        ctx.notify(`${pet.name}到家了，去聊天里看看它`);
        done();
      }
    }, {over});
    d.body.addEventListener('click', e => {
      const x = e.target.closest('[data-pet-kind]');
      if (!x) return;
      kind = x.dataset.petKind;
      for (const y of d.body.querySelectorAll('[data-pet-kind]')) y.setAttribute('aria-pressed', String(y === x));
    });
  }
  /** One companion: its name and adoption. */
  function petCard(id, done = () => {}, {over = false} = {}) {
    const find = () => pets().list.find(x => x.id === id);
    if (!find()) return;
    const d = sheet(find().name, '', {
      'pet-rename': () => {
        const r = sheet('改名字', `${field('名字', input('pet-rename', find()?.name || '', 'text', `maxlength="${PET_LIMITS.name}"`))}<div class="actions">${btn('pet-rename-go', '保存', 'primary')}</div>`, {
          'pet-rename-go': () => { const name = value(r, 'pet-rename'), p = pets(); if (!name) return; api.saveChatOptions({pets: {...p, list: p.list.map(y => y.id === id ? {...y, name} : y)}}); r.close(); paint(); done(); }
        }, {over: true});
      },
      'pet-release': async () => {
        const pet = find();
        if (!pet || !await ctx.confirm(`把${pet.name}送养？`, '送走就回不来了。')) return;
        const p = pets();
        api.saveChatOptions({pets: {...p, list: p.list.filter(y => y.id !== id)}});
        d.close(); done();
      }
    }, {over});
    function paint() {
      const pet = find();
      if (!d.live || !pet) return;
      d.overlay.querySelector('.sheet-header h2').textContent = pet.name;
      d.body.innerHTML = `<div class="pet-card">${petFace(pet, 80)}<p><strong>${esc(PET_KINDS[pet.kind].name)}</strong></p><p class="hint">点点、摸摸，或者拖起来玩。长按可以打开这张卡片。</p></div>`
        + `<div class="actions">${btn('pet-rename', icon('edit') + '改名字', 'secondary')}${btn('pet-release', '送养', 'danger')}</div>`;
    }
    paint();
  }
  // ---------- 聊天设置 (0.9.36): every switch of how the chats go, in one sheet (「我」 and a chat's 「⋯」 open it) ----------
  let settingsPaint = null;
  const settingsLine = () => { const c = api.getState().chat; return `自动回复${c.autoReply === true ? '开' : '关'} · 逐条显示${c.pace !== false ? '开' : '关'} · 语音、来电、正文和手机`; };
  /** 逐条显示回复 on or off (off: what waits to show shows at once). */
  function setPace(on) {
    api.saveChatOptions({pace: on});
    if (!on) { ctx.win.clearTimeout(pace.timer); pace.timer = 0; pace.queue = []; pace.hidden.clear(); render(); }
  }
  /** 常用回应 (0.9.47): the six 回应 a message's menu offers first. Tap one to take it off, 「＋」 for another. */
  function reactionsSheet(done = () => {}) {
    const d = sheet('常用回应', '', {
      'qr-drop': async b => { const list = (api.getState().chat.quickReactions || REACTIONS).filter(e => e !== b.dataset.emoji); api.saveChatOptions({quickReactions: list.length ? list : REACTIONS}); paint(); },
      'qr-add': async () => {
        const emoji = await pickEmoji(ctx, {title: '加一个常用回应', over: true});
        if (!emoji) return;
        const list = (api.getState().chat.quickReactions || REACTIONS).filter(e => e !== emoji);
        if (list.length >= 6) { ctx.notify('最多 6 个：先点掉一个'); return; }
        api.saveChatOptions({quickReactions: [...list, emoji]}); paint();
      },
      'qr-reset': () => { api.saveChatOptions({quickReactions: [...REACTIONS]}); paint(); }
    }, {over: true});
    function paint() {
      if (!d.live) return;
      const list = api.getState().chat.quickReactions || REACTIONS;
      d.body.innerHTML = `<p class="hint" data-keep-hint>长按消息时最先看到的 6 个回应。点一个去掉，点「＋」从全部表情里挑。</p>
        <div class="react-row qr-row">${list.map(e => `<button type="button" data-action="qr-drop" data-emoji="${esc(e)}" aria-label="去掉 ${esc(e)}">${esc(e)}</button>`).join('')}${list.length < 6 ? `<button type="button" class="react-more" data-action="qr-add" aria-label="加一个">${icon('add')}</button>` : ''}</div>
        <div class="actions">${btn('qr-reset', '恢复默认', 'text-button')}</div>`;
    }
    paint();
    d.onClose(() => done());
  }
  function chatSettingsSheet() {
    const row = (action, glyph, title, sub) => `<button type="button" class="list-row" data-action="${action}">${icon(glyph)}<span><strong>${title}</strong><small>${esc(sub)}</small></span>${icon('next')}</button>`;
    const d = sheet('聊天设置', '', {
      'cs-voice': () => voiceTextSheet({over: true}),
      'cs-calls': () => callsSheet({over: true}),
      'cs-phone': () => bringSheet({onClose: () => { paint(); return render(); }, over: true, beforePick: () => d.close()}),
      'cs-pat': () => patSuffixSheet(() => paint(), {over: true}),
      'cs-reacts': () => reactionsSheet(() => paint()),
      'cs-presets': () => { d.close(); ctx.open('presets'); ctx.showPresetKind?.('chat'); }
    });
    function paint() {
      if (!d.live) return;
      const s = api.getState(), c = s.chat, v = voiceText();
      d.body.innerHTML = groupTitle('回复') + `<div class="group pad">${toggle('cs-auto', '自动回复', c.autoReply === true, '打开后，你发完消息停下几秒，对方会自己回，不用点右下角的气泡；连着发好几条也行，你停下来才回。想马上让 TA 回，照样点气泡。每次回复是一次文字模型请求。')}${toggle('cs-pace', '逐条显示回复', c.pace !== false, '对方的消息像真人打字一样一条条出来；关掉就一次全显示。')}</div>`
        + groupTitle('更多') + `<div class="group">${row('cs-voice', 'book', '语音消息', `${{translation: '显示译文', original: '显示原文', both: '原文和译文'}[v.mode] || '显示译文'}${v.auto ? ' · 自动转文字' : ''}`)}${row('cs-calls', 'phone', '来电', s.calls?.auto ? '角色会自己打来' : '角色不会自己打来')}${row('cs-phone', 'chat', '正文和手机', storyLinkNote(s, knownThreads))}${row('cs-reacts', 'smile', '常用回应', (c.quickReactions || REACTIONS).join(' '))}${row('cs-pat', 'hand', '拍一拍后缀', profile().patSuffix ? `拍了拍你${profile().patSuffix}` : '还没有')}${row('cs-presets', 'edit', '聊天预设', '怎么回消息、朋友圈怎么发、电话里怎么说')}</div>`;
    }
    paint();
    d.body.addEventListener('change', e => {
      const key = e.target.dataset.field;
      if (key === 'cs-auto') api.saveChatOptions({autoReply: e.target.checked});
      if (key === 'cs-pace') setPace(e.target.checked);
      paint();
    });
    // The sheets opened from here save settings: the chat app hears of it (onChat), and this sheet says it anew.
    settingsPaint = paint;
    d.onClose?.(() => { if (settingsPaint === paint) settingsPaint = null; });
  }
  /** 拍一拍后缀: the user's own words after 「拍了拍你」. */
  function patSuffixSheet(done = () => {}, options = {}) {
    const now = profile().patSuffix || '';
    const d = sheet('拍一拍后缀', `${field('后缀', input('pat-suffix', now, 'text', 'maxlength="20" placeholder="比如：的小脑袋"'))}<p class="hint" data-pat-preview>${esc(`凛拍了拍你${now || '的小脑袋'}`)}</p><div class="actions">${btn('pat-suffix-save', '保存', 'primary')}</div>`, {
      'pat-suffix-save': () => { api.saveChatOptions({profile: {patSuffix: value(d, 'pat-suffix')}}); d.close(); ctx.notify('拍一拍后缀存好了'); done(); }
    }, options);
    d.body.addEventListener('input', e => { if (e.target.dataset.field === 'pat-suffix') d.body.querySelector('[data-pat-preview]').textContent = `凛拍了拍你${e.target.value.trim() || '的小脑袋'}`; });
  }
  /** 群设置 (0.9.36): the group's name, picture, 群公告 and the user's nickname in it. */
  function groupMembersSheet(base, action) {
    if (base.watch) return;
    const names = action === 'invite' ? api.chatContacts().map(c => c.name).filter(n => !base.members.includes(n)) : base.members;
    const title = {invite: '邀请好友', remove: '移出成员', silence: '禁言'}[action];
    const d = sheet(title, `<div class="pick-list">${names.map(n => `<label class="setting-row"><span>${esc(shown(n))}</span><input class="switch" type="checkbox" data-member="${esc(n)}" aria-label="选择 ${esc(n)}"></label>`).join('') || '<p class="hint">没有可选的好友</p>'}</div>${action === 'silence' ? field('时长', select('mute-duration', 600000, [[600000, '10 分钟'], [3600000, '1 小时'], [43200000, '12 小时'], [86400000, '1 天'], [0, '解除']])) : ''}<div class="actions">${btn('manage-save', '确定', 'primary')}</div>`, {
      'manage-save': async () => {
        const chosen = [...d.body.querySelectorAll('[data-member]:checked')].map(e => e.dataset.member);
        if (!chosen.length) { ctx.notify('请先选择好友'); return; }
        if (action === 'remove' && !await ctx.confirm('移出这些成员？', chosen.join('、'))) return;
        await api.updateThread(base.id, {manage: {action, names: chosen, ...(action === 'silence' ? {duration: Number(value(d, 'mute-duration'))} : {})}});
        d.close(); await render();
      }
    });
  }
  function groupSettingsSheet() {
    const base = thread, row = (action, glyph, title, sub) => `<button type="button" class="list-row" data-menu="${action}">${icon(glyph)}<span><strong>${title}</strong><small>${esc(sub)}</small></span>${icon('next')}</button>`;
    const d = ctx.dialog('群设置', `<div class="pick-list">${row('rename', 'edit', '群名', base.name)}${row('group-avatar', 'image', '群头像', '从相册选一张或上传，也可以换回成员拼的头像')}${row('group-notice', 'bell', '群公告', base.notice?.text || '还没有')}${row('group-nick', 'person', '我在本群的昵称', base.nicks?.me || '用你自己的名字')}${base.watch ? '' : row('invite', 'add', '邀请好友', '从联系人中选择') + row('remove', 'trash', '移出成员', '选择后确认一次') + row('silence', 'mute', '禁言', '选择成员和时长，或解除禁言')}</div>`);
    d.body.addEventListener('click', e => {
      const action = e.target.closest('[data-menu]')?.dataset.menu;
      if (!action) return;
      d.close();
      ctx.win.Promise.resolve().then(async () => {
        if (['invite', 'remove', 'silence'].includes(action)) groupMembersSheet(base, action);
        if (action === 'rename') {
          const r = ctx.dialog('改群名', `${field('群名', input('rename', base.name, 'text', 'maxlength="40"'))}<div class="actions">${btn('rename-save', '保存', 'primary')}</div>`);
          r.body.addEventListener('click', ev => { if (ev.target.closest('[data-action=rename-save]')) { const name = r.body.querySelector('[data-field=rename]').value; r.close(); api.listThreads().then(list => Promise.all(chatWindows(list, base).map(t => api.updateThread(t.id, {name})))).catch(err => ctx.notify(err.message)); } });
        }
        if (action === 'group-avatar') await avatarSheet('g:' + groupKey(base), {title: `${base.name} 的群头像`, reset: '用成员拼的头像'});
        if (action === 'group-notice') noticeSheet(base, true);
        if (action === 'group-nick') {
          const r = sheet('我在本群的昵称', `${field('昵称', input('group-nick', base.nicks?.me || '', 'text', `maxlength="16" placeholder="${esc(myName())}"`))}<div class="actions">${btn('group-nick-save', '保存', 'primary')}</div>`, {
            'group-nick-save': async () => { const nick = value(r, 'group-nick'); r.close(); await api.updateThread(base.id, {nicks: {me: nick || null}}); ctx.notify(nick ? `在这个群里叫「${nick}」` : '在这个群里用你自己的名字'); }
          });
        }
      }).catch(error => ctx.notify(error.message));
    });
  }
  /** 群公告: read it (and, from 群设置, write a new one: the group sees a line that it was posted). */
  function noticeSheet(base, editing = false) {
    const n = base.notice, by = n ? (n.by === 'me' ? '你' : groupName(n.by, base)) : '';
    const d = sheet('群公告', editing
      ? `${field('公告', textArea('notice-text', n?.text || '', 'rows="5" maxlength="300" placeholder="写给全群的话，会放在群聊最上面"'))}<div class="actions">${n ? btn('notice-clear', '撤下公告', 'secondary') : ''}${btn('notice-post', '发布', 'primary')}</div>`
      : `<p class="help-copy notice-full">${esc(n?.text || '')}</p>${n ? `<p class="hint">${esc(by)}发布</p>` : ''}<div class="actions">${btn('notice-edit', '改公告', 'secondary')}</div>`, {
      'notice-edit': () => { d.close(); noticeSheet(base, true); },
      'notice-clear': async () => { d.close(); await api.updateThread(base.id, {notice: null}); },
      'notice-post': async () => {
        const text = value(d, 'notice-text');
        if (!text) { ctx.notify('先写点公告内容'); return; }
        d.close();
        await api.updateThread(base.id, {notice: {text, by: 'me', at: Date.now()}});
        await api.appendChat(base.id, [{from: 'me', kind: 'notice', target: 'me', text: `发布了群公告：${text}`}], {read: true});
      }
    });
  }
  /** 主动发消息: characters text the user from the story, and (if wanted) now and then on their own. */
  /** A finished call: what was said, the voice message of a missed call, and calling back. */
  function callLog(m) {
    const name = m.from === 'me' ? thread.members[0] : m.from, who = l => l.from === 'me' ? '你' : l.from;
    const said = m.lines?.length ? `<div class="call-log">${m.lines.map(l => `<p><b>${esc(who(l))}：</b>${esc(l.translation || l.text)}</p>`).join('')}</div>` : '';
    const mail = m.voicemail?.length ? `<p class="help-copy"><b>语音留言：</b>${esc(m.voicemail.map(l => l.translation || l.text).join(' '))}</p>` : '';
    const d = sheet(callSummary(m), `${said || mail ? '' : '<p class="help-copy">这通电话没有说话内容。</p>'}${mail}${said}
      <div class="actions">${m.voicemail?.length && ctx.routeFor(name)?.voice ? btn('call-mail', icon('play', true) + '听留言', 'secondary') : ''}${api.callDial ? btn('call-back', icon('phone') + '回拨', 'primary') : ''}</div>`, {
      'call-mail': () => api.speak(m.voicemail.map(l => ({role: name, text: l.text, translation: l.translation, emotion: l.emotion}))),
      'call-back': async () => { d.close(); await api.callDial(name); }
    });
  }
  /** 置顶 / 免打扰 / 标为已读 / 删除, from a long press (or right click) on a conversation. */
  async function convMenu(id) {
    const t = (await api.listThreads()).find(x => x.id === id);
    if (!t) return;
    const d = ctx.dialog(t.name, `<div class="pick-list">
      <button class="list-row" data-menu="pin">${icon('pin')}<span><strong>${t.pinned ? '取消置顶' : '置顶'}</strong></span></button>
      <button class="list-row" data-menu="mute">${icon('mute')}<span><strong>${t.muted ? '取消免打扰' : '消息免打扰'}</strong><small>免打扰的聊天不算进桌面上的未读数</small></span></button>
      ${t.unread ? `<button class="list-row" data-menu="read">${icon('check')}<span><strong>标为已读</strong></span></button>` : ''}
      <button class="list-row" data-menu="delete">${icon('trash')}<span><strong>删除聊天</strong></span></button></div>`);
    d.body.addEventListener('click', e => {
      const action = e.target.closest('[data-menu]')?.dataset.menu;
      if (!action) return;
      d.close();
      ctx.win.Promise.resolve().then(async () => {
        if (action === 'pin') await api.updateThread(id, {pinned: !t.pinned});
        if (action === 'mute') await api.updateThread(id, {muted: !t.muted});
        if (action === 'read') await api.markThreadRead(id);
        if (action === 'delete' && await ctx.confirm('删除这段聊天？', '聊天记录会一起删除，联系人不受影响。')) { await api.deleteThread(id); if (t.type === 'group' && !currentWindow(await api.listThreads(), t)) forgetGroupAvatar(t); }
        render();
      }).catch(error => ctx.notify(error.message));
    });
  }
  function plusMenu() {
    const d = ctx.dialog('发起', `<div class="pick-list">
      <button class="list-row" data-menu="chat">${icon('chat')}<span><strong>发起私聊</strong></span></button>
      ${api.chatContacts().length > 1 ? `<button class="list-row" data-menu="group">${icon('group')}<span><strong>发起群聊</strong></span></button><button class="list-row" data-menu="watch">${icon('eye')}<span><strong>拉一个旁观群</strong><small>你不在群里，只看他们聊</small></span></button>` : ''}
      <button class="list-row" data-menu="contact">${icon('person')}<span><strong>添加联系人</strong><small>剧情之外的人，写上人设就能聊</small></span></button></div>`);
    d.body.addEventListener('click', e => {
      const action = e.target.closest('[data-menu]')?.dataset.menu;
      if (!action) return;
      d.close();
      if (action === 'chat' || action === 'group' || action === 'watch') newChat(action !== 'chat', action === 'watch');
      if (action === 'contact') { contactDraft = {name: '', persona: ''}; mode = 'contact-edit'; render(); }
    });
  }
  async function pickBackground() {
    const rows = await api.listPhotos();
    if (!rows.length) throw Error('相册里还没有照片，先在相册里导入一张');
    const d = ctx.dialog('选一张聊天背景', `<div class="photo-grid pick-photos">${rows.slice(0, 30).map(r => `<button data-bg-photo="${esc(r.id)}" aria-label="用 ${esc(r.name)} 当背景"><img data-chat-photo="${esc(r.id)}" alt="${esc(r.name)}"></button>`).join('')}</div>`);
    pickerThumbs(d, rows);
    d.body.addEventListener('click', e => {
      const id = e.target.closest('[data-bg-photo]')?.dataset.bgPhoto;
      if (!id) return;
      d.close();
      api.saveChatOptions({profile: {backgroundPhoto: id}});
      render();
    });
  }
  /** A group's own picture goes with its last window. */
  function forgetGroupAvatar(t) { if (api.getState().chat.avatars?.['g:' + groupKey(t)]) api.saveChatOptions({avatars: {['g:' + groupKey(t)]: null}}); }
  async function openDm(name) {
    const existing = currentDm(await api.listThreads(), name);
    const t = existing || await api.createThread({type: 'dm', members: [name]});
    open(t.id);
  }
  function threadMenu() {
    const group = thread.type === 'group';
    const d = ctx.dialog(thread.name, `<div class="pick-list">
      ${live && !thread.watch ? `<button class="list-row" data-menu="reroll">${icon('refresh')}<span><strong>重新回复最后一轮</strong></span></button>` : ''}
      ${group ? `<button class="list-row" data-menu="group-settings">${icon('group')}<span><strong>群设置</strong><small>群名、群头像、群公告、我在本群的昵称</small></span></button>` : ''}
      <button class="list-row" data-menu="windows">${icon('layers')}<span><strong>聊天窗口</strong><small>${group ? '这个群' : '和' + esc(shown(thread.members[0]))}开好几个聊天，切换、新开、删除</small></span></button>
      <button class="list-row" data-menu="memory">${icon('book')}<span><strong>记忆</strong><small>更早的聊天整理成的摘要和总结，可以改</small></span></button>
      <button class="list-row" data-menu="chat-settings">${icon('sliders')}<span><strong>聊天设置</strong><small>${esc(settingsLine())}</small></span></button>
</div>`);
    d.body.addEventListener('click', e => {
      const action = e.target.closest('[data-menu]')?.dataset.menu;
      if (!action) return;
      d.close();
      ctx.win.Promise.resolve().then(async () => {
        if (action === 'reroll') await reroll();
        if (action === 'group-settings') groupSettingsSheet();
        if (action === 'chat-settings') chatSettingsSheet();
        if (action === 'rename') {
          const r = ctx.dialog('改群名', `${field('群名', input('rename', thread.name, 'text', 'maxlength="40"'))}<div class="actions">${btn('rename-save', '保存', 'primary')}</div>`);
          // The group's name is every window's.
          const base = thread;
          r.body.addEventListener('click', ev => { if (ev.target.closest('[data-action=rename-save]')) { const name = r.body.querySelector('[data-field=rename]').value; r.close(); api.listThreads().then(list => Promise.all(chatWindows(list, base).map(t => api.updateThread(t.id, {name})))).catch(err => ctx.notify(err.message)); } });
        }
        if (action === 'voice-text') voiceTextSheet();
        if (action === 'group-avatar') await avatarSheet('g:' + groupKey(thread), {title: `${thread.name} 的群头像`, reset: '用成员拼的头像'});
        if (action === 'pace') { const on = api.getState().chat.pace === false; setPace(on); ctx.notify(on ? '对方的消息会一条条出来' : '对方的消息会一次全显示'); }
        if (action === 'memory') memorySheet(ctx, {threadId, title: thread.name});
        if (action === 'windows') await windowsSheet(thread);
      }).catch(error => ctx.notify(error.message));
    });
  }

  v.on('input', '[data-field=draft]', (el, e) => { keepDraft(threadId, el.value); syncSend(); holdAuto(); atPicker(el, e); if (el.value.trim()) petsLayer.typing(true); });
  // The + panel's page dots follow the swipe (scroll does not bubble: heard on the way down); a chat scrolled up near
  // its top draws its earlier messages.
  v.root.addEventListener('scroll', e => {
    const box = e.target;
    if (box.classList?.contains('msgs')) {
      if (box.scrollTop < 240) showOlder();
      // Down at the newest: nothing waits below. The first unread one in sight: the note pointing up goes.
      if (unseen && box.scrollHeight - box.scrollTop - box.clientHeight < 80) { unseen = 0; box.parentElement?.querySelector('.chat-jump-new')?.remove(); }
      if (unreadMark?.show) {
        const first = [...box.querySelectorAll('.msg[data-mid]')].find(el => el.dataset.mid === unreadMark.id);
        if (first && first.getBoundingClientRect().top >= box.getBoundingClientRect().top - 4) { unreadMark.show = false; box.parentElement?.querySelector('.chat-jump-unread')?.remove(); }
      }
    }
    if (!box.classList?.contains('tool-pages')) return;
    const at = Math.round(box.scrollLeft / Math.max(1, box.clientWidth));
    for (const dot of box.parentElement.querySelectorAll('[data-action=tool-page]')) dot.setAttribute('aria-current', String(Number(dot.dataset.page) === at));
  }, true);
  // While the input method is still putting a word together, the list waits for the word.
  v.on('input', '[data-field=chat-search]', (el, e) => { search = el.value; searching = true; if (!e.isComposing) render(); });
  v.on('compositionend', '[data-field=chat-search]', el => { search = el.value; searching = true; render(); });
  v.on('focusout', '[data-field=chat-search]', () => { searching = false; });
  // 文件: pictures are sent as photos, documents by their words (ui/chat-files.js).
  v.on('change', '[data-chat-files]', async el => {
    const files = [...(el.files || [])];
    el.value = '';
    if (!files.length) return;
    panel = null; syncPanel();
    try {
      const {messages, cut} = await filesToMessages(api, files);
      if (messages.length) await post(messages);
      if (cut.length) ctx.notify(`${cut.join('、')} 太长，只发了前面一部分`);
    } catch (error) { ctx.notify(error.message); }
  });
  v.on('change', '[data-field^=me-]', el => {
    const key = el.dataset.field.slice(3);
    try { api.saveChatOptions({profile: {[key]: el.type === 'checkbox' ? el.checked : el.value}}); render(); } catch (error) { ctx.notify(error.message, {error: true}); }
  });
  // Long-press (or right-click) a conversation for 置顶 and 免打扰.
  let convPress = null, convPressedAt = 0;
  v.on('pointerdown', '.conv[data-conv]', (el, e) => {
    if (e.button > 0) return;
    ctx.win.clearTimeout(convPress?.timer);
    convPress = {x: e.clientX, y: e.clientY, timer: ctx.win.setTimeout(() => { convPress = null; convPressedAt = Date.now(); convMenu(el.dataset.conv); }, 480)};
  });
  for (const type of ['pointermove', 'pointerup', 'pointercancel']) v.on(type, '.conv[data-conv]', (el, e) => {
    if (!convPress || (e.type === 'pointermove' && Math.hypot(e.clientX - convPress.x, e.clientY - convPress.y) < 10)) return;
    ctx.win.clearTimeout(convPress.timer); convPress = null;
  });
  v.on('contextmenu', '.conv[data-conv]', (el, e) => { e.preventDefault(); if (Date.now() - convPressedAt > 1000) convMenu(el.dataset.conv); });
  v.on('keydown', '[data-field=draft]', (el, e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); return send(); } });
  // Typing closes the + panel, like a phone keyboard replacing it.
  v.on('focusin', '[data-field=draft]', () => { if (panel) { panel = null; syncPanel(); } });
  v.on('pointerdown', '.range-bar', (bar, e) => {
    if (!selecting || e.button > 0) return;
    e.preventDefault();
    const box = v.root.querySelector('.msgs'), edge = bar.dataset.edge, win = ctx.win;
    const rows = [...box.querySelectorAll('.msg[data-mid]')], ids = rows.map(r => r.dataset.mid);
    const base = new Set(selecting), at = ids.map((id, i) => base.has(id) ? i : -1).filter(i => i >= 0);
    if (!at.length) return;
    const lo = at[0], hi = at.at(-1);
    let picked = base, y = e.clientY, raf = 0;
    try { bar.setPointerCapture(e.pointerId); } catch { /* an old browser: the bar still follows inside the list */ }
    bar.classList.add('dragging');
    // The message under the finger: the nearest by its middle.
    const nearest = () => { let best = 0, gap = Infinity; rows.forEach((r, i) => { const b = r.getBoundingClientRect(), d = Math.abs((b.top + b.bottom) / 2 - y); if (d < gap) { gap = d; best = i; } }); return best; };
    function apply() {
      const i = nearest(), from = edge === 'start' ? Math.min(i, hi) : lo, to = edge === 'end' ? Math.max(i, lo) : hi;
      // The span before the drag keeps its choices; what the bar newly passes is taken in.
      picked = new Set(ids.filter((id, k) => k >= from && k <= to && (k < lo || k > hi || base.has(id))));
      rows.forEach((r, k) => r.toggleAttribute('data-picked', picked.has(ids[k])));
      const first = rows.find((r, k) => picked.has(ids[k])), last = [...rows].reverse().find((r, k) => picked.has(ids[rows.length - 1 - k]));
      const start = box.querySelector('.range-bar[data-edge=start]'), end = box.querySelector('.range-bar[data-edge=end]');
      if (first && start) first.before(start);
      if (last && end) last.after(end);
      const label = v.root.querySelector('.bring-bar span');
      if (label) label.textContent = pickedLabel(picked.size);
    }
    // Near the top or bottom edge the list scrolls on its own, so a long stretch can be taken in one drag.
    function scroll() {
      const b = box.getBoundingClientRect(), speed = y < b.top + 48 ? -Math.ceil((b.top + 48 - y) / 4) : y > b.bottom - 48 ? Math.ceil((y - b.bottom + 48) / 4) : 0;
      if (speed) { box.scrollTop += speed; apply(); }
      raf = win.requestAnimationFrame(scroll);
    }
    const move = ev => { y = ev.clientY; apply(); };
    const up = () => {
      win.cancelAnimationFrame(raf);
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      selecting = picked;
      // The drag marked and moved rows on the page itself: drawn anew from what is picked, not kept as they were drawn.
      rowCache.clear();
      render();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
    raf = win.requestAnimationFrame(scroll);
  });
  v.on('click', '.msg[data-mid]', el => {
    if (!selecting) return;
    const id = el.dataset.mid;
    if (selecting.has(id)) selecting.delete(id); else selecting.add(id);
    render();
  });
  // Double-tap an avatar to 拍一拍; long-press (or right-click) a message for its menu.
  v.on('dblclick', '[data-pat]', el => { if (!selecting) return pat(el.dataset.pat); });
  // Long-press works the same on phones that do not send contextmenu (iOS): hold a message for half a second.
  v.on('pointerdown', '.msg[data-mid] .m-body', (el, e) => {
    if (selecting || e.button > 0) return;
    const id = el.closest('.msg').dataset.mid;
    ctx.win.clearTimeout(press?.timer);
    press = {x: e.clientX, y: e.clientY, timer: ctx.win.setTimeout(() => {
      press = null;
      const m = thread?.messages.find(x => x.id === id);
      if (m) { pressedAt = Date.now(); messageMenu(m); }
    }, 480)};
  });
  const cancelPress = (el, e) => {
    if (!press || (e.type === 'pointermove' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10)) return;
    ctx.win.clearTimeout(press.timer);
    press = null;
  };
  for (const type of ['pointermove', 'pointerup', 'pointercancel']) v.on(type, '*', cancelPress);
  // 左滑引用 (0.9.49, like QQ): drag a bubble to the left and it follows with a 引用 arrow coming in; let go past the
  // mark and the message is quoted under the box. Up and down stays the list's scroll (touch-action: pan-y on bubbles).
  let swipe = null, swipedAt = 0;
  // The click a swipe ends with is not a tap (it would play a voice message or open a picture).
  v.root.addEventListener('click', e => { if (Date.now() - swipedAt < 350 && e.target.closest?.('.msg[data-mid]')) { e.preventDefault(); e.stopPropagation(); } }, true);
  v.on('pointerdown', '.msg[data-mid] .m-body', (el, e) => {
    if (selecting || e.button > 0 || thread?.watch) return;
    swipe = {row: el.closest('.msg'), x: e.clientX, y: e.clientY, dx: 0, on: false};
  });
  v.on('pointermove', '*', (el, e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (!swipe.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
      if (dx > -10 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      swipe.on = true; swipe.row.dataset.swiping = '';
    }
    // Follows the finger to 64 px, then only a little more (rubber band).
    const pull = Math.min(0, dx), shown = pull > -64 ? pull : -64 + (pull + 64) * .25;
    swipe.dx = pull;
    swipe.row.style.setProperty('--swipe', `${shown}px`);
    swipe.row.style.setProperty('--swipe-p', String(Math.min(1, -pull / 52)));
    swipe.row.toggleAttribute('data-swipe-ready', pull <= -52);
  });
  const endSwipe = () => {
    if (!swipe) return;
    const {row, dx, on} = swipe;
    swipe = null;
    if (!on) return;
    row.removeAttribute('data-swiping'); row.removeAttribute('data-swipe-ready');
    row.style.removeProperty('--swipe'); row.style.removeProperty('--swipe-p');
    pressedAt = swipedAt = Date.now();
    const m = dx <= -52 && thread?.messages.find(x => x.id === row.dataset.mid);
    if (m && quotable(m)) { quote = {from: m.from, text: quoteText(m).slice(0, 200)}; panel = null; render(); v.root.querySelector('[data-field=draft]')?.focus({preventScroll: true}); }
  };
  v.on('pointerup', '*', endSwipe);
  v.on('pointercancel', '*', endSwipe);
  v.on('contextmenu', '.msg[data-mid]', (el, e) => {
    if (Date.now() - pressedAt < 1000) { e.preventDefault(); return; }
    if (selecting) return;
    const m = thread?.messages.find(x => x.id === el.dataset.mid);
    if (m) { e.preventDefault(); messageMenu(m); }
  });
  // A sticker whose picture cannot be loaded (a dead link, a site that refuses) shows its name instead.
  v.root.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.closest?.('.chat-sticker, .sticker-cell')?.classList.add('broken'); }, true);
  v.on('click', '[data-action]', async el => {
    const action = el.dataset.action;
    if (mode === 'list' && tab === 'moments' && await moments.click(el)) return;
    // The click that ends a long-press on a conversation only opened its menu.
    if (action === 'open' && el.dataset.conv && Date.now() - convPressedAt < 700) return;
    // The click that ends a long-press only closes the press, it does not play or open anything.
    if (Date.now() - pressedAt < 700 && el.closest('.msg')) return;
    if (selecting && ['message', 'voice', 'photo', 'packet', 'transfer', 'gift', 'react-chip', 'peek', 'forward-open', 'game-vote', 'game-end', 'game-choice', 'game-again', 'game-chain'].includes(action)) return;
    const find = () => thread.messages.find(x => x.id === el.dataset.mid);
    switch (action) {
      case 'tab': {
        if (tab !== el.dataset.tab) { v.root.dataset.switching = el.dataset.tab; ctx.win.clearTimeout(switchTimer); switchTimer = ctx.win.setTimeout(() => delete v.root.dataset.switching, 420); }
        // The tab lights up at once; the page follows when it is read.
        for (const b of v.root.querySelectorAll('.qq-tabs [data-tab]')) b.setAttribute('aria-pressed', String(b === el));
        tab = el.dataset.tab; search = ''; if (tab === 'moments') moments.only(''); v.root.scrollTop = 0; render(); break;
      }
      case 'open-hit': await open(el.dataset.id, el.dataset.mid); break;
      case 'open': {
        // The contact's picture in the list flies up to the top of the chat (ui/carry.js).
        const from = el.firstElementChild?.getBoundingClientRect();
        Promise.resolve(open(el.dataset.id)).then(() => fly(ctx.win, v.root.querySelector('.th-head')?.firstElementChild, from, {duration: 360, easing: 'soft'}));
        break;
      }
      case 'new-chat': newChat(); break;
      case 'plus-menu': plusMenu(); break;
      case 'me': mode = 'me'; render(); break;
      case 'me-set': api.saveChatOptions({profile: {[el.dataset.key]: el.dataset.value}}); render(); break;
      case 'me-buy': {
        const left = api.wallet().balance, price = Number(el.dataset.price);
        if (!await ctx.confirm(`买下「${el.dataset.name}」？`, `¥${price}，零钱还有 ¥${yuan(left)}。买下以后一直能用。`)) break;
        api.buyDecoration(el.dataset.key, el.dataset.value);
        api.saveChatOptions({profile: {[el.dataset.key]: el.dataset.value}});
        render(); ctx.notify('买下并换上了');
        break;
      }
      case 'me-status': statusSheet(); break;
      case 'me-deco': decoSheet(el.dataset.key); break;
      case 'me-wallet': openWallet(); break;
      case 'me-shop': openShop(); break;
      case 'me-bg-photo': await pickBackground(); break;
      case 'me-bg-clear': api.saveChatOptions({profile: {backgroundPhoto: ''}}); render(); break;
      case 'me-chat-settings': chatSettingsSheet(); break;
      case 'me-pets': petsSheet(); break;
      case 'me-voice': voiceTextSheet(); break;
      case 'me-calls': callsSheet(); break;
      case 'avatar-pick': await avatarSheet(el.dataset.key); break;
      case 'call': await api.callDial(thread.members[0]); break;
      case 'profile-call': await api.callDial(profileOf); break;
      case 'call-log': { const m = find(); if (m) callLog(m); break; }
      case 'me-presets': ctx.open('presets'); ctx.showPresetKind?.('chat'); break;
      case 'dm-open': await openDm(el.dataset.name); break;
      case 'profile': profileOf = el.dataset.name; mode = 'profile'; render(); break;
      case 'profile-chat': await openDm(profileOf); break;
      case 'song': { const m = thread?.messages.find(x => x.id === el.dataset.mid); if (m?.song?.draft && await openWritten(m.song)) break; if (m?.song) { ctx.notify(`正在找「${m.song.title}」……`); api.musicPlay?.({...m.song, from: 'share'}).catch(error => ctx.notify(error.message, {error: true})); } break; }
      case 'play-song': api.musicPlay?.({title: el.dataset.title, artist: el.dataset.artist, from: 'share'}).catch(error => ctx.notify(error.message, {error: true})); break;
      case 'unfriend': {
        const name = profileOf;
        if (!await ctx.confirm(`删除好友「${name}」？`, `和 TA 的聊天会从消息列表收起来（记录还在），TA 也不在好友列表里了。之后 TA 给你发的消息会变成好友申请，在「联系人 → 新的朋友」里随时可以加回来。`)) break;
        try { await api.unfriend(name); ctx.notify(`已删除好友 ${name}`); mode = 'list'; tab = 'contacts'; render(); }
        catch (error) { ctx.notify(error.message, {error: true}); }
        break;
      }
      case 'new-friends': mode = 'friends'; render(); break;
      case 'remark': {
        const name = profileOf, d = ctx.dialog('设置备注', `<div class="group pad">${field('备注', input('remark', remarks()[ownKey(name)] || '', 'text', `maxlength="20" placeholder="${esc(name)}"`), '只改你这边显示的名字（聊天列表、聊天、联系人）；角色那边还是用 TA 的名字，不会知道你给 TA 起了什么备注。空着就是不用备注。')}
          <div class="actions">${btn('remark-save', '保存', 'primary')}</div></div>`);
        d.body.addEventListener('click', e => {
          if (!e.target.closest('[data-action=remark-save]')) return;
          const value = d.body.querySelector('[data-field=remark]').value.trim();
          try { api.saveChatOptions({remarks: {[ownKey(name)]: value || null}}); d.close(); ctx.notify(value ? `备注改成「${value}」` : '不用备注了'); render(); } catch (error) { ctx.notify(error.message, {error: true}); }
        });
        break;
      }
      case 'block': {
        const name = profileOf;
        if (!name || !await ctx.confirm(`把「${name}」加入黑名单？`, 'TA 发来的消息和电话都会被拦截（拦截记录里能看），朋友圈互相看不到；TA 只能发好友申请，在「联系人 → 新的朋友」里通过或拒绝。和 TA 的聊天记录还在。')) break;
        try { await api.blockContact(name); ctx.notify(`已把 ${name} 加入黑名单`); render(); }
        catch (error) { ctx.notify(error.message, {error: true}); }
        break;
      }
      case 'unblock': {
        const id = el.dataset.id || threadId;
        if (!id || !await ctx.confirm('移出黑名单？', '之后 TA 的消息和电话又能收到了；拦截记录会清掉。')) break;
        try { await api.unblockContact(id); ctx.notify('已移出黑名单'); render(); }
        catch (error) { ctx.notify(error.message, {error: true}); }
        break;
      }
      // 拦截记录: what a blocked contact sent, newest first; it never went into the chat.
      case 'held': {
        const list = thread?.blocked?.held || [];
        ctx.dialog(`拦截记录 · ${shown(thread?.members[0] || '')}`, list.length ? `<ol class="held-list">${list.slice().reverse().map(h => `<li><time>${esc(stamp(h.at))}</time><span>${esc(h.text)}</span></li>`).join('')}</ol><p class="hint">拉黑期间 TA 发来的，没有送进聊天。移出黑名单后这些记录会清掉。</p>` : '<p class="hint">还没有拦截到什么。</p>');
        break;
      }
      case 'friend-yes': case 'friend-no': {
        const yes = action === 'friend-yes';
        try { const t = await api.answerFriendRequest(el.dataset.id, yes); ctx.notify(yes ? `已通过 ${t.members[0]} 的好友申请` : `已拒绝 ${t.members[0]} 的好友申请`); if (yes) open(t.id); else render(); }
        catch (error) { ctx.notify(error.message, {error: true}); }
        break;
      }
      case 'refriend': {
        try { const t = await api.refriend(el.dataset.id); ctx.notify(`已把 ${t.members[0]} 加回好友`); if (mode === 'thread') render(); else open(t.id); }
        catch (error) { ctx.notify(error.message, {error: true}); }
        break;
      }
      case 'ask-friend': {
        if (!live) { ctx.notify('在酒馆里打开小手机时才能发好友申请'); break; }
        const id = threadId, name = thread?.members[0] || '';
        const d = ctx.dialog('发送好友申请', `<div class="group pad">${field('验证消息', input('ask-text', `我是${myName()}`, 'text', 'maxlength="100"'), `${esc(name)}会按 TA 的性格和你们现在的关系决定通不通过。`)}</div><div class="actions">${btn('ask-go', '发送', 'primary')}</div>`);
        d.body.addEventListener('click', e => {
          if (!e.target.closest('[data-action=ask-go]')) return;
          const text = d.body.querySelector('[data-field=ask-text]')?.value.trim() || '';
          d.close();
          const job = api.chatAskFriend(id, text);
          if (mode === 'thread' && threadId === id) render();
          job.then(r => ctx.notify(r.accepted ? `${name}通过了你的好友申请` : `${name}没有通过你的好友申请`)).catch(error => ctx.notify(error.message, {error: true}));
        });
        break;
      }
      case 'profile-moments': mode = 'list'; tab = 'moments'; moments.only(profileOf); render(); break;
      case 'star': {
        const list = starred(), on = !list.includes(profileOf);
        api.saveChatOptions({starred: on ? [...list, profileOf] : list.filter(n => n !== profileOf)});
        ctx.notify(on ? `已把 ${profileOf} 设为特别关心` : '已取消特别关心');
        render();
        break;
      }
      case 'role-stickers': roleStickersSheet(profileOf); break;
      // 聊天气泡 of this person: a set of 自定义气泡, or as the user's.
      case 'person-look': personLookSheet(profileOf); break;
      case 'send': await send(); break;
      case 'stop-reply': api.chatCancel?.(threadId); break;
      // Another version of the last round: it shows at once (no typing dots for words already written).
      case 'version': {
        if (typing() || pace.queue.length) break;
        pace.instant = true;
        try { await api.chatShowVersion(threadId, Number(el.dataset.to)); await render(); } finally { pace.instant = false; }
        break;
      }
      case 'jump-new': unseen = 0; stick = true; render(); break;
      case 'jump-unread': { const id = unreadMark?.id; if (unreadMark) unreadMark.show = false; jump = id || null; render(); break; }
      case 'panel': panel = panel ? null : 'tools'; syncPanel(); break;
      case 'panel-tools': panel = 'tools'; syncPanel(); break;
      case 'tool-emoji': case 'panel-emoji': panel = 'emoji'; syncPanel(); break;
      case 'panel-stickers': panel = 'stickers'; syncPanel(); break;
      case 'sticker-send': {
        const s = (api.getState().chat.stickers || []).find(x => x.name === el.dataset.name);
        if (s) await post([{from: 'me', kind: 'sticker', text: s.name, ...(s.photoId ? {photoId: s.photoId} : {url: s.url})}]);
        break;
      }
      case 'stickers-manage': manageStickers(); break;
      case 'sticker': {
        const m = find(), img = el.querySelector('img');
        if (!m || !img?.src || el.classList.contains('broken')) { if (m) messageMenu(m); break; }
        openImageViewer({doc: ctx.doc, src: img.src, alt: m.text, from: img, caption: m.text, actions: [{label: '消息选项', run: () => messageMenu(m)}]});
        break;
      }
      case 'emoji-pick': insertText(el.dataset.emoji); useRecent(ctx.win.localStorage, el.dataset.kind || 'emoji', el.dataset.emoji); break;
      case 'panel-kao': panel = 'kao'; syncPanel(); break;
      case 'emoji-del': deleteChar(); break;
      case 'tool-photo': panel = null; syncPanel(); await sendPhoto(); break;
      case 'tool-redpacket': panel = null; syncPanel(); sendPacket(); break;
      case 'tool-transfer': panel = null; syncPanel(); sendTransfer(); break;
      case 'tool-gift': panel = null; syncPanel(); sendGift(); break;
      case 'tool-location': panel = null; syncPanel(); sendLocation(); break;
      case 'tool-song': panel = null; syncPanel(); await shareSong(); break;
      case 'tool-write': panel = null; syncPanel(); writeSong(); break;
      case 'tool-page': { const box = el.closest('.chat-panel')?.querySelector('.tool-pages'); box?.scrollTo({left: Number(el.dataset.page) * box.clientWidth, behavior: 'smooth'}); break; }
      case 'tool-pat': panel = null; syncPanel(); await choosePat(); break;
      case 'tool-dice': panel = null; syncPanel(); await rollDice(); break;
      case 'tool-game': panel = null; syncPanel(); gameSheet(); break;
      case 'tool-play': panel = null; syncPanel(); playSheet(); break;
      case 'tool-letter': panel = null; syncPanel(); letterSheet(); break;
      case 'letter-open': { const m = find(); if (m?.kind === 'letter') await letterView(m); break; }
      case 'letters': await lettersSheet(profileOf); break;
      // 消息回应 chips: the user's own on or off.
      case 'react-chip': await api.updateChatMessage(threadId, el.dataset.mid, {react: {from: 'me', emoji: el.dataset.emoji}}); break;
      // A contact's recall: peeked at here (they never know).
      case 'peek': { const id = el.dataset.mid; if (peeked.has(id)) peeked.delete(id); else peeked.add(id); render(); break; }
      case 'game-vote': {
        const m = find(), g = m?.game;
        if (!g?.open) break;
        const i = Number(el.dataset.i), mine = g.votes.find(x => x.from === 'me')?.option;
        await api.updateChatMessage(threadId, m.id, {game: {votes: [...g.votes.filter(x => x.from !== 'me'), ...(mine === i ? [] : [{from: 'me', option: i}])]}});
        break;
      }
      case 'game-end': { const m = find(); if (m?.game?.open) await api.updateChatMessage(threadId, m.id, {game: {open: false}}); break; }
      case 'game-choice': {
        const m = find();
        if (!m || m.game?.choice) break;
        await api.updateChatMessage(threadId, m.id, {game: {choice: el.dataset.choice}});
        await post([{from: 'me', kind: 'text', text: `我选${el.dataset.choice}！`}]);
        requestReply();
        break;
      }
      case 'game-again': await spin(); break;
      case 'game-chain': { const m = find(); if (m?.game?.open) chainLine(m); break; }
      // 群公告 (0.9.36): read it; fold it away until a new one comes.
      case 'notice-open': if (thread?.notice) noticeSheet(thread); break;
      case 'notice-hide': { try { ctx.win.localStorage.setItem(noticeKey(thread), String(thread.notice?.at || 0)); } catch { /* shown again next time */ } render(); break; }
      // 小游戏对战 (0.9.35): the user's move, then the other one answers (and moves).
      case 'board-cell': {
        const m = find(), g = m?.game, at = Number(el.dataset.at);
        if (!g?.open || g.turn !== 'me' || typing() || cellsOf(g)[at]) break;
        await api.updateChatMessage(threadId, m.id, {game: {moves: [...g.moves, {by: 'me', at}]}});
        requestReply();
        break;
      }
      case 'board-resign': { const m = find(); if (m?.game?.open && await ctx.confirm('认输？', '这一盘算你输。')) { await api.updateChatMessage(threadId, m.id, {game: {resigned: 'me'}}); requestReply(); } break; }
      case 'board-again': { const g = find()?.game; if (g && BOARDS[g.type]) await startBoard(g.type, g.first === 'me' ? g.them : 'me'); break; }
      case 'post-open': { const m = find(); if (m?.post?.id) ctx.openForumPost?.(m.post.id); else if (m) messageMenu(m); break; }
      case 'outfit-open': { const m = find(); if (m) outfitSheet(m); break; }
      case 'book-open': { const m = find(); if (m?.book?.id) ctx.openBook?.(m.book.id); else if (m) messageMenu(m); break; }
      case 'watch-talk': requestReply(); break;
      case 'quote-off': quote = null; render(); break;
      case 're-edit': {
        const text = recalled.get(el.dataset.mid) || '';
        recalled.delete(el.dataset.mid);
        keepDraft(threadId, draftOf(threadId) + text);
        render();
        break;
      }
      case 'message': { const m = find(); if (m) messageMenu(m); break; }
      case 'photo': {
        const m = find(), img = el.querySelector('img');
        if (!m || !img?.src) break;
        await photoViewer(m, img);
        break;
      }
      case 'file': { const m = find(); if (m) showFile(ctx, m); break; }
      case 'packet': { const m = find(); if (m) openPacket(m); break; }
      case 'transfer': { const m = find(); if (m) openTransfer(m); break; }
      case 'gift': { const m = find(); if (m) openGift(m); break; }
      case 'voice': {
        const m = find();
        if (!m) break;
        if (!ctx.routeFor(m.from)?.voice) { ctx.notify(`${m.from} 还没有配音`); break; }
        if (el.dataset.state === 'playing') { api.stop(); break; }
        await api.speak(lineOf(m));
        break;
      }
      case 'thread-menu': threadMenu(); break;
      case 'photo-draw': {
        const m = thread.messages.find(x => x.id === el.dataset.mid);
        const paid = /Anlas|花钱/.test(m?.imageNote || '') || api.drawQuote?.().free === false, ask = api.paidPrompt?.();
        if (paid && ask && !await ctx.confirm(ask.title, ask.text)) break;
        api.chatDrawPhoto(threadId, el.dataset.mid, paid).catch(error => ctx.notify(error.message, {error: true}));
        break;
      }
      case 'bring': if (selecting) { selecting = null; render(); } else bringSheet(); break;
      case 'bring-go': {
        const count = selecting.size;
        if (!live) throw Error('在酒馆里打开小手机时才能带进剧情');
        const done = await api.chatBring(threadId, [...selecting]);
        selecting = null;
        ctx.notify(`下一次正文会带上这 ${count} 条消息${done?.replaced ? `（之前选的 ${done.replaced} 条不带了）` : ''}${count > 60 ? '。选得比较多，模型可能抓不住重点，挑关键的几段效果更好；想让正文一直记得手机里聊过的事，可以打开「正文和手机 → 这段聊天 → 一直带着」' : ''}`);
        render();
        break;
      }
      case 'cancel-bring': await api.chatCancelBring?.(); ctx.notify('已取消，这次不带聊天进正文'); render(); break;
      case 'older': showOlder(); break;
      case 'pick-up': case 'pick-down': {
        // Everything from the picked ones to the first (or the latest) message.
        const ids = thread.messages.filter(m => !LINE_KINDS.includes(m.kind)).map(m => m.id), at = ids.map((id, i) => selecting.has(id) ? i : -1).filter(i => i >= 0);
        if (!at.length) break;
        const [from, to] = action === 'pick-up' ? [0, at.at(-1)] : [at[0], ids.length - 1];
        selecting = new Set(ids.slice(from, to + 1));
        render();
        break;
      }
      case 'forward-go': await forwardPicked(); break;
      case 'image-go': await v.busy(el, longImage); break;
      case 'forward-open': { const m = find(); if (m) forwardSheet(m); break; }
      case 'delete-go': {
        const picked = thread.messages.map((m, i) => selecting.has(m.id) ? i : -1).filter(i => i >= 0);
        if (!picked.length) break;
        // The notes between them (拍一拍, 撤回, system lines) go with them.
        const ids = thread.messages.filter((m, i) => selecting.has(m.id) || (LINE_KINDS.includes(m.kind) && i > picked[0] && i < picked.at(-1))).map(m => m.id);
        if (!await ctx.confirm(`删除这 ${selecting.size} 条消息？`, '删掉后聊天记录里就没有了，TA 之后也不会再看到这些。')) break;
        await api.deleteChatMessages(threadId, ids);
        selecting = null;
        ctx.notify(`删除了 ${ids.length} 条消息`);
        render();
        break;
      }
      case 'contact-add': addContact(); break;
      case 'contact-edit': contactDraft = structuredClone(api.getState().chat.contacts.find(c => c.id === el.dataset.id)); mode = 'contact-edit'; render(); break;
      case 'contact-cancel': contactDraft = null; mode = 'list'; render(); break;
      case 'contact-save': {
        contactDraft.name = v.root.querySelector('[data-field=contact-name]').value;
        contactDraft.persona = v.root.querySelector('[data-field=contact-persona]').value;
        api.saveContact(contactDraft);
        contactDraft = null;
        mode = 'list';
        ctx.notify('联系人已保存');
        render();
        break;
      }
      case 'contact-delete':
        if (await ctx.confirm('删除这个联系人？', '和 TA 的聊天记录会保留。')) { api.deleteContact(contactDraft.id); contactDraft = null; mode = 'list'; render(); }
        break;
    }
  });

  v.back = () => {
    if (mode === 'thread' && panel) { panel = null; syncPanel(); return true; }
    if (mode === 'thread' && selecting) { selecting = null; render(); return true; }
    if (mode !== 'list') {
      // From a chat: its picture flies back down into its row.
      const was = mode === 'thread' ? threadId : null, from = was ? v.root.querySelector('.th-head')?.firstElementChild?.getBoundingClientRect() : null;
      mode = 'list'; threadId = null; selecting = null; quote = null; contactDraft = null;
      Promise.resolve(render()).then(() => { if (from) fly(ctx.win, v.root.querySelector(`.conv[data-conv="${was}"]`)?.firstElementChild, from, {duration: 320, easing: 'bounce'}); });
      return true;
    }
    if (tab !== 'msgs') { tab = 'msgs'; render(); return true; }
    return false;
  };
  v.refresh = () => render();
  v.onAvatars = () => render();
  v.openThread = open;
  /** The chat on screen (null on the lists). */
  v.showing = () => mode === 'thread' ? threadId : null;
  v.onChat = event => {
    settingsPaint?.();
    if (mode === 'list' && tab !== 'moments') return event.typing !== undefined && !event.incoming ? undefined : render();
    if (mode === 'thread' && (!event.threadId || event.threadId === threadId)) {
      // The typing dots alone: drawn from the chat in hand, unless a read is on its way (it draws them too).
      const dots = event.typing !== undefined && !event.incoming && event.threadId === threadId;
      if (dots && reading) return;
      return render(dots);
    }
  };
  v.onPlayback = () => { if (mode === 'thread') paintVoices(); };
  v.onMoments = () => { if (mode === 'list') render(); };
  /** 动态, from the tavern page's 动态小窗. */
  v.showMoments = () => { mode = 'list'; tab = 'moments'; threadId = null; search = ''; moments.only(''); v.root.scrollTop = 0; render(); };
  const dispose = v.dispose;
  v.dispose = () => { ctx.win.clearTimeout(pace.timer); moments.dispose(); for (const url of new Set([...photoURLs.values(), ...bubbleURLs.values()])) if (url) ctx.win.URL.revokeObjectURL(url); photoURLs.clear(); bubbleURLs.clear(); dispose(); };
  render();
  return v;
}
