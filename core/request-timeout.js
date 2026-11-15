// Keep the deadline until the body is read, including transports that ignore abort.
export async function withTimeout(work, ms) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
    reject(Object.assign(Error('请求超时'), {name: 'TimeoutError'}));
    controller.abort();
  }, ms); });
  try { return await Promise.race([Promise.resolve().then(() => work(controller.signal)), deadline]); }
  finally { clearTimeout(timer); }
}
