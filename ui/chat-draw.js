import {activeStyle, pictureInputs} from '../core/draw.js';
import {findRoute} from '../core/routes.js';
import {avatar, btn, esc, field, input, textArea} from './common.js';
import {icon} from './icons.js';

let nextJob = 0;
const selfPortrait = idea => /(?:我|自己)的(?:一张)?自拍|给(?:我)?自己拍|我(?:在|正)?(?:坐|站|躺|靠|穿|对镜)|拍(?:一?[张幅])?我(?:的|在|正|自己|$)|(?:^|[，。]\s*)(?:来|画|发|生成|帮我画|想发)?(?:一?张)?自拍(?:$|[，。照])|\b(?:my selfie|selfie of me)\b/i.test(idea);

export function chatPictureSheet(ctx, {name, current, send}) {
  const {api, win} = ctx;
  const d = ctx.dialog('生成配图', '');
  const active = () => d.live && current();
  const job = 'chat-draw:' + ++nextJob;
  const routes = api.rolesHere?.() || api.readState().routes;
  let choice = null, idea = '', customLook = '', written = null;
  let picture = null, url = '', photoId = '', busy = false;

  const selection = () => choice ?? (selfPortrait(idea.trim()) ? 'self' : '');
  function subject() {
    const key = selection(), self = key === 'self';
    const role = self ? findRoute(routes, api.userName?.() || name) : routes.find(r => 'role:' + r.id === key);
    const label = self ? '我' : role?.name || '';
    const savedLook = role?.appearance?.trim();
    const persona = self && !savedLook ? api.chatDrawPersona?.() || '' : '';
    return {label, role: savedLook ? role : null, persona, needsLook: !!label && !savedLook && !persona};
  }

  function status(message = '', error = false) {
    const line = d.body.querySelector('.chat-draw-status');
    line.textContent = message;
    line.hidden = !message;
    line.classList.toggle('error-copy', error);
  }

  function syncSubject() {
    const {label, needsLook} = subject();
    d.body.querySelector('[data-action=draw-cast] small').textContent = label || '未指定';
    d.body.querySelector('[data-look]').hidden = !needsLook;
  }

  function render() {
    const draw = api.readState().draw, style = activeStyle(draw);
    const styleLabel = [api.drawCatalog?.engineNames?.[draw.engine], style?.name].filter(Boolean).join(' · ');
    const statusLine = '<p class="hint chat-draw-status" role="status" hidden></p>';
    if (picture) {
      d.body.innerHTML = '<img class="chat-send-preview" alt="生成的配图" src="' + esc(url) + '">'
        + field('照片说明', input('chat-draw-caption', '', 'text', 'maxlength="200" placeholder="可以不填"'))
        + statusLine
        + '<div class="actions">' + btn('draw-back', '修改描述', 'text-button')
        + btn('draw-keep', '存到相册', 'secondary') + btn('draw-send', icon('send') + '发送', 'primary') + '</div>';
      return;
    }
    d.body.innerHTML = field('想画什么', textArea('chat-draw-idea', idea, 'rows="3" maxlength="1000" placeholder="比如：桌上刚掰开的烤红薯，像手机随手拍的"'))
      + '<div class="group"><button type="button" class="list-row" data-action="draw-cast">'
      + icon('person') + '<span><strong>谁出镜</strong><small></small></span>' + icon('next') + '</button></div>'
      + '<div data-look hidden>' + field('这次的外貌', textArea('chat-draw-look', customLook, 'rows="2" maxlength="500" placeholder="比如：齐肩黑发，浅棕色眼睛"')) + '</div>'
      + statusLine
      + '<div class="actions"><small class="hint">' + esc(styleLabel) + '</small>'
      + btn('draw-make', icon('wand') + (written ? '重新生成' : '生成一张'), 'primary') + '</div>';
    syncSubject();
  }

  function pickSubject() {
    const rows = [
      {key: '', label: '未指定', glyph: icon('image')},
      {key: 'self', label: '我', detail: name === '我' ? '' : name, glyph: icon('person')},
      ...routes.map(r => ({
        key: 'role:' + r.id, label: r.name, detail: r.appearance?.trim() ? '' : '可临时填写外貌',
        glyph: avatar(r.name, r.voice ? r.engine : 'none', 34),
        search: [r.name, ...(r.aliases || [])].join(' '),
      })),
    ];
    const picker = ctx.dialog('谁出镜', (routes.length > 8 ? field('搜索角色', input('chat-draw-search', '', 'search', 'placeholder="输入角色名"')) : '')
      + '<div class="pick-list">' + rows.map(row =>
        '<button type="button" class="list-row" data-cast="' + esc(row.key) + '" data-search="' + esc((row.search || row.label).toLowerCase()) + '" aria-pressed="' + (selection() === row.key) + '">'
        + row.glyph + '<span><strong>' + esc(row.label) + '</strong>' + (row.detail ? '<small>' + esc(row.detail) + '</small>' : '') + '</span>'
        + (selection() === row.key ? icon('check') : '') + '</button>').join('') + '</div>', {over: true});
    picker.body.addEventListener('click', e => {
      const row = e.target.closest('[data-cast]');
      if (!row || !active()) return;
      if (selection() !== row.dataset.cast) {
        customLook = '';
        d.body.querySelector('[data-field=chat-draw-look]').value = '';
        written = null;
      }
      choice = row.dataset.cast;
      picker.close();
      syncSubject();
      status();
    });
    picker.body.addEventListener('input', e => {
      const word = e.target.value.trim().toLowerCase();
      for (const row of picker.body.querySelectorAll('[data-cast]')) row.hidden = !!word && !row.dataset.search.includes(word);
    });
  }

  async function allowCost() {
    const ask = api.paidPrompt();
    return ctx.confirm(ask.title, ask.text, {over: true});
  }

  async function generate() {
    const description = idea.trim();
    if (!description) return status('先写一句想画什么');
    const {role, persona, needsLook} = subject();
    if (needsLook && !customLook.trim()) return status('还没有外貌设定，写一句这次的外貌，或从「谁出镜」选一个已有角色。');
    if (!api.drawReady()) return status(api.drawMissing(), true);
    if (!api.writePrompt) return status('当前环境无法使用绘图提示词助手', true);

    const settings = api.readState(), draw = settings.draw;
    const params = draw.engine === 'nai' ? {...draw.params, seed: -1} : {seed: -1};
    let allowPaid = false;
    if (api.drawQuote(params).free === false) {
      allowPaid = await allowCost();
      if (!allowPaid || !active()) return;
    }

    const describedLook = needsLook ? customLook.trim() : persona;
    const key = JSON.stringify([draw.engine, draw.engine === 'nai' ? draw.params.model : draw[draw.engine].model, activeStyle(draw)?.id, description, role?.id, role?.appearance, describedLook]);
    if (written?.key !== key) {
      written = null;
      status('正在写提示词…');
      const {prompt} = await api.writePrompt(description, role ? [role.name] : [], {explicitCast: true, describedLook});
      if (!active()) return;
      written = {key, prompt};
    }
    const input = pictureInputs({...settings, routes: role ? [role] : []}, {prompt: written.prompt, characters: role ? [role.name] : []});
    const request = {...input, params, name: '聊天配图', label: '聊天配图 · ' + description.slice(0, 24), key: job, temporary: true};
    const make = () => {
      if (api.readState().draw.engine !== draw.engine) throw Error('绘图引擎已切换，请重新生成');
      status('正在排队出图…');
      return api.generateImage({...request, allowPaid});
    };
    let result;
    try { result = await make(); }
    catch (error) {
      if (error.code !== 'PAID' || allowPaid || !active()) throw error;
      allowPaid = await allowCost();
      if (!allowPaid || !active()) { if (active()) status(); return; }
      result = await make();
    }
    if (!active()) return;
    if (!result.blob) throw Error('绘图引擎没有返回图片');
    picture = result;
    url = win.URL.createObjectURL(result.blob);
    render();
  }

  async function savePicture() {
    if (!photoId) {
      const type = picture.blob.type;
      const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
      photoId = (await api.addPhoto({name: '聊天配图-' + Date.now() + '.' + ext, blob: picture.blob, info: picture.info})).id;
    }
    return photoId;
  }

  function dropPreview() {
    if (url) win.URL.revokeObjectURL(url);
    url = '';
    picture = null;
    photoId = '';
  }

  d.body.addEventListener('input', e => {
    if (e.target.dataset.field === 'chat-draw-idea') {
      idea = e.target.value;
      syncSubject();
    }
    if (e.target.dataset.field === 'chat-draw-look') customLook = e.target.value;
  });
  d.body.addEventListener('click', async e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action || !active() || busy) return;
    if (action === 'draw-cast') return pickSubject();
    if (action === 'draw-back') { dropPreview(); return render(); }

    const caption = d.body.querySelector('[data-field=chat-draw-caption]')?.value.trim() || '';
    const controls = [...d.body.querySelectorAll('button, textarea, input')].filter(el => !el.disabled);
    busy = true;
    for (const el of controls) el.disabled = true;
    try {
      if (action === 'draw-make') await generate();
      else if (action === 'draw-keep') {
        await savePicture();
        if (active()) status('已保存到相册');
      } else if (action === 'draw-send') {
        const id = await savePicture();
        if (!active()) return;
        await send(id, caption);
        d.close();
      }
    } catch (error) {
      if (active()) status(error.message || '这次没有完成，请重试', true);
    } finally {
      busy = false;
      if (active()) {
        for (const el of controls) el.disabled = false;
        const save = d.body.querySelector('[data-action=draw-keep]');
        if (save && photoId) { save.textContent = '已存到相册'; save.disabled = true; }
        const make = d.body.querySelector('[data-action=draw-make]');
        if (make && written) make.innerHTML = icon('wand') + '重新生成';
      }
    }
  });
  d.onClose(() => {
    dropPreview();
    const pending = api.drawQueue?.().find(entry => entry.key === job);
    if (pending && pending.state !== 'running') api.cancelDraw(job);
  });
  render();
}
