const field = (value, limit) => typeof value==='string' ? value.trim().slice(0,limit) : '';

export function publicLink(value) {
  try {
    const url=new URL(field(value,2000));
    if(!['https:','http:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch {return '';}
}

export function normalizeWebPage(value = {}) {
  const url=publicLink(value?.url);
  if(!url) return null;
  return {url, title:field(value.title,140), site:new URL(url).hostname,
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

