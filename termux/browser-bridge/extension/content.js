(() => {
  const positions = new WeakMap();
  const fields = new WeakMap();
  const prefix=Array.from(crypto.getRandomValues(new Uint32Array(2)),v=>v.toString(36)).join('-');
  let scroll = 0, timer, sequence=0, revealed;
  function editable(element) {
    if (!element || element.closest('[inert]')) return null;
    if (element.matches('textarea,input')) {
      if (element.matches(':disabled,[readonly]')) return null;
      if (element.localName === 'textarea') return 'textarea';
      const type = element.type;
      return /^(text|search|email|url|tel|number|password|date|time|month|week|datetime-local)$/.test(type) ?
        'input:' + type : null;
    }
    return element.isContentEditable ? 'contenteditable' : null;
  }

  function identity(element) {
    if (!fields.has(element)) fields.set(element,prefix+'-'+(++sequence).toString(36));
    return fields.get(element);
  }
  function focusedElement() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return element;
  }
  function visibleFields() {
    const result=[];
    let scanned=0;
    function walk(root) {
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);
      let node;
      while (result.length<40 && scanned<3000 && (node=walker.nextNode())) {
        scanned++;
        if (node.shadowRoot) walk(node.shadowRoot);
        if (!node.matches('input,textarea,[contenteditable]')) continue;
        const role=editable(node);
        if (!role) continue;
        const {left,top,right,bottom}=node.getBoundingClientRect();
        const x=Math.max(0,left),y=Math.max(0,top);
        const w=Math.min(innerWidth,right)-x,h=Math.min(innerHeight,bottom)-y;
        if (w<4 || h<4) continue;
        if (getComputedStyle(node).visibility!=='visible') continue;
        const hit=root.elementFromPoint?.(x+w/2,y+h/2);
        if (hit && hit!==node && !node.contains(hit)) continue;
        result.push({id:identity(node),role,x,y,w,h});
      }
    }
    walk(document);
    return result;
  }
  function frames() {
    if (window!==window.top) return [];
    const result=[];
    for (const node of Array.from(document.querySelectorAll('iframe,frame')).slice(0,48)) {
      if (!node.clientWidth || !node.clientHeight) continue;
      const rect=node.getBoundingClientRect();
      const sx=rect.width/(node.offsetWidth || node.clientWidth);
      const sy=rect.height/(node.offsetHeight || node.clientHeight);
      if (!(sx>0 && sy>0) || rect.right<=0 || rect.left>=innerWidth || rect.bottom<=0 || rect.top>=innerHeight) continue;
      for (let index=0;index<Math.min(window.frames.length,48);index++) {
        if (window.frames[index]===node.contentWindow) {
          result.push({index,x:rect.left+node.clientLeft*sx,y:rect.top+node.clientTop*sy,sx,sy,
            w:node.clientWidth*sx,h:node.clientHeight*sy});
          break;
        }
      }
    }
    return result;
  }
  function childIndex() {
    if (window===window.top || window.parent!==window.top) return null;
    try {
      for (let i=0;i<Math.min(window.parent.frames.length,48);i++) if (window.parent.frames[i]===window) return i;
    } catch {}
    return null;
  }
  function snapshot() {
    const element = focusedElement();
    const visual = window.visualViewport;
    const full = document.fullscreenElement;
    const focused = document.hasFocus() ? editable(element) : null;
    return {
      focus:focused,
      field:focused ? identity(element) : null,
      child:!!(document.hasFocus() && element?.matches('iframe,frame')),
      hints:visibleFields().map(row=>({...row,frame:0})),
      frames:frames(),
      index:childIndex(),
      page:{scroll,fullscreen:!full ? 'none' :
        (full.matches('video') || full.querySelector('video') ||
          full.contentDocument?.fullscreenElement?.matches('video') ? 'video' : 'page')},
      viewport: {
        width: window.innerWidth, height: window.innerHeight,
        visualWidth: visual?.width ?? window.innerWidth, visualHeight: visual?.height ?? window.innerHeight,
        dpr: window.devicePixelRatio, scale: visual?.scale ?? 1,
        outerWidth:window.outerWidth,screenWidth:window.screen.width,
        documentWidth:document.scrollingElement?.scrollWidth || window.innerWidth,
        offsetTop:Math.max(0,visual?.offsetTop || 0),offsetLeft:Math.max(0,visual?.offsetLeft || 0),
        touchPoints:navigator.maxTouchPoints || 0,coarse:matchMedia('(pointer: coarse)').matches,
        mobileJS:/\b(?:Android|Mobile)\b/i.test(navigator.userAgent),
      },
    };
  }

  function reveal(target) {
    const rect=target.getBoundingClientRect();
    if (rect.top>=8 && rect.bottom<=window.innerHeight-8) return true;
    const boxes=[];
    for (let node=target;node;node=node.parentElement || node.getRootNode().host) {
      if (node.scrollHeight>node.clientHeight) boxes.push({node,y:node.scrollTop,x:node.scrollLeft});
    }
    if (document.scrollingElement && !boxes.some(row=>row.node===document.scrollingElement)) {
      const node=document.scrollingElement;
      boxes.push({node,y:node.scrollTop,x:node.scrollLeft});
    }
    target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    revealed=boxes.map(row=>({...row,afterY:row.node.scrollTop,afterX:row.node.scrollLeft}));
    return true;
  }
  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id) return undefined;
    if (message?.type === 'bridge-inspect') return Promise.resolve(snapshot());
    if (message?.type === 'bridge-leave-fullscreen') return document.exitFullscreen().then(() => true);
    if (message?.type === 'bridge-reveal-field' || message?.type === 'bridge-reveal-child') {
      const target = focusedElement();
      if (message.type==='bridge-reveal-child' && target?.matches('iframe,frame'))
        return Promise.resolve(reveal(target));
      if (editable(target) && identity(target)===message.id) return Promise.resolve(reveal(target));
    }
    if (message?.type === 'bridge-restore-field' && revealed) {
      const rows=revealed;revealed=null;
      if (rows.every(({node,afterY,afterX})=>node.scrollTop===afterY && node.scrollLeft===afterX))
        for (const {node,y,x} of rows) {node.scrollTop=y;node.scrollLeft=x;}
      return Promise.resolve(true);
    }
    return undefined;
  });
  function changed() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      browser.runtime.sendMessage({type:'bridge-page-changed'}).catch(() => {});
    }, 80);
  }
  document.addEventListener('focusin', changed, true);
  document.addEventListener('focusout', changed, true);
  window.addEventListener('focus',changed,true);
  window.addEventListener('blur',changed,true);
  document.addEventListener('fullscreenchange', changed, true);
  document.addEventListener('scroll', event => {
    const target = event.target === document ? document.scrollingElement : event.target;
    if (!target || !Number.isFinite(target.scrollTop)) return;
    const before = positions.get(target) ?? 0;
    positions.set(target,target.scrollTop);
    scroll = Math.round(Math.max(-1000000000,Math.min(1000000000,scroll + target.scrollTop - before)));
    changed();
  }, {capture:true,passive:true});
  window.addEventListener('resize', changed);
  window.visualViewport?.addEventListener('resize', changed);
  changed();
})();
