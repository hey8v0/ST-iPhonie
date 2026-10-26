// 倒水排序: tubes of mixed colours (four parts each) and two empty ones; tap a tube, then another, to pour its top
// colour over — onto the same colour or into an empty tube, as much as fits. Each tube one colour: next level, one
// colour more. Every level is checked to be solvable before it is dealt; 撤销 takes a pour back.
import {shuffle} from './kit.js';

const CAP = 4, COLORS = ['#ff6b81', '#4dabf7', '#ffd43b', '#69db7c', '#9775fa', '#ffa94d', '#f783ac', '#63e6be', '#8d6e63', '#adb5bd', '#3b5bdb', '#e8590c'];

/** The tubes after pouring from a into b, or null when it cannot. */
export function pour(tubes, a, b) {
  const from = tubes[a], to = tubes[b];
  if (a === b || !from?.length || !to || to.length >= CAP) return null;
  const top = from.at(-1);
  if (to.length && to.at(-1) !== top) return null;
  let run = 0;
  for (let i = from.length - 1; i >= 0 && from[i] === top; i--) run++;
  const n = Math.min(run, CAP - to.length), next = tubes.map(t => [...t]);
  for (let k = 0; k < n; k++) next[b].push(next[a].pop());
  return next;
}
/** Every tube empty or full of one colour. */
export const sorted = tubes => tubes.every(t => !t.length || t.length === CAP && t.every(c => c === t[0]));
/** Whether the tubes can be sorted (a search that remembers where it has been; gives up after `limit` states). */
export function solvable(tubes, limit = 40000) {
  const seen = new Set(), stack = [tubes];
  while (stack.length && seen.size < limit) {
    const t = stack.pop(), key = t.map(x => x.join('.')).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    if (sorted(t)) return true;
    for (let a = 0; a < t.length; a++) for (let b = 0; b < t.length; b++) {
      // Pouring a tube of one colour into an empty one changes nothing.
      if (!t[b].length && t[a].every(c => c === t[a][0])) continue;
      const next = pour(t, a, b);
      if (next) stack.push(next);
    }
  }
  return false;
}
/** Level n's tubes: 3 + n colours (up to 12), shuffled, two empty, checked solvable. */
export function fill(n) {
  const colors = Math.min(COLORS.length, 3 + n);
  for (let tries = 0; tries < 60; tries++) {
    const parts = shuffle(Array.from({length: colors * CAP}, (_, i) => i % colors));
    const tubes = [...Array.from({length: colors}, (_, i) => parts.slice(i * CAP, i * CAP + CAP)), [], []];
    if (tubes.some(t => t.length && t.every(c => c === t[0]))) continue;
    if (solvable(tubes)) return tubes;
  }
  return fill(Math.max(0, n - 1));
}

export default {
  id: 'water', name: '倒水排序', icon: '🧪', colors: ['#b5e9ff', '#3aa0e6'], note: '一管一种颜色', unit: '',
  how: '点一管，再点另一管，把上面的颜色倒过去：只能倒在同样的颜色上，或者倒进空管。每管只剩一种颜色就过关，「撤销」能退一步。',
  make({doc, host, api, saved}) {
    const el = doc.createElement('div');
    el.className = 'water';
    host.append(el);
    let n, tubes, pick, history, moves;
    function draw() {
      el.innerHTML = `<div class="water-level">第 ${n + 1} 关 · ${moves} 步</div><div class="water-tubes">${tubes.map((t, i) => `<button type="button" class="water-tube${pick === i ? ' picked' : ''}${t.length === CAP && t.every(c => c === t[0]) ? ' full' : ''}" data-tube="${i}" aria-label="第 ${i + 1} 管">${t.map(c => `<i style="--water:${COLORS[c]}"></i>`).join('')}</button>`).join('')}</div>
        <div class="water-tools"><button type="button" class="chip-button" data-undo ${history.length ? '' : 'disabled'}>撤销</button></div>`;
    }
    el.addEventListener('click', e => {
      if (e.target.closest('[data-undo]')) { if (history.length) { tubes = history.pop(); moves++; pick = -1; api.sound?.('slide'); draw(); } return; }
      const b = e.target.closest('[data-tube]');
      if (!b) return;
      const i = Number(b.dataset.tube);
      if (pick < 0) { if (tubes[i].length) { pick = i; api.sound?.('tap'); draw(); } return; }
      const next = pour(tubes, pick, i);
      if (!next) { api.sound?.(pick === i ? 'tap' : 'miss'); pick = -1; draw(); return; }
      history.push(tubes); tubes = next; pick = -1; moves++; api.sound?.('drop');
      draw();
      if (sorted(tubes)) { n++; api.score(n); tubes = fill(n); history = []; moves = 0; draw(); api.over({score: n, win: true, text: `排好了 ${n} 关，下一关多一种颜色`, goOn: true}); }
    });
    function restart() { n = 0; tubes = fill(0); pick = -1; history = []; moves = 0; api.score(0); draw(); }
    if (saved?.tubes?.length) { n = Number(saved.n) || 0; tubes = saved.tubes; pick = -1; history = []; moves = Number(saved.moves) || 0; api.score(n); draw(); } else restart();
    return {restart, resume() {}, state: () => ({n, tubes, moves}), dispose() { el.remove(); }};
  },
};
