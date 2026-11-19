import {pickPicture} from './draw-images.js';

// Return an album ID so reusing a photo never edits the original asset.
export function replacePicture(ctx,api,close,apply) {
  return {label:'替换图片',async run() {
    close?.();
    try {
      const selected=await pickPicture(ctx,api,'替换图片',{returnId:true});
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
    const el=doc.createElement('dialog'), heading=doc.createElement('h3'), body=doc.createElement('div'), cancel=doc.createElement('button');
    el.style.cssText='max-width:min(92vw,440px);max-height:80vh;overflow:auto;padding:16px';
    heading.textContent=title;cancel.textContent='取消';body.innerHTML=html;
    const grid=body.querySelector('.photo-grid');
    if(grid){grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:4px';for(const img of grid.querySelectorAll('img'))img.style.cssText='width:100%;aspect-ratio:1;object-fit:cover';}
    el.append(heading,body,cancel);doc.body.append(el);el.showModal();
    cancel.onclick=()=>el.close();el.addEventListener('close',()=>el.remove(),{once:true});
    return {body,close:()=>el.close(),onClose:fn=>el.addEventListener('close',fn,{once:true})};
  }};
}
