import {icon, spark} from './icons.js';
import {plainImage} from '../download.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const engines = {fish: 'Fish Audio', mini: 'MiniMax', eleven: 'ElevenLabs', mimo: '小米 MiMo', doubao: '豆包语音', custom: '自己的接口'};
import {LANGUAGES, customLanguages} from '../core/languages.js';
export const languages = LANGUAGES;
/** Languages typed in by the user anywhere in the settings (default language and every role), for the chip list. */
export const typedLanguages = state => customLanguages([state.general?.defaultLanguage, ...(state.routes || []).map(r => r.language)]);
export const languageName = code => languages.find(([value]) => value === code)?.[1] || code;
export const size = bytes => bytes < 1024 * 1024 ? Math.round(bytes / 1024) + ' KB' : bytes < 1024 ** 3 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : (bytes / 1024 ** 3).toFixed(1) + ' GB';

// style: primary | secondary | danger | text-button | chip-button
export const btn = (action, text, style = 'secondary', attrs = '') => `<button type="button" class="${style}" data-action="${action}" ${attrs}>${text}</button>`;
export const help = text => `<button type="button" class="info" data-help="${esc(text)}" aria-label="查看说明">i</button>`;
export const field = (label, control, info = '') => `<div class="field"><span>${esc(label)}${info ? help(info) : ''}</span>${control.replace(/aria-label="[^"]*"/, 'aria-label="' + esc(label) + '"')}</div>`;
export const input = (key, value = '', type = 'text', attrs = '') => `<input data-field="${esc(key)}" aria-label="${esc(key)}" type="${type}" value="${esc(value)}" ${attrs}>`;
export const select = (key, value, choices, attrs = '') => `<span class="select"><select data-field="${esc(key)}" aria-label="${esc(key)}" ${attrs}>${choices.map(([v, t, disabled]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${esc(t)}</option>`).join('')}</select></span>`;
export const textArea = (key, value, attrs = '') => `<textarea data-field="${esc(key)}" aria-label="${esc(key)}" ${/\brows=/.test(attrs) ? '' : 'rows="5" '}${attrs}>${esc(value)}</textarea>`;
export const toggle = (key, label, value, info = '') => `<div class="setting-row"><span>${esc(label)}${info ? help(info) : ''}</span><input class="switch" aria-label="${esc(label)}" type="checkbox" data-field="${esc(key)}" ${value ? 'checked' : ''}></div>`;
export const empty = (title, detail = '', art = 'music') => `<div class="empty">${icon(art)}<h2>${esc(title)}</h2>${detail ? `<p>${esc(detail)}</p>` : ''}</div>`;

// Page title: small English eyebrow, a big title with a marker underline, and optional actions.
export const heading = (title, actions = '', eyebrow = '') => `<header class="page-heading"><div>${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}<h1><span>${esc(title)}</span>${spark()}</h1></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</header>`;
/** Copies text: the clipboard API where the page may use it, else the old selection copy (LAN http addresses). */
export async function copyText(win, text) {
  try { if (win.navigator.clipboard?.writeText) { await win.navigator.clipboard.writeText(text); return true; } } catch { /* tried the old way below */ }
  const doc = win.document, box = doc.createElement('textarea');
  box.value = text; box.setAttribute('readonly', ''); box.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  doc.body.append(box); box.select();
  let done = false;
  try { done = doc.execCommand('copy'); } catch { done = false; }
  box.remove();
  return done;
}
export const groupTitle = (title, extra = '') => `<div class="group-title"><span>${esc(title)}</span>${extra}</div>`;
/**
 * The 「⋯」 of a page: what is not used every time, as a sheet of rows. items: [{key, icon, label, note, danger}] (falsy
 * ones are left out). Resolves to the key tapped, or null when the sheet is closed.
 */
export function menu(ctx, title, items) {
  return new Promise(resolve => {
    let picked = null;
    const d = ctx.dialog(title, `<div class="pick-list">${items.filter(Boolean).map(x => `<button type="button" class="list-row${x.danger ? ' danger-row' : ''}" data-menu="${esc(x.key)}">${icon(x.icon || 'next')}<span><strong>${esc(x.label)}</strong>${x.note ? `<small>${esc(x.note)}</small>` : ''}</span></button>`).join('')}</div>`);
    d.onClose(() => resolve(picked));
    d.body.addEventListener('click', e => { const key = e.target.closest('[data-menu]')?.dataset.menu; if (key) { picked = key; d.close(key); } });
  });
}

// A skewed name plate; engine colour comes from the nearest data-engine ancestor.
export const plate = (text, attrs = '') => `<span class="plate" ${attrs}><span>${esc(text)}</span></span>`;
// Pictures for avatars, by name ('me' for the user): filled by the phone from the user's choices and the tavern's own
// avatars (ui/phone.js refreshAvatars). A name without one shows its first letter.
const avatarPictures = new Map();
export function setAvatarPictures(map) { avatarPictures.clear(); for (const [k, v] of Object.entries(map || {})) if (v) avatarPictures.set(k, v); }
export const avatarPicture = key => avatarPictures.get(key) || '';
export const avatar = (name, engine = 'none', size = 48, key = name) => {
  const picture = avatarPictures.get(key), letter = esc(String(name || '?').trim().slice(0, 1) || '?');
  return `<span class="avatar${engine === 'none' ? ' none' : ''}${picture ? ' pic' : ''}" data-engine="${engine}" style="--s:${size}px">${picture ? `<img src="${esc(picture)}" alt="" loading="lazy" decoding="async" draggable="false">` : letter}</span>`;
};

/** Rows that keep who they are when a page is drawn again: they glide to their new places (FLIP), new ones fade in. */
const KEYED = '.sw-row[data-swipe],.conv[data-thread],.list-row[data-id],.list-row[data-name],.moment[data-id],.forum-card[data-id],[data-flip]';
const keyOf = el => el.dataset.swipe || el.dataset.thread || el.dataset.flip || (el.dataset.id ? el.className.split(' ')[0] + ':' + el.dataset.id : 'name:' + el.dataset.name);
const titleOf = root => root.querySelector('.page-heading h1')?.textContent || '';
/** A tap on something that goes back (the phone's back, a 返回 of the app's own) makes the next page come from the left. */
const BACKWARD = '[data-action$=back],[data-action^=back],[aria-label^="返回"],.nav-back';

export function createView(ctx, name) {
  const root = ctx.doc.createElement('section');
  root.className = 'view';
  root.dataset.app = name;
  const controller = new ctx.win.AbortController();
  const failed = error => { try { ctx.api.reportDiagnostic?.('应用 · ' + name, error); } catch {} ctx.notify(error.message, {error: true}); };
  let disposed = false, backAt = 0;
  // ---------- motion between drawings of the page ----------
  const motionOn = () => typeof root.animate === 'function' && !ctx.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches && root.isConnected;
  root.addEventListener('click', e => { if (e.target.closest?.(BACKWARD)) backAt = Date.now(); }, {capture: true, signal: controller.signal});
  function measure() {
    const rows = new Map();
    for (const el of root.querySelectorAll(KEYED)) { const k = keyOf(el); if (!rows.has(k)) rows.set(k, el.getBoundingClientRect()); if (rows.size > 80) break; }
    return rows;
  }
  /** Another page (its title changed): it slides in, from the left when going back. The same page: rows glide. */
  function settleMotion(before, title) {
    const now = titleOf(root), screen = root.closest('.screen'), phoneBack = Number(screen?.dataset.navBack || 0);
    if (title && now && title !== now) {
      const dir = Date.now() - Math.max(backAt, phoneBack) < 600 ? -1 : 1;
      root.animate([{transform: `translateX(${dir * 34}px)`, opacity: .35}, {transform: 'none', opacity: 1}], {duration: 340, easing: 'cubic-bezier(.2,.9,.25,1)'});
      return;
    }
    // The first drawing of an app comes in with its own entrance.
    if (!title) return;
    let moved = 0;
    const fresh = [];
    for (const el of root.querySelectorAll(KEYED)) {
      const was = before.get(keyOf(el));
      if (!was) { fresh.push(el); continue; }
      const box = el.getBoundingClientRect(), dy = was.top - box.top;
      if (Math.abs(dy) > 1 && moved++ < 60) el.animate([{transform: `translateY(${dy}px)`}, {transform: 'none'}], {duration: 420, easing: 'cubic-bezier(.2,1.15,.3,1)'});
    }
    // Rows that came (a new message, a song added): only a few, not a whole new list.
    if (fresh.length && fresh.length <= 6) fresh.forEach((el, i) => el.animate([{opacity: 0, transform: 'translateY(10px) scale(.98)'}, {opacity: 1, transform: 'none'}], {duration: 320, delay: i * 40, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards'}));
  }
  const view = {
    root,
    back: null,
    refresh() {},
    dispose() { disposed = true; controller.abort(); },
    get disposed() { return disposed; },
    // Replaces the view content while keeping scroll position, open <details> groups and the scroll of inner lists
    // marked data-keep-scroll.
    draw(html) {
      const y = root.scrollTop, doc = root.ownerDocument, active = root.contains(doc.activeElement) ? doc.activeElement : null;
      // The box being typed in stays the one with the cursor (a field saved when left redraws the page).
      const focus = active?.dataset.field ? `[data-field="${active.dataset.field}"]` : active?.dataset.param ? `[data-param="${active.dataset.param}"]` : '';
      const opened = [...root.querySelectorAll('details[open]')].map(el => el.dataset.group);
      const inner = new Map([...root.querySelectorAll('[data-keep-scroll]')].map(el => [el.dataset.keepScroll, el.scrollTop]));
      const before = motionOn() ? measure() : null, title = before ? titleOf(root) : '';
      root.innerHTML = html;
      if (before) settleMotion(before, title);
      for (const el of root.querySelectorAll('details')) if (opened.includes(el.dataset.group)) el.open = true;
      for (const el of root.querySelectorAll('[data-keep-scroll]')) if (inner.has(el.dataset.keepScroll)) el.scrollTop = inner.get(el.dataset.keepScroll);
      root.scrollTop = y;
      const again = focus && root.querySelector(focus);
      if (again && again !== doc.activeElement) { again.focus({preventScroll: true}); if (/^(text|url|search|password)$/.test(again.type) || again.tagName === 'TEXTAREA') try { again.setSelectionRange(again.value.length, again.value.length); } catch { /* not a text box */ } }
    },
    on(type, selector, fn) {
      root.addEventListener(type, event => {
        const el = event.target.closest(selector);
        if (!el || !root.contains(el)) return;
        if (type === 'click') event.preventDefault();
        try {
          const result = fn(el, event);
          if (result?.catch) result.catch(failed);
        } catch (error) { failed(error); }
      }, {signal: controller.signal});
    },
    async busy(el, task) {
      if (el.disabled) return;
      el.disabled = true;
      try { return await task(); } finally { if (el.isConnected) el.disabled = false; }
    }
  };
  view.on('click', '[data-help]', el => ctx.help(el.dataset.help));
  bindCombos(root, controller.signal);
  return view;
}

// A browser <datalist> only lists the entries that match what is already typed (with "ja" in the box it shows only
// 日语), so the language box has its own list: every language as a chip under the box, opened by tapping the box or ▾.
// A language not in the list is simply typed in the box (粤语, 上海话, Cantonese…); while typing, the first chip offers to
// use exactly what was typed, and languages typed before come back as chips marked 自定义.
export function languageField(key, value, inherit = true, typed = []) {
  const chip = (v, t, note = v) => `<button type="button" class="combo-chip" data-combo-value="${esc(v)}" aria-pressed="${String(value) === v}">${esc(t)}${note ? `<small>${esc(note)}</small>` : ''}</button>`;
  const chips = languages.filter(([v]) => v || inherit).map(([v, t]) => chip(v, t)).join('') + typed.map(v => chip(v, v, '自定义')).join('');
  const control = `<span class="combo">${input(key, value, 'text', `placeholder="${inherit ? '留空跟随默认，也可以直接打字' : '选一个，或直接打字，比如 粤语'}" autocomplete="off"`)}<button type="button" class="combo-open" data-combo-open aria-expanded="false" aria-label="展开全部语言">${icon('down')}</button></span><span class="combo-menu" role="group" aria-label="全部语言" hidden><button type="button" class="combo-chip combo-typed" data-combo-value="" hidden></button>${chips}</span>`;
  return field('台词语言', control, '列表里没有的语言，直接在框里打字就行，比如 粤语、上海话、Cantonese，模型会照着写台词。角色留空时用默认台词语言。ElevenLabs 只认语言代码（如 ja、yue），写成名字时它会自己听出来。');
}
function bindCombos(root, signal) {
  const menuOf = el => el.closest('.field')?.querySelector('.combo-menu');
  const show = (field, open, filter = '') => {
    const menu = field.querySelector('.combo-menu'), box = field.querySelector('.combo input');
    if (!menu || !box) return;
    menu.hidden = !open;
    field.querySelector('[data-combo-open]')?.setAttribute('aria-expanded', String(open));
    const q = filter.trim().toLowerCase(), own = menu.querySelector('.combo-typed');
    for (const chip of menu.querySelectorAll('[data-combo-value]:not(.combo-typed)')) {
      chip.hidden = !!q && !chip.textContent.toLowerCase().includes(q);
      chip.setAttribute('aria-pressed', String(chip.dataset.comboValue === box.value.trim()));
    }
    // What was typed, when it is not one of the chips: 用「粤语」.
    const exact = [...menu.querySelectorAll('[data-combo-value]:not(.combo-typed)')].some(chip => chip.dataset.comboValue.toLowerCase() === q || chip.firstChild?.textContent.toLowerCase() === q);
    if (own) {
      own.hidden = !q || exact;
      own.dataset.comboValue = filter.trim();
      own.textContent = `用「${filter.trim()}」`;
    }
  };
  root.addEventListener('focusin', e => { if (e.target.matches('.combo input')) show(e.target.closest('.field'), true); }, {signal});
  root.addEventListener('click', e => {
    const opener = e.target.closest('[data-combo-open]'), pick = e.target.closest('[data-combo-value]');
    if (opener) { const f = opener.closest('.field'); show(f, menuOf(opener).hidden); return; }
    if (e.target.matches('.combo input')) { show(e.target.closest('.field'), true); return; }
    if (!pick) return;
    const f = pick.closest('.field'), box = f.querySelector('.combo input');
    box.value = pick.dataset.comboValue;
    for (const type of ['input', 'change']) box.dispatchEvent(new box.ownerDocument.defaultView.Event(type, {bubbles: true}));
    show(f, false);
  }, {signal});
  // Typing narrows the list; a value already chosen (like "ja") still opens the whole list.
  root.addEventListener('input', e => { if (e.target.matches('.combo input') && e.target.ownerDocument.activeElement === e.target) show(e.target.closest('.field'), true, e.target.value); }, {signal});
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.closest('.combo')) { const f = e.target.closest('.field'); if (!menuOf(e.target).hidden) { e.stopPropagation(); show(f, false); } } }, {signal});
  root.ownerDocument.addEventListener('pointerdown', e => {
    for (const menu of root.querySelectorAll('.combo-menu:not([hidden])')) if (!menu.closest('.field').contains(e.target)) show(menu.closest('.field'), false);
  }, {signal});
}

const drawn = f => /^image\/(png|webp)/.test(f?.blob?.type || '');
/**
 * 下载 pictures: 原图 keeps what they were drawn with (dropped into NovelAI it reads back the prompt), 不带生成信息
 * makes JPGs without it, to give away. files: [{blob, name}]; null when the choice was closed. JPGs are asked nothing.
 */
export async function pictureCopies(ctx, files) {
  if (!files.some(drawn)) return files;
  const pick = await menu(ctx, '下载哪种？', [
    {key: 'original', icon: 'image', label: '原图', note: '带着生成信息，拖进 NovelAI 能读出提示词和参数'},
    {key: 'plain', icon: 'lock', label: '不带生成信息', note: '转成 JPG 再下载，别人拿到也读不出提示词'}]);
  if (pick !== 'plain') return pick ? files : null;
  return Promise.all(files.map(async f => drawn(f) ? {...f, blob: await plainImage(ctx.doc, f.blob)} : f));
}
