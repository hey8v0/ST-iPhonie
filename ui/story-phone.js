// 正文联动手机 (its own module since 0.9.36): one sheet, opened from 设置 → 正文 and from the chat app's 聊天设置 — what
// happens on the phone in the story (messages, photos, money, presents, songs, calls, 朋友圈, group messages) really
// arrives on the phone, written by the story model at the end of its reply or, with 回复后单独配音 or 配图, in that
// request; besides, every so many replies someone may text first, and by the real time (按现实时间主动找你).
import {toggle, help, esc, btn, groupTitle} from './common.js';
import {promptOn} from '../core/prompt-rules.js';

export const storyLinkNote = (s, threads = []) => `手机→正文：${threads.filter(t => t.story === true).length} 段一直带着 · 正文→手机：${s.chat.proactive?.on ? '开' : '关'}`;

export function storyLinkSheet(ctx, {onClose = () => {}, over = false, threadId = '', onPick = null} = {}) {
  const {api} = ctx;
  const d = ctx.dialog('正文和手机', '', {over});
  let threads = [], epoch = 0;
  const label = t => t.type === 'group' ? t.name : t.members?.[0] || t.name;
  const refresh = async () => {
    const ticket = ++epoch;
    try { const next = await api.listThreads(); if (!d.live || ticket !== epoch) return; threads = next; paint(); }
    catch (error) { if (d.live) ctx.notify(error.message, {error: true}); }
  };
  const paint = () => {
    if (!d.live) return;
    const s = api.getState(), o = s.chat.proactive, after = (s.general.voiceEnabled !== false && s.general.voiceMode === 'separate') || (s.draw.enabled && s.draw.mode === 'separate');
    const current = threads.find(t => t.id === threadId), waiting = api.chatPendingBring?.(), kept = threads.filter(t => t.story === true);
    const keep = (t, field, title) => toggle(field, title, t.story === true, field === 'story-keep' ? '每次写正文都带上这段聊天的记忆和还没整理的消息，会多占一些正文的字数。' : '');
    d.body.innerHTML = (current ? groupTitle('这段聊天') + `<div class="group pad">${onPick ? `<div class="setting-row"><span>这一次 · 选几条${help('挑几条消息，原样带进下一次正文，用一次就没了。再选一次会替换掉之前选的。')}</span>${btn('bring-pick', '选几条', 'chip-button')}</div>` : ''}${keep(current, 'story-keep', '一直带着')}</div>` : '')
      + groupTitle('手机 → 正文') + (waiting ? `<p class="hint">和${esc(waiting.name)}的聊天有 ${waiting.count} 条等着带进下一次正文 ${btn('bring-cancel', '取消', 'text-button')}</p>` : '<p class="hint">没有等着带进下一次正文的消息。</p>')
      + (kept.length ? `<p class="hint">一直带着的聊天</p><div class="group pad">${kept.map((t, i) => keep(t, `keep-${i}`, esc(label(t)))).join('')}</div>` : '<p class="hint">在聊天里点顶上的「带进剧情」可以挑消息或让正文一直记得这段聊天。</p>')
      + groupTitle('正文 → 手机') + `<div class="group pad">${toggle('p-on', '正文里的事发到手机', o.on, '打开后，正文里有人用手机联系你——发消息、发照片、转账、发红包、送礼物、分享歌曲、打电话，或者发了朋友圈、在群里说话——这些事会真的出现在小手机上：消息进聊天，电话会响，动态进朋友圈。正文里只留一行「📱 谁给你发了消息」。\n\n照片：能出图时会画出来；没开出图就是一张文字照片，写着拍到了什么，以后也能点「画出来」。\n\n只有角色 App 里的角色和手机里的联系人能发；群消息只发到已经有的群。什么时候发、怎么发，在预设 App 的聊天预设里改「正文里主动发消息」这条规则（用在「正文」）。')}
      ${o.on ? `<p class="hint">${after ? '现在开着「回复后单独配音 / 配图」：手机上的事在那次请求里一起写，正文请求不变，也不多花一次请求。' : '正文模型写回复时顺手写在最后，不多花一次请求。开了「回复后单独配音 / 配图」的话，会改成在那次请求里一起写。'}</p>` : ''}
      <div class="field"><span>每几条正文，手机这边来找你一次${help('0：每条正文都可以顺手用手机联系你，发不发由正文自己决定。设成几：每隔这么多条正文才有一次机会——这一条正文可以顺手发；没发的话，再单独问一个角色（优先是当前卡的角色）这时会不会主动找你，问一次用文字模型请求一次，TA 觉得没理由就不发。其余几条正文不会被告知可以用手机，所以不会每轮都来消息（手动加的联系人也一样）。什么时候会发由聊天预设里「正文里主动发消息」这条规则决定。')}</span><input data-field="p-every" type="number" min="0" max="100" value="${o.every}" ${o.on ? '' : 'disabled'}></div>
      ${toggle('time-sync', '现实时间同步', clockOn(), '在私聊、群聊和电话里告诉角色这台设备当前的日期和时间，离上次聊天过了很久也会告诉 TA。适合按现实时间聊天；古代、架空剧情可以保持关闭。规则文字仍可在「预设 → 系统提示词 → 现实时间」里修改。')}
      ${toggle('p-clock', '按现实时间主动找你', o.clock, '酒馆页面开着的时候，角色会按现实的时间自己来消息：早上（7–10 点）、睡前（22 点以后）、很久没聊（6 个小时没有消息）各最多一次，凌晨 1–7 点不来。每次单独问一个角色（优先是当前卡的角色）这时会不会找你，一次用文字模型请求一次，TA 觉得没理由就不发；算进下面的「每天最多」。\n\n群里也会偶尔自己聊几句：10–23 点之间，两个小时没人说话的群（也包括你不在的旁观群），一天最多三次、隔三个小时以上，没话题就不聊。\n\n要先打开上面的「现实时间同步」。说什么在「预设 → 系统提示词 → 现实时间」的「主动找你」和「群里自己聊」几段里改。')}
      ${o.clock && !clockOn() ? '<p class="hint">「现实时间同步」还关着：打开上面的开关后，才会按时间来找你。</p>' : ''}
      <div class="field"><span>手机这边来找你，每天最多${help('填 0 是不限。正文里发来的、单独问出来的和按现实时间来的都算，只算真的发来的，TA 决定不发的那次不算。到了上限，今天的正文就不再被告知可以用手机。')}</span><input data-field="p-dailyMax" type="number" min="0" max="99" value="${o.dailyMax}" ${o.on || o.clock ? '' : 'disabled'}></div></div>`;
  };
  const clockOn = () => promptOn(api.getState().promptRules, 'now');
  paint();
  refresh();
  d.onClose(() => { Promise.resolve().then(onClose).catch(error => { if (d.live) ctx.notify(error.message, {error: true}); }); });
  d.body.addEventListener('click', async e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    try {
      if (action === 'bring-pick' && onPick) { d.close(); onPick(); }
      if (action === 'bring-cancel') { await api.chatCancelBring?.(); ctx.notify('已取消，这次不带聊天进正文'); await refresh(); }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  });
  d.body.addEventListener('change', async e => {
    const field = e.target.dataset.field || '';
    try {
      if (field === 'story-keep' || field.startsWith('keep-')) {
        const t = field === 'story-keep' ? threads.find(t => t.id === threadId) : threads.filter(t => t.story === true)[Number(field.slice(5))];
        if (t) await api.updateThread(t.id, {story: e.target.checked});
        await refresh();
      } else if (field === 'time-sync') {
        api.savePromptRule('now', {...api.getState().promptRules?.now, enabled:e.target.checked});
        paint();
      } else if (field.startsWith('p-')) {
        const key = field.slice(2);
        api.saveChatOptions({proactive: {[key]: key === 'on' || key === 'clock' ? e.target.checked : Number(e.target.value)}});
        paint();
      }
    } catch (error) { ctx.notify(error.message, {error: true}); paint(); }
  });
  return d;
}

export const storyPhoneSheet = storyLinkSheet;
