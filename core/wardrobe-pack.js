import {rowJSON, withBlobs} from './backup.js';
import {LIBRARY_LIMITS} from './library.js';
import {hashText} from './sync.js';
import {cleanItem, SHARED_OWNER, WARDROBE_LIMITS} from './wardrobe.js';

const FORMAT = 'st-iphonie-wardrobe', VERSION = 1;
const LIMIT = Math.ceil(LIBRARY_LIMITS.total * 4 / 3) + 4 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']);
const ITEM_ID = /^wardrobe:item:[\w-]{4,80}$/;
const metadata = ({name, category, description, collections, cut, age, naiTags}) =>
  ({name, category, description, collections:collections || [], cut:cut || '', age:age || '', ...(naiTags ? {naiTags} : {})});

export async function writeWardrobePack(items, getPhoto) {
  const chunks = ['{"format":"' + FORMAT + '","version":' + VERSION + ',"items":['];
  let count = 0, bytes = 0;
  for (const item of items) {
    if (!item.shared) continue;
    const photo = item.photoId ? (await getPhoto(item.photoId))?.blob : null;
    if (item.photoId && (!photo || !TYPES.has(photo.type))) throw Error('「' + item.name + '」的图片不可导出，请检查相册原图');
    bytes += photo?.size || 0;
    if (bytes > LIBRARY_LIMITS.total) throw Error('图片太多，请分批导出');
    chunks.push(count++ ? ',' : '', await rowJSON({id:item.id, ...metadata(item), ...(photo ? {photo} : {})}));
  }
  if (!count) throw Error('这里没有可以导出的衣物');
  const blob = new Blob([...chunks, ']}'], {type:'application/json'});
  if (blob.size > LIMIT || count > WARDROBE_LIMITS.items) throw Error('衣柜包太大，请分批导出');
  return blob;
}

export async function readWardrobePack(file) {
  if (!file?.size || file.size > LIMIT) throw Error('衣柜包为空或太大');
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw Error('无法读取衣柜包'); }
  const input = data?.items;
  if (data?.format !== FORMAT || data.version !== VERSION || !Array.isArray(input) || !input.length || input.length > WARDROBE_LIMITS.items) throw Error('这不是支持的通用衣柜包');
  const ids = new Set(), rows = [];
  let total = 0;
  for (const row of input) {
    if (typeof row?.id !== 'string' || !ITEM_ID.test(row.id) || ids.has(row.id) || typeof row.name !== 'string' || !row.name.trim()) throw Error('衣柜包有重复编号或无效衣物');
    ids.add(row.id);
    let photo = null;
    if (row.photo != null) {
      const data = row.photo?.$blob;
      if (!TYPES.has(data?.type) || typeof data.data !== 'string' || !data.data || data.data.length > Math.ceil(LIBRARY_LIMITS.photo / 3) * 4) throw Error('衣柜包有无效的图片');
      try { photo = withBlobs({$blob:data}); } catch { throw Error('衣柜包有无法读取的图片'); }
      total += photo.size;
      if (!photo.size || photo.size > LIBRARY_LIMITS.photo || total > LIBRARY_LIMITS.total) throw Error('衣柜包图片太大');
    }
    const item = cleanItem({...metadata(row), id:row.id, owner:SHARED_OWNER, ...(photo ? {photoId:'packed'} : {})});
    delete item.photoId;
    rows.push({item, photo});
  }
  return rows;
}

export async function compareWardrobePack(rows, current, getPhoto) {
  const byId = new Map(current.map(item => [item.id, item]));
  const summary = {added:0, duplicate:0, conflicts:0};
  const plans = [];
  for (const {item, photo} of rows) {
    const prior = byId.get(item.id);
    let action = 'added';
    if (prior?.shared) {
      const oldPhoto = prior.photoId ? (await getPhoto(prior.photoId))?.blob : null;
      const same = JSON.stringify(metadata(item)) === JSON.stringify(metadata(prior)) &&
        (!oldPhoto && !photo || oldPhoto && photo && oldPhoto.size === photo.size &&
          await rowJSON({photo:oldPhoto}) === await rowJSON({photo}));
      action = same ? 'duplicate' : 'conflicts';
    }
    summary[action]++;
    plans.push({item, photo, prior, action});
  }
  const revision = await hashText(JSON.stringify(plans.map(({item, prior, action}) =>
    [item.id, prior?.updatedAt, prior?.photoId, prior?.shared ? metadata(prior) : undefined, action])));
  return {summary, plans, revision};
}
