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
  if (!r.ok) throw Error(`Fish 连接失败（${r.status}），请重新连接订阅账户`);
  const token = await r.json();
  if (!token?.access_token) throw Error('Fish 没有返回有效登录凭据');
  return {...token, client_id: clientId, expires_at: now + Number(token.expires_in || 3600) * 1000, ...(scope ? {scope} : {})};
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
export function acceptFishCallback(params, storage, now = Date.now()) {
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
  storage.setItem(keys.result, JSON.stringify(result));
  return result;
}
