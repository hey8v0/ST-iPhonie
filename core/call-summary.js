// A call in the chat: its length and the line it leaves (the chat list, the 今天 page, the call log). Kept apart from
// core/call.js so the home screen can show the chat's last line without the call code.
/** Seconds as 3:07 or 1:02:09. */
export function callClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
/** Short words for how a call ended, as the chat shows it. */
export function callSummary(m) {
  const mine = m.dir === 'out';
  if (m.state === 'answered') return `语音通话 ${callClock(m.duration)}`;
  if (m.state === 'missed') return mine ? '对方无人接听' : m.voicemail?.length ? '未接来电 · 有语音留言' : '未接来电';
  if (m.state === 'declined') return mine ? '对方已拒绝' : '已拒绝';
  return mine ? '已取消' : '对方已取消';
}
