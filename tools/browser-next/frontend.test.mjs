import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {connectTermux,TERMUX_VIEW} from '../../ui/termux-connection.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,5));
test('unreachable, health, credentials, authenticated connection, disconnect and timeout',async()=>{
  const dom=new JSDOM('<main></main>',{url:'http://localhost:8000',pretendToBeVisual:true});
  const win=dom.window,doc=win.document,content=doc.querySelector('main');
  let status='',answer=null;
  win.fetch=async()=>{if(!answer) throw Error('offline');return {ok:true,json:async()=>answer};};
  const ctx={win,doc,notify(){}}, note=s=>status=s;
  const close=connectTermux(ctx,content,note);
  try{
    await tick();assert.match(status,/未检测/);
    const retry=()=>content.querySelector('[data-action=retry]').click();
    content.querySelector('[data-action=guide]').click();assert(content.querySelector('[data-action=install-copy]'));
    answer={service:'iphonie-firefox-v2',state:'environment',code:'dependency'};retry();await tick();
    assert.match(content.textContent,/repair/);
    answer.state='ready';retry();await tick();
    const frame=content.querySelector('iframe');
    function send(state,origin=new URL(TERMUX_VIEW).origin){
      win.dispatchEvent(new win.MessageEvent('message',{source:frame.contentWindow,origin,data:{type:'iphonie-vnc',state}}));
    }
    send('connected','https://other.test');assert.equal(status,'正在连接');
    send('password');assert.match(status,/密码/);send('connected');assert.equal(status,'已连接');
    send('interrupted');assert.equal(status,'连接中断');assert.equal(content.querySelector('iframe'),null);
    answer=null;doc.dispatchEvent(new win.Event('visibilitychange'));await tick();assert.equal(status,'服务未启动');
    answer={service:'iphonie-firefox-v2',state:'ready',code:'ready'};
    const timer=win.setTimeout.bind(win);win.setTimeout=(fn,ms)=>timer(fn,ms===25000?15:ms);
    retry();await new Promise(r=>setTimeout(r,60));assert.match(content.textContent,/超时/);
  }finally{close();dom.window.close();}
});

