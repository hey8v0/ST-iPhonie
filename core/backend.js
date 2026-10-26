import {withProxyHeaders} from './proxy-url.js';
import { normalizeNarration, NARRATOR } from './narration.js';
import {RequestLog} from './request-log.js';
import {PROMPT_BLOCKS, normalizePromptRules} from './prompt-rules.js';
import { normalizeVn, spriteRequest, castFiles, moveCastFiles } from './vn.js';
import { currentModel } from './model-files.js';
import { MomentStore } from './moments-store.js';
import { MUSIC_LIMITS, normalizeMusic, normalizeSource, validateSource, readSearch, readLink, missingLink, trialOnly, asChina, playable, onTavern, isAudio, fill as fillSource, songRow, bestMatch, matchScore, pick as pickPath } from './music.js';
import { AppStore } from './app-store.js';
import { ASSISTANT_LIMITS, normalizeAssistant, validateAssistantPatch, assistantId, assistantMessage, assertAssistantThread, assistantSummary } from './assistant.js';
import { FORUM_LIMITS, buildForumRequest, cleanPost as cleanForumPost, cleanReply as cleanForumReply, startingHeat } from './forum.js';
import { buildPeekRequest, cleanPeek, peekId } from './peek.js';
import { languageCode } from './languages.js';
import { normalizeMoments, buildMomentsRequest } from './moments.js';
import { normalizeCalls, buildCallRequest } from './call.js';
import { normalizeText, activeText, customRequest, listModels, streamText, asMessages, tavernTextRequest, answerRoom, TEXT_PRESET_ID } from './llm.js';
import { normalizeEmbed, embedReady, embedTexts } from './embed.js';
import { bookId, emptyBook, cleanBook, removeNode, pruneBook } from './memory.js';
import { normalizeMemoryBooks, normalizeAssistantThreads } from './data-transfer.js';
import { normalizeSync, runSync, removeSync, joinGone, SYNC_PARTS } from './sync.js';
import { normalizePool } from './auto-voice.js';
import { normalizeSounds, soundRow, readPack, missingKey, soundName, packRows, PACK_FORMAT, SOUND_LIMITS, SOUND_KINDS } from './sounds.js';
import { decodeMono, encodeWav } from './audio-join.js';
import { BACKUP_PARTS, PART_STORES, writeBackup, readBackup, sealKeys, openKeys } from './backup.js';
import { WALLET_LIMITS, PREMIUM, DECOR_KINDS, SHOP_GIFTS, LEDGER_KINDS, premiumOf, decorKey, cents, yuan, shopGifts, normalizeGift, validateGift } from './wallet.js';
import { gptModels, DRAW_ENGINES, DRAW_ENGINE_NAMES, GPT_IMAGE_MODELS, GPT_QUALITIES, normalizeGpt, gptBase, gptSize, gptPrompt, gptGenerate, normalizeComfy, comfyUrl, checkWorkflow, workflowPlaceholders, COMFY_LIMITS, comfySize, comfyPrompt, comfyValues, fillWorkflow, comfyGenerate, comfyCatalog, comfyLoras, comfyClips, defaultWorkflow, tavernWorkflows, tavernWorkflow, orientationOf, DEFAULT_COMFY_WORKFLOW, COMFY_PARAM_KEYS, applyComfyWorkflow } from './image-engines.js';
import {activeLoraWorkflow, normalizeDisabledLoras, inspectLoras, editLoras, pickLoraSource} from './comfy-loras.js';
import { normalizeSettings, validateSettings, modelRules, freshState } from './state.js';
import { normalizeRoute, switchRouteEngine, removeRoute, withRoles, findRoute, cleanAliases } from './routes.js';
import { DEFAULT_PROMPT, DEFAULT_FORMAT, promptPlan, validatePreset, parseDialogue, isPlaceholderRole, knownFormats } from './protocol.js';
import { normalizeMarks, withMarks } from './voice-fx.js';
import { TTSParameters, FISH_API, tauriTavern } from './parameters.js';
import { KeyStore, keyTail, validateKey, parseTextKeys, joinTextKeys } from './keys.js';
import { Providers, buildRequest } from './providers.js';
import { AudioCache } from './cache.js';
import { installDrawSettings } from './backend-draw.js';
import { createStorageBudget } from './storage-budget.js';
import { DialoguePlayer } from './player.js';
import { LocalLibrary, PHONE_APPS, PHONE_WALLPAPERS, PHONE_GLYPHS, PHONE_SKINS } from './library.js';
import { NovelAIClient, relayUrl, FISH_PATHS, NAI_MODELS, NAI_MODEL_NAMES, NAI_SAMPLERS, NAI_SCHEDULES, buildImageRequest, guardParams, isFree, isV5, normalizeDrawParams, augmentBody, upscaleBy, UPSCALE_MAX, DIRECTOR_TOOLS } from './novelai.js';
import { PIC_TAG_FORMAT, DEFAULT_DRAW_RULE, DRAW_COUNT_MAX, PRESET_REV as DRAW_PRESET_REV, drawPromptPlan, planRequest, drawCast, validateDrawPreset, normalizeDraw, defaultDraw, normalizeVibeSettings, applyImageConnection } from './draw.js';
import { normalizeStickers, defaultChat, normalizeChatPreset, normalizeContact, validateChatPreset, validateContact, chatContacts, inSpace, activeSpace, buildChatRequest, activeChatPreset, normalizeVoiceText, normalizeProfile , normalizeAvatars, normalizeNames, normalizeProactive } from './chat.js';
import { ChatStore, money, currentDm } from './chats.js';
import { DrawQueue } from './draw-queue.js';
import { CloudQueue, KeyHashQueue, newRoomCode, validRoom, sha256Hex } from './cloud-queue.js';
import { vibeKey, readVibeFile, imageVibe, mergeVibe, encodingFor, withEncoding, vibeSummary, vibeParameters, singleFile, bundleFile, chatu8File, strength as vibeStrength, MAX_FREE_VIBES, VIBE_ANLAS } from './vibes.js';
/** musicFetch's answer when a 取歌地址 gave the song itself. */
const AUDIO = Symbol('audio');

export const BACKEND_API_VERSION = '1.0.0';
const ENGINES = ['fish', 'mini', 'eleven', 'mimo', 'doubao', 'custom'];
/** A small JPEG data URI of a base64 picture, for the vibe list; '' where pictures cannot be drawn (no canvas). */
async function vibeThumbnail(base64) {
    try {
        if (typeof createImageBitmap !== 'function' || !globalThis.document?.createElement) return '';
        const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))]));
        const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close?.();
        return canvas.toDataURL('image/jpeg', 0.82);
    } catch { return ''; }
}
/**
 * A vibe's picture kept small: the long side at most 1024px, as JPEG. The picture is only sent again to encode it for
 * another model or 提取信息量 (encodings already made are kept as they are), and a full-size PNG kept as base64 took
 * 1–2 MB a vibe. Returns the base64 unchanged when it is small already, when this one is not smaller, or without a canvas.
 */
async function smallVibeImage(base64) {
    try {
        if (!base64 || base64.length < 300 * 1024 || typeof createImageBitmap !== 'function' || !globalThis.document?.createElement) return base64;
        const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))]));
        const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const g = canvas.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
        g.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close?.();
        const small = canvas.toDataURL('image/jpeg', 0.92).replace(/^data:[^,]*,/, '');
        return small && small.length < base64.length * 0.8 ? small : base64;
    } catch { return base64; }
}
const clone = value => structuredClone(value);
const assistantTransferRows = docs => normalizeAssistantThreads(docs.filter(row => row.kind === 'assistant').map(thread => ({...thread,
    memory: docs.find(row => row.id === bookId(thread.id) && row.memoryRevision === (thread.memoryRevision || 0)) || null,
})));
const engineCheck = engine => { if (!ENGINES.includes(engine)) throw Error('引擎无效'); };
// Keys cover the voice engines, NovelAI for drawing, and llm (the phone's own text model).
const keyCheck = engine => { if (engine !== 'nai' && engine !== 'llm' && engine !== 'gpt' && engine !== 'embed') engineCheck(engine); };
const modelCheck = (engine, model) => { engineCheck(engine); if (model && !TTSParameters.catalogs[engine].models.includes(model)) throw Error('请选择列表中的模型'); };
const message = error => error instanceof TypeError ? '设置格式无效，请检查字段和条目' : error.message;

/** Framework-independent operations. Host callbacks own SillyTavern persistence and rendering. */
// Audio files are named after who said what: 诺亚 - 午安，格林小姐.
const audioName = (role, said) => [String(role || '').trim(), String(said || '').replace(/\s+/g, ' ').trim().slice(0, 30)].filter(Boolean).join(' - ') || 'ST-iPhonie 语音';

// Where the phone drew an album photo, by the name it gave it: the drawing app (named after the engine), in-text
// pictures, 查手机 and 朋友圈. Each name ends in the seed (or the time) and the file type.
const DRAWN_SOURCES = [
    ['draw', '绘图 App', /^(?:NovelAI|GPT ?生图|ComfyUI)-\d+\.(?:png|jpe?g|webp)$/],
    ['chat', '正文图片', /^chat-\d+\.(?:png|jpe?g|webp)$/],
    ['peek', '查手机', /^查手机-.+-\d+\.(?:png|jpe?g|webp)$/],
    ['moments', '朋友圈', /^朋友圈-.+-\d+\.(?:png|jpe?g|webp)$/],
    ['assistant', '助手生图', /^assistant-\d+\.(?:png|jpe?g|webp)$/],
    ['chatapp', '聊天图片', /^聊天-.+-\d+\.(?:png|jpe?g|webp)$/],
];
export class TTSBackend {
    constructor({ settings, persist = () => {}, notify = () => {}, change = () => {}, unknown = () => {},
        providers = new Providers(), cache, library, keyStore, sink, novelai, chats, indexedDB = globalThis.indexedDB, syncStorage = () => globalThis.localStorage,
        imageFetch = (...args) => globalThis.fetch(...args), soundPack = '', speech = null, tavernHeaders = () => globalThis.SillyTavern?.getContext?.()?.getRequestHeaders?.() || {} } = {}) {
        this.settings = normalizeSettings(settings);
        validateSettings(this.settings);
        this.persist = persist;
        this.notify = notify;
        this.providers = providers;
        // 自己的接口 that does not let web pages ask it: asked through the tavern's own proxy, with the tavern's login.
        if (!this.providers.proxy) this.providers.proxy = (url, init, signal) => this.proxyFetch('/proxy/' + encodeURIComponent(url), { ...init, credentials: 'same-origin', redirect: 'error', signal });
        // Voice balances (ElevenLabs, Fish) read for the engine cards; a new audio marks them out of date.
        this.balances = new Map();
        // Several Fish keys: when one gives way to the next, the balance shown belongs to the old key.
        providers.onKeySwitch = engine => { this.balances.delete(engine); this.emit('balance', { engine, stale: true, switched: true }); };
        providers.onSpend = engine => { const b = this.balances.get(engine); if (b) b.checkedAt = 0; this.emit('balance', { engine, stale: true }); };
        // How much this browser lets the phone keep (a share of what it gives the site, core/storage-budget.js).
        this.budget = createStorageBudget();
        this.cache = cache || new AudioCache(this.settings.scope, notify, indexedDB, { limit: this.budget.voice, keep: this.budget.keep });
        this.library = library || new LocalLibrary(this.settings.scope, { indexedDB, limit: this.budget.library, keep: this.budget.keep });
        this.keyStore = keyStore || new KeyStore(this.settings.scope, { indexedDB, onError: message => this.notify(message) });
        this.novelai = novelai || new NovelAIClient();
        this.requestLog = new RequestLog({change: () => this.emit('logs', {}), secrets: () => [
            ...this.keyStore.load().values(), ...(this.textKeys?.values() || []), this.gptKey, this.embedKey, this.novelai.key,
            ...(this.imageKeys?.nai?.values() || []), ...(this.imageKeys?.gpt?.values() || []),
            ...(this.providers.keys?.values() || [])].flatMap(x => typeof x === 'string' ? x.split('\n').filter(Boolean) : [])});
        if (typeof this.providers.fetcher === 'function') this.providers.fetcher = this.requestLog.fetch(withProxyHeaders(this.providers.fetcher.bind(this.providers), tavernHeaders), '语音模型');
        if (typeof this.novelai.fetch === 'function') this.novelai.fetch = this.requestLog.fetch(withProxyHeaders(this.novelai.fetch.bind(this.novelai), tavernHeaders), 'NovelAI');
        this.textKeys = new Map();
        this.imageKeys = {nai: new Map(), gpt: new Map()};
        this.imageConnectionRevision = 0;
        // Saved vibes by id: their summaries (core/vibes.js vibeSummary); the files themselves stay in the library.
        this.vibes = new Map();
        this.chats = chats || new ChatStore(this.settings.scope, { indexedDB });
        this.moments = new MomentStore(this.settings.scope, { indexedDB });
        // 论坛 and 查手机 (core/forum.js, core/peek.js).
        this.apps = new AppStore(this.settings.scope, { indexedDB });
        // 记忆 (core/memory.js): one book per chat, and the vectors of its older messages. A database of its own: big.
        this.memoryStore = new AppStore(this.settings.scope, { indexedDB, database: 'st-iphonie-memory-v1' });
        // 音效 (core/sounds.js): the sound library and the names the story asked for that it has none of. Its own database: big.
        this.sounds = new AppStore(this.settings.scope, { indexedDB, database: 'st-iphonie-sounds-v1' });
        this.music = new AppStore(this.settings.scope, { indexedDB, database: 'st-iphonie-music-v1' });
        // 自带音效包: the folder of the plugin's sounds (sounds/pack.json lists them); '' when there is none (tests).
        this.soundPack = soundPack;
        this.packLoad = null;
        // 向量模型's key (core/embed.js).
        this.embedKey = '';
        // 分区: the tavern's open character card (or group), told by the tavern page (index.js).
        this.space = { key: '', name: '', members: [] };
        this.subscription = null;
        // GPT 生图 and ComfyUI: the key of the GPT image engine; requests go out with these (tests pass their own).
        this.gptKey = '';
        this.assetFetch = imageFetch;
        this.musicTransport = this.requestLog.fetch((...args) => this.assetFetch(...args), '音乐音源');
        this.imageFetch = this.requestLog.fetch(withProxyHeaders(imageFetch, tavernHeaders), '绘图接口');
        this.proxyFetch = this.requestLog.fetch(withProxyHeaders(imageFetch, tavernHeaders), '酒馆转发');
        this.textFetch = this.requestLog.fetch(withProxyHeaders((...args) => globalThis.fetch(...args), tavernHeaders), '文字模型接口');
        this.embedFetch = this.requestLog.fetch(withProxyHeaders((...args) => globalThis.fetch(...args), tavernHeaders), '向量模型');
        this.tavernHeaders = tavernHeaders;
        // 保存到酒馆: the tavern's file access (set by the tavern side), what this device last saw there, and the state shown in the phone.
        this.syncFiles = null;
        this.syncStorage = syncStorage;
        this.syncState = { busy: false, error: '', lastAt: 0, remote: null, pending: false };
        this.syncTimer = 0;
        this.syncApplying = false;
        this.drawQueue = new DrawQueue({ gap: () => this.settings.draw.queue.gap * 1000, retries: () => this.settings.draw.queue.retries,
            remote: () => this.settings.draw.engine === 'nai' ? this.cloudQueue() : null, onChange: (queue, { remoteError }) => this.emit('draw', { queue, cloud: remoteError }) });
        this.listeners = new Set();
        this.revision = 0;
        this.closed = false;
        this.prepared = null;
        this.player = new DialoguePlayer({
            settings: () => this.settings, providers, cache: this.cache, ...(sink ? { sink } : {}), unknown, speech,
            change: state => { if (state.phase === 'error') this.reportDiagnostic('语音播放', {message: state.message}); change(state); this.emit('playback', state); },
            prepared: audio => { this.prepared = audio; this.emit('audio-ready', this.audioInfo(audio)); },
        });
    }
    async initialize() {
        this.assertOpen();
        try { await this.keyStore.open?.(); for (const [engine, key] of this.keyStore.load()) { if (engine === 'nai' || engine === 'gpt') this.imageKeys[engine] = parseTextKeys(key); else if (engine === 'llm') this.textKeys = parseTextKeys(key); else if (engine === 'embed') this.embedKey = String(key).trim(); else this.providers.setKey(engine, key); } this.activateImageKeys(); }
        catch (error) { this.notify(error.message); }
        try {
            const phone = await this.library.getPhone();
            if (!this.closed) this.player.setVolume(phone.volume);
            await this.loadReferences();
            await this.loadVibes();
        } catch (error) { this.notify(error.message); }
        return this;
    }
    /** Reads the Fish reference audio and the MiMo clone samples the settings use into memory, for requests. */
    async loadReferences() {
        for (const reference of [...this.settings.connections.fish.params.references, ...(this.settings.connections.mimo?.params.samples || [])]) {
            const record = await this.library.getReference(reference.audio);
            if (record && !this.closed) { const audio = await this.base64(record.blob); if (!this.closed) this.providers.references.set(record.id, audio); }
        }
    }
    /** A backup file of the chosen parts (core/backup.js BACKUP_PARTS). Keys and the account scope are never written. */
    async exportBackup(parts = Object.keys(BACKUP_PARTS), version = '', { password = '' } = {}) {
        this.assertOpen();
        const want = [...new Set(parts)].filter(part => BACKUP_PARTS[part]);
        if (!want.length) throw Error('请至少选一项要备份的内容');
        const stores = want.flatMap(part => PART_STORES[part]);
        const library = stores.length ? await this.library.exportRows(stores) : {};
        let settings = null;
        if (want.includes('settings')) { settings = this.getState(); delete settings.scope; delete settings.floating; }
        const chats = want.includes('chats') ? await this.chats.exportThreads() : null, moments = want.includes('moments') ? await this.moments.exportPosts() : null;
        // Keys only with a password: sealed here, never written as they are.
        let keys = null;
        if (want.includes('keys')) { const all = Object.fromEntries(this.keyStore.load()); if (!Object.keys(all).length) throw Error('这台浏览器里还没有保存密钥，备份里不用带'); keys = await sealKeys(all, password); }
        // Vibe groups live in the settings; they travel with the vibes too, so a backup of only the vibes keeps them.
        const vibeGroups = want.includes('vibes') ? clone(this.settings.draw.vibe.groups) : null;
        const memories = want.includes('memories') ? await this.exportChatMemories() : null;
        const assistant = want.includes('assistant') ? await this.exportAssistantThreads() : null;
        // The 视觉小说's 立绘 and 模型 are files in the tavern; the settings only name them. A backup carries the files.
        let vnFiles = null;
        if (want.includes('vnFiles')) {
            const paths = castFiles(this.settings.vn.cast);
            if (paths.length && !this.syncFiles?.readPath) throw Error('要在酒馆里打开小手机，才能把视觉小说的立绘和模型放进备份（不要的话把这一项关掉）');
            vnFiles = [];
            for (const path of paths) { const blob = await this.syncFiles.readPath(path).catch(() => null); if (blob) vnFiles.push({ path, blob }); }
        }
        const blob = await writeBackup({ version, settings, library, chats, moments, keys, vibeGroups, memories, assistant, vnFiles });
        const day = new Date(), pad = n => String(n).padStart(2, '0');
        return { blob, name: `ST-iPhonie 备份 ${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}` };
    }
    /** What a backup file holds, to show before restoring. */
    async inspectBackup(file) {
        this.assertOpen();
        const backup = await readBackup(file);
        return { version: backup.version, createdAt: backup.createdAt, summary: backup.summary };
    }
    /**
     * Restores the chosen parts of a backup. replace: those kinds of data are emptied first; otherwise rows with the
     * same id are overwritten and the rest kept. Settings are taken whole from the backup; keys, the account scope and
     * the floating ball's place stay. Everything is checked before anything is written.
     */
    async importBackup(file, { parts = [], replace = false, password = '' } = {}) {
        this.assertOpen();
        const backup = await readBackup(file), want = new Set(parts.filter(part => BACKUP_PARTS[part])), done = {};
        if (!want.size) throw Error('请至少选一项要恢复的内容');
        // Keys first: a wrong password stops the restore before anything else changes.
        let keys = null;
        if (want.has('keys') && backup.keys) keys = await openKeys(backup.keys, password);
        let settings = null;
        if (want.has('settings') && backup.settings) {
            settings = normalizeSettings({ ...backup.settings, scope: this.settings.scope, floating: this.settings.floating });
            validateSettings(settings);
        }
        // The 视觉小说's files the tavern lacks (another tavern, or deleted since the backup) go back in first; where
        // one lands elsewhere, the settings are pointed there.
        let moved = null;
        if (want.has('vnFiles') && backup.vnFiles?.length) {
            if (!this.syncFiles?.writePath) throw Error('要在酒馆里打开小手机，才能恢复视觉小说的立绘和模型');
            moved = {}; done.vnFiles = 0;
            for (const f of backup.vnFiles) {
                if (await this.syncFiles.hasPath(f.path).catch(() => false)) continue;
                moved[f.path] = await this.syncFiles.writePath(f.path, f.blob);
                done.vnFiles++;
            }
            if (settings) settings.vn.cast = moveCastFiles(settings.vn.cast, moved);
        }
        const rows = {};
        for (const part of want) for (const store of PART_STORES[part]) if (backup.library[store]) rows[store] = backup.library[store];
        // One transaction for the library: photos land before the phone's look that uses them, references before the
        // settings that point at them.
        if (Object.keys(rows).length) Object.assign(done, await this.library.importRows(rows, { replace }));
        if (settings) { this.save(settings); done.settings = true; await this.loadReferences(); }
        else if (moved && Object.entries(moved).some(([a, b]) => a !== b)) this.saveVn({ cast: moveCastFiles(this.settings.vn.cast, moved) });
        if (want.has('vibes') && backup.library.vibes) {
            // The groups: replace takes the backup's; merge keeps the current ones and adds or overwrites by id.
            const now = this.settings.draw.vibe, incoming = backup.vibeGroups || [];
            const groups = replace ? incoming : [...now.groups.filter(g => !incoming.some(x => x?.id === g.id)), ...incoming];
            this.saveDraw({ vibe: { groups } });
            await this.loadVibes();
            const use = this.settings.draw.vibe.use;
            if (use.kind === 'vibe' && !this.vibes.has(use.id)) this.saveDraw({ vibe: { use: { kind: '', id: '' } } });
            this.emit('draw', { vibes: true });
            done.vibeGroups = this.settings.draw.vibe.groups.length;
        }
        if (want.has('chats') && backup.chats) { done.chats = await this.chats.importThreads(backup.chats, { replace }); this.emit('chat', { threadId: '' }); }
        if (want.has('moments') && backup.moments) { done.moments = await this.moments.importPosts(backup.moments, { replace }); this.emit('moments', {}); }
        if (want.has('memories') && backup.memories) done.memories = await this.importChatMemories(backup.memories, {replace, restoring: true});
        if (want.has('assistant') && backup.assistant) done.assistant = await this.importAssistantThreads(backup.assistant, {replace, restoring: true});
        if (keys) { let count = 0; for (const [engine, key] of Object.entries(keys)) { try { this.setKey(engine, key); count++; } catch { /* an engine this version does not know */ } } done.keys = count; }
        for (const collection of ['favorites', 'photos', 'notes']) if (collection in done) this.emit('library', { collection });
        if ('phone' in done || 'photos' in done) this.emit('phone', { preferences: await this.getPhone() });
        return done;
    }
    assertOpen() { if (this.closed) throw Error('插件已关闭，请重新打开设置'); }
    emit(type, data = {}) {
        if (this.closed) return;
        const event = { type, revision: this.revision, ...clone(data) };
        if (!this.syncApplying && (type === 'chat' || type === 'moments' || (['memory', 'assistant'].includes(type) && data.persisted) || (type === 'library' && ['notes', 'photos'].includes(data.collection)))) this.scheduleSync();
        for (const listener of this.listeners) { try { listener(clone(event)); } catch { /* One view cannot stop the other subscribers. */ } }
    }
    subscribe(listener) {
        this.assertOpen();
        if (typeof listener !== 'function') throw Error('状态订阅需要回调函数');
        this.listeners.add(listener);
        try { listener({ type: 'playback', revision: this.revision, ...this.player.snapshot() }); } catch { this.listeners.delete(listener); throw Error('界面无法接收播放状态'); }
        return () => this.listeners.delete(listener);
    }
    getState() { this.assertOpen(); return clone(this.settings); }
    getSnapshot() { return { state: this.getState(), revision: this.revision }; }
    save(next, expectedRevision) {
        this.assertOpen();
        if (expectedRevision !== undefined && expectedRevision !== this.revision) throw Error('配置已在别处修改，请重新读取后保存');
        let copy;
        try {
            if (!next || typeof next !== 'object' || !Array.isArray(next.routes) || !Array.isArray(next.presets)) throw Error('设置缺少角色或预设列表');
            copy = normalizeSettings(next);
            copy.scope = this.settings.scope;
            copy.routes = copy.routes.map(route => ({ ...route, id: route.id || crypto.randomUUID(), name: String(route.name || '').trim() }));
            if (new Set(copy.routes.map(route => route.id)).size !== copy.routes.length) throw Error('角色 ID 不可重复');
            if (new Set(copy.presets.map(preset => preset.id)).size !== copy.presets.length) throw Error('预设 ID 不可重复');
            for (const route of copy.routes) {
                modelCheck(route.engine, route.model);
                for (const [engine, binding] of Object.entries(route.bindings || {})) modelCheck(engine, binding.model);
            }
            for (const [engine, connection] of Object.entries(copy.connections)) modelCheck(engine, connection.model);
            validateSettings(copy);
        } catch (error) { throw Error(message(error)); }
        const imageChanged = JSON.stringify([copy.draw.connections, copy.draw.engine]) !== JSON.stringify([this.settings.draw.connections, this.settings.draw.engine]);
        if (imageChanged) this.assertImageIdle();
        // The host callback completes before the service acknowledges a new settings revision.
        this.persist(clone(copy));
        this.settings = copy;
        if (imageChanged) this.activateImageKeys();
        this.revision++;
        this.emit('settings', { state: this.getState() });
        return this.getState();
    }
    /** 整篇朗读: on or off, the 旁白's voice (系统朗读 or the 旁白 role), the system voice and speed, the tags not read. */
    saveNarration(patch) {
        if (!patch || typeof patch !== 'object') throw Error('设置格式无效');
        const next = this.getState();
        next.narration = normalizeNarration({ ...next.narration, ...clone(patch) });
        return clone(this.save(next).narration);
    }
    /** 视觉小说: its settings (the 立绘 of each character are in cast). */
    saveVn(patch) {
        if (!patch || typeof patch !== 'object') throw Error('设置格式无效');
        const next = this.getState();
        next.vn = normalizeVn({ ...next.vn, ...clone(patch) });
        return clone(this.save(next).vn);
    }
    /** 视觉小说: the people of the open card (everyone when no card is open), with their looks and 立绘. */
    vnCast() {
        const s = this.settings, names = drawCast(s, this.space, []) || s.routes.map(r => r.name);
        return [...new Set(names)].filter(n => n && !isPlaceholderRole(n) && n !== NARRATOR).map(name => {
            const route = s.routes.find(r => r.name === name);
            const entry = s.vn.cast[name];
            return { name, appearance: route?.appearance || '', sprite: entry?.sprite || '', seed: entry?.seed ?? -1, alts: clone(entry?.alts || []), mix: !!entry?.mix, looks: clone(entry?.looks || {}), actions: clone(entry?.actions || []), outfits: clone(entry?.outfits || []), models: clone(entry?.models || []), useModel: entry?.useModel || '', model: clone(currentModel(entry)) };
        });
    }
    updateGeneral(patch) {
        if (!patch || typeof patch !== 'object') throw Error('设置格式无效');
        const next = this.getState();
        for (const key of ['voiceEnabled', 'hideStoryWaves', 'storyTools', 'cacheEnabled', 'floatingEnabled', 'waveformEnabled', 'wallpaperMotion', 'stripVoice', 'voiceExample', 'autoVoice', 'voiceIsland', 'pregenerate']) if (key in patch) {
            if (typeof patch[key] !== 'boolean') throw Error('开关设置无效'); next.general[key] = patch[key];
        }
        // 配音方式: the story model writes the voice tags itself ('inline'), or they are added after the reply ('separate').
        if ('voiceMode' in patch) {
            if (!['inline', 'separate'].includes(patch.voiceMode)) throw Error('配音方式无效');
            next.general.voiceMode = patch.voiceMode;
        }
        if ('defaultLanguage' in patch) {
            if (typeof patch.defaultLanguage !== 'string' || !patch.defaultLanguage.trim() || patch.defaultLanguage.length > 40) throw Error('默认语言无效');
            next.general.defaultLanguage = patch.defaultLanguage.trim();
        }
        return this.save(next);
    }
    saveRoute(value) {
        const next = this.getState();
        if (!value || typeof value.name !== 'string' || !value.name.trim() || isPlaceholderRole(value.name)) throw Error('请填写实际角色名');
        const id = value.id || crypto.randomUUID(), index = next.routes.findIndex(route => route.id === id);
        const route = normalizeRoute({ ...(index >= 0 ? next.routes[index] : { engine: 'fish', voice: '', model: '', language: '' }), ...clone(value), id, name: value.name.trim() });
        // 角色资料: who they are, for the phone's apps when the tavern has no card for them.
        if (typeof route.persona === 'string') { route.persona = route.persona.slice(0, 4000); if (!route.persona.trim()) delete route.persona; } else delete route.persona;
        // A new role belongs to the card it was made in (分区); one made with no card open is everyone's.
        if (index < 0 && this.cardKey() && !route.cards?.length) route.cards = [this.cardKey()];
        if (index >= 0) next.routes[index] = route; else next.routes.push(route);
        next.selected = id;
        this.save(next);
        return clone(this.settings.routes.find(row => row.id === id));
    }
    /** 候选音色池: the voices 自动挑音色 picks from first. */
    saveVoicePool(list) {
        const next = this.getState();
        next.voicePool = normalizePool(list);
        return clone(this.save(next).voicePool);
    }
    deleteRoute(id) {
        const route = this.settings.routes.find(row => row.id === id);
        if (route && (this.player.pending === route.name || this.player.queue.some(line => line.role === route.name))) this.player.stop('角色配音已删除');
        return this.save(removeRoute(this.settings, id));
    }
    saveConnection(engine, patch) {
        engineCheck(engine);
        if (!patch || typeof patch !== 'object' || Array.isArray(patch) || ('params' in patch && (!patch.params || typeof patch.params !== 'object' || Array.isArray(patch.params)))) throw Error('引擎设置格式无效');
        patch = clone(patch);
        // Fish relay: an address checked like the NovelAI one ('' = straight to Fish). A new address: the balance is read again.
        if (engine === 'fish' && 'relay' in patch) { patch.relay = relayUrl(patch.relay, undefined, FISH_PATHS); if (patch.relay !== this.settings.connections.fish.relay) this.balances.delete('fish'); }
        else delete patch.relay;
        if (engine === 'fish' && 'relayApi' in patch) { if (!['fish', 'openai'].includes(patch.relayApi)) throw Error('中转接口格式无效'); this.balances.delete('fish'); }
        else if (engine !== 'fish') delete patch.relayApi;
        const next = this.getState();
        next.connections[engine] = { ...next.connections[engine], ...patch, params: { ...next.connections[engine].params, ...clone(patch.params || {}) } };
        this.save(next);
        return clone(this.settings.connections[engine]);
    }
    savePreset(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('预设格式无效');
        const next = this.getState(), preset = clone(value);
        preset.id ||= crypto.randomUUID();
        preset.marks = normalizeMarks(preset.marks);
        validatePreset(preset);
        const index = next.presets.findIndex(item => item.id === preset.id);
        if (index < 0) next.presets.push(preset); else next.presets[index] = preset;
        this.save(next);
        return clone(preset);
    }
    deletePreset(id) {
        const next = this.getState();
        if (!next.presets.some(preset => preset.id === id)) return next;
        if (next.presets.length === 1) throw Error('请至少保留一个提示词预设');
        next.presets = next.presets.filter(preset => preset.id !== id);
        return this.save(next);
    }
    selectPreset(id) {
        const next = this.getState();
        if (!next.presets.some(preset => preset.id === id)) throw Error('预设不存在');
        next.activePreset = id;
        return this.save(next);
    }
    previewPrompt(preset) {
        const state = preset ? { ...this.settings, activePreset: preset.id, presets: [clone(preset)] } : this.settings;
        return promptPlan(state, modelRules(state)).map(entry => entry.text).join('\n\n');
    }
    parse(text) {
        // 心声 and 电话 written the story's own way (*…* and the like, as the 配音预设 says) play as such.
        const formats = knownFormats(this.settings), marks = this.settings.presets.find(p => p.id === this.settings.activePreset)?.marks;
        for (const format of formats) { const lines = parseDialogue(text, format); if (lines.length) return { format, lines: withRoles(this.settings.routes, withMarks(text, lines, marks)) }; }
        return { format: formats[0], lines: [] };
    }
    setKey(engine, key) {
        keyCheck(engine); if (!String(key).trim()) throw Error('请填写密钥，或使用清除密钥');
        // The text model: a stored list (from a backup) replaces every preset's key; a plain key is the active preset's.
        if (engine === 'llm') { if (String(key).includes('\t')) this.storeTextKeys(parseTextKeys(key)); else this.setTextKey(this.settings.text.active, key); return; }
        if (engine === 'embed') { const value = String(key).replace(/[\u200b-\u200d\ufeff]/g, '').replace(/^\s*Bearer\s+/i, '').trim(); this.keyStore.save('embed', value); this.embedKey = value; this.emit('keys', { engine, configured: true }); return; }
        if (engine === 'nai' || engine === 'gpt') {
            this.assertImageIdle();
            const map = String(key).includes('\t') ? parseTextKeys(key) : new Map(this.imageKeys[engine]).set(this.settings.draw.connections[engine].active, validateKey(engine, key));
            this.storeImageKeys(engine, map); return;
        }
        const saved = this.keyStore.save(engine, key);
        this.providers.setKey(engine, saved); this.balances.delete(engine);
        this.emit('keys', { engine, configured: true });
    }
    /** Voice engines keep several keys: new ones are added after those saved (repeats once). Returns how many were new. */
    addKeys(engine, value) {
        engineCheck(engine);
        const fresh = validateKey(engine, value).split('\n').filter(Boolean);
        if (!fresh.length) throw Error('请填写密钥');
        const saved = this.savedKeys(engine), added = fresh.filter(key => !saved.includes(key));
        if (!added.length) throw Error(fresh.length > 1 ? '这些密钥都已经保存过了' : '这个密钥已经保存过了');
        this.setKey(engine, [...saved, ...added].join('\n'));
        return added.length;
    }
    /** Deletes one saved key by its place in the list (0-based); the last one deleted clears the engine's key. */
    removeKey(engine, index) {
        engineCheck(engine);
        const saved = this.savedKeys(engine);
        if (!Number.isInteger(index) || !saved[index]) throw Error('这个密钥已经不在了');
        saved.splice(index, 1);
        if (saved.length) this.setKey(engine, saved.join('\n')); else this.clearKey(engine);
    }
    /**
     * The user picks the key to use: it is used at once and moved to the front of the list, so it is still the one used
     * after the page is opened again. The others keep their order and still take over when it is refused.
     */
    useKey(engine, index) {
        engineCheck(engine);
        const saved = this.savedKeys(engine), key = saved[index];
        if (!Number.isInteger(index) || !key) throw Error('这个密钥已经不在了');
        if (index > 0) this.setKey(engine, [key, ...saved.filter((_, i) => i !== index)].join('\n'));
        this.providers.useKey(engine, key); this.balances.delete(engine);
        this.emit('keys', { engine, configured: true });
    }
    savedKeys(engine) { return (this.providers.keys.get(engine) || '').split('\n').filter(Boolean); }
    /** The saved keys of a voice engine as the phone shows them: last characters, in use, refused this time. Never the keys. */
    keyList(engine) { engineCheck(engine); return this.providers.keyList(engine); }
    /** The text model's keys, one per connection preset. */
    setTextKey(id, key) {
        if (!TEXT_PRESET_ID.test(String(id))) throw Error('文字模型预设无效');
        const value = [...parseTextKeys(String(key ?? '').replace(/\t/g, ' ')).values()][0];
        if (!value) throw Error('请填写密钥，或使用清除密钥');
        this.storeTextKeys(new Map(this.textKeys).set(id, value));
    }
    clearTextKey(id) { const map = new Map(this.textKeys); map.delete(id); this.storeTextKeys(map); }
    /** The last characters of a preset's key ('••••' for a key too short to show any), '' without one. */
    textKeyHint(id) { const key = this.textKeys.get(id); return key ? keyTail(key) || '••••' : ''; }
    storeTextKeys(map) { this.keyStore.save('llm', joinTextKeys(map)); this.textKeys = map; this.emit('keys', { engine: 'llm', configured: map.has(this.settings.text.active) }); }
    clearKey(engine) {
        keyCheck(engine);
        if (engine === 'llm') { this.clearTextKey(this.settings.text.active); return; }
        if (engine === 'embed') { this.keyStore.save('embed', ''); this.embedKey = ''; this.emit('keys', { engine, configured: false }); return; }
        if (engine === 'nai' || engine === 'gpt') { this.assertImageIdle(); const map = new Map(this.imageKeys[engine]); map.delete(this.settings.draw.connections[engine].active); this.storeImageKeys(engine, map); return; }
        this.keyStore.save(engine, '');
        this.providers.setKey(engine, ''); this.balances.delete(engine);
        this.emit('keys', { engine, configured: false });
    }
    /** What is left on a voice account (ElevenLabs credits, Fish API balance); null without a key. Cached for a minute. */
    async voiceBalance(engine, refresh = false) {
        keyCheck(engine);
        if (!['eleven', 'fish'].includes(engine)) throw Error('这家引擎没有提供余额查询');
        if (!this.keyStatus(engine)) return null;
        const cached = this.balances.get(engine);
        if (!refresh && cached && Date.now() - cached.checkedAt < 60 * 1000) return clone(cached.value);
        const value = await this.providers.balance(engine, this.settings.connections[engine]);
        this.balances.set(engine, { value, checkedAt: Date.now() });
        this.emit('balance', { engine, balance: clone(value) });
        return clone(value);
    }
    /** The last 4 characters of the saved key ('' without one), so the user can tell which key is in use. */
    keyHint(engine) { keyCheck(engine); if (engine === 'nai' || engine === 'gpt') return keyTail(this.imageKeys[engine].get(this.settings.draw.connections[engine].active)); if (engine === 'llm') return this.textKeyHint(this.settings.text.active); if (engine === 'embed') return this.embedKey ? keyTail(this.embedKey) || '••••' : ''; return keyTail(this.providers.currentKey(engine)); }
    /** For a voice engine with keys: how many, which one is in use (1-based) and how many were refused while this page is open. */
    keyPool(engine) { engineCheck(engine); return this.providers.keyPool(engine); }
    keyStatus(engine) { keyCheck(engine); return engine === 'nai' ? this.novelai.configured : engine === 'gpt' ? !!this.gptKey : engine === 'llm' ? this.textKeys.has(this.settings.text.active) : engine === 'embed' ? !!this.embedKey : this.providers.keys.has(engine); }

    // ---------- 钱包 and 商城 ----------
    wallet() { return clone(this.settings.chat.wallet); }
    /** Money in (+) or out (-) of the wallet, with a line in its 明细. Out with too little left: code 'BROKE'. */
    walletMove(amount, { kind = 'topup', note = '', who = '' } = {}) {
        const value = cents(amount);
        if (!Number.isFinite(value) || value === 0) throw Error('金额无效');
        const next = this.getState(), w = next.chat.wallet;
        if (value < 0 && w.balance + value < -0.001) throw Object.assign(Error(`零钱不够了：还剩 ¥${yuan(w.balance)}，要 ¥${yuan(-value)}`), { code: 'BROKE' });
        w.balance = cents(w.balance + value);
        w.ledger.unshift({ id: crypto.randomUUID(), at: Date.now(), amount: value, kind: String(kind).slice(0, 20), note: String(note).slice(0, 60), who: String(who).slice(0, 40) });
        w.ledger.length = Math.min(w.ledger.length, WALLET_LIMITS.ledger);
        this.save(next);
        this.emit('wallet', { balance: this.settings.chat.wallet.balance });
        return this.wallet();
    }
    /** Buys a decoration once; it can then be put on in 个性装扮. */
    buyDecoration(kind, key) {
        const item = premiumOf(kind, key);
        if (!item) throw Error('商城里没有这件装扮');
        if (this.settings.chat.wallet.owned.includes(decorKey(kind, key))) return this.wallet();
        this.walletMove(-item[1], { kind: 'shop', note: DECOR_KINDS[kind] + ' · ' + item[0] });
        const next = this.getState();
        next.chat.wallet.owned.push(decorKey(kind, key));
        this.save(next);
        this.emit('wallet', {});
        return this.wallet();
    }
    /** A gift of the user's own in the shop (new, or changed by id). */
    saveGift(value) {
        const next = this.getState(), list = next.chat.wallet.gifts, gift = validateGift(normalizeGift(clone(value || {})));
        if (list.some(g => g.name === gift.name && g.id !== gift.id)) throw Error('已经有叫「' + gift.name + '」的礼物了');
        const index = list.findIndex(g => g.id === gift.id);
        if (index < 0) { if (list.length >= WALLET_LIMITS.gifts) throw Error('自定义礼物最多 ' + WALLET_LIMITS.gifts + ' 件'); list.push(gift); } else list[index] = gift;
        this.save(next);
        this.emit('wallet', {});
        return clone(gift);
    }
    deleteGift(id) {
        const next = this.getState();
        next.chat.wallet.gifts = next.chat.wallet.gifts.filter(g => g.id !== id);
        this.save(next);
        this.emit('wallet', {});
        return this.wallet();
    }
    /** The user sends a red packet, a transfer or a gift: paid from the wallet first, given back if it cannot be sent. */
    async sendPaid(threadId, message) {
        const thread = await this.chats.get(threadId);
        if (!thread) throw Error('这段聊天已不存在');
        let item = clone(message || {}), cost = 0, note = '';
        if (item.kind === 'gift') {
            const gift = shopGifts(this.settings.chat.wallet).find(g => g.id === item.giftId);
            if (!gift) throw Error('商城里没有这件礼物了');
            if (thread.type !== 'dm') throw Error('礼物只能在私聊里送');
            item = { from: 'me', kind: 'gift', gift: { name: gift.name, emoji: gift.emoji, price: gift.price }, text: String(item.text || '').slice(0, 60), state: 'sent' };
            cost = gift.price; note = gift.name;
        } else if (item.kind === 'redpacket' || item.kind === 'transfer') {
            const amount = money(item.amount);
            if (!amount) throw Error('金额无效');
            item = { from: 'me', kind: item.kind, amount, text: String(item.text || '').slice(0, 40), state: 'sent' };
            cost = Number(amount); note = item.text;
        } else throw Error('这条消息不用付钱');
        const kind = item.kind, who = thread.name;
        if (cost > 0) this.walletMove(-cost, { kind, note, who });
        try { return await this.chatMutate(threadId, () => this.chats.append(threadId, [item], { read: true })); }
        catch (error) { if (cost > 0) this.walletMove(cost, { kind: 'refund', note: (note || LEDGER_KINDS[kind]) + '（没发出去）', who }); throw error; }
    }
    /**
     * The user takes or turns down what a contact sent: a red packet (opened), a transfer (accepted or returned), a
     * gift (accepted or returned). Money taken goes into the wallet, a gift into 收到的礼物; a notice is left in the chat.
     */
    async takeSent(threadId, messageId, accept = true) {
        const thread = await this.chats.get(threadId), m = thread?.messages.find(x => x.id === messageId);
        if (!m || m.from === 'me' || !['redpacket', 'transfer', 'gift'].includes(m.kind)) throw Error('这条消息已不存在');
        if (m.state !== 'sent') return thread;
        const state = m.kind === 'redpacket' ? 'opened' : accept ? 'accepted' : 'returned';
        if (m.kind === 'redpacket' && !accept) throw Error('红包不能退还');
        await this.chatMutate(threadId, () => this.chats.updateMessage(threadId, messageId, { state, openedBy: 'me' }));
        if (accept && m.kind !== 'gift') this.walletMove(Number(m.amount), { kind: m.kind, note: m.text, who: m.from });
        if (accept && m.kind === 'gift') {
            const next = this.getState(), list = next.chat.wallet.received;
            list.unshift({ id: crypto.randomUUID(), at: Date.now(), from: m.from, name: m.gift.name, emoji: m.gift.emoji, note: m.text || '' });
            list.length = Math.min(list.length, WALLET_LIMITS.received);
            this.save(next);
            this.emit('wallet', {});
        }
        const text = { opened: '领取了{对方}的红包', accepted: m.kind === 'gift' ? '收下了{对方}的礼物' : '收下了{对方}的转账', returned: m.kind === 'gift' ? '退还了{对方}的礼物' : '退还了{对方}的转账' }[state];
        return this.chatMutate(threadId, () => this.chats.append(threadId, [{ from: 'me', kind: 'notice', target: m.from, text }], { read: true }));
    }

    // ---------- 保存到酒馆 ----------
    /** The tavern's user files: {read(name, {blob}), write(name, data), remove(name)}. Without it, syncing is off. */
    setSyncFiles(files) { this.syncFiles = files; }
    #syncMemory(value) {
        const key = 'st-iphonie-sync:' + this.settings.scope;
        try {
            const storage = this.syncStorage();
            if (value === undefined) return JSON.parse(storage?.getItem(key) || 'null') || {};
            storage?.setItem(key, JSON.stringify(value));
        } catch { /* private window: this device starts from the tavern's copy again next time */ }
        return {};
    }
    #device() {
        try {
            const storage = this.syncStorage();
            let id = storage?.getItem('st-iphonie-device');
            if (!id) { id = crypto.randomUUID(); storage?.setItem('st-iphonie-device', id); }
            return id;
        } catch { return 'unknown'; }
    }
    /** Remembers deleted items (keys as in joinGone) so a sync does not bring them back from another device's copy. */
    noteGone(part, keys, after = 0) {
        const list = [...new Set((keys || []).map(String).filter(Boolean))];
        if (!list.length) return;
        const memory = this.#syncMemory(), now = Math.max(Date.now(), after + 1);
        this.#syncMemory({ ...memory, gone: joinGone([memory.gone, { [part]: Object.fromEntries(list.map(key => [key, now])) }], now) });
    }
    reviveSync(part, ids) {
        const memory = this.#syncMemory(), keys = new Set(ids), gone = {...memory.gone, [part]: {...memory.gone?.[part]}};
        for (const key of Object.keys(gone[part])) if (keys.has(key) || [...keys].some(id => key.startsWith(id + '/'))) delete gone[part][key];
        this.#syncMemory({...memory, gone});
    }
    /** Runs a deletion of a part's items and remembers which went. */
    async dropping(part, list, task) {
        const before = new Set((await list()).map(x => String(x.id))), result = await task();
        for (const x of await list()) before.delete(String(x.id));
        this.noteGone(part, [...before]);
        return result;
    }
    syncStatus() {
        const { running, ...state } = this.syncState;
        return clone({ enabled: this.settings.sync.enabled, available: !!this.syncFiles, parts: SYNC_PARTS, ...state, memoryAt: this.#syncMemory().savedAt || 0 });
    }
    saveSync(patch) {
        const next = this.getState();
        next.sync = normalizeSync({ ...next.sync, ...(patch || {}) });
        const saved = this.save(next).sync;
        if (saved.enabled) this.scheduleSync(200);
        return saved;
    }
    /** Syncs soon (changes come in bursts: a chat reply is several writes). */
    scheduleSync(delay = 4000) {
        if (!this.settings.sync.enabled || !this.syncFiles || this.closed) return;
        clearTimeout(this.syncTimer);
        this.syncState.pending = true;
        if (this.syncState.busy) return;
        this.syncTimer = setTimeout(() => { this.syncNow().catch(() => {}); }, delay);
    }
    /** Deletes the phone's copy in the tavern (this device keeps everything); the next sync starts from scratch. */
    async clearSyncFiles() {
        this.assertOpen();
        if (!this.syncFiles) throw Error('在酒馆里打开小手机时才能删除酒馆里的那份');
        if (this.syncState.running) await this.syncState.running.catch(() => {});
        clearTimeout(this.syncTimer);
        const removed = await removeSync(this.syncFiles);
        this.#syncMemory({});
        this.syncState = { ...this.syncState, pending: false, error: '', lastAt: 0, remote: null, lastResult: null };
        this.emit('sync', this.syncStatus());
        return removed;
    }
    /** One sync with the tavern: takes what changed there, writes what changed here. */
    async syncNow({ deviceName = '' } = {}) {
        this.assertOpen();
        if (!this.syncFiles) throw Error('在酒馆里打开小手机时才能保存到酒馆');
        if (this.syncState.busy) return this.syncState.running;
        clearTimeout(this.syncTimer);
        const stores = {
            read: async part => part === 'chats' ? this.chats.exportThreads() : part === 'moments' ? this.moments.exportPosts() : part === 'memories' ? this.exportChatMemories() : part === 'assistant' ? this.exportAssistantThreads() : (await this.library.exportRows([part]))[part],
            write: async (part, items, options) => {
                if (part === 'chats') await this.chats.importThreads(items, options);
                else if (part === 'moments') await this.moments.importPosts(items, options);
                else if (part === 'memories') await this.importChatMemories(items, {...options, notifySync: false});
                else if (part === 'assistant') await this.importAssistantThreads(items, {...options, notifySync: false});
                else await this.library.importRows({ [part]: items }, options);
            },
            photoBlob: row => row.blob,
        };
        this.syncState = { ...this.syncState, busy: true, pending: false, error: '' };
        this.emit('sync', this.syncStatus());
        this.syncState.running = (async () => {
            try {
                const result = await runSync({ stores, files: this.syncFiles, memory: this.#syncMemory(), readGone: () => this.#syncMemory().gone, device: this.#device(), deviceName: deviceName || this.syncDeviceName || '' });
                // Deletions made while it ran are kept too.
                this.#syncMemory({ ...result.memory, gone: joinGone([result.memory.gone, this.#syncMemory().gone]) });
                const preferences = [...result.pulled, ...result.merged].includes('photos') ? await this.getPhone() : null;
                this.syncState = { ...this.syncState, error: '', lastAt: Date.now(), remote: result.remote, lastResult: { pulled: result.pulled, pushed: result.pushed, merged: result.merged } };
                // Only these refresh notifications came from syncing. User writes during network waits stay dirty.
                this.syncApplying = true;
                for (const part of [...result.pulled, ...result.merged]) {
                    if (part === 'chats') this.emit('chat', { threadId: '' });
                    else if (part === 'moments') this.emit('moments', {});
                    else if (part === 'memories') this.emit('memory', {threadId: '', reset: true});
                    else if (part === 'assistant') this.emit('assistant', {threadId: '', restored: true});
                    else this.emit('library', { collection: part });
                }
                if (preferences) this.emit('phone', { preferences });
                return clone(result);
            } catch (error) {
                this.syncState = { ...this.syncState, busy: false, error: error.message || '同步失败' };
                throw error;
            } finally {
                this.syncApplying = false;
                this.syncState.busy = false;
                delete this.syncState.running;
                if (this.syncState.pending) this.scheduleSync(200);
                this.emit('sync', this.syncStatus());
            }
        })();
        return this.syncState.running;
    }

    // ---------- 文字模型 ----------
    /** Text model options: {source:'tavern'|'custom', url, model, temperature, maxTokens}. */
    /** The text settings with a change applied: presets, active and source as given; url, model, temperature, maxTokens and name edit the preset in use. */
    textWith(patch) {
        const p = patch && typeof patch === 'object' ? patch : {};
        const text = normalizeText({ ...this.settings.text, ...Object.fromEntries(['source', 'active', 'presets'].filter(key => key in p).map(key => [key, clone(p[key])])) });
        const active = text.presets.find(x => x.id === text.active);
        for (const key of ['name', 'url', 'model', 'temperature', 'maxTokens', 'thinking']) if (key in p) active[key] = p[key];
        return normalizeText(text);
    }
    saveText(patch) {
        const next = this.getState();
        next.text = this.textWith(patch);
        // A deleted preset takes its key with it.
        const ids = new Set(next.text.presets.map(x => x.id)), kept = new Map([...this.textKeys].filter(([id]) => ids.has(id)));
        const saved = this.save(next).text;
        if (kept.size !== this.textKeys.size) this.storeTextKeys(kept);
        return saved;
    }
    /**
     * Writes phone text (chat, 朋友圈, calls, picture plans) with the chosen model. context: the tavern context, used
     * when the source is the tavern's model. request: {prompt, responseLength?, ...} as for generateRaw.
     */
    async generateText(context, request) {
        return this.requestLog.run('文字模型', {source: this.settings.text.source, model: activeText(this.settings.text).model, ...request}, () => this.generateTextRaw(context, request));
    }
    async generateTextRaw(context, request) {
        const text = activeText(this.settings.text);
        if (text.source === 'custom') return customRequest({ text, key: this.textKeys.get(text.id) || '', prompt: request.prompt, responseLength: request.responseLength, fetch: this.textFetch });
        if (!context?.generateRaw) throw Error('当前酒馆版本不支持后台生成');
        // The chat-completion request the tavern builds is kept, so an empty answer can be asked again as a stream:
        // "假流式" channels only answer streamed requests, and the tavern's background generation never streams.
        // A length the task asks for replaces the tavern's own for that request: the tavern's, when longer, is kept.
        const own = context?.mainApi === 'openai' ? context.chatCompletionSettings?.openai_max_tokens : 0;
        const outgoing=tavernTextRequest(request.responseLength ? {...request, responseLength: answerRoom(request.responseLength, own)} : request);
        const source = context.eventSource, event = context.eventTypes?.CHAT_COMPLETION_SETTINGS_READY, last = JSON.stringify(asMessages(outgoing.prompt).at(-1)?.content ?? '');
        let payload = null;
        const keep = data => { if (!payload && data?.type === 'quiet' && JSON.stringify(data.messages?.at?.(-1)?.content ?? '') === last) { payload = clone(data); const id = this.requestLog.add('酒馆最终请求', data); this.requestLog.finish(id, {state: '已交给酒馆发送'}); } };
        if (source?.on && event) source.on(event, keep);
        let empty = false;
        try {
            const text = await context.generateRaw(outgoing);
            if (String(text ?? '').trim() || !payload) return text;
            empty = true;
        } catch (error) {
            if (!payload || !/no message generated|empty/i.test(String(error?.message || ''))) throw error;
            empty = true;
        } finally { source?.removeListener?.(event, keep); }
        if (empty) { const id = this.requestLog.add('文字模型重试', {reason: '普通请求为空，改用流式'}, 'warn'); this.requestLog.finish(id, {retry: true}); return this.streamTavern(context, payload); }
    }
    /** Sends the tavern's chat-completion request again with streaming on, and reads the whole answer. */
    async streamTavern(context, payload) {
        if (typeof context.getRequestHeaders !== 'function') throw Error('模型没有返回内容');
        let response;
        try { response = await this.textFetch('/api/backends/chat-completions/generate', { method: 'POST', headers: context.getRequestHeaders(), cache: 'no-cache', body: JSON.stringify({ ...payload, stream: true }) }); }
        catch { throw Error('模型没有返回内容，改用流式请求也没连上'); }
        if (!response.ok) throw Error(`模型没有返回内容，改用流式请求也失败了（HTTP ${response.status}）`);
        const text = await streamText(response);
        if (!text.trim()) throw Error('模型没有返回内容（普通请求和流式请求都试过了）');
        return text;
    }
    // ---------- 向量模型 and 记忆 ----------
    saveEmbed(patch) { const next = this.getState(); next.embed = normalizeEmbed({ ...this.settings.embed, ...(patch && typeof patch === 'object' ? patch : {}) }); return this.save(next).embed; }
    embedReady() { return embedReady(this.settings.embed); }
    /** Vectors for texts with the 向量模型 (draft: options not saved yet, for 测试连接). */
    embed(texts, draft = null) { const embed = draft ? normalizeEmbed({ ...this.settings.embed, ...draft, enabled: true }) : this.settings.embed; return embedTexts({ embed, key: this.embedKey, texts, fetch: this.embedFetch }); }
    async embedModels(draft) {
        const url = normalizeEmbed({ ...this.settings.embed, ...(draft || {}) }).url;
        try { return await listModels({ text: { url }, key: this.embedKey }); } catch (error) { throw Error(error.message.replace(/^文字模型/, '向量模型')); }
    }
    /** A chat's memory book (an empty one when nothing is written yet). */
    async exportChatMemories() { return normalizeMemoryBooks(await this.memoryStore.list('memory')); }
    async exportAssistantThreads() { return assistantTransferRows(await this.apps.list()); }
    async importChatMemories(rows, {replace = false, merge, restoring = false, notifySync = true} = {}) {
        const incoming = normalizeMemoryBooks(rows), changed = new Set();
        await this.memoryStore.transformKinds(['memory', 'vectors'], docs => {
            const current = normalizeMemoryBooks(docs.filter(row => row.kind === 'memory'));
            const selected = normalizeMemoryBooks(merge ? merge(current) : incoming);
            const next = new Map((replace ? [] : current).map(row => [row.id, row]));
            for (const row of selected) {
                const old = current.find(item => item.id === row.id);
                next.set(row.id, restoring ? {...row, at: Math.max(Date.now(), (old?.at || 0) + 1)} : row);
            }
            // A replaced/forgotten book stays as an empty record so old devices cannot revive its summaries.
            if (replace && restoring) for (const old of current) if (!next.has(old.id)) next.set(old.id, {...emptyBook(old.threadId, old.name), at: Math.max(Date.now(), old.at + 1)});
            for (const old of current) if (JSON.stringify(old) !== JSON.stringify(next.get(old.id))) changed.add(old.threadId);
            for (const row of next.values()) if (!current.some(old => old.id === row.id)) changed.add(row.threadId);
            return [...next.values(), ...docs.filter(row => row.kind === 'vectors' && !changed.has(row.threadId))];
        });
        if (restoring) this.reviveSync('memories', incoming.map(row => row.id));
        for (const threadId of changed) this.emit('memory', {threadId, reset: true, persisted: notifySync});
        return incoming.length;
    }
    async importAssistantThreads(rows, {replace = false, merge, restoring = false, notifySync = true} = {}) {
        const incoming = normalizeAssistantThreads(rows), changed = new Set(), removed = new Set();
        const restoringIds = new Set(restoring ? incoming.map(row => row.id) : []);
        const gone = this.#syncMemory().gone?.assistant || {};
        let removedAfter = 0;
        await this.apps.transformKinds(['assistant', 'memory', 'vectors'], docs => {
            const current = assistantTransferRows(docs), byId = new Map(docs.map(row => [row.id, row]));
            const selected = normalizeAssistantThreads(merge ? merge(current) : incoming);
            const next = new Map((replace ? [] : current).map(row => [row.id, row]));
            for (const row of selected) next.set(row.id, row);
            const result = docs.filter(row => row.kind !== 'assistant' && !String(row.threadId || '').startsWith('assistant:'));
            for (const row of current) if (!next.has(row.id)) { changed.add(row.id); removed.add(row.id); removedAfter = Math.max(removedAfter, row.restoredAt || 0, row.updatedAt || 0); }
            for (const row of next.values()) {
                const old = byId.get(row.id), exported = current.find(item => item.id === row.id);
                if (!restoringIds.has(row.id) && JSON.stringify(row) === JSON.stringify(exported)) {
                    result.push(old, ...[bookId(row.id), 'vec:' + row.id].map(id => byId.get(id)).filter(Boolean));
                    continue;
                }
                changed.add(row.id);
                const {memory, ...thread} = row;
                thread.revision = Math.max(Date.now(), (old?.revision || 0) + 1);
                thread.memoryRevision = Math.max(Date.now(), (old?.memoryRevision || 0) + 1);
                if (restoringIds.has(row.id)) thread.at = thread.updatedAt = thread.restoredAt = Math.max(Date.now() + 1, (old?.updatedAt || 0) + 1, (gone[row.id] || 0) + 1, (row.restoredAt || 0) + 1);
                result.push(thread);
                if (memory) result.push({...memory, memoryRevision: thread.memoryRevision});
            }
            return result;
        });
        if (restoring) { this.noteGone('assistant', [...removed], removedAfter); this.reviveSync('assistant', incoming.map(row => row.id)); }
        for (const threadId of changed) this.emit('assistant', {threadId, restored: true, memoryReset: true, deleted: removed.has(threadId), persisted: notifySync});
        return incoming.length;
    }
    async memoryBook(threadId) { return (await this.memoryStore.get(bookId(threadId))) || {...emptyBook(threadId), at: 0}; }
    /** Changes a chat's book in one transaction: change(book) returns the new book. Made first when missing. */
    async memoryChange(threadId, change, name = '', expectedBook) {
        this.assertOpen();
        const id = bookId(threadId);
        let saved;
        await this.memoryStore.transformKinds(['memory'], docs => {
            const current = docs.find(row => row.id === id) || {...emptyBook(threadId), at: 0};
            if (expectedBook && JSON.stringify(cleanBook(current, current.at)) !== JSON.stringify(cleanBook(expectedBook, expectedBook.at))) throw Error('聊天记忆已变化，这次整理没有写入');
            if (!current.name) current.name = name;
            saved = cleanBook({...change(clone(current)), threadId}, Math.max(Date.now(), current.at + 1));
            return [...docs.filter(row => row.id !== id), saved];
        });
        this.emit('memory', { threadId, persisted: true });
        return saved;
    }
    /**
     * Deleted messages leave the chat's memory too: with nothing said left in the chat, the memory goes as when the chat
     * is deleted; otherwise the summaries that held them are written again (core/memory.js pruneBook). Before this, a
     * chat emptied message by message kept its summaries, and with 一直带着 on the story still knew it all.
     */
    async memoryAfterDelete(threadId, before, after) {
        const kept = new Set((after?.messages || []).map(m => m.id)), gone = (before?.messages || []).filter(m => !kept.has(m.id) && m.kind !== 'system');
        if (!gone.length) return;
        if (!(after?.messages || []).some(m => m.kind !== 'system')) return this.memoryForget(threadId);
        const book = await this.memoryBook(threadId), next = pruneBook(book, gone.map(m => m.at), after.messages);
        if (next !== book) await this.memoryChange(threadId, () => next);
    }
    memoryVectors(threadId) { return this.memoryStore.get('vec:' + threadId); }
    memorySaveVectors(threadId, doc) { return this.memoryStore.put([{ ...doc, id: 'vec:' + threadId, kind: 'vectors', threadId, at: Date.now() }]); }
    async memoryForget(threadId) {
        await this.memoryStore.transformKinds(['memory', 'vectors'], docs => {
            const old = docs.find(row => row.id === bookId(threadId));
            return [...docs.filter(row => row.id !== bookId(threadId) && row.id !== 'vec:' + threadId), {...emptyBook(threadId), at: Math.max(Date.now(), (old?.at || 0) + 1)}];
        });
        this.emit('memory', { threadId, reset: true, persisted: true });
    }
    /** Model ids of the custom API (also a free connection check). `draft`: options not saved yet. */
    textModels(draft) { const text = activeText(this.textWith(draft)); return listModels({ text, key: this.textKeys.get(text.id) || '' }); }

    // ---------- Drawing ----------
    assertImageIdle() { this.assertOpen(); if (this.drawQueue.pending) throw Error('还有图片正在生成或排队，请等完成或取消队列后再换生图引擎或账号连接'); }
    activateImageKeys() {
        this.novelai.setKey(this.imageKeys.nai.get(this.settings.draw.connections.nai.active) || '');
        this.novelai.relay = this.settings.draw.relay.url;
        this.gptKey = this.imageKeys.gpt.get(this.settings.draw.connections.gpt.active) || '';
        this.subscription = null;
        this.imageConnectionRevision++;
    }
    storeImageKeys(engine, map) {
        this.keyStore.save(engine, joinTextKeys(map));
        this.imageKeys[engine] = map;
        this.activateImageKeys();
        this.emit('keys', {engine, configured: this.keyStatus(engine)});
    }
    commitImageConnection(next, engine, map) {
        // Validate before either store is touched. A synchronous key-storage failure must not leave a new
        // address paired with the previous secret; a host persistence failure restores the previous keys.
        validateSettings(normalizeSettings(next));
        const before = this.imageKeys[engine];
        this.keyStore.save(engine, joinTextKeys(map));
        this.imageKeys[engine] = map;
        try { this.save(next); }
        catch (error) { this.imageKeys[engine] = before; this.keyStore.save(engine, joinTextKeys(before)); throw error; }
        this.activateImageKeys();
        this.emit('keys', {engine, configured: this.keyStatus(engine)});
    }
    imageConnectionList(engine) {
        if (!['nai', 'gpt'].includes(engine)) throw Error('生图引擎无效');
        const group = this.settings.draw.connections[engine];
        return group.presets.map(p => ({...clone(p), current: p.id === group.active, configured: this.imageKeys[engine].has(p.id), tail: keyTail(this.imageKeys[engine].get(p.id))}));
    }
    /** Missing id creates and selects an empty connection; a blank key keeps its saved key. */
    saveImageConnection(engine, patch = {}) {
        this.imageConnectionList(engine); this.assertImageIdle();
        const next = this.getState(), group = next.draw.connections[engine];
        const id = patch.id || crypto.randomUUID(), old = group.presets.find(p => p.id === id);
        if (patch.id && !old) throw Error('这组生图连接已经不在了');
        const name = String(patch.name ?? old?.name ?? `连接 ${group.presets.length + 1}`).trim();
        if (!name || name.length > 60) throw Error('请填写连接名称（最多 60 字）');
        const url = (engine === 'nai' ? relayUrl : gptBase)(patch.url ?? old?.url ?? '');
        const item = {id, name, url};
        if (engine === 'nai') item.assumeOpus = patch.assumeOpus ?? old?.assumeOpus ?? false;
        else { item.model = String(patch.model ?? old?.model ?? 'gpt-image-1').trim(); if (!/^[\w.:/-]{1,80}$/.test(item.model)) throw Error('模型名称无效'); }
        const typed = String(patch.key ?? '').trim();
        // The public editing API accepts one key, never the internal backup representation.
        if (typed.includes('\t') || typed.includes('\n')) throw Error('每组连接请填写一个密钥');
        const key = typed ? validateKey(engine, typed) : '';
        if (old) group.presets[group.presets.indexOf(old)] = item; else group.presets.push(item);
        group.active = id; applyImageConnection(next.draw, engine);
        const map = new Map(this.imageKeys[engine]);
        if (key) map.set(id, key);
        this.commitImageConnection(next, engine, map);
        return this.imageConnectionList(engine).find(p => p.id === id);
    }
    selectImageConnection(engine, id) {
        if (!this.imageConnectionList(engine).some(p => p.id === id)) throw Error('这组生图连接已经不在了');
        const next = this.getState(); next.draw.connections[engine].active = id;
        applyImageConnection(next.draw, engine); this.save(next);
    }
    deleteImageConnection(engine, id) {
        const list = this.imageConnectionList(engine);
        if (!list.some(p => p.id === id)) throw Error('这组生图连接已经不在了');
        if (list.length < 2) throw Error('请至少保留一组生图连接');
        this.assertImageIdle();
        const next = this.getState(), group = next.draw.connections[engine];
        group.presets = group.presets.filter(p => p.id !== id);
        if (group.active === id) group.active = group.presets[0].id;
        applyImageConnection(next.draw, engine);
        const map = new Map(this.imageKeys[engine]); map.delete(id); this.commitImageConnection(next, engine, map);
    }
    // ComfyUI, 绘图 settings, 画风, 绘图预设, the prompt preview and the NovelAI subscription: core/backend-draw.js.
    // ---------- Vibes ----------
    async loadVibes() { const rows = await this.library.listVibes(); this.vibes = new Map(rows.map(row => [row.id, { ...row.meta, id: row.id, name: row.name }])); }
    listVibes() { return [...this.vibes.values()].map(clone); }
    async vibeDoc(id) {
        const row = await this.library.getVibe(id);
        if (!row) throw Error('这个 Vibe 已经不在了');
        try { return JSON.parse(await row.blob.text()); } catch { throw Error('这个 Vibe 的数据坏了，请删掉重新导入'); }
    }
    /** Swappable in tests (no canvas there). */
    shrinkVibeImage(base64) { return smallVibeImage(base64); }
    async storeVibe(doc) {
        if (!doc.thumbnail && doc.image) { const thumb = await vibeThumbnail(doc.image); if (thumb) doc = { ...doc, thumbnail: thumb }; }
        // The picture is kept small; the vibe keeps its id (taken from the picture it was made from), so groups and
        // a later import of the same picture still find it.
        if (doc.image) { const small = await this.shrinkVibeImage(doc.image); if (small !== doc.image) doc = { ...doc, image: small }; }
        const summary = vibeSummary(doc);
        await this.library.saveVibe({ id: doc.id, name: doc.name, meta: summary, blob: new Blob([JSON.stringify(doc)], { type: 'application/json' }) });
        this.vibes.set(doc.id, summary);
        return summary;
    }
    /**
     * Imports vibe files (.naiv4vibe, .naiv4vibebundle, 智绘姬 exports) and pictures. A vibe already saved gains what it
     * lacked (encodings, image); groups in the files become groups here. names: a vibe already saved also takes the name
     * 智绘姬 gives it (importing from 智绘姬 again). {added, updated, renamed, groups, errors: [{name, message}]}.
     */
    async importVibes(files, { names = false } = {}) {
        this.assertOpen();
        const result = { added: 0, updated: 0, renamed: 0, groups: 0, errors: [] }, groups = [];
        for (const file of [...(files || [])]) {
            const name = String(file?.name || 'vibe');
            try {
                const picture = /^image\//.test(file.type || '') && !/\.naiv4vibe/i.test(name) || /\.(png|jpe?g|webp|avif|gif)$/i.test(name) && !/\.naiv4vibe/i.test(name);
                const found = picture ? { vibes: [await imageVibe(name, await this.base64(file))], groups: [] } : await readVibeFile(name, await file.text());
                for (const doc of found.vibes) {
                    if (this.vibes.has(doc.id)) {
                        const merged = mergeVibe(await this.vibeDoc(doc.id), doc);
                        if (names && found.named?.includes(doc.id) && merged.name !== doc.name) { merged.name = doc.name; result.renamed++; }
                        await this.storeVibe(merged); result.updated++;
                    }
                    else { await this.storeVibe(doc); result.added++; }
                }
                groups.push(...found.groups);
            } catch (error) { result.errors.push({ name, message: error.message }); }
        }
        if (groups.length) {
            const next = this.getState(), taken = new Set(next.draw.vibe.groups.map(g => g.name));
            for (const group of groups) {
                const same = next.draw.vibe.groups.some(g => g.name === group.name && JSON.stringify(g.items.map(i => [i.vibe, i.strength])) === JSON.stringify(group.items.map(i => [i.id, i.strength])));
                if (same) continue;
                // A group of that name left empty (its vibes were deleted, to import them again): fill it rather than make a copy.
                const empty = next.draw.vibe.groups.find(g => g.name === group.name && !g.items.length);
                if (empty) { empty.items = group.items.map(i => ({ vibe: i.id, strength: i.strength })); result.groups++; continue; }
                let name = group.name, n = 1;
                while (taken.has(name)) name = `${group.name} (${++n})`;
                taken.add(name);
                next.draw.vibe.groups.push({ id: crypto.randomUUID(), name, items: group.items.map(i => ({ vibe: i.id, strength: i.strength })) });
                result.groups++;
            }
            next.draw.vibe = normalizeVibeSettings(next.draw.vibe);
            this.save(next);
        }
        this.emit('draw', { vibes: true });
        return result;
    }
    /** Makes the pictures of the vibes saved before small (see smallVibeImage): {count, before, after} in bytes. */
    async compactVibes() {
        this.assertOpen();
        const rows = await this.library.listVibes();
        let count = 0;
        for (const row of rows) {
            const doc = await this.vibeDoc(row.id);
            if (!doc.image) continue;
            const small = await this.shrinkVibeImage(doc.image);
            if (small === doc.image) continue;
            await this.storeVibe({ ...doc, image: small });
            count++;
        }
        const total = list => list.reduce((n, row) => n + (row.size || 0), 0);
        this.emit('draw', { vibes: true });
        return { count, before: total(rows), after: total(await this.library.listVibes()) };
    }
    /** Renames a vibe or sets its own strength (used when it is used alone, and as the default when added to a group). */
    async updateVibe(id, patch = {}) {
        const doc = await this.vibeDoc(id);
        if ('name' in patch) { const name = String(patch.name || '').trim().slice(0, 80); if (!name) throw Error('请填写 Vibe 名字'); doc.name = name; }
        if ('strength' in patch) doc.importInfo.strength = vibeStrength(patch.strength, doc.importInfo.strength);
        const summary = await this.storeVibe(doc);
        this.emit('draw', { vibes: true });
        return clone(summary);
    }
    /** Deletes a vibe, and takes it out of every group (and out of use). */
    async deleteVibe(id) { await this.deleteVibes([id]); }
    /** Deletes several vibes at once (one save, one redraw). Returns how many were deleted. */
    async deleteVibes(ids) {
        this.assertOpen();
        const gone = new Set([...(ids || [])].map(String).filter(id => this.vibes.has(id)));
        for (const id of gone) { await this.library.deleteVibe(id); this.vibes.delete(id); }
        const next = this.getState(), v = next.draw.vibe;
        for (const group of v.groups) group.items = group.items.filter(item => !gone.has(item.vibe));
        if (v.use.kind === 'vibe' && gone.has(v.use.id)) v.use = { kind: '', id: '' };
        this.save(next);
        this.emit('draw', { vibes: true });
        return gone.size;
    }
    /** A file to save: {vibe: id} → .naiv4vibe; {group: id} → .naiv4vibebundle; {all: true} → everything, in the 智绘姬 form. */
    async exportVibes(target = {}) {
        const safe = name => String(name).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'vibe';
        if (target.vibe) { const doc = await this.vibeDoc(target.vibe); // Not marked as JSON: saving would add .json after .naiv4vibe.
            return { name: safe(doc.name) + '.naiv4vibe', blob: new Blob([singleFile(doc)], { type: 'application/octet-stream' }) }; }
        if (target.group) {
            const group = this.settings.draw.vibe.groups.find(g => g.id === target.group);
            if (!group) throw Error('这个 Vibe 组已经不在了');
            const entries = [];
            for (const item of group.items) if (this.vibes.has(item.vibe)) entries.push({ doc: await this.vibeDoc(item.vibe), strength: item.strength });
            if (!entries.length) throw Error('这个组里没有 Vibe');
            return { name: safe(group.name) + '.naiv4vibebundle', blob: new Blob([bundleFile(entries)], { type: 'application/octet-stream' }) };
        }
        const docs = new Map();
        for (const id of this.vibes.keys()) docs.set(id, await this.vibeDoc(id));
        if (!docs.size) throw Error('还没有 Vibe');
        const groups = this.settings.draw.vibe.groups.map(g => ({ name: g.name, items: g.items.map(i => ({ id: i.vibe, strength: i.strength })) }));
        return { name: `vibes-${new Date().toISOString().slice(0, 10)}.json`, blob: new Blob([chatu8File(groups, docs)], { type: 'application/json' }) };
    }
    /**
     * The vibes a picture with this model would use (see VibePlan in ui/backend-client.d.ts). The free-tier guard keeps
     * the first four; a vibe without an encoding for the model is encoded first (2 Anlas), or left out without a picture.
     */
    vibePlan(model) {
        const v = this.settings.draw.vibe, empty = { on: false, model: !!vibeKey(model), used: [], skipped: [], over: 0, encode: 0, extra: 0 };
        if (!v.enabled || !v.use.kind) return empty;
        const items = v.use.kind === 'group' ? (v.groups.find(g => g.id === v.use.id)?.items || []).map(i => ({ id: i.vibe, strength: i.strength }))
            : [{ id: v.use.id, strength: this.vibes.get(v.use.id)?.strength ?? 0.6 }];
        const key = vibeKey(model), used = [], skipped = [];
        for (const item of items) {
            const s = this.vibes.get(item.id);
            if (!s) { skipped.push({ name: '已删除的 Vibe', why: 'missing' }); continue; }
            if (!key) { skipped.push({ name: s.name, why: 'model' }); continue; }
            const encoded = s.keys.includes(key);
            if (!encoded && !s.image) { skipped.push({ name: s.name, why: 'no-encoding' }); continue; }
            used.push({ id: item.id, name: s.name, strength: item.strength, encode: !encoded });
        }
        const over = this.settings.draw.guard ? Math.max(0, used.length - MAX_FREE_VIBES) : 0;
        if (over) used.length = MAX_FREE_VIBES;
        return { on: true, model: !!key, used, skipped, over, encode: used.filter(u => u.encode).length, extra: Math.max(0, used.length - MAX_FREE_VIBES) };
    }
    /** The encodings to send, encoding (and keeping) those missing for the model first. */
    async vibeEncodings(used, model, signal) {
        const key = vibeKey(model), list = [];
        for (const u of used) {
            let doc = await this.vibeDoc(u.id), encoding = encodingFor(doc, key);
            if (!encoding) {
                this.novelai.relay = this.settings.draw.relay.url;
                encoding = await this.novelai.encodeVibe(doc.image, model, doc.importInfo.information_extracted, signal);
                doc = await withEncoding(doc, key, doc.importInfo.information_extracted, encoding);
                await this.storeVibe(doc);
                if (this.subscription) this.subscription.checkedAt = 0;
                this.emit('draw', { vibes: true });
            }
            list.push({ encoding, strength: u.strength });
        }
        return list;
    }
    /** GPT and ComfyUI: GPT costs money on every picture (asked first unless 每张先问 is off); ComfyUI is the user's own. */
    engineQuote(engine, params) {
        const draw = this.settings.draw, orientation = orientationOf(Number(params?.width), Number(params?.height));
        const none = { on: false, model: false, used: [], skipped: [], over: 0, encode: 0, extra: 0 };
        if (engine === 'gpt') {
            const size = gptSize(draw.gpt.model, orientation || draw.gpt.orientation), [width, height] = size.split('x').map(Number);
            return { engine, params: { model: draw.gpt.model, width, height, seed: -1 }, clamped: false, free: draw.gpt.ask ? false : true, paid: true, guard: false, v5: false, usage: null, vibes: none, vibeAnlas: 0 };
        }
        const c = draw.comfy, size = comfySize(c, orientation || orientationOf(c.width, c.height));
        return { engine, params: { model: c.model, ...size, steps: c.steps, scale: c.scale, sampler: c.sampler, seed: Number.isInteger(params?.seed) && params.seed >= 0 ? params.seed : -1 }, clamped: false, free: true, guard: false, v5: false, usage: null, vibes: none, vibeAnlas: 0 };
    }
    /** Whether pictures can be drawn with the engine in use; drawMissing() says what is missing. */
    drawReady() { const engine = this.settings.draw.engine; return engine === 'nai' ? this.novelai.configured : engine === 'gpt' ? !!this.gptKey : !!this.settings.draw.comfy.url; }
    /** What to ask before a picture that costs money, for the engine in use: {title, text, note}. */
    paidPrompt() { return this.settings.draw.engine === 'gpt' ? { title: 'GPT 生图要花钱', text: '每张图都按 OpenAI（或中转）的价格收费，确认后再画。', note: 'GPT 生图要花钱，点一下确认后再画' } : { title: '这张图会扣 Anlas', text: '超出了 NovelAI 的免费档，确认后再画。', note: '这张图会扣 Anlas，点一下确认后再画' }; }
    drawMissing() { const engine = this.settings.draw.engine; return this.drawReady() ? '' : engine === 'gpt' ? '还没有填写 GPT 生图的密钥' : engine === 'comfy' ? '还没有填写 ComfyUI 地址' : '还没有填写 NovelAI 密钥'; }
    /** The GPT drawing models the saved relay (or OpenAI) offers. */
    async gptModels() { this.assertOpen(); return gptModels({ fetch: this.imageFetch, settings: this.settings.draw.gpt, key: this.gptKey }); }
    /** ComfyUI: connection check and what it offers (models, samplers, schedulers). url: an address not saved yet. */
    async comfyCatalog(url) { this.assertOpen(); return comfyCatalog({ fetch: this.imageFetch, headers: this.tavernHeaders(), url: comfyUrl(url ?? this.settings.draw.comfy.url) }); }
    async comfyClips({transport, signal} = {}) { this.assertOpen(); const c = this.settings.draw.comfy; return comfyClips({fetch: this.imageFetch, url: c.url, transport: transport ?? c.loraTransport, signal}); }
    async comfyLoras({transport, signal} = {}) { this.assertOpen(); const c = this.settings.draw.comfy; return comfyLoras({fetch: this.imageFetch, url: c.url, transport: transport ?? c.loraTransport, signal}); }
    async comfyWorkflows() { this.assertOpen(); return tavernWorkflows({ fetch: this.imageFetch, headers: this.tavernHeaders() }); }
    async comfyWorkflow(name) { this.assertOpen(); return tavernWorkflow({ fetch: this.imageFetch, headers: this.tavernHeaders(), name: String(name || '') }); }
    /** Draws with GPT or ComfyUI. Inputs are the NovelAI-shaped picture (scene prompt, one caption per person). */
    async drawWithEngine(engine, { prompt, negative, characters, quote, signal, comfy }) {
        const draw = this.settings.draw, p = quote.params;
        if (engine === 'gpt') {
            const text = gptPrompt({ prompt, characters });
            const blob = await gptGenerate({ fetch: this.imageFetch, settings: draw.gpt, key: this.gptKey, prompt: text, size: `${p.width}x${p.height}`, signal });
            return { blob, seed: -1, params: { model: draw.gpt.model, width: p.width, height: p.height }, prompt: text };
        }
        const c = comfy || draw.comfy, seed = p.seed >= 0 ? p.seed : Math.floor(Math.random() * 4294967295);
        const text = comfyPrompt({ prompt, negative, characters });
        const workflow = fillWorkflow(activeLoraWorkflow(c.workflow || defaultWorkflow(c), c.disabledLoras), comfyValues(c, { prompt: text.prompt, negative: text.negative, width: p.width, height: p.height, seed }));
        const blob = await comfyGenerate({ fetch: this.imageFetch, headers: this.tavernHeaders(), url: c.url, workflow, signal });
        return { blob, seed, params: { model: c.model || '工作流', width: p.width, height: p.height, steps: c.steps, scale: c.scale, sampler: c.sampler }, prompt: text.prompt };
    }
    /** How a picture was drawn, as the viewer's 参数 rows (kept with the album photo). */
    pictureInfo(engine, { params = {}, seed, prompt }, { negative = '', characters = [] } = {}) {
        return [
            ['引擎', DRAW_ENGINE_NAMES[engine] || engine], ['模型', NAI_MODEL_NAMES[params.model] || params.model],
            ['尺寸', params.width && params.height ? `${params.width} × ${params.height}` : ''], ['步数', params.steps], ['CFG', params.scale], ['采样器', params.sampler],
            ['种子', seed >= 0 ? seed : ''], ['画于', new Date().toLocaleString('zh-CN', { hour12: false })],
            ['提示词', prompt], ['负面', negative], ['角色', (characters || []).map(c => c?.prompt).filter(Boolean).join(' | ')]
        ].filter(([, v]) => v !== undefined && v !== null && String(v).trim());
    }
    /** Generates one image and keeps it in the album. Requests wait in the NovelAI queue (see draw-queue.js).
     *  key identifies the job in the queue (the same key joins the job already waiting); label is shown in the line. */
    generateImage({ prompt, negative = '', characters = [], params, allowPaid = false, name = '', key, label = '', base = null, refs = [] } = {}) {
        this.assertOpen();
        if (!String(prompt || '').trim()) return Promise.reject(Error('请先写提示词'));
        const engine = this.settings.draw.engine;
        if (!this.drawReady()) return Promise.reject(Error(this.drawMissing()));
        // 底图 (图生图 / 局部重绘) and 角色参考 are NovelAI's: the drawing app sends them only when NovelAI draws.
        const extra = engine === 'nai' ? { base: !!base?.image, refs: (refs || []).filter(r => r?.image).length } : {};
        const quote = this.drawQuote(params, extra);
        if (engine !== 'nai') {
            if (quote.free === false && !allowPaid) return Promise.reject(Object.assign(Error('GPT 生图每张都要花钱，需要确认后再生成'), { code: 'PAID' }));
            // A queued ComfyUI picture keeps the scheme it was asked with, whatever is changed while it waits.
            const c = this.settings.draw.comfy;
            const comfy = engine === 'comfy' ? clone(Object.fromEntries(['url', 'workflow', 'disabledLoras', ...COMFY_PARAM_KEYS].map(k => [k, c[k]]))) : undefined;
            const picture = {prompt, negative, characters: clone(characters), quote, comfy};
            const job = this.drawQueue.add({ key, label: label || String(prompt).slice(0, 40), task: async signal => {
                this.assertOpen();
                this.emit('draw', { phase: 'generating' });
                const made = await this.drawWithEngine(engine, { ...picture, signal });
                this.assertOpen();
                const ext = made.blob.type === 'image/jpeg' ? 'jpg' : made.blob.type === 'image/webp' ? 'webp' : 'png';
                const info = this.pictureInfo(engine, made, picture);
                const photo = await this.library.addPhoto({ name: (name || DRAW_ENGINE_NAMES[engine]) + '-' + (made.seed >= 0 ? made.seed : Date.now()) + '.' + ext, blob: made.blob, info });
                this.emit('library', { collection: 'photos' });
                this.emit('draw', { phase: 'done' });
                return { photoId: photo.id, seed: made.seed, params: made.params, prompt: made.prompt, engine, blob: made.blob, info };
            } });
            job.catch(error => { this.emit('draw', { phase: error.cancelled ? 'cancelled' : 'error', message: error.message }); });
            return job;
        }
        if (quote.free === false && !allowPaid) return Promise.reject(Object.assign(Error('这张图会扣 Anlas，需要确认后再生成'), { code: 'PAID' }));
        const request = buildImageRequest({ prompt, negative, characters, params: quote.params, base: extra.base ? clone(base) : null, refs: extra.refs ? clone(refs) : [] });
        const job = this.drawQueue.add({ key, label: label || String(prompt).slice(0, 40), task: async signal => {
            this.assertOpen();
            this.emit('draw', { phase: 'generating' });
            if (quote.vibes.used.length && !request.refs) Object.assign(request.body.parameters, vibeParameters(await this.vibeEncodings(quote.vibes.used, request.params.model, signal)));
            this.novelai.relay = this.settings.draw.relay.url;
            let blob;
            try { blob = await this.novelai.generate(request.body, signal); }
            catch (error) {
                // 透明背景's flags are not in NovelAI's public documents: refused, the picture is asked for once more without them.
                const p = request.body.parameters;
                if (!p.straight_alpha || ![400, 422, 500].includes(error?.status)) throw error;
                delete p.straight_alpha; delete p.tag_hint_transparent_background;
                blob = await this.novelai.generate(request.body, signal);
            }
            this.assertOpen();
            const info = this.pictureInfo('nai', { params: request.params, seed: request.seed, prompt: request.body.input }, { negative, characters });
            if (request.body.action !== 'generate') info.push(['方式', request.body.action === 'infill' ? `局部重绘 · 强度 ${request.body.parameters.strength}` : `图生图 · 强度 ${request.body.parameters.strength} · 噪声 ${request.body.parameters.noise}`]);
            if (request.refs) info.push(['角色参考', `${request.refs} 张`]);
            const photo = await this.library.addPhoto({ name: (name || 'NovelAI') + '-' + request.seed + '.png', blob, info });
            this.emit('library', { collection: 'photos' });
            this.emit('draw', { phase: 'done' });
            // Paid images change the Anlas balance and V5 images use up the allowance: read the subscription again next time.
            if (this.subscription && (quote.free === false || isV5(request.params.model))) this.subscription.checkedAt = 0;
            return { photoId: photo.id, seed: request.seed, params: request.params, prompt: request.body.input, engine: 'nai', blob, info };
        } });
        job.catch(error => { this.emit('draw', { phase: error.cancelled ? 'cancelled' : 'error', message: error.message }); });
        return job;
    }
    /**
     * NovelAI's tools on a picture (base64 PNG of width×height): 导演工具 (tool: a DIRECTOR_TOOLS key, with prompt, mood,
     * defry for 上色 / 换表情) or tool 'upscale' (放大 by upscaleBy). Waits in the NovelAI queue like a drawing; the result
     * goes into the album. They cost Anlas, so the drawing app asks first.
     */
    naiTool({ tool, image, width, height, prompt = '', mood = 'neutral', defry = 0, name = 'NovelAI' } = {}) {
        this.assertOpen();
        if (!this.novelai.configured) return Promise.reject(Error('还没有填写 NovelAI 密钥'));
        if (!image || !(width > 0) || !(height > 0)) return Promise.reject(Error('没有图片'));
        const scale = tool === 'upscale' ? upscaleBy(width, height) : 0;
        if (tool === 'upscale' && !scale) return Promise.reject(Error(`这张图已经很大了，放大后会超过 ${UPSCALE_MAX} 像素`));
        const body = tool === 'upscale' ? { image, width, height, scale } : augmentBody({ tool, image, width, height, prompt, mood, defry });
        const label = tool === 'upscale' ? `放大 ×${scale}` : DIRECTOR_TOOLS[tool];
        const job = this.drawQueue.add({ key: `nai-tool:${tool}:${Date.now()}`, label: '绘图 App · ' + label, task: async signal => {
            this.assertOpen();
            this.emit('draw', { phase: 'generating' });
            this.novelai.relay = this.settings.draw.relay.url;
            const blob = tool === 'upscale' ? await this.novelai.upscale(body, signal) : await this.novelai.augment(body, signal);
            this.assertOpen();
            const info = [['引擎', 'NovelAI'], ['工具', label], ['原图', `${width} × ${height}`], ...(body.prompt ? [['说明', body.prompt.replace(';;', ' · ')]] : []), ['画于', new Date().toLocaleString('zh-CN', { hour12: false })]];
            const photo = await this.library.addPhoto({ name: `${name}-${label}-${Date.now()}.png`, blob, info });
            this.emit('library', { collection: 'photos' });
            this.emit('draw', { phase: 'done' });
            if (this.subscription) this.subscription.checkedAt = 0;
            return { photoId: photo.id, seed: -1, params: { width: width * (scale || 1), height: height * (scale || 1) }, prompt: label, engine: 'nai', tool };
        } });
        job.catch(error => { this.emit('draw', { phase: error.cancelled ? 'cancelled' : 'error', message: error.message }); });
        return job;
    }
    // ---------- Chat ----------
    // Voice messages and calls on the phone are read by the plugin and shown as bubbles, never as text: they keep the built-in
    // format, whatever the 配音预设 asks of the story (a format made for a beautified card has no place in a chat bubble).
    voiceFormat() { return DEFAULT_FORMAT; }
    saveChatPreset(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('聊天预设格式无效');
        const next = this.getState(), preset = validateChatPreset(normalizeChatPreset({ ...clone(value), id: value.id || crypto.randomUUID() }));
        const index = next.chat.presets.findIndex(p => p.id === preset.id);
        if (index < 0) next.chat.presets.push(preset); else next.chat.presets[index] = preset;
        this.save(next);
        return clone(preset);
    }
    deleteChatPreset(id) {
        const next = this.getState();
        if (next.chat.presets.length === 1) throw Error('请至少保留一个聊天预设');
        next.chat.presets = next.chat.presets.filter(p => p.id !== id);
        return this.save(next).chat;
    }
    selectChatPreset(id) {
        const next = this.getState();
        if (!next.chat.presets.some(p => p.id === id)) throw Error('聊天预设不存在');
        next.chat.activePreset = id;
        return this.save(next).chat;
    }
    saveContact(value) {
        const next = this.getState(), contact = validateContact(normalizeContact(clone(value || {})), next.routes);
        if (next.chat.contacts.some(c => c.name === contact.name && c.id !== contact.id)) throw Error('已经有同名的联系人');
        const index = next.chat.contacts.findIndex(c => c.id === contact.id);
        if (index < 0 && this.cardKey()) contact.space = this.cardKey();
        if (index >= 0 && next.chat.contacts[index].space) contact.space = next.chat.contacts[index].space;
        if (index < 0) next.chat.contacts.push(contact); else next.chat.contacts[index] = contact;
        this.save(next);
        return clone(contact);
    }
    /** Phone chat options: {voiceText: {mode, auto}, profile: {name, status, statusText, signature, bubble, frame, background, backgroundPhoto}, starred: [name]}. */
    saveChatOptions(patch) {
        const next = this.getState();
        if (patch?.voiceText) next.chat.voiceText = normalizeVoiceText({ ...next.chat.voiceText, ...patch.voiceText });
        if (patch?.profile) {
            // A look from the shop goes on only once it is bought.
            for (const kind of ['bubble', 'frame', 'background']) if (patch.profile[kind] && premiumOf(kind, patch.profile[kind]) && !next.chat.wallet.owned.includes(decorKey(kind, patch.profile[kind]))) throw Error('这件装扮还没买：先在商城里买下');
            next.chat.profile = normalizeProfile({ ...next.chat.profile, ...patch.profile });
        }
        if (Array.isArray(patch?.starred)) next.chat.starred = patch.starred;
        if (patch?.pace !== undefined) next.chat.pace = patch.pace !== false;
        // 主动发消息: {on, every, dailyMax}.
        if (patch?.proactive && typeof patch.proactive === 'object') next.chat.proactive = normalizeProactive({ ...next.chat.proactive, ...patch.proactive });
        if (Array.isArray(patch?.stickers)) next.chat.stickers = normalizeStickers(patch.stickers);
        if (patch?.partition !== undefined) { if (!['none', 'card'].includes(patch.partition)) throw Error('分区方式无效'); next.chat.partition = patch.partition; }
        // remarks (备注) and netNames (网名): {name: other name | '' | null}; empty takes it away.
        for (const key of ['remarks', 'netNames']) if (patch?.[key] && typeof patch[key] === 'object') {
            const merged = { ...next.chat[key] };
            for (const [name, other] of Object.entries(patch[key])) { if (other) merged[name] = other; else delete merged[name]; }
            next.chat[key] = normalizeNames(merged, key === 'remarks' ? 20 : 30);
        }
        // avatars: {name: choice | null}; null goes back to the tavern's avatar (or the first letter).
        if (patch?.avatars && typeof patch.avatars === 'object') { const merged = { ...next.chat.avatars }; for (const [name, a] of Object.entries(patch.avatars)) { if (a) merged[name] = a; else delete merged[name]; } next.chat.avatars = normalizeAvatars(merged); }
        return this.save(next).chat;
    }
    deleteContact(id) {
        const next = this.getState(), gone = next.chat.contacts.find(c => c.id === id);
        next.chat.contacts = next.chat.contacts.filter(c => c.id !== id);
        // Its avatar goes with it, unless a role of the same name still uses it.
        if (gone && !next.routes.some(r => r.name === gone.name) && next.chat.avatars?.[gone.name]) { const avatars = { ...next.chat.avatars }; delete avatars[gone.name]; next.chat.avatars = avatars; }
        return this.save(next).chat;
    }
    /** A role from the 角色 App joins this card's contacts (the card's story has not met them yet). */
    addRoleContact(name) {
        const route = findRoute(this.settings.routes, name);
        if (!route) throw Error('角色 App 里没有这个角色');
        if (this.spaceKey()) this.tagRoles([name], this.spaceKey());
        return clone(this.contacts());
    }
    previewChatPrompt(preset) {
        const p = validateChatPreset(normalizeChatPreset(clone(preset || activeChatPreset(this.settings.chat))));
        const contact = chatContacts(this.settings)[0] || { name: '联系人', persona: '', voice: false };
        const thread = { type: 'dm', name: contact.name, members: [contact.name], messages: [{ from: 'me', kind: 'text', text: '（这里是手机里的聊天记录）' }] };
        const member = { ...contact, card: contact.persona ? '' : '（酒馆角色卡里的设定）' }, story = [{ name: '（最近的剧情）', text: '……' }], text = request => request.map(m => `【${m.role}】\n${m.content}`).join('\n\n');
        const other = { name: '另一位联系人', persona: '', card: '（酒馆角色卡里的设定）', voice: false };
        const group = { type: 'group', name: '群聊', members: [contact.name, other.name], messages: thread.messages };
        const lore = p.lore !== false ? '（这里是触发的世界书条目：常驻的，以及名字、最近的正文和聊天里命中关键词的）' : '';
        return ['━━ 私聊 ━━', text(buildChatRequest({prompts: this.settings.promptRules,  preset: p, thread, members: [member], story, user: '{{user}}', voiceFormat: this.voiceFormat(), lore })),
            '━━ 群聊 ━━', text(buildChatRequest({prompts: this.settings.promptRules,  preset: p, thread: group, members: [member, other], story, user: '{{user}}', voiceFormat: this.voiceFormat(), lore })),
            '━━ 朋友圈（刷新时） ━━', text(buildMomentsRequest({prompts: this.settings.promptRules,  preset: p, people: [member, other], story, user: '{{user}}', images: this.settings.moments.images, lore })),
            '━━ 电话（接通后第一句） ━━', text(buildCallRequest({prompts: this.settings.promptRules,  preset: p, mode: 'incoming', contact: { ...member, voice: true }, history: thread.messages, story, user: '{{user}}', voiceFormat: this.voiceFormat(), voiceRules: '（这里是这个角色的语音引擎朗读规则）', lore })),
            '━━ 论坛（刷新时） ━━', text(buildForumRequest({prompts: this.settings.promptRules,  preset: p, people: [member, other], story, user: '{{user}}', lore })),
            '━━ 查手机 ━━', text(buildPeekRequest({prompts: this.settings.promptRules,  preset: p, person: member, story, user: '{{user}}', history: thread.messages, lore }))].join('\n\n');
    }
    /** 来电 options: {auto, every, dailyMax, ring}. */
    saveCalls(patch) {
        const next = this.getState(), allowed = ['auto', 'every', 'dailyMax', 'ring'];
        next.calls = normalizeCalls({ ...next.calls, ...Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key))) });
        return this.save(next).calls;
    }
    // ---------- 音效 ----------
    /** {enabled, ambienceVolume, sfxVolume, vary, tapOnly, generate, versions}. */
    // ---------- 音乐 ----------
    /** Music options: {bgm, rule, volume, duck, share, sources}. Sources are checked before they are kept. */
    saveMusic(patch) {
        const next = this.getState(), allowed = ['bgm', 'rule', 'volume', 'duck', 'share', 'sources'];
        const merged = { ...next.music, ...Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key))) };
        if (Array.isArray(patch?.sources)) { if (patch.sources.length > MUSIC_LIMITS.sources) throw Error(`最多 ${MUSIC_LIMITS.sources} 个音源`); merged.sources = patch.sources.map((s, i) => validateSource(normalizeSource(s, i))); }
        next.music = normalizeMusic(merged);
        const saved = this.save(next).music;
        this.emit('music', { settings: true });
        return saved;
    }
    /** A web address read from the page, else (it does not allow pages to read it) through the tavern's own proxy. */
    async musicFetch(url, as = 'json') {
        const read = async response => {
            if (!response.ok) throw Object.assign(Error(`HTTP ${response.status}`), { status: response.status });
            // Asked for a link and given the song itself: no need to download it here.
            if (as === 'link' && isAudio(response.headers?.get?.('content-type'))) { response.body?.cancel?.().catch?.(() => {}); return AUDIO; }
            return as === 'text' ? response.text() : response.json();
        };
        // A server plugin on the tavern itself: with the tavern's login and checks; there is no proxy to try then.
        if (onTavern(url)) {
            let response;
            try { response = await this.musicTransport(url, { credentials: 'same-origin', headers: this.tavernHeaders() }); } catch { throw Error('连不上酒馆里的这个地址'); }
            if (response.status === 404) throw Error('酒馆里没有这个地址：服务端插件装好了吗？（config.yaml 里 enableServerPlugins 要是 true，装完要完全重启酒馆）');
            return read(response).catch(error => { throw Error(`酒馆里的音源回答 ${error.message}`); });
        }
        try { return await read(await this.musicTransport(url, { credentials: 'omit' })); }
        catch (error) {
            if (error?.status) throw Error(`音源回答 ${error.message}`);
            const proxied = await this.musicTransport('/proxy/' + encodeURIComponent(url), { credentials: 'same-origin' }).catch(() => null);
            if (!proxied) throw Error('连不上这个音源：网址不对，或者它不让网页直接读取，酒馆代理也连不上');
            if (!proxied.ok) { const said = await proxied.text().catch(() => ''); throw Error(/CORS proxy is disabled/i.test(said) ? '这个音源不让网页直接读取：可以在酒馆的 config.yaml 里把 enableCorsProxy 改成 true 再重启酒馆' : `音源回答 HTTP ${proxied.status}`); }
            return read(proxied);
        }
    }
    musicSource(id) {
        // A draft can be tried without changing saved sources or notifying other views.
        if (id && typeof id === 'object') return validateSource(normalizeSource(clone(id)));
        const s = this.settings.music.sources.find(x => x.id === id);
        if (!s) throw Error('这个音源已经不在了');
        return clone(s);
    }
    /** Searches the enabled sources (or one): {songs: [{source, sourceName, id, title, artist}], errors: [{source, message}]}. */
    async searchMusic(query, sourceId = '') {
        this.assertOpen();
        const words = String(query || '').trim().slice(0, 100);
        if (!words) throw Error('写一下想听的歌');
        const sources = sourceId && typeof sourceId === 'object' ? [this.musicSource(sourceId)] : clone(this.settings.music.sources.filter(s => sourceId ? s.id === sourceId : s.enabled));
        if (!sources.length) throw Error('还没有能用的音源：先在「音乐 → 设置 → 音源」里添加一个');
        const songs = [], errors = [];
        await Promise.all(sources.map(async s => {
            try { songs.push(...readSearch(s, await this.musicFetch(fillSource(s.search, { query: words }))).map(x => ({ ...x, sourceName: s.name }))); }
            catch (error) { errors.push({ source: s.name, message: error.message }); }
        }));
        return { songs, errors };
    }
    /** A playable link for a song of a source. */
    async musicLink(sourceId, songId, hint = {}) {
        this.assertOpen();
        const s = this.musicSource(sourceId), address = fillSource(s.url, { id: songId, title: hint.title, artist: hint.artist });
        // The address itself is the song: played as it is (the tavern's own address stays as it is, the page's origin).
        const own = () => onTavern(address) ? address : playable(address, globalThis.location?.protocol);
        if (s.direct) return own();
        let answer = await this.musicFetch(address, 'link');
        if (answer === AUDIO) return own();
        let link = readLink(s, answer);
        // No link from a NeteaseCloudMusicApi-style backend: asked once more as a Chinese IP (core/music.js asChina).
        const again = !link && asChina(address);
        if (again) { const second = await this.musicFetch(again, 'link').catch(() => null); if (second === AUDIO) return playable(again, globalThis.location?.protocol); if (second) { const found = readLink(s, second); if (found) { link = found; answer = second; } } }
        if (!link) throw Error(`「${s.name}」没有给出播放链接：${missingLink(s, answer)}`);
        const out = playable(link, globalThis.location?.protocol);
        // Only the 30-second preview: kept, so the player can say why the song stops (core/music.js trialOnly).
        if (trialOnly(answer)) { this.trialLinks ??= new Set(); this.trialLinks.add(out); if (this.trialLinks.size > 50) this.trialLinks.delete(this.trialLinks.values().next().value); }
        return out;
    }
    /** Whether a link from musicLink is only a 30-second preview (a 会员 song, the source not logged in). */
    musicTrial(link) { return !!this.trialLinks?.has(link); }
    async musicLyric(sourceId, songId, hint = {}) {
        const s = this.musicSource(sourceId);
        if (!s.lyric) return '';
        try { const value = pickPath(await this.musicFetch(fillSource(s.lyric, { id: songId, title: hint.title, artist: hint.artist })), s.lyricPath); return typeof value === 'string' ? value.slice(0, 60000) : ''; } catch { return ''; }
    }
    /** The 歌单: songs without their files. */
    async listSongs() { this.assertOpen(); return (await this.music.list('song')).map(({ blob, ...row }) => row); }
    async songBlob(id) { const row = await this.music.get(id); return row?.blob || null; }
    /** Adds files ({title, artist, blob}) or source songs ({title, artist, source, songId}) to the 歌单. */
    async addSongs(list) {
        this.assertOpen();
        const now = Date.now(), have = await this.listSongs();
        if (have.length + list.length > MUSIC_LIMITS.songs) throw Error(`歌单最多 ${MUSIC_LIMITS.songs} 首`);
        const rows = list.map((value, i) => {
            const row = songRow({ ...value, origin: value.blob ? 'file' : 'source' }, now + i);
            if (row.origin === 'source') { const dup = have.find(h => h.source === row.source && h.songId === row.songId); if (dup) return null; return row; }
            let blob;
            try { blob = Blob.prototype.slice.call(value.blob, 0, undefined, value.blob?.type || ''); } catch { throw Error(`「${row.title}」不是能用的音频文件`); }
            if (!blob.size) throw Error(`「${row.title}」是空文件`);
            if (blob.size > MUSIC_LIMITS.file) throw Error(`「${row.title}」太大了（一首最多 ${MUSIC_LIMITS.file / 1024 / 1024} MB）`);
            const type = String(blob.type || '').toLowerCase();
            if (type && !type.startsWith('audio/') && !['application/octet-stream', 'video/mp4', 'video/webm', 'video/ogg'].includes(type)) throw Error(`「${row.title}」不是音频文件`);
            return { ...row, blob, size: blob.size, mime: type };
        }).filter(Boolean);
        if (rows.length) await this.music.put(rows);
        this.emit('music', { library: true });
        return rows.map(({ blob, ...row }) => row);
    }
    async updateSong(id, patch = {}) {
        const saved = await this.music.change(id, row => {
            if ('title' in patch) { const t = String(patch.title || '').trim().slice(0, 200); if (!t) throw Error('歌名不能空着'); row.title = t; }
            if ('artist' in patch) row.artist = String(patch.artist || '').trim().slice(0, 200);
            if ('lyric' in patch) { if (patch.lyric) row.lyric = String(patch.lyric).slice(0, 60000); else delete row.lyric; }
        });
        this.emit('music', { library: true });
        const { blob, ...row } = saved; return row;
    }
    async deleteSongs(ids) { for (const id of ids) await this.music.remove(id); this.emit('music', { library: true }); return true; }
    /** A song asked for by name (<bgm>, a shared song): the 歌单 first, then the first fitting search result. */
    async findSong(want) {
        // The 歌单 only when the title is the same (晴天 is not 晴天（Live）); a search may be looser.
        const mine = bestMatch((await this.listSongs()).filter(s => matchScore(s, want) >= 2), want);
        if (mine) return mine;
        if (!this.settings.music.sources.some(s => s.enabled)) return null;
        const { songs } = await this.searchMusic([want.title, want.artist].filter(Boolean).join(' ')).catch(() => ({ songs: [] }));
        // Nothing by that name: the search's first song stands in, marked so the player shows what really plays.
        const match = bestMatch(songs, want), found = match || songs[0];
        return found ? { origin: 'source', source: found.source, songId: found.id, title: found.title, artist: found.artist, ...(match ? {} : { standIn: true }) } : null;
    }
    saveSounds(patch) {
        const next = this.getState(), allowed = ['enabled', 'ambienceVolume', 'sfxVolume', 'vary', 'tapOnly', 'generate', 'versions', 'pack', 'packHidden'];
        next.sounds = normalizeSounds({ ...next.sounds, ...Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key))) });
        return this.save(next).sounds;
    }
    /** The shipped pack, read once (none when the plugin has no sounds folder or it cannot be read). */
    packAll() {
        if (!this.soundPack) return Promise.resolve([]);
        this.packLoad ||= this.assetFetch(new URL('pack.json', this.soundPack).href).then(r => r.ok ? r.json() : null).then(pack => packRows(pack, this.soundPack)).catch(() => { this.packLoad = null; return []; });
        return this.packLoad;
    }
    /** The shipped sounds in use: none while the pack is off, and not the ones taken out. */
    async packSounds() {
        const s = this.settings.sounds;
        if (s.pack === false) return [];
        const hidden = new Set(s.packHidden || []);
        return (await this.packAll()).filter(r => !hidden.has(r.id));
    }
    /** The sound library without the audio: the user's own and ElevenLabs-made ones newest first, then the shipped pack. */
    async listSounds() { return [...(await this.sounds.list('sound')).map(({ blob, kind, ...row }) => row), ...(await this.packSounds()).map(({ url, ...row }) => row)]; }
    async soundBlob(id) {
        if (String(id).startsWith('pack:')) {
            const row = (await this.packAll()).find(r => r.id === id);
            if (!row) return null;
            const r = await this.assetFetch(row.url);
            if (!r.ok) throw Error('读不到自带的声音（' + r.status + '）');
            return r.blob();
        }
        const row = await this.sounds.get(id); return row?.kind === 'sound' ? row.blob : null;
    }
    /** How many of the shipped sounds there are, and how many were taken out. */
    async packInfo() { const all = await this.packAll(); return { names: new Set(all.map(r => r.type + '|' + r.name)).size, count: all.length, hidden: (this.settings.sounds.packHidden || []).length }; }
    /** Adds sounds: each {name, type, layer, strength, source, describe, seconds, blob}. The names they answer are no longer missing. */
    async addSounds(list) {
        this.assertOpen();
        const at = Date.now(), rows = (Array.isArray(list) ? list : [list]).map((value, i) => {
            const row = soundRow(value);
            if (!row.name) throw Error('给声音起个名字');
            // Files selected in the phone iframe belong to another window, so instanceof Blob rejects them.
            // Native slice validates Blob's internal data across realms and gives storage a local Blob.
            let blob;
            try { blob = Blob.prototype.slice.call(value?.blob, 0, undefined, value?.blob?.type || ''); }
            catch { throw Error(`「${row.name}」不是能用的音频文件`); }
            if (!blob.size) throw Error(`「${row.name}」不是能用的音频文件`);
            if (blob.size > SOUND_LIMITS.file) throw Error(`「${row.name}」太大了（单个声音最多 ${SOUND_LIMITS.file / 1024 / 1024} MB）`);
            const type = String(blob.type || '').toLowerCase();
            if (type && !type.startsWith('audio/') && !['application/octet-stream', 'video/webm', 'video/ogg'].includes(type)) throw Error(`「${row.name}」不是音频文件`);
            return { ...row, id: crypto.randomUUID(), kind: 'sound', at: at + i, mime: type.startsWith('audio/') ? type : 'audio/mpeg', size: blob.size, blob };
        });
        if (!rows.length) return [];
        await this.sounds.put(rows);
        for (const key of new Set(rows.map(r => missingKey(r.type, r.name)))) await this.sounds.remove(key);
        this.emit('sounds', {});
        return rows.map(({ blob, kind, ...row }) => row);
    }
    /** Renames or re-sorts a sound: name, type, layer, strength, describe. */
    async updateSound(id, patch = {}) {
        const allowed = ['name', 'type', 'layer', 'strength', 'describe'];
        if (String(id).startsWith('pack:')) throw Error('自带的声音不能改：可以删掉它，再自己传一个');
        const row = await this.sounds.change(id, doc => {
            if (doc.kind !== 'sound') throw Error('这个声音已经不在了');
            const next = soundRow({ ...doc, ...Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key))) });
            if (!next.name) throw Error('给声音起个名字');
            Object.assign(doc, next);
        });
        await this.sounds.remove(missingKey(row.type, row.name));
        this.emit('sounds', {});
        const { blob, kind, ...rest } = row;
        return rest;
    }
    async deleteSounds(ids) {
        const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean))];
        // A shipped sound is only taken out of use (it can come back); the others are deleted.
        const pack = list.filter(id => id.startsWith('pack:'));
        if (pack.length) this.saveSounds({ packHidden: [...(this.settings.sounds.packHidden || []), ...pack] });
        for (const id of list) if (!id.startsWith('pack:')) await this.sounds.remove(id);
        if (list.length) this.emit('sounds', {});
        return list.length;
    }
    /** 缺的声音: {type, name, describe, count, at}, the most recent first. */
    async soundMissing() { return (await this.sounds.list('missing')).map(({ kind, id, ...row }) => row); }
    async noteMissing({ type, name, describe = '' } = {}) {
        name = soundName(name);
        if (!name || !SOUND_KINDS.includes(type)) return;
        const id = missingKey(type, name), old = await this.sounds.get(id);
        await this.sounds.put([{ id, kind: 'missing', type, name, describe: String(describe || old?.describe || '').slice(0, 200), count: (old?.count || 0) + 1, at: Date.now() }], { keep: 60 });
        this.emit('sounds', { missing: true });
    }
    async dismissMissing(type, name) { await this.sounds.remove(missingKey(type, name)); this.emit('sounds', { missing: true }); }
    /** Has ElevenLabs make a sound from an English description and keeps it (an ambience loops: about 22 seconds). */
    async generateSound({ name, type = 'sfx', describe = '' } = {}, signal) {
        this.assertOpen();
        if (!this.providers.currentKey('eleven')) throw Error('要先在引擎 App 里填 ElevenLabs 的密钥，才能生成音效');
        const text = String(describe || '').trim();
        if (!/[a-z]/i.test(text)) throw Error('写一句英文描述（比如 heavy wooden door knock），ElevenLabs 才知道做什么声音');
        const ambience = type === 'ambience';
        const blob = await this.providers.soundEffect({ text, loop: ambience, seconds: ambience ? 22 : 0 }, signal);
        const [row] = await this.addSounds([{ name, type, layer: 'bed', source: 'eleven', describe: text, blob }]);
        return row;
    }
    /** 导出音效包: the chosen sounds (all when none are named) in one file to share. */
    async exportSounds(ids = null, name = '') {
        const wanted = Array.isArray(ids) && ids.length ? new Set(ids) : null;
        // Only the user's own and ElevenLabs-made sounds: everyone has the shipped pack.
        const rows = (await this.sounds.list('sound')).filter(r => !wanted || wanted.has(r.id)).reverse();
        if (!rows.length) throw Error('还没有声音可以导出');
        const sounds = [];
        for (const r of rows) sounds.push({ ...soundRow(r), mime: r.mime, data: await this.base64(r.blob) });
        return new Blob([JSON.stringify({ format: PACK_FORMAT, version: 1, name: String(name || '').slice(0, 60), at: Date.now(), sounds })], { type: 'application/json' });
    }
    /** 导入音效包: adds the pack's sounds (one already here, same name, kind and size, is skipped). source: who made them (自带 for the shipped pack). */
    async importSounds(file, { source = '' } = {}) {
        const pack = readPack(typeof file === 'string' ? file : await file.text());
        const have = new Set((await this.sounds.list('sound')).map(r => [r.type, r.name, r.layer, r.size].join('|')));
        const add = [];
        for (const s of pack.sounds) {
            let bytes;
            try { bytes = Uint8Array.from(atob(s.data), c => c.charCodeAt(0)); } catch { continue; }
            const key = [s.type, s.name, s.layer, bytes.length].join('|');
            if (have.has(key)) continue;
            have.add(key);
            add.push({ ...s, ...(source ? { source } : {}), blob: new Blob([bytes], { type: s.mime }) });
        }
        await this.addSounds(add);
        return { added: add.length, skipped: pack.sounds.length - add.length, name: pack.name };
    }
    // ---------- 助手 ----------
    /** Assistant settings never contain chat history or the tavern's assembled request context. */
    saveAssistant(patch) {
        validateAssistantPatch(patch);
        const next = this.getState();
        const proposed = { ...next.assistant, ...clone(patch) };
        if (proposed.activePreset !== 'companion' && !proposed.presets.some(p => p.id === proposed.activePreset)) throw Error('请选择存在的助手预设');
        next.assistant = normalizeAssistant(proposed);
        const result = this.save(next).assistant;
        this.emit('assistant', { settings: true });
        return result;
    }
    /** Assistant conversations belong to this account, independently of the open story/card. */
    async assistantThreads() { this.assertOpen(); return (await this.apps.list('assistant')).map(assistantSummary); }
    async assistantThread(id) {
        this.assertOpen();
        const thread = await this.apps.get(assistantId(id));
        return thread?.kind === 'assistant' ? assertAssistantThread(thread) : null;
    }
    // Assistant books share the conversation's database so edits and summary commits can
    // check the same revision in one transaction. Chat books keep their existing database.
    async assistantMemoryData(id, vector = false) {
        this.assertOpen(); assistantId(id);
        const key = vector ? 'vec:' + id : bookId(id), rows = await this.apps.getMany([id, key]);
        const thread = rows.get(id), doc = rows.get(key);
        if (thread?.kind !== 'assistant' || !doc || doc.memoryRevision !== (thread.memoryRevision || 0)) return vector ? null : emptyBook(id);
        return doc;
    }
    assistantMemoryBook(id) { return this.assistantMemoryData(id); }
    assistantMemoryVectors(id) { return this.assistantMemoryData(id, true); }
    async assistantMemoryChange(id, change, name = '', expectedRevision, expectedMemoryRevision) {
        this.assertOpen(); assistantId(id);
        const key = bookId(id);
        const saved = await this.apps.changeRelated(id, [key], (thread, docs) => {
            assertAssistantThread(thread);
            if ((expectedRevision !== undefined && (thread.revision || 0) !== expectedRevision) || (expectedMemoryRevision !== undefined && (thread.memoryRevision || 0) !== expectedMemoryRevision)) throw Error('助手会话或记忆已变化，这次整理没有写入');
            const old = docs.get(key), current = old?.memoryRevision === (thread.memoryRevision || 0) ? old : emptyBook(id, name);
            const next = {...cleanBook(change(clone(current))), memoryRevision: thread.memoryRevision || 0};
            next.threadId = id; next.id = key;
            thread.at = thread.updatedAt = Math.max(Date.now(), (thread.updatedAt || 0) + 1);
            docs.set(key, next); return next;
        });
        this.emit('memory', {threadId: id, persisted: true});
        return saved;
    }
    async assistantMemorySaveVectors(id, doc, expectedRevision, expectedMemoryRevision) {
        this.assertOpen(); assistantId(id);
        const key = 'vec:' + id;
        return this.apps.changeRelated(id, [key], (thread, docs) => {
            assertAssistantThread(thread);
            if ((expectedRevision !== undefined && (thread.revision || 0) !== expectedRevision) || (expectedMemoryRevision !== undefined && (thread.memoryRevision || 0) !== expectedMemoryRevision)) throw Error('助手会话或记忆已变化，检索缓存没有写入');
            const next = {...clone(doc), id: key, kind: 'vectors', threadId: id, at: Date.now(), memoryRevision: thread.memoryRevision || 0};
            docs.set(key, next); return next;
        });
    }
    async assistantMemoryRevise(id, change = null) {
        this.assertOpen(); assistantId(id);
        const key = bookId(id), vector = 'vec:' + id;
        const saved = await this.apps.changeRelated(id, [key, vector], (thread, docs) => {
            assertAssistantThread(thread);
            const old = docs.get(key), current = old?.memoryRevision === (thread.memoryRevision || 0) ? old : emptyBook(id, thread.title);
            const next = change ? cleanBook(change(clone(current))) : null;
            thread.memoryRevision = (thread.memoryRevision || 0) + 1;
            thread.at = thread.updatedAt = Math.max(Date.now(), (thread.updatedAt || 0) + 1);
            if (next) { next.threadId = id; next.id = key; next.memoryRevision = thread.memoryRevision; }
            docs.set(key, next); docs.set(vector, null);
            return next || emptyBook(id, thread.title);
        });
        this.emit('memory', {threadId: id, reset: true, persisted: true}); return saved;
    }
    assistantMemoryForget(id) { return this.assistantMemoryRevise(id).then(() => {}); }
    async newAssistantThread() {
        this.assertOpen();
        const now = Date.now(), thread = { id: 'assistant:' + crypto.randomUUID(), kind: 'assistant', title: '新对话', createdAt: now, updatedAt: now, at: now, messages: [] };
        const [saved] = await this.apps.put([thread]);
        this.emit('assistant', { threadId: saved.id, persisted: true });
        return saved;
    }
    async appendAssistantMessage(id, value, expectedLastId, expectedRevision) {
        this.assertOpen();
        if (expectedLastId != null && (typeof expectedLastId !== 'string' || !expectedLastId.trim() || expectedLastId.length > 200)) throw Error('助手消息定位无效');
        const message = assistantMessage(value);
        const saved = await this.apps.change(assistantId(id), thread => {
            assertAssistantThread(thread);
            if (expectedRevision !== undefined && (thread.revision || 0) !== expectedRevision) throw Error('助手会话已变化，这次回复没有写入');
            // Check and append share the same IndexedDB readwrite transaction, including across tabs.
            if (expectedLastId != null && thread.messages.at(-1)?.id !== expectedLastId) throw Error('助手会话已变化，这次回复没有写入');
            if (thread.messages.length >= ASSISTANT_LIMITS.messages) throw Error('这条助手会话已达到 500 条消息，请新建对话后继续');
            const now = Math.max(Date.now(), Number(thread.updatedAt || thread.at) + 1);
            message.at = now;
            if (message.role === 'user' && !thread.titleEdited && !thread.messages.some(item => item.role === 'user')) thread.title = (message.text || message.attachments?.[0]?.name || '新对话').replace(/\s+/g, ' ').slice(0, ASSISTANT_LIMITS.title);
            thread.messages.push(message);
            thread.revision = (thread.revision || 0) + 1;
            thread.at = thread.updatedAt = now;
        });
        this.emit('assistant', { threadId: saved.id, persisted: true });
        return saved;
    }
    async mutateAssistantThread(id, mutate, {history = true} = {}) {
        this.assertOpen();
        const saved = await this.apps.changeRelated(assistantId(id), [bookId(id), 'vec:' + id], (thread, docs) => {
            assertAssistantThread(thread); mutate(thread);
            if (history) {
                thread.revision = (thread.revision || 0) + 1;
                thread.memoryRevision = (thread.memoryRevision || 0) + 1;
                docs.set(bookId(id), null); docs.set('vec:' + id, null);
            }
            thread.at = thread.updatedAt = Math.max(Date.now(), Number(thread.updatedAt || thread.at) + 1);
            return thread;
        });
        this.emit('assistant', { threadId: saved.id, persisted: true, ...(history ? {memoryReset: true} : {}) }); return saved;
    }
    async renameAssistantThread(id, title) {
        if (typeof title !== 'string' || !title.trim() || title.trim().length > ASSISTANT_LIMITS.title) throw Error('会话名字请填写 1–80 个字符');
        return this.mutateAssistantThread(id, thread => { thread.title = title.trim(); thread.titleEdited = true; }, {history: false});
    }
    async editAssistantMessage(id, messageId, text, expectedText) {
        if (typeof text !== 'string' || text.length > ASSISTANT_LIMITS.text) throw Error('消息格式无效或超过 100000 字符');
        return this.mutateAssistantThread(id, thread => {
            const message = thread.messages.find(m => m.id === messageId);
            if (message?.role !== 'user') throw Error('只能编辑自己发送的消息');
            if (expectedText !== undefined && message.text !== expectedText) throw Error('这条消息已经被修改，请重新打开编辑');
            if (!text.trim() && !message.attachments?.length) throw Error('消息不能为空');
            message.text = text.trim(); message.editedAt = Date.now();
        });
    }
    async deleteAssistantMessage(id, messageId) {
        return this.mutateAssistantThread(id, thread => {
            const index = thread.messages.findIndex(m => m.id === messageId);
            if (index < 0) throw Error('这条消息已经不在了');
            thread.messages.splice(index, 1);
        });
    }
    async selectAssistantVariant(id, messageId, selected) {
        return this.mutateAssistantThread(id, thread => {
            const message = thread.messages.find(m => m.id === messageId), variants = message?.variants;
            if (message?.role !== 'assistant' || !Array.isArray(variants) || !Number.isInteger(selected) || !variants[selected]) throw Error('这个回复版本已经不在了');
            message.selected = selected;
            message.text = variants[selected].text; message.meta = variants[selected].meta; message.at = variants[selected].at;
        });
    }
    async addAssistantVariant(id, messageId, value, expectedRevision) {
        const result = assistantMessage({...value, role: 'assistant'});
        return this.mutateAssistantThread(id, thread => {
            if ((thread.revision || 0) !== expectedRevision) throw Error('助手会话已变化，这次回复没有写入');
            const message = thread.messages.find(m => m.id === messageId);
            if (message?.role !== 'assistant') throw Error('这条回复已经不在了');
            const variants = message.variants || [{text: message.text, at: message.at, ...(message.meta ? {meta: message.meta} : {})}];
            if (variants.length >= ASSISTANT_LIMITS.variants) throw Error('这条消息已有 20 个回复版本');
            variants.push({text: result.text, at: result.at, meta: result.meta});
            message.variants = variants; message.selected = variants.length - 1;
            message.text = result.text; message.meta = result.meta; message.at = result.at;
        });
    }
    async clearAssistantThread(id) {
        return this.mutateAssistantThread(id, thread => {
            thread.messages = [];
            thread.titleEdited = false;
            thread.title = '新对话';
        });
    }
    async deleteAssistantThread(id) {
        this.assertOpen();
        const threadId = assistantId(id), thread = await this.apps.get(threadId);
        if (!thread) return false;
        assertAssistantThread(thread);
        await this.apps.removeMany([threadId, bookId(threadId), 'vec:' + threadId]);
        this.noteGone('assistant', [threadId], Math.max(thread.restoredAt || 0, thread.updatedAt || 0));
        this.emit('assistant', { threadId, deleted: true, persisted: true });
        return true;
    }
    // ---------- 朋友圈 ----------
    /** Moments options: {auto, every, dailyMax, images, replyToMe}. */
    saveMoments(patch) {
        const next = this.getState(), allowed = ['auto', 'every', 'dailyMax', 'images', 'replyToMe'];
        next.moments = normalizeMoments({ ...next.moments, ...Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key))) });
        return this.save(next).moments;
    }
    // ---------- 分区 ----------
    /** The card open in the tavern now: {key, name, members}. With 分区 on, the phone shows that card's own things. */
    setSpace(space) {
        const next = { key: String(space?.key || '').slice(0, 300), name: String(space?.name || '').slice(0, 80), members: (Array.isArray(space?.members) ? space.members : []).map(String).filter(Boolean).slice(0, 30) };
        if (next.key === this.space.key && next.name === this.space.name && next.members.join('\n') === this.space.members.join('\n')) return;
        this.space = next;
        // The card's own characters belong to it (so they do not show up in other cards as roles no story has met).
        if (next.key && next.members.length) this.tagRoles(next.members, next.key);
        this.emit('space', { space: clone(next) });
        if (!this.here()) return;
        this.emit('chat', { threadId: '' }); this.emit('moments', {}); this.emit('forum', {}); this.emit('peek', {});
    }
    /** The space lists are filtered by, or null when 分区 is off (or no card is open). */
    here() { return activeSpace(this.settings, this.space); }
    /** The key lists are filtered and 查手机 is stored by ('' = shared, also when 分区 is off). */
    spaceKey() { return this.here()?.key || ''; }
    /** The card open now, whether 分区 is on or not: new things remember the card they were made in, so turning 分区 on
     *  later sorts them. ('' when no card is open: shared.) */
    cardKey() { return this.space.key || ''; }
    /** Who the picture rules name: the open card's people and the given speakers (null: everyone). */
    drawCast(speakers = []) { return drawCast(this.settings, this.space, speakers); }
    /** The roles that speak in a card's story belong to that card's contacts. Saved only when something changed. */
    tagRoles(names, key = this.space.key) {
        if (!key || !names?.length) return false;
        const want = new Set(names.map(String)), next = this.getState();
        let changed = false;
        for (const route of next.routes) {
            if (!want.has(route.name)) continue;
            const cards = Array.isArray(route.cards) ? route.cards : [];
            if (!cards.includes(key)) { route.cards = [...cards, key].slice(-100); changed = true; }
        }
        if (changed) this.save(next);
        return changed;
    }
    /** Contacts of the card open now (all of them when 分区 is off). */
    contacts() { return chatContacts(this.settings, this.here()); }
    /** Who 论坛 and 朋友圈 write about. With 分区 on: the open card's own people (its characters, roles met in its
     *  story or added to it, contacts added under it), not the roles no story has met yet, which can be added from
     *  联系人 →「＋」. All contacts when that leaves no one. */
    crowd() {
        const here = this.here(), all = this.contacts();
        if (!here) return all;
        const own = all.filter(c => c.source === 'manual' || (here.members || []).includes(c.name) || this.settings.routes.some(r => r.name === c.name && Array.isArray(r.cards) && r.cards.includes(here.key)));
        return own.length ? own : all;
    }
    /** Phone chats of the card open now. */
    async threads() { const here = this.here(); return (await this.chats.list()).filter(t => inSpace(t, here)); }
    /** Removes what was made under the open card (or everything, with 分区 off). */
    async clearHere(list, remove, clearAll) {
        const here = this.here();
        if (!here) return clearAll();
        const mine = (await list()).filter(x => x.space === here.key);
        for (const x of mine) await remove(x.id);
        return mine.length;
    }
    hotId() { const key = this.spaceKey(); return key ? 'forum-hot:' + key : 'forum-hot'; }

    // ---------- 论坛 ----------
    /** Runs a change to an app's documents and tells the phone ('forum' or 'peek'). */
    async appsMutate(type, task) {
        this.assertOpen();
        const result = await task();
        this.emit(type, {});
        return result;
    }
    /** New posts from the board (characters and strangers), with made-up likes and 热度; the oldest go past the limit. */
    async addForumPosts(posts, { source = 'auto', space = this.cardKey() } = {}) {
        // The first post the model wrote is shown on top (newest first).
        const now = Date.now(), id = () => crypto.randomUUID();
        const docs = posts.map((p, i) => cleanForumPost({ ...p, source, space, ...(source === 'me' ? { likes: 0, heat: 1 } : startingHeat(p)) }, id(), now - i * 10, id));
        return this.appsMutate('forum', () => this.apps.put(docs, { keep: FORUM_LIMITS.posts }));
    }
    /** id: the 热搜 of the card the request was made for (hotId() when it was asked). */
    async setForumHot(topics, id = this.hotId()) {
        const list = [...new Set((topics || []).map(t => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, FORUM_LIMITS.hot);
        if (!list.length) return [];
        await this.appsMutate('forum', () => this.apps.put([{ id, kind: 'forum-hot', at: Date.now(), topics: list }]));
        return list;
    }
    /** Replies added under a post; each one makes it a little hotter. */
    async addForumReplies(postId, replies) {
        const now = Date.now();
        return this.appsMutate('forum', () => this.apps.change(postId, post => {
            if (post.kind !== 'forum') throw Error('这个帖子已经不在了');
            replies.forEach((r, i) => post.replies.push(cleanForumReply(r, crypto.randomUUID(), now + i)));
            post.replies = post.replies.slice(-FORUM_LIMITS.replies);
            post.heat += replies.length * (20 + Math.round(Math.random() * 80));
            post.likes += replies.filter(r => r.from !== 'me').length ? Math.round(Math.random() * 6) : 0;
        }));
    }
    // ---------- 查手机 ----------
    /** A character's phone as the model made it up; replaces the earlier one of the same person. space: the card it was
     *  looked at under (spaceKey() when the look began; the tavern may have moved to another card while it was written). */
    async savePeek(snapshot, space = this.spaceKey()) { const doc = cleanPeek({ ...snapshot, space }, Date.now()); return (await this.appsMutate('peek', () => this.apps.put([doc])))[0]; }

    /** Runs a change to the moments and tells the phone. */
    async momentsMutate(task) {
        this.assertOpen();
        const result = await task();
        this.emit('moments', {});
        return result;
    }
    async chatMutate(threadId, task) {
        this.assertOpen();
        const result = await task();
        this.emit('chat', { threadId });
        return result;
    }
    // ---------- 删好友 ----------
    /** The private chat with `name` on this card (made when there is none yet). */
    async dmThread(name) {
        const here = currentDm(await this.threads(), name);
        return here || this.chats.create({ type: 'dm', members: [name], space: this.cardKey() });
    }
    /** The user deletes a contact: the chat is put away (kept), and what they send meanwhile becomes 好友申请. */
    async unfriend(name) {
        this.assertOpen();
        if (!this.contacts().some(c => c.name === name)) throw Error(`联系人里没有「${name}」`);
        const thread = await this.dmThread(name);
        const saved = await this.chats.update(thread.id, { friend: { by: 'me', at: Date.now(), requests: [] }, pinned: false });
        this.emit('chat', { threadId: thread.id, friend: true });
        return saved;
    }
    /** Adds a deleted contact back: the chat comes back, with the 好友申请 they sent in it. */
    async refriend(threadId) {
        this.assertOpen();
        const thread = await this.chats.get(threadId);
        if (thread?.friend?.by !== 'me') throw Error('TA 已经是你的好友了');
        const name = thread.members[0], requests = thread.friend.requests || [];
        await this.chats.append(threadId, [{ from: 'me', kind: 'system', text: `你已添加了${name}，现在可以开始聊天了` }, ...requests.map(r => ({ from: name, kind: 'text', text: r.text }))], { read: true });
        const saved = await this.chats.update(threadId, { friend: null });
        this.emit('chat', { threadId, friend: true });
        return saved;
    }
    /** What a deleted contact sends arrives as 好友申请 (kept until the user adds them back). */
    async friendRequest(threadId, texts) {
        this.assertOpen();
        const saved = await this.chats.addRequest(threadId, texts);
        this.emit('chat', { threadId, friend: true, request: true });
        return saved;
    }
    /** The user's messages to someone who deleted them: sent, then refused with the usual note. */
    async appendChat(id, messages, options) {
        const thread = await this.chats.get(id);
        let saved = await this.chats.append(id, messages, options);
        if (thread?.friend?.by === 'them' && messages.some(m => m?.from === 'me' && m.kind !== 'system')) {
            const name = thread.members[0];
            saved = await this.chats.append(id, [{ from: 'me', kind: 'system', text: `消息已发出，但被对方拒收了。${name}开启了好友验证，你还不是TA的好友。请先发送好友申请，对方通过后才能聊天。` }], { read: true });
        }
        this.emit('chat', { threadId: id });
        return saved;
    }
    /** Plays one voice message through the normal player (cache, favourites and the island all work). */
    speak(line) {
        const lines = (Array.isArray(line) ? line : [line]).filter(l => l?.role && l.text);
        if (!lines.length) throw Error('这条语音没有内容');
        return this.player.start(lines.map(l => ({ role: l.role, emotion: l.emotion || 'calm', text: l.text, translation: l.translation || '' })), () => !this.closed);
    }
    /**
     * Album photos the phone drew, by where they were drawn (told apart by the name generateImage gives them):
     * {count, bytes, ids, sources: {draw|chat|peek|moments: {label, count, bytes, ids}}}. Imported photos are not here.
     */
    async generatedPhotos() {
        const rows = await this.library.listPhotos(), sources = {}, all = [];
        for (const [key, label, pattern] of DRAWN_SOURCES) {
            const mine = rows.filter(row => pattern.test(row.name || ''));
            sources[key] = { label, count: mine.length, bytes: mine.reduce((n, row) => n + (row.size || 0), 0), ids: mine.map(row => row.id) };
            all.push(...mine);
        }
        return { count: all.length, bytes: all.reduce((n, row) => n + (row.size || 0), 0), ids: all.map(row => row.id), sources };
    }
    /**
     * Deletes the drawn photos of the given sources (all when none are given). Whatever showed them lets go: a 朋友圈
     * post's picture and a 查手机 photo go back to «not drawn» (they can be drawn again), an avatar or a chat background
     * that used one goes back to the default.
     */
    async deleteGeneratedPhotos(sources = null) {
        const found = await this.generatedPhotos();
        const keys = Array.isArray(sources) && sources.length ? sources.filter(k => found.sources[k]) : Object.keys(found.sources);
        const gone = new Set(keys.flatMap(k => found.sources[k].ids));
        for (const id of gone) await this.library.deletePhoto(id);
        this.noteGone('photos', [...gone]);
        if (gone.size) await this.#forgetPhotos(gone);
        this.emit('library', { collection: 'photos' });
        this.emit('phone', { preferences: await this.getPhone() });
        return gone.size;
    }
    async #forgetPhotos(gone) {
        let posts = 0;
        for (const post of await this.moments.list()) {
            if (![post.photoId, ...(post.imageVersions || [])].some(id => gone.has(id))) continue;
            const imageVersions = [...new Set([...(post.imageVersions || []), post.photoId].filter(id => id && !gone.has(id)))];
            const photoId = gone.has(post.photoId) ? imageVersions.at(-1) || '' : post.photoId;
            await this.moments.setImage(post.id, photoId ? { photoId, imageVersions } : post.imageTags ? { photoId: '', imageVersions, imageState: 'failed', imageNote: '配图已清理' } : { photoId: '', imageVersions });
            posts++;
        }
        if (posts) this.emit('moments', {});
        // Photos in the phone chats: a drawn one can be drawn again; one of the album goes back to its words.
        for (const summary of await this.chats.list()) {
            await this.chatMutate(summary.id, async () => {
                const thread = await this.chats.get(summary.id);
                const hit = (thread?.messages || []).filter(m => m.kind === 'photo' && [m.photoId, ...(m.imageVersions || [])].some(id => gone.has(id)));
                for (const m of hit) {
                    const imageVersions = [...new Set([...(m.imageVersions || []), m.photoId].filter(id => id && !gone.has(id)))];
                    const photoId = gone.has(m.photoId) ? imageVersions.at(-1) || '' : m.photoId;
                    await this.chats.updateMessage(thread.id, m.id, {photoId, imageVersions, imageState: photoId ? 'done' : 'failed', imageNote: photoId ? '' : '图片已清理'});
                }
                if (hit.length) this.emit('chat', { threadId: thread.id });
            });
        }
        const snaps = (await this.apps.list('peek')).filter(doc => [...(doc.photos || []), doc.wallpaper].some(p => p && gone.has(p.photoId)));
        const strip = p => { if (!p || !gone.has(p.photoId)) return p; const { photoId, state, note, ...rest } = p; return rest; };
        if (snaps.length) await this.appsMutate('peek', () => this.apps.put(snaps.map(doc => ({ ...doc, photos: (doc.photos || []).map(strip), ...(doc.wallpaper ? { wallpaper: strip(doc.wallpaper) } : {}) }))));
        const next = this.getState(), avatars = { ...next.chat.avatars };
        let changed = false;
        for (const [key, a] of Object.entries(avatars)) if (a.kind === 'photo' && gone.has(a.photoId)) { delete avatars[key]; changed = true; }
        if (gone.has(next.chat.profile.backgroundPhoto)) { next.chat.profile = { ...next.chat.profile, backgroundPhoto: '' }; changed = true; }
        if (changed) { next.chat.avatars = avatars; this.save(next); }
    }
    /** The shared cloud queue from the drawing settings, or null when it is off or incomplete. */
    cloudQueue() {
        const c = this.settings.draw.queue.cloud;
        if (!c.enabled || !c.url) return null;
        if (c.kind === 'keyhash') {
            if (!(this.cloud instanceof KeyHashQueue) || !this.cloud.matches(c)) this.cloud = new KeyHashQueue(c, { keyHash: () => this.naiKeyHash() });
            return this.cloud;
        }
        if (!validRoom(c.room)) return null;
        if (!(this.cloud instanceof CloudQueue) || !this.cloud.matches(c)) this.cloud = new CloudQueue(c);
        return this.cloud;
    }
    /** SHA-256 of the NovelAI key, for queues that group people by key. Cached per key. */
    async naiKeyHash() {
        const key = this.novelai.key;
        if (!key) return '';
        if (this.keyHashFor !== key) { this.keyHashValue = await sha256Hex(key); this.keyHashFor = key; }
        return this.keyHashValue;
    }
    /** Checks the cloud queue address and room: {ok, length, holder} or {ok: false, message}. */
    async testCloudQueue(value) {
        const c = { ...this.settings.draw.queue.cloud, ...clone(value || {}) };
        try {
            const queue = c.kind === 'keyhash' ? new KeyHashQueue(c, { keyHash: () => this.naiKeyHash() }) : new CloudQueue(c);
            const s = await queue.status();
            return { ok: true, length: s.length, holder: s.holder, cooldown: s.cooldown };
        }
        catch (error) { return { ok: false, message: error.message }; }
    }
    async base64(blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer()); let text = '';
        for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(text);
    }
    /** Keeps a reference audio (Fish) or clone sample (MiMo). wav: MiMo takes only mp3 and wav, so anything else
     *  (an iPhone recording is m4a) is decoded here and kept as a mono wav. */
    async reference(file, { wav = false } = {}) {
        const plain = /wav|wave|mpeg|mp3/i.test(file?.type || '') || /\.(wav|mp3)$/i.test(file?.name || '');
        if (wav && file && !plain) {
            let samples;
            try { samples = await decodeMono(globalThis, file, 24000); } catch { throw Error('这个音频读不出来，请换成 mp3 或 wav'); }
            file = new File([encodeWav(samples, 24000)], String(file.name || '样本').replace(/\.[^.]+$/, '') + '.wav', { type: 'audio/wav' });
        }
        const record = await this.library.saveReference({ name: file?.name || '参考音频', blob: file });
        const audio = await this.base64(file);
        this.assertOpen();
        this.providers.references.set(record.id, audio);
        return record.id;
    }
    async deleteReference(id) {
        const next = this.getState();
        next.connections.fish.params.references = next.connections.fish.params.references.filter(reference => reference.audio !== id);
        next.connections.mimo.params.samples = next.connections.mimo.params.samples.filter(sample => sample.audio !== id);
        this.save(next); await this.library.deleteReference(id); this.providers.references.delete(id);
    }
    getEngineSchema(engine, connection = this.settings.connections[engine]) {
        engineCheck(engine); modelCheck(engine, connection.model);
        const current = clone(connection); TTSParameters.normalize(engine, current);
        const catalog = clone(TTSParameters.catalogs[engine]);
        catalog.models = catalog.models.map(id => ({ id, supported: true, reason: '' }));
        // Models only on Fish's own /v1/tts: without a relay they go through the tavern's proxy, which must be on.
        const native = engine === 'fish' && TTSParameters.fishBase(current) === FISH_API ? catalog.models.filter(m => TTSParameters.fishNative({ ...current, model: m.id })).map(m => m.id) : [];
        catalog.modelNote = native.length && tauriTavern() ? `${native.join('、')} 现在只在 Fish 自己的接口上，网页不能直接调用。TauriTavern 现在还没有酒馆的转发功能，要在下面的「中转」里填一个 Fish 格式的中转才能用这个模型；TauriTavern 以后加上转发，或者 Fish 把它放进网页能用的接口，就不用中转了。` : native.length ? `${native.join('、')} 现在只在 Fish 自己的接口上，网页不能直接调用，要借酒馆转发：在酒馆的 config.yaml 里把 enableCorsProxy 改成 true，然后重启酒馆（用中转的不用改）。Fish 把它放进网页能用的接口以后会自动直连。` : '';
        catalog.groups = catalog.groups.map(group => ({ ...group, fields: group.fields.map(field => ({
            ...field, ...(field.type === 'select' ? { options: TTSParameters.allowed(engine, field, current) } : {}),
            unavailable: TTSParameters.unavailable(engine, field, current),
            ...(field.key === 'references' ? { help: '参考音频保存在当前浏览器，按酒馆账户隔离。' } : {}),
            ...(field.key === 'samples' ? { help: '上传 mp3 或 wav（编码后不超过 10 MB），起个名字，角色的音色填这个名字。保存在当前浏览器，按酒馆账户隔离。' } : {}),
        })) }));
        return { engine, ...catalog, connection: current, tags: TTSParameters.tags(engine, current.model), tagNote: TTSParameters.tagNote(engine, current.model), sounds: current.model === 's1' && engine === 'fish' ? [...TTSParameters.vocab.FISH_S1_TONES, ...TTSParameters.vocab.FISH_S1_SOUNDS] : [], sourceDate: engine==='doubao'?'2026-10-18':'2026-09-30' };
    }
    audioInfo(audio) {
        return { key: audio.key, line: clone(audio.line), route: clone(audio.route), bytes: audio.blob.size, fromCache: audio.fromCache };
    }
    /** The audio of a favorite ({favorite: id}), a cached line ({key}) or a line as spoken now ({line}), with a file name. */
    async audioFile({ favorite, key, line } = {}) {
        this.assertOpen();
        if (favorite) {
            const row = await this.library.getFavorite(favorite);
            if (!row?.blob) throw Error('这段收藏已经不在了');
            return { blob: row.blob, name: audioName(row.role, row.translation || row.text) };
        }
        if (!key && line) key = await this.player.lineKey(line);
        const prepared = key && this.prepared?.key === key ? this.prepared : null;
        const record = prepared || !key ? null : await this.cache.getRecord(key);
        const blob = prepared?.blob || record?.blob;
        if (!blob?.size) throw Error('这句还没有生成语音，先播放一次再下载');
        const said = prepared?.line || record?.metadata?.line || line || {};
        return { blob, name: audioName(said.role, said.translation || said.text) };
    }
    async favoriteAudio(key) {
        this.assertOpen();
        const prepared = this.prepared?.key === key ? this.prepared : null;
        const row = prepared ? null : await this.cache.getRecord(key);
        const blob = prepared?.blob || row?.blob;
        if (!blob) throw Error('音频已不在缓存中，请先手动播放一次');
        const line = prepared?.line || row?.metadata?.line || {};
        const route = prepared?.route || row?.metadata?.route || {};
        if (!route.engine) throw Error('旧版缓存缺少角色信息，请先手动播放这句台词再收藏');
        const favorite = await this.library.saveFavorite({ id: 'audio-' + key, requestKey: key, blob, role: line.role || route.name || '未标注角色', text: line.text || '旧版缓存音频', translation: line.translation || '', engine: route.engine || '', model: route.model || '', voice: route.voice || '' });
        this.emit('library', { collection: 'favorites' });
        return favorite;
    }
    /**
     * 自己的接口 → 试一试: one line said with the first voice of the settings being edited (saved or not), so the
     * address, the body and the answer can be checked before any role uses them. {voice, bytes, type}.
     */
    async customTest(connection) {
        this.assertOpen();
        this.player.stop('试一试自己的接口');
        const unlock = Promise.resolve(this.player.sink.unlock?.());
        const c = clone(connection || this.settings.connections.custom), voice = (c.params?.voices || []).find(v => String(v.name || '').trim());
        const lang = languageCode(this.settings.general.defaultLanguage || 'zh').split('-')[0] || 'zh';
        const text = ({ zh: '你好，这是一句试音。', ja: 'こんにちは、テストです。', en: 'Hello, this is a test.', ko: '안녕하세요, 테스트입니다.' })[lang] || '你好，这是一句试音。';
        const request = buildRequest('custom', c, { voice: voice ? String(voice.name).trim() : '', language: lang }, { text, emotion: '' });
        // A first line may load the voice's model: as long as a line in the story may take (two minutes).
        const [blob] = await Promise.all([this.providers.synthesize(request, new AbortController().signal), unlock]);
        this.assertOpen();
        this.player.playBlob(blob, { speaker: voice ? String(voice.name).trim() : '自己的接口', engine: 'custom', line: { role: voice ? String(voice.name).trim() : '', text, translation: '', emotion: '' } });
        return { voice: voice ? String(voice.name).trim() : '', bytes: blob.size, type: blob.type };
    }
    async playFavorite(id) {
        this.assertOpen();
        // Unlock is called during the original click, before the database await.
        this.player.stop('准备播放收藏');
        const unlock = Promise.resolve(this.player.sink.unlock());
        const epoch = this.player.epoch;
        const [favorite] = await Promise.all([this.library.getFavorite(id), unlock]);
        this.assertOpen();
        if (epoch !== this.player.epoch) return;
        if (!favorite) throw Error('收藏不存在');
        this.player.playBlob(favorite.blob, { speaker: favorite.role, engine: favorite.engine, requestKey: favorite.requestKey,
            line: { role: favorite.role, text: favorite.text, translation: favorite.translation, emotion: '' } });
    }
    audition(route) {
        const temporary = this.getState();
        route = normalizeRoute(clone(route));
        if (!route.name?.trim() || isPlaceholderRole(route.name)) throw Error('请填写实际角色名');
        route.name = route.name.trim();
        temporary.routes = temporary.routes.filter(row => row.name !== route.name); temporary.routes.push(route);
        const revision = this.revision;
        const text = ({ zh: '雨还没停，再坐一会儿吧。', en: 'The rain has not stopped. Stay a little longer.', ja: '雨はまだ止んでいません。もう少しここにいましょう。', ko: '비가 아직 그치지 않았어요.' })[languageCode(route.language || temporary.general.defaultLanguage)] || 'Hello.';
        this.player.start([{ role: route.name, emotion: 'calm', text, translation: '' }], () => !this.closed && revision === this.revision, temporary);
    }
    async clearCache() {
        this.player.stop('缓存已清理'); this.prepared = null;
        await this.cache.clear(); this.assertOpen(); this.player.played.clear();
        this.emit('library', { collection: 'cache' }); return this.cache.stats();
    }
    async getPhone() { return { ...await this.library.getPhone(), theme: this.settings.theme }; }
    async savePhone(patch) {
        const { theme, ...local } = clone(patch);
        if (theme !== undefined && !['system', 'light', 'dark'].includes(theme)) throw Error('主题无效');
        const phone = await this.library.savePhone(local);
        if (theme !== undefined) this.save({ ...this.getState(), theme });
        this.assertOpen();
        this.player.setVolume(phone.volume);
        this.emit('phone', { preferences: { ...phone, theme: this.settings.theme } });
        return { ...phone, theme: this.settings.theme };
    }
    /** Deletes album photos; whatever showed them lets go (朋友圈 and 查手机 pictures go back to «not drawn»). */
    async deletePhotos(ids) {
        const gone = new Set((Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean));
        for (const id of gone) await this.library.deletePhoto(id);
        this.noteGone('photos', [...gone]);
        if (gone.size) await this.#forgetPhotos(gone);
        this.emit('library', { collection: 'photos' });
        this.emit('phone', { preferences: await this.getPhone() });
        return gone.size;
    }
    async mutateLibrary(collection, method, ...args) {
        const result = await this.library[method](...args.map(clone));
        if (method === 'deleteNote') this.noteGone('notes', [args[0]]);
        if (method === 'deletePhoto') this.noteGone('photos', [args[0]]);
        this.emit('library', { collection });
        if (method === 'deletePhoto') this.emit('phone', { preferences: await this.getPhone() });
        return result;
    }
    reportDiagnostic(source, detail, level = 'error') {
        if (this.closed) return;
        const value = detail && typeof detail.message === 'string' ? {message: detail.message, stack: detail.stack, name: detail.name, ...detail} : detail;
        const safe = this.requestLog.clean(value), name = String(source || '小手机').slice(0, 80);
        const signature = JSON.stringify([name, level, safe]);
        const now = Date.now();
        if (this.lastDiagnostic?.signature === signature && now - this.lastDiagnostic.at < 1500) return;
        this.lastDiagnostic = {signature, at: now};
        const id = this.requestLog.add(name, safe, ['info','warn','error'].includes(level) ? level : 'error');
        this.requestLog.finish(id, {recorded: true});
    }
    api() {
        const methods = {
            reportDiagnostic: (source, detail, level) => this.reportDiagnostic(source, detail, level),
            getRequestLogs: () => this.requestLog.list(), clearRequestLogs: () => this.requestLog.clear(),
            /** 系统提示词: one block as the user changed it ({enabled?, parts: {key: text}}), or null for the shipped one. */
            savePromptRule: (id, rule) => {
                const block = PROMPT_BLOCKS.find(b => b.id === id);
                if (!block && id !== 'legacy') throw Error('未知提示词');
                const next = this.getState(); next.promptRules = {...next.promptRules};
                if (rule === null) delete next.promptRules[id];
                else if (!rule || typeof rule !== 'object') throw Error('提示词格式无效');
                else next.promptRules[id] = clone(rule);
                next.promptRules = normalizePromptRules(next.promptRules);
                this.save(next);
            },
            getState: () => this.getState(), getSnapshot: () => this.getSnapshot(), save: (next, revision) => this.save(next, revision),
            updateGeneral: patch => this.updateGeneral(patch), saveNarration: patch => this.saveNarration(patch), saveVn: patch => this.saveVn(patch), vnCast: () => this.vnCast(), vnSpriteRequest: (name, options) => clone(spriteRequest(this.settings, String(name || ''), clone(options || {}))), saveRoute: route => this.saveRoute(route), saveVoicePool: list => this.saveVoicePool(clone(list)), deleteRoute: id => this.deleteRoute(id),
            switchRouteEngine, cleanAliases, validRoleName: name => typeof name === 'string' && !!name.trim() && !isPlaceholderRole(name),
            saveConnection: (engine, patch) => this.saveConnection(engine, patch),
            savePreset: preset => this.savePreset(preset), deletePreset: id => this.deletePreset(id), selectPreset: id => this.selectPreset(id),
            validatePreset: preset => { try { validatePreset(preset); return ''; } catch (error) { return message(error); } },
            previewPrompt: preset => this.previewPrompt(preset), promptPlan: () => clone(promptPlan(this.settings, modelRules(this.settings))), parse: text => this.parse(text),
            voiceBalance: (engine, refresh) => this.voiceBalance(engine, refresh), keyStatus: engine => this.keyStatus(engine), keyHint: engine => this.keyHint(engine), keyPool: engine => this.keyPool(engine), keyList: engine => this.keyList(engine), addKeys: (engine, value) => this.addKeys(engine, value), removeKey: (engine, index) => this.removeKey(engine, index), useKey: (engine, index) => this.useKey(engine, index), setKey: (engine, key) => this.setKey(engine, key), clearKey: engine => this.clearKey(engine),
            saveDraw: patch => this.saveDraw(patch), saveStyle: style => this.saveStyle(style), deleteStyle: id => this.deleteStyle(id),
            imageConnectionList: engine => this.imageConnectionList(engine), saveImageConnection: (engine, patch) => this.saveImageConnection(engine, patch), selectImageConnection: (engine, id) => this.selectImageConnection(engine, id), deleteImageConnection: (engine, id) => this.deleteImageConnection(engine, id),
            drawReady: () => this.drawReady(), drawMissing: () => this.drawMissing(), paidPrompt: () => this.paidPrompt(), comfyCatalog: url => this.comfyCatalog(url), comfyClips: options => this.comfyClips(options), comfyWorkflows: () => this.comfyWorkflows(), comfyWorkflow: name => this.comfyWorkflow(name),
            saveComfyWorkflow: patch => this.saveComfyWorkflow(patch), selectComfyWorkflow: id => this.selectComfyWorkflow(id), deleteComfyWorkflow: id => this.deleteComfyWorkflow(id),
            comfyLoraInfo: () => this.comfyLoraInfo(), editComfyLoras: change => this.editComfyLoras(clone(change || {})), restoreComfyWorkflow: () => this.restoreComfyWorkflow(),
            comfyLoras: options => this.comfyLoras(options),
            saveDrawPreset: preset => this.saveDrawPreset(preset), deleteDrawPreset: id => this.deleteDrawPreset(id), previewDrawPrompt: preset => this.previewDrawPrompt(preset),
            naiSubscription: refresh => this.naiSubscription(refresh), naiProbe: () => this.naiProbe(), fishCatalog: () => this.providers.fishCatalog(), fishProbe: () => { this.assertOpen(); keyCheck('fish'); return this.providers.probeFish(clone(this.settings.connections.fish)); },
            listVibes: () => this.listVibes(), compactVibes: () => this.compactVibes(), importVibes: (files, options) => this.importVibes(files, clone(options || {})), updateVibe: (id, patch) => this.updateVibe(id, clone(patch || {})), deleteVibe: id => this.deleteVibe(id), deleteVibes: ids => this.deleteVibes([...(ids || [])]), exportVibes: target => this.exportVibes(clone(target || {})), vibePlan: model => clone(this.vibePlan(model || this.settings.draw.params.model)), drawQuote: (params, extra) => this.drawQuote(params, extra), naiTool: input => this.naiTool(clone(input || {})),
            generateImage: input => this.generateImage(input).then(({ blob, ...result }) => result),
            drawQueue: () => this.drawQueue.list(), cancelDraw: key => this.drawQueue.cancel(key), cancelAllDraws: () => this.drawQueue.cancelAll(),
            cloudQueueError: () => this.drawQueue.remoteError, testCloudQueue: value => this.testCloudQueue(value), newRoomCode: () => newRoomCode(),
            reference: (file, options) => this.reference(file, clone(options || {})), listReferences: () => this.library.listReferences(), deleteReference: id => this.deleteReference(id),
            engineSchema: (engine, connection) => this.getEngineSchema(engine, connection),
            validateConnection: (engine, connection) => { try { modelCheck(engine, connection.model); return TTSParameters.validate(engine, connection); } catch (error) { return message(error); } },
            voices: (engine, connection, query) => { engineCheck(engine); return this.providers.voices(engine, connection || this.settings.connections[engine], query); },
            previewRequest: (engine, connection, route, line) => { const request = buildRequest(engine, connection || this.settings.connections[engine], route, line, this.providers.references); if (request.body.provider?.options?.['fish-audio']?.references) for (const ref of request.body.provider.options['fish-audio'].references) ref.audio = '[本地参考音频]'; if (request.body.audio?.voice?.startsWith?.('data:')) request.body.audio.voice = '[本地克隆样本：' + route.voice + ']'; return request; },
            status: () => this.player.snapshot(), subscribe: listener => this.subscribe(listener), levels: () => this.player.sink.levels(),
            pendingRole: () => this.player.pending, stop: () => this.player.stop(), toggle: () => this.player.toggle(), resume: () => this.player.continuePending(),
            audition: route => this.audition(route), customTest: connection => this.customTest(clone(connection || null)), lineState: line => this.player.lineState(line),
            setVolume: value => this.savePhone({ volume: value }), getVolume: () => this.player.getVolume(),
            cacheStats: () => this.cache.stats(), clearCache: () => this.clearCache(), listAudio: () => this.cache.list(),
            deleteAudio: async key => { if (this.player.requestKey === key) this.player.stop('音频已删除'); if (this.prepared?.key === key) this.prepared = null; await this.cache.remove(key); this.emit('library', { collection: 'cache' }); },
            latestAudio: () => this.prepared ? this.audioInfo(this.prepared) : null,
            favoriteAudio: key => this.favoriteAudio(key), audioFile: ref => this.audioFile(ref),
            backupParts: () => ({ ...BACKUP_PARTS }), exportBackup: (parts, version, options) => typeof version === 'object' && version ? this.exportBackup(parts, '', version) : this.exportBackup(parts, version, options || {}), inspectBackup: file => this.inspectBackup(file), importBackup: (file, options) => this.importBackup(file, options), listFavorites: query => this.library.listFavorites(query),
            getFavorite: id => this.library.getFavorite(id), playFavorite: id => this.playFavorite(id),
            deleteFavorite: id => this.mutateLibrary('favorites', 'deleteFavorite', id),
            listPhotos: () => this.library.listPhotos(), addPhoto: value => this.mutateLibrary('photos', 'addPhoto', value),
            getPhoto: id => this.library.getPhoto(id), deletePhoto: id => this.deletePhotos([id]).then(n => n > 0), deletePhotos: ids => this.deletePhotos(ids),
            listNotes: () => this.library.listNotes(), saveNote: value => this.mutateLibrary('notes', 'saveNote', value), deleteNote: id => this.mutateLibrary('notes', 'deleteNote', id),
            getPhone: () => this.getPhone(), savePhone: patch => this.savePhone(patch), libraryStats: () => this.library.stats(), storageBudget: () => this.budget.read(),
            generatedPhotos: () => this.generatedPhotos().then(({ count, bytes, sources }) => ({ count, bytes, sources: Object.fromEntries(Object.entries(sources).map(([k, { ids, ...rest }]) => [k, rest])) })), deleteGeneratedPhotos: sources => this.deleteGeneratedPhotos(sources),
            saveMoments: patch => this.saveMoments(clone(patch)), saveCalls: patch => this.saveCalls(clone(patch)),
            saveAssistant: patch => this.saveAssistant(patch), assistantThreads: () => this.assistantThreads(), assistantThread: id => this.assistantThread(id),
            newAssistantThread: () => this.newAssistantThread(), appendAssistantMessage: (id, value, expectedLastId, expectedRevision) => this.appendAssistantMessage(id, value, expectedLastId, expectedRevision),
            renameAssistantThread: (id, title) => this.renameAssistantThread(id, title),
            editAssistantMessage: (id, mid, text, expectedText) => this.editAssistantMessage(id, mid, text, expectedText),
            deleteAssistantMessage: (id, mid) => this.deleteAssistantMessage(id, mid),
            selectAssistantVariant: (id, mid, selected) => this.selectAssistantVariant(id, mid, selected),
            deleteAssistantThread: id => this.deleteAssistantThread(id), clearAssistantThread: id => this.clearAssistantThread(id),
            assistantMemoryBook: id => this.assistantMemoryBook(id),
            assistantMemoryEdit: (id, nodeId, text) => {
                const value = String(text ?? '').trim();
                if (value.length < 2 || value.length > 6000) throw Error('记忆内容请填写 2–6000 个字符');
                return this.assistantMemoryRevise(id, book => { const node = book.nodes.find(n => n.id === nodeId); if (!node) throw Error('这条记忆已经不在了'); node.text = value; node.edited = true; return book; });
            },
            assistantMemoryRemove: (id, nodeId) => this.assistantMemoryRevise(id, book => removeNode(book, nodeId)),
            assistantMemoryForget: id => this.assistantMemoryForget(id),
            saveMusic: patch => this.saveMusic(clone(patch || {})), searchMusic: (query, sourceId) => this.searchMusic(query, clone(sourceId)), musicLink: (sourceId, songId, hint) => this.musicLink(clone(sourceId), songId, clone(hint || {})), musicLyric: (sourceId, songId, hint) => this.musicLyric(sourceId, songId, clone(hint || {})),
            listSongs: () => this.listSongs(), songBlob: id => this.songBlob(id), addSongs: list => this.addSongs(list), updateSong: (id, patch) => this.updateSong(id, clone(patch || {})), deleteSongs: ids => this.deleteSongs([...(ids || [])]),
            saveSounds: patch => this.saveSounds(clone(patch)), listSounds: () => this.listSounds(), soundBlob: id => this.soundBlob(id), addSounds: list => this.addSounds(list), updateSound: (id, patch) => this.updateSound(id, clone(patch || {})), deleteSounds: ids => this.deleteSounds([...(ids || [])]),
            packInfo: () => this.packInfo(), soundMissing: () => this.soundMissing(), dismissMissing: (type, name) => this.dismissMissing(type, name), generateSound: input => this.generateSound(clone(input || {})), exportSounds: (ids, name) => this.exportSounds(ids ? [...ids] : null, name), importSounds: (file, options) => this.importSounds(file, clone(options || {})),
            saveText: patch => this.saveText(clone(patch)), setTextKey: (id, key) => this.setTextKey(id, key), clearTextKey: id => this.clearTextKey(id), textKeyHint: id => this.textKeyHint(id), textModels: draft => this.textModels(clone(draft || {})),
            syncStatus: () => this.syncStatus(), saveSync: patch => this.saveSync(clone(patch)), syncNow: () => this.syncNow().then(() => this.syncStatus()), clearSyncFiles: () => this.clearSyncFiles(),
            listMoments: async () => { const here = this.here(); return (await this.moments.list()).filter(p => inSpace(p, here)); }, getMoment: id => this.moments.get(id),
            postMoment: ({ text, photoId } = {}) => this.momentsMutate(async () => (await this.moments.add([{ author: 'me', source: 'me', text, photoId, space: this.cardKey() }]))[0]),
            likeMoment: (id, on = true) => this.momentsMutate(() => this.moments.like(id, 'me', on)),
            // One of the pictures drawn for a post becomes the one shown.
            momentsPickImage: (id, photoId) => this.momentsMutate(async () => { const post = await this.moments.get(id); if (!post || ![post.photoId, ...(post.imageVersions || [])].includes(photoId)) throw Error('这张配图已经不在了'); return this.moments.setImage(id, { photoId }); }),
            commentMoment: (id, { text, to } = {}) => this.momentsMutate(() => this.moments.comment(id, { from: 'me', text, to })),
            deleteMoment: id => this.momentsMutate(async () => { const done = await this.moments.remove(id); this.noteGone('moments', [id]); return done; }), deleteMomentComment: (id, commentId) => this.momentsMutate(async () => { const post = await this.moments.removeComment(id, commentId); this.noteGone('moments', [`${id}/${commentId}`]); return post; }),
            clearMoments: () => this.momentsMutate(() => this.dropping('moments', () => this.moments.list(), () => this.clearHere(() => this.moments.list(), id => this.moments.remove(id), () => this.moments.clear()))),
            listForum: async () => { const here = this.here(); return (await this.apps.list('forum')).filter(p => inSpace(p, here)); }, getForumPost: id => this.apps.get(id),
            forumHot: async () => (await this.apps.get(this.hotId()))?.topics || [],
            postForum: async ({ title = '', text = '' } = {}) => (await this.addForumPosts([{ author: 'me', title, text }], { source: 'me' }))[0],
            replyForum: async (id, { text, to } = {}) => { const post = await this.addForumReplies(id, [{ from: 'me', text, to }]); return { post, reply: post.replies.at(-1) }; },
            likeForum: (id, on = true) => this.appsMutate('forum', () => this.apps.change(id, post => { if (post.liked === !!on) return; post.liked = !!on; post.likes = Math.max(0, post.likes + (on ? 1 : -1)); })),
            deleteForumReply: (id, replyId) => this.appsMutate('forum', () => this.apps.change(id, post => { post.replies = post.replies.filter(r => r.id !== replyId); })),
            deleteForum: id => this.appsMutate('forum', () => this.apps.remove(id)),
            clearForum: () => this.appsMutate('forum', async () => { const n = await this.clearHere(() => this.apps.list('forum'), id => this.apps.remove(id), () => this.apps.clear('forum')); await this.apps.remove(this.hotId()); return n; }),
            // 查手机: the open card's snapshot of a person, else the shared one from before 分区.
            listPeeks: async () => { const here = this.here(); return (await this.apps.list('peek')).filter(p => inSpace(p, here)); },
            getPeek: async name => (await this.apps.get(peekId(name, this.spaceKey()))) || (this.spaceKey() ? this.apps.get(peekId(name)) : null),
            deletePeek: name => this.appsMutate('peek', async () => { await this.apps.remove(peekId(name, this.spaceKey())); if (this.spaceKey()) await this.apps.remove(peekId(name)); return true; }),
            /** 分区: the card open now ({key, name}) and whether 分区 is on. */
            phoneSpace: () => ({ ...clone(this.space), on: !!this.here() }),
            saveChatPreset: preset => this.saveChatPreset(preset), deleteChatPreset: id => this.deleteChatPreset(id), selectChatPreset: id => this.selectChatPreset(id),
            previewChatPrompt: preset => this.previewChatPrompt(preset), validateChatPreset: preset => { try { validateChatPreset(normalizeChatPreset(clone(preset))); return ''; } catch (error) { return message(error); } },
            saveChatOptions: patch => this.saveChatOptions(clone(patch)),
            wallet: () => this.wallet(), buyDecoration: (kind, key) => this.buyDecoration(kind, key), saveGift: gift => this.saveGift(gift), deleteGift: id => this.deleteGift(id),
            sendPaid: (threadId, message) => this.sendPaid(threadId, message), takeSent: (threadId, messageId, accept) => this.takeSent(threadId, messageId, accept !== false),
            shopCatalog: () => clone({ premium: PREMIUM, kinds: DECOR_KINDS, gifts: shopGifts(this.settings.chat.wallet), ledgerKinds: LEDGER_KINDS }), saveContact: contact => this.saveContact(contact), deleteContact: id => this.deleteContact(id), chatContacts: all => clone(all ? chatContacts(this.settings) : this.contacts()), addRoleContact: name => this.addRoleContact(name),
            listThreads: () => this.threads(), getThread: id => this.chats.get(id), chatUnread: async () => (await this.threads()).reduce((n, t) => n + (t.muted ? 0 : t.unread), 0),
            createThread: value => this.chatMutate(null, () => this.chats.create({ ...clone(value), space: this.cardKey() })),
            updateThread: (id, patch) => this.chatMutate(id, () => this.chats.update(id, clone(patch))),
            deleteThread: id => this.chatMutate(id, async () => { const done = await this.chats.remove(id); this.noteGone('chats', [id]); await this.memoryForget(id).catch(() => {}); return done; }),
            // 记忆: what a chat remembers; a summary can be corrected or deleted (what it covered is used again).
            memoryBook: threadId => this.memoryBook(threadId),
            memoryEdit: (threadId, nodeId, text) => { const value = String(text ?? '').trim(); if (value.length < 2) throw Error('写点内容再保存'); return this.memoryChange(threadId, book => { const node = book.nodes.find(n => n.id === nodeId); if (!node) throw Error('这条记忆已经不在了'); node.text = value; node.edited = true; return book; }); },
            memoryRemove: (threadId, nodeId) => this.memoryChange(threadId, book => removeNode(book, nodeId)),
            memoryForget: threadId => this.memoryForget(threadId),
            saveEmbed: patch => this.saveEmbed(clone(patch)), embedReady: () => this.embedReady(), embedModels: draft => this.embedModels(clone(draft || {})),
            gptModels: () => this.gptModels(),
            embedTest: async draft => { const [v] = await this.embed(['测试一下向量模型'], clone(draft || {})); return v.length; },
            appendChat: (id, messages, options) => { this.assertOpen(); return this.appendChat(id, clone(messages), clone(options || {})); },
            unfriend: name => this.unfriend(name), refriend: threadId => this.refriend(threadId),
            deleteChatMessages: (id, ids) => this.chatMutate(id, async () => { const before = await this.chats.get(id); const thread = await this.chats.removeMessages(id, clone(ids)); this.noteGone('chats', (ids || []).map(m => `${id}/${m}`)); await this.memoryAfterDelete(id, before, thread).catch(() => {}); return thread; }),
            updateChatMessage: (id, messageId, patch) => this.chatMutate(id, () => this.chats.updateMessage(id, messageId, clone(patch || {}))),
            markThreadRead: id => this.chatMutate(id, () => this.chats.markRead(id)),
            speak: line => this.speak(clone(line)), voiceFormat: () => this.voiceFormat(),
        };
        return Object.freeze({ apiVersion: BACKEND_API_VERSION, defaultPrompt: DEFAULT_PROMPT, defaultFormat: DEFAULT_FORMAT,
            picTagFormat: PIC_TAG_FORMAT, defaultDrawRule: DEFAULT_DRAW_RULE, drawCountMax: DRAW_COUNT_MAX, defaultChatPreset: Object.freeze((({ id, ...rest }) => rest)(defaultChat().presets[0])),
            // The shipped presets of each kind, without ids: for 恢复默认 in the preset app.
            defaultVoicePreset: Object.freeze((({ id, ...rest }) => rest)(freshState().presets[0])), defaultDrawPreset: Object.freeze((({ id, ...rest }) => rest)(defaultDraw().presets[0])),
            drawCatalog: Object.freeze({ models: NAI_MODELS, modelNames: NAI_MODEL_NAMES, samplers: NAI_SAMPLERS, schedules: NAI_SCHEDULES, engines: DRAW_ENGINES, engineNames: DRAW_ENGINE_NAMES, gptModels: GPT_IMAGE_MODELS, gptQualities: GPT_QUALITIES, comfyWorkflow: DEFAULT_COMFY_WORKFLOW }),
            phoneCatalog: Object.freeze({ apps: PHONE_APPS, wallpapers: PHONE_WALLPAPERS, glyphs: PHONE_GLYPHS, skins: PHONE_SKINS }),
            ...Object.fromEntries(Object.entries(methods).map(([name, fn]) => [name, (...args) => { if(name==='reportDiagnostic'&&this.closed)return; this.assertOpen(); const failed = error => { if (!['reportDiagnostic','getRequestLogs','clearRequestLogs'].includes(name)) this.reportDiagnostic('小手机操作', {operation: name, message: error?.message || String(error), stack: error?.stack}, error?.name === 'AbortError'||error?.operation==='subscription' ? 'warn' : 'error'); throw error; }; try { const result = fn(...args); return result?.catch ? result.catch(failed) : result; } catch (error) { return failed(error); } }])),
        });
    }
    async close() {
        if (this.closing) return this.closing;
        this.closed = true; this.prepared = null; this.listeners.clear(); this.providers.clear();
        this.chats.close();
        clearTimeout(this.syncTimer);
        this.moments.close();
        this.apps.close();
        this.memoryStore.close();
        this.sounds.close();
        this.music.close();
        this.drawQueue.cancelAll();
        this.closing = Promise.all([this.player.close(), this.cache.close(), this.library.close(), Promise.resolve(this.keyStore.flush?.()).then(() => this.keyStore.close?.())]);
        await this.closing;
    }
}
installDrawSettings(TTSBackend);
