/* A small, immutable auction ledger. The board owns position assignment. */
(() => {
  'use strict';

  const rosterSize = 23, startingBudget = 1000;
  const modes = new Set(['gen1', 'gen2', 'gen3', 'both']);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validTeamCount = value => Number.isInteger(value) && value >= 2 && value <= 4;
  const teamIndexes = count => Array.from({ length: count }, (_, index) => index);
  const dollars = value => Number.isInteger(value) && value >= 0 && value <= startingBudget;
  const eligible = (id, mode) => Number.isInteger(id) && id >= 1 && id <= 386 &&
    (mode === 'both' || (mode === 'gen1' ? id <= 151 : mode === 'gen2' ? id >= 152 && id <= 251 : mode === 'gen3' && id >= 252));

  function draw(random) {
    if (typeof random !== 'function') throw new Error('The auction needs a random number generator.');
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('The random number must be between 0 and 1.');
    return value;
  }

  // Replay every award rather than trusting totals saved by the browser.
  // A team reaching its roster limit leaves the bidding pool for later lots.
  function validate(value) {
    const teamCount = object(value) && value.teamCount === undefined ? 2 : value?.teamCount;
    const size = object(value) && value.rosterSize === undefined ? 22 : value?.rosterSize;
    const lotCount = validTeamCount(teamCount) && [22, rosterSize].includes(size) ? teamCount * size : 0;
    const skipped = object(value) && value.skipped === undefined ? [] : value?.skipped;
    if (!object(value) || value.v !== 1 || !modes.has(value.mode) || !validTeamCount(teamCount) || ![22, rosterSize].includes(size) ||
        !Array.isArray(value.lots) || value.lots.length !== lotCount ||
        new Set(value.lots).size !== lotCount || !Array.from(value.lots).every(id => eligible(id, value.mode)) ||
        !Array.isArray(skipped) || skipped.length > 386 || new Set(skipped).size !== skipped.length ||
        !Array.from(skipped).every(id => eligible(id, value.mode) && !value.lots.includes(id)) ||
        !Array.isArray(value.awards) || value.awards.length > lotCount ||
        !Number.isInteger(value.placed) || value.placed < 0 || value.placed > lotCount ||
        (value.awards.length !== value.placed && value.awards.length !== value.placed + 1)) return null;

    const teams = teamIndexes(teamCount);
    const budgets = teams.map(() => startingBudget), counts = teams.map(() => 0), awards = [];
    for (let index = 0; index < value.awards.length; index++) {
      const award = value.awards[index];
      if (!object(award) || award.pokemonId !== value.lots[index] ||
          !Number.isInteger(award.team) || award.team < 0 || award.team >= teamCount || !dollars(award.amount) ||
          !Array.isArray(award.bids) || award.bids.length !== teamCount ||
          !Array.from(award.bids).every(dollars) || typeof award.tied !== 'boolean') return null;
      const open = teams.filter(team => counts[team] < size);
      if (!open.includes(award.team)) return null;
      for (const team of teams) {
        if (award.bids[team] > budgets[team] || (counts[team] === size && award.bids[team] !== 0)) return null;
      }
      const maximum = Math.max(...open.map(team => award.bids[team]));
      const contenders = open.filter(team => award.bids[team] === maximum);
      if (!contenders.includes(award.team) || award.amount !== maximum || award.tied !== (contenders.length > 1)) return null;
      budgets[award.team] -= award.amount;
      counts[award.team]++;
      awards.push({ pokemonId: award.pokemonId, team: award.team, amount: award.amount,
        bids: award.bids.slice(), tied: award.tied });
    }
    return { v: 1, mode: value.mode, teamCount, rosterSize: size, lots: value.lots.slice(), skipped: skipped.slice(), awards, placed: value.placed };
  }

  function requireSession(value) {
    const session = validate(value);
    if (!session) throw new Error('This auction could not be restored. Start a new auction.');
    return session;
  }

  function create(ids, { mode = 'both', teamCount = 2, random = Math.random } = {}) {
    if (!modes.has(mode)) throw new Error('Choose Gen 1, Gen 2, Gen 3, or All before starting the auction.');
    if (!validTeamCount(teamCount)) throw new Error('Choose between 2 and 4 teams for this auction.');
    if (!Array.isArray(ids) || !Array.from(ids).every(id => eligible(id, mode)) || new Set(ids).size !== ids.length) {
      throw new Error('The auction pool must contain unique Pokémon from the selected generation.');
    }
    const lotCount = teamCount * rosterSize;
    if (ids.length < lotCount) throw new Error(`The auction needs at least ${lotCount} available Pokémon.`);
    const shuffled = ids.slice();
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(draw(random) * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return { v: 1, mode, teamCount, rosterSize, lots: shuffled.slice(0, lotCount), skipped: [], awards: [], placed: 0 };
  }

  function phase(value) {
    const session = requireSession(value);
    return session.placed === session.lots.length ? 'complete' :
      session.awards.length > session.placed ? 'placement' : 'bidding';
  }

  function current(value) {
    const session = requireSession(value);
    return session.placed === session.lots.length ? null : session.lots[session.placed];
  }

  function budgets(value) {
    const session = requireSession(value);
    return session.awards.reduce((remaining, award) => {
      remaining[award.team] -= award.amount; return remaining;
    }, Array(session.teamCount).fill(startingBudget));
  }

  function counts(value) {
    const session = requireSession(value);
    return session.awards.reduce((totals, award) => {
      totals[award.team]++; return totals;
    }, Array(session.teamCount).fill(0));
  }

  function owned(value, team) {
    const session = requireSession(value);
    if (!Number.isInteger(team) || team < 0 || team >= session.teamCount) throw new Error(`Choose a team from 1 to ${session.teamCount}.`);
    return session.awards.filter(award => award.team === team).map(award => award.pokemonId);
  }

  function bid(value, submitted, random = Math.random) {
    const session = requireSession(value);
    if (phase(session) !== 'bidding') throw new Error('Assign the current Pokémon to a position before bidding again.');
    if (!Array.isArray(submitted) || submitted.length !== session.teamCount || !Array.from(submitted).every(dollars)) {
      throw new Error('Enter a whole-dollar bid of $0 or more for each team.');
    }
    const remaining = budgets(session), totals = counts(session);
    const teams = teamIndexes(session.teamCount);
    for (const team of teams) {
      if (submitted[team] > remaining[team]) throw new Error(`Team ${team + 1} cannot bid more than its remaining budget.`);
      if (totals[team] === session.rosterSize && submitted[team] !== 0) throw new Error(`Team ${team + 1} already has ${session.rosterSize} Pokémon.`);
    }
    const open = teams.filter(team => totals[team] < session.rosterSize);
    const amount = Math.max(...open.map(team => submitted[team]));
    const contenders = open.filter(team => submitted[team] === amount);
    const team = contenders.length === 1 ? contenders[0] : contenders[Math.floor(draw(random) * contenders.length)];
    const award = { pokemonId: session.lots[session.placed], team, amount,
      bids: submitted.slice(), tied: contenders.length > 1 };
    session.awards.push({ ...award, bids: award.bids.slice() });
    return { session, award };
  }

  function place(value) {
    const session = requireSession(value);
    if (phase(session) !== 'placement') throw new Error('There is no purchased Pokémon waiting for a position.');
    session.placed++;
    return session;
  }

  function skip(value, ids, random = Math.random) {
    const session = requireSession(value);
    if (phase(session) !== 'bidding') throw new Error('Only the Pokémon currently up for bidding can be skipped.');
    if (!Array.isArray(ids) || !Array.from(ids).every(id => eligible(id, session.mode)) || new Set(ids).size !== ids.length) {
      throw new Error('The replacement pool must contain unique Pokémon from the selected generation.');
    }
    const unavailable = new Set([...session.lots, ...session.skipped]);
    const candidates = ids.filter(id => !unavailable.has(id));
    if (!candidates.length) throw new Error('No replacement Pokémon remain in this pool. Bid on this Pokémon to finish the auction.');
    const replacement = candidates[Math.floor(draw(random) * candidates.length)];
    session.skipped.push(session.lots[session.placed]);
    session.lots[session.placed] = replacement;
    return session;
  }

  window.DraftAuction = Object.freeze({ rosterSize, create, validate, current, bid, place, phase, budgets, counts, owned, skip });
})();
