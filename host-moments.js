// 朋友圈, tavern side. Posts, reactions and replies are generated separately from the story with the tavern's connected
// model (generateRaw), like phone chat replies; nothing is written into the story. Pictures go through the drawing
// queue and only when they are free (NovelAI's free tier); others wait for the user to ask.
import {buildMomentsRequest, parseMoments, storyLines, MOMENTS_LIMITS} from './core/moments.js';
import {inSpace, activeChatPreset, cleanTagged} from './core/chat.js';
import {worldInfoFor, loreOptions} from './host-lore.js';
import {pictureInputs} from './core/draw.js';

export function createMomentsHost({context, settings, backend, notice, memory = null}) {
  // 记忆: what each of them talked about with the user in private (written-up layers only).
  const remembered = names => memory ? memory.aboutPeople(names).catch(() => '') : Promise.resolve('');
  let busy = null, since = 0;

  const userName = () => context()?.name1 || '我';
  const userPersona = () => String(context()?.powerUserSettings?.persona_description || '').slice(0, 1500);
  function card(name) {
    const c = context()?.characters?.find(ch => ch?.name === name);
    if (!c) return '';
    return [c.description, c.personality && '性格：' + c.personality].filter(Boolean).join('\n')
      .replaceAll('{{char}}', name).replaceAll('{{user}}', userName()).slice(0, 1500);
  }
  /** Everyone who can post: story roles first, then manual contacts, at most MOMENTS_LIMITS.people. */
  const people = () => backend.crowd().slice(0, MOMENTS_LIMITS.people).map(c => ({name: c.name, persona: c.persona, card: c.persona ? '' : card(c.name)}));
  const emit = extra => backend.emit('moments', {busy: !!busy, ...extra});
  /** 世界书 for these people: scanned over their names, the recent story and the posts in question. */
  const lore = (preset, crowd, story, texts) => preset.lore === false ? Promise.resolve('') : worldInfoFor(context, {...loreOptions(preset), persona: userPersona(), characters: crowd.map(p => p.persona || p.card).join('\n'),
    texts: [crowd.map(p => p.name).join('、'), ...story.map(r => `${r.name}: ${r.text}`), ...texts]});

  /** One model request at a time; the phone shows it as busy. */
  function run(kind, task) {
    if (busy) return busy;
    busy = (async () => {
      emit({kind});
      const ctx = context();
      return task(ctx);
    })().finally(() => { busy = null; emit({kind}); });
    return busy;
  }
  async function ask(ctx, request) {
    const text = await backend.generateText(ctx, {prompt: request, trimNames: false});
    return cleanTagged(String(text || ''), activeChatPreset(settings().chat).cleanTags);
  }
  const base = () => {
    const s = settings(), preset = activeChatPreset(s.chat), crowd = people();
    if (!crowd.length) throw Error('还没有能发朋友圈的人：先在角色 App 里添加角色，或在聊天里添加联系人');
    return {s, preset, crowd, user: userName(), names: crowd.map(p => p.name)};
  };

  /** New posts from the characters. auto: made by the story counter, not by the user. */
  function refresh({auto = false} = {}) {
    return run('refresh', async ctx => {
      const space = backend.cardKey(), {s, preset, crowd, user, names} = base();
      const recent = (await backend.moments.list()).filter(p => inSpace(p, backend.here())).slice(0, 6);
      const story = storyLines(ctx.chat, preset, user);
      const request = buildMomentsRequest({preset, earlier: memory?.storyMemory() || '', mode: 'posts', people: crowd, story, user, userPersona: userPersona(), recent, images: s.moments.images, memory: await remembered(crowd.map(p => p.name)), lore: await lore(preset, crowd, story, recent.map(p => `${p.author}: ${p.text}`))});
      const found = parseMoments(await ask(ctx, request), {names, user, mode: 'posts'});
      if (!found.posts.length) throw Error('这次没有收到新动态，可以再刷新一次');
      const posts = await backend.momentsMutate(() => backend.moments.add(found.posts.map(p => ({...p, space, source: auto ? 'auto' : 'manual', imageState: p.imageTags && s.moments.images ? 'waiting' : undefined}))));
      for (const post of posts) if (post.imageTags && s.moments.images) drawImage(post.id).catch(() => {});
      return posts;
    });
  }
  /** Friends react to the user's new post. */
  function react(postId) {
    return run('react', async ctx => {
      const {preset, crowd, user, names} = base();
      const post = await backend.moments.get(postId);
      if (!post) throw Error('这条动态已经不在了');
      const story = storyLines(ctx.chat, preset, user);
      const request = buildMomentsRequest({preset, earlier: memory?.storyMemory() || '', mode: 'react', people: crowd, story, user, userPersona: userPersona(), post, memory: await remembered(crowd.map(p => p.name)), lore: await lore(preset, crowd, story, [post.text])});
      const found = parseMoments(await ask(ctx, request), {names, user, mode: 'react'});
      return backend.momentsMutate(() => backend.moments.react(postId, found));
    });
  }
  /** Answers to the user's comment. */
  function reply(postId, commentId) {
    return run('reply', async ctx => {
      const {preset, crowd, user, names} = base();
      const post = await backend.moments.get(postId), comment = post?.comments.find(c => c.id === commentId);
      if (!post || !comment) throw Error('这条评论已经不在了');
      const story = storyLines(ctx.chat, preset, user);
      const request = buildMomentsRequest({preset, earlier: memory?.storyMemory() || '', mode: 'reply', people: crowd, story, user, userPersona: userPersona(), post, comment, memory: await remembered(crowd.map(p => p.name)), lore: await lore(preset, crowd, story, [post.text, comment.text])});
      const found = parseMoments(await ask(ctx, request), {names, user, mode: 'reply'});
      return backend.momentsMutate(() => backend.moments.react(postId, {comments: found.comments}));
    });
  }

  /** Draws a post's picture. Without allowPaid, only when NovelAI's free tier covers it. */
  async function drawImage(postId, {allowPaid = false} = {}) {
    const post = await backend.moments.get(postId);
    if (!post?.imageTags) throw Error('这条动态没有配图描述');
    const set = patch => backend.momentsMutate(() => backend.moments.setImage(postId, patch));
    if (!backend.drawReady()) { await set({imageState: 'failed', imageNote: backend.drawMissing()}); return null; }
    try {
      // The poster's saved look is used only when the picture shows a person (a selfie), not for a view or a meal.
      const person = /(\d+(?:girl|boy|other)s?|solo|selfie|portrait|upper body|cowboy shot)/i.test(post.imageTags);
      const input = pictureInputs(settings(), {prompt: post.imageTags, characters: person ? [post.author] : []}, '');
      await set({imageState: 'waiting', imageNote: ''});
      const result = await backend.generateImage({...input, allowPaid, name: `朋友圈-${post.author}`, key: `moments:${postId}`, label: `朋友圈 · ${post.author}`});
      await set({photoId: result.photoId, imageState: 'done', imageNote: ''});
      return result.photoId;
    } catch (error) {
      await set({imageState: 'failed', imageNote: error.code === 'PAID' ? backend.paidPrompt().note : error.message});
      throw error;
    }
  }

  /** Counts finished story replies; every `every` of them the characters may post, up to `dailyMax` a day. */
  async function storyReplied() {
    const m = settings().moments;
    if (!m.auto) { since = 0; return; }
    if (++since < m.every || busy) return;
    since = 0;
    try {
      if (await backend.moments.autoToday() >= m.dailyMax) return;
      const posts = await refresh({auto: true});
      if (posts?.length) notice(`${posts.map(p => p.author).join('、')} 发了朋友圈`);
    } catch { /* A failed automatic post is not worth interrupting the story. */ }
  }

  return {refresh, react, reply, drawImage, storyReplied, busy: () => !!busy};
}
