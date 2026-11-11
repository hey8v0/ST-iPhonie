// Fish's web-plan OAuth/MCP connection. Credentials stay in this browser, outside settings/backups.
// Official protocol: https://docs.fish.audio/overview/mcp (2026-11-11).
import {joinAudio} from './audio-join.js';
import {fishLoginKeys, FISH_LOGIN_TTL, fishTrace, fishTraceOf, fishCredentialKey} from './fish-oauth-flow.js';
const API = 'https://api.fish.audio', RESOURCE = API + '/mcp';
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
  constructor({scope = '', win = globalThis, fetcher = globalThis.fetch?.bind(globalThis), storage = () => win.localStorage} = {}) {
    this.win = win; this.fetcher = fetcher; this.storage = storage; this.scope = scope; this.key = fishCredentialKey(scope);
    this.session = ''; this.sequence = 0; this.epoch = 0; this.ready = null; this.refreshing = null; this.tools = null;
  }
  credentials() { try { return JSON.parse(this.storage()?.getItem(this.key) || 'null'); } catch { return null; } }
  status() { return {connected: !!this.credentials()?.access_token}; }
  save(value) { this.storage().setItem(this.key, JSON.stringify(value)); }
  disconnect() { this.epoch++; this.cancelLogin?.(); this.storage()?.removeItem(this.key); this.session = ''; this.ready = null; this.tools = null; }
  async json(url, init) {
    const r = await this.fetcher(url, {credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30000), ...init});
    if (!r.ok) throw Error(`Fish 连接失败（${r.status}），请重新连接订阅账户`);
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
  /** 0.9.56: a login whose answer came after the tavern had stopped waiting is finished here — next time the engine page
   *  opens, or when the user asks. Only what this device kept for fifteen minutes is used; the code is taken once. */
  async resume(now = Date.now()) {
    if (this.cancelLogin) return this.status();
    const s = this.storage(); if (!s || typeof s.key !== 'function') return this.status();
    this.sweepStale(now);
    const keys = [];
    for (let i = 0; i < (Number(s.length) || 0); i++) { const k = s.key(i); if (typeof k === 'string' && k.startsWith('sttts.fishLogin.pending.')) keys.push(k); }
    for (const key of keys) {
      let pending = null; try { pending = JSON.parse(s.getItem(key) || 'null'); } catch { pending = null; }
      if (!pending?.state || !pending.verifier || !pending.clientId || !pending.redirect) continue;
      let result = null; try { result = JSON.parse(s.getItem(key.replace('pending.', 'result.')) || 'null'); } catch { result = null; }
      if (!result?.code || result.state !== pending.state) continue;
      fishTrace(s, 'resume', pending.state.slice(0, 6));
      try {
        const token = await this.token({grant_type: 'authorization_code', code: result.code, redirect_uri: pending.redirect, client_id: pending.clientId, code_verifier: pending.verifier, resource: RESOURCE});
        if (!token.access_token) throw Error('Fish 没有返回有效登录凭据');
        this.save({...token, client_id: pending.clientId, expires_at: Date.now() + Number(token.expires_in || 3600) * 1000});
        this.ready = null; this.session = ''; this.tools = null;
        fishTrace(s, 'token-ok');
      } finally { try { s.removeItem(key); s.removeItem(key.replace('pending.', 'result.')); } catch { /* nothing to tidy */ } }
      if (this.status().connected) return this.status();
    }
    if (keys.length) fishTrace(this.storage(), 'resume-waiting', `${keys.length} 条待办`);
    return this.status();
  }
  async connect() {
    if (this.cancelLogin) throw Error('Fish 登录窗口已打开，请先完成登录');
    this.sweepStale();
    const traceStore = this.storage();
    fishTrace(traceStore, 'connect-start');
    const win = this.win, popup = win.open('about:blank', 'st-iphonie-fish', 'popup,width=560,height=720');
    if (!popup) throw Error('请允许弹出窗口，再连接 Fish 订阅账户');
    const epoch = ++this.epoch, state = random(), verifier = random(), redirect = new URL('../fish-oauth.html', import.meta.url).href;
    const keys = fishLoginKeys(state), storage = this.storage();
    let cleanup = () => {};
    try {
      const client = await this.json(API + '/oauth/register', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({client_name: 'ST-iPhonie', redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code']})});
      if (!client.client_id) throw Error('Fish 没有返回登录客户端编号');
      const challenge = base64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      const target = new URL('https://fish.audio/oauth/authorize');
      target.search = new URLSearchParams({client_id: client.client_id, redirect_uri: redirect, response_type: 'code', scope: 'mcp', state, code_challenge: challenge, code_challenge_method: 'S256', resource: RESOURCE});
      // The verifier goes with the pending record so a late callback can still be finished by a page that was
      // reloaded meanwhile (0.9.56): it lives on this device for fifteen minutes and never leaves it.
      storage.setItem(keys.pending, JSON.stringify({state, at: Date.now(), verifier, clientId: client.client_id, redirect, scope: this.scope}));
      fishTrace(storage, 'pending-written', state.slice(0, 6));
      const code = await new Promise((resolve, reject) => {
        const accept = data => {
          if (data?.type !== 'st-iphonie-fish-oauth' || data.state !== state) return;
          if (data.iss && data.iss !== API) { reject(Error('Fish 登录来源不符')); return; }
          fishTrace(storage, 'tavern-read', state.slice(0, 6));
          if (data.error || !data.code) reject(Error('Fish 登录未授权，请重试')); else resolve(data.code);
        };
        const listener = e => {
          if (e.origin !== new URL(redirect).origin || e.source !== popup) return;
          accept(e.data);
        };
        const read = () => { try { accept(JSON.parse(storage.getItem(keys.result) || 'null')); } catch { /* message channel remains available */ } };
        const onStorage = e => { if (e.key === keys.result) read(); };
        const timer = win.setTimeout(() => reject(Error('Fish 登录已超时，请重试')), FISH_LOGIN_TTL);
        // COOP can mark the old WindowProxy closed even while the login tab is alive.
        const poll = win.setInterval(read, 500);
        this.cancelLogin = () => reject(Error('Fish 登录已取消'));
        cleanup = () => { win.removeEventListener('message', listener); win.removeEventListener('storage', onStorage); win.removeEventListener('focus', read); win.clearTimeout(timer); win.clearInterval(poll); this.cancelLogin = null; };
        win.addEventListener('message', listener); win.addEventListener('storage', onStorage); win.addEventListener('focus', read); popup.location.href = target.href;
      });
      cleanup();
      let token;
      try { token = await this.token({grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: client.client_id, code_verifier: verifier, resource: RESOURCE}); }
      catch (error) { fishTrace(storage, 'token-fail', error.message); throw error; }
      if (epoch !== this.epoch) throw Error('Fish 连接已取消');
      if (!token.access_token) throw Error('Fish 没有返回有效登录凭据');
      this.save({...token, client_id: client.client_id, expires_at: Date.now() + Number(token.expires_in || 3600) * 1000});
      fishTrace(storage, 'token-ok');
      this.ready = null; this.session = ''; this.tools = null;
      return this.status();
    } catch (error) {
      // Keep the pending record: a callback that comes after the deadline is finished by resume() next time the page opens.
      throw error;
    } finally { cleanup(); if (this.credentials()?.access_token) { storage.removeItem(keys.pending); storage.removeItem(keys.result); } try { popup.close(); } catch { /* detached login tab */ } }
  }
  async access() {
    const c = this.credentials();
    if (!c?.access_token) throw Error('请先连接 Fish 订阅账户');
    if (c.expires_at > Date.now() + 60000) return c.access_token;
    if (!c.refresh_token) throw Error('Fish 登录已过期，请重新连接');
    if (!this.refreshing) {
      const epoch = this.epoch;
      this.refreshing = this.token({grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client_id, resource: RESOURCE}).then(t => {
        if (epoch !== this.epoch) throw Error('Fish 连接已断开');
        if (!t.access_token) throw Error('Fish 登录已过期，请重新连接');
        this.save({...c, ...t, expires_at: Date.now() + Number(t.expires_in || 3600) * 1000}); return t.access_token;
      }).finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }
  async rpc(method, params, signal, notification = false) {
    const token = await this.access(), id = ++this.sequence;
    const r = await this.fetcher(RESOURCE, {method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', signal: signal || AbortSignal.timeout(120000),
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': this.protocol || '2025-03-26', ...(this.session ? {'Mcp-Session-Id': this.session} : {})},
      body: JSON.stringify({jsonrpc: '2.0', ...(notification ? {} : {id}), method, params})});
    if (!r.ok) throw Error(`Fish 订阅接口失败（${r.status}）；没有自动重试，请检查账户连接`);
    this.session = r.headers.get('Mcp-Session-Id') || this.session;
    if (notification) { await r.body?.cancel(); return; }
    return mcpResult(await r.text(), id);
  }
  async initialize() {
    if (!this.ready) this.ready = (async () => {
      const hello = await this.rpc('initialize', {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'ST-iPhonie', version: '1.0'}});
      this.protocol = hello.protocolVersion;
      await this.rpc('notifications/initialized', {}, undefined, true);
      this.tools = []; let cursor;
      do { const page = await this.rpc('tools/list', cursor ? {cursor} : {}); this.tools.push(...(page.tools || [])); cursor = page.nextCursor; } while (cursor);
    })().catch(e => { this.ready = null; throw e; });
    return this.ready;
  }
  async call(name, args = {}, signal) { await this.initialize(); return this.rpc('tools/call', {name, arguments: args}, signal); }
  async balance() {
    const result = await this.call('get_credit_balance');
    return (result.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n') || JSON.stringify(result.structuredContent || {});
  }
  async speak(request, signal) {
    await this.initialize();
    const body = request.official?.body || request.body, model = String(body.model || request.headers?.model || '').replace(/^fish-audio\//, '');
    if (model !== 'drama-3') throw Error('订阅积分配音请将 Fish 模型设为 drama-3');
    const tool = this.tools.find(t => t.name === 'text_to_speech');
    const args = speechArguments(tool?.inputSchema, {text: body.input || body.text, voice: body.voice || body.reference_id, model});
    const result = await this.call('text_to_speech', args, signal), links = audioLinks(result);
    if (!links.length) throw Error('Fish 已返回，但没有识别出音频下载链接；请到 Fish 网页查看记录，不要反复生成');
    const blobs = [];
    for (const url of links) {
      const r = await this.fetcher(url, {signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
      if (!r.ok) throw Error('Fish 已生成声音，但下载失败；请到 Fish 网页查看记录');
      const blob = await r.blob(); if (!blob.size || /json|html/.test(blob.type)) throw Error('Fish 返回的音频格式不正确'); blobs.push(blob);
    }
    return blobs.length === 1 ? blobs[0] : joinAudio(blobs, this.win);
  }
}
