// 账本: how much the phone has used, day by day: calls to the text model and about how many tokens they carried (by what
// they were for), characters voiced, pictures drawn, Anlas gone. Only numbers: nothing of what was said is kept.
// One document a day per device (with the apps' own documents, kind 'ledger'), so two devices saving to the tavern never
// write over each other; what is shown adds them up. The story's own replies are the tavern's, and are not in here.

/** What a text request is for, as generateText's `use` says it. */
export const TEXT_USES = Object.freeze({chat: '聊天', moments: '朋友圈', forum: '论坛', peek: '查手机', call: '电话', memory: '记忆整理', assistant: '助手', picture: '配图和提示词', book: '绘本', voices: '挑音色', other: '其他'});
const COUNTS = ['text', 'voice', 'image', 'anlas', 'embed', 'sfx'];
const KEEP_DAYS = 800;
const pad = n => String(n).padStart(2, '0');
/** A time's day where the user is: 'YYYY-MM-DD'. */
export const dayOf = (time = Date.now()) => { const d = new Date(time); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const WIDE = /[぀-ヿ㐀-鿿가-힯豈-﫿]/g;
/** About how many tokens words are, whichever model reads them: a CJK character a bit over one, other text four characters to one. */
export function roughTokens(text) {
  const s = String(text ?? '');
  if (!s) return 0;
  const wide = s.match(WIDE)?.length || 0;
  return Math.ceil(wide * 1.3 + (s.length - wide) / 4);
}
/** The words of a prompt: text, or messages whose content is text or parts (a picture counts for nothing here). */
export function promptWords(prompt) {
  if (typeof prompt === 'string') return prompt;
  if (!Array.isArray(prompt)) return '';
  return prompt.map(m => typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.map(part => typeof part?.text === 'string' ? part.text : '').join('') : '').join('\n');
}
/** Adds numbers to numbers, however deep. */
export function addUp(into, from) {
  for (const [key, value] of Object.entries(from || {})) {
    if (typeof value === 'number') into[key] = (into[key] || 0) + value;
    else if (value && typeof value === 'object') addUp(into[key] ||= {}, value);
  }
  return into;
}
const countsOf = row => Object.fromEntries(COUNTS.filter(key => row?.[key] !== undefined).map(key => [key, row[key]]));
/** Rows of many days and devices as one set of numbers. */
export const totalOf = rows => rows.reduce((all, row) => addUp(all, countsOf(row)), {});
const sum = (group, field) => Object.values(group || {}).reduce((n, value) => n + (typeof value === 'number' ? value : value?.[field] || 0), 0);
/** The four numbers on top of the page. */
export const headline = counts => ({text: sum(counts?.text, 'calls'), voice: sum(counts?.voice, 'chars'), image: sum(counts?.image), anlas: counts?.anlas || 0});

export class Ledger {
  #store; #device; #now; #delay; #pending = new Map(); #timer = null; #writing = Promise.resolve(); #closed = false; #pruned = false;
  /** store: the apps' store; device(): this device's id. */
  constructor({store, device = () => 'unknown', now = () => Date.now(), delay = 3000}) { this.#store = store; this.#device = device; this.#now = now; this.#delay = delay; }
  #note(numbers) {
    if (this.#closed) return;
    const day = dayOf(this.#now());
    addUp(this.#pending.get(day) || this.#pending.set(day, {}).get(day), numbers);
    if (this.#timer !== null) return;
    this.#timer = setTimeout(() => { this.#timer = null; this.flush().catch(() => {}); }, this.#delay);
    this.#timer.unref?.();
  }
  text(use, prompt, answer) { this.#note({text: {[Object.hasOwn(TEXT_USES, use) ? use : 'other']: {calls: 1, input: roughTokens(promptWords(prompt)), output: roughTokens(answer)}}}); }
  voice(engine, text) { this.#note({voice: {[String(engine || 'other')]: {lines: 1, chars: String(text ?? '').length}}}); }
  image(engine, count = 1) { this.#note({image: {[String(engine || 'other')]: count}}); }
  anlas(amount) { if (amount > 0) this.#note({anlas: Math.round(amount)}); }
  embed(texts) { this.#note({embed: {calls: 1, chars: (texts || []).reduce((n, text) => n + String(text ?? '').length, 0)}}); }
  sfx() { this.#note({sfx: 1}); }
  /** Writes what is waiting. A failure keeps it for the next time. */
  flush() {
    clearTimeout(this.#timer); this.#timer = null;
    return this.#writing = this.#writing.catch(() => {}).then(async () => {
      if (!this.#pending.size) return;
      for (const [day, numbers] of [...this.#pending]) {
        this.#pending.delete(day);
        try {
          const device = this.#device(), id = `ledger:${day}:${device}`, old = await this.#store.get(id);
          await this.#store.put([{id, kind: 'ledger', day, device, at: new Date(`${day}T00:00:00`).getTime(), updatedAt: this.#now(), ...addUp(countsOf(old), numbers)}]);
        } catch (error) {
          addUp(this.#pending.get(day) || this.#pending.set(day, {}).get(day), numbers);
          throw error;
        }
      }
      if (this.#pruned) return;
      this.#pruned = true;
      const old = this.#now() - KEEP_DAYS * 864e5, gone = (await this.#store.listFrom('ledger:')).filter(row => row.at < old).map(row => row.id);
      if (gone.length) await this.#store.removeMany(gone);
    });
  }
  /** One row a day between two days ('YYYY-MM-DD', both in), the oldest first: {day, ...numbers}, all devices together, what is waiting too. */
  async days(from = '', to = '￿') {
    const days = new Map(), add = (day, numbers) => { if (day >= from && day <= to) addUp(days.get(day) || days.set(day, {day}).get(day), countsOf(numbers)); };
    for (const row of await this.#store.listFrom('ledger:')) add(row.day, row);
    for (const [day, numbers] of this.#pending) add(day, numbers);
    return [...days.values()].sort((a, b) => a.day < b.day ? -1 : 1);
  }
  /** Starts again. Returns the ids that went. */
  async clear() {
    this.#pending.clear();
    await this.flush();
    const ids = (await this.#store.listFrom('ledger:')).map(row => row.id);
    await this.#store.removeMany(ids);
    return ids;
  }
  async close() {
    const last = this.flush().catch(() => {});
    this.#closed = true;
    await last;
  }
}
