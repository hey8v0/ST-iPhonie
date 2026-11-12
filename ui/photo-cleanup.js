import {btn,size,esc} from './common.js';
import {icon} from './icons.js';

export async function photoCleanup(ctx,done=()=>{}) {
  const plan=await ctx.api.unkeptPhotos();
  if(!plan.count){ctx.notify('没有可清理的照片，收藏和相簿中的图片都已保留');return;}
  const d=ctx.dialog('清理未收藏的散图',`<p class="hint" data-keep-hint>只删除未收藏、也未加入任何自建相簿的照片。收藏、相簿中的图，以及正在用作壁纸、图标、头像和聊天背景的图都会保留。</p><div class="group pad"><p><strong>${plan.count} 张 · 约 ${size(plan.bytes)}</strong></p><small class="hint">另有 ${plan.kept} 张受保护。自动按来源显示的分类不属于自建相簿；自己导入的散图也会计入。</small></div><details><summary>查看将删除的照片</summary><p class="help-copy">${plan.photos.slice(0,30).map(p=>esc(p.name)).join('<br>')}${plan.count>30?`<br>…共 ${plan.count} 张`:''}</p></details><div class="actions">${btn('cleanup-go',icon('trash')+`清理 ${plan.count} 张`,'danger')}</div>`);
  d.body.addEventListener('click',async e=>{
    const button=e.target.closest('[data-action=cleanup-go]');if(!button||button.disabled)return;
    button.disabled=true;
    try{
      const approved=await new Promise(resolve=>{
        const ask=ctx.dialog(`永久删除这 ${plan.count} 张散图？`,`<p class="help-copy" data-keep-hint>无法撤销。收藏和相簿内的图会再次核对并保留；聊天、朋友圈等处引用的散图也会被移除。</p><div class="actions">${btn('cancel','取消','secondary')}${btn('confirm','确认删除','danger')}</div>`,{over:true});
        ask.onClose(value=>resolve(value===true));
        ask.body.addEventListener('click',event=>{const action=event.target.closest('button')?.dataset.action;if(action==='confirm')ask.close(true);if(action==='cancel')ask.close(false);});
      });
      if(!approved)return;
      button.textContent='正在清理…';
      const result=await ctx.api.deleteUnkeptPhotos(plan.photos.map(p=>p.id));d.close();
      ctx.notify(`已清理 ${result.count} 张，腾出约 ${size(result.bytes)}${result.kept?`；${result.kept} 张因已收藏、已归入相簿或已移除而跳过`:''}`);
      await done();
    }catch(error){ctx.notify(error.message,{error:true});}
    finally{if(button.isConnected){button.disabled=false;button.innerHTML=icon('trash')+`清理 ${plan.count} 张`;}}
  });
}
