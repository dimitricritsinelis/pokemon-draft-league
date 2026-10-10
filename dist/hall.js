(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const catalog = new Map(window.POKEMON.map(p => [p.id, p]));
  let view = 'hall', onChange = () => {}, revealId = null;
  const node = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const normalized = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const number = (career, key) => career.stats[key] || 0;
  const labels = {
    passingAttempts: 'Pass attempts', passingCompletions: 'Completions', passingYards: 'Passing yards', passingTD: 'Pass TD', interceptionsThrown: 'INT thrown',
    carries: 'Carries', rushingYards: 'Rushing yards', rushingTD: 'Rush TD', targets: 'Targets', receptions: 'Receptions', receivingYards: 'Receiving yards', receivingTD: 'Receiving TD',
    tackles: 'Tackles', sacks: 'Sacks', sackYards: 'Sack yards', sackYardsLost: 'Sack yards lost', interceptions: 'Interceptions', passesDefended: 'Pass breakups', forcedFumbles: 'Forced fumbles', fumblesLost: 'Fumbles lost', fumbleRecoveries: 'Fumble recoveries',
    passBlockSnaps: 'Pass-block snaps', runBlockSnaps: 'Run-block snaps', blocks: 'Successful blocks', pressuresAllowed: 'Pressures allowed', sacksAllowed: 'Sacks allowed', pancakes: 'Pancake blocks', pressures: 'QB pressures', offensiveSnaps: 'Offensive snaps', defensiveSnaps: 'Defensive snaps'
  };
  function stats(career) {
    const details = node('details', 'career-details');
    details.append(node('summary', '', 'Career stats'));
    const record = node('p', 'career-record', `${career.wins} wins · ${career.losses} losses · ${career.draws} draws`);
    const roles = Object.entries(career.appearancesByRole).map(([role, games]) => `${role} ${games}`).join(' · ');
    if (roles) record.append(node('span', 'career-roles', roles));
    details.append(record);
    const grid = node('dl', 'career-stat-grid');
    const entries = [['Games', career.games], ['Offensive MVPs', career.offensiveMVPs], ['Defensive MVPs', career.defensiveMVPs], ...Object.entries(labels).filter(([key]) => number(career, key) !== 0).map(([key, label]) => [label, number(career, key)])];
    entries.forEach(([label, value]) => { const group = node('div'); group.append(node('dt', '', label), node('dd', '', String(value))); grid.append(group); });
    details.append(grid);
    return details;
  }
  function scouting(id) {
    const details = node('details', 'hall-scouting'); details.open = revealId === id;
    details.append(node('summary', '', 'Positional values revealed'));
    const grades = window.DraftRatings.roles.map(role => ({ role, value: window.DraftRatings.rate(id, role) }));
    const best = [...grades].sort((a, b) => b.value - a.value)[0];
    const top = node('p', 'hall-best', `${best.role} · ${best.value}/100`);
    details.append(top);
    const grid = node('div', 'hall-grade-grid');
    const explanation = node('p', 'hall-grade-reason'); explanation.id = 'hall-reason-' + id;
    const choose = (role, button) => {
      grid.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      explanation.textContent = window.DraftRatings.explain?.(id, role) || `${catalog.get(id).name}’s ${role} football fit considers its size, speed, anatomy, and abilities.`;
    };
    grades.forEach(({role, value}) => {
      const button = node('button', 'hall-grade'); button.type = 'button'; button.dataset.role = role;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${role}, positional value ${value} out of 100`);
      button.setAttribute('aria-describedby', explanation.id);
      button.append(node('span', '', role), node('strong', '', String(value)));
      button.addEventListener('click', () => choose(role, button)); grid.append(button);
      if (role === best.role) choose(role, button);
    });
    details.append(grid, explanation);
    return details;
  }
  function setView(next) { view = next; $('hall-view').setAttribute('aria-pressed', String(view === 'hall')); $('career-view').setAttribute('aria-pressed', String(view === 'career')); }
  function syncViewport() {
    const dialog = $('hall-dialog'), viewport = window.visualViewport;
    const height = viewport?.height || innerHeight;
    const keyboard = dialog.open && document.activeElement === $('hall-search') && height < innerHeight * .8;
    dialog.classList.toggle('keyboard-open', keyboard);
    if (keyboard) {
      dialog.style.setProperty('--hall-top', `${(viewport?.offsetTop || 0) + 8}px`);
      dialog.style.setProperty('--hall-height', `${Math.max(0, height - 16)}px`);
    } else { dialog.style.removeProperty('--hall-top'); dialog.style.removeProperty('--hall-height'); }
  }
  function render() {
    const hall = window.DraftCareers.hall(), inducted = new Map(hall.map(entry => [entry.pokemonId, entry]));
    $('hall-count').textContent = hall.length;
    $('hall-storage').textContent = window.DraftCareers.persisted() ? 'Careers and the Hall of Fame are saved on this device.' : 'Your browser could not save career records. They will last for this session.';
    const query = normalized($('hall-search').value).trim();
    const careers = view === 'career' ? new Map([...catalog.keys()].map(id => [id, window.DraftCareers.get(id)])) : null;
    const candidates = view === 'hall' ? hall.map(entry => catalog.get(entry.pokemonId)) : [...catalog.values()].filter(p => !inducted.has(p.id)).sort((a, b) => careers.get(b.id).games - careers.get(a.id).games || a.id - b.id);
    const matches = candidates.filter(p => normalized(p.name).includes(query) || String(p.id).includes(query));
    const cards = matches.map(p => {
      const entry = inducted.get(p.id), career = entry?.career || careers.get(p.id);
      const card = node('article', 'hall-card' + (entry ? ' inducted' : '')); card.dataset.pokemon = p.id;
      const heading = node('div', 'hall-card-heading');
      const img = node('img'); img.src = p.image; img.alt = ''; img.width = 48; img.height = 48; img.loading = 'lazy';
      const info = node('div', 'hall-card-info'); info.append(node('strong', '', p.name), node('span', '', `${career.games} ${career.games === 1 ? 'game' : 'games'} · ${career.wins} wins`));
      const button = node('button', entry ? 'hall-remove' : 'hall-induct', entry ? 'Remove' : 'Induct'); button.type = 'button'; button.dataset.action = entry ? 'remove' : 'induct'; button.setAttribute('aria-label', `${entry ? 'Remove' : 'Induct'} ${p.name}${entry ? ' from' : ' into'} Hall of Fame`);
      button.addEventListener('click', () => {
        if (entry) { window.DraftCareers.remove(p.id); onChange(p.id, false); revealId = null; $('hall-message').textContent = `${p.name} is available to draft again. Its career remains saved.`; }
        else { window.DraftCareers.induct(p.id); onChange(p.id, true); revealId = p.id; setView('hall'); $('hall-message').textContent = `${p.name} inducted. Career locked; scouting values revealed.`; }
        render();
      });
      heading.append(img, info, button); card.append(heading);
      if (entry) {
        const date = new Date(entry.inductedAt);
        card.append(node('span', 'hall-inducted-date', `Career locked · ${Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'inducted'}`));
      }
      card.append(stats(career));
      if (entry) card.append(scouting(p.id));
      return card;
    });
    if (!cards.length) {
      const empty = node('div', 'hall-empty');
      empty.append(node('strong', '', query ? 'No Pokémon found' : view === 'hall' ? 'The first legend is up to you' : 'Everyone has retired'));
      empty.append(node('p', '', query ? 'Try a name or Pokédex number.' : view === 'hall' ? 'Open the career roster to choose a Pokémon to induct.' : 'Remove a Pokémon from the Hall of Fame to draft it again.'));
      if (view === 'hall' && !query) { const button = node('button', 'primary-button', 'Open career roster'); button.type = 'button'; button.addEventListener('click', () => { setView('career'); render(); }); empty.append(button); }
      cards.push(empty);
    }
    $('hall-list').replaceChildren(...cards);
  }
  $('hall-view').addEventListener('click', () => { setView('hall'); revealId = null; $('hall-message').textContent = ''; render(); });
  $('career-view').addEventListener('click', () => { setView('career'); revealId = null; $('hall-message').textContent = ''; render(); });
  $('hall-search').addEventListener('input', render);
  $('hall-search').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); } });
  $('hall-search').addEventListener('focus', syncViewport);
  $('hall-search').addEventListener('blur', () => requestAnimationFrame(syncViewport));
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);
  window.addEventListener('resize', syncViewport);
  $('hall-dialog').addEventListener('close', syncViewport);
  window.DraftHall = Object.freeze({
    configure(options) { onChange = options.onChange || (() => {}); },
    open() { setView('hall'); revealId = null; $('hall-search').value = ''; $('hall-message').textContent = ''; render(); $('hall-dialog').scrollTop = 0; $('hall-dialog').showModal(); syncViewport(); },
    refresh() { if ($('hall-dialog').open) render(); }
  });
})();
