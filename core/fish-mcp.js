// Fish's web-plan OAuth/MCP connection. Credentials stay in this browser, outside settings/backups.
// Official protocol: https://docs.fish.audio/overview/mcp (2026-11-11).
import {joinAudio} from './audio-join.js';
import {fishCreditBalance, fishMcpHttpError, fishOAuthHttpError, fishSafeText} from './fish-mcp-results.js';
import {fishExternalHost, fishLoginRedirect, openFishExternal, fishRoutePreference} from './fish-transport.js';
import {FishTtMcp} from './fish-tt-mcp.js';
import {fishAudioDownload} from './fish-audio.js';
import {sha256Hex} from './hash.js';
import {fishLoginKeys, FISH_LOGIN_TTL, fishTrace, fishTraceOf, fishCredentialKey, acceptFishCallback, parseFishManualInput, readFishPending, fishCredentials, fishLoginCompleted, fishLoginEpoch, fishLoginOwner, fishLoginLocks, cancelFishLogins, dropFishPending, canFinishFishLogin, completeFishLogin} from './fish-oauth-flow.js';
const API = 'https://api.fish.audio', RESOURCE = API + '/mcp';
const speechOwner = c => c?.client_id && c?.login_state ? [c.client_id,c.login_state,c.login_epoch] : [c?.access_token];
// Named popups are shared by clients in one host window, not by just one FishMcp instance.
const popupOwners = new WeakMap();
const random = () => { const b = crypto.getRandomValues(new Uint8Array(32)); return base64(b); };
const base64 = b => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function mcpResult(text, id) {
  const messages = text.trim().startsWith('{') ? [JSON.parse(text)] : text.split(/\r?\n\r?\n/).flatMap(event => {
    const data = event.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
    if (!data || data === '[DONE]') return [];
    return [JSON.parse(data)];
  });
  const reply = messages.find(m => m.id === id);
  if (!reply) throw Error('Fish 没有返回完整的工具结果');
  if (reply.error || reply.result?.isError) throw Error('Fish 未完成请求：' + String(reply.error?.message || reply.result?.content?.find(c => c.type === 'text')?.text || '工具拒绝了请求').slice(0, 300));
  return reply.result;
}
export function speechArguments(schema, {text, voice, model}) {
  if (!text || !voice) throw Error('Fish 配音需要台词和角色音色');
  const p = schema?.properties || {}, args = {};
  const assign = (names, value) => { const key = names.find(n => p[n]); if (!key) throw Error('Fish 的语音工具参数已改变，请更新插件'); args[key] = value; return key; };
  assign(['text', 'input'], text);
  assign(['voice_id', 'reference_id', 'voice'], voice);
  const key = assign(['model', 'model_id'], model);
  if (p[key].enum && !p[key].enum.includes(model)) throw Error('Fish 当前的订阅工具不支持这个模型，请选择 Drama 3');
  for (const name of schema.required || []) {
    if (Object.hasOwn(args, name)) continue;
    if (Object.hasOwn(p[name] || {}, 'default')) args[name] = p[name].default;
    else throw Error(`Fish 语音工具还需要「${name}」，本次没有生成或扣点`);
  }
  return args;
}
export function audioLinks(result) {
  const links = [];
  const add = value => { try { const u = new URL(value); if (u.protocol === 'https:' && !u.username && !u.password) links.push(u.href); } catch {} };
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === 'string' && /^(audio_url|download_url|audio_link)$/.test(key)) add(v);
      else if (key === 'url' && typeof v === 'string' && (/audio/i.test(value.mimeType || value.type || '') || /\.(mp3|wav|ogg|flac|m4a)(\?|$)/i.test(v))) add(v);
      else if (typeof v === 'object') walk(v);
    }
  };
  walk(result.structuredContent);
  for (const c of result.content || []) {
    if (c.type === 'resource_link' && /^audio\//.test(c.mimeType || '')) add(c.uri);
    if (c.type !== 'text') continue;
    try { walk(JSON.parse(c.text)); } catch {}
    for (const match of c.text.matchAll(/https:\/\/[^\s<>"\])]+\.(?:mp3|wav|ogg|flac|m4a)(?:\?[^\s<>"\])]*)?/gi)) add(match[0]);
  }
  return [...new Set(links)];
}
export class FishMcp {
  constructor({scope = '', win = globalThis, fetcher = globalThis.fetch?.bind(globalThis), storage = () => win.localStorage, proxy = null, audioProxy = null, notice = () => {}} = {}) {
    this.win = win; this.fetcher = fetcher; this.storage = storage; this.scope = scope || ''; this.key = fishCredentialKey(scope);
    this.proxy = proxy; this.notice = notice; this.routes=fishRoutePreference(storage,scope); this.viaProxy=!!proxy && !fishExternalHost(win) && this.routes.get('mcp');
    this.native = new FishTtMcp({win, storage, scope});
    this.downloadAudio = fishAudioDownload({fetcher, proxy:audioProxy, win, storage, scope, notice});
    this.downloadsKey = 'sttts.fishDownloads.' + scope; this.downloads = null; this.downloadJobs = new Map();
    this.loginOwner = fishLoginOwner(win); this.loginLocks = fishLoginLocks(win);
    this.session = ''; this.sequence = 0; this.epoch = 0; this.ready = null; this.refreshing = null; this.tools = null;
  }
  credentials() { try { return fishCredentials(this.storage(), this.scope); } catch { return null; } }
  status() { return {connected: !!this.credentials()?.access_token, ...(fishExternalHost(this.win) ? {transport: 'tt-mcp'} : {})}; }
  save(value) { const s = this.storage(); s.setItem(this.key, JSON.stringify({...value, login_epoch: value.login_epoch ?? fishLoginEpoch(s, this.scope)})); }
  disconnect() { this.epoch++; this.cancelLogin?.(); const s = this.storage(); cancelFishLogins(s, this.scope); s?.removeItem(this.key); this.session = ''; this.ready = null; this.tools = null; this.invalidateCredits(); return this.native.disconnect(); }
  loginReady() { this.ready = null; this.session = ''; this.tools = null; this.invalidateCredits(); return this.status(); }
  async json(url, init) {
    const r = await this.fetcher(url, {credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30000), ...init});
    if (!r.ok) {
      const fields = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : {};
      throw await fishOAuthHttpError(r, {step: url.endsWith('/oauth/register') ? '注册授权客户端' : '刷新登录', secrets: [fields.refresh_token, fields.code, fields.code_verifier]});
    }
    return r.json();
  }
  async token(body) {
    return this.json(API + '/oauth/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(body)});
  }
  /** 0.9.57: the last few steps of a login, for the 「连接诊断」 sheet (null when storage cannot be read). */
  trace() { const s = this.storage(); return s ? fishTraceOf(s) : []; }
  /** What an abandoned login left in the mailbox (the tab was reloaded before its finally) is dropped here. */
  sweepStale(now = Date.now()) {
    const s = this.storage(); if (!s || typeof s.key !== 'function') return;
    const keys = [];
    for (let i = 0; i < (Number(s.length) || 0); i++) { const k = s.key(i); if (typeof k === 'string' && k.startsWith('sttts.fishLogin.')) keys.push(k); }
    const drop = new Set();
    for (const key of keys) {
      if (!key.startsWith('sttts.fishLogin.pending.')) continue;
      let at = NaN;
      try { at = Number(JSON.parse(s.getItem(key) || 'null')?.at); } catch { at = NaN; }
      if (!Number.isFinite(at) || now - at > FISH_LOGIN_TTL) { drop.add(key); drop.add(key.replace('pending.', 'result.')); }
    }
    for (const key of keys) {
      if (!key.startsWith('sttts.fishLogin.result.')) continue;
      const pending = key.replace('result.', 'pending.');
      if (!keys.includes(pending)) drop.add(key);
    }
    for (const key of drop) { try { s.removeItem(key); } catch { /* storage may be read-only */ } }
  }
  /** A late result is completed only in its own settings space. A manual paste
   *  supplies the exact state; automatic resume never substitutes another space. */
  async resume(now = Date.now(), state = '') {
    if (!state && this.status().connected) return this.status();
    const s = this.storage(); if (!s || typeof s.key !== 'function') return this.status();
    this.sweepStale(now);
    if (state && fishLoginCompleted(s, this.scope, state)) return this.loginReady();
    const keys = state ? [fishLoginKeys(state).pending] : [];
    if (!state) for (let i = 0; i < (Number(s.length) || 0); i++) { const k = s.key(i); if (typeof k === 'string' && k.startsWith('sttts.fishLogin.pending.')) keys.push(k); }
    for (const key of keys) {
      let pending = null; try { pending = JSON.parse(s.getItem(key) || 'null'); } catch { pending = null; }
      if (!pending?.state || (pending.scope || '') !== this.scope) continue;
      let result = null; try { result = JSON.parse(s.getItem(key.replace('pending.', 'result.')) || 'null'); } catch { result = null; }
      if (!result?.code || result.state !== pending.state) continue;
      if (!state && !canFinishFishLogin(pending, {locks: this.loginLocks, owner: this.loginOwner})) continue;
      const epoch = this.epoch;
      fishTrace(s, 'resume', pending.state.slice(0, 6));
      await completeFishLogin({storage: s, state: pending.state, scope: this.scope, result, fetcher: this.fetcher,
        locks: this.loginLocks, owner: this.loginOwner, now, valid: () => this.epoch === epoch});
      if (this.epoch !== epoch) throw Error('Fish 登录已取消');
      return this.loginReady();
    }
    if (state) throw Error(`没有找到标识为 ${state.slice(0, 6)} 的待办登录记录，请先在当前酒馆点一次「连接订阅账户」再粘贴`);
    if (keys.length) fishTrace(s, 'resume-waiting', `${keys.length} 条待办`);
    return this.status();
  }
  /** An explicit paste must complete this exact state, even if an old account
   *  remains connected. It neither cancels nor consumes another pending login. */
  async completeManual(input, now = Date.now()) {
    const s = this.storage(); if (!s) throw Error('当前浏览器无法读取本地存储');
    const params = parseFishManualInput(input), state = params.get('state');
    fishLoginKeys(state);
    const pending = readFishPending(s, state);
    if (pending && (pending.scope || '') !== this.scope) throw Error('这次 Fish 登录属于另一个设置空间，请回到发起登录的空间');
    const result = acceptFishCallback(params, s, now);
    fishTrace(s, 'manual-paste', result.state.slice(0, 6));
    return this.resume(now, result.state);
  }
  async connect() {
    this.cancelLogin?.();
    const storage = this.storage(), win = this.win;
    popupOwners.get(win)?.cancel();
    this.sweepStale();
    dropFishPending(storage, this.scope);
    fishTrace(storage, 'connect-start');
    const epoch = ++this.epoch, state = random(), verifier = random(), redirect = fishLoginRedirect(win, new URL('../fish-oauth.html', import.meta.url).href);
    const keys = fishLoginKeys(state), attempt = {state, epoch, cancelled: false};
    this.login = attempt;
    let popup, cleanup = () => {}, rejectWait;
    const valid = () => !attempt.cancelled && epoch === this.epoch;
    const cancel = () => { attempt.cancelled = true; storage.removeItem(keys.pending); storage.removeItem(keys.result); rejectWait?.(Error('Fish 登录已取消')); };
    this.cancelLogin = cancel;
    popupOwners.set(win, {attempt, cancel});
    try {
      const external = fishExternalHost(win);
      if (!external) {
        popup = win.open('about:blank', 'st-iphonie-fish', 'popup,width=560,height=720');
        if (!popup) throw Error('请允许弹出窗口，再连接 Fish 订阅账户');
      }
      const client = await this.json(API + '/oauth/register', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({client_name: 'ST-iPhonie', redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code']})});
      if (!valid()) throw Error('Fish 登录已取消');
      if (!client.client_id) throw Error('Fish 没有返回登录客户端编号');
      const challenge = base64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      if (!valid()) throw Error('Fish 登录已取消');
      const target = new URL('https://fish.audio/oauth/authorize');
      target.search = new URLSearchParams({client_id: client.client_id, redirect_uri: redirect, response_type: 'code', scope: 'mcp', state, code_challenge: challenge, code_challenge_method: 'S256', resource: RESOURCE});
      // With Web Locks either document uses the same exclusive exchanger. Without
      // them only this live host page consumes; the callback hands the code back.
      storage.setItem(keys.pending, JSON.stringify({state, at: Date.now(), verifier, clientId: client.client_id, redirect, scope: this.scope,
        epoch: fishLoginEpoch(storage, this.scope), consumer: typeof this.loginLocks?.request === 'function' ? 'locked' : 'host', host: this.loginOwner}));
      fishTrace(storage, 'pending-written', state.slice(0, 6));
      const result = await new Promise((resolve, reject) => {
        rejectWait = reject;
        const accept = data => {
          if (data?.type !== 'st-iphonie-fish-oauth' || data.state !== state) return;
          if (data.iss && data.iss !== API) { reject(Error('Fish 登录来源不符')); return; }
          if (fishLoginCompleted(storage, this.scope, state)) { resolve({done: true}); return; }
          fishTrace(storage, 'tavern-read', state.slice(0, 6));
          if (data.error || !data.code) reject(Error('Fish 登录未授权，请重试')); else resolve(data);
        };
        const listener = e => {
          if (e.origin !== new URL(redirect).origin || e.source !== popup) return;
          accept(e.data);
        };
        const read = () => {
          if (!valid()) { reject(Error('Fish 登录已取消')); return; }
          if (fishLoginCompleted(storage, this.scope, state)) { resolve({done: true}); return; }
          try { accept(JSON.parse(storage.getItem(keys.result) || 'null')); } catch { /* message channel remains available */ }
        };
        const onStorage = e => { if (e.key === keys.result || e.key === this.key) read(); };
        const timer = win.setTimeout(() => reject(Error('Fish 登录已超时，请重试')), FISH_LOGIN_TTL);
        const poll = win.setInterval(read, 500);
        cleanup = () => { win.removeEventListener('message', listener); win.removeEventListener('storage', onStorage); win.removeEventListener('focus', read); win.clearTimeout(timer); win.clearInterval(poll); };
        win.addEventListener('message', listener); win.addEventListener('storage', onStorage); win.addEventListener('focus', read);
        if (external) {
          this.notice('已在系统浏览器打开 Fish。授权后会显示返回页，请点「复制本次授权码」，回 TT 的 Fish 页面打开「连接诊断」粘贴；已连接时从「管理连接」进入。');
          Promise.resolve(openFishExternal(win, target.href)).catch(reject);
        } else popup.location.href = target.href;
      });
      cleanup();
      if (!valid()) throw Error('Fish 登录已取消');
      if (!fishLoginCompleted(storage, this.scope, state)) await completeFishLogin({storage, state, scope: this.scope, result, fetcher: this.fetcher,
        locks: this.loginLocks, owner: this.loginOwner, valid});
      if (!valid()) throw Error('Fish 登录已取消');
      return this.loginReady();
    } catch (error) {
      if (valid() && fishLoginCompleted(storage, this.scope, state)) return this.loginReady();
      fishTrace(storage, 'token-fail', error.message);
      throw error; // An old account stays usable, but never turns this failed attempt into success.
    } finally {
      cleanup();
      if (this.cancelLogin === cancel) this.cancelLogin = null;
      // A late old attempt shares the named WindowProxy with a newer login.
      if (this.login === attempt) this.login = null;
      if (popupOwners.get(win)?.attempt === attempt) { popupOwners.delete(win); try { popup?.close(); } catch { /* detached login tab */ } }
    }
  }
  async access() {
    const c = this.credentials();
    if (!c?.access_token) throw Error('请先连接 Fish 订阅账户');
    if (c.expires_at > Date.now() + 60000) return c.access_token;
    if (!c.refresh_token) throw Error('Fish 登录已过期，请重新连接');
    if (!this.refreshing) {
      const epoch = this.epoch, loginEpoch = fishLoginEpoch(this.storage(), this.scope);
      this.refreshing = this.token({grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client_id, resource: RESOURCE}).then(t => {
        const current = this.credentials();
        if (epoch !== this.epoch || loginEpoch !== fishLoginEpoch(this.storage(), this.scope) || !current || current.access_token !== c.access_token || current.refresh_token !== c.refresh_token || current.login_state !== c.login_state) throw Error('Fish 连接已断开或账户已切换');
        if (!t.access_token) throw Error('Fish 登录已过期，请重新连接');
        // Preserve the epoch captured before the request: a disconnect in another document may race this write.
        this.save({...c, ...t, login_state: c.login_state, login_epoch: loginEpoch, expires_at: Date.now() + Number(t.expires_in || 3600) * 1000}); return t.access_token;
      }).finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }
  async rpc(method, params, signal, notification = false) {
    const token = await this.access(), id = ++this.sequence;
    const init = {method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', signal: signal || AbortSignal.timeout(120000),
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': this.protocol || '2025-03-26', ...(this.session ? {'Mcp-Session-Id': this.session} : {})},
      body: JSON.stringify({jsonrpc: '2.0', ...(notification ? {} : {id}), method, params})};
    let r = await (this.viaProxy && this.proxy ? this.proxy : this.fetcher)(RESOURCE, init);
    // Only retry an explicitly rejected, non-generating handshake. Once selected,
    // the transport is fixed for tools/call; paid requests are never replayed.
    if (!this.viaProxy && this.proxy && method === 'initialize' && r.status === 403 && /origin.{0,80}(?:not allowed|forbidden|invalid|not permitted)/i.test(await r.clone().text())) {
      await r.body?.cancel();
      this.viaProxy = true;
      fishTrace(this.storage(), 'mcp-proxy', '网页来源被拒，改用酒馆转发握手');
      r = await this.proxy(RESOURCE, init);
    }
    if (!r.ok) {
      const c = this.credentials() || {};
      const error = await fishMcpHttpError(r, {method, tool: params?.name, secrets: [token, c.access_token, c.refresh_token]});
      fishTrace(this.storage(), 'mcp-error', `${error.step}（${error.status}）${error.detail || error.message}`);
      throw error;
    }
    this.session = r.headers.get('Mcp-Session-Id') || this.session;
    if (notification) { await r.body?.cancel(); return; }
    return mcpResult(await r.text(), id);
  }
  async initialize() {
    if (fishExternalHost(this.win)) {
      const token = await this.access(), epoch = this.epoch;
      try { this.tools = await this.native.discover(token, () => epoch === this.epoch && this.credentials()?.access_token === token); }
      catch (error) { throw Error(fishSafeText(error.message || String(error), [token, this.credentials()?.refresh_token])); }
      return;
    }
    if (!this.ready) this.ready = (async () => {
      const hello = await this.rpc('initialize', {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'ST-iPhonie', version: '1.0'}});
      this.protocol = hello.protocolVersion;
      await this.rpc('notifications/initialized', {}, undefined, true);
      this.tools = []; let cursor;
      do { const page = await this.rpc('tools/list', cursor ? {cursor} : {}); this.tools.push(...(page.tools || [])); cursor = page.nextCursor; } while (cursor);
      if (this.viaProxy) this.routes.remember('mcp');
    })().catch(e => { this.ready = null; throw e; });
    return this.ready;
  }
  async call(name, args = {}, signal) {
    if (fishExternalHost(this.win)) {
      const token = await this.access(), epoch = this.epoch;
      try { return await this.native.call(name, args, token, () => epoch === this.epoch && this.credentials()?.access_token === token, signal); }
      catch (error) {
        const message = fishSafeText(error.message || String(error), [token, this.credentials()?.refresh_token]);
        fishTrace(this.storage(), 'mcp-error', 'TT 原生 MCP：' + message); throw Error(message);
      }
    }
    await this.initialize(); return this.rpc('tools/call', {name, arguments: args}, signal);
  }
  async balance() { return (await this.credits()).detail; }
  invalidateCredits() { this.creditCache = null; }
  /** Reading credits is free. Coalesce concurrent card/menu reads, cache briefly, and never reuse another login's balance. */
  async credits(refresh = false) {
    const token = await this.access(), epoch = this.epoch;
    if (!refresh && this.creditCache?.token === token && Date.now() - this.creditCache.at < 60000) return {...this.creditCache.value};
    if (this.creditRequest?.token === token) return this.creditRequest.promise;
    const task = {token};
    task.promise = this.call('get_credit_balance').then(result => {
      if (epoch !== this.epoch || this.credentials()?.access_token !== token) throw Error('Fish 账户已切换，这次积分结果未显示');
      const value = fishCreditBalance(result), c = this.credentials() || {};
      value.detail = fishSafeText(value.detail, [token, c.refresh_token]);
      value.checkedAt = Date.now();
      this.creditCache = {token, at: value.checkedAt, value};
      return {...value};
    }).finally(() => { if (this.creditRequest === task) this.creditRequest = null; });
    this.creditRequest = task;
    return task.promise;
  }
  async speak(request, signal) {
    await this.initialize();
    const body = request.official?.body || request.body, model = String(body.model || request.headers?.model || '').replace(/^fish-audio\//, '');
    if (model !== 'drama-3') throw Error('订阅积分配音请将 Fish 模型设为 drama-3');
    const tool = this.tools.find(t => t.name === 'text_to_speech');
    const args = speechArguments(tool?.inputSchema, {text: body.input || body.text, voice: body.voice || body.reference_id, model});
    const c = this.credentials() || {}, epoch = this.epoch;
    const owner = speechOwner(c);
    const key = await sha256Hex(JSON.stringify([owner,args]));
    if (this.downloadJobs.has(key)) return this.downloadJobs.get(key);
    const task = this.speechDownload(key, args, signal, () => epoch === this.epoch && this.status().connected && JSON.stringify(speechOwner(this.credentials())) === JSON.stringify(owner));
    this.downloadJobs.set(key, task);
    try { return await task; } finally { if (this.downloadJobs.get(key) === task) this.downloadJobs.delete(key); }
  }
  pendingDownloads() {
    if (!this.downloads) {
      let rows; try { rows = JSON.parse(this.storage()?.getItem(this.downloadsKey) || '[]'); } catch { rows = []; }
      this.downloads = new Map((Array.isArray(rows) ? rows : []).filter(r => typeof r?.key === 'string' && /^[a-f0-9]{64}$/.test(r.key) && Array.isArray(r.links) && r.links.length && r.links.every(u => { try { const url = new URL(u); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } })).map(r => [r.key,r]));
    }
    return this.downloads;
  }
  keepDownloads() {
    try { this.storage()?.setItem(this.downloadsKey, JSON.stringify([...this.pendingDownloads().values()])); }
    catch { this.notice('已生成音频的下载进度暂时无法保存；请保留当前页面并先取回音频，不要重新生成'); }
  }
  async speechDownload(key, args, signal, valid) {
    let saved = this.pendingDownloads().get(key);
    if (!saved) {
      if (this.pendingDownloads().size >= 100) throw Error('已有较多待取回的 Fish 音频，本次没有重新生成；请先取回已有音频');
      if (signal?.aborted || !valid()) throw Error('Fish 请求已取消或账户已切换');
      await this.downloadAudio.prepare?.(signal);
      if (signal?.aborted || !valid()) throw Error('Fish 请求已取消或账户已切换');
      const result = await this.call('text_to_speech', args, signal), links = audioLinks(result);
      this.invalidateCredits();
      if (!links.length) throw Error('Fish 已返回，但没有识别出音频下载链接；请到 Fish 网页查看记录，不要反复生成');
      saved = {key,links}; this.pendingDownloads().set(key,saved); this.keepDownloads();
    }
    const blobs = [];
    for (const url of saved.links) {
      if (signal?.aborted || !valid()) throw Error('Fish 已生成声音，下载已取消；音频链接已保留');
      const r = await this.downloadAudio(url, signal);
      if (!r.ok) throw Error('Fish 已生成声音，但音频下载失败；音频链接已保留');
      const blob = await r.blob(), head = await blob.slice(0,100).text();
      if (!blob.size || (blob.type && !/^(?:audio\/|application\/(?:octet-stream|ogg)|binary\/octet-stream)/i.test(blob.type)) || /^\s*(?:<!doctype|<html|<body|\{|\[)/i.test(head)) throw Error('Fish 已生成声音，但返回的音频格式不正确；链接已保留'); blobs.push(blob);
      this.downloadAudio.confirm?.(r);
    }
    const audio = blobs.length === 1 ? blobs[0] : await joinAudio(blobs, this.win);
    if (signal?.aborted || !valid()) throw Error('Fish 已生成声音，下载已取消；音频链接已保留');
    this.pendingDownloads().delete(key); this.keepDownloads(); return audio;
  }
}
