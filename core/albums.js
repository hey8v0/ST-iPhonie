// 相册的分类: 收藏 and the 相簿 one makes. They only say which photos are in them (ids, the last one added first), apart from
// the pictures: a heart or a whole 相簿 moved writes no picture again, and 保存到酒馆 sends a line of text, not a file.
// Where a photo came from (绘图, 正文, 聊天 …) goes by its name, as pictures have always been named when they are made.

export const FAVORITES = 'albums:favorites';
export const ALBUM_LIMITS = Object.freeze({albums: 100, name: 30});
/** The photos the phone drew, told apart by the name they are given: [key, label, pattern]. */
export const DRAWN_SOURCES = Object.freeze([
  ['draw', '绘图 App', /^(?:NovelAI|GPT ?生图|ComfyUI)-\d+\.(?:png|jpe?g|webp)$/],
  ['chat', '正文图片', /^chat-\d+\.(?:png|jpe?g|webp)$/],
  ['peek', '查手机', /^查手机-.+-\d+\.(?:png|jpe?g|webp)$/],
  ['moments', '朋友圈', /^朋友圈-.+-\d+\.(?:png|jpe?g|webp)$/],
  ['assistant', '助手生图', /^assistant-\d+\.(?:png|jpe?g|webp)$/],
  ['chatapp', '聊天图片', /^聊天-.+-\d+\.(?:png|jpe?g|webp)$/],
  ['book', '绘本插图', /^绘本-.+-\d+\.(?:png|jpe?g|webp)$/],
]);
/** What the drawing app's tools make (放大, 去背景, 网格 …) is the drawing app's too, though 清除绘图 has never counted it. */
const FROM_DRAW = /^(?:NovelAI|GPT ?生图|ComfyUI)-/;
export const OWN_SOURCE = Object.freeze(['own', '自己导入的']);
/** Where a photo came from, by its name. */
export function sourceOf(name) {
  const text = String(name || '');
  return DRAWN_SOURCES.find(([, , pattern]) => pattern.test(text))?.[0] || (FROM_DRAW.test(text) ? 'draw' : OWN_SOURCE[0]);
}
/** The photos by where they came from, those with any: [{key, label, rows}], in the order of the table. */
export function photoSources(rows) {
  const by = new Map();
  for (const row of rows) { const key = sourceOf(row.name); if (!by.has(key)) by.set(key, []); by.get(key).push(row); }
  return [...DRAWN_SOURCES.map(([key, label]) => [key, label]), OWN_SOURCE].filter(([key]) => by.has(key)).map(([key, label]) => ({key, label, rows: by.get(key)}));
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/** The day a photo was kept, as a phone's album says it. */
export function dayLabel(time, now = Date.now()) {
  const day = new Date(time), today = new Date(now), start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime(), ago = Math.round((start - at) / 864e5);
  if (ago === 0) return '今天';
  if (ago === 1) return '昨天';
  if (ago > 1 && ago < 7) return WEEK[day.getDay()];
  return `${day.getFullYear() === today.getFullYear() ? '' : day.getFullYear() + '年'}${day.getMonth() + 1}月${day.getDate()}日`;
}
const timeOf = row => row.createdAt || row.updatedAt || 0;
/** The newest first (a photo made smaller or synced keeps when it was made). */
export const byNewest = rows => [...rows].sort((a, b) => timeOf(b) - timeOf(a));
/** Rows in the order given, under the day each was kept: [{label, rows}]. */
export function photoDays(rows, now = Date.now()) {
  const out = [];
  for (const row of rows) {
    const label = dayLabel(timeOf(row), now), last = out.at(-1);
    if (last?.label === label) last.rows.push(row); else out.push({label, rows: [row]});
  }
  return out;
}
/** A name for a 相簿: one line, not too long. Empty when there is nothing in it. */
export const albumName = value => [...String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()].slice(0, ALBUM_LIMITS.name).join('');
/** The 相簿 in order: 收藏 first, then as they were put; a photo that is gone (deleted on another device) is not counted. */
export function albumsInOrder(list, known = null) {
  const rows = known ? list.map(row => ({...row, photos: (row.photos || []).filter(id => known.has(id))})) : list.map(row => ({...row, photos: row.photos || []}));
  const place = row => row.id === FAVORITES ? -Infinity : Number.isFinite(row.order) ? row.order : row.at || 0;
  return rows.sort((a, b) => place(a) - place(b));
}
