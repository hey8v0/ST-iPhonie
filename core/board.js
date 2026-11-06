// 小游戏对战 (0.9.35): 井字棋 and 五子棋 in a private chat, the user against the contact. No DOM or network here.
// A game is kept as its moves ({by: 'me' | the contact's name, at: the cell's index}), whose turn and who won worked out
// from them each time (so they cannot disagree). Cells are named by row letter and column number: A1 is the top left.
export const BOARDS = Object.freeze({
  ttt: Object.freeze({size: 3, win: 3, name: '井字棋'}),
  gomoku: Object.freeze({size: 9, win: 5, name: '五子棋'}),
});
export const BOARD_TYPES = Object.freeze(Object.keys(BOARDS));
const ROWS = 'ABCDEFGHI';
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** A cell's name: B3 is the second row, third column. */
export const cellName = (index, size) => `${ROWS[Math.floor(index / size)]}${index % size + 1}`;

/**
 * The cell a model or a person named: 「B3」「b 3」「3B」「第2行第3列」, and for 井字棋 also 「中间」 and the corners
 * (「左上角」…). -1 when it names none on this board.
 */
export function parseCell(text, size) {
  const s = String(text ?? '').trim();
  const rc = (r, c) => r >= 0 && c >= 0 && r < size && c < size ? r * size + c : -1;
  let m = s.match(/([A-Ia-i])\s*[-－,，]?\s*([1-9])(?![0-9])/);
  if (m) return rc(ROWS.indexOf(m[1].toUpperCase()), Number(m[2]) - 1);
  m = s.match(/(?:^|[^0-9])([1-9])\s*[-－,，]?\s*([A-Ia-i])(?![a-z])/i);
  if (m) return rc(ROWS.indexOf(m[2].toUpperCase()), Number(m[1]) - 1);
  const num = w => { const n = '一二三四五六七八九'.indexOf(w); return n >= 0 ? n + 1 : Number(w); };
  m = s.match(/第?\s*([1-9一二三四五六七八九])\s*行\s*第?\s*([1-9一二三四五六七八九])\s*列/);
  if (m) return rc(num(m[1]) - 1, num(m[2]) - 1);
  const mid = (size - 1) / 2, edge = size - 1;
  if (/正中|中间|中心|天元/.test(s) && size % 2) return rc(mid, mid);
  if (size === 3) {
    const corners = [[/左上/, 0, 0], [/右上/, 0, edge], [/左下/, edge, 0], [/右下/, edge, edge]];
    for (const [re, r, c] of corners) if (re.test(s)) return rc(r, c);
  }
  return -1;
}

/** A move's words split: the cell named first ({cell}), and what is said after it ({rest}, '' when nothing). */
export function moveWords(text) {
  const s = String(text ?? '').trim();
  const m = s.match(/^[\s「“"]*(第?\s*[1-9一二三四五六七八九]\s*行\s*第?\s*[1-9一二三四五六七八九]\s*列|[A-Ia-i]\s*[-－,，]?\s*[1-9](?![0-9])|[1-9]\s*[-－,，]?\s*[A-Ia-i](?![a-z])|正中间?|中间|中心|天元|[左右][上下]角?)[」”"]?/i);
  return m ? {cell: m[1], rest: s.slice(m[0].length).replace(/^[\s，。,.！!~～、；;：:]+/, '').trim()} : {cell: s, rest: ''};
}
/** Who is on each cell ('' when empty), after the moves. */
export function cellsOf(game) {
  const {size} = BOARDS[game.type], cells = Array(size * size).fill('');
  for (const m of game.moves || []) cells[m.at] = m.by;
  return cells;
}
/** The cells of a line of `win` through `at` held by the one there, or null. */
function lineThrough(cells, size, win, at) {
  const who = cells[at];
  if (!who) return null;
  const r = Math.floor(at / size), c = at % size;
  for (const [dr, dc] of DIRS) {
    const line = [at];
    for (const sign of [1, -1]) for (let k = 1; k < win; k++) {
      const rr = r + dr * k * sign, cc = c + dc * k * sign;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size || cells[rr * size + cc] !== who) break;
      line.push(rr * size + cc);
    }
    if (line.length >= win) return line.sort((a, b) => a - b);
  }
  return null;
}
/**
 * A game checked and its state worked out: the moves kept while they are on the board, on empty cells, taking turns from
 * the one who goes first, and none after the game was won. {type, them, first, moves, resigned, turn, winner, line, open}
 * — winner: 'me', the contact's name, 'draw' or ''; resigned: who gave up ('').
 */
export function cleanBoard(g, fail = message => Error(message)) {
  const type = String(g?.type || ''), board = BOARDS[type];
  if (!board) throw fail('不认识的棋');
  const them = String(g.them ?? '').slice(0, 40).trim();
  if (!them || them === 'me') throw fail('不知道和谁下');
  const players = ['me', them], first = players.includes(g.first) ? g.first : 'me', cells = Array(board.size * board.size).fill(''), moves = [];
  let winner = '', line = [];
  for (const m of Array.isArray(g.moves) ? g.moves : []) {
    const at = Math.round(Number(m?.at)), by = moves.length % 2 ? players.find(p => p !== first) : first;
    if (winner || m?.by !== by || !(at >= 0 && at < cells.length) || cells[at]) break;
    cells[at] = by; moves.push({by, at});
    const won = lineThrough(cells, board.size, board.win, at);
    if (won) { winner = by; line = won; }
  }
  const resigned = !winner && players.includes(g.resigned) ? g.resigned : '';
  if (resigned) winner = players.find(p => p !== resigned);
  if (!winner && moves.length === cells.length) winner = 'draw';
  const turn = winner ? '' : moves.length % 2 ? players.find(p => p !== first) : first;
  return {type, them, first, moves, resigned, turn, winner, line, open: !winner};
}

/** The board as the model reads it: a row of column numbers, then each row with its letter; × goes first, ○ second. */
export function boardText(game) {
  const {size} = BOARDS[game.type], cells = cellsOf(game), mark = who => !who ? '·' : who === game.first ? '×' : '○';
  return [`  ${Array.from({length: size}, (_, i) => i + 1).join(' ')}`, ...Array.from({length: size}, (_, r) => `${ROWS[r]} ${cells.slice(r * size, r * size + size).map(mark).join(' ')}`)].join('\n');
}

/**
 * A move for `who` when the contact's reply named none that fits: one that wins, else one that stops the other from
 * winning, else the best by a small count of lines (五子棋) or the middle, a corner, a side (井字棋). -1 when the board is full.
 */
export function fallbackMove(game, who) {
  const {size, win} = BOARDS[game.type], cells = cellsOf(game), other = who === 'me' ? game.them : 'me';
  const empty = cells.map((c, i) => c ? -1 : i).filter(i => i >= 0);
  if (!empty.length) return -1;
  const wins = by => empty.find(i => { cells[i] = by; const ok = !!lineThrough(cells, size, win, i); cells[i] = ''; return ok; });
  for (const by of [who, other]) { const i = wins(by); if (i !== undefined) return i; }
  if (game.type === 'ttt') return [4, 0, 2, 6, 8, 1, 3, 5, 7].find(i => !cells[i]);
  // 五子棋: each empty cell near the stones, scored by the runs it would make for either side (its own a little more).
  const run = (i, by) => {
    const r = Math.floor(i / size), c = i % size;
    let score = 0;
    for (const [dr, dc] of DIRS) {
      let n = 1, open = 0;
      for (const sign of [1, -1]) {
        let k = 1;
        for (; k < win; k++) { const rr = r + dr * k * sign, cc = c + dc * k * sign; if (rr < 0 || cc < 0 || rr >= size || cc >= size || cells[rr * size + cc] !== by) break; n++; }
        const rr = r + dr * k * sign, cc = c + dc * k * sign;
        if (rr >= 0 && cc >= 0 && rr < size && cc < size && !cells[rr * size + cc]) open++;
      }
      score += n >= win - 1 ? 1000 * (open + 1) : n * n * (open + 1);
    }
    return score;
  };
  const near = i => { const r = Math.floor(i / size), c = i % size; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < size && cc < size && cells[rr * size + cc]) return true; } return false; };
  const mid = Math.floor(size / 2) * size + Math.floor(size / 2);
  const pool = empty.filter(near);
  if (!pool.length) return cells[mid] ? empty[0] : mid;
  let best = pool[0], top = -1;
  for (const i of pool) { const s = run(i, who) * 1.1 + run(i, other); if (s > top) { top = s; best = i; } }
  return best;
}
