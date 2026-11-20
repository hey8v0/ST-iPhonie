import {esc, heading, field, select, input, btn, menu} from './common.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {saveFile, zipFiles} from '../download.js';
import {decodeMono, joinClips, encodeWav} from '../core/audio-join.js';
import {BEDTIME_TYPES} from '../core/bedtime.js';
import {icon} from './icons.js';

export const bookTabs = bedtime => `<div class="segmented" aria-label="绘本板块">${btn('bk-shelf', '书架', '', `aria-pressed="${!bedtime}"`)}${btn('bk-bedtime', '睡前故事', '', `aria-pressed="${bedtime}"`)}</div>`;

export function bedtimeView(ctx, v) {
  const {api} = ctx;
  let active = false, hidden = false, books = [], saved = [], songs = [], roles = [], source = null, ticket = 0, creating = false, swipes = null;
  const actions = [{key: 'download', label: '下载', icon: 'download'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}];
  const form = {role: '', kind: '睡前故事', minutes: '3', wish: '', sourceId: '', chapter: '0', paragraph: '0', song: '', effects: true, world: true, recent: false};
  const status = () => api.bedtimeStatus?.() || {playing: false};
  let library = false, narrator = '', search = '', follow = true, playingId = '', currentLine = -1;
  try { const prefs = JSON.parse(ctx.win.localStorage.getItem('stiphonie.bedtime.preferences') || '{}');
    for (const key of ['world','recent','effects']) if (typeof prefs[key] === 'boolean') form[key] = prefs[key];
    if (typeof prefs.song === 'string') form.song = prefs.song;
  } catch {}
  function remember() {
    const {world,recent,effects,song} = form;
    try { ctx.win.localStorage.setItem('stiphonie.bedtime.preferences', JSON.stringify({world,recent,effects,song})); } catch {}
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
      const lines=book.bedtime.steps.map((step,i)=>step.kind==='say'?`<p data-bt-line="${i}">${esc(step.translation||step.text)}</p>`:'').join('');
      v.draw(`<section class="bt-player bedtime-sky"><header><small>${esc(book.bedtime.role)}正在讲</small><h2>${esc(book.title)}</h2></header><div class="bt-transcript" tabindex="0">${lines}</div>
        <button type="button" class="bt-follow" hidden>回到正在讲的段落</button><div class="bt-controls">${btn('bt-hide',icon('eye'),'round-button','aria-label="调暗阅读界面"')}${btn('bt-stop',icon('stop'),'round-button','aria-label="结束播放"')}<details><summary>声音</summary>${mixControls()}</details></div></section>`);
      const pane=v.root.querySelector('.bt-transcript'), resume=v.root.querySelector('.bt-follow');
      const pause=()=>{follow=false;resume.hidden=false;};
      for(const event of ['touchmove','wheel','keydown','pointerdown']) pane.addEventListener(event,pause,{passive:true});
      resume.onclick=()=>{follow=true;resume.hidden=true;currentLine=-1;playback(status(),book);};
      pane.onclick=()=>{if(hidden) setNight(false);};
      setNight(hidden);
    }
    let index=now.index;
    while(index>=0 && book.bedtime.steps[index]?.kind!=='say') index--;
    if(index===currentLine) return;
    v.root.querySelector('[data-bt-line].current')?.classList.remove('current');
    currentLine=index;
    const line=v.root.querySelector(`[data-bt-line="${index}"]`);
    line?.classList.add('current');
    if(follow && line) {
      const pane=line.parentElement;
      pane.scrollTop+=line.getBoundingClientRect().top-pane.getBoundingClientRect().top-pane.clientHeight*.28;
    }
  }
  function setNight(value) {
    hidden=value;
    const player=v.root.querySelector('.bt-player'), eye=player?.querySelector('[data-action=bt-hide]');
    player?.classList.toggle('bt-dim',value);
    if(eye){eye.setAttribute('aria-pressed',String(value));eye.setAttribute('aria-label',value?'恢复阅读亮度':'调暗阅读界面');eye.innerHTML=icon(value?'eyeClosed':'eye');}
  }
  function render() {
    if (!active || v.disposed) return;
    const now=status(), book=saved.find(b=>b.id===now.id);
    if(now.playing && book){playback(now,book);return;}
    playingId='';hidden=false;
    if(library){
      v.draw(heading('讲过的故事',btn('bt-home','返回','chip-button'))+`<div class="bedtime-form">${field('找故事',input('bt-search',search,'search','placeholder="搜索标题"'))}${field('讲述者',select('bt-narrator',narrator,[['','全部'],...Array.from(new Set(saved.map(b=>b.bedtime.role)),r=>[r,r])]))}</div><div class="bedtime-stories"></div>`);
    }else{
      const busy=now.busy||creating;
      v.draw(heading('睡前故事')+bookTabs(true)+`<section class="bedtime-room"><div class="bedtime-sky bt-cover"><span class="bedtime-moon"></span><h2>今晚听什么</h2></div><div class="bedtime-form">
        ${field('讲故事的人',select('bt-role',form.role,[['','选择讲述者'],...roles.map(r=>[r.name,r.name])]))}
        ${field('听什么',select('bt-sourceId',form.sourceId,[['','讲一个新的'],...books.map(b=>[b.id,b.title])]))}
        ${form.sourceId && source ? field('从哪一章',select('bt-chapter',form.chapter,source.chapters.map((t,i)=>[String(i),t])))+field('从哪一段',select('bt-paragraph',form.paragraph,source.paragraphs.map((p,i)=>[String(i),p.slice(0,32)]))) : ''}
        <details data-bt-settings ${settingsOpen?'open':''}><summary>故事设置</summary>
        ${!form.sourceId ? field('故事类型',select('bt-kind',form.kind,BEDTIME_TYPES.map(x=>[x,x])))+(form.kind==='自己说想听什么'?field('想听什么',input('bt-wish',form.wish,'text','maxlength="500"')):'')+toggle('world','参考世界书')+toggle('recent','接着近期剧情讲') : ''}
        ${field('长短',select('bt-minutes',form.minutes,[['3','约 3 分钟'],['8','约 8 分钟'],['15','约 15 分钟']]))}
        ${mixControls()}</details><div class="actions">${btn('bt-create',busy?(form.sourceId?'正在准备…':'正在写故事…'):form.sourceId?'开始朗读':'开始讲故事','primary',busy||!form.role?'disabled':'')}</div></div>
        ${saved.length?`<div class="bt-recent"><h3>最近讲过</h3>${btn('bt-library','查看全部','text-button')}</div><div class="bedtime-stories"></div>`:''}</section>`);
      const details=v.root.querySelector('[data-bt-settings]');
      details.ontoggle=()=>{if(details.isConnected)settingsOpen=details.open;};
    }
    paintList();
  }
  let settingsOpen=false;
  v.on('click','[data-action=bt-library]',()=>{library=true;render();});
  v.on('click','[data-action=bt-home]',()=>{library=false;render();});
  v.root.addEventListener('input',e=>{if(e.target.dataset.field==='bt-search'){search=e.target.value;paintList();}});
  v.root.addEventListener('change',async e=>{
    if(e.target.dataset.field==='bt-narrator'){narrator=e.target.value;paintList();return;}
    const key=e.target.dataset.btOpt;
    if(!['world','recent','effects'].includes(key))return;
    form[key]=e.target.checked;remember();
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
    try { if(key==='song'){remember();if(status().playing)await api.bedtimeMix({song:form.song});return;} if (key === 'sourceId' || key === 'chapter') { if (key === 'sourceId') form.chapter = '0'; await loadSource(); } render(); }
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
  v.on('click', '[data-action=bt-stop]', () => { api.bedtimeStop(); hidden = false; render(); });
  v.on('click', '[data-action=bt-hide]', () => { setNight(!hidden); });
  const update = () => { if (hidden && !status().playing) hidden = false; render(); };
  const off = api.subscribe?.(e => { if (e.type === 'bedtime') update(); });
  v.onBedtime = update;
  return {open, leave() { active = false; hidden = false; playingId = ''; swipes?.dispose(); swipes = null; v.root.classList.remove('bedtime-dark'); }, dispose() { active = false; swipes?.dispose(); off?.(); }};
}
