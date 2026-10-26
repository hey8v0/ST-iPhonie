// 三消叠叠乐 (the kind 羊了个羊 made famous): tiles lie in layers; one with nothing on top of it can be tapped into the
// slot bar below (7 places). Three alike in the bar vanish; a full bar ends the game. Three helps, each once a level:
// 移出 (the first three in the bar go up onto the board's edge), 撤销 (the last tap back), 洗牌 (the board shuffled).
import {shuffle} from './kit.js';

const FACES = ['🍓', '🥕', '🌽', '🍇', '🍄', '🥝', '🍑', '🌸', '🧁', '🍪', '🥚', '🍋', '🫐', '🍒'];
const SLOTS = 7, SIZE = 44;
/** The levels: how many kinds, how many of each (×3), the layers and how many places a layer has (a W×H grid). */
const LEVELS = [{kinds: 4, sets: 3, layers: 3, w: 5, h: 5}, {kinds: 8, sets: 4, layers: 6, w: 6, h: 7}, {kinds: 12, sets: 4, layers: 8, w: 6, h: 7}];

/** Whether tile i has another, on a higher layer, overlapping it (it cannot be taken then). */
export function covered(tiles, i) {
  const t = tiles[i];
  return tiles.some((o, j) => j !== i && !o.gone && o.layer > t.layer && Math.abs(o.x - t.x) < 1 && Math.abs(o.y - t.y) < 1);
}
/** The bar after a tile of this face comes in: next to its kind; three alike leave. {bar, cleared}. */
export function intoBar(bar, face) {
  const next = [...bar], at = next.lastIndexOf(face);
  next.splice(at < 0 ? next.length : at + 1, 0, face);
  if (next.filter(f => f === face).length >= 3) { let n = 3; return {bar: next.filter(f => f !== face || !n || (n--, false)), cleared: true}; }
  return {bar: next, cleared: false};
}
/**
 * A level's tiles: [{face, layer, x, y}] in grid units (a layer sits half a tile off the one below every other layer).
 * Each face comes in threes. Places are picked at random on each layer, the higher layers fewer.
 */
export function deal(level, random = Math.random) {
  const L = LEVELS[Math.min(level, LEVELS.length - 1)], count = L.kinds * L.sets * 3;
  const faces = shuffle(FACES).slice(0, L.kinds), pool = shuffle(faces.flatMap(f => Array(L.sets * 3).fill(f)));
  const places = [];
  for (let layer = 0; layer < L.layers; layer++) {
    const off = layer % 2 ? .5 : 0, w = L.w - (off ? 1 : 0), h = L.h - (off ? 1 : 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) places.push({layer, x: x + off, y: y + off});
  }
  // Fewer on the top layers: the higher a place, the more likely it is left out.
  const chosen = places.map(p => ({p, k: random() + p.layer * .12})).sort((a, b) => a.k - b.k).slice(0, count).map(x => x.p);
  return chosen.map((p, i) => ({...p, face: pool[i]}));
}

export default {
  id: 'stack3', name: '三消叠叠乐', icon: '🐑', colors: ['#c8f2b4', '#5cb85c'], note: '三个一样就消', unit: '',
  how: '点没被压住的牌，放进下面的槽里；三张一样的就消掉。槽满 7 张就输了。移出、撤销、洗牌每关各能用一次。',
  make({doc, win, host, api, saved}) {
    const el = doc.createElement('div');
    el.className = 'stack3';
    host.append(el);
    let level, tiles, bar, aside, history, used, score, over;
    const scale = () => Math.max(.62, Math.min(1, ((host.clientWidth || 340) - 16) / ((LEVELS[Math.min(level, LEVELS.length - 1)].w + .2) * SIZE)));
    function draw() {
      const L = LEVELS[Math.min(level, LEVELS.length - 1)], k = scale(), s = SIZE * k;
      el.style.setProperty('--tile', s + 'px');
      el.innerHTML = `<div class="stack3-level">第 ${level + 1} 关 · 还剩 ${tiles.filter(t => !t.gone).length} 张</div>
        <div class="stack3-board" style="width:${L.w * s}px;height:${L.h * s}px">${tiles.map((t, i) => t.gone ? '' : `<button type="button" class="stack3-tile${covered(tiles, i) ? ' under' : ''}" data-tile="${i}" style="left:${t.x * s}px;top:${t.y * s}px;z-index:${t.layer + 1}" aria-label="${t.face}">${t.face}</button>`).join('')}</div>
        <div class="stack3-aside">${aside.map((f, i) => `<button type="button" class="stack3-tile" data-aside="${i}">${f}</button>`).join('')}</div>
        <div class="stack3-bar">${Array.from({length: SLOTS}, (_, i) => `<span class="stack3-slot">${bar[i] || ''}</span>`).join('')}</div>
        <div class="stack3-tools"><button type="button" class="chip-button" data-tool="out" ${used.out || bar.length < 3 ? 'disabled' : ''}>移出</button><button type="button" class="chip-button" data-tool="undo" ${used.undo || !history.length ? 'disabled' : ''}>撤销</button><button type="button" class="chip-button" data-tool="shuffle" ${used.shuffle ? 'disabled' : ''}>洗牌</button></div>`;
    }
    function take(face, from) {
      const r = intoBar(bar, face);
      history.push({from, bar}); bar = r.bar;
      if (r.cleared) { score += 3; api.score(score); api.sound?.('match'); } else api.sound?.('place');
      if (!tiles.some(t => !t.gone) && !aside.length && !bar.length) {
        level++;
        if (level >= LEVELS.length) { over = true; draw(); api.over({score, win: true, text: '三关全过了！'}); return; }
        api.sound?.('win'); start(level); return;
      }
      draw();
      if (bar.length >= SLOTS) { over = true; api.over({score, text: `槽满了，在第 ${level + 1} 关`, goOn: false}); }
    }
    el.addEventListener('click', e => {
      if (over) return;
      const tile = e.target.closest('[data-tile]'), side = e.target.closest('[data-aside]'), tool = e.target.closest('[data-tool]');
      if (tile) { const i = Number(tile.dataset.tile); if (covered(tiles, i)) { api.sound?.('miss'); return; } tiles[i].gone = true; take(tiles[i].face, {tile: i}); }
      else if (side) { const i = Number(side.dataset.aside), f = aside.splice(i, 1)[0]; take(f, {aside: f}); }
      else if (tool && !tool.disabled) {
        const k = tool.dataset.tool;
        used[k] = true;
        if (k === 'out') { aside.push(...bar.slice(0, 3)); bar = bar.slice(3); history = []; }
        else if (k === 'undo') { const h = history.pop(); bar = h.bar; if (h.from.tile != null) tiles[h.from.tile].gone = false; else aside.push(h.from.aside); }
        else { const left = tiles.filter(t => !t.gone), faces = shuffle(left.map(t => t.face)); left.forEach((t, i) => { t.face = faces[i]; }); history = []; }
        api.sound?.('slide'); draw();
      }
    });
    function start(n) { level = n; tiles = deal(level); bar = []; aside = []; history = []; used = {}; draw(); }
    function restart() { score = 0; over = false; api.score(0); start(0); }
    if (saved?.tiles?.length) { ({level, tiles, bar, aside, used, score} = {aside: [], used: {}, ...saved}); history = []; over = false; api.score(score); draw(); } else restart();
    return {restart, state: () => over ? null : {level, tiles, bar, aside, used, score}, dispose() { el.remove(); }};
  },
};
