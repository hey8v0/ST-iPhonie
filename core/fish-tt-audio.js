// TT's own remote-file staging + readable resource protocol. No material-library
// import, extra server, OAuth header or TTS call is used to fetch a finished file.
export function fishTtAudio({win, allowed, notice = () => {}}) {
  let checked;
  const invoke = (command,args) => {
    const core=win.__TAURI__?.core;
    if(command.startsWith('plugin:') && typeof core?.invoke==='function') return core.invoke(command,args);
    const host=win.__TAURITAVERN__?.invoke;
    if (typeof host?.safeInvoke === 'function') return host.safeInvoke(command,args);
    if (typeof core?.invoke === 'function') return core.invoke(command,args);
    throw Error('TT 原生文件接口未加载，请更新 TT 并重新加载页面');
  };
  const abort = signal => { if(signal?.aborted) throw signal.reason || new DOMException('音频取回已取消','AbortError'); };
  async function discard(filePath) {
    try { await invoke('stage_file_discard',{filePath,file_path:filePath}); }
    catch { notice('Fish 音频暂存文件未能清理；请重启 TT 清理临时文件'); }
  }
  async function read(path,signal) {
    let rid;
    try {
      abort(signal);rid=await invoke('plugin:fs|open',{path,options:{read:true}});abort(signal);
      const stat=await invoke('plugin:fs|fstat',{rid}),size=stat?.size;
      if(!Number.isSafeInteger(size)||size<0||size>128*1024*1024)throw Error('TT 音频文件大小无效或超过128MB');
      let left=size;const chunks=[];
      while(left){
        abort(signal);const len=Math.min(left,1024*1024),raw=await invoke('plugin:fs|read',{rid,len});abort(signal);
        const b=raw instanceof ArrayBuffer?new Uint8Array(raw):ArrayBuffer.isView(raw)?new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength):null;
        if(!b||b.byteLength<8)throw Error('TT 音频字节响应格式不完整');
        const n=Number(new DataView(b.buffer,b.byteOffset+b.byteLength-8,8).getBigUint64(0));
        if(!Number.isSafeInteger(n)||n<1||n>len||n>b.byteLength-8)throw Error('TT 音频字节长度无效');
        chunks.push(b.slice(0,n));left-=n;
      }
      return chunks;
    } finally {
      if(rid!==undefined)try{await invoke('plugin:resources|close',{rid});}catch{notice('TT 音频文件读取句柄未能关闭，请重启 TT');}
    }
  }
  async function prepare(signal) {
    abort(signal);
    if(!checked)checked=(async()=>{
      let path;
      try{
        // Invalid local input proves that this command exists and passes policy;
        // the host rejects it before any HTTP request or paid tool call.
        let probe,recognized=false;
        try { probe=await invoke('stage_file_from_url',{url:''}); }
        catch(error){
          const message=typeof error==='string'?error:typeof error?.message==='string'?error.message:JSON.stringify(error);
          if(!/Invalid import URL/i.test(message))throw error;
          recognized=true;
        }
        if(probe?.file_path){await discard(probe.file_path);throw Error('TT 下载能力检查返回了非预期结果');}
        if(!recognized)throw Error('TT 未正确响应原生下载能力检查');
        const v=await invoke('stage_file_begin',{dto:{kind:'remote',preferred_extension:'bin',size:0}});path=v?.file_path;
        if(typeof path!=='string'||!path)throw Error('TT 未返回临时文件路径');
        await read(path); // Empty, private fixture verifies native read permissions for free.
      }catch(e){throw Error('TT 原生音频取回检查失败；本次没有请求配音生成：'+(e.message||String(e)));}
      finally{if(path)await discard(path);}
    })().catch(e=>{checked=null;throw e;});
    await checked;abort(signal);
  }
  async function download(url,signal) {
    if(!allowed(url))throw Error('TT 音频取回只允许 Fish 官方任务 CDN');
    await prepare(signal);let path;
    try{
      // Await even after cancellation so a late temporary file is always discarded.
      const file=await invoke('stage_file_from_url',{url});path=file?.file_path;
      if(typeof path!=='string'||!path)throw Error('TT 没有返回已下载音频的临时路径');
      abort(signal);const chunks=await read(path,signal);abort(signal);
      return new Response(new Blob(chunks,{type:file.mime_type||'application/octet-stream'}));
    }catch(e){if(signal?.aborted)throw e;throw Error('Fish 已生成声音，但 TT 原生音频取回失败；链接已保留，不要重新生成。'+(e.message||String(e)));}
    finally{if(path)await discard(path);}
  }
  return {prepare,download};
}
