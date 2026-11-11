// Lives on the tavern page, like music: phone navigation does not own the queue.
import {bedtimeRequest, parseBedtime, createBedtimePlayer} from './core/bedtime.js';
import {modelRules} from './core/state.js';
import {soundNames} from './core/sounds.js';
import {openBook as openReadingBook} from './core/bookshelf.js';
import {createSoundHost} from './host-sounds.js';
import {createMusicHost} from './host-music.js';

export function createBedtimeHost({context, settings, backend, doc = globalThis.document, soundFactory = createSoundHost, musicFactory = createMusicHost}) {
  let busy = false, sound = null, music = null, level = 1, voiceVolume = 1, closed = false, playbackRole = null;
  const lowSettings = () => ({...settings(), sounds: {...settings().sounds, enabled: true, generate: false, ambienceVolume: .12 * level, sfxVolume: .25 * level}, music: {...settings().music, volume: .12 * level, mode: 'one'}});
  const emit = status => backend.emit('bedtime', status);
  const player = createBedtimePlayer({
    read: line => backend.player.start([{...line, role: playbackRole.name}], () => !closed, {...settings(), routes: [playbackRole]}), cue: step => sound?.cue(step),
    gain: value => { level = value; backend.player.sink.setVolume?.(voiceVolume * value); sound?.refresh(); music?.level?.(); },
    stopAudio: () => { backend.player.stop(); sound?.close(); sound = null; music?.close(); music = null; }, onChange: emit,
  });
  const roles = () => settings().routes.filter(r => r.name !== '旁白' && r.voice);
  function narrator(book) {
    const all = backend.settings?.routes || settings().routes;
    const matches = all.filter(r => book.bedtime.roleId ? r.id === book.bedtime.roleId : r.name === book.bedtime.role);
    if (matches.length > 1) throw Error('有多个同名讲述者，请在角色 App 确认原故事的讲述者');
    if (!matches[0]?.voice) throw Error('讲述者的声音已移除，请先在角色 App 选好声音');
    return matches[0];
  }
  async function source(id, chapter = 0) {
    const row = await backend.bookshelf.get(id), file = await backend.bookshelf.files.get(id);
    if (!row || !file?.blob || row.type === 'comic') throw Error('请选择书架里的文字书');
    const opened = await openReadingBook(file.blob, row.name || row.title, doc?.defaultView?.DOMParser || globalThis.DOMParser);
    const index = Math.max(0, Math.min(opened.chapters.length - 1, Number(chapter) || 0)), part = await opened.chapter(index);
    return {title: row.title, chapter: index, chapters: opened.chapters.map(c => c.title), paragraphs: part.text.split(/\n\s*\n|\n/).filter(x => x.trim())};
  }
  async function create(form = {}) {
    if (busy) throw Error('故事正在写，请稍等');
    const role = roles().find(r => r.name === form.role);
    if (!role) throw Error('先在角色 App 为讲故事的人选好声音');
    busy = true; emit({busy: true});
    try {
      const s = structuredClone(settings()), sounds = soundNames(await backend.listSounds()), format = backend.voiceFormat(), rules = modelRules(s);
      const request = original => bedtimeRequest({settings: s, role, kind: form.kind, minutes: form.minutes, wish: String(form.wish || '').slice(0, 500), format, rules, sounds, original});
      let steps = [], title = '', position = {};
      const ask = async original => {
        const text = await backend.generateText(context(), {use: 'book', prompt: request(original), trimNames: false, responseLength: original ? 8192 : Number(form.minutes) === 15 ? 16000 : 8192});
        if (closed) throw Error('睡前故事已关闭');
        return {text, steps: parseBedtime(text, {format, role: role.name, sounds, original})};
      };
      if (form.sourceId) {
        const part = await source(form.sourceId, form.chapter), start = Math.max(0, Math.trunc(Number(form.paragraph) || 0));
        const paragraphs = part.paragraphs.slice(start);
        if (!paragraphs.length) throw Error('这个起点后面没有文字');
        // Annotate a bounded listening session paragraph by paragraph; every saved character is checked.
        let count = 0; const target = ([3, 8, 15].includes(Number(form.minutes)) ? Number(form.minutes) : 3) * 180;
        for (const original of paragraphs) { steps.push(...(await ask(original)).steps); count += original.length; if (count >= target) break; }
        title = part.title; position = {sourceId: form.sourceId, chapter: part.chapter, paragraph: start};
      } else {
        const got = await ask(''); steps = got.steps;
        title = got.text.match(/<title>([^<]+)<\/title>/)?.[1] || `${role.name}的睡前故事`;
      }
      const book = await backend.library.saveBook({id: 'b-' + crypto.randomUUID(), title, author: role.name, spreads: [], bedtime: {role: role.name, roleId: role.id, kind: form.kind, minutes: form.minutes, steps, ...position}});
      backend.emit('library', {collection: 'books'}); return book;
    } finally { busy = false; emit({busy: false}); }
  }
  async function play(id, {timer = 0, song = ''} = {}) {
    const book = await backend.library.getBook(id);
    if (!book?.bedtime?.steps.length) throw Error('这个故事没有可播放的台词');
    const role = narrator(book);
    if (!player.status().playing) voiceVolume = backend.player.sink.getVolume?.() ?? 1;
    player.stop();
    playbackRole = role;
    return player.play(book, timer, async alive => {
      if (closed || !alive()) return;
      sound = soundFactory({context, settings: lowSettings, backend, doc});
      const own = sound;
      await own.unlock(); await own.reload();
      if (!alive()) return;
      if (song) {
        const track = (await backend.listSongs()).find(s => s.id === song);
        if (track && alive()) { music = musicFactory({context, settings: lowSettings, backend, doc}); await music.play({...track, bg: true}); }
      }
    });
  }
  async function audio(id) {
    const book = await backend.library.getBook(id);
    if (!book?.bedtime?.steps.length) throw Error('这个故事没有可下载的台词');
    const role = narrator(book), s = {...settings(), routes: [role]}, clips = [];
    for (const step of book.bedtime.steps) {
      if (step.kind !== 'say') continue;
      const made = await backend.player.make({...step, role: role.name}, role, s, new AbortController().signal);
      if (!made?.blob) throw Error('故事声音未能完整导出，请重试');
      clips.push(made.blob);
    }
    return clips;
  }
  return {create, roles, source, play, audio, stop: player.stop, status: () => ({...player.status(), busy}), close() { closed = true; player.stop(); }};
}
