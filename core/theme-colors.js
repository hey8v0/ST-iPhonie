// 自定义主题: a set of the colours the phone is drawn with, day and night, made from a main colour or written by hand.
// Only colours: no style sheet comes in from outside, so a 配色 someone shares can change how the phone looks and nothing
// else. What must stay readable is checked by the same list the skins are held to (tests/theme-colors.test.mjs).

/** The colours of a set, by the name of their CSS token, as they are called on the page. */
export const THEME_TOKENS = Object.freeze({
  bg: '页面背景', card: '卡片', card2: '输入框和次要卡片', page: '外框', line: '分割线',
  ink: '主要文字', ink2: '次要文字', accent: '主色', 'accent-btn': '按钮', 'on-accent': '按钮上的字',
  'accent-ink': '强调文字', 'accent-soft': '强调的浅底', pink: '点缀', dot: '小圆点', danger: '删除', 'danger-soft': '删除的浅底'
});
/** What has to be readable on what, and how much: 4.5 for small text, 3 for what is big or bold. */
export const THEME_PAIRS = Object.freeze([
  ['ink', 'card', 7], ['ink', 'bg', 7], ['ink2', 'card', 4.5], ['ink2', 'card2', 4], ['accent-ink', 'card', 4.5], ['accent-ink', 'accent-soft', 3],
  ['on-accent', 'accent-btn', 3], ['danger', 'card', 3.5], ['danger', 'danger-soft', 3]
]);
/** One tap: main colour and how much of it the background takes. */
export const THEME_PRESETS = Object.freeze([
  {name: '樱粉', accent: '#e8638f', tint: .55}, {name: '蜜桃', accent: '#ef7f5a', tint: .5}, {name: '奶油', accent: '#c28f33', tint: .6}, {name: '抹茶', accent: '#6f9a3c', tint: .5},
  {name: '薄荷', accent: '#27a98a', tint: .5}, {name: '海盐', accent: '#2d8fc9', tint: .45}, {name: '薰衣草', accent: '#8a6fe0', tint: .55}, {name: '墨色', accent: '#4c5361', tint: .2}
]);
export const DEFAULT_THEME_SOURCE = Object.freeze({accent: '#e8638f', tint: .55});

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const HEX = /^#[0-9a-f]{6}$/i;
export const isThemeColor = value => typeof value === 'string' && HEX.test(value);
const toRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const toLinear = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
const fromLinear = v => 255 * (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055);

/** OKLCH: lightness that looks even across hues, so a set made from yellow is as readable as one made from blue. */
export function toOklch(hex) {
  const [r, g, b] = toRgb(hex).map(toLinear);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const L = .2104542553 * l + .793617785 * m - .0040720468 * s, a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, B = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return {l: L, c: Math.hypot(a, B), h: (Math.atan2(B, a) * 180 / Math.PI + 360) % 360};
}
function linearOf({l, c, h}) {
  const a = c * Math.cos(h * Math.PI / 180), b = c * Math.sin(h * Math.PI / 180);
  const L = (l + .3963377774 * a + .2158037573 * b) ** 3, M = (l - .1055613458 * a - .0638541728 * b) ** 3, S = (l - .0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * L - 3.3077115913 * M + .2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - .3413193965 * S, -.0041960863 * L - .7034186147 * M + 1.707614701 * S];
}
/** A colour back to #hex: as much of its chroma as the screen can show. */
export function fromOklch({l, c, h}) {
  const light = clamp(l);
  let low = 0, high = c;
  if (linearOf({l: light, c, h}).some(v => v < -.0001 || v > 1.0001)) {
    for (let i = 0; i < 18; i++) { const mid = (low + high) / 2; if (linearOf({l: light, c: mid, h}).some(v => v < -.0001 || v > 1.0001)) high = mid; else low = mid; }
    c = low;
  }
  return toHex(linearOf({l: light, c, h}).map(v => fromLinear(clamp(v))));
}
const luminance = hex => { const [r, g, b] = toRgb(hex).map(toLinear); return .2126 * r + .7152 * g + .0722 * b; };
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

/** The colour moved away from what it stands on until it reads on all of them: darker on light things, lighter on dark ones. */
export function readable(color, on, need) {
  const under = [].concat(on), meets = hex => under.every(bg => contrast(hex, bg) >= need);
  if (meets(color)) return color;
  const start = toOklch(color), dark = under.reduce((n, bg) => n + luminance(bg), 0) / under.length < .22;
  for (const way of dark ? [1, -1] : [-1, 1]) for (let l = start.l; l >= 0 && l <= 1; l += way * .01) { const hex = fromOklch({...start, l}); if (meets(hex)) return hex; }
  return dark ? '#ffffff' : '#000000';
}

function dayColors(main, pink, t) {
  const tone = (l, c) => fromOklch({l, c, h: main.h}), chroma = Math.min(main.c, .19);
  const card = tone(.995 - .006 * t, .003 + .007 * t), bg = tone(.975 - .03 * t, .008 + .032 * t), card2 = tone(.965 - .024 * t, .008 + .022 * t), page = tone(.945 - .045 * t, .015 + .05 * t);
  const soft = tone(.93 - .02 * t, Math.min(.055, chroma * .36)), btn = readable(fromOklch(main), '#ffffff', 3.6);
  const danger = readable('#c23a63', [card, '#ffe6ee'], 4.5);
  return {page, bg, card, card2, line: tone(.905 - .025 * t, .02 + .018 * t),
    ink: readable(tone(.27, .045), [card, bg, card2], 7.5), ink2: readable(tone(.47, .04), [card, card2, bg], 4.6),
    accent: fromOklch({...main, l: clamp(main.l, .55, .78)}), 'accent-btn': btn, 'on-accent': '#ffffff',
    'accent-ink': readable(fromOklch({l: .45, c: chroma * .9, h: main.h}), [card, soft, card2], 4.6), 'accent-soft': soft,
    pink: fromOklch({...pink, l: clamp(pink.l, .62, .8)}), dot: tone(.86, Math.min(.07, chroma * .4)), danger, 'danger-soft': '#ffe6ee'};
}
function nightColors(main, pink, t) {
  const tone = (l, c) => fromOklch({l, c, h: main.h}), chroma = Math.min(main.c, .16);
  const card = tone(.26, .022 + .03 * t), bg = tone(.205, .02 + .03 * t), card2 = tone(.3, .026 + .03 * t), soft = tone(.35, Math.min(.08, chroma * .5));
  const btn = fromOklch({l: Math.max(.74, main.l), c: chroma, h: main.h});
  return {page: tone(.17, .018 + .028 * t), bg, card, card2, line: tone(.37, .03 + .03 * t),
    ink: readable(tone(.955, .012), [card, bg, card2], 7.5), ink2: readable(tone(.8, .03), [card, card2, bg], 4.6),
    accent: fromOklch({l: Math.max(.78, main.l), c: chroma, h: main.h}), 'accent-btn': btn, 'on-accent': readable(tone(.17, .03), btn, 4.5),
    'accent-ink': readable(tone(.87, Math.min(.1, chroma)), [card, soft, card2], 4.6), 'accent-soft': soft,
    pink: fromOklch({l: Math.max(.8, pink.l), c: Math.min(pink.c, .13), h: pink.h}), dot: tone(.34, .04 + .02 * t), danger: readable('#ff9cb8', [card, '#46203a'], 4.5), 'danger-soft': '#46203a'};
}
/** The whole set from a main colour: {name, accent, tint (0..1, how much of it the background takes), pink, ownPink (it was chosen, not worked out), day, night}. */
export function deriveTheme({name = '', accent = DEFAULT_THEME_SOURCE.accent, tint = DEFAULT_THEME_SOURCE.tint, pink = '', ownPink = false} = {}) {
  const color = isThemeColor(accent) ? accent.toLowerCase() : DEFAULT_THEME_SOURCE.accent, main = toOklch(color), t = clamp(Number(tint) || 0);
  // Grey has no hue of its own: 点缀 stays quiet with it.
  const second = isThemeColor(pink) ? toOklch(pink) : {l: .74, c: main.c < .04 ? .04 : .13, h: (main.h + 140) % 360};
  return {name: String(name).slice(0, 40), accent: color, tint: t, pink: isThemeColor(pink) ? pink.toLowerCase() : fromOklch(second), ...(ownPink === true ? {ownPink: true} : {}), day: dayColors(main, second, t), night: nightColors(main, second, t)};
}
/** What is hard to read in one of the set's two sides: [{fg, bg, ratio, need}]. */
export const themeProblems = colors => THEME_PAIRS.filter(([fg, bg, need]) => contrast(colors[fg], colors[bg]) < need).map(([fg, bg, need]) => ({fg, bg, need, ratio: contrast(colors[fg], colors[bg])}));
/** One side with what is hard to read put right: only the words move, not what they stand on. */
export function fixColors(colors) {
  const out = {...colors};
  for (let round = 0; round < 3; round++) for (const [fg, bg, need] of THEME_PAIRS) out[fg] = readable(out[fg], [out[bg], ...THEME_PAIRS.filter(p => p[0] === fg && p[1] !== bg && contrast(out[fg], out[p[1]]) < p[2]).map(p => out[p[1]])], need);
  return out;
}
/**
 * A set from anywhere (the phone's own settings, a file): only the colours it should have and that are colours; what is
 * missing comes from its main colour. Null when it is not a set at all.
 */
export function cleanTheme(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const made = deriveTheme({name: value.name, accent: value.accent, tint: value.tint, pink: value.pink, ownPink: value.ownPink});
  const side = (given, base) => Object.fromEntries(Object.keys(THEME_TOKENS).map(key => [key, isThemeColor(given?.[key]) ? given[key].toLowerCase() : base[key]]));
  return {...made, day: side(value.day, made.day), night: side(value.night, made.night)};
}
const shadowOf = (colors, dark) => { if (dark) return '0 12px 28px -12px rgba(0,0,0,.7)'; const [r, g, b] = toRgb(colors['accent-btn']); return `0 12px 28px -12px rgba(${r},${g},${b},.34)`; };
/** The style sheet of a set. Everything in it has been checked to be a colour by cleanTheme. */
export function themeCSS(theme) {
  const block = (colors, dark) => [...Object.keys(THEME_TOKENS).map(key => `--${key}:${colors[key]}`), `--shadow:${shadowOf(colors, dark)}`, `--on-danger:${contrast('#ffffff', colors.danger) >= 4 ? '#fff' : readable(colors['danger-soft'], colors.danger, 4)}`].join(';');
  return `:root[data-skin=custom]{${block(theme.day, false)}}:root[data-skin=custom][data-theme=dark]{${block(theme.night, true)}}`;
}
/** The set in use, as a style sheet of its own in the phone's document (none: taken away). */
export function paintTheme(doc, theme) {
  const text = theme ? themeCSS(theme) : '';
  let el = doc.getElementById('custom-theme');
  if (!el) { if (!text) return; el = doc.createElement('style'); el.id = 'custom-theme'; doc.head.append(el); }
  if (el.textContent !== text) el.textContent = text;
}
/** A colour's place on the colour wheel, for what is tinted with hsl(). */
export function wheelHue(hex) {
  const [r, g, b] = toRgb(hex), max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  return d ? Math.round((60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4)) % 360) : 0;
}
/** A 配色 as a file to share. */
export const themeFile = theme => JSON.stringify({app: 'ST-iPhonie', kind: 'theme', version: 1, ...theme}, null, 2);
/** A file back: {theme, fixed: how many colours had to change to be readable}. Throws a plain message for anything else. */
export function readThemeFile(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw Error('这不是配色文件（读不出内容）'); }
  if (parsed?.app !== 'ST-iPhonie' || parsed.kind !== 'theme') throw Error('这不是小手机的配色文件');
  return readableTheme(cleanTheme(parsed));
}
/** A set from someone else, with what is hard to read put right: {theme, fixed: how many colours had to change}. */
export function readableTheme(theme) {
  const day = fixColors(theme.day), night = fixColors(theme.night);
  const changed = Object.keys(THEME_TOKENS).filter(key => day[key] !== theme.day[key]).length + Object.keys(THEME_TOKENS).filter(key => night[key] !== theme.night[key]).length;
  return {theme: {...theme, day, night}, fixed: changed};
}
/**
 * The main colour of a picture ([r, g, b, a, …] of a small copy of it): the hue most of its lively pixels have, as they
 * look on average; and a second one for 点缀, far enough from the first. Null when it is all grey.
 */
export function pictureColors(pixels) {
  const bins = Array.from({length: 24}, () => ({weight: 0, r: 0, g: 0, b: 0}));
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (pixels[i + 3] < 128) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 36 || max < 60 || min > 225) continue;
    const hue = 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4), weight = d / 255, bin = bins[Math.floor(hue / 15) % 24];
    bin.weight += weight; bin.r += r * weight; bin.g += g * weight; bin.b += b * weight;
  }
  const hexOf = bin => toHex([bin.r / bin.weight, bin.g / bin.weight, bin.b / bin.weight]);
  const ranked = bins.map((bin, i) => ({bin, i})).filter(x => x.bin.weight > 0).sort((a, b) => b.bin.weight - a.bin.weight);
  if (!ranked.length) return null;
  const apart = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 24 - d); }, second = ranked.find(x => apart(x.i, ranked[0].i) >= 4);
  return {accent: hexOf(ranked[0].bin), ...(second ? {pink: hexOf(second.bin)} : {})};
}
