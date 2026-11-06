// 论坛: a public board next to 朋友圈. The feed (热搜 on top, then posts), a post with its replies as floors, and the
// user's own posts and replies. New posts, replies and the 热搜 are generated in the tavern page (host-apps.js).
import {rowWindow} from './row-window.js';
import {createView, esc, btn, field, input, textArea, heading, avatar, empty, menu} from './common.js';
import {icon} from './icons.js';
import {shareToChat} from './share-to-chat.js';

function ago(at) {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  const d = new Date(at);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
const count = n => n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : String(n);

export function forumApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'forum');
  let open = '', epoch = 0, posts = [], roles = new Set();
  const myName = () => api.readState().chat.profile?.name || api.userName?.() || '我';
  // 网名: everyone shows by their screen name on the board (the user's, set in 论坛 → … → 网名; characters' given or made up once).
  const net = () => api.readState().chat.netNames || {};
  const nameOf = who => who === 'me' ? net().me || myName() : net()[who] || who;
  const characters = () => new Set((api.chatContacts?.() || []).map(c => c.name));
  const face = (who, size) => who === 'me' ? avatar(myName(), 'none', size, 'me') : avatar(who, ctx.engineOf(who), size);
  const badge = (who, roles) => who === 'me' ? '<span class="forum-tag me">我</span>' : roles.has(who) ? '<span class="forum-tag">角色</span>' : '';
  const busy = () => api.forumBusy?.();

  function card(p, roles) {
    return `<button type="button" class="forum-card" data-action="open-post" data-id="${esc(p.id)}">
      <span class="forum-author">${face(p.author, 28)}<b>${esc(nameOf(p.author))}</b>${badge(p.author, roles)}<time>${ago(p.at)}</time></span>
      ${p.title ? `<strong class="forum-title">${esc(p.title)}</strong>` : ''}<span class="forum-excerpt">${esc(p.text)}</span>
      <span class="forum-meta"><span>${icon('eye')}${count(p.heat)}</span><span>${icon('bubble')}${p.replies.length}</span><span${p.liked ? ' class="on"' : ''}>${icon('heart', p.liked)}${count(p.likes)}</span></span></button>`;
  }
  // Up to a couple of hundred posts: only those near the screen are on the page.
  const feed = rowWindow({win: ctx.win, id: p => p.id, row: p => card(p, roles)});
  async function renderList(ticket) {
    const [all, hot] = await Promise.all([api.listForum(), api.forumHot()]);
    if (v.disposed || ticket !== epoch) return;
    posts = all;
    roles = characters();
    const tools = btn('forum-refresh', icon('refresh'), 'round-button', `aria-label="刷新：看看论坛上的新帖子" ${busy() ? 'disabled' : ''}`) + btn('forum-new', icon('add'), 'round-button', 'aria-label="发帖"') + btn('forum-options', icon('more'), 'round-button', 'aria-label="论坛设置"');
    v.draw(heading('论坛', tools, `Forum · ${posts.length}`)
      + (hot.length ? `<div class="forum-hot"><strong>${icon('star')}热搜</strong><ol>${hot.map((t, i) => `<li><span class="rank${i < 3 ? ' top' : ''}">${i + 1}</span>${esc(t)}</li>`).join('')}</ol></div>` : '')
      + (busy() ? '<p class="moments-busy" role="status">论坛正在刷新……</p>' : '')
      + (posts.length ? `<div class="forum-feed">${feed.html(posts)}</div>`
        : empty('论坛还没有帖子', '点右上角的刷新，角色和路人网友就会发帖、上热搜；也可以自己先发一个。每次刷新会调用一次模型。', 'bubble')));
    const box = v.root.querySelector('.forum-feed');
    if (box) feed.mount(box, v.root); else feed.stop();
  }
  async function renderPost(ticket) {
    const p = await api.getForumPost(open);
    if (v.disposed || ticket !== epoch) return;
    if (!p) { open = ''; return renderList(ticket); }
    feed.stop();
    const roles = characters();
    v.draw(heading('帖子', '', 'Forum')
      + `<article class="forum-post"><div class="forum-author">${face(p.author, 36)}<b>${esc(nameOf(p.author))}</b>${badge(p.author, roles)}<time>${ago(p.at)}</time></div>
        ${p.title ? `<h3 class="forum-title">${esc(p.title)}</h3>` : ''}<p class="forum-text">${esc(p.text)}</p>
        <div class="forum-meta"><span>${icon('eye')}${count(p.heat)} 热度</span>${btn('forum-like', icon('heart', p.liked) + count(p.likes), 'text-button' + (p.liked ? ' on' : ''), `aria-pressed="${p.liked}" aria-label="${p.liked ? '取消点赞' : '点赞'}"`)}${btn('forum-reply', icon('bubble') + '回复', 'text-button', `data-to=""`)}${btn('forum-more', icon('more'), 'text-button', 'aria-label="转发或删除"')}</div></article>`
      + (busy() ? '<p class="moments-busy" role="status">大家正在回复……</p>' : '')
      + `<div class="forum-floors">${p.replies.map((r, i) => `<button type="button" class="forum-floor" data-action="${r.from === 'me' ? 'forum-my-reply' : 'forum-reply'}" data-to="${esc(r.from)}" data-reply="${esc(r.id)}">
          ${face(r.from, 30)}<span class="floor-body"><span class="floor-head"><b>${esc(nameOf(r.from))}</b>${badge(r.from, roles)}${r.from === p.author ? '<span class="forum-tag op">楼主</span>' : ''}<span class="floor-no">${i + 1}楼</span></span>
          <span class="floor-text">${r.to ? `回复 <b>${esc(nameOf(r.to))}</b>：` : ''}${esc(r.text)}</span></span></button>`).join('') || '<p class="hint">还没有回复。</p>'}</div>`);
  }
  async function render() {
    const ticket = ++epoch;
    return open ? renderPost(ticket) : renderList(ticket);
  }

  /** Runs a model request in the background; the app shows it as busy and redraws when it ends. */
  function background(job, done) {
    render();
    job.then(result => { if (done) ctx.notify(done(result)); }).catch(error => ctx.notify(error.message, {error: true})).finally(() => render());
  }
  function sheet(title, html, action, run) {
    const d = ctx.dialog(title, html);
    d.body.addEventListener('click', e => {
      if (!e.target.closest(`[data-action="${action}"]`)) return;
      e.preventDefault();
      Promise.resolve().then(() => run(d)).catch(error => ctx.notify(error.message, {error: true}));
    });
    d.body.querySelector('input,textarea')?.focus();
    return d;
  }
  /** 网名: the user's and the characters' screen names on the board; empty ones are made up on the next refresh. */
  function netNames() {
    const names = net(), people = (api.chatContacts?.() || []).map(c => c.name);
    const d = ctx.dialog('网名', `<p class="help-copy">论坛上大家都用网名，路人和角色只看得到网名，不知道背后是谁。角色的网名空着的话，下次刷新论坛时会按人设起一个，之后一直用它。</p>
      <div class="group pad">${field('我的网名', input('net-me', names.me || '', 'text', `maxlength="30" placeholder="空着就显示「${esc(myName())}」"`))}
      ${people.map(n => field(n, input('net-' + n, names[n] || '', 'text', 'maxlength="30" placeholder="空着就让它起一个"'))).join('')}</div>
      <div class="actions">${btn('net-save', '保存', 'primary')}</div>`);
    d.body.addEventListener('click', e => {
      if (!e.target.closest('[data-action=net-save]')) return;
      const patch = {};
      for (const el of d.body.querySelectorAll('[data-field^="net-"]')) patch[el.dataset.field.slice(4)] = el.value.trim() || null;
      try { api.saveChatOptions({netNames: patch}); d.close(); ctx.notify('网名已保存'); render(); } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  function newPost() {
    const d = sheet('发帖', `<p class="hint forum-as">以「${esc(nameOf('me'))}」发帖 ${btn('net-names', '改网名', 'text-button')}</p>${field('标题', input('title', '', 'text', 'maxlength="60" placeholder="一句话说清楚想聊什么"'))}${field('正文', textArea('text', '', 'rows="5" maxlength="2000" placeholder="写点什么…"'))}
      <div class="actions">${btn('send-post', icon('send') + '发布', 'primary')}</div>`, 'send-post', async d => {
      const title = d.body.querySelector('[data-field=title]').value.trim(), text = d.body.querySelector('[data-field=text]').value.trim();
      if (!text) throw Error('正文写点什么再发');
      const post = await api.postForum({title, text});
      d.close(); open = post.id;
      if (api.forumReact) background(api.forumReact(post.id), () => '有人回复了你的帖子'); else render();
    });
    d.body.addEventListener('click', e => { if (e.target.closest('[data-action=net-names]')) { e.preventDefault(); d.close(); netNames(); } });
  }
  function replyTo(to = '') {
    const named = to && to !== 'me';
    sheet(named ? `回复 ${to}` : '回复', `${field('回复', textArea('text', '', `rows="3" maxlength="500" placeholder="${named ? '回复 ' + esc(to) : '说点什么…'}"`))}<div class="actions">${btn('send-reply', icon('send') + '发送', 'primary')}</div>`, 'send-reply', async d => {
      const text = d.body.querySelector('[data-field=text]').value.trim();
      if (!text) throw Error('写点什么再发送');
      const {reply} = await api.replyForum(open, {text, ...(named ? {to} : {})});
      d.close();
      if (api.forumReply) background(api.forumReply(open, reply.id)); else render();
    });
  }
  async function options() {
    const picked = await menu(ctx, '论坛', [
      {key: 'net-names', icon: 'edit', label: '网名', note: '你和角色在论坛上用的名字'},
      {key: 'edit-prompt', icon: 'edit', label: '帖子怎么写', note: '聊天预设里勾了「论坛」的规则（默认是「论坛口吻」）'},
      {key: 'clear-forum', icon: 'trash', label: '清空论坛', note: '所有帖子、回复和热搜', danger: true}]);
    if (picked === 'edit-prompt') { ctx.open('presets'); ctx.showPresetKind?.('chat'); }
    if (picked === 'net-names') netNames();
    if (picked === 'clear-forum' && await ctx.confirm('清空论坛？', '所有帖子、回复和热搜都会删除。')) { await api.clearForum(); open = ''; await render(); ctx.notify('论坛已清空'); }
  }

  v.back = () => { if (!open) return false; open = ''; render(); return true; };
  /** A post shared into a chat, opened from there (gone since: the list). */
  v.openPost = id => { open = String(id || ''); render().then(() => { v.root.scrollTop = 0; }).catch(() => {}); };
  v.refresh = () => render();
  v.on('click', '[data-action]', async el => {
    const post = posts.find(p => p.id === open);
    switch (el.dataset.action) {
      case 'forum-refresh': background(api.forumRefresh(), made => `刷出了 ${made.length} 个新帖子`); break;
      case 'forum-new': newPost(); break;
      case 'forum-options': options(); break;
      case 'net-names': netNames(); break;
      case 'open-post': open = el.dataset.id; await render(); v.root.scrollTop = 0; break;
      case 'forum-like': { const p = post || await api.getForumPost(open); if (p) { await api.likeForum(open, !p.liked); await render(); } break; }
      case 'forum-reply': replyTo(el.dataset.to || ''); break;
      case 'forum-my-reply': if (await ctx.confirm('删除这条回复？')) { await api.deleteForumReply(open, el.dataset.reply); await render(); } break;
      // 0.9.35: 转发 to a chat (论坛 × 聊天) and 删除 live under ⋯.
      case 'forum-more': {
        const p = post || await api.getForumPost(open);
        if (!p) break;
        const picked = await menu(ctx, p.title || '帖子', [{key: 'share', icon: 'share', label: '转发', note: '发给联系人或群，TA 读得到帖子'}, {key: 'delete', icon: 'trash', label: '删除', note: '帖子和下面的回复', danger: true}]);
        if (picked === 'share') await shareToChat(ctx, {title: '转发给…', what: '帖子', message: {kind: 'post', post: {id: p.id, title: p.title || '', author: p.author, text: String(p.text || '').slice(0, 600)}}});
        if (picked === 'delete' && await ctx.confirm('删除这个帖子？', '帖子和下面的回复会一起删除。')) { await api.deleteForum(open); open = ''; await render(); }
        break;
      }
    }
  });
  render().catch(error => ctx.notify(error.message));
  return v;
}
