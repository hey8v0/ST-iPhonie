// Small touches that make the phone feel alive, all skipped when the system asks for reduced motion:
// - a ripple spreading from where a row, tile or tab was pressed;
// - on devices with a mouse, a soft light following the pointer over cards and widgets.
// - the chosen button of a 分段 row: its fill slides over to the one tapped.
// Entrance, press and idle animations are plain CSS (phone.css, "Motion").
const RIPPLE = '.list-row,.conv,.control-tile,.segmented button,.qq-tabs button,.deco,.tool';
const SPOT = '.widget,.bank-card,.control-tile,.qq-card';

/** A copy of the chosen button's fill, under the buttons, carried from where it was (from) to the new one (to). */
function slidePill(win, bar, to, from) {
  const box = bar.getBoundingClientRect(), end = to.getBoundingClientRect();
  if (Math.abs(end.left - from.left) < 2 || !end.width) return;
  const look = win.getComputedStyle(to), pill = win.document.createElement('i');
  pill.className = 'seg-pill';
  pill.setAttribute('aria-hidden', 'true');
  pill.style.cssText = `left:${end.left - box.left - bar.clientLeft}px;top:${end.top - box.top - bar.clientTop}px;width:${end.width}px;height:${end.height}px;background:${look.backgroundColor};box-shadow:${look.boxShadow};border-radius:${look.borderRadius}`;
  to.classList.add('seg-arriving');
  bar.prepend(pill);
  // The button takes its own fill back at once (its transition would show a flicker where the copy just was).
  const done = () => { to.style.transition = 'none'; to.classList.remove('seg-arriving'); void to.offsetWidth; to.style.transition = ''; pill.remove(); };
  pill.animate([{transform: `translateX(${from.left - end.left}px) scaleX(${from.width / end.width})`}, {transform: 'none'}],
    {duration: 440, easing: 'cubic-bezier(.3,1.3,.4,1)'}).finished.then(done, done);
}

/** Long notes (how a thing works) fold into a small 「ⓘ 说明」: shown when asked for, not as walls of text. */
const NOTE = 'p.hint, p.help-copy';
const NOTE_LONG = 44;
const kept = p => p.closest('[data-keep-notes],.sheet-help,.toast,[role=status],[role=alert],.note-fold') || p.matches('.sw-hint,.moments-busy,.error-copy,[data-keep-hint]');
/** A long note goes into a fold behind 「ⓘ 说明」, with the notes right after it (short ones too: they belong to it). */
function foldNotes(doc, root) {
  for (const p of root.querySelectorAll?.(NOTE) || []) {
    if (p.dataset.folded || p.hidden || !p.isConnected || kept(p)) continue;
    if (p.textContent.replace(/\s+/g, '').length < NOTE_LONG) continue;
    const fold = doc.createElement('div');
    fold.className = 'note-fold'; fold.hidden = true;
    const chip = doc.createElement('button');
    chip.type = 'button'; chip.className = 'note-chip'; chip.setAttribute('aria-expanded', 'false');
    chip.innerHTML = '<i aria-hidden="true">i</i><span>说明</span>';
    p.before(chip); chip.after(fold);
    let next = p;
    while (next && next.matches?.(NOTE) && !kept(next)) { const after = next.nextElementSibling; next.dataset.folded = ''; fold.append(next); next = after; }
  }
}

export function installMotion(win, mount, signal) {
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)'), hover = win.matchMedia('(hover: hover) and (pointer: fine)');
  // ---------- notes: folded, and opened in place ----------
  foldNotes(win.document, mount);
  const watch = new win.MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.(NOTE)) foldNotes(win.document, n.parentElement || n); else foldNotes(win.document, n); } });
  watch.observe(mount, {childList: true, subtree: true});
  signal?.addEventListener?.('abort', () => watch.disconnect());
  mount.addEventListener('click', e => {
    const chip = e.target.closest?.('.note-chip');
    if (!chip) return;
    const note = chip.nextElementSibling, open = chip.getAttribute('aria-expanded') !== 'true';
    if (!note) return;
    chip.setAttribute('aria-expanded', String(open));
    note.hidden = !open;
    if (open && !reduced.matches && typeof note.animate === 'function') note.animate([{opacity: 0, transform: 'translateY(-6px)'}, {opacity: 1, transform: 'none'}], {duration: 260, easing: 'cubic-bezier(.2,.9,.25,1)'});
  }, {signal});
  // ---------- 展开 / 收起: a fold grows open and shrinks shut instead of jumping ----------
  mount.addEventListener('click', e => {
    const summary = e.target.closest?.('summary');
    if (!summary || reduced.matches || e.defaultPrevented || e.target.closest('input,button,select,textarea,a,label') && e.target.closest('input,button,select,textarea,a,label') !== summary) return;
    const fold = summary.parentElement;
    if (fold?.tagName !== 'DETAILS' || typeof fold.animate !== 'function' || fold.matches('[data-instant]')) return;
    // A menu that floats over the page (its content is placed absolutely) opens at once.
    const inside = [...fold.children].find(c => c !== summary);
    if (inside && /absolute|fixed/.test(win.getComputedStyle(inside).position)) return;
    e.preventDefault();
    fold._grow?.cancel();
    const from = fold.offsetHeight, edge = fold.offsetHeight - fold.clientHeight;
    const opening = !fold.open;
    if (opening) fold.open = true;
    const to = opening ? fold.offsetHeight : summary.offsetHeight + edge;
    fold.style.overflow = 'hidden';
    const grow = fold._grow = fold.animate({height: [`${from}px`, `${to}px`]}, {duration: opening ? 340 : 260, easing: opening ? 'cubic-bezier(.2,1.05,.3,1)' : 'cubic-bezier(.4,0,.2,1)'});
    if (opening) for (const c of fold.children) if (c !== summary) c.animate([{opacity: 0, transform: 'translateY(-6px)'}, {opacity: 1, transform: 'none'}], {duration: 300, delay: 40, easing: 'ease-out', fill: 'backwards'});
    const end = () => { if (fold._grow !== grow) return; fold._grow = null; fold.style.overflow = ''; if (!opening) fold.open = false; };
    grow.finished.then(end, () => { if (fold._grow === grow) fold.style.overflow = ''; });
  }, {signal});
  mount.addEventListener('pointerdown', e => {
    if (reduced.matches || e.button > 0) return;
    const target = e.target.closest(RIPPLE);
    if (!target || target.disabled || !mount.contains(target)) return;
    const box = target.getBoundingClientRect(), size = Math.max(box.width, box.height) * 2.2;
    const wave = win.document.createElement('span');
    wave.className = 'ripple';
    wave.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - box.left - size / 2}px;top:${e.clientY - box.top - size / 2}px`;
    target.append(wave);
    wave.addEventListener('animationend', () => wave.remove(), {once: true});
    win.setTimeout(() => wave.remove(), 900);
  }, {signal, passive: true});
  // 分段: the chosen one's fill slides from the old button to the new one, also when the page is drawn anew in between
  // (the same row of buttons is found again by their words).
  const words = bar => [...bar.querySelectorAll('button')].map(b => b.textContent.trim()).join('|');
  mount.addEventListener('click', e => {
    const b = e.target.closest?.('.segmented button');
    if (!b || reduced.matches || !mount.contains(b)) return;
    const bar = b.closest('.segmented'), old = bar.querySelector('button[aria-pressed=true]');
    if (!old || old === b || typeof bar.animate !== 'function') return;
    const sig = words(bar), text = b.textContent.trim(), from = old.getBoundingClientRect();
    let tries = 0;
    const look = () => {
      const now = [...mount.querySelectorAll('.segmented')].find(s => words(s) === sig);
      const to = now && now.querySelector('button[aria-pressed=true]');
      if (!to || to.textContent.trim() !== text) { if (++tries < 24) win.requestAnimationFrame(look); return; }
      slidePill(win, now, to, from);
    };
    win.requestAnimationFrame(look);
  }, {signal, capture: true});
  let frame = 0, last = null;
  mount.addEventListener('pointermove', e => {
    if (reduced.matches || !hover.matches || e.pointerType !== 'mouse') return;
    last = e;
    if (frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      const target = last.target.closest?.(SPOT);
      if (!target) return;
      if (!target.querySelector(':scope>.spotlight')) target.insertAdjacentHTML('beforeend', '<span class="spotlight" aria-hidden="true"></span>');
      const box = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${last.clientX - box.left}px`);
      target.style.setProperty('--my', `${last.clientY - box.top}px`);
    });
  }, {signal, passive: true});
}
