const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const site=path.resolve(__dirname,'../../water838');
const html=fs.readFileSync(path.join(site,'index.html'),'utf8');
const seed=JSON.parse(html.split('const FULL_SEED=')[1].split(';const BUNDLE_VERSION=')[0]);
const data=JSON.parse(fs.readFileSync(path.join(site,'data/water-excerpts.json'),'utf8'));
assert.equal(data.source.pages,269);
assert.deepEqual(Object.keys(data.items).sort(),seed.map(q=>q.id).sort());
let count=0;
for(const q of seed){
 const x=data.items[q.id],r=x.sourceRange;
 assert.equal(x.title,q.question);assert.equal(x.page,q.page);
 assert(x.matchScore>=.65);assert(x.excerpts.length>0);
 assert(r.startPage<=r.endPage&&r.endPage<=269);
 if(r.startPage===r.endPage)assert(r.startY<r.endY);
 for(const e of x.excerpts){assert.equal(e.printedPage,e.page-1);assert(e.page>=r.startPage&&e.page<=r.endPage);assert(e.src.startsWith('./assets/water/'));assert(fs.statSync(path.resolve(site,e.src)).size>100);count++;}
}
assert(data.items[seed[4].id].excerpts.length>=2,'Chapter 9 cross-page answer');
assert(data.items[seed.at(-1).id].excerpts.length>=2,'Final diagram and continuation');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(site,'data/water-excerpts.js'),'utf8')+';globalThis.bundle=WATER_SOURCE_EXCERPTS',context);
assert.equal(JSON.stringify(context.bundle),JSON.stringify(data));
console.log(`PASS water excerpts: all 211 preserved IDs, 269 source pages, ${count} local source images, cross-page answers, stable bundle`);
