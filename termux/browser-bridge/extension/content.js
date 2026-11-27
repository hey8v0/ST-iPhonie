(() => {
  const positions = new WeakMap();
  let scroll = 0, timer;
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

  function focusedElement() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return element;
  }
  function snapshot() {
    const element = focusedElement();
    const visual = window.visualViewport;
    const full = document.fullscreenElement;
    return {
      focus: editable(element),
      page:{scroll,fullscreen:!full ? 'none' :
        (full.matches('video') || full.querySelector('video') ||
          full.contentDocument?.fullscreenElement?.matches('video') ? 'video' : 'page')},
      viewport: {
        width: window.innerWidth, height: window.innerHeight,
        visualWidth: visual?.width ?? window.innerWidth, visualHeight: visual?.height ?? window.innerHeight,
        dpr: window.devicePixelRatio, scale: visual?.scale ?? 1,
      },
    };
  }

  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id) return undefined;
    if (message?.type === 'bridge-inspect') return Promise.resolve(snapshot());
    if (message?.type === 'bridge-leave-fullscreen') return document.exitFullscreen().then(() => true);
    if (message?.type === 'bridge-reveal-field') {
      const target = focusedElement();
      if (editable(target)) {
        target.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
        return Promise.resolve(true);
      }
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
