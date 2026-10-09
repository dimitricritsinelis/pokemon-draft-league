(() => {
  'use strict';
  const pokemon = window.POKEMON || [];
  const byId = new Map(pokemon.map(p => [p.id, p]));
  const $ = id => document.getElementById(id);
  const narrow = window.matchMedia('(max-width: 800px), (pointer: coarse) and (max-width: 1000px)');
  const phone = window.matchMedia('(max-width: 560px)');
  const state = { offense: '21', defense: '3-4', selected: null, picks: {} };
  let lastFieldButton = null;
  let toastTimer;
  let catalogCards;
  let emptyResult;
  let viewportFrame;
  const offenseDetails = { '10': '0 TE · 1 RB · 4 WR', '11': '1 TE · 1 RB · 3 WR', '12': '2 TE · 1 RB · 2 WR', '21': '1 TE · 2 RB · 2 WR', '22': '2 TE · 2 RB · 1 WR' };
  const defenseDetails = { '3-4': '3 DL · 4 LB · 4 DB', '4-3': '4 DL · 3 LB · 4 DB', nickel: '4 DL · 2 LB · 5 DB', dime: '4 DL · 1 LB · 6 DB' };
  const offenseLabels = { '10': '10 personnel', '11': '11 personnel', '12': '12 personnel', '21': '21 personnel', '22': '22 personnel' };
  const defenseLabels = { '3-4': '3–4 defense', '4-3': '4–3 defense', nickel: 'Nickel · 4–2–5', dime: 'Dime · 4–1–6' };
  const roleNames = { LT: 'Left tackle', LG: 'Left guard', C: 'Center', RG: 'Right guard', RT: 'Right tackle', QB: 'Quarterback', HB: 'Halfback', FB: 'Fullback', WR: 'Wide receiver', TE: 'Tight end', FS: 'Free safety', SS: 'Strong safety', CB: 'Cornerback', DE: 'Defensive end', NT: 'Nose tackle', DT: 'Defensive tackle', ILB: 'Inside linebacker', OLB: 'Outside linebacker', MLB: 'Middle linebacker', WLB: 'Weakside linebacker', SLB: 'Strongside linebacker', LB: 'Linebacker', NB: 'Nickel back', DB: 'Defensive back' };
  const slot = (key, role, x, y, side) => ({ key, role, x, y, side, name: roleNames[role] });
  const o = (key, role, x, y) => slot('o_' + key, role, x, y, 'offense');
  const d = (key, role, x, y) => slot('d_' + key, role, x, y, 'defense');

  function slots() {
    const lineX = phone.matches ? [24, 37, 50, 63, 76] : [29, 39.5, 50, 60.5, 71];
    const offense = [o('lt', 'LT', lineX[0], 59), o('lg', 'LG', lineX[1], 59), o('c', 'C', lineX[2], 59), o('rg', 'RG', lineX[3], 59), o('rt', 'RT', lineX[4], 59), o('qb', 'QB', 50, 74), o('rb1', 'HB', 50, 91)];
    const eligible = {
      wr1: o('wr1', 'WR', phone.matches ? 9 : 10, 59),
      wr2: o('wr2', 'WR', phone.matches ? 91 : 92, 59),
      wr3: o('wr3', 'WR', 17, 74), wr4: o('wr4', 'WR', 83, 74),
      te1: o('te1', 'TE', phone.matches ? 85 : 82, phone.matches ? 70 : 59),
      te2: o('te2', 'TE', phone.matches ? 15 : 18, phone.matches ? 70 : 59),
      rb2: o('rb2', 'FB', 39, 84)
    };
    const extras = { '10': ['wr1', 'wr2', 'wr3', 'wr4'], '11': ['wr1', 'wr2', 'wr3', 'te1'], '12': ['wr1', 'wr2', 'te1', 'te2'], '21': ['wr1', 'wr2', 'te1', 'rb2'], '22': ['wr1', 'te1', 'te2', 'rb2'] };
    offense.push(...extras[state.offense].map(key => eligible[key]));
    const defense = [d('fs', 'FS', 35, 9), d('ss', 'SS', 65, 9), d('cb1', 'CB', 10, 25), d('cb2', 'CB', 90, 25)];
    const fourLine = [d('de1', 'DE', 25, 39), d('dt1', 'DT', 42, 39), d('dt2', 'DT', 58, 39), d('de2', 'DE', 75, 39)];
    const fronts = {
      '3-4': [d('de1', 'DE', 35, 39), d('dt1', 'NT', 50, 39), d('de2', 'DE', 65, 39), d('lb1', 'ILB', 41, 24), d('lb2', 'ILB', 59, 24), d('lb3', 'OLB', 24, 23), d('lb4', 'OLB', 76, 23)],
      '4-3': [...fourLine, d('lb1', 'MLB', 50, 24), d('lb2', 'WLB', 30, 24), d('lb3', 'SLB', 70, 24)],
      nickel: [...fourLine, d('lb1', 'LB', 41, 24), d('lb2', 'LB', 59, 24), d('nb', 'NB', 77, 23)],
      dime: [...fourLine, d('lb1', 'MLB', 50, 24), d('nb', 'NB', 29, 23), d('db6', 'DB', 71, 23)]
    };
    defense.push(...fronts[state.defense]);
    return [...defense, ...offense];
  }

  function message(text) {
    $('live-message').textContent = text;
    $('live-message').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('live-message').classList.remove('show'), 2200);
  }

  function renderBoard() {
    const current = slots();
    if (state.selected && !current.some(s => s.key === state.selected)) { state.selected = null; closePicker(false); }
    $('positions').replaceChildren(...current.map(s => {
      const p = byId.get(state.picks[s.key]);
      const button = document.createElement('button');
      button.className = `position ${s.side}${p ? '' : ' empty'}${state.selected === s.key ? ' selected' : ''}`;
      button.style.setProperty('--x', s.x + '%');
      button.style.setProperty('--y', s.y + '%');
      button.dataset.slot = s.key;
      button.setAttribute('aria-label', `${s.side}: ${s.name}${p ? ', ' + p.name : ', empty'}. Select Pokémon.`);
      button.setAttribute('aria-pressed', String(state.selected === s.key));
      if (p) {
        const img = document.createElement('img');
        img.src = p.image;
        img.alt = '';
        img.className = 'pokemon-on-field';
        img.draggable = false;
        button.append(img);
      } else {
        const empty = document.createElement('span');
        empty.className = 'empty-icon';
        empty.innerHTML = '<span aria-hidden="true">+</span>';
        button.append(empty);
      }
      const plate = document.createElement('span');
      plate.className = 'position-plate';
      const name = document.createElement('span');
      name.className = 'pokemon-name';
      name.textContent = p ? p.name : '';
      const role = document.createElement('span');
      role.className = 'position-role';
      role.textContent = s.role;
      plate.append(name, role);
      button.append(plate);
      button.addEventListener('click', () => selectPosition(s.key));
      return button;
    }));
    const filled = current.filter(s => byId.has(state.picks[s.key])).length;
    $('draft-count').innerHTML = `${filled}<span>/22</span>`;
    $('offense-detail').textContent = offenseDetails[state.offense];
    $('defense-detail').textContent = defenseDetails[state.defense];
    $('offense-current').textContent = offenseLabels[state.offense];
    $('defense-current').textContent = defenseLabels[state.defense];
    ['offense', 'defense'].forEach(side => {
      $(side + '-options').querySelectorAll('[role="option"]').forEach(option => option.setAttribute('aria-selected', String(option.dataset.value === state[side])));
    });
    renderSelection();
    updatePickedMarkers();
  }

  function renderSelection() {
    const selected = slots().find(s => s.key === state.selected);
    const picked = selected && byId.get(state.picks[selected.key]);
    $('selection-info').className = 'selection-info' + (selected ? ' is-selected' + (selected.side === 'defense' ? ' is-defense' : '') : '');
    $('selection-badge').textContent = selected ? selected.role : '＋';
    $('selection-title').textContent = selected ? selected.name : 'Select a position';
    $('selection-description').textContent = picked ? `Replacing ${picked.name}` : selected ? 'Choose your Pokémon' : 'Tap a player on the field to draft.';
    $('remove-pick').hidden = !picked;
  }

  function normalize(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9♀♂]/g, ''); }

  function renderCatalog() {
    const query = normalize($('pokemon-search').value);
    if (!catalogCards) {
      catalogCards = pokemon.map(p => {
      const button = document.createElement('button');
      button.className = 'pokemon-card';
      button.dataset.pokemon = p.id;
      button.setAttribute('aria-label', `Draft ${p.name}, Pokédex ${p.id}`);
      const dex = document.createElement('span'); dex.className = 'dex-number'; dex.textContent = '#' + String(p.id).padStart(3, '0');
      const img = document.createElement('img'); img.src = p.image; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
      const name = document.createElement('span'); name.className = 'card-name'; name.textContent = p.name;
      const type = document.createElement('span'); type.className = 'card-type'; type.textContent = p.types.join(' / ');
      button.append(dex, img, name, type);
      button.addEventListener('click', () => draftPokemon(p.id));
      return button;
      });
      emptyResult = document.createElement('p');
      emptyResult.className = 'empty-results';
      emptyResult.textContent = 'No Pokémon found. Try a name or Pokédex number.';
      $('pokemon-list').replaceChildren(...catalogCards, emptyResult);
    }
    let found = 0;
    catalogCards.forEach((card, index) => {
      const p = pokemon[index];
      const matches = normalize(p.name).includes(query) || String(p.id).includes(query) || String(p.id).padStart(3, '0').includes(query);
      card.hidden = !matches;
      if (matches) found++;
    });
    emptyResult.hidden = found > 0;
    $('catalog-count').textContent = `${found} Pokémon`;
    $('pokemon-list').scrollTop = 0;
    updatePickedMarkers();
  }

  function updatePickedMarkers() {
    const visiblePicks = new Set(slots().map(s => state.picks[s.key]).filter(Boolean));
    document.querySelectorAll('.pokemon-card').forEach(card => {
      const picked = visiblePicks.has(Number(card.dataset.pokemon));
      card.classList.toggle('picked', picked);
    });
  }

  function selectPosition(key) {
    if (!slots().some(s => s.key === key)) throw new Error('Unknown position.');
    state.selected = key;
    $('pokemon-search').value = '';
    renderBoard();
    renderCatalog();
    $('pokemon-list').scrollTop = 0;
    lastFieldButton = document.querySelector(`[data-slot="${key}"]`);
    if (narrow.matches) {
      $('picker').classList.add('open');
      $('picker').setAttribute('role', 'dialog');
      $('picker').setAttribute('aria-modal', 'true');
      $('picker-backdrop').hidden = false;
      document.body.classList.add('picker-open');
      document.querySelector('.board-panel').inert = true;
      document.querySelector('.masthead').inert = true;
      $('close-picker').focus({ preventScroll: true });
      updatePickerViewport();
    } else $('pokemon-search').focus({ preventScroll: true });
  }

  function closePicker(restoreFocus = true) {
    if (document.activeElement === $('pokemon-search')) $('pokemon-search').blur();
    $('picker').classList.remove('open');
    $('picker').removeAttribute('role');
    $('picker').removeAttribute('aria-modal');
    $('picker-backdrop').hidden = true;
    document.body.classList.remove('picker-open');
    $('picker').classList.remove('keyboard-open');
    $('picker').style.removeProperty('--picker-top');
    $('picker').style.removeProperty('--picker-height');
    document.querySelector('.board-panel').inert = false;
    document.querySelector('.masthead').inert = false;
    if (restoreFocus && lastFieldButton) {
      const button = document.querySelector(`[data-slot="${lastFieldButton.dataset.slot}"]`);
      button?.focus({ preventScroll: true });
    }
  }

  function updatePickerViewport() {
    if (!narrow.matches || !$('picker').classList.contains('open')) return;
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    $('picker').style.setProperty('--picker-top', `${(viewport?.offsetTop || 0) + 8}px`);
    $('picker').style.setProperty('--picker-height', `${Math.max(0, height - 16)}px`);
    $('picker').classList.toggle('keyboard-open', document.activeElement === $('pokemon-search') && height < window.innerHeight * 0.8);
  }

  function schedulePickerViewport() {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(updatePickerViewport);
  }

  function closePersonnelMenus(restoreFocus = false) {
    ['offense', 'defense'].forEach(side => {
      if (!$(side + '-options').hidden && restoreFocus) $(side).focus({ preventScroll: true });
      $(side + '-options').hidden = true;
      $(side).setAttribute('aria-expanded', 'false');
    });
  }

  function openPersonnelMenu(side) {
    const menu = $(side + '-options');
    const wasOpen = !menu.hidden;
    closePersonnelMenus();
    if (wasOpen) return;
    menu.hidden = false;
    $(side).setAttribute('aria-expanded', 'true');
    menu.querySelector(`[data-value="${state[side]}"]`).focus({ preventScroll: true });
  }

  function initializePersonnelMenus() {
    ['offense', 'defense'].forEach(side => {
      const labels = side === 'offense' ? offenseLabels : defenseLabels;
      const details = side === 'offense' ? offenseDetails : defenseDetails;
      const menu = $(side + '-options');
      menu.replaceChildren(...Object.keys(labels).map(value => {
        const option = document.createElement('button');
        option.type = 'button'; option.className = 'personnel-option';
        option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(value === state[side]));
        option.tabIndex = -1; option.dataset.value = value;
        const label = document.createElement('strong'); label.textContent = labels[value];
        const detail = document.createElement('span'); detail.textContent = details[value];
        option.append(label, detail);
        option.addEventListener('click', () => {
          setPersonnel(side === 'offense' ? value : state.offense, side === 'defense' ? value : state.defense);
          closePersonnelMenus(true);
        });
        return option;
      }));
      $(side).addEventListener('click', () => openPersonnelMenu(side));
      $(side).addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openPersonnelMenu(side); } });
      menu.addEventListener('keydown', e => {
        const options = [...menu.querySelectorAll('[role="option"]')];
        const index = options.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          options[next].focus();
        }
        if (e.key === 'Escape') { e.preventDefault(); closePersonnelMenus(true); }
        if (e.key === 'Tab') closePersonnelMenus(true);
      });
    });
    document.addEventListener('click', e => { if (!e.target.closest('.personnel-control')) closePersonnelMenus(); });
  }

  function draftPokemon(id) {
    if (!byId.has(id)) throw new Error('Choose an original Gen 1 Pokémon.');
    const selected = slots().find(s => s.key === state.selected);
    if (!selected) { message('Select a position on the field first.'); return { drafted: false }; }
    // Move an existing draft pick rather than cloning it onto the team.
    Object.keys(state.picks).forEach(key => { if (state.picks[key] === id && key !== selected.key) delete state.picks[key]; });
    state.picks[selected.key] = id;
    renderBoard();
    if (narrow.matches) closePicker();
    message(`${byId.get(id).name} drafted at ${selected.role}`);
    return { drafted: true, position: selected.key, pokemon: byId.get(id).name };
  }

  function setPersonnel(offense, defense) {
    if (!Object.hasOwn(offenseDetails, offense) || !Object.hasOwn(defenseDetails, defense)) throw new Error('Unknown personnel group.');
    state.offense = offense; state.defense = defense;
    renderBoard();
    return readBoard();
  }

  function sampleLineup() {
    state.offense = '21'; state.defense = '3-4'; state.selected = null;
    state.picks = { d_fs: 82, d_ss: 105, d_cb1: 123, d_cb2: 141, d_de1: 68, d_dt1: 143, d_de2: 67, d_lb1: 24, d_lb2: 62, d_lb3: 57, d_lb4: 28, o_lt: 9, o_lg: 76, o_c: 3, o_rg: 89, o_rt: 115, o_qb: 94, o_rb1: 112, o_wr1: 135, o_wr2: 85, o_te1: 34, o_rb2: 128 };
    renderBoard();
  }

  function readBoard() {
    return { offense: state.offense, defense: state.defense, positions: slots().map(s => ({ key: s.key, role: s.role, side: s.side, pokemon: byId.get(state.picks[s.key])?.name || null, pokemonId: state.picks[s.key] || null })) };
  }

  $('pokemon-search').addEventListener('input', renderCatalog);
  $('pokemon-search').addEventListener('focus', schedulePickerViewport);
  $('pokemon-search').addEventListener('blur', schedulePickerViewport);
  $('pokemon-search').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  window.visualViewport?.addEventListener('resize', schedulePickerViewport);
  window.visualViewport?.addEventListener('scroll', schedulePickerViewport);
  window.addEventListener('resize', schedulePickerViewport);
  $('close-picker').addEventListener('click', () => closePicker());
  $('picker-backdrop').addEventListener('click', () => closePicker());
  $('remove-pick').addEventListener('click', () => {
    const selected = slots().find(s => s.key === state.selected);
    if (!selected) return;
    delete state.picks[selected.key]; renderBoard();
    if (narrow.matches) closePicker();
    message(`${selected.role} is ready for a new pick`);
  });
  $('clear-button').addEventListener('click', () => $('clear-dialog').showModal());
  $('clear-dialog').addEventListener('close', () => {
    if ($('clear-dialog').returnValue === 'clear') { state.picks = {}; state.selected = null; renderBoard(); message('Board cleared. Make your first pick.'); }
  });
  $('sample-button').addEventListener('click', () => { sampleLineup(); message('Example lineup loaded'); });
  document.addEventListener('keydown', e => {
    if (!$('picker').classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
    if (e.key === 'Tab') {
      const focusable = [...$('picker').querySelectorAll('button:not([hidden]), input, a')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  narrow.addEventListener('change', () => closePicker(false));
  phone.addEventListener('change', renderBoard);

  initializePersonnelMenus();
  sampleLineup();
  renderCatalog();
  if (!pokemon.length) message('Pokémon artwork could not load. Please reload the page.');

  const context = document.modelContext;
  if (context?.registerTool) {
    const lifecycle = new AbortController();
    const tools = [
      { name: 'read_draft_board', title: 'Read draft board', description: 'Read offense and defense personnel and all active draft positions.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => readBoard() },
      { name: 'configure_draft_personnel', title: 'Set personnel', description: 'Set offense and defense personnel, preserving picks in shared positions.', inputSchema: { type: 'object', properties: { offense: { type: 'string', enum: Object.keys(offenseDetails) }, defense: { type: 'string', enum: Object.keys(defenseDetails) } }, required: ['offense', 'defense'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => setPersonnel(input.offense, input.defense) },
      { name: 'draft_pokemon_to_position', title: 'Draft Pokémon', description: 'Place a Gen 1 Pokémon into an active position. An already drafted Pokémon moves from its old position.', inputSchema: { type: 'object', properties: { position: { type: 'string' }, pokemonId: { type: 'integer', minimum: 1, maximum: 151 } }, required: ['position', 'pokemonId'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => {
        if (!input || !slots().some(s => s.key === input.position) || !Number.isInteger(input.pokemonId) || !byId.has(input.pokemonId)) throw new Error('Use an active position key and a Gen 1 Pokémon ID from 1 to 151.');
        state.selected = input.position;
        return draftPokemon(input.pokemonId);
      } }
    ];
    tools.forEach(tool => { try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch (_) {} });
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
})();
