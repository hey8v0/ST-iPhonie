// Smaller pictures of photos (core/thumbnail.js), so the phone no longer decodes every photo it shows at full size (what
// made the album slow on phones): small ones for grids, avatars and icons, middle-sized ones for chat bubbles and posts.

/** What to show for a photo row in a grid: a Blob, or null when the photo is gone. */
export async function thumbBlob(api, row) {
  if (row?.thumb) return row.thumb;
  const made = await api.photoThumb?.(row.id).catch(() => null);
  return made || (await api.getPhoto(row.id).catch(() => null))?.blob || null;
}

/** A photo's middle-sized picture for a chat bubble, a post or the 今天 widget, or null: then show the photo itself
 *  (one is made in the background for next time). */
export async function previewBlob(api, id) {
  return (await api.photoPreview?.(id).catch(() => null)) || null;
}
