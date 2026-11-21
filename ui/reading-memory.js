import {emptyBook, nextBatch, nextMerge, addNode, buildMemoryRequest, parseMemory,
  chunks, recall, recallText, memoryText, unwritten} from '../core/memory.js';

export async function readingMemory(api, room, messages, who) {
  if (messages.length <= 24) return {recent:messages, text:''};
  const thread={messages:messages.map((m,i)=>({id:m.id || 'legacy:'+i, at:m.at || i+1,
    from:m.from==='me'?'me':who,kind:'text',text:m.text}))};
  let memory=room.memory || emptyBook(room.id,who);
  const batch=nextBatch(thread,memory,{window:24,batch:12});
  async function summarize(input){
    return parseMemory(await api.summarizeReading(buildMemoryRequest({who,...input})));
  }
  if(batch.length){
    const last=batch.at(-1), text=await summarize({level:0,messages:batch});
    memory=addNode(memory,{level:0,text,from:batch[0].at,to:last.at,count:batch.length},{through:last});
  }
  const merge=nextMerge(memory,{stage:5,epic:4});
  if(merge){
    const text=await summarize(merge);
    memory=addNode(memory,{level:merge.level,text,covers:merge.nodes.map(n=>n.id)});
  }
  room.memory=memory;
  const recent=messages.slice(-Math.min(35,Math.max(24,unwritten(thread,memory).length)));
  const matches=recall(chunks(thread,{window:recent.length,timestamps:false}),messages.at(-1).text,{limit:2});
  return {recent,text:[memoryText(memory,{who,timestamps:false}),recallText(matches,{who,timestamps:false})].filter(Boolean).join('\n\n')};
}
