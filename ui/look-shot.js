// The small picture of a 主题 for its row and its sheet: a little home screen drawn on a canvas, the wallpaper, the clock,
// the two widgets, the first page's icons and the dock. It is drawn from what the theme holds, never taken from a file.
import {APPS, HOME} from './apps.js';
import {skins, wallpapers} from './wallpapers.js';

const WIDTH = 270, HEIGHT = 480;
/** A built-in wallpaper as a plain sky from top to bottom: its colours, for a canvas that cannot draw its CSS. */
function skyOf(look) {
  const key = look.wallpaper?.key || look.skin || 'sky', theme = look.customTheme;
  if (key === 'custom' && theme) return [theme.day.accent, theme.day['accent-soft'], theme.day.bg];
  const found = String(wallpapers[key]?.background || '').match(/linear-gradient\(180deg,([^()]*)\)$/);
  return found ? found[1].split(',').map(stop => stop.trim().split(' ')[0]) : [(skins[look.skin] || skins.sky).preview[0], '#ffffff'];
}
function rounded(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
/** The part of a picture that fills a box, as drawImage's first numbers. */
function cover(bitmap, boxW, boxH) {
  const scale = Math.max(boxW / bitmap.width, boxH / bitmap.height), w = boxW / scale, h = boxH / scale;
  return [(bitmap.width - w) / 2, (bitmap.height - h) / 2, w, h];
}

/** shown: {wallpaper: Blob | null, icons: {app: {blob, clear}}}. A Blob, or null where the browser cannot draw it. */
export async function lookShot(win, look, shown) {
  const canvas = win.document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const g = canvas.getContext('2d'), bitmaps = [];
  const open = async blob => { const bitmap = await win.createImageBitmap(blob); bitmaps.push(bitmap); return bitmap; };
  try {
    if (shown.wallpaper) {
      const bitmap = await open(shown.wallpaper);
      g.drawImage(bitmap, ...cover(bitmap, WIDTH, HEIGHT), 0, 0, WIDTH, HEIGHT);
      g.fillStyle = 'rgba(0,0,0,.12)';
      g.fillRect(0, 0, WIDTH, HEIGHT);
    } else {
      const sky = g.createLinearGradient(0, 0, 0, HEIGHT), stops = skyOf(look);
      stops.forEach((color, i) => sky.addColorStop(i / Math.max(1, stops.length - 1), color));
      g.fillStyle = sky;
      g.fillRect(0, 0, WIDTH, HEIGHT);
    }
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.shadowColor = 'rgba(0,0,0,.35)';
    g.shadowBlur = 6;
    g.font = '800 54px system-ui,-apple-system,"Segoe UI",sans-serif';
    g.fillText('12:00', WIDTH / 2, 84);
    g.shadowBlur = 0;
    const card = look.customTheme?.day.card || (skins[look.skin] || skins.sky).preview[1];
    g.globalAlpha = .88;
    g.fillStyle = card;
    for (const x of [18, WIDTH / 2 + 5]) { rounded(g, x, 106, WIDTH / 2 - 23, 62, 14); g.fill(); }
    g.globalAlpha = 1;
    const accent = look.customTheme?.day['accent-btn'] || (skins[look.skin] || skins.sky).preview[2];
    g.fillStyle = accent;
    for (const x of [28, WIDTH / 2 + 15]) { rounded(g, x, 118, 42, 8, 4); g.fill(); }
    const size = 42, gap = (WIDTH - 36 - size * 4) / 3, place = (i, top) => [18 + (size + gap) * (i % 4), top + (size + 20) * Math.floor(i / 4)];
    const tile = async (app, x, y) => {
      const one = shown.icons?.[app], bitmap = one?.blob ? await open(one.blob).catch(() => null) : null;
      if (bitmap && one.clear) {
        const scale = Math.min(size / bitmap.width, size / bitmap.height), w = bitmap.width * scale, h = bitmap.height * scale;
        g.drawImage(bitmap, x + (size - w) / 2, y + (size - h) / 2, w, h);
        return;
      }
      g.save();
      rounded(g, x, y, size, size, 11);
      if (bitmap) { g.clip(); g.drawImage(bitmap, ...cover(bitmap, size, size), x, y, size, size); }
      else {
        const [top, bottom] = APPS[app].colors, fill = g.createLinearGradient(x, y, x, y + size);
        if (look.iconStyle === 'glass') g.globalAlpha = .45;
        fill.addColorStop(0, look.iconStyle === 'mono' ? '#d9dce2' : top);
        fill.addColorStop(1, look.iconStyle === 'mono' ? '#8e94a2' : bottom);
        g.fillStyle = fill;
        g.fill();
      }
      g.restore();
    };
    const first = HOME.pages[0].filter(Boolean);
    for (const [i, app] of first.entries()) await tile(app, ...place(i, 186));
    g.fillStyle = 'rgba(255,255,255,.3)';
    rounded(g, 10, HEIGHT - 72, WIDTH - 20, 60, 20);
    g.fill();
    for (const [i, app] of HOME.dock.entries()) await tile(app, ...place(i, HEIGHT - 63));
    const make = (type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));
    let out = await make('image/webp', .82);
    if (out?.type !== 'image/webp') out = await make('image/jpeg', .86);
    return out?.size ? out : null;
  } finally {
    for (const bitmap of bitmaps) bitmap.close?.();
  }
}
