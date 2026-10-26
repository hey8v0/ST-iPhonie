// 视觉小说 模型的动作: what a VRM or Live2D model does when the story says so (挥手, 点头, 鞠躬, 抱臂 …). Each 动作 has
// words that bring it on (found in the story right around a line, the way a 立绘's 动作 is, core/vn.js actionFor) and
// how it is done: for VRM, poses of the humanoid bones over time (any VRM has the same bones, so these fit all of
// them); for Live2D, the standard parameters every model has (the head and body: nodding, turning, bowing). Arm
// gestures on a Live2D model need motions made for it, so there the model's own motions are used when they are named
// for it. A VRM can also take motion files (.vrma) the user adds. Pure data and sampling; vn-model.js plays them.

import {actionFor} from './vn.js';

/** The arms hanging down, the pose every VRM 动作 starts from and goes back to (VRM 1.0 bone directions). */
export const VRM_REST = Object.freeze({
  leftUpperArm: [0, 0, -1.2], rightUpperArm: [0, 0, 1.2], leftLowerArm: [0, -.25, -.12], rightLowerArm: [0, .25, .12], leftHand: [0, 0, -.1], rightHand: [0, 0, .1],
});
/** A pose for the right side, mirrored onto the left (x stays, y and z turn the other way). */
const both = pose => {
  const out = {...pose};
  for (const [bone, r] of Object.entries(pose)) if (bone.startsWith('right')) out['left' + bone.slice(5)] = [r[0], -r[1], -r[2]];
  return out;
};
const R = (x = 0, y = 0, z = 0) => [x, y, z];

/**
 * The built-in 动作. vrm: {keys: [[seconds, pose]], loop?: [from, to, times]} — a pose names bones ([x, y, z] radians,
 * VRM 1.0 directions; 'lift' is metres up); bones a 动作 does not name keep moving as they do. live2d: the same with
 * the standard parameters (angleX/Y/Z, body, bodyY, bodyZ in degrees; lift: share of the height up).
 */
export const MOVES = Object.freeze([
  {id: 'wave', label: '挥手', words: ['挥手', '招手', '摆手', '挥了挥手', '挥挥手', 'wave', 'waves', 'waving'],
    vrm: {keys: [[0, {}], [.35, {rightUpperArm: R(-.2, .35, .05), rightLowerArm: R(0, .3, -1.75), rightHand: R(0, 0, 0)}], [.6, {rightUpperArm: R(-.2, .35, .05), rightLowerArm: R(0, .3, -1.35), rightHand: R(0, 0, .2)}], [.85, {rightUpperArm: R(-.2, .35, .05), rightLowerArm: R(0, .3, -1.95), rightHand: R(0, 0, -.2)}], [1.1, {rightUpperArm: R(-.2, .35, .05), rightLowerArm: R(0, .3, -1.35), rightHand: R(0, 0, .2)}], [1.35, {rightUpperArm: R(-.2, .35, .05), rightLowerArm: R(0, .3, -1.95), rightHand: R(0, 0, -.2)}], [1.6, {rightUpperArm: R(-.2, .35, .05), rightLowerArm: R(0, .3, -1.6)}], [2, {}]]},
    live2d: {keys: [[0, {}], [.3, {armR: -1, angleZ: 6, body: 3}], [.55, {armR: -.25, angleZ: -2}], [.8, {armR: -1, angleZ: 6, body: 3}], [1.05, {armR: -.25, angleZ: -2}], [1.3, {armR: -1, angleZ: 6, body: 3}], [1.7, {}]]}},
  {id: 'nod', label: '点头', words: ['点头', '点了点头', '点点头', '颔首', 'nod', 'nods', 'nodding'],
    vrm: {keys: [[0, {}], [.2, {head: R(.28), neck: R(.08)}], [.45, {head: R(-.04)}], [.65, {head: R(.24), neck: R(.06)}], [.95, {}]]},
    live2d: {keys: [[0, {}], [.2, {angleY: -18}], [.45, {angleY: 4}], [.65, {angleY: -15}], [.95, {}]]}},
  {id: 'shake', label: '摇头', words: ['摇头', '摇了摇头', '摇摇头', 'shake her head', 'shakes her head', 'shake his head', 'shakes his head', 'shaking her head', 'shaking his head'],
    vrm: {keys: [[0, {}], [.18, {head: R(0, .35)}], [.4, {head: R(0, -.35)}], [.62, {head: R(0, .3)}], [.84, {head: R(0, -.2)}], [1.05, {}]]},
    live2d: {keys: [[0, {}], [.18, {angleX: 25}], [.4, {angleX: -25}], [.62, {angleX: 20}], [.84, {angleX: -12}], [1.05, {}]]}},
  {id: 'bow', label: '鞠躬', words: ['鞠躬', '鞠了一躬', '行礼', '欠身', '弯腰行礼', 'bow', 'bows', 'bowing'],
    vrm: {keys: [[0, {}], [.45, both({spine: R(.45), chest: R(.15), head: R(.2), rightUpperArm: R(-.15, 0, 1.25), rightLowerArm: R(0, .4, .1)})], [1.2, both({spine: R(.45), chest: R(.15), head: R(.2), rightUpperArm: R(-.15, 0, 1.25), rightLowerArm: R(0, .4, .1)})], [1.7, {}]]},
    live2d: {keys: [[0, {}], [.45, {angleY: -28, bodyY: -10}], [1.2, {angleY: -28, bodyY: -10}], [1.7, {}]]}},
  {id: 'hop', label: '蹦跳', words: ['跳起来', '蹦起来', '蹦了一下', '蹦蹦跳跳', '跳了起来', '雀跃', '蹦跶', 'jump', 'jumps', 'hop', 'hops', 'bounce'],
    vrm: {keys: [[0, {}], [.12, both({lift: 0, spine: R(.12), rightUpperArm: R(0, 0, 1.15)})], [.32, both({lift: .09, spine: R(-.05), rightUpperArm: R(0, 0, 1.05)})], [.5, both({lift: 0, spine: R(.1)})], [.68, both({lift: .06, rightUpperArm: R(0, 0, 1.08)})], [.85, {lift: 0}], [1.1, {}]]},
    live2d: {keys: [[0, {}], [.15, {lift: 0, angleY: -5, armR: -.3, armL: -.3}], [.32, {lift: .05, angleY: 6, armR: -.7, armL: -.7}], [.5, {lift: 0, armR: -.2, armL: -.2}], [.68, {lift: .03, armR: -.5, armL: -.5}], [.85, {lift: 0}], [1, {}]]}},
  {id: 'crossArms', label: '抱臂', words: ['抱臂', '抱着手臂', '抱起手臂', '抱起双臂', '双臂交叉', '双手抱胸', '环抱双臂', '抱胸', 'cross her arms', 'crosses her arms', 'crossed arms', 'arms crossed', 'folds her arms', 'folded arms'],
    vrm: {keys: [[0, {}], [0.45, both({rightUpperArm: R(-.2, .3, 1.1), rightLowerArm: R(0, 1.6, .6), rightHand: R(0, 0, 0), head: R(-.05, 0, .05)})], [2.6, both({rightUpperArm: R(-.2, .3, 1.1), rightLowerArm: R(0, 1.6, .6), rightHand: R(0, 0, 0), head: R(-.05, 0, .05)})], [3.1, {}]]},
    live2d: {keys: [[0, {}], [0.4, {armR: .9, armL: .9, angleY: 4, angleZ: -4, body: -3}], [2.4, {armR: .9, armL: .9, angleY: 4, angleZ: -4, body: -3}], [2.9, {}]]}},
  {id: 'handsHips', label: '叉腰', words: ['叉腰', '双手叉腰', '叉着腰', 'hands on her hips', 'hands on his hips', 'hands on hips'],
    vrm: {keys: [[0, {}], [0.45, both({rightUpperArm: R(.2, -.6, .6), rightLowerArm: R(0, .4, 1.4), rightHand: R(0, 0, 0), spine: R(-.05)})], [2.4, both({rightUpperArm: R(.2, -.6, .6), rightLowerArm: R(0, .4, 1.4), rightHand: R(0, 0, 0), spine: R(-.05)})], [2.9, {}]]},
    live2d: {keys: [[0, {}], [0.4, {armR: -.35, armL: -.35, angleY: 6, bodyY: 4}], [2.2, {armR: -.35, armL: -.35, angleY: 6, bodyY: 4}], [2.7, {}]]}},
  {id: 'coverMouth', label: '捂嘴', words: ['捂嘴', '捂住嘴', '掩嘴', '掩着嘴', '捂着嘴', '掩口', '偷笑', 'covers her mouth', 'cover her mouth', 'covering her mouth', 'hand over her mouth'],
    vrm: {keys: [[0, {}], [0.4, {rightUpperArm: R(-.62, .35, 1.1), rightLowerArm: R(0, 1.8, -.05), rightHand: R(0, 0, 0), head: R(.08, -.1)}], [1.8, {rightUpperArm: R(-.62, .35, 1.1), rightLowerArm: R(0, 1.8, -.05), rightHand: R(0, 0, 0), head: R(.08, -.1)}], [2.3, {}]]},
    live2d: {keys: [[0, {}], [0.3, {armR: 1, angleY: -6, angleZ: 6}], [1.6, {armR: 1, angleY: -6, angleZ: 6}], [2, {}]]}},
  {id: 'point', label: '指着', words: ['指着', '指了指', '伸手一指', '指向', '用手指着', 'points at', 'pointing at', 'points to'],
    vrm: {keys: [[0, {}], [0.35, {rightUpperArm: R(-1.35, .1, 1.1), rightLowerArm: R(0, .1, 0), rightHand: R(0, 0, 0), head: R(0, -.12)}], [1.5, {rightUpperArm: R(-1.35, .1, 1.1), rightLowerArm: R(0, .1, 0), rightHand: R(0, 0, 0), head: R(0, -.12)}], [2, {}]]},
    live2d: {keys: [[0, {}], [.3, {angleX: -12, body: -5}], [1.3, {angleX: -12, body: -5}], [1.7, {}]]}},
  {id: 'shrug', label: '摊手', words: ['摊手', '摊了摊手', '耸肩', '耸了耸肩', '无奈地摊开手', 'shrug', 'shrugs', 'shrugged'],
    vrm: {keys: [[0, {}], [0.35, both({rightShoulder: R(0, 0, -.12), rightUpperArm: R(.2, 0, .8), rightLowerArm: R(0, 1.4, -.8), rightHand: R(0, 0, 0), head: R(-.04, 0, .18)})], [1.3, both({rightShoulder: R(0, 0, -.12), rightUpperArm: R(.2, 0, .8), rightLowerArm: R(0, 1.4, -.8), rightHand: R(0, 0, 0), head: R(-.04, 0, .18)})], [1.8, {}]]},
    live2d: {keys: [[0, {}], [0.3, {armR: -.6, armL: -.6, angleZ: 14, bodyZ: 3}], [1.2, {armR: -.6, armL: -.6, angleZ: 14, bodyZ: 3}], [1.6, {}]]}},
  {id: 'cheer', label: '举起双手', words: ['举起双手', '举起手', '高举双手', '欢呼', '万岁', '举手', 'raises her hands', 'raises both hands', 'cheers', 'cheering'],
    vrm: {keys: [[0, {}], [.35, both({rightUpperArm: R(-.3, .3, -.55), rightLowerArm: R(0, .3, -.6), spine: R(-.06)})], [.6, both({rightUpperArm: R(-.3, .3, -.45), rightLowerArm: R(0, .3, -.4), lift: .03})], [.85, both({rightUpperArm: R(-.3, .3, -.6), rightLowerArm: R(0, .3, -.65), lift: 0})], [1.6, both({rightUpperArm: R(-.3, .3, -.55), rightLowerArm: R(0, .3, -.6)})], [2.1, {}]]},
    live2d: {keys: [[0, {}], [.3, {armR: -1, armL: -1, angleY: 10, lift: .02}], [.6, {armR: -.8, armL: -.8, lift: 0}], [1.4, {armR: -1, armL: -1, angleY: 8}], [1.8, {}]]}},
  {id: 'think', label: '托腮', words: ['托腮', '托着下巴', '摸着下巴', '摸了摸下巴', '沉思', '思索', '若有所思', 'thinks', 'thinking', 'ponders', 'strokes her chin'],
    vrm: {keys: [[0, {}], [0.45, {rightUpperArm: R(-.66, .3, 1.1), rightLowerArm: R(0, 1.95, .05), rightHand: R(0, 0, 0), leftUpperArm: R(-.1, -.3, -1.1), leftLowerArm: R(0, -1.5, -.5), head: R(-.05, .1, .15)}], [2.6, {rightUpperArm: R(-.66, .3, 1.1), rightLowerArm: R(0, 1.95, .05), rightHand: R(0, 0, 0), leftUpperArm: R(-.1, -.3, -1.1), leftLowerArm: R(0, -1.5, -.5), head: R(-.05, .1, .15)}], [3.1, {}]]},
    live2d: {keys: [[0, {}], [0.45, {armR: .9, angleZ: 12, angleX: 8, angleY: 5}], [2.4, {armR: .9, angleZ: 12, angleX: 8, angleY: 5}], [2.9, {}]]}},
  {id: 'handChest', label: '手放胸口', words: ['按住胸口', '捂着胸口', '手放在胸口', '手按在胸前', '抚着胸口', '捂住心口', 'hand on her chest', 'hand over her heart', 'clutches her chest'],
    vrm: {keys: [[0, {}], [0.4, {rightUpperArm: R(-.3, .3, 1.1), rightLowerArm: R(0, 1.7, .2), rightHand: R(0, 0, 0), head: R(.1)}], [2, {rightUpperArm: R(-.3, .3, 1.1), rightLowerArm: R(0, 1.7, .2), rightHand: R(0, 0, 0), head: R(.1)}], [2.5, {}]]},
    live2d: {keys: [[0, {}], [0.4, {armR: .8, angleY: -8}], [1.8, {armR: .8, angleY: -8}], [2.2, {}]]}},
  {id: 'coverFace', label: '捂脸', words: ['捂脸', '捂住脸', '双手捂脸', '捂着脸', '遮住脸', 'covers her face', 'covering her face', 'hides her face'],
    vrm: {keys: [[0, {}], [0.4, both({rightUpperArm: R(-.8, .3, 1.1), rightLowerArm: R(0, 1.6, 0), rightHand: R(0, 0, 0), head: R(.2), spine: R(.08)})], [2, both({rightUpperArm: R(-.8, .3, 1.1), rightLowerArm: R(0, 1.6, 0), rightHand: R(0, 0, 0), head: R(.2), spine: R(.08)})], [2.5, {}]]},
    live2d: {keys: [[0, {}], [0.35, {armR: 1, armL: 1, angleY: -20, angleX: -10, bodyY: -5}], [1.8, {armR: 1, armL: 1, angleY: -20, angleX: -10, bodyY: -5}], [2.2, {}]]}},
  {id: 'lookAway', label: '别过脸', words: ['别过脸', '别过头', '扭过头', '转过头去', '撇过头', '扭头', 'looks away', 'turns away', 'turned away'],
    vrm: {keys: [[0, {}], [.4, {head: R(.08, -.55, .05), neck: R(0, -.2), spine: R(0, -.12)}], [1.8, {head: R(.08, -.55, .05), neck: R(0, -.2), spine: R(0, -.12)}], [2.3, {}]]},
    live2d: {keys: [[0, {}], [.35, {angleX: -28, angleY: -6, body: -8}], [1.7, {angleX: -28, angleY: -6, body: -8}], [2.1, {}]]}},
  {id: 'tilt', label: '歪头', words: ['歪头', '歪了歪头', '歪着头', '偏了偏头', 'tilts her head', 'tilts his head', 'head tilted'],
    vrm: {keys: [[0, {}], [.35, {head: R(0, .05, .32), neck: R(0, 0, .08)}], [1.4, {head: R(0, .05, .32), neck: R(0, 0, .08)}], [1.8, {}]]},
    live2d: {keys: [[0, {}], [.3, {angleZ: 22, angleX: 5}], [1.3, {angleZ: 22, angleX: 5}], [1.7, {}]]}},
]);
export const moveById = id => MOVES.find(m => m.id === id) || null;

const ease = t => t * t * (3 - 2 * t);
/**
 * Where a 动作 is at time t (seconds): {pose, done} — each thing it names, eased between its keys (a thing a key does
 * not name is at rest there: the arms hanging, the rest zero). part: 'vrm' or 'live2d'.
 */
export function samplePose(move, t, part = 'vrm') {
  const keys = move?.[part]?.keys;
  if (!keys?.length) return {pose: {}, done: true};
  const end = keys.at(-1)[0];
  if (t >= end) return {pose: {}, done: true};
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1], k = ease(Math.min(1, Math.max(0, (t - t0) / Math.max(1e-6, t1 - t0))));
  const names = new Set(keys.flatMap(([, p]) => Object.keys(p))), pose = {};
  const rest = name => part === 'vrm' ? (name === 'lift' ? 0 : VRM_REST[name] || [0, 0, 0]) : 0;
  for (const name of names) {
    const from = a[name] ?? rest(name), to = b[name] ?? rest(name);
    pose[name] = Array.isArray(from) ? from.map((v, n) => v + (to[n] - v) * k) : from + (to - from) * k;
  }
  return {pose, done: false};
}

/**
 * The 动作 a line brings, from the story right around it (the words of the built-in ones, then the user's): {id,
 * label, word, where} or null. extra: more 动作 ([{id, label, words}], a VRM's motion files or a Live2D model's own).
 * A user's 动作 named like a built-in one (their words) go first.
 */
export function moveFor({emotion = '', context = '', after = '', name = '', names = []} = {}, extra = []) {
  const all = [...(extra || []).filter(a => a?.words?.length), ...MOVES];
  const hit = actionFor(all, {emotion: '', context, after, name, names});
  void emotion;
  return hit ? {id: hit.action.id, label: hit.action.label, word: hit.word, where: hit.where} : null;
}
