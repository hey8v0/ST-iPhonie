// 查手机: the apps beyond 消息/相册/备忘录/浏览器/购物 — 电话 (recent calls), 日历, 音乐 (what the owner listened to; a tap
// plays it on the user's phone), and the ones made up here from the owner's name and the day, with no model asked:
// 天气, 时钟 (its alarms), 设置 and 相机 (a viewfinder). Each page is a string of HTML for ui/peek-phone.js, which draws
// the bar, the status bar and the home bar around it.
import {esc} from './common.js';

const WEEK = '日一二三四五六';
const pad = n => String(n).padStart(2, '0');
// Typical highs by month (northern China-ish), for a weather that fits the season.
const HIGHS = [4, 8, 14, 21, 26, 30, 32, 31, 27, 21, 13, 6];
const SKIES = [['晴', 'sun'], ['多云', 'cloud'], ['晴转多云', 'cloud'], ['阴', 'cloud'], ['小雨', 'rain'], ['阵雨', 'rain']];
const SKY_ART = {
  sun: '<circle cx="12" cy="12" r="4.6" fill="#ffd60a"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#ffd60a" stroke-width="1.8" stroke-linecap="round"/>',
  cloud: '<path d="M7.5 18.5h9.8a4 4 0 0 0 .3-8 5.6 5.6 0 0 0-10.7 1.4 3.3 3.3 0 0 0 .6 6.6z" fill="#fff"/>',
  rain: '<path d="M7.5 14.5h9.8a4 4 0 0 0 .3-8 5.6 5.6 0 0 0-10.7 1.4 3.3 3.3 0 0 0 .6 6.6z" fill="#fff"/><path d="M9 17l-1 3M13 17l-1 3M17 17l-1 3" stroke="#8fd3ff" stroke-width="1.8" stroke-linecap="round"/>'
};
const sky = (kind, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${SKY_ART[kind]}</svg>`;
const CALL_ICON = {
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8M10 8h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  in: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 8 8 16M14 16H8v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const switchHTML = on => `<span class="pp-switch${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;

/**
 * The pages. k: {snap, hash(text), stamp(at, minutesAgo), bar(title, back, right), face(name, size), battery, album(),
 * picture(photo, index)}. Returns {phone, calendar, music, weather, clock, settings, camera}.
 */
export function peekApps(k) {
  const {snap, hash, bar, face} = k;
  const seed = text => hash(snap.name + '|' + text);

  function phone() {
    const calls = snap.calls || [], missed = calls.filter(c => c.dir === 'missed').length;
    // The newest call a few minutes before the look, the others further back.
    const when = i => k.stamp(snap.at, [7, 95, 300, 60 * 20, 60 * 30, 60 * 50][i] ?? 60 * 24 * (i - 2));
    return `<div class="pp-app pp-calls">${bar('最近通话', '', '<span class="pp-link">编辑</span>')}
      <div class="pp-body"><div class="pp-seg"><span class="on">全部</span><span>未接来电${missed ? `（${missed}）` : ''}</span></div>
      ${calls.length ? `<div class="pp-group">${calls.map((c, i) => `<div class="pp-call-row${c.dir === 'missed' ? ' missed' : ''}">${face(c.with === 'me' ? '我' : c.with, 38)}<span class="pp-row-main"><b>${esc(c.with)}</b><small>${c.dir === 'out' ? CALL_ICON.out : CALL_ICON.in}${c.dir === 'missed' ? '未接来电' : c.dir === 'out' ? '呼出' : '呼入'}${c.long ? ` · ${esc(c.long)}` : ''}</small></span><span class="pp-call-when">${esc(when(i))}</span></div>`).join('')}</div>`
        : '<p class="pp-empty">没有通话记录<br><small>再「接着看」一次就有了</small></p>'}</div></div>`;
  }

  function calendar() {
    const now = new Date(snap.at), y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    // Days that some plan names (「10月25日」, 「25号」) get a dot.
    const marked = new Set((snap.events || []).flatMap(e => [...e.when.matchAll(/(?:(\d{1,2})月)?(\d{1,2})[日号]/g)].filter(x => !x[1] || Number(x[1]) === m + 1).map(x => Number(x[2]))));
    if ((snap.events || []).some(e => /今天|今晚|今早/.test(e.when))) marked.add(today);
    if ((snap.events || []).some(e => /明天|明晚|明早/.test(e.when)) && today < days) marked.add(today + 1);
    const cells = [...Array(first).fill(''), ...Array.from({length: days}, (_, i) => i + 1)];
    return `<div class="pp-app pp-calendar">${bar('', `${y}年`)}
      <div class="pp-body"><p class="pp-big pp-red">${m + 1}月</p>
      <div class="pp-month"><div class="pp-week">${[...WEEK].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="pp-days">${cells.map(d => d ? `<span class="${d === today ? 'today' : ''}${marked.has(d) ? ' dot' : ''}">${d}</span>` : '<span></span>').join('')}</div></div>
      <p class="pp-head">接下来</p>
      ${(snap.events || []).length ? `<div class="pp-group">${snap.events.map(e => `<div class="pp-event"><i style="background:hsl(${seed(e.what) % 360} 70% 55%)"></i><span><b>${esc(e.what)}</b>${e.when ? `<small>${esc(e.when)}</small>` : ''}</span></div>`).join('')}</div>`
        : '<p class="pp-empty">没有日程</p>'}</div></div>`;
  }

  function music() {
    const songs = snap.songs || [], top = songs[0];
    return `<div class="pp-app pp-music">${bar('', '资料库')}
      <div class="pp-body"><p class="pp-big">最近播放</p>
      ${top ? `<button type="button" class="pp-now" data-pp="song" data-index="0" aria-label="在我的手机上放 ${esc(top.title)}"><span class="pp-disc" style="--h:${seed(top.title) % 360}"></span><span><small>正在播放</small><b>${esc(top.title)}</b><em>${esc(top.artist || '未知歌手')}</em></span><i>${PLAY}</i></button>
        <div class="pp-group">${songs.map((s, i) => `<button type="button" class="pp-song" data-pp="song" data-index="${i}" aria-label="在我的手机上放 ${esc(s.title)}"><span class="pp-cover" style="--h:${seed(s.title) % 360}"></span><span class="pp-row-main"><b>${esc(s.title)}</b><small>${esc(s.artist || '未知歌手')}</small></span>${PLAY}</button>`).join('')}</div>
        <p class="pp-foot">点一首，用你的手机放</p>`
        : '<p class="pp-empty">最近没有听歌<br><small>再「接着看」一次就有了</small></p>'}</div></div>`;
  }

  function weather() {
    const now = new Date(snap.at), high = HIGHS[now.getMonth()];
    const day = i => { const d = new Date(snap.at + i * 86400000), r = seed(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`); const [word, art] = SKIES[r % SKIES.length]; const hi = high + (r >>> 4) % 7 - 3; return {d, word, art, hi, lo: hi - 6 - (r >>> 8) % 4}; };
    const t = day(0), hour = now.getHours(), feel = Math.round(t.lo + (t.hi - t.lo) * Math.max(0, Math.sin(Math.PI * (hour - 6) / 14)));
    return `<div class="pp-app pp-weather" data-sky="${t.art}">${bar('', '', '')}
      <div class="pp-body"><div class="pp-sky-now"><p>我的位置</p><b>${feel}°</b><span>${t.word}</span><small>最高 ${t.hi}° 最低 ${t.lo}°</small></div>
      <div class="pp-sky-card"><div class="pp-hours">${Array.from({length: 6}, (_, i) => { const h = (hour + i) % 24, v = Math.round(t.lo + (t.hi - t.lo) * Math.max(0, Math.sin(Math.PI * (h - 6) / 14))); return `<span><small>${i ? pad(h) + '时' : '现在'}</small>${sky(h >= 19 || h < 6 ? (t.art === 'sun' ? 'cloud' : t.art) : t.art)}<b>${v}°</b></span>`; }).join('')}</div></div>
      <div class="pp-sky-card"><p class="pp-sky-head">7 天预报</p>${Array.from({length: 7}, (_, i) => { const x = day(i); return `<div class="pp-sky-day"><span>${i ? '周' + WEEK[x.d.getDay()] : '今天'}</span>${sky(x.art)}<small>${x.lo}°</small><i style="--a:${(x.lo - high + 12) / 24};--b:${(x.hi - high + 12) / 24}"></i><small>${x.hi}°</small></div>`; }).join('')}</div></div></div>`;
  }

  function clock() {
    const now = new Date(), r = seed('alarm'), wake = 6 + r % 3, minute = [0, 10, 15, 30, 40][(r >>> 3) % 5];
    // Alarms: getting up on weekdays, a second one ten minutes on, and one for each plan that says a time.
    const alarms = [{h: wake, m: minute, label: '工作日', on: true}, {h: wake + (minute + 10 >= 60 ? 1 : 0), m: (minute + 10) % 60, label: '再不起就迟到了', on: (r >>> 6) % 3 !== 0}];
    for (const e of snap.events || []) { const t = e.when.match(/(\d{1,2})[:：](\d{2})/); if (t && alarms.length < 5) alarms.push({h: Number(t[1]) % 24, m: Number(t[2]), label: e.what, on: true}); }
    return `<div class="pp-app pp-clockapp">${bar('闹钟', '', '<span class="pp-link pp-plus">＋</span>')}
      <div class="pp-body"><p class="pp-clock-now"><b>${pad(now.getHours())}:${pad(now.getMinutes())}</b><small>${now.getMonth() + 1}月${now.getDate()}日 星期${WEEK[now.getDay()]}</small></p>
      <div class="pp-group">${alarms.map(a => `<div class="pp-alarm${a.on ? '' : ' off'}"><span><b>${pad(a.h)}:${pad(a.m)}</b><small>${esc(a.label)}</small></span>${switchHTML(a.on)}</div>`).join('')}</div></div></div>`;
  }

  function settings() {
    const r = seed('settings'), screen = 2 + r % 6, minutes = (r >>> 3) % 60;
    const wifi = ['家里的Wi-Fi', `${snap.name}的网络`, 'CMCC-' + (r % 0xffff).toString(16).toUpperCase().padStart(4, '0'), 'TP-LINK_' + ((r >>> 5) % 0xffff).toString(16).toUpperCase().padStart(4, '0')][(r >>> 9) % 4];
    const row = (label, value, tone, sw) => `<div class="pp-set-row"><i style="background:${tone}"></i><span>${label}</span>${sw === undefined ? `<small>${esc(value)}</small><em>›</em>` : switchHTML(sw)}</div>`;
    return `<div class="pp-app pp-settings">${bar('设置')}
      <div class="pp-body"><div class="pp-group pp-me">${face(snap.name, 58)}<span><b>${esc(snap.name)}</b><small>账号、云端备份与同步</small></span><em>›</em></div>
      <div class="pp-group">${row('飞行模式', '', '#ff9500', false)}${row('无线局域网', wifi, '#007aff')}${row('蓝牙', '打开', '#007aff')}${row('蜂窝网络', '', '#34c759')}</div>
      <div class="pp-group">${row('通知', '', '#ff3b30')}${row('声音与触感', '', '#ff2d55')}${row('勿扰模式', '', '#5856d6', (r >>> 4) % 2 === 0)}${row('屏幕使用时间', `今日 ${screen} 小时 ${minutes} 分`, '#5856d6')}</div>
      <div class="pp-group">${row('电池', `${k.battery}%`, '#34c759')}${row('墙纸', snap.wallpaper?.text ? '已设定' : '默认', '#32ade6')}${row('隐私与安全', '', '#007aff')}</div></div></div>`;
  }

  function camera() {
    const shot = k.album()[0];
    return `<div class="pp-camera"><div class="pp-finder"><i class="pp-grid-lines"></i><span class="pp-focus"></span></div>
      <div class="pp-modes"><span>延时摄影</span><span>慢动作</span><span>视频</span><span class="on">照片</span><span>人像</span><span>全景</span></div>
      <div class="pp-shutter-row"><button type="button" class="pp-last" data-pp="open" data-id="photos" aria-label="相册">${shot ? k.picture(shot, 0) : ''}</button><button type="button" class="pp-shutter" data-pp="snap" aria-label="拍照"></button><button type="button" class="pp-flip" data-pp="flip" aria-label="翻转镜头"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2M20 4v4h-4M4 20v-4h4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div>`;
  }

  return {phone, calendar, music, weather, clock, settings, camera};
}
