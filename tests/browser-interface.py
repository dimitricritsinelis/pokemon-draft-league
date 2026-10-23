"""Compact game-shell UI regression on desktop Chromium and mobile WebKit.
Uses real UI and browser-local saves; does not create online lobbies or shared records.
Run with DRAFT_QA_URL for a local or deployed game, DRAFT_QA_OUTPUT for artifacts,
and optional DRAFT_CHROMIUM_PATH / DRAFT_WEBKIT_PATH for custom executables.
Without executable overrides, Playwright uses its installed browsers.
"""
from pathlib import Path
import os,json,tempfile
from playwright.sync_api import sync_playwright
BASE=os.environ.get('DRAFT_QA_URL','http://127.0.0.1:3000').rstrip('/')
OUT=Path(os.environ.get('DRAFT_QA_OUTPUT',str(Path(tempfile.gettempdir())/'pokemon-draft-interface-qa')));OUT.mkdir(parents=True,exist_ok=True);OUT.chmod(0o700)
checks=[];errors=[]
def check(label,value,detail=None):
 if not value:raise AssertionError(label+': '+str(detail))
 checks.append(label)
def menu(p):
 if not p.locator('#draft-menu').is_visible():p.locator('#menu-toggle').click()
def close_menu(p):
 if p.locator('#draft-menu').is_visible():p.locator('#settings-close').click()
def select_team(p,i):
 if p.locator('#team-switcher').is_visible():p.locator('#team-switcher').select_option(str(i))
 else:p.locator(f'#team-tab-{i}').click()
def filled(p):return p.locator('.position:not(.empty)').count()
def names(p):return p.locator('.position .pokemon-name').all_text_contents()
def fit(p,sel):return p.locator(sel).evaluate('e=>e.scrollWidth<=e.clientWidth+1')
def fieldy(p):return p.locator('#field').bounding_box()['y']
def box_in(p,sel):
 r=p.locator(sel).bounding_box();v=p.viewport_size
 return r['x']>=-1 and r['x']+r['width']<=v['width']+1 and r['y']>=-1 and r['y']+r['height']<=v['height']+1
def keyboard_probes(browser,engine):
 for mode in ['settings','local','online']:
  ctx=browser.new_context(viewport={'width':393,'height':852},has_touch=True);p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.goto(BASE+'/',wait_until='networkidle')
  if mode=='settings':p.locator('#menu-toggle').click();panel='#draft-menu';target='#team-name'
  else:
   p.locator('#new-game-button').click();p.locator('#auction-team-count').select_option('4')
   if mode=='online':p.locator('#online-lobby-button').click();panel='#online-dialog';target='#online-name-0'
   else:panel='#auction-setup-dialog';target='#auction-name-3'
  p.locator(target).fill('Keyboard Probe')
  p.evaluate("""()=>{const old=visualViewport;const v=new EventTarget();Object.assign(v,{height:310,offsetTop:8});Object.defineProperty(window,'visualViewport',{value:v,configurable:true});window.dispatchEvent(new Event('resize'));old?.dispatchEvent(new Event('resize'));v.dispatchEvent(new Event('resize'))}""")
  p.wait_for_timeout(180)
  r=p.locator(target).bounding_box();box=p.locator(panel).bounding_box();label=engine+' '+mode+' keyboard'
  check(label+' panel responds to visualViewport',p.locator(panel).evaluate("e=>e.classList.contains('keyboard-open')"))
  check(label+' panel above keyboard',box['y']>=8 and box['y']+box['height']<=326)
  check(label+' focused input remains visible',r['y']>=box['y'] and r['y']+r['height']<=min(326,box['y']+box['height']))
  p.screenshot(path=str(OUT/(engine+'-'+mode+'-keyboard.png')));ctx.close()

try:
 with sync_playwright() as pw:
  for eng in ['chromium','webkit']:
   executable=os.environ.get('DRAFT_CHROMIUM_PATH' if eng=='chromium' else 'DRAFT_WEBKIT_PATH');args={'executable_path':executable} if executable else {}
   proxy={'server':os.environ['HTTPS_PROXY'],'bypass':'localhost,127.0.0.1'} if BASE.startswith('https:') and os.environ.get('HTTPS_PROXY') else None
   b=getattr(pw,eng).launch(headless=True,proxy=proxy,**args)
   for w,h in [(320,568),(393,852),(560,740),(768,740),(1024,768),(1440,900)]:
    label=f'{eng}-{w}';ctx=b.new_context(viewport={'width':w,'height':h},has_touch=w<=560);p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
    p.goto(BASE+'/',wait_until='networkidle');p.set_default_timeout(15000)
    check(label+' board no horizontal overflow',p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    check(label+' More room removed',p.locator('#room-button').count()==0)
    check(label+' formations always visible',p.locator('#offense').is_visible() and p.locator('#defense').is_visible() and p.locator('#draft-menu #offense').count()==0)
    check(label+' share initially hidden',p.locator('#board-share-actions').is_hidden())
    check(label+' phone team selector or desktop tabs',p.locator('#team-switcher' if w<=560 else '#team-tabs').is_visible())
    before=fieldy(p);menu(p)
    check(label+' settings float over field',abs(before-fieldy(p))<1)
    check(label+' settings inside viewport',box_in(p,'#draft-menu'))
    check(label+' settings no internal horizontal overflow',fit(p,'#draft-menu'))
    check(label+' no share actions duplicated in settings',p.locator('#draft-menu #share-link,#draft-menu #export-button').count()==0)
    p.screenshot(path=str(OUT/(label+'-settings.png')))
    p.keyboard.press('Escape');check(label+' Escape closes settings',p.locator('#draft-menu').is_hidden())
    check(label+' Escape restores focus',p.evaluate("document.activeElement.id==='menu-toggle'"))
    menu(p);p.locator('#menu-backdrop').click(position={'x':2,'y':2});check(label+' outside closes settings',p.locator('#draft-menu').is_hidden())
    p.locator('#board-share-toggle').click();check(label+' share actions fit',box_in(p,'#board-share-actions') and fit(p,'#board-share-actions'))
    check(label+' share actions reachable',p.locator('#share-link').is_visible() and p.locator('#export-button').is_visible())
    p.keyboard.press('Escape');check(label+' Escape closes sharing',p.locator('#board-share-actions').is_hidden())
    check(label+' share focus returns',p.evaluate("document.activeElement.id==='board-share-toggle'"))
    # Clear only this team, with a real cancellation before confirming.
    select_team(p,1);menu(p);p.locator('#sample-button').click();check(label+' other team populated',filled(p)==23)
    select_team(p,0);old=names(p);p.locator('#clear-button').click();check(label+' clear asks first',p.locator('#clear-dialog').is_visible() and names(p)==old)
    p.locator('#clear-dialog button[value="cancel"]').click();check(label+' cancel preserves picks',names(p)==old)
    p.locator('#clear-button').click();p.locator('#clear-dialog button[value="clear"]').click();p.wait_for_function("document.querySelectorAll('.position.empty').length===23");check(label+' clear empties only current team',filled(p)==0)
    select_team(p,1);check(label+' other team retained after clear',filled(p)==23);select_team(p,0)
    menu(p);p.locator('#sample-button').click()
    p.locator('#offense').click();p.locator('#offense-options [data-value="12"]').click();check(label+' offense works on toolbar',p.locator('#offense-current').inner_text()=='12 personnel')
    p.locator('#defense').click();p.locator('#defense-options [data-value="dime"]').click();check(label+' defense works on toolbar','Dime' in p.locator('#defense-current').inner_text())
    old=names(p)
    p.locator('#new-game-button').click();check(label+' local setup visible',p.locator('#auction-setup-dialog').is_visible())
    check(label+' local setup fits',box_in(p,'#auction-setup-dialog') and fit(p,'#auction-setup-dialog'))
    p.locator('#auction-team-count').select_option('4');p.locator('#auction-pool').select_option('gen2')
    for i in range(4):p.locator(f'#auction-name-{i}').fill(f'Test Squad {i+1}')
    p.locator('#online-lobby-button').click();check(label+' online setup visible local hidden',p.locator('#online-dialog').is_visible() and p.locator('#auction-setup-dialog').is_hidden())
    check(label+' online setup fits',box_in(p,'#online-dialog') and fit(p,'#online-dialog'))
    check(label+' local options copied online',p.locator('#online-team-count').input_value()=='4' and p.locator('#online-pool').input_value()=='gen2' and p.locator('#online-name-3').input_value()=='Test Squad 4')
    p.locator('#online-name-0').fill('Changed Online');p.locator('#online-local-mode').click()
    check(label+' online options copied back local',p.locator('#auction-name-0').input_value()=='Changed Online' and p.locator('#auction-team-count').input_value()=='4')
    p.screenshot(path=str(OUT/(label+'-new-game.png')))
    p.locator('[data-close="auction-setup-dialog"]').click();check(label+' cancel setup preserves practice',names(p)==old)
    if w in [393,1440]:
     p.locator('#board-share-toggle').click();p.locator('#export-button').click();p.wait_for_selector('#export-preview:not([hidden])',timeout=45000)
     check(label+' exported PNG generated',p.locator('#export-preview').evaluate('e=>e.complete&&e.naturalWidth>1000'))
     p.locator('[data-close="export-dialog"]').click()
    if w==393:
     p.set_viewport_size({'width':w,'height':360});menu(p)
     check(label+' settings fit short keyboard viewport',box_in(p,'#draft-menu') and fit(p,'#draft-menu'))
     p.locator('#team-name').fill('Keyboard Team');p.locator('#save-team-name').click();close_menu(p)
     check(label+' keyboard rename accepted', 'Keyboard Team' in p.locator('#team-switcher option:checked').inner_text())
    check(label+' no JavaScript errors',not errors,errors)
    ctx.close()
   keyboard_probes(b,eng)
   b.close()
 value={'status':'PASS','url':BASE,'checks':len(checks),'passed':checks,'errors':errors};(OUT/'report.json').write_text(json.dumps(value,indent=2));print(json.dumps({'status':'PASS','checks':len(checks),'errors':errors}))
except Exception as e:
 value={'status':'FAIL','url':BASE,'checks':len(checks),'passed':checks,'errors':errors,'failure':str(e)};(OUT/'report.json').write_text(json.dumps(value,indent=2));print(json.dumps(value,indent=2));raise
