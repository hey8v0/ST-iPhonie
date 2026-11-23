import {RECORDING_LIMITS, recordingFormat} from '../core/chats.js';
import {btn, field, input, select, textArea} from './common.js';
import {browserSpeech, transcribeInBrowser} from './browser-transcription.js';

const preferences = new WeakMap();
const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];
const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());

function transcriptionURL(endpoint, key) {
  let url;
  try { url = new URL(endpoint); } catch { throw Error('请填写完整的语音转写地址'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('请填写 HTTP 或 HTTPS 转写地址');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && key) throw Error('发送密钥时请使用 HTTPS 地址');
  const path = url.pathname.replace(/\/+$/, '');
  if (!path || /\/v\d+$/.test(path)) url.pathname = (path || '/v1') + '/audio/transcriptions';
  return url;
}

async function speechRequest(fetch, url, key, signal, options = {}) {
  const headers = key ? {Authorization:'Bearer ' + key} : {};
  try { return await fetch(url.href, {...options, headers, signal, redirect:'error', credentials:'omit'}); }
  catch (error) {
    if (signal.aborted) throw error;
    throw Error('转写服务连接失败。请检查地址、网络和服务的跨域设置。');
  }
}

/** Compatible services list models at the same API prefix as audio/transcriptions. */
async function listSpeechModels(fetch, {endpoint, key}, signal) {
  const url = transcriptionURL(endpoint, key);
  const suffix = /\/audio\/transcriptions\/?$/;
  if (!suffix.test(url.pathname)) throw Error('此地址无法推导模型列表，请直接填写模型名。');
  url.pathname = url.pathname.replace(suffix, '/models');
  const response = await speechRequest(fetch, url, key, signal);
  if ([404, 405].includes(response.status)) throw Error('该服务没有提供模型列表，请直接填写模型名。');
  if (!response.ok) throw Error(`拉取模型失败（HTTP ${response.status}）。`);
  const result = await response.json().catch(() => null);
  const rows = Array.isArray(result?.data) ? result.data : Array.isArray(result?.models) ? result.models : Array.isArray(result) ? result : [];
  const ids = rows.map(row => typeof row === 'string' ? row : row?.id).filter(id => typeof id === 'string' && id.trim());
  if (!ids.length) throw Error('服务没有返回模型列表，请直接填写模型名。');
  return [...new Set(ids.map(id => id.trim()))].sort().slice(0, 500);
}

export async function transcribeRecording(fetch, {endpoint, model, key}, blob, signal) {
  const url = transcriptionURL(endpoint, key);
  if (!model) throw Error('请填写转写模型名');
  const format = recordingFormat(blob.type);
  if (!format) throw Error('转写不支持这段录音的格式');
  const form = new FormData();
  form.append('file', blob, 'recording.' + format);
  form.append('model', model);
  const response = await speechRequest(fetch, url, key, signal, {method:'POST', body:form});
  if (!response.ok) throw Error(`语音转写失败（HTTP ${response.status}），可以重试。`);
  const result = await response.json().catch(() => null);
  const text = typeof result?.text === 'string' ? result.text.trim() : '';
  if (!text) throw Error('转写没有返回文字。你可以重试或手动填写。');
  return text.slice(0, 4000);
}

export function recordChatMessage(ctx, {send, dialog = ctx.dialog} = {}) {
  const {win, api} = ctx;
  if (!win.navigator.mediaDevices?.getUserMedia || !win.MediaRecorder) {
    ctx.notify('当前页面无法录音，请用支持麦克风的浏览器打开 HTTPS 或本机地址。', {error:true});
    return null;
  }
  const saved = preferences.get(api) || {}, localSpeech = !!browserSpeech(win);
  const d = dialog('发语音', `<div class="chat-record">
    <p data-record-status role="status">录音最长 ${RECORDING_LIMITS.seconds} 秒</p>
    <div class="actions">${btn('record', '开始录音', 'primary')}</div>
    <div data-record-preview hidden>
      <audio controls preload="metadata" aria-label="试听原录音"></audio>
      ${field('转写文字（选填）', textArea('text', '', 'rows="3" maxlength="4000" placeholder="可先转写，也可以自己填写给角色看的内容"'))}
      <div class="actions">${localSpeech ? btn('browser-transcribe', '浏览器转写', 'secondary') : ''}${btn('transcribe', localSpeech ? '服务转写' : '转写', 'secondary')}${btn('send', '发送', 'primary')}</div>
    </div>
    <details class="chat-record-settings"><summary>转写服务</summary>
        ${field('转写接口地址', input('endpoint', saved.endpoint || '', 'url', 'placeholder="https://…/v1 或完整转写地址"'))}
        ${field('模型名', input('model', saved.model || '', 'text', 'placeholder="服务提供的转写模型"'))}
        ${field('密钥（选填）', input('key', saved.key || '', 'password', 'autocomplete="off"'))}
        <div class="actions">${btn('models', '拉取模型', 'secondary')}</div>
        <div data-model-results hidden></div><p role="status" data-model-status></p>
        <p class="hint">点「转写」会把录音发给这里填写的服务。连接信息在当前页面有效。</p>
    </details></div>`);
  const find = selector => d.body.querySelector(selector);
  const status = find('[data-record-status]'), preview = find('[data-record-preview]'), player = find('audio');
  const recordButton = find('[data-action=record]'), text = find('[data-field=text]');
  const convert = find('[data-action=transcribe]'), browser = find('[data-action=browser-transcribe]'), submit = find('[data-action=send]');
  const controller = new win.AbortController();
  let stream, recorder, timer, clip, duration, url, id, phase = 'idle';
  const value = key => find(`[data-field=${key}]`).value.trim();
  const config = () => ({endpoint:value('endpoint'), model:value('model'), key:value('key')});
  const modelStatus = find('[data-model-status]'), modelResults = find('[data-model-results]');
  for (const key of ['endpoint', 'key']) find(`[data-field=${key}]`).addEventListener('input', () => {
    modelResults.hidden = true;
    modelStatus.textContent = '';
  });
  async function withRequest(operation, timeout = 45000) {
    const request = new win.AbortController();
    const timer = win.setTimeout(() => request.abort(), timeout);
    const cancel = () => request.abort();
    controller.signal.addEventListener('abort', cancel, {once:true});
    try { return await operation(request.signal); }
    finally { win.clearTimeout(timer); controller.signal.removeEventListener('abort', cancel); }
  }
  async function pullModels(button) {
    if (button.disabled) return;
    const connection = config();
    button.disabled = true;
    modelResults.hidden = true;
    modelStatus.textContent = '正在拉取模型…';
    try {
      const models = await withRequest(signal => listSpeechModels(win.fetch.bind(win), connection, signal));
      if (!d.live || value('endpoint') !== connection.endpoint || value('key') !== connection.key) return;
      const preferred = id => /(?:whisper|transcri|sensevoice|paraformer|speech.to.text|\basr\b)/i.test(id);
      models.sort((a, b) => Number(preferred(b)) - Number(preferred(a)) || a.localeCompare(b));
      modelResults.innerHTML = field('选择模型', select('model-list', '', [['', '选一个模型'], ...models.map(id => [id, id])]));
      modelResults.hidden = false;
      modelResults.querySelector('select').onchange = event => {
        if (event.target.value) find('[data-field=model]').value = event.target.value;
        preferences.set(api, config());
      };
      modelStatus.textContent = `已读取 ${models.length} 个模型，请选择支持语音转写的模型。`;
    } catch (error) {
      if (d.live && value('endpoint') === connection.endpoint && value('key') === connection.key) {
        modelStatus.textContent = error.name === 'AbortError' ? '拉取模型超时，请重试。' : error.message;
      }
    } finally { button.disabled = false; }
  }
  function release() {
    win.clearInterval(timer);
    stopTracks(stream);
    stream = null;
  }
  function clearPreview() {
    player.pause();
    player.removeAttribute('src');
    if (url) win.URL.revokeObjectURL(url);
    url = '';
  }
  d.onClose(() => {
    controller.abort();
    if (recorder?.state === 'recording') recorder.stop();
    release();
    clearPreview();
  });
  const stop = () => {
    if (recorder?.state !== 'recording') return;
    recordButton.disabled = true;
    win.clearInterval(timer);
    recorder.stop();
  };
  async function record() {
    if (phase === 'recording') { stop(); return; }
    const previous = clip;
    phase = 'opening';
    recordButton.disabled = true;
    status.textContent = '正在打开麦克风…';
    try {
      const opened = await win.navigator.mediaDevices.getUserMedia({audio:true});
      if (!d.live) { stopTracks(opened); return; }
      stream = opened;
      const mimeType = types.find(type => win.MediaRecorder.isTypeSupported?.(type));
      recorder = new win.MediaRecorder(stream, mimeType ? {mimeType, audioBitsPerSecond:32000} : {audioBitsPerSecond:32000});
      const chunks = [];
      let failed = false;
      const started = Date.now();
      recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('error', () => { failed = true; }, {once:true});
      recorder.addEventListener('stop', () => {
        release();
        if (!d.live) return;
        const blob = new win.Blob(chunks, {type:recorder.mimeType || chunks[0]?.type || ''});
        if (!failed && recordingFormat(blob.type) && blob.size > 0 && blob.size <= RECORDING_LIMITS.bytes) {
          clearPreview();
          clip = blob;
          id = win.crypto.randomUUID();
          duration = Math.min(RECORDING_LIMITS.seconds, Math.max(1, Math.round((Date.now() - started) / 1000)));
          url = win.URL.createObjectURL(clip);
          player.src = url;
          text.value = '';
          status.textContent = `已录音 ${duration} 秒，可以试听。`;
        } else status.textContent = failed ? '麦克风录音失败，可以重试。' : '这一段录音为空、过大或无法播放。';
        preview.hidden = !clip;
        phase = clip ? 'ready' : 'idle';
        recordButton.disabled = false;
        recordButton.textContent = clip ? '重新录音' : '开始录音';
      }, {once:true});
      recorder.start();
      player.pause();
      preview.hidden = true;
      phase = 'recording';
      recordButton.textContent = '停止录音';
      recordButton.disabled = false;
      status.textContent = '录音中 · 0 秒';
      timer = win.setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        status.textContent = `录音中 · ${Math.min(elapsed, RECORDING_LIMITS.seconds)} 秒`;
        if (elapsed >= RECORDING_LIMITS.seconds) stop();
      }, 250);
    } catch (error) {
      release();
      if (!d.live) return;
      phase = previous ? 'ready' : 'idle';
      recordButton.disabled = false;
      status.textContent = error.name === 'NotAllowedError' ? '无法使用麦克风，请检查浏览器的麦克风权限。' : '无法开始录音，请检查麦克风是否可用。';
    }
  }
  d.body.addEventListener('click', async event => {
    const action = event.target.closest('button')?.dataset.action;
    if (action === 'models') { await pullModels(event.target.closest('button')); return; }
    if (action === 'record' && ['idle', 'ready', 'recording'].includes(phase)) { await record(); return; }
    if (!['send', 'transcribe', 'browser-transcribe'].includes(action) || phase !== 'ready') return;
    if (action === 'transcribe' && (!find('[data-field=endpoint]').value.trim() || !find('[data-field=model]').value.trim())) {
      find('.chat-record-settings').open = true;
      status.textContent = '请先填写语音转写地址和模型名。';
      return;
    }
    if (action !== 'send' && text.value.trim() && !await ctx.confirm('重新转写这段录音？', '新结果会替换当前的转写文字。', {over:true})) return;
    if (phase !== 'ready' || !d.live) return;
    phase = 'busy';
    recordButton.disabled = convert.disabled = submit.disabled = text.readOnly = true;
    if (browser) browser.disabled = true;
    try {
      if (action === 'send') {
        await send({id, blob:clip, duration, text:text.value.trim()});
        d.close();
      } else {
        const connection = config();
        if (action === 'transcribe') preferences.set(api, connection);
        status.textContent = action === 'browser-transcribe' ? '浏览器正在转写，首次可能需要下载语言包…' : '正在转写…';
        try {
          text.value = await withRequest(signal => action === 'browser-transcribe'
            ? transcribeInBrowser(win, clip, signal, ctx.doc.documentElement.lang || 'zh-CN')
            : transcribeRecording(win.fetch.bind(win), connection, clip, signal), action === 'browser-transcribe' ? 180000 : undefined);
          status.textContent = '转写好了，可以修改后发送。';
        } catch (error) {
          if (error.name === 'AbortError' && !controller.signal.aborted) throw Error('转写超时，录音仍在，可以重试。');
          throw error;
        }
      }
    } catch (error) { if (d.live) status.textContent = error.message; }
    finally {
      phase = 'ready';
      recordButton.disabled = convert.disabled = submit.disabled = text.readOnly = false;
      if (browser) browser.disabled = false;
    }
  });
  return d;
}
