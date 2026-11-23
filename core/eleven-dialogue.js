// Eleven v4 Turbo uses the Text-to-Dialogue WebSocket, not /text-to-speech.
// A fresh one-voice session per line avoids mixing different speakers and
// closes promptly, so idle sessions never consume the account's concurrency.
const LIMIT=64*1024*1024;
export function turboUrl(request) {
  const root=new URL(request.url);
  if(!['https:','http:'].includes(root.protocol))throw Error('ElevenLabs 接口地址不安全');
  const url=new URL(root.origin);
  url.protocol=root.protocol==='https:'?'wss:':'ws:';
  url.pathname='/v1/text-to-dialogue/stream-input';
  url.searchParams.set('model_id','eleven_v4_turbo');
  url.searchParams.set('output_format',String(request.format||'mp3_44100_128'));
  const language=request.body?.language_code;
  if(typeof language==='string' && /^[a-z]{2,3}$/.test(language))url.searchParams.set('language_code',language);
  return url.href;
}
export function turboFrames(request,key) {
  const voice=String(request.voice||'').trim(),text=String(request.body?.text||'').trim();
  if(!voice || !text)throw Error('v4 Turbo 需要音色 ID 和台词');
  if(!key)throw Error('请先填写 ElevenLabs API Key');
  // Web browser WebSocket cannot set custom handshake headers.
  // Send the key in the first frame, not in the URL.
  const settings=request.body?.voice_settings;
  const first={voices:[voice],xi_api_key:key};
  if(settings && typeof settings==='object'){
    const filtered={};
    for(const k of ['stability','similarity_boost'])
      if(typeof settings[k]==='number')filtered[k]=settings[k];
    if(Object.keys(filtered).length)first.voice_settings=filtered;
  }
  return [first,{inputs:[{text,voice_id:voice,new_turn:true}]},{close_socket:true}];
}
export async function elevenTurboSpeech(request,key,signal,{WebSocketImpl=globalThis.WebSocket,timeout=120000}={}) {
 if(typeof WebSocketImpl!=='function')throw Error('当前浏览器不支持 WebSocket，无法使用 Eleven v4 Turbo');
 if(signal?.aborted)throw new DOMException('已停止','AbortError');
 const frames=turboFrames(request,key);
 const address=turboUrl(request);
 return new Promise((resolve,reject)=>{
  let ws,finished=false,size=0;const chunks=[];
  const stop=()=>finish(new DOMException('已停止','AbortError'));
  const timer=setTimeout(()=>finish(Error('Eleven v4 Turbo 语音生成超时')),timeout);
  function finish(error,blob){
   if(finished)return;finished=true;clearTimeout(timer);
   signal?.removeEventListener('abort',stop);
   try{ws?.close();}catch{}
   if(error)reject(error);else resolve(blob);
  }
  signal?.addEventListener('abort',stop,{once:true});
  try {ws=new WebSocketImpl(address);}
  catch(error){finish(Error('无法建立 Eleven v4 Turbo 连接：'+error.message));return;}
  ws.onopen=()=>{if(finished)return;try{for(const frame of frames)ws.send(JSON.stringify(frame));}catch(error){finish(error);}};
  ws.onerror=()=>finish(Error('Eleven v4 Turbo WebSocket 连接失败，请检查接口、网络和权限'));
  ws.onclose=e=>{if(!finished)finish(Error('Eleven v4 Turbo 连接提前关闭（'+(e?.code||'未知')+'）'));};
  ws.onmessage=e=>{
   if(finished)return;
   let data;try{data=JSON.parse(e.data);}catch{finish(Error('Eleven v4 Turbo 返回了无效消息'));return;}
   if(data.error){const info=typeof data.error==='string'?data.error:data.error?.message||data.error?.code||'服务拒绝请求';finish(Error('Eleven v4 Turbo：'+String(info).slice(0,200)));return;}
   if(data.audio){
    try{
     const bytes=Uint8Array.from(atob(data.audio),c=>c.charCodeAt(0));
     size+=bytes.length;if(size>LIMIT)throw Error('单段音频过大，请缩短台词');
     chunks.push(bytes);
    }catch(error){finish(error);return;}
   }
   if(data.is_final){
    if(!size){finish(Error('Eleven v4 Turbo 没有返回声音'));return;}
    finish(null,new Blob(chunks,{type:request.format?.startsWith('pcm_')?'audio/wav':request.format?.startsWith('opus_')?'audio/ogg':'audio/mpeg'}));
   }
  };
 });
}
