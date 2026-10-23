"""Playtest real per-player online auctions across independent desktop/phone clients.

Set DRAFT_QA_URL to the local or public game URL. Full runs create isolated QA leagues
and leave their test careers in that database; do not point this at a player's league.
DRAFT_QA_OUTPUT controls private screenshots/report/storage output. Browser overrides:
DRAFT_CHROMIUM_PATH and DRAFT_WEBKIT_PATH; otherwise Playwright's installed browsers.
Use --only-two, --only-four, or --only-live for focused reruns. Live one-up bids use physical UI. Full drafts exercise every actual HTTP owner
placement and accelerate honestly: each coach bids their whole budget once, then
the game awards remaining free prospects automatically. No routes are mocked.
"""
from pathlib import Path
from urllib.parse import urlparse
import json,os,sys,time,tempfile,traceback,uuid
from playwright.sync_api import sync_playwright

BASE=os.environ.get('DRAFT_QA_URL','http://127.0.0.1:3000').rstrip('/')
OUT=Path(os.environ.get('DRAFT_QA_OUTPUT',str(Path(tempfile.gettempdir())/'pokemon-player-auction-qa')))
OUT.mkdir(parents=True,exist_ok=True);OUT.chmod(0o700)
INPUT=os.environ.get('DRAFT_PLAYER_INPUT','#player-bid-input')
SUBMIT=os.environ.get('DRAFT_PLAYER_SUBMIT','#player-bid-submit')
CHECKS=[];ERRORS=[];HTTP_ERRORS=[];FLOW=[];START=time.time()
FULL_UI=os.environ.get('DRAFT_QA_FULL_UI')=='1'

def check(name,value,detail=None):
 if not value:raise AssertionError(name+': '+str(detail))
 CHECKS.append(name)

def note_response(r):
 if r.status<400 or not urlparse(r.url).path.startswith('/api/'):return
 try:
  kind=r.headers.get('content-type','');body=r.text();detail=json.loads(body).get('code','') if 'json' in kind else body[:160]
 except Exception:detail='unavailable'
 HTTP_ERRORS.append({'path':urlparse(r.url).path,'status':r.status,'code':detail})

def report(status,error=None):
 value={'status':status,'url':BASE,'seconds':round(time.time()-START,1),'checks':len(CHECKS),'passed':CHECKS,'runtimeErrors':ERRORS,'httpErrors':HTTP_ERRORS,'flowAudit':FLOW}
 if error:value['failure']=str(error)
 (OUT/'report.json').write_text(json.dumps(value,indent=2));print(json.dumps(value,indent=2),flush=True)

def boot(page):
 page.on('pageerror',lambda e:ERRORS.append(str(e)));page.on('response',note_response)
 page.goto(BASE+'/',wait_until='networkidle',timeout=60000);page.set_default_timeout(20000)
 page.wait_for_function('!!window.DraftOnline')
 check('game loads '+str(page.viewport_size['width']),page.title()=='Pokémon Draft League')
 check('no page overflow '+str(page.viewport_size['width']),page.evaluate('document.documentElement.scrollWidth<=innerWidth'))

def state(page):return page.evaluate('DraftOnline.state()')
def wait_phase(page,p):page.wait_for_function('(p)=>DraftOnline.state()?.lobby?.phase===p',arg=p,timeout=60000)
def wait_round(page,id):page.wait_for_function('(id)=>DraftOnline.state()?.lobby?.auction?.currentPokemonId===id',arg=id,timeout=60000)
def close_dialog(page,id):
 if page.locator('#'+id+'[open]').count():page.evaluate('(id)=>document.getElementById(id).close()',id)
def new_online(page):
 page.locator('#new-game-button').click();page.locator('#online-lobby-button').click();page.wait_for_selector('#online-dialog[open]')
def raw_action(page,typ,payload,action_id=None):
 return page.evaluate('''async v=>{
 const s=JSON.parse(localStorage.getItem('pokemon-draft-online-v1')),r=DraftOnline.state();
 const x=await fetch('/api/lobbies/'+r.lobby.code+'/action',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.token},body:JSON.stringify({type:v.type,payload:v.payload,version:r.lobby.version,actionId:v.id})});
 return {status:x.status,body:await x.json()};
 }''',{'type':typ,'payload':payload,'id':action_id or str(uuid.uuid4())})
def action(page,typ,payload={}):return page.evaluate('(v)=>DraftOnline.request(v.type,v.payload)',{'type':typ,'payload':payload})
def own(page):return state(page)['member']['teamIndex']
def snap_ready(page):return state(page)['lobby']['auction']['bidding']
def select_own(page):
 idx=own(page)
 page.evaluate('(idx)=>DraftOnline.selectTeam(idx)',idx)
def visible_input_count(page):return page.locator('#auction-dialog input:visible').count()
def capture(page,label):
 page.screenshot(path=str(OUT/(label+'.png')),full_page=True)
 check(label+' no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
def near(a,b):return abs(a-b)<2
def first_empty_key(board):
 e={'10':['o_wr1','o_wr2','o_wr3','o_wr4'],'11':['o_wr1','o_wr2','o_wr3','o_te1'],'12':['o_wr1','o_wr2','o_te1','o_te2'],'21':['o_wr1','o_wr2','o_te1','o_rb2'],'22':['o_wr1','o_te1','o_te2','o_rb2']}
 f={'3-4':['d_de1','d_dt1','d_de2','d_lb1','d_lb2','d_lb3','d_lb4'],'4-3':['d_de1','d_dt1','d_dt2','d_de2','d_lb1','d_lb2','d_lb3'],'nickel':['d_de1','d_dt1','d_dt2','d_de2','d_lb1','d_lb2','d_nb'],'dime':['d_de1','d_dt1','d_dt2','d_de2','d_lb1','d_nb','d_db6']}
 keys=['d_fs','d_ss','d_cb1','d_cb2']+f[board['defense']]+['o_lt','o_lg','o_c','o_rg','o_rt','o_qb','o_rb1']+e[board['offense']]+['s_k']
 return next(k for k in keys if k not in board['picks'])

def audit_match(m,label):
 check(label+' 46 distinct player stat rows',len({p['pokemonId'] for t in m['teams'] for p in t['players']})==46)
 check(label+' both MVPs',bool(m.get('offensiveMVP',{}).get('name')) and bool(m.get('defensiveMVP',{}).get('name')))
 for idx,t in enumerate(m['teams']):
  total=lambda key,rows=t['players']:sum(p['stats'].get(key,0) for p in rows)
  other=m['teams'][1-idx]['players']
  check(label+f' team{idx} score reconciles',t['score']==sum(t['quarters'])==6*(total('passingTD')+total('rushingTD'))+3*total('fieldGoalsMade')+total('extraPointsMade'))
  for a,b in [('passingYards','receivingYards'),('passingCompletions','receptions'),('passingAttempts','targets'),('passingTD','receivingTD')]:check(label+f' team{idx} '+a,total(a)==total(b))
  for a,b in [('interceptions','interceptionsThrown'),('fumbleRecoveries','fumblesLost'),('sacks','sacksAllowed')]:check(label+f' team{idx} opposing '+a,total(a)==total(b,other))
  check(label+f' team{idx} kicker and biggest play',sum(p['role']=='K' for p in t['players'])==1 and bool(t['biggestPlay']))

def setup(browsers,count,label,pool='both'):
 contexts=[];pages=[]
 for i in range(count):
  mobile=(i%2==1) if count>2 else i==0
  browser=browsers['webkit' if mobile else 'chromium']
  opts={'viewport':{'width':393 if mobile else 1440,'height':740 if mobile else 900},'has_touch':mobile,'is_mobile':mobile,'device_scale_factor':3 if mobile else 1}
  if mobile:opts['user_agent']='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  ctx=browser.new_context(**opts)
  contexts.append(ctx);pages.append(ctx.new_page());boot(pages[-1])
 h=pages[0];new_online(h);h.locator('#online-nickname').fill('QA '+label+' host');h.locator('#online-team-count').select_option(str(count));h.locator('#online-pool').select_option(pool)
 h.locator('#online-name-0').fill('QA '+label+' 1');h.locator('#online-create-button').click();h.wait_for_function('DraftOnline.active()&&DraftOnline.isHost()',timeout=45000)
 check(label+' defaults to individual player control',state(h)['lobby'].get('controlMode')=='players')
 check(label+' early start is prevented',raw_action(h,'start',{})['status']==409)
 code=state(h)['lobby']['code'];check(label+' four digit invitation',len(code)==4 and code.isdigit())
 for i,g in enumerate(pages[1:],1):
  if i%2:g.goto(BASE+'/?lobby='+code,wait_until='networkidle')
  else:new_online(g);g.locator('#online-join-tab').click();g.locator('#online-code').fill(code)
  g.locator('#online-join-nickname').fill('QA '+label+' coach '+str(i+1))
  team=g.locator('#online-join-team-name')
  if team.count():team.fill('QA '+label+' '+str(i+1))
  g.locator('#online-join-button').click();g.wait_for_function('DraftOnline.active()',timeout=45000)
  check(label+' joined player owns distinct team '+str(i),own(g)==i)
 h.wait_for_function('(n)=>DraftOnline.state().lobby.members.length===n',arg=count,timeout=45000)
 for p in pages:
  if p.locator('#online-dialog[open]').count():p.locator('#online-room-close').click()
 FLOW.append(label+': each player joins once; no shared host bid entry.')
 return contexts,pages

def start(pages,label):
 h=pages[0];h.evaluate('DraftOnline.open()');h.locator('#online-start-button').click()
 for i,p in enumerate(pages):
  wait_phase(p,'bidding');p.wait_for_selector(SUBMIT+':visible')
  check(label+' player '+str(i)+' does not see other bid inputs',p.locator('#auction-dialog [id^="auction-bid-"]:visible').count()==0)
  check(label+' no forced numeric keyboard',visible_input_count(p)==0)
  if p.viewport_size['width']>1000:
   check(label+' desktop auction is nonmodal',not p.locator('#auction-dialog').evaluate("e=>e.matches(':modal')"))
   field=p.locator('#field').bounding_box();panel=p.locator('#auction-dialog').bounding_box()
   check(label+' desktop auction beside the field',panel['x']>=field['x']+field['width']-1,(field,panel))
  else:
   check(label+' phone bidding opens automatically',p.locator('#auction-dialog').evaluate("e=>e.matches(':modal')"))
   button=p.locator(SUBMIT).bounding_box()
   check(label+' phone bid requires no scrolling',button['y']>=0 and button['y']+button['height']<=p.viewport_size['height']+1,button)
 FLOW.append(label+': host starts once; each device receives a personal one-click bid automatically.')

def wait_open(page):
 page.wait_for_function("(()=>{const s=DraftOnline.state(),c=s?.clockSync,b=s?.lobby.auction?.bidding;return b&&((c?.serverNow||Date.parse(s.serverTime))+performance.now()-(c?.receivedAt||performance.now()))>=Date.parse(b.opensAt)})()",timeout=30000)
 page.wait_for_function('!document.getElementById("player-bid-submit").disabled',timeout=20000)
def ensure_auction(page):
 if not page.locator(SUBMIT).is_visible():page.evaluate('DraftLiveAuction.open()')
def bid(page,amount,pokemon_id,quick=False):
 wait_round(page,pokemon_id);ensure_auction(page);wait_open(page)
 if quick:page.locator(SUBMIT).click()
 else:action(page,'bid',{'amount':amount,'pokemonId':pokemon_id})
def wait_award(page,id):
 page.wait_for_function('(id)=>DraftOnline.state()?.lobby.auction?.awards.some(a=>a.pokemonId===id)',arg=id,timeout=45000)
 return next(a for a in state(page)['lobby']['auction']['awards'] if a['pokemonId']==id)
def place_owned(pages,award,physical=False):
 p=pages[award['team']];id=award['pokemonId'];wait_award(p,id);select_own(p);board=state(p)['lobby']['teams'][award['team']];key=first_empty_key(board)
 if physical:
  p.evaluate('DraftLiveAuction.minimize()');p.locator('#pc-box-button').click();p.locator('[data-pokemon="'+str(id)+'"]').click();p.locator('[data-slot="'+key+'"]').click()
  p.wait_for_function('(v)=>DraftOnline.state().lobby.teams[v.i].picks[v.key]===v.id',arg={'i':award['team'],'key':key,'id':id},timeout=30000)
 else:action(p,'place',{'teamIndex':award['team'],'slotKey':key,'pokemonId':id})
 return p

def full_case(browsers,count,label,pool):
 print(json.dumps({'case':label,'stage':'setup','teams':count}),flush=True)
 contexts,pages=setup(browsers,count,label,pool);h=pages[0]
 for p in pages:action(p,'scheme',{'offense':'12' if own(p)%2 else '10','defense':'nickel' if own(p)%2 else '4-3'})
 start(pages,label);placed=set()
 for i in range(count):
  if i:wait_award(pages[i],first_id)
  id=state(h)['lobby']['auction']['currentPokemonId']
  if i==0:first_id=id
  bid(pages[i],1000,id);wait_award(h,id)
  check(label+' win stores in PC Box '+str(i),id in state(h)['lobby']['auction']['boxed'][i] and not state(h)['lobby']['teams'][i]['picks'])
 check(label+' next picks do not require any placements',len(state(h)['lobby']['auction']['awards'])==count and sum(state(h)['lobby']['auction']['fieldCounts'])==0)
 # Let free timers continue while actual owners arrange their lineups.
 limit=time.time()+count*23*5+120;physical=set();last_count=0
 while time.time()<limit:
  room=state(h)['lobby'];awards=room['auction']['awards']
  for award in awards:
   id=award['pokemonId']
   if id in placed:continue
   owner=award['team'];place_owned(pages,award,owner not in physical);physical.add(owner);placed.add(id)
  n=len(state(h)['lobby']['auction']['awards'])
  if n//23>last_count//23:print(json.dumps({'case':label,'awarded':n,'placed':len(placed)}),flush=True)
  last_count=n
  if n==count*23 and len(placed)==count*23:break
  h.wait_for_timeout(150)
 else:raise AssertionError(label+' draft did not complete in its timing budget')
 for p in pages:
  wait_phase(p,'complete');p.wait_for_function('DraftOnline.state().lobby.auction.fieldCounts.every(n=>n===23)',timeout=45000)
 room=state(h)['lobby'];check(label+' every roster full',room['auction']['counts']==[23]*count);check(label+' all lineups placed',room['auction']['fieldCounts']==[23]*count)
 check(label+' no duplicate species',len({id for t in room['teams'] for id in t['picks'].values()})==count*23)
 for a in room['auction']['awards']:
  c=state(h)['league']['careers'][str(a['pokemonId'])];check(label+' paid ledger '+str(a['pokemonId']),c['draftCount']==1 and c['totalAuctionPaid']==a['amount'])
 for i,p in enumerate(pages):
  p.reload(wait_until='networkidle');p.wait_for_function('DraftOnline.active()');wait_phase(p,'complete');check(label+' refresh restores PC Box '+str(i),state(p)['lobby']['auction']['boxed'][i]==[])
  capture(p,label+'-full-'+str(i))
 h.evaluate('DraftLiveAuction.open()');h.locator('#player-play-match').click()
 if count>2:h.locator('#matchup-team-0').select_option('0');h.locator('#matchup-team-1').select_option(str(count-1));h.locator('#matchup-play-button').click()
 h.wait_for_function('!!DraftOnline.state().lobby.match',timeout=45000);m=state(h)['lobby']['match'];audit_match(m,label)
 for p in pages:
  p.wait_for_function('(id)=>DraftOnline.state().lobby.match?.matchId===id',arg=m['matchId']);check(label+' shared all46 stat rows '+str(own(p)),p.locator('#match-players details.match-player').count()==46)
 capture(h,label+'-result')
 FLOW.append(label+': timed picks continued without field placements; coaches assigned from PC Box while other auctions ran, then all lineups played a shared match.')
 for c in contexts:c.close()
 print(json.dumps({'case':label,'stage':'passed'}),flush=True)

def live_probe(browsers):
 label='continuous-live';contexts,pages=setup(browsers,3,label,'gen1');h,phone,lagged=pages
 # A fast local clock must not close auctions early. Delayed bid traffic remains valid within the server grace.
 lagged.evaluate('(()=>{const original=Date.now;Date.now=()=>original()+90000})()')
 def delayed(route):
  if route.request.method=='POST' and route.request.url.endswith('/action'):time.sleep(0.9)
  route.continue_()
 lagged.route('**/api/lobbies/**',delayed)
 start(pages,label);id=state(h)['lobby']['auction']['currentPokemonId'];end=state(h)['lobby']['auction']['bidding']['closesAt']
 bid(h,5,id,True);h.wait_for_function('DraftOnline.state().lobby.auction.bidding?.highestBid===5');check('early bid does not inflate timer',state(h)['lobby']['auction']['bidding']['closesAt']==end)
 phone.wait_for_function('DraftOnline.state().lobby.auction.bidding?.highestBid===5');bid(phone,10,id,True)
 lagged.wait_for_function('DraftOnline.state().lobby.auction.bidding?.highestBid===10')
 check('clock skew does not corrupt countdown',0<int(lagged.locator('#player-countdown').text_content().replace('s',''))<=20)
 lagged.wait_for_function('(()=>{const s=DraftOnline.state(),c=s.clockSync;return Date.parse(s.lobby.auction.bidding.closesAt)-(c.serverNow+performance.now()-c.receivedAt)<650})()',timeout=25000)
 lagged.locator(SUBMIT).click();lagged.wait_for_function('DraftOnline.state().lobby.auction.bidding?.highestBid===15',timeout=10000)
 check('in-transit late raise gets five seconds',state(lagged)['lobby']['auction']['bidding']['closesAt']>end)
 award=wait_award(h,id);check('timer awards correct highest price',award['amount']==15 and award['team']==2)
 for p in pages:wait_award(p,id)
 check('winner sees purchase receipt inside auction',lagged.locator('.player-award-receipt').is_visible() and '$15' in lagged.locator('.player-award-receipt').text_content())
 nextid=state(h)['lobby']['auction']['currentPokemonId'];check('winner can leave Pokémon unplaced',state(h)['lobby']['teams'][2]['picks']=={} and state(h)['lobby']['auction']['boxed'][2]==[id]);check('next auction starts without placement',nextid!=id)
 # The owner edits their Box while someone else bids, without being yanked back into a modal.
 lagged.evaluate('DraftLiveAuction.minimize()');lagged.locator('#pc-box-button').click();lagged.locator('#pokemon-search').fill('not-a-pokemon')
 bid(h,5,nextid,True);lagged.wait_for_function('DraftOnline.state().lobby.auction.bidding?.highestBid===5')
 check('Box search survives remote bid',lagged.locator('#pokemon-search').input_value()=='not-a-pokemon')
 check('minimized auction stays minimized',not lagged.locator('#auction-dialog').is_visible())
 lagged.locator('#pokemon-search').fill('');lagged.locator('[data-pokemon="'+str(id)+'"]').click();lagged.locator('[data-slot="o_qb"]').click();lagged.wait_for_function('(id)=>DraftOnline.state().lobby.teams[2].picks.o_qb===id',arg=id)
 check('placement does not restart pick timer',state(lagged)['lobby']['auction']['currentPokemonId']==nextid)
 phone.evaluate('DraftLiveAuction.minimize()');phone.locator('#live-auction-launch').click();phone.wait_for_function('document.querySelector("#auction-dialog").matches(":modal")')
 phone.locator('#player-custom-bid summary').click();phone.locator(INPUT).fill('41');phone.locator(INPUT).press('Enter');phone.wait_for_function('DraftOnline.state().lobby.auction.bidding?.highestBid===41')
 capture(h,label+'-desktop');capture(phone,label+'-phone');capture(lagged,label+'-placed')
 FLOW.append('20-second start; early bids do not extend; a delayed late raise survives transit grace, restores five seconds, and wins; next pick starts without placement; PC Box editing stays uninterrupted; custom bids still work.')
 for c in contexts:c.close()
 print(json.dumps({'case':label,'stage':'passed'}),flush=True)

try:
 with sync_playwright() as p:
  proxy={'server':os.environ['HTTPS_PROXY'],'bypass':'127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
  browsers={}
  for name,env in [('chromium','DRAFT_CHROMIUM_PATH'),('webkit','DRAFT_WEBKIT_PATH')]:
   path=os.environ.get(env);browsers[name]=getattr(p,name).launch(headless=True,proxy=proxy,**({'executable_path':path} if path else {}))
  try:
   if '--only-two' not in sys.argv and '--only-four' not in sys.argv:live_probe(browsers)
   if '--only-two' not in sys.argv and '--only-live' not in sys.argv:full_case(browsers,4,'four-player','gen3')
   if '--only-four' not in sys.argv and '--only-live' not in sys.argv:full_case(browsers,2,'two-player','both')
   check('no JavaScript runtime errors',not ERRORS,ERRORS);report('PASS')
  finally:
   if sys.exc_info()[0]:
    for bn,b in browsers.items():
     for ci,ctx in enumerate(b.contexts):
      for pi,page in enumerate(ctx.pages):
       try:
        storage=OUT/('private-'+bn+'-'+str(ci)+'.json');ctx.storage_state(path=str(storage));storage.chmod(0o600)
       except Exception:pass
       try:page.screenshot(path=str(OUT/('failure-'+bn+'-'+str(ci)+'-'+str(pi)+'.png')),full_page=True)
       except Exception:pass
   for b in browsers.values():b.close()
except Exception as e:report('FAIL',e);traceback.print_exc();sys.exit(1)
