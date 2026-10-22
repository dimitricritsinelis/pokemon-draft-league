import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../server/service.mjs';
import { loadEngines } from '../server/engines.mjs';

const engines = loadEngines();
const copy = x => structuredClone(x);
function fixture() {
  let revision = 0, state = { leagues: {}, lobbies: {} }, time = Date.UTC(2026, 9, 22), counter = 0, seed = 71;
  const store = {
    kind: 'isolated-qa-memory',
    async read() { return { revision, state: copy(state) }; },
    async commit(expected, next) { await Promise.resolve(); if (revision !== expected) return false; state = copy(next); revision++; return true; }
  };
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const service = createService({store, engines, clock: () => time, random});
  async function api(path, {body, token, origin, method = body ? 'POST' : 'GET'} = {}) {
    const response = await service.fetch(new Request('https://draft.example'+path, {
      method, headers: { ...(body ? {'content-type':'application/json'} : {}), ...(token ? {authorization:'Bearer '+token} : {}), ...(origin ? {origin} : {}) },
      body: body ? JSON.stringify(body) : undefined
    }));
    return {status:response.status, body:await response.json()};
  }
  async function create(extra = {}) {
    const response = await api('/api/lobbies', {body:{teamCount:2,mode:'both',names:Array.from({length:extra.teamCount||2},(_,i)=>'Team '+(i+1)),nickname:'Host',...extra}});
    assert.equal(response.status,201,JSON.stringify(response)); return response.body;
  }
  const actionId = () => 'qa-action-'+(++counter);
  async function action(room, type, payload = {}, extras = {}) {
    const response=await api('/api/lobbies/'+room.lobby.code+'/action',{token:room.token,body:{type,payload,version:room.lobby.version,actionId:actionId(),...extras}}); if(response.status===200)response.body.token=room.token;return response;
  }
  return {api,create,action,actionId,store,peek:()=>({revision,state:copy(state)}),advance:ms=>{time+=ms;},now:()=>time};
}

test('four-digit codes do not grant host power; viewer is read-only across every action', async () => {
  const f=fixture(), host=await f.create({teamCount:4});
  assert.match(host.lobby.code,/^\d{4}$/);
  const joined=await f.api('/api/lobbies/join',{body:{code:host.lobby.code,nickname:'Viewer'}});
  assert.equal(joined.status,201);const guest=joined.body;
  assert.equal(guest.member.role,'viewer');assert.equal(guest.member.teamIndex,1);
  for(const type of ['configure','start','bid','skip','place','scheme','simulate']) {
    const forbidden=await f.action(guest,type,{role:'host',teamIndex:0});
    assert.equal(forbidden.status,403,type);assert.equal(forbidden.body.code,'HOST_ONLY');
  }
  assert.equal((await f.api('/api/lobbies/'+host.lobby.code)).status,403);
  assert.equal((await f.api('/api/leagues/'+host.lobby.leagueId+'/hall',{token:guest.token,body:{pokemonId:6,kind:'shame',actionId:f.actionId()}})).status,403);
  const view=await f.api('/api/lobbies/'+host.lobby.code,{token:guest.token});
  assert.equal(view.status,200);
  const serialized=JSON.stringify(view.body);
  assert.ok(!serialized.includes('tokenHash'));assert.ok(!serialized.includes('ownerHash'));assert.ok(!serialized.includes(host.token));assert.ok(!serialized.includes(host.leagueToken));
  assert.equal(Object.keys(view.body.league.careers).length,386);
  assert.equal(view.body.league.canManage,false);
  assert.ok(!serialized.includes('"values"'), 'active species grades must remain absent');
});

test('membership capabilities are bound to a lobby and concurrent joins cannot overfill',async()=>{
  const f=fixture(),host=await f.create({teamCount:4}),other=await f.create();
  assert.equal((await f.api('/api/lobbies/'+other.lobby.code,{token:host.token})).status,403);
  const joins=await Promise.all(Array.from({length:8},(_,i)=>f.api('/api/lobbies/join',{body:{code:host.lobby.code,nickname:'Guest '+i}})));
  assert.equal(joins.filter(r=>r.status===201).length,3);
  assert.equal(joins.filter(r=>r.status===409).length,5);
  const view=(await f.api('/api/lobbies/'+host.lobby.code,{token:host.token})).body;
  assert.equal(view.lobby.members.length,4);assert.equal(new Set(view.lobby.members.map(m=>m.teamIndex)).size,4);
});

test('polls do not extend inactivity; actual chat does; expired rooms retain league records',async()=>{
  const f=fixture(),host=await f.create();
  const expires=host.lobby.expiresAt,revision=f.peek().revision;
  f.advance(59*60*1000);
  const poll=await f.api('/api/lobbies/'+host.lobby.code,{token:host.token});
  assert.equal(poll.status,200);assert.equal(poll.body.lobby.expiresAt,expires);assert.equal(f.peek().revision,revision);
  const chatted=await f.api('/api/lobbies/'+host.lobby.code+'/chat',{token:host.token,body:{message:'Still drafting',actionId:f.actionId()}});
  assert.equal(chatted.status,200);assert.ok(chatted.body.lobby.expiresAt>expires);
  f.advance(60*60*1000);
  assert.equal((await f.api('/api/lobbies/'+host.lobby.code,{token:host.token})).status,410);
  assert.equal((await f.api('/api/lobbies/join',{body:{code:host.lobby.code,nickname:'Late'}})).status,410);
  const league=await f.api('/api/leagues/'+host.lobby.leagueId,{token:host.leagueToken});
  assert.equal(league.status,200);assert.equal(Object.keys(league.body.league.careers).length,386);
  const again=await f.create({leagueId:host.lobby.leagueId,leagueToken:host.leagueToken});
  assert.equal(again.lobby.leagueId,host.lobby.leagueId);
});

test('concurrent bid awards are atomic and retried requests charge only once',async()=>{
  const f=fixture();let room=await f.create();room=(await f.action(room,'start')).body;
  assert.equal(room.lobby.auction.total,46);
  const requestOne={type:'bid',payload:{bids:[41,0]},version:room.lobby.version,actionId:'qa-atomic-award-one'};
  const requestTwo={...requestOne,payload:{bids:[0,19]},actionId:'qa-atomic-award-two'};
  const results=await Promise.all([f.api('/api/lobbies/'+room.lobby.code+'/action',{token:room.token,body:requestOne}),f.api('/api/lobbies/'+room.lobby.code+'/action',{token:room.token,body:requestTwo})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const success=results.find(r=>r.status===200).body,winningRequest=results[0].status===200?requestOne:requestTwo;
  const replay=await f.api('/api/lobbies/'+room.lobby.code+'/action',{token:room.token,body:winningRequest});
  assert.equal(replay.status,200);assert.deepEqual(replay.body.lobby.auction.budgets,success.lobby.auction.budgets);
  assert.equal(replay.body.lobby.auction.awards.length,1);
  const id=success.lobby.auction.pendingAward.pokemonId;
  assert.equal(replay.body.league.careers[id].draftCount,1);
  assert.equal(replay.body.league.careers[id].auctionPurchases,1);
  assert.equal(replay.body.league.careers[id].averagePaid,success.lobby.auction.pendingAward.amount);
  assert.ok(!JSON.stringify(replay.body.lobby.auction).includes('"lots"'),'future nominees should not be sent');
});

test('invalid ownership/position/overbudget commands cannot mutate money or draft state',async()=>{
  const f=fixture();let room=await f.create();room=(await f.action(room,'start')).body;
  const before=f.peek();
  for(const bids of [[1001,0],[-1,0],[1.5,0],[0],[0,'1']]){
    const rejected=await f.action(room,'bid',{bids});assert.equal(rejected.status,400);
    assert.deepEqual(f.peek(),before,'invalid bid must not commit any partial change');
  }
  room=(await f.action(room,'bid',{bids:[1000,0]})).body;
  const award=room.lobby.auction.pendingAward;
  const afterAward=f.peek();
  for(const payload of [{teamIndex:1,slotKey:'s_k',pokemonId:award.pokemonId},{teamIndex:0,slotKey:'unknown',pokemonId:award.pokemonId},{teamIndex:0,slotKey:'s_k',pokemonId:387}]){
    assert.equal((await f.action(room,'place',payload)).status,400);
    assert.deepEqual(f.peek(),afterAward);
  }
  const placed=await f.action(room,'place',{teamIndex:0,slotKey:'s_k'});
  assert.equal(placed.status,200);assert.equal(placed.body.lobby.teams[0].picks.s_k,award.pokemonId);
  assert.deepEqual(placed.body.lobby.auction.budgets,[0,1000]);
  assert.equal(placed.body.lobby.auction.phase,'bidding');
});

test('chat is persisted as plain text, deduplicated, and limited per member',async()=>{
  const f=fixture(),host=await f.create();
  const guest=(await f.api('/api/lobbies/join',{body:{code:host.lobby.code,nickname:'Guest'}})).body;
  const path='/api/lobbies/'+host.lobby.code+'/chat';
  const html='<script>globalThis.pwned=true</script><img src=x onerror=alert(1)>';
  const request={message:html,actionId:'qa-chat-markup-one'};
  const first=await f.api(path,{token:host.token,body:request});assert.equal(first.status,200);assert.equal(first.body.lobby.messages.at(-1).message,html);
  const replay=await f.api(path,{token:host.token,body:request});assert.equal(replay.status,200);assert.equal(replay.body.lobby.messages.filter(m=>m.id===request.actionId).length,1);
  assert.equal((await f.api(path,{token:guest.token,body:request})).status,409);
  for(let i=0;i<9;i++)assert.equal((await f.api(path,{token:host.token,body:{message:'Message '+i,actionId:f.actionId()}})).status,200);
  assert.equal((await f.api(path,{token:host.token,body:{message:'Too fast',actionId:f.actionId()}})).status,429);
  assert.equal((await f.api(path,{token:guest.token,body:{message:'Guest still allowed',actionId:f.actionId()}})).status,200);
  f.advance(10001);
  assert.equal((await f.api(path,{token:host.token,body:{message:'Allowed again',actionId:f.actionId()}})).status,200);
  for(const message of ['', 'a'.repeat(501),'\u0000\u0001'])assert.equal((await f.api(path,{token:host.token,body:{message,actionId:f.actionId()}})).status,400);
});

test('Fame and Shame are cross-device records; only retired grades are revealed',async()=>{
  const f=fixture(),host=await f.create();
  const guest=(await f.api('/api/lobbies/join',{body:{code:host.lobby.code,nickname:'Guest'}})).body;
  for(const [id,kind]of [[68,'fame'],[11,'shame']]){
    const hall=await f.api('/api/leagues/'+host.lobby.leagueId+'/hall',{token:host.token,body:{pokemonId:id,kind,actionId:f.actionId()}});
    assert.equal(hall.status,200);assert.equal(hall.body.league.hall[id].kind,kind);
    assert.equal(Object.keys(hall.body.league.hall[id].values).length,25);
  }
  const shared=(await f.api('/api/lobbies/'+host.lobby.code,{token:guest.token})).body;
  assert.equal(shared.league.hall[11].kind,'shame');assert.equal(shared.league.hall[68].kind,'fame');
  assert.equal(shared.league.hall[25],undefined);
  const removed=await f.api('/api/leagues/'+host.lobby.leagueId+'/hall',{token:host.leagueToken,body:{pokemonId:11,kind:null,actionId:f.actionId()}});
  assert.equal(removed.status,200);assert.equal(removed.body.league.hall[11],undefined);assert.equal(removed.body.league.hall[68].kind,'fame');
  // Start from latest version after the host's hall actions.
  const current=(await f.api('/api/lobbies/'+host.lobby.code,{token:host.token})).body;current.token=host.token;
  const started=await f.action(current,'start');assert.equal(started.status,200);
  const internal=f.peek().state.lobbies[host.lobby.code];assert.ok(!internal.session.lots.includes(68));
});

test('API rejects cross-origin writes and oversized input',async()=>{
  const f=fixture();
  assert.equal((await f.api('/api/lobbies',{origin:'https://evil.example',body:{teamCount:2}})).status,403);
  assert.equal((await f.api('/api/lobbies',{body:{nickname:'x'.repeat(21000)}})).status,413);
  assert.equal((await f.api('/api/lobbies',{body:{teamCount:5}})).status,400);
});

test('guest league history survives lobby expiry and code cleanup without granting write access',async()=>{
  const f=fixture(),host=await f.create();
  const guest=(await f.api('/api/lobbies/join',{body:{code:host.lobby.code,nickname:'Guest'}})).body;
  assert.ok(guest.leagueReadToken,'durable read-only league capability is required');
  const endpoint='/api/leagues/'+host.lobby.leagueId;
  f.advance(3600000);
  assert.equal((await f.api('/api/lobbies/'+host.lobby.code,{token:guest.token})).status,410);
  const saved=await f.api(endpoint,{token:guest.leagueReadToken});
  assert.equal(saved.status,200);assert.equal(saved.body.league.canManage,false);
  assert.equal((await f.api(endpoint+'/hall',{token:guest.leagueReadToken,body:{pokemonId:11,kind:'shame',actionId:f.actionId()}})).status,403);
  await f.create(); // Creating another room removes inactive code entries.
  assert.equal(f.peek().state.lobbies[host.lobby.code],undefined);
  assert.equal((await f.api(endpoint,{token:guest.leagueReadToken})).status,200);
  assert.equal((await f.api(endpoint,{token:host.leagueToken})).status,200);
});

test('incoming chat does not invalidate a host bid but previous gameplay versions do',async()=>{
  const f=fixture(),host=await f.create();
  const guest=(await f.api('/api/lobbies/join',{body:{code:host.lobby.code,nickname:'Guest'}})).body;
  let room=(await f.action(host,'start')).body;
  const draftVersion=room.lobby.version;
  assert.equal((await f.api('/api/lobbies/'+host.lobby.code+'/chat',{token:guest.token,body:{message:'Bid $15!',actionId:f.actionId()}})).status,200);
  const award=await f.action(room,'bid',{bids:[15,0]});assert.equal(award.status,200);
  room=award.body;
  const staleGame=await f.action(room,'skip',{}, {version:draftVersion});
  assert.equal(staleGame.status,409);
  const placed=await f.action(room,'place',{teamIndex:0,slotKey:'s_k'});
  assert.equal(placed.status,200);
});
