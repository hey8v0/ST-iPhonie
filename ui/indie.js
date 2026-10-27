// 大游戏: the shelf for the bigger games. Each opens over the whole tavern page (the phone closes meanwhile) and keeps its
// own save in this browser: 方块世界 (a block world made from scratch) and 南极结界 · 鲸湾郊外 (a farm, on hold).
import {createView, heading, esc} from './common.js';

const GAMES = [
  {id: 'blocks', name: '方块世界', tag: '新 · 测试中', text: '从零做起的方块世界：无限的地形、山脉河流、十几种生物群系、洞穴和矿石，昼夜交替、下雨打雷、雪地会积雪，挖方块、放方块、合成、熔炉、种田，盖房子、睡觉，动物成群、夜里有怪物，穿盔甲打怪、射箭、炸 TNT，攒经验附魔、用铁砧修装备、钓鱼，还能切到第三人称看自己。生存模式会饿会受伤，创造模式随便拿还能飞。有正版《我的世界》Java 版的话，可以在游戏里导入它自己的材质（只存在这台设备上）。键盘鼠标、手柄、触屏都能玩，手机竖着拿也会自动横过来。'},
  {id: 'antarctic', name: '南极结界', tag: '测试中 · 暂缓更新', text: '刚到鲸湾的新移民，在城外有一座小农场。捏一个自己、养一只宠物，种田、砍树、采集、制作，去东海岸赶潮、观察生物、记满见闻录。键盘、手柄、触屏都能玩，手机请横屏。'},
];

export function indieApp(ctx) {
  const v = createView(ctx, 'indie');
  const inTavern = () => typeof ctx.api.gameStart === 'function';
  v.draw(heading('大游戏', '', 'Independent Games')
    + GAMES.map(g => `<div class="group pad"><p style="margin:0 0 4px"><b>${esc(g.name)}</b> <span class="hint">${esc(g.tag)}</span></p>`
      + `<p class="hint" style="padding:0;margin:0 0 10px">${esc(g.text)}</p>`
      + `<button type="button" class="primary" data-game="${esc(g.id)}"${inTavern() ? '' : ' disabled'}>开始</button>`
      + (inTavern() ? '' : '<p class="hint" style="padding:0;margin:8px 0 0">要在酒馆里打开小手机才能玩。</p>') + '</div>').join(''));
  v.on('click', '[data-game]', el => { ctx.api.gameStart(el.dataset.game); });
  return v;
}
