"""Music gesture start, mute persistence, background pause and responsive controls."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--autoplay-policy=user-gesture-required'])
 page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('''window.audioTest={notes:0};const Native=window.AudioContext;window.AudioContext=class extends Native {constructor(...args){super(...args);audioTest.context=this;}createOscillator(){audioTest.notes++;return super.createOscillator();}}''')
 page.goto('http://127.0.0.1:8115');assert page.evaluate('!audioTest.context')
 for w in [320,393,1440]:
  page.set_viewport_size({'width':w,'height':740 if w<500 else 900})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  box=page.locator('#music-toggle').bounding_box();assert box['x']>=0 and box['x']+box['width']<=w
 page.locator('#new-game-button').click();page.wait_for_function('audioTest.context?.state==="running"&&audioTest.notes>0')
 assert page.locator('#auction-setup-dialog .music-toggle').is_visible()
 page.locator('#auction-setup-dialog .music-toggle').click();assert page.locator('#music-toggle').get_attribute('aria-pressed')=='false'
 page.wait_for_timeout(350);n=page.evaluate('audioTest.notes');page.wait_for_timeout(400);assert page.evaluate('audioTest.notes')==n
 page.reload();assert page.locator('#music-toggle').get_attribute('aria-pressed')=='false'
 page.locator('#music-toggle').click();page.wait_for_function('audioTest.context?.state==="running"&&audioTest.notes>0')
 assert page.locator('#music-toggle').get_attribute('aria-pressed')=='true'
 page.evaluate('Object.defineProperty(document,"hidden",{value:true,configurable:true});document.dispatchEvent(new Event("visibilitychange"))');page.wait_for_function('audioTest.context.state==="suspended"')
 page.evaluate('Object.defineProperty(document,"hidden",{value:false,configurable:true});document.dispatchEvent(new Event("visibilitychange"))');page.wait_for_function('audioTest.context.state==="running"')
 page.evaluate('DraftAnalysis.open(POKEMON[0])');assert page.locator('#pokemon-analysis-dialog .music-toggle').is_visible()
 page.locator('#pokemon-analysis-dialog .music-toggle').click();assert page.locator('#music-toggle').get_attribute('aria-pressed')=='false'
 assert not errors,errors
 print('PASS: no pre-gesture audio; play/mute/resume; mute survives reload; profile/setup mute; phone/PC width fit; no runtime errors')
 b.close()
