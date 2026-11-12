import {esc, btn, groupTitle} from './common.js';
import {icon} from './icons.js';
const num = n => Number(n).toLocaleString('zh-CN');
export function fishAccountFacts(value) {
  const a = value?.account; if (!a) return '';
  const date = new Date(a.cycleEndsAt), cycle = a.cycleEndsAt && Number.isFinite(date.getTime()) ? date.toLocaleDateString('zh-CN') : '';
  const fields = [['团队',a.team],['套餐',a.plan],['订阅包',a.package == null ? '' : num(a.package)],['额外积分',a.extra == null ? '' : num(a.extra)],['本期结束',cycle]];
  return `<dl class="fish-account-facts">${fields.filter(([,v])=>v!=null&&v!=='').map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}
export function fishAccount(status, credits) {
  const connected = !!status?.connected;
  return groupTitle('订阅账户') + `<section class="group pad fish-account">
    <div class="fish-account-head"><span class="fish-account-icon">${icon('wave')}</span><div><strong>Fish 网页订阅</strong><small>${connected ? status.transport === 'tt-mcp' ? '通过 TT 内置 MCP' : '订阅积分已启用' : '连接后可用订阅积分配音'}</small></div><span class="fish-account-badge${connected ? ' on' : ''}">${connected ? '已连接' : '未连接'}</span></div>
    ${connected ? `<div data-fish-account-facts>${fishAccountFacts(credits?.value)}</div><p class="hint" data-fish-credit-note></p>` : '<p class="hint">在 Fish 官方页面授权并选择团队。配音使用 Drama 3。</p>'}
    <div class="actions">${connected ? btn('fish-refresh',icon('refresh')+'刷新积分','secondary',credits?.loading?'disabled':'')+btn('fish-account-menu','管理连接','text-button') : btn('fish-subscription','连接 Fish 账户','primary')+btn('fish-diagnose','连接诊断','text-button')}</div>
    <details class="fish-account-help"><summary>连接说明</summary><p class="help-copy">${status?.transport === 'tt-mcp' ? '积分和配音通过 TT 内置 MCP 使用。短期访问凭据保存在 TT 专用连接的本地配置中，可能随 TT 数据备份保存；刷新时更新，断开时清理。已有登录可以直接刷新积分，无需重新授权。' : '订阅积分与 API 美元余额分开。连接订阅账户后使用订阅积分；断开后恢复 API 连接。ST 遇到来源拒绝时需要管理员开启酒馆转发。'}授权完成不代表订阅调用一定成功；遇到错误请查看连接诊断。</p></details>
  </section>`;
}
