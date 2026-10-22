import { OFFENSES, DEFENSES, MODES, ROSTER_SIZE, eligible, slots, cleanName } from './formations.mjs';
import { DatabaseError } from './supabase-store.mjs';

const HOUR = 60 * 60 * 1000;
const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nowISO = time => new Date(time).toISOString();
const idOK = id => Number.isInteger(id) && id >= 1 && id <= 386;
class Problem extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const fail = (status, code, message) => { throw new Problem(status, code, message); };
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
const actionID = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{8,128}$/.test(value);

export function createService({ store, engines, clock = () => Date.now(), random = Math.random }) {
  if (!store?.read || !store?.commit || !engines?.DraftAuction || !engines?.DraftMatch || !engines?.DraftRatings) throw new Error('The multiplayer service needs a persistent store and the game engines.');
  const { POKEMON, DraftAuction: Auction, DraftMatch: Match, DraftRatings: Ratings } = engines;
  const names = new Map(POKEMON.map(p => [p.id, p.name]));
  const randomUnit = () => { const value = random(); if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid random source.'); return value; };
  function blankCareer(id) {
    return { pokemonId:id, name:names.get(id), games:0, wins:0, losses:0, draws:0, offensiveMVPs:0, defensiveMVPs:0, appearancesByRole:{}, stats:Object.fromEntries(Match.statKeys.map(key=>[key,0])), draftCount:0, auctionPurchases:0, totalAuctionPaid:0 };
  }
  function leagueView(league, canManage = false) {
    const careers = Object.fromEntries(Array.from({length:386},(_,i)=>{
      const id=i+1, saved=clone(league.careers[id] || {}), career={...blankCareer(id),...saved,stats:Object.fromEntries(Object.entries(saved.stats || {}).filter(([,value])=>value!==0))};
      career.averagePaid = career.auctionPurchases ? Math.round(career.totalAuctionPaid / career.auctionPurchases * 100) / 100 : 0;
      return [id,career];
    }));
    return { id:league.id, name:league.name, revision:league.revision, createdAt:league.createdAt, careers, hall:clone(league.hall), canManage, matchCount:league.matchCount || 0, matches:clone(league.matches || []) };
  }
  const active = (lobby, time) => lobby && time < lobby.lastActivity + HOUR;
  function requireLobby(state, code, time) {
    if (!/^\d{4}$/.test(code)) fail(400,'INVALID_CODE','Enter a four-digit lobby code.');
    const lobby=state.lobbies[code];
    if (!lobby) fail(404,'NOT_FOUND','That lobby was not found. Check the four-digit code.');
    if (!active(lobby,time)) fail(410,'EXPIRED','This lobby expired after one hour without activity. Your league records remain saved.');
    return lobby;
  }
  function memberFor(lobby, authHash) {
    const member = lobby.members.find(member=>member.tokenHash === authHash);
    if (!member) fail(403,'FORBIDDEN','Join this lobby to view it.');
    return member;
  }
  const memberView = member => ({id:member.id,nickname:member.nickname,role:member.role,isHost:member.role==='host',teamIndex:member.teamIndex});
  function view(lobby, member, state, time, freshToken) {
    const league=state.leagues[lobby.leagueId];
    const auction = lobby.session ? {
      phase:Auction.phase(lobby.session), currentPokemonId:Auction.current(lobby.session),
      round:Math.min(lobby.session.placed+1,lobby.session.lots.length), total:lobby.session.lots.length,
      budgets:Auction.budgets(lobby.session), counts:Auction.counts(lobby.session),
      owned:lobby.teams.map((_,index)=>Auction.owned(lobby.session,index)),
      awards:clone(lobby.session.awards), skipped:clone(lobby.session.skipped),
      pendingAward:Auction.phase(lobby.session)==='placement'?clone(lobby.session.awards.at(-1)):null
    }:null;
    return {
      lobby:{ code:lobby.code, leagueId:lobby.leagueId, phase:auction?.phase || 'waiting', version:lobby.version,
        mode:lobby.mode,teamCount:lobby.teamCount,teams:clone(lobby.teams),auction,
        messages:clone(lobby.messages),members:lobby.members.map(memberView),
        lastActivityAt:nowISO(lobby.lastActivity),expiresAt:nowISO(lobby.lastActivity+HOUR),
        match:clone(lobby.match),matches:lobby.matches.map(result=>({matchId:result.matchId,summary:result.summary,winnerIndex:result.winnerIndex,teams:result.teams.map(team=>({name:team.name,score:team.score}))})),rosterSize:ROSTER_SIZE },
      member:{...memberView(member),...(freshToken?{token:freshToken}:{})},
      league:leagueView(league,member.role==='host'),serverTime:nowISO(time),...(freshToken?{token:freshToken}:{})
    };
  }
  function touch(lobby,time) { lobby.lastActivity=time; lobby.version++; }
  function systemMessage(lobby, message, time) {
    lobby.messages.push({id:crypto.randomUUID(),memberId:'system',nickname:'Draft desk',message,createdAt:nowISO(time),system:true});
    lobby.messages=lobby.messages.slice(-200);
  }
  function configure(lobby,payload) {
    const count=payload.teamCount ?? lobby.teamCount, mode=payload.mode ?? lobby.mode;
    if (!Number.isInteger(count)||count<2||count>4) fail(400,'INVALID_TEAMS','Choose between two and four teams.');
    if (!MODES.includes(mode)) fail(400,'INVALID_POOL','Choose Gen 1, Gen 2, Gen 3, or all generations.');
    if (payload.names!==undefined && (!Array.isArray(payload.names)||payload.names.length!==count)) fail(400,'INVALID_NAMES','Provide a name for each team.');
    if (lobby.members.some(member=>member.teamIndex>=count)) fail(409,'MEMBERS_JOINED','A player has already joined a team that would be removed.');
    lobby.teamCount=count; lobby.mode=mode;
    lobby.teams=Array.from({length:count},(_,index)=>({name:cleanName(payload.names?.[index],lobby.teams[index]?.name||`Team ${index+1}`),offense:lobby.teams[index]?.offense || '21',defense:lobby.teams[index]?.defense || '3-4',picks:{}}));
  }
  function ownLeague(state,leagueId,authHash,time,manage=false) {
    const league=state.leagues[leagueId];
    if (!league) fail(404,'NOT_FOUND','This league was not found.');
    if (league.ownerHash===authHash) return {league,canManage:true};
    for(const lobby of Object.values(state.lobbies)) {
      if(lobby.leagueId!==leagueId||!active(lobby,time))continue;
      const member=lobby.members.find(member=>member.tokenHash===authHash);
      if(member) {
        if(manage&&member.role!=='host')fail(403,'HOST_ONLY','Only the host can change the halls.');
        return {league,canManage:member.role==='host',lobby,member};
      }
    }
    if(league.readers?.[authHash]) {
      if(manage)fail(403,'HOST_ONLY','Use the league owner access or an active host session to change the halls.');
      return {league,canManage:false};
    }
    fail(403,'FORBIDDEN','Use your saved league access or join an active lobby to view these records.');
  }
  function recordAuction(league, award) {
    const career=league.careers[award.pokemonId] ||= blankCareer(award.pokemonId);
    career.draftCount++;career.auctionPurchases++;career.totalAuctionPaid+=award.amount;
    league.revision++;
  }
  function recordMatch(league,result) {
    if(league.recordedMatches[result.matchId])return;
    for(let index=0;index<result.teams.length;index++)for(const player of result.teams[index].players) {
      if(league.hall[player.pokemonId])fail(409,'RETIRED','A retired Pokémon is still on this roster. Start a new draft to play again.');
      const career=league.careers[player.pokemonId] ||= blankCareer(player.pokemonId);
      career.games++;career[result.winnerIndex===null?'draws':result.winnerIndex===index?'wins':'losses']++;
      if(result.offensiveMVP?.pokemonId===player.pokemonId)career.offensiveMVPs++;
      if(result.defensiveMVP?.pokemonId===player.pokemonId)career.defensiveMVPs++;
      career.appearancesByRole[player.role]=(career.appearancesByRole[player.role]||0)+1;
      for(const key of Match.statKeys) {
        if(key==='longestFieldGoal')career.stats[key]=Math.max(career.stats[key]||0,player.stats[key]||0);
        else career.stats[key]=(career.stats[key]||0)+(player.stats[key]||0);
      }
    }
    league.recordedMatches[result.matchId]=true;league.matchCount=(league.matchCount||0)+1;league.revision++;
    (league.matches ||= []).push({matchId:result.matchId,playedAt:nowISO(clock()),teams:result.teams.map(team=>({name:team.name,score:team.score,quarters:team.quarters,biggestPlay:team.biggestPlay})),offensiveMVP:result.offensiveMVP,defensiveMVP:result.defensiveMVP,winnerIndex:result.winnerIndex,summary:result.summary});
  }
  function remapScheme(team,payload) {
    const next={...team,offense:payload.offense??team.offense,defense:payload.defense??team.defense};
    if(!OFFENSES.includes(next.offense)||!DEFENSES.includes(next.defense))fail(400,'INVALID_SCHEME','Choose a supported offense and defense.');
    const oldSlots=slots(team),newSlots=slots(next),newKeys=new Set(newSlots.map(s=>s.key)),picks={};
    for(const [key,id]of Object.entries(team.picks))if(newKeys.has(key))picks[key]=id;
    for(const [key,id]of Object.entries(team.picks))if(!newKeys.has(key)){
      const oldRole=oldSlots.find(slot=>slot.key===key)?.role;
      const target=newSlots.find(slot=>!picks[slot.key]&&slot.role===oldRole)||newSlots.find(slot=>!picks[slot.key]);
      if(!target)fail(409,'INVALID_SCHEME','This scheme cannot hold the current roster.');
      picks[target.key]=id;
    }
    return {...next,picks};
  }
  async function mutate(fn) {
    for(let attempt=0;attempt<8;attempt++) {
      const stored=await store.read();
      const state=clone(stored.state),time=clock();
      state.leagues ||= {};state.lobbies ||= {};
      const result=await fn(state,time);
      if(result?.unchanged)return result.value;
      if(await store.commit(stored.revision,state))return result;
    }
    fail(409,'CONFLICT','Another update arrived at the same time. Refresh and try again.');
  }
  async function createLobby(body,authHash) {
    const hostToken=token(),hostHash=await digest(hostToken),ownerToken=token(),ownerHash=await digest(ownerToken),readToken=token(),readHash=await digest(readToken);
    return mutate((state,time)=>{
      for(const [code,lobby]of Object.entries(state.lobbies))if(!active(lobby,time))delete state.lobbies[code];
      let league;
      if(body.leagueId) {
        league=state.leagues[body.leagueId];
        if(!league||league.ownerHash!==authHash)fail(403,'LEAGUE_ACCESS','Saved league access is required to host another room for that league.');
      }else {
        const id=crypto.randomUUID();league={id,name:cleanName(body.leagueName,'Friends league'),ownerHash,revision:1,createdAt:nowISO(time),careers:{},hall:{},recordedMatches:{},hallActions:{},matchCount:0};state.leagues[id]=league;
      }
      (league.readers ||= {})[hostHash]=true;league.readers[readHash]=true;
      let code;
      for(let attempt=0;attempt<150;attempt++){const value=String(Math.floor(randomUnit()*10000)).padStart(4,'0');if(!state.lobbies[value]){code=value;break;}}
      if(!code)fail(503,'ROOMS_BUSY','The lobby service is busy. Try again in a moment.');
      const host={id:crypto.randomUUID(),nickname:cleanName(body.nickname,'Host'),role:'host',teamIndex:0,tokenHash:hostHash,joinedAt:time};
      const lobby={code,leagueId:league.id,version:1,mode:'both',teamCount:2,teams:[],members:[host],messages:[],session:null,lastActivity:time,createdAt:time,match:null,matches:[],actions:{},chatActions:{}};
      configure(lobby,body);state.lobbies[code]=lobby;systemMessage(lobby,`${host.nickname} opened the lobby.`,time);
      return {...view(lobby,host,state,time,hostToken),leagueReadToken:readToken,...(!body.leagueId?{leagueToken:ownerToken}:{})};
    });
  }
  async function joinLobby(body) {
    const freshToken=token(),hash=await digest(freshToken),readToken=token(),readHash=await digest(readToken);
    return mutate((state,time)=>{
      const lobby=requireLobby(state,String(body.code||''),time);
      if(lobby.members.length>=lobby.teamCount)fail(409,'LOBBY_FULL','This lobby already has a player for every team.');
      const claimed=new Set(lobby.members.map(member=>member.teamIndex));
      const teamIndex=body.teamIndex===undefined?lobby.teams.findIndex((_,index)=>!claimed.has(index)):body.teamIndex;
      if(!Number.isInteger(teamIndex)||teamIndex<0||teamIndex>=lobby.teamCount||claimed.has(teamIndex))fail(409,'TEAM_TAKEN','That team already has a player.');
      const member={id:crypto.randomUUID(),nickname:cleanName(body.nickname,'Guest'),role:'viewer',teamIndex,tokenHash:hash,joinedAt:time};
      const league=state.leagues[lobby.leagueId];(league.readers ||= {})[hash]=true;league.readers[readHash]=true;
      lobby.members.push(member);touch(lobby,time);systemMessage(lobby,`${member.nickname} joined ${lobby.teams[teamIndex].name}.`,time);
      return {...view(lobby,member,state,time,freshToken),leagueReadToken:readToken};
    });
  }
  async function lobbyAction(code,body,authHash) {
    if(!actionID(body.actionId))fail(400,'INVALID_ACTION','This action needs a unique request ID.');
    const supported=new Set(['configure','rename','start','bid','skip','place','scheme','simulate']);
    if(!supported.has(body.type))fail(400,'INVALID_ACTION','This game action is not supported.');
    const payload=object(body.payload)?body.payload:{};
    return mutate((state,time)=>{
      const lobby=requireLobby(state,code,time),member=memberFor(lobby,authHash),league=state.leagues[lobby.leagueId];
      if(member.role!=='host')fail(403,'HOST_ONLY','Only the host can submit bids, change teams, or simulate matches.');
      const previous=lobby.actions[body.actionId];
      if(previous){if(previous!==body.type)fail(409,'ACTION_REUSED','That request ID was already used for another action.');return {unchanged:true,value:view(lobby,member,state,time)};}
      if(!Number.isInteger(body.version)||body.version>(lobby.version)||body.version<(lobby.lastGameVersion||1))fail(409,'CONFLICT','The lobby changed. The latest version will load; please try again.');
      const phase=lobby.session?Auction.phase(lobby.session):'waiting';
      const pool=POKEMON.filter(p=>eligible(p.id,lobby.mode)&&!league.hall[p.id]).map(p=>p.id);
      switch(body.type){
        case 'configure':
          if(phase!=='waiting')fail(409,'AUCTION_STARTED','Team count, names, and pool must be chosen before the auction starts.');
          configure(lobby,payload);break;
        case 'rename': {
          const index=payload.teamIndex;
          if(!Number.isInteger(index)||!lobby.teams[index])fail(400,'INVALID_TEAM','Choose a team in this lobby.');
          lobby.teams[index].name=cleanName(payload.name,`Team ${index+1}`);break; }
        case 'start':
          if(phase!=='waiting')fail(409,'AUCTION_STARTED','This auction has already started.');
          lobby.session=Auction.create(pool,{mode:lobby.mode,teamCount:lobby.teamCount,random:randomUnit});
          systemMessage(lobby,`Auction started: ${lobby.teamCount} teams, $1,000 each, ${lobby.session.lots.length} Pokémon.`,time);break;
        case 'bid':{
          if(phase!=='bidding')fail(409,'WRONG_PHASE','Place the current Pokémon before bidding again.');
          const id=Auction.current(lobby.session);if(league.hall[id])fail(409,'RETIRED','This Pokémon was retired. Skip it to draw another.');
          const awarded=Auction.bid(lobby.session,payload.bids,randomUnit);lobby.session=awarded.session;
          recordAuction(league,awarded.award);systemMessage(lobby,`${lobby.teams[awarded.award.team].name} drafted ${names.get(id)} for $${awarded.award.amount}.`,time);break;}
        case 'skip':
          if(phase!=='bidding')fail(409,'WRONG_PHASE','Only the Pokémon up for bidding can be skipped.');
          {const id=Auction.current(lobby.session);lobby.session=Auction.skip(lobby.session,pool,randomUnit);systemMessage(lobby,`${names.get(id)} was skipped for the rest of this draft.`,time);}break;
        case 'place':{
          if(phase==='waiting')fail(409,'WRONG_PHASE','Start the auction before placing Pokémon.');
          const teamIndex=payload.teamIndex ?? payload.team, key=payload.slotKey ?? payload.key;
          if(!Number.isInteger(teamIndex)||!lobby.teams[teamIndex])fail(400,'INVALID_TEAM','Choose a team in this lobby.');
          const board=lobby.teams[teamIndex];if(!slots(board).some(slot=>slot.key===key))fail(400,'INVALID_POSITION','Choose an active position for this formation.');
          const pending=phase==='placement'?lobby.session.awards.at(-1):null,id=payload.pokemonId??pending?.pokemonId;
          if(!idOK(id)||!Auction.owned(lobby.session,teamIndex).includes(id))fail(400,'NOT_OWNED','That Pokémon is not owned by this team.');
          const oldKey=Object.keys(board.picks).find(slotKey=>board.picks[slotKey]===id);
          if(pending&&pending.pokemonId===id){
            if(teamIndex!==pending.team)fail(400,'NOT_OWNED','Place this Pokémon on the winning team.');
            if(board.picks[key]&&board.picks[key]!==id)fail(409,'POSITION_FILLED','Choose an empty position for the new Pokémon.');
            if(oldKey)delete board.picks[oldKey];board.picks[key]=id;lobby.session=Auction.place(lobby.session);
          }else{
            if(!oldKey)fail(400,'NOT_PLACED','This Pokémon is not currently on the field.');
            const swapped=board.picks[key];delete board.picks[oldKey];board.picks[key]=id;if(swapped&&swapped!==id)board.picks[oldKey]=swapped;
          }
          lobby.match=null;break;}
        case 'scheme':{
          const teamIndex=payload.teamIndex ?? payload.team;
          if(!Number.isInteger(teamIndex)||!lobby.teams[teamIndex])fail(400,'INVALID_TEAM','Choose a team in this lobby.');
          lobby.teams[teamIndex]=remapScheme(lobby.teams[teamIndex],payload);lobby.match=null;break;}
        case 'simulate':{
          if(phase!=='complete')fail(409,'INCOMPLETE_TEAMS','Fill every team roster before simulating a match.');
          const indexes=payload.teamIndexes || payload.teams || [0,1];
          if(!Array.isArray(indexes)||indexes.length!==2||indexes[0]===indexes[1]||indexes.some(index=>!Number.isInteger(index)||!lobby.teams[index]))fail(400,'INVALID_MATCHUP','Choose two different teams from this lobby.');
          const selected=indexes.map(index=>{const board=lobby.teams[index];return{name:board.name,positions:slots(board).map(slot=>({...slot,pokemonId:board.picks[slot.key]}))};});
          for(const team of selected)for(const slot of team.positions)if(league.hall[slot.pokemonId])fail(409,'RETIRED','A retired Pokémon is on this team. Start a new draft to play again.');
          const result=Match.simulate(selected[0],selected[1],{random:randomUnit});result.teamIndexes=indexes;
          recordMatch(league,result);lobby.match=clone(result);lobby.matches.push(clone(result));systemMessage(lobby,result.summary,time);break;}
      }
      lobby.actions[body.actionId]=body.type;touch(lobby,time);lobby.lastGameVersion=lobby.version;
      return view(lobby,member,state,time);
    });
  }
  async function chat(code,body,authHash) {
    if(!actionID(body.actionId))fail(400,'INVALID_ACTION','This message needs a unique request ID.');
    if(typeof body.message!=='string')fail(400,'INVALID_MESSAGE','Enter a chat message.');
    const message=body.message.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
    if(!message||Array.from(message).length>500)fail(400,'INVALID_MESSAGE','Chat messages must contain between 1 and 500 characters.');
    return mutate((state,time)=>{
      const lobby=requireLobby(state,code,time),member=memberFor(lobby,authHash);
      if(lobby.chatActions[body.actionId]){if(lobby.chatActions[body.actionId]!==member.id)fail(409,'ACTION_REUSED','That message ID is already in use.');return{unchanged:true,value:view(lobby,member,state,time)};}
      const recent=lobby.messages.filter(item=>item.memberId===member.id&&Date.parse(item.createdAt)>time-10000);
      if(recent.length>=10)fail(429,'RATE_LIMITED','Please slow down before sending another message.');
      lobby.messages.push({id:body.actionId,memberId:member.id,nickname:member.nickname,message,createdAt:nowISO(time)});lobby.messages=lobby.messages.slice(-200);
      lobby.chatActions[body.actionId]=member.id;touch(lobby,time);return view(lobby,member,state,time);
    });
  }
  async function changeHall(leagueId,body,authHash) {
    if(!actionID(body.actionId)||!idOK(body.pokemonId)||![null,'fame','shame'].includes(body.kind))fail(400,'INVALID_HALL','Choose a Pokémon and Hall of Fame, Hall of Shame, or removal.');
    return mutate((state,time)=>{
      const access=ownLeague(state,leagueId,authHash,time,true),league=access.league;
      if(league.hallActions[body.actionId])return{unchanged:true,value:{league:leagueView(league,true),serverTime:nowISO(time)}};
      const id=body.pokemonId;
      if(body.kind!==null){
        const ongoing=Object.values(state.lobbies).filter(lobby=>lobby.leagueId===leagueId&&active(lobby,time)&&lobby.session&&Auction.phase(lobby.session)!=='complete');
        if(ongoing.some(lobby=>lobby.session.awards.some(award=>award.pokemonId===id)))fail(409,'ON_ACTIVE_ROSTER','This Pokémon is part of an ongoing auction. Finish the draft before retiring it.');
        // Future lots are private, but are still reserved roster capacity. Redraw
        // every affected room in this same transaction before retiring a species.
        // A failure anywhere rolls back all rooms and the Hall change together.
        for(const lobby of ongoing){
          const index=lobby.session.lots.indexOf(id);
          if(index<0||index<lobby.session.awards.length)continue;
          const unavailable=new Set([...lobby.session.lots,...lobby.session.skipped,id]);
          const candidates=POKEMON.filter(p=>eligible(p.id,lobby.mode)&&!league.hall[p.id]&&!unavailable.has(p.id));
          if(!candidates.length)fail(409,'AUCTION_POOL_RESERVED','Every remaining Pokémon is needed to finish an active auction. Finish the draft before inducting this Pokémon.');
          const replacement=candidates[Math.floor(randomUnit()*candidates.length)].id;
          const next={...lobby.session,lots:lobby.session.lots.slice(),skipped:[...lobby.session.skipped,id]};
          next.lots[index]=replacement;
          const checked=Auction.validate(next);
          if(!checked)fail(409,'INVALID_AUCTION','This retirement could not preserve the auction roster. Finish the draft before inducting this Pokémon.');
          lobby.session=checked;touch(lobby,time);lobby.lastGameVersion=lobby.version;
          systemMessage(lobby,`${names.get(id)} was retired. Its undrafted auction slot was redrawn.`,time);
        }
        const career=clone(league.careers[id]||blankCareer(id));
        league.hall[id]=league.hall[id]?{...league.hall[id],kind:body.kind}:{pokemonId:id,kind:body.kind,inductedAt:nowISO(time),career,values:Object.fromEntries(Ratings.roles.map(role=>[role,Ratings.rate(id,role)])),reasons:Object.fromEntries(Ratings.roles.map(role=>[role,Ratings.explain?.(id,role)||'']))};
      }else delete league.hall[id];
      league.revision++;league.hallActions[body.actionId]=true;
      if(access.lobby)touch(access.lobby,time);
      return {league:leagueView(league,true),serverTime:nowISO(time)};
    });
  }
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
  const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  async function fetchHandler(request) {
    try {
      const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method;
      if(path==='/api/health'&&method==='GET'){await store.read();return response({ok:true,persistence:store.kind||'configured',rosterSize:ROSTER_SIZE});}
      if(!path.startsWith('/api/'))return response({error:'API route not found.',code:'NOT_FOUND'},404);
      if(method==='OPTIONS')return new Response(null,{status:204,headers:{allow:'GET, POST, OPTIONS'}});
      if(!['GET','POST'].includes(method))fail(405,'METHOD_NOT_ALLOWED','Use GET or POST for this endpoint.');
      if(method==='POST'){
        const origin=request.headers.get('origin');
        if(origin&&origin!==url.origin)fail(403,'ORIGIN_MISMATCH','Open the game directly to submit updates.');
        const declared=Number(request.headers.get('content-length')||0);if(declared>20000)fail(413,'TOO_LARGE','This request is too large.');
      }
      let body={};
      if(method==='POST'){
        const text=await request.text();if(text.length>20000)fail(413,'TOO_LARGE','This request is too large.');
        try{body=text?JSON.parse(text):{};}catch{fail(400,'INVALID_JSON','Send a valid JSON request.');}
        if(!object(body))fail(400,'INVALID_JSON','Send a JSON object.');
      }
      const auth=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1] || '';
      const owner=typeof body.leagueToken==='string'?body.leagueToken:auth;
      const authHash=await digest(path==='/api/lobbies'&&method==='POST'?owner:auth);
      if(path==='/api/lobbies'&&method==='POST')return response(await createLobby(body,authHash),201);
      if(path==='/api/lobbies/join'&&method==='POST')return response(await joinLobby(body),201);
      let match=path.match(/^\/api\/lobbies\/(\d{4})(?:\/(action|chat))?$/);
      if(match){
        const [,code,operation]=match;
        if(method==='GET'&&!operation){
          const stored=await store.read(),time=clock(),lobby=requireLobby(stored.state,code,time),member=memberFor(lobby,authHash);
          const etag=`"${lobby.code}-${lobby.createdAt}-${lobby.version}-${stored.state.leagues[lobby.leagueId].revision}-${member.id}"`;
          if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:{...headers,etag}});
          const result=response(view(lobby,member,stored.state,time));result.headers.set('etag',etag);return result;
        }
        if(method==='POST'&&operation==='action')return response(await lobbyAction(code,body,authHash));
        if(method==='POST'&&operation==='chat')return response(await chat(code,body,authHash));
      }
      match=path.match(/^\/api\/leagues\/([A-Za-z0-9-]{16,64})(?:\/(hall))?$/);
      if(match){
        const [,leagueId,operation]=match;
        if(method==='GET'&&!operation){const stored=await store.read(),access=ownLeague(stored.state,leagueId,authHash,clock());return response({league:leagueView(access.league,access.canManage),serverTime:nowISO(clock())});}
        if(method==='POST'&&operation==='hall')return response(await changeHall(leagueId,body,authHash));
      }
      fail(404,'NOT_FOUND','This API route was not found.');
    }catch(error){
      if(error instanceof Problem)return response({error:error.message,code:error.code},error.status);
      if(error instanceof DatabaseError)return response({error:error.message,code:error.code},503);
      if(error?.name==='SyntaxError'||error?.name==='RangeError'||/auction|Pokémon|bid|position|roster|formation|random/i.test(error?.message||''))return response({error:error.message,code:'INVALID_GAME_ACTION'},400);
      console.error('Multiplayer request failed:',error?.name||'Error',error?.message||'Unknown error');
      return response({error:'The game server could not save this update. Please try again.',code:'SERVER_ERROR'},503);
    }
  }
  return Object.freeze({fetch:fetchHandler});
}
