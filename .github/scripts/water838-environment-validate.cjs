// Deterministic integrity checks. No PDF, network, or browser needed.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict'), vm=require('node:vm');
const site=path.resolve(__dirname,'../../water838');
const bundle=JSON.parse(fs.readFileSync(path.join(site,'data/environment.json'),'utf8'));
const {items,statistics:s}=bundle;
assert.equal(items.length,s.environmentTotal);
assert.equal(s.mergedTotal,211+items.length);
assert.equal(s.firstPdfKnowledge+s.firstPdfExercises+s.secondPdfKnowledge+s.secondPdfExercises-s.deduplicated,items.length);
assert.equal(new Set(items.map(x=>x.id)).size,items.length,'Stable IDs must be unique');
assert.deepEqual(bundle.sources.map(x=>x.pageCount),[312,32]);
assert.equal(s.firstPdfKnowledge,312); assert.equal(s.firstPdfExercises,114);
assert.equal(s.secondPdfKnowledge,36); assert.equal(s.secondPdfExercises,32);
assert.equal(bundle.chapterMapping.length,20);
assert.equal(bundle.chapterMapping[15].newChapter,15);
assert.equal(bundle.chapterMapping[16].newChapter,16);
assert.equal(bundle.chapterMapping[17].newChapter,16);
assert.equal(bundle.chapterMapping[18].newChapter,17);
assert.equal(bundle.chapterMapping[19].newChapter,18);
const active=x=>!['removed','replaced','original-only'].includes(x.version);
const groups=new Set();
for(const q of items){
 assert(q.question===q.title && q.answer.trim());
 assert(['knowledge','exercise','supplement'].includes(q.category));
 assert(q.page>=1 && q.sourceRange.endPage>=q.page);
 assert(q.subject==='环境学导论');
 assert(Array.isArray(q.pastExamYears));
 assert(q.importance===null || q.importance>=0 && q.importance<=5);
 assert(q.excerpts.length>0,'Missing source excerpt '+q.title);
 for(const e of q.excerpts) assert(fs.existsSync(path.resolve(site,e.src)),'Missing image '+e.src);
 if(q.category==='exercise') {
  assert.equal(q.answerKind,'compiled');
  assert(q.answer.length>10);
  assert(!q.answer.includes('原资料仅列出题目，未提供参考答案'));
  if(q.answerRevision) {
    assert(q.answer.length>100);
    assert(q.answerSources.length>=1);
    assert(q.answerSources.every(s=>s.url.startsWith('https://')));
  }
 }
 for(const r of q.references||[]) assert(items.some(x=>x.id===r.id && x.category!=='exercise'));
 if(q.needsReview) assert(q.reviewReasons.length);
 if(active(q)){
  const key=[q.chapter,q.section,q.category,q.title].join('|');
  assert(!groups.has(key),'Duplicate active heading '+key);groups.add(key);
 }
}
assert.equal(items.filter(x=>x.originalChapterNumber===1 && x.category==='knowledge').length,19);
for(let ch=1;ch<=20;ch++) assert(items.some(x=>x.sourceKind==='original' && x.originalChapterNumber===ch && x.category==='exercise'));
assert(items.filter(x=>x.sourceKind==='original' && x.originalChapterNumber===12).every(x=>!active(x)));
for(const t of ['有毒有害化学品污染','太空污染','水环境标准','水体污染的源头控制','雾霾的相关考点','CCUS','VOCs 治理技术','节能与减排','畜禽粪污污染防治措施','健康风险评价常见方法'])assert(items.some(x=>x.title===t && x.category==='supplement'),t);
assert.equal(items.filter(x=>x.category==='exercise').length,139);
assert.equal(items.filter(x=>x.answerRevision).length,114);
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(site,'data/environment.js'),'utf8')+';globalThis.items=ENVIRONMENT_SEED;',context);
assert.equal(JSON.stringify(context.items),JSON.stringify(items));
console.log('PASS environment integrity:',JSON.stringify(s));
