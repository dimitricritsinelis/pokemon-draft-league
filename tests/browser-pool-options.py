"""New-game pool controls and host free assignment on PC and phone."""
from pathlib import Path
source=Path('tests/browser-players.py').read_text()
exec(source[:source.index('try:\n with sync_playwright()')])
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 try:
  contexts,pages=setup({'chromium':b,'webkit':b},2,'pool-options');host,guest=pages
  result=action(host,'configure',{'generations':[1,3],'includeRetired':True,'includeLegendary':False})
  check('pool rules visible across devices',result['lobby']['generations']==[1,3] and result['lobby']['includeRetired'] and not result['lobby']['includeLegendary'])
  action(host,'start')
  for p in pages:wait_phase(p,'bidding')
  for width,height in [(1440,900),(393,740)]:
   host.set_viewport_size({'width':width,'height':height});host.evaluate('DraftLiveAuction.open()')
   id=state(host)['lobby']['auction']['currentPokemonId'];host.locator('#player-finalize').click()
   check('free chooser '+str(width),host.locator('#free-assignment-dialog').is_visible())
   check('each team available '+str(width),host.locator('#free-assignment-teams button').count()==2)
   host.locator('#free-assignment-teams button').nth(1).click();award=wait_award(host,id)
   check('chosen team wins for zero '+str(width),award['team']==1 and award['amount']==0)
   check('host controls red '+str(width),host.locator('#player-finalize').evaluate('e=>getComputedStyle(e).color')=='rgb(167, 45, 40)')
  check('guest no host action',guest.locator('#player-finalize').is_hidden() and guest.locator('#player-skip').is_hidden())
  fresh=b.new_page(viewport={'width':393,'height':740});boot(fresh);fresh.locator('#new-game-button').click()
  fresh.locator('#auction-gen-2').check();fresh.locator('#auction-gen-1').uncheck();fresh.locator('#auction-gen-3').check();fresh.locator('#auction-include-retired').check();fresh.locator('#auction-include-legendary').uncheck()
  fresh.locator('#online-lobby-button').click()
  check('local to online preserves selections',fresh.locator('#online-gen-1').is_checked()==False and fresh.locator('#online-gen-2').is_checked() and fresh.locator('#online-gen-3').is_checked() and fresh.locator('#online-include-retired').is_checked() and not fresh.locator('#online-include-legendary').is_checked())
  fresh.screenshot(path=str(OUT/'new-game-phone.png'))
  check('no runtime errors',not ERRORS,ERRORS);report('passed')
 finally:b.close()
