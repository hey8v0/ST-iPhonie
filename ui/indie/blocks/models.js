// The mobs' bodies: boxes with the game's texture layout (each box takes its six faces from one strip of the skin, in
// the order the game uses), parts turning at their pivots, and how each kind moves its legs, head, arms and wings.
// Model space is the game's: 1/16 block units, y pointing down, the feet at y = 24, the front towards −z. Our own skins
// are drawn here in the same layouts, so a skin from the player's own game fits the same boxes.

const PI = Math.PI;
/** A part: texture corner [u, v], boxes [x, y, z, w, h, d, inflate, mirror], pivot, rotation [x, y, z], children. */
const part = (name, tex, boxes, pivot = [0, 0, 0], rot = [0, 0, 0], children = []) => ({name, tex, boxes, pivot, rot, children});
const legs4 = (tex, box, pts, mirrorLeft = false) => pts.map(([x, y, z], i) => part(`leg${i}`, tex, [[...box, 0, mirrorLeft && i % 2 === 1]], [x, y, z]));

// the guardian's twelve spikes: where each sits round the body and how it is turned (the game's, in halves of π)
const SPIKE = {x: [0, 0, 8, -8, -8, 8, 8, -8, 0, 0, 8, -8], y: [-8, -8, -8, -8, 0, 0, 0, 0, 8, 8, 8, 8], z: [8, -8, 0, 0, -8, -8, 8, 8, 8, -8, 0, 0],
  rx: [1.75, 0.25, 0, 0, 0.5, 0.5, 0.5, 0.5, 1.25, 0.75, 0, 0], ry: [0, 0, 0, 0, 0.25, 1.75, 1.25, 0.75, 0, 0, 0, 0], rz: [0, 0, 0.25, 1.75, 0, 0, 0, 0, 0, 0, 0.75, 1.25]};
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
  slime: {skin: [64, 32], size: [0.52, 0.52], parts: [part('body', [0, 0], [[-4, 16, -4, 8, 8, 8]])]},
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
  // the sea: the squid (its body up, eight tentacles hanging round), the glowing one, cod, salmon (in two halves), the small
  // tropical fish (white: tinted with its colour), the pufferfish (the small one; it swells by its size), the turtle
  squid: {skin: [64, 32], size: [0.8, 0.8], parts: [
    part('body', [0, 0], [[-6, -8, -6, 12, 16, 12, 0.02]], [0, 8, 0]),
    ...Array.from({length: 8}, (_, k) => part(`tentacle${k}`, [48, 0], [[-1, 0, -1, 2, 18, 2]], [Math.cos(k * PI * 2 / 8) * 5, 15, Math.sin(k * PI * 2 / 8) * 5], [0, k * PI * -2 / 8 + PI / 2, 0])),
  ]},
  cod: {skin: [32, 32], size: [0.5, 0.3], parts: [
    part('body', [0, 0], [[-1, -2, 0, 2, 4, 7]], [0, 22, 0]), part('head', [11, 0], [[-1, -2, -3, 2, 4, 3]], [0, 22, 0]), part('nose', [0, 0], [[-1, -2, -1, 2, 3, 1]], [0, 22, -3]),
    part('right_fin', [22, 1], [[-2, 0, -1, 2, 0, 2]], [-1, 23, 0], [0, 0, -PI / 4]), part('left_fin', [22, 4], [[0, 0, -1, 2, 0, 2]], [1, 23, 0], [0, 0, PI / 4]),
    part('tail_fin', [22, 3], [[0, -2, 0, 0, 4, 4]], [0, 22, 7]), part('top_fin', [20, -6], [[0, -1, -1, 0, 1, 6]], [0, 20, 0]),
  ]},
  salmon: {skin: [32, 32], size: [0.7, 0.4], parts: [
    part('body_front', [0, 0], [[-1.5, -2.5, 0, 3, 5, 8]], [0, 20, 0], [0, 0, 0], [part('top_front_fin', [2, 1], [[0, 0, 0, 0, 2, 3]], [0, -4.5, 5])]),
    part('body_back', [0, 13], [[-1.5, -2.5, 0, 3, 5, 8]], [0, 20, 8], [0, 0, 0], [part('back_fin', [20, 10], [[0, -2.5, 0, 0, 5, 6]], [0, 0, 8]), part('top_back_fin', [0, 2], [[0, 0, 0, 0, 2, 4]], [0, -4.5, -1])]),
    part('head', [22, 0], [[-1, -2, -3, 2, 4, 3]], [0, 20, 0]),
    part('right_fin', [-4, 0], [[-2, 0, 0, 2, 0, 2]], [-1.5, 21.5, 0], [0, 0, -PI / 4]), part('left_fin', [0, 0], [[0, 0, 0, 2, 0, 2]], [1.5, 21.5, 0], [0, 0, PI / 4]),
  ]},
  tropical_fish: {skin: [32, 32], size: [0.5, 0.4], parts: [
    part('body', [0, 0], [[-1, -1.5, -3, 2, 3, 6]], [0, 22, 0]), part('tail', [22, -6], [[0, -1.5, 0, 0, 3, 6]], [0, 22, 3]),
    part('right_fin', [2, 16], [[-2, -1, 0, 2, 2, 0]], [-1, 22.5, 0], [0, PI / 4, 0]), part('left_fin', [2, 12], [[0, -1, 0, 2, 2, 0]], [1, 22.5, 0], [0, -PI / 4, 0]),
    part('top_fin', [10, -5], [[0, -3, 0, 0, 3, 6]], [0, 20.5, -3]),
  ]},
  pufferfish: {skin: [32, 32], size: [0.35, 0.35], parts: [
    part('body', [0, 27], [[-1.5, -2, -1.5, 3, 2, 3]], [0, 23, 0]), part('right_eye', [24, 6], [[-1.5, 0, -1.5, 1, 1, 1]], [0, 20, 0]), part('left_eye', [28, 6], [[0.5, 0, -1.5, 1, 1, 1]], [0, 20, 0]),
    part('back_fin', [-3, 0], [[-1.5, 0, 0, 3, 0, 3]], [0, 22, 1.5]), part('right_fin', [25, 0], [[-1, 0, 0, 1, 0, 2]], [-1.5, 22, -1.5]), part('left_fin', [25, 0], [[0, 0, 0, 1, 0, 2]], [1.5, 22, -1.5]),
  ]},
  turtle: {skin: [128, 64], size: [1.2, 0.4], parts: [
    part('head', [3, 0], [[-3, -1, -3, 6, 5, 6]], [0, 19, -10]),
    part('body', [7, 37], [[-9.5, 3, -10, 19, 20, 6]], [0, 11, -10], [PI / 2, 0, 0], [part('belly', [31, 1], [[-5.5, 3, -13, 11, 18, 3]])]),
    part('leg0', [1, 23], [[-2, 0, 0, 4, 1, 10]], [-3.5, 22, 11]), part('leg1', [1, 12], [[-2, 0, 0, 4, 1, 10]], [3.5, 22, 11]),
    part('leg2', [27, 30], [[-13, 0, -2, 13, 1, 5]], [-5, 21, -4]), part('leg3', [27, 24], [[0, 0, -2, 13, 1, 5]], [5, 21, -4]),
  ]},
  // the deep sea's guardian: a box of a body with plates on four sides, an eye in front, twelve spikes (in while it
  // swims) and a tail of three parts with a fin (the game's boxes; the body turns round its middle)
  guardian: {skin: [64, 64], size: [0.85, 0.85], parts: [
    part('head', [0, 0], [[-6, -6, -8, 12, 12, 16]], [0, 16, 0], [0, 0, 0], [
      part('side0', [0, 28], [[-8, -6, -6, 2, 12, 12]]), part('side1', [0, 28], [[6, -6, -6, 2, 12, 12, 0, true]]),
      part('top', [16, 40], [[-6, -8, -6, 12, 2, 12]]), part('bottom', [16, 40], [[-6, 6, -6, 12, 2, 12]]),
      ...SPIKE.x.map((_, i) => part(`spike${i}`, [0, 0], [[-1, -4.5, -1, 2, 9, 2]], [SPIKE.x[i], SPIKE.y[i], SPIKE.z[i]], [PI * SPIKE.rx[i], PI * SPIKE.ry[i], PI * SPIKE.rz[i]])),
      part('eye', [8, 0], [[-1, -1, 0, 2, 2, 1]], [0, 0, -8.25]),
      part('tail0', [40, 0], [[-2, -2, 7, 4, 4, 8]], [0, 0, 0], [0, 0, 0], [
        part('tail1', [0, 54], [[0, -2, 0, 3, 3, 7]], [-1.5, 0.5, 14], [0, 0, 0], [
          part('tail2', [41, 32], [[0, -2, 0, 2, 2, 6]], [0.5, 0.5, 6], [0, 0, 0], [part('fin', [25, 19], [[1, -5.5, 3, 1, 9, 9]])]),
        ]),
      ]),
    ]),
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
MODELS.glow_squid = {...MODELS.squid};
// the elder guardian: the guardian drawn 2.35 times as big (the game's), on its own skin
MODELS.elder_guardian = {...MODELS.guardian, size: [1.9975, 1.9975], scale: 2.35};
// the drowned: a zombie of the sea in the game's own humanoid layout (its left arm and leg have places of their own),
// with an outer layer of rags and weed drawn a little bigger over it; the dolphin (64×64): a long body that pitches the
// way it swims, the head and its beak, a fin on the back, two at the sides, the tail and its flukes
const humanoid = (inf = 0) => [
  part('head', [0, 0], [[-4, -8, -4, 8, 8, 8, inf]], [0, 0, 0], [0, 0, 0], [part('hat', [32, 0], [[-4, -8, -4, 8, 8, 8, inf + 0.5]])]),
  part('body', [16, 16], [[-4, 0, -2, 8, 12, 4, inf]]),
  part('arm0', [40, 16], [[-3, -2, -2, 4, 12, 4, inf]], [-5, 2, 0]), part('arm1', [32, 48], [[-1, -2, -2, 4, 12, 4, inf]], [5, 2, 0]),
  part('leg0', [0, 16], [[-2, 0, -2, 4, 12, 4, inf]], [-1.9, 12, 0]), part('leg1', [16, 48], [[-2, 0, -2, 4, 12, 4, inf]], [1.9, 12, 0]),
];
Object.assign(MODELS, {
  drowned: {skin: [64, 64], size: [0.6, 1.95], parts: humanoid()},
  drowned_outer: {skin: [64, 64], size: [0.6, 1.95], parts: humanoid(0.25)},
  dolphin: {skin: [64, 64], size: [0.9, 0.6], parts: [
    part('body', [22, 0], [[-4, -7, 0, 8, 7, 13]], [0, 22, -5], [0, 0, 0], [
      part('back_fin', [51, 0], [[-0.5, 0, 8, 1, 4, 5]], [0, 0, 0], [PI / 3, 0, 0]),
      part('left_fin', [48, 20], [[-0.5, -4, 0, 1, 4, 7, 0, true]], [2, -2, 4], [PI / 3, 0, 2.0943952]),
      part('right_fin', [48, 20], [[-0.5, -4, 0, 1, 4, 7]], [-2, -2, 4], [PI / 3, 0, -2.0943952]),
      part('tail', [0, 19], [[-2, -2.5, 0, 4, 5, 11]], [0, -2.5, 11], [-0.10471976, 0, 0], [part('tail_fin', [19, 20], [[-5, -0.5, 0, 10, 1, 6]], [0, 0, 9])]),
      part('head', [0, 0], [[-4, -3, -3, 8, 7, 6]], [0, -4, -3], [0, 0, 0], [part('nose', [0, 13], [[-1, 2, -7, 2, 2, 4]])]),
    ]),
  ]},
});
// the enderman (64×32, the game's): a humanoid stretched thin, its limbs 30 long, its head over a jaw (the head lifts
// off it, the mouth open, when it is angry); its eyes a second picture over the same model, glowing
const enderParts = (k = 0) => [
  part('head', [0, 0], [[-4, -8, -4, 8, 8, 8, k]], [0, -13, 0]), part('jaw', [0, 16], [[-4, -8, -4, 8, 8, 8, k - 0.5]], [0, -13, 0]),
  part('body', [32, 16], [[-4, 0, -2, 8, 12, 4, k]], [0, -14, 0]),
  part('arm0', [56, 0], [[-1, -2, -1, 2, 30, 2, k]], [-5, -12, 0]), part('arm1', [56, 0], [[-1, -2, -1, 2, 30, 2, k, true]], [5, -12, 0]),
  // (its legs a pixel higher than the game's, whose feet sink a pixel into the ground)
  part('leg0', [56, 0], [[-1, 0, -1, 2, 30, 2, k]], [-2, -6, 0]), part('leg1', [56, 0], [[-1, 0, -1, 2, 30, 2, k, true]], [2, -6, 0]),
];
MODELS.enderman = {skin: [64, 32], size: [0.6, 2.9], parts: enderParts()};
MODELS.enderman_eyes = {skin: [64, 32], size: [0.6, 2.9], parts: enderParts(0.02)};
// a sign (64×32, the game's): the board 24×12×2 and, standing, the post 2×14×2 under it; drawn at two thirds
export const SIGN_MODELS = {
  sign: {skin: [64, 32], size: [1, 1], parts: [part('board', [0, 0], [[-12, -14, -1, 24, 12, 2]]), part('post', [0, 14], [[-1, -2, -1, 2, 14, 2]])]},
  wall_sign: {skin: [64, 32], size: [1, 1], parts: [part('board', [0, 0], [[-12, -14, -1, 24, 12, 2]])]},
};
// the polar bear (128×64, the game's): a head with its muzzle and ears, a long body with the hump at its shoulders
// lying along it, four thick legs; it rears up on its hind legs to strike
MODELS.polar_bear = {skin: [128, 64], size: [1.4, 1.4], parts: [
  part('head', [0, 0], [[-3.5, -3, -3, 7, 7, 7]], [0, 10, -16], [0, 0, 0], [part('mouth', [0, 44], [[-2.5, 1, -6, 5, 3, 3]]), part('ear0', [26, 0], [[-4.5, -4, -1, 2, 2, 1]]), part('ear1', [26, 0], [[2.5, -4, -1, 2, 2, 1, 0, true]])]),
  part('body', [0, 19], [[-5, -13, -7, 14, 14, 11]], [-2, 9, 12], [PI / 2, 0, 0], [part('hump', [39, 0], [[-4, -25, -7, 12, 12, 10]])]),
  part('leg0', [50, 22], [[-2, 0, -2, 4, 10, 8]], [-4.5, 14, 6]), part('leg1', [50, 22], [[-2, 0, -2, 4, 10, 8]], [4.5, 14, 6]),
  part('leg2', [50, 40], [[-2, 0, -2, 4, 10, 6]], [-3.5, 14, -8]), part('leg3', [50, 40], [[-2, 0, -2, 4, 10, 6]], [3.5, 14, -8]),
]};
// tropical fish (32×32 each, not mob kinds of their own): the large body (the game's boxes: a deep body, a long tail,
// fins above and below), and the pattern laid over either body — the same boxes a hair bigger, on the pattern's picture
const inflated = (parts, k) => parts.map(p => ({...p, boxes: p.boxes.map(([x, y, z, w, h, d, inf = 0, m = false]) => [x, y, z, w, h, d, inf + k, m]), children: inflated(p.children, k)}));
export const FISH_MODELS = {
  tropical_fish_b: {skin: [32, 32], size: [0.5, 0.4], parts: [
    part('body', [0, 20], [[-1, -3, -3, 2, 6, 6]], [0, 19, 0]), part('tail', [21, 16], [[0, -3, 0, 0, 6, 5]], [0, 19, 3]),
    part('right_fin', [2, 16], [[-2, 0, 0, 2, 2, 0]], [-1, 20, 0], [0, PI / 4, 0]), part('left_fin', [2, 12], [[0, 0, 0, 2, 2, 0]], [1, 20, 0], [0, -PI / 4, 0]),
    part('top_fin', [20, 11], [[0, -4, 0, 0, 4, 6]], [0, 16, -3]), part('bottom_fin', [20, 21], [[0, 0, 0, 0, 4, 6]], [0, 22, -3]),
  ]},
};
FISH_MODELS.fish_pattern_a = {...MODELS.tropical_fish, parts: inflated(MODELS.tropical_fish.parts, 0.008)};
FISH_MODELS.fish_pattern_b = {...FISH_MODELS.tropical_fish_b, parts: inflated(FISH_MODELS.tropical_fish_b.parts, 0.008)};
// the conduit as the game draws it (by the page, not with the land; each centred at y 16, half a block up): its shell
// while it rests; awake, a cage of prismarine, an eye, and boxes of whirling water round it (6, 8 and 16 across)
export const CONDUIT_MODELS = {
  conduit_shell: {skin: [32, 16], parts: [part('shell', [0, 0], [[-3, -3, -3, 6, 6, 6]], [0, 16, 0])]},
  conduit_cage: {skin: [32, 16], parts: [part('cage', [0, 0], [[-4, -4, -4, 8, 8, 8]], [0, 16, 0])]},
  conduit_eye: {skin: [16, 16], parts: [part('eye', [0, 0], [[-4, -4, 0, 8, 8, 0, 0.01]], [0, 16, 0])]},
  conduit_wind: {skin: [64, 32], parts: [part('wind', [0, 0], [[-8, -8, -8, 16, 16, 16]], [0, 16, 0])]},
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
// boats, the game's (skins 128 × 64, with a chest 128 × 128): the hull — a bottom, the back and front and the two sides —
// and two paddles; the chest boat with a chest at the back; the bamboo raft (two layers) and the raft with a chest. The
// game's model lies along its x; its renderer turns it a quarter round, as the root part here does. Its y = 0 is 0.375
// over the boat's bottom.
const HULL = [
  part('bottom', [0, 0], [[-14, -9, -3, 28, 16, 3]], [0, 3, 1], [PI / 2, 0, 0]),
  part('back', [0, 19], [[-13, -7, -1, 18, 6, 2]], [-15, 4, 4], [0, PI * 1.5, 0]),
  part('front', [0, 27], [[-8, -7, -1, 16, 6, 2]], [15, 4, 0], [0, PI / 2, 0]),
  part('right', [0, 35], [[-14, -7, -1, 28, 6, 2]], [0, 4, -9], [0, PI, 0]),
  part('left', [0, 43], [[-14, -7, -1, 28, 6, 2]], [0, 4, 9]),
];
const RAFT = [part('bottom', [0, 0], [[-14, -11, -4, 28, 20, 4], [-14, -9, -8, 28, 16, 4]], [0, -2.1, 1], [PI / 2, 0, 0])];
const PADDLE_TILT = 0.19634955;
const paddles = (y, left, right) => [
  part('left_paddle', left, [[-1, 0, -5, 2, 2, 18], [-1.001, -3, 8, 1, 6, 7]], [3, y, 9], [0, 0, PADDLE_TILT]),
  part('right_paddle', right, [[-1, 0, -5, 2, 2, 18], [0.001, -3, 8, 1, 6, 7]], [3, y, -9], [0, PI, PADDLE_TILT]),
];
const chest = dy => [
  part('chest_bottom', [0, 76], [[0, 0, 0, 12, 8, 12]], [-2, -5 + dy, -6], [0, -PI / 2, 0]),
  part('chest_lid', [0, 59], [[0, 0, 0, 12, 4, 12]], [-2, -9 + dy, -6], [0, -PI / 2, 0]),
  part('chest_lock', [0, 59], [[-1, 0, 0, 2, 4, 1]], [-1, -6 + dy, 0], [0, -PI / 2, 0]),
];
const turned = parts => [part('root', [0, 0], [], [0, 0, 0], [0, PI / 2, 0], parts)];
export const BOAT_MODELS = {
  boat: {skin: [128, 64], parts: turned([...HULL, ...paddles(-5, [62, 0], [62, 20])])},
  chest_boat: {skin: [128, 128], parts: turned([...HULL, ...paddles(-5, [62, 0], [62, 20]), ...chest(0)])},
  raft: {skin: [128, 64], parts: turned([...RAFT, ...paddles(-4, [0, 24], [40, 24])])},
  chest_raft: {skin: [128, 128], parts: turned([...RAFT, ...paddles(-4, [0, 24], [40, 24]), ...chest(-5.1)])},
};

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
  } else if (kind === 'zombie' || kind === 'skeleton' || kind === 'drowned' || kind === 'drowned_outer') {
    const aim = kind === 'skeleton' && pose.aim, zombie = kind !== 'skeleton';
    const arms = zombie ? -PI / 2 + Math.sin(pose.age * 0.067) * 0.05 - (pose.attack || 0) * 0.6 : aim ? -PI / 2 : swing(PI) * 0.5;
    set('arm0', aim ? -PI / 2 + head[0] : arms, aim ? -0.1 + head[1] : 0, Math.cos(pose.age * 0.09) * 0.05 + 0.05);
    set('arm1', zombie ? arms : aim ? -PI / 2 + head[0] : swing() * 0.5, aim ? 0.5 + head[1] : 0, -Math.cos(pose.age * 0.09) * 0.05 - 0.05);
    set('leg0', swing() * 0.8); set('leg1', swing(PI) * 0.8);
    // a drowned: its trident raised to throw (the game's: the arm half way, then back over the head); swimming after
    // someone, its arms reach over its head and its legs kick
    if (pose.spear) rot.arm0 = [rot.arm0[0] * 0.5 - PI, 0, rot.arm0[2]];
    if (pose.swim && zombie) {
      const k = Math.sin(0.1 * pose.age);
      rot.arm0 = [-2.5132742 + k * 0.35, 0, -0.15]; rot.arm1 = [-2.5132742 - k * 0.35, 0, 0.15];
      rot.leg0[0] += k * 0.55; rot.leg1[0] -= k * 0.55; head[0] = 0;
    }
  } else if (kind === 'player') {
    // arms swing against the legs; a hit swings the right arm down and across; sitting in a boat or a minecart the legs
    // are out in front and the arms a little forward (the game's)
    const walk = k => Math.cos(pose.limb * 0.6662 + k) * pose.amount, hit = Math.sin((pose.attack || 0) * PI), sit = pose.riding ? -PI / 5 : 0;
    set('arm0', walk(PI) - hit * 1.3 + sit, hit * 0.4, 0.05 + Math.cos(pose.age * 0.09) * 0.03);
    set('arm1', walk(0) + sit, 0, -0.05 - Math.cos(pose.age * 0.09) * 0.03);
    if (pose.riding) { set('leg0', -1.4137167, PI / 10, 0.07853982); set('leg1', -1.4137167, -PI / 10, -0.07853982); }
    else { set('leg0', walk(0) * 1.4); set('leg1', walk(PI) * 1.4); }
    // drawing a bow: both arms out at what they look at; a trident drawn back: raised over the head
    if (pose.bow) { set('arm0', -PI / 2 + head[0], -0.1 + head[1], 0); set('arm1', -PI / 2 + head[0], 0.5 + head[1], 0); }
    if (pose.spear) rot.arm0 = [rot.arm0[0] * 0.5 - PI, 0, rot.arm0[2]];
  } else if (BOAT_MODELS[kind]) {
    // the paddles row round (pose.paddles: how far each has gone round; the game's)
    const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
    [0, 1].forEach(side => {
      const t = pose.paddles?.[side] || 0, ry = lerp(-PI / 4, PI / 4, (Math.sin(-t + 1) + 1) / 2);
      set(side ? 'right_paddle' : 'left_paddle', lerp(-PI / 3, -0.2617994, (Math.sin(-t) + 1) / 2), side ? PI - ry : ry, PADDLE_TILT);
    });
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
  } else if (kind === 'squid') {
    // the tentacles open and close as it swims (the game's tentacle angle)
    for (let k = 0; k < 8; k++) set(`tentacle${k}`, pose.tentacles || 0, k * PI * -2 / 8 + PI / 2, 0);
  } else if (kind === 'cod' || kind === 'salmon' || kind === 'tropical_fish') {
    // the tail beats (faster out of the water)
    const beat = -(pose.flop ? 1.5 : 1) * 0.45 * Math.sin(0.6 * pose.age);
    if (kind === 'cod') set('tail_fin', 0, beat, 0);
    if (kind === 'tropical_fish') set('tail', 0, beat, 0);
    if (kind === 'salmon') { set('body_back', 0, beat * 0.6, 0); }
  } else if (kind === 'guardian' || kind === 'elder_guardian') {
    // the spikes: out while it keeps still, drawn in by up to 0.55 while it swims (the game's), each trembling a little;
    // the tail sways; the eye turns a little towards what it watches
    const drawn = (1 - (pose.spikes ?? 1)) * 0.55;
    for (let i = 0; i < 12; i++) { const k = 1 + Math.cos(pose.age * 1.5 + i) * 0.01 - drawn; rot[`@spike${i}`] = [SPIKE.x[i] * k, SPIKE.y[i] * k, SPIKE.z[i] * k]; }
    const t = pose.tail || 0;
    set('tail0', 0, Math.sin(t) * PI * 0.05, 0); set('tail1', 0, Math.sin(t) * PI * 0.1, 0); set('tail2', 0, Math.sin(t) * PI * 0.15, 0);
    rot['@eye'] = [pose.eyeX || 0, pose.eyeY || 0, -8.25];
  } else if (kind === 'pufferfish') {
    set('right_fin', 0, 0, -0.2 + 0.4 * Math.sin(pose.age * 0.2)); set('left_fin', 0, 0, 0.2 - 0.4 * Math.sin(pose.age * 0.2));
  } else if (kind === 'turtle') {
    // flippers: rowing in the water, paddling slowly on land
    const sw = Math.cos(pose.limb * (pose.swim ? 0.6662 * 0.6 : 0.6662 * 5)) * (pose.swim ? 0.5 : 0.25) * Math.max(pose.amount, pose.swim ? 0.6 : 0);
    set('leg0', sw, 0, 0); set('leg1', -sw, 0, 0); set('leg2', 0, 0, sw); set('leg3', 0, 0, -sw);
  } else if (kind === 'enderman' || kind === 'enderman_eyes') {
    // walking, its long limbs swing half as far, never past 0.4; holding a block, both arms held out to it; angry, its
    // head lifted off its jaw (the game's)
    const half = k => Math.max(-0.4, Math.min(0.4, swing(k) * 0.5));
    set('leg0', half()); set('leg1', half(PI)); set('arm0', half(PI)); set('arm1', half());
    if (pose.carry) { set('arm0', -0.5, 0, 0.05); set('arm1', -0.5, 0, -0.05); }
    rot.jaw = [head[0], head[1], 0];
    if (pose.creepy) rot['@head'] = [0, -18, 0];
  } else if (kind === 'polar_bear') {
    // walking, its legs swing; rearing up (the game's): the body tilts back on the hind legs, the front legs and head go up
    set('leg0', swing()); set('leg1', swing(PI)); set('leg2', swing(PI)); set('leg3', swing());
    const f = (pose.stand || 0) ** 2, g = 1 - f;
    set('body', PI / 2 - f * PI * 0.35); rot['@body'] = [-2, 9 * g + 11 * f, 12];
    for (const leg of ['leg2', 'leg3']) { rot[`@${leg}`] = [leg === 'leg2' ? -3.5 : 3.5, 14 * g - 6 * f, -8 * g - 4 * f]; rot[leg][0] -= f * PI * 0.45; }
    rot['@head'] = pose.young ? [0, 10 * g - 9 * f, -16 * g - 7 * f] : [0, 10 * g - 14 * f, -16 * g - 3 * f]; head[0] += f * PI * 0.15;
  } else if (kind === 'dolphin') {
    // the whole body pitched the way it swims (the head with it); swimming, it rocks and its tail beats (the game's)
    const w = Math.cos(pose.age * 0.3), moving = pose.amount > 0.05 || pose.swim;
    set('body', (pose.headPitch || 0) + (moving ? -0.05 - 0.05 * w : 0), pose.headYaw || 0, 0);
    head[0] = 0; head[1] = 0;
    set('tail', moving ? -0.1 * w : -0.10471976); set('tail_fin', moving ? -0.2 * w : 0);
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
  const m = MODELS[kind] || ARMOR_MODELS[kind] || BOAT_MODELS[kind] || FISH_MODELS[kind] || CONDUIT_MODELS[kind] || SIGN_MODELS[kind], [tw, th] = skinSize || m.skin;
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
        // (the game's fish have flat fins whose pictures start a little off the skin's edge: kept on it)
        for (let k = 0; k < 4; k++) { const i = mirror ? 3 - k : k, P = V[vs[i]]; out.push(P[0], P[1], P[2], Math.min(1, Math.max(0, uv[i][0] / tw)), Math.min(1, Math.max(0, uv[i][1] / th)), shade); }
      }
    }
    for (const c of p.children) walk({...c, name: c.name}, R, here(rot[`@${c.name}`] || c.pivot));
  };
  for (const p of m.parts) if (!only || only.includes(p.name)) walk(p, ID3, rot[`@${p.name}`] || p.pivot);
  return out;
}
/**
 * A model's hand, for what it holds: {at: the fist, placed as buildModel places the model (relative to the camera); ax:
 * the arm's own three directions (x across, y down the arm, z back) in the world, each a model unit long}. arm: a
 * part's name ('arm0' the right arm, 'arm1' the left); null if the model has none.
 */
export function handFrame(kind, rot, {x, y, z, yaw, s = 1, roll = 0}, arm, point = null) {
  // the part, wherever it is in the model (a dolphin's nose is its head's, its head its body's)
  let found = null;
  const find = (p, M, at) => {
    const R = mulM(M, rotZYX(rot[p.name] || p.rot));
    if (p.name === arm) { found = {p, R, at}; return true; }
    return p.children.some(c => { const v = mul3(R, rot[`@${c.name}`] || c.pivot); return find(c, R, [at[0] + v[0], at[1] + v[1], at[2] + v[2]]); });
  };
  for (const p of MODELS[kind]?.parts || []) if (find(p, ID3, rot[`@${p.name}`] || p.pivot)) break;
  if (!found) return null;
  const {p, R, at: pv} = found, [bx, by, bz, w, h, d] = p.boxes[0];
  // the fist (by default): the middle of the arm's end, a pixel in
  const r = mul3(R, point || [bx + w / 2, by + h - 1, bz + d / 2]), fist = [pv[0] + r[0], pv[1] + r[1], pv[2] + r[2]];
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll), k = s / 16;
  // (the model's space to the world's as buildModel does it: x and y turned over, the feet at 24, the roll, the turn)
  const toWorld = (v, point) => {
    let lx = -v[0] * k, ly = ((point ? 24 : 0) - v[1]) * k, lz = v[2] * k;
    if (roll) { const nx = lx * cr - ly * sr; ly = lx * sr + ly * cr; lx = nx; }
    return [(point ? x : 0) + lx * cy + lz * sy, (point ? y : 0) + ly, (point ? z : 0) - lx * sy + lz * cy];
  };
  return {at: toWorld(fist, true), ax: [0, 1, 2].map(i => toWorld([R[i], R[3 + i], R[6 + i]], false))};
}

// ---------- our own skins ----------
// a sign's wood, as its planks are: [the board's, the post's (darker)]
const SIGN_COLORS = {oak: ['#b8945f', '#6e5236'], spruce: ['#82603a', '#4a3520'], birch: ['#d7c185', '#9a8456'], jungle: ['#b88764', '#6a4a30'], acacia: ['#ba6337', '#6a3a22'],
  dark_oak: ['#4f3218', '#2c1d0e'], mangrove: ['#773934', '#45201c'], cherry: ['#e2b2a8', '#8c5a52'], bamboo: ['#d6c25a', '#8a7a2e']};
/** Ours: a sign of a wood: the board's faces in plank colour, its edge darker, a seam across it; the post darker. */
export function ownSign(wood) {
  const [wd, post] = SIGN_COLORS[wood] || SIGN_COLORS.oak;
  return skin(64, 32, 131 + Object.keys(SIGN_COLORS).indexOf(wood), ({area, box}) => {
    const shades = k => [shadeHex(wd, k), shadeHex(wd, k * 0.94), shadeHex(wd, k * 1.05)];
    box(0, 0, 24, 12, 2, shades(1)); box(0, 14, 2, 14, 2, [post, shadeHex(post, 0.9), shadeHex(post, 1.08)]);
    for (const [fx, fy] of [[2, 2], [28, 2]]) {
      const edge = [shadeHex(wd, 0.62)];
      area(fx, fy, 24, 1, edge, 0.1); area(fx, fy + 11, 24, 1, edge, 0.1); area(fx, fy, 1, 12, edge, 0.1); area(fx + 23, fy, 1, 12, edge, 0.1);
      area(fx + 1, fy + 6, 22, 1, [shadeHex(wd, 0.8)], 0.08);
    }
  });
}
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
  slime: () => skin(64, 32, 25, ({area, box, front, px, hex}) => {
    box(0, 0, 8, 8, 8, ['#6fbf4f', '#78c858', '#68b448', '#80d060']);
    const [fx, fy] = front(0, 0, 8, 8);
    area(fx + 1, fy + 2, 2, 2, ['#2e5a24']); area(fx + 5, fy + 2, 2, 2, ['#2e5a24']); px(fx + 4, fy + 5, hex('#2e5a24'));
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
// the sea's creatures (ours): painted into the game's layouts
Object.assign(OWN_SKINS, {
  squid: () => skin(64, 32, 71, ({px, area, box, front, hex}) => {
    const body = ['#2d4a6a', '#34547a', '#3a5c84', '#26405c'];
    box(0, 0, 12, 16, 12, body, 0.15); box(48, 0, 2, 18, 2, ['#2d4a6a', '#3a5c84', '#4a6c94'], 0.2);
    const [fx, fy] = front(0, 0, 12, 12);
    for (const ex of [2, 8]) { area(fx + ex, fy + 9, 2, 2, ['#e8e8e8']); px(fx + ex + 1, fy + 10, hex('#101010')); }
  }),
  glow_squid: () => skin(64, 32, 72, ({px, area, box, front, hex}) => {
    const body = ['#0d5a5a', '#127070', '#1a8080', '#0a4a4a'];
    box(0, 0, 12, 16, 12, body, 0.15); box(48, 0, 2, 18, 2, ['#1a8080', '#3ac8b0', '#5af0d0'], 0.2);
    for (let k = 0; k < 24; k++) px(1 + Math.floor((k * 37) % 46), 13 + Math.floor((k * 11) % 14), hex('#7af0d8'));
    const [fx, fy] = front(0, 0, 12, 12);
    for (const ex of [2, 8]) { area(fx + ex, fy + 9, 2, 2, ['#c8fff0']); px(fx + ex + 1, fy + 10, hex('#0a2a2a')); }
  }),
  cod: () => skin(32, 32, 73, ({px, area, box, hex}) => {
    const body = ['#b9a27c', '#c4ad86', '#a8916c'], belly = ['#e2d6bc'];
    box(0, 0, 2, 4, 7, body); box(11, 0, 2, 4, 3, body); box(0, 0, 2, 3, 1, body);
    area(0, 7 + 3, 18, 1, belly); area(22, 1, 4, 3, ['#8c7a58']); area(22, 4, 4, 3, ['#8c7a58']); area(22, 3, 8, 4, ['#9c8a62']); area(20, 0, 12, 1, ['#9c8a62']);
    px(14, 4, hex('#101010')); px(11, 4, hex('#101010'));
  }),
  salmon: () => skin(32, 32, 74, ({px, area, box, hex}) => {
    const body = ['#a8463a', '#b64a3a', '#c45a48'], belly = ['#e8a088'];
    box(0, 0, 3, 5, 8, body); box(0, 13, 3, 5, 8, body); box(22, 0, 2, 4, 3, ['#8a3a30', '#9a4236']);
    area(0, 12, 22, 1, belly); area(0, 25, 22, 1, belly); area(20, 10, 12, 11, ['#6e2a20', '#7a3226']); area(0, 0, 8, 6, ['#7a3226']);
    px(25, 4, hex('#101010')); px(22, 4, hex('#101010'));
  }),
  // white, so its colour comes from the tint: the body, its tail and fins a little greyer, an eye on each side
  tropical_fish: () => skin(32, 32, 75, ({px, area, box, hex}) => {
    box(0, 0, 2, 3, 6, ['#f4f4f4', '#ececec', '#ffffff']); area(22, 0, 10, 3, ['#e0e0e0']); area(10, 1, 12, 3, ['#e4e4e4']); area(2, 12, 4, 2, ['#e4e4e4']); area(2, 16, 4, 2, ['#e4e4e4']);
    px(4, 7, hex('#101010')); px(9, 7, hex('#101010'));
  }),
  pufferfish: () => skin(32, 32, 76, ({px, area, box, hex}) => {
    box(0, 27, 3, 2, 3, ['#e8c838', '#f0d24a', '#dcb82c']); box(24, 6, 1, 1, 1, ['#141414']); box(28, 6, 1, 1, 1, ['#141414']);
    area(0, 0, 9, 3, ['#d8b028']); area(25, 0, 6, 2, ['#d8b028']);
    for (const [x, y] of [[4, 29], [7, 30], [10, 29]]) px(x, y, hex('#6a8ab0'));
  }),
  turtle: () => skin(128, 64, 77, ({px, area, box, front, hex}) => {
    const skinC = ['#5a9a4a', '#4e8c40', '#66a656'], shell = ['#3a6a2a', '#447a32', '#4e8638', '#2e5a22'], belly = ['#c8c08a', '#bcb47e'];
    box(3, 0, 6, 5, 6, skinC); box(7, 37, 19, 20, 6, shell, 0.2); box(31, 1, 11, 18, 3, belly);
    box(1, 23, 4, 1, 10, skinC); box(1, 12, 4, 1, 10, skinC); box(27, 30, 13, 1, 5, skinC); box(27, 24, 13, 1, 5, skinC);
    // the shell's plates
    for (let k = 0; k < 6; k++) area(13 + (k % 3) * 6, 43 + Math.floor(k / 3) * 8, 1, 7, ['#24461a']);
    const [fx, fy] = front(3, 0, 6, 6);
    px(fx, fy + 1, hex('#141414')); px(fx + 5, fy + 1, hex('#141414'));
  }),
  guardian: () => guardianSkin(81, ['#5d8c7c', '#55806f', '#669888', '#4e7868'], ['#e07a3a', '#c86a2e', '#d4733a'], ['#3e6a5c', '#365e52']),
  elder_guardian: () => guardianSkin(82, ['#cfcbb8', '#c4c0ad', '#d9d5c2', '#bab6a3'], ['#7a7c98', '#6a6c88', '#86889e'], ['#9a9786', '#8e8b7a']),
  // ours: an enderman all near-black (a purple cast, shaded), its eyes purple; the eyes' picture only those
  enderman: () => skin(64, 32, 93, ({px, box, front, hex}) => {
    const black = ['#161616', '#1b1520', '#121212', '#1e1a22'];
    box(0, 0, 8, 8, 8, black); box(0, 16, 8, 8, 8, ['#0e0e10', '#141016']); box(32, 16, 8, 12, 4, black); box(56, 0, 2, 30, 2, black);
    const [fx, fy] = front(0, 0, 8, 8);
    for (const x of [fx + 1, fx + 2, fx + 5, fx + 6]) px(x, fy + 4, hex(x === fx + 2 || x === fx + 5 ? '#e079fa' : '#cc00fa'));
  }),
  enderman_eyes: () => skin(64, 32, 94, ({px, front, hex}) => {
    const [fx, fy] = front(0, 0, 8, 8);
    for (const x of [fx + 1, fx + 2, fx + 5, fx + 6]) px(x, fy + 4, hex(x === fx + 2 || x === fx + 5 ? '#f0a8ff' : '#e055ff'));
  }),
  // ours: a polar bear's white fur (a little creamy, shaded), a black nose and eyes, darker paws
  polar_bear: () => skin(128, 64, 89, ({px, area, box, front, hex}) => {
    const fur = ['#f2f1ea', '#e9e8df', '#f7f6f0', '#e2e1d6'];
    box(0, 0, 7, 7, 7, fur); box(0, 44, 5, 3, 3, fur); box(26, 0, 2, 2, 1, ['#dcdbd0']); box(0, 19, 14, 14, 11, fur); box(39, 0, 12, 12, 10, fur);
    box(50, 22, 4, 10, 8, fur); box(50, 40, 4, 10, 6, fur);
    area(62, 22, 4, 8, ['#b8b6aa']); area(60, 40, 4, 6, ['#b8b6aa']);
    const [fx, fy] = front(0, 0, 7, 7), [mx, my] = front(0, 44, 5, 3);
    px(fx + 1, fy + 2, hex('#111111')); px(fx + 5, fy + 2, hex('#111111'));
    area(mx + 1, my, 3, 1, ['#1a1a1a']); px(mx + 2, my + 2, hex('#3a3a3a'));
  }),
  // ours: a drowned's blue-green flesh, a torn sea-blue shirt, ragged trousers, bare shins and feet, pale glowing eyes
  drowned: () => skin(64, 64, 86, ({px, area, box, front, hex, r}) => {
    const flesh = ['#4f8c82', '#467f76', '#58968c', '#3f766d'], shirt = ['#4a7c86', '#43717a', '#52868f'], pants = ['#35506a', '#2f4860', '#3a5874'];
    box(0, 0, 8, 8, 8, flesh); box(16, 16, 8, 12, 4, shirt); box(40, 16, 4, 12, 4, flesh); box(32, 48, 4, 12, 4, flesh);
    box(0, 16, 4, 12, 4, pants); box(16, 48, 4, 12, 4, pants);
    for (let k = 0; k < 26; k++) px(16 + Math.floor(r() * 24), 20 + Math.floor(r() * 12), hex(flesh[k % 4]));
    for (const [u, v] of [[0, 16], [16, 48]]) { area(u, v + 11, 16, 5, flesh); area(u + 8, v, 4, 4, flesh); }
    const [fx, fy] = front(0, 0, 8, 8);
    area(fx + 1, fy + 3, 2, 1, ['#a8f0ff']); area(fx + 5, fy + 3, 2, 1, ['#a8f0ff']); area(fx + 2, fy + 6, 4, 1, ['#20403a']);
    px(fx + 1, fy + 2, hex('#2c5a52')); px(fx + 6, fy + 2, hex('#2c5a52'));
  }),
  // over it only weed — strands hanging down the head, body, arms and legs, some lying on the head — the rest clear
  drowned_outer: () => skin(64, 64, 87, ({px, hex, r}) => {
    const weed = ['#3e7a2c', '#4b8a36', '#335f24', '#5a9a40'];
    for (const [u, v, w, h, d, n] of [[0, 0, 8, 8, 8, 14], [16, 16, 8, 12, 4, 10], [40, 16, 4, 12, 4, 5], [32, 48, 4, 12, 4, 5], [0, 16, 4, 12, 4, 4], [16, 48, 4, 12, 4, 4]]) {
      for (let k = 0; k < n; k++) { const x = u + Math.floor(r() * 2 * (w + d)), len = 2 + Math.floor(r() * Math.min(h - 1, 6)); for (let y = 0; y < len; y++) px(x, v + d + y, hex(weed[(k + y) % 4])); }
    }
    for (let k = 0; k < 12; k++) px(8 + Math.floor(r() * 8), Math.floor(r() * 8), hex(weed[k % 4]));
  }),
  // ours: a dolphin blue-grey above, pale beneath (its belly, the underside of its beak and tail), dark eyes
  dolphin: () => skin(64, 64, 88, ({px, area, box, hex}) => {
    const back = ['#6c7d98', '#647590', '#7486a2'], belly = ['#cdd6e2', '#c4cdda', '#d6dee8'], fin = ['#5c6c86', '#566580'];
    box(22, 0, 8, 7, 13, back); box(0, 0, 8, 7, 6, back); box(0, 13, 2, 2, 4, back); box(0, 19, 4, 5, 11, back);
    box(19, 20, 10, 1, 6, fin); box(51, 0, 1, 4, 5, fin); box(48, 20, 1, 4, 7, fin);
    area(43, 0, 8, 13, belly); area(14, 0, 8, 6, belly); area(6, 13, 2, 4, belly); area(15, 19, 4, 11, belly);
    area(22, 17, 42, 3, belly); area(0, 11, 28, 2, belly); area(0, 33, 30, 2, belly); area(0, 18, 12, 1, belly);
    for (const x of [3, 16]) { px(x, 9, hex('#15171d')); px(x, 8, hex('#2a2e38')); px(x + (x === 3 ? 1 : -1), 9, hex('#1c1f27')); }
    px(4, 8, hex('#e8eef6')); px(15, 8, hex('#e8eef6'));
  }),
});
/** A guardian's skin (the game's 64×64 layout): its body in one colour with patches of another, a darker face round the
 *  eye, pale spikes with darker tips, the eye pink with a light glint, the tail striped with the patches' colour. */
function guardianSkin(seed, body, spots, face) {
  return skin(64, 64, seed, ({px, area, box, front, hex, r}) => {
    box(0, 0, 12, 12, 16, body); box(0, 28, 2, 12, 12, body); box(16, 40, 12, 2, 12, body);
    for (let k = 0; k < 16; k++) area(16 + Math.floor(r() * 46), Math.floor(r() * 26), 2 + Math.floor(r() * 2), 1 + Math.floor(r() * 2), spots);
    for (let k = 0; k < 8; k++) area(Math.floor(r() * 24), 40 + Math.floor(r() * 10), 2, 2, spots);
    // the face: darker round where the eye sits
    const [fx, fy] = front(0, 0, 12, 16);
    area(fx + 2, fy + 2, 8, 8, face);
    // spikes: pale, the tips darker
    box(0, 0, 2, 9, 2, ['#e8dcc0', '#dcd0b0', '#f0e6cc']);
    for (const x of [0, 2, 4, 6]) area(x, 2, 2, 2, ['#9a7a4a', '#8a6a3a']);
    // the eye
    box(8, 0, 2, 2, 1, ['#d84a5a', '#c83a4c']); px(9, 1, hex('#f8e0e4'));
    // the tail: body colour, ringed with the patches' colour; the fin
    box(40, 0, 4, 4, 8, body); box(0, 54, 3, 3, 7, body); box(41, 32, 2, 2, 6, body);
    for (const x of [42, 46, 54, 58]) area(x, 8, 1, 4, spots);
    for (const x of [2, 9, 13]) area(x, 61, 1, 3, spots);
    box(25, 19, 1, 9, 9, spots); area(25, 28, 9, 9, spots); area(35, 28, 9, 9, spots);
  });
}
// our tropical fish: the large body (white, tinted like the small one) and the twelve patterns (white where the pattern
// is, tinted with its colour; clear elsewhere) — on each body's sides (the head at the side's front edge), fins, tail
const FISH_PAINT = {
  a1: on => { on(3, 6, 3, 3); on(8, 6, 3, 3); on(10, 1, 12, 3); },
  a2: on => { on(0, 7, 6, 1); on(8, 7, 6, 1); on(22, 1, 10, 1); },
  a3: on => { on(6, 0, 2, 6); on(0, 6, 6, 1); on(8, 6, 6, 1); on(10, 1, 12, 3); },
  a4: on => { for (const u of [0, 2, 4, 9, 11, 13]) on(u, 6, 1, 3); },
  a5: on => { on(0, 8, 6, 1); on(8, 8, 6, 1); on(8, 0, 2, 6); on(2, 12, 4, 2); on(2, 16, 4, 2); },
  a6: on => { for (const [u, v] of [[1, 6], [3, 8], [5, 7], [9, 7], [11, 6], [13, 8], [23, 1], [25, 0], [29, 2], [30, 0]]) on(u, v); },
  b1: on => { on(0, 26, 3, 6); on(11, 26, 3, 6); on(21, 21, 10, 6); },
  b2: on => { for (const u of [0, 2, 4, 9, 11, 13]) on(u, 26, 1, 6); for (const u of [21, 23, 25, 27, 29, 31]) on(u, 17, 1, 4); },
  b3: on => { for (const [u, v] of [[1, 27], [4, 29], [2, 31], [5, 26], [9, 30], [12, 27], [10, 28], [13, 31], [22, 18], [28, 19], [23, 28], [29, 29]]) on(u, v); },
  b4: on => { on(3, 26, 3, 6); on(8, 26, 3, 6); on(20, 17, 12, 4); on(20, 27, 12, 4); },
  b5: on => { for (const v of [27, 30]) { on(0, v, 6, 1); on(8, v, 6, 1); } on(21, 22, 10, 1); on(21, 25, 10, 1); },
  b6: on => { for (const [u, v] of [[0, 27], [3, 29], [9, 26], [11, 29], [4, 26]]) on(u, v, 2, 2); on(20, 27, 12, 4); },
};
export const FISH_SKINS = ['tropical_fish_b', ...Object.keys(FISH_PAINT).map(k => `fish_${k}`)];
/** One of our tropical fish pictures by its name (FISH_SKINS). */
export function ownFishSkin(name) {
  if (name === 'tropical_fish_b') return skin(32, 32, 78, ({px, area, box, hex}) => {
    box(0, 20, 2, 6, 6, ['#f4f4f4', '#ececec', '#ffffff']); area(21, 21, 10, 6, ['#e0e0e0']); area(20, 17, 12, 4, ['#e4e4e4']); area(20, 27, 12, 4, ['#e4e4e4']);
    area(2, 12, 4, 2, ['#e4e4e4']); area(2, 16, 4, 2, ['#e4e4e4']); px(4, 27, hex('#101010')); px(9, 27, hex('#101010'));
  });
  return skin(32, 32, 79 + name.charCodeAt(5) * 7 + Number(name.slice(6)), ({px, r}) => {
    const on = (u, v, w = 1, h = 1) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = 236 + Math.floor(r() * 20); px(u + i, v + j, [k, k, k]); } };
    FISH_PAINT[name.slice(5)]?.(on);
  });
}
// the conduit (ours): a shell of pale plates with dark seams; a cage of prismarine bars round open windows; its eye
// open (a blue iris, a dark pupil, a glint) and shut; the water whirling round it (streaks, in four frames)
export const CONDUIT_SKINS = ['conduit_shell', 'conduit_cage', 'conduit_eye_open', 'conduit_eye_closed'];
export function ownConduitSkin(name) {
  if (name === 'conduit_shell') return skin(32, 16, 91, ({px, box, hex}) => {
    box(0, 0, 6, 6, 6, ['#a99a80', '#9a8b72', '#b3a48a']);
    for (let v = 0; v < 12; v++) for (let u = 0; u < 24; u++) if ((u % 3 === 2 || v % 3 === 2) && (v >= 6 || (u >= 6 && u < 18))) px(u, v, hex('#6e624e'));
  });
  if (name === 'conduit_cage') return skin(32, 16, 92, ({px, hex, r}) => {
    const bar = ['#5a9a8c', '#6aa898', '#4e8a7c', '#78b4a4'];
    const face = (u, v) => { for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (i === 0 || j === 0 || i === 7 || j === 7 || i === 3 || i === 4 || j === 3 || j === 4) px(u + i, v + j, hex(bar[Math.floor(r() * bar.length)])); };
    face(8, 0); face(16, 0); for (const u of [0, 8, 16, 24]) face(u, 8);
  });
  if (name === 'conduit_eye_open') return skin(16, 16, 93, ({px, hex}) => {
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const d = Math.hypot(i - 3.5, j - 3.5); if (d < 3.9) px(i, j, hex(d > 3 ? '#0b2a3a' : d > 1.6 ? '#2f8fd0' : '#0a1a2a')); }
    px(2, 2, hex('#cdf6ff'));
  });
  return skin(16, 16, 94, ({px, hex}) => { for (let i = 1; i < 7; i++) { px(i, 3, hex('#2a5a6a')); px(i, 4, hex('#0b2a3a')); } for (const i of [1, 3, 5]) px(i, 5, hex('#0b2a3a')); });
}
/** Our conduit's whirling water: four frames of light streaks going round it (64 × 32 each, the wind box's layout);
 *  the vertical one's streaks go slanting. */
export function ownWind(vertical) {
  return [0, 1, 2, 3].map(f => skin(64, 32, vertical ? 99 : 95, ({px, r}) => {
    for (let k = 0; k < 70; k++) {
      const len = 2 + Math.floor(r() * 4), y0 = Math.floor(r() * 32), x0 = Math.floor(r() * 64), shade = 210 + Math.floor(r() * 40);
      for (let i = 0; i < len; i++) px((x0 + i + f * 4) % 64, vertical ? (y0 + i) % 32 : y0, [shade - 30, shade, 255], 200);
    }
  }));
}
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
// our boat skins: each wood's planks, boards along the hull, a darker inside; paddles of the same wood with a dark blade
const BOAT_WOOD = {oak: '#b8945f', spruce: '#7a5a34', birch: '#c5b77b', jungle: '#a07351', acacia: '#a95a31', dark_oak: '#4c3220', mangrove: '#773634', cherry: '#e2b2aa', bamboo: '#c8ae4e'};
/** Our skin for a boat of a wood (bamboo: the raft), with a chest or not, in the game's layout. */
export function ownBoat(wood, withChest) {
  const c = BOAT_WOOD[wood] || BOAT_WOOD.oak, raft = wood === 'bamboo';
  return skin(128, withChest ? 128 : 64, 61 + wood.length * 7 + (withChest ? 3 : 0), ({area, box}) => {
    const pal = [c, shadeHex(c, 0.95), shadeHex(c, 1.05)], seam = [shadeHex(c, 0.7), shadeHex(c, 0.66)], inside = [shadeHex(c, 0.8), shadeHex(c, 0.76)];
    const boards = (u, v, w, h, step) => { for (let y = v + step - 1; y < v + h; y += step) area(u, y, w, 1, seam); };
    if (raft) {
      box(0, 0, 28, 20, 4, pal, 0.14); box(0, 0, 28, 16, 4, pal, 0.14);
      for (let x = 3; x < 64; x += 4) area(x, 4, 1, 20, seam);
    } else {
      box(0, 0, 28, 16, 3, inside, 0.12); boards(0, 3, 62, 16, 4);
      for (const [u, v, w] of [[0, 19, 18], [0, 27, 16], [0, 35, 28], [0, 43, 28]]) { box(u, v, w, 6, 2, pal, 0.14); boards(u, v + 2, 2 * (w + 2), 6, 3); }
    }
    const handle = [shadeHex(c, 0.9), shadeHex(c, 0.85)], blade = [shadeHex(c, 0.62), shadeHex(c, 0.58)];
    for (const [u, v] of raft ? [[0, 24], [40, 24]] : [[62, 0], [62, 20]]) { box(u, v, 2, 2, 18, handle, 0.1); box(u, v, 1, 6, 7, blade, 0.1); }
    if (withChest) {
      const wood2 = ['#a87a3a', '#9e7234', '#b08240'], rim = ['#6e4a1e'];
      box(0, 76, 12, 8, 12, wood2, 0.12); area(0, 88, 48, 1, rim); box(0, 59, 12, 4, 12, wood2, 0.12); area(0, 74, 48, 1, rim);
      box(0, 59, 2, 4, 1, ['#d8d8d8', '#c4c4c4']);
    }
  });
}
export const MOB_KINDS = Object.keys(MODELS).filter(k => k !== 'sheep_wool' && k !== 'drowned_outer' && k !== 'player');
// our armour pictures, one per material and layer (1: helmet, chestplate, boots; 2: leggings), only where it is worn
const ARMOR_PAL = {turtle: ['#4a9a3a', '#56a644', '#3e8a30', '#62b250'], leather: ['#8f5530', '#9c5e36', '#a8683c', '#7e4a29'], chainmail: ['#8a8a8a', '#a2a2a2', '#6e6e6e', '#b8b8b8'], iron: ['#c6c6c6', '#d4d4d4', '#b8b8b8', '#e2e2e2'],
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
