// Bedtime scripts share the story dialogue and sound parsers. No audio or DOM here.
import {parseDialogue, promptPlan, dialogueContract} from './protocol.js';
import {parseSounds} from './sounds.js';
import {promptText} from './prompt-rules.js';

export const BEDTIME_TYPES = ['睡前故事', '童话', '哄睡', '自己说想听什么'];
export function bedtimeRequest({settings, role, kind, minutes, wish = '', format, rules, sounds, original = ''}) {
  const voice = [...new Set([...promptPlan(settings, rules).map(p => p.text), dialogueContract(format), rules].filter(Boolean))].join('\n\n');
  const fill = {'讲述者': role.name, '人物设定': role.persona || '', '故事类型': BEDTIME_TYPES.includes(kind) ? kind : BEDTIME_TYPES[0],
    '分钟': String([3, 8, 15].includes(Number(minutes)) ? Number(minutes) : 3), '心愿': wish, '台词格式': format,
    '朗读规则': voice, '氛围音': sounds.ambience.join('、'), '音效': sounds.sfx.join('、'), '原文': original};
  return [{role: 'system', content: promptText(settings.promptRules, 'bedtime', 'system', fill)},
    {role: 'system', content: voice}, {role: 'user', content: promptText(settings.promptRules, 'bedtime', original ? 'annotate' : 'create', fill)}];
}
export function parseBedtime(text, {format, role, sounds, original = ''}) {
  const lines = parseDialogue(text, format).filter(l => l.role === role && l.text.trim());
  if (!lines.length) throw Error('没有读出讲述者的台词，请按配音格式重新生成');
  if (original && (lines.length !== 1 || lines[0].text !== original.trim())) throw Error('模型改动了书中原文，本段未保存，请重试');
  const cues = parseSounds(text).filter(c => c.stop || sounds[c.kind]?.includes(c.name));
  return [...lines.map(l => ({kind: 'say', role, text: original || l.text, translation: original || l.translation, emotion: l.emotion || 'calm', at: l.start})),
    ...cues.map(c => ({kind: c.kind, name: c.name, stop: c.stop, strength: '轻', at: c.start}))]
    .sort((a, b) => a.at - b.at).map(({at, ...step}) => step);
}
export function cleanBedtime(value) {
  if (!value || !Array.isArray(value.steps)) return null;
  const role = String(value.role || '').slice(0, 100);
  const steps = value.steps.slice(0, 2000).filter(s => ['say', 'ambience', 'sfx'].includes(s.kind)).map(s => s.kind === 'say'
    ? {kind: 'say', role, text: String(s.text || '').slice(0, 16000), translation: String(s.translation || '').slice(0, 16000), emotion: String(s.emotion || 'calm').slice(0, 100)}
    : {kind: s.kind, name: String(s.name || '').slice(0, 40), stop: !!s.stop, strength: '轻'});
  return {role, kind: BEDTIME_TYPES.includes(value.kind) ? value.kind : BEDTIME_TYPES[0], minutes: [3, 8, 15].includes(Number(value.minutes)) ? Number(value.minutes) : 3,
    sourceId: String(value.sourceId || '').slice(0, 100), chapter: Number(value.chapter) || 0, paragraph: Number(value.paragraph) || 0, steps};
}

/** A host-owned queue: leaving a phone view never cancels playback. Timers are injectable. */
export function createBedtimePlayer({read, cue, stopAudio, gain, onChange = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now}) {
  let epoch = 0, timer = null, fadeTimer = null, status = {playing: false, index: -1, text: '', id: ''};
  const emit = patch => { status = {...status, ...patch}; onChange({...status}); };
  function stop() {
    epoch++; clearTimer(timer); clearTimer(fadeTimer); timer = fadeTimer = null;
    stopAudio(); gain(1); emit({playing: false});
  }
  function fade(ticket) {
    if (ticket !== epoch) return;
    const start = now();
    const tick = () => {
      if (ticket !== epoch) return;
      const left = Math.max(0, 1 - (now() - start) / 5000);
      gain(left);
      if (!left) stop(); else fadeTimer = setTimer(tick, 100);
    };
    tick();
  }
  async function play(book, minutes = 0, prepare = async () => {}) {
    stop(); const ticket = epoch;
    emit({playing: true, id: book.id, index: -1, text: ''});
    if ([15, 30, 60].includes(Number(minutes))) timer = setTimer(() => fade(ticket), Number(minutes) * 60000);
    try {
      await prepare(() => ticket === epoch);
      for (const [index, step] of book.bedtime.steps.entries()) {
        if (ticket !== epoch) return;
        emit({index, ...(step.kind === 'say' ? {text: step.translation || step.text} : {})});
        if (step.kind === 'say') await read(step); else await cue(step);
      }
      if (ticket === epoch) { clearTimer(timer); fade(ticket); }
    } catch (e) { if (ticket === epoch) stop(); throw e; }
  }
  return {play, stop, status: () => ({...status})};
}
