// Smaller pictures of photos (core/thumbnail.js), so the phone no longer decodes every photo it shows at full size (what
// made the album slow on phones): small ones for grids, avatars and icons, middle-sized ones for chat bubbles and posts.

// An answer from the backend, or null when there is none (it may also refuse at once, before any promise: closed)
const asked = async call => { try { return await call(); } catch { return null; } };
/** What to show for a photo row in a grid: a Blob, or null when the photo is gone. */
export async function thumbBlob(api, row) {
  const made = await asked(() => api.photoThumb?.(row.id));
  return made || (await asked(() => api.getPhoto(row.id)))?.blob || null;
}
/** The small pictures of these rows, put(id, blob) as they come: those made already a few at a time (a whole page's at once
 *  would be a long stop), then the others one by one (each decodes a whole photo). alive(): still wanted. */
export async function eachThumb(api, rows, put, alive = () => true) {
  const got = new Set();
  for (let at = 0; at < rows.length; at += 6) {
    const kept = await asked(() => api.photoThumbs?.(rows.slice(at, at + 6).map(row => row.id))) || [];
    if (!alive()) return;
    for (const {id, blob} of kept) { got.add(id); put(id, blob); }
  }
  for (const row of rows) {
    if (got.has(row.id)) continue;
    const blob = await thumbBlob(api, row);
    if (!alive()) return;
    if (blob) put(row.id, blob);
  }
}

/** A photo's middle-sized picture for a chat bubble, a post or the 今天 widget, or null: then show the photo itself
 *  (one is made in the background for next time). */
export async function previewBlob(api, id) {
  return (await asked(() => api.photoPreview?.(id))) || null;
}
