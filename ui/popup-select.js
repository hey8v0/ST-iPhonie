import {esc} from './common.js';
import {icon} from './icons.js';

/** Compact single-choice control; its list is portalled above scrolling sheets. */
export function popupSelect(key, value, options, label) {
  const selected = options.find(([id]) => String(id) === String(value));
  return `<button type="button" class="popup-select" data-popup-select="${esc(key)}" data-popup-value="${esc(value)}" data-popup-options="${esc(JSON.stringify(options))}" aria-label="${esc(label)}" aria-haspopup="listbox" aria-expanded="false"><span>${esc(selected?.[1] || value)}</span>${icon('down')}</button>`;
}

export function bindPopupSelect(root, choose) {
  const doc = root.ownerDocument, win = doc.defaultView, life = new win.AbortController();
  let menu = null, anchor = null, opened = null;
  function close(focus = false) {
    const old = anchor;opened?.abort();opened = null;menu?.remove();menu = null;anchor = null;
    old?.setAttribute('aria-expanded', 'false');if (focus && old?.isConnected) old.focus({preventScroll:true});
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-popup-select]');if (!button || !root.contains(button)) return;
    event.preventDefault();if (anchor === button) return close();close();anchor = button;
    const options = JSON.parse(button.dataset.popupOptions), key = button.dataset.popupSelect;
    menu = doc.createElement('div');menu.className = 'popup-select-menu';menu.setAttribute('role','listbox');menu.setAttribute('aria-label',button.getAttribute('aria-label'));
    for (const [value, label, disabled] of options) {
      const item = doc.createElement('button');item.type = 'button';item.textContent = label;item.setAttribute('role','option');item.disabled = !!disabled;
      item.setAttribute('aria-selected',String(String(value) === button.dataset.popupValue));
      item.addEventListener('click', () => { close();choose(key,value,button); });menu.append(item);
    }
    doc.body.append(menu);button.setAttribute('aria-expanded','true');opened = new win.AbortController();const signal = opened.signal;
    const rect = button.getBoundingClientRect(), width = Math.min(win.innerWidth - 24, Math.max(180,rect.width));
    const below = win.innerHeight - rect.bottom - 12, above = rect.top - 12, up = below < 180 && above > below;
    menu.style.width = width+'px';menu.style.maxHeight = Math.max(60, Math.min(320,up?above:below))+'px';
    menu.style.left = Math.max(12, Math.min(rect.left,win.innerWidth-width-12))+'px';
    menu.style.top = (up ? Math.max(12,rect.top-menu.getBoundingClientRect().height-6) : rect.bottom+6)+'px';
    const current = menu.querySelector('[aria-selected=true]') || menu.querySelector('button:not(:disabled)');current?.focus({preventScroll:true});current?.scrollIntoView?.({block:'nearest'});
    doc.addEventListener('pointerdown', e=>{if(!menu?.contains(e.target)&&!button.contains(e.target))close();},{capture:true,signal});
    doc.addEventListener('scroll',e=>{if(!menu?.contains(e.target))close();},{capture:true,signal});
    doc.addEventListener('keydown', e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}
      else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {e.preventDefault();const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(doc.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
      else if(e.key==='Tab')close();
    },{capture:true,signal});
    win.addEventListener('resize',()=>close(),{signal});
  },{signal:life.signal});
  return {close,dispose(){close();life.abort();}};
}
