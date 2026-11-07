// 发到聊天 (0.9.35): something of another app sent into a chat — a forum post (论坛 × 聊天), clothes of the 衣柜
// (衣柜 × 聊天). The user picks a recent chat or a contact to start one with; the message goes in, and a tap on the note
// that follows opens that chat. Groups the user is not in (旁观群) are not offered: nothing can be sent there.
import {esc, avatar, groupTitle} from './common.js';
import {currentDm, currentWindow, groupKey} from '../core/chats.js';

/** title: the sheet's; message: what goes in ({kind, …}, from the user); what: how it is called in the note (「这个帖子」). */
export async function shareToChat(ctx, {title = '发给…', message, what = '这条'}) {
  const {api} = ctx, threads = await api.listThreads();
  const remarks = api.readState().chat.remarks || {}, shown = name => remarks[ctx.routeFor?.(name)?.ownKey || name] || name;
  const away = new Set(threads.filter(t => t.type === 'dm' && (t.friend?.by === 'me' || t.blocked)).map(t => t.members[0]));
  const recent = threads.filter(t => currentWindow(threads, t)?.id === t.id && !t.watch && !(t.type === 'dm' && away.has(t.members[0]))).slice(0, 12);
  const others = api.chatContacts().filter(c => !away.has(c.name) && !threads.some(t => t.type === 'dm' && t.members[0] === c.name));
  const face = t => t.type === 'group' ? avatar(t.name, 'none', 38, 'g:' + groupKey(t)) : avatar(t.members[0], ctx.engineOf(t.members[0]), 38);
  const row = (key, pic, name, sub) => `<button type="button" class="list-row" data-share-to="${esc(key)}">${pic}<span><strong>${esc(name)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
  const d = ctx.dialog(title, (recent.length ? groupTitle('最近聊天') + `<div class="group">${recent.map(t => row('t:' + t.id, face(t), t.type === 'group' ? t.name : shown(t.members[0]), t.type === 'group' ? `${t.members.length} 人的群` : '')).join('')}</div>` : '')
    + (others.length ? groupTitle('联系人') + `<div class="group">${others.map(c => row('c:' + c.name, avatar(c.name, c.engine, 38), shown(c.name), '')).join('')}</div>` : '')
    + (recent.length || others.length ? '' : '<p class="hint">还没有能发的聊天：先在聊天 App 里加个联系人。</p>'));
  return new Promise(resolve => {
    let done = false, picking = false;
    const finish = value => { if (!done) { done = true; resolve(value); } };
    // (Shut without a pick: nothing sent. Shutting after a pick must not answer null before the message is in: 0.9.40.)
    d.onClose?.(() => { if (!picking) finish(null); });
    d.body.addEventListener('click', async e => {
      const key = e.target.closest('[data-share-to]')?.dataset.shareTo;
      if (!key) return;
      picking = true;
      d.close();
      try {
        const name = key.startsWith('c:') ? key.slice(2) : '';
        const to = name ? currentDm(await api.listThreads(), name) || await api.createThread({type: 'dm', members: [name]}) : threads.find(t => t.id === key.slice(2));
        if (!to) { finish(null); return; }
        await api.appendChat(to.id, [{from: 'me', ...message}], {read: true});
        const toName = to.type === 'group' ? to.name : shown(to.members[0]);
        ctx.notify(`${what}发给了${toName}，点这里去聊聊`, {tap: () => ctx.openThread?.(to.id)});
        finish(to);
      } catch (error) { ctx.notify(error.message, {error: true}); finish(null); }
    });
  });
}
