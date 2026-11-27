const get = id => document.getElementById(id);
const accessToken = new URLSearchParams(location.hash.slice(1)).get('key');
if (location.hash) history.replaceState(null, '', location.pathname);
const statuses = {
  waiting:'服务在运行，等待加载 Firefox 扩展', connecting:'已握手，正在读取标签页',
  connected:'Firefox 扩展已连接', disconnected:'扩展已断开，正在等待重连',
  'version-mismatch':'扩展和服务版本不匹配，请重新加载当前安装包的 XPI',
};
const errors = {
  'tab-unavailable':'这个标签页已关闭或位于其他窗口。', 'last-tab':'保留最后一张标签页，避免关闭浏览器窗口。',
  'action-failed':'Firefox 未完成操作。返回或前进时请先确认已有浏览记录。',
  'no-window':'Firefox 暂无可控制的普通窗口。', 'fullscreen-owned':'Firefox 已处于全屏，可在原窗口退出全屏。',
  disconnected:'扩展已断开。', timeout:'没收到 Firefox 的确认，请先检查页面实际状态。',
  busy:'Firefox 正在处理上一项操作。', 'invalid-command':'请输入完整的 HTTP 或 HTTPS 网址。',
};
const access = {web:'网页可检查', internal:'Firefox 内部页或非网页协议',
  unavailable:'网页未授予检查能力或尚未注入扩展', loading:'等待页面加载'};
let timer, pending = false, checking = false, snapshot, tabView = '';
const validToken = /^[a-f0-9]{64}$/.test(accessToken || '');

async function api(path, body) {
  const res = await fetch(path, {method:'POST', redirect:'error', cache:'no-store',
    headers:{Authorization:'Bearer ' + accessToken, ...(body ? {'Content-Type':'application/json'} : {})},
    body:body && JSON.stringify(body), signal:AbortSignal.timeout(5000)});
  if (res.status === 403) throw new Error('authorization');
  return res.json();
}

function draw() {
  const active = snapshot?.tabs.find(tab => tab.id === snapshot.activeId);
  const ready = !!snapshot && !pending;
  get('title').textContent = active?.title || (active ? '未命名网页' : '暂无活动标签页');
  get('address').textContent = active?.url || '';
  get('page').textContent = active ? access[active.access] : '';
  get('focus').textContent = active?.access === 'web' ?
    (snapshot.focus ? '聚焦 · ' + snapshot.focus : '未聚焦可编辑元素') : '';
  const v = snapshot?.viewport;
  get('viewport').textContent = v ?
    `CSS ${v.width} × ${v.height} · DPR ${v.dpr} · 可见 ${Math.round(v.visualWidth)} × ${Math.round(v.visualHeight)} · 缩放 ${v.scale}` : '';
  get('tab-count').textContent = snapshot ? `已同步标签页 · ${snapshot.tabs.length}` : '标签页';
  get('navigate').querySelector('button').disabled = !ready || !active;
  for (const button of document.querySelectorAll('[data-command]')) button.disabled = !ready || !active;
  get('enter').disabled = !ready || snapshot?.windowMode !== 'normal';
  get('exit').disabled = !ready || snapshot?.windowMode !== 'fullscreen';
  get('add').disabled = !ready || !active;
  const next = JSON.stringify([snapshot?.tabs, snapshot?.activeId, ready]);
  if (next === tabView) return;
  tabView = next;
  get('tabs').replaceChildren(...(snapshot?.tabs || []).map(tab => {
    const item = document.createElement('li');
    const open = document.createElement('button');
    open.textContent = tab.title || tab.url || '未命名网页';
    open.title = tab.url;
    open.disabled = !ready;
    if (tab.id === snapshot.activeId) open.setAttribute('aria-current','true');
    open.onclick = () => act('switch-tab',{tabId:tab.id});
    const close = document.createElement('button');
    close.textContent = '关闭';
    close.setAttribute('aria-label', '关闭 ' + open.textContent);
    close.disabled = !ready || snapshot.tabs.length <= 1;
    close.onclick = () => act('close-tab',{tabId:tab.id});
    item.append(open,close);
    return item;
  }));
}

async function check() {
  clearTimeout(timer);
  if (checking || document.hidden) return;
  if (!validToken) {
    get('connection').textContent = '请在 Termux 运行 iphonie-bridge panel 打开此面板。';
    get('export').disabled = true;
    return;
  }
  checking = true;
  try {
    const res = await api('/status');
    snapshot = res.status === 'connected' && res.version === 1 ? res.state : null;
    get('connection').textContent = statuses[res.status] || '无法识别控制服务';
  } catch (err) {
    snapshot = null;
    get('connection').textContent = err.message === 'authorization' ?
      '验证链接已失效，请运行 iphonie-bridge panel。' : '控制服务未响应，请运行 iphonie-bridge 再试。';
  } finally {
    checking = false;
    draw();
    if (!document.hidden) timer = setTimeout(check, 1000);
  }
}

async function act(action, params) {
  if (pending || !snapshot) return;
  pending = true;
  get('result').textContent = '等待 Firefox 确认…';
  draw();
  try {
    const id = crypto.randomUUID();
    const res = await api('/command',{version:1,id,action,params});
    get('result').textContent = res.ok && res.id === id ? 'Firefox 已执行' : errors[res.error] || '操作失败';
  } catch {
    get('result').textContent = '没收到 Firefox 的确认，请检查连接。';
  } finally {
    pending = false;
    draw();
    void check();
  }
}

get('navigate').onsubmit = event => {
  event.preventDefault();
  void act('navigate',{tabId:snapshot?.activeId,url:get('url').value.trim()});
};
for (const button of document.querySelectorAll('[data-command]')) {
  button.onclick = () => act(button.dataset.command,{tabId:snapshot.activeId});
}
get('add').onclick = () => act('new-tab',{url:''});
get('enter').onclick = () => act('browser-fullscreen',{enabled:true});
get('exit').onclick = () => act('browser-fullscreen',{enabled:false});
get('retry').onclick = check;
get('export').onclick = async () => {
  try {
    const blob = new Blob([JSON.stringify(await api('/diagnostics'),null,2)],{type:'application/json'});
    const href = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = href;
    download.download = 'iphonie-browser-bridge-diagnostics.json';
    download.click();
    setTimeout(() => URL.revokeObjectURL(href),1000);
  } catch {get('result').textContent = '无法导出，请在 Termux 运行 iphonie-bridge diagnose。';}
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else void check();
});
void check();
