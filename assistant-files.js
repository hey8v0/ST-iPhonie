import {ASSISTANT_LIMITS, assistantAttachments} from './core/assistant.js';
import {CHAT_STORE_LIMITS} from './core/chats.js';

export const ASSISTANT_FILE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,.txt,.md,.markdown,.json,.csv,.tsv,.xml,.html,.css,.js,.ts,.py,.yaml,.yml,.log,.pdf,.docx,.doc';
const textExtension = /\.(?:txt|md|markdown|json|csv|tsv|xml|html?|css|[cm]?js|tsx?|jsx|py|ya?ml|log|ini|toml|sql|sh|bat|c|cpp|h|java|rs|go)$/i;
const limitText = (value, {max = ASSISTANT_LIMITS.text, truncate = false} = {}) => {
  if (!value.trim()) throw Error('文件里没有可提取的文字；扫描 PDF 请先做文字识别');
  if (truncate) return value.slice(0, max);
  if (value.length > max) throw Error('文件文字超过 100000 字符，请拆分后附加');
  return value;
};

/** Read just document.xml, with bounds both before and during decompression. No links/macros are executed. */
export async function docxText(buffer, Parser = globalThis.DOMParser, policy) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('Word 文件格式无效，请使用 .docx');
  let at = view.getUint32(end + 16, true);
  for (let n = 0; n < view.getUint16(end + 10, true); n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw Error('Word 压缩目录无效');
    const size = view.getUint32(at + 20, true), expanded = view.getUint32(at + 24, true), method = view.getUint16(at + 10, true);
    const nameLength = view.getUint16(at + 28, true), local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (name !== 'word/document.xml') continue;
    if (expanded > 8 * 1024 * 1024 || local + 30 > bytes.length) throw Error('Word 文档内容过大或已损坏');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + size > bytes.length) throw Error('Word 文档已损坏');
    let xml;
    if (method === 0) xml = new TextDecoder().decode(bytes.subarray(start, start + size));
    else if (method === 8) {
      if (typeof DecompressionStream !== 'function') throw Error('浏览器暂不支持解压 Word，请升级浏览器或另存为 TXT');
      const reader = new Blob([bytes.subarray(start, start + size)]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const decoder = new TextDecoder(); let total = 0; xml = '';
      try {
        for (;;) { const {done, value} = await reader.read(); if (done) break; total += value.length;
          if (total > 8 * 1024 * 1024) throw Error('Word 文档解压内容过大');
          xml += decoder.decode(value, {stream: true});
        }
        xml += decoder.decode();
      } finally { await reader.cancel().catch(() => {}); }
    } else throw Error('Word 压缩格式暂不支持');
    if (xml.length > 8 * 1024 * 1024 || /<!DOCTYPE/i.test(xml)) throw Error('Word 文档格式不受支持');
    const doc = new Parser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw Error('Word 正文格式无效');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    return limitText([...doc.getElementsByTagNameNS(ns, 'p')].map(p => [...p.getElementsByTagNameNS(ns, 't')].map(t => t.textContent).join('')).join('\n'), policy);
  }
  throw Error('Word 文件缺少正文');
}

export async function pdfText(buffer, load = () => import('/lib/pdf.min.mjs'), policy) {
  const pdfjs = await load();
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({data: new Uint8Array(buffer), isEvalSupported: false});
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 200) throw Error('PDF 超过 200 页，请拆分后附加');
    let result = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i), content = await page.getTextContent();
      result += content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('') + '\n';
      page.cleanup();
      if (policy?.truncate && result.length >= policy.max) break;
      if (result.length > ASSISTANT_LIMITS.text) throw Error('PDF 文字超过 100000 字符，请拆分后附加');
    }
    return limitText(result.trim(), policy);
  } finally { await task.destroy(); }
}

export async function readAssistantFiles(files, {chat = false, pdf, docx, office = async file => (await import('/scripts/utils.js')).extractTextFromOffice(file)} = {}) {
  const policy = chat ? {max: CHAT_STORE_LIMITS.fileText + 1, truncate: true} : undefined;
  const readPdf = pdf || (buffer => pdfText(buffer, undefined, policy)), readDocx = docx || (buffer => docxText(buffer, undefined, policy));
  const list = [...files];
  if (!list.length || list.length > ASSISTANT_LIMITS.attachments) throw Error('一次请选择 1–8 个文件');
  if (list.some(f => f.size > ASSISTANT_LIMITS.fileBytes) || list.reduce((n, f) => n + f.size, 0) > ASSISTANT_LIMITS.totalBytes) throw Error('单个附件最多 10 MB，合计最多 20 MB');
  const result = [];
  for (const file of list) {
    const item = {name: file.name, size: file.size, kind: 'text'};
    if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      item.kind = 'image'; item.data = `data:${file.type};base64,${btoa(binary)}`;
    } else if (/\.pdf$/i.test(file.name)) item.text = await readPdf(await file.arrayBuffer());
    else if (/\.docx$/i.test(file.name)) item.text = await readDocx(await file.arrayBuffer());
    else if (/\.doc$/i.test(file.name)) {
      try { item.text = await office(file); }
      catch { throw Error('旧版 .doc 需要酒馆的 Office 服务插件；也可以另存为 .docx 后附加'); }
    } else if (textExtension.test(file.name) || /^text\//.test(file.type)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
      item.text = new TextDecoder(encoding, {fatal: true}).decode(bytes);
      if (item.text.includes('\0')) throw Error('这个文件不像文本文件，请另存为 UTF-8 文本');
    } else throw Error(`暂不支持这个附件类型：${file.name}`);
    if (item.kind === 'text') item.text = limitText(item.text, policy);
    result.push(item);
  }
  return chat ? result : assistantAttachments(result);
}
