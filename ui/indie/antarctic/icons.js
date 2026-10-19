// 南极结界 · the screen's little pictures: 16×16 pixel icons for tools, seed packets, what the farm grows, the seasons,
// drawn from letter grids like the people are. iconCanvas(name, {crop}) gives a canvas to put in the page (scaled by CSS
// with image-rendering: pixelated).
import {CROPS} from './game.js';

const BASE = {
  k: '#2b1b17', w: '#c98d4e', s: '#8a5530', W: '#e6b277', m: '#dfe6ee', M: '#8f9cad', n: '#5c677a',
  b: '#4f9bd6', B: '#a9dcff', d: '#2f6aa6', f: '#ffd9b8', F: '#e0a982', p: '#f2deb0', P: '#c9a874', g: '#5fae4c', G: '#3c7d36',
  y: '#ffd45c', Y: '#e8a33a', r: '#e2404f', R: '#a5243a', o: '#e8873a', O: '#b45a22', v: '#9a7de8', V: '#6a4fbf', l: '#c46bb0', L: '#8a3f7c',
  x: '#ffffff', X: '#cfe0f0', e: '#b9dc9a', E: '#7aa86a',
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
  const c = cv.getContext('2d'), rows = ICONS[name] || ICONS.hand, color = CROPS[crop]?.color || '#888';
  const pal = {...BASE, c: color, C: shadeHex(color, .7)};
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(x, y, 1, 1); } }));
  return cv;
}
/** The icon for a tool from game.js TOOLS. */
export const toolIcon = tool => tool.id === 'seed' ? iconCanvas('packet', {crop: tool.crop}) : iconCanvas(tool.id);
function shadeHex(h, k) { const n = parseInt(h.slice(1), 16); return '#' + [16, 8, 0].map(s => Math.round((n >> s & 255) * k).toString(16).padStart(2, '0')).join(''); }
