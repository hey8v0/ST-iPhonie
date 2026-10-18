// Observe only this extension's realms/resources; never replace the host console.
export function installDiagnostics(win, report, {source = '小手机', owned = () => true} = {}) {
  const send = (kind, data) => { try { report(source, {kind, ...data}, 'error'); } catch {} };
  const error = event => {
    if (event.target && event.target !== win) {
      const url = event.target.src || event.target.href;
      if (url && owned(String(url))) send('资源加载', {url: String(url)});
      return;
    }
    const stack = event.error?.stack || '';
    if (owned(String(event.filename || stack))) send('运行异常', {message: event.message, stack, file: event.filename, line: event.lineno, column: event.colno});
  };
  const rejection = event => {
    const reason = event.reason, stack = reason?.stack || '';
    if (owned(stack)) send('异步异常', {message: reason?.message || String(reason), stack});
  };
  win.addEventListener('error', error, {capture: true});
  win.addEventListener('unhandledrejection', rejection);
  return () => { win.removeEventListener('error', error, {capture: true}); win.removeEventListener('unhandledrejection', rejection); };
}
