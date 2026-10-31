"""Filled-card formation geometry regression using native draft/configuration tools.
Online wide-panel classes are a layout fixture; no live multiplayer behavior is mocked.
"""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(os.environ.get('DRAFT_QA_OUTPUT','/workspace/scratch/offense-qa'));OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('DRAFT_QA_URL','http://127.0.0.1:8115')
failures=[];cases=0; taps=0
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':393,'height':740})
 page.add_init_script("window.__tools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){__tools[t.name]=t}},configurable:true});Object.defineProperty(document,'fullscreenEnabled',{value:false,configurable:true})")
 page.goto(BASE);page.wait_for_function('!!__tools.read_draft_board')
 page.locator('#clear-button').click();page.locator('#clear-dialog button[value="clear"]').click()
 for width,height in [(320,568),(393,740),(844,390),(1024,768),(1440,900)]:
  page.set_viewport_size({'width':width,'height':height})
  for focused in [False,True]:
   page.evaluate('(v)=>v?DraftFocus.enter():DraftFocus.exit()',focused)
   for offense in ['10','11','12','21','22']:
    for defense in ['3-4','4-3','nickel','dime']:
     page.evaluate('''([offense,defense])=>{document.body.classList.remove('players-online','online-active','auction-active');const a=document.getElementById('auction-dialog');if(a.open)a.close();__tools.configure_draft_personnel.execute({offense,defense});const b=__tools.read_draft_board.execute({});b.positions.forEach((s,i)=>__tools.draft_pokemon_to_position.execute({position:s.key,pokemonId:i+1}));document.body.classList.add('players-online','online-active','auction-active');if(innerWidth>1000){document.querySelector('main.game').append(a);a.show();}}''',[offense,defense])
     page.wait_for_timeout(35)
     result=page.evaluate('''()=>{const f=document.getElementById('field').getBoundingClientRect();const project=(x,y)=>50+(x-50)*(.8+.18*y/100);const r=[...document.querySelectorAll('.position')].map(e=>{const b=e.getBoundingClientRect();return {key:e.dataset.slot,role:e.querySelector('.position-role').textContent,x:b.x-f.x,y:b.y-f.y,w:b.width,h:b.height,empty:e.classList.contains('empty'),line:e.classList.contains('offensive-line'),cy:parseFloat(e.style.getPropertyValue('--y'))}});const bad=[];for(const a of r){const ys=[a.y/f.height*100,(a.y+a.h)/f.height*100];const l=Math.max(...ys.map(y=>project(3,y)))*f.width/100;const right=Math.min(...ys.map(y=>project(97,y)))*f.width/100;if(a.x<l-1||a.x+a.w>right+1||a.y<0||a.y+a.h>f.height+1)bad.push({kind:'bounds',a,l,right});if(a.empty)bad.push({kind:'empty',key:a.key});}for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++){const a=r[i],b=r[j],dx=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),dy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);if(dx>1&&dy>1)bad.push({kind:'overlap',a:a.key,b:b.key,dx,dy});}const ol=r.filter(a=>a.line).sort((a,b)=>a.x-b.x);if(ol.length!==5)bad.push({kind:'ol-count'});for(let i=1;i<ol.length;i++)if(ol[i].x-ol[i-1].x>ol[i].w*1.5)bad.push({kind:'loose-ol',gap:ol[i].x-ol[i-1].x,w:ol[i].w});const dl=r.filter(a=>a.key.startsWith('d_')&&['DE','DT','NT'].includes(a.role)).sort((a,b)=>a.x-b.x);const olGap=(ol.at(-1).x-ol[0].x)/4,dlGap=(dl.at(-1).x-dl[0].x)/(dl.length-1);if(dlGap<=olGap||dlGap>f.width*.17)bad.push({kind:'dl-spacing',dlGap,olGap});if(r.filter(a=>a.key.startsWith('o_')&&(a.cy===59||(a.role==='TE'&&a.cy===62))).length!==7)bad.push({kind:'front-count'});if(document.documentElement.scrollWidth>innerWidth+1)bad.push({kind:'horizontal-overflow'});return {bad,field:{width:f.width,height:f.height},count:r.length}}''')
     cases+=1
     if result['bad']:failures.append({'width':width,'focus':focused,'offense':offense,'defense':defense,**result})
     if width in [393,1440] and defense=='3-4' and not focused:
      page.locator('#field').screenshot(path=str(OUT/f'field-{width}-{offense}.png'))
     if width in [393,1440] and offense=='11' and not focused:
      page.locator('#field').screenshot(path=str(OUT/f'defense-{width}-{defense}.png'))
   # Physically tap each eligible receiver, with the native local picker behavior.
  page.evaluate("document.body.classList.remove('players-online','online-active','auction-active');const a=document.getElementById('auction-dialog');if(a.open)a.close();DraftFocus.exit()")
  for offense in ['10','11','12','21','22']:
   page.evaluate('(o)=>__tools.configure_draft_personnel.execute({offense:o,defense:"3-4"})',offense)
   slots=page.locator('.position').evaluate_all("es=>es.filter(e=>['WR','TE'].includes(e.querySelector('.position-role').textContent)).map(e=>e.dataset.slot)")
   for key in slots:
    el=page.locator(f'.position[data-slot="{key}"]');el.click();taps+=1
    if el.get_attribute('aria-pressed')!='true':failures.append({'kind':'tap','width':width,'offense':offense,'slot':key})
    if page.locator('#close-picker').is_visible():page.locator('#close-picker').click()
 browser.close()
report={'cases':cases,'receiver_taps':taps,'failures':failures};(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
if failures:raise SystemExit(1)
