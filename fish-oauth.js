// Fish 登录完成后回到的页面。0.9.58: this page finishes the login itself when it can — a phone freezes the tavern tab
// while the user is logging in, so waiting for the tavern to read the mailbox often never happened.
// 0.9.59: also shows a copyable manual token ("fish1....") whenever the callback lands in an isolated browser container
// or WebView whose localStorage does not hold the tavern's pending record.
import {acceptFishCallback, readFishPending, exchangeFishCode, fishCredentialKey, fishTrace, packFishCallback} from './core/fish-oauth-flow.js';
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
  if (meta) meta.textContent = `ST-iPhonie 0.9.59 · ${location.origin}`;
  const message = text => { document.getElementById('message').textContent = text; };
  let result;
  try { result = acceptFishCallback(params, localStorage); }
  catch (error) { fishTrace(localStorage, 'callback-error', error.message); message(error.message); return; }
  fishTrace(localStorage, result.weak ? 'callback-weak' : 'callback-ok', result.state.slice(0, 6));
  if (result.error || !result.code) { fishTrace(localStorage, 'callback-denied', result.error || ''); message('Fish 未授权此次连接，请返回原来的酒馆页面。'); return; }
  const pending = readFishPending(localStorage, result.state);
  // No record of the start (another browser app / isolated container, or the tavern storage was cleared):
  // write the mailbox, postMessage if possible, and show the one-tap copy code so the user can paste it in the tavern.
  if (!pending?.verifier || !pending?.clientId || !pending?.redirect) {
    try { window.opener?.postMessage(result, location.origin); } catch { /* the mailbox or manual token is enough */ }
    showManual(result);
    message(`已收到 Fish 授权（标识 ${result.state.slice(0, 6)}），但当前浏览器容器里没读到酒馆发起时的待办记录。请直接点下方「复制本次授权码」，切回酒馆在「连接诊断」里粘贴完成连接。`);
    return;
  }
  try {
    const credentials = await exchangeFishCode({code: result.code, verifier: pending.verifier, clientId: pending.clientId, redirect: pending.redirect, scope: pending.scope});
    localStorage.setItem(fishCredentialKey(pending.scope), JSON.stringify(credentials));
    fishTrace(localStorage, 'callback-token-ok', result.state.slice(0, 6));
    for (const key of [fishLoginKeysSafe(result.state).pending, fishLoginKeysSafe(result.state).result]) { try { localStorage.removeItem(key); } catch { /* already gone */ } }
    try { window.opener?.postMessage({...result, done: true}, location.origin); } catch { /* not needed */ }
    message('Fish 账户已连接！回到小手机就能用订阅积分了，不需要再点一次。');
  } catch (error) {
    fishTrace(localStorage, 'callback-token-fail', error.message);
    try { window.opener?.postMessage(result, location.origin); } catch { /* the mailbox is enough */ }
    showManual(result);
    message(`${error.message}。你也可以复制下方授权码，回酒馆「连接诊断」里粘贴重试。`);
  }
}
function fishLoginKeysSafe(state) {
  try { return {pending: 'sttts.fishLogin.pending.' + state, result: 'sttts.fishLogin.result.' + state}; } catch { return {pending: '', result: ''}; }
}
finish();
