import {storyText} from './story-scope.js';

/** Exact included prose, without excluded panels. No quote/word normalization that could hide real edits. */
export const replyBody = (raw, scope) => storyText(raw, scope).trim();
export function replyRevision(context, id, scope, visit = () => null) {
  const ctx = context(), message = ctx?.chat?.[id], chat = ctx?.getCurrentChatId?.() ?? ctx?.chatId, epoch = visit();
  if (!message) return null;
  const raw = message.mes, body = replyBody(raw, scope), swipe = message.swipe_id, date = message.send_date, name = message.name;
  const current = () => {
    const now = context(), current = now?.chat?.[id];
    if (!current || current.is_user || current.is_system || (now?.getCurrentChatId?.() ?? now?.chatId) !== chat || visit() !== epoch || current.swipe_id !== swipe) return null;
    // Formatting tools may replace a message with a copy. A stable persisted identity is required for that case.
    if (current !== message && !(date && current.send_date === date && current.name === name)) return null;
    return current;
  };
  const target = () => { const now = current(); return now && replyBody(now.mes, scope) === body ? now : null; };
  return {raw, body, swipe, message, target, current};
}
/** Called after the render event. Bounded quiet checks avoid capturing a half-rewritten body. */
export async function settledReply(context, id, scope, {wait = ms => new Promise(r => setTimeout(r, ms)), delay = 80, checks = 6} = {}) {
  const binding = replyRevision(context, id, scope);
  if (!binding) return false;
  let previous = binding.body;
  for (let i = 0; i < checks; i++) {
    await wait(delay);
    const current = binding.current();
    if (!current) return false;
    const next = replyBody(current.mes, scope);
    if (next === previous) return true;
    previous = next;
  }
  return false;
}
