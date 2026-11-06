// What other plugins and scripts may call: window.stIphonie and the slash command /iphonie-draw. Other plugins draw with what the
// user set up here (the engine, the 画风, the looks of the people named), through the same queue as the story's pictures. Once
// published this cannot change: new things are added, old ones stay as they are. How to use it is in 使用说明.md.
import {activeStyle} from './core/draw.js';

/** A list of names, as an array or written with commas. */
const namesOf = value => (Array.isArray(value) ? value : String(value ?? '').split(/[,，、]/)).map(x => String(x ?? '').trim()).filter(Boolean);
const nameOf = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

/**
 * open(app): the phone opened, at an app when one is named. ask(title, text): a yes or no from the user (the tavern's own
 * dialog). storage: where a card's suggestion is remembered as asked.
 */
export function publicApi({pictures, backend, open = () => {}, ask = async () => false, storage = globalThis.localStorage}) {
  return Object.freeze({
    // 2 (0.9.34): open and suggestContacts were added; what 1 had is as it was.
    // 3 (0.9.35): suggestRoles was added, and both take {debug} (ask again each time: for a card's author trying it).
    apiVersion: 3,
    /** Opens the phone, at an app when one is named: 'chat', 'wardrobe', 'generator', 'music', 'draw' … */
    open(app = '') { open(String(app || '').slice(0, 40)); },
    /**
     * A card's people for the phone's 联系人 ([{name, persona}], from a card's script): the user is asked first, once for
     * the same names on this card; names already here are left. Resolves to how many were added.
     */
    async suggestContacts(list, {from = '', debug = false} = {}) {
      const have = new Set(backend.contacts().map(c => c.name)), want = [];
      for (const c of Array.isArray(list) ? list : []) {
        const name = nameOf(c?.name);
        if (name && !have.has(name) && !want.some(x => x.name === name)) want.push({name, persona: String(c?.persona ?? '').slice(0, 4000)});
      }
      if (!want.length) return 0;
      const key = `sttts.suggested:${backend.cardKey?.() || ''}:${want.map(c => c.name).join('|')}`.slice(0, 500);
      if (!debug) { try { if (storage?.getItem(key)) return 0; storage?.setItem(key, '1'); } catch { /* asked each time then */ } }
      const who = String(from || '').trim().slice(0, 40) || '这张卡';
      if (!await ask(`${who}想在小手机里加 ${want.length} 个联系人`, `${want.map(c => c.name).join('、')}。加了以后能在聊天 App 里和他们聊天，不想要以后也能删。要加吗？`)) return 0;
      let added = 0;
      for (const c of want) { try { backend.saveContact(c); added++; } catch { /* a name a role has here: left */ } }
      return added;
    },
    /**
     * A card's people for the 角色 App ([{name, persona, appearance}]: who they are, and how they look in pictures, as
     * English tags), so all of the phone knows them — chats, 朋友圈, pictures, 衣柜. Asked first, as suggestContacts;
     * names already here are left. Resolves to how many were added (they belong to the card open now).
     */
    async suggestRoles(list, {from = '', debug = false} = {}) {
      const have = new Set(backend.contacts().map(c => c.name)), want = [];
      for (const r of Array.isArray(list) ? list : []) {
        const name = nameOf(r?.name);
        if (name && !have.has(name) && !want.some(x => x.name === name)) want.push({name, persona: String(r?.persona ?? '').slice(0, 4000), appearance: String(r?.appearance ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000)});
      }
      if (!want.length) return 0;
      const key = `sttts.suggestedRoles:${backend.cardKey?.() || ''}:${want.map(r => r.name).join('|')}`.slice(0, 500);
      if (!debug) { try { if (storage?.getItem(key)) return 0; storage?.setItem(key, '1'); } catch { /* asked each time then */ } }
      const who = String(from || '').trim().slice(0, 40) || '这张卡';
      if (!await ask(`${who}想在小手机的角色 App 里加 ${want.length} 个角色`, `${want.map(r => r.name).join('、')}。加了以后聊天、朋友圈、画图都认得他们${want.some(r => r.appearance) ? '（画图时用上卡里写的外貌）' : ''}，以后也能在角色 App 里改或删。要加吗？`)) return 0;
      let added = 0;
      for (const r of want) { try { backend.saveRoute({name: r.name, engine: 'fish', voice: '', persona: r.persona, ...(r.appearance ? {appearance: r.appearance} : {})}); added++; } catch { /* a name taken here, or one that is no name */ } }
      return added;
    },
    /** Whether a picture can be drawn now: {ready, missing, engine, style, free} (free: false costs money, null not known yet). */
    drawStatus() {
      const state = backend.getState(), ready = backend.drawReady();
      return {ready, missing: ready ? '' : backend.drawMissing(), engine: state.draw.engine, style: activeStyle(state.draw)?.name || '', free: backend.drawQuote().free};
    },
    /**
     * Draws a picture: draw('1girl, rain') or draw({prompt, negative, characters, size, seed, ask, signal, from}).
     * Resolves to {url, blob, photoId, seed, width, height, model, engine, prompt}. It costs nothing unless the user says so.
     */
    draw(request) {
      const r = typeof request === 'string' ? {prompt: request} : request || {};
      return pictures.drawFor({prompt: r.prompt, negative: r.negative, characters: namesOf(r.characters), size: r.size, seed: r.seed, ask: r.ask !== false, signal: r.signal, from: r.from});
    },
  });
}

/** /iphonie-draw: the picture's address comes out, for the next command. ctx: the tavern's context; api(): the interface, null while the plugin is off. */
export function registerDrawCommand(ctx, api, notice) {
  const {SlashCommandParser: parser, SlashCommand: command, SlashCommandArgument: argument, SlashCommandNamedArgument: named} = ctx;
  if (globalThis.__stIphonieDrawCommand || !parser?.addCommandObject || !command?.fromProps || !argument?.fromProps || !named?.fromProps) return false;
  globalThis.__stIphonieDrawCommand = true;
  const option = (name, description) => named.fromProps({name, description, typeList: ['string']});
  parser.addCommandObject(command.fromProps({
    name: 'iphonie-draw',
    returns: '图片在酒馆里的地址',
    callback: async (args, value) => {
      const now = api();
      try {
        if (!now) throw Error('小手机现在没有启用');
        const seed = String(args.seed ?? '').trim();
        return (await now.draw({prompt: value, negative: args.negative, characters: args.characters, size: args.size, ...(seed ? {seed: Number(seed)} : {}), from: args.from})).url;
      } catch (error) {
        if (!error?.cancelled) notice(`小手机没有画这张图：${error?.message || error}`);
        return '';
      }
    },
    namedArgumentList: [option('negative', '不想要的内容，加在画风的负面后面'), option('characters', '图里的角色，用逗号隔开，他们的外貌会自动加上'), option('size', 'portrait、landscape 或 square'), option('seed', '种子'), option('from', '谁要画的，显示在排队和询问里')],
    unnamedArgumentList: [argument.fromProps({description: '提示词', typeList: ['string'], isRequired: true})],
    helpString: '用小手机绘图 App 里设好的引擎和画风画一张图，存进相册，返回图片在酒馆里的地址。要花钱的图会先问。',
  }));
  return true;
}
