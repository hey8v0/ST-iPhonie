import {btn, esc} from './common.js';
import {icon} from './icons.js';

const PARTS = [['hips', '骨盆'], ['spine', '躯干'], ['head', '头'], ...['left', 'right'].flatMap((side, index) =>
  [['UpperArm', '上臂'], ['LowerArm', '前臂'], ['UpperLeg', '大腿'], ['LowerLeg', '小腿']].map(([part, label]) => [side + part, (index ? '右' : '左') + label]))];
const radians = deg => deg * Math.PI / 180;

/** A small articulated mannequin. The same ellipsoid mesh is instanced for each part. */
function mannequin(win) {
  const vertices = [], faces = [], rows = 12, columns = 16;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= columns; c++) {
      const a = Math.PI * r / rows, b = 2 * Math.PI * c / columns;
      vertices.push(Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b));
      if (r < rows && c < columns) {
        const i = r * (columns + 1) + c, j = i + columns + 1;
        faces.push(i, i + 1, j, j, i + 1, j + 1);
      }
    }
  }
  const xyz = Float32Array.from(vertices), indexes = Uint16Array.from(faces);
  const binary = new Uint8Array(xyz.byteLength + indexes.byteLength);
  binary.set(new Uint8Array(xyz.buffer)); binary.set(new Uint8Array(indexes.buffer), xyz.byteLength);
  const nodes = [];
  const joint = (name, parent, translation) => {
    const index = nodes.push({name, translation, children: []}) - 1;
    if (parent >= 0) nodes[parent].children.push(index);
    return index;
  };
  const piece = (parent, translation, scale, mesh = 0) => {
    nodes[parent].children.push(nodes.length);
    nodes.push({translation, scale, mesh});
  };
  const hips = joint('hips', -1, [0, 1.04, 0]), spine = joint('spine', hips, [0, .09, 0]);
  const head = joint('head', spine, [0, .51, 0]);
  piece(hips, [0, 0, 0], [.2, .14, .104]);
  piece(spine, [0, .19, 0], [.205, .28, .11]);
  piece(head, [0, .095, 0], [.105, .145, .105], 1);
  piece(head, [0, .082, .088], [.038, .06, .038], 1);
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const arm = joint(side + 'UpperArm', spine, [sign * .225, .349, 0]);
    const forearm = joint(side + 'LowerArm', arm, [0, -.288, 0]);
    const leg = joint(side + 'UpperLeg', hips, [sign * .104, -.09, 0]);
    const shin = joint(side + 'LowerLeg', leg, [0, -.44, 0]);
    piece(arm, [0, -.13, 0], [.065, .169, .068], 1);
    piece(forearm, [0, -.12, 0], [.052, .155, .054]);
    piece(forearm, [0, -.29, 0], [.049, .085, .04], 1);
    piece(leg, [0, -.211, 0], [.087, .242, .088]);
    piece(shin, [0, -.207, 0], [.064, .235, .069], 1);
    piece(shin, [0, -.426, .051], [.075, .047, .126]);
  }
  return {
    asset: {version: '2.0'}, scenes: [{nodes: [hips]}], nodes,
    buffers: [{byteLength: binary.length, uri: 'data:application/octet-stream;base64,' + win.btoa(Array.from(binary, b => String.fromCharCode(b)).join(''))}],
    bufferViews: [{buffer: 0, byteLength: xyz.byteLength, target: 34962}, {buffer: 0, byteOffset: xyz.byteLength, byteLength: indexes.byteLength, target: 34963}],
    accessors: [{bufferView: 0, componentType: 5126, count: xyz.length / 3, type: 'VEC3', min: [-1, -1, -1], max: [1, 1, 1]}, {bufferView: 1, componentType: 5123, count: indexes.length, type: 'SCALAR'}],
    materials: [[.28, .48, .69, 1], [.5, .68, .86, 1]].map(baseColorFactor => ({pbrMetallicRoughness: {baseColorFactor, metallicFactor: 0, roughnessFactor: .78}, doubleSided: true})),
    meshes: [0, 1].map(material => ({primitives: [{attributes: {POSITION: 0, NORMAL: 0}, indices: 1, material}]}))
  };
}
const STANDING = {leftUpperArm: [0, 0, 13], rightUpperArm: [0, 0, -13]};
const POSES = {
  standing: STANDING,
  waving: {...STANDING, leftUpperArm: [-10, 0, 73], leftLowerArm: [0, 0, 83], head: [1, 12, -7]},
  walking: {head: [4, -7, 0], spine: [5, 8, 0], leftUpperArm: [30, 0, 11], rightUpperArm: [-26, 0, -9], leftLowerArm: [-25, 0, 0], rightLowerArm: [-48, 0, 0], leftUpperLeg: [-32, 0, 0], rightUpperLeg: [23, 0, 0], rightLowerLeg: [43, 0, 0]},
  sitting: {...STANDING, leftUpperLeg: [-86, 0, 5], rightUpperLeg: [-86, 0, -5], leftLowerLeg: [88, 0, 0], rightLowerLeg: [88, 0, 0], leftLowerArm: [-55, 0, 0], rightLowerArm: [-55, 0, 0]}
};

/** GLB and VRM are self-contained binary glTF files. Open only embedded resources. */
function modelBytes(bytes) {
  const header = new DataView(bytes);
  if (bytes.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(16, true) !== 0x4e4f534a) throw Error('请选择 VRM 或内嵌素材的 GLB 文件');
  const length = header.getUint32(12, true);
  if (length > bytes.byteLength - 20) throw Error('模型文件不完整');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)).replace(/\0+$/, ''));
  if ([...(json.images || []), ...(json.buffers || [])].some(item => item.uri && !item.uri.startsWith('data:'))) throw Error('模型引用了外部文件，请导出为内嵌素材的 GLB');
  return bytes;
}

export async function poseSheet(ctx, {width, height, base, use}) {
  const T = await import('../vendor/vrm.js');
  const loader = new T.GLTFLoader();
  loader.register(parser => new T.VRMLoaderPlugin(parser));
  const builtin = await loader.parseAsync(mannequin(ctx.win), '');
  const ranges = list => list.map(([key, label, min, max, value]) => `<label class="field"><span>${label}<output>${value}</output></span><input class="slider" data-pose-range="${key}" type="range" min="${min}" max="${max}" value="${value}"></label>`).join('');
  const d = ctx.dialog('3D 摆姿', `<div class="draw-pose-preview"><canvas aria-label="姿势预览，可拖动旋转视角"></canvas></div>
    <div class="draw-pose-files"><label class="secondary file-button">${icon('import')}导入模型<input data-pose-file type="file" accept=".vrm,.glb" aria-label="导入 VRM 或 GLB"></label>${btn('pose-reset', '换回人偶', 'text-button', 'hidden')}</div>
    <p class="hint" data-pose-note role="status">可导入 VRM 或内嵌素材的 GLB。</p>
    <label class="field draw-pose-wide" data-pose-presets><span>预设姿势</span><span class="select"><select data-pose-preset><option value="">自定义</option><option value="standing">站立</option><option value="waving">挥手</option><option value="walking">走路</option><option value="sitting">坐姿</option></select></span></label>
    <div class="segmented draw-pose-switch" role="group" aria-label="调整 3D 姿势"><button type="button" data-pose-tab="camera" aria-pressed="true">视角</button><button type="button" data-pose-tab="joints" aria-pressed="false">关节</button></div>
    <div class="draw-pose-controls" data-pose-panel="camera">
      ${ranges([['yaw','旋转',-180,180,20],['pitch','俯仰',-65,65,5],['zoom','远近',60,200,100]])}
    </div>
    <div class="draw-pose-controls" data-pose-panel="joints" hidden>
      <label class="field draw-pose-wide"><span>部位</span><span class="select"><select data-pose-bone></select></span></label>
      ${ranges([['x','前后',-160,160,0],['y','转动',-160,160,0],['z','左右',-160,160,0]])}
    </div>`);
  const footer = ctx.doc.createElement('div');
  const preview = d.body.querySelector('.draw-pose-preview');
  d.body.before(preview);
  footer.className = 'draw-pose-footer';
  footer.innerHTML = btn('pose-use', icon('paint') + '放到画布', 'primary');
  d.body.after(footer);
  const canvas = preview.querySelector('canvas'), file = d.body.querySelector('[data-pose-file]'), note = d.body.querySelector('[data-pose-note]');
  const bones = d.body.querySelector('[data-pose-bone]'), preset = d.body.querySelector('[data-pose-preset]');
  const useButton = footer.querySelector('button'), reset = d.body.querySelector('[data-action=pose-reset]');
  const fields = Object.fromEntries([...d.body.querySelectorAll('[data-pose-range]')].map(el => [el.dataset.poseRange, el]));
  let renderer;
  try { renderer = new T.WebGLRenderer({canvas, alpha: true, antialias: true, preserveDrawingBuffer: true}); }
  catch { d.close(); T.VRMUtils.deepDispose(builtin.scene); throw Error('这个设备没有可用的 WebGL，3D 摆姿打不开'); }
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.setClearColor(0, 0);
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(29, width / height, .01, 100);
  const sun = new T.DirectionalLight(0xffffff, 2);
  sun.position.set(2, 4, 5);
  scene.add(sun, new T.AmbientLight(0xffffff, 1.25));
  const backdrop = base && ctx.win.URL.createObjectURL(base);
  if (backdrop) canvas.style.backgroundImage = `url(${backdrop})`;
  canvas.style.aspectRatio = `${width}/${height}`;
  let active, joints, aim, distance, loadTicket = 0, frame = 0, pointer;
  const view = () => {
    frame = 0;
    const yaw = radians(Number(fields.yaw.value)), pitch = radians(Number(fields.pitch.value)), radius = distance * 100 / Number(fields.zoom.value);
    camera.position.set(aim.x + radius * Math.sin(yaw) * Math.cos(pitch), aim.y + radius * Math.sin(pitch), aim.z + radius * Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(aim);
    active.userData.vrm?.update(0);
    renderer.render(scene, camera);
  };
  const previewScale = Math.min(1, 600 / Math.max(width, height));
  renderer.setSize(Math.round(width * previewScale) || 1, Math.round(height * previewScale) || 1, false);
  const schedule = () => { if (!frame) frame = ctx.win.requestAnimationFrame(view); };
  function set(el, value) {
    el.value = value;
    el.previousElementSibling.querySelector('output').textContent = el.value;
  }
  function syncBone() {
    const j = joints.get(bones.value);
    for (const axis of ['x', 'y', 'z']) {
      fields[axis].disabled = !j;
      set(fields[axis], j ? Math.round((j.node.rotation[axis] - j.rest[axis]) * 180 / Math.PI) : 0);
    }
  }
  function applyPose(name) {
    for (const [key, joint] of joints) {
      const [x, y, z] = POSES[name]?.[key] || [0, 0, 0];
      joint.node.rotation.set(joint.rest.x + radians(x), joint.rest.y + radians(y), joint.rest.z + radians(z));
    }
    syncBone();
    schedule();
  }
  function setModel(model) {
    if (active) {
      scene.remove(active.scene);
      if (active !== builtin) T.VRMUtils.deepDispose(active.scene);
    }
    active = model;
    const {scene: body, userData: {vrm}} = model;
    scene.add(body);
    const box = new T.Box3().setFromObject(body), size = box.getSize(new T.Vector3());
    aim = box.getCenter(new T.Vector3());
    distance = Math.min(50, Math.max(.1, Math.max(size.y, size.x / camera.aspect, size.z) * 2.35));
    joints = new Map();
    if (model === builtin || vrm) {
      for (const [key, label] of PARTS) {
        const node = vrm ? vrm.humanoid?.getNormalizedBoneNode(key) : body.getObjectByName(key);
        if (node) joints.set(key, {label, node, rest: node.rotation.clone()});
      }
    } else body.traverse(node => { if (node.isBone) joints.set(node.uuid, {label: node.name || '骨骼', node, rest: node.rotation.clone()}); });
    bones.innerHTML = joints.size ? [...joints].map(([key, j]) => `<option value="${esc(key)}">${esc(j.label)}</option>`).join('') : '<option>模型没有可调骨骼</option>';
    bones.disabled = !joints.size;
    preset.closest('[data-pose-presets]').hidden = model !== builtin;
    preset.value = model === builtin ? 'standing' : '';
    reset.hidden = model === builtin;
    if (model === builtin) applyPose('standing');
    else { syncBone(); schedule(); }
  }
  setModel(builtin);
  // Capture the built-in rig's rest pose before applying presets again after an import.
  const rest = new Map([...joints].map(([key, j]) => [key, j.rest]));
  reset.addEventListener('click', () => {
    loadTicket++;
    for (const [key, value] of rest) builtin.scene.getObjectByName(key).rotation.copy(value);
    setModel(builtin);
    note.textContent = '可导入 VRM 或内嵌素材的 GLB。';
    useButton.disabled = false;
  });
  file.addEventListener('change', async () => {
    const model = file.files?.[0];
    file.value = '';
    if (!model) return;
    const ticket = ++loadTicket;
    useButton.disabled = true;
    note.textContent = '正在打开模型…';
    try {
      if (model.size > 40 * 1024 * 1024) throw Error('模型请控制在 40 MB 以内');
      const next = await loader.parseAsync(modelBytes(await model.arrayBuffer()), '');
      if (!d.live || ticket !== loadTicket) { T.VRMUtils.deepDispose(next.scene); return; }
      if (next.userData.vrm) T.VRMUtils.rotateVRM0(next.userData.vrm);
      setModel(next);
      note.textContent = model.name;
    } catch (error) { if (d.live && ticket === loadTicket) note.textContent = error.message || '模型打不开'; }
    finally { if (d.live && ticket === loadTicket) useButton.disabled = false; }
  });
  bones.addEventListener('change', syncBone);
  preset.addEventListener('change', () => { if (preset.value) applyPose(preset.value); });
  for (const tab of d.body.querySelectorAll('[data-pose-tab]')) tab.addEventListener('click', () => {
    for (const button of d.body.querySelectorAll('[data-pose-tab]')) button.setAttribute('aria-pressed', String(button === tab));
    for (const panel of d.body.querySelectorAll('[data-pose-panel]')) panel.hidden = panel.dataset.posePanel !== tab.dataset.poseTab;
  });
  d.body.addEventListener('input', event => {
    const axis = event.target.dataset.poseRange;
    if (!axis) return;
    set(fields[axis], fields[axis].value);
    if (['x', 'y', 'z'].includes(axis)) {
      const joint = joints.get(bones.value);
      if (joint) joint.node.rotation[axis] = joint.rest[axis] + radians(Number(fields[axis].value));
      preset.value = '';
    }
    schedule();
  });
  canvas.addEventListener('pointerdown', event => {
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY, yaw: Number(fields.yaw.value), pitch: Number(fields.pitch.value)};
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    set(fields.yaw, ((Math.round(pointer.yaw + (pointer.x - event.clientX) * 1.1) + 540) % 360 + 360) % 360 - 180);
    set(fields.pitch, Math.min(65, Math.max(-65, Math.round(pointer.pitch + (event.clientY - pointer.y) * .5))));
    schedule();
  });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; });
  useButton.addEventListener('click', async () => {
    useButton.disabled = true;
    file.disabled = true;
    try {
      if (frame) ctx.win.cancelAnimationFrame(frame);
      renderer.setSize(width, height, false);
      view();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('姿势图没有生成');
      if (d.live) { d.close(); use(blob); }
    } catch (error) { if (d.live) { ctx.notify(error.message, {error: true}); useButton.disabled = file.disabled = false; } }
  });
  d.onClose(() => {
    if (frame) ctx.win.cancelAnimationFrame(frame);
    if (backdrop) ctx.win.URL.revokeObjectURL(backdrop);
    if (active !== builtin) T.VRMUtils.deepDispose(active.scene);
    T.VRMUtils.deepDispose(builtin.scene);
    renderer.dispose();
    renderer.forceContextLoss();
  });
}
