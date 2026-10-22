'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../dist/career.js'), 'utf8');
function setup(storage = new Map()) {
  const window = { POKEMON: Array.from({ length: 386 }, (_, i) => ({ id: i + 1, name: 'Pokemon ' + (i + 1) })), localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } };
  vm.runInNewContext(source, { window, console });
  return { api: window.DraftCareers, storage };
}
function result(id = 'match-1', longest = 44) {
  const offense = ['QB', 'HB', 'WR', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'FB'];
  const defense = ['FS', 'SS', 'CB', 'CB', 'DE', 'NT', 'DE', 'ILB', 'ILB', 'OLB', 'OLB'];
  return { matchId: id, winnerIndex: null, teams: [0, 1].map(team => ({ score: 0, players: [...offense.map(role => ({ role, side: 'offense' })), ...defense.map(role => ({ role, side: 'defense' })), { role: 'K', side: 'special' }].map((p, i) => ({ ...p, pokemonId: team * 23 + i + 1, stats: p.role === 'K' ? { fieldGoalAttempts: 1, fieldGoalsMade: 1, longestFieldGoal: longest, kickingPoints: 3 } : {} })) })) };
}
test('records every draft once and includes free auction awards in average', () => {
  const { api, storage } = setup();
  assert.equal(api.recordDraft(386, 100, 'auction:1'), true);
  assert.equal(api.recordDraft(386, 100, 'auction:1'), false);
  api.recordDraft(386, 0, 'auction:2');
  api.recordDraft(386, null, 'solo:3');
  const career = setup(storage).api.get(386);
  assert.equal(career.draftCount, 3);
  assert.equal(career.auctionPurchases, 2);
  assert.equal(career.totalAuctionPaid, 100);
  assert.equal(career.averagePaid, 50);
});
test('shame freezes career and retires, removal preserves totals', () => {
  const { api, storage } = setup();
  api.recordDraft(11, 0, 'auction:1');
  const entry = api.induct(11, 'shame');
  entry.career.stats.passingYards = 999;
  assert.equal(api.shame().length, 1);
  assert.equal(api.isInducted(11), true);
  assert.equal(api.get(11).stats.passingYards, 0);
  assert.equal(api.recordDraft(11, 50, 'auction:2'), false);
  assert.equal(setup(storage).api.hall('shame').length, 1);
  api.remove(11);
  assert.equal(api.isInducted(11), false);
  assert.equal(api.get(11).draftCount, 1);
});
test('kicker career sums makes but keeps maximum long field goal', () => {
  const { api, storage } = setup();
  assert.equal(api.recordMatch(result('match-1', 55)), true);
  assert.equal(api.recordMatch(result('match-1', 55)), false);
  api.recordMatch(result('match-2', 35));
  const kicker = setup(storage).api.get(23);
  assert.equal(kicker.games, 2);
  assert.equal(kicker.stats.fieldGoalsMade, 2);
  assert.equal(kicker.stats.longestFieldGoal, 55);
  assert.equal(kicker.stats.kickingPoints, 6);
  assert.equal(kicker.appearancesByRole.K, 2);
});
test('online clients hydrate authoritative snapshots and never write local matches', async () => {
  const { api } = setup();
  api.recordDraft(1, 25, 'local-draft');
  const league = { id: 'league-1', careers: { 1: api.get(1) }, hall: {} };
  api.setRemote(league, { canManage: false });
  assert.equal(api.isRemote(), true);
  assert.equal(api.recordMatch({ invalid: true }), false);
  assert.equal(api.recordDraft(2, 25, 'remote-draft'), false);
  await assert.rejects(api.induct(1, 'shame'), /Only the lobby host/);
  api.clearRemote();
  assert.equal(api.get(1).draftCount, 1);
  assert.equal(api.isInducted(1), false);
  api.setRemote(league, { canManage: true, onHallAction: async (pokemonId, kind) => ({ league: { ...league, hall: { [pokemonId]: { pokemonId, kind, inductedAt: new Date().toISOString(), career: api.get(pokemonId), values: { QB: 24, K: 42 }, reasons: { K: 'A useful kicking leg.' } } } } }) });
  const entry = await api.induct(1, 'shame');
  assert.equal(entry.values.K, 42);
  assert.equal(api.hall('shame').length, 1);
});
test('unconfirmed remote mutations fail instead of claiming success', async () => {
  const { api } = setup();
  api.setRemote({ careers: {}, hall: {} }, { canManage: true, onHallAction: async () => ({}) });
  await assert.rejects(api.induct(1), /not confirmed/);
  assert.equal(api.isInducted(1), false);
});
test('legacy v1 career data survives migration', () => {
  const { api, storage } = setup();
  api.recordMatch(result());
  const saved = JSON.parse(storage.get('pokemon-draft-careers-v1'));
  saved.v = 1; delete saved.drafts;
  for (const career of Object.values(saved.careers)) {
    delete career.draftCount; delete career.totalAuctionPaid; delete career.auctionPurchases;
  }
  storage.set('pokemon-draft-careers-v1', JSON.stringify(saved));
  const migrated = setup(storage).api;
  assert.equal(migrated.get(1).games, 1);
  assert.equal(migrated.get(1).draftCount, 0);
});
