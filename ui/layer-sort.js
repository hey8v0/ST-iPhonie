// Putting a grouped list in order the way Procreate's layers go (画风, 提示词片段). Held still, a row lifts and follows the
// finger while the others make room: it goes between others, into an open group or out of one, or onto a shut group's
// row (into it); a group moves with all its rows. A tap on a group opens or shuts it, picked rows make a new group, and
// the list glides to where it lands. The rows are written by swipe-list.js; a group's rows sit in [data-group-body].
import {moving, nudge} from './carry.js';

// How far a moved row is pushed in when it would land in a group (phone.css sets a group's rows in by as much), how far the
// finger moves sideways to take a row at a group's end in or out of it, and how near the scroller's edge it scrolls.
const INDENT = 22, SIDEWAYS = 24, EDGE = 56;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * list: the element with the rows. tree(): the list as [{style: id} | {group: {id, name, open}, styles: [id]}] (a row of
 * any kind goes under `style`). commit(next): keeps such a list. paint(): draws the rows. groupName(): a name for a new group.
 */
export function layerSort({ctx, list, tree, commit, paint, groupName}) {
  const {win} = ctx;
  const buzz = () => { try { win.navigator?.vibrate?.(8); } catch { /* none */ } };
  const rows = () => [...list.querySelectorAll('.sw-row[data-swipe]')];
  const rowOf = id => rows().find(r => r.dataset.swipe === id) || null;
  const bodyOf = id => [...list.querySelectorAll('[data-group-body]')].find(b => b.dataset.groupBody === id) || null;
  /** Where each row is on screen now (moved aside or carried, as it is seen); null when it is out of sight in a shut group. */
  const places = () => new Map(rows().map(r => [r.dataset.swipe, r.closest('[data-closed]') ? null : r.getBoundingClientRect().top]));
  /** Draws the list again: rows glide from where they were to where they are now, rows that come pop in. */
  function flip(change, before = places(), carried = '') {
    change();
    if (!moving(win)) return;
    for (const r of rows()) {
      if (r.closest('[data-closed]')) continue;
      const was = before.get(r.dataset.swipe), now = r.getBoundingClientRect().top;
      if (was === undefined || was === null) nudge(win, r, [{opacity: 0, transform: 'scale(.94)'}, {opacity: 1, transform: 'none'}], {duration: 320, easing: 'bounce'});
      else if (r.dataset.swipe === carried) nudge(win, r, [{transform: `translateY(${was - now}px) scale(1.03)`}, {transform: 'none'}], {duration: 420, easing: 'soft'});
      else if (Math.abs(was - now) > .5) nudge(win, r, [{transform: `translateY(${was - now}px)`}, {transform: 'none'}], {duration: 380, easing: 'soft'});
    }
  }
  const arrange = (next, before, carried) => flip(() => { commit(next); paint(); }, before, carried);

  /** A group opened or shut, in place: its body folds by itself (phone.css) and the rows under it follow. */
  function toggle(gid) {
    const next = tree(), entry = next.find(e => e.group?.id === gid);
    if (!entry) return;
    entry.group.open = !entry.group.open;
    commit(next);
    rowOf('g:' + gid)?.querySelector('.style-group-row')?.setAttribute('aria-expanded', String(entry.group.open));
    bodyOf(gid)?.toggleAttribute('data-closed', !entry.group.open);
  }
  /** 改名 in the row itself: Enter or leaving the box keeps it, Esc does not. */
  function rename(gid) {
    const name = rowOf('g:' + gid)?.querySelector('[data-group-name]');
    if (!name) return;
    const box = ctx.doc.createElement('input');
    Object.assign(box, {className: 'style-group-name-input', value: name.textContent, maxLength: 40});
    box.setAttribute('aria-label', '组的名字');
    name.replaceWith(box);
    box.focus(); box.select();
    let done = false;
    const finish = keep => {
      if (done) return;
      done = true;
      const value = box.value.trim(), next = tree(), entry = next.find(e => e.group?.id === gid);
      if (keep && value && entry && value !== entry.group.name) { entry.group.name = value; try { commit(next); } catch (error) { ctx.notify(error.message, {error: true}); } }
      paint();
    };
    box.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
    box.addEventListener('blur', () => finish(true));
  }
  /** The picked 画风 (and groups) in a new group, where the first of them was; its 画风 keep their order. */
  function makeGroup(ids) {
    const groupOf = id => tree().find(e => e.group?.id === id) || null, picked = new Set(ids.flatMap(id => id.startsWith('g:') ? groupOf(id.slice(2))?.styles || [] : [id]));
    if (!picked.size) return;
    const now = tree(), group = {group: {name: groupName(), open: true}, styles: now.flatMap(e => e.style ? [e.style] : e.styles).filter(id => picked.has(id))}, next = [];
    let placed = false;
    for (const e of now) {
      const left = e.style ? (picked.has(e.style) ? [] : [e.style]) : e.styles.filter(id => !picked.has(id));
      if (!placed && left.length < (e.style ? 1 : e.styles.length)) { next.push(group); placed = true; }
      if (e.style) { if (left.length) next.push(e); } else if (left.length) next.push({group: e.group, styles: left});
    }
    arrange(next);
  }

  // ---------- moving a row ----------
  /** Held still: the row lifts; the session follows the finger and puts the row down where it lets go. */
  function lift(row, point) {
    const id = row.dataset.swipe, gid = id.startsWith('g:') ? id.slice(2) : '', main = row.querySelector('.sw-main');
    const box = list.closest('.sheet-body') || list.parentElement, frame = box.getBoundingClientRect();
    const closed = g => !!bodyOf(g)?.hasAttribute('data-closed');
    // A group is carried shut, its 画风 under it.
    const own = gid ? bodyOf(gid) : null, wasOpen = !!own && !own.hasAttribute('data-closed');
    if (wasOpen) { own.style.transition = 'none'; own.setAttribute('data-closed', ''); void own.offsetHeight; own.style.transition = ''; }
    const at = el => { const r = el.getBoundingClientRect(); return {top: r.top - frame.top + box.scrollTop, height: r.height}; };
    const self = at(row), from0 = row.closest('[data-group-body]')?.dataset.groupBody || '', items = [];
    for (const r of rows()) {
      if (r === row) continue;
      const inGroup = r.closest('[data-group-body]')?.dataset.groupBody || '';
      if (inGroup && (inGroup === gid || closed(inGroup))) continue;
      const rid = r.dataset.swipe, kind = rid.startsWith('g:') ? 'group' : 'style';
      items.push({el: r, kind, id: rid, group: kind === 'group' ? rid.slice(2) : inGroup, ...at(r), shift: 0});
    }
    const from = items.filter(it => it.top < self.top).length, grab = point.y - frame.top + box.scrollTop - self.top;
    let last = point, k = from, group = from0, into = '', over = null, raf = 0, over0 = '';
    // The row itself follows the finger at once; its face lifts (and is set in for a group) on its own spring.
    list.classList.add('sorting');
    row.classList.add('lifted');
    /** Where the row would land for the finger now: the others moved aside to make room. */
    function follow() {
      const top = last.y - frame.top + box.scrollTop - grab, middle = top + self.height / 2;
      let n = 0;
      while (n < items.length && items[n].top + items[n].height / 2 < middle) n++;
      into = '';
      if (gid) {
        // A group lands only between other rows and groups, before or after a group, not inside one.
        const inside = items[n]?.kind === 'style' && items[n].group;
        if (inside) {
          const head = items.findIndex(it => it.kind === 'group' && it.group === inside);
          let end = n; while (end < items.length && items[end].kind === 'style' && items[end].group === inside) end++;
          const span = items[end - 1].top + items[end - 1].height - items[head].top;
          n = middle < items[head].top + span / 2 ? head : end;
        }
        group = '';
      } else {
        const shut = items.find(it => it.kind === 'group' && closed(it.group) && middle > it.top + it.height * .25 && middle < it.top + it.height * .75);
        const above = items[n - 1], below = items[n];
        if (shut) { into = shut.group; n = from; group = from0; }
        else if (below?.kind === 'style' && below.group) group = below.group;
        else if (above?.kind === 'group' && !closed(above.group)) group = above.group;
        else if (above?.kind === 'style' && above.group) {
          // Just after a group's last 画风: it stays as it came (in or out) unless the finger goes sideways.
          const dx = last.x - point.x;
          group = above.group === from0 ? (dx < -SIDEWAYS ? '' : above.group) : (dx > SIDEWAYS ? above.group : '');
        } else group = '';
      }
      k = n;
      items.forEach((it, i) => {
        const shift = i >= k && i < from ? self.height : i >= from && i < k ? -self.height : 0;
        if (shift !== it.shift) { it.shift = shift; it.el.style.transform = shift ? `translateY(${shift}px)` : ''; }
      });
      row.style.transform = `translate3d(0,${(top - self.top).toFixed(1)}px,0)`;
      const push = into ? 0 : (group ? INDENT : 0) - (from0 ? INDENT : 0);
      // Over a shut group the row shrinks and lets it show through, lit up: let go, it goes in.
      main.style.transform = `translateX(${push}px) scale(${into ? .9 : 1.03})`;
      row.classList.toggle('into', !!into);
      if (into !== over0) {
        over?.el.classList.remove('drop-into');
        over0 = into; over = into ? items.find(it => it.kind === 'group' && it.group === into) : null;
        if (over) { over.el.classList.add('drop-into'); buzz(); }
      }
    }
    /** Near the top or bottom of the sheet the list scrolls, faster the nearer the finger is. */
    function scroll() {
      raf = 0;
      const y = last.y, v = y < frame.top + EDGE ? -(frame.top + EDGE - y) : y > frame.bottom - EDGE ? y - (frame.bottom - EDGE) : 0;
      if (!v) return;
      const was = box.scrollTop;
      box.scrollTop = clamp(was + v / 3, 0, box.scrollHeight - box.clientHeight);
      // at the end of the list it stops (the next move starts it again)
      if (box.scrollTop === was) return;
      follow();
      raf = win.requestAnimationFrame(scroll);
    }
    /** The list after the move, in the shape of tree(). */
    function result() {
      const seq = items.map(it => it.kind === 'group' ? {head: it.group} : {style: it.id, group: it.group});
      if (gid) seq.splice(k, 0, {head: gid});
      else if (!into) seq.splice(k, 0, {style: id, group});
      const groups = new Map(tree().filter(e => e.group).map(e => [e.group.id, e])), out = [], entries = new Map();
      for (const x of seq) {
        if (x.head) {
          const e = groups.get(x.head), whole = x.head === gid || closed(x.head);
          const entry = {group: {...e.group, ...(x.head === gid ? {open: wasOpen} : {})}, styles: whole ? e.styles.filter(s => s !== id) : []};
          out.push(entry); entries.set(x.head, entry);
        } else if (x.group && entries.has(x.group)) entries.get(x.group).styles.push(x.style);
        else out.push({style: x.style});
      }
      if (into) entries.get(into)?.styles.push(id);
      return out;
    }
    const stop = () => { win.cancelAnimationFrame(raf); raf = 0; over?.el.classList.remove('drop-into'); };
    follow();
    return {
      move(x, y) { last = {x, y}; follow(); if (!raf) raf = win.requestAnimationFrame(scroll); },
      drop() {
        stop();
        const next = result(), same = JSON.stringify(next) === JSON.stringify(tree());
        const land = () => {
          const before = places();
          list.classList.remove('sorting');
          flip(() => { if (!same) try { commit(next); } catch (error) { ctx.notify(error.message, {error: true}); } paint(); }, before, id);
        };
        // Onto a shut group: the row sinks into the group's row, which pops.
        if (into && over && moving(win)) {
          const dy = over.top + over.shift - self.top;
          const sink = row.animate([{transform: row.style.transform, opacity: 1}, {transform: `translate3d(0,${dy.toFixed(1)}px,0) scale(.6)`, opacity: 0}], {duration: 220, easing: 'ease-in', fill: 'forwards'});
          const head = over.el;
          sink.finished.then(() => { land(); const now = rowOf(head.dataset.swipe); if (now) nudge(win, now, [{transform: 'scale(1)'}, {transform: 'scale(1.04)'}, {transform: 'scale(1)'}], {duration: 360, easing: 'bounce'}); }, land);
          return;
        }
        land();
      },
      cancel() {
        stop();
        for (const it of items) it.el.style.transform = '';
        row.style.transform = ''; main.style.transform = '';
        row.classList.remove('lifted', 'into');
        if (wasOpen) own.removeAttribute('data-closed');
        win.setTimeout(() => list.classList.remove('sorting'), 280);
      },
    };
  }
  return {rows, rowOf, bodyOf, places, flip, arrange, toggle, rename, makeGroup, lift};
}
