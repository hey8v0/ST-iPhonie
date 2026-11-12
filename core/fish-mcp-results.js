// Read only explicit credit balances. Never mistake a plan limit, text limit, date or price for credits left.
const number = value => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\s*\d+(?:,\d{3})*(?:\.\d+)?\s*$/.test(value)) return null;
  const n = Number(typeof value === 'string' ? value.replace(/,/g, '') : value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export function fishCreditBalance(result) {
  const texts = (Array.isArray(result?.content) ? result.content : []).filter(c => c.type === 'text' && typeof c.text === 'string').map(c => c.text);
  const values = [result?.structuredContent];
  for (const text of texts) { try { values.push(JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))); } catch { /* plain text is checked by its label below */ } }
  const read = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 4) return null;
    // Fish get_credit_balance returns the plan package and extra package separately.
    // api_credit_usd in the same object is a different wallet, never subscription credits.
    if (Object.hasOwn(value, 'package_balance')) {
      const base = number(value.package_balance), extra = Object.hasOwn(value, 'package_extra_balance') ? number(value.package_extra_balance) : 0;
      return base !== null && extra !== null && Number.isFinite(base + extra) ? base + extra : null;
    }
    for (const key of ['remaining_credits', 'remainingCredits', 'credits_remaining', 'available_credits', 'availableCredits', 'credit_balance', 'creditBalance', 'credits', 'balance']) {
      const n = number(value[key]); if (n !== null) return n;
    }
    for (const key of ['credits', 'credit_balance', 'creditBalance', 'balance']) {
      const nested = value[key];
      if (nested && typeof nested === 'object') for (const field of ['remaining', 'available', 'balance']) {
        const n = number(nested[field]); if (n !== null) return n;
      }
    }
    for (const key of ['data', 'result', 'account', 'subscription']) { const n = read(value[key], depth + 1); if (n !== null) return n; }
    return null;
  };
  let remaining = null;
  for (const value of values) { remaining = read(value); if (remaining !== null) break; }
  if (remaining === null) for (const text of texts) {
    const clean = text.replace(/[*_`]/g, '');
    const match = /(?:remaining\s+credits|credits\s+(?:remaining|balance)|credit\s+balance|剩余积分|可用积分)\s*[:：=]\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i.exec(clean)
      || /\b(\d+(?:,\d{3})*(?:\.\d+)?)\s+credits?\s+(?:remaining|available)\b/i.exec(clean);
    if (match) { remaining = number(match[1]); break; }
  }
  const detail = texts.join('\n') || (result?.structuredContent ? JSON.stringify(result.structuredContent) : '服务没有返回积分明细');
  return {remaining, detail: detail.slice(0, 12000)};
}

export function fishSafeText(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of secrets.filter(s => typeof s === 'string' && s.length >= 4)) text = text.split(secret).join('[已隐藏]');
  return text.replace(/\bBearer\s+[^\s"',}]+/gi, 'Bearer [已隐藏]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[已隐藏]')
    .replace(/((?:access_token|refresh_token|code_verifier|authorization|api[-_]?key)\s*[=:]\s*)[^\s,;}]+/gi, '$1[已隐藏]');
}
export function fishMcpStep(method, tool) {
  if (method === 'initialize') return '连接订阅接口';
  if (method === 'notifications/initialized') return '完成订阅握手';
  if (method === 'tools/list') return '读取订阅工具';
  if (tool === 'get_credit_balance') return '读取订阅积分';
  if (tool === 'text_to_speech') return '订阅配音';
  return '订阅请求';
}
/** Keep the upstream reason and stage, but never echo login credentials into toasts, diagnostics or logs. */
export async function fishMcpHttpError(response, {method, tool, secrets = []} = {}) {
  let text = ''; try { text = (await response.text()).slice(0, 4000); } catch { /* status is still useful */ }
  let said = text.trim(), code = '';
  try {
    const json = JSON.parse(text), detail = json.error ?? json.detail ?? json;
    code = typeof detail === 'object' ? String(detail?.code || detail?.type || '') : typeof json.error === 'string' ? json.error : String(json.code || '');
    said = typeof detail === 'string' ? json.error_description || json.message || detail : Array.isArray(detail) ? detail.map(d => d.msg || d.message || '').filter(Boolean).join('；') : detail?.message || detail?.error_description || json.error_description || json.message || code;
  } catch { if (/<(?:!doctype|html|body)\b/i.test(said)) said = /cloudflare|challenge/i.test(said) ? '服务返回了网页验证页面' : '服务返回了错误网页'; }
  said = fishSafeText(said, secrets).replace(/\s+/g, ' ').slice(0, 260);
  code = fishSafeText(code, secrets).slice(0, 80);
  const status = Number(response.status), why = `${code} ${said}`;
  const reason = /(?:invalid|untrusted|disallowed).?origin|origin.{0,60}(?:not allowed|forbidden|invalid|not permitted)/i.test(why)
    ? '服务拒绝了当前网页来源；这不是积分不足，重复登录通常不能解决'
    : /insufficient_scope|missing.scope/i.test(why) ? '这次授权缺少订阅接口权限，需要重新授权'
    : /(?:invalid|expired|revoked).?token|token.{0,20}(?:expired|revoked)/i.test(why) || status === 401 ? '登录凭据失效或没有通过验证，请重新连接订阅账户'
    : /insufficient.credits|quota.exceeded/i.test(why) || status === 402 ? '当前团队的订阅积分不足'
    : status === 403 ? '服务拒绝访问；可能与账户、所选团队或请求来源有关，不能仅凭 403 判断'
    : status === 429 ? '请求过于频繁，请稍后再试'
    : status >= 500 ? 'Fish 服务暂时出错，请稍后再试' : '服务没有接受这次请求';
  const step = fishMcpStep(method, tool);
  return Object.assign(Error(`Fish ${step}失败（${status}）：${reason}${said ? `。服务说明：${said}` : ''}。没有自动重试，也不会改用 API 余额。`), {status, code, step, detail: said});
}

/** OAuth failures happen before MCP, and are not all expired logins. */
export async function fishOAuthHttpError(response, {step = '连接账户', secrets = []} = {}) {
  const error = await fishMcpHttpError(response, {secrets});
  const why = /invalid_redirect_uri|https required|redirect.uri/i.test(error.code + ' ' + error.detail)
    ? 'Fish 不接受当前回调地址；重复登录或发送验证码不能解决'
    : error.status === 429 ? '请求过于频繁，请稍后再试'
    : /invalid_grant/i.test(error.code + ' ' + error.detail) ? '本次授权码无效、已用过或已过期，请发起一次新的授权'
    : '服务未接受本次请求';
  error.step = step;
  error.message = `Fish ${step}失败（${error.status}）：${why}${error.detail ? '。服务说明：' + error.detail : ''}`;
  return error;
}
