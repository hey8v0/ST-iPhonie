// 南极结界 · the screen's little pictures: 16×16 pixel icons for tools, seed packets, what the farm grows, the seasons,
// drawn from letter grids like the people are. iconCanvas(name, {crop}) gives a canvas to put in the page (scaled by CSS
// with image-rendering: pixelated).
import {CROPS} from './game.js';

const BASE = {
  k: '#2b1b17', w: '#c98d4e', s: '#8a5530', W: '#e6b277', m: '#dfe6ee', M: '#8f9cad', n: '#5c677a',
  b: '#4f9bd6', B: '#a9dcff', d: '#2f6aa6', f: '#ffd9b8', F: '#e0a982', p: '#f2deb0', P: '#c9a874', g: '#5fae4c', G: '#3c7d36',
  y: '#ffd45c', Y: '#e8a33a', r: '#e2404f', R: '#a5243a', o: '#e8873a', O: '#b45a22', v: '#9a7de8', V: '#6a4fbf', l: '#c46bb0', L: '#8a3f7c',
  x: '#ffffff', X: '#cfe0f0', e: '#b9dc9a', E: '#7aa86a',
  a: '#9a9aa6', A: '#6a6a78', q: '#c8c8d2', u: '#9a6a40', U: '#5e3d24', h: '#f2dcb0', t: '#c8a070',
};
const ICONS = {
  hoe: [
    '................', '.........kkkk...', '........kmmmmk..', '.......kwkMMMmk.', '......kwsk.kMMk.', '.....kwsk...kk..', '....kwsk........', '...kwsk.........',
    '..kwsk..........', '.kwsk...........', 'kwsk............', 'ksk.............', '.k..............', '................', '................', '................'],
  can: [
    '................', '................', '.....kkkk.......', '....k....k......', '...kkkkkkkk.....', '..kbBBbbbbdk..k.', '..kbBbbbbbdk.kbk', '..kbbbbbbbdkkbk.',
    '..kbbbbbbbddbk..', '..kbbbbbbbdkk...', '..kdbbbbbbdk....', '..kddddddddk....', '...kkkkkkkk.....', '................', '................', '................'],
  hand: [
    '................', '.....k.k.k......', '....kfkfkfk.....', '....kfkfkfk.k...', '....kfkfkfkkfk..', '....kfffffkfk...', '..k.kfffffffk...', '.kfkkffffffFk...',
    '.kffkfffffFk....', '..kfffffffFk....', '...kfffffFk.....', '....kFFFFk......', '.....kkkk.......', '................', '................', '................'],
  packet: [
    '................', '...kkkkkkkkkk...', '...kPPPPPPPPk...', '...kppppppppk...', '...kpppgpppPk...', '...kppgcgppPk...', '...kpcccccpPk...', '...kpcCcccpPk...',
    '...kpcccCcpPk...', '...kppcccppPk...', '...kppppppppk...', '...kpPpPpPppk...', '...kppppppppk...', '...kPPPPPPPPk...', '...kkkkkkkkkk...', '................'],
  turnip: [
    '.....g..g.......', '....gGg.gGg.....', '.....gGgGg......', '......gGg.......', '.....kkkkk......', '....kxxxxxk.....', '...kxxxlllk.....', '...kxxllllLk....',
    '...kxllllllk....', '....kllllLLk....', '....kLlllLk.....', '.....kLLLk......', '......kLk.......', '.......k........', '................', '................'],
  berry: [
    '................', '.....g.g.g......', '....gGgGgGg.....', '.....kGGGk......', '....krrrrrk.....', '...krryrrryk....', '...krrrrrrrk....', '...kryrrryrRk...',
    '...krrrrrrRk....', '....kryrrRk.....', '....krrrRRk.....', '.....kRRRk......', '......kRk.......', '.......k........', '................', '................'],
  herb: [
    '................', '.......vV.......', '......vVvV......', '.......vVv......', '......vVgVv.....', '.....gvVgv......', '......gGgg......', '.....gg.Ggg.....',
    '....gG..G.Gg....', '.......gG.......', '......gGG.......', '.......G........', '......kGk.......', '................', '................', '................'],
  cabbage: [
    '................', '................', '.....kkkkkk.....', '...kkEeeeeEkk...', '..kEeexxxxeeEk..', '..kEexxxxxxeEk..', '.kEeexxXxxxeeEk.', '.kEexxxXxxxxeEk.',
    '.kEeexxxXxxeeEk.', '..kEeexxxxeeEk..', '..kGEeeeeeeEGk..', '...kGGEEEEGGk...', '....kkkkkkkk....', '................', '................', '................'],
  spring: [
    '................', '......kk........', '.....kllk.......', '...kkklllkkk....', '..kllkyykllk....', '..kllkyYykllk...', '...kkklyykkk....', '....kllkllk.....',
    '....kllkllk.....', '.....kk.kk......', '.......g........', '......gG........', '.......g........', '................', '................', '................'],
  summer: [
    '................', '.......y........', '...y...y...y....', '....y.kkk.y.....', '.....kyyyk......', '....kyyyyYk.....', '.yy.kyyyyYk.yy..', '....kyyyYYk.....',
    '.....kYYYk......', '....y.kkk.y.....', '...y...y...y....', '.......y........', '................', '................', '................', '................'],
  autumn: [
    '................', '.........kk.....', '.......kkook....', '.....kkoooook...', '....koooyoook...', '...koooyoooOk...', '...kooyoooOk....', '..koyooooOk.....',
    '..kyoooOOk......', '.ksOOOOkk.......', 'ks.kkkk.........', 'k...............', '................', '................', '................', '................'],
  winter: [
    '................', '.......X........', '.....X.x.X......', '......Xxx.......', '..X...xXx...X...', '...X..xXx..X....', '.XxxxxxkxxxxxX..', '...X..xXx..X....',
    '..X...xXx...X...', '......xxX.......', '.....X.x.X......', '.......X........', '................', '................', '................', '................'],
  axe: ['................', '.kkkkk..........', 'kmmmmmkk........', 'kmmmmMMMk.......', 'kmmmMMnnk.......', '.kmMMnnkwk......', '..kkkkkwsk......', '.......kwsk.....', '........kwsk....', '.........kwsk...', '..........kwsk..', '...........kwsk.', '............ksk.', '.............k..'],
  pick: ['................', '...kkk.....kkk..', '..kmmMk...kMmmk.', '...kkMMkkkMMkk..', '.....kMMnMMk....', '......kknkk.....', '.......kwk......', '......kwsk......', '.....kwsk.......', '....kwsk........', '...kwsk.........', '..kwsk..........', '.kwsk...........', '.ksk............', '..k.............', '................'],
  wood: ['....kkkkkkkkk...', '...kuuuuuuuukk..', '..khuuuuuuuuhtk.', '..khtuuuuuuuhhk.', '..khuuuuuuuuhtk.', '...kUUUUUUUUkk..', '...kkkkkkkkkk...', '..kuuuuuuuukk...', '.khuuuuuuuuhtk..', '.khtuuuuuuuhhk..', '..kUUUUUUUUkk...', '...kkkkkkkkk....'],
  stone: ['......kkkk......', '....kkqqqakk....', '...kqqqqaaaak...', '..kqqqqaaaaAk...', '..kqqaaaaaaAAk..', '..kaaaaaaaAAAk..', '..kaaaaaAAAAAk..', '...kAAAAAAAAk...', '....kkkkkkkk....'],
  fiber: ['....g...g..g....', '....gg.gG.gg....', '.....gGgGgG.....', '.....GgGgGg.....', '......gGgG......', '......GgGg......', '.....kyyyyk.....', '......gGgG......', '.....gGgGgG.....', '....gGg.GgGg....', '....g.....g.....'],
  cone: ['.......kk.......', '......kgGk......', '.....kUuUuk.....', '.....kuUuUk.....', '....kUuUuUuk....', '....kuUuUuUk....', '....kUuUuUuk....', '.....kuUuUk.....', '.....kUuUuk.....', '......kUUk......', '.......kk.......'],
  leek: ['......g..g......', '.....gG.gG......', '.....gG.Gg..g...', '......gGgG.gG...', '.......gGgGg....', '.......GgGg.....', '.......gGg......', '......kxxk......', '......kxxk......', '......kxxk......', '......kxXk......', '.....kxxXXk.....', '.....kXXXXk.....', '......kEEk......'],
  dandelion: ['.....kkkkk......', '....kyyyyyk.....', '...kyyYyYyyk....', '...kyYyyyYyk....', '...kyyyYyyyk....', '....kyyyyyk.....', '.....kkGkk......', '.......G........', '.......G..g.....', '...gg..G.gG.....', '...gGg.GgG......', '....gGgGG.......', '.....gGG........'],
  raspberry: ['.......gG.......', '......gGgG......', '.....kkGgkk.....', '....krrRrrrk....', '...krxrrRrrrk...', '...krrRrrrRrk...', '...kRrrrRrrRk...', '....krRrrrRk....', '....kRrrRrrk....', '.....kRrRrk.....', '......kRRk......', '.......kk.......'],
  bellflower: ['.......G........', '......GgG.......', '.....kvvvk..g...', '....kvVvvVk.gG..', '....kvvVvvk..G..', '.....kVvVk...G..', '......kvk..kvvk.', '.......G..kvVvk.', '.......G...kVk..', '...g...G....G...', '...gG..G...gG...', '....gGgG..gG....', '.....gGGgGG.....'],
  mushroom: ['.....kkkkkk.....', '...kkuuuuuukk...', '..kuuxuuuuuuuk..', '..kuuuuuuxuuuk..', '.kuuuuuuuuuuuuk.', '.kUUUUUUUUUUUUk.', '..kkkkxxxxkkkk..', '......kxxk......', '......kxXk......', '......kxXk......', '.....kxxXXk.....', '.....kkkkkk.....'],
  hazelnut: ['......gG........', '.....gGgk.......', '....kkkkkkk.....', '...khhhhhhhk....', '...kuuuuuuUk....', '..kuuuuuuuuUk...', '..kuxuuuuuuUk...', '..kuuuuuuuUUk...', '...kuuuuuUUk....', '....kuuuUUk.....', '.....kkkkk......'],
  iceroot: ['.......gG.......', '......gGgG......', '.......Gg.......', '.....kkbbkk.....', '....kBBbbbbk....', '....kBxBbbbk....', '....kBBbbbdk....', '.....kBbbdk.....', '.....kBbbdk.....', '......kbdk......', '......kbdk......', '.......kd.......', '.......k........'],
  frostfruit: ['.......G........', '......kGk.......', '.....kXxXk......', '....kXxxBXk.....', '...kXxxBBBXk....', '...kXxBBBbBk....', '...kXBBBbbBk....', '...kXBBbbbdk....', '....kBBbbddk....', '.....kbbddk.....', '......kddk......', '.......kk.......'],
  shell: ['....kkkkkkkk....', '...khhPhhPhhk...', '..khhPhhPhhPhk..', '..khPhhPhhPhhk..', '..kPhhPhhPhhPk..', '...khPhhPhhPk...', '....khhPhhPk....', '.....khhhhk.....', '......kPPk......', '.......kk.......'],
  seaglass: ['.....kkkk.......', '....kBxBBk......', '...kBxBBBbkk....', '...kBBBBbbbbk...', '..kBBBBbbbbbk...', '..kBBbbbbbbdk...', '...kBbbbbbddk...', '....kbbbbddk....', '.....kkkdkk.....', '........k.......'],
  chest: ['...kkkkkkkkkk...', '..kWWWWWWWWWWk..', '..kwwwwwwwwwwk..', '..kkkkkkkkkkkk..', '..kwwwwyywwwwk..', '..kwswwyYwwswk..', '..kwswwkkwwswk..', '..kwswwwwwwswk..', '..kwswwwwwwswk..', '..kssssssssssk..', '..kkkkkkkkkkkk..'],
  sprinkler: ['...B.......B....', '....B..k..B.....', '.......k........', '..B...kmk...B...', '.....kmMnk......', '....kmmMnnk.....', '...kmmmMMnnk....', '...kMMMMnnnk....', '..kaaaaaaaaak...', '..kAAAAAAAAAk...', '...kkkkkkkkk....'],
  path: ['..kkkk...kkkk...', '.kqqqak.kqqqak..', '.kqaaAk.kaaaAk..', '..kkkk...kkkk...', '.....kkkkk......', '....kqqqqak.....', '....kqaaaAk.....', '.....kkkkk......', '..kkkk...kkkk...', '.kqqak..kqqqak..', '.kaaAk..kaaaAk..', '..kkk....kkkk...'],
  fence: ['...kk......kk...', '..kWwk....kWwk..', '..kwsk....kwsk..', '..kwskkkkkkwsk..', '..kwswwwwwwwsk..', '..kwskkkkkkwsk..', '..kwsk....kwsk..', '..kwskkkkkkwsk..', '..kwswwwwwwwsk..', '..kwskkkkkkwsk..', '..kwsk....kwsk..', '..kwsk....kwsk..', '..kkkk....kkkk..'],
  campfire: ['.......y........', '......yYy.......', '.....yYoYy......', '.....yoroYy.....', '....yYorroYy....', '....YoorrooY....', '...kkuuoouukk...', '..kuuUuuuuUuuk..', '.kaakuuUUuukaak.', '.kaaAkkkkkkkAak.', '..kkk......kkk..'],
  trash: ['......kkkk......', '...kkkkkkkkkk...', '...kaaaaaaaak...', '...kkkkkkkkkk...', '....kaAaAaAk....', '....kaAaAaAk....', '....kaAaAaAk....', '....kaAaAaAk....', '....kaAaAaAk....', '....kkkkkkkk....'],
  book: ['..kkkkkk.kkkkkk.', '.kppppppkppppppk', '.kpPPPppkpPPPPpk', '.kppppppkppppppk', '.kpPPPPpkpPPPppk', '.kppppppkppppppk', '.kpPPPppkpPPPPpk', '.kppppppkppppppk', '..kkkkkkkkkkkkk.', '...uuuuuuuuuuu..'],
  coin: [
    '................', '.....kkkkk......', '....kyyyyYk.....', '...kyyxyyyYk....', '...kyxyyyyYk....', '...kyyyYyyYk....', '...kyyyYyyYk....', '...kyyyyyyYk....',
    '...kYyyyyYYk....', '....kYYYYYk.....', '.....kkkkk......', '................', '................', '................', '................', '................'],
  wither: [
    '................', '.....s...s......', '....sPs.sPs.....', '.....sPsPs......', '......sPs.......', '.......s........', '......sPs.......', '.......s........',
    '......kkk.......', '.....kPPPk......', '....kPsssPk.....', '.....kkkkk......', '................', '................', '................', '................'],
};
const SEASON_ICON = ['spring', 'summer', 'autumn', 'winter'];
export const seasonIcon = season => SEASON_ICON[season] || 'spring';

/** A 16×16 canvas. For a seed packet pass {crop}: the packet shows that crop's colour. */
export function iconCanvas(name, {crop} = {}) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; cv.className = 'icon';
  const c = cv.getContext('2d');
  iconPixels(name, {crop}).forEach(([x, y, col]) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); });
  return cv;
}
/** An icon's pixels as [x, y, colour] (shorter icons sit in the middle), for canvases and for the world. */
export function iconPixels(name, {crop} = {}) {
  const rows = ICONS[name] || ICONS.hand, color = CROPS[crop]?.color || '#888', pal = {...BASE, c: color, C: shadeHex(color, .7)}, top = Math.floor((16 - rows.length) / 2), out = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) out.push([x, y + top, pal[ch]]); }));
  return out;
}
/** The icon for something in the bag (game.js ITEMS): seeds show their packet, everything else its own picture. */
export const itemIcon = id => id.startsWith('seed:') ? iconCanvas('packet', {crop: id.slice(5)}) : iconCanvas(id);
function shadeHex(h, k) { const n = parseInt(h.slice(1), 16); return '#' + [16, 8, 0].map(s => Math.round((n >> s & 255) * k).toString(16).padStart(2, '0')).join(''); }
