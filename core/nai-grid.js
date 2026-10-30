// 参数网格 (NovelAI's Grid Generation): one picture for every combination of the values given on two axes, to compare them
// side by side. An axis holds one or more parameters that change together, row by row; a parameter with fewer values
// keeps its last one. Each cell is an ordinary picture, with its own request in the queue.
import {NAI_MODELS, NAI_MODEL_NAMES, NAI_SAMPLER_NAMES, samplersFor, schedulesFor} from './novelai.js';

/** As many values as one parameter may list, and as many pictures as one grid may make, as in its app. */
export const GRID_MAX = 40;
export const GRID_PARAMS = Object.freeze([
  {key: 'steps', type: 'integer', label: '步数'}, {key: 'scale', type: 'number', label: '提示词引导'}, {key: 'cfgRescale', type: 'number', label: '引导修正'},
  {key: 'uncondScale', type: 'number', label: '负面强度'}, {key: 'seed', type: 'seed', label: '种子'}, {key: 'width', type: 'integer', label: '宽'}, {key: 'height', type: 'integer', label: '高'},
  {key: 'sampler', type: 'enum', label: '采样器'}, {key: 'schedule', type: 'enum', label: '噪声调度'}, {key: 'model', type: 'enum', label: '模型'},
  {key: 'smea', type: 'enum', label: 'SMEA'}, {key: 'prompt', type: 'string', label: '提示词'}, {key: 'negative', type: 'string', label: '负面'}
]);
export const gridParam = key => GRID_PARAMS.find(p => p.key === key) || null;
const SMEA_CHOICES = [{value: 'off', label: '关'}, {value: 'on', label: 'SMEA'}, {value: 'dyn', label: 'SMEA DYN'}];
/** The choices of a parameter that has a list; context: {model, sampler}, what is in use now. */
export function gridChoices(key, {model, sampler} = {}) {
  if (key === 'sampler') return samplersFor(model).map(value => ({value, label: NAI_SAMPLER_NAMES[value] || value}));
  if (key === 'schedule') return schedulesFor(model, sampler).map(value => ({value, label: value}));
  if (key === 'model') return NAI_MODELS.map(value => ({value, label: NAI_MODEL_NAMES[value] || value}));
  if (key === 'smea') return SMEA_CHOICES;
  return [];
}
const short = text => text.length > 40 ? text.slice(0, 39) + '…' : text;

/** "1,2,5-9" or "0.5-2:0.25": {values} or {error}. */
export function parseNumbers(text, integer = false) {
  const values = [], read = integer ? v => Number.parseInt(v, 10) : Number.parseFloat;
  for (const raw of String(text).split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const range = /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?$/.exec(part);
    if (range) {
      const from = read(range[1]), to = read(range[2]), step = range[3] ? Number.parseFloat(range[3]) : 1;
      if (step <= 0 || to < from) return {error: `范围写得不对：${part}`};
      const n = Math.floor((to - from) / step + 1e-9) + 1;
      if (values.length + n > GRID_MAX) return {error: `这个范围太多了：${part}（最多 ${GRID_MAX} 个）`};
      for (let i = 0; i < n; i++) { const v = from + i * step; values.push(integer ? Math.round(v) : Number(v.toPrecision(12))); }
    } else if (/^-?\d+(\.\d+)?$/.test(part)) values.push(read(part));
    else return {error: `不是数字：${part}`};
  }
  return values.length > GRID_MAX ? {error: `数字太多了（最多 ${GRID_MAX} 个）`} : {values};
}
/** Numbers as above, and "r3" for three new random seeds each time. */
export function parseSeeds(text, random = () => Math.floor(Math.random() * 4294967295)) {
  const values = [];
  for (const raw of String(text).split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const many = /^r(\d*)$/i.exec(part);
    if (many) {
      const n = many[1] ? Number.parseInt(many[1], 10) : 1;
      if (n < 1 || values.length + n > GRID_MAX) return {error: `随机种子的数量不对：${part}`};
      for (let i = 0; i < n; i++) values.push(random());
    } else {
      const read = parseNumbers(part, true);
      if (read.error) return read;
      values.push(...read.values);
    }
  }
  return {values};
}

/** The values of one entry: a list, undefined when it has none yet, or {error}. */
function entryValues(def, entry, random) {
  if (def.type === 'number' || def.type === 'integer' || def.type === 'seed') {
    const read = def.type === 'seed' ? parseSeeds(entry.text, random) : parseNumbers(entry.text, def.type === 'integer');
    if (read.error) return {error: `${def.label}：${read.error}`};
    return read.values.length ? read.values : undefined;
  }
  if (def.type === 'string') { const lines = String(entry.text).split('\n').map(l => l.trim()).filter(Boolean); return lines.length ? lines.slice(0, GRID_MAX) : undefined; }
  return entry.choices?.length ? [...entry.choices] : undefined;
}
/** One axis: {defs, rows, labels}, undefined when it says nothing, or {error}. */
export function gridAxis(entries, context = {}, random) {
  const used = [];
  for (const entry of entries || []) {
    const def = gridParam(entry.param);
    if (!def) continue;
    const values = entryValues(def, entry, random);
    if (values?.error) return values;
    if (!values) continue;
    if (used.some(u => u.def.key === def.key)) return {error: `${def.label} 在同一个轴上写了两次`};
    const choices = gridChoices(def.key, context), labels = values.map(v => choices.find(c => c.value === v)?.label ?? String(v));
    used.push({def, values, labels});
  }
  if (!used.length) return undefined;
  const size = Math.max(...used.map(u => u.values.length)), rows = [], labels = [];
  const at = (list, i) => list[Math.min(i, list.length - 1)];
  for (let i = 0; i < size; i++) { rows.push(used.map(u => at(u.values, i))); labels.push(used.map(u => at(u.labels, i)).join('，')); }
  return {defs: used.map(u => u.def), rows, labels};
}
/**
 * The whole grid from the saved {x, y} entries: {cells: [{overrides, xLabel, yLabel}], columns, rows, axisX, axisY}, or
 * {error}. Row by row from the top left. overrides: {params, prompt?, negative?} for that picture.
 */
export function buildGrid({x, y} = {}, context = {}, random) {
  const ax = gridAxis(x, context, random), ay = gridAxis(y, context, random);
  if (ax?.error) return ax;
  if (ay?.error) return ay;
  if (!ax && !ay) return {error: '至少给一个轴选上参数并写上值'};
  const both = ax?.defs.find(d => ay?.defs.some(o => o.key === d.key));
  if (both) return {error: `${both.label} 不能同时放在两个轴上`};
  const columns = ax?.rows || [undefined], rows = ay?.rows || [undefined];
  if (columns.length * rows.length > GRID_MAX) return {error: `这样要画 ${columns.length * rows.length} 张，一次最多 ${GRID_MAX} 张`};
  const put = (overrides, defs, row) => defs.forEach((def, i) => { if (def.key === 'prompt') overrides.prompt = String(row[i]); else if (def.key === 'negative') overrides.negative = String(row[i]); else overrides.params[def.key] = row[i]; });
  const cells = [];
  rows.forEach((rowY, iy) => columns.forEach((rowX, ix) => {
    const overrides = {params: {}};
    if (rowX) put(overrides, ax.defs, rowX);
    if (rowY) put(overrides, ay.defs, rowY);
    cells.push({overrides, xLabel: ax ? short(ax.labels[ix]) : '', yLabel: ay ? short(ay.labels[iy]) : ''});
  }));
  return {cells, columns: columns.length, rows: rows.length, axisX: ax?.defs.map(d => d.label).join('、') || '', axisY: ay?.defs.map(d => d.label).join('、') || ''};
}
/** Saved entries made tidy: only known parameters, text and choices of a sensible size. */
export function normalizeGrid(value) {
  const axis = list => (Array.isArray(list) ? list : []).filter(e => gridParam(e?.param)).slice(0, 6).map(e => ({param: e.param, text: String(e.text ?? '').slice(0, 2000), choices: (Array.isArray(e.choices) ? e.choices : []).map(String).slice(0, GRID_MAX)}));
  return {x: axis(value?.x), y: axis(value?.y)};
}
