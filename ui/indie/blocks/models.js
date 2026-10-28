// The mobs' bodies: boxes with the game's texture layout (each box takes its six faces from one strip of the skin, in
// the order the game uses), parts turning at their pivots, and how each kind moves its legs, head, arms and wings.
// Model space is the game's: 1/16 block units, y pointing down, the feet at y = 24, the front towards −z. Our own skins
// are drawn here in the same layouts, so a skin from the player's own game fits the same boxes.

const PI = Math.PI;
/** A part: texture corner [u, v], boxes [x, y, z, w, h, d, inflate, mirror], pivot, rotation [x, y, z], children. */
const part = (name, tex, boxes, pivot = [0, 0, 0], rot = [0, 0, 0], children = []) => ({name, tex, boxes, pivot, rot, children});
const legs4 = (tex, box, pts, mirrorLeft = false) => pts.map(([x, y, z], i) => part(`leg${i}`, tex, [[...box, 0, mirrorLeft && i % 2 === 1]], [x, y, z]));

export const MODELS = {
  pig: {skin: [64, 32], size: [0.9, 0.9], parts: [
    part('head', [0, 0], [[-4, -4, -8, 8, 8, 8]], [0, 12, -6], [0, 0, 0], [part('snout', [16, 16], [[-2, 0, -9, 4, 3, 1]])]),
    part('body', [28, 8], [[-5, -10, -7, 10, 16, 8]], [0, 11, 2], [PI / 2, 0, 0]),
    ...legs4([0, 16], [-2, 0, -2, 4, 6, 4], [[-3, 18, 7], [3, 18, 7], [-3, 18, -5], [3, 18, -5]], true),
  ]},
  cow: {skin: [64, 32], size: [0.9, 1.4], parts: [
    part('head', [0, 0], [[-4, -4, -6, 8, 8, 6]], [0, 4, -8], [0, 0, 0], [part('horn', [22, 0], [[-5, -5, -4, 1, 3, 1], [4, -5, -4, 1, 3, 1]])]),
    part('body', [18, 4], [[-6, -10, -7, 12, 18, 10]], [0, 5, 2], [PI / 2, 0, 0], [part('udder', [52, 0], [[-2, 2, -8, 4, 6, 1]])]),
    ...legs4([0, 16], [-2, 0, -2, 4, 12, 4], [[-4, 12, 7], [4, 12, 7], [-4, 12, -6], [4, 12, -6]], true),
  ]},
  sheep: {skin: [64, 32], size: [0.9, 1.3], parts: [
    part('head', [0, 0], [[-3, -4, -6, 6, 6, 8]], [0, 6, -8]),
    part('body', [28, 8], [[-4, -10, -7, 8, 16, 6]], [0, 5, 2], [PI / 2, 0, 0]),
    ...legs4([0, 16], [-2, 0, -2, 4, 12, 4], [[-3, 12, 7], [3, 12, 7], [-3, 12, -5], [3, 12, -5]], true),
  ]},
  // the wool over a sheep: the same parts a little bigger, on its own skin (tinted by the sheep's colour)
  sheep_wool: {skin: [64, 32], size: [0.9, 1.3], parts: [
    part('head', [0, 0], [[-3, -4, -4, 6, 6, 6, 0.6]], [0, 6, -8]),
    part('body', [28, 8], [[-4, -10, -7, 8, 16, 6, 1.75]], [0, 5, 2], [PI / 2, 0, 0]),
    ...legs4([0, 16], [-2, 0, -2, 4, 6, 4], [[-3, 12, 7], [3, 12, 7], [-3, 12, -5], [3, 12, -5]], true).map(l => (l.boxes[0][6] = 0.5, l)),
  ]},
  chicken: {skin: [64, 32], size: [0.4, 0.7], parts: [
    part('head', [0, 0], [[-2, -6, -2, 4, 6, 3]], [0, 15, -4], [0, 0, 0], [part('beak', [14, 0], [[-2, -4, -4, 4, 2, 2]]), part('wattle', [14, 4], [[-1, -2, -3, 2, 2, 2]])]),
    part('body', [0, 9], [[-3, -4, -3, 6, 8, 6]], [0, 16, 0], [PI / 2, 0, 0]),
    part('leg0', [26, 0], [[-1, 0, -3, 3, 5, 3]], [-2, 19, 1]), part('leg1', [26, 0], [[-1, 0, -3, 3, 5, 3]], [1, 19, 1]),
    part('wing0', [24, 13], [[0, 0, -3, 1, 4, 6]], [-4, 13, 0]), part('wing1', [24, 13], [[-1, 0, -3, 1, 4, 6]], [4, 13, 0]),
  ]},
  // the left arm and leg are the right ones mirrored, as the game's own humanoid model has them (its zombie picture is
  // 64×64 but leaves the player's left-limb places empty: taken from there, a zombie had one arm and one leg)
  zombie: {skin: [64, 64], size: [0.6, 1.95], parts: [
    part('head', [0, 0], [[-4, -8, -4, 8, 8, 8]]),
    part('body', [16, 16], [[-4, 0, -2, 8, 12, 4]]),
    part('arm0', [40, 16], [[-3, -2, -2, 4, 12, 4]], [-5, 2, 0]), part('arm1', [40, 16], [[-1, -2, -2, 4, 12, 4, 0, true]], [5, 2, 0]),
    part('leg0', [0, 16], [[-2, 0, -2, 4, 12, 4]], [-1.9, 12, 0]), part('leg1', [0, 16], [[-2, 0, -2, 4, 12, 4, 0, true]], [1.9, 12, 0]),
  ]},
  skeleton: {skin: [64, 32], size: [0.6, 1.99], parts: [
    part('head', [0, 0], [[-4, -8, -4, 8, 8, 8]]),
    part('body', [16, 16], [[-4, 0, -2, 8, 12, 4]]),
    part('arm0', [40, 16], [[-1, -2, -1, 2, 12, 2]], [-5, 2, 0]), part('arm1', [40, 16], [[-1, -2, -1, 2, 12, 2, 0, true]], [5, 2, 0]),
    part('leg0', [0, 16], [[-1, 0, -1, 2, 12, 2]], [-2, 12, 0]), part('leg1', [0, 16], [[-1, 0, -1, 2, 12, 2, 0, true]], [2, 12, 0]),
  ]},
  creeper: {skin: [64, 32], size: [0.6, 1.7], parts: [
    part('head', [0, 0], [[-4, -8, -4, 8, 8, 8]], [0, 6, 0]),
    part('body', [16, 16], [[-4, 0, -2, 8, 12, 4]], [0, 6, 0]),
    ...legs4([0, 16], [-2, 0, -2, 4, 6, 4], [[-2, 18, 4], [2, 18, 4], [-2, 18, -4], [2, 18, -4]]),
  ]},
  spider: {skin: [64, 32], size: [1.4, 0.9], parts: [
    part('head', [32, 4], [[-4, -4, -8, 8, 8, 8]], [0, 15, -3]),
    part('neck', [0, 0], [[-3, -3, -3, 6, 6, 6]], [0, 15, 0]),
    part('body', [0, 12], [[-5, -4, -6, 10, 8, 12]], [0, 15, 9]),
    ...[2, 1, 0, -1].flatMap((z, i) => [part(`leg${i * 2}`, [18, 0], [[-15, -1, -1, 16, 2, 2]], [-4, 15, z]), part(`leg${i * 2 + 1}`, [18, 0], [[-1, -1, -1, 16, 2, 2]], [4, 15, z])]),
  ]},
  // the Nether's: the zombified piglin (the piglin's 64×64 layout: a wide head with a snout, tusks and floppy ears),
  // the ghast (a cube drawn 4.5 times over, nine tentacles hanging under it), the blaze (a head in three rings of
  // turning rods) and the magma cube (eight slices and a core, pulled apart as it jumps)
  zombified_piglin: {skin: [64, 64], size: [0.6, 1.95], parts: [
    part('head', [0, 0], [[-5, -8, -4, 10, 8, 8]], [0, 0, 0], [0, 0, 0], [part('snout', [31, 1], [[-2, -4, -5, 4, 4, 1]]), part('tusk0', [2, 4], [[-3, -2, -5, 1, 2, 1]]), part('tusk1', [2, 0], [[2, -2, -5, 1, 2, 1]]),
      part('ear0', [39, 6], [[-1, 0, -2, 1, 5, 4]], [-4.5, -6, 0], [0, 0, Math.PI / 6]), part('ear1', [51, 6], [[0, 0, -2, 1, 5, 4]], [4.5, -6, 0], [0, 0, -Math.PI / 6])]),
    part('body', [16, 16], [[-4, 0, -2, 8, 12, 4]]),
    part('arm0', [40, 16], [[-3, -2, -2, 4, 12, 4]], [-5, 2, 0]), part('arm1', [32, 48], [[-1, -2, -2, 4, 12, 4]], [5, 2, 0]),
    part('leg0', [0, 16], [[-2, 0, -2, 4, 12, 4]], [-1.9, 12, 0]), part('leg1', [16, 48], [[-2, 0, -2, 4, 12, 4]], [1.9, 12, 0]),
  ]},
  ghast: {skin: [64, 32], size: [4, 4], scale: 4.5, parts: [
    part('body', [0, 0], [[-8, -8, -8, 16, 16, 16]], [0, 17.6, 0]),
    ...Array.from({length: 9}, (_, i) => part(`tentacle${i}`, [0, 0], [[-1, 0, -1, 2, [9, 12, 8, 13, 10, 11, 8, 12, 9][i], 2]], [((i % 3) - (Math.floor(i / 3) % 2) * 0.5 + 0.25 - 1) * 5, 24.6, (Math.floor(i / 3) - 1) * 5])),
  ]},
  blaze: {skin: [64, 32], size: [0.6, 1.8], parts: [
    part('head', [0, 0], [[-4, -4, -4, 8, 8, 8]]),
    ...Array.from({length: 12}, (_, i) => part(`rod${i}`, [0, 16], [[0, 0, 0, 2, 8, 2]])),
  ]},
  magma_cube: {skin: [64, 32], size: [0.52, 0.52], parts: [
    ...Array.from({length: 8}, (_, i) => part(`slice${i}`, i === 2 ? [24, 10] : i === 3 ? [24, 19] : [0, i], [[-4, 16 + i, -4, 8, 1, 8]])),
    part('core', [0, 16], [[-2, 18, -2, 4, 4, 4]]),
  ]},
  // villagers (64×64: a long head with a big nose, a robe over the body, the arms folded in front) and the iron golem
  // (128×128: a heavy body, long arms swinging, a small head with a long nose)
  villager: {skin: [64, 64], size: [0.6, 1.95], parts: [
    part('head', [0, 0], [[-4, -10, -4, 8, 10, 8]], [0, 0, 0], [0, 0, 0], [part('nose', [24, 0], [[-1, -1, -6, 2, 4, 2]], [0, -2, 0])]),
    part('body', [16, 20], [[-4, 0, -3, 8, 12, 6]], [0, 0, 0], [0, 0, 0], [part('robe', [0, 38], [[-4, 0, -3, 8, 20, 6, 0.5]])]),
    part('arms', [44, 22], [[-8, -2, -2, 4, 8, 4], [4, -2, -2, 4, 8, 4, 0, true]], [0, 3, -1], [-0.75, 0, 0], [part('hands', [40, 38], [[-4, 2, -2, 8, 4, 4]])]),
    part('leg0', [0, 22], [[-2, 0, -2, 4, 12, 4]], [-2, 12, 0]), part('leg1', [0, 22], [[-2, 0, -2, 4, 12, 4, 0, true]], [2, 12, 0]),
  ]},
  iron_golem: {skin: [128, 128], size: [1.4, 2.7], parts: [
    part('head', [0, 0], [[-4, -12, -5.5, 8, 10, 8]], [0, -7, -2], [0, 0, 0], [part('nose', [24, 0], [[-1, -5, -7.5, 2, 4, 2]])]),
    part('body', [0, 40], [[-9, -2, -6, 18, 12, 11]], [0, -7, 0], [0, 0, 0], [part('waist', [0, 70], [[-4.5, 10, -3, 9, 5, 6, 0.5]])]),
    part('arm0', [60, 21], [[-13, -2.5, -3, 4, 30, 6]], [0, -7, 0]), part('arm1', [60, 58], [[9, -2.5, -3, 4, 30, 6]], [0, -7, 0]),
    part('leg0', [37, 0], [[-3.5, -3, -3, 6, 16, 5]], [-4, 11, 0]), part('leg1', [60, 0], [[-3.5, -3, -3, 6, 16, 5, 0, true]], [5, 11, 0]),
  ]},
  // the player (seen from behind or the front): the 64×64 layout, each part with its outer layer a little bigger
  player: {skin: [64, 64], size: [0.6, 1.8], parts: [
    part('head', [0, 0], [[-4, -8, -4, 8, 8, 8]], [0, 0, 0], [0, 0, 0], [part('hat', [32, 0], [[-4, -8, -4, 8, 8, 8, 0.5]])]),
    part('body', [16, 16], [[-4, 0, -2, 8, 12, 4]], [0, 0, 0], [0, 0, 0], [part('jacket', [16, 32], [[-4, 0, -2, 8, 12, 4, 0.25]])]),
    part('arm0', [40, 16], [[-3, -2, -2, 4, 12, 4]], [-5, 2, 0], [0, 0, 0], [part('sleeve0', [40, 32], [[-3, -2, -2, 4, 12, 4, 0.25]])]),
    part('arm1', [32, 48], [[-1, -2, -2, 4, 12, 4]], [5, 2, 0], [0, 0, 0], [part('sleeve1', [48, 48], [[-1, -2, -2, 4, 12, 4, 0.25]])]),
    part('leg0', [0, 16], [[-2, 0, -2, 4, 12, 4]], [-1.9, 12, 0], [0, 0, 0], [part('pants0', [0, 32], [[-2, 0, -2, 4, 12, 4, 0.25]])]),
    part('leg1', [16, 48], [[-2, 0, -2, 4, 12, 4]], [1.9, 12, 0], [0, 0, 0], [part('pants1', [0, 48], [[-2, 0, -2, 4, 12, 4, 0.25]])]),
  ]},
};
// worn armour over the player, in the game's 64×32 layouts: the outer one (helmet, chestplate, boots) and the inner one
// (leggings); each piece draws only its parts
export const ARMOR_MODELS = {
  armor_outer: {skin: [64, 32], parts: [
    part('head', [0, 0], [[-4, -8, -4, 8, 8, 8, 1]]), part('body', [16, 16], [[-4, 0, -2, 8, 12, 4, 1]]),
    part('arm0', [40, 16], [[-3, -2, -2, 4, 12, 4, 1]], [-5, 2, 0]), part('arm1', [40, 16], [[-1, -2, -2, 4, 12, 4, 1, true]], [5, 2, 0]),
    part('leg0', [0, 16], [[-2, 0, -2, 4, 12, 4, 1]], [-1.9, 12, 0]), part('leg1', [0, 16], [[-2, 0, -2, 4, 12, 4, 1, true]], [1.9, 12, 0]),
  ]},
  armor_inner: {skin: [64, 32], parts: [
    part('body', [16, 16], [[-4, 0, -2, 8, 12, 4, 0.5]]),
    part('leg0', [0, 16], [[-2, 0, -2, 4, 12, 4, 0.5]], [-1.9, 12, 0]), part('leg1', [0, 16], [[-2, 0, -2, 4, 12, 4, 0.5, true]], [1.9, 12, 0]),
  ]},
};
/** Which model and parts each worn piece draws (0 helmet … 3 boots). */
export const ARMOR_PARTS = [['armor_outer', ['head']], ['armor_outer', ['body', 'arm0', 'arm1']], ['armor_inner', ['body', 'leg0', 'leg1']], ['armor_outer', ['leg0', 'leg1']]];

// ---------- moving ----------
/** Sets the parts' turning for a pose: {limb, amount, headYaw, headPitch, age, attack, aim, flap, fall}. */
export function animate(kind, rot, pose) {
  const swing = (k = 0) => Math.cos(pose.limb * 0.6662 + k) * 1.4 * pose.amount;
  const head = rot.head || (rot.head = [0, 0, 0]);
  head[0] = pose.headPitch || 0; head[1] = pose.headYaw || 0;
  const set = (n, x = 0, y = 0, z = 0) => { rot[n] = [x, y, z]; };
  if (kind === 'pig' || kind === 'cow' || kind === 'sheep' || kind === 'sheep_wool' || kind === 'creeper') {
    set('leg0', swing()); set('leg1', swing(PI)); set('leg2', swing(PI)); set('leg3', swing());
    if (kind !== 'creeper') set('body', PI / 2);
    if (pose.graze) head[0] = 0.9 + Math.sin(pose.age * 0.6) * 0.1;
  } else if (kind === 'chicken') {
    set('leg0', swing()); set('leg1', swing(PI)); set('body', PI / 2);
    const f = pose.fall ? (Math.sin(pose.age * 1.8) + 1) * 0.9 : 0;
    set('wing0', 0, 0, f); set('wing1', 0, 0, -f);
  } else if (kind === 'zombie' || kind === 'skeleton') {
    const aim = kind === 'skeleton' && pose.aim;
    const arms = kind === 'zombie' ? -PI / 2 + Math.sin(pose.age * 0.067) * 0.05 - (pose.attack || 0) * 0.6 : aim ? -PI / 2 : swing(PI) * 0.5;
    set('arm0', aim ? -PI / 2 + head[0] : arms, aim ? -0.1 + head[1] : 0, Math.cos(pose.age * 0.09) * 0.05 + 0.05);
    set('arm1', kind === 'zombie' ? arms : aim ? -PI / 2 + head[0] : swing() * 0.5, aim ? 0.5 + head[1] : 0, -Math.cos(pose.age * 0.09) * 0.05 - 0.05);
    set('leg0', swing() * 0.8); set('leg1', swing(PI) * 0.8);
  } else if (kind === 'player') {
    // arms swing against the legs; a hit swings the right arm down and across
    const walk = k => Math.cos(pose.limb * 0.6662 + k) * pose.amount, hit = Math.sin((pose.attack || 0) * PI);
    set('arm0', walk(PI) - hit * 1.3, hit * 0.4, 0.05 + Math.cos(pose.age * 0.09) * 0.03);
    set('arm1', walk(0), 0, -0.05 - Math.cos(pose.age * 0.09) * 0.03);
    set('leg0', walk(0) * 1.4); set('leg1', walk(PI) * 1.4);
  } else if (kind === 'villager') {
    set('leg0', swing() * 0.5); set('leg1', swing(PI) * 0.5);
    // shaking its head (no trade for you), or nodding as it trades
    if (pose.shake) head[2] = Math.sin(pose.age * 1.4) * 0.3;
  } else if (kind === 'iron_golem') {
    // the game's: arms and legs on a triangle wave as it walks; both arms thrown up when it hits
    const tri = (x, p) => (Math.abs(((x % p) + p) % p - p / 2) - p / 4) / (p / 4), w = tri(pose.limb, 13);
    if (pose.attack) { const up = -2 + 1.5 * tri(pose.attack * 10, 10); set('arm0', up); set('arm1', up); }
    else { set('arm0', (-0.2 + 1.5 * w) * pose.amount); set('arm1', (-0.2 - 1.5 * w) * pose.amount); }
    set('leg0', -1.5 * w * pose.amount); set('leg1', 1.5 * w * pose.amount);
  } else if (kind === 'zombified_piglin') {
    // arms held out when it is angry, swinging when it walks; the ears flap
    const up = -PI / 2 + Math.sin(pose.age * 0.067) * 0.05 - (pose.attack || 0) * 0.6;
    set('arm0', pose.aim ? up : swing(PI) * 0.5, 0, 0.05); set('arm1', pose.aim ? up : swing() * 0.5, 0, -0.05);
    set('leg0', swing() * 0.8); set('leg1', swing(PI) * 0.8);
    const flap = Math.sin(pose.limb * 0.6662) * pose.amount * 0.3 + Math.sin(pose.age * 0.1) * 0.05;
    set('ear0', 0, 0, PI / 6 + flap); set('ear1', 0, 0, -PI / 6 - flap);
  } else if (kind === 'ghast') {
    for (let i = 0; i < 9; i++) set(`tentacle${i}`, 0.2 * Math.sin(pose.age * 0.3 + i) + 0.4);
  } else if (kind === 'blaze') {
    // three rings of four rods going round (the top ring one way, the middle the other), bobbing (the game's numbers);
    // '@name' moves a part's pivot
    let f = pose.age * PI * -0.1;
    for (let i = 0; i < 4; i++, f++) rot[`@rod${i}`] = [Math.cos(f) * 9, -2 + Math.cos((i * 2 + pose.age) * 0.25), Math.sin(f) * 9];
    f = PI / 4 + pose.age * PI * 0.03;
    for (let i = 4; i < 8; i++, f++) rot[`@rod${i}`] = [Math.cos(f) * 7, 2 + Math.cos((i * 2 + pose.age) * 0.25), Math.sin(f) * 7];
    f = 0.47123894 + pose.age * PI * -0.05;
    for (let i = 8; i < 12; i++, f++) rot[`@rod${i}`] = [Math.cos(f) * 5, 11 + Math.cos((i * 1.5 + pose.age) * 0.5), Math.sin(f) * 5];
  } else if (kind === 'magma_cube') {
    // squish: the slices spread apart (in the air) or press together (landing)
    for (let i = 0; i < 8; i++) rot[`@slice${i}`] = [0, -(4 - i) * (pose.squish || 0) * 1.7, 0];
  } else if (kind === 'spider') {
    const z = [PI / 4, PI / 4 * 0.74, PI / 4 * 0.74, PI / 4], y = [PI / 4, PI / 8, -PI / 8, -PI / 4];
    for (let i = 0; i < 4; i++) {
      const a = Math.cos(pose.limb * 1.3324 + i * PI / 2 + (i % 2 ? PI : 0)) * 0.4 * pose.amount, b = Math.abs(Math.sin(pose.limb * 0.6662 + i * PI / 2)) * 0.4 * pose.amount;
      set(`leg${i * 2}`, 0, y[i] + a, -z[i] - b);
      set(`leg${i * 2 + 1}`, 0, -y[i] - a, z[i] + b);
    }
  }
  return rot;
}

// ---------- the boxes as triangles ----------
const mul3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const mulM = (a, b) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; return o; };
/** The game's part rotation: z, then y, then x (applied x first). */
function rotZYX([x, y, z]) {
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx], Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mulM(Rz, mulM(Ry, Rx));
}
const ID3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/**
 * Writes a mob's triangles (as quads) into out (a Float32 list: x, y, z, u, v, shade per vertex), already turned,
 * scaled and placed: at (x, y, z) relative to the camera, facing yaw (0 looks along −z), size s.
 */
export function buildModel(kind, rot, {x, y, z, yaw, s = 1, roll = 0, swell = 0}, out, skinSize = null, only = null) {
  const m = MODELS[kind] || ARMOR_MODELS[kind], [tw, th] = skinSize || m.skin;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll), k = (1 + swell) * s / 16;
  // the game's model space → world: x and y turned over, the feet at 24, then the body's turn (and a fall-over roll)
  const place = p => {
    let lx = -p[0] * k * (1 + swell * 0.2), ly = (24 - p[1]) * s / 16 * (1 + swell * 0.1), lz = p[2] * k;
    if (roll) { const nx = lx * cr - ly * sr; ly = lx * sr + ly * cr; lx = nx; }
    return [x + lx * cy + lz * sy, y + ly, z - lx * sy + lz * cy];
  };
  const walk = (p, M, at) => {
    const R = mulM(M, rotZYX(rot[p.name] || p.rot)), here = (v) => { const r = mul3(R, v); return [at[0] + r[0], at[1] + r[1], at[2] + r[2]]; };
    for (const [bx, by, bz, w, h, d, inf = 0, mirror = false] of p.boxes) {
      let x0 = bx - inf, y0 = by - inf, z0 = bz - inf, x1 = bx + w + inf, y1 = by + h + inf, z1 = bz + d + inf;
      if (mirror) [x0, x1] = [x1, x0];
      const V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map(v => place(here(v)));
      const [u, v] = p.tex, j = u, kk = u + d, l = u + d + w, mm = u + d + w + w, n = u + d + w + d, o = u + d + w + d + w, pp = v, q = v + d, r = v + d + h;
      const faces = [[[5, 4, 0, 1], kk, pp, l, q], [[2, 3, 7, 6], l, q, mm, pp], [[0, 4, 7, 3], j, q, kk, r], [[1, 0, 3, 2], kk, q, l, r], [[5, 1, 2, 6], l, q, n, r], [[4, 5, 6, 7], n, q, o, r]];
      for (const [vs, u1, v1, u2, v2] of faces) {
        const a = V[vs[0]], b = V[vs[1]], c = V[vs[2]];
        const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const len = Math.hypot(nx, ny, nz) || 1, shade = 0.7 + Math.abs(ny / len) * (ny > 0 ? 0.3 : -0.2) + Math.abs(nz / len) * 0.1;
        const uv = [[u2, v1], [u1, v1], [u1, v2], [u2, v2]];
        // each face wound the same way round seen from outside (a mirrored box's corners swapped turn it the other
        // way: walked backwards), so the backs of the faces can be left out — the game's mobs show through the gaps
        // of a cut-out picture (a skeleton's ribs) what is behind, not the inside of their own box
        for (let k = 0; k < 4; k++) { const i = mirror ? 3 - k : k, P = V[vs[i]]; out.push(P[0], P[1], P[2], uv[i][0] / tw, uv[i][1] / th, shade); }
      }
    }
    for (const c of p.children) walk({...c, name: c.name}, R, here(c.pivot));
  };
  for (const p of m.parts) if (!only || only.includes(p.name)) walk(p, ID3, rot[`@${p.name}`] || p.pivot);
  return out;
}

// ---------- our own skins ----------
const hexc = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function rnd(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/** A skin canvas painter: fill(region, colours), the six faces of a box, single pixels. */
function skin(w, h, seed, paint) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null, data = new Uint8ClampedArray(w * h * 4), r = rnd(seed);
  const px = (x, y, col, a = 255) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2]; data[i + 3] = a; };
  const area = (x, y, ww, hh, pal, rough = 0.18) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) { const col = hexc(pal[Math.floor(r() * pal.length)]), k = 1 - rough / 2 + r() * rough; px(x + i, y + j, col.map(v => Math.min(255, v * k))); } };
  /** The faces of a box (texture corner u, v, size w, h, d) painted: all, or per face. */
  const box = (u, v, bw, bh, bd, pal, rough) => {
    area(u + bd, v, bw, bd, pal, rough); area(u + bd + bw, v, bw, bd, pal, rough);
    area(u, v + bd, bd, bh, pal, rough); area(u + bd, v + bd, bw, bh, pal, rough); area(u + bd + bw, v + bd, bd, bh, pal, rough); area(u + bd * 2 + bw, v + bd, bw, bh, pal, rough);
  };
  const front = (u, v, bw, bd) => [u + bd, v + bd];
  paint({px, area, box, front, r, hex: hexc});
  if (c) { c.width = w; c.height = h; const g = c.getContext('2d'), img = g.createImageData(w, h); img.data.set(data); g.putImageData(img, 0, 0); return c; }
  return {width: w, height: h, data};
}
const shadeHex = (h, k) => '#' + hexc(h).map(v => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join('');
export const OWN_SKINS = {
  pig: () => skin(64, 32, 1, ({px, area, box, front, hex}) => {
    const pink = ['#f1a7a6', '#eba09f', '#f5b0ae', '#e69795'];
    box(0, 0, 8, 8, 8, pink); box(28, 8, 10, 16, 8, pink); box(0, 16, 4, 6, 4, pink); box(16, 16, 4, 3, 1, ['#e48d93', '#de8690']);
    const [fx, fy] = front(0, 0, 8, 8);
    for (const ex of [0, 6]) { px(fx + ex, fy + 2, hex('#ffffff')); px(fx + ex + 1, fy + 2, hex('#1a1a1a')); }
    const [sx, sy] = front(16, 16, 4, 1); px(sx, sy + 1, hex('#7a3a43')); px(sx + 3, sy + 1, hex('#7a3a43'));
    area(0, 24, 16, 1, ['#8a5a55']); area(4, 16, 4, 4, ['#8a5a55']); // hooves
  }),
  cow: () => skin(64, 32, 2, ({px, area, box, front, hex, r}) => {
    const brown = ['#4a3426', '#432f22', '#52392a'], white = ['#e9e7e1', '#dedbd3'];
    box(0, 0, 8, 8, 6, brown); box(18, 4, 12, 18, 10, brown); box(0, 16, 4, 12, 4, brown);
    // white patches over the body and legs
    for (let k = 0; k < 9; k++) { const x = 18 + Math.floor(r() * 44), y = 4 + Math.floor(r() * 26), w = 3 + Math.floor(r() * 6), h = 2 + Math.floor(r() * 5); area(x, y, w, h, white); }
    area(0, 26, 16, 2, ['#2e211a']);
    const [fx, fy] = front(0, 0, 8, 6);
    area(fx + 2, fy + 3, 4, 5, white); area(fx + 2, fy + 6, 4, 2, ['#c4a49a', '#bf9e94']);
    for (const ex of [0, 6]) { px(fx + ex, fy + 2, hex('#ffffff')); px(fx + ex + (ex ? 1 : 1), fy + 2, hex('#111111')); }
    box(22, 0, 1, 3, 1, ['#d8d4c8']); box(52, 0, 4, 6, 1, ['#e9a6a6', '#df9c9c']);
  }),
  sheep: () => skin(64, 32, 3, ({px, area, box, front, hex}) => {
    const face = ['#d7c3ad', '#cdb8a1', '#dccab5'], body = ['#d9cfc3', '#d2c7ba'];
    box(0, 0, 6, 6, 8, face); box(28, 8, 8, 16, 6, body); box(0, 16, 4, 12, 4, face);
    const [fx, fy] = front(0, 0, 6, 8);
    px(fx, fy + 2, hex('#ffffff')); px(fx + 1, fy + 2, hex('#222222')); px(fx + 5, fy + 2, hex('#ffffff')); px(fx + 4, fy + 2, hex('#222222'));
    area(fx + 2, fy + 4, 2, 1, ['#b9897c']); area(0, 26, 16, 2, ['#6b5a4a']);
  }),
  sheep_wool: () => skin(64, 32, 4, ({box}) => {
    const wool = ['#ffffff', '#f2f2f2', '#e8e8e8', '#fafafa'];
    box(0, 0, 6, 6, 6, wool, 0.25); box(28, 8, 8, 16, 6, wool, 0.25); box(0, 16, 4, 6, 4, wool, 0.25);
  }),
  chicken: () => skin(64, 32, 5, ({px, box, front, hex}) => {
    const white = ['#f4f4f2', '#ececea', '#fafaf8'];
    box(0, 0, 4, 6, 3, white); box(0, 9, 6, 8, 6, white); box(24, 13, 1, 4, 6, ['#e6e6e2', '#f0f0ee']);
    box(14, 0, 4, 2, 2, ['#f3b43a', '#e9a62c']); box(14, 4, 2, 2, 2, ['#d8312b', '#c92a25']);
    // legs: a thin leg down the middle of each side of the box, toes at the bottom (the rest clear; only the near
    // faces are drawn, so from any side it is one leg — with the far faces seen through the gaps it looked like three)
    for (const x of [27, 30, 33, 36]) for (let y = 3; y < 8; y++) px(x, y, hex(y === 7 ? '#c9861f' : '#e8a23a'));
    for (const x of [29, 30, 31, 35, 36, 37]) px(x, 7, hex('#dc9530'));
    const [fx, fy] = front(0, 0, 4, 3); px(fx, fy + 1, hex('#111111')); px(fx + 3, fy + 1, hex('#111111'));
  }),
  zombie: () => skin(64, 64, 6, ({px, area, box, front, hex}) => {
    const skinC = ['#5e9a4c', '#558f44', '#66a453'], shirt = ['#3d6470', '#38606b', '#43707c'], pants = ['#3a3f78', '#353a70', '#40467f'];
    box(0, 0, 8, 8, 8, skinC); box(16, 16, 8, 12, 4, shirt); box(40, 16, 4, 12, 4, shirt); box(32, 48, 4, 12, 4, shirt);
    box(0, 16, 4, 12, 4, pants); box(16, 48, 4, 12, 4, pants);
    // hands, a torn shirt, the face
    area(44, 26, 8, 6, skinC); area(40, 26, 4, 6, skinC); area(52, 26, 4, 6, skinC); area(36, 58, 8, 6, skinC); area(32, 58, 4, 6, skinC); area(44, 58, 4, 6, skinC);
    area(20, 28, 8, 2, skinC); area(0, 30, 16, 2, ['#2a2a3a']); area(16, 62, 16, 2, ['#2a2a3a']);
    const [fx, fy] = front(0, 0, 8, 8);
    area(fx + 1, fy + 3, 2, 1, ['#1b2a16']); area(fx + 5, fy + 3, 2, 1, ['#1b2a16']); area(fx + 2, fy + 6, 4, 1, ['#2f4a26']);
    px(fx + 1, fy + 2, hex('#3d6332')); px(fx + 6, fy + 2, hex('#3d6332'));
  }),
  skeleton: () => skin(64, 32, 7, ({px, area, box, front, hex, r}) => {
    const bone = ['#c9c9c4', '#bdbdb8', '#d4d4cf'];
    box(0, 0, 8, 8, 8, bone); box(40, 16, 2, 12, 2, bone); box(0, 16, 2, 12, 2, bone);
    // the body a cage of bones with clear gaps (the far side shows through, as the game's): ribs round all four sides,
    // the spine down the front and back, the shoulders and the hips
    area(20, 16, 8, 4, bone); area(28, 16, 8, 4, bone);
    for (let y = 21; y < 28; y += 2) area(16, y, 24, 1, bone);
    area(23, 20, 2, 12, bone); area(35, 20, 2, 12, bone); area(16, 20, 24, 1, bone); area(16, 29, 24, 3, bone);
    const [fx, fy] = front(0, 0, 8, 8);
    area(fx + 1, fy + 3, 2, 2, ['#151515']); area(fx + 5, fy + 3, 2, 2, ['#151515']); px(fx + 3, fy + 5, hex('#333333')); px(fx + 4, fy + 5, hex('#333333'));
    for (let i = 1; i < 7; i++) px(fx + i, fy + 6, hex(i % 2 ? '#2a2a2a' : '#bdbdb8'));
    void r;
  }),
  creeper: () => skin(64, 32, 8, ({area, box, front}) => {
    const green = ['#5fb04c', '#4e9c3e', '#6dc05a', '#3f8a33', '#8fd27a', '#56a845'];
    box(0, 0, 8, 8, 8, green, 0.25); box(16, 16, 8, 12, 4, green, 0.25); box(0, 16, 4, 6, 4, green, 0.25);
    const [fx, fy] = front(0, 0, 8, 8), black = ['#0c0c0c', '#161616'];
    area(fx + 1, fy + 2, 2, 2, black); area(fx + 5, fy + 2, 2, 2, black); area(fx + 3, fy + 4, 2, 3, black); area(fx + 2, fy + 5, 1, 3, black); area(fx + 5, fy + 5, 1, 3, black);
  }),
  spider: () => skin(64, 32, 9, ({px, area, box, front, hex, r}) => {
    const dark = ['#2c2420', '#352b26', '#251e1a', '#3e332c'];
    box(32, 4, 8, 8, 8, dark); box(0, 0, 6, 6, 6, dark); box(0, 12, 10, 8, 12, dark); box(18, 0, 16, 2, 2, ['#2a221e', '#3a2f28']);
    for (let k = 0; k < 40; k++) px(Math.floor(r() * 44), 12 + Math.floor(r() * 20), hex('#4e4038'));
    const [fx, fy] = front(32, 4, 8, 8);
    for (const [ex, ey] of [[1, 3], [6, 3], [2, 4], [5, 4], [3, 2], [4, 2], [0, 4], [7, 4]]) px(fx + ex, fy + ey, hex('#d0201c'));
  }),
  villager: () => ownVillager('none'),
  iron_golem: () => skin(128, 128, 31, ({px, area, box, front, hex, r}) => {
    const iron = ['#d8d2c8', '#cfc8bd', '#e2ddd4', '#c4bdb2'];
    box(0, 0, 8, 10, 8, iron, 0.12); box(24, 0, 2, 4, 2, ['#c4bdb2']); box(0, 40, 18, 12, 11, iron, 0.12); box(0, 70, 9, 5, 6, iron, 0.12);
    box(60, 21, 4, 30, 6, iron, 0.12); box(60, 58, 4, 30, 6, iron, 0.12); box(37, 0, 6, 16, 5, iron, 0.12); box(60, 0, 6, 16, 5, iron, 0.12);
    // vines growing over it, rivets and cracks, the red eyes
    for (let k = 0; k < 260; k++) { const x = Math.floor(r() * 90), y = 40 + Math.floor(r() * 50); if (r() < 0.5 && x < 60) px(x, y, hex(r() < 0.5 ? '#4a7a2a' : '#5e9036')); }
    for (let k = 0; k < 60; k++) px(Math.floor(r() * 100), Math.floor(r() * 100), hex('#9a948a'));
    const [fx, fy] = front(0, 0, 8, 8);
    area(fx + 1, fy + 4, 2, 1, ['#2a1414']); area(fx + 5, fy + 4, 2, 1, ['#2a1414']); px(fx + 2, fy + 4, hex('#c81e1e')); px(fx + 5, fy + 4, hex('#c81e1e'));
    area(fx + 1, fy + 2, 6, 1, ['#a8a298']);
  }),
  // the Nether's, ours: a rotting pink piglin with bare ribs and a gold-trimmed belt
  zombified_piglin: () => skin(64, 64, 21, ({px, area, box, front, hex, r}) => {
    const pink = ['#e8a4a0', '#dc9894', '#f0b0aa'], rot = ['#7aa860', '#6a9852', '#88b46c'], loin = ['#5a3a22', '#4e321c', '#66442a'];
    box(0, 0, 10, 8, 8, pink); box(31, 1, 4, 4, 1, ['#f2b8b2', '#e8aaa4']); box(16, 16, 8, 12, 4, pink); box(40, 16, 4, 12, 4, pink); box(32, 48, 4, 12, 4, rot);
    box(0, 16, 4, 12, 4, loin); box(16, 48, 4, 12, 4, pink); box(39, 6, 1, 5, 4, pink); box(51, 6, 1, 5, 4, pink); box(2, 0, 1, 2, 1, ['#f0ecd8']); box(2, 4, 1, 2, 1, ['#f0ecd8']);
    // rotten patches, the bones of the ribs and an arm, the belt
    for (let k = 0; k < 40; k++) { const x = Math.floor(r() * 56), y = Math.floor(r() * 32); if (r() < 0.5) px(x, y, hex(rot[k % 3])); }
    for (const y of [21, 23, 25]) area(21, y, 4, 1, ['#f0ecd8']);
    area(16, 26, 24, 2, ['#d8a838', '#c09028']);
    const [fx, fy] = front(0, 0, 10, 8);
    area(fx + 1, fy + 3, 2, 1, ['#1a1010']); area(fx + 7, fy + 3, 2, 1, ['#f0f0e8']); px(fx + 7, fy + 3, hex('#1a1010'));
    const [sx, sy] = front(31, 1, 4, 1); px(sx + 1, sy + 1, hex('#8a4a48')); px(sx + 2, sy + 1, hex('#8a4a48'));
  }),
  ghast: () => skin(64, 32, 22, ({area, box, front, px, hex, r}) => {
    const white = ['#f2f2f2', '#e8e8e8', '#fafafa', '#dcdcdc'];
    box(0, 0, 16, 16, 16, white, 0.08);
    for (let k = 0; k < 30; k++) px(Math.floor(r() * 64), Math.floor(r() * 32), hex('#c8c8c8'));
    // the face: closed eyes with tears, a small mouth
    const [fx, fy] = front(0, 0, 16, 16), dark = ['#3a3a3a'];
    area(fx + 3, fy + 5, 3, 1, dark); area(fx + 10, fy + 5, 3, 1, dark); area(fx + 4, fy + 6, 1, 3, ['#9ab4c8']); area(fx + 11, fy + 6, 1, 3, ['#9ab4c8']);
    area(fx + 6, fy + 10, 4, 2, dark);
  }),
  blaze: () => skin(64, 32, 23, ({area, box, front, px, hex, r}) => {
    const gold = ['#f0b020', '#e8a018', '#f8c840', '#d89010'], rod = ['#f8d050', '#e8a020', '#c87810'];
    box(0, 0, 8, 8, 8, gold, 0.25); box(0, 16, 2, 8, 2, rod, 0.3);
    for (let k = 0; k < 20; k++) px(Math.floor(r() * 32), Math.floor(r() * 16), hex('#a85a08'));
    const [fx, fy] = front(0, 0, 8, 8);
    area(fx + 1, fy + 3, 2, 1, ['#2a1404']); area(fx + 5, fy + 3, 2, 1, ['#2a1404']); area(fx + 2, fy + 6, 4, 1, ['#6a3008']);
  }),
  magma_cube: () => skin(64, 32, 24, ({area, box, front, px, hex, r}) => {
    const crust = ['#3a1a10', '#4a2214', '#2e140c'];
    for (let i = 0; i < 8; i++) { const [u, v] = i === 2 ? [24, 10] : i === 3 ? [24, 19] : [0, i]; box(u, v, 8, 1, 8, crust); }
    // glowing seams on the slices' sides, the eyes on the front, an orange core
    for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) if (r() < 0.25) px(x, y + 8, hex(r() < 0.5 ? '#f08a1a' : '#ffd040'));
    box(0, 16, 4, 4, 4, ['#ffb020', '#ff8a10', '#ffd050']);
    const [fx, fy] = front(0, 4, 8, 8); area(fx + 1, 12, 2, 1, ['#ffd040']); area(fx + 5, 12, 2, 1, ['#ffd040']);
  }),
  // ours, not the game's: dark hair, a red hoodie (the sleeve of the hand seen in first person), jeans, white shoes
  player: () => skin(64, 64, 10, ({px, area, box, front, hex}) => {
    const skinC = ['#f2c9a9', '#ecc2a0', '#f5cfb0'], hair = ['#2b2230', '#342a3a', '#241c29'], hoodie = ['#c84a5a', '#bf4454', '#d05262'], jeans = ['#3b4a6b', '#364463', '#41517a'], shoe = ['#ecece8', '#dededa'];
    box(0, 0, 8, 8, 8, skinC);
    area(8, 0, 8, 8, hair); area(24, 8, 8, 8, hair); area(0, 8, 8, 3, hair); area(16, 8, 8, 3, hair); area(0, 11, 3, 3, hair); area(21, 11, 3, 3, hair);
    const [fx, fy] = front(0, 0, 8, 8);
    area(fx, fy, 8, 2, hair); px(fx, fy + 2, hex('#2b2230')); px(fx + 7, fy + 2, hex('#2b2230'));
    for (const [ex, c] of [[1, '#ffffff'], [2, '#3a2a4a'], [5, '#3a2a4a'], [6, '#ffffff']]) px(fx + ex, fy + 4, hex(c));
    px(fx + 3, fy + 6, hex('#c98a7a')); px(fx + 4, fy + 6, hex('#c98a7a'));
    box(16, 16, 8, 12, 4, hoodie);
    const [bx, by] = front(16, 16, 8, 4);
    px(bx + 3, by + 1, hex('#f0e6e6')); px(bx + 4, by + 1, hex('#f0e6e6')); px(bx + 3, by + 2, hex('#f0e6e6')); px(bx + 4, by + 3, hex('#f0e6e6'));
    area(bx + 1, by + 7, 6, 3, ['#b23f4f', '#ac3a4a']); area(16, 28, 24, 4, ['#9e3646', '#a33a4a']);
    for (const [u, v] of [[40, 16], [32, 48]]) { box(u, v, 4, 12, 4, hoodie); area(u, v + 13, 16, 3, skinC); area(u + 8, v, 4, 4, skinC); area(u, v + 12, 16, 1, ['#9e3646']); }
    for (const [u, v] of [[0, 16], [16, 48]]) { box(u, v, 4, 12, 4, jeans); area(u, v + 13, 16, 3, shoe); area(u + 8, v, 4, 4, shoe); }
  }),
};
// a villager's clothes by trade: the robe, its trim, and something of the trade (ours)
const VILLAGER_CLOTHES = {none: ['#6e4b30', '#5a3c26'], nitwit: ['#3a8a3a', '#2a6a2a'], farmer: ['#8a6a2a', '#d8c060', 'hat'], fisherman: ['#3a6a8a', '#d8c060', 'hat'],
  shepherd: ['#8a5a3a', '#f0f0f0'], fletcher: ['#6a7a3a', '#e8e8e8', 'feather'], librarian: ['#e8e4d8', '#a82a2a'], cleric: ['#7a2a8a', '#e8c040'],
  armorer: ['#3a3a3a', '#8a8a8a', 'apron'], toolsmith: ['#4a4a5a', '#8a6a3a', 'apron'], butcher: ['#e8e8e8', '#b83a3a', 'apron']};
/** Our villager skin for a trade ('none': no work yet), in the game's 64×64 villager layout. */
export function ownVillager(prof) {
  const [robe, trim, mark] = VILLAGER_CLOTHES[prof] || VILLAGER_CLOTHES.none;
  return skin(64, 64, 41 + prof.length, ({px, area, box, front, hex}) => {
    const face = ['#b98c6a', '#ad8060', '#c49674'], cloth = [robe, robe, robe], dark = [trim];
    box(0, 0, 8, 10, 8, face); box(24, 0, 2, 4, 2, ['#a0785a', '#9a7254']);
    box(16, 20, 8, 12, 6, cloth); box(0, 38, 8, 20, 6, cloth, 0.12); box(44, 22, 4, 8, 4, cloth); box(40, 38, 8, 4, 4, face); box(0, 22, 4, 12, 4, ['#4a3a2a', '#3e3022']);
    // the robe's hem and collar in the trim colour; eyes and a brow
    area(6, 56, 28, 2, dark); area(22, 20, 8, 1, dark); area(6, 44, 8, 1, dark);
    const [fx, fy] = front(0, 0, 8, 8);
    area(fx + 1, fy + 4, 6, 1, ['#4a3020']); px(fx + 1, fy + 5, hex('#ffffff')); px(fx + 2, fy + 5, hex('#2a6a3a')); px(fx + 5, fy + 5, hex('#2a6a3a')); px(fx + 6, fy + 5, hex('#ffffff'));
    if (mark === 'hat') area(0, 0, 32, 8, [trim, trim, '#c0a848']);
    if (mark === 'apron') { const [bx, by] = front(0, 38, 8, 6); area(bx + 1, by + 2, 6, 16, [trim]); }
    if (mark === 'feather') { area(8, 0, 2, 8, [trim]); px(9, 0, hex('#ffffff')); }
  });
}
export const VILLAGER_SKINS = Object.keys(VILLAGER_CLOTHES);
export const MOB_KINDS =Object.keys(MODELS).filter(k => k !== 'sheep_wool' && k !== 'player');
// our armour pictures, one per material and layer (1: helmet, chestplate, boots; 2: leggings), only where it is worn
const ARMOR_PAL = {leather: ['#8f5530', '#9c5e36', '#a8683c', '#7e4a29'], chainmail: ['#8a8a8a', '#a2a2a2', '#6e6e6e', '#b8b8b8'], iron: ['#c6c6c6', '#d4d4d4', '#b8b8b8', '#e2e2e2'],
  golden: ['#e9c33a', '#f2d24e', '#d9ae2a', '#fae27a'], diamond: ['#4fd1cb', '#62e0d9', '#3fbcb6', '#8ff0ea']};
export function ownArmor(mat, layer) {
  return skin(64, 32, layer === 1 ? 31 : 32, ({px, area, box, front}) => {
    const pal = ARMOR_PAL[mat] || ARMOR_PAL.iron, edge = pal.map(c => shadeHex(c, 0.72));
    const clear = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, [0, 0, 0], 0); };
    if (layer === 1) {
      box(0, 0, 8, 8, 8, pal, 0.12);
      const [fx, fy] = front(0, 0, 8, 8);
      clear(fx + 1, fy + 3, 6, 5); clear(16, 0, 8, 8); area(0, 15, 32, 1, edge);
      box(16, 16, 8, 12, 4, pal, 0.12); area(16, 31, 24, 1, edge);
      box(40, 16, 4, 12, 4, pal, 0.12); clear(40, 26, 16, 6); clear(48, 16, 4, 4); area(40, 25, 16, 1, edge);
      box(0, 16, 4, 12, 4, pal, 0.12); clear(0, 20, 16, 8); clear(4, 16, 4, 4); area(0, 28, 16, 1, edge);
    } else {
      box(16, 16, 8, 12, 4, pal, 0.12); clear(16, 20, 24, 7); clear(20, 16, 8, 4); area(16, 27, 24, 1, edge);
      box(0, 16, 4, 12, 4, pal, 0.12); clear(0, 30, 16, 2); clear(8, 16, 4, 4);
    }
  });
}
export {shadeHex};
