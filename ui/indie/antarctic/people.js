// 南极结界 · 鲸湾的居民: who lives in the city, where each of them is at an hour of the day, what they say (on meeting,
// by the time of day and the season, as one gets to know them), what they like to be given. Pure data and rules — no
// drawing (play.js draws them; town.js says where the places are). Every word here is the game's own.
import {PEOPLE} from './slim.js';

export const HEART_POINTS = 250, HEARTS_MAX = 10;
/** Points for a talk a day, and for a gift by how it was taken. */
export const POINTS = {talk: 20, love: 80, like: 45, neutral: 20, dislike: -20};
/** Things one can give (by the item's type); tools, seeds and made things stay in the bag. */
export const GIFT_TYPES = ['crop', 'forage', 'material'];

const TIMES = ['morning', 'day', 'evening', 'night'];
/** The part of the day an hour is in (the clock runs 6:00 to 2:00). */
export const timeOf = hour => hour < 11 ? 'morning' : hour < 17 ? 'day' : hour < 20 ? 'evening' : 'night';

// Each: id, name, what they are (race, what they do — shown on their card), key (one of slim.js's PEOPLE) or look (the
// 捏人 choices), schedule (where they are by the hour; a place not listed for an hour means they are indoors, unseen),
// here(day): whether they are in town that day at all, what they love / like / dislike (item ids), and their words.
export const RESIDENTS = [
  {id: 'ju', name: '橘', race: '兽人族 · 狐', role: '向导行会的向导', key: 'fox', home: 'guild',
    schedule: [[8, 12, 'guild'], [12, 13, 'plazaBench'], [13, 18, 'guild'], [18, 20, 'board']],
    loves: ['conch'], likes: ['raspberry', 'hazelnut', 'berry'], dislikes: ['kelp'],
    lines: {
      first: ['是你呀！破冰船上那个一直盯着海看的新移民。我是橘，迎接站的向导——以后在鲸湾有什么不懂的，来向导行会找我。', '郊外那块地还住得惯吗？别客气，整个结界的新移民都是这么开始的。'],
      morning: ['早！今天的风从海上来，是个出门的好日子。', '早上好。行会的茶刚泡好，可惜没有你的份——开玩笑的。'],
      day: ['中午广场上最热闹，各族的小吃摊都出来了。', '向导的工作就是带新人认路。你已经认得路了，我有点失落呢。'],
      evening: ['傍晚的码头风大，围巾要围好。', '今天带了三个新移民转了一圈，嗓子都哑了。'],
      night: ['这么晚还在外面？小心别在广场上睡着，霜会把你当旧货卖掉的。', '夜里的鲸湾很安静，只有港口的灯一直亮着。'],
      season: ['春天的渡海节刚过，灯船漂得很远很远。', '夏天的鲸湾又热又吵，我倒是喜欢。', '秋天船来得勤，新移民也多。你还记得自己刚到的那天吗？', '冬天行会的火炉边总是挤满了人，来坐坐。'],
      hearts: {2: '对了，你知道吗？我的耳朵能听见两条街外的消息。所以——别在背后说我坏话哦。', 4: '我刚来鲸湾的时候也是新移民。那时候带我的向导，现在在半岛区当站长了。', 6: '其实我有点怕海。狐狸嘛。可是每次去码头接人，我都站在最前面。', 8: '我偷偷在你的档案上写了一句话：「学得很快，会成为好居民」。别告诉行会。', 10: '要是哪天我不做向导了……我想开一家只卖茶的小店。到时候第一杯请你。'},
      gift: {love: '海螺！贴在耳朵上能听见海。你怎么知道我在找这个？', like: '哇，谢谢！这个我喜欢。', neutral: '谢谢你，我收下了。', dislike: '海带……呃，你是故意的吧？', again: '今天已经收过你的礼物啦，明天再说。'}}},
  {id: 'shuang', name: '霜', race: '兽人族 · 猫', role: '中央市集的旧货摊主', key: 'frost', home: 'stall',
    schedule: [[9, 17, 'stall'], [17, 19, 'quaySun']],
    loves: ['iceroot'], likes: ['shell', 'seaglass', 'frostfruit'], dislikes: ['leek'],
    lines: {
      first: ['……新来的？摊子上的东西随便看，别乱摸。', '我叫霜。什么都收，什么都卖——除了不能卖的。'],
      morning: ['太阳刚好，别挡着。', '早上客人少，正好打个盹。'],
      day: ['今天收了一箱外面来的旧书，字都认不全。', '要买种子？当季的在这儿。'],
      evening: ['码头那边的石头被太阳晒了一天，暖的。我去躺会儿。', '收摊了。明天再来。'],
      night: ['……喵？这个时间我应该在睡觉。', '夜里别乱走，广场上有时候有奇怪的东西。'],
      season: ['春天的旧货最多——大家都在换掉冬天的东西。', '夏天太热了，摊子挪到树荫下。', '秋天的海玻璃颜色最好看，你捡到的话可以带来。', '冬天……我想念晒太阳的日子。'],
      hearts: {2: '你老是来，我都记住你的脚步声了。', 4: '这个摊子是我妈妈留下的。她说，旧东西里藏着别人的故事。', 6: '……别看我这样，我分得出哪件东西有人珍惜过。你的东西，都是。', 8: '昨天有人要高价买走那本旧书，我没卖。总觉得应该留给懂的人。', 10: '以后你捡到什么都先给我看看，好吗？不是要收，就是……想一起看。'},
      gift: {love: '冰根？！这个……我从小就喜欢。给我的？', like: '嗯，这个可以。收下了。', neutral: '……哦。谢谢。', dislike: '野葱。你让一只猫吃野葱。', again: '今天不收了。一天一次，规矩。'}}},
  {id: 'lan', name: '澜', race: '元素种族 · 水', role: '西部群岛的摆渡人', key: 'water', home: 'pier',
    here: day => day % 3 === 1,
    schedule: [[9, 17, 'pier']],
    loves: ['seaglass'], likes: ['kelp', 'conch', 'shell'], dislikes: ['stone'],
    lines: {
      first: ['你是岸上的人。我是澜，从西部群岛来的船。三天来一次，雾季也来。', '有信要送吗？没有的话，陪我看会儿海也行。'],
      morning: ['早。潮水今天很听话。', '早上的雾还没散开，船上的罗盘也懒洋洋的。'],
      day: ['群岛那边今天又起雾了。我倒不怕，水里什么都看得见。', '鲸湾的水比群岛的咸一点。你尝得出来吗？'],
      evening: ['要走了。下次来的时候，给你带群岛的故事。', '傍晚的海面像一块玻璃。可惜一摸就碎。'],
      night: ['夜里不开船。可海还是会在那里。', '……你听，水在说话。'],
      season: ['春天的海水暖起来了，船走得快。', '夏天我会多留一会儿，鲸湾的落日值得看。', '秋天雾季开始，雾账也该算一算了。', '冬天的海很沉。可它还是会等人回家。'],
      hearts: {2: '你每次都来码头看我。……岸上的人很少这样。', 4: '我是水。所以我不太懂「留下」是什么意思。可我每三天都会回来。', 6: '群岛的雾里有一座灯塔，没人知道是谁点的。我想带你去看一次。', 8: '上次离开的时候，我在船底藏了一块海玻璃。想着下次给你。', 10: '要是有一天我不来了，就去西部群岛找我。顺着雾走，我在最深的那一片里。'},
      gift: {love: '海玻璃……被海磨了很久的东西。和我一样。谢谢你。', like: '海的东西。我喜欢。', neutral: '谢谢。我会带回群岛的。', dislike: '石头？它在水里会沉下去的。', again: '今天的礼物已经在船上了。'}}},
  {id: 'shen', name: '沈砚', race: '混血 · 长寿', role: '见闻收购行的掌柜', look: {name: '沈砚', hair: 'bob', hairColor: 1, skin: 2, eyes: 7, top: 'coat', topColor: 8, bottom: 'pants', bottomColor: 2, legwear: 'bare', shoes: 1, acc: 'glasses', accColor: 4, race: 'human'}, home: 'buyer',
    schedule: [[7, 18, 'buyer'], [18, 19, 'plaza']],
    loves: ['herb'], likes: ['mushroom', 'hazelnut', 'turnip'], dislikes: ['shell'],
    lines: {
      first: ['见闻收购行，收你看见的、听见的、捡到的。价格公道，童叟无欺——至少比知识库给得快。', '我是沈砚。你的见闻录要是写满了，记得来。'],
      morning: ['早。今天的收购价和昨天一样。', '一早就有人来卖「看见海豹」。海豹天天在那儿，不算新闻。'],
      day: ['知识库把收购外包给我，是因为他们嫌麻烦。我不嫌。', '你的见闻录记了几页了？'],
      evening: ['一天下来，最值钱的见闻往往是最不起眼的。', '要关门了。有东西明天再来。'],
      night: ['这个点还不睡？见闻录可不收梦话。', '夜里的鲸湾，灯比星星多。'],
      season: ['春天新移民多，卖的都是「第一次看见结界」。', '夏天的见闻容易出汗——开玩笑的。', '秋天的渡海节以后，灰区的消息会变多。', '冬天没什么新鲜事，我就看旧账。'],
      hearts: {2: '你的见闻写得比大多数人仔细。我是说真的。', 4: '我活了很久。久到见过三次渡海节的灯船变样子。', 6: '眼镜不是因为眼睛不好。是因为看得太清楚，有时候想遮一遮。', 8: '知识库想把我这一行收回去。我没答应。有些事，得由不急着写进史书的人来做。', 10: '等你哪天去了灰区回来，第一个来告诉我。不是为了收购。'},
      gift: {love: '星光香草……夜里会发光的那种。你从哪儿弄来的？', like: '不错。我收下了。', neutral: '谢谢。', dislike: '贝壳。我这里已经有三箱贝壳了。', again: '一天一件，这是收购行的老规矩。'}}},
  {id: 'shu', name: '书言', race: '构造体', role: '知识库总馆的管理员', look: {name: '书言', hair: 'long', hairColor: 3, skin: 0, eyes: 6, top: 'dress', topColor: 2, bottom: 'skirt', bottomColor: 0, legwear: 'white', shoes: 2, acc: 'bow', accColor: 0, race: 'human'}, home: 'library',
    schedule: [[8, 19, 'library'], [19, 21, 'plaza']],
    loves: ['dandelion'], likes: ['seaglass', 'iceroot', 'bellflower'], dislikes: ['raspberry'],
    lines: {
      first: ['欢迎来到知识库总馆鲸湾分馆。我是书言，构造体，第七代。借阅请登记，捐赠请到左侧。', '新移民可以免费借阅《结界通识》。读完请归还。'],
      morning: ['早安。今日馆内温度二十一度，湿度适宜。', '早上是整理书的时间。请轻声。'],
      day: ['我的记忆里有四千七百本书。最喜欢的是一本没有字的。', '您的见闻录，馆里也有兴趣。'],
      evening: ['闭馆前请归还借阅的书籍。', '傍晚的光从西窗进来，书脊会褪色。我在想办法。'],
      night: ['夜里我负责看守账链节点。它很安静，像一本还没写的书。', '您为什么还不休息？……啊，我也不需要休息。'],
      season: ['春天：馆前的草地上有蒲公英。我统计过，今年比去年多十七株。', '夏天：馆内凉爽，欢迎避暑。', '秋天：渡海节的灯船，馆里有一盏复制品。', '冬天：暖冬集期间，馆里开放到更晚。'],
      hearts: {2: '您来馆里的次数是本月第三多的。第一是温婆婆。', 4: '构造体不需要睡觉。但我会在凌晨把灯调暗，假装在睡。这样比较像人。', 6: '我记得每一个借过书的人。您第一次来的那天，外面在下雨。', 8: '我的前六代都不在了。他们的记忆在我这里，像书架上的书。有时候我分不清哪一本是我自己写的。', 10: '那本没有字的书，我给它写了第一页。写的是您。'},
      gift: {love: '蒲公英。会飞的种子……我一直想收藏一株。谢谢您。', like: '收下了。我会好好保存。', neutral: '感谢捐赠。', dislike: '树莓汁会弄脏书页。……但还是谢谢您。', again: '今日已收到您的一件。记录在案。'}}},
  {id: 'wen', name: '温婆婆', race: '兽人族 · 猫 · 长寿', role: '社区中心的管事', look: {name: '温婆婆', hair: 'bob', hairColor: 3, skin: 3, eyes: 1, top: 'sweater', topColor: 9, bottom: 'longskirt', bottomColor: 2, legwear: 'black', shoes: 0, acc: 'beanie', accColor: 1, race: 'cat'}, home: 'hall',
    schedule: [[7, 11, 'hall'], [14, 18, 'plazaBench']],
    loves: ['turnip'], likes: ['cabbage', 'iceroot', 'berry'], dislikes: ['seaglass'],
    lines: {
      first: ['哎呀，是郊外那个新来的孩子。我是温婆婆，社区中心的事都归我管——包括给你找一条好围巾。', '每月的故事之夜，记得来广场。老婆子我有讲不完的故事。'],
      morning: ['早啊孩子。吃过了吗？没吃的话社区中心有粥。', '早上社区中心最忙，谁家的猫丢了都来找我。'],
      day: ['今天天气好，晒晒太阳对骨头好。', '广场上这张长椅，我坐了六十年了。'],
      evening: ['天快黑了，早点回家。郊外的路没有灯。', '傍晚的广场最像我小时候的样子。'],
      night: ['老婆子该睡了。你也是。', '夜里别在外面着凉。'],
      season: ['春天的渡海节，我第一次放灯船是一百多年前的事了。', '夏天的故事之夜在室外，蚊子比人多。', '秋天的萝卜最甜。孩子，你种了吗？', '冬天社区中心的炉子一直烧着。冷了就来。'],
      hearts: {2: '你和我年轻时一样，总爱往海边跑。', 4: '我是第二批来的。那时候鲸湾只有二十几户人家，没有广场，只有一棵树。', 6: '老伴走了四十年了。他说过，鲸湾的月亮和别处不一样。我到现在也没看出哪里不一样。', 8: '我把你的名字写进了故事之夜的名单。下个月轮到你讲。讲什么都行。', 10: '孩子，等我讲不动的时候，你来讲。鲸湾的故事，总得有人接着讲下去。'},
      gift: {love: '结界萝卜……和我刚来的那年吃的一个味道。老婆子要哭了。', like: '好孩子，这个我喜欢。', neutral: '有心了，谢谢。', dislike: '海玻璃？老婆子的眼睛看不清这种小东西了。', again: '今天收过啦，留着自己吃。'}}},
  {id: 'tie', name: '阿铁', race: '非人种族 · 矮石人', role: '港务和破冰船的水手长', look: {name: '阿铁', hair: 'wavy', hairColor: 5, skin: 4, eyes: 0, top: 'hoodie', topColor: 0, bottom: 'pants', bottomColor: 4, legwear: 'bare', shoes: 1, acc: 'none', accColor: 4, race: 'human'}, home: 'harbor',
    schedule: [[6, 12, 'pierEnd'], [12, 13, 'harbor'], [13, 19, 'pierEnd']],
    loves: ['hazelnut'], likes: ['wood', 'stone', 'kelp'], dislikes: ['dandelion'],
    lines: {
      first: ['喂，别站在缆绳上。……新来的？我是阿铁，港口的事归我。船要是撞了码头，也归我。', '破冰船每周进港一次。你是坐它来的吧？那艘船上的符文，有一半是我刻的。'],
      morning: ['早。今天要卸三十箱货，没空陪你聊。', '早上的海最老实。'],
      day: ['船上的符文得天天擦，不然雾会往里钻。', '你那块地上要是有多的木头石头，码头收。'],
      evening: ['收工。今天没撞船，是好日子。', '傍晚码头的风能把人吹走，站稳了。'],
      night: ['夜里值班。灯亮着，船就不会迷路。', '……海上有光。不是船。别问。'],
      season: ['春天渡海节的灯船，都是从这个码头放出去的。', '夏天货多，船多，吵。', '秋天的船开始带毛毯和炭来。', '冬天海面结薄冰，破冰船就该干活了。'],
      hearts: {2: '你来码头的次数比海鸥还多。', 4: '我是石头里生出来的。山脊区的石头。所以我不怕冷，就怕闲着。', 6: '那艘破冰船有名字，刻在船底，只有下水的时候看得见。我不告诉你。', 8: '外联组的人上个月来过，想让我出海。我没去。鲸湾的码头没有我，谁来撞船？', 10: '船底的名字是「归」。现在你知道了。'},
      gift: {love: '榛子！硬壳的东西我都喜欢。一口咬开。', like: '行，能用。', neutral: '……哦。放那儿吧。', dislike: '蒲公英。吹一口气就没了的东西，别给我。', again: '一天一样，多了码头放不下。'}}},
  {id: 'lu', name: '小露', race: '混血 · 水系', role: '基础学堂的学生', look: {name: '小露', hair: 'twin', hairColor: 6, skin: 1, eyes: 2, top: 'hoodie', topColor: 5, bottom: 'shorts', bottomColor: 7, legwear: 'stripe', shoes: 3, acc: 'flower', accColor: 5, race: 'water'}, home: 'school',
    schedule: [[8, 14, 'school'], [14, 19, 'fountain']],
    loves: ['conch'], likes: ['shell', 'seaglass', 'berry'], dislikes: ['mushroom'],
    lines: {
      first: ['你就是住在郊外的那个人！老师说新移民都要先认识三个朋友。我算一个！', '我叫小露。我妈妈是水，我爸爸是人。所以我游泳特别快，但是会被晒伤。'],
      morning: ['要迟到了要迟到了！', '早上好！今天学的是结界史，好无聊。'],
      day: ['下课了！去海边吗？去海边吧！', '老师说我上课不能变成水。可是太热了嘛。'],
      evening: ['喷泉里的水会和我说话，你信吗？', '妈妈说天黑前要回家。可是天还没黑！'],
      night: ['……我偷偷溜出来的。别告诉温婆婆。', '晚上的喷泉在发光！你看！'],
      season: ['春天我们学堂要放灯船，我的灯船是鲸鱼形状的。', '夏天最好了！可以天天泡在水里。', '秋天海边有好多贝壳，我有一整盒。', '冬天的喷泉结冰了，我就不能和它说话了。'],
      hearts: {2: '你会种地？教我教我！老师说我种什么死什么。', 4: '我有一个秘密基地，在码头下面。涨潮的时候会淹，所以只有我知道。', 6: '同学说混血的人长大以后会变成一滩水。才不会呢！……会吗？', 8: '我把你捡的贝壳都摆在窗台上了。妈妈说那是鲸湾最好看的窗台。', 10: '等我长大了，我要当向导，像橘姐姐一样。然后带你去结界里所有的海。'},
      gift: {love: '海螺！！能听见海的那种！！我要带去学堂给所有人听！', like: '哇！谢谢谢谢！', neutral: '嗯……谢谢？', dislike: '蘑菇……我不吃蘑菇。它长得像小伞。', again: '今天已经收到啦！明天还有吗？'}}},
];
export const RESIDENT_IDS = RESIDENTS.map(r => r.id);
export const residentOf = id => RESIDENTS.find(r => r.id === id) || null;
/** The person to draw: one of slim.js's people, or made from the 捏人 choices (personFrom, done by the caller). */
export const lookOf = r => r.key ? PEOPLE[r.key] : null;

/** Hearts (0–10) from points. */
export const heartsOf = points => Math.max(0, Math.min(HEARTS_MAX, Math.floor((points || 0) / HEART_POINTS)));
/** Whether an item may be given (by its definition from game.js ITEMS). */
export const giftable = def => !!def && GIFT_TYPES.includes(def.type);
/** How a resident takes an item. */
export function reactionTo(r, itemId) {
  if (r.loves?.includes(itemId)) return 'love';
  if (r.likes?.includes(itemId)) return 'like';
  if (r.dislikes?.includes(itemId)) return 'dislike';
  return 'neutral';
}
/** Whether a resident is in town on a day (some come and go). */
export const inTownOn = (r, day) => typeof r.here === 'function' ? !!r.here(day) : true;
/** Where a resident is at an hour: the place's name, or null when they are indoors (not seen). */
export function placeAt(r, hour, day = 1) {
  if (!inTownOn(r, day)) return null;
  for (const [from, to, place] of r.schedule) if (hour >= from && hour < to) return place;
  return null;
}
/**
 * What a resident says when spoken to. state: {met, points, told: {level: true}} as the game keeps it; now: {hour,
 * season, day}. Answers {pages: [...], story: level reached and told now (or 0)}. The first meeting introduces them;
 * reaching a new heart level tells its story once; otherwise a greeting for the time of day, now and then the season's.
 */
export function wordsFor(r, state, now) {
  const L = r.lines, hearts = heartsOf(state?.points);
  if (!state?.met) return {pages: [...L.first], story: 0};
  const told = state.told || {};
  for (const level of [10, 8, 6, 4, 2]) if (hearts >= level && !told[level] && L.hearts?.[level]) return {pages: [L.hearts[level]], story: level};
  const time = timeOf(now.hour), pool = L[time] || L.day, pick = pool[(now.day + (now.hour | 0)) % pool.length];
  // the season's line every few days, otherwise the time's
  const seasonal = L.season?.[now.season];
  return {pages: [seasonal && now.day % 4 === r.id.length % 4 ? seasonal : pick], story: 0};
}
/** What they say of a gift. */
export const giftWords = (r, reaction) => r.lines.gift[reaction] || r.lines.gift.neutral;
/** The next hour at which a resident's place changes (for walking there), or null. */
export function nextChangeAt(r, hour) {
  const edges = r.schedule.flatMap(([a, b]) => [a, b]).filter(h => h > hour).sort((a, b) => a - b);
  return edges.length ? edges[0] : null;
}
void TIMES;
