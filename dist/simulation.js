(() => {
  'use strict';
  const offenseRoles = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'];
  const defenseRoles = ['FS', 'SS', 'CB', 'DE', 'NT', 'DT', 'ILB', 'OLB', 'MLB', 'WLB', 'SLB', 'LB', 'NB', 'DB'];
  const lineRoles = ['LT', 'LG', 'C', 'RG', 'RT'];
  const frontRoles = ['DE', 'NT', 'DT'];
  const secondaryRoles = ['FS', 'SS', 'CB', 'NB', 'DB'];
  const statKeys = Object.freeze([
    'passingAttempts', 'passingCompletions', 'passingYards', 'passingTD', 'interceptionsThrown',
    'carries', 'rushingYards', 'rushingTD', 'targets', 'receptions', 'receivingYards', 'receivingTD',
    'tackles', 'sacks', 'sackYards', 'sackYardsLost', 'interceptions', 'passesDefended', 'forcedFumbles', 'fumblesLost', 'fumbleRecoveries',
    'passBlockSnaps', 'runBlockSnaps', 'blocks', 'pressuresAllowed', 'sacksAllowed', 'pancakes', 'pressures',
    'offensiveSnaps', 'defensiveSnaps',
    'fieldGoalAttempts', 'fieldGoalsMade', 'longestFieldGoal', 'extraPointAttempts', 'extraPointsMade', 'kickingPoints', 'specialTeamsSnaps'
  ]);
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const mean = (list, fallback = 45) => list.length ? list.reduce((sum, p) => sum + p.rating, 0) / list.length : fallback;
  let sequence = 0;

  function validate(team, used) {
    if (!team || !Array.isArray(team.positions) || team.positions.length !== 23) throw new Error('Fill all 23 positions, including a kicker, on both teams before simulating.');
    const keys = new Set(), counts = { offense: 0, defense: 0, special: 0 };
    const players = team.positions.map(slot => {
      const id = slot?.pokemonId ?? slot?.pokemon?.id;
      if (!Number.isInteger(id) || id < 1 || id > 386) throw new Error('Every position needs a Pokémon before simulating.');
      if (used.has(id)) throw new Error('A Pokémon can play for only one position across the two teams.');
      if (!slot.key || keys.has(slot.key)) throw new Error('Each position must be unique.');
      const roles = slot.side === 'offense' ? offenseRoles : slot.side === 'defense' ? defenseRoles : slot.side === 'special' ? ['K'] : [];
      if (!roles.includes(slot.role)) throw new Error('The lineup contains an unsupported football position.');
      const rating = window.DraftRatings.rate(id, slot.role);
      if (!Number.isFinite(rating) || rating < 0 || rating > 100) throw new Error('A player rating could not be calculated.');
      const pokemon = (window.POKEMON || []).find(p => p.id === id) || slot.pokemon;
      const rawFactor = window.DraftRatings.factor?.(id, slot.role) ?? .5;
      if (!Number.isFinite(rawFactor)) throw new Error('A player matchup factor could not be calculated.');
      keys.add(slot.key); used.add(id); counts[slot.side]++;
      const record = { pokemonId: id, name: pokemon?.name || `Pokémon #${id}`, role: slot.role, side: slot.side, stats: Object.fromEntries(statKeys.map(key => [key, 0])) };
      return { id, role: slot.role, side: slot.side, name: record.name, rating, catchRating: slot.side === 'defense' ? window.DraftRatings.rate(id, 'WR') : rating, factor: clamp(rawFactor, 0, 1), record, stats: record.stats };
    });
    if (counts.offense !== 11 || counts.defense !== 11 || counts.special !== 1 || players.filter(p => p.role === 'K').length !== 1 || players.filter(p => p.role === 'QB').length !== 1 || players.filter(p => p.role === 'HB').length !== 1 || lineRoles.some(role => players.filter(p => p.role === role).length !== 1)) throw new Error('Each team needs 11 offensive players, 11 defensive players and a dedicated kicker.');
    const offense = players.filter(p => p.side === 'offense'), defense = players.filter(p => p.side === 'defense');
    const front = defense.filter(p => frontRoles.includes(p.role)), secondary = defense.filter(p => secondaryRoles.includes(p.role));
    if (!front.length || !secondary.length) throw new Error('Each defense needs a defensive front and coverage players.');
    return {
      players, offense, defense, front, secondary, kicker: players.find(p => p.role === 'K'),
      linebackers: defense.filter(p => !frontRoles.includes(p.role) && !secondaryRoles.includes(p.role)),
      line: lineRoles.map(role => offense.find(p => p.role === role)), qb: offense.find(p => p.role === 'QB'),
      hb: offense.find(p => p.role === 'HB'), fb: offense.filter(p => p.role === 'FB'),
      receivers: offense.filter(p => ['WR', 'TE', 'HB', 'FB'].includes(p.role)),
      result: { name: String(team.name || 'Team').slice(0, 40), score: 0, quarters: [0, 0, 0, 0], fieldGoals: 0, fieldGoalAttempts: 0, extraPoints: 0, extraPointAttempts: 0, turnovers: 0, fumblesLost: 0, players: players.map(p => p.record), biggestPlay: null },
      firstDowns: 0, biggestWeight: -Infinity
    };
  }

  function simulate(teamA, teamB, options = {}) {
    if (!window.DraftRatings?.rate) throw new Error('Player ratings are unavailable. Please reload the game.');
    const used = new Set(), teams = [validate(teamA, used), validate(teamB, used)];
    const source = options.random || Math.random;
    const random = () => {
      const value = source();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('The random generator must return a value from 0 up to 1.');
      return value;
    };
    const integer = (low, high) => low + Math.floor(random() * (high - low + 1));
    const choose = (list, weight = () => 1) => {
      let remaining = random() * list.reduce((sum, player) => sum + Math.max(.001, weight(player)), 0);
      return list.find(player => (remaining -= Math.max(.001, weight(player))) <= 0) || list[list.length - 1];
    };
    // Lore provides an occasional, bounded advantage. It can never rescue a poor positional grade.
    const strength = player => player.rating + (random() < .11 + .09 * player.factor ? player.factor * 8 : 0);
    const roleWeight = p => p.role === 'WR' ? 1.6 : p.role === 'TE' ? 1.15 : p.role === 'HB' ? .65 : .32;
    const linebackerMean = team => mean(team.linebackers, mean(team.front));
    const safetyMean = team => mean(team.secondary.filter(p => ['FS', 'SS'].includes(p.role)), mean(team.secondary));
    const coverageStrength = team => .65 * mean(team.secondary) + .35 * linebackerMean(team) + 2.5 * (team.secondary.length - 4);
    const runDefense = team => .5 * mean(team.front) + .38 * linebackerMean(team) + .12 * safetyMean(team) + 2 * (team.linebackers.length - 3) + .8 * (team.front.length - 4);
    const passRush = team => .8 * mean(team.front) + .2 * linebackerMean(team) + 1.5 * (team.front.length - 3);
    const note = (team, player, quarter, type, text, yards, points, weight) => {
      if (weight <= team.biggestWeight) return;
      team.biggestWeight = weight;
      team.result.biggestPlay = { quarter: quarter + 1, pokemonId: player.id, name: player.name, role: player.role, type, text, yards, points };
    };
    const score = (team, points, quarter) => { team.result.score += points; team.result.quarters[quarter] += points; };
    // A drafted specialist owns every kicking attempt. Grades dominate the
    // make probability; distance, pass protection and a bounded random draw add
    // football uncertainty without inventing points that no player produced.
    const attemptKick = (attacking, defending, quarter, distance, extraPoint = false) => {
      const kicker = attacking.kicker, stats = kicker.stats;
      stats.specialTeamsSnaps++;
      const blockEdge = mean(attacking.line) - mean(defending.front);
      const chance = extraPoint ? clamp(.08 + .0095 * kicker.rating + .00015 * blockEdge, .04, .997) :
        clamp(.06 + .0095 * kicker.rating - .0015 * Math.max(0, distance - 20) - .00035 * Math.max(0, distance - 35) ** 2 + .00025 * blockEdge, .015, .985);
      stats[extraPoint ? 'extraPointAttempts' : 'fieldGoalAttempts']++;
      attacking.result[extraPoint ? 'extraPointAttempts' : 'fieldGoalAttempts']++;
      const made = random() < chance;
      if (made) {
        stats[extraPoint ? 'extraPointsMade' : 'fieldGoalsMade']++;
        const points = extraPoint ? 1 : 3;
        stats.kickingPoints += points; score(attacking, points, quarter);
        if (extraPoint) attacking.result.extraPoints++;
        else {
          stats.longestFieldGoal = Math.max(stats.longestFieldGoal, distance);
          attacking.result.fieldGoals++;
          const lateLead = quarter === 3 && attacking.result.score > defending.result.score && attacking.result.score - defending.result.score <= 3;
          note(attacking, kicker, quarter, 'field-goal', `${kicker.name} drills a ${distance}-yard field goal${lateLead ? ' to take the fourth-quarter lead' : ''}.`, distance, 3, lateLead ? 165 : 60 + distance * .35);
        }
      } else if (!extraPoint) note(attacking, kicker, quarter, 'missed-field-goal', `${kicker.name} misses a ${distance}-yard field goal attempt.`, distance, 0, 3);
      return made;
    };
    const touchdown = (attacking, defending, quarter) => {
      score(attacking, 6, quarter);
      return 6 + (attemptKick(attacking, defending, quarter, 33, true) ? 1 : 0);
    };
    const snap = (attacking, defending) => {
      attacking.offense.forEach(p => p.stats.offensiveSnaps++);
      defending.defense.forEach(p => p.stats.defensiveSnaps++);
    };
    const frontOpponent = (defending, blocker) => {
      const ends = defending.front.filter(p => p.role === 'DE'), inside = defending.front.filter(p => p.role !== 'DE');
      if (blocker.role === 'LT' || blocker.role === 'RT') return ends[blocker.role === 'LT' ? 0 : ends.length - 1] || defending.front[0];
      return inside[blocker.role === 'RG' ? inside.length - 1 : 0] || defending.front[Math.floor(defending.front.length / 2)];
    };
    const blockPlays = (attacking, defending, kind, failedBlocker, ballCarrier, target) => {
      const helpers = attacking.offense.filter(p => ['TE', 'FB'].includes(p.role) && p !== ballCarrier && p !== target);
      const blockers = [...attacking.line, ...helpers.filter(() => kind === 'run' || random() < .35)];
      for (const p of blockers) {
        p.stats[kind === 'pass' ? 'passBlockSnaps' : 'runBlockSnaps']++;
        const opposing = frontOpponent(defending, p), edge = p.rating - opposing.rating;
        if (p !== failedBlocker && random() < clamp(.69 + .004 * edge, .15, .96)) {
          p.stats.blocks++;
          if (kind === 'run' && random() < clamp(.025 + .001 * edge, .003, .13)) p.stats.pancakes++;
        }
      }
    };
    const tackle = (defending, preferred, preferredShare, quarter, yards) => {
      const defender = preferred && random() < preferredShare ? preferred : choose(defending.defense, p => (secondaryRoles.includes(p.role) ? .7 : frontRoles.includes(p.role) ? .9 : 1.5) * (25 + p.rating));
      defender.stats.tackles++;
      if (yards <= 0) note(defending, defender, quarter, 'stop', `${defender.name} stops the offense for ${yards < 0 ? `a ${-yards}-yard loss` : 'no gain'}.`, yards, 0, 18 - yards);
      return defender;
    };
    const forceFumble = (attacking, defending, carrier, defender, quarter, ball) => {
      carrier.stats.fumblesLost++; defender.stats.forcedFumbles++;
      const recovery = random() < .65 ? defender : choose(defending.defense, p => (frontRoles.includes(p.role) ? 1.3 : 1) * (25 + p.rating));
      recovery.stats.fumbleRecoveries++;
      attacking.result.turnovers++; attacking.result.fumblesLost++;
      note(defending, defender, quarter, 'forced-fumble', `${defender.name} forces ${carrier.name} to fumble; ${recovery.name} recovers for ${defending.result.name}.`, 0, 0, 96 + ball / 10);
      return { turnover: true, ball };
    };
    const receiverCoverage = (defending, receiver, attacking) => {
      let candidates;
      if (receiver.role === 'WR') candidates = defending.secondary.filter(p => ['CB', 'NB', 'DB'].includes(p.role));
      else candidates = [...defending.linebackers, ...defending.secondary.filter(p => p.role === 'SS' || p.role === 'NB')];
      if (!candidates.length) candidates = defending.secondary;
      const routes = attacking.receivers.filter(p => receiver.role === 'WR' ? p.role === 'WR' : p.role !== 'WR');
      const matched = candidates[routes.indexOf(receiver) % candidates.length];
      return random() < .7 ? matched : choose(candidates, p => 20 + p.rating);
    };

    function passingPlay(attacking, defending, quarter, ball) {
      const qb = attacking.qb;
      const receiver = choose(attacking.receivers, p => roleWeight(p) * (.65 + p.rating / 100));
      const coverage = receiverCoverage(defending, receiver, attacking);
      const rushers = [...defending.front, ...defending.linebackers];
      const rusher = choose(rushers, p => (frontRoles.includes(p.role) ? 3 : .5) * (20 + p.rating));
      let blocker;
      if (rusher.role === 'DE') {
        const ends = defending.front.filter(p => p.role === 'DE');
        blocker = attacking.line[ends.indexOf(rusher) === 0 ? 0 : 4];
      } else blocker = choose(attacking.line.slice(1, 4), p => 120 - p.rating);
      const protection = .6 * blocker.rating + .4 * mean(attacking.line);
      const rushStrength = .7 * strength(rusher) + .3 * passRush(defending);
      const pressure = random() < clamp(.24 + .0038 * (rushStrength - protection), .035, .65);
      if (pressure) { rusher.stats.pressures++; blocker.stats.pressuresAllowed++; }
      blockPlays(attacking, defending, 'pass', pressure ? blocker : null, null, receiver);
      const qbStrength = strength(qb), receiverStrength = strength(receiver), defenderStrength = strength(coverage);
      if (pressure && random() < clamp(.19 + .003 * (rushStrength - .55 * protection - .45 * qbStrength), .035, .57)) {
        const loss = Math.min(integer(3, 9), ball - 1);
        rusher.stats.sacks++; rusher.stats.sackYards += loss; rusher.stats.tackles++;
        qb.stats.sackYardsLost += loss; blocker.stats.sacksAllowed++;
        note(defending, rusher, quarter, 'sack', `${rusher.name} beats ${blocker.name} and sacks ${qb.name} for a ${loss}-yard loss.`, -loss, 0, 42 + loss);
        ball -= loss;
        if (random() < clamp(.024 + .0004 * (rusher.rating - qb.rating), .005, .065)) return { yards: -loss, ...forceFumble(attacking, defending, qb, rusher, quarter, ball) };
        return { yards: -loss, ball };
      }
      qb.stats.passingAttempts++; receiver.stats.targets++;
      const zone = .65 * safetyMean(defending) + .35 * coverageStrength(defending);
      const interceptionChance = clamp(.023 + .00055 * (.6 * defenderStrength + .4 * zone - .72 * qbStrength - .28 * receiverStrength) + (pressure ? .018 : 0), .003, .12);
      if (random() < interceptionChance) {
        const interceptor = random() < .7 ? coverage : choose(defending.secondary, p => (20 + p.rating) * clamp((p.catchRating - 5) / 50, .02, 1));
        const interceptionControl = clamp((interceptor.catchRating - 5) / 50, .02, 1);
        if (interceptionControl < 1 && random() >= interceptionControl) {
          interceptor.stats.passesDefended++;
          note(defending, interceptor, quarter, 'pass-breakup', `${interceptor.name} breaks up ${qb.name}'s pass to ${receiver.name}.`, 0, 0, 21);
          return { yards: 0, ball };
        }
        qb.stats.interceptionsThrown++; interceptor.stats.interceptions++; attacking.result.turnovers++;
        const landingBall = clamp(ball + integer(3, 22), 1, 99);
        note(defending, interceptor, quarter, 'interception', `${interceptor.name} intercepts ${qb.name}'s pass intended for ${receiver.name}.`, 0, 0, 95 + landingBall / 10);
        return { yards: 0, ball: landingBall, turnover: true };
      }
      const catchControl = clamp((receiver.rating - 5) / 50, .08, 1);
      const completionChance = catchControl * clamp(.255 + .0055 * qbStrength + .00225 * (receiverStrength - defenderStrength) + .0007 * (mean(attacking.line) - passRush(defending)) + .00075 * (receiverStrength - zone) - (pressure ? .12 : 0), .12, .9);
      if (random() >= completionChance) {
        if (random() < clamp(.33 + .003 * (defenderStrength - receiverStrength), .12, .67)) coverage.stats.passesDefended++;
        note(defending, coverage, quarter, 'coverage', `${coverage.name} shuts down a pass to ${receiver.name}.`, 0, 0, 12);
        note(attacking, qb, quarter, 'attempt', `${qb.name} looks for ${receiver.name} through the defense.`, 0, 0, 0);
        return { yards: 0, ball };
      }
      const edge = receiverStrength - .7 * defenderStrength - .3 * zone;
      let yards = Math.max(1, Math.round(integer(2, 15) + .06 * edge));
      if (random() < clamp(.055 + .0012 * edge + .035 * receiver.factor, .01, .2)) yards += integer(13, 38);
      yards = Math.min(yards, 100 - ball);
      qb.stats.passingCompletions++; qb.stats.passingYards += yards;
      receiver.stats.receptions++; receiver.stats.receivingYards += yards;
      ball += yards;
      if (ball >= 100) {
        qb.stats.passingTD++; receiver.stats.receivingTD++; const points = touchdown(attacking, defending, quarter);
        note(attacking, receiver, quarter, 'passing-touchdown', `${qb.name} finds ${receiver.name} for a ${yards}-yard touchdown.`, yards, points, 110 + yards + (quarter === 3 ? 8 : 0));
        return { yards, ball, touchdown: true };
      }
      note(attacking, receiver, quarter, 'reception', `${receiver.name} hauls in ${qb.name}'s pass for ${yards} yards.`, yards, 0, 10 + yards);
      const tackler = tackle(defending, coverage, .58, quarter, yards);
      if (random() < clamp(.009 + .0003 * (tackler.rating - receiver.rating), .002, .045)) return { yards, ...forceFumble(attacking, defending, receiver, tackler, quarter, ball) };
      return { yards, ball };
    }

    function rushingPlay(attacking, defending, quarter, ball) {
      const runner = choose([attacking.hb, ...attacking.fb, attacking.qb], p => p.role === 'HB' ? 8.5 : p.role === 'FB' ? 1 : .7);
      const lane = integer(0, 2), line = lane === 0 ? attacking.line.slice(0, 3) : lane === 2 ? attacking.line.slice(2) : attacking.line.slice(1, 4);
      const lead = .75 * mean(line) + .25 * mean(attacking.offense.filter(p => ['TE', 'FB'].includes(p.role) && p !== runner), mean(line));
      const runnerStrength = strength(runner);
      const front = choose([...defending.front, ...defending.linebackers], p => (frontRoles.includes(p.role) ? 1 : 1.3) * (25 + p.rating));
      const defenseStrength = .55 * strength(front) + .45 * runDefense(defending);
      const edge = .58 * runnerStrength + .42 * lead - defenseStrength;
      blockPlays(attacking, defending, 'run', null, runner, null);
      let yards = Math.round(-1 + 9 * random() + .075 * edge);
      if (random() < clamp(.025 + .0011 * edge + .022 * runner.factor, .004, .16)) yards += integer(10, 29);
      yards = clamp(yards, -(ball - 1), 100 - ball);
      runner.stats.carries++; runner.stats.rushingYards += yards; ball += yards;
      if (ball >= 100) {
        runner.stats.rushingTD++; const points = touchdown(attacking, defending, quarter);
        note(attacking, runner, quarter, 'rushing-touchdown', `${runner.name} bursts through the defense for a ${yards}-yard rushing touchdown.`, yards, points, 110 + yards + (quarter === 3 ? 8 : 0));
        return { yards, ball, touchdown: true };
      }
      note(attacking, runner, quarter, 'rush', yards > 0 ? `${runner.name} breaks loose for ${yards} rushing yards.` : yards < 0 ? `${runner.name} is stopped for a ${-yards}-yard loss.` : `${runner.name} is held to no gain.`, yards, 0, 10 + yards);
      const tackler = tackle(defending, front, .6, quarter, yards);
      if (random() < clamp(.01 + .00045 * (tackler.rating - runner.rating), .002, .055)) return { yards, ...forceFumble(attacking, defending, runner, tackler, quarter, ball) };
      return { yards, ball };
    }

    function drive(attacking, defending, quarter, start) {
      let ball = start, down = 1, toGo = Math.min(10, 100 - ball);
      const passShare = clamp(.48 + .05 * attacking.receivers.filter(p => p.role === 'WR').length - .035 * attacking.fb.length, .47, .72);
      for (let play = 0; play < 15; play++) {
        if (down === 4) {
          // Goal-line fourth downs add a little drama; the rest follow a simple NFL punt/FG decision.
          const goForIt = ball >= 93 && toGo <= 3 && random() < .58;
          if (!goForIt) break;
        }
        snap(attacking, defending);
        const pass = random() < clamp(passShare + (toGo > 8 && down >= 2 ? .14 : 0) - (ball > 94 ? .12 : 0), .3, .86);
        const event = pass ? passingPlay(attacking, defending, quarter, ball) : rushingPlay(attacking, defending, quarter, ball);
        ball = event.ball;
        if (event.touchdown) { attacking.firstDowns++; return 25; }
        if (event.turnover) return clamp(100 - ball, 5, 85);
        if (event.yards >= toGo) { attacking.firstDowns++; down = 1; toGo = Math.min(10, 100 - ball); }
        else { down++; toGo -= event.yards; }
        if (down > 4) return clamp(100 - ball, 5, 85);
      }
      if (ball >= 62) {
        const distance = 117 - ball;
        if (attemptKick(attacking, defending, quarter, distance)) return 25;
        return clamp(100 - ball, 20, 60);
      }
      const landing = ball + integer(35, 50);
      return landing >= 100 ? 20 : clamp(100 - landing, 5, 60);
    }

    const first = integer(0, 1);
    let nextStart = 25;
    for (let quarter = 0; quarter < 4; quarter++) {
      if (quarter === 2) nextStart = 25;
      for (let possession = 0; possession < 6; possession++) {
        const i = (first + possession + Math.floor(quarter / 2)) % 2;
        nextStart = drive(teams[i], teams[1 - i], quarter, nextStart);
      }
    }
    for (const team of teams) {
      const rows = team.result.players;
      const sums = key => rows.reduce((n, p) => n + p.stats[key], 0);
      team.result.totals = {
        passingYards: sums('passingYards'), netPassingYards: sums('passingYards') - sums('sackYardsLost'),
        rushingYards: sums('rushingYards'), totalYards: sums('passingYards') - sums('sackYardsLost') + sums('rushingYards'),
        plays: team.qb.stats.offensiveSnaps, firstDowns: team.firstDowns, sacksAllowed: sums('sacksAllowed'),
        fieldGoalsMade: sums('fieldGoalsMade'), fieldGoalAttempts: sums('fieldGoalAttempts'), extraPointsMade: sums('extraPointsMade'), extraPointAttempts: sums('extraPointAttempts'), kickingPoints: sums('kickingPoints')
      };
      // These lightweight aliases preserve old callers; the full per-player box score is authoritative.
      const identity = p => ({ pokemonId: p.id, name: p.name, role: p.role });
      team.result.passing = { ...identity(team.qb), completions: team.qb.stats.passingCompletions, attempts: team.qb.stats.passingAttempts, yards: team.qb.stats.passingYards, touchdowns: team.qb.stats.passingTD, interceptions: team.qb.stats.interceptionsThrown };
      team.result.rushing = team.offense.filter(p => ['QB', 'HB', 'FB'].includes(p.role)).map(p => ({ ...identity(p), carries: p.stats.carries, yards: p.stats.rushingYards, touchdowns: p.stats.rushingTD }));
      team.result.receiving = team.receivers.map(p => ({ ...identity(p), receptions: p.stats.receptions, yards: p.stats.receivingYards, touchdowns: p.stats.receivingTD }));
      team.result.kicking = { ...identity(team.kicker), fieldGoalsMade: team.kicker.stats.fieldGoalsMade, fieldGoalAttempts: team.kicker.stats.fieldGoalAttempts, longestFieldGoal: team.kicker.stats.longestFieldGoal, extraPointsMade: team.kicker.stats.extraPointsMade, extraPointAttempts: team.kicker.stats.extraPointAttempts, points: team.kicker.stats.kickingPoints };
      team.result.defense = team.defense.map(p => ({ ...identity(p), tackles: p.stats.tackles, sacks: p.stats.sacks, interceptions: p.stats.interceptions }));
      if (!team.result.biggestPlay) note(team, team.qb, 0, 'drive', `${team.qb.name} leads ${team.result.name}'s offense.`, 0, 0, 0);
    }
    const candidates = side => teams.flatMap((team, teamIndex) => team.players.filter(p => p.side === side).map(p => ({ player: p, teamIndex })));
    const offenseValue = p => p.stats.passingYards / 25 + p.stats.passingTD * 5 - p.stats.interceptionsThrown * 3 + p.stats.rushingYards / 12 + p.stats.rushingTD * 6 + p.stats.receivingYards / 10 + p.stats.receivingTD * 6 + p.stats.blocks * .025 + p.stats.pancakes * .35 - p.stats.fumblesLost * 3;
    const defenseValue = p => p.stats.tackles * .7 + p.stats.sacks * 4 + p.stats.interceptions * 5 + p.stats.forcedFumbles * 4 + p.stats.fumbleRecoveries * 2 + p.stats.passesDefended + p.stats.pressures * .5;
    const mvp = (side, value) => {
      const winner = candidates(side).sort((a, b) => value(b.player) - value(a.player))[0], p = winner.player, s = p.stats;
      const details = side === 'defense' ? `${s.tackles} tackles, ${s.sacks} sacks, ${s.interceptions} interceptions, ${s.forcedFumbles} forced fumbles` : p.role === 'QB' ? `${s.passingYards} passing yards, ${s.passingTD} passing TD, ${s.rushingYards} rushing yards` : lineRoles.includes(p.role) ? `${s.blocks} successful blocks, ${s.pancakes} pancake blocks` : `${s.receivingYards} receiving yards, ${s.rushingYards} rushing yards, ${s.receivingTD + s.rushingTD} TD`;
      return { teamIndex: winner.teamIndex, pokemonId: p.id, name: p.name, role: p.role, text: `${p.name} · ${details}` };
    };
    const results = teams.map(team => team.result), winnerIndex = results[0].score === results[1].score ? null : results[0].score > results[1].score ? 0 : 1;
    const matchId = window.crypto?.randomUUID?.() || `match-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
    return {
      matchId, teams: results, winner: winnerIndex === null ? null : results[winnerIndex].name, winnerIndex,
      summary: winnerIndex === null ? `The game finishes tied at ${results[0].score}–${results[1].score} after four quarters.` : `${results[winnerIndex].name} wins ${results[winnerIndex].score}–${results[1 - winnerIndex].score}.`,
      quartersPlayed: 4, offensiveMVP: mvp('offense', offenseValue), defensiveMVP: mvp('defense', defenseValue)
    };
  }
  window.DraftMatch = Object.freeze({ simulate, statKeys });
})();
