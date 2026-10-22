"""Targeted read-only prospect modal and legacy auction migration regressions."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('DRAFT_QA_URL','http://127.0.0.1:3000/').rstrip('/')+'/'
CHECKS=[];ERRORS=[]
def check(name,ok,detail=None):
 if not ok:raise AssertionError(f'{name}: {detail}')
 CHECKS.append(name)
def boot(p):
 p.on('pageerror',lambda e:ERRORS.append(str(e)))
 p.goto(BASE,wait_until='networkidle')
 p.wait_for_function('!!window.DraftOnline')
def menu(p):
 p.locator('#new-game-button').click()
 p.wait_for_selector('#auction-setup-dialog[open]')
 p.locator('#online-lobby-button').click()
 p.wait_for_selector('#online-dialog[open]')
def run(b,engine):
 hc=b.new_context(viewport={'width':393,'height':730});gc=b.new_context(viewport={'width':393,'height':730});h=hc.new_page();g=gc.new_page();boot(h);boot(g)
 menu(h);h.locator('#online-nickname').fill('Coach');h.locator('#online-create-button').click();h.wait_for_function('DraftOnline.isHost()');code=h.evaluate('DraftOnline.state().lobby.code')
 g.goto(BASE+'?lobby='+code,wait_until='networkidle');g.locator('#online-join-nickname').fill('Spectator');g.locator('#online-join-button').click();g.wait_for_function('DraftOnline.active()&&!DraftOnline.isHost()');g.locator('#online-room-close').click()
 h.locator('#online-start-button').click();g.wait_for_function('DraftOnline.state()?.lobby?.phase==="bidding"')
 g.locator('#auction-resume-button').click()
 check(engine+' guest View Pokémon opens prospect',g.locator('#auction-dialog').is_visible())
 check(engine+' guest controls hidden',g.locator('#auction-bid-form').is_hidden() and g.locator('#auction-viewer-note').is_visible() and g.locator('#auction-bid-button').is_hidden() and g.locator('#auction-skip-button').is_hidden())
 check(engine+' guest six full stats',g.locator('#auction-base-stats > div').count()==6 and g.locator('#auction-base-stats').is_visible())
 g.locator('#auction-scouting summary').click();check(engine+' guest scouting accessible',g.locator('#auction-synopsis').is_visible())
 if not h.locator('#auction-dialog').is_visible():h.locator('#auction-resume-button').click()
 check(engine+' host form still visible',h.locator('#auction-bid-form').is_visible() and h.locator('#auction-viewer-note').is_hidden())
 old=g.locator('#auction-pokemon').inner_text();old_id=g.evaluate('DraftOnline.state().lobby.auction.currentPokemonId')
 h.locator('#auction-skip-button').click();g.wait_for_function('(name)=>DraftOnline.state().lobby.auction.currentPokemonId!==name',arg=old_id)
 g.wait_for_timeout(200)
 current=g.evaluate('POKEMON.find(p=>p.id===DraftOnline.state().lobby.auction.currentPokemonId).name')
 check(engine+' guest prospect updates after host skip',g.locator('#auction-pokemon').inner_text()==current,(old,current,g.locator('#auction-pokemon').inner_text()))
 g.locator('#auction-dialog .online-modal-chat').click();g.locator('#online-chat-input').fill('I like this prospect.');g.locator('#online-chat-send').click();g.wait_for_function('DraftOnline.state().lobby.messages.some(m=>m.message==="I like this prospect.")')
 check(engine+' chat inside guest prospect works',g.locator('#auction-dialog #online-side-panel').is_visible())
 h.locator('#auction-bid-0').fill('7');h.locator('#auction-bid-1').fill('0');h.locator('#auction-bid-button').click();g.wait_for_function('DraftOnline.state().lobby.phase==="placement"')
 check(engine+' host award closes obsolete guest prospect',not g.locator('#auction-dialog').is_visible())
 check(engine+' guest chat stays open after modal closes',g.locator('body > #online-side-panel').is_visible())
 g.locator('#online-chat-input').fill('Pick placed soon.');g.locator('#online-chat-send').click();g.wait_for_function('DraftOnline.state().lobby.messages.some(m=>m.message==="Pick placed soon.")')
 check(engine+' chat remains usable after award',g.locator('#online-chat-input').is_visible())
 hc.close();gc.close()
 # Legacy restore upgrade uses separate offline browser storage.
 c=b.new_context(viewport={'width':393,'height':730});p=c.new_page();boot(p)
 for complete,exhausted in [(False,False),(True,False),(True,True)]:
  p.evaluate('''({complete,exhausted})=>{
    const keys=['d_fs','d_ss','d_cb1','d_cb2','d_de1','d_dt1','d_de2','d_lb1','d_lb2','d_lb3','d_lb4','o_lt','o_lg','o_c','o_rg','o_rt','o_qb','o_rb1','o_wr1','o_wr2','o_te1','o_rb2'];
    const ids=Array.from({length:100},(_,i)=>152+i), lots=ids.slice(0,44);
    const teams=[0,1].map(team=>({name:'Legacy '+team,offense:'21',defense:'3-4',picks:complete?Object.fromEntries(keys.map((key,i)=>[key,lots[22*team+i]])): {}}));
    const awards=complete?lots.map((id,i)=>({pokemonId:id,team:i<22?0:1,amount:0,bids:[0,0],tied:i<22})):[];
    const session={v:1,mode:'gen2',teamCount:2,rosterSize:22,lots,skipped:exhausted?ids.slice(44):[],awards,placed:complete?44:0};
    if(!DraftAuction.validate(session))throw new Error('Invalid QA legacy fixture');
    localStorage.setItem('pokemon-draft-auction-v1',JSON.stringify({v:1,session,teams,team:0,active:true,regularView:{mode:'gen1',team:0,shared:false}}));
  }''',{'complete':complete,'exhausted':exhausted})
  p.reload(wait_until='networkidle');saved=p.evaluate("JSON.parse(localStorage.getItem('pokemon-draft-auction-v1'))")
  if not exhausted:check(engine+(' completed' if complete else '')+' legacy22 upgrades with two kicker lots',saved['session']['rosterSize']==23 and len(saved['session']['lots'])==46 and p.locator('.position').count()==23)
  else:
   check(engine+' exhausted legacy22 retains complete roster',saved['session']['rosterSize']==22 and len(saved['session']['lots'])==44 and p.locator('.position').count()==22)
   check(engine+' exhausted legacy shows clear restart note','Legacy auction complete' in p.locator('#auction-status').inner_text())
   p.locator('#simulate-match').dispatch_event('click');check(engine+' exhausted legacy simulation explains migration','older auction' in p.locator('#live-message').inner_text())
 c.close()

with sync_playwright() as pw:
 for name,runtime,args in [('chromium',pw.chromium,{'executable_path':'/usr/bin/chromium'}),('webkit',pw.webkit,{'executable_path':'/workspace/scratch/run-webkit.sh'})]:
  b=runtime.launch(headless=True,**args)
  try:run(b,name)
  finally:b.close()
 check('No browser runtime errors',not ERRORS,ERRORS)
 print(json.dumps({'checks':len(CHECKS),'errors':ERRORS,'passed':CHECKS},indent=2))
 Path('/workspace/scratch/online-qa/viewer-prospect.json').write_text(json.dumps({'checks':len(CHECKS),'errors':ERRORS,'passed':CHECKS},indent=2))
