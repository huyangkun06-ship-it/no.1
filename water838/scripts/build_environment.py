#!/usr/bin/env python3
"""Build the reviewed, source-bounded environment bundle from extraction audit.
Run extract_environment.py first. Stable IDs use source + chapter + section +
heading ordinal (not answer text); exercises have a separate namespace.
"""
import argparse, collections, hashlib, io, json, re
from pathlib import Path
import fitz
from PIL import Image

SITE=Path(__file__).resolve().parents[1]
NAMES=['绪论','全球环境问题','水环境','大气环境','土壤的组成和基本性质','固体废物与环境','物理环境','人口与环境','粮食生产与环境','能源与环境','自然资源的开发利用与环境','战争与环境','生态学基础','生物多样性','工业生态系统构建','农业生态系统','城市生态学系统保护','农村生态系统保护','生态文明理论与实践','可持续发展']
STARTS=[19,33,52,75,101,116,131,144,151,159,172,183,189,207,220,235,258,270,286,301,313]
NEWNAMES=NAMES[:];NEWNAMES[8]='食品生产与环境';NEWNAMES[11]='环境污染与公众健康';NEWNAMES[14:]=['工农业生态系统保护','城乡生态系统保护','生态文明理论与实践','可持续发展']
URLS={'original':'https://drive.google.com/file/d/1PU17frjos8-m8u2OiRKgXwy2QO-ofBgi/view','changes':'https://drive.google.com/file/d/11CjvWmrS4poAVMmBBWnsJPRCmD1-JkRJ/view'}
CN={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12}
def number(s): return int(s) if s.isdigit() else CN[s]
def compact(s):return re.sub(r'\s+','',s)
def canonical(s):return re.sub(r'[(（]\s*老\s*[)）]|[\s/：:，,。?？·—-]','',s).replace('的','')
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2))
def lines_of(audit,kind):
 out=[]
 for p in audit['pages']:
  if kind=='original' and p['page']<19: continue
  entries=[]
  for l in p['native']+p['ocr']:
   t=l['text'].strip();box=l['bbox'];cy=(box[1]+box[3])/2
   if box[1]<25 or box[3]>p['height']-30:continue
   if re.fullmatch(r'[-—.\s]*\d+[-—.\s]*',t):continue
   if re.search(r'环导通关攻略|本资料有效期|资料.{0,3}期至|Created by Notein',t):continue
   entries.append(dict(l,page=p['page']))
  # Merge title fragments and inline formula spans that share a visual baseline.
  entries.sort(key=lambda l:((l['bbox'][1]+l['bbox'][3])/2,l['bbox'][0]))
  rows=[]
  for l in entries:
   cy=(l['bbox'][1]+l['bbox'][3])/2
   if rows and abs(cy-rows[-1]['cy'])<4 and l['ocr']==rows[-1]['ocr']:
    rows[-1]['parts'].append(l)
   else: rows.append({'cy':cy,'ocr':l['ocr'],'parts':[l]})
  for r in rows:
   parts=sorted(r['parts'],key=lambda l:l['bbox'][0]);b=[min(x['bbox'][0] for x in parts),min(x['bbox'][1] for x in parts),max(x['bbox'][2] for x in parts),max(x['bbox'][3] for x in parts)]
   out.append({'text':' '.join(x['text'] for x in parts),'bbox':b,'page':p['page'],'ocr':r['ocr'],
               'confidence':min((x.get('confidence',100) for x in parts)), 'colors':list(set(c for x in parts for c in x.get('colors',[])))})
 return out

# New section order transcribed from the source's two image-only merge outlines.
KEEP15=[['工业生态学的定义','工业生态系统概念','工业生态系统的特征','工业生态系统的组成','工业生态系统与自然生态系统的相似性','工业生态系统的双重性的定义'],
 ['生态工业的定义','生态效率的定义','工业生态系统的构建措施','生态工业园的定义','生态工业园区特征','生态工业园的规划设计原则','生态工业园区的规划设计内容'],
 ['农业生态系统的概念/定义','生态农业的意义','农业生态系统的组成','农业生态系统的特点','农业生态的环境问题'],
 ['生态农业技术的概念','污染土壤生物修复技术','污染土壤物理修复技术','污染土壤化学/物化修复技术','污染土壤联合修复技术','水土流失','水土流失类型','水土流失成因','水土流失危害','水土流失的预防措施','生态农业的类型','生态农业十大模式','生态农业模式类型','世界生态农业发展趋势','中国生态农业的发展趋势分析']]
KEEP16=[['城市生态系统概念(老)','城市生态系统的功能(老)','城市生态系统特点(老)'],
 ['城市生态系统中各子系统存在的问题及解决措施(老)'],
 ['城市的园林绿化','城市生物多样性的概念','城市生物多样性保护的措施','宜居城市的构建(老)'],
 ['农村生态系统概念','农村生态系统的特点','农村生态系统的功能','农村生态系统存在的问题及保护'],
 ['生态系统健康','农业生态系统健康','城市生态系统健康','农村生态系统健康'],
 ['环境污染治理','生态经济建设','人居环境建设','农村人居环境规划内容','生态文化建设','生态文明村建设'],['生态村建设模式']]
SECTIONS15=['工业生态','生态工业','农业生态','生态农业'];SECTIONS16=['城市生态系统','城市生态系统存在的问题','城市生态系统的发展方向','农村生态系统','农村生态系统健康的基本内涵','生态村建设','生态村建设模式']

def make_record(kind,ch,section,category,title,ordinal,start,end,body):
 corrections={('original',58,'supp-1'):'河流遭到需氧有机污染物污染后BOD₅和DO（溶解氧）的变化规律',('original',59,'supp-2'):'氧垂曲线的定义及形成',('original',86,'supp-2'):'PM2.5的来源、成分、危害、对雾霾的贡献、治理思路',('original',93,'supp-5'):'逆温的类型',('original',135,'supp-1'):'噪声的几个重要的声学特性',('original',266,'supp-1'):'生态城市的概念'}
 title=corrections.get((kind,start['page'],ordinal),title)
 title=re.sub(r'^[：:、.\s]+','',title).strip();title=re.sub(r'\s*[(（]\s*老\s*[)）]','',title).strip()
 ident=f'{kind}|{ch}|{section}|{category}|{ordinal}|{canonical(title)}|{start["page"]}'
 rid='env838-'+hashlib.sha256(ident.encode()).hexdigest()[:16]
 text='\n'.join(l['text'] for l in body).strip()
 years=sorted(set(int(y) for y in re.findall(r'(?<!\d)((?:19|20)\d{2})\s*[(（]',text[:400])))
 meta=[];answer=[]
 for l in body:
  t=l['text']
  if '重要程度' in t or (re.match(r'^\s*(19|20)\d{2}\s*[(（]',t) and len(t)<150):meta.append(t);continue
  if re.fullmatch(r'[\s★☆【】\[\]：:()（）l1]+',t):continue
  answer.append(('[待核对] ' if l.get('ocr') and l.get('confidence',100)<70 else '')+t)
 years=sorted(set(int(y) for y in re.findall(r'(?<!\d)(?:19|20)\d{2}(?!\d)', ' '.join(meta))))
 stars=''.join(meta);m=re.search(r'[★☆]{5}',stars)
 review=[]
 if any(l['ocr'] for l in body+[start]):review.append('含图片OCR文字；低置信度及图表请以对应原图核对。')
 if not '\n'.join(answer).strip() and category!='exercise':review.append('文字未可靠识别；完整原图已保留。')
 if not '\n'.join(answer).strip() and category!='exercise':answer=['[待核对] 此处文字未能可靠识别，请查看本题对应原图。']
 rec={'id':rid,'subject':'环境学导论','chapter':f'第{ch}章 {NAMES[ch-1]}','originalChapter':f'第{ch}章 {NAMES[ch-1]}','originalChapterNumber':ch,
      'section':section,'originalSection':section,'category':category,'title':title,'question':title,'type':'简答题',
      'answer':'\n'.join(answer).strip(),'source':('环境学导论.pdf' if kind=='original' else '环导变动137718728584015123.1eae00877280d3e.pdf'),
      'sourceUrl':URLS[kind],'version':'shared' if kind=='original' else 'new','importance':m.group().count('★') if m else None,
      'pastExamYears':years,'needsReview':bool(review),'reviewReasons':review,'verified':False,'page':start['page'],
      'sourceRange':{'startPage':start['page'],'startY':round(start['bbox'][1],2),'endPage':end['page'],'endY':round(end['bbox'][1],2)},
      'sourceKind':kind,'originalOrdinal':ordinal,'sourceMetadata':meta,'history':[],'next':0,'interval':0,'star':False,'master':False}
 if category=='exercise':rec.update(answerKind='unavailable',answer='原资料仅列出题目，未提供参考答案。待核对。',needsReview=True,reviewReasons=['原题无配套答案，未编造答案。'])
 return rec

def original_records(lines):
 records=[];notes=[];current=None;ch=1;section='';ex=False;ordinal='';pending=None
 def finish(end):
  nonlocal current
  if current:
   records.append(make_record('original',current['ch'],current['section'],current['category'],current['title'],current['ordinal'],current['start'],end,current['body']));current=None
 for idx,l in enumerate(lines):
  t=l['text'];c=compact(t);page=l['page'];newch=max(k for k in range(1,21) if page>=STARTS[k-1])
  if page==177 and (idx==0 or lines[idx-1]['page']!=177):finish(l)
  if newch!=ch:finish(l);ch=newch;section='';ex=False
  if re.match(r'^第\d+章',c):finish(l);pending='chapter' if re.fullmatch(r'第\d+章',c) else None;continue
  if pending=='chapter':pending=None;continue
  sm=re.match(r'^第(\d+)节(.*)',c)
  if sm:
   finish(l);section=f'第{sm[1]}节 {sm[2]}'.strip();ex='课后习题' in c;continue
  if re.match(r'^(?:知识点\d+)?课后习题$',c):finish(l);ex=True;section='课后习题';continue
  hm=re.match(r'^(补充知识点|知识点)\s*(\d+)\s*[：:、.;；]?\s*(.*)',t)
  if not hm:hm=re.match(r'^(补充知识点|知识点)(\d+)[：:、.;；]?(.*)',c)
  if hm and not re.match(r'^知识点\s*\d+、',t):
   finish(l);ex=False;title=hm[3].strip()
   if not title:
    nxt=lines[idx+1];title=nxt['text'];pending='title'
   current={'ch':ch,'section':section,'category':'knowledge','title':title,'ordinal':('supp-' if hm[1].startswith('补') else '')+hm[2], 'start':l,'body':[]};continue
  if pending=='title':pending=None;continue
  em=re.match(r'^(\d+)\s*[.．、]\s*(.+)',t)
  if ex and em:
   finish(l);current={'ch':ch,'section':section,'category':'exercise','title':em[2],'ordinal':em[1],'start':l,'body':[]};continue
  if current:
   if current['category']=='exercise':current['title']+=t
   else:current['body'].append(l)
  else:notes.append(l)
 finish({'page':312,'bbox':[0,798,0,0]})
 return records,notes

def change_records(lines):
 records=[];current=None;ch=2;section='第1节 全球环境问题';exercise=False;ordinal=0;pending=False
 def finish(end):
  nonlocal current
  if current:
   r=make_record('changes',current['ch'],current['section'],current['category'],current['title'],current['ordinal'],current['start'],end,current['body'])
   records.append(r);current=None
 for idx,l in enumerate(lines):
  t=l['text'];c=compact(t)
  if l['page']>=31:finish(l);break
  if c.startswith(('新书第九','书上第九','新书第12')):finish(l);continue
  if re.match(r'^(新增)?第[一二三四五六七八九十\d]+章',c) or re.match(r'^新增第3节',c):
   # Introductory prose is deliberately not interpreted as headings.
   if c.startswith(('新书第九','新书第12')):continue
   finish(l);exercise=False;pending=False
   if '第3节' in c:section='第3节 畜产养殖与环境'
   else:
    m=re.match(r'^(?:新增)?第([一二三四五六七八九十\d]+)章',c)
    if not m:continue
    ch=number(m[1]);sm=re.search(r'第([一二三四五六七八九十\d]+)节',c)
    if sm:section=f'第{number(sm[1])}节'
    else:section=''
    if '课后习题' in c:exercise=True;section='课后习题';ordinal=0
   continue
  if c.startswith('第4节环境污染'):finish(l);section='第4节 环境污染的健康风险评价方法';continue
  if c.startswith('新增知识点') and ch==10:
   finish(l);pending=True
   title=re.sub(r'^新增知识点\s*','',t).strip()
   if title:
    pending=False;current={'ch':ch,'section':section,'category':'supplement','title':title,'ordinal':'energy','start':l,'body':[]}
   continue
  hm=re.match(r'^知识点\s*(\d*)\s*(.*)',t)
  if hm or (pending and ch==10):
   finish(l);exercise=False
   if pending:title=t;ordval='energy';pending=False
   else:
    title=hm[2].strip();ordval=hm[1] or canonical(title)
    if not title:title=lines[idx+1]['text'];pending='title'
   current={'ch':ch,'section':section,'category':'supplement','title':title,'ordinal':ordval,'start':l,'body':[]};continue
  if pending=='title':pending=False;continue
  if exercise and re.match(r'^[•●]',t):
   finish(l);ordinal+=1;current={'ch':ch,'section':section,'category':'exercise','title':re.sub(r'^[•●]\s*','',t),'ordinal':str(ordinal),'start':l,'body':[]};continue
  if current:
   if current['category']=='exercise':current['title']+=t
   else:current['body'].append(l)
 return records

def map_versions(records):
 for r in records:
  ch=r['originalChapterNumber'];newch=ch if ch<16 else {16:15,17:16,18:16,19:17,20:18}[ch]
  if r['sourceKind']=='changes':
   if ch==7 and 'CO2' in r['title'].replace('₂','2'):
    newch=4;r['reviewReasons'].append('变动PDF标为第七章第二节；按CO₂治理内容映射至大气环境第四节，需核对原书。');r['section']='第4节 大气污染防治'
   if ch==8 and '粮食安全' in r['title']:
    newch=9;r['reviewReasons'].append('变动PDF第16页标为第八章；按粮食安全主题映射至食品生产与环境，需核对原书。');r['section']='第1节'
   if ch==5 and r['title']=='重金属污染的防治':r['section']='第4节 土壤污染的防治与修复'
  r['chapter']=f'第{newch}章 {NEWNAMES[newch-1]}';r['chapterNumber']=newch
  if r['sourceKind']=='original':
   if ch==12:r['version']='removed';r['versionReason']='变动PDF第1、28页明确整章替换。'
   if ch==9 and r['category']=='knowledge' and r['originalOrdinal'] in [str(i) for i in range(4,11)]:r['version']='original-only';r['versionReason']='变动PDF第17页：原知识点4—10改为旧版补充。'
   if ch in [15,16,17,18] and r['category']=='knowledge':
    keep=KEEP15 if ch in [15,16] else KEEP16;names=SECTIONS15 if ch in [15,16] else SECTIONS16
    found=next(((i,j) for i,g in enumerate(keep) for j,title in enumerate(g) if canonical(title)==canonical(r['title'])),None)
    if found:
     i,j=found;r['section']=f'第{i+1}节 {names[i]}';r['newSectionOrder']=i+1;r['newPointOrder']=j+1
    else:r['version']='removed';r['versionReason']='未列入变动PDF第31—32页新版知识点保留清单；原内容与真题信息保留。'
  if ch==8 and r['sourceKind']=='original':r['reviewReasons'].append('变动资料说明人口章已重写，但未给出这些知识点的完整新版正文；此处保留原资料，需核对新版教材。')
  r['needsReview']=bool(r['reviewReasons'])

def deduplicate(records):
 result=[];log=[]
 for r in records:
  # Same chapter/category/angle only. Source exercises never merge with knowledge.
  if r['sourceKind']=='original' and r['page']==178 and r['title']=='土地资源利用存在的问题及处置措施':
   old=next((x for x in result if x['page']==176 and x['title']==r['title']),None)
   if old:
    result.remove(old);r.setdefault('additionalSources',[]).append({'source':old['source'],'page':old['page'],'sourceRange':old['sourceRange']})
    log.append({'removedId':old['id'],'keptId':r['id'],'reason':'原PDF175—176与177—178页重复排版；采用后者含179页处置措施的完整正文'})
  matches=[x for x in result if x['chapterNumber']==r['chapterNumber'] and x['category']==r['category'] and canonical(x['title'])==canonical(r['title']) and (x['section']==r['section'] or r['sourceKind']=='changes')]
  same=next((x for x in matches if compact(x['answer'])==compact(r['answer']) and x['category']!='exercise'),None)
  if same:
   same.setdefault('additionalSources',[]).append({'source':r['source'],'page':r['page'],'sourceRange':r['sourceRange']});same['pastExamYears']=sorted(set(same['pastExamYears']+r['pastExamYears']))
   log.append({'removedId':r['id'],'keptId':same['id'],'reason':'同章同类同标题，正文相同'});continue
  if r['sourceKind']=='changes' and r['category']=='supplement':
   for old in result:
    if old['sourceKind']=='original' and old['category']=='knowledge' and old['chapterNumber']==r['chapterNumber'] and canonical(old['title'])==canonical(r['title']):
     old['version']='replaced';old['replacedBy']=r['id'];r.setdefault('replaces',[]).append(old['id']);r['pastExamYears']=sorted(set(r['pastExamYears']+old['pastExamYears']))
  # An identical original + revised exercise is one exercise with both source refs.
  if r['category']=='exercise' and r['sourceKind']=='changes':
   same=next((x for x in matches if canonical(x['title'])==canonical(r['title'])),None)
   if same:
    same.setdefault('additionalSources',[]).append({'source':r['source'],'page':r['page'],'sourceRange':r['sourceRange']});log.append({'removedId':r['id'],'keptId':same['id'],'reason':'同章同原题的两份来源合并，题目仍独立保留'});continue
  result.append(r)
 return result,log

def compile_exercises(records):
 # Explicitly reviewed exercise -> textbook heading links. Content is verbatim;
 # no language-model completion of missing facts or open-ended examples.
 links={
 (1,'1'):['环境的概念','环境的几个特点'],
 (1,'4'):['环境问题的六大特点','环境问题的实质'],
 (1,'5'):['环境学研究的主要内容','基本任务'],
 (1,'6'):['环境容量与环境承载力'],
 (3,'1'):['水循环的定义和作用','社会水循环'],
 (3,'2'):['水污染物'],(3,'6'):['水污染控制技术'],
 (6,'1'):['固体废物的定义'],(6,'2'):['固体废物的危害'],(6,'3'):['固废处理的三化原则'],
 (7,'1'):['噪声的定义'],(7,'3'):['热污染的定义','热污染对环境的影响'],
 (7,'4'):['电磁辐射对人体健康的危害'],(7,'5'):['光污染的危害'],
 (8,'1'):['世界人口增长的特点'],(8,'2'):['人口增长对环境产生的影响'],
 (8,'3'):['我国人口的现状和特点'],(8,'4'):['解决人口问题的主要对策'],
 (9,'2'):['我国粮食安全现状'],(13,'5'):['生态系统的稳定性'],
 (14,'1'):['生物多样性的概念'],(18,'2'):['农村生态系统的功能'],
 (18,'3'):['农村生态系统存在的问题及保护'],(18,'4'):['农村生态系统存在的问题及保护'],
 (19,'1'):['生态文明的含义']}
 for r in records:
  titles=links.get((r['originalChapterNumber'],r['originalOrdinal'])) if r['category']=='exercise' and r['sourceKind']=='original' else None
  if not titles:continue
  refs=[]
  for title in titles:
   candidates=[x for x in records if x['category']!='exercise' and canonical(x['title'])==canonical(title)]
   candidates.sort(key=lambda x:(x['version'] in ['removed','replaced','original-only'],x['chapterNumber']!=r['chapterNumber']))
   if not candidates:break
   refs.append(candidates[0])
  if len(refs)!=len(titles):continue
  r['answerKind']='compiled';r['answer']='整理答案（按教材对应知识点摘录）：\n\n'+'\n\n'.join(x['title']+'：\n'+x['answer'] for x in refs)
  r['references']=[{'id':x['id'],'title':x['title'],'source':x['source'],'page':x['page']} for x in refs]
  r['reviewReasons']=['根据所列知识点摘录整理，未逐题人工审定。'];r['needsReview']=True

def excerpts(records,docs):
 for r in records:
  region=r['sourceRange'];doc=docs[r['sourceKind']];out=[]
  for pg in range(region['startPage'],region['endPage']+1):
   page=doc[pg-1];y0=region['startY']-2 if pg==region['startPage'] else 25
   y1=region['endY']-3 if pg==region['endPage'] else page.rect.height-48
   if y1-y0<8:continue
   clip=fitz.Rect(50,max(25,y0),page.rect.width-35,min(page.rect.height-42,y1))
   if clip.is_empty:continue
   target=SITE/'assets/environment'/f"{r['id']}-{pg}.webp"
   if not target.exists():
    pix=page.get_pixmap(matrix=fitz.Matrix(1.65,1.65),clip=clip)
    Image.open(io.BytesIO(pix.tobytes('png'))).save(target,'WEBP',quality=77)
   out.append({'page':pg,'src':'./assets/environment/'+target.name})
  r['excerpts']=out
  has_image=False
  for pg in range(region['startPage'],region['endPage']+1):
   top=region['startY'] if pg==region['startPage'] else 25
   bottom=region['endY'] if pg==region['endPage'] else docs[r['sourceKind']][pg-1].rect.height-42
   for im in docs[r['sourceKind']][pg-1].get_image_info():
    b=im['bbox']
    if top<b[1]<bottom and b[2]-b[0]>12 and b[3]-b[1]>9:has_image=True
  if has_image and r['sourceKind']=='original' and r['category']!='exercise':
   r['reviewReasons'].append('含图片、公式或图示星级；无法可靠转写的位置请结合对应原图核对。');r['needsReview']=True

def main():
 a=argparse.ArgumentParser();a.add_argument('--work',type=Path,required=True);a.add_argument('--original',required=True);a.add_argument('--changes',required=True);args=a.parse_args()
 audits={k:json.loads((args.work/(k+'-pages.json')).read_text()) for k in ['original','changes']}
 lines={k:lines_of(v,k) for k,v in audits.items()}
 for k,v in lines.items():dump(args.work/(k+'-lines.json'),v)
 original,notes=original_records(lines['original']);changes=change_records(lines['changes'])
 map_versions(original+changes);records,merges=deduplicate(original+changes)
 # Duplicate source headings with differing bodies remain versioned, never concatenated.
 seen=collections.defaultdict(list)
 for r in records:seen[(r['chapterNumber'],r['section'],r['category'],canonical(r['title']),r['version'])].append(r)
 for group in seen.values():
  if len(group)>1:
   for r in group:r['reviewReasons'].append('同章同节同标题存在不同正文，保留来源并待人工判定。');r['needsReview']=True
 compile_exercises(records)
 docs={'original':fitz.open(args.original),'changes':fitz.open(args.changes)};excerpts(records,docs)
 records.sort(key=lambda r:(r['chapterNumber'],r.get('newSectionOrder',999) if 15<=r['chapterNumber']<=16 and r['category']!='exercise' else 999,r.get('newPointOrder',999),0 if r['sourceKind']=='original' else 1,r['page'],r['sourceRange']['startY']))
 stats={'originalWebsiteQuestions':211,'firstPdfKnowledge':sum(x['category']=='knowledge' for x in original),'firstPdfExercises':sum(x['category']=='exercise' for x in original),'secondPdfKnowledge':sum(x['category']=='supplement' for x in changes),'secondPdfExercises':sum(x['category']=='exercise' for x in changes),'oldRemovedOrReplaced':sum(x['version'] in ['removed','replaced','original-only'] for x in records),'deduplicated':len(merges),'environmentTotal':len(records),'mergedTotal':211+len(records),'needsReview':sum(x['needsReview'] for x in records),'originalWebsiteNeedsReview':211}
 mapping=[{'originalChapter':i+1,'originalTitle':NAMES[i],'newChapter':i+1 if i<15 else {16:15,17:16,18:16,19:17,20:18}[i+1],'newTitle':NEWNAMES[i] if i<15 else NEWNAMES[{16:15,17:16,18:16,19:17,20:18}[i+1]-1],'status':'replaced' if i==11 else 'mapped'} for i in range(20)]
 gaps=[{'source':'changes','page':28,'reason':'第12章第1—3节仅列标题，作者明确未收录正文；未生成虚构知识点。'}, {'source':'changes','page':1,'reason':'人口章重写、低生育/三孩政策等仅在变动说明提及，未给出逐点新版正文；原知识点保留并需对新版教材复核。'}, {'source':'changes','page':30,'reason':'健康风险评价MES说明称L取决于E和S，与所列公式M·E·S不一致；原文保留待核对。'}]
 for r in records:
  if r['title']=='健康风险评价常见方法':r['reviewReasons'].append(gaps[-1]['reason']);r['needsReview']=True
 stats['needsReview']=sum(x['needsReview'] for x in records);stats['totalNeedsReview']=211+stats['needsReview']
 bundle={'schemaVersion':1,'sources':[{k:v for k,v in x.items() if k!='pages'} for x in audits.values()],'chapterMapping':mapping,'statistics':stats,'mergeLog':merges,'sourceGaps':gaps,'items':records}
 dump(SITE/'data/environment.json',bundle)
 raw=json.dumps(records,ensure_ascii=False,separators=(',',':'));version='environment-'+hashlib.sha256(raw.encode()).hexdigest()[:12]
 (SITE/'data/environment.js').write_text('"use strict";\nconst ENVIRONMENT_VERSION='+json.dumps(version)+';\nconst ENVIRONMENT_SEED='+raw+';\n')
 dump(SITE/'data/environment-audit.json',{'statistics':stats,'chapterMapping':mapping,'mergeLog':merges,'sourceGaps':gaps,'reviewItems':[{'id':x['id'],'title':x['title'],'source':x['source'],'page':x['page'],'reasons':x['reviewReasons']} for x in records if x['needsReview']]})
 dump(args.work/'chapter-notes.json',notes)
 (args.work/'titles.tsv').write_text('\n'.join(f"{x['id']}\t{x['originalChapterNumber']}\t{x['chapter']}\t{x['section']}\t{x['category']}\t{x['page']}\t{x['title']}\t{x['version']}\t{len(x['answer'])}" for x in records))
 print(json.dumps(stats,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
