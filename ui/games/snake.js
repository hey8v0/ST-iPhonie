// 贪吃蛇: eat to grow; only your own tail ends it (out of one side, in at the other). A little faster with every
// few bites.
import {swipes, pad, padKeys, ARROWS, canvas, color, loop, rand} from './kit.js';

const N = 17;
const STEP = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]};
const OPPOSITE = {up: 'down', down: 'up', left: 'right', right: 'left'};

/**
 * One step: {snake, ate, dead}. snake: [[x, y]…] head first; dir: where it goes; food: [x, y]. Going over an edge
 * comes back in from the other side.
 */
export function stepSnake(snake, dir, food, n = N) {
  const [dx, dy] = STEP[dir], head = [(snake[0][0] + dx + n) % n, (snake[0][1] + dy + n) % n];
  const ate = head[0] === food[0] && head[1] === food[1];
  const body = ate ? snake : snake.slice(0, -1);
  const dead = body.some(([x, y]) => x === head[0] && y === head[1]);
  return {snake: dead ? snake : [head, ...body], ate, dead};
}

export default {
  id: 'snake', name: '贪吃蛇', icon: '🐍', colors: ['#9be7a6', '#2f9e5b'], note: '越吃越长', live: true,
  how: '滑动、方向键或下面的按钮转向；从一边出去会从另一边回来，咬到自己才结束。',
  make({doc, win, host, api, saved}) {
    const view = host.closest('.view'), room = view ? view.clientHeight - (host.getBoundingClientRect().top - view.getBoundingClientRect().top) - 190 : 340;
    const size = Math.min(340, Math.max(200, host.clientWidth || 300), room > 200 ? room : 340), cell = size / N;
    const {canvas: c, g} = canvas(doc, size, size);
    c.className = 'game-canvas';
    host.append(c);
    host.insertAdjacentHTML('beforeend', pad());
    const stopPad = padKeys(host, d => turn(d));
    let snake, dir, queue, food, score, wait, speed, over;
    const tick = loop(win, dt => {
      wait -= dt;
      if (wait > 0) return;
      wait += speed;
      if (queue.length) dir = queue.shift();
      const done = stepSnake(snake, dir, food);
      if (done.dead) { over = true; tick.stop(); draw(); api.over({score, text: `长到了 ${snake.length} 节`}); return; }
      snake = done.snake;
      if (done.ate) { score++; api.score(score); api.sound?.('eat'); speed = Math.max(70, 160 - score * 3); placeFood(); }
      draw();
    });
    function placeFood() {
      const free = [];
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (!snake.some(s => s[0] === x && s[1] === y)) free.push([x, y]);
      food = free[rand(free.length)] || [0, 0];
    }
    function draw() {
      if (!g) return;
      g.fillStyle = color(host, '--card2', '#f3f7fd'); g.fillRect(0, 0, size, size);
      g.fillStyle = color(host, '--dot', '#bcdaf8'); g.globalAlpha = .4;
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if ((x + y) % 2) g.fillRect(x * cell, y * cell, cell, cell);
      g.globalAlpha = 1;
      g.fillStyle = color(host, '--pink', '#ff7eaa');
      g.beginPath(); g.arc((food[0] + .5) * cell, (food[1] + .5) * cell, cell * .38, 0, Math.PI * 2); g.fill();
      snake.forEach(([x, y], i) => {
        g.fillStyle = i ? color(host, '--custom', '#3fae7a') : color(host, '--custom-ink', '#1d6b47');
        const m = i ? cell * .1 : cell * .04;
        g.beginPath(); g.roundRect ? g.roundRect(x * cell + m, y * cell + m, cell - 2 * m, cell - 2 * m, cell * .3) : g.rect(x * cell + m, y * cell + m, cell - 2 * m, cell - 2 * m); g.fill();
      });
    }
    function turn(d) {
      if (over) return;
      const last = queue.at(-1) || dir;
      if (d === last || d === OPPOSITE[last] || queue.length > 2) return;
      queue.push(d);
      if (!tick.running) tick.start();
    }
    function restart() {
      tick.stop();
      const mid = Math.floor(N / 2);
      snake = [[mid, mid], [mid - 1, mid], [mid - 2, mid]]; dir = 'right'; queue = []; score = 0; wait = 400; speed = 160; over = false;
      placeFood(); draw(); api.score(0);
      tick.start();
    }
    swipes(c, turn);
    // The game left off: as it was, still, until 继续.
    if (saved?.snake?.length) { ({snake, dir, food, score, speed} = saved); queue = []; wait = 400; over = false; draw(); api.score(score); } else restart();
    return {
      restart,
      state: () => over ? null : {snake, dir, food, score, speed},
      key(e) { const d = ARROWS[e.key]; if (!d) return false; turn(d); return true; },
      pause() { if (over || !tick.running) return false; tick.stop(); },
      resume() { if (!over) { wait = 300; tick.start(); } },
      dispose() { tick.stop(); stopPad(); host.innerHTML = ''; },
    };
  },
};
