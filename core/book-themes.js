// 绘本的样子: each kind of story gets a book of its own kind — the paper, ink and accent colours, the type (a body face,
// a display face for titles and shouts, a hand for notes), the ornaments on the page, the tape and stickers of its
// collages, and the way its pictures are drawn. The kind is guessed from the story (the text model's guess comes first
// when the book is written with it). How each one looks on the page is in core/book-pages.js.

const ROUND = '"YouYuan", "幼圆", "Yuanti SC", "Hiragino Maru Gothic ProN", "Varela Round", "PingFang SC", "Microsoft YaHei", sans-serif';
const HAND = '"HanziPen SC", "Hannotate SC", "Wawati SC", "STXingkai", "华文行楷", "Xingkai SC", "KaiTi", "楷体", "Kaiti SC", cursive';
const KAI = '"KaiTi", "楷体", "STKaiti", "Kaiti SC", "Noto Serif SC", serif';
const BRUSH = '"STXingkai", "华文行楷", "Xingkai SC", "STKaiti", "KaiTi", "楷体", "Kaiti SC", serif';
const LI = '"STLiti", "华文隶书", "LiSu", "隶书", "Libian SC", "Baoli SC", "KaiTi", serif';
const BOLD = '"STHupo", "华文琥珀", "Wawati SC", "Hiragino Sans GB", "PingFang SC", "Microsoft YaHei", sans-serif';
const WEI = '"STXinwei", "华文新魏", "Weibei SC", "KaiTi", "楷体", serif';
const SONG = '"STZhongsong", "华文中宋", "Songti SC", "Noto Serif SC", "SimSun", "宋体", serif';
const SANS = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const MONO = '"Consolas", "Menlo", "SF Mono", "Microsoft YaHei", "PingFang SC", monospace';

/**
 * The themes. paper / ink / accent / soft: colours (soft: a quiet second colour); font: the words; title: the title,
 * chapter and shout face; hand: notes and photo captions; deco: the page ornament (core/book-pages.js); tape: the
 * washi tape colours of its collages; doodles: the little drawings it sticks on its paper pages (core/book-ornaments.js);
 * reveal: how its words come in (fade, type, ink, pop, flicker); mood: the feel of a page that says none; art: how its pictures are
 * drawn (tags in front of every prompt when 绘本画风 is on, and a touch of it otherwise); negative: what its
 * pictures avoid; rate: how fast the narrator reads (1 = as usual); words: what in a story points to it.
 */
export const BOOK_THEMES = Object.freeze({
  fairy: {label: '童话', paper: '#fff8ec', ink: '#5a4632', accent: '#e8835a', soft: '#f6dfc4', font: ROUND, title: ROUND, hand: HAND, deco: 'stars', tape: ['#ffc9a8', '#bfe3c0', '#ffe39c'], doodles: ['star', 'sparkle', 'flower', 'ribbon', 'moon'], reveal: 'fade', mood: 'dream',
    art: "picture book, children's book illustration, watercolor (medium), colored pencil (medium), soft pastel colors, warm lighting, whimsical", negative: 'photorealistic, 3d, dark', rate: .95,
    words: /童话|魔法|仙女|精灵|公主|王子|小兔|小熊|森林|城堡|许愿|糖果|fairy|magic|princess|bunny/gi},
  romance: {label: '恋爱', paper: '#fff4f7', ink: '#6b3a4a', accent: '#e86a8e', soft: '#fbd9e3', font: SONG, title: BRUSH, hand: HAND, deco: 'petals', tape: ['#ffc2d4', '#f9e1ea', '#d9c8f5'], doodles: ['heart', 'flower', 'sparkle', 'ribbon', 'butterfly'], reveal: 'fade', mood: 'love',
    art: 'picture book, watercolor (medium), soft focus, pastel pink, flower petals, bokeh, dreamy, romantic atmosphere, gentle light', negative: 'photorealistic, 3d, gore', rate: .95,
    words: /喜欢你|心跳|脸红|告白|约会|亲吻|拥抱|牵手|恋|爱意|害羞|心动|kiss|blush|date|love/gi},
  school: {label: '校园日常', paper: '#f7fbff', ink: '#2d3a4a', accent: '#4a90d9', soft: '#d9e8f7', font: SANS, title: BOLD, hand: HAND, deco: 'lines', tape: ['#a8d4ff', '#ffe08a', '#b9f0c9'], doodles: ['pencil', 'star', 'note', 'cloud', 'cat'], reveal: 'type', mood: 'joy',
    art: 'picture book, colored pencil (medium), crayon, bright colors, clean lines, slice of life, warm sunlight, cheerful', negative: 'photorealistic, 3d, dark', rate: 1,
    words: /学校|教室|同学|老师|社团|放学|作业|考试|食堂|课|宿舍|早餐|便利店|school|class|homework/gi},
  fantasy: {label: '奇幻', paper: '#f4ead5', ink: '#3d2f1f', accent: '#8a5a2b', soft: '#e3d2ad', font: SONG, title: LI, hand: KAI, deco: 'ornate', tape: ['#d8c08e', '#b9a37a', '#e8d9b0'], doodles: ['sparkle', 'key', 'crown', 'star', 'feather'], reveal: 'ink', mood: 'epic',
    art: 'picture book, fantasy storybook illustration, gouache, painterly, golden hour, magical sparkles, detailed background', negative: 'photorealistic, 3d, modern', rate: .95,
    words: /魔王|勇者|骑士|巨龙|龙|剑|咒语|法师|魔物|冒险者|公会|王国|elf|dragon|knight|wizard|quest/gi},
  ancient: {label: '古风', paper: '#f3ece0', ink: '#2b2420', accent: '#a83232', soft: '#e2d6c1', font: KAI, title: BRUSH, hand: BRUSH, deco: 'seal', tape: ['#c9b48f', '#a83232', '#8fa58a'], doodles: ['flower', 'leaf', 'cloud', 'moon', 'wave'], reveal: 'ink', mood: 'calm',
    art: 'chinese ink painting, ink wash painting, watercolor (medium), traditional media, muted colors, xieyi, paper texture, elegant', negative: 'photorealistic, 3d, modern clothes', rate: .9,
    words: /本宫|殿下|公子|姑娘|王爷|皇上|江湖|侠|剑客|朝堂|府|宫|将军|师尊|仙门|修仙|灵力|古琴|长安/g},
  mystery: {label: '悬疑', paper: '#24262b', ink: '#e6e1d6', accent: '#c9a45c', soft: '#3a3d44', font: SONG, title: SONG, hand: MONO, deco: 'noir', tape: ['#c9a45c', '#8a8f99', '#e6e1d6'], doodles: ['key', 'feather', 'moon', 'swirl', 'drop'], reveal: 'type', mood: 'mystery',
    art: 'picture book, gouache, dramatic lighting, chiaroscuro, muted palette, noir, rain, cinematic angle', negative: 'photorealistic, 3d, bright colors', rate: .95,
    words: /线索|案件|侦探|凶手|尸体|密室|嫌疑|证据|真相|调查|警察|detective|murder|clue/gi},
  horror: {label: '恐怖', paper: '#17130f', ink: '#d9cfc4', accent: '#a62626', soft: '#2c241d', font: SONG, title: WEI, hand: WEI, deco: 'scratch', tape: ['#5c1a1a', '#3a332c', '#8a7f72'], doodles: ['drop', 'moon', 'flame', 'swirl', 'feather'], reveal: 'flicker', mood: 'scary',
    art: 'picture book, dark gothic illustration, ink (medium), crosshatching, desaturated, fog, eerie, limited palette', negative: 'photorealistic, 3d, cute, bright', rate: .9,
    words: /鬼|尖叫|恐惧|诡异|血|黑暗|怪物|阴影|恶灵|诅咒|ghost|horror|blood|curse/gi},
  scifi: {label: '科幻', paper: '#0f1626', ink: '#d6e4ff', accent: '#3fd0ff', soft: '#1c2a45', font: SANS, title: SANS, hand: MONO, deco: 'grid', tape: ['#3fd0ff', '#ff5fd2', '#8a7dff'], doodles: ['bolt', 'sparkle', 'star', 'swirl', 'wave'], reveal: 'type', mood: 'mystery',
    art: 'picture book, digital painting, neon glow, cyan and magenta lighting, futuristic, glowing particles, sleek', negative: 'photorealistic, 3d, medieval', rate: 1,
    words: /飞船|星舰|机甲|人工智能|AI|赛博|太空|星球|量子|实验室|机器人|spaceship|cyber|robot|planet/g},
  adventure: {label: '冒险', paper: '#fdf6e3', ink: '#3b2f20', accent: '#2e8b57', soft: '#e8dcb5', font: SONG, title: BOLD, hand: HAND, deco: 'map', tape: ['#c8e6a0', '#f2c879', '#a8d4ff'], doodles: ['sun', 'leaf', 'wave', 'star', 'cloud'], reveal: 'pop', mood: 'epic',
    art: 'picture book, gouache, vivid colors, wide shot, landscape, dynamic composition, sunny, adventurous', negative: 'photorealistic, 3d', rate: 1,
    words: /旅途|出发|地图|宝藏|探险|山洞|大海|航行|荒野|遗迹|treasure|journey|explore/gi},
  comedy: {label: '搞笑', paper: '#fffbe6', ink: '#333333', accent: '#ff9f1c', soft: '#ffe7a8', font: ROUND, title: BOLD, hand: HAND, deco: 'pop', tape: ['#ffd23f', '#ff8fab', '#7cd6ff'], doodles: ['bolt', 'swirl', 'star', 'heart', 'drop'], reveal: 'pop', mood: 'funny',
    art: 'picture book, crayon (medium), cartoon, chibi, bold outlines, flat colors, exaggerated expressions, funny', negative: 'photorealistic, 3d, dark', rate: 1.05,
    words: /哈哈|笑死|吐槽|噗|翻白眼|无语|搞笑|蠢|傻|lol|funny/gi},
});
export const THEME_IDS = Object.freeze(Object.keys(BOOK_THEMES));

/** The kind of story a text reads as (the theme with the most of its words), 'fairy' when nothing stands out. */
export function guessTheme(text) {
  const t = String(text || '');
  let best = 'fairy', most = 2;
  for (const [id, th] of Object.entries(BOOK_THEMES)) {
    const n = (t.match(th.words) || []).length;
    if (n > most) { most = n; best = id; }
  }
  return best;
}
export const themeOf = id => BOOK_THEMES[id] || BOOK_THEMES.fairy;
