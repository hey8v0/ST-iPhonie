// 关键词彩蛋 (0.9.34): a message that says 生日快乐, 晚安, 想你… sends a few light emoji over the chat for about two
// seconds, once, when it comes or is sent (never for what was there when the chat opened). Transform and opacity only,
// nothing to tap through; none at all when the system asks for less motion. 「我 → 个性装扮 → 关键词彩蛋」 turns it off.
export const EGGS = Object.freeze([
  {words: /生日快乐|happy\s*birthday/i, emoji: ['🎂', '🎉', '🎁', '🎈'], way: 'fall'},
  {words: /新年快乐|过年好|春节快乐/, emoji: ['🧧', '🎆', '🏮'], way: 'fall'},
  {words: /恭喜|好耶|太棒了/, emoji: ['🎊', '🎉', '✨'], way: 'fall'},
  {words: /下雪了|好冷啊/, emoji: ['❄️', '❄️', '☃️'], way: 'fall'},
  {words: /晚安|好梦/, emoji: ['🌙', '⭐', '✨'], way: 'drift'},
  {words: /早安|早上好/, emoji: ['☀️', '🌤️', '🌼'], way: 'drift'},
  {words: /想你|想见你/, emoji: ['💕', '💗', '💞'], way: 'rise'},
  {words: /爱你|喜欢你/, emoji: ['❤️', '💖', '💘'], way: 'rise'},
]);
/** The egg a message's words call for, or null. */
export const eggOf = text => EGGS.find(e => e.words.test(String(text || ''))) || null;

/** The emoji over the messages (box: the chat's .msgs-wrap); a second one takes the first one's place. */
export function playEgg(box, egg, win = box?.ownerDocument?.defaultView) {
  if (!box || !egg || !win || win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return null;
  box.querySelector(':scope > .chat-egg')?.remove();
  const layer = box.ownerDocument.createElement('div'), count = 14;
  layer.className = 'chat-egg';
  layer.dataset.way = egg.way;
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--h', `${box.clientHeight || 600}px`);
  layer.innerHTML = Array.from({length: count}, (_, i) => {
    const x = Math.max(2, Math.min(94, Math.round((i + .5) / count * 100 + (Math.random() - .5) * 9))), delay = Math.round(Math.random() * 650);
    return `<span style="left:${x}%;--d:${delay}ms;--s:${18 + Math.round(Math.random() * 14)}px;--r:${Math.round((Math.random() - .5) * 70)}deg">${egg.emoji[i % egg.emoji.length]}</span>`;
  }).join('');
  box.append(layer);
  win.setTimeout(() => layer.remove(), 2900);
  return layer;
}
