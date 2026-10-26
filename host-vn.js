// 视觉小说 on the tavern page: the stage (vn-stage.js), opened from a message's 小手机工具 menu or the phone's 视觉小说
// app, fed with the chat's messages one by one, and the 立绘 kept as files in the tavern's images
// (settings.vn.cast), so every device sees them. A character can have a VRM or Live2D model instead (vn-model.js), kept
// as a file in the tavern's user/files the same way.
import {openVnStage} from './vn-stage.js';
import {storySteps, userSteps, pickLook, inlinePictures, editLook} from './core/vn.js';
import {parsePictures} from './core/draw.js';
import {storyMessage, storyReply} from './core/outgoing.js';
import {parseSounds} from './core/sounds.js';
import {parseBgm} from './core/music.js';
import {modelInfo, normalizeModel, currentModel, MODEL_LIMIT, vrmaInfo, wordList, MOVE_FILE_LIMIT} from './core/model-files.js';
import {MOVES, moveFor} from './core/model-moves.js';

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
 * tavern's avatars ({me, characters}); closePanel(): puts the phone away. mouth(): the mouth of the voice playing now
 * (core/model-files.js mouthShape), for the models' lips.
 */
export function createVnHost({context, settings, backend, linesOf, voiced, play, narrate = () => {}, stop, voiceOn, sound = () => {}, music = () => {}, sounds = () => false, musicOn = () => false, avatars, notice, closePanel = () => {}, mouth = () => null, doc = document}) {
  let stage = null, cursor = 0, endTimer = 0;
  const failed = new Set();
  const vn = () => settings().vn, picks = new Map();
  const chat = () => context()?.chat || [];

  /** A message as the stage's steps; max: how long a page of text may be (绘本 takes whole lines). */
  function stepsOf(id, max) {
    const m = chat()[id];
    if (!storyMessage(m)) return null;
    if (m.is_user) return userSteps(m.mes, m.name || context()?.name1 || '你', max).map(s => ({...s, id}));
    const lines = linesOf(id) || [];
    const own = parsePictures(m.mes || '').map(t => ({start: t.start, url: pictureUrl(m, t.hash)})), inline = inlinePictures(m.mes || '');
    const pics = [...own, ...inline, ...shownPictures(id, m.mes || '', [...own, ...inline])];
    const tags = sounds() ? parseSounds(m.mes || '') : [], songs = musicOn() ? parseBgm(m.mes || '') : [];
    const skip = [...(settings().narration?.skip || []), ...(vn().skip || []), 'style', 'script'];
    return storySteps(m.mes || '', lines, {pics, sounds: tags, bgm: songs, skip, body: settings().narration?.body, ...(max ? {max} : {})}).map(s => s.kind === 'say' ? {...s, id, voiced: !!voiced(lines[s.line])} : {...s, id});
  }
  /**
   * Pictures another plugin added to the message on the page only (智绘姬 and the like): each one where the text
   * just before it is in the story. Unrendered picture tags supply positions when a plugin replaces the prose.
   * Small ones (emoji, icons) and the phone's own are left out.
   */
  function shownPictures(id, raw, known) {
    const box = doc.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);
    if (!box) return [];
    const abs = u => { try { return new URL(u, doc.baseURI).href; } catch { return u; } };
    const seen = new Set(known.map(p => abs(p.url))), out = [], offsets = [];let source = '';
    for (const m of raw.matchAll(/[\p{L}\p{N}]/gu)) { source += m[0];offsets.push(m.index + m[0].length); }
    const slots = known.filter(p => !p.url && Number.isFinite(p.start)).sort((a,b)=>a.start-b.start);
    // Range.toString() includes style code and controls that image plugins add. Those labels are not story anchors.
    const beforeImage = new Map(), walker = doc.createTreeWalker(box, 5);let before = '';
    for(let node; (node=walker.nextNode());) {
      if(node.nodeType===1&&node.tagName==='IMG')beforeImage.set(node,before);
      if(node.nodeType!==3||node.parentElement?.closest('style,script,button,select,textarea,[hidden],[aria-hidden="true"],.sttts-pic,.sttts-phone-note'))continue;
      before=(before+(node.textContent.match(/[\p{L}\p{N}]/gu)||[]).join('')).slice(-300);
    }
    let previous = 0;
    for (const img of box.querySelectorAll('img')) {
      const url = img.currentSrc || img.src;
      if (!url || seen.has(abs(url)) || img.closest('[class*="sttts"]')) continue;
      if (img.naturalWidth && img.naturalWidth < 160 || img.naturalHeight && img.naturalHeight < 160) continue;
      seen.add(abs(url));
      const slot=slots.shift();let start = null;
      try {
        const before = beforeImage.get(img)||'';
        for (const size of [60, 30, 12, 6]) {
          const tail = before.slice(-size);if (!tail) continue;
          const from=offsets.findIndex(at=>at>=previous), at = source.indexOf(tail,Math.max(0,from-tail.length+1));
          if (at >= 0 && offsets[at+tail.length-1]>=previous) {
            start = offsets[at+tail.length-1];
            while(start<raw.length&&/[\s。，、！？!?…；;,.：:”’」』）)】\]]/.test(raw[start]))start++;
            break;
          }
        }
      } catch {}
      // A failed match is not evidence that an image belongs before all prose. Original tags are authoritative
      // fallbacks, including when the image plugin puts its whole gallery ahead of a rendered/iframe story.
      if(start===null)start=slot?.start??((beforeImage.get(img)||'')?raw.length:previous);
      start=Math.max(previous,start);previous=start;
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
      if (!storyReply(m)) continue;
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
    failed.clear();
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
      voice: {play: s => play(s.id, s.line), narrate: s => narrate(s.text), stop, on: voiceOn, mouth},
      models: {
        has: name => !!currentModel(vn().cast?.[name]),
        load: async name => {
          const entry = currentModel(vn().cast?.[name]), {createModelActor, modelBytes} = await import('./vn-model.js');
          try { return await createModelActor({...entry}, await modelBytes(entry.path)); }
          // Once a stage: the 立绘 (or the avatar) stays in its place.
          catch (error) { if (!failed.has(name)) { failed.add(name); notice(`${name}的模型没能演出来：${error.message}`); } throw error; }
        },
        move: (name, how) => moveSpec(name, how),
      },
      // 快进 runs past the one-off sounds; the ambience and the music still change to where it stops.
      cue: (s, {skipping}) => { if (s.kind === 'bgm') music(s.id, s.index); else sound(s.id, s.index, {skipping}); },
      face: (name, user) => { const key = user ? 'me' : name; if (Object.hasOwn(mine, key)) return mine[key]; return user ? tavern.me : tavern.characters?.[name] || avatars().characters?.[name] || ''; },
      sprite: (name, how) => {
        const why = {}, cast = vn().cast || {}, url = pickLook(cast[name], {...how, name, names: [...new Set([...(how.names || []), ...Object.keys(cast)])], outfit: wear()[name] || '', why});
        if (cast[name]) picks.set(name, {...why, line: String(how.line || '').slice(0, 40)});
        return url;
      },
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

  /**
   * A file picked in the phone, as this page's own: the phone is a frame of its own, and its files are another
   * window's (instanceof Blob says no to them). Copied by the browser where it can, else read through.
   */
  async function ownFile(file) {
    const name = String(file?.name || ''), type = String(file?.type || '');
    let local = null;
    try { local = Blob.prototype.slice.call(file, 0, undefined, type); } catch {}
    if (!local && typeof file?.arrayBuffer === 'function') local = new Blob([await file.arrayBuffer()], {type});
    if (!local?.size) throw Error('模型文件无效（读不出内容）');
    return new File([local], name, {type});
  }
  /**
   * A character's 模型 (several, to switch between): a new file (a .vrm, or a Live2D model as a .zip) joins them, kept in
   * the tavern's user/files, and is put on; use: which one they stand as ('' = the 立绘); remove: that one goes (its file
   * deleted from the tavern); else a change to how one stands (frame, zoom, lift, map, keep). id: which one (the one in
   * use when not said). Resolves to that model (or the one in use after use / remove; null for the 立绘).
   */
  async function setModel(name, blob, {id = '', use, remove = false, ...change} = {}) {
    name = String(name || '').trim();
    if (!name) throw Error('没有角色名');
    if (blob) blob = await ownFile(blob);
    const s = settings(), entry = s.vn.cast?.[name] || {sprite: '', looks: {}, actions: [], outfits: []};
    let models = [...(entry.models || [])], useModel = entry.useModel || '', target = id || useModel, gone = null;
    if (blob) {
      if (models.length >= MODEL_LIMIT) throw Error(`一个角色最多存 ${MODEL_LIMIT} 个模型，先删掉一个不用的`);
      const info = await modelInfo(new Uint8Array(await blob.arrayBuffer()));
      const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), file = `sttts-model-${key}.${info.kind === 'vrm' ? 'vrm' : 'zip'}`;
      const ctx = context();
      const response = await fetch('/api/files/upload', {method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({name: file, data: await backend.base64(blob)})});
      if (!response.ok) throw Error(response.status === 413 ? '模型文件太大，酒馆（或它前面的服务器）不让上传这么大的文件' : '模型没能存进酒馆（' + response.status + '）');
      const made = {id: 'm-' + key, kind: info.kind, version: info.version, path: 'user/files/' + file, file: String(blob.name || (info.kind === 'vrm' ? 'model.vrm' : 'model.zip')), size: blob.size, title: info.title, frame: 'half', zoom: 1, lift: 0, map: {}, at: Date.now()};
      if (!normalizeModel(made)) throw Error('模型设置无效');
      models.push(made); useModel = target = made.id;
    } else if (remove) {
      gone = models.find(m => m.id === target) || null;
      if (!gone) throw Error('没有这个模型');
      models = models.filter(m => m !== gone);
      if (useModel === gone.id) useModel = models[0]?.id || '';
      target = useModel;
    } else if (use !== undefined) {
      if (use && !models.some(m => m.id === use)) throw Error('没有这个模型');
      useModel = target = String(use || '');
    } else {
      const at = models.findIndex(m => m.id === target);
      if (at < 0) throw Error('没有这个模型');
      const next = {...models[at], ...change, id: models[at].id, kind: models[at].kind, path: models[at].path};
      if (!normalizeModel(next)) throw Error('模型设置无效');
      models[at] = next;
    }
    const {model: _old, ...rest} = entry;
    const saved = backend.saveVn({cast: {...s.vn.cast, [name]: {...rest, models, useModel}}});
    if (gone) {
      fetch('/api/files/delete', {method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify({path: gone.path.replace(/^\//, '')})}).catch(() => {});
      import('./vn-model.js').then(m => m.forgetModelBytes(gone.path)).catch(() => {});
    }
    const kept = (saved?.cast ?? settings().vn.cast)?.[name];
    return (kept?.models || []).find(m => m.id === target) || null;
  }

  /**
   * The 动作 a line brings for a character's model (core/model-moves.js), from the story around it: the built-in ones;
   * their own 立绘 动作 named like one of those (their words bring it on too); for VRM the user's motion files, for
   * Live2D the model's own motions given words. A spec for the model's act(), or null.
   */
  function moveSpec(name, how = {}) {
    const entry = vn().cast?.[name], model = currentModel(entry);
    if (!model) return null;
    const extra = [];
    if (model.kind === 'vrm') for (const m of vn().moves || []) extra.push({id: m.id, label: m.label, words: m.words});
    else for (const [motion, words] of Object.entries(model.acts || {})) extra.push({id: 'motion:' + motion, label: motion, words});
    for (const a of entry.actions || []) {
      if (a.kind === 'expression') continue;
      const same = MOVES.find(m => m.label === a.label || (a.words || []).some(w => m.words.includes(w)));
      if (same) extra.push({id: same.id, label: same.label, words: a.words});
    }
    const hit = moveFor({...how, name}, extra);
    if (!hit) return null;
    if (hit.id.startsWith('motion:')) return {id: hit.id, motion: hit.id.slice(7)};
    const file = (vn().moves || []).find(m => m.id === hit.id);
    return file ? {id: file.id, path: file.path} : {id: hit.id};
  }
  /**
   * The user's motion files (.vrma, for every VRM character): a new one joins them (kept in the tavern's user/files);
   * else the one with this id is renamed / given words, or removed (its file deleted). Resolves to the list.
   */
  async function setMoveFile(blob, {id = '', label, words, remove = false} = {}) {
    const s = settings(), list = [...(s.vn.moves || [])];
    let gone = null;
    if (blob) {
      blob = await ownFile(blob);
      if (list.length >= MOVE_FILE_LIMIT) throw Error(`动作文件最多存 ${MOVE_FILE_LIMIT} 个，先删掉不用的`);
      const info = vrmaInfo(new Uint8Array(await blob.arrayBuffer()));
      const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), file = `sttts-move-${key}.vrma`;
      const response = await fetch('/api/files/upload', {method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify({name: file, data: await backend.base64(blob)})});
      if (!response.ok) throw Error('动作文件没能存进酒馆（' + response.status + '）');
      const base = String(blob.name || '').replace(/\.vrma$/i, '').trim();
      list.push({id: 'v-' + key, label: String(label || base || '动作').slice(0, 20), words: wordList(words ?? base), path: 'user/files/' + file, file: String(blob.name || file), size: blob.size, seconds: info.seconds, at: Date.now()});
    } else {
      const at = list.findIndex(m => m.id === id);
      if (at < 0) throw Error('没有这个动作文件');
      if (remove) gone = list.splice(at, 1)[0];
      else list[at] = {...list[at], ...(label != null ? {label: String(label)} : {}), ...(words != null ? {words: wordList(words)} : {})};
    }
    const saved = backend.saveVn({moves: list});
    if (gone) fetch('/api/files/delete', {method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify({path: gone.path.replace(/^\//, '')})}).catch(() => {});
    return (saved?.moves ?? settings().vn.moves) || [];
  }

  /** What the stage last chose for a character and why (shown on their 立绘 page): {kind, label, word, where, line}. */
  const lastPick = name => picks.has(name) ? {...picks.get(name)} : null;
  return {
    open, setSprite, setModel, setMoveFile, moveSpec, wear, setWear, lastPick,
    /** 绘本: a message's steps with whole lines (null when it is not part of the story). */
    bookSteps: id => stepsOf(id, 4000),
    /** 绘本: a character's 立绘 for a feeling, in the 形象 this chat uses ('' when they have none). */
    bookSprite(name, emotion = '') {
      const cast = vn().cast || {};
      return cast[name] ? pickLook(cast[name], {emotion, name, names: Object.keys(cast), outfit: wear()[name] || '', random: () => 0}) : '';
    },
    get showing() { return !!stage; },
    status(phase) { stage?.status(phase); },
    refresh() { stage?.refresh(); },
    /** A reply was drawn: the stage goes on with it. */
    rendered() { clearTimeout(endTimer); stage?.more(); },
    /** The tavern stopped writing: if nothing new came, the box comes back. */
    ended() { clearTimeout(endTimer); endTimer = setTimeout(() => stage?.failed(), 800); },
    close() { clearTimeout(endTimer); stage?.close(); stage = null; },
    dispose() { this.close(); },
    state: () => stage?.state() || null,
  };
}
