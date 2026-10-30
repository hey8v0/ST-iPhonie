// 自动识别 for 自己的接口: there are too many speech services to write each into the plugin, but almost all of them say
// what they take. A FastAPI service publishes /openapi.json, a Gradio app /gradio_api/info; a service known by its paths
// gets its one-click format; anything else can be told by a curl command from its docs. What cannot be read is also
// told apart here: a service that is not running, one that lets no web page ask it, an address that means this device.
import {CUSTOM_TEMPLATES, readVoiceList} from './custom-voice.js';

const LOOPBACK = /^(localhost|127(\.\d+){3}|\[::1\])$/i;
// What people paste after the address: the docs page, or the path of the speech call itself.
const TAIL = /\/(docs|redoc|openapi\.json|tts|tts_to_audio|v1\/audio\/speech|audio\/speech|v1\/tts|v1|voice(\/\w+)?|inference_\w+|api\/tts-generate|gradio_api(\/.*)?|ui|index\.html)\/?$/i;

/** An address as people type it, made one that can be asked: {base, notes} or {error}. */
export function cleanAddress(raw) {
  let text = String(raw ?? '').trim().replace(/：/g, ':').replace(/[。，]/g, '.').replace(/／/g, '/').replace(/\s+/g, '');
  const notes = [];
  if (!text) return {base: '', notes};
  if (text.startsWith('/proxy/')) { try { text = decodeURIComponent(text.slice(7)); } catch { text = text.slice(7); } }
  if (!/^https?:\/\//i.test(text)) text = 'http://' + text.replace(/^\/+/, '');
  let url;
  try { url = new URL(text); } catch { return {base: '', notes, error: '这不像一个地址，应该是 http://127.0.0.1:9880 这样的'}; }
  if (url.hostname === '0.0.0.0' || url.hostname === '[::]') { url.hostname = '127.0.0.1'; notes.push('0.0.0.0 是服务启动时显示的监听地址，不能直接连，换成了 127.0.0.1'); }
  let path = url.pathname.replace(/\/+$/, '');
  for (let i = 0; i < 3 && TAIL.test(path); i++) path = path.replace(TAIL, '');
  return {base: url.origin + path, notes};
}

/**
 * Whether and how a service can be asked. direct(url, init): the browser's own request; proxy(url): through the tavern.
 * {via: 'direct' | 'proxy' | '', state: 'ok' | 'blocked' | 'mixed' | 'loopback' | 'down', proxy: 'on' | 'off' | 'none'}
 */
export async function reachService(base, {direct, proxy, page = globalThis.location}) {
  const target = new URL(base), loop = LOOPBACK.test(target.hostname), mixed = page?.protocol === 'https:' && target.protocol === 'http:' && !loop;
  if (!mixed) { try { await direct(base); return {via: 'direct', state: 'ok', proxy: 'none'}; } catch { /* no answer it may read */ } }
  // An answer that may not be read still shows the service is there.
  let open = false;
  if (!mixed) { try { await direct(base, {mode: 'no-cors'}); open = true; } catch { /* not there, for this device */ } }
  let state = 'none';
  if (proxy) {
    try {
      const r = await proxy(base), said = await r.clone().text().catch(() => '');
      // (A tavern app with no proxy answers with its own page.)
      if (/CORS proxy is disabled/i.test(said) || (r.ok && /<title>\s*SillyTavern/i.test(said))) state = 'off';
      // The tavern's own 500: it could not reach the service either.
      else if (r.status === 500 && /^(internal server error)?$/i.test(said.trim())) state = 'on';
      else return {via: 'proxy', state: 'ok', proxy: 'on'};
    } catch { state = 'off'; }
  }
  return {via: '', proxy: state, state: mixed ? 'mixed' : open ? 'blocked' : loop && !LOOPBACK.test(page?.hostname || 'localhost') ? 'loopback' : 'down'};
}

const TURN_ON = '在酒馆文件夹的 config.yaml 里把 enableCorsProxy 改成 true，重启酒馆，再点一次。云酒馆找服务商开。';
/** What a failed reachService means, in plain words: {message, hint, address (a better one to try)}. */
export function explainReach(r, base, page = globalThis.location) {
  const target = new URL(base), elsewhere = page?.hostname && !LOOPBACK.test(page.hostname) ? `${target.protocol}//${page.hostname}${target.port ? ':' + target.port : ''}` : '';
  if (r.state === 'blocked') return r.proxy === 'on'
    ? {message: '服务开着，但它不让网页直接访问，酒馆的转发也连不上它。', hint: '酒馆和服务不在同一台机器时会这样：让服务开跨域（CORS），或者把酒馆和服务放到能互相连通的地方。'}
    : {message: '服务开着，但它不让网页直接访问（没开跨域），酒馆的转发也没开。', hint: TURN_ON};
  if (r.state === 'mixed') return {message: '酒馆是 https 打开的，浏览器不让它连 http 地址。', hint: r.proxy === 'on' ? '酒馆的转发也连不上它：看看地址对不对、服务开着没有，或者给服务配上 https。' : TURN_ON + '或者给服务配上 https。'};
  if (r.state === 'loopback') return {message: '127.0.0.1 指的是正在用的这台设备自己，这里连不到。', hint: `服务在电脑上的话，要写电脑的地址${elsewhere ? `（可能就是 ${elsewhere}）` : ''}，服务启动时要监听 0.0.0.0（GPT-SoVITS 加 -a 0.0.0.0），防火墙要放行这个端口。`, ...(elsewhere ? {address: elsewhere} : {})};
  return {message: '连不上：服务没开，或者地址、端口不对。', hint: LOOPBACK.test(target.hostname) ? '先看看服务的窗口有没有跑起来，窗口里会写端口。' : '服务开着的话，它要监听 0.0.0.0，那台电脑的防火墙要放行这个端口，两台设备要在同一个网络里。'};
}

// ---------- names: which field is what ----------
const NAMES = {
  refText: /^(prompt_?text|ref(er(ence)?)?_?(text|txt|transcript)|transcript|prompt_?transcript|audio_?text)$/i,
  text: /^(text|input|inputs|tts_?text|gen_?text|target_?text|content|sentence|prompt|speech_?text|synth(esis)?_?text|query|words|txt|text_?input|text_?to_?speak)$/i,
  refAudio: /^(ref(er(ence)?)?_?(audio|wav|file|sample)(_?(path|file|url|name))?|refer_?wav_?path|prompt_?(audio|wav|speech)(_?(path|file))?|speaker_?wav|audio_?paths?|voice_?file|sample_?(audio|path)|clone_?(audio|file)|audio_?file)$/i,
  voice: /^(voice|voice_?id|voice_?name|speaker|speaker_?id|speaker_?name|spk|spk_?id|spk_?name|character|character_?name|cha_?name|role|role_?name|sid|reference_?id)$/i,
  refLang: /^(prompt_?lang(uage)?|ref(er(ence)?)?_?lang(uage)?)$/i,
  lang: /^(text_?lang(uage)?|lang(uage)?(_?code)?|tts_?lang(uage)?|target_?lang(uage)?)$/i,
  format: /^(format|response_?format|media_?type|output_?format|audio_?format|file_?format)$/i,
  stream: /^(stream|streaming|streaming_?mode|is_?stream)$/i,
};
const kindOf = name => Object.keys(NAMES).find(k => NAMES[k].test(name)) || '';
/** The format to ask for: wav when it is on offer. */
const bestFormat = list => !list?.length ? 'wav' : list.find(x => /^wav$/i.test(x)) ?? list.find(x => /^mp3$/i.test(x)) ?? list[0];

// ---------- FastAPI: /openapi.json ----------
function schemaOf(doc, schema, depth = 0) {
  if (!schema || depth > 6) return schema || {};
  if (schema.$ref) return schemaOf(doc, schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], doc), depth + 1);
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(schema[key])) {
      const pick = schema[key].find(x => x?.type !== 'null') || schema[key][0], inner = schemaOf(doc, pick, depth + 1);
      return {...inner, ...(schema.default !== undefined ? {default: schema.default} : {}), ...(schema.title ? {title: schema.title} : {})};
    }
  }
  return schema;
}
/** The fields a call takes, and how they are sent. */
function fieldsOf(doc, op) {
  const query = (op.parameters || []).map(p => schemaOf(doc, p)).filter(p => p.in === 'query').map(p => ({name: p.name, schema: schemaOf(doc, p.schema), required: !!p.required}));
  const content = schemaOf(doc, op.requestBody)?.content || {};
  for (const [type, kind] of [['application/json', 'json'], ['multipart/form-data', 'multipart'], ['application/x-www-form-urlencoded', 'form']]) {
    if (!content[type]) continue;
    const body = schemaOf(doc, content[type].schema), required = new Set(body.required || []);
    return {kind, list: Object.entries(body.properties || {}).map(([name, s]) => ({name, schema: schemaOf(doc, s), required: required.has(name)}))};
  }
  return {kind: 'query', list: query};
}
const PLACE = /tts|speech|synth|speak|generat|infer|voice|say|audio/i, NOT_THIS = /set_|switch|load|train|upload|list|histor|delet|health|status|g2p|webhook|stream|refresh|preview|download|model|speaker/i;
/** The call that makes speech, from what a FastAPI service publishes: params, and what could not be worked out. */
export function fromOpenApi(doc, base) {
  let best = null;
  for (const [path, item] of Object.entries(doc?.paths || {})) {
    for (const method of ['post', 'get']) {
      const op = item?.[method];
      if (!op) continue;
      const fields = fieldsOf(doc, op);
      if (!fields.list.some(f => kindOf(f.name) === 'text')) continue;
      const kinds = fields.list.map(f => kindOf(f.name)), said = Object.keys(schemaOf(doc, op.responses?.['200'])?.content || {}).join(' ');
      const score = (PLACE.test(path) ? 6 : 0) - (NOT_THIS.test(path) ? 8 : 0) + (/\/v1\/audio\/speech$/.test(path) ? 6 : 0) + (kinds.includes('voice') || kinds.includes('refAudio') ? 3 : 0) + (/audio/i.test(said) ? 3 : 0) + (method === 'post' ? 1 : 0);
      if (!best || score > best.score) best = {score, path, method, fields};
    }
  }
  if (!best || best.score < 0) return null;
  const values = {}, unknown = [];
  for (const {name, schema, required} of best.fields.list) {
    const kind = kindOf(name), array = schema.type === 'array', file = schema.format === 'binary' || (array && schemaOf(doc, schema.items).format === 'binary');
    if (kind === 'text') values[name] = '{{text}}';
    else if (kind === 'refText') values[name] = '{{ref_text}}';
    else if (kind === 'refLang') values[name] = '{{ref_lang}}';
    else if (kind === 'lang' && !schema.enum) values[name] = '{{lang}}';
    else if (kind === 'refAudio') values[name] = file ? '{{ref_audio}}' : array ? ['{{voice}}'] : '{{voice}}';
    else if (file) values[name] = '{{ref_audio}}';
    else if (kind === 'voice') values[name] = '{{voice}}';
    else if (kind === 'format') values[name] = bestFormat(schema.enum);
    else if (kind === 'stream') values[name] = schema.type === 'integer' ? 0 : false;
    else if (required) {
      if (schema.default !== undefined) values[name] = schema.default;
      else if (schema.enum?.length) values[name] = schema.enum[0];
      else if (schema.type === 'boolean') values[name] = false;
      else if (schema.type === 'integer' || schema.type === 'number') values[name] = schema.minimum ?? 0;
      else { values[name] = name === 'model' ? 'tts-1' : ''; if (name !== 'model') unknown.push(name); }
    }
  }
  const url = base + best.path, query = best.fields.kind === 'query';
  const flat = Object.entries(values).map(([k, v]) => `${encodeURIComponent(k)}=${typeof v === 'string' && v.startsWith('{{') ? v : encodeURIComponent(v)}`).join('&');
  return {params: {service: `FastAPI 接口 ${best.path}`, url: query ? `${url}?${flat}` : url, method: best.method.toUpperCase(), body: query ? '' : JSON.stringify(values, null, 2), bodyType: query ? 'json' : best.fields.kind,
    answer: 'audio', path: '', headers: '', before: '', pcmRate: 24000, langMap: '', listUrl: '', listPath: ''}, unknown};
}

// ---------- Gradio: /gradio_api/info ----------
const LANGUAGE_WORDS = {zh: /^(zh|zh-cn|cn|中文|汉语|普通话|chinese|mandarin)$/i, ja: /^(ja|jp|日文|日语|japanese)$/i, en: /^(en|英文|英语|english)$/i, ko: /^(ko|kr|韩文|韩语|korean)$/i, yue: /^(yue|粤语|cantonese)$/i};
/** The choices of a language box as 语言写法 lines (zh=中文), '' when they are not languages. */
function languageMap(choices) {
  const lines = Object.entries(LANGUAGE_WORDS).flatMap(([code, word]) => { const found = (choices || []).find(c => word.test(String(c))); return found === undefined ? [] : [`${code}=${found}`]; });
  return lines.some(l => /^(zh|en|ja)=/.test(l)) ? lines.join('\n') : '';
}
const choicesOf = p => p?.type?.enum || (String(p?.python_type?.type || '').match(/^Literal\[(.*)\]$/)?.[1].match(/'[^']*'|"[^"]*"/g) || []).map(x => x.slice(1, -1));
const labelOf = p => `${p.label || ''} ${p.parameter_name || ''}`;
const GRADIO_PLACE = /tts|infer|generat|synth|speak|gen|clone|predict|convert|run|say/i, GRADIO_NOT = /lambda|load|change|update|refresh|upload|stop|clear|example|preview|save|delete|switch|set_/i;
/** The call that makes speech, from what a Gradio app says about itself. prefix: '/gradio_api' on Gradio 5, '' on 4. */
export function fromGradioInfo(info, base, prefix = '') {
  const textBox = p => /textbox|textarea/i.test(p.component || '');
  const candidates = Object.entries(info?.named_endpoints || {}).filter(([, e]) => (e.returns || []).some(r => /audio/i.test(r.component || '')) && (e.parameters || []).some(textBox));
  if (!candidates.length) return null;
  const score = ([name, e]) => (GRADIO_PLACE.test(name) ? 5 : 0) - (GRADIO_NOT.test(name) ? 8 : 0) + ((e.parameters || []).some(p => /audio/i.test(p.component || '')) ? 3 : 0) + Math.min((e.parameters || []).length, 3);
  const [name, endpoint] = candidates.sort((a, b) => score(b) - score(a))[0];
  const params = endpoint.parameters, unknown = [];
  let text = -1, ref = -1, refText = -1, langMap = '';
  params.forEach((p, i) => {
    if (!textBox(p)) return;
    const label = labelOf(p);
    if (refText < 0 && /参考.*(文|字)|参考文本|prompt.*text|ref.*text|transcri|reference.*text|audio.*text/i.test(label)) refText = i;
  });
  const wanted = /台词|合成|文本|文字|内容|要说|text|input|gen|target|sentence/i;
  text = params.findIndex((p, i) => textBox(p) && i !== refText && wanted.test(labelOf(p)) && !/情感|emo|negative|负面/i.test(labelOf(p)));
  if (text < 0) text = params.findIndex((p, i) => textBox(p) && i !== refText);
  ref = params.findIndex(p => /audio/i.test(p.component || '') && !/情感|情绪|emo/i.test(labelOf(p)));
  const data = params.map((p, i) => {
    if (i === text) return '{{text}}';
    if (i === refText) return '{{ref_text}}';
    if (i === ref) return {path: '{{ref_audio}}', meta: {_type: 'gradio.FileData'}};
    const label = labelOf(p), choices = choicesOf(p);
    if (/语言|lang/i.test(label) && choices.length) {
      const map = languageMap(choices);
      if (map) { langMap ||= map; return /参考|prompt|ref/i.test(label) ? '{{ref_lang}}' : '{{lang}}'; }
    }
    if (p.parameter_has_default) return p.parameter_default ?? null;
    if (/checkbox/i.test(p.component || '')) return false;
    if (/slider|number/i.test(p.component || '')) return 0;
    if (choices.length) return choices[0];
    if (textBox(p)) return '';
    if (/audio|image|video|file/i.test(p.component || '')) return null;
    unknown.push(String(p.label || p.parameter_name || `第 ${i + 1} 项`).trim());
    return null;
  });
  const call = name.replace(/^\/+/, '');
  return {api: call, params: {service: `网页界面 /${call}`, url: `${base}${prefix}/call/${call}`, method: 'POST', body: JSON.stringify({data}, null, 2), bodyType: 'json', answer: 'gradio', path: '', headers: '', before: '', pcmRate: 24000, langMap, listUrl: '', listPath: ''}, unknown};
}

// ---------- a curl command ----------
/** The words of a shell command, quotes and line ends as bash and cmd write them. */
function shellWords(source) {
  const src = String(source).replace(/\\\r?\n|\^\r?\n|`\r?\n/g, ' '), words = [];
  let word = null, quote = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i], next = src[i + 1];
    if (quote === "'") { if (c === "'") quote = ''; else word += c; continue; }
    if (quote === '"') {
      if (c === '\\' && next !== undefined && /["\\$`]/.test(next)) { word += next; i++; }
      else if (c === '"') quote = '';
      else word += c;
      continue;
    }
    if (/\s/.test(c)) { if (word !== null) { words.push(word); word = null; } continue; }
    word ??= '';
    if (c === "'" || c === '"') quote = c;
    else if ((c === '\\' || c === '^') && next !== undefined) { word += next; i++; }
    else word += c;
  }
  if (word !== null) words.push(word);
  return words;
}
const NO_VALUE = new Set(['-s', '-S', '-L', '-k', '-v', '-N', '-i', '-f', '-g', '-sS', '-Ss', '-sL', '-Ls', '--silent', '--show-error', '--compressed', '--location', '--insecure', '--verbose', '--no-buffer', '--include', '--fail', '--globoff']);
const SKIP_VALUE = new Set(['-o', '--output', '-m', '--max-time', '--connect-timeout', '-A', '--user-agent', '-e', '--referer', '-b', '--cookie', '-c', '--cookie-jar', '-x', '--proxy', '-w', '--write-out', '--retry']);
/** What a value in a curl command should become; the value itself when it is nothing special. */
function slotted(key, value) {
  if (typeof value === 'string' && /\{\{\s*\w+\s*\}\}/.test(value)) return value;
  const kind = kindOf(key);
  if (Array.isArray(value)) return kind === 'refAudio' ? ['{{voice}}'] : value.map(v => (v && typeof v === 'object' ? slottedObject(v) : v));
  if (value && typeof value === 'object') return slottedObject(value);
  if (kind === 'text') return '{{text}}';
  if (kind === 'refText') return '{{ref_text}}';
  if (kind === 'refLang') return '{{ref_lang}}';
  if (kind === 'lang') return '{{lang}}';
  if (kind === 'refAudio' || kind === 'voice') return '{{voice}}';
  if (kind === 'stream') return typeof value === 'string' ? (/^\d+$/.test(value) ? '0' : 'false') : typeof value === 'number' ? 0 : false;
  return value;
}
const slottedObject = object => Object.fromEntries(Object.entries(object).map(([k, v]) => [k, slotted(k, v)]));
/** The longest words in a value, for a command whose line is under a name no one could guess. */
function longestText(value) {
  let best = null;
  const walk = (holder, key) => { const v = holder[key]; if (typeof v === 'string') { if (!/\{\{/.test(v) && !/^https?:|[\\/]/.test(v) && /[\s　]|[^\x00-\x7f]/.test(v) && (!best || v.length > best.holder[best.key].length)) best = {holder, key}; } else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v, k); };
  for (const k of Object.keys(value)) walk(value, k);
  return best;
}
/**
 * Settings from a curl command, as most services' docs give one. A key in it goes to the key store, never into the
 * settings. {params, key, notes} or {error}.
 */
export function fromCurl(source) {
  const words = shellWords(source), start = words.findIndex(w => /^curl(\.exe)?$/i.test(w));
  const rest = start >= 0 ? words.slice(start + 1) : words;
  let url = '', method = '', getForm = false, key = '', json = false;
  const headers = [], data = [], encoded = [], forms = [];
  for (let i = 0; i < rest.length; i++) {
    let w = rest[i], attached = null;
    const long = w.match(/^(--[\w-]+)=(.*)$/s);
    if (long) { w = long[1]; attached = long[2]; }
    else if (/^-[XHdF].+/.test(w)) { attached = w.slice(2); w = w.slice(0, 2); }
    const value = () => attached ?? rest[++i] ?? '';
    if (w === '-X' || w === '--request') method = value().toUpperCase();
    else if (w === '-H' || w === '--header') headers.push(value());
    else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii'].includes(w)) data.push(value());
    else if (w === '--json') { data.push(value()); json = true; }
    else if (w === '--data-urlencode') encoded.push(value());
    else if (w === '-F' || w === '--form') forms.push(value());
    else if (w === '--url') url = value();
    else if (w === '-G' || w === '--get') getForm = true;
    else if (w === '-u' || w === '--user' || SKIP_VALUE.has(w)) value();
    else if (NO_VALUE.has(w) || w.startsWith('-')) continue;
    else if (!url) url = w;
  }
  if (!url) return {error: '没找到地址：要粘贴整条 curl 命令'};
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  let target;
  try { target = new URL(url); } catch { return {error: '命令里的地址读不出来：' + url.slice(0, 60)}; }
  // The headers: a key goes to the key store.
  const kept = [];
  for (const line of headers) {
    const m = line.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
    if (!m || /^(content-type|accept|user-agent|content-length|host)$/i.test(m[1])) continue;
    const bearer = m[2].match(/^Bearer\s+(.+)$/i);
    if (/^authorization$/i.test(m[1]) && bearer) { if (!/\{\{/.test(bearer[1]) && !/^(your|xxx|\$)/i.test(bearer[1])) key = bearer[1].trim(); continue; }
    if (/key|token|secret/i.test(m[1]) && !/\{\{/.test(m[2])) { if (!/^(your|xxx|\$)/i.test(m[2])) key = m[2].trim(); kept.push(`${m[1]}: {{key}}`); continue; }
    kept.push(`${m[1]}: ${m[2]}`);
  }
  // The body.
  const typed = headers.map(h => h.match(/^\s*content-type\s*:\s*(.*)$/i)?.[1] || '').find(Boolean) || '';
  let body = null, bodyType = 'json';
  const raw = data.join('&'), isForm = typed && /urlencoded/i.test(typed);
  if (forms.length) {
    bodyType = 'multipart'; body = {};
    for (const f of forms) { const at = f.indexOf('='), k = f.slice(0, at), v = f.slice(at + 1); body[k] = v.startsWith('@') ? '{{ref_audio}}' : v; }
  } else if (raw && !isForm && !encoded.length) {
    // (A Windows path in a command: the shell has taken one backslash of two.)
    try { body = JSON.parse(raw); } catch { try { body = JSON.parse(raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')); } catch { /* a form, then */ } }
    if ((body === null || typeof body !== 'object') && !json) { body = null; }
    else if (body === null) return {error: '命令里的 JSON 读不出来，检查一下引号'};
  }
  if (body === null && (raw || encoded.length)) {
    bodyType = 'form'; body = {};
    for (const [k, v] of new URLSearchParams(raw)) body[k] = v;
    for (const e of encoded) { const at = e.indexOf('='); if (at > 0) body[e.slice(0, at)] = e.slice(at + 1); }
  }
  // A query says the same things a body does.
  const query = Object.fromEntries(target.searchParams);
  if (getForm && body) { Object.assign(query, body); body = null; }
  const mappedQuery = slottedObject(query), mappedBody = body && slottedObject(body);
  const mapped = {...mappedQuery, ...(mappedBody || {})}, has = slot => JSON.stringify(mapped).includes(`{{${slot}}}`);
  if (!has('text')) {
    const found = longestText(mappedBody || {}) || longestText(mappedQuery);
    if (!found) return {error: '没认出哪个是台词：在命令里把台词写成 {{text}} 再粘贴'};
    found.holder[found.key] = '{{text}}';
  }
  const flat = Object.entries(mappedQuery).map(([k, v]) => `${encodeURIComponent(k)}=${/^\{\{\s*\w+\s*\}\}$/.test(String(v)) ? v : encodeURIComponent(v)}`).join('&');
  const address = target.origin + target.pathname + (flat ? '?' + flat : '');
  const notes = [];
  if (key) notes.push('命令里的密钥存好了');
  return {params: {service: '粘贴的 curl 命令', url: address, method: method === 'GET' || (!method && !mappedBody) ? 'GET' : 'POST', body: mappedBody ? JSON.stringify(mappedBody, null, 2) : '', bodyType, headers: kept.join('\n'), answer: 'audio', path: '', before: '', pcmRate: 24000, langMap: '', listUrl: '', listPath: ''}, key, notes};
}

// ---------- telling which service it is ----------
const template = id => CUSTOM_TEMPLATES.find(t => t.id === id);
/** Paths that answer in a way only one service does, for those that publish nothing (Flask and the like). */
const PROBES = [
  ['fish', '/v1/references/list?format=json', j => Array.isArray(j?.reference_ids)],
  ['gsvi', '/character_list', j => j && !Array.isArray(j) && typeof j === 'object' && Object.keys(j).length > 0 && Object.values(j).every(Array.isArray)],
  ['vits-simple', '/voice/speakers', j => Array.isArray(j?.VITS)],
  ['alltalk', '/api/voices', j => Array.isArray(j?.voices)],
  ['chatterbox', '/get_predefined_voices', j => Array.isArray(j)],
  ['index-vllm', '/audio/voices', j => j && typeof j === 'object' && !Array.isArray(j?.voices)],
  ['xtts', '/speakers_list', j => Array.isArray(j)],
];
const TITLES = [['chattts-ui', /chattts/i], ['cosyvoice-api', /cosyvoice/i], ['alltalk', /alltalk/i], ['chatterbox', /chatterbox/i], ['kokoro', /kokoro/i], ['fish', /fish.?speech/i], ['gsvi', /gsvi|gpt-sovits-inference/i]];
const MODEL_WORD = /tts|speech|audio|voice|kokoro|sovits|cosy|fish|moss/i;

/**
 * Which service answers at base, and the settings for it. ask(path) → {status, ok, type, text, json()} or null.
 * {id, name, params, unknown, voices (how many it lists)} or null.
 */
export async function detectService(base, ask) {
  const read = async path => { const r = await ask(path); try { return r ? {...r, data: JSON.parse(r.text)} : null; } catch { return r ? {...r, data: null} : null; } };
  const finish = async (found, extra = {}) => {
    const out = {...found, unknown: found.unknown || [], ...extra};
    if (out.params.listUrl) { const list = await read(out.params.listUrl); if (list?.ok && list.data) out.voices = readVoiceList(list.data, out.params.listPath).length; }
    return out;
  };
  const known = (id, more = {}) => { const t = template(id); return finish({id, name: t.name, params: {...t.fill(base), ...more}}); };
  const openai = async () => {
    const [voices, others, models] = await Promise.all([read('/v1/audio/voices'), read('/v1/voices'), read('/v1/models')]);
    const list = models?.ok ? models.data?.data || models.data?.models : null, ids = Array.isArray(list) ? list.map(m => String(m?.id ?? m)) : [];
    if (ids.includes('kokoro')) return known('kokoro');
    const model = ids.find(id => MODEL_WORD.test(id)) || '';
    const t = template('openai'), params = t.fill(base);
    if (model) params.body = params.body.replace('tts-1', model);
    if (voices?.ok && voices.data) params.listUrl = base + '/v1/audio/voices';
    else if (others?.ok && others.data) params.listUrl = base + '/v1/voices';
    return finish({id: 'openai', name: t.name, params});
  };
  // A Gradio app first: new ones publish /openapi.json too, about Gradio's own routes.
  const gradio5 = (await read('/gradio_api/info'))?.data, info = gradio5?.named_endpoints ? gradio5 : (await read('/info'))?.data;
  if (info?.named_endpoints) {
    const found = fromGradioInfo(info, base, gradio5?.named_endpoints ? '/gradio_api' : '');
    if (!found) return {id: 'gradio-none', name: '网页界面（Gradio）', params: null, unknown: [], note: '这是个网页界面，但没找到出声音的接口：它可能没开放 API'};
    const name = found.api === 'gen_single' ? 'IndexTTS（网页界面）' : found.params.service;
    return finish({id: found.api === 'gen_single' ? 'indextts' : 'gradio', name, params: {...found.params, service: name}, unknown: found.unknown});
  }
  // What it publishes says the most.
  const doc = (await read('/openapi.json'))?.data;
  if (doc?.paths) {
    const paths = Object.keys(doc.paths);
    const special = CUSTOM_TEMPLATES.find(t => t.id !== 'openai' && t.paths?.some(p => paths.includes(p)));
    if (special) return known(special.id);
    if (template('openai').paths.some(p => paths.includes(p))) return openai();
    const found = fromOpenApi(doc, base);
    if (found) return finish({id: 'openapi', name: found.params.service, ...found});
  }
  // Those that publish nothing.
  const answers = await Promise.all(PROBES.map(([, path]) => read(path)));
  const hit = PROBES.findIndex(([, , test], i) => answers[i]?.ok && answers[i].data && test(answers[i].data));
  if (hit >= 0) return known(PROBES[hit][0]);
  const [voices, models] = await Promise.all([read('/v1/audio/voices'), read('/v1/models')]);
  if ((voices?.ok && voices.data) || (models?.ok && (models.data?.data || models.data?.models))) return openai();
  const tts = await read('/tts');
  if (/text params lost/i.test(tts?.text || '')) return known('chattts-ui');
  if (/ref_audio_path is required/i.test(tts?.text || '')) return known('gpt-sovits');
  const home = await ask('/');
  const title = home?.text?.match(/<title[^>]*>([^<]*)/i)?.[1] || '';
  const named = TITLES.find(([, word]) => word.test(title));
  if (named) return known(named[0]);
  return null;
}

/** The addresses to look at when none was typed: this device, and the machine the tavern runs on. */
export function scanTargets(page = globalThis.location) {
  const ports = [...new Set([...CUSTOM_TEMPLATES.map(t => t.port).filter(Boolean), 7861])];
  const hosts = ['127.0.0.1', ...(page?.hostname && !LOOPBACK.test(page.hostname) ? [page.hostname] : [])];
  const own = String(page?.port || '');
  return hosts.flatMap(host => ports.filter(port => !(String(port) === own)).map(port => `http://${host}:${port}`));
}
