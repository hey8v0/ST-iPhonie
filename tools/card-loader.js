// 小手机（ST-iPhonie）加载器 —— 把这一整段放进角色卡的「酒馆助手」脚本里（酒馆助手 → 脚本库 → 角色脚本 → 新建）。
//
// 卡里不放小手机的代码，只放这一小段：
// · 玩家还没装小手机：先问要不要装，同意了就用酒馆自己的「安装扩展」从 GitHub 装上，再提示刷新页面。
//   只问一次，玩家说不装就不会每次打开卡都问。
// · 已经装了：直接用玩家自己的小手机，它跟着酒馆的扩展更新走，一直是最新版。
// · 下面 CARD 里可以写这张卡给小手机的建议（都可以不写）。联系人会先问玩家要不要加，已经有的不会重复加。
//
// 别的功能（音色、主题、预设……）玩家在小手机里自己设；卡作者想改小手机本身，请到 GitHub 提建议，
// 改这段脚本只会改到这张卡自己。
//
// （整段放在一对大括号里：同一个页面里跑第二次也不会冲突。）

{
const CARD = {
  // 这张卡的名字（问玩家时显示），不写就叫「这张卡」
  name: '',
  // 建议的联系人：剧情里能在手机上聊天的人。例子：
  // contacts: [{name: '名字', persona: '人设：性格、和你的关系、说话方式……'}],
  contacts: [],
  // 打开卡以后直接打开小手机的哪个 App：'' 不打开，'chat' 聊天，'wardrobe' 衣柜，'generator' 生成器，'music' 音乐……
  open: '',
};

(async () => {
  const REPO = 'https://github.com/hey8v0/ST-iPhonie';
  // 酒馆助手的脚本可能跑在页面里的一个框中：小手机和酒馆都在外面那一层。
  const top = (() => { try { return window.parent && window.parent.SillyTavern ? window.parent : window; } catch { return window; } })();
  const ctx = top.SillyTavern && top.SillyTavern.getContext ? top.SillyTavern.getContext() : null;
  if (!ctx) return;
  const ask = async (title, text) => {
    if (typeof ctx.callGenericPopup !== 'function') return top.confirm(`${title}\n\n${text}`);
    const box = top.document.createElement('div'), h = top.document.createElement('h3'), p = top.document.createElement('p');
    h.textContent = title; p.textContent = text; box.append(h, p);
    return await ctx.callGenericPopup(box, ctx.POPUP_TYPE.CONFIRM) === ctx.POPUP_RESULT.AFFIRMATIVE;
  };
  const say = text => (top.toastr ? top.toastr.info(text) : console.info(text));
  const who = String(CARD.name || '').trim() || '这张卡';

  // 小手机和页面一起启动，等它几秒。
  let phone = null;
  for (let i = 0; i < 24 && !(phone = top.stIphonie); i++) await new Promise(r => setTimeout(r, 500));

  if (!phone) {
    const asked = 'sttts.loader.asked:' + who;
    try { if (top.localStorage.getItem(asked)) return; top.localStorage.setItem(asked, '1'); } catch { /* 这次照问 */ }
    // 装了但没启用：只提醒，不替玩家去改扩展设置。
    const there = await fetch('/scripts/extensions/third-party/ST-iPhonie/manifest.json', {cache: 'no-store'}).then(r => r.ok).catch(() => false);
    if (there) { say('小手机（ST-iPhonie）装了但没有启用：在酒馆的「扩展」面板里把它打开。'); return; }
    if (!await ask(`${who}要用小手机`, '还没有装小手机（ST-iPhonie）。现在装吗？会用酒馆自己的「安装扩展」从 GitHub 下载，装好后刷新一下页面就能用，以后跟着酒馆的扩展更新。')) return;
    const r = await fetch('/api/extensions/install', {method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({url: REPO, global: false})});
    if (!r.ok) { say('小手机没装上：' + (await r.text()).slice(0, 200)); return; }
    if (await ask('小手机装好了', '刷新页面以后就能用。现在刷新吗？')) top.location.reload();
    return;
  }

  if (Array.isArray(CARD.contacts) && CARD.contacts.length && typeof phone.suggestContacts === 'function') await phone.suggestContacts(CARD.contacts, {from: who});
  if (CARD.open && typeof phone.open === 'function') phone.open(CARD.open);
})();
}
