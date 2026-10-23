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

def submit(page,amount,pokemon_id,physical=False):
 wait_round(page,pokemon_id)
 if physical:
  page.locator(SUBMIT).click()
 else:action(page,'bid',{'amount':amount,'pokemonId':pokemon_id})

def place(pages,room,physical=False):
 winner=room['auction']['pendingAward']['team'];award=room['auction']['pendingAward'];p=pages[winner]
 wait_phase(p,'placement');key=first_empty_key(room['teams'][winner])
 if physical:
  p.wait_for_function("!document.querySelector('#auction-dialog').matches(':modal')")
  p.locator('[data-slot="'+key+'"]').click()
 else:action(p,'place',{'teamIndex':winner,'slotKey':key,'pokemonId':award['pokemonId']})
 p.wait_for_function('(id)=>DraftOnline.state()?.lobby?.auction?.pendingAward?.pokemonId!==id',arg=award['pokemonId'],timeout=30000)
 return p

def full_case(browsers,count,label,pool):
 print(json.dumps({'case':label,'stage':'setup','teams':count}),flush=True)
 contexts,pages=setup(browsers,count,label,pool);h=pages[0]
 for p in pages:
  check(label+' other roster protected '+str(own(p)),raw_action(p,'scheme',{'teamIndex':(own(p)+1)%count,'offense':'10'})['status']==403)
  action(p,'scheme',{'teamIndex':own(p),'offense':'12' if own(p)%2 else '10','defense':'nickel' if own(p)%2 else '4-3'})
 start(pages,label)
 capture(h,label+'-initial')
 # Every coach spends their actual budget once: highest possible bids legitimately
 # settle immediately, so the rest of this full lifecycle needs no fake timer.
 for i in range(count):
  wait_phase(pages[i],'bidding');id=state(pages[i])['lobby']['auction']['currentPokemonId']
  pages[i].evaluate('(idx)=>DraftOnline.selectTeam(idx)',(i+1)%count)
  action(pages[i],'bid',{'amount':1000,'pokemonId':id});wait_phase(pages[i],'placement');room=state(pages[i])['lobby']
  check(label+' all-in awarded coach '+str(i),room['auction']['pendingAward']['team']==i and room['auction']['budgets'][i]==0)
  check(label+' host cannot place another roster '+str(i),raw_action(pages[(i+1)%count],'place',{'teamIndex':i,'slotKey':'s_k','pokemonId':id})['status']==403)
  if i==0:
   capture(pages[i],label+'-winner-placement')
   capture(pages[1],label+'-nonwinner-wait')
  place(pages,room,True)
 placed=count;seen=set()
 while placed<count*23:
  # All wallets are now empty; free awards are automatic and only their owner
  # should be asked to place. No artificial bid submission per free prospect.
  h.wait_for_function('(n)=>DraftOnline.state()?.lobby?.auction?.counts.reduce((a,b)=>a+b,0)>n',arg=placed,timeout=60000)
  room=state(h)['lobby'];award=room['auction']['pendingAward'];idx=award['team'];winner=pages[idx]
  wait_phase(winner,'placement');check(label+' free automatic round '+str(placed+1),award['amount']==0)
  check(label+' each free prospect unique '+str(placed+1),award['pokemonId'] not in seen);seen.add(award['pokemonId'])
  for p in pages:
   if state(p)['lobby']['auction']['counts'][own(p)]==23 and own(p)!=idx:
    check(label+' full coach cannot bid '+str(placed),p.locator(SUBMIT+':visible:enabled').count()==0)
  place(pages,room,FULL_UI or placed<count+2);placed+=1
  if placed%23==0:print(json.dumps({'case':label,'stage':'draft','placed':placed}),flush=True)
 for p in pages:wait_phase(p,'complete')
 room=state(h)['lobby'];check(label+' every roster full',room['auction']['counts']==[23]*count)
 check(label+' no duplicated species',len({id for t in room['teams'] for id in t['picks'].values()})==count*23)
 for award in room['auction']['awards']:
  c=state(h)['league']['careers'][str(award['pokemonId'])];check(label+' paid ledger '+str(award['pokemonId']),c['draftCount']==1 and c['totalAuctionPaid']==award['amount'] and c['averagePaid']==award['amount'])
 FLOW.append(label+': every roster completed with one winner placement per pick; empty wallets received automatic free awards.')
 # Reconnect all independent clients before the match; server owns the draft.
 for p in pages:p.reload(wait_until='networkidle');p.wait_for_function('DraftOnline.active()',timeout=45000);wait_phase(p,'complete')
 check(label+' refresh retains every roster',state(h)['lobby']['teams']==room['teams'])
 contexts[-1].set_offline(True);pages[-1].evaluate('window.dispatchEvent(new Event("offline"))')
 contexts[-1].set_offline(False);pages[-1].evaluate('window.dispatchEvent(new Event("online"))')
 pages[-1].wait_for_function('DraftOnline.active()&&DraftOnline.state().lobby.phase==="complete"',timeout=45000)
 check(label+' reconnect retains own seat',own(pages[-1])==count-1)
 action(h,'simulate',{'teamIndexes':[0,1]});h.wait_for_function('!!DraftOnline.state().lobby.match',timeout=45000);m=state(h)['lobby']['match'];audit_match(m,label)
 for p in pages:
  p.wait_for_function('(id)=>DraftOnline.state()?.lobby?.match?.matchId===id',arg=m['matchId'],timeout=60000)
  check(label+' same match on device '+str(own(p)),state(p)['lobby']['match']['summary']==m['summary'])
  check(label+' all result rows rendered '+str(own(p)),p.locator('#match-players details.match-player').count()==46)
 capture(h,label+'-result')
 close_dialog(h,'match-dialog')
 retired=next(iter(room['teams'][0]['picks'].values()))
 for kind in ['fame','shame',None]:
  h.evaluate('(v)=>DraftOnline.hallAction(v.id,v.kind)',{'id':retired,'kind':kind})
  for p in pages:
   p.evaluate('DraftOnline.refreshLeague()')
   hall=p.evaluate('DraftOnline.league().hall');entry=hall.get(str(retired))
   check(label+' shared hall '+str(kind)+' device '+str(own(p)),entry['kind']==kind if kind else entry is None)
   if kind:check(label+' retired scores revealed',bool(entry['values']) and bool(entry['career']))
 for i,p in enumerate(pages):
  for dialog in ['match-dialog','auction-dialog']:close_dialog(p,dialog)
  select_own(p)
  p.locator('#field').screenshot(path=str(OUT/(label+'-full-roster-'+str(i)+'.png')))
  overlaps=p.locator('#field .position').evaluate_all('''els=>{const out=[];for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)out.push([els[i].dataset.slot,els[j].dataset.slot]);}return out;}''')
  check(label+' full roster tiles do not overlap '+str(i),not overlaps,overlaps)
 for i,ctx in enumerate(contexts):
  private=OUT/(label+'-player-'+str(i)+'-private.json');ctx.storage_state(path=str(private));private.chmod(0o600)
 for ctx in contexts:ctx.close()
 print(json.dumps({'case':label,'stage':'passed'}),flush=True)

def live_probe(browsers):
 label='three-player-live';print(json.dumps({'case':label,'stage':'setup'}),flush=True)
 contexts,pages=setup(browsers,3,label,'gen1');h=pages[0];start(pages,label)
 skipped=state(h)['lobby']['auction']['currentPokemonId']
 check(label+' nonhost cannot skip',raw_action(pages[1],'skip',{'pokemonId':skipped})['status']==403)
 action(h,'skip',{'pokemonId':skipped})
 id=state(h)['lobby']['auction']['currentPokemonId'];old_end=state(h)['lobby']['auction']['bidding']['closesAt']
 check(label+' skipped species discarded',skipped in state(h)['lobby']['auction']['skipped'] and id!=skipped)
 check(label+' stale skip rejected',raw_action(h,'skip',{'pokemonId':skipped})['status']==409)
 for p in pages:wait_round(p,id)
 submit(h,1,id,True)
 for p in pages:p.wait_for_function('DraftOnline.state()?.lobby?.auction?.bidding?.highestBid===1',timeout=15000)
 check(label+' leading coach cannot selfraise',raw_action(h,'bid',{'amount':2,'pokemonId':id})['status']==409)
 check(label+' host cannot skip a live bid',raw_action(h,'skip',{'pokemonId':id})['status']==409)
 check(label+' missing nominee rejected',raw_action(pages[1],'bid',{'amount':2})['status']==409)
 check(label+' lower bid rejected',raw_action(pages[1],'bid',{'amount':1,'pokemonId':id})['status']==400)
 check(label+' other team bid rejected',raw_action(h,'bid',{'amount':2,'pokemonId':id,'teamIndex':1})['status']==403)
 submit(pages[1],2,id,True)
 for p in pages:p.wait_for_function('DraftOnline.state()?.lobby?.auction?.bidding?.highestBid===2',timeout=15000)
 capture(pages[0],label+'-desktop-live');capture(pages[1],label+'-phone-live')
 # Real elapsed clock, including a late raise. wait_for_function yields the
 # browser loop and leaves all real polling active; no route or clock override.
 pages[2].wait_for_function('Date.parse(DraftOnline.state().lobby.auction.bidding.closesAt)-Date.now()<6000',timeout=25000)
 submit(pages[2],3,id,True)
 pages[2].wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===3',timeout=10000)
 b=state(pages[2])['lobby']['auction']['bidding'];check(label+' late bid extends clock',b['closesAt']>old_end)
 for p in pages:wait_phase(p,'placement')
 room=state(h)['lobby'];check(label+' countdown awards highest bidder',room['auction']['pendingAward']['team']==2 and room['auction']['pendingAward']['amount']==3)
 check(label+' all wallets debit only winner',room['auction']['budgets']==[1000,1000,997])
 place(pages,room,True)
 for p in pages:wait_phase(p,'bidding')
 nextid=state(h)['lobby']['auction']['currentPokemonId'];check(label+' advances without reopening button',nextid!=id and pages[2].locator(SUBMIT).is_visible())
 check(label+' old nominee bid rejected',raw_action(h,'bid',{'amount':1,'pokemonId':id})['status']==409)
 # Chat remains editable through remote updates; only one chat form per device.
 h.evaluate("document.querySelector('#online-header-chat-button').click()")
 h.locator('#online-chat-input').fill('Unsent draft plan')
 submit(pages[1],1,nextid,True)
 h.wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===1',timeout=15000)
 check(label+' chat draft preserved across bids',h.locator('#online-chat-input').input_value()=='Unsent draft plan')
 h.locator('#online-chat-form').evaluate('(e)=>e.requestSubmit()')
 for p in pages:p.wait_for_function('DraftOnline.state().lobby.messages.some(m=>m.message==="Unsent draft plan")',timeout=15000)
 check(label+' chat delivered across devices',all('Unsent draft plan' in p.locator('#online-chat-messages').text_content() for p in pages))
 h.locator('#online-panel-close').click()
 h.locator('#player-custom-bid summary').click();h.locator(INPUT).fill('41')
 submit(pages[2],2,nextid,True)
 h.wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===2',timeout=15000)
 check(label+' custom bid text survives remote raise',h.locator(INPUT).input_value()=='41')
 h.locator(INPUT).press('Enter');h.wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===41',timeout=15000)
 check(label+' keyboard custom bid sent',h.locator(INPUT).input_value()=='' and not h.locator('#player-custom-bid').evaluate('e=>e.open'))
 phone=pages[1];phone.wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===41',timeout=15000)
 phone.locator('#player-custom-bid summary').click();phone.locator(INPUT).fill('42')
 # WebKit cannot summon a physical iOS keyboard in headless mode. Reduce its
 # visual viewport only, keeping layout viewport unchanged, to inspect the
 # browser's real resize handlers and reachable controls under the keyboard.
 phone.evaluate('Object.defineProperty(visualViewport,"height",{configurable:true,get:()=>390});visualViewport.dispatchEvent(new Event("resize"))')
 button=phone.locator(SUBMIT).bounding_box()
 check(label+' phone custom bid fits keyboard viewport',button['y']>=0 and button['y']+button['height']<=390,button)
 capture(phone,label+'-phone-custom-keyboard')
 phone.locator(INPUT).press('Enter');phone.wait_for_function('DraftOnline.state().lobby.auction.bidding.highestBid===42',timeout=15000)
 phone.evaluate('delete visualViewport.height;visualViewport.dispatchEvent(new Event("resize"))')
 check(label+' phone Enter submits own bid',state(phone)['lobby']['auction']['bidding']['leaderTeam']==1)
 FLOW.append(label+': three different devices raised $1→$2→$3; real countdown extended for the late raise and awarded automatically; chat and custom bid drafts survived remote updates; Enter submitted own custom bids.')
 for ctx in contexts:ctx.close()
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
       try:page.screenshot(path=str(OUT/('failure-'+bn+'-'+str(ci)+'-'+str(pi)+'.png')),full_page=True)
       except Exception:pass
   for b in browsers.values():b.close()
except Exception as e:report('FAIL',e);traceback.print_exc();sys.exit(1)
