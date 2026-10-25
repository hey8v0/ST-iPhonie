import {createView, esc, btn, field, input, select, textArea, toggle, heading, help, groupTitle, plate, avatar, empty, pictureCopies} from './common.js';
import {icon} from './icons.js';
import {saveFile, shareFile, canShareFiles} from '../download.js';
import {openAlbum} from './album-viewer.js';
import {vibePanel} from './vibes.js';
import {comfyPlans} from './comfy-plans.js';
import {comfyLoraPanel} from './comfy-lora-panel.js';
import {styleSheets} from './draw-styles.js';
import {tokenBudget, loadCounter, countPicture, countField, tagCost} from '../core/tokens.js';
import {refPanel} from './draw-refs.js';
import {pictureData, readNovelAI, fitBase, scaledPicture, enhanceSizes} from './draw-images.js';
import {DIRECTOR_TOOLS, DIRECTOR_WORDS, EMOTIONS, upscaleBy, UPSCALE_MAX} from '../core/novelai.js';

const SIZES = [['portrait', '竖图', 832, 1216], ['landscape', '横图', 1216, 832], ['square', '方图', 1024, 1024], ['tall', '大竖图', 1024, 1536]];
/** Pictures kept in the column beside the canvas (this visit of the app; all of them are also in the album). */
const MAX_RESULTS = 30;
const TIERS = {0: '未订阅', 1: 'Tablet', 2: 'Scroll', 3: 'Opus'};
const POSITION = i => i < 0 ? '自动' : 'ABCDE'[i % 5] + (Math.floor(i / 5) + 1);

export function drawApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'draw'), urls = new Map();
  let tab = 'prompt', idea = '', prompt = '', negative = '', characters = [], seed = -1, results = [], current = -1, newest = false, busy = false, subscription = null, epoch = 0;
  /** How many pictures one 生成 makes (one request each, one after another). */
  let count = 1;
  /** The tools for the shown picture: folded until asked for. */
  let toolsOpen = false;
  // ComfyUI: models, samplers and schedulers read from it (null until 读取 is pressed).
  let comfyInfo = null, comfyRequest = 0, comfyAddress = '';
  const plans = comfyPlans(ctx, () => render());
  const vibes = vibePanel({ctx, api, root: () => v.root, rerender: () => render()});
  const loras = comfyLoraPanel({ctx, api, root: () => v.root, rerender: () => render()});
  const refs = refPanel({ctx, api, rerender: () => render(), shown: () => results[current] || null});
  let queue = api.drawQueue?.() || [], cloudError = api.cloudQueueError?.() || '', cloudNote = null;
  const jobState = j => j.state === 'running' ? '正在画' : j.state === 'busy' ? `账号正忙，稍后重试（第 ${j.attempt} 次）` : j.state === 'spacing' ? '马上开始'
    : j.state === 'remote' ? (j.cloud?.position > 0 ? `云端排队，前面 ${j.cloud.position} 位` : j.cloud?.cooldown > 5000 ? `大家一起等 ${Math.ceil(j.cloud.cooldown / 1000)} 秒` : '云端马上轮到') : `第 ${j.position + 1} 位`;
  const queueCard = () => (queue.length || cloudError) ? `<div class="group pad queue-card"><div class="row-heading"><strong style="flex:1">排队 · ${queue.length} 张</strong>${queue.length ? btn('cancel-all', '全部取消', 'text-button') : ''}</div>${cloudError && state().queue.cloud.enabled ? `<p class="hint error-copy" style="padding:0 0 6px">${esc(cloudError)}，这次按本机排队</p>` : ''}${queue.map(j => `<div class="setting-row"><span>${esc(j.label || '图片')}</span><small>${esc(jobState(j))}</small>${j.state === 'running' ? '' : btn('cancel-job', icon('close'), 'text-button', `data-key="${esc(j.key)}" aria-label="取消这张"`)}</div>`).join('')}</div>` : '';
  const state = () => api.getState().draw;
  const eng = () => state().engine, engineName = (e = eng()) => api.drawCatalog.engineNames?.[e] || 'NovelAI';
  // Cloud queue fields as typed; saved when an input changes or a button uses them.
  const cloudFields = () => {
    const saved = state().queue.cloud, field = key => v.root.querySelector(`[data-cloud=${key}]`)?.value;
    return {enabled: saved.enabled, kind: saved.kind, url: (field('url') ?? saved.url).trim(), room: (field('room') ?? saved.room).trim()};
  };
  // Each engine remembers its own 画风; GPT and ComfyUI use NovelAI's until one is picked for them.
  const styleId = () => { const d = state(); return (d.engine === 'nai' ? '' : d[d.engine]?.style) || d.activeStyle; };
  const style = () => { const d = state(); return d.styles.find(s => s.id === styleId()) || d.styles[0]; };
  // A result as a file: NovelAI_种子.png.
  const resultFile = async result => { const photo = await api.getPhoto(result.photoId); if (!photo) throw Error('这张图已经不在相册里了'); return {source: photo.blob, name: `${(api.drawCatalog.engineNames?.[result.engine] || 'NovelAI').replace(/\s+/g, '')}_${result.seed >= 0 ? result.seed : photo.name}`}; };
  const urlFor = async id => {
    if (urls.has(id)) return urls.get(id);
    const photo = await api.getPhoto(id);
    if (!photo) return '';
    const url = ctx.win.URL.createObjectURL(photo.blob);
    urls.set(id, url);
    return url;
  };

  function quote() {
    const d = state();
    return api.drawQuote(d.engine === 'nai' ? {...d.params, ...(seed >= 0 ? {seed} : {})} : seed >= 0 ? {seed} : {}, d.engine === 'nai' ? refs.extra() : {});
  }
  function costChip(q) {
    const e = eng();
    if (!api.drawReady()) return `<span class="chip" data-engine="none">${e === 'comfy' ? '未填地址' : '未填密钥'}</span>`;
    if (e === 'gpt') return `<span class="chip${q.free === false ? ' warn' : ''}">${icon('alert')}每张都要花钱${q.free === false ? '' : ' · 不先问'}</span>`;
    if (e === 'comfy') return `<span class="chip">ComfyUI</span>`;
    if (q.free === true) return `<span class="chip">${icon(q.guard ? 'lock' : 'unlock')}${q.v5 ? `V5 免费额度 ${q.usage.percent}%` : '免费档 · 0 Anlas'}</span>`;
    if (q.free === false) return `<span class="chip warn">${icon('alert')}${q.v5 && q.usage && q.params.steps <= 28 && q.params.width * q.params.height <= 1048576 ? 'V5 免费额度用完 · 会扣 Anlas' : '会扣 Anlas'}</span>`;
    return `<span class="chip" data-engine="none">${icon(q.guard ? 'lock' : 'unlock')}免费档内 · 订阅未确认</span>`;
  }

  async function render() {
    const ticket = ++epoch, d = state(), e = d.engine, q = quote(), p = q.params, keyed = api.drawReady();
    // ComfyUI: the scheme in use, which parameters its workflow takes, and its LoRAs.
    let comfy = null;
    if (e === 'comfy') { try { comfy = api.comfyLoraInfo(); } catch (error) { comfy = {nodes: [], sources: [], disabled: [], controls: [], error: error.message, missing: ''}; } }
    if (comfyAddress !== d.comfy.url) { comfyAddress = d.comfy.url; comfyInfo = null; comfyRequest++; }
    if (tab === 'vibe' || tab === 'lora') tab = e === 'nai' ? 'vibe' : e === 'comfy' ? 'lora' : 'prompt';
    if (tab === 'refs' && e !== 'nai') tab = 'prompt';
    const shown = results[current];
    const main = shown ? await urlFor(shown.photoId) : '';
    const thumbs = await Promise.all(results.map(r => urlFor(r.photoId)));
    if (v.disposed || ticket !== epoch) return;
    const size = SIZES.find(([, , w, h]) => w === d.params.width && h === d.params.height)?.[0] || 'custom';
    const tabs = [['prompt', '提示词'], ['chars', '角色'], ...(e === 'nai' ? [['refs', '参考图' + (refs.badge() ? ` · ${refs.badge()}` : '')]] : []), ['params', '参数'], ...(e === 'nai' ? [['vibe', 'Vibe']] : e === 'comfy' ? [['lora', 'LoRA']] : [])];
    v.root.dataset.engine = e;
    let body = '';
    if (tab === 'prompt') body = `
      <div class="group pad">${field('这张图的提示词', textArea('prompt', prompt, 'rows="4" placeholder="英文 tag，逗号分隔，例如 2girls, rainy day, cafe window, sharing an umbrella"'), e === 'gpt' ? '会和画风的固定正面、每个角色的外貌一起整理成一段英文描述发给 GPT。画师串、权重括号和负面不会发给 GPT。' : e === 'comfy' ? '实际发送：画师串 + 固定正面 + 这里的提示词，后面接上每个角色的外貌；NovelAI 的权重写法会自动换成 ComfyUI 的。' : '实际发送：画师串 + 固定正面 + 这里的提示词。')}
        <div class="token-meter" data-token-meter="positive" hidden></div>
        <div class="field idea-field"><span>想画什么${help('用中文说一句就行，比如「下雨天两个人在便利店门口共撑一把伞」，也可以写很多要求（框会跟着变高），点「帮我写」，模型会补成完整的英文提示词填到上面（会换掉上面原来的）。可以直接写人名：作品里的角色模型会写成它认得的 tag；角色 App 里登记了外貌的人，模型只写名字，插件会把他们加进「角色」并带上外貌。用 NovelAI 时会按 token 上限尽量写满。')}</span>${textArea('idea', idea, 'class="idea-box" rows="2" maxlength="1000" placeholder="例如：下雨天两个人共撑一把伞。可以写很多要求：动作、表情、衣服、天气、镜头……"')}<div class="actions" style="margin:6px 0 0">${btn('write-prompt', icon('wand') + '帮我写', 'secondary')}${btn('suggest', icon('book') + '从剧情生成', 'secondary')}</div></div>
</div>
        ${e === 'gpt' ? '' : `<details data-group="draw-negative" ${negative.trim() ? 'open' : ''}><summary>这张图额外的负面<small class="fold-note">${negative.trim() ? '' : '没有'}</small></summary><div class="fold-body">${textArea('negative', negative, 'rows="2" aria-label="这张图额外的负面" placeholder="可以留空，会和固定负面合在一起"')}<div class="token-meter" data-token-meter="negative" hidden></div></div></details>`}`;
    if (tab === 'chars') body = (characters.length ? characters.map((c, i) => `
      <div class="group pad draw-char" data-engine="${ctx.engineOf(c.name)}"><div class="row-heading">${avatar(c.name, ctx.engineOf(c.name), 30)}<strong style="flex:1">${esc(c.name)}</strong><span class="chip">位置 ${POSITION(c.position)}</span>${btn('remove-char', icon('trash'), 'text-button', `data-index="${i}" aria-label="移除 ${esc(c.name)}"`)}</div>
        <div class="char-body">${textArea('char', c.prompt, `data-index="${i}" rows="3" aria-label="${esc(c.name)} 的提示词"`)}
          <div class="pos-grid" aria-label="画面位置">${Array.from({length: 25}, (_, k) => `<button data-action="position" data-index="${i}" data-position="${k}" aria-pressed="${c.position === k}" aria-label="位置 ${POSITION(k)}"></button>`).join('')}</div></div>
        ${btn('position', '让模型自己决定位置', 'text-button', `data-index="${i}" data-position="-1" aria-pressed="${c.position < 0}"`)}</div>`).join('') : empty('还没有加入角色', e === 'gpt' ? '每个角色的外貌和在画面里的位置，会写进给 GPT 的描述里。' : e === 'comfy' ? 'ComfyUI 没有分角色的提示词：每个人的外貌接在提示词后面，位置不起作用。' : 'V4 / 4.5 可以给每个角色单独写外貌，并指定在画面里的大致位置。', 'person'))
      + `<div class="token-meter" data-token-meter="positive" hidden></div><div class="actions">${btn('add-char', icon('add') + '从角色里添加', 'secondary')}${btn('add-custom', icon('add') + '手动添加', 'secondary')}</div>`;
    if (tab === 'params' && e === 'gpt') body = gptParams(d.gpt);
    if (tab === 'params' && e === 'comfy') body = comfyParams(d.comfy, comfy.controls);
    if (tab === 'params' && e === 'nai') body = `
      <div class="group pad">
        ${field('模型', select('model', d.params.model, api.drawCatalog.models.map(m => [m, api.drawCatalog.modelNames[m] || m])), /^nai-diffusion-5/.test(d.params.model) ? 'V5 对 Opus 不是无限的：免费档内的图用一份会慢慢恢复的免费额度，用完后改扣 Anlas。V4.5 及更早的模型仍然无限。' : '')}
        <div class="field"><span>尺寸</span><div class="size-chips">${SIZES.map(([k, label, w, h]) => `<button data-action="size" data-size="${k}" aria-pressed="${size === k}" ${d.guard && w * h > 1048576 ? 'disabled' : ''}><i style="width:${w / 100}px;height:${h / 100}px"></i>${label}<small>${w}×${h}</small></button>`).join('')}</div></div>
        <div class="field"><div class="meter-label"><span>步数${d.guard ? ' · 免费档最多 28' : ''}</span><output>${d.params.steps}</output></div><input class="slider" type="range" data-param="steps" min="1" max="${d.guard ? 28 : 50}" value="${d.params.steps}" aria-label="步数"></div>
        <div class="field"><div class="meter-label"><span>提示词相关性 CFG</span><output>${d.params.scale.toFixed(1)}</output></div><input class="slider" type="range" data-param="scale" min="0" max="10" step="0.1" value="${d.params.scale}" aria-label="CFG"></div>
        ${field('采样器', select('sampler', d.params.sampler, api.drawCatalog.samplers.map(m => [m, m])))}
        ${field('噪声调度', select('schedule', d.params.schedule, api.drawCatalog.schedules.map(m => [m, m])))}
        <div class="field"><span>种子${help('填 -1 或留空表示每次随机。')}</span><div class="inline-row">${input('seed', seed >= 0 ? seed : '', 'number', 'min="-1" placeholder="随机"')}${btn('dice', icon('dice'), 'round-button', 'aria-label="随机一个种子"')}</div></div>
        ${/^nai-diffusion-5/.test(d.params.model) ? '' : toggle('variety', 'Variety+', d.params.variety, '让构图更多变，适合 V4 / 4.5。')}
      </div>
      <div class="group">${toggle('guard', '免费档守卫', d.guard, '开启时步数不超过 28、尺寸不超过 1024×1024，不会发出扣 Anlas 的请求。关闭后，会扣点的生成每次都先问你。')}</div>
      <details data-group="draw-queue"><summary>排队<small class="fold-note">间隔 ${d.queue.gap} 秒 · ${d.queue.cloud.enabled ? '云端队列开着' : '本机排队'}</small></summary><div class="fold-body">
      ${groupTitle('排队', help('一个 NovelAI 账号同一时间只能画一张。几个人共用账号时，同时请求会得到 429，太频繁还可能被风控。\n\n插件里所有出图都排成一队，一张画完再发下一张（同一个浏览器里开的几个酒馆页面也会互相等）；两张之间留出间隔；遇到 429 就等一会儿再试，等待时间一次比一次长。'))}
      <div class="group pad">
        <div class="field"><div class="meter-label"><span>两张图之间至少间隔</span><output>${d.queue.gap} 秒</output></div><input class="slider" type="range" data-queue="gap" min="0" max="60" value="${d.queue.gap}" aria-label="两张图之间的间隔秒数"></div>
        <div class="field"><div class="meter-label"><span>账号正忙（429）时重试</span><output>${d.queue.retries} 次</output></div><input class="slider" type="range" data-queue="retries" min="0" max="10" value="${d.queue.retries}" aria-label="429 重试次数"></div>
      </div>
      ${groupTitle('云端队列', help('几个人共用一个 NovelAI 账号时，让所有人排同一条队：前面有人在画就先等着。\n\n两种队列服务：\n· 按密钥排队：已经有的队列服务（比如智绘姬用的那个）。不用房间码，用同一个 NovelAI 密钥的人自动排进同一条队，也能和用智绘姬的朋友一起排。插件只发送密钥的 SHA-256 摘要（算不回密钥）、这台浏览器的随机编号和每张图的随机编号。\n· 房间码：自己在 Cloudflare 免费部署的队列（插件目录 cloud-queue/部署说明.md），大家填同一个地址和房间码；撞上 429 时全房间一起等。只发送房间码和排队号。\n\n两种都看不到密钥、提示词和图片。连不上时照常出图，只是退回本机排队。'))}
      <div class="group pad">
        ${toggle('cloud', '使用云端队列', d.queue.cloud.enabled)}
        <div class="field"><span>队列类型</span><div class="segmented" style="margin:0">${[['keyhash', '按密钥排队'], ['room', '房间码']].map(([k, l]) => `<button data-action="cloud-kind" data-kind="${k}" aria-pressed="${d.queue.cloud.kind === k}">${l}</button>`).join('')}</div></div>
        <div class="field"><span>队列地址</span><input data-cloud="url" type="url" value="${esc(d.queue.cloud.url)}" placeholder="${d.queue.cloud.kind === 'keyhash' ? 'https://……hf.space' : 'https://st-iphonie-queue.你的名字.workers.dev'}" autocomplete="off" aria-label="队列地址"></div>
        ${d.queue.cloud.kind === 'keyhash' ? '<p class="hint" style="padding:0">不用房间码：用同一个 NovelAI 密钥的人会自动排进同一条队。</p>' : `<div class="field"><span>房间码</span><div class="inline-row"><input data-cloud="room" value="${esc(d.queue.cloud.room)}" placeholder="16–64 位字母或数字" autocomplete="off" aria-label="房间码">${btn('new-room', '生成', 'chip-button')}</div></div>`}
        <div class="actions" style="margin-top:0">${btn('test-cloud', icon('refresh') + '测试连接', 'secondary')}</div>
        ${cloudNote ? `<p class="hint${cloudNote.ok ? '' : ' error-copy'}" style="padding:0">${esc(cloudNote.text)}</p>` : ''}
      </div></div></details>`;
    if (tab === 'vibe') body = vibes.html();
    if (tab === 'refs') body = refs.html();
    if (tab === 'lora') body = plans.summary(comfy) + loras.html(comfy);
    if (tab === 'chat') body = `
      ${d.enabled ? '' : `<div class="banner">${icon('image')}<span>正文出图没有开启，在「设置 · 正文」里打开（配图方式也在那里）。</span>${btn('go-settings', '去打开', 'chip-button')}</div>`}<div class="group">${toggle('auto', '新回复自动出图', d.auto, '只自动画不花钱的：NovelAI 免费档内的图、ComfyUI 的图；GPT 生图在「每张先问」关掉后也会自动画。其余的正文里会显示“点击生成”。')}${toggle('fold', '正文图片默认收起', d.fold, '收起后正文里只留一个小缩略图，点开再看，手机上不占地方。每张图也可以单独收起或展开。')}</div>
      <div class="group">${toggle('strip', '发给模型时去掉旧出图块', d.strip, '出图块留在聊天记录里（图片靠它显示），但之后每次请求模型时会把它们去掉，省下上下文。')}</div>
      <div class="group pad"><p class="hint" style="padding:6px 0">出图块长这样（一张图一块）：${help('场景和每个人分开写：人数、镜头、光线放场景；表情、视线、动作放各自的角色行。插件把画风固定串接在场景前面，把角色 App 里的固定外貌补进对应的角色行，再交给选中的绘图引擎（GPT 会整理成英文描述，ComfyUI 会合成一条提示词）。新角色第一次出现时，模型写的「新外貌」会自动存进角色 App。图片会上传到酒馆，并存进相册。')}</p><pre class="code-preview">${esc(api.picTagFormat)}</pre></div>
      <p class="hint">每条回复固定出 ${(d.presets.find(p => p.id === d.activePreset) || d.presets[0]).count} 张图，在出图规则里改张数。</p><div class="actions">${btn('open-presets', icon('edit') + '编辑出图规则', 'secondary')}</div>`;
    const sub = e === 'gpt' ? d.gpt.model : e === 'comfy' ? '' : subscription ? `${TIERS[subscription.tier] || '订阅'} · ${subscription.anlas} Anlas` : keyed ? '读取中' : '';
    // 正文出图 (how story replies get pictures) is set now and then: a chip by the title, not one more tab.
    v.draw(heading('绘图', (keyed && sub ? `<span class="chip">${esc(sub)}</span>` : '') + btn('tab', icon('image') + '正文出图', 'chip-button', `data-tab="chat" aria-pressed="${tab === 'chat'}"`), engineName(e))
      + `<div class="segmented draw-engines" role="group" aria-label="用哪个画">${api.drawCatalog.engines.map(k => `<button data-action="draw-engine" data-pick="${k}" aria-pressed="${k === e}">${esc(engineName(k))}</button>`).join('')}</div>`
      + (keyed ? '' : `<div class="banner">${icon('key')}<span>${esc(api.drawMissing())}。</span>${btn('go-key', '去填写', 'chip-button')}</div>`)
      + queueCard()
      + `<div class="draw-meta">${btn('pick-style', icon('layers') + esc(style().name) + icon('down'), 'chip-button')}${costChip(q)}${e === 'nai' ? `<label class="chip-button file-button read-png" title="从 NovelAI 画的 PNG 读回提示词、角色和参数">${icon('import')}读图<input type="file" data-read-png accept="image/png" aria-label="从 NovelAI 的图读参数" hidden></label>` : ''}</div>
        <div class="canvas-card"><div class="canvas-main${main ? '' : ' empty'}" style="aspect-ratio:${p.width}/${p.height}">${main ? `<button type="button" class="canvas-zoom" data-action="zoom" aria-label="放大查看"><img src="${esc(main)}" alt="生成的图片"></button>` : `<span>${comfy && !(comfy.controls.includes('width') && comfy.controls.includes('height')) ? '尺寸由工作流决定' : `${p.width} × ${p.height}`}<br>还没有图</span>`}${busy ? `<span class="canvas-busy">${esc(engineName(e))} 正在画……</span>` : ''}</div>
          ${results.length ? `<div class="canvas-side" data-keep-scroll="results">${thumbs.map((url, i) => `<button class="thumb" data-action="thumb" data-index="${i}" aria-pressed="${i === current}" aria-label="第 ${i + 1} 张">${url ? `<img src="${esc(url)}" alt="">` : ''}</button>`).join('')}</div>` : ''}</div>
        ${shown ? `<p class="hint canvas-meta">${[shown.tool ? (shown.prompt || '') : shown.params.model, `${shown.params.width}×${shown.params.height}`, shown.params.steps ? shown.params.steps + ' 步' : '', shown.seed >= 0 ? '种子 ' + shown.seed : ''].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
        ${shown && e === 'nai' && keyed ? toolsHTML() : ''}
        <div class="segmented draw-tabs">${tabs.map(([k, l]) => `<button data-action="tab" data-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div>
        ${body}
        <div class="savebar"><div class="draw-count" role="group" aria-label="一次画几张">${[1, 2, 3, 4].map(k => `<button type="button" data-action="count" data-count="${k}" aria-pressed="${k === count}" aria-label="一次画 ${k} 张">${k}</button>`).join('')}<small>张</small></div>${btn('generate', busy ? '正在画……' : (q.free === false ? icon('alert') : icon('paint')) + (count > 1 ? `画 ${count} 张` : '生成') + (q.free === false ? (e === 'gpt' ? '（要花钱）' : '（会扣 Anlas）') : ''), 'primary', busy || !keyed || comfy?.missing ? 'disabled' : '')}</div>`);
    // A new picture goes on top of the column: show it.
    if (newest) { newest = false; const side = v.root.querySelector('.canvas-side'); if (side) side.scrollTop = 0; }
    meters();
    grow(v.root.querySelector('[data-field=idea]'));
  }

  /**
   * NovelAI's prompt budget (core/tokens.js): the picture as it will be sent — the style's artist and fixed tags, this
   * prompt and every character's — against the model's limit, and the negatives against theirs. Counted again as
   * the user types; the vocabulary loads the first time.
   */
  let meterTicket = 0;
  /** 想画什么 grows with what is written (browsers without field-sizing), up to about ten lines, then scrolls. */
  function grow(el) { if (!el || ctx.win.CSS?.supports?.('field-sizing', 'content')) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 260) + 'px'; }
  async function meters() {
    const boxes = [...v.root.querySelectorAll('[data-token-meter]')], budget = eng() === 'nai' ? tokenBudget(state().params.model) : null;
    if (!boxes.length) return;
    if (!budget) { for (const b of boxes) b.hidden = true; return; }
    const ticket = ++meterTicket;
    let count;
    try { count = await loadCounter(budget.kind); } catch { for (const b of boxes) { b.hidden = false; b.textContent = '读不到分词表，暂时数不了 token'; } return; }
    if (ticket !== meterTicket || v.disposed) return;
    const st = style(), join = list => list.map(x => (x || '').trim()).filter(Boolean).join(', ');
    const used = countPicture(count, {prompt: join([st.artist, st.positive, prompt]), negative: join([st.negative, negative]),
      characters: characters.filter(c => c.prompt.trim()).map(c => ({prompt: c.prompt}))}, budget);
    const head = countField(count, join([st.artist, st.positive])), tag = tagCost(count);
    for (const box of boxes) {
      const negativeSide = box.dataset.tokenMeter === 'negative', n = negativeSide ? used.negative : used.used, ratio = n / budget.limit, left = budget.limit - n;
      const level = ratio > 1 ? 'over' : ratio >= .85 ? 'full' : 'room';
      box.hidden = false;
      box.dataset.state = level;
      box.innerHTML = `<div class="token-bar"><i style="width:${Math.min(100, ratio * 100).toFixed(1)}%"></i></div><span><b>${n}</b> / ${budget.limit} token${negativeSide ? '（负面）'
        : ` · 画风占 ${head}`}</span><small>${level === 'over' ? `超出 ${-left}：NovelAI 会把后面的截掉` : negativeSide ? `还能写 ${left}` : `还能写 ${left}，约 ${Math.floor(left / tag)} 个 tag${level === 'full' ? ' · 快满了' : ''}`}</small>`;
    }
  }

  /** GPT: quality, default 画幅 (正文出图 follows each block's own) and whether to ask before every paid picture. */
  function gptParams(g) {
    const seg = (action, value, list) => `<div class="segmented" style="margin:0">${list.map(([k, l]) => `<button data-action="${action}" data-value="${k}" aria-pressed="${value === k}">${l}</button>`).join('')}</div>`;
    return `<div class="group pad">
        <div class="setting-row"><span>模型</span><small>${esc(g.model)}</small>${btn('go-key', '在引擎卡包里改', 'text-button')}</div>
        <div class="field"><span>画质${help('low 最便宜最快，high 最贵最细。auto 让 GPT 自己定。dall-e-3 只分普通和高清（high）。')}</span>${seg('gpt-quality', g.quality, [['auto', '自动'], ['low', '低'], ['medium', '中'], ['high', '高']])}</div>
        <div class="field"><span>画幅${help('这里单独生图用的画幅。正文出图按每个出图块写的画幅来。GPT 只能画 1024×1024、1024×1536、1536×1024 这几种（dall-e-3 是 1792 的）。')}</span>${seg('gpt-orientation', g.orientation, [['portrait', '竖图'], ['landscape', '横图'], ['square', '方图']])}</div>
      </div>
      <div class="group">${toggle('gptAsk', '每张先问', g.ask, 'GPT 生图每张都要花钱。打开时，每张图画之前都先问你，新回复也不会自动画（正文里显示“点击生成”）。关掉后不再问，新回复会自动画，费用自己留意。')}</div>`;
  }
  /** ComfyUI: model, size, steps, CFG, sampler, scheduler and seed (the workflow decides what it uses). */
  function comfyParams(c, controls) {
    const has = key => controls.includes(key), info = comfyInfo;
    const size = SIZES.find(([, , w, h]) => w === c.width && h === c.height)?.[0] || 'custom';
    const choose = (key, value, list, placeholder) => list?.length
      ? select(key, value, [['', '请选择'], ...(list.some(x => (typeof x === 'string' ? x : x.value) === value) || !value ? [] : [[value, value]]), ...list.map(x => typeof x === 'string' ? [x, x] : [x.value, x.text])])
      : input(key, value, 'text', `autocomplete="off" spellcheck="false" placeholder="${placeholder}"`);
    const slider = (key, label, min, max, step = 1) => has(key) ? `<div class="field"><div class="meter-label"><span>${label}</span><output>${c[key]}</output></div><input class="slider" type="range" data-comfy="${key}" min="${min}" max="${max}" step="${step}" value="${c[key]}" aria-label="${label}"></div>` : '';
    return `<div class="group pad">
      <div class="row-heading"><strong>出图参数 ${help('这里只显示工作流留给插件填写的参数。工作流写死的值由工作流决定，需要在 ComfyUI 修改后重新导入。改动马上保存进正在用的方案。')}</strong>${btn('comfy-read', icon('refresh'), 'round-button', 'aria-label="刷新模型和采样器"')}</div>
      ${info?.error ? `<div class="comfy-note error-copy">列表读取失败，可手填 ${help(info.error)}</div>` : ''}
      ${has('model') ? field('模型', choose('comfy-model', c.model, info?.models, '刷新列表，或填模型文件名')) : `<div class="comfy-note">模型由工作流指定 ${help('当前工作流没有模型占位符，模型选择保留在工作流内。')}</div>`}
      ${has('clip') ? `${info?.clipError ? `<div class="comfy-note error-copy">CLIP 列表读不到，可手填 ${help(info.clipError)}</div>` : ''}${field('CLIP', choose('comfy-clip', c.clip, info?.clips, 'CLIP 文件名，如 qwen_3_06b_base.safetensors'), '这个模型的文本编码器单独放在 ComfyUI 的 text_encoders（或 clip）文件夹里，选它对应的那个。')}`
        + field('CLIP 类型', choose('comfy-clipType', c.clipType, info?.clipTypes, 'stable_diffusion'), '按模型说明选，和 ComfyUI 里「加载 CLIP」节点的类型一样。') : ''}
      ${has('vae') ? field('VAE', choose('comfy-vae', c.vae, info?.vaes, 'VAE 文件名'), '将潜在图像解码成图片的模型，文件要先安装在 ComfyUI。') : ''}
      ${has('width') && has('height') ? `<div class="field"><span>画幅</span><div class="size-chips">${SIZES.map(([k, label, w, h]) => `<button data-action="comfy-size" data-size="${k}" aria-pressed="${size === k}"><i style="width:${w / 100}px;height:${h / 100}px"></i>${label}<small>${w}×${h}</small></button>`).join('')}</div></div>` : ''}
      <div class="comfy-strengths">${has('width') ? field('宽度', input('comfy-width', c.width, 'number', 'min="64" max="4096" step="8"')) : ''}${has('height') ? field('高度', input('comfy-height', c.height, 'number', 'min="64" max="4096" step="8"')) : ''}</div>
      ${slider('steps', '步数', 1, 150)}${slider('scale', '提示词相关性 CFG', 0, 30, .1)}
      ${has('sampler') ? field('采样器', choose('comfy-sampler', c.sampler, info?.samplers, 'euler_ancestral')) : ''}
      ${has('scheduler') ? field('噪声调度', choose('comfy-scheduler', c.scheduler, info?.schedulers, 'normal')) : ''}
      ${slider('clipSkip', 'CLIP Skip', 1, 12)}
      ${has('seed') ? `<div class="field"><span>种子${help('填 -1 或留空表示每次随机。种子属于本次出图，不写进方案。')}</span><div class="inline-row">${input('seed', seed >= 0 ? seed : '', 'number', 'min="-1" placeholder="随机"')}${btn('dice', icon('dice'), 'round-button', 'aria-label="随机一个种子"')}</div></div>` : ''}
    </div>`;
  }
  async function readComfy() {
    const token = ++comfyRequest, url = state().comfy.url;
    let info;
    try { info = await api.comfyCatalog(url); }
    catch (error) { info = {error: error.message, models: [], samplers: [], schedulers: []}; }
    // CLIP files and types (for a model loaded on its own): read like the LoRA list; without them they are typed.
    if (!info.error) {
      try { const clip = await api.comfyClips(); info = {...info, clips: clip.clips, clipTypes: clip.types}; }
      catch (error) { info = {...info, clipError: error.message}; }
    }
    if (!v.disposed && token === comfyRequest && url === state().comfy.url) { comfyInfo = info; render(); }
  }

  let subscriptionEpoch=0;
  async function refreshSubscription(force = false) {
    const ticket=++subscriptionEpoch;
    if (eng() !== 'nai' || !api.keyStatus('nai')) { subscription = null; return; }
    const relay=state().relay.url,connection=state().connections.nai.active;
    const current=()=>!v.disposed&&ticket===subscriptionEpoch&&eng()==='nai'&&state().relay.url===relay&&state().connections.nai.active===connection;
    try { const result=await api.naiSubscription(force);if(!current())return;subscription=result; }
    catch (error) { if(!current())return;subscription=null;if(!relay)ctx.notify(error.message); }
    if(current())render();
  }

  // Loads a picture request sent from the chat ("在绘图中打开").
  v.load = request => {
    if (!request) return;
    prompt = request.tag || request.prompt || '';
    seed = Number.isInteger(request.seed) ? request.seed : -1;
    const routes = api.getState().routes;
    characters = (request.characters || []).map(c => ({name: routes.find(r => r.appearance?.trim() === c.prompt?.trim())?.name || '角色', prompt: c.prompt, position: c.position ?? -1}));
    tab = 'prompt';
    render();
  };
  v.refresh = () => { render(); refreshSubscription(); };
  v.onDraw = event => {
    if (event.subscription) subscription = event.subscription;
    if (event.queue) { queue = event.queue; cloudError = event.cloud || ''; }
    if (event.subscription || event.queue || event.vibes && tab === 'vibe') render();
  };
  const dispose = v.dispose;
  let viewer = null;
  v.back = () => { if (viewer?.open) { viewer.close(); return true; } return false; };
  v.dispose = () => { epoch++; viewer?.close(); comfyRequest++; plans.dispose(); loras.dispose(); for (const url of urls.values()) ctx.win.URL.revokeObjectURL(url); urls.clear(); dispose(); };

  v.on('input', '[data-field]', el => {
    const key = el.dataset.field;
    if (key === 'idea') { idea = el.value; grow(el); }
    else if (key === 'prompt') { prompt = el.value; meters(); }
    else if (key === 'negative') { negative = el.value; meters(); }
    else if (key === 'char') { characters[Number(el.dataset.index)].prompt = el.value; meters(); }
    else if (key === 'seed') seed = el.value === '' ? -1 : Math.max(-1, Math.floor(Number(el.value) || -1));
  });
  v.on('input', '[data-param]', el => { el.previousElementSibling.querySelector('output').textContent = el.dataset.param === 'scale' ? Number(el.value).toFixed(1) : el.value; });
  v.on('change', '[data-param]', el => { api.saveDraw({params: {[el.dataset.param]: Number(el.value)}}); render(); });
  v.on('input', '[data-queue]', el => { el.previousElementSibling.querySelector('output').textContent = el.value + (el.dataset.queue === 'gap' ? ' 秒' : ' 次'); });
  v.on('change', '[data-queue]', el => { api.saveDraw({queue: {[el.dataset.queue]: Number(el.value)}}); });
  v.on('change', 'select[data-field]', el => { if (/^comfy-/.test(el.dataset.field)) return; api.saveDraw({params: {[el.dataset.field]: el.value}}); render(); });
  // ComfyUI fields: a select from 读取, or a typed name when nothing was read.
  v.on('change', '[data-field=comfy-preset]', el => plans.choose(el.value));
  // ComfyUI parameters are saved into the scheme in use as soon as they change.
  // A model picked from the list brings its kind: a UNet or GGUF model is loaded with its own CLIP and VAE.
  v.on('change', '[data-field^=comfy-]:not([data-field=comfy-preset])', el => {
    const key = el.dataset.field.slice(6), patch = {[key]: el.value.trim()};
    if (key === 'model') { const m = comfyInfo?.models?.find(x => x.value === el.value); if (m?.loader) patch.loader = m.loader; }
    try { api.saveDraw({comfy: patch}); } catch (error) { ctx.notify(error.message, {error: true}); } render();
  });
  v.on('input', '[data-comfy]', el => { el.previousElementSibling.querySelector('output').textContent = el.dataset.comfy === 'scale' ? Number(el.value).toFixed(1) : el.value; });
  v.on('change', '[data-comfy]', el => { api.saveDraw({comfy: {[el.dataset.comfy]: Number(el.value)}}); render(); });
  v.on('input', '[data-lora-strength]', el => loras.slide(el));
  v.on('change', '[data-lora-toggle], [data-lora-strength]', el => loras.change(el));
  v.on('change', '[data-cloud]', () => { api.saveDraw({queue: {cloud: cloudFields()}}); cloudNote = null; });
  v.on('change', 'input.switch[data-field]', el => {
    const key = el.dataset.field;
    if (key === 'variety') api.saveDraw({params: {variety: el.checked}});
    else if (key === 'vibeEnabled') api.saveDraw({vibe: {enabled: el.checked}});
    else if (key === 'cloud') api.saveDraw({queue: {cloud: {...cloudFields(), enabled: el.checked}}});
    else if (key === 'gptAsk') api.saveDraw({gpt: {ask: el.checked}});
    else api.saveDraw({[key]: el.checked});
    render();
  });
  v.on('input', '[data-vibe-search]', el => vibes.search(el.value));
  v.on('input', '[data-ref-slider]', el => refs.slide(el));
  v.on('change', '[data-ref-slider]', () => render());
  v.on('change', '[data-read-png]', async el => { const file = el.files?.[0]; el.value = ''; if (file) await readPng(file); });
  v.on('change', '[data-vibe-file]', async el => { const files = [...el.files]; el.value = ''; await vibes.importFiles(files); });
  v.on('click', '[data-action]', async el => {
    if (eng() === 'comfy' && await plans.click(el)) return;
    if (eng() === 'comfy' && await loras.click(el)) return;
    if (el.dataset.action?.startsWith('vibe-') && await vibes.click(el)) return;
    if (el.dataset.action?.startsWith('ref-') && await refs.click(el)) return;
    if (el.dataset.action?.startsWith('tool-') && await tools(el)) return;
    const index = Number(el.dataset.index);
    switch (el.dataset.action) {
      case 'tab': tab = el.dataset.tab; await render(); break;
      case 'draw-engine': api.saveDraw({engine: el.dataset.pick}); render(); refreshSubscription(); break;
      case 'gpt-quality': api.saveDraw({gpt: {quality: el.dataset.value}}); render(); break;
      case 'gpt-orientation': api.saveDraw({gpt: {orientation: el.dataset.value}}); render(); break;
      case 'comfy-size': { const [, , width, height] = SIZES.find(s => s[0] === el.dataset.size); api.saveDraw({comfy: {width, height}}); render(); break; }
      case 'comfy-read': await v.busy(el, readComfy); break;
      case 'size': { const [, , width, height] = SIZES.find(s => s[0] === el.dataset.size); api.saveDraw({params: {width, height}}); render(); break; }
      case 'dice': seed = Math.floor(Math.random() * 4294967295); render(); break;
      case 'thumb': current = index; render(); break;
      case 'cancel-job': api.cancelDraw(el.dataset.key); break;
      case 'cloud-kind': api.saveDraw({queue: {cloud: {...cloudFields(), kind: el.dataset.kind}}}); cloudNote = null; render(); break;
      case 'new-room': { const room = api.newRoomCode(); v.root.querySelector('[data-cloud=room]').value = room; api.saveDraw({queue: {cloud: cloudFields()}}); cloudNote = {ok: true, text: '已生成房间码。把队列地址和房间码发给共用账号的朋友。'}; render(); break; }
      case 'test-cloud': {
        api.saveDraw({queue: {cloud: cloudFields()}});
        cloudNote = {ok: true, text: '正在连接……'}; render();
        const r = await api.testCloudQueue(cloudFields());
        cloudNote = r.ok ? {ok: true, text: `连接正常。队里现在 ${r.length} 张${r.holder ? `，${r.holder} 正在画` : ''}。`} : {ok: false, text: r.message};
        render();
        break;
      }
      case 'cancel-all': if (await ctx.confirm('取消所有排队的图？', '正在画的那一张也会停下。')) api.cancelAllDraws(); break;
      case 'go-settings': ctx.open('settings'); break;
      case 'go-key': ctx.open('engines'); ctx.editEngine?.(eng()); break;
      case 'open-presets': ctx.open('presets'); ctx.showPresetKind?.('draw'); break;
      case 'position': characters[index].position = Number(el.dataset.position); render(); break;
      case 'remove-char': characters.splice(index, 1); render(); break;
      case 'add-custom': characters.push({name: '角色', prompt: '', position: -1}); render(); break;
      case 'add-char': pickCharacter(); break;
      // The big picture opens like the album: swipe to the ones drawn before and after (this visit's column), swipe up
      // for the prompt and parameters of each, to compare them.
      case 'zoom': {
        if (!results.length) break;
        const img = el.querySelector('img'), file = id => resultFile(results.find(r => r.photoId === id) || {photoId: id});
        viewer = openAlbum({ctx, host: v.root.closest('.screen') || ctx.doc.body, ids: results.map(r => r.photoId), index: Math.max(0, current), from: img?.getBoundingClientRect() || null,
          load: id => api.getPhoto(id),
          actions: [
            {key: 'download', icon: 'download', label: '下载', run: async id => { const {source, name} = await file(id); const [copy] = await pictureCopies(ctx, [{blob: source, name}]) || []; if (copy) ctx.notify('已下载 ' + await saveFile(ctx.doc, copy.blob, copy.name)); }},
            ...(canShareFiles(ctx.win) ? [{key: 'share', icon: 'share', label: '分享', run: async id => { const {source, name} = await file(id); try { await shareFile(ctx.doc, source, name); } catch (error) { ctx.notify(error.message, {error: !/已取消/.test(error.message)}); } }}] : []),
            {key: 'delete', icon: 'trash', label: '删除', danger: true, run: async id => {
              if (!await ctx.confirm('删除这张图？', '相册里的这张也会一起删掉。')) return;
              await api.deletePhoto(id);
              results = results.filter(r => r.photoId !== id);
              ctx.notify('已删除');
              return 'removed';
            }}],
          onClose: () => { const at = results.findIndex(r => r.photoId === viewer?.id); current = at >= 0 ? at : results.length ? Math.min(Math.max(current, 0), results.length - 1) : -1; viewer = null; render(); }});
        break;
      }
      case 'write-prompt':
        if (!idea.trim()) { ctx.notify('先在「想画什么」里说一句'); v.root.querySelector('[data-field=idea]')?.focus(); break; }
        await v.busy(el, async () => {
          el.innerHTML = icon('spin') + '正在写…';
          const r = await api.writePrompt(idea, characters.map(c => c.name).filter(n => n && n !== '角色'));
          prompt = r.prompt;
          const added = addPeople(r.people);
          render();
          ctx.notify('写好了' + (r.budget ? `（约 ${r.tokens} / ${r.budget} token）` : '') + '，可以再改；不满意再点一次' + (added.length ? `。已把${added.join('、')}加进「角色」，外貌会自动带上` : ''));
        });
        break;
      case 'suggest':
        await v.busy(el, async () => {
          el.innerHTML = icon('spin') + '正在读剧情…';
          const r = await api.suggestPrompt();
          prompt = r.prompt;
          const added = addPeople(r.people);
          render();
          ctx.notify('已根据最近的剧情写好提示词' + (r.budget ? `（约 ${r.tokens} / ${r.budget} token）` : '') + '，可以再改' + (added.length ? `。已把${added.join('、')}加进「角色」` : ''));
        });
        break;
      case 'pick-style': pickStyle(); break;
      case 'count': count = Number(el.dataset.count) || 1; render(); break;
      case 'tools-toggle': toolsOpen = !toolsOpen; render(); break;
      case 'generate': await generate(); break;
    }
  });

  /** The question before pictures that cost: true to go on (paid), false when declined; null when they cost nothing. */
  async function askPaid(q, n = 1) {
    if (q.free !== false) return null;
    if (eng() === 'gpt') { const ask = api.paidPrompt(); return await ctx.confirm(ask.title + (n > 1 ? `（${n} 张）` : ''), ask.text); }
    const notes = (q.vibeAnlas ? `其中 Vibe 约 ${q.vibeAnlas} Anlas（${[q.vibes.encode && `${q.vibes.encode} 个第一次用要编码`, q.vibes.extra && `超过 4 个多了 ${q.vibes.extra} 个`].filter(Boolean).join('，')}）。` : '')
      + (q.referenceAnlas ? `角色参考每张多扣 ${q.referenceAnlas} Anlas。` : '') + (q.base ? '用了底图，不在 Opus 免费档里。' : '');
    return await ctx.confirm(n > 1 ? `这 ${n} 张图会扣 Anlas` : '这张图会扣 Anlas', `按当前参数和订阅，${n > 1 ? `每张都` : '这次生成'}要消耗 Anlas${subscription ? `（现有 ${subscription.anlas}）` : ''}。${notes}实际扣多少以 NovelAI 结算为准。`);
  }
  /**
   * n pictures of one request, each its own request waiting in the queue (so each stays in Opus's free tier, unlike
   * NovelAI's own batch). A fixed seed goes seed, seed+1…; each picture joins the column as it is done. The request is
   * kept with the picture, for 变体 and 增强.
   */
  async function drawMany(request, n = 1, allowPaid = false) {
    busy = true;
    render();
    const fixed = Number.isInteger(request.params?.seed) && request.params.seed >= 0;
    const jobs = Array.from({length: n}, (_, i) => api.generateImage({...request, params: {...request.params, seed: fixed ? (request.params.seed + i) % 4294967295 : -1}, allowPaid,
      label: request.label + (n > 1 ? ` · ${i + 1}/${n}` : '')}).then(result => {
      result.request = {prompt: request.prompt, negative: request.negative, characters: request.characters};
      results.unshift(result);
      results = results.slice(0, MAX_RESULTS);
      current = 0;
      newest = true;
      if (n > 1 && i < n - 1) render();
    }));
    const failed = (await Promise.allSettled(jobs)).find(s => s.status === 'rejected' && !s.reason?.cancelled);
    if (failed) ctx.notify(failed.reason.message);
    if (allowPaid && eng() === 'nai') refreshSubscription(true);
    busy = false;
    render();
  }
  async function generate() {
    const s = style(), q = quote(), extra = eng() === 'nai' ? refs.payload() : {base: null, refs: []};
    const paid = await askPaid(q, count);
    if (paid === false) return;
    await drawMany({
      prompt: [s.artist, s.positive, prompt].map(x => (x || '').trim()).filter(Boolean).join(', '),
      negative: [s.negative, negative].map(x => (x || '').trim()).filter(Boolean).join(', '),
      characters: characters.filter(c => c.prompt.trim()).map(c => ({prompt: c.prompt, position: c.position})),
      params: eng() === 'nai' ? {...state().params, seed} : {seed}, name: engineName().replace(/\s+/g, ''), label: '绘图 App · ' + (prompt.trim().slice(0, 24) || s.name),
      ...(extra.base ? {base: extra.base} : {}), ...(extra.refs.length ? {refs: extra.refs} : {})
    }, count, paid === true);
  }
  /** What a picture was drawn with, for 变体 and 增强: its own request, else what the app holds now (for a tool's picture). */
  function requestOf(result) {
    if (result?.request) return result.request;
    const s = style();
    return {prompt: [s.artist, s.positive, prompt].map(x => (x || '').trim()).filter(Boolean).join(', '), negative: [s.negative, negative].map(x => (x || '').trim()).filter(Boolean).join(', '),
      characters: characters.filter(c => c.prompt.trim()).map(c => ({prompt: c.prompt, position: c.position}))};
  }
  /** 变体: the shown picture drawn again from itself, as much changed as picked, n times. */
  function variationSheet() {
    const shown = results[current], levels = [['small', '小', .5], ['medium', '中', .7], ['large', '大', .8]];
    let level = 'large', n = Math.max(1, count);
    const d = ctx.dialog('变体', '');
    const draw = () => {
      d.body.innerHTML = `<p class="hint" data-keep-hint>用这张图原来的提示词，以它为底图再画${n > 1 ? ` ${n} 张` : '一张'}：构图和人物大致不变，细节、表情、姿势有变化。</p>
        <div class="field"><span>变化多大</span><div class="segmented" role="group" aria-label="变化多大">${levels.map(([k, l, v]) => `<button type="button" data-level="${k}" aria-pressed="${k === level}">${l}<small>强度 ${v}</small></button>`).join('')}</div></div>
        <div class="field"><span>画几张</span><div class="segmented" role="group" aria-label="画几张">${[1, 2, 3, 4].map(k => `<button type="button" data-n="${k}" aria-pressed="${k === n}">${k} 张</button>`).join('')}</div></div>
        <p class="hint" data-keep-hint>${icon('alert')}以图画图不在 Opus 免费档里，每张都扣 Anlas，实际扣多少以 NovelAI 结算为准。</p>
        <div class="actions">${btn('variation-run', icon('layers') + `画 ${n} 张变体`, 'primary')}</div>`;
    };
    draw();
    d.body.addEventListener('click', async e => {
      const pickLevel = e.target.closest('[data-level]')?.dataset.level, pickN = e.target.closest('[data-n]')?.dataset.n;
      if (pickLevel) { level = pickLevel; draw(); return; }
      if (pickN) { n = Number(pickN); draw(); return; }
      if (!e.target.closest('[data-action=variation-run]')) return;
      try {
        const blob = await shownBlob(), strength = levels.find(x => x[0] === level)[2];
        const fitted = await fitBase(ctx.win, blob, (shown?.params?.width || 832) * (shown?.params?.height || 1216));
        d.close();
        await drawMany({...requestOf(shown), params: {...state().params, ...pick(shown?.params), seed: -1}, base: {image: fitted.image, width: fitted.width, height: fitted.height, strength, noise: .1},
          name: 'NovelAI', label: '变体'}, n, true);
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** 增强: the shown picture made larger, then drawn over lightly with its own prompt (NovelAI's Enhance). */
  async function enhanceSheet() {
    const shown = results[current], blob = await shownBlob(), picture = await pictureData(ctx.win, blob), sizes = enhanceSizes(picture.width, picture.height);
    let size = sizes[0], strength = .5;
    const d = ctx.dialog('增强', '');
    const draw = () => {
      d.body.innerHTML = `<p class="hint" data-keep-hint>先把图放大，再用它原来的提示词轻轻重画一遍，补上细节、修掉糊的地方。原图 ${picture.width}×${picture.height}。</p>
        <div class="field"><span>放大到</span><div class="segmented" role="group" aria-label="放大到">${sizes.map(([k, w, h]) => `<button type="button" data-size="${k}" aria-pressed="${k === size[0]}">×${k}<small>${w}×${h}</small></button>`).join('')}</div></div>
        <div class="field"><div class="meter-label"><span>变化幅度${help('越高改得越多：0.2 左右只补细节，0.5 是官网的默认，0.7 以上可能连脸都变了。')}</span><output>${strength.toFixed(2)}</output></div><input class="slider" type="range" data-enhance="strength" min="0.1" max="0.8" step="0.05" value="${strength}" aria-label="变化幅度"></div>
        <p class="hint" data-keep-hint>${icon('alert')}增强按放大后的尺寸收费，不在 Opus 免费档里，实际扣多少以 NovelAI 结算为准。结果另存一张，原图还在。</p>
        <div class="actions">${btn('enhance-run', icon('wand') + '增强', 'primary')}</div>`;
    };
    draw();
    d.body.addEventListener('input', e => { if (e.target.dataset.enhance) { strength = Number(e.target.value); e.target.previousElementSibling.querySelector('output').textContent = strength.toFixed(2); } });
    d.body.addEventListener('click', async e => {
      const k = e.target.closest('[data-size]')?.dataset.size;
      if (k) { size = sizes.find(s => String(s[0]) === k); draw(); return; }
      if (!e.target.closest('[data-action=enhance-run]')) return;
      try {
        const [, width, height] = size, base = await scaledPicture(ctx.win, blob, width, height);
        d.close();
        await drawMany({...requestOf(shown), params: {...state().params, ...pick(shown?.params), steps: 28, seed: -1}, base: {image: base.image, width, height, strength, noise: 0},
          name: 'NovelAI', label: `增强 ×${size[0]}`}, 1, true);
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** The parameters of a picture worth carrying to 变体 / 增强 (its model and how it was sampled; not its size or seed). */
  const pick = (p = {}) => Object.fromEntries(['model', 'steps', 'scale', 'sampler', 'schedule', 'cfgRescale', 'variety'].filter(k => p[k] !== undefined).map(k => [k, p[k]]));

  // ---------- NovelAI's tools on the shown picture ----------
  /** [action, icon, name, what it does, costs Anlas] */
  const PICTURE_TOOLS = [['tool-base', 'image', '当底图', '图生图 · 局部重绘', false], ['tool-ref', 'person', '当参考', '角色参考 · V4.5', false], ['tool-variation', 'layers', '变体', '照着再画几张', true],
    ['tool-enhance', 'star', '增强', '放大后补细节', true], ['tool-upscale', 'expand', '放大', '2 或 4 倍', true], ['tool-director', 'wand', '导演工具', '去背景 · 线稿 · 换表情…', true]];
  /** One line under the picture; opened, a grid of what can be done with it. */
  const toolsHTML = () => `<div class="pic-tools${toolsOpen ? ' open' : ''}"><button type="button" class="pic-tools-toggle" data-action="tools-toggle" aria-expanded="${toolsOpen}">${icon('wand')}<span><b>用这张图继续</b><small>${toolsOpen ? '收起' : '底图 · 参考 · 变体 · 增强 · 放大 · 导演工具'}</small></span>${icon('down')}</button>`
    + (toolsOpen ? `<div class="pic-tools-grid" role="group" aria-label="用这张图">${PICTURE_TOOLS.map(([action, glyph, name, what, paid]) => `<button type="button" class="pic-tool" data-action="${action}"${paid && busy ? ' disabled' : ''}><span class="pic-tool-ico">${icon(glyph)}</span><b>${name}</b><small>${what}</small>${paid ? '<em>扣 Anlas</em>' : ''}</button>`).join('')}</div>` : '') + '</div>';
  const shownBlob = async () => { const r = results[current]; const photo = r && await api.getPhoto(r.photoId); if (!photo?.blob) throw Error('这张图已经不在相册里了'); return photo.blob; };
  /** A tool's picture joins the column like a drawing. */
  async function runTool(input) {
    busy = true; render();
    try {
      const result = await api.naiTool({...input, name: 'NovelAI'});
      results.unshift(result); results = results.slice(0, MAX_RESULTS); current = 0; newest = true;
      refreshSubscription(true);
    } catch (error) { if (!error.cancelled) ctx.notify(error.message, {error: true}); }
    busy = false; render();
  }
  async function tools(el) {
    try {
      switch (el.dataset.action) {
        case 'tool-base': await refs.useAsBase(await shownBlob()); tab = 'refs'; render(); ctx.notify('已放进「参考图」当底图'); return true;
        case 'tool-ref': await refs.useAsRef(await shownBlob()); tab = 'refs'; render(); ctx.notify('已放进「参考图」当角色参考'); return true;
        case 'tool-upscale': {
          const picture = await pictureData(ctx.win, await shownBlob()), k = upscaleBy(picture.width, picture.height);
          if (!k) { ctx.notify(`这张图已经很大了，放大后会超过 ${UPSCALE_MAX} 像素`); return true; }
          if (!await ctx.confirm(`放大到 ${picture.width * k}×${picture.height * k}？`, `用 NovelAI 放大 ${k} 倍，会扣 Anlas${subscription ? `（现有 ${subscription.anlas}）` : ''}，实际扣多少以 NovelAI 结算为准。放大后的图另存一张，原图还在。`)) return true;
          await runTool({tool: 'upscale', ...picture});
          return true;
        }
        case 'tool-director': directorSheet(); return true;
        case 'tool-variation': variationSheet(); return true;
        case 'tool-enhance': await enhanceSheet(); return true;
      }
    } catch (error) { ctx.notify(error.message, {error: true}); return true; }
    return false;
  }
  /** 导演工具: pick a tool (and, for 上色 / 换表情, words, a mood and how much to clean up), then run it on the shown picture. */
  function directorSheet() {
    let tool = 'bg-removal';
    const d = ctx.dialog('导演工具', '');
    const draw = () => {
      const words = DIRECTOR_WORDS.includes(tool);
      d.body.innerHTML = `<div class="director-tools" role="group" aria-label="选一个工具">${Object.entries(DIRECTOR_TOOLS).map(([k, l]) => `<button type="button" data-tool="${k}" aria-pressed="${k === tool}">${l}</button>`).join('')}</div>
        <p class="hint">${{'bg-removal': '把人物留下，背景变透明。', lineart: '变成干净的线稿。', sketch: '变成铅笔素描。', colorize: '给线稿或黑白图上色，可以写想要的颜色。', emotion: '换一个表情，其余尽量不动。', declutter: '去掉画面里的文字、水印和杂物。'}[tool]}</p>
        ${tool === 'emotion' ? `<div class="field"><span>换成</span><div class="emotion-chips">${EMOTIONS.map(([k, l]) => `<button type="button" data-mood="${k}" aria-pressed="${k === (d.mood || 'happy')}">${l}</button>`).join('')}</div></div>` : ''}
        ${words ? `<div class="field"><span>${tool === 'colorize' ? '想要的颜色（可以不写）' : '补充说明（可以不写）'}</span><input data-director="prompt" value="${esc(d.words || '')}" placeholder="${tool === 'colorize' ? '例如：silver hair, blue eyes, red dress' : '例如：blushing, looking away'}"></div>
          <div class="field"><div class="meter-label"><span>去瑕疵</span><output>${d.defry || 0}</output></div><input class="slider" type="range" data-director="defry" min="0" max="5" step="1" value="${d.defry || 0}" aria-label="去瑕疵"></div>` : ''}
        <p class="hint" data-keep-hint>${icon('alert')}导演工具会扣 Anlas，实际扣多少以 NovelAI 结算为准。结果另存一张，原图还在。</p>
        <div class="actions">${btn('director-run', icon('wand') + DIRECTOR_TOOLS[tool], 'primary')}</div>`;
    };
    d.mood = 'happy'; d.words = ''; d.defry = 0;
    draw();
    d.body.addEventListener('input', e => { const k = e.target.dataset.director; if (k === 'prompt') d.words = e.target.value; if (k === 'defry') { d.defry = Number(e.target.value); e.target.previousElementSibling.querySelector('output').textContent = e.target.value; } });
    d.body.addEventListener('click', async e => {
      const t = e.target.closest('[data-tool]')?.dataset.tool, mood = e.target.closest('[data-mood]')?.dataset.mood;
      if (t) { tool = t; draw(); return; }
      if (mood) { d.mood = mood; draw(); return; }
      if (!e.target.closest('[data-action=director-run]')) return;
      try {
        const picture = await pictureData(ctx.win, await shownBlob());
        d.close();
        await runTool({tool, ...picture, prompt: d.words, mood: d.mood, defry: d.defry});
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** 读参数: a NovelAI PNG's prompt, negative, characters and parameters put back into the app. */
  async function readPng(file) {
    const found = await readNovelAI(await file.arrayBuffer()).catch(() => null);
    if (!found) { ctx.notify('这张图里没有 NovelAI 的参数（被压缩或转存过的图会丢掉它们）', {error: true}); return; }
    prompt = found.prompt; negative = found.negative;
    if (found.characters.length) characters = found.characters.map((c, i) => ({name: '角色 ' + (i + 1), prompt: c.prompt, position: c.position}));
    const {seed: read, ...params} = found.params;
    if (Number.isInteger(read)) seed = read;
    if (Object.keys(params).length) { try { api.saveDraw({params}); } catch (error) { ctx.notify(error.message, {error: true}); } }
    // The picture itself joins the column (and the album) with what it was drawn with: swipe up on it to read it, and
    // its tools (变体, 增强…) draw from its own prompt.
    const chars = found.characters.map(c => ({prompt: c.prompt, position: c.position}));
    const info = [['来源', '读入的 NovelAI 图'], ['模型', params.model], ['步数', params.steps], ['CFG', params.scale], ['采样器', params.sampler],
      ['种子', Number.isInteger(read) ? read : ''], ['提示词', found.prompt], ['负面', found.negative], ['角色', chars.map(c => c.prompt).join(' | ')]].filter(([, v]) => v !== undefined && v !== null && String(v).trim());
    try {
      const photo = await api.addPhoto({name: file.name || 'NovelAI.png', blob: file, info});
      results.unshift({photoId: photo.id, seed: Number.isInteger(read) ? read : -1, params: {...state().params, ...params}, prompt: found.prompt, engine: 'nai', request: {prompt: found.prompt, negative: found.negative, characters: chars}});
      results = results.slice(0, MAX_RESULTS); current = 0; newest = true;
    } catch (error) { ctx.notify(error.message, {error: true}); }
    tab = 'prompt';
    render();
    ctx.notify(`读到了：提示词${found.characters.length ? `、${found.characters.length} 个角色` : ''}${Object.keys(params).length ? '、参数' : ''}${Number.isInteger(read) ? '、种子' : ''}。画风的画师串和固定串还会接在前面，不想要可以先换个空画风`);
  }

  /** The registered people a written prompt names, added to 角色 with their looks (once). Returns who was added. */
  function addPeople(names = []) {
    const routes = api.getState().routes, added = [];
    for (const name of names) {
      const r = routes.find(x => x.name === name);
      if (!r || characters.some(c => c.name === r.name)) continue;
      characters.push({name: r.name, prompt: r.appearance || '', position: -1});
      added.push(r.name);
    }
    return added;
  }
  function pickCharacter() {
    const routes = api.getState().routes;
    const d = ctx.dialog('从角色里添加', routes.length
      ? `<div class="group">${routes.map(r => `<button class="list-row" data-pick="${esc(r.id)}">${avatar(r.name, r.voice ? r.engine : 'none', 36)}<span><strong>${esc(r.name)}</strong><small>${esc(r.appearance?.trim() || '还没有填写外貌 tag')}</small></span>${icon('add')}</button>`).join('')}</div>`
      : '<p class="hint">还没有角色。可以先在角色 App 里新增，并填写外貌 tag。</p>');
    d.body.addEventListener('click', e => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      const r = routes.find(x => x.id === b.dataset.pick);
      characters.push({name: r.name, prompt: r.appearance || '', position: -1});
      d.close();
      render();
    });
  }

  // 画风: ui/draw-styles.js.
  const {pickStyle, editStyle} = styleSheets({ctx, state, styleId, style, render});

  render();
  refreshSubscription();
  return v;
}
