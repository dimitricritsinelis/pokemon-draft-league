"""Playtest a deployed game in independent Chromium desktop and WebKit phone clients.
No mocked routes or database credentials. A full run creates two isolated QA leagues,
completes 4-team and 2-team auctions, saves one match in each, and verifies shared halls.
These QA league records remain in the configured database, separate from player leagues.

Install Python Playwright and its Chromium/WebKit browsers. Set DRAFT_QA_URL to the
public game URL (default: the game's current production deployment). Optional variables:
DRAFT_QA_OUTPUT: report/screenshots/private browser-storage directory (default: tempdir).
DRAFT_CHROMIUM_PATH / DRAFT_WEBKIT_PATH: custom browser executables, otherwise use
Playwright's installed browsers. HTTP(S) proxy settings are preserved when configured.

Use --probe-only for health or blocked-lobby reproduction; --only-phone runs only the
2-team WebKit-host/Chromium-guest case. Browser storage includes QA membership tokens,
is written privately, and must not be committed or shared.
"""
from pathlib import Path
import json, os, sys, time, urllib.request, urllib.error, traceback, tempfile
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
BASE=os.environ.get('DRAFT_QA_URL','https://pokemon-draft-league-jade.vercel.app').rstrip('/')
OUT=Path(os.environ.get('DRAFT_QA_OUTPUT',str(Path(tempfile.gettempdir())/'pokemon-draft-production-qa')))
OUT.mkdir(parents=True,exist_ok=True);OUT.chmod(0o700)
CHECKS=[];ERRORS=[];BLOCKED=[];HEALTH={};HTTP_ERRORS=[];START=time.time()

def check(name,condition,detail=None):
 if not condition:raise AssertionError(name+': '+str(detail))
 CHECKS.append(name)

def report(status):
 value={'url':BASE,'status':status,'seconds':round(time.time()-START,1),'passed':CHECKS,'checks':len(CHECKS),'runtimeErrors':ERRORS,'blocked':BLOCKED,'health':HEALTH,'httpErrors':HTTP_ERRORS}
 (OUT/'report.json').write_text(json.dumps(value,indent=2));print(json.dumps(value,indent=2),flush=True)

def health():
 try:
  r=urllib.request.urlopen(BASE+'/api/health',timeout=25);return r.status,json.load(r)
 except urllib.error.HTTPError as e:
  try:return e.code,json.loads(e.read().decode())
  except:return e.code,{}

def note_response(response):
 if response.status<400 or not urlparse(response.url).path.startswith('/api/'):return
 try:
  kind=response.headers.get('content-type','');body=response.text()
  detail=json.loads(body).get('code','') if 'json' in kind else body[:240]
 except Exception:detail='Response body unavailable'
 HTTP_ERRORS.append({'path':urlparse(response.url).path,'status':response.status,'contentType':response.headers.get('content-type',''),'detail':detail})

def boot(page):
 page.on('pageerror',lambda e:ERRORS.append(str(e)))
 page.on('response',note_response)
 page.goto(BASE+'/',wait_until='networkidle',timeout=60000)
 page.wait_for_function('!!window.DraftOnline');page.set_default_timeout(15000)
 check('public game loads at '+str(page.viewport_size['width']),page.title()=='Pokémon Draft League')
 check('no horizontal overflow at '+str(page.viewport_size['width']),page.evaluate('document.documentElement.scrollWidth<=innerWidth'))

def state(page):return page.evaluate('DraftOnline.state()')
def phase(page,p):page.wait_for_function('(p)=>DraftOnline.state()?.lobby?.phase===p',arg=p,timeout=45000)
def menu(page):
 if not page.locator('#draft-menu').is_visible():page.locator('#menu-toggle').click()
def open_room(page):menu(page);page.locator('#online-lobby-button').click()
def close_dialogs(page):page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
def open_chat(page):
 close_dialogs(page)
 if not page.locator('#online-side-panel').is_visible():page.locator('#online-chat-button').click()
def send_chat(page,text):
 open_chat(page);page.locator('#online-chat-input').fill(text);page.locator('#online-chat-send').click()
 page.wait_for_function('(t)=>DraftOnline.state()?.lobby?.messages.some(m=>m.message===t)',arg=text,timeout=45000)
def wait_message(page,text):page.wait_for_function('(t)=>DraftOnline.state()?.lobby?.messages.some(m=>m.message===t)',arg=text,timeout=45000)

def audit_match(m,prefix):
 check(prefix+' offensive MVP named',bool(m.get('offensiveMVP',{}).get('name')))
 check(prefix+' defensive MVP named',bool(m.get('defensiveMVP',{}).get('name')))
 check(prefix+' 46 player stats',len([p for t in m['teams'] for p in t['players']])==46)
 check(prefix+' unique players',len({p['pokemonId'] for t in m['teams'] for p in t['players']})==46)
 for i,t in enumerate(m['teams']):
  def total(key,rows=None):return sum(p['stats'].get(key,0) for p in (rows if rows is not None else t['players']))
  other=m['teams'][1-i]['players']
  check(prefix+f' team{i} score',t['score']==sum(t['quarters'])==6*(total('passingTD')+total('rushingTD'))+3*total('fieldGoalsMade')+total('extraPointsMade'))
  for a,b in [('passingYards','receivingYards'),('passingCompletions','receptions'),('passingAttempts','targets'),('passingTD','receivingTD')]:check(prefix+f' team{i} '+a,total(a)==total(b))
  for a,b in [('interceptions','interceptionsThrown'),('fumbleRecoveries','fumblesLost'),('sacks','sacksAllowed'),('sackYards','sackYardsLost')]:check(prefix+f' team{i} opposing '+a,total(a)==total(b,other))
  check(prefix+f' team{i} kicker',sum(p['role']=='K' and p['side']=='special' for p in t['players'])==1)
  check(prefix+f' team{i} biggest play',bool(t.get('biggestPlay')) or bool(m.get('biggestPlays')))

def complete(page):
 return page.evaluate('''async()=>{
 const keys=t=>{const e={'10':['o_wr1','o_wr2','o_wr3','o_wr4'],'11':['o_wr1','o_wr2','o_wr3','o_te1'],'12':['o_wr1','o_wr2','o_te1','o_te2'],'21':['o_wr1','o_wr2','o_te1','o_rb2'],'22':['o_wr1','o_te1','o_te2','o_rb2']};const f={'3-4':['d_de1','d_dt1','d_de2','d_lb1','d_lb2','d_lb3','d_lb4'],'4-3':['d_de1','d_dt1','d_dt2','d_de2','d_lb1','d_lb2','d_lb3'],nickel:['d_de1','d_dt1','d_dt2','d_de2','d_lb1','d_lb2','d_nb'],dime:['d_de1','d_dt1','d_dt2','d_de2','d_lb1','d_nb','d_db6']};return ['d_fs','d_ss','d_cb1','d_cb2',...f[t.defense],'o_lt','o_lg','o_c','o_rg','o_rt','o_qb','o_rb1',...e[t.offense],'s_k'];};
 while(DraftOnline.state().lobby.phase!=='complete'){
 let r=DraftOnline.state().lobby;
 if(r.phase==='bidding'){const target=r.auction.counts.findIndex(n=>n<23);await DraftOnline.request('bid',{bids:r.teams.map((_,i)=>i===target?1:0)});r=DraftOnline.state().lobby;}
 const w=r.auction.pendingAward,t=r.teams[w.team];await DraftOnline.request('place',{teamIndex:w.team,slotKey:keys(t).find(k=>!t.picks[k])});
 }
 return DraftOnline.state().lobby;
 }''')

def reproduction(browsers):
 for label,browser,viewport in browsers:
  ctx=browser.new_context(viewport=viewport,has_touch=label=='webkit');page=ctx.new_page();boot(page)
  menu(page);check(label+' generation options',page.locator('.generation-switch button').count()==4)
  open_room(page);page.locator('#online-nickname').fill('QA deploy probe')
  check(label+' team options',page.locator('#online-team-count option').count()==3)
  check(label+' pool options',page.locator('#online-pool option').count()==4)
  page.locator('#online-create-button').click();page.wait_for_selector('#online-error:not([hidden])',timeout=45000)
  text=page.locator('#online-error').inner_text();BLOCKED.append(label+' create lobby: '+text)
  page.screenshot(path=str(OUT/(label+'-blocked-lobby.png')),full_page=True)
  ctx.close()

def scenario(host_browser,guest_browser,host_view,guest_view,count,pool,label):
 print(json.dumps({'scenario':label,'stage':'starting','teams':count,'pool':pool}),flush=True)
 hctx=host_browser.new_context(viewport=host_view,has_touch=host_view['width']<500);gctx=guest_browser.new_context(viewport=guest_view,has_touch=guest_view['width']<500)
 h,g=hctx.new_page(),gctx.new_page();boot(h);boot(g)
 open_room(h);h.locator('#online-nickname').fill('QA Host '+label);h.locator('#online-team-count').select_option(str(count));h.locator('#online-pool').select_option(pool)
 for i in range(count):h.locator(f'#online-name-{i}').fill(f'QA {label} Team {i+1}')
 h.locator('#online-create-button').click();h.wait_for_function('DraftOnline.active()&&DraftOnline.isHost()',timeout=45000)
 check(label+' 4-digit lobby',len(state(h)['lobby']['code'])==4 and state(h)['lobby']['code'].isdigit())
 # Confirm every generation and team-count configuration against the live backend, before guests claim slots.
 for mode in ['gen1','gen2','gen3','both']:
  h.evaluate('(mode)=>DraftOnline.request("configure",{mode})',mode);check(label+' configured '+mode,state(h)['lobby']['mode']==mode)
 for n in [2,3,4,count]:
  h.evaluate('(n)=>DraftOnline.request("configure",{teamCount:n})',n);check(label+' configured '+str(n)+' teams',state(h)['lobby']['teamCount']==n)
 h.evaluate('(mode)=>DraftOnline.request("configure",{mode})',pool)
 code=state(h)['lobby']['code'];g.goto(BASE+'/?lobby='+code,wait_until='networkidle');g.locator('#online-join-nickname').fill('QA Guest '+label);g.locator('#online-join-button').click();g.wait_for_function('DraftOnline.active()&&!DraftOnline.isHost()',timeout=45000)
 check(label+' guest cannot start',g.locator('#online-start-button').is_hidden())
 check(label+' host command rejected for guest',g.evaluate("DraftOnline.request('start').then(()=>false,e=>/host/i.test(e.message))"))
 probe='QA '+label+' <img src=x onerror="window.__chatXss=true">'
 send_chat(g,probe);wait_message(h,probe);open_chat(h)
 check(label+' cross-device chat is plain text',probe in h.locator('#online-chat-messages').inner_text() and h.locator('#online-chat-messages img').count()==0 and not h.evaluate('!!window.__chatXss'))
 h.locator('#online-panel-close').click();h.evaluate('DraftOnline.open()');h.locator('#online-start-button').click();phase(h,'bidding');phase(g,'bidding')
 print(json.dumps({'scenario':label,'stage':'auction started'}),flush=True)
 check(label+' auction size',state(h)['lobby']['auction']['total']==count*23)
 if not h.locator('#auction-dialog').is_visible():h.locator('#auction-resume-button').click()
 old=state(h)['lobby']['auction']['currentPokemonId'];h.locator('#auction-skip-button').click();h.wait_for_function('(id)=>DraftOnline.state()?.lobby?.auction?.currentPokemonId!==id',arg=old)
 check(label+' skipped prospect discarded',old in state(h)['lobby']['auction']['skipped'])
 check(label+' auction card fits',h.locator('#auction-dialog').evaluate('el=>el.scrollWidth<=el.clientWidth+2'))
 h.locator('#auction-bid-0').fill('31');send_chat(g,'QA '+label+' typed bid survives chat');wait_message(h,'QA '+label+' typed bid survives chat')
 check(label+' bid survives polling',h.locator('#auction-bid-0').input_value()=='31')
 h.screenshot(path=str(OUT/(label+'-auction.png')),full_page=True)
 for i in range(count):h.locator(f'#auction-bid-{i}').fill('40' if i==count-1 else '0')
 h.locator('#auction-bid-button').click();phase(h,'placement')
 check(label+' wallet deduction',state(h)['lobby']['auction']['budgets'][count-1]==960)
 h.locator('[data-slot="s_k"]').click();phase(h,'bidding');g.wait_for_function('(n)=>!!DraftOnline.state()?.lobby?.teams[n]?.picks.s_k',arg=count-1)
 first=state(h)['lobby']['teams'][count-1]['picks']['s_k'];h.reload(wait_until='networkidle');g.reload(wait_until='networkidle');h.wait_for_function('DraftOnline.active()&&DraftOnline.isHost()');g.wait_for_function('DraftOnline.active()&&!DraftOnline.isHost()')
 check(label+' reload resumes persisted assignment',state(h)['lobby']['teams'][count-1]['picks']['s_k']==state(g)['lobby']['teams'][count-1]['picks']['s_k']==first)
 print(json.dumps({'scenario':label,'stage':'completing remaining auction'}),flush=True)
 final=complete(h)
 print(json.dumps({'scenario':label,'stage':'auction complete'}),flush=True)
 check(label+' all rosters complete',final['auction']['counts']==[23]*count)
 for award in final['auction']['awards']:
  career=state(h)['league']['careers'][str(award['pokemonId'])]
  check(label+' persistent draft count '+str(award['pokemonId']),career['draftCount']==1 and career['auctionPurchases']==1)
  check(label+' persistent auction price '+str(award['pokemonId']),career['totalAuctionPaid']==award['amount'] and career['averagePaid']==award['amount'])
 check(label+' no duplicate species',len({x for t in final['teams'] for x in t['picks'].values()})==count*23)
 check(label+' skipped species never awarded',old not in {x for t in final['teams'] for x in t['picks'].values()})
 h.evaluate('DraftOnline.request("simulate",{teamIndexes:[0,1]})');h.wait_for_function('!!DraftOnline.state()?.lobby?.match');m=state(h)['lobby']['match'];audit_match(m,label)
 g.wait_for_function('(id)=>DraftOnline.state()?.lobby?.match?.matchId===id',arg=m['matchId'],timeout=45000)
 check(label+' same final score on guest',[(x['score']) for x in state(g)['lobby']['match']['teams']]==[(x['score']) for x in m['teams']])
 check(label+' 46 stat rows visible',h.locator('#match-players details.match-player').count()==46)
 check(label+' career match recorded once',state(h)['league']['matchCount']==1)
 for t in m['teams']:
  for p in t['players']:
   c=state(h)['league']['careers'][str(p['pokemonId'])];check(label+' career '+str(p['pokemonId']),c['games']==1 and c['draftCount']==1)
 h.screenshot(path=str(OUT/(label+'-match.png')),full_page=True)
 h.reload(wait_until='networkidle');g.reload(wait_until='networkidle');h.wait_for_function('!!DraftOnline.state()?.lobby?.match');g.wait_for_function('!!DraftOnline.state()?.lobby?.match');check(label+' results persist reload',state(h)['lobby']['match']['matchId']==state(g)['lobby']['match']['matchId']==m['matchId'])
 check(label+' guest career persists',state(g)['league']['matchCount']==1)
 # Retire a player only after the auction and match are complete. Induction is removed afterward.
 retired=m['teams'][0]['players'][0]['pokemonId'];saved_career=state(h)['league']['careers'][str(retired)]
 for kind in ['fame','shame']:
  h.evaluate('(v)=>DraftOnline.hallAction(v.id,v.kind)',{'id':retired,'kind':kind})
  g.wait_for_function('(v)=>DraftOnline.state()?.league?.hall?.[v.id]?.kind===v.kind',arg={'id':retired,'kind':kind},timeout=45000)
  frozen=state(g)['league']['hall'][str(retired)]
  check(label+' shared '+kind+' career frozen',frozen['career']['games']==saved_career['games'] and all(frozen['career']['stats'].get(k,0)==saved_career['stats'].get(k,0) for k in set(frozen['career']['stats'])|set(saved_career['stats'])))
  check(label+' '+kind+' retired player cannot enter a match',h.evaluate("DraftOnline.request('simulate',{teamIndexes:[0,1]}).then(()=>false,e=>e.code==='RETIRED')"))
  check(label+' '+kind+' reveals position values',len(frozen['values'])>=20 and all(isinstance(v,(int,float)) for v in frozen['values'].values()))
  h.evaluate('(id)=>DraftOnline.hallAction(id,null)',retired)
  g.wait_for_function('(id)=>!DraftOnline.state()?.league?.hall?.[id]',arg=retired,timeout=45000)
  check(label+' '+kind+' removal preserves career',state(g)['league']['careers'][str(retired)]['stats']==saved_career['stats'])
 # Keep credentials local to this QA run for follow-up checks; never print or commit these files.
 for role,ctx in [('host',hctx),('guest',gctx)]:
  private=OUT/(label+'-'+role+'-private-storage.json');ctx.storage_state(path=str(private));private.chmod(0o600)
 hctx.close();gctx.close()
 print(json.dumps({'scenario':label,'stage':'passed'}),flush=True)

try:
 status,payload=health();HEALTH={'status':status,'body':payload}
 with sync_playwright() as p:
  proxy={'server':os.environ['HTTPS_PROXY'],'bypass':'127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
  ch_path=os.environ.get('DRAFT_CHROMIUM_PATH');wk_path=os.environ.get('DRAFT_WEBKIT_PATH')
  ch=p.chromium.launch(headless=True,proxy=proxy,**({'executable_path':ch_path} if ch_path else {}))
  wk=p.webkit.launch(headless=True,proxy=proxy,**({'executable_path':wk_path} if wk_path else {}))
  try:
   if status!=200 or payload.get('ok') is not True:
    reproduction([('chromium',ch,{'width':1440,'height':900}),('webkit',wk,{'width':393,'height':852})]);report('BLOCKED_DATABASE')
   elif '--probe-only' in sys.argv:report('HEALTHY_PROBE')
   else:
    if urlparse(BASE).hostname not in ['localhost','127.0.0.1']:check('production uses Supabase',payload.get('persistence')=='supabase')
    if '--only-phone' not in sys.argv:scenario(ch,wk,{'width':1440,'height':900},{'width':393,'height':852},4,'gen3','desktop-host')
    scenario(wk,ch,{'width':393,'height':852},{'width':1440,'height':900},2,'both','phone-host')
    check('no browser runtime errors',not ERRORS,ERRORS);report('PASS')
  finally:ch.close();wk.close()
except Exception as e:
 BLOCKED.append(str(e));report('FAIL');traceback.print_exc();sys.exit(1)
