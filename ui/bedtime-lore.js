import {swipeRow, mountSwipeList} from './swipe-list.js';
import {btn, esc} from './common.js';

export function bedtimeLore(ctx, form, remember, onCount) {
  let countLabel = '', version = 0, loading = false;
  function read(full) {
    const chat = ctx.api.getState().chat;
    const preset = chat.presets.find(p => p.id === chat.activePreset);
    return ctx.api.loreBooks({full, extra:[...new Set([...(preset?.loreExtraBooks || []), ...form.extraBooks])]}).then(books => books.filter(book => !form.removedBooks.includes(book.name)));
  }
  const selected = book => form.skipBooks.includes(book.name) ? 0 : book.entries.filter(e => !form.skipEntries.includes(e.id)).length;
  function count(books) {
    countLabel = '已选 ' + books.reduce((sum, book) => sum + selected(book), 0) + ' 条';
    onCount(countLabel);
  }
  async function summary() {
    if (countLabel || loading || !ctx.api.loreBooks) return;
    const turn = version;
    loading = true;
    try { const books = await read(false); if (turn === version) count(books); }
    catch { /* Opening the selector reports any read error. */ }
    finally { if (turn === version) loading = false; }
  }
  function pickBook(names) {
    const d = ctx.dialog('添加到睡前故事', `<input class="search" type="search" placeholder="搜索书名" aria-label="搜索可添加的世界书">
      <div class="pick-list bt-lore-list"></div>`, {over:true});
    d.body.classList.add('bt-lore-sheet');
    const search = d.body.querySelector('input'), list = d.body.querySelector('.pick-list');
    const paint = () => {
      const query = search.value.trim().toLowerCase();
      list.innerHTML = names.filter(name => name.toLowerCase().includes(query)).map(name =>
        `<button type="button" class="list-row" data-name="${esc(name)}">${esc(name)}</button>`).join('') || '<p class="hint">没有找到相关世界书</p>';
    };
    search.oninput = paint;
    paint();
    return new Promise(resolve => {
      d.onClose(() => resolve(null));
      list.onclick = e => {
        const row = e.target.closest('[data-name]');
        if (row) { resolve(row.dataset.name); d.close(); }
      };
    });
  }
  async function open() {
    const d = ctx.dialog('参考世界书', '<p class="hint">正在读取世界书…</p>');
    try {
      let books = await read(true);
      if (!d.live) return;
      version++; loading = false; count(books);
      d.body.classList.add('bt-lore-sheet');
      d.body.innerHTML = `<input class="search" type="search" data-bt-find placeholder="搜索书名、条目或正文" aria-label="搜索书名、条目、关键词或正文">
        <div class="lore-list bt-lore-list"></div><footer>${btn('bt-add-lore','添加世界书','chip-button')}<small data-bt-selected></small></footer>`;
      const search = d.body.querySelector('[data-bt-find]'), list = d.body.querySelector('.bt-lore-list');
      let savedPosition = null;
      const toggle = (key, id, title) => `<input class="switch" type="checkbox" data-bt-skip="${key}" value="${esc(id)}" aria-label="读${esc(title)}" ${form[key].includes(id) ? '' : 'checked'}>`;
      function paint() {
        const query = search.value.trim().toLowerCase();
        if (query && !savedPosition) savedPosition = {
          top:list.scrollTop, opened:new Set([...list.querySelectorAll('details[open]')].map(el => el.dataset.key)),
        };
        const rows = books.map((book, i) => {
          const bookHit = book.name.toLowerCase().includes(query);
          const entries = book.entries.map(entry => {
            const content = entry.content || entry.preview || '';
            const pos = query ? content.toLowerCase().indexOf(query) : -1;
            if (!bookHit && pos < 0 && ![entry.title,...(entry.keys || [])].some(v => v.toLowerCase().includes(query))) return '';
            const snippet = pos < 0 ? '' : `<small>${pos > 6 ? '…' : ''}${esc(content.slice(Math.max(0,pos-6),pos))}<mark>${esc(content.slice(pos,pos+query.length))}</mark>${esc(content.slice(pos+query.length,pos+query.length+28))}</small>`;
            const key = 'entry:' + entry.id;
            return `<details class="bt-lore-entry" data-key="${esc(key)}" ${!query && savedPosition?.opened.has(key) ? 'open' : ''}>
              <summary><span class="row-text"><strong>${esc(entry.title)}</strong>${snippet}</span>${toggle('skipEntries',entry.id,entry.title)}</summary>
              <div class="bt-entry-text" tabindex="0" aria-label="条目原文">${esc(content)}</div></details>`;
          }).join('');
          if (query && !entries && !bookHit) return '';
          const key = 'book:' + book.name;
          return `<details class="lore-book" data-book-index="${i}" data-key="${esc(key)}" ${query || savedPosition?.opened.has(key) ? 'open' : ''}>
            <summary>${swipeRow(book.name, `<span class="bt-book-head"><span class="row-text"><strong>${esc(book.name)}</strong><small data-bt-total></small></span>${toggle('skipBooks',book.name,book.name)}</span>`, [{key:'remove', label:'删除', icon:'trash', danger:true}], {label:book.name})}</summary>
            <div>${entries || '<p class="hint">这本书没有启用的条目</p>'}</div></details>`;
        }).join('');
        list.innerHTML = rows || `<p class="hint">${query ? '没有找到相关条目' : '还没有选世界书'}</p>`;
        sync();
        list.scrollTop = query ? 0 : savedPosition?.top || 0;
        if (!query) savedPosition = null;
      }
      function sync() {
        d.body.querySelector('[data-bt-selected]').textContent = countLabel;
        for (const group of list.querySelectorAll('.lore-book')) {
          const book = books[Number(group.dataset.bookIndex)];
          group.querySelector('[data-bt-total]').textContent = `已选 ${selected(book)} / ${book.entries.length}`;
          for (const input of group.querySelectorAll('[data-bt-skip=skipEntries]')) input.disabled = form.skipBooks.includes(book.name);
        }
      }
      const swipes = mountSwipeList(list, {ctx, onAction:(_key, name) => {
        form.removedBooks = [...new Set([...form.removedBooks, name])];
        form.skipBooks = [...new Set([...form.skipBooks, name])];
        form.extraBooks = form.extraBooks.filter(book => book !== name);
        remember();
        books = books.filter(book => book.name !== name);
        count(books); paint(); ctx.notify('已从睡前故事移除《' + name + '》');
      }});
      d.onClose(() => swipes.dispose());
      search.oninput = paint;
      list.onchange = e => {
        const input = e.target, key = input.dataset.btSkip;
        if (!['skipBooks','skipEntries'].includes(key)) return;
        const skips = new Set(form[key]);
        if (input.checked) skips.delete(input.value); else skips.add(input.value);
        form[key] = [...skips]; remember(); count(books); sync();
      };
      const add = d.body.querySelector('[data-action=bt-add-lore]');
      add.onclick = async () => {
        add.disabled = true;
        try {
          const names = (await ctx.api.loreNames()).filter(name => !books.some(book => book.name === name));
          if (!d.live) return;
          if (!names.length) { ctx.notify('可用的世界书已全部列出'); return; }
          const name = await pickBook(names);
          if (!name || !d.live) return;
          form.removedBooks = form.removedBooks.filter(book => book !== name);
          form.skipBooks = form.skipBooks.filter(book => book !== name);
          form.extraBooks = [...new Set([...form.extraBooks,name])]; remember();
          books = await read(true);
          if (d.live) { search.value = ''; count(books); paint(); }
        } catch (error) { ctx.notify(error.message,{error:true}); }
        finally { add.disabled = false; }
      };
      paint();
    } catch (error) { if (d.live) d.body.textContent = error.message; }
  }
  return {open, summary, label:() => countLabel, reset() { version++; countLabel = ''; loading = false; }};
}
