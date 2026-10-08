// 论坛 and 查手机, tavern side. Like 朋友圈, they are generated apart from the story with the tavern's connected model (or
// the phone's own text model) and nothing is written into the story. One model request per app at a time.
import {buildForumRequest, parseForum} from './core/forum.js';
import {buildPeekRequest, parsePeek, peekId, mergePeek} from './core/peek.js';
import {storyLines} from './core/moments.js';
import {inSpace, activeChatPreset, cleanTagged} from './core/chat.js';
import {worldInfoFor, loreOptions} from './host-lore.js';
import {pictureInputs, sizeFor} from './core/draw.js';

const PEOPLE = 12;

export function createAppsHost({context, settings, backend, memory = null}) {
  const busy = {forum: null, peek: null};
  const userName = () => context()?.name1 || '我';
  const userPersona = () => String(context()?.powerUserSettings?.persona_description || '').slice(0, 1500);
  function card(name) {
    const c = context()?.characters?.find(ch => ch?.name === name);
    if (!c) return '';
    return [c.description, c.personality && '性格：' + c.personality].filter(Boolean).join('\n')
      .replaceAll('{{char}}', name).replaceAll('{{user}}', userName()).slice(0, 1500);
  }
  const people = () => backend.crowd().slice(0, PEOPLE).map(c => ({name: c.name, persona: c.persona, card: c.persona ? '' : card(c.name)}));
  const lore = (preset, crowd, story, texts) => preset.lore === false ? Promise.resolve('') : worldInfoFor(context, {...loreOptions(preset), persona: userPersona(), characters: crowd.map(p => p.persona || p.card).join('\n'),
    texts: [crowd.map(p => p.name).join('、'), ...story.map(r => `${r.name}: ${r.text}`), ...texts]});
  async function ask(ctx, prompt, preset) {
    return cleanTagged(String(await backend.generateText(ctx, {prompt, trimNames: false}) || ''), preset.cleanTags);
  }
  /** One request per app at a time; the phone shows it as busy. */
  function run(app, task) {
    if (busy[app]) return busy[app];
    busy[app] = (async () => { backend.emit(app, {busy: true}); return task(context()); })().finally(() => { busy[app] = null; backend.emit(app, {busy: false}); });
    return busy[app];
  }
  const base = () => {
    const s = settings(), preset = activeChatPreset(s.chat);
    return {s, preset, crowd: people(), user: userName()};
  };

  // ---------- 论坛 ----------
  /** New posts and the 热搜. */
  function forumRefresh() {
    return run('forum', async ctx => {
      // The card asked for: the tavern may move to another one while the model writes.
      const space = backend.cardKey(), hotId = backend.hotId(), {preset, crowd, user} = base();
      const recent = (await backend.apps.list('forum')).filter(p => inSpace(p, backend.here())).slice(0, 8), hot = (await backend.apps.get(hotId))?.topics || [];
      const story = storyLines(ctx.chat, preset, user);
      const prompt = buildForumRequest({preset, earlier: memory?.storyMemory() || '', mode: 'posts', people: crowd, story, user, userPersona: userPersona(), recent, hot, lore: await lore(preset, crowd, story, [...hot, ...recent.map(p => p.title)])});
      const found = parseForum(await ask(ctx, prompt, preset), {user, mode: 'posts'});
      if (!found.posts.length) throw Error('这次没有刷出新帖子，可以再刷新一次');
      if (found.hot.length) await backend.setForumHot(found.hot, hotId);
      return backend.addForumPosts(found.posts, {space});
    });
  }
  /** Replies to the user's new post. */
  function forumReact(postId) {
    return run('forum', async ctx => {
      const {preset, crowd, user} = base();
      const post = await backend.apps.get(postId);
      if (!post) throw Error('这个帖子已经不在了');
      const story = storyLines(ctx.chat, preset, user);
      const prompt = buildForumRequest({preset, earlier: memory?.storyMemory() || '', mode: 'react', people: crowd, story, user, userPersona: userPersona(), post, lore: await lore(preset, crowd, story, [post.title, post.text])});
      const found = parseForum(await ask(ctx, prompt, preset), {user, mode: 'react'});
      if (!found.replies.length) throw Error('这次没有人回复，可以再试一次');
      return backend.addForumReplies(postId, found.replies);
    });
  }
  /** Answers to the user's reply. */
  function forumReply(postId, replyId) {
    return run('forum', async ctx => {
      const {preset, crowd, user} = base();
      const post = await backend.apps.get(postId), mine = post?.replies.find(r => r.id === replyId);
      if (!post || !mine) throw Error('这条回复已经不在了');
      const story = storyLines(ctx.chat, preset, user);
      const prompt = buildForumRequest({preset, earlier: memory?.storyMemory() || '', mode: 'reply', people: crowd, story, user, userPersona: userPersona(), post, reply: mine, lore: await lore(preset, crowd, story, [post.title, mine.text])});
      const found = parseForum(await ask(ctx, prompt, preset), {user, mode: 'reply'});
      if (!found.replies.length) throw Error('这次没有人接话，可以再试一次');
      return backend.addForumReplies(postId, found.replies);
    });
  }

  // ---------- 查手机 ----------
  /** Looks into a character's phone: a new snapshot, or (keep) what is new since last time put onto the old one. */
  function peekLook(name, {keep = false} = {}) {
    return run('peek', async ctx => {
      const key = backend.spaceKey(), {preset, user} = base(), contact = backend.contacts().find(c => c.name === name);
      if (!contact) throw Error(`联系人里没有「${name}」`);
      const person = {name, persona: contact.persona, card: contact.persona ? '' : card(name)};
      const thread = (await backend.threads()).find(t => t.type === 'dm' && t.members[0] === name);
      const history = thread ? (await backend.chats.get(thread.id)).messages.filter(m => m.kind !== 'system').slice(-20) : [];
      const story = storyLines(ctx.chat, preset, user);
      const remembered = memory ? await memory.aboutPeople([name]).catch(() => '') : '';
      const before = keep ? (await backend.apps.get(peekId(name, key))) || (key ? await backend.apps.get(peekId(name)) : null) : null;
      const prompt = buildPeekRequest({preset, before, earlier: memory?.storyMemory() || '', person, story, user, userPersona: userPersona(), history, memory: remembered, images: !!backend.drawReady(), lore: await lore(preset, [person], story, history.map(m => m.text || ''))});
      const found = parsePeek(await ask(ctx, prompt, preset), {name, user});
      return backend.savePeek({name, ...mergePeek(before, found)}, key);
    });
  }

  /** Draws one photo of a character's album (index 'wallpaper': their wallpaper, upright). Without allowPaid, only when
   *  the free tier covers it. */
  async function peekDraw(name, index, {allowPaid = false} = {}) {
    // The open card's snapshot of this person, else the shared one from before 分区.
    const key = backend.spaceKey(), snap = (await backend.apps.get(peekId(name, key))) || (key ? await backend.apps.get(peekId(name)) : null), id = snap?.id;
    const wall = index === 'wallpaper', pick = doc => wall ? doc.wallpaper : doc.photos?.[index], photo = snap && pick(snap);
    if (!photo) throw Error(wall ? '没有壁纸，「再看一次」后就有了' : '这张照片已经不在了');
    if (!photo.tags) throw Error((wall ? '壁纸' : '这张照片') + '没有画图用的描述，「再看一次」后就有了');
    if (!backend.drawReady()) throw Error(backend.drawMissing() + '，相册只能看文字');
    const set = patch => backend.appsMutate('peek', () => backend.apps.change(id, doc => { const target = pick(doc); Object.assign(target, patch); for (const k of Object.keys(patch)) if (patch[k] === '') delete target[k]; }));
    // The owner's saved look only when the picture shows a person (a selfie), not for a view or a meal.
    const person = /(\d+(?:girl|boy|other)s?|solo|selfie|portrait|upper body|cowboy shot)/i.test(photo.tags);
    try {
      await set({state: 'waiting', note: ''});
      const input = pictureInputs(settings(), {prompt: photo.tags, characters: person ? [name] : []}, '');
      // A wallpaper stands upright like the phone (a square size becomes 832×1216 for 1024: about as many pixels, so the
      // free tier still holds).
      if (wall) { const up = sizeFor(input.params, '竖'), side = up.width, snap64 = n => Math.max(64, Math.round(n / 64) * 64); input.params = {...input.params, ...(up.width === up.height ? {width: snap64(side * .8125), height: snap64(side * 1.1875)} : up)}; }
      const result = await backend.generateImage({...input, allowPaid, name: `查手机-${name}`, key: `peek:${name}:${index}`, label: `查手机 · ${name}${wall ? ' · 壁纸' : ''}`});
      await set({photoId: result.photoId, state: 'done', note: ''});
      return result.photoId;
    } catch (error) {
      await set({state: 'failed', note: error.code === 'PAID' ? backend.paidPrompt().note : error.message.slice(0, 200)});
      throw error;
    }
  }

  return {forumRefresh, forumReact, forumReply, peekLook, peekDraw, busy: app => !!busy[app]};
}
