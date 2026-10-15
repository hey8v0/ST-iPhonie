// 记忆翻牌: turn two cards; a pair stays open, others turn back. Open them all in as few turns as you can.
import {shuffle} from './kit.js';

const FACES = ['🍓', '🐱', '🌙', '🎀', '🍰', '🌸', '🎧', '⭐', '🍑', '🐰', '☕', '🎈'];
const PAIRS = 8;

export default {
  id: 'memory', name: '记忆翻牌', icon: '🃏', colors: ['#ffc4dc', '#e8679a'], note: '找出一对对', unit: '步', lower: true,
  how: '每次翻两张，一样的就留着；用最少的步数把牌全翻开。',
  make({doc, win, host, api, saved}) {
    const el = doc.createElement('div');
    el.className = 'memory';
    host.append(el);
    let cards, open, turns, wait = 0;
    function draw() {
      el.innerHTML = cards.map((c, i) => `<button type="button" class="card-flip${c.up || c.done ? ' up' : ''}${c.done ? ' done' : ''}" data-card="${i}" aria-label="${c.up || c.done ? c.face : '背面'}"><span class="card-face">${c.face}</span></button>`).join('');
    }
    function flip(i) {
      const c = cards[i];
      if (wait || c.up || c.done || open.length >= 2) return;
      c.up = true; open.push(i); draw(); api.sound?.('flip');
      if (open.length < 2) return;
      turns++; api.score(turns);
      const [a, b] = open.map(k => cards[k]);
      if (a.face === b.face) {
        a.done = b.done = true; open = []; draw();
        if (!cards.every(x => x.done)) api.sound?.('match');
        if (cards.every(x => x.done)) api.over({score: turns, win: true, text: `${turns} 步翻完了全部`});
        return;
      }
      wait = win.setTimeout(() => { a.up = b.up = false; open = []; wait = 0; draw(); api.sound?.('miss'); }, 750);
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-card]'); if (b) flip(Number(b.dataset.card)); });
    function restart() {
      win.clearTimeout(wait); wait = 0;
      const faces = shuffle(FACES).slice(0, PAIRS);
      cards = shuffle([...faces, ...faces]).map(face => ({face, up: false, done: false})); open = []; turns = 0;
      api.score(0); draw();
    }
    // The game left off: the pairs found stay open, the rest face down.
    if (saved?.cards?.length === PAIRS * 2) { cards = saved.cards.map(c => ({face: c.face, done: !!c.done, up: false})); open = []; turns = Number(saved.turns) || 0; api.score(turns); draw(); } else restart();
    return {restart, state: () => cards.every(c => c.done) ? null : {cards: cards.map(c => ({face: c.face, done: c.done})), turns}, dispose() { win.clearTimeout(wait); el.remove(); }};
  },
};
