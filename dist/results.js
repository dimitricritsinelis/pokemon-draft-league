(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const catalog = new Map(window.POKEMON.map(p => [p.id, p]));
  const lineRoles = ['LT', 'LG', 'C', 'RG', 'RT'];
  const labels = {
    passingAttempts: 'Pass attempts', passingCompletions: 'Completions', passingYards: 'Pass yards', passingTD: 'Pass TD', interceptionsThrown: 'INT thrown',
    carries: 'Carries', rushingYards: 'Rush yards', rushingTD: 'Rush TD', targets: 'Targets', receptions: 'Catches', receivingYards: 'Receiving yards', receivingTD: 'Receiving TD',
    tackles: 'Tackles', sacks: 'Sacks', sackYards: 'Sack yards', sackYardsLost: 'Sack yards lost', interceptions: 'Interceptions', passesDefended: 'Pass breakups', forcedFumbles: 'Forced fumbles', fumblesLost: 'Fumbles lost', fumbleRecoveries: 'Fumble recoveries',
    passBlockSnaps: 'Pass-block snaps', runBlockSnaps: 'Run-block snaps', blocks: 'Successful blocks', pressuresAllowed: 'Pressures allowed', sacksAllowed: 'Sacks allowed', pancakes: 'Pancake blocks', pressures: 'QB pressures', offensiveSnaps: 'Offensive snaps', defensiveSnaps: 'Defensive snaps'
  };
  const node = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const s = (player, key) => player.stats[key] || 0;
  function portrait(id, size = 40) { const img = node('img'); img.src = catalog.get(id).image; img.alt = ''; img.width = size; img.height = size; img.loading = 'lazy'; return img; }
  function summary(player) {
    if (player.side === 'defense') return `${s(player,'tackles')} TKL · ${s(player,'sacks')} SK · ${s(player,'interceptions')} INT · ${s(player,'pressures')} pressures`;
    if (player.role === 'QB') return `${s(player,'passingCompletions')}/${s(player,'passingAttempts')} · ${s(player,'passingYards')} pass yds · ${s(player,'passingTD')} TD · ${s(player,'interceptionsThrown')} INT`;
    if (lineRoles.includes(player.role)) return `${s(player,'blocks')} blocks · ${s(player,'pancakes')} pancakes · ${s(player,'sacksAllowed')} sacks allowed`;
    if (player.role === 'HB' || player.role === 'FB') return `${s(player,'carries')} CAR · ${s(player,'rushingYards')} rush yds · ${s(player,'rushingTD')} TD · ${s(player,'receivingYards')} rec yds`;
    return `${s(player,'receptions')}/${s(player,'targets')} catches · ${s(player,'receivingYards')} yds · ${s(player,'receivingTD')} TD · ${s(player,'blocks')} blocks`;
  }
  function playerStats(player) {
    const keys = new Set(player.side === 'defense' ? ['defensiveSnaps','tackles','sacks','sackYards','interceptions','passesDefended','pressures','forcedFumbles','fumbleRecoveries'] : player.role === 'QB' ? ['offensiveSnaps','passingCompletions','passingAttempts','passingYards','passingTD','interceptionsThrown','sackYardsLost','carries','rushingYards','rushingTD','fumblesLost'] : lineRoles.includes(player.role) ? ['offensiveSnaps','passBlockSnaps','runBlockSnaps','blocks','pancakes','pressuresAllowed','sacksAllowed'] : ['offensiveSnaps','targets','receptions','receivingYards','receivingTD','carries','rushingYards','rushingTD','blocks','fumblesLost']);
    Object.keys(labels).forEach(key => { if (s(player, key) !== 0) keys.add(key); });
    const dl = node('dl', 'player-stat-grid');
    [...keys].forEach(key => { const group = node('div'); group.append(node('dt', '', labels[key]), node('dd', '', String(s(player, key)))); dl.append(group); });
    return dl;
  }
  function row(player) {
    const details = node('details', 'match-player'); details.dataset.pokemon = player.pokemonId; details.dataset.role = player.role;
    const head = node('summary', 'player-heading');
    const info = node('div', 'player-summary'); info.append(node('strong', '', player.name), node('span', 'boxscore-line', summary(player)));
    head.append(portrait(player.pokemonId), node('span', 'boxscore-role', player.role), info, node('span', 'player-expand', '+'));
    details.append(head, playerStats(player)); return details;
  }
  function mvp(result, value, label) {
    const card = node('article', 'mvp-card'); card.dataset.pokemon = value.pokemonId;
    const text = node('div'); text.append(node('span', 'boxscore-label', label), node('strong', '', value.name), node('span', 'mvp-team', `${result.teams[value.teamIndex].name} · ${value.role}`), node('p', 'mvp-description', value.text.startsWith(value.name + ' · ') ? value.text.slice(value.name.length + 3) : value.text));
    card.append(portrait(value.pokemonId, 52), text); return card;
  }
  function render(result) {
    $('match-title').textContent = result.winner ? `${result.winner} wins` : 'Final · a draw'; $('match-summary').textContent = result.summary;
    $('match-score-rows').replaceChildren(...result.teams.map(team => {
      const row = node('tr'); const name = node('th', '', team.name); name.scope = 'row'; row.append(name);
      [...team.quarters, team.score].forEach((value, i) => row.append(node('td', i === 4 ? 'final-score' : '', String(value)))); return row;
    }));
    $('match-mvps').replaceChildren(mvp(result,result.offensiveMVP,'Offensive MVP'),mvp(result,result.defensiveMVP,'Defensive MVP'));
    $('match-highlights').replaceChildren(...result.teams.map(team => {
      const card = node('article', 'highlight-card'); card.append(node('span', 'boxscore-label', `${team.name} · biggest play`));
      const play = team.biggestPlay;
      card.append(node('p', '', `Q${play.quarter} · ${play.text}`)); return card;
    }));
    $('match-players').replaceChildren(...result.teams.map(team => {
      const section = node('section', 'team-boxscore'); section.append(node('h3', '', team.name));
      const total = team.players.reduce((a,p) => ({ yards: a.yards+s(p,'passingYards')+s(p,'rushingYards'), sacks: a.sacks+s(p,'sacks') }), {yards:0,sacks:0});
      section.append(node('p', 'team-game-totals', `${team.totals?.totalYards ?? total.yards} total yds · ${team.turnovers} turnovers · ${team.fieldGoals} FG · ${total.sacks} sacks`));
      for (const side of ['offense','defense']) {
        section.append(node('h4', 'unit-heading', side === 'offense' ? 'Offense' : 'Defense'));
        team.players.filter(player => player.side === side).forEach(player => section.append(row(player)));
      }
      return section;
    }));
    $('match-career-status').textContent = window.DraftCareers.persisted() ? 'Career stats saved on this device. Visit the Hall of Fame in Draft options.' : 'Career stats could not be saved by this browser. They will last for this session.';
    $('match-dialog').scrollTop = 0;
  }
  window.DraftResults = Object.freeze({ render });
})();
