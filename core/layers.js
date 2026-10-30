// Lists kept in groups, the way Procreate's layers are (画风, 提示词片段, 角色): rows carry the id of their group, the groups
// are a list of their own, and a group's rows sit together. The gestures are in ui/layer-sort.js.

const cleanGroup = (g, fallback) => ({id: String(g.id), name: String(g.name ?? '').trim().slice(0, 40) || fallback, open: g.open !== false, ...(g.card ? {card: String(g.card)} : {})});

/** A grouped list made tidy: each group's rows together where its first one is, a group with no rows gone, a row naming
 *  no group there out of groups. [rows, groups]. */
export function tidyGroups(rows, list, fallback = '新建组') {
  const groups = new Map();
  for (const g of Array.isArray(list) ? list : []) {
    if (!g || typeof g !== 'object' || !g.id || groups.has(String(g.id))) continue;
    groups.set(String(g.id), cleanGroup(g, fallback));
  }
  const out = [], placed = new Set();
  for (const s of rows) if (s.group && !groups.has(s.group)) delete s.group;
  for (const s of rows) {
    if (placed.has(s)) continue;
    if (!s.group) { out.push(s); placed.add(s); continue; }
    for (const m of rows) if (m.group === s.group && !placed.has(m)) { out.push(m); placed.add(m); }
  }
  const used = new Set(out.map(s => s.group).filter(Boolean));
  return [out, [...groups.values()].filter(g => used.has(g.id))];
}

/** A grouped list as it shows: [{style} | {group, styles}] in order (a row of any kind goes under `style`). */
export function layerTree(rows, list) {
  const groups = new Map((list || []).map(g => [g.id, g])), out = [], open = new Map();
  for (const style of rows) {
    const group = style.group && groups.get(style.group);
    if (!group) { out.push({style}); continue; }
    if (!open.has(group.id)) { const entry = {group, styles: []}; open.set(group.id, entry); out.push(entry); }
    open.get(group.id).styles.push(style);
  }
  return out;
}

/**
 * The rows in the order of tree ([{style: id} | {group: {id, name, open}, styles: [id]}]), marked with their groups.
 * Rows not given keep their order after the rest; a group with no row given goes. [rows, groups]. Changes the rows.
 */
export function arrangeRows(rows, tree, fallback = '新建组') {
  const byId = new Map(rows.map(s => [s.id, s])), order = [], groups = [], seen = new Set();
  const take = (id, group) => {
    const s = byId.get(String(id));
    if (!s || seen.has(s.id)) return false;
    seen.add(s.id);
    if (group) s.group = group; else delete s.group;
    order.push(s);
    return true;
  };
  for (const entry of tree) {
    if (entry?.group && typeof entry.group === 'object') {
      const g = cleanGroup({...entry.group, id: entry.group.id || crypto.randomUUID()}, fallback);
      let any = false;
      for (const id of Array.isArray(entry.styles) ? entry.styles : []) any = take(id, g.id) || any;
      if (any && !groups.some(x => x.id === g.id)) groups.push(g);
    } else take(entry?.style);
  }
  for (const s of rows) if (!seen.has(s.id)) { delete s.group; order.push(s); }
  return [order, groups];
}
