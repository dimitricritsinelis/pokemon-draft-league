"""Cross-device mobile QA. Run against `npm run dev` with its explicit local database.
Uses the workspace's installed Python Playwright; exercises real HTTP and browser UIs.
"""
from pathlib import Path
import json, os, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get('DRAFT_QA_URL', 'http://127.0.0.1:3000/').rstrip('/') + '/'
OUT = Path(os.environ.get('DRAFT_QA_OUTPUT', '/workspace/scratch/online-qa'))
OUT.mkdir(parents=True, exist_ok=True)
CHECKS, ERRORS = [], []

def check(name, condition, detail=None):
    if not condition: raise AssertionError(f'{name}: {detail}')
    CHECKS.append(name)

def boot(page):
    page.on('pageerror', lambda error: ERRORS.append(str(error)))
    page.goto(BASE, wait_until='networkidle')
    page.wait_for_function('!!window.DraftOnline')

def menu(page):
    if not page.locator('#draft-menu').is_visible(): page.locator('#menu-toggle').click()

def open_room(page):
    page.locator('#new-game-button').click()
    page.wait_for_selector('#auction-setup-dialog[open]')
    page.locator('#online-lobby-button').click()
    page.wait_for_selector('#online-dialog[open]')

def snapshot(page):
    return page.evaluate('DraftOnline.state()')

def wait_phase(page, phase):
    page.wait_for_function('(phase)=>DraftOnline.state()?.lobby?.phase===phase', arg=phase)

def open_chat(page):
    # Close native modal dialogs before opening the room panel.
    page.evaluate("document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close())")
    if not page.locator('#online-side-panel').is_visible(): page.locator('#online-chat-button').click()

def send_chat(page, text):
    open_chat(page)
    page.locator('#online-chat-input').fill(text)
    page.locator('#online-chat-send').click()
    page.wait_for_function('(text)=>DraftOnline.state()?.lobby?.messages.some(m=>(m.message||m.text)===text)', arg=text)

def fit(page, selector):
    return page.locator(selector).evaluate('(el)=>el.scrollWidth<=el.clientWidth+2')

def complete_draft(page):
    return page.evaluate('''async()=>{
      const allKeys = board => {
        const extras={ '10':['o_wr1','o_wr2','o_wr3','o_wr4'], '11':['o_wr1','o_wr2','o_wr3','o_te1'], '12':['o_wr1','o_wr2','o_te1','o_te2'], '21':['o_wr1','o_wr2','o_te1','o_rb2'], '22':['o_wr1','o_te1','o_te2','o_rb2'] };
        const fronts={ '3-4':['d_de1','d_dt1','d_de2','d_lb1','d_lb2','d_lb3','d_lb4'], '4-3':['d_de1','d_dt1','d_dt2','d_de2','d_lb1','d_lb2','d_lb3'], nickel:['d_de1','d_dt1','d_dt2','d_de2','d_lb1','d_lb2','d_nb'], dime:['d_de1','d_dt1','d_dt2','d_de2','d_lb1','d_nb','d_db6'] };
        return ['d_fs','d_ss','d_cb1','d_cb2',...fronts[board.defense],'o_lt','o_lg','o_c','o_rg','o_rt','o_qb','o_rb1',...extras[board.offense],'s_k'];
      };
      while(DraftOnline.state().lobby.phase!=='complete'){
        let room=DraftOnline.state().lobby;
        if(room.phase==='bidding'){
          const target=room.auction.counts.findIndex(n=>n<23),bids=room.teams.map((_,i)=>i===target?1:0);
          await DraftOnline.request('bid',{bids});room=DraftOnline.state().lobby;
        }
        const won=room.auction.pendingAward,board=room.teams[won.team];
        const slotKey=allKeys(board).find(key=>!board.picks[key]);
        await DraftOnline.request('place',{teamIndex:won.team,slotKey});
      }
      return DraftOnline.state().lobby;
    }''')

def audit_match(result):
    check('Match contains46 unique players',len({p['pokemonId'] for t in result['teams'] for p in t['players']})==46)
    for i,team in enumerate(result['teams']):
        total=lambda key,rows=team['players']:sum(p['stats'].get(key,0) for p in rows)
        other=result['teams'][1-i]['players']
        check(team['name']+' score reconciles',team['score']==sum(team['quarters'])==6*(total('passingTD')+total('rushingTD'))+3*total('fieldGoalsMade')+total('extraPointsMade'))
        for a,b in [('passingYards','receivingYards'),('passingCompletions','receptions'),('passingAttempts','targets'),('passingTD','receivingTD')]:check(team['name']+' '+a+' reconciles',total(a)==total(b))
        for a,b in [('interceptions','interceptionsThrown'),('fumbleRecoveries','fumblesLost'),('sacks','sacksAllowed'),('sackYards','sackYardsLost')]:check(team['name']+' opposing '+a+' reconciles',total(a)==total(b,other))
        check(team['name']+' has a kicker',sum(p['role']=='K' and p['side']=='special' for p in team['players'])==1)

def scenario(browser, engine):
    host_context = browser.new_context(viewport={'width':393,'height':730}, is_mobile=True, has_touch=True)
    guest_context = browser.new_context(viewport={'width':393,'height':730}, is_mobile=True, has_touch=True)
    h, g = host_context.new_page(), guest_context.new_page()
    boot(h); boot(g)
    original_offline = h.evaluate("localStorage.getItem('pokemon-draft-league-v1')")
    open_room(h)
    h.locator('#online-nickname').fill('Host coach')
    h.locator('#online-team-count').select_option('4')
    h.locator('#online-pool').select_option('gen3')
    for i in range(4): h.locator(f'#online-name-{i}').fill(['Kanto Comets','Johto Jets','Hoenn Hurricanes','Pallet Panthers'][i])
    h.locator('#online-create-button').click()
    h.wait_for_function('DraftOnline.active()&&DraftOnline.isHost()')
    room = snapshot(h)['lobby']['code']
    check(engine+' room is four digits',len(room)==4 and room.isdigit())
    check(engine+' setup no horizontal overflow',fit(h, '#online-dialog') and h.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    g.goto(BASE+'?lobby='+room,wait_until='networkidle')
    g.locator('#online-join-nickname').fill('Guest coach')
    g.locator('#online-join-button').click()
    g.wait_for_function('DraftOnline.active()&&!DraftOnline.isHost()')
    check(engine+' guest sees same room',snapshot(g)['lobby']['code']==room)
    check(engine+' guest cannot start',g.locator('#online-start-button').is_hidden())
    check(engine+' read-only host command denied',g.evaluate("DraftOnline.request('start').then(()=>false,error=>/host/i.test(error.message))"))
    # Room chat is a genuine cross-context exchange, not a browser-storage event.
    probe='<img src=x onerror="window.__chatXss=true"> nice pick!'
    send_chat(g,probe)
    h.wait_for_function('(text)=>DraftOnline.state()?.lobby?.messages.some(m=>(m.message||m.text)===text)',arg=probe)
    open_chat(h)
    check(engine+' chat safely rendered as text',probe in h.locator('#online-chat-messages').inner_text() and h.locator('#online-chat-messages img').count()==0 and not h.evaluate('!!window.__chatXss'))
    h.locator('#online-panel-close').click()
    h.evaluate('DraftOnline.open()')
    h.locator('#online-start-button').click()
    wait_phase(h,'bidding'); wait_phase(g,'bidding')
    check(engine+' four team auction has92 players',snapshot(h)['lobby']['auction']['total']==92, snapshot(h)['lobby']['auction'])
    # Polling and incoming chat must not destroy an in-progress bid.
    if not h.locator('#auction-dialog').is_visible(): h.locator('#auction-resume-button').click()
    h.locator('#auction-bid-0').fill('31')
    send_chat(g,'Could use a kicker here.')
    h.wait_for_timeout(1800)
    check(engine+' chat update preserves typed bid',h.locator('#auction-bid-0').input_value()=='31')
    check(engine+' host auction modal fits phone',fit(h,'#auction-dialog'))
    h.screenshot(path=str(OUT/f'{engine}-host-auction.png'))
    g.screenshot(path=str(OUT/f'{engine}-guest-chat.png'))
    for i in range(4): h.locator(f'#auction-bid-{i}').fill('40' if i==3 else '0')
    h.locator('#auction-bid-button').click()
    wait_phase(h,'placement')
    check(engine+' host winner budget saved',snapshot(h)['lobby']['auction']['budgets'][3]==960)
    h.locator('[data-slot="s_k"]').click()
    wait_phase(h,'bidding')
    g.wait_for_function('!!DraftOnline.state()?.lobby?.teams[3]?.picks.s_k')
    selected=snapshot(g)['lobby']['teams'][3]['picks']['s_k']
    check(engine+' guest sees kicker assignment',selected>251)
    # Reload restores membership and server data; local normal drafts remain untouched.
    h.reload(wait_until='networkidle');g.reload(wait_until='networkidle')
    h.wait_for_function('DraftOnline.active()&&DraftOnline.isHost()');g.wait_for_function('DraftOnline.active()&&!DraftOnline.isHost()')
    check(engine+' host/guest resume persisted pick',snapshot(h)['lobby']['teams'][3]['picks']['s_k']==snapshot(g)['lobby']['teams'][3]['picks']['s_k']==selected)
    check(engine+' normal offline save unaffected',h.evaluate("localStorage.getItem('pokemon-draft-league-v1')")==original_offline)
    final=complete_draft(h)
    check(engine+' four complete teams',final['auction']['counts']==[23]*4 and len({id for team in final['teams'] for id in team['picks'].values()})==92)
    h.evaluate("DraftOnline.request('simulate',{teamIndexes:[3,2]})")
    h.wait_for_function('!!DraftOnline.state()?.lobby?.match')
    result=snapshot(h)['lobby']['match'];audit_match(result)
    g.wait_for_function('(id)=>DraftOnline.state()?.lobby?.match?.matchId===id',arg=result['matchId'])
    check(engine+' both devices see same result',snapshot(g)['lobby']['match']['teams'][0]['score']==result['teams'][0]['score'])
    check(engine+' all46stats visible',h.locator('#match-players details.match-player').count()==46)
    # Fame/Shame are host-managed and reflect on a separate device.
    retired=final['teams'][0]['picks']['s_k']
    h.evaluate('(id)=>DraftOnline.hallAction(id,"shame")',retired)
    g.wait_for_function('(id)=>DraftOnline.state()?.league?.hall?.[id]?.kind==="shame"',arg=retired)
    check(engine+' shared Shame career snapshot',snapshot(g)['league']['hall'][str(retired)]['career']['draftCount']==1)
    h.evaluate('(id)=>DraftOnline.hallAction(id,null)',retired)
    g.wait_for_function('(id)=>!DraftOnline.state()?.league?.hall?.[id]',arg=retired)
    # Mobile Hall interface must expose all three collections without horizontal bleed.
    g.evaluate("document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());DraftHall.open()")
    check(engine+' mobile Hall fits',fit(g,'#hall-dialog'))
    g.screenshot(path=str(OUT/f'{engine}-shared-careers.png'))
    g.evaluate("document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close())")
    # Keyboard viewport: chat input stays above the visible keyboard area.
    open_chat(g)
    g.locator('#online-chat-input').focus()
    g.evaluate("""()=>{const original=window.visualViewport;const v=new EventTarget();Object.assign(v,{height:310,offsetTop:8});Object.defineProperty(window,'visualViewport',{value:v,configurable:true});window.dispatchEvent(new Event('resize'));original?.dispatchEvent(new Event('resize'));v.dispatchEvent(new Event('resize'))}""")
    g.wait_for_timeout(80)
    check(engine+' chat keyboard usable',g.locator('#online-chat-input').bounding_box()['y']+g.locator('#online-chat-input').bounding_box()['height']<=326,g.locator('#online-chat-input').bounding_box())
    g.screenshot(path=str(OUT/f'{engine}-chat-keyboard.png'))
    check(engine+' no runtime errors',not ERRORS,ERRORS)
    host_context.close();guest_context.close()

with sync_playwright() as pw:
    for engine, runtime, args in [('chromium',pw.chromium,{'executable_path':'/usr/bin/chromium'}),('webkit',pw.webkit,{'executable_path':'/workspace/scratch/run-webkit.sh'})]:
        browser=runtime.launch(headless=True,**args)
        try:scenario(browser,engine)
        finally:browser.close()
    print(json.dumps({'checks':len(CHECKS),'errors':ERRORS,'passed':CHECKS},indent=2))
    (OUT/'results.json').write_text(json.dumps({'checks':len(CHECKS),'errors':ERRORS,'passed':CHECKS},indent=2))
