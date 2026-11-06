// 小手机（ST-iPhonie）加载器 —— 把这一整段放进角色卡的「酒馆助手」脚本里：
// 先打开这张卡，扩展 → 酒馆助手 →「脚本」页 →「+ 脚本」→ 选「角色脚本库」→ 整段粘进「脚本内容」→ 确认；
// 再把「角色脚本」那一栏右边的开关打开（自己新建的卡，这个开关一开始是关的）。
//
// 卡里不放小手机的代码，只放这一小段：
// · 玩家还没装小手机：先问要不要装，同意了就用酒馆自己的「安装扩展」从 GitHub 装上，再提示刷新页面。
//   只问一次，玩家说不装就不会每次打开卡都问。
// · 已经装了：直接用玩家自己的小手机，它跟着酒馆的扩展更新走，一直是最新版。
// · 下面 CARD 里可以写这张卡给小手机的建议（都可以不写）。加之前都会先问玩家，已经有的名字不会重复加。
//
// 卡里的人放哪一栏，由你决定：
// · roles（角色）：放进小手机的「角色 App」，整部手机都认得——聊天、朋友圈、论坛、画图、衣柜、查手机……
//   appearance 是画图用的英文 tag（发色、瞳色、发型、衣着这类，不写也行），画到这个人时会自动带上。
//   之后玩家可以在角色 App 里给 TA 配音色。
// · contacts（联系人）：只在聊天 App 里能聊的人（同学、店员、网友……），不进角色 App。
//
// 自己调试：把 debug 改成 true，保存脚本，刷新页面再打开这张卡——
// · 每一步会在酒馆右上角提示一下（找没找到小手机、加了几个角色和联系人……），浏览器控制台里也有「[小手机加载器]」开头的记录；
// · 不记「已经问过」：每次打开卡都会重新问，方便反复试。要从头再试一遍，先在角色 App / 聊天 App 里把加过的人删掉。
// · 发布前改回 false。
//
// 别的功能（音色、主题、预设……）玩家在小手机里自己设；卡作者想改小手机本身，请到 GitHub 提建议，
// 改这段脚本只会改到这张卡自己。
//
// （整段放在一对大括号里：同一个页面里跑第二次也不会冲突。）

{
const CARD = {
  // 这张卡的名字（问玩家时显示），不写就叫「这张卡」
  name: '',
  // 角色：进角色 App，整部手机都认得。例子：
  // roles: [{name: '名字', persona: '人设：性格、身份、和你的关系、说话方式……', appearance: '1girl, long black hair, red eyes, school uniform'}],
  roles: [],
  // 联系人：只在聊天 App 里能聊。例子：
  // contacts: [{name: '名字', persona: '人设：性格、和你的关系、说话方式……'}],
  contacts: [],
  // 打开卡以后直接打开小手机的哪个 App：'' 不打开，'chat' 聊天，'wardrobe' 衣柜，'generator' 生成器，'music' 音乐……
  open: '',
  // 调试：true 时每一步都提示，也不记「问过了」（见上面「自己调试」）。发布前改回 false。
  debug: false,
};

(async () => {
  const REPO = 'https://github.com/hey8v0/ST-iPhonie';
  // 酒馆助手的脚本可能跑在页面里的一个框中：小手机和酒馆都在外面那一层。
  const top = (() => { try { return window.parent && window.parent.SillyTavern ? window.parent : window; } catch { return window; } })();
  const ctx = top.SillyTavern && top.SillyTavern.getContext ? top.SillyTavern.getContext() : null;
  const say = text => (top.toastr ? top.toastr.info(text) : console.info(text));
  const step = text => { if (!CARD.debug) return; console.info('[小手机加载器] ' + text); say('小手机加载器：' + text); };
  if (!ctx) { step('没找到酒馆（SillyTavern.getContext）'); return; }
  const ask = async (title, text) => {
    if (typeof ctx.callGenericPopup !== 'function') return top.confirm(`${title}\n\n${text}`);
    const box = top.document.createElement('div'), h = top.document.createElement('h3'), p = top.document.createElement('p');
    h.textContent = title; p.textContent = text; box.append(h, p);
    return await ctx.callGenericPopup(box, ctx.POPUP_TYPE.CONFIRM) === ctx.POPUP_RESULT.AFFIRMATIVE;
  };
  const who = String(CARD.name || '').trim() || '这张卡';
  const list = value => (Array.isArray(value) ? value : []).filter(x => x && String(x.name || '').trim());
  step('开始');

  // 小手机和页面一起启动，等它几秒。
  let phone = null;
  for (let i = 0; i < 24 && !(phone = top.stIphonie); i++) await new Promise(r => setTimeout(r, 500));

  if (!phone) {
    step('没找到小手机');
    const asked = 'sttts.loader.asked:' + who;
    if (!CARD.debug) { try { if (top.localStorage.getItem(asked)) return; top.localStorage.setItem(asked, '1'); } catch { /* 这次照问 */ } }
    // 装了但没启用：只提醒，不替玩家去改扩展设置。
    const there = await fetch('/scripts/extensions/third-party/ST-iPhonie/manifest.json', {cache: 'no-store'}).then(r => r.ok).catch(() => false);
    if (there) { say('小手机（ST-iPhonie）装了但没有启用：在酒馆的「扩展」面板里把它打开。'); return; }
    if (!await ask(`${who}要用小手机`, '还没有装小手机（ST-iPhonie）。现在装吗？会用酒馆自己的「安装扩展」从 GitHub 下载，装好后刷新一下页面就能用，以后跟着酒馆的扩展更新。')) { step('玩家没装'); return; }
    const r = await fetch('/api/extensions/install', {method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({url: REPO, global: false})});
    if (!r.ok) { say('小手机没装上：' + (await r.text()).slice(0, 200)); return; }
    if (await ask('小手机装好了', '刷新页面以后就能用。现在刷新吗？')) top.location.reload();
    return;
  }

  step(`找到了小手机（接口第 ${phone.apiVersion} 版）`);
  const roles = list(CARD.roles), contacts = list(CARD.contacts);
  if (roles.length) {
    if (typeof phone.suggestRoles === 'function') step(`角色：加了 ${await phone.suggestRoles(roles, {from: who, debug: CARD.debug})} 个（已经有的、玩家不要的不算）`);
    else say('这张卡想往小手机的角色 App 里加人，但玩家的小手机版本太旧：请在酒馆的扩展面板里更新小手机。');
  }
  if (contacts.length && typeof phone.suggestContacts === 'function') step(`联系人：加了 ${await phone.suggestContacts(contacts, {from: who, debug: CARD.debug})} 个（已经有的、玩家不要的不算）`);
  if (CARD.open && typeof phone.open === 'function') { phone.open(CARD.open); step('打开了 ' + CARD.open); }
  step('完成');
})();
}
