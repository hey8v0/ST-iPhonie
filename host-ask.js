// A small box on the tavern page that asks for a piece of text (改提示词再画 a picture of the story). It sits over
// everything (the image viewer too) and keeps its keys to itself.

const CSS = `
.sttts-ask{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;box-sizing:border-box;z-index:41000;display:grid;place-items:center;padding:16px;background:rgba(8,10,20,.55);font:14px/1.5 "PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#eef0f8}
.sttts-ask-card{width:min(560px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:18px;background:#1d2030;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:auto}
.sttts-ask-head{display:flex;align-items:center;gap:8px}
.sttts-ask-card h2{margin:0;font-size:16px;font-weight:700;color:#fff}
.sttts-ask-card p{margin:0;font-size:12.5px;opacity:.72}
.sttts-ask .sttts-ask-card textarea{all:unset;display:block;box-sizing:border-box;width:100%;min-height:150px;flex:1;resize:vertical;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#141622;color:#eef0f8;caret-color:#7cc4ff;font:13px/1.55 ui-monospace,Consolas,monospace;-webkit-text-fill-color:#eef0f8}
.sttts-ask .sttts-ask-card textarea:focus,.sttts-ask .sttts-ask-wish input:focus{outline:2px solid #7cc4ff;outline-offset:1px;border-color:transparent}
.sttts-ask-note{margin:0;max-height:32vh;overflow:auto;padding:10px 12px;border-radius:12px;background:rgba(124,196,255,.08);border:1px solid rgba(124,196,255,.22);white-space:pre-wrap;font:13px/1.6 "PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#dfe9f5}
.sttts-ask-note[data-error]{background:rgba(255,120,120,.1);border-color:rgba(255,120,120,.3)}
.sttts-ask-note button{margin-left:8px;min-height:28px;padding:0 12px;font-size:12.5px}
.sttts-ask-wish{display:flex;gap:8px}
.sttts-ask .sttts-ask-wish input{all:unset;flex:1;min-width:0;box-sizing:border-box;height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#141622;color:#eef0f8;caret-color:#7cc4ff;font:13.5px "PingFang SC","Microsoft YaHei",system-ui,sans-serif;-webkit-text-fill-color:#eef0f8}
.sttts-ask .sttts-ask-card textarea,.sttts-ask .sttts-ask-wish input{background:#141622!important;color:#eef0f8!important;-webkit-text-fill-color:#eef0f8!important;border:1px solid rgba(255,255,255,.16)!important;border-radius:12px!important;box-shadow:none!important;backdrop-filter:none!important;text-shadow:none!important;opacity:1!important}
.sttts-ask .sttts-ask-card textarea{font-family:ui-monospace,Consolas,monospace!important;font-size:13px!important}
.sttts-ask .sttts-ask-wish input{font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif!important;font-size:13.5px!important}
.sttts-ask .sttts-ask-wish input::placeholder{color:rgba(238,240,248,.42);-webkit-text-fill-color:rgba(238,240,248,.42)}
.sttts-ask-actions{display:flex;align-items:center;gap:8px}
.sttts-ask-actions .sttts-ask-gap{flex:1}
.sttts-ask button{all:unset;box-sizing:border-box;min-height:40px;padding:0 16px;border-radius:999px;display:inline-grid;place-items:center;cursor:pointer;font-weight:700;background:rgba(255,255,255,.1);color:#fff;white-space:nowrap}
.sttts-ask button[data-tool],.sttts-ask button[data-undo]{font-weight:600;background:transparent;border:1px solid rgba(255,255,255,.22)}
.sttts-ask button[data-info]{min-height:22px;width:22px;padding:0;font-size:12px;font-weight:700;border:1px solid rgba(255,255,255,.35);background:transparent;opacity:.75}
.sttts-ask button[data-info][aria-expanded="true"]{opacity:1;background:rgba(124,196,255,.2)}
.sttts-ask button[aria-busy="true"]{opacity:.55;cursor:progress}
.sttts-ask button[data-ok]{min-width:76px;background:#7cc4ff;color:#0d1b2a}
.sttts-ask button:focus-visible{outline:2px solid #7cc4ff;outline-offset:2px}
`;

/**
 * 改提示词再画, the same wherever a picture's tags are changed (the story, the phone's chats, 朋友圈): the tags in a box,
 * 「看中文」, and a line to say in plain words how to change them. ask(text, mode, wish) → the text model's answer
 * ('translate' or 'revise'). about: what these tags are and where a change goes (the start of the 「i」).
 * Resolves to the new tags, or null when cancelled.
 */
export function editTags({doc = document, text = '', about = '', ask, title = '改提示词再画', ok = '画'} = {}) {
  // Words that are not tags: 画幅 / 角色 lines of a block, and the names in them.
  const chinese = value => /[一-鿿]/.test(String(value).replace(/^\s*(?:画幅|尺寸|场景|基础|描述|角色|人物|新外貌|登记|位置)\s*[:：][^｜|,，\n]*/gm, '').replace(/^\s*角色\s*[:：]\s*[^｜|]*/gm, ''));
  return askText({doc, title, text, ok,
    hint: (about ? about + '\n\n' : '') + '看不懂英文，点「看中文」。想改又不知道怎么写 tag，就在「想怎么改」里直接说，比如「他笑得太得意了」「背景换成晚上」「两个人离远一点」，点「改」让模型来改。',
    tools: [{label: '看中文', run: async value => ({note: await ask(value, 'translate')})}],
    wish: {label: '改', placeholder: '想怎么改？比如：他笑得太得意了', run: async (value, wish) => {
      if (!wish.trim() && !chinese(value)) return {note: '先在左边说说想怎么改，比如「表情温柔一点」「换成侧脸」。'};
      return {text: await ask(value, 'revise', wish), note: `改好了，看一眼没问题就点「${ok}」；不满意可以接着说，或者点「还原」。`};
    }}});
}

/**
 * Asks for text: resolves to what was written, or null when it was cancelled. Ctrl+Enter is ok, Esc cancels.
 * hint: folded under the title's 「i」. tools: [{label, run(text)}] buttons at the bottom left. wish: {label, placeholder,
 * run(text, wish)} a line to say how to change it. A run resolves to {text} (put in the box, with 还原 to go back) and/or
 * {note} (shown under it).
 */
export function askText({doc = document, title = '', text = '', hint = '', ok = '好', tools = [], wish = null} = {}) {
  const win = doc.defaultView;
  if (!doc.getElementById('sttts-ask-css')) { const style = doc.createElement('style'); style.id = 'sttts-ask-css'; style.textContent = CSS; doc.head.append(style); }
  else doc.getElementById('sttts-ask-css').textContent = CSS;
  const root = doc.createElement('div');
  root.className = 'sttts-ask';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = '<div class="sttts-ask-card"><div class="sttts-ask-head"><h2></h2></div><p hidden></p><textarea spellcheck="false"></textarea><pre class="sttts-ask-note" aria-live="polite" hidden></pre>'
    + '<div class="sttts-ask-actions"><span class="sttts-ask-gap"></span><button type="button" data-cancel>取消</button><button type="button" data-ok></button></div></div>';
  root.querySelector('h2').textContent = title;
  const info = root.querySelector('p');
  if (hint) {
    info.textContent = hint;
    const button = doc.createElement('button');
    button.type = 'button'; button.dataset.info = ''; button.textContent = 'i';
    button.setAttribute('aria-label', '说明'); button.setAttribute('aria-expanded', 'false');
    root.querySelector('.sttts-ask-head').append(button);
  }
  root.querySelector('[data-ok]').textContent = ok;
  const bar = root.querySelector('.sttts-ask-actions'), note = root.querySelector('.sttts-ask-note'), area = root.querySelector('textarea');
  tools.forEach((tool, i) => {
    const button = doc.createElement('button');
    button.type = 'button'; button.dataset.tool = String(i); button.textContent = tool.label;
    bar.insertBefore(button, bar.querySelector('.sttts-ask-gap'));
  });
  let line = null;
  if (wish) {
    const row = doc.createElement('div');
    row.className = 'sttts-ask-wish';
    row.innerHTML = '<input type="text"><button type="button" data-tool="wish"></button>';
    line = row.querySelector('input');
    line.placeholder = wish.placeholder || ''; line.setAttribute('aria-label', wish.placeholder || wish.label);
    row.querySelector('button').textContent = wish.label;
    note.before(row);
  }
  area.value = text;
  root.setAttribute('aria-label', title);
  doc.body.append(root);
  area.focus({preventScroll: true});
  let before = null;
  const show = (value, {error = false, undo = false} = {}) => {
    note.textContent = value || ''; note.hidden = !value; note.toggleAttribute('data-error', error);
    if (undo && value) { const back = doc.createElement('button'); back.type = 'button'; back.dataset.undo = ''; back.textContent = '还原'; note.append(back); }
  };
  async function use(button) {
    const tool = button.dataset.tool === 'wish' ? wish : tools[Number(button.dataset.tool)];
    if (!tool || button.getAttribute('aria-busy') === 'true') return;
    const label = button.textContent, was = area.value;
    button.setAttribute('aria-busy', 'true'); button.textContent = label + '…';
    try {
      const out = tool === wish ? await tool.run(area.value, line.value) : await tool.run(area.value);
      if (!root.isConnected) return;
      const changed = typeof out?.text === 'string' && out.text.trim() && out.text !== was;
      if (changed) { before = was; area.value = out.text; if (tool === wish) line.value = ''; }
      show(out?.note || '', {undo: changed});
    } catch (error) { if (root.isConnected) show(error.message || '没有成功，再试一次', {error: true}); }
    finally { button.removeAttribute('aria-busy'); button.textContent = label; }
  }
  return new Promise(resolve => {
    const done = value => { win.removeEventListener('keydown', onKey, true); root.remove(); resolve(value); };
    // On the window, before the viewer and the tavern hear of it.
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done(area.value); }
      else if (e.key === 'Enter' && line && e.target === line && !e.isComposing) { e.preventDefault(); use(line.nextElementSibling); }
      e.stopPropagation();
    };
    win.addEventListener('keydown', onKey, true);
    root.addEventListener('click', e => {
      e.stopPropagation();
      const tool = e.target.closest('[data-tool]');
      if (tool) use(tool);
      else if (e.target.closest('[data-info]')) { const b = e.target.closest('[data-info]'), open = info.hidden; info.hidden = !open; b.setAttribute('aria-expanded', String(open)); }
      else if (e.target.closest('[data-undo]')) { if (before !== null) { area.value = before; before = null; } show(''); }
      else if (e.target.closest('[data-ok]')) done(area.value);
      else if (e.target.closest('[data-cancel]') || e.target === root) done(null);
    });
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'wheel']) root.addEventListener(type, e => e.stopPropagation(), {passive: true});
  });
}
