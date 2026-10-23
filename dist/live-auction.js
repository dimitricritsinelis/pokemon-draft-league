/* One live prospect, one personal bid, and a direct handoff to the field. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, cls, value) => { const el = document.createElement(tag); if (cls) el.className = cls; if (value !== undefined) el.textContent = value; return el; };
  const money = n => '$' + Number(n || 0).toLocaleString('en-US');
  const pokemon = new Map((window.POKEMON || []).map(p => [p.id, p]));
  const desktop = matchMedia('(min-width: 1001px)');
  let adapter, snapshot, lastLot = null, lastPhase = null, dismissed = null, minimized = false, busy = false, skipAvailable = true, tickKey = null, anchorServer = Date.now(), anchorPerf = performance.now(), interval;
  let dashboard, cards, status, panel, controls, stage, headerStatus, launcher, boxButton, receipt, receiptText, error;
  const serverNow = () => anchorServer + performance.now() - anchorPerf;
  const ready = () => Boolean(snapshot?.lobby.auction?.fieldCounts?.every(count => count === 23));
  const own = () => snapshot?.member?.teamIndex;
  const name = i => snapshot?.lobby.teams[i]?.name || 'Team ' + (i + 1);
  function init(options) {
    adapter = options; panel = $('auction-dialog');
    dashboard = make('section', 'online-team-dashboard'); dashboard.id = 'online-team-dashboard'; dashboard.hidden = true; dashboard.setAttribute('aria-label', 'Teams in this auction');
    cards = make('div', 'online-team-cards'); status = make('div', 'online-draft-status'); status.id = 'player-round-status'; status.setAttribute('role', 'status');
    dashboard.append(cards, status); document.querySelector('main.game').before(dashboard);
    headerStatus = make('span', 'online-header-status'); headerStatus.id = 'online-header-status'; document.querySelector('.brand h1').after(headerStatus);
    stage = make('div', 'player-stage'); stage.id = 'player-stage'; stage.hidden = true; panel.querySelector('.auction-dialog-body').append(stage);
    controls = make('form', 'player-controls'); controls.id = 'player-bid-form'; controls.noValidate = true; controls.hidden = true;
    controls.innerHTML = '<div class="live-price-row"><div><span class="live-price-label">CURRENT BID</span><strong id="player-highest-bid">$0</strong><span id="player-leader"></span></div><div class="live-clock"><strong id="player-countdown"></strong><span>remaining</span></div></div><div class="live-clock-track"><i id="player-time-bar"></i></div><p id="player-bid-context"></p><details id="player-custom-bid"><summary>Set a higher bid</summary><label for="player-bid-input" class="sr-only">Your bid in dollars</label><div class="auction-bid-input"><span aria-hidden="true">$</span><input id="player-bid-input" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done" aria-describedby="player-bid-range player-bid-error"></div><small id="player-bid-range"></small></details><p id="player-bid-error" class="auction-error" role="alert" hidden></p><button type="submit" class="primary-button" id="player-bid-submit">Bid $5 (+$5)</button><div class="live-bid-footer"><span id="player-bid-wallet"></span><button type="button" id="player-skip">Skip Pokémon</button></div>';
    error = controls.querySelector('#player-bid-error'); panel.append(controls);
    receipt = make('div', 'player-award-receipt'); receipt.hidden = true;
    receiptText = make('span'); const receiptBox = make('button', '', 'PC Box'); receiptBox.type = 'button'; receiptBox.addEventListener('click', () => adapter.openBox(own()));
    receipt.append(receiptText, receiptBox); panel.querySelector('.auction-dialog-body').before(receipt);

    launcher = make('button', 'live-auction-launch', 'View live auction'); launcher.id = 'live-auction-launch'; launcher.type = 'button'; launcher.hidden = true; const footer = make('div', 'online-dashboard-footer'); boxButton = make('button', 'live-auction-launch pc-box-button', 'PC Box'); boxButton.id = 'pc-box-button'; boxButton.type = 'button'; boxButton.hidden = true; boxButton.addEventListener('click', () => adapter.openBox(adapter.getTeamIndex())); footer.append(status, boxButton, launcher); dashboard.append(footer);
    launcher.addEventListener('click', () => { if (snapshot?.lobby.phase === 'complete' && window.DraftOnline.isHost() && ready()) adapter.playMatch(); else open(); });
    controls.addEventListener('submit', submit);
    $('player-bid-input').addEventListener('input', updateBidButton);
    $('player-custom-bid').addEventListener('toggle', updateBidButton);
    $('player-skip').addEventListener('click', async () => { if (!snapshot || busy) return; await request('skip', { pokemonId: snapshot.lobby.auction.currentPokemonId }); });
    const minimizeButton = panel.querySelector('[data-close="auction-dialog"]'); minimizeButton.textContent = '−'; minimizeButton.title = 'Minimize auction'; minimizeButton.addEventListener('click', () => { if (snapshot) minimize(); });
    panel.addEventListener('close', renderLauncher);
    panel.addEventListener('cancel', e => { if (snapshot) { e.preventDefault(); minimize(); } });
    desktop.addEventListener('change', () => { if (snapshot) present(true); });
    window.addEventListener('draft-online-connection', () => { if (snapshot) { updateBidButton(); updateConnection(); } });
    window.addEventListener('visibilitychange', () => { if (!document.hidden) clock(); });
  }
  async function request(type, payload) {
    busy = true; error.hidden = true; updateBidButton();
    try { return await window.DraftOnline.request(type, payload); }
    catch (e) { error.textContent = e.message; error.hidden = false; adapter.notify(e.message); return null; }
    finally { busy = false; updateBidButton(); }
  }
  async function submit(e) {
    e.preventDefault(); if (!snapshot || busy || snapshot.lobby.phase !== 'bidding') return;
    const sale = snapshot.lobby.auction, raw = $('player-bid-input').value.trim();
    const amount = $('player-custom-bid').open && raw ? Number(raw) : Math.min(sale.bidding.highestBid + 5, sale.budgets[own()]);
    if (!Number.isSafeInteger(amount) || amount < sale.bidding.minimumBid || amount > sale.budgets[own()]) {
      error.textContent = `Enter a whole-dollar bid from ${money(sale.bidding.minimumBid)} to ${money(sale.budgets[own()])}.`; error.hidden = false; return;
    }
    const result = await request('bid', { amount, pokemonId: sale.currentPokemonId });
    if (result) { $('player-bid-input').value = ''; $('player-custom-bid').open = false; document.activeElement?.blur(); updateBidButton(); }
  }
  function updateBidButton() {
    if (!snapshot) return;
    const sale = snapshot.lobby.auction, button = $('player-bid-submit');
    if (snapshot.lobby.phase !== 'bidding' || !sale?.bidding) return;
    const bidding = sale.bidding, budget = sale.budgets[own()], full = sale.counts[own()] >= 23;
    const leading = bidding.leaderTeam === own(), raw = $('player-bid-input').value.trim();
    const custom = $('player-custom-bid').open && raw;
    const valid = !custom || (/^\d+$/.test(raw) && Number(raw) >= bidding.minimumBid && Number(raw) <= budget);
    const amount = custom ? Number(raw) : Math.min(bidding.highestBid + 5, budget);
    const bidLabel = 'Bid ' + money(amount) + (custom ? '' : amount === budget ? ' · All in' : ' (+$5)');
    $('player-bid-input').setAttribute('aria-invalid', String(!valid));
    $('player-bid-range').textContent = `Bid ${money(bidding.minimumBid)}–${money(budget)}`;
    const opening = serverNow() < Date.parse(bidding.opensAt || 0), closing = serverNow() >= Date.parse(bidding.closesAt);
    button.textContent = !window.DraftOnline.connected() ? 'Reconnecting…' : busy ? 'Sending…' : opening ? 'Next pick opening…' : closing ? 'Closing bids…' : leading ? 'You’re leading' : full ? 'Your roster is full' : budget < bidding.minimumBid ? 'Budget reached' : !valid ? 'Enter a valid bid' : bidLabel;
    button.disabled = busy || opening || closing || !valid || !window.DraftOnline.connected() || !window.DraftOnline.can('bid') || Date.parse(bidding.closesAt) <= serverNow();
    $('player-custom-bid').hidden = leading || full || budget < bidding.minimumBid;
    $('player-skip').hidden = !window.DraftOnline.isHost() || bidding.leaderTeam !== null;
    $('player-skip').disabled = busy || !skipAvailable || Date.parse(bidding.closesAt) <= serverNow();
    $('player-skip').textContent = skipAvailable ? 'Skip Pokémon' : 'No skips left';
    $('player-skip').title = skipAvailable ? 'Discard this Pokémon for the rest of this draft' : 'All remaining Pokémon are needed to fill every roster';
    $('player-bid-wallet').textContent = `${money(budget)} available · ${23 - sale.counts[own()]} spots left`;
  }
  function refresh() {
    if (!snapshot) return;
    const { lobby } = snapshot, sale = lobby.auction, selected = adapter.getTeamIndex();
    const key = JSON.stringify([lobby.teams.map(t => t.name), sale?.budgets, sale?.counts, sale?.fieldCounts, sale?.boxed, selected, own()]);
    if (cards.dataset.key !== key) {
      cards.dataset.key = key;
      cards.replaceChildren(...lobby.teams.map((team, i) => {
        const button = make('button', 'online-team-card'); button.type = 'button'; button.dataset.onlineTeam = String(i); button.setAttribute('aria-pressed', String(i === selected));
        const top = make('span', 'online-team-card-name', team.name); if (i === own()) top.append(make('small', '', 'YOU'));
        const detail = make('span', 'online-team-card-detail'); detail.append(make('strong', '', money(sale?.budgets[i] ?? 1000)), make('span', '', `${sale?.counts[i] || 0}/23`));
        const progress = make('span', 'online-team-progress'); const bar = make('i'); bar.style.width = ((sale?.counts[i] || 0) / 23 * 100) + '%'; progress.append(bar);
        button.title = `${team.name}: ${sale?.counts[i] || 0} drafted, ${sale?.fieldCounts?.[i] || 0} on field, ${sale?.boxed?.[i]?.length || 0} in PC Box`;
        button.append(top, detail, progress); button.addEventListener('click', () => { adapter.selectTeam(i); refresh(); }); return button;
      }));
    }
    updateConnection();
    const choice = adapter.getPlacement?.();
    status.classList.toggle('your-placement', Boolean(choice));
    status.textContent = choice ? `Place ${choice} · tap a position on your field.` : lobby.phase === 'waiting' ? 'Invite your friends. Each coach bids and builds their own team.' : lobby.phase === 'complete' ? `Draft complete · ${sale.fieldCounts.filter(n => n === 23).length}/${lobby.teamCount} lineups ready${sale.boxed[own()].length ? ' · ' + sale.boxed[own()].length + ' in your PC Box' : ''}` : `Pick ${sale.round} of ${sale.total} · ${name(own())}${sale.bidding?.leaderTeam === own() ? ' · You’re leading' : sale.bidding?.ownBid != null ? ' · You’ve been outbid' : ''}`;
    const boxed = sale?.boxed?.[selected]?.length || 0;
    boxButton.hidden = !sale?.owned[selected]?.length;
    boxButton.textContent = 'PC Box' + (boxed ? ' (' + boxed + ')' : '');
    boxButton.setAttribute('aria-controls', 'picker');
    boxButton.setAttribute('aria-expanded', String(document.body.classList.contains('online-roster-open')));
    boxButton.setAttribute('aria-label', `Open ${name(selected)}’s PC Box, ${boxed} Pokémon to place`);
    renderLauncher();
    $('board-mode-label').textContent = name(selected) + (selected === own() ? ' · Your team' : ' · Viewing');
    document.querySelector('.board-panel').removeAttribute('aria-labelledby');
  }
  function updateConnection() {
    if (!snapshot) return;
    const { lobby } = snapshot, connected = window.DraftOnline.connected();
    headerStatus.textContent = `Room ${lobby.code} · ${!connected ? 'Reconnecting…' : lobby.phase === 'waiting' ? 'Waiting for coaches' : lobby.phase === 'complete' ? 'Draft complete' : 'Live auction'}`;
    headerStatus.classList.toggle('is-offline', !connected);
    $('player-countdown').closest('.live-clock').setAttribute('aria-label', connected ? 'Time remaining' : 'Reconnecting. Auction time may have changed.');
  }
  function render(next) {
    const previous = snapshot; snapshot = next;
    if (!snapshot || snapshot.lobby.controlMode === 'host') return;
    anchorServer = next.clockSync?.serverNow ?? Date.parse(next.serverTime); anchorPerf = next.clockSync?.receivedAt ?? performance.now();
    document.body.classList.add('players-online'); dashboard.hidden = false;
    $('auction-bid-form').hidden = true; $('auction-viewer-note').hidden = true;
    const { lobby } = next, sale = lobby.auction;
    receipt.hidden = lobby.phase !== 'bidding' || sale?.lastAward?.team !== own();
    if (!receipt.hidden) { receiptText.textContent = `You won ${pokemon.get(sale.lastAward.pokemonId)?.name} · ${money(sale.lastAward.amount)}`; }
    const lot = sale?.currentPokemonId, changedLot = lastLot !== lot;
    const changedPhase = lastPhase !== lobby.phase;
    if (changedLot) { dismissed = null; tickKey = null; $('player-bid-input').value = ''; $('player-custom-bid').open = false; error.hidden = true; }
    lastLot = lot; lastPhase = lobby.phase;
    if (previous && sale?.lastAward && sale.lastAward.pokemonId !== previous.lobby.auction?.lastAward?.pokemonId && sale.lastAward.team === own()) adapter.notify(`${pokemon.get(sale.lastAward.pokemonId)?.name} won for ${money(sale.lastAward.amount)} · Sent to your PC Box`);
    refresh();
    const bidding = lobby.phase === 'bidding';
    panel.classList.toggle('live-stage-only', !bidding); controls.hidden = !bidding;
    for (const el of panel.querySelectorAll('.auction-prospect,.auction-battle-stats,#auction-scouting')) el.hidden = !bidding;
    if (bidding) {
      if (changedLot || !previous) {
        const p = pokemon.get(lot); if (!p) return;
        const stats = adapter.scoutingStats(p);
        $('auction-pokemon').textContent = p.name; $('auction-image').src = p.image; $('auction-image').alt = p.name;
        $('auction-dex').textContent = '#' + String(p.id).padStart(3, '0'); $('auction-types').textContent = p.types.join(' / ');
        $('auction-stats').textContent = `${stats.height} · ${stats.weight} lb · ${stats.forty}s est. 40`;
        adapter.renderAuctionFacts(p); panel.querySelector('.auction-dialog-body').scrollTop = 0;
      }
      const unavailable = new Set([...sale.awards.map(a => a.pokemonId), ...sale.skipped, lot]);
      const eligible = id => lobby.mode === 'both' || (lobby.mode === 'gen1' ? id <= 151 : lobby.mode === 'gen2' ? id >= 152 && id <= 251 : id >= 252);
      skipAvailable = [...pokemon.keys()].filter(id => eligible(id) && !unavailable.has(id) && !window.DraftCareers.isInducted(id)).length > sale.total - sale.awards.length - 1;
      $('auction-round').textContent = `PICK ${sale.round} OF ${sale.total}`; $('auction-title').textContent = 'Live auction'; stage.hidden = true;
      $('player-highest-bid').textContent = money(sale.bidding.highestBid);
      $('player-leader').textContent = sale.bidding.leaderTeam === null ? 'Opening bid' : sale.bidding.leaderTeam === own() ? 'You’re leading' : name(sale.bidding.leaderTeam) + ' leads';
      controls.classList.toggle('is-leading', sale.bidding.leaderTeam === own());
      const priority = ['QB', 'WR', 'TE', 'HB', 'FB', 'K'];
      const rank = role => priority.includes(role) ? priority.indexOf(role) : priority.length;
      const needs = adapter.getNeeds(own()).sort((a, b) => rank(a.role) - rank(b.role)).map(v => v.role + (v.count > 1 ? ' ×' + v.count : '')).join(' · ');
      $('player-bid-context').textContent = sale.bidding.leaderTeam === null ? 'No bids? A team gets this Pokémon free when time expires.' : 'Only the winner pays. Late bids leave at least 5 seconds to respond. A short network buffer protects bids in transit.';
      stage.dataset.needs = needs;
      let need = $('player-position-needs');
      if (!need) { need = make('p', 'player-position-needs'); need.id = 'player-position-needs'; panel.querySelector('#auction-scouting').after(need); }
      need.hidden = !needs; need.textContent = 'Your open positions · ' + needs;
      updateBidButton(); if (changedPhase || !previous) window.DraftOnline.close();
    } else {
      if ($('player-position-needs')) $('player-position-needs').hidden = true;
      stage.hidden = false; stage.replaceChildren();
      $('auction-round').textContent = lobby.phase === 'waiting' ? 'DRAFT TOGETHER' : 'BUILD YOUR LINEUP';
      $('auction-title').textContent = lobby.phase === 'waiting' ? 'Your draft room' : 'Draft complete';
      if (lobby.phase === 'waiting') {
        const joined = new Set(lobby.members.map(m => m.teamIndex)).size;
        stage.append(make('p', '', `${joined} of ${lobby.teamCount} coaches are here.`), make('p', 'player-stage-help', 'Each pick starts with 20 seconds. Late bids leave 5 seconds to respond. Won Pokémon go to your PC Box while the auction continues. You have $1,000 for 23 Pokémon.'));
        const invite = make('button', 'secondary-button', 'Invite friends'); invite.type = 'button'; invite.addEventListener('click', () => window.DraftOnline.shareRoom()); stage.append(invite);
        if (window.DraftOnline.isHost()) { const start = make('button', 'primary-button', 'Start live auction'); start.type = 'button'; start.disabled = joined < lobby.teamCount; start.addEventListener('click', () => request('start', {})); stage.append(start); }
        else stage.append(make('p', 'player-stage-help', 'The host will start when everyone has joined.'));
      } else {
        stage.append(make('p', '', ready() ? 'Every lineup is ready for kickoff.' : 'Your Pokémon are waiting in the PC Box.'), make('p', 'player-stage-help', ready() ? 'You can still rearrange your team before playing.' : `Open the PC Box, choose a Pokémon, then tap a field position. ${sale.fieldCounts.filter(n => n === 23).length} of ${lobby.teamCount} teams are ready.`));
        if (window.DraftOnline.isHost()) { const play = make('button', 'primary-button', 'Play match'); play.type = 'button'; play.id = 'player-play-match'; play.disabled = !ready(); play.addEventListener('click', () => { if (!desktop.matches) panel.close(); adapter.playMatch(); }); stage.append(play); }
        else stage.append(make('p', 'player-stage-help', 'The host starts the match. Results appear for everyone.'));
      }
    }
    if (!interval) interval = setInterval(clock, 200);
    clock(); present(changedLot || changedPhase); renderLauncher();
  }
  function clock() {
    if (!snapshot || snapshot.lobby.phase !== 'bidding') return;
    const bid = snapshot.lobby.auction.bidding, now = serverNow();
    const opening = now < Date.parse(bid.opensAt || 0), remaining = Math.max(0, Date.parse(opening ? bid.opensAt : bid.closesAt) - now);
    $('player-countdown').textContent = remaining ? Math.ceil(remaining / 1000) + 's' : 'Closing';
    panel.querySelector('.live-clock > span').textContent = opening ? 'next pick' : remaining ? bid.free ? 'free draw' : 'remaining' : 'finalizing bids';
    const duration = opening ? 2000 : bid.free ? 3000 : 20000;
    $('player-time-bar').style.width = Math.min(100, remaining / duration * 100) + '%';
    controls.classList.toggle('closing-soon', !opening && remaining <= 5000); updateBidButton();
    const key = bid.pokemonId + ':' + bid.closesAt;
    if (now >= Date.parse(bid.settlesAt || bid.closesAt) && tickKey !== key && window.DraftOnline.connected() && !window.DraftOnline.pending()) { tickKey = key; window.DraftOnline.request('tick').catch(() => { tickKey = null; }); }
  }
  function present(auto = false, force = false) {
    if (!snapshot) return;
    const sale = snapshot.lobby.auction, phase = snapshot.lobby.phase;
    if (desktop.matches) {
      if (panel.parentElement !== document.querySelector('main.game') || panel.matches(':modal')) { panel.close(); document.querySelector('main.game').append(panel); }
      if (!panel.open && !minimized) { panel.show(); $('auction-title').tabIndex = -1; $('auction-title').focus({ preventScroll: true }); }
      panel.querySelector('[data-close="auction-dialog"]').setAttribute('aria-label', 'Minimize auction');
    } else {
      if (panel.parentElement !== document.body || (panel.open && !panel.matches(':modal'))) { panel.close(); document.body.append(panel); }
      const shouldShow = phase === 'bidding' ? sale.counts[own()] < 23 && sale.budgets[own()] > 0 && !minimized : phase === 'complete' && window.DraftOnline.isHost() && !minimized;
      if ((force || (auto && shouldShow)) && !panel.open && !document.querySelector('dialog:modal')) { adapter.closePicker(false); panel.showModal(); $('auction-title').tabIndex = -1; $('auction-title').focus({ preventScroll: true }); }
      panel.querySelector('[data-close="auction-dialog"]').setAttribute('aria-label', 'Minimize auction and view field');
    }
  }
  function renderLauncher() {
    if (!snapshot) { launcher.hidden = true; return; }
    const { lobby } = snapshot;
    launcher.hidden = (panel.open && !document.body.classList.contains('online-roster-open')) || lobby.phase === 'waiting' || (lobby.phase === 'complete' && (!window.DraftOnline.isHost() || !ready()));
    launcher.textContent = lobby.phase === 'bidding' ? `Live auction · ${pokemon.get(lobby.auction.currentPokemonId)?.name}` : lobby.phase === 'complete' ? window.DraftOnline.isHost() ? 'Play match' : 'Draft complete' : 'View winning pick';
  }
  function minimize() { if (!snapshot) return; minimized = true; document.body.classList.add('auction-minimized'); panel.close(); renderLauncher(); }
  function open() { if (!snapshot) return; dismissed = null; minimized = false; document.body.classList.remove('auction-minimized'); adapter.closePicker(false); present(true, true); renderLauncher(); }
  function stop() {
    snapshot = null; lastLot = lastPhase = dismissed = null; minimized = false; document.body.classList.remove('auction-minimized'); boxButton.hidden = true; clearInterval(interval); interval = null;
    dashboard.hidden = true; launcher.hidden = true; receipt.hidden = true; headerStatus.textContent = ''; controls.hidden = true; stage.hidden = true;
    panel.close(); document.body.append(panel); panel.classList.remove('live-stage-only');
    for (const el of panel.querySelectorAll('.auction-prospect,.auction-battle-stats,#auction-scouting')) el.hidden = false;
    $('auction-bid-form').hidden = false; if ($('player-position-needs')) $('player-position-needs').hidden = true;
  }
  window.DraftLiveAuction = { init, render, refresh, open, minimize, stop };
})();
