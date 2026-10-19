// 豆包语音 (Volcano Engine's speech service): the request for one line, and its answer — JSON frames, one after
// another, each with a piece of base64 audio, the last one saying it is done.
import {proxyAddress} from './proxy-url.js';

export const DOUBAO_VOICES = [{id: 'zh_female_vv_uranus_bigtts', name: 'Vivi · 合成 2.0'}];

/** A line's 情绪 as a 语音指令: written out already (「用……的语气说」), or a word or two made into one. */
export function instruction(emotion) {
  const e = String(emotion || '').trim().replace(/[。.]+$/, '');
  if (!e) return '';
  return e.length <= 6 && !/[说讲念唱喊]|语气|语调|声音|地$/.test(e) ? `用${e}的语气说` : e;
}
/** c: the 豆包 engine's connection; route: the role (its voice is the speaker id); line: {text, emotion}. */
export function buildDoubaoRequest(c, route, line) {
  const p = c.params, url = String(p.url || '').trim();
  if (!proxyAddress(url) && !/^https?:\/\/[^\s/]+/i.test(url)) throw Error('请填写豆包语音接口地址');
  if (!route.voice?.trim()) throw Error('请先填写豆包音色 ID');
  const additions = {};
  if (p.pitch) additions.post_process = {pitch: p.pitch};
  // 语音指令: the user's own words and the line's 情绪, for the models that take them (2.0, and 复刻 2.0 表现力版).
  const context = [String(p.context || '').trim(), instruction(line.emotion)].filter(Boolean).join('；');
  const instructed = c.model === 'seed-tts-2.0' || (c.model === 'seed-icl-2.0' && p.cloneModel === 'seed-tts-2.0-expressive');
  if (context && instructed) additions.context_texts = [context];
  const params = {text: line.text, speaker: route.voice.trim(), audio_params: {format: p.format, sample_rate: p.sample_rate, speech_rate: p.speech_rate, loudness_rate: p.loudness_rate}};
  if (c.model === 'seed-icl-2.0') params.model = p.cloneModel;
  if (Object.keys(additions).length) params.additions = JSON.stringify(additions);
  return {engine: 'doubao', url, body: {user: {uid: 'st-iphonie'}, req_params: params}, resourceId: c.model, appId: String(p.appId || '').trim(), format: p.format, sampleRate: p.sample_rate, channels: 1};
}

const DONE = 20000000, MAX_BYTES = 64 * 1024 * 1024;
/** The audio in an answer: its frames read one by one (a frame may arrive split across network chunks). */
export function doubaoAudio(bytes) {
  const raw = new TextDecoder().decode(bytes), chunks = [];
  let start = -1, depth = 0, quoted = false, escaped = false, finished = false, total = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (start < 0) {
      if (/\s/.test(c)) continue;
      if (c !== '{') throw Error('豆包语音返回的不是 JSON 音频流');
      if (finished) throw Error('豆包语音结束后仍返回数据');
      start = i; depth = 1;
      continue;
    }
    // Braces inside strings do not count.
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; continue; }
    if (c === '{') { depth++; continue; }
    if (c !== '}' || --depth !== 0) continue;
    let frame;
    try { frame = JSON.parse(raw.slice(start, i + 1)); } catch { throw Error('豆包语音返回了无效 JSON'); }
    start = -1;
    if (![0, DONE].includes(frame.code)) throw Object.assign(Error('豆包语音：' + (frame.code ?? '未知错误') + ' · ' + String(frame.message || '合成失败').slice(0, 180)), {code: frame.code});
    if (frame.data) {
      if (typeof frame.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(frame.data)) throw Error('豆包语音返回了无效音频数据');
      let text;
      try { text = atob(frame.data); } catch { throw Error('豆包语音返回了无效音频数据'); }
      const part = Uint8Array.from(text, ch => ch.charCodeAt(0));
      total += part.length;
      if (total > MAX_BYTES) throw Error('单段豆包语音过大');
      chunks.push(part);
    }
    if (frame.code === DONE) finished = true;
  }
  if (start >= 0 || !finished) throw Error('豆包语音传输中断，没有收到完成标记');
  if (!total) throw Error('豆包语音没有返回声音');
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of chunks) { out.set(part, at); at += part.length; }
  return out;
}
