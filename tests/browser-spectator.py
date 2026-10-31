"""Three-device spectator join and live-board acceptance, with phone/PC viewing."""
from pathlib import Path
source=Path('tests/browser-players.py').read_text()
exec(source[:source.index('try:\n with sync_playwright()')])
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 try:
  contexts,pages=setup({'chromium':b,'webkit':b},2,'spectator');host,guest=pages;action(host,'start')
  for p in pages:wait_phase(p,'bidding')
  watch=b.new_page(viewport={'width':1440,'height':900});boot(watch)
  watch.goto(BASE+'/?lobby='+state(host)['lobby']['code'],wait_until='networkidle');watch.locator('#online-spectate').check();watch.locator('#online-join-nickname').fill('QA spectator');watch.locator('#online-join-button').click();watch.wait_for_selector('body.spectating')
  check('spectator joins full active room',state(watch)['member']['role']=='spectator' and state(watch)['member']['teamIndex'] is None)
  check('board first no bidding or picker',not watch.locator('#auction-dialog').is_visible() and not watch.locator('#picker').is_visible())
  id=state(host)['lobby']['auction']['currentPokemonId'];action(guest,'bid',{'amount':5,'pokemonId':id});host.wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===5');host.locator('#player-finalize').click();wait_award(guest,id)
  action(guest,'place',{'teamIndex':1,'slotKey':'o_qb','pokemonId':id})
  watch.wait_for_function('(id)=>DraftOnline.state().lobby.teams[1].picks.o_qb===id',arg=id)
  for width,height in [(1440,900),(393,740)]:
   watch.set_viewport_size({'width':width,'height':height});watch.locator('.spectator-tabs button').nth(1).click()
   check('team toggle '+str(width),watch.locator('[data-slot="o_qb"] img').count()==1)
   check('field dominates '+str(width),watch.locator('#field').bounding_box()['width']>width*.65)
   check('no horizontal overflow '+str(width),watch.evaluate('document.documentElement.scrollWidth<=innerWidth'))
   watch.locator('[data-slot="o_qb"]').click();check('inspect player '+str(width),watch.locator('#analysis-name').text_content()==watch.evaluate('(id)=>POKEMON.find(p=>p.id===id).name',id));watch.locator('#analysis-back').click()
   watch.locator('.spectator-recap summary').click();check('recap lists pick '+str(width),watch.locator('.spectator-recap li').count()==1);watch.locator('.spectator-recap summary').click();capture(watch,'spectator-'+str(width))
   watch.locator('.spectator-tabs button').nth(0).click();check('other board empty '+str(width),watch.locator('[data-slot="o_qb"] img').count()==0)
  watch.reload(wait_until='networkidle');watch.wait_for_selector('body.spectating');check('spectator survives reload',state(watch)['member']['role']=='spectator')
  check('no runtime errors',not ERRORS,ERRORS);report('passed')
 finally:b.close()
