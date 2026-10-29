// Smaller pictures of a photo, made once and kept (LocalLibrary.saveThumb / savePreview), so the phone no longer decodes
// every photo at full size: the small one for the album grid, the photo pickers, avatars and icons; the middle-sized one
// for chat bubbles, posts and the 今天 widget.

/** The photo with its shorter side `short` px (never enlarged), as WebP where the browser can write it, else JPEG on
 *  white. {blob, w, h}; throws when the picture cannot be read. */
export async function makeThumb(blob, short = 320) {
  return shrink(blob, (w, h) => Math.min(1, short / Math.min(w, h)));
}

/** The photo's middle-sized picture: its shorter side at most 720 px and its longer side at most 2160 (sharp at 3× in a
 *  chat bubble or a post), {blob, w, h}; {same: true} when the photo itself would do as well (hardly bigger) or moves
 *  (a GIF, an animated PNG or WebP keeps moving as it is). Throws when the picture cannot be read. */
export async function makePreview(blob) {
  if (await moving(blob)) return {same: true};
  return await shrink(blob, (w, h) => Math.min(1, 720 / Math.min(w, h), 2160 / Math.max(w, h)), .9) || {same: true};
}

/** The picture scaled by fit(width, height); null when that scale is `keep` or more (not worth a picture of its own). */
async function shrink(blob, fit, keep = Infinity) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = fit(bitmap.width, bitmap.height);
    if (scale >= keep) return null;
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), {width: w, height: h});
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, 0, 0, w, h);
    const encode = type => canvas.convertToBlob ? canvas.convertToBlob({type, quality: .8}) : new Promise(resolve => canvas.toBlob(resolve, type, .8));
    let out = await encode('image/webp');
    if (out?.type !== 'image/webp') {
      // No WebP writer (Safari): JPEG, with what was see-through put on white.
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      out = await encode('image/jpeg');
    }
    if (!out?.size) throw Error('缩略图没有做出来');
    return {blob: out, w, h};
  } finally {
    bitmap.close?.();
  }
}

/** Whether the picture moves: a GIF, a PNG with an 'acTL' chunk before its picture data, a WebP marked animated. */
async function moving(blob) {
  if (blob.type === 'image/gif') return true;
  const read = async (at, n) => new Uint8Array(await blob.slice(at, at + n).arrayBuffer());
  const tag = (bytes, at) => String.fromCharCode(...bytes.subarray(at, at + 4));
  const head = await read(0, 21);
  if (tag(head, 0) === 'RIFF' && tag(head, 8) === 'WEBP') return tag(head, 12) === 'VP8X' && (head[20] & 2) !== 0;
  if (tag(head, 0) !== '\x89PNG') return false;
  // the chunks' heads only (a drawn picture's text chunks can be long)
  for (let at = 8, n = 0; at + 8 <= blob.size && n < 64; n++) {
    const c = await read(at, 8), type = tag(c, 4);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    at += 12 + (c[0] * 2 ** 24 + (c[1] << 16) + (c[2] << 8) + c[3]);
  }
  return false;
}
