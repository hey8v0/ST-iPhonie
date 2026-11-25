// 绘本: the story made into picture books — spreads of two pages, the pictures telling the story and a few sentences on
// each read aloud. The shelf (each book's cover as it is); 做一本 (which part of the chat; 改编 by the text model into
// spreads laid out to the story's pace, or the story as written with its pictures; the kind of book; whether pictures
// are drawn, in the book's own way or the 绘图 App's; how long); making it (written, then every picture planned drawn,
// each kept as it comes, so leaving does not lose it); the reader (book-reader.js: a page at a time on the phone, 全屏
// on the tavern page, 朗读 turning the pages, the line being read marked); changes to a spread (its words and who says
// them, its heading, its layout, its pictures, its weather and sound, spreads added or taken out) and the book (its
// kind, how it is drawn, its title, its last line); and exports: a web page that reads itself (.html), PDF, EPUB, the
// reading as one sound file, and the pages as pictures.
import {createView, esc, heading, menu, help, field, btn, select, avatar} from './common.js';
import {icon} from './icons.js';
import {saveFile, zipFiles} from '../download.js';
import {pictureInputs, sizeFor, activeStyle, withoutPeopleTags} from '../core/draw.js';
import {pickLook} from '../core/vn.js';
import {BOOK_THEMES, THEME_IDS, themeOf, guessTheme} from '../core/book-themes.js';
import {storySpreads, storyScript, retellPrompt, retoldSpreads, paceSpreads, bookOf, spreadsFor, scriptParts, normalizeSpread, readOf, castOf, shapeOf, composeOf, missingPictures, wordsOf, sheetOf, sheetCount, castSpread, slotsOf, bookText, namesIn, SPREADS, SPREAD_IDS, WEATHER, BOOK_LIMIT} from '../core/book.js';
import {shareToChat} from './share-to-chat.js';
import {openPuzzle} from './book-puzzle.js';
import {viewMarkup, themeStyle, directionOf} from '../core/book-pages.js';
import {mountBookReader, bookStyles} from '../book-reader.js';
import {pageJpeg, drawSimple} from './book-render.js';
import {pdfFromJpegs, epubOf} from '../core/book-export.js';
import {bookHtml} from '../core/book-html.js';
import {decodeMono, joinClips, encodeWav} from '../core/audio-join.js';

const MODES = [['retell', '绘本（改编）'], ['story', '原文配图']];
const PICTURES = [['draw', '正文的图＋补画'], ['story', '只用正文的图'], ['none', '不要插图']];
const ARTS = [['book', '绘本画风'], ['app', '绘图 App 的画风']];
const LENGTHS = [['auto', '按故事长短'], ['8', '短（8 个跨页）'], ['12', '中（12 个跨页）'], ['16', '长（16 个跨页）']];
const SHAPES = {横: '横图', 竖: '竖图', 方: '方图'};
const keyOf = p => p?.id ? 'id:' + p.id : p?.url ? 'url:' + p.url : '';

import {bedtimeView, bookTabs} from './bedtime.js';
import {bedtimeLore} from './bedtime-lore.js';
import {pagedPicker} from './paged-picker.js';
import {BOOK_SOURCES, BOOK_TEXT_LIMIT, bookForm, bookRange, rangeMarkup, pickBookRange, readBookSource, bookSpeakers, bookReferenceMarkup} from './book-setup.js';

export function bookApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'picbook'), photoUrls = new Map();
  let view = 'shelf', books = [], book = null, at = 0, job = null, form = null, reader = null, cast = null;
  let theaters = [], lore = null;
  const infoOf = () => { try { return api.bookInfo?.() || null; } catch { return null; } };
  const routes = () => api.readState?.().routes || api.getState().routes;
  const roleNames = () => [...new Set([...routes().map(role => role.name), ...(infoOf()?.roles || [])])].filter(Boolean);
  function messagesOf(info) {
    if (!info?.length) return [];
    try {
      return api.bookMessages?.() || (api.bookSource?.(0, info.length - 1)?.messages || []).map(message => ({
        id:message.id, name:message.name, preview:message.steps.map(step => step.text || '').join(' ').slice(0, 78),
      }));
    } catch { return []; }
  }
  function newForm(info, theater = '') {
    form = bookForm(info, theater);
    lore = bedtimeLore(ctx, form, () => {}, label => {
      const el = v.root.querySelector('[data-bk-lore-count]');
      if (el) el.textContent = label;
    }, {addTitle:'添加到绘本'});
  }
  bookStyles(ctx.doc);
  const bedtime = bedtimeView(ctx, v);

  // ---------- pictures ----------
  const absolute = url => /^(https?:|data:|blob:|\/)/.test(url) ? url : '/' + url.replace(/^\.?\//, '');
  async function picUrl(pic) {
    if (!pic) return '';
    if (pic.url) return absolute(pic.url);
    if (photoUrls.has(pic.id)) return photoUrls.get(pic.id);
    const photo = await api.getPhoto(pic.id).catch(() => null);
    if (!photo?.blob) return '';
    const url = ctx.win.URL.createObjectURL(photo.blob);
    photoUrls.set(pic.id, url);
    return url;
  }
  async function picBlob(pic) {
    if (!pic) return null;
    if (pic.id) return (await api.getPhoto(pic.id).catch(() => null))?.blob || null;
    const r = await ctx.win.fetch(absolute(pic.url)).catch(() => null);
    return r?.ok ? r.blob() : null;
  }
  const firstPicture = b => b.cover.picture || b.spreads.flatMap(s => s.pictures.map(p => p.picture)).find(Boolean) || null;
  /** The pictures sheet n shows (the last page shows the cover's). */
  const picturesOf = (b, n) => slotsOf(b, n).map(p => p.picture).filter(Boolean);
  /** Picture k of sheet n (the cover's on sheet 0; a person's on the people page), made when the spread has no place for it yet. */
  const slotOf = (n, k, owner = book) => n === 0 ? owner.cover : owner.spreads[n - 1].layout === 'cast' ? owner.spreads[n - 1].cast[k] : (owner.spreads[n - 1].pictures[k] ||= {prompt: '', picture: null, people: true, who: []});
  /** The 角色 App's other names for the book's people: {alias → name} (a model may write one of those). */
  const aliasesOf = names => { const out = {}; for (const r of api.readState?.().routes || api.getState().routes) if (names.includes(r.name)) for (const a of r.aliases || []) if (a && !out[a]) out[a] = r.name; return out; };

  // ---------- the 立绘 (the 视觉小说's) ----------
  function loadCast() {
    try { cast = {entries: Object.fromEntries((api.vnCast?.() || []).map(c => [c.name, c])), wear: api.vnWear?.() || {}}; } catch { cast = {entries: {}, wear: {}}; }
    return cast;
  }
  function sprite(name, emotion = '') {
    const c = cast || loadCast(), entry = c.entries[name];
    if (!entry) return '';
    const url = pickLook(entry, {emotion, name, names: Object.keys(c.entries), outfit: c.wear[name] || '', random: () => 0});
    return url ? absolute(url) : '';
  }

  // ---------- the shelf ----------
  async function shelf() {
    leaveReader();
    bedtime.leave();
    view = 'shelf'; book = null;
    books = await api.listBooks().catch(() => []);
    books = books.filter(b => !b.bedtime);
    books.sort((a, b) => (b.at || 0) - (a.at || 0));
    const covers = await Promise.all(books.map(b => picUrl(firstPicture(b))));
    if (view !== 'shelf' || v.disposed) return;
    const card = (b, i) => {
      const front = {...b, cover: {prompt: '', picture: covers[i] ? {url: 'cover'} : null}}, lack = missingPictures(b).length;
      return `<button type="button" class="bk-card" data-book="${esc(b.id)}" aria-label="${esc(b.title)}"><span class="bk-mini">${viewMarkup(front, {sheet: 0, part: 'all'}, {url: () => covers[i]})}</span><span class="bk-badge">${esc(themeOf(b.theme).label)} · ${b.spreads.length} 个跨页${b.readers?.length ? ` · ${b.readers.length} 人读过` : ''}${lack ? ` · 差 ${lack} 张图` : ''}</span></button>`;
    };
    v.draw(heading('绘本', help('把酒馆里的故事做成绘本：一个个摊开的两页（跨页），画面讲故事，每一面只有几句话，读出来的就是印在纸上的。\n\n「绘本（改编）」让文字模型把故事编成跨页，像真的绘本那样有节奏：开头安静，画面越来越大，最紧张的地方是一幅铺满两页的大图，结尾再安静下来。字是讲故事的旁白，偶尔一句说话放进气泡；有立绘的角色偶尔会像剪纸一样站在纸上出场。「原文配图」不改一个字，按段落分成跨页，配上正文的图。\n插图用绘图 App 现在的引擎：「绘本画风」按这本书的风格画（水彩、蜡笔、水墨……），「绘图 App 的画风」用你在绘图 App 里选的画风。\n看书：手机上一页一页翻，铺满两页的大图会慢慢移动，让你看到整幅；点右上角的全屏按钮在酒馆页面看，电脑和平板横着放是摊开的两页。下雨下雪这些天气会飘在画上，朗读时正在读的那句会标出来。') + (books.length ? btn('bk-new', icon('add') + '做一本', 'chip-button') : ''), 'Picture Book')
      + bookTabs(false) + `<div class="bk-shelf">${books.length ? books.map(card).join('') : btn('bk-new', icon('add') + '<span>做一本绘本</span>', 'bk-new')}</div>`);
  }

  // ---------- 做一本 ----------
  function make() {
    const info = infoOf();
    if (!form) newForm(info);
    if (form.chat !== (info?.chat ?? '')) {
      form.chat = info?.chat ?? '';
      form.range = info?.length > 20 ? '20' : 'all';
      form.before = null;
      if (!info?.length && form.kind === 'chat') form.kind = 'paste';
      lore.reset();
    }
    if (view === 'make') form.refsOpen = v.root.querySelector('.bk-references')?.open ?? form.refsOpen;
    leaveReader();
    view = 'make';
    const rows = messagesOf(info), range = bookRange(info || {length:0}, form);
    const sourceFields = form.kind === 'chat'
      ? field(info?.title || '当前剧情', '<button type="button" class="bk-range-preview" data-action="bk-range">' + rangeMarkup(rows, ...range) + '</button>')
      : form.kind === 'theater'
        ? field('小剧场', select('bk-theater', form.theater, [['','选择一段小剧场'], ...theaters.map(row => [row.id,row.title])]))
        : field('故事正文', '<textarea rows="7" data-bk-field="text" maxlength="' + BOOK_TEXT_LIMIT + '" placeholder="粘贴要做成绘本的文字">' + esc(form.text) + '</textarea>');
    const earlier = form.kind === 'chat' ? rows.filter(row => row.id < range[0]) : rows;
    const beforeAvailable = form.before && earlier.some(row => row.id >= form.before[0] && row.id <= form.before[1]);
    if (!beforeAvailable) form.before = null;
    else if (form.kind === 'chat') form.before = [form.before[0], Math.min(form.before[1], range[0] - 1)];
    let source;
    try { source = readBookSource(form, info, api, theaters, ctx.doc); } catch { /* The form shows the relevant source controls. */ }
    const seg = (key, list) => `<div class="segmented">${list.map(([k, l]) => `<button type="button" data-bk-set="${key}" data-value="${k}" aria-pressed="${form[key] === k}">${l}</button>`).join('')}</div>`;
    v.draw(heading('做一本绘本', '', 'New Book')
      + `<div class="group pad bk-setup">
        <div class="field"><span>故事来源</span>${seg('kind', BOOK_SOURCES)}</div>
        ${sourceFields}
        ${bookReferenceMarkup(form, earlier, roleNames(), lore.label())}
        <div class="field"><span>怎么做${help('绘本（改编）：文字模型把故事编成一个个跨页，每一面一到三句旁白，会用文字模型的额度。原文配图：不改一个字，按段落分成跨页，每个跨页配一张图。')}</span>${seg('mode', MODES)}</div>
        <div class="field"><span>风格</span></div>
        <div class="bk-themes"><button type="button" class="bk-theme" data-bk-theme="auto" aria-pressed="${form.theme === 'auto'}" style="--bk-paper:var(--card);--bk-ink:var(--ink);--bk-accent:var(--accent);--bk-title:inherit"><b>自动</b><i></i></button>${THEME_IDS.map(id => `<button type="button" class="bk-theme" data-bk-theme="${id}" data-theme="${id}" aria-pressed="${form.theme === id}" style="${themeStyle(id)}"><b>${esc(BOOK_THEMES[id].label)}</b><i></i></button>`).join('')}</div>
        <div class="field"><span>插图${help('补画用绘图 App 现在的引擎，每张都存进相册。一本书要画的有：封面，和每个跨页的一张图（「两个瞬间」是两张）。NovelAI 用 Opus 画小图不扣点；别的大小或引擎会花额度，开始前会问你。')}</span>${seg('pictures', PICTURES)}</div>
        ${form.pictures === 'draw' ? `<div class="field"><span>画风${help('绘本画风：按这本书的风格画（童话是水彩彩铅、古风是水墨、搞笑是蜡笔卡通……），不用绘图 App 里的画师串。绘图 App 的画风：用你在绘图 App 里选的画风画。')}</span>${seg('art', ARTS)}</div>` : ''}
        ${form.mode === 'retell' ? `<div class="field"><span>篇幅</span>${seg('length', LENGTHS)}</div>` : ''}
        ${peopleRow([...new Set([...bookSpeakers(source), ...form.names])])}
        <div class="field"><span>书名（可以不填）</span><input data-bk-field="title" value="${esc(form.title)}" maxlength="40" placeholder="${esc(source?.title || (form.mode === 'retell' ? '让文字模型起' : '可以稍后改名'))}"></div></div>
        <div class="actions"><button type="button" class="secondary" data-action="bk-shelf">取消</button><button type="button" class="primary" data-action="bk-start">${icon('paint')}开始做</button></div>`);
  }

  /**
   * 出场人物 (0.9.40): who speaks in the chosen stretch of the story, and whether the 角色 App has their looks (a picture of
   * them is drawn from those): a tap opens their page there. Read once for a stretch (the steps of every message).
   */
  function peopleRow(names) {
    if (form.pictures === 'none' || !names.length) return '';
    const chip = name => {
      const looks = !!ctx.routeFor?.(name)?.appearance?.trim();
      return '<button type="button" class="chip' + (looks ? '' : ' warn') + '" data-bk-person="' + esc(name) + '">' + esc(name) + (looks ? '' : ' · 没写外貌') + '</button>';
    };
    return '<div class="field"><span>出场人物</span><div class="bk-people-row">' + names.map(chip).join('') + '</div></div>';
  }
  async function pickRange(main) {
    const info = infoOf(), range = bookRange(info || {length:0}, form);
    const rows = messagesOf(info).filter(row => main || form.kind !== 'chat' || row.id < range[0]);
    const initial = main ? range : form.before || [Math.max(0, (rows.at(-1)?.id || 0) - 5), rows.at(-1)?.id ?? 0];
    const chosen = await pickBookRange(ctx, rows, initial, main);
    if (!chosen || info?.chat !== infoOf()?.chat) return;
    if (main) Object.assign(form, chosen);
    else form.before = [chosen.from,chosen.to];
    make();
  }
  function chooseRoles() {
    const names = roleNames(), routesByName = new Map(routes().map(role => [role.name, role]));
    const selected = new Set(form.names.filter(name => names.includes(name)));
    const d = ctx.dialog('参考角色设定', '<div data-bk-role-picker></div><div class="actions">'
      + btn('bk-people-ok', '', 'primary') + '</div>');
    const label = () => '确认人物' + (selected.size ? ' · 已选 ' + selected.size + ' 位' : '');
    const confirm = d.body.querySelector('[data-action=bk-people-ok]');
    confirm.textContent = label();
    pagedPicker(d.body.querySelector('[data-bk-role-picker]'), {
      items:names, id:name => name, text:name => [name, ...(routesByName.get(name)?.aliases || [])].join(' '),
      selected:selected.values().next().value, pageSize:6, placeholder:'搜索角色…',
      render(name) {
        const role = routesByName.get(name), active = selected.has(name);
        return `<button type="button" class="list-row" data-bk-pick-role="${esc(name)}" aria-pressed="${active}">
          ${avatar(name, ctx.engineOf(name), 36, role?.ownKey || name)}<span><strong>${esc(name)}</strong></span>${icon('check')}
        </button>`;
      },
    });
    d.body.addEventListener('click', event => {
      const row = event.target.closest('[data-bk-pick-role]');
      if (!row) return;
      const name = row.dataset.bkPickRole, active = selected.has(name);
      if (active) selected.delete(name);
      else if (selected.size < 12) selected.add(name);
      else { ctx.notify('最多可选 12 位角色'); return; }
      row.setAttribute('aria-pressed', String(!active));
      confirm.textContent = label();
    });
    confirm.onclick = () => {
      form.names = names.filter(name => selected.has(name));
      d.close(); make();
    };
  }
  // ---------- making ----------
  function progress(title, done, total, note = '', preview = '') {
    if (view !== 'making') return;
    v.draw(heading('正在做绘本', '', 'Making')
      + `<div class="bk-progress">${preview ? `<img class="bk-preview" src="${esc(preview)}" alt="">` : ''}<b>${esc(title)}</b><div class="bk-bar"><i style="width:${total ? Math.round(done / total * 100) : 5}%"></i></div><small>${esc(note)}</small></div>
        <p class="hint">做好的部分随时存着：中途停下，之后在书里点「⋯ → 补画缺的图」接着画。</p>
        <div class="actions"><button type="button" class="secondary" data-action="bk-stop">停下</button></div>`);
  }
  /**
   * Spreads without the pictures they were planned with (只用正文的图 / 不要插图): the story's own pictures kept; a
   * spread left with none is words only (someone standing on the paper stays).
   */
  function picturesFor(spreads, how) {
    if (how === 'draw') return spreads;
    return spreads.map(s => {
      if (s.layout === 'stage' || s.layout === 'text') return s;
      // The people page: without any pictures the book has none of them either; with the story's own it waits for theirs.
      if (s.layout === 'cast') return how === 'none' ? null : s;
      const pictures = how === 'story' ? s.pictures.filter(p => p.picture) : [];
      const layout = !pictures.length ? 'text' : pictures.length < SPREADS[s.layout].pictures ? 'page' : s.layout;
      return normalizeSpread({...s, layout, pictures});
    }).filter(Boolean);
  }
  async function start() {
    if (job) return;
    const info = infoOf();
    const me = job = {stop:false};
    view = 'making'; book = null;
    try {
      progress('读故事', 0, 1);
      const source = readBookSource(form, info, api, theaters, ctx.doc);
      const {script, pictures} = storyScript(source.messages);
      if (!script.trim()) throw Error('这一段里没有故事内容');
      const needsReferences = form.before || form.world || form.persona || form.names.length;
      if (needsReferences && !api.bookReferences) throw Error('请在酒馆中打开绘本，读取参考资料');
      const references = needsReferences ? await api.bookReferences({chat:form.chat, range:form.before, names:form.names, persona:form.persona, world:form.world,
          skipBooks:[...form.skipBooks,...form.removedBooks], skipEntries:form.skipEntries, extraBooks:form.extraBooks, script}) : '';
      if (me.stop) throw Error('停下了');
      loadCast();
      const speakers = [...new Set([...bookSpeakers(source), ...form.names, ...(form.persona && source.user ? [source.user] : [])])];
      const standing = speakers.filter(n => sprite(n)), aliases = aliasesOf(speakers);
      let spreads, title = form.title.trim() || (source.kind === 'theater' ? source.title : ''), subtitle = '', genre = '', cover = '', ending = '', coverWho = [], people = [];
      if (form.mode === 'retell') {
        const parts = scriptParts(script), want = form.length === 'auto' ? spreadsFor(script.length) : Number(form.length);
        // The sounds the 音效 library has (while 音效 is on): the model picks each spread's ambience and sounds from them.
        const sounds = await api.bookSounds?.().catch(() => null) || null;
        spreads = [];
        for (let i = 0; i < parts.length; i++) {
          if (me.stop) throw Error('停下了');
          progress('文字模型在编绘本', i, parts.length, parts.length > 1 ? `故事比较长，分成 ${parts.length} 段来编：第 ${i + 1} 段` : '分成跨页、想每一面的画面和排法、写读出来的几句话');
          const last = spreads.at(-1);
          const prompt = retellPrompt(parts[i], {spreads: Math.max(3, Math.round(want * parts[i].length / script.length)), cast: speakers, staged: standing, part: parts.length > 1 ? {index: i, of: parts.length} : null, before: last ? last.words.map(w => w.text).join('').slice(0, 160) : '', sounds, references});
          const got = retoldSpreads(await api.bookWrite(prompt.system, prompt.user), {pictures, cast: speakers, staged: standing, aliases});
          if (!i) { title ||= got.title; subtitle = got.subtitle; genre = got.genre; cover = got.cover; coverWho = got.coverWho; people = got.people; }
          ending = got.ending || ending;
          spreads.push(...got.spreads);
        }
        // Written in parts: paced once more as one book (the pictures across both pages, those standing on the paper).
        if (parts.length > 1) spreads = paceSpreads(spreads);
      } else { spreads = storySpreads(source.messages); people = speakers.map(name => ({name})); }
      // 出场人物: the page after the cover (改编: the people the model picked, with a line each; 原文: who speaks).
      const page = castSpread(people);
      if (page) spreads.unshift(page);
      spreads = picturesFor(spreads, form.pictures);
      const theme = form.theme === 'auto' ? genre || guessTheme(wordsOf(spreads)) : form.theme;
      const drawn = form.pictures === 'draw' && !!cover;
      if (me.stop) throw Error('停下了');
      book = await api.saveBook(bookOf({title:title || (source.title ? source.title + '的故事' : '无题'), subtitle, author:source.user, theme, art:form.art, mode:form.mode,
        source:{kind:source.kind, chat:source.chat, name:source.title, from:source.from, to:source.to, people:[...form.names, ...(form.persona && source.user ? [source.user] : [])],
          ...(form.mode === 'story' && form.pictures === 'draw' && references ? {references} : {})},
        spreads, cover:drawn ? cover : '', coverWho, coverPicture:drawn ? null : spreads.flatMap(s => s.pictures.map(p => p.picture)).find(Boolean) || null, ending}));
      if (job === me) {
        job = null; at = 0;
        if (form.pictures === 'draw' && missingPictures(book, book.mode === 'story').length) return reviewDraft();
        await open(book.id); ctx.notify('《' + book.title + '》做好了');
      }
    } catch (error) {
      if (job === me) job = null;
      if (book) { ctx.notify(`停在这里了：${error.message}（做好的部分已存好）`, {error: !me.stop}); await open(book.id); }
      else { ctx.notify(error.message, {error: true}); make(); }
    }
  }
  function reviewDraft() {
    view = 'review';
    const todo = missingPictures(book, book.mode === 'story');
    v.draw(heading(book.title, '', '绘本草稿') + '<div class="actions bk-draft-actions">'
      + btn('bk-preview-draft','打开绘本','secondary')
      + btn('bk-draw-draft','开始画 ' + todo.length + ' 张','primary',todo.length ? '' : 'disabled')
      + '</div><div class="group">'
      + book.spreads.map((spread, index) => '<button type="button" class="list-row bk-draft-row" data-action="bk-preview-draft" data-sheet="' + (index + 1) + '"><span><strong>'
        + esc(spread.heading || (spread.layout === 'cast' ? '出场人物' : '第 ' + (index + 1) + ' 个跨页'))
        + '</strong><small>' + esc(spread.words.map(word => word.text).join(' ').slice(0, 96)) + '</small></span>' + icon('next') + '</button>').join('') + '</div>');
  }
  async function drawDraft() {
    if (view !== 'review' || job) return;
    const id = book.id, me = job = {stop:false};
    view = 'making';
    progress('准备画插图', 0, missingPictures(book, book.mode === 'story').length);
    try { await drawMissing(me, {all:book.mode === 'story'}); }
    finally {
      if (job === me) job = null;
      if (book?.id === id) await open(id, 0);
    }
  }
  /** Draws every picture still to be drawn (asking once when it costs). Each one is kept as it comes. */
  async function drawMissing(me = {stop: false}, {all = false} = {}) {
    const targetId = book.id, todo = missingPictures(book, all);
    if (!todo.length) return 0;
    if (!api.drawReady?.()) { ctx.notify('绘图 App 还没设置好引擎，图先空着，设置好后在书里点「⋯ → 补画缺的图」', {error: true}); return 0; }
    const quote = api.drawQuote?.(api.getState().draw.params);
    if (quote && quote.free === false && !await ctx.confirm(`要画 ${todo.length} 张图`, '按现在绘图 App 的设置，每张都会花点数或额度。继续画吗？')) return 0;
    let done = 0, failed = 0, last = '', why = '';
    for (const item of todo) {
      if (me.stop || book?.id !== targetId) break;
      if (view === 'making') progress('画插图', done, todo.length, `第 ${done + failed + 1} 张，共 ${todo.length} 张${item.sheet ? '' : '（封面）'}${failed ? `；${failed} 张没画成` : ''}`, last);
      try {
        const pic = await drawShot(item.sheet, item.k, {owner: await api.getBook(targetId)});
        done++;
        last = await picUrl(pic);
      } catch (error) { failed++; why = error.message; if (error.code === 'PAID') break; }
    }
    if (failed) ctx.notify(`有 ${failed} 张图没画成${why ? `（${why}）` : ''}，之后可以在书里点「⋯ → 补画缺的图」再试`, {error: true});
    return done;
  }
  /** The settings pictures are drawn with: 绘本画风 puts the book's own way of drawing in place of the 画风's artists. */
  function drawSettings(owner = book) {
    const state = api.getState();
    if (owner.art !== 'book') return state;
    const s = structuredClone(state), style = activeStyle(s.draw), t = themeOf(owner.theme);
    if (style) { style.artist = ''; style.positive = t.art; }
    return s;
  }
  const safeTitle = (owner = book) => owner.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 30) || '绘本';
  /**
   * Draws picture k of sheet n (the cover: sheet 0): what it shows (its prompt, else one written from the spread's
   * words), in the book's way, with the people in it, composed for where it goes (alone on white, room left for the
   * words …), in the shape of its place.
   */
  async function drawShot(n, k, {prompt, owner = book} = {}) {
    if (!owner) throw Error('原绘本已关闭');
    const target = structuredClone(owner), before = await api.getBook(target.id);
    if (!before) throw Error('原绘本已经删掉了');
    const place = b => {
      const spread = n ? b.spreads[n - 1] : null, kind = !n ? 'cover' : spread?.layout === 'cast' ? 'cast' : 'picture';
      const slot = !n ? b.cover : kind === 'cast' ? spread?.cast[k] : spread?.pictures[k];
      return JSON.stringify({kind, slot: slot || null});
    }, expected = place(before);
    const spread = sheetOf(target, n).spread || null, t = themeOf(target.theme), names = castOf(target), s = slotOf(n, k, target);
    const words = readOf(target, n).map(l => l.text).join(' ');
    let what = prompt ?? s.prompt, peopleFromPrompt = [];
    if (!what) {
      const excerpt = (words || target.title).slice(0, 400), refs = target.source?.references;
      const idea = refs ? '只为这一页正文配图，参考资料只用于识别已有的人物和环境。\n【本页正文】\n' + excerpt + '\n【参考资料】\n' + refs : excerpt;
      const w = await api.writePrompt(idea, names);
      what = w?.prompt || '';
      peopleFromPrompt = (w?.people || []).filter(name => names.includes(name));
    }
    if (!what) throw Error('没能写出这一张要画什么');
    s.prompt = what;
    // Whose looks go with it (0.9.40): the people the model named for this picture; else the book's people named in
    // what it shows (by name or alias, any case); else — the old way — those named in the page's words.
    const people = s.people !== false, aliases = aliasesOf(names);
    const named = people ? (s.who || []).filter(x => names.includes(x)) : [];
    const who = !people ? [] : named.length ? named : peopleFromPrompt.length ? peopleFromPrompt : namesIn(what, names, aliases).length ? namesIn(what, names, aliases) : namesIn(words, names, aliases).slice(0, 2);
    if (people && !named.length) s.who = who;
    const scene = [people ? what : [withoutPeopleTags(what), 'no humans, scenery'].filter(Boolean).join(', '), composeOf(spread)].filter(Boolean).join(', ');
    const inputs = pictureInputs(drawSettings(target), {prompt: scene, characters: who}, people && !who.length ? words : '');
    inputs.params = {...inputs.params, ...sizeFor(inputs.params, shapeOf(spread))};
    inputs.negative = [inputs.negative, t.negative, people ? '' : '1girl, 1boy, people, person, character', spread && ['quiet', 'ground'].includes(spread.layout) ? 'frame, border, busy background' : ''].filter(Boolean).join(', ');
    const {names: _n, ...request} = inputs;
    const result = await api.generateImage({...request, allowPaid: true, name: '绘本-' + safeTitle(target), key: `book:${target.id}:${n}:${k}`, label: `绘本 · ${target.title} · ${n ? `第 ${n} 个跨页` : '封面'}`});
    s.picture = {id: result.photoId};
    const latest = await api.getBook(target.id);
    if (!latest || place(latest) !== expected) throw Error('绘本已改动，生成的图已保存在相册');
    Object.assign(slotOf(n, k, latest), s);
    const saved = await api.saveBook(latest, {preserveReaders: true});
    if (book?.id === target.id) { book = saved; reader?.changed(book, n); }
    return s.picture;
  }

  // ---------- the reader ----------
  function leaveReader() { reader?.destroy(); reader = null; v.root.classList.remove('book-mode'); }
  async function open(id, sheet = at) {
    const next = await api.getBook(id);
    if (!next) { ctx.notify('这本绘本找不到了', {error: true}); return shelf(); }
    leaveReader();
    book = next; view = 'read'; at = Math.min(sheet, sheetCount(book) - 1);
    loadCast();
    v.draw('<div class="bk-reading" data-bk-host></div>');
    v.root.classList.add('book-mode');
    reader = mountBookReader({doc: ctx.doc, root: v.root.querySelector('[data-bk-host]'), book, picture: picUrl, sprite, read: (lines, onLine) => api.bookRead(lines, onLine), sound: api.bookSound ? (kind, name) => api.bookSound(kind, name) : null, stop: () => api.stop?.(), at, two: true, draft: true,
      onClose: () => shelf(), onFull: api.bookStage ? n => full(n) : null, onMenu: n => sheetMenu(n), onPage: n => { at = n; }, notify: (text, error) => ctx.notify(text, {error}), visible: () => ctx.visible?.('picbook') !== false && !ctx.doc.querySelector('.overlay .sheet'), escape: false});
  }
  async function full(n) {
    try { if (reader?.reading) reader.setReading(false); await api.bookStage(book.id, n); }
    catch (error) { ctx.notify(error.message, {error: true}); }
  }
  async function keep(n = at) { book = await api.saveBook(book, {preserveReaders: true}); await reader?.refresh(book, n); }

  // ---------- changes ----------
  async function sheetMenu(n) {
    at = n;
    // (What readers said comes from the chat while the book is open: the book as it is kept.)
    try { const fresh = await api.getBook(book.id); if (fresh && !job) book = fresh; } catch { /* as it is here */ }
    const sheet = sheetOf(book, n), s = sheet.spread, lack = missingPictures(book).length, bare = missingPictures(book, true).length - lack;
    const castPage = s?.layout === 'cast';
    const room = castPage ? s.cast.length : s ? SPREADS[s.layout].pictures : sheet.kind === 'cover' ? 1 : 0, has = picturesOf(book, n).length > 0;
    const key = await menu(ctx, sheet.kind === 'cover' ? '封面' : sheet.kind === 'end' ? '最后一页' : `第 ${n} 个跨页`, [
      sheet.kind === 'cover' && {key: 'title', icon: 'edit', label: '改书名'},
      sheet.kind === 'end' && {key: 'ending', icon: 'edit', label: '改最后一句'},
      s && !castPage && {key: 'words', icon: 'edit', label: '改字', note: '印在纸上、读出来的几句话，谁说的，小标题'},
      castPage && {key: 'people', icon: 'edit', label: '改人物', note: '每个人的一句介绍，去掉谁'},
      s && !castPage && {key: 'layout', icon: 'sliders', label: '排法', note: SPREADS[s.layout].label},
      s && !castPage && (room > 0 || s.layout === 'stage') && s.layout !== 'pair' && {key: 'flip', icon: 'sliders', label: s.layout === 'stage' ? '人物和字换一边' : SPREADS[s.layout].halves ? '图和字换一边' : '字换到另一边'},
      s && ['spread', 'fade'].includes(s.layout) && {key: 'space', icon: 'sliders', label: s.space === 'top' ? '字挪到画面下面' : '字挪到画面上面'},
      s && s.layout === 'spread' && {key: 'tone', icon: 'sliders', label: s.tone === 'dark' ? '字改成深色' : '字改成白色', note: s.tone === 'dark' ? '画面亮的时候' : '画面暗的时候'},
      room > 0 && {key: 'draw', icon: 'paint', label: castPage ? '画一个人的图' : has ? (s ? '重画这一面的图' : '重画封面') : (s ? '给这一面画图' : '画封面'), note: castPage ? '按角色 App 里的外貌' : '可以先改要画什么'},
      room > 0 && {key: 'pick', icon: 'image', label: '从相册换图'},
      room > 0 && has && {key: 'unpic', icon: 'trash', label: '去掉图'},
      s && !castPage && {key: 'weather', icon: 'star', label: '天气和声音', note: weatherNote(n)},
      has && sheet.kind !== 'end' && {key: 'puzzle', icon: 'grid', label: '把这一页拼回去', note: '3×3 拼图，拼好了翻页'},
      s && book.spreads.length < BOOK_LIMIT.spreads && {key: 'insert', icon: 'add', label: '在后面加一个跨页'},
      s && book.spreads.length > 1 && {key: 'remove', icon: 'trash', label: '删掉这个跨页'},
      lack ? {key: 'fill', icon: 'paint', label: `补画缺的图（${lack} 张）`, note: '按写好的画面画'} : bare > 0 && {key: 'fill-all', icon: 'paint', label: `给没图的地方都画图（${bare} 张）`, note: '按每一面的字写画面再画'},
      {key: 'theme', icon: 'star', label: '换风格', note: '现在是' + themeOf(book.theme).label},
      {key: 'art', icon: 'paint', label: '画风', note: book.art === 'book' ? '绘本画风（跟着风格画）' : '绘图 App 的画风'},
      {key: 'share', icon: 'share', label: '发给 TA', note: 'TA 读完会说说感想'},
      book.readers?.length ? {key: 'readers', icon: 'bubble', label: `读后感（${book.readers.length}）`, note: book.readers.at(-1).name + '：' + book.readers.at(-1).text.slice(0, 30)} : null,
      {key: 'export', icon: 'download', label: '导出', note: '网页绘本、PDF、EPUB、有声书、图片'},
      {key: 'delete', icon: 'trash', label: '删掉这本绘本', note: '画好的图还留在相册里', danger: true},
    ]);
    if (!key) return;
    try {
      if (key === 'title') await editTitle();
      else if (key === 'ending') await editEnding();
      else if (key === 'words') await editWords(n);
      else if (key === 'people') await editPeople(n);
      else if (key === 'puzzle') await puzzle(n);
      else if (key === 'share') await shareBook();
      else if (key === 'readers') readersSheet();
      else if (key === 'layout') await changeLayout(n);
      else if (key === 'flip') { s.side = s.side === 'left' ? 'right' : 'left'; await keep(n); }
      else if (key === 'space') { s.space = s.space === 'top' ? 'bottom' : 'top'; await keep(n); }
      else if (key === 'tone') { s.tone = s.tone === 'dark' ? 'light' : 'dark'; await keep(n); }
      else if (key === 'draw') { const k = await whichPicture(n, '画哪一张？'); if (k != null) await redraw(n, k); }
      else if (key === 'pick') { const k = await whichPicture(n, '换哪一张？'); if (k != null) { const blob = await pickBlob(); if (blob) { const ph = await api.addPhoto({name: `绘本-${safeTitle()}-${Date.now()}.${/png/.test(blob.type) ? 'png' : 'jpg'}`, blob}); slotOf(n, k).picture = {id: ph.id}; await keep(n); } } }
      else if (key === 'unpic') { const k = await whichPicture(n, '去掉哪一张？'); if (k != null) { slotOf(n, k).picture = null; await keep(n); } }
      else if (key === 'weather') await editWeather(n);
      else if (key === 'insert') await insertAfter(n);
      else if (key === 'remove' && await ctx.confirm(`删掉第 ${n} 个跨页？`, '这一面的字和排法就没了；画好的图还留在相册里。')) { book.spreads.splice(n - 1, 1); await keep(Math.min(n, book.spreads.length)); }
      else if (key === 'fill' || key === 'fill-all') await drawWithNote(key === 'fill-all');
      else if (key === 'theme') { const id = await menu(ctx, '换风格', THEME_IDS.map(k => ({key: k, icon: k === book.theme ? 'check' : 'star', label: BOOK_THEMES[k].label, note: BOOK_THEMES[k].art.split(',').slice(1, 4).join(',')}))); if (id) { book.theme = id; await keep(n); ctx.notify('换好了；之后画的图用新风格的画法'); } }
      else if (key === 'art') { const a = await menu(ctx, '画风', ARTS.map(([k, label]) => ({key: k, icon: k === book.art ? 'check' : 'paint', label, note: k === 'book' ? themeOf(book.theme).art.split(',').slice(1, 4).join(',') : '绘图 App 里选的画风'}))); if (a) { book.art = a; await keep(n); ctx.notify('之后画的图用这个画风'); } }
      else if (key === 'export') await exportMenu();
      else if (key === 'delete' && await ctx.confirm(`删掉《${book.title}》？`, '书删了就没了；画好的图还留在相册里。')) { await api.deleteBook(book.id); ctx.notify('删掉了'); await shelf(); }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  }
  /** Which picture of sheet n (asked on a spread of two moments: the left one or the right one; on the people page: whose). */
  async function whichPicture(n, title) {
    const s = sheetOf(book, n).spread;
    if (s?.layout === 'cast') {
      if (s.cast.length === 1) return 0;
      const k = await menu(ctx, title, s.cast.map((c, k) => ({key: String(k), icon: 'image', label: c.name, note: c.picture ? '已有图' : '还没有图'})));
      return k == null ? null : Number(k);
    }
    if (!s || SPREADS[s.layout].pictures <= 1) return 0;
    const k = await menu(ctx, title, [0, 1].map(k => ({key: String(k), icon: 'image', label: k ? '右边那张' : '左边那张', note: s.pictures[k]?.picture ? (s.pictures[k].prompt || '已有图').slice(0, 40) : '还没有图'})));
    return k == null ? null : Number(k);
  }
  async function drawWithNote(all = false) { const targetId = book.id, me = {stop: false}; ctx.notify('开始画，画好一张放一张'); const n = await drawMissing(job = me, {all}); if (job === me) job = null; if (book?.id === targetId) await reader?.refresh(book); if (n) ctx.notify(`画好了 ${n} 张`); }
  function pickBlob() {
    return new Promise(resolve => import('./draw-images.js').then(m => m.pickPicture(ctx, api, '给这一面选一张图')).then(resolve, () => resolve(null)));
  }
  function dialogDone(d, save) {
    return new Promise(resolve => {
      d.onClose(() => resolve());
      d.body.addEventListener('click', async e => {
        if (!e.target.closest('[data-bk-save]')) return;
        try { await save(); d.close(); } catch (error) { ctx.notify(error.message, {error: true}); }
      });
    });
  }
  function editTitle() {
    const target = book;
    const d = ctx.dialog('改书名', `<div class="field"><span>书名</span><input data-bk-edit="title" value="${esc(book.title)}" maxlength="40"></div><div class="field"><span>副标题</span><input data-bk-edit="subtitle" value="${esc(book.subtitle)}" maxlength="60"></div><div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    return dialogDone(d, async () => { const saved = await api.saveBook({...target, title: d.body.querySelector('[data-bk-edit=title]').value.trim() || target.title, subtitle: d.body.querySelector('[data-bk-edit=subtitle]').value.trim()}, {fields: ['title', 'subtitle']}); if (book?.id === target.id) { book = saved; await reader?.refresh(book, at); } });
  }
  function editEnding() {
    const d = ctx.dialog('改最后一句', `<div class="field"><span>最后一页的一句话（可以不写）</span><textarea data-bk-edit="ending" rows="3" maxlength="80">${esc(book.ending)}</textarea></div><div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    return dialogDone(d, async () => { book.ending = d.body.querySelector('[data-bk-edit=ending]').value.trim(); await keep(); });
  }
  /** 出场人物: each person's line, and who is left out (their picture stays in 相册). */
  function editPeople(n) {
    const s = book.spreads[n - 1];
    const row = (c, i) => `<div class="bk-row" data-bk-row data-i="${i}"><b class="bk-row-name">${esc(c.name)}</b><button type="button" class="icon-button" data-bk-del aria-label="去掉 ${esc(c.name)}">${icon('close')}</button><input data-k="line" value="${esc(c.line)}" maxlength="${BOOK_LIMIT.line}" placeholder="一句介绍（可以不写）" aria-label="${esc(c.name)}的介绍"></div>`;
    const d = ctx.dialog('改人物', `<div class="field"><span>小标题</span><input data-bk-head value="${esc(s.heading)}" maxlength="${BOOK_LIMIT.heading}" placeholder="这本书里的人"></div>
      <div data-bk-rows>${s.cast.map(row).join('')}</div>
      <div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    d.body.addEventListener('click', e => { const del = e.target.closest('[data-bk-del]'); if (del) del.closest('[data-bk-row]').remove(); });
    return dialogDone(d, async () => {
      const people = [...d.body.querySelectorAll('[data-bk-row]')].map(r => ({...s.cast[Number(r.dataset.i)], line: r.querySelector('[data-k=line]').value.trim()}));
      if (!people.length) { book.spreads.splice(n - 1, 1); await keep(Math.min(n, book.spreads.length)); return; }
      book.spreads[n - 1] = normalizeSpread({...s, heading: d.body.querySelector('[data-bk-head]').value.trim(), cast: people});
      await keep(n);
    });
  }
  /** 把这一页拼回去 (0.9.40): the sheet's picture as a 3×3 puzzle; put together, the page turns. */
  async function puzzle(n) {
    const url = await picUrl(picturesOf(book, n)[0]);
    if (!url) { ctx.notify('这一页还没有图'); return; }
    const last = sheetCount(book) - 1;
    openPuzzle(ctx, {url, title: n ? `第 ${n} 个跨页` : '封面', onDone: () => { if (n < last) reader?.go(n + 1); }});
  }
  /** 发给 TA (0.9.40): the book as a card in a chat (its words go with it); the reader answers with what they thought. */
  async function shareBook() {
    const to = await shareToChat(ctx, {title: `把《${book.title}》发给…`, what: '这本绘本', message: {kind: 'book', book: {id: book.id, title: book.title, subtitle: book.subtitle, theme: book.theme, spreads: book.spreads.length, coverId: book.cover.picture?.id || '', text: bookText(book)}}});
    if (to) api.chatReply?.(to.id)?.catch?.(() => {});
  }
  function readersSheet() {
    const when = at => { const d = Math.max(0, Date.now() - at); return d < 36e5 ? `${Math.max(1, Math.round(d / 6e4))} 分钟前` : d < 864e5 ? `${Math.round(d / 36e5)} 小时前` : `${Math.round(d / 864e5)} 天前`; };
    ctx.dialog('读后感', `<div class="group">${[...book.readers].reverse().map(r => `<div class="list-row static bk-reader"><span><strong>${esc(r.name)}</strong><small>${esc(when(r.at))}</small><p>${esc(r.text)}</p></span></div>`).join('')}</div>`);
  }
  /** What a spread's weather and sound are now, in words (the menu's note). */
  function weatherNote(n) {
    const s = book.spreads[n - 1], fx = directionOf(book, n).fx;
    return [fx.length ? fx.map(k => WEATHER[k]).join('、') + (s.fx.length ? '' : '（按字）') : '没有天气', s.sound.ambience && '环境声 ' + s.sound.ambience, s.sound.sfx && '音效 ' + s.sound.sfx].filter(Boolean).join(' · ');
  }
  /** The weather drawn over a spread (none chosen: what its words name) and its ambience and sound. */
  async function editWeather(n) {
    const s = book.spreads[n - 1], names = await api.bookSounds?.().catch(() => null) || null;
    const list = (id, items) => items?.length ? `<datalist id="${id}">${items.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
    const d = ctx.dialog('天气和声音', `<p class="hint">不选就按这一面的字来：写到下雨就下雨，写到雪就下雪。现在是：${esc(weatherNote(n))}。</p>
      <div class="field"><span>天气（最多两个）</span><div class="bk-chips" data-bk-chips>${Object.entries(WEATHER).map(([id, label]) => `<button type="button" data-bk-chip="${id}" aria-pressed="${s.fx.includes(id)}">${esc(label)}</button>`).join('')}</div></div>
      ${api.bookSound ? `<div class="field"><span>环境声${help('音效库里的名字（音效 App 打开时才会响）。一直响到下一个环境声；写「停」就停下。')}</span><input data-bk-amb value="${esc(s.sound.ambience)}" maxlength="40" list="bk-amb-list" placeholder="比如 雨声">${list('bk-amb-list', names?.ambience)}</div>
      <div class="field"><span>翻到这一面时的音效</span><input data-bk-sfx value="${esc(s.sound.sfx)}" maxlength="40" list="bk-sfx-list" placeholder="比如 开门">${list('bk-sfx-list', names?.sfx)}</div>` : ''}
      <div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-bk-chip]');
      if (!b) return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      if (on && d.body.querySelectorAll('[data-bk-chip][aria-pressed=true]').length >= BOOK_LIMIT.fx) { ctx.notify('天气最多两个'); return; }
      b.setAttribute('aria-pressed', String(on));
    });
    return dialogDone(d, async () => {
      s.fx = [...d.body.querySelectorAll('[data-bk-chip][aria-pressed=true]')].map(b => b.dataset.bkChip);
      s.sound = {ambience: d.body.querySelector('[data-bk-amb]')?.value.trim() ?? s.sound.ambience, sfx: d.body.querySelector('[data-bk-sfx]')?.value.trim() ?? s.sound.sfx};
      await keep(n);
    });
  }
  /**
   * A spread's words: each line who says it (旁白, or one of the book's people), whether it is in a speech bubble (one
   * a spread), and the spread's heading. What is printed is what is read.
   */
  function editWords(n) {
    const s = book.spreads[n - 1], names = [...new Set([...castOf(book), ...Object.keys((cast || loadCast()).entries)])];
    const row = (w = {role: '', text: '', bubble: false}, i = -1) => `<div class="bk-row" data-bk-row data-i="${i}"><select data-k="role" aria-label="谁说的"><option value="">旁白</option>${names.map(x => `<option${x === w.role ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select><label class="bk-bub"><input type="checkbox" data-k="bubble"${w.bubble ? ' checked' : ''}> 气泡</label><button type="button" class="icon-button" data-bk-del aria-label="删掉这句">${icon('close')}</button><textarea data-k="text" rows="2" maxlength="${BOOK_LIMIT.word}" placeholder="这一句" aria-label="字">${esc(w.text)}</textarea></div>`;
    const d = ctx.dialog('改字', `<div class="field"><span>小标题（可以不写）</span><input data-bk-head value="${esc(s.heading)}" maxlength="${BOOK_LIMIT.heading}" placeholder="比如 初雪"></div>
      <div class="field"><span>这一面的字${help('印在纸上的就是读出来的。一面一到三句最像绘本，讲故事用旁白；角色说的话用他们的声音读。「气泡」一面最多一句：画面铺满两页、渐隐、只画前景的排法会把它放进对话气泡，人物出场时气泡在人物头上，别的排法写成引号。')}</span><div class="bk-rows" data-bk-rows>${s.words.map((w, i) => row(w, i)).join('')}</div><button type="button" class="secondary" data-bk-add>${icon('add')}加一句</button></div>
      <div class="actions"><button type="button" class="primary" data-bk-save>存好</button></div>`);
    d.body.addEventListener('click', e => {
      if (e.target.closest('[data-bk-add]')) { d.body.querySelector('[data-bk-rows]').insertAdjacentHTML('beforeend', row()); d.body.querySelector('[data-bk-row]:last-child [data-k=text]')?.focus(); }
      const del = e.target.closest('[data-bk-del]');
      if (del) del.closest('[data-bk-row]').remove();
    });
    d.body.addEventListener('change', e => {
      // One bubble a spread: ticking one unticks the others.
      if (e.target.dataset?.k !== 'bubble' || !e.target.checked) return;
      d.body.querySelectorAll('[data-k=bubble]').forEach(b => { if (b !== e.target) b.checked = false; });
    });
    return dialogDone(d, async () => {
      const words = [...d.body.querySelectorAll('[data-bk-row]')].map(r => {
        const was = s.words[Number(r.dataset.i)], role = r.querySelector('[data-k=role]').value, text = r.querySelector('[data-k=text]').value.trim();
        // A line kept as it was keeps where it came from (its voice already made) and how it is said.
        return {role, text, emotion: was && was.role === role ? was.emotion : '', bubble: !!role && r.querySelector('[data-k=bubble]').checked, at: was?.at || (s.side === 'left' ? 'right' : 'left'), ...(was?.from && was.text === text && was.role === role ? {from: was.from} : {})};
      }).filter(w => w.text);
      book.spreads[n - 1] = normalizeSpread({...s, words, heading: d.body.querySelector('[data-bk-head]').value.trim()});
      await keep(n);
    });
  }
  /** A new spread after spread n: words only, written now (nothing written: not added). */
  async function insertAfter(n) {
    const s = book.spreads[n - 1];
    book.spreads.splice(n, 0, normalizeSpread({layout: 'text', side: s.side === 'left' ? 'right' : 'left'}));
    await keep(n + 1);
    await editWords(n + 1);
    if (!book.spreads[n]?.words.length) { book.spreads.splice(n, 1); await keep(n); }
    else ctx.notify('加好了；要配图就点「⋯ → 排法」选一种有图的，再画');
  }
  async function changeLayout(n) {
    const s = book.spreads[n - 1];
    const l = await menu(ctx, '排法', SPREAD_IDS.filter(id => id !== 'cast').map(id => ({key: id, icon: id === s.layout ? 'check' : 'sliders', label: SPREADS[id].label, note: SPREADS[id].note})));
    if (!l || l === s.layout) return;
    const want = SPREADS[l].pictures, base = s.pictures[0]?.prompt || '', pictures = [...s.pictures];
    while (pictures.length < want) pictures.push({prompt: base ? base + ', close-up' : '', picture: null, people: true});
    let castOn = s.cast;
    if (l === 'stage' && !castOn.length) {
      const who = [...new Set(s.words.map(w => w.role).filter(x => x && sprite(x)))].slice(0, 2);
      if (!who.length) throw Error('这一面说话的人还没有立绘（在视觉小说里给角色做立绘），用不了「人物出场」');
      castOn = who.map(name => ({name, emotion: s.words.find(w => w.role === name)?.emotion || ''}));
    }
    const reshaped = want && pictures[0]?.picture && SPREADS[s.layout].pictures && SPREADS[l].shape !== SPREADS[s.layout].shape;
    book.spreads[n - 1] = normalizeSpread({...s, layout: l, pictures, cast: castOn});
    await keep(n);
    if (missingPictures(book).some(m => m.sheet === n)) ctx.notify('这个排法多了要画的图，点「给这一面画图」或「补画缺的图」画上');
    else if (reshaped) ctx.notify(`这个排法要${SHAPES[SPREADS[l].shape]}，原来的图会被裁掉一些，可以点「重画这一面的图」`);
  }
  function redraw(n, k) {
    const owner = book, s = slotOf(n, k, owner), spread = sheetOf(owner, n).spread;
    const d = ctx.dialog(n ? '画这一张' : '画封面', `<div class="field"><span>画什么（英文标签，空着就按${n ? '这一面的字' : '书名'}写）</span><textarea data-bk-prompt rows="4">${esc(s.prompt)}</textarea></div>
      <label class="bk-check"><input type="checkbox" data-bk-people${s.people !== false ? ' checked' : ''}> 画面里画人物</label>
      ${castOf(book).length ? `<div class="field"><span>画面里有谁${help('选中的人按角色 App 里的外貌（和参考图）画；没选的人不带外貌。')}</span><div class="bk-people-row">${castOf(book).map(x => `<button type="button" class="chip" data-bk-who="${esc(x)}" aria-pressed="${(s.who || []).includes(x)}">${esc(x)}</button>`).join('')}</div></div>` : ''}
      <p class="hint">${book.art === 'book' ? `用「${esc(themeOf(book.theme).label)}」的绘本画风` : '用绘图 App 的画风'}，画成${SHAPES[shapeOf(spread)]}，加上出场人物的外貌，用绘图 App 现在的引擎。</p><div class="actions"><button type="button" class="primary" data-bk-go>${icon('paint')}画</button></div>`);
    return new Promise(resolve => {
      d.onClose(() => resolve());
      d.body.addEventListener('click', async e => {
        const chip = e.target.closest('[data-bk-who]');
        if (chip) { chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')); return; }
        const b = e.target.closest('[data-bk-go]');
        if (!b) return;
        b.disabled = true; b.textContent = '正在画…';
        try {
          slotOf(n, k, owner).people = d.body.querySelector('[data-bk-people]').checked;
          slotOf(n, k, owner).who = [...d.body.querySelectorAll('[data-bk-who][aria-pressed=true]')].map(x => x.dataset.bkWho).slice(0, BOOK_LIMIT.who);
          await drawShot(n, k, {owner, prompt: d.body.querySelector('[data-bk-prompt]').value.trim()});
          d.close(); if (book?.id === owner.id) await reader?.refresh(book);
        } catch (error) { b.disabled = false; b.textContent = '再试一次'; ctx.notify(error.message, {error: true}); }
      });
    });
  }

  // ---------- exports ----------
  const safe = s => String(s || '绘本').replace(/[\\/:*?"<>|]/g, ' ').trim() || '绘本';
  const dataUrl = blob => new Promise(resolve => { const r = new ctx.win.FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(''); r.readAsDataURL(blob); });
  /** A picture made smaller for a file: a JPEG (a PNG when it is see-through: a 立绘), as a data: URL. */
  async function squeeze(src, alpha = false, max = alpha ? 900 : 1600) {
    try {
      const r = await ctx.win.fetch(src), blob = await r.blob(), bmp = await ctx.win.createImageBitmap(blob);
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = ctx.doc.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
      return await dataUrl(await new Promise(res => c.toBlob(res, alpha ? 'image/png' : 'image/jpeg', .88)));
    } catch { return ''; }
  }
  /** Sheet n whole (a spread both its pages), pictures at their addresses here. */
  async function sheetHtml(n) {
    const urls = new Map();
    for (const p of picturesOf(book, n)) urls.set(keyOf(p), await picUrl(p));
    return viewMarkup(book, {sheet: n, part: 'all'}, {url: p => urls.get(keyOf(p)) || '', sprite});
  }
  async function bitmaps(n) {
    const out = [];
    for (const p of picturesOf(book, n)) { const b = await picBlob(p); try { out.push(b ? await ctx.win.createImageBitmap(b) : null); } catch { out.push(null); } }
    return out;
  }
  async function sheetSound(n, rate = 22050) {
    const blobs = (await api.bookAudio(readOf(book, n))).filter(Boolean);
    if (!blobs.length) return null;
    const clips = [];
    for (const b of blobs) clips.push(await decodeMono(ctx.win, b, rate));
    return encodeWav(joinClips(clips, rate, .35), rate);
  }
  async function exportMenu() {
    const kind = await menu(ctx, '导出《' + book.title + '》', [
      {key: 'html-voice', icon: 'play', label: '网页绘本（带朗读）', note: '一个 .html 文件，手机电脑都能打开，翻页、自动朗读；没生成过的台词会现在生成'},
      {key: 'html', icon: 'book', label: '网页绘本（不带声音）', note: '文件小一些'},
      {key: 'pdf', icon: 'download', label: 'PDF', note: '封面、每个跨页（两页并排）、最后一页，和书里一样，适合打印和发给别人'},
      {key: 'epub', icon: 'file', label: 'EPUB 电子书', note: '固定版式的绘本，在阅读软件里一面一面翻'},
      {key: 'audio', icon: 'volume', label: '有声书（一个声音文件）', note: '整本书读出来，WAV'},
      {key: 'images', icon: 'image', label: '每一面的图片', note: '打包成 .zip'},
    ]);
    if (!kind) return;
    const narr = api.bookNarration?.() || {kept: false};
    if ((kind === 'html-voice' || kind === 'audio') && !narr.kept && !await ctx.confirm('旁白不会在文件里出声', '旁白现在用的是浏览器的系统朗读，存不进文件，导出的声音里只有角色的台词。想让旁白也有声音：在角色 App 里给「旁白」选音色，再在设置 → 整篇朗读里选「旁白角色」。先这样导出吗？')) return;
    if (reader?.reading) reader.setReading(false);
    const name = safe(book.title), n = sheetCount(book);
    let blob, file;
    if (kind === 'pdf' || kind === 'images' || kind === 'epub') {
      const cache = new Map();
      const inline = async (src, img) => { const alpha = !!img?.closest('.bk-actor'), k = (alpha ? 'a:' : 'j:') + src; if (!cache.has(k)) cache.set(k, await squeeze(src, alpha)); return cache.get(k); };
      const pages = [];
      for (let i = 0; i < n; i++) {
        ctx.notify(`正在排版：第 ${i + 1} / ${n} 面`);
        const wide = sheetOf(book, i).kind === 'spread', width = wide ? 2400 : 1200, height = 1600;
        const jpeg = await pageJpeg(ctx.doc, await sheetHtml(i), {width, height, inline, fallback: async (g, W, H) => { const b = await bitmaps(i); drawSimple(g, book, i, b, {W, H}); b.forEach(x => x?.close?.()); }});
        pages.push({jpeg, width, height, wide});
      }
      if (kind === 'pdf') { blob = pdfFromJpegs(pages.map(p => ({jpeg: p.jpeg, width: p.wide ? 840 : 420})), {title: book.title, author: book.author}); file = name + '.pdf'; }
      else if (kind === 'images') { blob = await zipFiles(pages.map((p, i) => ({name: `${String(i + 1).padStart(2, '0')}.jpg`, blob: new Blob([p.jpeg], {type: 'image/jpeg'})}))); file = name + ' 图片'; }
      else {
        const label = i => { const s = sheetOf(book, i); return s.kind === 'cover' ? book.title : s.spread?.heading || ''; };
        blob = epubOf(book, pages.map((p, i) => ({jpeg: p.jpeg, width: p.width, height: p.height, text: readOf(book, i).map(l => l.text).join(' '), label: label(i)}))); file = name + '.epub';
      }
    } else if (kind === 'audio') {
      const all = [];
      for (let i = 0; i < n; i++) { ctx.notify(`正在准备声音：第 ${i + 1} / ${n} 面`); const b = await sheetSound(i, 24000); if (b) all.push(await decodeMono(ctx.win, b, 24000)); }
      if (!all.length) throw Error('这本书还没有能读出声音的部分');
      blob = encodeWav(joinClips(all, 24000, 1.1), 24000); file = name + ' 有声书';
    } else {
      // Each picture once, as bk:N in the pages.
      const images = [], index = new Map(), tokens = new Map(), people = new Map();
      const slot = async (src, alpha) => { if (!src) return ''; const d = await squeeze(src, alpha); if (!d) return ''; if (!index.has(d)) { index.set(d, images.length); images.push(d); } return 'bk:' + index.get(d); };
      const sounds = [];
      for (let i = 0; i < n; i++) {
        ctx.notify(`正在准备：第 ${i + 1} / ${n} 面`);
        for (const p of picturesOf(book, i)) if (!tokens.has(keyOf(p))) tokens.set(keyOf(p), await slot(await picUrl(p), false));
        for (const c of sheetOf(book, i).spread?.cast || []) if (!people.has(c.name + '|' + c.emotion)) people.set(c.name + '|' + c.emotion, await slot(sprite(c.name, c.emotion), true));
        if (kind === 'html-voice') { const b = await sheetSound(i); sounds.push(b ? await dataUrl(b) : ''); }
      }
      // The weather drawn over the pages comes with the file (vn-fx.js inside it).
      let fx = '';
      try { const r = await ctx.win.fetch(new URL('../vn-fx.js', import.meta.url)); if (r.ok) fx = await r.text(); } catch {}
      blob = new Blob([bookHtml(book, {url: p => tokens.get(keyOf(p)) || '', sprite: (who, how) => people.get(who + '|' + how) || '', images, sounds, fx})], {type: 'text/html'}); file = name + '.html';
    }
    ctx.notify('已下载 ' + await saveFile(ctx.doc, blob, file));
  }

  // ---------- events ----------
  v.on('click', '[data-action=bk-bedtime]', () => { leaveReader(); view = 'bedtime'; return bedtime.open(); });
  v.on('click', '[data-action=bk-new]', () => { newForm(infoOf()); make(); });
  v.makeFromTheater = async id => {
    if (job) { ctx.notify('请先等当前绘本制作结束'); return; }
    theaters = await api.theaters();
    const piece = theaters.find(row => row.id === id);
    if (!piece) { ctx.notify('这段小剧场已经不在了', {error:true}); return; }
    newForm(infoOf(), id);
    form.title = piece.title;
    make();
  };
  v.on('click', '[data-action=bk-range]', () => pickRange(true));
  v.on('click', '[data-action=bk-before]', () => pickRange(false));
  v.on('click', '[data-action=bk-before-clear]', () => { form.before = null; make(); });
  v.on('click', '[data-action=bk-roles]', chooseRoles);
  v.on('click', '[data-action=bk-world]', () => lore.open());
  v.on('click', '[data-action=bk-preview-draft]', el => open(book.id, Number(el.dataset.sheet) || 0));
  v.on('click', '[data-action=bk-draw-draft]', drawDraft);
  v.on('click', '[data-action=bk-shelf]', () => shelf());
  v.on('click', '[data-action=bk-start]', () => start());
  v.on('click', '[data-action=bk-stop]', () => { if (job) job.stop = true; ctx.notify('画完这一张就停'); });
  v.on('click', '[data-book]', el => { at = 0; open(el.dataset.book); });
  v.on('click', '[data-bk-person]', el => ctx.openPendingRole?.(el.dataset.bkPerson));
  v.openBook = id => { at = 0; return open(id); };
  v.on('click', '[data-bk-set]', async el => {
    const key = el.dataset.bkSet, value = el.dataset.value;
    if (key === 'kind' && value === 'theater') theaters = await api.theaters();
    if (key === 'kind' && !form.title.trim() && value === 'theater') form.title = theaters.find(row => row.id === form.theater)?.title || '';
    form[key] = value;
    make();
  });
  v.on('click', '[data-bk-theme]', el => { form.theme = el.dataset.bkTheme; make(); });
  v.on('change', '[data-bk-ref]', el => {
    form[el.dataset.bkRef] = el.checked;
    make();
    if (form.world) lore.summary();
  });
  v.on('change', '[data-field=bk-theater]', el => {
    const previous = theaters.find(row => row.id === form.theater)?.title;
    form.theater = el.value;
    if (!form.title.trim() || form.title === previous) form.title = theaters.find(row => row.id === form.theater)?.title || '';
    make();
  });
  v.root.addEventListener('input', e => {
    const field = e.target.dataset?.bkField;
    if (form && ['title','text'].includes(field)) form[field] = e.target.value;
  });
  v.root.addEventListener('error', e => { if (e.target?.tagName === 'IMG' && e.target.closest('.bk')) e.target.classList.add('bk-broken'); }, true);
  v.back = () => { if (view === 'bedtime' && bedtime.back()) return true; if (view === 'shelf') return false; if (view === 'making') { if (job) job.stop = true; return true; } shelf(); return true; };
  v.leave = () => { bedtime.leave(); if (reader?.reading) reader.setReading(false); };
  v.refresh = () => { if (view === 'shelf') shelf(); else if (view === 'bedtime') bedtime.open(); };
  const dispose = v.dispose;
  v.dispose = () => { bedtime.dispose(); leaveReader(); if (job) job.stop = true; for (const u of photoUrls.values()) ctx.win.URL.revokeObjectURL(u); dispose(); };
  shelf();
  return v;
}
