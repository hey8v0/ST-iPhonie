// Keyword effects use original SVG particles over the chat for about two
// seconds, once, when it comes or is sent (never for what was there when the chat opened). Transform and opacity only,
// nothing to tap through; none at all when the system asks for less motion. 「我 → 个性装扮 → 关键词彩蛋」 turns it off.
export const EGGS = Object.freeze([
  {words: /生日快乐|happy\s*birthday/i, effect: 'birthday', way: 'fall'},
  {words: /新年快乐|过年好|春节快乐/, effect: 'fireworks', way: 'fall'},
  {words: /恭喜|好耶|太棒了/, effect: 'confetti', way: 'fall'},
  {words: /下雪了|好冷啊/, effect: 'snow', way: 'fall'},
  {words: /晚安|好梦/, effect: 'night', way: 'drift'},
  {words: /早安|早上好/, effect: 'sun', way: 'drift'},
  {words: /想你|想见你/, effect: 'miss', way: 'rise'},
  {words: /爱你|喜欢你/, effect: 'love', way: 'rise'},
]);
const heart = '<path d="M16 28C-8 12 7-2 16 9C25-2 40 12 16 28Z"/>';
const rays = Array.from({length: 8}, (_, i) => `<path d="M16 2V8" transform="rotate(${i * 45} 16 16)"/>`).join('');
function particle(effect, i) {
  const shapes = {
    birthday: i % 2 ? '<ellipse cx="16" cy="12" rx="10" ry="11"/><path d="M16 23q-6 4 0 8" fill="none" stroke="currentColor"/>' : '<path d="M5 4l7 2-5 14-7-2zM23 18l7-2 2 12-7 2z"/>',
    fireworks: `<g fill="none" stroke="currentColor" stroke-width="2">${rays}</g><circle cx="16" cy="16" r="3"/>`,
    confetti: '<path d="M4 2h7v12H4zM22 16l6 4-6 10-6-4z"/><circle cx="23" cy="6" r="3"/>',
    snow: `<g fill="none" stroke="currentColor" stroke-width="1.6">${Array.from({length: 6}, (_, j) => `<path d="M16 16V2m0 5-4-3m4 7 4-3" transform="rotate(${j * 60} 16 16)"/>`).join('')}</g>`,
    night: i % 3 ? '<path d="m16 2 4 9 10 1-8 7 2 11-8-6-9 6 3-11-8-7 10-1z"/>' : '<path d="M23 2A14 14 0 1 0 29 24A14 14 0 0 1 23 2Z"/>',
    sun: `<circle cx="16" cy="16" r="7"/><g stroke="currentColor" stroke-width="2">${rays}</g>`,
    miss: `<g fill="none" stroke="currentColor" stroke-width="2">${heart}</g>`,
    love: heart,
  };
  return `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="currentColor" focusable="false">${shapes[effect] || shapes.confetti}</svg>`;
}
/** The egg a message's words call for, or null. */
export const eggOf = text => EGGS.find(e => e.words.test(String(text || ''))) || null;

/** A second effect takes the first one's place. */
export function playEgg(box, egg, win = box?.ownerDocument?.defaultView) {
  if (!box || !egg || !win || win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return null;
  box.querySelector(':scope > .chat-egg')?.remove();
  const layer = box.ownerDocument.createElement('div'), count = 14;
  layer.className = 'chat-egg';
  layer.dataset.way = egg.way;
  layer.dataset.effect = egg.effect;
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--h', `${box.clientHeight || 600}px`);
  layer.innerHTML = Array.from({length: count}, (_, i) => {
    const x = Math.max(2, Math.min(94, Math.round((i + .5) / count * 100 + (Math.random() - .5) * 9))), delay = Math.round(Math.random() * 650);
    const hue = egg.effect === 'snow' ? 195 : egg.effect === 'night' || egg.effect === 'sun' ? 42 : egg.effect === 'love' || egg.effect === 'miss' ? 335 + i % 3 * 8 : i * 47;
    return `<span style="left:${x}%;width:var(--s);height:var(--s);color:hsl(${hue} 85% 68%);--d:${delay}ms;--s:${18 + Math.round(Math.random() * 14)}px;--r:${Math.round((Math.random() - .5) * 70)}deg">${particle(egg.effect, i)}</span>`;
  }).join('');
  box.append(layer);
  win.setTimeout(() => layer.remove(), 2900);
  return layer;
}
