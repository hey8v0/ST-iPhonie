// 视觉小说 on the tavern page: the 「视觉小说」 button on each message (while the mode is on in the phone's 视觉小说 app),
// the stage (vn-stage.js) fed with the chat's messages one by one, and the 立绘 kept as files in the tavern's images
// (settings.vn.cast), so every device sees them.
import {openVnStage} from './vn-stage.js';
import {storySteps, userSteps} from './core/vn.js';
import {parsePictures} from './core/draw.js';

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
 * line; stop() stops; voiceOn(): voice is on; avatars(): the tavern's avatars ({me, characters}); closePanel(): puts
 * the phone away.
 */
export function createVnHost({context, settings, backend, linesOf, voiced, play, stop, voiceOn, avatars, notice, closePanel = () => {}, doc = document}) {
  let stage = null, cursor = 0, endTimer = 0;
  const vn = () => settings().vn;
  const chat = () => context()?.chat || [];

  function stepsOf(id) {
    const m = chat()[id];
    if (!m || m.is_system) return null;
    if (m.is_user) return userSteps(m.mes, m.name || context()?.name1 || '你').map(s => ({...s, id}));
    const lines = linesOf(id) || [];
    const pics = parsePictures(m.mes || '').map(t => ({start: t.start, url: pictureUrl(m, t.hash)}));
    return storySteps(m.mes || '', lines, {pics, skip: settings().narration?.skip}).map(s => s.kind === 'say' ? {...s, id, voiced: !!voiced(lines[s.line])} : {...s, id});
  }
  /** Where the stage starts: the last story picture before the message (softened), else the chat's own background. */
  function backdrop(start) {
    const list = chat();
    for (let id = start - 1; id >= 0 && id >= start - 40; id--) {
      const m = list[id];
      if (!m || m.is_user || m.is_system) continue;
      const tags = parsePictures(m.mes || '');
      for (let i = tags.length - 1; i >= 0; i--) { const url = pictureUrl(m, tags[i].hash); if (url) return {url, soft: true}; }
    }
    for (const sel of ['#bg_custom', '#bg1']) {
      const el = doc.querySelector(sel);
      if (!el) continue;
      const m = /url\(["']?(.*?)["']?\)/.exec(doc.defaultView.getComputedStyle(el).backgroundImage || '');
      if (m?.[1]) return {url: m[1], soft: false};
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
    stage = openVnStage({
      doc, title: title(), subtitle: start > 0 ? `从第 ${start} 楼开始` : '从头开始', backdrop: backdrop(start),
      look: vn,
      source: {next: () => { while (cursor < chat().length) { const id = cursor++, steps = stepsOf(id); if (steps?.length) return {id, steps}; } return null; }},
      voice: {play: s => play(s.id, s.line), stop, on: voiceOn},
      face: (name, user) => user ? tavern.me : tavern.characters?.[name] || avatars().characters?.[name] || '',
      sprite: name => vn().cast?.[name]?.sprite || '',
      send,
      save: patch => { try { backend.saveVn(patch); } catch (error) { notice(error.message); } },
      onClose: id => {
        stage = null;
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
    const on = vn()?.enabled === true;
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

  /** Keeps a 立绘 (a PNG with its background taken off) as a file in the tavern; null takes it away. */
  async function setSprite(name, blob) {
    name = String(name || '').trim();
    if (!name) throw Error('没有角色名');
    const s = settings(), old = s.vn.cast?.[name]?.sprite || '';
    let url = '';
    if (blob) {
      const ctx = context();
      const response = await fetch('/api/images/upload', {method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({image: await backend.base64(blob), format: 'png', ch_name: 'ST-iPhonie', filename: 'vn-sprite-' + Date.now()})});
      if (!response.ok) throw Error('立绘没能存进酒馆（' + response.status + '）');
      url = (await response.json()).path;
    }
    const cast = {...s.vn.cast};
    if (url) cast[name] = {sprite: url, at: Date.now()}; else delete cast[name];
    backend.saveVn({cast});
    if (old && old !== url && OWN.test(old)) fetch('/api/images/delete', {method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify({path: old})}).catch(() => {});
    return url;
  }

  return {
    open, buttons, click, setSprite,
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
