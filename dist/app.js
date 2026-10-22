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
  let onlineSnapshot = null, localViewBackup = null, remoteBoardKey = '', remoteLeagueKey = '', remoteMatchId = null;
  const online = () => Boolean(onlineSnapshot);
  const editable = () => !online() || window.DraftOnline.isHost();
  const auctionPhase = () => online() ? onlineSnapshot.lobby.phase : window.DraftAuction.phase(auction.session);
  const auctionCurrent = () => online() ? onlineSnapshot.lobby.auction?.currentPokemonId : window.DraftAuction.current(auction.session);
  const auctionBudgets = () => online() ? onlineSnapshot.lobby.auction?.budgets || Array(teamPair().length).fill(1000) : window.DraftAuction.budgets(auction.session);
  const auctionCounts = () => online() ? onlineSnapshot.lobby.auction?.counts || Array(teamPair().length).fill(0) : window.DraftAuction.counts(auction.session);
  const auctionOwned = index => online() ? onlineSnapshot.lobby.auction?.owned[index] || [] : window.DraftAuction.owned(auction.session, index);
  const auctionTotal = () => online() ? onlineSnapshot.lobby.auction?.total || teamPair().length * 23 : auction.session.lots.length;
  const rosterSize = () => auctionActive && !online() ? auction.session.rosterSize || 22 : 23;
  async function sendOnline(type, payload) {
    if (!editable()) { message('The host controls the draft. You can browse teams and chat.'); return null; }
    if (window.DraftOnline.pending()) return null;
    if (type === 'simulate') { $('simulate-match').disabled = true; $('rerun-match').disabled = true; }
    try { return await window.DraftOnline.request(type, payload); }
    catch (error) { message(error.message || 'That action could not be saved. Try again.'); return null; }
    finally { if (type === 'simulate') { $('rerun-match').disabled = false; renderTeams(); } }
  }
  let lastMatchTeams = null, matchupAction = 'simulate';
  const modeLabels = { gen1: 'Gen 1', gen2: 'Gen 2', gen3: 'Gen 3', both: 'All generations' };
  const slotKeys = ['d_fs', 'd_ss', 'd_cb1', 'd_cb2', 'd_de1', 'd_dt1', 'd_dt2', 'd_de2', 'd_lb1', 'd_lb2', 'd_lb3', 'd_lb4', 'd_nb', 'd_db6', 'o_lt', 'o_lg', 'o_c', 'o_rg', 'o_rt', 'o_qb', 'o_rb1', 'o_wr1', 'o_wr2', 'o_wr3', 'o_wr4', 'o_te1', 'o_te2', 'o_rb2', 's_k'];
  const samplePicks = { d_fs: 82, d_ss: 105, d_cb1: 123, d_cb2: 141, d_de1: 68, d_dt1: 143, d_de2: 67, d_lb1: 24, d_lb2: 62, d_lb3: 57, d_lb4: 28, o_lt: 9, o_lg: 76, o_c: 3, o_rg: 89, o_rt: 115, o_qb: 94, o_rb1: 112, o_wr1: 135, o_wr2: 85, o_te1: 34, o_rb2: 128, s_k: 106 };
  const johtoSample = { d_fs: 200, d_ss: 196, d_cb1: 212, d_cb2: 227, d_de1: 214, d_dt1: 205, d_de2: 237, d_lb1: 166, d_lb2: 195, d_lb3: 207, d_lb4: 221, o_lt: 160, o_lg: 208, o_c: 154, o_rg: 242, o_rt: 217, o_qb: 199, o_rb1: 232, o_wr1: 181, o_wr2: 169, o_te1: 248, o_rb2: 241, s_k: 237 };
  let boards = Object.fromEntries(Object.keys(modeLabels).map(mode => [mode, defaultBoard(mode)]));
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
  const offenseDetails = { '10': '0 TE · 1 RB · 4 WR', '11': '1 TE · 1 RB · 3 WR', '12': '2 TE · 1 RB · 2 WR', '21': '1 TE · 2 RB · 2 WR', '22': '2 TE · 2 RB · 1 WR' };
  const defenseDetails = { '3-4': '3 DL · 4 LB · 4 DB', '4-3': '4 DL · 3 LB · 4 DB', nickel: '4 DL · 2 LB · 5 DB', dime: '4 DL · 1 LB · 6 DB' };
  const offenseLabels = { '10': '10 personnel', '11': '11 personnel', '12': '12 personnel', '21': '21 personnel', '22': '22 personnel' };
  const defenseLabels = { '3-4': '3–4 defense', '4-3': '4–3 defense', nickel: 'Nickel · 4–2–5', dime: 'Dime · 4–1–6' };
  const roleNames = { K: 'Kicker', LT: 'Left tackle', LG: 'Left guard', C: 'Center', RG: 'Right guard', RT: 'Right tackle', QB: 'Quarterback', HB: 'Halfback', FB: 'Fullback', WR: 'Wide receiver', TE: 'Tight end', FS: 'Free safety', SS: 'Strong safety', CB: 'Cornerback', DE: 'Defensive end', NT: 'Nose tackle', DT: 'Defensive tackle', ILB: 'Inside linebacker', OLB: 'Outside linebacker', MLB: 'Middle linebacker', WLB: 'Weakside linebacker', SLB: 'Strongside linebacker', LB: 'Linebacker', NB: 'Nickel back', DB: 'Defensive back' };
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
    const special = rosterSize() === 23 ? [slot('s_k', 'K', 85, 92, 'special')] : [];
    return [...defense, ...offense, ...special].map(s => ({ ...s, ...window.DraftField.project(s.x, s.y), scale: .9 + .12 * s.y / 100 }));
  }

  function cleanName(value) { return Array.from((typeof value === 'string' ? value : '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 24).join(''); }
  const teamName = (index = state.team) => (index === state.team ? state.name : teamPair()[index].name) || 'Team ' + (index + 1);
  function emptyBoard() { return { name: '', offense: '21', defense: '3-4', picks: {} }; }
  const copyBoard = b => ({ name: cleanName(b.name), offense: b.offense, defense: b.defense, picks: { ...b.picks } });
  function teamPair() { return online() ? onlineSnapshot.lobby.teams : auctionActive ? auction.teams : shared ? sharedCopy.teams : [boards[state.mode], opponents[state.mode]]; }
  function opponentPicks() { return new Set(teamPair().flatMap((board, i) => i === state.team ? [] : Object.values(board.picks))); }
  function claimedTeam(id) { return teamPair().findIndex((board, i) => i !== state.team && Object.values(board.picks).includes(id)); }
  const auctionTeamIndexes = () => Array.from({ length: teamPair().length }, (_, i) => i);

  function defaultBoard(mode) {
    return { name: '', offense: '21', defense: '3-4', picks: mode === 'gen2' || mode === 'gen3' ? {} : { ...samplePicks } };
  }

  function allowed(id, mode = state.mode) {
    return Number.isInteger(id) && byId.has(id) && (mode === 'both' || (mode === 'gen1' ? id <= 151 : mode === 'gen2' ? id >= 152 && id <= 251 : mode === 'gen3' && id >= 252 && id <= 386));
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
  function applyBoard(board) { if (!online()) removeRetirees(board); state.name = cleanName(board.name); state.offense = board.offense; state.defense = board.defense; state.picks = { ...board.picks }; state.selected = null; }

  function hallChanged(id, inducted) {
    if (online()) { renderCatalog(); window.DraftOnline.refreshNeeds(); return; }
    invalidateMatch(); closePicker(false); saveDraft();
    if (inducted) reconcileAuctionRetirees();
    if (inducted) {
      Object.values(boards).forEach(removeRetirees); Object.values(opponents).forEach(removeRetirees);
      sharedCopy?.teams.forEach(removeRetirees); removeRetirees(state);
      if (auctionActive) persistRegularDraft(regularView, false);
    }
    saveDraft(); renderBoard(); renderCatalog();
  }

  function validatePair(values, mode, count = 2) {
    if (!Array.isArray(values) || values.length !== count) return null;
    const pair = values.map(value => validateBoard(value, mode));
    if (pair.some(board => !board)) return null;
    const ids = pair.flatMap(board => Object.values(board.picks));
    return new Set(ids).size === ids.length ? pair : null;
  }

  function saveDraft() {
    if (online()) return;
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

  function shareUrl(indices = [0, 1]) {
    saveDraft();
    const encode = b => [cleanName(b.name), b.offense, b.defense, ...slotKeys.map(key => b.picks[key] || 0)];
    const active = Math.max(0, indices.indexOf(state.team));
    const data = [3, state.mode, active, ...indices.map(i => encode(teamPair()[i]))];
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + location.pathname + '#draft=' + token;
  }

  function invalidateMatch() {
    if ($('match-dialog')?.open) $('match-dialog').close();
    if ($('matchup-dialog')?.open) $('matchup-dialog').close();
    lastMatchTeams = null;
  }

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
    if (!Number.isInteger(index) || index < 0 || index >= teamPair().length || index === state.team) return;
    closePicker(false); closePersonnelMenus(); saveDraft();
    state.team = index; applyBoard(teamPair()[index]);
    $('pokemon-search').value = ''; lastFieldButton = null;
    saveDraft(); renderBoard(); renderCatalog();
  }

  function filledCount(board) { return slots(false, board).filter(s => byId.has(board.picks[s.key])).length; }
  function renderTeams() {
    const pair = teamPair(), many = pair.length > 2, switcher = many || phone.matches;
    $('team-tabs').hidden = switcher;
    $('team-switcher').hidden = !switcher;
    pair.forEach((board, index) => {
      const count = filledCount(index === state.team ? snapshot() : board);
      const button = document.querySelector(`[data-team="${index}"]`);
      if (button) {
        button.setAttribute('aria-selected', String(index === state.team));
        button.tabIndex = index === state.team ? 0 : -1;
        button.setAttribute('aria-label', `${teamName(index)}, ${count} of ${rosterSize()} positions filled`);
        button.title = teamName(index);
        $('team-label-' + index).textContent = teamName(index);
        $('team-count-' + index).textContent = `${count}/${rosterSize()}`;
      }
    });
    if (switcher) {
      $('team-switcher').replaceChildren(...pair.map((board, index) => {
        const option = document.createElement('option'); option.value = String(index);
        option.textContent = `${teamName(index)} · ${filledCount(index === state.team ? snapshot() : board)}/${rosterSize()}`;
        return option;
      }));
      $('team-switcher').value = String(state.team);
    }
    const ready = rosterSize() === 23 && (!auctionActive || auctionPhase() === 'complete') && pair.every((b, i) => filledCount(i === state.team ? snapshot() : b) === rosterSize());
    $('simulate-match').setAttribute('aria-disabled', String(!ready || !editable()));
    $('simulate-match').disabled = !editable();
    $('simulate-match').title = ready ? many ? 'Choose two teams for a four-quarter game' : 'Play a four-quarter game' : 'Fill every position, including a kicker, on every team';
    $('new-game-button').querySelector('.new-game-label').textContent = online() ? 'Draft room' : 'New game';
    $('new-game-button').classList.toggle('in-room', online());
    const board = document.querySelector('.board-panel');
    board.setAttribute('aria-label', `${teamName()} football draft board`);
    board.setAttribute('role', switcher ? 'region' : 'tabpanel');
    if (switcher) board.removeAttribute('aria-labelledby');
    else board.setAttribute('aria-labelledby', `team-tab-${state.team}`);
  }

  function imagePath(p) { return p.image; }

  function renderPreferences() {
    ['team-name', 'save-team-name', 'offense', 'defense'].forEach(id => { $(id).disabled = !editable(); });
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
    $('formation-summary').textContent = `${teamName()} · ${{ gen1: 'Gen 1', gen2: 'Gen 2', gen3: 'Gen 3', both: 'All' }[state.mode]} · ${state.offense} OFF · ${{ '3-4': '3–4', '4-3': '4–3', nickel: 'Nickel', dime: 'Dime' }[state.defense]} DEF`;
    $('board-mode-label').textContent = `${online() ? 'Online auction' : auctionActive ? 'Local auction' : 'Practice'} · ${modeLabels[state.mode]}`;
    $('clear-button').hidden = auctionActive;
    document.querySelector('.practice-settings').hidden = auctionActive;
    $('picker-generation').textContent = { gen1: 'THE ORIGINAL 151', gen2: 'THE JOHTO 100', gen3: 'THE HOENN 135', both: 'ALL 386 POKÉMON' }[state.mode];
    $('catalog-generation').textContent = { gen1: 'GENERATION I', gen2: 'GENERATION II', gen3: 'GENERATION III', both: 'GENERATIONS I–III' }[state.mode];
    $('field-footer').textContent = { gen1: 'KANTO', gen2: 'JOHTO', gen3: 'HOENN', both: 'KANTO + JOHTO + HOENN' }[state.mode] + ' DRAFT LEAGUE';
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
      const pending = auctionActive && auctionPhase() === 'placement' && auction.session.awards.at(-1).team === state.team;
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
    $('draft-count').innerHTML = `${filled}<span>/${rosterSize()}</span>`;
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
    window.DraftOnline?.refreshNeeds();
  }

  function renderSelection() {
    const selected = slots().find(s => s.key === state.selected);
    const picked = selected && byId.get(state.picks[selected.key]);
    $('selection-info').className = 'selection-info' + (selected ? ' is-selected' + (selected.side === 'defense' ? ' is-defense' : '') : '');
    $('selection-badge').textContent = selected ? selected.role : '＋';
    $('selection-title').textContent = selected ? selected.name : 'Select a position';
    $('selection-description').textContent = picked ? `Replacing ${picked.name}` : selected ? 'Choose your Pokémon' : 'Tap a player on the field to draft.';
    $('remove-pick').hidden = auctionActive || !picked;
    if (online() && !editable()) { $('selection-description').textContent = 'Viewing roster · the host controls placements'; $('picker-heading').textContent = 'Team Pokémon'; } else $('picker-heading').textContent = 'Make your pick';
    if (auctionActive && editable()) $('selection-description').textContent = selected ? 'Swap with a Pokémon you already own.' : 'Tap a player on the field to change its position.';
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
    const owned = auctionActive ? new Set(auctionOwned(state.team)) : null;
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
    const unavailable = new Map();
    teamPair().forEach((board, i) => { if (i !== state.team) Object.values(board.picks).forEach(id => unavailable.set(id, i)); });
    const owned = auctionActive ? new Set(auctionOwned(state.team)) : null;
    document.querySelectorAll('.pokemon-card').forEach(card => {
      const picked = visiblePicks.has(Number(card.dataset.pokemon));
      card.classList.toggle('picked', picked);
      const retired = window.DraftCareers.isInducted(Number(card.dataset.pokemon));
      const claimed = unavailable.has(Number(card.dataset.pokemon));
      const unowned = owned && !owned.has(Number(card.dataset.pokemon));
      card.disabled = !editable() || claimed || retired || unowned; card.classList.toggle('opponent-pick', claimed || retired);
      const roster = card.querySelector('.roster-mark');
      const ownerName = claimed ? teamName(unavailable.get(Number(card.dataset.pokemon))) : '';
      roster.hidden = !claimed && !retired; roster.textContent = retired ? 'Retired' : ownerName;
      card.setAttribute('aria-label', `${retired ? 'Retired' : claimed ? 'Unavailable, on ' + ownerName : 'Draft'} ${byId.get(Number(card.dataset.pokemon)).name}, ${scoutingStats(byId.get(Number(card.dataset.pokemon))).description}`);
    });
  }

  function selectPosition(key) {
    if (!slots().some(s => s.key === key)) throw new Error('Unknown position.');
    if (auctionActive && auctionPhase() === 'placement') { placeAuctionPokemon(key); return; }
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

  function setShareOpen(open, restoreFocus = false) {
    $('board-share-actions').hidden = !open;
    $('board-share-toggle').setAttribute('aria-expanded', String(open));
    if (open) { setMenuOpen(false); closePersonnelMenus(); $('share-link').focus({ preventScroll: true }); }
    else if (restoreFocus) $('board-share-toggle').focus({ preventScroll: true });
  }

  function syncInterfaceViewport() {
    const viewport = window.visualViewport;
    const height = viewport?.height || innerHeight;
    const keyboard = height < innerHeight * .82 && /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
    document.documentElement.style.setProperty('--interface-view-top', `${(viewport?.offsetTop || 0) + 8}px`);
    document.documentElement.style.setProperty('--interface-view-height', `${Math.max(180, height - 16)}px`);
    document.querySelectorAll('.play-setup-dialog, #draft-menu').forEach(panel => panel.classList.toggle('keyboard-open', keyboard && panel.contains(document.activeElement)));
    if (keyboard) {
      const input = document.activeElement, panel = input.closest('.play-setup-dialog, #draft-menu');
      if (panel) requestAnimationFrame(() => {
        if (document.activeElement !== input) return;
        const field = input.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
        if (field.bottom > bounds.bottom - 12) panel.scrollTop += field.bottom - bounds.bottom + 12;
        else if (field.top < bounds.top + 12) panel.scrollTop += field.top - bounds.top - 12;
      });
    }
  }

  function setMenuOpen(open, restoreFocus = false) {
    const menu = $('draft-menu');
    if (open === !menu.hidden) return;
    closePersonnelMenus();
    if (open) setShareOpen(false);
    menu.hidden = !open;
    $('menu-backdrop').hidden = !open;
    document.body.classList.toggle('settings-open', open);
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', String(open && phone.matches));
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    $('menu-toggle').setAttribute('aria-label', open ? 'Close team settings' : 'Open team settings');
    if (open) { $('settings-close').focus({ preventScroll: true }); syncInterfaceViewport(); }
    else if (restoreFocus || menu.contains(document.activeElement)) $('menu-toggle').focus({ preventScroll: true });
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
    if (online()) {
      if (!editable()) { message('Only the host can place Pokémon. Browse your roster in the lobby panel.'); return { drafted: false }; }
      if (!state.selected) { message('Select a position first.'); return { drafted: false }; }
      const key = state.selected;
      sendOnline('place', { teamIndex: state.team, slotKey: key, pokemonId: id }).then(result => { if (result && narrow.matches) closePicker(); });
      return { drafted: false, pending: true };
    }
    if (auctionActive) {
      if (auctionPhase() === 'placement') {
        const award = auction.session.awards.at(-1);
        if (id === award.pokemonId && state.team === award.team) return placeAuctionPokemon(state.selected);
        message('Place the Pokémon you just won before making another change.'); return { drafted: false };
      }
      if (!auctionOwned(state.team).includes(id)) { message('Only Pokémon won by this team can play on its auction roster.'); return { drafted: false }; }
    }
    if (!allowed(id)) throw new Error('Choose a Pokémon from the selected generation.');
    if (window.DraftCareers.isInducted(id)) { message(`${byId.get(id).name} is retired in the league halls`); return { drafted: false }; }
    if (opponentPicks().has(id)) { message(`${byId.get(id).name} is already on ${teamName(claimedTeam(id))}`); return { drafted: false }; }
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
    if (online()) { sendOnline('scheme', { teamIndex: state.team, offense, defense }); return readBoard(); }
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
    const wanted = state.mode === 'gen3' ? {} : state.mode === 'gen2' || (state.mode === 'both' && state.team === 1) ? johtoSample : samplePicks;
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

  function matchTeams(indices) {
    saveDraft();
    return indices.map(i => { const board = teamPair()[i]; return { name: teamName(i), positions: slots(false, board).map(s => ({ key: s.key, role: s.role, side: s.side, pokemonId: board.picks[s.key] || null, pokemon: byId.get(board.picks[s.key]) || null })) }; });
  }

  function simulateMatch(indices) {
    if (online() && !editable()) { message('The host runs match simulations. Results appear for everyone.'); return null; }
    if (rosterSize() === 22) { message('This older auction has no kicker slots. Start a new auction to play with kickers.'); return null; }
    if (auctionActive && auctionPhase() !== 'complete') { message(`Finish all ${auctionTotal()} auction picks before simulating the match.`); return null; }
    if (!Array.isArray(indices)) {
      if (teamPair().length > 2) { openMatchupChooser('simulate'); return null; }
      indices = [0, 1];
    }
    if (!validMatchup(indices)) return null;
    if (online()) { sendOnline('simulate', { teamIndexes: indices }); return null; }
    const teams = matchTeams(indices);
    if (teams.some(t => t.positions.some(p => p.pokemonId && window.DraftCareers.isInducted(p.pokemonId)))) {
      hallChanged(null, true); message('Retired Pokémon have left the draft. Fill the open positions.'); return null;
    }
    const missing = teams.map(t => t.positions.filter(p => !p.pokemonId).length);
    if (missing.some(Boolean)) {
      message(missing.map((n, i) => n ? `${teams[i].name} needs ${n} more ${n === 1 ? 'pick' : 'picks'}` : '').filter(Boolean).join(' · '));
      return null;
    }
    let result;
    try { result = window.DraftMatch.simulate(...teams); }
    catch (_) { message('The match could not run. Please reload and try again.'); return null; }
    window.DraftCareers.recordMatch(result);
    lastMatchTeams = indices.slice();
    if (auctionActive) { auction.matchup = indices.slice(); saveDraft(); }
    renderMatch(result);
    if (window.DraftCareers.isRemote()) $('match-career-status').textContent = 'Local practice game. Online lobby matches count toward your league careers.';
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

  function openLinkDialog(indices) {
    if (!Array.isArray(indices)) {
      if (teamPair().length > 2) { openMatchupChooser('share'); return; }
      indices = [0, 1];
    }
    if (!validMatchup(indices)) return;
    setMenuOpen(false, true);
    $('lineup-url').value = shareUrl(indices);
    $('link-description').textContent = `${teamName(indices[0])}, ${teamName(indices[1])}, their personnel, and the Pokémon pool travel with this link.`;
    $('link-status').textContent = '';
    $('send-link').hidden = !navigator.share;
    $('link-dialog').showModal();
  }


  function saveAuction() {
    if (online()) return;
    try {
      if (!auction) localStorage.removeItem(auctionStorageKey);
      else {
        if (auctionActive) auction.team = state.team;
        localStorage.setItem(auctionStorageKey, JSON.stringify({ v: 1, ...auction, active: auctionActive, regularView }));
      }
      if (auctionActive) { $('save-status').textContent = 'Autosaved'; $('save-status').title = 'Auction bids, budgets and every team saved on this device'; }
    } catch (_) {
      if (auctionActive) { $('save-status').textContent = 'Unsaved'; $('save-status').title = 'Browser storage is unavailable. Keep this tab open to finish the auction.'; }
    }
  }

  function loadAuction() {
    try {
      const raw = localStorage.getItem(auctionStorageKey);
      const saved = raw && raw.length < 35000 ? JSON.parse(raw) : null;
      if (!saved || saved.v !== 1) return;
      let session = window.DraftAuction.validate(saved.session);
      const teams = session && validatePair(saved.teams, session.mode, session.teamCount);
      if (!teams) throw new Error('Invalid auction');
      if (session.rosterSize === 22) {
        const excluded = new Set([...session.lots, ...session.skipped]);
        const candidates = pokemon.filter(p => allowed(p.id, session.mode) && !excluded.has(p.id) && !window.DraftCareers.isInducted(p.id)).map(p => p.id);
        if (candidates.length >= session.teamCount) {
          for (let count = 0; count < session.teamCount; count++) session.lots.push(candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]);
          session.rosterSize = 23;
          // Previously full 22-player teams become eligible for a final kicker.
          // Preserve every purchase while updating its historical tie metadata.
          session.awards.forEach(award => { award.tied = award.bids.filter(bid => bid === award.amount).length > 1; });
          session = window.DraftAuction.validate(session);
        }
      }
      const placed = session.awards.slice(0, session.placed);
      teams.forEach((board, index) => {
        const active = new Set(slots(false, board).map(s => s.key));
        const owned = placed.filter(a => a.team === index).map(a => a.pokemonId);
        const ids = Object.values(board.picks);
        if (Object.keys(board.picks).some(key => !active.has(key)) || ids.length !== owned.length || ids.some(id => !owned.includes(id))) throw new Error('Invalid auction roster');
      });
      auction = { draftId: saved.draftId || crypto.randomUUID(), session, teams, team: Number.isInteger(saved.team) && saved.team >= 0 && saved.team < session.teamCount ? saved.team : 0 };
      if (Array.isArray(saved.matchup) && saved.matchup.length === 2 && new Set(saved.matchup).size === 2 && saved.matchup.every(i => Number.isInteger(i) && i >= 0 && i < session.teamCount)) auction.matchup = saved.matchup.slice();
      regularView = saved.regularView && Object.hasOwn(modeLabels, saved.regularView.mode) ? { mode: saved.regularView.mode, team: saved.regularView.team === 1 ? 1 : 0, shared: !!saved.regularView.shared && !!sharedCopy } : { mode: state.mode, team: state.team, shared };
      if (!reconcileAuctionRetirees()) return;
      if (saved.active && !incomingSharedLink) {
        auctionActive = true; state.mode = session.mode; state.team = auction.team;
        applyBoard(auction.teams[state.team]);
      }
      saveAuction();
    } catch (_) { auction = null; auctionActive = false; saveAuction(); message('The saved auction could not be restored. Your regular drafts are ready.'); }
  }

  function reconcileAuctionRetirees() {
    if (online()) return true;
    if (!auction) return false;
    const currentBefore = auctionCurrent();
    const retired = id => window.DraftCareers.isInducted(id);
    const awardedRetiree = auction.session.awards.some(a => retired(a.pokemonId));
    const replacements = auctionReplacementPool();
    const upcoming = auction.session.lots.slice(auction.session.awards.length).filter(retired);
    if (awardedRetiree || upcoming.length > replacements.length) {
      if (auctionActive) exitAuction(false);
      auction = null; saveAuction();
      message('An auction player retired. Your regular drafts are ready; start a new auction.'); return false;
    }
    for (let i = auction.session.awards.length; i < auction.session.lots.length; i++) {
      if (retired(auction.session.lots[i])) {
        const index = Math.floor(Math.random() * replacements.length);
        auction.session.lots[i] = replacements.splice(index, 1)[0];
      }
    }
    if (upcoming.length) saveAuction();
    if (currentBefore !== auctionCurrent() && $('auction-dialog').open) {
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
    if (online()) { openAuctionRound(); return; }
    if (!auction || !reconcileAuctionRetirees()) { openAuctionSetup(); return; }
    if (!auctionActive) {
      saveDraft(); regularView = { mode: state.mode, team: state.team, shared };
      auctionActive = true; state.mode = auction.session.mode; state.team = auction.team || 0;
      applyBoard(auction.teams[state.team]);
    }
    closePicker(false); invalidateMatch(); setMenuOpen(false, true);
    saveDraft(); renderBoard(); renderCatalog(); openAuctionRound();
  }

  function exitAuction(announce = true) {
    if (online()) { window.DraftOnline.leave(); return; }
    if (!auctionActive) return;
    saveDraft(); closePicker(false); invalidateMatch(); $('auction-dialog').close();
    auctionActive = false;
    state.mode = regularView?.mode || 'gen1'; state.team = regularView?.team === 1 ? 1 : 0;
    shared = !!regularView?.shared && !!sharedCopy;
    if (shared) state.mode = sharedCopy.mode;
    applyBoard(teamPair()[state.team]); saveDraft(); saveAuction(); renderBoard(); renderCatalog();
    setMenuOpen(false, true);
    if (announce) message('Back to practice. Your auction is saved for later.');
  }

  function openAuctionSetup() {
    if (online()) { window.DraftOnline.open(); return; }
    closePicker(false); setShareOpen(false); setMenuOpen(false); saveDraft();
    [0, 1, 2, 3].forEach(i => { $('auction-name-' + i).value = teamPair()[i] ? teamName(i) : 'Team ' + (i + 1); });
    $('auction-team-count').value = String(auction?.session.teamCount || 2);
    renderAuctionSetup();
    $('auction-pool').value = state.mode;
    $('auction-start-button').hidden = !auction;
    $('auction-start-button').textContent = auction ? `Resume ${auction.session.teamCount}-team auction →` : 'Resume saved auction';
    $('auction-setup-note').textContent = auction ? 'Starting fresh replaces your saved local auction. Your practice lineup and careers stay saved.' : 'Your practice lineup stays saved. Retired Pokémon sit this one out.';
    $('auction-create-button').textContent = auction ? 'Start a new local auction' : 'Start local auction';
    $('auction-setup-error').hidden = true;
    $('auction-setup-dialog').showModal();
    // Focus a button so Safari does not cover the setup with its keyboard.
    $('auction-create-button').focus({ preventScroll: true });
  }

  function startAuction() {
    const mode = $('auction-pool').value, teamCount = Number($('auction-team-count').value);
    let session;
    try { session = window.DraftAuction.create(pokemon.filter(p => allowed(p.id, mode) && !window.DraftCareers.isInducted(p.id)).map(p => p.id), { mode, teamCount }); }
    catch (error) { $('auction-setup-error').textContent = error.message; $('auction-setup-error').hidden = false; return; }
    saveDraft();
    const previousTeams = teamPair();
    const teams = Array.from({ length: teamCount }, (_, i) => {
      const board = previousTeams[i] || emptyBoard();
      return { name: cleanName($('auction-name-' + i).value), offense: board.offense, defense: board.defense, picks: {} };
    });
    if (!auctionActive) regularView = { mode: state.mode, team: state.team, shared };
    auction = { draftId: crypto.randomUUID(), session, teams, team: 0 }; auctionActive = true;
    state.mode = mode; state.team = 0; applyBoard(teams[0]);
    $('auction-setup-dialog').close(); invalidateMatch(); saveDraft(); renderBoard(); renderCatalog(); openAuctionRound();
  }

  function renderAuction() {
    if (online()) { renderOnlineAuction(); return; }
    document.body.classList.toggle('auction-active', auctionActive);
    document.body.dataset.auctionTeams = String(auctionActive ? auction.session.teamCount : 2);
    $('auction-strip').hidden = !auctionActive;
    $('auction-exit-button').hidden = !auctionActive;
    $('auction-start-button').hidden = !auction;
    $('auction-start-button').textContent = auction ? `Resume ${auction.session.teamCount}-team auction →` : 'Resume saved auction';
    document.querySelectorAll('[data-mode]').forEach(b => { b.disabled = auctionActive; b.title = auctionActive ? 'Return to practice to change the pool' : ''; });
    ['sample-button', 'clear-button'].forEach(id => { $(id).disabled = auctionActive; $(id).title = auctionActive ? 'Auction players belong to their winning team. Start a new game to restart.' : id === 'clear-button' ? 'Clear board' : 'Use a sample lineup'; });
    if (!auctionActive) return;
    const remaining = auctionBudgets(), phase = auctionPhase();
    if (phase === 'bidding') renderAuctionSkip();
    $('auction-strip').dataset.phase = phase;
    document.querySelectorAll('[data-auction-wallet]').forEach(el => { el.hidden = Number(el.dataset.auctionWallet) >= auction.session.teamCount; });
    auctionTeamIndexes().forEach(i => { $('auction-team-' + i).textContent = teamName(i); $('auction-budget-' + i).textContent = '$' + remaining[i].toLocaleString('en-US'); });
    $('auction-resume-button').hidden = phase === 'complete';
    $('auction-resume-button').textContent = phase === 'placement' ? 'Place pick' : auction.session.placed ? 'Next Pokémon' : 'Open bidding';
    if (phase === 'placement') {
      const award = auction.session.awards.at(-1);
      $('auction-status').textContent = `${byId.get(award.pokemonId).name} → ${teamName(award.team)} for $${award.amount}. Tap an empty position.`;
    } else $('auction-status').textContent = phase === 'complete' ? rosterSize() === 22 ? 'Legacy auction complete. Start a new auction to include kickers.' : `${auction.session.lots.length}/${auction.session.lots.length} drafted. Ready to Simulate Match.` : `Pokémon ${auction.session.placed + 1} of ${auction.session.lots.length} · ready for bids`;
  }

  function openAuctionRound() {
    if (!auctionActive) return;
    if (online() && (auctionPhase() === 'waiting' || (!editable() && auctionPhase() !== 'bidding'))) { window.DraftOnline.open(); return; }
    $('auction-bid-form').hidden = !editable();
    $('auction-viewer-note').hidden = editable();
    setMenuOpen(false, true); closePicker(false);
    if (!reconcileAuctionRetirees()) return;
    const phase = auctionPhase();
    if (phase === 'complete') { message('All auction teams are ready to simulate.'); return; }
    if (phase === 'placement') {
      const award = auction.session.awards.at(-1);
      changeTeam(award.team);
      message(`Tap an empty position for ${byId.get(award.pokemonId).name}`);
      const target = document.querySelector('.position.empty'); target?.focus({ preventScroll: true });
      return;
    }
    const p = byId.get(auctionCurrent());
    if (!p) return;
    const stats = scoutingStats(p);
    $('auction-round').textContent = `POKÉMON ${online() ? onlineSnapshot.lobby.auction.round : auction.session.placed + 1} OF ${auctionTotal()}`;
    $('auction-pokemon').textContent = p.name; $('auction-image').src = p.image; $('auction-image').alt = p.name;
    $('auction-dex').textContent = '#' + String(p.id).padStart(3, '0'); $('auction-types').textContent = p.types.join(' / ');
    $('auction-stats').textContent = `${stats.height} · ${stats.weight} lb · ${stats.forty}s est. 40`;
    renderAuctionFacts(p);
    document.querySelector('.auction-dialog-body').scrollTop = 0;
    const budgets = auctionBudgets(), counts = auctionCounts();
    document.querySelectorAll('[data-auction-bid]').forEach(el => { el.hidden = Number(el.dataset.auctionBid) >= teamPair().length; });
    auctionTeamIndexes().forEach(i => {
      $('auction-bid-label-' + i).textContent = teamName(i) + ' bid';
      $('auction-bid-detail-' + i).textContent = `${counts[i]}/${rosterSize()} · $${budgets[i].toLocaleString('en-US')} left${counts[i] === rosterSize() ? ' · Roster full' : ''}`;
      const input = $('auction-bid-' + i); input.value = '0'; input.disabled = counts[i] === rosterSize();
      input.enterKeyHint = counts.slice(i + 1).some(count => count < rosterSize()) ? 'next' : 'done';
      input.setAttribute('aria-invalid', 'false');
    });
    $('auction-bid-error').hidden = true;
    renderAuctionSkip();
    if (!$('auction-dialog').open) $('auction-dialog').showModal();
    $('auction-bid-button').focus({ preventScroll: true }); syncAuctionViewport();
  }

  function renderAuctionFacts(p) {
    const labels = [['hp', 'HP'], ['attack', 'Attack'], ['defense', 'Defense'], ['specialAttack', 'Sp. Atk'], ['specialDefense', 'Sp. Def'], ['speed', 'Speed']];
    $('auction-base-stats').replaceChildren(...labels.map(([key, label]) => {
      const group = document.createElement('div'); group.dataset.stat = key;
      const heading = document.createElement('dt'); heading.textContent = label;
      const value = document.createElement('dd'); value.textContent = String(p.baseStats[key]);
      group.append(heading, value); return group;
    }));
    $('auction-stat-total').textContent = 'Total ' + Object.values(p.baseStats).reduce((sum, value) => sum + value, 0);
    $('auction-abilities').textContent = 'Abilities: ' + p.abilities.join(' · ');
    $('auction-synopsis').textContent = p.synopsis;
    $('auction-scouting').open = false;
  }

  function renderAuctionSkip() {
    const unavailable = online() ? new Set([...(onlineSnapshot.lobby.auction?.awards || []).map(a => a.pokemonId), ...(onlineSnapshot.lobby.auction?.skipped || []), auctionCurrent()]) : null;
    const canSkip = online() ? pokemon.filter(p => allowed(p.id) && !window.DraftCareers.isInducted(p.id) && !unavailable.has(p.id)).length > auctionTotal() - (onlineSnapshot.lobby.auction?.awards.length || 0) - 1 : auctionReplacementPool().length > 0;
    $('auction-skip-button').disabled = !canSkip;
    if (canSkip) $('auction-skip-button').removeAttribute('aria-describedby');
    else $('auction-skip-button').setAttribute('aria-describedby', 'auction-skip-note');
    $('auction-skip-note').hidden = canSkip;
  }

  function skipAuctionPokemon() {
    if (online()) { sendOnline('skip', {}).then(result => { if (result) openAuctionRound(); }); return; }
    if (!auctionActive || !$('auction-dialog').open || auctionPhase() !== 'bidding') return;
    const current = auctionCurrent();
    if (!reconcileAuctionRetirees() || current !== auctionCurrent()) return;
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
    if (!auctionActive || auctionPhase() !== 'bidding') return;
    const budgets = auctionBudgets(), counts = auctionCounts(), bids = [];
    let invalid = null;
    auctionTeamIndexes().forEach(i => {
      const input = $('auction-bid-' + i), raw = input.value.trim();
      const valid = counts[i] === rosterSize() || (/^\d{1,4}$/.test(raw) && Number(raw) <= budgets[i]);
      input.setAttribute('aria-invalid', String(!valid));
      if (!valid && invalid === null) invalid = i;
      bids.push(counts[i] === rosterSize() ? 0 : Number(raw));
    });
    if (invalid !== null) {
      $('auction-bid-error').textContent = `${teamName(invalid)}: enter a whole-dollar bid from $0 to $${budgets[invalid]}.`;
      $('auction-bid-error').hidden = false; $('auction-bid-' + invalid).focus(); return;
    }
    if (online()) {
      $('auction-bid-button').disabled = true;
      sendOnline('bid', { bids }).then(result => {
        if (result) { $('auction-dialog').close(); const award = result.lobby.auction.pendingAward; if (award) { changeTeam(award.team); message(`${teamName(award.team)} wins ${byId.get(award.pokemonId).name} for $${award.amount}. Choose a position.`); } }
      }).finally(() => { $('auction-bid-button').disabled = false; });
      return;
    }
    const biddingOn = auctionCurrent();
    if (!reconcileAuctionRetirees()) { $('auction-dialog').close(); return; }
    if (biddingOn !== auctionCurrent()) return;
    const { session, award } = window.DraftAuction.bid(auction.session, bids);
    auction.session = session; window.DraftCareers.recordDraft(award.pokemonId, award.amount, `auction:${auction.draftId || (auction.draftId = crypto.randomUUID())}:${session.awards.length}`); saveDraft(); $('auction-dialog').close();
    changeTeam(award.team); state.selected = null; saveDraft(); renderBoard(); renderCatalog();
    message(`${teamName(award.team)} wins ${byId.get(award.pokemonId).name}${award.tied ? ' in the tiebreak' : ''} for $${award.amount}`);
  }

  function placeAuctionPokemon(key) {
    if (online()) {
      if (!editable()) { message('The host places Pokémon.'); return { drafted: false }; }
      const award = onlineSnapshot.lobby.auction?.pendingAward;
      if (!award) return { drafted: false };
      if (state.team !== award.team) { changeTeam(award.team); message(`Choose a position on ${teamName(award.team)}.`); return { drafted: false }; }
      if (state.picks[key]) { message('Choose an empty position.'); return { drafted: false }; }
      sendOnline('place', { teamIndex: state.team, slotKey: key, pokemonId: award.pokemonId });
      return { drafted: false, pending: true };
    }
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
    const keyboard = dialog.open && document.activeElement?.matches('.auction-bid-input input') && height < innerHeight * .8;
    dialog.style.setProperty('--auction-top', `${(viewport?.offsetTop || 0) + 8}px`);
    dialog.style.setProperty('--auction-height', `${Math.max(0, height - 16)}px`);
    dialog.classList.toggle('keyboard-open', !!keyboard);
    $('auction-title').textContent = keyboard ? $('auction-pokemon').textContent : 'Place your bids';
  }


  function renderAuctionSetup() {
    const count = Number($('auction-team-count').value);
    document.querySelectorAll('[data-auction-name]').forEach(el => { el.hidden = Number(el.dataset.auctionName) >= count; });
    $('auction-rules').textContent = 'Pass one screen around. Bid for Pokémon, build your teams, then play a match.';
    $('auction-setup-summary').textContent = `${count * 23} Pokémon · $1,000 each · 23-player rosters`;
    $('auction-setup-error').hidden = true;
  }

  function validMatchup(indices) {
    return Array.isArray(indices) && indices.length === 2 && indices[0] !== indices[1] && indices.every(i => Number.isInteger(i) && i >= 0 && i < teamPair().length);
  }

  function openMatchupChooser(action) {
    closePicker(false); setMenuOpen(false, true); saveDraft();
    matchupAction = action;
    const pair = teamPair();
    const chosen = auctionActive && validMatchup(auction.matchup) ? auction.matchup : [state.team, (state.team + 1) % pair.length];
    [0, 1].forEach(side => {
      const select = $('matchup-team-' + side);
      select.replaceChildren(...pair.map((board, index) => {
        const option = document.createElement('option'); option.value = String(index); option.textContent = teamName(index); return option;
      }));
      select.value = String(chosen[side]);
    });
    $('matchup-title').textContent = action === 'share' ? 'Share a matchup' : 'Choose your matchup';
    $('matchup-description').textContent = action === 'share' ? 'Choose the two teams to include in your share link.' : 'Choose any two teams for a four-quarter game.';
    $('matchup-play-button').textContent = action === 'share' ? 'Share link' : 'Simulate Match';
    $('matchup-error').hidden = true;
    updateMatchupOptions();
    $('matchup-dialog').showModal();
    $('matchup-play-button').focus({ preventScroll: true });
  }

  function updateMatchupOptions() {
    [0, 1].forEach(side => {
      const other = $('matchup-team-' + (1 - side)).value;
      [...$('matchup-team-' + side).options].forEach(option => { option.disabled = option.value === other; });
    });
  }

  $('auction-team-count').addEventListener('change', renderAuctionSetup);
  [0, 1].forEach(side => $('matchup-team-' + side).addEventListener('change', updateMatchupOptions));
  $('matchup-play-button').addEventListener('click', () => {
    const indices = [Number($('matchup-team-0').value), Number($('matchup-team-1').value)];
    if (!validMatchup(indices)) { $('matchup-error').textContent = 'Choose two different teams.'; $('matchup-error').hidden = false; return; }
    if (auctionActive) { auction.matchup = indices.slice(); saveDraft(); }
    $('matchup-dialog').close();
    if (matchupAction === 'share') openLinkDialog(indices);
    else simulateMatch(indices);
  });

  $('new-game-button').addEventListener('click', openAuctionSetup);
  $('auction-start-button').addEventListener('click', () => { $('auction-setup-dialog').close(); if (auction) enterAuction(); });
  $('practice-mode-button').addEventListener('click', () => { $('auction-setup-dialog').close(); if (auctionActive) exitAuction(); });
  $('auction-exit-button').addEventListener('click', () => exitAuction());
  $('auction-resume-button').addEventListener('click', openAuctionRound);
  $('auction-setup-form').addEventListener('submit', event => { event.preventDefault(); startAuction(); });
  $('auction-bid-form').addEventListener('submit', event => { event.preventDefault(); resolveAuctionBid(); });
  $('auction-skip-button').addEventListener('click', skipAuctionPokemon);
  [0, 1, 2, 3].forEach(i => {
    const input = $('auction-bid-' + i);
    input.addEventListener('focus', () => { input.select(); syncAuctionViewport(); });
    input.addEventListener('blur', () => requestAnimationFrame(syncAuctionViewport));
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const next = auctionTeamIndexes().find(index => index > i && !$('auction-bid-' + index).disabled);
      if (next !== undefined) $('auction-bid-' + next).focus();
      else { input.blur(); $('auction-bid-button').focus(); }
    });
    input.addEventListener('input', () => { input.setAttribute('aria-invalid', 'false'); $('auction-bid-error').hidden = true; });
  });
  window.visualViewport?.addEventListener('resize', syncAuctionViewport);
  window.visualViewport?.addEventListener('scroll', syncAuctionViewport);
  window.addEventListener('resize', syncAuctionViewport);
  $('auction-dialog').addEventListener('close', syncAuctionViewport);
  $('auction-setup-dialog').addEventListener('close', () => { if (!document.querySelector('dialog[open]')) $('new-game-button').focus({ preventScroll: true }); });

  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => changeMode(button.dataset.mode)));
  function renameTeam() {
    if (online()) { sendOnline('rename', { teamIndex: state.team, name: cleanName($('team-name').value) }); return; }
    state.name = cleanName($('team-name').value); invalidateMatch(); saveDraft(); renderBoard();
    message(`${teamName()} is ready`);
  }
  document.querySelector('.team-name-form').addEventListener('submit', e => { e.preventDefault(); renameTeam(); });
  $('team-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); renameTeam(); } });
  $('hall-button').addEventListener('click', () => {
    setMenuOpen(false, true); window.DraftHall.open();
    if (window.DraftCareers.isRemote()) window.DraftOnline.refreshLeague().then(() => window.DraftHall.refresh()).catch(error => message(error.message || 'League records could not refresh.'));
  });
  $('menu-toggle').addEventListener('click', () => setMenuOpen($('draft-menu').hidden, true));
  $('settings-close').addEventListener('click', () => setMenuOpen(false, true));
  $('menu-backdrop').addEventListener('click', () => setMenuOpen(false, true));
  $('board-share-toggle').addEventListener('click', () => setShareOpen($('board-share-actions').hidden));
  ['share-link', 'export-button'].forEach(id => $(id).addEventListener('click', () => setShareOpen(false)));
  document.addEventListener('click', event => {
    if (!event.target.closest('#draft-menu, #menu-toggle, dialog')) setMenuOpen(false);
    if (!event.target.closest('.board-share')) setShareOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      if (['offense', 'defense'].some(side => !$(side + '-options').hidden)) closePersonnelMenus(true);
      else if (!$('board-share-actions').hidden) setShareOpen(false, true);
      else if (!$('draft-menu').hidden) setMenuOpen(false, true);
      else return;
      event.preventDefault();
    }
    if (event.key === 'Tab' && !$('draft-menu').hidden) {
      const items = [...$('draft-menu').querySelectorAll('button:not(:disabled),input:not(:disabled),a')].filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  $('team-switcher').addEventListener('change', event => changeTeam(Number(event.target.value)));
  document.querySelectorAll('[data-team]').forEach(button => button.addEventListener('click', () => changeTeam(Number(button.dataset.team))));
  $('team-tabs').addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); changeTeam(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - state.team);
      document.querySelector(`[data-team="${state.team}"]`).focus();
    }
  });
  $('simulate-match').addEventListener('click', () => simulateMatch());
  $('rerun-match').addEventListener('click', () => simulateMatch(lastMatchTeams));
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
  $('export-dialog').addEventListener('close', () => { exportRun++; $('board-share-toggle').focus({ preventScroll: true }); });
  $('link-dialog').addEventListener('close', () => $('board-share-toggle').focus({ preventScroll: true }));
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
  $('share-link').addEventListener('click', () => openLinkDialog());
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
  $('pokemon-search').addEventListener('input', renderCatalog);
  $('pokemon-search').addEventListener('focus', schedulePickerViewport);
  $('pokemon-search').addEventListener('blur', schedulePickerViewport);
  $('pokemon-search').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  window.visualViewport?.addEventListener('resize', schedulePickerViewport);
  window.visualViewport?.addEventListener('scroll', schedulePickerViewport);
  window.visualViewport?.addEventListener('resize', syncInterfaceViewport);
  window.visualViewport?.addEventListener('scroll', syncInterfaceViewport);
  document.addEventListener('focusin', syncInterfaceViewport);
  document.addEventListener('focusout', () => requestAnimationFrame(syncInterfaceViewport));
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
  phone.addEventListener('change', () => { setMenuOpen(false); renderBoard(); });

  window.DraftField.mount($('field-surface'));
  window.DraftHall.configure({ onChange: hallChanged });
  initializePersonnelMenus();
  loadDraft();
  loadAuction();
  renderBoard();
  renderCatalog();

  function renderOnlineAuction() {
    const lobby = onlineSnapshot.lobby, sale = lobby.auction;
    document.body.classList.add('auction-active', 'online-active');
    document.body.classList.toggle('online-viewer', !editable());
    document.body.dataset.auctionTeams = String(lobby.teamCount);
    $('auction-strip').hidden = false; $('auction-strip').dataset.phase = lobby.phase;
    $('auction-exit-button').hidden = true;
    $('auction-start-button').hidden = true;
    document.querySelectorAll('[data-mode]').forEach(b => { b.disabled = true; b.title = 'The host selects the pool in lobby setup.'; });
    ['sample-button', 'clear-button'].forEach(id => { $(id).disabled = true; });
    document.querySelectorAll('[data-auction-wallet]').forEach(el => { el.hidden = Number(el.dataset.auctionWallet) >= lobby.teamCount; });
    lobby.teams.forEach((team, index) => { $('auction-team-' + index).textContent = team.name; $('auction-budget-' + index).textContent = '$' + (sale?.budgets[index] ?? 1000).toLocaleString('en-US'); });
    const status = lobby.phase === 'waiting' ? 'Waiting room · the host starts the auction.' : lobby.phase === 'complete' ? 'All rosters filled · ready for a match.' : lobby.phase === 'placement' ? `${byId.get(sale.pendingAward.pokemonId).name} → ${teamName(sale.pendingAward.team)} · choose a position` : `Pokémon ${sale.round} of ${sale.total} · ${byId.get(sale.currentPokemonId).name}`;
    $('auction-status').textContent = status;
    $('auction-resume-button').hidden = lobby.phase === 'complete';
    $('auction-resume-button').textContent = lobby.phase === 'waiting' ? 'View lobby' : !editable() ? lobby.phase === 'bidding' ? 'View Pokémon' : 'View lobby' : lobby.phase === 'placement' ? 'Place pick' : 'Open bidding';
    $('save-status').textContent = 'Online'; $('save-status').title = 'Saved to your league database';
  }
  function applyOnlineSnapshot(next) {
    if (!next?.lobby) return;
    const first = !online();
    const previousProspect = onlineSnapshot?.lobby?.auction?.currentPokemonId;
    if (first) { saveDraft(); localViewBackup = { mode: state.mode, team: state.team, shared, auction, auctionActive, regularView }; closePicker(false); closePersonnelMenus(); invalidateMatch(); }
    const boardKey = JSON.stringify([next.lobby.code, next.lobby.mode, next.lobby.phase, next.lobby.teams, next.lobby.auction]);
    const boardChanged = boardKey !== remoteBoardKey;
    onlineSnapshot = next;
    auctionActive = true; auction = { session: next.lobby.auction || {}, teams: next.lobby.teams, team: state.team };
    state.mode = next.lobby.mode;
    if (first) state.team = next.member?.teamIndex ?? 0;
    if (state.team >= next.lobby.teamCount) state.team = 0;
    const leagueKey = `${next.league?.id}:${next.league?.revision}`;
    if (next.league && leagueKey !== remoteLeagueKey) {
      window.DraftCareers.setRemote(next.league, { canManage: () => window.DraftOnline.isHost(), onHallAction: (id, kind) => window.DraftOnline.hallAction(id, kind) });
      remoteLeagueKey = leagueKey;
      if ($('hall-dialog').open) window.DraftHall.refresh();
    }
    if (boardChanged) {
      const selected = state.selected; applyBoard(next.lobby.teams[state.team]);
      if (selected && slots().some(s => s.key === selected)) state.selected = selected;
      remoteBoardKey = boardKey; renderBoard(); renderCatalog();
      if ($('auction-dialog').open && next.lobby.phase !== 'bidding') $('auction-dialog').close();
      else if ($('auction-dialog').open && previousProspect !== next.lobby.auction?.currentPokemonId) openAuctionRound();
    }
    if (next.lobby.match && next.lobby.match.matchId !== remoteMatchId) {
      remoteMatchId = next.lobby.match.matchId; renderMatch(next.lobby.match);
      $('match-career-status').textContent = 'Career stats saved to your league database.';
      $('rerun-match').hidden = !editable(); lastMatchTeams = next.lobby.matches?.at(-1)?.teamIndexes || [0, 1];
      if (!$('match-dialog').open) $('match-dialog').showModal();
    }
    window.DraftOnline.refreshNeeds();
  }
  function leaveOnlineView() {
    const restore = localViewBackup; onlineSnapshot = null; localViewBackup = null;
    remoteBoardKey = ''; remoteLeagueKey = ''; remoteMatchId = null;
    window.DraftCareers.clearRemote(); document.body.classList.remove('online-active', 'online-viewer');
    closePicker(false); invalidateMatch(); $('auction-dialog').close();
    if (restore) { state.mode = restore.mode; state.team = restore.team; shared = restore.shared; auction = restore.auction; auctionActive = restore.auctionActive; regularView = restore.regularView; }
    else { auction = null; auctionActive = false; state.mode = 'gen1'; state.team = 0; }
    applyBoard(teamPair()[state.team]); $('auction-exit-button').textContent = 'Back to practice'; $('rerun-match').hidden = false;
    renderBoard(); renderCatalog(); window.DraftHall.refresh();
  }
  function applySavedLeague(league) {
    if (online() || !league) return;
    window.DraftCareers.setRemote(league, {
      canManage: () => Boolean(window.DraftOnline.league()?.canManage),
      onHallAction: (id, kind) => window.DraftOnline.hallAction(id, kind)
    });
    Object.values(boards).forEach(removeRetirees); Object.values(opponents).forEach(removeRetirees);
    sharedCopy?.teams.forEach(removeRetirees); removeRetirees(state);
    if (auction) reconcileAuctionRetirees();
    saveDraft(); renderBoard(); renderCatalog(); window.DraftHall.refresh();
  }
  function copyPlaySetup(from, to) {
    ['team-count', 'pool'].forEach(key => { $(to + '-' + key).value = $(from + '-' + key).value; });
    [0, 1, 2, 3].forEach(i => { $(to + '-name-' + i).value = $(from + '-name-' + i).value; });
    $(to + '-team-count').dispatchEvent(new Event('change'));
  }
  window.DraftOnline.init({ onSnapshot: applyOnlineSnapshot, onExit: leaveOnlineView,
    beforeOpen: () => {
      if ($('auction-setup-dialog').open) copyPlaySetup('auction', 'online');
      setMenuOpen(false); setShareOpen(false); closePicker(false); $('auction-setup-dialog').close();
    },
    onLocalSetup: () => { openAuctionSetup(); copyPlaySetup('online', 'auction'); },
    onLeague: applySavedLeague,
    getTeamIndex: () => state.team, onTeamSelect: changeTeam,
    getNeeds: index => { const board = teamPair()[index]; if (!board) return []; const groups = {}; slots(false, board).filter(s => !board.picks[s.key]).forEach(s => { groups[s.role] = (groups[s.role] || 0) + 1; }); return Object.entries(groups).map(([role, count]) => ({ role, count })); }
  });
  window.addEventListener('storage', event => {
    if (event.key !== 'pokemon-draft-careers-v1') return;
    window.DraftCareers.refresh?.(); hallChanged(null, true); window.DraftHall.refresh();
  });
  if (!pokemon.length) message('Pokémon artwork could not load. Please reload the page.');

  const context = document.modelContext;
  if (context?.registerTool) {
    const lifecycle = new AbortController();
    const tools = [
      { name: 'select_draft_team', title: 'Select draft team', description: 'Select an available team sharing the current Pokémon pool, including up to four auction teams.', inputSchema: { type: 'object', properties: { teamIndex: { type: 'integer', enum: [0, 1, 2, 3] } }, required: ['teamIndex'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => { if (!input || !Number.isInteger(input.teamIndex) || input.teamIndex < 0 || input.teamIndex >= teamPair().length) throw new Error('Choose an available team index'); changeTeam(input.teamIndex); return readBoard(); } },
      { name: 'read_draft_board', title: 'Read draft board', description: 'Read offense and defense personnel and all active draft positions.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => readBoard() },
      { name: 'configure_draft_personnel', title: 'Set personnel', description: 'Set offense and defense personnel, preserving picks in shared positions.', inputSchema: { type: 'object', properties: { offense: { type: 'string', enum: Object.keys(offenseDetails) }, defense: { type: 'string', enum: Object.keys(defenseDetails) } }, required: ['offense', 'defense'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => setPersonnel(input.offense, input.defense) },
      { name: 'draft_pokemon_to_position', title: 'Draft Pokémon', description: 'Place a Pokémon from the selected generation into an active position. Players already drafted swap positions.', inputSchema: { type: 'object', properties: { position: { type: 'string' }, pokemonId: { type: 'integer', minimum: 1, maximum: 386 } }, required: ['position', 'pokemonId'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => {
        if (!input || !slots().some(s => s.key === input.position) || !allowed(input.pokemonId)) throw new Error('Use an active position key and a Pokémon from the selected generation.');
        state.selected = input.position;
        return draftPokemon(input.pokemonId);
      } }
    ];
    tools.forEach(tool => { try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch (_) {} });
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
})();
