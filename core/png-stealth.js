// NovelAI's alpha LSB metadata: columns first, MSB first, a 15-byte
// signature + 32-bit payload bit count. Decoding stays on this device.
const MAX_PIXELS=32*1024*1024,MAX_PACKED=1024*1024,MAX_TEXT=4*1024*1024;
export async function stealthAlpha({width,height,data}) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>MAX_PIXELS||data?.length!==width*height*4)return null;
  const capacity=width*height;
  const bytes=(start,n)=>{if(start+n*8>capacity)throw Error('图片里的隐藏参数不完整');const out=new Uint8Array(n);for(let i=0;i<n*8;i++){const at=start+i,x=Math.floor(at/height),y=at%height;out[i>>3]|=(data[(y*width+x)*4+3]&1)<<(7-(i&7));}return out;};
  if(capacity<152)return null;
  const magic=new TextDecoder().decode(bytes(0,15));
  if(magic!=='stealth_pngcomp'&&magic!=='stealth_pnginfo')return null;
  const length=new DataView(bytes(120,4).buffer).getUint32(0);
  if(length%8||length<8||length/8>MAX_PACKED||length+152>capacity)throw Error('图片里的隐藏参数长度无效');
  let payload=bytes(152,length/8);
  if(magic==='stealth_pngcomp'){
    if(typeof DecompressionStream!=='function')throw Error('当前浏览器不支持读取隐藏参数，请更新浏览器');
    const reader=new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
    try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>MAX_TEXT)throw Error('图片里的隐藏参数太大');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    payload=new Uint8Array(size);let at=0;for(const chunk of chunks){payload.set(chunk,at);at+=chunk.length;}
  }
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload));
  return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
}
export async function pngStealth(buffer,{decode}={}) {
  const b=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  if(b.length<33||b[0]!==137||b[1]!==80||b[2]!==78||b[3]!==71||![4,6].includes(b[25]))return null;
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength),width=v.getUint32(16),height=v.getUint32(20);
  if(!width||!height||width*height>MAX_PIXELS)throw Error('图片尺寸过大，无法读取隐藏参数');
  if(decode)return stealthAlpha(await decode(b));
  if(typeof createImageBitmap!=='function'||typeof document==='undefined')return null;
  const image=await createImageBitmap(new Blob([b],{type:'image/png'}),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  const canvas=document.createElement('canvas');
  try{
    canvas.width=width;canvas.height=height;const g=canvas.getContext('2d',{willReadFrequently:true});
    if(!g)throw Error('当前浏览器无法读取图片像素');
    g.drawImage(image,0,0);return await stealthAlpha(g.getImageData(0,0,width,height));
  }finally{image.close();canvas.width=canvas.height=0;}
}
