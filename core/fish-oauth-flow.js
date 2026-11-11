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
