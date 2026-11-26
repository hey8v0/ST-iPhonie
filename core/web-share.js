const field = (value, limit) => typeof value==='string' ? value.trim().slice(0,limit) : '';

export function publicLink(value) {
  try {
    const url=new URL(field(value,2000));
    if(!['https:','http:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch {return '';}
}

export function normalizeWebPage(value = {}) {
  const link=publicLink(value?.url);
  if(!link) return null;
  const url=new URL(link);
  const credentials=/^(?:access[-_]?token|refresh[-_]?token|id[-_]?token|token|api[-_]?key|key|session(?:id)?|sid|password|passwd|auth|credential|signature|sig|code|authorization|x-amz-.+)$/i;
  for(const name of [...url.searchParams.keys()])if(credentials.test(name))url.searchParams.delete(name);
  // Fragments can contain OAuth tokens. Preserve ordinary in-page anchors.
  if(url.hash.includes('=') && [...new URLSearchParams(url.hash.slice(1)).keys()].some(name=>credentials.test(name)))url.hash='';
  return {url:url.href, title:field(value.title,140), site:url.hostname,
    summary:field(value.summary,400), text:field(value.text,1800),
    selection:field(value.selection,600), captions:field(value.captions,1000),
    note:field(value.note,300), coverId:field(value.coverId,512), screenshotId:field(value.screenshotId,512),
    source:value.source==='search'?'search':'user'};
}

export function pageContext(page, seen) {
  if(!page) return '';
  const {url,title,site,summary,text,selection,captions,note,source}=page;
  return JSON.stringify({url,title,site,summary,text,selection,captions,note,source,
    screenshot:seen ? '附图'+seen : undefined});
}

export function parseWebChoice(text, fieldName) {
  try {
    const data=JSON.parse(String(text).trim());
    if(!data || Object.keys(data).length!==1 || !Object.hasOwn(data,fieldName)) return null;
    return data[fieldName];
  } catch {return null;}
}

export function searchQuery(value) {
  const query=field(value,160).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ');
  return /https?:|@|\b(?:api[_ -]?key|bearer|password)\b|[a-z\d_-]{32,}|\d{7,}/i.test(query) ? '' : query;
}

export function providerResults(value) {
  return (Array.isArray(value)?value:[]).slice(0,5)
    .map(item=>normalizeWebPage({url:item?.url,title:item?.title,summary:item?.description,source:'search'}))
    .filter(item=>item && !/^(?:localhost|\[|\d+\.\d+\.\d+\.\d+$)|\.(?:local|internal|localhost|lan)$/i.test(item.site)).map((item,i)=>({...item,id:i+1}));
}

