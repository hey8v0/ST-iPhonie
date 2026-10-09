import {createView, esc, btn, field, input, textArea, toggle, heading, groupTitle, avatar, avatarPicture, empty, help, copyText} from './common.js';
import {icon} from './icons.js';
import {fly} from './carry.js';
import {openImageViewer} from '../image-viewer.js';
import {saveFile, downloadAction} from '../download.js';
import {momentsPanel, momentsNew, momentsSeen} from './moments.js';
import {PROFILE_STATUS, BUBBLES, FRAMES, BACKGROUNDS, parseStickers} from '../core/chat.js';
import {callSummary} from '../core/call.js';
import {pendant} from './pendants.js';
import {memorySheet} from './chat-memory.js';
import {chatScene, sceneArt, sceneDark, syncMotion} from './chat-scenes.js';
import {PREMIUM, yuan} from '../core/wallet.js';

// Chat app, QQ style: 消息 (conversations, with search, 置顶 and 免打扰), 联系人 (特别关心, friends, groups, profile cards)
// and 动态 (朋友圈, ui/moments.js). Tapping your own avatar opens 我: name, status, signature and 个性装扮 (chat bubble,
// avatar pendant, chat background). Private and group chats have voice messages, manual contacts, and "带进剧情"
// (carry selected messages into the next story reply).
// The + button next to the message box opens the phone features: photos, emoji, red packets, transfers,
// locations, 拍一拍, dice and "let them talk". Long-press (right-click) a message to quote, recall or delete it.
// Sending only puts a message in the chat, so the user can send several in a row. With the box empty, the send button
// turns into 让对方回复 and asks the model. Replies come from the host (api.chatReply); outside the tavern the app still
// stores and shows chats.

const clock = at => new Date(at).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false});
function stamp(at) {
  const d = new Date(at), now = new Date();
  if (d.toDateString() === now.toDateString()) return clock(at);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
const dayLabel = at => { const s = stamp(at); return s.includes(':') ? '今天' : s; };
const BLESSING = '恭喜发财，大吉大利';
const you = who => who === 'me' ? '你' : who;
const patText = m => `${you(m.from)} 拍了拍 ${you(m.target)}`;
const noticeText = m => you(m.from) + String(m.text).replaceAll('{对方}', you(m.target));
// Messages drawn as a centred line instead of a bubble.
const LINE_KINDS = ['system', 'pat', 'notice', 'recall'];
export function preview(m) {
  if (!m) return '还没有消息';
  switch (m.kind) {
    case 'voice': return `[语音] ${seconds(m)}″`;
    case 'photo': return '[图片]';
    case 'sticker': return '[表情包]';
    case 'redpacket': return '[红包] ' + (m.text || BLESSING);
    case 'transfer': return '[转账] ¥' + m.amount;
    case 'gift': return '[礼物] ' + (m.gift?.name || '');
    case 'location': return '[位置] ' + m.text;
    case 'dice': return '[骰子]';
    case 'call': return `[${callSummary(m)}]`;
    case 'pat': return patText(m);
    case 'notice': return noticeText(m);
    case 'recall': return you(m.from) + ' 撤回了一条消息';
    default: return m.text;
  }
}
const quotable = m => ['text', 'voice', 'photo', 'location'].includes(m.kind);
const quoteText = m => m.kind === 'voice' ? m.translation || m.text : m.kind === 'photo' ? '[图片]' + (m.text ? ' ' + m.text : '') : m.kind === 'sticker' ? '[表情包] ' + m.text : m.kind === 'location' ? '[位置] ' + m.text : m.text;
const seconds = m => Math.max(1, Math.min(60, Math.round((m.text || '').length / 5)));
const lineOf = m => ({role: m.from, emotion: m.emotion || 'calm', text: m.text, translation: m.translation || ''});
const WAVE_HEIGHTS = [6, 12, 18, 10, 16, 22, 14, 8, 16, 20, 12, 7, 14, 10];
// Dice pips on a 3×3 grid, by face.
const PIPS = {1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]};
const EMOJI = ['😀', '😂', '🥹', '😭', '😊', '🥰', '😘', '😳', '🤔', '😴', '😡', '🙄', '😏', '🤗', '🥺', '😱', '👍', '👌', '🙏', '👏', '💪', '❤️', '💔', '✨', '🎉', '🌸', '☕', '🌙', '🍰', '🐱', '🐶', '🌧️'];
const KAOMOJI = ['(｡•̀ᴗ-)✧', '(╥﹏╥)', '(๑•̀ㅂ•́)و✧', 'ヾ(≧▽≦*)o', '(〃▽〃)', '(｀へ´)', '( ˘ω˘ )zzZ', '(ﾉ>ω<)ﾉ', '(・∀・)', 'Σ(っ °Д °;)っ', '(*/ω＼*)', '(^_−)☆'];

export function chatApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'chat');
  // mode: list (the tabs) · thread · profile (a contact's card) · me (the user's card and 个性装扮) · contact-edit
  let mode = 'list', tab = 'msgs', search = '', searching = false, profileOf = '', threadId = null, thread = null, selecting = null, contactDraft = null, epoch = 0, stick = false;
  let unreadTotal = 0, freshMoments = 0;
  let panel = null, quote = null;
  const drafts = new Map(), live = typeof api.chatReply === 'function';
  const photoURLs = new Map(), recalled = new Map(), transcribed = new Set();
  let press = null, pressedAt = 0;
  const voiceText = () => api.getState().chat.voiceText || {mode: 'translation', auto: false};
  /** 转文字 for a voice message: the translation, the original line, or both (original first). */
  function transcriptHTML(m) {
    const mode = voiceText().mode, original = m.text || '', translation = m.translation || '';
    if (mode === 'original' || !translation) return `<span class="v-text">${esc(original)}</span>`;
    if (mode === 'both' && original && original !== translation) return `<span class="v-text both"><span class="v-orig">${esc(original)}</span><span>${esc(translation)}</span></span>`;
    return `<span class="v-text">${esc(translation)}</span>`;
  }

  // ---------- The user (我) ----------
  const profile = () => api.getState().chat.profile;
  const myName = () => profile().name || api.userName?.() || '我';
  let switchTimer = 0;
  const myAvatar = size => `<span class="me-av" data-frame="${esc(profile().frame)}" style="--s:${size}px">${avatar(myName(), 'none', size, 'me')}${pendant(profile().frame)}</span>`;
  const statusLine = () => { const p = profile(); return `<i class="qq-dot" data-status="${p.status}"></i>${esc(PROFILE_STATUS[p.status])}${p.statusText ? ' · ' + esc(p.statusText) : ''}`; };
  const starred = () => api.getState().chat.starred || [];
  /** A contact's one line: a manual contact's persona, or where a role comes from. */
  const signatureOf = c => c.source === 'manual' ? (c.persona || '还没有写人设').split('\n')[0].slice(0, 40) : c.voice ? '角色 · 能发语音消息' : '角色 · 还没有配音';
  const moments = momentsPanel(ctx, {v, frame: html => frame(html), me: () => ({name: myName(), avatar: myAvatar}), visible: () => ctx.visible?.('chat') !== false && mode === 'list' && tab === 'moments'});
  /** A tab page with the tab bar under it. */
  function frame(html) {
    const tabs = [['msgs', '消息', 'chat'], ['contacts', '联系人', 'person'], ['moments', '动态', 'moments']];
    return `<div class="qq-page">${html}</div><nav class="qq-tabs" aria-label="聊天">${tabs.map(([k, l, g]) => `<button type="button" data-action="tab" data-tab="${k}" aria-pressed="${tab === k}"><span class="qq-tab-ico">${icon(g)}${k === 'msgs' && unreadTotal ? `<b class="badge">${unreadTotal > 99 ? '99+' : unreadTotal}</b>` : k === 'moments' && freshMoments && tab !== 'moments' ? '<b class="qq-dot-new" aria-label="有新动态"></b>' : ''}</span><span>${l}</span></button>`).join('')}</nav>`;
  }
  async function counts() {
    unreadTotal = await api.chatUnread().catch(() => 0);
    freshMoments = momentsNew(await api.listMoments().catch(() => []), momentsSeen(ctx.win));
  }

  const engine = name => ctx.engineOf(name);
  const groupAvatar = (members, size) => `<span class="group-av" style="--s:${size}px">${members.slice(0, 3).map(m => `<i data-engine="${engine(m)}">${esc(m.slice(0, 1))}</i>`).join('')}</span>`;
  // A group's own picture when one was chosen ('g:' + its id), else its members' first letters.
  const threadAvatar = (t, size = 48) => t.type === 'group' ? (avatarPicture('g:' + t.id) ? avatar(t.name, 'none', size, 'g:' + t.id) : groupAvatar(t.members, size)) : avatar(t.members[0], engine(t.members[0]), size);
  const pendingBring = () => api.chatPendingBring?.() || null;
  const typing = () => !!threadId && !!api.chatTyping?.(threadId);
  // A reply comes in like on a phone: its messages are stored at once (memory, unread counts and other devices see
  // them all), but the open chat shows the contact's new ones one by one, each after a typing bubble that lasts
  // about as long as typing it would — a short one pops up quickly, a long one keeps the dots going a while.
  const pace = {thread: null, seen: new Set(), hidden: new Set(), queue: [], timer: 0, fresh: null};
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
      if (on && m.from !== 'me' && !AT_ONCE.includes(m.kind)) { pace.hidden.add(m.id); pace.queue.push(m); }
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
  const partner = () => thread.type === 'group' ? '群里' : thread.members[0];

  // ---------- 消息 ----------
  function convRow(t, me) {
    const last = t.last, line = last && LINE_KINDS.includes(last.kind);
    const who = line || !last ? '' : last.from === 'me' ? '我：' : t.type === 'group' ? last.from + '：' : '';
    const atMe = t.type === 'group' && t.unread && last && last.from !== 'me' && String(last.text || '').includes('@' + me) ? '<em class="at-me">[有人@我]</em>' : '';
    const badge = t.unread ? `<span class="badge${t.muted ? ' muted' : ''}">${t.unread > 99 ? '99+' : t.unread}</span>` : '';
    const spark = t.type === 'dm' && t.streak >= 3 ? `<span class="spark" title="聊天火花：连续 ${t.streak} 天">🔥${t.streak}</span>` : '';
    return `<button class="conv${t.pinned ? ' pinned' : ''}" data-action="open" data-id="${esc(t.id)}" data-conv="${esc(t.id)}">${threadAvatar(t, 50)}<span class="grow"><span class="conv-top"><strong>${esc(t.name)}</strong>${t.type === 'group' ? '<span class="tag-s">群</span>' : ''}${spark}<span class="conv-time">${last ? stamp(last.at) : ''}</span></span><span class="conv-bot"><span class="pv">${atMe}${esc(who + preview(last))}</span>${t.muted ? `<span class="mute-ico" aria-label="免打扰">${icon('mute')}</span>` : ''}${badge}</span></span></button>`;
  }
  async function renderMessages(ticket) {
    const [threads] = await Promise.all([api.listThreads(), counts()]);
    if (v.disposed || ticket !== epoch) return;
    const q = search.trim().toLowerCase(), me = myName();
    const shown = threads.filter(t => !q || [t.name, ...t.members, preview(t.last)].some(x => String(x || '').toLowerCase().includes(q)));
    const people = q ? api.chatContacts().filter(c => c.name.toLowerCase().includes(q) && !threads.some(t => t.type === 'dm' && t.members[0] === c.name)) : [];
    const bring = pendingBring();
    v.draw(frame(`<header class="qq-top"><button type="button" class="qq-me" data-action="me" aria-label="我的资料和个性装扮">${myAvatar(42)}<span class="qq-me-text"><strong>${esc(me)}</strong><small>${statusLine()}</small></span></button>${btn('plus-menu', icon('add'), 'round-button', 'aria-label="发起聊天、添加联系人"')}</header>
      <label class="qq-search">${icon('search')}<input data-field="chat-search" type="search" value="${esc(search)}" placeholder="搜索聊天和联系人" aria-label="搜索" autocomplete="off"></label>`
      + (bring ? `<div class="banner bring-banner">${icon('book')}<span>和${esc(bring.name)}的 ${bring.count} 条消息会带进下一次正文</span>${btn('cancel-bring', '取消', 'chip-button')}</div>` : '')
      + (live ? '' : '<div class="banner">' + icon('alert') + '<span>在酒馆里打开小手机时，联系人才会回复。</span></div>')
      + (shown.length ? `<div class="conv-list qq-list">${shown.map(t => convRow(t, me)).join('')}</div>` : q ? '' : empty('还没有聊天', '点右上角的加号，和角色私聊，或者拉一个群。联系人来自角色 App，也可以手动添加。', 'chat'))
      + (people.length ? groupTitle('联系人') + `<div class="group">${people.map(c => `<button class="list-row" data-action="dm-open" data-name="${esc(c.name)}">${avatar(c.name, c.engine, 40)}<span><strong>${esc(c.name)}</strong><small>发消息</small></span>${icon('next')}</button>`).join('')}</div>` : '')
      + (q && !shown.length && !people.length ? `<p class="hint">没有找到「${esc(search)}」</p>` : '')));
    if (searching) { const box = v.root.querySelector('[data-field=chat-search]'); box?.focus({preventScroll: true}); box?.setSelectionRange?.(box.value.length, box.value.length); }
  }

  // ---------- 联系人 ----------
  async function renderContactsTab(ticket) {
    const [threads] = await Promise.all([api.listThreads(), counts()]);
    if (v.disposed || ticket !== epoch) return;
    const contacts = api.chatContacts(), stars = starred(), groups = threads.filter(t => t.type === 'group');
    const row = c => `<button class="list-row" data-action="profile" data-name="${esc(c.name)}">${avatar(c.name, c.engine, 42)}<span><strong>${esc(c.name)}</strong><small>${esc(signatureOf(c))}</small></span>${stars.includes(c.name) ? '<span class="star-mark" aria-label="特别关心">★</span>' : icon('next')}</button>`;
    const special = contacts.filter(c => stars.includes(c.name));
    v.draw(frame(heading('联系人', btn('contact-add', icon('add'), 'round-button', 'aria-label="添加联系人"'), 'Contacts')
      + (special.length ? groupTitle('特别关心') + `<div class="group">${special.map(row).join('')}</div>` : '')
      + groupTitle(`好友 · ${contacts.length}`, help('角色 App 里的角色会自动出现在这里（开了「按角色卡分开」时，在别的故事里出场过的角色只在那张卡里；可以点右上角的「＋」把他们加进来）。剧情之外的人（同学、店员、网友……）也在「＋」里手动添加，写上人设就能聊。'))
      + (contacts.length ? `<div class="group">${contacts.map(row).join('')}</div>` : '<p class="hint">还没有好友。</p>')
      + (groups.length ? groupTitle(`群聊 · ${groups.length}`) + `<div class="group">${groups.map(t => `<button class="list-row" data-action="open" data-id="${esc(t.id)}">${threadAvatar(t, 42)}<span><strong>${esc(t.name)}</strong><small>${t.members.length} 人</small></span>${icon('next')}</button>`).join('')}</div>` : '')));
  }
  /** ＋ in 联系人: a role from the 角色 App that is not here yet, or someone outside the story by hand. */
  function addContact() {
    const here = new Set(api.chatContacts().map(c => c.name)), roles = api.getState().routes.filter(r => r.name?.trim() && !here.has(r.name));
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
  /** A contact's card: send a message, see their posts, 特别关心. */
  function renderProfile() {
    const c = api.chatContacts().find(x => x.name === profileOf) || api.chatContacts(true).find(x => x.name === profileOf);
    if (!c) { mode = 'list'; return render(); }
    const star = starred().includes(c.name), manual = c.source === 'manual' && api.getState().chat.contacts.find(x => x.name === c.name);
    v.draw(`<div class="qq-card" data-engine="${c.engine}"><span class="qq-card-cover" aria-hidden="true"></span>${avatar(c.name, c.engine, 84)}<h2>${esc(c.name)}</h2><p>${esc(signatureOf(c))}</p>
        <div class="qq-card-tags"><span class="chip">${c.source === 'role' ? '角色' : '手动联系人'}</span>${c.voice ? '<span class="chip">能发语音</span>' : ''}${star ? '<span class="chip">★ 特别关心</span>' : ''}</div></div>
      <div class="actions">${btn('profile-chat', icon('chat') + '发消息', 'primary')}${api.callDial ? btn('profile-call', icon('phone') + '打电话', 'secondary') : ''}${btn('profile-moments', icon('moments') + 'TA 的动态', 'secondary')}</div>
      <div class="group">${btn('avatar-pick', `${icon('image')}<span><strong>换头像</strong><small>${esc(avatarState(c.name))}</small></span>`, 'list-row', `data-key="${esc(c.name)}"`)}${btn('star', `<span>${star ? '★ 取消特别关心' : '☆ 设为特别关心'}</span>`, 'list-row')}${manual ? `<button class="list-row" data-action="contact-edit" data-id="${esc(manual.id)}">${icon('edit')}<span><strong>编辑资料和人设</strong></span></button>` : ''}</div>`);
  }
  /** 我: name, status, signature, and 个性装扮. */
  function renderMe() {
    const p = profile();
    // The free looks, then the shop's: a bought one is put on like a free one; one not bought yet shows its price.
    const w = api.wallet();
    const chips = (key, list, value) => `<div class="deco-row">${[...Object.entries(list).map(([k, l]) => [k, l, null]), ...Object.entries(PREMIUM[key] || {}).map(([k, [l, price]]) => [k, l, price])].map(([k, l, price]) => { const owned = price === null || w.owned.includes(key + ':' + k); return `<button type="button" class="deco${price === null ? '' : ' premium'}" data-action="${owned ? 'me-set' : 'me-buy'}" data-key="${key}" data-value="${k}" data-name="${esc(l)}" data-price="${price ?? 0}" data-${key}="${k}" aria-pressed="${value === k}"><span class="deco-sample" aria-hidden="true">${key === 'frame' ? `<span class="me-av" style="--s:36px"><span class="avatar none" style="--s:36px"></span>${pendant(k)}</span>` : key === 'background' ? sceneArt(k) : ''}</span><span>${l}</span>${price === null ? '' : `<small class="deco-price">${owned ? '已拥有' : '¥' + price}</small>`}</button>`; }).join('')}</div>`;
    v.draw(heading('我', '', 'Me')
      + `<div class="qq-card me" data-bubble="${esc(p.bubble)}"><span class="qq-card-cover" aria-hidden="true"></span>${myAvatar(84)}<h2>${esc(myName())}</h2><p>${esc(p.signature || '还没有个性签名')}</p><div class="qq-card-tags"><span class="chip">${statusLine()}</span></div></div>`
      + `<div class="group pad"><div class="field"><span>头像</span><div class="actions" style="margin:0">${btn('avatar-pick', icon('image') + '换头像', 'secondary', 'data-key="me"')}</div><small class="hint">${esc(avatarState('me'))}</small></div>${field('名字', input('me-name', p.name, 'text', `maxlength="40" placeholder="${esc(api.userName?.() || '我')}（跟随酒馆里的用户名）"`))}${field('个性签名', input('me-signature', p.signature, 'text', 'maxlength="80" placeholder="写一句话"'))}
        <div class="field"><span>状态</span><div class="deco-row">${Object.entries(PROFILE_STATUS).map(([k, l]) => `<button type="button" class="status-chip" data-action="me-set" data-key="status" data-value="${k}" aria-pressed="${p.status === k}"><i class="qq-dot" data-status="${k}"></i>${l}</button>`).join('')}</div></div>
        ${field('自定义状态', input('me-statusText', p.statusText, 'text', 'maxlength="20" placeholder="例如：摸鱼中、在听歌"'))}</div>`
      + groupTitle('钱包与商城')
      + `<div class="group"><button class="list-row" data-action="me-wallet">${icon('wallet')}<span><strong>钱包</strong><small>零钱 ¥${esc(yuan(w.balance))} · 明细和收到的礼物</small></span>${icon('next')}</button><button class="list-row" data-action="me-shop">${icon('shop')}<span><strong>商城</strong><small>更好看的气泡、挂件、背景，送给角色的礼物</small></span>${icon('next')}</button></div>`
      + groupTitle('个性装扮')
      + `<div class="group pad"><div class="field"><span>聊天气泡</span>${chips('bubble', BUBBLES, p.bubble)}</div><div class="field"><span>头像挂件</span>${chips('frame', FRAMES, p.frame)}</div><div class="field"><span>聊天背景</span>${chips('background', BACKGROUNDS, p.background)}</div>
        <div class="actions" style="margin-top:0">${btn('me-bg-photo', icon('image') + (p.backgroundPhoto ? '换一张照片当背景' : '用相册里的照片当背景'), 'secondary')}${p.backgroundPhoto ? btn('me-bg-clear', '不用照片', 'text-button') : ''}</div></div>`
      + groupTitle('聊天设置')
      + `<div class="group"><button class="list-row" data-action="me-voice">${icon('book')}<span><strong>语音消息</strong><small>转文字显示什么、要不要自动转</small></span>${icon('next')}</button><button class="list-row" data-action="me-calls">${icon('phone')}<span><strong>来电</strong><small>角色会不会自己打来、响铃多久</small></span>${icon('next')}</button><button class="list-row" data-action="me-presets">${icon('edit')}<span><strong>聊天预设</strong><small>怎么回消息、朋友圈怎么发、电话里怎么说</small></span>${icon('next')}</button></div>`);
  }

  // ---------- Thread ----------
  function bodyHTML(m) {
    const mid = `data-mid="${esc(m.id)}"`;
    switch (m.kind) {
      case 'voice': return `<button class="voice-msg" data-action="voice" ${mid} data-state="ungenerated" aria-label="播放 ${esc(m.from)} 的语音"><span class="v-ico">${icon('play', true)}</span><span class="v-wave">${WAVE_HEIGHTS.map(h => `<i style="height:${h}px"></i>`).join('')}</span><span class="v-sec">${seconds(m)}″</span></button>${voiceText().auto || transcribed.has(m.id) ? transcriptHTML(m) : ''}`;
      case 'photo': return m.photoId
        ? `<button class="chat-photo" data-action="photo" ${mid} aria-label="查看照片"><img data-chat-photo="${esc(m.photoId)}" alt="${esc(m.text || '照片')}"></button>`
        : `<button class="chat-photo described" data-action="message" ${mid}><span class="ph-art">${icon('image')}</span><span class="ph-cap">${esc(m.text)}</span></button>${photoNote(m)}`;
      // A sticker: the picture without a bubble; its name when the picture cannot be loaded.
      case 'sticker': return `<button class="chat-sticker" data-action="sticker" ${mid} aria-label="表情包：${esc(m.text)}" data-name="[${esc(m.text)}]">${m.url ? `<img src="${esc(m.url)}" alt="${esc(m.text)}" loading="lazy" referrerpolicy="no-referrer" draggable="false">` : ''}</button>`;
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
      case 'call': return `<button class="call-msg${m.state === 'answered' ? '' : ' missed'}" data-action="call-log" ${mid}>${icon('phone', true)}<span>${esc(callSummary(m))}</span></button>`;
      default: return `<button class="chat-bubble" data-action="message" ${mid}>${esc(m.text)}</button>`;
    }
  }
  function lineHTML(m) {
    const mid = `data-mid="${esc(m.id)}"`;
    if (m.kind === 'system') return `<div class="sys">${icon('book')}${esc(m.text)}</div>`;
    if (m.kind === 'pat') return `<div class="note-line" ${mid}>${esc(patText(m))}</div>`;
    if (m.kind === 'notice') return `<div class="note-line" ${mid}>${/红包/.test(m.text) ? '<span class="pk-dot" aria-hidden="true"></span>' : ''}${esc(noticeText(m))}</div>`;
    const again = m.from === 'me' && recalled.has(m.id) ? btn('re-edit', '重新编辑', 'text-button', mid) : '';
    return `<div class="note-line" ${mid}>${esc(you(m.from))} 撤回了一条消息${again}</div>`;
  }
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
    if (!m.imageTags || !api.chatDrawPhoto) return '';
    if (m.imageState === 'waiting') return '<span class="ph-note">正在画……</span>';
    if (!api.drawReady?.()) return '';
    return `<button type="button" class="ph-note ph-draw" data-action="photo-draw" data-mid="${esc(m.id)}">${esc(m.imageState === 'failed' && m.imageNote ? m.imageNote + ' · ' : '')}画出来</button>`;
  }
  function messageHTML(m, i, list) {
    const day = i === 0 || new Date(list[i - 1].at).toDateString() !== new Date(m.at).toDateString() ? `<div class="day">${dayLabel(m.at)}</div>` : '';
    if (LINE_KINDS.includes(m.kind)) return day + lineHTML(m);
    const me = m.from === 'me', group = thread.type === 'group', picked = selecting?.has(m.id);
    const quoted = m.quote ? `<span class="m-quote">${esc(you(m.quote.from))}：${esc(m.quote.text)}</span>` : '';
    return day + (picked && m.id === edges.first ? rangeBar('start') : '') + `<div class="msg${me ? ' me' : ''}${m.id === pace.fresh ? ' fresh' : ''}" data-engine="${me ? 'none' : engine(m.from)}" data-kind="${m.kind}" data-mid="${esc(m.id)}"${picked ? ' data-picked' : ''}>${selecting ? '<span class="pick" aria-hidden="true"></span>' : ''}${me ? `<span class="me-side">${myAvatar(34)}</span>` : `<span class="pat-target" data-pat="${esc(m.from)}" title="双击拍一拍">${avatar(m.from, engine(m.from), 34)}</span>`}<div class="m-body">${group && !me ? `<span class="m-name">${esc(m.from)}</span>` : ''}${bodyHTML(m)}${quoted}</div></div>` + (picked && m.id === edges.last ? rangeBar('end') : '');
  }
  function toolsHTML() {
    const group = thread.type === 'group';
    const tools = [['photo', 'image', '照片'], ['emoji', 'smile', '表情'], ['redpacket', 'packet', '红包'], ...(group ? [] : [['transfer', 'swap', '转账'], ['gift', 'gift', '礼物']]),
      ['location', 'pin', '位置'], ['pat', 'hand', '拍一拍'], ['dice', 'dice', '骰子']];
    const tabs = `<div class="emoji-tabs" role="tablist">${[['emoji', '表情'], ['stickers', '表情包']].map(([k, t]) => `<button type="button" role="tab" data-action="panel-${k}" aria-selected="${panel === k}">${t}</button>`).join('')}</div>`;
    if (panel === 'stickers') {
      const list = api.getState().chat.stickers || [];
      return `<div class="chat-panel emoji-panel" role="group" aria-label="表情包">${tabs}
        ${list.length ? `<div class="sticker-grid">${list.slice().reverse().map(s => `<button type="button" class="sticker-cell" data-action="sticker-send" data-name="${esc(s.name)}" aria-label="发表情包：${esc(s.name)}" title="${esc(s.name)}"><img src="${esc(s.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false"><small>${esc(s.name)}</small></button>`).join('')}</div>`
          : '<p class="hint sticker-empty">还没有表情包。点「管理」，粘贴「名字+图片网址」就能导入一批；对方也会从里面挑着发。</p>'}
        <div class="panel-foot">${btn('panel-tools', icon('back') + '更多功能', 'text-button')}${btn('stickers-manage', icon('sliders') + '管理', 'text-button')}</div></div>`;
    }
    if (panel === 'emoji') return `<div class="chat-panel emoji-panel" role="group" aria-label="表情">${tabs}
      <div class="emoji-grid">${EMOJI.map(e => `<button data-action="emoji-pick" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
      <div class="kao-row">${KAOMOJI.map(e => `<button data-action="emoji-pick" data-emoji="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      <div class="panel-foot">${btn('panel-tools', icon('back') + '更多功能', 'text-button')}${btn('emoji-del', icon('backspace'), 'round-button', 'aria-label="删除一个字"')}</div></div>`;
    return `<div class="chat-panel" role="group" aria-label="更多功能"><div class="tool-grid">${tools.map(([action, glyph, label]) =>
      `<button class="tool" data-action="tool-${action}"><span class="tool-ico" data-tool="${action}">${icon(glyph)}</span><span>${label}</span></button>`).join('')}</div></div>`;
  }
  function composerHTML() {
    const group = thread.type === 'group';
    return `<div class="composer-wrap">
      ${quote ? `<div class="quote-bar"><span>回复 ${esc(you(quote.from))}：${esc(quote.text)}</span>${btn('quote-off', icon('close'), 'round-button', 'aria-label="取消引用"')}</div>` : ''}
      <div class="composer">${btn('panel', icon('add'), 'round-button plus', `aria-label="更多功能" aria-expanded="${!!panel}"`)}<input class="field-in" data-field="draft" value="${esc(drafts.get(threadId) || '')}" placeholder="${group ? '发到群聊…' : '发消息…'}" enterkeyhint="send" autocomplete="off" aria-label="消息">${sendButton()}</div>
      ${panel ? toolsHTML() : ''}</div>`;
  }
  async function renderThread(ticket) {
    thread = await api.getThread(threadId);
    if (v.disposed || ticket !== epoch) return;
    if (!thread) { mode = 'list'; threadId = null; return render(); }
    if (thread.unread) api.markThreadRead(threadId).catch(() => {});
    const group = thread.type === 'group', contacts = api.chatContacts(true);
    const voiced = thread.members.filter(n => contacts.find(c => c.name === n)?.voice).length;
    const sub = group ? `${thread.members.length} 人 · ${voiced} 人能发语音` : contacts.find(c => c.name === thread.members[0])?.source === 'manual' ? '手动联系人' : voiced ? '能发语音消息' : '还没有配音 · 只发文字';
    const bring = pendingBring(), scroller = v.root.querySelector('.msgs'), atBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    const focused = ctx.doc.activeElement?.dataset?.field === 'draft' && v.root.contains(ctx.doc.activeElement);
    track(thread.messages);
    const list = thread.messages.filter(m => !pace.hidden.has(m.id)), waiting = pace.queue[0];
    // Who the typing bubble is for: the next message waiting to show, or the contact while the reply is written.
    const typer = typing() || waiting ? (waiting?.from || (group ? '' : thread.members[0])) : null;
    edges = selecting?.size ? pickEdges() : {};
    const look = profile();
    const bg = look.backgroundPhoto ? 'photo' : look.background, scene = chatScene(bg);
    v.draw(`<div class="chat-thread${selecting ? ' selecting' : ''}" data-bubble="${esc(look.bubble)}" data-bg="${esc(bg)}"${scene ? ` data-scene data-tone="${sceneDark(bg) ? 'dark' : 'light'}"` : ''}>
      <div class="th-head" data-engine="${group ? 'none' : engine(thread.members[0])}">${threadAvatar(thread, 38)}<div class="th-title"><strong>${esc(thread.name)}</strong><small>${esc(sub)}</small></div>
        ${btn('bring', selecting ? '取消' : icon('book') + '<span class="bring-label">带进剧情</span>', 'chip-button', selecting ? '' : 'aria-label="带进剧情" title="带进剧情"')}${!group && api.callDial ? btn('call', icon('phone'), 'round-button call-go', 'aria-label="语音通话"') : ''}${btn('thread-menu', icon('more'), 'round-button', 'aria-label="更多"')}</div>
      <div class="msgs-wrap">${scene}<div class="msgs" role="log" aria-live="polite" data-keep-scroll="msgs-${esc(threadId)}">${list.length ? list.map((m, i) => messageHTML(m, i, list)).join('') : `<p class="chat-empty">${live ? '发几条消息都行，发完点右下角的气泡按钮让对方回复；输入框空着时发送键就会变成它。也可以直接点它，让对方先开口。' : '在酒馆里打开小手机时，联系人才会回复。'}</p>`}
        ${bring?.threadId === threadId ? `<div class="sys">${icon('book')}${bring.count} 条消息会带进下一次正文 ${btn('cancel-bring', '取消', 'text-button')}</div>` : ''}
        ${typer !== null ? `<div class="msg typing-row" data-engine="${typer ? engine(typer) : 'none'}">${avatar(typer || '…', typer ? engine(typer) : 'none', 34)}<div class="m-body"><div class="chat-bubble typing" aria-label="对方正在输入"><i></i><i></i><i></i></div></div></div>` : ''}</div></div>
      ${selecting
        ? `<div class="bring-bar"><span>${selecting.size ? `已选 ${selecting.size} 条` : '点一条消息开始，再拖上下的条条多选'}</span>${btn('bring-go', '带进下一次正文', 'primary', selecting.size ? '' : 'disabled')}</div>`
        : composerHTML()}
    </div>`);
    const msgs = v.root.querySelector('.msgs');
    if (scene) syncMotion(v.root, ctx.win);
    if (atBottom || stick) msgs.scrollTop = msgs.scrollHeight;
    stick = false;
    pace.fresh = null;
    if (focused) v.root.querySelector('[data-field=draft]')?.focus({preventScroll: true});
    paintVoices();
    paintPhotos();
    if (look.backgroundPhoto) photoURL(look.backgroundPhoto).then(url => { const box = v.root.querySelector('.msgs'); if (box && url) box.style.backgroundImage = `url("${url}")`; });
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
  // Album photos sent in the chat; each picture is read once and kept while the app is open.
  async function photoURL(id) {
    if (!photoURLs.has(id)) {
      const photo = await api.getPhoto(id);
      photoURLs.set(id, photo ? ctx.win.URL.createObjectURL(photo.blob) : '');
    }
    return photoURLs.get(id);
  }
  async function paintPhotos() {
    for (const img of v.root.querySelectorAll('img[data-chat-photo]')) {
      const url = await photoURL(img.dataset.chatPhoto);
      if (!img.isConnected) continue;
      if (url) img.src = url; else img.closest('.chat-photo')?.classList.add('missing');
    }
  }

  // Leaving a list (消息 or 联系人) for a chat, a profile or a form remembers where it was; coming back to the same tab puts it there again.
  let shownMode = 'list', left = null;
  function render() {
    const ticket = ++epoch;
    if (shownMode === 'list' && mode !== 'list') left = {tab, top: v.root.scrollTop};
    const back = shownMode !== 'list' && mode === 'list' && left?.tab === tab ? left.top : null;
    shownMode = mode;
    v.root.classList.toggle('chat-mode', mode === 'thread');
    v.root.classList.toggle('qq-mode', mode === 'list');
    if (mode === 'thread') return renderThread(ticket);
    if (mode === 'profile') return renderProfile();
    if (mode === 'me') return renderMe();
    if (mode === 'contact-edit') return renderContactForm();
    const done = tab === 'contacts' ? renderContactsTab(ticket) : tab === 'moments' ? counts().then(() => { if (ticket === epoch) return moments.render(); }) : renderMessages(ticket);
    return back === null ? done : Promise.resolve(done).then(() => { if (ticket === epoch) v.root.scrollTop = back; });
  }
  function open(id) {
    threadId = id; mode = 'thread'; selecting = null; stick = true; panel = null; quote = null;
    return render();
  }

  // ---------- Sending ----------
  /** Puts the user's messages in the chat. Nothing goes to the model until the user asks for a reply. */
  async function post(messages) {
    stick = true;
    await api.appendChat(threadId, messages, {read: true});
  }
  async function send() {
    const el = v.root.querySelector('[data-field=draft]'), text = el?.value.trim();
    // An empty box asks the other side to reply to everything sent so far.
    if (!text) { if (live && el) requestReply(); return; }
    el.value = '';
    drafts.delete(threadId);
    syncSend();
    const q = quote;
    quote = null;
    await post([{from: 'me', kind: 'text', text, ...(q ? {quote: q} : {})}]);
  }
  /** Paper plane while there is text; 让对方回复 when the box is empty. */
  const sendButton = () => {
    const empty = !(drafts.get(threadId) || '').trim(), group = thread?.type === 'group';
    return empty
      ? btn('send', icon('bubble'), 'round-button send ask', `aria-label="让${group ? '群里' : '对方'}回复" title="让${group ? '群里' : '对方'}回复" ${live ? '' : 'disabled'}`)
      : btn('send', icon('send'), 'round-button send', 'aria-label="发送" title="发送"');
  };
  function syncSend() {
    const old = v.root.querySelector('.composer [data-action=send]');
    if (!old) return;
    const empty = !(drafts.get(threadId) || '').trim();
    if (old.classList.contains('ask') === empty) return;
    old.insertAdjacentHTML('afterend', sendButton());
    old.remove();
  }
  function requestReply(id = threadId) {
    if (!live || !id) return;
    const job = api.chatReply(id);
    if (mode === 'thread' && id === threadId) render();
    job.catch(error => ctx.notify(error.message));
  }
  /** Runs a sheet's buttons: `handlers[action](button)`; errors become notices. */
  function sheet(title, html, handlers) {
    const d = ctx.dialog(title, html);
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
    const rows = await api.listPhotos(), local = [];
    let chosen = null;
    const d = sheet('发送照片', `<div class="photo-grid pick-photos">${rows.map(r => `<button data-action="pick-photo" data-id="${esc(r.id)}" aria-pressed="false" aria-label="选择 ${esc(r.name)}"><img data-photo="${esc(r.id)}" alt="${esc(r.name)}"></button>`).join('')}</div>
      ${rows.length ? '' : '<p class="help-copy">相册里还没有照片，可以直接从本地选一张。</p>'}
      <div class="actions"><label class="secondary file-button">${icon('import')}从本地选<input type="file" data-chat-file accept="image/png,image/jpeg,image/webp,image/avif,image/gif" aria-label="从本地选照片"></label></div>
      ${field('照片说明', input('caption', '', 'text', 'maxlength="200" placeholder="比如：下班路上的晚霞"'), '对方看不到图片本身，只看得到这句说明。写清楚照片里有什么，对方才好接话。')}
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
    d.onClose(() => { for (const url of local) ctx.win.URL.revokeObjectURL(url); });
    d.body.addEventListener('change', e => {
      const file = e.target.closest('[data-chat-file]')?.files?.[0];
      if (!file) return;
      api.addPhoto({name: file.name, blob: file}).then(async photo => {
        const caption = value(d, 'caption');
        d.close();
        await post([{from: 'me', kind: 'photo', photoId: photo.id, text: caption}]);
      }).catch(error => ctx.notify(error.message));
    });
    for (const row of rows) {
      const photo = await api.getPhoto(row.id);
      if (!d.live) return;
      const img = [...d.body.querySelectorAll('img[data-photo]')].find(x => x.dataset.photo === row.id);
      if (photo && img) { const url = ctx.win.URL.createObjectURL(photo.blob); local.push(url); img.src = url; }
    }
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
  const pat = name => post([{from: 'me', kind: 'pat', target: name}]);
  function choosePat() {
    if (thread.type !== 'group') return pat(thread.members[0]);
    const d = sheet('拍一拍', `<div class="pick-list">${thread.members.map(n => `<button class="list-row" data-action="pat-one" data-name="${esc(n)}">${avatar(n, engine(n), 36)}<span><strong>${esc(n)}</strong></span>${icon('hand')}</button>`).join('')}</div>`, {
      'pat-one': async b => { d.close(); await pat(b.dataset.name); }
    });
  }
  const rollDice = () => post([{from: 'me', kind: 'dice', text: String(1 + Math.floor(Math.random() * 6))}]);
  // ---------- 表情包 ----------
  /** Import (「名字URL, 名字URL」), look through, remove; the same text copies them out to share. */
  function manageStickers() {
    const list = () => api.getState().chat.stickers || [];
    const rows = () => list().length ? `<div class="sticker-manage">${list().slice().reverse().map(s => `<div class="sticker-row"><img src="${esc(s.url)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span><strong>${esc(s.name)}</strong><small>${esc(s.url)}</small></span>${btn('sticker-remove', icon('trash'), 'text-button', `data-name="${esc(s.name)}" aria-label="删除 ${esc(s.name)}"`)}</div>`).join('')}</div>` : '<p class="hint">还没有表情包。</p>';
    const d = ctx.dialog('表情包', `<p class="help-copy">粘贴「名字+图片网址」，一个一行或用逗号隔开，比如：<br><code>开心https://…/a.gif, 委屈https://…/b.png</code><br>名字中间别有空格；同名的会换成新的。对方也会按名字从里面挑着发。</p>
      ${field('导入', textArea('sticker-text', '', 'rows="4" placeholder="开心https://example.com/happy.gif, 生气https://example.com/angry.png"'))}
      <div class="actions">${btn('sticker-import', icon('import') + '导入', 'primary')}${btn('sticker-copy', icon('copy') + '复制全部', 'secondary')}</div>
      ${groupTitle('已有', `<small data-sticker-count>${list().length}</small>`)}<div data-sticker-list>${rows()}</div>
      <div class="actions">${btn('sticker-clear', icon('trash') + '清空表情包', 'danger')}</div>`);
    const redraw = () => { d.body.querySelector('[data-sticker-list]').innerHTML = rows(); d.body.querySelector('[data-sticker-count]').textContent = list().length; if (panel === 'stickers') syncPanel(); };
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
            if (!list().length) { ctx.notify('还没有表情包'); break; }
            await copyText(ctx.win, list().map(s => s.name + s.url).join(',\n'));
            ctx.notify('已复制，可以发给别人导入');
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
    drafts.set(threadId, el.value);
    syncSend();
  }
  function deleteChar() {
    const el = v.root.querySelector('[data-field=draft]');
    if (!el?.value) return;
    el.value = [...el.value].slice(0, -1).join('');
    drafts.set(threadId, el.value);
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
      ${groupTitle('明细')}<div class="group">${w.ledger.map(e => `<div class="setting-row ledger-row"><span><strong>${esc(kinds[e.kind] || e.kind)}${e.who ? ' · ' + esc(e.who) : ''}</strong><small>${esc([e.note, when(e.at)].filter(Boolean).join(' · '))}</small></span><b class="${e.amount > 0 ? 'in' : 'out'}">${e.amount > 0 ? '+' : '−'}¥${esc(yuan(Math.abs(e.amount)))}</b></div>`).join('')}</div>`, {
      'wallet-shop': () => { d.close(); openShop(); }
    });
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

  // ---------- Menus ----------
  function messageMenu(m) {
    const contact = m.from !== 'me', last = contact && thread.messages.at(-1)?.id === m.id;
    const copyable = ['text', 'voice', 'location', 'photo'].includes(m.kind) && quoteText(m);
    const canRecall = !contact && !['redpacket', 'transfer', 'gift'].includes(m.kind);
    const shown = m.kind === 'voice' ? (m.translation || m.text) : m.kind === 'dice' ? `骰子 ${m.text} 点` : ['redpacket', 'transfer', 'gift'].includes(m.kind) ? preview(m) : quoteText(m);
    const voice = m.kind === 'voice', open = voice && (voiceText().auto || transcribed.has(m.id));
    const d = sheet('消息', `${voice ? '' : `<p class="help-copy">${esc(shown)}</p>`}
      ${voice ? `<div class="actions">${btn('transcribe', icon('book') + (open ? '收起文字' : '转文字'), 'primary')}${btn('download', icon('download') + '下载语音', 'secondary')}</div>` : ''}
      <div class="actions">${quotable(m) ? btn('quote', icon('reply') + '引用', 'secondary') : ''}${copyable ? btn('copy', icon('copy') + '复制', 'secondary') : ''}</div>
      <div class="actions">${canRecall ? btn('recall', icon('undo') + '撤回', 'secondary') : ''}${btn('delete', icon('trash') + '删除', 'danger')}</div>
      ${last && live ? `<div class="actions">${btn('reroll', icon('refresh') + '重新回复这一轮', 'secondary')}</div>` : ''}`, {
      transcribe: () => {
        d.close();
        if (open && voiceText().auto) { ctx.notify('语音自动转文字开着，可以在右上角「⋯ → 语音消息」里关掉'); return; }
        if (open) transcribed.delete(m.id); else transcribed.add(m.id);
        render();
      },
      download: async () => { d.close(); const {blob, name} = await api.audioFile({line: lineOf(m)}); ctx.notify('已下载 ' + await saveFile(ctx.doc, blob, name)); },
      quote: () => { d.close(); quote = {from: m.from, text: quoteText(m).slice(0, 200)}; panel = null; render(); },
      copy: async () => { d.close(); ctx.notify(await copyText(ctx.win, m.kind === 'voice' ? m.text : quoteText(m)) ? '已复制' : '这个浏览器不让复制，可以长按文字手动复制'); },
      recall: async () => {
        d.close();
        if (m.kind === 'text') recalled.set(m.id, m.text);
        await api.updateChatMessage(threadId, m.id, {recall: true});
      },
      delete: async () => { d.close(); await api.deleteChatMessages(threadId, [m.id]); },
      reroll: async () => { d.close(); await reroll(); }
    });
  }
  // Removes the contacts' latest messages (after the user's last one) and asks again.
  async function reroll() {
    const list = thread.messages, cut = list.findLastIndex(m => m.from === 'me' && m.kind !== 'system');
    const drop = list.slice(cut + 1).filter(m => m.from !== 'me').map(m => m.id);
    if (drop.length) await api.deleteChatMessages(threadId, drop);
    requestReply();
  }
  function newChat() {
    const contacts = api.chatContacts();
    const d = ctx.dialog('新建聊天', contacts.length
      ? `${groupTitle('私聊')}<div class="pick-list">${contacts.map(c => `<button class="list-row" data-new-dm="${esc(c.name)}">${avatar(c.name, c.engine, 36)}<span><strong>${esc(c.name)}</strong><small>${c.source === 'role' ? (c.voice ? '角色 · 能发语音' : '角色 · 只发文字') : '手动联系人'}</small></span>${icon('next')}</button>`).join('')}</div>
        ${contacts.length > 1 ? `${groupTitle('群聊')}<div class="pick-list">${contacts.map(c => `<label class="setting-row"><span>${avatar(c.name, c.engine, 28)}${esc(c.name)}</span><input class="switch" type="checkbox" data-member="${esc(c.name)}" aria-label="拉 ${esc(c.name)} 进群"></label>`).join('')}</div>
          ${field('群名', input('group-name', '', 'text', 'maxlength="40" placeholder="可以不填"'))}<div class="actions">${btn('create-group', icon('group') + '建群', 'primary')}</div>` : ''}
        <div class="actions">${btn('manage-contacts', icon('person') + '管理联系人', 'text-button')}</div>`
      : `<p class="help-copy">还没有联系人。在角色 App 里新增角色，或者手动添加一个联系人。</p><div class="actions">${btn('manage-contacts', icon('add') + '添加联系人', 'primary')}</div>`);
    d.body.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      ctx.win.Promise.resolve().then(async () => {
        if (b.dataset.newDm) {
          const existing = (await api.listThreads()).find(t => t.type === 'dm' && t.members[0] === b.dataset.newDm);
          const t = existing || await api.createThread({type: 'dm', members: [b.dataset.newDm]});
          d.close(); open(t.id);
        }
        if (b.dataset.action === 'create-group') {
          const members = [...d.body.querySelectorAll('[data-member]:checked')].map(x => x.dataset.member);
          const t = await api.createThread({type: 'group', members, name: d.body.querySelector('[data-field=group-name]').value});
          d.close(); open(t.id);
        }
        if (b.dataset.action === 'manage-contacts') { d.close(); mode = 'list'; tab = 'contacts'; contactDraft = null; render(); }
      }).catch(error => ctx.notify(error.message));
    });
  }
  /** Options for voice messages in every chat: what 转文字 shows, and whether it happens by itself. */
  function voiceTextSheet() {
    const draw = () => {
      const o = voiceText();
      return `<p class="help-copy">语音消息平时只显示语音条，长按（电脑上右键）选「转文字」才显示文字。</p>
        <div class="field"><span>转文字显示</span><div class="segmented" style="margin:0">${[['translation', '中文译文'], ['original', '原文'], ['both', '原文和译文']].map(([k, l]) => `<button data-action="vt-mode" data-mode="${k}" aria-pressed="${o.mode === k}">${l}</button>`).join('')}</div></div>
        <div class="setting-row"><span>新旧语音都自动转文字</span><input class="switch" type="checkbox" data-field="vt-auto" aria-label="语音自动转文字" ${o.auto ? 'checked' : ''}></div>`;
    };
    const d = sheet('语音消息', `<div class="vt-body">${draw()}</div>`, {
      'vt-mode': b => { api.saveChatOptions({voiceText: {mode: b.dataset.mode}}); d.body.querySelector('.vt-body').innerHTML = draw(); render(); }
    });
    d.body.addEventListener('change', e => {
      if (!e.target.matches('[data-field=vt-auto]')) return;
      try { api.saveChatOptions({voiceText: {auto: e.target.checked}}); render(); } catch (error) { ctx.notify(error.message); }
    });
  }
  /** Where an avatar comes from, in words. */
  function avatarState(key) {
    const chosen = api.getState().chat.avatars?.[key];
    if (chosen?.kind === 'photo') return '用的是相册里的照片';
    if (chosen?.kind === 'text') return '只显示文字';
    return avatarPicture(key) ? (key === 'me' ? '用的是酒馆里当前人设的头像' : '用的是酒馆角色卡的头像') : '只显示文字（酒馆里没有这个头像）';
  }
  /** Picks an avatar for the user ('me') or a contact: an album photo, a new picture, the tavern's avatar, or text. */
  async function avatarSheet(key, {title = '', reset = '用酒馆的头像'} = {}) {
    const rows = (await api.listPhotos()).slice(0, 30), who = key === 'me' ? '我' : key, chosen = api.getState().chat.avatars?.[key];
    const d = ctx.dialog(title || `${who}的头像`, `<p class="help-copy">点一张照片，或者上传一张新的。</p>
      <label class="secondary file-button">${icon('import')}上传图片<input type="file" accept="image/*" data-avatar-file hidden></label>
      ${rows.length ? `<div class="photo-grid pick-photos">${rows.map(r => `<button data-avatar-photo="${esc(r.id)}" aria-label="用 ${esc(r.name)} 当头像"${chosen?.photoId === r.id ? ' aria-pressed="true"' : ''}><img data-chat-photo="${esc(r.id)}" alt=""></button>`).join('')}</div>` : '<p class="hint">相册里还没有照片。</p>'}
      <div class="actions">${btn('avatar-tavern', reset, 'secondary')}${btn('avatar-text', '只显示文字', 'text-button')}</div>`);
    for (const img of d.body.querySelectorAll('img[data-chat-photo]')) photoURL(img.dataset.chatPhoto).then(url => { if (url) img.src = url; });
    const choose = value => { d.close(); api.saveChatOptions({avatars: {[key]: value}}); ctx.notify('头像已换好'); };
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
  function callsSheet() {
    const o = () => api.getState().calls;
    const draw = () => `<div class="setting-row"><span>角色自己打来${help('角色可以给你打语音电话：接通后用 TA 的音色说话，你打字回。打开这里后，每隔几条正文回复，角色可能会自己打来；不打开时，聊天里角色偶尔也会直接打过来（聊天预设的「打电话」规则）。每句话都要调用一次模型并生成语音。')}</span><input class="switch" type="checkbox" data-field="call-auto" aria-label="角色自己打来" ${o().auto ? 'checked' : ''}></div>
      <div class="field"><span>每几条正文回复可能打来一次</span><input data-field="call-every" type="number" min="1" max="100" value="${o().every}"></div>
      <div class="field"><span>每天最多</span><input data-field="call-dailyMax" type="number" min="1" max="10" value="${o().dailyMax}"></div>
      <div class="field"><span>响铃多久算未接（秒）</span><input data-field="call-ring" type="number" min="15" max="60" value="${o().ring}"></div>`;
    const d = sheet('来电', `<div class="calls-body">${draw()}</div>`, {});
    d.body.addEventListener('change', e => {
      const key = e.target.dataset.field?.replace(/^call-/, '');
      if (!key) return;
      try { api.saveCalls({[key]: key === 'auto' ? e.target.checked : Number(e.target.value)}); d.body.querySelector('.calls-body').innerHTML = draw(); } catch (error) { ctx.notify(error.message); }
    });
  }
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
        if (action === 'delete' && await ctx.confirm('删除这段聊天？', '聊天记录会一起删除，联系人不受影响。')) await api.deleteThread(id);
        render();
      }).catch(error => ctx.notify(error.message));
    });
  }
  function plusMenu() {
    const d = ctx.dialog('发起', `<div class="pick-list">
      <button class="list-row" data-menu="chat">${icon('chat')}<span><strong>发起聊天</strong><small>私聊，或者拉几个人建群</small></span></button>
      <button class="list-row" data-menu="contact">${icon('person')}<span><strong>添加联系人</strong><small>剧情之外的人，写上人设就能聊</small></span></button>
      <button class="list-row" data-menu="me">${icon('smile')}<span><strong>个性装扮</strong><small>气泡、头像挂件、聊天背景、状态</small></span></button></div>`);
    d.body.addEventListener('click', e => {
      const action = e.target.closest('[data-menu]')?.dataset.menu;
      if (!action) return;
      d.close();
      if (action === 'chat') newChat();
      if (action === 'contact') { contactDraft = {name: '', persona: ''}; mode = 'contact-edit'; render(); }
      if (action === 'me') { mode = 'me'; render(); }
    });
  }
  async function pickBackground() {
    const rows = await api.listPhotos();
    if (!rows.length) throw Error('相册里还没有照片，先在相册里导入一张');
    const d = ctx.dialog('选一张聊天背景', `<div class="photo-grid pick-photos">${rows.slice(0, 30).map(r => `<button data-bg-photo="${esc(r.id)}" aria-label="用 ${esc(r.name)} 当背景"><img data-chat-photo="${esc(r.id)}" alt="${esc(r.name)}"></button>`).join('')}</div>`);
    for (const img of d.body.querySelectorAll('img[data-chat-photo]')) photoURL(img.dataset.chatPhoto).then(url => { if (url) img.src = url; });
    d.body.addEventListener('click', e => {
      const id = e.target.closest('[data-bg-photo]')?.dataset.bgPhoto;
      if (!id) return;
      d.close();
      api.saveChatOptions({profile: {backgroundPhoto: id}});
      render();
    });
  }
  async function openDm(name) {
    const existing = (await api.listThreads()).find(t => t.type === 'dm' && t.members[0] === name);
    const t = existing || await api.createThread({type: 'dm', members: [name]});
    open(t.id);
  }
  function threadMenu() {
    const group = thread.type === 'group';
    const d = ctx.dialog(thread.name, `<div class="pick-list">
      ${live ? `<button class="list-row" data-menu="reroll">${icon('refresh')}<span><strong>重新回复最后一轮</strong></span></button>` : ''}
      ${group ? `<button class="list-row" data-menu="rename">${icon('edit')}<span><strong>改群名</strong></span></button><button class="list-row" data-menu="group-avatar">${icon('image')}<span><strong>换群头像</strong><small>从相册选一张或上传，也可以换回成员拼的头像</small></span></button>` : ''}
      <button class="list-row" data-menu="memory">${icon('book')}<span><strong>记忆</strong><small>更早的聊天整理成的摘要和总结，可以改</small></span></button>
      <button class="list-row" data-menu="voice-text">${icon('book')}<span><strong>语音消息</strong><small>转文字显示什么、要不要自动转</small></span></button>
      <button class="list-row" data-menu="pace">${icon('chat')}<span><strong>逐条显示回复：${api.getState().chat.pace !== false ? '开' : '关'}</strong><small>对方的消息像真人打字一样一条条出来；关掉就一次全显示</small></span></button>
      <button class="list-row" data-menu="clear">${icon('trash')}<span><strong>清空聊天记录</strong></span></button>
      <button class="list-row" data-menu="delete">${icon('close')}<span><strong>删除这段聊天</strong></span></button></div>`);
    d.body.addEventListener('click', e => {
      const action = e.target.closest('[data-menu]')?.dataset.menu;
      if (!action) return;
      d.close();
      ctx.win.Promise.resolve().then(async () => {
        if (action === 'reroll') await reroll();
        if (action === 'rename') {
          const r = ctx.dialog('改群名', `${field('群名', input('rename', thread.name, 'text', 'maxlength="40"'))}<div class="actions">${btn('rename-save', '保存', 'primary')}</div>`);
          r.body.addEventListener('click', ev => { if (ev.target.closest('[data-action=rename-save]')) { const name = r.body.querySelector('[data-field=rename]').value; r.close(); api.updateThread(threadId, {name}).catch(err => ctx.notify(err.message)); } });
        }
        if (action === 'voice-text') voiceTextSheet();
        if (action === 'group-avatar') await avatarSheet('g:' + threadId, {title: `${thread.name} 的群头像`, reset: '用成员拼的头像'});
        if (action === 'pace') { const on = api.getState().chat.pace === false; api.saveChatOptions({pace: on}); if (!on) { ctx.win.clearTimeout(pace.timer); pace.timer = 0; pace.queue = []; pace.hidden.clear(); render(); } ctx.notify(on ? '对方的消息会一条条出来' : '对方的消息会一次全显示'); }
        if (action === 'memory') memorySheet(ctx, {threadId, title: thread.name});
        if (action === 'clear' && await ctx.confirm('清空聊天记录？', '这段聊天会保留，消息全部删除。')) await api.deleteChatMessages(threadId, thread.messages.map(m => m.id));
        if (action === 'delete' && await ctx.confirm('删除这段聊天？', '聊天记录会一起删除，联系人不受影响。')) { if (api.getState().chat.avatars?.['g:' + threadId]) api.saveChatOptions({avatars: {['g:' + threadId]: null}}); await api.deleteThread(threadId); mode = 'list'; threadId = null; render(); }
      }).catch(error => ctx.notify(error.message));
    });
  }

  v.on('input', '[data-field=draft]', el => { drafts.set(threadId, el.value); syncSend(); });
  v.on('input', '[data-field=chat-search]', el => { search = el.value; searching = true; render(); });
  v.on('focusout', '[data-field=chat-search]', () => { searching = false; });
  v.on('change', '[data-field^=me-]', el => {
    const key = el.dataset.field.slice(3);
    try { api.saveChatOptions({profile: {[key]: el.value}}); render(); } catch (error) { ctx.notify(error.message, {error: true}); }
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
      if (label) label.textContent = `已选 ${picked.size} 条`;
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
    if (selecting && ['message', 'voice', 'photo', 'packet', 'transfer', 'gift'].includes(action)) return;
    const find = () => thread.messages.find(x => x.id === el.dataset.mid);
    switch (action) {
      case 'tab': {
        if (tab !== el.dataset.tab) { v.root.dataset.switching = el.dataset.tab; ctx.win.clearTimeout(switchTimer); switchTimer = ctx.win.setTimeout(() => delete v.root.dataset.switching, 420); }
        tab = el.dataset.tab; search = ''; if (tab === 'moments') moments.only(''); v.root.scrollTop = 0; render(); break;
      }
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
      case 'me-wallet': openWallet(); break;
      case 'me-shop': openShop(); break;
      case 'me-bg-photo': await pickBackground(); break;
      case 'me-bg-clear': api.saveChatOptions({profile: {backgroundPhoto: ''}}); render(); break;
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
      case 'profile-moments': mode = 'list'; tab = 'moments'; moments.only(profileOf); render(); break;
      case 'star': {
        const list = starred(), on = !list.includes(profileOf);
        api.saveChatOptions({starred: on ? [...list, profileOf] : list.filter(n => n !== profileOf)});
        ctx.notify(on ? `已把 ${profileOf} 设为特别关心` : '已取消特别关心');
        render();
        break;
      }
      case 'send': await send(); break;
      case 'panel': panel = panel ? null : 'tools'; syncPanel(); break;
      case 'panel-tools': panel = 'tools'; syncPanel(); break;
      case 'tool-emoji': case 'panel-emoji': panel = 'emoji'; syncPanel(); break;
      case 'panel-stickers': panel = 'stickers'; syncPanel(); break;
      case 'sticker-send': {
        const s = (api.getState().chat.stickers || []).find(x => x.name === el.dataset.name);
        if (s) await post([{from: 'me', kind: 'sticker', text: s.name, url: s.url}]);
        break;
      }
      case 'stickers-manage': manageStickers(); break;
      case 'sticker': {
        const m = find(), img = el.querySelector('img');
        if (!m || !img?.src || el.classList.contains('broken')) { if (m) messageMenu(m); break; }
        openImageViewer({doc: ctx.doc, src: img.src, alt: m.text, from: img, caption: m.text, actions: [{label: '消息选项', run: () => messageMenu(m)}]});
        break;
      }
      case 'emoji-pick': insertText(el.dataset.emoji); break;
      case 'emoji-del': deleteChar(); break;
      case 'tool-photo': panel = null; syncPanel(); await sendPhoto(); break;
      case 'tool-redpacket': panel = null; syncPanel(); sendPacket(); break;
      case 'tool-transfer': panel = null; syncPanel(); sendTransfer(); break;
      case 'tool-gift': panel = null; syncPanel(); sendGift(); break;
      case 'tool-location': panel = null; syncPanel(); sendLocation(); break;
      case 'tool-pat': panel = null; syncPanel(); await choosePat(); break;
      case 'tool-dice': panel = null; syncPanel(); await rollDice(); break;
      case 'quote-off': quote = null; render(); break;
      case 're-edit': {
        const text = recalled.get(el.dataset.mid) || '';
        recalled.delete(el.dataset.mid);
        drafts.set(threadId, (drafts.get(threadId) || '') + text);
        render();
        break;
      }
      case 'message': { const m = find(); if (m) messageMenu(m); break; }
      case 'photo': {
        const m = find(), img = el.querySelector('img');
        if (!m || !img?.src) break;
        // What the photo shows (the words it was drawn from) is told only once it is opened.
        openImageViewer({doc: ctx.doc, src: img.src, alt: img.alt, from: img, caption: m.text || '', actions: [downloadAction(ctx.doc, () => ({source: img.src, name: `${m.from === 'me' ? '我' : m.from} 的照片`}), ctx.notify), {label: '消息选项', run: () => messageMenu(m)}]});
        break;
      }
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
      case 'bring': selecting = selecting ? null : new Set(); panel = null; render(); break;
      case 'bring-go': {
        const count = selecting.size;
        if (!live) throw Error('在酒馆里打开小手机时才能带进剧情');
        await api.chatBring(threadId, [...selecting]);
        selecting = null;
        ctx.notify(`下一次正文会带上这 ${count} 条消息`);
        render();
        break;
      }
      case 'cancel-bring': api.chatCancelBring?.(); ctx.notify('已取消'); render(); break;
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
  v.onChat = event => {
    if (mode === 'list' && tab !== 'moments') return render();
    if (mode === 'thread' && (!event.threadId || event.threadId === threadId)) return render();
  };
  v.onPlayback = () => { if (mode === 'thread') paintVoices(); };
  v.onMoments = () => { if (mode === 'list') render(); };
  const dispose = v.dispose;
  v.dispose = () => { ctx.win.clearTimeout(pace.timer); moments.dispose(); for (const url of photoURLs.values()) if (url) ctx.win.URL.revokeObjectURL(url); photoURLs.clear(); dispose(); };
  render();
  return v;
}
