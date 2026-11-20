import {esc, heading, field, select, input, btn, menu} from './common.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {saveFile, zipFiles} from '../download.js';
import {decodeMono, joinClips, encodeWav} from '../core/audio-join.js';
import {BEDTIME_TYPES} from '../core/bedtime.js';
import {icon} from './icons.js';

export const bookTabs = bedtime => `<div class="segmented" aria-label="绘本板块">${btn('bk-shelf', '书架', '', `aria-pressed="${!bedtime}"`)}${btn('bk-bedtime', '睡前故事', '', `aria-pressed="${bedtime}"`)}</div>`;

export function bedtimeView(ctx, v) {
  const {api} = ctx;
  let active = false, books = [], saved = [], songs = [], roles = [], source = null, ticket = 0, creating = false, swipes = null;
  const actions = [{key: 'download', label: '下载', icon: 'download'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}];
  const form = {role: '', kind: '睡前故事', minutes: '3', wish: '', sourceId: '', chapter: '0', paragraph: '0', song: '', effects: true, world: true, plot: 'independent', skipEntries: [], skipBooks: [], extraBooks: []};
  const status = () => api.bedtimeStatus?.() || {playing: false};
  let library = false, narrator = '', search = '', follow = true, playingId = '', currentLine = -1;
  try { const prefs = JSON.parse(ctx.win.localStorage.getItem('stiphonie.bedtime.preferences') || '{}');
    for (const key of ['world','effects']) if (typeof prefs[key] === 'boolean') form[key] = prefs[key];
    form.plot = prefs.plot === 'story' ? 'story' : 'independent';
    for (const key of ['skipBooks','skipEntries','extraBooks']) if (Array.isArray(prefs[key])) form[key]=prefs[key].filter(x=>typeof x==='string');
    if (typeof prefs.song === 'string') form.song = prefs.song;
  } catch {}
  function remember() {
    const {world,plot,skipBooks,skipEntries,extraBooks,effects,song} = form;
    try { ctx.win.localStorage.setItem('stiphonie.bedtime.preferences', JSON.stringify({world,plot,skipBooks,skipEntries,extraBooks,effects,song})); } catch {}
  }
  const toggle = (key,label) => `<label class="bt-option">${label}<input type="checkbox" data-bt-opt="${key}" ${form[key]?'checked':''}></label>`;
  const mixControls = () => field('配乐', select('bt-song', form.song, [['','不配音乐'], ...songs.map(s=>[s.id,s.title])])) + toggle('effects','故事音效');
  const listHTML = rows => rows.map(b => swipeRow(b.id, `<div class="list-row"><span class="bedtime-thumb">${icon('book')}</span><span class="bedtime-title"><strong>${esc(b.title)}</strong><small>${esc(b.bedtime.role)} · ${esc(b.bedtime.kind)}</small></span>${btn('bt-play',icon('play',true),'text-button',`data-id="${esc(b.id)}" aria-label="再听《${esc(b.title)}》"`)}</div>`,actions,{label:b.title})).join('');
  function paintList() {
    swipes?.dispose();
    const list = v.root.querySelector('.bedtime-stories');
    if (!list) return;
    const rows = library ? saved.filter(b=>(!narrator || b.bedtime.role===narrator) && b.title.toLowerCase().includes(search.trim().toLowerCase())) : saved.slice(0,3);
    list.innerHTML = listHTML(rows) || '<p class="hint">没有找到故事</p>';
    swipes = mountSwipeList(list,{ctx,onTap:play,onAction:(key,id)=>act(key,[id]),bulk:actions,onBulk:act});
  }
  function playback(now,book) {
    if (!book) return;
    if (playingId !== now.id || !v.root.querySelector('.bt-player')) {
      swipes?.dispose(); swipes=null; playingId=now.id; follow=true; currentLine=-1;
      v.draw(`<section class="bt-player bt-dream bedtime-sky"><header><h2>${esc(book.title)}</h2></header><div class="bt-transcript" tabindex="0"></div></section>`);
      const pane=v.root.querySelector('.bt-transcript');
      const browse=()=>{follow=false;};
      for(const event of ['touchmove','wheel','keydown']) pane.addEventListener(event,browse,{passive:true});
      pane.onscroll=()=>{
        if(!follow) {
          const center=pane.getBoundingClientRect().top+pane.clientHeight/2;
          const closest=ctx.doc.elementFromPoint?.(pane.getBoundingClientRect().left+pane.clientWidth/2,center)?.closest('[data-bt-line]');
          pane.querySelector('.recalled')?.classList.remove('recalled');
          closest?.classList.add('recalled');
          const latest = pane.querySelector('.current')?.getBoundingClientRect();
          if (latest && (Math.abs((latest.top + latest.bottom) / 2 - center) < 12 || pane.scrollHeight - pane.clientHeight - pane.scrollTop < 5)) follow = true;
        }
      };
    }
    if(now.index<0 || now.index<=currentLine)return;
    const pane=v.root.querySelector('.bt-transcript');
    for(let i=currentLine+1;i<=now.index;i++){
      const step=book.bedtime.steps[i];
      if(step?.kind!=='say')continue;
      const line=ctx.doc.createElement('p');line.dataset.btLine=String(i);line.textContent=step.translation||step.text;
      pane.querySelector('.current')?.classList.remove('current');line.className='current';pane.append(line);
      if (follow) {
        pane.querySelector('.recalled')?.classList.remove('recalled');
        const top = pane.scrollTop + line.getBoundingClientRect().top - pane.getBoundingClientRect().top - Math.max(0, (pane.clientHeight - line.offsetHeight) / 2);
        if (pane.scrollTo && currentLine >= 0 && !ctx.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) pane.scrollTo({top, behavior:'smooth'});
        else pane.scrollTop = top;
      }
    }
    currentLine=now.index;
    pane.parentElement.classList.add('started');
  }
  function render() {
    if (!active || v.disposed) return;
    const now=status(), book=saved.find(b=>b.id===now.id);
    if(now.playing && book){playback(now,book);return;}
    playingId='';
    if(library){
      v.draw(heading('讲过的故事',btn('bt-home','返回','chip-button'))+`<div class="bedtime-form">${field('找故事',input('bt-search',search,'search','placeholder="搜索标题"'))}${field('讲述者',select('bt-narrator',narrator,[['','全部'],...Array.from(new Set(saved.map(b=>b.bedtime.role)),r=>[r,r])]))}</div><div class="bedtime-stories"></div>`);
    }else{
      const busy=now.busy||creating;
      v.draw(heading('睡前故事','','Bedtime Stories')+bookTabs(true)+`<section class="bedtime-room"><div class="bedtime-sky bt-cover"><span class="bedtime-moon"></span><h2>今晚听什么</h2></div><div class="bedtime-form">
        ${field('讲故事的人',select('bt-role',form.role,[['','选择讲述者'],...roles.map(r=>[r.name,r.name])]))}
        ${field('听什么',select('bt-sourceId',form.sourceId,[['','讲一个新的'],...books.map(b=>[b.id,b.title])]))}
        ${form.sourceId && source ? field('从哪一章',select('bt-chapter',form.chapter,source.chapters.map((t,i)=>[String(i),t])))+field('从哪一段',select('bt-paragraph',form.paragraph,source.paragraphs.map((p,i)=>[String(i),p.slice(0,32)]))) : ''}
        <details data-bt-settings ${settingsOpen?'open':''}><summary>故事设置</summary>
        ${!form.sourceId ? field('故事类型',select('bt-kind',form.kind,BEDTIME_TYPES.map(x=>[x,x])))+(form.kind==='自己说想听什么'?field('想听什么',input('bt-wish',form.wish,'text','maxlength="500"')):'')+field('剧情参考',select('bt-plot',form.plot,[['independent','独立故事'],['story','跟随正文上下文']]))+(form.plot==='story'?'<p class="hint">沿用正文中已有的世界书与记忆。</p>':toggle('world','参考世界书')+(form.world?btn('bt-lore','选择世界书条目','chip-button'):'')) : ''}
        ${field('长短',select('bt-minutes',form.minutes,[['3','约 3 分钟'],['8','约 8 分钟'],['15','约 15 分钟']]))}
        ${mixControls()}</details><div class="actions">${btn('bt-create',busy?(form.sourceId?'正在准备…':'正在写故事…'):form.sourceId?'开始朗读':'开始讲故事','primary',busy||!form.role?'disabled':'')}</div></div>
        ${saved.length?`<div class="bt-recent"><h3>最近讲过</h3>${btn('bt-library','查看全部','text-button')}</div><div class="bedtime-stories"></div>`:''}</section>`);
      const details=v.root.querySelector('[data-bt-settings]');
      details.ontoggle=()=>{if(details.isConnected)settingsOpen=details.open;};
    }
    paintList();
  }
  v.on('click','[data-action=bt-lore]',async()=>{
    const d=ctx.dialog('睡前故事读哪些世界书','正在读取…');
    try {
      const chat = api.getState().chat;
      const presetBooks = chat.presets.find(p => p.id === chat.activePreset)?.loreExtraBooks || [];
      const read = () => api.loreBooks({full:true, extra:[...new Set([...presetBooks, ...form.extraBooks])]});
      let books = await read();
      if (!d.live) return;
      const check = (key, id, title) => `<input class="switch" type="checkbox" data-bt-skip="${key}" value="${esc(id)}" aria-label="读${esc(title)}" ${form[key].includes(id) ? '' : 'checked'}>`;
      function paint() {
        d.body.innerHTML = `<div class="lore-list">${books.map(book => `<details class="lore-book"><summary><span class="row-text"><strong>${esc(book.name)}</strong><small>${book.entries.length} 条</small></span>${check('skipBooks',book.name,book.name)}</summary>
          <div>${book.entries.map(entry => `<details class="bt-lore-entry"><summary><span class="row-text">${esc(entry.title)}</span>${check('skipEntries',entry.id,entry.title)}</summary><p class="bt-entry-text">${esc(entry.content || entry.preview)}</p></details>`).join('') || '<p class="hint">这本书没有启用的条目。</p>'}</div></details>`).join('') || '<p class="hint">还没有选世界书</p>'}</div>
          ${btn('bt-add-lore','添加世界书','chip-button')}`;
        sync();
      }
      d.body.onclick = async event => {
        const add = event.target.closest('[data-action=bt-add-lore]');
        if (!add) return;
        add.disabled = true;
        try {
          const names = (await api.loreNames()).filter(name => !books.some(book => book.name === name));
          if (!d.live) return;
          if (!names.length) { ctx.notify('可用的世界书已全部列出'); return; }
          const name = await menu(ctx, '添加到睡前故事', names.map(name => ({key:name, label:name, icon:'book'})), {over:true});
          if (!name || !d.live) return;
          form.extraBooks = [...new Set([...form.extraBooks, name])];
          remember();
          books = await read();
          if (d.live) paint();
        } catch (error) { ctx.notify(error.message, {error:true}); }
        finally { add.disabled = false; }
      };
      d.body.onchange=e=>{
        const key=e.target.dataset.btSkip;if(!key)return;
        const skips=new Set(form[key]);if(e.target.checked)skips.delete(e.target.value);else skips.add(e.target.value);
        form[key]=[...skips];remember();sync();
      };
      function sync(){for(const group of d.body.querySelectorAll('.lore-book'))for(const item of group.querySelectorAll('[data-bt-skip=skipEntries]'))item.disabled=!group.querySelector('[data-bt-skip=skipBooks]').checked;}
      paint();
    }catch(error){d.body.textContent=error.message;}
  });
  let settingsOpen=false;
  v.on('click','[data-action=bt-library]',()=>{library=true;render();});
  v.on('click','[data-action=bt-home]',()=>{library=false;render();});
  v.root.addEventListener('input',e=>{if(e.target.dataset.field==='bt-search'){search=e.target.value;paintList();}});
  v.root.addEventListener('change',async e=>{
    if(e.target.dataset.field==='bt-narrator'){narrator=e.target.value;paintList();return;}
    const key=e.target.dataset.btOpt;
    if(!['world','effects'].includes(key))return;
    form[key]=e.target.checked;remember();if(key==='world')render();
    if(key==='effects' && status().playing)try{await api.bedtimeMix({effects:form.effects});}catch(error){ctx.notify(error.message,{error:true});}
  });
  async function loadSource() {
    const mine = ++ticket;
    if (!form.sourceId) { source = null; return; }
    const result = await api.bedtimeSource(form.sourceId, Number(form.chapter));
    if (mine === ticket) { source = result; form.chapter = String(result.chapter); form.paragraph = '0'; }
  }
  async function open() {
    active = true;
    [saved, books, songs] = await Promise.all([api.listBooks(), api.listReadingBooks(), api.listSongs()]);
    saved = saved.filter(b => b.bedtime).sort((a,b)=>b.made-a.made); books = books.filter(b => b.type !== 'comic');
    roles = api.bedtimeRoles?.() || [];
    if (!form.role) form.role = roles[0]?.name || '';
    render();
  }
  v.root.addEventListener('change', async e => {
    const key = e.target.dataset.field?.replace(/^bt-/, '');
    if (!e.target.dataset.field?.startsWith('bt-') || !(key in form)) return;
    form[key] = e.target.value;
    try { if(key==='plot')remember(); if(key==='song'){remember();if(status().playing)await api.bedtimeMix({song:form.song});return;} if (key === 'sourceId' || key === 'chapter') { if (key === 'sourceId') form.chapter = '0'; await loadSource(); } render(); }
    catch (e) { ctx.notify(e.message, {error: true}); }
  });
  v.root.addEventListener('input', e => { if (e.target.dataset.field === 'bt-wish') form.wish = e.target.value; });
  v.on('click', '[data-action=bt-create]', async () => {
    if (creating || status().busy) return;
    creating = true; render();
    try { const book = await api.bedtimeCreate({...form}); if (active) { await open(); if (active) play(book.id); } }
    finally { creating = false; render(); }
  });
  async function act(key, ids) {
    if (key === 'delete') {
      if (!await ctx.confirm(`删除这 ${ids.length} 个故事？`, '删除后无法恢复。')) return;
      if (ids.includes(status().id)) api.bedtimeStop();
      for (const id of ids) await api.deleteBook(id);
      await open(); return;
    }
    const kind = await menu(ctx, '下载故事', [{key: 'text', label: '故事文字', icon: 'notes'}, {key: 'audio', label: '讲述音频（WAV）', icon: 'listen', note: '不含背景音乐和音效；未缓存的语音会使用引擎额度生成'}]);
    if (!kind) return;
    const files = [];
    for (const id of ids) {
      const book = await api.getBook(id); if (!book?.bedtime) continue;
      let blob;
      if (kind === 'text') blob = new Blob([book.title + '\n\n' + book.bedtime.steps.filter(s => s.kind === 'say').map(s => s.translation || s.text).join('\n\n')], {type: 'text/plain'});
      else {
        ctx.notify(`正在准备《${book.title}》的声音…`);
        const clips = [];
        for (const b of await api.bedtimeAudio(id)) clips.push(await decodeMono(ctx.win, b, 24000));
        if (!clips.length) throw Error('这个故事还没有可下载的声音');
        blob = encodeWav(joinClips(clips, 24000, .35), 24000);
      }
      files.push({name: `${files.length + 1}-${book.title.replace(/[\\/:*?"<>|]/g, ' ')}.${kind === 'text' ? 'txt' : 'wav'}`, blob});
    }
    if (!files.length) return;
    await saveFile(ctx.doc, files.length === 1 ? files[0].blob : await zipFiles(files), files.length === 1 ? files[0].name : '睡前故事.zip');
  }
  function play(id) { api.bedtimePlay(id, {effects: form.effects, song: form.song}).catch(e => ctx.notify(e.message, {error: true})); }
  v.on('click', '[data-action=bt-play]', el => play(el.dataset.id));
  const update = () => render();
  const off = api.subscribe?.(e => { if (e.type === 'bedtime') update(); });
  v.onBedtime = update;
  return {open, leave() { active = false; api.bedtimeStop?.(); playingId = ''; swipes?.dispose(); swipes = null; v.root.classList.remove('bedtime-dark'); }, dispose() { if(active)api.bedtimeStop?.();active = false; swipes?.dispose(); off?.(); }};
}
