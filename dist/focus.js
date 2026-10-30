/* Focus on play, using native full screen where the browser supports it. */
(() => {
  'use strict';
  const root = document.documentElement;
  const header = document.querySelector('.masthead');
  const actions = document.querySelector('.header-actions');
  if (!header || !actions) return;
  let focused = false, usedNative = false, frame;
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'focus-toggle'; button.className = 'focus-toggle';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="focus-expand" d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path class="focus-contract" d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/></svg>';
  actions.insertBefore(button, document.getElementById('menu-toggle'));

  function syncModalButtons() {
    document.querySelectorAll('dialog[open], #picker.open').forEach(dialog => {
      const heading = dialog.querySelector('.dialog-heading, .picker-heading-row, .analysis-identity'); if (!heading) return;
      let mirror = heading.querySelector('.focus-modal-toggle');
      if (!mirror && (focused || ['auction-dialog', 'picker', 'pokemon-analysis-dialog'].includes(dialog.id))) {
        mirror = document.createElement('button'); mirror.type = 'button'; mirror.className = 'focus-toggle focus-modal-toggle'; mirror.innerHTML = button.innerHTML;
        mirror.addEventListener('click', toggle); const close = heading.querySelector('[data-close],.icon-button,#analysis-close'); heading.insertBefore(mirror, close);
      }
      if (mirror) { mirror.hidden = !focused && !['auction-dialog', 'picker', 'pokemon-analysis-dialog'].includes(dialog.id); mirror.setAttribute('aria-pressed', String(focused)); mirror.setAttribute('aria-label', focused ? 'Exit full screen' : 'Enter full screen'); mirror.title = focused ? 'Exit full screen' : 'Enter full screen'; }
    });
  }
  function sync() {
    document.body.classList.toggle('game-focus', focused);
    button.setAttribute('aria-pressed', String(focused));
    const label = focused ? 'Exit full screen' : 'Enter full screen';
    button.setAttribute('aria-label', label); button.title = label;
    try { sessionStorage.setItem('pokemon-draft-focus', focused ? '1' : '0'); } catch { /* Session preference is optional. */ }
    syncModalButtons(); scheduleSpace();
  }
  function updateSpace() {
    if (!focused) { root.style.removeProperty('--focus-field-height'); return; }
    const field = document.getElementById('field');
    if (!field) return;
    // Document position prevents scrolling from changing the pitch size.
    const top = field.getBoundingClientRect().top + window.scrollY;
    root.style.setProperty('--focus-field-height', `${Math.max(500, window.innerHeight - top - 8)}px`);
  }
  function scheduleSpace() { cancelAnimationFrame(frame); frame = requestAnimationFrame(updateSpace); }
  async function enter() {
    focused = true; sync();
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (document.fullscreenEnabled && root.requestFullscreen && !document.fullscreenElement) {
      try { await root.requestFullscreen(); usedNative = true; } catch { /* Compact focus mode still works. */ }
    }
    scheduleSpace();
  }
  async function exit() {
    focused = false; sync();
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch { /* Browser may already have exited. */ }
    }
    usedNative = false;
  }
  const toggle = () => focused ? exit() : enter();
  button.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) { usedNative = true; focused = true; sync(); }
    else if (usedNative) { usedNative = false; focused = false; sync(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !focused || event.defaultPrevented) return;
    if (document.querySelector('dialog[open], #picker.open, #draft-menu:not([hidden]), .personnel-options:not([hidden])')) return;
    if (!document.fullscreenElement) { event.preventDefault(); exit(); }
  });
  window.addEventListener('resize', scheduleSpace);
  const modalObserver = new MutationObserver(syncModalButtons);
  modalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class'] });
  const observer = new ResizeObserver(scheduleSpace);
  observer.observe(header);
  const dashboard = document.getElementById('online-team-dashboard');
  if (dashboard) observer.observe(dashboard);
  const toolbar = document.querySelector('.board-toolbar');
  if (toolbar) observer.observe(toolbar);

  if (!document.fullscreenEnabled && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone) {
    const note = document.createElement('p'); note.className = 'focus-safari-note';
    note.textContent = 'On iPhone, full screen focuses the game. For an edge-to-edge view without Safari’s bars, use Share → Add to Home Screen, then open the game from its icon.';
    document.getElementById('draft-menu')?.append(note);
  }
  try { focused = sessionStorage.getItem('pokemon-draft-focus') === '1'; } catch { /* Use normal view by default. */ }
  sync();
  window.DraftFocus = { enter, exit, toggle, active: () => focused };
})();
