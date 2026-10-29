// Commands typed in the chat bar (T, or / to start with one), as the game has them: /time, /weather, /gamemode,
// /difficulty, /give, /tp, /kill, /summon, /effect, /clear, /xp, /spawnpoint, /seed, /gamerule, /setblock, /fill,
// /help. Names may be
// the game's English ones or the Chinese ones shown in the game; ~ means "where I am" (~5 five blocks on). The game
// itself is reached through ctx (main.js), so this file only reads and checks what was typed.
import {ALL_ITEMS, itemInfo, BLOCKS, BY_NAME} from './blocks.js';
import {MOBS} from './mobs.js';
import {EFFECTS} from './brew.js';

export const DIFFICULTIES = {peaceful: '和平', easy: '简单', normal: '普通', hard: '困难'};
const MODES = {survival: '生存模式', creative: '创造模式'};
export const RULES = {keepInventory: '死亡不掉落', doDaylightCycle: '昼夜更替', doMobSpawning: '生成怪物', doWeatherCycle: '天气变化', doFireTick: '火焰蔓延'};
// the times of day by name, the game's numbers
const TIMES = {day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000};
const HELP = [
  '/time set day|noon|night|midnight|数字，/time add 数字，/time query',
  '/weather clear|rain|thunder', '/gamemode survival|creative', '/difficulty peaceful|easy|normal|hard',
  '/give 物品 [数量]', '/tp x y z（~ 是现在的位置）', '/kill', '/summon 生物 [x y z]', '/effect give 效果 [秒] [等级]，/effect clear',
  '/clear', '/xp add 数量 [levels]', '/spawnpoint', '/seed', '/gamerule 规则 true|false',
  '/setblock x y z 方块', '/fill x1 y1 z1 x2 y2 z2 方块 [replace|keep|hollow|outline]',
];

// a name typed: the game's id (minecraft: may be in front) or the Chinese one
const byZh = (list, zhOf) => { const m = new Map(); for (const k of list) m.set(zhOf(k), k); return m; };
let ITEM_ZH = null, MOB_ZH = null, EFFECT_ZH = null, BLOCK_ZH = null;
const itemId = s => { s = s.replace(/^minecraft:/, ''); if (itemInfo(s)) return s; ITEM_ZH ||= byZh(ALL_ITEMS, k => itemInfo(k)?.zh || k); return ITEM_ZH.get(s) || null; };
const mobId = s => { s = s.replace(/^minecraft:/, ''); if (MOBS[s]) return s; MOB_ZH ||= byZh(Object.keys(MOBS), k => MOBS[k].zh); return MOB_ZH.get(s) || null; };
// (by its Chinese name, a block itself, not its copy standing in water)
const blockId = s => { s = s.replace(/^minecraft:/, ''); if (BY_NAME[s]) return s; BLOCK_ZH ||= byZh(BLOCKS.filter(b => !b.dry).map(b => b.name), k => BY_NAME[k].zh); return BLOCK_ZH.get(s) || null; };
const effectId = s => { s = s.replace(/^minecraft:/, ''); if (EFFECTS[s]) return s; EFFECT_ZH ||= byZh(Object.keys(EFFECTS), k => EFFECTS[k].zh); return EFFECT_ZH.get(s) || null; };
const pick = (s, table) => { s = (s || '').toLowerCase(); if (table[s] != null) return s; return Object.keys(table).find(k => table[k] === s || (typeof table[k] === 'string' && table[k].startsWith(s) && s.length >= 2)) || null; };
const num = s => /^-?\d+(\.\d+)?$/.test(s || '') ? Number(s) : null;
/** A coordinate: a number, ~ (here) or ~n (here and n more). */
const coord = (s, here) => { if (s === '~') return here; if (/^~-?\d+(\.\d+)?$/.test(s || '')) return here + Number(s.slice(1)); return num(s); };

/**
 * Runs one line. ctx: {time, setTime(t), weather(kind), mode, setMode(m), difficulty, setDifficulty(d), give(id, n),
 * pos() → [x, y, z], teleport(x, y, z), kill(), summon(kind, x, y, z), effect(id, secs, amp), clearEffects(),
 * clear() → count, addXp(n, levels), setSpawn(), seed, rules, setRule(name, on), setBlocks([[x, y, z, name]], keep) →
 * how many changed or why not}. Returns {ok, text} (in Chinese).
 */
export function runCommand(line, ctx) {
  const parts = line.trim().replace(/^\//, '').split(/\s+/).filter(Boolean), [cmd, ...a] = parts;
  const ok = text => ({ok: true, text}), no = text => ({ok: false, text});
  if (!cmd) return no('输入一个指令，比如 /time set day；/help 看全部');
  switch (cmd.toLowerCase()) {
    case 'help': case '?': case '帮助': return ok(HELP.join('\n'));
    case 'time': {
      const sub = (a[0] || '').toLowerCase(), day = Math.floor(ctx.time / 24000) * 24000;
      if (sub === 'query') return ok(`现在是第 ${Math.floor(ctx.time / 24000) + 1} 天，时间 ${Math.floor(ctx.time % 24000)}`);
      if (sub === 'set') {
        const t = TIMES[(a[1] || '').toLowerCase()] ?? num(a[1]);
        if (t == null) return no('用法：/time set day|noon|night|midnight|数字');
        // (the clock as the game's: 0 sunrise, 6000 noon; set forward to that time of the day, never back)
        const ours = ((t % 24000) + 24000) % 24000;
        ctx.setTime(day + ours + (day + ours < ctx.time ? 24000 : 0));
        return ok('时间已设置');
      }
      if (sub === 'add') { const n = num(a[1]); if (n == null) return no('用法：/time add 数字'); ctx.setTime(ctx.time + n); return ok(`时间加了 ${n}`); }
      return no('用法：/time set|add|query');
    }
    case 'weather': {
      const k = {clear: 'clear', rain: 'rain', thunder: 'thunder', 晴: 'clear', 晴天: 'clear', 雨: 'rain', 下雨: 'rain', 雷雨: 'thunder'}[(a[0] || '').toLowerCase()];
      if (!k) return no('用法：/weather clear|rain|thunder');
      ctx.weather(k);
      return ok({clear: '天晴了', rain: '下雨了', thunder: '雷雨来了'}[k]);
    }
    case 'gamemode': case 'gm': {
      const m = pick({0: 'survival', 1: 'creative', s: 'survival', c: 'creative', 生存: 'survival', 创造: 'creative'}[a[0]] || a[0], MODES);
      if (!m) return no('用法：/gamemode survival|creative');
      ctx.setMode(m);
      return ok(`换成了${MODES[m]}`);
    }
    case 'difficulty': {
      if (!a[0]) return ok(`难度是${DIFFICULTIES[ctx.difficulty]}`);
      const d = pick({0: 'peaceful', 1: 'easy', 2: 'normal', 3: 'hard'}[a[0]] || a[0], DIFFICULTIES);
      if (!d) return no('用法：/difficulty peaceful|easy|normal|hard');
      ctx.setDifficulty(d);
      return ok(`难度改成了${DIFFICULTIES[d]}`);
    }
    case 'give': {
      // (the game's own form has the player first: /give @s apple 3)
      const b = /^@|^[a-z]{3,16}$/.test(a[0] || '') && !itemId(a[0]) && a[1] ? a.slice(1) : a;
      const id = itemId(b[0] || ''), n = b[1] == null ? 1 : num(b[1]);
      if (!id) return no(b[0] ? `没有叫「${b[0]}」的物品` : '用法：/give 物品 [数量]');
      if (n == null || n < 1 || n > 6400) return no('数量是 1 到 6400');
      ctx.give(id, Math.floor(n));
      return ok(`给了 ${itemInfo(id)?.zh || id} × ${Math.floor(n)}`);
    }
    case 'tp': case 'teleport': {
      const b = a.length === 4 ? a.slice(1) : a, [px, py, pz] = ctx.pos();
      const x = coord(b[0], px), y = coord(b[1], py), z = coord(b[2], pz);
      if (x == null || y == null || z == null) return no('用法：/tp x y z（~ 是现在的位置）');
      if (y < -64 || y > 400 || Math.abs(x) > 3e7 || Math.abs(z) > 3e7) return no('那里出了世界');
      ctx.teleport(x, y, z);
      return ok(`传送到 ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
    }
    case 'kill': ctx.kill(); return ok('');
    case 'summon': {
      const kind = mobId(a[0] || '');
      if (!kind) return no(a[0] ? `没有叫「${a[0]}」的生物` : '用法：/summon 生物 [x y z]');
      const [px, py, pz] = ctx.pos(), x = a[1] ? coord(a[1], px) : px, y = a[2] ? coord(a[2], py) : py, z = a[3] ? coord(a[3], pz) : pz;
      if (x == null || y == null || z == null) return no('用法：/summon 生物 [x y z]');
      ctx.summon(kind, x, y, z);
      return ok(`召唤了${MOBS[kind].zh}`);
    }
    case 'effect': {
      const sub = (a[0] || '').toLowerCase();
      if (sub === 'clear') { ctx.clearEffects(); return ok('效果都没了'); }
      const b = sub === 'give' ? a.slice(1) : a;
      // (the game's own form has the player first: /effect give @s speed 30 1)
      const c = b[0] && !effectId(b[0]) && b[1] && effectId(b[1]) ? b.slice(1) : b;
      const id = effectId(c[0] || ''), secs = c[1] == null ? 30 : num(c[1]), amp = c[2] == null ? 0 : num(c[2]);
      if (!id) return no(c[0] ? `没有叫「${c[0]}」的效果` : '用法：/effect give 效果 [秒] [等级]');
      if (secs == null || secs < 0 || secs > 1e6 || amp == null || amp < 0 || amp > 255) return no('秒数或等级不对');
      ctx.effect(id, secs, Math.floor(amp));
      return ok(`得到了${EFFECTS[id].zh}`);
    }
    case 'clear': return ok(`清掉了 ${ctx.clear()} 件物品`);
    case 'xp': case 'experience': {
      const b = (a[0] || '').toLowerCase() === 'add' ? a.slice(1) : a, n = num((b[0] || '').replace(/l$/i, '')), levels = /l$/i.test(b[0] || '') || (b[1] || '').toLowerCase().startsWith('level');
      if (n == null) return no('用法：/xp add 数量 [levels]');
      ctx.addXp(Math.floor(n), levels);
      return ok(levels ? `加了 ${n} 级` : `加了 ${n} 点经验`);
    }
    case 'spawnpoint': case 'setworldspawn': ctx.setSpawn(); return ok('重生点设在了这里');
    case 'seed': return ok(`种子：${ctx.seed}`);
    case 'gamerule': {
      const name = Object.keys(RULES).find(k => k.toLowerCase() === (a[0] || '').toLowerCase());
      if (!name) return no(`规则有：${Object.keys(RULES).map(k => `${k}（${RULES[k]}）`).join('、')}`);
      // (a world made before a rule was added has it as the game's default)
      if (a[1] == null) return ok(`${name} 是 ${(ctx.rules[name] ?? defaultRules()[name]) ? 'true' : 'false'}`);
      const on = {true: true, false: false, 开: true, 关: false}[a[1].toLowerCase()];
      if (on == null) return no(`用法：/gamerule ${name} true|false`);
      ctx.setRule(name, on);
      return ok(`${RULES[name]}：${on ? '开' : '关'}`);
    }
    // a block put somewhere, or a box of them (the game's at most 32768 at a time): replace (all of it), keep (only
    // where there is air), hollow (the shell, air inside), outline (the shell, the inside left as it is)
    case 'setblock': case 'fill': {
      const one = cmd.toLowerCase() === 'setblock', n = one ? 3 : 6, [px, py, pz] = ctx.pos(), here = [px, py, pz].map(Math.floor);
      const at = a.slice(0, n).map((s, i) => coord(s, here[i % 3])), id = blockId(a[n] || ''), mode = (a[n + 1] || 'replace').toLowerCase();
      if (at.length < n || at.some(v => v == null) || !a[n]) return no(one ? '用法：/setblock x y z 方块' : '用法：/fill x1 y1 z1 x2 y2 z2 方块 [replace|keep|hollow|outline]');
      if (!id) return no(`没有叫「${a[n]}」的方块`);
      if (!['replace', 'keep', 'hollow', 'outline'].includes(mode)) return no('最后可以是 replace、keep、hollow 或 outline');
      const [x0, y0, z0] = at.slice(0, 3).map(Math.floor), [x1, y1, z1] = (one ? at.slice(0, 3) : at.slice(3)).map(Math.floor);
      const lo = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], hi = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
      const size = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
      if (size > 32768) return no(`一次最多 32768 格（这次 ${size} 格）`);
      const list = [];
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
        const edge = x === lo[0] || x === hi[0] || y === lo[1] || y === hi[1] || z === lo[2] || z === hi[2];
        if (mode === 'outline' && !edge) continue;
        list.push([x, y, z, mode === 'hollow' && !edge ? 'air' : id]);
      }
      const r = ctx.setBlocks(list, mode === 'keep');
      if (typeof r === 'string') return no(r);
      if (!r) return no(one ? '那里已经是这个方块了' : '一格也没变');
      return ok(one ? `放了${BY_NAME[id].zh}` : `填了 ${r} 格${BY_NAME[id].zh}`);
    }
    default: return no(`不认识的指令「${cmd}」；/help 看全部`);
  }
}
/** The game rules a world starts with. */
export const defaultRules = () => ({keepInventory: false, doDaylightCycle: true, doMobSpawning: true, doWeatherCycle: true, doFireTick: true});
