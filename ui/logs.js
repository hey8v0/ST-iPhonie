import {createView, esc, heading, copyText} from './common.js';
import {icon} from './icons.js';
import {saveFile} from '../download.js';

export function colorJSON(value) {
  const text = JSON.stringify(value, null, 2) ?? 'null';
  return text.split('\n').map(line => {
    let at = 0, html = '';
    const tokens = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi;
    for (const m of line.matchAll(tokens)) {
      html += esc(line.slice(at, m.index));
      const kind = m[0][0] === '"' ? /^\s*:/.test(line.slice(m.index + m[0].length)) ? 'key' : 'string' : /true|false|null/.test(m[0]) ? 'literal' : 'number';
      html += `<span class="log-${kind}">${esc(m[0])}</span>`; at = m.index + m[0].length;
    }
    return html + esc(line.slice(at));
  });
}
export function logsApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'logs');
  let query = '', level = 'all', times = true, selected = null, detail = null, timer;
  const labels = {info: '记录', warn: '提醒', error: '错误'};
  const rows = () => api.getRequestLogs?.() || [];
  const filtered = () => rows().filter(r => (level === 'all' || r.level === level) && (!query || JSON.stringify(r).toLowerCase().includes(query.toLowerCase())));
  const clock = at => new Date(at).toLocaleTimeString('zh-CN', {hour12: false});
  const controls = scope => `<button class="icon-btn" data-log="time" aria-label="显示时间" aria-pressed="${times}">${icon('clock')}</button><button class="icon-btn" data-log="copy" data-scope="${scope}" aria-label="复制">${icon('copy')}</button><button class="icon-btn" data-log="download" data-scope="${scope}" aria-label="下载">${icon('download')}</button>`;
  function contents(row) {
    const lines = colorJSON({source: row.source, state: row.state, duration: row.duration, request: row.request, response: row.response});
    return `<pre class="log-code${times ? '' : ' logs-hide-time'}">${lines.map(line => `<span class="log-code-line"><span class="log-time">${esc(clock(row.at))}</span><code>${line || ' '}</code></span>`).join('')}</pre>`;
  }
  function paintRows() {
    const target = v.root.querySelector('[data-log-rows]'); if (!target) return;
    target.innerHTML = filtered().reverse().map(r => `<button type="button" class="log-row" data-log-id="${esc(r.id)}" data-level="${r.level}"><span class="log-time"${times ? '' : ' hidden'}>${esc(clock(r.at))}</span><span><strong>${esc(r.source)}</strong><small>${esc(r.state === 'pending' ? '进行中' : labels[r.level])}${r.duration !== undefined ? ` · ${r.duration} ms` : ''}</small></span>${icon('next')}</button>`).join('') || '<p class="hint">没有日志</p>';
    for (const b of v.root.querySelectorAll('[data-log-level]')) {
      const key = b.dataset.logLevel; b.setAttribute('aria-pressed', String(level === key));
      b.querySelector('small').textContent = rows().filter(r => key === 'all' || r.level === key).length;
    }
    if (detail?.live) {
      const row = rows().find(r => r.id === selected);
      if (row) detail.body.querySelector('[data-log-code]').innerHTML = contents(row);
      else detail.close();
    }
  }
  function render() {
    v.draw(`${heading('日志', '', 'Logs')}<div class="logs-tools"><input class="search" type="search" data-log-search aria-label="搜索日志" placeholder="搜索日志…" value="${esc(query)}"><div class="logs-actions">${controls('all')}<button class="icon-btn" data-log="clear" aria-label="清空">${icon('trash')}</button></div></div><div class="segmented logs-levels">${[['all','全部'],['warn','提醒'],['error','错误']].map(([k,l]) => `<button data-log-level="${k}" aria-pressed="${level === k}">${l} <small></small></button>`).join('')}</div><div class="log-list" data-log-rows></div>`);
    paintRows();
  }
  async function action(e) {
    const b = e.target.closest('[data-log]'); if (!b) return;
    const type = b.dataset.log;
    if (type === 'time') { times = !times; for (const root of [v.root, detail?.body].filter(Boolean)) for (const x of root.querySelectorAll('[data-log=time]')) x.setAttribute('aria-pressed', String(times)); paintRows(); return; }
    if (type === 'clear') { if (await ctx.confirm('清空日志？')) { api.clearRequestLogs(); paintRows(); } return; }
    const data = b.dataset.scope === 'one' ? rows().find(r => r.id === selected) : filtered();
    if (!data) return;
    const text = JSON.stringify(data, null, 2);
    try {
      if (type === 'copy') { if (!await copyText(ctx.win, text)) throw Error('复制失败'); ctx.notify('已复制'); }
      if (type === 'download') await saveFile(ctx.doc, new ctx.win.Blob([text], {type: 'application/json'}), 'ST-iPhonie-日志.json');
    } catch (error) { ctx.notify(error.message, {error: true}); }
  }
  v.root.addEventListener('click', action);
  v.on('click', '[data-log-level]', b => { level = b.dataset.logLevel; paintRows(); });
  v.on('input', '[data-log-search]', b => { query = b.value; paintRows(); });
  v.on('click', '[data-log-id]', b => {
    selected = b.dataset.logId; const row = rows().find(r => r.id === selected); if (!row) return;
    detail = ctx.dialog(row.source, `<div class="logs-actions">${controls('one')}</div><div data-log-code>${contents(row)}</div>`);
    detail.body.addEventListener('click', action);
    detail.onClose(() => { detail = null; selected = null; });
  });
  const key = e => { if (ctx.visible('logs') && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); v.root.querySelector('[data-log-search]')?.focus(); } };
  ctx.doc.addEventListener('keydown', key);
  v.onLogs = () => { ctx.win.clearTimeout(timer); timer = ctx.win.setTimeout(paintRows, 100); };
  v.refresh = render;
  const dispose = v.dispose;
  v.dispose = () => { ctx.win.clearTimeout(timer); ctx.doc.removeEventListener('keydown', key); detail?.close(); dispose(); };
  render(); return v;
}
