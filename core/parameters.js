import {buildDoubaoRequest} from './doubao.js';
import {proxyAddress} from './proxy-url.js';
'use strict';
// Official TTS parameter snapshot: 2026-09-30 (Eleven v4 added 2026-09-28). See research/engine-parameters/README.md.

const n=(key,label,value,min,max,step=.01,help='')=>({key,label,type:'number',value,min,max,step,help});
const s=(key,label,value,options,help='')=>({key,label,type:'select',value,options:options.map(o=>Array.isArray(o)?o:[o,o]),help});
const b=(key,label,value,help='')=>({key,label,type:'boolean',value,help});
const t=(key,label,help='',type='text')=>({key,label,type,value:'',help});
const rows=(key,label,columns,max,help='')=>({key,label,type:'rows',value:[],columns,max,help});
const group=(id,title,fields)=>({id,title,fields});
const refs=(key,label,id,version,optional=false)=>rows(key,label,[t(id,'词典 ID'),{...t(version,'版本 ID'),optional}],3,'最多三份，按添加顺序应用。');
const fish={model:'s2.1-pro',models:['s2.1-pro','s2.1-pro-free','s2-pro','s1','drama-3'],source:'https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech',groups:[
 group('common','常用设置',[n('prosody.speed','语速',1,.5,2,.05),n('prosody.volume','音量 · dB',0,undefined,undefined,.5,'0 保持原音量；官网未规定上下限。'),b('prosody.normalize_loudness','统一响度',true,'S2 系列有效；s1 接收但不生效。预览模型尚待核验。'),n('temperature','表现变化',.7,0,1,.05,'数值越高，表现越多变。'),n('top_p','采样多样性',.7,0,1,.05)]),
 group('audio','音频输出',[s('format','音频格式','mp3',['mp3','wav','pcm','opus']),s('sample_rate','采样率',44100,[8000,16000,24000,32000,44100,48000]),s('mp3_bitrate','MP3 码率 · kbps',128,[64,128,192]),s('opus_bitrate','Opus 码率 · bps',-1000,[[-1000,'自动'],24000,32000,48000,64000],'兼容接口文档称 Opus 码率自动选择；原生字段是否覆盖需实测，当前请求省略。')]),
 group('generation','更多生成参数',[s('latency','延迟模式','normal',[['normal','质量优先'],['balanced','均衡'],['low','低延迟']]),n('chunk_length','分段长度',300,100,300,1),n('min_chunk_length','最小分段长度',50,0,100,1),n('max_new_tokens','每段生成上限',1024,undefined,undefined,1,'官网未规定上下限。'),n('repetition_penalty','重复惩罚',1.2,undefined,undefined,.05),n('early_stop_threshold','提前结束阈值',1,0,1,.05),b('normalize','规范数字与文字读法',true),b('condition_on_previous_chunks','沿用前段声音上下文',true),t('features','功能标记','每行一个，例如 quality-guard；是否生效由 Fish 后端决定。','lines')]),
 group('dictionary','发音词典',[s('dictionary_mode','词典方式','references',[['references','平台词典'],['inline','直接填写发音']]),refs('pronunciation_dictionary','平台词典','id','version'),rows('inline_dictionary','发音条目',[t('key','原词'),t('value','发音'),b('case_sensitive','区分大小写',false)],5000,'直接词典与平台词典二选一。')]),
 group('reference','参考音频',[rows('references','参考音频与原文',[{...t('audio','音频文件'),type:'file'},t('text','音频原文')],10,'替代角色音色 ID。文件保存在当前浏览器并按酒馆账户隔离，点击播放时发送参考音频。')])
]};
const miniLanguages=['auto','Chinese','Chinese,Yue','English','Arabic','Russian','Spanish','French','Portuguese','German','Turkish','Dutch','Ukrainian','Vietnamese','Indonesian','Japanese','Italian','Korean','Thai','Polish','Romanian','Greek','Czech','Finnish','Hindi','Bulgarian','Danish','Hebrew','Malay','Persian','Slovak','Swedish','Croatian','Filipino','Hungarian','Norwegian','Slovenian','Catalan','Nynorsk','Tamil','Afrikaans'];
const mini={model:'speech-2.8-hd',models:['speech-2.8-hd','speech-2.8-turbo','speech-2.6-hd','speech-2.6-turbo','speech-02-hd','speech-02-turbo','speech-01-hd','speech-01-turbo'],source:'https://platform.minimax.io/docs/api-reference/speech-t2a-http',groups:[
 group('common','常用设置',[n('voice_setting.speed','语速',1,.5,2,.05),n('voice_setting.vol','音量',1,.01,10,.01,'官网范围大于 0 且不超过 10。'),n('voice_setting.pitch','音高',0,-12,12,1),s('voice_setting.emotion','情绪','',[['','跟随台词'],...['happy','sad','angry','fearful','disgusted','surprised','calm','fluent','whisper']],'fluent、whisper 按当前文档仅列为 2.6 系列支持。固定选择会覆盖台词情绪。')]),
 group('audio','音频输出',[s('audio_setting.format','音频格式','mp3',['mp3','pcm','flac','wav','pcmu_raw','pcmu_wav','opus']),s('audio_setting.sample_rate','采样率',32000,[8000,16000,22050,24000,32000,44100]),s('audio_setting.bitrate','MP3 码率 · bps',128000,[32000,64000,128000,256000]),s('audio_setting.channel','声道',1,[[1,'单声道'],[2,'双声道']]),b('audio_setting.force_cbr','恒定码率',false,'仅流式 MP3 输出有效。')]),
 group('effects','声音效果',[n('voice_modify.pitch','低沉 / 明亮',0,-100,100,1),n('voice_modify.intensity','强劲 / 柔和',0,-100,100,1),n('voice_modify.timbre','浑厚 / 清脆',0,-100,100,1),s('voice_modify.sound_effects','环境效果','',[['','无'],['spacious_echo','空旷回声'],['auditorium_echo','礼堂回声'],['lofi_telephone','电话音效'],['robotic','机器人']])]),
 group('language','语言与发音',[s('language_boost','语言增强','auto',miniLanguages),b('voice_setting.text_normalization','规范数字与文字读法',false),b('voice_setting.latex_read','朗读 LaTeX 公式',false,'开启后语言增强固定为中文。'),t('pronunciation_dict.tone','自定义读音','每行一条 原文/读法，例如 处理/(chu3)(li3)。','lines')]),
 group('stream','流式与字幕',[b('stream','流式输出',false),b('stream_options.exclude_aggregated_audio','末块省略完整音频',false),s('output_format','返回方式','hex',[['hex','音频数据'],['url','下载链接']],'流式仅支持音频数据；链接有效期 24 小时。'),b('subtitle_enable','生成字幕',false),s('subtitle_type','字幕粒度','sentence',[['sentence','按句'],['word','按词'],['word_streaming','按词 · 流式']])]),
 group('mix','混合音色',[rows('timbre_weights','音色权重',[t('voice_id','音色 ID'),n('weight','权重',50,1,100,1)],4,'官网标为旧版字段；设置混合音色时，voice_id 留空。最多四个音色。')])
]};
const formats=['mp3_44100_128','alaw_8000','mp3_22050_32','mp3_24000_48','mp3_44100_192','mp3_44100_32','mp3_44100_64','mp3_44100_96','opus_48000_128','opus_48000_192','opus_48000_32','opus_48000_64','opus_48000_96','pcm_16000','pcm_22050','pcm_24000','pcm_32000','pcm_44100','pcm_48000','pcm_8000','ulaw_8000','wav_16000','wav_22050','wav_24000','wav_32000','wav_44100','wav_48000','wav_8000'];
const eleven={model:'eleven_v4',models:['eleven_v4','eleven_v3','eleven_multilingual_v2','eleven_flash_v2_5','eleven_flash_v2','eleven_turbo_v2_5','eleven_turbo_v2','eleven_v3_conversational'],source:'https://elevenlabs.io/docs/api-reference/text-to-speech/convert',groups:[
 group('common','常用设置',[n('voice_settings.stability','稳定性',.5,0,1,.05,'数值越低越有表现力，越高越平稳。eleven_v3 只接受 0（有创意）、0.5（自然）、1（稳定）三档，其他数值发送时取最近的一档。'),n('voice_settings.speed','语速',1,.7,1.2,.05,'官网产品页建议 0.7–1.2；通用 REST 结构未给范围，官方技能另列 0.25–4。当前按产品页范围提供。v3 产品页标为不支持。'),n('voice_settings.similarity_boost','音色相似度',.75,0,1,.05),n('voice_settings.style','风格强度',0,0,1,.05),b('voice_settings.use_speaker_boost','增强原声特征',true)]),
 group('audio','音频输出',[s('output_format','音频格式','mp3_44100_128',formats,'MP3 192 kbps 需要 Creator 或更高；PCM/WAV 44.1 kHz 需要 Pro 或更高，仍以账户可用能力为准。')]),
 group('language','语言与文字',[t('language_code','语言代码','留空跟随角色语言。使用 ISO 639-1 代码，如 zh、en、ja；Multilingual v2 不支持。'),s('apply_text_normalization','文字规范化','auto',[['auto','自动'],['on','开启'],['off','关闭']]),b('apply_language_text_normalization','日语读法规范化',false,'当前仅日语；会增加生成延迟。')]),
 group('continuity','前后文与随机性',[n('seed','随机种子','',0,4294967295,1,'留空自动；相同种子也不保证完全相同结果。'),t('previous_text','前文','连续合成的上一段文本。','textarea'),t('next_text','后文','连续合成的下一段文本。','textarea'),t('previous_request_ids','前段请求 ID','每行一个，最多三个；设置后优先于前文。','lines'),t('next_request_ids','后段请求 ID','每行一个，最多三个；设置后优先于后文。','lines')]),
 group('dictionary','发音词典',[refs('pronunciation_dictionary_locators','平台词典','pronunciation_dictionary_id','version_id',true)]),
 group('request','请求选项',[b('enable_logging','保留生成记录',true,'关闭为零保留模式，仅 Enterprise 账户可用；不能用于前后请求拼接。'),s('optimize_streaming_latency','延迟优化（旧版）','',[['','默认'],[0,'0 · 关闭'],[1,'1 · 普通'],[2,'2 · 较强'],[3,'3 · 最大'],[4,'4 · 最大并关闭文字规范化']],'官网已弃用，保留为可选旧版参数。'),b('use_pvc_as_ivc','使用即时克隆版本（旧版）',false,'官网已弃用的临时选项。')])
]};
// Xiaomi MiMo-V2.5 TTS (2026-10-02): OpenAI-style /chat/completions. The line is the assistant message; the user message carries
// the 风格说明 (and, for voice design, the role's voice description). Answers base64 WAV, 24 kHz mono.
const MIMO_VOICES=[['冰糖','冰糖 · 中文女声'],['茉莉','茉莉 · 中文女声'],['苏打','苏打 · 中文男声'],['白桦','白桦 · 中文男声'],['Mia','Mia · 英文女声'],['Chloe','Chloe · 英文女声'],['Milo','Milo · 英文男声'],['Dean','Dean · 英文男声'],['mimo_default','默认音色']];
const mimo={model:'mimo-v2.5-tts',models:['mimo-v2.5-tts','mimo-v2.5-tts-voicedesign','mimo-v2.5-tts-voiceclone'],source:'https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5',groups:[
 group('common','常用设置',[t('style','风格说明','每句都带上的整体表演要求，如「温柔，语速稍慢，像在耳边说话」，留空不发。音色设计模型会把它接在角色的音色描述后面。','textarea')]),
 group('clone','克隆样本',[rows('samples','克隆样本',[{...t('audio','音频文件'),type:'file'},t('name','名字')],20,'声音克隆模型用：上传 mp3 或 wav（编码后不超过 10 MB），起个名字，角色的音色填这个名字。文件保存在当前浏览器。')])
]};
const mimoMode=model=>model.endsWith('voicedesign')?'design':model.endsWith('voiceclone')?'clone':'preset';
// 自己的接口: any speech service with an HTTP API the user runs or has (GPT-SoVITS and the like). The address, the body
// and the headers are templates: {{text}} {{lang}} {{emotion}} {{voice}} {{ref_text}} {{ref_lang}} {{key}}
// (core/custom-voice.js fills them). The voices are the user's own list; a role's 音色 is one of their names.
const custom={model:'custom',models:['custom'],source:'',groups:[
 group('api','接口',[t('url','接口地址','比如 http://127.0.0.1:9880/tts。台词放在地址里（GET）时在那里写 {{text}}。本机和局域网的 http 地址也能用。'),s('method','请求方式','POST',[['POST','POST · 台词放在请求体里'],['GET','GET · 台词放在地址里']]),t('body','请求体','JSON。可以写 {{text}} 台词、{{lang}} 台词语言、{{emotion}} 情绪、{{voice}} 音色、{{ref_text}} 参考文本、{{ref_lang}} 参考语言。','textarea'),t('headers','额外请求头','每行一个「名字: 值」，可以写 {{key}}（密钥）。填了密钥、又没在这里写 {{key}} 时，自动加 Authorization: Bearer 密钥。','lines'),t('before','换模型','每个角色是单独训练的模型时用（比如 GPT-SoVITS）：每行一个地址，音色的模型和上一句不一样时，先按顺序访问这些地址把模型换过去。可以写 {{model1}} {{model2}}（音色里的模型 1、模型 2）；音色没填模型的，这一行就跳过。','lines'),s('answer','回答是什么','audio',[['audio','音频本身'],['url','JSON 里的音频链接'],['base64','JSON 里的 base64 音频']]),t('path','在 JSON 的哪里','回答是 JSON 时填，用点隔开，比如 data.audio 或 audio_url。'),t('listUrl','音色列表地址','服务能列出自己有哪些音色时填（比如公益站的角色列表）：角色 App 里「从列表选」会把它们一起列出来，不用一个个添加。'),t('listPath','列表在 JSON 的哪里','用点隔开，比如 data 或 voices；空着自动找。列表里可以是名字，也可以是带 id / name 的对象。')]),
 group('voices','音色',[rows('voices','音色',[t('name','名字'),t('voice','音色 / 参考音频'),{...t('ref_text','参考文本'),optional:true},{...t('ref_lang','参考语言'),optional:true},{...t('model1','模型 1（比如 GPT 的 .ckpt）'),optional:true},{...t('model2','模型 2（比如 SoVITS 的 .pth）'),optional:true}],200,'角色的「音色」选这里的名字。「音色 / 参考音频」填进 {{voice}}（音色 ID，或参考音频在后端那台电脑上的路径），参考文本、参考语言填进 {{ref_text}} {{ref_lang}}（参考语言空着就跟台词一样）。')])
]};
const doubao={model:'seed-tts-2.0',models:['seed-tts-2.0','seed-tts-1.0','seed-tts-1.0-concurr','seed-icl-2.0','seed-icl-1.0','seed-icl-1.0-concurr'],source:'https://docs.volcengine.com/docs/DoubaoVoice/HTTPChunkedSSEUnidirectionalStreaming-V3?lang=zh',groups:[
 group('connection','连接',[t('url','接口地址','默认借酒馆转发，需要服务端开启 enableCorsProxy；也可以填自己的豆包兼容中转完整地址。'),t('appId','旧版 App ID（可不填）','新版控制台只需 API Key。旧版填 App ID，并把 Access Token 存在上面的密钥中。')]),
 group('audio','声音',[s('format','音频格式','mp3',[['mp3','MP3'],['pcm','PCM（自动封装 WAV）']]),s('sample_rate','采样率',24000,[8000,16000,22050,24000,32000,44100,48000].map(v=>[v,String(v)])),n('speech_rate','语速',0,-50,100,1),n('loudness_rate','音量',0,-50,100,1),n('pitch','音调',0,-12,12,1)]),
 group('style','语气',[t('context','语音指令','仅合成 2.0 和复刻 2.0 表现力版支持。可写「你可以说得温柔一点吗」。台词情绪会附在指令里，不当作正文朗读。'),s('cloneModel','复刻 2.0 效果','seed-tts-2.0-standard',[['seed-tts-2.0-standard','标准'],['seed-tts-2.0-expressive','表现力增强']])]),
 group('voices','自己的音色',[rows('voices','音色',[t('name','名字'),t('id','音色 ID')],200,'从火山控制台音色库复制 ID；模型版本需与音色对应。复刻音色也可添加。')])
]};
const catalogs={fish,mini,eleven,mimo,doubao,custom};
function defaults(key){const value = Object.fromEntries(catalogs[key].groups.flatMap(g=>g.fields.map(f=>[f.key,structuredClone(f.value)])));if(key==='doubao')value.url='/proxy/https://openspeech.bytedance.com/api/v3/tts/unidirectional';return value;}
function allowed(key,field,c){let list=field.options||[];const p=c.params;
 if(key==='fish'&&field.key==='sample_rate'){const rates=p.format==='mp3'?[32000,44100]:p.format==='opus'?[48000]:[8000,16000,24000,32000,44100];list=list.filter(([v])=>rates.includes(v));}
 if(key==='mini'&&field.key==='voice_setting.emotion'&&!c.model.startsWith('speech-2.6'))list=list.filter(([v])=>!['fluent','whisper'].includes(v));
 if(key==='mini'&&field.key==='language_boost'&&/^speech-0/.test(c.model))list=list.filter(([v])=>!['Persian','Filipino','Tamil'].includes(v));
 if(key==='mini'&&field.key==='audio_setting.sample_rate'&&p['audio_setting.format'].startsWith('pcmu'))list=list.filter(([v])=>v===8000);
 if(key==='mini'&&field.key==='output_format'&&p.stream)list=list.filter(([v])=>v==='hex');
 if(key==='mini'&&field.key==='subtitle_type'&&!p.stream)list=list.filter(([v])=>v!=='word_streaming');
 return list;
}
function unavailable(key,f,c){const p=c.params,k=f.key;
 if(key==='fish'){
  if(k==='prosody.normalize_loudness'&&!c.model.startsWith('s2'))return '该模型未确认支持响度统一。';
  if(k==='mp3_bitrate'&&p.format!=='mp3')return '仅 MP3 使用。';
  if(k==='opus_bitrate')return '兼容通道按自动码率输出，原生码率覆盖尚待实测。';
  if(k==='pronunciation_dictionary'&&p.dictionary_mode!=='references')return '当前使用直接发音条目。';
  if(k==='inline_dictionary'&&p.dictionary_mode!=='inline')return '当前使用平台词典。';
 }
 if(key==='mini'){
  if(k==='audio_setting.bitrate'&&p['audio_setting.format']!=='mp3')return '仅 MP3 使用。';
  if(k==='audio_setting.force_cbr'&&(!p.stream||p['audio_setting.format']!=='mp3'))return '仅流式 MP3 使用。';
  if(k==='stream_options.exclude_aggregated_audio'&&!p.stream)return '开启流式输出后可选。';
  if(k==='subtitle_type'&&!p.subtitle_enable)return '开启字幕后可选。';
  if(k==='language_boost'&&p['voice_setting.latex_read'])return '公式朗读会固定使用中文。';
  if(k.startsWith('voice_modify.')&&!(p.stream?p['audio_setting.format']==='mp3':['mp3','wav','flac'].includes(p['audio_setting.format'])))return '音效支持非流式 MP3/WAV/FLAC，或流式 MP3。';
 }
 if(key==='eleven'){
  if(k.startsWith('voice_settings.')&&!['voice_settings.stability','voice_settings.similarity_boost'].includes(k)&&c.model==='eleven_v4')return 'v4 只支持稳定性和音色相似度，风格、语速和 SSML 不起作用。';
  if(k.startsWith('voice_settings.')&&k!=='voice_settings.stability'&&c.model.startsWith('eleven_v3'))return '按 v3 产品页与专用参数结构，此项不作为已支持参数发送。';
  if(['voice_settings.style','voice_settings.use_speaker_boost'].includes(k)&&c.model.includes('flash'))return 'Flash 专用声音结构未列此项，需账户能力核验。';
  if(k==='language_code'&&c.model==='eleven_multilingual_v2')return 'Multilingual v2 不支持强制语言代码。';
  if(k==='apply_language_text_normalization'&&/^eleven_v[34]/.test(c.model))return 'v3、v4 不接受这一项。';
  if(['previous_request_ids','next_request_ids'].includes(k)&&!p.enable_logging)return '关闭生成记录后无法使用请求拼接。';
 }
 return '';
}
/** Fish Audio's address, or the relay (中转) the user set: every Fish request (speech, voices, balance) goes there. */
export const FISH_API='https://api.fish.audio';
// Which models Fish's compat endpoint (the one web pages may call) serves. GET /compat/v1/models is read once a page
// (Providers.fishCatalog); until then, the list as checked on 2026-10-14. A model not there (drama-3 so far) goes to
// Fish's own /v1/tts, which answers no CORS preflight: through a relay, or through the tavern's proxy (enableCorsProxy).
let fishCompat=new Set(['s2.1-pro','s2.1-pro-free','s2-pro','s1']);
/** The compat endpoint's catalog as read (ids like fish-audio/s1); true when it changed what goes where. */
export function setFishCompat(ids){const next=new Set((ids||[]).map(id=>String(id).replace(/^fish-audio\//,'')).filter(Boolean));if(!next.size)return false;const changed=catalogs.fish.models.some(m=>next.has(m)!==fishCompat.has(m));fishCompat=next;return changed;}
/** Whether this connection's model is sent to Fish's own /v1/tts (an OpenAI-form relay takes every model its own way). */
export const fishNative=c=>!fishOpenAI(c)&&!fishCompat.has(c?.model);
/** A /v1/tts request without a relay goes through the tavern's proxy: what to do when that is off. */
export const FISH_PROXY_NOTE='这个模型现在只在 Fish 自己的接口上，网页不能直接调用，要借酒馆转发：在酒馆的 config.yaml 里把 enableCorsProxy 改成 true，然后重启酒馆。用中转的不用改。';
export const FISH_NATIVE_REFS='这个模型走 Fish 自己的接口，那里不能这样带参考音频：在 Fish 引擎里去掉参考音频，角色的「音色」填 Fish 的音色 ID';
export const fishBase=c=>typeof c?.relay==='string'&&(proxyAddress(c.relay)||/^https?:\/\/[^\s]+$/.test(c.relay))?c.relay:FISH_API;
/** A relay speaks Fish's own paths ('fish': /compat/v1/audio/speech, /model, /wallet) or OpenAI's ('openai': /v1/audio/speech only). */
export const fishOpenAI=c=>!!(c?.relay&&c.relayApi==='openai');
/** The speech address of an OpenAI-form relay. Its address is often written up to /v1 (as OpenAI services are): not twice. */
export const openaiSpeech=base=>String(base).replace(/\/v1$/i,'')+'/v1/audio/speech';
function normalize(key,c){if(key==='fish'){c.relay=typeof c.relay==='string'?c.relay.trim().replace(/\/+$/,''):'';c.relayApi=c.relayApi==='openai'?'openai':'fish';}for(const f of catalogs[key].groups.flatMap(g=>g.fields)){if(f.type==='select'){const opts=allowed(key,f,c);if(!opts.some(([v])=>v===c.params[f.key]))c.params[f.key]=opts.find(([v])=>v===f.value)?.[0]??opts[0]?.[0];}}if(key==='mini'&&c.params['voice_setting.latex_read'])c.params.language_boost='Chinese';}
function activeParameters(key,c){const out={};for(const f of catalogs[key].groups.flatMap(g=>g.fields)){if(unavailable(key,f,c))continue;const v=c.params[f.key];if(v===''||v===undefined||Array.isArray(v)&&!v.length)continue;out[f.key]=structuredClone(v);}return out;}
function setPath(target,key,value){const parts=key.split('.');let node=target;for(const part of parts.slice(0,-1))node=node[part]??=( {} );node[parts.at(-1)]=value;}
// ElevenLabs defaults are left out of requests: a model may reject a field it does not know even when it holds the default
// (eleven_v4 rejects apply_language_text_normalization:false).
const ELEVEN_DEFAULTS={apply_text_normalization:'auto',apply_language_text_normalization:false,use_pvc_as_ivc:false,enable_logging:true};
function requestPreview(key,c,voice='角色音色 ID',text='雨还没停。再坐一会儿吧。',model=c.model){c=structuredClone(c);c.model=model;normalize(key,c);const values=activeParameters(key,c);let body={},query={};for(let [k,v] of Object.entries(values)){if(['dictionary_mode','inline_dictionary'].includes(k))continue;if(key==='eleven'&&Object.hasOwn(ELEVEN_DEFAULTS,k)&&ELEVEN_DEFAULTS[k]===v)continue;if(key==='eleven'&&['output_format','enable_logging','optimize_streaming_latency'].includes(k)){query[k]=v;continue;}const f=catalogs[key].groups.flatMap(g=>g.fields).find(f=>f.key===k);if(f?.type==='lines')v=String(v).split('\n').map(x=>x.trim()).filter(Boolean);setPath(body,k,v);}
 if(key==='doubao')return buildDoubaoRequest(c,{voice},{text});
 if(key==='fish'){if(c.params.dictionary_mode==='inline'&&c.params.inline_dictionary.length)body.pronunciation_dictionary=[{items:c.params.inline_dictionary}];if(body.references)body.references=body.references.map(r=>({audio:'[本地参考音频：'+r.audio+']',text:r.text}));const format=body.format;delete body.format;const compat={url:fishBase(c)+'/compat/v1/audio/speech',body:{model:'fish-audio/'+model,input:text,voice:body.references?'':voice,response_format:format,provider:{options:{'fish-audio':structuredClone(body)}}}};
 // Fish's own /v1/tts: the model in a header, the same fields at the top (the compat request is kept for the cache).
 if(!fishNative({...c,model}))return compat;return {url:fishBase(c)+'/v1/tts',headers:{model},native:true,compat,body:{text,...(body.references||!voice?{}:{reference_id:voice}),format,...body}};}
 if(key==='mimo'){const mode=mimoMode(model),style=[mode==='design'?voice:'',c.params.style].map(x=>String(x||'').trim()).filter(Boolean).join('\n'),audio={format:'wav'};
  if(mode==='preset')audio.voice=voice;else if(mode==='clone')audio.voice='[克隆样本：'+voice+']';
  return {url:'https://api.xiaomimimo.com/v1/chat/completions',body:{model,messages:[...(style?[{role:'user',content:style}]:[]),{role:'assistant',content:text}],audio}};}
 if(key==='mini'){body.model=model;body.text=text;body.voice_setting??={};body.voice_setting.voice_id=body.timbre_weights?.length?'':voice;return {url:'https://'+(c.region==='cn'?'api.minimaxi.com':c.region==='uw'?'api-uw.minimax.io':'api.minimax.io')+'/v1/t2a_v2',body};}
 if(model.startsWith('eleven_v3')&&typeof body.voice_settings?.stability==='number')body.voice_settings.stability=[0,.5,1].reduce((a,b)=>Math.abs(b-body.voice_settings.stability)<Math.abs(a-body.voice_settings.stability)?b:a);
 body.model_id=model;body.text=text;return {url:'https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voice),query,body};
}
function validate(key,c){for(const f of catalogs[key].groups.flatMap(g=>g.fields)){if(unavailable(key,f,c))continue;const v=c.params[f.key];if(f.type==='number'&&v!==''){if(!Number.isFinite(v)||f.min!==undefined&&v<f.min||f.max!==undefined&&v>f.max||f.step===1&&!Number.isInteger(v))return f.label+'数值无效';}if(f.type==='rows'){if(v.length>f.max)return f.label+'条目过多';for(const row of v)for(const col of f.columns){const x=row[col.key];if(!col.optional&&col.type!=='boolean'&&(x===undefined||String(x).trim()===''))return f.label+'：请填写'+col.label;if(col.type==='number'&&(!Number.isFinite(x)||x<col.min||x>col.max||!Number.isInteger(x)))return f.label+'：'+col.label+'数值无效';}}if(['previous_request_ids','next_request_ids'].includes(f.key)&&String(v).split('\n').filter(x=>x.trim()).length>3)return f.label+'最多三个';}return '';}
// Official tag vocabularies (2026-09-30). Fish S1 and MiniMax take a fixed list; Fish S2 and Eleven v3/v4 read
// free-form English in square brackets, so the lists there are the documented examples.
const FISH_S1_EMOTIONS=['happy','sad','angry','excited','calm','nervous','confident','surprised','satisfied','delighted','scared','worried','upset','frustrated','depressed','empathetic','embarrassed','disgusted','moved','proud','relaxed','grateful','curious','sarcastic','disdainful','unhappy','anxious','hysterical','indifferent','uncertain','doubtful','confused','disappointed','regretful','guilty','ashamed','jealous','envious','hopeful','optimistic','pessimistic','nostalgic','lonely','bored','contemptuous','sympathetic','compassionate','determined','resigned'];
const FISH_S1_TONES=['in a hurry tone','shouting','screaming','whispering','soft tone'];
const FISH_S1_SOUNDS=['laughing','chuckling','sobbing','crying loudly','sighing','groaning','panting','gasping','yawning','snoring','break','long-break'];
// Fish S2 / S2.1 (https://docs.fish.audio/developer-guide/core-features/emotions.md, 2026-10-20): the same emotions in square
// brackets (free-form also works), these tones and sounds anywhere, [emphasis] right before the word, [break] / [long-break].
const FISH_S2_TONES=['in a hurry tone','shouting','screaming','whispering','soft tone','emphasis'];
const FISH_S2_SOUNDS=['laughing','chuckling','sobbing','crying loudly','sighing','groaning','panting','gasping','yawning','clear throat','break','long-break'];
const MINI_SOUNDS=['laughs','chuckle','coughs','clear-throat','groans','breath','pant','inhale','exhale','gasps','sniffs','sighs','snorts','burps','lip-smacking','humming','hissing','emm','sneezes'];
const ELEVEN_TAGS=['laughs','laughs harder','starts laughing','whispers','sighs','exhales','sarcastic','curious','excited','crying','mischievously','shouting','nervous','sad','angry'];
const MIMO_STYLES=['开心','悲伤','愤怒','恐惧','惊讶','兴奋','委屈','平静','冷漠','怅然','欣慰','无奈','愧疚','释然','嫉妒','厌倦','忐忑','动情','温柔','高冷','活泼','严肃','慵懒','俏皮','深沉','干练','凌厉'];
const MIMO_SOUNDS=['吸气','深呼吸','叹气','长叹一口气','喘息','屏息','紧张','害怕','激动','疲惫','撒娇','心虚','震惊','不耐烦','颤抖','声音颤抖','变调','破音','鼻音','气声','沙哑','笑','轻笑','大笑','冷笑','抽泣','呜咽','哽咽','嚎啕大哭'];
const fishS1=model=>model==='s1';
const elevenTagged=model=>/^eleven_v[34]/.test(model);
// Drama 3 (https://docs.fish.audio/features/text-to-speech/drama-3.md): a direction in square brackets in plain words, in
// any language, before the words it is for; sounds and pauses in brackets where they happen; paired tags for some words.
const FISH_DRAMA_PAIRS=['whisper','emphasis','soft','fast','slow','stress','forceful'],FISH_DRAMA_SOUNDS=['sigh','small laugh','shaky breath','pause','gasp','sniff'];
const fishDrama=model=>model==='drama-3';
function tags(key,model){if(key==='fish'&&fishDrama(model))return [...FISH_DRAMA_SOUNDS.map(x=>'['+x+']'),...FISH_DRAMA_PAIRS.map(x=>'<'+x+'>…</'+x+'>')];return key==='doubao'?['一整句语音指令，如「用颤抖沙哑、带着哭腔的语气说」']:key==='custom'?[]:key==='mimo'?MIMO_STYLES:key==='mini'?['happy','sad','angry','fearful','disgusted','surprised','calm',...(model.startsWith('speech-2.6')?['fluent','whisper']:[])]:key==='eleven'?(elevenTagged(model)?ELEVEN_TAGS:['通过文字和标点表达情绪']):fishS1(model)?FISH_S1_EMOTIONS:[...FISH_S1_EMOTIONS,...FISH_S2_TONES,...FISH_S2_SOUNDS].map(x=>'['+x+']');}
// What the 情绪 field of a line may say, in Chinese or English, and the MiniMax emotion it means.
const MINI_EMOTION_WORDS={happy:['happy','joyful','excited','cheerful','delighted','开心','高兴','快乐','喜悦','兴奋','愉快','欣喜','得意','雀跃','幸福','激动'],sad:['sad','upset','depressed','sorrowful','crying','难过','伤心','悲伤','沮丧','失落','委屈','哭泣','哽咽','低落','心疼'],angry:['angry','furious','annoyed','mad','生气','愤怒','恼火','不满','暴怒','气愤','不耐烦','烦躁'],fearful:['fearful','scared','afraid','nervous','anxious','害怕','恐惧','紧张','担心','不安','惊恐','慌张','焦虑'],disgusted:['disgusted','contemptuous','disdainful','厌恶','嫌弃','恶心','鄙视','轻蔑','不屑'],surprised:['surprised','shocked','astonished','惊讶','吃惊','震惊','意外','诧异','惊喜'],calm:['calm','gentle','neutral','soft','relaxed','平静','冷静','温柔','淡然','冷淡','平淡','轻声','温和','沉稳','认真','严肃'],fluent:['fluent','流畅','生动'],whisper:['whisper','whispering','whispers','低语','耳语','悄悄','小声']};
/** One line for the engine card: how this model reads emotion and tags. */
function tagNote(key,model){if(key==='doubao')return '合成 2.0：台词的情绪会作为语音指令发过去，像给配音演员说戏，如「用颤抖沙哑、带着哭腔，夹杂着质问的语气说」，不会读出来；只写了一个词（如「委屈」）时插件补成「用委屈的语气说」。原文里不放标签，用标点表达停顿和情绪。1.0 不支持语音指令。';
 if(key==='custom')return '台词的情绪不会写进台词里，要用就在请求体里写 {{emotion}}（比如接口有情绪参数时）。';
 if(key==='mimo')return '台词的情绪会自动写成句首的圆括号标签，如 (开心)，中文最准；原文里还可以在任意位置插方括号的细节标签，如 [轻笑]、[叹气]。'+(mimoMode(model)==='design'?'音色设计模型：角色的「音色」一栏写音色描述。':mimoMode(model)==='clone'?'声音克隆模型：角色的「音色」一栏写克隆样本的名字。':'');
 if(key==='mini')return '台词里的情绪会自动对应到下面这几个（中文也行）；对应不上时由模型自己判断。'+(model.startsWith('speech-2.8')?'原文里还能插下面这些圆括号语气声。':'');
 if(key==='eleven')return elevenTagged(model)?'原文里用方括号英文标签控制语气，如 [whispers]、[sarcastic]；台词的情绪会自动放在开头。'+(model==='eleven_v4'?'v4 只用稳定性和音色相似度两项设置。':''):'这个模型不读语气标签，情绪靠措辞和标点表达。';
 if(key==='fish'&&fishDrama(model))return '像给配音演员说戏：台词的情绪会自动放在开头的方括号里，可以写一整句，中文英文都行，如 [强忍着眼泪，却努力笑着]、[defensive, slightly uneasy tone]。原文里在发生的位置插声音和停顿，如 [sigh]、[pause]；只想改几个词就用成对标签包住，如 <whisper>Go on without me.</whisper>。';
 return fishS1(model)?'圆括号固定标签：情绪放句首，如 (sad)；语气和声音可以放在句中，如 (whispering)、(laughing)。台词的情绪会自动写成句首标签。':'方括号里写英文：句首一个主情绪，如 [sad]、[slightly nervous]、[warm and teasing]；句中可以插语气和声音，如 [whispering]、[emphasis]（紧贴要加重的词）、[laughing]、[break]。一句叠加不超过三个。台词的情绪会自动放在开头。';
}
/** The MiniMax emotion for a line's 情绪, or '' to let the model choose (unknown words, or not supported by the model). */
function miniEmotion(model,emotion){const word=String(emotion||'').trim().toLowerCase();if(!word)return '';const found=Object.entries(MINI_EMOTION_WORDS).find(([,words])=>words.some(w=>word===w||word.includes(w)))?.[0]||'';return tags('mini',model).includes(found)?found:'';}
/** Puts a line's 情绪 at the start of the text as the model's own tag, when the model reads tags and the text has none there. */
const ENGLISH={fearful:'scared',whisper:'whispering',fluent:''};
function emotionTag(key,model,emotion,text){let word=String(emotion||'').trim();if(key==='custom'||key==='doubao'||!word||/^\s*[[(]/.test(text))return text;
 // Drama 3 takes the direction as written, in any language: a whole sentence is fine (one already in brackets keeps them).
 if(key==='fish'&&fishDrama(model)){word=word.replace(/^\[([^\]]*)\]$/,'$1').replace(/[[\]]/g,'').trim();return word&&word.length<=120?`[${word}] ${text}`:text;}
 // MiMo reads Chinese style words best: the 情绪 goes in as written.
 if(key==='mimo')return /^\s*[（]/.test(text)||word.length>20||/[()（）[\]]/.test(word)?text:`(${word})${text}`;
 // A Chinese 情绪 becomes the nearest English word, which both engines read best.
 if(!/^[a-z]/i.test(word)){const found=Object.entries(MINI_EMOTION_WORDS).find(([,words])=>words.some(w=>word.includes(w)))?.[0];word=found?ENGLISH[found]??found:'';if(!word)return text;}
 if(key==='fish'&&fishS1(model)){const w=word.toLowerCase();return FISH_S1_EMOTIONS.includes(w)||FISH_S1_TONES.includes(w)?`(${w}) ${text}`:text;}
 if(key==='fish'||key==='eleven'&&elevenTagged(model))return /^[a-z][a-z ,'-]{1,40}$/i.test(word)?`[${word.toLowerCase()}] ${text}`:text;
 return text;}
export const TTSParameters={fishBase,fishOpenAI,fishNative,openaiSpeech,catalogs,defaults,allowed,unavailable,normalize,activeParameters,requestPreview,validate,tags,tagNote,miniEmotion,emotionTag,vocab:{FISH_DRAMA_PAIRS,FISH_DRAMA_SOUNDS,FISH_S1_EMOTIONS,FISH_S2_TONES,FISH_S2_SOUNDS,FISH_S1_TONES,FISH_S1_SOUNDS,MINI_SOUNDS,ELEVEN_TAGS,MIMO_STYLES,MIMO_SOUNDS,MIMO_VOICES},mimoMode};
