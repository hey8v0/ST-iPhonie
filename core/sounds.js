// 音效: ambience and sound effects written into the story, played from the sound library. The story model writes
// <ambience>雨夜</ambience> where a scene starts (it loops until the next one) and <sfx>敲门|轻</sfx> right after the
// sentence the sound happens in. The library holds the user's own files (我传的), ones ElevenLabs made (ElevenLabs) and
// the shipped pack (自带), all under the same names: one name can have several versions, played in turn.
// Pure: no DOM, audio or network (the tavern side plays them: host-sounds.js).

export const SOUND_KINDS = Object.freeze(['sfx', 'ambience']);
export const KIND_NAMES = Object.freeze({sfx: '音效', ambience: '氛围音'});
// An ambience is a 底子 (bed: loops all the time) and 点缀 (dot: now and then, at random, left or right).
export const SOUND_LAYERS = Object.freeze(['bed', 'dot']);
export const LAYER_NAMES = Object.freeze({bed: '底子', dot: '点缀'});
export const SOUND_SOURCES = Object.freeze({mine: '我传的', eleven: 'ElevenLabs', pack: '自带'});
export const STRENGTHS = Object.freeze(['', '轻', '重']);
export const SOUND_LIMITS = Object.freeze({file: 20 * 1024 * 1024, names: 150, versions: [1, 5]});

export function defaultSounds() {
  return {enabled: false, ambienceVolume: 0.45, sfxVolume: 0.8, vary: true, tapOnly: false, generate: false, versions: 2, pack: true, packHidden: []};
}
const unit = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback; };
export function normalizeSounds(value) {
  const base = defaultSounds();
  if (!value || typeof value !== 'object') return base;
  const versions = Math.round(Number(value.versions));
  return {
    enabled: value.enabled === true,
    ambienceVolume: unit(value.ambienceVolume, base.ambienceVolume),
    sfxVolume: unit(value.sfxVolume, base.sfxVolume),
    vary: value.vary !== false,
    // 音效只在点的时候放: sound effects wait for a tap on their ♪ (ambience still starts by itself).
    tapOnly: value.tapOnly === true,
    generate: value.generate === true,
    versions: Number.isFinite(versions) ? Math.min(SOUND_LIMITS.versions[1], Math.max(SOUND_LIMITS.versions[0], versions)) : base.versions,
    pack: value.pack !== false,
    packHidden: [...new Set((Array.isArray(value.packHidden) ? value.packHidden : []).map(String).filter(id => id.startsWith('pack:')))].slice(0, 2000)
  };
}

/** A sound's name as the model and the library write it: no spaces or brackets, at most 20 characters. */
export const soundName = value => String(value ?? '').replace(/[\s<>|｜"'`]+/g, '').slice(0, 20);

// ---------- The tags ----------
const TAG = /<(sfx|ambience)\b[^>]*>([^<>]{0,300}?)<\/\1\s*>/gi;
const SOFT = /^(?:轻|轻轻|轻声|小声|微弱|隐约|远处|远远|慢|缓)$/;
const HARD = /^(?:重|用力|猛|猛烈|急|急促|大声|剧烈|响|快)$/;
const STOP = /^(?:停|停止|无|静|安静|没有|关|stop|none|silence|off)$/i;
/** Reads one tag's text: 名字, then 轻 / 重 and an English description in any order. */
function fields(kind, inner) {
  const [first = '', ...rest] = String(inner).split(/[|｜]/).map(s => s.trim());
  let strength = '', describe = '';
  for (const part of rest) {
    if (SOFT.test(part)) strength = '轻';
    else if (HARD.test(part)) strength = '重';
    else if (/[a-z]/i.test(part) && !describe) describe = part.replace(/\s+/g, ' ').slice(0, 200);
  }
  const stop = kind === 'ambience' && STOP.test(first);
  return {name: stop ? '' : soundName(first), strength, describe: stop ? '' : describe, stop};
}
/** Every sound tag in a reply, in order: {kind, name, strength, describe, stop, start, end, index}. */
export function parseSounds(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(TAG)) {
    const kind = m[1].toLowerCase(), f = fields(kind, m[2]);
    if (!f.name && !f.stop) continue;
    out.push({kind, ...f, start: m.index, end: m.index + m[0].length, index: out.length});
  }
  return out;
}
/** The text without its sound tags (for the story model, the phone's apps, and the chat while 音效 is off). */
export const withoutSounds = text => String(text ?? '').replace(TAG, '');
/** The reply as shown: each tag becomes a small chip (a tap plays it again); while 音效 is off they are left out. */
export function renderSounds(text, marker, on = true) {
  const source = String(text ?? '');
  if (!on) return withoutSounds(source);
  const tags = parseSounds(source);
  if (!tags.length) return source.replace(TAG, '');
  let out = '', at = 0;
  for (const t of tags) {
    const label = t.stop ? '氛围音停' : t.name, said = (t.kind === 'ambience' ? '氛围音' : '音效') + '：' + label;
    out += source.slice(at, t.start).replace(TAG, '') + `<span class="sttts-sound" data-sttts-sound="${t.index}" data-sttts-token="${escape(marker)}"><button type="button" class="sttts-sound-chip" data-sttts-action="sound" data-sttts-kind="${t.kind}" title="${escape(said)}（点一下再听）" aria-label="${escape(said)}">${escape(label)}</button></span>`;
    at = t.end;
  }
  return out + source.slice(at).replace(TAG, '');
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// ---------- The library ----------
/** A library row as kept: {id, name, type: 'sfx'|'ambience', layer: 'bed'|'dot' (ambience), strength, source, describe, mime, size, seconds}. */
export function soundRow(value = {}) {
  const type = SOUND_KINDS.includes(value.type) ? value.type : 'sfx';
  return {
    name: soundName(value.name),
    type,
    layer: type === 'ambience' && value.layer === 'dot' ? 'dot' : type === 'ambience' ? 'bed' : '',
    strength: STRENGTHS.includes(value.strength) ? value.strength : '',
    source: Object.hasOwn(SOUND_SOURCES, value.source) ? value.source : 'mine',
    describe: String(value.describe ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
    seconds: Number.isFinite(Number(value.seconds)) && Number(value.seconds) > 0 ? Math.round(Number(value.seconds) * 10) / 10 : 0
  };
}
// Names are compared loosely: 敲门 finds 敲门声, 下雨 finds 下雨天 (two characters at least).
const loose = name => String(name ?? '').toLowerCase().replace(/[\s·・._\-（）()【】[\]]/g, '').replace(/声$/, '');
/** The rows for a name of one kind: the same name, else one that contains the other. */
export function findSounds(rows, name, kind) {
  const want = loose(name), same = (rows || []).filter(r => r.type === kind);
  if (!want) return [];
  const exact = same.filter(r => loose(r.name) === want);
  if (exact.length) return exact;
  const near = same.filter(r => { const n = loose(r.name); return Math.min(n.length, want.length) >= 2 && (n.includes(want) || want.includes(n)); });
  // Only one name may answer: the closest in length.
  if (!near.length) return [];
  const best = near.reduce((a, b) => Math.abs(loose(a.name).length - want.length) <= Math.abs(loose(b.name).length - want.length) ? a : b).name;
  return near.filter(r => r.name === best);
}
/** One version to play: of the strength asked for when there is one, never the one played last time (when there is a choice). */
export function pickSound(rows, {strength = '', last = '', random = Math.random} = {}) {
  let list = rows || [];
  if (strength && list.some(r => r.strength === strength)) list = list.filter(r => r.strength === strength);
  else if (list.some(r => !r.strength)) list = list.filter(r => !r.strength || r.strength === strength);
  if (list.length > 1) list = list.filter(r => r.id !== last);
  return list.length ? list[Math.min(list.length - 1, Math.floor(random() * list.length))] : null;
}
/** How one playing differs from the last: a little faster or slower (pitch with it) and louder or softer. */
export function variation({strength = '', vary = true, random = Math.random} = {}) {
  const rate = vary ? 1 + (random() - 0.5) * 0.1 : 1;
  let gain = vary ? 0.85 + random() * 0.15 : 1;
  if (strength === '轻') gain *= 0.55;
  return {rate: Math.round(rate * 1000) / 1000, gain: Math.round(gain * 1000) / 1000};
}
/** The names in the library, by kind (an ambience counts once, whatever its layers). */
export function soundNames(rows) {
  const out = {sfx: [], ambience: []};
  for (const r of rows || []) if (out[r.type] && r.name && !out[r.type].includes(r.name)) out[r.type].push(r.name);
  for (const kind of SOUND_KINDS) out[kind] = out[kind].sort((a, b) => a.localeCompare(b, 'zh')).slice(0, SOUND_LIMITS.names);
  return out;
}

// ---------- The rule for the story model ----------
/**
 * What the story model is told, or '' when there is nothing to play (no sounds and no way to make them): costs no
 * context then. now: the ambience playing, so a scene that goes on is not tagged again.
 */
export function soundRule({names = {sfx: [], ambience: []}, generate = false, now = ''} = {}) {
  const has = names.sfx.length || names.ambience.length;
  if (!has && !generate) return '';
  const list = kind => names[kind].length ? names[kind].join('、') : '（还没有）';
  return [
    '【音效】正文里可以加氛围音和音效的标签，插件会播放对应的声音，标签本身不显示：',
    '· 氛围音：场景开始或换场景时，在那段开头写 <ambience>名字</ambience>，会一直循环到下一个氛围音；场景安静下来写 <ambience>停</ambience>。场景没变就不要再写。',
    '· 音效：紧跟在发出声音的那句话后面写 <sfx>名字</sfx>，力度明显时写 <sfx>名字|轻</sfx> 或 <sfx>名字|重</sfx>。',
    '· 只给真正听得见、对气氛有用的声音配音效，一条回复一般 0～4 个，不要每句都加；不要写进台词标签里面。',
    has ? '· 名字从下面的列表里选：' : '',
    has ? `  氛围音：${list('ambience')}` : '',
    has ? `  音效：${list('sfx')}` : '',
    generate ? `· ${has ? '列表里没有合适的，也可以写新的' : '名字自己起'}：<sfx>名字|英文描述</sfx> 或 <ambience>名字|英文描述</ambience>，英文描述写清楚是什么声音（如 heavy wooden door knock, three times、gentle night rain on a window, distant thunder），插件会做出这个声音并记住；以后同一个名字就不用再写描述。` : '',
    now ? `· 现在的氛围音：${now}。` : ''
  ].filter(Boolean).join('\n');
}
/** The extension prompt for the story (same shape as the voice and picture rules: in the chat, as system). */
export function soundPromptPlan(text) {
  return text ? [{key: 'sttts.entry.sound', text, position: 1, depth: 0, role: 0}] : [];
}

// ---------- When each sound plays without voice: as fast as the reply is read ----------
const readable = text => String(text ?? '').replace(TAG, '').replace(/<tts\b[^>]*>[\s\S]*?<\/tts\s*>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
/**
 * Seconds from one sound to the next (the first from the reply's start): the characters read in between at
 * perSecond, at least `least` apart and at most `most`.
 */
export function readingGaps(text, tags, {perSecond = 14, least = 0.5, most = 9} = {}) {
  const source = String(text ?? '');
  let at = 0;
  return tags.map((t, i) => {
    const chars = readable(source.slice(at, t.start));
    at = t.end;
    const gap = chars / perSecond;
    return Math.round(Math.min(most, Math.max(i ? least : 0, gap)) * 100) / 100;
  });
}
/** The sounds of a reply that belong before a spoken line: those from `from` (an offset) up to the line's start. */
export function soundsBetween(tags, from, to) {
  return tags.filter(t => t.start >= from && t.start < to);
}
/** The last ambience asked for in these replies (newest last): its name, '' for 停, null when none says. */
export function latestAmbience(texts) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const tags = parseSounds(texts[i]).filter(t => t.kind === 'ambience');
    if (tags.length) { const t = tags.at(-1); return t.stop ? '' : t.name; }
  }
  return null;
}

// ---------- 缺的声音: names the model wrote that the library has none of ----------
export function missingKey(kind, name) { return 'missing:' + kind + ':' + soundName(name); }

// ---------- 自带音效包: sounds/pack.json in the plugin, played from the plugin's folder (never copied into the browser) ----------
/** The shipped pack's rows (no audio; url says where it is). Ids stay the same from one version to the next. */
export function packRows(pack, base) {
  if (!pack || pack.format !== 'st-iphonie-pack' || !Array.isArray(pack.sounds)) return [];
  const credits = pack.credits || {};
  return pack.sounds.filter(s => s && typeof s.file === 'string' && /^[\w.-]+\.mp3$/.test(s.file)).map(s => {
    const row = soundRow({...s, source: 'pack'}), c = credits[s.credit];
    return {...row, id: `pack:${s.file}#${row.name}#${row.layer}`, mime: 'audio/mpeg', size: Number(s.size) || 0, at: 0, url: new URL(s.file, base).href,
      credit: c ? `${String(c.title || '').slice(0, 60)} · ${String(c.user || '').slice(0, 40)}` : ''};
  });
}

// ---------- 音效包: a file of sounds to share ----------
export const PACK_FORMAT = 'st-iphonie-sounds';
/** A pack read from its JSON: its rows with the audio as base64, checked. */
export function readPack(value) {
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  if (!data || data.format !== PACK_FORMAT || !Array.isArray(data.sounds)) throw Error('这不是 ST-iPhonie 的音效包');
  const sounds = data.sounds.map(s => ({...soundRow(s), mime: /^audio\/[\w.+-]+$/.test(s?.mime) ? s.mime : 'audio/mpeg', data: typeof s?.data === 'string' ? s.data : ''}))
    .filter(s => s.name && s.data);
  if (!sounds.length) throw Error('音效包里没有能用的声音');
  return {name: String(data.name ?? '').slice(0, 60), sounds};
}
