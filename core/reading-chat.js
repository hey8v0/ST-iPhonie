import {promptText} from './prompt-rules.js';
import {currentDm} from './chats.js';

// Only the visible excerpt crosses into chat. Never pass the book reader, archive, or later chapters.
export function readingContext(book, {chapter = 0, page = 1, text = '', annotation = false} = {}, prompts = {}) {
  return promptText(prompts, 'reading-together', 'rule', {'书名': String(book.title).slice(0, 100), '章节': String(book.chapters[chapter]?.title || '').slice(0, 100), '页码': page, '当前页': String(text).slice(0, 2200), '批注': annotation ? '这次只说一句简短的吐槽或感想，不超过四十字。' : '自然地回应对方，像坐在身边一起看书。'});
}
export async function readingSend(api, book, visible, text, {blob = null, annotation = false, quote = ''} = {}) {
  if (!book.companion) throw Error('先选一个一起看书的人');
  if (annotation) return api.readingNote({companion: book.companion, reading: readingContext(book, {...visible, annotation: true}, api.readState().promptRules), blob});
  const thread = currentDm(await api.listThreads(), book.companion) || await api.createThread({type: 'dm', members: [book.companion]});
  const context = readingContext(book, {...visible, annotation}, api.readState().promptRules);
  const messages = [{from: 'me', kind: 'text', text: String(text || '').trim() || '这一页你有什么感想？', ...(quote ? {quote: {from: `《${book.title}》`, text: String(quote).slice(0, 200)}} : {})}];
  const pageKey = JSON.stringify([book.id || book.title, visible.chapter, visible.para || 0]);
  const previous = blob ? await api.getThread(thread.id) : null;
  if (blob && !previous?.messages.some(m => m.readingPage === pageKey)) {
    const photo = await api.addPhoto({blob, name: `《${book.title}》第 ${visible.page} 页`});
    messages.unshift({from: 'me', kind: 'photo', readingPage: pageKey, photoId: typeof photo === 'string' ? photo : photo.id});
  }
  await api.appendChat(thread.id, messages, {read: true});
  await api.chatReply(thread.id, {reading: context});
  return api.getThread(thread.id);
}
