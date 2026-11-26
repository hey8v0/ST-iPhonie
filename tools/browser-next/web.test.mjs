import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalizeWebPage,parseWebChoice,providerResults,searchQuery} from '../../core/web-share.js';
import {braveSearch,pageExcerpt,publicTarget,publicIPv4} from '../../server/iphonie-web/index.mjs';
import {ChatStore} from '../../core/chats.js';
import {messageLine} from '../../core/chat.js';
const {compatibility,html}=createRequire(import.meta.url)('../../termux/viewer-patch.cjs');

test('compat2 bypass is scoped to pinned noVNC bootstrap hooks',()=>{
  const upstream='supportsWebCodecsH264Decode = await _checkWebCodecsH264DecodeSupport();';
  assert.match(compatibility(upstream),/supportsWebCodecsH264Decode = false/);
  assert.throws(()=>compatibility('different upstream version'));
  const patched=html('<script type="module">import UI from "./app/ui.js";</script>');
  assert.match(patched,/viewer-controls\.js/);
  assert.match(patched,/viewer-bootstrap\.js/);
});

test('external text has distinct fields and ambiguous model output never grants a tool call',()=>{
  const page=normalizeWebPage({url:'https://example.com/article',title:'Example',text:'excerpt',captions:'caption',selection:'selection',note:'note',screenshotId:'image'});
  const model=messageLine({kind:'web',from:'me',page,seen:1},'User');
  assert.match(model,/"text":"excerpt"/);
  assert.match(model,/"captions":"caption"/);
  assert.match(model,/"screenshot":"附图1"/);
  assert.doesNotMatch(messageLine({kind:'web',from:'me',page},'User'),/"screenshot":/);
  assert.equal(normalizeWebPage({url:'javascript:alert(1)'}),null);
  assert.equal(normalizeWebPage({url:'https://example.com/watch?v=42&access_token=private#id_token=private'}).url,'https://example.com/watch?v=42');
  assert.equal(parseWebChoice('{"id":1,"url":"https://fake.test"}','id'),null);
  assert.equal(parseWebChoice('Some prose {"query":"food"}','query'),null);
  assert.equal(searchQuery('private@example.com'),'');
});

test('public page fetching isolates metadata and blocks internal or ambiguous destinations',async()=>{
  const page=pageExcerpt('<title>Example &amp; News</title><main><form><p>private field</p></form><p>Public paragraph.</p></main>');
  assert.deepEqual(page,{title:'Example & News',summary:'',text:'Public paragraph.'});
  assert.equal(publicIPv4('100.64.1.2'),false);
  let called=0;
  const dns=async()=>{called++;return [{address:'93.184.216.34'}];};
  const {url,address}=await publicTarget('https://example.com/story?key=secret#fragment',dns);
  assert.equal(address,'93.184.216.34');assert.equal(url.href,'https://example.com/story');
  for(const bad of ['https://127.1/','https://[::1]/','http://example.com/','https://user@example.com/','https://example.com:444/','https://name.local/'])
    await assert.rejects(publicTarget(bad,dns));
  assert.equal(called,1);
  await assert.rejects(publicTarget('https://example.com/',async()=>[{address:'93.184.216.34'},{address:'192.168.1.2'}]));
});

test('Brave request has a fixed destination and only provider-maintained result IDs',async()=>{
  let calls=0;
  const rows=providerResults(await braveSearch('public news','test-secret',async(url,options)=>{
    calls++;
    assert.equal(url.origin,'https://api.search.brave.com');
    assert.equal(url.searchParams.get('q'),'public news');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers['X-Subscription-Token'],'test-secret');
    return Response.json({web:{results:[{url:'https://example.com/item',title:'<b>Known</b>',description:'Summary'},{url:'http://127.0.0.1/',title:'Private'}]}});
  }));
  assert.equal(calls,1);
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,1);
  assert.equal(rows[0].title,'Known');
  assert.equal(rows[0].source,'search');
});


test('web cards survive reopening and support note edit and deletion',async()=>{
  const {indexedDB}=createRequire(import.meta.url)('fake-indexeddb');
  const scope='browser-next-test-'+crypto.randomUUID();
  let chats=new ChatStore(scope,{indexedDB});
  const thread=await chats.create({type:'dm',members:['Char']});
  await chats.append(thread.id,[{kind:'web',from:'me',page:{url:'https://example.com',title:'Page',note:'my note'}}]);
  chats.close();
  chats=new ChatStore(scope,{indexedDB});
  const [card]=(await chats.get(thread.id)).messages;
  assert.equal(card.kind,'web');
  assert.equal(card.page.url,'https://example.com/');
  await chats.updateMessage(thread.id,card.id,{text:'edited'});
  assert.equal((await chats.get(thread.id)).messages[0].page.note,'edited');
  await chats.removeMessages(thread.id,[card.id]);
  assert.equal((await chats.get(thread.id)).messages.length,0);
  chats.close();
});
