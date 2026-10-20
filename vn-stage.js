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
// show their avatar in the text box. Effects: each line is acted from its 情绪 (moves, signs over the head, sparkles,
// hearts, a glow at the edges), and the story brings weather, lightning, heartbeats, blackouts and memories (vn-fx.js).
// It brings its own styles, so it works on any theme. Steps come from core/vn.js; vn-host.js feeds them.
import {VN_SPEEDS, VN_WAITS, lineFx, storyFx, coverFits} from './core/vn.js';
import {createFx} from './vn-fx.js';

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
.vn-actor{position:absolute;bottom:0;left:50%;height:min(92%,150vw);transform:translateX(-50%);transition:left .55s cubic-bezier(.22,1,.36,1),opacity .45s,filter .35s;opacity:0;filter:drop-shadow(0 10px 24px rgba(0,0,0,.35))}
.vn-actor img{transform-origin:50% 100%;transition:transform .45s cubic-bezier(.22,1,.36,1),filter .45s}
.vn-actor[data-speaking] img{transform:scale(1.015)}
.vn-actor[data-sink] img{transform:translateY(2.5%);filter:saturate(.8) brightness(.93)}
.vn-actor[data-in]{opacity:1}
.vn-actor[data-dim]{filter:brightness(.58) saturate(.85) drop-shadow(0 10px 24px rgba(0,0,0,.35))}
.vn-actor img{display:block;height:100%;width:auto;max-width:none;-webkit-user-drag:none}
.vn-actor img.vn-was{position:absolute;left:50%;bottom:0;transform:translateX(-50%);opacity:1;transition:opacity .35s}
.vn-actor img.vn-was[data-gone]{opacity:0}
.vn-actor[data-speaking]{z-index:2}
.sttts-vn[data-fx] .vn-actor[data-hop] img{animation:vn-hop .5s cubic-bezier(.3,1.6,.5,1)}
@keyframes vn-hop{0%,100%{transform:none}35%{transform:translateY(-4.5%)}}
.sttts-vn[data-fx] .vn-actor[data-enter] img{animation:vn-enter .55s cubic-bezier(.22,1,.36,1)}
@keyframes vn-enter{from{transform:translate(var(--vn-from,0),4%);opacity:0}}
.sttts-vn[data-fx] .vn-actor[data-bounce] img{animation:vn-bounce .75s ease}
@keyframes vn-bounce{0%,100%{transform:none}22%{transform:translateY(-3.5%)}45%{transform:none}65%{transform:translateY(-1.6%)}82%{transform:none}}
.sttts-vn[data-fx] .vn-actor[data-tremble] img{animation:vn-tremble .7s linear}
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
.vn-bg,.vn-cast{transform-origin:var(--vn-focus,50%) 38%}
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
 */
export function openVnStage({doc = document, source, look, voice, face, sprite, cue = () => {}, send, save = () => {}, title = '', subtitle = '', backdrop = null, scene = '', onClose = () => {}}) {
  const win = doc.defaultView;
  if (!doc.getElementById(STYLE_ID)) { const style = doc.createElement('style'); style.id = STYLE_ID; style.textContent = CSS; doc.head.append(style); }
  const root = doc.createElement('div');
  root.className = 'sttts-vn';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '视觉小说');
  root.tabIndex = -1;
  root.innerHTML = `<div class="vn-stage"><div class="vn-bg"><div class="vn-bg-layer"></div><div class="vn-bg-layer"></div><div class="vn-fit"></div></div><div class="vn-cast"></div><div class="vn-lines"></div><div class="vn-tint"></div><div class="vn-flash"></div><div class="vn-black"></div></div>
    <div class="vn-box"><nav class="vn-menu" aria-label="视觉小说菜单"><button data-vn="auto" aria-pressed="false">自动</button><button data-vn="skip" aria-pressed="false">快进</button><button data-vn="more" aria-expanded="false" aria-label="更多">⋯</button><div class="vn-more" hidden><button data-vn="back">上一页</button><button data-vn="log">记录</button><button data-vn="voice" aria-pressed="false">语音</button><button data-vn="hide">隐藏</button><button data-vn="full" aria-pressed="false">全屏</button><button data-vn="close" aria-label="退出视觉小说">退出</button></div></nav><div class="vn-name" hidden><span></span></div><div class="vn-face"></div><span class="vn-voice" aria-hidden="true"><i></i><i></i><i></i><i></i></span><p class="vn-text" aria-live="polite"></p><span class="vn-next" aria-hidden="true">▼</span>
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
  const actors = new Map(), log = [], lookOf = new Map();
  let said = '', weatherAge = 0, alone = false, cgPages = 0, lastTint = '';
  // A phone (or a small computer): the stage leaves out what costs the most to draw (see data-lite in the styles).
  const lite = !!win.matchMedia?.('(pointer: coarse)').matches || (win.navigator?.hardwareConcurrency || 8) <= 4;
  root.toggleAttribute('data-lite', lite);
  const fx = createFx({doc, host: $('.vn-stage'), after: castEl, lite});
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
      if (!skip) { fit.removeAttribute('data-reveal'); void fit.offsetWidth; fit.setAttribute('data-reveal', ''); }
    }
    if (url === bgUrl) return;
    bgUrl = url;
    const next = layers[layer = 1 - layer], prev = layers[1 - layer];
    next.style.backgroundImage = url ? cssUrl(url) : '';
    next.toggleAttribute('data-on', !!url);
    prev.removeAttribute('data-on');
    next.toggleAttribute('data-reveal', whole && !skip);
    if (whole) win.setTimeout(() => next.removeAttribute('data-reveal'), 1200);
    if (flash) blink('');
  }
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
      a = {name, el, last: 0, url};
      actors.set(name, a);
      placeActors();
      // In from the side it stands on.
      const left = parseFloat(el.style.left) || 50;
      el.style.setProperty('--vn-from', left < 45 ? '-9%' : left > 55 ? '9%' : '0%');
      win.requestAnimationFrame(() => el.setAttribute('data-in', ''));
      win.setTimeout(() => el.removeAttribute('data-enter'), 600);
    } else if (a.url !== url) {
      // Another 表情 or 动作: the new picture under the old one, which fades away.
      a.url = url;
      const img = a.el.querySelector('img:not(.vn-was)'), was = img.cloneNode();
      was.classList.add('vn-was');
      a.el.append(was);
      img.src = url;
      win.requestAnimationFrame(() => win.requestAnimationFrame(() => was.setAttribute('data-gone', '')));
      win.setTimeout(() => was.remove(), 450);
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
    if (kind === 'shake') replay(root, 'data-shake', '', 450);
    else if (kind === 'sink') actor?.el.setAttribute('data-sink', '');
    else if (actor) replay(actor.el, 'data-' + kind, '', {hop: 520, bounce: 780, tremble: 720}[kind] || 600);
  }
  /** 镜头 and 集中线 aim at whoever speaks (the middle of the stage when no one stands there). */
  function focusOn(actor) {
    const r = root.getBoundingClientRect();
    let x = 50;
    if (actor && r.width) { const a = actor.el.getBoundingClientRect(); x = (a.left + a.width / 2 - r.left) / r.width * 100; }
    root.style.setProperty('--vn-focus', Math.max(12, Math.min(88, x)).toFixed(1) + '%');
  }
  function camera(kind, actor) {
    if (!kind) return;
    focusOn(actor);
    replay(root, 'data-cam', kind, {push: 2900, snap: 1250, sway: 2300, tilt: 2300}[kind] || 2000);
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
  /** A line acted from its 情绪; the story between the lines brings the weather and the rest. */
  function act(s, actor) {
    if (!fxOn()) return;
    if (s.kind === 'say') {
      if (s.part) return;
      const f = lineFx(s.emotion);
      move(f.move, actor);
      camera(f.camera, actor);
      rush(f.lines, actor);
      if (f.burst) { const [x, y] = headOf(actor); fx.burst(f.burst, x, y); }
      // The same glow line after line would only tire the eyes: once, until the feeling changes.
      if (f.tint && f.tint !== lastTint) { const t = $('.vn-tint'); t.dataset.tint = f.tint; replay(t, 'data-on', '', 2000); }
      lastTint = f.tint;
      return;
    }
    const f = storyFx(s.text);
    root.toggleAttribute('data-memory', f.memory);
    if (f.flash === 'lightning') { blink('lightning'); replay(root, 'data-shake', '', 450); }
    if (f.flash === 'boom') { blink('boom'); replay(root, 'data-shake', 'big', 780); }
    if (f.pulse) { const t = $('.vn-tint'); t.dataset.tint = 'beat'; replay(t, 'data-on', '', 1600); }
    if (f.blackout) replay($('.vn-black'), 'data-on', '', 2400);
  }
  /** The weather the story names stays a while: until it changes or stops, or two messages go by without it. */
  function weatherFrom(s) {
    if (s.kind !== 'narrate' || !root.hasAttribute('data-fx')) return;
    const w = storyFx(s.text).weather;
    if (!w) return;
    weatherAge = 0;
    fx.weather(w === 'clear' ? '' : w);
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
      lookOf.set(name, url);
    }
    if (say) said = ''; else said = (said + '\n' + s.text).slice(-400);
    // A new CG is seen alone for two pages; the next one who speaks with a 立绘 brings them back in front of it.
    if (!again && cg) cgPages++;
    if (alone && url && cgPages > 2) { alone = false; root.setAttribute('data-soft', ''); }
    if (!say && !again) root.removeAttribute('data-memory');
    let actor = null;
    if(say&&!url)leave(name);
    if (url && !alone) actor = enter(name, url);
    if (actor && !s.part) actor.el.removeAttribute('data-sink');
    // Whoever speaks is lit; the others dim (all of them when the speaker has no 立绘 on the stage).
    spotlight(say ? name : '');
    const bust = say && !actor && alone ? url : '', pic = say && !actor ? bust || face(name, s.user) : '';
    root.toggleAttribute('data-face', say && !actor);
    faceEl.innerHTML = pic ? `<img src="${esc(pic)}" alt=""${bust ? ' class="vn-bust"' : ''}>` : say && !actor ? `<span>${esc([...name][0] || '?')}</span>` : '';
    weatherFrom(s);
    if (!again) act(s, actor);
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
    endCg();
    root.removeAttribute('data-memory');
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
    advance, back,
  };
}
