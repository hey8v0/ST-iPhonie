// Apply narrowly scoped runtime compatibility changes; upstream checkout remains intact.
function compatibility(source){
  const needle='supportsWebCodecsH264Decode = await _checkWebCodecsH264DecodeSupport();';
  if(source.split(needle).length!==2)throw Error('unexpected noVNC browser.js version');
  return source.replace(needle,'// iPhonie compatibility: skip optional H.264 probe on local viewer.\nsupportsWebCodecsH264Decode = false;');
}
function html(source){
  const module=/<script\s+type="module"\s*>[\s\S]*?<\/script>/g;
  let count=0;
  const output=source.replace(module,block=>{
    if(!block.includes('import UI from "./app/ui.js";'))return block;
    count++;return '<script defer src="/viewer-state.js"></script><script defer src="/viewer-bootstrap.js"></script>';
  });
  if(count!==1)throw Error('unexpected noVNC HTML version');
  return output;
}
module.exports={compatibility,html};
