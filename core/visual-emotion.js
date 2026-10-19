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

/** Only whole aliases share a category; a custom phrase such as "nervous laugh" stays specific. */
export function visualWordEmotion(value) {
  const text=String(value||'').trim().toLowerCase();
  for(const [id,re] of RULES)for(const m of text.matchAll(re))if(m.index===0&&m[0].length===text.length)return id;
  return '';
}

const EFFECTS = {
  happy:{move:'bounce',mark:'note',burst:'sparkle'}, angry:{move:'shake',mark:'anger',tint:'red'},
  sad:{move:'sink',mark:'drop',tint:'blue'}, surprised:{move:'hop',mark:'surprise',punch:true},
  shy:{mark:'blush',burst:'hearts',tint:'pink'}, nervous:{move:'tremble',mark:'sweat'},
  fearful:{move:'tremble',mark:'sweat',tint:'dark'}, tired:{move:'sink',mark:'sigh'},
  confused:{mark:'dots'}, tender:{move:'bounce',mark:'heart',burst:'hearts',tint:'pink'},
  sulky:{mark:'dots'},worried:{mark:'sweat'},curious:{mark:'dots'},moved:{mark:'heart',burst:'hearts'},
};
export function visualEffects(value) {return {move:'',mark:'',burst:'',tint:'',punch:false,...EFFECTS[visualEmotion(value)]};}
