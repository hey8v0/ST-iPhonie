// 游戏: little games, offline, all our own (ui/games/*): the kind the ads show and the classics. The list shows each with its best score; a game fills
// the page under a bar with the score, the best and 重新开始. Arrow keys (and WASD) play on a computer, swipes and the
// on-screen pad on a phone. Leaving the app pauses a game that runs by itself; coming back, a tap goes on.
// Best scores are kept in this browser (ui/games/kit.js store).
import {createView, esc, heading} from './common.js';
import {store} from './games/kit.js';
import {gameSounds} from './games/sound.js';
import g2048 from './games/g2048.js';
import snake from './games/snake.js';
import tetris from './games/tetris.js';
import gomoku from './games/gomoku.js';
import mines from './games/mines.js';
import memory from './games/memory.js';
import slide from './games/slide.js';
import breakout from './games/breakout.js';
import stack3 from './games/stack3.js';
import parking from './games/parking.js';
import water from './games/water.js';
import suika from './games/suika.js';
import tower from './games/tower.js';
import hop from './games/hop.js';

// The ones the ads made famous first (三消叠叠乐, 挪车, 倒水 …), then the classics.
export const GAMES = [stack3, parking, water, suika, tower, hop, g2048, snake, tetris, gomoku, mines, memory, slide, breakout];
const scoreText = (game, n) => game.unit === '秒' ? `${n} 秒` : game.unit === '步' ? `${n} 步` : String(n);

export function gamesApp(ctx) {
  const v = createView(ctx, 'games'), best = store(ctx.win, detail => ctx.api.reportDiagnostic?.('小游戏', detail, 'warn')), keys = new ctx.win.AbortController(), sounds = gameSounds(ctx.win);
  let game = null, play = null, paused = false;

  function renderList() {
    v.draw(heading('小游戏', '', 'Arcade')
      + `<div class="game-list">${GAMES.map(g => {
        const b = best.best(g.id);
        return `<button type="button" class="game-card" data-game="${g.id}" style="--g1:${g.colors[0]};--g2:${g.colors[1]}"><span class="game-icon" aria-hidden="true">${g.icon}</span><strong>${esc(g.name)}</strong><small>${b ? `${g.lower ? '最好' : '最高'} ${esc(scoreText(g, b))}` : esc(g.note)}</small></button>`;
      }).join('')}</div>`
      + '<p class="hint game-foot">离线就能玩，最高分记在这个浏览器里。</p>');
  }
  function bar() {
    const b = best.best(game.id);
    return `<div class="game-bar"><div class="game-score"><small>${game.unit === '秒' ? '用时' : game.unit === '步' ? '步数' : '分数'}</small><b data-game-score>0</b></div><div class="game-score"><small>${game.lower ? '最好' : '最高'}</small><b data-game-best>${b ? esc(scoreText(game, b)) : '—'}</b></div><button type="button" class="chip-button game-sound" data-action="game-sound" aria-pressed="${sounds.on}" aria-label="音效">${sounds.on ? '🔊' : '🔇'}</button><button type="button" class="chip-button" data-action="game-restart">重新开始</button></div>`;
  }
  /** The game as it is now is kept (or forgotten when it is over), to go on with next time. */
  function persist() { if (game && play?.state) best.keep(game.id, play.state()); }
  function open(id) {
    close();
    game = GAMES.find(g => g.id === id);
    if (!game) return renderList();
    const saved = best.saved(game.id);
    v.draw(`<div class="game-page" data-playing="${game.id}"><h2 class="game-title">${esc(game.name)}</h2>${bar()}<div class="game-host" data-game-host></div><p class="hint game-how">${esc(game.how)}</p><div class="game-over" data-game-over hidden></div></div>`);
    const host = v.root.querySelector('[data-game-host]');
    paused = false;
    if (!saved) best.played(game.id);
    play = game.make({doc: ctx.doc, win: ctx.win, host, saved, api: {
      /** A sound of the game (ui/games/sound.js), when sound is on. */
      sound: (name, options) => sounds.play(name, options),
      score: n => { const el = v.root.querySelector('[data-game-score]'); if (el) el.textContent = scoreText(game, n); },
      /** The game ended: the score is offered as a best; the card says so. win: it was won (not lost). */
      over: ({score = 0, win = false, text = '', goOn = false} = {}) => {
        const record = best.offer(game.id, score, {lower: !!game.lower});
        sounds.play(record || win ? 'win' : 'lose');
        const el = v.root.querySelector('[data-game-over]');
        if (!el) return;
        el.innerHTML = `<div class="game-over-card"><strong>${record ? '新纪录！' : win ? '赢啦！' : '游戏结束'}</strong>${text ? `<p>${esc(text)}</p>` : ''}${score ? `<p class="game-over-score">${esc(scoreText(game, score))}</p>` : ''}<div class="actions">${goOn ? '<button type="button" class="secondary" data-action="game-go-on">接着玩</button>' : ''}<button type="button" class="primary" data-action="game-restart">再来一局</button></div></div>`;
        el.hidden = false;
        if (record) { const b = v.root.querySelector('[data-game-best]'); if (b) b.textContent = scoreText(game, score); }
        best.keep(game.id, null);
      },
    }});
    // A game that runs by itself waits for 继续 when it was left off.
    if (saved && game.live) { paused = true; showPause('上一局还没玩完'); }
  }
  function close() { persist(); play?.dispose?.(); play = null; game = null; paused = false; }
  function restart() {
    if (!game) return;
    v.root.querySelector('[data-game-over]').hidden = true;
    paused = false;
    best.played(game.id);
    play?.restart();
    persist();
  }
  function showPause(title = '已暂停') {
    const el = v.root.querySelector('[data-game-over]');
    if (!el || !el.hidden) return;
    el.innerHTML = `<div class="game-over-card"><strong>${esc(title)}</strong><div class="actions">${title === '已暂停' ? '' : '<button type="button" class="secondary" data-action="game-restart">重新开始</button>'}<button type="button" class="primary" data-action="game-go-on">继续</button></div></div>`;
    el.hidden = false;
  }

  v.on('click', '[data-game]', el => open(el.dataset.game));
  v.on('click', '[data-action=game-restart]', () => restart());
  v.on('click', '[data-action=game-sound]', el => { sounds.on = !sounds.on; el.textContent = sounds.on ? '🔊' : '🔇'; el.setAttribute('aria-pressed', String(sounds.on)); if (sounds.on) sounds.play('tap'); });
  v.on('click', '[data-action=game-go-on]', () => { v.root.querySelector('[data-game-over]').hidden = true; paused = false; play?.resume?.(); });
  // Keys while the game is on screen (not while typing somewhere).
  ctx.doc.addEventListener('keydown', e => {
    if (!play || paused || v.disposed || ctx.visible?.('games') === false || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (!v.root.querySelector('[data-game-over]')?.hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); v.root.querySelector('[data-game-over] button')?.click(); } return; }
    if (play.key?.(e)) e.preventDefault();
  }, {signal: keys.signal});
  ctx.doc.addEventListener('keyup', e => { if (play && !paused) play.keyup?.(e); }, {signal: keys.signal});

  v.back = () => { if (!game) return false; close(); renderList(); return true; };
  v.leave = () => { if (play?.pause && play.pause() !== false && game?.live) { paused = true; showPause(); } persist(); };
  // After each move (a tap, a key) the game is kept, so a reload or another device-day goes on from here.
  const later = () => ctx.win.setTimeout(persist, 0);
  v.root.addEventListener('pointerup', later);
  ctx.doc.addEventListener('keyup', e => { if (play && !paused && !e.target.closest?.('input, textarea')) later(); }, {signal: keys.signal});
  v.refresh = () => { if (!game) renderList(); };
  const dispose = v.dispose;
  v.dispose = () => { close(); keys.abort(); sounds.close(); dispose(); };
  renderList();
  return v;
}
