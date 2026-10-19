// Bounded, session-only diagnostics. Never persist keys or binary payloads in a log or backup.
const SECRET = /authorization|cookie|password|secret|api[-_]?key|access[-_]?token|csrf|^key$|^token$/i;
const MAX_TEXT = 100000, MAX_TOTAL = 4000000;
export class RequestLog {
  constructor({change = () => {}, secrets = () => []} = {}) { this.rows = []; this.total = 0; this.change = change; this.secrets = secrets; }
  clean(value) {
    let secrets = []; try { secrets = this.secrets() || []; } catch { /* key storage may be unavailable */ }
    const keys = [...new Set(secrets.filter(x => typeof x === 'string' && x.length >= 4))];
    let remaining = 300000, nodes = 3000;
    const scrub = text => {
      let s = String(text).replace(/\bBearer\s+[^\s"',}]+/gi, 'Bearer [已隐藏]').replace(/([?&](?:key|api_key|token|access_token)=)[^&#\s]+/gi, '$1[已隐藏]');
      for (const key of keys) s = s.split(key).join('[已隐藏]').split(encodeURIComponent(key)).join('[已隐藏]');
      const limit = Math.min(MAX_TEXT, remaining); remaining -= Math.min(s.length, limit);
      return s.length > limit ? s.slice(0, limit) + '\n[内容过长，已截断]' : s;
    };
    const seen = new WeakSet();
    const visit = (v, key = '', depth = 0) => {
      if (--nodes < 0 || remaining <= 0) return '[日志大小已达上限]';
      if (SECRET.test(key)) return '[已隐藏]';
      if (depth > 12) return '[层级过深]';
      if (typeof v === 'function' || typeof v === 'symbol') return '[不可序列化的值]';
      if (typeof v === 'bigint') return String(v);
      if (typeof v === 'string') return /^data:.*;base64,/i.test(v) || (v.length > 2000 && /^[A-Za-z0-9+/=\r\n]+$/.test(v)) ? `[二进制编码，${v.length} 字符]` : scrub(v);
      if (v === null || typeof v !== 'object') return v;
      if (typeof v.arrayBuffer === 'function') return {type: v.type || 'binary', bytes: v.size ?? v.byteLength};
      if (v instanceof Error) return {name: v.name, message: scrub(v.message), stack: scrub(v.stack || '')};
      if (seen.has(v)) return '[循环引用]'; seen.add(v);
      if (Array.isArray(v)) return v.slice(0, 500).map(x => visit(x, '', depth + 1));
      return Object.fromEntries(Object.entries(v).slice(0, 500).map(([k, x]) => [k, visit(x, k, depth + 1)]));
    };
    return visit(value);
  }
  add(source, request, level = 'info') {
    const row = {id: crypto.randomUUID(), at: Date.now(), source, level, state: 'pending', request: this.clean(request)};
    this.rows.push(row); this.measure(row); this.trim(); this.change(); return row.id;
  }
  finish(id, response, error = false) {
    const row = this.rows.find(r => r.id === id); if (!row) return;
    Object.assign(row, {state: error ? 'failed' : 'done', duration: Date.now() - row.at, response: this.clean(response)});
    if (error) row.level = response?.name === 'AbortError' ? 'warn' : 'error';
    this.measure(row); this.trim(); this.change();
  }
  /** How big a row is, worked out when it changes (not the whole log on every change). */
  measure(row) { const size = JSON.stringify(row).length; this.total += size - (this.sizes?.get(row) || 0); (this.sizes ??= new WeakMap()).set(row, size); }
  trim() { while (this.rows.length > 200 || this.rows.length > 1 && this.total > MAX_TOTAL) { const old = this.rows.shift(); this.total -= this.sizes?.get(old) || 0; } }
  list() { return structuredClone(this.rows); }
  clear() { this.rows = []; this.total = 0; this.sizes = new WeakMap(); this.change(); }
  async run(source, request, fn) {
    const id = this.add(source, request);
    try { const result = await fn(); this.finish(id, result); return result; }
    catch (error) { this.finish(id, error, true); throw error; }
  }
  fetch(send, source) {
    return async (url, init = {}) => {
      let body = init.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
      if (typeof FormData !== 'undefined' && body instanceof FormData) body = Object.fromEntries(body.entries());
      const headers = typeof Headers !== 'undefined' ? Object.fromEntries(new Headers(init.headers).entries()) : init.headers;
      const id = this.add(source, {url: String(url), method: init.method || 'GET', headers, body});
      try {
        const response = await send(url, init), type = response.headers?.get('content-type') || '';
        this.finish(id, {status: response.status, type, bytes: response.headers?.get('content-length') || undefined}, !response.ok);
        // Observe what the caller actually consumes. Cloning/teeing adds an unrequested reader that can
        // retain an unread or cancelled response indefinitely. SSE is recorded after assembly by the caller.
        if (!/event-stream/i.test(type)) for (const method of ['json', 'text']) {
          if (typeof response[method] !== 'function') continue;
          const read = response[method].bind(response);
          try { Object.defineProperty(response, method, {configurable: true, value: async (...args) => {
            const result = await read(...args);
            let data = result;
            if (method === 'text') try { data = JSON.parse(result); } catch {}
            this.finish(id, {status: response.status, body: data}, !response.ok);
            return result;
          }}); } catch { /* frozen custom transports retain status-only logs */ }
        }
        return response;
      } catch (error) { this.finish(id, error, true); throw error; }
    };
  }
}
