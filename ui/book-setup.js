import {btn, esc, field, help, select} from './common.js';
import {icon} from './icons.js';

const RANGES = [['20','最近 20 条'], ['50','最近 50 条'], ['all','整个聊天'], ['pick','自选起止']];
export const BOOK_SOURCES = [['chat','当前剧情'], ['theater','小剧场'], ['paste','粘贴文字']];
export const BOOK_TEXT_LIMIT = 24000;

export function bookForm(info, theater = '') {
  return {kind:theater ? 'theater' : info?.length ? 'chat' : 'paste', chat:info?.chat ?? '',
    range:info?.length > 20 ? '20' : 'all', from:Math.max(0, (info?.length || 0) - 20), to:(info?.length || 0) - 1,
    theater, text:'', mode:'retell', theme:'auto', pictures:'draw', art:'book', length:'auto', title:'',
    before:null, world:false, persona:false, names:[], skipBooks:[], skipEntries:[], removedBooks:[], extraBooks:[], refsOpen:false};
}

export const bookRange = (info, form) => form.range === 'pick' ? [form.from, form.to]
  : [form.range === 'all' ? 0 : Math.max(0, info.length - Number(form.range)), info.length - 1];

export function rangeMarkup(rows, from, to) {
  const chosen = rows.filter(row => row.id >= from && row.id <= to);
  if (!chosen.length) return '<small>没有可用的故事内容</small>';
  const first = chosen[0], last = chosen.at(-1);
  const excerpt = row => (row.name ? row.name + ' · ' : '') + row.preview;
  return '<strong>第 ' + (first.id + 1) + ' 条至第 ' + (last.id + 1) + ' 条 · 共 ' + chosen.length + ' 条</strong>'
    + '<small>' + esc(excerpt(first)) + '</small>' + (last !== first ? '<small>' + esc(excerpt(last)) + '</small>' : '');
}

export function pickBookRange(ctx, rows, range, quick = false) {
  if (!rows.length) { ctx.notify('没有可选的消息'); return Promise.resolve(null); }
  const entries = rows.map(row => [row.id, (row.id + 1) + ' · ' + (row.name ? row.name + ' · ' : '') + row.preview]);
  const first = rows.find(row => row.id >= range[0])?.id ?? rows[0].id;
  const last = rows.findLast(row => row.id <= range[1])?.id ?? rows.at(-1).id;
  const d = ctx.dialog(quick ? '选择故事范围' : '选择参考前情',
    (quick ? field('范围', select('bk-quick', 'pick', RANGES)) : '')
    + field('从这条开始', select('bk-from', first, entries))
    + field('到这条结束', select('bk-to', last, entries))
    + '<div class="bk-range-preview"></div><div class="actions">' + btn('bk-range-ok', '确认范围', 'primary') + '</div>');
  const start = d.body.querySelector('[data-field=bk-from]'), finish = d.body.querySelector('[data-field=bk-to]'), mode = d.body.querySelector('[data-field=bk-quick]');
  const preview = d.body.querySelector('.bk-range-preview');
  function paint() {
    const manual = !mode || mode.value === 'pick';
    start.disabled = finish.disabled = !manual;
    const from = manual ? Number(start.value) : mode.value === 'all' ? rows[0].id : Math.max(0, rows.at(-1).id + 1 - Number(mode.value));
    const to = manual ? Number(finish.value) : rows.at(-1).id;
    preview.innerHTML = from <= to ? rangeMarkup(rows, from, to) : '<small>终点要在起点之后</small>';
    d.body.querySelector('[data-action=bk-range-ok]').disabled = from > to;
  }
  d.body.addEventListener('change', paint);
  paint();
  return new Promise(resolve => {
    d.onClose(() => resolve(null));
    d.body.querySelector('[data-action=bk-range-ok]').addEventListener('click', () => {
      resolve({range:mode?.value || 'pick', from:Number(start.value), to:Number(finish.value)});
      d.close();
    });
  });
}

export function readBookSource(form, info, api, theaters, doc) {
  if (form.kind === 'chat') {
    if (!info || info.chat !== form.chat || !info.length) throw Error('先在酒馆选好一段剧情');
    return {...api.bookSource(...bookRange(info, form)), kind:'chat'};
  }
  const base = {chat:'', from:0, to:0, user:info?.user || api.userName?.() || '', kind:form.kind};
  if (form.kind === 'paste') {
    if (!form.text.trim()) throw Error('先粘贴要做成绘本的文字');
    if (form.text.length > BOOK_TEXT_LIMIT) throw Error('这段文字太长，请分成几本绘本');
    return {...base, title:'', messages:[{id:0, steps:[{kind:'narrate', text:form.text, verbatim:true}]}]};
  }
  const theater = theaters.find(row => row.id === form.theater);
  if (!theater) throw Error('先选择一段小剧场');
  let steps;
  if (theater.form === 'script') steps = theater.lines.map(line => ({kind:line.narration ? 'narrate' : 'say', role:line.role, text:line.translation || line.text, emotion:line.emotion, verbatim:true}));
  else {
    const raw = theater.form === 'card' ? theater.html : theater.body;
    let text = raw;
    if (theater.form === 'card' || /^\s*(?:```html\b|<[!a-z])/i.test(raw)) {
      const template = doc.createElement('template');
      template.innerHTML = raw.replace(/^\s*```html\s*|\s*```\s*$/gi,'');
      template.content.querySelectorAll('head,title,script,style,template,iframe,noscript').forEach(node => node.remove());
      template.content.querySelectorAll('p,h1,h2,h3,div,li,br,section,article').forEach(node => node.after(doc.createTextNode('\n')));
      text = template.content.textContent.trim();
    }
    if (text.length > BOOK_TEXT_LIMIT) throw Error('这段小剧场太长，可分段粘贴制作');
    steps = text ? [{kind:'narrate', text, verbatim:true}] : [];
  }
  return {...base, title:theater.title, messages:steps.length ? [{id:0, steps}] : []};
}

export const bookSpeakers = source => [...new Set((source?.messages || []).flatMap(message => message.steps.filter(step => step.kind === 'say').map(step => step.role)).filter(Boolean))];

export function bookReferenceMarkup(form, rows, roles, label) {
  const summary = [form.before && '前情', form.world && '世界书', form.names.length && form.names.length + ' 位角色', form.persona && 'User 人设'].filter(Boolean);
  const toggle = (key, title) => '<label class="setting-row"><span>' + esc(title) + '</span><input class="switch" type="checkbox" data-bk-ref="' + key + '"' + (form[key] ? ' checked' : '') + '></label>';
  return '<details class="bk-references"' + (form.refsOpen ? ' open' : '') + '><summary>参考资料' + (summary.length ? ' · ' + esc(summary.join('、')) : '（选填）') + '</summary>'
    + '<div class="bk-reference-fields">'
    + (rows.length ? btn('bk-before', icon('book') + (form.before ? '调整参考前情' : '选择参考前情'), 'text-button') : '')
    + (form.before ? '<div class="bk-range-preview">' + rangeMarkup(rows, ...form.before) + btn('bk-before-clear','移除前情','text-button') + '</div>' : '')
    + btn('bk-roles', '<span>角色设定</span><small>' + (form.names.length ? '已选 ' + form.names.length + ' 位' : '未选择') + '</small>' + icon('next'), 'bt-lore-link', roles.length ? '' : 'disabled')
    + toggle('persona','参考 User 人设')
    + toggle('world','参考世界书')
    + (form.world ? btn('bk-world', '<span>选择条目</span><small data-bk-lore-count>' + esc(label) + '</small>' + icon('next'), 'bt-lore-link') : '')
    + '</div></details>';
}
