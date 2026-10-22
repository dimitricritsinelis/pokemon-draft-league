import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from './service.mjs';
import { loadEngines } from './engines.mjs';
import { slots } from './formations.mjs';
import { createSQLiteStore } from './sqlite-store.mjs';

const engines=loadEngines();
const make=()=>{const store=createSQLiteStore(':memory:');return{service:createService({store,engines}),store};};
async function request(service,path,body,token,headers={}){
  const response=await service.fetch(new Request('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{...(token?{authorization:'Bearer '+token}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}));
  return{status:response.status,body:response.status===304?null:await response.json(),response};
}
const action=(service,snapshot,type,payload={},token=snapshot.member.token)=>request(service,`/api/lobbies/${snapshot.lobby.code}/action`,{actionId:crypto.randomUUID(),version:snapshot.lobby.version,type,payload},token);

test('authoritative full auction, market counters, complete special teams match and idempotent replay',async()=>{
 const {service,store}=make();
 try{
  const created=await request(service,'/api/lobbies',{teamCount:2,mode:'gen1',names:['Kanto','Rivals'],nickname:'Host'});assert.equal(created.status,201);
  let snap=created.body;const token=snap.member.token,leagueToken=snap.leagueToken;
  assert.match(snap.lobby.code,/^\d{4}$/);assert.equal(Object.keys(snap.league.careers).length,386);
  const started=await action(service,snap,'start',{},token);assert.equal(started.status,200);snap=started.body;
  assert.equal(snap.lobby.auction.total,46);assert.equal(snap.lobby.auction.lots,undefined);
  let firstId;
  for(let round=0;round<46;round++){
   const winner=round%2,id=snap.lobby.auction.currentPokemonId;firstId ||= id;
   const bids=winner===0?[1,0]:[0,1];
   const bidBody={actionId:crypto.randomUUID(),version:snap.lobby.version,type:'bid',payload:{bids}};
   const awarded=await request(service,`/api/lobbies/${snap.lobby.code}/action`,bidBody,token);assert.equal(awarded.status,200,JSON.stringify(awarded.body));snap=awarded.body;
   assert.equal(snap.league.careers[id].draftCount,1);assert.equal(snap.league.careers[id].totalAuctionPaid,1);
   const replay=await request(service,`/api/lobbies/${snap.lobby.code}/action`,bidBody,token);assert.equal(replay.status,200);assert.equal(replay.body.league.careers[id].draftCount,1);
   const slot=slots(snap.lobby.teams[winner]).find(slot=>!snap.lobby.teams[winner].picks[slot.key]);
   const placed=await action(service,snap,'place',{teamIndex:winner,slotKey:slot.key,pokemonId:id},token);assert.equal(placed.status,200,JSON.stringify(placed.body));snap=placed.body;
  }
  assert.equal(snap.lobby.phase,'complete');assert.deepEqual(snap.lobby.auction.counts,[23,23]);assert.deepEqual(snap.lobby.auction.budgets,[977,977]);
  const matchBody={actionId:crypto.randomUUID(),version:snap.lobby.version,type:'simulate',payload:{teamIndexes:[0,1]}};
  const simulated=await request(service,`/api/lobbies/${snap.lobby.code}/action`,matchBody,token);assert.equal(simulated.status,200,JSON.stringify(simulated.body));snap=simulated.body;
  const result=snap.lobby.match;
  assert.equal(result.teams.length,2);assert.equal(result.teams[0].players.length,23);assert.equal(result.teams[1].players.length,23);
  for(const team of result.teams){
   assert.equal(team.quarters.reduce((a,b)=>a+b,0),team.score);
   const kicker=team.players.find(p=>p.role==='K');assert.ok(kicker);assert.equal(kicker.stats.kickingPoints,kicker.stats.fieldGoalsMade*3+kicker.stats.extraPointsMade);
   assert.equal(team.players.reduce((n,p)=>n+p.stats.passingYards,0),team.players.reduce((n,p)=>n+p.stats.receivingYards,0));
  }
  assert.equal(snap.league.careers[firstId].games,1);
  const replay=await request(service,`/api/lobbies/${snap.lobby.code}/action`,matchBody,token);assert.equal(replay.body.league.matchCount,1);assert.equal(replay.body.league.careers[firstId].games,1);
  const fame=await request(service,`/api/leagues/${snap.league.id}/hall`,{actionId:crypto.randomUUID(),pokemonId:firstId,kind:'fame'},token);assert.equal(fame.status,200);assert.equal(fame.body.league.hall[firstId].kind,'fame');assert.equal(fame.body.league.hall[firstId].values.K,engines.DraftRatings.rate(firstId,'K'));
  const persistent=await request(service,`/api/leagues/${snap.league.id}`,undefined,leagueToken);assert.equal(persistent.status,200);assert.equal(persistent.body.league.careers[firstId].games,1);
  const next=await request(service,'/api/lobbies',{teamCount:2,mode:'gen1',nickname:'Host',leagueId:snap.league.id,leagueToken},undefined);assert.equal(next.status,201);const nextStarted=await action(service,next.body,'start',{},next.body.member.token);assert.equal(nextStarted.status,200);assert.ok(!nextStarted.body.lobby.auction.owned.flat().includes(firstId));
 }finally{store.close();}
});

test('failed stale or invalid mutation never spends budget, and conditional polling is read-only',async()=>{
 const {service,store}=make();try{
  const c=(await request(service,'/api/lobbies',{teamCount:2,mode:'both',nickname:'Host'})).body,token=c.member.token;
  const started=(await action(service,c,'start',{},token)).body;
  const invalid=await action(service,started,'bid',{bids:[1001,0]},token);assert.equal(invalid.status,400);
  const read=await request(service,`/api/lobbies/${c.lobby.code}`,undefined,token);assert.deepEqual(read.body.lobby.auction.budgets,[1000,1000]);
  const revision=(await store.read()).revision;
  const unchanged=await request(service,`/api/lobbies/${c.lobby.code}`,undefined,token,{'if-none-match':read.response.headers.get('etag')});assert.equal(unchanged.status,304);assert.equal((await store.read()).revision,revision);
  const stale=await action(service,c,'bid',{bids:[1,0]},token);assert.equal(stale.status,409);
 }finally{store.close();}
});

test('retiring a reserved future prospect redraws every affected live auction atomically',async()=>{
 const {service,store}=make();try{
  const first=(await request(service,'/api/lobbies',{teamCount:4,mode:'gen2',nickname:'Host'})).body;
  await action(service,first,'start',{},first.member.token);
  const second=(await request(service,'/api/lobbies',{teamCount:4,mode:'gen2',nickname:'Host',leagueId:first.league.id,leagueToken:first.leagueToken})).body;
  await action(service,second,'start',{},second.member.token);
  const fixture=await store.read(),one=fixture.state.lobbies[first.lobby.code],two=fixture.state.lobbies[second.lobby.code];
  two.session=structuredClone(one.session);
  const id=one.session.lots[10],currents=[one.session.lots[0],two.session.lots[0]],versions=[one.version,two.version];
  assert.ok(engines.DraftAuction.validate(one.session));assert.ok(await store.commit(fixture.revision,fixture.state));
  const retired=await request(service,`/api/leagues/${first.league.id}/hall`,{actionId:crypto.randomUUID(),pokemonId:id,kind:'shame'},first.leagueToken);
  assert.equal(retired.status,200,JSON.stringify(retired.body));assert.equal(retired.body.league.hall[id].kind,'shame');
  const after=await store.read();
  for(const [index,code]of [first.lobby.code,second.lobby.code].entries()){
   const room=after.state.lobbies[code];assert.ok(!room.session.lots.includes(id));assert.ok(room.session.skipped.includes(id));
   assert.equal(room.session.lots.length,92);assert.equal(new Set(room.session.lots).size,92);assert.ok(engines.DraftAuction.validate(room.session));
   assert.equal(room.session.lots[0],currents[index]);assert.ok(room.version>versions[index]);assert.equal(room.lastGameVersion,room.version);
   assert.deepEqual(Array.from(engines.DraftAuction.budgets(room.session)),[1000,1000,1000,1000]);assert.equal(room.messages.at(-1).system,true);
  }
 }finally{store.close();}
});

test('an exhausted replacement pool blocks retirement of current or future reserved prospects and rolls back other rooms',async()=>{
 for(const targetIndex of [0,10]){
  const {service,store}=make();try{
   const first=(await request(service,'/api/lobbies',{teamCount:4,mode:'gen2',nickname:'Host'})).body;
   await action(service,first,'start',{},first.member.token);
   const second=(await request(service,'/api/lobbies',{teamCount:4,mode:'gen2',nickname:'Host',leagueId:first.league.id,leagueToken:first.leagueToken})).body;
   await action(service,second,'start',{},second.member.token);
   const fixture=await store.read(),one=fixture.state.lobbies[first.lobby.code],two=fixture.state.lobbies[second.lobby.code];
   two.session=structuredClone(one.session);
   two.session.skipped=engines.POKEMON.filter(p=>p.id>=152&&p.id<=251&&!two.session.lots.includes(p.id)).map(p=>p.id);
   assert.equal(two.session.skipped.length,8);assert.ok(engines.DraftAuction.validate(two.session));
   const id=one.session.lots[targetIndex];assert.ok(await store.commit(fixture.revision,fixture.state));
   const before=await store.read();
   const blocked=await request(service,`/api/leagues/${first.league.id}/hall`,{actionId:crypto.randomUUID(),pokemonId:id,kind:'fame'},first.leagueToken);
   assert.equal(blocked.status,409);assert.equal(blocked.body.code,'AUCTION_POOL_RESERVED');assert.match(blocked.body.error,/Finish the draft/);
   assert.deepEqual(await store.read(),before,'failed induction must preserve every room, career, Hall and database revision');
   const room=(await request(service,`/api/lobbies/${second.lobby.code}`,undefined,second.member.token)).body;
   const canBid=await action(service,room,'bid',{bids:[1,0,0,0]},second.member.token);assert.equal(canBid.status,200);
  }finally{store.close();}
 }
});
