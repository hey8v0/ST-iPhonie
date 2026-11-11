const params = new URLSearchParams(location.search);
history.replaceState(null, '', location.pathname);
if (window.opener) {
  window.opener.postMessage({type: 'st-iphonie-fish-oauth', code: params.get('code'), state: params.get('state'), iss: params.get('iss'), error: params.get('error')}, location.origin);
  document.getElementById('message').textContent = '登录结果已送回酒馆，可以关闭此页。';
} else document.getElementById('message').textContent = '请返回酒馆，从 Fish 引擎的菜单重新连接账户。';
