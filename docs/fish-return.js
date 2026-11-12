import {readFishReturn, packFishCallback} from './fish-return-code.js';

// A display-only page: no token exchange, requests, credential storage or opener
// messages. The originating tavern alone owns the PKCE verifier and consumes it.
export function mountFishReturn(win) {
  const doc = win.document, params = new URLSearchParams(win.location.search);
  try { win.history.replaceState(null, '', win.location.pathname); } catch { /* still display the result */ }
  const heading = doc.getElementById('heading'), message = doc.getElementById('message');
  let token;
  try { token = packFishCallback(readFishReturn(params)); }
  catch (error) { heading.textContent = params.size ? '这次授权未完成' : 'Fish 账户连接'; message.textContent = error.message; return; }
  heading.textContent = '已收到 Fish 授权';
  message.textContent = '还差一步：复制本次授权码，回 TT 酒馆粘贴完成连接。';
  doc.getElementById('manual').hidden = false;
  const code = doc.getElementById('code'), button = doc.getElementById('copy'), status = doc.getElementById('copy-status');
  code.value = token;
  button.onclick = async () => {
    let copied = false;
    try { await win.navigator.clipboard.writeText(token); copied = true; } catch { /* older mobile browser */ }
    if (!copied) {
      code.focus(); code.select(); code.setSelectionRange(0, code.value.length);
      try { copied = doc.execCommand('copy') === true; } catch { /* keep the text selected */ }
    }
    button.textContent = copied ? '已复制本次授权码' : '再试一次复制';
    status.textContent = copied ? '回到 TT 酒馆，在「连接诊断」中粘贴即可。' : '已选中授权码，请长按文字选择「复制」，再回酒馆粘贴。';
  };
}
if (typeof window !== 'undefined') mountFishReturn(window);
