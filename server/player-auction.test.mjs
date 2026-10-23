import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from './service.mjs';
import {loadEngines} from './engines.mjs';
import {slots} from './formations.mjs';

const engines=loadEngines();
function fixture(){
  let revision=0,state={leagues:{},lobbies:{}},time=Date.parse('2026-10-23T12:00:00Z'),seed=1949,readDelay=0;
  const store={kind:'test-memory',async read(){if(readDelay){time+=readDelay;readDelay=0;}return {revision,state:structuredClone(state)};},async commit(expected,next){await Promise.resolve();if(expected!==revision)return false;state=structuredClone(next);revision++;return true;}};
  const service=createService({store,engines,clock:()=>time,random:()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}});
  async function request(path,body,token,headers={}){
    const response=await service.fetch(new Request('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{...(token?{authorization:'Bearer '+token}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}));
    return{status:response.status,body:response.status===304?null:await response.json(),response};
  }
  let code,tokens=[];
  const action=(actor,snapshot,type,payload={},actionId=crypto.randomUUID())=>request(`/api/lobbies/${code}/action`,{actionId,version:snapshot.lobby.version,type,payload},tokens[actor]);
  const poll=(actor=0)=>request(`/api/lobbies/${code}`,undefined,tokens[actor]);
  async function create(count=2){
    const result=await request('/api/lobbies',{teamCount:count,mode:'both',nickname:'Host',teamName:'Home'});assert.equal(result.status,201);code=result.body.lobby.code;tokens=[result.body.token];return result.body;
  }
  async function join(count=2){for(let i=1;i<count;i++){const result=await request('/api/lobbies/join',{code,nickname:`Coach ${i}`,teamName:`Club ${i}`});assert.equal(result.status,201);assert.equal(result.body.member.teamIndex,i);assert.equal(result.body.member.role,'player');tokens[i]=result.body.token;}return(await poll()).body;}
  async function start(count=2){await create(count);let snapshot=await join(count);const result=await action(0,snapshot,'start');assert.equal(result.status,200);return result.body;}
  return{service,store,request,action,poll,create,join,start,delayRead:ms=>readDelay=ms,advance:ms=>time+=ms,get tokens(){return tokens;},get code(){return code;}};
}
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
const assertError=(result,status,code)=>{assert.equal(result.status,status,JSON.stringify(result.body));assert.equal(result.body.code,code);};

const open = (f,s) => { const wait=Date.parse(s.lobby.auction.bidding.opensAt)-Date.parse(s.serverTime);if(wait>0)f.advance(wait); };
async function expire(f,s,actor=0){const wait=Date.parse(s.lobby.auction.bidding.settlesAt)-Date.parse(s.serverTime);if(wait>0)f.advance(wait);return (await f.poll(actor)).body;}
async function placeAll(f,s){for(let i=0;i<s.lobby.teamCount;i++){const ids=s.lobby.auction.owned[i];const positions=slots(s.lobby.teams[i]);for(let j=0;j<ids.length;j++)s=ok(await f.action(i,s,'place',{pokemonId:ids[j],slotKey:positions[j].key}));}return s;}

test('each coach controls their own team; start waits for coaches and tolerates unrelated setup edits',async()=>{
 const f=fixture(),created=await f.create(3);assertError(await f.action(0,created,'start'),409,'PLAYERS_MISSING');
 const joined=await f.join(3);let s=ok(await f.action(1,joined,'rename',{name:'Away'}));
 s=ok(await f.action(2,s,'scheme',{offense:'12',defense:'nickel'}));s=ok(await f.action(0,joined,'start'));
 assert.equal(s.lobby.teams[1].name,'Away');assert.equal(s.lobby.teams[2].offense,'12');
 assertError(await f.action(1,s,'start'),403,'HOST_ONLY');assertError(await f.action(0,s,'rename',{teamIndex:1,name:'Stolen'}),403,'OWN_TEAM_ONLY');
 assert.equal(s.lobby.auction.lots,undefined);assert.equal(s.member.token,undefined);assert.ok(!JSON.stringify(s).includes('tokenHash'));
});

test('20-second picks use a 5-second soft close and a 2-second network grace without inflating early bids',async()=>{
 const f=fixture();let s=await f.start(3),id=s.lobby.auction.currentPokemonId;const start=Date.parse(s.serverTime);
 assert.equal(Date.parse(s.lobby.auction.bidding.closesAt)-start,20000);
 f.advance(1000);s=ok(await f.action(1,s,'bid',{amount:5,pokemonId:id}));assert.equal(Date.parse(s.lobby.auction.bidding.closesAt),start+20000);
 f.advance(17000);s=ok(await f.action(2,s,'bid',{amount:10,pokemonId:id}));assert.equal(Date.parse(s.lobby.auction.bidding.closesAt),start+23000);
 // Arrives one second after the displayed zero: still within the transit buffer.
 f.advance(6000);s=ok(await f.action(0,s,'bid',{amount:15,pokemonId:id}));assert.equal(Date.parse(s.lobby.auction.bidding.closesAt),start+29000);
 f.advance(5000);let p=(await f.poll()).body;assert.equal(p.lobby.auction.awards.length,0);assert.equal(p.lobby.auction.bidding.highestBid,15);
 f.advance(2000);const activity=p.lobby.lastActivityAt;const polls=await Promise.all([f.poll(0),f.poll(1),f.poll(2)]);
 for(const r of polls){assert.equal(r.status,200);assert.equal(r.body.lobby.phase,'bidding');assert.equal(r.body.lobby.auction.awards.length,1);assert.equal(r.body.lobby.auction.lastAward.amount,15);assert.equal(r.body.lobby.lastActivityAt,activity);assert.equal(r.body.league.careers[id].draftCount,1);}
 s=polls[0].body;assert.deepEqual(s.lobby.auction.budgets,[985,1000,1000]);assert.deepEqual(s.lobby.auction.boxed,[[id],[],[]]);assert.notEqual(s.lobby.auction.currentPokemonId,id);
 assert.equal(Date.parse(s.lobby.auction.bidding.opensAt),start+33000);
 assertError(await f.action(1,s,'bid',{amount:5,pokemonId:s.lobby.auction.currentPokemonId}),409,'PICK_OPENING');
});

test('wins go to PC Box and bidding continues while coaches place, replace, and swap their owned players',async()=>{
 const f=fixture();let s=await f.start(2),id=s.lobby.auction.currentPokemonId;
 s=ok(await f.action(0,s,'bid',{amount:1000,pokemonId:id}));assert.equal(s.lobby.phase,'bidding');assert.deepEqual(s.lobby.teams[0].picks,{});assert.deepEqual(s.lobby.auction.boxed[0],[id]);
 const next=s.lobby.auction.currentPokemonId,deadline=s.lobby.auction.bidding.closesAt;
 assertError(await f.action(1,s,'place',{pokemonId:id,slotKey:'o_qb'}),400,'NOT_OWNED');
 s=ok(await f.action(0,s,'place',{pokemonId:id,slotKey:'o_qb'}));assert.deepEqual(s.lobby.auction.boxed[0],[]);assert.equal(s.lobby.auction.currentPokemonId,next);assert.equal(s.lobby.auction.bidding.closesAt,deadline);
 open(f,s);s=ok(await f.action(1,s,'bid',{amount:1000,pokemonId:next}));assert.equal(s.lobby.auction.awards.length,2);assert.equal(s.lobby.phase,'bidding');
 s=ok(await f.action(1,s,'place',{pokemonId:next,slotKey:'s_k'}));assert.equal(s.lobby.teams[1].picks.s_k,next);
 s=await expire(f,s);const third=s.lobby.auction.lastAward;assert.equal(third.amount,0);assert.equal(s.lobby.auction.awards.length,3);
 const i=third.team,existing=i===0?id:next,slot=i===0?'o_qb':'s_k';
 s=ok(await f.action(i,s,'place',{pokemonId:third.pokemonId,slotKey:slot}));assert.ok(s.lobby.auction.boxed[i].includes(existing));
 s=ok(await f.action(i,s,'place',{pokemonId:existing,slotKey:'o_c'}));s=ok(await f.action(i,s,'place',{pokemonId:third.pokemonId,slotKey:'o_c'}));assert.equal(s.lobby.teams[i].picks[slot],existing);assert.equal(s.lobby.teams[i].picks.o_c,third.pokemonId);
 assert.equal(s.league.careers[existing].draftCount,1);
});

for(const count of [2,3,4])test(`${count} coaches finish all continuous picks before arranging fields; matches and all careers reconcile`,async()=>{
 const f=fixture();let s=await f.start(count);const seen=new Set();
 for(let n=0;n<count*23;n++){
  open(f,s);const id=s.lobby.auction.currentPokemonId,actor=n%count;assert.ok(!seen.has(id));seen.add(id);
  s=ok(await f.action(actor,s,'bid',{amount:1,pokemonId:id}));if(s.lobby.auction.lastAward?.pokemonId!==id)s=await expire(f,s);
  assert.equal(s.lobby.auction.awards.length,n+1);assert.equal(s.lobby.auction.lastAward.team,actor);assert.equal(s.league.careers[id].draftCount,1);
  assert.equal(s.lobby.auction.fieldCounts[actor],0);
 }
 assert.equal(s.lobby.phase,'complete');assert.deepEqual(s.lobby.auction.counts,Array(count).fill(23));assert.deepEqual(s.lobby.auction.budgets,Array(count).fill(977));
 assertError(await f.action(0,s,'simulate',{teamIndexes:[0,count-1]}),409,'INCOMPLETE_LINEUPS');
 s=await placeAll(f,s);assert.ok(s.lobby.auction.boxed.every(box=>box.length===0));assert.deepEqual(s.lobby.auction.fieldCounts,Array(count).fill(23));
 const actionId=crypto.randomUUID();s=ok(await f.action(0,s,'simulate',{teamIndexes:[0,count-1]},actionId));
 for(const t of s.lobby.match.teams){assert.equal(t.players.length,23);assert.equal(t.score,t.quarters.reduce((a,b)=>a+b,0));assert.equal(t.players.reduce((n,p)=>n+p.stats.passingYards,0),t.players.reduce((n,p)=>n+p.stats.receivingYards,0));}
 assert.deepEqual(s.lobby.matches.at(-1).teamIndexes,[0,count-1]);s=ok(await f.action(0,s,'simulate',{teamIndexes:[0,count-1]},actionId));assert.equal(s.league.matchCount,1);
});

test('free picks are paced three seconds apart, never assigned in a burst, and exclude full teams',async()=>{
 const f=fixture();let s=await f.start(3);
 for(let i=0;i<3;i++){open(f,s);s=ok(await f.action(i,s,'bid',{amount:1000,pokemonId:s.lobby.auction.currentPokemonId}));}
 assert.deepEqual(s.lobby.auction.budgets,[0,0,0]);assert.equal(s.lobby.auction.awards.length,3);
 assert.equal(s.lobby.auction.bidding.free,true);f.advance(2999);s=(await f.poll()).body;assert.equal(s.lobby.auction.awards.length,3);
 f.advance(1);s=(await f.poll()).body;assert.equal(s.lobby.auction.awards.length,4);
 while(s.lobby.phase!=='complete'){s=await expire(f,s);assert.equal(s.lobby.auction.lastAward.amount,0);}
 assert.deepEqual(s.lobby.auction.counts,[23,23,23]);assert.equal(new Set(s.lobby.auction.awards.map(a=>a.pokemonId)).size,69);assert.equal(s.lobby.auction.awards.length,69);
 assert.equal(Object.values(s.league.careers).reduce((n,c)=>n+c.draftCount,0),69);
});

test('late or stale bids cannot steal the next nominee; exact replay and simultaneous all-ins charge once',async()=>{
 const f=fixture();let s=await f.start(2),old=s,id=s.lobby.auction.currentPokemonId;
 s=ok(await f.action(0,s,'skip',{pokemonId:id}));assertError(await f.action(1,old,'bid',{amount:5,pokemonId:id}),409,'STALE_PROSPECT');
 id=s.lobby.auction.currentPokemonId;s=ok(await f.action(0,s,'bid',{amount:5,pokemonId:id}));f.advance(22000);
 const late=await f.action(1,s,'bid',{amount:10,pokemonId:id});assertError(late,409,'BIDDING_CLOSED');assert.equal(late.body.lobby.auction.lastAward.amount,5);assert.equal(late.body.lobby.auction.awards.length,1);
 s=late.body;open(f,s);id=s.lobby.auction.currentPokemonId;const key=crypto.randomUUID();
 const outcomes=await Promise.all([f.action(1,s,'bid',{amount:1000,pokemonId:id},key),f.action(1,s,'bid',{amount:1000,pokemonId:id},key),f.action(0,s,'bid',{amount:995,pokemonId:id})]);
 assert.ok(outcomes.some(r=>r.status===200));s=(await f.poll()).body;assert.equal(s.lobby.auction.awards.length,2);assert.equal(s.league.careers[id].draftCount,1);
 if(outcomes[0].status===200){assert.equal(outcomes[1].status,200);assertError(await f.action(0,s,'bid',{amount:1,pokemonId:id},key),409,'ACTION_REUSED');}
});

test('old pending placements migrate into the PC Box without losing purchases or duplicating career records',async()=>{
 const f=fixture();let s=await f.start(2),id=s.lobby.auction.currentPokemonId;s=ok(await f.action(0,s,'bid',{amount:1000,pokemonId:id}));
 const saved=await f.store.read(),room=saved.state.lobbies[f.code];room.session.placed--;room.bidding=null;delete room.controlMode;room.members[1].role='viewer';await f.store.commit(saved.revision,saved.state);
 const revision=(await f.store.read()).revision;assertError(await f.request(`/api/lobbies/${f.code}`),403,'FORBIDDEN');assert.equal((await f.store.read()).revision,revision);
 const activity=s.lobby.lastActivityAt;s=(await f.poll(1)).body;assert.equal(s.member.role,'player');assert.equal(s.lobby.phase,'bidding');assert.deepEqual(s.lobby.auction.boxed[0],[id]);assert.equal(s.league.careers[id].draftCount,1);assert.equal(s.lobby.lastActivityAt,activity);
 const after=(await f.store.read()).revision;await f.poll();assert.equal((await f.store.read()).revision,after);
});

test('forged amounts, other-team edits, full teams, and retirement cannot bypass the auction ledger',async()=>{
 const f=fixture();let s=await f.start(2),id=s.lobby.auction.currentPokemonId;
 for(const amount of [-1,0,1.5,1001,'10',null])assertError(await f.action(1,s,'bid',{amount,pokemonId:id}),400,'INVALID_BID');
 assertError(await f.action(0,s,'bid',{amount:5,pokemonId:id,teamIndex:1}),403,'OWN_TEAM_ONLY');
 s=ok(await f.action(1,s,'bid',{amount:5,pokemonId:id}));assertError(await f.action(1,s,'bid',{amount:10,pokemonId:id}),409,'ALREADY_LEADING');
 assertError(await f.action(0,s,'skip',{pokemonId:id}),409,'BIDS_STARTED');
 const hall=await f.request(`/api/leagues/${s.league.id}/hall`,{actionId:crypto.randomUUID(),pokemonId:id,kind:'shame'},f.tokens[0]);assertError(hall,409,'BIDS_STARTED');
 assert.equal((await f.poll()).body.league.hall[id],undefined);
});


test('a bid received in time survives slow database processing and still gives opponents five seconds',async()=>{
 const f=fixture();let s=await f.start(2),id=s.lobby.auction.currentPokemonId;
 f.advance(19000);f.delayRead(4000);
 s=ok(await f.action(1,s,'bid',{amount:5,pokemonId:id}));
 assert.equal(s.lobby.auction.awards.length,0);assert.equal(s.lobby.auction.bidding.highestBid,5);
 assert.equal(Date.parse(s.lobby.auction.bidding.closesAt)-Date.parse(s.serverTime),5000);assert.equal(s.serverProcessingMs,4000);
});
