// Saving pictures and audio to the device. Used both in the tavern page and in the phone's frame.
// On a phone the system's share sheet does it (保存到文件 / 存储): a phone browser lets a page start one download after a
// tap, but treats the next ones (started after reading the file, a moment later) as unasked and drops them — users saw
// one save in ten — and its download manager can turn a Chinese name into percent-codes. The sheet keeps the name.
// Elsewhere, and where the sheet cannot take the file, a plain download from the topmost page the phone sits in.

const EXTENSIONS = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg',
  'audio/opus': 'opus', 'audio/flac': 'flac', 'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/webm': 'webm',
  'text/plain': 'txt', 'application/json': 'json', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif'
};
const KNOWN = /\.(png|jpe?g|webp|avif|gif|mp3|wav|ogg|opus|flac|aac|m4a|webm|txt|json)$/i;

/** A file name every system accepts, ending in the extension that matches the file's type. */
export function fileName(base, type = '', fallback = 'ST-iPhonie') {
  let name = String(base ?? '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  const ext = EXTENSIONS[String(type).split(';')[0].trim().toLowerCase()];
  if (ext) name = name.replace(KNOWN, '');
  name = [...(name || fallback)].slice(0, 80).join('').trim() || fallback;
  return ext ? `${name}.${ext}` : name;
}

/** Saves a Blob, or the file at a URL (blob:, data: or a path on the tavern), under the given name. Returns the name. */
export async function saveFile(doc, source, base) {
  const win = doc.defaultView;
  let blob = source;
  if (typeof source === 'string') {
    const response = await win.fetch(source);
    if (!response.ok) throw Error(`文件读取失败（HTTP ${response.status}）`);
    blob = await response.blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function' || !blob.size) throw Error('没有可以下载的文件');
  const name = fileName(base, blob.type);
  if (await shared(win, blob, name)) return name;
  // The page the phone sits in (same site), so a frame's own rules about downloads do not apply.
  let top = doc;
  try { if (win.top && win.top !== win && win.top.document?.body) top = win.top.document; } catch { /* another site: stay here */ }
  doc = top;
  const url = (doc.defaultView || win).URL.createObjectURL(blob), link = doc.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  // Some browsers read the file after click() returns.
  win.setTimeout(() => (doc.defaultView || win).URL.revokeObjectURL(url), 60000);
  return name;
}
/**
 * On a touch screen: the share sheet with the file (true when it went through). Turned down by the user: an error
 * saying so. Not possible here (no sheet, a file type it does not take, the tap too long ago): false, so a plain
 * download is tried.
 */
async function shared(win, blob, name) {
  const nav = win.navigator, File = win.File;
  if (!win.matchMedia?.('(pointer:coarse)').matches || typeof nav?.share !== 'function' || typeof nav.canShare !== 'function' || !File) return false;
  let file;
  try { file = new File([blob], name, {type: blob.type || 'application/octet-stream'}); if (!nav.canShare({files: [file]})) return false; } catch { return false; }
  try { await nav.share({files: [file], title: name}); return true; }
  catch (error) {
    if (error?.name === 'AbortError') throw Error('已取消保存');
    return false;
  }
}

/** A 下载 button for the image viewer: keeps the viewer open and reports how it went. */
export function downloadAction(doc, pick, notify = () => {}) {
  return {label: '下载', run: async index => {
    try {
      const {source, name} = await pick(index);
      notify(`已下载 ${await saveFile(doc, source, name)}`);
    } catch (error) { notify(`下载失败：${error.message}`, {error: true}); }
    return false;
  }};
}
