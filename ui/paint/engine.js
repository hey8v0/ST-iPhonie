// 画画的画布: a picture of layers, strokes stamped with a brush tip, undo and redo.
// A stroke is stamped into a buffer as big as the picture (each stamp leaves `flow`); when it ends, the buffer goes
// onto the layer at the brush's opacity (or, erasing, takes that much away). So one stroke never gets darker than its
// opacity however often it crosses itself, as on Procreate. Undo keeps the pixels a change touched, before and after.
// Layers, as on Procreate: a blend mode (正片叠底…), 剪辑蒙版 (shown only where the layer below it has paint),
// 阿尔法锁定 (paint only where there is paint already), 锁定 (no changes), 参考 (what 油漆桶 looks at).
// 涂抹 pushes the paint of the layer along the stroke. A 选区 keeps strokes, fills and smudges inside it; 变形 lifts
// what is selected (or the whole layer) off it, to move, turn, scale and flip, and puts it back.
import {coloredTip, tipMask} from './brushes.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
let ids = 0;
const newId = () => 'L' + Date.now().toString(36) + (ids++).toString(36);
function canvasOf(doc, w, h) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return {canvas: c, g: c.getContext('2d')}; }

/** Blend modes: [canvas operation, name, the letter the layer list shows]. */
export const BLENDS = [
  ['source-over', '正常', 'N'], ['multiply', '正片叠底', 'M'], ['screen', '滤色', 'S'], ['overlay', '叠加', 'O'],
  ['darken', '变暗', 'Da'], ['lighten', '变亮', 'Li'], ['color-dodge', '颜色减淡', 'CD'], ['color-burn', '颜色加深', 'CB'],
  ['lighter', '添加', 'A'], ['hard-light', '强光', 'HL'], ['soft-light', '柔光', 'SL'], ['difference', '差值', 'Di'],
  ['exclusion', '排除', 'E'], ['hue', '色相', 'H'], ['saturation', '饱和度', 'Sa'], ['color', '颜色', 'C'], ['luminosity', '明度', 'L'],
];
const BLEND_IDS = BLENDS.map(b => b[0]);
const PROPS = ['name', 'opacity', 'visible', 'blend', 'clip', 'alphaLock', 'locked', 'reference'];

/** Where stamps go from `from` to `to` (each {x, y, p}), `spacing` px apart, `carry` px already gone since the last one. */
export function stampsBetween(from, to, spacing, carry = 0) {
  const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy), out = [];
  let at = spacing - carry;
  while (at <= dist) { const t = dist ? at / dist : 0; out.push({x: from.x + dx * t, y: from.y + dy * t, p: from.p + (to.p - from.p) * t}); at += spacing; }
  return {stamps: out, carry: dist - (at - spacing)};
}
/** A stamp's size and how much it leaves, at pressure p (0–1). */
export function stampOf(brush, size, p) {
  const curve = Math.pow(clamp(p, 0, 1), 1.4);
  return {size: Math.max(.5, size * (1 - brush.pressureSize * (1 - curve))), alpha: brush.flow * (1 - brush.pressureOpacity * (1 - curve))};
}
/**
 * 两头收尖 (taper, 0–1): how much smaller a stamp is near the two ends of a stroke, as a willow leaf. The tapered part
 * is up to taper × 8 sizes long, at most half the stroke (a short one is a leaf); d is how far along the stroke the
 * stamp is, total the stroke's length (Infinity while it is still drawn: only its start narrows then).
 */
export function taperAt(brush, size, d, total = Infinity) {
  const taper = brush.taper || 0;
  if (!taper || total < 1) return 1;
  const len = Math.min(taper * size * 8, total / 2), ease = t => 1 - (1 - clamp(t, 0, 1)) ** 2;
  return len > 0 ? Math.max(.06, Math.min(ease(d / len), ease((total - d) / len))) : 1;
}
/** The line steadied: the pen point is followed only part of the way (streamline 0–1). */
export const steady = (last, point, streamline) => !last ? point : {x: last.x + (point.x - last.x) * (1 - streamline * .88), y: last.y + (point.y - last.y) * (1 - streamline * .88), p: point.p};

/** A layer's settings, checked (from a saved work or a change). */
function layerProps(l, i = 0) {
  return {name: String(l.name || `图层 ${i + 1}`).slice(0, 40), opacity: Number.isFinite(l.opacity) ? clamp(l.opacity, 0, 1) : 1, visible: l.visible !== false,
    blend: BLEND_IDS.includes(l.blend) ? l.blend : 'source-over', clip: l.clip === true, alphaLock: l.alphaLock === true, locked: l.locked === true, reference: l.reference === true, group: typeof l.group === 'string' ? l.group.slice(0,80) : ''};
}
/**
 * A picture: {width, height, background, showBackground, layers: [{id, canvas, g, name, opacity, visible, blend, clip,
 * alphaLock, locked, reference}] (bottom first), active (a layer id)}. From saved layers (with an image) when given.
 */
export function createPicture(doc, {width, height, background = '#ffffff', showBackground = true, layers = null, active = '', groups = []}) {
  const pic = {doc, width, height, background, showBackground, groups: (Array.isArray(groups)?groups:[]).filter(g=>g&&typeof g.id==='string').map(g=>({id:g.id.slice(0,80),name:String(g.name||'新建组').slice(0,40),collapsed:g.collapsed===true,visible:g.visible!==false})), layers: [], active: '', history: [], future: [], stroke: null, changed: 0, temps: []};
  pic.buffer = canvasOf(doc, width, height);
  for (const [i, l] of (layers || [{name: '图层 1'}]).entries()) {
    const {canvas, g} = canvasOf(doc, width, height);
    if (l.image && g) g.drawImage(l.image, 0, 0);
    pic.layers.push({id: l.id || newId(), canvas, g, ...layerProps(l, i)});
  }
  for(const l of pic.layers)if(!pic.groups.some(g=>g.id===l.group))l.group='';
  pic.active = pic.layers.some(l => l.id === active) ? active : pic.layers.at(-1).id;
  return pic;
}
export const activeLayer = pic => pic.layers.find(l => l.id === pic.active) || pic.layers.at(-1);
/** The settings of a layer, to keep. */
export const layerInfo = l => ({...Object.fromEntries(['id', ...PROPS].map(k => [k, l[k]])),...(l.group?{group:l.group}:{})});
const MAX_PIXELS = 30e6;
function remember(pic, step) {
  // Keep properties independent of live layers; later grouping/edits must not rewrite an older redo step.
  if(step.kind==='layer')step.layer={...step.layer};
  pic.history.push(step); pic.future = []; pic.changed++;
  // Not more than so many pixels kept for undo (a few strokes over the whole picture take a lot).
  let total = pic.history.reduce((n, s) => n + (s.pixels || 0), 0);
  while (pic.history.length > 1 && (pic.history.length > 60 || total > MAX_PIXELS)) total -= pic.history.shift().pixels || 0;
}
/** A canvas the size of the picture to work in (n: which one), made once. */
function temp(pic, n) { return pic.temps[n] ||= canvasOf(pic.doc, pic.width, pic.height); }
const pixelsOf = (pic, layer, box = [0, 0, pic.width, pic.height]) => layer.g.getImageData(...box);
function pixelStep(pic, layer, box, before) { return {kind: 'pixels', layer: layer.id, x: box[0], y: box[1], before, after: layer.g.getImageData(...box), pixels: box[2] * box[3] * 2}; }

// ---------- strokes ----------
/**
 * Starts a stroke: brush, size (px), color ('#rrggbb'), erase, or smudge (the brush's tip pushes the layer's paint;
 * its opacity is how hard). The first point stamps at once. False on a locked layer or while something is lifted.
 */
export function beginStroke(pic, {brush, size, color, erase = false, smudge = false}, point) {
  const layer = activeLayer(pic);
  if (layer.locked || pic.float || !layer.g) return false;
  if (smudge) {
    const C = Math.max(2, Math.ceil(size));
    pic.stroke = {smudge: true, brush, size, layer, mask: tipMask(pic.doc, brush).canvas, held: canvasOf(pic.doc, C, C), piece: canvasOf(pic.doc, C, C), C, before: pixelsOf(pic, layer), last: point, carry: 0, box: null, started: false};
    layer.g.save(); clipSelection(layer.g, pic);
  } else {
    pic.buffer.g?.clearRect(0, 0, pic.width, pic.height);
    // A tapering brush keeps its stamps: the end narrows only once it is known where the stroke ends.
    pic.stroke = {brush, size, erase, layer, tip: coloredTip(pic.doc, brush, erase ? '#000000' : color), last: point, carry: 0, box: null, dist: 0, stamps: brush.taper ? [] : null};
    pic.buffer.g?.save(); if (pic.buffer.g) clipSelection(pic.buffer.g, pic);
  }
  stamp(pic, point);
  return true;
}
/** 涂抹: what the tip holds goes down here, and it takes up some of what is here. */
function smudgeStamp(pic, x, y, size, strength) {
  const s = pic.stroke, C = s.C, L = s.layer.g, held = s.held.g, piece = s.piece.g;
  if (!held || !piece) return;
  if (!s.started) { held.globalCompositeOperation = 'copy'; held.drawImage(s.layer.canvas, x - C / 2, y - C / 2, C, C, 0, 0, C, C); s.started = true; return; }
  piece.globalCompositeOperation = 'copy'; piece.drawImage(s.held.canvas, 0, 0);
  piece.globalCompositeOperation = 'destination-in'; piece.drawImage(s.mask, 0, 0, C, C);
  L.globalAlpha = clamp(strength, 0, 1); L.globalCompositeOperation = s.layer.alphaLock ? 'source-atop' : 'source-over';
  L.drawImage(s.piece.canvas, x - size / 2, y - size / 2, size, size);
  L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
  held.globalCompositeOperation = 'source-over'; held.globalAlpha = .28;
  held.drawImage(s.layer.canvas, x - C / 2, y - C / 2, C, C, 0, 0, C, C);
  held.globalAlpha = 1;
}
/**
 * 对称 (pic.symmetry: {kind, cx, cy, n}): where else a stamp at (x, y) goes — mirrored left–right ('v'), top–bottom
 * ('h'), both ('quad'), or turned n times about the middle ('radial').
 */
export function mirrored(pic, x, y) {
  const s = pic.symmetry;
  if (!s?.kind) return [];
  const cx = s.cx ?? pic.width / 2, cy = s.cy ?? pic.height / 2, mx = 2 * cx - x, my = 2 * cy - y;
  if (s.kind === 'v') return [[mx, y]];
  if (s.kind === 'h') return [[x, my]];
  if (s.kind === 'quad') return [[mx, y], [x, my], [mx, my]];
  if (s.kind === 'radial') {
    const n = s.n || 6, dx = x - cx, dy = y - cy, out = [];
    for (let i = 1; i < n; i++) { const a = i * 2 * Math.PI / n, c = Math.cos(a), si = Math.sin(a); out.push([cx + dx * c - dy * si, cy + dx * si + dy * c]); }
    return out;
  }
  return [];
}
const grow = (s, cx, cy, size) => { const r = size / 2 + 2, box = [Math.floor(cx - r), Math.floor(cy - r), Math.ceil(cx + r), Math.ceil(cy + r)]; s.box = s.box ? [Math.min(s.box[0], box[0]), Math.min(s.box[1], box[1]), Math.max(s.box[2], box[2]), Math.max(s.box[3], box[3])] : box; };
function stamp(pic, {x, y, p}) {
  const s = pic.stroke, {size: full, alpha} = stampOf(s.brush, s.size, p), g = pic.buffer.g;
  const size = s.stamps ? full * taperAt(s.brush, s.size, s.dist) : full;
  if (s.smudge) {
    smudgeStamp(pic, x, y, size, s.brush.opacity * (alpha / Math.max(.01, s.brush.flow)));
    const r = size / 2 + 2, box = [Math.floor(x - r), Math.floor(y - r), Math.ceil(x + r), Math.ceil(y + r)];
    s.box = s.box ? [Math.min(s.box[0], box[0]), Math.min(s.box[1], box[1]), Math.max(s.box[2], box[2]), Math.max(s.box[3], box[3])] : box;
    return;
  }
  const jitter = s.brush.jitter * size;
  const cx = x + (jitter ? (Math.random() - .5) * 2 * jitter : 0), cy = y + (jitter ? (Math.random() - .5) * 2 * jitter : 0);
  // The stamp, and its copies where 对称 puts them.
  for (const [px, py] of [[cx, cy], ...mirrored(pic, cx, cy)]) {
    if (g) { g.globalAlpha = clamp(alpha, 0, 1); g.drawImage(s.tip, px - size / 2, py - size / 2, size, size); }
    s.stamps?.push({cx: px, cy: py, full, alpha, d: s.dist});
    grow(s, px, py, size);
  }
}
/** The stroke goes on to `point`: stamps along the way. */
export function extendStroke(pic, point) {
  const s = pic.stroke;
  if (!s) return;
  const spacing = Math.max(.5, s.size * s.brush.spacing * Math.max(.2, stampOf(s.brush, 1, (s.last.p + point.p) / 2).size));
  const {stamps, carry} = stampsBetween(s.last, point, spacing, s.carry);
  for (const st of stamps) { s.dist = (s.dist || 0) + Math.hypot(st.x - (s.at || s.last).x, st.y - (s.at || s.last).y); s.at = st; stamp(pic, st); }
  s.carry = carry; s.last = point;
}
const boxIn = (pic, b) => { const x = clamp(b[0], 0, pic.width), y = clamp(b[1], 0, pic.height); return [x, y, clamp(b[2], 0, pic.width) - x, clamp(b[3], 0, pic.height) - y]; };
// How a stroke goes onto its layer: taking away, painting only over paint (阿尔法锁定), or painting.
const strokeMode = s => s.erase ? 'destination-out' : s.layer.alphaLock ? 'source-atop' : 'source-over';
/** The stroke goes onto its layer (undoable). cancel: it is dropped instead. */
export function endStroke(pic, {cancel = false} = {}) {
  const s = pic.stroke;
  pic.stroke = null;
  if (s?.smudge) {
    s.layer.g.restore();
    if (cancel || !s.box) { s.layer.g.putImageData(s.before, 0, 0); return false; }
    const box = boxIn(pic, s.box);
    if (!box[2] || !box[3]) return false;
    remember(pic, pixelStep(pic, s.layer, box, cropData(pic.doc, s.before, box)));
    return true;
  }
  // A tapering stroke is stamped again with both ends narrowed, now that its length is known.
  if (s?.stamps && !cancel && s.box && pic.buffer.g) {
    const b = pic.buffer.g, total = s.dist;
    b.clearRect(s.box[0], s.box[1], s.box[2] - s.box[0], s.box[3] - s.box[1]);
    for (const st of s.stamps) { const size = st.full * taperAt(s.brush, s.size, st.d, total); b.globalAlpha = clamp(st.alpha, 0, 1); b.drawImage(s.tip, st.cx - size / 2, st.cy - size / 2, size, size); }
  }
  pic.buffer.g?.restore();
  if (!s || cancel || !s.box) { pic.buffer.g?.clearRect(0, 0, pic.width, pic.height); return false; }
  const box = boxIn(pic, s.box), g = s.layer.g;
  if (!box[2] || !box[3] || !g) return false;
  const before = pixelsOf(pic, s.layer, box);
  g.save(); g.globalAlpha = s.brush.opacity; g.globalCompositeOperation = strokeMode(s);
  g.drawImage(pic.buffer.canvas, box[0], box[1], box[2], box[3], box[0], box[1], box[2], box[3]); g.restore();
  remember(pic, pixelStep(pic, s.layer, box, before));
  pic.buffer.g.clearRect(box[0], box[1], box[2], box[3]);
  return true;
}

// ---------- undo ----------
function restore(pic, step, which) {
  if (step.kind === 'stack') { const state=step[which];pic.layers=state.layers.map(l=>({...l}));pic.groups=state.groups.map(g=>({...g}));pic.active=state.active;return; }
  if (step.kind === 'group') { for (const s of which === 'before' ? [...step.steps].reverse() : step.steps) restore(pic, s, which); return; }
  if (step.kind === 'pixels') { pic.layers.find(l => l.id === step.layer)?.g?.putImageData(step[which], step.x, step.y); return; }
  if (step.kind === 'props') { const l = pic.layers.find(x => x.id === step.layer); if (l) Object.assign(l, step[which]); return; }
  if (step.kind === 'layer') {
    // A layer added (there 'after') or taken away (there 'before').
    const there = which === 'after' ? step.added : !step.added;
    const at = pic.layers.findIndex(l => l.id === step.layer.id);
    if (there && at < 0) pic.layers.splice(Math.min(step.index, pic.layers.length), 0, {...step.layer});
    if (!there && at >= 0 && pic.layers.length > 1) pic.layers.splice(at, 1);
    if (!pic.layers.some(l => l.id === pic.active)) pic.active = pic.layers[Math.min(step.index, pic.layers.length - 1)].id;
    else if (there) pic.active = step.layer.id;
    return;
  }
  if (step.kind === 'order') { const order = step[which]; pic.layers.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); }
}
export function undo(pic) { const step = pic.history.pop(); if (!step) return false; restore(pic, step, 'before'); pic.future.push(step); pic.changed++; return true; }
export function redo(pic) { const step = pic.future.pop(); if (!step) return false; restore(pic, step, 'after'); pic.history.push(step); pic.changed++; return true; }

// ---------- layers ----------
function insertLayer(pic, at, props = {}) {
  const {canvas, g} = canvasOf(pic.doc, pic.width, pic.height);
  const layer = {id: newId(), canvas, g, ...layerProps({name: `图层 ${pic.layers.length + 1}`, group: activeLayer(pic)?.group || '', ...props})};
  pic.layers.splice(at, 0, layer); pic.active = layer.id;
  return layer;
}
/** A new empty layer above the one in use. */
export function addLayer(pic) {
  const at = pic.layers.findIndex(l => l.id === pic.active) + 1, layer = insertLayer(pic, at);
  const parent=pic.groups.find(g=>g.id===layer.group);if(parent)parent.collapsed=false;
  remember(pic, {kind: 'layer', layer, index: at, added: true});
  return layer;
}
/** A copy of a layer, above it. */
export function duplicateLayer(pic, id) {
  const from = pic.layers.find(l => l.id === id);
  if (!from) return null;
  const at = pic.layers.indexOf(from) + 1, layer = insertLayer(pic, at, {...layerInfo(from), name: `${from.name} 拷贝`, locked: false});
  layer.g?.drawImage(from.canvas, 0, 0);
  remember(pic, {kind: 'layer', layer, index: at, added: true, pixels: pic.width * pic.height});
  return layer;
}
export function removeLayer(pic, id) {
  if (pic.layers.length < 2) return false;
  const at = pic.layers.findIndex(l => l.id === id);
  if (at < 0) return false;
  const [layer] = pic.layers.splice(at, 1);
  if (pic.active === id) pic.active = pic.layers[Math.max(0, at - 1)].id;
  remember(pic, {kind: 'layer', layer, index: at, added: false, pixels: pic.width * pic.height});
  return true;
}
/** Moves a layer up (1) or down (-1) the stack. */
export function moveLayer(pic, id, by) { const at = pic.layers.findIndex(l => l.id === id); return moveLayerTo(pic, id, at + by); }
/** Moves a layer to place `to` (0 = bottom). */
export function moveLayerTo(pic, id, to) {
  const at = pic.layers.findIndex(l => l.id === id);
  if (at < 0 || to < 0 || to >= pic.layers.length || to === at) return false;
  const before=stackState(pic), target=pic.layers[to], [layer]=pic.layers.splice(at,1);
  layer.group=target.group||'';pic.layers.splice(to,0,layer);
  pic.groups=pic.groups.filter(g=>pic.layers.some(l=>l.group===g.id));keepStack(pic,before);
  return true;
}
/** Changes a layer's settings (name, opacity, blend, clip, alphaLock, locked, reference, visible), undoable. */
export function setLayer(pic, id, patch) {
  const l = pic.layers.find(x => x.id === id);
  if (!l) return false;
  const next = layerProps({...layerInfo(l), ...patch}), keys = PROPS.filter(k => k in patch && next[k] !== l[k]);
  if (!keys.length) return false;
  const before = Object.fromEntries(keys.map(k => [k, l[k]])), after = Object.fromEntries(keys.map(k => [k, next[k]]));
  Object.assign(l, after);
  remember(pic, {kind: 'props', layer: id, before, after});
  return true;
}
/** Empties a layer (undoable). */
export function clearLayer(pic, id) {
  const layer = pic.layers.find(l => l.id === id);
  if (!layer?.g || layer.locked) return false;
  const before = pixelsOf(pic, layer);
  layer.g.clearRect(0, 0, pic.width, pic.height);
  remember(pic, pixelStep(pic, layer, [0, 0, pic.width, pic.height], before));
  return true;
}
/** Fills a layer with a colour (with 阿尔法锁定, only what is painted takes it), undoable. */
export function fillLayer(pic, id, color) {
  const layer = pic.layers.find(l => l.id === id);
  if (!layer?.g || layer.locked) return false;
  const before = pixelsOf(pic, layer), g = layer.g;
  g.save(); g.globalCompositeOperation = layer.alphaLock ? 'source-atop' : 'source-over'; g.fillStyle = color; g.fillRect(0, 0, pic.width, pic.height); g.restore();
  remember(pic, pixelStep(pic, layer, [0, 0, pic.width, pic.height], before));
  return true;
}
/** Structural edits keep the original canvases untouched, so one undo restores pixels, settings and selection. */
const stackState = pic => ({layers:pic.layers.map(l=>({...l})),groups:pic.groups.map(g=>({...g})),active:pic.active});
function keepStack(pic,before,pixels=0){remember(pic,{kind:'stack',before,after:stackState(pic),pixels});}
export function groupLayers(pic,ids,name='新建组') {
  if(pic.stroke||pic.float)return null;
  const chosen=pic.layers.filter(l=>ids.includes(l.id));if(chosen.length<2)return null;
  const before=stackState(pic),id='G'+newId(),top=pic.layers.indexOf(chosen.at(-1)),parents=new Set(chosen.map(l=>l.group).filter(Boolean));
  let at=pic.layers.slice(0,top+1).filter(l=>!ids.includes(l.id)).length;pic.layers=pic.layers.filter(l=>!ids.includes(l.id));
  for(let i=0;i<pic.layers.length;i++)if(parents.has(pic.layers[i].group))at=Math.max(at,i+1);
  chosen.forEach(l=>l.group=id);pic.layers.splice(at,0,...chosen);
  pic.groups=pic.groups.filter(g=>pic.layers.some(l=>l.group===g.id));pic.groups.push({id,name:String(name).slice(0,40),collapsed:false,visible:true});
  keepStack(pic,before);return id;
}
export function setLayerGroup(pic,id,patch) {
  const group=pic.groups.find(g=>g.id===id);if(!group)return false;const before=stackState(pic);
  if(typeof patch.name==='string'&&patch.name.trim())group.name=patch.name.trim().slice(0,40);
  for(const k of ['visible','collapsed'])if(typeof patch[k]==='boolean')group[k]=patch[k];
  if(Object.keys(patch).every(k=>k==='collapsed'))pic.changed++;else keepStack(pic,before);return true;
}
export function ungroupLayers(pic,id) {
  if(!pic.groups.some(g=>g.id===id))return false;const before=stackState(pic);
  for(const l of pic.layers)if(l.group===id)l.group='';pic.groups=pic.groups.filter(g=>g.id!==id);keepStack(pic,before);return true;
}
/** Merge a contiguous range in one transaction. Opacity and clipping are baked once, into a fresh canvas. */
export function mergeLayers(pic,ids) {
  if(pic.stroke||pic.float)return false;
  const chosen=pic.layers.filter(l=>ids.includes(l.id));if(chosen.length<2||chosen.some(l=>l.locked||!l.g))return false;
  const at=pic.layers.indexOf(chosen[0]);if(pic.layers.indexOf(chosen.at(-1))-at!==chosen.length-1)return false;
  const before=stackState(pic),base=chosen[0],out=canvasOf(pic.doc,pic.width,pic.height);if(!out.g)return false;
  const group=chosen.every(l=>l.group===base.group)?base.group:'';
  // A retained parent still controls visibility. Across parents, bake their visibility into the result.
  const groups=group?pic.groups.map(g=>g.id===group?{...g,visible:true}:g):pic.groups;
  compose({...pic,layers:chosen,groups,showBackground:false,stroke:null},out.g);
  const merged={id:base.id,...out,...layerProps({...layerInfo(base),opacity:1,blend:'source-over',clip:base.clip,alphaLock:false,visible:chosen.some(l=>l.visible&&!groups.some(g=>g.id===l.group&&!g.visible)),group})};
  pic.layers.splice(at,chosen.length,merged);pic.active=merged.id;pic.groups=pic.groups.filter(g=>pic.layers.some(l=>l.group===g.id));
  keepStack(pic,before,pic.width*pic.height*(chosen.length+1));return true;
}
export function mergeDown(pic,id) {const at=pic.layers.findIndex(l=>l.id===id);return at>0&&mergeLayers(pic,[pic.layers[at-1].id,id]);}

// ---------- seeing it ----------
/** What a layer shows now: itself, or itself with the stroke being drawn on it. */
/** A layer as it shows now: with the stroke being drawn on it, or the piece being moved. */
export const layerPicture = (pic, l) => content(pic, l, 0);
function content(pic, l, n) {
  const s = pic.stroke, f = pic.float;
  if (f && f.layer === l) {
    const t = temp(pic, n);
    if (!t.g) return l.canvas;
    t.g.globalCompositeOperation = 'copy'; t.g.globalAlpha = 1; t.g.drawImage(l.canvas, 0, 0);
    t.g.globalCompositeOperation = 'source-over'; drawFloat(t.g, f);
    return t.canvas;
  }
  if (!s || s.layer !== l || s.smudge) return l.canvas;
  const t = temp(pic, n);
  if (!t.g) return l.canvas;
  t.g.globalCompositeOperation = 'copy'; t.g.globalAlpha = 1; t.g.drawImage(l.canvas, 0, 0);
  t.g.globalCompositeOperation = strokeMode(s); t.g.globalAlpha = s.brush.opacity; t.g.drawImage(pic.buffer.canvas, 0, 0);
  t.g.globalCompositeOperation = 'source-over'; t.g.globalAlpha = 1;
  return t.canvas;
}
/** `source` kept only where `base` has paint, in work canvas n. */
function clipped(pic, source, base, n) {
  const t = temp(pic, n);
  if (!t.g) return source;
  t.g.globalCompositeOperation = 'copy'; t.g.globalAlpha = 1; t.g.drawImage(source, 0, 0);
  t.g.globalCompositeOperation = 'destination-in'; t.g.drawImage(base, 0, 0);
  t.g.globalCompositeOperation = 'source-over';
  return t.canvas;
}
/**
 * Draws the picture into g (already set to picture space): the background, then each layer with its blend mode and
 * opacity; a 剪辑蒙版 layer shows only over the paint of the layer it sits on (they make one group).
 * from / to: only the layers (groups) whose bottom layer is in [from, to); background: with the background colour.
 */
export function compose(pic, g, {from = 0, to = Infinity, background = true} = {}) {
  if (background && pic.showBackground) { g.fillStyle = pic.background; g.fillRect(0, 0, pic.width, pic.height); }
  const list = pic.layers;
  for (let i = 0; i < list.length; i++) {
    const base = list[i];
    const group = [];
    for (let j = i + 1; j < list.length && list[j].clip && list[j].group === base.group; j++) group.push(list[j]);
    const at = i;
    i += group.length;
    if (at < from || at >= to) continue;
    if (!base.visible || pic.groups?.some(g=>g.id===base.group&&!g.visible)) continue;
    const shown = group.filter(l => l.visible);
    let picture = content(pic, base, 0);
    if (shown.length) {
      // The group: the base, then each clipped layer (only where the base has paint) with its blend and opacity.
      const groupCanvas = temp(pic, 1), gg = groupCanvas.g, baseNow = picture;
      if (gg) {
        gg.globalCompositeOperation = 'copy'; gg.globalAlpha = 1; gg.drawImage(baseNow, 0, 0);
        for (const l of shown) {
          const piece = clipped(pic, content(pic, l, 2), baseNow, 3);
          gg.globalCompositeOperation = l.blend; gg.globalAlpha = l.opacity; gg.drawImage(piece, 0, 0);
        }
        gg.globalCompositeOperation = 'source-over'; gg.globalAlpha = 1;
        picture = groupCanvas.canvas;
      }
    }
    g.globalAlpha = base.opacity; g.globalCompositeOperation = base.blend;
    g.drawImage(picture, 0, 0);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
/** The whole picture flattened, as a canvas of its size. */
export function flatten(pic) {
  const out = canvasOf(pic.doc, pic.width, pic.height);
  if (out.g) compose({...pic, stroke: null}, out.g);
  return out.canvas;
}
/** The colour at (x, y) as it is seen: '#rrggbb', or '' outside or where nothing is. */
export function colorAt(pic, x, y) {
  if (x < 0 || y < 0 || x >= pic.width || y >= pic.height) return '';
  // The picture drawn into one pixel, moved so that pixel is (x, y).
  const one = canvasOf(pic.doc, 1, 1), g = one.g;
  if (!g) return '';
  g.translate(-Math.floor(x), -Math.floor(y));
  compose({...pic, stroke: null}, g);
  const [r, gg, b, a] = g.getImageData(0, 0, 1, 1).data;
  if (!a) return '';
  return '#' + [r, gg, b].map(n => n.toString(16).padStart(2, '0')).join('');
}

/** A piece of an ImageData. */
function cropData(doc, data, [x, y, w, h]) {
  const Data = doc.defaultView?.ImageData || globalThis.ImageData, out = Data ? new Data(w, h) : {data: new Uint8ClampedArray(w * h * 4), width: w, height: h};
  for (let row = 0; row < h; row++) out.data.set(data.data.subarray(((y + row) * data.width + x) * 4, ((y + row) * data.width + x + w) * 4), row * w * 4);
  return out;
}

// ---------- 选区 ----------
/** Selects inside the outline `points` ([[x, y]…], picture px); null, or too small an outline, selects nothing. */
export function setSelection(pic, points, {inverted = false} = {}) {
  const list = (points || []).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  let area = 0;
  for (let i = 0; i < list.length; i++) { const [a, b] = list[i], [c, d] = list[(i + 1) % list.length]; area += a * d - c * b; }
  pic.selection = list.length > 2 && Math.abs(area) / 2 > 9 ? {points: list, inverted} : null;
  return pic.selection;
}
export const invertSelection = pic => { if (pic.selection) pic.selection = {...pic.selection, inverted: !pic.selection.inverted}; return pic.selection; };
export function tracePath(g, points) { g.beginPath(); points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); }
/**
 * 柳叶笔 (as on 画世界): the outline drawn by hand is filled with the colour at once, or, erasing, emptied; inside a
 * selection only, over paint only with 阿尔法锁定. Undoable. False on a locked layer or an outline with no inside.
 */
export function lassoFill(pic, points, {color, erase = false, opacity = 1} = {}) {
  const layer = activeLayer(pic);
  if (layer.locked || !layer.g || pic.float || !points || points.length < 3) return false;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const box = boxIn(pic, [Math.floor(Math.min(...xs)) - 2, Math.floor(Math.min(...ys)) - 2, Math.ceil(Math.max(...xs)) + 2, Math.ceil(Math.max(...ys)) + 2]);
  if (box[2] < 1 || box[3] < 1) return false;
  const g = layer.g, before = pixelsOf(pic, layer, box);
  g.save(); clipSelection(g, pic);
  g.globalAlpha = clamp(opacity, 0, 1); g.globalCompositeOperation = erase ? 'destination-out' : layer.alphaLock ? 'source-atop' : 'source-over';
  g.fillStyle = color || '#000000'; tracePath(g, points); g.fill();
  g.restore();
  remember(pic, pixelStep(pic, layer, box, before));
  return true;
}
/** Keeps what g draws inside the selection (or outside it, inverted). */
export function clipSelection(g, pic) {
  const sel = pic.selection;
  if (!sel) return;
  tracePath(g, sel.points);
  if (sel.inverted) { g.rect(0, 0, pic.width, pic.height); g.clip('evenodd'); } else g.clip();
}
/** The box [x, y, w, h] around the selection, inside the picture (the whole picture when inverted). */
export function selectionBox(pic) {
  const sel = pic.selection;
  if (!sel || sel.inverted) return [0, 0, pic.width, pic.height];
  const xs = sel.points.map(p => p[0]), ys = sel.points.map(p => p[1]);
  return boxIn(pic, [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))]);
}
/** Empties what is selected on the layer in use (undoable). */
export function clearSelected(pic) {
  const layer = activeLayer(pic);
  if (!pic.selection || !layer.g || layer.locked) return false;
  const box = selectionBox(pic), before = pixelsOf(pic, layer, box);
  layer.g.save(); clipSelection(layer.g, pic); layer.g.clearRect(...box); layer.g.restore();
  remember(pic, pixelStep(pic, layer, box, before));
  return true;
}
/** What is selected on the layer in use, as a new layer above it (拷贝并粘贴). */
export function copySelected(pic) {
  const from = activeLayer(pic);
  if (!pic.selection || !from.g) return null;
  const at = pic.layers.indexOf(from) + 1, layer = insertLayer(pic, at, {name: `${from.name} 片段`});
  if (layer.g) { layer.g.save(); clipSelection(layer.g, pic); layer.g.drawImage(from.canvas, 0, 0); layer.g.restore(); }
  remember(pic, {kind: 'layer', layer, index: at, added: true, pixels: pic.width * pic.height});
  return layer;
}

// ---------- 油漆桶 ----------
/**
 * Fills from (x, y) with a colour: the area of about the same colour as there (threshold 0–1), as the 参考 layer
 * shows it when there is one, else the whole picture (sample 'all') or the layer in use. Inside the selection; with
 * 阿尔法锁定 only over paint. Undoable; false when nothing was filled.
 */
export function floodFill(pic, x, y, color, {threshold = .12, sample = 'layer', opacity = 1} = {}) {
  const layer = activeLayer(pic), W = pic.width, H = pic.height;
  x = Math.floor(x); y = Math.floor(y);
  if (layer.locked || !layer.g || pic.float || x < 0 || y < 0 || x >= W || y >= H) return false;
  const ref = pic.layers.find(l => l.reference && l.visible);
  const source = ref ? ref.canvas : sample === 'all' ? flatten(pic) : layer.canvas;
  const src = source.getContext('2d').getImageData(0, 0, W, H).data, at = (y * W + x) * 4;
  const seed = [src[at], src[at + 1], src[at + 2], src[at + 3]], limit = Math.round(clamp(threshold, 0, 1) * 255);
  const same = i => {
    const a = src[i + 3];
    // Clear meets clear whatever its colour; otherwise every channel close enough.
    if (!a && !seed[3]) return true;
    return Math.abs(a - seed[3]) <= limit && Math.abs(src[i] - seed[0]) <= limit && Math.abs(src[i + 1] - seed[1]) <= limit && Math.abs(src[i + 2] - seed[2]) <= limit;
  };
  const mask = new Uint8Array(W * H), stack = [[x, y]];
  let minX = x, maxX = x, minY = y, maxY = y;
  while (stack.length) {
    const [sx, sy] = stack.pop();
    let lx = sx;
    while (lx > 0 && !mask[sy * W + lx - 1] && same((sy * W + lx - 1) * 4)) lx--;
    let rx = sx;
    while (rx < W - 1 && !mask[sy * W + rx + 1] && same((sy * W + rx + 1) * 4)) rx++;
    if (mask[sy * W + sx] || !same((sy * W + sx) * 4)) continue;
    for (let i = lx; i <= rx; i++) mask[sy * W + i] = 1;
    minX = Math.min(minX, lx); maxX = Math.max(maxX, rx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    for (const ny of [sy - 1, sy + 1]) {
      if (ny < 0 || ny >= H) continue;
      let inside = false;
      for (let i = lx; i <= rx; i++) {
        const ok = !mask[ny * W + i] && same((ny * W + i) * 4);
        if (ok && !inside) stack.push([i, ny]);
        inside = ok;
      }
    }
  }
  // One pixel more all round, so no light seam stays along soft line edges.
  const x0 = Math.max(0, minX - 1), y0 = Math.max(0, minY - 1), w = Math.min(W, maxX + 2) - x0, h = Math.min(H, maxY + 2) - y0;
  const [r, gr, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const piece = canvasOf(pic.doc, w, h), data = piece.g?.createImageData(w, h);
  if (!data) return false;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const X = x0 + xx, Y = y0 + yy;
    let on = mask[Y * W + X];
    if (!on) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = X + dx, c = Y + dy; if (a >= 0 && c >= 0 && a < W && c < H && mask[c * W + a]) { on = 1; break; } }
    if (!on) continue;
    const i = (yy * w + xx) * 4;
    data.data[i] = r; data.data[i + 1] = gr; data.data[i + 2] = b; data.data[i + 3] = 255;
  }
  piece.g.putImageData(data, 0, 0);
  const box = [x0, y0, w, h], before = pixelsOf(pic, layer, box), g = layer.g;
  g.save(); clipSelection(g, pic); g.globalAlpha = clamp(opacity, 0, 1); g.globalCompositeOperation = layer.alphaLock ? 'source-atop' : 'source-over';
  g.drawImage(piece.canvas, x0, y0); g.restore();
  remember(pic, pixelStep(pic, layer, box, before));
  return true;
}

// ---------- 变形 ----------
/** Draws a lifted piece where it is now: around its middle, turned, scaled and flipped. */
export function drawFloat(g, f) {
  const t = f.t;
  g.save(); g.translate(t.cx, t.cy); g.rotate(t.angle); g.scale(t.sx, t.sy);
  g.imageSmoothingEnabled = true;
  g.drawImage(f.canvas, -f.box[2] / 2, -f.box[3] / 2);
  g.restore();
}
/** The corners of a lifted piece where it is now (picture px), clockwise from the top left. */
export function floatCorners(f) {
  const t = f.t, cos = Math.cos(t.angle), sin = Math.sin(t.angle), w = f.box[2] / 2, h = f.box[3] / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [t.cx + (x * t.sx) * cos - (y * t.sy) * sin, t.cy + (x * t.sx) * sin + (y * t.sy) * cos]);
}
/** Where there is paint on a layer: [x, y, w, h], or null when it is empty. */
function paintBox(pic, layer) {
  const d = pixelsOf(pic, layer).data, W = pic.width;
  let x0 = W, y0 = pic.height, x1 = -1, y1 = -1;
  for (let i = 3, p = 0; i < d.length; i += 4, p++) if (d[i]) { const x = p % W, y = (p - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}
/** Lifts what is selected (or all that is painted) off the layer in use, to be moved; null when there is nothing. */
export function startTransform(pic) {
  const layer = activeLayer(pic);
  if (pic.float || layer.locked || !layer.g) return null;
  const box = pic.selection ? selectionBox(pic) : paintBox(pic, layer);
  if (!box || !box[2] || !box[3]) return null;
  const before = pixelsOf(pic, layer), piece = canvasOf(pic.doc, box[2], box[3]);
  if (piece.g) {
    piece.g.translate(-box[0], -box[1]);
    if (pic.selection) clipSelection(piece.g, pic);
    piece.g.drawImage(layer.canvas, 0, 0);
  }
  layer.g.save(); clipSelection(layer.g, pic); layer.g.clearRect(...box); layer.g.restore();
  pic.float = {layer, canvas: piece.canvas, box, before, t: {cx: box[0] + box[2] / 2, cy: box[1] + box[3] / 2, sx: 1, sy: 1, angle: 0}};
  return pic.float;
}
/** Puts the lifted piece down where it is (undoable); the selection goes with it. */
export function commitTransform(pic) {
  const f = pic.float;
  if (!f) return false;
  pic.float = null;
  drawFloat(f.layer.g, f);
  remember(pic, pixelStep(pic, f.layer, [0, 0, pic.width, pic.height], f.before));
  if (pic.selection && !pic.selection.inverted) {
    const t = f.t, cos = Math.cos(t.angle), sin = Math.sin(t.angle), mx = f.box[0] + f.box[2] / 2, my = f.box[1] + f.box[3] / 2;
    pic.selection = {...pic.selection, points: pic.selection.points.map(([x, y]) => { const dx = (x - mx) * t.sx, dy = (y - my) * t.sy; return [t.cx + dx * cos - dy * sin, t.cy + dx * sin + dy * cos]; })};
  }
  return true;
}
/** Puts the piece back where it was, unchanged. */
export function cancelTransform(pic) { const f = pic.float; if (!f) return false; pic.float = null; f.layer.g.putImageData(f.before, 0, 0); return true; }

// ---------- 调整 ----------
/** Starts adjusting the layer in use: its pixels as they are, to show changes over and to go back to. null: locked. */
export function beginAdjust(pic) {
  const layer = activeLayer(pic);
  if (!layer?.g || layer.locked || pic.float) return null;
  const copy = canvasOf(pic.doc, pic.width, pic.height);
  copy.g?.drawImage(layer.canvas, 0, 0);
  return {layer, copy: copy.canvas, before: pixelsOf(pic, layer)};
}
/** Shows the layer as `picture` (the adjusted copy), inside the selection when there is one. */
export function showAdjust(pic, a, picture) {
  const g = a.layer.g;
  g.save(); g.globalCompositeOperation = 'copy'; g.globalAlpha = 1; g.drawImage(a.copy, 0, 0); g.restore();
  g.save(); clipSelection(g, pic); g.clearRect(0, 0, pic.width, pic.height); g.drawImage(picture, 0, 0); g.restore();
}
/** Keeps the adjustment (undoable), or puts the layer back as it was. */
export function endAdjust(pic, a, keep) {
  if (keep) { remember(pic, pixelStep(pic, a.layer, [0, 0, pic.width, pic.height], a.before)); return true; }
  a.layer.g.putImageData(a.before, 0, 0);
  return false;
}
