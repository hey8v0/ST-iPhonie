// 南极结界 · 见闻录: what one has seen and found, page by page — places, landmarks, creatures, things gathered. Each entry:
// its kind, a name, a hint while it is still unknown, a few lines once found, and a picture (the creature's own
// sprite, the landmark's art, the item's icon). The words are the game's own. Also the little creatures' sprites.
import {LORE_ART} from './shore.js';
import {LORE_ART as TOWN_ART} from './town.js';
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
  'place:town': {kind: '地点', name: '鲸湾城', hint: '农场的小路往西走到头。', text: '半月形的港湾，背后是山，面前是海。木头和石头的房子都带着阁楼，街道从中央广场向四面散开。破冰船在码头靠泊，各族的人在广场上来来去去——这是结界里最早的定居点之一。', art: () => TOWN_ART.hall()},
  plaza: {kind: '地标', name: '中央广场', hint: '鲸湾城的正中间。', text: '一圈石板铺成的广场，中间是一座喷泉。各族群的手工艺品和食物在这里摆摊，每周有小集，每月有一次故事之夜。广场上的字和笑声常常混着好几种语言。', art: TOWN_ART.plaza},
  library: {kind: '地标', name: '知识库总馆', hint: '广场北面的坡上，最大的那座石头房子。', text: '知识库在鲸湾的馆舍：石墙、尖顶、高高的拱窗。它收藏结界的记忆，向所有居民开放；灰区和海边的新发现，都会被记进这里。', art: TOWN_ART.library},
  buyer: {kind: '地标', name: '见闻收购行', hint: '广场西边，门上挂着一枚钱币的招牌。', text: '知识库把收购见闻的差事外包给了这家小店：你在外面看见的、捡到的，写进见闻录，拿来这里能换成钱。掌柜沈砚说，最值钱的见闻往往最不起眼。', art: TOWN_ART.buyer},
  guild: {kind: '地标', name: '向导行会', hint: '广场东边，挂着罗盘招牌和一面旗。', text: '每位新居民都有一段文化适应期，由向导协助。向导行会就在广场东边：橘在这里上班。以后去远处的委托，也会贴在这里。', art: TOWN_ART.guild},
  hall: {kind: '地标', name: '社区中心', hint: '码头上面，红屋顶的大木屋。', text: '鲸湾的社区中心，门口的公告栏贴着节庆、集市和各种启事。温婆婆在这里管事，谁家的猫丢了都来找她。', art: TOWN_ART.hall},
  board: {kind: '地标', name: '公告栏', hint: '广场东侧的木板上钉满了纸。', text: '一块钉满纸条的木板：节庆的日子、集市的时间、知识库转录的外界消息、寻猫启事。鲸湾的事，先在这里知道。', art: TOWN_ART.board},
  pier: {kind: '地标', name: '码头', hint: '从广场往南走到海边。', text: '石砌的码头沿着港湾弯成一道弧，木栈桥伸进海里。缆桩、木箱和酒桶堆在岸边，海鸥站在最高的那个上。', art: TOWN_ART.pier},
  ship: {kind: '地标', name: '破冰船', hint: '靠在栈桥东侧的大船。', text: '船身刻满符文的破冰船，能穿过迷雾屏障。新移民坐它来，贸易线的物资也由它运进鲸湾分发。船底刻着名字，只有下水时看得见。', art: TOWN_ART.ship},
  whalebone: {kind: '地标', name: '鲸骨拱', hint: '东海岸的沙滩高处，一道白色的拱。', text: '一副巨大的鲸骨半埋在沙里，肋骨弯成一排拱门。孩子们说鲸湾就是因它得名——大人们笑着说不是。', art: () => LORE_ART.whalebone()},
  wreck: {kind: '地标', name: '搁浅的小船', hint: '东海岸，沙滩上有条船。', text: '船身晒成了银灰色，船头还挂着一盏没了玻璃的灯。船舱里积满了沙，不知道它的主人后来去了哪里。', art: () => LORE_ART.wreck()},
  marker: {kind: '地标', name: '旧观测桩', hint: '退潮时，沙洲尽头的小岛上。', text: '一根方石桩，身上一圈圈刻度记着潮水的高低，刻着的符文还微微发着光。是知识库的观测桩——它好像还在工作。', art: () => LORE_ART.marker()},
  cave: {kind: '地标', name: '海蚀洞', hint: '东边海崖的脚下，只有退潮时走得到。', text: '海崖脚下的洞口，里面黑漆漆的，深处偶尔闪过一点蓝光。涨潮时洞口会被海水淹没。太黑了，看不清有多深，还是别贸然进去。', art: caveArt},
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
  kelp: {kind: '采集', name: '海带', hint: '东海岸，退潮后的潮滩上。', text: '被潮水推上潮滩的海带，滑溜溜的，带着海的咸味。晒干了能放很久。', art: icon('kelp')},
  conch: {kind: '采集', name: '海螺', hint: '东海岸，退潮后的潮滩上，不常见。', text: '螺壳上一圈一圈的花纹，像是被谁细细描过。贴在耳边，好像真能听见海。', art: icon('conch')},
};
export const LORE_IDS = Object.keys(LORE);
