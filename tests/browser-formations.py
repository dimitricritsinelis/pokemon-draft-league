"""Geometry regression across all twenty personnel combinations, desktop and mobile Safari."""
from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('DRAFT_QA_URL','http://127.0.0.1:3000/');OUT=Path('/workspace/scratch/online-qa');OUT.mkdir(exist_ok=True)
CHECKS=[];ERRORS=[]

def check(name,condition,details=None):
 if not condition:raise AssertionError(f'{name}: {details}')
 CHECKS.append(name)

with sync_playwright() as pw:
 for engine,runtime,args in [('chromium',pw.chromium,{'executable_path':'/usr/bin/chromium'}),('webkit',pw.webkit,{'executable_path':'/workspace/scratch/run-webkit.sh'})]:
  b=runtime.launch(headless=True,**args)
  for w,h in [(320,568),(393,730),(844,390),(1440,900)]:
   c=b.new_context(viewport={'width':w,'height':h});p=c.new_page();p.on('pageerror',lambda e:ERRORS.append(str(e)))
   p.add_init_script("window.__tools={};Object.defineProperty(document,'modelContext',{value:{registerTool(tool){__tools[tool.name]=tool}},configurable:true})")
   p.goto(BASE,wait_until='networkidle')
   for offense in ['10','11','12','21','22']:
    for defense in ['3-4','4-3','nickel','dime']:
     label=f'{engine} {w} {offense}/{defense}'
     board=p.evaluate('(args)=>__tools.configure_draft_personnel.execute(args)',{'offense':offense,'defense':defense})
     positions=p.locator('.position').evaluate_all('''els=>els.map(e=>{const r=e.getBoundingClientRect();return{key:e.dataset.slot,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}})''')
     field=p.locator('#field').bounding_box()
     overlap=[]
     for i,a in enumerate(positions):
      for d in positions[i+1:]:
       dx=min(a['right'],d['right'])-max(a['x'],d['x']);dy=min(a['bottom'],d['bottom'])-max(a['y'],d['y'])
       if dx>1 and dy>1:overlap.append((a['key'],d['key'],round(dx,1),round(dy,1)))
     check(label+' exactly23positions',len(positions)==23)
     check(label+' no player overlap',not overlap,overlap)
     check(label+' everytilewithinfield',all(a['x']>=field['x']-1 and a['right']<=field['x']+field['width']+1 and a['y']>=field['y']-1 and a['bottom']<=field['y']+field['height']+1 for a in positions),[a for a in positions if a['bottom']>field['y']+field['height']+1])
     check(label+' page no horizontal bleed',p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
     inside_pitch=p.locator('.position').evaluate_all('''els=>{const f=document.getElementById('field').getBoundingClientRect();return els.every(e=>{const r=e.getBoundingClientRect();const ys=[(r.top-f.top)/f.height*100,(r.bottom-f.top)/f.height*100];const left=Math.max(...ys.map(y=>DraftField.project(3,y).x/100*f.width+f.left));const right=Math.min(...ys.map(y=>DraftField.project(97,y).x/100*f.width+f.left));return r.left>=left-1&&r.right<=right+1})}''')
     check(label+' every player inside painted sidelines',inside_pitch)

     # Physically select each position on iPhone-sized portrait in every formation.
     if w==393:
      for slot in positions:
       p.locator('[data-slot="'+slot['key']+'"]').click()
       check(label+' selectable '+slot['key'],p.locator('[data-slot="'+slot['key']+'"]').get_attribute('aria-pressed')=='true')
       p.locator('#close-picker').click()
      if offense=='12' and defense=='dime':p.screenshot(path=str(OUT/f'{engine}-allformation-{w}.png'))
   c.close()
  b.close()
 check('No JS runtime errors',not ERRORS,ERRORS)
 print(json.dumps({'checks':len(CHECKS),'errors':ERRORS}))
 (OUT/'formations.json').write_text(json.dumps({'checks':len(CHECKS),'errors':ERRORS}))
