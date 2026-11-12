import {fishOAuthHttpError} from './fish-mcp-results.js';
// The callback may lose window.opener (mobile browsers / cross-origin isolation).
// A short-lived, state-bound mailbox on the tavern origin also carries the result.
//
// 0.9.55: the login often takes longer than five minutes on a phone (password, a code, switching tabs), and two tabs
// can disagree about the clock by a little, so the window is fifteen minutes and a small skew no longer ends the
// login. When the record of the start is gone (the tavern tab was reloaded or its storage cleared) the callback still
// carries the code: the PKCE verifier only exists in the tab that began the login, so the exchange itself proves it.
export const FISH_LOGIN_TTL = 15 * 60 * 1000;
/** How far the callback's clock may run behind the tavern's before the record is only doubted, not refused. */
export const FISH_CLOCK_SLACK = 2 * 60 * 1000;
export const FISH_ISSUER = 'https://api.fish.audio';
export const FISH_TOKEN_URL = 'https://api.fish.audio/oauth/token';
export const FISH_RESOURCE = 'https://api.fish.audio/mcp';
/** Where a login's credentials live (one place per settings space, so the phone and the callback page agree). */
export const fishCredentialKey = scope => 'sttts.fishOAuth.' + (scope || '');
/** The pending record a callback belongs to, or null. */
export function readFishPending(storage, state) {
  try { const keys = fishLoginKeys(state); return JSON.parse(storage.getItem(keys.pending) || 'null'); } catch { return null; }
}
/** 0.9.59: when a mobile browser opens the callback in another browser app or isolated storage container, a short
 *  base64url token ("fish1." + JSON({state, code, iss})) lets the user copy & paste the callback back into the tavern. */
export function packFishCallback(result) {
  if (!result?.state || !result?.code) return '';
  const raw = JSON.stringify({state: result.state, code: result.code, ...(result.iss ? {iss: result.iss} : {})});
  return 'fish1.' + btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function parseFishManualInput(input) {
  const text = String(input || '').trim();
  if (!text) throw Error('请先粘贴回调页上的授权码或回调网址');
  if (text.startsWith('fish1.')) {
    try {
      const b64 = text.slice(6).replace(/-/g, '+').replace(/_/g, '/');
      const obj = JSON.parse(decodeURIComponent(escape(atob(b64))));
      const params = new URLSearchParams();
      if (obj?.state) params.set('state', String(obj.state));
      if (obj?.code) params.set('code', String(obj.code));
      if (obj?.iss) params.set('iss', String(obj.iss));
      return params;
    } catch { throw Error('授权码格式不对，请在回调页点「复制本次授权码」后再粘贴'); }
  }
  const qIndex = text.indexOf('?');
  const query = qIndex >= 0 ? text.slice(qIndex + 1) : text;
  const params = new URLSearchParams(query.replace(/^[?#]+/, ''));
  if (!params.get('state') || !params.get('code')) throw Error('没有识别到 state 和 code，请复制完整的授权码或回调网址');
  return params;
}
/**
 * 0.9.58: the callback page finishes the login itself. A phone freezes a background tab while the user logs in, so the
 * tavern often never reads the mailbox; the tab that comes back is the callback, and it has everything the exchange
 * needs (the pending record keeps the verifier). The credentials land where the tavern keeps them, so the phone only has
 * to look again.
 */
export async function exchangeFishCode({code, verifier, clientId, redirect, scope, fetcher = globalThis.fetch?.bind(globalThis), now = Date.now()}) {
  const r = await fetcher(FISH_TOKEN_URL, {method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30000),
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: clientId, code_verifier: verifier, resource: FISH_RESOURCE})});
  if (!r.ok) throw await fishOAuthHttpError(r, {step: '交换授权码', secrets: [code, verifier]});
  const token = await r.json();
  if (!token?.access_token) throw Error('Fish 没有返回有效登录凭据');
  return {...token, client_id: clientId, expires_at: now + Number(token.expires_in || 3600) * 1000};
}
/** 0.9.57: what happened in a login, step by step, so a screen with no console can still say why it stopped. */
export const FISH_TRACE_KEY = 'sttts.fishLogin.trace';
export function fishTrace(storage, ev, msg = '') {
  try {
    const list = JSON.parse(storage.getItem(FISH_TRACE_KEY) || '[]');
    list.push({at: Date.now(), ev: String(ev).slice(0, 24), msg: String(msg ?? '').slice(0, 160)});
    storage.setItem(FISH_TRACE_KEY, JSON.stringify(list.slice(-24)));
  } catch { /* nothing to record into */ }
}
export function fishTraceOf(storage) {
  try { const list = JSON.parse(storage.getItem(FISH_TRACE_KEY) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; }
}
export const fishLoginKeys = state => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state || '')) throw Error('Fish 登录校验信息无效，请回酒馆重新连接');
  return {pending: 'sttts.fishLogin.pending.' + state, result: 'sttts.fishLogin.result.' + state};
};
export function acceptFishCallback(params, storage, now = Date.now(), {publish = true} = {}) {
  const state = params.get('state'), keys = fishLoginKeys(state);
  const iss = params.get('iss'), code = params.get('code'), error = params.get('error');
  if (iss && iss !== FISH_ISSUER) throw Error('Fish 登录来源不符，本次连接未保存');
  if (!code && !error) throw Error('没有收到 Fish 授权结果，请返回酒馆重新连接');
  let pending = null;
  try { pending = JSON.parse(storage.getItem(keys.pending) || 'null'); } catch { pending = null; }
  let weak = false;
  if (pending) {
    if (pending.state !== state) throw Error('这次 Fish 登录的校验信息对不上，请返回酒馆重新连接');
    const at = Number(pending.at);
    if (!Number.isFinite(at)) weak = true;
    else if (now - at > FISH_LOGIN_TTL) throw Error('这次 Fish 登录已过期（超过 15 分钟），请返回酒馆重新连接');
    else if (at - now > FISH_CLOCK_SLACK) weak = true;
  } else weak = true;
  const result = {type: 'st-iphonie-fish-oauth', state, iss, code, error, ...(weak ? {weak: true} : {})};
  // The callback validates without publishing when it can exchange: a consumable
  // code must not reach a second exchanger before the first one has finished.
  if (publish) storage.setItem(keys.result, JSON.stringify(result));
  return result;
}

const pageOwners = new WeakMap(), exchanges = new WeakMap();
const loginId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const epochKey = scope => 'sttts.fishLogin.epoch.' + (scope || '');
export function fishLoginEpoch(storage, scope) { try { return storage.getItem(epochKey(scope)) || ''; } catch { return ''; } }
export function fishLoginOwner(win = globalThis) {
  if (!pageOwners.has(win)) pageOwners.set(win, loginId());
  return pageOwners.get(win);
}
export function fishLoginLocks(win = globalThis) { try { return win.navigator?.locks; } catch { return null; } }
export function fishCredentials(storage, scope) {
  try {
    const value = JSON.parse(storage.getItem(fishCredentialKey(scope)) || 'null');
    return value && (value.login_epoch || '') === fishLoginEpoch(storage, scope) ? value : null;
  } catch { return null; }
}
export function fishLoginCompleted(storage, scope, state) {
  const value = fishCredentials(storage, scope);
  return !!value?.access_token && value.login_state === state;
}
/** A duplicate callback after its pending record was cleared: identify the receipt
 *  by the unguessable state kept with credentials, never by just any stored token. */
export function fishCompletedScope(storage, state) {
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith('sttts.fishOAuth.')) continue;
      const scope = key.slice('sttts.fishOAuth.'.length);
      if (fishLoginCompleted(storage, scope, state)) return scope;
    }
  } catch { /* unavailable storage has no completed login */ }
  return null;
}
export function dropFishPending(storage, scope) {
  const keys = [];
  for (let i = 0; i < (storage?.length || 0); i++) {
    const key = storage.key(i);
    if (key?.startsWith('sttts.fishLogin.pending.')) keys.push(key);
  }
  for (const key of keys) {
    let pending; try { pending = JSON.parse(storage.getItem(key) || 'null'); } catch { continue; }
    if (!pending || (pending.scope || '') !== (scope || '')) continue;
    storage.removeItem(key); storage.removeItem(key.replace('pending.', 'result.'));
  }
}
export function cancelFishLogins(storage, scope) {
  // The durable epoch also rejects a callback that was already awaiting /token
  // in another tab. An obsolete credential write cannot revive this login.
  storage?.setItem(epochKey(scope), loginId());
  dropFishPending(storage, scope);
}
const cancelled = () => Object.assign(Error('Fish 登录已取消，请重新连接'), {code: 'fish-login-cancelled'});
const noOwner = () => Error('这个浏览器不支持跨标签完成登录，请回到发起授权的酒馆页面；原页已关闭时请重新连接');
export function canFinishFishLogin(pending, {locks, owner, side = 'host'} = {}) {
  if (typeof locks?.request === 'function') return true;
  // No localStorage check-and-set masquerading as an atomic lock. Without Web
  // Locks only the original live host page may consume its explicit host record;
  // callbacks just hand the code back. Reloaded/legacy unowned records fail closed.
  return side === 'host' && pending?.consumer === 'host' && !!owner && pending.host === owner;
}
/** The only persisted-code exchanger, shared by connect/resume/manual/callback.
 *  Web Locks serialize different documents; the map coalesces callers in one
 *  document. A failed/interrupted exchange is not blindly retried with the same code. */
export function completeFishLogin({storage, state, scope = '', result, fetcher, locks, owner, side = 'host', valid = () => true, now = Date.now()}) {
  fishLoginKeys(state);
  let tasks = exchanges.get(storage);
  if (!tasks) exchanges.set(storage, tasks = new Map());
  const taskKey = `${scope}\n${state}`, existing = tasks.get(taskKey);
  if (existing) return existing;
  const run = async () => {
    if (!valid()) throw cancelled();
    if (fishLoginCompleted(storage, scope, state)) return {connected: true};
    const pending = readFishPending(storage, state);
    if (!pending || pending.state !== state) throw cancelled();
    if ((pending.scope || '') !== scope) throw Error('这次 Fish 登录属于另一个设置空间，请回到发起登录的空间');
    if (!Number.isFinite(Number(pending.at)) || now - Number(pending.at) > FISH_LOGIN_TTL) throw Error('这次 Fish 登录已过期，请重新连接');
    const epoch = pending.epoch ?? fishLoginEpoch(storage, scope);
    if (epoch !== fishLoginEpoch(storage, scope)) throw cancelled();
    if (!canFinishFishLogin(pending, {locks, owner, side})) throw noOwner();
    if (pending.phase === 'exchanging' || pending.phase === 'failed') throw Error(pending.failure || '上次 Fish 授权交换被中断，请重新连接');
    let reply = result;
    if (!reply) { try { reply = JSON.parse(storage.getItem(fishLoginKeys(state).result) || 'null'); } catch { reply = null; } }
    if (reply?.state !== state || !reply.code || reply.error) throw Error('没有收到这次 Fish 登录的有效授权码');
    if (reply.iss && reply.iss !== FISH_ISSUER) throw Error('Fish 登录来源不符，本次连接未保存');
    if (!pending.verifier || !pending.clientId || !pending.redirect) throw Error('这次 Fish 登录缺少待办信息，请重新连接');
    const keys = fishLoginKeys(state), working = {...pending, epoch, phase: 'exchanging'};
    storage.setItem(keys.pending, JSON.stringify(working));
    try {
      const credentials = await exchangeFishCode({code: reply.code, verifier: pending.verifier, clientId: pending.clientId, redirect: pending.redirect, scope, fetcher});
      const current = readFishPending(storage, state);
      if (!valid() || !current || current.state !== state || (current.scope || '') !== scope || (current.epoch ?? epoch) !== epoch || fishLoginEpoch(storage, scope) !== epoch) throw cancelled();
      storage.setItem(fishCredentialKey(scope), JSON.stringify({...credentials, login_state: state, login_epoch: epoch}));
      storage.removeItem(keys.pending); storage.removeItem(keys.result);
      fishTrace(storage, 'token-ok', state.slice(0, 6));
      return {connected: true};
    } catch (error) {
      // Only amend our still-live pending record; cancellation/supersession may
      // already have removed it, and another login's records are never touched.
      const current = readFishPending(storage, state);
      if (current && fishLoginEpoch(storage, scope) === epoch) storage.setItem(keys.pending, JSON.stringify({...current, phase: 'failed', failure: error.message}));
      throw error;
    }
  };
  const task = Promise.resolve().then(() => typeof locks?.request === 'function'
    ? locks.request('sttts.fishLogin.' + state, run) : run()).finally(() => { if (tasks.get(taskKey) === task) tasks.delete(taskKey); });
  tasks.set(taskKey, task);
  return task;
}
