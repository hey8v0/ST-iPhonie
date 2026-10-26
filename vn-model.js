// 视觉小说的模型: a character on the stage as a VRM or Live2D model in place of the 立绘. Each one draws on a canvas of
// its own (vendor/: three.js + three-vrm, PixiJS + pixi-live2d-display, read only when a model is shown). It breathes
// and blinks by itself, takes the face of each line's 情绪 (a VRM's own expressions; a Live2D model's 表情 and 动作 as
// set or guessed from their names), and moves its mouth with the voice (vowels from its sound) or, without a voice,
// with the text as it is typed. The same actor is used by the stage (vn-stage.js) and the preview in the phone.
import {readZip, cleanPath, live2dInfo, live2dSettings, expressionParams, VRM_FACES, VRM_POSES, LIVE2D_FACES, live2dMap, feelingFor, VOWELS} from './core/model-files.js';
import {visualEmotion} from './core/visual-emotion.js';
import {moveById, samplePose, VRM_REST} from './core/model-moves.js';

const VENDOR = new URL('./vendor/', import.meta.url);
const C4_CORE = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
const C2_CORE = 'gh/dylanNew/live2d@fd9fd400845e9a00bb194fdac0b6635c753a1e8a/webgl/Live2D/lib/live2d.min.js';
const C2_HOSTS = ['https://cdn.jsdelivr.net/', 'https://fastly.jsdelivr.net/', 'https://gcore.jsdelivr.net/', 'https://testingcf.jsdelivr.net/'];
const C2_SRI = 'sha384-LWrKEMeBVbWko3WFDXTIBDN5SpFKepeYUI2JE6It+qbq+F+2NvN2QDO2J8H+8Y+O';
/** The canvas's shape for each 取景 (width / height). */
const SHAPE = {vrm: {half: .62, full: .42, face: .86}, live2d: {half: .7, full: .5, face: .86}};

// ---------- files ----------
const files = new Map();
/** A model's file from the tavern, kept while the page is open (the last four). */
export function modelBytes(path) {
  const key = String(path || '').replace(/^\/?/, '/');
  if (!files.has(key)) {
    const job = fetch(key, {cache: 'force-cache'}).then(r => {
      if (!r.ok) throw Error(r.status === 404 ? '酒馆里找不到这个模型文件了，请重新上传' : `模型文件读不出来（${r.status}）`);
      return r.arrayBuffer();
    });
    job.catch(() => files.delete(key));
    files.set(key, job);
    while (files.size > 4) files.delete(files.keys().next().value);
  }
  return files.get(key);
}
export const forgetModelBytes = path => files.delete(String(path || '').replace(/^\/?/, '/'));

const scripts = new Map();
function script(src, integrity = '') {
  if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; }
    s.onload = resolve;
    s.onerror = () => { scripts.delete(src); s.remove(); reject(Error('load')); };
    document.head.append(s);
  }));
  return scripts.get(src);
}
/** Live2D's own runtime (not ours to hand out): Cubism 3/4's from Live2D's site, Cubism 2's from jsDelivr, checked. */
async function cubism(version) {
  if (version === '2') {
    if (globalThis.Live2D) return;
    for (const host of C2_HOSTS) { try { await script(host + C2_CORE, C2_SRI); if (globalThis.Live2D) return; } catch {} }
    throw Error('没能读到 Cubism 2 的运行核心（从 jsDelivr），检查一下网络再试');
  }
  if (globalThis.Live2DCubismCore) return;
  try { await script(C4_CORE); } catch {}
  if (!globalThis.Live2DCubismCore) throw Error('没能从 Live2D 官网读到 Cubism 运行核心，检查一下能不能打开 cubism.live2d.com');
}

// ---------- the actor ----------
const smooth = (from, to, rate, dt) => from + (to - from) * Math.min(1, dt * rate);
const lite = () => !!globalThis.matchMedia?.('(pointer: coarse)').matches || (globalThis.navigator?.hardwareConcurrency || 8) <= 4;

/**
 * A model to put on a stage: {canvas, kind, feel(emotion), mouth(shape | null), tick(dt, speaking), frame(entry),
 * dispose()}. entry: the cast entry's model (core/model-files.js normalizeModel); bytes: its file. The canvas sizes
 * itself to the height it is given (CSS) and keeps the shape of its 取景.
 */
export async function createModelActor(entry, bytes, {light = lite()} = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'vn-model';
  canvas.setAttribute('aria-hidden', 'true');
  const body = entry.kind === 'vrm' ? await vrmBody(canvas, entry, bytes, light) : await live2dBody(canvas, entry, bytes, light);
  let w = 0, h = 0, shape = 0, since = 1, emotion = null, open = 0;
  const target = {open: 0, aa: 0, ih: 0, ou: 0, ee: 0, oh: 0}, now = {...target};
  const ratio = () => Math.min(globalThis.devicePixelRatio || 1, light ? 1.5 : 2);
  function fit() {
    const s = body.shape?.(entry.frame) || SHAPE[entry.kind][entry.frame] || SHAPE[entry.kind].half;
    if (s !== shape) { shape = s; canvas.style.aspectRatio = String(s); }
    const ch = canvas.clientHeight, cw = Math.round(ch * s);
    if (!ch || cw === w && ch === h) return;
    w = cw; h = ch;
    body.size(w, h, ratio());
  }
  return {
    canvas, kind: entry.kind,
    /** The 情绪 of a line as written (「强忍着眼泪」, '' = none): the face it has, eased in. */
    feel(value) { const v = visualEmotion(value || ''); if (v !== emotion) { emotion = v; body.feel(v); } },
    /**
     * A 动作 (core/model-moves.js): {id} a built-in one; {id, vrma: bytes} a VRM motion file; {id, motion: 'group:index'}
     * a Live2D model's own. Plays once, then back to standing; a new one takes over. at: held still at that second.
     */
    async act(spec) {
      if (!spec) return;
      // A motion file in the tavern: read once, then kept like the models.
      if (spec.path && !spec.vrma) spec = {...spec, vrma: await modelBytes(spec.path)};
      return body.act(spec);
    },
    /** The mouth now (core/model-files.js mouthShape / typedMouth), or null: shut. */
    mouth(shape) { for (const k of ['open', ...VOWELS]) target[k] = shape?.[k] || 0; },
    /** One frame: dt seconds since the last. Not speaking, it draws less often (30 or 15 a second). */
    tick(dt, speaking = true) {
      since += dt;
      for (const k of ['open', ...VOWELS]) now[k] = smooth(now[k], target[k], target[k] > now[k] ? 30 : 16, dt);
      open = now.open;
      if (since < (speaking ? light ? 1 / 40 : 0 : light ? 1 / 15 : 1 / 30)) return;
      fit();
      if (w && h) body.draw(since, now, open);
      since = 0;
    },
    /** The 取景 / size / height changed (the preview's sliders). */
    frame(next) { Object.assign(entry, next); shape = 0; w = h = 0; body.frame(entry); fit(); },
    info: body.info,
    dispose() { try { body.dispose(); } catch {} canvas.remove(); },
  };
}

// ---------- VRM ----------
async function vrmBody(canvas, entry, bytes, light) {
  const T = await import(new URL('vrm.js', VENDOR).href);
  const renderer = new T.WebGLRenderer({canvas, alpha: true, antialias: !light, powerPreference: 'default'});
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(20, .62, .05, 30);
  const sun = new T.DirectionalLight(0xffffff, Math.PI * .9);
  sun.position.set(.6, 1, 1.2).normalize();
  scene.add(sun, new T.AmbientLight(0xffffff, .45));
  const loader = new T.GLTFLoader();
  loader.register(parser => new T.VRMLoaderPlugin(parser));
  let gltf;
  try { gltf = await loader.parseAsync(bytes.slice(0), ''); } catch (error) { renderer.dispose(); throw Error('VRM 读不出来：' + (error?.message || error)); }
  const vrm = gltf.userData.vrm;
  if (!vrm) { renderer.dispose(); throw Error('这个文件里没有 VRM 模型'); }
  T.VRMUtils.removeUnnecessaryVertices(gltf.scene);
  (T.VRMUtils.combineSkeletons || T.VRMUtils.removeUnnecessaryJoints)?.(gltf.scene);
  T.VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse(o => { o.frustumCulled = false; });
  scene.add(vrm.scene);
  const bone = name => vrm.humanoid?.getNormalizedBoneNode(name) || null;
  // Its own names for the expressions (VRM 0.x models name 惊讶 「Surprised」 and the like themselves).
  const names = new Map();
  for (const e of vrm.expressionManager?.expressions || []) names.set(e.expressionName.toLowerCase(), e.expressionName);
  const has = n => names.has(String(n).toLowerCase());
  const set = (n, v) => { const real = names.get(String(n).toLowerCase()); if (real) vrm.expressionManager.setValue(real, v); };
  // Arms down from the T pose; a VRM 0.x model's normalized bones turn the other way.
  const side = entry.version === '0' ? -1 : 1, turn = r => [r[0] * side, r[1], r[2] * side];
  for (const [n, r] of Object.entries(VRM_REST)) bone(n)?.rotation.set(...turn(r));
  vrm.update(0);
  scene.updateMatrixWorld(true);
  const at = name => { const b = bone(name); return b ? b.getWorldPosition(new T.Vector3()).y : null; };
  const box = new T.Box3().setFromObject(vrm.scene), top = box.max.y, bottom = box.min.y;
  const head = at('head') ?? top * .9, hips = at('hips') ?? top * .53, neck = at('neck') ?? head - .08;
  // Where the eyes look: the camera, a little down, or away.
  const gaze = new T.Object3D();
  scene.add(gaze);
  if (vrm.lookAt) { vrm.lookAt.target = gaze; vrm.lookAt.autoUpdate = true; }
  let aspect = .62;
  function frame(e) {
    const f = e.frame || 'half', zoom = e.zoom || 1, lift = e.lift || 0;
    const [hi, lo] = f === 'face' ? [top + .03, neck - (top - neck) * .55] : f === 'full' ? [top + .04, bottom - .03] : [top + .03, hips - (top - hips) * .42];
    const span = (hi - lo) / zoom, mid = (hi + lo) / 2 + (hi - lo) * (1 - 1 / zoom) / 2 - lift * span;
    camera.fov = 20;
    camera.position.set(0, mid, span / 2 / Math.tan(camera.fov * Math.PI / 360));
    camera.lookAt(0, mid, 0);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  frame(entry);
  const face = {}, pose = {head: [0, 0, 0], lean: 0, eyes: ''}, held = {head: [0, 0, 0], lean: 0};
  let faceTarget = {}, t = 0, blinkAt = 2 + Math.random() * 3, blink = 0;
  // 动作: a built-in one (bone poses over time) or a motion file (.vrma, played by three's mixer); one at a time.
  let acting = null, mixer = null;
  const clips = new Map();
  async function clipOf(id, bytes) {
    if (!clips.has(id)) clips.set(id, (async () => {
      const loader = new T.GLTFLoader();
      loader.register(parser => new T.VRMAnimationLoaderPlugin(parser));
      const gltf = await loader.parseAsync(bytes.slice(0), '');
      const anim = gltf.userData.vrmAnimations?.[0];
      if (!anim) throw Error('这个文件里没有 VRM 动作');
      return T.createVRMAnimationClip(anim, vrm);
    })());
    return clips.get(id);
  }
  const fade = (t, end) => Math.min(1, t / .25, Math.max(0, end - t) / .3);
  function poseNow(dt) {
    if (!acting?.move) return;
    if (!acting.still) acting.t += dt;
    const {pose, done} = samplePose(acting.move, acting.t, 'vrm');
    if (done) { acting = null; vrm.scene.position.y = 0; return; }
    const w = fade(acting.t, acting.move.vrm.keys.at(-1)[0]);
    for (const [name, value] of Object.entries(pose)) {
      if (name === 'lift') { vrm.scene.position.y = value * w; continue; }
      const b = bone(name);
      if (!b) continue;
      const to = turn(value), r = b.rotation;
      r.set(r.x + (to[0] - r.x) * w, r.y + (to[1] - r.y) * w, r.z + (to[2] - r.z) * w);
    }
  }
  return {
    info: {expressions: [...names.values()]},
    size(w, h, ratio) { renderer.setPixelRatio(ratio); renderer.setSize(w, h, false); aspect = w / h; frame(entry); },
    frame,
    async act(spec) {
      if (spec.vrma) {
        const clip = await clipOf(spec.id, spec.vrma);
        mixer ??= new T.AnimationMixer(vrm.scene);
        mixer.stopAllAction();
        acting = null; vrm.scene.position.y = 0;
        const action = mixer.clipAction(clip);
        action.setLoop(T.LoopOnce, 1);
        action.clampWhenFinished = false;
        action.reset().fadeIn(.3).play();
        const out = Math.max(0, clip.duration - .35) * 1000;
        setTimeout(() => { if (action.isRunning()) action.fadeOut(.35); }, out);
        return;
      }
      const move = moveById(spec.id);
      if (!move?.vrm) return;
      mixer?.stopAllAction();
      acting = {move, t: spec.at ?? 0, still: spec.at != null};
    },
    feel(emotion) {
      const id = feelingFor(emotion, k => !!VRM_FACES[k] && Object.keys(VRM_FACES[k]).some(has)) || (VRM_FACES[emotion] ? emotion : '');
      faceTarget = {...(VRM_FACES[id] || {})};
      const p = VRM_POSES[id] || {};
      pose.head = p.head || [0, 0, 0]; pose.lean = p.lean || 0; pose.eyes = p.eyes || '';
    },
    draw(dt, mouth, open) {
      t += dt;
      // The face eases toward the 情绪's; the mouth's vowels go on top.
      for (const k of new Set([...Object.keys(face), ...Object.keys(faceTarget)])) { face[k] = smooth(face[k] || 0, faceTarget[k] || 0, 5, dt); set(k, face[k]); }
      const shut = Math.max(0, 1 - (face.happy || 0) * .6);
      for (const v of VOWELS) set(v, Math.min(1, (mouth[v] || 0) * 1.1 * shut));
      if (!VOWELS.some(has)) set('aa', open);
      // A blink every few seconds (less when smiling, as the eyes are half shut).
      blinkAt -= dt;
      if (blinkAt <= 0) { blink += dt; if (blink > .16) { blink = 0; blinkAt = 2.2 + Math.random() * 3.8; } }
      set('blink', blink ? Math.sin(blink / .16 * Math.PI) * (1 - (face.happy || 0) * .7) : 0);
      // Breathing, a slow sway, a nod while talking; the head and body ease into the 情绪's pose.
      for (let i = 0; i < 3; i++) held.head[i] = smooth(held.head[i], pose.head[i], 3, dt);
      held.lean = smooth(held.lean, pose.lean, 3, dt);
      const breath = Math.sin(t * 1.7), h = bone('head'), n = bone('neck'), chest = bone('chest') || bone('upperChest'), spine = bone('spine');
      if (h) h.rotation.set(held.head[0] * .7 + Math.sin(t * .7) * .02 + open * .035, held.head[1] * .7 + Math.sin(t * .43) * .04, held.head[2] * .7 + Math.sin(t * .31) * .015);
      if (n) n.rotation.set(held.head[0] * .3, held.head[1] * .3, held.head[2] * .3);
      if (chest) chest.rotation.x = breath * .012;
      if (spine) spine.rotation.set(held.lean + breath * .006, Math.sin(t * .37) * .015, 0);
      const ua = .02 * breath;
      for (const [n, r] of Object.entries(VRM_REST)) bone(n)?.rotation.set(...turn(r));
      bone('leftUpperArm')?.rotation.set(0, 0, (-1.2 + ua) * side);
      bone('rightUpperArm')?.rotation.set(0, 0, (1.2 - ua) * side);
      for (const n of ['leftShoulder', 'rightShoulder']) bone(n)?.rotation.set(0, 0, 0);
      poseNow(dt);
      mixer?.update(dt);
      const eyes = pose.eyes;
      gaze.position.set(camera.position.x + (eyes === 'away' ? -.6 : 0), camera.position.y + (eyes === 'down' ? -.5 : 0) + Math.sin(t * .5) * .02, camera.position.z);
      vrm.update(dt);
      renderer.render(scene, camera);
    },
    dispose() {
      T.VRMUtils.deepDispose?.(vrm.scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}

// ---------- Live2D ----------
/** The standard parameters, by Cubism 3/4 and Cubism 2 name. */
const PARAMS = {
  angleX: ['ParamAngleX', 'PARAM_ANGLE_X'], angleY: ['ParamAngleY', 'PARAM_ANGLE_Y'], angleZ: ['ParamAngleZ', 'PARAM_ANGLE_Z'], body: ['ParamBodyAngleX', 'PARAM_BODY_ANGLE_X'],
  bodyY: ['ParamBodyAngleY', 'PARAM_BODY_ANGLE_Y'], bodyZ: ['ParamBodyAngleZ', 'PARAM_BODY_ANGLE_Z'],
  eyeL: ['ParamEyeLOpen', 'PARAM_EYE_L_OPEN'], eyeR: ['ParamEyeROpen', 'PARAM_EYE_R_OPEN'], smileL: ['ParamEyeLSmile', 'PARAM_EYE_L_SMILE'], smileR: ['ParamEyeRSmile', 'PARAM_EYE_R_SMILE'],
  ballX: ['ParamEyeBallX', 'PARAM_EYE_BALL_X'], ballY: ['ParamEyeBallY', 'PARAM_EYE_BALL_Y'],
  browLY: ['ParamBrowLY', 'PARAM_BROW_L_Y'], browRY: ['ParamBrowRY', 'PARAM_BROW_R_Y'], browLA: ['ParamBrowLAngle', 'PARAM_BROW_L_ANGLE'], browRA: ['ParamBrowRAngle', 'PARAM_BROW_R_ANGLE'],
  browLF: ['ParamBrowLForm', 'PARAM_BROW_L_FORM'], browRF: ['ParamBrowRForm', 'PARAM_BROW_R_FORM'],
  form: ['ParamMouthForm', 'PARAM_MOUTH_FORM'], open: ['ParamMouthOpenY', 'PARAM_MOUTH_OPEN_Y'], cheek: ['ParamCheek', 'PARAM_CHEEK'],
};
/**
 * The one renderer the Live2D models of a runtime share: the library keeps its shaders for one WebGL context, so a
 * second model on a canvas of its own draws nothing. Each model is drawn here and copied onto its own canvas.
 */
const renderers = new Map();
function sharedRenderer(L, light) {
  let s = renderers.get(L);
  if (!s) {
    const view = document.createElement('canvas');
    // Kept for the page once made (a new context would leave the library's shaders behind on the old one).
    s = {renderer: new L.Renderer({view, backgroundAlpha: 0, antialias: !light, width: 10, height: 10, resolution: 1, autoDensity: false}), users: 0, release() { s.users--; }};
    renderers.set(L, s);
  }
  s.users++;
  return s;
}
/**
 * Cubism 3/4 models alive on the page. Live2D's runtime grows its memory when a model is loaded, and the models loaded
 * before keep reading and writing the old copy: their 表情 and mouth do nothing any more (a 捏人 model falls back to its
 * plain look). After each load they are pointed at the memory in use again.
 */
const cubismModels = new Set();
function rewire() {
  const C = globalThis.Live2DCubismCore;
  if (!C) return;
  for (const cm of cubismModels) {
    try {
      const m = cm.getModel(), now = new C.Parameters(m._ptr);
      if (now.values.buffer === m.parameters.values.buffer) continue;
      m.parameters = now; m.parts = new C.Parts(m._ptr); m.drawables = new C.Drawables(m._ptr);
      cm._parameterValues = m.parameters.values; cm._partOpacities = m.parts.opacities;
      cm._parameterMaximumValues = m.parameters.maximumValues; cm._parameterMinimumValues = m.parameters.minimumValues;
    } catch {}
  }
}
/** The 取景 of a Live2D model in its own pixels: {full, half, face} as {x0, y0, x1, y1}. */
function measure(im, core, four, id, natural, look = () => {}) {
  // The parameters touched here, as they were, put back one by one afterwards.
  const touched = ['angleX', 'eyeL', 'eyeR', 'open'].map(k => { try { return [id(k), four ? core.getParameterValueById(id(k)) : core.getParamFloat(id(k))]; } catch { return null; } }).filter(Boolean);
  try { if (four) core.saveParameters(); else core.saveParam(); } catch {}
  const back = () => { try { if (four) core.loadParameters(); else core.loadParam(); for (const [p, v] of touched) if (four) core.setParameterValueById(p, v); else core.setParamFloat(p, v); } catch {} };
  // Each time from the model as it was, with its look on (a 捏人 model's 「我的」 hides its watermark, for one).
  const pose = (values = {}) => { back(); try { look(); for (const [k, v] of Object.entries(values)) { if (four) core.setParameterValueById(id(k), v); else core.setParamFloat(id(k), v); } core.update(); } catch {} };
  const drawn = i => { try { return !four || core.getDrawableDynamicFlagIsVisible(i) && core.getDrawableOpacity(i) >= .05; } catch { return true; } };
  const grow = (b, v) => { for (let k = 0; k < v.length; k += 2) { b.x0 = Math.min(b.x0, v[k]); b.x1 = Math.max(b.x1, v[k]); b.y0 = Math.min(b.y0, v[k + 1]); b.y1 = Math.max(b.y1, v[k + 1]); } };
  const empty = () => ({x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity}), ok = b => b.x1 > b.x0 && b.y1 > b.y0;
  const all = empty(), head = empty(), eyes = empty(), mouth = empty();
  try {
    const n = im.getDrawableIDs().length, shot = () => Array.from({length: n}, (_, i) => im.getDrawableVertices(i));
    const moved = (a, b, i) => { let m = 0; for (let k = 0; k < a[i].length; k++) m += Math.abs(b[i][k] - a[i][k]); return m / a[i].length; };
    pose({eyeL: 1, eyeR: 1, open: 0});
    const still = shot(), shown = still.map((_, i) => drawn(i));
    pose({angleX: 30, eyeL: 1, eyeR: 1, open: 0});
    const turned = shot();
    pose({eyeL: 0, eyeR: 0, open: 0});
    const shut = shot();
    pose({eyeL: 1, eyeR: 1, open: 1});
    const talking = shot();
    still.forEach((v, i) => {
      if (!shown[i]) return;
      grow(all, v);
      if (moved(still, turned, i) > 1.5) grow(head, v);
      if (moved(still, shut, i) > .5) grow(eyes, v);
      if (moved(still, talking, i) > .5) grow(mouth, talking[i]);
    });
  } catch {}
  back();
  try { core.update(); } catch {}
  const full = ok(all) ? all : {x0: 0, y0: 0, x1: natural.w, y1: natural.h};
  const share = p => ({...full, y1: full.y0 + (full.y1 - full.y0) * p});
  // The face from where its eyes and mouth are, the top of the head from what turns with it (not its long hair's ends).
  if (!ok(eyes) || !ok(mouth) || mouth.y1 <= eyes.y0) return {full, half: share(.62), face: share(.36)};
  const top = ok(head) ? Math.min(head.y0, eyes.y0) : full.y0, eyeY = (eyes.y0 + eyes.y1) / 2, cx = (eyes.x0 + eyes.x1) / 2;
  const chin = Math.min(full.y1, mouth.y1 + (mouth.y1 - eyeY) * .45), tall = chin - top;
  const side = w => ({x0: cx - w / 2, x1: cx + w / 2});
  const face = {...side(Math.max((eyes.x1 - eyes.x0) * 1.9, tall * .9)), y0: top - tall * .04, y1: Math.min(full.y1, chin + tall * .12)};
  const end = Math.min(full.y1, top + tall * 2.7);
  const half = {...side(Math.min(full.x1 - full.x0, (end - top) * .72)), y0: top - tall * .04, y1: end};
  return {full, half, face};
}
async function live2dBody(canvas, entry, bytes, light) {
  const zip = readZip(bytes), info = await live2dInfo(zip);
  await cubism(info.version);
  const L = await import(new URL(info.version === '2' ? 'live2d-2.js' : 'live2d-4.js', VENDOR).href);
  L.config.logLevel = L.config.LOG_LEVEL_ERROR ?? 2;
  const urls = new Map();
  await Promise.all([...zip].map(async ([path, f]) => urls.set(path, URL.createObjectURL(new Blob([await f.bytes()])))));
  const free = () => { for (const u of urls.values()) URL.revokeObjectURL(u); };
  const four = info.version === '4';
  // The 表情 kept on (the model's look) are put on by hand each frame: the library shows one 表情 at a time.
  const files = new Map([...((four ? info.json.FileReferences.Expressions : info.json.expressions) || []).map(x => [four ? x.Name : x.name, four ? x.File : x.file]), ...info.extra.map(x => [x.name, x.file])]);
  const dir = info.settings.includes('/') ? info.settings.slice(0, info.settings.lastIndexOf('/') + 1) : '';
  async function looks(names) {
    const out = [];
    for (const n of names) {
      const file = files.get(n), f = file && (zip.get(cleanPath(dir + file)) || [...zip].find(([k]) => k.toLowerCase() === cleanPath(dir + file).toLowerCase())?.[1]);
      if (!f) continue;
      try { out.push(...expressionParams(JSON.parse(new TextDecoder().decode(await f.bytes()).replace(/^﻿/, '')))); } catch {}
    }
    return out;
  }
  let keep = Array.isArray(entry.keep) ? entry.keep : info.keep, base = await looks(keep);
  let model, shared;
  try {
    // The files are blob: URLs already; the library's own joining of paths would break them (blob:http//…).
    const settings = new L.ModelSettings(live2dSettings(info, zip, p => urls.get(p)));
    settings.resolveURL = path => path;
    model = await L.Live2DModel.from(settings, {autoUpdate: false, autoHitTest: false, autoFocus: false});
    shared = sharedRenderer(L, light);
  } catch (error) { free(); throw Error('Live2D 模型读不出来：' + (error?.message || error)); }
  const stage = new L.Container();
  stage.addChild(model);
  const core = model.internalModel.coreModel, id = k => PARAMS[k][four ? 0 : 1];
  if (four) { cubismModels.add(core); rewire(); }
  const lips = four ? (info.json.Groups || []).find(g => g.Name === 'LipSync')?.Ids || [] : [];
  const OPEN = lips.length ? lips : [id('open')];
  const add = (p, v) => { try { if (four) core.addParameterValueById(p, v); else core.addToParamFloat(p, v); } catch {} };
  const mul = (p, v) => { try { if (four) core.multiplyParameterValueById(p, v); else core.multParamFloat(p, v); } catch {} };
  const put = (p, v) => { try { if (four) core.setParameterValueById(p, v); else core.setParamFloat(p, v); } catch {} };
  // What is drawn each frame on top of the model's own movement: its look, the 情绪's face, a blink, the mouth.
  const face = {}, now = {};
  let mouth = null, talking = 0, t = 0, blinkAt = 2 + Math.random() * 3, blink = 0, acting = null, moving = {};
  // Its arms, where it has parameters for them (official samples: ParamArmRA …; 捏人 models: 右手 / Rhand …).
  const arms = {};
  try {
    const ids = core._parameterIds || [], names = {};
    const cdi = four && info.json.FileReferences.DisplayInfo && zip.get(cleanPath(dir + info.json.FileReferences.DisplayInfo));
    if (cdi) for (const x of JSON.parse(new TextDecoder().decode(await cdi.bytes()).replace(/^﻿/, '')).Parameters || []) names[x.Id] = String(x.Name || '');
    const find = (byId, byName) => ids.find(i => byId.test(i)) || ids.find(i => byName.test(names[i] || ''));
    for (const [k, byId, byName] of [['armR', /^(ParamArmR[A]?|PARAM_ARM_R[_A]*|Rhand|RightArm|ParamHandR)$/i, /^(右手|右臂|右腕|右胳膊)/], ['armL', /^(ParamArmL[A]?|PARAM_ARM_L[_A]*|Lhand|LeftArm|ParamHandL)$/i, /^(左手|左臂|左腕|左胳膊)/]]) {
      const pid = find(byId, byName);
      if (!pid) continue;
      const i = ids.indexOf(pid), span = four ? (core.getParameterMaximumValue(i) - core.getParameterMinimumValue(i)) / 2 : 1;
      if (span > 0) arms[k] = {id: pid, span};
    }
  } catch {}
  const wear = () => { for (const x of base) (x.blend === 'multiply' ? mul : x.blend === 'set' ? put : add)(x.id, x.value); };
  model.internalModel.on('beforeModelUpdate', () => {
    wear();
    // A 动作 of the head and body, on top of the rest.
    // (armR / armL: its arm parameters if it has any, -1 … 1 of their range; a name that is not a standard one is the
    // model's own parameter: a 动作 made for that model.)
    for (const [k, v] of Object.entries(moving)) {
      if (k === 'lift' || !v) continue;
      if (k === 'armR' || k === 'armL') { const a = arms[k]; if (a) add(a.id, v * a.span); continue; }
      add(PARAMS[k] ? id(k) : k, v);
    }
    const f = now;
    if (f.angleX) add(id('angleX'), f.angleX);
    if (f.angleY || talking) add(id('angleY'), (f.angleY || 0) + talking * 4);
    if (f.angleZ) add(id('angleZ'), f.angleZ);
    if (f.eyeBallX) add(id('ballX'), f.eyeBallX);
    if (f.eyeBallY) add(id('ballY'), f.eyeBallY);
    if (f.browY) { add(id('browLY'), f.browY); add(id('browRY'), f.browY); }
    if (f.browAngle) { add(id('browLA'), f.browAngle); add(id('browRA'), f.browAngle); }
    if (f.browForm) { add(id('browLF'), f.browForm); add(id('browRF'), f.browForm); }
    if (f.eyeSmile) { add(id('smileL'), f.eyeSmile); add(id('smileR'), f.eyeSmile); }
    if (f.cheek) add(id('cheek'), f.cheek);
    const eyes = (1 + (f.eyeOpen || 0)) * (blink ? 1 - Math.sin(blink / .16 * Math.PI) : 1);
    if (Math.abs(eyes - 1) > .01) { mul(id('eyeL'), eyes); mul(id('eyeR'), eyes); }
    const m = mouth || {open: 0, ih: 0, ee: 0, ou: 0, oh: 0}, open = Math.min(1, m.open * 1.15);
    if (open > .01 || talking > .01) {
      for (const p of OPEN) put(p, Math.max(open, f.mouthOpen || 0));
      put(id('form'), Math.max(-1, Math.min(1, (f.mouthForm || 0) * .5 + ((m.ih + m.ee) - (m.ou + m.oh) * .8) / Math.max(.15, m.open))));
    } else {
      if (f.mouthOpen) for (const p of OPEN) add(p, f.mouthOpen);
      if (f.mouthForm) add(id('form'), f.mouthForm);
    }
  });
  const natural = {w: model.width / (model.scale.x || 1), h: model.height / (model.scale.y || 1)};
  // Where the model is really drawn (its canvas often has room all round), and where its head is (what moves when
  // it turns its head): the 取景 is cut from these, so a big-headed chibi and a tall one both fit.
  const frames = measure(model.internalModel, core, four, id, natural, wear);
  let W = 10, H = 10, R = 1, map = {}, baseY = 0;
  const paint = canvas.getContext('2d');
  function frame(e) {
    const r = frames[e.frame] || frames.half, zoom = e.zoom || 1, lift = e.lift || 0, span = (r.y1 - r.y0) * 1.06;
    const scale = H / span * zoom;
    model.scale.set(scale);
    model.anchor?.set(.5, 0);
    model.x = W / 2 - ((r.x0 + r.x1) / 2 - natural.w / 2) * scale;
    model.y = baseY = -r.y0 * scale + H * .03 - lift * H;
    map = live2dMap(info, e.map, keep);
    if (Array.isArray(e.keep) && JSON.stringify(e.keep) !== JSON.stringify(keep)) { keep = e.keep; looks(keep).then(list => { base = list; }); }
  }
  frame(entry);
  return {
    info: {expressions: info.expressions, motions: info.motions, version: info.version, keep},
    /** The canvas's shape for a 取景: as wide as the model is there. */
    shape: f => { const r = frames[f] || frames.half; return Math.min(1, Math.max(.4, (r.x1 - r.x0) / ((r.y1 - r.y0) * 1.06))); },
    size(w, h, ratio) { W = w; H = h; R = ratio; canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); frame(entry); },
    frame,
    act(spec) {
      // The model's own motion (made for it: arms and all), else the head and body from the standard parameters.
      if (spec.motion) { const at = spec.motion.lastIndexOf(':'); model.motion(spec.motion.slice(0, at), Number(spec.motion.slice(at + 1)) || 0, L.MotionPriority?.FORCE ?? 3); return; }
      const move = moveById(spec.id);
      if (move?.live2d) acting = {move, t: spec.at ?? 0, still: spec.at != null};
    },
    feel(emotion) {
      const id = feelingFor(emotion, k => !!map[k]), m = map[id];
      const expressions = model.internalModel.motionManager.expressionManager;
      if (m?.expression) model.expression(m.expression); else expressions?.resetExpression?.();
      if (m?.motion) { const at = m.motion.lastIndexOf(':'), group = m.motion.slice(0, at), index = Number(m.motion.slice(at + 1)) || 0; model.motion(group, index, L.MotionPriority?.NORMAL ?? 2); }
      // A 情绪 without a 表情 of the model's own: made from the standard parameters.
      Object.assign(face, Object.fromEntries(Object.keys(face).map(k => [k, 0])), m?.expression ? {} : LIVE2D_FACES[emotion] || {});
    },
    draw(dt, shape, open) {
      t += dt;
      mouth = shape; talking = open;
      for (const k of Object.keys(face)) now[k] = smooth(now[k] || 0, face[k], 5, dt);
      moving = {};
      if (acting) {
        if (!acting.still) acting.t += dt;
        const {pose, done} = samplePose(acting.move, acting.t, 'live2d');
        if (done) acting = null; else moving = pose;
      }
      model.y = baseY - (moving.lift || 0) * H;
      // Models made for face tracking do not blink by themselves.
      if (!info.blinks) { blinkAt -= dt; if (blinkAt <= 0) { blink += dt; if (blink > .16) { blink = 0; blinkAt = 2.2 + Math.random() * 3.8; } } }
      model.update(dt * 1000);
      // Drawn on the one renderer all Live2D models share, then copied onto this canvas.
      const r = shared.renderer;
      if (r.resolution !== R) r.resolution = R;
      if (r.screen.width !== W || r.screen.height !== H) r.resize(W, H);
      r.render(stage);
      paint.clearRect(0, 0, canvas.width, canvas.height);
      paint.drawImage(r.view, 0, 0, canvas.width, canvas.height);
    },
    dispose() { cubismModels.delete(core); model.destroy({children: true, texture: true, baseTexture: true}); shared.release(); free(); },
  };
}
