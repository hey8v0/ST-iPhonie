// Fish's web-plan OAuth/MCP connection. Credentials stay in this browser, outside settings/backups.
// Official protocol: https://docs.fish.audio/overview/mcp (2026-11-11).
import {joinAudio} from './audio-join.js';
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
    this.win = win; this.fetcher = fetcher; this.storage = storage; this.key = 'sttts.fishOAuth.' + scope;
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
  async connect() {
    if (this.cancelLogin) throw Error('Fish 登录窗口已打开，请先完成登录');
    const win = this.win, popup = win.open('about:blank', 'st-iphonie-fish', 'popup,width=560,height=720');
    if (!popup) throw Error('请允许弹出窗口，再连接 Fish 订阅账户');
    const epoch = ++this.epoch, state = random(), verifier = random(), redirect = new URL('../fish-oauth.html', import.meta.url).href;
    let cleanup = () => {};
    try {
      const client = await this.json(API + '/oauth/register', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({client_name: 'ST-iPhonie', redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code']})});
      if (!client.client_id) throw Error('Fish 没有返回登录客户端编号');
      const challenge = base64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      const target = new URL('https://fish.audio/oauth/authorize');
      target.search = new URLSearchParams({client_id: client.client_id, redirect_uri: redirect, response_type: 'code', scope: 'mcp', state, code_challenge: challenge, code_challenge_method: 'S256', resource: RESOURCE});
      const code = await new Promise((resolve, reject) => {
        const listener = e => {
          if (e.origin !== new URL(redirect).origin || e.source !== popup || e.data?.type !== 'st-iphonie-fish-oauth' || e.data.state !== state) return;
          if (e.data.iss && e.data.iss !== API) return;
          if (e.data.error || !e.data.code) reject(Error('Fish 登录未授权，请重试')); else resolve(e.data.code);
        };
        const timer = win.setTimeout(() => reject(Error('Fish 登录已超时，请重试')), 300000);
        const closed = win.setInterval(() => { if (popup.closed) reject(Error('Fish 登录窗口已关闭')); }, 1000);
        this.cancelLogin = () => reject(Error('Fish 登录已取消'));
        cleanup = () => { win.removeEventListener('message', listener); win.clearTimeout(timer); win.clearInterval(closed); this.cancelLogin = null; };
        win.addEventListener('message', listener); popup.location.href = target.href;
      });
      cleanup();
      const token = await this.token({grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: client.client_id, code_verifier: verifier, resource: RESOURCE});
      if (epoch !== this.epoch) throw Error('Fish 连接已取消');
      if (!token.access_token) throw Error('Fish 没有返回有效登录凭据');
      this.save({...token, client_id: client.client_id, expires_at: Date.now() + Number(token.expires_in || 3600) * 1000});
      this.ready = null; this.session = ''; this.tools = null;
      return this.status();
    } finally { cleanup(); popup.close(); }
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
