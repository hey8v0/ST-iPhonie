// ComfyUI singing (core/song-engines.js runs it): which ACE-Step models this ComfyUI has, in whichever way they were installed (one all-in-one
// file, or the split files most guides use), the graph for them, and a workflow of the user's own: which of its inputs take the words, the style,
// the length. Pure: no requests here.
import {isLink, holder, titleOf} from './comfy-graph.js';
import {styleFor} from './song.js';

/** The node types asked about: the loaders' file lists, and what this version can run. */
export const ACE_NODES = Object.freeze(['CheckpointLoaderSimple', 'UNETLoader', 'UnetLoaderGGUF', 'DualCLIPLoader', 'VAELoader', 'TextEncodeAceStepAudio1.5', 'TextEncodeAceStepAudio', 'SaveAudioMP3', 'SaveAudio']);
const ACE_LANGUAGES = {中文: 'zh', 普通话: 'zh', 粤语: 'yue', 日语: 'ja', 英语: 'en', 韩语: 'ko'};
const inputDef = (specs, type, key) => specs?.[type]?.input?.required?.[key] ?? specs?.[type]?.input?.optional?.[key];
function optionsOf(def) {
  const list = Array.isArray(def?.[0]) ? def[0] : def?.[1]?.options;
  return Array.isArray(list) ? list.filter(n => typeof n === 'string') : [];
}
const listOf = (specs, type, key) => optionsOf(inputDef(specs, type, key));
const isAce = name => /ace[\s._-]*step/i.test(name);
/** ACE-Step 1 (ace_step_v1_3.5b): other nodes than 1.5 (ace_step_1.5_…, acestep_v1.5_…, acestep-v15-…). */
const isOldAce = name => isAce(name) && /ace[\s._-]*step[\s._-]*v?1(?![\s._-]*5|5)/i.test(name);
/** ace_1.5_vae, qwen_0.6b_ace15, acestep_vae; pixel_space (ComfyUI's own) only looks like one. */
const isAceFile = name => isAce(name) || /(^|[\/\s._-])ace($|[\d\s._-])/i.test(name);
const isAllInOne = name => /aio|all[\s._-]*in[\s._-]*one/i.test(name);
/** Steps and CFG as ComfyUI's own template for the model has them. */
const tuned = name => /sft/i.test(name) ? {steps: 50, cfg: 7} : /base/i.test(name) ? {steps: 50, cfg: 6} : {steps: 8, cfg: 1};
const unetScore = name => (/turbo/i.test(name) ? 2 : 0) + (/xl/i.test(name) ? 0 : 1);

/**
 * What this ComfyUI can sing with, from what it says of its loaders: {kind: 'aio' | 'split' | 'old' | '', …, names: the files, steps, cfg}.
 * kind '' : not enough; missing says what is not there. A file in checkpoints with no 「aio」 in its name may be only half a model (a split one copied
 * there): it is used only when nothing better is there, and unsure says so.
 */
export function findAceModels(specs) {
  const checkpoints = listOf(specs, 'CheckpointLoaderSimple', 'ckpt_name').filter(isAce);
  const unets = [...listOf(specs, 'UNETLoader', 'unet_name').filter(n => isAce(n) && !isOldAce(n)).map(name => ({name, loader: 'UNETLoader'})),
    ...listOf(specs, 'UnetLoaderGGUF', 'unet_name').filter(n => isAce(n) && !isOldAce(n)).map(name => ({name, loader: 'UnetLoaderGGUF'}))].sort((a, b) => unetScore(b.name) - unetScore(a.name));
  const aio = checkpoints.find(n => isAllInOne(n) && !isOldAce(n));
  if (aio) return {kind: 'aio', checkpoint: aio, names: [aio], ...tuned(aio)};
  const unet = unets[0], texts = listOf(specs, 'DualCLIPLoader', 'clip_name1').filter(isAceFile);
  const small = texts.find(n => /0[._]6b/i.test(n)), others = texts.filter(n => n !== small), xl = /xl/i.test(unet?.name || '');
  const big = (xl ? [/4b/i, /1[._]7b/i] : [/1[._]7b/i, /4b/i]).map(re => others.find(n => re.test(n))).find(Boolean) || (small ? others[0] : '');
  const clips = small && big ? [small, big] : !texts.some(n => /\db/i.test(n)) && texts.length >= 2 ? texts.slice(0, 2) : null;
  const vaes = listOf(specs, 'VAELoader', 'vae_name').filter(isAceFile), vae = vaes.find(n => /1[._]?5/.test(n)) || vaes[0];
  if (unet && clips && vae) return {kind: 'split', unet: unet.name, loader: unet.loader, clips, vae, names: [unet.name, ...clips, vae], ...tuned(unet.name)};
  const old = checkpoints.find(isOldAce);
  if (old) return {kind: 'old', checkpoint: old, names: [old], steps: 50, cfg: 5};
  const other = checkpoints.find(n => !unets.some(u => u.name === n));
  if (other) return {kind: 'aio', checkpoint: other, names: [other], unsure: true, ...tuned(other)};
  const missing = [];
  if (!unet) missing.push('models/diffusion_models 里的 acestep_v1.5_turbo.safetensors');
  if (!clips) missing.push('models/text_encoders 里的 qwen_0.6b_ace15.safetensors 和 qwen_1.7b_ace15.safetensors');
  if (!vae) missing.push('models/vae 里的 ace_1.5_vae.safetensors');
  return {kind: '', missing, partial: !!(unet || texts.length || vae || checkpoints.length)};
}
/** What to do when no model will do, in words. */
export function aceMissing(found) {
  if (found.partial) return `ComfyUI 里的 ACE-Step 模型还不全，缺：${found.missing.join('；')}。放好以后刷新 ComfyUI。或者换成一个文件就够的 ace_step_1.5_turbo_aio.safetensors，放进 models/checkpoints`;
  return 'ComfyUI 里没有 ACE-Step 的模型：最省事是把 ace_step_1.5_turbo_aio.safetensors 放进 models/checkpoints，一个文件就够；用拆开的模型也行（diffusion_models、text_encoders、vae 各放好），放好以后刷新 ComfyUI。已经有能跑的工作流的话，也可以导入它';
}

const bpmOf = style => { const n = Number(/(\d{2,3})\s*bpm/i.exec(style)?.[1]); return n >= 10 && n <= 300 ? n : 0; };
const keyOf = style => { const m = /\b([A-G])\s?([#♯b♭]?)\s?(maj|min)(?:or)?\b/i.exec(style); return m ? `${m[1].toUpperCase()}${m[2].replace('♯', '#').replace('♭', 'b')} ${m[3].toLowerCase() === 'maj' ? 'major' : 'minor'}` : ''; };
const meterOf = style => /\b([2346])\/4\b/.exec(style)?.[1] || '';
/** ACE-Step's graph for these models, as ComfyUI's own templates have it, in the form /prompt takes. */
export function aceWorkflow({models, checkpoint, style, lyrics, instrumental, language, seconds, seed, specs = {}}) {
  const m = models || {kind: 'aio', checkpoint, steps: 8, cfg: 1}, old = m.kind === 'old', known = name => !Object.keys(specs).length || !!specs[name];
  const length = Math.round(Math.min(600, Math.max(10, Number(seconds) || 120)));
  const tags = styleFor({style, language, instrumental}), words = instrumental ? '[inst]' : lyrics, graph = {};
  let model, clip, vae;
  if (m.kind === 'split') {
    graph[1] = m.loader === 'UnetLoaderGGUF' ? {class_type: 'UnetLoaderGGUF', inputs: {unet_name: m.unet}} : {class_type: 'UNETLoader', inputs: {unet_name: m.unet, weight_dtype: 'default'}};
    graph[9] = {class_type: 'DualCLIPLoader', inputs: {clip_name1: m.clips[0], clip_name2: m.clips[1], type: 'ace', device: 'default'}};
    graph[10] = {class_type: 'VAELoader', inputs: {vae_name: m.vae}};
    [model, clip, vae] = [['1', 0], ['9', 0], ['10', 0]];
  } else {
    graph[1] = {class_type: 'CheckpointLoaderSimple', inputs: {ckpt_name: m.checkpoint}};
    [model, clip, vae] = [['1', 0], ['1', 1], ['1', 2]];
  }
  let sampling = ['2', 0];
  if (old) {
    graph[2] = {class_type: 'ModelSamplingSD3', inputs: {model, shift: 5}};
    graph[11] = {class_type: 'LatentOperationTonemapReinhard', inputs: {multiplier: 1}};
    graph[12] = {class_type: 'LatentApplyOperationCFG', inputs: {model: ['2', 0], operation: ['11', 0]}};
    sampling = ['12', 0];
    graph[3] = {class_type: 'TextEncodeAceStepAudio', inputs: {clip, tags, lyrics: words, lyrics_strength: 0.99}};
    graph[5] = {class_type: 'EmptyAceStepLatentAudio', inputs: {seconds: length, batch_size: 1}};
  } else {
    graph[2] = {class_type: 'ModelSamplingAuraFlow', inputs: {model, shift: 3}};
    const keys = listOf(specs, 'TextEncodeAceStepAudio1.5', 'keyscale'), wanted = keyOf(style), bpm = bpmOf(style);
    graph[3] = {class_type: 'TextEncodeAceStepAudio1.5', inputs: {clip, tags, lyrics: words, seed, bpm: bpm || 120, duration: length, timesignature: meterOf(style) || '4', language: ACE_LANGUAGES[language] || 'unknown',
      keyscale: wanted && (!keys.length || keys.includes(wanted)) ? wanted : 'E minor', generate_audio_codes: true, cfg_scale: 2, temperature: 0.85, top_p: 0.9, top_k: 0, min_p: 0}};
    graph[5] = {class_type: 'EmptyAceStep1.5LatentAudio', inputs: {seconds: length, batch_size: 1}};
  }
  graph[4] = {class_type: 'ConditioningZeroOut', inputs: {conditioning: ['3', 0]}};
  graph[6] = {class_type: 'KSampler', inputs: {model: sampling, positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0], seed, steps: m.steps, cfg: m.cfg, sampler_name: 'euler', scheduler: 'simple', denoise: 1}};
  graph[7] = {class_type: 'VAEDecodeAudio', inputs: {samples: ['6', 0], vae}};
  graph[8] = known('SaveAudioMP3') ? {class_type: 'SaveAudioMP3', inputs: {audio: ['7', 0], filename_prefix: 'audio/ST-iPhonie', quality: 'V0'}} : {class_type: 'SaveAudio', inputs: {audio: ['7', 0], filename_prefix: 'audio/ST-iPhonie'}};
  return graph;
}

// ---------- a workflow of the user's own ----------
const LYRICS_KEY = /^(lyrics?|lyrics?_(text|prompt)|song_lyrics)$/i;
const STYLE_KEYS = ['tags', 'style', 'style_prompt', 'styles', 'caption', 'global_caption', 'genre', 'genres', 'prompt', 'positive_prompt', 'music_prompt', 'description', 'text'];
const NOT_WORDS = /^(filename_prefix|sampler_name|scheduler|ckpt_name|unet_name|clip_name\d?|vae_name|lora_name|model_name|model|type|device|weight_dtype|language|lang|vocal_language|keyscale|key_scale|key|timesignature|time_signature|quality|format|mode|negative\w*)$/i;
const SECONDS_KEY = /^(seconds|duration|audio_duration|duration_seconds|length_seconds|audio_length)$/i, SEED_KEY = /^(seed|noise_seed)$/i;
const BPM_KEY = /^bpm$/i, LANGUAGE_KEY = /^(language|lang|vocal_language)$/i, SCALE_KEY = /^(keyscale|key_scale)$/i, METER_KEY = /^(timesignature|time_signature)$/i, INSTRUMENTAL_KEY = /^(instrumental|is_instrumental|force_instrumental)$/i;
/** Every place a kind of value is really held, through primitive nodes, once each: [{id, key}]. */
function places(graph, test, want) {
  const out = [], seen = new Set();
  for (const [id, node] of Object.entries(graph)) for (const [key, value] of Object.entries(node?.inputs || {})) {
    if (!test(key)) continue;
    const at = typeof value === want ? {id, key} : isLink(value) ? holder(graph, id, key, want) : null;
    if (at && !seen.has(at.id + '/' + at.key)) { seen.add(at.id + '/' + at.key); out.push(at); }
  }
  return out;
}
const consumed = (graph, id) => Object.values(graph).some(n => Object.values(n?.inputs || {}).some(v => isLink(v) && String(v[0]) === id));
/** The node the song comes out of: one that saves (or else shows) audio, nothing after it. '' when there is none. */
export function audioOutput(graph) {
  const takesAudio = node => Object.entries(node?.inputs || {}).some(([k, v]) => /^(audio|audios|music|sound)/i.test(k) && isLink(v));
  const found = Object.keys(graph).filter(id => /save|preview|output/i.test(graph[id]?.class_type || '') && (takesAudio(graph[id]) || /audio|mp3|flac|opus|wav|music/i.test(graph[id]?.class_type || '')) && !consumed(graph, id));
  return found.sort((a, b) => Number(/save/i.test(graph[b].class_type)) - Number(/save/i.test(graph[a].class_type)))[0] || '';
}
/** Every box of words a workflow has, to choose from: [{at: 'id/key', id, key, title, text}]. */
export function songTextFields(graph) {
  const out = [];
  // Those fed from elsewhere first: a primitive node's 「value」 is known by what it feeds (lyrics, tags).
  for (const linked of [true, false]) for (const [id, node] of Object.entries(graph)) for (const [key, value] of Object.entries(node?.inputs || {})) {
    if (NOT_WORDS.test(key) || isLink(value) !== linked) continue;
    // A wire into some other kind of input (audio, conditioning) is not a box of words, whatever is at its other end.
    if (linked && !LYRICS_KEY.test(key) && !STYLE_KEYS.includes(key.toLowerCase())) continue;
    const at = typeof value === 'string' ? {id, key} : linked ? holder(graph, id, key, 'string') : null;
    if (!at || out.some(f => f.at === at.id + '/' + at.key)) continue;
    const text = graph[at.id].inputs[at.key];
    if (/\.(safetensors|ckpt|pt|pth|gguf|sft)$/i.test(text)) continue;
    out.push({at: at.id + '/' + at.key, id: at.id, key: at.key, title: `${titleOf(node, id)} · ${key}`, text: String(text).slice(0, 80), named: key, owner: id});
  }
  return out;
}
/** Which box takes the words and which the style: chosen ones (map: {lyrics, style}, 'id/key'), else by their names. */
export function songRoles(graph, map = {}) {
  const fields = songTextFields(graph), byAt = at => fields.find(f => f.at === at) || null;
  const lyrics = byAt(map.lyrics) || fields.find(f => LYRICS_KEY.test(f.named)) || null;
  const rank = f => { const i = STYLE_KEYS.indexOf(f.named.toLowerCase()); return i < 0 ? 99 : i; };
  const candidates = fields.filter(f => f !== lyrics && rank(f) < 99).sort((a, b) => (Number(b.owner === lyrics?.owner) - Number(a.owner === lyrics?.owner)) || rank(a) - rank(b));
  return {lyrics, style: byAt(map.style) || candidates[0] || null, output: audioOutput(graph), fields};
}
/** What the phone says of a workflow: {lyrics, style, output, seconds, seeds, fields}. */
export function describeSongWorkflow(text, map = {}) {
  const graph = typeof text === 'string' ? JSON.parse(text) : text, roles = songRoles(graph, map);
  return {lyrics: roles.lyrics?.at || '', style: roles.style?.at || '', output: roles.output ? titleOf(graph[roles.output], roles.output) : '', seconds: places(graph, k => SECONDS_KEY.test(k), 'number').length, seeds: places(graph, k => SEED_KEY.test(k), 'number').length,
    fields: roles.fields.map(({at, title, text: t}) => ({at, title, text: t}))};
}
const setAll = (graph, list, value) => { for (const {id, key} of list) graph[id].inputs[key] = value; };
/** The user's workflow with this song in it. Everything else in it stays as they had it. */
export function fillSongWorkflow(text, {style, lyrics, instrumental, language, seconds, seed}, map = {}) {
  const graph = structuredClone(typeof text === 'string' ? JSON.parse(text) : text), roles = songRoles(graph, map);
  if (!roles.output) throw Error('这个工作流没有保存音频的节点：在 ComfyUI 里接一个「保存音频」再导入');
  if (!roles.style && !roles.lyrics) throw Error('这个工作流里找不到写风格和歌词的地方：在 ComfyUI 设置页里选一下');
  const tags = styleFor({style, language, instrumental});
  if (roles.lyrics) graph[roles.lyrics.id].inputs[roles.lyrics.key] = instrumental ? '[inst]' : lyrics;
  if (roles.style) graph[roles.style.id].inputs[roles.style.key] = roles.lyrics || instrumental ? tags : `${tags}\n\nLyrics:\n${lyrics}`;
  if (seconds) setAll(graph, places(graph, k => SECONDS_KEY.test(k), 'number'), Math.round(Math.min(600, Math.max(5, Number(seconds)))));
  setAll(graph, places(graph, k => SEED_KEY.test(k), 'number'), seed);
  if (bpmOf(style)) setAll(graph, places(graph, k => BPM_KEY.test(k), 'number'), bpmOf(style));
  if (keyOf(style)) setAll(graph, places(graph, k => SCALE_KEY.test(k), 'string'), keyOf(style));
  if (meterOf(style)) setAll(graph, places(graph, k => METER_KEY.test(k), 'string'), meterOf(style));
  // Only where it holds a language code: a node may name its languages some other way.
  for (const {id, key} of places(graph, k => LANGUAGE_KEY.test(k), 'string')) if (/^[a-z]{2,3}$|^unknown$/.test(graph[id].inputs[key]) && ACE_LANGUAGES[language]) graph[id].inputs[key] = ACE_LANGUAGES[language];
  for (const {id, key} of places(graph, k => INSTRUMENTAL_KEY.test(k), 'boolean')) graph[id].inputs[key] = !!instrumental;
  return graph;
}

// ---------- what ComfyUI said, in words ----------
const said = (text, max = 240) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
/** A workflow /prompt turned down. */
export function comfyRefusal(json, own) {
  const problems = Object.entries(json?.node_errors || {}).flatMap(([, n]) => (n.errors || []).map(e => ({...e, node: n.class_type})));
  const missing = problems.find(e => e.type === 'value_not_in_list');
  if (missing) return `ComfyUI 里没有 ${said(missing.extra_info?.received_value, 80) || '这个文件'}（${missing.node} 的 ${missing.extra_info?.input_name || ''}）：把它放进对应的 models 文件夹再刷新 ComfyUI${own ? '，或者在工作流里换成你有的文件' : ''}`;
  if (json?.error?.type === 'missing_node_type') return `ComfyUI 没有这个工作流要用的节点${json.error.extra_info?.class_type ? `（${json.error.extra_info.class_type}）` : ''}：${own ? '装上它，或者' : ''}更新 ComfyUI`;
  const first = problems[0];
  return `ComfyUI 没接受这个工作流${first ? `（${first.node}）：${said(first.details || first.message)}` : json?.error?.message ? '：' + said(json.error.message) : ''}`;
}
/** A run that failed, from its history. */
export function comfyFailure(job) {
  const error = job?.status?.messages?.find(m => m[0] === 'execution_error')?.[1], text = String(error?.exception_message || '');
  if (/'NoneType' object has no attribute 'tokenize'|clip input is invalid/i.test(text)) return 'ComfyUI 没做成：这个模型文件里没有文本编码器。从 diffusion_models 复制到 checkpoints 的文件只有一半，不用复制：把拆开的文件放回 diffusion_models、text_encoders、vae，小手机会自己认出来；或者换成整合包 ace_step_1.5_turbo_aio.safetensors';
  if (/'NoneType' object has no attribute '(decode|first_stage_model|memory_used_decode)'|vae (input )?is invalid/i.test(text)) return 'ComfyUI 没做成：这个模型文件里没有 VAE：把 ace_1.5_vae.safetensors 放进 models/vae，或者换成整合包 ace_step_1.5_turbo_aio.safetensors';
  if (/out of memory|allocation on device|not enough memory|DefaultCPUAllocator/i.test(text)) return 'ComfyUI 没做成：显存或内存不够。把长度选短一点，或者启动 ComfyUI 时加 --lowvram；还不行就换一家来唱';
  return 'ComfyUI 没做成：' + said(text || '看 ComfyUI 的窗口里写了什么') + (error?.node_type ? `（${error.node_type}）` : '');
}
