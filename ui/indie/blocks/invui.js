// The inventory windows: the player's own (with 2×2 crafting), the crafting table (3×3), the furnace, a chest, and the
// creative inventory (every block and item, by kind, with search). Clicks work like the game: left takes or puts the
// whole stack, right takes half or puts one, shift moves it across. Touch: a long press is the right click. Pads: the
// d-pad / stick moves between slots, A left, X right, Y shift, B closes.
import {itemInfo, zhOf, ALL_ITEMS, BLOCKS} from './blocks.js';
import {craft, useGrid, stackMax, same, smeltOf, fuelOf} from './inventory.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
/** The picture and numbers of a stack (HTML). */
export function stackHtml(s, icons) {
  if (!s) return '';
  const info = itemInfo(s.id), uses = info?.tool?.uses;
  const dur = uses && s.dmg ? `<span class="dur"><i style="width:${Math.max(0, (1 - s.dmg / uses) * 100)}%;background:hsl(${Math.max(0, (1 - s.dmg / uses) * 120)},90%,45%)"></i></span>` : '';
  return `<img class="icon" src="${icons[s.id] || ''}" alt="">${s.n > 1 ? `<span class="n">${s.n}</span>` : ''}${dur}`;
}

const KINDS = [
  ['all', '全部', () => true],
  ['build', '建筑方块', n => /planks|cobble|bricks|smooth_stone|slab|wool|glass|sandstone|terracotta|_block$|obsidian|bookshelf|stone$|granite|diorite|andesite|tuff|calcite|deepslate$|mossy/.test(n) && !/ore$/.test(n) && n !== 'grass_block'],
  ['nature', '自然方块', n => { const b = BLOCKS.find(x => x.name === n); return !!b && /grass|dirt|podzol|sand|gravel|clay|ore$|_log$|leaves|sapling|fern|dandelion|poppy|orchid|allium|bluet|daisy|cornflower|lily|dead_bush|sugar_cane|cactus|mushroom|snow|ice|pumpkin|melon|moss|mud|bedrock|stone$|deepslate$/.test(n); }],
  ['use', '功能方块', n => /crafting|furnace|chest|torch|ladder|lantern|glowstone|tnt|bookshelf/.test(n)],
  ['tools', '工具', n => /_pickaxe|_axe|_shovel|_hoe|_sword|bucket/.test(n)],
  ['items', '材料与食物', n => !BLOCKS.find(x => x.name === n) && !/_pickaxe|_axe|_shovel|_hoe|_sword|bucket/.test(n)],
  ['bag', '背包', null],
];

export class InventoryUI {
  /** root: the .inv element; game: {inv, icons, creative(), drop(stack), sound(name), tick hooks}. */
  constructor(root, game) {
    this.root = root; this.game = game; this.cursor = null; this.open = false; this.kind = null; this.focus = 0; this.tab = 'all'; this.query = '';
    this.grid = []; this.out = null;
    root.addEventListener('pointerdown', e => this.pointer(e));
    root.addEventListener('pointerup', e => this.pointerUp(e));
    root.addEventListener('pointermove', e => this.move(e));
    root.addEventListener('contextmenu', e => e.preventDefault());
  }
  /** Opens a window: 'player' | 'crafting' | 'furnace' (data: its state) | 'chest' (data: {slots}) | 'creative'. */
  show(kind, data = null) {
    this.kind = kind; this.data = data; this.open = true; this.root.hidden = false;
    this.grid = new Array(kind === 'crafting' ? 9 : kind === 'player' ? 4 : 0).fill(null);
    this.focus = 0;
    this.draw();
  }
  hide() {
    if (!this.open) return;
    const inv = this.game.inv;
    // what is in the crafting grid and the hand goes back (or falls out)
    for (const s of [...this.grid, this.cursor]) if (s) { const left = inv.add(s); if (left) this.game.drop(left); }
    this.grid = []; this.cursor = null; this.open = false; this.root.hidden = true; this.root.innerHTML = '';
    this.game.closed?.(this.kind, this.data);
  }
  // ---------- slots ----------
  /** The slots of the open window: [{key, get, set, out?, accept?, section}] in screen order. */
  slots() {
    const inv = this.game.inv, list = [], add = (section, i, arr, extra = {}) => list.push({key: `${section}:${i}`, section, get: () => arr[i], set: s => { arr[i] = s; }, ...extra});
    if (this.kind === 'creative' && this.tab !== 'bag') {
      this.items().forEach((id, i) => list.push({key: `c:${i}`, section: 'c', get: () => ({id, n: 1}), set: () => {}, source: id}));
      list.push({key: 'trash', section: 'trash', get: () => null, set: () => {}, trash: true});
    } else {
      if (this.kind === 'player' || this.kind === 'crafting') {
        this.grid.forEach((_, i) => add('g', i, this.grid));
        list.push({key: 'out', section: 'out', get: () => craft(this.grid, this.kind === 'crafting' ? 3 : 2)?.out || null, set: () => {}, out: 'craft'});
      }
      if (this.kind === 'furnace') {
        const f = this.data;
        list.push({key: 'f:in', section: 'f', get: () => f.input, set: s => { f.input = s; }});
        list.push({key: 'f:fuel', section: 'f', get: () => f.fuel, set: s => { f.fuel = s; }, accept: s => !!fuelOf(s.id)});
        list.push({key: 'f:out', section: 'f', get: () => f.output, set: s => { f.output = s; }, out: 'take'});
      }
      if (this.kind === 'chest') this.data.slots.forEach((_, i) => add('chest', i, this.data.slots));
      for (let i = 9; i < 36; i++) add('main', i, inv.slots);
    }
    for (let i = 0; i < 9; i++) add('hot', i, inv.slots);
    return list;
  }
  items() {
    const k = KINDS.find(x => x[0] === this.tab) || KINDS[0], q = this.query.trim().toLowerCase();
    return ALL_ITEMS.filter(id => k[2](id) && (!q || zhOf(id).includes(q) || id.includes(q)));
  }
  // ---------- drawing ----------
  draw() {
    if (!this.open) return;
    const icons = this.game.icons, list = this.slots();
    this.list = list;
    const slot = (s, cls = '') => `<div class="slot${cls}${list.indexOf(s) === this.focus ? ' focus' : ''}" data-k="${s.key}">${stackHtml(s.get(), icons)}</div>`;
    const sec = name => list.filter(s => s.section === name);
    const bag = `<div class="slots">${sec('main').map(s => slot(s)).join('')}</div><div class="slots" style="margin-top:calc(4*var(--u))">${sec('hot').map(s => slot(s)).join('')}</div>`;
    let body = '';
    if (this.kind === 'player' || this.kind === 'crafting') {
      const w = this.kind === 'crafting' ? 3 : 2, out = sec('out')[0];
      body = `<h3>${this.kind === 'crafting' ? '合成' : '合成'}</h3><div class="craft" style="justify-content:${this.kind === 'crafting' ? 'center' : 'flex-end'}"><div class="g${w}">${sec('g').map(s => slot(s)).join('')}</div><div class="arrow"></div>${slot(out, ' big')}</div><h3>物品栏</h3>${bag}`;
    } else if (this.kind === 'furnace') {
      const f = this.data, [fin, fuel, fout] = sec('f');
      const burn = f.burnMax ? f.burn / f.burnMax : 0, cook = (f.cook || 0) / 200;
      body = `<h3>熔炉</h3><div class="furnace">${slot(fin)}<div></div><div></div><div class="fire"><i style="height:${Math.round(burn * 100)}%"></i></div><div class="arrow"><i style="width:${Math.round(cook * 65)}%"></i></div>${slot(fout, ' big')}${slot(fuel)}<div></div><div></div></div><h3>物品栏</h3>${bag}`;
    } else if (this.kind === 'chest') {
      body = `<h3>箱子</h3><div class="slots">${sec('chest').map(s => slot(s)).join('')}</div><h3>物品栏</h3>${bag}`;
    } else if (this.kind === 'creative') {
      const tabs = `<div class="tabs">${KINDS.map(([k, label]) => `<button data-tab="${k}" class="${k === this.tab ? 'on' : ''}">${label}</button>`).join('')}</div>`;
      if (this.tab === 'bag') body = `${tabs}<h3>背包</h3>${bag}`;
      else body = `${tabs}<div style="display:flex;justify-content:space-between;align-items:center"><h3>${esc((KINDS.find(k => k[0] === this.tab) || KINDS[0])[1])}</h3><input class="search" placeholder="搜索" value="${esc(this.query)}"></div><div class="cgrid">${sec('c').map(s => slot(s)).join('')}</div><div style="display:flex;gap:calc(4*var(--u));margin-top:calc(4*var(--u));align-items:center"><div class="slots">${sec('hot').map(s => slot(s)).join('')}</div>${slot(sec('trash')[0], ' trash')}</div><div class="note" style="color:#555;text-align:left">点一下拿一组，放到下面的物品栏；拿着东西点红色格子扔掉。</div>`;
    }
    const scroll = this.root.querySelector('.cgrid')?.scrollTop || 0;
    this.root.innerHTML = `<div class="win">${body}<button class="close" data-close aria-label="关闭">×</button></div><div class="cursor">${stackHtml(this.cursor, icons)}</div><div class="tip" hidden></div>`;
    const g = this.root.querySelector('.cgrid'); if (g) g.scrollTop = scroll;
    const search = this.root.querySelector('.search');
    if (search) { search.oninput = () => { this.query = search.value; this.focus = 0; const pos = search.selectionStart; this.draw(); const s2 = this.root.querySelector('.search'); s2.focus(); s2.setSelectionRange(pos, pos); }; search.onkeydown = e => e.stopPropagation(); }
    this.placeCursor();
  }
  refresh() { if (this.open && this.kind === 'furnace') this.draw(); }
  placeCursor(x = this.cx, y = this.cy) {
    const c = this.root.querySelector('.cursor');
    if (!c) return;
    if (x == null) { const f = this.root.querySelector('.slot.focus'); if (f) { const r = f.getBoundingClientRect(), a = this.root.getBoundingClientRect(); x = (r.left + r.right) / 2 - a.left; y = (r.top + r.bottom) / 2 - a.top; } }
    c.style.left = `${x || 0}px`; c.style.top = `${y || 0}px`;
  }
  // ---------- clicks ----------
  pointer(e) {
    const t = e.target;
    if (t.closest('[data-close]')) { this.hide(); return; }
    const tab = t.closest('[data-tab]');
    if (tab) { this.tab = tab.dataset.tab; this.focus = 0; this.draw(); return; }
    const el = t.closest('.slot');
    if (!el) { if (!t.closest('.win') && this.cursor) { this.game.drop(this.cursor); this.cursor = null; this.draw(); } return; }
    const s = this.list.find(x => x.key === el.dataset.k);
    this.focus = this.list.indexOf(s);
    if (e.pointerType === 'touch') { this.pressAt = {s, t: performance.now(), id: e.pointerId}; clearTimeout(this.longTimer); this.longTimer = setTimeout(() => { if (this.pressAt?.s === s) { this.click(s, 'right'); this.pressAt = null; } }, 420); return; }
    this.click(s, e.button === 2 ? 'right' : e.shiftKey ? 'shift' : 'left');
  }
  pointerUp(e) {
    if (e.pointerType === 'touch' && this.pressAt) { const {s} = this.pressAt; this.pressAt = null; clearTimeout(this.longTimer); this.click(s, 'left'); }
  }
  move(e) {
    const a = this.root.getBoundingClientRect();
    // the root may be turned (forced landscape): use the game's own pixels
    const [x, y] = this.game.toApp ? this.game.toApp(e.clientX, e.clientY) : [e.clientX - a.left, e.clientY - a.top];
    this.cx = x; this.cy = y; this.placeCursor(x, y);
    const tip = this.root.querySelector('.tip'), el = e.target.closest?.('.slot');
    if (!tip) return;
    const s = el && this.list?.find(k => k.key === el.dataset.k)?.get();
    if (s && !this.cursor && e.pointerType === 'mouse') { tip.hidden = false; tip.textContent = zhOf(s.id) + (itemInfo(s.id)?.tool ? `（耐久 ${itemInfo(s.id).tool.uses - (s.dmg || 0)}/${itemInfo(s.id).tool.uses}）` : ''); tip.style.left = `${x + 14}px`; tip.style.top = `${y - 10}px`; }
    else tip.hidden = true;
  }
  /** A click on a slot: left, right or shift. */
  click(s, how) {
    if (!s) return;
    const c = this.cursor, here = s.get();
    this.game.sound?.('click');
    if (s.trash) { this.cursor = null; this.draw(); return; }
    if (s.source) {
      // creative: the item comes from nowhere
      const full = {id: s.source, n: how === 'right' ? 1 : stackMax(s.source)};
      if (how === 'shift') { this.game.inv.add(full); }
      else if (c && c.id === s.source && how === 'left') { c.n = stackMax(c.id); }
      else if (c) this.cursor = null;
      else this.cursor = full;
      this.draw(); return;
    }
    if (s.out === 'craft') {
      const w = this.kind === 'crafting' ? 3 : 2;
      const once = () => { const r = craft(this.grid, w); if (!r) return null; useGrid(this.grid); return r.out; };
      if (how === 'shift') { let k = 0; for (;;) { const r = craft(this.grid, w); if (!r || k++ > 64) break; const left = this.game.inv.add(r.out); useGrid(this.grid); if (left) { this.game.drop(left); break; } } this.game.crafted?.(); }
      else if (here && (!c || (same(c, here) && c.n + here.n <= stackMax(c.id)))) { const got = once(); if (got) { if (c) c.n += got.n; else this.cursor = got; this.game.crafted?.(); } }
      this.draw(); return;
    }
    if (how === 'shift' && here) { this.quickMove(s); this.draw(); return; }
    if (s.out === 'take') {
      if (here && (!c || (same(c, here) && c.n + here.n <= stackMax(c.id)))) { if (c) c.n += here.n; else this.cursor = {...here}; s.set(null); }
      this.draw(); return;
    }
    if (how === 'left') {
      if (!c) { if (here) { this.cursor = here; s.set(null); } }
      else if (!here) { if (!s.accept || s.accept(c)) { s.set(c); this.cursor = null; } }
      else if (same(c, here)) { const k = Math.min(stackMax(c.id) - here.n, c.n); here.n += k; c.n -= k; if (!c.n) this.cursor = null; }
      else if (!s.accept || s.accept(c)) { s.set(c); this.cursor = here; }
    } else if (how === 'right') {
      if (!c) { if (here) { const k = Math.ceil(here.n / 2); this.cursor = {...here, n: k}; here.n -= k; if (!here.n) s.set(null); } }
      else if (!here) { if (!s.accept || s.accept(c)) { s.set({...c, n: 1}); c.n--; if (!c.n) this.cursor = null; } }
      else if (same(c, here) && here.n < stackMax(here.id)) { here.n++; c.n--; if (!c.n) this.cursor = null; }
    }
    this.draw();
  }
  /** Shift-click: to the other part of the window. */
  quickMove(s) {
    const st = s.get(), inv = this.game.inv;
    if (!st) return;
    let targets;
    if (s.section === 'hot') targets = this.list.filter(x => x.section === (this.kind === 'chest' ? 'chest' : this.kind === 'furnace' ? 'f' : 'main'));
    else if (s.section === 'main') targets = this.list.filter(x => x.section === (this.kind === 'chest' ? 'chest' : this.kind === 'furnace' ? 'f' : 'hot'));
    else targets = [...this.list.filter(x => x.section === 'hot'), ...this.list.filter(x => x.section === 'main')];
    if (this.kind === 'furnace' && (s.section === 'hot' || s.section === 'main')) targets = this.list.filter(x => x.key === (smeltOf(st.id) ? 'f:in' : fuelOf(st.id) ? 'f:fuel' : 'none'));
    let left = st.n;
    for (const t of targets) { const h = t.get(); if (h && same(h, st) && !t.out) { const k = Math.min(stackMax(st.id) - h.n, left); h.n += k; left -= k; } if (!left) break; }
    for (const t of targets) { if (!left) break; if (!t.get() && !t.out && (!t.accept || t.accept(st))) { const k = Math.min(stackMax(st.id), left); t.set({...st, n: k}); left -= k; } }
    if (left) st.n = left; else s.set(null);
    void inv;
  }
  // ---------- pads ----------
  /** d-pad / stick navigation and buttons (dir: 'left' | 'right' | 'up' | 'down', or a button). */
  pad(action) {
    const els = [...this.root.querySelectorAll('.slot')];
    if (!els.length) return;
    const cur = els[this.focus] || els[0], r = cur.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    if (['left', 'right', 'up', 'down'].includes(action)) {
      const [dx, dy] = {left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1]}[action];
      let best = -1, bd = Infinity;
      els.forEach((el, i) => {
        if (i === this.focus) return;
        const q = el.getBoundingClientRect(), x = (q.left + q.right) / 2 - cx, y = (q.top + q.bottom) / 2 - cy;
        // turned screens: the d-pad means the game's own directions
        const [ax, ay] = this.game.rotated?.() ? [y, -x] : [x, y];
        const along = ax * dx + ay * dy;
        if (along <= 2) return;
        const d = along + Math.abs(ax * dy - ay * dx) * 2.5;
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { this.focus = best; this.cx = this.cy = null; this.draw(); }
      return;
    }
    const s = this.list.find(x => x.key === cur.dataset.k);
    if (action === 'a') this.click(s, 'left');
    if (action === 'x') this.click(s, 'right');
    if (action === 'y') this.click(s, 'shift');
  }
}
