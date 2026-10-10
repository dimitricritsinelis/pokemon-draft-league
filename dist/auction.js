/* A small, immutable auction ledger. The board owns position assignment. */
(() => {
  'use strict';

  const rosterSize = 22, lotCount = 44, startingBudget = 1000;
  const modes = new Set(['gen1', 'gen2', 'both']);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const dollars = value => Number.isInteger(value) && value >= 0 && value <= startingBudget;
  const eligible = (id, mode) => Number.isInteger(id) && id >= 1 && id <= 251 &&
    (mode === 'both' || (mode === 'gen1' ? id <= 151 : id >= 152));

  function draw(random) {
    if (typeof random !== 'function') throw new Error('The auction needs a random number generator.');
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('The random number must be between 0 and 1.');
    return value;
  }

  // Replay every award rather than trusting totals saved by the browser.
  // A team reaching 22 players leaves the bidding pool for later lots.
  function validate(value) {
    const skipped = object(value) && value.skipped === undefined ? [] : value?.skipped;
    if (!object(value) || value.v !== 1 || !modes.has(value.mode) ||
        !Array.isArray(value.lots) || value.lots.length !== lotCount ||
        new Set(value.lots).size !== lotCount || !Array.from(value.lots).every(id => eligible(id, value.mode)) ||
        !Array.isArray(skipped) || skipped.length > 251 || new Set(skipped).size !== skipped.length ||
        !Array.from(skipped).every(id => eligible(id, value.mode) && !value.lots.includes(id)) ||
        !Array.isArray(value.awards) || value.awards.length > lotCount ||
        !Number.isInteger(value.placed) || value.placed < 0 || value.placed > lotCount ||
        (value.awards.length !== value.placed && value.awards.length !== value.placed + 1)) return null;

    const budgets = [startingBudget, startingBudget], counts = [0, 0], awards = [];
    for (let index = 0; index < value.awards.length; index++) {
      const award = value.awards[index];
      if (!object(award) || award.pokemonId !== value.lots[index] ||
          (award.team !== 0 && award.team !== 1) || !dollars(award.amount) ||
          !Array.isArray(award.bids) || award.bids.length !== 2 ||
          !Array.from(award.bids).every(dollars) || typeof award.tied !== 'boolean') return null;
      const open = [0, 1].filter(team => counts[team] < rosterSize);
      if (!open.includes(award.team)) return null;
      for (const team of [0, 1]) {
        if (award.bids[team] > budgets[team] || (counts[team] === rosterSize && award.bids[team] !== 0)) return null;
      }
      const maximum = Math.max(...open.map(team => award.bids[team]));
      const contenders = open.filter(team => award.bids[team] === maximum);
      if (!contenders.includes(award.team) || award.amount !== maximum || award.tied !== (contenders.length > 1)) return null;
      budgets[award.team] -= award.amount;
      counts[award.team]++;
      awards.push({ pokemonId: award.pokemonId, team: award.team, amount: award.amount,
        bids: award.bids.slice(), tied: award.tied });
    }
    return { v: 1, mode: value.mode, lots: value.lots.slice(), skipped: skipped.slice(), awards, placed: value.placed };
  }

  function requireSession(value) {
    const session = validate(value);
    if (!session) throw new Error('This auction could not be restored. Start a new auction.');
    return session;
  }

  function create(ids, { mode = 'both', random = Math.random } = {}) {
    if (!modes.has(mode)) throw new Error('Choose Gen 1, Gen 2, or both before starting the auction.');
    if (!Array.isArray(ids) || !Array.from(ids).every(id => eligible(id, mode)) || new Set(ids).size !== ids.length) {
      throw new Error('The auction pool must contain unique Pokémon from the selected generation.');
    }
    if (ids.length < lotCount) throw new Error('The auction needs at least 44 available Pokémon.');
    const shuffled = ids.slice();
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(draw(random) * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return { v: 1, mode, lots: shuffled.slice(0, lotCount), skipped: [], awards: [], placed: 0 };
  }

  function phase(value) {
    const session = requireSession(value);
    return session.placed === lotCount ? 'complete' :
      session.awards.length > session.placed ? 'placement' : 'bidding';
  }

  function current(value) {
    const session = requireSession(value);
    return session.placed === lotCount ? null : session.lots[session.placed];
  }

  function budgets(value) {
    return requireSession(value).awards.reduce((remaining, award) => {
      remaining[award.team] -= award.amount; return remaining;
    }, [startingBudget, startingBudget]);
  }

  function counts(value) {
    return requireSession(value).awards.reduce((totals, award) => {
      totals[award.team]++; return totals;
    }, [0, 0]);
  }

  function owned(value, team) {
    if (team !== 0 && team !== 1) throw new Error('Choose one of the two teams.');
    return requireSession(value).awards.filter(award => award.team === team).map(award => award.pokemonId);
  }

  function bid(value, submitted, random = Math.random) {
    const session = requireSession(value);
    if (phase(session) !== 'bidding') throw new Error('Assign the current Pokémon to a position before bidding again.');
    if (!Array.isArray(submitted) || submitted.length !== 2 || !Array.from(submitted).every(dollars)) {
      throw new Error('Enter a whole-dollar bid of $0 or more for each team.');
    }
    const remaining = budgets(session), totals = counts(session);
    for (const team of [0, 1]) {
      if (submitted[team] > remaining[team]) throw new Error(`Team ${team + 1} cannot bid more than its remaining budget.`);
      if (totals[team] === rosterSize && submitted[team] !== 0) throw new Error(`Team ${team + 1} already has 22 Pokémon.`);
    }
    const open = [0, 1].filter(team => totals[team] < rosterSize);
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

  window.DraftAuction = Object.freeze({ create, validate, current, bid, place, phase, budgets, counts, owned, skip });
})();
