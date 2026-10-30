// The drawing settings of the backend (core/backend.js): ComfyUI workflows and their LoRAs, 绘图 settings, 画风
// (with the NovelAI parameters each one keeps), 绘图预设, the prompt preview, the NovelAI subscription and what a
// picture costs. Methods of TTSBackend, kept in a file of their own (installDrawSettings puts them on its prototype).
import { DRAW_ENGINES, normalizeGpt, gptBase, normalizeComfy, comfyUrl, checkWorkflow, workflowPlaceholders, COMFY_LIMITS, defaultWorkflow, COMFY_PARAM_KEYS, applyComfyWorkflow, comfyParams, comfySpecs, comfySavedList, comfySavedRead, comfyRecent, comfyUpload } from './image-engines.js';
import { readPictureWorkflow, parseWorkflow, uiToApi, uiNodeTypes, mapWorkflow, promptCandidates, promptWords, describeNodes, setNodeValues, switchNodesOff, findProblems, nodeTypes, modelKindOf } from './comfy-graph.js';
import { activeLoraWorkflow, normalizeDisabledLoras, inspectLoras, editLoras, pickLoraSource } from './comfy-loras.js';
import { relayUrl, guardParams, isFree, isV5, normalizeDrawParams, takesReference, REFERENCE_ANLAS } from './novelai.js';
import { PRESET_REV as DRAW_PRESET_REV, drawPromptPlan, planRequest, validateDrawPreset, normalizeDraw, normalizeVibeSettings, normalizeChunks, styleParams } from './draw.js';
import { activeChatPreset } from './chat.js';
import { VIBE_ANLAS } from './vibes.js';

const clone = value => structuredClone(value);
const BLANK_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
/** The scheme in use, ready to change: the built-in default stays as it is, so the first change makes a copy and switches to it. */
function ownScheme(c, stem) {
    let row = c.workflows.find(p => p.id === c.activeWorkflow), copied = false;
    if (row.id === 'default') {
        if (c.workflows.length >= COMFY_LIMITS.presets) throw Error(`最多保存 ${COMFY_LIMITS.presets} 套 ComfyUI 方案，请先删掉一套`);
        let name = stem, n = 2;
        while (c.workflows.some(p => p.name === name)) name = `${stem} (${n++})`;
        const workflow = defaultWorkflow(row);
        row = { ...clone(row), id: crypto.randomUUID(), name, workflow, sourceWorkflow: workflow, disabledLoras: [] };
        c.workflows.push(row); copied = true;
    }
    return { row, copied };
}

class DrawSettings {
    /**
     * The LoRAs of the ComfyUI scheme in use, as the drawing app lists them: each native LoRA node (name, strengths,
     * on or off, or why it cannot be edited here), where a new one would go (auto: '' when the user has to choose),
     * and whether the original workflow can be put back.
     */
    comfyLoraInfo() {
        const c = this.settings.draw.comfy, row = c.workflows.find(p => p.id === c.activeWorkflow), workflow = row.workflow || defaultWorkflow(row);
        const info = inspectLoras(workflow);
        // controls: the parameters the workflow leaves to the plugin (only these are shown); missing: what stops a picture.
        const controls = workflowPlaceholders(workflow).map(k => k === 'clip_skip' ? 'clipSkip' : k === 'clip_type' ? 'clipType' : k);
        return clone({ ...info, disabled: row.disabledLoras || [], auto: pickLoraSource(workflow), builtIn: row.id === 'default', restorable: !!row.sourceWorkflow && (row.sourceWorkflow !== row.workflow || !!row.disabledNodes?.length || !!row.output),
            controls, fills: workflowPlaceholders(workflow), modelKind: row.workflow ? modelKindOf(workflow) : '', missing: controls.includes('model') && !c.model ? '还没有选模型：在「参数」里读取模型列表再选一个' : '' });
    }
    /**
     * Changes the LoRAs of the scheme in use and saves it at once: {updates: [{id, lora_name?, strength_model?,
     * strength_clip?}], enabled: {id: on}, remove: id, add: {lora_name, strength_model, strength_clip, source?}}.
     * The built-in default scheme stays as it is: the first change makes a copy of it and switches to that copy.
     */
    editComfyLoras(change = {}) {
        this.assertOpen();
        const next = this.getState(), c = next.draw.comfy;
        const { row, copied } = ownScheme(c, '默认工作流 · LoRA');
        const add = change.add ? { ...change.add, source: change.add.source || pickLoraSource(row.workflow) } : undefined;
        if (add && !add.source) throw Error('这个工作流有好几条模型线路，请选一下 LoRA 接在哪里');
        row.workflow = editLoras(row.workflow, { updates: change.updates || [], remove: change.remove, add });
        const off = new Set(row.disabledLoras || []);
        for (const [id, on] of Object.entries(change.enabled || {})) { if (on) off.delete(id); else off.add(id); }
        if (change.remove !== undefined) off.delete(String(change.remove));
        row.disabledLoras = normalizeDisabledLoras(row.workflow, [...off]);
        activeLoraWorkflow(row.workflow, row.disabledLoras);
        applyComfyWorkflow(c, row.id);
        this.save(next);
        return { copied, name: row.name, info: this.comfyLoraInfo() };
    }
    /** What ComfyUI says of the node types in use, kept per address (fresh: after installing something). */
    async comfyNodeSpecs({ fresh = false, types, signal } = {}) {
        this.assertOpen();
        const c = this.settings.draw.comfy, row = c.workflows.find(p => p.id === c.activeWorkflow);
        if (fresh || this.comfySpecCache?.url !== c.url) this.comfySpecCache = { url: c.url, specs: {}, way: this.comfySpecCache?.url === c.url ? this.comfySpecCache.way : c.loraTransport };
        const cache = this.comfySpecCache, wanted = types || nodeTypes(row.workflow || defaultWorkflow(row)), missing = wanted.filter(t => !cache.specs[t]);
        if (missing.length) { const read = await comfySpecs({ fetch: this.imageFetch, url: c.url, transport: cache.way, types: missing, signal }); Object.assign(cache.specs, read.specs); cache.way = read.way; }
        return Object.fromEntries(wanted.filter(t => cache.specs[t]).map(t => [t, cache.specs[t]]));
    }
    /** Every node of the scheme in use, as the drawing app lists them (core/comfy-graph.js: describeNodes). */
    comfyNodeList() {
        const c = this.settings.draw.comfy, row = c.workflows.find(p => p.id === c.activeWorkflow);
        return clone(describeNodes(row.workflow || defaultWorkflow(row), { specs: this.comfySpecCache?.url === c.url ? this.comfySpecCache.specs : {}, off: row.disabledNodes || [], output: row.output || '' }));
    }
    /**
     * Changes the nodes of the scheme in use and saves it at once: {set: [{id, key, value}], off: {id: true/false},
     * output: a node's id or '', params: values for the 参数 page}. The built-in default is copied first, as for LoRAs.
     */
    editComfyNodes(change = {}) {
        this.assertOpen();
        const next = this.getState(), c = next.draw.comfy, { row, copied } = ownScheme(c, '默认工作流 · 修改');
        if (change.set?.length) row.workflow = setNodeValues(row.workflow, change.set);
        const off = new Set(row.disabledNodes || []);
        for (const [id, on] of Object.entries(change.off || {})) { if (on) off.add(id); else off.delete(id); }
        row.disabledNodes = [...off];
        if ('output' in change) row.output = String(change.output || '');
        if (change.params) Object.assign(row, comfyParams({ ...row, ...change.params }));
        // What would stop a picture is refused now, not when it is drawn.
        checkWorkflow(row.workflow); switchNodesOff(row.workflow, row.disabledNodes);
        applyComfyWorkflow(c, row.id);
        this.save(next);
        return { copied, name: row.name };
    }
    /**
     * Reads a workflow from what it came in (text: any of its JSON forms; buffer: a picture ComfyUI saved) and works out
     * which node takes what: {workflow, params, mapped, needsPrompt, candidates}. prompt: {id, key} when the user was asked.
     */
    async prepareComfyImport({ text, buffer, prompt } = {}) {
        this.assertOpen();
        let source = text;
        if (buffer) {
            const picture = await readPictureWorkflow(buffer);
            source = picture.prompt || picture.workflow;
            if (!source) throw Error('这张图里没有工作流：要用 ComfyUI 存下来的原图，发到别处压缩过的不行');
        }
        const parsed = parseWorkflow(source);
        // The text as it came when it is the graph: a workflow with %prompt% in it stays exactly as it is.
        let graph = parsed.wrapped ? parsed.api : source;
        if (parsed.ui) {
            let specs = {};
            try { specs = await this.comfyNodeSpecs({ types: uiNodeTypes(parsed.ui) }); } catch { /* the file itself may name them */ }
            try { graph = uiToApi(parsed.ui, specs); }
            catch (error) { throw Error(`${error.message}。连上 ComfyUI 再导入，或者在 ComfyUI 里用「导出 (API)」（Export (API)）重新导出`); }
        }
        const plan = mapWorkflow(graph, { prompt });
        return { ...plan, candidates: plan.needsPrompt ? promptCandidates(graph) : [] };
    }
    /** Workflows saved in ComfyUI itself, and what it drew lately ([{id, label, graph}]): both read like the LoRA list. */
    async comfySavedWorkflows() { this.assertOpen(); const c = this.settings.draw.comfy; return comfySavedList({ fetch: this.imageFetch, url: c.url, transport: c.loraTransport }); }
    async comfySavedWorkflow(name) { this.assertOpen(); const c = this.settings.draw.comfy; return comfySavedRead({ fetch: this.imageFetch, url: c.url, transport: c.loraTransport, name: String(name || '') }); }
    async comfyRecentRuns() {
        this.assertOpen();
        const c = this.settings.draw.comfy, runs = await comfyRecent({ fetch: this.imageFetch, url: c.url, transport: c.loraTransport });
        return runs.map(run => ({ id: run.id, label: promptWords(run.graph) || run.id.slice(0, 8), graph: JSON.stringify(run.graph) }));
    }
    /** A picture for a LoadImage node: goes into ComfyUI's input folder; answers the name to put in the node. */
    async comfyUploadPicture(file) {
        this.assertOpen();
        const kind = /^image\/(\w+)/.exec(file.type || '')?.[1] || 'png';
        return comfyUpload({ fetch: this.imageFetch, url: this.settings.draw.comfy.url, blob: file, name: file.name || `st-iphonie-${Date.now()}.${kind}` });
    }
    /**
     * What a workflow written for the tavern's own image generation also takes: the avatars of the chat in use, as
     * base64 (a blank pixel when there is none, as there), and the placeholders added there with their replacements.
     */
    async comfyTavernValues(workflow) {
        const values = {}, used = workflowPlaceholders(workflow), files = this.comfyPictures() || {};
        for (const [name, url] of [['char_avatar', files.character], ['user_avatar', files.user]]) {
            if (!used.includes(name)) continue;
            values[name] = BLANK_PIXEL;
            try {
                const response = url ? await this.assetFetch(url) : null;
                if (response?.ok) { const bytes = new Uint8Array(await response.arrayBuffer()); let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); values[name] = btoa(text); }
            } catch { /* the blank pixel, as in the tavern */ }
        }
        for (const { find, replace } of files.placeholders || []) if (find && !Object.hasOwn(values, find)) values[find] = String(replace ?? '');
        return values;
    }
    /** ComfyUI turned a workflow down and the tavern does not say why: looks for what it does not have. */
    async comfyRefusal(error, workflow, c) {
        try {
            const { specs } = await comfySpecs({ fetch: this.imageFetch, url: c.url, transport: this.comfySpecCache?.url === c.url ? this.comfySpecCache.way : c.loraTransport, types: nodeTypes(workflow) });
            const problems = findProblems(workflow, specs);
            if (problems.length) return Object.assign(Error('ComfyUI 没接受这个工作流：' + problems.slice(0, 3).join('；')), { status: 0 });
        } catch { /* cannot look: what is known already says it */ }
        return error;
    }
    /** The scheme in use back to the workflow it was imported with (its LoRA edits undone). */
    restoreComfyWorkflow() {
        const next = this.getState(), c = next.draw.comfy, row = c.workflows.find(p => p.id === c.activeWorkflow);
        if (!row.sourceWorkflow) throw Error('这套方案没有可以恢复的原始工作流');
        row.workflow = row.sourceWorkflow; row.disabledLoras = []; row.disabledNodes = []; row.output = '';
        applyComfyWorkflow(c, row.id); this.save(next);
        return this.comfyLoraInfo();
    }
    /** Import a new workflow or rename/update a saved one. LoRA nodes and custom inputs stay untouched. */
    saveComfyWorkflow(patch) {
        if (!patch || typeof patch !== 'object') throw Error('工作流格式无效');
        const next = this.getState(), c = next.draw.comfy, old = c.workflows.find(p => p.id === patch.id);
        if (patch.id === 'default') throw Error('默认工作流不能修改，请导入为新的一套');
        if (patch.id && !old) throw Error('这套工作流已经不在了');
        if (old && patch.expected && Object.entries(patch.expected).some(([key, value]) => JSON.stringify(old[key]) !== JSON.stringify(value))) throw Error('这套方案在其他地方改过了，请另存，或重新选择方案后再改');
        let name = String(patch.name ?? old?.name ?? '').trim();
        if (!name || name.length > 60) throw Error('请填写工作流名称（最多 60 字）');
        const workflow = checkWorkflow(patch.workflow ?? old?.workflow);
        if (!workflow) throw Error('导入的工作流不能为空');
        if (!old && c.workflows.length >= COMFY_LIMITS.presets) throw Error(`最多保存 ${COMFY_LIMITS.presets} 套 ComfyUI 方案（含默认），请先删掉一套`);
        if (!old) { const stem = name; let n = 2; while (c.workflows.some(p => p.name === name)) name = stem.slice(0, 54) + ` (${n++})`; }
        const disabledLoras = normalizeDisabledLoras(workflow, patch.disabledLoras ?? old?.disabledLoras);
        // Validate bypass wiring before acknowledging a saved scheme.
        activeLoraWorkflow(workflow, disabledLoras);
        const sourceWorkflow = checkWorkflow(patch.sourceWorkflow ?? old?.sourceWorkflow);
        const disabledNodes = patch.disabledNodes ?? old?.disabledNodes, output = patch.output ?? old?.output;
        const row = {id: old?.id || crypto.randomUUID(), name, workflow, disabledLoras, ...(disabledNodes?.length ? {disabledNodes} : {}), ...(output ? {output} : {}), ...(sourceWorkflow ? {sourceWorkflow} : {}), ...Object.fromEntries(COMFY_PARAM_KEYS.map(key => [key, patch.params?.[key] ?? (old || c)[key]]))};
        if (old) c.workflows[c.workflows.indexOf(old)] = row; else c.workflows.push(row);
        applyComfyWorkflow(c, row.id); this.save(next);
        return clone(this.settings.draw.comfy.workflows.find(p => p.id === row.id));
    }
    selectComfyWorkflow(id) {
        const next = this.getState(); applyComfyWorkflow(next.draw.comfy, id); this.save(next);
    }
    deleteComfyWorkflow(id) {
        if (id === 'default') throw Error('默认工作流需要保留');
        const next = this.getState(), c = next.draw.comfy;
        if (!c.workflows.some(p => p.id === id)) throw Error('这套工作流已经不在了');
        c.workflows = c.workflows.filter(p => p.id !== id);
        if (c.activeWorkflow === id) applyComfyWorkflow(c, 'default');
        this.save(next);
    }
    saveDraw(patch) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Error('绘图设置格式无效');
        const next = this.getState(), draw = next.draw;
        if ('queue' in patch) draw.queue = normalizeDraw({ queue: { ...draw.queue, ...clone(patch.queue) } }).queue;
        if ('chunks' in patch) draw.chunks = normalizeChunks(clone(patch.chunks));
        for (const key of ['enabled', 'auto', 'guard', 'fold', 'strip', 'stream']) if (key in patch) { if (typeof patch[key] !== 'boolean') throw Error('开关设置无效'); draw[key] = patch[key]; }
        if ('mode' in patch) { if (!['separate', 'inline'].includes(patch.mode)) throw Error('配图方式无效'); draw.mode = patch.mode; }
        if ('vibe' in patch) draw.vibe = normalizeVibeSettings({ ...draw.vibe, ...clone(patch.vibe || {}) });
        if ('relay' in patch) {
            const relay = patch.relay && typeof patch.relay === 'object' ? patch.relay : {};
            draw.relay = { url: 'url' in relay ? relayUrl(relay.url) : draw.relay.url, assumeOpus: 'assumeOpus' in relay ? !!relay.assumeOpus : draw.relay.assumeOpus };
            this.subscription = null;
        }
        if ('params' in patch) draw.params = normalizeDrawParams({ ...draw.params, ...clone(patch.params) });
        if ('engine' in patch) { if (!DRAW_ENGINES.includes(patch.engine)) throw Error('绘图引擎无效'); draw.engine = patch.engine; }
        if ('gpt' in patch) {
            const g = patch.gpt && typeof patch.gpt === 'object' ? clone(patch.gpt) : {};
            if ('url' in g) g.url = gptBase(g.url);
            if ('model' in g && !/^[\w.:/-]{1,80}$/.test(String(g.model).trim())) throw Error('模型名称无效');
            draw.gpt = normalizeGpt({ ...draw.gpt, ...g });
        }
        if ('comfy' in patch) {
            const c = patch.comfy && typeof patch.comfy === 'object' ? clone(patch.comfy) : {};
            if ('url' in c) c.url = comfyUrl(c.url);
            const current = draw.comfy;
            if ('workflow' in c) {
                c.workflow = checkWorkflow(c.workflow);
                if (!c.workflow) applyComfyWorkflow(current, 'default');
                else if (current.activeWorkflow === 'default') {
                    const row = {id: crypto.randomUUID(), name: '自定义工作流', workflow: c.workflow, ...Object.fromEntries(COMFY_PARAM_KEYS.map(key => [key, current[key]]))};
                    current.workflows.push(row); applyComfyWorkflow(current, row.id);
                } else { const row = current.workflows.find(p => p.id === current.activeWorkflow); row.workflow = c.workflow; row.disabledLoras = []; delete row.sourceWorkflow; }
            }
            draw.comfy = normalizeComfy({ ...current, ...c });
        }
        // The 画风 picked belongs to the engine in use.
        if ('activeStyle' in patch) {
            const style = draw.styles.find(s => s.id === patch.activeStyle);
            if (!style) throw Error('画风预设不存在');
            if (draw.engine === 'nai') {
                draw.activeStyle = style.id;
                // Its own parameters come back; one that has none yet keeps (and from now on keeps) the ones in use.
                if (style.params) draw.params = normalizeDrawParams({ ...draw.params, ...style.params });
                else style.params = styleParams(draw.params);
            } else draw[draw.engine].style = style.id;
        }
        // Parameters changed: the NovelAI 画风 in use keeps them.
        if ('params' in patch) { const style = draw.styles.find(s => s.id === draw.activeStyle); if (style) style.params = styleParams(draw.params); }
        if ('activePreset' in patch) { if (!draw.presets.some(p => p.id === patch.activePreset)) throw Error('绘图预设不存在'); draw.activePreset = patch.activePreset; }
        // Existing address/model controls edit the selected connection, preserving every other one.
        for (const engine of ['nai', 'gpt']) {
            const group = draw.connections[engine], p = group.presets.find(p => p.id === group.active);
            Object.assign(p, engine === 'nai' ? draw.relay : {url: draw.gpt.url, model: draw.gpt.model});
        }
        this.save(next);
        return clone(this.settings.draw);
    }
    saveStyle(value) {
        if (!value || typeof value !== 'object' || !String(value.name || '').trim()) throw Error('请填写画风名称');
        const next = this.getState(), style = { id: value.id || crypto.randomUUID(), name: String(value.name).trim(), artist: String(value.artist || ''), positive: String(value.positive || ''), negative: String(value.negative || '') };
        const index = next.draw.styles.findIndex(s => s.id === style.id), was = next.draw.styles[index];
        // Its parameters: the ones given (a copy keeps the original's), else the ones it had.
        const params = value.params && typeof value.params === 'object' ? value.params : was?.params;
        if (params) style.params = styleParams({ ...next.draw.params, ...params });
        // It stays in its group; a new one given `after` (a copy) goes right below that style, in its group.
        const after = index < 0 && value.after ? next.draw.styles.findIndex(s => s.id === value.after) : -1;
        if (was?.group) style.group = was.group; else if (after >= 0 && next.draw.styles[after].group) style.group = next.draw.styles[after].group;
        if (index >= 0) next.draw.styles[index] = style; else if (after >= 0) next.draw.styles.splice(after + 1, 0, style); else next.draw.styles.push(style);
        this.save(next);
        return clone(this.settings.draw.styles.find(s => s.id === style.id));
    }
    deleteStyle(id) { return this.deleteStyles([id]); }
    /** Several 画风 at once (a group's, the ones picked): one save; at least one has to stay. */
    deleteStyles(ids) {
        const next = this.getState(), gone = new Set([...(ids || [])].map(String));
        const left = next.draw.styles.filter(s => !gone.has(s.id));
        if (!left.length) throw Error('请至少保留一个画风预设');
        next.draw.styles = left;
        return this.save(next).draw;
    }
    /** The 画风 list in a new order with its groups: tree [{style: id} | {group: {id, name, open}, styles: [id]}].
     *  Styles not given keep their order after the rest; a group with no style given goes. */
    arrangeStyles(tree) {
        if (!Array.isArray(tree)) throw Error('画风顺序无效');
        const next = this.getState(), byId = new Map(next.draw.styles.map(s => [s.id, s])), order = [], groups = [], seen = new Set();
        const take = (id, group) => {
            const s = byId.get(String(id));
            if (!s || seen.has(s.id)) return false;
            seen.add(s.id);
            if (group) s.group = group; else delete s.group;
            order.push(s);
            return true;
        };
        for (const entry of tree) {
            if (entry?.group && typeof entry.group === 'object') {
                const g = { id: String(entry.group.id || crypto.randomUUID()), name: String(entry.group.name ?? '').trim().slice(0, 40) || '新建组', open: entry.group.open !== false };
                let any = false;
                for (const id of Array.isArray(entry.styles) ? entry.styles : []) any = take(id, g.id) || any;
                if (any && !groups.some(x => x.id === g.id)) groups.push(g);
            } else take(entry?.style);
        }
        for (const s of next.draw.styles) if (!seen.has(s.id)) { delete s.group; order.push(s); }
        next.draw.styles = order;
        next.draw.styleGroups = groups;
        this.save(next);
        return clone(this.settings.draw);
    }
    saveDrawPreset(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('绘图预设格式无效');
        // What is saved is what the user wrote: no entries are added to it as to a preset from an older version.
        const next = this.getState(), preset = normalizeDraw({ presets: [{ ...clone(value), id: value.id || crypto.randomUUID(), rev: DRAW_PRESET_REV }] }).presets[0];
        validateDrawPreset(preset);
        const index = next.draw.presets.findIndex(p => p.id === preset.id);
        if (index < 0) next.draw.presets.push(preset); else next.draw.presets[index] = preset;
        this.save(next);
        return clone(preset);
    }
    deleteDrawPreset(id) {
        const next = this.getState();
        if (next.draw.presets.length === 1) throw Error('请至少保留一个绘图预设');
        next.draw.presets = next.draw.presets.filter(p => p.id !== id);
        return this.save(next).draw;
    }
    previewDrawPrompt(preset) {
        const draft = preset ? normalizeDraw({ presets: [clone(preset)] }).presets[0] : null;
        if (draft) validateDrawPreset(draft);
        const draw = this.settings.draw, used = draft || draw.presets.find(p => p.id === draw.activePreset) || draw.presets[0];
        // 'separate' mode: the request made after a reply, with a stand-in for the reply.
        // The 名单 of the card open now (who speaks next is not known here: they are added when the request is made).
        const only = this.drawCast();
        if (draw.mode === 'separate') {
            const lore = activeChatPreset(this.settings.chat).lore === false ? '' : '（这里是酒馆这次会触发的世界书条目，按手机「读哪些世界书」的选择）';
            return planRequest(this.settings, { message: '（这里是刚写好的正文，第一段）\n（第二段……每一段前面会标上 [P1]、[P2]）', preset: used, only, lore })
                .map(m => `【${m.role}】\n${m.content}`).join('\n\n');
        }
        return drawPromptPlan(this.settings, used, only).map(entry => entry.text).join('\n\n');
    }
    async naiSubscription(refresh = false) {
        this.assertOpen();
        if (!this.novelai.configured) return null;
        if (!refresh && this.subscription && Date.now() - this.subscription.checkedAt < 10 * 60 * 1000) return clone(this.subscription);
        this.novelai.relay = this.settings.draw.relay.url;
        const revision = this.imageConnectionRevision, subscription = await this.novelai.subscription();
        if (revision !== this.imageConnectionRevision) return null;
        this.subscription = subscription;
        this.emit('draw', { subscription: this.subscription });
        return clone(this.subscription);
    }
    /**
     * The relay (or NovelAI itself) checked from the phone: the drawing route by an empty request that draws nothing,
     * and the subscription. {relay, draw: {ok, status}, subscription: {ok, tier} | {ok: false, status, message}}.
     */
    async naiProbe() {
        this.assertOpen();
        if (!this.novelai.configured) throw Error('还没有填写 NovelAI 密钥');
        this.novelai.relay = this.settings.draw.relay.url;
        const draw = await this.novelai.probe();
        let subscription;
        try { const s = await this.naiSubscription(true); subscription = { ok: true, tier: s.tier }; }
        catch (error) { subscription = { ok: false, status: error.status || 0, message: error.message }; }
        return { relay: !!this.settings.draw.relay.url, draw, subscription };
    }
    /**
     * Whether params cost Anlas. free: true (covered), false (costs Anlas), null (subscription unknown). extra: {base,
     * refs, size} — a picture is drawn at its base's size (size), which decides the Opus free tier as ever; each 角色参考
     * adds REFERENCE_ANLAS. (NovelAI's own app counts 图生图 and 局部重绘 as free when they are small enough.)
     */
    drawQuote(params, extra = {}) {
        const engine = this.settings.draw.engine;
        if (engine !== 'nai') return this.engineQuote(engine, params);
        const requested = normalizeDrawParams(params || this.settings.draw.params);
        const effective = this.settings.draw.guard ? guardParams(requested) : requested;
        // Through a relay that does not pass the subscription on, the user may say the account is Opus: small non-V5 images count as free.
        const relay = this.settings.draw.relay, subscription = this.subscription || (relay.url && relay.assumeOpus ? { unlimited: true, active: true, usage: null, assumed: true } : null);
        // Vibes: encoding one (first use) and every vibe past four cost Anlas, so such a picture is not free.
        const sized = extra?.size?.width > 0 && extra?.size?.height > 0 ? { ...effective, width: extra.size.width, height: extra.size.height } : effective;
        const vibes = this.vibePlan(effective.model), vibeAnlas = (vibes.encode + vibes.extra) * VIBE_ANLAS, free = isFree(sized, subscription);
        const refs = takesReference(effective.model) ? Math.max(0, Number(extra?.refs) || 0) : 0, referenceAnlas = refs * REFERENCE_ANLAS, base = !!extra?.base;
        // With references no vibe is sent, so the vibes cost nothing then.
        const vibeCost = refs ? 0 : vibeAnlas, paid = !!(vibeCost || referenceAnlas);
        return { params: effective, clamped: JSON.stringify(effective) !== JSON.stringify(requested), free: paid && free !== false ? false : free, guard: this.settings.draw.guard,
            v5: isV5(effective.model), usage: this.subscription?.usage ? clone(this.subscription.usage) : null, vibes, vibeAnlas: vibeCost, referenceAnlas, base };
    }
}

/** Puts the methods on the backend's prototype, as if written in its class (not enumerable). */
export function installDrawSettings(target) {
    for (const name of Object.getOwnPropertyNames(DrawSettings.prototype)) if (name !== 'constructor') Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(DrawSettings.prototype, name));
}
