/* Shared lobbies: authoritative server state, compact controls, and live text chat. */
(() => {
  'use strict';
  const storageKey = 'pokemon-draft-online-v1';
  const $ = id => document.getElementById(id);
  const node = (tag, cls, value) => { const el = document.createElement(tag); if (cls) el.className = cls; if (value !== undefined) el.textContent = value; return el; };
  const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clean = text => String(text || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const pokemon = new Map((window.POKEMON || []).map(p => [p.id, p]));
  let adapter = {}, current = null, saved = {}, initialized = false, timer = null, polling = false, pending = false, offline = false;
  let panelOpen = false, roomOpen = false, unread = 0, seenMessage = null, selectedTeam = 0, leagueCache = null, pollFailures = 0;
  let lastState = '', lastMembers = '', lastChat = '', queuedInvite = null, actionPromise = Promise.resolve();
  let sessionEpoch = 0, connectionAttempt = 0;
  const etags = new Map();
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { saved = {}; }
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* In-memory membership still works. */ } }
  function syncRoomUrl(code, remove = false) {
    try {
      const url = new URL(location.href);
      if (remove) { if (url.searchParams.get('lobby') !== code) return; url.searchParams.delete('lobby'); }
      else url.searchParams.set('lobby', code);
      history.replaceState(history.state, '', url.href);
    } catch { /* Room membership also persists independently of the address bar. */ }
  }
  const active = () => Boolean(current?.lobby && saved.token);
  const isHost = () => active() && (current.member?.isHost || current.member?.role === 'host');
  const token = () => saved.token || saved.leagueToken || saved.leagueReadToken;
  const name = index => current?.lobby?.teams?.[index]?.name || `Team ${index + 1}`;
  function errorText(error) { return error?.message || 'The server could not complete that action. Try again.'; }
  function showError(message, target = 'online-error') { const el = $(target); if (!el) return; el.textContent = message; el.hidden = !message; }
  async function api(path, { method = 'GET', body, authorize = true } = {}) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const conditional = method === 'GET' && /^\/api\/lobbies\//.test(path);
      const etagKey = path + ':' + (authorize ? token() || '' : '');
      const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authorize && token() ? { Authorization: `Bearer ${token()}` } : {}), ...(conditional && etags.has(etagKey) ? { 'If-None-Match': etags.get(etagKey) } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      if (response.status === 304) return null;
      let data; try { data = await response.json(); } catch { throw new Error('Online play is not configured on this deployment yet.'); }
      if (!response.ok) { const error = new Error(data.error || 'The server could not complete that request.'); error.status = response.status; error.code = data.code; throw error; }
      if (conditional && response.headers.get('ETag')) etags.set(etagKey, response.headers.get('ETag'));
      return data;
    } catch (error) { if (error.name === 'AbortError') throw new Error('The server took too long to respond. Your saved lobby can reconnect.'); throw error; }
    finally { clearTimeout(timeout); }
  }
  function accept(data, { fresh = false } = {}) {
    if (!data?.lobby) { if (data?.league) leagueCache = data.league; else if (data?.id && data?.careers) leagueCache = data; return data; }
    if (current?.lobby?.code === data.lobby.code && Number(data.lobby.version) < Number(current.lobby.version)) return current;
    const memberToken = data.member?.token || data.token;
    if (memberToken) saved.token = memberToken;
    if (saved.leagueId && saved.leagueId !== data.lobby.leagueId) { delete saved.leagueToken; delete saved.leagueReadToken; }
    if (data.leagueToken) saved.leagueToken = data.leagueToken;
    if (data.leagueReadToken) saved.leagueReadToken = data.leagueReadToken;
    saved.code = data.lobby.code; saved.leagueId = data.lobby.leagueId; saved.nickname = data.member?.nickname || saved.nickname || '';
    if (fresh) { sessionEpoch++; syncRoomUrl(data.lobby.code); queuedInvite = null; }
    if (data.member?.teamIndex != null && fresh) selectedTeam = data.member.teamIndex;
    if (selectedTeam >= data.lobby.teamCount) selectedTeam = 0;
    current = data; leagueCache = data.league || leagueCache; offline = false; pollFailures = 0; persist();
    const stateKey = `${data.lobby.code}:${data.lobby.version}:${data.league?.revision || 0}`;
    if (stateKey !== lastState || fresh) { lastState = stateKey; adapter.onSnapshot?.(data); }
    render(); schedule(); return data;
  }
  function stopPoll() { clearTimeout(timer); timer = null; }
  function schedule() { stopPoll(); if (saved.code && saved.token) timer = setTimeout(poll, document.hidden ? 12000 : 1400); }
  async function poll() {
    if (!saved.code || !saved.token || polling || pending) { schedule(); return; }
    polling = true; const epoch = sessionEpoch, code = saved.code;
    try { const result = await api(`/api/lobbies/${encodeURIComponent(code)}`); if (epoch !== sessionEpoch || saved.code !== code) return; if (result) accept(result); else { offline = false; pollFailures = 0; renderStatus(); } }
    catch (error) {
      if (epoch !== sessionEpoch || saved.code !== code) return;
      if (error.status === 410 || error.status === 404 || error.status === 401 || error.status === 403) {
        stopPoll(); sessionEpoch++; const expired = error.status === 410; syncRoomUrl(saved.code, true); current = null; delete saved.code; delete saved.token; persist(); lastState = ''; adapter.onExit?.();
        if (leagueCache) adapter.onLeague?.(leagueCache);
        else if (saved.leagueId && (saved.leagueToken || saved.leagueReadToken)) refreshLeague().catch(() => {});
        render();
        showError(expired ? 'This lobby expired after an hour of inactivity. Its career records and Hall collections remain saved.' : errorText(error));
        open();
      } else { offline = true; pollFailures++; render(); schedule(); }
    } finally { polling = false; schedule(); }
  }
  function request(type, payload = {}) {
    const requestedEpoch = sessionEpoch;
    const run = async () => {
      if (requestedEpoch !== sessionEpoch) return null;
      if (!active()) throw new Error('Join an online lobby first.');
      if (!isHost()) throw new Error('Only the host can change the draft or simulate games.');
      pending = true; renderStatus();
      try { const result = await api(`/api/lobbies/${current.lobby.code}/action`, { method: 'POST', body: { actionId: id(), version: current.lobby.version, type, payload } }); if (requestedEpoch !== sessionEpoch) return null; showError(''); return accept(result); }
      catch (error) { if (requestedEpoch !== sessionEpoch) return null; if (error.status === 409) { try { const refreshed = await api(`/api/lobbies/${current.lobby.code}`); if (requestedEpoch === sessionEpoch && refreshed) accept(refreshed); } catch {} } if (requestedEpoch !== sessionEpoch) return null; showError(errorText(error)); throw error; }
      finally { pending = false; renderStatus(); schedule(); }
    };
    const result = actionPromise.then(run, run); actionPromise = result.catch(() => {}); return result;
  }
  async function hallAction(pokemonId, kind) {
    const leagueId = current?.lobby?.leagueId || saved.leagueId;
    if (!leagueId || !token()) throw new Error('Create or join a lobby to use the shared Hall collections.');
    if (active() && !isHost()) throw new Error('Only the host can change this league’s Hall collections.');
    const result = await api(`/api/leagues/${encodeURIComponent(leagueId)}/hall`, { method: 'POST', body: { pokemonId, kind, actionId: id() } });
    if (saved.leagueId !== leagueId) return leagueCache;
    if (result.lobby) accept(result); else { leagueCache = result.league || result; if (current) { current.league = leagueCache; adapter.onSnapshot?.(current); } else adapter.onLeague?.(leagueCache); }
    return leagueCache;
  }
  async function refreshLeague() {
    if (!saved.leagueId || !token()) return leagueCache;
    const leagueId = saved.leagueId, epoch = sessionEpoch;
    const result = await api(`/api/leagues/${encodeURIComponent(leagueId)}`);
    if (saved.leagueId !== leagueId || epoch !== sessionEpoch) return leagueCache;
    leagueCache = result.league || result; if (!active()) adapter.onLeague?.(leagueCache); return leagueCache;
  }
  function open() {
    if (!initialized) return;
    $('online-dialog').showModal(); roomOpen = true; render();
    requestAnimationFrame(() => { (active() ? $('online-room-close') : $('online-dismiss')).focus({ preventScroll: true }); syncViewport(); });
  }
  function close() { $('online-dialog')?.close(); roomOpen = false; }
  function leave() {
    stopPoll(); sessionEpoch++; connectionAttempt++; syncRoomUrl(saved.code, true); current = null; delete saved.code; delete saved.token; persist(); lastState = ''; lastMembers = ''; lastChat = ''; unread = 0;
    if (panelOpen) togglePanel(false); close(); adapter.onExit?.(); if (leagueCache) adapter.onLeague?.(leagueCache); render();
  }
  async function shareRoom() {
    if (!active()) return;
    const url = new URL(location.href); url.hash = ''; url.searchParams.set('lobby', current.lobby.code);
    const info = { title: 'Pokémon Draft League', text: `Join our draft · room ${current.lobby.code}`, url: url.href };
    try { if (navigator.share) await navigator.share(info); else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url.href); $('online-invite-button').textContent = 'Link copied'; setTimeout(() => { $('online-invite-button').textContent = 'Invite friends'; }, 1800); } else { $('online-share-url').value = url.href; $('online-share-url').hidden = false; $('online-share-url').select(); } }
    catch (error) { if (error.name !== 'AbortError') showError('Use the four-digit room code to invite friends.', 'online-room-error'); }
  }
  function togglePanel(force) {
    panelOpen = force === undefined ? !panelOpen : Boolean(force); $('online-side-panel').hidden = !panelOpen;
    $('online-chat-button').setAttribute('aria-expanded', String(panelOpen));
    if (panelOpen) {
      // A modal makes the rest of the page inert, including a sibling chat panel.
      // Keep chat inside its top layer while bidding so conversation stays usable.
      const modal = [...document.querySelectorAll('dialog[open]')].at(-1);
      (modal || document.body).append($('online-side-panel'));
      unread = 0; renderStatus(); renderPanel(); requestAnimationFrame(() => { $('online-chat-messages').scrollTop = $('online-chat-messages').scrollHeight; syncViewport(); });
    }
    else if (document.activeElement === $('online-chat-input')) $('online-chat-input').blur();
    document.body.classList.toggle('online-chat-open', panelOpen);
  }
  function selectTeam(index) { if (!active() || index < 0 || index >= current.lobby.teamCount) return; selectedTeam = index; adapter.onTeamSelect?.(index); renderPanel(); }
  function teamOptions(select, value) {
    const optionsKey = JSON.stringify(current?.lobby?.teams?.map(t => t.name));
    if (select.dataset.options !== optionsKey) { select.replaceChildren(...(current?.lobby?.teams || []).map((t, i) => { const option = node('option', '', t.name || `Team ${i + 1}`); option.value = i; return option; })); select.dataset.options = optionsKey; }
    select.value = String(value);
  }
  function renderStatus() {
    const joined = active();
    document.querySelectorAll('[data-online-chat]').forEach(button => { button.hidden = !joined; });
    $('online-lobby-button').textContent = joined ? `Room ${current.lobby.code}` : 'Online lobby';
    $('online-live-bar').hidden = !joined;
    $('online-chat-button').hidden = !joined;
    if (!joined) return;
    const dot = $('online-live-dot'); dot.classList.toggle('offline', offline);
    $('online-live-role').textContent = offline ? 'Reconnecting…' : pending ? 'Saving…' : isHost() ? 'Host controls' : 'Viewing live';
    $('online-live-code').textContent = current.lobby.code;
    $('online-unread').textContent = unread > 99 ? '99+' : String(unread); $('online-unread').hidden = !unread;
    $('online-live-bar').title = offline ? 'Your connection was interrupted. Keep this tab open to reconnect.' : 'Open room details and invite friends';
    $('online-start-button').disabled = pending || offline;
  }
  function renderMembers() {
    const lobby = current.lobby, key = JSON.stringify(lobby.members || []);
    if (key === lastMembers) return; lastMembers = key;
    $('online-members').replaceChildren(...(lobby.members || []).map(member => {
      const row = node('div', 'online-member');
      row.append(node('span', 'online-avatar', (member.nickname || '?').slice(0, 1).toUpperCase()));
      const text = node('div'); text.append(node('strong', '', member.nickname || 'Guest'), node('span', '', member.role === 'host' || member.isHost ? 'Host · draft controls' : member.teamIndex != null ? name(member.teamIndex) : 'Viewer · chat enabled')); row.append(text);
      if (member.id === current.member?.id) row.append(node('small', '', 'You'));
      return row;
    }));
  }
  function renderRoom() {
    const joined = active(); $('online-setup').hidden = joined; $('online-room').hidden = !joined;
    if (!joined) return;
    const lobby = current.lobby;
    $('online-room-code').textContent = lobby.code;
    const pool = { gen1: 'Gen 1', gen2: 'Gen 2', gen3: 'Gen 3', both: 'All generations' }[lobby.mode] || lobby.mode;
    $('online-room-summary').textContent = `${lobby.teamCount} teams · ${pool} · $1,000 per team`;
    $('online-room-phase').textContent = lobby.phase === 'waiting' ? 'Waiting for the host to start' : lobby.phase === 'complete' ? 'Draft complete · ready to play' : lobby.phase === 'placement' ? 'Host is placing the latest pick' : 'Auction in progress';
    $('online-start-button').hidden = !isHost() || lobby.phase !== 'waiting';
    $('online-host-note').textContent = isHost() ? 'You enter bids, skip prospects, assign positions, choose schemes, and run matches. Everyone can browse teams and chat.' : 'The host manages bids, positions, schemes, and games. You can browse every team and chat live.';
    renderMembers();
  }
  function renderChat() {
    const messages = current?.lobby?.messages || [], key = JSON.stringify(messages);
    if (key === lastChat) return;
    const initial = !lastChat; lastChat = key;
    const last = messages.at(-1)?.id || null;
    if (!initial && last !== seenMessage && !panelOpen) {
      const oldIndex = messages.findIndex(m => m.id === seenMessage);
      unread += messages.slice(oldIndex + 1).filter(m => m.memberId !== current.member?.id && !m.system).length;
    }
    seenMessage = last;
    const list = $('online-chat-messages'), atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 70;
    const rows = messages.map(message => {
      const own = message.memberId === current.member?.id;
      const row = node('div', `online-message${own ? ' own' : ''}${message.system ? ' system' : ''}`);
      if (!message.system) { const heading = node('div', 'online-message-meta'); heading.append(node('strong', '', own ? 'You' : message.nickname || 'Guest')); const time = node('time'); try { time.dateTime = message.createdAt; time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch {} heading.append(time); row.append(heading); }
      row.append(node('p', '', message.message || message.text || '')); return row;
    });
    if (!rows.length) { const empty = node('div', 'online-chat-empty'); empty.append(node('strong', '', 'Talk draft.'), node('p', '', 'Call your picks, negotiate positions, or celebrate a steal.')); rows.push(empty); }
    list.replaceChildren(...rows);
    if (atEnd || initial) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    renderStatus();
  }
  function renderPanel() {
    if (!active()) return;
    const idx = adapter.getTeamIndex?.(); if (Number.isInteger(idx) && idx >= 0 && idx < current.lobby.teamCount) selectedTeam = idx;
    teamOptions($('online-panel-team'), selectedTeam);
    const needs = adapter.getNeeds?.(selectedTeam) || [];
    const entries = Array.isArray(needs) ? needs : Object.entries(needs).map(([role, count]) => ({ role, count }));
    const grouped = new Map(); entries.forEach(item => { const role = typeof item === 'string' ? item : item.role; const count = typeof item === 'string' ? 1 : item.count ?? 1; if (role && count > 0) grouped.set(role, (grouped.get(role) || 0) + count); });
    $('online-needs').replaceChildren(...([...grouped].map(([role, count]) => node('span', 'online-need', `${role}${count > 1 ? ` ×${count}` : ''}`))));
    $('online-needs-empty').hidden = grouped.size > 0;
    const owned = current.lobby.auction?.owned?.[selectedTeam] || [];
    const placed = new Map(Object.entries(current.lobby.teams[selectedTeam]?.picks || {}).map(([key, value]) => [value, key]));
    $('online-owned-count').textContent = String(owned.length);
    $('online-owned').replaceChildren(...owned.map(pokemonId => {
      const p = pokemon.get(pokemonId), row = node('div', 'online-owned-pokemon'), image = node('img'); image.src = p?.image || ''; image.alt = ''; image.loading = 'lazy'; image.width = 38; image.height = 38;
      const info = node('div'); info.append(node('strong', '', p?.name || `#${pokemonId}`), node('span', '', placed.has(pokemonId) ? (placed.get(pokemonId) === 's_k' ? 'K' : placed.get(pokemonId).replace(/^[od]_/, '').toUpperCase()) : 'Awaiting position')); row.append(image, info); return row;
    }));
    $('online-owned-empty').hidden = owned.length > 0;
    $('online-chat-connection').textContent = offline ? 'Reconnecting · messages will be available when online' : `${current.lobby.members?.length || 1} in room · everyone can chat`;
    renderChat();
  }
  function render() { if (!initialized) return; renderStatus(); renderRoom(); if (active()) renderPanel(); }
  async function submitSetup(event) {
    event.preventDefault(); const attempt = ++connectionAttempt, button = $('online-create-button'); button.disabled = true; showError('');
    const teamCount = Number($('online-team-count').value), nickname = clean($('online-nickname').value);
    if (!nickname) { showError('Enter your display name so friends know who is hosting.'); $('online-nickname').focus(); button.disabled = false; return; }
    try {
      const result = await api('/api/lobbies', { method: 'POST', authorize: false, body: { teamCount, mode: $('online-pool').value, names: Array.from({ length: teamCount }, (_, i) => clean($(`online-name-${i}`).value) || `Team ${i + 1}`), nickname, ...(saved.leagueId && saved.leagueToken ? { leagueId: saved.leagueId, leagueToken: saved.leagueToken } : {}) } });
      if (attempt !== connectionAttempt) return; accept(result, { fresh: true }); showError('');
    } catch (error) { if (attempt === connectionAttempt) showError(errorText(error)); }
    finally { button.disabled = false; }
  }
  async function submitJoin(event) {
    event.preventDefault(); const attempt = ++connectionAttempt, button = $('online-join-button'); button.disabled = true; showError('');
    const code = $('online-code').value.trim(), nickname = clean($('online-join-nickname').value);
    if (!/^\d{4}$/.test(code)) { showError('Enter the four-digit room code.'); $('online-code').focus(); button.disabled = false; return; }
    if (!nickname) { showError('Enter a display name to join the room.'); $('online-join-nickname').focus(); button.disabled = false; return; }
    try { const result = await api('/api/lobbies/join', { method: 'POST', authorize: false, body: { code, nickname } }); if (attempt === connectionAttempt) accept(result, { fresh: true }); }
    catch (error) { if (attempt === connectionAttempt) showError(errorText(error)); }
    finally { button.disabled = false; }
  }
  async function submitChat(event) {
    event.preventDefault(); const input = $('online-chat-input'), message = input.value.trim(); if (!message || !active()) return;
    const epoch = sessionEpoch;
    const submit = $('online-chat-send'); submit.disabled = true; showError('', 'online-chat-error');
    try { const data = await api(`/api/lobbies/${current.lobby.code}/chat`, { method: 'POST', body: { message, actionId: id() } }); if (epoch !== sessionEpoch) return; input.value = ''; accept(data); requestAnimationFrame(() => { $('online-chat-messages').scrollTop = $('online-chat-messages').scrollHeight; }); }
    catch (error) { if (epoch === sessionEpoch) showError(errorText(error), 'online-chat-error'); }
    finally { submit.disabled = false; }
  }
  function setupTeamCount() { const count = Number($('online-team-count').value); document.querySelectorAll('[data-online-name]').forEach(el => { el.hidden = Number(el.dataset.onlineName) >= count; }); $('online-setup-total').textContent = `${count * 23} Pokémon · 23 per team, including a kicker`; }
  function syncViewport() {
    const view = window.visualViewport, height = view?.height || innerHeight, top = view?.offsetTop || 0;
    const keyboard = document.activeElement === $('online-chat-input') && height < innerHeight * .85;
    const panel = $('online-side-panel'); if (panel) { panel.style.setProperty('--online-view-height', `${Math.max(180, height - 16)}px`); panel.style.setProperty('--online-view-top', `${top + 8}px`); panel.classList.toggle('keyboard-open', keyboard); }
  }
  function init(options = {}) {
    adapter = options; if (initialized) { render(); return; } initialized = true;
    const menuButton = node('button', 'menu-action', 'Online lobby'); menuButton.type = 'button'; menuButton.id = 'online-lobby-button';
    (document.querySelector('.menu-actions') || $('draft-menu') || document.body).append(menuButton);
    const bar = node('div', 'online-live-bar'); bar.id = 'online-live-bar'; bar.hidden = true;
    bar.innerHTML = '<button type="button" id="online-live-room"><i id="online-live-dot" aria-hidden="true"></i><span>ROOM <strong id="online-live-code"></strong></span><span id="online-live-role"></span></button><button type="button" id="online-chat-button" aria-expanded="false" aria-controls="online-side-panel">Chat <span id="online-unread" hidden>0</span></button>';
    (document.querySelector('main.game') || document.querySelector('main')).before(bar);
    const dialog = node('dialog', 'online-dialog'); dialog.id = 'online-dialog'; dialog.setAttribute('aria-labelledby', 'online-title');
    dialog.innerHTML = `<div class="dialog-heading"><div><span class="eyebrow">DRAFT TOGETHER</span><h2 id="online-title">Online lobby</h2></div><button type="button" id="online-dismiss" class="icon-button" aria-label="Close lobby">×</button></div>
      <p id="online-error" class="online-error" role="alert" hidden></p>
      <div id="online-setup"><div class="online-setup-tabs" role="group" aria-label="Lobby action"><button type="button" id="online-host-tab" aria-pressed="true">Host a lobby</button><button type="button" id="online-join-tab" aria-pressed="false">Join friends</button></div>
      <form id="online-host-form"><label class="online-label" for="online-nickname">Your display name</label><input id="online-nickname" class="online-input" maxlength="24" placeholder="Your name" autocomplete="nickname">
      <div class="online-setup-options"><label>Teams<select id="online-team-count"><option value="2">2 teams</option><option value="3">3 teams</option><option value="4">4 teams</option></select></label><label>Pokémon pool<select id="online-pool"><option value="gen1">Gen 1 · Kanto</option><option value="gen2">Gen 2 · Johto</option><option value="gen3">Gen 3 · Hoenn</option><option value="both" selected>All · 386 Pokémon</option></select></label></div><p class="online-help" id="online-setup-total">46 Pokémon · 23 per team, including a kicker</p>
      <div class="online-team-names">${Array.from({length:4},(_,i)=>`<label data-online-name="${i}"${i>1?' hidden':''}>Team ${i+1}<input id="online-name-${i}" class="online-input" maxlength="24" placeholder="Team ${i+1}" autocomplete="off"></label>`).join('')}</div>
      <p class="online-help">You control the auction and games. Your friends can view teams and chat from their own devices.</p><button type="submit" id="online-create-button" class="primary-button online-wide">Create lobby</button></form>
      <form id="online-join-form" hidden><label class="online-label" for="online-code">Four-digit room code</label><input id="online-code" class="online-input online-code-input" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="0000" autocomplete="off"><label class="online-label" for="online-join-nickname">Your display name</label><input id="online-join-nickname" class="online-input" maxlength="24" placeholder="Your name" autocomplete="nickname"><p class="online-help">Join the live draft, browse every roster, and talk in the room chat.</p><button type="submit" id="online-join-button" class="primary-button online-wide">Join lobby</button></form></div>
      <div id="online-room" hidden><div class="online-code-block"><span>INVITE CODE</span><strong id="online-room-code"></strong><p id="online-room-summary"></p></div><div class="online-room-actions"><button type="button" id="online-invite-button" class="secondary-button">Invite friends</button><button type="button" id="online-room-chat" class="secondary-button">Open chat</button></div><input id="online-share-url" class="online-input" readonly hidden aria-label="Lobby invitation link"><p id="online-room-phase" class="online-room-phase"></p><div id="online-members" class="online-members"></div><p id="online-host-note" class="online-help"></p><p class="online-help online-expiry-note">Room expires after one hour without a draft action or chat message. Career records stay saved.</p><p id="online-room-error" class="online-error" role="alert" hidden></p><button type="button" id="online-start-button" class="primary-button online-wide">Start auction</button><div class="online-room-footer"><button type="button" id="online-room-close" class="text-button">Back to field</button><button type="button" id="online-leave-button" class="text-button">Leave lobby</button></div></div>`;
    const panel = node('aside', 'online-side-panel'); panel.id = 'online-side-panel'; panel.hidden = true; panel.setAttribute('aria-labelledby', 'online-chat-title');
    panel.innerHTML = `<div class="online-panel-heading"><div><span class="eyebrow">THE SIDELINE</span><h2 id="online-chat-title">Room chat</h2></div><button type="button" id="online-panel-close" class="icon-button" aria-label="Close chat">×</button></div><p id="online-chat-connection" class="online-chat-connection"></p><details class="online-team-intel"><summary>Your draft room <span>Needs &amp; roster</span></summary><div class="online-intel-content"><label class="online-label" for="online-panel-team">View team</label><select id="online-panel-team" aria-label="Team to inspect"></select><div class="online-needs-heading">POSITIONS TO FILL</div><div id="online-needs" class="online-needs"></div><p id="online-needs-empty" class="online-help" hidden>Every position is filled.</p><details class="online-owned-details"><summary>Owned Pokémon <span id="online-owned-count">0</span></summary><div id="online-owned" class="online-owned"></div><p id="online-owned-empty" class="online-help">Your first pick is waiting.</p></details></div></details><div id="online-chat-messages" class="online-chat-messages" role="log" aria-label="Lobby messages" aria-live="polite" aria-relevant="additions"></div><p id="online-chat-error" class="online-error" role="alert" hidden></p><form id="online-chat-form" class="online-chat-form"><label class="online-sr-only" for="online-chat-input">Message your lobby</label><input id="online-chat-input" type="text" maxlength="500" placeholder="Message the room…" autocomplete="off" enterkeyhint="send"><button type="submit" id="online-chat-send" aria-label="Send chat message"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/></svg></button></form>`;
    document.body.append(dialog, panel);
    ['auction-dialog', 'match-dialog', 'matchup-dialog'].forEach(dialogId => {
      const modal = $(dialogId), heading = modal?.querySelector('.dialog-heading');
      if (!heading) return;
      const button = node('button', 'online-modal-chat', 'Chat'); button.type = 'button'; button.hidden = true; button.dataset.onlineChat = 'true';
      button.addEventListener('click', () => togglePanel(true)); heading.insertBefore(button, heading.lastElementChild);
      modal.addEventListener('close', () => { if (modal.contains(panel)) document.body.append(panel); });
    });
    $('online-nickname').value = saved.nickname || ''; $('online-join-nickname').value = saved.nickname || '';
    menuButton.addEventListener('click', open); $('online-live-room').addEventListener('click', open); $('online-dismiss').addEventListener('click', close); $('online-room-close').addEventListener('click', close);
    $('online-leave-button').addEventListener('click', leave); $('online-invite-button').addEventListener('click', shareRoom);
    $('online-chat-button').addEventListener('click', () => togglePanel()); $('online-panel-close').addEventListener('click', () => togglePanel(false)); $('online-room-chat').addEventListener('click', () => { close(); togglePanel(true); });
    $('online-team-count').addEventListener('change', setupTeamCount); $('online-host-form').addEventListener('submit', submitSetup); $('online-join-form').addEventListener('submit', submitJoin); $('online-chat-form').addEventListener('submit', submitChat); $('online-panel-team').addEventListener('change', event => selectTeam(Number(event.target.value)));
    $('online-start-button').addEventListener('click', async () => { try { await request('start'); close(); } catch(error) { showError(errorText(error), 'online-room-error'); } });
    function setTab(join) { $('online-host-tab').setAttribute('aria-pressed', String(!join)); $('online-join-tab').setAttribute('aria-pressed', String(join)); $('online-host-form').hidden = join; $('online-join-form').hidden = !join; showError(''); }
    $('online-host-tab').addEventListener('click', () => setTab(false)); $('online-join-tab').addEventListener('click', () => setTab(true));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && panelOpen && !dialog.open) togglePanel(false); });
    dialog.addEventListener('close', () => { roomOpen = false; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { stopPoll(); poll(); } });
    window.addEventListener('online', () => { stopPoll(); poll(); }); window.visualViewport?.addEventListener('resize', syncViewport); window.visualViewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    $('online-chat-input').addEventListener('focus', () => requestAnimationFrame(syncViewport));
    $('online-chat-input').addEventListener('blur', () => requestAnimationFrame(syncViewport));
    render();
    const url = new URL(location.href), invite = url.searchParams.get('lobby');
    if (invite && /^\d{4}$/.test(invite)) { queuedInvite = invite; $('online-code').value = invite; setTab(true); if (!saved.code || saved.code !== invite) { open(); } }
    if (saved.code && saved.token && (!queuedInvite || queuedInvite === saved.code)) poll();
    else if (saved.leagueId && (saved.leagueToken || saved.leagueReadToken)) refreshLeague().catch(() => {});
  }
  window.DraftOnline = Object.freeze({ init, active, isHost, state: () => current, league: () => leagueCache, request, open, leave, hallAction, refreshLeague, refreshNeeds: renderPanel, selectTeam, pending: () => pending });
})();
