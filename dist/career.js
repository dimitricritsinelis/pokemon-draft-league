/* Local career totals and Hall of Fame snapshots. Shared draft links never carry this data. */
(() => {
  'use strict';

  const storageKey = 'pokemon-draft-careers-v1';
  const roles = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'FS', 'SS', 'CB', 'DE', 'NT', 'DT', 'ILB', 'OLB', 'MLB', 'WLB', 'SLB', 'LB', 'NB', 'DB'];
  const offensiveRoles = new Set(roles.slice(0, 10));
  // Keep the persisted schema independent of the simulator's load order.
  const statKeys = [
    'passingAttempts', 'passingCompletions', 'passingYards', 'passingTD', 'interceptionsThrown', 'sackYardsLost',
    'carries', 'rushingYards', 'rushingTD', 'targets', 'receptions', 'receivingYards', 'receivingTD',
    'tackles', 'sacks', 'sackYards', 'interceptions', 'passesDefended', 'forcedFumbles', 'fumblesLost', 'fumbleRecoveries',
    'passBlockSnaps', 'runBlockSnaps', 'blocks', 'pressuresAllowed', 'sacksAllowed', 'pancakes', 'pressures',
    'offensiveSnaps', 'defensiveSnaps'
  ];
  const maxStoredChars = 2500000;
  const maxCounter = 1000000000000;
  const validId = id => Number.isInteger(id) && id >= 1 && id <= 251;
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const counter = value => Number.isInteger(value) && value >= 0 && value <= maxCounter;
  const amount = (value, key) => Number.isFinite(value) && value >= (key === 'rushingYards' ? -maxCounter : 0) && value <= maxCounter;
  const validMatchId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
  const names = new Map((window.POKEMON || []).filter(p => validId(p.id)).map(p => [p.id, p.name]));
  let careers = Object.create(null), inductees = Object.create(null), matches = new Set(), saved = false;

  function blank(id) {
    return {
      pokemonId: id, name: names.get(id) || `Pokémon #${id}`,
      games: 0, wins: 0, losses: 0, draws: 0, offensiveMVPs: 0, defensiveMVPs: 0,
      appearancesByRole: {}, stats: Object.fromEntries(statKeys.map(key => [key, 0]))
    };
  }

  function cloneCareer(career) {
    return { ...career, appearancesByRole: { ...career.appearancesByRole }, stats: { ...career.stats } };
  }

  function cloneInductee(entry) {
    return { pokemonId: entry.pokemonId, inductedAt: entry.inductedAt, career: cloneCareer(entry.career) };
  }

  function freezeInductee(entry) {
    Object.freeze(entry.career.stats); Object.freeze(entry.career.appearancesByRole);
    Object.freeze(entry.career); return Object.freeze(entry);
  }

  function parseCareer(value, id) {
    if (!isObject(value) || value.pokemonId !== id) return null;
    const result = blank(id);
    for (const key of ['games', 'wins', 'losses', 'draws', 'offensiveMVPs', 'defensiveMVPs']) {
      if (!counter(value[key])) return null;
      result[key] = value[key];
    }
    if (result.wins + result.losses + result.draws !== result.games || result.offensiveMVPs > result.games || result.defensiveMVPs > result.games) return null;
    if (!isObject(value.stats) || !isObject(value.appearancesByRole)) return null;
    for (const key of statKeys) {
      const valueForKey = value.stats[key] ?? 0;
      if (!amount(valueForKey, key)) return null;
      result.stats[key] = valueForKey;
    }
    let appearances = 0;
    for (const role of roles) {
      if (!Object.hasOwn(value.appearancesByRole, role)) continue;
      const count = value.appearancesByRole[role];
      if (!counter(count) || count > result.games) return null;
      result.appearancesByRole[role] = count; appearances += count;
    }
    if (appearances !== result.games) return null;
    return result;
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) { careers = Object.create(null); inductees = Object.create(null); matches = new Set(); return true; }
      if (raw.length > maxStoredChars) return false;
      const value = JSON.parse(raw);
      if (!isObject(value) || value.v !== 1 || !isObject(value.careers) || !isObject(value.hall) || !Array.isArray(value.matches) || value.matches.length > 50000 || value.matches.some(id => !validMatchId(id))) return false;
      const nextCareers = Object.create(null), nextInductees = Object.create(null);
      for (let id = 1; id <= 251; id++) {
        const career = parseCareer(value.careers?.[id], id);
        if (career) nextCareers[id] = career;
        const entry = value.hall?.[id];
        if (!isObject(entry) || entry.pokemonId !== id || typeof entry.inductedAt !== 'string' || entry.inductedAt.length > 40 || !Number.isFinite(Date.parse(entry.inductedAt))) continue;
        const snapshot = parseCareer(entry.career, id);
        if (!snapshot) continue;
        nextInductees[id] = freezeInductee({ pokemonId: id, inductedAt: new Date(entry.inductedAt).toISOString(), career: snapshot });
        // The induction snapshot is authoritative while a Pokémon is retired.
        nextCareers[id] = cloneCareer(snapshot);
      }
      careers = nextCareers; inductees = nextInductees; matches = new Set(value.matches); return true;
    } catch { saved = false; return false; }
  }

  function save() {
    try {
      const raw = JSON.stringify({ v: 1, careers, hall: inductees, matches: [...matches] });
      if (raw.length > maxStoredChars || matches.size > 50000) { saved = false; return false; }
      window.localStorage.setItem(storageKey, raw);
      saved = true; return true;
    } catch { saved = false; return false; }
  }

  function requireId(id) {
    if (!validId(id)) throw new RangeError('Choose a Pokémon from the first two generations.');
  }

  function validateMatch(result) {
    if (!isObject(result) || !validMatchId(result.matchId) || !Array.isArray(result.teams) || result.teams.length !== 2 || ![null, 0, 1].includes(result.winnerIndex)) throw new Error('The career ledger needs a complete match result.');
    const used = new Set();
    const players = result.teams.flatMap((team, teamIndex) => {
      if (!isObject(team) || !counter(team.score) || !Array.isArray(team.players) || team.players.length !== 22) throw new Error('The career ledger needs all 22 players on each team.');
      const sides = { offense: 0, defense: 0 };
      const rows = team.players.map(player => {
        if (!isObject(player) || !validId(player.pokemonId) || used.has(player.pokemonId) || !roles.includes(player.role) || !['offense', 'defense'].includes(player.side) || offensiveRoles.has(player.role) !== (player.side === 'offense') || !isObject(player.stats)) throw new Error('The match contains an invalid or duplicate player.');
        used.add(player.pokemonId); sides[player.side]++;
        const stats = {};
        for (const key of statKeys) {
          const value = player.stats[key] ?? 0;
          if (!amount(value, key)) throw new Error('The match contains invalid player statistics.');
          stats[key] = value;
        }
        return { pokemonId: player.pokemonId, role: player.role, teamIndex, stats };
      });
      if (sides.offense !== 11 || sides.defense !== 11) throw new Error('The match needs 11 offensive and 11 defensive players on each team.');
      return rows;
    });
    const expectedWinner = result.teams[0].score === result.teams[1].score ? null : result.teams[0].score > result.teams[1].score ? 0 : 1;
    if (result.winnerIndex !== expectedWinner) throw new Error('The match winner does not agree with the final score.');
    for (const key of ['offensiveMVP', 'defensiveMVP']) {
      if (result[key] == null) continue;
      const award = result[key], player = players.find(p => p.pokemonId === award.pokemonId);
      if (!isObject(award) || !validId(award.pokemonId) || !player || (award.teamIndex != null && award.teamIndex !== player.teamIndex) || (award.role != null && award.role !== player.role) || offensiveRoles.has(player.role) !== (key === 'offensiveMVP')) throw new Error('The match MVP needs to match a player, team and side from the game.');
    }
    return players;
  }

  function recordMatch(result) {
    const players = validateMatch(result);
    refresh();
    if (matches.has(result.matchId)) return false;
    const updates = [];
    for (const player of players) {
      if (inductees[player.pokemonId]) continue;
      const career = cloneCareer(careers[player.pokemonId] || blank(player.pokemonId));
      career.games++;
      career[result.winnerIndex === null ? 'draws' : result.winnerIndex === player.teamIndex ? 'wins' : 'losses']++;
      if (result.offensiveMVP?.pokemonId === player.pokemonId) career.offensiveMVPs++;
      if (result.defensiveMVP?.pokemonId === player.pokemonId) career.defensiveMVPs++;
      career.appearancesByRole[player.role] = (career.appearancesByRole[player.role] || 0) + 1;
      for (const key of statKeys) career.stats[key] += player.stats[key];
      if (!counter(career.games) || statKeys.some(key => !amount(career.stats[key], key))) throw new Error('The career statistics exceed the supported total.');
      updates.push(career);
    }
    for (const career of updates) careers[career.pokemonId] = career;
    matches.add(result.matchId); save(); return true;
  }

  function get(id) { requireId(id); return cloneCareer(careers[id] || blank(id)); }
  function list() { return Object.values(careers).filter(career => career.games > 0).map(cloneCareer).sort((a, b) => b.games - a.games || a.pokemonId - b.pokemonId); }
  function isInducted(id) { requireId(id); return Boolean(inductees[id]); }
  function hall() { return Object.values(inductees).map(cloneInductee).sort((a, b) => a.inductedAt.localeCompare(b.inductedAt) || a.pokemonId - b.pokemonId); }

  function induct(id) {
    requireId(id);
    refresh();
    if (inductees[id]) return cloneInductee(inductees[id]);
    const career = careers[id] || blank(id);
    careers[id] = career;
    inductees[id] = freezeInductee({ pokemonId: id, inductedAt: new Date().toISOString(), career: cloneCareer(career) });
    save(); return cloneInductee(inductees[id]);
  }

  function remove(id) {
    requireId(id);
    refresh();
    if (!inductees[id]) return false;
    delete inductees[id]; save(); return true;
  }

  function refresh() { return saved ? load() : false; }

  load(); save();
  window.DraftCareers = Object.freeze({ recordMatch, get, list, isInducted, induct, remove, hall, refresh, persisted: () => saved });
})();
