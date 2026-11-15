import {Marked} from './vendor/marked.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Only parser-generated formatting enters the phone DOM. Model HTML remains escaped;
// links/images don't create navigation, network requests or event handlers in the parent.
const markdown = new Marked({gfm: true, breaks: true, async: false, tokenizer: {
  // In chat, a standalone --- is a divider, including directly below a paragraph.
  lheading() { return undefined; },
}, renderer: {
  br() { return '<br>\n'; },
  html({text}) { return escape(text); },
  link({tokens}) { return this.parser.parseInline(tokens); },
  image({text}) { return escape(text); },
}});
// Chat prose commonly places a Chinese closing quote next to the next Han character.
// CommonMark's punctuation boundary would otherwise leave **“喜欢”**而… literal.
markdown.use({extensions: [{name: 'cjkStrong', level: 'inline', start: src => src.indexOf('**'),
  tokenizer(src) {
    const match = /^\*\*([^*\n]+)\*\*/.exec(src);
    if (!match || match[1].trim() !== match[1] || !/\p{P}$/u.test(match[1]) || !/^\p{Script=Han}/u.test(src.slice(match[0].length))) return;
    return {type: 'cjkStrong', raw: match[0], tokens: this.lexer.inlineTokens(match[1])};
  },
  renderer(token) { return `<strong>${this.parser.parseInline(token.tokens)}</strong>`; },
}]});
export const assistantMarkdown = text => markdown.parse(String(text || ''));

/** Format prose inside a regex-generated HTML fragment without touching executable/code content. */
export function assistantHTMLMarkdown(html, doc) {
  const template = doc.createElement('template'); template.innerHTML = String(html);
  const untouched = new Set(['SCRIPT','STYLE','PRE','CODE','TEXTAREA','SVG','MATH']);
  const inline = new Set(['P','SPAN','A','BUTTON','LABEL','LI','TD','TH','SUMMARY','STRONG','EM','B','I','S','H1','H2','H3','H4','H5','H6']);
  function visit(parent) {
    if (untouched.has(parent.nodeName.toUpperCase()) || parent.namespaceURI && parent.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === 1) visit(child);
      else if (child.nodeType === 3 && child.textContent.trim()) {
        const content = child.textContent;
        const result = inline.has(parent.nodeName) ? markdown.parseInline(content) : assistantMarkdown(content);
        const fragment = doc.createElement('template'); fragment.innerHTML = result;
        child.replaceWith(fragment.content);
      }
    }
  }
  visit(template.content);
  return template.innerHTML;
}
