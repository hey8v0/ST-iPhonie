import {redactSecrets} from './secrets.js';
// 向量模型: an OpenAI-compatible Embeddings API (POST {base}/embeddings) that turns text into vectors, so 记忆 can find
// old chat by meaning and not only by shared words. Optional: without it, 记忆 searches locally (core/memory.js).
// Called from the browser like 文字模型; its key lives with the other keys (engine 'embed') and never in settings.
import {apiBase} from './llm.js';
import {withTimeout} from './request-timeout.js';

export const EMBED_LIMITS = Object.freeze({batch: 32, timeout: 60000, text: 2000});
export function defaultEmbed() { return {enabled: false, url: '', model: ''}; }
export function normalizeEmbed(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {enabled: v.enabled === true, url: String(v.url || '').trim().slice(0, 500), model: String(v.model || '').trim().slice(0, 200)};
}
/** Ready to use: switched on, with an address and a model (the key is checked by the caller). */
export const embedReady = e => !!(e?.enabled && e.url && e.model);

function failure(status, raw, key) {
  if (/CORS proxy is disabled/i.test(raw)) return Error('酒馆的跨域代理未开启：在 config.yaml 里把 enableCorsProxy 改成 true，然后重启酒馆');
  let detail = '';
  try { const json = JSON.parse(raw); detail = json?.error?.message || json?.message || json?.detail || ''; } catch { detail = String(raw || ''); }
  detail = redactSecrets(detail, [key]).slice(0, 300);
  const reason = {401: '密钥无效或已过期', 403: '这个密钥没有权限', 404: '地址或模型名不对（这个模型要能做 embeddings）', 413: '内容太长', 429: '请求太频繁或额度用完了'}[status] || (status >= 500 ? '服务暂时出错了' : `请求失败（${status}）`);
  return Error(`向量模型：${reason}${detail ? '（' + detail + '）' : ''}`);
}

/** Vectors for the texts, in order. fetch is passed in (tests). Texts go `batch` at a time. */
export async function embedTexts({embed, key, texts, fetch: send = globalThis.fetch}) {
  if (!embed?.model) throw Error('请先在「引擎 → 向量模型」里填写模型名');
  const base = apiBase(String(embed.url || '').trim().replace(/\/+$/, '').replace(/\/embeddings$/i, '')), out = [];
  for (let i = 0; i < texts.length; i += EMBED_LIMITS.batch) {
    const input = texts.slice(i, i + EMBED_LIMITS.batch).map(t => String(t).slice(0, EMBED_LIMITS.text) || ' ');
    let response, raw;
    try {
      await withTimeout(async signal => {
        response = await send(base + '/embeddings', {method: 'POST', signal, headers: {'Content-Type': 'application/json', ...(key ? {Authorization: 'Bearer ' + key} : {})}, body: JSON.stringify({model: embed.model, input})});
        raw = await response.text();
      }, EMBED_LIMITS.timeout);
    } catch (error) {
      throw Error(['AbortError', 'TimeoutError'].includes(error?.name) ? '向量模型：等太久了，接口没有回应' : '向量模型：连不上这个接口。可能是地址写错了，或者这个接口不允许网页直接访问（CORS）');
    }
    if (!response.ok) throw failure(response.status, raw, key);
    let json;
    try { json = JSON.parse(raw); } catch { throw Error('向量模型：接口返回的不是 JSON，地址可能填错了'); }
    const rows = (Array.isArray(json?.data) ? json.data : []).slice().sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
    if (rows.length !== input.length || rows.some(r => !Array.isArray(r?.embedding) || !r.embedding.length || !r.embedding.every(Number.isFinite)))
      throw Error('向量模型：接口没有返回向量，请确认这个模型能做 embeddings');
    // Kept short: four decimals are plenty for similarity and take far less room.
    for (const r of rows) out.push(r.embedding.map(x => Math.round(x * 10000) / 10000));
  }
  return out;
}
