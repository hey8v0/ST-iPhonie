// 参数网格 in the 参数 page of the drawing app: which parameters change along each axis, how many pictures that makes, and
// the button that draws them. What the values mean is in core/nai-grid.js; the app draws the cells and puts them together.
import {esc, btn, help} from './common.js';
import {icon} from './icons.js';
import {GRID_PARAMS, GRID_MAX, gridParam, gridChoices, buildGrid} from '../core/nai-grid.js';

const AXES = [['x', 'X 轴（列）'], ['y', 'Y 轴（行）']];
const newEntry = () => ({param: '', text: '', choices: []});
const placeholder = type => type === 'seed' ? '例如 123,456，或 r3 每次随机 3 个' : type === 'string' ? '一行一个' : '例如 1,2,5-9 或 0.5-2:0.25';

export function gridPanel({ctx, api, run, render}) {
  const state = () => api.getState().draw;
  const context = () => { const p = state().params; return {model: p.model, sampler: p.sampler}; };
  const grid = () => state().grid;
  const put = next => api.saveDraw({grid: next});
  function values(entry, axis, i) {
    const def = gridParam(entry.param);
    if (!def) return '';
    if (def.type === 'enum') return `<div class="grid-choices">${gridChoices(def.key, context()).map(c => `<button type="button" data-action="grid-choice" data-axis="${axis}" data-index="${i}" data-value="${esc(c.value)}" aria-pressed="${entry.choices.includes(c.value)}">${esc(c.label)}</button>`).join('')}</div>`;
    if (def.type === 'string') return `<textarea data-grid-text data-axis="${axis}" data-index="${i}" rows="2" placeholder="${placeholder(def.type)}" aria-label="${esc(def.label)}">${esc(entry.text)}</textarea>`;
    return `<input type="text" data-grid-text data-axis="${axis}" data-index="${i}" value="${esc(entry.text)}" placeholder="${placeholder(def.type)}" aria-label="${esc(def.label)}" autocomplete="off" spellcheck="false">${def.type === 'seed' ? btn('grid-seed', icon('dice') + '加一个固定的随机种子', 'text-button', `data-axis="${axis}" data-index="${i}"`) : ''}`;
  }
  const entryHTML = (entry, axis, i) => `<div class="grid-entry"><div class="inline-row"><span class="select"><select data-grid-param data-axis="${axis}" data-index="${i}" aria-label="参数"><option value="">选一个参数</option>${GRID_PARAMS.map(p => `<option value="${p.key}"${p.key === entry.param ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></span>${btn('grid-remove', icon('close'), 'text-button', `data-axis="${axis}" data-index="${i}" aria-label="去掉这个参数"`)}</div>${values(entry, axis, i)}</div>`;
  /** One line on what the grid would be, or what is wrong with it. */
  function summary() {
    // Random seeds are only counted here: each is made when the grid is drawn.
    const plan = buildGrid(grid(), context(), () => 0);
    if (plan.error) return {ok: false, text: plan.error};
    return {ok: true, text: `${plan.cells.length} 张（${plan.columns}×${plan.rows}）`};
  }
  function html() {
    const g = grid(), s = summary(), some = g.x.length || g.y.length;
    return `<details data-group="draw-grid"${some ? ' open' : ''}><summary>参数网格<small class="fold-note" data-grid-note>${some && s.ok ? esc(s.text) : ''}</small></summary><div class="fold-body">
      <p class="hint" data-keep-hint>同一张图换几个参数各画一张，排成一张对比表。${help(`每格是一张单独的图，一次最多 ${GRID_MAX} 张，都放进相册；最后再拼一张带标签的大图。\n\n一个轴上可以放几个参数，它们一起变，个数不够的沿用最后一个。\n\n写数字：1,2,5-9 是 1、2、5 到 9；0.5-2:0.25 是从 0.5 到 2 每次加 0.25。\n种子：r3 是每次随机 3 个。没放种子时，所有格子用同一个种子，只比较参数。`)}</p>
      ${AXES.map(([axis, name]) => `<div class="grid-axis"><b>${name}</b>${g[axis].map((entry, i) => entryHTML(entry, axis, i)).join('')}${btn('grid-add', icon('add') + '加一个参数', 'chip-button', `data-axis="${axis}"`)}</div>`).join('')}
      <p class="hint${s.ok || !some ? '' : ' error-copy'}" data-grid-state data-keep-hint>${some ? esc(s.text) : ''}</p>
      <div class="actions">${btn('grid-run', icon('layers') + '画这张网格', 'primary', `${some && s.ok ? '' : 'disabled'}`)}</div>
    </div></details>`;
  }
  /** Text typed: kept and counted without drawing the page again, so the keyboard stays up. */
  function typed(el) {
    const next = structuredClone(grid()), entry = next[el.dataset.axis]?.[Number(el.dataset.index)];
    if (!entry) return;
    entry.text = el.value;
    put(next);
    const root = el.closest('[data-group=draw-grid]'), s = summary();
    root.querySelector('[data-grid-state]').textContent = s.text;
    root.querySelector('[data-grid-state]').classList.toggle('error-copy', !s.ok);
    root.querySelector('[data-grid-note]').textContent = s.ok ? s.text : '';
    root.querySelector('[data-action=grid-run]').disabled = !s.ok;
  }
  function picked(el) {
    const next = structuredClone(grid()), entry = next[el.dataset.axis]?.[Number(el.dataset.index)];
    if (!entry) return;
    next[el.dataset.axis][Number(el.dataset.index)] = {...newEntry(), param: el.value};
    put(next); render();
  }
  async function click(el) {
    const axis = el.dataset.axis, i = Number(el.dataset.index);
    switch (el.dataset.action) {
      case 'grid-add': { const next = structuredClone(grid()); next[axis].push({...newEntry(), param: GRID_PARAMS.find(p => !next[axis].some(e => e.param === p.key))?.key || 'steps'}); put(next); render(); return true; }
      case 'grid-remove': { const next = structuredClone(grid()); next[axis].splice(i, 1); put(next); render(); return true; }
      case 'grid-choice': {
        const next = structuredClone(grid()), entry = next[axis][i], value = el.dataset.value;
        entry.choices = entry.choices.includes(value) ? entry.choices.filter(c => c !== value) : [...entry.choices, value];
        put(next); render();
        return true;
      }
      case 'grid-seed': { const next = structuredClone(grid()), entry = next[axis][i]; entry.text = [entry.text.trim(), String(Math.floor(Math.random() * 4294967295))].filter(Boolean).join(','); put(next); render(); return true; }
      case 'grid-run': await run(buildGrid(grid(), context())); return true;
    }
    return false;
  }
  return {html, click, typed, picked};
}
