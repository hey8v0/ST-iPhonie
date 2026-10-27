// Controls, all at once and switching by themselves: keyboard and mouse (the mouse is locked to the game while
// playing), touch like the game on phones (a stick on the left, drag on the right to look, hold to break and tap to
// place at the finger, buttons to jump and sneak, double-tap jump to fly in creative) and game pads.
// On a phone held upright the game is turned on its side (forced landscape): touches are turned back here.

export const KEYS = {fwd: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['Space'], sneak: ['ShiftLeft', 'ShiftRight'], sprint: ['ControlLeft', 'ControlRight']};

export class Input {
  /** app: the element the game fills; rotated(): is it turned (portrait phone); onMode(mode) when the kind of control changes. */
  constructor(app, canvas, {rotated = () => false, onMode = () => {}, sensitivity = () => 1} = {}) {
    this.app = app; this.canvas = canvas; this.rotated = rotated; this.onMode = onMode; this.sens = sensitivity;
    this.keys = new Set(); this.mode = 'keyboard'; this.events = []; this.look = [0, 0];
    this.mouse = {attack: false, use: false};
    this.touch = {stick: null, look: null, jump: false, sneak: false, down: false, up: false, aim: null, attack: false};
    this.pad = {attack: false, use: false, prev: [], sneak: false};
    this.lastJump = 0; this.lastW = 0; this.sprintKey = false; this.enabled = false; this.blocked = false;
    addEventListener('keydown', e => this.key(e, true));
    addEventListener('keyup', e => this.key(e, false));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.attack = this.mouse.use = false; });
    canvas.addEventListener('mousedown', e => this.mouseDown(e));
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.attack = false; if (e.button === 2) this.mouse.use = false; });
    addEventListener('mousemove', e => { if (this.locked()) { this.setMode('keyboard'); this.look[0] -= e.movementX * 0.0022 * this.sens(); this.look[1] -= e.movementY * 0.0022 * this.sens(); } });
    canvas.addEventListener('wheel', e => { if (this.enabled) { this.events.push(e.deltaY > 0 ? 'next' : 'prev'); e.preventDefault(); } }, {passive: false});
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.buildTouch();
  }
  locked() { return document.pointerLockElement === this.canvas; }
  lock() { if (this.mode !== 'touch' && !this.locked()) { try { const p = this.canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch {} } }
  unlock() { if (this.locked()) document.exitPointerLock?.(); }
  setMode(m) { if (this.mode !== m) { this.mode = m; this.onMode(m); } }
  key(e, down) {
    if (e.target?.closest?.('input, textarea')) return;
    // the tavern's back gesture sends an Escape with only its key name
    const k = e.code || (e.key === 'Escape' ? 'Escape' : '');
    if (down) this.setMode('keyboard');
    if (down && !e.repeat) {
      const map = {KeyE: 'inventory', KeyQ: 'drop', Escape: 'pause', F3: 'debug', F1: 'hud', KeyF: 'swap', F5: 'view', KeyT: 'chat'};
      if (/^Digit[1-9]$/.test(k)) this.events.push('slot' + (Number(k.slice(5)) - 1));
      else if (map[k]) this.events.push(map[k]);
      if (k === 'Space' && this.enabled) { const t = performance.now(); if (t - this.lastJump < 300) this.events.push('fly'); this.lastJump = t; }
      if (k === 'KeyW' && this.enabled) { const t = performance.now(); if (t - this.lastW < 300) this.sprintKey = true; this.lastW = t; }
      if (['F1', 'F3', 'Space', 'Tab'].includes(k) || (k === 'KeyQ' && this.enabled)) e.preventDefault();
    }
    if (down) this.keys.add(k); else { this.keys.delete(k); if (k === 'KeyW') this.sprintKey = false; }
  }
  mouseDown(e) {
    if (!this.enabled) return;
    if (!this.locked() && this.mode !== 'touch') { this.lock(); return; }
    if (e.button === 0) this.mouse.attack = true;
    if (e.button === 2) { this.mouse.use = true; this.events.push('use'); }
    if (e.button === 1) { this.events.push('pick'); e.preventDefault(); }
  }
  held(name) { return KEYS[name].some(k => this.keys.has(k)); }
  /** A point on the screen in the game's own (unturned) pixels. */
  toApp(cx, cy) {
    if (!this.rotated()) return [cx, cy];
    return [cy, innerWidth - cx];
  }
  appSize() { return this.rotated() ? [innerHeight, innerWidth] : [innerWidth, innerHeight]; }

  // ---------- touch ----------
  buildTouch() {
    const t = this.touch, el = this.touchLayer = document.createElement('div');
    el.className = 'touch';
    el.innerHTML = `<div class="stick" hidden><i></i></div>
      <button class="tb jump" data-t="jump" aria-label="跳"><svg viewBox="0 0 24 24"><path d="M12 5l7 8h-4v6h-6v-6H5z"/></svg></button>
      <button class="tb sneak" data-t="sneak" aria-label="潜行"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg></button>
      <button class="tb up" data-t="up" aria-label="上升" hidden><svg viewBox="0 0 24 24"><path d="M12 5l7 8H5z"/></svg></button>
      <button class="tb down" data-t="down" aria-label="下降" hidden><svg viewBox="0 0 24 24"><path d="M12 19l7-8H5z"/></svg></button>`;
    this.app.append(el);
    const stick = el.querySelector('.stick'), knob = stick.firstElementChild;
    const touches = new Map();
    const area = (x, y) => { const [w, h] = this.appSize(); return x < w * 0.38 && y > h * 0.3 ? 'stick' : 'look'; };
    // Only the game's own touches (stick, looking, the round buttons) have their browser actions stopped: a phone
    // makes its taps (the click on a menu button) out of touchend, so stopping every touch made all buttons dead.
    const onStart = e => {
      if (!this.enabled) return;
      this.setMode('touch');
      let ours = false;
      for (const tc of e.changedTouches) {
        ours = true;
        const [x, y] = this.toApp(tc.clientX, tc.clientY), btn = document.elementFromPoint(tc.clientX, tc.clientY)?.closest?.('[data-t]');
        if (btn && el.contains(btn)) { touches.set(tc.identifier, {kind: 'btn', name: btn.dataset.t, el: btn}); this.press(btn.dataset.t, true); btn.classList.add('on'); continue; }
        if (e.target !== this.canvas && !el.contains(e.target)) { ours = false; continue; }
        const kind = area(x, y);
        if (kind === 'stick' && !t.stick) {
          t.stick = {id: tc.identifier, x, y, dx: 0, dy: 0};
          touches.set(tc.identifier, {kind: 'stick'});
          stick.hidden = false; stick.style.left = `${x}px`; stick.style.top = `${y}px`; knob.style.transform = '';
        } else {
          touches.set(tc.identifier, {kind: 'look', x, y, sx: x, sy: y, t: performance.now(), moved: false, breaking: false});
          clearTimeout(this.holdTimer);
          const id = tc.identifier;
          this.holdTimer = setTimeout(() => { const s = touches.get(id); if (s && !s.moved) { s.breaking = true; t.attack = true; t.aim = [s.x, s.y]; } }, 280);
        }
      }
      if (ours) e.preventDefault();
    };
    const onMove = e => {
      let ours = false;
      for (const tc of e.changedTouches) {
        const s = touches.get(tc.identifier);
        if (!s) continue;
        ours = true;
        const [x, y] = this.toApp(tc.clientX, tc.clientY);
        if (s.kind === 'stick') {
          let dx = x - t.stick.x, dy = y - t.stick.y;
          const r = 48, d = Math.hypot(dx, dy);
          if (d > r) { dx *= r / d; dy *= r / d; }
          t.stick.dx = dx / r; t.stick.dy = dy / r;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (s.kind === 'look') {
          if (!s.moved && Math.hypot(x - s.sx, y - s.sy) > 10 && !s.breaking) s.moved = true;
          if (s.breaking) t.aim = [x, y];
          else if (s.moved) { this.look[0] -= (x - s.x) * 0.0065 * this.sens(); this.look[1] -= (y - s.y) * 0.0065 * this.sens(); }
          s.x = x; s.y = y;
        }
      }
      if (ours) e.preventDefault();
    };
    const onEnd = e => {
      let ours = false;
      for (const tc of e.changedTouches) {
        const s = touches.get(tc.identifier);
        if (!s) continue;
        ours = true;
        touches.delete(tc.identifier);
        if (s.kind === 'btn') { this.press(s.name, false); s.el.classList.remove('on'); }
        else if (s.kind === 'stick') { t.stick = null; stick.hidden = true; }
        else if (s.kind === 'look') {
          if (s.breaking) { t.attack = false; t.aim = null; }
          else if (!s.moved && performance.now() - s.t < 280) { t.aim = [s.x, s.y]; this.events.push('use'); this.tapAim = [s.x, s.y]; }
        }
      }
      if (ours) e.preventDefault();
    };
    this.canvas.addEventListener('touchstart', onStart, {passive: false});
    el.addEventListener('touchstart', onStart, {passive: false});
    addEventListener('touchmove', onMove, {passive: false});
    addEventListener('touchend', onEnd, {passive: false});
    addEventListener('touchcancel', onEnd, {passive: false});
  }
  press(name, down) {
    const t = this.touch;
    if (name === 'jump') { t.jump = down; if (down) { const now = performance.now(); if (now - this.lastJump < 320) this.events.push('fly'); this.lastJump = now; } }
    if (name === 'sneak' && down) { t.sneak = !t.sneak; this.touchLayer.querySelector('.sneak').classList.toggle('lit', t.sneak); }
    if (name === 'up') t.up = down;
    if (name === 'down') t.down = down;
  }
  /** Shows the fly buttons instead of jump and sneak. */
  setFlying(on) {
    const q = s => this.touchLayer.querySelector(s);
    q('.up').hidden = !on; q('.down').hidden = !on;
  }

  // ---------- game pads ----------
  readPad(dt) {
    const pads = navigator.getGamepads?.() || [];
    const p = [...pads].find(g => g && g.connected);
    if (!p) return null;
    const b = i => p.buttons[i]?.pressed || p.buttons[i]?.value > 0.5, ax = i => { const v = p.axes[i] || 0; return Math.abs(v) < 0.15 ? 0 : v; };
    const any = p.buttons.some(x => x.pressed) || p.axes.some(v => Math.abs(v) > 0.3);
    if (any) this.setMode('pad');
    if (this.mode !== 'pad') return null;
    const prev = this.pad.prev, edge = i => b(i) && !prev[i];
    if (edge(3)) this.events.push('inventory');
    if (edge(9)) this.events.push('pause');
    if (edge(2)) this.events.push('drop');
    if (edge(4) || edge(14)) this.events.push('prev');
    if (edge(5) || edge(15)) this.events.push('next');
    if (edge(6)) this.events.push('use');
    if (edge(8)) this.events.push('debug');
    if (edge(12)) this.events.push('pick');
    if (edge(0)) { const now = performance.now(); if (now - this.lastJump < 320) this.events.push('fly'); this.lastJump = now; }
    if (edge(11)) this.pad.sneak = !this.pad.sneak;
    this.pad.prev = p.buttons.map(x => x.pressed || x.value > 0.5);
    const rx = ax(2), ry = ax(3), rate = 2.6 * this.sens() * dt;
    this.look[0] -= Math.sign(rx) * rx * rx * rate; this.look[1] -= Math.sign(ry) * ry * ry * rate * 0.8;
    return {fwd: -ax(1), side: ax(0), jump: b(0), sneak: b(1) || this.pad.sneak, sprint: b(10), attack: b(7), use: b(6), raw: p};
  }

  /** What the controls say this frame; events and turning are taken (reset). */
  read(dt) {
    const pad = this.readPad(dt), t = this.touch;
    const out = {fwd: 0, side: 0, jump: false, sneak: false, sprint: false, attack: false, use: false, aim: null, events: this.events, look: this.look, mode: this.mode, autoJump: this.mode === 'touch'};
    this.events = []; this.look = [0, 0];
    if (!this.enabled) return out;
    if (this.mode === 'touch') {
      if (t.stick) { out.fwd = -t.stick.dy; out.side = t.stick.dx; out.sprint = Math.hypot(t.stick.dx, t.stick.dy) > 0.97 && -t.stick.dy > 0.8; }
      out.jump = t.jump || t.up; out.sneak = t.sneak || t.down; out.attack = t.attack; out.aim = t.attack ? t.aim : this.tapAim; this.tapAim = null;
      out.flyDown = t.down;
    } else if (this.mode === 'pad' && pad) Object.assign(out, pad);
    else {
      out.fwd = (this.held('fwd') ? 1 : 0) - (this.held('back') ? 1 : 0); out.side = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
      out.jump = this.held('jump'); out.sneak = this.held('sneak'); out.sprint = this.held('sprint') || this.sprintKey;
      out.attack = this.mouse.attack && this.locked(); out.use = this.mouse.use && this.locked();
    }
    return out;
  }
}
