// Files sent in the phone chat: a picture goes to the album and is sent as a photo (a model that sees gets the picture
// itself); a document is read here (txt, md, pdf, docx…, as in the 助手 App) and sent by its words, which the contact
// reads. The document itself is not kept.
import {esc} from './common.js';
import {icon} from './icons.js';
import {ASSISTANT_FILE_ACCEPT} from '../assistant-files.js';
import {CHAT_STORE_LIMITS} from '../core/chats.js';

const PICTURE = /^image\/(png|jpeg|webp|gif|avif)$/;
const size = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

/** The 文件 tool: a label around the file box, so a tap opens the phone's file picker (Safari needs a real tap on it). */
export const fileTool = () => `<label class="tool" data-tool-file><span class="tool-ico" data-tool="file">${icon('file')}</span><span>文件</span><input type="file" data-chat-files accept="${ASSISTANT_FILE_ACCEPT},image/avif" multiple hidden></label>`;

export const fileBody = (m, mid) => `<button class="chat-file" data-action="file" ${mid} aria-label="打开文件 ${esc(m.name)}"><span class="cf-ico">${icon('file')}</span><span class="cf-text"><strong>${esc(m.name)}</strong><small>${m.size ? size(m.size) + ' · ' : ''}${m.fileText.length} 字</small></span></button>`;

export const showFile = (ctx, m) => ctx.dialog(m.name, `<pre class="chat-file-text">${esc(m.fileText)}</pre>`);

/**
 * The picked files as messages, in the order picked. Pictures are added to the album first. A document longer than a
 * chat file keeps its beginning, and says so. Throws when a file cannot be read (nothing is sent then).
 */
export async function filesToMessages(api, files) {
  const list = [...files], out = [], notes = [];
  const docs = list.filter(f => !PICTURE.test(f.type));
  const read = docs.length ? await api.assistantReadFiles(docs) : [];
  for (const file of list) {
    if (PICTURE.test(file.type)) { const photo = await api.addPhoto({name: file.name, blob: file}); out.push({from: 'me', kind: 'photo', photoId: photo.id, text: ''}); continue; }
    const item = read[docs.indexOf(file)];
    if (item?.kind === 'image') { out.push({from: 'me', kind: 'photo', photoId: (await api.addPhoto({name: file.name, blob: file})).id, text: ''}); continue; }
    const text = String(item?.text || '');
    if (text.length > CHAT_STORE_LIMITS.fileText) notes.push(file.name);
    out.push({from: 'me', kind: 'file', name: file.name, size: file.size, fileText: text.slice(0, CHAT_STORE_LIMITS.fileText)});
  }
  return {messages: out, cut: notes};
}
