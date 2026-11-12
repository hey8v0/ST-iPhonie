// TT's explicit testCall ABI drives its native RMCP transport. Never fall back
// after a call: outcome_unknown may already have charged the user's credits.
const ENDPOINT = 'https://api.fish.audio/mcp', VERSION = '2025-03-26';
const allowed = new Set(['get_credit_balance', 'text_to_speech']);
const queues = new WeakMap();
export function ttFishResult(value) {
  if (value?.outcome === 'not_sent') throw Error('TT 尚未发送 Fish 请求：' + (value.message || value.code || '未发送') + '。没有自动重试。');
  if (value?.outcome !== 'known_response') throw Error('TT 无法确认 Fish 请求结果，可能已经执行；请先到 Fish 查看记录，不要重复生成。' + (value?.message || ''));
  const r = value.response;
  if (r?.kind !== 'tool_result') throw Error('Fish 已响应，但 TT 未取得可用工具结果：' + (r?.message || r?.kind || '未知格式') + '。没有自动重试。');
  const result = {content: (r.textBlocks || []).map(b => ({type: 'text', text: String(b.text || '')}))};
  if (typeof r.structuredJson === 'string') {
    try { result.structuredContent = JSON.parse(r.structuredJson); }
    catch { throw Error('Fish 已响应，但 TT 返回的结构化结果无法解析；请先查看 Fish 记录，不要重复生成'); }
  }
  if (r.isError) throw Error('Fish 未完成请求：' + (result.content.map(c => c.text).join('\n') || '工具返回错误').slice(0, 1000));
  return result;
}

export class FishTtMcp {
  constructor({win, storage, scope = ''}) {
    this.win = win; this.storage = storage; this.key = 'sttts.fishNative.' + scope;
    this.queue = Promise.resolve(); this.epoch = 0; this.abort = new AbortController(); this.catalog = null;
  }
  enqueue(fn) {
    let tails = queues.get(this.win); if (!tails) { tails = new Map(); queues.set(this.win, tails); }
    const run = () => typeof this.win.navigator?.locks?.request === 'function' ? this.win.navigator.locks.request(this.key, fn) : fn();
    const result = (tails.get(this.key) || Promise.resolve()).then(run), tail = result.catch(() => {});
    tails.set(this.key, tail); tail.finally(() => { if (tails.get(this.key) === tail) tails.delete(this.key); });
    this.queue = tail; return result;
  }
  async api() {
    await this.win.__TAURITAVERN__?.ready;
    const api = this.win.__TAURITAVERN__?.api?.mcp;
    if (!['list','create','update','setState','discover','remove'].every(k => typeof api?.servers?.[k] === 'function') || typeof api?.tools?.testCall !== 'function') throw Error('此 TT 版本没有小手机需要的原生 MCP 接口，请更新 TT；无需重复登录 Fish');
    return api;
  }
  record() {
    const text = this.storage()?.getItem(this.key);
    if (!text) return null;
    let value; try { value = JSON.parse(text); } catch { throw Error('小手机的 TT MCP 连接记录损坏，请先在 TT MCP 管理器检查专用连接'); }
    if (!value?.id || !value?.name) throw Error('小手机的 TT MCP 连接记录不完整');
    return value;
  }
  async owned(api, record) {
    const {servers} = await api.servers.list(), row = servers.find(s => s.id === record.id);
    if (row && (row.displayName !== record.name || row.endpoint !== ENDPOINT)) throw Error('小手机专用 MCP 连接已被修改；为保护现有配置，本次没有改动它，请先在 TT MCP 管理器检查');
    return row;
  }
  async prepare(api, token, check) {
    check(); let record = this.record(), row = record && await this.owned(api, record); const created = !row; check();
    if (!row) {
      const name = 'ST-iPhonie · Fish 订阅 · ' + crypto.randomUUID().slice(0, 8);
      row = await api.servers.create({displayName: name, endpoint: ENDPOINT, headers: {Authorization: 'Bearer ' + token}, protocolVersion: VERSION});
      record = {id: row.id, name};
      try {
        const storage = this.storage(); if (!storage) throw Error('无法保存 TT MCP 连接标识');
        storage.setItem(this.key, JSON.stringify(record));
      } catch (error) { await api.servers.remove(row.id); throw error; }
      this.catalog = null; check();
    }
    // Only our own registration is updated. Refresh tokens never leave the browser.
    if (row.headers?.Authorization !== 'Bearer ' + token || row.protocolVersion !== VERSION) {
      row = await api.servers.update({registrationId: row.id, displayName: record.name, endpoint: ENDPOINT, headers: {...row.headers, Authorization: 'Bearer ' + token}, protocolVersion: VERSION});
      this.catalog = null; check();
    }
    if (row.state !== 'active') {
      if (!created) throw Error('TT 的小手机专用 MCP 连接已暂停，请在 TT MCP 管理器启用后再试');
      await api.servers.setState({registrationId: row.id, state: 'active'}); check();
    }
    if (!this.catalog || this.catalog.token !== token || this.catalog.id !== row.id) {
      const result = await api.servers.discover(row.id); check();
      if (!Array.isArray(result.tools)) throw Error('TT 没有返回 Fish 工具列表');
      this.catalog = {id: row.id, token, tools: result.tools.map(t => ({...t, name: t.nativeName}))};
    }
    return this.catalog;
  }
  operation(token, valid, signal, fn) {
    const epoch = this.epoch, controller = this.abort;
    return this.enqueue(async () => {
      const check = () => { if (epoch !== this.epoch || !valid() || signal?.aborted) throw Error('Fish 请求已取消或账户已切换'); };
      check(); const api = await this.api(); check();
      const catalog = await this.prepare(api, token, check); check();
      return fn(api, catalog, check, controller.signal);
    });
  }
  discover(token, valid) { return this.operation(token, valid, null, async (_api, catalog) => catalog.tools); }
  call(name, args, token, valid, signal) {
    if (!allowed.has(name)) return Promise.reject(Error('小手机只调用 Fish 的积分与配音工具'));
    return this.operation(token, valid, signal, async (api, catalog, check, cancelled) => {
      if (!catalog.tools.some(t => t.name === name)) throw Error('TT 的 Fish 工具列表里没有 ' + name + '；请检查连接权限');
      const abort = new AbortController(), cancel = () => abort.abort();
      cancelled.addEventListener('abort', cancel, {once: true}); signal?.addEventListener('abort', cancel, {once: true});
      const timer = setTimeout(cancel, 120000);
      try {
        check();
        let value;
        try { value = await api.tools.testCall({registrationId: catalog.id, nativeName: name, argumentsJson: JSON.stringify(args)}, {signal: abort.signal}); }
        catch (error) { throw Error('TT 未能确认 Fish 调用结果，可能已经执行；请查看 Fish 记录，不要重复生成。' + (error.message || String(error))); }
        check(); return ttFishResult(value);
      } finally { clearTimeout(timer); cancelled.removeEventListener('abort', cancel); signal?.removeEventListener('abort', cancel); }
    });
  }
  disconnect() {
    this.epoch++; this.abort.abort(); this.abort = new AbortController(); this.catalog = null;
    return this.enqueue(async () => {
      const record = this.record(); if (!record) return;
      const api = await this.api(), row = await this.owned(api, record);
      if (row) {
        // Try removal even if pause/update failed. If removal fails, a successful
        // empty-header update at least removes the credential from this record.
        try { await api.servers.setState({registrationId: row.id, state: 'paused'}); } catch { /* remove below */ }
        try { await api.servers.update({registrationId: row.id, displayName: record.name, endpoint: ENDPOINT, headers: {}, protocolVersion: VERSION}); } catch { /* remove below */ }
        try { await api.servers.remove(row.id); }
        catch { throw Error('Fish 登录已断开，但 TT 专用 MCP 连接未完全清理；请在 TT MCP 管理器删除「' + record.name + '」'); }
      }
      this.storage()?.removeItem(this.key);
    });
  }
}
