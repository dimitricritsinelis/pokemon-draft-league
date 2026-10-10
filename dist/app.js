(() => {
  'use strict';
  const pokemon = window.POKEMON || [];
  const byId = new Map(pokemon.map(p => [p.id, p]));
  const $ = id => document.getElementById(id);
  const narrow = window.matchMedia('(max-width: 1000px)');
  const phone = window.matchMedia('(max-width: 560px)');
  const state = { mode: 'gen1', team: 0, name: '', art: 'artwork', offense: '21', defense: '3-4', selected: null, picks: {} };
  const storageKey = 'pokemon-draft-league-v1';
  const auctionStorageKey = 'pokemon-draft-auction-v1';
  const incomingSharedLink = location.hash.startsWith('#draft=');
  let auction = null, auctionActive = false, regularView = null;
  const modeLabels = { gen1: 'Gen 1', gen2: 'Gen 2', both: 'Gen 1 + Gen 2' };
  const slotKeys = ['d_fs', 'd_ss', 'd_cb1', 'd_cb2', 'd_de1', 'd_dt1', 'd_dt2', 'd_de2', 'd_lb1', 'd_lb2', 'd_lb3', 'd_lb4', 'd_nb', 'd_db6', 'o_lt', 'o_lg', 'o_c', 'o_rg', 'o_rt', 'o_qb', 'o_rb1', 'o_wr1', 'o_wr2', 'o_wr3', 'o_wr4', 'o_te1', 'o_te2', 'o_rb2'];
  const samplePicks = { d_fs: 82, d_ss: 105, d_cb1: 123, d_cb2: 141, d_de1: 68, d_dt1: 143, d_de2: 67, d_lb1: 24, d_lb2: 62, d_lb3: 57, d_lb4: 28, o_lt: 9, o_lg: 76, o_c: 3, o_rg: 89, o_rt: 115, o_qb: 94, o_rb1: 112, o_wr1: 135, o_wr2: 85, o_te1: 34, o_rb2: 128 };
  const johtoSample = { d_fs: 200, d_ss: 196, d_cb1: 212, d_cb2: 227, d_de1: 214, d_dt1: 205, d_de2: 237, d_lb1: 166, d_lb2: 195, d_lb3: 207, d_lb4: 221, o_lt: 160, o_lg: 208, o_c: 154, o_rg: 242, o_rt: 217, o_qb: 199, o_rb1: 232, o_wr1: 181, o_wr2: 169, o_te1: 248, o_rb2: 241 };
  let boards = { gen1: defaultBoard('gen1'), gen2: defaultBoard('gen2'), both: defaultBoard('both') };
  let opponents = Object.fromEntries(Object.keys(modeLabels).map(mode => [mode, emptyBoard()]));
  let shared = false;
  let sharedCopy = null;
  let exportUrl;
  let exportFile;
  let exportRun = 0;
  let lastFieldButton = null;
  let toastTimer;
  let catalogCards;
  let emptyResult;
  let viewportFrame;
  let menuScrollY = 0;
  const offenseDetails = { '10': '0 TE · 1 RB · 4 WR', '11': '1 TE · 1 RB · 3 WR', '12': '2 TE · 1 RB · 2 WR', '21': '1 TE · 2 RB · 2 WR', '22': '2 TE · 2 RB · 1 WR' };
  const defenseDetails = { '3-4': '3 DL · 4 LB · 4 DB', '4-3': '4 DL · 3 LB · 4 DB', nickel: '4 DL · 2 LB · 5 DB', dime: '4 DL · 1 LB · 6 DB' };
  const offenseLabels = { '10': '10 personnel', '11': '11 personnel', '12': '12 personnel', '21': '21 personnel', '22': '22 personnel' };
  const defenseLabels = { '3-4': '3–4 defense', '4-3': '4–3 defense', nickel: 'Nickel · 4–2–5', dime: 'Dime · 4–1–6' };
  const roleNames = { LT: 'Left tackle', LG: 'Left guard', C: 'Center', RG: 'Right guard', RT: 'Right tackle', QB: 'Quarterback', HB: 'Halfback', FB: 'Fullback', WR: 'Wide receiver', TE: 'Tight end', FS: 'Free safety', SS: 'Strong safety', CB: 'Cornerback', DE: 'Defensive end', NT: 'Nose tackle', DT: 'Defensive tackle', ILB: 'Inside linebacker', OLB: 'Outside linebacker', MLB: 'Middle linebacker', WLB: 'Weakside linebacker', SLB: 'Strongside linebacker', LB: 'Linebacker', NB: 'Nickel back', DB: 'Defensive back' };
  const slot = (key, role, x, y, side) => ({ key, role, x, y, side, name: roleNames[role] });
  const o = (key, role, x, y) => slot('o_' + key, role, x, y, 'offense');
  const d = (key, role, x, y) => slot('d_' + key, role, x, y, 'defense');

  function slots(mobile = phone.matches, board = state) {
    const lineX = mobile ? [20, 35, 50, 65, 80] : [27, 38.5, 50, 61.5, 73];
    const offense = [o('lt', 'LT', lineX[0], 59), o('lg', 'LG', lineX[1], 59), o('c', 'C', lineX[2], 59), o('rg', 'RG', lineX[3], 59), o('rt', 'RT', lineX[4], 59), o('qb', 'QB', 50, 76), o('rb1', 'HB', 50, 92)];
    const eligible = {
      wr1: o('wr1', 'WR', 2, 59),
      wr2: o('wr2', 'WR', 98, 59),
      wr3: o('wr3', 'WR', 15, 76), wr4: o('wr4', 'WR', 85, 76),
      te1: o('te1', 'TE', mobile ? 92 : 85, mobile ? 74 : 59),
      te2: o('te2', 'TE', mobile ? 8 : 15, mobile ? 74 : 59),
      rb2: o('rb2', 'FB', mobile ? 28 : 39, 88)
    };
    const extras = { '10': ['wr1', 'wr2', 'wr3', 'wr4'], '11': ['wr1', 'wr2', 'wr3', 'te1'], '12': ['wr1', 'wr2', 'te1', 'te2'], '21': ['wr1', 'wr2', 'te1', 'rb2'], '22': ['wr1', 'te1', 'te2', 'rb2'] };
    offense.push(...extras[board.offense].map(key => eligible[key]));
    const defense = [d('fs', 'FS', 35, 9), d('ss', 'SS', 65, 9), d('cb1', 'CB', 2, 28), d('cb2', 'CB', 98, 28)];
    const fourLine = [d('de1', 'DE', 20, 43), d('dt1', 'DT', 40, 43), d('dt2', 'DT', 60, 43), d('de2', 'DE', 80, 43)];
    const fronts = {
      '3-4': [d('de1', 'DE', 30, 43), d('dt1', 'NT', 50, 43), d('de2', 'DE', 70, 43), d('lb1', 'ILB', 40, 26), d('lb2', 'ILB', 60, 26), d('lb3', 'OLB', 22, 26), d('lb4', 'OLB', 78, 26)],
      '4-3': [...fourLine, d('lb1', 'MLB', 50, 26), d('lb2', 'WLB', 30, 26), d('lb3', 'SLB', 70, 26)],
      nickel: [...fourLine, d('lb1', 'LB', 35, 26), d('lb2', 'LB', 57, 26), d('nb', 'NB', 79, 26)],
      dime: [...fourLine, d('lb1', 'MLB', 50, 26), d('nb', 'NB', 28, 26), d('db6', 'DB', 72, 26)]
    };
    defense.push(...fronts[board.defense]);
    return [...defense, ...offense].map(s => ({ ...s, ...window.DraftField.project(s.x, s.y), scale: .9 + .12 * s.y / 100 }));
  }

  function cleanName(value) { return Array.from((typeof value === 'string' ? value : '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 24).join(''); }
  const teamName = (index = state.team) => (index === state.team ? state.name : teamPair()[index].name) || 'Team ' + (index + 1);
  function emptyBoard() { return { name: '', offense: '21', defense: '3-4', picks: {} }; }
  const copyBoard = b => ({ name: cleanName(b.name), offense: b.offense, defense: b.defense, picks: { ...b.picks } });
  function teamPair() { return auctionActive ? auction.teams : shared ? sharedCopy.teams : [boards[state.mode], opponents[state.mode]]; }
  function opponentPicks() { return new Set(Object.values(teamPair()[1 - state.team].picks)); }

  function defaultBoard(mode) {
    return { name: '', offense: '21', defense: '3-4', picks: mode === 'gen2' ? {} : { ...samplePicks } };
  }

  function allowed(id, mode = state.mode) {
    return Number.isInteger(id) && byId.has(id) && (mode === 'both' || (mode === 'gen1' ? id <= 151 : id >= 152));
  }

  function validateBoard(value, mode) {
    if (!value || !Object.hasOwn(offenseDetails, value.offense) || !Object.hasOwn(defenseDetails, value.defense) || !value.picks || typeof value.picks !== 'object' || Array.isArray(value.picks)) return null;
    const picks = {}, seen = new Set();
    for (const [key, id] of Object.entries(value.picks)) {
      if (!slotKeys.includes(key) || !allowed(id, mode) || seen.has(id)) return null;
      seen.add(id); picks[key] = id;
    }
    return { name: cleanName(value.name), offense: value.offense, defense: value.defense, picks };
  }

  function snapshot() { return { name: state.name, offense: state.offense, defense: state.defense, picks: { ...state.picks } }; }
  function removeRetirees(board) {
    let removed = 0;
    Object.entries(board.picks).forEach(([key, id]) => { if (window.DraftCareers.isInducted(id)) { delete board.picks[key]; removed++; } });
    return removed;
  }
  function applyBoard(board) { removeRetirees(board); state.name = cleanName(board.name); state.offense = board.offense; state.defense = board.defense; state.picks = { ...board.picks }; state.selected = null; }

  function hallChanged(id, inducted) {
    invalidateMatch(); closePicker(false); saveDraft();
    if (inducted) reconcileAuctionRetirees();
    if (inducted) {
      Object.values(boards).forEach(removeRetirees); Object.values(opponents).forEach(removeRetirees);
      sharedCopy?.teams.forEach(removeRetirees); removeRetirees(state);
      if (auctionActive) persistRegularDraft(regularView, false);
    }
    saveDraft(); renderBoard(); renderCatalog();
  }

  function validatePair(values, mode) {
    if (!Array.isArray(values) || values.length !== 2) return null;
    const pair = values.map(value => validateBoard(value, mode));
    if (pair.some(board => !board)) return null;
    const ids = pair.flatMap(board => Object.values(board.picks));
    return new Set(ids).size === ids.length ? pair : null;
  }

  function saveDraft() {
    if (auctionActive) { auction.teams[state.team] = snapshot(); saveAuction(); return; }
    if (shared) {
      sharedCopy.team = state.team;
      sharedCopy.teams[state.team] = snapshot();
    } else (state.team === 0 ? boards : opponents)[state.mode] = snapshot();
    persistRegularDraft({ mode: state.mode, team: state.team, shared });
  }

  function persistRegularDraft(view, showStatus = true) {
    const saved = { v: 3, mode: view.mode, team: view.team, art: state.art, boards, opponents, shared: sharedCopy, viewShared: view.shared };
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved));
      if (showStatus) { $('save-status').textContent = 'Autosaved'; $('save-status').title = 'Both teams saved on this device'; }
    } catch (_) {
      if (showStatus) { $('save-status').textContent = 'Unsaved'; $('save-status').title = 'Browser storage is unavailable. Share a link to keep both teams.'; }
    }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(storageKey);
      const saved = raw && raw.length < 35000 ? JSON.parse(raw) : null;
      if (saved?.v === 1 || saved?.v === 2 || saved?.v === 3) {
        Object.keys(modeLabels).forEach(mode => {
          const first = validateBoard(saved.boards?.[mode], mode);
          if (first) boards[mode] = first;
          const second = validateBoard(saved.opponents?.[mode], mode);
          if (second) {
            const used = new Set(Object.values(boards[mode].picks));
            Object.entries(second.picks).forEach(([key, id]) => { if (used.has(id)) delete second.picks[key]; });
            opponents[mode] = second;
          }
        });
        if (Object.hasOwn(modeLabels, saved.mode)) state.mode = saved.mode;
        if (saved.team === 0 || saved.team === 1) state.team = saved.team;
        if (saved.shared && Object.hasOwn(modeLabels, saved.shared.mode)) {
          const values = saved.v === 1 ? [saved.shared, emptyBoard()] : saved.shared.teams;
          const pair = validatePair(values, saved.shared.mode);
          if (pair) {
            sharedCopy = { mode: saved.shared.mode, team: saved.shared.team === 1 ? 1 : 0, teams: pair };
            if (saved.viewShared !== false) {
              shared = true; state.mode = sharedCopy.mode; state.team = sharedCopy.team;
            }
          }
        }
      }
    } catch (_) { /* A blocked or damaged save must never prevent playing. */ }
    Object.values(boards).forEach(removeRetirees); Object.values(opponents).forEach(removeRetirees); sharedCopy?.teams.forEach(removeRetirees);
    applyBoard(teamPair()[state.team]);
    importLink();
    saveDraft();
  }

  function importLink() {
    if (!location.hash.startsWith('#draft=')) return;
    try {
      const token = location.hash.slice(7);
      if (token.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Invalid link');
      const bytes = Uint8Array.from(atob(token.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!Array.isArray(data) || !Object.hasOwn(modeLabels, data[1])) throw new Error('Invalid link');
      let pair, active = 0;
      const decode = (value, named = false) => {
        const offset = named ? 3 : 2;
        if (!Array.isArray(value) || value.length !== offset + slotKeys.length || value.slice(offset).some(id => !Number.isInteger(id) || id < 0) || (named && typeof value[0] !== 'string')) return null;
        const picks = {};
        slotKeys.forEach((key, i) => { if (value[i + offset] !== 0) picks[key] = value[i + offset]; });
        return { name: named ? cleanName(value[0]) : '', offense: value[offset - 2], defense: value[offset - 1], picks };
      };
      if (data[0] === 1 && data.length === 5 + slotKeys.length && ['artwork', 'retro'].includes(data[4])) {
        pair = validatePair([decode([data[2], data[3], ...data.slice(5)]), emptyBoard()], data[1]);
      } else if (data[0] === 2 && data.length === 5 && (data[2] === 0 || data[2] === 1)) {
        active = data[2]; pair = validatePair([decode(data[3]), decode(data[4])], data[1]);
      } else if (data[0] === 3 && data.length === 5 && (data[2] === 0 || data[2] === 1)) {
        active = data[2]; pair = validatePair([decode(data[3], true), decode(data[4], true)], data[1]);
      }
      if (!pair) throw new Error('Invalid link');
      invalidateMatch();
      const retired = pair.reduce((sum, board) => sum + removeRetirees(board), 0);
      if (auctionActive) exitAuction(false);
      sharedCopy = { mode: data[1], team: active, teams: pair };
      shared = true; state.mode = data[1]; state.team = active; applyBoard(pair[active]);
      message(retired ? 'Shared teams opened. Hall of Fame Pokémon have retired from this game.' : 'Shared teams opened. Your teams are kept safe.');
    } catch (_) { message('That matchup link is incomplete. Your saved teams are ready.'); }
    history.replaceState(null, '', location.pathname + location.search);
  }

  function shareUrl() {
    saveDraft();
    const encode = b => [cleanName(b.name), b.offense, b.defense, ...slotKeys.map(key => b.picks[key] || 0)];
    const data = [3, state.mode, state.team, ...teamPair().map(encode)];
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + location.pathname + '#draft=' + token;
  }

  function invalidateMatch() { if ($('match-dialog')?.open) $('match-dialog').close(); }

  function changeMode(mode) {
    if (auctionActive) { message('Return to Regular draft to change the Pokémon pool.'); return; }
    if (!Object.hasOwn(modeLabels, mode) || state.mode === mode) return;
    invalidateMatch(); closePicker(false); closePersonnelMenus(); saveDraft();
    shared = false; state.mode = mode; applyBoard(teamPair()[state.team]);
    $('pokemon-search').value = '';
    saveDraft(); renderBoard(); renderCatalog();
    message(`${modeLabels[mode]} pool ready for both teams`);
  }

  function changeTeam(index) {
    if ((index !== 0 && index !== 1) || index === state.team) return;
    closePicker(false); closePersonnelMenus(); saveDraft();
    state.team = index; applyBoard(teamPair()[index]);
    $('pokemon-search').value = ''; lastFieldButton = null;
    saveDraft(); renderBoard(); renderCatalog();
  }

  function filledCount(board) { return slots(false, board).filter(s => byId.has(board.picks[s.key])).length; }
  function renderTeams() {
    const pair = teamPair();
    pair.forEach((board, index) => {
      const count = filledCount(index === state.team ? snapshot() : board);
      const button = document.querySelector(`[data-team="${index}"]`);
      button.setAttribute('aria-selected', String(index === state.team));
      button.tabIndex = index === state.team ? 0 : -1;
      button.setAttribute('aria-label', `${teamName(index)}, ${count} of 22 positions filled`);
      button.title = teamName(index);
      $('team-label-' + index).textContent = teamName(index);
      $('team-count-' + index).textContent = `${count}/22`;
    });
    const ready = (!auctionActive || window.DraftAuction.phase(auction.session) === 'complete') && pair.every((b, i) => filledCount(i === state.team ? snapshot() : b) === 22);
    $('simulate-match').setAttribute('aria-disabled', String(!ready));
    $('simulate-match').title = ready ? 'Play a four-quarter game' : 'Fill all 22 positions on both teams';
    document.querySelector('.board-panel').setAttribute('aria-label', `${teamName()} football draft board`);
    document.querySelector('.board-panel').setAttribute('aria-labelledby', `team-tab-${state.team}`);
  }

  function imagePath(p) { return p.image; }

  function renderPreferences() {
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
    $('formation-summary').textContent = `${teamName()} · ${{ gen1: 'Gen 1', gen2: 'Gen 2', both: 'Both' }[state.mode]} · ${state.offense} OFF · ${{ '3-4': '3–4', '4-3': '4–3', nickel: 'Nickel', dime: 'Dime' }[state.defense]} DEF`;
    $('picker-generation').textContent = { gen1: 'THE ORIGINAL 151', gen2: 'THE JOHTO 100', both: 'ALL 251 POKÉMON' }[state.mode];
    $('catalog-generation').textContent = { gen1: 'GENERATION I', gen2: 'GENERATION II', both: 'GENERATIONS I + II' }[state.mode];
    $('field-footer').textContent = { gen1: 'KANTO', gen2: 'JOHTO', both: 'KANTO + JOHTO' }[state.mode] + ' DRAFT LEAGUE';
    $('shared-notice').hidden = auctionActive || !sharedCopy;
    $('shared-label').textContent = shared ? 'Shared matchup · your teams are kept safe.' : 'Shared matchup saved separately';
    $('my-lineup').hidden = !shared;
    $('keep-shared').textContent = shared ? 'Keep matchup' : 'Open shared matchup';
    $('menu-toggle').classList.toggle('has-shared', !!sharedCopy);
    $('team-name').value = state.name;
    $('team-name').placeholder = 'Team ' + (state.team + 1);
  }

  function message(text) {
    $('live-message').textContent = text;
    $('live-message').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('live-message').classList.remove('show'), 2200);
  }

  function renderBoard() {
    renderPreferences();
    const current = slots();
    if (state.selected && !current.some(s => s.key === state.selected)) { state.selected = null; closePicker(false); }
    $('positions').replaceChildren(...current.map(s => {
      const p = byId.get(state.picks[s.key]);
      const button = document.createElement('button');
      button.className = `position ${s.side}${p ? '' : ' empty'}${state.selected === s.key ? ' selected' : ''}`;
      button.style.setProperty('--x', s.x + '%');
      button.style.setProperty('--y', s.y + '%');
      button.style.setProperty('--depth', s.scale);
      button.dataset.slot = s.key;
      const pending = auctionActive && window.DraftAuction.phase(auction.session) === 'placement' && auction.session.awards.at(-1).team === state.team;
      if (pending && !p) button.classList.add('auction-target');
      button.setAttribute('aria-label', `${s.side}: ${s.name}${p ? ', ' + p.name : ', empty'}. Select Pokémon.`);
      button.setAttribute('aria-pressed', String(state.selected === s.key));
      if (p) {
        const img = document.createElement('img');
        img.src = imagePath(p);
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
    renderTeams();
    renderSelection();
    updatePickedMarkers();
    renderAuction();
  }

  function renderSelection() {
    const selected = slots().find(s => s.key === state.selected);
    const picked = selected && byId.get(state.picks[selected.key]);
    $('selection-info').className = 'selection-info' + (selected ? ' is-selected' + (selected.side === 'defense' ? ' is-defense' : '') : '');
    $('selection-badge').textContent = selected ? selected.role : '＋';
    $('selection-title').textContent = selected ? selected.name : 'Select a position';
    $('selection-description').textContent = picked ? `Replacing ${picked.name}` : selected ? 'Choose your Pokémon' : 'Tap a player on the field to draft.';
    $('remove-pick').hidden = auctionActive || !picked;
    if (auctionActive) $('selection-description').textContent = selected ? 'Swap with a Pokémon you already own.' : 'Tap a player on the field to change its position.';
  }

  function normalize(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9♀♂]/g, ''); }

  function scoutingStats(p) {
    const inches = Math.round(p.heightMeters / 0.0254);
    const feet = Math.floor(inches / 12), remainder = inches % 12;
    const pounds = Math.round(p.weightKg * 2.2046226218 * 10) / 10;
    return {
      height: `${feet}′${remainder}″`, weight: String(pounds),
      forty: Number.isFinite(p.fortySeconds) ? p.fortySeconds.toFixed(2) : '—',
      description: `height ${feet} feet ${remainder} inches, weight ${pounds} pounds, estimated 40-yard dash ${p.fortySeconds ?? 'unavailable'} seconds`
    };
  }

  function renderCatalog() {
    const query = normalize($('pokemon-search').value);
    if (!catalogCards) {
      catalogCards = pokemon.map(p => {
      const button = document.createElement('button');
      button.className = 'pokemon-card';
      button.dataset.pokemon = p.id;
      const stats = scoutingStats(p);
      button.setAttribute('aria-label', `Draft ${p.name}, Pokédex ${p.id}, ${stats.description}`);
      button.title = `${p.name} · ${p.heightMeters} m · ${p.weightKg} kg · ${stats.forty}s estimated 40-yard dash`;
      const dex = document.createElement('span'); dex.className = 'dex-number'; dex.textContent = '#' + String(p.id).padStart(3, '0');
      const img = document.createElement('img'); img.src = imagePath(p); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
      const name = document.createElement('span'); name.className = 'card-name'; name.textContent = p.name;
      const type = document.createElement('span'); type.className = 'card-type'; type.textContent = p.types.join(' / ');
      const metrics = document.createElement('span'); metrics.className = 'card-stats'; metrics.setAttribute('aria-hidden', 'true');
      [['HT', stats.height], ['LB', stats.weight], ['EST 40', stats.forty + (stats.forty === '—' ? '' : 's')]].forEach(([label, value]) => {
        const metric = document.createElement('span');
        const heading = document.createElement('span'); heading.className = 'stat-label'; heading.textContent = label;
        const number = document.createElement('strong'); number.className = 'stat-value'; number.textContent = value;
        metric.append(heading, number); metrics.append(metric);
      });
      const roster = document.createElement('span'); roster.className = 'roster-mark'; roster.hidden = true;
      button.append(dex, roster, img, name, type, metrics);
      button.addEventListener('click', () => draftPokemon(p.id));
      return button;
      });
      emptyResult = document.createElement('p');
      emptyResult.className = 'empty-results';
      emptyResult.textContent = 'No Pokémon found. Try a name or Pokédex number.';
      $('pokemon-list').replaceChildren(...catalogCards, emptyResult);
    }
    let found = 0;
    const owned = auctionActive ? new Set(window.DraftAuction.owned(auction.session, state.team)) : null;
    catalogCards.forEach((card, index) => {
      const p = pokemon[index];
      const matches = allowed(p.id) && (!owned || owned.has(p.id)) && (normalize(p.name).includes(query) || String(p.id).includes(query) || String(p.id).padStart(3, '0').includes(query));
      card.hidden = !matches;
      const img = card.querySelector('img');
      if (img.getAttribute('src') !== imagePath(p)) img.src = imagePath(p);
      if (matches) found++;
    });
    emptyResult.hidden = found > 0;
    $('catalog-count').textContent = `${found} ${auctionActive ? 'owned Pokémon' : 'Pokémon'}`;
    emptyResult.textContent = auctionActive && !query ? 'Win a Pokémon in the auction to add it to your team.' : 'No Pokémon found. Try a name or Pokédex number.';
    $('pokemon-list').scrollTop = 0;
    updatePickedMarkers();
  }

  function updatePickedMarkers() {
    const visiblePicks = new Set(Object.values(state.picks));
    const unavailable = opponentPicks();
    const owned = auctionActive ? new Set(window.DraftAuction.owned(auction.session, state.team)) : null;
    document.querySelectorAll('.pokemon-card').forEach(card => {
      const picked = visiblePicks.has(Number(card.dataset.pokemon));
      card.classList.toggle('picked', picked);
      const retired = window.DraftCareers.isInducted(Number(card.dataset.pokemon));
      const claimed = unavailable.has(Number(card.dataset.pokemon));
      const unowned = owned && !owned.has(Number(card.dataset.pokemon));
      card.disabled = claimed || retired || unowned; card.classList.toggle('opponent-pick', claimed || retired);
      const roster = card.querySelector('.roster-mark');
      roster.hidden = !claimed && !retired; roster.textContent = retired ? 'Hall of Fame' : teamName(1 - state.team);
      card.setAttribute('aria-label', `${retired ? 'Retired, Hall of Fame' : claimed ? 'Unavailable, on ' + teamName(1 - state.team) : 'Draft'} ${byId.get(Number(card.dataset.pokemon)).name}, ${scoutingStats(byId.get(Number(card.dataset.pokemon))).description}`);
    });
  }

  function selectPosition(key) {
    if (!slots().some(s => s.key === key)) throw new Error('Unknown position.');
    if (auctionActive && window.DraftAuction.phase(auction.session) === 'placement') { placeAuctionPokemon(key); return; }
    setMenuOpen(false);
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
      document.querySelector('.draft-tools').inert = true;
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
    document.querySelector('.draft-tools').inert = false;
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

  function setMenuOpen(open, restoreFocus = false) {
    const menu = $('draft-menu');
    if (open === !menu.hidden) return;
    if (open) menuScrollY = window.scrollY;
    closePersonnelMenus();
    menu.hidden = !open;
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    $('menu-toggle').setAttribute('aria-label', open ? 'Close draft options' : 'Open draft options');
    if (open) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      if (restoreFocus || menu.contains(document.activeElement)) $('menu-toggle').focus({ preventScroll: true });
      window.scrollTo({ top: menuScrollY, behavior: 'instant' });
    }
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
    if (auctionActive) {
      if (window.DraftAuction.phase(auction.session) === 'placement') {
        const award = auction.session.awards.at(-1);
        if (id === award.pokemonId && state.team === award.team) return placeAuctionPokemon(state.selected);
        message('Place the Pokémon you just won before making another change.'); return { drafted: false };
      }
      if (!window.DraftAuction.owned(auction.session, state.team).includes(id)) { message('Only Pokémon won by this team can play on its auction roster.'); return { drafted: false }; }
    }
    if (!allowed(id)) throw new Error('Choose a Pokémon from the selected generation.');
    if (window.DraftCareers.isInducted(id)) { message(`${byId.get(id).name} is retired in the Hall of Fame`); return { drafted: false }; }
    if (opponentPicks().has(id)) { message(`${byId.get(id).name} is already on ${teamName(1 - state.team)}`); return { drafted: false }; }
    const selected = slots().find(s => s.key === state.selected);
    if (!selected) { message('Select a position on the field first.'); return { drafted: false }; }
    invalidateMatch();
    const origin = Object.keys(state.picks).find(key => state.picks[key] === id && key !== selected.key);
    const replaced = state.picks[selected.key];
    if (origin) {
      if (replaced) state.picks[origin] = replaced;
      else delete state.picks[origin];
    }
    state.picks[selected.key] = id;
    saveDraft();
    renderBoard();
    if (narrow.matches) closePicker();
    message(origin && replaced ? `${byId.get(id).name} and ${byId.get(replaced).name} swapped` : `${byId.get(id).name} drafted at ${selected.role}`);
    return { drafted: true, position: selected.key, pokemon: byId.get(id).name };
  }

  function setPersonnel(offense, defense) {
    if (!Object.hasOwn(offenseDetails, offense) || !Object.hasOwn(defenseDetails, defense)) throw new Error('Unknown personnel group.');
    invalidateMatch();
    const previous = { ...state.picks };
    state.offense = offense; state.defense = defense;
    if (auctionActive) {
      const active = slots(false); const keys = new Set(active.map(s => s.key));
      state.picks = Object.fromEntries(Object.entries(previous).filter(([key]) => keys.has(key)));
      const displaced = { offense: [], defense: [] };
      Object.entries(previous).filter(([key]) => !keys.has(key)).forEach(([key, id]) => displaced[key.startsWith('o_') ? 'offense' : 'defense'].push(id));
      active.filter(s => !state.picks[s.key]).forEach(s => { if (displaced[s.side].length) state.picks[s.key] = displaced[s.side].shift(); });
    }
    saveDraft();
    renderBoard();
    return readBoard();
  }

  function sampleLineup() {
    if (auctionActive) { message('Auction teams use only the Pokémon they win.'); return; }
    invalidateMatch();
    state.offense = '21'; state.defense = '3-4'; state.selected = null; state.picks = {};
    const used = opponentPicks();
    const wanted = state.mode === 'gen2' || (state.mode === 'both' && state.team === 1) ? johtoSample : samplePicks;
    const current = slots(false).sort((a, b) => (a.role === 'QB' ? -1 : b.role === 'QB' ? 1 : a.side === b.side ? 0 : a.side === 'offense' ? -1 : 1));
    current.forEach(s => {
      let id = wanted[s.key];
      if (!allowed(id) || used.has(id) || window.DraftCareers.isInducted(id)) {
        const choices = pokemon.filter(p => allowed(p.id) && !used.has(p.id) && !window.DraftCareers.isInducted(p.id));
        choices.sort((a, b) => window.DraftRatings.rate(b.id, s.role) - window.DraftRatings.rate(a.id, s.role));
        id = choices[0]?.id;
      }
      if (id) { state.picks[s.key] = id; used.add(id); }
    });
    saveDraft(); renderBoard();
  }

  function readBoard() {
    return { team: teamName(), teamIndex: state.team, generation: state.mode, art: state.art, offense: state.offense, defense: state.defense, positions: slots().map(s => ({ key: s.key, role: s.role, side: s.side, pokemon: byId.get(state.picks[s.key])?.name || null, pokemonId: state.picks[s.key] || null })) };
  }

  function matchTeams() {
    saveDraft();
    return teamPair().map((board, i) => ({ name: teamName(i), positions: slots(false, board).map(s => ({ key: s.key, role: s.role, side: s.side, pokemonId: board.picks[s.key] || null, pokemon: byId.get(board.picks[s.key]) || null })) }));
  }

  function simulateMatch() {
    if (auctionActive && window.DraftAuction.phase(auction.session) !== 'complete') { message('Finish all 44 auction picks before simulating the match.'); return null; }
    const teams = matchTeams();
    if (teams.some(t => t.positions.some(p => p.pokemonId && window.DraftCareers.isInducted(p.pokemonId)))) {
      hallChanged(null, true); message('Retired Pokémon have left the draft. Fill the open positions.'); return null;
    }
    const missing = teams.map(t => t.positions.filter(p => !p.pokemonId).length);
    if (missing.some(Boolean)) {
      message(missing.map((n, i) => n ? `${teamName(i)} needs ${n} more ${n === 1 ? 'pick' : 'picks'}` : '').filter(Boolean).join(' · '));
      return null;
    }
    let result;
    try { result = window.DraftMatch.simulate(...teams); }
    catch (_) { message('The match could not run. Please reload and try again.'); return null; }
    window.DraftCareers.recordMatch(result);
    renderMatch(result);
    setMenuOpen(false, true);
    if (!$('match-dialog').open) $('match-dialog').showModal();
    return result;
  }

  function renderMatch(result) { window.DraftResults.render(result); }

  async function prepareExport() {
    setMenuOpen(false, true);
    const run = ++exportRun;
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    exportUrl = null; exportFile = null;
    $('export-preview').hidden = true;
    $('save-image').hidden = true;
    $('share-image').hidden = true;
    $('share-image').disabled = true;
    $('image-hint').hidden = true;
    $('export-status').textContent = 'Preparing your image…';
    $('export-dialog').showModal();
    const board = {
      generation: modeLabels[state.mode], teamName: teamName(), teamIndex: state.team, art: state.art,
      offense: offenseLabels[state.offense] + ' · ' + offenseDetails[state.offense],
      defense: defenseLabels[state.defense] + ' · ' + defenseDetails[state.defense],
      positions: slots(false).map(s => { const p = byId.get(state.picks[s.key]); return { ...s, pokemon: p || null, stats: p ? scoutingStats(p) : null }; })
    };
    try {
      const blob = await window.renderDraftImage(board);
      if (run !== exportRun || !$('export-dialog').open) return;
      const fileName = board.teamName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `team-${board.teamIndex + 1}`;
      exportFile = new File([blob], `pokemon-draft-${fileName}.png`, { type: 'image/png' });
      exportUrl = URL.createObjectURL(blob);
      $('export-preview').src = exportUrl;
      $('export-preview').hidden = false;
      const save = $('save-image');
      save.href = exportUrl;
      save.download = exportFile.name;
      save.hidden = false;
      let canShare = false;
      try { canShare = !!navigator.canShare?.({ files: [exportFile] }); } catch (_) {}
      $('share-image').hidden = !canShare;
      $('share-image').disabled = !canShare;
      $('image-hint').hidden = canShare;
      $('export-status').textContent = 'Full-resolution PNG · ready to share';
    } catch (_) {
      if (run === exportRun) $('export-status').textContent = 'The image could not be prepared. Please close this window and try again.';
    }
  }

  function openLinkDialog() {
    setMenuOpen(false, true);
    $('lineup-url').value = shareUrl();
    $('link-status').textContent = '';
    $('send-link').hidden = !navigator.share;
    $('link-dialog').showModal();
  }


  function saveAuction() {
    try {
      if (!auction) localStorage.removeItem(auctionStorageKey);
      else localStorage.setItem(auctionStorageKey, JSON.stringify({ v: 1, ...auction, active: auctionActive, team: state.team, regularView }));
      if (auctionActive) { $('save-status').textContent = 'Autosaved'; $('save-status').title = 'Auction bids, budgets and both teams saved on this device'; }
    } catch (_) {
      if (auctionActive) { $('save-status').textContent = 'Unsaved'; $('save-status').title = 'Browser storage is unavailable. Keep this tab open to finish the auction.'; }
    }
  }

  function loadAuction() {
    try {
      const raw = localStorage.getItem(auctionStorageKey);
      const saved = raw && raw.length < 18000 ? JSON.parse(raw) : null;
      if (!saved || saved.v !== 1) return;
      const session = window.DraftAuction.validate(saved.session);
      const teams = session && validatePair(saved.teams, session.mode);
      if (!teams) throw new Error('Invalid auction');
      const placed = session.awards.slice(0, session.placed);
      teams.forEach((board, index) => {
        const active = new Set(slots(false, board).map(s => s.key));
        const owned = placed.filter(a => a.team === index).map(a => a.pokemonId);
        const ids = Object.values(board.picks);
        if (Object.keys(board.picks).some(key => !active.has(key)) || ids.length !== owned.length || ids.some(id => !owned.includes(id))) throw new Error('Invalid auction roster');
      });
      auction = { session, teams };
      regularView = saved.regularView && Object.hasOwn(modeLabels, saved.regularView.mode) ? { mode: saved.regularView.mode, team: saved.regularView.team === 1 ? 1 : 0, shared: !!saved.regularView.shared && !!sharedCopy } : { mode: state.mode, team: state.team, shared };
      if (!reconcileAuctionRetirees()) return;
      if (saved.active && !incomingSharedLink) {
        auctionActive = true; state.mode = session.mode; state.team = saved.team === 1 ? 1 : 0;
        applyBoard(auction.teams[state.team]);
      }
      saveAuction();
    } catch (_) { auction = null; auctionActive = false; saveAuction(); message('The saved auction could not be restored. Your regular drafts are ready.'); }
  }

  function reconcileAuctionRetirees() {
    if (!auction) return false;
    const currentBefore = window.DraftAuction.current(auction.session);
    const retired = id => window.DraftCareers.isInducted(id);
    const awardedRetiree = auction.session.awards.some(a => retired(a.pokemonId));
    const replacements = auctionReplacementPool();
    const upcoming = auction.session.lots.slice(auction.session.awards.length).filter(retired);
    if (awardedRetiree || upcoming.length > replacements.length) {
      if (auctionActive) exitAuction(false);
      auction = null; saveAuction();
      message('An auction player retired. Your regular drafts are ready; start a new auction.'); return false;
    }
    for (let i = auction.session.awards.length; i < 44; i++) {
      if (retired(auction.session.lots[i])) {
        const index = Math.floor(Math.random() * replacements.length);
        auction.session.lots[i] = replacements.splice(index, 1)[0];
      }
    }
    if (upcoming.length) saveAuction();
    if (currentBefore !== window.DraftAuction.current(auction.session) && $('auction-dialog').open) {
      openAuctionRound();
      message('This Pokémon retired. A new prospect is ready for fresh bids.');
    }
    return true;
  }

  function auctionReplacementPool() {
    if (!auction) return [];
    const excluded = new Set([...auction.session.lots, ...(auction.session.skipped || [])]);
    return pokemon.filter(p => allowed(p.id, auction.session.mode) && !window.DraftCareers.isInducted(p.id) && !excluded.has(p.id)).map(p => p.id);
  }

  function enterAuction() {
    if (!auction || !reconcileAuctionRetirees()) { openAuctionSetup(); return; }
    if (!auctionActive) {
      saveDraft(); regularView = { mode: state.mode, team: state.team, shared };
      auctionActive = true; state.mode = auction.session.mode; state.team = 0;
      applyBoard(auction.teams[0]);
    }
    closePicker(false); invalidateMatch(); setMenuOpen(false, true);
    saveDraft(); renderBoard(); renderCatalog(); openAuctionRound();
  }

  function exitAuction(announce = true) {
    if (!auctionActive) return;
    saveDraft(); closePicker(false); invalidateMatch(); $('auction-dialog').close();
    auctionActive = false;
    state.mode = regularView?.mode || 'gen1'; state.team = regularView?.team === 1 ? 1 : 0;
    shared = !!regularView?.shared && !!sharedCopy;
    if (shared) state.mode = sharedCopy.mode;
    applyBoard(teamPair()[state.team]); saveDraft(); saveAuction(); renderBoard(); renderCatalog();
    setMenuOpen(false, true);
    if (announce) message('Regular drafts restored. Your auction is saved separately.');
  }

  function openAuctionSetup() {
    closePicker(false); setMenuOpen(false, true); saveDraft();
    [0, 1].forEach(i => { $('auction-name-' + i).value = teamName(i); });
    $('auction-pool').value = state.mode;
    $('auction-setup-note').textContent = auction ? 'Starting a new auction replaces your saved auction. Your regular drafts and careers are kept.' : 'Your regular drafts are kept separately. Hall of Fame Pokémon stay retired.';
    $('auction-setup-error').hidden = true;
    $('auction-setup-dialog').showModal();
    // Focus a button so Safari does not cover the setup with its keyboard.
    $('auction-create-button').focus({ preventScroll: true });
  }

  function startAuction() {
    const mode = $('auction-pool').value;
    let session;
    try { session = window.DraftAuction.create(pokemon.filter(p => allowed(p.id, mode) && !window.DraftCareers.isInducted(p.id)).map(p => p.id), { mode }); }
    catch (error) { $('auction-setup-error').textContent = error.message; $('auction-setup-error').hidden = false; return; }
    saveDraft();
    const teams = teamPair().map((board, i) => ({ name: cleanName($('auction-name-' + i).value), offense: board.offense, defense: board.defense, picks: {} }));
    if (!auctionActive) regularView = { mode: state.mode, team: state.team, shared };
    auction = { session, teams }; auctionActive = true;
    state.mode = mode; state.team = 0; applyBoard(teams[0]);
    $('auction-setup-dialog').close(); invalidateMatch(); saveDraft(); renderBoard(); renderCatalog(); openAuctionRound();
  }

  function renderAuction() {
    document.body.classList.toggle('auction-active', auctionActive);
    $('auction-strip').hidden = !auctionActive;
    $('auction-exit-button').hidden = !auctionActive;
    $('auction-new-button').hidden = !auction;
    $('auction-start-button').textContent = auctionActive ? 'Auction room' : auction ? 'Resume auction' : 'Auction draft';
    document.querySelectorAll('[data-mode]').forEach(b => { b.disabled = auctionActive; b.title = auctionActive ? 'Return to Regular draft to change the pool' : ''; });
    ['sample-button', 'clear-button'].forEach(id => { $(id).disabled = auctionActive; $(id).title = auctionActive ? 'Auction players belong to their winning team. Use New auction to restart.' : ''; });
    if (!auctionActive) return;
    const remaining = window.DraftAuction.budgets(auction.session), phase = window.DraftAuction.phase(auction.session);
    if (phase === 'bidding') renderAuctionSkip();
    $('auction-strip').dataset.phase = phase;
    [0, 1].forEach(i => { $('auction-team-' + i).textContent = teamName(i); $('auction-budget-' + i).textContent = '$' + remaining[i].toLocaleString('en-US'); });
    $('auction-resume-button').hidden = phase === 'complete';
    $('auction-resume-button').textContent = phase === 'placement' ? 'Place pick' : auction.session.placed ? 'Next Pokémon' : 'Open bidding';
    if (phase === 'placement') {
      const award = auction.session.awards.at(-1);
      $('auction-status').textContent = `${byId.get(award.pokemonId).name} → ${teamName(award.team)} for $${award.amount}. Tap an empty position.`;
    } else $('auction-status').textContent = phase === 'complete' ? '44/44 drafted. Swap positions if you like, then Simulate Match.' : `Pokémon ${auction.session.placed + 1} of 44 · ready for bids`;
  }

  function openAuctionRound() {
    if (!auctionActive) return;
    setMenuOpen(false, true); closePicker(false);
    if (!reconcileAuctionRetirees()) return;
    const phase = window.DraftAuction.phase(auction.session);
    if (phase === 'complete') { message('Both auction teams are ready to simulate.'); return; }
    if (phase === 'placement') {
      const award = auction.session.awards.at(-1);
      changeTeam(award.team);
      message(`Tap an empty position for ${byId.get(award.pokemonId).name}`);
      const target = document.querySelector('.position.empty'); target?.focus({ preventScroll: true });
      return;
    }
    const p = byId.get(window.DraftAuction.current(auction.session)), stats = scoutingStats(p);
    $('auction-round').textContent = `POKÉMON ${auction.session.placed + 1} OF 44`;
    $('auction-pokemon').textContent = p.name; $('auction-image').src = p.image; $('auction-image').alt = p.name;
    $('auction-dex').textContent = '#' + String(p.id).padStart(3, '0'); $('auction-types').textContent = p.types.join(' / ');
    $('auction-stats').textContent = `${stats.height} · ${stats.weight} lb · ${stats.forty}s est. 40`;
    const budgets = window.DraftAuction.budgets(auction.session), counts = window.DraftAuction.counts(auction.session);
    [0, 1].forEach(i => {
      $('auction-bid-label-' + i).textContent = teamName(i) + ' bid';
      $('auction-bid-detail-' + i).textContent = `${counts[i]}/22 · $${budgets[i].toLocaleString('en-US')} left${counts[i] === 22 ? ' · Roster full' : ''}`;
      const input = $('auction-bid-' + i); input.value = '0'; input.disabled = counts[i] === 22;
      input.setAttribute('aria-invalid', 'false');
    });
    $('auction-bid-error').hidden = true;
    renderAuctionSkip();
    if (!$('auction-dialog').open) $('auction-dialog').showModal();
    $('auction-bid-button').focus({ preventScroll: true }); syncAuctionViewport();
  }

  function renderAuctionSkip() {
    const canSkip = auctionReplacementPool().length > 0;
    $('auction-skip-button').disabled = !canSkip;
    if (canSkip) $('auction-skip-button').removeAttribute('aria-describedby');
    else $('auction-skip-button').setAttribute('aria-describedby', 'auction-skip-note');
    $('auction-skip-note').hidden = canSkip;
  }

  function skipAuctionPokemon() {
    if (!auctionActive || !$('auction-dialog').open || window.DraftAuction.phase(auction.session) !== 'bidding') return;
    const current = window.DraftAuction.current(auction.session);
    if (!reconcileAuctionRetirees() || current !== window.DraftAuction.current(auction.session)) return;
    try {
      const pool = pokemon.filter(p => allowed(p.id, auction.session.mode) && !window.DraftCareers.isInducted(p.id)).map(p => p.id);
      auction.session = window.DraftAuction.skip(auction.session, pool);
    } catch (error) {
      $('auction-bid-error').textContent = error.message; $('auction-bid-error').hidden = false; return;
    }
    saveDraft(); renderAuction(); openAuctionRound();
    document.querySelector('.auction-dialog-body').scrollTop = 0;
  }

  function resolveAuctionBid() {
    if (!auctionActive || window.DraftAuction.phase(auction.session) !== 'bidding') return;
    const budgets = window.DraftAuction.budgets(auction.session), counts = window.DraftAuction.counts(auction.session), bids = [];
    let invalid = null;
    [0, 1].forEach(i => {
      const input = $('auction-bid-' + i), raw = input.value.trim();
      const valid = counts[i] === 22 || (/^\d{1,4}$/.test(raw) && Number(raw) <= budgets[i]);
      input.setAttribute('aria-invalid', String(!valid));
      if (!valid && invalid === null) invalid = i;
      bids.push(counts[i] === 22 ? 0 : Number(raw));
    });
    if (invalid !== null) {
      $('auction-bid-error').textContent = `${teamName(invalid)}: enter a whole-dollar bid from $0 to $${budgets[invalid]}.`;
      $('auction-bid-error').hidden = false; $('auction-bid-' + invalid).focus(); return;
    }
    const biddingOn = window.DraftAuction.current(auction.session);
    if (!reconcileAuctionRetirees()) { $('auction-dialog').close(); return; }
    if (biddingOn !== window.DraftAuction.current(auction.session)) return;
    const { session, award } = window.DraftAuction.bid(auction.session, bids);
    auction.session = session; saveDraft(); $('auction-dialog').close();
    changeTeam(award.team); state.selected = null; saveDraft(); renderBoard(); renderCatalog();
    message(`${teamName(award.team)} wins ${byId.get(award.pokemonId).name}${award.tied ? ' in the tiebreak' : ''} for $${award.amount}`);
  }

  function placeAuctionPokemon(key) {
    const award = auction.session.awards.at(-1), selected = slots().find(s => s.key === key);
    if (state.team !== award.team) { changeTeam(award.team); message(`Place ${byId.get(award.pokemonId).name} on ${teamName(award.team)}’s board.`); return { drafted: false }; }
    if (!selected || state.picks[key]) { message('Choose an empty position for your new Pokémon.'); return { drafted: false }; }
    invalidateMatch(); state.picks[key] = award.pokemonId; state.selected = null;
    auction.session = window.DraftAuction.place(auction.session); saveDraft(); renderBoard(); renderCatalog();
    message(`${byId.get(award.pokemonId).name} placed at ${selected.role}`);
    return { drafted: true, position: key, pokemon: byId.get(award.pokemonId).name };
  }

  function syncAuctionViewport() {
    const dialog = $('auction-dialog'), viewport = window.visualViewport;
    const height = viewport?.height || innerHeight;
    const keyboard = dialog.open && document.activeElement?.matches('#auction-bid-0, #auction-bid-1') && height < innerHeight * .8;
    dialog.style.setProperty('--auction-top', `${(viewport?.offsetTop || 0) + 8}px`);
    dialog.style.setProperty('--auction-height', `${Math.max(0, height - 16)}px`);
    dialog.classList.toggle('keyboard-open', !!keyboard);
    $('auction-title').textContent = keyboard ? $('auction-pokemon').textContent : 'Place your bids';
  }

  $('auction-start-button').addEventListener('click', () => auction ? enterAuction() : openAuctionSetup());
  $('auction-exit-button').addEventListener('click', () => exitAuction());
  $('auction-new-button').addEventListener('click', openAuctionSetup);
  $('auction-resume-button').addEventListener('click', openAuctionRound);
  $('auction-setup-form').addEventListener('submit', event => { event.preventDefault(); startAuction(); });
  $('auction-bid-form').addEventListener('submit', event => { event.preventDefault(); resolveAuctionBid(); });
  $('auction-skip-button').addEventListener('click', skipAuctionPokemon);
  [0, 1].forEach(i => {
    const input = $('auction-bid-' + i);
    input.addEventListener('focus', () => { input.select(); syncAuctionViewport(); });
    input.addEventListener('blur', () => requestAnimationFrame(syncAuctionViewport));
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (i === 0 && !$('auction-bid-1').disabled) $('auction-bid-1').focus();
      else { input.blur(); $('auction-bid-button').focus(); }
    });
    input.addEventListener('input', () => { input.setAttribute('aria-invalid', 'false'); $('auction-bid-error').hidden = true; });
  });
  window.visualViewport?.addEventListener('resize', syncAuctionViewport);
  window.visualViewport?.addEventListener('scroll', syncAuctionViewport);
  window.addEventListener('resize', syncAuctionViewport);
  $('auction-dialog').addEventListener('close', syncAuctionViewport);

  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => changeMode(button.dataset.mode)));
  function renameTeam() {
    state.name = cleanName($('team-name').value); invalidateMatch(); saveDraft(); renderBoard();
    message(`${teamName()} is ready`);
  }
  $('save-team-name').addEventListener('click', renameTeam);
  document.querySelector('.team-name-form').addEventListener('submit', e => { e.preventDefault(); renameTeam(); });
  $('team-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); renameTeam(); } });
  $('hall-button').addEventListener('click', () => { setMenuOpen(false, true); window.DraftHall.open(); });
  $('menu-toggle').addEventListener('click', () => setMenuOpen($('draft-menu').hidden, true));
  document.addEventListener('click', event => {
    if (!event.target.closest('#draft-menu, #menu-toggle, dialog')) setMenuOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || $('draft-menu').hidden || document.querySelector('dialog[open]')) return;
    if (['offense', 'defense'].some(side => !$(side + '-options').hidden)) closePersonnelMenus(true);
    else setMenuOpen(false, true);
    event.preventDefault();
  });
  document.querySelectorAll('[data-team]').forEach(button => button.addEventListener('click', () => changeTeam(Number(button.dataset.team))));
  $('team-tabs').addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); changeTeam(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - state.team);
      document.querySelector(`[data-team="${state.team}"]`).focus();
    }
  });
  $('simulate-match').addEventListener('click', simulateMatch);
  $('rerun-match').addEventListener('click', simulateMatch);
  $('keep-shared').addEventListener('click', () => {
    if (auctionActive) exitAuction(false);
    if (shared) {
      saveDraft();
      [boards[state.mode], opponents[state.mode]] = sharedCopy.teams.map(copyBoard);
      shared = false; sharedCopy = null; saveDraft(); renderPreferences(); message('Both teams are now saved as your matchup');
    } else if (sharedCopy) {
      saveDraft(); state.mode = sharedCopy.mode; state.team = sharedCopy.team; shared = true;
      applyBoard(sharedCopy.teams[state.team]); saveDraft(); renderBoard(); renderCatalog();
    }
  });
  $('my-lineup').addEventListener('click', () => {
    if (auctionActive) exitAuction(false);
    invalidateMatch(); saveDraft(); shared = false; applyBoard(teamPair()[state.team]); saveDraft(); renderBoard(); renderCatalog(); message('Your original teams are ready');
  });
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#draft=')) return;
    closePicker(false); closePersonnelMenus(); importLink(); saveDraft(); renderBoard(); renderCatalog();
  });
  $('export-button').addEventListener('click', prepareExport);
  $('stats-help').addEventListener('click', () => { setMenuOpen(false, true); $('stats-dialog').showModal(); });
  $('export-dialog').addEventListener('close', () => { exportRun++; });
  $('share-image').addEventListener('click', () => {
    if (!exportFile || !navigator.share) return;
    // PNG is already prepared: this fresh tap retains Safari's share activation.
    navigator.share({ files: [exportFile], title: 'My Pokémon Draft League lineup' }).catch(error => {
      if (error.name !== 'AbortError') {
        $('export-status').textContent = 'Sharing is unavailable here. Use Save image instead.';
        $('image-hint').hidden = false;
      }
    });
  });
  $('share-link').addEventListener('click', openLinkDialog);
  $('copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('lineup-url').value);
      $('link-status').textContent = 'Link copied. Paste it into a text message.';
    } catch (_) {
      $('lineup-url').focus(); $('lineup-url').select();
      $('link-status').textContent = 'Touch and hold the selected link to copy it.';
    }
  });
  $('send-link').addEventListener('click', () => {
    navigator.share({ title: 'My Pokémon Draft League matchup', url: $('lineup-url').value }).catch(error => {
      if (error.name !== 'AbortError') $('link-status').textContent = 'Use Copy link to send your matchup.';
    });
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  $('room-button').addEventListener('click', () => {
    setMenuOpen(false, true);
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    $('safari-help').hidden = !!standalone;
    $('standalone-help').hidden = !standalone;
    $('fullscreen-button').hidden = !document.fullscreenEnabled || !!standalone;
    $('fullscreen-button').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
    $('room-dialog').showModal();
  });
  $('fullscreen-button').addEventListener('click', async () => {
    try {
      $('room-dialog').close();
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) { message('Use your browser’s screen controls for more room.'); }
  });

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
    if (auctionActive) return;
    const selected = slots().find(s => s.key === state.selected);
    if (!selected) return;
    invalidateMatch();
    delete state.picks[selected.key]; saveDraft(); renderBoard();
    if (narrow.matches) closePicker();
    message(`${selected.role} is ready for a new pick`);
  });
  $('clear-button').addEventListener('click', () => { if (auctionActive) return; setMenuOpen(false, true); $('clear-dialog').returnValue = ''; $('clear-dialog').showModal(); });
  $('clear-dialog').addEventListener('close', () => {
    if (!auctionActive && $('clear-dialog').returnValue === 'clear') { invalidateMatch(); state.picks = {}; state.selected = null; saveDraft(); renderBoard(); message('Board cleared. Make your first pick.'); }
  });
  $('sample-button').addEventListener('click', () => { if (auctionActive) return; setMenuOpen(false, true); sampleLineup(); message('Example lineup loaded'); });
  document.addEventListener('keydown', e => {
    if (!$('picker').classList.contains('open') || document.querySelector('dialog[open]')) return;
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

  window.DraftField.mount($('field-surface'));
  window.DraftHall.configure({ onChange: hallChanged });
  initializePersonnelMenus();
  loadDraft();
  loadAuction();
  renderBoard();
  renderCatalog();
  window.addEventListener('storage', event => {
    if (event.key !== 'pokemon-draft-careers-v1') return;
    window.DraftCareers.refresh?.(); hallChanged(null, true); window.DraftHall.refresh();
  });
  if (!pokemon.length) message('Pokémon artwork could not load. Please reload the page.');

  const context = document.modelContext;
  if (context?.registerTool) {
    const lifecycle = new AbortController();
    const tools = [
      { name: 'select_draft_team', title: 'Select draft team', description: 'Switch between the two teams sharing the current Pokémon pool.', inputSchema: { type: 'object', properties: { teamIndex: { type: 'integer', enum: [0, 1] } }, required: ['teamIndex'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => { if (!input || ![0, 1].includes(input.teamIndex)) throw new Error('Choose team 0 or 1'); changeTeam(input.teamIndex); return readBoard(); } },
      { name: 'read_draft_board', title: 'Read draft board', description: 'Read offense and defense personnel and all active draft positions.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => readBoard() },
      { name: 'configure_draft_personnel', title: 'Set personnel', description: 'Set offense and defense personnel, preserving picks in shared positions.', inputSchema: { type: 'object', properties: { offense: { type: 'string', enum: Object.keys(offenseDetails) }, defense: { type: 'string', enum: Object.keys(defenseDetails) } }, required: ['offense', 'defense'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => setPersonnel(input.offense, input.defense) },
      { name: 'draft_pokemon_to_position', title: 'Draft Pokémon', description: 'Place a Pokémon from the selected generation into an active position. Players already drafted swap positions.', inputSchema: { type: 'object', properties: { position: { type: 'string' }, pokemonId: { type: 'integer', minimum: 1, maximum: 251 } }, required: ['position', 'pokemonId'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => {
        if (!input || !slots().some(s => s.key === input.position) || !allowed(input.pokemonId)) throw new Error('Use an active position key and a Pokémon from the selected generation.');
        state.selected = input.position;
        return draftPokemon(input.pokemonId);
      } }
    ];
    tools.forEach(tool => { try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch (_) {} });
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
})();
