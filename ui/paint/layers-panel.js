// 图层 panel, worked as on Procreate:
// - tap a layer to use it; tap the one in use for its options (重命名, 拷贝, 填充, 清除, 阿尔法锁定, 剪辑蒙版, 参考, 向下合并);
// - double-tap a name to rename it;
// - swipe a layer left for 锁定 / 复制 / 删除;
// - tap the letter (N, M…) for its opacity and blend mode;
// - drag a layer by its thumbnail, or hold it and then drag, up or down to move it;
// - the tick shows or hides it. The last row is the background colour.
import {esc} from '../common.js';
import {icon} from '../icons.js';
import {popupSelect,bindPopupSelect} from '../popup-select.js';
import {BLENDS, activeLayer, addLayer, duplicateLayer, removeLayer, moveLayerTo, setLayer, clearLayer, fillLayer, mergeDown, mergeLayers, groupLayers, setLayerGroup, ungroupLayers, undo, redo} from './engine.js';

const HOLD = 320, DOUBLE = 260, SWIPE = 168;
const letter = blend => BLENDS.find(b => b[0] === blend)?.[2] || 'N';

/** Opens the panel. changed(): the picture changed (redraw, save). color(): the colour in use, for 填充. */
export function layersPanel({ctx, pic, changed, color}) {
  const d = ctx.dialog('图层', '');
  let panel = null, swiped = '', renaming = '', groupOptions = '', groupRename = '';const selected=new Set();
  const picker=bindPopupSelect(d.body,(id,value)=>{setLayer(pic,id,{blend:value});done();});
  const done = () => { changed(); draw(); };

  function row(l) {
    const on = l.id === pic.active, flags = [l.locked && '锁定', l.alphaLock && '阿尔法锁定', l.reference && '参考', l.clip && '剪辑蒙版', l.opacity < 1 && Math.round(l.opacity * 100) + '%'].filter(Boolean).join(' · ');
    const open = panel?.id === l.id ? panel.kind : '';
    return `<div class="pl-row${on ? ' on' : ''}${selected.has(l.id) ? ' selected' : ''}${l.group ? ' in-group' : ''}${l.clip ? ' clip' : ''}${swiped === l.id ? ' swiped' : ''}" data-layer="${esc(l.id)}">
      <div class="pl-under"><button type="button" data-pl="lock">${l.locked ? '解锁' : '锁定'}</button><button type="button" data-pl="dup">复制</button><button type="button" class="pl-del" data-pl="del"${pic.layers.length < 2 ? ' disabled' : ''}>删除</button></div>
      <div class="pl-main">
        ${l.clip ? '<span class="pl-clip" aria-label="剪辑蒙版">↳</span>' : ''}
        <canvas class="paint-layer-thumb" width="60" height="60" data-thumb="${esc(l.id)}"></canvas>
        <span class="pl-name">${renaming === l.id ? `<input class="pl-rename" data-pl-name value="${esc(l.name)}" maxlength="40" aria-label="图层名字">` : `<strong>${esc(l.name)}</strong>`}<small>${esc(flags || '　')}</small></span>
        <button type="button" class="pl-mode" data-pl="mode" aria-label="混合模式和不透明度：${esc(BLENDS.find(b => b[0] === l.blend)?.[1] || '正常')}">${letter(l.blend)}</button>
        <input type="checkbox" class="pl-eye" data-pl="eye" ${l.visible ? 'checked' : ''} aria-label="${l.visible ? '隐藏' : '显示'} ${esc(l.name)}">
      </div></div>
      ${open === 'mode' ? `<div class="pl-panel" data-panel="${esc(l.id)}"><div class="field"><div class="meter-label"><span>不透明度</span><output data-pl-out>${Math.round(l.opacity * 100)}%</output></div><input class="slider" type="range" min="0" max="100" value="${Math.round(l.opacity * 100)}" data-pl-opacity></div>
        ${popupSelect(l.id,l.blend,BLENDS.map(([id,name])=>[id,name]),'混合模式')}</div>` : ''}
      ${open === 'options' ? `<div class="pl-panel pl-options" data-panel="${esc(l.id)}">
        <button type="button" data-pl="rename">重命名</button><button type="button" data-pl="dup">拷贝</button><button type="button" data-pl="fill">填充图层</button><button type="button" data-pl="clear">清除</button>
        <button type="button" data-pl="alphaLock" aria-pressed="${l.alphaLock}">阿尔法锁定</button><button type="button" data-pl="clip" aria-pressed="${l.clip}"${pic.layers.indexOf(l) === 0 ? ' disabled' : ''}>剪辑蒙版</button>
        <button type="button" data-pl="reference" aria-pressed="${l.reference}">参考</button><button type="button" data-pl="merge"${pic.layers.indexOf(l) === 0 ? ' disabled' : ''}>向下合并</button></div>` : ''}`;
  }
  function listHTML() {
    const seen=new Set(),out=[];
    for(const l of [...pic.layers].reverse()) {
      const g=pic.groups.find(g=>g.id===l.group);
      if(g&&!seen.has(g.id)){seen.add(g.id);out.push(`<div class="pl-group-head" data-layer-group="${esc(g.id)}"><button type="button" data-pl-group="fold" aria-label="${g.collapsed?'展开':'收起'} ${esc(g.name)}" aria-expanded="${!g.collapsed}">${icon(g.collapsed?'next':'down')}</button>${groupRename===g.id?`<input class="pl-group-rename" data-group-name="${esc(g.id)}" maxlength="40" value="${esc(g.name)}" aria-label="图层组名字">`:`<strong>${esc(g.name)}</strong>`}<button type="button" data-pl-group="more" aria-label="${esc(g.name)} 的选项" aria-expanded="${groupOptions===g.id}">${icon('more')}</button><input type="checkbox" data-pl-group="visible" ${g.visible?'checked':''} aria-label="显示 ${esc(g.name)}"></div>${groupOptions===g.id?`<div class="pl-panel pl-options" data-layer-group="${esc(g.id)}"><button type="button" data-pl-group="rename">重命名</button><button type="button" data-pl-group="ungroup">取消编组</button><button type="button" data-pl-group="merge">合并</button></div>`:''}`);}
      if(!g?.collapsed)out.push(row(l));
    }
    return out.join('');
  }
  function draw() {
    if (!d.live) return;picker.close();for(const id of selected)if(!pic.layers.some(l=>l.id===id))selected.delete(id);
    d.body.innerHTML = `<div class="pl-head"><button type="button" class="pl-history" data-pl="undo" aria-label="撤销" ${pic.history.length?'':'disabled'}>${icon('undo')}</button><button type="button" class="pl-history pl-redo" data-pl="redo" aria-label="重做" ${pic.future.length?'':'disabled'}>${icon('undo')}</button>${selected.size?`<span class="pl-selection-count">${selected.size}</span><button type="button" class="chip-button" data-pl="group" ${selected.size<2?'disabled':''}>编组</button><button type="button" class="chip-button" data-pl="select-done">完成</button>`:''}<button type="button" class="chip-button" data-pl="add" aria-label="新图层">＋</button></div>
      <div class="pl-list" data-pl-list>${listHTML()}
      <div class="pl-row pl-bg"><div class="pl-main"><input type="color" value="${esc(pic.background)}" data-bg-color aria-label="背景颜色"><span class="pl-name"><strong>背景颜色</strong><small>${pic.showBackground ? esc(pic.background) : '透明'}</small></span><input type="checkbox" class="pl-eye" data-bg-eye ${pic.showBackground ? 'checked' : ''} aria-label="背景"></div></div></div>`;
    for (const c of d.body.querySelectorAll('[data-thumb]')) {
      const l = pic.layers.find(x => x.id === c.dataset.thumb), g = c.getContext('2d'), s = Math.min(60 / pic.width, 60 / pic.height);
      g?.drawImage(l.canvas, (60 - pic.width * s) / 2, (60 - pic.height * s) / 2, pic.width * s, pic.height * s);
    }
    const input = d.body.querySelector('[data-pl-name], [data-group-name]');
    if (input) { input.focus(); input.select(); }
  }
  // A button's layer: its row, or the panel open under that row.
  const layerOf = el => { const id = el.closest('[data-layer]')?.dataset.layer || el.closest('[data-panel]')?.dataset.panel; return pic.layers.find(l => l.id === id); };
  function act(what, l) {
    if (what === 'lock') { setLayer(pic, l.id, {locked: !l.locked}); swiped = ''; return done(); }
    if (what === 'dup') { duplicateLayer(pic, l.id); swiped = ''; panel = null; return done(); }
    if (what === 'del') { removeLayer(pic, l.id); swiped = ''; panel = null; return done(); }
    if (what === 'rename') { renaming = l.id; panel = null; return draw(); }
    if (what === 'fill') { if (!fillLayer(pic, l.id, color())) ctx.notify('这个图层锁定了'); return done(); }
    if (what === 'clear') { if (!clearLayer(pic, l.id)) ctx.notify('这个图层锁定了'); return done(); }
    if (['alphaLock', 'clip', 'reference'].includes(what)) { setLayer(pic, l.id, {[what]: !l[what]}); return done(); }
    if (what === 'merge') { if (!mergeDown(pic, l.id)) ctx.notify('下面的图层锁定了'); panel = null; return done(); }
  }

  // ---------- touching a row: tap, double tap, swipe, hold and drag ----------
  // The thumbnail is a handle: dragged up or down it moves the layer at once. Elsewhere a row is held first (the list
  // scrolls under a finger that moves straight away). A swipe follows the finger and a flick is enough to open it.
  let press = null, lastTap = null, tapTimer = 0;
  const rowsShown = () => [...d.body.querySelectorAll('[data-layer]')];
  const scroller = () => { for (let el = d.body; el; el = el.parentElement) { const o = ctx.win.getComputedStyle(el).overflowY; if (/(auto|scroll)/.test(o) && el.scrollHeight > el.clientHeight) return el; } return null; };
  function startDrag(p) {
    p.mode = 'drag';
    ctx.win.clearTimeout(p.timer);
    const rows = rowsShown(), box = p.row.getBoundingClientRect();
    p.rows = rows; p.from = rows.indexOf(p.row); p.to = p.from; p.step = box.height + 6; p.scroll = scroller(); p.top = p.scroll?.scrollTop || 0;
    p.row.classList.add('dragging');
    for (const r of rows) if (r !== p.row) r.style.transition = 'transform .16s';
    try { p.main.setPointerCapture(p.id); } catch { /* fine */ }
  }
  function moveDrag(p, e) {
    const s = p.scroll;
    if (s) { const r = s.getBoundingClientRect(); if (e.clientY < r.top + 44) s.scrollTop -= 10; else if (e.clientY > r.bottom - 44) s.scrollTop += 10; }
    const dy = e.clientY - p.y + ((s?.scrollTop || 0) - p.top);
    p.row.style.transform = `translateY(${dy}px)`;
    p.to = Math.max(0, Math.min(p.rows.length - 1, p.from + Math.round(dy / p.step)));
    // The others make room where it would go.
    p.rows.forEach((r, i) => { if (r === p.row) return; const shift = p.from < p.to && i > p.from && i <= p.to ? -p.step : p.from > p.to && i < p.from && i >= p.to ? p.step : 0; r.style.transform = shift ? `translateY(${shift}px)` : ''; });
  }
  function settleSwipe(p, open) {
    swiped = open ? p.row.dataset.layer : '';
    for (const r of rowsShown()) {
      const on = r === p.row && open;
      r.classList.toggle('swiped', on);
      const m = r.querySelector('.pl-main');
      // From where the finger left it to where it rests, by the stylesheet's transition.
      if (m) { m.style.transition = ''; m.style.transform = ''; }
    }
  }
  const touches=new Map();let gesture=null;
  function cancelPress(){if(!press)return;ctx.win.clearTimeout(press.timer);press.row.classList.remove('dragging');for(const row of rowsShown()){row.style.transform='';row.querySelector('.pl-main').style.transform='';}press=null;ctx.win.clearTimeout(tapTimer);}
  function multiDown(e,main){
    if(e.pointerType!=='touch')return false;e.preventDefault();
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,id:main.closest('[data-layer]').dataset.layer,at:Date.now()});
    if(touches.size<2)return false;
    cancelPress();const points=[...touches.values()];
    if(!gesture){const [a,b]=points;gesture={at:a.at,ids:[a.id,b.id],distance:Math.hypot(a.x-b.x,a.y-b.y),min:Infinity,moved:0,most:2,cancel:false};}
    gesture.most=Math.max(gesture.most,touches.size);return true;
  }
  function multiMove(e){const p=touches.get(e.pointerId);if(!p)return false;p.x=e.clientX;p.y=e.clientY;
    if(!gesture)return false;e.preventDefault();gesture.moved=Math.max(gesture.moved,Math.hypot(p.x-p.sx,p.y-p.sy));
    const [a,b]=[...touches.values()];if(a&&b)gesture.min=Math.min(gesture.min,Math.hypot(a.x-b.x,a.y-b.y));return true;
  }
  function multiUp(e){if(!touches.has(e.pointerId))return false;touches.delete(e.pointerId);if(!gesture)return false;
    if(e.type==='pointercancel')gesture.cancel=true;
    if(!touches.size){const g=gesture;gesture=null;if(g.cancel)return true;
      if(g.most===2&&g.distance>24&&g.min<g.distance*.65&&g.distance-g.min>28){const ends=g.ids.map(id=>pic.layers.findIndex(l=>l.id===id));if(ends.every(i=>i>=0)&&ends[0]!==ends[1]){const ids=pic.layers.slice(Math.min(...ends),Math.max(...ends)+1).map(l=>l.id);if(!mergeLayers(pic,ids))ctx.notify('选择相邻且未锁定的图层');selected.clear();panel=null;done();}}
      else if(Date.now()-g.at<420&&g.moved<14){if(g.most===2)undo(pic);else if(g.most===3)redo(pic);panel=null;done();}
    }return true;
  }
  d.body.addEventListener('touchstart',e=>{if(touches.size>=2&&e.cancelable)e.preventDefault();},{passive:false});
  d.body.addEventListener('pointerdown', e => {
    const main = e.target.closest('.pl-main');
    if (!main || e.target.closest('input, button') || main.closest('.pl-bg')) return;
    if(multiDown(e,main)||press)return;
    const rowEl = main.closest('[data-layer]');
    press = {id: e.pointerId, x: e.clientX, y: e.clientY, at: Date.now(), row: rowEl, main, dx: 0, mode: '', handle: !!e.target.closest('.paint-layer-thumb'), start: swiped === rowEl.dataset.layer ? -SWIPE : 0};
    if (press.handle) { try { main.setPointerCapture(e.pointerId); } catch { /* fine */ } }
    press.timer = ctx.win.setTimeout(() => { if (press && !press.mode) startDrag(press); }, HOLD);
  });
  d.body.addEventListener('pointermove', e => {
    if(multiMove(e))return;
    const p = press;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.mode && p.handle && Math.abs(dy) > 4 && Math.abs(dy) >= Math.abs(dx)) startDrag(p);
    if (!p.mode && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      p.mode = 'swipe'; ctx.win.clearTimeout(p.timer);
      p.main.style.transition = 'none';
      try { p.main.setPointerCapture(e.pointerId); } catch { /* fine */ }
    }
    if (!p.mode && !p.handle && Math.abs(dy) > 8) { ctx.win.clearTimeout(p.timer); press = null; return; }
    if (p.mode === 'swipe') {
      const raw = p.start + dx;
      // A small pull to the right previews selection; left reveals the actions.
      p.dx = raw < -SWIPE ? -SWIPE + (raw + SWIPE) * .3 : raw > 0 ? Math.min(28,raw*.25) : raw;
      p.row.classList.toggle('selecting',p.start===0&&dx>35);
      p.main.style.transform = `translateX(${p.dx}px)`;
      p.last = {x: e.clientX, at: Date.now(), vx: (e.clientX - (p.last?.x ?? p.x)) / Math.max(1, Date.now() - (p.last?.at ?? p.at))};
    }
    if (p.mode === 'drag') { e.preventDefault(); moveDrag(p, e); }
  });
  // A finger held on a row: the list must not scroll away under the drag (a pointer cannot stop that by itself).
  d.body.addEventListener('touchmove', e => { if (gesture || press?.mode === 'drag' || press?.mode === 'swipe') e.preventDefault(); }, {passive: false});
  const release = e => {
    if(multiUp(e))return;
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    ctx.win.clearTimeout(p.timer);
    p.row.classList.remove('selecting');
    const l = pic.layers.find(x => x.id === p.row.dataset.layer);
    if(e.type==='pointercancel'){p.row.style.transform='';p.main.style.transform='';p.main.style.transition='';return;}
    if (p.mode === 'swipe') {
      const flick = p.last && Date.now() - p.last.at < 80 ? p.last.vx : 0;
      if(p.start===0&&(e.clientX-p.x>45||flick>.35)){if(!selected.size)selected.add(pic.active);if(l.id!==pic.active&&selected.has(l.id))selected.delete(l.id);else selected.add(l.id);panel=null;swiped='';return draw();}
      return settleSwipe(p, flick < -.35 ? true : flick > .35 ? false : p.dx < -SWIPE / 2);
    }
    if (p.mode === 'drag') {
      // Where it was let go, in the list as shown (top layer first).
      if (p.to !== p.from) moveLayerTo(pic, l.id, pic.layers.findIndex(l=>l.id===p.rows[p.to].dataset.layer));
      return done();
    }
    // A tap: a layer not in use is chosen; the one in use opens its options, unless a second tap renames it.
    if (swiped) { settleSwipe(p, false); return; }
    if(selected.size||e.shiftKey){if(!selected.size)selected.add(pic.active);if(l.id!==pic.active&&selected.has(l.id))selected.delete(l.id);else selected.add(l.id);return draw();}
    const now = Date.now(), twice = lastTap && lastTap.id === l.id && now - lastTap.at < DOUBLE;
    lastTap = {id: l.id, at: now};
    ctx.win.clearTimeout(tapTimer);
    if (twice) { renaming = l.id; panel = null; return draw(); }
    if (l.id !== pic.active) { pic.active = l.id; pic.changed++; panel = null; changed(); return draw(); }
    tapTimer = ctx.win.setTimeout(() => { panel = panel?.id === l.id && panel.kind === 'options' ? null : {id: l.id, kind: 'options'}; draw(); }, DOUBLE);
  };
  d.body.addEventListener('pointerup', release);
  d.body.addEventListener('pointercancel', release);

  d.body.addEventListener('click', e => {
    // A row swiped open closes when it is touched (its eye, under the finger, is not switched by that).
    const open = e.target.closest('.pl-row.swiped .pl-main');
    if (open) { e.preventDefault(); swiped = ''; open.closest('.pl-row').classList.remove('swiped'); return; }
    const groupButton=e.target.closest('[data-pl-group]');if(groupButton){const g=pic.groups.find(g=>g.id===groupButton.closest('[data-layer-group]').dataset.layerGroup);if(!g)return;const action=groupButton.dataset.plGroup;
      if(action==='more'){groupOptions=groupOptions===g.id?'':g.id;return draw();}
      if(action==='rename'){groupRename=g.id;groupOptions='';return draw();}
      if(action==='ungroup'){ungroupLayers(pic,g.id);groupOptions='';return done();}
      if(action==='merge'){if(!mergeLayers(pic,pic.layers.filter(l=>l.group===g.id).map(l=>l.id)))ctx.notify('选择相邻且未锁定的图层');groupOptions='';return done();}
      setLayerGroup(pic,g.id,action==='fold'?{collapsed:!g.collapsed}:{visible:groupButton.checked});done();return;}
    const b = e.target.closest('[data-pl], [data-blend], [data-bg-eye]');
    if (!b) return;
    if(b.dataset.pl==='undo'||b.dataset.pl==='redo'){(b.dataset.pl==='undo'?undo:redo)(pic);panel=null;selected.clear();return done();}
    if(b.dataset.pl==='group'){groupLayers(pic,[...selected]);selected.clear();panel=null;return done();}
    if(b.dataset.pl==='select-done'){selected.clear();return draw();}
    if (b.dataset.pl === 'add') { addLayer(pic); panel = null; return done(); }
    if (b.matches('[data-bg-eye]')) { pic.showBackground = b.checked; pic.changed++; return done(); }
    const l = layerOf(b);
    if (!l) return;
    if (b.dataset.blend) { setLayer(pic, l.id, {blend: b.dataset.blend}); return done(); }
    if (b.dataset.pl === 'eye') { setLayer(pic, l.id, {visible: b.checked}); return done(); }
    if (b.dataset.pl === 'mode') { panel = panel?.id === l.id && panel.kind === 'mode' ? null : {id: l.id, kind: 'mode'}; return draw(); }
    act(b.dataset.pl, l);
  });
  // Opacity follows the slider at once; the change is kept (undoable) when it is let go.
  let sliding = null;
  d.body.addEventListener('input', e => {
    if (e.target.matches('[data-pl-opacity]')) {
      const l = pic.layers.find(x => x.id === e.target.closest('[data-panel]').dataset.panel);
      sliding ||= {id: l.id, from: l.opacity};
      l.opacity = Number(e.target.value) / 100;
      d.body.querySelector('[data-pl-out]').textContent = e.target.value + '%';
      changed({quiet: true});
    }
    if (e.target.matches('[data-bg-color]')) { pic.background = e.target.value; pic.showBackground = true; pic.changed++; changed({quiet: true}); }
  });
  d.body.addEventListener('change', e => {
    if (e.target.matches('[data-pl-opacity]') && sliding) {
      const l = pic.layers.find(x => x.id === sliding.id), now = l.opacity;
      l.opacity = sliding.from; sliding = null;
      setLayer(pic, l.id, {opacity: now});
      return done();
    }
    if (e.target.matches('[data-bg-color]')) done();
  });
  const rename = input => { const l = pic.layers.find(x => x.id === renaming); renaming = ''; if (l && input.value.trim()) setLayer(pic, l.id, {name: input.value.trim()}); done(); };
  const renameGroup = input => { const id=groupRename;groupRename='';setLayerGroup(pic,id,{name:input.value});done(); };
  d.body.addEventListener('keydown',e=>{if(e.target.matches('[data-group-name]')&&e.key==='Enter'){e.preventDefault();renameGroup(e.target);}});
  d.body.addEventListener('focusout',e=>{if(e.target.matches('[data-group-name]')&&groupRename)renameGroup(e.target);});
  d.body.addEventListener('keydown', e => { if (e.target.matches('[data-pl-name]') && e.key === 'Enter') { e.preventDefault(); rename(e.target); } });
  d.body.addEventListener('focusout', e => { if (e.target.matches('[data-pl-name]') && renaming) rename(e.target); });
  d.onClose(() => {ctx.win.clearTimeout(tapTimer);cancelPress();touches.clear();picker.dispose();});
  draw();
  return d;
}
