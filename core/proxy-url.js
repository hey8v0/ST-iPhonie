// Same-origin SillyTavern CORS proxy, with an explicit HTTP(S) upstream.
export function proxyAddress(value) {
 const raw = String(value || '').trim();
 if (!raw.startsWith('/proxy/')) return null;
 const target = raw.slice(7);
 let url; try { url = new URL(target); } catch { throw Error('代理地址格式不对，例如 /proxy/https://example.com/v1'); }
 if (!/^https?:\/\//i.test(target) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || /\s/.test(target) || url.hash) throw Error('代理地址需要是 /proxy/http:// 或 /proxy/https:// 开头的网址');
 return raw;
}

/**
 * What a tavern with no /proxy/ answers (TauriTavern for now): its own page, or that it knows no such path. Told by what came back and
 * not by which tavern this is, so the day one has a proxy it simply works. A proxy passes on a service's own page too: that is not this.
 */
export function noTavernProxy(text, own = globalThis.document?.title) {
 const head = String(text ?? '').slice(0, 4000);
 if (/Unsupported endpoint/i.test(head)) return true;
 const title = /<title[^>]*>([^<]*)/i.exec(head)?.[1].trim();
 return !!title && (/^(SillyTavern|TauriTavern)\b/i.test(title) || title === own);
}

/**
 * What came back through the tavern's /proxy/: 'ok' (the service answered), 'off' (enableCorsProxy is false), 'missing'
 * (this tavern has none), 'down' (the tavern's own 500: it could not reach the service either).
 */
export async function proxyState(response) {
 const said = await response.clone().text().catch(() => '');
 if (/CORS proxy is disabled/i.test(said)) return 'off';
 if (noTavernProxy(said)) return 'missing';
 return response.status === 500 && /^(internal server error)?$/i.test(said.trim()) ? 'down' : 'ok';
}

/**
 * Whether the tavern asks the browser for a login (Basic: its own, or a cloud host's in front of it). A key sent through
 * its /proxy/ as Authorization takes the login's place, and the browser asks to log in. Asked without credentials, so
 * nothing pops up.
 */
export async function tavernLogin(fetcher, page = globalThis.location) {
 if (!page?.origin) return false;
 try { const r = await fetcher(page.origin + '/favicon.ico', {credentials: 'omit', cache: 'no-store', redirect: 'manual'}); return r.status === 401 || r.type === 'opaqueredirect'; }
 catch { return false; }
}

const LOOPBACK = /^(localhost|127(\.\d+){3}|\[::1\])$/i;
/**
 * Whether and how a service can be asked. direct(url, init): the browser's own request; proxy(url): through the tavern.
 * {via: 'direct' | 'proxy' | '', state: 'ok' | 'blocked' | 'mixed' | 'loopback' | 'down', proxy: 'on' | 'off' | 'missing' | 'login' | 'none'}
 * (off: the tavern can turn it on; missing: this tavern has none; login: a key may not go through it, proxy threw {login}.)
 */
export async function reachService(base, {direct, proxy, page = globalThis.location}) {
  const target = new URL(base), loop = LOOPBACK.test(target.hostname), mixed = page?.protocol === 'https:' && target.protocol === 'http:' && !loop;
  if (!mixed) { try { await direct(base); return {via: 'direct', state: 'ok', proxy: 'none'}; } catch { /* no answer it may read */ } }
  // An answer that may not be read still shows the service is there.
  let open = false;
  if (!mixed) { try { await direct(base, {mode: 'no-cors'}); open = true; } catch { /* not there, for this device */ } }
  let state = 'none';
  if (proxy) {
    try { const got = await proxyState(await proxy(base)); if (got === 'ok') return {via: 'proxy', state: 'ok', proxy: 'on'}; state = got === 'down' ? 'on' : got; }
    catch (error) { state = error?.login ? 'login' : 'off'; }
  }
  return {via: '', proxy: state, state: mixed ? 'mixed' : open ? 'blocked' : loop && !LOOPBACK.test(page?.hostname || 'localhost') ? 'loopback' : 'down'};
}

/** Tavern POST routes require its CSRF headers; never attach them to an upstream API. */
export function withProxyHeaders(send, tavernHeaders) {
 return (input, init = {}, ...rest) => {
  const raw = String(input);
  let sameProxy = raw.startsWith('/proxy/');
  if (!sameProxy && globalThis.location?.origin) { try { const url = new URL(raw); sameProxy = url.origin === globalThis.location.origin && url.pathname.startsWith('/proxy/'); } catch {} }
  if (!sameProxy) return send(input, init, ...rest);
  const headers = new Headers(init.headers);
  for (const [key, value] of new Headers(tavernHeaders?.()).entries()) if (!headers.has(key)) headers.set(key, value);
  // A tavern behind Basic login (common on cloud taverns) needs the browser's own Authorization on every request: a
  // Fish key sent there as Bearer took its place, so the tavern asked to log in again and again. Fish also reads its
  // key from api-key, so through the tavern it goes there and Authorization is left to the tavern.
  if (/^https?(:|%3A)(\/|%2F){2}api\.fish\.audio(\/|%2F|$)/i.test(raw.slice(raw.indexOf('/proxy/') + 7))) {
   const bearer = headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
   if (bearer) { headers.delete('Authorization'); headers.set('api-key', bearer); }
  }
  return send(input, {...init, credentials: 'same-origin', headers}, ...rest);
 };
}
