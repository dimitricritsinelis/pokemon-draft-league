(() => {
  'use strict';
  const offenseRoles = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'];
  const defenseRoles = ['FS', 'SS', 'CB', 'DE', 'NT', 'DT', 'ILB', 'OLB', 'MLB', 'WLB', 'SLB', 'LB', 'NB', 'DB'];
  const lineRoles = ['LT', 'LG', 'C', 'RG', 'RT'];
  const frontRoles = ['DE', 'NT', 'DT'];
  const backRoles = ['FS', 'SS', 'CB', 'NB', 'DB'];
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

  function validate(team, used) {
    if (!team || !Array.isArray(team.positions) || team.positions.length !== 22) throw new Error('Fill all 22 positions on both teams before simulating.');
    const keys = new Set(), counts = { offense: 0, defense: 0 };
    const positions = team.positions.map(slot => {
      const id = slot?.pokemonId ?? slot?.pokemon?.id;
      if (!Number.isInteger(id) || id < 1 || id > 251) throw new Error('Every position needs a Pokémon before simulating.');
      if (used.has(id)) throw new Error('A Pokémon can play for only one position across the two teams.');
      if (!slot.key || keys.has(slot.key)) throw new Error('Each position must be unique.');
      const roles = slot.side === 'offense' ? offenseRoles : slot.side === 'defense' ? defenseRoles : [];
      if (!roles.includes(slot.role)) throw new Error('The lineup contains an unsupported football position.');
      const rating = window.DraftRatings.rate(id, slot.role);
      if (!Number.isFinite(rating) || rating < 0 || rating > 100) throw new Error('A player rating could not be calculated.');
      const pokemon = (window.POKEMON || []).find(p => p.id === id) || slot.pokemon;
      keys.add(slot.key); used.add(id); counts[slot.side]++;
      return { id, name: pokemon?.name || `Pokémon #${id}`, role: slot.role, side: slot.side, rating };
    });
    if (counts.offense !== 11 || counts.defense !== 11 || positions.filter(p => p.role === 'QB').length !== 1 || positions.filter(p => p.role === 'HB').length !== 1 || lineRoles.some(role => positions.filter(p => p.role === role).length !== 1)) throw new Error('Each team needs a full offensive and defensive formation.');
    return { name: String(team.name || 'Team').slice(0, 40), positions };
  }

  function prepare(team) {
    const players = team.positions;
    const select = roles => players.filter(p => roles.includes(p.role));
    const average = (list, fallback = 45) => list.length ? list.reduce((sum, p) => sum + p.rating, 0) / list.length : fallback;
    const qb = select(['QB'])[0], hb = select(['HB'])[0], fb = select(['FB']);
    const receivers = select(['WR', 'TE', 'HB', 'FB']), line = select(lineRoles);
    const defense = players.filter(p => p.side === 'defense'), front = select(frontRoles);
    const coverage = select(backRoles), linebackers = defense.filter(p => !frontRoles.includes(p.role) && !backRoles.includes(p.role));
    const receiving = average(select(['WR', 'TE'])), protection = average(line);
    const passRush = .75 * average(front) + .25 * average(linebackers);
    const passDefense = .75 * average(coverage) + .25 * average(linebackers);
    const runDefense = .65 * average(front) + .30 * average(linebackers) + .05 * average(coverage);
    const passingStrength = .55 * qb.rating + .27 * receiving + .18 * protection;
    const rushingStrength = .53 * hb.rating + .35 * protection + .12 * average(fb, protection);
    const passingShare = clamp(.49 + .055 * select(['WR']).length - .045 * fb.length, .45, .72);
    const identity = p => ({ pokemonId: p.id, name: p.name, role: p.role });
    const result = {
      name: team.name, score: 0, quarters: [0, 0, 0, 0], fieldGoals: 0, turnovers: 0, fumblesLost: 0,
      passing: { ...identity(qb), completions: 0, attempts: 0, yards: 0, touchdowns: 0, interceptions: 0 },
      rushing: select(['HB', 'FB', 'QB']).map(p => ({ ...identity(p), carries: 0, yards: 0, touchdowns: 0 })),
      receiving: receivers.map(p => ({ ...identity(p), receptions: 0, yards: 0, touchdowns: 0 })),
      defense: defense.map(p => ({ ...identity(p), tackles: 0, sacks: 0, interceptions: 0 }))
    };
    return { qb, hb, fb, receivers, defense, protection, passRush, passDefense, runDefense, passingStrength, rushingStrength, passingShare, result };
  }

  function simulate(teamA, teamB, options = {}) {
    if (!window.DraftRatings?.rate) throw new Error('Player ratings are unavailable. Please reload the game.');
    const used = new Set(), teams = [prepare(validate(teamA, used)), prepare(validate(teamB, used))];
    const source = options.random || Math.random;
    const random = () => {
      const value = source();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('The random generator must return a value from 0 up to 1.');
      return value;
    };
    const integer = (low, high) => low + Math.floor(random() * (high - low + 1));
    const choose = (list, weight) => {
      let remaining = random() * list.reduce((sum, player) => sum + weight(player), 0);
      return list.find(player => (remaining -= weight(player)) <= 0) || list[list.length - 1];
    };
    const stat = (list, player) => list.find(p => p.pokemonId === player.id);
    const tackle = defending => {
      const player = choose(defending.defense, p => (backRoles.includes(p.role) ? .65 : frontRoles.includes(p.role) ? .9 : 1.4) * (20 + p.rating));
      stat(defending.result.defense, player).tackles++;
    };
    const yardsPerPlay = (total, count) => {
      const weights = Array.from({ length: count }, () => .4 + random()), sum = weights.reduce((a, b) => a + b, 0);
      let previous = 0, running = 0;
      return weights.map(weight => { running += weight; const next = Math.round(total * running / sum), yards = next - previous; previous = next; return yards; });
    };

    function drive(attacking, defending, quarter) {
      const result = attacking.result;
      const passEdge = attacking.passingStrength - (.72 * defending.passDefense + .28 * defending.passRush);
      const runEdge = attacking.rushingStrength - defending.runDefense;
      const edge = attacking.passingShare * passEdge + (1 - attacking.passingShare) * runEdge;
      const quality = attacking.passingShare * attacking.passingStrength + (1 - attacking.passingShare) * attacking.rushingStrength;
      const turnoverChance = clamp(.11 - .0006 * edge + .0008 * (55 - attacking.qb.rating), .04, .25);
      const touchdownChance = clamp(.215 + .0048 * edge + .001 * (quality - 55), .035, .59);
      const fieldGoalChance = clamp(.19 + .0007 * edge, .09, .25);
      const roll = random();
      const turnover = roll < turnoverChance, touchdown = !turnover && roll < turnoverChance + touchdownChance;
      const fieldGoal = !turnover && !touchdown && roll < turnoverChance + touchdownChance + fieldGoalChance;
      const plays = integer(4, 7), passingPlays = clamp(Math.round(plays * attacking.passingShare), 2, plays - 2);
      const sack = random() < clamp(.14 + .003 * (defending.passRush - attacking.protection) + .0005 * (55 - attacking.qb.rating), .03, .40);
      const attempts = passingPlays - Number(sack), carries = plays - passingPlays;
      const interception = turnover && random() < .72;
      const completionChance = clamp(.35 + .0042 * attacking.qb.rating + .002 * passEdge, .22, .83);
      let completions = 0;
      for (let i = 0; i < attempts - Number(interception); i++) if (random() < completionChance) completions++;
      if (touchdown && !completions && random() < attacking.passingShare) completions = 1;
      result.passing.attempts += attempts; result.passing.completions += completions;
      if (turnover) { result.turnovers++; if (interception) result.passing.interceptions++; else result.fumblesLost++; }
      if (interception) {
        const player = choose(defending.defense, p => (backRoles.includes(p.role) ? 3 : frontRoles.includes(p.role) ? .08 : .7) * (15 + p.rating));
        stat(defending.result.defense, player).interceptions++;
      }
      if (sack) {
        const player = choose(defending.defense, p => (frontRoles.includes(p.role) ? 3 : backRoles.includes(p.role) ? .08 : .7) * (15 + p.rating));
        const defender = stat(defending.result.defense, player); defender.sacks++; defender.tackles++;
      }
      const totalYards = touchdown ? integer(50, 80) : fieldGoal ? integer(25, 50) : integer(0, 30);
      const passingYards = completions ? Math.round(totalYards * completions * 12 / (completions * 12 + carries * 4)) : 0;
      const rushingYards = totalYards - passingYards;
      const catches = yardsPerPlay(passingYards, completions).map(yards => {
        const player = choose(attacking.receivers, p => (p.role === 'WR' ? 1.4 : p.role === 'TE' ? 1 : p.role === 'HB' ? .6 : .3) * (20 + p.rating));
        const receiver = stat(result.receiving, player); receiver.receptions++; receiver.yards += yards; return receiver;
      });
      result.passing.yards += passingYards;
      const runs = yardsPerPlay(rushingYards, carries).map(yards => {
        const player = choose([attacking.hb, ...attacking.fb, attacking.qb], p => p.role === 'HB' ? 8 : p.role === 'FB' ? 1.5 : .8);
        const runner = stat(result.rushing, player); runner.carries++; runner.yards += yards; return runner;
      });
      if (touchdown) {
        if (catches.length && random() < attacking.passingShare + .12) { result.passing.touchdowns++; catches[integer(0, catches.length - 1)].touchdowns++; }
        else runs[integer(0, runs.length - 1)].touchdowns++;
      }
      for (let i = 0; i < completions + carries - Number(touchdown); i++) tackle(defending);
      const points = touchdown ? 7 : fieldGoal ? 3 : 0;
      if (fieldGoal) result.fieldGoals++;
      result.score += points; result.quarters[quarter] += points;
    }
    const first = integer(0, 1);
    for (let quarter = 0; quarter < 4; quarter++) {
      // Three possessions apiece per quarter: a full game, without a play-by-play UI.
      for (let possession = 0; possession < 6; possession++) { const i = (first + possession + Math.floor(quarter / 2)) % 2; drive(teams[i], teams[1 - i], quarter); }
    }
    const results = teams.map(team => team.result), winnerIndex = results[0].score === results[1].score ? null : results[0].score > results[1].score ? 0 : 1;
    return {
      teams: results, winner: winnerIndex === null ? null : results[winnerIndex].name, winnerIndex,
      summary: winnerIndex === null ? `The game finishes tied at ${results[0].score}–${results[1].score} after four quarters.` : `${results[winnerIndex].name} wins ${results[winnerIndex].score}–${results[1 - winnerIndex].score}.`,
      quartersPlayed: 4
    };
  }
  window.DraftMatch = Object.freeze({ simulate });
})();
