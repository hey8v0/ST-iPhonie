// 生成器 (0.9.30): what the phone's text model writes for the card being played — 开场白 (versions side by side,
// 「改一改」 by a sentence, written into the chat), a User 人设 (saved as a tavern persona), 接下来的走向 (one picked
// steers the next story reply only) and 小剧场 (a script read with the roles' voices, or a card; kept). The work is
// host-generator.js; the words are the 生成器 blocks of 系统提示词.
import {createView, esc, btn, heading, help, field, input, textArea, groupTitle, menu, copyText, select, toggle} from './common.js';
import {icon} from './icons.js';
import {saveFile} from '../download.js';
import {OPENING_LENGTHS, PERSONA_LENGTHS, THEATER_LENGTHS} from '../core/generator.js';

const TABS = [['opening', '开场白'], ['persona', '人设'], ['direction', '走向'], ['theater', '小剧场']];
const HELP = '生成器写和正在玩的这张卡有关的东西：用小手机的文字模型和世界书，提示词在「预设 → 系统提示词」的「生成器」里能改。\n开场白：随机或指定情境，可以写好几版左右比较，「改一改」照你的一句话修改。写入聊天时，聊天里只有开场白就加成它的新一版（左右滑能换回原来的），已经聊过会先问你再加到最后；不会改角色卡。\n人设：写一份你在这个故事里的人设，能直接存成酒馆人设。\n走向：按最近的剧情想几个接下来可以怎么走，选一个，下一次正文就朝那里写（只这一次）。\n小剧场：一小段番外。剧本用角色的声音念出来（旁白跟着「整篇朗读」），或者做成一张卡片；写过的都留着。';
const day = at => { const d = new Date(at); return `${d.getMonth() + 1}月${d.getDate()}日`; };

export function generatorApp(ctx) {
  const {api, win} = ctx, v = createView(ctx, 'generator');
  let tab = 'opening', busy = '', steering = null, theaters = [], open = '', turn = 0;
  const o = {mode: 'random', brief: '', focus: '', length: 'medium', versions: [], at: 0, wish: ''};
  const p = {wish: '', length: 'medium', name: '', description: '', saved: null};
  const d = {wish: '', list: [], own: ''};
  const t = {kind: 'script', source: 'story', length: 'medium', wish: '', focus: ''};
  const quietly = (fn, fallback) => { try { return fn() ?? fallback; } catch { return fallback; } };
  const card = () => quietly(() => api.generatorCard(), {name: '', group: false, messages: 0, greetingOnly: false});
  const seg = (action, value, label, now) => `<button type="button" data-action="${action}" data-value="${value}" aria-pressed="${value === now}">${esc(label)}</button>`;
  const segs = (action, list, now, label) => `<div class="segmented gen-seg" role="group" aria-label="${esc(label)}">${list.map(([key, name]) => seg(action, key, name, now)).join('')}</div>`;
  /** What was just written comes into view (it sits under the form). */
  const reveal = selector => v.root.querySelector(selector)?.scrollIntoView?.({block: 'start', behavior: 'smooth'});
  const go = (action, label, kind, style = 'primary') => btn(action, busy === kind ? '正在写…' : label, style, busy ? 'disabled' : '');

  async function presetSettings() {
    let presets = [], error = '';
    try { presets = await api.assistantPresets(); } catch (e) { error = e.message; }
    const sheet = ctx.dialog('生成器设置', '');
    const selection = () => api.getState().generator || {tavernPreset: '', tavernEntries: {}};
    const draw = () => {
      const s = selection(), preset = presets.find(p => p.id === s.tavernPreset);
      sheet.body.innerHTML = field('酒馆预设', select('gen-preset', s.tavernPreset, [['', '不用酒馆预设'], ...presets.map(p => [p.id, p.name])]))
        + (error ? `<p class="hint">${esc(error)}</p>` : '')
        + (preset ? groupTitle('预设条目') + preset.entries.map((e, i) => toggle('gen-entry-' + i, e.title, s.tavernEntries?.[preset.id]?.[e.id] ?? e.enabled)).join('') : '');
    };
    sheet.body.addEventListener('change', e => {
      const key = e.target.dataset.field, next = api.getState(), s = selection();
      if (key === 'gen-preset') s.tavernPreset = e.target.value;
      else if (key?.startsWith('gen-entry-')) {
        const entry = presets.find(p => p.id === s.tavernPreset)?.entries[Number(key.slice(10))];
        if (!entry) return;
        s.tavernEntries ||= {}; s.tavernEntries[s.tavernPreset] ||= {};
        s.tavernEntries[s.tavernPreset][entry.id] = e.target.checked;
      } else return;
      next.generator = s; api.save(next); draw();
    });
    draw();
  }

  // ---------- pages ----------
  function openingPage() {
    const c = card(), text = o.versions[o.at] || '', can = !!c.name && !c.group;
    const where = c.name ? `<p class="gen-for">写给「${esc(c.name)}」的第一条消息</p>` : `<p class="gen-for none">${c.group ? '群聊没有单独的角色卡：打开一张角色卡再写' : '先在酒馆里打开一张角色卡'}</p>`;
    return where + segs('o-mode', [['random', '随机'], ['brief', '指定情境']], o.mode, '开场方式')
      + (o.mode === 'brief' ? field('情境', textArea('o-brief', o.brief, 'rows="3" maxlength="500" placeholder="例如：雨后的阁楼，桌上多出一封信……"')) : '')
      + field('出场人物（选填）', input('o-focus', o.focus, 'text', 'maxlength="200" placeholder="例如：三人同行，或由旁白开场"'))
      + `<div class="field"><span>篇幅</span>${segs('o-length', OPENING_LENGTHS, o.length, '篇幅')}</div>`
      + `<div class="actions">${go('o-generate', o.versions.length ? '再写一版' : '生成开场白', 'opening')}</div>`
      + (!o.versions.length ? '' : `<section class="gen-result">
        <div class="gen-versions"><button type="button" class="round-button" data-action="o-prev" aria-label="上一版"${o.at ? '' : ' disabled'}>${icon('back')}</button><span>第 ${o.at + 1}/${o.versions.length} 版</span><button type="button" class="round-button" data-action="o-next" aria-label="下一版"${o.at < o.versions.length - 1 ? '' : ' disabled'}>${icon('next')}</button>${btn('o-copy', icon('copy') + '复制', 'text-button')}</div>
        ${textArea('o-text', text, 'rows="10" aria-label="开场白"')}
        <div class="gen-revise">${input('o-wish', o.wish, 'text', 'maxlength="500" placeholder="照这句改一改：比如 少一点旁白"')}${btn('o-revise', busy === 'opening' ? '在改…' : '改一改', 'secondary', busy ? 'disabled' : '')}</div>
        <div class="actions">${btn('o-write', '写入聊天', 'primary', can ? '' : 'disabled')}</div>
        ${can ? `<p class="hint">${c.greetingOnly ? '会加成开场白的新一版，左右滑能换回原来的' : c.messages ? `聊天里已经有 ${c.messages} 条消息，写入前会先问你` : '会成为这段聊天的第一条消息'}</p>` : ''}</section>`);
  }
  function personaPage() {
    return field('想要什么样的（选填）', textArea('p-wish', p.wish, 'rows="3" maxlength="500" placeholder="例如：和 TA 青梅竹马的大学生，嘴硬心软"'))
      + `<div class="field"><span>篇幅</span>${segs('p-length', PERSONA_LENGTHS, p.length, '篇幅')}</div>`
      + `<div class="actions">${go('p-generate', p.description ? '再写一版' : '生成人设', 'persona')}</div>`
      + (!p.description ? '' : `<section class="gen-result">${field('名字', input('p-name', p.name, 'text', 'maxlength="40"'))}${field('人设', textArea('p-text', p.description, 'rows="10"'))}
        <div class="actions">${p.saved ? btn('p-use', '换上这个人设', 'primary') : btn('p-save', '存成酒馆人设', 'primary')}</div>
        ${p.saved ? `<p class="hint">已存成酒馆人设「${esc(p.saved.name)}」，酒馆的人设管理里也能选</p>` : ''}</section>`);
  }
  function directionPage() {
    const picked = x => !!steering && steering.text === x.text;
    return (steering ? `<div class="gen-steer"><div><small>下一次正文会朝这里走</small><p>${esc(steering.title ? `${steering.title}——${steering.text}` : steering.text)}</p></div>${btn('d-cancel', '取消', 'text-button')}</div>` : '')
      + field('想要（选填）', input('d-wish', d.wish, 'text', 'maxlength="500" placeholder="例如：多一点日常，或者来点意外"'))
      + `<div class="actions">${go('d-generate', d.list.length ? '换一批' : '想想接下来', 'direction')}</div>`
      + (d.list.length ? `<div class="gen-directions">${d.list.map((x, i) => `<button type="button" class="gen-direction" data-action="d-pick" data-index="${i}" aria-pressed="${picked(x)}"><strong>${esc(x.title || `走向 ${i + 1}`)}</strong><span>${esc(x.text)}</span></button>`).join('')}</div>` : '')
      + groupTitle('自己写一个') + `<div class="gen-revise">${input('d-own', d.own, 'text', 'maxlength="300" placeholder="比如：两个人在雨里吵了一架"')}${btn('d-use', '用这个', 'secondary')}</div>`;
  }
  function pieceView(x) {
    if (x.form === 'card') return `<section class="gen-piece"><h3>${esc(x.title)}</h3><div class="gen-card-slot" data-card="${esc(x.id)}"></div></section>`;
    return `<section class="gen-piece"><div class="gen-piece-head"><h3>${esc(x.title)}</h3>${btn('t-play', icon('play') + '念出来', 'secondary')}</div>
      <div class="gen-script">${x.lines.map(l => l.narration ? `<p class="gen-narration">${esc(l.translation || l.text)}</p>` : `<p class="gen-line"><b>${esc(l.role)}</b><span>${esc(l.translation || l.text)}</span></p>`).join('')}</div></section>`;
  }
  function theaterPage() {
    const piece = theaters.find(x => x.id === open);
    return segs('t-kind', [['script', '念出来的剧本'], ['card', '做成卡片']], t.kind, '形式')
      + segs('t-source', [['story', '接着剧情'], ['card', '只用设定']], t.source, '从哪来')
      + field('想看什么（选填）', textArea('t-wish', t.wish, 'rows="2" maxlength="500" placeholder="例如：如果他们一起去夏日祭"'))
      + field('出场人物（选填）', input('t-focus', t.focus, 'text', 'maxlength="200"'))
      + `<div class="field"><span>篇幅</span>${segs('t-length', THEATER_LENGTHS, t.length, '篇幅')}</div>`
      + `<div class="actions">${go('t-generate', '写一段', 'theater')}</div>`
      + (piece ? pieceView(piece) : '')
      + (theaters.length ? groupTitle('写过的小剧场') + `<div class="group gen-theaters">${theaters.map(x => `<div class="list-row gen-theater" data-id="${esc(x.id)}"><button type="button" class="gen-theater-main" data-action="t-open" data-id="${esc(x.id)}" aria-pressed="${x.id === open}"><strong>${esc(x.title)}</strong><small>${x.form === 'card' ? '卡片' : '剧本'} · ${esc(day(x.at))}</small></button><button type="button" class="round-button" data-action="t-more" data-id="${esc(x.id)}" aria-label="${esc(x.title)} 的更多操作">${icon('more')}</button></div>`).join('')}</div>` : '');
  }
  function render() {
    if (v.disposed) return;
    const name = card().name;
    v.draw(heading('生成器', btn('gen-settings', icon('settings'), 'round-button', 'aria-label="生成器设置"') + help(HELP), name ? `Generator · ${name}` : 'Generator')
      + `<div class="segmented gen-tabs" role="group" aria-label="写什么">${TABS.map(([key, label]) => seg('tab', key, label, tab)).join('')}</div>`
      + ({opening: openingPage, persona: personaPage, direction: directionPage, theater: theaterPage})[tab]());
    mountCard();
  }

  // ---------- a card: the assistant's sandbox (no network, no way into the phone) ----------
  function theme() {
    const style = win.getComputedStyle(v.root), color = name => style.getPropertyValue(name).trim();
    return {theme: {'--SmartThemeBodyColor': color('--ink') || '#25314b', '--SmartThemeEmColor': color('--ink2') || '#65718a', '--SmartThemeQuoteColor': color('--accent') || '#7dadd6', '--SmartThemeUnderlineColor': color('--accent-ink') || '#2d6392'}, dark: ctx.doc.documentElement.dataset.theme === 'dark'};
  }
  function mountCard() {
    const slot = v.root.querySelector('.gen-card-slot'), piece = slot && theaters.find(x => x.id === slot.dataset.card);
    if (!piece?.html || slot.querySelector('iframe')) return;
    import('./assistant.js').then(({assistantPreviewDocument}) => {
      if (!slot.isConnected || slot.querySelector('iframe')) return;
      const frame = ctx.doc.createElement('iframe');
      frame.className = 'gen-card-frame'; frame.title = piece.title;
      frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; autoplay 'none'");
      frame.srcdoc = assistantPreviewDocument(piece.html, {auto: true, ...theme()});
      slot.append(frame);
    }).catch(error => ctx.notify(error.message, {error: true}));
  }
  const sized = event => {
    if (event.data?.type !== 'assistant-html-size' || !Number.isFinite(event.data.height)) return;
    for (const frame of v.root.querySelectorAll('.gen-card-frame')) if (frame.contentWindow === event.source) frame.style.height = `${Math.max(60, Math.min(20000, Math.ceil(event.data.height)))}px`;
  };
  win.addEventListener('message', sized);

  async function loadTheaters() {
    const ticket = ++turn, list = await api.theaters();
    if (v.disposed || ticket !== turn) return;
    theaters = list;
    if (open && !theaters.some(x => x.id === open)) open = '';
    render();
  }
  async function writeOpening() {
    const text = (o.versions[o.at] || '').trim();
    if (!text) return;
    let done = await api.generatorWriteOpening(text);
    if (done.how === 'ask') {
      if (!await ctx.confirm('加到聊天最后？', `聊天里已经有 ${done.messages} 条消息。把这段开场白作为角色的新消息加在最后吗？`)) return;
      done = await api.generatorWriteOpening(text, {append: true});
    }
    ctx.notify(done.how === 'swipe' ? `写进去了：开场白的第 ${done.index} 版` : '写进聊天了');
    render();
  }
  async function more(x) {
    const key = await menu(ctx, x.title, [{key: 'copy', icon: 'copy', label: x.form === 'card' ? '复制网页代码' : '复制剧本'}, x.form === 'card' && {key: 'download', icon: 'download', label: '下载成网页'}, {key: 'delete', icon: 'trash', label: '删除', danger: true}]);
    if (key === 'copy') { await copyText(win, x.form === 'card' ? x.html : x.lines.map(l => l.narration ? `（${l.translation || l.text}）` : `${l.role}：${l.translation || l.text}`).join('\n')); ctx.notify('复制了'); }
    if (key === 'download') {
      const {assistantPreviewDocument} = await import('./assistant.js');
      ctx.notify('已下载 ' + await saveFile(ctx.doc, new Blob([assistantPreviewDocument(x.html, theme())], {type: 'text/html'}), `${x.title.replace(/[\\/:*?"<>|]+/g, '') || '小剧场'}.html`));
    }
    if (key === 'delete' && await ctx.confirm(`删除「${x.title}」？`, '')) { await api.deleteTheater([x.id]); if (open === x.id) open = ''; }
  }

  // ---------- typing and taps ----------
  v.root.addEventListener('input', e => {
    const key = e.target.dataset?.field, value = e.target.value;
    const set = {'o-brief': () => { o.brief = value; }, 'o-focus': () => { o.focus = value; }, 'o-wish': () => { o.wish = value; }, 'o-text': () => { if (o.versions.length) o.versions[o.at] = value; },
      'p-wish': () => { p.wish = value; }, 'p-name': () => { p.name = value; }, 'p-text': () => { p.description = value; }, 'd-wish': () => { d.wish = value; }, 'd-own': () => { d.own = value; },
      't-wish': () => { t.wish = value; }, 't-focus': () => { t.focus = value; }}[key];
    set?.();
    // A 人设 changed after it was saved is another one: 存成酒馆人设 comes back.
    if ((key === 'p-name' || key === 'p-text') && p.saved) { p.saved = null; const box = v.root.querySelector('[data-action=p-use]'); if (box) { box.dataset.action = 'p-save'; box.textContent = '存成酒馆人设'; } v.root.querySelector('.gen-result .hint')?.remove(); }
  });
  v.on('click', '[data-action]', async el => {
    const action = el.dataset.action, value = el.dataset.value;
    switch (action) {
      case 'gen-settings': await presetSettings(); break;
      case 'tab': tab = value; render(); if (tab === 'theater') await loadTheaters(); break;
      case 'o-mode': o.mode = value; render(); break;
      case 'o-length': o.length = value; render(); break;
      case 'p-length': p.length = value; render(); break;
      case 't-kind': t.kind = value; render(); break;
      case 't-source': t.source = value; render(); break;
      case 't-length': t.length = value; render(); break;
      case 'o-generate': {
        const text = await api.generatorOpening({mode: o.mode, brief: o.brief, focus: o.focus, length: o.length});
        o.versions.push(text); o.at = o.versions.length - 1; render(); reveal('.gen-result');
        break;
      }
      case 'o-prev': case 'o-next': o.at = Math.max(0, Math.min(o.versions.length - 1, o.at + (action === 'o-next' ? 1 : -1))); render(); break;
      case 'o-copy': await copyText(win, o.versions[o.at] || ''); ctx.notify('复制了'); break;
      case 'o-revise': {
        if (!o.wish.trim()) { ctx.notify('先写一句想怎么改'); v.root.querySelector('[data-field=o-wish]')?.focus(); break; }
        const text = await api.generatorOpening({mode: o.mode, brief: o.brief, focus: o.focus, length: o.length, before: o.versions[o.at], wish: o.wish});
        o.versions.push(text); o.at = o.versions.length - 1; o.wish = ''; render();
        break;
      }
      case 'o-write': await writeOpening(); break;
      case 'p-generate': {
        const got = await api.generatorPersona({wish: p.wish, length: p.length});
        p.name = got.name || p.name; p.description = got.description; p.saved = null; render(); reveal('.gen-result');
        break;
      }
      case 'p-save': p.saved = await api.generatorSavePersona({name: p.name, description: p.description}); ctx.notify(`存好了：酒馆人设「${p.saved.name}」`); render(); break;
      case 'p-use': if (p.saved) { await api.generatorUsePersona(p.saved.avatarId); ctx.notify(`换成「${p.saved.name}」了`); } break;
      case 'd-generate': d.list = await api.generatorDirections({wish: d.wish}); render(); reveal('.gen-directions'); break;
      case 'd-pick': {
        const x = d.list[Number(el.dataset.index)];
        if (!x) break;
        steering = api.generatorSteer(steering?.text === x.text ? null : x);
        if (steering) ctx.notify('下一次正文会朝这里走');
        render();
        break;
      }
      case 'd-cancel': steering = api.generatorSteer(null); render(); break;
      case 'd-use': {
        if (!d.own.trim()) { ctx.notify('先写下想要的走向'); break; }
        steering = api.generatorSteer({title: '', text: d.own}); d.own = ''; ctx.notify('下一次正文会朝这里走'); render();
        break;
      }
      case 't-generate': { const piece = await api.generatorTheater({...t}); open = piece.id; await loadTheaters(); reveal('.gen-piece'); break; }
      case 't-open': open = open === el.dataset.id ? '' : el.dataset.id; render(); break;
      case 't-play': if (open) await api.generatorPlay(open); break;
      case 't-more': { const x = theaters.find(y => y.id === el.dataset.id); if (x) await more(x); break; }
    }
  });
  // What the tavern side says (writing, a 走向 used up by the story) and 小剧场 changed anywhere.
  v.onGenerator = event => { if ('busy' in event) busy = event.busy || ''; if ('steer' in event) steering = event.steer || null; render(); };
  v.onTheater = () => loadTheaters().catch(() => {});
  v.refresh = () => { steering = quietly(() => api.generatorSteering(), null); return loadTheaters(); };
  const dispose = v.dispose;
  v.dispose = () => { win.removeEventListener('message', sized); dispose(); };
  busy = quietly(() => api.generatorBusy(), '');
  steering = quietly(() => api.generatorSteering(), null);
  render();
  loadTheaters().catch(error => ctx.notify(error.message, {error: true}));
  return v;
}
