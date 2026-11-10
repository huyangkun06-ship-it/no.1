#!/usr/bin/env python3
"""Map the preserved 211 OCR questions to scanned PDF excerpts.
Requires PyMuPDF/Pillow; OCR audit uses extract_environment.ocr_job TSV boxes.
Run with --pdf original.pdf --ocr pages.json. Low confidence matches stop build.
"""
import argparse,collections,difflib,hashlib,io,json,re,unicodedata
from pathlib import Path
import fitz
from PIL import Image
SITE=Path(__file__).resolve().parents[1]
def norm(t):
 t=unicodedata.normalize('NFKC',t)
 return re.sub(r'[^\u3400-\u9fffA-Za-z0-9]','',t).lower()
def text_start(t):return re.sub(r'^\s*\d{1,2}(?:\s*[.．、)）:]\s*|\s+)','',t)
def similarity(a,b):
 if not a or not b:return 0
 return sum(w*difflib.SequenceMatcher(None,a[:n],b[:min(n,len(a))]).ratio() for n,w in [(20,.5),(40,.3),(80,.2)])
def question_score(q,ls,j):
 title=norm(re.split(r'[\[【]',q['question'])[0]);scores=[]
 for k in [1,2,3]:
  text=''.join(x['text'] for x in ls[j:j+k]);scores.append(similarity(title,norm(text_start(text))))
 return max(scores)
def next_boundary(ls,j):
 t=ls[j]['text'].strip();following=''.join(x['text'] for x in ls[j:j+3])
 if re.search(r'复习笔记|课后习题详解|考研真题详解',t):return True
 if re.match(r'^第\s*[一二三四五六七八九十\d]+\s*章',t):return True
 if re.fullmatch(r'[一二三四五六七八九十、.\s]*(?:选择题|填空题|名词解释|简答题|论述题|计算题)[：:\s]*',t):return True
 m=re.match(r'^\s*\d{1,2}\s*[.．、]\s*(?!\d)(.+)',t)
 gap=ls[j]['bbox'][1]-ls[j-1]['bbox'][3] if j else 99
 return bool(m and gap>=10 and ('?' in following or '？' in following or re.search(r'简述|试述|试论|分析|比较|解释|为什么|如何|有哪些|是什么|计算|求出|说明|叙述|画出|某[市厂河]',m[1])))
def main():
 a=argparse.ArgumentParser();a.add_argument('--pdf',required=True);a.add_argument('--ocr',required=True);a.add_argument('--dry-run',action='store_true');args=a.parse_args()
 html=(SITE/'index.html').read_text();seed=json.loads(html.split('const FULL_SEED=')[1].split(';const BUNDLE_VERSION=')[0]);D=fitz.open(args.pdf)
 pages={int(p):sorted(ls,key=lambda l:(l['bbox'][1],l['bbox'][0])) for p,ls in json.load(open(args.ocr)).items()}
 groups=collections.defaultdict(list)
 for q in seed:groups[q['page']].append(q)
 starts={};audit=[]
 for pg,qs in groups.items():
  ls=pages[pg];n=len(ls);scores=[[question_score(q,ls,j) for j in range(n)] for q in qs]
  def rank(row,j):
   header=bool(re.match(r'^\s*\d{1,2}(?:\s*[.．、)）:]|\s+)',ls[j]['text']))
   answer_follows=j+1<n and bool(re.match(r'^\s*(?:答|【答案)',ls[j+1]['text']))
   return row[j]+.025*header+.025*answer_follows
  best=[max(range(n),key=lambda j:rank(row,j)) for row in scores]
  for i,(q,j) in enumerate(zip(qs,best)):
   starts[q['id']]={'page':pg,'index':j,'y':round(ls[j]['bbox'][1],2),'score':round(scores[i][j],3),'ocr':ls[j]['text']}
 # Reviewed boundary/title corrections are source coordinates, never fabricated OCR.
 overrides_path=SITE/'data/water-excerpt-overrides.json'
 overrides=json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
 for q in seed:
  if q['id'] in overrides and 'startY' in overrides[q['id']]:
   x=overrides[q['id']];starts[q['id']].update(page=x.get('page',q['page']),y=x['startY'],score=1.,ocr='人工核对原图定位')
 for i,q in enumerate(seed):
  start=starts[q['id']];pg=start['page'];y=start['y'];end=None
  later=[v for k,v in starts.items() if (v['page'],v['y'])>(pg,y+1) and not overrides.get(k,{}).get('recordFragment')]
  following=min(later,key=lambda v:(v['page'],v['y'])) if later else None
  for pn in range(pg,min(pg+4,len(D))+1):
   for j,l in enumerate(pages.get(pn,[])):
    ly=l['bbox'][1]
    if pn==pg and ly<=y+8:continue
    if following and (pn,ly)>=(following['page'],following['y']-1):
     end=(following['page'],following['y']);break
    if next_boundary(pages[pn],j):end=(pn,ly);break
   if end:break
  if not end:
   # Use the actual answer tail to avoid including the following chapter.
   tail=norm(re.sub(r'第\d+/\d+页','',q['answer']))[-70:];candidates=[]
   for pn in range(pg,min(pg+4,len(D))+1):
    ls=pages.get(pn,[])
    for j,l in enumerate(ls):
     if pn==pg and l['bbox'][1]<y:continue
     joined=norm(''.join(x['text'] for x in ls[max(0,j-3):j+1]))
     score=difflib.SequenceMatcher(None,tail,joined[-len(tail):]).ratio() if tail else 0
     candidates.append((score,pn,l['bbox'][3]+8))
   match=max(candidates,default=(0,pg,D[pg-1].rect.height-50))
   end=(match[1],match[2]) if match[0]>.65 else (pg,D[pg-1].rect.height-50)
  if q['id'] in overrides and 'endPage' in overrides[q['id']]:
   o=overrides[q['id']];end=(o['endPage'],o['endY'])
  rec={'locationNote':overrides.get(q['id'],{}).get('note',''),'recordFragment':overrides.get(q['id'],{}).get('recordFragment',False),'id':q['id'],'title':q['question'],'page':pg,'sourceRange':{'startPage':pg,'startY':y,'endPage':end[0],'endY':round(end[1],2)},'matchScore':start['score'],'matchedLine':start['ocr'],'excerpts':[]}
  for pn in range(pg,end[0]+1):
   top=y-5 if pn==pg else 45;bottom=end[1]-5 if pn==end[0] else D[pn-1].rect.height-50
   if bottom-top<10:continue
   target=SITE/'assets/water'/f"{q['id']}-{pn}.webp"
   rec['excerpts'].append({'page':pn,'printedPage':pn-1,'src':'./assets/water/'+target.name})
   if not args.dry_run:
    clip=fitz.Rect(75,max(35,top),D[pn-1].rect.width-65,min(bottom,D[pn-1].rect.height-45))
    pix=D[pn-1].get_pixmap(matrix=fitz.Matrix(1.4,1.4),clip=clip)
    Image.open(io.BytesIO(pix.tobytes('png'))).save(target,'WEBP',quality=86)
  audit.append(rec)
 out=Path(args.ocr).parent/'matches.json';out.write_text(json.dumps(audit,ensure_ascii=False,indent=2))
 print('questions',len(audit),'images',sum(len(x['excerpts']) for x in audit))
 for r in audit:
  if r['matchScore']<.65:print('REVIEW',r['id'],r['page'],r['matchScore'],r['title'][:40],repr(r['matchedLine']))
 if args.dry_run:return
 assert len(audit)==211 and all(x['excerpts'] for x in audit)
 assert all(x['matchScore']>=.65 for x in audit),'Review uncertain starts before publishing'
 bundle={'version':'water-images-'+hashlib.sha256(json.dumps(audit,ensure_ascii=False).encode()).hexdigest()[:12],'source':{'name':'电子版水控辅助教辅.pdf','url':'https://drive.google.com/file/d/1WTmRkDTVCt8E8jOl35EtkEe0UWXHWeM7/view','sha256':hashlib.sha256(Path(args.pdf).read_bytes()).hexdigest(),'pages':len(D),'pageNumberNote':'PDF实际页码比书内页脚大1'},'items':{r['id']:r for r in audit}}
 (SITE/'data/water-excerpts.json').write_text(json.dumps(bundle,ensure_ascii=False,indent=2))
 (SITE/'data/water-excerpts.js').write_text('"use strict";\nconst WATER_SOURCE_EXCERPTS='+json.dumps(bundle,ensure_ascii=False,separators=(',',':'))+';\n')
if __name__=='__main__':main()
