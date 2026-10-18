// Mouse paging is a gesture on the desktop carousel, never a document-wide
// selection policy. Inputs and editable widgets retain their native behavior.
export function installHomeSwipe(pages,{signal}={}){
 const doc=pages.ownerDocument,win=doc.defaultView;let drag=null,draggedUntil=0;
 const editable=target=>target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),.today-page[data-editing] .tw');
 function clean(){delete pages.dataset.swiping;pages.style.scrollSnapType='';pages.style.scrollBehavior='';}
 function finish(event,cancel=false){
  if(!drag||(event?.pointerId!==undefined&&event.pointerId!==drag.id))return;
  const d=drag;drag=null;clean();
  if(d.moved){const w=pages.clientWidth||1,dx=(event?.clientX??d.x)-d.x;let page=Math.round(d.left/w);if(!cancel&&Math.abs(dx)>w*.15)page+=dx<0?1:-1;page=Math.max(0,Math.min(pages.children.length-1,page));pages.scrollTo({left:cancel?d.left:page*w,behavior:cancel?'auto':'smooth'});draggedUntil=Date.now()+350;}
  try{if(pages.hasPointerCapture?.(d.id))pages.releasePointerCapture(d.id);}catch{}
 }
 pages.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||editable(e.target)||pages.children.length<2)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:pages.scrollLeft,moved:false};},{signal});
 pages.addEventListener('selectstart',e=>{if(drag&&!editable(e.target))e.preventDefault();},{signal,capture:true});
 pages.addEventListener('dragstart',e=>{if(drag)e.preventDefault();},{signal,capture:true});
 win.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved){if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;if(Math.abs(dy)>Math.abs(dx)){finish(e,true);return;}drag.moved=true;pages.dataset.swiping='';pages.style.scrollSnapType='none';pages.style.scrollBehavior='auto';const selection=doc.getSelection();if(selection?.anchorNode&&pages.contains(selection.anchorNode)&&pages.contains(selection.focusNode))selection.removeAllRanges();try{pages.setPointerCapture(e.pointerId);}catch{}}
  e.preventDefault();pages.scrollLeft=drag.left-dx;
 },{signal,passive:false});
 win.addEventListener('pointerup',e=>finish(e),{signal});win.addEventListener('pointercancel',e=>finish(e,true),{signal});pages.addEventListener('lostpointercapture',e=>finish(e,true),{signal});win.addEventListener('blur',()=>finish(null,true),{signal});
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)finish(null,true);},{signal});
 pages.addEventListener('click',e=>{if(Date.now()<draggedUntil){e.stopPropagation();e.preventDefault();}},{signal,capture:true});
 signal?.addEventListener('abort',()=>{drag=null;clean();},{once:true});
}
