import { useEffect, useRef, useState } from 'react'
import { Bot, MessageCircle, Send, Sparkles, Trash2, UserRound, Plus, History, PanelLeftClose } from 'lucide-react'
import MarkdownMessage from './MarkdownMessage.jsx'

const defaultStarters=['Recommend an anime for me','Give me a spoiler-free anime for tonight','Which anime should I watch next?','Who are the smartest anime strategists?']
function makePersonalizedStarters(watchlist=[]){
 const saved=(Array.isArray(watchlist)?watchlist:[]).map(item=>({
  title:item?.title || item?.anime?.title?.english || item?.anime?.title?.romaji || item?.anime?.title?.native,
  genres:item?.anime?.genres || []
 })).filter(item=>item.title)
 if(!saved.length)return defaultStarters
 const first=saved[0]
 const second=saved[1]
 const genreCounts=new Map()
 saved.forEach(item=>item.genres.forEach(genre=>genreCounts.set(genre,(genreCounts.get(genre)||0)+1)))
 const topGenres=[...genreCounts.entries()].sort((a,b)=>b[1]-a[1]).map(([genre])=>genre)
 const questions=[
  `Recommend anime similar to ${first.title}`,
  `Give me a spoiler-free anime based on my watchlist`,
  second ? `Compare ${first.title} and ${second.title} without major spoilers` : `What should I watch after ${first.title}?`,
  topGenres.length ? `Recommend anime with more ${topGenres.slice(0,2).join(' and ')} in my watchlist taste` : `What do my saved anime have in common?`
 ]
 return [...new Set(questions)].slice(0,4)
}
function makeWelcome(username){const name=(username||'').trim();return {role:'assistant',content:name?`Hey, ${name}! 👋 I'm Neko 🐾 Your anime companion for recommendations, watch orders, character debates, and spoiler-free explanations. What are we watching today?`:"Hey, anime fan! I'm Neko 🐾 Your anime companion for recommendations, watch orders, character debates, and spoiler-free explanations. What are we watching today?"}}
function newConversation(username){return {id:`chat-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:'New chat',messages:[makeWelcome(username)],updatedAt:Date.now()}}
export default function ChatPanel({apiBase,token,username,watchlist=[]}){
 const welcome=makeWelcome(username)
 const suggestedQuestions=makePersonalizedStarters(watchlist)
 const [chats,setChats]=useState([newConversation(username)])
 const [currentId,setCurrentId]=useState(null)
 const [historyLoaded,setHistoryLoaded]=useState(false)
 const [draft,setDraft]=useState('');const [sending,setSending]=useState(false);const [error,setError]=useState('');const [showHistory,setShowHistory]=useState(false);const bottomRef=useRef(null);const inputRef=useRef(null)
 const current=chats.find(c=>c.id===currentId)||chats[0];const messages=current?.messages||[welcome]
 useEffect(()=>{if(!currentId&&current)setCurrentId(current.id)},[currentId,current])
 useEffect(()=>{let alive=true;fetch(`${apiBase}/api/account/chats`,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{if(!r.ok)throw new Error('Could not load chat history');return r.json()}).then(d=>{if(!alive)return;const saved=Array.isArray(d.value)?d.value:[];const normalized=saved.length?saved.map(c=>({...c,messages:(Array.isArray(c.messages)?c.messages:[]).filter((m,i)=>m && (m.role!=='assistant' || (typeof m.content==='string' && m.content.trim()) || i===0)).map((m,i)=>i===0&&m.role==='assistant'&&/Hey, anime fan!|Hey there!/i.test(m.content||'')?welcome:m)})).map(c=>c.messages.length?c:{...c,messages:[welcome]}):[newConversation(username)];setChats(normalized);setCurrentId(normalized[0]?.id||null)}).catch(e=>{console.error(e);if(alive){setChats([newConversation(username)]);setCurrentId(null)}}).finally(()=>{if(alive)setHistoryLoaded(true)});return()=>{alive=false}},[apiBase,token,username])
 useEffect(()=>{if(!historyLoaded)return;const timer=setTimeout(()=>{fetch(`${apiBase}/api/account/chats`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({value:chats.slice(0,40).map(c=>({...c,messages:c.messages.filter((m,i)=>m.role!=='assistant'||(typeof m.content==='string'&&m.content.trim())||i===0)}))})}).catch(e=>console.error('Chat history sync failed',e))},600);return()=>clearTimeout(timer)},[chats,historyLoaded,apiBase,token])
 useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages,sending])
 function patchMessages(id,fn){setChats(old=>old.map(c=>c.id===id?{...c,messages:fn(c.messages),updatedAt:Date.now()}:c))}
 function createChat(){const c=newConversation(username);setChats(old=>[c,...old]);setCurrentId(c.id);setDraft('');setError('');setShowHistory(false)}
 async function sendMessage(text=draft){
  const content=String(text||'').trim();
  if(!content||sending||!current)return;
  const id=current.id;
  const prior=messages.filter(m=>(m.role==='user'||m.role==='assistant')&&typeof m.content==='string'&&m.content.trim());
  const updated=[...prior,{role:'user',content}];
  patchMessages(id,()=>[...updated,{role:'assistant',content:''}]);
  setChats(old=>old.map(c=>c.id===id?{...c,title:c.messages.length<=1?content.slice(0,34):c.title}:c));
  setDraft('');setError('');setSending(true);
  try{
   const response=await fetch(`${apiBase}/api/chat/stream`,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({messages:updated.slice(-12)})
   });
   if(!response.ok){
    const d=await response.json().catch(()=>({}));
    const detail=typeof d.detail==='string'?d.detail:`Request failed (${response.status})`;
    throw new Error(detail);
   }
   if(!response.body)throw new Error('Streaming is not supported by this connection.');
   const reader=response.body.getReader();
   const decoder=new TextDecoder();
   let buffer='';let full='';let gotDone=false;
   const consumeEvent=(eventText)=>{
    const dataLines=eventText.split(/\r?\n/).filter(line=>line.startsWith('data:'));
    if(!dataLines.length)return;
    const raw=dataLines.map(line=>line.slice(5).trim()).join('\n');
    if(raw==='[DONE]'){gotDone=true;return;}
    let packet;
    try{packet=JSON.parse(raw);}catch{return;}
    if(packet?.error)throw new Error(typeof packet.error==='string'?packet.error:'Neko could not complete the response.');
    const deltaText=packet?.text??packet?.delta?.content??packet?.choices?.[0]?.delta?.content??packet?.choices?.[0]?.text;
    if(typeof deltaText==='string'&&deltaText.length){
     full+=deltaText;
     patchMessages(id,arr=>{
      const copy=[...arr];
      const last=copy.length-1;
      if(copy[last]?.role==='assistant')copy[last]={...copy[last],content:full};
      return copy;
     });
    }
   };
   while(true){
    const {value,done}=await reader.read();
    if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    const events=buffer.split(/\r?\n\r?\n/);
    buffer=events.pop()||'';
    for(const eventText of events)consumeEvent(eventText);
   }
   buffer+=decoder.decode();
   if(buffer.trim())consumeEvent(buffer);
   if(!full.trim())throw new Error(gotDone?'Neko returned an empty reply. Please try again.':'The response ended without any text. Check the backend log and retry.');
  }catch(e){
   const message=typeof e?.message==='string'?e.message:'Something went wrong. Please try again.';
   setError(`${message} You can retry your message.`);
   patchMessages(id,arr=>{
    const copy=[...arr];
    const last=copy[copy.length-1];
    if(last?.role==='assistant'&&!String(last.content||'').trim())copy.pop();
    return copy;
   });
  }finally{setSending(false);inputRef.current?.focus();}
 }
 function clearChat(){patchMessages(current.id,()=>[welcome]);setError('');setChats(old=>old.map(c=>c.id===current.id?{...c,title:'New chat'}:c))}
 return <section className="chat-layout neko-chat-layout"><div className="chat-intro"><div className="chat-emblem neko-emblem"><Sparkles size={23}/></div><div><div className="eyebrow">YOUR PERSONAL ANIME COMPANION</div><h2>Talk anime with <span>Neko.</span></h2><p>Recommendations, lore, watch orders, and character debates — spoiler-aware by default.</p></div><button className="chat-clear" onClick={createChat} title="Start a new conversation"><Plus size={16}/><span>New chat</span></button></div>
 <div className="chat-toolbar"><button onClick={()=>setShowHistory(v=>!v)}><History size={16}/>{showHistory?'Hide history':'Chat history'} <span>{chats.length}</span></button><button onClick={clearChat}><Trash2 size={15}/> Clear current</button></div>
 {showHistory&&<div className="chat-history">{chats.map(c=><button key={c.id} className={c.id===current?.id?'history-active':''} onClick={()=>{setCurrentId(c.id);setShowHistory(false);setError('')}}><MessageCircle size={15}/><span>{c.title||'New chat'}</span><small>{new Date(c.updatedAt).toLocaleDateString()}</small></button>)}</div>}
 <div className="chat-window"><div className="chat-window-head"><div className="chat-bot-avatar neko-chat-avatar"><Bot size={19}/></div><div><b>NEKO AI</b><small><i/> NVIDIA NIM · GPT-OSS-20B</small></div><span className="chat-beta">ONLINE</span></div><div className="chat-messages" aria-live="polite">{messages.map((m,i)=><div className={`chat-message ${m.role}`} key={`${current?.id}-${i}-${m.role}`}><div className="message-avatar">{m.role==='assistant'?<Bot size={16}/>:<UserRound size={16}/>}</div><div className="message-bubble"><span className="message-author">{m.role==='assistant'?'NEKO':'YOU'}</span>{m.role==='assistant'?m.content?<MarkdownMessage content={m.content}/>:sending&&i===messages.length-1?<p className="typing"><i/><i/><i/> Neko is thinking…</p>:null:<p>{m.content}</p>}</div></div>)}<div ref={bottomRef}/></div>
 {messages.length===1&&<div className="prompt-suggestions"><span>TRY ASKING NEKO</span>{suggestedQuestions.map(s=><button key={s} onClick={()=>sendMessage(s)} disabled={sending}>{s}</button>)}</div>}{error&&<div className="chat-error" role="alert">{error}<button onClick={()=>sendMessage(messages.filter(m=>m.role==='user').at(-1)?.content||'')}>Retry</button></div>}
 <form className="chat-composer" onSubmit={e=>{e.preventDefault();sendMessage()}}><textarea ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}}} placeholder="Message Neko about anime…" rows={1} maxLength={3000} aria-label="Message Neko"/><button type="submit" disabled={!draft.trim()||sending} aria-label="Send message"><Send size={18}/></button><small>Enter to send · Shift + Enter for a new line</small></form></div><div className="chat-footnote"><MessageCircle size={14}/> Neko can make mistakes. Verify important release dates and official announcements.</div></section>
}
