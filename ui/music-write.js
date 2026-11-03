// 写歌 in 音乐 App: the songs written (a tab of the app), a form for the text model (or nothing, to write the words oneself), and a song's
// page: its words and style, a service to sing it, the versions made, and all of it to take to Suno's site by hand.
import {esc, btn, field, input, textArea, select, toggle, heading, groupTitle, empty, help, copyText} from './common.js';
import {describeSongWorkflow} from '../core/song-comfy.js';
import {icon} from './icons.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {SONG_LANGUAGES, SONG_GENRES, SONG_WORDINGS, SONG_VOICES, SONG_LENGTHS, SONG_LIMITS, SONG_SECONDS, songLength, normalizeSongForm} from '../core/song.js';

const AUDIO_FILES = 'audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus,.aac';
const SUNO = 'https://suno.com/create';
const CHOICES = {language: SONG_LANGUAGES, genre: SONG_GENRES, wording: SONG_WORDINGS, voice: SONG_VOICES};
/** Language is one choice; the others can be several. */
const parts = value => String(value ?? '').split(/[、,，]/).map(s => s.trim()).filter(Boolean);
const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function writePanel(ctx, {v, go}) {
  const {api} = ctx;
  let drafts = [], form = null, draft = null, options = [], songs = [], swipe = null, working = '', engine = '', undo = null, shownState = '';
  // How far ComfyUI said it was ([draft id, done, of]), kept over a redraw; 唱出来 pressed and the service not asked yet.
  let stepOf = null, starting = false;
  const stateOf = d => JSON.stringify([d?.state || '', d?.note || '', d?.songs || []]);

  // ---------- The songs written ----------
  async function load() { drafts = await api.listSongDrafts().catch(() => []); }
  const noteOf = d => d.state === 'singing' ? '正在唱……' : d.note ? '没做成' : d.songs.length ? (d.songs.length > 1 ? `做好了 ${d.songs.length} 版` : '做好了') : '还没唱';
  const draftRow = d => swipeRow(d.id, `<div class="list-row"><span><strong>${esc(d.title || '没有名字的歌')}</strong><small>${esc([d.who, noteOf(d)].filter(Boolean).join(' · '))}</small></span>${icon('next')}</div>`,
    [{key: 'delete', label: '删除', icon: 'trash', danger: true}], {label: d.title});
  function listHTML() {
    return `<div class="actions music-tools" style="margin-top:0">${btn('write-new', icon('edit') + '写一首', 'primary')}</div>`
      + (drafts.length ? `<div class="group" data-draft-list>${drafts.map(draftRow).join('')}</div>`
        : empty('还没有写过歌', '告诉模型想写什么，它会写好歌词和风格；再选一家唱出来，或者拿去 Suno 做。', 'music'));
  }
  function dropList() { swipe?.dispose(); swipe = null; }
  function mountList() {
    dropList();
    const box = v.root.querySelector('[data-draft-list]');
    if (!box) return;
    swipe = mountSwipeList(box, {ctx, hint: '点一下打开；左滑：删除；右滑：多选', mouseHint: '点一下打开；右键或 ⋯：删除；按住 Ctrl 点：多选',
      onTap: id => open(id).catch(error => ctx.notify(error.message, {error: true})),
      onAction: (key, id) => remove([id]).catch(error => ctx.notify(error.message, {error: true})),
      bulk: [{key: 'delete', label: '删除', icon: 'trash', danger: true}], onBulk: (key, ids) => remove(ids)});
  }
  async function remove(ids) {
    if (!await ctx.confirm(ids.length > 1 ? `删除这 ${ids.length} 首？` : '删除这首？', '只删歌词和风格，做好的歌还留在歌单里。')) return;
    await api.deleteSongDrafts(ids);
    go('main');
  }

  // ---------- The form ----------
  function newForm() {
    form = {...normalizeSongForm(api.getState().music.writing), about: '', who: '', instrumental: false};
    working = '';
    go('write-form', true);
  }
  const chipField = (key, label, placeholder, info = '') => field(label,
    `${input('write-' + key, form[key], 'text', `maxlength="${SONG_LIMITS.field}" placeholder="${esc(placeholder)}" autocomplete="off"`)}<div class="write-chips" role="group" aria-label="${esc(label)}">${CHOICES[key].map(o => `<button type="button" class="combo-chip" data-action="write-chip" data-key="${key}" data-value="${esc(o)}" aria-pressed="${parts(form[key]).includes(o)}">${esc(o)}</button>`).join('')}</div>`, info);
  function renderForm() {
    const names = (api.chatContacts?.() || []).map(c => c.name), busy = working === 'write';
    v.draw(heading('写一首', '', 'Write a song')
      + `<div class="group pad">${field('写什么', textArea('write-about', form.about, `rows="3" maxlength="${SONG_LIMITS.about}" placeholder="比如：下雨那天我们在书店躲雨，写给她的。不填就让模型自己想"`))}
        ${names.length ? field('谁的歌', select('write-who', form.who, [['', '不指定'], ...names.map(n => [n, n])]), '选了人，模型会按 TA 的人设和经历来写，像 TA 自己写的歌。') : ''}
        ${toggle('write-story', '参考最近的剧情', form.story, '让模型读最近的正文、世界书和记忆，从里面取细节。不想和剧情有关就关掉。')}</div>`
      + groupTitle('怎么写', help('这些都可以不填，模型会自己定。点下面的词就填进框里，也可以直接打字，写什么都行。'))
      + `<div class="group pad">${chipField('language', '语言', '比如：中文，也可以写 上海话、中英混合')}
        ${form.instrumental ? '' : chipField('wording', '歌词风格', '比如：直白口语，像发消息')}
        ${chipField('genre', '曲风', '比如：民谣，吉他弹唱，慢一点')}
        ${form.instrumental ? '' : chipField('voice', '人声', '比如：女声，有点沙哑')}
        <div class="field"><span>长度</span><div class="segmented" style="margin:0" role="group" aria-label="长度">${Object.entries(SONG_LENGTHS).map(([k, l]) => `<button type="button" data-action="write-length" data-length="${k}" aria-pressed="${form.length === k}">${l.name}</button>`).join('')}</div></div>
        ${toggle('write-instrumental', '纯音乐（不要歌词）', form.instrumental)}</div>`
      + `<div class="actions">${btn('write-go', icon('star') + (busy ? '正在写……' : '让 AI 写'), 'primary', busy ? 'disabled' : '')}${btn('write-self', '自己写', 'secondary', busy ? 'disabled' : '')}</div>`
      + `<p class="hint">让 AI 写会调用一次文字模型。写好以后可以改，改好了再唱。</p>`);
  }
  const formOut = () => ({about: form.about, who: form.who, story: form.story, instrumental: form.instrumental, language: form.language, genre: form.genre, wording: form.wording, voice: form.voice, length: form.length});

  // ---------- A song ----------
  async function open(id) {
    const row = await api.getSongDraft(id);
    if (!row) throw Error('这首歌的草稿已经删掉了');
    draft = row; working = ''; undo = null; shownState = stateOf(row); starting = false;
    await readAround();
    go('draft', true);
  }
  /** Who can sing it and the songs it became. */
  async function readAround() {
    songs = await api.listSongs().catch(() => []);
    // Gone while that was read.
    if (v.disposed || !draft) return;
    options = api.singOptions(draft);
    // One that can sing now is picked; with none, the one used last (or the first) shows where its key goes.
    const last = api.getState().music.sing.engine, usable = options.filter(o => o.ready || o.id === 'comfy' && last === 'comfy');
    if (!usable.some(o => o.id === engine)) engine = (usable.find(o => o.id === last) || usable[0] || options.find(o => o.id === (engine || last)) || options[0])?.id || '';
  }
  const priceOf = id => options.find(o => o.id === id)?.price;
  /** One's own ComfyUI needs no key: it is set up on the way. */
  const canSing = () => engine === 'comfy' || !!options.find(o => o.id === engine)?.ready;
  function singBlock() {
    if (draft.state === 'singing') return `<p class="write-singing" role="status">${icon('music')}<span>${singingText()}</span></p><div class="actions" style="margin:6px 0 0">${btn('write-cancel', '不等了', 'secondary small')}</div>`;
    const note = draft.note ? `<p class="hint error-copy" role="alert">${esc(draft.note)}</p>` : '';
    // Every service is in the list, so none seems gone: one without its key says so, and leads to its card.
    return `${note}${field('用哪家唱', select('draft-engine', engine, options.map(o => [o.id, o.ready || o.id === 'comfy' ? o.name : o.name + ' · 没填密钥'])))}<p class="hint" data-sing-price>${esc(priceOf(engine)?.text || '')}</p>
      <div data-sing-extra>${singExtra()}</div>`;
  }
  /** What goes with the one chosen: how long, ComfyUI's settings, and singing, or where to fill in its key. */
  const singExtra = () => lengthRow() + comfyRow() + `<div class="actions" style="margin:6px 0 0">${canSing() ? btn('write-sing', icon('play', true) + (draft.songs.length ? '再唱一版' : '唱出来'), 'primary', working ? 'disabled' : '') : btn('write-engines', icon('next') + '去填密钥', 'secondary')}</div>`;
  const autoLength = () => `${!draft.instrumental && draft.lyrics.trim() ? '按歌词' : '自动'}，约 ${clock(songLength({...draft, seconds: 0}))}`;
  /** How long it is asked to be, where the service takes a length: as long as the words take, or a length chosen. */
  const lengthRow = () => {
    if (!options.find(o => o.id === engine)?.timed) return '';
    const now = draft.seconds || 0, steps = now && !SONG_SECONDS.includes(now) ? [...SONG_SECONDS, now].sort((a, b) => a - b) : SONG_SECONDS;
    return field('时长', select('draft-seconds', now, [[0, autoLength()], ...steps.map(s => [s, clock(s)])]),
      '按歌词：估一下唱完这些词要多久，留出前奏、间奏和结尾。\n\n比歌词短的话，后面的词唱不到。用自己的 ComfyUI 工作流时，工作流里的时长也按这里的改。');
  };
  const comfyRow = () => {
    if (engine !== 'comfy') return '';
    const s = api.getState().music.sing;
    return `<button type="button" class="list-row write-comfy" data-action="write-comfy"><span><strong>ComfyUI 设置</strong><small>${s.comfyOwn && s.comfyWorkflow ? '自己的工作流 · ' + esc(s.comfyName || '导入的') : '自动 · 按装的模型'}</small></span>${icon('next')}</button>`;
  };
  /** ComfyUI for singing: where it is, what it found there, and a workflow of one's own. */
  function comfySheet() {
    const d = ctx.dialog('ComfyUI 唱歌', '');
    let check = null, busy = false, list = '', runs = [];
    const sing = () => api.getState().music.sing;
    function workflowBlock() {
      const s = sing();
      if (!s.comfyOwn) return '';
      let own = null;
      try { own = s.comfyWorkflow ? describeSongWorkflow(s.comfyWorkflow, s.comfyMap) : null; } catch { /* kept from something else: imported again below */ }
      const box = (key, label, value) => field(label, select('song-map-' + key, value, [['', '没有'], ...own.fields.map(f => [f.at, f.title])]));
      return `${own ? `<p class="hint write-own-name">${esc(s.comfyName || '导入的工作流')}</p>${box('lyrics', '歌词填到', own.lyrics)}${box('style', '风格填到', own.style)}
          <p class="hint${own.output ? '' : ' error-copy'}">${own.output ? `音频从「${esc(own.output)}」取；${own.seconds ? `时长 ${own.seconds} 处按写歌页选的改，` : ''}种子 ${own.seeds} 处每次换，别的都照工作流。` : '这个工作流没有保存音频的节点，唱不出来'}</p>` : ''}
        <div class="key-actions"><label class="file-pick"><input type="file" accept=".json,application/json" data-song-workflow-file aria-label="导入工作流文件"><span>${icon('add')}${own ? '换一个文件' : '导入文件'}</span></label>${btn('comfy-song-list', '从 ComfyUI 读取', 'secondary')}</div>
        <div data-song-list>${list}</div>`;
    }
    function checkLine() {
      if (busy) return '<p class="hint" role="status">正在连接……</p>';
      if (!check) return '';
      if (check.error) return `<p class="hint error-copy" role="alert">${esc(check.error)}</p>`;
      if (check.own) return check.problems?.length ? `<p class="hint error-copy" role="alert">连上了，但这个工作流跑不了：${esc(check.problems.slice(0, 3).join('；'))}</p>` : '<p class="hint write-ok" role="status">连上了，这个工作流能跑。</p>';
      if (check.problem) return `<p class="hint error-copy" role="alert">${esc(check.problem)}</p>`;
      return `<p class="hint write-ok" role="status">连上了，用${check.models.kind === 'split' ? '拆开的模型' : '这个模型'}：${esc(check.models.names.join('、'))}${check.models.unsure ? '。这个文件如果只是扩散模型，会报没有文本编码器' : ''}</p>`;
    }
    const paint = () => {
      if (!d.live) return;
      const s = sing();
      d.body.innerHTML = `<div class="group pad">${field('地址', `<div class="music-selfhost">${input('comfy-song-url', api.getState().draw.comfy.url, 'url', 'autocomplete="off" placeholder="http://127.0.0.1:8188"')}${btn('comfy-song-check', '连接', 'secondary small', busy ? 'disabled' : '')}</div>`, '和绘图的 ComfyUI 是同一个地址。手机上要填电脑的局域网地址，ComfyUI 启动时加 --listen。\n\n写歌要把做好的音频读回来，绘图走的通道带不了，下面有一个就行：酒馆 config.yaml 里 enableCorsProxy 改成 true；或者 ComfyUI 启动时加 --enable-cors-header。')}${checkLine()}</div>`
        + groupTitle('工作流', help('自动：看你装了哪些 ACE-Step 模型自己搭好。一个文件的整合包（models/checkpoints）和拆开的模型（diffusion_models、text_encoders、vae 各一份）都认，不用复制，也不用改名。\n\n自己的：导入一个在 ComfyUI 里能跑的工作流，不用改它。小手机自己找到写风格、歌词、时长和种子的地方，认错了在这里选。'))
        + `<div class="group pad"><div class="segmented" style="margin:0" role="group" aria-label="工作流">${[[false, '自动'], [true, '自己的']].map(([own, label]) => `<button type="button" data-action="comfy-song-mode" data-own="${own}" aria-pressed="${s.comfyOwn === own}">${label}</button>`).join('')}</div>${workflowBlock()}</div>`;
    };
    const guard = task => Promise.resolve().then(task).catch(error => { if (d.live) ctx.notify(error.message, {error: true}); });
    async function connect() {
      busy = true; check = null; paint();
      try { check = await api.songComfyCheck(); api.saveMusic({sing: {comfyOn: true}}); }
      catch (error) { check = {error: error.message}; }
      busy = false; paint();
    }
    async function imported(name, text) {
      const plan = await api.prepareSongWorkflow({text});
      api.saveMusic({sing: {comfyOn: true, comfyOwn: true, comfyWorkflow: plan.workflow, comfyName: String(name).replace(/\.json$/i, '').trim().slice(0, 60), comfyMap: {lyrics: '', style: ''}}});
      list = ''; check = null; paint();
      if (!plan.lyrics) ctx.notify('没认出写歌词的地方，在下面选一下', {error: true});
    }
    paint();
    d.onClose(() => { if (draft && !v.disposed) { if (sing().comfyOn) engine = 'comfy'; options = api.singOptions(draft); if (go.mode() === 'draft') renderDraft(); } });
    d.body.addEventListener('change', e => {
      const el = e.target, f = el.dataset.field;
      if (f === 'comfy-song-url') guard(() => { api.saveDraw({comfy: {url: el.value.trim()}}); check = null; });
      if (f === 'song-map-lyrics' || f === 'song-map-style') { const s = sing(); api.saveMusic({sing: {comfyMap: {...s.comfyMap, [f.slice(9)]: el.value}}}); }
      if (el.matches('[data-song-workflow-file]')) {
        const file = el.files?.[0];
        el.value = '';
        if (file) guard(async () => { if (file.size > 3000000) throw Error('工作流太大了（超过 3 MB）'); await imported(file.name, await file.text()); });
      }
    });
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-action], [data-song-saved], [data-song-run]');
      if (!b || b.disabled) return;
      guard(async () => {
        if (b.dataset.songSaved) { await imported(b.dataset.songSaved.split('/').pop(), await api.comfySavedWorkflow(b.dataset.songSaved)); return; }
        if (b.dataset.songRun) { const run = runs[Number(b.dataset.songRun)]; if (run) await imported(run.label, run.graph); return; }
        if (b.dataset.action === 'comfy-song-check') { const box = d.body.querySelector('[data-field=comfy-song-url]'); if (box.value.trim() !== api.getState().draw.comfy.url) api.saveDraw({comfy: {url: box.value.trim()}}); await connect(); }
        if (b.dataset.action === 'comfy-song-mode') { api.saveMusic({sing: {comfyOn: true, comfyOwn: b.dataset.own === 'true'}}); check = null; paint(); }
        if (b.dataset.action === 'comfy-song-list') {
          const [saved, recent] = await Promise.allSettled([api.comfySavedWorkflows(), api.songRecentRuns()]);
          if (!d.live) return;
          runs = recent.status === 'fulfilled' ? recent.value : [];
          const names = saved.status === 'fulfilled' ? saved.value : [];
          const row = (attr, value, title) => `<button type="button" class="list-row" ${attr}="${esc(value)}"><span><strong>${esc(title)}</strong></span>${icon('next')}</button>`;
          list = saved.status === 'rejected' && recent.status === 'rejected' ? `<p class="hint error-copy">${esc(saved.reason?.message || '读不到 ComfyUI')}</p>`
            : (runs.length ? groupTitle('最近做过的歌') + `<div class="group">${runs.map((run, i) => row('data-song-run', i, run.label)).join('')}</div>` : '')
              + (names.length ? groupTitle('存着的工作流') + `<div class="group">${names.map(n => row('data-song-saved', n, n.replace(/\.json$/i, ''))).join('')}</div>` : '')
              || '<p class="hint">ComfyUI 里还没有存过工作流，也没有做过歌。</p>';
          d.body.querySelector('[data-song-list]').innerHTML = list;
        }
      });
    });
  }
  function madeRows() {
    const byId = new Map(songs.map(s => [s.id, s])), made = draft.songs.map(id => byId.get(id)).filter(Boolean);
    return made.length ? groupTitle('做好的歌', help('做好的歌都在「歌单」里，在那里可以改名字、删掉。')) + `<div class="group">${made.map(s => `<button type="button" class="list-row" data-action="write-play" data-id="${esc(s.id)}">${icon('play', true)}<span><strong>${esc(s.title)}</strong><small>${esc(s.artist || '')}</small></span></button>`).join('')}</div>` : '';
  }
  function renderDraft() {
    const busy = working === 'rewrite', words = !draft.instrumental;
    v.draw(heading(draft.title || '写歌', '', 'Song')
      + `<div class="group pad">${field('歌名', input('draft-title', draft.title, 'text', `maxlength="${SONG_LIMITS.title}"`))}
        ${field('风格', textArea('draft-style', draft.style, `rows="3" maxlength="${SONG_LIMITS.style}" placeholder="pop ballad, gentle piano, female vocals, 80 BPM"`), '写给音乐服务看的，英文效果最好：曲风、情绪、速度、乐器、人声。不能写真实歌手和歌名，服务会拒绝。')}
        ${words ? field('歌词', textArea('draft-lyrics', draft.lyrics, `rows="14" maxlength="${SONG_LIMITS.lyrics}" placeholder="[Verse 1]\n第一句\n第二句\n\n[Chorus]\n副歌"`), '[Verse 1]、[Chorus] 这样的标签单独占一行，用来分段，不会被唱出来。') : ''}
        <div class="write-wish"><input data-field="draft-wish" type="text" maxlength="${SONG_LIMITS.wish}" placeholder="想怎么改？比如：副歌再甜一点" aria-label="想怎么改" autocomplete="off">${btn('write-rewrite', icon('refresh') + (busy ? '正在改……' : '让 AI 改'), 'secondary small', busy ? 'disabled' : '')}</div>
        ${undo ? `<div class="actions" style="margin:6px 0 0">${btn('write-undo', '改回去', 'text-button')}</div>` : ''}</div>`
      + groupTitle('唱出来') + `<div class="group pad">${singBlock()}</div>`
      + madeRows()
      + `<details data-group="draft-suno"><summary>拿去 Suno 做 ${help('Suno 没有开放接口，插件接不了，但可以手动做：\n1. 复制歌词和风格，打开 Suno，选 Custom（自定义）模式，分别粘贴进去。\n2. 做好以后下载下来，再点「导入做好的歌」，它会进歌单，歌词按歌的长度估算时间。\n\nSuno 对下载次数有限制（免费账号很少），以它的说明为准。')}</summary><div class="fold-body"><div class="write-copy">
          ${words ? btn('write-copy', icon('copy') + '复制歌词', 'secondary small', 'data-what="lyrics"') : ''}${btn('write-copy', icon('copy') + '复制风格', 'secondary small', 'data-what="style"')}${btn('write-copy', icon('copy') + '复制歌名', 'secondary small', 'data-what="title"')}
          <a class="secondary small write-link" href="${SUNO}" target="_blank" rel="noopener noreferrer">${icon('next')}打开 Suno</a>
          <label class="secondary small file-button">${icon('add')}导入做好的歌<input type="file" data-draft-file accept="${AUDIO_FILES}" aria-label="选择做好的歌"></label></div></div></details>`
      + `<div class="actions">${btn('write-delete', icon('trash') + '删除这首', 'text-button danger-text')}</div>`);
  }
  /** What was typed, kept: the words are what the song is. */
  async function save() {
    if (!draft) return;
    const row = await api.saveSongDraft({id: draft.id, title: draft.title, style: draft.style, lyrics: draft.lyrics});
    if (draft && row) draft = {...draft, updatedAt: row.updatedAt};
  }
  /** Something changed behind the page: how far the singing is goes on the page, what is being typed stays. */
  async function changed() {
    if (!draft) return;
    const row = await api.getSongDraft(draft.id).catch(() => null);
    if (!row || !draft) return;
    // Read before the service was asked: it would show 唱出来 again for a moment.
    if (starting) { if (!row.state && !row.note && row.songs.length === draft.songs.length) return; starting = false; }
    const state = stateOf(row);
    if (state === shownState) return;
    shownState = state;
    Object.assign(draft, {songs: row.songs, note: row.note || ''});
    if (row.state) draft.state = row.state; else delete draft.state;
    await readAround();
    if (!v.disposed && draft && go.mode() === 'draft') renderDraft();
  }
  function fail(error) { ctx.notify(error.message, {error: true}); }

  // ---------- What is done on them ----------
  v.on('input', '[data-field^="write-"]', el => {
    const key = el.dataset.field.slice(6);
    if (!form || !(key in form) || el.type === 'checkbox') return;
    form[key] = el.value;
    if (CHOICES[key]) for (const b of el.parentElement.querySelectorAll('[data-action=write-chip]')) b.setAttribute('aria-pressed', String(parts(el.value).includes(b.dataset.value)));
  });
  v.on('change', '[data-field="write-who"]', el => { form.who = el.value; });
  v.on('change', '[data-field="write-story"]', el => { form.story = el.checked; });
  v.on('change', '[data-field="write-instrumental"]', el => { form.instrumental = el.checked; renderForm(); });
  v.on('input', '[data-field="draft-title"],[data-field="draft-style"],[data-field="draft-lyrics"]', el => { if (draft) draft[el.dataset.field.slice(6)] = el.value; });
  v.on('change', '[data-field="draft-title"],[data-field="draft-style"],[data-field="draft-lyrics"]', el => {
    save().catch(fail);
    // New words, a new length to sing them in.
    const box = v.root.querySelector('[data-field="draft-seconds"]');
    if (el.dataset.field === 'draft-lyrics' && box) box.options[0].textContent = autoLength();
  });
  v.on('change', '[data-field="draft-engine"]', el => {
    engine = el.value;
    const line = v.root.querySelector('[data-sing-price]'), extra = v.root.querySelector('[data-sing-extra]');
    if (line) line.textContent = priceOf(engine)?.text || '';
    if (extra) extra.innerHTML = singExtra();
  });
  v.on('change', '[data-field="draft-seconds"]', el => {
    if (!draft) return;
    draft.seconds = Number(el.value) || 0;
    options = api.singOptions(draft);
    const line = v.root.querySelector('[data-sing-price]');
    if (line) line.textContent = priceOf(engine)?.text || '';
    api.saveSongDraft({id: draft.id, seconds: draft.seconds}).catch(fail);
  });
  v.on('change', '[data-draft-file]', async el => {
    const file = el.files?.[0];
    el.value = '';
    if (!file || !draft) return;
    try { await save(); await api.importSongFile(draft.id, file); ctx.notify('放进歌单了'); }
    catch (error) { fail(error); }
  });
  async function click(el) {
    switch (el.dataset.action) {
      case 'write-new': newForm(); break;
      case 'write-chip': {
        const key = el.dataset.key, box = v.root.querySelector(`[data-field="write-${key}"]`), value = el.dataset.value;
        if (key === 'language') form[key] = value;
        else { const now = parts(form[key]); form[key] = (now.includes(value) ? now.filter(x => x !== value) : [...now, value]).join('、'); }
        box.value = form[key];
        for (const b of el.parentElement.children) b.setAttribute('aria-pressed', String(parts(form[key]).includes(b.dataset.value)));
        break;
      }
      case 'write-length': form.length = el.dataset.length; for (const b of el.parentElement.children) b.setAttribute('aria-pressed', String(b === el)); break;
      case 'write-go': {
        if (!api.songWrite) { ctx.notify('要在酒馆里打开小手机，才能让模型写', {error: true}); break; }
        working = 'write'; renderForm();
        try { const row = await api.songWrite(formOut()); if (go.mode() === 'write-form') await open(row.id); else ctx.notify(`「${row.title}」写好了，在「写歌」里`); }
        catch (error) { fail(error); }
        finally { working = ''; if (!v.disposed && go.mode() === 'write-form') renderForm(); }
        break;
      }
      case 'write-self': {
        const f = formOut();
        try {
          api.saveMusic({writing: normalizeSongForm(f)});
          const row = await api.saveSongDraft({title: '', style: [f.genre, f.voice].filter(Boolean).join(', '), lyrics: '', instrumental: f.instrumental, language: normalizeSongForm(f).language, who: f.who, about: f.about, seconds: f.instrumental ? SONG_LENGTHS[f.length].seconds : 0});
          await open(row.id);
        } catch (error) { fail(error); }
        break;
      }
      case 'write-sing': {
        try {
          await save();
          options = api.singOptions(draft);
          const price = priceOf(engine);
          if (!price) break;
          if (!price.free && !await ctx.confirm('这首要花钱', `${price.text}，确认后再做。`)) break;
          draft.state = 'singing'; delete draft.note; shownState = stateOf(draft); stepOf = null; starting = true; renderDraft();
          api.singDraft(draft.id, {engine, allowPaid: true}).catch(error => { starting = false; if (draft) { delete draft.state; draft.note = error.message; shownState = stateOf(draft); if (go.mode() === 'draft') renderDraft(); } fail(error); });
        } catch (error) { fail(error); }
        break;
      }
      case 'write-cancel': if (await ctx.confirm('不等了？', '已经发给服务的这一次，它可能还会照常扣费。')) api.cancelSing(draft.id); break;
      case 'write-rewrite': {
        const box = v.root.querySelector('[data-field="draft-wish"]'), wish = box?.value.trim();
        if (!wish) { ctx.notify('写一下想怎么改', {error: true}); box?.focus(); break; }
        if (!api.songRewrite) { ctx.notify('要在酒馆里打开小手机，才能让模型改', {error: true}); break; }
        const before = {title: draft.title, style: draft.style, lyrics: draft.lyrics}, id = draft.id;
        try {
          await save();
          working = 'rewrite'; renderDraft();
          const row = await api.songRewrite(id, wish);
          if (draft?.id === id) { undo = before; Object.assign(draft, {title: row.title, style: row.style, lyrics: row.lyrics}); }
        } catch (error) { fail(error); }
        finally { working = ''; if (!v.disposed && go.mode() === 'draft') renderDraft(); }
        break;
      }
      case 'write-undo': if (undo) { Object.assign(draft, undo); undo = null; try { await save(); } catch (error) { fail(error); } renderDraft(); } break;
      case 'write-play': { const s = songs.find(x => x.id === el.dataset.id); if (s) api.musicPlayList?.([s], 0, 'library').catch(fail); break; }
      case 'write-copy': {
        const what = el.dataset.what;
        ctx.notify(await copyText(ctx.win, draft[what] || '') ? ({lyrics: '歌词', style: '风格', title: '歌名'}[what] + '复制好了') : '没复制上，长按框里的字手动复制吧');
        break;
      }
      case 'write-engines': ctx.open('engines'); ctx.editEngine?.(engine && engine !== 'comfy' ? engine : 'stepfun'); break;
      case 'write-comfy': comfySheet(); break;
      case 'write-delete': if (await ctx.confirm('删除这首？', '只删歌词和风格，做好的歌还留在歌单里。')) { await api.deleteSongDrafts([draft.id]); draft = null; go('main'); } break;
    }
  }
  const singingText = () => `正在唱……${stepOf?.[0] === draft?.id ? `第 ${stepOf[1]} / ${stepOf[2]} 步` : '通常要几十秒到几分钟'}。可以先去做别的，做好了会提醒你。`;
  /** How far along it is, while ComfyUI is singing: on the page as it stands, and after it is drawn again. */
  function step({draft: id, step: [done, of]}) {
    stepOf = [id, done, of];
    if (draft?.id !== id) return;
    const line = v.root.querySelector('.write-singing span');
    if (line) line.textContent = singingText();
  }
  return {load, listHTML, mountList, dropList, renderForm, renderDraft, click, changed, step,
    open: id => open(id).catch(fail),
    /** Going back from its own pages: the song is saved first. */
    back() { const m = go.mode(); if (m !== 'draft' && m !== 'write-form') return false; if (m === 'draft') save().catch(fail); draft = null; form = null; go('main'); return true; }};
}
