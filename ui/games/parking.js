// 挪车: cars stand packed on a lot, each facing a way; a tap drives one out that way if nothing stands in its path,
// else it bumps and stays. Clear the lot. Levels grow; every level is checked to come out (driving out only ever makes
// room, so taking out whichever car is free, again and again, finds whether the lot can be cleared).
import {rand, shuffle} from './kit.js';

const COLORS = ['#ff6b81', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#f783ac', '#63e6be', '#a9a9c8'];
const STEP = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]};
const level = n => ({size: Math.min(8, 5 + Math.floor(n / 2)), cars: Math.min(26, 6 + n * 2)});

/** The cells a car covers. */
export const cellsOf = c => Array.from({length: c.len}, (_, i) => c.dir === 'left' || c.dir === 'right' ? [c.x + i, c.y] : [c.x, c.y + i]);
/** Whether a car can drive out: every cell from its nose to the edge is empty. */
export function free(cars, i, size) {
  const c = cars[i], [dx, dy] = STEP[c.dir], taken = new Set(cars.flatMap((o, j) => j === i || o.gone ? [] : cellsOf(o).map(([x, y]) => x + ',' + y)));
  const cells = cellsOf(c), nose = dx > 0 || dy > 0 ? cells.at(-1) : cells[0];
  for (let x = nose[0] + dx, y = nose[1] + dy; x >= 0 && y >= 0 && x < size && y < size; x += dx, y += dy) if (taken.has(x + ',' + y)) return false;
  return true;
}
/** Whether the lot can be cleared (and in how many drives at least: one per car). */
export function clearable(cars, size) {
  const left = cars.map(c => ({...c}));
  for (let moved = true; moved;) { moved = false; for (let i = 0; i < left.length; i++) if (!left[i].gone && free(left, i, size)) { left[i].gone = true; moved = true; } }
  return left.every(c => c.gone);
}
/** A lot for level n: cars of 2 (sometimes 3), put where they fit, until the lot is full enough; cleared-checked. */
export function park(n, random = rand) {
  const {size, cars: want} = level(n);
  for (let tries = 0; tries < 400; tries++) {
    const cars = [], taken = new Set();
    for (let k = 0; k < want * 6 && cars.length < want; k++) {
      const dir = ['up', 'down', 'left', 'right'][random(4)], len = random(5) ? 2 : 3, flat = dir === 'left' || dir === 'right';
      const x = random(flat ? size - len + 1 : size), y = random(flat ? size : size - len + 1), car = {x, y, len, dir};
      const cells = cellsOf(car).map(([a, b]) => a + ',' + b);
      if (cells.some(c => taken.has(c))) continue;
      cells.forEach(c => taken.add(c));
      cars.push({...car, color: COLORS[cars.length % COLORS.length]});
    }
    // Not too easy: most cars start blocked.
    if (cars.length >= want * .8 && clearable(cars, size) && cars.filter((_, i) => free(cars, i, size)).length <= Math.max(2, cars.length / 3)) return {size, cars: shuffle(cars)};
  }
  return park(Math.max(0, n - 1), random);
}

export default {
  id: 'parking', name: '挪车', icon: '🚗', colors: ['#ffe08a', '#f0a020'], note: '把车都开出去', unit: '',
  // The score: lots cleared.
  how: '每辆车只能朝车头的方向开。点一下，前面没有车挡着就开走了；挡着就撞一下。把停车场清空进下一关。',
  make({doc, win, host, api, saved}) {
    const el = doc.createElement('div');
    el.className = 'parking';
    host.append(el);
    let n, lot, score, bumps, timers = [];
    const cell = () => Math.floor(Math.min(320, (host.clientWidth || 320) - 8) / lot.size);
    function draw() {
      const s = cell();
      el.innerHTML = `<div class="parking-level">第 ${n + 1} 关 · 还有 ${lot.cars.filter(c => !c.gone).length} 辆${bumps ? ` · 撞了 ${bumps} 次` : ''}</div>
        <div class="parking-lot" style="width:${lot.size * s}px;height:${lot.size * s}px;--cell:${s}px">${lot.cars.map((c, i) => {
          if (c.gone) return '';
          const flat = c.dir === 'left' || c.dir === 'right', w = (flat ? c.len : 1) * s, h = (flat ? 1 : c.len) * s;
          return `<button type="button" class="parking-car" data-car="${i}" data-dir="${c.dir}" style="left:${c.x * s}px;top:${c.y * s}px;width:${w}px;height:${h}px;--car:${c.color}" aria-label="朝${{up: '上', down: '下', left: '左', right: '右'}[c.dir]}的车"><i></i></button>`;
        }).join('')}</div>`;
    }
    function drive(i) {
      const c = lot.cars[i], btn = el.querySelector(`[data-car="${i}"]`);
      if (!c || c.gone || !btn) return;
      if (!free(lot.cars, i, lot.size)) {
        bumps++; api.sound?.('miss');
        btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
        el.querySelector('.parking-level').textContent = `第 ${n + 1} 关 · 还有 ${lot.cars.filter(x => !x.gone).length} 辆 · 撞了 ${bumps} 次`;
        return;
      }
      c.gone = true; api.sound?.('slide');
      const [dx, dy] = STEP[c.dir], far = (lot.size + c.len) * cell();
      btn.style.transform = `translate(${dx * far}px, ${dy * far}px)`;
      btn.style.opacity = '0';
      timers.push(win.setTimeout(() => {
        if (lot.cars.every(x => x.gone)) {
          n++; score = n; api.score(score); lot = park(n); bumps = 0; draw();
          api.over({score, win: true, text: `清空了 ${n} 个停车场，下一关车更多`, goOn: true});
          return;
        }
        draw();
      }, 320));
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-car]'); if (b) drive(Number(b.dataset.car)); });
    function restart() { timers.forEach(t => win.clearTimeout(t)); n = 0; score = 0; bumps = 0; lot = park(0); api.score(0); draw(); }
    if (saved?.lot?.cars?.length) { n = Number(saved.n) || 0; lot = saved.lot; score = Number(saved.score) || 0; bumps = 0; api.score(score); draw(); } else restart();
    return {restart, resume() {}, state: () => ({n, lot, score}), dispose() { timers.forEach(t => win.clearTimeout(t)); el.remove(); }};
  },
};
