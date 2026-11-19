import {pickReplacement} from './replacement-album.js';

// Return an album ID so reusing a photo never edits the original asset.
export function replacePicture(ctx,api,close,apply) {
  return {label:'替换图片',async run() {
    close?.();
    try {
      const selected=await pickReplacement(ctx,api);
      if(!selected) return false;
      const id=typeof selected==='string' ? selected : (await api.addPhoto({name:selected.name || '替换图片',blob:selected})).id;
      await apply(id);
      ctx.notify('已替换图片，原图保留在历史版本里');
    } catch(error) {ctx.notify(error.message,{error:true});}
    return false;
  }};
}

// The story viewer lives in the tavern document, outside the phone's dialog stack.
export function storyPickerContext(doc,notify) {
  return {doc,win:doc.defaultView,notify,dialog(title,html) {
    if (!doc.querySelector('link[data-stip-replacement]')) {
      const css = doc.createElement('link');
      css.rel = 'stylesheet';
      css.href = new URL('./replacement.css', import.meta.url).href;
      css.dataset.stipReplacement = '';
      doc.head.append(css);
    }
    const el = doc.createElement('dialog');
    el.className = 'stip-replace-dialog';
    el.setAttribute('aria-label', title);
    el.innerHTML = '<header><strong></strong><button type="button" aria-label="关闭">×</button></header><div></div>';
    el.querySelector('strong').textContent = title;
    const body = el.lastElementChild;
    body.innerHTML = html;
    doc.body.append(el);
    el.showModal();
    el.querySelector('header button').onclick = () => el.close();
    el.addEventListener('close', () => el.remove(), {once:true});
    return {body,close:()=>el.close(),onClose:fn=>el.addEventListener('close',fn,{once:true})};
  }};
}
