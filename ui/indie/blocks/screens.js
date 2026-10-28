// The menus: title, the list of worlds, a new world, settings, textures from the player's own game, pause, death,
// loading. Plain DOM over the game; buttons are reachable with keys and pads (arrow / d-pad moves, Enter / A presses).
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const SPLASHES = ['也能在小手机里玩！', '方块！', '一格一格来', '别在晚上挖到岩浆', '先撸一棵树', '天亮了吗？', '手机横过来玩', '手柄也行！', '种点小麦吧', '钻石在深处'];

export class Screens {
  constructor(root, api) { this.root = root; this.api = api; this.current = null; this.focus = 0; }
  show(html, cls = 'dirt', on = {}) {
    this.root.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    this.current = this.root.firstElementChild; this.handlers = on; this.focus = 0;
    this.current.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) { this.api.sound('click'); on[b.dataset.a]?.(b, e); } });
    this.current.addEventListener('input', e => on.input?.(e.target, e));
    this.markFocus();
  }
  hide() { this.root.innerHTML = ''; this.current = null; }
  get open() { return !!this.current; }
  buttons() { return this.current ? [...this.current.querySelectorAll('[data-a]:not([disabled]), input[type=range]')] : []; }
  markFocus() { const b = this.buttons(); b.forEach((x, i) => x.classList.toggle('focus', i === this.focus && this.api.padMode())); }
  /** Keys and pads: up / down / left / right / ok / back. */
  nav(dir) {
    const b = this.buttons();
    if (!b.length) return;
    if (dir === 'ok') { const x = b[this.focus]; if (x?.dataset.a) x.click(); return; }
    if (dir === 'back') { this.handlers.back?.(); return; }
    const x = b[this.focus];
    if (x?.type === 'range' && (dir === 'left' || dir === 'right')) { x.value = Number(x.value) + (dir === 'right' ? 1 : -1) * Number(x.step || 1); x.dispatchEvent(new Event('input', {bubbles: true})); return; }
    this.focus = (this.focus + (dir === 'down' || dir === 'right' ? 1 : -1) + b.length) % b.length;
    this.markFocus();
    b[this.focus].scrollIntoView?.({block: 'nearest'});
  }

  title() {
    const splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    this.show(`<div class="title">方块世界</div><div class="sub">${esc(splash)}</div>
      <button class="btn" data-a="worlds">单人游戏</button>
      <div class="btns"><button class="btn half" data-a="settings">设置</button><button class="btn half" data-a="pack">材质</button></div>
      ${this.api.inTavern() ? '<button class="btn" data-a="leave">离开游戏</button>' : ''}
      <p class="note">${esc(this.api.packLabel() ? `材质：${this.api.packLabel()}（只在这台设备上）` : '材质：方块世界自己画的')}</p>`, 'dirt', {
      worlds: () => this.worlds(), settings: () => this.settings(() => this.title()), pack: () => this.pack(() => this.title()), leave: () => this.api.leave(),
      back: () => this.api.inTavern() && this.api.leave(),
    });
  }
  async worlds() {
    const list = await this.api.listWorlds();
    let sel = list[0]?.id || null;
    const draw = () => this.show(`<h2>选择世界</h2>
      <div class="list">${list.length ? list.map(w => `<div class="it${w.id === sel ? ' on' : ''}" data-a="pick" data-id="${esc(w.id)}"><div><b>${esc(w.name)}</b><small>${w.mode === 'creative' ? '创造模式' : '生存模式'} · 第 ${Math.floor((w.time || 0) / 24000) + 1} 天 · ${new Date(w.played || w.created).toLocaleString()}</small></div></div>`).join('') : '<div class="it"><small>还没有世界，新建一个吧。</small></div>'}</div>
      <div class="btns"><button class="btn half" data-a="play"${sel ? '' : ' disabled'}>进入</button><button class="btn half" data-a="create">新建世界</button></div>
      <div class="btns"><button class="btn half" data-a="del"${sel ? '' : ' disabled'}>删除</button><button class="btn half" data-a="back">返回</button></div>`, 'dirt', {
      pick: b => { if (sel === b.dataset.id) { this.api.play(list.find(w => w.id === sel)); return; } sel = b.dataset.id; draw(); },
      play: () => this.api.play(list.find(w => w.id === sel)),
      create: () => this.create(),
      del: () => this.confirm(`删除「${list.find(w => w.id === sel)?.name}」？`, '删掉以后找不回来。', async () => { await this.api.deleteWorld(sel); this.worlds(); }, () => draw()),
      back: () => this.title(),
    });
    draw();
  }
  create() {
    let mode = 'survival';
    const draw = () => this.show(`<h2>新建世界</h2><div class="form">
      <label>世界名字<input type="text" class="wname" maxlength="32" value="新的世界"></label>
      <label>种子（不填就随机）<input type="text" class="wseed" maxlength="40" placeholder=""></label>
      <div class="seg"><button class="btn${mode === 'survival' ? ' sel' : ''}" data-a="mode" data-m="survival">生存</button><button class="btn${mode === 'creative' ? ' sel' : ''}" data-a="mode" data-m="creative">创造</button></div>
      <p class="note">${mode === 'survival' ? '收集材料、合成工具，会饿也会受伤。' : '所有方块随便拿，可以飞，不会受伤。'}</p>
      </div><div class="btns"><button class="btn half" data-a="go">创建</button><button class="btn half" data-a="back">取消</button></div>`, 'dirt', {
      mode: b => { const name = this.current.querySelector('.wname').value, seed = this.current.querySelector('.wseed').value; mode = b.dataset.m; draw(); this.current.querySelector('.wname').value = name; this.current.querySelector('.wseed').value = seed; },
      go: () => this.api.createWorld({name: this.current.querySelector('.wname').value.trim() || '新的世界', seed: this.current.querySelector('.wseed').value.trim(), mode}),
      back: () => this.worlds(),
    });
    draw();
    this.current.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
  }
  confirm(title, text, yes, no) {
    this.show(`<h2>${esc(title)}</h2><p class="note">${esc(text)}</p><div class="btns"><button class="btn half" data-a="yes">确定</button><button class="btn half" data-a="no">取消</button></div>`, 'dirt', {yes, no, back: no});
  }
  settings(back, inGame = false) {
    const s = this.api.settings();
    const slider = (key, label, min, max, step, fmt) => `<label class="slider"><span>${label}：<b data-v="${key}">${fmt(s[key])}</b></span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"></label>`;
    const toggle = (key, label) => `<button class="btn" data-a="toggle" data-k="${key}">${label}：${s[key] ? '开' : '关'}</button>`;
    // choices that go round when pressed: 光影 and how far the distant view reaches
    const CHOICES = {shaders: [['off', '关'], ['low', '低'], ['mid', '中'], ['high', '高']], lod: [[0, '关'], [24, '24 区块'], [48, '48 区块'], [96, '96 区块']]};
    const named = (k, v) => (CHOICES[k].find(o => o[0] === v) || CHOICES[k][0])[1];
    const cycle = (key, label) => `<button class="btn" data-a="cycle" data-k="${key}">${label}：${named(key, s[key])}</button>`;
    const fmts = {dist: v => `${v} 区块`, fov: v => `${v}°`, sens: v => `${Math.round(v * 100)}%`, gamma: v => v <= 0 ? '昏暗' : v >= 1 ? '明亮' : `${Math.round(v * 100)}%`, volume: v => `${Math.round(v * 100)}%`, scale: v => `${Math.round(v * 100)}%`};
    this.show(`<h2>设置</h2><div class="grid2">
      ${slider('dist', '视野距离', 2, 16, 1, fmts.dist)}${slider('fov', '视角', 50, 110, 1, fmts.fov)}
      ${slider('sens', '灵敏度', 0.2, 3, 0.05, fmts.sens)}${slider('gamma', '亮度', 0, 1, 0.05, fmts.gamma)}
      ${slider('volume', '音量', 0, 1, 0.05, fmts.volume)}${slider('scale', '画面清晰度', 0.4, 1, 0.05, fmts.scale)}
      ${cycle('shaders', '光影')}${cycle('lod', '远景')}
      ${toggle('wave', '草木摇动')}${toggle('clouds', '云')}${toggle('bob', '走路晃动')}${toggle('autoJump', '触屏自动跳')}
      </div><p class="note">光影：低是光照、水面、天空和一层柔和的云（夜里有星云，雪地的夜里有极光），矿石在暗处发光，草会给人让开；中再加阳光的影子、有厚度的云（积云、成片的层积云，雷雨天长成高高的积雨云，高处还有卷云、卷积云和带日晕的卷层云）和云影、泛光、方块的凹凸、角落的阴影、空气里看得见的光柱（有些早晨起雾时最明显）和柔和的镜头眩光，水能看到底下、越深越蓝、水底有晃动的光纹，在水下抬头能看到水面外的天和太阳、有从水面照下来的光；高的影子更柔和、云更细，水面倒映岸上的东西。远景：视野外的地形用大一点的方块画出来，能看到很远的山。光影开着时卡了会自动降一点清晰度。手机上视野距离和画面清晰度调低会更流畅。</p><button class="btn" data-a="back">完成</button>`, inGame ? 'dim' : 'dirt', {
      cycle: b => { const k = b.dataset.k, opts = CHOICES[k], i = opts.findIndex(o => o[0] === this.api.settings()[k]), next = opts[(i + 1) % opts.length]; this.api.setSetting(k, next[0]); b.textContent = b.textContent.replace(/：.*/, `：${next[1]}`); },
      toggle: b => { const k = b.dataset.k; this.api.setSetting(k, !this.api.settings()[k]); b.textContent = b.textContent.replace(/：.*/, `：${this.api.settings()[k] ? '开' : '关'}`); },
      input: el => { if (!el.dataset.k) return; const k = el.dataset.k, v = Number(el.value); this.api.setSetting(k, v); this.current.querySelector(`[data-v="${k}"]`).textContent = fmts[k](v); },
      back: () => back(),
    });
  }
  pack(back, inGame = false) {
    const label = this.api.packLabel();
    this.show(`<h2>材质</h2>
      <p class="note">现在用的：${esc(label || '方块世界自己画的材质')}</p>
      <p class="note">有正版《我的世界》Java 版的话，可以用它自己的材质：选游戏文件夹里 <b>versions/版本号/版本号.jar</b>（比如 .minecraft/versions/26.3/26.3.jar），或者一个资源包 .zip。只读取用得到的贴图，存在这台设备的浏览器里，不会上传，也不会分享给别人；别的设备要用得在那台设备上再选一次。</p>
      <div class="btns"><button class="btn half" data-a="pick">选择文件…</button>${label ? '<button class="btn half" data-a="remove">换回自己的</button>' : ''}</div>
      <div class="bar" hidden><i></i></div><p class="note msg"></p>
      <button class="btn" data-a="back">完成</button>
      <p class="note" style="opacity:.7">Minecraft 是 Mojang Studios 的商标。方块世界不是官方作品，和 Mojang、微软没有关系；它自带的材质都是自己画的。</p>`, inGame ? 'dim' : 'dirt', {
      pick: () => {
        const f = document.createElement('input'); f.type = 'file'; f.accept = '.jar,.zip,application/java-archive,application/zip';
        f.onchange = async () => {
          const file = f.files?.[0]; if (!file) return;
          const bar = this.current.querySelector('.bar'), msg = this.current.querySelector('.msg');
          bar.hidden = false; msg.textContent = '读取中…';
          try {
            const label2 = await this.api.importPack(file, (d, t) => { bar.firstElementChild.style.width = `${Math.round(d / t * 100)}%`; });
            msg.textContent = `好了：${label2}`;
            setTimeout(() => this.pack(back, inGame), 900);
          } catch (e) { msg.textContent = `没读成：${e.message || e}`; bar.hidden = true; }
        };
        f.click();
      },
      remove: async () => { await this.api.removePack(); this.pack(back, inGame); },
      back: () => back(),
    });
  }
  pause() {
    this.show(`<h2>游戏菜单</h2>
      <button class="btn" data-a="resume">回到游戏</button>
      <div class="btns"><button class="btn half" data-a="settings">设置</button><button class="btn half" data-a="pack">材质</button></div>
      <button class="btn" data-a="pregen">预生成地形</button>
      <div class="btns">${this.api.canFull() ? `<button class="btn half" data-a="full">${this.api.isFull() ? '退出全屏' : '全屏'}</button>` : ''}<button class="btn half" data-a="mode">${this.api.mode() === 'creative' ? '换成生存模式' : '换成创造模式'}</button></div>
      <button class="btn" data-a="quit">保存并回到标题</button>
      ${this.api.inTavern() ? '<button class="btn" data-a="leave">保存并离开游戏</button>' : ''}`, 'dim', {
      resume: () => this.api.resume(), settings: () => this.settings(() => this.pause(), true), pregen: () => this.pregen(() => this.pause()), pack: () => this.pack(() => this.pause(), true),
      mode: () => { this.api.toggleMode(); this.pause(); }, quit: () => this.api.quit(), leave: () => this.api.leave(), back: () => this.api.resume(),
      full: async () => { await this.api.fullscreen(); this.pause(); },
    });
  }
  /** Making the land ahead of time (like Chunky): a radius, how far it has got, stopping. */
  pregen(back) {
    const sizes = [8, 16, 32];
    this.show(`<h2>预生成地形</h2>
      <p class="note">先把你周围的地形生成好、压缩存起来（只存在这台设备的浏览器里），之后走过去直接读取，不用现场生成，手机上走得更顺。半径越大越久、越占地方：每个区块大约 16 KB，32 区块的半径要五十多 MB。可以一边玩一边生成，离开游戏就停。</p>
      <div class="btns">${sizes.map(r => `<button class="btn third" data-a="go" data-r="${r}">${r} 区块</button>`).join('')}</div>
      <div class="bar" hidden><i></i></div><p class="note msg"></p>
      <div class="btns"><button class="btn half" data-a="stop">停止</button><button class="btn half" data-a="back">返回</button></div>`, 'dim', {
      go: b => { this.api.pregen(Number(b.dataset.r)); this.current.querySelector('.bar').hidden = false; this.current.querySelector('.msg').textContent = '开始生成…'; },
      stop: () => this.api.pregenStop(),
      back: () => { this.api.onPregen(null); back(); },
    });
    this.api.onPregen(m => {
      const bar = this.current?.querySelector('.bar'), msg = this.current?.querySelector('.msg');
      if (!bar || !msg) return;
      bar.hidden = false; bar.firstElementChild.style.width = `${m.total ? Math.round(m.done / m.total * 100) : 100}%`;
      msg.textContent = m.finished ? `好了：周围 ${m.total} 个区块都生成好了` : m.stopped ? `停下了：${m.done} / ${m.total}` : !m.total ? '周围都已经生成过了' : `生成中：${m.done} / ${m.total}`;
    });
  }
  dead(reason) {
    this.show(`<div class="title">你死了！</div><p class="note">${esc(reason)}</p><button class="btn" data-a="respawn">重生</button><button class="btn" data-a="quit">回到标题</button>`, 'dead', {respawn: () => this.api.respawn(), quit: () => this.api.quit()});
  }
  loading(text, part = 0) {
    if (!this.current?.classList.contains('loading')) this.show(`<h2 class="lt"></h2><div class="bar"><i></i></div>`, 'dirt loading');
    this.current.querySelector('.lt').textContent = text;
    this.current.querySelector('.bar i').style.width = `${Math.round(part * 100)}%`;
  }
}
