import {assistantMarkdown, assistantHTMLMarkdown} from './assistant-markdown.js';

// HTML is only returned to the sandbox renderer, never inserted into the phone.
// Prose before/after fenced HTML stays visible rather than being discarded.
export function theaterMarkup(text, doc) {
  const source = String(text || '');
  if (!/```html?/i.test(source) && /<(?:!doctype\s+html|html|style|div|section|article|main|table|button|details|summary|p|ul|ol|li|h[1-6]|svg|span|b|i|em|strong|blockquote|figure|header|footer|nav)\b/i.test(source)) return assistantHTMLMarkdown(source, doc);
  const chunks = []; let at = 0;
  for (const m of source.matchAll(/```html?\s*\n([\s\S]*?)```/gi)) {
    chunks.push(assistantMarkdown(source.slice(at,m.index)),m[1]); at=m.index+m[0].length;
  }
  chunks.push(assistantMarkdown(source.slice(at)));
  return chunks.join('\n');
}
