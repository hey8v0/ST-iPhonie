// 绘本的样子: each kind of story gets a book of its own kind — the paper, ink and accent colours, the type, the
// ornaments on the page, how a picture and its words share a page, and the style the pictures are drawn in. The kind
// is guessed from the story (the text model's guess comes first when the book is written with it).

/**
 * The themes. paper / ink / accent / soft: colours; font: the type (system fonts, falling back); deco: the ornament
 * drawn on pages (see ui/book.css); layout: where the picture goes by default ('top': picture above the words, 'full':
 * the picture fills the page with the words over it in a box, 'frame': a framed picture on a plain page); art: tags
 * added to every picture prompt; rate: how fast the narrator reads (1 = as usual); words: what in a story points to it.
 */
export const BOOK_THEMES = Object.freeze({
  fairy: {label: '童话', paper: '#fff8ec', ink: '#5a4632', accent: '#e8835a', soft: '#f6dfc4', font: '"YouYuan", "幼圆", "Varela Round", "PingFang SC", "Microsoft YaHei", sans-serif', deco: 'stars', layout: 'top',
    art: "children's picture book illustration, soft watercolor, pastel colors, warm light, cute, storybook", rate: .95,
    words: /童话|魔法|仙女|精灵|公主|王子|小兔|小熊|森林|城堡|许愿|糖果|fairy|magic|princess|bunny/gi},
  romance: {label: '恋爱', paper: '#fff4f7', ink: '#6b3a4a', accent: '#e86a8e', soft: '#fbd9e3', font: '"Noto Serif SC", "Songti SC", "SimSun", serif', deco: 'petals', layout: 'full',
    art: 'shoujo manga illustration, soft lighting, flowers, dreamy atmosphere, pastel pink, romantic', rate: .95,
    words: /喜欢你|心跳|脸红|告白|约会|亲吻|拥抱|牵手|恋|爱意|害羞|心动|kiss|blush|date|love/gi},
  school: {label: '校园日常', paper: '#f7fbff', ink: '#2d3a4a', accent: '#4a90d9', soft: '#d9e8f7', font: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif', deco: 'lines', layout: 'top',
    art: 'anime slice of life illustration, bright colors, clean lineart, everyday scene', rate: 1,
    words: /学校|教室|同学|老师|社团|放学|作业|考试|食堂|课|宿舍|早餐|便利店|school|class|homework/gi},
  fantasy: {label: '奇幻', paper: '#f4ead5', ink: '#3d2f1f', accent: '#8a5a2b', soft: '#e3d2ad', font: '"Noto Serif SC", "Songti SC", "SimSun", serif', deco: 'ornate', layout: 'frame',
    art: 'fantasy storybook illustration, detailed, magical atmosphere, golden light, epic', rate: .95,
    words: /魔王|勇者|骑士|巨龙|龙|剑|咒语|法师|魔物|冒险者|公会|王国|elf|dragon|knight|wizard|quest/gi},
  ancient: {label: '古风', paper: '#f3ece0', ink: '#2b2420', accent: '#a83232', soft: '#e2d6c1', font: '"KaiTi", "STKaiti", "楷体", "Noto Serif SC", serif', deco: 'seal', layout: 'frame',
    art: 'traditional chinese painting, ink wash, gongbi, elegant, muted colors, hanfu', rate: .9,
    words: /本宫|殿下|公子|姑娘|王爷|皇上|江湖|侠|剑客|朝堂|府|宫|将军|师尊|仙门|修仙|灵力|古琴|长安/g},
  mystery: {label: '悬疑', paper: '#24262b', ink: '#e6e1d6', accent: '#c9a45c', soft: '#3a3d44', font: '"Noto Serif SC", "Songti SC", "SimSun", serif', deco: 'noir', layout: 'full',
    art: 'noir illustration, dramatic shadows, muted colors, cinematic lighting, mysterious', rate: .95,
    words: /线索|案件|侦探|凶手|尸体|密室|嫌疑|证据|真相|调查|警察|detective|murder|clue/gi},
  horror: {label: '恐怖', paper: '#17130f', ink: '#d9cfc4', accent: '#a62626', soft: '#2c241d', font: '"Noto Serif SC", "Songti SC", "SimSun", serif', deco: 'scratch', layout: 'full',
    art: 'dark horror illustration, eerie atmosphere, desaturated, fog, unsettling', rate: .9,
    words: /鬼|尖叫|恐惧|诡异|血|黑暗|怪物|阴影|恶灵|诅咒|ghost|horror|blood|curse/gi},
  scifi: {label: '科幻', paper: '#0f1626', ink: '#d6e4ff', accent: '#3fd0ff', soft: '#1c2a45', font: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif', deco: 'grid', layout: 'full',
    art: 'sci-fi concept art, neon lights, futuristic city, cinematic, glowing', rate: 1,
    words: /飞船|星舰|机甲|人工智能|AI|赛博|太空|星球|量子|实验室|机器人|spaceship|cyber|robot|planet/g},
  adventure: {label: '冒险', paper: '#fdf6e3', ink: '#3b2f20', accent: '#2e8b57', soft: '#e8dcb5', font: '"Noto Serif SC", "Songti SC", "SimSun", serif', deco: 'map', layout: 'top',
    art: 'adventure storybook illustration, vivid colors, dynamic composition, wide landscape', rate: 1,
    words: /旅途|出发|地图|宝藏|探险|山洞|大海|航行|荒野|遗迹|treasure|journey|explore/gi},
  comedy: {label: '搞笑', paper: '#fffbe6', ink: '#333333', accent: '#ff9f1c', soft: '#ffe7a8', font: '"YouYuan", "幼圆", "PingFang SC", "Microsoft YaHei", sans-serif', deco: 'pop', layout: 'top',
    art: 'cartoon comic illustration, expressive faces, bold outlines, bright colors, funny', rate: 1.05,
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
