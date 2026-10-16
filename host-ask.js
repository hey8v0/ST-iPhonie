// A small box on the tavern page that asks for a piece of text (改提示词再画 a picture of the story). It sits over
// everything (the image viewer too) and keeps its keys to itself.

const CSS = `
.sttts-ask{position:fixed;inset:0;z-index:41000;display:grid;place-items:center;padding:16px;background:rgba(8,10,20,.55);font:14px/1.5 "PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#eef0f8}
.sttts-ask-card{width:min(560px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:18px;background:#1d2030;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.sttts-ask-card h2{margin:0;font-size:16px;font-weight:700;color:#fff}
.sttts-ask-card p{margin:0;font-size:12.5px;opacity:.72}
.sttts-ask-card textarea{box-sizing:border-box;width:100%;min-height:150px;flex:1;resize:vertical;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#141622;color:#eef0f8;font:13px/1.55 ui-monospace,Consolas,monospace}
.sttts-ask-card textarea:focus{outline:2px solid #7cc4ff;outline-offset:1px}
.sttts-ask-actions{display:flex;justify-content:flex-end;gap:8px}
.sttts-ask button{all:unset;box-sizing:border-box;min-height:40px;min-width:76px;padding:0 18px;border-radius:999px;display:inline-grid;place-items:center;cursor:pointer;font-weight:700;background:rgba(255,255,255,.1);color:#fff}
.sttts-ask button[data-ok]{background:#7cc4ff;color:#0d1b2a}
.sttts-ask button:focus-visible{outline:2px solid #7cc4ff;outline-offset:2px}
`;

/** Asks for text: resolves to what was written, or null when it was cancelled. Ctrl+Enter is ok, Esc cancels. */
export function askText({doc = document, title = '', text = '', hint = '', ok = '好'} = {}) {
  const win = doc.defaultView;
  if (!doc.getElementById('sttts-ask-css')) { const style = doc.createElement('style'); style.id = 'sttts-ask-css'; style.textContent = CSS; doc.head.append(style); }
  const root = doc.createElement('div');
  root.className = 'sttts-ask';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = '<div class="sttts-ask-card"><h2></h2><p hidden></p><textarea spellcheck="false"></textarea><div class="sttts-ask-actions"><button type="button" data-cancel>取消</button><button type="button" data-ok></button></div></div>';
  root.querySelector('h2').textContent = title;
  if (hint) { const p = root.querySelector('p'); p.textContent = hint; p.hidden = false; }
  root.querySelector('[data-ok]').textContent = ok;
  const area = root.querySelector('textarea');
  area.value = text;
  root.setAttribute('aria-label', title);
  doc.body.append(root);
  area.focus({preventScroll: true});
  return new Promise(resolve => {
    const done = value => { win.removeEventListener('keydown', onKey, true); root.remove(); resolve(value); };
    // On the window, before the viewer and the tavern hear of it.
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done(area.value); }
      e.stopPropagation();
    };
    win.addEventListener('keydown', onKey, true);
    root.addEventListener('click', e => {
      e.stopPropagation();
      if (e.target.closest('[data-ok]')) done(area.value);
      else if (e.target.closest('[data-cancel]') || e.target === root) done(null);
    });
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'wheel']) root.addEventListener(type, e => e.stopPropagation(), {passive: true});
  });
}
