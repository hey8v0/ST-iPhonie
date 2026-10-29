// What the 动态 dots need (the chat app's and the home screen's), apart from the 动态 panel itself, so the home screen
// does not load the whole panel to count them.
const SEEN_KEY = 'st-iphonie-moments-seen';
/** When the user last looked at 动态 (per browser; only for the dots). */
export function momentsSeen(win) { try { return Number(win.localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } }
export function markSeen(win) { try { win.localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* the dot is only a convenience */ } }
/** Posts and comments by others since the user last looked. */
export const momentsNew = (posts, seen) => posts.reduce((n, p) => n + (p.author !== 'me' && p.at > seen ? 1 : 0) + p.comments.filter(c => c.from !== 'me' && c.at > seen).length, 0);
