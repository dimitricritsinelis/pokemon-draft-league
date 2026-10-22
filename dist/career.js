/* Career records are browser-local in solo play and server-authoritative in an online league. */
(() => {
  'use strict';
  const storageKey = 'pokemon-draft-careers-v1';
  const roles = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'FS', 'SS', 'CB', 'DE', 'NT', 'DT', 'ILB', 'OLB', 'MLB', 'WLB', 'SLB', 'LB', 'NB', 'DB', 'K'];
  const offensiveRoles = new Set(roles.slice(0, 10));
  const statKeys = [
    'passingAttempts', 'passingCompletions', 'passingYards', 'passingTD', 'interceptionsThrown', 'sackYardsLost',
    'carries', 'rushingYards', 'rushingTD', 'targets', 'receptions', 'receivingYards', 'receivingTD',
    'tackles', 'sacks', 'sackYards', 'interceptions', 'passesDefended', 'forcedFumbles', 'fumblesLost', 'fumbleRecoveries',
    'passBlockSnaps', 'runBlockSnaps', 'blocks', 'pressuresAllowed', 'sacksAllowed', 'pancakes', 'pressures', 'offensiveSnaps', 'defensiveSnaps',
    'fieldGoalAttempts', 'fieldGoalsMade', 'longestFieldGoal', 'extraPointAttempts', 'extraPointsMade', 'kickingPoints', 'specialTeamsSnaps'
  ];
  const maxStoredChars = 4000000, maxCounter = 1000000000000;
  const validId = id => Number.isInteger(id) && id >= 1 && id <= 386;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const counter = value => Number.isInteger(value) && value >= 0 && value <= maxCounter;
  const amount = (value, key) => Number.isFinite(value) && value >= (key === 'rushingYards' ? -maxCounter : 0) && value <= maxCounter;
  const validEventId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value);
  const names = new Map((window.POKEMON || []).filter(p => validId(p.id)).map(p => [p.id, p.name]));
  let careers = Object.create(null), inductees = Object.create(null), matches = new Set(), drafts = new Set(), saved = false, remote = null;
  function blank(id) {
    return { pokemonId: id, name: names.get(id) || `Pokémon #${id}`, games: 0, wins: 0, losses: 0, draws: 0, offensiveMVPs: 0, defensiveMVPs: 0,
      draftCount: 0, totalAuctionPaid: 0, auctionPurchases: 0, averagePaid: 0, appearancesByRole: {}, stats: Object.fromEntries(statKeys.map(key => [key, 0])) };
  }
  function cloneCareer(career) { return { ...career, averagePaid: career.auctionPurchases ? career.totalAuctionPaid / career.auctionPurchases : 0, appearancesByRole: { ...career.appearancesByRole }, stats: { ...career.stats } }; }
  function cloneInductee(entry) { return { ...entry, kind: entry.kind || 'fame', career: cloneCareer(entry.career), ...(entry.values ? { values: { ...entry.values } } : {}), ...(entry.reasons ? { reasons: { ...entry.reasons } } : {}) }; }
  function freezeInductee(entry) { Object.freeze(entry.career.stats); Object.freeze(entry.career.appearancesByRole); Object.freeze(entry.career); return Object.freeze(entry); }
  function parseCareer(value, id) {
    if (!object(value) || value.pokemonId !== id) return null;
    const result = blank(id);
    for (const key of ['games', 'wins', 'losses', 'draws', 'offensiveMVPs', 'defensiveMVPs', 'draftCount', 'totalAuctionPaid', 'auctionPurchases']) {
      const next = value[key] ?? 0;
      if (!counter(next)) return null;
      result[key] = next;
    }
    if (result.wins + result.losses + result.draws !== result.games || result.offensiveMVPs > result.games || result.defensiveMVPs > result.games || result.auctionPurchases > result.draftCount) return null;
    if (!object(value.stats) || !object(value.appearancesByRole)) return null;
    for (const key of statKeys) { const next = value.stats[key] ?? 0; if (!amount(next, key)) return null; result.stats[key] = next; }
    let appearances = 0;
    for (const role of roles) {
      if (!Object.hasOwn(value.appearancesByRole, role)) continue;
      const count = value.appearancesByRole[role];
      if (!counter(count) || count > result.games) return null;
      result.appearancesByRole[role] = count; appearances += count;
    }
    if (appearances !== result.games) return null;
    result.averagePaid = result.auctionPurchases ? result.totalAuctionPaid / result.auctionPurchases : 0;
    return result;
  }
  function parseRecords(value) {
    const parsed = { careers: Object.create(null), hall: Object.create(null) };
    for (let id = 1; id <= 386; id++) {
      const career = parseCareer(value.careers?.[id], id);
      if (career) parsed.careers[id] = career;
      const entry = value.hall?.[id];
      if (!object(entry) || entry.pokemonId !== id || !['fame', 'shame'].includes(entry.kind || 'fame') || typeof entry.inductedAt !== 'string' || entry.inductedAt.length > 40 || !Number.isFinite(Date.parse(entry.inductedAt))) continue;
      const snapshot = parseCareer(entry.career, id);
      if (!snapshot) continue;
      const values = {}, reasons = {};
      for (const role of roles) {
        if (Number.isFinite(entry.values?.[role]) && entry.values[role] >= 0 && entry.values[role] <= 100) values[role] = entry.values[role];
        if (typeof entry.reasons?.[role] === 'string') reasons[role] = entry.reasons[role].slice(0, 3000);
      }
      parsed.hall[id] = freezeInductee({ pokemonId: id, kind: entry.kind || 'fame', inductedAt: new Date(entry.inductedAt).toISOString(), career: snapshot, values, reasons });
      parsed.careers[id] = cloneCareer(snapshot);
    }
    return parsed;
  }
  function load() {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) { careers = Object.create(null); inductees = Object.create(null); matches = new Set(); drafts = new Set(); return true; }
      if (raw.length > maxStoredChars) return false;
      const value = JSON.parse(raw);
      if (!object(value) || ![1, 2].includes(value.v) || !object(value.careers) || !object(value.hall) || !Array.isArray(value.matches) || value.matches.length > 50000 || value.matches.some(id => !validEventId(id)) || (value.drafts != null && (!Array.isArray(value.drafts) || value.drafts.length > 50000 || value.drafts.some(id => !validEventId(id))))) return false;
      const parsed = parseRecords(value); careers = parsed.careers; inductees = parsed.hall; matches = new Set(value.matches); drafts = new Set(value.drafts || []); return true;
    } catch { saved = false; return false; }
  }
  function save() {
    try {
      const raw = JSON.stringify({ v: 2, careers, hall: inductees, matches: [...matches], drafts: [...drafts] });
      if (raw.length > maxStoredChars || matches.size > 50000 || drafts.size > 50000) { saved = false; return false; }
      window.localStorage.setItem(storageKey, raw); saved = true; return true;
    } catch { saved = false; return false; }
  }
  const activeCareers = () => remote ? remote.careers : careers;
  const activeHall = () => remote ? remote.hall : inductees;
  function requireId(id) { if (!validId(id)) throw new RangeError('Choose a Pokémon from generations 1–3.'); }
  function validateMatch(result) {
    if (!object(result) || !validEventId(result.matchId) || !Array.isArray(result.teams) || result.teams.length !== 2 || ![null, 0, 1].includes(result.winnerIndex)) throw new Error('The career ledger needs a complete match result.');
    const used = new Set();
    const players = result.teams.flatMap((team, teamIndex) => {
      if (!object(team) || !counter(team.score) || !Array.isArray(team.players) || ![22, 23].includes(team.players.length)) throw new Error('The career ledger needs a complete roster on each team.');
      const sides = { offense: 0, defense: 0, special: 0 };
      const rows = team.players.map(player => {
        const expectedSide = player?.role === 'K' ? 'special' : offensiveRoles.has(player?.role) ? 'offense' : 'defense';
        if (!object(player) || !validId(player.pokemonId) || used.has(player.pokemonId) || !roles.includes(player.role) || player.side !== expectedSide || !object(player.stats)) throw new Error('The match contains an invalid or duplicate player.');
        used.add(player.pokemonId); sides[player.side]++;
        const stats = {};
        for (const key of statKeys) { const value = player.stats[key] ?? 0; if (!amount(value, key)) throw new Error('The match contains invalid player statistics.'); stats[key] = value; }
        return { pokemonId: player.pokemonId, role: player.role, side: player.side, teamIndex, stats };
      });
      if (sides.offense !== 11 || sides.defense !== 11 || sides.special !== team.players.length - 22) throw new Error('Each team needs 11 offensive players, 11 defenders, and one kicker.');
      return rows;
    });
    const expectedWinner = result.teams[0].score === result.teams[1].score ? null : result.teams[0].score > result.teams[1].score ? 0 : 1;
    if (result.winnerIndex !== expectedWinner) throw new Error('The match winner does not agree with the final score.');
    for (const key of ['offensiveMVP', 'defensiveMVP']) {
      if (result[key] == null) continue;
      const award = result[key], player = players.find(p => p.pokemonId === award.pokemonId);
      if (!object(award) || !validId(award.pokemonId) || !player || player.side !== (key === 'offensiveMVP' ? 'offense' : 'defense') || (award.teamIndex != null && award.teamIndex !== player.teamIndex) || (award.role != null && award.role !== player.role)) throw new Error('The match MVP needs to match a player, team and side from the game.');
    }
    return players;
  }
  function recordMatch(result) {
    if (remote) return false; // The server records the same transaction that creates the result.
    const players = validateMatch(result); refresh(); if (matches.has(result.matchId)) return false;
    const updates = [];
    for (const player of players) {
      if (inductees[player.pokemonId]) continue;
      const career = cloneCareer(careers[player.pokemonId] || blank(player.pokemonId)); career.games++;
      career[result.winnerIndex === null ? 'draws' : result.winnerIndex === player.teamIndex ? 'wins' : 'losses']++;
      if (result.offensiveMVP?.pokemonId === player.pokemonId) career.offensiveMVPs++;
      if (result.defensiveMVP?.pokemonId === player.pokemonId) career.defensiveMVPs++;
      career.appearancesByRole[player.role] = (career.appearancesByRole[player.role] || 0) + 1;
      for (const key of statKeys) career.stats[key] = key === 'longestFieldGoal' ? Math.max(career.stats[key], player.stats[key]) : career.stats[key] + player.stats[key];
      if (!counter(career.games) || statKeys.some(key => !amount(career.stats[key], key))) throw new Error('The career statistics exceed the supported total.');
      updates.push(career);
    }
    for (const career of updates) careers[career.pokemonId] = career;
    matches.add(result.matchId); save(); return true;
  }
  function recordDraft(id, price = null, eventId) {
    requireId(id); if (remote) return false;
    if (price !== null && (!counter(price) || price > 1000)) throw new Error('The draft price must be a whole-dollar amount from $0 to $1,000.');
    if (!validEventId(eventId)) throw new Error('A draft event needs a unique identifier.');
    refresh(); if (drafts.has(eventId) || inductees[id]) return false;
    const career = cloneCareer(careers[id] || blank(id)); career.draftCount++;
    if (price !== null) { career.auctionPurchases++; career.totalAuctionPaid += price; }
    if (![career.draftCount, career.auctionPurchases, career.totalAuctionPaid].every(counter)) throw new Error('The draft statistics exceed the supported total.');
    careers[id] = career; drafts.add(eventId); save(); return true;
  }
  function get(id) { requireId(id); return cloneCareer(activeCareers()[id] || blank(id)); }
  function list() { return Object.values(activeCareers()).filter(c => c.games > 0 || c.draftCount > 0).map(cloneCareer).sort((a, b) => b.games - a.games || a.pokemonId - b.pokemonId); }
  function isInducted(id) { requireId(id); return Boolean(activeHall()[id]); }
  function hall(kind) { return Object.values(activeHall()).filter(entry => !kind || entry.kind === kind).map(cloneInductee).sort((a, b) => a.inductedAt.localeCompare(b.inductedAt) || a.pokemonId - b.pokemonId); }
  function canManage() { return !remote || (typeof remote.options.canManage === 'function' ? Boolean(remote.options.canManage()) : Boolean(remote.options.canManage)); }
  async function remoteHall(id, kind) {
    if (!canManage()) throw new Error('Only the lobby host can change the halls.');
    if (typeof remote.options.onHallAction !== 'function') throw new Error('The shared records are unavailable. Reconnect and try again.');
    const options = remote.options, response = await options.onHallAction(id, kind);
    if (response?.league) setRemote(response.league, options);
    else if (response?.careers && response?.hall) setRemote(response, options);
    const entry = activeHall()[id];
    if (kind !== null && (!entry || entry.kind !== kind)) throw new Error('The induction was not confirmed by the server. Please try again.');
    if (kind === null && entry) throw new Error('The removal was not confirmed by the server. Please try again.');
    return entry ? cloneInductee(entry) : true;
  }
  function induct(id, kind = 'fame') {
    requireId(id); if (!['fame', 'shame'].includes(kind)) throw new Error('Choose the Hall of Fame or Hall of Shame.');
    if (remote) return remoteHall(id, kind);
    refresh(); if (inductees[id]) return cloneInductee(inductees[id]);
    const career = careers[id] || blank(id); careers[id] = career;
    inductees[id] = freezeInductee({ pokemonId: id, kind, inductedAt: new Date().toISOString(), career: cloneCareer(career) });
    save(); return cloneInductee(inductees[id]);
  }
  function remove(id) { requireId(id); if (remote) return remoteHall(id, null); refresh(); if (!inductees[id]) return false; delete inductees[id]; save(); return true; }
  function setRemote(league, options = {}) {
    const value = league?.snapshot || league;
    if (!object(value) || !object(value.careers) || !object(value.hall)) throw new Error('The server returned incomplete league records.');
    const parsed = parseRecords(value); remote = { ...parsed, id: league.id || league.leagueId || '', name: league.name || '', options };
    return true;
  }
  function clearRemote() { remote = null; refresh(); }
  function refresh() { return remote ? true : saved ? load() : false; }
  load(); save();
  window.DraftCareers = Object.freeze({ recordMatch, recordDraft, get, list, isInducted, induct, remove, hall, shame: () => hall('shame'), refresh, setRemote, clearRemote, canManage, isRemote: () => Boolean(remote), persisted: () => remote ? true : saved });
})();
