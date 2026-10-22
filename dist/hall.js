(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const catalog = new Map(window.POKEMON.map(p => [p.id, p]));
  let view = 'hall', onChange = () => {}, revealId = null, busyId = null;
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
  const shameView = nodeButton();
  function nodeButton() { const button = document.createElement('button'); button.type = 'button'; button.id = 'shame-view'; button.setAttribute('aria-pressed', 'false'); button.append(document.createTextNode('Shame ')); const count = document.createElement('span'); count.id = 'shame-count'; count.textContent = '0'; button.append(count); return button; }
  $('hall-view').firstChild.textContent = 'Fame ';
  $('hall-view').after(shameView);
  $('career-view').textContent = 'All careers';
  $('hall-title').textContent = 'Halls & careers';
  $('hall-dialog').querySelector('.eyebrow').textContent = 'LEAGUE LEGACIES';
  $('hall-dialog').querySelector('.hall-intro').textContent = 'Celebrate the greats or immortalize the worst. Either hall locks a Pokémon’s career, reveals its positional values, and retires it until removed.';
  const node = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const normalized = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const number = (career, key) => career.stats[key] || 0;
  const labels = {
    passingAttempts: 'Pass attempts', passingCompletions: 'Completions', passingYards: 'Passing yards', passingTD: 'Pass TD', interceptionsThrown: 'INT thrown',
    carries: 'Carries', rushingYards: 'Rushing yards', rushingTD: 'Rush TD', targets: 'Targets', receptions: 'Receptions', receivingYards: 'Receiving yards', receivingTD: 'Receiving TD',
    tackles: 'Tackles', sacks: 'Sacks', sackYards: 'Sack yards', sackYardsLost: 'Sack yards lost', interceptions: 'Interceptions', passesDefended: 'Pass breakups', forcedFumbles: 'Forced fumbles', fumblesLost: 'Fumbles lost', fumbleRecoveries: 'Fumble recoveries',
    passBlockSnaps: 'Pass-block snaps', runBlockSnaps: 'Run-block snaps', blocks: 'Successful blocks', pressuresAllowed: 'Pressures allowed', sacksAllowed: 'Sacks allowed', pancakes: 'Pancake blocks', pressures: 'QB pressures', offensiveSnaps: 'Offensive snaps', defensiveSnaps: 'Defensive snaps', fieldGoalAttempts: 'Field-goal attempts', fieldGoalsMade: 'Field goals made', longestFieldGoal: 'Longest field goal', extraPointAttempts: 'Extra-point attempts', extraPointsMade: 'Extra points made', kickingPoints: 'Kicking points', specialTeamsSnaps: 'Special-teams snaps'
  };
  function stats(career) {
    const details = node('details', 'career-details');
    details.append(node('summary', '', 'Career stats'));
    const record = node('p', 'career-record', `${career.wins} wins · ${career.losses} losses · ${career.draws} draws`);
    const roles = Object.entries(career.appearancesByRole).map(([role, games]) => `${role} ${games}`).join(' · ');
    if (roles) record.append(node('span', 'career-roles', roles));
    details.append(record);
    const grid = node('dl', 'career-stat-grid');
    const entries = [['Drafted', career.draftCount || 0], ['Auction purchases', career.auctionPurchases || 0], ['Average price', career.auctionPurchases ? money(career.averagePaid) : '—'], ['Total auction spend', money(career.totalAuctionPaid || 0)], ['Games', career.games], ['Offensive MVPs', career.offensiveMVPs], ['Defensive MVPs', career.defensiveMVPs], ...Object.entries(labels).filter(([key]) => number(career, key) !== 0).map(([key, label]) => [label, number(career, key)])];
    entries.forEach(([label, value]) => { const group = node('div'); group.append(node('dt', '', label), node('dd', '', String(value))); grid.append(group); });
    details.append(grid);
    return details;
  }
  function scouting(id, entry, previous) {
    const details = node('details', 'hall-scouting'); details.open = previous ? previous.scoutingOpen : revealId === id;
    details.append(node('summary', '', 'Positional values revealed'));
    const grades = window.DraftCareers.isRemote() ? Object.entries(entry.values || {}).map(([role, value]) => ({ role, value })) : (window.DraftRatings?.roles || []).map(role => ({ role, value: window.DraftRatings.rate(id, role) }));
    if (!grades.length) { details.append(node('p', 'hall-grade-reason', 'Scouting values are being synchronized.')); return details; }
    const best = [...grades].sort((a, b) => b.value - a.value)[0];
    const top = node('p', 'hall-best', `${best.role} · ${best.value}/100`);
    details.append(top);
    const grid = node('div', 'hall-grade-grid');
    const explanation = node('p', 'hall-grade-reason'); explanation.id = 'hall-reason-' + id;
    const choose = (role, button) => {
      grid.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      explanation.textContent = (window.DraftCareers.isRemote() ? entry.reasons?.[role] : window.DraftRatings.explain?.(id, role)) || `${catalog.get(id).name}’s ${role} football fit considers its size, speed, anatomy, and abilities.`;
    };
    grades.forEach(({role, value}) => {
      const button = node('button', 'hall-grade'); button.type = 'button'; button.dataset.role = role;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${role}, positional value ${value} out of 100`);
      button.setAttribute('aria-describedby', explanation.id);
      button.append(node('span', '', role), node('strong', '', String(value)));
      button.addEventListener('click', () => choose(role, button)); grid.append(button);
      if (role === (previous?.selectedRole || best.role)) choose(role, button);
    });
    details.append(grid, explanation);
    return details;
  }
  function setView(next) { view = next; $('hall-view').setAttribute('aria-pressed', String(view === 'hall')); $('shame-view').setAttribute('aria-pressed', String(view === 'shame')); $('career-view').setAttribute('aria-pressed', String(view === 'career')); }
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
  async function changeHall(p, entry, kind) {
    if (busyId !== null) return;
    busyId = p.id; render(); $('hall-message').textContent = 'Saving…';
    try {
      if (entry) {
        await window.DraftCareers.remove(p.id); onChange(p.id, false); revealId = null;
        $('hall-message').textContent = `${p.name} is available to draft again. Its career remains saved.`;
      } else {
        await window.DraftCareers.induct(p.id, kind); onChange(p.id, true); revealId = p.id; setView(kind === 'shame' ? 'shame' : 'hall');
        $('hall-message').textContent = `${p.name} inducted into the Hall of ${kind === 'shame' ? 'Shame' : 'Fame'}. Career locked; positional values revealed.`;
      }
    } catch (error) { $('hall-message').textContent = error.message || 'The records could not be saved. Please try again.'; }
    finally { busyId = null; render(); }
  }
  function render() {
    const previous = new Map([...$('hall-list').querySelectorAll('.hall-card')].map(card => [Number(card.dataset.pokemon), { statsOpen: Boolean(card.querySelector('.career-details')?.open), scoutingOpen: Boolean(card.querySelector('.hall-scouting')?.open), selectedRole: card.querySelector('.hall-grade[aria-pressed="true"]')?.dataset.role }]));
    const dialogScroll = $('hall-dialog').scrollTop;
    const hall = window.DraftCareers.hall(), inducted = new Map(hall.map(entry => [entry.pokemonId, entry]));
    $('hall-count').textContent = hall.filter(entry => entry.kind === 'fame').length;
    $('shame-count').textContent = hall.filter(entry => entry.kind === 'shame').length;
    const remote = window.DraftCareers.isRemote(), canManage = window.DraftCareers.canManage();
    $('hall-storage').textContent = remote ? `Shared league records · Saved to the database.${canManage ? '' : ' Only the host can change the halls.'}` : window.DraftCareers.persisted() ? 'Solo records are saved on this device. Join an online lobby to use shared league records.' : 'Browser storage is unavailable. Solo records will last for this session.';
    const query = normalized($('hall-search').value).trim();
    const careers = new Map([...catalog.keys()].map(id => [id, window.DraftCareers.get(id)]));
    const candidates = view === 'career' ? [...catalog.values()].sort((a, b) => careers.get(b.id).draftCount - careers.get(a.id).draftCount || careers.get(b.id).games - careers.get(a.id).games || a.id - b.id) : hall.filter(entry => entry.kind === (view === 'shame' ? 'shame' : 'fame')).map(entry => catalog.get(entry.pokemonId)).filter(Boolean);
    const matches = candidates.filter(p => normalized(p.name).includes(query) || String(p.id).includes(query));
    const cards = matches.map(p => {
      const entry = inducted.get(p.id), career = entry?.career || careers.get(p.id);
      const card = node('article', 'hall-card' + (entry ? ' inducted ' + entry.kind : '')); card.dataset.pokemon = p.id;
      const heading = node('div', 'hall-card-heading');
      const img = node('img'); img.src = p.image; img.alt = ''; img.width = 48; img.height = 48; img.loading = 'lazy';
      const info = node('div', 'hall-card-info');
      info.append(node('strong', '', p.name), node('span', '', `${career.games} ${career.games === 1 ? 'game' : 'games'} · ${career.wins} wins`));
      info.append(node('span', 'career-market', `${career.draftCount || 0} drafts · ${career.auctionPurchases ? money(career.averagePaid) + ' avg' : 'No auction sales'}`));
      if (entry) info.append(node('span', 'hall-kind-badge', 'Hall of ' + (entry.kind === 'shame' ? 'Shame' : 'Fame')));
      heading.append(img, info);
      if (canManage) {
        const actions = node('div', 'hall-card-actions');
        for (const kind of entry ? [null] : ['fame', 'shame']) {
          const button = node('button', entry ? 'hall-remove' : kind === 'shame' ? 'hall-induct-shame' : 'hall-induct', busyId === p.id ? 'Saving…' : entry ? 'Remove' : kind === 'shame' ? 'Shame' : 'Fame');
          button.type = 'button'; button.dataset.action = entry ? 'remove' : kind === 'shame' ? 'induct-shame' : 'induct'; button.disabled = busyId !== null;
          button.setAttribute('aria-label', `${entry ? 'Remove' : 'Induct'} ${p.name}${entry ? ' from' : ' into'} Hall of ${(entry?.kind || kind) === 'shame' ? 'Shame' : 'Fame'}`);
          button.addEventListener('click', () => changeHall(p, entry, kind)); actions.append(button);
        }
        heading.append(actions);
      }
      card.append(heading);
      if (entry) {
        const date = new Date(entry.inductedAt);
        card.append(node('span', 'hall-inducted-date', `Career locked · ${Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'inducted'}`));
      }
      const careerDetails = stats(career); careerDetails.open = previous.get(p.id)?.statsOpen || false; card.append(careerDetails);
      if (entry) card.append(scouting(p.id, entry, previous.get(p.id)));
      return card;
    });
    if (!cards.length) {
      const empty = node('div', 'hall-empty');
      empty.append(node('strong', '', query ? 'No Pokémon found' : view === 'shame' ? 'The lowest bar is still clear' : view === 'hall' ? 'The first legend is up to you' : 'No careers found'));
      empty.append(node('p', '', query ? 'Try a name or Pokédex number.' : canManage ? 'Open All careers and choose a Pokémon to induct.' : 'The host can induct Pokémon from All careers.'));
      if (view !== 'career' && !query) { const button = node('button', 'primary-button', 'Browse all careers'); button.type = 'button'; button.addEventListener('click', () => { setView('career'); render(); }); empty.append(button); }
      cards.push(empty);
    }
    const list = $('hall-list'), scroll = list.scrollTop;
    list.replaceChildren(...cards); list.scrollTop = scroll; $('hall-dialog').scrollTop = dialogScroll;
  }
  $('hall-view').addEventListener('click', () => { setView('hall'); revealId = null; $('hall-message').textContent = ''; render(); });
  $('shame-view').addEventListener('click', () => { setView('shame'); revealId = null; $('hall-message').textContent = ''; render(); });
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
    open(nextView = 'hall') { window.DraftCareers.refresh(); setView(['hall', 'shame', 'career'].includes(nextView) ? nextView : 'hall'); revealId = null; $('hall-search').value = ''; $('hall-message').textContent = ''; render(); $('hall-dialog').scrollTop = 0; $('hall-dialog').showModal(); syncViewport(); },
    refresh() { if ($('hall-dialog').open) render(); }
  });
})();
