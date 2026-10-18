// Shared controller input for independent games. The browser owns device pairing.
// Only the browser's canonical standard mapping is used; held buttons fire once.
export function createGamepadInput(nav){
 let current=null,held=new Set(),lastDirection='',nextDirection=0;
 const empty=()=>({x:0,y:0,pressed:new Set(),direction:'',connected:false,lost:false});
 function read(now=0){
  let pads;try{pads=Array.from(nav.getGamepads?.()||[]);}catch{return empty();}
  const pad=pads.find(p=>p?.connected&&p.index===current&&p.mapping==='standard')||pads.find(p=>p?.connected&&p.mapping==='standard');
  if(!pad){const lost=current!==null;current=null;held.clear();lastDirection='';return {...empty(),lost};}
  const changed=current!==pad.index;if(changed){current=pad.index;held.clear();lastDirection='';}
  const down=new Set(pad.buttons.map((b,i)=>b?.pressed||b?.value>.5?i:-1).filter(i=>i>=0)),pressed=new Set([...down].filter(i=>!held.has(i)));held=down;
  let x=Number.isFinite(pad.axes[0])?pad.axes[0]:0,y=Number.isFinite(pad.axes[1])?pad.axes[1]:0;
  const magnitude=Math.hypot(x,y),strength=Math.min(1,Math.max(0,(magnitude-.2)/.8));if(magnitude>.2){x=x/magnitude*strength;y=y/magnitude*strength;}else{x=y=0;}
  if(down.has(14)||down.has(15))x=Number(down.has(15))-Number(down.has(14));if(down.has(12)||down.has(13))y=Number(down.has(13))-Number(down.has(12));
  const direction=Math.abs(y)>.5?(y>0?'down':'up'):Math.abs(x)>.5?(x>0?'right':'left'):'';let move='';
  if(direction&&(direction!==lastDirection||now>=nextDirection)){move=direction;nextDirection=now+(direction!==lastDirection?350:160);}lastDirection=direction;
  return {x,y,pressed,direction:move,connected:true,changed,lost:false};
 }
 return {read,reset(){held.clear();lastDirection='';}};
}
