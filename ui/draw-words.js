// NovelAI's prompt box in the drawing app: tags suggested while typing, @ for saved 提示词片段, and the sheet that keeps them.
import {esc, btn, field, input, textArea, help} from './common.js';
import {icon} from './icons.js';

const TYPED_IN = new Set(['prompt', 'negative', 'char', 'char-neg']);
const countText = n => n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万' : String(n);
/** The word being typed at the caret: {kind: 'chunk' | 'tag', word, start}; '@…' asks for a chunk. */
export function wordAt(value, caret) {
  const before = String(value).slice(0, caret ?? String(value).length), chunk = /@([^\s,@|]*)$/.exec(before);
  if (chunk) return {kind: 'chunk', word: chunk[1], start: before.length - chunk[0].length};
  const last = before.split(/[#,[{|、]|\. |::/).pop(), word = last.trimStart();
  return {kind: 'tag', word: word.trimEnd(), start: before.length - word.length};
}

export function wordHelper({ctx, api, active}) {
  const cache = new Map();
  let box = null, target = null, last = null, timer = 0, controller = null, ticket = 0;
  const chunks = () => api.getState().draw.chunks || [];
  function hide() { ticket++; clearTimeout(timer); controller?.abort(); controller = null; box?.remove(); box = null; target = null; }
  function put(el, start, text) {
    const caret = el.selectionStart ?? el.value.length, after = el.value.slice(caret);
    el.value = el.value.slice(0, start) + text + after;
    const at = start + text.length;
    el.setSelectionRange?.(at, at);
    el.dispatchEvent(new ctx.win.Event('input', {bubbles: true}));
    el.focus();
  }
  function show(el, items, start) {
    box?.remove();
    if (!items.length) { box = null; return; }
    box = ctx.doc.createElement('div');
    box.className = 'word-suggest';
    box.setAttribute('role', 'listbox');
    box.innerHTML = items.map((item, i) => `<button type="button" role="option" data-word="${i}">${esc(item.label)}${item.note ? `<small>${esc(item.note)}</small>` : ''}</button>`).join('');
    // Tapping a word must not take the focus from the box being typed in.
    box.addEventListener('pointerdown', e => e.preventDefault());
    box.addEventListener('click', e => { const b = e.target.closest('[data-word]'); if (!b) return; const item = items[Number(b.dataset.word)]; hide(); put(el, start, item.text); });
    el.after(box);
  }
  /** A word was typed in one of the prompt boxes. */
  function typed(el) {
    if (!TYPED_IN.has(el.dataset.field) || !active()) { hide(); return; }
    target = el; last = el;
    clearTimeout(timer); controller?.abort();
    const {kind, word, start} = wordAt(el.value, el.selectionStart);
    if (kind === 'chunk') {
      const found = chunks().filter(c => c.name.toLowerCase().includes(word.toLowerCase())).slice(0, 12);
      show(el, found.map(c => ({label: c.name, note: '片段', text: `!macro:${c.name}!, `})), start);
      return;
    }
    if (word.length < 2) { box?.remove(); box = null; return; }
    const mine = ++ticket;
    timer = setTimeout(async () => {
      controller = new AbortController();
      let tags = cache.get(word);
      if (!tags) {
        try { tags = await api.naiSuggestTags(word, {signal: controller.signal}); cache.set(word, tags); }
        catch { return; } // No suggestions is no reason to interrupt the typing.
      }
      if (mine !== ticket || target !== el || !el.isConnected) return;
      show(el, tags.slice(0, 12).map(t => ({label: t.tag, note: t.count ? countText(t.count) : '', text: t.tag + ', '})), start);
    }, 250);
  }
  /** Puts words at the caret of the box last typed in, or of the prompt. */
  function insert(text, fallback) {
    const el = last?.isConnected ? last : fallback();
    if (!el) return false;
    const start = el.selectionStart ?? el.value.length, joined = start > 0 && !/[\s,]$/.test(el.value.slice(0, start)) ? ', ' + text : text;
    put(el, start, joined);
    return true;
  }
  return {typed, insert, hide, left() { setTimeout(() => { if (!ctx.doc.activeElement?.matches?.('[data-field]')) hide(); }, 120); }, dispose: hide};
}

/** 提示词片段: words kept under a name. A tap puts one in the prompt. */
export function chunkSheet({ctx, api, onPick}) {
  const d = ctx.dialog('提示词片段', '');
  const list = () => api.getState().draw.chunks || [];
  let editing = null, armed = false;
  const save = chunks => api.saveDraw({chunks});
  function draw() {
    if (editing) {
      d.body.innerHTML = `<div class="group pad">${field('名字', input('chunk-name', editing.name, 'text', 'maxlength="40" autocomplete="off"'))}
        ${field('内容', textArea('chunk-text', editing.text, 'rows="5" spellcheck="false" maxlength="8000" placeholder="一串 tag，或者随机语法 ||from above|from side||"'))}
        <div class="actions">${btn('chunk-save', '保存', 'primary')}${btn('chunk-back', '返回', 'secondary')}${editing.id ? btn('chunk-delete', armed ? '再点一下删除' : icon('trash') + '删除', 'danger') : ''}</div></div>`;
      return;
    }
    d.body.innerHTML = `<div class="row-heading chunk-head"><strong>存好的片段 ${help('常用的一串词存起来，点一下放进提示词。在提示词框里打 @ 能按名字选；写成 !macro:名字! 也一样，片段里还可以放别的片段。\n\n发出去时才换成原文，所以改一个片段，用到它的地方都跟着变。随机语法 ||a|b|| 可以放在片段里。')}</strong>${btn('chunk-new', icon('add') + '新建', 'chip-button')}</div>`
      + (list().length ? `<div class="group">${list().map(c => `<div class="chunk-row"><button type="button" class="list-row" data-chunk="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(c.text)}</small></span></button>${btn('chunk-edit', icon('edit'), 'text-button', `data-id="${esc(c.id)}" aria-label="改 ${esc(c.name)}"`)}</div>`).join('')}</div>` : '<p class="hint">还没有片段。</p>');
  }
  draw();
  d.body.addEventListener('click', e => {
    const row = e.target.closest('[data-chunk]'), action = e.target.closest('[data-action]')?.dataset.action;
    if (row) { const c = list().find(x => x.id === row.dataset.chunk); if (c) { d.close(); onPick(`!macro:${c.name}!`); } return; }
    try {
      switch (action) {
        case 'chunk-new': editing = {id: '', name: '', text: ''}; armed = false; draw(); break;
        case 'chunk-edit': editing = {...list().find(x => x.id === e.target.closest('[data-action]').dataset.id)}; armed = false; draw(); break;
        case 'chunk-back': editing = null; draw(); break;
        case 'chunk-save': {
          const name = d.body.querySelector('[data-field=chunk-name]').value.replace(/[!\n]/g, '').trim(), text = d.body.querySelector('[data-field=chunk-text]').value;
          if (!name) { ctx.notify('给片段起个名字'); break; }
          if (list().some(c => c.name === name && c.id !== editing.id)) { ctx.notify('已经有这个名字的片段了'); break; }
          save(editing.id ? list().map(c => c.id === editing.id ? {...c, name, text} : c) : [...list(), {id: crypto.randomUUID(), name, text}]);
          editing = null; draw(); break;
        }
        case 'chunk-delete':
          if (!armed) { armed = true; draw(); break; }
          save(list().filter(c => c.id !== editing.id)); editing = null; armed = false; draw(); break;
      }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  });
}
