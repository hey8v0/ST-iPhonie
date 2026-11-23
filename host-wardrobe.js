// 衣柜, tavern side (core/wardrobe.js): a photo of clothes recognized by a model that sees, an outfit put together, a
// 试穿图 drawn (paid only when the phone asked), what was put on told to the next story reply once, and the story's
// hidden <outfit> lines followed (who wears what now), with no request of their own.
import {recognizeRequest, parseRecognition, recognizeBatchRequest, parseRecognitionBatch, WARDROBE_RECOGNITION_MAX, suggestRequest, cleanOutfit, splitRequest, parseSplit, wearText, outfitRule, parseOutfits, ownerKey, ownerName, sameWardrobeDrawing, WARDROBE_DRAW_MAX, WARDROBE_LIMITS} from './core/wardrobe.js';
import {genderOf, pictureInputs, photoPicture, descriptionTagsRequest, englishTagsAnswer, hasEnglishTags, tagTextAnswer} from './core/draw.js';
import {findRoute} from './core/routes.js';
import {plainStory} from './core/chat.js';
import {activeText} from './core/llm.js';
import {requestAssistantText, hasCompletionService, loadCompletionModule} from './host-assistant.js';
import {pictureUrl} from './host-chat.js';
import {naiFeatures} from './core/novelai.js';

// onChange (0.9.35, 衣柜 × 聊天): told whose clothes a story reply changed ([{name, text}], roles only), after they are kept.
export function createWardrobeHost({context, settings, backend, notice = () => {}, ask = requestAssistantText, loadCompletion = loadCompletionModule, picture = pictureUrl, onChange = () => {}, cutout = async blob => (await import('./ui/cutout-editor.js')).automaticCutout(blob)}) {
  const userName = () => context()?.name1 || '我';
  /** Whether the text model sees pictures (a tavern connection when the tavern says so; a custom one is tried). */
  async function sees(ctx = context()) {
    if (activeText(settings().text).source === 'custom') return true;
    if (!hasCompletionService(ctx)) return false;
    try { return !!(await loadCompletion()).isImageInliningSupported?.(); } catch { return false; }
  }
  const itemError = message => Object.assign(Error(message), {code: 'ITEM'});
  /** Describe a staged or saved photo without writing to the wardrobe. */
  async function inspect({photoId, blob} = {}) {
    const ctx = context();
    if (!await sees(ctx)) throw Error('现在的文字模型看不了图片：换一个能看图的模型，或者自己写描述');
    const photo = blob || (photoId && (await backend.library.getPhoto(photoId))?.blob);
    if (!photo) throw itemError('这张照片已经不在相册里了');
    const current = settings();
    const got = parseRecognition(await ask(ctx, backend, current, recognizeRequest(await picture(photo), current.promptRules), {label: '衣柜 · 识别', use: 'wardrobe'}));
    if (!got.description) throw itemError('模型没说出这件衣服是什么样的：再试一次，或者自己写描述');
    return got;
  }
  async function recognize(itemId, {onlyEmpty = false} = {}) {
    const item = (await backend.wardrobe()).items.find(x => x.id === itemId);
    if (!item?.photoId) throw itemError('这件衣服没有照片');
    if (onlyEmpty && item.description) return item;
    const got = await inspect({photoId: item.photoId});
    return saveRecognition(item, got);
  }
  async function saveRecognition(item, got) {
    const latest = (await backend.wardrobe()).items.find(x => x.id === item.id);
    if (!latest || latest.updatedAt !== item.updatedAt || latest.photoId !== item.photoId) throw itemError('识别时衣物已编辑或移除，结果没有写入');
    return backend.saveWardrobeItem({...latest, name: got.name || latest.name, category: got.category || latest.category, description: got.description, ...(latest.shared && !latest.cut && got.cut ? {cut:got.cut} : {}), recognized: true});
  }
  async function recognizeBatch(ids) {
    const ctx = context(), current = settings();
    if (!await sees(ctx)) throw Error('现在的文字模型看不了图片，可以自己填写描述');
    const all = (await backend.wardrobe()).items;
    const items = [...new Set(ids)].slice(0, WARDROBE_RECOGNITION_MAX).map(id => all.find(item => item.id === id)).filter(item => item?.photoId && !item.description);
    const inputs = [];
    for (const item of items) {
      const row = await backend.library.getPhoto(item.photoId);
      if (row?.blob) inputs.push({item, image:await picture(row.blob)});
    }
    if (!inputs.length) return [];
    const result = parseRecognitionBatch(await ask(ctx, backend, current, recognizeBatchRequest(inputs.map(x => x.image), current.promptRules), {label:'衣柜 · 批量识别', use:'wardrobe'}), inputs.length);
    const done = [];
    for (const [index, got] of result) {
      try { done.push((await saveRecognition(inputs[index].item, got)).id); }
      catch (error) { if (error.code !== 'ITEM') throw error; }
    }
    return done;
  }
  /** What the story is at now, briefly (the last two replies), so an outfit fits the scene. */
  const scene = ctx => (ctx?.chat || []).filter(m => !m.is_user && !m.is_system && typeof m.mes === 'string').slice(-2).map(m => plainStory(m.mes, [], settings().narration)).join(' ').slice(-600);
  /** An outfit put together for someone: from the 衣柜 (the pieces picked, else all with words) or designed from a wish. */
  async function suggest({owner, mode = 'closet', wish = '', itemIds = []} = {}) {
    const ctx = context(), {items, wears} = await backend.wardrobe();
    const pool = items.filter(x => (x.owner===owner || x.shared && itemIds.includes(x.id)) && x.description && (!itemIds.length || itemIds.includes(x.id)));
    if (mode === 'closet' && !pool.length) throw Error('衣柜里还没有写了描述的衣服：先放几件进来，或者换成「自由设计」');
    if (mode !== 'closet' && !String(wish).trim()) throw Error('先写下想要什么样的');
    const prompt = suggestRequest({prompts: settings().promptRules, wearer: ownerName(owner, userName()), mode, wish, pool, last: wears.find(w => w.owner === owner)?.text || '', scene: scene(ctx)});
    const text = cleanOutfit(await backend.generateText(ctx, {use: 'wardrobe', prompt, plainText: true, trimNames: false, responseLength: 1400}));
    if (!text) throw Error('模型没搭出来，再试一次');
    return text;
  }
  /**
   * 存成一套 (0.9.33): kept with the pieces it is made of. Designed freely, it is split into pieces first (one request), and
   * they go into the 衣柜 as words (one already there, the same name and words, is used again); from the 衣柜, the pieces
   * picked. The same words kept again are not kept twice: {again: true}. Answers {set, added}.
   */
  async function saveOutfit({owner, text, mode = 'closet', itemIds = [], photoId = ''} = {}) {
    const words = cleanOutfit(text);
    if (!words) throw Error('先搭一套');
    const {items, sets} = await backend.wardrobe(), same = sets.find(s => s.owner===owner && s.description === words.slice(0, WARDROBE_LIMITS.wear));
    if (same) return {set: photoId && same.photoId !== photoId ? await backend.saveWardrobeSet({id:same.id, photoId}) : same, added: 0, again: true};
    let ids = itemIds.filter(id => items.some(x => x.id === id && (x.owner===owner || x.shared))), added = 0;
    if (mode === 'free') {
      const pieces = parseSplit(await backend.generateText(context(), {use: 'wardrobe', prompt: splitRequest(words, settings().promptRules), plainText: true, trimNames: false, responseLength: 4500}));
      if (!pieces.length) throw Error('模型没把这套拆成单件衣服，再试一次');
      ids = [];
      for (const piece of pieces) {
        const kept = items.find(x => (x.owner === owner || x.shared) && x.name === piece.name && x.description === piece.description);
        if (kept) { ids.push(kept.id); continue; }
        ids.push((await backend.saveWardrobeItem({owner, ...piece})).id);
        added++;
      }
    }
    const set = await backend.saveWardrobeSet({owner, name: `搭配 ${sets.length + 1}`, description: words, photoId, items: [...new Set(ids)]});
    return {set, added, again: false};
  }
  /**
   * 试穿图: someone drawn wearing it, with their saved look (角色 App). A picture that costs money is only drawn when
   * allowPaid (the phone asks first): before that not even the words for its tags are spent. The picture goes to the album.
   */
  async function tryOn({owner, text, allowPaid = false} = {}) {
    if (!backend.drawReady()) throw Error(backend.drawMissing() || '还没有设置绘图引擎');
    const name = ownerName(owner, userName()), outfit = String(text || '').trim();
    if (!outfit) throw Error('先搭一套');
    const paid = () => Object.assign(Error(backend.paidPrompt().note), {code: 'PAID', prompt: backend.paidPrompt()});
    if (!allowPaid && backend.drawQuote?.()?.free === false) throw paid();
    const current = backend.seen || settings(), role = findRoute(current.routes, name);
    const fixed = !!(role?.appearance?.trim() || role?.ref);
    const words = fixed ? outfit : `${name}，${outfit}`;
    const instructions = fixed
      ? '本次只转换当前衣着的可见细节。角色外貌会另外注入，请勿生成角色名、原作名、发型、肤色、体貌、姿势或人数标签。'
      : '画面里是一位人物穿着这套衣服，保留衣着描述的细节。已有作品中的人物可用英文角色识别标签。';
    const prompt = descriptionTagsRequest(current, words, {instructions});
    const tags = englishTagsAnswer(await backend.generateText(context(), {use:'picture', prompt, plainText:true, trimNames:false, responseLength:Math.min(6000, 1500 + words.length * 3)}));
    if (!tags) throw Error('文字模型没有返回试穿图的英文绘图标签，再试一次');
    const picture = fixed
      ? {spec:{tags:[genderOf(role.appearance) ? '1' + genderOf(role.appearance) : '', 'solo', 'full body'].filter(Boolean).join(', '), cast:[{name:role.name, tags}]}}
      : photoPicture(current, {text:words, tags, owner:name, names:[...current.routes.map(r => r.name), userName()]});
    const input = pictureInputs(current, picture, '');
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
      const known = new Set(['me', ...settings().routes.map(r => ownerKey(r.name))]);
      const owners = [...new Set([...w.items, ...w.sets, ...w.wears].map(d => d.owner))].filter(o => known.has(o));
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
  const drawingItems = new Set();
  async function drawItem({id, allowPaid = false} = {}) {
    if (drawingItems.has(id)) throw Error('这件衣服正在画');
    if (!backend.drawReady()) throw Error(backend.drawMissing() || '还没有设置绘图引擎');
    drawingItems.add(id);
    try {
      const item = (await backend.wardrobe()).items.find(x => x.id === id);
      if (!item) throw Error('这件衣服已不在衣柜里');
      if (!allowPaid && backend.drawQuote?.()?.free === false) throw Object.assign(Error('画衣服需要确认费用'), {code: 'PAID'});
      const s = settings(), nai = s.draw.engine === 'nai';
      let tags = nai && hasEnglishTags(item.naiTags) ? item.naiTags : '';
      if (!tags) {
        const words = `衣服单品，无人物，不要模特、身体或人台。平铺或挂拍，纯色背景。名字：${item.name}；分类：${item.category}；描述：${item.description}`;
        const prompt = descriptionTagsRequest(s, words, {instructions: '只画这一件衣物。保留接缝、包边、扣件和可见内里，不加其他衣物或人体。'});
        tags = englishTagsAnswer(await backend.generateText(context(), {use:'picture', prompt, plainText:true, trimNames:false, responseLength:2000})).slice(0, 3000);
        if (!tags) throw Error('文字模型没有返回衣物的英文绘图标签，再试一次');
        if (nai && !await backend.updateWardrobeDrawing(item, {naiTags:tags})) throw Error('单品已修改或移除，请刷新后再试');
      }
      const saved = await paintItem(item, tags, s, allowPaid);
      if (!saved) throw Error('单品已修改或移除，生成的图片留在相册');
      return saved;
    } finally { drawingItems.delete(id); }
  }
  async function paintItem(item, tags, s, allowPaid) {
    if (settings().draw.engine !== s.draw.engine) throw Error('绘图引擎已切换，请重新出图');
    const params = {...s.draw.params, transparent: s.draw.engine === 'nai' && naiFeatures(s.draw.params.model).transparent};
    const made = await backend.generateImage({prompt: `${tags}, isolated clothing item, flat lay, no humans, no mannequin, ${params.transparent ? 'transparent background' : 'solid background'}`, negative: 'person, human, mannequin, body', characters: [], params, allowPaid, name: `衣柜-${item.name}`, key: `wardrobe-item:${item.id}`, label: `衣柜 · ${item.name}`}, async raw => {
      try {
        const png = await cutout(raw);
        if (png?.type !== 'image/png') throw Error('无法保存透明图片');
        return png;
      } catch { notice('抠图失败，已保留原图'); return raw; }
    });
    return backend.updateWardrobeDrawing(item, {photoId: made.photoId});
  }
  async function drawItems({ids = [], allowPaid = false} = {}) {
    if (!backend.drawReady()) throw Error(backend.drawMissing() || '还没有设置绘图引擎');
    const s = settings();
    if (s.draw.engine !== 'nai') throw Error('批量画单品目前使用 NovelAI');
    const keys = [...new Set(ids)];
    if (!keys.length || keys.length > WARDROBE_DRAW_MAX) throw Error(`一次可画 1 到 ${WARDROBE_DRAW_MAX} 件单品`);
    if (keys.some(id => drawingItems.has(id))) throw Error('选中的单品正在画');
    for (const id of keys) drawingItems.add(id);
    try {
      if (!allowPaid && backend.drawQuote?.()?.free === false) throw Object.assign(Error('画衣服需要确认费用'), {code:'PAID'});
      const {items} = await backend.wardrobe();
      const batch = keys.map(id => items.find(item => item.id === id));
      if (batch.some(item => !item?.description || item.photoId)) throw Error('请选择有描述且还没有图片的单品');
      const missing = batch.filter(item => !hasEnglishTags(item.naiTags));
      let error = '';
      if (missing.length) {
        let tags;
        try { tags = await translateDrawingBatch(missing, s); }
        catch (cause) { error = cause.message; }
        for (const [index, item] of missing.entries()) {
          const words = tags?.get(index + 1);
          if (!words) { error ||= '部分单品缺少有效 tags，可重新选择出图。'; continue; }
          if (!await backend.updateWardrobeDrawing(item, {naiTags:words})) error ||= '已跳过出图期间修改过的单品。';
        }
      }
      let count = 0;
      for (const item of batch) {
        const current = (await backend.wardrobe()).items.find(row => row.id === item.id);
        if (!current || current.photoId || !sameWardrobeDrawing(item, current)) {
          error ||= '已跳过出图期间修改过的单品。';
          continue;
        }
        if (!hasEnglishTags(current.naiTags)) continue;
        try {
          if (await paintItem(current, current.naiTags, s, allowPaid)) count++;
          else error ||= '已跳过出图期间修改过的单品，生成的图片留在相册。';
        } catch (cause) { error = cause.message; break; }
      }
      return {count, error};
    } finally { for (const id of keys) drawingItems.delete(id); }
  }
  async function translateDrawingBatch(missing, s) {
    const descriptions = missing.map(({name, category, description}, i) => ({item:i + 1, name, category, description}));
    const prompt = descriptionTagsRequest(s, JSON.stringify(descriptions), {
      batch: true, instructions: '每组标签只描述对应的单件衣物。保留接缝、包边、扣件和可见内里，不合并单品、不添加人物。'
    });
    const raw = tagTextAnswer(await backend.generateText(context(), {use:'picture', prompt, plainText:true, trimNames:false, responseLength:4500}));
    let rows = [];
    try { rows = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)); }
    catch { /* Cached items can still be drawn. */ }
    const tags = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!Number.isInteger(row?.item) || row.item < 1 || row.item > missing.length) continue;
      tags.set(row.item, tags.has(row.item) || typeof row.tags !== 'string' ? '' : englishTagsAnswer(row.tags).slice(0, 3000));
    }
    return tags;
  }
  return {inspect, recognize, recognizeBatch, suggest, saveOutfit, tryOn, drawItem, drawItems, storyPlan, storyReplied, sees, present};
}
