// 写歌 in the backend (core/backend.js): the drafts, kept with the music, and singing them. A song is sung here in the tavern page, so it goes
// on while the phone is put away; what comes back is one more file song in the 歌单. Methods of TTSBackend, kept in a file of their own
// (installSongs puts them on its prototype).
import { SONG_LIMITS, songDraft, estimateLrc, songLength } from './song.js';
import { singSong, singPrice, singTakesLength, checkSongComfy, stopComfySong, SING_ENGINES, SING_NAMES, SING_RESUMES, SONG_KEYS } from './song-engines.js';
import { audioOutput, describeSongWorkflow } from './song-comfy.js';
import { parseWorkflow, uiToApi, uiNodeTypes } from './comfy-graph.js';
import { comfyRecent } from './image-engines.js';
import { miniBase } from './providers.js';

const clone = value => structuredClone(value);
const USER_FIELDS = ['title', 'style', 'lyrics', 'instrumental', 'language', 'who', 'about', 'seconds'];
/** How long a sound file plays, in seconds; 0 when the browser cannot say. */
function playLength(blob) {
    const Audio = globalThis.Audio, urls = globalThis.URL;
    if (!Audio || !urls?.createObjectURL) return Promise.resolve(0);
    return new Promise(resolve => {
        const url = urls.createObjectURL(blob), a = new Audio();
        const end = value => { clearTimeout(timer); urls.revokeObjectURL(url); resolve(Number.isFinite(value) && value > 0 ? value : 0); };
        const timer = setTimeout(() => end(0), 8000);
        a.preload = 'metadata'; a.onloadedmetadata = () => end(a.duration); a.onerror = () => end(0); a.src = url;
    });
}

class Songs {
    songJobs() { return this.jobsOfSongs ??= new Map(); }
    /** A key for singing: a card of its own in 引擎, or what the voice card of the same service holds. */
    songKey(engine) { return SONG_KEYS.includes(engine) ? this.songKeys[engine] || '' : engine === 'eleven' || engine === 'mini' ? this.providers.currentKey(engine) || '' : ''; }
    singModel(engine) { const s = this.settings.music.sing; return engine === 'lyria' ? s.lyriaModel : engine === 'replicate' ? s.replicateModel : ''; }
    singReady(engine) { return engine === 'comfy' ? this.settings.music.sing.comfyOn || this.settings.draw.engine === 'comfy' || this.settings.draw.comfy.url !== 'http://127.0.0.1:8188' : !!this.songKey(engine); }
    /** Who can sing this song, about what it costs each, and whether the length asked for reaches it (timed). */
    singOptions(draft = {}) {
        const row = songDraft(draft), seconds = songLength(row);
        return SING_ENGINES.map(id => { const model = this.singModel(id); return { id, name: SING_NAMES[id], ready: this.singReady(id), model, price: singPrice(id, { model, seconds }), timed: singTakesLength(id, { model, instrumental: row.instrumental }) }; });
    }
    /** A draft as the phone sees it: one marked as being sung with nothing singing it here was left behind (the page closed, another device). */
    draftView(row) {
        if (!row || row.state !== 'singing' || this.songJobs().has(row.id)) return row;
        const { state, job, ...rest } = row;
        return { ...rest, note: rest.note || '上次没做完就断了，可以再做一次' };
    }
    async listSongDrafts() { this.assertOpen(); return (await this.music.list('draft')).map(row => this.draftView(row)); }
    async getSongDraft(id) { this.assertOpen(); const row = await this.music.get(id); return row?.kind === 'draft' ? this.draftView(row) : null; }
    /** Keeps what the user or the text model wrote: a new draft, or (id) changes to one; where its singing stands is not touched. */
    async saveSongDraft(value = {}) {
        this.assertOpen();
        const old = value.id ? await this.music.get(value.id) : null;
        if (!old) {
            if ((await this.music.list('draft')).length >= SONG_LIMITS.drafts) throw Error(`写的歌最多留 ${SONG_LIMITS.drafts} 首，先删掉一些`);
            const row = songDraft({ ...Object.fromEntries(USER_FIELDS.map(k => [k, value[k]])), id: value.id });
            await this.music.put([row]);
            this.emit('music', { draft: row.id });
            return row;
        }
        const row = await this.music.change(old.id, d => { Object.assign(d, songDraft({ ...d, ...Object.fromEntries(USER_FIELDS.filter(k => k in value).map(k => [k, value[k]])) })); });
        this.emit('music', { draft: row.id });
        return this.draftView(row);
    }
    /** Drafts go; the songs made from them stay in the 歌单. */
    async deleteSongDrafts(ids) {
        this.assertOpen();
        for (const id of ids) { this.songJobs().get(id)?.control.abort(); await this.music.remove(id); }
        this.noteGone('music', ids);
        this.emit('music', { draft: ids[0] || '' });
        return true;
    }
    /** Stops waiting for a song. What was already asked of the service may still be charged. */
    cancelSing(id) {
        const job = this.songJobs().get(id);
        job?.control.abort();
        // On one's own ComfyUI a song given up on stops taking the computer's time.
        if (job?.engine === 'comfy' && job.task) { const c = this.settings.draw.comfy; stopComfySong({ fetch: this.songFetch, url: c.url, transport: c.loraTransport, task: job.task }).catch(() => {}); }
        return true;
    }
    /**
     * Sings a draft and puts the song in the 歌单. A song that costs money needs allowPaid (code PAID otherwise, the message saying about how
     * much): the phone asks first. Resolves when it is done; the phone does not wait.
     */
    async singDraft(id, { engine = '', allowPaid = false } = {}) {
        this.assertOpen();
        const draft = await this.getSongDraft(id);
        if (!draft) throw Error('这首歌已经不在了');
        if (this.songJobs().has(id)) throw Error('这首正在唱');
        if (!SING_ENGINES.includes(engine)) throw Error('先选一家来唱');
        if (!draft.instrumental && !draft.lyrics.trim()) throw Error('还没有歌词，写好了再唱');
        if (engine !== 'comfy' && !this.singReady(engine)) throw Error(`先在「引擎 → ${SING_NAMES[engine]}」填上密钥`);
        const model = this.singModel(engine), price = singPrice(engine, { model, seconds: songLength(draft) });
        if (!price.free && !allowPaid) throw Object.assign(Error(price.text), { code: 'PAID' });
        this.saveMusic({ sing: { engine } });
        return this.runSong(draft, { engine, model });
    }
    /** What a song goes with once it has come: a song row, its lyrics, a place in its draft. */
    async keepSong(id, draft, blob, lyric = '') {
        const n = draft.songs.length, seconds = lyric || draft.instrumental ? 0 : await playLength(blob) || songLength(draft);
        const { ids } = await this.storeSongs([{ title: (draft.title || '没有名字的歌') + (n ? ` · 第 ${n + 1} 版` : ''), artist: draft.who || '自己写的', blob, lyric: lyric || (draft.instrumental ? '' : estimateLrc(draft.lyrics, seconds)) }]);
        await this.music.change(id, d => { d.songs = [...(d.songs || []), ...ids].slice(-SONG_LIMITS.versions); d.updatedAt = Date.now(); delete d.state; delete d.job; delete d.note; });
        return ids[0];
    }
    async runSong(draft, { engine, model, task = '' }) {
        const id = draft.id, control = new AbortController(), job = { control, closing: false, engine, task };
        this.songJobs().set(id, job);
        try {
            await this.music.change(id, d => { d.state = 'singing'; d.job = { engine, model, task, at: Date.now() }; delete d.note; });
            this.emit('music', { draft: id });
            const c = this.settings.draw.comfy, s = this.settings.music.sing, own = s.comfyOwn && s.comfyWorkflow;
            const request = { title: draft.title, style: draft.style, lyrics: draft.lyrics, instrumental: draft.instrumental, language: draft.language, seconds: songLength(draft), model,
                url: engine === 'lyria' ? this.settings.music.sing.lyriaUrl : engine === 'comfy' ? c.url : engine === 'mini' ? miniBase(this.settings.connections.mini) : '', transport: c.loraTransport, ...(engine === 'comfy' && own ? { workflow: s.comfyWorkflow, map: s.comfyMap } : {}) };
            const result = await singSong(engine, request, { fetch: this.songFetch, key: this.songKey(engine), signal: control.signal, task,
                onStep: (done, of) => this.emit('music', { draft: id, step: [done, of] }),
                onTask: (taskId, used) => { job.task = taskId; this.music.change(id, d => { if (d.job) { d.job.task = taskId; if (used) d.job.model = used; } }).catch(() => {}); } });
            // A second tab of this tavern goes back to the same job: whoever gets here first keeps the song.
            if (!await this.music.change(id, d => { if (!d.job) throw Error('taken'); delete d.job; }).then(() => true, () => false)) { this.emit('music', { draft: id }); return null; }
            const songId = await this.keepSong(id, { ...draft, lyrics: draft.lyrics || result.words || '' }, result.blob, result.lyric);
            this.ledger.song(engine);
            this.emit('music', { draft: id });
            this.notify(`「${draft.title || '写的歌'}」做好了，在歌单里`);
            return songId;
        } catch (error) {
            // The page closing: what the service is doing can be picked up next time.
            if (job.closing) return null;
            const cancelled = control.signal.aborted;
            await this.music.change(id, d => { delete d.state; delete d.job; if (cancelled) delete d.note; else d.note = String(error.message || error).slice(0, 400); }).catch(() => {});
            this.emit('music', { draft: id });
            if (!cancelled) this.notify(`「${draft.title || '写的歌'}」没做成：${error.message}`);
            return null;
        } finally { this.songJobs().delete(id); }
    }
    /** A song made elsewhere (Suno's site) comes back to its draft: into the 歌单, with these words at estimated times. */
    async importSongFile(id, file) {
        this.assertOpen();
        const draft = await this.getSongDraft(id);
        if (!draft) throw Error('这首歌已经不在了');
        const songId = await this.keepSong(id, draft, file);
        this.emit('music', { draft: id });
        return songId;
    }
    /** After a reload: what a service was still working on is waited for again, since it was paid for; the rest is shown as left behind. */
    async resumeSongs() {
        for (const row of await this.music.list('draft')) {
            const job = row.job;
            if (row.state !== 'singing' || this.songJobs().has(row.id) || !job?.task || !SING_RESUMES.includes(job.engine) || (job.engine !== 'comfy' && !this.songKey(job.engine))) continue;
            this.runSong(row, { engine: job.engine, model: job.model, task: job.task }).catch(() => {});
        }
    }
    /** ComfyUI for singing, looked at: what it would use, or why it cannot. */
    async songComfyCheck() {
        this.assertOpen();
        const c = this.settings.draw.comfy, s = this.settings.music.sing;
        return checkSongComfy({ fetch: this.songFetch, url: c.url, transport: c.loraTransport, ...(s.comfyOwn && s.comfyWorkflow ? { workflow: s.comfyWorkflow, map: s.comfyMap } : {}) });
    }
    /** A workflow of one's own, read from any of its JSON forms: {workflow (the API's form), …what it takes}. */
    async prepareSongWorkflow({ text } = {}) {
        this.assertOpen();
        const parsed = parseWorkflow(text);
        let graph = parsed.api;
        if (parsed.ui) {
            let specs = {};
            try { specs = await this.comfyNodeSpecs({ types: uiNodeTypes(parsed.ui) }); } catch { /* the file itself may name them */ }
            try { graph = uiToApi(parsed.ui, specs); }
            catch (error) { throw Error(`${error.message}。连上 ComfyUI 再导入，或者在 ComfyUI 里用「导出 (API)」（Export (API)）重新导出`); }
        }
        if (!audioOutput(graph)) throw Error('这个工作流没有保存音频的节点：它是画图的吗？写歌要能出音频的工作流');
        const workflow = JSON.stringify(graph);
        if (workflow.length > 300000) throw Error('这个工作流太大了');
        return { workflow, ...describeSongWorkflow(graph) };
    }
    /** What ComfyUI made lately that came out as sound: [{id, label, graph}]. */
    async songRecentRuns() {
        this.assertOpen();
        const c = this.settings.draw.comfy, runs = await comfyRecent({ fetch: this.imageFetch, url: c.url, transport: c.loraTransport });
        return runs.filter(run => audioOutput(run.graph)).map(run => { const words = describeSongWorkflow(run.graph).fields[0]?.text; return { id: run.id, label: words || run.id.slice(0, 8), graph: JSON.stringify(run.graph) }; });
    }
    /** The page is going: nothing more is asked, and what is being sung stays marked so it can be picked up. */
    stopSongs() { for (const job of this.songJobs().values()) { job.closing = true; job.control.abort(); } }
}

/** Puts the methods on the backend's prototype, as if written in its class (not enumerable). */
export function installSongs(target) {
    for (const name of Object.getOwnPropertyNames(Songs.prototype)) if (name !== 'constructor') Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(Songs.prototype, name));
}
export const songFacade = backend => ({
    listSongDrafts: () => backend.listSongDrafts(), getSongDraft: id => backend.getSongDraft(String(id)), saveSongDraft: value => backend.saveSongDraft(clone(value || {})),
    deleteSongDrafts: ids => backend.deleteSongDrafts([...ids].map(String)), singOptions: draft => backend.singOptions(clone(draft || {})),
    singDraft: (id, options) => backend.singDraft(String(id), clone(options || {})), cancelSing: id => backend.cancelSing(String(id)), importSongFile: (id, file) => backend.importSongFile(String(id), file),
    songComfyCheck: () => backend.songComfyCheck(), prepareSongWorkflow: source => backend.prepareSongWorkflow(clone(source || {})), songRecentRuns: () => backend.songRecentRuns()
});
