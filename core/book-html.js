// 网页绘本: a book as one .html file that opens in any browser — the same views as the reader (core/book-pages.js): a
// spread at a time where the screen is wide, a page at a time where it is tall, turned with a tap, a swipe, the arrow
// keys or the wheel; the weather of each spread drawn over it (vn-fx.js comes inside the file); and (when the book was
// read aloud for it) each spread's reading inside it too, played with 朗读 on — the line being read marked, a page
// turned when the reading comes to its words — turning on when it ends. Pictures are kept once each and put into the
// pages when shown. Nothing outside the file is needed.
import {BOOK_CSS, themeStyle, viewsOf, viewMarkup, viewWords, directionOf, fitWords} from './book-pages.js';
import {sheetCount, sheetOf} from './book.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
/** JSON safe inside a <script>. */
const json = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * The file's text. url(picture) / sprite(name, emotion): where a picture or a 立绘 is in `images`, as "bk:N" ('' when
 * there is none); images: data: URLs; sounds: [data URL | ''] by sheet (its words read in order: the title on the
 * cover, the ending on the last page); fx: the effects' code (vn-fx.js as it is), so the weather is drawn in the file
 * too ('' leaves it out).
 */
export function bookHtml(book, {url = () => '', sprite = () => '', images = [], sounds = [], fx = ''} = {}) {
  const n = sheetCount(book);
  // What each sheet says, by its words' places (how long each is: the reading is marked by its time).
  const text = Array.from({length: n}, (_, i) => { const s = sheetOf(book, i); return s.kind === 'spread' ? s.spread.words.map(w => w.text.length) : s.kind === 'cover' ? [book.title.length] : book.ending ? [book.ending.length] : []; });
  const pack = wide => viewsOf(book, wide).map(v => ({s: v.sheet, w: sheetOf(book, v.sheet).kind === 'spread' ? viewWords(book, v) : text[v.sheet].length ? [0] : [],
    m: viewMarkup(book, v, {url, sprite}).replace(/src="bk:(\d+)"/g, 'data-img="$1"')}));
  const weather = Array.from({length: n}, (_, i) => directionOf(book, i).fx);
  const engine = String(fx || '').replace(/^export\s+/gm, '').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(book.title)}</title>
<style>${BOOK_CSS}
html,body{margin:0;height:100%;overflow:hidden;background:#16141b;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;-webkit-tap-highlight-color:transparent}
.desk{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 40%,color-mix(in srgb,var(--bk-soft) 40%,#2a2732),#121016 75%)}
.book{position:fixed}
.sky{position:fixed;pointer-events:none;z-index:6}
.sky .vn-fx{position:absolute;inset:0;width:100%;height:100%}
.slot{position:absolute;top:0;bottom:0;overflow:hidden;box-shadow:0 18px 50px -12px rgba(0,0,0,.65);border-radius:4px}
.slot[data-side=one],.slot[data-side=wide]{left:0;right:0}.slot[data-side=lone]{left:25%;width:50%;border-radius:3px 8px 8px 3px}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:9;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px max(12px,env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.65));transition:opacity .3s}
body.quiet .bar{opacity:0;pointer-events:none}
.bar button{font:inherit;font-size:14px;font-weight:700;border:0;border-radius:999px;min-width:40px;height:40px;padding:0 14px;background:rgba(255,255,255,.18);color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.bar button svg{width:16px;height:16px;fill:currentColor}
.bar button[aria-pressed=true]{background:#fff;color:#222}
.bar button[hidden]{display:none}
.where{color:#fff;font-size:13px;font-weight:700;min-width:64px;text-align:center}
</style></head><body style="${themeStyle(book.theme)}">
<div class="desk"></div><main class="book" id="book" aria-live="polite"></main><div class="sky" id="sky"></div>
<nav class="bar"><button id="prev" aria-label="上一页">‹</button><span class="where" id="where"></span><button id="next" aria-label="下一页">›</button><button id="read" aria-pressed="false"${sounds.some(Boolean) ? '' : ' hidden'}></button></nav>
${engine ? `<script>${engine}\nwindow.__fx={createFx,FX_KINDS};</script>` : ''}
<script>
const VW=${json(pack(true))},VT=${json(pack(false))},IMG=${json(images)},SND=${json(sounds)},TEXT=${json(text)},FXS=${json(weather)},LAST=${n - 1};
${fitWords}
const PLAY='<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',PAUSE='<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
const book=document.getElementById('book'),skyEl=document.getElementById('sky'),where=document.getElementById('where'),readBtn=document.getElementById('read');
const still=matchMedia('(prefers-reduced-motion: reduce)').matches,fx=window.__fx?window.__fx.createFx({doc:document,host:skyEl,lite:matchMedia('(pointer: coarse)').matches}):null;
let two=null,list=[],at=0,reading=false,playing=null,turn=0,quietTimer=0,busy=null,carry=false;
readBtn.innerHTML=PLAY+'朗读';
function size(){const W=innerWidth,H=innerHeight,w2=W/H>1.15&&W>=560;let w,h;
if(w2){const m=Math.min(28,W*.03);w=Math.min(W-2*m,(H-2*m)*1.5);h=w/1.5;}else{const m=W/H>.86?16:0,a=Math.min(.8,Math.max(.6,(W-2*m)/(H-2*m)));h=Math.min(H-2*m,(W-2*m)/a);w=h*a;}
const box={width:w+'px',height:h+'px',left:(W-w)/2+'px',top:(H-h)/2+'px'};Object.assign(book.style,box);Object.assign(skyEl.style,box);if(fx)fx.resize();
if(w2!==two){const keep=list[at]?list[at].s:0;two=w2;list=two?VW:VT;at=Math.max(0,list.findIndex(v=>v.s===keep));show(0);}else book.querySelectorAll('.slot').forEach(fitWords);}
function slot(i){const v=list[i],d=document.createElement('div');d.innerHTML=v.m;d.querySelectorAll('img[data-img]').forEach(im=>{im.src=IMG[im.dataset.img];});const b=d.firstElementChild;b.classList.add('pre');
const s=document.createElement('div');s.className='slot';s.dataset.side=!two?'one':v.s===0||v.s===LAST?'lone':'wide';s.append(b);return s;}
function on(s){requestAnimationFrame(()=>{const b=s.firstElementChild;b.classList.remove('pre');b.classList.add('on');});}
function anim(n,f,o){return n.animate?n.animate(f,Object.assign({duration:620,easing:'cubic-bezier(.4,.05,.25,1)',fill:'both'},o||{})):null;}
/* The new view comes in: a spread fades in over the one before; a page, the old one turns away (or, going back, the new one turns back over it). */
function show(dir){
  if(busy)busy();
  const v=list[at],old=[...book.children],fresh=slot(at);
  where.textContent=at===0?'封面':at===list.length-1?'完':at+' / '+(list.length-2);
  if(fx)fx.weather(FXS[v.s].filter(k=>window.__fx.FX_KINDS.includes(k)));
  let done=false,t=0;const end=()=>{if(done)return;done=true;clearTimeout(t);book.replaceChildren(fresh);on(fresh);busy=null;const c=carry;carry=false;if(reading&&!c)readHere();};
  busy=end;
  if(!dir||still||!old.length){book.replaceChildren(fresh);fitWords(fresh);end();return;}
  if(two){book.replaceChildren(...old,fresh);fitWords(fresh);anim(fresh,[{opacity:0},{opacity:1}],{duration:600,easing:'ease'});t=setTimeout(end,630);return;}
  if(dir>0){book.replaceChildren(fresh,...old);fitWords(fresh);old.forEach(s=>{s.style.transformOrigin='left center';anim(s,[{transform:'none',opacity:1},{transform:'perspective(1800px) rotateY(-96deg)',opacity:.2}]);});}
  else{book.replaceChildren(...old,fresh);fitWords(fresh);fresh.style.transformOrigin='left center';anim(fresh,[{transform:'perspective(1800px) rotateY(-96deg)',opacity:.2},{transform:'none',opacity:1}]);}
  t=setTimeout(end,650);
}
function go(n){if(n<0||n>=list.length||n===at)return false;const d=n>at?1:-1;at=n;stopSound();turn++;carry=false;show(d);return true;}
function stopSound(){if(playing){playing.pause();playing=null;}mark(-1);}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function mark(k){book.querySelectorAll('.bk [data-k].now').forEach(n=>n.classList.remove('now'));if(k>=0)book.querySelectorAll('.bk [data-k="'+k+'"]').forEach(n=>n.classList.add('now'));}
/* A sheet's reading: the line it has come to marked (by its time); when that line is on the next page, the page turns. */
function play(s){return new Promise(r=>{const a=new Audio(SND[s]),lens=TEXT[s],total=lens.reduce((x,y)=>x+y,0)||1;playing=a;
  const tick=()=>{if(!a.duration||!isFinite(a.duration))return;const f=a.currentTime/a.duration*total;let k=0,acc=0;while(k<lens.length-1&&acc+lens[k]<=f){acc+=lens[k];k++;}
    const nx=list[at+1];if(!list[at].w.includes(k)&&nx&&nx.s===s&&nx.w.includes(k)){carry=true;at++;show(1);}if(list[at].s===s&&list[at].w.length)mark(k);};
  const done=ok=>{mark(-1);r(ok);};
  a.ontimeupdate=tick;a.onended=()=>done(true);a.onerror=()=>done(false);a.play().then(tick).catch(()=>done(false));});}
async function readHere(){const me=++turn;stopSound();const v=list[at],s=v.s,first=list.findIndex(x=>x.s===s&&x.w.length)===at;
  if(!v.w.length)await wait(2600);else if(first&&SND[s])await play(s);else await wait(Math.min(9000,2600+v.w.reduce((n,k)=>n+(TEXT[s][k]||0),0)*120));
  if(me!==turn||!reading)return;if(at>=list.length-1){toggle(false);return;}await wait(700);if(me===turn&&reading){at++;show(1);}}
function toggle(v){reading=v;turn++;readBtn.setAttribute('aria-pressed',String(v));readBtn.innerHTML=v?PAUSE+'停':PLAY+'朗读';if(v){document.body.classList.add('quiet');readHere();}else stopSound();}
function step(d){go(at+d);}
function later(){clearTimeout(quietTimer);quietTimer=setTimeout(()=>document.body.classList.add('quiet'),3200);}
document.getElementById('prev').onclick=e=>{e.stopPropagation();step(-1);later();};document.getElementById('next').onclick=e=>{e.stopPropagation();step(1);later();};readBtn.onclick=e=>{e.stopPropagation();toggle(!reading);};
let x0=null,y0=0;addEventListener('pointerdown',e=>{if(e.target.closest('.bar'))return;x0=e.clientX;y0=e.clientY;});
addEventListener('pointerup',e=>{if(x0==null)return;const dx=e.clientX-x0,dy=e.clientY-y0;x0=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){step(dx<0?1:-1);return;}if(Math.abs(dx)>12||Math.abs(dy)>12)return;const x=e.clientX/innerWidth;if(x<.3)step(-1);else if(x>.7)step(1);else{document.body.classList.toggle('quiet');later();}});
let wheelAt=0;addEventListener('wheel',e=>{const t=Date.now();if(t-wheelAt<450||Math.abs(e.deltaY)<8)return;wheelAt=t;step(e.deltaY>0?1:-1);},{passive:true});
addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();step(1);}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();step(-1);}});
addEventListener('resize',size);size();later();
</script></body></html>`;
}
