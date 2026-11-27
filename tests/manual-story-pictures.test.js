import test from 'node:test';
import assert from 'node:assert/strict';
import {installDrawSettings} from '../core/backend-draw.js';
import {drawPromptPlan, normalizeDraw, parsePictures} from '../core/draw.js';
import {freshState, normalizeSettings} from '../core/state.js';
import {createPictureHost} from '../host-pictures.js';

const plan = '<img>\n位置：P1\n场景：scenery, rainy street\n</img>';

function setup(mode='manual'){
  const state=normalizeSettings(freshState());
  Object.assign(state.draw,{enabled:true,auto:true,mode});
  state.chat.presets[0].lore=false;
  const chat=[
    {name:'User',is_user:true,mes:'下雨了。'},
    {name:'角色',mes:'雨落在屋檐上。',swipe_id:0,swipes:['雨落在屋檐上。','换了个场景。']},
    {name:'角色',mes:'我的伞。\n<img>scenery, red umbrella</img>',swipe_id:0},
  ];
  const requests=[], generated=[];
  const ctx={chat,chatId:'story',saveChat:async()=>{}};
  const backend={
    drawReady:()=>true, drawQuote:()=>({free:true}), naiSubscription:async()=>null,
    generateText:async(_ctx,request)=>{requests.push(request);return plan;},
    generateImage:async input=>{generated.push(input);throw Object.assign(Error('stop before network'),{cancelled:true});}
  };
  const host=createPictureHost({context:()=>ctx,settings:()=>state,backend,marker:'test',scheduleRender(){},redrawMessage(){},notice(){}});
  return {state,ctx,chat,host,backend,requests,generated};
}

test('手动模式可保存、可预览，旧版设置保持原来的配图方式',()=>{
  class FakeBackend {
    constructor(){this.settings=normalizeSettings(freshState());}
    getState(){return structuredClone(this.settings);}
    save(next){this.settings=normalizeSettings(next);}
    drawCast(){return null;}
  }
  installDrawSettings(FakeBackend);
  const backend=new FakeBackend();
  assert.equal(normalizeDraw({}).mode,'separate');
  assert.equal(normalizeDraw({mode:'inline'}).mode,'inline');
  assert.equal(normalizeDraw({mode:'separate'}).mode,'separate');
  backend.saveDraw({enabled:true,mode:'manual'});
  assert.equal(backend.settings.draw.mode,'manual');
  assert.deepEqual(drawPromptPlan(backend.settings),[]);
  assert.match(backend.previewDrawPrompt(),/位置：P/);
  assert.throws(()=>backend.saveDraw({mode:'wrong'}),/配图方式/);
});

test('手动模式不自动规划或生成，点选旧楼层才调用当前出图规则',async()=>{
  const {chat,host,requests,generated}=setup();
  await host.autoPictures(1);
  await host.autoPictures(2);
  assert.equal(requests.length,0);
  assert.equal(generated.length,0);
  assert.equal(await host.drawMessage(1),true);
  assert.equal(requests.length,1);
  assert.match(requests[0].prompt.at(-1).content,/雨落在屋檐上/);
  assert.equal(parsePictures(chat[1].mes).length,1);
  assert.equal(chat[1].swipes[0],chat[1].mes);
  assert.equal(chat[1].swipes[1],'换了个场景。');
  assert.equal(generated.length,1);
});

test('点最新楼层保留已有出图块，付费照常确认',async()=>{
  const {host,backend,requests,generated}=setup();
  backend.drawQuote=()=>({free:false});
  const confirm=globalThis.confirm;
  try{
    let asked=0;
    globalThis.confirm=()=>{asked++;return false;};
    assert.equal(await host.planLatest(),false);
    assert.equal(asked,1);
    assert.equal(requests.length,0);
    assert.equal(generated.length,0);
  }finally{globalThis.confirm=confirm;}
});

test('切换到手动模式时，正在返回的自动出图块不写入',async()=>{
  const {chat,host,state,backend,generated}=setup('separate');
  let started;
  const entered=new Promise(resolve=>{started=resolve;});
  let resolve;
  backend.generateText=()=>{started();return new Promise(done=>{resolve=done;});};
  const job=host.autoPictures(1);
  await entered;
  state.draw.mode='manual';
  resolve(plan);
  await job;
  assert.equal(parsePictures(chat[1].mes).length,0);
  assert.equal(generated.length,0);
});
