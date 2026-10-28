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
  // how much an explosion it takes (the game's blast resistance, roughly: stone 6, ores 3, wood 3, dirt 0.5)
  b.blast = o.blast ?? (b.hard < 0 ? 3600000 : b.shape === 'liquid' ? 100 : b.tool === T.PICK && b.hard >= 1.5 ? (name.endsWith('_ore') ? 3 : 6) : b.hard * 1.5);
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
block('obsidian', '黑曜石', {tex: all('obsidian'), hard: 50, tool: T.PICK, tier: 3, blast: 1200});
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
block('furnace', '熔炉', {tex: {top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front', frontOn: 'furnace_front_on'}, hard: 3.5, tool: T.PICK, tier: 0, facing: true, use: 'furnace'});
block('chest', '箱子', {tex: {top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front'}, shape: 'chest', hard: 2.5, tool: T.AXE, facing: true, use: 'chest', opaque: false, filter: 0});
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
block('stone_slab', '石台阶', {tex: all('stone'), shape: 'slab', hard: 2, tool: T.PICK, tier: 0, opaque: false, filter: 0});
block('cobblestone_slab', '圆石台阶', {tex: all('cobblestone'), shape: 'slab', hard: 2, tool: T.PICK, tier: 0, opaque: false, filter: 0});
block('pumpkin', '南瓜', {tex: tbs('pumpkin_top', 'pumpkin_top', 'pumpkin_side'), hard: 1, tool: T.AXE});
block('melon', '西瓜', {tex: tbs('melon_top', 'melon_top', 'melon_side'), hard: 1, tool: T.AXE, drop: r => ['melon_slice', 3 + Math.floor(r() * 5)]});
block('moss_block', '苔藓块', {tex: all('moss_block'), hard: 0.1, tool: T.HOE});
block('mud', '泥巴', {tex: all('mud'), hard: 0.5, tool: T.SHOVEL});
block('lantern', '灯笼', {tex: all('lantern'), shape: 'lantern', pass: 'cutout', hard: 3.5, tool: T.PICK, tier: 0, solid: false, light: 15});
block('blue_ice', '蓝冰', {tex: all('blue_ice'), hard: 2.8, tool: T.PICK, drop: null, slip: 0.989});
// more crops: eight ages, four pictures (ages 0–1, 2–3, 4–6, 7)
const stagesOf = n => [0, 0, 1, 1, 2, 2, 2, 3].map(s => `${n}_stage${s}`);
block('carrots', '胡萝卜', {tex: all('carrots_stage0'), stages: stagesOf('carrots'), shape: 'crop', pass: 'cutout', hard: 0, solid: false, item: false,
  drop: (r, meta) => ['carrot', meta >= 7 ? 2 + Math.floor(r() * 4) : 1]});
block('potatoes', '土豆', {tex: all('potatoes_stage0'), stages: stagesOf('potatoes'), shape: 'crop', pass: 'cutout', hard: 0, solid: false, item: false,
  drop: (r, meta) => ['potato', meta >= 7 ? 2 + Math.floor(r() * 4) : 1]});
// building: stairs (state: facing 0–3, upside down 4), fences and gates (gate: facing, open 4), panes, doors (facing,
// open 4, upper half 8), trapdoors (facing, open 4, at the top 8), beds (facing from foot to head, head 4)
const shaped = {opaque: false, filter: 0};
for (const [n, zh, tex, hard, tool, tier] of [['oak', '橡木', all('oak_planks'), 2, T.AXE, -1], ['spruce', '云杉木', all('spruce_planks'), 2, T.AXE, -1], ['birch', '白桦木', all('birch_planks'), 2, T.AXE, -1],
  ['cobblestone', '圆石', all('cobblestone'), 2, T.PICK, 0], ['stone_brick', '石砖', all('stone_bricks'), 1.5, T.PICK, 0], ['brick', '砖', all('bricks'), 2, T.PICK, 0],
  ['sandstone', '砂岩', tbs('sandstone_top', 'sandstone_bottom', 'sandstone'), 0.8, T.PICK, 0]]) block(`${n}_stairs`, `${zh}楼梯`, {tex, shape: 'stairs', hard, tool, tier, ...shaped});
for (const [w, zh] of [['oak', '橡木'], ['spruce', '云杉木'], ['birch', '白桦木']]) {
  block(`${w}_fence`, `${zh}栅栏`, {tex: all(`${w}_planks`), shape: 'fence', hard: 2, tool: T.AXE, ...shaped});
  block(`${w}_fence_gate`, `${zh}栅栏门`, {tex: all(`${w}_planks`), shape: 'gate', hard: 2, tool: T.AXE, use: 'toggle', ...shaped});
  block(`${w}_door`, `${zh}门`, {tex: {top: `${w}_door_top`, bottom: `${w}_door_bottom`}, shape: 'door', pass: 'cutout', hard: 3, tool: T.AXE, use: 'toggle', ...shaped});
  block(`${w}_trapdoor`, `${zh}活板门`, {tex: all(`${w}_trapdoor`), shape: 'trapdoor', pass: 'cutout', hard: 3, tool: T.AXE, use: 'toggle', ...shaped});
}
block('glass_pane', '玻璃板', {tex: {all: 'glass', edge: 'glass_pane_top'}, shape: 'pane', pass: 'cutout', hard: 0.3, drop: null, ...shaped});
block('iron_bars', '铁栏杆', {tex: all('iron_bars'), shape: 'pane', pass: 'cutout', hard: 5, tool: T.PICK, tier: 0, ...shaped});
for (const [c, zh, h] of COLORS) block(`${c}_bed`, `${zh}床`, {tex: all('white_wool'), shape: 'bed', hard: 0.2, color: h, use: 'bed', ...shaped});
// enchanting and repairing: the table (three quarters high, a little light) and the anvil (facing; it wears from new to
// chipped to damaged, and falls like sand)
block('enchanting_table', '附魔台', {tex: tbs('enchanting_table_top', 'enchanting_table_bottom', 'enchanting_table_side'), shape: 'enchanting', hard: 5, tool: T.PICK, tier: 0, light: 7, use: 'enchant', blast: 1200, ...shaped});
for (const [n, zh] of [['anvil', '铁砧'], ['chipped_anvil', '开裂的铁砧'], ['damaged_anvil', '损坏的铁砧']])
  block(n, zh, {tex: {top: `${n}_top`, bottom: 'anvil', side: 'anvil'}, shape: 'anvil', hard: 5, tool: T.PICK, tier: 0, facing: true, gravity: true, use: 'anvil', blast: 1200, ...shaped});
// the Nether: netherrack, soul sand (you sink in a little and walk slowly), its ores (quartz; gold that drops nuggets),
// magma (burns what stands on it unless it sneaks), the fortresses' nether bricks, nether wart (grows on soul sand,
// four ages), the blaze spawner, and the portal (state 0 standing along x, 1 along z; it cannot be picked up)
block('netherrack', '下界岩', {tex: all('netherrack'), hard: 0.4, tool: T.PICK, tier: 0});
block('soul_sand', '灵魂沙', {tex: all('soul_sand'), hard: 0.5, tool: T.SHOVEL, slow: 0.4});
block('nether_quartz_ore', '下界石英矿石', {tex: all('nether_quartz_ore'), hard: 3, tool: T.PICK, tier: 0, drop: 'quartz', xp: [2, 5]});
block('nether_gold_ore', '下界金矿石', {tex: all('nether_gold_ore'), hard: 3, tool: T.PICK, tier: 0, drop: r => ['gold_nugget', 2 + Math.floor(r() * 5)], xp: [0, 1]});
block('magma_block', '岩浆块', {tex: all('magma'), hard: 0.5, tool: T.PICK, tier: 0, light: 3, hot: true});
block('nether_bricks', '下界砖块', {tex: all('nether_bricks'), hard: 2, tool: T.PICK, tier: 0, blast: 6});
block('nether_brick_fence', '下界砖栅栏', {tex: all('nether_bricks'), shape: 'fence', hard: 2, tool: T.PICK, tier: 0, blast: 6, ...shaped});
block('nether_brick_stairs', '下界砖楼梯', {tex: all('nether_bricks'), shape: 'stairs', hard: 2, tool: T.PICK, tier: 0, blast: 6, ...shaped});
block('nether_wart', '下界疣', {tex: all('nether_wart_stage0'), stages: ['nether_wart_stage0', 'nether_wart_stage1', 'nether_wart_stage1', 'nether_wart_stage2'], shape: 'crop', pass: 'cutout', hard: 0, solid: false, item: false,
  drop: (r, meta) => ['nether_wart', meta >= 3 ? 2 + Math.floor(r() * 3) : 1]});
block('spawner', '刷怪笼', {tex: all('spawner'), pass: 'cutout', hard: 5, tool: T.PICK, tier: 0, drop: null, xp: [15, 43], opaque: false, filter: 0});
block('nether_portal', '下界传送门', {tex: all('nether_portal'), shape: 'portal', pass: 'translucent', hard: -1, blast: 0, solid: false, light: 11, drop: null, item: false, filter: 0});
block('quartz_block', '石英块', {tex: tbs('quartz_block_top', 'quartz_block_bottom', 'quartz_block_side'), hard: 0.8, tool: T.PICK, tier: 0});
// brewing: the stand (a rod with three bottle holders on a stone foot)
block('brewing_stand', '酿造台', {tex: {top: 'brewing_stand', side: 'brewing_stand', base: 'brewing_stand_base'}, shape: 'brewing', pass: 'cutout', hard: 0.5, tool: T.PICK, tier: 0, light: 1, use: 'brew', ...shaped});
// villages: the dirt path (a little lower than a block, like farmland), hay, the bell on its stand, and the trades' work
// blocks — the composter (state: how full, 8 ready), the lectern, the barrel (a chest), and the smoker and blast
// furnace (furnaces twice as fast, for food / for ore and metal)
block('dirt_path', '土径', {tex: tbs('dirt_path_top', 'dirt', 'dirt_path_side'), shape: 'farmland', hard: 0.65, tool: T.SHOVEL, drop: 'dirt', opaque: false, filter: 15});
block('hay_block', '干草块', {tex: tbs('hay_block_top', 'hay_block_top', 'hay_block_side'), hard: 0.5, tool: T.HOE, axis: true});
block('bell', '钟', {tex: {all: 'bell_body', post: 'smooth_stone'}, shape: 'bell', hard: 5, tool: T.PICK, tier: 0, use: 'bell', ...shaped});
block('composter', '堆肥桶', {tex: tbs('composter_top', 'composter_bottom', 'composter_side'), shape: 'composter', hard: 0.6, tool: T.AXE, use: 'compost', ...shaped});
block('lectern', '讲台', {tex: {top: 'lectern_top', bottom: 'oak_planks', side: 'lectern_sides', front: 'lectern_front', base: 'lectern_base'}, shape: 'lectern', hard: 2.5, tool: T.AXE, facing: true, ...shaped});
block('barrel', '木桶', {tex: tbs('barrel_top', 'barrel_bottom', 'barrel_side'), hard: 2.5, tool: T.AXE, use: 'barrel'});
block('loom', '织布机', {tex: {top: 'loom_top', bottom: 'loom_bottom', side: 'loom_side', front: 'loom_front'}, hard: 2.5, tool: T.AXE, facing: true});
block('fletching_table', '制箭台', {tex: {top: 'fletching_table_top', bottom: 'birch_planks', side: 'fletching_table_side', front: 'fletching_table_front'}, hard: 2.5, tool: T.AXE, facing: true});
block('smithing_table', '锻造台', {tex: {top: 'smithing_table_top', bottom: 'smithing_table_bottom', side: 'smithing_table_side', front: 'smithing_table_front'}, hard: 2.5, tool: T.AXE, facing: true});
block('smoker', '烟熏炉', {tex: {top: 'smoker_top', bottom: 'smoker_bottom', side: 'smoker_side', front: 'smoker_front', frontOn: 'smoker_front_on'}, hard: 3.5, tool: T.PICK, tier: 0, facing: true, use: 'furnace', cook: 'food'});
block('blast_furnace', '高炉', {tex: {top: 'blast_furnace_top', bottom: 'blast_furnace_top', side: 'blast_furnace_side', front: 'blast_furnace_front', frontOn: 'blast_furnace_front_on'}, hard: 3.5, tool: T.PICK, tier: 0, facing: true, use: 'furnace', cook: 'ore'});
// forests: vines (state: a bit for each side it clings to, 1 << the direction in shapes.js DIR — 1 south, 2 west,
// 4 north, 8 east; you climb them, they grow down; only shears take them), cocoa on jungle logs (facing the log 0–3,
// age · 4: 0–2), and the plants two blocks tall (the upper half 8; the item is the whole plant)
block('vine', '藤蔓', {tex: all('vine'), shape: 'vine', pass: 'cutout', hard: 0.2, tool: T.AXE, solid: false, replace: true, climb: true, tint: 'foliage', drop: null});
block('cocoa', '可可果', {tex: all('cocoa_stage2'), stages: ['cocoa_stage0', 'cocoa_stage1', 'cocoa_stage2'], shape: 'cocoa', pass: 'cutout', hard: 0.2, tool: T.AXE, solid: false, item: false,
  drop: (r, meta) => ['cocoa_beans', meta >> 2 >= 2 ? 3 : 1]});
const tall = (name, zh, o = {}) => block(name, zh, {tex: {all: `${name}_top`, top: `${name}_top`, bottom: `${name}_bottom`}, shape: 'tall', pass: 'cutout', hard: 0, solid: false, ...o});
tall('tall_grass', '高草丛', {tint: 'grass', replace: true, drop: (r, meta) => !(meta & 8) && r() < 0.125 ? 'wheat_seeds' : null});
tall('large_fern', '大型蕨', {tint: 'grass', replace: true, drop: (r, meta) => !(meta & 8) && r() < 0.125 ? 'wheat_seeds' : null});
tall('sunflower', '向日葵', {tex: {all: 'sunflower_front', top: 'sunflower_top', bottom: 'sunflower_bottom', front: 'sunflower_front', back: 'sunflower_back'}});
for (const [n, zh] of [['lilac', '丁香'], ['rose_bush', '玫瑰丛'], ['peony', '牡丹']]) tall(n, zh);

// ---------- more of the game's blocks (0.8.71; only ever added at the end) ----------
// cat: the creative inventory's tab (invui.js) for those its names do not place
// colours: carpets (a sixteenth thick, on anything), concrete and its powder (falls like sand; touching water it sets:
// world.js), terracotta in the sixteen colours and glazed (a pattern of its own each), stained glass and its panes
for (const [c, zh] of COLORS) block(`${c}_carpet`, `${zh}地毯`, {tex: all(`${c}_wool`), shape: 'carpet', hard: 0.1, opaque: false, filter: 0, cat: 'color'});
for (const [c, zh] of COLORS) block(`${c}_concrete`, `${zh}混凝土`, {tex: all(`${c}_concrete`), hard: 1.8, tool: T.PICK, tier: 0, cat: 'color'});
for (const [c, zh] of COLORS) block(`${c}_concrete_powder`, `${zh}混凝土粉末`, {tex: all(`${c}_concrete_powder`), hard: 0.5, tool: T.SHOVEL, gravity: true, sets: `${c}_concrete`, cat: 'color'});
for (const [c, zh] of COLORS) block(`${c}_terracotta`, `${zh}陶瓦`, {tex: all(`${c}_terracotta`), hard: 1.25, tool: T.PICK, tier: 0, cat: 'color'});
for (const [c, zh] of COLORS) block(`${c}_glazed_terracotta`, `${zh}带釉陶瓦`, {tex: all(`${c}_glazed_terracotta`), hard: 1.4, tool: T.PICK, tier: 0, cat: 'color'});
for (const [c, zh] of COLORS) block(`${c}_stained_glass`, `${zh}染色玻璃`, {tex: all(`${c}_stained_glass`), pass: 'translucent', hard: 0.3, drop: null, filter: 0, cat: 'color'});
for (const [c, zh] of COLORS) block(`${c}_stained_glass_pane`, `${zh}染色玻璃板`, {tex: {all: `${c}_stained_glass`, edge: `${c}_stained_glass_pane_top`}, shape: 'pane', pass: 'translucent', hard: 0.3, drop: null, ...shaped, cat: 'color'});
// wood: the bark block, logs and wood with the bark taken off (an axe's use), and every kind's slab; the shaped wood of
// the kinds that had none
for (const [w, zh] of WOODS) {
  block(`${w}_wood`, zh, {tex: all(`${w}_log`), hard: 2, tool: T.AXE, axis: true, cat: 'build'});
  block(`stripped_${w}_log`, `去皮${zh}原木`, {tex: tbs(`stripped_${w}_log_top`, `stripped_${w}_log_top`, `stripped_${w}_log`), hard: 2, tool: T.AXE, axis: true, cat: 'build'});
  block(`stripped_${w}_wood`, `去皮${zh}`, {tex: all(`stripped_${w}_log`), hard: 2, tool: T.AXE, axis: true, cat: 'build'});
  if (w !== 'oak') block(`${w}_slab`, `${zh}台阶`, {tex: all(`${w}_planks`), shape: 'slab', hard: 2, tool: T.AXE, opaque: false, filter: 0});
}
for (const [w, zh] of WOODS.filter(([w]) => !['oak', 'spruce', 'birch'].includes(w))) {
  block(`${w}_stairs`, `${zh}楼梯`, {tex: all(`${w}_planks`), shape: 'stairs', hard: 2, tool: T.AXE, ...shaped});
  block(`${w}_fence`, `${zh}栅栏`, {tex: all(`${w}_planks`), shape: 'fence', hard: 2, tool: T.AXE, ...shaped});
  block(`${w}_fence_gate`, `${zh}栅栏门`, {tex: all(`${w}_planks`), shape: 'gate', hard: 2, tool: T.AXE, use: 'toggle', ...shaped});
  block(`${w}_door`, `${zh}门`, {tex: {top: `${w}_door_top`, bottom: `${w}_door_bottom`}, shape: 'door', pass: 'cutout', hard: 3, tool: T.AXE, use: 'toggle', ...shaped});
  block(`${w}_trapdoor`, `${zh}活板门`, {tex: all(`${w}_trapdoor`), shape: 'trapdoor', pass: 'cutout', hard: 3, tool: T.AXE, use: 'toggle', ...shaped});
}
// stone: polished, mossy, cracked and chiseled kinds, and the stairs, slabs and walls of each family (a wall: a post
// and arms to what it meets, 1.5 high to walk into)
const stoneBlock = (name, zh, tex, hard = 1.5, o = {}) => block(name, zh, {tex: typeof tex === 'string' ? all(tex) : tex, hard, tool: T.PICK, tier: 0, cat: 'build', ...o});
const family = (base, zh, tex, {hard = 1.5, stairs = true, slab = true, wall = false} = {}) => {
  const t = typeof tex === 'string' ? all(tex) : tex, o = {tex: t, hard, tool: T.PICK, tier: 0, cat: 'build'};
  if (stairs) block(`${base}_stairs`, `${zh}楼梯`, {...o, shape: 'stairs', ...shaped});
  if (slab) block(`${base}_slab`, `${zh}台阶`, {...o, shape: 'slab', opaque: false, filter: 0});
  if (wall) block(`${base}_wall`, `${zh}墙`, {...o, shape: 'stonewall', ...shaped});
};
family('stone', '石', 'stone', {slab: false});
block('smooth_stone_slab', '平滑石台阶', {tex: tbs('smooth_stone', 'smooth_stone', 'smooth_stone_slab_side'), shape: 'slab', hard: 2, tool: T.PICK, tier: 0, opaque: false, filter: 0, cat: 'build'});
family('cobblestone', '圆石', 'cobblestone', {hard: 2, stairs: false, slab: false, wall: true});
family('mossy_cobblestone', '苔石', 'mossy_cobblestone', {hard: 2, wall: true});
family('stone_brick', '石砖', 'stone_bricks', {stairs: false, wall: true});
stoneBlock('mossy_stone_bricks', '苔石砖', 'mossy_stone_bricks');
stoneBlock('cracked_stone_bricks', '裂纹石砖', 'cracked_stone_bricks');
stoneBlock('chiseled_stone_bricks', '錾制石砖', 'chiseled_stone_bricks');
family('mossy_stone_brick', '苔石砖', 'mossy_stone_bricks', {wall: true});
for (const [n, zh] of [['granite', '花岗岩'], ['diorite', '闪长岩'], ['andesite', '安山岩']]) {
  stoneBlock(`polished_${n}`, `磨制${zh}`, `polished_${n}`);
  family(n, zh, n, {wall: true});
  family(`polished_${n}`, `磨制${zh}`, `polished_${n}`);
}
family('cobbled_deepslate', '深板岩圆石', 'cobbled_deepslate', {hard: 3.5, wall: true});
stoneBlock('polished_deepslate', '磨制深板岩', 'polished_deepslate', 3.5);
family('polished_deepslate', '磨制深板岩', 'polished_deepslate', {hard: 3.5, wall: true});
stoneBlock('deepslate_bricks', '深板岩砖', 'deepslate_bricks', 3.5);
family('deepslate_brick', '深板岩砖', 'deepslate_bricks', {hard: 3.5, wall: true});
stoneBlock('cracked_deepslate_bricks', '裂纹深板岩砖', 'cracked_deepslate_bricks', 3.5);
stoneBlock('deepslate_tiles', '深板岩瓦', 'deepslate_tiles', 3.5);
family('deepslate_tile', '深板岩瓦', 'deepslate_tiles', {hard: 3.5, wall: true});
stoneBlock('cracked_deepslate_tiles', '裂纹深板岩瓦', 'cracked_deepslate_tiles', 3.5);
stoneBlock('chiseled_deepslate', '錾制深板岩', 'chiseled_deepslate', 3.5);
family('tuff', '凝灰岩', 'tuff', {wall: true});
stoneBlock('polished_tuff', '磨制凝灰岩', 'polished_tuff');
family('polished_tuff', '磨制凝灰岩', 'polished_tuff', {wall: true});
stoneBlock('tuff_bricks', '凝灰岩砖', 'tuff_bricks');
family('tuff_brick', '凝灰岩砖', 'tuff_bricks', {wall: true});
stoneBlock('chiseled_tuff', '錾制凝灰岩', tbs('chiseled_tuff_top', 'chiseled_tuff_top', 'chiseled_tuff'));
stoneBlock('chiseled_tuff_bricks', '錾制凝灰岩砖', tbs('chiseled_tuff_bricks_top', 'chiseled_tuff_bricks_top', 'chiseled_tuff_bricks'));
for (const [n, zh] of [['sandstone', '砂岩'], ['red_sandstone', '红砂岩']]) {
  const t = tbs(`${n}_top`, `${n}_bottom`, n);
  family(n, zh, t, {hard: 0.8, stairs: n !== 'sandstone', wall: true});
  stoneBlock(`cut_${n}`, `切制${zh}`, tbs(`${n}_top`, `${n}_top`, `cut_${n}`), 0.8);
  family(`cut_${n}`, `切制${zh}`, tbs(`${n}_top`, `${n}_top`, `cut_${n}`), {hard: 0.8, stairs: false});
  stoneBlock(`chiseled_${n}`, `錾制${zh}`, tbs(`${n}_top`, `${n}_top`, `chiseled_${n}`), 0.8);
  stoneBlock(`smooth_${n}`, `平滑${zh}`, `${n}_top`, 2);
  family(`smooth_${n}`, `平滑${zh}`, `${n}_top`, {hard: 2});
}
family('brick', '红砖', 'bricks', {hard: 2, stairs: false, wall: true});
family('quartz', '石英', tbs('quartz_block_top', 'quartz_block_bottom', 'quartz_block_side'), {hard: 0.8});
stoneBlock('chiseled_quartz_block', '錾制石英块', tbs('chiseled_quartz_block_top', 'chiseled_quartz_block_top', 'chiseled_quartz_block'), 0.8);
stoneBlock('quartz_pillar', '石英柱', tbs('quartz_pillar_top', 'quartz_pillar_top', 'quartz_pillar'), 0.8, {axis: true});
stoneBlock('quartz_bricks', '石英砖', 'quartz_bricks', 0.8);
stoneBlock('smooth_quartz', '平滑石英块', 'quartz_block_bottom', 2);
family('smooth_quartz', '平滑石英', 'quartz_block_bottom', {hard: 2});
block('packed_mud', '泥坯', {tex: all('packed_mud'), hard: 1, tool: T.PICK, cat: 'build'});
stoneBlock('mud_bricks', '泥砖', 'mud_bricks');
family('mud_brick', '泥砖', 'mud_bricks', {wall: true});
family('nether_brick', '下界砖', 'nether_bricks', {hard: 2, stairs: false, wall: true});
stoneBlock('red_nether_bricks', '红色下界砖块', 'red_nether_bricks', 2);
family('red_nether_brick', '红色下界砖', 'red_nether_bricks', {hard: 2, wall: true});
stoneBlock('cracked_nether_bricks', '裂纹下界砖块', 'cracked_nether_bricks', 2);
stoneBlock('chiseled_nether_bricks', '錾制下界砖块', 'chiseled_nether_bricks', 2);
// the raw metals' blocks (nine raw pieces each)
for (const [m, zh, tier] of [['iron', '粗铁块', 1], ['copper', '粗铜块', 1], ['gold', '粗金块', 2]]) block(`raw_${m}_block`, zh, {tex: all(`raw_${m}_block`), hard: 5, tool: T.PICK, tier, cat: 'build'});
// flowers: the four tulips (plains and flower forests)
for (const [t, zh] of [['red', '红色'], ['orange', '橙色'], ['white', '白色'], ['pink', '粉红色']]) plant(`${t}_tulip`, `${zh}郁金香`);
// beetroots: a crop of four looks (seeds from village farms, and from grass now and then)
block('beetroots', '甜菜根', {tex: all('beetroots_stage0'), stages: [0, 0, 1, 1, 2, 2, 2, 3].map(s => `beetroots_stage${s}`), shape: 'crop', pass: 'cutout', hard: 0, solid: false, item: false,
  drop: (r, meta) => meta >= 7 ? [['beetroot', 1], ['beetroot_seeds', 1 + Math.floor(r() * 3)]] : ['beetroot_seeds', 1]});

// ---------- redstone ----------
// Dust (state: its power 0–15; which way it runs comes from its neighbours when it is drawn); torches, lit and unlit (state
// as a torch's: 0 standing, 1–4 leaning from a wall east, west, south, north of it); levers and buttons (state: 0/1 on a
// floor, 2/3 under a ceiling — lying along z / x — 4–7 on a wall, facing south, west, north, east; 8 when on); pressure
// plates (state: the power they give); repeaters (state: the way the signal goes 0–3, as a facing, and the delay less one
// in 4|8) and comparators (facing, 4 subtracting), each with a powered block; lamps (an off and a lit block); pistons
// and their heads (state: the way the head points, as FACES 0–5; 8 extended / a sticky head); observers (the side they
// watch; 8 while giving their pulse), dispensers and droppers (the side they fire from; 8 just fired), hoppers (FACES 3
// down or a side they put into; 8 locked by power), note blocks, daylight detectors (power; and an inverted one), iron
// doors and trapdoors (opened by power only), targets (power), slime blocks, rails (state: their shape, the game's 0–9;
// the special ones 0–5 and 8 when on). How they work: redstone.js, in the world worker.
const RS = {...shaped, solid: false, cat: 'redstone'};
block('redstone_wire', '红石线', {tex: {all: 'redstone_dust_dot', line0: 'redstone_dust_line0', line1: 'redstone_dust_line1'}, shape: 'wire', pass: 'cutout', hard: 0, ...RS, drop: 'redstone', item: false, rs: 'wire'});
block('redstone_torch', '红石火把', {tex: all('redstone_torch'), shape: 'torch', pass: 'cutout', hard: 0, ...RS, light: 7, rs: 'torch'});
block('redstone_torch_off', '红石火把', {tex: all('redstone_torch_off'), shape: 'torch', pass: 'cutout', hard: 0, ...RS, item: false, drop: 'redstone_torch', rs: 'torch'});
block('lever', '拉杆', {tex: {all: 'cobblestone', handle: 'lever'}, shape: 'lever', pass: 'cutout', hard: 0.5, ...RS, rs: 'lever', use: 'lever', itemIcon: 'lever'});
block('stone_button', '石头按钮', {tex: all('stone'), shape: 'button', hard: 0.5, ...RS, rs: 'button', use: 'button', press: 20});
for (const [w, zh] of WOODS) block(`${w}_button`, `${zh}按钮`, {tex: all(`${w}_planks`), shape: 'button', hard: 0.5, tool: T.AXE, ...RS, rs: 'button', use: 'button', press: 30, wood: true});
block('stone_pressure_plate', '石质压力板', {tex: all('stone'), shape: 'plate', hard: 0.5, tool: T.PICK, tier: 0, ...RS, rs: 'plate', mobsOnly: true});
for (const [w, zh] of WOODS) block(`${w}_pressure_plate`, `${zh}压力板`, {tex: all(`${w}_planks`), shape: 'plate', hard: 0.5, tool: T.AXE, ...RS, rs: 'plate'});
block('light_weighted_pressure_plate', '轻质测重压力板', {tex: all('gold_block'), shape: 'plate', hard: 0.5, tool: T.PICK, tier: 0, ...RS, rs: 'plate', weight: 1});
block('heavy_weighted_pressure_plate', '重质测重压力板', {tex: all('iron_block'), shape: 'plate', hard: 0.5, tool: T.PICK, tier: 0, ...RS, rs: 'plate', weight: 10});
for (const [n, zh, top, torch, extra] of [['repeater', '红石中继器', 'repeater', 'redstone_torch_off', {}], ['repeater_on', '红石中继器', 'repeater_on', 'redstone_torch', {item: false, drop: 'repeater', on: true}],
  ['comparator', '红石比较器', 'comparator', 'redstone_torch_off', {}], ['comparator_on', '红石比较器', 'comparator_on', 'redstone_torch', {item: false, drop: 'comparator', on: true}]]) {
  const kind = n.replace('_on', '');
  block(n, zh, {tex: {top, side: 'smooth_stone', bottom: 'smooth_stone', torch}, shape: kind, pass: 'cutout', hard: 0, ...shaped, cat: 'redstone', rs: kind, use: kind, itemIcon: `${kind}_item`, ...extra});
}
block('redstone_lamp', '红石灯', {tex: all('redstone_lamp'), hard: 0.3, rs: 'lamp', cat: 'redstone'});
block('redstone_lamp_on', '红石灯', {tex: all('redstone_lamp_on'), hard: 0.3, light: 15, item: false, drop: 'redstone_lamp', rs: 'lamp'});
for (const [n, zh, top, sticky] of [['piston', '活塞', 'piston_top', false], ['sticky_piston', '粘性活塞', 'piston_top_sticky', true]])
  block(n, zh, {tex: {top, side: 'piston_side', bottom: 'piston_bottom', inner: 'piston_inner'}, shape: 'piston', hard: 1.5, tool: T.PICK, opaque: false, filter: 15, rs: 'piston', sticky, facing6: true, cat: 'redstone'});
block('piston_head', '活塞臂', {tex: {top: 'piston_top', sticky: 'piston_top_sticky', side: 'piston_side'}, shape: 'piston_head', hard: 1.5, tool: T.PICK, opaque: false, filter: 0, item: false, drop: null, rs: 'head'});
block('observer', '侦测器', {tex: {front: 'observer_front', back: 'observer_back', backOn: 'observer_back_on', side: 'observer_side', top: 'observer_top'}, hard: 3, tool: T.PICK, tier: 0, rs: 'observer', facing6: true, cat: 'redstone'});
for (const [n, zh] of [['dispenser', '发射器'], ['dropper', '投掷器']])
  block(n, zh, {tex: {front: `${n}_front`, frontV: `${n}_front_vertical`, side: 'furnace_side', top: 'furnace_top'}, hard: 3.5, tool: T.PICK, tier: 0, rs: n, facing6: true, use: 'dispenser', cat: 'redstone'});
block('hopper', '漏斗', {tex: {all: 'hopper_outside', inside: 'hopper_inside', top: 'hopper_top'}, shape: 'hopper', hard: 3, tool: T.PICK, tier: 0, ...shaped, rs: 'hopper', use: 'hopper', itemIcon: 'hopper', cat: 'redstone'});
block('note_block', '音符盒', {tex: all('note_block'), hard: 0.8, tool: T.AXE, rs: 'note', use: 'note', cat: 'redstone'});
for (const [n, top, extra] of [['daylight_detector', 'daylight_detector_top', {}], ['daylight_detector_inverted', 'daylight_detector_inverted_top', {item: false, drop: 'daylight_detector'}]])
  block(n, '阳光探测器', {tex: {top, side: 'daylight_detector_side', bottom: 'daylight_detector_side'}, shape: 'detector', hard: 0.2, tool: T.AXE, ...shaped, rs: 'detector', use: 'invert', inverted: n.endsWith('inverted'), cat: 'redstone', ...extra});
block('iron_door', '铁门', {tex: {top: 'iron_door_top', bottom: 'iron_door_bottom'}, shape: 'door', pass: 'cutout', hard: 5, tool: T.PICK, tier: 0, ...shaped, iron: true, itemIcon: 'iron_door', cat: 'redstone'});
block('iron_trapdoor', '铁活板门', {tex: all('iron_trapdoor'), shape: 'trapdoor', pass: 'cutout', hard: 5, tool: T.PICK, tier: 0, ...shaped, iron: true, cat: 'redstone'});
block('target', '标靶', {tex: tbs('target_top', 'target_top', 'target_side'), hard: 0.5, tool: T.HOE, rs: 'target', cat: 'redstone'});
block('slime_block', '黏液块', {tex: all('slime_block'), pass: 'translucent', hard: 0, opaque: false, filter: 1, slime: true, slip: 0.8, cat: 'redstone'});
for (const [n, zh, kind] of [['rail', '铁轨', 'rail'], ['powered_rail', '动力铁轨', 'powered'], ['detector_rail', '探测铁轨', 'detector'], ['activator_rail', '激活铁轨', 'activator']])
  block(n, zh, {tex: kind === 'rail' ? {all: 'rail', corner: 'rail_corner'} : {all: n, on: `${n}_on`}, shape: 'rail', pass: 'cutout', hard: 0.7, tool: T.PICK, ...RS, rs: 'rail', rail: kind});
// the redstone ones from before: the block of redstone gives power, TNT and the bell answer it
for (const b of B) { if (b.name === 'redstone_block') Object.assign(b, {rs: 'block', cat: 'redstone'}); if (b.name === 'tnt') b.rs = 'tnt'; if (b.name === 'bell') b.rs = 'bell'; }

export const BLOCKS = B;
export const BY_NAME = Object.fromEntries(B.map(b => [b.name, b]));
// experience from ores mined with the right tool (the game's ranges)
for (const [o, xp] of [['coal', [0, 2]], ['diamond', [3, 7]], ['emerald', [3, 7]], ['lapis', [2, 5]], ['redstone', [1, 5]]]) for (const n of [`${o}_ore`, `deepslate_${o}_ore`]) BY_NAME[n].xp = xp;
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
item('glowstone_dust', '荧石粉'); item('book', '书', {enchantability: 1}); item('snowball', '雪球', {stack: 16, thrown: true}); item('clay_ball', '黏土球'); item('brick', '红砖');
item('apple', '苹果', {food: 4, sat: 2.4}); item('wheat_seeds', '小麦种子', {plant: 'wheat'}); item('wheat', '小麦'); item('bread', '面包', {food: 5, sat: 6});
item('melon_slice', '西瓜片', {food: 2, sat: 1.2}); item('bucket', '桶', {stack: 16}); item('water_bucket', '水桶', {stack: 1, pour: 'water'}); item('lava_bucket', '岩浆桶', {stack: 1, pour: 'lava', fuel: 1000});
item('bowl', '碗', {fuel: 5});
// from animals and monsters
for (const [raw, cooked, zh, f, s, cf, cs] of [['porkchop', 'cooked_porkchop', '猪排', 3, 1.8, 8, 12.8], ['beef', 'cooked_beef', '牛肉', 3, 1.8, 8, 12.8], ['mutton', 'cooked_mutton', '羊肉', 2, 1.2, 6, 9.6], ['chicken', 'cooked_chicken', '鸡肉', 2, 1.2, 6, 7.2]]) {
  item(raw, `生${zh}`, {food: f, sat: s}); item(cooked, `熟${zh}`, {food: cf, sat: cs});
}
item('carrot', '胡萝卜', {food: 3, sat: 3.6, plant: 'carrots'}); item('potato', '马铃薯', {food: 1, sat: 0.6, plant: 'potatoes'}); item('baked_potato', '烤马铃薯', {food: 5, sat: 6});
item('rotten_flesh', '腐肉', {food: 4, sat: 0.8}); item('spider_eye', '蜘蛛眼', {food: 2, sat: 3.2});
item('leather', '皮革'); item('feather', '羽毛'); item('bone', '骨头'); item('bone_meal', '骨粉', {meal: true}); item('string', '线'); item('gunpowder', '火药'); item('paper', '纸');
item('arrow', '箭'); item('bow', '弓', {stack: 1, tool: {kind: 'bow', tier: -1, speed: 1, uses: 384}, fuel: 15, enchantability: 1});
item('fishing_rod', '钓鱼竿', {stack: 1, tool: {kind: 'rod', tier: -1, speed: 1, uses: 64}, fuel: 15, enchantability: 1});
item('enchanted_book', '附魔书', {stack: 1});
for (const [raw, cooked, zh, f, s, cf, cs] of [['cod', 'cooked_cod', '鳕鱼', 2, 0.4, 5, 6], ['salmon', 'cooked_salmon', '鲑鱼', 2, 0.4, 6, 9.6]]) { item(raw, `生${zh}`, {food: f, sat: s}); item(cooked, `熟${zh}`, {food: cf, sat: cs}); }
item('tropical_fish', '热带鱼', {food: 1, sat: 0.2}); item('pufferfish', '河豚', {food: 1, sat: 0.2});
item('shears', '剪刀', {stack: 1, tool: {kind: 'shears', tier: -1, speed: 1, uses: 238}});
item('flint_and_steel', '打火石', {stack: 1, tool: {kind: 'fire', tier: -1, speed: 1, uses: 64}});
// from the Nether, and for brewing (a potion is {id: 'potion' | 'splash_potion', pot: …}: brew.js)
item('quartz', '下界石英'); item('gold_nugget', '金粒'); item('nether_brick', '下界砖'); item('nether_wart', '下界疣', {plant: 'nether_wart'});
item('blaze_rod', '烈焰棒', {fuel: 120}); item('blaze_powder', '烈焰粉'); item('ghast_tear', '恶魂之泪'); item('magma_cream', '岩浆膏');
item('glass_bottle', '玻璃瓶'); item('potion', '药水', {stack: 1, drink: true}); item('splash_potion', '喷溅药水', {stack: 1, thrown: true});
item('fermented_spider_eye', '发酵蛛眼'); item('sugar', '糖'); item('golden_carrot', '金胡萝卜', {food: 6, sat: 14.4}); item('glistering_melon_slice', '闪烁的西瓜片');
item('fire_charge', '火焰弹');
// from the jungle: cocoa beans (put on the side of a jungle log they grow there), and cookies made with them
item('cocoa_beans', '可可豆'); item('cookie', '曲奇', {food: 2, sat: 0.4});
// dyes: from flowers and the rest (inventory.js), they colour wool, terracotta, glass, concrete
for (const [c, zh] of COLORS) item(`${c}_dye`, `${zh}染料`, {dye: c});
item('ink_sac', '墨囊');
// more food: golden apples (and their effects: main.js), pumpkin pie, stews and soups (the bowl comes back),
// beetroots, eggs (thrown: now and then a chick), milk (it takes every effect away)
item('golden_apple', '金苹果', {food: 4, sat: 9.6, always: true, effects: [['regeneration', 1, 5], ['absorption', 0, 120]]});
item('enchanted_golden_apple', '附魔金苹果', {food: 4, sat: 9.6, always: true, glint: true, effects: [['regeneration', 1, 20], ['absorption', 3, 120], ['resistance', 0, 300], ['fire_resistance', 0, 300]]});
item('pumpkin_pie', '南瓜派', {food: 8, sat: 4.8});
item('mushroom_stew', '蘑菇煲', {food: 6, sat: 7.2, stack: 1, bowl: true});
item('beetroot', '甜菜根', {food: 1, sat: 1.2}); item('beetroot_seeds', '甜菜种子', {plant: 'beetroots'}); item('beetroot_soup', '甜菜汤', {food: 6, sat: 7.2, stack: 1, bowl: true});
item('egg', '鸡蛋', {stack: 16, thrown: true});
item('milk_bucket', '奶桶', {stack: 1, drink: true});
item('experience_bottle', '附魔之瓶', {thrown: true, glint: true});
// spawn eggs: each of the world's creatures, let out where it is used
for (const [k, zh] of [['pig', '猪'], ['cow', '牛'], ['sheep', '羊'], ['chicken', '鸡'], ['zombie', '僵尸'], ['skeleton', '骷髅'], ['creeper', '苦力怕'], ['spider', '蜘蛛'],
  ['zombified_piglin', '僵尸猪灵'], ['ghast', '恶魂'], ['blaze', '烈焰人'], ['villager', '村民'], ['iron_golem', '铁傀儡'], ['magma_cube', '岩浆怪'], ['slime', '史莱姆']]) item(`${k}_spawn_egg`, `${zh}刷怪蛋`, {spawn: k});

export const TIERS = {wooden: {zh: '木', tier: 0, speed: 2, uses: 59, enchantability: 15}, stone: {zh: '石', tier: 1, speed: 4, uses: 131, enchantability: 5}, iron: {zh: '铁', tier: 2, speed: 6, uses: 250, enchantability: 14},
  golden: {zh: '金', tier: 0, speed: 12, uses: 32, enchantability: 22}, diamond: {zh: '钻石', tier: 3, speed: 8, uses: 1561, enchantability: 10}};
const KINDS = {pickaxe: '镐', axe: '斧', shovel: '锹', sword: '剑', hoe: '锄'};
// the game's attack damage of each tool (hearts × 2)
const DAMAGE = {sword: [4, 5, 6, 4, 7], axe: [7, 9, 9, 7, 9], pickaxe: [2, 3, 4, 2, 5], shovel: [2.5, 3.5, 4.5, 2.5, 5.5], hoe: [1, 1, 1, 1, 1]};
Object.keys(TIERS).forEach((t, ti) => { for (const [k, zh] of Object.entries(KINDS))
  item(`${t}_${k}`, `${TIERS[t].zh}${zh}`, {stack: 1, tool: {kind: k, tier: TIERS[t].tier, speed: TIERS[t].speed, uses: TIERS[t].uses}, damage: DAMAGE[k][ti], fuel: t === 'wooden' ? 10 : 0, enchantability: TIERS[t].enchantability, repair: {wooden: '#planks', stone: '#stone_tool', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond'}[t]}); });
// armour: worn in a slot (0 head, 1 chest, 2 legs, 3 feet); its points, toughness and uses are the game's (uses: the
// material's base × 11, 16, 15, 13). Leather from a pack is grey and dyed, its default colour is the tint.
export const ARMOR = {leather: {zh: '皮革', base: 5, points: [1, 3, 2, 1], tough: 0, enchantability: 15, repair: 'leather'}, chainmail: {zh: '锁链', base: 15, points: [2, 5, 4, 1], tough: 0, enchantability: 12, repair: 'iron_ingot'},
  iron: {zh: '铁', base: 15, points: [2, 6, 5, 2], tough: 0, enchantability: 9, repair: 'iron_ingot'},
  golden: {zh: '金', base: 7, points: [2, 5, 3, 1], tough: 0, enchantability: 25, repair: 'gold_ingot'}, diamond: {zh: '钻石', base: 33, points: [3, 8, 6, 3], tough: 2, enchantability: 10, repair: 'diamond'}};
export const ARMOR_PIECES = [['helmet', '头盔', 11, '帽子'], ['chestplate', '胸甲', 16, '外套'], ['leggings', '护腿', 15, '裤子'], ['boots', '靴子', 13, '靴子']];
for (const [mat, a] of Object.entries(ARMOR)) ARMOR_PIECES.forEach(([piece, zh, k, leather], slot) =>
  item(`${mat}_${piece}`, `${a.zh}${mat === 'leather' ? leather : zh}`, {stack: 1, armor: {slot, mat, points: a.points[slot], tough: a.tough, uses: a.base * k}, enchantability: a.enchantability, repair: a.repair, ...(mat === 'leather' ? {tint: '#a06540'} : {})}));
/** What a hit of `dmg` does through armour of `points` and `tough` (the game's formula). */
export function throughArmor(dmg, points, tough = 0) {
  if (!points) return dmg;
  const kept = Math.min(20, Math.max(points * 0.2, points - dmg / (2 + tough / 4)));
  return dmg * (1 - kept / 25);
}
/** Experience to go from `level` to the next (the game's numbers). */
export const xpToNext = level => level >= 30 ? 112 + (level - 30) * 9 : level >= 15 ? 37 + (level - 15) * 5 : 7 + level * 2;
/** {level, prog (0–1 of the bar), total} after gaining n points, the way the game fills the bar. */
export function addXp(x, n) {
  const o = {...x, total: x.total + n, prog: x.prog + n / xpToNext(x.level)};
  while (o.prog >= 1) { o.prog = (o.prog - 1) * xpToNext(o.level); o.level++; o.prog /= xpToNext(o.level); }
  return o;
}
/** How hard a hit with this (an item name, or nothing) is. */
export const damageOf = name => (name && I[name]?.damage) || 1;
// redstone: dust is put down from the item; slime balls (from slimes) for sticky pistons and slime blocks; minecarts
item('slime_ball', '黏液球');
for (const [n, zh] of [['minecart', '矿车'], ['chest_minecart', '运输矿车'], ['furnace_minecart', '动力矿车'], ['tnt_minecart', 'TNT 矿车'], ['hopper_minecart', '漏斗矿车']])
  item(n, zh, {stack: 1, cart: n, cat: 'redstone'});
I.redstone.place = 'redstone_wire';

export const ITEMS = I;

/** Anything that can be held: a block (that can be an item) or an item. */
export function itemInfo(name) {
  const b = BY_NAME[name];
  if (b && b.item) {
    const wood = /^(oak|spruce|birch|jungle|acacia|dark_oak)_(fence|fence_gate|trapdoor|stairs)$|^(stripped_)?(oak|spruce|birch|jungle|acacia|dark_oak)_wood$|^stripped_.*_log$/.test(name), door = /^(oak|spruce|birch|jungle|acacia|dark_oak)_door$/.test(name);
    return {name, zh: b.zh, block: b, icon: null, cat: b.cat, stack: door || b.shape === 'bed' ? (b.shape === 'bed' ? 1 : 64) : 64,
      fuel: /_(planks|log)$/.test(name) || wood ? 15 : door ? 10 : /^(oak|spruce|birch|jungle|acacia|dark_oak)_slab$/.test(name) ? 7.5 : name === 'crafting_table' || name === 'chest' || name === 'bookshelf' || name === 'ladder' ? 15 : /_sapling$/.test(name) ? 5 : name === 'coal_block' ? 800 : 0};
  }
  return I[name] || null;
}
export const ALL_ITEMS = [...B.filter(b => b.item).map(b => b.name), ...Object.keys(I)];
export const zhOf = name => itemInfo(name)?.zh || name;

/**
 * Seconds of block breaking from MC's rules: hardness × 1.5 (or × 5 without the right tool) ÷ the tool's speed.
 * efficiency: the enchantment's level (adds level² + 1 to a tool that is right for the block); mult: under water or
 * not standing on anything the game digs five times slower (0.2).
 */
export function breakTime(block, tool, {efficiency = 0, mult = 1} = {}) {
  if (block.hard < 0) return Infinity;
  if (block.hard === 0) return 0;
  let speed = tool && block.tool === tool.kind ? tool.speed : 1;
  if (tool?.kind === 'sword' && block.name.endsWith('_leaves')) speed = 1.5;
  if (tool?.kind === 'shears') speed = block.name.endsWith('_leaves') ? 15 : block.name.endsWith('_wool') ? 5 : 1;
  if (efficiency && speed > 1) speed += efficiency * efficiency + 1;
  speed *= mult;
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
