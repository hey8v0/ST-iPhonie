// 绘本的小装饰: little drawings stuck on a picture book's pages (in place of emoji): stars, hearts, flowers, a moon,
// leaves, clouds, a bow … each a few strokes in the book's own colours (--o1, --o2, set where they are placed), with a
// white sticker edge drawn by the page's styles around whatever shape it is.

const F = (d, c = 1, extra = '') => `<path d="${d}" style="fill:var(--o${c})"${extra}/>`;
const S = (d, c = 1, w = 5) => `<path d="${d}" style="fill:none;stroke:var(--o${c});stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"/>`;
const C = (x, y, r, c = 1) => `<circle cx="${x}" cy="${y}" r="${r}" style="fill:var(--o${c})"/>`;
const W = (d, o = .55) => `<path d="${d}" style="fill:#fff;opacity:${o}"/>`;

/** The drawings: {label, svg} (the inside of a 64 × 64 picture). */
export const ORNAMENTS = Object.freeze({
  star: {label: '星星', svg: F('M32 5 L39.6 22.6 L58.6 24.3 L44.2 36.9 L48.5 55.6 L32 45.8 L15.5 55.6 L19.8 36.9 L5.4 24.3 L24.4 22.6 Z') + W('M30 15 L34 24 L27 25 Z')},
  sparkle: {label: '闪光', svg: F('M30 4 C32 22 40 30 58 32 C40 34 32 42 30 60 C28 42 20 34 2 32 C20 30 28 22 30 4 Z') + F('M52 4 C53 10 56 13 62 14 C56 15 53 18 52 24 C51 18 48 15 42 14 C48 13 51 10 52 4 Z', 2)},
  heart: {label: '爱心', svg: F('M32 57 C12 43 4 31 7 20 C10 9 25 6 32 19 C39 6 54 9 57 20 C60 31 52 43 32 57 Z') + W('M15 17 C17 13 22 12 24 15 C20 15 17 18 16 22 Z', .6)},
  moon: {label: '月亮', svg: F('M42 5 A27 27 0 1 0 59 45 A21 21 0 1 1 42 5 Z') + C(48, 22, 2.4, 2) + C(54, 33, 1.6, 2)},
  sun: {label: '太阳', svg: S('M32 3 V11 M32 53 V61 M3 32 H11 M53 32 H61 M11.5 11.5 L17 17 M47 47 L52.5 52.5 M11.5 52.5 L17 47 M47 17 L52.5 11.5', 1, 4.5) + C(32, 32, 14) + W('M24 26 A10 10 0 0 1 31 20 A12 12 0 0 0 25 30 Z')},
  flower: {label: '花', svg: C(32, 15, 11) + C(48, 27, 11) + C(42, 46, 11) + C(22, 46, 11) + C(16, 27, 11) + C(32, 32, 8, 2)},
  leaf: {label: '叶子', svg: F('M8 56 C8 27 29 8 57 7 C57 35 37 56 8 56 Z') + S('M12 52 C24 40 36 28 50 14', 2, 3)},
  cloud: {label: '云', svg: F('M15 47 C5 47 4 32 15 31 C15 18 32 14 37 25 C42 16 58 19 55 32 C63 34 61 47 50 47 Z') + W('M17 35 C18 28 25 26 29 29 C24 29 20 31 19 36 Z', .6)},
  snow: {label: '雪花', svg: S('M32 6 V58 M9.5 19 L54.5 45 M9.5 45 L54.5 19 M32 14 L26 9 M32 14 L38 9 M32 50 L26 55 M32 50 L38 55 M16 23 L10 27 M48 41 L54 37 M16 41 L10 37 M48 23 L54 27', 1, 4.5)},
  drop: {label: '水滴', svg: F('M32 5 C32 5 13 30 13 41 C13 51 22 59 32 59 C42 59 51 51 51 41 C51 30 32 5 32 5 Z') + W('M22 40 C22 34 26 29 29 26 C27 32 26 37 27 43 Z', .6)},
  note: {label: '音符', svg: F('M20 46 C12 46 8 52 12 56 C16 60 26 58 28 50 V20 L50 14 V40 C42 39 38 45 42 49 C46 53 54 51 56 44 V6 L22 14 V46 Z')},
  swirl: {label: '旋涡', svg: S('M33 33 C33 29 39 29 39 34 C39 41 28 42 26 34 C24 24 38 19 45 26 C53 34 47 50 33 51 C17 52 9 37 15 25 C20 15 32 10 43 13', 1, 4.5)},
  ribbon: {label: '蝴蝶结', svg: F('M32 30 C24 16 8 14 8 24 C8 34 22 36 32 32 Z') + F('M32 30 C40 16 56 14 56 24 C56 34 42 36 32 32 Z') + F('M29 33 L20 56 L26 52 L30 58 L33 34 Z M35 33 L44 56 L38 52 L34 58 L31 34 Z', 2) + C(32, 31, 5.5, 2)},
  key: {label: '钥匙', svg: S('M27 27 L54 54 M46 46 L52 40 M51 51 L57 45', 1, 5) + `<circle cx="19" cy="19" r="11" style="fill:none;stroke:var(--o1);stroke-width:6"/>` + C(19, 19, 3.5, 2)},
  feather: {label: '羽毛', svg: F('M54 6 C30 8 14 24 12 50 L20 44 C34 42 48 30 54 6 Z') + S('M8 58 L40 22', 2, 3)},
  bolt: {label: '闪电', svg: F('M38 3 L13 36 L30 36 L23 61 L51 24 L34 24 Z') + W('M34 9 L20 30 L27 30 Z', .5)},
  flame: {label: '火焰', svg: F('M32 4 C41 18 51 25 49 40 C47 52 39 59 32 59 C23 59 15 52 15 40 C15 30 23 25 25 14 C30 22 33 20 32 4 Z') + F('M32 30 C36 37 41 41 39 48 C38 54 35 56 32 56 C28 56 25 53 25 48 C25 43 29 41 30 35 C32 39 33 37 32 30 Z', 2)},
  wave: {label: '波浪', svg: S('M4 26 C12 18 18 18 24 26 C30 34 36 34 42 26 C48 18 54 18 60 26', 1, 5) + S('M4 42 C12 34 18 34 24 42 C30 50 36 50 42 42 C48 34 54 34 60 42', 2, 5)},
  crown: {label: '王冠', svg: F('M8 48 L11 18 L24 32 L32 12 L40 32 L53 18 L56 48 Z') + F('M8 50 H56 V57 H8 Z', 2) + C(32, 12, 3.5, 2) + C(11, 18, 3, 2) + C(53, 18, 3, 2)},
  pencil: {label: '铅笔', svg: F('M44 8 L56 20 L22 54 L10 42 Z') + F('M10 42 L22 54 L6 58 Z', 2) + F('M44 8 L50 2 L62 14 L56 20 Z', 2)},
  butterfly: {label: '蝴蝶', svg: F('M31 30 C22 10 4 8 6 22 C8 32 18 34 31 32 Z') + F('M33 30 C42 10 60 8 58 22 C56 32 46 34 33 32 Z') + F('M31 34 C20 36 12 46 18 52 C24 56 30 46 31 36 Z', 2) + F('M33 34 C44 36 52 46 46 52 C40 56 34 46 33 36 Z', 2) + S('M32 24 V48', 1, 3)},
  cat: {label: '猫爪', svg: C(32, 42, 12) + C(15, 26, 6) + C(25, 15, 6) + C(39, 15, 6) + C(49, 26, 6)},
});
export const ORNAMENT_IDS = Object.freeze(Object.keys(ORNAMENTS));
/** A drawing as markup (an empty string for one that is not there). */
export const ornamentSvg = id => ORNAMENTS[id] ? `<svg viewBox="0 0 64 64" aria-hidden="true">${ORNAMENTS[id].svg}</svg>` : '';
