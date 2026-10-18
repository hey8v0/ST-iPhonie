const engines=['fish','mini','eleven','mimo','doubao','custom'];
export function normalizeRoute(value){const route=structuredClone(value);if(route.aliases!==undefined){const list=cleanAliases(route.aliases,route.name);if(list.length)route.aliases=list;else delete route.aliases;}route.bindings=Object.fromEntries(engines.filter(e=>value.bindings?.[e]).map(e=>[e,{voice:String(value.bindings[e].voice||''),model:String(value.bindings[e].model||'')}]));if(engines.includes(route.engine)){route.voice=String(route.voice??route.bindings[route.engine]?.voice??'');route.model=String(route.model??route.bindings[route.engine]?.model??'');route.bindings[route.engine]={voice:route.voice,model:route.model};}return route;}
export function switchRouteEngine(value,engine){if(!engines.includes(engine))throw Error('引擎无效');const route=normalizeRoute(value);if(engine===route.engine)return route;route.engine=engine;route.voice=route.bindings[engine]?.voice||'';route.model=route.bindings[engine]?.model||'';return route;}
export function removeRoute(settings,id){const next=structuredClone(settings),index=next.routes.findIndex(r=>r.id===id);if(index<0)return next;next.routes.splice(index,1);if(next.selected===id)next.selected=next.routes[Math.min(index,next.routes.length-1)]?.id||'';return next;}
// ---------- 别名 ----------
// The story calls a role by other names too (夏尔 / 夏尔·凡多姆海恩, a surname alone…): they are one role, one voice.
const SEP=/[·・•‧．.\s]+/;
/** A role's other names: typed with commas (or 、 ; and new lines) or as a list; not its own name, each once. */
export function cleanAliases(value,name=''){const list=(Array.isArray(value)?value:String(value??'').split(/[,，、;；\n]+/)).map(x=>String(x??'').trim().slice(0,40)).filter(Boolean);return [...new Set(list)].filter(x=>x!==String(name||'').trim()).slice(0,20);}
/**
 * The role a name in the story means: one named so, else one with it as an 别名, else — for a full name written with a
 * separator (夏尔·凡多姆海恩) — the one role named as one of its parts, or whose full name has it as a part. Else the name.
 */
export function roleName(routes,name){const n=String(name??'').trim(),list=(routes||[]).filter(r=>typeof r?.name==='string'&&r.name.trim());if(!n||list.some(r=>r.name===n))return n;
 const alias=list.find(r=>Array.isArray(r.aliases)&&r.aliases.includes(n));if(alias)return alias.name;
 const parts=s=>s.split(SEP).filter(p=>p.length>=2),mine=parts(n);
 const hits=list.filter(r=>{const theirs=parts(r.name);return mine.length>1&&mine.includes(r.name)||theirs.length>1&&theirs.includes(n);});
 return hits.length===1?hits[0].name:n;}
/** The role (route) a name in the story means, or undefined. */
export function findRoute(routes,name){const n=roleName(routes,name);return (routes||[]).find(r=>r.name===n);}
/** The lines of a reply with their speakers as roles: the 别名 a line was written with becomes the role's name. */
export function withRoles(routes,lines){return lines.map(l=>{if(!l.role)return l;const role=roleName(routes,l.role);return role===l.role?l:{...l,role,said:l.role};});}
