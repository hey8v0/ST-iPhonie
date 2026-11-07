// 写歌, tavern side: the text model writes the words and the style of a song (it knows the people and the story); singing them is the
// backend's (core/backend-song.js). Nothing is written into the story. One request at a time; the phone shows it as busy.
import {buildSongRequest, parseSongReply, normalizeSongForm, SONG_LENGTHS} from './core/song.js';
import {storyLines} from './core/moments.js';
import {activeChatPreset, cleanTagged, messageLine} from './core/chat.js';
import {worldInfoFor, loreOptions} from './host-lore.js';

export function createSongHost({context, settings, backend, memory = null}) {
  let working = null;
  const userName = () => context()?.name1 || '我';
  const userPersona = () => String(context()?.powerUserSettings?.persona_description || '').slice(0, 1500);
  function card(name) {
    const c = context()?.characters?.find(ch => ch?.name === name);
    if (!c) return '';
    return [c.description, c.personality && '性格：' + c.personality].filter(Boolean).join('\n').replaceAll('{{char}}', name).replaceAll('{{user}}', userName()).slice(0, 1500);
  }
  function run(task) {
    if (working) return Promise.reject(Error('正在写另一首，等它写好了再来'));
    working = (async () => { backend.emit('music', {writing: true}); return task(context()); })().finally(() => { working = null; backend.emit('music', {writing: false}); });
    return working;
  }
  /** Whose song it is: someone in 联系人, by the name given. */
  function owner(name) {
    if (!name) return null;
    const contact = backend.contacts().find(c => c.name === name);
    return {name, persona: contact?.persona || '', card: contact?.persona ? '' : card(name)};
  }
  /** Asks the text model, from what the form says and what the story knows; {title, style, lyrics}. */
  async function compose(ctx, form, {before = null, wish = '', history = []} = {}) {
    const s = settings(), preset = activeChatPreset(s.chat), user = userName(), who = owner(form.who), useStory = form.story !== false;
    const story = useStory ? storyLines(ctx.chat, preset, user) : [];
    const remembered = who && memory ? await memory.aboutPeople([who.name]).catch(() => '') : '';
    const lore = !useStory || preset.lore === false ? '' : await worldInfoFor(context, {...loreOptions(preset), report: (...args) => backend.reportDiagnostic?.(...args), persona: userPersona(), characters: who ? who.persona || who.card : '',
      texts: story.map(r => `${r.name}: ${r.text}`), always: [form.about || '', who?.name || '']});
    const prompt = buildSongRequest({prompts: s.promptRules, form, owner: who, user, userPersona: userPersona(), story, lore, earlier: useStory ? memory?.storyMemory() || '' : '', memory: remembered, history, before, wish});
    const written = parseSongReply(cleanTagged(String(await backend.generateText(ctx, {prompt, trimNames: false, use: 'song'}) || ''), preset.cleanTags));
    if (!form.instrumental && !written.lyrics) throw Error('模型没有写歌词，可以再试一次');
    if (!written.title && !written.style) throw Error('模型没有写歌名和风格，可以再试一次');
    return written;
  }
  // A song with words is as long as they take to sing (core/song.js songLength): the length chosen only says how much to write.
  const seconds = form => form.instrumental === true ? SONG_LENGTHS[normalizeSongForm(form).length].seconds : 0;
  /** The words of a new song, as a new draft. The choices stay for next time. */
  function write(form) {
    return run(async ctx => {
      backend.saveMusic({writing: normalizeSongForm(form)});
      const written = await compose(ctx, form);
      return backend.saveSongDraft({...written, title: written.title || form.about?.slice(0, 20) || '', instrumental: form.instrumental === true, language: normalizeSongForm(form).language, who: form.who || '', about: form.about || '', seconds: seconds(form)});
    });
  }
  /** The words changed the way the user says; the draft stays the same one. */
  function rewrite(id, wish) {
    return run(async ctx => {
      const draft = await backend.getSongDraft(id);
      if (!draft) throw Error('这首歌已经不在了');
      const written = await compose(ctx, {...draft, story: !!draft.about || !!draft.who}, {before: draft, wish});
      return backend.saveSongDraft({id, title: written.title || draft.title, style: written.style || draft.style, lyrics: written.lyrics || draft.lyrics});
    });
  }
  /** A contact writes a song in a chat: a draft of theirs, and a song card from them. */
  function writeFor(threadId, form) {
    return run(async ctx => {
      const thread = await backend.chats.get(threadId), who = form.who || thread?.members?.[0], user = userName();
      if (!thread || !who) throw Error('这段聊天已经不在了');
      const history = thread.messages.filter(m => m.kind !== 'system').slice(-20).map(m => messageLine(m, user)).filter(Boolean);
      const asked = {...form, who};
      const written = await compose(ctx, asked, {history});
      const draft = await backend.saveSongDraft({...written, title: written.title || '写给你的歌', instrumental: false, language: normalizeSongForm(form).language, who, about: form.about || '', seconds: seconds(form)});
      await backend.appendChat(threadId, [{from: who, kind: 'song', song: {title: draft.title, artist: who, draft: draft.id}, text: '写了首歌给你'}], {read: false});
      return draft;
    });
  }
  return {write, rewrite, writeFor, busy: () => !!working};
}
