import {fishExternalHost, fishRoutePreference} from './fish-transport.js';
import {noTavernProxy, tavernLogin} from './proxy-url.js';
import {fishTtAudio} from './fish-tt-audio.js';
// Only the official task CDN may be fetched by the server-side fallback. The
// audio GET carries neither Fish OAuth nor API credentials.
export function fishTaskAudio(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'platform.r2.fish.audio' && !u.port && !u.username && !u.password && !u.hash && /^\/tasks\/.+\.(?:mp3|wav|ogg|flac|m4a)$/i.test(u.pathname); } catch { return false; }
}
export function fishAudioProxy({fetcher, headers = () => ({}), page = globalThis.location}) {
  return async (url, signal) => {
    if (!fishTaskAudio(url)) throw Error('音频转发只允许 Fish 官方任务 CDN');
    const own = new Headers(headers());
    if (own.has('Authorization') || await tavernLogin(fetcher, page)) throw Error('Fish 已生成声音，但当前酒馆的额外登录认证不适合通用音频转发；为避免把登录认证发送到 CDN，本次没有转发');
    const safe = new Headers(); if (own.has('X-CSRF-Token')) safe.set('X-CSRF-Token', own.get('X-CSRF-Token'));
    return fetcher('/proxy/' + encodeURIComponent(url), {method:'GET',signal,credentials:'same-origin',redirect:'error',headers:safe});
  };
}
export function fishAudioDownload({fetcher, proxy, win = globalThis, storage = () => win.localStorage, scope = '', notice}) {
  const native=fishExternalHost(win)?fishTtAudio({win,allowed:fishTaskAudio,notice}):null;
  const preference=fishRoutePreference(storage,scope);
  const proxied=new WeakSet();
  let viaProxy=!!proxy && !fishExternalHost(win) && preference.get('audio');
  const download=async (url, signal) => {
    if(native && fishTaskAudio(url))return native.download(url,signal);
    if (viaProxy && fishTaskAudio(url)) {
      const r=await proxy(url,signal);
      if (!r.ok) throw Error(`Fish 已生成声音，但已选酒馆下载通道失败（${r.status}）；音频链接已保留，不会重新生成`);
      proxied.add(r);
      return r;
    }
    let direct;
    try {
      direct = await fetcher(url, {method:'GET', signal, credentials:'omit', referrerPolicy:'no-referrer'});
      if (direct.ok) return direct;
    } catch (error) { if (signal?.aborted || error.name === 'AbortError') throw error; }
    if (signal?.aborted) throw signal.reason || Error('音频下载已取消');
    if (!fishTaskAudio(url)) throw Error('Fish 已生成声音，但下载失败；该音频网址不能使用官方任务下载转发。请查看 Fish 记录，不要重新生成');
    if (fishExternalHost(win)) throw Error('Fish 已生成声音；TT 内置 MCP 已完成配音，但当前 TT 没有可用的 Fish 音频下载转发，浏览器也未能读取 CDN 文件。音频链接已保留，请到 Fish 下载或直接打开链接收听，不要重新生成');
    if (!proxy) throw Error('Fish 已生成声音，但下载失败；未提供酒馆下载转发。请到 Fish 下载，不要重新生成');
    const r = await proxy(url, signal);
    if (!r.ok) {
      const text = (await r.clone().text()).slice(0,4000);
      if (/CORS proxy is disabled/i.test(text)) throw Error('Fish 已生成声音；请开启酒馆 enableCorsProxy 并重启，再重试取回已有音频，不要重新生成');
      if (noTavernProxy(text)) throw Error('Fish 已生成声音，但当前酒馆没有音频下载转发；请到 Fish 下载，不要重新生成');
      throw Error(`Fish 已生成声音，但酒馆下载转发失败（${r.status}）；音频链接已保留，不要重新生成`);
    }
    proxied.add(r);
    return r;
  };
  download.confirm=response=>{if(proxied.has(response)){viaProxy=true;preference.remember('audio');}};
  download.prepare=signal=>native?.prepare(signal);
  return download;
}
