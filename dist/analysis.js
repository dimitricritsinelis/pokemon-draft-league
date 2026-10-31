/* A complete scouting report, with no grades exposed and no loss of auction state. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let dialog, shown = null, current = null, phase = 'bidding', returnFocus, context = null;
  const statNames = [['hp','HP'],['attack','Attack'],['defense','Defense'],['specialAttack','Sp. Atk'],['specialDefense','Sp. Def'],['speed','Speed']];
  function init() {
    dialog = document.createElement('dialog'); dialog.id = 'pokemon-analysis-dialog'; dialog.className = 'pokemon-analysis-dialog'; dialog.setAttribute('aria-labelledby','analysis-name');
    dialog.innerHTML = '<header class="analysis-identity"><img id="analysis-image" alt=""><div><span id="analysis-dex" class="eyebrow"></span><h2 id="analysis-name"></h2><p id="analysis-types"></p></div><button type="button" id="analysis-close" class="icon-button" aria-label="Close scouting report">×</button></header><p id="analysis-previous" hidden>This pick has moved on. This report stays open for you.</p><dl id="analysis-measurements" class="analysis-measurements"></dl><section class="analysis-base"><h3>Base stats <span id="analysis-total"></span></h3><dl id="analysis-stats" class="auction-base-stats"></dl></section><section class="analysis-abilities"><h3>Abilities</h3><p id="analysis-abilities"></p></section><section class="analysis-synopsis"><h3>Football analysis</h3><p id="analysis-synopsis"></p></section><button type="button" id="analysis-place" class="primary-button" hidden>Place on field</button><button type="button" id="analysis-back" class="primary-button">Back to bidding</button>';
    document.body.append(dialog);
    $('analysis-place').addEventListener('click', () => { const place = context?.onPlace; close(); place?.(); });
    ['analysis-close','analysis-back'].forEach(id => $(id).addEventListener('click', close));
    dialog.addEventListener('close', () => { const target = returnFocus?.isConnected && returnFocus.getClientRects().length ? returnFocus : [$('player-bid-submit'),$('pc-box-button'),$('focus-toggle')].find(el=>el?.getClientRects().length); target?.focus({ preventScroll: true }); });
    const button = document.createElement('button'); button.id = 'auction-analysis-button'; button.type = 'button'; button.className = 'auction-analysis-button'; button.textContent = 'Full report'; button.setAttribute('aria-haspopup','dialog');
    button.addEventListener('click', () => { const p = (window.POKEMON || []).find(p => p.name === $('auction-pokemon').textContent); if (p) open(p); });
    document.querySelector('.auction-stat-heading').insertBefore(button, $('auction-stat-total'));
  }
  function group(label,value) { const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd'); dt.textContent=label; dd.textContent=String(value); div.append(dt,dd); return div; }
  function open(p, options = null) {
    if (!dialog) init(); if (!p) return;
    returnFocus = document.activeElement; document.activeElement?.blur(); shown = p.id; context = options;
    $('analysis-place').hidden = !context?.onPlace;
    $('analysis-image').src = p.image; $('analysis-image').alt = p.name;
    $('analysis-name').textContent = p.name; $('analysis-dex').textContent = 'SCOUTING REPORT · #' + String(p.id).padStart(3,'0'); $('analysis-types').textContent = p.types.join(' / ');
    const inches=Math.round(p.heightMeters/.0254);
    $('analysis-measurements').replaceChildren(group('Height',`${Math.floor(inches/12)}′${inches%12}″`),group('Weight',`${Math.round(p.weightKg*2.2046226218*10)/10} lb`),group('Est. 40-yard',`${p.fortySeconds.toFixed(2)} s`));
    $('analysis-stats').replaceChildren(...statNames.map(([key,label])=>group(label,p.baseStats[key])));
    $('analysis-total').textContent = 'Total ' + Object.values(p.baseStats).reduce((a,b)=>a+b,0);
    $('analysis-abilities').textContent = p.abilities.join(' · '); $('analysis-synopsis').textContent = p.synopsis;
    setCurrent(current, phase); dialog.scrollTop=0;
    if (!dialog.open) dialog.showModal(); $('analysis-close').focus({preventScroll:true});
  }
  function setCurrent(id, nextPhase = 'bidding') { current=id; phase=nextPhase; if (!dialog) return; if (context?.source === 'spectator') { $('analysis-previous').hidden=true; $('analysis-back').textContent='Back to field'; return; } if (context?.source === 'box') { $('analysis-previous').hidden=true; $('analysis-back').textContent='Back to PC Box'; return; } const ended=phase==='complete', moved=current!=null&&shown!=null&&current!==shown; $('analysis-previous').hidden=!moved&&!ended; $('analysis-previous').textContent=ended?'Draft complete. This report stays open for you.':'This pick has moved on. This report stays open for you.'; $('analysis-back').textContent=ended?'Back to game':moved?'View current pick':'Back to bidding'; }
  function close() { dialog?.close(); }
  window.DraftAnalysis={open,close,setCurrent};
  init();
})();
