// What other plugins and scripts may call: window.stIphonie and the slash command /iphonie-draw. Other plugins draw with what the
// user set up here (the engine, the 画风, the looks of the people named), through the same queue as the story's pictures. Once
// published this cannot change: new things are added, old ones stay as they are. How to use it is in 使用说明.md.
import {activeStyle} from './core/draw.js';

/** A list of names, as an array or written with commas. */
const namesOf = value => (Array.isArray(value) ? value : String(value ?? '').split(/[,，、]/)).map(x => String(x ?? '').trim()).filter(Boolean);

export function publicApi({pictures, backend}) {
  return Object.freeze({
    apiVersion: 1,
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
