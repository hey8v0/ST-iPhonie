import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVoiceModels,mergeVoiceModels,voiceTransport,voiceModelId} from '../core/model-catalog.js';
import {turboUrl,turboFrames,elevenTurboSpeech} from '../core/eleven-dialogue.js';
import {voiceModelChoices, voiceModelControl, FOLLOW_MODEL} from '../ui/voice-model-picker.js';

test('ElevenLabs directory selects only text-to-speech models',()=>{
 const data=[
  {model_id:'eleven_v4_turbo',name:'Eleven v4 Turbo',can_do_text_to_speech:true},
  {model_id:'scribe_v2',can_do_text_to_speech:false},
  {model_id:'eleven_flash_v2_5',can_do_text_to_speech:true}
 ];
 assert.deepEqual(parseVoiceModels('eleven',data).map(x=>x.id),['eleven_v4_turbo','eleven_flash_v2_5']);
});
test('Fish models are normalized and stable presets survive',()=>{
 const live=parseVoiceModels('fish',{data:[{id:'fish-audio/s2.1-pro'},{id:'fish-audio/next-model'}]});
 assert.deepEqual(live.map(x=>x.id),['s2.1-pro','next-model']);
 assert.deepEqual(mergeVoiceModels('fish',['s1'],live,'manual-model').map(x=>x.id),
 ['s1','s2.1-pro','next-model','manual-model']);
});
test('untrusted model ids cannot inject markup or paths',()=>{
 assert.equal(voiceModelId('eleven','eleven_v4_turbo'),true);
 assert.equal(voiceModelId('eleven','evil?<x>'),false);
 assert.equal(voiceModelId('eleven',''),false);
});
test('only v4 Turbo activates the dialogue transport',()=>{
 assert.equal(voiceTransport('eleven','eleven_v4_turbo'),'eleven-dialogue-ws');
 assert.equal(voiceTransport('eleven','eleven_v4'),'http');
 assert.equal(voiceTransport('mini','speech-2.8-turbo'),'http');
});
const request=()=>({
 url:'https://api.elevenlabs.io/v1/text-to-speech/voice123',
 body:{model_id:'eleven_v4_turbo',text:'短台词。',voice_settings:{stability:.5,similarity_boost:.75,speed:2}},
 voice:'voice123',format:'mp3_44100_128'
});
test('Turbo handshake has exactly one voice and closes after the line',()=>{
 const frames=turboFrames(request(),'secret');
 assert.deepEqual(frames[0],{voices:['voice123'],xi_api_key:'secret',voice_settings:{stability:.5,similarity_boost:.75}});
 assert.deepEqual(frames[1],{inputs:[{text:'短台词。',voice_id:'voice123',new_turn:true}]});
 assert.deepEqual(frames[2],{close_socket:true});
 const u=new URL(turboUrl(request()));
 assert.equal(u.protocol,'wss:');
 assert.equal(u.pathname,'/v1/text-to-dialogue/stream-input');
 assert.equal(u.searchParams.get('model_id'),'eleven_v4_turbo');
 assert.equal(u.href.includes('secret'),false);
});
test('Turbo receives all audio chunks as one blob',async()=>{
 const emitted=[];
 class Socket {
  constructor(){queueMicrotask(()=>this.onopen());}
  send(text){
   emitted.push(JSON.parse(text));
   if(emitted.length===3)queueMicrotask(()=>{
    this.onmessage({data:JSON.stringify({audio:btoa('abc')})});
    this.onmessage({data:JSON.stringify({audio:btoa('def')})});
    this.onmessage({data:JSON.stringify({is_final:true})});
   });
  }
  close(){this.closed=true;}
 }
 const blob=await elevenTurboSpeech(request(),'secret',undefined,{WebSocketImpl:Socket,timeout:1000});
 assert.equal(await blob.text(),'abcdef');
 assert.equal(emitted.length,3);
});
test('Turbo cancellation stops an active socket',async()=>{
 let instance;
 class Socket {
  constructor(){instance=this;queueMicrotask(()=>this.onopen());}
  send(){}
  close(){this.closed=true;}
 }
 const controller=new AbortController();
 const p=elevenTurboSpeech(request(),'secret',controller.signal,{WebSocketImpl:Socket,timeout:1000});
 queueMicrotask(()=>controller.abort());
 await assert.rejects(p,{name:'AbortError'});
 assert.equal(instance.closed,true);
});

test('model picker shows all models even when current field contains v4',()=>{
 const rows=voiceModelChoices([
  {id:'eleven_v4'},{id:'eleven_v3'},{id:'eleven_v4_turbo'},
  {id:'eleven_multilingual_v2'}
 ],'eleven_v4');
 assert.deepEqual(rows.map(x=>x.key),[
  'eleven_v4','eleven_v3','eleven_v4_turbo','eleven_multilingual_v2'
 ]);
 assert.equal(rows[0].icon,'check');
 const html=voiceModelControl('eleven_v4',{refresh:true});
 assert.match(html,/data-action="choose-voice-model"/);
 assert.doesNotMatch(html,/<datalist|\\blist="/);
});
test('per-role picker includes follow engine, all models and custom selection',()=>{
 const rows=voiceModelChoices([{id:'eleven_v3'},{id:'eleven_v4_turbo'}],
   'eleven_custom_model','跟随引擎 · eleven_v4');
 assert.equal(rows[0].key,FOLLOW_MODEL);
 assert.deepEqual(rows.slice(1).map(x=>x.key),[
  'eleven_v3','eleven_v4_turbo','eleven_custom_model'
 ]);
});
