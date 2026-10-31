// 自定义主题 in 设置: one tap from a ready 配色 or a picture, the main colour with three sliders, every colour by hand if
// wanted, and a file to share. What changes shows on the phone at once (it is the preview), and is kept a moment later.
import {esc, btn, heading, help, groupTitle} from './common.js';
import {icon} from './icons.js';
import {saveFile} from '../download.js';
import {deriveTheme, cleanTheme, fixColors, themeProblems, themeFile, readThemeFile, pictureColors, paintTheme, toOklch, fromOklch, THEME_TOKENS, THEME_PRESETS, DEFAULT_THEME_SOURCE} from '../core/theme-colors.js';

const VIVID_MOST = .22;
const hueTrack = l => `linear-gradient(90deg,${Array.from({length: 13}, (_, i) => fromOklch({l, c: .15, h: i * 30})).join(',')})`;

export function themeEditor({ctx, v}) {
  const {api, doc} = ctx;
  let theme = null, main = null, side = 'day', each = false, saving = 0, frame = 0, left = true;
  const dark = () => side === 'night';
  const remember = () => { main = toOklch(theme.accent); };
  /** Kept a moment after the last change. */
  const keep = () => { ctx.win.clearTimeout(saving); saving = ctx.win.setTimeout(flush, 300); };
  function flush() { ctx.win.clearTimeout(saving); saving = 0; return api.savePhone({customTheme: theme}).catch(error => ctx.notify(error.message, {error: true})); }
  /** Shown at once, at most once a frame: the whole phone is drawn again with these colours. */
  function show() {
    if (frame) return;
    frame = ctx.win.requestAnimationFrame(() => { frame = 0; paintTheme(doc, theme); });
  }
  const changed = () => { show(); keep(); };
  /** From the main colour again (what was changed by hand goes: the sliders are about the whole set). 点缀 stays if it was chosen. */
  const remake = (patch = {}) => { theme = deriveTheme({name: theme.name, accent: theme.accent, tint: theme.tint, ...(theme.ownPink ? {pink: theme.pink, ownPink: true} : {}), ...patch}); };

  function presetsHTML() {
    return THEME_PRESETS.map((preset, i) => { const made = deriveTheme(preset); return `<button type="button" class="theme-preset" data-theme-preset="${i}" aria-pressed="${theme.accent === preset.accent && theme.name === preset.name}"><i style="--a:${made.day['accent-btn']};--b:${made.day['accent-soft']}"></i>${esc(preset.name)}</button>`; }).join('');
  }
  function slidersHTML() {
    const hue = Math.round(main.h), vivid = Math.round(Math.min(100, main.c / VIVID_MOST * 100)), tint = Math.round(theme.tint * 100), hueOf = c => fromOklch({l: main.l, c, h: main.h});
    return `<div class="theme-row"><span>主色</span><b data-theme-now="accent">${esc(theme.accent)}</b><label class="theme-swatch" style="--c:${theme.accent}" data-theme-swatch="accent"><input type="color" value="${theme.accent}" data-theme-color="accent" aria-label="选主色"></label></div>
      <div class="theme-row"><span>色相</span><input class="theme-range" type="range" min="0" max="359" value="${hue}" data-theme-range="hue" aria-label="色相" style="--track:${hueTrack(.72)};--thumb:${theme.accent}"></div>
      <div class="theme-row"><span>鲜艳</span><input class="theme-range" type="range" min="0" max="100" value="${vivid}" data-theme-range="vivid" aria-label="鲜艳" style="--track:linear-gradient(90deg,${hueOf(0)},${hueOf(VIVID_MOST)});--thumb:${theme.accent}"></div>
      <div class="theme-row"><span>背景浓淡</span><input class="theme-range" type="range" min="0" max="100" value="${tint}" data-theme-range="tint" aria-label="背景浓淡" style="--track:linear-gradient(90deg,${deriveTheme({...theme, tint: 0}).day.page},${deriveTheme({...theme, tint: 1}).day.page});--thumb:${theme.day.page}"></div>
      <div class="theme-row"><span>点缀</span><b data-theme-now="pink">${esc(theme.pink)}</b><label class="theme-swatch" style="--c:${theme.pink}" data-theme-swatch="pink"><input type="color" value="${theme.pink}" data-theme-color="pink" aria-label="选点缀色"></label></div>`;
  }
  function eachHTML() {
    const colors = theme[side], problems = themeProblems(colors);
    return `<details class="group pad theme-each"${each ? ' open' : ''}><summary>每个颜色单独改</summary>
      <div class="segmented" role="group" aria-label="改哪一套">${[['day', '日间'], ['night', '夜间']].map(([key, label]) => `<button type="button" data-action="theme-side" data-value="${key}" aria-pressed="${side === key}">${label}</button>`).join('')}</div>
      ${problems.length ? `<div class="theme-warn" role="status"><span>有 ${problems.length} 处文字可能看不清</span><button type="button" data-action="theme-fix">自动修好</button></div>` : ''}
      ${Object.entries(THEME_TOKENS).map(([key, label]) => `<div class="theme-token"><span>${esc(label)}</span><input class="theme-hex" data-theme-hex="${key}" value="${colors[key]}" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${esc(label)}的颜色值"><label class="theme-swatch" style="--c:${colors[key]}"><input type="color" value="${colors[key]}" data-theme-token="${key}" aria-label="选${esc(label)}的颜色"></label></div>`).join('')}</details>`;
  }
  function render() {
    each = v.root.querySelector('.theme-each')?.open ?? each;
    v.draw(heading('自定义主题', help('挑一套现成的，或者从图片取色，手机会马上变成这个颜色。动主色和浓淡时日夜两套一起算，文字保证看得清；单独改过的颜色这时会被重新算的盖掉。\n配色可以导出成文件发给别人，别人导入后就是同一套。文件里只有颜色；想连壁纸和图标一起发，用设置里的「我的主题」。\n形状和质感是晴空贴纸的样子。'), 'My Theme')
      + `<div class="group pad theme-presets">${presetsHTML()}</div>`
      + `<div class="actions" style="margin-top:0">${btn('theme-picture', icon('image') + '从图片取色', 'secondary')}</div>`
      + groupTitle('颜色')
      + `<div class="group pad">${slidersHTML()}</div>`
      + eachHTML()
      + `<div class="actions"><label class="secondary file-button">${icon('import')}导入配色<input type="file" data-theme-file accept=".json,application/json" aria-label="选配色文件"></label>${btn('theme-export', icon('download') + '导出配色', 'secondary')}</div>`
      + `<div class="actions">${btn('theme-reset', '恢复默认配色', 'text-button')}</div>`);
  }
  /** After a slider: the marks that show the colours, without drawing the page (the finger is still on it). */
  function shownAgain() {
    for (const [key, value] of [['accent', theme.accent], ['pink', theme.pink]]) {
      const swatch = v.root.querySelector(`[data-theme-swatch=${key}]`);
      swatch?.style.setProperty('--c', value);
      const input = swatch?.querySelector('input');
      if (input) input.value = value;
      const now = v.root.querySelector(`[data-theme-now=${key}]`);
      if (now) now.textContent = value;
    }
    for (const el of v.root.querySelectorAll('[data-theme-range]')) el.style.setProperty('--thumb', el.dataset.themeRange === 'tint' ? theme.day.page : theme.accent);
    const vivid = v.root.querySelector('[data-theme-range=vivid]');
    if (vivid) vivid.style.setProperty('--track', `linear-gradient(90deg,${fromOklch({l: main.l, c: 0, h: main.h})},${fromOklch({l: main.l, c: VIVID_MOST, h: main.h})})`);
    for (const el of v.root.querySelectorAll('[data-theme-hex]')) { if (el !== doc.activeElement) el.value = theme[side][el.dataset.themeHex]; el.parentElement.querySelector('.theme-swatch').style.setProperty('--c', theme[side][el.dataset.themeHex]); }
  }
  const live = fn => (...args) => { if (!left) return fn(...args); };
  v.on('input', '[data-theme-range]', live(el => {
    const key = el.dataset.themeRange, value = Number(el.value);
    if (key === 'tint') remake({tint: value / 100, ...(theme.ownPink ? {} : {pink: theme.pink})});
    else {
      // Grey has no hue to move: moving it brings some colour in.
      if (key === 'hue') { main.h = value; main.c = Math.max(main.c, .08); v.root.querySelector('[data-theme-range=vivid]').value = Math.round(main.c / VIVID_MOST * 100); }
      else main.c = value / 100 * VIVID_MOST;
      remake({accent: fromOklch(main)});
    }
    shownAgain();
    changed();
  }));
  v.on('input', '[data-theme-color]', live(el => {
    if (el.dataset.themeColor === 'accent') { remake({accent: el.value}); remember(); }
    else remake({pink: el.value, ownPink: true});
    shownAgain();
    changed();
  }));
  v.on('change', '[data-theme-color]', live(() => render()));
  /** One colour by hand, on the side being edited. */
  const setToken = (key, value) => { theme = {...theme, [side]: {...theme[side], [key]: value}}; changed(); };
  v.on('input', '[data-theme-token]', live(el => { setToken(el.dataset.themeToken, el.value); shownAgain(); }));
  v.on('change', '[data-theme-token]', live(() => render()));
  v.on('change', '[data-theme-hex]', live(el => {
    const text = el.value.trim().toLowerCase(), value = /^#?[0-9a-f]{6}$/.test(text) ? (text.startsWith('#') ? text : '#' + text) : /^#?[0-9a-f]{3}$/.test(text) ? '#' + text.replace('#', '').replace(/./g, c => c + c) : '';
    if (!value) { el.value = theme[side][el.dataset.themeHex]; ctx.notify('颜色要写成 #rrggbb 这样'); return; }
    setToken(el.dataset.themeHex, value);
    render();
  }));
  v.on('change', '[data-theme-file]', live(async el => {
    const file = el.files?.[0];
    if (!file) return;
    el.value = '';
    try {
      if (file.size > 256 * 1024) throw Error('这不是配色文件（太大了）');
      const {theme: read, fixed} = readThemeFile(await file.text());
      theme = read; remember();
      paintTheme(doc, theme);
      await flush();
      render();
      ctx.notify(fixed ? `导入了，有 ${fixed} 处看不清的颜色自动调了` : '导入了');
    } catch (error) { ctx.notify(error.message, {error: true}); }
  }));
  v.on('click', '[data-theme-preset]', live(el => {
    const preset = THEME_PRESETS[Number(el.dataset.themePreset)];
    theme = deriveTheme(preset); remember();
    paintTheme(doc, theme);
    keep();
    render();
  }));
  /** 从图片取色: a small copy is enough for the colours in it. */
  async function fromPicture() {
    const {pickPicture} = await import('./draw-images.js'), blob = await pickPicture(ctx, api, '选一张图来取色');
    if (!blob || left) return;
    const bitmap = await ctx.win.createImageBitmap(blob), size = 64, canvas = doc.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d', {willReadFrequently: true});
    g.drawImage(bitmap, 0, 0, size, size);
    bitmap.close?.();
    const found = pictureColors(g.getImageData(0, 0, size, size).data);
    if (!found) { ctx.notify('这张图几乎没有颜色，换一张试试'); return; }
    theme = deriveTheme({name: '图片取色', accent: found.accent, tint: theme.tint, ...(found.pink ? {pink: found.pink, ownPink: true} : {})}); remember();
    paintTheme(doc, theme);
    await flush();
    render();
    ctx.notify('取好了');
  }
  v.on('click', '[data-action^=theme-]', live(async el => {
    try {
      switch (el.dataset.action) {
        case 'theme-picture': await fromPicture(); break;
        case 'theme-export': ctx.notify('已下载 ' + await saveFile(doc, new ctx.win.Blob([themeFile(theme)], {type: 'application/json'}), `ST-iPhonie 配色 ${theme.name || '我的配色'}.json`)); break;
        case 'theme-fix': theme = {...theme, [side]: fixColors(theme[side])}; changed(); render(); break;
        case 'theme-side': side = el.dataset.value; ctx.previewSide?.(dark() ? 'dark' : 'light'); each = true; render(); break;
        case 'theme-reset':
          if (!await ctx.confirm('恢复默认配色？', '现在的配色会被换掉。想留着可以先导出。')) break;
          theme = deriveTheme({name: '我的配色', ...DEFAULT_THEME_SOURCE}); remember();
          paintTheme(doc, theme);
          await flush();
          render();
          break;
      }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  }));
  return {
    async start() {
      const phone = await api.getPhone();
      left = false; each = false;
      theme = cleanTheme(phone.customTheme) || deriveTheme({name: '我的配色', ...DEFAULT_THEME_SOURCE});
      remember();
      side = doc.documentElement.dataset.theme === 'dark' ? 'night' : 'day';
      render();
    },
    render,
    /** Done with it: what is waiting is kept, and the 日夜 setting says again which side shows. */
    leave() {
      left = true;
      if (frame) ctx.win.cancelAnimationFrame(frame);
      if (saving) flush();
      ctx.previewSide?.(null);
    }
  };
}
