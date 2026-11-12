import {tavernLogin, noTavernProxy, unauthorizedBack} from './proxy-url.js';
export const fishExternalHost = win => !!(win?.__TAURITAVERN__ || win?.__TAURI_RUNNING__ || win?.__TAURI__?.core?.invoke || win?.__TAURI_INTERNALS__);
// Native WebView origins (tauri:// and http://tauri.localhost) are rejected by
// Fish DCR. No listener is installed at this loopback address: after authorizing,
// the user pastes the full address back, and only the pending PKCE owner exchanges it.
export function fishLoginRedirect(win, original) {
  return fishExternalHost(win) ? 'http://127.0.0.1:14535/st-iphonie/fish-oauth' : original;
}
export async function openFishExternal(win, target) {
  const url = new URL(target);
  if (url.origin !== 'https://fish.audio' || url.pathname !== '/oauth/authorize') throw Error('Fish 授权网址无效');
  if (typeof win.__TAURI__?.core?.invoke === 'function') {
    await win.__TAURI__.core.invoke('plugin:opener|open_url', {url: url.href}); return;
  }
  // TT mobile intentionally returns null after opening the system browser.
  // Only open the actual HTTPS URL; about:blank is not an external link.
  win.open(url.href, '_blank', 'noopener,noreferrer');
}

/** OAuth must remain Bearer: the API-key proxy wrapper is not suitable here.
 * Never replace a Basic-login tavern's own Authorization with a Fish token. */
export function fishTavernProxy({fetcher, headers = () => ({}), page = globalThis.location} = {}) {
  return async (url, init) => {
    if (url !== 'https://api.fish.audio/mcp') throw Error('订阅转发只允许 Fish 官方 MCP');
    if (await tavernLogin(fetcher, page)) throw Error('当前酒馆有额外的登录认证，不能把 Fish Bearer 凭据交给通用转发；请使用可保留独立认证的连接方式');
    const h = new Headers(headers());
    if (h.has('Authorization')) throw Error('酒馆登录认证与 Fish 认证冲突，未发送订阅凭据');
    for (const [key,value] of new Headers(init.headers)) h.set(key,value);
    const r = await fetcher('/proxy/' + encodeURIComponent(url), {...init, credentials:'same-origin', redirect:'error', headers:h});
    const sample = await r.clone().text();
    if (/CORS proxy is disabled/i.test(sample)) throw Error('Fish 拒绝网页来源；请在酒馆 config.yaml 开启 enableCorsProxy 并重启，再读取订阅积分，无需重新登录');
    if (noTavernProxy(sample)) throw Error('当前酒馆没有可用的订阅转发通道；网页登录成功仍不足以调用 Fish MCP');
    return unauthorizedBack(r);
  };
}
