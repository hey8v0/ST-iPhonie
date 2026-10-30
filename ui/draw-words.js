// NovelAI's prompt box in the drawing app: tags suggested while typing, @ for saved 提示词片段, and the sheet that keeps them.
import {esc, btn, field, input, textArea, help} from './common.js';
import {icon} from './icons.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {layerSort} from './layer-sort.js';
import {chunkTree} from '../core/draw.js';

const TYPED_IN = new Set(['prompt', 'negative', 'char', 'char-neg']);
const countText = n => n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万' : String(n);
/** The word being typed at the caret: {kind: 'chunk' | 'tag', word, start}; '@…' asks for a chunk. */
export function wordAt(value, caret) {
  const before = String(value).slice(0, caret ?? String(value).length), chunk = /@([^\s,@|]*)$/.exec(before);
  if (chunk) return {kind: 'chunk', word: chunk[1], start: before.length - chunk[0].length};
  const last = before.split(/[#,[{|、]|\. |::/).pop(), word = last.trimStart();
  return {kind: 'tag', word: word.trimEnd(), start: before.length - word.length};
}

/**
 * The words of a prompt with what is special in them marked, for the layer over the box: stronger ({…}, 1.2::…::) warm,
 * weaker ([…], 0.8::…::) cool, more so the deeper; taken out (-1::…::) red; ||a|b|| and saved 片段 each their own. The
 * text itself stays the box's: this only tints behind it, so a small misfit between the two can do no harm.
 */
const MARKS = /(!macro:[^!\n]+!)|(\|\|)|(-?\d*\.?\d+::)|(::)|([{}[\]])/g;
export function markWords(text, chunks = []) {
  const value = String(text);
  let up = 0, down = 0, weight = null, random = false, last = 0, out = '';
  const kind = () => {
    if (random) return 'w-rand';
    if (weight !== null) return weight <= 0 ? 'w-neg' : weight > 1 ? `w-up w${Math.min(3, Math.ceil(weight - 1))}` : weight < 1 ? 'w-down w2' : '';
    const n = up - down;
    return n > 0 ? `w-up w${Math.min(3, n)}` : n < 0 ? `w-down w${Math.min(3, -n)}` : '';
  };
  const put = (from, to, cls = kind()) => { if (to > from) out += cls ? `<span class="${cls}">${esc(value.slice(from, to))}</span>` : esc(value.slice(from, to)); };
  for (const m of value.matchAll(MARKS)) {
    const at = m.index, end = at + m[0].length;
    put(last, at);
    if (m[1]) {
      const chunk = chunks.find(c => c.name === m[1].slice(7, -1));
      out += `<span class="w-chunk"${chunk?.color ? ` style="background:${esc(chunk.color)}55"` : ''}>${esc(m[0])}</span>`;
    } else if (m[2]) { if (random) { put(at, end); random = false; } else { random = true; put(at, end); } }
    else if (m[3]) { weight = Number.parseFloat(m[3]); put(at, end); }
    else if (m[4]) { put(at, end); weight = null; }
    else if (m[0] === '{') { up++; put(at, end); }
    else if (m[0] === '[') { down++; put(at, end); }
    else if (m[0] === '}') { put(at, end); up = Math.max(0, up - 1); }
    else { put(at, end); down = Math.max(0, down - 1); }
    last = end;
  }
  put(last, value.length);
  // A last empty line takes up room in a box, and has to in the layer too.
  return out + '\n';
}
/** A prompt box that shows its marks. */
export const markedBox = html => `<div class="word-mark"><div class="word-mark-layer" aria-hidden="true"></div>${html}</div>`;

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
    (el.closest('.word-mark') || el).after(box);
  }
  /** The layer over a box: it wraps and scrolls as the box does. */
  function mark(el) {
    const layer = el.closest('.word-mark')?.querySelector('.word-mark-layer');
    if (!layer) return;
    const style = ctx.win.getComputedStyle(el);
    for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'paddingTop', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth']) layer.style[key] = style[key];
    // A scrollbar in the box takes room from its lines.
    const bar = Math.max(0, el.offsetWidth - el.clientWidth - (Number.parseFloat(style.borderLeftWidth) || 0) - (Number.parseFloat(style.borderRightWidth) || 0));
    layer.style.paddingRight = (Number.parseFloat(style.paddingRight) || 0) + bar + 'px';
    layer.innerHTML = markWords(el.value, chunks());
    layer.scrollTop = el.scrollTop;
  }
  /** Marks every box under root (after the page is drawn); scrolling keeps them in step. */
  function markAll(root) {
    for (const el of root.querySelectorAll('.word-mark textarea')) {
      mark(el);
      if (!el.dataset.markScroll) { el.dataset.markScroll = '1'; el.addEventListener('scroll', () => { const layer = el.closest('.word-mark')?.querySelector('.word-mark-layer'); if (layer) layer.scrollTop = el.scrollTop; }, {passive: true}); }
    }
  }
  /** A word was typed in one of the prompt boxes. */
  function typed(el) {
    mark(el);
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
  return {typed, insert, hide, mark, markAll, left() { setTimeout(() => { if (!ctx.doc.activeElement?.matches?.('[data-field]')) hide(); }, 120); }, dispose: hide};
}

/** 提示词片段: words kept under a name, in 分类, each with a colour if wanted. A tap puts one in the prompt; the list goes as Procreate's layers do. */
const CHUNK_COLORS = ['#e8604c', '#f0a030', '#e8c840', '#5cb85c', '#30b8c8', '#4c8ce8', '#9868e0', '#e060a8'];
export function chunkSheet({ctx, api, onPick}) {
  const draw = () => api.getState().draw;
  const d = ctx.dialog('提示词片段', `<div data-chunk-page="list"><div class="row-heading chunk-head"><strong>存好的片段 ${help('常用的一串词存起来，点一下放进提示词。在提示词框里打 @ 能按名字选；写成 !macro:名字! 也一样，片段里还可以放别的片段。\n\n发出去时才换成原文，所以改一个片段，用到它的地方都跟着变。随机语法 ||a|b|| 可以放在片段里。\n\n颜色是提示词框里它的底色。')}</strong>${btn('chunk-new', icon('add') + '新建', 'chip-button')}</div><p class="hint" data-chunk-none hidden>还没有片段。</p><div class="style-list" data-chunk-list></div></div><div data-chunk-page="edit" hidden></div>`);
  const list = d.body.querySelector('[data-chunk-list]'), listPage = d.body.querySelector('[data-chunk-page=list]'), editPage = d.body.querySelector('[data-chunk-page=edit]');
  let editing = null, armed = false;
  const save = chunks => api.saveDraw({chunks});
  const tree = () => chunkTree(draw()).map(e => e.style ? {style: e.style.id} : {group: {...e.group}, styles: e.styles.map(c => c.id)});
  const actions = [{key: 'edit', label: '改', icon: 'edit'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}];
  const groupActions = [{key: 'rename', label: '改名', icon: 'edit'}, {key: 'ungroup', label: '解散', icon: 'layers'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}];
  const chunkRow = c => swipeRow(c.id, `<div class="list-row chunk-line"><i class="chunk-dot"${c.color ? ` style="background:${esc(c.color)}"` : ''}></i><span><strong>${esc(c.name)}</strong><small>${esc(c.text)}</small></span></div>`, actions, {label: c.name});
  const groupRows = (g, chunks) => swipeRow('g:' + g.id, `<div class="list-row style-group-row" aria-expanded="${g.open}"><span class="style-group-chevron">${icon('chevron')}</span><span class="style-group-art">${icon('layers')}</span><span><strong data-group-name>${esc(g.name)}</strong><small>${chunks.length} 个片段</small></span></div>`, groupActions, {className: 'style-group', label: g.name})
    + `<div class="style-group-body" data-group-body="${esc(g.id)}"${g.open ? '' : ' data-closed'}><div class="style-group-inner">${chunks.map(chunkRow).join('')}</div></div>`;
  function paint() {
    const entries = chunkTree(draw());
    d.body.querySelector('[data-chunk-none]').hidden = entries.length > 0;
    list.innerHTML = entries.map(e => e.style ? chunkRow(e.style) : groupRows(e.group, e.styles)).join('');
  }
  const groupName = () => { const taken = new Set((draw().chunkGroups || []).map(g => g.name)); for (let n = 1; ; n++) { const name = n === 1 ? '新建分类' : `新建分类 ${n}`; if (!taken.has(name)) return name; } };
  const {flip, arrange, toggle, rename, makeGroup, lift} = layerSort({ctx, list, tree, commit: next => api.arrangeChunks(next), paint, groupName});
  function open(chunk) {
    editing = chunk ? {...chunk} : {id: '', name: '', text: '', color: ''}; armed = false;
    listPage.hidden = true; editPage.hidden = false;
    drawEditor();
  }
  function back() { editing = null; editPage.hidden = true; listPage.hidden = false; paint(); }
  function drawEditor() {
    editPage.innerHTML = `<div class="group pad">${field('名字', input('chunk-name', editing.name, 'text', 'maxlength="40" autocomplete="off"'))}
      ${field('内容', textArea('chunk-text', editing.text, 'rows="5" spellcheck="false" maxlength="8000" placeholder="一串 tag，或者随机语法 ||from above|from side||"'))}
      <div class="field"><span>颜色</span><div class="chunk-colors"><button type="button" data-chunk-color="" aria-pressed="${!editing.color}" aria-label="不要颜色"></button>${CHUNK_COLORS.map(color => `<button type="button" data-chunk-color="${color}" style="background:${color}" aria-pressed="${editing.color === color}" aria-label="颜色 ${color}"></button>`).join('')}</div></div>
      <div class="actions">${btn('chunk-save', '保存', 'primary')}${btn('chunk-back', '返回', 'secondary')}${editing.id ? btn('chunk-delete', armed ? '再点一下删除' : icon('trash') + '删除', 'danger') : ''}</div></div>`;
  }
  const remember = () => { editing.name = editPage.querySelector('[data-field=chunk-name]').value; editing.text = editPage.querySelector('[data-field=chunk-text]').value; };
  paint();
  const swipe = mountSwipeList(list, {ctx,
    hint: '点一下放进提示词，按住可以拖动排序；左滑：改、删除；右滑：多选、建分类；点分类：展开或收起',
    mouseHint: '点一下放进提示词，按住可以拖动排序；⋯ 或右键：改、删除；Ctrl / ⌘ 点：多选、建分类；点分类：展开或收起',
    sort: {start: lift},
    onTap: id => {
      if (id.startsWith('g:')) return toggle(id.slice(2));
      const c = draw().chunks.find(x => x.id === id);
      if (c) { d.close(); onPick(`!macro:${c.name}!`); }
    },
    onAction: async (key, id) => {
      try {
        if (id.startsWith('g:')) {
          const gid = id.slice(2), entry = tree().find(e => e.group?.id === gid);
          if (!entry) return;
          if (key === 'rename') rename(gid);
          else if (key === 'ungroup') arrange(tree().flatMap(e => e.group?.id === gid ? e.styles.map(s => ({style: s})) : [e]));
          else if (key === 'delete' && await ctx.confirm(`删除分类「${entry.group.name}」？`, `里面的 ${entry.styles.length} 个片段会一起删掉。只想拆开，用「解散」。`)) { const gone = new Set(entry.styles); save(draw().chunks.filter(c => !gone.has(c.id))); flip(paint); }
          return;
        }
        const c = draw().chunks.find(x => x.id === id);
        if (!c) return;
        if (key === 'edit') open(c);
        else if (key === 'delete' && await ctx.confirm(`删除片段「${c.name}」？`, '提示词里写着它的地方会照原样发出去。')) { save(draw().chunks.filter(x => x.id !== id)); flip(paint); }
      } catch (error) { ctx.notify(error.message, {error: true}); }
    },
    bulk: [{key: 'group', label: '建分类', icon: 'layers'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}],
    onBulk: async (key, ids) => {
      if (key === 'group') return makeGroup(ids);
      if (key !== 'delete') return;
      const gone = new Set(ids.flatMap(id => id.startsWith('g:') ? tree().find(e => e.group?.id === id.slice(2))?.styles || [] : [id]));
      if (!await ctx.confirm(`删除这 ${gone.size} 个片段？`, '提示词里写着它们的地方会照原样发出去。')) return;
      save(draw().chunks.filter(c => !gone.has(c.id))); flip(paint);
    }});
  d.onClose?.(() => swipe.dispose());
  d.body.addEventListener('click', e => {
    const color = e.target.closest('[data-chunk-color]');
    if (color && editing) { remember(); editing.color = color.dataset.chunkColor; drawEditor(); return; }
    const action = e.target.closest('[data-action]')?.dataset.action;
    try {
      switch (action) {
        case 'chunk-new': open(null); break;
        case 'chunk-back': back(); break;
        case 'chunk-save': {
          remember();
          const name = editing.name.replace(/[!\n]/g, '').trim();
          if (!name) { ctx.notify('给片段起个名字'); break; }
          if (draw().chunks.some(c => c.name === name && c.id !== editing.id)) { ctx.notify('已经有这个名字的片段了'); break; }
          const {color, ...rest} = editing, row = {...rest, name, ...(color ? {color} : {})};
          save(editing.id ? draw().chunks.map(c => c.id === editing.id ? row : c) : [...draw().chunks, {...row, id: crypto.randomUUID()}]);
          back(); break;
        }
        case 'chunk-delete':
          if (!armed) { remember(); armed = true; drawEditor(); break; }
          save(draw().chunks.filter(c => c.id !== editing.id)); back(); break;
      }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  });
}
