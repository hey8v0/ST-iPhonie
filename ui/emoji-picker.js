// The whole emoji set and the 颜文字, by category (0.9.47): the chat's 表情 panel and the 回应 「＋」 use the same grid.
// Recent picks come first (kept on this device). Only the first sections are drawn at once; the rest fill in idle
// frames, so opening the panel stays quick with nearly two thousand emoji.
import {EMOJI_GROUPS} from './emoji-data.js';
import {KAOMOJI_GROUPS} from './kaomoji-data.js';

const KEYS = {emoji: 'st-iphonie-recent-emoji', kao: 'st-iphonie-recent-kaomoji'};
const RECENT_MAX = {emoji: 24, kao: 16};
const html = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
export const emojiOf = group => group.list.split(' ').filter(Boolean);

/** The recent picks of one kind (emoji | kao), newest first. */
export function recentOf(storage, kind) {
  try { const list = JSON.parse(storage?.getItem(KEYS[kind]) || '[]'); return Array.isArray(list) ? list.filter(x => typeof x === 'string' && x).slice(0, RECENT_MAX[kind]) : []; }
  catch { return []; }
}
/** Remembers a pick: to the front, once. */
export function useRecent(storage, kind, value) {
  if (!value) return;
  try { storage?.setItem(KEYS[kind], JSON.stringify([value, ...recentOf(storage, kind).filter(x => x !== value)].slice(0, RECENT_MAX[kind]))); } catch { /* private mode: no recents */ }
}

const groupsOf = kind => kind === 'kao' ? KAOMOJI_GROUPS.map(g => ({...g, items: g.list})) : EMOJI_GROUPS.map(g => ({...g, items: emojiOf(g)}));
const cells = (kind, items, action) => items.map(e => `<button type="button" data-action="${action}" data-emoji="${html(e)}" data-kind="${kind}" aria-label="${html(e)}">${html(e)}</button>`).join('');

/**
 * The picker for one kind: a scrolling list of sections (最近使用 first, when there are some) and a bar of categories
 * under it. eager: how many sections are drawn now; the others are filled by fillPicker.
 */
export function pickerHTML(kind, {recent = [], action = 'emoji-pick', eager = 2} = {}) {
  const groups = groupsOf(kind), all = [...(recent.length ? [{key: 'recent', name: '最近使用', items: recent}] : []), ...groups];
  const sections = all.map((g, i) => `<section class="ep-sec" data-sec="${g.key}"><h4>${html(g.name)}</h4><div class="ep-grid ${kind === 'kao' ? 'kao' : 'emo'}"${i < eager ? '' : ` data-fill="${g.key}" style="min-height:${Math.ceil(g.items.length / (kind === 'kao' ? 3 : 8)) * (kind === 'kao' ? 38 : 40)}px"`}>${i < eager ? cells(kind, g.items, action) : ''}</div></section>`).join('');
  const bar = all.map((g, i) => `<button type="button" data-action="ep-cat" data-sec="${g.key}" aria-label="${html(g.name)}" aria-current="${i === 0}">${kind === 'kao' ? html(g.name) : g.key === 'recent' ? '🕘' : html(g.items[0])}</button>`).join('');
  return `<div class="ep" data-kind="${kind}" data-action-name="${action}"><div class="ep-scroll">${sections}</div><nav class="ep-cats ${kind === 'kao' ? 'kao' : 'emo'}" aria-label="分类">${bar}</nav></div>`;
}
/** Fills the sections not drawn yet, one per idle frame (all at once where there are no frames, as in tests). */
export function fillPicker(root, win) {
  const picker = root?.querySelector('.ep');
  if (!picker) return;
  const kind = picker.dataset.kind, action = picker.dataset.actionName, groups = groupsOf(kind);
  const next = () => {
    const box = picker.querySelector('[data-fill]');
    if (!box || !picker.isConnected) return;
    const g = groups.find(x => x.key === box.dataset.fill);
    box.removeAttribute('data-fill'); box.style.minHeight = '';
    box.innerHTML = g ? cells(kind, g.items, action) : '';
    later(next);
  };
  // (Safari has no requestIdleCallback: a short timer, one section each.)
  const later = fn => win?.requestIdleCallback ? win.requestIdleCallback(fn, {timeout: 120}) : win?.setTimeout ? win.setTimeout(fn, 16) : fn();
  later(next);
}
/** Category taps scroll to the section; scrolling lights the category in view (one read per frame). */
export function bindPicker(root, win) {
  const picker = root?.querySelector('.ep');
  if (!picker || picker.dataset.bound) return;
  picker.dataset.bound = '1';
  const scroll = picker.querySelector('.ep-scroll'), cats = [...picker.querySelectorAll('[data-action=ep-cat]')];
  const light = key => { for (const c of cats) c.setAttribute('aria-current', String(c.dataset.sec === key)); picker.querySelector(`[data-action=ep-cat][data-sec="${key}"]`)?.scrollIntoView?.({block: 'nearest', inline: 'nearest'}); };
  picker.addEventListener('click', e => {
    const cat = e.target.closest('[data-action=ep-cat]');
    if (!cat) return;
    e.stopPropagation();
    const sec = picker.querySelector(`.ep-sec[data-sec="${cat.dataset.sec}"]`);
    if (sec) scroll.scrollTo?.({top: sec.offsetTop - scroll.offsetTop, behavior: 'smooth'});
    light(cat.dataset.sec);
  });
  let queued = false;
  scroll.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    (win?.requestAnimationFrame || (fn => fn()))(() => {
      queued = false;
      const top = scroll.scrollTop + 8;
      let key = cats[0]?.dataset.sec;
      for (const sec of picker.querySelectorAll('.ep-sec')) { if (sec.offsetTop - scroll.offsetTop <= top) key = sec.dataset.sec; else break; }
      light(key);
    });
  }, {passive: true});
}
/** A sheet with the whole emoji set; resolves with the one picked (null when closed). For the 回应 「＋」. */
export function pickEmoji(ctx, {title = '选一个表情', over = false, storage = ctx.win?.localStorage} = {}) {
  return new Promise(resolve => {
    const d = ctx.dialog(title, pickerHTML('emoji', {recent: recentOf(storage, 'emoji'), action: 'ep-pick'}), {over});
    d.overlay.classList.add('ep-sheet');
    let done = false;
    d.onClose(() => { if (!done) resolve(null); });
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-action=ep-pick]');
      if (!b) return;
      done = true;
      useRecent(storage, 'emoji', b.dataset.emoji);
      d.close();
      resolve(b.dataset.emoji);
    });
    bindPicker(d.body, ctx.win);
    fillPicker(d.body, ctx.win);
  });
}
