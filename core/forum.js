import {promptRule} from './prompt-rules.js';
// 论坛: a public board everyone can read, next to 朋友圈 (which only friends see). Characters post and reply there,
// and so do strangers (路人) with their own screen names. No DOM or network here: the prompts, the parser for the model's
// answer and the checks on what is stored.
//
// The model answers in tagged lines, one item per line:
//   【热搜】话题                     a trending topic (only when asking for new posts)
//   【帖子】作者｜标题｜正文          a new post; 作者 is a character's name or a stranger's screen name
//   【回复】作者：内容                a reply to the post above; 「作者 回复 某人：内容」 answers someone
//   【网名】真名｜网名                 a screen name made up for a character who had none (kept from then on)
// Everyone is on the board by a screen name (网名): the user's and the characters' are given (or made up once) and the
// model writes only those; the answer is read back to the real names, which is how posts are stored.
import {isPlaceholderRole} from './protocol.js';

export const FORUM_LIMITS = Object.freeze({posts: 200, replies: 80, perRefresh: 5, hot: 8, title: 60, text: 2000, reply: 500});

const fill = (template, values) => String(template).replace(/\{\{(.+?)\}\}/g, (m, key) => values[key.trim()] ?? m);
const who = (name, user) => name === 'me' ? user : name;
const clip = (value, max) => String(value ?? '').slice(0, max);
const person = value => clip(value, 30).replace(/[|｜]/g, '').trim();

/** A post as the model reads it: author, title, text and the replies under it. label: the name shown for someone. */
export function postLines(post, user, max = 30, label = name => who(name, user)) {
  const lines = [`${label(post.author)}｜${post.title || '（无标题）'}｜${post.text}`];
  for (const r of (post.replies || []).slice(-max)) lines.push(`  ${label(r.from)}${r.to ? ' 回复 ' + label(r.to) : ''}：${r.text}`);
  return lines.join('\n');
}
/** How someone shows on the board: the user's 网名 for 'me', a character's 网名, or the name itself. */
export const screenName = (handles = {}, user = '我') => name => name === 'me' ? handles.me || user : handles[name] || name;

/**
 * The request for 论坛, with the chat preset's rules used in 论坛. mode 'posts': new posts and the 热搜;
 * 'react': replies to the user's new post; 'reply': answers to the user's reply. people: [{name, persona, card}].
 */
/** Who knows what on a public forum: strangers only what is public; characters only what they lived, and they keep it to themselves. */
export function forumKnows(user, prompts = {}) {
  return ['【论坛上的人知道什么】',
    promptRule(prompts, "forum.forumKnows.001"),
    promptRule(prompts, "forum.forumKnows.002"),
    promptRule(prompts, "forum.forumKnows.003"),
    promptRule(prompts, "forum.forumKnows.004", {"用户": (user)}),
    promptRule(prompts, "forum.forumKnows.005"),
    promptRule(prompts, "forum.forumKnows.006", {"用户": (user)}),
    promptRule(prompts, "forum.forumKnows.007")].join('\n');
}
export function buildForumRequest({prompts = {}, preset, mode = 'posts', people, story = [], user = '我', userPersona = '', recent = [], hot = [], post = null, reply = null, lore = '', earlier = '', handles = {}}) {
  const label = screenName(handles, user), missing = people.filter(p => !handles[p.name]).map(p => p.name);
  const rules = preset.entries.filter(e => e.enabled && e.text.trim() && (e.use || []).includes('forum')).map(e => fill(e.text, {'用户': user}));
  const system = [
    rules.join('\n\n'),
    people.length ? promptRule(prompts, "forum.buildForumRequest.001", {"动态内容1": (people.map(p => `- ${handles[p.name] ? `网名「${handles[p.name]}」，其实是${p.name}` : p.name}：${(p.persona || p.card || '').trim() || '（没有资料，按剧情里的表现来）'}`).join('\n'))}) : '',
    lore.trim() ? promptRule(prompts, "forum.buildForumRequest.002", {"动态内容1": (lore.trim())}) : '',
    userPersona.trim() ? promptRule(prompts, "forum.buildForumRequest.003", {"用户": (user), "用户_2": (user), "动态内容3": (userPersona.trim())}) : '',
    earlier.trim() ? promptRule(prompts, "forum.buildForumRequest.004", {"动态内容1": (earlier.trim())}) : '',
    story.length ? promptRule(prompts, "forum.buildForumRequest.005", {"动态内容1": (story.map(s => `${s.name}：${s.text}`).join('\n'))}) : '',
    mode === 'posts' && hot.length ? promptRule(prompts, "forum.buildForumRequest.006", {"动态内容1": (hot.join('\n'))}) : '',
    mode === 'posts' && recent.length ? promptRule(prompts, "forum.buildForumRequest.007", {"动态内容1": (recent.map(p => `${label(p.author)}｜${p.title}`).join('\n'))}) : '',
    forumKnows(user, prompts),
    ['【网名】',
      promptRule(prompts, "forum.buildForumRequest.008"),
      promptRule(prompts, "forum.buildForumRequest.009", {"用户": (user), "动态内容2": (label('me')), "用户_3": (user)}),
      missing.length ? promptRule(prompts, "forum.buildForumRequest.010", {"动态内容1": (missing.join('、'))}) : ''].filter(Boolean).join('\n'),
    ['【输出格式】',
      promptRule(prompts, "forum.buildForumRequest.011"),
      mode === 'posts' ? promptRule(prompts, "forum.buildForumRequest.012") : '',
      mode === 'posts' ? promptRule(prompts, "forum.buildForumRequest.013") : '',
      mode === 'posts' ? promptRule(prompts, "forum.buildForumRequest.014") : '',
      promptRule(prompts, "forum.buildForumRequest.015"),
      promptRule(prompts, "forum.buildForumRequest.016", {"用户": (user), "动态内容2": (label('me'))})].filter(Boolean).join('\n')
  ].filter(Boolean).join('\n\n');
  let ask;
  if (mode === 'posts') ask = promptRule(prompts, "forum.buildForumRequest.017", {"动态内容1": (preset.posts + 1)});
  else if (mode === 'react') ask = promptRule(prompts, "forum.buildForumRequest.018", {"用户": (user), "动态内容2": (postLines(post, user, 30, label))});
  else ask = promptRule(prompts, "forum.buildForumRequest.019", {"动态内容1": (postLines(post, user, 30, label)), "用户": (user), "动态内容3": (label('me')), "动态内容4": (reply.text), "动态内容5": (reply.to ? `（回复 ${label(reply.to)}）` : ''), "用户_6": (user)});
  return [{role: 'system', content: system}, {role: 'user', content: ask}];
}

const LINE = /^\s*(?:[-*•]\s*)?[【\[]\s*(热搜|帖子|回复|评论|网名)\s*[】\]]\s*(.*)$/;
const SAID = /^([^:：\n]{1,30}?)\s*(?:回复\s*([^:：\n]{1,30}?))?\s*[:：]\s*(.+)$/;
const clean = s => String(s).replace(/<[^>]+>/g, '').trim().replace(/^[「“"](.*)[」”"]$/s, '$1').trim();

/**
 * The model's answer as {hot: [话题], posts: [{author, title, text, replies}], replies}. Authors are characters or
 * strangers; nobody speaks for the user. Replies outside a post belong to the post being replied to.
 */
export function parseForum(reply, {user = '我', mode = 'posts', handles = {}} = {}) {
  const body = String(reply || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```[a-z]*\n?|```/g, '');
  // Screen names back to who they are ('me' for the user's).
  const back = new Map(Object.entries(handles).map(([name, handle]) => [handle, name]));
  const real = name => back.get(name) || name;
  const isUser = name => !name || name === user || name === '我' || real(name) === 'me' || isPlaceholderRole(name);
  const target = name => { const n = real(person(name)); return !n ? '' : n === user || n === '我' ? 'me' : n; };
  const out = {hot: [], posts: [], replies: [], names: {}};
  let post = null;
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(LINE);
    if (!m) continue;
    const [, kind, rest] = m;
    if (kind === '网名') {
      const [name, handle] = rest.split(/[|｜]/).map(s => person(clean(s)));
      if (name && handle && handle !== name && !isUser(name) && !back.has(handle)) { out.names[name] = handle; back.set(handle, name); }
    } else if (kind === '热搜') {
      const topic = clean(rest).replace(/^#|#$/g, '').trim().slice(0, 40);
      if (mode === 'posts' && topic && out.hot.length < FORUM_LIMITS.hot && !out.hot.includes(topic)) out.hot.push(topic);
    } else if (kind === '帖子') {
      post = null;
      if (mode !== 'posts' || out.posts.length >= FORUM_LIMITS.perRefresh) continue;
      let parts = rest.split(/[|｜]/).map(s => s.trim());
      // 「作者：正文」 without the bars: no title.
      if (parts.length < 2) { const s = rest.match(SAID); if (!s) continue; parts = [s[1], '', s[3]]; }
      if (parts.length === 2) parts = [parts[0], '', parts[1]];
      const author = real(person(parts[0].replace(/[:：]$/, ''))), title = clean(parts[1]).slice(0, FORUM_LIMITS.title), text = clean(parts.slice(2).join('｜')).slice(0, FORUM_LIMITS.text);
      if (isUser(author) || !text) continue;
      post = {author, title, text, replies: []};
      out.posts.push(post);
    } else {
      const s = rest.match(SAID), from = s && real(person(s[1]));
      if (!from || isUser(from)) continue;
      const said = clean(s[3]).slice(0, FORUM_LIMITS.reply), list = (post || out).replies;
      if (said && list.length < 20) list.push({from, to: target(s[2]), text: said});
    }
  }
  return out;
}

/** A post as it is stored. heat: how many have looked (shown as 热度), made up from its replies and likes. */
export function cleanPost(p, id, at, newId) {
  const author = person(p?.author), title = clip(p?.title, FORUM_LIMITS.title).trim(), text = clip(p?.text, FORUM_LIMITS.text).trim();
  if (!author) throw Error('帖子缺少作者');
  if (!text) throw Error('帖子内容为空');
  const replies = (Array.isArray(p.replies) ? p.replies : []).slice(-FORUM_LIMITS.replies).map((r, i) => cleanReply(r, r?.id || newId(), Number.isFinite(r?.at) ? r.at : at + i + 1));
  return {id, kind: 'forum', author, title, text, at, source: ['auto', 'me'].includes(p.source) ? p.source : 'auto',
    likes: Math.max(0, Math.round(Number(p.likes) || 0)), liked: p.liked === true, heat: Math.max(0, Math.round(Number(p.heat) || 0)), replies, ...(p.space ? {space: clip(p.space, 300)} : {})};
}
export function cleanReply(r, id, at) {
  const from = person(r?.from), said = clip(r?.text, FORUM_LIMITS.reply).trim();
  if (!from || !said) throw Error('回复内容为空');
  return {id: String(id), from, ...(person(r.to) ? {to: person(r.to)} : {}), text: said, at};
}
/** Made-up numbers for a new post from someone else, so the board looks lived in. */
export function startingHeat(post, random = Math.random) {
  const replies = post.replies?.length || 0;
  return {likes: Math.round(random() * 40 + replies * (3 + random() * 12)), heat: Math.round(200 + random() * 3000 + replies * 150)};
}
