/* Original, gentle Pokémon-inspired town music. No downloads or third-party player. */
(() => {
 'use strict';
 const key='pokemon-draft-music-muted-v1';
 let unlocked=false,muted=false,context,master,timer,step=0,next=0;
 try { muted=localStorage.getItem(key)==='true'; } catch {}
 // A relaxed 32-bar loop with space between phrases, soft bells and warm chords.
 const melody=[
  72,0,76,79,0,76,74,0, 72,0,69,72,0,0,0,0,
  74,0,77,81,0,79,77,0, 76,0,74,72,0,0,0,0,
  69,0,72,76,0,74,72,0, 67,0,71,74,0,0,0,0,
  69,0,74,77,0,76,74,0, 72,0,0,0,0,0,0,0,
  76,0,79,84,0,81,79,0, 76,0,72,69,0,0,0,0,
  77,0,81,79,0,77,74,0, 76,0,74,72,0,0,0,0,
  72,0,76,79,0,76,72,0, 71,0,74,77,0,74,71,0,
  69,0,74,77,0,74,71,0, 72,0,0,0,0,0,0,0
 ];
 const chords=[[48,55,64],[45,52,60],[50,57,65],[43,55,62],[41,53,60],[48,55,64],[50,57,65],[43,53,59]];
 const beat=60/86/2;
 const soundIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
 const muteIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/><path d="m16 9 6 6m0-6-6 6"/></svg>';
 function sync(){ document.querySelectorAll('.music-toggle').forEach(b=>{b.innerHTML=muted?muteIcon:soundIcon;b.setAttribute('aria-label',muted?'Unmute music':'Mute music');b.setAttribute('aria-pressed',String(!muted));b.title=muted?'Music off':'Quiet town music · on';}); }
 function note(midi,time,length,volume,type='sine'){
  const osc=context.createOscillator(),gain=context.createGain();osc.type=type;osc.frequency.value=440*2**((midi-69)/12);
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.035);gain.gain.exponentialRampToValueAtTime(.0001,time+length);
  osc.connect(gain);gain.connect(master);osc.start(time);osc.stop(time+length+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
 }
 function schedule(){
  if(!context||context.state!=='running'||muted||document.hidden)return;
  if(next<context.currentTime)next=context.currentTime+.05;
  while(next<context.currentTime+.3){
   const n=step%melody.length;
   if(melody[n])note(melody[n],next,beat*1.65,.13,'triangle');
   if(n%8===0){const chord=chords[Math.floor(n/8)%8];chord.forEach(m=>note(m,next,beat*7,.025));note(chord[0]-12,next,beat*5,.045);}
   step++;next+=beat;
  }
 }
 async function start(){
  if(!unlocked||muted||document.hidden)return;
  try{
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
   if(!context){context=new Audio();master=context.createGain();master.gain.value=.18;master.connect(context.destination);}
   if(context.state!=='running')await context.resume();
   if(context.state!=='running'||muted||document.hidden)return;
   master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(.18,context.currentTime,.15);
   if(!timer)timer=setInterval(schedule,150);schedule();
  }catch{/* A later deliberate tap retries Safari's audio permission. */}
 }
 function toggle(){
  muted=!muted;try{localStorage.setItem(key,String(muted));}catch{}
  if(muted){clearInterval(timer);timer=null;if(master&&context)master.gain.setTargetAtTime(0,context.currentTime,.04);}else start();sync();
 }
 function button(){const b=document.createElement('button');b.type='button';b.className='music-toggle';b.addEventListener('click',toggle);return b;}
 const main=button();main.id='music-toggle';document.querySelector('.header-actions').append(main);sync();
 // Modal auctions and reports keep mute within reach, even when the header is inert.
 function mount(){let added=false;document.querySelectorAll('dialog .dialog-heading,dialog .analysis-identity').forEach(h=>{if(!h.querySelector('.music-toggle')){h.append(button());added=true;}});if(added)sync();}
 mount();new MutationObserver(mutations=>{if(mutations.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('dialog,.dialog-heading,.analysis-identity')||n.querySelector?.('dialog,.dialog-heading,.analysis-identity')))))mount();}).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('pointerdown',e=>{if(e.isTrusted){unlocked=true;start();}},{passive:true});document.addEventListener('keydown',e=>{if(e.isTrusted){unlocked=true;start();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInterval(timer);timer=null;context?.suspend().catch(()=>{});}else start();});
 window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;context?.suspend().catch(()=>{});});window.addEventListener('pageshow',start);
})();
