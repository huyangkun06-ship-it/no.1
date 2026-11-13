/* Shared, isolated knowledge reader. It never reads or writes the review bank. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const PREFIX = '838.knowledge.v1.';
  const STATUS = {verified:'已完成且核对',migrated_pending:'已迁移但待核对',source_incomplete:'来源不完整',not_migrated:'尚未迁移'};
  const mobile = () => matchMedia('(max-width:760px)').matches;
  const forbiddenWrites = new Set();
  let manifest, nodes, content, coverage, subject = 'environment-intro', mode = 'tree';
  let currentId, expanded = new Set(), picked = new Set(), searchMatches = [], allowed = null;
  let visible = [], treeFocus, history = [], positions = new Map(), savedScroll = 0;
  let recallPool = [], recallScope = 'current', scopeAnchor, outlineOpen = false, answerOpen = false;
  let mapScale=0.8,mapPositions=[],mapEdges=[],mapHeight=0,mapWidth=0,mapCentered=false;
  let searchTimer, coveragePage = 0, coverageFilter = [], ready = false, searchIndex = new Map();
  const ROW = 48, BUFFER = 8;
  function el(tag, text, cls) {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }
  function button(text, fn, cls) {
    const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', fn); return b;
  }
  function msg(text) { $('message').textContent = text; }
  function load(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); }
    catch (_) { forbiddenWrites.add(key); msg('本地展开记录无法读取，原始值已保留；可继续阅读。'); return fallback; }
  }
  function write(key, value) {
    if (forbiddenWrites.has(key)) return;
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) { msg('浏览器未能保存展开状态；阅读仍可继续，可导出知识数据备份。'); }
  }
  const treeKey = () => PREFIX + subject + '.tree-' + manifest.treeVersion;
  function persist() {
    write(treeKey(), {subject, treeVersion:manifest.treeVersion, expandedIds:[...expanded], selectedId:currentId, pickedIds:[...picked]});
    write(PREFIX+'preferences', {subject, mode});
  }
  const roots = () => manifest.subjects.find(x => x.id === subject).rootIds;
  function descendants(id, out = []) {
    for (const child of nodes[id]?.childIds || []) { out.push(child); descendants(child, out); }
    return out;
  }
  function path(id) { const p=[]; for (let n=nodes[id];n;n=nodes[n.parentId]) p.unshift(n.id); return p; }
  const contentId = id => nodes[id]?.contentId || id;
  function realTopics(scopeSubject = subject) {
    return Object.keys(content).filter(id => nodes[id].subject === scopeSubject && ['topic','question'].includes(nodes[id].type));
  }
  function defaultExpanded() {
    return new Set(Object.values(nodes).filter(n => n.subject===subject && ['chapter','section'].includes(n.type)).map(n=>n.id));
  }
  function restore(s) {
    subject = manifest.subjects.some(x=>x.id===s) ? s : 'environment-intro';
    const state = load(treeKey(), null);
    if (state && typeof state === 'object' && Array.isArray(state.expandedIds)) {
      expanded = new Set(state.expandedIds.filter(id=>nodes[id]?.subject===subject && nodes[id].childIds.length));
      picked = new Set((Array.isArray(state.pickedIds)?state.pickedIds:[]).filter(id=>nodes[id]?.subject===subject && content[id]?.recall?.answerAvailable));
      currentId = nodes[state.selectedId]?.subject===subject ? contentId(state.selectedId) : realTopics()[0];
    } else { expanded=subject==='environment-intro'?new Set():defaultExpanded(); picked=new Set(); currentId=realTopics()[0]; }
    treeFocus=currentId; scopeAnchor=currentId;
  }
  function subjectUI() {
    document.querySelectorAll('[data-subject]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.subject===subject)));
    $('treeSubject').textContent = manifest.subjects.find(x=>x.id===subject).title;
    $('readMode').textContent = subject==='water-pollution'?'详细电子教材':'专注阅读';
    $('compareMode').hidden = subject!=='water-pollution';
    $('mapMode').hidden = subject!=='environment-intro';
    if (subject!=='water-pollution' && mode==='compare') mode='map';
    if(subject!=='environment-intro' && mode==='map')mode='tree';
    $('pickCount').textContent=`已选 ${picked.size} 项`;
  }
  function flatten() {
    visible=[];
    function visit(id, level, index, siblings) {
      if (allowed && !allowed.has(id)) return;
      visible.push({id,level,index,siblings});
      if (expanded.has(id)) nodes[id].childIds.forEach((c,i,a)=>visit(c,level+1,i,a.length));
    }
    roots().forEach((id,i,a)=>visit(id,1,i,a.length));
  }
  function renderTree(rebuild = true) {
    if (!ready) return;
    if (rebuild) flatten();
    const vp=$('treeViewport'), host=$('treeRows');
    const start=Math.max(0,Math.floor(vp.scrollTop/ROW)-BUFFER);
    const end=Math.min(visible.length,start+Math.ceil((vp.clientHeight||480)/ROW)+BUFFER*2);
    const fragment=document.createDocumentFragment();
    const spacer=el('div'); spacer.style.height=start*ROW+'px'; spacer.setAttribute('role','presentation'); fragment.append(spacer);
    for (let i=start;i<end;i++) {
      const {id,level,index,siblings}=visible[i], n=nodes[id];
      const row=el('div',null,'k-tree-row'); row.dataset.id=id; row.dataset.type=n.type;
      row.id='row-'+id; row.setAttribute('role','treeitem'); row.setAttribute('aria-level',level);
      row.setAttribute('aria-setsize',siblings); row.setAttribute('aria-posinset',index+1);
      row.setAttribute('aria-selected',String(id===currentId)); row.tabIndex=id===treeFocus?0:-1;
      row.style.paddingLeft=Math.min(level-1,8)*14+'px';
      if (searchMatches.includes(id)) row.classList.add('is-match');
      if (n.childIds.length) {
        row.setAttribute('aria-expanded',String(expanded.has(id)));
        const arrow=button(expanded.has(id)?'▾':'▸',e=>{e.stopPropagation();toggle(id);},'k-arrow');
        arrow.setAttribute('aria-label',(expanded.has(id)?'折叠 ':'展开 ')+n.title); arrow.tabIndex=-1; row.append(arrow);
      } else row.append(el('span',null,'k-arrow-empty'));
      const title=button((n.archived?'[旧版保留] ':'')+n.title,()=>go(contentId(id)), 'k-tree-title');
      title.tabIndex=-1; title.title=n.title; row.append(title);
      if (content[id]?.recall?.answerAvailable) {
        const check=el('input'); check.type='checkbox'; check.className='k-tree-check'; check.checked=picked.has(id);
        check.setAttribute('aria-label','自选 '+n.title); check.tabIndex=-1;
        check.addEventListener('change',()=>{check.checked?picked.add(id):picked.delete(id);persist();$('pickCount').textContent=`已选 ${picked.size} 项`;if(recallScope==='custom')buildPool();}); row.append(check);
      }
      row.addEventListener('focus',()=>treeFocus=id);
      row.addEventListener('click',e=>{if(e.target===row)go(contentId(id));});
      fragment.append(row);
    }
    const after=el('div');after.style.height=(visible.length-end)*ROW+'px';after.setAttribute('role','presentation');fragment.append(after);
    host.replaceChildren(fragment);
    vp.setAttribute('aria-label',`知识树，当前可见 ${visible.length} 个节点`);
    if(mode==='map')renderMap();
  }
  function toggle(id) { expanded.has(id)?expanded.delete(id):expanded.add(id); treeFocus=id;persist();renderTree(); }
  function locate(id=currentId, focus=false) {
    path(id).slice(0,-1).forEach(p=>expanded.add(p)); treeFocus=id; persist(); flatten();
    const index=visible.findIndex(n=>n.id===id);
    if(index>=0) $('treeViewport').scrollTop=Math.max(0,index*ROW-2*ROW);
    renderTree(false);
    if(focus) requestAnimationFrame(()=>document.getElementById('row-'+id)?.focus({preventScroll:true}));
  }
  function depth(value) {
    expanded=new Set();
    function visit(id,level) { if(nodes[id].childIds.length && (value==='all'||level<Number(value)))expanded.add(id);nodes[id].childIds.forEach(c=>visit(c,level+1)); }
    roots().forEach(id=>visit(id,0)); $('treeViewport').scrollTop=0;persist();renderTree();
  }
  function keyboard(e) {
    if (e.target.tagName==='INPUT')return;
    const index=Math.max(0,visible.findIndex(x=>x.id===treeFocus)), n=nodes[treeFocus]||nodes[visible[0]?.id];
    if(!n)return;
    let next;
    if(e.key==='ArrowDown')next=visible[Math.min(index+1,visible.length-1)]?.id;
    if(e.key==='ArrowUp')next=visible[Math.max(0,index-1)]?.id;
    if(e.key==='Home')next=visible[0]?.id;
    if(e.key==='End')next=visible[visible.length-1]?.id;
    if(e.key==='ArrowRight'){if(n.childIds.length&&!expanded.has(n.id))toggle(n.id);else next=n.childIds[0];}
    if(e.key==='ArrowLeft'){if(expanded.has(n.id))toggle(n.id);else next=n.parentId;}
    if(e.key==='Enter'||e.key===' '){go(contentId(n.id));e.preventDefault();return;}
    if(['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(e.key)) {
      e.preventDefault(); if(next){treeFocus=next;const i=visible.findIndex(x=>x.id===next);$('treeViewport').scrollTop=Math.max(0,i*ROW-$('treeViewport').clientHeight/2);renderTree(false);}
      requestAnimationFrame(()=>document.getElementById('row-'+treeFocus)?.focus({preventScroll:true}));
    }
  }
  function search() {
    const q=$('treeSearch').value.trim().toLocaleLowerCase();
    allowed=null;searchMatches=[];
    if(q) {
      allowed=new Set();
      for(const [id,text] of searchIndex)if(nodes[id].subject===subject&&text.includes(q)){
        searchMatches.push(id);path(id).forEach(p=>{allowed.add(p);if(p!==id)expanded.add(p);});
      }
    }
    $('searchNav').hidden=!q; $('searchCount').textContent=searchMatches.length+' 个匹配';
    $('nextMatch').disabled=$('prevMatch').disabled=!searchMatches.length;
    $('treeViewport').scrollTop=0;persist();renderTree();
    if(q)msg(searchMatches.length?`找到 ${searchMatches.length} 项，已展开祖先路径。`:'没有匹配内容，试试较短关键词。');
  }
  function clearSearch() { clearTimeout(searchTimer);$('treeSearch').value='';allowed=null;searchMatches=[];$('searchNav').hidden=true;renderTree(); }
  function matchStep(step) { if(!searchMatches.length)return;const i=searchMatches.indexOf(currentId);const id=searchMatches[(i+step+searchMatches.length)%searchMatches.length];go(contentId(id));locate(id); }
  function safeLink(url,text) {
    try { const u=new URL(url,location.href);if(!['http:','https:'].includes(u.protocol))return el('span',text);const a=el('a',text);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a; }catch(_){return el('span',text);}
  }
  function renderBlocks(blocks) {
    const out=document.createDocumentFragment();
    for(const b of blocks||[]) {
      if(b.type==='text')out.append(el('p',b.text));
      else if(b.type==='sourceText')out.append(el('pre',b.text,'k-source-text'));
      else if(b.type==='heading')out.append(el('h2',b.text));
      else if(b.type==='table'){
        const wrap=el('div',null,'k-table-wrap'),t=el('table'),head=el('thead'),tr=el('tr');
        for(const h of b.headers||[]){const th=el('th',h);th.scope='col';tr.append(th);}head.append(tr);t.append(head);
        const body=el('tbody');for(const row of b.rows||[]){const r=el('tr');for(const c of row)r.append(el('td',c));body.append(r);}t.append(body);wrap.append(t);out.append(wrap);
      }else if(b.type==='formula'){
        const box=el('div',null,'k-formula'),math=el('div',null,'k-math');
        try { if(!window.katex)throw Error();katex.render(b.tex,math,{displayMode:true,throwOnError:false,trust:false,output:'htmlAndMathml'}); }
        catch(_){math.textContent=b.tex;}
        box.append(math);const dl=el('dl');for(const p of b.parameters||[]){dl.append(el('dt',p.symbol),el('dd',`${p.meaning}（${p.unit}）`));}box.append(dl,el('p','适用条件：'+b.condition,'k-note'));
        if(b.note)box.append(el('p',b.note,'k-note'));out.append(box);
      }else if(b.type==='flow'){
        const ns='http://www.w3.org/2000/svg', count=b.steps.length,svg=document.createElementNS(ns,'svg');
        svg.classList.add('k-flow');svg.setAttribute('viewBox',`0 0 420 ${count*88}`);svg.setAttribute('role','img');
        svg.setAttribute('aria-label',b.steps.join(' → '));
        const title=document.createElementNS(ns,'title');title.textContent=b.steps.join(' → ');svg.append(title);
        b.steps.forEach((text,i)=>{
          const rect=document.createElementNS(ns,'rect');for(const [k,v] of Object.entries({x:12,y:i*88+6,width:396,height:54,rx:4,fill:'#f0f3ed',stroke:'#ccd6c8'}))rect.setAttribute(k,v);svg.append(rect);
          const words=document.createElementNS(ns,'text');words.setAttribute('x',210);words.setAttribute('y',i*88+39);words.setAttribute('text-anchor','middle');words.setAttribute('font-size',16);words.textContent=text;svg.append(words);
          if(i<count-1){const line=document.createElementNS(ns,'path');line.setAttribute('d',`M210 ${i*88+62}v18m-6 -6l6 6 6 -6`);line.setAttribute('stroke','#73836c');line.setAttribute('fill','none');svg.append(line);}
        });out.append(svg);if(b.note)out.append(el('p',b.note,'k-note'));
      }else if(b.type==='image' && /^\.\/?assets\//.test(b.src||'')){
        const img=el('img');img.src='../'+b.src.replace(/^\.\//,'');img.alt=b.alt||'来源图片';img.loading='lazy';img.style.maxWidth='100%';out.append(img);
      }
    }
    return out;
  }
  function sourcePanel(c) {
    const box=el('div',null,'k-source'),s=c.source||{};
    box.append(el('strong','来源与核对状态'));
    const pages=s.printedPages?.length?'书内第 '+s.printedPages.join('、')+' 页':s.pages?.length?'PDF第 '+s.pages.join('、')+' 页':'原始页序待核对';
    box.append(el('p',`${s.document||'来源未提供'} · ${pages}`));
    if(s.chapter||s.section)box.append(el('p',[s.chapter,s.section].filter(Boolean).join(' / ')));
    if(s.url)box.append(safeLink(s.url,'打开原始资料 ↗'));
    if(s.bodyLineRange)box.append(el('p',`文字快照正文第 ${s.bodyLineRange.join('—')} 行；书内页码与PDF页序不同。`));
    if(c.verificationNote)box.append(el('p',c.verificationNote,'k-note'));
    if(s.excerpts?.length){
      const details=el('details',null,'k-images');details.append(el('summary','查看对应原文裁图（含公式、表格与图片）'));
      details.addEventListener('toggle',()=>{if(!details.open||details.dataset.loaded)return;details.dataset.loaded='true';for(const im of s.excerpts){
        if(!/^\.\/assets\/(water|environment)\/[\w.-]+\.webp$/.test(im.src))continue;
        const fig=el('figure'),img=el('img');img.src='../'+im.src.slice(2);img.alt=`${s.document} PDF第${im.page}页原文`;img.loading='lazy';fig.append(img,el('figcaption',`PDF第${im.page}页`));details.append(fig);
      }});box.append(details);
    }
    if(c.sourceText){const d=el('details');d.append(el('summary','查看完整文字提取稿（待核对，不作为正式答案）'),el('pre',c.sourceText,'k-source-text'));box.append(d);}
    if(s.additionalSources?.length){const d=el('details');d.append(el('summary','整理答案引用资料'));for(const x of s.additionalSources)d.append(el('p',typeof x==='string'?x:JSON.stringify(x)));box.append(d);}
    return box;
  }
  function related(c) {
    if(!c.relatedIds?.length)return document.createDocumentFragment();
    const box=el('div');box.append(el('h2','相关知识与原题'));const list=el('div',null,'k-links');
    for(const id of c.relatedIds)if(nodes[id])list.append(button(nodes[id].title,()=>go(id)));
    box.append(list);return box;
  }
  function chapterReader(n,host) {
    host.append(el('h1',n.title));if(n.mapping)host.append(el('p',n.mapping,'k-note'));
    for(const id of n.childIds)host.append(button(nodes[id].title,()=>go(id),'k-chapter-link'));
    host.append(el('p','使用目录箭头独立展开分支；点标题进入内容。树节点支持任意层级，展开互不影响。','k-note'));
  }
  function renderReader() {
    const n=nodes[currentId],host=$('readingBody');host.replaceChildren();if(!n)return;
    $('breadcrumbs').replaceChildren();
    for(const id of path(currentId)){if($('breadcrumbs').childNodes.length)$('breadcrumbs').append(el('span','/'));$('breadcrumbs').append(button(nodes[id].title,()=>go(id)));}
    $('backRead').disabled=!history.length;
    if(mode==='compare'){renderComparisons(host);return;}
    if(mode==='map'){mapReader(host);return;}
    const c=content[currentId];
    if(!c){chapterReader(n,host);return;}
    host.append(el('span',STATUS[c.verificationStatus]||'待核对','k-status '+c.verificationStatus));
    host.append(el('h1',mode==='recall'?(c.recall?.question||n.title):n.title));
    if(n.archived)host.append(el('p','旧版保留内容：按原20章呈现，未删除。请结合新版映射和来源变更阅读。','k-note'));
    if(mode==='recall'){renderRecall(host,c);return;}
    if(c.contentBlocks?.length)host.append(renderBlocks(c.contentBlocks));
    else host.append(el('p','这项内容已定位到来源，文字提取中的公式、表格或答案尚待核对。为避免错位提取稿成为参考答案，请先查看下方原文裁图或提取稿。','k-note'));
    host.append(related(c),sourcePanel(c));
    if(c.questionIds?.length)host.append(el('p',`关联原题 ID：${c.questionIds.join('、')}。原背诵题库及复习记录独立保留。`,'k-note'));
  }
  function mapReader(host) {
    host.append(el('h1','环境学导论 · 思维导图'));
    const shell=el('div',null,'k-map-shell'),tools=el('div',null,'k-map-tools');
    const zoom=el('span',Math.round(mapScale*100)+'%');zoom.id='mapZoom';
    tools.append(button('− 缩小',()=>zoomMap(-0.15)),zoom,button('＋ 放大',()=>zoomMap(0.15)),button('居中主题',centerMap),button('全部折叠',()=>depth('0')),button('全部展开',()=>depth('all')));
    const ds=el('select');ds.id='mapDepth';ds.setAttribute('aria-label','导图展开深度');ds.style.width='auto';
    for(const [v,t]of [['0','仅章节'],['1','章节＋小节'],['2','知识点标题'],['3','答题框架'],['all','完整内容']]){const o=el('option',t);o.value=v;ds.append(o);}ds.addEventListener('change',()=>depth(ds.value));tools.append(ds);
    shell.append(tools,el('p','点击分支末端 ＋ / − 独立展开与收起；点击标题阅读正文。触屏滑动浏览，鼠标可拖动空白处。','k-map-help'));
    const viewport=el('div',null,'k-map-viewport');viewport.id='mapViewport';viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','环境学导论思维导图，可双向滚动和缩放');
    const canvas=el('div',null,'k-map-canvas');canvas.id='mapCanvas';const world=el('div',null,'k-map-world');world.id='mapWorld';canvas.append(world);viewport.append(canvas);shell.append(viewport);host.append(shell);
    viewport.addEventListener('scroll',drawMap,{passive:true});
    let dragging=null;
    viewport.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.target.closest('button'))return;dragging={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
    viewport.addEventListener('pointermove',e=>{if(dragging){viewport.scrollLeft=dragging.left+dragging.x-e.clientX;viewport.scrollTop=dragging.top+dragging.y-e.clientY;}});
    const stop=()=>{dragging=null;viewport.classList.remove('dragging');};viewport.addEventListener('pointerup',stop);viewport.addEventListener('pointercancel',stop);
    renderMap();requestAnimationFrame(centerMap);
  }
  function renderMap() {
    if(!$('mapWorld'))return;
    mapPositions=[];mapEdges=[];
    const colors=['#6c9680','#7394b5','#b79563','#9a85b2','#6d9ea2','#af8d82'];
    let cursors=[50,50];
    function visit(id,depth,side,color) {
      if(allowed&&!allowed.has(id))return null;
      const n=nodes[id],idx=side<0?0:1,children=expanded.has(id)?n.childIds.map(c=>visit(c,depth+1,side,color)).filter(Boolean):[];
      const y=children.length?(children[0].y+children[children.length-1].y)/2:(cursors[idx]+=70);
      const p={id,x:side*depth*286,y,color};mapPositions.push(p);
      children.forEach(c=>mapEdges.push({from:p,to:c,color}));return p;
    }
    const ids=roots().filter(id=>!allowed||allowed.has(id)),split=Math.ceil(ids.length/2);
    const children=ids.map((id,i)=>visit(id,1,i<split?-1:1,colors[i%colors.length])).filter(Boolean);
    const root={id:'map-root',x:0,y:children.length?(Math.min(...children.map(p=>p.y))+Math.max(...children.map(p=>p.y)))/2:80};mapPositions.push(root);
    children.forEach(c=>mapEdges.push({from:root,to:c,color:c.color}));
    const minX=Math.min(...mapPositions.map(p=>p.x));
    mapPositions.forEach(p=>p.x+=30-minX);
    mapHeight=Math.max(...cursors)+130;mapWidth=Math.max(...mapPositions.map(p=>p.x))+260;
    const padding=Math.max(0,($('mapViewport').clientWidth/mapScale-mapWidth)/2);if(padding){mapPositions.forEach(p=>p.x+=padding);mapWidth+=padding*2;}
    $('mapCanvas').style.width=mapWidth*mapScale+'px';$('mapCanvas').style.height=mapHeight*mapScale+'px';
    $('mapWorld').style.transform=`scale(${mapScale})`;drawMap();
  }
  function drawMap() {
    const vp=$('mapViewport'),world=$('mapWorld');if(!vp||!world)return;
    const left=vp.scrollLeft/mapScale-250,top=vp.scrollTop/mapScale-80,right=left+vp.clientWidth/mapScale+500,bottom=top+vp.clientHeight/mapScale+160;
    const fragment=document.createDocumentFragment(),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('k-map-edges');svg.setAttribute('width',mapWidth);svg.setAttribute('height',mapHeight);svg.setAttribute('aria-hidden','true');
    for(const {from:a,to:b,color}of mapEdges)if(Math.max(a.x,b.x)+226>=left&&Math.min(a.x,b.x)<=right&&Math.max(a.y,b.y)>=top&&Math.min(a.y,b.y)<=bottom){const line=document.createElementNS(ns,'path'),direction=b.x>a.x?1:-1,x=direction>0?a.x+226:a.x,end=direction>0?b.x:b.x+226;line.setAttribute('d',`M${x} ${a.y+26} C${x+direction*35} ${a.y+26},${end-direction*35} ${b.y+26},${end} ${b.y+26}`);line.setAttribute('stroke',color||'#a1b698');line.setAttribute('stroke-width','2');line.setAttribute('fill','none');svg.append(line);}fragment.append(svg);
    for(const p of mapPositions)if(p.x+226>=left&&p.x<=right&&p.y+52>=top&&p.y<=bottom){
      const n=nodes[p.id],box=el('div',null,'k-map-node '+(p.id==='map-root'?'root':n.type==='chapter'?'chapter':''));box.dataset.mapId=p.id;box.style.left=p.x+'px';box.style.top=p.y+'px';
      if(p.id===currentId)box.classList.add('selected');if(p.x<(mapPositions.find(n=>n.id==='map-root')?.x||0))box.classList.add('left-branch');if(p.color){box.style.borderColor=p.color;box.style.setProperty('--branch-color',p.color);}
      const label=button(p.id==='map-root'?'环境学导论':n.title,()=>{if(p.id==='map-root')return;mode='read';go(contentId(p.id));},'k-map-label');label.title=n?.title||'环境学导论';box.append(label);
      if(n?.childIds.length){const b=button(expanded.has(n.id)?'−':'＋',()=>toggle(n.id),'k-map-expand');b.setAttribute('aria-label',(expanded.has(n.id)?'折叠 ':'展开 ')+n.title);b.setAttribute('aria-expanded',expanded.has(n.id));box.append(b);}fragment.append(box);
    }
    world.replaceChildren(fragment);
  }
  function centerMap(){const vp=$('mapViewport'),root=mapPositions.find(p=>p.id==='map-root');if(vp&&root){vp.scrollLeft=Math.max(0,(root.x+113)*mapScale-vp.clientWidth/2);vp.scrollTop=Math.max(0,(root.y+26)*mapScale-vp.clientHeight/2);drawMap();}}
  function zoomMap(delta){const vp=$('mapViewport');if(!vp)return;const old=mapScale,left=vp.scrollLeft+vp.clientWidth/2,top=vp.scrollTop+vp.clientHeight/2;mapScale=Math.max(0.35,Math.min(1.7,mapScale+delta));$('mapZoom').textContent=Math.round(mapScale*100)+'%';renderMap();vp.scrollLeft=left*mapScale/old-vp.clientWidth/2;vp.scrollTop=top*mapScale/old-vp.clientHeight/2;drawMap();}
  function poolForScope() {
    const all=Object.keys(content).filter(id=>content[id].recall?.answerAvailable);
    const anchor=nodes[scopeAnchor]||nodes[currentId];if(!anchor)return [];
    if(recallScope==='all')return all;
    if(recallScope==='custom')return all.filter(id=>picked.has(id));
    if(recallScope==='subject')return all.filter(id=>nodes[id].subject===anchor.subject);
    if(recallScope==='current')return all.filter(id=>id===contentId(anchor.id));
    const type=recallScope==='chapter'?'chapter':'section';
    const target=path(anchor.id).reverse().find(id=>nodes[id].type===type)||anchor.id;
    const ids=new Set([target,...descendants(target)]);return all.filter(id=>ids.has(id));
  }
  function buildPool() { recallPool=poolForScope(); }
  function renderRecall(host,c) {
    const controls=el('div',null,'k-recall-controls'),label=el('label','抽背范围');label.htmlFor='recallScope';const select=el('select');select.id='recallScope';
    for(const [value,text] of [['current','当前知识点'],['section','当前小节'],['chapter','当前章节'],['subject','当前科目'],['custom','自选知识点'],['all','两科全部随机']]){
      const o=el('option',text);o.value=value;select.append(o);
    }select.value=recallScope;select.addEventListener('change',()=>{recallScope=select.value;scopeAnchor=currentId;buildPool();outlineOpen=answerOpen=false;renderReader();});controls.append(label,select);host.append(controls);
    buildPool();
    const available=c.recall?.answerAvailable;
    const pos=recallPool.indexOf(currentId);host.append(el('div',`范围内 ${recallPool.length} 项${pos>=0?' · 第 '+(pos+1)+' 项':''}；未整理正式答案的来源稿不进入随机池。`,'k-question-position'));
    const actions=el('div',null,'k-recall-actions');
    const hint=button(outlineOpen?'隐藏框架提示':'显示框架提示',()=>{outlineOpen=!outlineOpen;renderReader();});hint.id='outlineReveal';hint.setAttribute('aria-expanded',outlineOpen);hint.setAttribute('aria-controls','recallOutline');
    const answer=button(answerOpen?'隐藏完整答案':'显示完整答案',()=>{answerOpen=!answerOpen;renderReader();});answer.id='answerReveal';answer.disabled=!available;answer.setAttribute('aria-expanded',answerOpen);answer.setAttribute('aria-controls','recallAnswer');
    actions.append(hint,answer);host.append(actions);
    const ol=el('ol');ol.id='recallOutline';ol.hidden=!outlineOpen;for(const h of c.recall?.outline||[])ol.append(el('li',h));host.append(ol);
    const full=el('div');full.id='recallAnswer';full.hidden=!answerOpen;full.append(renderBlocks(c.contentBlocks),sourcePanel(c));host.append(full);
    if(!available)host.append(el('p','此条尚无可用的整理答案，可进入详细内容查看来源。请在范围内选择其他已整理知识点。','k-note'));
    const nav=el('div',null,'k-recall-actions');
    nav.append(button('上一题',()=>recallStep(-1)),button('下一题',()=>recallStep(1)),button('随机一题',randomRecall),button('返回知识树位置',()=>{setMode('tree');openDirectory();locate();}),button('查看详细知识点',()=>setMode('read')));host.append(nav);
  }
  function recallStep(step) {
    buildPool();if(!recallPool.length){msg('此范围没有已整理答案。可选择当前章节、科目或自选范围。');return;}
    const i=recallPool.indexOf(currentId);const next=i<0?(step>0?0:recallPool.length-1):(i+step+recallPool.length)%recallPool.length;
    go(recallPool[next],true,true);
  }
  function randomRecall(){buildPool();if(!recallPool.length){msg('此范围没有可抽背知识点。');return;}let pool=recallPool.filter(id=>id!==currentId);if(!pool.length)pool=recallPool;go(pool[Math.floor(Math.random()*pool.length)],true,true);}
  function renderComparisons(host) {
    host.append(el('h1','工艺对比与易混概念'),el('p','对比字段引用知识点中的同一份结构化数据。整理释义仍须结合原页核对；表格可横向滑动。','k-note'));
    for(const comparison of manifest.comparisons){
      host.append(el('h2',comparison.title));
      const ids=comparison.nodeIds,fields=[...new Set(ids.flatMap(id=>Object.keys(content[id]?.comparison||{})))];
      const wrap=el('div',null,'k-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',comparison.title+'，可横向滚动');
      const table=el('table'),caption=el('caption',comparison.title);caption.className='skip-link';table.append(caption);
      const thead=el('thead'),tr=el('tr');const dimension=el('th','比较维度');dimension.scope='col';tr.append(dimension);
      for(const id of ids){const th=el('th');th.scope='col';th.append(button(nodes[id].title,()=>{mode='read';go(id);}));tr.append(th);}thead.append(tr);table.append(thead);
      const tbody=el('tbody');for(const field of fields){const row=el('tr'),th=el('th',field);th.scope='row';row.append(th);for(const id of ids)row.append(el('td',content[id]?.comparison?.[field]||'此维度未整理'));tbody.append(row);}table.append(tbody);wrap.append(table);host.append(wrap);
    }
  }
  function go(id,push=true,fromRecall=false) {
    id=contentId(id);if(!nodes[id])return;
    if(push&&currentId&&id!==currentId){history.push({id:currentId,subject,mode,scroll:window.scrollY});if(history.length>80)history.shift();}
    if(nodes[id].subject!==subject){persist();restore(nodes[id].subject);clearSearch();subjectUI();}
    currentId=id;treeFocus=id;outlineOpen=answerOpen=false;
    if(!fromRecall)scopeAnchor=id;
    persist();modeUI();updateURL();renderReader();renderTree();
    if(mobile())closeDirectory();
    if(mode!=='tree')window.scrollTo({top:0,behavior:'instant'});
  }
  function updateURL(){const p=new URLSearchParams({subject,node:currentId,mode});window.history.replaceState(null,'','#'+p.toString());}
  function modeUI() { $('layout').classList.toggle('map-mode',mode==='map');document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode))); }
  function setMode(m) {
    mode=m;if(mode==='map'&&subject!=='environment-intro')mode='tree';if(mode==='compare'&&subject!=='water-pollution')mode='tree';modeUI();outlineOpen=answerOpen=false;
    scopeAnchor=currentId;persist();updateURL();renderReader();
    if(['read','map'].includes(mode)&&!mobile()){$('layout').classList.add('directory-hidden');$('directoryBtn').setAttribute('aria-expanded','false');}
    else if(mode==='tree'&&!mobile()){$('layout').classList.remove('directory-hidden');$('directoryBtn').setAttribute('aria-expanded','true');renderTree();}
  }
  function openDirectory(){if(mobile()){$('layout').classList.add('drawer-open');$('drawerBackdrop').hidden=false;document.body.style.overflow='hidden';}else $('layout').classList.remove('directory-hidden');$('directoryBtn').setAttribute('aria-expanded','true');renderTree();}
  function closeDirectory(){if(mobile()){$('layout').classList.remove('drawer-open');$('drawerBackdrop').hidden=true;document.body.style.overflow='';}else $('layout').classList.add('directory-hidden');$('directoryBtn').setAttribute('aria-expanded','false');}
  function download(name,obj){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function getJSON(file){const r=await fetch('./data/'+file);if(!r.ok)throw Error(`${file} (${r.status})`);return r.json();}
  async function showCoverage(){
    try{coverage=coverage||await getJSON('coverage.json');$('coverageSummary').replaceChildren();const s=manifest.statistics;
      $('coverageSummary').append(el('p',`环导：原20章，${s.environmentKnowledge}个知识点及补充、${s.environmentExercises}道习题、${s.environmentSourceNotes}条来源备注。已融入变动PDF前七章${s.environmentFirstSevenSupplements}个补充知识点。`),el('p',`水控：12个逻辑模块，主资料${s.waterPrimarySections}个文字段，${s.waterOrganizedTopics}个整理知识点，原${s.waterLegacyQuestions}道题完整保留。全文已迁移不代表公式与图表已逐页核实。`),el('p',`已完成且核对：${s.verified}；待核对：${s.pending}。主资料原件传输受限，原辅助教辅裁图仍可使用。`));
      coveragePage=0;filterCoverage();$('coverageDialog').showModal();
    }catch(e){msg('覆盖报告读取失败：'+e.message);}
  }
  function filterCoverage(){const q=$('coverageSearch').value.toLowerCase(),s=$('coverageStatus').value;
    coverageFilter=[...coverage.rows,...coverage.sourceGaps].filter(r=>(s==='all'||r.status===s)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));renderCoverage();}
  function renderCoverage(){const host=$('coverageRows');host.replaceChildren();const total=Math.max(1,Math.ceil(coverageFilter.length/25));coveragePage=Math.max(0,Math.min(coveragePage,total-1));
    for(const r of coverageFilter.slice(coveragePage*25,coveragePage*25+25)){const box=el('div',null,'k-coverage-row');if(nodes[r.id])box.append(button(r.title,()=>{$('coverageDialog').close();mode='read';go(r.id);}));else box.append(el('strong',r.document||r.title));box.append(el('p',`${r.id} · ${STATUS[r.status]||r.status}`));if(r.source)box.append(el('p',JSON.stringify(r.source)));if(r.migrated!==undefined)box.append(el('p',`内容迁移：${r.migrated?'是':'否'}；答案整理：${r.answerOrganized?'是':'否'}；表格核对：${r.tableVerified?'是':'未核实'}；公式核对：${r.formulaVerified?'是':'未核实'}`));if(r.conflicts||r.note)box.append(el('p',typeof(r.conflicts||r.note)==='string'?(r.conflicts||r.note):JSON.stringify(r.note)));host.append(box);}
    $('coveragePage').textContent=`${coveragePage+1}/${total} 页 · ${coverageFilter.length} 项`;$('coveragePrev').disabled=coveragePage===0;$('coverageNext').disabled=coveragePage===total-1;
  }
  function bind(){
    document.querySelectorAll('[data-subject]').forEach(b=>b.addEventListener('click',()=>{persist();restore(b.dataset.subject);clearSearch();mode=subject==='environment-intro'?'map':'tree';subjectUI();modeUI();go(currentId,false);if(mode==='map'&&!mobile())closeDirectory();}));
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
    $('treeViewport').addEventListener('scroll',()=>renderTree(false),{passive:true});$('treeViewport').addEventListener('keydown',keyboard);
    $('depth').addEventListener('change',()=>depth($('depth').value));$('expandAll').onclick=()=>depth('all');$('collapseAll').onclick=()=>depth('0');
    $('resetTree').onclick=()=>{expanded=defaultExpanded();persist();renderTree();};
    $('expandBranch').onclick=()=>{[currentId,...descendants(currentId)].filter(id=>nodes[id].childIds.length).forEach(id=>expanded.add(id));persist();renderTree();};
    $('collapseBranch').onclick=()=>{[currentId,...descendants(currentId)].forEach(id=>expanded.delete(id));persist();renderTree();};
    $('pickBranch').onclick=()=>{[currentId,...descendants(currentId)].filter(id=>content[id]?.recall?.answerAvailable).forEach(id=>picked.add(id));persist();subjectUI();renderTree();};
    $('clearPicks').onclick=()=>{picked.clear();persist();subjectUI();renderTree();};
    $('treeSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,180);});$('clearSearch').onclick=clearSearch;
    $('nextMatch').onclick=()=>matchStep(1);$('prevMatch').onclick=()=>matchStep(-1);
    $('directoryBtn').onclick=()=>{const open=mobile()?$('layout').classList.contains('drawer-open'):!$('layout').classList.contains('directory-hidden');open?closeDirectory():openDirectory();};
    $('closeDirectory').onclick=closeDirectory;$('drawerBackdrop').onclick=closeDirectory;
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDirectory();if(e.key==='Tab'&&mobile()&&$('layout').classList.contains('drawer-open')){const focus=[...$('directory').querySelectorAll('button,input,select,summary,[tabindex="0"]')].filter(e=>e.getClientRects().length);const first=focus[0],last=focus[focus.length-1];if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}});
    $('locateBtn').onclick=()=>{clearSearch();openDirectory();locate(currentId,true);};
    $('backRead').onclick=()=>{const prev=history.pop();if(!prev)return;mode=prev.mode;go(prev.id,false);modeUI();window.scrollTo({top:prev.scroll,behavior:'instant'});};
    const topicStep=step=>{const list=realTopics(),i=list.indexOf(currentId);go(list[(Math.max(0,i)+step+list.length)%list.length]);};
    $('prevTopic').onclick=()=>mode==='recall'?recallStep(-1):topicStep(-1);$('nextTopic').onclick=()=>mode==='recall'?recallStep(1):topicStep(1);
    $('topBtn').onclick=()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
    $('coverageBtn').onclick=showCoverage;$('closeCoverage').onclick=()=>$('coverageDialog').close();
    $('coverageSearch').oninput=()=>{coveragePage=0;filterCoverage();};$('coverageStatus').onchange=()=>{coveragePage=0;filterCoverage();};
    $('coveragePrev').onclick=()=>{coveragePage--;renderCoverage();};$('coverageNext').onclick=()=>{coveragePage++;renderCoverage();};$('coverageExport').onclick=()=>download('838-knowledge-coverage.json',coverage);
    $('exportBtn').onclick=()=>download('838-knowledge-data.json',{manifest,nodes,contents:content,personalTreeState:{subject,expandedIds:[...expanded],pickedIds:[...picked],selectedId:currentId}});
    window.addEventListener('hashchange',()=>{const p=new URLSearchParams(location.hash.slice(1));if(nodes[p.get('node')]){mode=['map','tree','read','recall','compare'].includes(p.get('mode'))?p.get('mode'):'tree';go(p.get('node'));modeUI();}});
    window.addEventListener('resize',()=>{if(!mobile()){$('layout').classList.remove('drawer-open');$('drawerBackdrop').hidden=true;document.body.style.overflow='';}renderTree(false);});
    if(window.ResizeObserver)new ResizeObserver(entries=>{const width=entries[0].contentRect.width+42;if(window.innerWidth>1100&&width>250){$('layout').style.setProperty('--directory-width',Math.min(520,width)+'px');}renderTree(false);}).observe($('directory'));
  }
  async function init(){
    try{
      const [m,t,e,w]=await Promise.all(['manifest.json','tree.json','environment-intro.json','water-pollution.json'].map(getJSON));manifest=m;nodes=t.nodes;content={...e,...w};
      const pref=load(PREFIX+'preferences',{}),params=new URLSearchParams(location.hash.slice(1));
      restore(params.get('subject')||pref?.subject);mode=params.get('mode')||pref?.mode||'map';if(!['map','tree','read','recall','compare'].includes(mode))mode='map';if(mode==='map'&&subject!=='environment-intro')mode='tree';
      for(const [id,n]of Object.entries(nodes)){const c=content[id];searchIndex.set(id,(n.title+' '+(c?.sourceText||'')+' '+(c?.contentBlocks||[]).map(b=>b.text||'').join(' ')).toLocaleLowerCase());}
      ready=true;bind();subjectUI();modeUI();const target=params.get('node');if(nodes[target])go(target,false);else{renderTree();renderReader();}
      if(['read','map'].includes(mode)&&!mobile())closeDirectory();
      msg(`环导原20章 · 水控12模块 · 所有展开互不影响；来源核对情况见“资料覆盖”。`);
      if('serviceWorker'in navigator){navigator.serviceWorker.register('../sw.js').then(()=>navigator.serviceWorker.ready).then(()=>msg('知识树和文字支持缓存后离线阅读；原图在首次查看后缓存。')).catch(()=>msg('当前未启用离线缓存；在线阅读可正常使用。'));}
    }catch(e){msg('知识资料加载失败：'+e.message+'。请使用HTTP预览，或联网后刷新重试。');const b=button('重新加载',()=>location.reload());$('readingBody').append(b);}
  }
  init();
})();
