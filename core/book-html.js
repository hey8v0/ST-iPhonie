// 网页绘本: a book as one .html file that opens in any browser — the same pages as the reader (core/book-pages.js), two
// at a time where the screen is wide, turned with a tap, a swipe, the arrow keys or the wheel; and (when the book was
// read aloud for it) each page's reading inside it too, played as the page opens with 朗读 on, turning the page when
// it ends. Pictures are kept once each and put into the pages when shown. Nothing outside the file is needed.
import {BOOK_CSS, themeStyle} from './book-pages.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
/** JSON safe inside a <script>. */
const json = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * The file's text. pages: each page's markup, its pictures written as src="bk:N" (N: the picture's place in
 * `images`, data: URLs); sounds: [data URL | ''] by page; book: {title, theme, pages} (a spread page takes two).
 */
export function bookHtml(book, {pages, images = [], sounds = []}) {
  const marks = pages.map(m => m.replace(/src="bk:(\d+)"/g, 'data-k="$1"'));
  const wide = book.pages.map(p => p.layout === 'spread');
  const chars = book.pages.map(p => [...p.texts, ...p.lines].reduce((n, x) => n + x.text.length, 0));
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(book.title)}</title>
<style>${BOOK_CSS}
html,body{margin:0;height:100%;overflow:hidden;background:#16141b;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;-webkit-tap-highlight-color:transparent}
.desk{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 40%,color-mix(in srgb,var(--bk-soft) 40%,#2a2732),#121016 75%)}
.book{position:fixed}
.slot{position:absolute;top:0;bottom:0;overflow:hidden;opacity:0;transition:opacity .5s ease,transform .55s cubic-bezier(.3,.1,.2,1);box-shadow:0 18px 50px -12px rgba(0,0,0,.65)}
.slot.in{opacity:1;transform:none!important}
.slot[data-side=one]{left:0;right:0}.slot[data-side=left]{left:0;width:50%}.slot[data-side=right]{left:50%;width:50%}.slot[data-side=wide]{left:0;right:0}.slot[data-side=lone]{left:25%;width:50%}
.slot[data-side=left]::after,.slot[data-side=right]::after{content:'';position:absolute;top:0;bottom:0;width:12%;pointer-events:none;z-index:9}
.slot[data-side=left]::after{right:0;background:linear-gradient(90deg,transparent,rgba(0,0,0,.22))}.slot[data-side=right]::after{left:0;background:linear-gradient(90deg,rgba(0,0,0,.26),transparent)}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:9;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px max(12px,env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.65));transition:opacity .3s}
body.quiet .bar{opacity:0;pointer-events:none}
.bar button{font:inherit;font-size:14px;font-weight:700;border:0;border-radius:999px;min-width:40px;height:40px;padding:0 14px;background:rgba(255,255,255,.18);color:#fff;cursor:pointer}
.bar button[aria-pressed=true]{background:#fff;color:#222}
.where{color:#fff;font-size:13px;font-weight:700;min-width:64px;text-align:center}
</style></head><body style="${themeStyle(book.theme)}">
<div class="desk"></div><main class="book" id="book" aria-live="polite"></main>
<nav class="bar"><button id="prev" aria-label="上一页">‹</button><span class="where" id="where"></span><button id="next" aria-label="下一页">›</button><button id="read" aria-pressed="false"${sounds.some(Boolean) ? '' : ' hidden'}>▶ 朗读</button></nav>
<script>
const PAGES=${json(marks)},IMG=${json(images)},SND=${json(sounds)},WIDE=${json(wide)},CHARS=${json(chars)};
const book=document.getElementById('book'),where=document.getElementById('where'),readBtn=document.getElementById('read');
let two=null,list=[],at=0,reading=false,playing=null,turn=0,quietTimer=0;
function openings(t){if(!t)return PAGES.map((_,i)=>[i]);const o=[[0]];for(let i=1;i<PAGES.length;){if(WIDE[i]||i===PAGES.length-1){o.push([i]);i++;continue;}if(WIDE[i+1]){o.push([i]);i++;continue;}o.push([i,i+1]);i+=2;}return o;}
function page(i){const d=document.createElement('div');d.innerHTML=PAGES[i];d.querySelectorAll('img[data-k]').forEach(im=>{im.src=IMG[im.dataset.k];});return d.firstElementChild;}
function fit(p){const b=p&&p.querySelector('.bkp-prose');if(!b)return;let k=1;b.style.fontSize='';while(b.scrollHeight>b.clientHeight+1&&k>.6){k-=.05;b.style.fontSize='calc(4.2cqmin * '+k.toFixed(2)+')';}}
function size(){const W=innerWidth,H=innerHeight,w2=W/H>1.15&&W>=560;let w,h;if(w2){const m=Math.min(28,W*.03);w=Math.min(W-2*m,(H-2*m)*1.5);h=w/1.5;}else if(W/H>.86){h=Math.min(H-32,(W-32)/.75);w=h*.75;}else{w=W;h=H;}
Object.assign(book.style,{width:w+'px',height:h+'px',left:(W-w)/2+'px',top:(H-h)/2+'px'});if(w2!==two){const keep=list[at]?list[at][0]:0;two=w2;list=openings(two);at=Math.max(0,list.findIndex(o=>o.includes(keep)));show(0);}}
function show(dir){const o=list[at],old=[...book.children];const fresh=o.map((i,k)=>{const s=document.createElement('div');s.className='slot';s.dataset.side=!two?'one':o.length===2?(k?'right':'left'):WIDE[i]?'wide':'lone';if(dir)s.style.transform='translateX('+(dir*4)+'%)';s.append(page(i));return s;});
book.append(...fresh);fresh.forEach(s=>fit(s.firstElementChild));requestAnimationFrame(()=>requestAnimationFrame(()=>{fresh.forEach(s=>{s.classList.add('in');s.firstElementChild.classList.add('on');});old.forEach(s=>{s.classList.remove('in');s.style.transform='translateX('+(-dir*4)+'%)';});}));setTimeout(()=>old.forEach(s=>s.remove()),560);
where.textContent=(o.length===2?(o[0]+1)+'-'+(o[1]+1):(o[0]+1))+' / '+PAGES.length;}
function go(n,keep){if(n<0||n>=list.length||n===at)return false;const d=n>at?1:-1;at=n;show(d);if(reading&&!keep)readHere();return true;}
function stopSound(){if(playing){playing.pause();playing=null;}}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function play(src){return new Promise(r=>{const a=new Audio(src);playing=a;a.onended=()=>r(true);a.onerror=()=>r(false);a.play().catch(()=>r(false));});}
async function readHere(){const me=++turn;stopSound();for(const i of list[at]){if(SND[i]){await play(SND[i]);}else await wait(Math.min(9000,2600+CHARS[i]*120));if(me!==turn||!reading)return;}
if(at>=list.length-1){toggle(false);return;}await wait(700);if(me===turn&&reading){go(at+1,true);readHere();}}
function toggle(on){reading=on;turn++;readBtn.setAttribute('aria-pressed',String(on));readBtn.textContent=on?'❚❚ 停':'▶ 朗读';if(on){document.body.classList.add('quiet');readHere();}else stopSound();}
function step(d){if(reading){turn++;stopSound();}go(at+d);}
function later(){clearTimeout(quietTimer);quietTimer=setTimeout(()=>document.body.classList.add('quiet'),3200);}
document.getElementById('prev').onclick=e=>{e.stopPropagation();step(-1);later();};document.getElementById('next').onclick=e=>{e.stopPropagation();step(1);later();};readBtn.onclick=e=>{e.stopPropagation();toggle(!reading);};
let x0=null,y0=0;addEventListener('pointerdown',e=>{if(e.target.closest('.bar'))return;x0=e.clientX;y0=e.clientY;});
addEventListener('pointerup',e=>{if(x0==null)return;const dx=e.clientX-x0,dy=e.clientY-y0;x0=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){step(dx<0?1:-1);return;}if(Math.abs(dx)>12||Math.abs(dy)>12)return;const x=e.clientX/innerWidth;if(x<.3)step(-1);else if(x>.7)step(1);else{document.body.classList.toggle('quiet');later();}});
let wheelAt=0;addEventListener('wheel',e=>{const n=Date.now();if(n-wheelAt<450||Math.abs(e.deltaY)<8)return;wheelAt=n;step(e.deltaY>0?1:-1);},{passive:true});
addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();step(1);}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();step(-1);}});
addEventListener('resize',size);size();later();
</script></body></html>`;
}
