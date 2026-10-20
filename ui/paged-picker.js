// A list with a search box that shows one page at a time: hundreds of sprites must not make hundreds of image requests.
import {esc} from './common.js';

/**
 * items: what to choose from; render(item): its button; text(item): what the search looks in; id(item): its key.
 * selected: the key of the chosen one (its page shows first). Returns {page, total} (the page shown, the rows found).
 */
export function pagedPicker(root, {items, render, text = x => x.name || '', id = x => x.id, pageSize = 12, selected, placeholder = '搜索…', listClass = 'pick-list'} = {}) {
  let page = 0, rows = items;
  const current = selected === undefined ? -1 : items.findIndex(x => id(x) === selected);
  if (current >= 0) page = Math.floor(current / pageSize);
  root.classList.add('paged-picker');
  root.innerHTML = `<div class="picker-search"><input type="search" aria-label="${esc(placeholder)}" placeholder="${esc(placeholder)}" data-picker-search autocomplete="off"></div>
    <div data-picker-items class="${esc(listClass)}"></div>
    <div class="picker-pages"><button type="button" data-picker-step="-1" aria-label="上一页">‹</button><span data-picker-count role="status"></span><button type="button" data-picker-step="1" aria-label="下一页">›</button></div>`;
  const list = root.querySelector('[data-picker-items]'), count = root.querySelector('[data-picker-count]'), search = root.querySelector('input');
  const normalize = s => String(s ?? '').normalize('NFKC').toLocaleLowerCase();
  function paint() {
    const total = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.max(0, Math.min(total - 1, page));
    list.innerHTML = rows.slice(page * pageSize, (page + 1) * pageSize).map(render).join('') || '<p class="hint">没有匹配项</p>';
    count.textContent = `${page + 1} / ${total} · ${rows.length}`;
    // One page needs no turning; a short list needs no search.
    root.querySelector('.picker-pages').hidden = total <= 1;
    root.querySelector('.picker-search').hidden = items.length <= 6;
    root.querySelector('[data-picker-step="-1"]').disabled = page === 0;
    root.querySelector('[data-picker-step="1"]').disabled = page === total - 1;
  }
  search.addEventListener('input', () => {
    const query = normalize(search.value).trim();
    rows = query ? items.filter(x => normalize(text(x)).includes(query)) : items;
    page = 0;
    paint();
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-picker-step]');
    if (!button) return;
    event.preventDefault();
    page += Number(button.dataset.pickerStep);
    paint();
  });
  paint();
  return {get page() { return page; }, get total() { return rows.length; }};
}
