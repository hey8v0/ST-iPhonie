import {createView, esc, btn, field, input, select, textArea, toggle, heading, size, languageField, typedLanguages, groupTitle, help, copyText} from './common.js';
import {buildReport} from '../core/diagnostics.js';
import {saveFile} from '../download.js';
import {browserSpeech, cleanSkip, cleanBody, NARRATION_RATES, NARRATOR} from '../core/narration.js';
import {icon, GLYPH_NAMES} from './icons.js';
import {APPS} from './apps.js';
import {wallpapers, skins} from './wallpapers.js';

const MARKS = {ok: '✓', warn: '!', error: '✕', info: '·'};
const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/avif,image/gif';

export function settingsApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'settings');
  const narrationNote = s => !s.narration.enabled ? '关 · 只读台词' : s.narration.voice === 'role' ? '开 · 旁白用「旁白」角色的配音' : '开 · 旁白用系统朗读';
  /**
   * 整篇朗读: 播放全部 reads the story between the lines too, in the 旁白's voice — the system's (free, not kept) or the
   * 旁白 role's in the 角色 App (an engine's: costs its characters, kept). Tags listed are read past, lines in them too.
   */
  /**
   * 正文联动手机: what happens on the phone in the story (messages, photos, money, presents, songs, calls, 朋友圈, group
   * messages) really arrives on the phone. Written by the story model at the end of its reply, or — with 回复后单独配音
   * or 配图 — in that request. Besides, every so many replies someone may text first (a request of its own).
   */
  function storyPhoneSheet() {
    const d = ctx.dialog('正文联动手机', '');
    const paint = () => {
      if (!d.live) return;
      const s = api.getState(), o = s.chat.proactive, after = (s.general.voiceEnabled !== false && s.general.voiceMode === 'separate') || (s.draw.enabled && s.draw.mode === 'separate');
      d.body.innerHTML = `<div class="group pad">${toggle('p-on', '正文里的事发到手机', o.on, '打开后，正文里有人用手机联系你——发消息、发照片、转账、发红包、送礼物、分享歌曲、打电话，或者发了朋友圈、在群里说话——这些事会真的出现在小手机上：消息进聊天，电话会响，动态进朋友圈。正文里只留一行「📱 谁给你发了消息」。\n\n照片：能出图时会画出来；没开出图就是一张文字照片，写着拍到了什么，以后也能点「画出来」。\n\n只有角色 App 里的角色和手机里的联系人能发；群消息只发到已经有的群。什么时候发、怎么发，在预设 App 的聊天预设里改「正文里主动发消息」这条规则（用在「正文」）。')}
        ${o.on ? `<p class="hint">${after ? '现在开着「回复后单独配音 / 配图」：手机上的事在那次请求里一起写，正文请求不变，也不多花一次请求。' : '正文模型写回复时顺手写在最后，不多花一次请求。开了「回复后单独配音 / 配图」的话，会改成在那次请求里一起写。'}</p>` : ''}
        <div class="field"><span>每几条正文，手机这边来找你一次${help('0：每条正文都可以顺手用手机联系你，发不发由正文自己决定。设成几：每隔这么多条正文才有一次机会——这一条正文可以顺手发；没发的话，再单独问一个角色（优先是当前卡的角色）这时会不会主动找你，问一次用文字模型请求一次，TA 觉得没理由就不发。其余几条正文不会被告知可以用手机，所以不会每轮都来消息（手动加的联系人也一样）。什么时候会发由聊天预设里「正文里主动发消息」这条规则决定。')}</span><input data-field="p-every" type="number" min="0" max="100" value="${o.every}" ${o.on ? '' : 'disabled'}></div>
        <div class="field"><span>手机这边来找你，每天最多${help('填 0 是不限。正文里发来的和单独问出来的都算，只算真的发来的，TA 决定不发的那次不算。到了上限，今天的正文就不再被告知可以用手机。')}</span><input data-field="p-dailyMax" type="number" min="0" max="99" value="${o.dailyMax}" ${o.on ? '' : 'disabled'}></div></div>`;
    };
    paint();
    d.onClose(() => render());
    d.body.addEventListener('change', e => {
      const key = e.target.dataset.field?.replace(/^p-/, '');
      if (!key) return;
      try { api.saveChatOptions({proactive: {[key]: key === 'on' ? e.target.checked : Number(e.target.value)}}); } catch (error) { ctx.notify(error.message, {error: true}); }
      paint();
    });
  }
  function narrationSheet() {
    const speech = browserSpeech(ctx.win);
    const d = ctx.dialog('整篇朗读', '');
    const paint = () => {
      if (!d.live) return;
      const n = api.getState().narration, role = api.getState().routes.find(r => r.name === NARRATOR), voices = speech?.voices() || [];
      const chinese = voices.filter(x => /^(zh|cmn)/i.test(x.lang)), others = voices.filter(x => !/^(zh|cmn)/i.test(x.lang));
      d.body.innerHTML = `<div class="group pad">${toggle('nar-enabled', '整篇朗读', n.enabled, '点「整条」或「播放全部」时，台词之间的叙述也读出来：叙述用旁白的声音，台词还是各个角色的声音。单独点一句台词时只读那一句。\n\n叙述就是回复里台词以外的文字，不用再请求模型，不花模型的 token。')}
        <div class="field"><span>旁白的声音${help('系统朗读：用手机或电脑自带的声音，免费，不花配音额度；声音好不好听看设备（Edge、苹果设备上比较自然）。直接读出来，不能缓存，也不能下载。\n\n配音引擎：在角色 App 里给一个叫「旁白」的角色选音色，和别的角色一样用 Fish 等引擎生成，按字数花配音额度（叙述往往比台词长好几倍）；生成过的会缓存，可以下载。')}</span>
          <div class="segmented" style="margin:0">${[['system', '系统朗读'], ['role', '配音引擎']].map(([k, l]) => `<button type="button" data-nar-voice="${k}" aria-pressed="${n.voice === k}">${l}</button>`).join('')}</div></div>
        ${n.voice === 'system' ? (speech ? `${field('声音', select('nar-system', n.systemVoice, [['', '自动（中文的第一个）'], ...chinese.map(x => [x.id, x.name]), ...others.map(x => [x.id, `${x.name}（${x.lang}）`])]))}
          ${field('语速', select('nar-rate', n.rate, NARRATION_RATES.map(r => [r, r === 1 ? '正常' : r + ' 倍'])))}
          <div class="actions">${btn('nar-try', icon('play', true) + '试听', 'secondary')}</div>` : '<p class="hint">这个浏览器不能系统朗读，换成「配音引擎」，或者换个浏览器。</p>')
        : `<p class="hint">${role?.voice ? `用角色 App 里「旁白」的音色。` : '还没有「旁白」这个角色的音色：选好之前，叙述会跳过，只读台词。'}</p><div class="actions">${btn('nar-role', icon('wave') + (role ? '设置旁白的音色' : '新建「旁白」角色'), 'secondary')}</div>`}
        ${field('正文标签', input('nar-body', (n.body || []).join('、'), 'text', 'placeholder="content、正文"'), '回复用这些标签包着正文时（比如预设要求把正文写在 <content>…</content> 里），只读标签里面的，前后的状态栏、摘要、小剧场都不读。写标签名，用顿号或逗号隔开；回复里没有这些标签时照常读整条。清空就总是读整条。和视觉小说共用。')}
        ${field('不读的内容', textArea('nar-skip', n.skip.join('、'), 'rows="3" placeholder="小剧场、状态栏"'), '写标签名，用顿号或逗号隔开：写「小剧场」，就会跳过 <小剧场>…</小剧场> 里的全部内容（里面的台词也不读）。代码块、注释、思考，以及小手机自己的出图、音效、音乐、手机消息标签，总是跳过。')}</div>`;
    };
    paint();
    // System voices can arrive a moment later.
    const later = () => paint();
    ctx.win.speechSynthesis?.addEventListener?.('voiceschanged', later);
    d.onClose(() => { ctx.win.speechSynthesis?.removeEventListener?.('voiceschanged', later); render(); });
    const save = patch => { try { api.saveNarration(patch); } catch (error) { ctx.notify(error.message, {error: true}); } paint(); };
    d.body.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.field === 'nar-enabled') { save({enabled: el.checked}); ctx.notify(el.checked ? '播放全部时会连叙述一起读' : '播放全部时只读台词'); }
      if (el.dataset.field === 'nar-system') save({systemVoice: el.value});
      if (el.dataset.field === 'nar-rate') save({rate: Number(el.value)});
      if (el.dataset.field === 'nar-skip') save({skip: cleanSkip(el.value)});
      if (el.dataset.field === 'nar-body') save({body: cleanBody(el.value)});
    });
    d.body.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.narVoice) save({voice: b.dataset.narVoice});
      if (b.dataset.action === 'nar-try') { const n = api.getState().narration; speech?.speak('夜色渐深，街灯一盏一盏亮了起来。', {voice: n.systemVoice, rate: n.rate}).catch(error => { if (error.name !== 'AbortError') ctx.notify(error.message, {error: true}); }); }
      if (b.dataset.action === 'nar-role') { d.close(); ctx.openPendingRole(NARRATOR); }
    });
  }
  let appearance = null, check = null, backup = null, restore = null, storage = false, epoch = 0;
  const glyphName = key => APPS[key]?.name || GLYPH_NAMES[key] || key;

  // The self-check page: what core/diagnostics.js found, grouped, with the plain report to copy, save or send.
  function renderCheck() {
    const intro = '';
    if (check.loading) { v.draw(heading('自检', help('自检会看插件、酒馆、浏览器、密钥和最近一条回复有没有问题。出问题时可以把报告复制给帮你的人，报告里没有密钥。'), 'Self-check') + '<div class="group pad"><p class="help-copy">正在检查……</p></div>' + intro); return; }
    const {sections, counts, text} = check.report, level = counts.error ? 'error' : counts.warn ? 'warn' : 'ok';
    v.draw(heading('自检', help('自检会看插件、酒馆、浏览器、密钥和最近一条回复有没有问题。出问题时可以把报告复制给帮你的人，报告里没有密钥。'), 'Self-check')
      + `<div class="check-summary" data-level="${level}"><strong>${counts.error ? `发现 ${counts.error} 个问题` : counts.warn ? `有 ${counts.warn} 条提醒` : '一切正常'}</strong><small>问题 ${counts.error} · 提醒 ${counts.warn} · 正常 ${counts.ok}</small></div>`
      + sections.map(s => groupTitle(s.title) + `<div class="group pad">${s.items.map(i => `<div class="check-row" data-level="${i.level}"><span class="check-mark" aria-hidden="true">${MARKS[i.level]}</span><div><strong>${esc(i.label)}</strong>${i.detail ? `<small>${esc(i.detail)}</small>` : ''}</div></div>`).join('')}</div>`).join('')
      + `<div class="actions">${btn('copy-report', icon('copy') + '复制报告', 'primary')}${btn('save-report', icon('download') + '下载报告', 'secondary')}</div>`
      + `<div class="actions">${btn('run-check', icon('refresh') + '再查一次', 'secondary')}</div>`
      + `<details class="report-text"><summary>报告原文（复制不了时长按这里手动复制）</summary><textarea readonly rows="12" aria-label="报告原文">${esc(text)}</textarea></details>` + intro);
  }
  // Backup: pick the parts, see how much each holds, and save one file.
  async function renderBackup(ticket) {
    const [library, threads, moments, assistant] = await Promise.all([api.libraryStats().catch(() => null), api.listThreads().catch(() => null), api.listMoments().catch(() => null), api.assistantThreads().catch(() => null)]);
    if (v.disposed || ticket !== epoch) return;
    const s = api.getState(), n = (value, unit) => value === null || value === undefined ? '读不到' : `${value} ${unit}`;
    const counts = {settings: `${s.routes.length} 个角色 · ${s.presets.length} 个配音预设`, vnFiles: vnFileCount(s), chats: n(threads?.length, '段'), memories: '各段聊天的摘要、阶段总结和长期总览', assistant: n(assistant?.length, '段会话'), moments: n(moments?.length, '条'), notes: n(library?.notes, '条'), photos: n(library?.photos, '张'), favorites: n(library?.favorites, '段'), vibes: library ? `${library.vibes} 个 · ${s.draw.vibe.groups.length} 组` : '读不到', books: n(library?.books, '本'), keys: savedKeys() ? `这台浏览器里的 ${savedKeys()} 个密钥` : '这台浏览器里还没有密钥'};
    v.draw(heading('备份', help('备份是一个 .json 文件，可以存在电脑、手机或网盘里。\n视觉小说的立绘和模型存在酒馆里，设置只记着它们在哪；勾上「视觉小说的立绘和模型」才会把图片和模型文件一起放进备份，换个酒馆或者后来删了也能恢复。\n聊天记录和聊天记忆可以分别选择；助手会话连同各自的记忆一起保存。助手已发送的图片和文字附件随会话保存，生成的图片需同时勾选「相册」。向量检索缓存不备份，恢复后需要时重建。\n密钥默认不放进去；打开「密钥」后会用你设的密码加密，恢复时输入同一个密码才能取出来，没有密码的人拿到文件也看不到密钥。\n语音缓存不备份，需要时会重新生成。相册、收藏和 Vibe 多的话，文件会比较大。'), 'Backup')
      + `<div class="group">${Object.entries(api.backupParts()).map(([key, label]) => key === 'keys' && !savedKeys() ? `<div class="setting-row"><span class="row-text"><strong>${esc(label)}</strong><small>这台浏览器里还没有密钥</small></span></div>` : partRow(key, label, counts[key], backup.parts.has(key))).join('')}</div>`
      + (backup.parts.has('keys') ? keyPasswordFields() : '')
      + `<div class="actions">${btn('make-backup', icon('download') + '生成备份文件', 'primary', canBackup() ? '' : 'disabled')}</div>`);
  }
  /** How many 立绘 and 模型 files the 视觉小说 uses (they live in the tavern; the backup carries them). */
  const vnFileCount = s => { const files = new Set(), json = JSON.stringify(s.vn?.cast || {}); for (const m of json.matchAll(/"(\/?user\/(?:images|files)\/[^"\\]+)"/g)) files.add(m[1]); const models = [...files].filter(f => /user\/files\//.test(f)).length; return `${files.size - models} 张立绘${models ? ` · ${models} 个模型` : ''}`; };
  const savedKeys = () => ['fish', 'mini', 'eleven', 'mimo', 'doubao', 'nai', 'llm'].filter(engine => { try { return api.keyStatus(engine); } catch { return false; } }).length;
  const passwordOk = () => !backup.parts.has('keys') || backup.password.length >= 6 && backup.password === backup.again;
  const canBackup = () => backup.parts.size > 0 && passwordOk();
  function keyPasswordFields() {
    return `<div class="group pad">${field('备份密码', input('backup-password', backup.password, 'password', 'autocomplete="new-password" minlength="6"'), '至少 6 位。恢复时要输入这个密码才能取出密钥；密码忘了，密钥就取不出来（备份里的其他内容不受影响）。')}
      ${field('再输一次', input('backup-again', backup.again, 'password', 'autocomplete="new-password"'))}<p class="hint" data-password-note>${esc(passwordNote())}</p></div>`;
  }
  const passwordNote = () => !backup.password ? '' : backup.password.length < 6 ? '密码至少 6 位' : backup.again && backup.again !== backup.password ? '两次输入的不一样' : backup.again ? '可以了' : '';
  // Restore: what the chosen file holds, which parts to take, and whether to merge or replace.
  function renderRestore() {
    const {info, parts, replace} = restore, sum = info.summary, labels = api.backupParts();
    const counts = {settings: sum.settings && `${sum.settings.roles} 个角色 · ${sum.settings.presets} 个配音预设`, vnFiles: sum.vnFiles != null && `${sum.vnFiles} 个文件（酒馆里缺的才放回去）`, chats: sum.chats !== null && `${sum.chats} 段`, memories: sum.memories != null && `${sum.memories} 份记忆`, assistant: sum.assistant != null && `${sum.assistant} 段会话`, moments: sum.moments != null && `${sum.moments} 条`, notes: sum.notes !== null && `${sum.notes} 条`, photos: sum.photos !== null && `${sum.photos} 张`, favorites: sum.favorites !== null && `${sum.favorites} 段`, vibes: sum.vibes != null && `${sum.vibes.vibes} 个 · ${sum.vibes.groups} 组`, books: sum.books != null && `${sum.books} 本`, keys: sum.keys != null && `${sum.keys} 个密钥（要输入备份时的密码）`};
    const when = info.createdAt ? new Date(info.createdAt).toLocaleString('zh-CN', {hour12: false}) : '未知';
    v.draw(heading('恢复', '', 'Restore')
      + `<div class="group pad"><p class="help-copy">备份时间：${esc(when)}${info.version ? ` · 插件 ${esc(info.version)}` : ''}</p></div>`
      + groupTitle('要恢复的内容')
      + `<div class="group">${Object.entries(labels).map(([key, label]) => counts[key] ? partRow(key, label, counts[key], parts.has(key)) : `<div class="setting-row"><span class="row-text"><strong>${esc(label)}</strong><small>备份里没有</small></span></div>`).join('')}</div>`
      + (parts.has('keys') ? `<div class="group pad">${field('备份密码', input('restore-password', restore.password || '', 'password', 'autocomplete="current-password"'), '输入备份时设的密码，才能取出里面的密钥。')}</div>` : '')
      + groupTitle('方式')
      + `<div class="segmented"><button data-action="restore-mode" data-value="merge" aria-pressed="${!replace}">合并</button><button data-action="restore-mode" data-value="replace" aria-pressed="${replace}">替换</button></div>`
      + `<p class="hint">${replace ? '替换：选中的内容会先清空，再换成备份里的。' : '合并：现在的内容都保留，备份里同一条（同一张照片、同一段聊天）会覆盖现在的。'}设置和预设总是整体换成备份里的；密钥不受影响。旧备份未包含的记忆部分不会被清空。</p>`
      + `<div class="actions">${btn('do-restore', icon('refresh') + '开始恢复', 'primary', parts.size ? '' : 'disabled')}</div>`);
  }
  const partRow = (key, label, detail, on) => `<div class="setting-row"><span class="row-text"><strong>${esc(label)}</strong><small>${esc(detail)}</small></span><input class="switch" type="checkbox" data-part="${key}" aria-label="${esc(label)}" ${on ? 'checked' : ''}></div>`;
  const restored = done => [done.keys && `${done.keys} 个密钥`, done.settings && '设置和预设', done.vnFiles && `${done.vnFiles} 个立绘和模型文件`, done.chats && `${done.chats} 段聊天`, done.memories && `${done.memories} 份聊天记忆`, done.assistant && `${done.assistant} 段助手会话`, done.moments && `${done.moments} 条朋友圈`, done.notes && `${done.notes} 条备忘录`, done.photos && `${done.photos} 张照片`, done.favorites && `${done.favorites} 段收藏`, done.vibes && `${done.vibes} 个 Vibe`, done.books && `${done.books} 本绘本`].filter(Boolean).join('、');

  /** 保存到酒馆: the switch, and when it is on, when it last synced and what the tavern holds. */
  function syncRows() {
    const st = api.syncStatus?.();
    if (!st) return '';
    const time = at => new Date(at).toLocaleString('zh-CN', {hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});
    const state = !st.available ? '在酒馆里打开小手机时才能同步'
      : st.busy ? '正在同步……'
      : st.error ? '同步失败：' + st.error
      : st.lastAt ? '上次同步 ' + time(st.lastAt) : st.pending ? '有改动，马上同步' : '还没同步过';
    const remote = st.remote?.savedAt ? `酒馆里的是${st.remote.deviceName ? ' ' + st.remote.deviceName + ' ' : ''}在 ${time(st.remote.savedAt)} 存的` : '';
    return toggle('syncEnabled', '保存到酒馆', st.enabled, '聊天记录、聊天记忆、助手会话与记忆、朋友圈、备忘录和相册存进酒馆里你账号的文件夹（data/你的用户名/user/files）。换一台设备、换个浏览器打开酒馆，小手机里的东西都还在；清了浏览器数据也不会丢。有改动几秒后自动保存，打开小手机时自动读取别的设备的新内容。两台设备都改了同一段聊天或同一条朋友圈时，会合并成一份（消息和评论都保留）；只有一边改过就直接用那一边的。助手已发送的附件随会话保存，生成的图片保存在相册。密钥不会存进去；语音缓存、收藏的语音和向量检索缓存也不存，需要时重新生成。\n\n想删掉酒馆里存的那份：存储空间 → 酒馆里存的那份。')
      + (st.enabled ? `<div class="setting-row"><span class="row-text"><strong data-sync-state>${esc(state)}</strong>${remote ? `<small>${esc(remote)}</small>` : ''}</span>${btn('sync-now', icon('refresh') + '立即同步', 'chip-button', st.busy || !st.available ? 'disabled' : '')}</div>` : '');
  }
  async function clearTavernCopy() {
    try { const n = await api.clearSyncFiles(); ctx.notify(n ? '酒馆里的那份已删除' : '酒馆里没有存过'); } catch (error) { ctx.notify(error.message, {error: true}); }
    await render();
  }
  /**
   * 本地资料: one row with what this device holds in all (voice cache included); opened, each kind with its count
   * and size, and the in-text pictures of this chat, which are kept in the tavern.
   */
  function storageFold(cache, library, drawn, chatPictures, budget) {
    const row = (label, note, amount, extra = '') => `<div class="setting-row"><span class="row-text"><strong>${label}</strong>${note ? `<small>${note}</small>` : ''}</span><small class="part-size">${amount}</small>${extra}</div>`;
    const parts = [
      cache.available && cache.count ? row('语音缓存', `${cache.count} 段`, size(cache.bytes)) : '',
      ...(library ? [['photos', '相册', '张'], ['favorites', '语音收藏', '段'], ['references', '参考音频', '段'], ['vibes', 'Vibe 参考图', '张'], ['notes', '备忘录', '条']].filter(([k]) => library[k])
        .map(([k, label, unit]) => row(label, `${library[k]} ${unit}${k === 'photos' && drawn?.count ? `，画出来的 ${drawn.count} 张` : ''}`, size(library.sizes?.[k] || 0),
          k === 'vibes' && (library.sizes?.vibes || 0) > 300 * 1024 * library.vibes ? btn('vibes-compact', '压缩原图', 'chip-button') : '')) : []),
      chatPictures?.count ? row('当前聊天的正文图片', `${chatPictures.count} 张`, '存在酒馆') : '',
      // How much there is: a share of what this browser gives the site, so a computer keeps more than a phone.
      library ? row('最多能存', `只是上限，不会先占着：手机里实际只用上面这些。相册和收藏这些最多 ${size(library.limit)}，语音缓存最多 ${size(cache.limit || 0)}（满了先清最早的）${budget?.quota ? `；按浏览器给小手机所在网站的 ${size(budget.quota)} 算的` : ''}${budget?.persisted ? '，已设为长期保存' : ''}。`, '') : ''
    ].filter(Boolean);
    const total = library ? `已用 ${size(library.bytes + (cache.available ? cache.bytes : 0))} · 最多 ${size(library.limit + (cache.available ? cache.limit || 0 : 0))}` : '无法读取';
    return `<details class="storage-fold" data-group="storage-parts"><summary><span>本地资料</span><small>${total}</small></summary>${parts.join('') || '<div class="setting-row"><span>什么都没有存</span></div>'}</details>`;
  }
  /** 清除相册里的绘图: pick which of the drawn photos go (all ticked), with how many and how big each is. */
  async function clearDrawn() {
    const drawn = await api.generatedPhotos();
    const rows = Object.entries(drawn.sources).filter(([, x]) => x.count);
    if (!rows.length) { ctx.notify('相册里没有画出来的图'); return; }
    const d = ctx.dialog('清除相册里的绘图', `<p class="help-copy">勾上要清的。自己导入的照片不会动；正文里的图片存在酒馆，不受影响。清掉的朋友圈配图和查手机照片会变回「没画」，想要可以再画。</p>
      <div class="group">${rows.map(([key, x]) => `<label class="setting-row"><span>${esc(x.label)}<small> · ${x.count} 张 · ${size(x.bytes)}</small></span><input type="checkbox" data-drawn="${key}" checked></label>`).join('')}</div>
      <div class="actions">${btn('drawn-go', icon('trash') + '清除', 'danger')}</div>`);
    d.body.addEventListener('click', async e => {
      const go = e.target.closest('[data-action=drawn-go]');
      if (!go) return;
      const keys = [...d.body.querySelectorAll('[data-drawn]:checked')].map(x => x.dataset.drawn);
      if (!keys.length) { ctx.notify('先勾上要清的'); return; }
      go.disabled = true;
      try { const n = await api.deleteGeneratedPhotos(keys); d.close(); await render(); ctx.notify(`已清除 ${n} 张`); }
      catch (error) { go.disabled = false; ctx.notify(error.message, {error: true}); }
    });
  }
  v.onSync = () => { if (!appearance && !check && !backup && !restore) render().catch(() => {}); };

  async function runCheck() {
    check = {loading: true};
    await render();
    try { const facts = await api.diagnose(); if (check) check = {report: buildReport(facts)}; }
    catch (error) { check = null; await render(); throw error; }
    await render();
  }

  function renderAppearance() {
    const d = appearance;
    v.draw(heading('壁纸与图标', '', 'Appearance')
      + groupTitle('壁纸')
      + `<div class="group pad"><div class="wallpaper-options">${Object.entries(wallpapers).map(([key, w]) => `<button class="wallpaper-choice" data-action="wallpaper" data-key="${key}" aria-pressed="${d.wallpaper.kind === 'builtin' && d.wallpaper.key === key}"><span style="--p:${w.background};--ps:${w.size || 'auto'};--pp:${w.pos || 'center'}"></span>${w.name}</button>`).join('')}</div>
        <label class="secondary file-button">${icon('image')}选择本地图片作壁纸<input type="file" data-personal-file="wallpaper" aria-label="选择本地壁纸" accept="${IMAGE_TYPES}"></label>
        ${d.wallpaper.kind === 'photo' ? `<p class="hint">现在用的是自己的照片。</p><div class="actions">${btn('photo-off', '换回主题壁纸', 'secondary')}${btn('photo-delete', icon('trash') + '删除这张照片', 'danger')}</div>` : ''}
        ${field('图标外观', select('iconStyle', d.iconStyle, [['color', '彩色'], ['glass', '玻璃'], ['mono', '单色']]))}</div>`
      + groupTitle('应用图标')
      + `<div class="group">${Object.entries(APPS).map(([app, meta]) => `<div class="icon-settings-row"><strong>${meta.name}</strong>${select('glyph', d.icons[app]?.kind === 'glyph' ? d.icons[app].key : 'default', api.phoneCatalog.glyphs.map(key => [key, glyphName(key)]), `data-icon-app="${app}"`).replace('aria-label="glyph"', `aria-label="${meta.name}图标"`)}<label class="chip-button file-button">${d.icons[app]?.kind === 'photo' ? '换图' : '用图片'}<input type="file" data-personal-file="icon" data-app="${app}" aria-label="${meta.name}图标图片" accept="${IMAGE_TYPES}"></label></div>`).join('')}</div>`
      + `<div class="savebar">${btn('cancel-appearance', '取消', 'secondary')}${btn('save-appearance', '应用', 'primary')}</div>`);
  }

  /** 存储空间: the voice cache switch, what this device holds, the clearing, and the copy in the tavern. */
  async function renderStorage(ticket) {
    const [cache, library, drawn, budget] = await Promise.all([api.cacheStats(), api.libraryStats().catch(() => null), api.generatedPhotos().catch(() => null), api.storageBudget().catch(() => null)]);
    const chatPictures = api.chatPictureStats?.() || null, st = api.syncStatus?.();
    if (v.disposed || ticket !== epoch) return;
    const s = api.getState();
    v.draw(heading('存储空间', '', 'Storage')
      + `<div class="group">${toggle('cacheEnabled', '保存语音缓存', s.general.cacheEnabled, '已生成的音频用于重播。清缓存不会删除收藏、相册、备忘录或参考音频。')}
          ${storageFold(cache, library, drawn, chatPictures, budget)}</div>`
      + groupTitle('清理')
      + `<div class="group">
          <div class="setting-row"><span class="row-text"><strong>语音缓存</strong><small>收藏和其他资料会保留</small></span>${btn('clear-cache', icon('trash') + '清理', 'chip-button')}</div>
          <div class="setting-row"><span class="row-text"><strong>相册里的绘图</strong><small>绘图 App、正文、查手机、朋友圈画出来的图</small></span>${btn('clear-drawn', icon('trash') + '清除', 'chip-button', drawn?.count ? '' : 'disabled')}</div>
          ${chatPictures ? `<div class="setting-row"><span class="row-text"><strong>当前聊天的正文图片</strong><small>存在酒馆里，出图标签还在，可以再画</small></span>${btn('clear-chat-pictures', icon('trash') + '清除', 'chip-button', chatPictures.count ? '' : 'disabled')}</div>` : ''}
          ${st?.available ? `<div class="setting-row"><span class="row-text"><strong>酒馆里存的那份</strong><small>只删酒馆里存的，这台设备上的不动</small></span>${btn('sync-clear', icon('trash') + '删除', 'chip-button', st.busy ? 'disabled' : '')}</div>` : ''}
        </div>`);
  }

  async function render() {
    const ticket = ++epoch;
    if (appearance) { renderAppearance(); return; }
    if (check) { renderCheck(); return; }
    if (backup) { await renderBackup(ticket); return; }
    if (restore) { renderRestore(); return; }
    if (storage) { await renderStorage(ticket); return; }
    const [phone, cache, library] = await Promise.all([api.getPhone(), api.cacheStats(), api.libraryStats().catch(() => null)]);
    if (v.disposed || ticket !== epoch) return;
    const s = api.getState(), space = api.phoneSpace?.() || {};
    const wallName = phone.wallpaper.kind === 'builtin' ? wallpapers[phone.wallpaper.key]?.name : '自己的照片';
    const used = library ? size(library.bytes + (cache.available ? cache.bytes : 0)) : '';
    v.draw(heading('设置', '', 'Settings')
      + groupTitle('外观')
      + `<div class="group pad">
          <div class="field"><span>主题风格</span><div class="skin-options">${Object.entries(skins).map(([key, s]) => `<button class="skin-choice" data-action="skin" data-value="${key}" aria-pressed="${(phone.skin || 'sky') === key}"><span style="background:${s.preview[0]}"><b style="background:${s.preview[3]}"></b><i style="background:${s.preview[1]}"></i><i style="background:${s.preview[2]}"></i></span>${s.name}</button>`).join('')}</div></div>
          <div class="field"><span>日夜</span><div class="segmented" style="margin:0">${[['system', '跟随系统'], ['light', '日间'], ['dark', '夜间']].map(([key, label]) => `<button data-action="theme" data-value="${key}" aria-pressed="${phone.theme === key}">${label}</button>`).join('')}</div></div>
          <button class="list-row" data-action="appearance"><span><strong>壁纸与图标</strong><small>${wallName} · ${({color: '彩色', glass: '玻璃', mono: '单色'})[phone.iconStyle]}图标</small></span>${icon('next')}</button>
          ${toggle('wallpaperMotion', '动态壁纸', s.general.wallpaperMotion !== false, '内置壁纸会慢慢动起来：晴空飘云、夜里星星闪烁和流星、水感晴空的泡泡和夜里的极光、青草信笺的落叶和夜里的萤火虫、樱色的花瓣。用自己的照片当壁纸时不动；系统开启「减少动态效果」时也保持静止。控制中心里也能开关。')}
          ${toggle('lockOnOpen', '打开时显示锁屏', phone.lockOnOpen, '锁屏可随时跳过，是插件内的外观，不是手机安全锁。想看一眼锁屏，点控制中心里的「锁屏」。')}
        </div>`
      + groupTitle('正文')
      + `<div class="group pad">${languageField('defaultLanguage', s.general.defaultLanguage, false, typedLanguages(api.getState()))}
          ${toggle('voiceEnabled', '正文语音', s.general.voiceEnabled !== false, '关掉后，聊天请求里不再加入语音规则，模型只写普通对白；正文里已有的语音标签只显示中文译文，不显示声波；手机聊天里的联系人也只发文字。打开后恢复。')}
          ${s.general.voiceEnabled !== false ? `<div class="field"><span>配音方式${help('正文里顺手写：把配音规则加进正文请求，模型写故事时顺手把台词写成配音格式。只要一次请求，但规则较长，有时会影响正文，或者和破限、文风预设打架、漏写格式。\n\n回复后单独配音：正文模型只管写故事，不带任何配音规则；回复写完后，插件用同一个模型再单独请求一次，把正文里的台词配上音（声波稍等一会儿才出来）。格式更稳，不挤占正文，每条回复多一次请求。\n\n绘图里也选了「回复后单独配图」的话，配音和配图合成一次请求，不会多发两次。')}</span><div class="segmented" style="margin:0">${[['inline', '正文里顺手写'], ['separate', '回复后单独配音']].map(([k, l]) => `<button data-action="voice-mode" data-value="${k}" aria-pressed="${(s.general.voiceMode || 'inline') === k}">${l}</button>`).join('')}</div>${s.general.voiceMode === 'separate' && api.planLatestVoice ? `<div class="actions" style="margin:6px 0 0">${btn('voice-latest', icon('wave') + '给最新回复配音', 'text-button')}</div>` : ''}</div>` : ''}
          ${s.general.voiceEnabled !== false ? toggle('pregenerate', '提前生成语音', s.general.pregenerate === true, '打开后，每条新回复写完，插件就在后台按顺序把里面的台词都生成好、存进缓存，不会自己播放；点声波时直接就能听，不用再等。\n\n会多花语音额度：没去听的回复、重 roll 掉的那一版也会生成。要先打开下面「更多」里的「保存语音缓存」。\n\n不开也没关系：点「整条播放」时，播这一句的同时就在做下一句，句子之间不用等。') : ''}
          ${toggle('drawEnabled', '正文出图', s.draw.enabled, '开启后，绘图预设会加进聊天请求，让模型在正文里写出图标签。新回复要不要自动画、图片要不要收起，在绘图 App 的「正文出图」里改；免费档守卫在绘图 App 的「参数」里。')}
          ${s.draw.enabled ? `<div class="field"><span>配图方式${help('单独配图：正文模型只管写故事；回复写完后，插件用同一个模型再单独请求一次，读这条回复、挑画面、写出图块，再把图插到对应的段落后面。出图规则不会挤占正文，张数和格式更稳，每条回复多一次请求。上面配音也选了「回复后单独配音」的话，配音和配图合成一次请求。\n\n正文里顺手写：把出图规则加进正文请求，模型写故事时顺手写出图块。只要一次请求，但规则较长，偶尔会影响正文或漏写。')}</span><div class="segmented" style="margin:0">${[['inline', '正文里顺手写'], ['separate', '回复后单独配图']].map(([k, l]) => `<button data-action="draw-mode" data-value="${k}" aria-pressed="${s.draw.mode === k}">${l}</button>`).join('')}</div>${api.planLatestPictures ? `<div class="actions" style="margin:6px 0 0">${btn('draw-latest', icon('image') + '给最新回复配图', 'text-button')}</div>` : ''}</div>` : ''}
          ${s.general.voiceEnabled !== false ? `<button class="list-row" data-action="narration"><span><strong>整篇朗读</strong><small>${narrationNote(s)}</small></span>${icon('next')}</button>` : ''}
          <button class="list-row" data-action="story-phone"><span><strong>正文联动手机</strong><small>${s.chat.proactive?.on ? '开 · 正文里的消息、照片、转账、来电会真的出现在手机上' : '关'}</small></span>${icon('next')}</button>
          ${toggle('voiceIsland', '台词小窗', s.general.voiceIsland === true, '在酒馆页面上浮一个小窗，列出最新一条回复里的台词，点哪句念哪句（再点暂停），「整条」从头念到尾。正文里的声波点不到时（比如手机上在看视觉小说，立绘盖住了正文）、或者想按自己的节奏一句句听时打开。可以拖到不挡视线的地方；✕ 收起到下一条回复。')}
        </div>
        <details data-group="voice-more"><summary>更多<small class="fold-note">声波、旧配音标签、音量</small></summary><div class="fold-body">
          ${toggle('hideStoryWaves', '隐藏正文点击按钮', s.general.hideStoryWaves === true, '正文不插入声波、图片操作、音效和音乐按钮，已生成的图片仍显示。楼层工具栏也隐藏。可在小手机的「听取」里播放，在绘图和视觉小说 App 继续操作，适合与美化卡一起使用。')}
          ${s.general.hideStoryWaves !== true ? toggle('storyTools', '楼层工具按钮', s.general.storyTools !== false, '每层回复右边的小手机工具按钮：给这层楼生图、从这层看视觉小说、台词小窗、整条播放。关掉后不显示；长按声波的下载、收藏照常。') : ''}
          ${toggle('stripVoice', '发给模型时去掉旧配音标签', s.general.stripVoice !== false, '不改变酒馆里的正文显示；只是之后每次请求模型时，旧回复里的每句台词只留中文译文，标签和原文不发，省上下文，也不用自己写正则。旧回复全部去掉：留着的那条会被模型当成模板照着学，情绪和句式越写越固定；格式靠每次注入的语音规则就够了。出图块在「绘图」里另有同样的开关。')}
          ${s.general.stripVoice !== false ? toggle('voiceExample', '保留最近一条做示范', s.general.voiceExample === true, '最新一条带台词的回复不去掉，原样发给模型当格式示范。模型老是忘了写配音标签时再打开；打开后它容易照着这条学，越写越像。') : ''}
          ${toggle('waveformEnabled', '声波动效', s.general.waveformEnabled, '台词旁和手机里的声波随真实音频跳动。系统开启减少动态效果时保持静止。\n\n正文声波的颜色跟随酒馆主题：\n· 虚线小点：这个角色还没配音（斜体色）\n· 淡色：还没生成（正文色）\n· 引号色：已生成，可以播放\n· 引号色加底色：正在播放\n· 下划线色：已经播放过')}
          <div class="field"><div class="meter-label"><span>播放音量</span><output>${Math.round(phone.volume * 100)}%</output></div><input class="slider" type="range" data-field="volume" min="0" max="100" value="${Math.round(phone.volume * 100)}" aria-label="播放音量"></div>
        </div></details>`
      + groupTitle('手机')
      + `<div class="group">${toggle('floatingEnabled', '悬浮入口', s.general.floatingEnabled, '在酒馆里显示可以拖动的小球，点开再点一次进入手机。')}
          <div class="setting-row"><span class="row-text"><strong>按角色卡分开${help('打开后，每张角色卡（群聊是每个群）一部手机：聊天记录、朋友圈、论坛、查手机各管各的，换卡就换手机；联系人只有这张卡的角色、在这张卡剧情里说过话的角色，和在这张卡里手动加的联系人。「我」跟着酒馆给这张卡锁定的人设走。\n\n打开之前就有的聊天和动态没有归属，每张卡都看得到；不想要的可以删掉。关掉分区后，所有东西又会一起显示。')}</strong><small>${space.key ? '现在是' + esc(space.name || '这张角色卡') + (s.chat.partition === 'card' ? ' 的手机' : '') : '没有打开角色卡'}</small></span><input class="switch" type="checkbox" data-field="partition" aria-label="按角色卡分开" ${s.chat.partition === 'card' ? 'checked' : ''}></div></div>`
      + groupTitle('资料')
      + `<div class="group">${syncRows()}
          <button class="list-row" data-action="backup"><span><strong>备份到文件</strong><small>换设备或误删时能找回</small></span>${icon('next')}</button>
          <label class="list-row file-button"><span><strong>从文件恢复</strong><small>选一个 ST-iPhonie 备份文件</small></span>${icon('next')}<input type="file" data-backup-file accept=".json,application/json" aria-label="选择备份文件"></label>
          <button class="list-row" data-action="storage"><span><strong>存储空间</strong><small>${used ? '用了 ' + used + ' · ' : ''}语音缓存、清理</small></span>${icon('next')}</button></div>`
      + groupTitle('帮助')
      + `<div class="group"><button class="list-row" data-action="self-check"><span><strong>自检</strong><small>出问题时看看是哪里不对，可以把报告发给帮你的人</small></span>${icon('next')}</button>
          <button class="list-row" data-action="about"><span><strong>关于 ST-iPhonie</strong></span>${icon('next')}</button></div>`);
  }

  v.back = () => { if (!appearance && !check && !backup && !restore && !storage) return false; appearance = check = backup = restore = null; storage = false; render().catch(e => ctx.notify(e.message)); return true; };
  v.refresh = () => { if (!appearance) return render(); };
  v.on('input', '[data-field=volume]', el => { el.previousElementSibling.querySelector('output').textContent = el.value + '%'; });
  v.on('change', '[data-field]', async el => {
    const key = el.dataset.field;
    if (appearance) {
      if (key === 'iconStyle') appearance.iconStyle = el.value;
      if (key === 'glyph') appearance.icons[el.dataset.iconApp] = el.value === 'default' ? null : {kind: 'glyph', key: el.value};
      return;
    }
    if (key === 'syncEnabled') {
      api.saveSync({enabled: el.checked});
      await render();
      // Off: the copy in the tavern stays unless it is deleted too.
      if (!el.checked && api.syncStatus?.()?.available && await ctx.confirm('也删掉酒馆里的那份吗？', '关掉后小手机不再往酒馆存。酒馆里已经存的聊天记录与记忆、助手会话与记忆、朋友圈、备忘录和相册还在，别的设备打开同步还能读到。点确定会把它们从酒馆删掉；这台设备上的内容不受影响。')) await clearTavernCopy();
      return;
    }
    if (key === 'voiceEnabled') { api.updateGeneral({voiceEnabled: el.checked}); await render(); return; }
    if (['voiceEnabled', 'hideStoryWaves', 'storyTools', 'voiceIsland', 'floatingEnabled', 'waveformEnabled', 'cacheEnabled', 'wallpaperMotion', 'stripVoice', 'voiceExample', 'pregenerate'].includes(key)) { api.updateGeneral({[key]: el.checked}); if (key === 'stripVoice') await render(); }
    else if (key === 'drawEnabled') { api.saveDraw({enabled: el.checked}); await render(); }
    else if (key === 'defaultLanguage') api.updateGeneral({defaultLanguage: el.value});
    else if (key === 'volume') await api.setVolume(Number(el.value) / 100);
    else if (key === 'lockOnOpen') await api.savePhone({lockOnOpen: el.checked});
    else if (key === 'partition') { api.saveChatOptions({partition: el.checked ? 'card' : 'none'}); ctx.notify(el.checked ? '已按角色卡分开' : '已关闭分区，所有内容一起显示'); }
  });
  v.on('input', '[data-field=backup-password],[data-field=backup-again],[data-field=restore-password]', el => {
    if (el.dataset.field === 'restore-password') { if (restore) restore.password = el.value; return; }
    if (!backup) return;
    backup[el.dataset.field === 'backup-password' ? 'password' : 'again'] = el.value;
    const note = v.root.querySelector('[data-password-note]');
    if (note) note.textContent = passwordNote();
    const go = v.root.querySelector('[data-action=make-backup]');
    if (go) go.disabled = !canBackup();
  });
  v.on('change', '[data-part]', async el => {
    const parts = backup?.parts || restore?.parts;
    if (!parts) return;
    if (el.checked) parts.add(el.dataset.part); else parts.delete(el.dataset.part);
    // The key part brings its password fields in or out.
    if (el.dataset.part === 'keys') { await render(); return; }
    const go = v.root.querySelector('[data-action=make-backup],[data-action=do-restore]');
    if (go) go.disabled = backup ? !canBackup() : !parts.size;
  });
  v.on('change', '[data-backup-file]', async el => {
    const file = el.files?.[0];
    if (!file) return;
    el.disabled = true;
    try {
      const info = await api.inspectBackup(file), sum = info.summary;
      const parts = new Set(Object.keys(api.backupParts()).filter(key => key === 'settings' ? sum.settings : sum[key] != null));
      restore = {file, info, parts, replace: false};
      await render();
    } finally { if (el.isConnected) { el.value = ''; el.disabled = false; } }
  });
  v.on('change', '[data-personal-file]', async el => {
    const file = el.files?.[0], target = appearance;
    if (!file || !target) return;
    el.disabled = true;
    try {
      const photo = await api.addPhoto({name: file.name, blob: file});
      if (appearance !== target) return;
      if (el.dataset.personalFile === 'wallpaper') target.wallpaper = {kind: 'photo', photoId: photo.id};
      else target.icons[el.dataset.app] = {kind: 'photo', photoId: photo.id};
      await render();
    } finally { if (el.isConnected) { el.disabled = false; el.value = ''; } }
  });
  v.on('click', '[data-action]', async el => {
    switch (el.dataset.action) {
      case 'theme': await api.savePhone({theme: el.dataset.value}); await render(); break;
      case 'draw-mode': api.saveDraw({mode: el.dataset.value}); await render(); ctx.notify(el.dataset.value === 'separate' ? '以后回复写完再单独配图' : '以后模型写正文时顺手写出图块'); break;
      case 'draw-latest': await v.busy(el, () => api.planLatestPictures()); break;
      case 'narration': narrationSheet(); break;
      case 'story-phone': storyPhoneSheet(); break;
      case 'voice-mode': api.updateGeneral({voiceMode: el.dataset.value}); await render(); ctx.notify(el.dataset.value === 'separate' ? '以后回复写完再单独配音' : '以后模型写正文时顺手写配音'); break;
      case 'voice-latest': await v.busy(el, async () => { const n = await api.planLatestVoice(); ctx.notify(n ? `配好了 ${n} 句台词` : '这条回复里没有找到台词'); }); break;
      // A skin brings its own wallpaper, unless a personal photo is the wallpaper.
      case 'skin': { const p = await api.getPhone(); await api.savePhone({skin: el.dataset.value, ...(p.wallpaper.kind === 'builtin' ? {wallpaper: {kind: 'builtin', key: el.dataset.value}} : {})}); await render(); break; }
      case 'appearance': { const p = await api.getPhone(); appearance = {wallpaper: p.wallpaper, icons: p.icons, iconStyle: p.iconStyle}; await render(); break; }
      case 'wallpaper': appearance.wallpaper = {kind: 'builtin', key: el.dataset.key}; await render(); break;
      // Stop using a photo: back to the skin's own wallpaper, which follows day and night.
      case 'builtin-wallpaper': { const p = await api.getPhone(); await api.savePhone({wallpaper: {kind: 'builtin', key: p.skin || 'sky'}}); await render(); ctx.notify('已换回主题壁纸'); break; }
      case 'photo-off': { const p = await api.getPhone(); appearance.wallpaper = {kind: 'builtin', key: p.skin || 'sky'}; await api.savePhone({wallpaper: appearance.wallpaper}); await render(); ctx.notify('已换回主题壁纸'); break; }
      case 'photo-delete': {
        if (!await ctx.confirm('删除这张照片？', '照片会从相册删除，壁纸换回主题壁纸。')) break;
        await api.deletePhoto(appearance.wallpaper.photoId);
        const p = await api.getPhone();
        if (p.wallpaper.kind !== 'builtin' || p.wallpaper.key !== (p.skin || 'sky')) await api.savePhone({wallpaper: {kind: 'builtin', key: p.skin || 'sky'}});
        const now = await api.getPhone();
        appearance = {wallpaper: now.wallpaper, icons: now.icons, iconStyle: now.iconStyle};
        await render();
        ctx.notify('照片已删除');
        break;
      }
      case 'cancel-appearance': appearance = null; await render(); break;
      case 'save-appearance': await v.busy(el, async () => { await api.savePhone(appearance); appearance = null; await render(); ctx.notify('外观已应用'); }); break;
      case 'storage': storage = true; await render(); v.root.scrollTop = 0; break;
      case 'self-check': case 'run-check': await runCheck(); break;
      case 'backup': backup = {parts: new Set(Object.keys(api.backupParts()).filter(part => part !== 'keys')), password: '', again: ''}; await render(); break;
      case 'sync-clear': if (await ctx.confirm('删除酒馆里的那份？', '酒馆里存的聊天记录与记忆、助手会话与记忆、朋友圈、备忘录和相册会删掉，别的设备再同步时就读不到了。这台设备上的内容不受影响；同步开着的话，之后会重新存一份。')) await clearTavernCopy(); break;
      case 'sync-now': { const st = await api.syncNow(); const r = st.lastResult || {}; ctx.notify(r.pulled?.length || r.merged?.length ? '已读取别的设备的新内容' + (r.pushed?.length ? '，也保存了这里的改动' : '') : r.pushed?.length ? '已保存到酒馆' : '已经是最新的了'); await render(); break; }
      case 'make-backup':
        await v.busy(el, async () => {
          if (!passwordOk()) throw Error(backup.password.length < 6 ? '密码至少 6 位' : '两次输入的密码不一样');
          const {blob, name} = await api.exportBackup([...backup.parts], {password: backup.parts.has('keys') ? backup.password : ''});
          ctx.notify(`已下载 ${await saveFile(ctx.doc, blob, name)}（${size(blob.size)}）`);
        });
        break;
      case 'restore-mode': restore.replace = el.dataset.value === 'replace'; await render(); break;
      case 'do-restore': {
        const {replace, parts, file} = restore;
        if (parts.has('keys') && !restore.password) { ctx.notify('要取出密钥，先输入备份时设的密码（不需要密钥的话，把「密钥」关掉）'); break; }
        const sure = await ctx.confirm(replace ? '替换成备份里的内容？' : '恢复备份？', replace ? '选中的内容会先被清空，再换成备份里的。这一步不能撤销，想留着现在的内容可以先备份一次。' : '现在的内容会保留，备份里同一条会覆盖现在的；设置和预设会整体换成备份里的。');
        if (!sure) break;
        const done = await v.busy(el, () => api.importBackup(file, {parts: [...parts], replace, password: restore.password || ''}));
        restore = null;
        await render();
        ctx.notify('已恢复：' + (restored(done) || '没有内容'));
        break;
      }
      case 'copy-report': {
        const text = check?.report?.text || '';
        try { if (!await copyText(ctx.win, text)) throw Error('copy'); ctx.notify('已复制报告'); }
        catch { const box = v.root.querySelector('.report-text'); if (box) { box.open = true; box.querySelector('textarea')?.select(); } ctx.notify('没能自动复制，请在下面的报告原文里手动复制'); }
        break;
      }
      case 'save-report': {
        const text = check?.report?.text || '', stamp = new Date().toLocaleString('zh-CN', {hour12: false}).replace(/[/:]/g, '-');
        await v.busy(el, async () => ctx.notify('已下载 ' + await saveFile(ctx.doc, new Blob([text], {type: 'text/plain;charset=utf-8'}), `ST-iPhonie 自检 ${stamp}`)));
        break;
      }
      case 'vibes-compact':
        if (await ctx.confirm('压缩 Vibe 原图？', 'Vibe 里存的原图会缩到长边 1024、存成 JPEG，一张从一两 MB 变成一两百 KB。已经编码过的模型照常用、不花 Anlas；以后换模型或换提取信息量重新编码时用的是缩小后的图，效果基本一样。导出的 .naiv4vibe 也是缩小后的图。')) {
          const r = await v.busy(el, () => api.compactVibes());
          await render();
          ctx.notify(r.count ? `压缩了 ${r.count} 张，从 ${size(r.before)} 变成 ${size(r.after)}` : '都已经是小图了');
        }
        break;
      case 'clear-drawn':
        await clearDrawn();
        break;
      case 'clear-chat-pictures':
        if (await ctx.confirm('清除当前聊天的正文图片？', '图片文件会从酒馆删除，出图标签还在，之后可以点“点击生成”重新画。相册里的副本不受影响。')) { const r = await v.busy(el, () => api.clearChatPictures()); await render(); ctx.notify(`已清除 ${r.count} 张` + (r.failed ? `，${r.failed} 张没删掉` : '')); }
        break;
      case 'clear-cache':
        if (await ctx.confirm('清理语音缓存？', '正在播放的音频会停止，收藏和其他资料会保留。')) { await v.busy(el, () => api.clearCache()); await render(); ctx.notify('语音缓存已清理'); }
        break;
      case 'about': ctx.help('ST-iPhonie\n酒馆里的小手机：聊天、角色配音、听取、绘图（NovelAI、GPT 生图、ComfyUI）、收藏、相册和备忘录。\n\n密钥和本地资料保存在当前浏览器与酒馆地址。状态栏的信号和电量是装饰。语音只在你点击播放或试听后生成。'); break;
    }
  });
  render().catch(e => ctx.notify(e.message));
  return v;
}
