// 自定义气泡 (0.9.33) in the chat app: the sets (核心 core/bubble-css.js) — a list to put one on, an editor with a live
// preview, the two sides as two texts, 「让模型改」 (the phone's text model), 「复制给别的 AI」 (its answer pasted back is
// split by itself), files in and out — and the picker for one person on their card. The rules reach only the rows that
// carry a set's id (data-bset), through the one <style> syncBubbleCss keeps.
import {esc, btn, field, input, textArea, help, menu, copyText} from './common.js';
import {icon} from './icons.js';
import {saveFile} from '../download.js';
import {BUBBLE_TEMPLATES, setStyles, splitBubbleAnswer, bubbleFile, readBubbleFile, bubblePromptText, BUBBLE_LIMITS} from '../core/bubble-css.js';

const STYLE_ID = 'sttts-bubble-css';
const memo = new Map();
/** The <style> of every saved set and of what is being edited (drafts); kept as it is when nothing changed. */
export function syncBubbleCss(doc, sets = [], drafts = []) {
  let el = doc.getElementById(STYLE_ID);
  if (!el) { el = doc.createElement('style'); el.id = STYLE_ID; (doc.head || doc.documentElement).append(el); }
  const text = [...sets, ...drafts].map(s => {
    const key = `${s.id}\u0001${s.me}\u0001${s.them}`;
    if (!memo.has(key)) { memo.set(key, setStyles(s).css); if (memo.size > 60) memo.delete(memo.keys().next().value); }
    return memo.get(key);
  }).join('\n');
  if (el.textContent !== text) el.textContent = text;
}
const SAMPLE = [['them', '在吗？'], ['me', '在的～刚到家'], ['them', '今天的晚霞超好看，给你看看']];
/** A small chat of a set (id) in the chat's own look: look {bg, scene, me, them} (the avatars as markup). Its bubbles
 *  are not buttons: the previews sit inside buttons, where a button would break the row apart. */
export function bubblePreview(id, look = {}, {mini = false} = {}) {
  const rows = (mini ? SAMPLE.slice(0, 2) : SAMPLE).map(([side, text]) => `<div class="msg${side === 'me' ? ' me' : ''}" data-kind="text" data-bset="${esc(id)}" data-recent>`
    + (mini ? '' : side === 'me' ? `<span class="me-side">${look.me || ''}</span>` : `<span class="pat-target">${look.them || ''}</span>`)
    + `<div class="m-body"><span class="chat-bubble">${esc(text)}</span></div></div>`).join('');
  const bg = mini ? 'none' : look.bg || 'none';
  return `<div class="chat-thread bubble-preview${mini ? ' mini' : ''}" data-bubble="custom" data-bsets data-bg="${esc(bg)}"${!mini && look.scene ? ' data-scene' : ''} aria-hidden="true" inert>`
    + `<div class="msgs-wrap" data-bg="${esc(bg)}">${mini ? '' : look.scene || ''}<div class="msgs">${rows}</div></div></div>`;
}
const sets = api => api.getState().chat.bubbleSets || [];
const fileName = name => `气泡-${String(name || '我的气泡').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 20) || '我的气泡'}.json`;
const HELP = '一套气泡有两段 CSS：「我的」是你发的，「对方的」是对方发的。\n.bubble 就是气泡本身，可以用 .bubble::before、.bubble::after 加装饰，也可以写 @keyframes 动画。\n图片只能用 data: 开头的内嵌图片；外部图片和网址、@import、@font-face、position: fixed 会被去掉，气泡也碰不到手机别的地方。\n让别的 AI 写：点「复制给别的 AI」，把它的整段回答（带 <me> 和 <them>）贴进框里，会自动分成两段。';

/**
 * 自定义气泡: the sets, the one worn marked; a tap puts one on, 「⋯」 for 改、复制一份、导出、删除, ＋ for a new one from a
 * template, and a file to bring some in. look: what the previews look like; changed(): the chat to draw again.
 */
export function bubbleSetsSheet(ctx, api, {look, changed = () => {}}) {
  const worn = () => /^custom:(.+)$/.exec(api.getState().chat.profile.bubble || '')?.[1] || '';
  const draw = () => {
    const list = sets(api);
    syncBubbleCss(ctx.doc, list);
    return (list.length ? `<div class="group bubble-sets">${list.map(s => `<div class="list-row bubble-set" data-id="${esc(s.id)}"><button type="button" class="bubble-set-main" data-action="bubble-wear" data-id="${esc(s.id)}" aria-pressed="${worn() === s.id}">${bubblePreview(s.id, look, {mini: true})}<span class="bubble-set-name"><strong>${esc(s.name)}</strong>${worn() === s.id ? '<small>在用</small>' : ''}</span></button>${btn('bubble-more', icon('more'), 'round-button', `data-id="${esc(s.id)}" aria-label="${esc(s.name)} 的更多操作"`)}</div>`).join('')}</div>`
      : '<p class="hint bubble-none">还没有自定义的气泡：点右上角的 ＋，从一个模板开始。</p>')
      + `<div class="actions"><label class="secondary file-button bubble-import">${icon('import')}<span>导入气泡文件</span><input type="file" accept=".json,.css,.txt,application/json,text/css,text/plain" data-bubble-file hidden></label></div>`;
  };
  const d = ctx.dialog('自定义气泡', draw(), {add: '新建气泡'});
  const redraw = () => { if (d.live) d.body.innerHTML = draw(); };
  const wear = id => { api.saveChatOptions({profile: {bubble: 'custom:' + id}}); redraw(); changed(); };
  d.overlay.querySelector('[data-sheet-add]')?.addEventListener('click', () => newSet());
  d.body.addEventListener('change', async e => {
    const box = e.target.closest('[data-bubble-file]'), file = box?.files?.[0];
    if (!file) return;
    box.value = '';
    try {
      const got = readBubbleFile(await file.text(), file.name.replace(/\.[^.]+$/, '').replace(/^气泡-/, ''));
      if (!got.length) { ctx.notify('这个文件里没有气泡：要是小手机导出的 .json，或者带 <me> 和 <them> 的文字', {error: true}); return; }
      for (const s of got) api.saveBubbleSet({name: s.name, me: s.me, them: s.them});
      redraw();
      ctx.notify(`导入了 ${got.length} 套气泡`);
    } catch (error) { ctx.notify(error.message, {error: true}); }
  });
  d.body.addEventListener('click', async e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const s = sets(api).find(x => x.id === b.dataset.id);
    try {
      if (b.dataset.action === 'bubble-wear' && s) { wear(s.id); ctx.notify(`换上了「${s.name}」`); }
      if (b.dataset.action === 'bubble-more' && s) {
        // The menu takes this sheet's place; it comes back after whatever was picked (改: when the editor closes).
        const key = await menu(ctx, s.name, [{key: 'edit', icon: 'edit', label: '改'}, {key: 'copy', icon: 'copy', label: '复制一份'}, {key: 'export', icon: 'download', label: '导出'}, {key: 'delete', icon: 'trash', label: '删除', danger: true}]);
        if (key === 'edit') { edit(s); return; }
        try {
          if (key === 'copy') api.saveBubbleSet({name: `${s.name.slice(0, BUBBLE_LIMITS.name - 3)} 副本`, me: s.me, them: s.them});
          if (key === 'export') ctx.notify('已下载 ' + await saveFile(ctx.doc, new Blob([bubbleFile([s])], {type: 'application/json'}), fileName(s.name)));
          if (key === 'delete' && await ctx.confirm(`删除「${s.name}」？`, '用着它的地方会换回默认的气泡。')) { api.deleteBubbleSet(s.id); changed(); }
        } finally { bubbleSetsSheet(ctx, api, {look, changed}); }
      }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  });
  function newSet() {
    const pick = ctx.dialog('从哪个模板开始', `<div class="bubble-templates">${BUBBLE_TEMPLATES.map(t => `<button type="button" class="list-row bubble-template" data-template="${t.key}">${bubblePreview('bset-t' + t.key, look, {mini: true})}<span><strong>${esc(t.name)}</strong></span></button>`).join('')}</div>`, {over: true});
    syncBubbleCss(ctx.doc, sets(api), BUBBLE_TEMPLATES.map(t => ({id: 'bset-t' + t.key, me: t.me, them: t.them})));
    pick.body.addEventListener('click', e => {
      const t = BUBBLE_TEMPLATES.find(x => x.key === e.target.closest('[data-template]')?.dataset.template);
      if (!t) return;
      pick.close();
      edit({id: '', name: t.name, me: t.me, them: t.them}, true);
    });
  }
  /** The editor: over this sheet (a new one), which shows again when it closes; else this sheet comes back then. */
  function edit(s, stacked = false) {
    const e = bubbleEditor(ctx, api, s, {look, saved: kept => { if (!s.id) wear(kept.id); changed(); }});
    e.onClose(() => { if (stacked && d.live) redraw(); else bubbleSetsSheet(ctx, api, {look, changed}); });
  }
  return d;
}

/**
 * One set edited: its name, the preview, 我的 / 对方的 (one box, switched), what was left out under it, 「让模型改」,
 * 保存, 「复制给别的 AI」 and 导出. Nothing is kept until 保存. saved(set): after it is kept.
 */
export function bubbleEditor(ctx, api, set, {look = {}, saved = () => {}} = {}) {
  const draft = {id: 'bset-draft', me: set.me || '', them: set.them || ''};
  let side = 'me', soon = 0, asking = false;
  const others = () => sets(api);
  const d = ctx.dialog(set.id ? `改「${set.name}」` : '新的气泡', `<div class="bubble-editor">
    ${field('名字', input('bubble-name', set.name || '', 'text', `maxlength="${BUBBLE_LIMITS.name}" placeholder="比如：奶油"`))}
    <div class="bubble-stage">${bubblePreview(draft.id, look)}</div>
    <div class="field"><span>CSS ${help(HELP)}</span><div class="segmented bubble-side" role="group" aria-label="哪一边">${[['me', '我的'], ['them', '对方的']].map(([k, t]) => `<button type="button" data-side="${k}" aria-pressed="${k === side}">${t}</button>`).join('')}</div>
      <textarea data-field="bubble-css" rows="12" spellcheck="false" autocapitalize="off" autocomplete="off" maxlength="${BUBBLE_LIMITS.css}" aria-label="CSS">${esc(draft.me)}</textarea>
      <small class="bubble-note" data-bubble-note></small></div>
    <div class="actions">${btn('bubble-ask', icon('wand') + '让模型改', 'secondary')}${btn('bubble-save', '保存', 'primary')}</div>
    <div class="actions bubble-more-acts">${btn('bubble-copy', icon('copy') + '复制给别的 AI', 'text-button')}${btn('bubble-export', icon('download') + '导出', 'text-button')}</div></div>`, {over: true});
  const box = d.body.querySelector('[data-field=bubble-css]'), note = d.body.querySelector('[data-bubble-note]');
  const show = () => {
    syncBubbleCss(ctx.doc, others(), [draft]);
    const left = setStyles(draft).dropped;
    note.textContent = left.length ? `去掉了：${left.join('、')}` : '';
    note.toggleAttribute('data-warn', left.length > 0);
  };
  const shown = () => { box.value = draft[side]; for (const b of d.body.querySelectorAll('[data-side]')) b.setAttribute('aria-pressed', String(b.dataset.side === side)); };
  show();
  d.onClose(() => { ctx.win.clearTimeout(soon); syncBubbleCss(ctx.doc, others()); });
  box.addEventListener('input', () => {
    // Another AI's whole answer pasted in: both sides from it.
    const split = /<(?:me|them|我的|对方的)>/i.test(box.value) ? splitBubbleAnswer(box.value) : null;
    if (split && (split.me || split.them)) { if (split.me) draft.me = split.me; if (split.them) draft.them = split.them; shown(); ctx.notify('分成了「我的」和「对方的」两段'); }
    else draft[side] = box.value;
    ctx.win.clearTimeout(soon);
    soon = ctx.win.setTimeout(show, 160);
  });
  d.body.addEventListener('click', async e => {
    const turn = e.target.closest('[data-side]');
    if (turn) { draft[side] = box.value; side = turn.dataset.side; shown(); return; }
    const action = e.target.closest('[data-action]')?.dataset.action, name = () => d.body.querySelector('[data-field=bubble-name]').value.trim() || set.name || '我的气泡';
    try {
      if (action === 'bubble-save') {
        if (!draft.me.trim() && !draft.them.trim()) { ctx.notify('两段都是空的', {error: true}); return; }
        const kept = api.saveBubbleSet({...(set.id ? {id: set.id} : {}), name: name(), me: draft.me, them: draft.them});
        d.close();
        ctx.notify(set.id ? '存好了' : `存好了，换上了「${kept.name}」`);
        saved(kept);
      }
      if (action === 'bubble-ask') ask();
      if (action === 'bubble-copy') ctx.notify(await copyText(ctx.win, bubblePromptText({prompts: api.getState().promptRules, user: api.userName?.() || '我', me: draft.me, them: draft.them})) ? '复制好了：贴给别的 AI，写上想要的样子；把它的回答整段贴回框里，会自动分成两段' : '这个浏览器不让复制');
      if (action === 'bubble-export') ctx.notify('已下载 ' + await saveFile(ctx.doc, new Blob([bubbleFile([{name: name(), me: draft.me, them: draft.them}])], {type: 'application/json'}), fileName(name())));
    } catch (error) { ctx.notify(error.message, {error: true}); }
  });
  /** 让模型改: a wish, which sides; what comes back goes into the boxes (保存 keeps it). */
  function ask() {
    if (!api.bubbleRewrite) { ctx.notify('在酒馆里打开小手机时才能让模型改', {error: true}); return; }
    let which = '';
    const a = ctx.dialog('让模型改', `${field('想改成什么样', textArea('bubble-wish', '', `rows="3" maxlength="${BUBBLE_LIMITS.wish}" placeholder="比如：夏天的汽水感，带一点小气泡的动画"`))}
      <div class="segmented" role="group" aria-label="改哪边">${[['', '两边'], ['me', '只改我的'], ['them', '只改对方的']].map(([k, t]) => `<button type="button" data-which="${k}" aria-pressed="${k === which}">${t}</button>`).join('')}</div>
      <div class="actions">${btn('bubble-go', '改', 'primary')}</div>`, {over: true});
    a.body.addEventListener('click', async e => {
      const w = e.target.closest('[data-which]');
      if (w) { which = w.dataset.which; for (const b of a.body.querySelectorAll('[data-which]')) b.setAttribute('aria-pressed', String(b.dataset.which === which)); return; }
      const go = e.target.closest('[data-action=bubble-go]');
      if (!go || asking) return;
      const wish = a.body.querySelector('[data-field=bubble-wish]').value.trim();
      if (!wish) { ctx.notify('先写下想要什么样的', {error: true}); return; }
      asking = true; go.disabled = true; go.textContent = '在改…';
      try {
        draft[side] = box.value;
        const got = await api.bubbleRewrite({me: draft.me, them: draft.them, wish, side: which});
        draft.me = got.me; draft.them = got.them;
        a.close();
        if (d.live) { shown(); show(); }
        ctx.notify('改好了：看看预览，满意就保存');
      } catch (error) { ctx.notify(error.message, {error: true}); }
      finally { asking = false; if (a.live) { go.disabled = false; go.textContent = '改'; } }
    });
  }
  return d;
}
