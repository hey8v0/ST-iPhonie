// Built-in wallpapers. Keys come from the backend's phoneCatalog.wallpapers.
//   clock: stroke (white outlined clock) | glow (light clock with a glow)
//   night: variant used when the phone runs in dark mode
//   size / pos: per-layer background-size / background-position lists (default auto / center)
const clouds = 'radial-gradient(55% 12% at 22% 76%,#fff 0,#fff0 70%),radial-gradient(45% 10% at 78% 70%,#ffffffee 0,#fff0 70%),radial-gradient(70% 14% at 55% 88%,#fff 0,#fff0 70%)';
const stars = 'radial-gradient(1.5px 1.5px at 18px 26px,#fff,#fff0),radial-gradient(1px 1px at 92px 70px,#ffffffcc,#fff0),radial-gradient(1.2px 1.2px at 140px 18px,#fff,#fff0),radial-gradient(1px 1px at 60px 130px,#ffffffaa,#fff0),radial-gradient(1.6px 1.6px at 120px 150px,#fff,#fff0)';
const starSize = '170px 170px,170px 170px,170px 170px,170px 170px,170px 170px';

// Soap bubbles for the Aero wallpaper: a faint body with a bright rim.
const bubble = (r, x, y) => `radial-gradient(circle ${r}px at ${x} ${y},#ffffff14 0 62%,#ffffffcc 80%,#ffffff33 90%,#fff0 100%)`;
const bubbles = [bubble(34, '78%', '20%'), bubble(18, '66%', '30%'), bubble(12, '86%', '34%'), bubble(22, '14%', '46%'), bubble(9, '24%', '38%'), bubble(14, '58%', '52%')].join(',');
const night = {
  ink: '#fff', clock: 'glow', stroke: '#9cc8ff', halo: '#000', motion: 'stars',
  background: `${stars},radial-gradient(60% 30% at 80% 100%,#ff9cc055 0,#fff0 70%),linear-gradient(180deg,#0c1030 0%,#1f2462 48%,#4b3f86 82%,#7a5a92 100%)`,
  size: `${starSize},auto,auto`
};

export const wallpapers = {
  sky: {
    name: '晴空', ink: '#1d3358', clock: 'stroke', stroke: '#3a8ee0', shadow: '#2f78c4', halo: '#fff', motion: 'clouds', night,
    background: `${clouds},radial-gradient(40% 25% at 85% 12%,#ffffff55 0,#fff0 70%),linear-gradient(180deg,#4aa6f0 0%,#86ccff 36%,#cfeaff 60%,#fff3ee 100%)`
  },
  silver: {
    name: '月白', ink: '#2c3350', clock: 'stroke', stroke: '#8a8fd6', shadow: '#6d70b8', halo: '#fff', motion: 'clouds',
    background: `${clouds},linear-gradient(180deg,#b9bff0 0%,#dcdcfb 40%,#f4f1ff 70%,#fffaf6 100%)`
  },
  midnight: {name: '星夜', ...night},
  rose: {
    name: '樱色', ink: '#5a2a44', clock: 'stroke', stroke: '#e2638f', shadow: '#c24a78', halo: '#fff', motion: 'petals',
    background: `${clouds},radial-gradient(40% 25% at 15% 12%,#ffffff66 0,#fff0 70%),linear-gradient(180deg,#ff9fc0 0%,#ffc4d8 38%,#ffe5ee 64%,#fff8f0 100%)`
  },
  sand: {
    name: '暮霞', ink: '#fff', clock: 'stroke', stroke: '#d0703e', shadow: '#a5552d', halo: '#7a3b2a',
    background: `radial-gradient(60% 18% at 30% 80%,#ffe0b866 0,#fff0 70%),linear-gradient(180deg,#5b5bb8 0%,#b37ab5 38%,#f39a86 66%,#ffd3a0 100%)`
  },
  // Skin wallpapers: each skin switches to its own wallpaper while a built-in one is in use.
  aero: {
    name: '水感晴空', ink: '#08354d', clock: 'stroke', stroke: '#1592d0', shadow: '#0c6fa3', halo: '#fff', motion: 'bubbles',
    background: `${bubbles},conic-gradient(from 196deg at 12% -4%,#fff0 0deg,#ffffff38 5deg,#fff0 10deg,#ffffff2a 17deg,#fff0 22deg,#ffffff22 30deg,#fff0 36deg),radial-gradient(120% 34% at 22% 104%,#63c93c 0 48%,#63c93c00 49.5%),radial-gradient(95% 30% at 88% 104%,#3fae2e 0 48%,#3fae2e00 49.5%),radial-gradient(70% 22% at 55% 100%,#9be36a 0 46%,#9be36a00 48%),linear-gradient(180deg,#0b93d8 0%,#4cc3f6 34%,#bdeeff 62%,#e6fbd8 80%,#8fdc68 100%)`,
    night: {
      ink: '#e6fbff', clock: 'glow', stroke: '#52d6ff', halo: '#021a26', motion: 'aurora',
      background: `${bubbles},radial-gradient(80% 26% at 30% 34%,#39f0c455 0,#39f0c400 70%),radial-gradient(70% 20% at 75% 26%,#3a8cff44 0,#3a8cff00 70%),radial-gradient(120% 34% at 22% 104%,#0f5a3a 0 48%,#0f5a3a00 49.5%),radial-gradient(95% 30% at 88% 104%,#0b4630 0 48%,#0b463000 49.5%),linear-gradient(180deg,#021526 0%,#063a5c 45%,#0a6178 75%,#0d4a45 100%)`
    }
  },
  // Watercolour hills under a pale sun; at night a crescent moon over dark meadows. Soft edges read as washes.
  fresh: {
    name: '青草信笺', ink: '#3b4740', clock: 'glow', stroke: '#ffffff', halo: '#fff', motion: 'leaves',
    background: `radial-gradient(circle 21px at 84% 10%,#f8c9b4 0 90%,#f8c9b400 100%),radial-gradient(circle 46px at 84% 10%,#fff4e4 0 40%,#fff4e400 100%),radial-gradient(150% 44% at 8% 112%,#93b894 0 50%,#93b89400 64%),radial-gradient(120% 38% at 96% 106%,#b3cfaa 0 48%,#b3cfaa00 64%),radial-gradient(100% 30% at 52% 96%,#d0e2c4 0 46%,#d0e2c400 64%),radial-gradient(60% 18% at 22% 30%,#ffffffaa 0,#fff0 70%),radial-gradient(70% 22% at 82% 46%,#f3d6cc66 0,#fff0 70%),linear-gradient(180deg,#cde1e4 0%,#e1ece4 38%,#f4f0e2 68%,#e9eed8 100%)`,
    night: {
      ink: '#f1ecdc', clock: 'glow', stroke: '#9fc0a2', halo: '#101816', motion: 'fireflies',
      background: `${stars},radial-gradient(circle 17px at 86.6% 8.4%,#253941 0 94%,#25394100 100%),radial-gradient(circle 18px at 84% 10%,#f4eed2 0 92%,#f4eed200 100%),radial-gradient(circle 60px at 84% 10%,#f4eed22e 0,#f4eed200 100%),radial-gradient(150% 44% at 8% 112%,#1d3a2d 0 50%,#1d3a2d00 64%),radial-gradient(120% 38% at 96% 106%,#26463a 0 48%,#26463a00 64%),radial-gradient(40% 10% at 30% 96%,#e8c27a22 0,#e8c27a00 70%),linear-gradient(180deg,#18262e 0%,#233841 42%,#2b433f 72%,#2f4436 100%)`,
      size: `${starSize},auto,auto,auto,auto,auto,auto,auto`
    }
  }
};

/** The wallpaper that goes with a 自定义主题, made from its colours: a sky of its main colour, by night its dark with stars. */
export function customWallpaper(theme, dark) {
  if (dark) {
    const t = theme.night;
    return {name: '主题色', ink: '#fff', clock: 'glow', stroke: t.accent, halo: '#000', motion: 'stars', size: `${starSize},auto,auto`,
      background: `${stars},radial-gradient(60% 30% at 80% 100%,${t.pink}55 0,#fff0 70%),linear-gradient(180deg,${t.page} 0%,${t.bg} 48%,${t['accent-soft']} 88%,${t['accent-soft']} 100%)`};
  }
  const t = theme.day;
  return {name: '主题色', ink: t.ink, clock: 'stroke', stroke: t['accent-btn'], shadow: t['accent-ink'], halo: '#fff', motion: 'clouds',
    background: `${clouds},radial-gradient(40% 25% at 85% 12%,#ffffff55 0,#fff0 70%),linear-gradient(180deg,${t.accent} 0%,color-mix(in srgb,${t.accent} 55%,#fff) 36%,${t['accent-soft']} 62%,${t.bg} 100%)`};
}

// Returns the look to apply for a builtin key, honouring the dark variant.
export function wallpaperLook(key, dark) {
  const w = wallpapers[key] || wallpapers.sky;
  return dark && w.night ? {...w, ...w.night} : w;
}

// Moving wallpapers: a light layer of a few small elements over the built-in picture, animated in phone.css with
// transforms and opacity only. Positions come from a seeded random, so a scene looks the same every time it is drawn.
const SCENES = {
  clouds: {count: 4, kind: 'cloud'},
  stars: {count: 16, kind: 'star', extra: '<b class="wm-meteor"></b>'},
  bubbles: {count: 8, kind: 'bubble'},
  aurora: {count: 6, kind: 'bubble', extra: '<b class="wm-band"></b><b class="wm-band"></b>'},
  leaves: {count: 8, kind: 'leaf'},
  fireflies: {count: 12, kind: 'firefly'},
  petals: {count: 10, kind: 'petal'}
};
export const MOTION_SCENES = Object.freeze(Object.keys(SCENES));
function seeded(text) {
  let h = [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
  return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
}
/** The moving layer for a scene ('' when the look has none). random: a new layout every time (the call screen), not the
 * scene's fixed one; className: the wrapper's class. */
export function motionLayer(scene, {random = false, className = 'wall-motion'} = {}) {
  const s = SCENES[scene];
  if (!s) return '';
  const rand = random ? Math.random : seeded(scene), pct = (a, b) => (a + rand() * (b - a)).toFixed(1) + '%', sec = (a, b) => (a + rand() * (b - a)).toFixed(1) + 's';
  const items = Array.from({length: s.count}, (_, i) => {
    // x, y: where it starts; s: size factor; d: one cycle; w: a second, slower rhythm (sway, blink); delay: negative,
    // so every element is already midway when the wallpaper appears instead of all starting together.
    const d = s.kind === 'cloud' ? sec(70, 120) : s.kind === 'star' ? sec(2.4, 5.5) : s.kind === 'firefly' ? sec(9, 16) : sec(14, 26);
    const y = s.kind === 'cloud' ? pct(46, 84) : s.kind === 'star' ? pct(3, 52) : s.kind === 'firefly' ? pct(40, 90) : '0%';
    const style = `--x:${pct(2, 94)};--y:${y};--s:${(0.6 + rand() * 0.8).toFixed(2)};--d:${d};--w:${sec(3, 7)};--delay:-${(rand() * 30).toFixed(1)}s`;
    return `<i class="wm-${s.kind}" style="${style}"></i>`;
  }).join('');
  return `<div class="${className}" data-scene="${scene}" aria-hidden="true">${s.extra || ''}${items}</div>`;
}

// Phone skins (see skins.css). preview: [page, card, accent, second colour] for the picker in Settings.
export const skins = {
  sky: {name: '晴空贴纸', preview: ['#8fd0ff', '#ffffff', '#1f74cc', '#ff7eaa']},
  aero: {name: 'Aero', preview: ['#4cc3f6', '#f4fdff', '#1494d2', '#5cc93a']},
  fresh: {name: '文艺小清新', preview: ['#dfe9dc', '#fffdf8', '#6d977f', '#dfa39b']},
  custom: {name: '自定义', preview: ['#f3c7d6', '#ffffff', '#c94a78', '#7fb6d9']}
};
