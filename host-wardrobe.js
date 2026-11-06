// 衣柜, tavern side (core/wardrobe.js): a photo of clothes recognized by a model that sees, an outfit put together, a
// 试穿图 drawn (paid only when the phone asked), what was put on told to the next story reply once, and the story's
// hidden <outfit> lines followed (who wears what now), with no request of their own.
import {recognizeRequest, parseRecognition, suggestRequest, cleanOutfit, splitRequest, parseSplit, wearText, outfitRule, parseOutfits, ownerKey, ownerName, WARDROBE_LIMITS} from './core/wardrobe.js';
import {pictureInputs, photoPicture, tagTextRequest, tagTextAnswer} from './core/draw.js';
import {plainStory} from './core/chat.js';
import {activeText} from './core/llm.js';
import {requestAssistantText, hasCompletionService, loadCompletionModule} from './host-assistant.js';
import {pictureUrl} from './host-chat.js';

// onChange (0.9.35, 衣柜 × 聊天): told whose clothes a story reply changed ([{name, text}], roles only), after they are kept.
export function createWardrobeHost({context, settings, backend, notice = () => {}, ask = requestAssistantText, loadCompletion = loadCompletionModule, picture = pictureUrl, onChange = () => {}}) {
  const userName = () => context()?.name1 || '我';
  /** Whether the text model sees pictures (a tavern connection when the tavern says so; a custom one is tried). */
  async function sees(ctx = context()) {
    if (activeText(settings().text).source === 'custom') return true;
    if (!hasCompletionService(ctx)) return false;
    try { return !!(await loadCompletion()).isImageInliningSupported?.(); } catch { return false; }
  }
  /** A piece's photo recognized: its name, category and description put on it. An error about this one piece has code ITEM. */
  async function recognize(itemId) {
    const ctx = context(), item = (await backend.wardrobe()).items.find(x => x.id === itemId);
    const one = message => Object.assign(Error(message), {code: 'ITEM'});
    if (!item?.photoId) throw one('这件衣服没有照片');
    if (!await sees(ctx)) throw Error('现在的文字模型看不了图片：换一个能看图的（小手机「引擎 → 文字模型」里的自定义接口，或在酒馆里开了发送内联图片的），或者自己写描述');
    const row = await backend.library.getPhoto(item.photoId);
    if (!row?.blob) throw one('这张照片已经不在相册里了');
    const got = parseRecognition(await ask(ctx, backend, settings(), recognizeRequest(await picture(row.blob), settings().promptRules), {label: '衣柜 · 识别', use: 'wardrobe'}));
    if (!got.description) throw one('模型没说出这件衣服是什么样的：再试一次，或者自己写描述');
    return backend.saveWardrobeItem({...item, name: got.name || item.name, category: got.category || item.category, description: got.description, recognized: true});
  }
  /** What the story is at now, briefly (the last two replies), so an outfit fits the scene. */
  const scene = ctx => (ctx?.chat || []).filter(m => !m.is_user && !m.is_system && typeof m.mes === 'string').slice(-2).map(m => plainStory(m.mes)).join(' ').slice(-600);
  /** An outfit put together for someone: from the 衣柜 (the pieces picked, else all with words) or designed from a wish. */
  async function suggest({owner, mode = 'closet', wish = '', itemIds = []} = {}) {
    const ctx = context(), {items, wears} = await backend.wardrobe(owner);
    const pool = items.filter(x => x.description && (!itemIds.length || itemIds.includes(x.id)));
    if (mode === 'closet' && !pool.length) throw Error('衣柜里还没有写了描述的衣服：先放几件进来，或者换成「自由设计」');
    if (mode !== 'closet' && !String(wish).trim()) throw Error('先写下想要什么样的');
    const prompt = suggestRequest({prompts: settings().promptRules, wearer: ownerName(owner, userName()), mode, wish, pool, last: wears.find(w => w.owner === owner)?.text || '', scene: scene(ctx)});
    const text = cleanOutfit(await backend.generateText(ctx, {use: 'wardrobe', prompt, plainText: true, trimNames: false}));
    if (!text) throw Error('模型没搭出来，再试一次');
    return text;
  }
  /**
   * 存成一套 (0.9.33): kept with the pieces it is made of. Designed freely, it is split into pieces first (one request), and
   * they go into the 衣柜 as words (one already there, the same name and words, is used again); from the 衣柜, the pieces
   * picked. The same words kept again are not kept twice: {again: true}. Answers {set, added}.
   */
  async function saveOutfit({owner, text, mode = 'closet', itemIds = []} = {}) {
    const words = cleanOutfit(text);
    if (!words) throw Error('先搭一套');
    const {items, sets} = await backend.wardrobe(owner), same = sets.find(s => s.description === words.slice(0, WARDROBE_LIMITS.wear));
    if (same) return {set: same, added: 0, again: true};
    let ids = itemIds.filter(id => items.some(x => x.id === id)), added = 0;
    if (mode === 'free') {
      const pieces = parseSplit(await backend.generateText(context(), {use: 'wardrobe', prompt: splitRequest(words, settings().promptRules), plainText: true, trimNames: false}));
      if (!pieces.length) throw Error('模型没把这套拆成单件衣服，再试一次');
      ids = [];
      for (const piece of pieces) {
        const kept = items.find(x => x.name === piece.name && x.description === piece.description);
        if (kept) { ids.push(kept.id); continue; }
        ids.push((await backend.saveWardrobeItem({owner, ...piece})).id);
        added++;
      }
    }
    const set = await backend.saveWardrobeSet({owner, name: `搭配 ${sets.length + 1}`, description: words, items: [...new Set(ids)]});
    return {set, added, again: false};
  }
  /**
   * 试穿图: someone drawn wearing it, with their saved look (角色 App). A picture that costs money is only drawn when
   * allowPaid (the phone asks first): before that not even the words for its tags are spent. The picture goes to the album.
   */
  async function tryOn({owner, text, allowPaid = false} = {}) {
    if (!backend.drawReady()) throw Error(backend.drawMissing() || '还没有设置绘图引擎');
    const name = ownerName(owner, userName()), words = `${name}，${String(text || '').trim()}`;
    if (!String(text || '').trim()) throw Error('先搭一套');
    const paid = () => Object.assign(Error(backend.paidPrompt().note), {code: 'PAID', prompt: backend.paidPrompt()});
    if (!allowPaid && backend.drawQuote?.()?.free === false) throw paid();
    const tags = tagTextAnswer(await backend.generateText(context(), {use: 'picture', prompt: tagTextRequest(settings(), words, 'translate'), plainText: true, trimNames: false, responseLength: Math.min(6000, 1500 + words.length * 3)})).replace(/\s+/g, ' ').trim();
    if (!tags) throw Error('没把这套衣服写成画图用的 tag，再试一次');
    const names = [...settings().routes.map(r => r.name), userName()];
    const input = pictureInputs(settings(), photoPicture(settings(), {text: words, tags, owner: name, names}), '');
    try { return (await backend.generateImage({...input, allowPaid, name: `衣柜试穿-${name}`, key: `wardrobe:${owner}:${Date.now()}`, label: `衣柜 · ${name}`})).photoId; }
    catch (error) { if (error?.code === 'PAID') throw paid(); throw error; }
  }

  /**
   * Who is in the story just now (0.9.33, for the row of faces when there are many): the user and the roles named or
   * speaking in the last few messages, as 衣柜 owners.
   */
  function present() {
    const ctx = context(), text = (ctx?.chat || []).filter(m => !m.is_system && typeof m.mes === 'string').slice(-6).map(m => `${m.name || ''}\n${m.mes}`).join('\n');
    if (!text) return [];
    const user = userName(), names = [...new Set(settings().routes.map(r => r.name).filter(n => n && n !== user))];
    return [...(text.includes(user) ? ['me'] : []), ...names.filter(n => text.includes(n)).map(ownerKey)];
  }
  // What inject() needs at once (it cannot wait): the outfits put on and not yet told, and who has a 衣柜 here.
  let cache = {pending: [], owners: [], loaded: false};
  function refresh() {
    Promise.resolve().then(() => backend.wardrobe()).then(w => {
      const owners = [...new Set([...w.items, ...w.sets, ...w.wears].map(d => d.owner))];
      cache = {pending: w.wears.filter(x => x.pending), owners, loaded: true};
    }).catch(() => {});
  }
  refresh();
  backend.subscribe?.(event => { if (event?.type === 'wardrobe') refresh(); });
  /**
   * For a story request: what was put on (told once — a real reply uses it up; a dry run or a quiet one does not) and,
   * while the 衣柜 is in use, the rule that has the story say when someone's clothes change.
   */
  function storyPlan(type, dryRun) {
    if (!cache.loaded) refresh();
    const user = userName(), out = [];
    if (cache.pending.length) {
      out.push({key: 'sttts.entry.wardrobe', text: wearText(cache.pending, user, settings().promptRules), position: 1, depth: 1, role: 0});
      if (type && !['quiet', 'impersonate'].includes(type) && !dryRun) {
        const used = cache.pending;
        cache = {...cache, pending: []};
        backend.takeWardrobeWear().then(() => notice(`${used.map(w => ownerName(w.owner, user)).join('、')}的衣着带进这次正文了`)).catch(() => {});
      }
    }
    const rule = outfitRule(cache.owners.map(o => ownerName(o, user)), settings().promptRules);
    if (rule) out.push({key: 'sttts.entry.outfit', text: rule, position: 1, depth: 1, role: 0});
    return out;
  }
  /** A story reply's <outfit> lines: who wears what now (the user by their name, roles by theirs; anyone else is left out). */
  async function storyReplied(id) {
    const ctx = context(), index = Number.isInteger(Number(id)) ? Number(id) : (ctx?.chat?.length || 0) - 1, m = ctx?.chat?.[index];
    if (!m || m.is_user || m.is_system || typeof m.mes !== 'string') return 0;
    const found = parseOutfits(m.mes);
    if (!found.length) return 0;
    const user = userName(), roles = new Set(settings().routes.map(r => r.name)), news = [];
    let changed = 0;
    for (const {name, text} of found) {
      const owner = name === user ? 'me' : roles.has(name) ? ownerKey(name) : '';
      if (!owner) continue;
      try {
        const before = owner === 'me' ? '' : (await backend.wardrobe(owner)).wears[0]?.text || '';
        await backend.setWardrobeWear({owner, text, from: 'story'}); changed++;
        if (owner !== 'me' && before.trim() !== text.trim()) news.push({name, text});
      } catch { /* not worth interrupting the story */ }
    }
    if (news.length) { try { onChange(news); } catch { /* the phone's own business */ } }
    return changed;
  }
  return {recognize, suggest, saveOutfit, tryOn, storyPlan, storyReplied, sees, present};
}
