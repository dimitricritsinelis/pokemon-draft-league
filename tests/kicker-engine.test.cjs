const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {}, console, Date, Math, Set, Map });
for (const file of ['assets/pokemon.js', 'ratings.js', 'auction.js', 'simulation.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'dist', file), 'utf8'), context, { filename: file });
}
const { DraftRatings: ratings, DraftAuction: auction, DraftMatch: match, POKEMON: catalog } = context.window;
const seed = value => () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
const positions = [
  ['o_lt','LT','offense'],['o_lg','LG','offense'],['o_c','C','offense'],['o_rg','RG','offense'],['o_rt','RT','offense'],
  ['o_qb','QB','offense'],['o_rb1','HB','offense'],['o_wr1','WR','offense'],['o_wr2','WR','offense'],['o_te1','TE','offense'],['o_rb2','FB','offense'],
  ['d_fs','FS','defense'],['d_ss','SS','defense'],['d_cb1','CB','defense'],['d_cb2','CB','defense'],
  ['d_de1','DE','defense'],['d_dt1','NT','defense'],['d_de2','DE','defense'],['d_lb1','ILB','defense'],['d_lb2','ILB','defense'],['d_lb3','OLB','defense'],['d_lb4','OLB','defense']
];
const team = (name, firstId, kickerId) => ({ name, positions: [...positions.map(([key,role,side], i) => ({key,role,side,pokemonId:firstId+i})), { key:'s_k', role:'K', side:'special', pokemonId:kickerId }] });
const sum = (team, key) => team.players.reduce((n,p) => n + p.stats[key], 0);

test('all 386 species have bounded K grade, factor and species-specific synopsis', () => {
  assert.equal(ratings.roles.length, 25);
  for (const p of catalog) {
    const value = ratings.rate(p.id, 'K');
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 100, p.name);
    assert.ok(ratings.factor(p.id, 'K') >= 0 && ratings.factor(p.id, 'K') <= 1);
    assert.ok(ratings.explain(p.id, 'K').includes('Kicking weighs'));
  }
  assert.equal(ratings.rate(106, 'K'), 100);
  assert.ok(ratings.rate(237, 'K') >= 95);
  assert.ok(ratings.rate(257, 'K') >= 95);
  assert.ok(ratings.rate(11, 'K') < 10);
  assert.ok(ratings.rate(9, 'K') > 90);
});

test('new 2–4 team auctions fill 23 unique owned Pokémon per team including kicker', () => {
  for (let count=2; count<=4; count++) {
    let session = auction.create(catalog.map(p=>p.id), { mode:'both', teamCount:count, random:seed(count) });
    assert.equal(session.rosterSize, 23);
    assert.equal(session.lots.length, count*23);
    while (auction.phase(session) !== 'complete') {
      const counts = auction.counts(session);
      const bid = Array(count).fill(0);
      const open = counts.findIndex(n=>n<23);
      bid[open] = 1;
      session = auction.bid(session, bid, seed(19)).session;
      session = auction.place(session);
    }
    assert.deepEqual(Array.from(auction.counts(session)), Array(count).fill(23));
    assert.equal(new Set(session.awards.map(x=>x.pokemonId)).size, count*23);
    assert.ok(auction.budgets(session).every(n=>n===977));
  }
});

test('legacy 22-player saved auctions retain their limit; malformed roster sizes rejected', () => {
  const legacy = { v:1, mode:'both', teamCount:2, lots:Array.from({length:44},(_,i)=>i+1), skipped:[], awards:[], placed:0 };
  assert.equal(auction.validate(legacy).rosterSize, 22);
  assert.equal(auction.validate({...legacy,rosterSize:24,lots:[]}), null);
});

test('100 games reconcile every score, passing, turnovers, sacks and kicker attempts', () => {
  for (let run=1;run<=100;run++) {
    const result = match.simulate(team('Kanto',130,106), team('Johto',152,237), {random:seed(run)});
    assert.equal(result.teams.length, 2);
    for (let i=0;i<2;i++) {
      const a=result.teams[i], b=result.teams[1-i];
      const k=a.players.find(p=>p.role==='K');
      assert.equal(a.players.length,23);
      assert.equal(a.players.filter(p=>p.side==='offense').length,11);
      assert.equal(a.players.filter(p=>p.side==='defense').length,11);
      assert.equal(a.score,a.quarters.reduce((n,v)=>n+v,0));
      const td=sum(a,'rushingTD')+sum(a,'receivingTD');
      assert.equal(a.score,td*6+k.stats.kickingPoints);
      assert.equal(k.stats.kickingPoints,k.stats.fieldGoalsMade*3+k.stats.extraPointsMade);
      assert.equal(a.fieldGoals,k.stats.fieldGoalsMade);
      assert.equal(a.extraPoints,k.stats.extraPointsMade);
      assert.equal(k.stats.extraPointAttempts,td);
      assert.equal(k.stats.specialTeamsSnaps,k.stats.extraPointAttempts+k.stats.fieldGoalAttempts);
      assert.ok(k.stats.fieldGoalsMade<=k.stats.fieldGoalAttempts);
      assert.ok(k.stats.extraPointsMade<=k.stats.extraPointAttempts);
      assert.equal(k.stats.offensiveSnaps,0);
      assert.equal(k.stats.defensiveSnaps,0);
      assert.equal(sum(a,'passingYards'),sum(a,'receivingYards'));
      assert.equal(sum(a,'passingTD'),sum(a,'receivingTD'));
      assert.equal(sum(a,'passingCompletions'),sum(a,'receptions'));
      assert.equal(sum(a,'interceptionsThrown'),sum(b,'interceptions'));
      assert.equal(sum(a,'sacksAllowed'),sum(b,'sacks'));
      assert.equal(sum(a,'sackYardsLost'),sum(b,'sackYards'));
      assert.equal(sum(a,'fumblesLost'),sum(b,'fumbleRecoveries'));
      assert.equal(a.turnovers,sum(a,'interceptionsThrown')+sum(a,'fumblesLost'));
      assert.ok(!['offensiveMVP','defensiveMVP'].some(key=>result[key].role==='K'));
      for(const p of a.players) for(const v of Object.values(p.stats)) assert.ok(Number.isInteger(v)&&Number.isFinite(v));
    }
  }
});

test('a viable kicker materially improves scoring over an immobile cocoon', () => {
  let elite=0, poor=0, eliteMade=0, poorMade=0;
  for(let run=1;run<=250;run++) {
    const good=match.simulate(team('Good',130,106),team('Other',152,237),{random:seed(run)}).teams[0];
    const bad=match.simulate(team('Bad',130,11),team('Other',152,237),{random:seed(run)}).teams[0];
    elite+=good.score;poor+=bad.score;
    eliteMade+=good.kicking.points;poorMade+=bad.kicking.points;
  }
  assert.ok(eliteMade>poorMade*3,`${eliteMade} vs ${poorMade} kicking points`);
  assert.ok(elite>poor+250,`${elite/250} vs ${poor/250} points per game`);
});

test('a kicker is mandatory and cannot duplicate a field player',()=>{
  const a=team('A',130,106),b=team('B',152,237);
  assert.throws(()=>match.simulate({...a,positions:a.positions.slice(0,22)},b),/23 positions/);
  assert.throws(()=>match.simulate(team('A',130,130),b),/only one position/);
});
