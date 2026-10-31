// 账本: how much the phone has used, 今天 or by the month: four totals and, for a month, a column a day of the one tapped;
// then what they went on. Everything comes from core/ledger.js.
import {createView, esc, btn, heading, help, groupTitle, empty} from './common.js';
import {icon} from './icons.js';
import {TEXT_USES, dayOf, totalOf, headline} from '../core/ledger.js';

const VOICES = {fish: 'Fish Audio', mini: 'MiniMax', eleven: 'ElevenLabs', mimo: '小米 MiMo', doubao: '豆包语音', custom: '自己的接口'};
const PICTURES = {nai: 'NovelAI', gpt: 'GPT 生图', comfy: 'ComfyUI'};
const METRICS = [['text', '文字模型', '次'], ['voice', '配音', '字'], ['image', '出图', '张'], ['anlas', 'Anlas', '']];
/** Big numbers the way they are said: 3.2 万. */
export const amount = n => n >= 1e8 ? trim(n / 1e8) + ' 亿' : n >= 1e4 ? trim(n / 1e4) + ' 万' : String(Math.round(n));
const trim = n => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toString();
const pad = n => String(n).padStart(2, '0');
const monthDays = (y, m) => new Date(y, m + 1, 0).getDate();
const dayName = day => `${Number(day.slice(5, 7))} 月 ${Number(day.slice(8))} 日`;
const unitOf = key => METRICS.find(x => x[0] === key)[2];
/** 45 次, 1.5 万字. */
const counted = (n, unit) => `${amount(n)}${n >= 1e4 ? '' : ' '}${unit}`;
const said = (value, key) => key === 'anlas' ? `${amount(value)} Anlas` : counted(value, unitOf(key));

export function ledgerApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'ledger'), today = () => dayOf(), started = new Date();
  let period = 'today', year = started.getFullYear(), month = started.getMonth(), metric = 'text', picked = null, turn = 0;
  const atThisMonth = () => { const now = new Date(); return year === now.getFullYear() && month === now.getMonth(); };

  const tile = ([key, label, unit], value, chartable) => {
    const inside = `<small>${esc(label)}</small><strong>${esc(amount(value))}${unit ? `<i>${unit}</i>` : ''}</strong>`;
    return chartable ? `<button type="button" class="ledger-tile" data-metric="${key}" aria-pressed="${metric === key}">${inside}</button>` : `<div class="ledger-tile">${inside}</div>`;
  };
  /** Rows with a thin bar to compare them: what the amount is, the most in the group filling the bar. */
  const rows = list => {
    const most = Math.max(1, ...list.map(row => row.value));
    return list.sort((a, b) => b.value - a.value).map(row => `<div class="ledger-row"><div class="ledger-row-top"><span>${esc(row.name)}</span><b>${esc(row.shown)}</b></div><i class="ledger-bar"><b style="width:${Math.max(2, row.value / most * 100).toFixed(1)}%"></b></i>${row.note ? `<small>${esc(row.note)}</small>` : ''}</div>`).join('');
  };
  function breakdown(all) {
    const out = [];
    const text = Object.entries(all.text || {}).map(([use, x]) => ({name: TEXT_USES[use] || use, value: x.calls, shown: counted(x.calls, '次'), note: `发出约 ${amount(x.input)} token · 收到约 ${amount(x.output)} token`}));
    if (text.length) out.push(groupTitle('文字模型') + `<div class="group">${rows(text)}</div>`);
    const voice = Object.entries(all.voice || {}).map(([engine, x]) => ({name: VOICES[engine] || engine, value: x.chars, shown: counted(x.chars, '字'), note: counted(x.lines, '句')}));
    if (voice.length) out.push(groupTitle('配音') + `<div class="group">${rows(voice)}</div>`);
    const image = Object.entries(all.image || {}).map(([engine, n]) => ({name: PICTURES[engine] || engine, value: n, shown: counted(n, '张')}));
    if (image.length) out.push(groupTitle('出图') + `<div class="group">${rows(image)}</div>`);
    const other = [...(all.embed ? [{name: '向量模型', value: all.embed.calls, shown: counted(all.embed.calls, '次'), note: counted(all.embed.chars, '字')}] : []), ...(all.sfx ? [{name: '生成音效', value: all.sfx, shown: counted(all.sfx, '个')}] : [])];
    if (other.length) out.push(groupTitle('其他') + `<div class="group">${rows(other)}</div>`);
    return out.join('');
  }
  /** One column a day of the metric chosen; the day being read is the dark one. */
  function chart(days) {
    const count = monthDays(year, month), key = n => `${year}-${pad(month + 1)}-${pad(n)}`, value = day => headline(days.find(d => d.day === day))[metric] || 0;
    const values = Array.from({length: count}, (_, i) => value(key(i + 1))), most = Math.max(...values);
    if (!most) return `<p class="hint ledger-none">这个月没有${esc(METRICS.find(x => x[0] === metric)[1])}的用量</p>`;
    const on = picked && picked.startsWith(key(1).slice(0, 8)) ? picked : atThisMonth() ? today() : key(values.findLastIndex(x => x > 0) + 1);
    return `<div class="ledger-chart"><div class="ledger-head"><p class="ledger-read" data-read aria-live="polite">${esc(dayName(on))} · ${esc(said(value(on), metric))}</p><small class="ledger-top">最高 ${esc(amount(most))}</small></div>
      <div class="ledger-plot" data-plot style="--days:${count}">${values.map((x, i) => `<button type="button" class="ledger-col" data-day="${key(i + 1)}" data-value="${x}" aria-label="${esc(dayName(key(i + 1)))} ${esc(said(x, metric))}"${key(i + 1) === on ? ' data-on' : ''}><i style="height:${x ? Math.max(3, x / most * 100).toFixed(1) : 0}%"></i></button>`).join('')}</div>
      <div class="ledger-axis" style="--days:${count}">${[1, 8, 15, 22, 29].filter(n => n <= count).map(n => `<span style="grid-column:${n}">${n}</span>`).join('')}</div></div>
      <details class="ledger-table"><summary>每天的数字</summary><div>${values.map((x, i) => [i, x]).filter(([, x]) => x).reverse().map(([i, x]) => `<div class="ledger-table-row"><span>${esc(dayName(key(i + 1)))}</span><b>${esc(said(x, metric))}</b></div>`).join('')}</div></details>`;
  }
  async function render() {
    const ticket = ++turn, thisDay = today();
    const from = period === 'today' ? thisDay : `${year}-${pad(month + 1)}-01`, to = period === 'today' ? thisDay : `${year}-${pad(month + 1)}-${pad(monthDays(year, month))}`;
    const days = await api.ledgerDays(from, to);
    if (v.disposed || ticket !== turn) return;
    const all = totalOf(days), top = headline(all), any = days.length > 0;
    v.draw(heading('账本', help('记的是小手机自己发出去的请求：聊天、朋友圈、论坛、电话、记忆整理这些调用文字模型的次数，配音的字数（放过的语音不重复算），出图的张数。\n正文的回复是酒馆发的，不算在内。\ntoken 是按字数估的，Anlas 是画完读余额算的差（走中转读不到余额时不记）。实际花了多少，以各家的账单为准。\n开着「保存到酒馆」时，几台设备的用量加在一起。只记数字，不记内容。'), 'Ledger')
      + `<div class="segmented ledger-period"><button data-action="period" data-value="today" aria-pressed="${period === 'today'}">今天</button><button data-action="period" data-value="month" aria-pressed="${period === 'month'}">按月</button></div>`
      + (period === 'month' ? `<div class="ledger-month"><button type="button" class="round-button" data-action="month" data-step="-1" aria-label="上个月">${icon('back')}</button><strong>${year} 年 ${month + 1} 月</strong><button type="button" class="round-button" data-action="month" data-step="1" aria-label="下个月"${atThisMonth() ? ' disabled' : ''}>${icon('next')}</button></div>` : '')
      + `<div class="ledger-tiles">${METRICS.map(item => tile(item, top[item[0]], period === 'month')).join('')}</div>`
      + (period === 'month' && any ? chart(days) : '')
      + (any ? breakdown(all) : empty(period === 'today' ? '今天还没有用量' : '这个月没有用量', '小手机调用模型、配音、出图时，这里会记下来。', 'book'))
      + `<div class="actions ledger-actions">${btn('ledger-clear', icon('trash') + '清空账本', 'text-button danger-text')}</div>`);
  }
  /** The day under the finger: its column goes dark and the line above says how much, without drawing the page again. */
  function readDay(el) {
    if (!el || el.hasAttribute('data-on')) return;
    for (const col of v.root.querySelectorAll('.ledger-col[data-on]')) col.removeAttribute('data-on');
    el.setAttribute('data-on', '');
    picked = el.dataset.day;
    const read = v.root.querySelector('[data-read]');
    if (read) read.textContent = `${dayName(picked)} · ${said(Number(el.dataset.value), metric)}`;
  }
  const colAt = (plot, x) => { const cols = plot.querySelectorAll('.ledger-col'), box = plot.getBoundingClientRect(); return cols[Math.max(0, Math.min(cols.length - 1, Math.floor((x - box.left) / box.width * cols.length)))]; };
  v.root.addEventListener('pointerdown', e => { const plot = e.target.closest?.('[data-plot]'); if (plot) readDay(colAt(plot, e.clientX)); });
  v.root.addEventListener('pointermove', e => { const plot = e.target.closest?.('[data-plot]'); if (plot && (e.buttons || e.pointerType === 'mouse')) readDay(colAt(plot, e.clientX)); });
  v.on('click', '.ledger-col', el => readDay(el));
  v.on('click', '[data-metric]', el => { metric = el.dataset.metric; render(); });
  v.on('click', '[data-action]', async el => {
    const action = el.dataset.action;
    if (action === 'period') { period = el.dataset.value; picked = null; await render(); }
    else if (action === 'month') {
      const at = new Date(year, month + Number(el.dataset.step), 1);
      if (at > new Date()) return;
      year = at.getFullYear(); month = at.getMonth(); picked = null;
      await render();
    } else if (action === 'ledger-clear' && await ctx.confirm('清空账本？', '记下的用量都会删掉，从现在重新记。')) {
      await api.clearLedger();
      await render();
      ctx.notify('清空了');
    }
  });
  v.refresh = render;
  render();
  return v;
}
