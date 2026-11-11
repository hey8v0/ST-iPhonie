// The callback may lose window.opener (mobile browsers / cross-origin isolation).
// A short-lived, state-bound mailbox on the tavern origin also carries the result.
export const FISH_LOGIN_TTL = 5 * 60 * 1000;
export const fishLoginKeys = state => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state || '')) throw Error('Fish 登录校验信息无效，请回酒馆重新连接');
  return {pending: 'sttts.fishLogin.pending.' + state, result: 'sttts.fishLogin.result.' + state};
};
export function acceptFishCallback(params, storage, now = Date.now()) {
  const state = params.get('state'), keys = fishLoginKeys(state);
  const pending = JSON.parse(storage.getItem(keys.pending) || 'null');
  if (!pending || pending.state !== state || !Number.isFinite(pending.at) || now < pending.at || now - pending.at > FISH_LOGIN_TTL) throw Error('这次 Fish 登录已过期，请返回酒馆重新连接');
  const iss = params.get('iss');
  if (iss && iss !== 'https://api.fish.audio') throw Error('Fish 登录来源不符，本次连接未保存');
  const result = {type: 'st-iphonie-fish-oauth', state, iss, code: params.get('code'), error: params.get('error')};
  if (!result.code && !result.error) throw Error('没有收到 Fish 授权结果，请返回酒馆重新连接');
  storage.setItem(keys.result, JSON.stringify(result));
  return result;
}
