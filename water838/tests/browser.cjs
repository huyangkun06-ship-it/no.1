const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const [name,viewport] of [['android',{width:412,height:915}],['huawei-tablet',{width:1280,height:800}],['ipad-layout',{width:820,height:1180}]]) {
  const context=await browser.newContext({viewport,acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/water838/');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready});await page.reload();
  const key='yanxicang_838_water_v1';
  const seeded=await page.evaluate(key=>{const s=JSON.parse(localStorage.getItem(key));return s},key);
  // Current initial seed may not be persisted until first operation. Set legacy fixture using real immutable bank.
  await page.click('#continueStudy');await page.click('#revealBtn');await page.click('[data-grade="3"]');
  const legacy=await page.evaluate(key=>{const s=JSON.parse(localStorage.getItem(key));delete s.scheduleVersion;delete s.reviewSettings;for(const x of s.items)delete x.schedule;for(let i=0;i<180;i++){s.items[i].history=[{at:Date.now()-86400000*3,grade:1,response:'legacy'}];s.items[i].next=Date.now()-86400000;s.items[i].interval=2;}localStorage.setItem(key,JSON.stringify(s));localStorage.removeItem(key+'.before-smart-review');return localStorage.getItem(key)},key);
  await page.reload();assert.equal(await page.evaluate(key=>localStorage.getItem(key+'.before-smart-review'),key),legacy);
  await page.click('#startDue');assert.equal(await page.locator('#quickJump option').count(),72);
  await page.click('#hintBtn');assert.equal(await page.locator('#hint').isVisible(),true);
  await context.setOffline(true);await page.reload();await page.click('#startDue');await page.click('#revealBtn');await page.click('[data-grade="2"]');
  const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.equal(after.items.filter(x=>x.history.some(h=>h.kind==='review')).length,1);
  await page.click('#stopReview');await page.click('#startDue');assert.equal(await page.locator('#quickJump option').count(), await page.evaluate(()=>ReviewScheduler.plan(JSON.parse(localStorage.getItem('yanxicang_838_water_v1'))).selected.length));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Download full backup and restore into this workspace through the actual import UI.
  await page.evaluate(()=>document.querySelector('[data-view="data"]').click());
  const beforeExport=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const downloadPromise=page.waitForEvent('download');await page.click('#exportJson');const download=await downloadPromise;const path=await download.path();
  page.on('dialog',d=>d.accept());await page.setInputFiles('#importFile',path);await page.waitForTimeout(300);
  const restored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.deepEqual(restored.items,beforeExport.items);assert.deepEqual(restored.reviewSettings,beforeExport.reviewSettings);
  assert.deepEqual(errors,[]);console.log(name+': offline study/grade/save, 72-item queue, legacy snapshot, JSON export/import, responsive layout PASS');
  await context.close();
 }
 await browser.close();
 try {const b=await webkit.launch({headless:true});await b.close();console.log('WebKit available');}catch(e){console.log('WebKit unavailable: '+e.message.split('\n')[0]);}
})().catch(e=>{console.error(e);process.exit(1)});
