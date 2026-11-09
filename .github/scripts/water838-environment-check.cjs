const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const bundle=JSON.parse(fs.readFileSync('water838/data/environment.json','utf8'));
const active=x=>!['removed','replaced','original-only'].includes(x.version);
(async()=>{
 const engines=process.env.LOCAL_CHROME?{chromium}:{chromium,webkit};
 for(const [engine,launch] of Object.entries(engines)){
  const browser=await launch.launch(process.env.LOCAL_CHROME?{executablePath:process.env.LOCAL_CHROME,args:['--no-sandbox']}:{});
  for(const width of [360,768,820,1280]){
   const context=await browser.newContext({viewport:{width,height:1000},hasTouch:true});const p=await context.newPage();
   const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
   await p.goto(process.env.PAGE_URL,{waitUntil:'networkidle'});
   assert.equal(await p.locator('#sTotal').textContent(),String(bundle.statistics.mergedTotal));
   await p.locator('nav [data-view=bank]').click();await p.selectOption('#bankSubject','环境学导论');
   await p.selectOption('#bankCategory','knowledge');await p.selectOption('#bankChapter','第1章 绪论');
   assert.equal(await p.locator('#bankItems .listItem').count(),19);
   assert.equal(await p.locator('#bankItems .title').first().textContent(),'环境的概念');
   assert.equal(await p.locator('.bank-answer[open]').count(),0);
   await p.locator('.bank-answer > summary').first().click();
   assert((await p.locator('.answer-text').first().textContent()).includes('以人类为主体'));
   await p.selectOption('#bankCategory','exercise');
   assert.equal(await p.locator('#bankItems .listItem').count(),6);
   await p.selectOption('#bankChapter','');
   assert.equal(await p.locator('#bankItems .listItem').count(),bundle.items.filter(x=>x.category==='exercise'&&active(x)).length);
   await p.selectOption('#bankVersion','all');
   assert.equal(await p.locator('#bankItems .listItem').count(),bundle.items.filter(x=>x.category==='exercise').length);
   await p.selectOption('#bankCategory','supplement');await p.locator('#search').fill('CCUS');
   assert.equal(await p.locator('#bankItems .listItem').count(),1);
   await p.locator('#bankItems .actions button').filter({hasText:'背诵',exact:true}).click();
   assert.equal(await p.locator('#qText').textContent(),'CCUS');
   assert(!(await p.locator('#answer').isVisible()));await p.locator('#revealBtn').click();
   assert((await p.locator('#answer').textContent()).includes('Carbon Capture'));
   await p.locator('#answer .source-excerpts > summary').click();
   const img=p.locator('#answer img').first();await img.evaluate(i=>i.decode());assert(await img.evaluate(i=>i.naturalWidth>0));
   await p.locator('#studyFilters').evaluate(d=>d.open=true);
   await p.selectOption('#studyCategory','exercise');await p.selectOption('#chapterFilter','第1章 绪论');
   await p.selectOption('#orderMode','random');const before=await p.locator('#qText').textContent();
   await p.locator('#next').click();assert.notEqual(await p.locator('#qText').textContent(),before);
   assert(!(await p.locator('#answer').isVisible()));
   await p.locator('#revealBtn').click();assert((await p.locator('#answer').textContent()).length>20);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);
   await p.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await p.reload();
   assert.equal(await p.locator('#sTotal').textContent(),String(bundle.statistics.mergedTotal));
   assert.deepEqual(errors,[]);await context.close();
   console.log(`PASS environment ${engine} ${width}px: chapter 1, all/chapter exercises, new labels, CCUS source image, random filtered study, hidden answers, subpath assets, offline bundle`);
  }
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
