// Client for the shared queue service (cloud-queue/worker.js, deployed by the user on Cloudflare).
// Everyone who shares one NovelAI account uses the same service address and room code; before each NovelAI request
// the plugin takes a turn in the room and gives it back afterwards. Only the room code, a random ticket and a short
// label ("正文图片") are sent — never the NovelAI key, prompts or pictures.
import {sha256Hex as hashHex} from './hash.js';

const POLL_MS = 2000, RENEW_MS = 20000;
async function queueJson(response, signal) {
  try { return await response.json(); }
  catch {
    if (signal?.aborted) throw stop();
    throw Error('云端队列返回的不是有效 JSON，请检查队列地址和服务状态');
  }
}
const stop = () => Object.assign(Error('已取消'), {cancelled: true});
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(stop()); return; }
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(stop()); }, {once: true});
});

/** A room code friends can share: 24 letters and digits. */
export function newRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map(b => chars[b % chars.length]).join('');
}
export const validRoom = room => /^[A-Za-z0-9_-]{16,64}$/.test(String(room || ''));

export class CloudQueue {
  constructor({url, room}, {fetcher = (...args) => globalThis.fetch(...args), poll = POLL_MS, renew = RENEW_MS, wait = sleep} = {}) {
    this.url = String(url || '').replace(/\/+$/, '');
    this.room = String(room || '');
    Object.assign(this, {fetcher, poll, renew, wait});
  }
  matches({url, room}) { return this.url === String(url || '').replace(/\/+$/, '') && this.room === room; }
  async call(body, signal) {
    if (!/^https:\/\//.test(this.url)) throw Error('云端队列地址需要以 https:// 开头');
    if (!validRoom(this.room)) throw Error('房间码需要 16–64 个字母或数字');
    let response;
    try {
      response = await this.fetcher(`${this.url}/q/${encodeURIComponent(this.room)}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal});
    } catch (error) {
      if (signal?.aborted) throw stop();
      throw Error('连不上云端队列，请检查地址和网络');
    }
    if (!response.ok) throw Error(`云端队列出错（${response.status}）`);
    return queueJson(response, signal);
  }
  /** Current state of the room: {length, busy, holder, cooldown}. */
  status(signal) { return this.call({op: 'status'}, signal); }
  /**
   * Waits for our turn. onWait({position, holder, cooldown}) reports the line while waiting.
   * Returns a lease; call lease.release('done' | 'busy', cooldownMs) when the request is over.
   */
  async acquire({label = '', signal, onWait = () => {}} = {}) {
    let state = await this.call({op: 'join', label: String(label).slice(0, 40)}, signal);
    let ticket = state.ticket;
    try {
      while (state.state !== 'granted') {
        onWait(state);
        await this.wait(this.poll, signal);
        state = await this.call({op: 'poll', ticket}, signal);
        // The service forgot us (restarted, or we were away too long): take a new ticket.
        if (state.state === 'gone') { state = await this.call({op: 'join', label: String(label).slice(0, 40)}, signal); ticket = state.ticket; }
      }
    } catch (error) {
      this.call({op: 'leave', ticket}).catch(() => {});
      throw error;
    }
    const timer = setInterval(() => this.call({op: 'renew', ticket}).catch(() => {}), this.renew);
    let done = false;
    return {
      ticket,
      release: (outcome = 'done', cooldown = 0) => {
        if (done) return Promise.resolve();
        done = true;
        clearInterval(timer);
        return this.call({op: 'leave', ticket, outcome, cooldown: Math.round(cooldown)}).catch(() => {});
      }
    };
  }
}

// ---------- Queues that group people by their NovelAI key (the 智绘姬 / st-chatu8 queue protocol) ----------
// Such a service needs no room code: everyone whose key has the same SHA-256 lands in the same line.
// Sent: that hash, a random id for this browser and a random id per picture. The key itself never leaves.

export async function sha256Hex(text) { return hashHex(String(text)); }
function browserId() {
  try {
    let id = globalThis.localStorage?.getItem('sttts.queue.uid');
    if (!id) { id = crypto.randomUUID(); globalThis.localStorage?.setItem('sttts.queue.uid', id); }
    return id;
  } catch { return 'sttts-' + crypto.randomUUID(); }
}

export class KeyHashQueue {
  /** keyHash(): the SHA-256 of the NovelAI key, or '' when there is no key. */
  constructor({url}, {keyHash, fetcher = (...args) => globalThis.fetch(...args), poll = 1000, wait = sleep, userId = browserId} = {}) {
    this.url = String(url || '').replace(/\/+$/, '');
    Object.assign(this, {keyHash, fetcher, poll, wait, userId});
  }
  matches({url, kind}) { return kind === 'keyhash' && this.url === String(url || '').replace(/\/+$/, ''); }
  async request(path, body, signal) {
    if (!/^https:\/\//.test(this.url)) throw Error('云端队列地址需要以 https:// 开头');
    let response;
    try {
      response = await this.fetcher(this.url + path, body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal} : {signal});
    } catch {
      if (signal?.aborted) throw stop();
      throw Error('连不上云端队列，请检查地址和网络');
    }
    if (!response.ok) throw Error(`云端队列出错（${response.status}）`);
    return queueJson(response, signal);
  }
  async hash() {
    const hash = await this.keyHash();
    if (!hash) throw Error('还没有填写 NovelAI 密钥，按密钥排队需要它');
    return hash;
  }
  /** {length, holder, cooldown} for our key's line. */
  async status(signal) {
    const hash = await this.hash();
    await this.request('/ping', null, signal);
    const line = (await this.request('/stats', null, signal).catch(() => ({})))?.queues?.[hash];
    return {length: line?.size || 0, holder: line?.current ? '有人' : '', cooldown: 0};
  }
  async acquire({signal, onWait = () => {}} = {}) {
    const ids = {key_hash: await this.hash(), user_id: this.userId(), task_id: crypto.randomUUID()};
    let state = await this.request('/join-queue', {...ids, greeting: null}, signal);
    let token = state.position === 0 && state.lock_token ? state.lock_token : null;
    try {
      while (!token) {
        onWait({position: Math.max(1, state.position ?? 1), holder: state.current_greeting || '', cooldown: 0, length: state.queue_size});
        await this.wait(this.poll, signal);
        state = await this.request(`/my-turn?key_hash=${encodeURIComponent(ids.key_hash)}&user_id=${encodeURIComponent(ids.user_id)}&task_id=${encodeURIComponent(ids.task_id)}`, null, signal);
        if (state.is_my_turn && state.lock_token) token = state.lock_token;
      }
    } catch (error) {
      this.request('/leave-queue', {...ids, lock_token: null}).catch(() => {});
      throw error;
    }
    let done = false;
    return {
      ticket: ids.task_id,
      release: () => {
        if (done) return Promise.resolve();
        done = true;
        return this.request('/complete', {...ids, lock_token: token}).catch(() => {});
      }
    };
  }
}
