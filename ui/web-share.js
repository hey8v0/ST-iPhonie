import {btn, esc, field} from './common.js';
import {normalizeWebPage, publicLink} from '../core/web-share.js';

export async function shareWebPage(ctx, {url='', command, onShared}={}) {
  const {api,doc,win}=ctx;
  const threads=(await api.listThreads()).filter(t=>!t.watch && !t.blocked && !t.friend);
  if(!threads.length){ctx.notify('先在聊天里打开一个会话');return;}
  const pick='<select name="thread" aria-label="分享对象">'+threads.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name || t.members.join('、'))+'</option>').join('')+'</select>';
  const shareURL=normalizeWebPage({url})?.url || '';
  const inputs=[['title','标题',140],['summary','简介或摘要',400],['text','要分享的正文',1800],['selection','选中文字',600],['captions','实际获取的视频字幕',1000],['note','附言',300]];
  const d=ctx.dialog('分享网页', '<form class="web-share-form">'+field('分享对象',pick)
    +field('网页网址','<input name="url" type="url" required maxlength="2000" value="'+esc(shareURL)+'">')
    +btn('read-public','读取公开网页','secondary')
    +inputs.map(([key,label,max])=>field(label,'<textarea name="'+key+'" maxlength="'+max+'"></textarea>')).join('')
    +(command?btn('selected','读取 Firefox 选中文字','secondary')+btn('screenshot','添加当前画面','secondary'):'')
    +field('封面（可选）','<input name="cover" type="file" accept="image/png,image/jpeg,image/webp">')
    +'<img data-shot hidden alt="待分享的 Firefox 画面">'+btn('remove-shot','移除截图','secondary','hidden')
    +'<p>填写的内容和选中的图片会发给这个会话，请先检查是否含有私人信息。</p>'
    +'<button class="primary" type="submit">发到聊天</button></form>');
  const form=d.body.querySelector('form'), preview=form.querySelector('[data-shot]');
  let image='',sending=false;
  d.body.addEventListener('click',async e=>{
    switch(e.target.closest('button')?.dataset.action){
      case 'read-public': {
        const page=normalizeWebPage({url:form.elements.url.value});
        if(!page){ctx.notify('先填写要读取的公开 HTTPS 网址');break;}
        const button=e.target.closest('button');
        button.disabled=true;
        try{
          const read=await api.readWebPage(page.url);
          for(const key of ['title','summary','text'])if(!form.elements[key].value && typeof read[key]==='string')
            form.elements[key].value=read[key].slice(0,form.elements[key].maxLength);
          if(!read.title && !read.summary && !read.text)ctx.notify('网站没有提供可读取的公开内容');
        }catch(error){ctx.notify(error.message,{error:true});}
        finally{button.disabled=false;}
        break;
      }
      case 'selected': {
        const data=await command('selection');
        if(data.text)form.elements.selection.value=data.text.slice(0,600);
        else ctx.notify('没有读取到选中文字，可手动粘贴');
        break;
      }
      case 'screenshot': {
        const {image:made}=await command('screenshot');
        if(!/^data:image\/jpeg;base64,[a-z\d+/=]+$/i.test(made || '') || made.length>1900000){ctx.notify('画面读取失败，请稍后重试');break;}
        image=made;preview.src=image;preview.hidden=false;
        form.querySelector('[data-action=remove-shot]').hidden=false;
        break;
      }
      case 'remove-shot':image='';preview.removeAttribute('src');preview.hidden=true;e.target.closest('button').hidden=true;break;
    }
  });
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(sending)return;
    const page=normalizeWebPage(Object.fromEntries(new win.FormData(form)));
    if(!page){ctx.notify('请输入有效的网页网址',{error:true});return;}
    if(page.url!==publicLink(form.elements.url.value)){
      form.elements.url.value=page.url;
      ctx.notify('已移除网址里的凭据参数，请检查后发送。');
      return;
    }
    const cover=form.elements.cover.files[0], target=form.elements.thread.value;
    if(cover && (!['image/png','image/jpeg','image/webp'].includes(cover.type) || cover.size>4000000)){ctx.notify('请选择 4 MB 以内的 PNG、JPG 或 WebP 图片');return;}
    const button=form.querySelector('[type=submit]');
    sending=true;button.disabled=true;
    const added=[];
    try{
      if(cover){page.coverId=(await api.addPhoto({name:'分享网页封面',blob:cover})).id;added.push(page.coverId);}
      if(image){page.screenshotId=(await api.addPhoto({name:'分享网页截图',blob:await (await win.fetch(image)).blob()})).id;added.push(page.screenshotId);}
      await api.appendChat(target,[{from:'me',kind:'web',page}],{read:true});
      onShared?.(page);
      d.close();ctx.openThread(target);
    }catch(error){if(added.length)await api.deletePhotos?.(added).catch(()=>{});ctx.notify(error.message,{error:true});}
    finally{sending=false;button.disabled=false;}
  });
}


export async function webSearchSettings(ctx) {
  const {api}=ctx;
  const ready=await api.webProvider();
  const saved=api.keyStatus('brave');
  const enabled=api.getState().chat.webSearch===true;
  const d=ctx.dialog('Char 真实搜索',
    '<p>'+ (ready?'酒馆网页服务已就绪':'酒馆网页服务尚未启用') +' · '+(saved?'已保存密钥':'未设置密钥')+'</p>'
    +'<p>开启后，角色可为当前私聊搜索公开资料。搜索关键词会发给 Brave。网页分享仍需你确认。</p>'
    +'<label class="list-row"><input type="checkbox" name="enabled" '+(enabled?'checked':'')+'>允许 Char 真实搜索</label>'
    +field('Brave Search API 密钥','<input type="password" autocomplete="off" name="key" maxlength="256" placeholder="留空保留已保存的密钥">')
    +btn('save','保存','primary')+btn('clear','清除密钥','secondary'));
  d.body.addEventListener('click',e=>{
    const action=e.target.closest('button')?.dataset.action;
    try{
      if(action==='clear'){api.clearKey('brave');api.saveChatOptions({webSearch:false});d.close();return;}
      if(action!=='save')return;
      const key=d.body.querySelector('[name=key]').value.trim();
      if(key)api.setKey('brave',key);
      api.saveChatOptions({webSearch:d.body.querySelector('[name=enabled]').checked});
      d.close();
    }catch(error){ctx.notify(error.message,{error:true});}
  });
}
