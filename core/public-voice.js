import {DialoguePlayer} from './player.js';
import {findRoute} from './routes.js';
import {buildRequest} from './providers.js';

const aborted = () => Object.assign(Error('已取消配音'), {name: 'AbortError'});
const waitFor = (promise, signal) => new Promise((resolve, reject) => {
  const cancel = () => { signal?.removeEventListener('abort', cancel); reject(aborted()); };
  if (signal?.aborted) { cancel(); return; }
  signal?.addEventListener('abort', cancel, {once: true});
  promise.then(value => { signal?.removeEventListener('abort', cancel); resolve(value); }, error => { signal?.removeEventListener('abort', cancel); reject(error); });
});
/** Generation only. Its jobs never own or stop the story/call player's playback or shared requests. */
export function publicVoice(backend, ask) {
  const settings = () => backend.seen || backend.getState();
  const player = new DialoguePlayer({settings, providers: backend.providers, cache: backend.cache,
    sink: {}, voiced: (engine, text) => backend.ledger.voice(engine, text)});
  const jobs = new Map(), approvals = new Map();
  let closed = false;
  function status(name) {
    const s = settings(), route = findRoute(s.routes, String(name || '').trim());
    let missing = closed || backend.closed ? '小手机现在没有启用' : s.general.voiceEnabled === false ? '请先打开正文语音' : !route ? '请先在角色 App 里添加这个角色' : '';
    if (!missing) {
      try {
        buildRequest(route.engine, s.connections[route.engine], {...route, language: route.language || s.general.defaultLanguage}, {role: route.name, text: '预览', emotion: ''}, backend.providers.references);
        // Custom services may be local and anonymous; their own template and provider validate authentication.
        if (route.engine !== 'custom' && !backend.keyStatus(route.engine) && !(route.engine === 'fish' && backend.providers.fishMcp?.status().connected)) missing = '请先连接这个角色使用的语音引擎';
      } catch (error) { missing = error.message; }
    }
    return {ready: !missing, missing, role: route?.name || String(name || ''), engine: route?.engine || ''};
  }
  async function synthesize(request = {}) {
    const {signal} = request;
    const check = () => { if (closed || backend.closed || signal?.aborted) throw aborted(); };
    check();
    const text = String(request.text || '').trim(), role = String(request.role || '').trim();
    if (!text) throw Error('配音文本不能为空');
    if (text.length > 20000) throw Error('这段配音超过 20000 字，请按台词分段提交');
    const before = status(role); if (!before.ready) throw Error(before.missing);
    const owner = backend.spaceGuard?.() || (() => !backend.closed);
    const from = String(request.from || '其他插件').replace(/\s+/g, ' ').trim().slice(0, 40);
    // A label is for the confirmation only: it is not an authenticated plugin identity or a permission boundary.
    if (!approvals.has(from)) {
      const approval = Promise.resolve().then(() => ask(`${from}想使用小手机配音`, '使用你在角色 App 里设置的音色和语音引擎，音频交给对方播放。生成可能消耗已连接服务的额度，本次启用期间后续台词不再逐句询问。允许吗？')).then(Boolean);
      approvals.set(from, approval);
      approval.then(ok => { if (!ok && approvals.get(from) === approval) approvals.delete(from); }, () => { if (approvals.get(from) === approval) approvals.delete(from); });
    }
    if (!await waitFor(approvals.get(from), signal)) throw Object.assign(Error('未允许外部配音'), {cancelled: true});
    check(); if (!owner()) throw aborted();
    const s = structuredClone(settings()), route = findRoute(s.routes, role);
    if (!status(role).ready) throw Error(status(role).missing);
    const line = {role: route.name, text, emotion: String(request.emotion || '').slice(0, 100), translation: ''};
    const {key} = await player.requestOf(line, route, s); check(); if (!owner()) throw aborted();
    let entry = jobs.get(key);
    if (!entry) {
      if (jobs.size >= 16) throw Error('等待配音的台词太多，请等前面的完成');
      const controller = new AbortController();
      entry = {controller, users: 0}; jobs.set(key, entry);
      entry.job = player.make(line, route, s, controller.signal, () => {}, () => !closed && !backend.closed && !controller.signal.aborted)
        .then(result => { if (!result) throw aborted(); return {blob: result.blob, engine: route.engine, fromCache: result.fromCache}; });
      entry.job.catch(() => {}).finally(() => { if (jobs.get(key) === entry) jobs.delete(key); });
    }
    entry.users++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const done = (error, result) => {
        if (finished) return; finished = true; signal?.removeEventListener('abort', cancel); entry.controller.signal.removeEventListener('abort', cancel);
        if (--entry.users === 0 && jobs.get(key) === entry) { jobs.delete(key); entry.controller.abort(); }
        error ? reject(error) : resolve({...result, role: route.name});
      };
      const cancel = () => done(aborted());
      signal?.addEventListener('abort', cancel, {once: true});
      entry.controller.signal.addEventListener('abort', cancel, {once: true});
      if (signal?.aborted) cancel();
      entry.job.then(result => done(!owner() || closed || backend.closed ? aborted() : null, result), error => done(error));
    });
  }
  return {status, synthesize, close() { closed = true; for (const job of jobs.values()) job.controller.abort(); jobs.clear(); approvals.clear(); }};
}
