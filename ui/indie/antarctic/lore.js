// 南极结界 · 见闻录: what one has seen and found, page by page — places, landmarks, creatures, things gathered. Each entry:
// its kind, a name, a hint while it is still unknown, a few lines once found, and a picture (the creature's own
// sprite, the landmark's art, the item's icon). The words are the game's own. Also the little creatures' sprites.
import {LORE_ART} from './shore.js';
import {house} from './assets.js';
import {iconPixels} from './icons.js';

const hexToPacked = h => { const n = parseInt(h.slice(1), 16); return (255 << 24 | (n & 255) << 16 | (n >> 8 & 255) << 8 | n >> 16) >>> 0; };
/** A small sprite from rows of letters and a palette: {w, h, px}. */
export function grid(rows, pal) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length)), px = new Uint32Array(w * h);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) px[y * w + x] = hexToPacked(pal[ch]); }));
  return {w, h, px};
}
const PAL = {k: '#2a2226', w: '#f6f4ee', g: '#a8acb6', G: '#7a7e8a', y: '#f0b43a', o: '#e8873a', r: '#d0503a', R: '#9a3424', e: '#1a1418', E: '#5a5048',
  c: '#5ae8e0', C: '#a8fff4', W: '#ffffff', p: '#f4f0ff', P: '#c8b8f0', s: '#8a8c98', S: '#6a6c78', Y: '#e8ff7a'};
// the little creatures
export const CRITTERS = {
  gullStand: grid(['....kk....', '...kwwk...', '..kwwwky..', '.kgwwwwk..', 'kggwwwwk..', '.kkwwwk...', '...o.o....'], PAL),
  gullUp: grid(['k...........k', 'kg.........gk', '.kgg.kwk.ggk.', '...kgwwwgk...', '.....kkk.....'], PAL),
  gullDown: grid(['.....kwk.....', '..kkgwwwgkk..', '.kgg.....ggk.', 'kg.........gk', 'k...........k'], PAL),
  crabA: grid(['.r.....r.', 'rk.....kr', '.rrrrrrr.', 'r.rRRRr.r', '.r.r.r.r.'], PAL),
  crabB: grid(['r.......r', '.rk...kr.', '.rrrrrrr.', '.rRRRRRr.', 'r.r...r.r'], PAL),
  seal: grid(['............kkk...', '..kkkkkkkkkkksssk..', '.kssssssssssssesk.', 'kssSsSsSsssssssssk', 'kssssssssssssssk..', '.kSSSSSSSSSSSSk...', '..kk.......kk.....'], PAL),
  jelly: grid(['..ccc..', '.cCCCc.', 'cCWWWCc', '.cCCCc.', '.c.c.c.', 'c..c..c'], PAL),
  butterfly: grid(['pp.k.pp', 'ppPkPpp', '.pPkPp.', 'pp.k.pp'], PAL),
  firefly: grid(['..Y..', '.YYY.', 'YYWYY', '.YYY.', '..Y..'], PAL),
};
const icon = id => () => { const px = new Uint32Array(256); for (const [x, y, c] of iconPixels(id)) px[y * 16 + x] = hexToPacked(c); return {w: 16, h: 16, px}; };
const caveArt = () => grid(['....kkkkkkkk....', '..kkSsssssssSkk..', '.kSsssssssssssSk.', 'kSsss.kkkkk.sssSk', 'kSss.keeeeek.ssSk', 'kSs.keeeceeek.sSk', 'kSs.keeeeeeek.sSk', 'kSs.keeeeeeek.sSk', 'kkkkkkkkkkkkkkkkk'], {...PAL, e: '#0c1416', c: '#3aa8a0'});

// ── the pages ──
export const KINDS = ['地点', '地标', '生物', '采集'];
export const LORE = {
  'place:farm': {kind: '地点', name: '鲸湾郊外', hint: '你的家。', text: '鲸湾城外的一片坡地，背靠长满松树的山崖，面朝大海。坡上有一间带阁楼的小木屋——现在是你的家了。', art: () => house()},
  'place:shore': {kind: '地点', name: '东海岸', hint: '农场东边的小路通向哪里？', text: '农场往东，翻过沙丘就是一大片潮滩。一天两次，海水退到很远的地方，又慢慢涨回来，带走一些东西，也留下一些。', art: () => LORE_ART.wreck()},
  whalebone: {kind: '地标', name: '鲸骨拱', hint: '东海岸的沙滩高处，一道白色的拱。', text: '一副巨大的鲸骨半埋在沙里，肋骨弯成一排拱门。孩子们说鲸湾就是因它得名——大人们笑着说不是。', art: () => LORE_ART.whalebone()},
  wreck: {kind: '地标', name: '搁浅的小船', hint: '东海岸，沙滩上有条船。', text: '船身晒成了银灰色，船头还挂着一盏没了玻璃的灯。船舱里积满了沙，不知道它的主人后来去了哪里。', art: () => LORE_ART.wreck()},
  marker: {kind: '地标', name: '旧观测桩', hint: '退潮时，沙洲尽头的小岛上。', text: '一根方石桩，身上一圈圈刻度记着潮水的高低，刻着的符文还微微发着光。是知识库的观测桩——它好像还在工作。', art: () => LORE_ART.marker()},
  cave: {kind: '地标', name: '海蚀洞', hint: '东边海崖的脚下，只有退潮时走得到。', text: '海崖脚下的洞口，里面黑漆漆的，深处偶尔闪过一点蓝光。涨潮时洞口会被海水淹没。得带上灯再来。', art: caveArt},
  gull: {kind: '生物', name: '白鸥', hint: '白天，在海边。', text: '海风里最吵闹的居民。它们会盯着你手里的东西看，看清楚不是吃的，才慢悠悠地飞走。', art: () => CRITTERS.gullStand},
  crab: {kind: '生物', name: '礁蟹', hint: '退潮后的礁石之间，跑得很快。', text: '退潮后在礁石间横着跑的小螃蟹，壳上的花纹和礁石几乎一样。人一靠近，就一溜烟钻进石缝里。', art: () => CRITTERS.crabA},
  seal: {kind: '生物', name: '斑海豹', hint: '中午前后，小岛的礁石上。', text: '中午前后，小岛的礁石上常有一只斑海豹在晒太阳。它看你的眼神像是在说：这块石头是我的。', art: () => CRITTERS.seal},
  jelly: {kind: '生物', name: '潮光水母', hint: '夜里退潮后的潮池中。', text: '夜里的潮池中，有一点一点会呼吸的光。退潮把它们留在池子里，涨潮时再把它们接回海里去。', art: () => CRITTERS.jelly},
  butterfly: {kind: '生物', name: '粉蝶', hint: '春夏的白天，在农场的花草间。', text: '春天和夏天的白天，在农场的花草间忽高忽低地飞。停下来的时候，翅膀会慢慢开合。', art: () => CRITTERS.butterfly},
  firefly: {kind: '生物', name: '萤火虫', hint: '暖和的夜里，在农场的草丛中。', text: '暖和的夜里，草丛中一闪一闪的绿光。离得近了，能看见它们是一只一只的。', art: () => CRITTERS.firefly},
  leek: {kind: '采集', name: '野葱', hint: '春天的坡地上。', text: '春天的坡地上冒出来的野葱，切碎了撒在汤里很香。', art: icon('leek')},
  dandelion: {kind: '采集', name: '蒲公英', hint: '春天的草地上。', text: '黄色的小花，叶子微苦，可以拌着吃，花可以泡茶。', art: icon('dandelion')},
  raspberry: {kind: '采集', name: '树莓', hint: '夏天的灌木边。', text: '夏天的树莓酸甜，摘的时候要小心刺。', art: icon('raspberry')},
  bellflower: {kind: '采集', name: '风铃草', hint: '夏天的草地上。', text: '紫色的小铃铛，风一吹好像真的会响。', art: icon('bellflower')},
  mushroom: {kind: '采集', name: '雪松菇', hint: '秋天，松树附近。', text: '秋天长在松树下的蘑菇，伞面上有白点，烤着吃最香。', art: icon('mushroom')},
  hazelnut: {kind: '采集', name: '榛子', hint: '秋天的地上。', text: '秋天掉在地上的榛子，硬壳里是香香的果仁。', art: icon('hazelnut')},
  iceroot: {kind: '采集', name: '冰根', hint: '冬天的土里。', text: '冬天才有的淡蓝色根茎，凉丝丝的，煮软了有一点甜。', art: icon('iceroot')},
  frostfruit: {kind: '采集', name: '霜晶果', hint: '冬天的草丛里。', text: '冬天结的小果子，表面像结了一层霜，在手心里慢慢变暖。', art: icon('frostfruit')},
  shell: {kind: '采集', name: '贝壳', hint: '沙滩上。', text: '海浪送上岸的扇贝壳，纹路一圈一圈的。', art: icon('shell')},
  seaglass: {kind: '采集', name: '海玻璃', hint: '沙滩上。', text: '被海水磨圆了边的玻璃，对着光看是淡淡的蓝。不知道它原来是什么。', art: icon('seaglass')},
};
export const LORE_IDS = Object.keys(LORE);
