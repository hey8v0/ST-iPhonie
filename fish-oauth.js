// Fish 登录完成后回到的页面。0.9.58: this page finishes the login itself when it can — a phone freezes the tavern tab
// while the user is logging in, so waiting for the tavern to read the mailbox often never happened.
// 0.9.59: also shows a copyable manual token ("fish1....") whenever the callback lands in an isolated browser container
// or WebView whose localStorage does not hold the tavern's pending record.
import {acceptFishCallback, readFishPending, completeFishLogin, fishCompletedScope, fishLoginLocks, fishTrace, packFishCallback} from './core/fish-oauth-flow.js';
const params = new URLSearchParams(location.search);
history.replaceState(null, '', location.pathname);

function showManual(result) {
  const token = packFishCallback(result);
  const box = document.getElementById('manual'), codeEl = document.getElementById('code'), btn = document.getElementById('copy');
  if (!token || !box || !codeEl) return;
  codeEl.textContent = token;
  box.style.display = 'block';
  if (btn) btn.onclick = async () => {
    try { await navigator.clipboard.writeText(token); btn.textContent = '已复制！去酒馆「连接诊断」里粘贴'; }
    catch { btn.textContent = '请长按上方文字全选复制'; }
  };
}

async function finish() {
  const meta = document.getElementById('meta');
  if (meta) meta.textContent = `ST-iPhonie 0.9.60 · ${location.origin}`;
  const message = text => { document.getElementById('message').textContent = text; };
  let result;
  try { result = acceptFishCallback(params, localStorage, Date.now(), {publish: false}); }
  catch (error) { fishTrace(localStorage, 'callback-error', error.message); message(error.message); return; }
  fishTrace(localStorage, result.weak ? 'callback-weak' : 'callback-ok', result.state.slice(0, 6));
  if (result.error || !result.code) {
    acceptFishCallback(params, localStorage);
    try { window.opener?.postMessage(result, location.origin); } catch { /* mailbox */ }
    fishTrace(localStorage, 'callback-denied', result.error || ''); message('Fish 未授权此次连接，请返回原来的酒馆页面。'); return;
  }
  if (fishCompletedScope(localStorage, result.state) !== null) { message('这次 Fish 登录已经完成，请回到小手机。'); return; }
  const pending = readFishPending(localStorage, result.state), locks = fishLoginLocks(globalThis);
  // No pending record, or no shared lock: this page is a messenger, not another
  // exchanger. In particular it must not publish a code and then exchange it too.
  const missing = !pending?.verifier || !pending?.clientId || !pending?.redirect;
  if (missing || pending.consumer === 'host' || typeof locks?.request !== 'function') {
    acceptFishCallback(params, localStorage);
    try { window.opener?.postMessage(result, location.origin); } catch { /* mailbox or manual token */ }
    showManual(result);
    message(missing
      ? `已收到 Fish 授权（标识 ${result.state.slice(0, 6)}），但当前浏览器容器里没读到酒馆发起时的待办记录。请点「复制本次授权码」，切回酒馆在「连接诊断」里粘贴完成连接。`
      : '已收到 Fish 授权，请切回发起授权的酒馆页面完成连接。这个浏览器由原酒馆页面单独换取凭据；如果原页已关闭，请重新连接。');
    return;
  }
  try {
    await completeFishLogin({storage: localStorage, state: result.state, scope: pending.scope || '', result, locks, side: 'callback'});
    fishTrace(localStorage, 'callback-token-ok', result.state.slice(0, 6));
    try { window.opener?.postMessage({type: result.type, state: result.state, iss: result.iss, done: true}, location.origin); } catch { /* credentials are already in storage */ }
    message('Fish 账户已连接！回到小手机就能用订阅积分了，不需要再点一次。');
  } catch (error) {
    fishTrace(localStorage, 'callback-token-fail', error.message);
    // The exchange may already have consumed the code. Do not advertise it for
    // another automatic/manual retry; a fresh login gets a fresh PKCE code.
    message(error.message);
  }
}
finish();
