const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('water838/index.html','utf8');const seed=JSON.parse(html.split('const FULL_SEED=')[1].split(';const BUNDLE_VERSION=')[0]);
(async()=>{const b=await chromium.launch(process.env.LOCAL_CHROME?{executablePath:process.env.LOCAL_CHROME,args:['--no-sandbox']}:{});
for(const width of [360,820]){
 const context=await b.newContext({viewport:{width,height:1000},hasTouch:true}),p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.PAGE_URL,{waitUntil:'networkidle'});
 const state=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('yanxicang_838_water_v1')));
 assert.deepEqual((await state()).items.slice(0,211),seed);
 await p.locator('nav [data-view=study]').click();assert(!(await p.locator('#answer').isVisible()));
 await p.locator('#revealBtn').click();await p.locator('#answer .source-excerpts > summary').click();
 const img=p.locator('#answer img').first();await img.evaluate(i=>i.decode());assert(await img.evaluate(i=>i.naturalWidth>500));
 assert.match(await p.locator('#answer figcaption').first().textContent(),/PDF第14页.*书内第13页/);
 for(const id of [seed[4].id,seed.at(-1).id]){
  await p.selectOption('#quickJump',id);assert(!(await p.locator('#answer').isVisible()));
  await p.locator('#revealBtn').click();assert((await p.locator('#answer img').count())>=2);
  await p.locator('#answer .source-excerpts > summary').click();await p.locator('#answer img').first().evaluate(i=>i.decode());
 }
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);
 await p.evaluate(()=>navigator.serviceWorker.ready);
 await p.waitForFunction(async()=>{
  const src=document.querySelector('#answer img').src;for(const key of await caches.keys())if(await(await caches.open(key)).match(src))return true;return false;
 });
 await context.setOffline(true);await p.reload({waitUntil:'load'});await p.locator('nav [data-view=study]').click();await p.locator('#revealBtn').click();await p.locator('#answer .source-excerpts > summary').click();await p.locator('#answer img').first().evaluate(i=>i.decode());
 assert.deepEqual((await state()).items.slice(0,211),seed);assert.deepEqual(errors,[]);await context.close();console.log(`PASS water images ${width}px: hidden answer, correct source page, cross-page formula/diagram, offline viewed images, original records intact`);
}await b.close()})().catch(e=>{console.error(e);process.exit(1)});
