import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIPv4} from 'node:net';

export const info={id:'iphonie-web',name:'ST-iPhonie 网页与搜索',description:'Public page excerpts and Brave Search'};
const limits = new Map();
const API = 'https://api.search.brave.com/res/v1/web/search';

export function publicIPv4(address) {
  if(!isIPv4(address))return false;
  const [a,b,c]=address.split('.').map(Number);
  return a>0 && a<224 && ![10,127].includes(a)
    && !(a===100 && b>=64 && b<=127) && !(a===169 && b===254)
    && !(a===172 && b>=16 && b<=31) && !(a===192 && [0,168].includes(b))
    && !(a===192 && b===88 && c===99) && !(a===198 && [18,19].includes(b))
    && !(a===198 && b===51 && c===100) && !(a===203 && b===0 && c===113);
}

export async function publicTarget(value, resolve=lookup) {
  const url=new URL(value);
  if(url.protocol!=='https:' || url.username || url.password || url.port || isIPv4(url.hostname) ||
    !/^[a-z\d-]+(?:\.[a-z\d-]+)+$/i.test(url.hostname) || /\.(local|localhost|internal|lan|home|arpa)$/i.test(url.hostname)) throw Error('public address required');
  url.hash='';
  url.search='';
  const records=await resolve(url.hostname,{family:4,all:true});
  if(!records.length || records.some(r=>!publicIPv4(r.address)))throw Error('public address required');
  return {url,address:records[0].address};
}

function denyRate(req,kind) {
  const now=Date.now();
  for(const [key,bucket] of limits) if(bucket.until<now)limits.delete(key);
  const owner=String(req.user?.profile?.handle || req.ip || 'local').slice(0,100);
  const key=kind+':'+owner;
  if(limits.size>500 && !limits.has(key))return true;
  const bucket=limits.get(key)||{count:0,until:now+60000};
  limits.set(key,bucket);
  return ++bucket.count>6;
}

const text = (s,n) => String(s || '').replace(/<[^>]*>/g,' ').replace(/&(amp|quot|apos|lt|gt|nbsp|#\d{1,7}|#x[\da-f]{1,6});/gi,(_,key)=>{
  const fixed={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
  if(Object.hasOwn(fixed,key))return fixed[key];
  const code=key.startsWith('#x')?parseInt(key.slice(2),16):Number(key.slice(1));
  return code>0&&code<=0x10ffff?String.fromCodePoint(code):' ';
}).replace(/\s+/g,' ').trim().slice(0,n);

export function pageExcerpt(html) {
  const tags=html.match(/<meta\b[^>]*>/gi)||[];
  const attr=(tag,name)=>tag.match(new RegExp('(?:\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'))?.slice(1).find(x=>x!==undefined)||'';
  let title='',summary='';
  for(const tag of tags){
    const key=attr(tag,'property')||attr(tag,'name');
    const value=attr(tag,'content');
    if(key==='og:title')title=text(value,140);
    if(key==='og:description'||(key==='description'&&!summary))summary=text(value,400);
  }
  const area=html.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2]||'';
  const body=area.replace(/<(script|style|form|iframe|nav|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  const paragraphs=(body.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi)||[]).join(' ');
  return {title:title||text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1],140),summary,text:text(paragraphs,1800)};
}

async function loadPage({url,address}) {
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{agent:false,headers:{Accept:'text/html','Accept-Encoding':'identity'},
      lookup:(_hostname,options,cb)=>options.all?cb(null,[{address,family:4}]):cb(null,address,4),signal:AbortSignal.timeout(8000)},res=>{
      if(res.statusCode!==200 || !/^text\/html\b/i.test(res.headers['content-type']||'')){
        res.destroy();reject(Error('page unavailable'));return;
      }
      let size=0, chunks=[];
      res.on('data',buf=>{
        size+=buf.length;
        if(size>512000){req.destroy(Error('response too large'));return;}
        chunks.push(buf);
      });
      res.on('error',reject);
      res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error',reject);
  });
}

export async function braveSearch(query,key,transport=fetch) {
  const url=new URL(API);
  url.searchParams.set('q',query);
  url.searchParams.set('count','5');
  const res=await transport(url,{redirect:'error',signal:AbortSignal.timeout(9000),
    headers:{Accept:'application/json','X-Subscription-Token':key}});
  if(!res.ok)throw Error('Brave status '+res.status);
  const reader=res.body.getReader();
  const chunks=[];let size=0;
  for(;;){
    const chunk=await reader.read();
    if(chunk.done)break;
    size+=chunk.value.length;
    if(size>384000){await reader.cancel();throw Error('response too large');}
    chunks.push(chunk.value);
  }
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return (data.web?.results||[]).slice(0,5).map(row=>({url:String(row.url||'').slice(0,2000),title:text(row.title,140),description:text(row.description,400)}));
}

export function init(router) {
  router.get('/status',(_req,res)=>res.json({ready:true,provider:'brave'}));
  router.post('/search',async(req,res)=>{
    const {q,key}=req.body||{};
    if(typeof q!=='string'||!q.trim()||q.length>160||typeof key!=='string'||! /^[!-~]{8,256}$/.test(key))return res.status(400).end();
    if(denyRate(req,'search'))return res.status(429).end();
    try{res.json(await braveSearch(q,key));}catch{res.status(502).end();}
  });
  router.post('/page',async(req,res)=>{
    const {url}=req.body||{};
    if(typeof url!=='string'||url.length>2000)return res.status(400).end();
    if(denyRate(req,'page'))return res.status(429).end();
    try{res.json(pageExcerpt(await loadPage(await publicTarget(url))));}catch{res.status(422).end();}
  });
}

