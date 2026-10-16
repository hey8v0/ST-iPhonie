import {PROMPT_RULES} from './prompt-rule-defaults.js';
export {PROMPT_RULES};
const defaults = new Map(PROMPT_RULES.map(rule => [rule.id, rule]));
export function normalizePromptRules(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, rule]) => defaults.has(id) && rule && typeof rule === 'object' && typeof rule.text === 'string')
    .map(([id, rule]) => [id, {enabled: rule.enabled !== false, text: rule.text.slice(0, 20000)}]));
}
export function promptRule(overrides, id, values = {}) {
  const base = defaults.get(id); if (!base) throw Error('未知提示词规则：' + id);
  const rule = overrides?.[id]; if (rule?.enabled === false) return '';
  const text = typeof rule?.text === 'string' ? rule.text : base.text;
  return text.replace(/\{\{([^{}]+)\}\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name] ?? '') : match);
}
