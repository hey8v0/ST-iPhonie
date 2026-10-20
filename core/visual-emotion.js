// Local visual interpretation only. Never rewrites the emotion or text sent to a speech engine.
const RULES = [
  ['happy', /tears? of joy|crying (?:with|for) joy|喜极而泣|笑出眼泪/gi],
  ['happy', /\b(?:happy|joy(?:ful)?|cheer(?:ful|ing)?|laugh(?:ing|s)?|smil(?:e|ing)|giggl(?:e|ing)|delight(?:ed|ful)?|playful|teas(?:e|ing)|proud|smug|excited|sing(?:ing)?)\b|开心|高兴|愉快|雀跃|得意|欢喜|俏皮|调侃|笑/gi],
  ['angry', /\b(?:angry|annoy(?:ed|ing)?|furious|rage|irritat(?:ed|ing)|mad|shout(?:ing)?|yell(?:ing)?)\b|生气|愤怒|愤|恼|不满|烦躁|不耐烦|怒|吼|凶/gi],
  ['sad', /\b(?:sad(?:ly)?|unhappy|cry(?:ing)?|tears?|tearful|sob(?:bing)?|sorrow(?:ful)?|grief|hurt|lonely|melanchol(?:y|ic)|whimper(?:ing)?)\b|难过|伤心|哭|泪|悲|委屈|失落|沮丧|心酸|哽咽/gi],
  ['surprised', /\b(?:surpris(?:e|ed)|shock(?:ed)?|startl(?:ed|ing)|amaz(?:ed|ing)|astonish(?:ed)?|gasp(?:ing)?)\b|惊讶|惊|吓了一跳|震惊|愣/gi],
  ['shy', /\b(?:shy|blush(?:ing)?|embarrass(?:ed)?|fluster(?:ed)?|bashful|timid)\b|害羞|脸红|羞|不好意思|扭捏|局促/gi],
  ['nervous', /\b(?:nervous(?:ly)?|anxious|uneasy|awkward|tense|sweat(?:ing)?)\b|紧张|不安|忐忑|尴尬|心虚|冒汗/gi],
  ['fearful', /\b(?:scared|afraid|fear(?:ful)?|terrifi(?:ed)|panic(?:ked)?)\b|害怕|恐惧|惊恐|慌|发抖|颤抖/gi],
  ['tired', /\b(?:exhaust(?:ed)?|tired|weary|sigh(?:ing|s)?|whining)\b|疲惫|疲倦|筋疲力尽|累|叹气|叹息|无奈/gi],
  ['confused', /\b(?:confus(?:ed|ion)|puzzled|perplexed|speechless|silent|deadpan|blank)\b|困惑|疑惑|不解|无语|沉默|呆/gi],
  ['tender', /\b(?:tender(?:ly)?|gentle|gently|warm(?:ly)?|affection(?:ate)?|loving|love|adore|flirt(?:ing)?)\b|温柔|温暖|深情|宠溺|爱意|喜欢|心动|撒娇/gi],
  ['sulky', /\b(?:sulky|sulking|pouting|resentful)\b|闹别扭|赌气|嘟嘴|怄气/gi],
  ['worried', /\b(?:worried|worry(?:ing)?|concern(?:ed)?)\b|担心|担忧|忧虑|忧心/gi],
  ['curious', /\b(?:curious|inquisitive|curiosity)\b|好奇|探究/gi],
  ['moved', /\b(?:moved|touched|grateful)\b|感动|动容|感激/gi],
  ['neutral', /\b(?:calm|neutral|relaxed|composed)\b|平静|冷静|放松|淡然/gi],
];

function negated(text, at) {
  const prefix=text.slice(Math.max(0,at-60),at).split(/[，。！？,;.!?；]|\b(?:but|however|yet)\b|但是|但|却/i).at(-1);
  return /\b(?:not|never|no|without|hardly|isn't|wasn't|don't|doesn't)\s+(?:(?:very|really|so|quite|particularly|at all)\s+)*$/i.test(prefix)||/(?:不|没有|并非|不是|毫无|不再|未)(?:太|很|再|怎么|那么|一点也)?$/.test(prefix);
}

/** First non-negated feeling wins; a specific phrase owns its words (tears of joy is not sadness). */
export function visualEmotion(value) {
  const text=String(value||'').toLowerCase(), matches=[];
  for(const [id,re] of RULES)for(const m of text.matchAll(re))if(!negated(text,m.index))matches.push({id,at:m.index,end:m.index+m[0].length});
  // The first rule contains the compound phrases, which may start before the word of another category.
  matches.sort((a,b)=>a.at-b.at||b.end-a.end);
  return matches[0]?.id||'';
}

/** Custom triggers respect English word boundaries, case and negation just like built-in expressions. */
export function matchesVisualWord(value, word) {
  const text=String(value||'').toLowerCase(), needle=String(word||'').trim().toLowerCase();if(!needle)return false;
  let at=-1;
  while((at=text.indexOf(needle,at+1))>=0){
    if(/[a-z0-9]/.test(needle[0])&&/[a-z0-9]/.test(text[at-1]||''))continue;
    if(/[a-z0-9]/.test(needle.at(-1))&&/[a-z0-9]/.test(text[at+needle.length]||''))continue;
    if(!negated(text,at))return true;
  }
  return false;
}

// A Chinese trigger also matches with a few characters between its own, within one clause:
// 抱臂 → 抱着手臂、抱起双臂; 挥手 → 挥了挥手; 双臂交叉 → 双臂在胸前交叉.
const HAN=/^[㐀-鿿]{2,8}$/, GAP='[^，。！？、；：,.!?;:\\s「」『』“”"]{0,3}';
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Every place a trigger is found in a text: [{at, end, text}] (exact or, for Chinese, with a few characters between). */
export function visualWordHits(value, word) {
  const text=String(value||''), lower=text.toLowerCase(), needle=String(word||'').trim().toLowerCase(), out=[];
  if(!needle)return out;
  if(HAN.test(needle)){
    for(const m of lower.matchAll(new RegExp([...needle].map(escapeRe).join(GAP),'g')))if(!negated(lower,m.index))out.push({at:m.index,end:m.index+m[0].length,text:text.slice(m.index,m.index+m[0].length)});
    return out;
  }
  let at=-1;
  while((at=lower.indexOf(needle,at+1))>=0){
    if(/[a-z0-9]/.test(needle[0])&&/[a-z0-9]/.test(lower[at-1]||''))continue;
    if(/[a-z0-9]/.test(needle.at(-1))&&/[a-z0-9]/.test(lower[at+needle.length]||''))continue;
    if(!negated(lower,at))out.push({at,end:at+needle.length,text:text.slice(at,at+needle.length)});
  }
  return out;
}

/**
 * Whether what is at `at` in a text is done by `self`: the last name in the same sentence before it is theirs, or no
 * name is there (她、他: the one speaking). names: everyone who may be named (a name such as 凯西&诺亚 also by its parts).
 */
export function doneBy(value, at, self, names = []) {
  const text=String(value||''), from=Math.max(0,...['。','！','？','\n','!','?','…'].map(c=>text.lastIndexOf(c,at-1)+1));
  const clause=text.slice(from,at), parts=n=>[n,...String(n).split(/[&＆·・、,，/\s]+/)].map(x=>x.trim()).filter(x=>x.length>=1);
  const mine=new Set(parts(self)); let best=null;
  for(const n of new Set([...names,self].flatMap(parts))){const i=clause.lastIndexOf(n);if(i>=0&&(!best||i>best.i||i===best.i&&n.length>best.n.length))best={i,n};}
  return !best||mine.has(best.n);
}

/** Only whole aliases share a category; a custom phrase such as "nervous laugh" stays specific. */
export function visualWordEmotion(value) {
  const text=String(value||'').trim().toLowerCase();
  for(const [id,re] of RULES)for(const m of text.matchAll(re))if(m.index===0&&m[0].length===text.length)return id;
  return '';
}

// How each feeling is staged, like a film rather than a comic: the person moves (move), the camera pushes in, snaps,
// sways or tilts toward them (camera), light gathers around them (burst: warm glints or soft bokeh), the edge of the
// picture takes a colour (tint), lines rush in (lines: 'light' or 'dark').
const EFFECTS = {
  happy:{move:'bounce',burst:'glints',tint:'warm'}, angry:{move:'shake',camera:'snap',tint:'red',lines:'dark'},
  sad:{move:'sink',camera:'push',tint:'blue'}, surprised:{move:'hop',camera:'snap',lines:'light'},
  shy:{burst:'bokeh',tint:'pink'}, nervous:{move:'tremble',camera:'sway'},
  fearful:{move:'tremble',camera:'sway',tint:'dark'}, tired:{move:'sink',tint:'dark'},
  confused:{camera:'tilt'}, tender:{camera:'push',burst:'bokeh',tint:'pink'},
  sulky:{camera:'tilt'},worried:{camera:'sway'},curious:{camera:'tilt'},moved:{camera:'push',burst:'glints',tint:'warm'},
};
export function visualEffects(value) {return {move:'',camera:'',burst:'',tint:'',lines:'',...EFFECTS[visualEmotion(value)]};}
