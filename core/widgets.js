// 小组件 on the 今天 page (swipe right from the first home page, as on an iPhone): which there are, the sizes each
// comes in, and the list the user arranged. Pure: no DOM, no storage.
// A size is s (one square, two side by side), m (a full-width row) or l (a full-width square).

export const WIDGET_SIZES = Object.freeze(['s', 'm', 'l']);
export const SIZE_NAMES = Object.freeze({s: '小', m: '中', l: '大'});
/** name, what it shows (for the gallery), the sizes it comes in, and the app a tap opens (none: it only shows). */
export const WIDGETS = Object.freeze({
  calendar: {name: '日历', about: '今天的日期；大号显示这个月。', sizes: ['s', 'l'], app: ''},
  clock: {name: '时钟', about: '表盘；中号带上数字时间和日期。', sizes: ['s', 'm'], app: ''},
  playing: {name: '正在播放', about: '谁在说、正在读的这一句。点一下打开听取。', sizes: ['s', 'm'], app: 'listen'},
  chat: {name: '消息', about: '未读消息和最近的聊天，点一段直接打开。', sizes: ['s', 'm', 'l'], app: 'chat'},
  cast: {name: '角色', about: '登记过的角色，点头像打开 TA 的配音。', sizes: ['m', 'l'], app: 'roles'},
  photo: {name: '相册', about: '相册里的一张照片，每小时换一张。', sizes: ['s', 'm', 'l'], app: 'gallery'},
  notes: {name: '备忘录', about: '最近写的备忘录。', sizes: ['s', 'm'], app: 'notes'},
  battery: {name: '电池', about: '这台设备的电量（浏览器提供的时候）。', sizes: ['s', 'm'], app: ''},
  wallet: {name: '零钱', about: '聊天 App 钱包里还有多少零钱。', sizes: ['s'], app: 'chat'},
});
export const WIDGET_LIMIT = 24;
/** What the 今天 page shows before the user changes anything. */
export const DEFAULT_WIDGETS = Object.freeze([
  {id: 'w-calendar', kind: 'calendar', size: 's'}, {id: 'w-battery', kind: 'battery', size: 's'},
  {id: 'w-playing', kind: 'playing', size: 'm'}, {id: 'w-chat', kind: 'chat', size: 'm'},
  {id: 'w-photo', kind: 'photo', size: 's'}, {id: 'w-notes', kind: 'notes', size: 's'},
].map(Object.freeze));

/**
 * The user's list, kept to what can be shown: known kinds, a size each kind comes in (else its first), ids that are
 * there and unique, at most WIDGET_LIMIT. Anything that is not a list gives the default.
 */
export function normalizeWidgets(value) {
  if (!Array.isArray(value)) return DEFAULT_WIDGETS.map(w => ({...w}));
  const seen = new Set(), out = [];
  for (const item of value) {
    if (out.length >= WIDGET_LIMIT) break;
    const kind = item && typeof item === 'object' ? item.kind : null, meta = Object.hasOwn(WIDGETS, kind) ? WIDGETS[kind] : null;
    if (!meta) continue;
    let id = typeof item.id === 'string' && /^[\w-]{1,40}$/.test(item.id) ? item.id : '';
    for (let n = out.length; !id || seen.has(id); n++) id = `w-${kind}-${n}`;
    seen.add(id);
    out.push({id, kind, size: meta.sizes.includes(item.size) ? item.size : meta.sizes[0]});
  }
  return out;
}
/** A new widget of `kind` at `size`, with an id the list does not have yet. */
export function makeWidget(kind, size, list = [], random = Math.random) {
  const meta = WIDGETS[kind];
  if (!meta) throw Error('没有这个小组件');
  const taken = new Set(list.map(w => w.id));
  let id;
  do id = `w-${kind}-${Math.floor(random() * 1e8).toString(36)}`; while (taken.has(id));
  return {id, kind, size: meta.sizes.includes(size) ? size : meta.sizes[0]};
}
