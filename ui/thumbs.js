// Small pictures for photo grids (the album, the photo pickers): the one the photo list brings, else one the backend
// makes and keeps (core/thumbnail.js), else the photo itself. A grid that decoded every photo at full size was what
// made the album slow on phones.

/** What to show for a photo row in a grid: a Blob, or null when the photo is gone. */
export async function thumbBlob(api, row) {
  if (row?.thumb) return row.thumb;
  const made = await api.photoThumb?.(row.id).catch(() => null);
  return made || (await api.getPhoto(row.id).catch(() => null))?.blob || null;
}
