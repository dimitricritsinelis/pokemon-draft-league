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
  const ownsTeam = index => active() && Number.isInteger(index) && index === current.member?.teamIndex;
  function can(type, payload = {}) {
    if (!active()) return false;
    if (type === 'tick') return true;
    if (current.lobby.controlMode === 'host') return isHost();
    if (type === 'bid') {
      const index = current.member?.teamIndex, sale = current.lobby.auction, bidding = sale?.bidding;
      return ownsTeam(index) && (payload.teamIndex ?? payload.team ?? index) === index && current.lobby.phase === 'bidding' && sale.counts[index] < current.lobby.rosterSize &&
        sale.budgets[index] >= (bidding?.minimumBid ?? 0) && bidding?.leaderTeam !== index;
    }
    if (['place', 'scheme', 'rename'].includes(type)) return ownsTeam(payload.teamIndex ?? payload.team ?? current.member?.teamIndex);
    if (type === 'start') return isHost() && new Set((current.lobby.members || []).map(member => member.teamIndex).filter(Number.isInteger)).size === current.lobby.teamCount;
    return ['configure', 'start', 'skip', 'simulate'].includes(type) && isHost();
  }
  const token = () => saved.token || saved.leagueToken || saved.leagueReadToken;
  const name = index => current?.lobby?.teams?.[index]?.name || `Team ${index + 1}`;
  function errorText(error) { return error?.message || 'The server could not complete that action. Try again.'; }
  function showError(message, target = 'online-error') { const el = $(target); if (!el) return; el.textContent = message; el.hidden = !message; }
  async function api(path, { method = 'GET', body, authorize = true, authToken } = {}) {
    const started = performance.now();
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const conditional = method === 'GET' && !authToken && /^\/api\/lobbies\//.test(path);
      const bearer = authorize ? authToken || token() : '';
      const etagKey = path + ':' + (bearer || '');
      const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(conditional && etags.has(etagKey) ? { 'If-None-Match': etags.get(etagKey) } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      if (response.status === 304) return null;
      let data; try { data = await response.json(); } catch { throw new Error('Online play is not configured on this deployment yet.'); }
      if (data?.serverTime) { const received = performance.now(), roundTrip = Math.max(0, received - started - (Number(data.serverProcessingMs) || 0)); data.clockSync = { serverNow: Date.parse(data.serverTime) + roundTrip / 2, receivedAt: received, uncertaintyMs: roundTrip / 2 }; }
      if (!response.ok) { const error = new Error(data.error || 'The server could not complete that request.'); error.status = response.status; error.code = data.code; if (data.lobby && data.member) error.snapshot = data; throw error; }
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
    if (fresh) { sessionEpoch++; syncRoomUrl(data.lobby.code); queuedInvite = null; if (saved.resume?.code === data.lobby.code) delete saved.resume; }
    if (data.member?.teamIndex != null && fresh) selectedTeam = data.member.teamIndex;
    if (selectedTeam >= data.lobby.teamCount) selectedTeam = 0;
    current = data; leagueCache = data.league || leagueCache; offline = false; pollFailures = 0; persist();
    const stateKey = `${data.lobby.code}:${data.lobby.version}:${data.league?.revision || 0}`;
    if (stateKey !== lastState || fresh) { lastState = stateKey; adapter.onSnapshot?.(data); }
    render(); schedule(); return data;
  }
  function stopPoll() { clearTimeout(timer); timer = null; }
  function schedule() { stopPoll(); if (saved.code && saved.token) timer = setTimeout(poll, document.hidden ? 12000 : 1000); }
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
      if (!can(type, payload)) {
        const ownAction = ['place', 'scheme', 'rename', 'bid'].includes(type) && current.lobby.controlMode !== 'host';
        const error = new Error(type === 'bid' ? 'You cannot bid right now. Check the current price, your balance, and whether you are already leading.' : type === 'start' && isHost() ? 'Invite a coach for every team before starting.' : ownAction ? 'You can change only your own team.' : 'Only the host can manage the room or start matches.');
        error.status = 403; error.code = ownAction ? 'NOT_YOUR_TEAM' : 'HOST_ONLY'; throw error;
      }
      pending = true; renderStatus();
      try { const result = await api(`/api/lobbies/${current.lobby.code}/action`, { method: 'POST', body: { actionId: id(), version: current.lobby.version, type, payload } }); if (requestedEpoch !== sessionEpoch) return null; showError(''); return accept(result); }
      catch (error) {
        if (requestedEpoch !== sessionEpoch) return null;
        if (error.snapshot?.lobby.code === current.lobby.code) accept(error.snapshot);
        else if (error.status === 409) { try { const refreshed = await api(`/api/lobbies/${current.lobby.code}`); if (requestedEpoch === sessionEpoch && refreshed) accept(refreshed); } catch {} }
        if (requestedEpoch !== sessionEpoch) return null;
        showError(errorText(error)); throw error;
      }
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
    adapter.beforeOpen?.();
    $('online-dialog').showModal(); roomOpen = true; render();
    requestAnimationFrame(() => { (active() ? $('online-room-close') : $('online-dismiss')).focus({ preventScroll: true }); syncViewport(); });
  }
  function close() { $('online-dialog')?.close(); roomOpen = false; }
  function leave() {
    if (active()) saved.resume = Object.fromEntries(['code','token','leagueId','leagueToken','leagueReadToken','nickname'].filter(key => saved[key]).map(key => [key,saved[key]]));
    stopPoll(); sessionEpoch++; connectionAttempt++; syncRoomUrl(saved.code, true); current = null; delete saved.code; delete saved.token; persist(); lastState = ''; lastMembers = ''; lastChat = ''; unread = 0;
    if (panelOpen) togglePanel(false); close(); adapter.onExit?.(); if (leagueCache) adapter.onLeague?.(leagueCache); render();
  }
  async function resume() {
    const membership = saved.resume;
    if (active() || !membership?.code || !membership?.token) return;
    const attempt = ++connectionAttempt, button = $('online-resume-button'); button.disabled = true; showError('');
    try {
      const result = await api(`/api/lobbies/${encodeURIComponent(membership.code)}`, {authToken:membership.token});
      if (attempt !== connectionAttempt) return;
      Object.assign(saved, membership); accept(result, {fresh:true}); return result;
    } catch (error) {
      if (attempt !== connectionAttempt) return;
      if ([401,403,404,410].includes(error.status)) { delete saved.resume; persist(); render(); }
      showError(errorText(error));
    } finally { button.disabled = false; }
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
    ['online-chat-button', 'online-header-chat-button'].forEach(id => $(id)?.setAttribute('aria-expanded', String(panelOpen)));
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
    window.dispatchEvent(new CustomEvent('draft-online-connection', { detail: { offline, pending } }));
    document.querySelectorAll('[data-online-chat]').forEach(button => { button.hidden = !joined; });
    $('online-live-bar').hidden = !joined;
    $('online-chat-button').hidden = !joined;
    $('online-header-chat-button').hidden = !joined;
    if (!joined) return;
    const dot = $('online-live-dot'); dot.classList.toggle('offline', offline);
    $('online-live-role').textContent = offline ? 'Reconnecting…' : pending ? 'Saving…' : isHost() ? 'Host · your team' : 'Coach · your team';
    $('online-live-code').textContent = current.lobby.code;
    ['online-unread', 'online-header-unread'].forEach(id => { $(id).textContent = unread > 99 ? '99+' : String(unread); $(id).hidden = !unread; });
    $('online-live-bar').title = offline ? 'Your connection was interrupted. Keep this tab open to reconnect.' : 'Open room details and invite friends';
    const seats = new Set((current.lobby.members || []).map(member => member.teamIndex).filter(Number.isInteger)).size;
    $('online-start-button').disabled = pending || offline || current.lobby.controlMode !== 'host' && seats < current.lobby.teamCount;
  }
  function renderMembers() {
    const lobby = current.lobby, key = JSON.stringify([lobby.members || [], lobby.teams.map(team => team.name)]);
    if (key === lastMembers) return; lastMembers = key;
    $('online-members').replaceChildren(...(lobby.members || []).map(member => {
      const row = node('div', 'online-member');
      row.append(node('span', 'online-avatar', (member.nickname || '?').slice(0, 1).toUpperCase()));
      const text = node('div'); text.append(node('strong', '', member.nickname || 'Guest'), node('span', '', member.teamIndex != null ? `${name(member.teamIndex)}${member.role === 'host' || member.isHost ? ' · Host' : ' · Coach'}` : 'Spectator · chat enabled')); row.append(text);
      if (member.id === current.member?.id) row.append(node('small', '', 'You'));
      return row;
    }));
  }
  function renderRoom() {
    const joined = active(); $('online-setup').hidden = joined; $('online-room').hidden = !joined;
    $('online-play-modes').hidden = joined;
    $('online-title').textContent = joined ? 'Draft room' : 'New game';
    $('online-resume-button').hidden = joined || !saved.resume?.code;
    $('online-resume-button').textContent = saved.resume?.code ? `Resume room ${saved.resume.code}` : 'Resume room';
    if (!joined) return;
    const lobby = current.lobby;
    const seats = new Set((lobby.members || []).map(member => member.teamIndex).filter(Number.isInteger)).size;
    const missing = Math.max(0, lobby.teamCount - seats), legacy = lobby.controlMode === 'host';
    $('online-room-code').textContent = lobby.code;
    const pool = { gen1: 'Gen 1', gen2: 'Gen 2', gen3: 'Gen 3', both: 'All generations' }[lobby.mode] || lobby.mode;
    $('online-room-summary').textContent = `${lobby.teamCount} teams · ${pool} · $1,000 per team`;
    $('online-room-phase').textContent = lobby.phase === 'waiting' ? missing && !legacy ? `Invite ${missing} more ${missing === 1 ? 'coach' : 'coaches'} to start` : isHost() ? 'All coaches are here · ready to start' : 'Ready · the host can start the auction' : lobby.phase === 'complete' ? lobby.auction?.fieldCounts?.every(n => n === 23) ? 'Draft complete · ready to play' : 'Draft complete · arrange your PC Box on the field' : lobby.phase === 'placement' ? 'The winning coach is placing their pick' : 'Auction in progress';
    $('online-start-button').hidden = !isHost() || lobby.phase !== 'waiting';
    $('online-start-button').textContent = missing && !legacy ? `Waiting for ${missing} ${missing === 1 ? 'coach' : 'coaches'}` : 'Start auction';
    $('online-host-note').textContent = legacy ? 'This room uses the original host-controlled draft. Start a new room for bidding from each player’s device.' : isHost() ? 'Everyone bids for their own team and places their own picks. You start the draft, skip unbid prospects, and run matches.' : 'Bid for your team, place your picks, and choose your schemes. See the highest bid and outbid the other coaches.';
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
      const info = node('div'); info.append(node('strong', '', p?.name || `#${pokemonId}`), node('span', '', placed.has(pokemonId) ? (placed.get(pokemonId) === 's_k' ? 'K' : placed.get(pokemonId).replace(/^[od]_/, '').toUpperCase()) : 'PC Box')); row.append(image, info); return row;
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
      const result = await api('/api/lobbies', { method: 'POST', authorize: false, body: { teamCount, controlMode: 'players', mode: $('online-pool').value, names: Array.from({ length: teamCount }, (_, i) => clean($(`online-name-${i}`).value) || (i === 0 ? nickname : `Team ${i + 1}`)), nickname, ...(saved.leagueId && saved.leagueToken ? { leagueId: saved.leagueId, leagueToken: saved.leagueToken } : {}) } });
      if (attempt !== connectionAttempt) return; accept(result, { fresh: true }); showError('');
    } catch (error) { if (attempt === connectionAttempt) showError(errorText(error)); }
    finally { button.disabled = false; }
  }
  async function submitJoin(event) {
    event.preventDefault(); const attempt = ++connectionAttempt, button = $('online-join-button'); button.disabled = true; showError('');
    const code = $('online-code').value.trim(), nickname = clean($('online-join-nickname').value);
    if (!/^\d{4}$/.test(code)) { showError('Enter the four-digit room code.'); $('online-code').focus(); button.disabled = false; return; }
    if (!active() && saved.resume?.code === code && saved.resume?.token) { try { await resume(); } finally { button.disabled = false; } return; }
    if (!nickname) { showError('Enter a display name to join the room.'); $('online-join-nickname').focus(); button.disabled = false; return; }
    try { const result = await api('/api/lobbies/join', { method: 'POST', authorize: false, body: { code, nickname, teamName: clean($('online-join-team-name').value) || nickname } }); if (attempt === connectionAttempt) accept(result, { fresh: true }); }
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
  function setupTeamCount() { const count = Number($('online-team-count').value); document.querySelectorAll('[data-online-name]').forEach(el => { el.hidden = Number(el.dataset.onlineName) !== 0; }); $('online-setup-total').textContent = `${count} coaches · $1,000 each · 23 Pokémon per team`; }
  function syncViewport() {
    const view = window.visualViewport, height = view?.height || innerHeight, top = view?.offsetTop || 0;
    const keyboard = document.activeElement === $('online-chat-input') && height < innerHeight * .85;
    const panel = $('online-side-panel'); if (panel) { panel.style.setProperty('--online-view-height', `${Math.max(180, height - 16)}px`); panel.style.setProperty('--online-view-top', `${top + 8}px`); panel.classList.toggle('keyboard-open', keyboard); }
  }
  function init(options = {}) {
    adapter = options; if (initialized) { render(); return; } initialized = true;
    const menuButton = $('online-lobby-button');
    const bar = node('div', 'online-live-bar'); bar.id = 'online-live-bar'; bar.hidden = true;
    bar.innerHTML = '<button type="button" id="online-live-room"><i id="online-live-dot" aria-hidden="true"></i><span>ROOM <strong id="online-live-code"></strong></span><span id="online-live-role"></span></button><button type="button" id="online-chat-button" aria-expanded="false" aria-controls="online-side-panel">Chat <span id="online-unread" hidden>0</span></button>';
    (document.querySelector('main.game') || document.querySelector('main')).before(bar);
    const headerChat = node('button', 'online-header-chat-button'); headerChat.id = 'online-header-chat-button'; headerChat.type = 'button'; headerChat.hidden = true;
    headerChat.setAttribute('aria-controls', 'online-side-panel'); headerChat.setAttribute('aria-expanded', 'false'); headerChat.setAttribute('aria-label', 'Open room chat');
    headerChat.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg><span class="online-header-chat-label">Chat</span><span id="online-header-unread" hidden>0</span>';
    const headerActions = document.querySelector('.header-actions'); headerActions?.insertBefore(headerChat, $('menu-toggle')?.parentElement === headerActions ? $('menu-toggle') : null);
    if (!headerActions) document.body.append(headerChat);
    const dialog = node('dialog', 'online-dialog play-setup-dialog'); dialog.id = 'online-dialog'; dialog.setAttribute('aria-labelledby', 'online-title');
    dialog.innerHTML = `<div class="dialog-heading"><div><span class="eyebrow">THE NEXT GREAT LINEUP</span><h2 id="online-title">New game</h2></div><button type="button" id="online-dismiss" class="icon-button" aria-label="Close lobby">×</button></div>
      <div id="online-play-modes" class="play-mode-switch" role="group" aria-label="Where to play"><button type="button" id="online-local-mode" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>This device</button><button type="button" id="online-mode-current" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v2"/></svg>Online</button></div>
      <p id="online-error" class="online-error" role="alert" hidden></p>
      <div id="online-setup"><button type="button" id="online-resume-button" class="secondary-button online-wide" hidden>Resume room</button><div class="online-setup-tabs" role="group" aria-label="Lobby action"><button type="button" id="online-host-tab" aria-pressed="true">Host a room</button><button type="button" id="online-join-tab" aria-pressed="false">Join a room</button></div>
      <form id="online-host-form"><label class="online-label" for="online-nickname">Your display name</label><input id="online-nickname" class="online-input" maxlength="24" placeholder="Your name" autocomplete="nickname">
      <div class="online-setup-options"><label>Teams<select id="online-team-count"><option value="2">2 teams</option><option value="3">3 teams</option><option value="4">4 teams</option></select></label><label>Pokémon pool<select id="online-pool"><option value="gen1">Gen 1 · Kanto</option><option value="gen2">Gen 2 · Johto</option><option value="gen3">Gen 3 · Hoenn</option><option value="both" selected>All · 386 Pokémon</option></select></label></div><p class="online-help" id="online-setup-total">2 coaches · $1,000 each · 23 Pokémon per team</p>
      <div class="online-team-names">${Array.from({length:4},(_,i)=>`<label data-online-name="${i}"${i>0?' hidden':' class="online-own-name"'}>${i===0?'Your team name':`Team ${i+1}`}<input id="online-name-${i}" class="online-input" maxlength="24" placeholder="Team ${i+1}" autocomplete="off"></label>`).join('')}</div>
      <p class="online-help">Invite friends to join on their devices. Everyone bids for their own team and places their own picks.</p><button type="submit" id="online-create-button" class="primary-button online-wide">Create online room</button></form>
      <form id="online-join-form" hidden><label class="online-label" for="online-code">Four-digit room code</label><input id="online-code" class="online-input online-code-input" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="0000" autocomplete="off"><label class="online-label" for="online-join-nickname">Your display name</label><input id="online-join-nickname" class="online-input" maxlength="24" placeholder="Your name" autocomplete="nickname"><label class="online-label" for="online-join-team-name">Your team name <span class="online-help">(optional)</span></label><input id="online-join-team-name" class="online-input" maxlength="24" placeholder="Defaults to your display name" autocomplete="off"><p class="online-help">Take a team, bid live against your friends, and place your own picks.</p><button type="submit" id="online-join-button" class="primary-button online-wide">Join lobby</button></form></div>
      <div id="online-room" hidden><div class="online-code-block"><span>INVITE CODE</span><strong id="online-room-code"></strong><p id="online-room-summary"></p></div><div class="online-room-actions"><button type="button" id="online-invite-button" class="secondary-button">Invite friends</button><button type="button" id="online-room-chat" class="secondary-button">Open chat</button></div><input id="online-share-url" class="online-input" readonly hidden aria-label="Lobby invitation link"><p id="online-room-phase" class="online-room-phase"></p><div id="online-members" class="online-members"></div><p id="online-host-note" class="online-help"></p><p class="online-help online-expiry-note">Room expires after one hour without a draft action or chat message. Career records stay saved.</p><p id="online-room-error" class="online-error" role="alert" hidden></p><button type="button" id="online-start-button" class="primary-button online-wide">Start auction</button><div class="online-room-footer"><button type="button" id="online-room-close" class="text-button">Back to field</button><button type="button" id="online-leave-button" class="text-button">Leave room</button></div><div id="online-leave-confirm" hidden><p class="online-help">Leave this room for now? Your seat is saved on this browser so you can resume.</p><div class="online-room-actions"><button type="button" id="online-stay-button" class="secondary-button">Stay in room</button><button type="button" id="online-leave-now-button" class="secondary-button">Leave for now</button></div></div></div>`;
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
    $('online-local-mode').addEventListener('click', () => { close(); adapter.onLocalSetup?.(); });
    menuButton.addEventListener('click', open); $('online-live-room').addEventListener('click', open); $('online-dismiss').addEventListener('click', close); $('online-room-close').addEventListener('click', close);
    $('online-leave-button').addEventListener('click', () => { $('online-leave-confirm').hidden = false; $('online-stay-button').focus({preventScroll:true}); });
    $('online-stay-button').addEventListener('click', () => { $('online-leave-confirm').hidden = true; $('online-leave-button').focus({preventScroll:true}); });
    $('online-leave-now-button').addEventListener('click', () => { $('online-leave-confirm').hidden = true; leave(); });
    $('online-resume-button').addEventListener('click', resume); $('online-invite-button').addEventListener('click', shareRoom);
    $('online-chat-button').addEventListener('click', () => togglePanel()); headerChat.addEventListener('click', () => togglePanel()); $('online-panel-close').addEventListener('click', () => togglePanel(false)); $('online-room-chat').addEventListener('click', () => { close(); togglePanel(true); });
    $('online-team-count').addEventListener('change', setupTeamCount); $('online-host-form').addEventListener('submit', submitSetup); $('online-join-form').addEventListener('submit', submitJoin); $('online-chat-form').addEventListener('submit', submitChat); $('online-panel-team').addEventListener('change', event => selectTeam(Number(event.target.value)));
    $('online-start-button').addEventListener('click', async () => { try { await request('start'); close(); } catch(error) { showError(errorText(error), 'online-room-error'); } });
    function setTab(join) { $('online-host-tab').setAttribute('aria-pressed', String(!join)); $('online-join-tab').setAttribute('aria-pressed', String(join)); $('online-host-form').hidden = join; $('online-join-form').hidden = !join; showError(''); }
    $('online-host-tab').addEventListener('click', () => setTab(false)); $('online-join-tab').addEventListener('click', () => setTab(true));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && panelOpen && !dialog.open) togglePanel(false); });
    dialog.addEventListener('close', () => { roomOpen = false; if (!document.querySelector('dialog[open]')) $('new-game-button').focus({ preventScroll: true }); });
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
  window.DraftOnline = Object.freeze({ init, active, connected: () => active() && !offline, isHost, can, ownsTeam, state: () => current, league: () => leagueCache, request, open, close, leave, resume, shareRoom, hallAction, refreshLeague, refreshNeeds: renderPanel, selectTeam, pending: () => pending });
})();
