// 备忘录 × 聊天 (0.9.35): when a reminder is due, from the words a contact wrote (「明天 08:00」「今晚九点半」「30 分钟后」
// 「周五下午三点」). No DOM or network here.

const DIGIT = {零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9};
/** 「十二」「二十三」「两」「8」 as a number; NaN when it is none. */
export function chineseNumber(text) {
  const s = String(text ?? '').trim();
  if (/^\d+$/.test(s)) return Number(s);
  if (!s || !/^[零〇一二两三四五六七八九十]+$/.test(s)) return NaN;
  const at = s.indexOf('十');
  if (at < 0) return s.length === 1 ? DIGIT[s] : NaN;
  const tens = at === 0 ? 1 : DIGIT[s.slice(0, at)], ones = s.slice(at + 1) ? DIGIT[s.slice(at + 1)] : 0;
  return tens * 10 + ones;
}
const NUM = '[0-9零〇一二两三四五六七八九十]+';
const WEEK = '日天一二三四五六';
const PARTS = [[/凌晨/, 'dawn'], [/早上|早晨|清早|明早|今早|一早/, 'morning'], [/上午/, 'am'], [/中午/, 'noon'], [/下午/, 'pm'], [/傍晚/, 'dusk'], [/晚上|今晚|明晚|夜里|晚/, 'night']];
// The hour a day word alone means, and how an hour reads with it (下午 3 点 is 15:00, 晚上 8 点 20:00, 凌晨 2 点 2:00).
const DEFAULT_HOUR = {dawn: 6, morning: 8, am: 10, noon: 12, pm: 15, dusk: 18, night: 20, '': 9};
const withPart = (h, part) => (['pm', 'dusk', 'night'].includes(part) && h < 12) ? h + 12 : part === 'noon' && h < 11 ? h + 12 : h;
const HOUR = 3_600_000, DAY = 86_400_000;

/**
 * When `words` (a time said in Chinese) is, after `now`: a time in ms, or 0 when the words say no time. A time of day
 * already gone today (with no day said) is the evening's when that is still ahead (「8 点」 at three in the afternoon),
 * else tomorrow's.
 */
export function remindAt(words, now = Date.now()) {
  const s = String(words ?? '').replace(/\s+/g, '').replace(/：/g, ':');
  if (!s) return 0;
  // 「30 分钟后」「半小时后」「两个小时以后」「3 天后」「一个半小时后」
  let m = s.match(new RegExp(`(${NUM})个半小时(?:以?后|之后)`));
  if (m) { const n = chineseNumber(m[1]); return n > 0 && n <= 100 ? Math.round(now + (n + .5) * HOUR) : 0; }
  m = s.match(new RegExp(`(${NUM}|半)个?(分钟|小时|钟头|天)(?:以?后|之后)`));
  if (m) {
    const n = m[1] === '半' ? .5 : chineseNumber(m[1]), unit = {分钟: 60_000, 小时: HOUR, 钟头: HOUR, 天: DAY}[m[2]];
    return n > 0 && n <= 1000 ? Math.round(now + n * unit) : 0;
  }
  if (/^(?:等会儿?|待会儿?|一会儿?)/.test(s) && !/[点时:]/.test(s)) return now + 30 * 60_000;
  const base = new Date(now);
  let day = null;
  if (/大后天/.test(s)) day = 3; else if (/后天/.test(s)) day = 2; else if (/明天|明早|明晚|明日/.test(s)) day = 1; else if (/今天|今晚|今早|今日/.test(s)) day = 0;
  // 「周五」 (the next one, today included) 「下周一」 (in the week after this one, weeks from Monday) 「星期天」
  m = s.match(new RegExp(`(下下|下)?(?:周|星期|礼拜)([${WEEK}])`));
  if (m && day === null) {
    const want = WEEK.indexOf(m[2]) <= 1 ? 0 : WEEK.indexOf(m[2]) - 1, today = base.getDay();
    day = m[1] ? 7 - (today + 6) % 7 + (want + 6) % 7 + (m[1] === '下下' ? 7 : 0) : (want - today + 7) % 7;
  }
  const part = PARTS.find(([re]) => re.test(s))?.[1] || '';
  // 「08:00」「8点半」「九点十五」「20 点」
  let hour = NaN, minute = 0;
  m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) { hour = Number(m[1]); minute = Number(m[2]); }
  else if ((m = s.match(new RegExp(`(${NUM})[点时](半|一刻|三刻|(${NUM})分?)?`)))) {
    hour = chineseNumber(m[1]);
    minute = m[2] === '半' ? 30 : m[2] === '一刻' ? 15 : m[2] === '三刻' ? 45 : m[3] ? chineseNumber(m[3]) : 0;
  }
  if (Number.isNaN(hour) && day === null && !part) return 0;
  const bare = !Number.isNaN(hour) && !part;
  hour = Number.isNaN(hour) ? DEFAULT_HOUR[part] : withPart(hour, part);
  if (!(hour >= 0 && hour <= 24 && minute >= 0 && minute < 60)) return 0;
  const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (day || 0), hour, minute, 0, 0).getTime();
  if (day !== null || at > now) return at;
  // No day said, and that time is gone today: 「8 点」 at 15:00 is 20:00; else it is tomorrow's.
  if (bare && hour < 12 && at + 12 * HOUR > now) return at + 12 * HOUR;
  return at + DAY;
}

/** A reminder's time as the phone shows it: 今天 20:00, 明天 08:00, 11月8日 09:30. */
export function remindLabel(at, now = Date.now()) {
  const d = new Date(at), pad = n => String(n).padStart(2, '0'), clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = t => { const x = new Date(t); return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
  const diff = Math.round((day(at) - day(now)) / DAY);
  return diff === 0 ? `今天 ${clock}` : diff === 1 ? `明天 ${clock}` : diff === 2 ? `后天 ${clock}` : `${d.getMonth() + 1}月${d.getDate()}日 ${clock}`;
}
