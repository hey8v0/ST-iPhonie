// 视觉小说 on the tavern page: the 「视觉小说」 button on each message (while the mode is on in the phone's 视觉小说 app),
// the stage (vn-stage.js) fed with the chat's messages one by one, and the 立绘 kept as files in the tavern's images
// (settings.vn.cast), so every device sees them.
import {openVnStage} from './vn-stage.js';
import {storySteps, userSteps, pickLook, inlinePictures, editLook} from './core/vn.js';
import {parsePictures} from './core/draw.js';
import {parseSounds} from './core/sounds.js';
import {parseBgm} from './core/music.js';

const versionsOf = record => !record ? [] : Array.isArray(record.versions) ? record.versions : record.url ? [{...record}] : [];
/** The drawn picture of a story picture block, as shown in the chat (the chosen version). */
function pictureUrl(message, hash) {
  const record = message?.extra?.sttts_pics?.[hash], list = versionsOf(record);
  if (!list.length) return '';
  const index = Math.min(list.length - 1, Math.max(0, Number.isInteger(record.index) ? record.index : list.length - 1));
  return list[index]?.url || '';
}
const OWN = /^\/?user\/images\//;

/**
 * linesOf(id): the message's voice lines (with places); voiced(line): whether it has a voice; play(id, index) plays one
 * line; narrate(text) reads story in the 旁白's voice; stop() stops; voiceOn(): voice is on; sound(id, index) /
 * music(id, index): plays a sound tag / <bgm> of a message (sounds() / musicOn(): whether they are on); avatars(): the
 * tavern's avatars ({me, characters}); closePanel(): puts the phone away.
 */
export function createVnHost({showEntry = () => true, context, settings, backend, linesOf, voiced, play, narrate = () => {}, stop, voiceOn, sound = () => {}, music = () => {}, sounds = () => false, musicOn = () => false, avatars, notice, closePanel = () => {}, doc = document}) {
  let stage = null, cursor = 0, endTimer = 0;
  const vn = () => settings().vn;
  const chat = () => context()?.chat || [];

  function stepsOf(id) {
    const m = chat()[id];
    if (!m || m.is_system) return null;
    if (m.is_user) return userSteps(m.mes, m.name || context()?.name1 || '你').map(s => ({...s, id}));
    const lines = linesOf(id) || [];
    const own = parsePictures(m.mes || '').map(t => ({start: t.start, url: pictureUrl(m, t.hash)})), inline = inlinePictures(m.mes || '');
    const pics = [...own, ...inline, ...shownPictures(id, m.mes || '', [...own, ...inline])];
    const tags = sounds() ? parseSounds(m.mes || '') : [], songs = musicOn() ? parseBgm(m.mes || '') : [];
    const skip = [...(settings().narration?.skip || []), ...(vn().skip || []), 'style', 'script'];
    return storySteps(m.mes || '', lines, {pics, sounds: tags, bgm: songs, skip}).map(s => s.kind === 'say' ? {...s, id, voiced: !!voiced(lines[s.line])} : {...s, id});
  }
  /**
   * Pictures another plugin added to the message on the page only (智绘姬 and the like): each one where the text
   * just before it is in the story (else at the start). Small ones (emoji, icons) and the phone's own are left out.
   */
  function shownPictures(id, raw, known) {
    const box = doc.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);
    if (!box) return [];
    const abs = u => { try { return new URL(u, doc.baseURI).href; } catch { return u; } };
    const seen = new Set(known.map(p => abs(p.url))), out = [], offsets = [];let source = '';
    for (const m of raw.matchAll(/[\p{L}\p{N}]/gu)) { source += m[0];offsets.push(m.index + m[0].length); }
    let previous = 0;
    for (const img of box.querySelectorAll('img')) {
      const url = img.currentSrc || img.src;
      if (!url || seen.has(abs(url)) || img.closest('[class*="sttts"]')) continue;
      if (img.naturalWidth && img.naturalWidth < 160 || img.naturalHeight && img.naturalHeight < 160) continue;
      seen.add(abs(url));
      let start = 0;
      try {
        const range = doc.createRange(); range.setStart(box, 0); range.setEndBefore(img);
        const before = (range.toString().match(/[\p{L}\p{N}]/gu) || []).join('');
        for (const size of [60, 30, 12, 6]) {
          const tail = before.slice(-size);if (!tail) continue;
          const at = source.indexOf(tail, previous);
          if (at >= 0) { previous = at + tail.length;start = offsets[previous - 1] || 0;break; }
        }
        if (!start && before) start = offsets[Math.max(0, previous - 1)] || 0;

      } catch {}
      out.push({start, url});
    }
    return out;
  }
  /** The chat's own background (the tavern's), '' when it has none. */
  function chatBackground() {
    for (const sel of ['#bg_custom', '#bg1']) {
      const el = doc.querySelector(sel);
      if (!el) continue;
      const m = /url\(["']?(.*?)["']?\)/.exec(doc.defaultView.getComputedStyle(el).backgroundImage || '');
      if (m?.[1]) return m[1];
    }
    return '';
  }
  /** Where the stage starts: the chat's own background, else the last story picture before the message (dimmed). */
  function backdrop(start) {
    const own = chatBackground();
    if (own) return {url: own, soft: false};
    const list = chat();
    for (let id = start - 1; id >= 0 && id >= start - 40; id--) {
      const m = list[id];
      if (!m || m.is_user || m.is_system) continue;
      const tags = parsePictures(m.mes || '');
      for (let i = tags.length - 1; i >= 0; i--) { const url = pictureUrl(m, tags[i].hash); if (url) return {url, soft: true}; }
    }
    return null;
  }
  function title() {
    const ctx = context();
    if (ctx?.groupId) return ctx.groups?.find(g => String(g.id) === String(ctx.groupId))?.name || '群聊';
    return ctx?.name2 || '';
  }
  /** Where 「从最新开始」 starts: the latest reply, with the user's message before it. */
  function latestStart() {
    const list = chat();
    for (let id = list.length - 1; id >= 0; id--) {
      const m = list[id];
      if (!m || m.is_system || m.is_user) continue;
      return list[id - 1]?.is_user && !list[id - 1].is_system ? id - 1 : id;
    }
    return Math.max(0, list.length - 1);
  }

  function open(from = 'latest') {
    const list = chat();
    if (!list.length) throw Error('这个聊天还没有内容');
    const start = from === 'first' ? 0 : from === 'latest' ? latestStart() : Math.min(list.length - 1, Math.max(0, Number(from) || 0));
    stage?.close();
    closePanel();
    cursor = start;
    const tavern = avatars();
    // Avatars picked in the phone (an album photo; 只显示文字: none) come before the tavern's.
    const mine = {}, made = [];
    try {
      for (const [key, a] of Object.entries(backend.getState?.().chat?.avatars || {})) {
        if (a?.kind === 'text') mine[key] = '';
        else if (a?.kind === 'photo' && a.photoId) backend.library?.getPhoto?.(a.photoId).then(p => { if (p?.blob && !stage?.closed) { const u = URL.createObjectURL(p.blob); made.push(u); mine[key] = u; } }).catch(() => {});
      }
    } catch {}
    stage = openVnStage({
      doc, title: title(), subtitle: start > 0 ? `从第 ${start} 楼开始` : '从头开始', backdrop: backdrop(start), scene: chatBackground(),
      look: vn,
      source: {next: () => { while (cursor < chat().length) { const id = cursor++, steps = stepsOf(id); if (steps?.length) return {id, steps}; } return null; }},
      voice: {play: s => play(s.id, s.line), narrate: s => narrate(s.text), stop, on: voiceOn},
      // 快进 runs past the one-off sounds; the ambience and the music still change to where it stops.
      cue: (s, {skipping}) => { if (s.kind === 'bgm') music(s.id, s.index); else sound(s.id, s.index, {skipping}); },
      face: (name, user) => { const key = user ? 'me' : name; if (Object.hasOwn(mine, key)) return mine[key]; return user ? tavern.me : tavern.characters?.[name] || avatars().characters?.[name] || ''; },
      sprite: (name, how) => pickLook(vn().cast?.[name], {...how, outfit: wear()[name] || ''}),
      send,
      save: patch => { try { backend.saveVn(patch); } catch (error) { notice(error.message); } },
      onClose: id => {
        stage = null;
        for (const u of made) URL.revokeObjectURL(u);
        // Back in the chat where the story was left.
        if (id != null) doc.querySelector(`#chat .mes[mesid="${id}"]`)?.scrollIntoView?.({block: 'center'});
      },
    });
    return true;
  }
  /** Sends what happens next through the tavern's own input, as if typed there. */
  function send(text) {
    const box = doc.querySelector('#send_textarea'), button = doc.querySelector('#send_but');
    if (!box || !button) { notice('找不到酒馆的输入框，没法发送'); return false; }
    if (doc.defaultView.getComputedStyle(button).display === 'none' || context()?.streamingProcessor && !context().streamingProcessor.isFinished) { notice('酒馆还在写上一条，等它写完再发'); return false; }
    box.value = text;
    box.dispatchEvent(new doc.defaultView.Event('input', {bubbles: true}));
    button.click();
    return true;
  }

  /** The 视觉小说 button on each message, while the mode is on. */
  function buttons() {
    const on = showEntry() && vn()?.enabled === true && settings().general?.hideStoryWaves !== true;
    for (const mes of doc.querySelectorAll('#chat .mes[mesid]')) {
      const old = mes.querySelector('[data-sttts-vn]');
      if (!on || mes.getAttribute('is_system') === 'true') { old?.remove(); continue; }
      if (old) continue;
      const bar = mes.querySelector('.mes_buttons');
      if (!bar) continue;
      const b = doc.createElement('div');
      b.className = 'mes_button sttts-vn-entry fa-solid fa-book-open';
      b.dataset.stttsVn = '';
      b.title = '从这里开始视觉小说';
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', '从这里开始视觉小说');
      b.tabIndex = 0;
      bar.prepend(b);
    }
  }
  function click(event) {
    const b = event.target.closest?.('[data-sttts-vn]');
    if (!b || !b.closest('#chat')) return false;
    event.preventDefault();
    event.stopPropagation();
    try { open(Number(b.closest('.mes[mesid]')?.getAttribute('mesid'))); } catch (error) { notice(error.message); }
    return true;
  }

  /**
   * Keeps a 立绘 (a PNG with its background taken off) as a file in the tavern; null takes it away. look: '' for the
   * usual one, else a 表情 or 动作 id; seed: what the usual one was drawn with (its 表情 are drawn with it too).
   */
  /** The 形象 each character wears in the open chat ({name: outfit id}), kept in the chat itself. */
  function wear() { const w = context()?.chatMetadata?.sttts_vn_wear; return w && typeof w === 'object' ? {...w} : {}; }
  function setWear(name, id) {
    const ctx = context();
    if (!ctx?.chatMetadata || !ctx.chat?.length) throw Error('先在酒馆里打开一个聊天');
    const w = wear();
    if (id) w[String(name)] = String(id); else delete w[String(name)];
    ctx.chatMetadata.sttts_vn_wear = w;
    (ctx.saveMetadataDebounced || ctx.saveMetadata)?.call(ctx);
    return w;
  }
  /**
   * A change to a character's 立绘 (core/vn.js editLook): a new picture (blob) in place of the one in use, or joining
   * its group (add); use / drop / mix within the group; dropOutfit. Without a blob or another change, the picture in
   * use is taken out. Files no longer used are deleted from the tavern.
   */
  async function setSprite(name, blob, {look = '', outfit = '', seed, add = false, use = '', drop = '', mix, dropOutfit = false} = {}) {
    name = String(name || '').trim();
    if (!name) throw Error('没有角色名');
    let url = '';
    if (blob) {
      const ctx = context();
      const response = await fetch('/api/images/upload', {method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({image: await backend.base64(blob), format: 'png', ch_name: 'ST-iPhonie', filename: 'vn-sprite-' + Date.now()})});
      if (!response.ok) throw Error('立绘没能存进酒馆（' + response.status + '）');
      url = (await response.json()).path;
    }
    const s = settings(), removing = !blob && !use && !drop && typeof mix !== 'boolean' && !dropOutfit;
    const {entry, gone} = editLook(s.vn.cast?.[name], {look, outfit, url, add, use, drop: removing ? true : drop, mix, seed, dropOutfit});
    const saved = backend.saveVn({cast: {...s.vn.cast, [name]: entry}});
    // A file still used somewhere (the same upload in two places) stays.
    const used = JSON.stringify(saved?.cast ?? settings().vn.cast ?? {});
    for (const old of gone) if (old && old !== url && OWN.test(old) && !used.includes(JSON.stringify(old))) fetch('/api/images/delete', {method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify({path: old})}).catch(() => {});
    return url;
  }

  return {
    open, buttons, click, setSprite, wear, setWear,
    get showing() { return !!stage; },
    status(phase) { stage?.status(phase); },
    refresh() { stage?.refresh(); buttons(); },
    /** A reply was drawn: the stage goes on with it. */
    rendered() { clearTimeout(endTimer); stage?.more(); },
    /** The tavern stopped writing: if nothing new came, the box comes back. */
    ended() { clearTimeout(endTimer); endTimer = setTimeout(() => stage?.failed(), 800); },
    close() { clearTimeout(endTimer); stage?.close(); stage = null; },
    dispose() { this.close(); for (const b of doc.querySelectorAll('#chat [data-sttts-vn]')) b.remove(); },
    state: () => stage?.state() || null,
  };
}
