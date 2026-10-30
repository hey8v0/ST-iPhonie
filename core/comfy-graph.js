// What the plugin understands of a ComfyUI workflow, so that nobody has to edit one by hand: the forms a workflow comes
// in (API JSON, the editor's own JSON, a picture ComfyUI saved), which node takes the prompt, the size, the steps…,
// every node's values for the phone, and switching nodes off. Pure: no requests and no settings here.
export const isLink = v => Array.isArray(v) && v.length === 2 && (typeof v[0] === 'string' || typeof v[0] === 'number') && Number.isInteger(v[1]) && v[1] >= 0;
const isGraph = data => !!data && typeof data === 'object' && !Array.isArray(data) && Object.values(data).some(n => n && typeof n === 'object' && typeof n.class_type === 'string');
const graphOf = text => { const graph = typeof text === 'string' ? JSON.parse(text) : text; if (!graph || typeof graph !== 'object' || Array.isArray(graph)) throw Error('工作流格式不对'); return graph; };
const titleOf = (node, id, spec) => `${nameOf(node, spec)} #${id}`;
// Node names as ComfyUI's Chinese interface has them, for the nodes nearly every workflow is made of.
const NODE_NAMES = {CheckpointLoaderSimple: 'Checkpoint加载器（简易）', CheckpointLoader: 'Checkpoint加载器', UNETLoader: 'UNet加载器', UnetLoaderGGUF: 'UNet加载器（GGUF）', CLIPLoader: '加载CLIP', DualCLIPLoader: '双CLIP加载器', TripleCLIPLoader: '三CLIP加载器', VAELoader: '加载VAE', CLIPSetLastLayer: '设置CLIP最后一层', CLIPTextEncode: 'CLIP文本编码', CLIPTextEncodeSDXL: 'CLIP文本编码（SDXL）', CLIPTextEncodeFlux: 'CLIP文本编码（Flux）', ConditioningCombine: '条件合并', ConditioningZeroOut: '条件零化', ConditioningSetArea: '条件采样区域', FluxGuidance: 'Flux引导', KSampler: 'K采样器', KSamplerAdvanced: 'K采样器（高级）', SamplerCustom: '自定义采样器', SamplerCustomAdvanced: '自定义采样器（高级）', KSamplerSelect: 'K采样器选择', BasicScheduler: '基础调度器', BasicGuider: '基础引导器', CFGGuider: 'CFG引导器', RandomNoise: '随机噪波', EmptyLatentImage: '空Latent图像', EmptySD3LatentImage: '空Latent图像（SD3）', LatentUpscale: 'Latent缩放', LatentUpscaleBy: 'Latent按系数缩放', VAEDecode: 'VAE解码', VAEDecodeTiled: 'VAE解码（分块）', VAEEncode: 'VAE编码', ImageScale: '图像缩放', ImageScaleBy: '图像按系数缩放', UpscaleModelLoader: '放大模型加载器', ImageUpscaleWithModel: '使用模型放大图像', LoadImage: '加载图像', SaveImage: '保存图像', PreviewImage: '预览图像', ControlNetLoader: 'ControlNet加载器', ControlNetApply: '应用ControlNet', ControlNetApplyAdvanced: '应用ControlNet（高级）', ModelSamplingAuraFlow: '采样算法（AuraFlow）', ModelSamplingDiscrete: '采样算法（离散）', ModelSamplingFlux: '采样算法（Flux）', ModelSamplingSD3: '采样算法（SD3）'};
/** A title the user gave stays (any title in Chinese is theirs or their interface's); ComfyUI's English default does not. */
function nameOf(node, spec) {
  const title = node?._meta?.title, type = node?.class_type || '节点';
  if (title && /[^\x00-\x7f]/.test(title)) return title;
  if (title && spec && title !== type && title !== spec.display_name) return title;
  return NODE_NAMES[type] || title || spec?.display_name || type;
}

// ---------- the forms a workflow comes in ----------
const latin1 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; };
const utf8 = bytes => { try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { return latin1(bytes); } };
async function inflate(bytes) {
  if (typeof DecompressionStream !== 'function') return '';
  try { return utf8(new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())); } catch { return ''; }
}
/** The text chunks of a PNG (ComfyUI keeps the workflow in "prompt" and "workflow"). */
async function pngTexts(u) {
  const out = {}, view = new DataView(u.buffer, u.byteOffset, u.byteLength);
  for (let at = 8; at + 12 <= u.length;) {
    const size = view.getUint32(at), type = latin1(u.subarray(at + 4, at + 8)), data = u.subarray(at + 8, at + 8 + size);
    at += 12 + size;
    if (type === 'IEND') break;
    if (!['tEXt', 'zTXt', 'iTXt'].includes(type)) continue;
    const end = data.indexOf(0);
    if (end < 1) continue;
    const key = latin1(data.subarray(0, end)), rest = data.subarray(end + 1);
    if (type === 'tEXt') out[key] = utf8(rest);
    else if (type === 'zTXt') out[key] = await inflate(rest.subarray(1));
    else {
      // iTXt: compressed?, method, language\0, translated keyword\0, text.
      const compressed = rest[0] === 1, language = rest.indexOf(0, 2), keyword = rest.indexOf(0, language + 1);
      if (language < 0 || keyword < 0) continue;
      const body = rest.subarray(keyword + 1);
      out[key] = compressed ? await inflate(body) : utf8(body);
    }
  }
  return out;
}
/** The JSON object that starts at text[start], whatever it is followed by. */
function jsonAt(text, start) {
  let depth = 0, quoted = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '\\') i++; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return '';
}
/** What ComfyUI wrote into a picture it saved: {prompt, workflow} as text, either may be missing. */
export async function readPictureWorkflow(buffer) {
  const u = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u[0] === 0x89 && u[1] === 0x50) { const t = await pngTexts(u); return {prompt: t.prompt || '', workflow: t.workflow || ''}; }
  if (latin1(u.subarray(0, 4)) === 'RIFF' && latin1(u.subarray(8, 12)) === 'WEBP') {
    // ComfyUI's WebP: in the EXIF, as "prompt:{…}" and "workflow:{…}".
    const text = latin1(u), find = word => { const at = text.indexOf(word + ':{'); return at < 0 ? '' : jsonAt(text, at + word.length + 1); };
    return {prompt: find('prompt'), workflow: find('workflow')};
  }
  return {prompt: '', workflow: ''};
}
/** A workflow as text in any of its JSON forms: {api: graph} or {ui: the editor's own}. */
export function parseWorkflow(text) {
  let data;
  try { data = JSON.parse(String(text ?? '')); } catch { throw Error('工作流不是有效的 JSON'); }
  if (isGraph(data)) return {api: data};
  if (isGraph(data?.prompt)) return {api: data.prompt, wrapped: true};
  if (data && Array.isArray(data.nodes) && data.links) return {ui: data};
  throw Error('这个文件里没有 ComfyUI 工作流');
}

// ---------- the editor's JSON to the API's ----------
const WIDGET_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO']);
const CONTROL_VALUES = new Set(['fixed', 'increment', 'decrement', 'randomize']);
const EDITOR_VALUES = new Set(['control_after_generate', 'upload']);
const isWidgetDef = def => Array.isArray(def) && (Array.isArray(def[0]) || WIDGET_TYPES.has(def[0])) && !def[1]?.forceInput;
const inputsOf = spec => Object.entries({...spec?.input?.required, ...spec?.input?.optional});
/**
 * The names of a node's values in the order of widgets_values. 0 stands for a value that belongs to no input (how many
 * rows a dynamic group has), null for one that is there only in some files (a number's "after each run", an upload button).
 * Files of recent versions list every value themselves, also those of dynamic widgets; older ones need ComfyUI's word.
 */
function widgetNames(node, spec) {
  const filed = (node.inputs || []).filter(i => i.widget?.name), defs = new Map(inputsOf(spec)), told = [];
  const hasControl = (name, def) => ((name === 'seed' || name === 'noise_seed') && (!def || def[0] === 'INT')) || !!def?.[1]?.control_after_generate;
  for (const [name, def] of defs) {
    if (!isWidgetDef(def)) continue;
    told.push(name);
    if (hasControl(name, def)) told.push(null);
    if (def[1]?.image_upload || def[1]?.video_upload) told.push(null);
  }
  const complete = filed.length && told.filter(Boolean).every(n => filed.some(i => i.widget.name === n));
  if (!complete) return spec ? told : (filed.length ? filed.map(i => i.widget.name) : null);
  const names = [], groups = new Set();
  for (const input of filed) {
    const name = input.widget.name, group = /^(.+?)\.\d+\.\w/.exec(name)?.[1];
    if (group && !groups.has(group)) { groups.add(group); names.push(0); }
    // The upload button's slot holds a word, not an input.
    if (input.type === 'IMAGEUPLOAD' || input.type === 'VIDEOUPLOAD') { names.push(0); continue; }
    names.push(name);
    if (hasControl(name, defs.get(name))) names.push(null);
  }
  return names;
}
function widgetInputs(node, spec) {
  const values = node.widgets_values, named = node.widgets_values_named, out = {};
  // Recent versions save every value with its name, which leaves nothing to work out.
  if (named && typeof named === 'object' && !Array.isArray(named)) {
    for (const [name, value] of Object.entries(named)) if (!EDITOR_VALUES.has(name) && value !== null) out[name] = Array.isArray(value) ? {__value__: value} : value;
    // How many rows a dynamic group has is no input of its own (loras: 1 beside loras.0.strength).
    for (const name of Object.keys(out)) if (typeof out[name] === 'number' && Object.keys(out).some(k => k.startsWith(name + '.'))) delete out[name];
    return out;
  }
  if (values && !Array.isArray(values) && typeof values === 'object') { for (const [k, v] of Object.entries(values)) if (k !== 'videopreview') out[k] = v; return out; }
  if (!Array.isArray(values) || !values.length) return out;
  const names = widgetNames(node, spec);
  if (!names) throw Object.assign(Error(`读不到「${node.title || node.type}」的参数名`), {unknown: node.type});
  let at = 0;
  for (const name of names) {
    if (at >= values.length) break;
    if (name === 0) { at++; continue; }
    if (name === null) { if (CONTROL_VALUES.has(values[at]) || values[at] === 'image' || values[at] === 'video') at++; continue; }
    // A list with nothing to choose from holds null, and ComfyUI's export leaves it out; a list as a value goes wrapped.
    if (values[at] !== null) out[name] = Array.isArray(values[at]) ? {__value__: values[at]} : values[at];
    at++;
    if (!spec && typeof values[at - 1] === 'number' && CONTROL_VALUES.has(values[at])) at++;
  }
  return out;
}
const linkRows = links => (links || []).map(l => Array.isArray(l) ? {id: l[0], origin_id: l[1], origin_slot: l[2], target_id: l[3], target_slot: l[4], type: l[5]} : l);
const VIRTUAL = new Set(['Reroute', 'Note', 'MarkdownNote', 'PrimitiveNode', 'SetNode', 'GetNode']);
const isRelay = type => /^reroute/i.test(type || '');
// Well-known nodes of the editor alone, for when ComfyUI cannot be asked what it runs.
const EDITOR_ONLY = /^(Bookmark|Label|Fast (Groups )?(Muter|Bypasser)|Fast Actions Button) \(rgthree\)$/;
/** The same as ComfyUI's own 导出 (API): groups of nodes opened up, relays and switched-off nodes wired around. */
export function uiToApi(ui, specs = {}) {
  const defs = new Map((ui.definitions?.subgraphs || []).map(d => [d.id, d])), out = {};
  const scope = (nodes, links, prefix, parent, def) => ({nodes: new Map(nodes.map(n => [Number(n.id), n])), links: new Map(linkRows(links).map(l => [Number(l.id), l])), prefix, parent, def});
  const wid = (ctx, id) => ctx.prefix + id;
  const typeOfOutput = (node, slot) => node.outputs?.[slot]?.type;
  // Where the value of a link really comes from: {link: [id, slot]}, {value}, or null when nothing does.
  function follow(ctx, originId, slot, depth = 0) {
    if (depth > 64) return null;
    if (originId === -10 || originId === ctx.def?.inputNode?.id) {
      const up = ctx.parent; if (!up) return null;
      // By name: a saved file leaves out the outer node's inputs that nothing is wired to, so places do not line up.
      const name = ctx.def?.inputs?.[slot]?.name, input = up.instance.inputs?.find(i => i.name === name) || (name ? null : up.instance.inputs?.[slot]);
      if (input?.link != null) return fromLink(up.ctx, input.link, depth + 1);
      let own = {};
      try { own = widgetInputs(up.instance, specs[up.instance.type]); } catch { /* the value inside the group stands */ }
      const key = input?.widget?.name || name;
      return key && Object.hasOwn(own, key) ? {value: own[key]} : null;
    }
    const node = ctx.nodes.get(Number(originId));
    if (!node) return null;
    if (node.mode === 2 || node.mode === 3) return null;
    if (node.type === 'PrimitiveNode') return {value: Array.isArray(node.widgets_values) ? node.widgets_values[0] : undefined};
    if (isRelay(node.type)) { const l = node.inputs?.find(i => i.link != null)?.link; return l == null ? null : fromLink(ctx, l, depth + 1); }
    // A named pair of nodes that stands for a wire, in the editor only.
    if (node.type === 'GetNode') {
      const name = node.widgets_values?.[0], setter = [...ctx.nodes.values()].find(n => n.type === 'SetNode' && n.widgets_values?.[0] === name), l = setter?.inputs?.[0]?.link;
      return l == null ? null : fromLink(ctx, l, depth + 1);
    }
    if (node.mode === 4) {
      // Switched off by going around it: the input of the type the output has, the same place first (as the editor).
      const type = typeOfOutput(node, slot), inputs = node.inputs || [];
      const same = inputs[slot]?.type === type ? slot : -1;
      let pick = same;
      if (pick < 0) { const kept = inputs.map((x, i) => x.type === type ? i : -1).filter(i => i >= 0); const nth = (node.outputs || []).slice(0, slot).filter(o => o.type === type).length; pick = kept[nth] ?? kept[0] ?? -1; }
      const l = pick >= 0 ? inputs[pick]?.link : null;
      return l == null ? null : fromLink(ctx, l, depth + 1);
    }
    if (defs.has(node.type)) {
      const def = defs.get(node.type), inner = open(ctx, node, def), linkId = def.outputs?.[slot]?.linkIds?.[0];
      return linkId == null ? null : fromLink(inner, linkId, depth + 1);
    }
    return {link: [wid(ctx, originId), slot]};
  }
  function fromLink(ctx, linkId, depth = 0) {
    const l = ctx.links.get(Number(linkId));
    return l ? follow(ctx, l.origin_id, l.origin_slot, depth) : null;
  }
  const opened = new Map();
  function open(ctx, instance, def) {
    const key = ctx.prefix + instance.id;
    if (!opened.has(key)) opened.set(key, scope(def.nodes || [], def.links || [], key + ':', {ctx, instance}, def));
    return opened.get(key);
  }
  function emit(ctx) {
    for (const node of ctx.nodes.values()) {
      if (node.mode === 2 || node.mode === 3 || node.mode === 4 || VIRTUAL.has(node.type) || isRelay(node.type) || EDITOR_ONLY.test(node.type)) continue;
      if (defs.has(node.type)) { emit(open(ctx, node, defs.get(node.type))); continue; }
      const spec = specs[node.type];
      // Something ComfyUI does not know and nothing takes from: the editor's own (bookmarks, group switches), not for running.
      if (!spec && Object.keys(specs).length && !(node.outputs || []).some(o => o.links?.length)) continue;
      const inputs = widgetInputs(node, spec);
      for (const input of node.inputs || []) {
        if (input.link == null) {
          // A value given from outside a group: an inner input fed by the group's own input, kept by the outer node.
          continue;
        }
        const from = fromLink(ctx, input.link);
        if (from?.link) inputs[input.name] = from.link;
        else if (from && from.value !== undefined) inputs[input.name] = from.value;
        else if (!input.widget) delete inputs[input.name];
      }
      out[wid(ctx, node.id)] = {inputs, class_type: node.type, _meta: {title: node.title || spec?.display_name || node.type}};
    }
  }
  emit(scope(ui.nodes, ui.links, '', null, null));
  if (!Object.keys(out).length) throw Error('这个工作流里没有能运行的节点');
  return out;
}
/** The node types of the editor's JSON that are not its own groups, for asking ComfyUI what they are. */
export function uiNodeTypes(ui) {
  const defs = new Set((ui.definitions?.subgraphs || []).map(d => d.id)), types = new Set();
  for (const node of [...(ui.nodes || []), ...(ui.definitions?.subgraphs || []).flatMap(d => d.nodes || [])]) if (!defs.has(node.type) && !VIRTUAL.has(node.type)) types.add(node.type);
  return [...types];
}

// ---------- which node takes what ----------
const POSITIVE_KEYS = ['positive', 'text_positive', 'positive_prompt'], NEGATIVE_KEYS = ['negative', 'text_negative', 'negative_prompt'];
const TEXT_KEYS = new Set(['text', 'text_g', 'text_l', 'clip_l', 't5xxl', 'clip_g', 't5', 'prompt', 'string', 'value', 'wildcard_text', 'populated_text', 'caption', ...POSITIVE_KEYS, ...NEGATIVE_KEYS]);
const NOT_THE_TEXT = new Set(['clip', 'model', 'vae', 'control_net', 'image', 'images', 'pixels', 'mask', 'clip_vision_output', 'style_model', 'latent_image', 'samples']);
const placeholder = v => typeof v === 'string' && /^%[a-z_]+%$/.test(v);
const SCALARS = ['value', 'text', 'string', 'seed', 'noise_seed', 'int', 'number', 'float', 'INT', 'STRING', 'FLOAT'];
/** The node and input that really hold a value, going up through primitive nodes. null when it is worked out, not kept. */
function holder(graph, id, key, want, depth = 0) {
  const value = graph[id]?.inputs?.[key];
  if (typeof value === want) return {id, key};
  if (!isLink(value) || depth > 8) return null;
  const source = graph[String(value[0])], inputs = source?.inputs || {};
  if (!source) return null;
  const direct = SCALARS.find(k => typeof inputs[k] === want || isLink(inputs[k]));
  if (direct) return holder(graph, String(value[0]), direct, want, depth + 1);
  const only = Object.keys(inputs).filter(k => typeof inputs[k] === want);
  return only.length === 1 ? {id: String(value[0]), key: only[0]} : null;
}
function textsFrom(graph, from, role, out = [], seen = new Set()) {
  const id = String(from[0]), node = graph[id], mark = id + ':' + from[1];
  if (!node || seen.has(mark) || node.class_type === 'ConditioningZeroOut') return out;
  seen.add(mark);
  const i = node.inputs || {};
  // A node that passes both on (the advanced ControlNet): its first output carries the positive, the second the negative.
  if (isLink(i.positive) && isLink(i.negative)) { textsFrom(graph, from[1] === 1 ? i.negative : i.positive, role, out, seen); return out; }
  const wrong = role === 'prompt' ? NEGATIVE_KEYS : POSITIVE_KEYS;
  const texts = Object.keys(i).filter(k => TEXT_KEYS.has(k) && !wrong.includes(k) && (typeof i[k] === 'string' || isLink(i[k])));
  if (texts.length) {
    for (const key of texts) { const found = holder(graph, id, key, 'string'); if (found) out.push(found); }
    return out;
  }
  for (const [key, value] of Object.entries(i)) if (isLink(value) && !NOT_THE_TEXT.has(key)) textsFrom(graph, value, role, out, seen);
  return out;
}
const isSampler = n => /sampler|detailer/i.test(n?.class_type || '') && !/select/i.test(n.class_type) && ['positive', 'guider', 'latent_image', 'samples'].some(k => isLink(n.inputs?.[k]));
/** The latent node a sampler starts from: {empty: its id} or {} when it continues from a picture or another sampler. */
function startOf(graph, id, seen = new Set()) {
  const node = graph[id], i = node?.inputs || {};
  if (!node || seen.has(id)) return {};
  seen.add(id);
  const from = ['latent_image', 'latent', 'samples', 'latents'].map(k => i[k]).find(isLink);
  if (!from) return {};
  const source = String(from[0]), kind = graph[source]?.class_type || '';
  if (/empty.*latent|latent.*empty/i.test(kind)) return {empty: source};
  if (isSampler(graph[source]) || /encode/i.test(kind)) return {};
  return startOf(graph, source, seen);
}
const CHECKPOINT_LOADERS = {CheckpointLoaderSimple: ['ckpt_name', 'checkpoint'], CheckpointLoader: ['ckpt_name', 'checkpoint'], UNETLoader: ['unet_name', 'unet'], UnetLoaderGGUF: ['unet_name', 'gguf']};
/**
 * Which node takes what: {prompt: [{id, key}], negative_prompt: […], seed, steps, scale, sampler, scheduler, width,
 * height, model, vae, clip, clip_type, clip_skip}, and the loader kind for a model. Only what can safely be filled.
 */
export function findRoles(text) {
  const graph = graphOf(text), roles = {}, seen = new Set();
  const add = (role, at, want) => {
    if (!at) return;
    const place = typeof want === 'string' ? holder(graph, at.id, at.key, want) : at;
    if (!place || seen.has(place.id + '.' + place.key) || placeholder(graph[place.id]?.inputs?.[place.key])) return;
    seen.add(place.id + '.' + place.key); (roles[role] ||= []).push(place);
  };
  const samplers = Object.keys(graph).filter(id => isSampler(graph[id]));
  // The sampler's own value, or one of the small nodes SamplerCustomAdvanced is put together from.
  const part = (id, key, via) => {
    const inputs = graph[id]?.inputs || {};
    if (Object.hasOwn(inputs, key)) return {id, key};
    for (const link of via.map(k => inputs[k]).filter(isLink)) { const source = String(link[0]); if (Object.hasOwn(graph[source]?.inputs || {}, key)) return {id: source, key}; }
    return null;
  };
  const conditioning = id => {
    const i = graph[id]?.inputs || {}, guider = isLink(i.guider) ? (graph[String(i.guider[0])]?.inputs || {}) : i;
    return {positive: [guider.positive, guider.conditioning, guider.cond1, guider.cond].find(isLink), negative: [guider.negative, guider.cond2].find(isLink)};
  };
  const prompts = [], negatives = [];
  for (const id of samplers) {
    const c = conditioning(id);
    if (c.positive) prompts.push(...textsFrom(graph, c.positive, 'prompt'));
    if (c.negative) negatives.push(...textsFrom(graph, c.negative, 'negative_prompt'));
    // A sampler holding its words itself (loaders that are also text boxes come through the links above).
    add('seed', part(id, 'seed', []) || part(id, 'noise_seed', ['noise']), 'number');
  }
  const taken = new Set();
  for (const p of prompts) { taken.add(p.id + '.' + p.key); add('prompt', p); }
  for (const n of negatives) if (!taken.has(n.id + '.' + n.key)) add('negative_prompt', n);
  // Steps, CFG and so on belong to the pass that makes the picture; a second pass (hires, a face fix) keeps its own.
  const firsts = samplers.filter(id => startOf(graph, id).empty);
  for (const id of firsts.length ? firsts : samplers.slice(0, 1)) {
    add('steps', part(id, 'steps', ['sigmas']), 'number');
    const guider = isLink(graph[id].inputs?.guider) ? String(graph[id].inputs.guider[0]) : '';
    add('scale', part(id, 'cfg', []) || (guider ? part(guider, 'cfg', []) : null), 'number');
    add('sampler', part(id, 'sampler_name', ['sampler']), 'string');
    add('scheduler', part(id, 'scheduler', ['sigmas']), 'string');
    const empty = startOf(graph, id).empty;
    if (empty) { add('width', {id: empty, key: 'width'}, 'number'); add('height', {id: empty, key: 'height'}, 'number'); }
    // Drawn over a picture: how much to change it is what one comes back for.
    else add('denoise', part(id, 'denoise', ['sigmas']), 'number');
  }
  // Loaders: only when there is one of a kind (two checkpoints are the workflow's own idea).
  const ids = test => Object.keys(graph).filter(id => test(graph[id]));
  const models = ids(n => Object.hasOwn(CHECKPOINT_LOADERS, n?.class_type));
  let loader = '';
  if (models.length === 1) { const [key, kind] = CHECKPOINT_LOADERS[graph[models[0]].class_type]; if (typeof graph[models[0]].inputs?.[key] === 'string') { add('model', {id: models[0], key}); loader = kind; } }
  const vaes = ids(n => n?.class_type === 'VAELoader');
  if (vaes.length === 1) add('vae', {id: vaes[0], key: 'vae_name'}, 'string');
  const clips = ids(n => n?.class_type === 'CLIPLoader');
  if (clips.length === 1) { add('clip', {id: clips[0], key: 'clip_name'}, 'string'); add('clip_type', {id: clips[0], key: 'type'}, 'string'); }
  const skips = ids(n => n?.class_type === 'CLIPSetLastLayer');
  if (skips.length === 1) add('clip_skip', {id: skips[0], key: 'stop_at_clip_layer'}, 'number');
  return {roles, loader};
}
/** The kind of model the workflow's %model% is, for offering only those: checkpoint, unet, gguf, or '' when it is not known. */
export function modelKindOf(text) {
  const graph = graphOf(text);
  for (const node of Object.values(graph)) { const loader = CHECKPOINT_LOADERS[node?.class_type]; if (loader && node.inputs?.[loader[0]] === '%model%') return loader[1]; }
  return '';
}
/** A few words to tell a run apart by: what it was asked to draw. */
export function promptWords(text) {
  const graph = graphOf(text), {roles} = findRoles(graph), at = roles.prompt?.[0];
  return at ? String(graph[at.id].inputs[at.key]).trim().slice(0, 60) : '';
}
export const nodeTypes = text => [...new Set(Object.values(graphOf(text)).map(n => n?.class_type).filter(Boolean))];
/** Every node that could take the prompt, for asking when none was found: [{id, key, title, text}]. */
export function promptCandidates(text) {
  const graph = graphOf(text), out = [];
  for (const [id, node] of Object.entries(graph)) for (const [key, value] of Object.entries(node?.inputs || {})) if (TEXT_KEYS.has(key) && typeof value === 'string') out.push({id, key, title: titleOf(node, id), text: value.slice(0, 80)});
  return out;
}
const ROLE_PARAM = {denoise: 'denoise', steps: 'steps', scale: 'scale', sampler: 'sampler', scheduler: 'scheduler', width: 'width', height: 'height', model: 'model', vae: 'vae', clip: 'clip', clip_type: 'clipType'};
/**
 * The workflow with its roles turned into placeholders, and the values it had as the scheme's parameters, so the first
 * picture comes out as it did in ComfyUI. The words it had as a negative stay, with the phone's negative after them.
 * A workflow with %prompt% in it is taken as it is: whoever put that there has decided.
 */
export function mapWorkflow(text, {prompt} = {}) {
  const graph = graphOf(text);
  if (/%prompt%/.test(JSON.stringify(graph))) return {workflow: typeof text === 'string' ? text : JSON.stringify(graph), params: {}, mapped: [], needsPrompt: false};
  const {roles, loader} = findRoles(graph), params = {}, mapped = [];
  if (prompt) roles.prompt = [prompt];
  for (const [role, places] of Object.entries(roles)) {
    const value = graph[places[0].id].inputs[places[0].key];
    const param = ROLE_PARAM[role];
    if (param) params[param] = value;
    if (role === 'clip_skip' && value < 0) params.clipSkip = -value;
    for (const {id, key} of places) {
      if (role === 'clip_skip' && !(graph[id].inputs[key] < 0)) continue;
      const old = graph[id].inputs[key];
      graph[id].inputs[key] = role === 'negative_prompt' && String(old).trim() ? `${String(old).trim().replace(/,\s*$/, '')}, %negative_prompt%` : `%${role}%`;
    }
    mapped.push(role);
  }
  if (loader) params.loader = loader;
  return {workflow: JSON.stringify(graph), params, mapped, needsPrompt: !roles.prompt};
}

// ---------- every node, for the phone ----------
const LORA_TYPES = new Set(['LoraLoader', 'LoraLoaderModelOnly']);
const OUTPUT = /save|preview|comparer/i;
const IMAGE_KEYS = /^(images?|image_\w+|pixels)$/;
const consumers = (graph, id) => Object.entries(graph).flatMap(([other, n]) => Object.entries(n?.inputs || {}).filter(([, v]) => isLink(v) && String(v[0]) === id).map(([key, v]) => ({id: other, key, port: v[1]})));
const isOutputNode = (graph, id) => OUTPUT.test(graph[id]?.class_type || '') && Object.entries(graph[id]?.inputs || {}).some(([k, v]) => IMAGE_KEYS.test(k) && isLink(v)) && !consumers(graph, id).length;
const depthOf = (graph, id, memo = new Map(), visiting = new Set()) => {
  if (memo.has(id)) return memo.get(id);
  if (visiting.has(id)) return 0;
  visiting.add(id);
  let best = 0;
  for (const value of Object.values(graph[id]?.inputs || {})) if (isLink(value)) best = Math.max(best, 1 + depthOf(graph, String(value[0]), memo, visiting));
  visiting.delete(id); memo.set(id, best);
  return best;
};
/** The picture the plugin keeps when a workflow has several: the chosen node, else the one furthest down the line. */
export function pickOutput(text, chosen = '') {
  const graph = graphOf(text), outputs = Object.keys(graph).filter(id => isOutputNode(graph, id));
  if (chosen && outputs.includes(chosen)) return chosen;
  const memo = new Map();
  return outputs.sort((a, b) => depthOf(graph, b, memo) - depthOf(graph, a, memo) || Number(/save/i.test(graph[b].class_type)) - Number(/save/i.test(graph[a].class_type)) || Number(a) - Number(b))[0] || '';
}
/** ComfyUI answers with the first picture it finds: other picture nodes are left out of the request. */
export function keepOneOutput(text, chosen = '') {
  const graph = graphOf(text), keep = pickOutput(graph, chosen);
  if (!keep) return typeof text === 'string' ? text : JSON.stringify(graph);
  for (const id of Object.keys(graph)) if (id !== keep && isOutputNode(graph, id)) delete graph[id];
  return JSON.stringify(graph);
}
const kindOfKey = key => /^model/.test(key) ? 'MODEL' : /^clip$/.test(key) ? 'CLIP' : /^vae$/.test(key) ? 'VAE' : /^(positive|negative|conditioning|cond)/.test(key) ? 'CONDITIONING' : /^(latent|samples)/.test(key) ? 'LATENT' : /^(images?|pixels)/.test(key) ? 'IMAGE' : /^mask/.test(key) ? 'MASK' : key;
/** What takes the place of a node when it is switched off: for each user of it, the input of the same kind. */
function goAround(graph, id) {
  const links = Object.entries(graph[id]?.inputs || {}).filter(([, v]) => isLink(v));
  return consumers(graph, id).map(user => {
    const source = links.find(([k]) => k === user.key) || links.find(([k]) => kindOfKey(k) === kindOfKey(user.key));
    return source ? {...user, source: source[1]} : {...user, source: null};
  });
}
export const canSwitchOff = (text, id) => goAround(graphOf(text), id).every(u => u.source);
/** The request's copy with the nodes switched off gone and their users wired past them. The saved graph keeps them. */
export function switchNodesOff(text, ids = []) {
  if (!ids.length) return typeof text === 'string' ? text : JSON.stringify(text);
  const graph = graphOf(typeof text === 'string' ? text : JSON.stringify(text));
  for (const id of ids) {
    if (!graph[id]) continue;
    const users = goAround(graph, id);
    const stuck = users.find(u => !u.source);
    if (stuck) throw Error(`「${titleOf(graph[id], id)}」关不掉：「${titleOf(graph[stuck.id], stuck.id)}」要用它的结果，请打开它，或把后面的节点也关掉`);
    for (const u of users) graph[u.id].inputs[u.key] = [...u.source];
    delete graph[id];
  }
  return JSON.stringify(graph);
}
export const FIELD_NAMES = {seed: '种子', noise_seed: '种子', steps: '步数', cfg: 'CFG', sampler_name: '采样器', scheduler: '噪声调度', denoise: '重绘幅度', width: '宽度', height: '高度', batch_size: '一次几张', text: '文字', ckpt_name: '模型', unet_name: '模型', vae_name: 'VAE', clip_name: 'CLIP', type: '类型', stop_at_clip_layer: 'CLIP 层', filename_prefix: '文件名开头', image: '图片', strength: '强度', strength_model: '强度', strength_clip: '文字强度', control_net_name: 'ControlNet', start_percent: '开始', end_percent: '结束', upscale_method: '放大方式', scale_by: '放大倍数', model_name: '模型', weight_dtype: '权重精度', crop: '裁剪', add_noise: '加噪', start_at_step: '从第几步', end_at_step: '到第几步', return_with_leftover_noise: '留下余噪', shift: 'Shift', guidance: '引导强度', lora_name: 'LoRA', model: '模型', clip: 'CLIP', vae: 'VAE', positive: '正向', negative: '反向', conditioning: '条件', latent_image: 'Latent', samples: 'Latent', images: '图片', mask: '遮罩', control_net: 'ControlNet', upscale_model: '放大模型'};
/** A value that can follow the 参数 page instead of being fixed in the node: the placeholder it takes. */
export function followName(key, type) {
  if (key === 'type') return type === 'CLIPLoader' ? 'clip_type' : '';
  if (key === 'stop_at_clip_layer') return 'clip_skip';
  return {seed: 'seed', noise_seed: 'seed', denoise: 'denoise', steps: 'steps', cfg: 'scale', sampler_name: 'sampler', scheduler: 'scheduler', width: 'width', height: 'height', ckpt_name: 'model', unet_name: 'model', vae_name: 'vae', clip_name: 'clip'}[key] || '';
}
/** Nodes in the order they run, loaders first, so the list reads like the workflow does. */
function runOrder(graph) {
  const memo = new Map();
  return Object.keys(graph).sort((a, b) => depthOf(graph, a, memo) - depthOf(graph, b, memo) || (Number(a) || 0) - (Number(b) || 0));
}
/**
 * Everything to show of a workflow: [{id, type, title, off, canOff, isOutput, output, fields}], field: {key, label,
 * kind: text|number|bool|combo|link|other, value, options?, min?, max?, step?, from?, role?, follow?}. specs: what
 * ComfyUI says of the node types (object_info); without it the kinds come from the values themselves.
 */
export function describeNodes(text, {specs = {}, off = [], output = ''} = {}) {
  const graph = graphOf(text), kept = pickOutput(graph, output), offs = new Set(off);
  return runOrder(graph).filter(id => !LORA_TYPES.has(graph[id]?.class_type)).map(id => {
    const node = graph[id], spec = specs[node.class_type], inputs = node.inputs || {}, fields = [];
    const defs = new Map(inputsOf(spec));
    for (const key of [...new Set([...defs.keys(), ...Object.keys(inputs)])]) {
      const value = inputs[key], def = defs.get(key), label = FIELD_NAMES[key] || key;
      if (isLink(value)) { const source = String(value[0]); fields.push({key, label, kind: 'link', from: {id: source, title: titleOf(graph[source], source, specs[graph[source]?.class_type])}}); continue; }
      if (value === undefined && (!def || !isWidgetDef(def))) continue;
      const shown = value === undefined ? def[1]?.default : value;
      const field = {key, label, value: shown, role: placeholder(value) ? value.slice(1, -1) : '', follow: followName(key, node.class_type), absent: value === undefined};
      // A choice that brings its own inputs along is changed in ComfyUI, where they appear with it.
      if (def?.[0] === 'COMFY_DYNAMICCOMBO_V3') { field.kind = 'other'; field.value = String(shown); field.follow = ''; }
      else if (def && (Array.isArray(def[0]) || def[0] === 'COMBO')) { field.kind = 'combo'; field.options = Array.isArray(def[0]) ? def[0] : def[1]?.options || []; field.upload = !!def[1]?.image_upload; }
      else if (def?.[0] === 'BOOLEAN' || typeof shown === 'boolean') field.kind = 'bool';
      else if (def?.[0] === 'INT' || def?.[0] === 'FLOAT' || typeof shown === 'number') { field.kind = 'number'; field.min = def?.[1]?.min; field.max = def?.[1]?.max; field.step = def?.[1]?.step ?? (def?.[0] === 'INT' ? 1 : 'any'); }
      else if (typeof shown === 'string' || def?.[0] === 'STRING') { field.kind = 'text'; field.long = !!def?.[1]?.multiline || TEXT_KEYS.has(key) || String(shown ?? '').length > 60; }
      else { field.kind = 'other'; field.value = JSON.stringify(shown); }
      fields.push(field);
    }
    fields.sort((a, b) => Number(a.kind === 'link') - Number(b.kind === 'link'));
    const words = Object.values(inputs).filter(v => typeof v === 'string').join(' ');
    return {id, type: node.class_type, title: nameOf(node, spec), fills: [...(/%prompt%/.test(words) ? ['提示词'] : []), ...(/%negative_prompt%/.test(words) ? ['反向'] : [])], off: offs.has(id), canOff: goAround(graph, id).every(u => u.source), isOutput: isOutputNode(graph, id), output: id === kept, unknown: !!Object.keys(specs).length && !spec, fields};
  });
}
/** Node values changed: [{id, key, value}]; a link stays a link (it is rewired in ComfyUI, not here). */
export function setNodeValues(text, changes = []) {
  const graph = graphOf(text);
  for (const {id, key, value} of changes) {
    const node = graph[String(id)];
    if (!node) throw Error('这个节点已经不在工作流里了');
    if (isLink(node.inputs?.[key])) throw Error(`「${key}」接着别的节点，要在 ComfyUI 里改`);
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw Error(`「${key}」的值不对`);
    if (typeof value === 'number' && !Number.isFinite(value)) throw Error(`「${key}」要填数字`);
    if (typeof value === 'string' && value.length > 100000) throw Error(`「${key}」太长了`);
    (node.inputs ||= {})[key] = value;
  }
  return JSON.stringify(graph);
}
/** When ComfyUI refuses a workflow without saying why through the tavern: what it does not have. [] when all looks fine. */
export function findProblems(text, specs = {}) {
  const graph = graphOf(text), problems = [];
  for (const [id, node] of Object.entries(graph)) {
    const spec = specs[node?.class_type];
    if (!spec) { problems.push(`ComfyUI 里没有「${node?.class_type}」这个节点（#${id}），请先安装它`); continue; }
    for (const [key, def] of inputsOf(spec)) {
      const value = node.inputs?.[key], list = Array.isArray(def?.[0]) ? def[0] : def?.[0] === 'COMBO' ? def[1]?.options : null;
      if (list?.length && typeof value === 'string' && !placeholder(value) && !list.includes(value)) problems.push(`#${id}「${node._meta?.title || node.class_type}」的 ${key}：ComfyUI 里没有 ${value}`);
    }
    // Dynamic inputs are stored under other names (loras.0.strength).
    for (const [key, def] of Object.entries(spec.input?.required || {})) if (node.inputs?.[key] === undefined && !String(def?.[0]).startsWith('COMFY_')) problems.push(`#${id}「${node._meta?.title || node.class_type}」缺少 ${key}`);
  }
  return problems;
}
