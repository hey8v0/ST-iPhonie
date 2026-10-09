import { normalizeRoute } from './routes.js';
import { TTSParameters } from './parameters.js';
import { DEFAULT_FORMAT,DEFAULT_PROMPT,LEGACY_FORMATS,validatePreset,isPlaceholderRole } from './protocol.js';
import { EFFECTS_PROMPT,normalizeMarks } from './voice-fx.js';
import { defaultDraw,normalizeDraw,validateDrawPreset } from './draw.js';
import { defaultChat,normalizeChat,validateChatPreset } from './chat.js';
import { defaultMoments,normalizeMoments } from './moments.js';
import { defaultCalls,normalizeCalls } from './call.js';
import { defaultText,normalizeText } from './llm.js';
import { defaultEmbed,normalizeEmbed } from './embed.js';
import { defaultSync,normalizeSync } from './sync.js';
import { normalizePool } from './auto-voice.js';
import { defaultSounds,normalizeSounds } from './sounds.js';
export const NAMESPACE='stTtsDialogue';
export function freshState(){return {version:1,scope:crypto.randomUUID(),enabled:true,theme:'system',general:{defaultLanguage:'zh',voiceEnabled:true,cacheEnabled:true,floatingEnabled:true,waveformEnabled:true,wallpaperMotion:true,stripVoice:true,voiceExample:false,autoVoice:false},selected:'',activePreset:'default',routes:[],voicePool:[],connections:Object.fromEntries(Object.entries(TTSParameters.catalogs).map(([key,c])=>[key,{model:c.model,region:key==='mini'?'cn':undefined,params:TTSParameters.defaults(key),parametersVersion:1}])),presets:[{id:'default',name:'默认双语',format:DEFAULT_FORMAT,injection:{position:'in_chat',depth:0,role:'system'},entries:[{id:'dialogue',title:'台词生成规则',enabled:true,text:DEFAULT_PROMPT},{id:'effects',title:'心声和电话',enabled:true,text:EFFECTS_PROMPT}],marks:{inner:[],phone:[]},effectsAdded:true}],draw:defaultDraw(),chat:defaultChat(),moments:defaultMoments(),calls:defaultCalls(),text:defaultText(),embed:defaultEmbed(),sync:defaultSync(),sounds:defaultSounds()};}
export function normalizeSettings(value){const base=freshState();if(!value)return base;const out=structuredClone(value);out.version=1;out.scope=out.scope||base.scope;out.enabled=out.enabled!==false;out.theme=['system','light','dark'].includes(out.theme)?out.theme:'system';out.general={...base.general,...out.general};out.routes=Array.isArray(out.routes)?out.routes.map(normalizeRoute):[];out.voicePool=normalizePool(out.voicePool);out.draw=normalizeDraw(out.draw);out.chat=normalizeChat(out.chat);out.moments=normalizeMoments(out.moments);out.calls=normalizeCalls(out.calls);out.text=normalizeText(out.text);out.embed=normalizeEmbed(out.embed);out.sync=normalizeSync(out.sync);out.sounds=normalizeSounds(out.sounds);for(const r of out.routes)if(r.appearance!==undefined)r.appearance=String(r.appearance).slice(0,2000);out.presets=out.presets?.length?out.presets:base.presets;for(const p of out.presets)if(p.format===LEGACY_FORMATS[0])p.format=DEFAULT_FORMAT;out.activePreset=out.presets.some(p=>p.id===out.activePreset)?out.activePreset:out.presets[0].id;out.selected=out.routes.some(r=>r.id===out.selected)?out.selected:(out.routes[0]?.id||'');out.connections??={};for(const key of Object.keys(base.connections)){out.connections[key]={...base.connections[key],...out.connections[key],params:{...base.connections[key].params,...out.connections[key]?.params}};TTSParameters.normalize(key,out.connections[key]);}for(const p of out.presets){p.injection={...base.presets[0].injection,...p.injection};p.entries??=[{id:crypto.randomUUID(),title:'台词规则',enabled:true,text:p.prompt||''}];if(!p.effectsAdded){if(!p.entries.some(e=>e.id==='effects'))p.entries.push({id:'effects',title:'心声和电话',enabled:true,text:EFFECTS_PROMPT});p.effectsAdded=true;}p.marks=normalizeMarks(p.marks);}return out;}
export function validateSettings(s){if(JSON.stringify(s).length>2_000_000)throw Error('设置内容过大');if(s.routes.some(r=>!r.name?.trim()||!['fish','mini','eleven','mimo'].includes(r.engine)))throw Error('角色配音设置无效');if(new Set(s.routes.map(r=>r.name.trim())).size!==s.routes.length)throw Error('角色名不可重复');for(const p of s.presets)validatePreset(p);if(s.chat){for(const p of s.chat.presets)validateChatPreset(p);if(new Set(s.chat.presets.map(p=>p.id)).size!==s.chat.presets.length||new Set(s.chat.contacts.map(c=>c.name)).size!==s.chat.contacts.length)throw Error('聊天预设 ID 或联系人名字重复');}if(s.draw){for(const p of s.draw.presets)validateDrawPreset(p);if(new Set(s.draw.presets.map(p=>p.id)).size!==s.draw.presets.length||new Set(s.draw.styles.map(p=>p.id)).size!==s.draw.styles.length)throw Error('绘图预设 ID 不可重复');}for(const [key,c] of Object.entries(s.connections)){if(!TTSParameters.catalogs[key])continue;const err=TTSParameters.validate(key,c);if(err)throw Error(TTSParameters.catalogs[key].model+'：'+err);}return s;}
// Reading rules for the story model, one line per speaker, following each engine's official tag syntax (2026-09-30).
// The 情绪 field is used by the plugin: MiniMax gets it as its emotion setting, Fish and Eleven v3/v4 as an opening tag.
const ENGINE_NAMES={fish:'Fish Audio',mini:'MiniMax',eleven:'ElevenLabs',mimo:'小米 MiMo'};
/** Roles to write rules for: those named in `only` (the speakers of this chat) when any of them is known, else all. */
// only: the speakers of the current story (null: every role, for previews). Roles not in the story are never named in
// a story request, or the model takes them as the cast (a new chat of a world card kept bringing back saved roles).
export function speakingRoutes(s,only=null){const configured=s.routes.filter(r=>!isPlaceholderRole(r.name));if(!Array.isArray(only))return configured;const wanted=new Set(only.map(n=>String(n).trim()));return configured.filter(r=>wanted.has(r.name));}
export function modelRules(s,only=null){const {FISH_S1_EMOTIONS,FISH_S1_TONES,FISH_S1_SOUNDS,MINI_SOUNDS,ELEVEN_TAGS,MIMO_STYLES,MIMO_SOUNDS}=TTSParameters.vocab;const output=[];const configured=speakingRoutes(s,only);const registered=s.routes.filter(r=>!isPlaceholderRole(r.name));
 // Nobody registered in the story yet: the rules of the engines in use, without names.
 const nameless=!configured.length&&registered.length,routes=configured.length?configured:nameless?[...new Map(registered.map(r=>[r.engine+'|'+(r.model||''),{...r,name:'说话者'}])).values()]:[{name:'未配置角色',engine:'fish',model:s.connections.fish.model}];
 for(const r of routes){const model=r.model||s.connections[r.engine]?.model||TTSParameters.catalogs[r.engine]?.model||'';let rule;
  if(r.engine==='mimo'){
   rule='情绪字段用中文写一个词，最好从这些里选：'+MIMO_STYLES.join('、')+'；插件会把它写成句首的圆括号标签。原文里还可以在语气变化的位置插方括号细节标签，只用这些：'+MIMO_SOUNDS.map(x=>'['+x+']').join('、')+'；一句最多两三个，只描述声音，不写动作。';
  }else if(r.engine==='mini'){
   rule='情绪字段只写这几个英文词之一：'+TTSParameters.tags('mini',model).join('、')+'（写中文也行，插件会对应过去；对应不上就由语音模型自己判断）。';
   rule+=model.startsWith('speech-2.8')?'原文里可以在该出声的位置插入语气声，只用这些：'+MINI_SOUNDS.map(x=>'('+x+')').join('、')+'。':'这个模型不读语气声，原文不要写圆括号标签。';
   rule+='停顿写成 <#0.5#>（0.01–99.99 秒），只放在两段要读出来的文字之间，不要连着放。';
  }else if(r.engine==='eleven'){
   rule=/^eleven_v[34]/.test(model)
    ?'情绪字段写一个描述声音的英文词或短语（如 excited、sarcastic、quietly curious），插件会把它放在原文开头当语气标签。原文里还可以在语气变化的那句话前加方括号英文标签，只描述声音、不描述动作：'+ELEVEN_TAGS.map(x=>'['+x+']').join('、')+'；一句最多一两个，不写 [standing]、[smiling] 这类动作。省略号表示停顿，全大写的词会被加重，少用；不要写 SSML 的 <break>。'
    :'这个模型不读语气标签：情绪字段照常填写，原文不要加方括号或圆括号标签，用措辞和标点表达情绪。';
  }else if(model==='s1'){
   rule='情绪字段从这些英文词里选一个：'+FISH_S1_EMOTIONS.join('、')+'；插件会把它写成句首的圆括号标签。原文里还可以用圆括号加语气和声音，只用这些：'+[...FISH_S1_TONES,...FISH_S1_SOUNDS].map(x=>'('+x+')').join('、')+'；情绪标签放句首，语气和声音可以放在句中。';
  }else{
   rule='情绪字段写一个描述声音的英文词或短语（如 happy、nervous、whispers sweetly、slightly sad），插件会把它放在原文开头当方括号标签。原文里也可以在任意位置插方括号英文描述，如 [whispers sweetly]、[laughing nervously]、[very excited]、[sigh]、[emphasis]，一句最多三个，只描述声音。';
  }
  // Speakers that share a rule share one entry: the rule is written once, with every name and model in front.
  const same=output.find(o=>o.rule===rule),who=String(r.name),label=(ENGINE_NAMES[r.engine]||r.engine)+' '+model;
  if(same){const group=same.groups.find(g=>g.label===label);if(group){if(!group.names.includes(who))group.names.push(who);}else same.groups.push({label,names:[who]});}
  else output.push({rule,groups:[{label,names:[who]}]});}
 return '各说话者的朗读规则（只用于台词，不改变人物设定）：\n'+output.map(o=>'· '+o.groups.map(g=>g.names.join('、')+'（'+g.label+'）').join('、')+'：\n  '+o.rule).join('\n');}