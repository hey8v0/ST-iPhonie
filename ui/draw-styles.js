// 画风 in the drawing app: the list and the editor. The list works the way Procreate's layers do. A tap uses a 画风; a
// tap on a group opens or shuts it. Held still, a row lifts and follows the finger while the others make room: a 画风
// goes between others, into an open group or out of one, or onto a shut group's row (into it); a group moves with all
// its 画风. Swiped left a row shows 改 / 复制 / 删除 (a group: 改名 / 解散 / 删除); swiped right rows are picked, to put
// them in a new group or delete them. Every 画风 shows at once (rows are text, and groups fold); the search box finds
// one by its name or 画师串, and while it is used the list is flat and does not move.
// Each 画风 keeps its NovelAI parameters (core/draw.js STYLE_PARAM_KEYS): shown in its row and its editor, and put back
// when it is picked.
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {esc, btn, field, input, textArea} from './common.js';
import {icon} from './icons.js';
import {moving, nudge} from './carry.js';
import {styleTree} from '../core/draw.js';

/** One line for a 画风's parameters: 「V4.5 Full · 28 步 · CFG 5 · k_euler_ancestral」. */
export const paramLine = (p, names = {}) => [names[p.model] || p.model, `${p.steps} 步`, `CFG ${p.scale}`, p.sampler].join(' · ');

// How far a moved row is pushed in when it would land in a group (phone.css sets a group's 画风 in by as much), how far the
// finger moves sideways to take a row at a group's end in or out of it, and how near the scroller's edge it scrolls.
const INDENT = 22, SIDEWAYS = 24, EDGE = 56;
const norm = s => String(s ?? '').normalize('NFKC').toLocaleLowerCase();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** state(): the drawing settings; styleId() / style(): the 画风 in use (its id / itself); render(): draws the app again. */
export function styleSheets({ctx, state, styleId, style, render}) {
  const {api, win} = ctx;
  const line = p => paramLine(p, api.drawCatalog?.modelNames);
  /** The list as it shows, in the shape api.arrangeStyles takes. */
  const tree = () => styleTree(state()).map(e => e.style ? {style: e.style.id} : {group: {...e.group}, styles: e.styles.map(s => s.id)});
  const groupOf = id => tree().find(e => e.group?.id === id) || null;
  /** Picked rows as 画风: a group's row stands for its 画风. */
  const stylesOf = ids => [...new Set(ids.flatMap(id => id.startsWith('g:') ? groupOf(id.slice(2))?.styles || [] : [id]))];
  const groupName = () => { const taken = new Set(state().styleGroups.map(g => g.name)); for (let n = 1; ; n++) { const name = n === 1 ? '新建组' : `新建组 ${n}`; if (!taken.has(name)) return name; } };
  const buzz = () => { try { win.navigator?.vibrate?.(8); } catch { /* none */ } };

  function pickStyle() {
    const all = () => state().styles;
    const d = ctx.dialog('画风', `<div class="style-picker"><div class="picker-search" hidden><input type="search" data-style-search aria-label="搜索画风、画师串" placeholder="搜索画风、画师串…" autocomplete="off"></div><div class="style-list" data-style-list></div></div>`, {add: '新建画风'});
    const list = d.body.querySelector('[data-style-list]'), search = d.body.querySelector('[data-style-search]');
    let query = '';
    const styleActions = () => [{key: 'edit', label: '改', icon: 'edit'}, {key: 'copy', label: '复制', icon: 'copy'}, ...(all().length > 1 ? [{key: 'delete', label: '删除', icon: 'trash', danger: true}] : [])];
    const groupActions = [{key: 'rename', label: '改名', icon: 'edit'}, {key: 'ungroup', label: '解散', icon: 'layers'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}];
    const styleRow = (s, using) => swipeRow(s.id, `<div class="list-row style-row" aria-current="${s.id === using}">${icon(s.id === using ? 'check' : 'paint')}<span><strong>${esc(s.name)}</strong><small class="mono picker-preview">${esc(s.artist || '没有画师串')}</small>${s.params ? `<small class="style-params">${esc(line(s.params))}</small>` : ''}</span></div>`, styleActions(), {label: s.name});
    const groupRows = (g, styles, using) => swipeRow('g:' + g.id, `<div class="list-row style-group-row" aria-expanded="${g.open}"><span class="style-group-chevron">${icon('chevron')}</span><span class="style-group-art">${icon('layers')}</span><span><strong data-group-name>${esc(g.name)}</strong><small>${styles.length} 个画风${styles.some(s => s.id === using) ? ' · 在用的在里面' : ''}</small></span></div>`, groupActions, {className: 'style-group', label: g.name})
      + `<div class="style-group-body" data-group-body="${esc(g.id)}"${g.open ? '' : ' data-closed'}><div class="style-group-inner">${styles.map(s => styleRow(s, using)).join('')}</div></div>`;
    function paint() {
      const using = styleId(), draw = state();
      list.classList.toggle('searching', !!query);
      if (query) {
        const found = styleTree(draw).flatMap(e => e.style ? [e.style] : e.styles).filter(s => norm(s.name + ' ' + s.artist).includes(query));
        list.innerHTML = found.map(s => styleRow(s, using)).join('') || '<p class="hint">没有匹配的画风</p>';
      } else list.innerHTML = styleTree(draw).map(e => e.style ? styleRow(e.style, using) : groupRows(e.group, e.styles, using)).join('');
      search.closest('.picker-search').hidden = draw.styles.length <= 6 && !query;
    }
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
    const arrange = (next, before, carried) => flip(() => { api.arrangeStyles(next); paint(); }, before, carried);
    const again = () => { swipe.dispose(); d.close(); pickStyle(); };

    /** A group opened or shut, in place: its body folds by itself (phone.css) and the rows under it follow. */
    function toggle(gid) {
      const next = tree(), entry = next.find(e => e.group?.id === gid);
      if (!entry) return;
      entry.group.open = !entry.group.open;
      api.arrangeStyles(next);
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
        if (keep && value && entry && value !== entry.group.name) { entry.group.name = value; try { api.arrangeStyles(next); } catch (error) { ctx.notify(error.message, {error: true}); } }
        paint();
      };
      box.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
      box.addEventListener('blur', () => finish(true));
    }
    /** The picked 画风 (and groups) in a new group, where the first of them was; its 画风 keep their order. */
    function makeGroup(ids) {
      const picked = new Set(stylesOf(ids));
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
      /** The list after the move, in the shape api.arrangeStyles takes. */
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
            flip(() => { if (!same) try { api.arrangeStyles(next); } catch (error) { ctx.notify(error.message, {error: true}); } paint(); }, before, id);
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

    paint();
    const swipe = mountSwipeList(list, {ctx,
      hint: '点一下用这个画风，按住可以拖动排序；左滑：改、复制、删除；右滑：多选、建组；点组：展开或收起',
      mouseHint: '点一下用这个画风，按住可以拖动排序；⋯ 或右键：改、复制、删除；Ctrl / ⌘ 点：多选、建组；点组：展开或收起',
      sort: {start: (row, point) => query ? null : lift(row, point)},
      onTap: id => {
        if (id.startsWith('g:')) return toggle(id.slice(2));
        api.saveDraw({activeStyle: id}); d.close(); render();
      },
      onAction: async (key, id) => {
        try {
          if (id.startsWith('g:')) {
            const gid = id.slice(2), entry = groupOf(gid);
            if (!entry) return;
            if (key === 'rename') rename(gid);
            else if (key === 'ungroup') arrange(tree().flatMap(e => e.group?.id === gid ? e.styles.map(s => ({style: s})) : [e]));
            else if (key === 'delete') {
              if (entry.styles.length >= all().length) throw Error('至少要留一个画风');
              if (!await ctx.confirm(`删除组「${entry.group.name}」？`, `里面的 ${entry.styles.length} 个画风会一起删掉。只想拆开组，用「解散」。`)) return;
              api.deleteStyles(entry.styles); render(); again();
            }
            return;
          }
          const target = all().find(x => x.id === id);
          if (!target) return;
          if (key === 'edit') { swipe.dispose(); d.close(); editStyle(target); }
          else if (key === 'copy') {
            const before = places();
            api.saveStyle({name: (target.name + ' 副本').slice(0, 40), artist: target.artist, positive: target.positive, negative: target.negative, params: target.params, after: target.id});
            flip(paint, before);
            ctx.notify('复制好了');
          } else if (key === 'delete' && await ctx.confirm(`删除画风「${target.name}」？`, '其他画风保留。')) { api.deleteStyle(id); render(); again(); }
        } catch (error) { ctx.notify(error.message, {error: true}); }
      },
      bulk: [{key: 'group', label: '建组', icon: 'layers'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}],
      onBulk: async (key, ids) => {
        if (key === 'group') return makeGroup(ids);
        if (key !== 'delete') return;
        const styles = stylesOf(ids);
        if (styles.length >= all().length) throw Error('至少要留一个画风');
        if (!await ctx.confirm(`删除这 ${styles.length} 个画风？`, '其他画风保留。')) return;
        api.deleteStyles(styles); render(); again();
      }});
    search.addEventListener('input', () => { query = norm(search.value).trim(); swipe.done(); paint(); });
    d.onClose?.(() => swipe.dispose());
    d.overlay.addEventListener('click', e => {
      if (!e.target.closest('[data-sheet-add]')) return;
      try {
        const now = style(), created = api.saveStyle({name: '新画风 ' + (all().length + 1), artist: '', positive: now.positive, negative: now.negative});
        api.saveDraw({activeStyle: created.id});
        swipe.dispose(); d.close(); render(); editStyle(created);
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** A style (the one in use unless another is given), in a sheet: saved with its button, left as it was when the sheet is closed. */
  function editStyle(which = style()) {
    const s = {...which};
    const d = ctx.dialog('画风', `${field('名字', input('name', s.name, 'text', 'maxlength="40"'))}
      ${field('画师串', textArea('artist', s.artist, 'class="code" rows="3" placeholder="例如 artist:wlop, artist:ciloranko"'), '正文出图和这里单独生图都会带上画风。每个引擎记住自己用的画风；GPT 不读画师串和固定负面。')}
      ${field('固定正面', textArea('positive', s.positive, 'class="code" rows="3"'))}
      ${field('固定负面', textArea('negative-fixed', s.negative, 'class="code" rows="3"'))}
      ${s.params ? field('NovelAI 参数', `<p class="style-param-line">${esc(line(s.params))}</p>`, '这个画风记住的模型、步数、CFG、采样器和噪声调度。选这个画风时自动换上；它在用的时候，在绘图里改这些参数会记到它身上。尺寸和种子是每张图自己的，不跟画风走。') : ''}
      <div class="actions">${btn('save-style', '保存画风', 'primary')}</div>`);
    d.body.addEventListener('input', e => { const key = e.target.dataset.field; if (key) s[key === 'negative-fixed' ? 'negative' : key] = e.target.value; });
    d.body.addEventListener('click', e => {
      if (!e.target.closest('[data-action=save-style]')) return;
      if (!s.name.trim()) { ctx.notify('请填写画风名字'); return; }
      try { api.saveStyle(s); d.close(); render(); ctx.notify('画风已保存'); } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }


  return {pickStyle, editStyle};
}
