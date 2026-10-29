// A photo's small picture for the album grid and the photo pickers: the photo is decoded once, scaled down and kept
// (LocalLibrary.saveThumb), so a grid no longer decodes every photo at full size each time it opens.

/** The photo with its shorter side `short` px (never enlarged), as WebP where the browser can write it, else JPEG on
 *  white. {blob, w, h}; throws when the picture cannot be read. */
export async function makeThumb(blob, short = 320) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, short / Math.min(bitmap.width, bitmap.height));
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
