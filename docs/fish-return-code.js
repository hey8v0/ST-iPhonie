// Shared by the hosted, display-only return page and the tavern's OAuth flow.
export const FISH_RETURN_URL = 'https://hey8v0.github.io/ST-iPhonie/';
export function packFishCallback(result) {
  if (!result?.state || !result?.code) return '';
  const raw = JSON.stringify({state: result.state, code: result.code, ...(result.iss ? {iss: result.iss} : {})});
  return 'fish1.' + btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function readFishReturn(params) {
  for (const key of ['state', 'code', 'iss', 'error']) if (params.getAll(key).length > 1) throw Error('授权结果不完整，请回到发起连接的酒馆检查。');
  if (!/^[A-Za-z0-9_-]{43}$/.test(params.get('state') || '')) throw Error('没有收到有效的授权结果，请从酒馆的小手机发起连接。');
  const iss = params.get('iss');
  if (iss && iss !== 'https://api.fish.audio') throw Error('授权来源不符，请回到发起连接的酒馆检查。');
  if (params.has('error')) throw Error('Fish 没有授权此次连接，请回到酒馆。');
  const code = params.get('code');
  if (!code || code.length > 8192) throw Error('没有收到有效的授权码，请回到酒馆检查。');
  return {state: params.get('state'), code, ...(iss ? {iss} : {})};
}
