// Smaller pictures of a photo, made once and kept (LocalLibrary.saveThumb / savePreview), so the phone no longer decodes
// every photo at full size: the small one for the album grid, the photo pickers, avatars and icons; the middle-sized one
// for chat bubbles, posts and the 今天 widget. And a drawn picture kept smaller at its full size (压缩旧图, packPicture).

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

/** 压缩旧图: a drawn picture (PNG) at its full size as WebP at quality .9, which looks the same and is usually a tenth as
 *  big; as JPEG where the browser cannot write WebP, unless something in it is see-through. null when it is not worth
 *  it: not a PNG, a picture that moves, or less than 30% saved. Throws when the picture cannot be read. */
export async function packPicture(blob) {
  if (blob?.type !== 'image/png' || await moving(blob)) return null;
  const bitmap = await createImageBitmap(blob);
  try {
    const {width: w, height: h} = bitmap, canvas = canvasOf(w, h), g = canvas.getContext('2d');
    g.drawImage(bitmap, 0, 0);
    let out = await encode(canvas, 'image/webp', .9);
    if (out?.type !== 'image/webp') {
      const px = g.getImageData(0, 0, w, h).data;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return null;
      out = await encode(canvas, 'image/jpeg', .92);
    }
    return out?.size && out.size <= blob.size * .7 ? out : null;
  } finally {
    bitmap.close?.();
  }
}

const canvasOf = (w, h) => typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), {width: w, height: h});
const encode = (canvas, type, quality) => canvas.convertToBlob ? canvas.convertToBlob({type, quality}) : new Promise(resolve => canvas.toBlob(resolve, type, quality));

/** The picture scaled by fit(width, height); null when that scale is `keep` or more (not worth a picture of its own). */
async function shrink(blob, fit, keep = Infinity) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = fit(bitmap.width, bitmap.height);
    if (scale >= keep) return null;
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = canvasOf(w, h), g = canvas.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, 0, 0, w, h);
    let out = await encode(canvas, 'image/webp', .8);
    if (out?.type !== 'image/webp') {
      // No WebP writer (Safari): JPEG, with what was see-through put on white.
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      out = await encode(canvas, 'image/jpeg', .8);
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
