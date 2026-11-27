/* Shared between the extension and the local service. */
const bridgeProtocol = (() => {
  const version = 1;
  const id = /^[a-z0-9-]{1,64}$/i;
  const tabId = value => Number.isSafeInteger(value) && value >= 0;
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
  const webUrl = value => {
    if (typeof value !== 'string' || value.length > 4096) return null;
    try {
      const parsed = new URL(value);
      if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return parsed.href;
    } catch {}
    return null;
  };
  const command = msg => {
    if (!exact(msg, ['version','id','action','params']) || msg.version !== version ||
        typeof msg.id !== 'string' || !id.test(msg.id) || typeof msg.action !== 'string') return false;
    const p = msg.params;
    switch (msg.action) {
      case 'navigate': return exact(p, ['tabId','url']) && tabId(p.tabId) && !!webUrl(p.url);
      case 'new-tab': return exact(p, ['url']) && (p.url === '' || !!webUrl(p.url));
      case 'back': case 'forward': case 'reload': case 'switch-tab': case 'close-tab':
        return exact(p, ['tabId']) && tabId(p.tabId);
      case 'browser-fullscreen': return exact(p, ['enabled']) && typeof p.enabled === 'boolean';
      default: return false;
    }
  };
  const access = ['web','internal','unavailable','loading'];
  const modes = ['normal','fullscreen','unknown'];
  const editable = /^(textarea|contenteditable|input:(text|search|email|url|tel|number|password|date|time|month|week|datetime-local))$/;
  const dimension = value => Number.isFinite(value) && value >= 0 && value <= 100000;
  const metrics = value => exact(value, ['width','height','visualWidth','visualHeight','dpr','scale']) &&
    Object.values(value).every(dimension) && value.dpr > 0 && value.scale > 0;
  const focus = value => value === null || (typeof value === 'string' && editable.test(value));
  const state = value => exact(value, ['tabs','activeId','windowMode','focus','viewport']) &&
    Array.isArray(value.tabs) && value.tabs.length <= 64 &&
    value.tabs.every(tab => exact(tab, ['id','title','url','access']) && tabId(tab.id) &&
      typeof tab.title === 'string' && tab.title.length <= 256 &&
      typeof tab.url === 'string' && tab.url.length <= 4096 && access.includes(tab.access)) &&
    new Set(value.tabs.map(tab => tab.id)).size === value.tabs.length &&
    (value.activeId === null || value.tabs.some(tab => tab.id === value.activeId)) &&
    modes.includes(value.windowMode) && focus(value.focus) && (value.viewport === null || metrics(value.viewport));
  const errors = ['tab-unavailable','last-tab','action-failed','busy','no-window','disconnected','timeout',
    'version-mismatch','invalid-command','service-unavailable','fullscreen-owned'];
  const statuses = ['waiting','connecting','connected','disconnected','version-mismatch'];
  const error = value => typeof value === 'string' && errors.includes(value);
  return {version, exact, command, webUrl, state, metrics, focus, error, statuses};
})();
if (typeof module !== 'undefined') module.exports = bridgeProtocol;
