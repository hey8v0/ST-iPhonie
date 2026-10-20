// In-chat pictures: fills the placeholders left by <img>…</img> tags, generates them with NovelAI,
// uploads the result to the tavern's image folder and remembers it on the message (message.extra.sttts_pics),
// so every device that opens the chat sees the same picture.
//
// A finished picture shows only the image. One tap folds it to a line of text (and back); a double tap opens the
// viewer, which holds everything else: the versions
// (‹ ›), the parameters (参数), redraw (also with the prompt changed first), open in the drawing app, fold and delete.
//
// Each tag keeps every version it was drawn in: {versions: [{url, seed, width, height, …}], index}.
// Redrawing adds a version (the old ones stay for comparison); deleting removes the shown version and its file.
// When the last version is deleted the record becomes {removed: true, versions: []}, so it is not drawn again
// automatically. Older records ({url, seed, …}) read as a single version.
import {storyReply} from './core/outgoing.js';
import {parsePictures, pictureInputs, planRequest, planLength, tagTextRequest, tagTextAnswer, insertPlanned, withoutPictures, sameExact, suggestRequest, writeRequest, promptLength, readSuggestion, budgetNumbers, fillUpRequest, sameName, sentenceCount} from './core/draw.js';
import {tokenBudget, loadCounter, countField, tagCost, estimateTokens} from './core/tokens.js';
import {openImageViewer} from './image-viewer.js';
import {editTags} from './host-ask.js';
import {downloadAction} from './download.js';
import {plainStory, activeChatPreset} from './core/chat.js';
import {worldInfoFor, loreOptions} from './host-lore.js';
import {voicePlanRequest, combinedRequest, insertVoiced} from './core/voice-plan.js';
import {withPhone, phoneSection} from './core/chat.js';
import {TIER_NAMES, NAI_MODEL_NAMES} from './core/novelai.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const versionsOf = record => !record ? [] : Array.isArray(record.versions) ? record.versions : record.url ? [{...record}] : [];

/**
 * voice: 回复后单独配音 ({wanted(), has(text), rules(), format()}): whether it is on, whether a reply already has its
 * lines voiced, the voice preset's prompt for the speakers and its 台词格式. Without it replies are never voiced here.
 */
export function createPictureHost({context, redrawMessage = (id, message) => context().updateMessageBlock?.(id, message), settings, backend, marker, scheduleRender, openDraw, notice, voice = null, phone = null, speakers = () => [], voiced: lined = () => {}}) {
  const jobs = new Map(); // queue key -> {state: 'generating'|'error', message}
  const folds = new Map(); // `${id}:${hash}` -> true/false, this session's fold choice per picture
  // The latest single tap on a picture: {key, id, message, tag, was, at, rect, timer, done}. It folds or unfolds the
  // picture after DOUBLE_TAP unless a second tap comes first. A slower second tap lands where the picture was before
  // it changed size, so one inside the old spot within SLOW_TAP still counts: the fold is put back and the viewer opens.
  let first = null;
  const DOUBLE_TAP = 400, SLOW_TAP = 800;

  const stored = (message, hash) => message?.extra?.sttts_pics?.[hash] || null;
  /** The version on screen, with its position: {…version, index, count}; null when there is none. */
  function shown(message, hash) {
    const record = stored(message, hash), list = versionsOf(record);
    if (!list.length) return null;
    const index = Math.min(list.length - 1, Math.max(0, Number.isInteger(record.index) ? record.index : list.length - 1));
    return {...list[index], index, count: list.length};
  }
  function keep(message, hash, list, index) {
    message.extra ??= {};
    message.extra.sttts_pics ??= {};
    message.extra.sttts_pics[hash] = list.length ? {versions: list, index: Math.min(list.length - 1, Math.max(0, index))} : {removed: true, versions: [], at: Date.now()};
  }
  const jobKey = (id, tag) => `pic:${context()?.chatId ?? ''}:${id}:${tag.hash}`;
  const saveSoon = () => (context().saveChatDebounced || context().saveChat)?.();

  // The queue changes often (positions, retry countdowns): redraw the placeholders when it does.
  backend.subscribe?.(event => { if (event.type === 'draw' && event.queue) scheduleRender(); });

  async function upload(blob, name) {
    const ctx = context();
    const base64 = await backend.base64(blob);
    const response = await fetch('/api/images/upload', {
      method: 'POST', headers: ctx.getRequestHeaders(),
      body: JSON.stringify({image: base64, format: 'png', ch_name: ctx.name2 || 'ST-iPhonie', filename: String(name).replace(/\./g, '_')})
    });
    if (!response.ok) throw Error('图片已生成，但上传到酒馆失败（' + response.status + '）');
    return (await response.json()).path;
  }
  /** Deletes a picture file from the tavern's image folder. A file that is already gone counts as deleted. */
  async function removeFile(url) {
    if (!url) return;
    const response = await fetch('/api/images/delete', {method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify({path: url})});
    if (!response.ok && response.status !== 404) throw Error('没能从酒馆删除图片文件（' + response.status + '）');
  }

  /** Asks before spending Anlas (or paying for a GPT picture). Returns 'free', 'paid' or false (declined, or no key). */
  async function allowed(interactive) {
    if (!backend.drawReady()) { if (interactive) notice(backend.drawMissing() + '，请在小手机的引擎卡包里填写'); return false; }
    const engine = settings().draw.engine;
    // Through a relay counted as Opus, a subscription it does not pass on is expected, not worth a notice.
    if (engine === 'nai') try { await backend.naiSubscription(); } catch (error) { const relay = settings().draw.relay; if (!relay.url&&interactive)notice(error.message);else backend.reportDiagnostic?.('绘图订阅查询',{message:error.message,drawStillAvailable:true},'warn'); }
    const quote = backend.drawQuote();
    if (quote.free === true) return 'free';
    if (!interactive) return false;
    const why = engine === 'gpt' ? 'GPT 生图每张都要花钱（按 OpenAI 或中转的价格）。' : quote.free === null ? '暂时读不到 NovelAI 订阅信息，无法确认是否免费。' : '按当前参数和订阅，这张图会扣 Anlas。';
    return globalThis.confirm(why + '\n确定要生成吗？') ? 'paid' : false;
  }

  /** Queues one picture. Redrawing adds a version; the earlier versions stay. */
  async function generate(id, tag, {interactive = false, permission = null} = {}) {
    const ctx = context(), message = ctx.chat[id], key = jobKey(id, tag);
    if (!message || jobs.get(key)?.state === 'generating') return;
    permission ??= await allowed(interactive);
    if (!permission) return;
    jobs.set(key, {state: 'generating'});
    scheduleRender();
    try {
      const inputs = pictureInputs(settings(), tag, message.mes);
      const result = await backend.generateImage({...inputs, allowPaid: permission === 'paid', name: 'chat', key, label: '正文图片 · ' + tag.prompt.slice(0, 24)});
      const url = await upload(result.blob, 'st-iphonie-' + Date.now());
      // Only store the picture when the same message is still there with this tag.
      const now = context().chat[id];
      if (now === message && parsePictures(now.mes).some(t => t.hash === tag.hash)) {
        const list = versionsOf(stored(now, tag.hash));
        list.push({url, seed: result.seed, width: result.params.width, height: result.params.height, model: result.params.model, steps: result.params.steps, prompt: tag.prompt, characters: inputs.names, at: Date.now()});
        keep(now, tag.hash, list, list.length - 1);
        await context().saveChat();
        if (settings().general.hideStoryWaves) redrawMessage(id, now);
      }
      jobs.delete(key);
    } catch (error) {
      if (error.cancelled) jobs.delete(key); else { jobs.set(key, {state: 'error', message: error.message}); if (settings().general.hideStoryWaves) notice(error.message); }
    }
    scheduleRender();
  }

  const planning = new Set();
  /** Who the rules may name: the open card's people and who speaks now (core/draw.js drawCast). */
  const castNow = () => backend.drawCast?.(speakers()) ?? null;
  /** 世界书 for planning pictures: what the tavern would turn on for this story, through the phone's choice of books. */
  async function storyLore(prior, source) {
    const preset = activeChatPreset(settings().chat);
    if (preset.lore === false) return '';
    return worldInfoFor(context, {...loreOptions(preset), report: (...args) => backend.reportDiagnostic?.(...args), persona: String(context()?.powerUserSettings?.persona_description || '').slice(0, 1500),
      texts: [...prior.map(m => `${m.name}: ${m.text}`), plainStory(withoutPictures(source))]});
  }
  /** The picture planner's request for one reply, with the story's 世界书 and the card's 名单. */
  async function pictureRequest(id, source) {
    const prior = before(id);
    return planRequest(settings(), {message: source, before: prior, only: castNow(), lore: await storyLore(prior, source)});
  }
  /** Earlier messages for the planner: names and plain text, oldest first. */
  function before(id, limit = 2) {
    const chat = context().chat, out = [];
    for (let i = id - 1; i >= 0 && out.length < limit; i--) {
      const m = chat[i];
      if (!m || m.is_system) continue;
      const text = plainStory(withoutPictures(m.mes));
      if (text) out.unshift({name: m.name || (m.is_user ? '我' : '角色'), text: text.slice(0, 600)});
    }
    return out;
  }
  /** The pictures of a reply asked for on their own: put in, asked once more when none came out. {text, count} */
  async function planOnce(id, source) {
    let last = {text: source, count: 0};
    for (let round = 0; round < 2 && !last.count; round++) {
      const reply = await backend.generateText(context(), {prompt: await pictureRequest(id, source), trimNames: false, responseLength: planLength(settings(), activeDrawPreset().count)});
      last = insertPlanned(source, reply);
      if (!last.count) backend.reportDiagnostic?.('正文出图', {message: round ? '又试了一次，还是没有挑出画面' : '没有挑出画面，再试一次', reply: String(reply ?? '').slice(0, 2000)}, 'warn');
    }
    return last;
  }
  const activeDrawPreset = () => { const s = settings(); return s.draw.presets.find(p => p.id === s.draw.activePreset) || s.draw.presets[0]; };
  /**
   * 'separate' mode: after a reply is written, ask the model (its own request) for the picture blocks and put them
   * into the reply after the paragraphs it chose. force: plan again, replacing the blocks already there.
   */
  async function planPictures(id, {force = false} = {}) {
    const ctx = context(), message = ctx.chat[id];
    if (!message || message.is_user || message.is_system || planning.has(id)) return false;
    if (!force && parsePictures(message.mes).length) return false;
    planning.add(id);
    notice('正在给这条回复挑画面……');
    try {
      const source = force ? withoutPictures(message.mes) : message.mes;
      const {text, count} = await planOnce(id, source);
      if (context().chat[id] !== message) return false;
      if (!count) throw Error('这次没有挑出画面（试了两次），可以点这层楼右边的小手机工具按钮「给这层楼生图」再试；模型具体回了什么可以在小手机的「日志」App 里看');
      message.mes = text;
      if (Array.isArray(message.swipes)) message.swipes[message.swipe_id ?? 0] = text;
      await ctx.saveChat();
      redrawMessage(id, message);
      scheduleRender();
      return true;
    } finally { planning.delete(id); }
  }
  /**
   * 回复后单独配音, and with 回复后单独配图 on too, both in one request: voices the lines of a reply (and puts its
   * pictures in). force: do it again, replacing what is there. Returns what was done: {voiced, pictured}.
   */
  async function planReply(id, {voiced: wantVoice, pictured: wantPictures, force = false, phoned = false}) {
    const ctx = context(), s = settings(), message = ctx.chat[id];
    if (!message || message.is_user || message.is_system || planning.has(id) || (!wantVoice && !wantPictures)) return {voiced: 0, pictured: 0};
    planning.add(id);
    notice(wantVoice && wantPictures ? '正在给这条回复配音、挑画面……' : wantVoice ? '正在给这条回复配音……' : '正在给这条回复挑画面……');
    try {
      const source = force && wantPictures ? withoutPictures(message.mes) : message.mes, format = voice?.format();
      const preset = s.draw.presets.find(p => p.id === s.draw.activePreset) || s.draw.presets[0];
      const pictures = wantPictures ? await pictureRequest(id, source) : null;
      const asked = wantVoice && wantPictures ? combinedRequest({rules: voice.rules(), format, pictures})
        : wantVoice ? voicePlanRequest({rules: voice.rules(), format, message: source, before: before(id)}) : pictures;
      // 正文联动手机: what happens on the phone is asked for at the end of the same request (【手机】).
      const phoneRule = phoned && phone?.wanted() ? await phone.rule() : '';
      const prompt = withPhone(asked, phoneRule);
      const length = (wantVoice ? Math.min(3000, 400 + source.length * 2) : 0) + (wantPictures ? planLength(s, preset.count) : 0) + (phoneRule ? 500 : 0);
      const answer = await backend.generateText(ctx, {prompt, trimNames: false, responseLength: Math.min(10000, length)});
      if (context().chat[id] !== message) return {voiced: 0, pictured: 0};
      const {rest: reply, phone: sent} = phoneRule ? phoneSection(answer) : {rest: answer, phone: ''};
      let text = source, pictured = 0, voiced = 0;
      if (wantPictures) ({text, count: pictured} = insertPlanned(text, reply));
      if (wantVoice) ({text, count: voiced} = insertVoiced(text, reply, format));
      // No pictures came out with the rest: they are asked for on their own (once more at most).
      if (wantPictures && !pictured) {
        backend.reportDiagnostic?.('正文出图', {message: '和配音一起请求时没有挑出画面，单独再请求一次', reply: String(reply ?? '').slice(0, 2000)}, 'warn');
        ({text, count: pictured} = await planOnce(id, text));
        if (context().chat[id] !== message) return {voiced: 0, pictured: 0};
      }
      // The phone part is kept at the end of the reply like the story's own <phone> (shown as a note), then delivered.
      if (sent) {
        text = `${text}\n${sent}`;
        if (!voiced && !pictured) {
          message.mes = text;
          if (Array.isArray(message.swipes)) message.swipes[message.swipe_id ?? 0] = text;
          await ctx.saveChat(); redrawMessage(id, message); scheduleRender();
          phone.deliver(id).catch(() => {});
        }
      }
      if (!voiced && !pictured) throw Error(wantVoice ? '这次没有配上音，可以在小手机的「设置 → 正文」里点「给最新回复配音」再试一次' : '这次没有挑出画面（试了两次），可以点这层楼右边的小手机工具按钮「给这层楼生图」再试；模型具体回了什么可以在小手机的「日志」App 里看');
      message.mes = text;
      if (Array.isArray(message.swipes)) message.swipes[message.swipe_id ?? 0] = text;
      await ctx.saveChat();
      redrawMessage(id, message);
      scheduleRender();
      if (sent) phone.deliver(id).catch(() => {});
      // The lines are in now: 提前生成 can make them.
      if (voiced) lined(id);
      if (wantVoice && !voiced) notice('画面挑好了，台词这次没配上，可以在「设置 → 正文」里点「给最新回复配音」');
      if (wantPictures && !pictured) notice('台词配好了，画面这次没挑出来，可以在「设置 → 正文」里点「给最新回复配图」');
      return {voiced, pictured};
    } finally { planning.delete(id); }
  }
  /** Saves 新外貌 lines of a reply to the 角色 App: new named characters, or roles that have no appearance yet. */
  function registerAppearances(message) {
    const added = [];
    for (const tag of parsePictures(message?.mes || '')) for (const r of tag.spec?.register || []) {
      const route = settings().routes.find(x => sameExact(x.name, r.name));
      if (route?.appearance?.trim() || added.includes(r.name)) continue;
      try {
        backend.saveRoute(route ? {...route, appearance: r.appearance} : {name: r.name, engine: 'fish', voice: '', model: '', language: '', appearance: r.appearance});
        added.push(r.name);
      } catch { /* an unusable name is skipped */ }
    }
    if (added.length) notice(`已记下新角色的外貌：${added.join('、')}。可以在小手机的角色 App 里修改`);
    return added;
  }

  /**
   * Called after a new reply is rendered. 'separate' mode plans its pictures first; then new characters' looks are
   * saved and, when automatic drawing is on and free, all its pictures are queued.
   */
  async function autoPictures(id) {
    const s = settings();
    let message = context().chat[id];
    if (!message || message.is_user || message.is_system) return;
    const wantVoice = !!voice?.wanted() && !voice.has(message.mes);
    const wantPictures = s.draw.enabled && s.draw.mode === 'separate' && !parsePictures(message.mes).length;
    if (wantVoice || wantPictures) {
      let done;
      try { done = await planReply(id, {voiced: wantVoice, pictured: wantPictures, phoned: true}); } catch (error) { notice(error.message); return; }
      if (wantPictures && !done.pictured) return;
      message = context().chat[id];
    }
    if (!s.draw.enabled) return;
    registerAppearances(message);
    if (!s.draw.auto) return;
    const tags = parsePictures(message.mes).filter(tag => !stored(message, tag.hash));
    if (!tags.length) return;
    const permission = await allowed(false);
    if (!permission) { backend.reportDiagnostic?.('正文出图', {message:'自动出图未执行，当前设置无法确认免费额度',engine:s.draw.engine,relay:!!s.draw.relay.url}, 'warn');scheduleRender(); return; }
    await Promise.all(tags.map(tag => generate(id, tag, {permission})));
  }

  /** What the queue says about a job, for the placeholder. */
  function queueText(key) {
    const job = backend.drawQueue?.get?.(key);
    if (!job) return 'NovelAI 正在画……';
    if (job.state === 'running') return job.attempt ? `NovelAI 正在画……（第 ${job.attempt + 1} 次尝试）` : 'NovelAI 正在画……';
    if (job.state === 'busy') return `NovelAI 账号正忙，稍后自动重试（第 ${job.attempt} 次）`;
    if (job.state === 'spacing') return '排队中，马上开始';
    if (job.state === 'remote') {
      const c = job.cloud || {};
      if (c.position > 0) return `云端排队中，前面还有 ${c.position} 位${c.holder ? `（${c.holder} 正在画）` : ''}`;
      return c.cooldown > 5000 ? `账号刚才忙，大家一起等 ${Math.ceil(c.cooldown / 1000)} 秒` : '云端排队，马上轮到你';
    }
    return `排队中，前面还有 ${job.position} 张`;
  }

  function frame(inner) { return `<span class="sttts-pic-frame">${inner}</span>`; }
  function fill(el, id, message, tag) {
    const record = stored(message, tag.hash), pic = shown(message, tag.hash), key = jobKey(id, tag), job = jobs.get(key);
    const s = settings(), folded = folds.get(id + ':' + tag.hash) ?? s.draw.fold;
    const state = job?.state || (pic ? 'done' : record?.removed ? 'removed' : 'idle');
    const waiting = state === 'generating' ? queueText(key) : '';
    const signature = [state, pic?.url, pic?.count, folded, waiting, job?.message].join('|');
    if (el.dataset.stttsRendered === signature) return;
    el.dataset.stttsRendered = signature;
    el.dataset.state = state;
    el.toggleAttribute('data-folded', state === 'done' && folded);
    if (state === 'done' && folded) {
      el.innerHTML = `<button type="button" class="sttts-pic-fold" data-sttts-pic-action="tap" aria-label="展开图片，双击放大查看"><span class="sttts-pic-fold-mark" aria-hidden="true">▸</span>图片已收起${pic.count > 1 ? ` · ${pic.count} 个版本` : ''} · 点一下展开</button>`;
    } else if (state === 'done') {
      el.innerHTML = frame(`<button type="button" class="sttts-pic-zoom" data-sttts-pic-action="tap" aria-label="点一下收起，双击放大查看${pic.count > 1 ? `（${pic.count} 个版本）` : ''}、参数和操作"><img src="${esc(pic.url)}" alt="${esc(tag.prompt)}" loading="lazy"></button>`);
    } else if (state === 'removed') {
      el.innerHTML = `<span class="sttts-pic-removed">图片已删除<button type="button" data-sttts-pic-action="draw">重新生成</button></span>`;
    } else if (state === 'generating') {
      // Redrawing keeps the current picture on screen with a small note over it.
      el.innerHTML = pic
        ? frame(`<button type="button" class="sttts-pic-zoom" data-sttts-pic-action="tap" aria-label="点一下收起，双击放大查看"><img src="${esc(pic.url)}" alt="${esc(tag.prompt)}" loading="lazy"></button><span class="sttts-pic-note">${esc(waiting)}<button type="button" data-sttts-pic-action="cancel">取消</button></span>`)
        : frame(`<span class="sttts-pic-wait">${esc(waiting)}<br><button type="button" data-sttts-pic-action="cancel">取消</button></span>`);
    } else if (state === 'error') {
      el.innerHTML = frame(`<span class="sttts-pic-wait">${esc(job.message)}<br><button type="button" data-sttts-pic-action="draw">重试</button></span>`);
    } else {
      const reason = !s.draw.enabled ? '正文出图没有开启' : !backend.drawReady() ? backend.drawMissing() : !s.draw.auto ? '自动出图已关闭' : s.draw.engine === 'gpt' && s.draw.gpt.ask ? 'GPT 生图每张都要花钱，点了才画' : '这张图没有自动生成';
      el.innerHTML = frame(`<span class="sttts-pic-wait">${reason}<br><button type="button" data-sttts-pic-action="draw">点击生成</button></span>`);
    }
  }

  /** Fills every picture placeholder in the rendered chat. The tavern's sanitizer renames classes in messages
   *  (sttts-pic becomes custom-sttts-pic), so placeholders are found by their data attributes. */
  function decorate(currentMessage) {
    for (const element of document.querySelectorAll('#chat .mes[mesid]')) {
      const placeholders = element.querySelectorAll('[data-sttts-pic]');
      if (!placeholders.length) continue;
      const id = Number(element.getAttribute('mesid')), message = context().chat[id];
      if (!message || !currentMessage(id)) continue;
      const tags = parsePictures(message.mes);
      for (const el of placeholders) {
        if (el.dataset.stttsToken !== marker) continue;
        const tag = tags.find(t => t.hash === el.dataset.stttsHash);
        if (tag) fill(el, id, message, tag);
      }
    }
  }

  /** Handles clicks inside picture blocks. Returns true when the click was ours. */
  function click(event) {
    if (lateSecondTap(event)) return true;
    const button = event.target.closest('[data-sttts-pic-action]');
    const box = button?.closest('[data-sttts-pic]');
    if (!box || box.dataset.stttsToken !== marker) return false;
    event.preventDefault();
    const id = Number(box.closest('.mes[mesid]')?.getAttribute('mesid')), message = context().chat[id];
    const tag = message && parsePictures(message.mes).find(t => t.hash === box.dataset.stttsHash);
    if (!tag) return true;
    if (button.dataset.stttsPicAction === 'tap') tap(id, message, tag, button);
    else act(button.dataset.stttsPicAction, id, message, tag, button);
    return true;
  }
  /** One tap folds or unfolds; a second tap within DOUBLE_TAP opens the viewer instead. */
  function tap(id, message, tag, source) {
    const key = id + ':' + tag.hash;
    if (first && !first.done && first.key === key) {
      clearTimeout(first.timer);
      first = null;
      act('zoom', id, message, tag, source.closest('[data-sttts-pic]')?.querySelector('img') ? source : null);
      return;
    }
    if (first && !first.done) { clearTimeout(first.timer); toggle(first); }
    const t = first = {key, id, message, tag, was: folds.get(key) ?? settings().draw.fold, at: Date.now(), rect: source.getBoundingClientRect?.(), done: false};
    t.timer = setTimeout(() => toggle(t), DOUBLE_TAP);
  }
  function toggle(t) { t.done = true; act(t.was ? 'unfold' : 'fold', t.id, t.message, t.tag); }
  /** A second tap that came after the picture already folded or unfolded, on the spot where it was tapped first. */
  function lateSecondTap(event) {
    const t = first, r = t?.rect, x = event.clientX, y = event.clientY;
    if (!t?.done || Date.now() - t.at > SLOW_TAP || !r?.width || !(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) return false;
    first = null;
    event.preventDefault();
    folds.set(t.key, t.was);
    scheduleRender();
    act('zoom', t.id, t.message, t.tag);
    return true;
  }
  function act(action, id, message, tag, source = null) {
    const pic = shown(message, tag.hash);
    if (action === 'draw' || action === 'redo') generate(id, tag, {interactive: true});
    if (action === 'cancel') backend.drawQueue?.cancel?.(jobKey(id, tag));
    if (action === 'open') openDraw({...pictureInputs(settings(), tag, message.mes), tag: tag.prompt, seed: pic?.seed});
    if (action === 'fold' || action === 'unfold') { folds.set(id + ':' + tag.hash, action === 'fold'); scheduleRender(); }
    if ((action === 'prev' || action === 'next') && pic) {
      keep(message, tag.hash, versionsOf(stored(message, tag.hash)), pic.index + (action === 'next' ? 1 : -1));
      saveSoon();
      scheduleRender();
    }
    if (action === 'zoom' && pic) {
      const list = versionsOf(stored(message, tag.hash));
      // Paging in the viewer also changes which version the chat shows.
      const pick = i => { if (i !== shown(message, tag.hash)?.index) { keep(message, tag.hash, list, i); saveSoon(); scheduleRender(); } };
      openImageViewer({doc: document, from: source?.querySelector?.('img') || source,
        gallery: {items: list.map(v => ({src: v.url, alt: tag.prompt, info: pictureInfo(v, tag)})), index: pic.index, onIndex: pick},
        actions: [
          downloadAction(document, i => ({source: list[i].url, name: [(list[i].characters || []).join('、') || context()?.name2 || 'ST-iPhonie', list[i].seed].filter(v => v !== undefined && v !== '').join('_')}), notice),
          {label: '重画', run: () => act('redo', id, message, tag)},
          {label: '改提示词再画', run: () => rewrite(id, tag).then(ok => ok ? undefined : false, error => { notice(error.message); return false; })},
          {label: '在绘图中打开', run: () => act('open', id, message, tag)},
          {label: '收起', run: () => act('fold', id, message, tag)},
          {label: '删除这版', danger: true, run: i => { pick(i); return remove(id, tag).then(done => done ? undefined : false); }}
        ]});
    }
    if (action === 'delete') remove(id, tag).catch(error => notice(error.message));
  }
  /** The 参数 panel of the viewer for one version. */
  function pictureInfo(v, tag) {
    return [
      ['模型', NAI_MODEL_NAMES?.[v.model] || v.model],
      ['尺寸', v.width && v.height ? `${v.width} × ${v.height}` : ''],
      ['步数', v.steps],
      ['种子', v.seed],
      ['角色', v.characters ? (v.characters.length ? v.characters.join('、') : '没有补角色外貌') : ''],
      ['画于', v.at ? new Date(v.at).toLocaleString('zh-CN', {hour12: false}) : ''],
      ['出图块', tag.spec ? tag.body || '' : tag.prompt]
    ];
  }
  /** Deletes the version on screen (file and record). Returns false when the user cancels. */
  /** Reads a picture's English tags in Chinese ('translate'), or changes them the way the user says ('revise'), with the phone's text model. */
  async function tagText(text, mode, wish = '') {
    if (!String(text).trim()) throw Error('框里是空的');
    const answer = tagTextAnswer(await backend.generateText(context(), {prompt: tagTextRequest(settings(), text, mode, wish), plainText: true, trimNames: false, responseLength: Math.min(6000, 1500 + String(text).length * 3)}));
    if (!answer) throw Error('模型没有回内容，再试一次');
    return answer;
  }
  /**
   * 改提示词再画: the tag's prompt (a whole block, or the tags) is changed in the message itself, so it stays changed,
   * and drawn again. The versions drawn before stay with it, to compare.
   */
  async function rewrite(id, tag) {
    const message = context().chat[id];
    if (!message || !parsePictures(message.mes).some(t => t.hash === tag.hash)) throw Error('这条消息已经变了，找不到这张图');
    const before = tag.spec ? tag.body : tag.prompt;
    const after = await editTags({doc: document, text: before, ask: tagText,
      about: tag.spec ? '整个出图块都能改：场景、角色、站位。改的会写回正文里，以后重画也用它；之前画的几版还在，可以左右滑着比。' : '画这张图用的英文 tag。改的会写回正文里；之前画的几版还在，可以左右滑着比。'});
    const value = after?.trim();
    if (!value) return false;
    const now = context().chat[id];
    if (now !== message || !parsePictures(message.mes).some(t => t.hash === tag.hash)) throw Error('这条消息已经变了，找不到这张图');
    let fresh = tag;
    if (value !== before.trim()) {
      const segment = message.mes.slice(tag.start, tag.end), at = segment.indexOf(before);
      if (!before || at < 0) throw Error('没在正文里找到这张图的提示词');
      // In prompt="…" a double quote would end it; tags never need angle brackets.
      const safe = tag.spec ? value.replace(/<\/?img\b/gi, '') : value.replace(/[<>]/g, '').replace(/"/g, /=\s*'/.test(segment.slice(0, at).slice(-12)) ? '"' : "'");
      message.mes = message.mes.slice(0, tag.start) + segment.slice(0, at) + safe + segment.slice(at + before.length) + message.mes.slice(tag.end);
      if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && message.swipes[message.swipe_id] != null) message.swipes[message.swipe_id] = message.mes;
      fresh = parsePictures(message.mes).find(t => t.index === tag.index);
      if (!fresh) throw Error('改完认不出这张图了，检查一下格式');
      const record = stored(message, tag.hash);
      if (record && fresh.hash !== tag.hash) { message.extra.sttts_pics[fresh.hash] = record; delete message.extra.sttts_pics[tag.hash]; }
      await context().saveChat();
      redrawMessage(id, message);
      scheduleRender();
    }
    generate(id, fresh, {interactive: true});
    return true;
  }
  async function remove(id, tag) {
    const message = context().chat[id], pic = shown(message, tag.hash);
    const others = pic ? pic.count - 1 : 0;
    if (!pic || !globalThis.confirm(`删除这张图？图片文件也会从酒馆删除。${others ? `这个标签还有 ${others} 个别的版本。` : '之后可以点“重新生成”再画。'}`)) return false;
    await removeFile(pic.url);
    const list = versionsOf(stored(message, tag.hash)).filter((_, i) => i !== pic.index);
    keep(message, tag.hash, list, pic.index - 1);
    await context().saveChat();
    scheduleRender();
    return true;
  }
  /** Pictures stored in the open chat, counting every version. */
  function pictureStats() {
    let count = 0;
    for (const m of context()?.chat || []) for (const record of Object.values(m?.extra?.sttts_pics || {})) count += versionsOf(record).length;
    return {count};
  }
  /** Deletes every picture (all versions) of the open chat from the tavern; their tags show "点击生成" again. */
  async function clearPictures() {
    const ctx = context();
    let count = 0, failed = 0;
    for (const m of ctx.chat || []) {
      const pics = m?.extra?.sttts_pics;
      if (!pics) continue;
      for (const record of Object.values(pics)) for (const version of versionsOf(record)) {
        try { await removeFile(version.url); count++; } catch { failed++; }
      }
      delete m.extra.sttts_pics;
    }
    await ctx.saveChat();
    scheduleRender();
    return {count, failed};
  }

  // ---------- Bridge helpers for the phone ----------
  function recentMessages(limit = 8) {
    const chat = context().chat, rows = [];
    for (let id = chat.length - 1; id >= 0 && rows.length < limit; id--) {
      const m = chat[id];
      if (!m || m.is_system) continue;
      rows.push({id, name: m.name || (m.is_user ? '我' : '角色'), user: !!m.is_user, preview: String(m.mes || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').slice(0, 60)});
    }
    return rows;
  }
  async function insertImage(id, photoId) {
    const ctx = context(), message = ctx.chat[id];
    if (!message) throw Error('这条消息已经不存在');
    const photo = await backend.library.getPhoto(photoId);
    if (!photo) throw Error('图片已不在相册中');
    const url = await upload(photo.blob, 'st-iphonie-' + Date.now());
    message.extra ??= {};
    if (!Array.isArray(message.extra.media)) message.extra.media = [];
    message.extra.inline_image = !(message.extra.media.length && !message.extra.inline_image);
    message.extra.media.push({url, type: 'image', title: photo.name, source: 'generated'});
    message.extra.media_index = message.extra.media.length - 1;
    const element = globalThis.$?.(`#chat .mes[mesid="${id}"]`);
    if (element?.length && ctx.appendMediaToMessage) ctx.appendMediaToMessage(message, element);
    await ctx.saveChat();
    return {id, url};
  }
  async function suggestPrompt() {
    // The same text model as everything else in the phone (引擎 → 文字模型): the tavern's model without its story
    // preset, or the custom API. The tavern's quiet generation would carry the whole story preset, and with it a
    // chain of thought or XML template the model then writes out.
    const ctx = context(), chat = ctx.chat || [];
    const prompt = suggestRequest(settings(), {before: before(chat.length, 6), only: castNow()});
    const reply = await backend.generateText(ctx, {prompt, plainText: true, trimNames: false, responseLength: promptLength(settings())});
    const result = readSuggestion(settings(), reply);
    if (!result.prompt) throw Error('模型没有写出提示词，再试一次');
    return withCount(result);
  }
  /**
   * A line written up to the NovelAI budget. Models cannot count tokens and often stop at half: the line is counted
   * with NovelAI's own tokenizer and, while it holds less than three quarters of the room, the model is asked (twice at
   * most) to add detail. A longer answer that would go over the limit is not taken. {prompt, people, tokens, budget}.
   */
  /** The line with how many NovelAI tokens it holds, and the room it had ({tokens, budget}; none without NovelAI). */
  async function withCount(result, cast = []) { return fillUp(null, result, cast); }
  async function fillUp(prompt, first, cast = []) {
    const s = settings(), b = s.draw?.engine === 'nai' ? tokenBudget(s.draw.params?.model) : null;
    if (!b) return first;
    let count = estimateTokens;
    try { count = await loadCounter(b.kind); } catch { /* no tokenizer: estimated */ }
    const n = budgetNumbers(s);
    if (!n) return first;
    // The looks of the people already in 角色 come out of the same room.
    const looks = s.routes.filter(r => r.appearance?.trim() && cast.some(c => sameName(c, r.name))).reduce((sum, r) => sum + countField(count, r.appearance), 0);
    const left = Math.max(0, n.left - looks);
    let result = first, used = countField(count, first.prompt), messages = prompt;
    for (let round = 0; prompt && round < 2 && used < left * 0.75; round++) {
      messages = fillUpRequest(messages, {prompts: s.promptRules, line: result.prompt, people: result.people, used, left, tags: Math.floor((left - used) / tagCost(count)), sentences: sentenceCount(s)});
      let more;
      try { more = readSuggestion(s, await backend.generateText(context(), {prompt: messages, plainText: true, trimNames: false, responseLength: promptLength(s)})); } catch { break; }
      const now = countField(count, more.prompt);
      if (!more.prompt || now <= used || now > left) break;
      result = {prompt: more.prompt, people: [...new Set([...result.people, ...more.people])]};
      used = now;
    }
    return {...result, tokens: used, budget: left};
  }
  /** 帮我写: a prompt line for what the user describes (a few words, Chinese is fine). */
  async function writePrompt(idea, cast = []) {
    if (!String(idea || '').trim()) throw Error('先说说想画什么');
    const names = (Array.isArray(cast) ? cast : []).map(String).slice(0, 8), prompt = writeRequest(settings(), {idea, cast: names, only: castNow()});
    const reply = await backend.generateText(context(), {prompt, plainText: true, trimNames: false, responseLength: promptLength(settings())});
    const result = readSuggestion(settings(), reply);
    if (!result.prompt) throw Error('模型没有写出提示词，再试一次');
    // Filled up to the limit only when the idea asks for it; otherwise a precise line of whatever length it takes.
    return /写满|填满|上限|尽量(多|长|详细)|越(多|长)越好|\d{3,4}\s*token/i.test(String(idea)) ? fillUp(prompt, result, names) : withCount(result, names);
  }
  const subscriptionLabel = sub => sub ? `${TIER_NAMES[sub.tier] || '未知档位'} · Anlas ${sub.anlas}` : '';

  /** The newest reply from a character: plan its pictures again ('separate') and queue them. */
  async function planLatest() {
    const chat = context().chat;
    for (let id = chat.length - 1; id >= 0; id--) {
      const m = chat[id];
      if (!m || m.is_user || m.is_system) continue;
      const done = await planPictures(id, {force: true});
      if (done) { registerAppearances(context().chat[id]); if (settings().draw.auto) await autoPictures(id); }
      return done;
    }
    throw Error('聊天里还没有角色的回复');
  }
  /** The newest reply from a character: voice its lines again (回复后单独配音), replacing the ones there. */
  async function voiceLatest() {
    const chat = context().chat;
    for (let id = chat.length - 1; id >= 0; id--) {
      const m = chat[id];
      if (!m || m.is_user || m.is_system) continue;
      if (!voice) throw Error('配音没有开');
      const was = m.mes;
      if (voice.has(m.mes)) m.mes = voice.strip(m.mes);
      // The lines go back as they were when nothing new could be put in.
      try { const {voiced} = await planReply(id, {voiced: true, pictured: false}); return voiced; } catch (error) { if (context().chat[id] === m) m.mes = was; throw error; }
    }
    throw Error('聊天里还没有角色的回复');
  }

  async function drawMessage(id) {
    const message = context().chat[id];
    if (!storyReply(message)) throw Error('找不到这层楼的回复');
    if (!backend.drawReady()) throw Error('请先在小手机的绘图 App 配好绘图接口');
    if (!parsePictures(message.mes).length && !await planPictures(id)) return;
    if (context().chat[id] !== message) return;
    const tags = parsePictures(message.mes).filter(tag => !shown(message, tag.hash));
    if (!tags.length) { notice('这层楼的图片已经生成'); return; }
    const permission = await allowed(true); if (!permission) return;
    for (const tag of tags) { if (context().chat[id] !== message) break; await generate(id, tag, {permission}); }
  }
  return {tagText, drawMessage, decorate, click, autoPictures, planPictures, planLatest, voiceLatest, registerAppearances, recentMessages, insertImage, suggestPrompt, writePrompt, subscriptionLabel, pictureStats, clearPictures};
}
