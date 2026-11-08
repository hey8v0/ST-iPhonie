// 记忆 of one chat (from the chat's menu): what is written up so far, in layers (core/memory.js) — the ones sent to the
// model on top, what each covers folded inside — what the last reply took along, and 立即整理. Every summary can be
// corrected or deleted in place (a sheet cannot open a second one, so there are no confirm dialogs: deleting takes two
// taps).
import {esc, btn, groupTitle, help} from './common.js';
import {icon} from './icons.js';
import {roots, unwritten, nextMerge, levelName, span, day} from '../core/memory.js';

export function memorySheet(ctx, {threadId, title, assistant = false}) {
  const source = ctx.api;
  const api = assistant ? {...source, getThread: id => source.assistantThread(id),
    memoryBook: id => source.assistantMemoryBook(id), memoryStatus: id => source.assistantMemoryStatus?.(id),
    memoryTidy: id => source.assistantMemoryTidy(id), memoryEdit: (...args) => source.assistantMemoryEdit(...args),
    memoryRemove: (...args) => source.assistantMemoryRemove(...args), memoryForget: id => source.assistantMemoryForget(id)} : source;
  const d = ctx.dialog(`${title} · 记忆`, '<p class="hint">正在读取……</p>');
  let editing = '', armed = '', timer = 0, drawing = 0;
  const options = () => { if (assistant) return api.getState().assistant; const c = api.getState().chat; return (c.presets.find(p => p.id === c.activePreset) || c.presets[0]); };

  function node(n, book, nested = false) {
    const children = book.nodes.filter(x => x.coveredBy === n.id).sort((a, b) => a.from - b.from);
    const text = `<p class="mem-text">${esc(n.text)}</p>${nested ? '' : `<div class="mem-actions">${btn('mem-edit', icon('edit') + '修改', 'text-button', `data-id="${esc(n.id)}"`)}${btn('mem-remove', armed === n.id ? '再点一下删除' : icon('trash') + '删除', 'text-button danger-text', `data-id="${esc(n.id)}"`)}</div>`}`;
    return `<details class="mem-node l${Math.min(n.level, 2)}"><summary><span class="mem-level">${levelName(n.level)}</span><b>${esc(span(n.from, n.to))}</b><small>${n.count ? `${n.count} 条消息` : ''}${n.edited ? ' · 改过' : ''}</small></summary>
      ${text}${children.length ? `<details class="mem-children"><summary>包含 ${children.length} 份更早的${levelName(children[0].level)}</summary>${children.map(c => node(c, book, true)).join('')}</details>` : ''}</details>`;
  }
  async function draw() {
    if (!d.live || editing) return;
    const ticket = ++drawing;
    const [book, thread] = await Promise.all([api.memoryBook(threadId), api.getThread(threadId)]);
    if (!d.live || ticket !== drawing || editing) return;
    const st = api.memoryStatus?.(threadId) || {}, o = options(), m = o.memory, top = roots(book);
    const waiting = thread ? unwritten(thread, book).length : 0, older = Math.max(0, waiting - o.history);
    const layers = [0, 1, 2].map(l => [l, book.nodes.filter(n => Math.min(n.level, 2) === l).length]).filter(([, k]) => k).map(([l, k]) => `${k} ${l === 2 ? '份长期总览' : l === 1 ? '份阶段总结' : '段聊天摘要'}`);
    const state = !m.enabled ? (assistant ? '记忆关着（助手设置 → 记忆）。' : '记忆关着（预设 → 聊天 → 手机聊天）。')
      : `${book.throughAt ? `已经整理到 ${day(book.throughAt)}，` : '还没有整理过，'}最近 ${o.history} 条原样发给模型；` + (older ? `更早的还有 ${older} 条等着整理（攒够 ${m.batch} 条会自动整理）。` : '没有要整理的。');
    const used = st.used;
    d.body.innerHTML = `<p class="hint">${state}${layers.length ? `<br>现在有 ${layers.join('、')}。` : ''}</p>
      ${st.busy ? '<p class="moments-busy" role="status">正在整理……</p>' : ''}${st.error ? `<p class="hint error-copy">上次整理没成功：${esc(st.error)}</p>` : ''}${st.vectorError ? `<p class="hint error-copy">向量模型没用上（改用本地检索）：${esc(st.vectorError)}</p>` : ''}
      <div class="actions" style="margin-top:0">${btn('mem-tidy', icon('refresh') + '立即整理', 'secondary', st.busy || (older < 4 && !nextMerge(book, m)) ? 'disabled' : '')}</div>
      ${used ? groupTitle('上一次回复带上了', help('「长期记忆」是下面没被合并的那几份；「想起来的旧聊天」是按最近几句话从更早的原话里找出来的。')) + `<div class="group pad mem-used"><p>${used.nodes ? `长期记忆 ${used.nodes} 份` : '还没有长期记忆'}${used.recalled.length ? ` · 想起来 ${used.recalled.length} 段旧聊天（${used.vector ? '向量检索' : '本地检索'}）` : ''}</p>${used.recalled.map(r => `<details class="mem-recall"><summary>${esc(span(r.from, r.to))}<small>相关度 ${Math.round(r.score * 100)}%</small></summary><pre>${esc(r.text)}</pre></details>`).join('')}</div>` : ''}
      ${groupTitle(`记忆（发给模型的 ${top.length} 份）`, help('从早到晚排。每份点开能看全文、修改或删除；被合并进更高一层的，折在那一份里面，不会重复发给模型。删除一份总结，它包含的那几份会重新发给模型（之后再合并）。'))}
      ${top.length ? `<div class="mem-list">${top.map(n => node(n, book)).join('')}</div>` : '<p class="hint">还没有记忆。聊得多了，最近几十条之外的消息会自动整理进来。</p>'}
      ${book.nodes.length ? `<div class="actions">${btn('mem-forget', armed === 'all' ? '再点一下：全部忘掉' : icon('trash') + '忘掉这段聊天的全部记忆', 'text-button danger-text')}</div>` : ''}`;
    clearTimeout(timer);
    if (st.busy) timer = setTimeout(draw, 1500);
  }
  const arm = id => { armed = id; draw(); setTimeout(() => { if (armed === id) { armed = ''; draw(); } }, 3000); };
  d.body.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id;
    try {
      switch (el.dataset.action) {
        case 'mem-tidy': {
          const job = api.memoryTidy(threadId);
          draw();
          const n = await job;
          ctx.notify(n ? `整理好了 ${n} 份` : '没有要整理的');
          break;
        }
        case 'mem-edit': { const book = await api.memoryBook(threadId); editing = id; await redrawEditing(book); return; }
        case 'mem-cancel': editing = ''; break;
        case 'mem-save': { const text = d.body.querySelector('[data-mem-text]').value; await api.memoryEdit(threadId, id, text); editing = ''; ctx.notify('改好了'); break; }
        case 'mem-remove': if (armed !== id) { arm(id); return; } armed = ''; await api.memoryRemove(threadId, id); break;
        case 'mem-forget': if (armed !== 'all') { arm('all'); return; } armed = ''; await api.memoryForget(threadId); break;
        default: return;
      }
    } catch (error) { ctx.notify(error.message, {error: true}); }
    draw();
  });
  /** Draws the list with one summary opened for editing (draw() itself waits while something is being edited). */
  async function redrawEditing(book) {
    const keep = editing;
    editing = '';
    await draw();
    editing = keep;
    const host = [...d.body.querySelectorAll('[data-action=mem-edit]')].find(b => b.dataset.id === keep)?.closest('.mem-node');
    const n = book.nodes.find(x => x.id === keep);
    if (!host || !n) { editing = ''; return; }
    host.open = true;
    host.querySelector(':scope > .mem-text').outerHTML = `<textarea class="mem-edit" data-mem-text rows="8">${esc(n.text)}</textarea>`;
    host.querySelector(':scope > .mem-actions').innerHTML = `${btn('mem-save', '保存', 'primary', `data-id="${esc(n.id)}"`)}${btn('mem-cancel', '取消', 'text-button')}`;
    host.querySelector('[data-mem-text]').focus();
  }
  d.onClose(() => { clearTimeout(timer); editing = ''; });
  draw();
  return d;
}
