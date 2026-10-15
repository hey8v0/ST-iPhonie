// 视觉小说 stage: the story shown as a galgame over the whole tavern page. A background (the story's own pictures, or
// the chat's background), the characters' 立绘 standing on it, and a text box at the bottom with a name plate: the text
// is typed out, a tap (or Enter / Space) goes on. Voice lines play in their voices as they come. 自动 goes on by itself
// after each line (and its voice), 快进 runs through, 记录 shows what was read (a line's voice plays again from there),
// 隐藏 leaves only the picture. At the end of the story a box takes what happens next and sends it to the tavern; the
// reply goes on on the stage when it is written.
// A picture of the story is a CG: the 立绘 step aside while it is shown; from the next message on it stays as the
// backdrop, softened, and they come back. Characters without a 立绘 show their avatar in the text box instead.
// It brings its own styles, so it works on any theme. Steps come from core/vn.js; vn-host.js feeds them.
import {VN_SPEEDS, VN_WAITS, stageMove} from './core/vn.js';

const STYLE_ID = 'sttts-vn-style';
const CSS = `
.sttts-vn{--vn-box:rgba(18,20,44,var(--vn-op));--vn-box2:rgba(34,26,64,var(--vn-op));--vn-ink:#f6f4ff;--vn-soft:rgba(246,244,255,.68);--vn-plate:#ff8fb1;--vn-plate-ink:#fff;--vn-line:rgba(255,255,255,.22);--vn-glow:rgba(255,143,177,.45);--vn-font:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif;
 position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;z-index:32000;overflow:hidden;background:#07070d;color:var(--vn-ink);font:16px/1.75 var(--vn-font);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation;overscroll-behavior:contain;cursor:default;opacity:0;transition:opacity .45s}
.sttts-vn[data-in]{opacity:1}
.sttts-vn[data-box=day]{--vn-box:rgba(255,255,255,var(--vn-op));--vn-box2:rgba(236,244,255,var(--vn-op));--vn-ink:#26304a;--vn-soft:rgba(38,48,74,.62);--vn-plate:#4f9cf5;--vn-line:rgba(79,156,245,.35);--vn-glow:rgba(79,156,245,.35)}
.sttts-vn[data-box=sakura]{--vn-box:rgba(255,236,243,var(--vn-op));--vn-box2:rgba(255,214,229,var(--vn-op));--vn-ink:#5b2740;--vn-soft:rgba(91,39,64,.6);--vn-plate:#e85d8f;--vn-line:rgba(232,93,143,.4);--vn-glow:rgba(232,93,143,.35)}
.sttts-vn[data-box=ink]{--vn-box:rgba(12,12,12,var(--vn-op));--vn-box2:rgba(28,24,20,var(--vn-op));--vn-ink:#f3ead8;--vn-soft:rgba(243,234,216,.6);--vn-plate:#c9a45c;--vn-plate-ink:#1a140a;--vn-line:rgba(201,164,92,.45);--vn-glow:rgba(201,164,92,.35);--vn-font:"Songti SC","STSong","Noto Serif SC","SimSun",serif}
.sttts-vn *{box-sizing:border-box}
.sttts-vn button{all:unset;box-sizing:border-box;cursor:pointer;font-family:var(--vn-font)}
.sttts-vn button:focus-visible{outline:2px solid var(--vn-plate);outline-offset:2px;border-radius:8px}
.vn-bg{position:absolute;inset:0;overflow:hidden;background:radial-gradient(ellipse at 50% 30%,#3a3560,#120f22 70%)}
.vn-bg-layer{position:absolute;inset:-2%;background:center/cover no-repeat;opacity:0;transition:opacity .9s ease,filter .9s ease}
.vn-bg-layer[data-on]{opacity:1}
.sttts-vn[data-soft] .vn-bg-layer{filter:blur(3px) brightness(.72) saturate(.9)}
.sttts-vn[data-fx] .vn-bg-layer[data-on]{animation:vn-drift 28s ease-in-out infinite alternate}
@keyframes vn-drift{from{transform:scale(1) translate(0,0)}to{transform:scale(1.07) translate(-1.2%,-.8%)}}
.vn-cast{position:absolute;inset:0;pointer-events:none}
.vn-actor{position:absolute;bottom:0;left:50%;height:min(92%,150vw);transform:translateX(-50%);transition:left .55s cubic-bezier(.22,1,.36,1),opacity .45s,filter .35s;opacity:0;filter:drop-shadow(0 10px 24px rgba(0,0,0,.35))}
.vn-actor[data-in]{opacity:1}
.vn-actor[data-dim]{filter:brightness(.58) saturate(.85) drop-shadow(0 10px 24px rgba(0,0,0,.35))}
.vn-actor img{display:block;height:100%;width:auto;max-width:none;-webkit-user-drag:none}
.vn-actor[data-speaking]{z-index:2}
.sttts-vn[data-fx] .vn-actor[data-hop] img{animation:vn-hop .5s cubic-bezier(.3,1.6,.5,1)}
@keyframes vn-hop{0%,100%{transform:none}35%{transform:translateY(-4.5%)}}
.sttts-vn[data-fx] .vn-actor[data-enter] img{animation:vn-enter .55s cubic-bezier(.22,1,.36,1)}
@keyframes vn-enter{from{transform:translateY(5%);opacity:.2}}
.sttts-vn[data-fx][data-shake] .vn-stage{animation:vn-shake .42s linear}
@keyframes vn-shake{0%,100%{transform:none}15%{transform:translate(-9px,3px)}30%{transform:translate(8px,-4px)}45%{transform:translate(-6px,2px)}60%{transform:translate(5px,-2px)}80%{transform:translate(-2px,1px)}}
.vn-stage{position:absolute;inset:0}
.vn-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.sttts-vn[data-fx] .vn-flash[data-on]{animation:vn-flash .7s ease-out}
@keyframes vn-flash{from{opacity:.75}to{opacity:0}}
.vn-box{position:absolute;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(1120px,calc(100% - 24px));min-height:clamp(132px,24vh,210px);padding:30px clamp(18px,3vw,40px) 22px;border-radius:20px;background:linear-gradient(180deg,var(--vn-box),var(--vn-box2));border:1px solid var(--vn-line);box-shadow:0 18px 50px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.12);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:opacity .3s,transform .3s;z-index:5}
.sttts-vn[data-face] .vn-box{padding-left:clamp(108px,15vw,150px)}
.vn-face{position:absolute;left:clamp(14px,2vw,24px);bottom:18px;width:clamp(78px,11vw,112px);aspect-ratio:1;border-radius:18px;overflow:hidden;border:2px solid var(--vn-line);box-shadow:0 6px 18px rgba(0,0,0,.3);display:none;background:var(--vn-box2)}
.sttts-vn[data-face] .vn-face{display:block}
.vn-face img{width:100%;height:100%;object-fit:cover;display:block}
.vn-face span{display:grid;place-items:center;width:100%;height:100%;font-size:38px;font-weight:800;color:var(--vn-plate)}
.vn-name{position:absolute;top:-19px;left:clamp(16px,2.6vw,34px);min-width:110px;padding:5px 22px;border-radius:12px 12px 12px 4px;background:var(--vn-plate);color:var(--vn-plate-ink);font-weight:800;font-size:17px;letter-spacing:.08em;text-align:center;box-shadow:0 6px 18px var(--vn-glow);transform:skewX(-8deg)}
.vn-name>span{display:inline-block;transform:skewX(8deg)}
.vn-name[hidden]{display:none}
.vn-text{margin:0;min-height:3.5em;font-size:var(--vn-size);line-height:1.8;letter-spacing:.02em;white-space:pre-wrap;overflow-wrap:anywhere;text-shadow:0 1px 2px rgba(0,0,0,.18)}
.sttts-vn[data-box=day] .vn-text,.sttts-vn[data-box=sakura] .vn-text{text-shadow:none}
.sttts-vn[data-narrate] .vn-text{color:var(--vn-soft);font-style:normal}
.sttts-vn[data-user] .vn-name{background:var(--vn-ink);color:var(--vn-box2)}
.vn-rest{visibility:hidden}
.vn-next{position:absolute;right:22px;bottom:12px;font-size:13px;color:var(--vn-plate);opacity:0;transition:opacity .2s}
.sttts-vn[data-done] .vn-next{opacity:1;animation:vn-next 1s ease-in-out infinite}
@keyframes vn-next{50%{transform:translateY(4px)}}
.vn-voice{position:absolute;right:20px;top:-14px;display:none;gap:3px;align-items:flex-end;height:18px;padding:4px 9px;border-radius:999px;background:var(--vn-plate);box-shadow:0 4px 12px var(--vn-glow)}
.vn-voice i{width:3px;height:6px;border-radius:2px;background:var(--vn-plate-ink);animation:vn-bar .9s ease-in-out infinite}
.vn-voice i:nth-child(2){animation-delay:.15s}.vn-voice i:nth-child(3){animation-delay:.3s}.vn-voice i:nth-child(4){animation-delay:.45s}
.sttts-vn[data-voice=playing] .vn-voice,.sttts-vn[data-voice=generating] .vn-voice{display:flex}
.sttts-vn[data-voice=generating] .vn-voice i{animation-duration:1.8s;opacity:.6}
@keyframes vn-bar{50%{height:12px}}
.vn-menu{position:absolute;right:6px;bottom:calc(100% + 8px);display:flex;gap:4px;z-index:6;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100% - 150px)}
.vn-menu button{padding:4px 10px;border-radius:999px;font-size:13px;font-weight:700;color:#fff;background:rgba(10,12,28,.5);border:1px solid rgba(255,255,255,.18);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);letter-spacing:.06em;transition:background .2s}
.vn-menu button:hover{background:rgba(10,12,28,.72)}
.vn-menu button[aria-pressed=true]{background:var(--vn-plate);color:var(--vn-plate-ink);border-color:transparent}
.vn-menu button[hidden]{display:none}
.sttts-vn[data-hidden] .vn-box{opacity:0;pointer-events:none;transform:translateX(-50%) translateY(16px)}
.vn-input{display:none;gap:8px;margin-top:10px}
.sttts-vn[data-end] .vn-input{display:flex}
.vn-input textarea{flex:1;min-height:46px;max-height:30vh;resize:none;padding:10px 12px;border-radius:12px;border:1px solid var(--vn-line);background:rgba(255,255,255,.1);color:var(--vn-ink);font:15px/1.6 var(--vn-font);user-select:text;-webkit-user-select:text;outline:none}
.sttts-vn[data-box=day] .vn-input textarea,.sttts-vn[data-box=sakura] .vn-input textarea{background:rgba(255,255,255,.7)}
.vn-input textarea:focus{border-color:var(--vn-plate)}
.vn-input button{align-self:flex-end;padding:11px 18px;border-radius:12px;background:var(--vn-plate);color:var(--vn-plate-ink);font-weight:800;white-space:nowrap}
.vn-input button[disabled]{opacity:.5;pointer-events:none}
.vn-dots::after{content:'';display:inline-block;width:1.4em;text-align:left;animation:vn-dots 1.2s steps(4) infinite}
@keyframes vn-dots{0%{content:''}25%{content:'·'}50%{content:'··'}75%{content:'···'}}
.vn-log{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;background:rgba(6,6,16,.86);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#f4f2ff}
.vn-log[hidden]{display:none}
.vn-log header{display:flex;align-items:center;justify-content:space-between;padding:max(14px,env(safe-area-inset-top)) 20px 10px;font-weight:800;letter-spacing:.3em;font-size:15px}
.vn-log header button{padding:6px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25);font-size:14px;letter-spacing:0}
.vn-log ol{flex:1;overflow:auto;margin:0;padding:6px 20px max(20px,env(safe-area-inset-bottom));list-style:none;user-select:text;-webkit-user-select:text;touch-action:pan-y}
.vn-log li{display:grid;grid-template-columns:7em 1fr auto;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);line-height:1.7}
.vn-log li b{color:#ff9cbc;text-align:right;font-weight:700;overflow-wrap:anywhere}
.vn-log li[data-narrate] span{color:rgba(244,242,255,.7)}
.vn-log li button{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.1)}
.vn-log li button:hover{background:rgba(255,255,255,.2)}
.vn-title{position:absolute;inset:0;z-index:30;display:grid;place-content:center;justify-items:center;gap:10px;background:#07070d;color:#f4f2ff;text-align:center;transition:opacity .8s}
.vn-title small{font-size:13px;letter-spacing:.6em;opacity:.7;padding-left:.6em}
.vn-title strong{font-size:clamp(26px,5vw,44px);letter-spacing:.25em;padding-left:.25em;font-weight:800;font-family:"Songti SC","STSong","Noto Serif SC",serif}
.vn-title em{font-style:normal;font-size:13px;opacity:.55;letter-spacing:.2em}
.vn-title::before,.vn-title::after{content:'';justify-self:center;width:min(320px,60vw);height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent)}
.vn-title[data-out]{opacity:0;pointer-events:none}
.sttts-vn[data-fx] .vn-title strong{animation:vn-rise 1.1s cubic-bezier(.22,1,.36,1)}
@keyframes vn-rise{from{opacity:0;transform:translateY(14px);letter-spacing:.5em}}
@media (max-width:600px){
 .sttts-vn{font-size:15px}
 .vn-box{min-height:clamp(120px,27vh,190px);padding:26px 16px 18px;border-radius:16px;width:calc(100% - 16px);bottom:max(8px,env(safe-area-inset-bottom))}
 .sttts-vn[data-face] .vn-box{padding-left:86px}
 .vn-face{width:64px;left:12px;bottom:14px;border-radius:14px}
 .vn-name{font-size:15px;min-width:86px;padding:4px 16px;top:-16px}
 .vn-menu{right:0;gap:3px;max-width:100%;bottom:calc(100% + 22px)}
 .vn-menu button{padding:3px 8px;font-size:12px}
 .vn-actor{height:min(80%,200vw)}
 .vn-log li{grid-template-columns:4.5em 1fr auto;gap:8px}
}
@media (prefers-reduced-motion:reduce){.sttts-vn *{animation:none!important;transition-duration:.01s!important}}
`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const SPOTS = {1: [50], 2: [30, 70], 3: [19, 50, 81]}, NARROW = {1: [50], 2: [27, 73], 3: [16, 50, 84]};
const quoted = text => /^[「『“"‘（(]/.test(text) ? text : '「' + text + '」';

/**
 * Opens the stage. source: {next() → {id, steps} | null (the next message, read when it is reached), more() → whether
 * more messages are on their way}. look(): the 视觉小说 settings now. voice: {play(step), stop(), on()}. face(name, user):
 * avatar url; sprite(name): 立绘 url. send(text): sends to the tavern (false when it could not). save(patch): keeps a
 * setting. title/subtitle: the title card. backdrop: the picture to start on ({url, soft}). onClose(lastId).
 */
export function openVnStage({doc = document, source, look, voice, face, sprite, send, save = () => {}, title = '', subtitle = '', backdrop = null, onClose = () => {}}) {
  const win = doc.defaultView;
  if (!doc.getElementById(STYLE_ID)) { const style = doc.createElement('style'); style.id = STYLE_ID; style.textContent = CSS; doc.head.append(style); }
  const root = doc.createElement('div');
  root.className = 'sttts-vn';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '视觉小说');
  root.tabIndex = -1;
  root.innerHTML = `<div class="vn-stage"><div class="vn-bg"><div class="vn-bg-layer"></div><div class="vn-bg-layer"></div></div><div class="vn-cast"></div><div class="vn-flash"></div></div>
    <div class="vn-box"><nav class="vn-menu" aria-label="视觉小说菜单"><button data-vn="auto" aria-pressed="false">自动</button><button data-vn="skip" aria-pressed="false">快进</button><button data-vn="log">记录</button><button data-vn="voice" aria-pressed="false">语音</button><button data-vn="hide">隐藏</button><button data-vn="full" aria-pressed="false">全屏</button><button data-vn="close" aria-label="退出视觉小说">退出</button></nav><div class="vn-name" hidden><span></span></div><div class="vn-face"></div><span class="vn-voice" aria-hidden="true"><i></i><i></i><i></i><i></i></span><p class="vn-text" aria-live="polite"></p><span class="vn-next" aria-hidden="true">▼</span>
      <div class="vn-input"><textarea rows="2" placeholder="接下来你要说什么、做什么？空着发送就让故事接着写" aria-label="接下来的剧情"></textarea><button data-vn="send">发送</button></div></div>
    <div class="vn-log" hidden><header><span>记 录</span><button data-vn="log-close">返回</button></header><ol></ol></div>
    <div class="vn-title"><small>VISUAL NOVEL</small><strong>${esc(title || '视觉小说')}</strong>${subtitle ? `<em>${esc(subtitle)}</em>` : ''}</div>`;
  const $ = s => root.querySelector(s);
  const box = $('.vn-box'), nameEl = $('.vn-name'), textEl = $('.vn-text'), faceEl = $('.vn-face'), castEl = $('.vn-cast'), logEl = $('.vn-log'), titleEl = $('.vn-title');
  const layers = [...root.querySelectorAll('.vn-bg-layer')], input = $('.vn-input textarea');
  const focus = doc.activeElement;
  doc.body.append(root);

  let steps = [], pos = 0, message = null, lastId = null, step = null, typed = true, typing = 0, closed = false;
  let auto = false, skip = false, autoTimer = 0, skipTimer = 0, hidden = false, cg = false, layer = 0, bgUrl = '', ended = false, waiting = false, clock = 0, phase = 'idle', titleTimer = 0;
  const actors = new Map(), log = [];

  function applyLook() {
    const s = look();
    root.dataset.box = s.box;
    root.style.setProperty('--vn-op', String(s.opacity));
    root.style.setProperty('--vn-size', {s: '16px', m: '19px', l: '22px'}[s.font] || '19px');
    root.toggleAttribute('data-fx', s.effects !== false && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    $('[data-vn=voice]').setAttribute('aria-pressed', String(s.voice && voice.on()));
    $('[data-vn=voice]').hidden = !voice.on();
  }
  applyLook();
  const full = $('[data-vn=full]');
  full.hidden = !root.requestFullscreen;

  // ---------- background ----------
  function setBg(url, {soft = false, flash = false} = {}) {
    root.toggleAttribute('data-soft', soft);
    if (url === bgUrl) return;
    bgUrl = url;
    const next = layers[layer = 1 - layer], prev = layers[1 - layer];
    next.style.backgroundImage = url ? `url("${String(url).replace(/["\\]/g, '\\$&')}")` : '';
    next.toggleAttribute('data-on', !!url);
    prev.removeAttribute('data-on');
    if (flash) { const f = $('.vn-flash'); f.removeAttribute('data-on'); void f.offsetWidth; f.setAttribute('data-on', ''); }
  }
  if (backdrop?.url) setBg(backdrop.url, {soft: backdrop.soft !== false});

  // ---------- characters ----------
  function placeActors() {
    const list = [...actors.values()], spots = (win.innerWidth < 600 ? NARROW : SPOTS)[list.length] || SPOTS[3];
    list.forEach((a, i) => { a.el.style.left = spots[i] + '%'; });
  }
  function leave(name) {
    const a = actors.get(name);
    if (!a) return;
    actors.delete(name);
    a.el.removeAttribute('data-in');
    win.setTimeout(() => a.el.remove(), 500);
  }
  function clearActors() { for (const name of [...actors.keys()]) leave(name); }
  function enter(name, url) {
    let a = actors.get(name);
    if (!a) {
      if (actors.size >= 3) leave([...actors.values()].sort((x, y) => x.last - y.last)[0].name);
      const el = doc.createElement('div');
      el.className = 'vn-actor';
      el.innerHTML = `<img alt="${esc(name)}" draggable="false">`;
      el.querySelector('img').src = url;
      el.setAttribute('data-enter', '');
      castEl.append(el);
      a = {name, el, last: 0};
      actors.set(name, a);
      placeActors();
      win.requestAnimationFrame(() => el.setAttribute('data-in', ''));
      win.setTimeout(() => el.removeAttribute('data-enter'), 600);
    }
    a.last = ++clock;
    return a;
  }
  function spotlight(name) {
    for (const a of actors.values()) {
      a.el.toggleAttribute('data-speaking', a.name === name);
      a.el.toggleAttribute('data-dim', !!name && a.name !== name);
    }
  }
  function move(kind, actor) {
    if (!kind || skip) return;
    if (kind === 'shake') { root.removeAttribute('data-shake'); void root.offsetWidth; root.setAttribute('data-shake', ''); win.setTimeout(() => root.removeAttribute('data-shake'), 450); }
    else if (actor) { actor.el.removeAttribute('data-hop'); void actor.el.offsetWidth; actor.el.setAttribute('data-hop', ''); win.setTimeout(() => actor.el.removeAttribute('data-hop'), 520); }
  }

  // ---------- text ----------
  function finishTyping() {
    win.cancelAnimationFrame(typing); typing = 0;
    typed = true;
    textEl.textContent = textEl.dataset.full || '';
    root.setAttribute('data-done', '');
    planAuto();
  }
  function type(text) {
    win.cancelAnimationFrame(typing);
    typed = false;
    root.removeAttribute('data-done');
    textEl.dataset.full = text;
    const per = VN_SPEEDS[look().speed] ?? VN_SPEEDS[2];
    if (!per || skip) { finishTyping(); return; }
    const start = win.performance.now(), chars = [...text];
    const tick = now => {
      const n = Math.min(chars.length, Math.floor((now - start) / 1000 / per) + 1);
      textEl.innerHTML = esc(chars.slice(0, n).join('')) + `<span class="vn-rest">${esc(chars.slice(n).join(''))}</span>`;
      if (n < chars.length) typing = win.requestAnimationFrame(tick); else finishTyping();
    };
    typing = win.requestAnimationFrame(tick);
  }

  // ---------- steps ----------
  function show(s) {
    step = s;
    const say = s.kind === 'say', name = say ? s.role : '';
    root.toggleAttribute('data-narrate', !say);
    root.toggleAttribute('data-user', !!s.user);
    nameEl.hidden = !say;
    nameEl.firstElementChild.textContent = name;
    // A 立绘 when there is one (not over a CG, not for the user); else the avatar in the box.
    const url = say && !s.user && !cg ? sprite(name) : '';
    let actor = null;
    if (url) actor = enter(name, url);
    // Whoever speaks is lit; the others dim (all of them when the speaker has no 立绘 on the stage).
    spotlight(say ? name : '');
    const pic = say && !actor ? face(name, s.user) : '';
    root.toggleAttribute('data-face', say && !actor);
    faceEl.innerHTML = pic ? `<img src="${esc(pic)}" alt="">` : say && !actor ? `<span>${esc([...name][0] || '?')}</span>` : '';
    if (say && !s.part) move(look().effects !== false ? stageMove(s.emotion) : '', actor);
    // Voice: a line plays from its first page on; anything else stops the one before.
    if (!(say && s.part)) voice.stop();
    if (say && !s.part && !s.user && !skip && look().voice && voice.on() && s.voiced) voice.play(s);
    type(say ? quoted(s.text) : s.text);
    log.push({name, text: say ? quoted(s.text) : s.text, step: say && s.voiced && !s.part ? s : null});
    if (log.length > 600) log.shift();
  }
  function nextMessage() {
    const m = source.next();
    if (!m) return false;
    message = m; steps = m.steps; pos = 0; lastId = m.id;
    // A CG of the message before stays as the backdrop, softened; the 立绘 come back.
    if (cg) { cg = false; root.setAttribute('data-soft', ''); }
    return true;
  }
  function next() {
    win.clearTimeout(autoTimer);
    if (closed || ended && !waiting) return;
    for (;;) {
      if (pos >= steps.length && !nextMessage()) { theEnd(); return; }
      const s = steps[pos++];
      if (!s) continue;
      if (s.kind === 'bg') { cg = true; clearActors(); setBg(s.url, {flash: !skip}); continue; }
      ended = false; root.removeAttribute('data-end');
      show(s);
      return;
    }
  }
  function theEnd() {
    stopSkip();
    ended = true;
    if (!waiting) {
      voice.stop();
      step = null;
      root.setAttribute('data-end', '');
      root.removeAttribute('data-face'); root.setAttribute('data-narrate', ''); nameEl.hidden = true;
      spotlight('');
      textEl.dataset.full = '— 故事写到这里了 —';
      finishTyping();
      root.removeAttribute('data-done');
      if (auto) setAuto(false);
      if (!win.matchMedia?.('(pointer: coarse)').matches) input.focus({preventScroll: true});
    }
  }
  function advance() {
    if (titleEl && !titleEl.hasAttribute('data-out')) { dropTitle(); return; }
    if (hidden) { setHidden(false); return; }
    if (!logEl.hidden) return;
    if (skip) { stopSkip(); return; }
    if (!typed) { finishTyping(); return; }
    if (ended) return;
    next();
  }

  // ---------- 自动 / 快进 ----------
  const busyVoice = () => ['playing', 'generating'].includes(phase);
  function planAuto() {
    win.clearTimeout(autoTimer);
    if (!auto || !typed || ended || closed) return;
    const wait = () => {
      if (!auto || closed) return;
      if (busyVoice()) { autoTimer = win.setTimeout(wait, 250); return; }
      const s = look(), base = VN_WAITS[s.wait] ?? 1.2, len = (textEl.dataset.full || '').length;
      autoTimer = win.setTimeout(() => { if (auto && typed && !closed) next(); }, (base + (step?.voiced && look().voice ? 0 : Math.min(4, len * 0.035))) * 1000);
    };
    wait();
  }
  function setAuto(on) {
    auto = on;
    $('[data-vn=auto]').setAttribute('aria-pressed', String(on));
    if (on) { stopSkip(); planAuto(); } else win.clearTimeout(autoTimer);
  }
  function stopSkip() { skip = false; win.clearTimeout(skipTimer); $('[data-vn=skip]').setAttribute('aria-pressed', 'false'); }
  function startSkip() {
    setAuto(false);
    skip = true;
    $('[data-vn=skip]').setAttribute('aria-pressed', 'true');
    voice.stop();
    const run = () => { if (!skip || closed) return; if (!typed) finishTyping(); next(); if (skip && !ended) skipTimer = win.setTimeout(run, 70); };
    run();
  }
  function setHidden(on) { hidden = on; root.toggleAttribute('data-hidden', on); }

  // ---------- 记录 ----------
  function openLog() {
    const list = logEl.querySelector('ol');
    list.innerHTML = log.map((e, i) => `<li${e.name ? '' : ' data-narrate'}><b>${esc(e.name)}</b><span>${esc(e.text)}</span>${e.step && voice.on() ? `<button data-vn="replay" data-i="${i}" aria-label="再听一次">▶</button>` : '<i></i>'}</li>`).join('');
    logEl.hidden = false;
    list.scrollTop = list.scrollHeight;
    setAuto(false); stopSkip();
  }
  function closeLog() { logEl.hidden = true; }

  // ---------- title ----------
  function dropTitle() {
    win.clearTimeout(titleTimer);
    if (titleEl.hasAttribute('data-out')) return;
    titleEl.setAttribute('data-out', '');
    win.setTimeout(() => titleEl.remove(), 900);
    if (!step && !ended) next();
  }

  // ---------- input ----------
  async function sendText() {
    const text = input.value.trim(), button = $('[data-vn=send]');
    button.disabled = true;
    try {
      if (await send(text) === false) return;
      input.value = '';
      waiting = true;
      root.removeAttribute('data-end');
      textEl.dataset.full = '';
      textEl.innerHTML = '<span class="vn-dots">故事正在写</span>';
      root.removeAttribute('data-done');
    } finally { button.disabled = false; }
  }

  // ---------- events ----------
  const actions = {
    auto: () => setAuto(!auto), skip: () => skip ? stopSkip() : startSkip(), log: openLog, 'log-close': closeLog, hide: () => setHidden(true),
    voice: () => { const on = !look().voice; save({voice: on}); if (!on) voice.stop(); applyLook(); },
    full: () => { if (doc.fullscreenElement) doc.exitFullscreen?.(); else root.requestFullscreen?.().catch(() => {}); },
    close: () => close(), send: () => sendText(),
    replay: el => { const e = log[Number(el.dataset.i)]; if (e?.step) voice.play(e.step); },
  };
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-vn]');
    if (b && root.contains(b)) { e.stopPropagation(); actions[b.dataset.vn]?.(b); return; }
    if (e.target.closest('.vn-input, .vn-log')) return;
    advance();
  });
  root.addEventListener('wheel', e => {
    if (!logEl.hidden) { const list = logEl.querySelector('ol'); if (e.deltaY > 0 && list.scrollTop + list.clientHeight >= list.scrollHeight - 2) closeLog(); return; }
    if (e.deltaY < 0) openLog(); else if (e.deltaY > 0) advance();
  }, {passive: true});
  const onKey = e => {
    if (closed) return;
    const typing = e.target.closest?.('textarea, input');
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!logEl.hidden) closeLog(); else if (hidden) setHidden(false); else if (typing) input.blur(); else close(); return; }
    if (typing) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText(); } e.stopPropagation(); return; }
    if (e.key === 'Control' && !e.repeat) { startSkip(); e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    if (['enter', ' ', 'arrowright', 'arrowdown', 'pagedown'].includes(k)) { e.preventDefault(); if (!logEl.hidden && k !== 'arrowdown') closeLog(); else if (logEl.hidden) advance(); }
    else if (['arrowup', 'pageup', 'l'].includes(k)) { e.preventDefault(); if (logEl.hidden) openLog(); }
    else if (k === 'a') setAuto(!auto);
    else if (k === 'h') setHidden(!hidden);
    else if (k === 's') skip ? stopSkip() : startSkip();
    // Nothing reaches the tavern behind (its arrow keys swipe replies).
    e.stopPropagation();
  };
  const onKeyUp = e => { if (e.key === 'Control') stopSkip(); };
  const onFull = () => full.setAttribute('aria-pressed', String(doc.fullscreenElement === root));
  const onResize = () => placeActors();
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('keyup', onKeyUp, true);
  doc.addEventListener('fullscreenchange', onFull);
  win.addEventListener('resize', onResize);

  function close() {
    if (closed) return;
    closed = true;
    win.clearTimeout(autoTimer); win.clearTimeout(skipTimer); win.clearTimeout(titleTimer); win.cancelAnimationFrame(typing);
    voice.stop();
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('keyup', onKeyUp, true);
    doc.removeEventListener('fullscreenchange', onFull);
    win.removeEventListener('resize', onResize);
    if (doc.fullscreenElement === root) doc.exitFullscreen?.().catch?.(() => {});
    root.removeAttribute('data-in');
    win.setTimeout(() => root.remove(), 450);
    try { focus?.focus?.({preventScroll: true}); } catch {}
    onClose(lastId);
  }

  win.requestAnimationFrame(() => root.setAttribute('data-in', ''));
  root.focus({preventScroll: true});
  titleTimer = win.setTimeout(dropTitle, 1900);

  return {
    get closed() { return closed; },
    close,
    /** The player's phase: the small wave on the box, and 自动 waits for a line's voice to end. */
    status(value) { phase = value || 'idle'; root.dataset.voice = phase; if (auto && typed && !busyVoice()) planAuto(); },
    /** New messages arrived (a reply was written): the story goes on from where it ended. */
    more() { if (closed) return; const was = waiting; waiting = false; if (ended || was) { ended = false; root.removeAttribute('data-end'); next(); } },
    /** The reply could not be written (stopped or failed): back to the box. */
    failed() { if (closed || !waiting) return; waiting = false; ended = false; theEnd(); },
    /** The settings changed (in the phone's 视觉小说 app). */
    refresh() { if (!closed) applyLook(); },
    /** Where the story is, for tests and the host: {id, kind, text, ended}. */
    state() { return {id: lastId, kind: step?.kind || '', text: textEl.dataset.full || '', ended, waiting, auto, skip}; },
    advance,
  };
}
