// The heart on a picture shown full size outside the album (聊天, 朋友圈, 助手), as one more button of the viewer.

/** An action for openImageViewer. idAt(index): the album photo of what is shown. Null when the phone cannot say. */
export async function viewerHeart(api, idAt, notify = () => {}) {
  if (!api.favoritePhotoIds) return null;
  const hearts = new Set(await api.favoritePhotoIds().catch(() => []));
  return {label: i => hearts.has(idAt(i)) ? '♥ 已收藏' : '♡ 收藏', run: async i => {
    const id = idAt(i), on = !hearts.has(id);
    try { await api.favoritePhotos([id], on); if (on) hearts.add(id); else hearts.delete(id); }
    catch (error) { notify(error.message, {error: true}); }
    return false;
  }};
}
