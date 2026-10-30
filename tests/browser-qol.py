"""Focused desktop/phone game-view and full-analysis acceptance.
Run with DRAFT_QA_URL, DRAFT_QA_OUTPUT and optional DRAFT_CHROMIUM_PATH.
Uses isolated QA lobbies, real API calls, and physical UI controls.
"""
from pathlib import Path
source=Path('tests/browser-players.py').read_text()
exec(source[:source.index('try:\n with sync_playwright()')])

def fit_visible(page,selector):
 r=page.locator(selector).last.bounding_box()
 return bool(r) and page.evaluate('(r)=>r.x>=-1&&r.y>=-1&&r.x+r.width<=innerWidth+1&&r.y+r.height<=innerHeight+1',r)
def focus(page,on):
 toggle=page.locator('dialog:modal .focus-modal-toggle').last if page.locator('dialog:modal .focus-modal-toggle').count() else page.locator('#focus-toggle')
 if page.locator('#focus-toggle').get_attribute('aria-pressed')!=str(on).lower():toggle.click()
 page.wait_for_function('(v)=>document.body.classList.contains("game-focus")===v',arg=on)
 check('focus exit remains reachable '+str(page.viewport_size['width']),fit_visible(page,'dialog:modal .focus-modal-toggle' if page.locator('dialog:modal .focus-modal-toggle').count() else '#focus-toggle'))
def inline_fits(page,label):
 for sel in ['#auction-abilities','#auction-synopsis']:
  check(label+' '+sel+' visible',page.locator(sel).is_visible())
  check(label+' '+sel+' full text fits',page.locator(sel).evaluate('e=>e.scrollHeight<=e.clientHeight+2'))
 check(label+' inline body needs no scroll',page.locator('.auction-dialog-body').evaluate('e=>e.scrollHeight<=e.clientHeight+2'))
 check(label+' bid action reachable',fit_visible(page,SUBMIT))
def open_analysis(page):
 page.locator('#auction-analysis-button').click();page.wait_for_selector('#pokemon-analysis-dialog[open]')
def close_analysis(page):
 page.locator('#analysis-close').click()
 page.wait_for_function('!document.getElementById("pokemon-analysis-dialog").open')
def analysis_fits(page,label):
 dialog=page.locator('#pokemon-analysis-dialog')
 check(label+' report inside viewport',fit_visible(page,'#pokemon-analysis-dialog'))
 clipping=dialog.evaluate('''e=>[e,...e.querySelectorAll('*')].filter(x=>{const s=getComputedStyle(x);return x.clientHeight>0&&(/auto|scroll|hidden/.test(s.overflowY))&&x.scrollHeight>x.clientHeight+2}).map(x=>({tag:x.tagName,id:x.id,cls:x.className,height:x.clientHeight,scroll:x.scrollHeight}))''')
 check(label+' report has no clipped/scrolling content',not clipping,clipping)
 check(label+' report no horizontal clipping',dialog.evaluate('e=>e.scrollWidth<=e.clientWidth+1'))

def analysis_sweep(page,width,height):
 page.set_viewport_size({'width':width,'height':height})
 for focused in [False,True]:
  focus(page,focused)
  # Factual text only: stress each complete report without changing the live nominee.
  entries=page.evaluate('POKEMON.map(p=>({id:p.id,name:p.name,n:p.synopsis.length+p.abilities.join(" ").length})).sort((a,b)=>b.n-a.n).slice(0,12)')
  for entry in entries:
   page.evaluate('(id)=>{const p=POKEMON.find(p=>p.id===id);document.getElementById("auction-pokemon").textContent=p.name;document.getElementById("auction-abilities").textContent="Abilities: "+p.abilities.join(" · ");document.getElementById("auction-synopsis").textContent=p.synopsis}',entry['id'])
   label=f'{width}x{height} {entry["name"]} focus{focused}'
   inline_fits(page,label)
   page.evaluate('(id)=>DraftAnalysis.open(POKEMON.find(p=>p.id===id))',entry['id']);analysis_fits(page,label)
   check(label+' complete synopsis preserved',page.locator('#analysis-synopsis').text_content()==page.evaluate('(id)=>POKEMON.find(p=>p.id===id).synopsis',entry['id']))
   close_analysis(page)
  open_analysis(page);capture(page,f'qol-longest-{width}-{focused}');close_analysis(page)
  if focused:focus(page,False)
def geometry_sweep(page):
 page.evaluate('DraftLiveAuction.open()')
 for w,hg in [(1024,768),(1440,900)]:
  page.set_viewport_size({'width':w,'height':hg})
  for on in [False,True]:
   focus(page,on)
   for offense in ['10','11','12','21','22']:
    for defense in ['3-4','4-3','nickel','dime']:
     action(page,'scheme',{'teamIndex':own(page),'offense':offense,'defense':defense})
     value=page.locator('.position').evaluate_all('''els=>{const r=els.map(e=>({key:e.dataset.slot,r:e.getBoundingClientRect()})),f=document.getElementById('field').getBoundingClientRect(),overlap=[];for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++){if(Math.min(r[i].r.right,r[j].r.right)-Math.max(r[i].r.left,r[j].r.left)>1&&Math.min(r[i].r.bottom,r[j].r.bottom)-Math.max(r[i].r.top,r[j].r.top)>1)overlap.push([r[i].key,r[j].key])}return {count:r.length,overlap,out:r.filter(x=>{const ys=[(x.r.top-f.top)/f.height*100,(x.r.bottom-f.top)/f.height*100],left=Math.max(...ys.map(y=>DraftField.project(3,y).x*f.width/100+f.left)),right=Math.min(...ys.map(y=>DraftField.project(97,y).x*f.width/100+f.left));return x.r.left<left-1||x.r.right>right+1||x.r.top<f.top-1||x.r.bottom>f.bottom+1}).map(x=>x.key)}}''')
     check(f'{w} focus{on} {offense}/{defense} field geometry',value=={'count':23,'overlap':[],'out':[]},value)
   capture(page,f'qol-field-{w}-{on}')
  focus(page,False)
def run():
 with sync_playwright() as pw:
  args={'headless':True,'executable_path':os.environ.get('DRAFT_CHROMIUM_PATH','/usr/bin/chromium')}
  if BASE.startswith('https:') and os.environ.get('HTTPS_PROXY'):args['proxy']={'server':os.environ['HTTPS_PROXY'],'bypass':'127.0.0.1,localhost'}
  b=pw.chromium.launch(**args)
  try:
   contexts,pages=setup({'chromium':b,'webkit':b},2,'qol-focus-analysis');host,guest=pages
   action(host,'start')
   for p in pages:
    wait_phase(p,'bidding');p.wait_for_selector(SUBMIT+':visible');label=str(p.viewport_size['width'])
    check(label+' custom bid expanded',p.locator(INPUT).is_visible())
    check(label+' no automatic keyboard focus',p.evaluate('document.activeElement.id!=="player-bid-input"'))
    focus(p,True);inline_fits(p,label+' inline');open_analysis(p);analysis_fits(p,label+' focused analysis');
    report_focus=p.locator('#pokemon-analysis-dialog .focus-modal-toggle');report_focus.click();p.wait_for_function('!DraftFocus.active()');check(label+' exit from full report keeps report open',p.locator('#pokemon-analysis-dialog').is_visible());report_focus.click();p.wait_for_function('DraftFocus.active()');capture(p,'qol-'+label+'-analysis');close_analysis(p)
    check(label+' returns straight to auction',p.locator(SUBMIT).is_visible())
    focus(p,False)
   # Reports remain readable if the host advances to another nominee.
   open_analysis(guest);old_report=guest.locator('#analysis-name').text_content();old_id=state(host)['lobby']['auction']['currentPokemonId'];host.locator('#player-skip').click()
   guest.wait_for_function('(id)=>DraftOnline.state().lobby.auction.currentPokemonId!==id',arg=old_id)
   check('host skip does not dismiss or rewrite open report',guest.locator('#pokemon-analysis-dialog').is_visible() and guest.locator('#analysis-name').text_content()==old_report)
   check('changed-pick report explains stale prospect',guest.locator('#analysis-previous').is_visible());guest.locator('#analysis-back').click();check('report back returns to current auction',guest.locator(SUBMIT).is_visible())
   # Actual per-player auction remains usable in focused view.
   for p in pages:focus(p,True)
   nominee=state(guest)['lobby']['auction']['currentPokemonId'];guest.locator(SUBMIT).click();host.wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===5')
   host.locator('#player-finalize').click();award=wait_award(host,nominee);check('focused finalize awards guest',award['team']==1)
   wait_award(guest,nominee);guest.evaluate('DraftLiveAuction.minimize()');guest.locator('#pc-box-button').click();guest.locator('[data-pokemon="'+str(nominee)+'"]').click();guest.locator('[data-slot="o_qb"]').click();guest.wait_for_function('(id)=>DraftOnline.state().lobby.teams[1].picks.o_qb===id',arg=nominee)
   check('focused PC Box places on own field',state(guest)['lobby']['teams'][1]['picks']['o_qb']==nominee);capture(guest,'qol-focused-field')
   nextid=state(host)['lobby']['auction']['currentPokemonId'];budget=state(host)['lobby']['auction']['budgets'];host.locator('#player-skip').click();host.wait_for_function('(id)=>DraftOnline.state().lobby.auction.currentPokemonId!==id',arg=nextid);check('focused host skip charges nobody',state(host)['lobby']['auction']['budgets']==budget)
   for p in pages:focus(p,False)
   if '--geometry' in sys.argv:geometry_sweep(guest)
   if '--sweep' in sys.argv:
    for p,w,hg in [(guest,1440,900),(host,393,740),(host,320,568),(host,844,390)]:
     p.evaluate('DraftLiveAuction.open()');analysis_sweep(p,w,hg)
   for c in contexts:c.close()
   check('no runtime errors',not ERRORS,ERRORS);report('PASS')
  finally:
   if sys.exc_info()[0]:
    for i,c in enumerate(b.contexts):
     for j,p in enumerate(c.pages):
      try:p.screenshot(path=str(OUT/f'failure-{i}-{j}.png'),full_page=True)
      except Exception:pass
   b.close()
try:run()
except Exception as e:report('FAIL',e);traceback.print_exc();sys.exit(1)
