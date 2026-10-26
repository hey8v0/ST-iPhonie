import { buildRequest } from './providers.js';
import { TTSParameters } from './parameters.js';
import { findRoute } from './routes.js';
import { requestHash } from './cache.js';
import { effectChain, lineEffect } from './voice-fx.js';
import { audioKind, unpacked, mp3FromFrame, undecodable } from './audio-bytes.js';
import { mouthShape } from './model-files.js';
export { audioKind, mp3FromFrame } from './audio-bytes.js';

const stopped = () => new DOMException('已停止', 'AbortError');

const copyLine = line => line ? { role: '', text: '', translation: '', emotion: '', ...structuredClone(line) } : null;
function volumeValue(value) {
 const volume = Number(value);
 if (!Number.isFinite(volume)) throw new TypeError('音量必须是有效数字');
 return Math.min(1, Math.max(0, volume));
}

export class BrowserAudio {
 constructor() {
  this.context = null;
  this.analyser = null;
  this.gain = null;
  this.source = null;
  this.finish = null;
  this.volume = 1;
  this.playEpoch = 0;
  this.pausedByUser = false;
  this.decoded = new Map();
  this.decodeBytes = 0;
 }
 unlock() {
  this.pausedByUser=false;
  this.context ??= new AudioContext();
  if (!this.analyser) {
   this.gain = this.context.createGain();
   this.gain.gain.value = this.volume;
   this.analyser = this.context.createAnalyser();
   this.analyser.fftSize = 128;
   this.analyser.smoothingTimeConstant = .72;
   // A finer one for the 视觉小说 models' lips (the vowels need more than the wave's five bars).
   this.lips = this.context.createAnalyser();
   this.lips.fftSize = 1024;
   this.lips.smoothingTimeConstant = .45;
   this.gain.connect(this.lips);
   this.lips.connect(this.analyser);
   this.analyser.connect(this.context.destination);
  }
  return this.context.resume();
 }
 /** Decode ahead without resuming the audio device or playing any sound. Bounded PCM cache. */
 async warm(blob) {
  this.context ??= new AudioContext();
  const ctx = this.context;
  let entry = this.decoded.get(blob);
  if (entry) return entry.job;
  entry = {bytes: 0, job: null};
  // decodeAudioData takes the bytes away, so each try gets its own copy; a refused MP3 is tried again from its first whole frame.
  entry.job = blob.arrayBuffer().then(async raw => {
   let bytes = new Uint8Array(raw);
   bytes = await unpacked(bytes) || bytes;
   try { return await ctx.decodeAudioData(bytes.slice().buffer); }
   catch (error) {
    const cut = audioKind(bytes) === 'mp3' ? mp3FromFrame(bytes) : null;
    if (cut) try { return await ctx.decodeAudioData(cut.slice().buffer); } catch { /* said below */ }
    throw Object.assign(Error(undecodable(bytes)), {code: 'UNDECODABLE', cause: error});
   }
  }).then(buffer => {
   if (ctx !== this.context || this.decoded.get(blob) !== entry) return buffer;
   entry.bytes = (buffer.length || 0) * (buffer.numberOfChannels || 1) * 4;
   this.decodeBytes += entry.bytes;
   while (this.decodeBytes > 32 * 1024 * 1024 || this.decoded.size > 24) {
    const [old, row] = this.decoded.entries().next().value;
    this.decoded.delete(old); this.decodeBytes -= row.bytes;
   }
   return buffer;
  }).catch(error => { if (this.decoded.get(blob) === entry) this.decoded.delete(blob); throw error; });
  this.decoded.set(blob, entry);
  return entry.job;
 }
 setVolume(value) {
  this.volume = volumeValue(value);
  if (this.gain) {
   const parameter = this.gain.gain;
   if (parameter.setTargetAtTime) parameter.setTargetAtTime(this.volume, this.context.currentTime, .015);
   else parameter.value = this.volume;
  }
  return this.volume;
 }
 getVolume() { return this.volume; }
 /** effect: 'phone' | 'inner' | '' (core/voice-fx.js), put between the line and the volume. */
 async play(blob, signal = new AbortController().signal, { effect = '' } = {}) {
  signal.throwIfAborted();
  const ctx = this.context;
  if (!ctx || ctx.state !== 'running') throw Error('请再点一次播放，允许浏览器开启声音');
  this.stop();
  const epoch = this.playEpoch;
  const check = () => {
   signal.throwIfAborted();
   if (epoch !== this.playEpoch || ctx !== this.context) throw stopped();
  };
  let buffer;
  try {
   buffer = await this.warm(blob);
  } catch (error) {
   check();
   throw error?.code === 'UNDECODABLE' ? error : Error('浏览器无法播放此音频格式，请在引擎配置改选 MP3 或 WAV');
  }
  check();
  if(ctx.state!=='running'&&!this.pausedByUser){let timer;try{await Promise.race([ctx.resume(),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);}catch{}finally{clearTimeout(timer);}check();if(ctx.state!=='running')throw Error('音频设备已暂停或被系统打断，请回到页面再点一次播放');}
  return new Promise((resolve, reject) => {
   const source = ctx.createBufferSource(), fx = effectChain(ctx, effect, this.gain);
   let settled = false;
   const finish = error => {
    if (settled) return;
    settled = true;
    signal.removeEventListener('abort', abort);
    source.onended = null;
    try { source.disconnect(); } catch {}
    // An echo rings on a little after the line; stopped, it stops with it.
    if (fx) { if (error) fx.dispose(); else setTimeout(() => fx.dispose(), fx.tail * 1000 + 200); }
    if (this.source === source) this.source = null;
    if (this.finish === finish) this.finish = null;
    if (error) reject(error); else resolve();
   };
   const abort = () => {
    source.onended = null;
    try { source.stop(); } catch {}
    finish(stopped());
   };
   try {
    source.buffer = buffer;
    source.connect(fx ? fx.input : this.gain);
    this.source = source;
    this.finish = finish;
    source.onended = () => finish();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else source.start();
   } catch (error) { finish(error); }
  });
 }
 levels() {
  if (!this.analyser) return [];
  const data = new Uint8Array(this.analyser.frequencyBinCount);
  this.analyser.getByteFrequencyData(data);
  return [0, 1, 2, 3, 4].map(i => {
   let sum = 0;
   for (let j = 0; j < 6; j++) sum += data[i * 6 + j];
   return Math.min(1, Math.pow(sum / (6 * 255), .65));
  });
 }
 /** The mouth for the sound playing now (core/model-files.js mouthShape), null before anything played. */
 mouth() {
  if (!this.lips) return null;
  const data = new Uint8Array(this.lips.frequencyBinCount);
  this.lips.getByteFrequencyData(data);
  const shape = mouthShape(data, this.context.sampleRate / this.lips.fftSize, this.lipPeak ?? .6);
  // The loudest of late, falling back slowly: the next lines open as wide whether the voice is quiet or loud.
  this.lipPeak = Math.max(.3, shape.loud, (this.lipPeak ?? .6) * .997);
  return shape;
 }
 pause() { this.pausedByUser=true;return this.context?.suspend(); }
 resume() { this.pausedByUser=false;return this.context?.resume(); }
 stop() {
  this.playEpoch++;
  if (this.source) {
   this.source.onended = null;
   try { this.source.stop(); } catch {}
  }
  this.finish?.(stopped());
 }
 close() {
  this.stop();
  const context = this.context;
  this.gain?.disconnect();
  this.analyser?.disconnect();
  this.context = this.analyser = this.gain = null;
  this.decoded.clear(); this.decodeBytes = 0;
  return context?.close();
 }
}

export class DialoguePlayer {
 /** speech: the browser's voice for a 旁白 read with 系统朗读 (core/narration.js browserSpeech), or null. */
 constructor({ settings, providers, cache, sink = new BrowserAudio(), change = () => {}, unknown = () => {}, prepared = () => {}, speech = null }) {
  Object.assign(this, { settings, providers, cache, sink, change, unknown, prepared, speech });
  this.epoch = 0;
  this.phase = 'idle';
  this.message = '';
  this.queue = [];
  this.index = 0;
  this.pending = null;
  this.skipped = [];
  this.controller = null;
  this.valid = () => true;
  this.played = new Set();
  // Lines being made now, by request key: playing a line that 提前生成 is still making waits for it, not pays twice.
  this.making = new Map();
  this.readyAudio = new Map();
  this.readyBytes = 0;
  this.volume = volumeValue(sink.getVolume?.() ?? 1);
  this.clearMetadata();
 }
 clearMetadata() {
  this.engine = '';
  this.speaker = '';
  this.line = null;
  this.source = 'dialogue';
  this.requestKey = null;
 }
 snapshot() {
  return { phase: this.phase, message: this.message, stepwise: !!this.stepwise, boundary: !!this.boundary, index: this.index, total: this.queue.length,
   engine: this.engine, speaker: this.speaker, line: copyLine(this.line), source: this.source,
   requestKey: this.requestKey, volume: this.getVolume() };
 }
 setVolume(value) {
  this.volume = volumeValue(value);
  this.sink.setVolume?.(this.volume);
  this.change(this.snapshot());
  return this.volume;
 }
 getVolume() { return this.volume; }
 /** The cache key a line's audio has with its speaker's current voice settings, or null without a speaker. */
 async lineKey(line) {
  const s = this.settings(), route = findRoute(s.routes, line.role);
  if (!route) return null;
  return requestHash(buildRequest(route.engine, s.connections[route.engine], { ...route, language: route.language || s.general.defaultLanguage }, line, this.providers.references));
 }
 async lineState(line) {
  try {
   const s = this.settings(), key = await this.lineKey(line);
   if (!key) return 'ungenerated';
   if (this.played.has(key)) return 'played';
   return s.general.cacheEnabled && await this.cache.has(key) ? 'ready' : 'ungenerated';
  } catch { return 'ungenerated'; }
 }
 emit(phase, message) {
  this.phase = phase;
  this.message = message;
  this.change(this.snapshot());
 }
 stop(message = '已停止') {
  this.epoch++;
  this.ahead = null;
  this.controller?.abort();
  this.controller = null;
  this.sink.stop();
  this.speech?.stop();
  this.queue = [];
  this.index = 0;
  this.pending = null;
  this.settingsOverride = null;
  this.resumePhase = null;
  this.stepwise = false; this.boundary = false;
  this.skipped = [];
  this.wake?.();
  this.wake = null;
  this.clearMetadata();
  this.emit('idle', message);
 }
 /** ahead: while a line plays, the next one is already being made (a call: no pause between its sentences). */
 start(lines, valid = () => true, settingsOverride = null, {ahead = false, stepwise = false} = {}) {
  this.stop();
  this.settingsOverride = settingsOverride;
  this.lookahead = ahead;
  this.stepwise = stepwise;
  if (!lines.length) return;
  this.valid = valid;
  this.queue = lines.map(copyLine);
  this.controller = new AbortController();
  this.line = this.queue[0];
  this.speaker = this.line.role || '';
  this.emit('generating', '准备播放');
  return this.unlockAndRun();
 }
 current(epoch) { return epoch === this.epoch && !this.controller?.signal.aborted; }
 canContinue(epoch) {
  if (!this.current(epoch)) return false;
  if (this.valid()) return true;
  this.stop('消息已变化，请重新播放');
  return false;
 }
 async waitForResume(epoch) {
  if (!this.canContinue(epoch)) return false;
  if (this.phase === 'paused') await new Promise(resolve => { this.wake = resolve; });
  return this.canContinue(epoch);
 }
 /** A line's audio: from the cache, or made and kept. found(fromCache, key) is told before any making starts. */
 async make(line, route, s, signal, found = () => {}, still = () => !signal.aborted) {
  const effective = { ...structuredClone(route), language: route.language || s.general.defaultLanguage, model: route.model || s.connections[route.engine].model };
  let request = buildRequest(route.engine, s.connections[route.engine], effective, line, this.providers.references);
  const key = await requestHash(request);
  if (!still()) return null;
  const cacheEpoch = this.cache.epoch;
  if (this.readyEpoch !== cacheEpoch || !s.general.cacheEnabled) { this.readyAudio.clear(); this.readyBytes = 0; this.readyEpoch = cacheEpoch; }
  let blob = s.general.cacheEnabled ? this.readyAudio.get(key) || await this.cache.get(key) : null;
  if (!still()) return null;
  const fromCache = !!blob;
  found(fromCache, key);
  if (!blob) {
   // Someone else making the same line (提前生成, or the line ahead): its sound, unless that was given up.
   // A request given up (stopped, the reply changed) is not waited for: it may never answer.
   const shared = this.making.get(key);
   if (shared && !shared.signal?.aborted) blob = await Promise.race([shared.job, new Promise(resolve => { shared.signal?.addEventListener('abort', () => resolve(null), { once: true }); signal?.addEventListener('abort', () => resolve(null), { once: true }); })]).catch(() => null);
   if (!still()) return null;
   if (!blob) {
    const job = (async () => {
     // Cached audio never waits for a network catalog refresh.
     if (route.engine === 'fish' && TTSParameters.fishNative({ ...s.connections.fish, model: effective.model })) {
      await this.providers.fishCatalog?.();
      if (!still()) return null;
      request = buildRequest(route.engine, s.connections[route.engine], effective, line, this.providers.references);
     }
     return this.providers.synthesize(request, signal);
    })(), entry = { job, signal };
    this.making.set(key, entry);
    const done = () => { if (this.making.get(key) === entry) this.making.delete(key); };
    job.catch(() => {}).finally(done);
    signal?.addEventListener('abort', done, { once: true });
    blob = await job;
   }
   if (!still()) return null;
   if (this.settings().general.cacheEnabled) await this.cache.put(key, blob, cacheEpoch, {
    line: copyLine(line), route: { name: effective.name, engine: effective.engine, model: effective.model, voice: effective.voice }, requestKey: key
   });
  }
  if (s.general.cacheEnabled && this.cache.epoch === cacheEpoch && !this.readyAudio.has(key) && blob.size <= 16 * 1024 * 1024) {
   this.readyAudio.set(key, blob); this.readyBytes += blob.size;
   while (this.readyBytes > 16 * 1024 * 1024 || this.readyAudio.size > 24) { const [old, value] = this.readyAudio.entries().next().value; this.readyAudio.delete(old); this.readyBytes -= value.size; }
  }
  return { key, blob, fromCache, effective, request };
 }
 /**
  * 提前生成: makes these lines one after another and keeps them in the cache, plays nothing. Lines nobody has a voice
  * for are left out. Stops when `signal` is aborted or valid() turns false; a failure ends it (thrown). Returns how
  * many were made (not counting ones already in the cache).
  */
 async prepare(lines, { valid = () => true, signal, each = () => {} } = {}) {
  let made = 0;
  for (const line of lines) {
   const s = this.settings();
   if (signal?.aborted || !valid() || !s.general.cacheEnabled) break;
   if (line.narration) continue;
   const route = findRoute(s.routes, line.role);
   if (!route?.voice?.trim() && !(route?.engine === 'fish' && s.connections.fish.params.references.length) && !(route?.engine === 'mini' && s.connections.mini.params.timbre_weights.length)) continue;
   const done = await this.make(line, route, s, signal || new AbortController().signal, () => {}, () => !signal?.aborted && valid());
   if (!done) break;
   try { await this.sink.warm?.(done.blob); } catch { /* Playback reports unsupported audio when requested. */ }
   if (signal?.aborted || !valid()) break;
   if (!done.fromCache) { made++; each(line); }
  }
  return made;
 }
 /** Starts making the line at `index` now (one ahead of the one about to play); null when there is nothing to make. */
 makeAhead(index, signal) {
  const line = this.queue[index], s = this.settingsOverride || this.settings();
  if (line?.narration && s.narration?.voice !== 'role') return null;
  const route = line && findRoute(s.routes, line.role);
  if (!route?.voice?.trim() && !(route?.engine === 'fish' && s.connections.fish.params.references.length) && !(route?.engine === 'mini' && s.connections.mini.params.timbre_weights.length)) return null;
  const made = this.make(line, route, s, signal, () => {}, () => !signal.aborted && this.valid());
  made.catch(() => {});
  made.then(value => value && this.sink.warm?.(value.blob)).catch(() => {});
  return { index, made };
 }
 async finishedLine(epoch) {
  if (!this.canContinue(epoch)) return false;
  if (this.stepwise && this.index + 1 < this.queue.length) {
   this.boundary = true; this.resumePhase = 'generating';
   this.emit('paused', '等待下一句');
   if (!await this.waitForResume(epoch)) return false;
   this.boundary = false;
  }
  this.index++; return true;
 }
 async run(epoch) {
  const signal = this.controller.signal;
  try {
   while (this.index < this.queue.length) {
    if (!this.canContinue(epoch)) return;
    const s = this.settingsOverride || this.settings(), line = this.queue[this.index];
    // 旁白 with 系统朗读: the browser says it, nothing is made or kept. Without one, the story goes on to the next line.
    if (line.narration && s.narration?.voice !== 'role') {
     this.line = line; this.speaker = line.role; this.engine = 'system'; this.requestKey = null; this.pending = null;
     if (!this.speech) { if (!this.skipped.includes('旁白（这个浏览器不能系统朗读）')) this.skipped.push('旁白（这个浏览器不能系统朗读）'); this.index++; continue; }
     if (!await this.waitForResume(epoch)) return;
     this.emit('playing', '正在朗读 · ' + line.role);
     await this.speech.speak(line.text, { voice: s.narration.systemVoice, rate: s.narration.rate, volume: this.volume }, signal);
     if (!this.canContinue(epoch)) return;
     if (!await this.finishedLine(epoch)) return;
     continue;
    }
    const route = findRoute(s.routes, line.role);
    this.line = line;
    this.speaker = line.role;
    this.engine = route?.engine || '';
    this.requestKey = null;
    if (!route?.voice?.trim() && !(route?.engine === 'fish' && s.connections.fish.params.references.length) && !(route?.engine === 'mini' && s.connections.mini.params.timbre_weights.length)) {
     // Playing a whole reply goes on past speakers without a voice, so a story with more people than voices still plays
     // through; a single line stops and asks for a voice.
     if (this.queue.length > 1) {
      if (line.role && !this.skipped.includes(line.role)) this.skipped.push(line.role);
      this.index++;
      continue;
     }
     this.pending = line.role;
     this.emit('waiting', '等待为 ' + line.role + ' 选择音色');
     this.unknown(line.role);
     return;
    }
    this.pending = null;
    // Made while the line before played (ahead): ready now. A failed one is tried again here, where its error shows.
    const early = this.ahead?.index === this.index ? await this.ahead.made.catch(() => null) : null;
    this.ahead = null;
    if (!this.canContinue(epoch)) return;
    const made = early || await this.make(line, route, s, signal, (fromCache, key) => {
     if (!this.canContinue(epoch)) return;
     this.requestKey = key;
     this.emit(this.phase === 'paused' ? 'paused' : 'generating', (fromCache ? '读取缓存 · ' : '正在生成 · ') + line.role);
    }, () => this.canContinue(epoch));
    if (!made || !this.canContinue(epoch)) return;
    const { key, blob, fromCache, effective, request } = made;
    this.requestKey = key;
    await this.prepared({ key, blob, line: copyLine(line), route: structuredClone(effective), request: structuredClone(request), fromCache });
    if (this.lookahead) this.ahead = this.makeAhead(this.index + 1, signal);
    if (!await this.waitForResume(epoch)) return;
    this.emit('playing', '正在播放 · ' + line.role + (fromCache ? ' · 缓存' : ''));
    await this.sink.play(blob, signal, { effect: lineEffect(line) });
    if (!this.canContinue(epoch)) return;
    this.played.add(key);
    if (!await this.finishedLine(epoch)) return;
   }
   this.complete();
  } catch (error) { this.fail(epoch, signal, error); }
 }
 complete() {
  const skipped = this.skipped || [];
  this.queue = [];
  this.index = 0;
  this.pending = null;
  this.skipped = [];
  this.emit('idle', skipped.length ? `播放完成 · 跳过了还没选音色的${skipped.join('、')}` : '播放完成');
 }
 fail(epoch, signal, error) {
  if (!this.current(epoch) || signal.aborted) return;
  this.queue = [];
  this.index = 0;
  this.pending = null;
  this.emit('error', error.message || '播放失败，请手动重试');
 }
 async playBlob(blob, metadata = {}) {
  this.stop();
  if (!(blob instanceof Blob) || !blob.size) throw Error('没有可播放的音频');
  const line = copyLine(metadata.line || { role: metadata.role || metadata.speaker || '', text: metadata.text || '', translation: metadata.translation || '', emotion: metadata.emotion || '' });
  this.valid = () => true;
  this.queue = [line];
  this.line = line;
  this.speaker = metadata.speaker || line.role || '';
  this.engine = metadata.engine || metadata.route?.engine || '';
  this.source = 'favorite';
  this.requestKey = metadata.requestKey || metadata.key || null;
  this.controller = new AbortController();
  const epoch = this.epoch, signal = this.controller.signal;
  this.emit('generating', '准备播放收藏');
  try {
   await this.sink.unlock();
   if (!this.canContinue(epoch) || !await this.waitForResume(epoch)) return;
   this.emit('playing', '正在播放 · ' + (this.speaker || '收藏音频'));
   await this.sink.play(blob, signal, { effect: lineEffect(line) });
   if (!this.canContinue(epoch)) return;
   if (this.requestKey) this.played.add(this.requestKey);
   this.complete();
  } catch (error) { this.fail(epoch, signal, error); }
 }
 toggle() {
  if (['playing', 'generating'].includes(this.phase)) {
   this.resumePhase = this.phase;
   const epoch = this.epoch;
   this.speech?.pause();
   Promise.resolve(this.sink.pause()).catch(error => { if (this.current(epoch)) this.emit('error', error.message || '暂停失败'); });
   this.emit('paused', '已暂停');
  } else if (this.phase === 'paused') {
   const epoch = this.epoch;
   return Promise.resolve(this.sink.resume()).then(() => {
    if (!this.current(epoch) || this.phase !== 'paused') return;
    this.speech?.resume();
    this.emit(this.resumePhase === 'generating' ? 'generating' : 'playing', this.resumePhase === 'generating' ? '继续生成' : '继续播放');
    this.wake?.();
    this.wake = null;
   }).catch(error => { if (this.current(epoch)) this.emit('error', error.message || '请再次点击以开启声音'); });
  }
 }
 async unlockAndRun() {
  const epoch = this.epoch;
  try {
   await this.sink.unlock();
   if (this.current(epoch)) await this.run(epoch);
  } catch (error) { if (this.current(epoch)) this.emit('error', error.message || '请再次点击以开启声音'); }
 }
 continuePending() {
  if (this.phase !== 'waiting') return;
  this.emit('generating', '准备继续播放');
  return this.unlockAndRun();
 }
 close() { this.stop(); this.readyAudio.clear(); this.readyBytes = 0; return this.sink.close?.(); }
}
