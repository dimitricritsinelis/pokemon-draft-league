"""Real online PC Box profile, live-auction continuity and placement regression."""
from pathlib import Path
source=Path('tests/browser-players.py').read_text()
exec(source[:source.index('try:\n with sync_playwright()')])
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 try:
  contexts,pages=setup({'chromium':b,'webkit':b},2,'box-profile');host,guest=pages
  action(host,'start')
  for p in pages:wait_phase(p,'bidding')
  nominee=state(guest)['lobby']['auction']['currentPokemonId']
  action(guest,'bid',{'amount':5,'pokemonId':nominee})
  host.wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===5')
  host.locator('#player-finalize').click();wait_award(guest,nominee)
  guest.evaluate('DraftLiveAuction.minimize()')
  for width,height in [(1440,900),(393,740)]:
   guest.set_viewport_size({'width':width,'height':height})
   guest.evaluate('DraftLiveAuction.minimize()');guest.locator('#pc-box-button').click()
   guest.locator(f'[data-pokemon="{nominee}"]').click()
   check('report opens '+str(width),guest.locator('#pokemon-analysis-dialog').is_visible())
   expected=guest.evaluate('(id)=>POKEMON.find(p=>p.id===id)',nominee)
   check('full profile '+str(width),guest.locator('#analysis-name').text_content()==expected['name'] and guest.locator('#analysis-synopsis').text_content()==expected['synopsis'])
   check('six base stats '+str(width),guest.locator('#analysis-stats dd').count()==6)
   check('back context '+str(width),guest.locator('#analysis-back').text_content()=='Back to PC Box')
   check('place action '+str(width),guest.locator('#analysis-place').is_visible())
   if width==393:
    old=state(host)['lobby']['auction']['currentPokemonId'];host.locator('#player-skip').click()
    guest.wait_for_function('(id)=>DraftOnline.state().lobby.auction.currentPokemonId!==id',arg=old)
    check('report survives next auction pick',guest.locator('#analysis-name').text_content()==expected['name'] and guest.locator('#analysis-previous').is_hidden())
   guest.locator('#analysis-back').click()
   check('back preserves box',guest.locator(f'[data-pokemon="{nominee}"]').is_visible())
  guest.locator(f'[data-pokemon="{nominee}"]').click();guest.locator('#analysis-place').click();guest.locator('[data-slot="o_qb"]').click()
  guest.wait_for_function('(id)=>DraftOnline.state().lobby.teams[1].picks.o_qb===id',arg=nominee)
  check('profile places owned pokemon',True)
  host.evaluate('DraftOnline.selectTeam(1)');host.evaluate('DraftLiveAuction.minimize()');host.locator('#pc-box-button').click();host.locator('[data-box-filter="all"]').click();host.locator(f'[data-pokemon="{nominee}"]').click()
  check('other coach can inspect without placement',host.locator('#analysis-name').text_content()==expected['name'] and host.locator('#analysis-place').is_hidden())
  check('no runtime errors',not ERRORS,ERRORS);report('passed')
 finally:b.close()
