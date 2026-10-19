// 大游戏: the shelf for the bigger games. They are being made again from the start; until then the app shows only that.
import {createView, heading} from './common.js';

export function indieApp(ctx) {
  const v = createView(ctx, 'indie');
  v.draw(heading('大游戏', '', 'Independent Games')
    + '<div class="group pad"><p class="hint" style="padding:0">大游戏正在重新制作，做好了会出现在这里。</p></div>');
  return v;
}
