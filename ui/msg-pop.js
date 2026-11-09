// A message's long-press menu as QQ shows it (0.9.47): a small dark card right above the bubble (under it when there is
// no room), its arrow on the bubble; 回应 in a row on top, the actions as icons with a word under them. It is a dialog
// like any other (closing, focus, tests), only placed and drawn differently. With no bubble to point at (a menu opened
// from another sheet) it stays a bottom sheet.
export function popAt(d, anchor, {win, reduced = false} = {}) {
  const sheet = d?.overlay?.querySelector('.sheet');
  if (!sheet || !anchor?.isConnected) return false;
  d.overlay.classList.add('msg-pop');
  const o = d.overlay.getBoundingClientRect(), a = anchor.getBoundingClientRect();
  if (!o.width || !o.height) return true;
  const w = sheet.offsetWidth, h = sheet.offsetHeight, gap = 10, edge = 8;
  const mid = a.left - o.left + a.width / 2;
  const left = Math.max(edge, Math.min(o.width - w - edge, mid - w / 2));
  let top, side;
  if (a.top - o.top - h - gap >= edge) { top = a.top - o.top - h - gap; side = 'down'; }
  else if (a.bottom - o.top + gap + h <= o.height - edge) { top = a.bottom - o.top + gap; side = 'up'; }
  else { top = Math.max(edge, (o.height - h) / 2); side = ''; }
  const ax = Math.max(18, Math.min(w - 18, mid - left));
  Object.assign(sheet.style, {left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, transformOrigin: `${Math.round(ax)}px ${side === 'up' ? 0 : side === 'down' ? h : h / 2}px`});
  sheet.style.setProperty('--ax', `${Math.round(ax)}px`);
  sheet.dataset.arrow = side;
  if (!reduced && typeof sheet.animate === 'function') sheet.animate([{opacity: 0, transform: 'scale(.86)'}, {opacity: 1, transform: 'scale(1)'}], {duration: 200, easing: 'cubic-bezier(.2,1.35,.4,1)'});
  return true;
}
