// 随机提示词: when there is no idea yet, a picture made up from common tags. The word lists are this plugin's own. Models
// with character prompts get the scene and each person apart ({prompt, characters: [prompt]}); the older ones one line.
const pick = (list, random) => list[Math.floor(random() * list.length)];
const some = (list, n, random) => { const left = [...list], out = []; while (out.length < n && left.length) out.push(left.splice(Math.floor(random() * left.length), 1)[0]); return out; };
const chance = (p, random) => random() < p;

const HAIR_COLOR = ['black hair', 'brown hair', 'blonde hair', 'red hair', 'pink hair', 'blue hair', 'silver hair', 'white hair', 'green hair', 'purple hair', 'orange hair', 'grey hair', 'light brown hair', 'aqua hair', 'gradient hair', 'multicolored hair', 'two-tone hair'];
const HAIR_STYLE = ['long hair', 'short hair', 'medium hair', 'very long hair', 'ponytail', 'twintails', 'braid', 'side ponytail', 'bob cut', 'messy hair', 'wavy hair', 'straight hair', 'hair bun', 'double bun', 'low twintails', 'hime cut', 'french braid', 'high ponytail', 'side braid', 'blunt bangs'];
const EYES = ['blue eyes', 'brown eyes', 'green eyes', 'red eyes', 'purple eyes', 'yellow eyes', 'grey eyes', 'pink eyes', 'aqua eyes', 'amber eyes', 'black eyes', 'heterochromia'];
const FACE = ['smile', 'open mouth', 'closed eyes', 'blush', 'light smile', 'grin', 'serious', 'surprised', 'pout', 'closed mouth', 'looking at viewer', 'looking away', 'looking back', 'looking up', 'one eye closed', 'tearing up', 'sleepy', 'laughing', 'annoyed', 'embarrassed'];
const TOPS = ['white shirt', 'sailor uniform', 'school uniform', 'hoodie', 'sweater', 'turtleneck', 'blazer', 'kimono', 'yukata', 'maid outfit', 'dress', 'sundress', 'gothic dress', 'wedding dress', 'china dress', 'suit', 'military uniform', 'knight armor', 'witch outfit', 'lab coat', 'denim jacket', 'cardigan', 'trench coat', 'winter coat', 'crop top', 'tank top', 'off-shoulder sweater', 't-shirt', 'tuxedo', 'hakama'];
const BOTTOMS = ['pleated skirt', 'long skirt', 'miniskirt', 'jeans', 'shorts', 'black pants', 'plaid skirt', 'overalls', 'cargo pants', 'high-waist skirt'];
const EXTRAS = ['glasses', 'hat', 'beret', 'ribbon', 'hair ornament', 'scarf', 'necktie', 'earrings', 'choker', 'gloves', 'headphones', 'backpack', 'hair flower', 'hairclip', 'witch hat', 'cat ears', 'fox ears', 'wings', 'horns', 'halo', 'bow', 'necklace', 'umbrella', 'book', 'flower bouquet', 'cup', 'sword', 'camera'];
const POSES = ['standing', 'sitting', 'walking', 'running', 'lying', 'leaning forward', 'arms up', 'hand up', 'hands in pockets', 'crossed arms', 'hand on own cheek', 'looking over shoulder', 'stretching', 'kneeling', 'jumping', 'dancing', 'reading', 'holding umbrella', 'sitting on bench', 'waving'];
const PLACES = ['classroom', 'cafe', 'library', 'city street', 'rooftop', 'beach', 'forest', 'flower field', 'train station', 'bedroom', 'kitchen', 'shrine', 'castle', 'ruins', 'garden', 'mountain', 'snowy field', 'lake', 'festival', 'bookstore', 'greenhouse', 'bridge', 'alley', 'underwater', 'sky', 'cherry blossoms', 'rice paddy', 'convenience store', 'amusement park', 'space'];
const TIMES = ['day', 'night', 'sunset', 'sunrise', 'evening', 'twilight', 'blue sky', 'cloudy sky', 'starry sky', 'rain', 'snow', 'fog', 'autumn leaves', 'moonlight', 'full moon', 'overcast'];
const LIGHT = ['sunlight', 'backlighting', 'soft lighting', 'dappled sunlight', 'rim light', 'neon lights', 'lens flare', 'light rays', 'volumetric lighting', 'dramatic lighting', 'candlelight', 'glowing'];
const FRAME = ['upper body', 'cowboy shot', 'full body', 'portrait', 'close-up', 'from side', 'from above', 'from below', 'from behind', 'dutch angle', 'wide shot', 'depth of field', 'dynamic angle', 'straight-on'];
const SCENERY = ['scenery', 'no humans', 'landscape', 'building', 'tree', 'clouds', 'water', 'reflection', 'horizon', 'ocean', 'mountainous horizon', 'still life', 'window', 'indoors', 'outdoors'];
const PEOPLE = [['girl', 'girl'], ['boy', 'boy']];

function person(gender, random) {
  const out = [gender, pick(HAIR_COLOR, random), pick(HAIR_STYLE, random), pick(EYES, random), ...some(FACE, 1 + Number(chance(.4, random)), random), pick(TOPS, random)];
  if (chance(.5, random)) out.push(pick(BOTTOMS, random));
  if (chance(.6, random)) out.push(...some(EXTRAS, 1 + Number(chance(.3, random)), random));
  out.push(pick(POSES, random));
  return out.join(', ');
}
const headCount = genders => {
  const girls = genders.filter(g => g === 'girl').length, boys = genders.length - girls, word = (n, one) => n > 1 ? `${n}${one}s` : `1${one}`;
  return [girls && word(girls, 'girl'), boys && word(boys, 'boy')].filter(Boolean).join(', ');
};
function scene(random) {
  const out = [pick(PLACES, random), pick(TIMES, random)];
  if (chance(.7, random)) out.push(pick(LIGHT, random));
  out.push(pick(FRAME, random));
  return out;
}
/** characters: whether the model takes character prompts. {prompt, characters: [prompt, …]}; no characters for a place with nobody in it. */
export function randomPicture({characters = true} = {}, random = Math.random) {
  if (chance(.08, random)) return {prompt: [...some(SCENERY, 3, random), pick(PLACES, random), pick(TIMES, random), pick(LIGHT, random)].join(', '), characters: []};
  const roll = random(), count = roll < .62 ? 1 : roll < .9 ? 2 : 3, genders = Array.from({length: count}, () => pick(PEOPLE, random)[0]);
  const people = genders.map(g => person(g, random));
  if (characters) return {prompt: [headCount(genders), ...scene(random)].join(', '), characters: people};
  return {prompt: [headCount(genders), ...people.map(p => p.replace(/^(girl|boy), /, '')), ...scene(random)].join(', '), characters: []};
}
