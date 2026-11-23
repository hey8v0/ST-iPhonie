import {btn, esc, input, menu} from './common.js';
import {icon} from './icons.js';

// A text field for arbitrary model IDs and a separate phone-styled model picker.
// Unlike <datalist>, opening the picker NEVER filters by the field's value.
export function voiceModelControl(value, {follow = '', refresh = false} = {}) {
  const placeholder = follow ? `placeholder="跟随引擎 · ${esc(follow)}"` : '';
  return `<div class="music-selfhost voice-model-combo">${input('model', value, 'text', `${placeholder} autocomplete="off" autocapitalize="off" spellcheck="false"`)}${btn('choose-voice-model', icon('down'), 'chip-button', 'aria-label="展开全部语音模型" aria-haspopup="dialog"')}${refresh ? btn('voice-model-refresh', icon('refresh') + '读取', 'secondary small') : ''}</div>`;
}

export const FOLLOW_MODEL = '__follow_engine__';

/** Build the WHOLE menu, not only models resembling the current selection. */
export function voiceModelChoices(models, selected = '', followLabel = '') {
  const rows = [], seen = new Set();
  if (followLabel) rows.push({key: FOLLOW_MODEL, icon: selected ? 'next' : 'check', label: followLabel});
  for (const model of models || []) {
    const id = String(model?.id || '');
    if (!id || seen.has(id) || model?.supported === false) continue;
    seen.add(id);
    const name = String(model?.name || id);
    rows.push({key: id, icon: selected === id ? 'check' : 'next', label: id,
      ...(name !== id ? {note: name} : {})});
  }
  if (selected && !seen.has(selected))
    rows.push({key: selected, icon: 'check', label: selected, note: '当前手动填写的模型'});
  return rows;
}

/** Returns null on cancel, '' for follow-engine, or a selected model ID. */
export async function chooseVoiceModel(ctx, models, selected = '', followLabel = '') {
  const choice = await menu(ctx, '选择语音模型', voiceModelChoices(models, selected, followLabel));
  return choice === FOLLOW_MODEL ? '' : choice;
}
