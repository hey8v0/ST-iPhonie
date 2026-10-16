import {promptRule} from './prompt-rules.js';
import {normalizePromptRules} from './prompt-rules.js';
import { normalizeRoute } from './routes.js';
import { TTSParameters } from './parameters.js';
import { DEFAULT_FORMAT,DEFAULT_PROMPT,LEGACY_FORMATS,validatePreset,isPlaceholderRole,CONTRACT_PROMPT,READING_PROMPT,CONTRACT_OLD_END,CONTRACT_NEW_END } from './protocol.js';
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
import { defaultAssistant,normalizeAssistant } from './assistant.js';
import { defaultMusic,normalizeMusic } from './music.js';
import { defaultNarration,normalizeNarration } from './narration.js';
import { defaultVn,normalizeVn } from './vn.js';
export const NAMESPACE='stTtsDialogue';
// 朗读规则 and 对白输出硬性规则 as entries of the voice preset, so they can be edited (both were added to the first entry before 0.7.58).
const RULE_ENTRIES=()=>[{id:'reading',title:'朗读规则（按角色的引擎自动生成）',enabled:true,text:READING_PROMPT},{id:'contract',title:'对白输出硬性规则',enabled:true,text:CONTRACT_PROMPT}];
export function freshState(){return {version:1,promptRules:{},scope:crypto.randomUUID(),enabled:true,theme:'system',general:{defaultLanguage:'zh',voiceEnabled:true,hideStoryWaves:false,cacheEnabled:true,floatingEnabled:true,waveformEnabled:true,wallpaperMotion:true,stripVoice:true,voiceExample:false,autoVoice:false,voiceIsland:false,voiceMode:'inline',pregenerate:false},selected:'',activePreset:'default',routes:[],voicePool:[],connections:Object.fromEntries(Object.entries(TTSParameters.catalogs).map(([key,c])=>[key,{model:c.model,region:key==='mini'?'cn':undefined,params:TTSParameters.defaults(key),parametersVersion:1}])),presets:[{id:'default',name:'默认双语',format:DEFAULT_FORMAT,injection:{position:'in_chat',depth:0,role:'system'},entries:[{id:'dialogue',title:'台词生成规则',enabled:true,text:DEFAULT_PROMPT},...RULE_ENTRIES(),{id:'effects',title:'心声和电话',enabled:true,text:EFFECTS_PROMPT}],marks:{inner:[],phone:[]},effectsAdded:true,rulesAdded:true}],draw:defaultDraw(),chat:defaultChat(),moments:defaultMoments(),calls:defaultCalls(),text:defaultText(),embed:defaultEmbed(),sync:defaultSync(),sounds:defaultSounds(),assistant:defaultAssistant(),music:defaultMusic(),narration:defaultNarration(),vn:defaultVn()};}
export function normalizeSettings(value){const base=freshState();if(!value)return base;const out=structuredClone(value);out.version=1;out.promptRules=normalizePromptRules(out.promptRules);out.scope=out.scope||base.scope;out.enabled=out.enabled!==false;out.theme=['system','light','dark'].includes(out.theme)?out.theme:'system';out.general={...base.general,...out.general};if(!['inline','separate'].includes(out.general.voiceMode))out.general.voiceMode='inline';out.routes=Array.isArray(out.routes)?out.routes.map(normalizeRoute):[];out.voicePool=normalizePool(out.voicePool);out.draw=normalizeDraw(out.draw);out.chat=normalizeChat(out.chat);out.moments=normalizeMoments(out.moments);out.calls=normalizeCalls(out.calls);out.text=normalizeText(out.text);out.embed=normalizeEmbed(out.embed);out.sync=normalizeSync(out.sync);out.sounds=normalizeSounds(out.sounds);out.assistant=normalizeAssistant(out.assistant);out.music=normalizeMusic(out.music);out.narration=normalizeNarration(out.narration);out.vn=normalizeVn(out.vn);for(const r of out.routes)if(r.appearance!==undefined)r.appearance=String(r.appearance).slice(0,2000);out.presets=out.presets?.length?out.presets:base.presets;for(const p of out.presets)if(p.format===LEGACY_FORMATS[0])p.format=DEFAULT_FORMAT;out.activePreset=out.presets.some(p=>p.id===out.activePreset)?out.activePreset:out.presets[0].id;out.selected=out.routes.some(r=>r.id===out.selected)?out.selected:(out.routes[0]?.id||'');out.connections??={};for(const key of Object.keys(base.connections)){out.connections[key]={...base.connections[key],...out.connections[key],params:{...base.connections[key].params,...out.connections[key]?.params}};TTSParameters.normalize(key,out.connections[key]);}for(const p of out.presets){p.injection={...base.presets[0].injection,...p.injection};p.entries??=[{id:crypto.randomUUID(),title:'台词规则',enabled:true,text:p.prompt||''}];if(!p.effectsAdded){if(!p.entries.some(e=>e.id==='effects'))p.entries.push({id:'effects',title:'心声和电话',enabled:true,text:EFFECTS_PROMPT});p.effectsAdded=true;}if(!p.rulesAdded){if(!p.entries.some(e=>e.id==='contract'||e.id==='reading'||/\{\{朗读规则\}\}/.test(e.text||'')))p.entries.splice(1,0,...RULE_ENTRIES());p.rulesAdded=true;}for(const e of p.entries)if(e.id==='contract'&&typeof e.text==='string')e.text=e.text.replace(CONTRACT_OLD_END,CONTRACT_NEW_END);p.marks=normalizeMarks(p.marks);}return out;}
export function validateSettings(s){if(JSON.stringify(s).length>2_000_000)throw Error('设置内容过大');if(s.routes.some(r=>!r.name?.trim()||!['fish','mini','eleven','mimo','custom'].includes(r.engine)))throw Error('角色配音设置无效');if(new Set(s.routes.map(r=>r.name.trim())).size!==s.routes.length)throw Error('角色名不可重复');for(const p of s.presets)validatePreset(p);if(s.chat){for(const p of s.chat.presets)validateChatPreset(p);if(new Set(s.chat.presets.map(p=>p.id)).size!==s.chat.presets.length||new Set(s.chat.contacts.map(c=>c.name)).size!==s.chat.contacts.length)throw Error('聊天预设 ID 或联系人名字重复');}if(s.draw){for(const p of s.draw.presets)validateDrawPreset(p);if(new Set(s.draw.presets.map(p=>p.id)).size!==s.draw.presets.length||new Set(s.draw.styles.map(p=>p.id)).size!==s.draw.styles.length)throw Error('绘图预设 ID 不可重复');}for(const [key,c] of Object.entries(s.connections)){if(!TTSParameters.catalogs[key])continue;const err=TTSParameters.validate(key,c);if(err)throw Error(TTSParameters.catalogs[key].model+'：'+err);}return s;}
// Reading rules for the story model, one line per speaker, following each engine's official tag syntax (2026-09-30).
// The 情绪 field is used by the plugin: MiniMax gets it as its emotion setting, Fish and Eleven v3/v4 as an opening tag.
const ENGINE_NAMES={fish:'Fish Audio',mini:'MiniMax',eleven:'ElevenLabs',mimo:'小米 MiMo',custom:'自己的接口'};
/** Roles to write rules for: those named in `only` (the speakers of this chat) when any of them is known, else all. */
// only: the speakers of the current story (null: every role, for previews). Roles not in the story are never named in
// a story request, or the model takes them as the cast (a new chat of a world card kept bringing back saved roles).
export function speakingRoutes(s,only=null){const configured=s.routes.filter(r=>!isPlaceholderRole(r.name));if(!Array.isArray(only))return configured;const wanted=new Set(only.map(n=>String(n).trim()));return configured.filter(r=>wanted.has(r.name));}
export function modelRules(s,only=null){const {FISH_DRAMA_PAIRS,FISH_DRAMA_SOUNDS,FISH_S1_EMOTIONS,FISH_S1_TONES,FISH_S1_SOUNDS,MINI_SOUNDS,ELEVEN_TAGS,MIMO_STYLES,MIMO_SOUNDS}=TTSParameters.vocab;const output=[];const configured=speakingRoutes(s,only);const registered=s.routes.filter(r=>!isPlaceholderRole(r.name));
 // Nobody registered in the story yet: the rules of the engines in use, without names.
 const nameless=!configured.length&&registered.length,routes=configured.length?configured:nameless?[...new Map(registered.map(r=>[r.engine+'|'+(r.model||''),{...r,name:'说话者'}])).values()]:[{name:'未配置角色',engine:'fish',model:s.connections.fish.model}];
 for(const r of routes){const model=r.model||s.connections[r.engine]?.model||TTSParameters.catalogs[r.engine]?.model||'';let rule;
  if(r.engine==='mimo'){
   rule=promptRule(s.promptRules, 'modelRules.011', {"动态内容1":(MIMO_STYLES.join('、')),"动态内容2":(MIMO_SOUNDS.map(x=>'['+x+']').join('、'))});
  }else if(r.engine==='mini'){
   rule=promptRule(s.promptRules, 'modelRules.010', {"动态内容1":(TTSParameters.tags('mini',model).join('、'))});
   rule+=model.startsWith('speech-2.8')?promptRule(s.promptRules, 'modelRules.009', {"动态内容1":(MINI_SOUNDS.map(x=>'('+x+')').join('、'))}):promptRule(s.promptRules, 'modelRules.008');
   rule+=promptRule(s.promptRules, 'modelRules.007');
  }else if(r.engine==='eleven'){
   rule=/^eleven_v[34]/.test(model)
    ?promptRule(s.promptRules, 'modelRules.006', {"动态内容1":(ELEVEN_TAGS.map(x=>'['+x+']').join('、'))})
    :promptRule(s.promptRules, 'modelRules.005');
  }else if(model==='drama-3'){
   rule=promptRule(s.promptRules, 'modelRules.004', {"动态内容1":(FISH_DRAMA_SOUNDS.map(x=>'['+x+']').join('、')),"动态内容2":(FISH_DRAMA_PAIRS.map(x=>'<'+x+'>…</'+x+'>').join('、'))});
  }else if(model==='s1'){
   rule=promptRule(s.promptRules, 'modelRules.003', {"动态内容1":(FISH_S1_EMOTIONS.join('、')),"动态内容2":([...FISH_S1_TONES,...FISH_S1_SOUNDS].map(x=>'('+x+')').join('、'))});
  }else{
   rule=promptRule(s.promptRules, 'modelRules.002');
  }
  // Speakers that share a rule share one entry: the rule is written once, with every name and model in front.
  const same=output.find(o=>o.rule===rule),who=String(r.name),label=(ENGINE_NAMES[r.engine]||r.engine)+' '+model;
  if(same){const group=same.groups.find(g=>g.label===label);if(group){if(!group.names.includes(who))group.names.push(who);}else same.groups.push({label,names:[who]});}
  else output.push({rule,groups:[{label,names:[who]}]});}
 return promptRule(s.promptRules, 'modelRules.001', {"动态内容1":(output.map(o=>'· '+o.groups.map(g=>g.names.join('、')+'（'+g.label+'）').join('、')+'：\n  '+o.rule).join('\n'))});}