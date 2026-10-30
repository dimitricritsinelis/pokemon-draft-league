"""Focused manual-auction acceptance; uses shared browser helpers and isolated QA rooms."""
from pathlib import Path
src=Path('tests/browser-players.py').read_text();exec(src[:src.index('try:\n with sync_playwright()')])
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,proxy={'server':os.environ['HTTPS_PROXY'],'bypass':'127.0.0.1,localhost'} if BASE.startswith('https:') else None)
 cs,ps=setup({'chromium':b,'webkit':b},2,'manual-bids');h,g=ps;action(h,'start')
 for p in ps:
  wait_phase(p,'bidding');p.wait_for_selector(SUBMIT+':visible');check('custom field expanded '+str(own(p)),p.locator('#player-custom-bid').evaluate('e=>e.open') and p.locator(INPUT).is_visible());check('no countdown '+str(own(p)),p.locator('.live-clock:visible,.live-clock-track:visible').count()==0)
  r=p.locator(SUBMIT).bounding_box();check('bid action fits '+str(own(p)),r['y']>=0 and r['y']+r['height']<=p.viewport_size['height'])
 check('guest has no host controls',g.locator('#player-finalize').is_hidden() and g.locator('#player-skip').is_hidden())
 id=state(g)['lobby']['auction']['currentPokemonId'];g.locator(SUBMIT).click();h.wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===5');check('no automatic award',not state(h)['lobby']['auction']['awards']);h.locator('#player-finalize').click();wait_award(h,id);check('host finalize awards highest bidder',state(h)['lobby']['auction']['lastAward']['team']==1 and state(h)['lobby']['auction']['lastAward']['amount']==5)
 nextid=state(h)['lobby']['auction']['currentPokemonId'];wait_round(g,nextid);g.locator(SUBMIT).click();h.wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===5');budget=state(h)['lobby']['auction']['budgets'];h.locator('#player-skip').click();h.wait_for_function('(id)=>DraftOnline.state().lobby.auction.currentPokemonId!==id',arg=nextid);check('host skip after bids charges nobody',state(h)['lobby']['auction']['budgets']==budget and nextid in state(h)['lobby']['auction']['skipped'])
 for p in ps:capture(p,'manual-'+str(own(p)))
 for c in cs:c.close()
 b.close();report('PASS')
