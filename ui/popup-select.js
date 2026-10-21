import {esc} from './common.js';
import {icon} from './icons.js';

/** Compact single-choice control; its list is portalled above scrolling sheets. */
export function popupSelect(key, value, options, label) {
  const selected = options.find(([id]) => String(id) === String(value));
  return `<button type="button" class="popup-select" data-popup-select="${esc(key)}" data-popup-value="${esc(value)}" data-popup-options="${esc(JSON.stringify(options))}" aria-label="${esc(label)}" aria-haspopup="listbox" aria-expanded="false"><span>${esc(selected?.[1] || value)}</span>${icon('down')}</button>`;
}

/** One open list at a time, under (or above) its anchor; picking, tapping elsewhere, scrolling or Escape closes it. */
function menuFor(doc) {
  const win = doc.defaultView;
  let menu = null, anchor = null, opened = null, closed = null;
  function close(focus = false) {
    const old = anchor, done = closed;opened?.abort();opened = null;menu?.remove();menu = null;anchor = null;closed = null;
    done?.();if (focus && old?.isConnected) old.focus({preventScroll:true});
  }
  function open(at, {options, value, label, pick, onClose}) {
    close();anchor = at;closed = onClose;
    menu = doc.createElement('div');menu.className = 'popup-select-menu';menu.setAttribute('role','listbox');menu.setAttribute('aria-label',label || '');
    for (const [v, text, disabled] of options) {
      const item = doc.createElement('button');item.type = 'button';item.textContent = text;item.setAttribute('role','option');item.disabled = !!disabled;
      item.setAttribute('aria-selected',String(String(v) === String(value)));
      item.addEventListener('click', () => { close();pick(v); });menu.append(item);
    }
    doc.body.append(menu);opened = new win.AbortController();const signal = opened.signal;
    const rect = at.getBoundingClientRect(), width = Math.min(win.innerWidth - 24, Math.max(180,rect.width));
    const below = win.innerHeight - rect.bottom - 12, above = rect.top - 12, up = below < 180 && above > below;
    menu.style.width = width+'px';menu.style.maxHeight = Math.max(60, Math.min(320,up?above:below))+'px';
    menu.style.left = Math.max(12, Math.min(rect.left,win.innerWidth-width-12))+'px';
    menu.style.top = (up ? Math.max(12,rect.top-menu.getBoundingClientRect().height-6) : rect.bottom+6)+'px';
    const current = menu.querySelector('[aria-selected=true]') || menu.querySelector('button:not(:disabled)');current?.focus({preventScroll:true});current?.scrollIntoView?.({block:'nearest'});
    doc.addEventListener('pointerdown', e=>{if(!menu?.contains(e.target)&&!at.contains(e.target))close();},{capture:true,signal});
    doc.addEventListener('scroll',e=>{if(!menu?.contains(e.target))close();},{capture:true,signal});
    doc.addEventListener('keydown', e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}
      else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {e.preventDefault();const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(doc.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
      else if(e.key==='Tab')close();
    },{capture:true,signal});
    win.addEventListener('resize',()=>close(),{signal});
  }
  return {open, close, anchor: () => anchor};
}

export function bindPopupSelect(root, choose) {
  const doc = root.ownerDocument, win = doc.defaultView, life = new win.AbortController(), menu = menuFor(doc);
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-popup-select]');if (!button || !root.contains(button)) return;
    event.preventDefault();if (menu.anchor() === button) return menu.close();
    const key = button.dataset.popupSelect;button.setAttribute('aria-expanded','true');
    menu.open(button, {options: JSON.parse(button.dataset.popupOptions), value: button.dataset.popupValue, label: button.getAttribute('aria-label'),
      pick: value => choose(key,value,button), onClose: () => button.setAttribute('aria-expanded','false')});
  },{signal:life.signal});
  return {close: focus => menu.close(focus),dispose(){menu.close();life.abort();}};
}

/**
 * The phone's dropdowns open this list instead of the browser's own picker: some phone browsers show their own sheet,
 * tick the choice and never tell the page (the box keeps the old value). The box itself takes no taps (phone.css); a
 * tap lands on its frame, the pick is written into the box and announced as if the box had been changed by hand, so
 * every screen keeps listening to its boxes as before. Keyboard use (Tab, arrows) still goes to the box itself.
 */
export function bindNativeSelects(doc) {
  const menu = menuFor(doc);
  doc.addEventListener('click', event => {
    const frame = event.target.closest?.('.select');const box = frame?.querySelector(':scope > select');
    if (!box || box.disabled || box.multiple) return;
    event.preventDefault();if (menu.anchor() === box) return menu.close();
    const options = [...box.options].map(o => [o.value, o.textContent, o.disabled || o.parentElement?.disabled]);
    menu.open(box, {options, value: box.value, label: box.getAttribute('aria-label'), pick: value => {
      if (box.value === String(value)) return;
      box.value = String(value);
      box.dispatchEvent(new doc.defaultView.Event('input', {bubbles: true}));
      box.dispatchEvent(new doc.defaultView.Event('change', {bubbles: true}));
    }});
  });
  return menu;
}
