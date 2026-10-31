/* A board-first, read-only broadcast view. Spectators never own a team. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id), pokemon=new Map(POKEMON.map(p=>[p.id,p]));
 let view,tabs,status,recap,lastKey='';
 function node(tag,cls,text){const e=document.createElement(tag);e.className=cls||'';if(text!=null)e.textContent=text;return e;}
 function init(){
  view=node('section','spectator-view');view.id='spectator-view';
  const heading=node('div','spectator-heading');const room=node('button','spectator-room','SPECTATING');room.type='button';room.addEventListener('click',()=>DraftOnline.open());heading.append(room);status=node('span','spectator-status');status.setAttribute('role','status');heading.append(status);
  tabs=node('nav','spectator-tabs');tabs.setAttribute('aria-label','Watch a team');
  recap=node('details','spectator-recap');recap.append(node('summary','','Draft recap'),node('ol','spectator-recap-list'));
  view.append(heading,tabs);document.querySelector('main.game').before(view);document.querySelector('.board-panel').after(recap);
 }
 function render(next,selected=0){
  if(!view)init();document.body.classList.add('spectating');view.hidden=false;recap.hidden=false;
  const {lobby}=next,sale=lobby.auction;view.querySelector('.spectator-room').textContent='WATCHING · ROOM '+lobby.code;
  const p=pokemon.get(sale?.currentPokemonId),lead=sale?.bidding;
  status.textContent=lobby.phase==='waiting'?'Waiting for coaches':lobby.phase==='complete'?'Draft complete':`${p?.name||'Live auction'} · $${lead?.highestBid||0}${lead?.leaderTeam!=null?' · '+lobby.teams[lead.leaderTeam].name:' · No bids'}`;
  const key=JSON.stringify([lobby.teams.map(t=>t.name),sale?.fieldCounts,sale?.counts,selected]);
  if(key!==lastKey){lastKey=key;tabs.replaceChildren(...lobby.teams.map((t,i)=>{
   const b=node('button','',null);b.type='button';b.setAttribute('aria-pressed',String(i===selected));b.append(node('strong','',t.name),node('span','',`${sale?.fieldCounts?.[i]||0}/23 on field · ${sale?.counts?.[i]||0} drafted`));b.addEventListener('click',()=>{DraftOnline.selectTeam(i);render(DraftOnline.state(),i);});return b;
  }));}
  const awards=sale?.awards||[],list=recap.querySelector('ol');
  if(list.dataset.count!==String(awards.length)){list.dataset.count=String(awards.length);list.replaceChildren(...awards.slice().reverse().map(a=>{
   const li=node('li'),p=pokemon.get(a.pokemonId),img=node('img');img.src=p.image;img.alt='';img.loading='lazy';const text=node('div');text.append(node('strong','',p.name),node('span','',lobby.teams[a.team].name));li.append(img,text,node('span','','$'+a.amount));return li;
  }));if(!awards.length)list.append(node('li','','Draft picks will appear here.'));}
  recap.querySelector('summary').textContent=`Draft recap · ${awards.length} ${awards.length===1?'pick':'picks'}`;
  if(lobby.match)status.textContent=lobby.match.summary;
 }
 function stop(){document.body.classList.remove('spectating');if(view)view.hidden=true;if(recap)recap.hidden=true;lastKey='';}
 window.DraftSpectator={render,stop};
})();
