// 动态 (朋友圈) in the chat app: the characters' posts, likes and comments, and the user's own posts and comments.
// New posts, reactions and replies are generated in the tavern page (host-moments.js); this panel only shows them and
// sends what the user does. It draws into the chat app's view, inside the frame the chat app gives it (tabs and all).
import {esc, btn, empty, avatar, field, textArea, input, toggle, help} from './common.js';
import {icon} from './icons.js';
import {openImageViewer} from '../image-viewer.js';
import {downloadAction, shareAction} from '../download.js';
import {aura} from './aura.js';
import {editTags} from '../host-ask.js';
import {pictureInputs, photoTags, photoCast} from '../core/draw.js';

const SEEN_KEY = 'st-iphonie-moments-seen';
/** When the user last looked at 动态 (per browser; only for the dots). */
export function momentsSeen(win) { try { return Number(win.localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } }
function markSeen(win) { try { win.localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* the dot is only a convenience */ } }
/** Posts and comments by others since the user last looked. */
export const momentsNew = (posts, seen) => posts.reduce((n, p) => n + (p.author !== 'me' && p.at > seen ? 1 : 0) + p.comments.filter(c => c.from !== 'me' && c.at > seen).length, 0);

function ago(at) {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  const d = new Date(at), today = new Date(); today.setHours(0, 0, 0, 0);
  if (at >= today.getTime() - 86400000) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * v: the chat app's view. frame(html): the page with the chat app's tabs. me(): {name, avatar(size)} for the user.
 * visible(): whether the 动态 tab is on screen (only then does it count as seen).
 */
export function momentsPanel(ctx, {v, frame, me, visible}) {
  const {api} = ctx, urls = new Map();
  let epoch = 0, posts = [], author = '';
  const nameOf = who => who === 'me' ? me().name : who;
  const urlFor = async id => {
    if (urls.has(id)) return urls.get(id);
    const photo = await api.getPhoto(id);
    const url = photo ? ctx.win.URL.createObjectURL(photo.blob) : '';
    urls.set(id, url);
    return url;
  };
  const face = (who, size) => who === 'me' ? me().avatar(size) : avatar(who, ctx.engineOf(who), size);

  function picture(p) {
    if (p.photoId) return `<button type="button" class="moment-photo" data-action="view-photo" data-id="${esc(p.id)}" aria-label="查看配图"><img data-photo="${esc(p.photoId)}" alt="${esc(nameOf(p.author))} 的配图"></button>`;
    if (!p.imageTags) return '';
    if (p.imageState === 'waiting') return '<p class="moment-note">配图正在画……</p>';
    // Without a drawing engine set up there is nothing to retry; once it is the note turns into a button again.
    if (p.imageState === 'failed' && /密钥/.test(p.imageNote || '') && !api.drawReady()) return `<p class="moment-note">${esc(p.imageNote)}，这张配图没有画</p>`;
    if (p.imageState === 'failed') return `<button type="button" class="moment-note" data-action="draw-image" data-id="${esc(p.id)}">${esc(p.imageNote || '配图没画出来')} · 点一下重画</button>`;
    return `<button type="button" class="moment-note" data-action="draw-image" data-id="${esc(p.id)}">这条动态有配图 · 点一下画出来</button>`;
  }
  function post(p) {
    const liked = p.likes.includes('me');
    const social = p.likes.length || p.comments.length
      ? `<div class="moment-social">${p.likes.length ? `<p class="moment-likes">${icon('heart', true)}${esc(p.likes.map(nameOf).join('、'))}</p>` : ''}${p.comments.map(c => `<button type="button" class="moment-comment" data-action="${c.from === 'me' ? 'm-my-comment' : 'm-comment'}" data-id="${esc(p.id)}" data-comment="${esc(c.id)}" data-to="${esc(c.from)}"><b>${esc(nameOf(c.from))}</b>${c.to ? ` 回复 <b>${esc(nameOf(c.to))}</b>` : ''}：${esc(c.text)}</button>`).join('')}</div>`
      : '';
    return `<article class="moment" data-id="${esc(p.id)}"><button type="button" class="moment-av" data-action="m-author" data-name="${esc(p.author)}" aria-label="只看 ${esc(nameOf(p.author))} 的动态">${face(p.author, 42)}</button>
      <div class="moment-body"><strong class="moment-name">${esc(nameOf(p.author))}</strong>${p.text ? `<p class="moment-text">${esc(p.text)}</p>` : ''}${picture(p)}
        <div class="moment-meta"><time>${ago(p.at)}${p.source === 'chat' ? ' · 聊天时发的' : ''}</time><span class="moment-tools">${btn('m-like', icon('heart', liked), 'text-button', `data-id="${esc(p.id)}" aria-pressed="${liked}" aria-label="${liked ? '取消点赞' : '点赞'}"`)}${btn('m-comment', icon('bubble'), 'text-button', `data-id="${esc(p.id)}" aria-label="评论"`)}${btn('m-post-menu', icon('more'), 'text-button', `data-id="${esc(p.id)}" aria-label="更多"`)}</span></div>
        ${social}</div></article>`;
  }

  async function render() {
    const ticket = ++epoch;
    const all = await api.listMoments();
    if (ticket !== epoch || v.disposed) return;
    posts = author ? all.filter(p => p.author === author) : all;
    const busy = api.momentsBusy?.(), who = me();
    const tools = btn('m-refresh', icon('refresh'), 'round-button', `aria-label="刷新：让角色发新动态" ${busy ? 'disabled' : ''}`) + btn('m-new', icon('add'), 'round-button', 'aria-label="发动态"') + btn('m-options', icon('sliders'), 'round-button', 'aria-label="动态设置"');
    const scroll = v.root.scrollTop;
    v.draw(frame(`<div class="qzone-cover">${aura('theme')}<span class="qzone-title">好友动态</span><span class="qzone-tools">${tools}</span><span class="qzone-me">${who.avatar(58)}<strong>${esc(who.name)}</strong></span></div>`
      + (author ? `<div class="banner">${icon('person')}<span>只看 ${esc(nameOf(author))} 的动态</span>${btn('m-all', '看全部', 'chip-button')}</div>` : '')
      + (busy ? '<p class="moments-busy" role="status">朋友们正在刷动态……</p>' : '')
      + (posts.length ? `<div class="moments-feed">${posts.map(post).join('')}</div>`
        : empty(author ? `${nameOf(author)} 还没有发过动态` : '还没有动态', author ? '' : '点封面右上角的刷新，角色们就会发动态；也可以自己先发一条。每次刷新会调用一次酒馆当前的模型。', 'image'))));
    v.root.scrollTop = scroll;
    // Seen only when it is on screen: the panel also redraws in the background when new posts arrive.
    if (visible()) { markSeen(ctx.win); ctx.momentsSeen?.(); }
    for (const img of v.root.querySelectorAll('img[data-photo]')) {
      const url = await urlFor(img.dataset.photo);
      if (ticket !== epoch || v.disposed) return;
      if (url) img.src = url; else img.closest('.moment-photo')?.replaceWith(Object.assign(ctx.doc.createElement('p'), {className: 'moment-note', textContent: '配图已经从相册删掉了'}));
    }
  }

  function sheet(title, html, handlers) {
    const d = ctx.dialog(title, html);
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-action]');
      if (!b || !handlers[b.dataset.action]) return;
      e.preventDefault();
      ctx.win.Promise.resolve().then(() => handlers[b.dataset.action](b)).catch(error => ctx.notify(error.message, {error: true}));
    });
    return d;
  }
  /** Runs a model request in the background; the panel shows it as busy and redraws when it ends. */
  function background(job, done) {
    if (visible()) render();
    job.then(result => { if (done) ctx.notify(done(result)); }).catch(error => ctx.notify(error.message, {error: true})).finally(() => { if (visible()) render(); });
  }
  const replyOn = () => api.getState().moments.replyToMe !== false;

  async function newPost() {
    const photos = await api.listPhotos();
    let chosen = '';
    const d = sheet('发动态', `${field('这一刻的想法', textArea('text', '', 'rows="4" maxlength="2000" placeholder="写点什么…"'))}
      ${photos.length ? `<p class="help-copy">配一张相册里的照片（可选）</p><div class="photo-grid pick-photos">${photos.slice(0, 24).map(r => `<button data-action="pick" data-id="${esc(r.id)}" aria-pressed="false" aria-label="选择 ${esc(r.name)}"><img data-photo="${esc(r.id)}" alt="${esc(r.name)}"></button>`).join('')}</div>` : ''}
      <div class="actions">${btn('send-post', icon('send') + '发表', 'primary')}</div>`, {
      pick: b => { chosen = chosen === b.dataset.id ? '' : b.dataset.id; for (const x of d.body.querySelectorAll('[data-action=pick]')) x.setAttribute('aria-pressed', String(x.dataset.id === chosen)); },
      'send-post': async () => {
        const text = d.body.querySelector('[data-field=text]').value.trim();
        if (!text && !chosen) throw Error('写点什么，或者选一张照片');
        const made = await api.postMoment({text, ...(chosen ? {photoId: chosen} : {})});
        d.close();
        if (replyOn() && api.momentsReact) background(api.momentsReact(made.id), () => '朋友们看到了你的动态');
        else render();
      }
    });
    for (const img of d.body.querySelectorAll('img[data-photo]')) urlFor(img.dataset.photo).then(url => { if (url) img.src = url; });
  }
  function commentOn(id, to = '') {
    const reply = to && to !== 'me';
    const d = sheet(reply ? `回复 ${to}` : '评论', `${field('评论', textArea('text', '', `rows="3" maxlength="500" placeholder="${reply ? '回复 ' + esc(to) : '说点什么…'}"`))}<div class="actions">${btn('send-comment', icon('send') + '发送', 'primary')}</div>`, {
      'send-comment': async () => {
        const text = d.body.querySelector('[data-field=text]').value.trim();
        if (!text) throw Error('写点什么再发送');
        const {comment} = await api.commentMoment(id, {text, ...(reply ? {to} : {})});
        d.close();
        if (replyOn() && api.momentsReply) background(api.momentsReply(id, comment.id));
        else render();
      }
    });
    d.body.querySelector('textarea')?.focus();
  }
  function options() {
    const m = api.getState().moments;
    const d = sheet('动态设置', `<div class="group">${toggle('auto', '角色自己发动态', m.auto, '打开后，每隔几条正文回复，角色们会自己发一次动态（会调用一次酒馆当前的模型，花费和一次聊天回复差不多）。')}
        ${field('每几条正文回复发一次', input('every', m.every, 'number', 'min="1" max="100" step="1"'))}
        ${field('每天最多自动发几次', input('dailyMax', m.dailyMax, 'number', 'min="1" max="30" step="1"'))}
        ${toggle('images', '动态配图', m.images, '有画面感的动态会用绘图 App 里选的引擎画一张配图。只自动画不花钱的（NovelAI 免费档内、ComfyUI）；会扣 Anlas 或 GPT 要花钱的图，要你点一下确认。引擎没配好时只显示文字。')}
        ${toggle('replyToMe', '角色回复我', m.replyToMe, '你发动态或评论后，角色会点赞、评论和回复（每次调用一次模型）。')}</div>
      <div class="actions">${btn('edit-prompt', icon('edit') + '编辑聊天预设', 'secondary')}${help('动态怎么写，在预设 App 的聊天预设里：勾了「朋友圈」的规则就用在这里。')}</div>
      <div class="actions">${btn('clear-moments', icon('trash') + '清空动态', 'danger')}</div>`, {
      'edit-prompt': () => { d.close(); ctx.open('presets'); ctx.showPresetKind?.('chat'); },
      'clear-moments': async () => { if (!await ctx.confirm('清空所有动态？', '所有动态、点赞和评论都会删除，配图还留在相册里。')) return; d.close(); await api.clearMoments(); await render(); ctx.notify('动态已清空'); }
    });
    d.body.addEventListener('change', e => {
      const el = e.target.closest('[data-field]');
      if (!el) return;
      try { api.saveMoments({[el.dataset.field]: el.type === 'checkbox' ? el.checked : Number(el.value)}); }
      catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }

  /** Handles a click inside the panel; false when it is not the panel's. */
  async function click(el) {
    const id = el.dataset.id, target = posts.find(p => p.id === id);
    switch (el.dataset.action) {
      case 'm-refresh': background(api.momentsRefresh(), made => `${[...new Set(made.map(p => p.author))].join('、')} 发了新动态`); return true;
      case 'm-new': await newPost(); return true;
      case 'm-options': options(); return true;
      case 'm-all': author = ''; await render(); return true;
      case 'm-author': author = el.dataset.name; await render(); return true;
      case 'm-like': if (target) { await api.likeMoment(id, !target.likes.includes('me')); await render(); } return true;
      case 'm-comment': commentOn(id, el.dataset.to || ''); return true;
      case 'm-my-comment': if (await ctx.confirm('删除这条评论？')) { await api.deleteMomentComment(id, el.dataset.comment); await render(); } return true;
      case 'm-post-menu': if (await ctx.confirm('删除这条动态？', '点赞和评论会一起删除，配图还留在相册里。')) { await api.deleteMoment(id); await render(); } return true;
      case 'view-photo': {
        const img = el.querySelector('img');
        if (img?.src && target) await viewPhoto(target, img);
        return true;
      }
      case 'draw-image': {
        const paid = /Anlas|花钱/.test(target?.imageNote || ''), ask = api.paidPrompt();
        if (!paid || await ctx.confirm(ask.title, ask.text)) background(api.momentsDrawImage(id, paid));
        return true;
      }
    }
    return false;
  }
  /**
   * A post's picture, full size: the pictures drawn for it are swiped through (the one left on shows in 朋友圈), and a
   * drawn one can be drawn again, with its tags changed the way the story's pictures are (看中文, 想怎么改).
   */
  async function viewPhoto(post, img) {
    const versions = [];
    for (const photoId of [...new Set([...(post.imageVersions || []), post.photoId].filter(Boolean))]) {
      const photo = await api.getPhoto(photoId);
      if (photo) versions.push({photoId, photo, src: await urlFor(photoId)});
    }
    if (v.disposed || !versions.length) return;
    const name = `动态 · ${nameOf(post.author)}`, drawn = !!post.imageTags && post.author !== 'me';
    const current = async () => { const now = await api.getMoment(post.id); if (!now) throw Error('这条动态已经不在了'); return now; };
    const redraw = async tags => {
      const paid = api.drawQuote?.().free === false, ask = api.paidPrompt?.();
      if (paid && ask && !await ctx.confirm(ask.title, ask.text)) return false;
      background(api.momentsDrawImage(post.id, paid, tags));
    };
    const rewrite = async () => {
      const now = await current();
      const tags = await editTags({doc: ctx.doc, text: now.imageTags || '', ask: (text, mode, wish) => api.tagText ? api.tagText(text, mode, wish) : Promise.reject(Error('看中文和改要在酒馆里用')),
        about: '这张配图用的英文 tag。改了以后重画也用它；之前画的几版还在，可以左右滑着比。'});
      if (!tags?.trim()) return false;
      return redraw(tags.trim());
    };
    const inDraw = async i => {
      const now = await current(), names = [...api.getState().routes.map(r => r.name), api.userName?.() || me().name];
      const tags = photoTags({text: now.text, tags: now.imageTags, owner: now.author, names});
      ctx.openDraw({...pictureInputs(api.getState(), {prompt: tags, characters: photoCast({text: now.text, tags, owner: now.author, names})}), tag: tags, seed: Number(versions[i].photo.info?.find(row => row[0] === '种子')?.[1])});
    };
    let viewer;
    const safe = fn => async i => { viewer?.close(); try { return await fn(i); } catch (error) { ctx.notify(error.message, {error: true}); return false; } };
    viewer = openImageViewer({doc: ctx.doc, from: img, caption: post.text || '',
      gallery: {items: versions.map(x => ({src: x.src, alt: post.text || '', info: x.photo.info})), index: Math.max(0, versions.findIndex(x => x.photoId === post.photoId)),
        onIndex: i => api.momentsPickImage(post.id, versions[i].photoId).then(() => render(), error => ctx.notify(error.message))},
      actions: [downloadAction(ctx.doc, i => ({source: versions[i].photo.blob, name}), ctx.notify), shareAction(ctx.doc, i => ({source: versions[i].photo.blob, name}), ctx.notify),
        ...(drawn ? [
          {label: '重画', run: safe(() => redraw())},
          {label: '改提示词再画', run: safe(rewrite)},
          ...(ctx.openDraw ? [{label: '在绘图中打开', run: safe(inDraw)}] : []),
          {label: '删除这版', danger: true, run: safe(async i => { if (!await ctx.confirm('删除这版配图？', versions.length > 1 ? '这条动态换成别的一版。' : '这条动态就没有配图了，之后可以再画。')) return false; await api.deletePhoto(versions[i].photoId); await render(); })}
        ] : [])].filter(Boolean)});
  }
  return {
    render, click,
    /** Shows one person's posts (their profile's 「TA 的动态」), or everyone's. */
    only(name = '') { author = name; },
    dispose() { epoch++; for (const url of urls.values()) if (url) ctx.win.URL.revokeObjectURL(url); urls.clear(); }
  };
}
