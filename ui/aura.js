// 氛围底: a soft field of colour instead of a drawn picture — a few large blurred patches of colour that drift very
// slowly into one another, with a faint film grain over them (ui/aura.css). Nothing in it is in rows, so it never
// looks laid out on a grid, and it costs no picture file. Every palette has a day and a night look and follows the
// phone's theme. Used by 好友动态's cover and the chat backgrounds (ui/chat-scenes.js).

/** The palettes. 'theme' follows the phone's own colours; 'paper' is a texture, not colours; the shop's ones are richer
 *  (a slow sheen passes over them; 流星雨 also has stars twinkling). */
export const AURAS = Object.freeze(['theme', 'sky', 'dusk', 'blush', 'mint', 'lavender', 'deep', 'paper', 'aurora', 'sunset', 'ocean', 'meteor', 'garden']);
const RICH = new Set(['aurora', 'sunset', 'ocean', 'meteor', 'garden']);

/** The field: a base colour, four drifting patches and the grain. className: where it sits (it fills its parent). */
export function aura(name, className = '') {
  const palette = AURAS.includes(name) ? name : 'theme';
  return `<div class="aura${className ? ' ' + className : ''}" data-aura="${palette}"${RICH.has(palette) ? ' data-rich' : ''} aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
}
