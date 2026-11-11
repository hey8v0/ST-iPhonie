// Fish 登录完成后回到的页面。0.9.58: this page finishes the login itself when it can — a phone freezes the tavern tab
// while the user is logging in, so waiting for the tavern to read the mailbox often never happened. The exchange needs
// only what the pending record kept (the PKCE verifier), and the credentials go where the tavern keeps them, so coming
// back to the phone is enough: no second tap, no hot-line to the other tab.
import {acceptFishCallback, readFishPending, exchangeFishCode, fishCredentialKey, fishTrace} from './core/fish-oauth-flow.js';
const params = new URLSearchParams(location.search);
history.replaceState(null, '', location.pathname);

async function finish() {
  const message = text => { document.getElementById('message').textContent = text; };
  let result;
  try { result = acceptFishCallback(params, localStorage); }
  catch (error) { fishTrace(localStorage, 'callback-error', error.message); message(error.message); return; }
  fishTrace(localStorage, result.weak ? 'callback-weak' : 'callback-ok', result.state.slice(0, 6));
  if (result.error || !result.code) { fishTrace(localStorage, 'callback-denied', result.error || ''); message('Fish 未授权此次连接，请返回原来的酒馆页面。'); return; }
  const pending = readFishPending(localStorage, result.state);
  // No record of the start (another tab, or the tavern was reloaded and its storage cleaned): the tavern can still
  // finish it with the mailbox, as before.
  if (!pending?.verifier || !pending?.clientId || !pending?.redirect) {
    try { window.opener?.postMessage(result, location.origin); } catch { /* the mailbox is enough */ }
    message('已收到 Fish 授权，请切回原来的酒馆标签页完成连接，不需要重新登录。');
    return;
  }
  try {
    const credentials = await exchangeFishCode({code: result.code, verifier: pending.verifier, clientId: pending.clientId, redirect: pending.redirect, scope: pending.scope});
    localStorage.setItem(fishCredentialKey(pending.scope), JSON.stringify(credentials));
    fishTrace(localStorage, 'callback-token-ok', result.state.slice(0, 6));
    for (const key of [fishLoginKeysSafe(result.state).pending, fishLoginKeysSafe(result.state).result]) { try { localStorage.removeItem(key); } catch { /* already gone */ } }
    try { window.opener?.postMessage({...result, done: true}, location.origin); } catch { /* not needed */ }
    message('Fish 账户已连接。回到小手机就能用订阅积分了，不需要再点一次。');
  } catch (error) {
    fishTrace(localStorage, 'callback-token-fail', error.message);
    try { window.opener?.postMessage(result, location.origin); } catch { /* the mailbox is enough */ }
    message(`${error.message}。也可以切回酒馆，再点一次「连接订阅账户」。`);
  }
}
function fishLoginKeysSafe(state) {
  try { return {pending: 'sttts.fishLogin.pending.' + state, result: 'sttts.fishLogin.result.' + state}; } catch { return {pending: '', result: ''}; }
}
finish();
