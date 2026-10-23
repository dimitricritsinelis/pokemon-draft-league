import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from './service.mjs';
import {loadEngines} from './engines.mjs';
import {slots} from './formations.mjs';

const engines=loadEngines();
function fixture(){
  let revision=0,state={leagues:{},lobbies:{}},time=Date.parse('2026-10-23T12:00:00Z'),seed=1949;
  const store={kind:'test-memory',async read(){return {revision,state:structuredClone(state)};},async commit(expected,next){await Promise.resolve();if(expected!==revision)return false;state=structuredClone(next);revision++;return true;}};
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
  return{service,store,request,action,poll,create,join,start,advance:ms=>time+=ms,get tokens(){return tokens;},get code(){return code;}};
}
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
const assertError=(result,status,code)=>{assert.equal(result.status,status,JSON.stringify(result.body));assert.equal(result.body.code,code);};
async function placeWinner(f,snapshot){
  const award=snapshot.lobby.auction.pendingAward;assert.ok(award);
  const board=snapshot.lobby.teams[award.team],slot=slots(board).find(slot=>!board.picks[slot.key]);assert.ok(slot);
  return ok(await f.action(award.team,snapshot,'place',{pokemonId:award.pokemonId,slotKey:slot.key}));
}

test('player rooms assign actual coaches, enforce own-team control, and retain legacy viewer membership as players',async()=>{
 const f=fixture(),created=await f.create(3);assert.equal(created.lobby.controlMode,'players');
 assertError(await f.action(0,created,'start'),409,'PLAYERS_MISSING');
 let snapshot=await f.join(3);assert.deepEqual(snapshot.lobby.teams.map(t=>t.name),['Home','Club 1','Club 2']);
 assertError(await f.action(1,snapshot,'start'),403,'HOST_ONLY');
 assertError(await f.action(0,snapshot,'rename',{teamIndex:1,name:'Stolen'}),403,'OWN_TEAM_ONLY');
 assertError(await f.action(1,snapshot,'scheme',{teamIndex:0,offense:'10'}),403,'OWN_TEAM_ONLY');
 snapshot=ok(await f.action(1,created,'rename',{name:'Away'}));assert.equal(snapshot.lobby.teams[1].name,'Away');
 const stored=await f.store.read();delete stored.state.lobbies[f.code].controlMode;stored.state.lobbies[f.code].members[1].role='viewer';await f.store.commit(stored.revision,stored.state);
 snapshot=(await f.poll(1)).body;assert.equal(snapshot.member.role,'player');assert.equal(snapshot.lobby.controlMode,'players');
 snapshot=ok(await f.action(1,snapshot,'scheme',{offense:'10',defense:'4-3'}));assert.equal(snapshot.lobby.teams[1].offense,'10');
 snapshot=ok(await f.action(0,snapshot,'start'));assert.equal(snapshot.lobby.auction.phase,'bidding');
 assert.equal(snapshot.lobby.auction.lots,undefined);assert.equal(snapshot.member.token,undefined);assert.ok(!JSON.stringify(snapshot).includes('tokenHash'));
});

test('live bids are public, own bids persist, countdown extends, and expired polling awards once without extending inactivity',async()=>{
 const f=fixture();let snapshot=await f.start(3),id=snapshot.lobby.auction.currentPokemonId;
 const opens=Date.parse(snapshot.lobby.auction.bidding.closesAt),originalActivity=snapshot.lobby.lastActivityAt;
 assert.deepEqual(snapshot.lobby.auction.bidding,{pokemonId:id,highestBid:0,leaderTeam:null,closesAt:new Date(opens).toISOString(),ownBid:null,minimumBid:1,history:[]});
 f.advance(17000);snapshot=ok(await f.action(1,snapshot,'bid',{amount:20,pokemonId:id}));assert.equal(Date.parse(snapshot.lobby.auction.bidding.closesAt),opens+5000);
 assert.equal(snapshot.lobby.auction.bidding.ownBid,20);assert.equal(snapshot.lobby.auction.bidding.leaderTeam,1);
 assertError(await f.action(1,snapshot,'bid',{amount:21,pokemonId:id}),409,'ALREADY_LEADING');
 assertError(await f.action(0,snapshot,'bid',{amount:20,pokemonId:id}),400,'INVALID_BID');
 assertError(await f.action(0,snapshot,'bid',{bids:[30,0,0],pokemonId:id}),400,'INDIVIDUAL_BID_REQUIRED');
 assertError(await f.action(0,snapshot,'skip',{pokemonId:id}),409,'BIDS_STARTED');
 f.advance(4000);snapshot=ok(await f.action(2,snapshot,'bid',{amount:25,pokemonId:id}));assert.equal(Date.parse(snapshot.lobby.auction.bidding.closesAt),opens+9000);
 const owner=(await f.poll(1)).body;assert.equal(owner.lobby.auction.bidding.ownBid,20);assert.equal(owner.lobby.auction.bidding.highestBid,25);assert.equal(owner.lobby.auction.bidding.minimumBid,26);assert.equal(owner.lobby.auction.bidding.history.length,2);
 assert.equal((await f.poll(0)).body.lobby.auction.bidding.ownBid,null);
 const lastActivity=snapshot.lobby.lastActivityAt;f.advance(8000);
 const results=await Promise.all([f.poll(0),f.poll(1),f.poll(2)]);for(const result of results){assert.equal(result.status,200);assert.equal(result.body.lobby.phase,'placement');assert.equal(result.body.lobby.auction.pendingAward.team,2);assert.equal(result.body.lobby.auction.awards.length,1);assert.equal(result.body.lobby.lastActivityAt,lastActivity);assert.equal(result.body.league.careers[id].draftCount,1);}
 assert.notEqual(lastActivity,originalActivity);snapshot=results[0].body;assert.deepEqual(snapshot.lobby.auction.budgets,[1000,1000,975]);
 const revision=(await f.store.read()).revision;await f.poll();assert.equal((await f.store.read()).revision,revision);
 assertError(await f.action(0,snapshot,'place',{teamIndex:2,pokemonId:id,slotKey:'QB'}),403,'OWN_TEAM_ONLY');
 snapshot=await placeWinner(f,snapshot);assert.equal(snapshot.lobby.phase,'bidding');assert.equal(snapshot.lobby.auction.bidding.history.length,0);assert.equal(Date.parse(snapshot.lobby.auction.bidding.closesAt),opens+29000);
});

test('stale nominees, late bids, actor-bound replay and concurrent raises never double-spend or duplicate a draft',async()=>{
 const f=fixture();let snapshot=await f.start(2),old=snapshot,id=snapshot.lobby.auction.currentPokemonId;
 snapshot=ok(await f.action(0,snapshot,'skip',{pokemonId:id}));assert.notEqual(snapshot.lobby.auction.currentPokemonId,id);
 assertError(await f.action(1,old,'bid',{amount:1,pokemonId:id}),409,'STALE_PROSPECT');
 id=snapshot.lobby.auction.currentPokemonId;
 const body={amount:50,pokemonId:id},requestId=crypto.randomUUID();
 const outcomes=await Promise.all([f.action(0,snapshot,'bid',body,requestId),f.action(1,snapshot,'bid',{amount:60,pokemonId:id})]);assert.ok(outcomes.some(r=>r.status===200));
 snapshot=(await f.poll()).body;assert.equal(snapshot.lobby.auction.bidding.highestBid,60);assert.equal(snapshot.lobby.auction.bidding.leaderTeam,1);
 if(outcomes[0].status===200){assert.equal((await f.action(0,old,'bid',body,requestId)).status,200);assertError(await f.action(1,snapshot,'bid',{amount:70,pokemonId:id},requestId),409,'ACTION_REUSED');}
 assert.equal(snapshot.lobby.auction.awards.length,0);assert.deepEqual(snapshot.lobby.auction.budgets,[1000,1000]);
 f.advance(20000);const late=await f.action(0,snapshot,'bid',{amount:100,pokemonId:id});assertError(late,409,'BIDDING_CLOSED');assert.equal(late.body.lobby.auction.pendingAward.amount,60);assert.equal(late.body.league.careers[id].draftCount,1);
 snapshot=(await f.poll()).body;assert.equal(snapshot.lobby.auction.awards.length,1);assert.deepEqual(snapshot.lobby.auction.budgets,[1000,940]);
 assertError(await f.action(1,snapshot,'place',{slotKey:slots(snapshot.lobby.teams[1])[0].key}),400,'POKEMON_REQUIRED');
 snapshot=await placeWinner(f,snapshot);assertError(await f.action(1,snapshot,'bid',{amount:61,pokemonId:id}),409,'STALE_PROSPECT');
});

for(const count of [2,3,4])test(`${count} independent devices complete a full live auction and produce coherent 23-player match records`,async()=>{
 const f=fixture();let snapshot=await f.start(count);const total=count*23,ids=new Set();
 for(let round=0;round<total;round++){
   const winner=round%count,id=snapshot.lobby.auction.currentPokemonId;assert.equal(snapshot.lobby.auction.round,round+1);assert.ok(!ids.has(id));ids.add(id);
   snapshot=ok(await f.action(winner,snapshot,'bid',{amount:1,pokemonId:id}));
   f.advance(20000);snapshot=(await f.poll(winner)).body;assert.equal(snapshot.lobby.phase,'placement');assert.equal(snapshot.lobby.auction.pendingAward.team,winner);assert.equal(snapshot.lobby.auction.round,round+1);
   assert.equal(snapshot.league.careers[id].draftCount,1);assert.equal(snapshot.league.careers[id].totalAuctionPaid,1);
   snapshot=await placeWinner(f,snapshot);
   if(snapshot.lobby.phase==='bidding'&&snapshot.lobby.auction.counts[winner]===23)assertError(await f.action(winner,snapshot,'bid',{amount:1,pokemonId:snapshot.lobby.auction.currentPokemonId}),409,'ROSTER_FULL');
 }
 assert.equal(snapshot.lobby.phase,'complete');assert.deepEqual(snapshot.lobby.auction.counts,Array(count).fill(23));assert.deepEqual(snapshot.lobby.auction.budgets,Array(count).fill(977));
 const matchId=crypto.randomUUID();snapshot=ok(await f.action(0,snapshot,'simulate',{teamIndexes:[0,count-1]},matchId));
 for(const team of snapshot.lobby.match.teams){assert.equal(team.players.length,23);assert.equal(team.quarters.reduce((n,v)=>n+v,0),team.score);assert.equal(team.players.reduce((n,p)=>n+p.stats.passingYards,0),team.players.reduce((n,p)=>n+p.stats.receivingYards,0));const k=team.players.find(p=>p.role==='K');assert.equal(k.stats.kickingPoints,k.stats.fieldGoalsMade*3+k.stats.extraPointsMade);}
 assert.deepEqual(snapshot.lobby.matches.at(-1).teamIndexes,[0,count-1]);
 assert.equal(snapshot.league.matchCount,1);const replay=ok(await f.action(0,snapshot,'simulate',{teamIndexes:[0,count-1]},matchId));assert.equal(replay.league.matchCount,1);
});

test('unbeatable bids settle immediately and exhausted budgets auto-award free nominees, excluding full teams',async()=>{
 const f=fixture();let snapshot=await f.start(3);
 for(let winner=0;winner<3;winner++){
   const id=snapshot.lobby.auction.currentPokemonId;snapshot=ok(await f.action(winner,snapshot,'bid',{amount:1000,pokemonId:id}));assert.equal(snapshot.lobby.phase,'placement');assert.equal(snapshot.lobby.auction.pendingAward.team,winner);snapshot=await placeWinner(f,snapshot);
 }
 assert.deepEqual(snapshot.lobby.auction.budgets,[0,0,0]);assert.equal(snapshot.lobby.phase,'placement');
 while(snapshot.lobby.phase!=='complete'){
   const award=snapshot.lobby.auction.pendingAward;assert.equal(award.amount,0);assert.ok(snapshot.lobby.auction.counts[award.team]<=23);snapshot=await placeWinner(f,snapshot);
 }
 assert.deepEqual(snapshot.lobby.auction.counts,[23,23,23]);assert.equal(snapshot.lobby.auction.awards.length,69);assert.equal(new Set(snapshot.lobby.auction.awards.map(a=>a.pokemonId)).size,69);
 assert.equal(Object.values(snapshot.league.careers).reduce((n,c)=>n+c.draftCount,0),69);
});

test('no-bid timer awards for free; five-event history is bounded and current prospect guards allow unrelated own-team edits',async()=>{
 const f=fixture();let snapshot=await f.start(2),old=snapshot,id=snapshot.lobby.auction.currentPokemonId;
 snapshot=ok(await f.action(1,snapshot,'rename',{name:'Rebranded'}));snapshot=ok(await f.action(0,old,'skip',{pokemonId:id}));
 f.advance(20000);snapshot=ok(await f.action(1,snapshot,'tick'));assert.equal(snapshot.lobby.auction.pendingAward.amount,0);snapshot=await placeWinner(f,snapshot);
 id=snapshot.lobby.auction.currentPokemonId;
 for(let amount=1;amount<=8;amount++)snapshot=ok(await f.action(amount%2,snapshot,'bid',{amount,pokemonId:id}));
 assert.equal(snapshot.lobby.auction.bidding.history.length,5);assert.deepEqual(snapshot.lobby.auction.bidding.history.map(b=>b.amount),[4,5,6,7,8]);
});

test('migrated online rooms retain purchases, seats, careers and budgets while initializing one authoritative clock',async()=>{
 const f=fixture();let snapshot=await f.start(2);const first=snapshot.lobby.auction.currentPokemonId;
 snapshot=ok(await f.action(0,snapshot,'bid',{amount:1000,pokemonId:first}));snapshot=await placeWinner(f,snapshot);
 const stored=await f.store.read(),room=stored.state.lobbies[f.code];delete room.controlMode;delete room.bidding;room.members[1].role='viewer';await f.store.commit(stored.revision,stored.state);
 const before=(await f.store.read()).revision,activity=snapshot.lobby.lastActivityAt;
 const unauthorized=await f.request(`/api/lobbies/${f.code}`);assertError(unauthorized,403,'FORBIDDEN');assert.equal((await f.store.read()).revision,before);
 snapshot=(await f.poll(1)).body;assert.equal(snapshot.member.role,'player');assert.equal(snapshot.lobby.controlMode,'players');assert.deepEqual(snapshot.lobby.auction.budgets,[0,1000]);assert.deepEqual(snapshot.lobby.auction.owned,[[first],[]]);assert.equal(snapshot.league.careers[first].draftCount,1);assert.equal(snapshot.lobby.lastActivityAt,activity);
 const deadline=snapshot.lobby.auction.bidding.closesAt,after=(await f.store.read()).revision;f.advance(1000);const normal=await f.poll(0);assert.equal(normal.body.lobby.auction.bidding.closesAt,deadline);assert.equal((await f.store.read()).revision,after);
 f.advance(19000);const advanced=await f.request(`/api/lobbies/${f.code}`,undefined,f.tokens[0],{'if-none-match':normal.response.headers.get('etag')});assert.equal(advanced.status,200);assert.equal(advanced.body.lobby.phase,'placement');assert.equal(advanced.body.lobby.auction.pendingAward.amount,0);assert.equal(advanced.body.lobby.lastActivityAt,activity);
});

test('forged, fractional, overbudget, full-team and stale own-team commands preserve the authoritative ledger',async()=>{
 const f=fixture();let snapshot=await f.start(2);const id=snapshot.lobby.auction.currentPokemonId;
 for(const amount of [-1,0,1.5,1001,'10',null])assertError(await f.action(1,snapshot,'bid',{amount,pokemonId:id}),400,'INVALID_BID');
 assertError(await f.action(0,snapshot,'bid',{amount:2,pokemonId:id,teamIndex:1}),403,'OWN_TEAM_ONLY');
 assertError(await f.action(1,snapshot,'skip',{pokemonId:id}),403,'HOST_ONLY');
 assertError(await f.action(1,snapshot,'configure',{teamCount:4}),403,'HOST_ONLY');
 const requestId=crypto.randomUUID();snapshot=ok(await f.action(1,snapshot,'bid',{amount:1000,pokemonId:id},requestId));
 const replay=ok(await f.action(1,snapshot,'bid',{amount:1000,pokemonId:id},requestId));assert.equal(replay.lobby.auction.awards.length,1);assert.equal(replay.league.careers[id].totalAuctionPaid,1000);
 snapshot=await placeWinner(f,snapshot);
 const oldVersion=snapshot;
 snapshot=ok(await f.action(0,snapshot,'rename',{name:'New home'}));
 const ownedSlot=Object.keys(snapshot.lobby.teams[1].picks)[0],emptySlot=slots(snapshot.lobby.teams[1]).find(s=>!snapshot.lobby.teams[1].picks[s.key]);
 snapshot=ok(await f.action(1,oldVersion,'place',{pokemonId:id,slotKey:emptySlot.key}));assert.equal(snapshot.lobby.teams[1].picks[emptySlot.key],id);assert.equal(snapshot.lobby.teams[1].picks[ownedSlot],undefined);assert.equal(snapshot.league.careers[id].draftCount,1);
});

test('the halls cannot bypass the no-skip rule after a live bid has been placed',async()=>{
 const f=fixture();let snapshot=await f.start(2);const id=snapshot.lobby.auction.currentPokemonId;
 snapshot=ok(await f.action(1,snapshot,'bid',{amount:25,pokemonId:id}));
 const retired=await f.request(`/api/leagues/${snapshot.league.id}/hall`,{actionId:crypto.randomUUID(),pokemonId:id,kind:'shame'},f.tokens[0]);assertError(retired,409,'BIDS_STARTED');
 snapshot=(await f.poll()).body;assert.equal(snapshot.lobby.auction.bidding.highestBid,25);assert.equal(snapshot.league.hall[id],undefined);
});

test('simultaneous unbeatable bids and duplicate requests award and debit exactly one owner',async()=>{
 const f=fixture();let snapshot=await f.start(2);const id=snapshot.lobby.auction.currentPokemonId,requestId=crypto.randomUUID();
 const results=await Promise.all([f.action(0,snapshot,'bid',{amount:1000,pokemonId:id},requestId),f.action(0,snapshot,'bid',{amount:1000,pokemonId:id},requestId),f.action(1,snapshot,'bid',{amount:1000,pokemonId:id})]);
 assert.ok(results.some(r=>r.status===200));snapshot=(await f.poll()).body;assert.equal(snapshot.lobby.phase,'placement');assert.equal(snapshot.lobby.auction.awards.length,1);assert.equal(snapshot.lobby.auction.budgets.reduce((a,b)=>a+b,0),1000);assert.equal(snapshot.league.careers[id].draftCount,1);assert.equal(snapshot.league.careers[id].totalAuctionPaid,1000);
 if(results[0].status===200){assert.equal(results[1].status,200);assertError(await f.action(1,snapshot,'bid',{amount:1000,pokemonId:id},requestId),409,'ACTION_REUSED');}
});

test('a roster edit at the auction deadline also settles the lot without making the coach repeat the edit',async()=>{
 const f=fixture();let snapshot=await f.start(2),id=snapshot.lobby.auction.currentPokemonId;
 snapshot=ok(await f.action(1,snapshot,'bid',{amount:5,pokemonId:id}));f.advance(20000);
 snapshot=ok(await f.action(0,snapshot,'rename',{name:'Deadline coaches'}));assert.equal(snapshot.lobby.teams[0].name,'Deadline coaches');assert.equal(snapshot.lobby.phase,'placement');assert.equal(snapshot.lobby.auction.pendingAward.team,1);assert.equal(snapshot.league.careers[id].draftCount,1);
});

test('host can start from a waiting snapshot after another coach edits their own team, while seats and phase remain guarded',async()=>{
 const f=fixture();const created=await f.create(3);assertError(await f.action(0,created,'start'),409,'PLAYERS_MISSING');
 const joined=await f.join(3);
 let snapshot=ok(await f.action(1,joined,'rename',{name:'Last-minute rivals'}));snapshot=ok(await f.action(2,snapshot,'scheme',{offense:'12',defense:'nickel'}));
 snapshot=ok(await f.action(0,joined,'start'));assert.equal(snapshot.lobby.phase,'bidding');assert.equal(snapshot.lobby.teams[1].name,'Last-minute rivals');assert.equal(snapshot.lobby.teams[2].offense,'12');assert.equal(snapshot.lobby.teams[2].defense,'nickel');
 assertError(await f.action(0,joined,'start'),409,'AUCTION_STARTED');assertError(await f.action(1,joined,'start'),403,'HOST_ONLY');
});
