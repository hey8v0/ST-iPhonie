import {btn, esc} from './common.js';

// Read a catalog without running a synthesis. A late response belongs to the dialog and set that requested it.
export function openCustomCatalog(ctx, connection, kind, isCurrent, choose) {
  const noun = kind === 'model' ? '模型' : '音色';
  const dialog = ctx.dialog(choose ? '选择' + noun : '浏览' + noun,
    '<input type="search" data-query aria-label="搜索" placeholder="搜索名称或 ID">' +
    btn('search', '搜索', 'secondary') + '<div data-results></div><p data-note class="hint"></p>');
  const list = dialog.body.querySelector('[data-results]');
  const note = dialog.body.querySelector('[data-note]');
  const seen = new Set();
  let epoch = 0, search = '', page = 0, token = '';
  async function load(more) {
    const ticket = ++epoch;
    if (!more) {
      page = 0;
      token = '';
      search = dialog.body.querySelector('[data-query]').value.trim();
      seen.clear();
      list.replaceChildren();
    }
    note.textContent = '正在读取…';
    try {
      const result = await ctx.api.voices('custom', connection, {kind, search, token, page});
      if (!dialog.live || !isCurrent() || ticket !== epoch) return;
      if (more && result.error) { note.textContent=result.error; return; }
      const rows = result.voices.filter(row => !seen.has(row.id));
      for (const row of rows) seen.add(row.id);
      list.querySelector('[data-more]')?.remove();
      for (const row of rows) {
        const inner = '<span><strong>' + esc(row.name) + '</strong><small>' + esc([row.id,row.info].filter(Boolean).join(' · ')) + '</small></span>';
        list.insertAdjacentHTML('beforeend', choose
          ? '<button type="button" class="list-row" data-id="' + esc(row.id) + '">' + inner + '</button>'
          : '<div class="list-row">' + inner + '</div>');
      }
      if (result.more) list.insertAdjacentHTML('beforeend','<button class="text-button" data-more>加载更多</button>');
      note.textContent = result.note;
      token = result.token;
      page++;
    } catch (error) {
      if (dialog.live && isCurrent() && ticket === epoch) note.textContent = error.message;
    }
  }
  dialog.body.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !isCurrent()) return;
    if (button.hasAttribute('data-more')) load(true);
    else if (button.dataset.action === 'search') load(false);
    else if (choose && button.dataset.id) { dialog.close(); choose(button.dataset.id); }
  });
  load(false);
}
