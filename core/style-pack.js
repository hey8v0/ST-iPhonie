import {styleParams} from './draw.js';

// A portable pack contains prompt text and drawing parameters. Covers and local IDs belong to the source library.
export function stylePack(name, styles, grouped = false) {
  if (typeof name !== 'string' || !name.trim() || !Array.isArray(styles) || !styles.length) throw Error('画风包没有名称或画风');
  const rows = styles.map(style => {
    if (!style || typeof style.name !== 'string' || !style.name.trim()) throw Error('画风缺少名称');
    const row = {name: style.name.trim().slice(0, 60)};
    for (const key of ['artist', 'positive', 'negative']) {
      if (typeof style[key] !== 'string' || style[key].length > 4000) throw Error('画风提示词格式无效');
      row[key] = style[key];
    }
    if (style.params != null) {
      if (typeof style.params !== 'object' || Array.isArray(style.params)) throw Error('参数格式无效');
      row.params = styleParams(style.params);
    }
    return row;
  });
  return {format: 'st-iphonie.styles', version: 1, name: name.trim().slice(0, 60), grouped, styles: rows};
}

export function readStylePack(data) {
  if (data?.format !== 'st-iphonie.styles' || data.version !== 1) throw Error('请选择 ST-iPhonie 导出的画风包');
  return stylePack(data.name, data.styles, data.grouped === true || data.styles?.length > 1);
}
