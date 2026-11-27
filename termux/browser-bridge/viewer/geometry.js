const box = element => {
  const {width,height,left,top}=element.getBoundingClientRect();
  return {width:Math.round(width),height:Math.round(height),left:Math.round(left),top:Math.round(top)};
};
const same = (a,b) => a?.width===b?.width && a?.height===b?.height;
export const repairDesktop=Object.freeze({width:1024,height:768});

export function viewerGeometry(rfb,surface,report,{repair=false}={}) {
  const display=rfb._display, canvas=rfb._canvas;
  if (!display || !canvas || !rfb.constructor.messages?.setDesktopSize) throw Error('viewer-version');
  const cover=document.createElement('canvas');
  cover.className='resize-preview';
  cover.hidden=true;
  cover.setAttribute('aria-hidden','true');
  surface.append(cover);
  const context=cover.getContext('2d');
  const resize=rfb._resize, extended=rfb._handleExtendedDesktopSize;
  const decode=rfb._handleDataRect, update=rfb._framebufferUpdate;
  if (![resize,extended,decode,update].every(fn=>typeof fn==='function')) throw Error('viewer-version');
  let size, pending, rejected, settled, coverTimer, replyTimer, pixels=0, epoch=0;
  let ready=false, desktop=false, keyboard=false, hold=false, disposed=false;
  let floor=0, viewport, stableViewport, physicalWidth, renderDensity=1;
  const framebuffer=()=>({width:rfb._fbWidth,height:rfb._fbHeight});
  function proposedDensity() {
    // The Firefox browser zoom is independent from native rendering density.
    const native=viewport?.dpr/(viewport?.zoom || 1);
    return Number.isFinite(native) ? Math.max(1,Math.min(2,native)) : 1;
  }
  function trace(kind,info={}) {
    report(kind,{...info,surface:size,canvas:box(canvas),canvasPixels:{width:canvas.width,height:canvas.height},
      framebuffer:framebuffer(),scale:display.scale,density:renderDensity,keyboard,desktop,repair});
  }
  function fit() {
    const fb=framebuffer();
    if (!size || !fb.width || !fb.height) return;
    const width=size.width/fb.width;
    const scale=keyboard && !desktop ? width : Math.min(width,size.height/fb.height);
    display.scale=scale;
    canvas.style.margin=keyboard && !desktop ? '0 auto' : 'auto';
    if (!cover.hidden) {
      const ratio=keyboard && !desktop ? size.width/cover.width :
        Math.min(size.width/cover.width,size.height/cover.height);
      cover.style.width=Math.round(cover.width*ratio)+'px';
      cover.style.height=Math.round(cover.height*ratio)+'px';
      cover.dataset.top=keyboard && !desktop ? 'true' : 'false';
    }
  }
  function reveal(reason) {
    clearTimeout(coverTimer);
    if (!cover.hidden) {cover.hidden=true;trace(reason);}
  }
  function keepFrame() {
    if (!ready || !cover.hidden || !canvas.width || !canvas.height || !context) return;
    cover.width=canvas.width;
    cover.height=canvas.height;
    context.drawImage(canvas,0,0);
    cover.hidden=false;
    fit();
    clearTimeout(coverTimer);
    coverTimer=setTimeout(()=>{
      if (!cover.hidden) {
        const fb=framebuffer();
        if (rfb._rfbConnectionState==='connected')
          rfb.constructor.messages.fbUpdateRequest(rfb._sock,false,0,0,fb.width,fb.height);
        trace('frame-refresh');
        coverTimer=setTimeout(()=>reveal('frame-timeout'),1000);
      }
    },850);
  }
  function target() {
    if (repair) return repairDesktop;
    const width=Math.max(floor,Math.round(size.width*renderDensity),desktop?960:0);
    const height=Math.max(size.height,Math.min(desktop?1600:2160,Math.round(size.height*width/size.width)));
    return {width:Math.min(width,2160),height:Math.min(height,2160)};
  }
  function request() {
    if (disposed || hold || !size || !rfb._supportsSetDesktopSize || pending ||
        rfb._rfbConnectionState!=='connected') return;
    const next=target();
    if (same(next,framebuffer()) || same(next,rejected)) return;
    rejected=null;
    pending=next;
    trace('resize-request',{requested:next});
    rfb.constructor.messages.setDesktopSize(rfb._sock,next.width,next.height,rfb._screenID,rfb._screenFlags);
    replyTimer=setTimeout(()=>{
      rejected=pending;pending=null;
      trace('resize-timeout',{requested:rejected});
    },2200);
  }
  function schedule() {
    clearTimeout(settled);
    settled=setTimeout(request,120);
  }
  function measure() {
    const next=box(surface);
    if (next.width<80 || next.height<80) return;
    const changed=!same(size,next);
    if (size && Math.abs(size.width-next.width)>12) {floor=0;stableViewport=null;}
    size=next;
    fit();
    if (changed) {trace('surface-layout');schedule();}
  }
  const observer=new ResizeObserver(measure);
  observer.observe(surface);
  rfb._updateScale=fit;
  rfb.resizeSession=false;
  rfb._resize=function(width,height) {
    const changed=!same({width,height},framebuffer());
    if (changed) {
      keepFrame();
      epoch++;
      pixels=0;
      stableViewport=null;
    }
    const result=resize.call(this,width,height);
    if (changed) trace('framebuffer-size');
    fit();
    return result;
  };
  rfb._handleExtendedDesktopSize=function() {
    const {x,y,width,height}=this._FBU;
    const done=extended.call(this);
    if (!done) return done;
    if (x===1) {
      const previous=pending;
      clearTimeout(replyTimer);
      pending=null;
      rejected=(y || !same(previous,{width,height})) ? previous : null;
      trace('resize-reply',{result:y,requested:previous,reported:{width,height}});
    }
    schedule();
    return done;
  };
  rfb._handleDataRect=function(...args) {
    const done=decode.apply(this,args);
    if (done) pixels++;
    return done;
  };
  rfb._framebufferUpdate=function(...args) {
    const done=update.apply(this,args);
    if (done && pixels && (!ready || !cover.hidden)) {
      const current=epoch;
      pixels=0;
      queueMicrotask(()=>Promise.resolve(display.flush()).then(()=>{
        if (disposed || current!==epoch) return;
        if (!ready) {ready=true;trace('first-frame');}
        else reveal('frame-painted');
      }).catch(()=>trace('frame-error')));
    } else if (done) pixels=0;
    return done;
  };
  measure();
  return {
    display,canvas,
    interactive:()=>ready && cover.hidden && !pending,
    mode(next) {
      if (desktop===next) return;
      desktop=next;floor=0;stableViewport=null;
      schedule();
    },
    editing(next) {
      if (repair) return;
      if (keyboard===next) return;
      keyboard=next;fit();trace('keyboard-fit');
      schedule();
    },
    hold(next) {
      hold=next;
      if (!hold) {measure();schedule();}
    },
    firefox(next) {
      if (!next || desktop) return;
      viewport=next;
      const density=proposedDensity();
      if (Math.abs(renderDensity-density)>.05) {renderDensity=density;schedule();}
      if (!ready || pending || !size || keyboard) return;
      // GTK can keep a Firefox window wider than the X screen. A document's
      // scrollWidth alone is never evidence of clipping at the framebuffer.
      const fb=framebuffer();
      const physical=Math.round(viewport.width*viewport.dpr);
      const screen=Math.round(viewport.screenWidth*proposedDensity());
      if (physical>fb.width+12 && physical<=2160 && Math.abs(screen-fb.width)<=16) {
        if (physical!==physicalWidth || !stableViewport) {
          physicalWidth=physical;stableViewport=performance.now();
        } else if (performance.now()-stableViewport>230 && physical>floor+12) {
          floor=physical;
          trace('firefox-width-floor',{width:physical,viewport});
          schedule();
        }
      }
    },
    close() {
      disposed=true;
      observer.disconnect();
      for (const timer of [settled,replyTimer,coverTimer]) clearTimeout(timer);
      cover.remove();
    },
  };
}
