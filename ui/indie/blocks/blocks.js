// What the world is made of: every block (its id in the world, faces, shape, how it is lit, how hard it is to break,
// what tool it wants and what it drops) and every item. Names are the game's own ids (stone, oak_log …), so a texture
// pack picked by the player is found by the same names; our own textures (textures.js) use them too.
// A block in the world is a 16-bit number: the low 12 bits are the block (its place in BLOCKS — never reorder, only
// add at the end: saves keep a palette of names anyway), the high 4 bits its state (axis, facing, level, layers …).

export const MINY = -64, HEIGHT = 384, SECTIONS = HEIGHT / 16, SEA = 63;
export const idOf = v => v & 0xFFF, metaOf = v => v >>> 12, withMeta = (id, meta) => id | meta << 12;

// Faces: 0 east +x, 1 west -x, 2 up +y, 3 down -y, 4 south +z, 5 north -z.
export const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const OPPOSITE = [1, 0, 3, 2, 5, 4];

const T = {PICK: 'pickaxe', AXE: 'axe', SHOVEL: 'shovel', HOE: 'hoe', SWORD: 'sword'};
// tool tiers: 0 wood, 1 stone, 2 iron, 3 diamond (gold mines like wood)
const B = [];
/**
 * A block: name, zh, tex ({all} | {top, bottom, side} | {top, bottom, side, front}), and:
 * shape: cube | cross | liquid | torch | layer | cactus | crop | none; pass: solid | cutout | translucent;
 * hard (seconds-ish hardness, -1 unbreakable), tool, tier (needed to drop), drop (name | fn | null), light (0–15),
 * tint: 'grass' | 'foliage' | 'water' | '#rrggbb', gravity, replace (can be built over), solid (collides),
 * opaque (hides neighbours' faces and blocks light), filter (light lost passing through, 0–15).
 */
function block(name, zh, o = {}) {
  const b = {id: B.length, name, zh, shape: 'cube', pass: 'solid', hard: 1, tool: null, tier: -1, drop: name, light: 0, tint: null,
    gravity: false, replace: false, solid: true, opaque: true, filter: 15, item: true, axis: false, facing: false, ...o};
  if (b.shape !== 'cube' || b.pass !== 'solid') b.opaque = o.opaque ?? false;
  if (!b.opaque) b.filter = o.filter ?? (b.pass === 'translucent' && b.shape === 'liquid' ? 2 : b.name.endsWith('_leaves') ? 1 : 0);
  B.push(b);
  return b;
}
const all = t => ({all: t});
const tbs = (top, bottom, side) => ({top, bottom, side});

block('air', '空气', {shape: 'none', pass: 'none', solid: false, opaque: false, replace: true, hard: 0, drop: null, item: false});
block('stone', '石头', {tex: all('stone'), hard: 1.5, tool: T.PICK, tier: 0, drop: 'cobblestone'});
block('grass_block', '草方块', {tex: tbs('grass_block_top', 'dirt', 'grass_block_side'), hard: 0.6, tool: T.SHOVEL, drop: 'dirt', tint: 'grass'});
block('dirt', '泥土', {tex: all('dirt'), hard: 0.5, tool: T.SHOVEL});
block('cobblestone', '圆石', {tex: all('cobblestone'), hard: 2, tool: T.PICK, tier: 0});
block('bedrock', '基岩', {tex: all('bedrock'), hard: -1, drop: null});
block('sand', '沙子', {tex: all('sand'), hard: 0.5, tool: T.SHOVEL, gravity: true});
block('gravel', '沙砾', {tex: all('gravel'), hard: 0.6, tool: T.SHOVEL, gravity: true, drop: r => r() < 0.1 ? 'flint' : 'gravel'});
block('water', '水', {tex: all('water_still'), shape: 'liquid', pass: 'translucent', solid: false, replace: true, hard: 100, drop: null, tint: 'water', item: false});
block('lava', '岩浆', {tex: all('lava_still'), shape: 'liquid', pass: 'solid', solid: false, replace: true, hard: 100, drop: null, light: 15, item: false, opaque: false});
const WOODS = [['oak', '橡木'], ['birch', '白桦木'], ['spruce', '云杉木'], ['jungle', '丛林木'], ['acacia', '金合欢木'], ['dark_oak', '深色橡木']];
const LEAF_TINT = {birch: '#80a755', spruce: '#619961'};
for (const [w, zh] of WOODS) {
  block(`${w}_log`, `${zh.replace(/木$/, '')}原木`, {tex: tbs(`${w}_log_top`, `${w}_log_top`, `${w}_log`), hard: 2, tool: T.AXE, axis: true});
  block(`${w}_planks`, `${zh.replace(/木$/, '')}木板`, {tex: all(`${w}_planks`), hard: 2, tool: T.AXE});
  block(`${w}_leaves`, `${zh.replace(/木$/, '')}树叶`, {tex: all(`${w}_leaves`), pass: 'cutout', hard: 0.2, tool: T.HOE, tint: LEAF_TINT[w] || 'foliage',
    drop: r => { const x = r(); return x < (w === 'jungle' ? 0.025 : 0.05) ? `${w}_sapling` : x < 0.07 ? 'stick' : (w === 'oak' || w === 'dark_oak') && x < 0.075 ? 'apple' : null; }});
}
const ORES = [['coal', '煤矿石', 0, 'coal'], ['iron', '铁矿石', 1, 'raw_iron'], ['copper', '铜矿石', 1, r => ['raw_copper', 2 + Math.floor(r() * 4)]],
  ['gold', '金矿石', 2, 'raw_gold'], ['redstone', '红石矿石', 2, r => ['redstone', 4 + Math.floor(r() * 2)]], ['lapis', '青金石矿石', 1, r => ['lapis_lazuli', 4 + Math.floor(r() * 6)]],
  ['diamond', '钻石矿石', 2, 'diamond'], ['emerald', '绿宝石矿石', 2, 'emerald']];
for (const [o, zh, tier, drop] of ORES) block(`${o}_ore`, zh, {tex: all(`${o}_ore`), hard: 3, tool: T.PICK, tier, drop, light: 0});
block('deepslate', '深板岩', {tex: tbs('deepslate_top', 'deepslate_top', 'deepslate'), hard: 3, tool: T.PICK, tier: 0, drop: 'cobbled_deepslate', axis: true});
block('cobbled_deepslate', '深板岩圆石', {tex: all('cobbled_deepslate'), hard: 3.5, tool: T.PICK, tier: 0});
for (const [o, zh, tier, drop] of ORES) block(`deepslate_${o}_ore`, `深层${zh}`, {tex: all(`deepslate_${o}_ore`), hard: 4.5, tool: T.PICK, tier, drop});
for (const [s, zh, h] of [['granite', '花岗岩', 1.5], ['diorite', '闪长岩', 1.5], ['andesite', '安山岩', 1.5], ['tuff', '凝灰岩', 1.5], ['calcite', '方解石', 0.75]]) block(s, zh, {tex: all(s), hard: h, tool: T.PICK, tier: 0});
block('sandstone', '砂岩', {tex: tbs('sandstone_top', 'sandstone_bottom', 'sandstone'), hard: 0.8, tool: T.PICK, tier: 0});
block('red_sand', '红沙', {tex: all('red_sand'), hard: 0.5, tool: T.SHOVEL, gravity: true});
block('red_sandstone', '红砂岩', {tex: tbs('red_sandstone_top', 'red_sandstone_bottom', 'red_sandstone'), hard: 0.8, tool: T.PICK, tier: 0});
block('clay', '黏土块', {tex: all('clay'), hard: 0.6, tool: T.SHOVEL, drop: () => ['clay_ball', 4]});
block('coarse_dirt', '砂土', {tex: all('coarse_dirt'), hard: 0.5, tool: T.SHOVEL});
block('podzol', '灰化土', {tex: tbs('podzol_top', 'dirt', 'podzol_side'), hard: 0.5, tool: T.SHOVEL, drop: 'dirt'});
block('mossy_cobblestone', '苔石', {tex: all('mossy_cobblestone'), hard: 2, tool: T.PICK, tier: 0});
block('obsidian', '黑曜石', {tex: all('obsidian'), hard: 50, tool: T.PICK, tier: 3});
block('snow_block', '雪块', {tex: all('snow'), hard: 0.2, tool: T.SHOVEL, tier: 0, drop: () => ['snowball', 4]});
block('snow', '雪', {tex: all('snow'), shape: 'layer', hard: 0.1, tool: T.SHOVEL, tier: 0, drop: 'snowball', replace: true, solid: false, opaque: false, filter: 0});
block('ice', '冰', {tex: all('ice'), pass: 'translucent', hard: 0.5, tool: T.PICK, drop: null, filter: 2, slip: 0.98});
block('packed_ice', '浮冰', {tex: all('packed_ice'), hard: 0.5, tool: T.PICK, drop: null, slip: 0.98});
const plant = (name, zh, o = {}) => block(name, zh, {tex: all(name), shape: 'cross', pass: 'cutout', hard: 0, solid: false, replace: false, ...o});
plant('short_grass', '草', {tint: 'grass', replace: true, drop: r => r() < 0.125 ? 'wheat_seeds' : null});
plant('fern', '蕨', {tint: 'grass', replace: true, drop: r => r() < 0.125 ? 'wheat_seeds' : null});
for (const [f, zh] of [['dandelion', '蒲公英'], ['poppy', '虞美人'], ['blue_orchid', '兰花'], ['allium', '绒球葱'], ['azure_bluet', '蓝花美耳草'], ['oxeye_daisy', '滨菊'], ['cornflower', '矢车菊'], ['lily_of_the_valley', '铃兰']]) plant(f, zh);
plant('dead_bush', '枯萎的灌木', {replace: true, drop: r => ['stick', Math.floor(r() * 3)]});
plant('sugar_cane', '甘蔗', {tint: 'grass'});
block('cactus', '仙人掌', {tex: tbs('cactus_top', 'cactus_bottom', 'cactus_side'), shape: 'cactus', pass: 'cutout', hard: 0.4, opaque: false, filter: 0});
plant('red_mushroom', '红色蘑菇', {light: 0});
plant('brown_mushroom', '棕色蘑菇', {light: 1});
for (const [w, zh] of WOODS) plant(`${w}_sapling`, `${zh.replace(/木$/, '')}树苗`);
block('crafting_table', '工作台', {tex: {top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side', front: 'crafting_table_front'}, hard: 2.5, tool: T.AXE, facing: true, use: 'crafting'});
block('furnace', '熔炉', {tex: {top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front'}, hard: 3.5, tool: T.PICK, tier: 0, facing: true, use: 'furnace'});
block('chest', '箱子', {tex: {top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front'}, hard: 2.5, tool: T.AXE, facing: true, use: 'chest'});
block('torch', '火把', {tex: all('torch'), shape: 'torch', pass: 'cutout', hard: 0, solid: false, light: 14});
block('glass', '玻璃', {tex: all('glass'), pass: 'cutout', hard: 0.3, drop: null, filter: 0});
block('bricks', '砖块', {tex: all('bricks'), hard: 2, tool: T.PICK, tier: 0});
block('stone_bricks', '石砖', {tex: all('stone_bricks'), hard: 1.5, tool: T.PICK, tier: 0});
block('bookshelf', '书架', {tex: tbs('oak_planks', 'oak_planks', 'bookshelf'), hard: 1.5, tool: T.AXE, drop: () => ['book', 3]});
block('glowstone', '荧石', {tex: all('glowstone'), hard: 0.3, light: 15, drop: r => ['glowstone_dust', 2 + Math.floor(r() * 3)]});
block('smooth_stone', '平滑石头', {tex: all('smooth_stone'), hard: 2, tool: T.PICK, tier: 0});
for (const [m, zh, h, tier] of [['iron', '铁块', 5, 1], ['gold', '金块', 3, 2], ['diamond', '钻石块', 5, 2], ['emerald', '绿宝石块', 5, 2], ['coal', '煤炭块', 5, 0], ['lapis', '青金石块', 3, 1], ['redstone', '红石块', 5, 0], ['copper', '铜块', 3, 1]]) block(`${m}_block`, zh, {tex: all(`${m}_block`), hard: h, tool: T.PICK, tier});
export const COLORS = [['white', '白色', '#e9ecec'], ['orange', '橙色', '#f07613'], ['magenta', '品红色', '#bd44b3'], ['light_blue', '淡蓝色', '#3aafd9'], ['yellow', '黄色', '#f8c527'],
  ['lime', '黄绿色', '#70b919'], ['pink', '粉红色', '#ed8dac'], ['gray', '灰色', '#3e4447'], ['light_gray', '淡灰色', '#8e8e86'], ['cyan', '青色', '#158991'],
  ['purple', '紫色', '#792aac'], ['blue', '蓝色', '#35399d'], ['brown', '棕色', '#724728'], ['green', '绿色', '#546d1b'], ['red', '红色', '#a12722'], ['black', '黑色', '#141519']];
for (const [c, zh] of COLORS) block(`${c}_wool`, `${zh}羊毛`, {tex: all(`${c}_wool`), hard: 0.8});
block('tnt', 'TNT', {tex: tbs('tnt_top', 'tnt_bottom', 'tnt_side'), hard: 0});
block('terracotta', '陶瓦', {tex: all('terracotta'), hard: 1.25, tool: T.PICK, tier: 0});
block('farmland', '耕地', {tex: tbs('farmland', 'dirt', 'dirt'), shape: 'farmland', hard: 0.6, tool: T.SHOVEL, drop: 'dirt', opaque: false, filter: 15});
block('wheat', '小麦', {tex: all('wheat_stage0'), shape: 'crop', pass: 'cutout', hard: 0, solid: false, item: false,
  drop: (r, meta) => meta >= 7 ? [['wheat', 1], ['wheat_seeds', 1 + Math.floor(r() * 3)]] : ['wheat_seeds', 1]});
block('ladder', '梯子', {tex: all('ladder'), shape: 'wall', pass: 'cutout', hard: 0.4, tool: T.AXE, solid: false, facing: true, climb: true});
block('oak_slab', '橡木台阶', {tex: all('oak_planks'), shape: 'slab', hard: 2, tool: T.AXE, opaque: false, filter: 0});
block('stone_slab', '石台阶', {tex: tbs('smooth_stone', 'smooth_stone', 'smooth_stone_slab_side'), shape: 'slab', hard: 2, tool: T.PICK, tier: 0, opaque: false, filter: 0});
block('cobblestone_slab', '圆石台阶', {tex: all('cobblestone'), shape: 'slab', hard: 2, tool: T.PICK, tier: 0, opaque: false, filter: 0});
block('pumpkin', '南瓜', {tex: tbs('pumpkin_top', 'pumpkin_top', 'pumpkin_side'), hard: 1, tool: T.AXE});
block('melon', '西瓜', {tex: tbs('melon_top', 'melon_top', 'melon_side'), hard: 1, tool: T.AXE, drop: r => ['melon_slice', 3 + Math.floor(r() * 5)]});
block('moss_block', '苔藓块', {tex: all('moss_block'), hard: 0.1, tool: T.HOE});
block('mud', '泥巴', {tex: all('mud'), hard: 0.5, tool: T.SHOVEL});
block('lantern', '灯笼', {tex: all('lantern'), shape: 'lantern', pass: 'cutout', hard: 3.5, tool: T.PICK, tier: 0, solid: false, light: 15});
block('blue_ice', '蓝冰', {tex: all('blue_ice'), hard: 2.8, tool: T.PICK, drop: null, slip: 0.989});

export const BLOCKS = B;
export const BY_NAME = Object.fromEntries(B.map(b => [b.name, b]));
export const AIR = 0, ID = Object.fromEntries(B.map(b => [b.name, b.id]));

// ---------- items ----------
/** An item that is not a block: icon (its texture name), stack size, food, tool {kind, tier, speed, uses}, fuel (seconds). */
const I = {};
function item(name, zh, o = {}) { I[name] = {name, zh, icon: name, stack: 64, ...o}; return I[name]; }
item('stick', '木棍', {fuel: 5});
item('coal', '煤炭', {fuel: 80});
item('charcoal', '木炭', {fuel: 80});
for (const [m, zh] of [['iron', '铁'], ['copper', '铜'], ['gold', '金']]) { item(`raw_${m}`, `粗${zh}`); item(`${m}_ingot`, `${zh}锭`); }
item('diamond', '钻石'); item('emerald', '绿宝石'); item('lapis_lazuli', '青金石'); item('redstone', '红石粉'); item('flint', '燧石');
item('glowstone_dust', '荧石粉'); item('book', '书'); item('snowball', '雪球', {stack: 16}); item('clay_ball', '黏土球'); item('brick', '红砖');
item('apple', '苹果', {food: 4, sat: 2.4}); item('wheat_seeds', '小麦种子', {plant: 'wheat'}); item('wheat', '小麦'); item('bread', '面包', {food: 5, sat: 6});
item('melon_slice', '西瓜片', {food: 2, sat: 1.2}); item('bucket', '桶', {stack: 16}); item('water_bucket', '水桶', {stack: 1, pour: 'water'}); item('lava_bucket', '岩浆桶', {stack: 1, pour: 'lava', fuel: 1000});
item('bowl', '碗', {fuel: 5});
export const TIERS = {wooden: {zh: '木', tier: 0, speed: 2, uses: 59}, stone: {zh: '石', tier: 1, speed: 4, uses: 131}, iron: {zh: '铁', tier: 2, speed: 6, uses: 250},
  golden: {zh: '金', tier: 0, speed: 12, uses: 32}, diamond: {zh: '钻石', tier: 3, speed: 8, uses: 1561}};
const KINDS = {pickaxe: '镐', axe: '斧', shovel: '锹', sword: '剑', hoe: '锄'};
for (const [t, info] of Object.entries(TIERS)) for (const [k, zh] of Object.entries(KINDS))
  item(`${t}_${k}`, `${info.zh}${zh}`, {stack: 1, tool: {kind: k, tier: info.tier, speed: info.speed, uses: info.uses}, fuel: t === 'wooden' ? 10 : 0});
export const ITEMS = I;

/** Anything that can be held: a block (that can be an item) or an item. */
export function itemInfo(name) {
  const b = BY_NAME[name];
  if (b && b.item) return {name, zh: b.zh, block: b, icon: null, stack: 64, fuel: /_(planks|log)$/.test(name) ? 15 : /_slab$/.test(name) && name.startsWith('oak') ? 7.5 : name === 'crafting_table' || name === 'chest' || name === 'bookshelf' || name === 'ladder' ? 15 : /_sapling$/.test(name) ? 5 : name === 'coal_block' ? 800 : 0};
  return I[name] || null;
}
export const ALL_ITEMS = [...B.filter(b => b.item).map(b => b.name), ...Object.keys(I)];
export const zhOf = name => itemInfo(name)?.zh || name;

/** Seconds of block breaking from MC's rules: hardness × 1.5 (or × 5 without the right tool) ÷ the tool's speed. */
export function breakTime(block, tool) {
  if (block.hard < 0) return Infinity;
  if (block.hard === 0) return 0;
  let speed = tool && block.tool === tool.kind ? tool.speed : 1;
  if (tool?.kind === 'sword' && block.name.endsWith('_leaves')) speed = 1.5;
  // Per tick: speed / hardness / (30 if it drops else 100); 20 ticks a second.
  const perTick = speed / block.hard / (harvests(block, tool) ? 30 : 100);
  return perTick > 1 ? 0 : Math.ceil(1 / perTick) / 20;
}
/** Whether breaking `block` with `tool` gives its drop (blocks with a tier need the right tool, that good or better). */
export function harvests(block, tool) { return block.tier < 0 || !!(tool && block.tool === tool.kind && tool.tier >= block.tier); }
/** What breaking a block gives: [[name, count], …]. */
export function dropsOf(block, meta, r = Math.random) {
  let d = block.drop;
  if (typeof d === 'function') d = d(r, meta);
  if (!d) return [];
  if (typeof d === 'string') return [[d, 1]];
  if (Array.isArray(d[0])) return d.filter(x => x[0] && x[1] > 0);
  return d[1] > 0 ? [d] : [];
}
