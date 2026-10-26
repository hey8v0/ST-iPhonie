// 网页绘本: a book as one .html file that opens in any browser — the same pages as the reader (core/book-pages.js), two
// at a time where the screen is wide, turned with a tap, a swipe, the arrow keys or the wheel, each page performed as
// in the reader: turned to its own way, its weather drawn over it (vn-fx.js comes inside the file), its light, camera
// and words coming in; and (when the book was read aloud for it) each page's reading inside it too, played as the page
// opens with 朗读 on — the words coming in as it is read — turning the page when it ends. Pictures are kept once each
// and put into the pages when shown. Nothing outside the file is needed.
import {BOOK_CSS, themeStyle} from './book-pages.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
/** JSON safe inside a <script>. */
const json = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * The file's text. pages: each page's markup, its pictures written as src="bk:N" (N: the picture's place in
 * `images`, data: URLs); sounds: [data URL | ''] by page; book: {title, theme, pages} (a spread page takes two); fx: the
 * effects' code (vn-fx.js as it is), so the weather is drawn in the file too ('' leaves it out).
 */
export function bookHtml(book, {pages, images = [], sounds = [], fx = ''}) {
  const marks = pages.map(m => m.replace(/src="bk:(\d+)"/g, 'data-k="$1"'));
  const wide = book.pages.map(p => p.layout === 'spread');
  const chars = book.pages.map(p => [...p.texts, ...p.lines].reduce((n, x) => n + x.text.length, 0));
  const engine = String(fx || '').replace(/^export\s+/gm, '').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(book.title)}</title>
<style>${BOOK_CSS}
html,body{margin:0;height:100%;overflow:hidden;background:#16141b;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;-webkit-tap-highlight-color:transparent}
.desk{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 40%,color-mix(in srgb,var(--bk-soft) 40%,#2a2732),#121016 75%)}
.book{position:fixed;perspective:2400px}
.sky{position:fixed;pointer-events:none;z-index:6}
.sky .vn-fx{position:absolute;inset:0;width:100%;height:100%}
.slot{position:absolute;top:0;bottom:0;overflow:hidden;box-shadow:0 18px 50px -12px rgba(0,0,0,.65)}
.slot[data-side=one]{left:0;right:0}.slot[data-side=left]{left:0;width:50%}.slot[data-side=right]{left:50%;width:50%}.slot[data-side=wide]{left:0;right:0}.slot[data-side=lone]{left:25%;width:50%}
.slot[data-side=left]::after,.slot[data-side=right]::after{content:'';position:absolute;top:0;bottom:0;width:12%;pointer-events:none;z-index:9}
.slot[data-side=left]::after{right:0;background:linear-gradient(90deg,transparent,rgba(0,0,0,.22))}.slot[data-side=right]::after{left:0;background:linear-gradient(90deg,rgba(0,0,0,.26),transparent)}
.veil{position:absolute;inset:0;z-index:5;pointer-events:none}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:9;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px max(12px,env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.65));transition:opacity .3s}
body.quiet .bar{opacity:0;pointer-events:none}
.bar button{font:inherit;font-size:14px;font-weight:700;border:0;border-radius:999px;min-width:40px;height:40px;padding:0 14px;background:rgba(255,255,255,.18);color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.bar button svg{width:16px;height:16px;fill:currentColor}
.bar button[aria-pressed=true]{background:#fff;color:#222}
.where{color:#fff;font-size:13px;font-weight:700;min-width:64px;text-align:center}
</style></head><body style="${themeStyle(book.theme)}">
<div class="desk"></div><main class="book" id="book" aria-live="polite"></main><div class="sky" id="sky"></div>
<nav class="bar"><button id="prev" aria-label="上一页">‹</button><span class="where" id="where"></span><button id="next" aria-label="下一页">›</button><button id="read" aria-pressed="false"${sounds.some(Boolean) ? '' : ' hidden'}></button></nav>
${engine ? `<script>${engine}\nwindow.__fx={createFx,FX_KINDS};</script>` : ''}
<script>
const PAGES=${json(marks)},IMG=${json(images)},SND=${json(sounds)},WIDE=${json(wide)},CHARS=${json(chars)};
const PLAY='<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',PAUSE='<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
const book=document.getElementById('book'),skyEl=document.getElementById('sky'),where=document.getElementById('where'),readBtn=document.getElementById('read');
const still=matchMedia('(prefers-reduced-motion: reduce)').matches,fx=window.__fx?window.__fx.createFx({doc:document,host:skyEl,lite:matchMedia('(pointer: coarse)').matches}):null;
let two=null,list=[],at=0,reading=false,playing=null,turn=0,quietTimer=0,busy=null;
readBtn.innerHTML=PLAY+'朗读';
function openings(t){if(!t)return PAGES.map((_,i)=>[i]);const o=[[0]];for(let i=1;i<PAGES.length;){if(WIDE[i]||i===PAGES.length-1){o.push([i]);i++;continue;}if(WIDE[i+1]){o.push([i]);i++;continue;}o.push([i,i+1]);i+=2;}return o;}
function page(i){const d=document.createElement('div');d.innerHTML=PAGES[i];d.querySelectorAll('img[data-k]').forEach(im=>{im.src=IMG[im.dataset.k];});return d.firstElementChild;}
function fit(p){const b=p&&p.querySelector('.bkp-prose');if(!b)return;let k=1;b.style.fontSize='';while(b.scrollHeight>b.clientHeight+1&&k>.6){k-=.05;b.style.fontSize='calc(4.2cqmin * '+k.toFixed(2)+')';}}
function size(){const W=innerWidth,H=innerHeight,w2=W/H>1.15&&W>=560;let w,h;if(w2){const m=Math.min(28,W*.03);w=Math.min(W-2*m,(H-2*m)*1.5);h=w/1.5;}else if(W/H>.86){h=Math.min(H-32,(W-32)/.75);w=h*.75;}else{w=W;h=H;}
const box={width:w+'px',height:h+'px',left:(W-w)/2+'px',top:(H-h)/2+'px'};Object.assign(book.style,box);Object.assign(skyEl.style,box);if(fx)fx.resize();
if(w2!==two){const keep=list[at]?list[at][0]:0;two=w2;list=openings(two);at=Math.max(0,list.findIndex(o=>o.includes(keep)));show(0);}}
function slots(o){return o.map((i,k)=>{const s=document.createElement('div');s.className='slot';s.dataset.side=!two?'one':o.length===2?(k?'right':'left'):WIDE[i]?'wide':'lone';s.append(page(i));return s;});}
function on(nodes){requestAnimationFrame(()=>nodes.forEach(s=>s.firstElementChild&&s.firstElementChild.classList.add('on')));}
function anim(n,f,o){return n.animate?n.animate(f,Object.assign({duration:650,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'},o||{})):null;}
/* The new pages come in their own way (the first one's data-turn); going back, they slide back. */
function show(dir){
  if(busy)busy();
  const o=list[at],old=[...book.children],fresh=slots(o);
  fresh.forEach(s=>fit(s.firstElementChild));
  where.textContent=(o.length===2?(o[0]+1)+'-'+(o[1]+1):(o[0]+1))+' / '+PAGES.length;
  if(fx){const kinds=[...new Set(fresh.flatMap(s=>(s.firstElementChild.dataset.fx||'').split(' ').filter(k=>window.__fx.FX_KINDS.includes(k))))].slice(0,2);if(kinds.length||fx.current)fx.weather(kinds);}
  const kind=dir>0?(fresh[0].firstElementChild.dataset.turn||'fade'):dir<0?'back':'';
  let done=false;const timers=[];const end=()=>{if(done)return;done=true;timers.forEach(clearTimeout);book.replaceChildren(...fresh);on(fresh);busy=null;if(reading)readHere();};
  busy=end;
  if(!kind||still||!old.length){end();return;}
  if(kind==='black'||kind==='white'){const v=document.createElement('div');v.className='veil';v.style.background=kind==='black'?'#000':'#fff';book.append(v);const a=kind==='black'?450:130,h=kind==='black'?260:70,b=kind==='black'?650:700;anim(v,[{opacity:0},{opacity:1}],{duration:a});
    timers.push(setTimeout(()=>{book.replaceChildren(...fresh,v);on(fresh);anim(v,[{opacity:1},{opacity:0}],{duration:b,easing:'ease-out'});},a+h));timers.push(setTimeout(()=>{v.remove();end();},a+h+b));return;}
  book.replaceChildren(...old,...fresh);
  const ms={fade:750,slide:620,zoom:680,iris:800,wipe:700,curl:700,back:620}[kind]||650;
  for(const f of fresh){
    if(kind==='slide')anim(f,[{transform:'translateX(100%)'},{transform:'none'}],{duration:ms,easing:'cubic-bezier(.2,.8,.2,1)'});
    else if(kind==='back')anim(f,[{transform:'translateX(-100%)'},{transform:'none'}],{duration:ms,easing:'cubic-bezier(.2,.8,.2,1)'});
    else if(kind==='zoom')anim(f,[{transform:'scale(1.14)',opacity:0},{transform:'none',opacity:1}],{duration:ms});
    else if(kind==='iris')anim(f,[{clipPath:'circle(0% at 50% 50%)'},{clipPath:'circle(150% at 50% 50%)'}],{duration:ms});
    else if(kind==='wipe')anim(f,[{clipPath:'inset(0 0 0 100%)'},{clipPath:'inset(0 0 0 0)'}],{duration:ms});
    else if(kind!=='curl')anim(f,[{opacity:0},{opacity:1}],{duration:ms});
  }
  /* The leaf: the old page turns away over the spine (one page) or slides off. */
  for(const s of old){book.append(s);if(kind==='curl'){s.style.transformOrigin=two?'50% 50%':'left center';anim(s,two?[{opacity:1},{opacity:0}]:[{transform:'none',opacity:1},{transform:'rotateY(-96deg)',opacity:.2}],{duration:ms});}else if(kind==='slide'||kind==='back')anim(s,[{transform:'none',opacity:1},{transform:'translateX('+(kind==='back'?30:-30)+'%)',opacity:.2}],{duration:ms});else anim(s,[{opacity:1},{opacity:kind==='zoom'?0:1}],{duration:ms});}
  timers.push(setTimeout(end,ms+30));
}
function go(n){if(n<0||n>=list.length||n===at)return false;const d=n>at?1:-1;at=n;stopSound();turn++;show(d);return true;}
function stopSound(){if(playing){playing.pause();playing=null;}}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
/* A page read aloud: its words come in as the reading goes. */
function play(src,el){return new Promise(r=>{const a=new Audio(src),ts=el?[...el.querySelectorAll('.bkp-t')].sort((x,y)=>x.dataset.k-y.dataset.k):[];playing=a;if(el&&ts.length)el.setAttribute('data-wait','');
  const go=()=>{if(!a.duration||!isFinite(a.duration))return;ts.forEach((t,j)=>{if(a.currentTime>=a.duration*j/(ts.length+.5))t.setAttribute('data-go','');});};
  const done=ok=>{ts.forEach(t=>t.setAttribute('data-go',''));if(el)el.removeAttribute('data-wait');r(ok);};
  a.ontimeupdate=go;a.onended=()=>done(true);a.onerror=()=>done(false);a.play().then(go).catch(()=>done(false));});}
async function readHere(){const me=++turn;stopSound();for(const i of list[at]){const el=book.querySelector('.slot:nth-child('+(list[at].indexOf(i)+1)+') .bkp');if(SND[i]){await play(SND[i],el);}else await wait(Math.min(9000,2600+CHARS[i]*120));if(me!==turn||!reading)return;}
if(at>=list.length-1){toggle(false);return;}await wait(700);if(me===turn&&reading){at++;show(1);}}
function toggle(v){reading=v;turn++;readBtn.setAttribute('aria-pressed',String(v));readBtn.innerHTML=v?PAUSE+'停':PLAY+'朗读';if(v){document.body.classList.add('quiet');readHere();}else{stopSound();book.querySelectorAll('.bkp[data-wait]').forEach(p=>{p.querySelectorAll('.bkp-t').forEach(t=>t.setAttribute('data-go',''));p.removeAttribute('data-wait');});}}
function step(d){go(at+d);}
function later(){clearTimeout(quietTimer);quietTimer=setTimeout(()=>document.body.classList.add('quiet'),3200);}
document.getElementById('prev').onclick=e=>{e.stopPropagation();step(-1);later();};document.getElementById('next').onclick=e=>{e.stopPropagation();step(1);later();};readBtn.onclick=e=>{e.stopPropagation();toggle(!reading);};
let x0=null,y0=0;addEventListener('pointerdown',e=>{if(e.target.closest('.bar'))return;x0=e.clientX;y0=e.clientY;});
addEventListener('pointerup',e=>{if(x0==null)return;const dx=e.clientX-x0,dy=e.clientY-y0;x0=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){step(dx<0?1:-1);return;}if(Math.abs(dx)>12||Math.abs(dy)>12)return;const x=e.clientX/innerWidth;if(x<.3)step(-1);else if(x>.7)step(1);else{document.body.classList.toggle('quiet');later();}});
let wheelAt=0;addEventListener('wheel',e=>{const n=Date.now();if(n-wheelAt<450||Math.abs(e.deltaY)<8)return;wheelAt=n;step(e.deltaY>0?1:-1);},{passive:true});
addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();step(1);}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();step(-1);}});
addEventListener('resize',size);size();later();
</script></body></html>`;
}
