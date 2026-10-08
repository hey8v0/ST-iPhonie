export const DEFAULT_PROMPT = "正常续写正文与叙事，不要改变角色人设或写作风格。\n每一次角色真正说出口的台词，都必须完整写成 {{格式}}，不得留下没有语音标签的对白。标签前的译文是完整、自然的中文；标签内的文本是同一句台词的完整原语言版本，逐句对应、语义与信息完全一致，不概括、不漏译、不额外扩写。\n角色、情绪、译文和文本都必须填写实际内容。台词语言遵循：{{语言}}。旁白、动作、环境和心理描写继续写成普通正文。\n不要解释规则或输出代码块，不为未说出口的内容生成语音标签。";
export const isPlaceholderRole=name=>/^\{\{?\s*(?:角色|角色名|role|speaker|char)\s*\}?\}$/iu.test(String(name).trim());
// Plain paired tags (no attributes), so other plugins that exclude <tag></tag> blocks can drop the voice text.
export const DEFAULT_FORMAT = '“{译文}”<tts>{角色}|{情绪}|{文本}</tts>';
// Earlier default; replies written with it keep their waves.
export const LEGACY_FORMATS = Object.freeze(['“{译文}”<tts role="{角色}" emotion="{情绪}">{文本}</tts>']);
/** Formats tried when reading a reply: the active preset first, then the other presets, then the built-in ones. */
export function knownFormats(settings){const p=settings.presets.find(p=>p.id===settings.activePreset);return [...new Set([p?.format,...settings.presets.map(p=>p.format),DEFAULT_FORMAT,...LEGACY_FORMATS].filter(Boolean))];}
const fields=['译文','角色','情绪','文本'];
export const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function decodeText(s){return s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,m=>{const names={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(names[m.toLowerCase()])return names[m.toLowerCase()];const hex=m[2].toLowerCase()==='x',n=parseInt(m.slice(hex?3:2,-1),hex?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):m;});}
export function compileFormat(format){if(typeof format!=='string'||format.length>2000)throw Error('台词格式无效');const tokens=[...format.matchAll(/\{(译文|角色|情绪|文本)\}/g)];if(tokens.length!==4||fields.some(f=>tokens.filter(t=>t[1]===f).length!==1))throw Error('台词格式需各保留一次 {译文}、{角色}、{情绪}、{文本}');const literals=[],names=[];let at=0;for(const t of tokens){literals.push(format.slice(at,t.index));names.push(t[1]);at=t.index+t[0].length;}literals.push(format.slice(at));if(literals.some(x=>!x.length))throw Error('台词格式的字段之间、开头和结尾需要固定分隔文字');return {literals,names};}
/** Code blocks and inline code: voice tags inside them are examples, not lines. */
function codeSpans(message){return [...message.matchAll(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/g)].map(m=>[m.index,m.index+m[0].length]);}
/** The “{译文}”<tts>{角色}|{情绪}|{文本}</tts> shape, whose common slips can still be read. */
const tagFamily=format=>format.replace(/\s+/g,'')==='“{译文}”<tts>{角色}|{情绪}|{文本}</tts>';
// Repairs that keep every character in place, so positions found in the repaired text hold in the original:
// <TTS> in capitals, a full-width ｜ inside a tag, and "…" 「…」 『…』 ＂…＂ around the translation instead of “…”.
function repaired(message){return message.replace(/<\/?tts\b/gi,m=>m.toLowerCase()).replace(/<tts>[^<]{0,6000}<\/tts>/g,m=>m.replace(/｜/g,'|')).replace(/(["「『＂])([^"「」『』＂“”\n]{1,1000})(["」』＂])(?=<tts>)/g,(m,a,t)=>'“'+t+'”');}
function exactLines(message,literals,names,excluded){const result=[];let cursor=0,tries=0;while(cursor<message.length&&result.length<500&&tries++<2000){const start=message.indexOf(literals[0],cursor);if(start<0)break;const hidden=excluded.find(([a,b])=>a<=start&&start<b);if(hidden){cursor=hidden[1];continue;}let at=start+literals[0].length,valid=true,values={};for(let i=0;i<4;i++){const end=message.indexOf(literals[i+1],at);if(end<0){valid=false;break;}values[names[i]]=decodeText(message.slice(at,end));at=end+literals[i+1].length;}if(valid&&message.slice(start+literals[0].length,at).includes(literals[0]))valid=false;cursor=valid?at:start+literals[0].length;if(!valid||excluded.some(([a,b])=>start<b&&at>a)||fields.some(f=>!values[f]?.trim())||values.角色.length>100||values.情绪.length>100||isPlaceholderRole(values.角色))continue;
// A line quoted twice (““你好””<tts>…) matches from the inner quote: the outer opening quote is left in front and the
// outer closing one ends the translation. Both belong to the line; quotes around the whole translation are dropped.
let from=start,said=values.译文;const lead=literals[0],close=literals[1]?.[0];if(lead&&close&&start>=lead.length&&message.slice(start-lead.length,start)===lead&&said.endsWith(close)&&(result.at(-1)?.end??0)<=start-lead.length){from=start-lead.length;said=said.slice(0,-close.length);}
const bare=said.replace(/^\s*[“"]\s*([\s\S]*?)\s*[”"]\s*$/,'$1');if(bare.trim())said=bare;
result.push({start:from,end:at,translation:said,role:values.角色.trim(),emotion:values.情绪.trim(),text:values.文本});}return result;}
// Voice tags the exact reading skipped but that are still clear: two fields (角色|原文, the emotion is left to the
// engine), and tags with no quoted translation in front (the original text is shown instead). Others stay problems.
function looseLines(message,found,excluded){const out=[];for(const m of message.matchAll(/<tts>([^<]{1,6000}?)<\/tts>/g)){const at=m.index,end=at+m[0].length;if(found.some(l=>at<l.end&&end>l.start)||excluded.some(([a,b])=>at<b&&end>a))continue;const parts=m[1].split('|');if(parts.length<2||parts.length>3)continue;const role=decodeText(parts[0]).trim(),emotion=parts.length===3?decodeText(parts[1]).trim():'',text=decodeText(parts.at(-1)).trim();if(!role||role.length>100||emotion.length>100||isPlaceholderRole(role)||!text.trim())continue;
const before=Math.max(0,...found.map(l=>l.end).filter(e=>e<=at),...out.map(l=>l.end)),quoted=/“([^“”]{1,2000})”\s*$/.exec(message.slice(before,at));
out.push({start:quoted?at-quoted[0].length:at,end,translation:(quoted?decodeText(quoted[1]):text).trim(),role,emotion,text});}return out;}
export function parseDialogue(message,format=DEFAULT_FORMAT){const {literals,names}=compileFormat(format);message=String(message);if(message.length>500000)return [];
// A straight quote right outside a curly one ("“你好”"<tts>…) counts as a second curly quote. Same length, so positions hold.
if(literals[0]==='“')message=message.replace(/"(?=“)/g,'“').replace(/(?<=”)"/g,'”');
const family=tagFamily(format);if(family)message=repaired(message);
const excluded=codeSpans(message),found=exactLines(message,literals,names,excluded);
return family?[...found,...looseLines(message,found,excluded)].sort((a,b)=>a.start-b.start):found;}
/** Voice tags in a reply that were not read as lines (lines: what was read), each with why, for the hint under the
 *  reply and the self-check. */
export function dialogueProblems(message,lines=[]){const text=String(message);if(!/<tts\b/i.test(text)||text.length>500000)return [];const fixed=repaired(text.replace(/"(?=“)/g,'“').replace(/(?<=”)"/g,'”')),excluded=codeSpans(fixed),problems=[];
for(const m of fixed.matchAll(/<tts\b[^>]*>/g)){const at=m.index;if(lines.some(l=>at>=l.start&&at<l.end)||excluded.some(([a,b])=>at>=a&&at<b))continue;
const close=fixed.indexOf('</tts>',at),next=fixed.indexOf('<tts',at+4),open=close<0||(next>=0&&next<close);
const inner=open?'':fixed.slice(at+m[0].length,close),parts=inner.split('|'),role=decodeText(open?fixed.slice(at+m[0].length).split(/[|<\n]/)[0]:parts[0]).trim();
let reason;if(open)reason='标签没有闭合，少了 </tts>';else if(m[0]!=='<tts>')reason='标签写法不对，应该是 <tts>角色|情绪|原文</tts>';else if(parts.length<2)reason='缺少分隔符 |，应该写成 角色|情绪|原文';else if(parts.length>3)reason=`分成了 ${parts.length} 段，应该是 角色|情绪|原文 三段`;else if(!role)reason='没有写角色名';else if(isPlaceholderRole(role))reason=`角色名还是占位符 ${role}`;else if(!parts.at(-1).trim())reason='没有写原文';else reason='格式没认出来';
problems.push({at,role:role.slice(0,40),reason,snippet:text.slice(at,Math.min(open?at+80:close+6,at+120))});}return problems;}
export function renderDialogue(message,format,marker){const lines=parseDialogue(message,format);let out='',at=0;lines.forEach((line,index)=>{out+=message.slice(at,line.start);out+=`<span class="sttts-utterance" data-sttts-line="${index}" data-sttts-token="${marker}"><span class="sttts-translation" data-sttts-translation>“${escapeHTML(line.translation)}”</span> <button type="button" class="sttts-play" data-sttts-action="line" data-sttts-state="ungenerated" aria-label="生成并朗读 ${escapeHTML(line.role)} 的台词"><span data-sttts-wave aria-hidden="true"><i data-sttts-bar></i><i data-sttts-bar></i><i data-sttts-bar></i><i data-sttts-bar></i><i data-sttts-bar></i></span></button></span>`;at=line.end;});return out+message.slice(at);}
/** Voice switched off: each tagged line shows only its Chinese translation, without the tag or the wave button. */
export function plainDialogue(message,format){const lines=parseDialogue(message,format);let out='',at=0;for(const line of lines){out+=message.slice(at,line.start)+'“'+escapeHTML(line.translation)+'”';at=line.end;}return out+message.slice(at);}
export function validatePreset(p){compileFormat(p.format);if(!p.entries?.some(e=>e.enabled&&e.text?.trim()))throw Error('请启用至少一条提示词');const text=p.entries.filter(e=>e.enabled).map(e=>e.text).join('\n');if(!text.includes('{{格式}}')||!text.includes('{{语言}}'))throw Error('提示词需要 {{格式}} 与 {{语言}}');for(const i of [p.injection,...p.entries.filter(e=>e.injection).map(e=>e.injection)]){if(!i||!['in_chat','in_prompt','before_prompt'].includes(i.position)||!['system','user','assistant'].includes(i.role)||!Number.isInteger(i.depth)||i.depth<0||i.depth>10000)throw Error('提示词插入设置无效');}}
export function dialogueContract(format){return [
'【对白输出硬性规则】',
'每一次真正说出口的台词都必须使用这一完整格式：'+format,
'完整覆盖：问候、短答、感叹、打断、对白中的连续句子都要带标签；不要只给部分对白加标签。旁白、动作、环境和未说出口的心理活动保持普通正文。',
'一一配对：一组中文译文紧接一个语音标签，二者对应同一个说话者的同一段连续发言。每句意思、事实、称呼、否定、提问和先后顺序都必须完整对应。译文不能只译开头、概括大意、截短或用省略号代替剩余内容；朗读文本不得增加译文中没有的句子、解释或情节。',
'分段对应：长台词按句或短意群拆成多组，每组都保留完整中文译文及对应原语言文本。换说话者或中间插入动作/旁白时另起一组，不把多个人的发言塞进同一个标签。',
'中文台词：当原语言就是中文时，去掉引擎声音标签和停顿标记后，标签内台词与标签前中文译文应一致；不要另写一个加长版本。其他语言使用忠实、完整的自然中文翻译，不按字数比例机械删减。',
'发声范围：语气词和停顿仅使用该角色引擎/模型支持的写法，不把动作或心理描写夹进朗读文本。角色字段填写实际姓名，不能照抄 {角色} 或 {{角色}} 等占位符。',
'格式完整：每一组都填写译文、角色、情绪、文本并闭合标签；字段内的特殊分隔符用 HTML 实体转义（例如 &quot;、&lt;、&gt;、&amp;），完整标签不要写进代码块。',
'输出前自行核对：每段发声是否都有完整标签；每组译文与朗读内容是否逐句对应且无漏译、无增写；所有标签是否闭合。直接输出检查后的正文，不输出核对过程。'
].join('\n');}
/** Prompt entries for the story request. only: names of this chat's speakers; the language line lists just them. */
export function promptPlan(settings,rules,only=null){const p=settings.presets.find(p=>p.id===settings.activePreset);if(!p)return [];validatePreset(p);const named=(()=>{const all=settings.routes.filter(r=>!isPlaceholderRole(r.name));if(!Array.isArray(only))return all;const wanted=new Set(only.map(n=>String(n).trim()));return all.filter(r=>wanted.has(r.name));})();const language='默认台词语言：'+settings.general.defaultLanguage+(named.length?'；'+named.map(r=>`${r.name}：${r.language||settings.general.defaultLanguage}`).join('；'):'');const entries=p.entries.filter(e=>e.enabled&&e.text.trim());const plan=entries.map((e,index)=>{const i=e.injection||p.injection;return {key:'sttts.entry.'+String(index).padStart(4,'0'),text:e.text.replaceAll('{{格式}}',p.format).replaceAll('{{语言}}',language),position:{in_chat:1,in_prompt:0,before_prompt:2}[i.position],depth:i.position==='in_chat'?i.depth:0,role:i.position==='in_chat'?{system:0,user:1,assistant:2}[i.role]:0};});const tail=plan[0];if(tail)tail.text+='\n\n'+rules+'\n\n'+dialogueContract(p.format);return plan;}
// 前端美化 cards: their regex may put the reply into a code block or a whole HTML page that 酒馆助手 draws in a frame of
// its own, where the plugin's styles and clicks do not reach. The waves that landed in such places are taken back out,
// leaving the translation as written, so the card looks as it was made (the lines still play from 整条播放 and 听取).
const FRAMED = /```[\s\S]*?(?:```|$)|<(?:!doctype\s+html|html)\b[\s\S]*?(?:<\/html\s*>|$)/gi;
const WAVE = /<span class="sttts-utterance"[^>]*><span class="sttts-translation"[^>]*>([\s\S]*?)<\/span> <button type="button" class="sttts-play"[^>]*>[\s\S]*?<\/button><\/span>/g;
export function unwaveFramed(text){return String(text).replace(FRAMED,block=>unmark(block.replace(WAVE,'$1')));}
// Marks before markup: a 前端美化 card's regex often wraps runs of plain text (each paragraph in its own card); a wave
// button put in before the regex is a tag in the middle of the run and cuts the card in two. So before the regex each
// line is only “译文” between invisible marks (Unicode private use: OPEN, the line's number, MID … CLOSE), which the
// regex and Markdown read as ordinary text; once they have run, waveMarks turns the marks into the wave.
const ch = n => String.fromCharCode(n), MARK_OPEN = ch(0xE000), MARK_MID = ch(0xE001), MARK_CLOSE = ch(0xE002), MARK_BASE = 0xE100;
const MARKED = new RegExp(`${MARK_OPEN}([${ch(0xE100)}-${ch(0xE8FF)}])${MARK_MID}([^]*?)${MARK_CLOSE}`, 'g'), MARK_LEFT = new RegExp(`${MARK_OPEN}[${ch(0xE100)}-${ch(0xE8FF)}]?${MARK_MID}?|${MARK_CLOSE}`, 'g');
const waveButton = role => `<button type="button" class="sttts-play" data-sttts-action="line" data-sttts-state="ungenerated" aria-label="生成并朗读 ${escapeHTML(role)} 的台词"><span data-sttts-wave aria-hidden="true"><i data-sttts-bar></i><i data-sttts-bar></i><i data-sttts-bar></i><i data-sttts-bar></i><i data-sttts-bar></i></span></button>`;
/** Each tagged line as its “translation” between marks, for the stage before a card's regex. */
export function markDialogue(message, format) {
  const lines = parseDialogue(message, format); let out = '', at = 0;
  lines.forEach((line, index) => { out += message.slice(at, line.start) + MARK_OPEN + String.fromCharCode(MARK_BASE + index) + MARK_MID + `“${escapeHTML(line.translation)}”` + MARK_CLOSE; at = line.end; });
  return out + message.slice(at);
}
/** Whether html has a tag without its pair (line breaks aside): pairs are taken out from the inside until none are left. */
function cutInto(html) {
  let t = String(html).replace(/<br\s*\/?>/gi, ''), before;
  do { before = t; t = t.replace(/<([A-Za-z][\w-]*)(?:\s[^<>]*)?>([^<]*)<\/\1\s*>/g, '$2'); } while (t !== before);
  return t.includes('<');
}
/** After the regex and Markdown: the marks become the waves (roles: the lines' speakers, for the button's label). Marks a
 *  card's regex pulled apart are only taken away. */
export function waveMarks(html, marker, roles = []) {
  return String(html).replace(MARKED, (m, n, text) => { const index = n.charCodeAt(0) - MARK_BASE;
    // A line the regex cut into (a tag left open or closed inside it) keeps its text and gets no wave. Whole pairs are
    // fine: the tavern puts every “quote” in <q>, Markdown adds <em> and <strong>.
    if (cutInto(text)) return text;
    return `<span class="sttts-utterance" data-sttts-line="${index}" data-sttts-token="${marker}"><span class="sttts-translation" data-sttts-translation>${text}</span> ${waveButton(roles[index] || '')}</span>`; }).replace(MARK_LEFT, '');
}
/** Marks without their waves (inside a framed block, or when nothing turns them into waves). */
export const unmark = text => String(text).replace(MARKED, '$2').replace(MARK_LEFT, '');
