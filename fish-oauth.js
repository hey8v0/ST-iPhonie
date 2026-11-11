import {acceptFishCallback} from './core/fish-oauth-flow.js';
const params = new URLSearchParams(location.search);
history.replaceState(null, '', location.pathname);
try {
  const result = acceptFishCallback(params, localStorage);
  try { window.opener?.postMessage(result, location.origin); } catch { /* shared mailbox works without an opener */ }
  document.getElementById('message').textContent = result.error ? 'Fish 未授权此次连接，请返回原来的酒馆页面。' : '已收到 Fish 授权，请切回原来的酒馆标签页完成连接，不需要重新登录。';} catch (error) { document.getElementById('message').textContent = error.message; }
