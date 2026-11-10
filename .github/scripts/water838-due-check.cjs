const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('water838/index.html','utf8');
const water=JSON.parse(html.split('const FULL_SEED=')[1].split(';const BUNDLE_VERSION=')[0]);
const env=JSON.parse(fs.readFileSync('water838/data/environment.json','utf8')).items;
const version=JSON.parse(fs.readFileSync('water838/data/environment.js','utf8').match(/const ENVIRONMENT_VERSION=("[^"]+")/)[1]);
(async()=>{
 const b=await chromium.launch(process.env.LOCAL_CHROME?{executablePath:process.env.LOCAL_CHROME,args:['--no-sandbox']}:{});
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.install({time:new Date('2026-11-09T15:59:00Z')}); // 23:59 in Shanghai
 const items=structuredClone([...water,...env]);
 const archive=items.find(q=>q.version==='removed');
 const reviewed=[items[0],items[1],archive];
 for(const q of reviewed){q.history=[{at:Date.parse('2026-11-08T01:00:00Z'),grade:1,response:'保留原记录'}];q.star=true;}
 items[0].next=Date.parse('2026-11-09T15:59:50Z'); // Later today is due today.
 items[1].next=Date.parse('2026-11-09T16:30:00Z'); // Tomorrow, not yet due.
 archive.next=Date.parse('2026-11-08T10:00:00Z');
 items[2].next=0; // Unstudied item must not be counted.
 const fixture={items,bundledVersion:'full-pdf-ocr-211-v1',environmentVersion:version};
 await p.addInitScript(s=>{if(!localStorage.getItem('due-fixture')){localStorage.setItem('yanxicang_838_water_v1',JSON.stringify(s));localStorage.setItem('due-fixture','1')}},fixture);
 await p.goto(process.env.PAGE_URL,{waitUntil:'networkidle'});
 assert.equal(await p.locator('#sDue').textContent(),'2');
 await p.locator('nav [data-view=study]').click();await p.locator('#studyFilters').evaluate(d=>d.open=true);
 await p.selectOption('#studySubject','环境学导论');await p.selectOption('#studyCategory','supplement');
 await p.locator('nav [data-view=home]').click();await p.locator('#startDue').click();
 assert.equal(await p.locator('#studySubject').inputValue(),'');assert.equal(await p.locator('#studyCategory').inputValue(),'');
 assert.equal(await p.locator('#studyVersion').inputValue(),'all');assert.equal(await p.locator('#quickJump option').count(),2);
 assert.equal(await p.locator('#qText').textContent(),water[0].question);
 await p.locator('nav [data-view=review]').click();assert.equal(await p.locator('#dueItems button').count(),2);
 await p.clock.fastForward(60000);assert.equal(await p.locator('#sDue').textContent(),'3');
 assert.equal(await p.locator('#dueItems button').count(),3);
 await p.locator('#dueItems button').filter({hasText:archive.question,exact:true}).click();
 assert.equal(await p.locator('#quickJump option').count(),3);
 assert.equal(await p.locator('#qText').textContent(),archive.question);assert(!(await p.locator('#answer').isVisible()));
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('yanxicang_838_water_v1')));
 assert.deepEqual(saved,fixture,'Date refreshes must not rewrite existing schedules/history');
 await p.locator('#revealBtn').click();await p.locator('[data-grade="3"]').click();
 assert.equal(await p.locator('#sDue').textContent(),'2');
 await p.clock.setSystemTime(new Date('2026-11-10T16:01:00Z'));await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
 assert.equal(await p.locator('#dueItems button').count(),2);assert.deepEqual(errors,[]);
 await b.close();console.log('PASS due review: calendar-day boundary, overnight live refresh, global filters reset, archived due item, consistent counts, unchanged history/schedules, regrading');
})().catch(e=>{console.error(e);process.exit(1)});
