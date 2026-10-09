// Icons for the phone UI. Desktop glyphs are drawn on a 64x64 grid: currentColor is the
// main shape, --t2 the tile's deep colour and --tac its accent colour.

const gear = (() => {
  let teeth = '';
  for (let k = 0; k < 8; k++) teeth += `<rect x="28" y="8" width="8" height="11" rx="2" transform="rotate(${k * 45} 32 32)"/>`;
  return `<circle cx="32" cy="32" r="15"/>${teeth}<circle cx="32" cy="32" r="6" fill="var(--tac)"/>`;
})();

const GLYPHS = {
  roles: '<path d="M14 57c1-10 8-15 18-15s17 5 18 15z"/><circle cx="32" cy="28" r="13"/><path d="M31 15c-1-5 2-9 7-9-3 2-4 5-3 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M25 29q2.5-3 5 0M34 29q2.5-3 5 0" fill="none" stroke="var(--t2)" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="24" cy="34" rx="3" ry="1.8" fill="var(--tac)"/><ellipse cx="40" cy="34" rx="3" ry="1.8" fill="var(--tac)"/>',
  engines: '<rect x="23" y="8" width="18" height="30" rx="9"/><path d="M16 30a16 16 0 0 0 32 0M32 46v9M24 55h16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M52 15q4 5 0 10M57 11q7 9 0 18" fill="none" stroke="var(--tac)" stroke-width="3" stroke-linecap="round"/>',
  presets: '<rect x="14" y="9" width="36" height="46" rx="6"/><path d="M21 25h22M21 33h22M21 41h14" stroke="var(--t2)" stroke-width="3" stroke-linecap="round"/><path d="M39 9h8v16l-4-3-4 3z" fill="var(--tac)"/>',
  library: '<rect x="8" y="15" width="48" height="34" rx="6"/><rect x="15" y="21" width="34" height="14" rx="7" fill="var(--t2)"/><circle cx="23" cy="28" r="4"/><circle cx="41" cy="28" r="4"/><path d="M19 49l4-7h18l4 7z" fill="var(--tac)"/>',
  gallery: '<g transform="rotate(-8 32 32)"><rect x="12" y="9" width="40" height="47" rx="4"/><rect x="17" y="14" width="30" height="28" rx="2" fill="var(--t2)"/><circle cx="39" cy="21" r="4" fill="var(--tac)"/><path d="M17 42l10-12 8 8 5-5 7 9z"/></g>',
  notes: '<rect x="13" y="9" width="38" height="47" rx="6"/><path d="M13 15a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v6H13z" fill="var(--tac)"/><path d="M20 31h24M20 39h24M20 47h14" stroke="var(--t2)" stroke-width="2.5" stroke-linecap="round" opacity=".6"/>',
  listen: '<path d="M14 38v-6a18 18 0 0 1 36 0v6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="9" y="34" width="13" height="21" rx="6.5"/><rect x="42" y="34" width="13" height="21" rx="6.5"/><path d="M51 3c.7 3.4 1.6 4.3 5 5-3.4.7-4.3 1.6-5 5-.7-3.4-1.6-4.3-5-5 3.4-.7 4.3-1.6 5-5z" fill="var(--tac)"/>',
  settings: gear,
  draw: '<rect x="8" y="10" width="40" height="44" rx="5"/><path d="M13 44l10-12 7 8 5-6 9 10z" fill="var(--t2)"/><circle cx="38" cy="21" r="4" fill="var(--tac)"/><path d="M40 52 58 18l4 3-17 35-6 2z" fill="currentColor" stroke="var(--t2)" stroke-width="2.5" stroke-linejoin="round"/>',
  wave: '<path d="M10 28v8M18 20v24M26 12v40M34 22v20M42 16v32M50 26v12" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M56 6c.6 2.8 1.3 3.5 4 4-2.7.6-3.4 1.3-4 4-.6-2.7-1.3-3.4-4-4 2.7-.5 3.4-1.2 4-4z" fill="var(--tac)"/>',
  star: '<path d="m32 7 7.4 15 16.6 2.4-12 11.7 2.8 16.5L32 44.8l-14.8 7.8L20 36.1 8 24.4l16.6-2.4z"/><circle cx="26" cy="30" r="2.4" fill="var(--t2)"/><circle cx="38" cy="30" r="2.4" fill="var(--t2)"/><ellipse cx="23" cy="36" rx="3" ry="1.6" fill="var(--tac)"/><ellipse cx="41" cy="36" rx="3" ry="1.6" fill="var(--tac)"/>',
  music: '<path d="M24 46V14l26-6v32" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><circle cx="18" cy="46" r="8"/><circle cx="44" cy="40" r="8"/><path d="M24 20l26-6" stroke="var(--tac)" stroke-width="4"/>',
  chat: '<path d="M8 12h34a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H22l-9 7v-7H8a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z"/><path d="M50 22h4a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4h-2v6l-8-6H30" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><circle cx="15" cy="25" r="3" fill="var(--t2)"/><circle cx="25" cy="25" r="3" fill="var(--t2)"/><circle cx="35" cy="25" r="3" fill="var(--t2)"/><ellipse cx="13" cy="31" rx="3" ry="1.7" fill="var(--tac)"/>',
  forum: '<rect x="8" y="10" width="48" height="36" rx="7"/><path d="M18 46v9l11-9z"/><path d="M17 21h20M17 29h30M17 37h14" stroke="var(--t2)" stroke-width="3.5" stroke-linecap="round"/><path d="M45 15c5 3 6 9 3 12-1-3-3-4-5-4 1-3 1-5 2-8z" fill="var(--tac)"/>',
  sounds: '<path d="M8 25h10l15-13v40L18 39H8z"/><path d="M41 23c4 4 4 14 0 18" fill="none" stroke="var(--tac)" stroke-width="4.5" stroke-linecap="round"/><path d="M48 15c8 8 8 26 0 34" fill="none" stroke="var(--t2)" stroke-width="4.5" stroke-linecap="round"/>',
  peek: '<rect x="17" y="6" width="30" height="52" rx="7"/><rect x="21" y="13" width="22" height="34" rx="3" fill="var(--t2)"/><circle cx="38" cy="38" r="10" fill="none" stroke="var(--tac)" stroke-width="4.5"/><path d="M45 45l9 9" stroke="var(--tac)" stroke-width="5.5" stroke-linecap="round"/>',
  sliders: '<path d="M12 18h40M12 32h40M12 46h40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="18" r="6" fill="var(--tac)"/><circle cx="42" cy="32" r="6" fill="var(--tac)"/><circle cx="30" cy="46" r="6" fill="var(--tac)"/>'
};

// Glyph keys the backend accepts for custom icons that are drawn as another app's picture.
const GLYPH_ALIASES = {book: 'presets', camera: 'gallery', note: 'notes', person: 'roles', microphone: 'engines', headphones: 'listen'};

export const GLYPH_NAMES = {default: '默认', wave: '声波', book: '书本', music: '音符', camera: '相册', sliders: '滑块', note: '便签', person: '人物', microphone: '麦克风', star: '星星', headphones: '耳机'};

export function glyph(key) {
  const art = GLYPHS[GLYPH_ALIASES[key] || key] || GLYPHS.star;
  return `<svg class="glyph" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">${art}</svg>`;
}

const LINES = {
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7C10.5 4 7 3.5 7 6s3 1 5 1m0 0c1.5-3 5-3.5 5-1s-3 1-5 1', wallet: 'M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 7l12-3v3M15 13.5h2', shop: 'M5 8h14l-1.2 12H6.2zM9 10V6a3 3 0 0 1 6 0v4',
  back: 'm15 5-7 7 7 7', home: 'm3 11 9-8 9 8M6 9v12h12V9M10 21v-7h4v7', close: 'm6 6 12 12M6 18 18 6', add: 'M12 5v14M5 12h14',
  next: 'm9 5 7 7-7 7', down: 'm6 9 6 6 6-6', up: 'm6 15 6-6 6 6', lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  play: 'M7 4.5v15l12.5-7.5z', pause: 'M8 5v14M16 5v14', stop: 'M6.5 6.5h11v11h-11z', prev: 'M6 5v14M19 5 9 12l10 7z', skip: 'M18 5v14M5 5l10 7-10 7z',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  wave: 'M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2', trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5h.01',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4.2-4.2', mute: 'M9 5.2A6 6 0 0 1 18 10v3l2 3H9M6 10v3l-2 3h3M10 20a2 2 0 0 0 4 0M3 3l18 18', moments: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3l3.2 6.8M21 12l-6.8 3.2M12 21l-3.2-6.8M3 12l6.8-3.2',
  import: 'M12 4v11M7 10l5 5 5-5M5 20h14', download: 'M12 4v11M7 10l5 5 5-5M5 20h14', key: 'M15 7a4 4 0 1 1-3.9 5H4v3H2v-5h9.1A4 4 0 0 1 15 7z', check: 'm5 12 5 5 9-10',
  nfc: 'M8 8a6 6 0 0 1 0 8M11.5 5.5a10 10 0 0 1 0 13M15 3a14 14 0 0 1 0 18', sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5',
  float: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM9 12h.01M15 12h.01', volume: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  spin: 'M12 3a9 9 0 1 0 9 9', music: 'M10 17V4l10-2v13M10 7l10-2M4 17a3 3 0 1 0 6 0 3 3 0 1 0-6 0M14 15a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  sliders: 'M4 7h16M4 17h16M9 4v6M15 14v6', paint: 'M4 20c3 0 4-2 4-4a3 3 0 0 1 3-3l9-9-3-3-9 9a3 3 0 0 1-3 3c-2 0-4 1-4 4z', dice: 'M5 5h14v14H5zM9 9h.01M15 15h.01M15 9h.01M9 15h.01', wand: 'M4 20 16 8M14 4v3M18 8h3M17 5l2-2M19 11l2 1', insert: 'M4 6h16M4 12h9M4 18h9M17 14v6M14 17h6', layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5', unlock: 'M7 11V8a5 5 0 0 1 9.6-2M5 11h14v10H5z', edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4', mic: 'M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3',
  chat: 'M5 5h14v10H10l-5 4z', phone: 'M6.6 3.5h3l1.6 4.3-2.1 1.3a12 12 0 0 0 5.8 5.8l1.3-2.1 4.3 1.6v3a2 2 0 0 1-2.1 2.1A15 15 0 0 1 4.5 5.6a2 2 0 0 1 2.1-2.1z', send: 'M4 11.5 20 4l-6.5 16-2.5-6.5zM11 13.5 20 4', reply: 'M10 7 4 12l6 5M4 12h10a6 6 0 0 1 6 6v1',
  book: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10', group: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 19c0-3 2.7-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M17.5 14c2 .6 3.5 2.4 3.5 5',
  person: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c0-4 3.6-7 8-7s8 3 8 7', copy: 'M8 8h11v11H8zM5 16V5h11', more: 'M5 12h.01M12 12h.01M19 12h.01',
  smile: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01', packet: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM5 8.5q7 4.5 14 0M12 9.5v.01',
  swap: 'M4 8h15l-4-4M20 16H5l4 4', bubble: 'M4 5h16v11H11l-5 4v-4H4zM8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01', backspace: 'M21 5H9l-6 7 6 7h12zM12 9l6 6M18 9l-6 6',undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11', pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', battery: 'M3 7h15v10H3zM21 10.5v3M6 10h6v4H6z',
  hand: 'M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.4 0-4-1.2-5.3-3.2L4 13.5a1.5 1.5 0 0 1 2.4-1.8L8 13.5'
};

export function icon(key, filled = false) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${LINES[key] || LINES.star}"/></svg>`;
}

export const spark = (className = 'spark') => `<svg class="${className}" viewBox="-10 -10 20 20" fill="currentColor" aria-hidden="true"><path d="M0-10C1-2 2-1 10 0 2 1 1 2 0 10-1 2-2 1-10 0-2-1-1-2 0-10z"/></svg>`;

export const halo = () => '<svg class="halo" viewBox="0 0 110 30" fill="none" stroke="currentColor" aria-hidden="true"><ellipse cx="55" cy="15" rx="44" ry="9" stroke-width="4"/><path d="M55 1v5M33 3l2 4M77 3l-2 4" stroke-width="2.5" stroke-linecap="round"/></svg>';

// Five-bar sound wave. Its bars are scaled by the shared animation loop while audio plays.
export const wave = '<span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
