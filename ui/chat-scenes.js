// Chat backgrounds: 氛围 (a field of soft colour drifting slowly, ui/aura.js) and 质感 (paper), never drawn pictures.
// Each has a day and a night look and follows the phone's theme (ui/aura.css). The same field is the swatch in 个性装扮
// and the shop. The chat is drawn again for every message: syncMotion sets the drift's clock from the time of day, so
// it carries on instead of starting over.
import {aura} from './aura.js';

// The free ones are listed in core/chat.js (BACKGROUNDS), the shop's in core/wallet.js (PREMIUM); each is a palette of
// ui/aura.css under the same name.
const SCENES = new Set(['sky', 'dusk', 'blush', 'mint', 'lavender', 'deep', 'paper', 'aurora', 'sunset', 'ocean', 'meteor', 'garden']);

/** The still field of a background ('' for none, the photo, or an unknown one). */
export const sceneArt = bg => SCENES.has(bg) ? `<div class="cs-art">${aura(bg)}</div>` : '';
/** Whether dates and notes over the background need light text: never by day (the fields are light then); at night the
 *  theme's own light text is already there. */
export const sceneDark = () => false;
/** The whole background behind a chat's messages. */
export const chatScene = bg => SCENES.has(bg) ? `<div class="chat-scene" data-scene-bg="${bg}" aria-hidden="true">${sceneArt(bg)}</div>` : '';
/** Sets the drift's clock from the time of day, so a background drawn again carries on where it was. */
export function syncMotion(root, win = globalThis) {
  const now = Date.now() / 1000;
  [...root.querySelectorAll('.chat-scene .aura > i')].forEach((el, i) => {
    const d = parseFloat(win.getComputedStyle?.(el).animationDuration || '');
    if (d > 0) el.style.animationDelay = `-${((now + i * 7.31) % d).toFixed(2)}s`;
  });
}
