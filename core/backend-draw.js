// The drawing settings of the backend (core/backend.js): ComfyUI workflows and their LoRAs, 绘图 settings, 画风
// (with the NovelAI parameters each one keeps), 绘图预设, the prompt preview, the NovelAI subscription and what a
// picture costs. Methods of TTSBackend, kept in a file of their own (installDrawSettings puts them on its prototype).
import { DRAW_ENGINES, normalizeGpt, gptBase, normalizeComfy, comfyUrl, checkWorkflow, workflowPlaceholders, COMFY_LIMITS, defaultWorkflow, COMFY_PARAM_KEYS, applyComfyWorkflow } from './image-engines.js';
import { activeLoraWorkflow, normalizeDisabledLoras, inspectLoras, editLoras, pickLoraSource } from './comfy-loras.js';
import { relayUrl, guardParams, isFree, isV5, normalizeDrawParams } from './novelai.js';
import { PRESET_REV as DRAW_PRESET_REV, drawPromptPlan, planRequest, validateDrawPreset, normalizeDraw, normalizeVibeSettings, styleParams } from './draw.js';
import { activeChatPreset } from './chat.js';
import { VIBE_ANLAS } from './vibes.js';

const clone = value => structuredClone(value);

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
        return clone({ ...info, disabled: row.disabledLoras || [], auto: pickLoraSource(workflow), builtIn: row.id === 'default', restorable: !!row.sourceWorkflow && row.sourceWorkflow !== row.workflow,
            controls, missing: controls.includes('model') && !c.model ? '还没有选模型：在「参数」里读取模型列表再选一个' : '' });
    }
    /**
     * Changes the LoRAs of the scheme in use and saves it at once: {updates: [{id, lora_name?, strength_model?,
     * strength_clip?}], enabled: {id: on}, remove: id, add: {lora_name, strength_model, strength_clip, source?}}.
     * The built-in default scheme stays as it is: the first change makes a copy of it and switches to that copy.
     */
    editComfyLoras(change = {}) {
        this.assertOpen();
        const next = this.getState(), c = next.draw.comfy;
        let row = c.workflows.find(p => p.id === c.activeWorkflow), copied = false;
        if (row.id === 'default') {
            if (c.workflows.length >= COMFY_LIMITS.presets) throw Error(`最多保存 ${COMFY_LIMITS.presets} 套 ComfyUI 方案，请先删掉一套`);
            const stem = '默认工作流 · LoRA'; let name = stem, n = 2;
            while (c.workflows.some(p => p.name === name)) name = `${stem} (${n++})`;
            const workflow = defaultWorkflow(row);
            row = { ...clone(row), id: crypto.randomUUID(), name, workflow, sourceWorkflow: workflow, disabledLoras: [] };
            c.workflows.push(row); copied = true;
        }
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
    /** The scheme in use back to the workflow it was imported with (its LoRA edits undone). */
    restoreComfyWorkflow() {
        const next = this.getState(), c = next.draw.comfy, row = c.workflows.find(p => p.id === c.activeWorkflow);
        if (!row.sourceWorkflow) throw Error('这套方案没有可以恢复的原始工作流');
        row.workflow = row.sourceWorkflow; row.disabledLoras = [];
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
        const row = {id: old?.id || crypto.randomUUID(), name, workflow, disabledLoras, ...(sourceWorkflow ? {sourceWorkflow} : {}), ...Object.fromEntries(COMFY_PARAM_KEYS.map(key => [key, patch.params?.[key] ?? (old || c)[key]]))};
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
        for (const key of ['enabled', 'auto', 'guard', 'fold', 'strip']) if (key in patch) { if (typeof patch[key] !== 'boolean') throw Error('开关设置无效'); draw[key] = patch[key]; }
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
        if (index < 0) next.draw.styles.push(style); else next.draw.styles[index] = style;
        this.save(next);
        return clone(this.settings.draw.styles.find(s => s.id === style.id));
    }
    deleteStyle(id) {
        const next = this.getState();
        if (next.draw.styles.length === 1) throw Error('请至少保留一个画风预设');
        next.draw.styles = next.draw.styles.filter(s => s.id !== id);
        return this.save(next).draw;
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
    /** Whether params cost Anlas. free: true (covered), false (costs Anlas), null (subscription unknown). */
    drawQuote(params) {
        const engine = this.settings.draw.engine;
        if (engine !== 'nai') return this.engineQuote(engine, params);
        const requested = normalizeDrawParams(params || this.settings.draw.params);
        const effective = this.settings.draw.guard ? guardParams(requested) : requested;
        // Through a relay that does not pass the subscription on, the user may say the account is Opus: small non-V5 images count as free.
        const relay = this.settings.draw.relay, subscription = this.subscription || (relay.url && relay.assumeOpus ? { unlimited: true, active: true, usage: null, assumed: true } : null);
        // Vibes: encoding one (first use) and every vibe past four cost Anlas, so such a picture is not free.
        const vibes = this.vibePlan(effective.model), vibeAnlas = (vibes.encode + vibes.extra) * VIBE_ANLAS, free = isFree(effective, subscription);
        return { params: effective, clamped: JSON.stringify(effective) !== JSON.stringify(requested), free: vibeAnlas && free !== false ? false : free, guard: this.settings.draw.guard,
            v5: isV5(effective.model), usage: this.subscription?.usage ? clone(this.subscription.usage) : null, vibes, vibeAnlas };
    }
}

/** Puts the methods on the backend's prototype, as if written in its class (not enumerable). */
export function installDrawSettings(target) {
    for (const name of Object.getOwnPropertyNames(DrawSettings.prototype)) if (name !== 'constructor') Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(DrawSettings.prototype, name));
}
