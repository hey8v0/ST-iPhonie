// 网页绘本: a book as one .html file that opens in any browser — pages turned with a tap, a swipe or the arrow keys,
// the theme's look, the pictures inside it, and (when the book was read aloud) each page's reading inside it too,
// played as the page opens with 朗读 on, turning the page when it ends. Nothing outside the file is needed.
import {themeOf} from './book-themes.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/**
 * The file's text. book: {title, subtitle, author, theme, pages: [{kind, text, layout}]}; pictures: [data URL | '']
 * by page; sounds: [data URL | ''] by page (the page's reading, if any).
 */
export function bookHtml(book, pictures = [], sounds = []) {
  const t = themeOf(book.theme);
  const pages = book.pages.map((p, i) => {
    const pic = pictures[i] ? `<img src="${pictures[i]}" alt="">` : '';
    const words = String(p.text || '').split(/\n+/).filter(Boolean).map(x => `<p>${esc(x)}</p>`).join('');
    const body = p.kind === 'cover' ? `${pic}<div class="cover-title"><h1>${esc(book.title)}</h1>${book.subtitle ? `<h2>${esc(book.subtitle)}</h2>` : ''}<small>${esc(t.label)}绘本${book.author ? ' · ' + esc(book.author) : ''}</small></div>`
      : p.kind === 'chapter' ? `${pic ? `<div class="pic">${pic}</div>` : ''}<h2 class="chapter">${esc(p.text)}</h2>`
      : p.kind === 'end' ? `${pic ? `<div class="pic">${pic}</div>` : ''}<div class="end">${esc(p.text || '完')}</div>`
      : `${pic ? `<div class="pic">${pic}</div>` : ''}<div class="words">${words}</div>`;
    return `<section class="page ${p.kind} layout-${pic ? p.layout || t.layout : 'none'}" data-sound="${sounds[i] ? i : ''}">${body}${p.kind === 'page' ? `<span class="num">${i}</span>` : ''}</section>`;
  }).join('\n');
  const audio = sounds.map((s, i) => s ? `<audio id="a${i}" preload="none" src="${s}"></audio>` : '').join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(book.title)}</title>
<style>
:root{--paper:${t.paper};--ink:${t.ink};--accent:${t.accent};--soft:${t.soft};--font:${t.font}}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#2b2b33;font-family:var(--font);overflow:hidden}
.book{position:fixed;inset:0;display:grid;place-items:center;padding:16px}
.page{position:absolute;width:min(92vw,calc((100vh - 90px) * .75));aspect-ratio:3/4;background:var(--paper);color:var(--ink);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden;display:flex;flex-direction:column;padding:6% 7%;opacity:0;transform:perspective(1600px) rotateY(-12deg) translateX(30px);transition:opacity .45s,transform .45s;pointer-events:none}
.page.on{opacity:1;transform:none;pointer-events:auto}
.page.past{transform:perspective(1600px) rotateY(14deg) translateX(-30px)}
.pic{flex:0 1 58%;min-height:0;border-radius:12px;overflow:hidden;margin-bottom:5%}
.pic img,.cover>img{width:100%;height:100%;object-fit:cover;display:block}
.words{flex:1;overflow:auto;font-size:clamp(15px,2.3vmin,22px);line-height:1.85}.words p{margin:0 0 .5em;text-indent:2em}
.layout-full{padding:0}.layout-full .pic{position:absolute;inset:0;margin:0;border-radius:0}.layout-full .words{position:absolute;left:5%;right:5%;bottom:5%;max-height:48%;background:color-mix(in srgb,var(--paper) 90%,transparent);padding:4% 5%;border-radius:16px}
.layout-frame .pic{border:10px solid #fff;box-shadow:0 8px 22px rgba(0,0,0,.25);border-radius:2px}
.layout-none .words{display:flex;flex-direction:column;justify-content:center}
.cover{padding:0;justify-content:flex-end}.cover>img{position:absolute;inset:0}.cover-title{position:relative;padding:10% 8%;text-align:center;color:${'#fff'};background:linear-gradient(transparent,rgba(0,0,0,.65))}
.cover:not(:has(img)) .cover-title{color:var(--accent);background:none;margin:auto 0}
.cover h1{margin:0;font-size:clamp(28px,6vmin,56px)}.cover h2{margin:.3em 0 0;font-weight:500;font-size:clamp(16px,3vmin,26px)}.cover small{display:block;margin-top:1em;opacity:.85}
.chapter{margin:auto 0;text-align:center;color:var(--accent);font-size:clamp(24px,5vmin,44px)}
.end{margin:auto 0;text-align:center;color:var(--accent);font-size:clamp(36px,8vmin,70px);font-weight:800}
.num{position:absolute;bottom:2.5%;left:0;right:0;text-align:center;font-size:12px;opacity:.5}
.bar{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:center;gap:10px;padding:10px 10px max(10px,env(safe-area-inset-bottom));z-index:5}
.bar button{font:inherit;font-size:14px;border:0;border-radius:999px;padding:9px 16px;background:rgba(255,255,255,.92);color:#333;cursor:pointer}
.bar button[aria-pressed=true]{background:var(--accent);color:#fff}
.where{position:fixed;top:12px;left:0;right:0;text-align:center;color:rgba(255,255,255,.7);font-size:13px}
@media (prefers-reduced-motion:reduce){.page{transition:none}}
</style></head><body>
<div class="where" id="where"></div>
<main class="book" id="book">${pages}</main>${audio}
<nav class="bar"><button id="prev" aria-label="上一页">‹ 上一页</button><button id="read" aria-pressed="false" ${sounds.some(Boolean) ? '' : 'hidden'}>▶ 朗读</button><button id="next" aria-label="下一页">下一页 ›</button></nav>
<script>
const pages=[...document.querySelectorAll('.page')],where=document.getElementById('where'),read=document.getElementById('read');let at=0,reading=false,playing=null;
function show(i){at=Math.max(0,Math.min(pages.length-1,i));pages.forEach((p,k)=>{p.classList.toggle('on',k===at);p.classList.toggle('past',k<at);});where.textContent=(at+1)+' / '+pages.length;voice();}
function voice(){if(playing){playing.pause();playing=null;}if(!reading)return;const n=pages[at].dataset.sound,a=n!==''&&document.getElementById('a'+n);if(!a){setTimeout(()=>{if(reading&&at<pages.length-1)show(at+1);else if(reading)toggle(false);},2500);return;}playing=a;a.currentTime=0;a.play().catch(()=>toggle(false));a.onended=()=>{if(reading&&playing===a){if(at<pages.length-1)setTimeout(()=>reading&&show(at+1),600);else toggle(false);}};}
function toggle(on){reading=on;read.setAttribute('aria-pressed',String(on));read.textContent=on?'❚❚ 暂停':'▶ 朗读';voice();}
document.getElementById('prev').onclick=()=>show(at-1);document.getElementById('next').onclick=()=>show(at+1);read.onclick=()=>toggle(!reading);
document.getElementById('book').addEventListener('click',e=>{if(e.target.closest('.words'))return;show(at+(e.clientX<innerWidth/3?-1:1));});
addEventListener('keydown',e=>{if(e.key==='ArrowLeft')show(at-1);if(e.key==='ArrowRight'||e.key===' ')show(at+1);});
let x0=null;addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});addEventListener('touchend',e=>{if(x0==null)return;const dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>40)show(at+(dx<0?1:-1));});
show(0);
</script></body></html>`;
}
