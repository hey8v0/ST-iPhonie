const labels = {
  connecting:'正在连接本机宿主', connected:'扩展已连上本机服务',
  'native-unavailable':'Firefox 的 Native Messaging 接口不可用',
  'manifest-unavailable':'Firefox 未找到本机宿主清单',
  'native-denied':'Firefox 拒绝启动本机宿主',
  'native-disconnected':'本机宿主已断开，请确认已运行 iphonie-bridge',
  'version-mismatch':'扩展与本机服务版本不匹配',
};
async function refresh() {
  const result = await browser.runtime.sendMessage({type:'bridge-extension-status'}).catch(() => '');
  document.getElementById('status').textContent = labels[result] || '无法读取扩展状态';
}
document.getElementById('refresh').addEventListener('click', refresh);
void refresh();
