// A chat message as one line (the chat list, the 今天 page), apart from the chat app so the home screen does not load it.
import {callSummary} from '../core/call-summary.js';

export const BLESSING = '恭喜发财，大吉大利';
export const you = who => who === 'me' ? '你' : who;
// 拍一拍后缀 (0.9.36): the patted one's own words come after.
export const patText = (m, name = you) => `${name(m.from)} 拍了拍 ${name(m.target)}${m.suffix || ''}`;
export const noticeText = (m, name = you) => name(m.from) + String(m.text).replaceAll('{对方}', () => name(m.target));
/** How long a voice message lasts, from its words (about five a second). */
export const seconds = m => m.recording?.duration || m.voiceDuration || Math.max(1, Math.min(60, Math.round((m.text || '').length / 5)));
export function preview(m, name = you) {
  if (!m) return '还没有消息';
  switch (m.kind) {
    case 'voice': return `[语音] ${seconds(m)}″`;
    case 'photo': return '[图片]';
    case 'sticker': return '[表情包]';
    case 'redpacket': return '[红包] ' + (m.text || BLESSING);
    case 'transfer': return '[转账] ¥' + m.amount;
    case 'gift': return '[礼物] ' + (m.gift?.name || '');
    case 'location': return '[位置] ' + m.text;
    case 'song': return '[音乐] ' + (m.song?.title || '');
    case 'file': return '[文件] ' + m.name;
    case 'forward': return '[聊天记录] ' + (m.title || '');
    case 'letter': return '[信件]';
    case 'post': return '[帖子] ' + (m.post?.title || m.text || '');
    case 'outfit': return '[穿搭] ' + (m.outfit?.name || '');
    case 'book': return '[绘本] ' + (m.book?.title || '');
    case 'dice': return '[骰子]';
    case 'call': return `[${callSummary(m)}]`;
    case 'pat': return patText(m, name);
    case 'notice': return noticeText(m, name);
    case 'recall': return name(m.from) + ' 撤回了一条消息';
    default: return m.text;
  }
}
