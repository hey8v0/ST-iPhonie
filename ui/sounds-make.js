// 「ElevenLabs 做一个声音」 (0.9.37), laid out as ElevenLabs' own page: suggestions above the description that rewrite it,
// the description (Chinese too: with 改写 on, the phone's text model writes the English prompt), a bar of settings under
// it (model, loop, length, prompt influence, 改写, how many takes, quality), what it is about to cost and what is left on
// the account. The takes come one by one below; each is heard and kept on its own, and one not kept is gone when the
// sheet shuts. The settings are kept as last used (缺的声音 made by themselves take the model, influence and quality).
import {esc, btn, field, input, select, textArea} from './common.js';
import {icon} from './icons.js';
import {popupSelect, bindPopupSelect} from './popup-select.js';
import {soundName, normalizeSfx, SFX_FORMATS, SFX_LIMITS, sfxEstimate, tierHas} from '../core/sounds.js';

// The suggestions above the box: each has the text model rewrite the description by its hint, in the box's language.
export const SFX_HINTS = Object.freeze([
  ['加上具体细节', '加上发出声音的东西的具体细节：材质、大小、数量、节奏'],
  ['说清楚轻重', '说清楚声音的轻重、远近和快慢'],
  ['加上环境', '加上声音所在的环境和空间：室内还是室外、空间多大、有没有回声'],
]);
const SECONDS = [0, 0.5, 1, 2, 3, 5, 8, 10, 15, 20, 22, 30];
const INFLUENCE = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const TIER_NAMES = {creator: 'Creator', pro: 'Pro'};
const percent = n => Math.round(n * 100) + '%';
const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function sfxMakeSheet(ctx, {type = 'sfx', name = '', describe = '', onClose = () => {}} = {}) {
  const {api} = ctx;
  let o = normalizeSfx(api.getState().sounds?.make);
  // An ambience loops (and is never WAV); one asked for with no length gets the 22 seconds ambiences had.
  if (type === 'ambience') o = normalizeSfx({...o, loop: true, seconds: o.seconds || 22, format: o.format === 'wav' ? 'mp3' : o.format});
  let tier = '', left = null, working = false, takes = [], english = '', spent = null;
  const d = ctx.dialog('ElevenLabs 做一个声音', `<div class="sfx-make">
      <div class="sfx-head">${field('名字', input('name', name, 'text', 'maxlength="20" placeholder="比如：敲门"'))}${field('种类', select('type', type, [['sfx', '音效'], ['ambience', '氛围音']]))}</div>
      <div class="sfx-hints" role="group" aria-label="改写描述">${SFX_HINTS.map(([label], i) => `<button type="button" class="sfx-hint" data-action="sfx-hint" data-i="${i}">✦ ${esc(label)}</button>`).join('')}</div>
      ${textArea('describe', describe, `rows="3" maxlength="${SFX_LIMITS.text}" class="sfx-text" placeholder="比如：雨轻轻打在玻璃窗上，中等强度"`).replace('aria-label="describe"', 'aria-label="描述"')}
      <div class="sfx-bar" data-sfx-bar></div>
      <div class="sfx-foot"><small data-sfx-cost></small>${btn('sfx-make', icon('send') + '生成', 'primary')}</div>
      <p class="hint" data-sfx-status role="status"></p>
      <div class="sfx-takes" data-sfx-takes></div></div>`);
  const $ = s => d.body.querySelector(s);
  const value = key => $(`[data-field="${key}"]`)?.value ?? '';
  const status = text => { const el = $('[data-sfx-status]'); if (el) el.textContent = text; };
  const save = () => { try { api.saveSounds?.({make: o}); } catch { /* kept for this sheet only */ } };

  // ---------- The bar ----------
  const chip = (key, glyph, choices, label) => `<span class="sfx-chip">${icon(glyph)}${popupSelect(key, String(o[key]), choices, label)}</span>`;
  const toggleChip = (action, glyph, on, text, label, disabled = false) => `<button type="button" class="sfx-chip sfx-toggle" data-action="${action}" aria-pressed="${on}" aria-label="${esc(label)}"${disabled ? ' disabled' : ''}>${icon(glyph)}<span>${esc(text)}</span></button>`;
  function paintBar() {
    // A quality the plan does not have is greyed out (ElevenLabs would refuse it).
    const formats = Object.entries(SFX_FORMATS).map(([k, f]) => [k, f.label + (tierHas(tier, f.tier) ? '' : `（要 ${TIER_NAMES[f.tier]} 以上）`) + (f.noLoop ? ' · 不能循环' : ''), !tierHas(tier, f.tier)]);
    $('[data-sfx-bar]').innerHTML = chip('model', 'volume', [['v3', 'v3'], ['v2', 'v2（旧，2027 年 3 月下线）']], '模型')
      + toggleChip('sfx-loop', 'repeat', o.loop, o.loop ? '循环' : '不循环', '循环', SFX_FORMATS[o.format].noLoop)
      + chip('seconds', 'clock', SECONDS.map(s => [String(s), s ? s + ' 秒' : '自动']), '时长')
      + chip('influence', 'sliders', INFLUENCE.map(n => [String(n), percent(n)]), '提示词影响力')
      + toggleChip('sfx-rewrite', 'wand', o.rewrite, o.rewrite ? '改写' : '不改写', '改写成英文提示词')
      + chip('count', 'layers', [1, 2, 3, 4].map(n => [String(n), '×' + n]), '一次做几个')
      + chip('format', 'music', formats, '音质');
    paintCost();
  }
  function paintCost() {
    const about = sfxEstimate(o), el = $('[data-sfx-cost]');
    if (!el) return;
    el.textContent = [about ? `大约 ${about} 额度` : '自动时长：按做出来的长度算', spent != null ? `这次用了 ${spent}` : '', left != null ? `还剩 ${left}` : ''].filter(Boolean).join(' · ');
  }
  const picker = bindPopupSelect(d.body, (key, picked) => {
    if (key === 'format' && !tierHas(tier, SFX_FORMATS[picked]?.tier)) { ctx.notify(`${SFX_FORMATS[picked].label} 要 ElevenLabs 的 ${TIER_NAMES[SFX_FORMATS[picked].tier]} 档以上`); return paintBar(); }
    if (key === 'model' && picked === 'v2') ctx.notify('v2 是旧模型，ElevenLabs 2027 年 3 月 1 日停用');
    o = normalizeSfx({...o, [key]: key === 'model' || key === 'format' ? picked : Number(picked)});
    if (key === 'format' && SFX_FORMATS[o.format].noLoop && value('type') === 'ambience') ctx.notify('WAV 不能做循环：氛围音这次不循环');
    save(); paintBar();
  });
  d.onClose(() => { picker.dispose(); takes = []; onClose(); });

  // ---------- The takes ----------
  function paintTakes() {
    const box = $('[data-sfx-takes]');
    if (!box) return;
    box.innerHTML = takes.length ? `<div class="sfx-takes-head"><strong>做好的版本</strong>${english ? `<small>用的英文：${esc(english)}</small>` : ''}</div>`
      + takes.map((t, i) => `<div class="sfx-take${t.kept ? ' kept' : ''}"><button type="button" class="disc play" data-action="sfx-play" data-i="${i}" aria-label="试听版本 ${i + 1}">${icon('play')}</button>
        <span><strong>版本 ${i + 1}</strong><small>${[t.seconds ? clock(t.seconds) : '', t.cost != null ? `用了 ${t.cost} 额度` : ''].filter(Boolean).join(' · ') || '可以试听'}</small></span>
        ${t.kept ? `<span class="sfx-kept">${icon('check')}已留下</span>` : btn('sfx-keep', '留下', 'secondary small', `data-i="${i}"`)}</div>`).join('') : '';
  }
  // How long a take is, read from the file itself (the page's own audio element, nothing played).
  function measure(take) {
    try {
      const url = ctx.win.URL.createObjectURL(take.blob), el = new ctx.win.Audio();
      const done = () => { ctx.win.URL.revokeObjectURL(url); el.removeAttribute('src'); };
      el.preload = 'metadata';
      el.addEventListener('loadedmetadata', () => { if (Number.isFinite(el.duration)) { take.seconds = el.duration; paintTakes(); } done(); }, {once: true});
      el.addEventListener('error', done, {once: true});
      el.src = url;
    } catch { /* the length is left out */ }
  }

  async function make(button) {
    if (working) return;
    const words = value('describe').trim();
    if (!words) throw Error('先写一句描述');
    if (!api.keyStatus?.('eleven')) throw Error('要先在引擎 App 里填 ElevenLabs 的密钥，才能生成音效');
    working = true; button.disabled = true;
    const before = left;
    try {
      english = words;
      if (o.rewrite) { status('正在用文字模型写英文提示词……'); english = await api.soundPrompt({text: words, mode: 'english'}); }
      else if (!/[a-z]/i.test(words)) throw Error('关着「改写」时要写英文描述；或者打开「改写」，让小手机的文字模型翻成英文');
      const loop = o.loop && !SFX_FORMATS[o.format].noLoop;
      let costs = 0, known = true;
      for (let i = 0; i < o.count && d.live; i++) {
        status(o.count > 1 ? `正在做第 ${i + 1} 个（共 ${o.count} 个）……` : '正在生成……');
        const take = await api.makeSoundTake({text: english, model: o.model, loop, seconds: o.seconds, influence: o.influence, format: o.format});
        if (!d.live) break;
        takes.push({...take, kept: false});
        if (take.cost == null) known = false; else costs += take.cost;
        measure(takes.at(-1)); paintTakes();
      }
      status('');
      // What it cost: from ElevenLabs' answers, else what the account says now against before.
      if (known && takes.length) spent = costs;
      const now = await api.voiceBalance?.('eleven', true).catch(() => null);
      if (now?.left != null) { left = now.left; if (!known && before != null) spent = Math.max(0, before - now.left); }
      paintCost();
    } finally { working = false; if (button.isConnected) button.disabled = false; status(''); }
  }
  async function keep(i, button) {
    const take = takes[i], n = soundName(value('name'));
    if (!take || take.kept) return;
    if (!n) throw Error('给声音起个名字（剧情里写的就是这个名字）');
    button.disabled = true;
    try {
      await api.keepSoundTake({name: n, type: value('type'), describe: english, blob: take.blob});
      take.kept = true; paintTakes();
      ctx.notify(`「${n}」多了一个版本`);
    } finally { if (button.isConnected) button.disabled = false; }
  }

  d.body.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || !d.body.contains(b) || b.matches('[data-popup-select]')) return;
    e.preventDefault();
    const i = Number(b.dataset.i);
    (async () => {
      switch (b.dataset.action) {
        case 'sfx-loop': if (!SFX_FORMATS[o.format].noLoop) { o = normalizeSfx({...o, loop: !o.loop}); save(); paintBar(); } break;
        case 'sfx-rewrite': o = normalizeSfx({...o, rewrite: !o.rewrite}); save(); paintBar(); break;
        case 'sfx-hint': {
          const words = value('describe').trim();
          if (!words) throw Error('先写一句描述，再点建议');
          if (working) return;
          working = true; d.body.querySelectorAll('.sfx-hint').forEach(x => { x.disabled = true; });
          status('正在改写描述……');
          try { const next = await api.soundPrompt({text: words, mode: 'apply', hint: SFX_HINTS[i][1]}); const box = $('[data-field="describe"]'); if (box && d.live) box.value = next; }
          finally { working = false; d.body.querySelectorAll('.sfx-hint').forEach(x => { x.disabled = false; }); status(''); }
          break;
        }
        case 'sfx-make': await make(b); break;
        case 'sfx-play': { const on = await api.soundTakeListen?.(`take:${i}`, takes[i]?.blob); if (on === undefined) ctx.notify('在酒馆里打开小手机才能试听'); break; }
        case 'sfx-keep': await keep(i, b); break;
      }
    })().catch(error => { status(''); ctx.notify(error.message, {error: true}); });
  });
  d.body.addEventListener('change', e => {
    if (e.target.dataset.field !== 'type') return;
    // 氛围音 loops (22 seconds unless a length was picked); 音效 does not.
    o = e.target.value === 'ambience' ? normalizeSfx({...o, loop: true, seconds: o.seconds || 22, format: o.format === 'wav' ? 'mp3' : o.format}) : normalizeSfx({...o, loop: false});
    save(); paintBar();
  });
  paintBar();
  // The plan (which qualities it allows) and what is left, from ElevenLabs.
  api.voiceBalance?.('eleven').then(b => { if (!b || !d.live) return; tier = b.tier || ''; left = b.left ?? null; paintBar(); }).catch(() => {});
  return d;
}
