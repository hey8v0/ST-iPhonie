// Book anchors count UTF-16 text offsets in the imported paragraphs, including inline formatting.
export function words(block) {
  const walker = block.ownerDocument.createTreeWalker(block, 4), nodes = [];
  while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('[data-reading-extra]')) nodes.push(walker.currentNode);
  return nodes;
}
export function point(block, offset) {
  for (const node of words(block)) {
    if (offset <= node.length) return [node, offset];
    offset -= node.length;
  }
}
export function offsetAt(block, node, offset) {
  const prefix = block.ownerDocument.createRange();
  prefix.selectNodeContents(block);
  prefix.setEnd(node, offset);
  const copy = prefix.cloneContents();
  copy.querySelectorAll('[data-reading-extra]').forEach(el => el.remove());
  return copy.textContent.length;
}
export function selectedRange(selection, blocks) {
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const para = blocks.findIndex(el => el.contains(range.startContainer));
  const endPara = blocks.findIndex(el => el.contains(range.endContainer));
  if (para < 0 || endPara < para) return;
  const element = node => node.nodeType === 1 ? node : node.parentElement;
  if ([range.startContainer,range.endContainer].some(node => element(node)?.closest('[data-reading-extra]'))) return;
  const copy = range.cloneContents();
  const extras = copy.querySelectorAll('[data-reading-extra]');
  extras.forEach(el => el.remove());
  const text = extras.length ? copy.textContent : selection.toString();
  if (!text.trim()) return;
  return {para, endPara, start:offsetAt(blocks[para],range.startContainer,range.startOffset),
    end:offsetAt(blocks[endPara],range.endContainer,range.endOffset), text};
}
export function underline(block, start, end) {
  let pos = 0;
  for (const node of words(block)) {
    const left = Math.max(0, start-pos), right = Math.min(node.length, end-pos);
    pos += node.length;
    if (left >= right) continue;
    const range = block.ownerDocument.createRange();
    range.setStart(node,left); range.setEnd(node,right);
    const mark = block.ownerDocument.createElement('span');
    mark.className = 'reading-mark'; mark.dataset.underline = '';
    range.surroundContents(mark);
  }
}
