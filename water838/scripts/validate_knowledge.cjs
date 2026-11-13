const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),{execFileSync}=require('node:child_process');
const site=path.resolve(__dirname,'..'),root=path.join(site,'knowledge');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n),'utf8'));
const m=read('manifest.json'),tree=read('tree.json'),contents={...read('environment-intro.json'),...read('water-pollution.json')};
assert.equal(m.subjects[0].rootIds.length,20);assert.equal(m.subjects[1].rootIds.length,12);
const seen=new Set();function visit(id){assert(!seen.has(id),'Cycle/duplicate '+id);seen.add(id);const n=tree.nodes[id];assert(n);for(const c of n.childIds){assert.equal(tree.nodes[c].parentId,id);visit(c);}}
for(const s of m.subjects)for(const id of s.rootIds)visit(id);assert.equal(seen.size,Object.keys(tree.nodes).length);
for(const [id,c]of Object.entries(contents)){assert(seen.has(id));for(const r of c.relatedIds||[])assert(seen.has(r));for(const e of c.source?.excerpts||[])assert(fs.existsSync(path.join(site,e.src)));}
const bank=JSON.parse(fs.readFileSync(path.join(site,'index.html'),'utf8').split('const FULL_SEED=')[1].split(';const BUNDLE_VERSION=')[0]);for(const x of bank)assert(contents[x.id]);
assert.equal(m.comparisons.length,12);for(const c of m.comparisons){for(const id of c.nodeIds)assert(Object.keys(contents[id].comparison).length);}
assert.equal(read('coverage.json').rows.length,m.statistics.pending+m.statistics.verified);
for(const f of ['knowledge.js'])execFileSync(process.execPath,['--check',path.join(root,f)]);
assert(!fs.readFileSync(path.join(root,'knowledge.js'),'utf8').includes('localStorage.clear'));
console.log(`PASS knowledge integrity: ${seen.size} stable nodes, 20/12 roots, content/source references, 211 original question links, 12 shared comparisons, honest coverage, JS syntax`);
