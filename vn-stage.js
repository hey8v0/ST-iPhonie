// 视觉小说 stage: the story shown as a galgame over the whole tavern page. A background (the story's own pictures, or
// the chat's background), the characters' 立绘 standing on it, and a text box at the bottom with a name plate: the text
// is typed out, a tap (or Enter / Space) goes on. Voice lines play in their voices as they come. 自动 goes on by itself
// after each line (and its voice), 快进 runs through, 记录 shows what was read (a line's voice plays again from there),
// 隐藏 leaves only the picture. At the end of the story a box takes what happens next and sends it to the tavern; the
// reply goes on on the stage when it is written.
// A picture of the story is a CG: it fills the screen when its shape is close to the screen's, else it is seen whole.
// The 立绘 step aside while it is new (whoever speaks shows as a bust in the text box); after two pages they come back
// in front of it, dimmed a little (隐藏 shows it alone again). From the next message on the chat's own background
// comes back (or the CG stays, dimmed). Characters without a 立绘
// show their avatar in the text box. Effects (one switch in 观感): the 立绘 breathe and bob while they talk; each line
// is acted from its 情绪 — one of several moves and camera shots for that feeling, a pose held while it is said, light
// around the speaker, the edges glowing, a cut-in for a shout, letterbox bars for a quiet moment — and from what the
// story says around it (点头, 摇头, 鞠躬, 别过脸 …); the words come in with the line's tone (a shout slams in and shakes
// the box, a whisper fades in small, fear trembles, sorrow is slow) and pause at commas and full stops. The story
// brings weather (several kinds at once: rain, storms, snow, fog, petals, stars, fireworks … vn-fx.js), the light of
// the time of day, light rays, lightning, blows that land, glitches, heartbeats, blackouts, memories, and a card when
// time has passed (第二天清晨). A new CG comes in one of several ways.
// It brings its own styles, so it works on any theme. Steps come from core/vn.js; vn-host.js feeds them.
import {VN_SPEEDS, VN_WAITS, lineStage, toneOf, storyFx, coverFits, hashOf} from './core/vn.js';
import {moveFor} from './core/model-moves.js';
import {createFx} from './vn-fx.js';
import {typedMouth} from './core/model-files.js';

const STYLE_ID = 'sttts-vn-style';
const CSS = `
.sttts-vn{--vn-box:rgba(18,20,44,var(--vn-op));--vn-box2:rgba(34,26,64,var(--vn-op));--vn-ink:#f6f4ff;--vn-soft:rgba(246,244,255,.68);--vn-plate:#ff8fb1;--vn-plate-ink:#fff;--vn-line:rgba(255,255,255,.22);--vn-glow:rgba(255,143,177,.45);--vn-font:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif;
 position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;z-index:32000;overflow:hidden;background:#07070d;color:var(--vn-ink);font:16px/1.75 var(--vn-font);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation;overscroll-behavior:contain;cursor:default;opacity:0;transition:opacity .45s}
.sttts-vn[data-in]{opacity:1}
.sttts-vn[data-box=day]{--vn-box:rgba(255,255,255,var(--vn-op));--vn-box2:rgba(236,244,255,var(--vn-op));--vn-ink:#26304a;--vn-soft:rgba(38,48,74,.62);--vn-plate:#4f9cf5;--vn-line:rgba(79,156,245,.35);--vn-glow:rgba(79,156,245,.35)}
.sttts-vn[data-box=sakura]{--vn-box:rgba(255,236,243,var(--vn-op));--vn-box2:rgba(255,214,229,var(--vn-op));--vn-ink:#5b2740;--vn-soft:rgba(91,39,64,.6);--vn-plate:#e85d8f;--vn-line:rgba(232,93,143,.4);--vn-glow:rgba(232,93,143,.35)}
.sttts-vn[data-box=ink]{--vn-box:rgba(12,12,12,var(--vn-op));--vn-box2:rgba(28,24,20,var(--vn-op));--vn-ink:#f3ead8;--vn-soft:rgba(243,234,216,.6);--vn-plate:#c9a45c;--vn-plate-ink:#1a140a;--vn-line:rgba(201,164,92,.45);--vn-glow:rgba(201,164,92,.35);--vn-font:"Songti SC","STSong","Noto Serif SC","SimSun",serif}
/* 跟随酒馆: the tavern theme's own colours; 跟随小手机: the phone's, handed over as --vn-p-*. */
.sttts-vn[data-box=tavern]{--vn-box:color-mix(in srgb,var(--SmartThemeBlurTintColor,#1b1b22) calc(var(--vn-op) * 100%),transparent);--vn-box2:color-mix(in srgb,var(--SmartThemeChatTintColor,var(--SmartThemeBlurTintColor,#24242c)) calc(var(--vn-op) * 100%),transparent);--vn-ink:var(--SmartThemeBodyColor,#e6e6ee);--vn-soft:var(--SmartThemeEmColor,#b8b8c4);--vn-plate:var(--SmartThemeQuoteColor,#e18a24);--vn-plate-ink:#fff;--vn-line:var(--SmartThemeBorderColor,rgba(255,255,255,.2));--vn-glow:var(--SmartThemeShadowColor,rgba(0,0,0,.35))}
.sttts-vn[data-box=phone]{--vn-box:color-mix(in srgb,var(--vn-p-box) calc(var(--vn-op) * 100%),transparent);--vn-box2:color-mix(in srgb,var(--vn-p-box2) calc(var(--vn-op) * 100%),transparent);--vn-ink:var(--vn-p-ink);--vn-soft:var(--vn-p-soft);--vn-plate:var(--vn-p-plate);--vn-plate-ink:var(--vn-p-plateInk);--vn-line:var(--vn-p-line);--vn-glow:color-mix(in srgb,var(--vn-p-plate) 40%,transparent)}
.sttts-vn *{box-sizing:border-box}
.sttts-vn button{all:unset;box-sizing:border-box;cursor:pointer;font-family:var(--vn-font)}
.sttts-vn button:focus-visible{outline:2px solid var(--vn-plate);outline-offset:2px;border-radius:8px}
.vn-bg{position:absolute;inset:0;overflow:hidden;background:radial-gradient(ellipse at 50% 30%,#3a3560,#120f22 70%)}
.vn-bg-layer{position:absolute;inset:-2%;background:center/cover no-repeat;opacity:0;transition:opacity .9s ease,filter .9s ease}
.vn-bg-layer[data-on]{opacity:1}
/* A CG fills the screen when its shape is close to the screen's; otherwise (and while the box is hidden) it is seen
   whole, over a blurred copy that fills the rest. */
.vn-fit{position:absolute;inset:0;background:50% 40%/contain no-repeat;opacity:0;transition:opacity .6s ease}
/* On a tall screen a whole CG sits in the room above the text box. */
@media (orientation:portrait){.vn-fit{background-position:50% 26%}}
.sttts-vn[data-cg]:is([data-whole],[data-hidden]) .vn-fit{opacity:1}
.sttts-vn[data-cg]:is([data-whole],[data-hidden]) .vn-bg-layer{filter:blur(18px) brightness(.55)}
.sttts-vn[data-soft] .vn-bg-layer,.sttts-vn[data-soft] .vn-fit{filter:brightness(.74) saturate(.92)}
/* 隐藏 over a CG: the picture alone. */
.vn-cast{transition:opacity .35s}
.sttts-vn[data-hidden][data-cg] .vn-cast{opacity:0}
.sttts-vn[data-fx] .vn-bg-layer[data-on]{animation:vn-drift 28s ease-in-out infinite alternate}
.sttts-vn[data-fx] .vn-bg-layer[data-on][data-reveal]{animation:vn-reveal 1.1s cubic-bezier(.22,1,.36,1),vn-drift 28s ease-in-out infinite alternate}
.sttts-vn[data-fx] .vn-fit[data-reveal]{animation:vn-reveal 1.1s cubic-bezier(.22,1,.36,1)}
@keyframes vn-drift{from{transform:scale(1) translate(0,0)}to{transform:scale(1.07) translate(-1.2%,-.8%)}}
@keyframes vn-reveal{from{clip-path:circle(0% at 50% 45%)}to{clip-path:circle(80% at 50% 45%)}}
/* 回忆, 梦里: an old photograph. */
.vn-stage{transition:filter 1s}
.sttts-vn[data-memory] .vn-stage{filter:sepia(.55) saturate(.75) contrast(.95)}
.sttts-vn[data-memory] .vn-stage::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:3;background:radial-gradient(ellipse at center,transparent 50%,rgba(255,240,214,.6) 100%)}
.vn-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
.vn-tint,.vn-black{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:3}
.vn-tint[data-tint=red]{background:radial-gradient(ellipse at center,transparent 58%,rgba(230,30,50,.42) 100%)}
.vn-tint[data-tint=blue]{background:radial-gradient(ellipse at center,transparent 55%,rgba(40,70,160,.4) 100%)}
.vn-tint[data-tint=pink]{background:radial-gradient(ellipse at center,transparent 58%,rgba(255,120,170,.38) 100%)}
.vn-tint[data-tint=dark]{background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.55) 100%)}
.vn-tint[data-tint=beat]{background:radial-gradient(ellipse at center,transparent 38%,rgba(200,20,60,.6) 100%)}
.sttts-vn[data-fx] .vn-tint[data-on]{animation:vn-tint 1.9s ease}
.sttts-vn[data-fx] .vn-tint[data-on][data-tint=beat]{animation:vn-beat 1.5s ease}
@keyframes vn-tint{0%{opacity:0}30%{opacity:.85}60%{opacity:.6}100%{opacity:0}}
@keyframes vn-beat{0%,100%{opacity:0}12%{opacity:1}26%{opacity:.15}40%{opacity:.9}62%{opacity:0}}
.vn-black{background:#000;z-index:4}
.sttts-vn[data-fx] .vn-black[data-on]{animation:vn-black 2.3s ease}
@keyframes vn-black{0%{opacity:0}25%,55%{opacity:1}100%{opacity:0}}
.vn-cast{position:absolute;inset:0;pointer-events:none}
.vn-actor{position:absolute;bottom:0;left:50%;height:min(92%,150vw);transform:translateX(-50%);transform-origin:50% 100%;transition:left .55s cubic-bezier(.22,1,.36,1),opacity .45s,filter .35s;opacity:0;filter:drop-shadow(0 10px 24px rgba(0,0,0,.35))}
.vn-actor :is(img,canvas){transform-origin:50% 100%;transition:transform .45s cubic-bezier(.22,1,.36,1),filter .45s}
.vn-actor[data-speaking] :is(img,canvas){transform:scale(1.015)}
.vn-actor[data-sink] :is(img,canvas){transform:translateY(2.5%);filter:saturate(.8) brightness(.93)}
.vn-actor[data-in]{opacity:1}
.vn-actor[data-dim]{filter:brightness(.58) saturate(.85) drop-shadow(0 10px 24px rgba(0,0,0,.35))}
.vn-actor img{display:block;height:100%;width:auto;max-width:none;-webkit-user-drag:none}
.vn-actor canvas.vn-model{display:block;height:100%;width:auto;max-width:none}
.vn-actor img.vn-was{position:absolute;left:50%;bottom:0;transform:translateX(-50%);opacity:1;transition:opacity .35s}
.vn-actor img.vn-was[data-gone]{opacity:0}
.vn-actor[data-speaking]{z-index:2}
.sttts-vn[data-fx] .vn-actor[data-hop] :is(img,canvas){animation:vn-hop .5s cubic-bezier(.3,1.6,.5,1)}
@keyframes vn-hop{0%,100%{transform:none}35%{transform:translateY(-4.5%)}}
.sttts-vn[data-fx] .vn-actor[data-enter] :is(img,canvas){animation:vn-enter .55s cubic-bezier(.22,1,.36,1)}
@keyframes vn-enter{from{transform:translate(var(--vn-from,0),4%);opacity:0}}
.sttts-vn[data-fx] .vn-actor[data-bounce] :is(img,canvas){animation:vn-bounce .75s ease}
@keyframes vn-bounce{0%,100%{transform:none}22%{transform:translateY(-3.5%)}45%{transform:none}65%{transform:translateY(-1.6%)}82%{transform:none}}
.sttts-vn[data-fx] .vn-actor[data-tremble] :is(img,canvas){animation:vn-tremble .7s linear}
@keyframes vn-tremble{0%,100%{transform:none}10%,50%,90%{transform:translateX(-.7%)}30%,70%{transform:translateX(.7%)}}
.sttts-vn[data-fx][data-shake=big] .vn-stage{animation:vn-shake-big .75s linear}
@keyframes vn-shake-big{0%,100%{transform:none}10%{transform:translate(-18px,8px) rotate(-.6deg)}20%{transform:translate(16px,-10px) rotate(.5deg)}30%{transform:translate(-14px,6px)}45%{transform:translate(10px,-5px)}60%{transform:translate(-7px,3px)}80%{transform:translate(3px,-1px)}}
.sttts-vn[data-fx][data-shake] .vn-stage{animation:vn-shake .42s linear}
@keyframes vn-shake{0%,100%{transform:none}15%{transform:translate(-9px,3px)}30%{transform:translate(8px,-4px)}45%{transform:translate(-6px,2px)}60%{transform:translate(5px,-2px)}80%{transform:translate(-2px,1px)}}
.vn-stage{position:absolute;inset:0}
.vn-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.sttts-vn[data-fx] .vn-flash[data-on]{animation:vn-flash .7s ease-out}
.sttts-vn[data-fx] .vn-flash[data-on][data-kind=lightning]{animation:vn-lightning 1s linear}
.vn-flash[data-kind=boom]{background:#ffb35c}
@keyframes vn-flash{from{opacity:.75}to{opacity:0}}
@keyframes vn-lightning{0%{opacity:.95}8%{opacity:0}16%{opacity:.75}26%{opacity:0}34%{opacity:.4}100%{opacity:0}}
.vn-box{position:absolute;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(1120px,calc(100% - 24px));min-height:clamp(132px,24vh,210px);padding:30px clamp(18px,3vw,40px) 22px;border-radius:20px;background:linear-gradient(180deg,var(--vn-box),var(--vn-box2));border:1px solid var(--vn-line);box-shadow:0 18px 50px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.12);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:opacity .3s,transform .3s;z-index:5}
.sttts-vn[data-face] .vn-box{padding-left:clamp(108px,15vw,150px)}
.vn-face{position:absolute;left:clamp(14px,2vw,24px);bottom:18px;width:clamp(78px,11vw,112px);aspect-ratio:1;border-radius:18px;overflow:hidden;border:2px solid var(--vn-line);box-shadow:0 6px 18px rgba(0,0,0,.3);display:none;background:var(--vn-box2)}
.sttts-vn[data-face] .vn-face{display:block}
.vn-face img{width:100%;height:100%;object-fit:cover;display:block}
.vn-face img.vn-bust{object-position:50% 0;transform:scale(1.6);transform-origin:50% 0}
.vn-face span{display:grid;place-items:center;width:100%;height:100%;font-size:38px;font-weight:800;color:var(--vn-plate)}
.vn-name{position:absolute;top:-19px;left:clamp(16px,2.6vw,34px);min-width:110px;padding:5px 22px;border-radius:12px 12px 12px 4px;background:var(--vn-plate);color:var(--vn-plate-ink);font-weight:800;font-size:17px;letter-spacing:.08em;text-align:center;box-shadow:0 6px 18px var(--vn-glow);transform:skewX(-8deg)}
.vn-name>span{display:inline-block;transform:skewX(8deg)}
.sttts-vn[data-fx] .vn-name[data-pop]{animation:vn-plate .4s cubic-bezier(.3,1.5,.5,1)}
@keyframes vn-plate{from{opacity:0;transform:skewX(-8deg) translateY(8px) scale(.9)}}
.vn-name[hidden]{display:none}
.vn-text{margin:0;min-height:3.5em;font-size:var(--vn-size);line-height:1.8;letter-spacing:.02em;white-space:pre-wrap;overflow-wrap:anywhere;text-shadow:0 1px 2px rgba(0,0,0,.18)}
.sttts-vn:is([data-box=day],[data-box=sakura],[data-box=phone]) .vn-text{text-shadow:none}
.sttts-vn[data-box=tavern] .vn-name{text-shadow:0 1px 2px rgba(0,0,0,.35)}
.sttts-vn[data-narrate] .vn-text{color:var(--vn-soft);font-style:normal}
.sttts-vn[data-user] .vn-name{background:var(--vn-ink);color:var(--vn-box2)}
.vn-rest{visibility:hidden}
.vn-next{position:absolute;right:22px;bottom:12px;font-size:13px;color:var(--vn-plate);opacity:0;transition:opacity .2s}
.sttts-vn[data-done] .vn-next{opacity:1;animation:vn-next 1s ease-in-out infinite}
@keyframes vn-next{50%{transform:translateY(4px)}}
.vn-voice{position:absolute;right:44px;bottom:12px;display:none;gap:3px;align-items:flex-end;height:18px;padding:4px 9px;border-radius:999px;background:var(--vn-plate);box-shadow:0 4px 12px var(--vn-glow)}
.vn-voice i{width:3px;height:6px;border-radius:2px;background:var(--vn-plate-ink);animation:vn-bar .9s ease-in-out infinite}
.vn-voice i:nth-child(2){animation-delay:.15s}.vn-voice i:nth-child(3){animation-delay:.3s}.vn-voice i:nth-child(4){animation-delay:.45s}
.sttts-vn[data-voice=playing] .vn-voice,.sttts-vn[data-voice=generating] .vn-voice{display:flex}
.sttts-vn[data-voice=generating] .vn-voice i{animation-duration:1.8s;opacity:.6}
@keyframes vn-bar{50%{height:12px}}
.vn-menu{position:absolute;right:6px;bottom:calc(100% + 8px);display:flex;gap:4px;z-index:6;justify-content:flex-end}
.vn-menu button{padding:4px 10px;border-radius:999px;font-size:13px;font-weight:700;color:#fff;background:rgba(10,12,28,.5);border:1px solid rgba(255,255,255,.18);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);letter-spacing:.06em;transition:background .2s}
.vn-menu button:hover{background:rgba(10,12,28,.72)}
.vn-menu button[aria-pressed=true]{background:var(--vn-plate);color:var(--vn-plate-ink);border-color:transparent}
.vn-menu button[hidden]{display:none}
.vn-menu [data-vn=more]{min-width:34px;text-align:center;letter-spacing:0}
.vn-more{position:absolute;right:0;bottom:calc(100% + 8px);display:flex;flex-direction:column;min-width:132px;padding:6px;border-radius:16px;background:rgba(10,12,28,.84);border:1px solid rgba(255,255,255,.16);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 12px 30px rgba(0,0,0,.35)}
.vn-more[hidden]{display:none}
.vn-menu .vn-more button{padding:9px 14px;border-radius:10px;border:0;background:none;font-size:14px;letter-spacing:.04em}
.vn-menu .vn-more button:hover{background:rgba(255,255,255,.1)}
.vn-menu .vn-more button[aria-pressed]{background:none;color:#fff}
.vn-menu .vn-more button[aria-pressed=true]::after{content:' ✓';color:var(--vn-plate)}
.sttts-vn[data-fx] .vn-more:not([hidden]){animation:vn-pop .2s ease-out}
@keyframes vn-pop{from{opacity:0;transform:translateY(6px) scale(.97)}}
.sttts-vn[data-hidden] .vn-box{opacity:0;pointer-events:none;transform:translateX(-50%) translateY(16px)}
.vn-input{display:none;gap:8px;margin-top:10px}
.sttts-vn[data-end] .vn-input{display:flex}
.vn-input textarea{flex:1;min-height:46px;max-height:30vh;resize:none;padding:10px 12px;border-radius:12px;border:1px solid var(--vn-line);background:rgba(255,255,255,.1);color:var(--vn-ink);font:15px/1.6 var(--vn-font);user-select:text;-webkit-user-select:text;outline:none}
.sttts-vn:is([data-box=day],[data-box=sakura]) .vn-input textarea{background:rgba(255,255,255,.7)}
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
/* 镜头: the scene (background and people, not the text box) pushes in, snaps, sways or tilts toward whoever speaks. */
.vn-bg,.vn-cast{transform-origin:var(--vn-focus,50%) var(--vn-focus-y,38%)}
.sttts-vn[data-fx][data-cam=push] :is(.vn-bg,.vn-cast){animation:vn-cam-push 2.8s cubic-bezier(.33,0,.2,1)}
.sttts-vn[data-fx][data-cam=snap] :is(.vn-bg,.vn-cast){animation:vn-cam-snap 1.2s cubic-bezier(.2,.9,.25,1)}
.sttts-vn[data-fx][data-cam=sway] :is(.vn-bg,.vn-cast){animation:vn-cam-sway 2.2s ease-in-out}
.sttts-vn[data-fx][data-cam=tilt] :is(.vn-bg,.vn-cast){animation:vn-cam-tilt 2.2s cubic-bezier(.33,0,.2,1)}
@keyframes vn-cam-push{0%{transform:none}40%,72%{transform:scale(1.055)}100%{transform:none}}
@keyframes vn-cam-snap{0%{transform:none}14%{transform:scale(1.1)}38%{transform:scale(1.075)}100%{transform:none}}
@keyframes vn-cam-sway{0%,100%{transform:none}22%{transform:scale(1.03) translate(.5%,-.3%) rotate(.3deg)}48%{transform:scale(1.03) translate(-.45%,.25%) rotate(-.25deg)}74%{transform:scale(1.03) translate(.3%,.2%) rotate(.18deg)}}
@keyframes vn-cam-tilt{0%{transform:none}30%,74%{transform:scale(1.05) rotate(-1.1deg)}100%{transform:none}}
/* 集中线: lines rushing in toward whoever speaks (surprise, anger). */
.vn-lines{position:absolute;inset:-12%;pointer-events:none;opacity:0;z-index:3;--vn-line-ink:rgba(255,255,255,.55);background:repeating-conic-gradient(from 0deg at var(--vn-focus,50%) 40%,transparent 0deg 2.1deg,var(--vn-line-ink) 2.3deg 2.6deg,transparent 2.8deg 4.9deg,var(--vn-line-ink) 5deg 5.15deg,transparent 5.3deg 7.4deg);-webkit-mask:radial-gradient(ellipse at var(--vn-focus,50%) 40%,transparent 30%,#000 72%);mask:radial-gradient(ellipse at var(--vn-focus,50%) 40%,transparent 30%,#000 72%)}
.vn-lines[data-kind=dark]{--vn-line-ink:rgba(30,0,8,.6)}
.sttts-vn[data-fx] .vn-lines[data-on]{animation:vn-lines .8s ease-out}
@keyframes vn-lines{0%{opacity:0;transform:scale(1.22)}16%{opacity:1}100%{opacity:0;transform:scale(1)}}
.vn-tint[data-tint=warm]{background:radial-gradient(ellipse at 12% 0%,rgba(255,206,140,.42),transparent 58%),radial-gradient(ellipse at center,transparent 62%,rgba(255,190,120,.22) 100%)}
/* A CG behind a blur does not drift (a moving blur is the heaviest thing on the stage). */
.sttts-vn[data-cg]:is([data-whole],[data-hidden]) .vn-bg-layer[data-on]{animation:none}
.sttts-vn[data-fx]:not([data-lite]) .vn-bg-layer[data-on]{will-change:transform}
/* 手机: no drifting background, no blur behind the text box and the menus, no shadow redrawn under moving people. */
.sttts-vn[data-lite][data-fx] .vn-bg-layer[data-on]:not([data-reveal]){animation:none}
.sttts-vn[data-lite][data-fx] .vn-bg-layer[data-on][data-reveal]{animation:vn-reveal 1.1s cubic-bezier(.22,1,.36,1)}
.sttts-vn[data-lite] :is(.vn-box,.vn-menu button,.vn-more,.vn-log){-webkit-backdrop-filter:none;backdrop-filter:none}
.sttts-vn[data-lite] .vn-actor{filter:none}
.sttts-vn[data-lite] .vn-actor[data-dim]{filter:brightness(.58) saturate(.85)}
/* 立绘 alive: breathing a little all the time, bobbing while they talk (other properties than the moves use). */
.sttts-vn[data-fx] .vn-actor{animation:vn-breathe var(--vn-breath,5.4s) ease-in-out var(--vn-phase,0s) infinite}
.sttts-vn[data-fx] .vn-actor[data-talking]{animation:vn-breathe var(--vn-breath,5.4s) ease-in-out var(--vn-phase,0s) infinite,vn-talk .32s ease-in-out infinite alternate}
@keyframes vn-breathe{0%,100%{scale:1 1}50%{scale:1.005 1.012}}
@keyframes vn-talk{from{translate:0 0}to{translate:0 -.5%}}
/* Poses held while a line is said. */
.vn-actor[data-pose] :is(img,canvas){transition:transform .55s cubic-bezier(.22,1,.36,1),filter .45s}
.vn-actor[data-pose=approach] :is(img,canvas){transform:scale(1.07) translateY(1.8%)}
.vn-actor[data-pose=turn] img:not(.vn-was){transform:scaleX(-1)}
.vn-actor[data-pose=tilt] :is(img,canvas){transform:rotate(var(--vn-tilt,-2.2deg))}
.vn-actor[data-pose=shrink] :is(img,canvas){transform:scale(.96) translateY(1.4%)}
.vn-actor[data-pose=lean] :is(img,canvas){transform:translateX(var(--vn-lean,2.4%)) rotate(var(--vn-tilt,.8deg))}
.vn-actor[data-pose=sink] :is(img,canvas){transform:translateY(2.5%);filter:saturate(.8) brightness(.93)}
.vn-actor[data-pose=droop] :is(img,canvas){transform:translateY(3.2%) rotate(-1.4deg);filter:saturate(.75) brightness(.9)}
/* One-shot moves (the story's 点头, 摇头, 鞠躬 … and the feelings'). */
.sttts-vn[data-fx] .vn-actor[data-sway] :is(img,canvas){animation:vn-sway .9s ease-in-out}
.sttts-vn[data-fx] .vn-actor[data-stomp] :is(img,canvas){animation:vn-stomp .5s cubic-bezier(.3,1.4,.5,1)}
.sttts-vn[data-fx] .vn-actor[data-lunge] :is(img,canvas){animation:vn-lunge .55s cubic-bezier(.2,.9,.3,1)}
.sttts-vn[data-fx] .vn-actor[data-recoil] :is(img,canvas){animation:vn-recoil .6s cubic-bezier(.2,.9,.3,1)}
.sttts-vn[data-fx] .vn-actor[data-nod] :is(img,canvas){animation:vn-nod .8s ease-in-out}
.sttts-vn[data-fx] .vn-actor[data-headshake] :is(img,canvas){animation:vn-headshake .8s ease-in-out}
.sttts-vn[data-fx] .vn-actor[data-wiggle] :is(img,canvas){animation:vn-wiggle .9s ease-in-out}
.sttts-vn[data-fx] .vn-actor[data-bow] :is(img,canvas){animation:vn-bow 1.3s ease-in-out}
.sttts-vn[data-fx] .vn-actor[data-giggle] :is(img,canvas){animation:vn-giggle .7s ease-in-out}
.sttts-vn[data-fx] .vn-actor[data-shrug] :is(img,canvas){animation:vn-shrug .8s ease-in-out}
.sttts-vn[data-fx] .vn-actor[data-jump] :is(img,canvas){animation:vn-jump .7s cubic-bezier(.3,1.5,.5,1)}
.sttts-vn[data-fx] .vn-actor[data-puff] :is(img,canvas){animation:vn-puff .6s ease-in-out}
.sttts-vn[data-fx] .vn-actor[data-settle] :is(img,canvas){animation:vn-settle .6s ease-out}
@keyframes vn-sway{0%,100%{transform:none}30%{transform:rotate(1.6deg)}70%{transform:rotate(-1.2deg)}}
@keyframes vn-stomp{0%,100%{transform:none}25%{transform:translateY(-2.5%)}50%{transform:translateY(1%) scale(1.02,.98)}}
@keyframes vn-lunge{0%,100%{transform:none}35%{transform:scale(1.08) translateY(1.5%)}}
@keyframes vn-recoil{0%,100%{transform:none}30%{transform:scale(.94) translateY(1%)}}
@keyframes vn-nod{0%,100%{transform:none}20%,60%{transform:translateY(1.4%) rotate(.3deg)}40%,80%{transform:none}}
@keyframes vn-headshake{0%,100%{transform:none}20%{transform:translateX(-.8%) rotate(-.8deg)}45%{transform:translateX(.8%) rotate(.8deg)}70%{transform:translateX(-.5%) rotate(-.5deg)}}
@keyframes vn-wiggle{0%,100%{transform:none}25%,75%{transform:rotate(1.4deg)}50%{transform:rotate(-1.4deg)}}
@keyframes vn-bow{0%,100%{transform:none}35%,65%{transform:translateY(4%) scale(1,.97)}}
@keyframes vn-giggle{0%,100%{transform:none}20%,60%{transform:translateY(-1%)}40%,80%{transform:translateY(.3%)}}
@keyframes vn-shrug{0%,100%{transform:none}30%,60%{transform:translateY(-1.5%) scale(1.01,.99)}}
@keyframes vn-jump{0%,100%{transform:none}30%{transform:translateY(-7%)}55%{transform:translateY(0) scale(1.03,.97)}}
@keyframes vn-puff{0%,100%{transform:none}40%{transform:scale(1.04)}}
@keyframes vn-settle{0%{transform:translateY(-1%)}100%{transform:none}}
/* More shots: a close-up on the speaker, a sudden zoom, a pull back, a slow drift. A close-up blurs what is behind. */
.sttts-vn[data-fx][data-cam=close] :is(.vn-bg,.vn-cast){animation:vn-cam-close 4.2s cubic-bezier(.3,0,.2,1)}
.sttts-vn[data-fx][data-cam=zoom] :is(.vn-bg,.vn-cast){animation:vn-cam-zoom 1.6s cubic-bezier(.15,.9,.2,1)}
.sttts-vn[data-fx][data-cam=pull] :is(.vn-bg,.vn-cast){animation:vn-cam-pull 2.8s cubic-bezier(.3,0,.2,1)}
.sttts-vn[data-fx][data-cam=drift] :is(.vn-bg,.vn-cast){animation:vn-cam-drift 4s ease-in-out}
@keyframes vn-cam-close{0%{transform:none}30%,80%{transform:scale(1.16)}100%{transform:none}}
@keyframes vn-cam-zoom{0%{transform:none}10%{transform:scale(1.13)}70%{transform:scale(1.1)}100%{transform:none}}
@keyframes vn-cam-pull{0%{transform:scale(1.12)}100%{transform:none}}
@keyframes vn-cam-drift{0%,100%{transform:none}50%{transform:scale(1.04) translateX(-1.2%)}}
.sttts-vn[data-fx]:not([data-lite])[data-cam=close] .vn-bg{filter:blur(2.5px) brightness(.9);transition:filter .6s}
/* The light of the scene (time of day, lamplight), over everything on the stage. */
.vn-grade{position:absolute;inset:0;pointer-events:none;z-index:2;opacity:0;transition:opacity 1.6s ease}
.sttts-vn[data-fx][data-grade] .vn-grade{opacity:1}
.sttts-vn[data-grade=night] .vn-grade{background:linear-gradient(180deg,rgba(26,38,104,.5),rgba(10,12,48,.55));mix-blend-mode:multiply}
.sttts-vn[data-grade=dusk] .vn-grade{background:linear-gradient(180deg,rgba(140,80,190,.5),rgba(255,140,60,.6));mix-blend-mode:soft-light}
.sttts-vn[data-grade=dawn] .vn-grade{background:linear-gradient(180deg,rgba(255,196,170,.6),rgba(255,236,200,.35));mix-blend-mode:soft-light}
.sttts-vn[data-grade=day] .vn-grade{background:radial-gradient(ellipse at 20% 0%,rgba(255,250,220,.4),transparent 62%);mix-blend-mode:screen}
.sttts-vn[data-grade=warm] .vn-grade{background:radial-gradient(ellipse at 50% 40%,rgba(255,190,110,.55),rgba(120,50,10,.6) 100%);mix-blend-mode:soft-light}
.sttts-vn[data-grade=cold] .vn-grade{background:linear-gradient(180deg,rgba(150,166,196,.4),rgba(80,92,116,.4));mix-blend-mode:multiply}
/* Light pouring in. */
.vn-rays{position:absolute;inset:-20%;z-index:2;pointer-events:none;opacity:0;transform-origin:18% 0;background:repeating-conic-gradient(from 200deg at 18% -10%,rgba(255,244,214,0) 0deg 6deg,rgba(255,244,214,.24) 8deg 11deg,rgba(255,244,214,0) 13deg 20deg);-webkit-mask:linear-gradient(170deg,#000 10%,transparent 75%);mask:linear-gradient(170deg,#000 10%,transparent 75%);mix-blend-mode:screen;transition:opacity 1.4s}
.sttts-vn[data-fx][data-rays] .vn-rays{opacity:1;animation:vn-rays 9s ease-in-out infinite alternate}
@keyframes vn-rays{from{transform:rotate(-2deg)}to{transform:rotate(2deg)}}
/* A blow lands: the picture flashes to its negative and shakes. Something goes wrong: it glitches. */
.sttts-vn[data-fx][data-impact] .vn-stage{animation:vn-impact .5s linear both}
@keyframes vn-impact{0%{filter:invert(1) contrast(1.6) grayscale(1);transform:translate(-16px,8px)}14%{filter:none;transform:translate(14px,-9px)}28%{filter:invert(1) contrast(1.4) grayscale(1);transform:translate(-10px,5px)}44%{filter:none;transform:translate(7px,-3px)}70%{transform:translate(-3px,1px)}100%{filter:none;transform:none}}
.sttts-vn[data-fx][data-glitch] .vn-stage{animation:vn-glitch .8s steps(8) both}
@keyframes vn-glitch{0%{transform:none;filter:none}12%{transform:translate(-8px,2px);filter:hue-rotate(80deg) saturate(1.6);clip-path:inset(12% 0 58% 0)}24%{transform:translate(6px,-3px);clip-path:inset(46% 0 20% 0)}36%{transform:translate(-4px,0);filter:hue-rotate(-60deg);clip-path:none}50%{transform:translate(3px,1px);filter:drop-shadow(5px 0 rgba(255,0,60,.6)) drop-shadow(-5px 0 rgba(0,220,255,.6))}64%{transform:none;filter:none;clip-path:inset(70% 0 6% 0)}76%{clip-path:none;filter:drop-shadow(4px 0 rgba(255,0,60,.5)) drop-shadow(-4px 0 rgba(0,220,255,.5))}100%{transform:none;filter:none;clip-path:none}}
/* Letterbox bars for a quiet, heavy moment. */
.vn-bars::before,.vn-bars::after{content:'';position:absolute;left:0;right:0;height:9vh;background:#000;z-index:4;transition:transform .8s cubic-bezier(.22,1,.36,1);pointer-events:none}
.vn-bars::before{top:0;transform:translateY(-100%)}
.vn-bars::after{bottom:0;transform:translateY(100%)}
.sttts-vn[data-fx][data-bars] .vn-bars::before,.sttts-vn[data-fx][data-bars] .vn-bars::after{transform:none}
/* Cut-in: a band sweeps across with the speaker's face and the shout. */
.vn-cutin{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;overflow:hidden}
.vn-cutin i{position:absolute;left:-15%;right:-15%;top:24%;height:34%;transform:skewY(-7deg) translateX(110%);background:linear-gradient(100deg,var(--vn-plate),color-mix(in srgb,var(--vn-plate) 55%,#000));box-shadow:0 0 0 4px rgba(255,255,255,.9),0 18px 40px rgba(0,0,0,.45);overflow:hidden}
.vn-cutin i::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(100deg,transparent 0 22px,rgba(255,255,255,.22) 22px 24px);animation:vn-speed .35s linear infinite}
.vn-cutin b{position:absolute;right:14%;top:-60%;width:46%;height:220%;background:var(--vn-face) 50% 7%/auto 240% no-repeat;transform:skewY(7deg)}
.vn-cutin span{position:absolute;left:12%;right:50%;top:50%;transform:translateY(-50%) skewY(7deg);color:#fff;font-weight:900;font-size:clamp(22px,4.8vw,60px);line-height:1.2;letter-spacing:.06em;text-shadow:0 3px 0 rgba(0,0,0,.35),0 0 18px rgba(0,0,0,.35);overflow-wrap:anywhere}
.sttts-vn[data-fx] .vn-cutin[data-on]{animation:vn-cutin-fade 1.4s ease forwards}
.sttts-vn[data-fx] .vn-cutin[data-on] i{animation:vn-cutin 1.4s cubic-bezier(.2,.9,.25,1) forwards}
.sttts-vn[data-hidden] .vn-cutin{display:none}
@keyframes vn-cutin-fade{0%{opacity:0}8%,82%{opacity:1}100%{opacity:0}}
@keyframes vn-cutin{0%{transform:skewY(-7deg) translateX(110%)}18%{transform:skewY(-7deg) translateX(0)}78%{transform:skewY(-7deg) translateX(-3%)}100%{transform:skewY(-7deg) translateX(-115%)}}
@keyframes vn-speed{to{background-position:-120px 0}}
/* Time gone by: a card between scenes. */
.vn-card{position:absolute;inset:0;z-index:6;display:grid;place-content:center;justify-items:center;gap:14px;background:#07070d;color:#f4f2ff;opacity:0;pointer-events:none}
.vn-card strong{font:800 clamp(24px,4.4vw,44px)/1.3 "Songti SC","STSong","Noto Serif SC",serif;letter-spacing:.3em;padding-left:.3em}
.vn-card::before,.vn-card::after{content:'';width:min(280px,50vw);height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);justify-self:center}
.sttts-vn[data-fx] .vn-card[data-on]{animation:vn-card 2.6s ease forwards}
.sttts-vn[data-fx] .vn-card[data-on] strong{animation:vn-rise 1.2s cubic-bezier(.22,1,.36,1) .25s both}
@keyframes vn-card{0%{opacity:0}18%,70%{opacity:1}100%{opacity:0}}
/* A new CG comes in one of several ways. */
.sttts-vn[data-fx] .vn-bg-layer[data-on][data-reveal=wipe],.sttts-vn[data-fx] .vn-fit[data-reveal=wipe]{animation:vn-wipe 1s cubic-bezier(.65,0,.35,1),vn-drift 28s ease-in-out infinite alternate}
.sttts-vn[data-fx] .vn-bg-layer[data-on][data-reveal=diag],.sttts-vn[data-fx] .vn-fit[data-reveal=diag]{animation:vn-diag 1.1s cubic-bezier(.65,0,.35,1),vn-drift 28s ease-in-out infinite alternate}
.sttts-vn[data-fx] .vn-bg-layer[data-on][data-reveal=zoom],.sttts-vn[data-fx] .vn-fit[data-reveal=zoom]{animation:vn-zoomin 1.2s cubic-bezier(.22,1,.36,1),vn-drift 28s ease-in-out infinite alternate}
.sttts-vn[data-fx] .vn-bg-layer[data-on][data-reveal=white],.sttts-vn[data-fx] .vn-fit[data-reveal=white]{animation:vn-whitein 1.3s ease,vn-drift 28s ease-in-out infinite alternate}
.sttts-vn[data-lite][data-fx] .vn-bg-layer[data-on][data-reveal],.sttts-vn[data-lite][data-fx] .vn-fit[data-reveal]{animation:vn-reveal 1.1s cubic-bezier(.22,1,.36,1)}
@keyframes vn-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
@keyframes vn-diag{from{clip-path:polygon(0 0,0 0,-40% 100%,-40% 100%)}to{clip-path:polygon(0 0,140% 0,100% 100%,-40% 100%)}}
@keyframes vn-zoomin{from{transform:scale(1.3);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes vn-whitein{from{filter:brightness(3) saturate(0);opacity:.3}to{filter:none;opacity:1}}
/* The words: each comes in as it is typed, in the line's tone. */
.vn-ch{display:inline-block;opacity:0;white-space:pre-wrap}
.vn-ch.on{opacity:1}
.sttts-vn[data-fx] .vn-ch.on{animation:vn-ch .24s ease-out both}
@keyframes vn-ch{from{opacity:0;transform:translateY(.22em)}to{opacity:1;transform:none}}
.sttts-vn[data-fx][data-tone=shout] .vn-ch.on{animation:vn-ch-slam .26s cubic-bezier(.2,1.5,.4,1) both}
@keyframes vn-ch-slam{from{opacity:0;transform:scale(1.9)}to{opacity:1;transform:none}}
.sttts-vn[data-fx][data-tone=bounce] .vn-ch.on{animation:vn-ch-hop .34s cubic-bezier(.3,1.7,.5,1) both}
@keyframes vn-ch-hop{from{opacity:0;transform:translateY(.5em) scale(.8)}to{opacity:1;transform:none}}
.sttts-vn[data-fx]:is([data-tone=slow],[data-tone=whisper]) .vn-ch.on{animation:vn-ch-soft .8s ease both}
@keyframes vn-ch-soft{from{opacity:0;transform:translateY(-.15em)}to{opacity:1;transform:none}}
.sttts-vn[data-fx][data-tone=tremble] .vn-ch.on{animation:vn-ch .2s ease-out both,vn-ch-jit .16s steps(2) .2s infinite}
.sttts-vn[data-fx][data-tone=tremble] .vn-ch.on:nth-child(odd){animation:vn-ch .2s ease-out both,vn-ch-jit2 .16s steps(2) .2s infinite}
.sttts-vn[data-lite][data-fx][data-tone=tremble] .vn-ch.on{animation:vn-ch .2s ease-out both}
@keyframes vn-ch-jit{50%{transform:translate(.04em,-.03em)}}
@keyframes vn-ch-jit2{50%{transform:translate(-.04em,.03em)}}
.sttts-vn[data-tone=shout] .vn-text{font-size:calc(var(--vn-size) * 1.16);font-weight:800;letter-spacing:.04em}
.sttts-vn[data-tone=whisper] .vn-text{font-size:calc(var(--vn-size) * .92);letter-spacing:.1em;opacity:.86}
.sttts-vn[data-fx] .vn-box[data-jolt]{animation:vn-jolt .38s linear}
/* The box glows with the line's feeling. */
.vn-box{transition:opacity .3s,transform .3s,box-shadow .6s}
.sttts-vn[data-fx][data-feel=angry] .vn-box{box-shadow:0 0 0 1px rgba(255,90,90,.55),0 0 28px rgba(230,40,60,.35),0 18px 50px rgba(0,0,0,.4)}
.sttts-vn[data-fx][data-feel=sad] .vn-box,.sttts-vn[data-fx][data-feel=tired] .vn-box{box-shadow:0 0 0 1px rgba(120,160,255,.5),0 0 28px rgba(70,110,220,.3),0 18px 50px rgba(0,0,0,.4)}
.sttts-vn[data-fx]:is([data-feel=shy],[data-feel=tender]) .vn-box{box-shadow:0 0 0 1px rgba(255,150,190,.6),0 0 30px rgba(255,120,170,.35),0 18px 50px rgba(0,0,0,.4)}
.sttts-vn[data-fx]:is([data-feel=happy],[data-feel=moved]) .vn-box{box-shadow:0 0 0 1px rgba(255,214,140,.6),0 0 30px rgba(255,190,90,.3),0 18px 50px rgba(0,0,0,.4)}
.sttts-vn[data-fx]:is([data-feel=fearful],[data-feel=nervous]) .vn-box{box-shadow:0 0 0 1px rgba(170,140,230,.5),0 0 26px rgba(90,40,160,.35),0 18px 50px rgba(0,0,0,.45)}
@keyframes vn-jolt{0%,100%{transform:translateX(-50%)}20%{transform:translateX(calc(-50% - 7px))}40%{transform:translateX(calc(-50% + 6px))}60%{transform:translateX(calc(-50% - 4px))}80%{transform:translateX(calc(-50% + 2px))}}
@media (max-width:600px){
 .sttts-vn{font-size:15px}
 .vn-box{min-height:clamp(120px,27vh,190px);padding:26px 16px 18px;border-radius:16px;width:calc(100% - 16px);bottom:max(8px,env(safe-area-inset-bottom))}
 .sttts-vn[data-face] .vn-box{padding-left:86px}
 .vn-face{width:64px;left:12px;bottom:14px;border-radius:14px}
 .vn-name{font-size:15px;min-width:86px;padding:4px 16px;top:-16px}
 .vn-menu{right:0;gap:4px;bottom:calc(100% + 22px)}
 .vn-menu button{padding:4px 10px;font-size:12px}
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
 * more messages are on their way}. look(): the 视觉小说 settings now. voice: {play(step), narrate(step), stop(), on()}.
 * face(name, user): avatar url; sprite(name, {emotion, context, after, names}): the 立绘 url for this line (context:
 * the story just before it; after: right after it; names: who else is in the story). cue(step, {skipping}): a sound or <bgm> of the story is reached. send(text): sends to the tavern (false
 * when it could not). save(patch): keeps a setting. title/subtitle: the title card. backdrop: the picture to start on
 * ({url, soft}); scene: the chat's own background, which comes back after a CG's message. onClose(lastId).
 * models: {has(name), load(name) → Promise<actor>, move?(name, {context, after, names}) → a 动作 for act() or null} —
 * characters with a VRM / Live2D model (vn-model.js) stand as it,
 * their 立绘 only until it is ready; voice.mouth() is the mouth of the voice playing now.
 */
export function openVnStage({doc = document, source, look, voice, face, sprite, cue = () => {}, send, save = () => {}, title = '', subtitle = '', backdrop = null, scene = '', models = null, onClose = () => {}}) {
  const win = doc.defaultView;
  if (!doc.getElementById(STYLE_ID)) { const style = doc.createElement('style'); style.id = STYLE_ID; style.textContent = CSS; doc.head.append(style); }
  const root = doc.createElement('div');
  root.className = 'sttts-vn';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '视觉小说');
  root.tabIndex = -1;
  root.innerHTML = `<div class="vn-stage"><div class="vn-bg"><div class="vn-bg-layer"></div><div class="vn-bg-layer"></div><div class="vn-fit"></div></div><div class="vn-cast"></div><div class="vn-grade"></div><div class="vn-rays"></div><div class="vn-lines"></div><div class="vn-tint"></div><div class="vn-bars"></div><div class="vn-cutin"><i><b></b><span></span></i></div><div class="vn-flash"></div><div class="vn-black"></div></div>
    <div class="vn-box"><nav class="vn-menu" aria-label="视觉小说菜单"><button data-vn="auto" aria-pressed="false">自动</button><button data-vn="skip" aria-pressed="false">快进</button><button data-vn="more" aria-expanded="false" aria-label="更多">⋯</button><div class="vn-more" hidden><button data-vn="back">上一页</button><button data-vn="log">记录</button><button data-vn="voice" aria-pressed="false">语音</button><button data-vn="hide">隐藏</button><button data-vn="full" aria-pressed="false">全屏</button><button data-vn="close" aria-label="退出视觉小说">退出</button></div></nav><div class="vn-name" hidden><span></span></div><div class="vn-face"></div><span class="vn-voice" aria-hidden="true"><i></i><i></i><i></i><i></i></span><p class="vn-text" aria-live="polite"></p><span class="vn-next" aria-hidden="true">▼</span>
      <div class="vn-input"><textarea rows="2" placeholder="接下来你要说什么、做什么？空着发送就让故事接着写" aria-label="接下来的剧情"></textarea><button data-vn="send">发送</button></div></div>
    <div class="vn-log" hidden><header><span>记 录</span><button data-vn="log-close">返回</button></header><ol></ol></div>
    <div class="vn-card"><strong></strong></div>
    <div class="vn-title"><small>VISUAL NOVEL</small><strong>${esc(title || '视觉小说')}</strong>${subtitle ? `<em>${esc(subtitle)}</em>` : ''}</div>`;
  const $ = s => root.querySelector(s);
  const box = $('.vn-box'), nameEl = $('.vn-name'), textEl = $('.vn-text'), faceEl = $('.vn-face'), castEl = $('.vn-cast'), logEl = $('.vn-log'), titleEl = $('.vn-title');
  const layers = [...root.querySelectorAll('.vn-bg-layer')], input = $('.vn-input textarea');
  const focus = doc.activeElement;
  doc.body.append(root);

  let steps = [], pos = 0, message = null, lastId = null, step = null, typed = true, typing = 0, closed = false;
  let auto = false, skip = false, autoTimer = 0, skipTimer = 0, hidden = false, cg = false, layer = 0, bgUrl = '', ended = false, waiting = false, clock = 0, phase = 'idle', titleTimer = 0;
  const actors = new Map(), log = [], lookOf = new Map(), modelOf = new Map(), lost = new Set();
  let typedChar = '', typedFrom = 0, loop = 0, lastFrame = 0;
  let said = '', weatherAge = 0, alone = false, cgPages = 0, lastTint = '', lineNo = 0, lastCut = -9, barsLeft = 0, spans = [], built = '';
  // A phone (or a small computer): the stage leaves out what costs the most to draw (see data-lite in the styles).
  const lite = !!win.matchMedia?.('(pointer: coarse)').matches || (win.navigator?.hardwareConcurrency || 8) <= 4;
  root.toggleAttribute('data-lite', lite);
  // Over the people and the light of the time of day (fireworks and fireflies are lights themselves), under the edges.
  const fx = createFx({doc, host: $('.vn-stage'), after: $('.vn-rays'), lite});
  const fxOn = () => root.hasAttribute('data-fx') && !skip;
  // Pages seen (to go back to) and the messages read so far (going on after going back).
  const seen = [], loaded = [];
  let at = -1;

  function applyLook() {
    const s = look();
    root.dataset.box = s.box === 'phone' && !s.palette ? 'day' : s.box;
    for (const [k, c] of Object.entries(s.palette || {})) root.style.setProperty('--vn-p-' + k, c);
    root.style.setProperty('--vn-op', String(s.opacity));
    root.style.setProperty('--vn-size', {s: '16px', m: '19px', l: '22px'}[s.font] || '19px');
    root.toggleAttribute('data-fx', s.effects !== false && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    if (!root.hasAttribute('data-fx')) { fx?.clear(); root.removeAttribute('data-memory'); }
    $('[data-vn=voice]').setAttribute('aria-pressed', String(s.voice && voice.on()));
    $('[data-vn=voice]').hidden = !voice.on();
  }
  applyLook();
  const full = $('[data-vn=full]');
  full.hidden = !root.requestFullscreen;

  // ---------- background ----------
  const cssUrl = url => `url("${String(url).replace(/["\\]/g, '\\$&')}")`;
  /** Whether the CG on the stage is seen whole (its shape far from the screen's), from its size once it has loaded. */
  let cgSize = null;
  const fitCg = () => root.toggleAttribute('data-whole', !!cgSize && !coverFits(cgSize[0], cgSize[1], win.innerWidth, win.innerHeight));
  function setBg(url, {soft = false, flash = false, cg: whole = false} = {}) {
    root.toggleAttribute('data-soft', soft);
    root.toggleAttribute('data-cg', whole && !!url);
    if (whole && url) {
      const fit = $('.vn-fit');
      fit.style.backgroundImage = cssUrl(url);
      cgSize = null; fitCg();
      const img = new win.Image();
      img.onload = () => { if (bgUrl === url) { cgSize = [img.naturalWidth, img.naturalHeight]; fitCg(); } };
      img.src = url;
      if (!skip) { fit.removeAttribute('data-reveal'); void fit.offsetWidth; fit.setAttribute('data-reveal', revealOf(url)); }
    }
    if (url === bgUrl) return;
    bgUrl = url;
    const next = layers[layer = 1 - layer], prev = layers[1 - layer];
    next.style.backgroundImage = url ? cssUrl(url) : '';
    next.toggleAttribute('data-on', !!url);
    prev.removeAttribute('data-on');
    if (whole && !skip) next.setAttribute('data-reveal', revealOf(url)); else next.removeAttribute('data-reveal');
    if (whole) win.setTimeout(() => next.removeAttribute('data-reveal'), 1200);
    if (flash) blink('');
  }
  /** How a CG comes in: the same picture always the same way, pictures by turns in several ways. */
  const REVEALS = ['circle', 'wipe', 'diag', 'zoom', 'white'], revealOf = url => REVEALS[hashOf(url) % REVEALS.length];
  function blink(kind) { const f = $('.vn-flash'); f.dataset.kind = kind; f.removeAttribute('data-on'); void f.offsetWidth; f.setAttribute('data-on', ''); }
  /** One of the overlays (tint, black) or the stage (shake, a camera move) plays its animation again. */
  function replay(el, attr, value = '', ms = 0) {
    el.removeAttribute(attr); void el.offsetWidth; el.setAttribute(attr, value);
    if (ms) win.setTimeout(() => { if (el.getAttribute(attr) === value) el.removeAttribute(attr); }, ms);
  }
  if (backdrop?.url) setBg(backdrop.url, {soft: backdrop.soft !== false});
  /** After a CG's message: the chat's own background comes back; without one the CG stays, dimmed. */
  function endCg() {
    if (!cg) return;
    cg = false; alone = false;
    root.removeAttribute('data-cg'); root.removeAttribute('data-whole');
    if (scene) setBg(scene); else root.setAttribute('data-soft', '');
  }

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
  function enter(name, url, model = null) {
    let a = actors.get(name);
    if (!a) {
      if (actors.size >= 3) leave([...actors.values()].sort((x, y) => x.last - y.last)[0].name);
      const el = doc.createElement('div');
      el.className = 'vn-actor';
      if (model) el.append(model.canvas);
      else { el.innerHTML = `<img alt="${esc(name)}" draggable="false">`; watch(el.querySelector('img'), name, url); el.querySelector('img').src = url; }
      el.setAttribute('data-enter', '');
      // Each breathes at a pace of their own.
      el.style.setProperty('--vn-breath', (4.6 + Math.random() * 1.6).toFixed(2) + 's');
      el.style.setProperty('--vn-phase', (-Math.random() * 5).toFixed(2) + 's');
      castEl.append(el);
      a = {name, el, last: 0, url, model};
      actors.set(name, a);
      placeActors();
      // In from the side it stands on.
      const left = parseFloat(el.style.left) || 50;
      el.style.setProperty('--vn-from', left < 45 ? '-9%' : left > 55 ? '9%' : '0%');
      win.requestAnimationFrame(() => el.setAttribute('data-in', ''));
      win.setTimeout(() => el.removeAttribute('data-enter'), 600);
      if (model) play();
    } else if (model && a.model !== model) putModel(a, model);
    else if (!a.model && a.url !== url) {
      // Another 表情 or 动作: the new picture under the old one, which fades away.
      a.url = url;
      const img = a.el.querySelector('img:not(.vn-was)'), was = img.cloneNode();
      was.classList.add('vn-was');
      a.el.append(was);
      watch(img, name, url);
      img.src = url;
      win.requestAnimationFrame(() => win.requestAnimationFrame(() => was.setAttribute('data-gone', '')));
      win.setTimeout(() => was.remove(), 450);
    }
    a.last = ++clock;
    return a;
  }
  /**
   * A 立绘 whose file is gone (a backup from another tavern, a picture deleted since): no broken picture on the stage,
   * the speaker shows as their avatar in the box instead, and that file is not tried again.
   */
  function watch(img, name, url) {
    img.onerror = () => {
      lost.add(url);
      const a = actors.get(name);
      if (!a || a.model || a.url !== url) return;
      leave(name);
      if (step?.kind === 'say' && step.role === name && !step.user) {
        const pic = face(name, false);
        root.setAttribute('data-face', '');
        faceEl.innerHTML = pic ? `<img src="${esc(pic)}" alt="">` : `<span>${esc([...name][0] || '?')}</span>`;
      }
    };
  }

  // ---------- models ----------
  /** A character's model once it is ready (loading starts the first time it is asked for); null without one. */
  function modelFor(name) {
    if (!name || !models?.has(name)) return null;
    let m = modelOf.get(name);
    if (!m) {
      modelOf.set(name, m = {actor: null});
      Promise.resolve().then(() => models.load(name)).then(actor => {
        if (closed) { actor.dispose(); return; }
        m.actor = actor;
        const on = actors.get(name);
        // Ready while they stand there (as their 立绘) or speak: the model takes their place.
        if (on) putModel(on, actor);
        else if (step?.kind === 'say' && step.role === name && !alone) { enter(name, '', actor); spotlight(name); root.removeAttribute('data-face'); faceEl.innerHTML = ''; }
        if (step?.kind === 'say' && step.role === name) actor.feel(step.emotion);
      }).catch(() => { m.failed = true; });
    }
    return m.actor;
  }
  function putModel(a, model) {
    a.model = model; a.url = '';
    a.el.replaceChildren(model.canvas);
    play();
  }
  /** What the speaker's mouth does now: the voice's, the text's while it is typed (no voice coming), else shut. */
  function mouthNow(now) {
    if (step?.kind !== 'say' || step.user) return null;
    if (phase === 'playing') return voice.mouth?.() || null;
    if (!typed && typedChar && !(step.voiced && look().voice && voice.on())) return typedMouth(typedChar, (now - typedFrom) / 1000);
    return null;
  }
  /** The models on the stage move while it is open (and the page is seen). */
  function play() { if (!loop && !closed) { lastFrame = 0; loop = win.requestAnimationFrame(frame); } }
  function frame(now) {
    loop = 0;
    const on = [...actors.values()].filter(a => a.model);
    if (closed || !on.length) return;
    const dt = lastFrame ? Math.min(.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (!doc.hidden) for (const a of on) {
      const speaking = a.el.hasAttribute('data-speaking');
      a.model.mouth(speaking ? mouthNow(now) : null);
      a.model.tick(dt, speaking);
    }
    loop = win.requestAnimationFrame(frame);
  }

  function spotlight(name) {
    for (const a of actors.values()) {
      a.el.toggleAttribute('data-speaking', a.name === name);
      a.el.toggleAttribute('data-dim', !!name && a.name !== name);
    }
  }
  const MOVE_MS = {hop: 520, bounce: 780, tremble: 720, sway: 950, stomp: 520, lunge: 600, recoil: 650, nod: 850, headshake: 850, wiggle: 950, bow: 1350, giggle: 750, shrug: 850, jump: 750, puff: 650, settle: 650};
  const POSES = new Set(['approach', 'turn', 'tilt', 'shrink', 'lean', 'sink', 'droop']);
  function move(kind, actor) {
    if (!kind || skip) return;
    if (POSES.has(kind)) { pose(actor, kind); return; }
    if (kind === 'shake') replay(root, 'data-shake', '', 450);
    else if (kind === 'stomp') { replay(root, 'data-shake', '', 450); if (actor) replay(actor.el, 'data-stomp', '', MOVE_MS.stomp); }
    else if (actor) replay(actor.el, 'data-' + kind, '', MOVE_MS[kind] || 600);
  }
  /** A pose held while the line is said (leaning and tilting toward the middle of the stage). */
  function pose(actor, kind) {
    if (!actor) return;
    if (!kind) { delete actor.el.dataset.pose; return; }
    actor.el.dataset.pose = kind;
    const left = (parseFloat(actor.el.style.left) || 50) < 50;
    actor.el.style.setProperty('--vn-lean', (left ? 2.4 : -2.4) + '%');
    actor.el.style.setProperty('--vn-tilt', (left ? 1 : -1) * (kind === 'tilt' ? 2.2 : .8) + 'deg');
  }
  /** Whoever speaks bobs while their words come in and while their voice plays. */
  function talk() {
    const speaker = step?.kind === 'say' && !step.user ? actors.get(step.role) : null;
    const on = !!speaker && !speaker.model && (!typed || phase === 'playing');
    for (const a of actors.values()) a.el.toggleAttribute('data-talking', on && a === speaker);
  }
  /** The 2D move for a 动作 the story names around a line (the models' 点头, 摇头 … as a 立绘 can do them). */
  const MOVE_2D = {wave: 'wiggle', nod: 'nod', shake: 'headshake', bow: 'bow', hop: 'hop', crossArms: 'settle', handsHips: 'puff', coverMouth: 'giggle', point: 'lean', shrug: 'shrug', cheer: 'jump', think: 'tilt', handChest: 'settle', coverFace: 'shrink', lookAway: 'turn', tilt: 'tilt'};
  /** A cut-in: a band sweeps across with the speaker's face and what they shout. */
  function cutIn(actor, text) {
    if (!actor?.url) return;
    const el = $('.vn-cutin');
    el.style.setProperty('--vn-face', cssUrl(actor.url));
    el.querySelector('span').textContent = String(text).replace(/^[「『]|[」』]$/g, '');
    replay(el, 'data-on', '', 1450);
  }
  /** Time gone by: a card between scenes. */
  function card(label) {
    const el = $('.vn-card');
    el.querySelector('strong').textContent = label;
    replay(el, 'data-on', '', 2700);
  }
  /** 镜头 and 集中线 aim at whoever speaks (the middle of the stage when no one stands there). */
  function focusOn(actor) {
    const r = root.getBoundingClientRect();
    let x = 50, y = 38;
    if (actor && r.width) { const a = actor.el.getBoundingClientRect(); x = (a.left + a.width / 2 - r.left) / r.width * 100; y = (a.top + a.height * 0.2 - r.top) / r.height * 100; }
    root.style.setProperty('--vn-focus', Math.max(12, Math.min(88, x)).toFixed(1) + '%');
    root.style.setProperty('--vn-focus-y', Math.max(12, Math.min(60, y || 38)).toFixed(1) + '%');
  }
  function camera(kind, actor) {
    if (!kind) return;
    focusOn(actor);
    replay(root, 'data-cam', kind, {push: 2900, snap: 1250, sway: 2300, tilt: 2300, close: 4300, zoom: 1650, pull: 2850, drift: 4100}[kind] || 2000);
  }
  function rush(kind, actor) {
    if (!kind) return;
    focusOn(actor);
    const lines = $('.vn-lines');
    lines.dataset.kind = kind;
    replay(lines, 'data-on', '', 850);
  }
  /** Where light gathers: by the speaker's head, else above the text box. */
  function headOf(actor) {
    const r = root.getBoundingClientRect();
    if (actor) { const a = actor.el.getBoundingClientRect(); return [a.left - r.left + a.width / 2, a.top - r.top + a.height * 0.2]; }
    const b = box.getBoundingClientRect();
    return [b.left - r.left + Math.min(220, b.width / 3), b.top - r.top - 20];
  }
  /**
   * A line acted from its 情绪 (one of several ways for that feeling, the same line always the same way) and from the
   * 动作 the story names around it (motion); the story between the lines brings the weather and the rest.
   */
  function act(s, actor, motion = '') {
    if (!fxOn()) { root.removeAttribute('data-bars'); return; }
    if (s.kind === 'say') {
      if (s.part) return;
      lineNo++;
      const f = lineStage(s.emotion, s.text, `${lastId}:${s.line ?? lineNo}`);
      if (motion && actor && !actor.model) { move(motion, actor); if (!POSES.has(motion)) pose(actor, f.pose); }
      else { move(f.move, actor); if (!POSES.has(f.move)) pose(actor, f.pose); }
      camera(f.camera, actor);
      rush(f.lines, actor);
      if (f.burst) { const [x, y] = headOf(actor); fx.burst(f.burst, x, y); }
      // The same glow line after line would only tire the eyes: once, until the feeling changes.
      if (f.tint && f.tint !== lastTint) { const t = $('.vn-tint'); t.dataset.tint = f.tint; replay(t, 'data-on', '', 2000); }
      lastTint = f.tint;
      if (f.tone === 'shout') replay(box, 'data-jolt', '', 420);
      root.dataset.feel = f.feel || '';
      // A cut-in now and then for a shout (not two in a row), short enough to read across the band.
      if (f.cut && actor && !actor.model && lineNo - lastCut >= 3 && [...String(s.text)].length <= 18) { cutIn(actor, s.text); lastCut = lineNo; }
      if (f.bars) { barsLeft = 2; root.setAttribute('data-bars', ''); } else if (barsLeft > 0 && --barsLeft === 0) root.removeAttribute('data-bars');
      return;
    }
    const f = storyFx(s.text);
    root.toggleAttribute('data-memory', f.memory);
    if (f.flash === 'lightning') { blink('lightning'); replay(root, 'data-shake', '', 450); fx.lightning?.(); }
    if (f.flash === 'boom') { blink('boom'); replay(root, 'data-shake', 'big', 780); }
    if (f.impact && !f.flash) { replay(root, 'data-impact', '', 560); rush('dark', null); }
    if (f.glitch) replay(root, 'data-glitch', '', 850);
    if (f.pulse) { const t = $('.vn-tint'); t.dataset.tint = 'beat'; replay(t, 'data-on', '', 1600); }
    if (f.blackout) replay($('.vn-black'), 'data-on', '', 2400);
    if (f.rays) root.setAttribute('data-rays', '');
    if (barsLeft > 0 && --barsLeft === 0) root.removeAttribute('data-bars');
  }
  /** The weather the story names stays a while: until it changes or stops, or two messages go by without it. */
  function weatherFrom(s) {
    if (s.kind !== 'narrate' || !root.hasAttribute('data-fx')) return;
    const {weather: w, grade} = storyFx(s.text);
    // The light of the time of day stays until another is named.
    if (grade) root.dataset.grade = grade;
    if (!w) return;
    weatherAge = 0;
    fx.weather(w === 'clear' ? '' : w);
  }

  // ---------- text ----------
  function finishTyping() {
    win.cancelAnimationFrame(typing); typing = 0;
    typed = true; typedChar = '';
    const full = textEl.dataset.full || '';
    // The words typed so far stay as they are (a trembling line keeps trembling); the rest come in at once.
    if (built === full && spans.length) for (const el of spans) el.classList.add('on');
    else { textEl.textContent = full; spans = []; built = ''; }
    root.setAttribute('data-done', '');
    planAuto();
    talk();
  }
  /**
   * The words in pieces that come in one by one: a character each, a closing mark kept with the one before it and an
   * opening one with the one after (a line never starts with ，), a word of letters or digits whole.
   */
  function pieces(text) {
    const out = [];
    for (const ch of text) {
      const prev = out[out.length - 1];
      if (ch === '\n' || ch === ' ' || ch === '\u3000') { out.push(ch); continue; }
      const glue = prev && !/^[\n \u3000]$/.test(prev) && (/[，。！？、；：」』）)”’》〉】\]…—,.!?;:~～]/.test(ch) || /[「『（(“‘《〈【\[]$/.test(prev) || /[A-Za-z0-9'’]/.test(ch) && /[A-Za-z0-9'’]$/.test(prev));
      if (glue) out[out.length - 1] = prev + ch; else out.push(ch);
    }
    return out;
  }
  // A pause after a mark (in characters' time), and the pace of each tone.
  const PAUSE = {'，': 3.5, ',': 3.5, '、': 2.5, '；': 4, ';': 4, '：': 3, ':': 3, '。': 6, '.': 5, '！': 6, '!': 5, '？': 6, '?': 5, '…': 4, '—': 2.5, '～': 2, '~': 2};
  const PACE = {shout: .6, whisper: 1.35, tremble: 1.1, slow: 1.45, bounce: .9};
  function type(text) {
    win.cancelAnimationFrame(typing);
    typed = false;
    root.removeAttribute('data-done');
    textEl.dataset.full = text;
    const per = VN_SPEEDS[look().speed] ?? VN_SPEEDS[2];
    if (!per || skip) { finishTyping(); return; }
    const parts = pieces(text), pace = per * (PACE[root.dataset.tone] || 1), when = [];
    let t = 0;
    for (const part of parts) {
      if (/^[\n \u3000]$/.test(part)) continue;
      when.push(t);
      const n = [...part].length, end = [...part].pop();
      t += pace * n + (PAUSE[end] ? pace * (PAUSE[end] - 1) : 0);
    }
    textEl.innerHTML = parts.map(part => /^[\n \u3000]$/.test(part) ? esc(part) : `<span class="vn-ch">${esc(part)}</span>`).join('');
    spans = [...textEl.querySelectorAll('.vn-ch')]; built = text;
    const start = typedFrom = win.performance.now();
    let shown = 0;
    const tick = now => {
      const gone = (now - start) / 1000;
      while (shown < spans.length && when[shown] <= gone) spans[shown++].classList.add('on');
      typedChar = spans[shown - 1]?.textContent.slice(-1) || '';
      if (shown < spans.length) typing = win.requestAnimationFrame(tick); else finishTyping();
    };
    typing = win.requestAnimationFrame(tick);
    talk();
  }

  // ---------- steps ----------
  /** The story right after a line (up to the next one said): 「……」她抱起手臂。 acts the line before it. */
  function storyAfter(s) {
    let i = steps.indexOf(s), text = '';
    if (i < 0) return '';
    while (steps[i + 1]?.kind === 'say' && steps[i + 1].line === s.line && steps[i + 1].role === s.role) i++;
    for (let k = i + 1; k < steps.length && steps[k].kind !== 'say' && text.length < 200; k++) if (steps[k].kind === 'narrate') text += steps[k].text + '\n';
    return text.slice(0, 200);
  }
  /** Everyone who speaks in this message or has been seen: a 动作 near another one's name is theirs. */
  const people = () => [...new Set([...steps.filter(x => x.kind === 'say').map(x => x.role), ...actors.keys()].filter(Boolean))];
  function show(s, {again = false} = {}) {
    step = s;
    const say = s.kind === 'say', name = say ? s.role : '';
    root.toggleAttribute('data-narrate', !say);
    root.toggleAttribute('data-user', !!s.user);
    if (say && nameEl.firstElementChild.textContent !== name && !again) replay(nameEl, 'data-pop', '', 450);
    nameEl.hidden = !say;
    nameEl.firstElementChild.textContent = name;
    // A 立绘 when there is one (not for the user): on the stage, or over a CG as a bust in the box; else the avatar.
    // Its 表情 or 动作 is chosen on its first page (from its 情绪 and the story just before it) and kept for the rest.
    let url = '';
    if (say && !s.user) {
      url = s.part && lookOf.has(name) ? lookOf.get(name) : sprite(name, {emotion: s.emotion, context: said, after: storyAfter(s), names: people(), line: s.text, last: actors.get(name)?.url || ''});
      if (lost.has(url)) url = '';
      lookOf.set(name, url);
    }
    const model = say && !s.user ? modelFor(name) : null;
    // A 动作 the story right around the line names (挥手, 鞠躬 …), for a character standing as a model.
    const gesture = model && !s.part && !again ? models.move?.(name, {context: said, after: storyAfter(s), names: people()}) : null;
    // The same for a 立绘: the move it can do for a 动作 named around the line.
    const motion = say && !s.user && !model && !s.part && !again ? MOVE_2D[moveFor({context: said, after: storyAfter(s), name, names: people()})?.id] || '' : '';
    if (say) said = ''; else said = (said + '\n' + s.text).slice(-400);
    // A new CG is seen alone for two pages; the next one who speaks with a 立绘 brings them back in front of it.
    if (!again && cg) cgPages++;
    if (alone && (url || model) && cgPages > 2) { alone = false; root.setAttribute('data-soft', ''); }
    if (!say && !again) root.removeAttribute('data-memory');
    let actor = null;
    if (say && !url && !model) leave(name);
    if ((url || model) && !alone) actor = enter(name, url, model);
    if (actor?.model && !s.part) actor.model.feel(s.emotion);
    if (actor?.model && gesture && !skip) actor.model.act(gesture)?.catch?.(() => {});
    if (actor && !s.part) { actor.el.removeAttribute('data-sink'); delete actor.el.dataset.pose; }
    // Whoever speaks is lit; the others dim (all of them when the speaker has no 立绘 on the stage).
    spotlight(say ? name : '');
    const bust = say && !actor && alone ? url : '', pic = say && !actor ? bust || face(name, s.user) : '';
    root.toggleAttribute('data-face', say && !actor);
    faceEl.innerHTML = pic ? `<img src="${esc(pic)}" alt=""${bust ? ' class="vn-bust"' : ''}>` : say && !actor ? `<span>${esc([...name][0] || '?')}</span>` : '';
    weatherFrom(s);
    root.dataset.tone = say ? toneOf(s.text, s.emotion) : '';
    if (!say) root.dataset.feel = '';
    // Time gone by, at the start of a message: a card first.
    if (!say && !again && fxOn() && !steps.slice(0, steps.indexOf(s)).some(x => x.kind === 'say' || x.kind === 'narrate')) { const gone = storyFx(s.text).skip; if (gone) card(gone); }
    if (!again) act(s, actor, motion);
    // Voice: a line plays from its first page on; anything else stops the one before.
    if (!(say && s.part) || again) voice.stop();
    type(say ? quoted(s.text) : s.text);
    if (again) return;
    if (say && !s.part && !s.user && !skip && look().voice && voice.on() && s.voiced) voice.play(s);
    // 旁白: the story between the lines in the narrator's voice (整篇朗读's).
    if (!say && !s.imageOnly && !skip && look().narrate && look().voice && voice.on()) voice.narrate?.(s);
    if (!s.imageOnly) log.push({name, text: say ? quoted(s.text) : s.text, step: say && s.voiced && !s.part ? s : null});
    if (log.length > 600) log.shift();
  }
  function nextMessage() {
    let m = loaded[at + 1];
    if (!m) { m = source.next(); if (!m) return false; loaded.push(m); at = loaded.length - 1; } else at++;
    message = m; steps = m.steps; pos = 0; lastId = m.id; said = '';
    for (const x of steps) if (x.kind === 'say' && !x.user) modelFor(x.role);
    endCg();
    root.removeAttribute('data-memory'); root.removeAttribute('data-rays'); root.removeAttribute('data-bars'); barsLeft = 0;
    if (++weatherAge > 2) fx.weather('');
    return true;
  }
  function next() {
    win.clearTimeout(autoTimer);
    if (closed || ended && !waiting) return;
    for (;;) {
      if (pos >= steps.length && !nextMessage()) { theEnd(); return; }
      const s = steps[pos++];
      if (!s) continue;
      if (s.kind === 'bg') { cg = true; alone = true; cgPages = 0; clearActors(); setBg(s.url, {flash: !skip, cg: true}); continue; }
      if (s.kind === 'sound' || s.kind === 'bgm') { try { cue(s, {skipping: skip}); } catch {} continue; }
      ended = false; root.removeAttribute('data-end');
      show(s);
      seen.push({m: at, pos, s, bg: {url: bgUrl, cg, alone, cgPages, soft: root.hasAttribute('data-soft')}}); if (seen.length > 400) seen.shift();
      return;
    }
  }
  /** 上一页: the page before again (no voice; going on from there reads on as before). */
  function back() {
    if (closed || waiting || seen.length < 2) return;
    setAuto(false); stopSkip();
    if (!typed) finishTyping();
    seen.pop();
    const h = seen[seen.length - 1];
    if (h.m !== at && loaded[h.m]) { at = h.m; message = loaded[at]; steps = message.steps; lastId = message.id; }
    pos = h.pos; ended = false; root.removeAttribute('data-end');
    if (h.bg) { if (h.bg.url !== bgUrl || h.bg.cg !== cg) clearActors();cg = h.bg.cg;alone = h.bg.alone;cgPages = h.bg.cgPages;setBg(h.bg.url, {cg, soft: h.bg.soft}); }
    show(h.s, {again: true});
  }
  function theEnd() {
    stopSkip();
    ended = true;
    if (!waiting) {
      voice.stop();
      step = null;
      root.setAttribute('data-end', '');
      root.removeAttribute('data-face'); root.setAttribute('data-narrate', ''); root.dataset.tone = ''; nameEl.hidden = true;
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
    list.innerHTML = log.map((e, i) => `<li${e.name ? '' : ' data-narrate'}><b>${esc(e.name)}</b><span>${esc(e.text)}</span>${e.step && voice.on() ? `<button data-vn="replay" data-i="${i}" aria-label="再听一次"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></button>` : '<i></i>'}</li>`).join('');
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
      root.dataset.tone = '';
      textEl.innerHTML = '<span class="vn-dots">故事正在写</span>';
      root.removeAttribute('data-done');
    } finally { button.disabled = false; }
  }

  // ---------- events ----------
  const more = $('.vn-more'), moreButton = $('[data-vn=more]');
  function setMore(open) { more.hidden = !open; moreButton.setAttribute('aria-expanded', String(open)); }
  const actions = {
    more: () => setMore(more.hidden),
    back, auto: () => setAuto(!auto), skip: () => skip ? stopSkip() : startSkip(), log: openLog, 'log-close': closeLog, hide: () => setHidden(true),
    voice: () => { const on = !look().voice; save({voice: on}); if (!on) voice.stop(); applyLook(); },
    full: () => { if (doc.fullscreenElement) doc.exitFullscreen?.(); else root.requestFullscreen?.().catch(() => {}); },
    close: () => close(), send: () => sendText(),
    replay: el => { const e = log[Number(el.dataset.i)]; if (e?.step) voice.play(e.step); },
  };
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-vn]');
    if (b && root.contains(b)) {
      e.stopPropagation();
      if (b.dataset.vn !== 'more' && !more.hidden) setMore(false);
      actions[b.dataset.vn]?.(b);
      return;
    }
    // A tap outside the ⋯ menu closes it first.
    if (!more.hidden) { setMore(false); return; }
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
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!more.hidden) setMore(false); else if (!logEl.hidden) closeLog(); else if (hidden) setHidden(false); else if (typing) input.blur(); else close(); return; }
    if (typing) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText(); } e.stopPropagation(); return; }
    if (e.key === 'Control' && !e.repeat) { startSkip(); e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'backspace') { e.preventDefault(); if (logEl.hidden) back(); }
    else if (['enter', ' ', 'arrowright', 'arrowdown', 'pagedown'].includes(k)) { e.preventDefault(); if (!logEl.hidden && k !== 'arrowdown') closeLog(); else if (logEl.hidden) advance(); }
    else if (['arrowup', 'pageup', 'l'].includes(k)) { e.preventDefault(); if (logEl.hidden) openLog(); }
    else if (k === 'a') setAuto(!auto);
    else if (k === 'h') setHidden(!hidden);
    else if (k === 's') skip ? stopSkip() : startSkip();
    // Nothing reaches the tavern behind (its arrow keys swipe replies).
    e.stopPropagation();
  };
  const onKeyUp = e => { if (e.key === 'Control') stopSkip(); };
  const onFull = () => full.setAttribute('aria-pressed', String(doc.fullscreenElement === root));
  const onResize = () => { placeActors(); fitCg(); fx.resize(); };
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('keyup', onKeyUp, true);
  doc.addEventListener('fullscreenchange', onFull);
  win.addEventListener('resize', onResize);

  function close() {
    if (closed) return;
    closed = true;
    win.clearTimeout(autoTimer); win.clearTimeout(skipTimer); win.clearTimeout(titleTimer); win.cancelAnimationFrame(typing);
    voice.stop();
    fx.dispose();
    win.cancelAnimationFrame(loop);
    for (const m of modelOf.values()) m.actor?.dispose();
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
    status(value) { phase = value || 'idle'; root.dataset.voice = phase; talk(); if (auto && typed && !busyVoice()) planAuto(); },
    /** New messages arrived (a reply was written): the story goes on from where it ended. */
    more() { if (closed) return; const was = waiting; waiting = false; if (ended || was) { ended = false; root.removeAttribute('data-end'); next(); } },
    /** The reply could not be written (stopped or failed): back to the box. */
    failed() { if (closed || !waiting) return; waiting = false; ended = false; theEnd(); },
    /** The settings changed (in the phone's 视觉小说 app). */
    refresh() { if (!closed) applyLook(); },
    /** Where the story is, for tests and the host: {id, kind, text, ended}. */
    state() { return {id: lastId, kind: step?.kind || '', text: textEl.dataset.full || '', ended, waiting, auto, skip}; },
    advance, back,
  };
}
