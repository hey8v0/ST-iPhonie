// 大游戏: the shelf for the bigger games. Each opens over the whole tavern page (the phone closes meanwhile) and keeps its
// own save in this browser. For now one: 南极结界 · 鲸湾郊外, a farm in progress.
import {createView, heading, esc} from './common.js';

const GAMES = [
  {id: 'antarctic', name: '南极结界 · 鲸湾郊外', tag: '测试中', text: '鲸湾郊外的一座小农场：翻土、播种、浇水，四季轮换，出货换代币，在信箱邮购种子。键盘、手柄、触屏都能玩，手机请横屏。'},
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
