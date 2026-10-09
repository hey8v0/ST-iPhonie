import { buildRequest } from './providers.js';
import { requestHash } from './cache.js';
import { effectChain, lineEffect } from './voice-fx.js';

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
 }
 unlock() {
  this.context ??= new AudioContext();
  if (!this.analyser) {
   this.gain = this.context.createGain();
   this.gain.gain.value = this.volume;
   this.analyser = this.context.createAnalyser();
   this.analyser.fftSize = 128;
   this.analyser.smoothingTimeConstant = .72;
   this.gain.connect(this.analyser);
   this.analyser.connect(this.context.destination);
  }
  return this.context.resume();
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
   const bytes = await blob.arrayBuffer();
   check();
   buffer = await ctx.decodeAudioData(bytes);
  } catch (error) {
   check();
   throw Error('浏览器无法播放此音频格式，请在引擎配置改选 MP3 或 WAV');
  }
  check();
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
 pause() { return this.context?.suspend(); }
 resume() { return this.context?.resume(); }
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
  return context?.close();
 }
}

export class DialoguePlayer {
 constructor({ settings, providers, cache, sink = new BrowserAudio(), change = () => {}, unknown = () => {}, prepared = () => {} }) {
  Object.assign(this, { settings, providers, cache, sink, change, unknown, prepared });
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
  return { phase: this.phase, message: this.message, index: this.index, total: this.queue.length,
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
  const s = this.settings(), route = s.routes.find(r => r.name === line.role);
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
  this.queue = [];
  this.index = 0;
  this.pending = null;
  this.settingsOverride = null;
  this.resumePhase = null;
  this.skipped = [];
  this.wake?.();
  this.wake = null;
  this.clearMetadata();
  this.emit('idle', message);
 }
 /** ahead: while a line plays, the next one is already being made (a call: no pause between its sentences). */
 start(lines, valid = () => true, settingsOverride = null, {ahead = false} = {}) {
  this.stop();
  this.settingsOverride = settingsOverride;
  this.lookahead = ahead;
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
  const request = buildRequest(route.engine, s.connections[route.engine], effective, line, this.providers.references);
  const key = await requestHash(request);
  if (!still()) return null;
  const cacheEpoch = this.cache.epoch;
  let blob = s.general.cacheEnabled ? await this.cache.get(key) : null;
  if (!still()) return null;
  const fromCache = !!blob;
  found(fromCache, key);
  if (!blob) {
   blob = await this.providers.synthesize(request, signal);
   if (!still()) return null;
   if (this.settings().general.cacheEnabled) await this.cache.put(key, blob, cacheEpoch, {
    line: copyLine(line), route: { name: effective.name, engine: effective.engine, model: effective.model, voice: effective.voice }, requestKey: key
   });
  }
  return { key, blob, fromCache, effective, request };
 }
 /** Starts making the line at `index` now (one ahead of the one about to play); null when there is nothing to make. */
 makeAhead(index, signal) {
  const line = this.queue[index], s = this.settingsOverride || this.settings(), route = line && s.routes.find(r => r.name === line.role);
  if (!route?.voice?.trim() && !(route?.engine === 'fish' && s.connections.fish.params.references.length) && !(route?.engine === 'mini' && s.connections.mini.params.timbre_weights.length)) return null;
  const made = this.make(line, route, s, signal, () => {}, () => !signal.aborted && this.valid());
  made.catch(() => {});
  return { index, made };
 }
 async run(epoch) {
  const signal = this.controller.signal;
  try {
   while (this.index < this.queue.length) {
    if (!this.canContinue(epoch)) return;
    const s = this.settingsOverride || this.settings(), line = this.queue[this.index];
    const route = s.routes.find(r => r.name === line.role);
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
    this.index++;
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
   Promise.resolve(this.sink.pause()).catch(error => { if (this.current(epoch)) this.emit('error', error.message || '暂停失败'); });
   this.emit('paused', '已暂停');
  } else if (this.phase === 'paused') {
   const epoch = this.epoch;
   return Promise.resolve(this.sink.resume()).then(() => {
    if (!this.current(epoch) || this.phase !== 'paused') return;
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
 close() { this.stop(); return this.sink.close?.(); }
}