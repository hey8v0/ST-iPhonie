// Go Music (0.9.28): the user's own go-music-api (an open-source music backend they run on their computer or in
// Termux) as a music source of its own kind. One search spans the platforms it knows (网易云, QQ 音乐,
// 酷狗…), so a song is its platform, its id there and the platform's own fields (extra); it plays through the backend's
// /stream (which deals with each platform's referer), its lyrics come from /lyric, and when a platform will not give a
// song the backend finds it on another one (/switch). The logins (扫码 or a pasted Cookie) are kept by the backend: the
// phone sends a Cookie on to it and asks which platforms are logged in, never keeping or showing one.
// No address ships here: the user types where their backend is. No DOM here.

export const GO_MUSIC = 'go-music';
/** The platforms by the backend's own names, as the phone calls them. */
export const GO_PLATFORMS = Object.freeze({netease: '网易云', qq: 'QQ 音乐', kugou: '酷狗', kuwo: '酷我', migu: '咪咕', qianqian: '千千', soda: '汽水音乐', fivesing: '5sing', jamendo: 'Jamendo', joox: 'JOOX', bilibili: 'B 站'});
/** The logins: by QR code (qq_wx: QQ 音乐 through WeChat, kept as qq) and by a Cookie pasted; soda only takes a Cookie. */
export const GO_LOGINS = Object.freeze([
  {id: 'netease', name: '网易云', qr: ['netease']},
  {id: 'qq', name: 'QQ 音乐', qr: ['qq', 'qq_wx']},
  {id: 'kugou', name: '酷狗', qr: ['kugou']},
  {id: 'bilibili', name: 'B 站', qr: ['bilibili']},
  {id: 'soda', name: '汽水音乐', qr: []}
]);
export const GO_QR_NAMES = Object.freeze({netease: '用网易云音乐扫', qq: '用 QQ 扫', qq_wx: '用微信扫', kugou: '用酷狗音乐扫', bilibili: '用哔哩哔哩扫'});
/** The platforms whose own playlists (我喜欢, made, kept) the backend reads once logged in. */
export const GO_ACCOUNT_LISTS = Object.freeze(['qq', 'netease', 'kugou']);
export const GO_LIMITS = Object.freeze({songs: 1000, lists: 200});
export const isGoMusic = source => source?.kind === GO_MUSIC;

const clip = (value, max) => String(value ?? '').slice(0, max);
/** The address as kept: http(s), without a trailing slash or the /api/v1 (or /swagger…) part someone pasted with it. */
export function goBase(value) {
  const text = clip(value, 300).trim().replace(/[#?].*$/, '').replace(/\/+$/, '').replace(/\/(?:api\/v1|swagger)(?:\/.*)?$/i, '').replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+/i.test(text) ? text : '';
}
const query = params => Object.entries(params).flatMap(([k, v]) => v === undefined || v === null || v === '' ? [] : (Array.isArray(v) ? v : [v]).map(x => `${k}=${encodeURIComponent(x)}`)).join('&');
/** An address of the backend: its REST API under /api/v1. */
export function goUrl(base, path, params = {}) { const q = query(params); return `${goBase(base)}/api/v1/${path}${q ? '?' + q : ''}`; }

/** A song as one id the phone keeps (歌单, 正文点的歌, backups and sync carry it as it is): its platform, its id there, the
 *  platform's own fields and its length — what the backend needs to play it again. An album or a playlist the same. */
export function goId(item) {
  const extra = item?.extra && typeof item.extra === 'object' && !Array.isArray(item.extra) && Object.keys(item.extra).length ? item.extra : null;
  return JSON.stringify({p: clip(item?.source, 30), i: clip(item?.id, 200), ...(extra ? {e: extra} : {}), ...(Number(item?.duration) > 0 ? {d: Math.round(Number(item.duration))} : {})});
}
export function readGoId(id) {
  try {
    const v = JSON.parse(String(id));
    if (v && typeof v.p === 'string' && v.p && typeof v.i === 'string' && v.i) return {platform: v.p, id: v.i, extra: v.e && typeof v.e === 'object' && !Array.isArray(v.e) ? v.e : null, duration: Number(v.d) > 0 ? Number(v.d) : 0};
  } catch { /* not one of ours */ }
  return null;
}
/** What the backend wants to find a song again: id, platform, its name and singer (for the file and for /switch), its
 *  length and its fields (as JSON). */
export function goSongParams(song, hint = {}) {
  return {id: song.id, source: song.platform, name: hint.title || '', artist: hint.artist || '', duration: song.duration || '', extra: song.extra ? JSON.stringify(song.extra) : ''};
}

/** The data of a {code, msg, data} answer; a code other than 200 says why. */
export function goData(json) {
  if (json && typeof json === 'object' && !Array.isArray(json) && 'code' in json) {
    if (Number(json.code) !== 200) throw Error(clip(json.msg || `后端回答 ${json.code}`, 200));
    return json.data;
  }
  return json;
}
const platformName = id => GO_PLATFORMS[id] || clip(id, 30);
/** Songs of an answer as the music app lists them (the platform as where it was found). */
export function goSongs(source, list, max = GO_LIMITS.songs) {
  return (Array.isArray(list) ? list : []).filter(x => x && x.id !== undefined && x.id !== '' && String(x.name || '').trim()).slice(0, max).map(x => ({
    source: source.id, sourceName: platformName(x.source), id: goId(x), title: clip(x.name, 200).trim(), artist: clip(x.artist, 200).trim(), platform: clip(x.source, 30)
  }));
}
/** Albums or playlists of an answer as the music app lists them. */
export function goGroups(source, list, kind) {
  return (Array.isArray(list) ? list : []).filter(x => x && x.id !== undefined && x.id !== '' && String(x.name || '').trim()).slice(0, GO_LIMITS.lists).map(x => ({
    source: source.id, sourceName: platformName(x.source), kind, id: goId({source: x.source, id: String(x.id), extra: x.extra}), name: clip(x.name, 200).trim(),
    artist: clip(x.creator || x.artist || '', 200).trim(), count: Number(x.track_count) || 0, platform: clip(x.source, 30)
  }));
}
/** 歌单分类: [{platform, name, categories: [{id, name, group}]}], a platform that has none left out. */
export function goCategories(list) {
  return (Array.isArray(list) ? list : []).filter(x => x && Array.isArray(x.categories) && x.categories.length).map(x => ({
    platform: clip(x.source, 30), name: platformName(x.source),
    categories: x.categories.filter(c => c && c.id !== undefined && String(c.name || '').trim()).slice(0, 300).map(c => ({id: clip(c.id, 100), name: clip(c.name, 40).trim(), group: clip(c.group, 40).trim()}))
  }));
}
/** A QR login started: the platform's own picture when it gives one (a data: image), else the link to draw. */
export function goQrSession(data) {
  const image = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(String(data?.image_url || '')) ? String(data.image_url) : '';
  return {key: clip(data?.key, 500), url: clip(data?.url, 2000), image, expiresAt: Number(data?.expires_at) || 0};
}
/** Where a QR login is: waiting, scanned, success, expired or failed (with the platform's words); never the Cookie. */
export function goQrState(data) {
  const status = ['waiting', 'scanned', 'success', 'expired', 'failed'].includes(data?.status) ? data.status : 'waiting';
  return {status, message: clip(data?.message, 200)};
}
/** Which platforms the backend holds a Cookie for: {qq: true, …} (the Cookies themselves are not kept). */
export const goLogins = map => Object.fromEntries(Object.entries(map && typeof map === 'object' ? map : {}).filter(([k]) => /^[a-z_]{2,20}$/.test(k)).map(([k, v]) => [k, !!String(v ?? '').trim()]));
