// Composer backspace: delete the selected text or one complete grapheme before the caret.
export function eraseBefore(value, start, end = start, Segmenter = globalThis.Intl?.Segmenter) {
  const text = String(value ?? ''), clamp = n => Number.isFinite(n) ? Math.max(0, Math.min(text.length, n)) : text.length;
  let a = clamp(start), b = clamp(end);
  if (b < a) [a, b] = [b, a];
  if (a === b && a) {
    let ranges;
    if (Segmenter) ranges = [...new Segmenter(undefined, {granularity: 'grapheme'}).segment(text)].map(s => [s.index, s.index + s.segment.length]);
    else {
      ranges = []; let at = 0, previous = '', regional = 0;
      for (const char of text) {
        const ri = /[\u{1f1e6}-\u{1f1ff}]/u.test(char);
        const continuation = /\p{Mark}|[\ufe00-\ufe0f\u{e0100}-\u{e01ef}\u{1f3fb}-\u{1f3ff}\u{e0020}-\u{e007f}]/u.test(char);
        if (ranges.length && (continuation || char === '\u200d' || previous === '\u200d' || ri && regional % 2 === 1 || char === '\n' && previous === '\r')) ranges.at(-1)[1] = at + char.length;
        else ranges.push([at, at + char.length]);
        regional = ri ? regional + 1 : 0; previous = char; at += char.length;
      }
    }
    const range = ranges.find(([from, to]) => from < a && to >= a);
    if (range) [a, b] = range;
  }
  return {text: text.slice(0, a) + text.slice(b), caret: a};
}
