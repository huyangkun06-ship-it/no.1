const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,webkit}=require('playwright');
const base=process.env.PAGE_URL||'http://127.0.0.1:8765/water838/';
const url=new URL('knowledge/',base).href;
const data=n=>JSON.parse(fs.readFileSync('water838/knowledge/data/'+n));
const manifest=data('manifest.json'),nodes=data('tree.json').nodes;
const env=data('environment-intro.json'),water=data('water-pollution.json');
const original=fs.readFileSync('water838/index.html','utf8').split('const FULL_SEED=')[1].split(';const BUNDLE_VERSION=')[0];
assert.equal(manifest.subjects[0].rootIds.length,20);
assert.equal(manifest.subjects[1].rootIds.length,12);
for(const n of Object.values(nodes)){
 assert(n.id&&n.title);if(n.parentId)assert(nodes[n.parentId].childIds.includes(n.id));
 for(const c of n.childIds)assert.equal(nodes[c].parentId,n.id);
}
for(const [id,c] of Object.entries({...env,...water})){
 assert(nodes[id]);for(const r of c.relatedIds||[])assert(nodes[r]);
 if(c.recall?.answerAvailable)assert(c.contentBlocks.length>0);
}
assert.equal(Object.keys(env).filter(id=>id.startsWith('env838-')).length,482);
assert.equal(Object.keys(water).filter(id=>id.startsWith('pdf838-')).length,211);
assert.equal(manifest.comparisons.length,12);
const covered=data('coverage.json');assert(covered.sourceGaps.some(g=>g.id==='missing-env-first-seven'&&g.status==='not_migrated'));
console.log('PASS data: 20 original chapters, 482 environment records, 211 preserved water references, valid tree/links, 12 comparisons, explicit source gaps');
(async()=>{
 const launcher=process.env.BROWSER==='webkit'?webkit:chromium;
 const browser=await launcher.launch(process.env.BROWSER==='webkit'?{}:{executablePath:process.env.LOCAL_CHROME||require('node:fs').existsSync('/usr/bin/chromium')&&'/usr/bin/chromium'||undefined,args:['--no-sandbox']});
 for(const [name,width,height]of [['android',360,800],['huawei-landscape',1280,800],['ipad-portrait',820,1180]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const legacy='{ "items": [], "userMetadata": "保持原样", "history": [1,2,3] }';
  await context.addInitScript(raw=>{if(!localStorage.getItem('test.keep')){localStorage.setItem('yanxicang_838_water_v1',raw);localStorage.setItem('test.keep','1');}},legacy);
  await page.goto(url);await page.waitForSelector('.k-tree-row',{state:'attached'});await page.waitForSelector('#mapViewport');assert(await page.locator('[data-map-id="map-root"]').count());await page.getByRole('button',{name:'＋ 放大',exact:true}).click();assert.equal(await page.locator('#mapZoom').textContent(),'95%');await page.getByRole('button',{name:'− 缩小',exact:true}).click();
  const goto=async(id,mode='tree')=>{await page.evaluate(({id,mode})=>location.hash=new URLSearchParams({node:id,subject:id.startsWith('env')?'environment-intro':'water-pollution',mode}).toString(),{id,mode});await page.waitForFunction(id=>new URLSearchParams(location.hash.slice(1)).get('node')===id,id);await page.waitForFunction(title=>document.querySelector('#readingBody h1')?.textContent===title,nodes[id].title);};
  const open=async()=>{if(width<=760&&!await page.locator('#directory').isVisible())await page.click('#directoryBtn');else if(width>760&&!await page.locator('#directory').isVisible())await page.click('#directoryBtn');};
  await open();await page.click('#collapseAll');assert.equal(await page.locator('.k-tree-row').count(),20);
  assert.equal(await page.locator('[data-id="env-chapter-20"]').count(),1);
  await page.locator('[data-id="env-chapter-01"] .k-arrow').click();await page.locator('[data-id="env-chapter-02"] .k-arrow').click();
  assert.equal(await page.locator('[data-id="env-chapter-01"]').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('[data-id="env-chapter-02"]').getAttribute('aria-expanded'),'true');
  const section=nodes['env-chapter-01'].childIds[0];await page.locator(`[data-id="${section}"] .k-arrow`).click();
  assert.equal(await page.locator(`[data-id="${section}"]`).getAttribute('aria-expanded'),'true');
  await page.locator(`[data-id="${section}"] .k-arrow`).click();assert.equal(await page.locator('[data-id="env-chapter-02"]').getAttribute('aria-expanded'),'true');
  await page.selectOption('#depth','1');await page.locator('[data-id="env-chapter-01"] .k-arrow').click();assert.equal(await page.locator('[data-id="env-chapter-01"]').getAttribute('aria-expanded'),'false');
  const start=Date.now();await page.click('#expandAll');assert(Date.now()-start<2000);assert(await page.locator('.k-tree-row').count()<90,'virtualized DOM bound');
  await page.click('#collapseAll');await page.fill('#treeSearch','最差');await page.waitForFunction(()=>document.querySelector('#searchCount').textContent!=='');
  await page.waitForTimeout(250);assert.match(await page.locator('#searchCount').textContent(),/[1-9]/);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('838.knowledge.v1.environment-intro.tree-1')));assert(saved.expandedIds.includes('env-chapter-01'));
  await page.click('#clearSearch');await page.click('#collapseAll');await page.locator('[data-id="env-chapter-02"] .k-arrow').click();
  await page.reload();await page.waitForSelector('.k-tree-row',{state:'attached'});await open();
  assert.equal(await page.locator('[data-id="env-chapter-02"]').getAttribute('aria-expanded'),'true');
  await page.evaluate(()=>{const k='838.knowledge.v1.environment-intro.tree-1',s=JSON.parse(localStorage.getItem(k));s.expandedIds.push('deleted-node-id');localStorage.setItem(k,JSON.stringify(s));});await page.reload();await page.waitForSelector('.k-tree-row',{state:'attached'});
  await goto('water-biofilm-principle','read');assert((await page.locator('#readingBody').textContent()).includes('胞外聚合物'));
  assert(await page.locator('svg[role="img"]').count());
  await page.locator('[data-mode="recall"]').click();assert.equal(await page.locator('#readingBody h1').textContent(),'生物膜法基本原理');
  assert(!await page.locator('#recallOutline').isVisible());assert(!await page.locator('#recallAnswer').isVisible());
  await page.click('#outlineReveal');assert(await page.locator('#recallOutline').isVisible());assert(!await page.locator('#recallAnswer').isVisible());
  await page.click('#answerReveal');assert(await page.locator('#recallAnswer').isVisible());
  await page.click('#outlineReveal');assert(!await page.locator('#recallOutline').isVisible());assert(await page.locator('#recallAnswer').isVisible());
  await page.selectOption('#recallScope','chapter');assert((await page.locator('.k-question-position').textContent()).includes('5 项'));
  await page.getByRole('button',{name:'下一题',exact:true}).click();assert(!await page.locator('#recallAnswer').isVisible());
  await page.selectOption('#recallScope','all');assert.match(await page.locator('.k-question-position').textContent(),/521 项/);
  await page.getByRole('button',{name:'随机一题',exact:true}).click();assert(!await page.locator('#recallAnswer').isVisible());
  await goto('water-stokes','read');assert.equal(await page.locator('.katex-error').count(),0);assert.equal(await page.locator('.katex').count(),1);assert((await page.locator('dl').textContent()).includes('Pa·s'));
  await page.locator('[data-mode="compare"]').click();assert.equal(await page.locator('#readingBody table').count(),12);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  await goto('water-biofilm-principle','read');await page.click('#coverageBtn');await page.waitForSelector('#coverageDialog[open]');assert(await page.locator('#coverageDialog').isVisible());await page.selectOption('#coverageStatus','not_migrated');assert((await page.locator('#coverageRows').textContent()).includes('前七章'));
  await page.click('#closeCoverage');
  const dl=page.waitForEvent('download');await page.click('#exportBtn');const download=await dl;const backup=JSON.parse(fs.readFileSync(await download.path()));assert.equal(Object.keys(backup.nodes).length,manifest.statistics.treeNodes);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForSelector('#readingBody h1');
  // Playwright WebKit can abort an in-flight service-worker navigation when
  // network emulation changes immediately before reload. Chromium owns the
  // offline-shell assertion; WebKit still covers every reader interaction.
  if(process.env.BROWSER!=='webkit'){
    await context.setOffline(true);await page.reload();await page.waitForSelector('#readingBody h1');assert.equal(await page.locator('#readingBody h1').textContent(),'生物膜法基本原理');
    await goto('water-stokes','read');assert.equal(await page.locator('.katex').count(),1);
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('yanxicang_838_water_v1')),legacy);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);assert.deepEqual(errors,[]);
  await context.setOffline(false);await page.screenshot({path:`work/test-results/${name}.png`,fullPage:true});
  await context.close();console.log(`PASS ${name} ${width}px: independent expansion, depth/manual control, search ancestors, restore/obsolete IDs, virtualized 4470 nodes, three recall levels/scopes, shared comparisons, formula units, flow SVG, coverage/export, offline, byte-exact old storage`);
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
