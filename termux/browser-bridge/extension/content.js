(() => {
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

  function snapshot() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    const visual = window.visualViewport;
    return {
      focus: editable(element),
      viewport: {
        width: window.innerWidth, height: window.innerHeight,
        visualWidth: visual?.width ?? window.innerWidth, visualHeight: visual?.height ?? window.innerHeight,
        dpr: window.devicePixelRatio, scale: visual?.scale ?? 1,
      },
    };
  }

  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === browser.runtime.id && message?.type === 'bridge-inspect') return Promise.resolve(snapshot());
    return undefined;
  });
  let timer;
  function changed() {
    clearTimeout(timer);
    timer = setTimeout(() => browser.runtime.sendMessage({type:'bridge-page-changed'}).catch(() => {}), 80);
  }
  document.addEventListener('focusin', changed, true);
  document.addEventListener('focusout', changed, true);
  window.addEventListener('resize', changed);
  window.visualViewport?.addEventListener('resize', changed);
  changed();
})();
