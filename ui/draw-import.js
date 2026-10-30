// 读图: a picture brought into the drawing app. With what NovelAI drew it with inside, choose what to take from it
// (as its own app lets you); whatever the picture, it can also go on as a base, a vibe or a reference.
import {esc, btn, help} from './common.js';
import {icon} from './icons.js';

/** 去掉权重括号, as NovelAI's app does it. */
export const cleanBrackets = text => String(text).replace(/[[\]{}]/g, '').replace(/,(?=[^ ])/g, ', ').replace(/ ,/g, ',');

const row = (key, label, on, locked, note = '') => `<label class="setting-row import-row${locked ? ' locked' : ''}"><span>${esc(label)}${locked ? `<small>${icon('lock')}已锁定</small>` : note ? `<small>${esc(note)}</small>` : ''}</span><input class="switch" type="checkbox" data-import="${key}" aria-label="${esc(label)}"${on && !locked ? ' checked' : ''}${locked ? ' disabled' : ''}></label>`;
const how = (key, value, words) => `<div class="segmented import-how" role="group" aria-label="读进来的放哪">${words.map(([k, l]) => `<button type="button" data-how="${key}" data-value="${k}" aria-pressed="${value === k}">${l}</button>`).join('')}</div>`;

/**
 * file: the picture. found: readNovelAI's answer or null. carried: it has vibes inside as a file (naidata). locks: what
 * is locked. take(choice): the settings to read; use(kind): 'base' | 'vibe' | 'ref'; either may fail with a message.
 */
export function pictureSheet({ctx, file, found, carried = false, locks = [], take, use}) {
  const url = ctx.win.URL.createObjectURL(file), locked = key => locks.includes(key);
  const vibeCount = found?.vibes?.length || 0, people = found?.characters?.length || 0;
  const choice = {prompt: !!found, negative: !!found, characters: people > 0, addCharacters: false, vibes: vibeCount > 0, addVibes: false, settings: !!found, seed: Number.isInteger(found?.params?.seed), actual: false, clean: false};
  const d = ctx.dialog('读图', '');
  d.onClose(() => ctx.win.URL.revokeObjectURL(url));
  function draw() {
    const read = found ? `<div class="group">
        ${row('prompt', '提示词', choice.prompt, locked('prompt'))}${row('negative', '负面', choice.negative, locked('negative'))}
        ${people ? row('characters', `角色 · ${people} 个`, choice.characters, locked('characters')) + (choice.characters && !locked('characters') ? how('addCharacters', String(choice.addCharacters), [['false', '替换现在的'], ['true', '加在后面']]) : '') : ''}
        ${vibeCount ? row('vibes', `Vibe · ${vibeCount} 个`, choice.vibes, locked('vibes')) + (choice.vibes && !locked('vibes') ? how('addVibes', String(choice.addVibes), [['false', '用这些'], ['true', '加进在用的组']]) : '') : ''}
        ${row('settings', '参数', choice.settings, false, '模型、尺寸、步数、Scale、采样器…')}
        ${Number.isInteger(found.params?.seed) ? row('seed', `种子 · ${found.params.seed}`, choice.seed, locked('seed')) : ''}
      </div>
      <div class="group">
        ${found.actual ? row('actual', '用实际抽中的词', choice.actual, false, '提示词里的 ||a|b|| 换成这张图抽到的') : ''}
        ${row('clean', '去掉权重括号', choice.clean, false)}
      </div>
      <div class="actions">${btn('import-read', icon('import') + '读进来', 'primary')}</div>` : `<p class="hint" data-keep-hint>这张图里没有 NovelAI 的参数${help('被压缩或转存过的图会丢掉它们。')}</p>`;
    const carriedRow = carried ? `<p class="hint" data-keep-hint>${icon('layers')}这张图里嵌着 Vibe，点「当 Vibe」就能读出来。</p>` : '';
    d.body.innerHTML = `<div class="import-picture"><img src="${esc(url)}" alt=""></div>${read}${carriedRow}
      <div class="actions import-uses">${btn('import-base', icon('image') + '当底图', 'secondary')}${btn('import-vibe', icon('layers') + '当 Vibe', 'secondary')}${btn('import-ref', icon('person') + '当参考', 'secondary')}</div>`;
  }
  draw();
  d.body.addEventListener('change', e => {
    const key = e.target.dataset?.import;
    if (key) { choice[key] = e.target.checked; draw(); }
  });
  d.body.addEventListener('click', async e => {
    const pick = e.target.closest('[data-how]');
    if (pick) { choice[pick.dataset.how] = pick.dataset.value === 'true'; draw(); return; }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    try {
      if (action === 'import-read') { d.close(); await take(choice); }
      else if (action === 'import-base' || action === 'import-vibe' || action === 'import-ref') { d.close(); await use(action.slice(7)); }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  });
  return d;
}
