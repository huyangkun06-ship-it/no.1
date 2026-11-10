#!/usr/bin/env python3
"""OCR source pages and up to four continuation pages for the 211 water questions."""
import argparse,concurrent.futures,json
from pathlib import Path
import fitz
from extract_environment import ocr_job

def main():
 a=argparse.ArgumentParser();a.add_argument('--pdf',required=True);a.add_argument('--work',type=Path,required=True);a.add_argument('--tessdata');a.add_argument('--workers',type=int,default=6);args=a.parse_args()
 site=Path(__file__).resolve().parents[1];html=(site/'index.html').read_text()
 seed=json.loads(html.split('const FULL_SEED=')[1].split(';const BUNDLE_VERSION=')[0])
 doc=fitz.open(args.pdf);pages=sorted({p for q in seed for p in range(q['page'],min(len(doc),q['page']+4)+1)})
 cache=args.work/'ocr';cache.mkdir(parents=True,exist_ok=True);jobs=[]
 for n in pages:
  page=doc[n-1];clip=fitz.Rect(55,35,page.rect.width-55,page.rect.height-50)
  pix=page.get_pixmap(matrix=fitz.Matrix(1.25,1.25),clip=clip)
  jobs.append((n,(f'water-{n}',pix.tobytes('png'),list(clip),cache,args.tessdata)))
 result={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
  futures={pool.submit(ocr_job,job):n for n,job in jobs}
  for i,f in enumerate(concurrent.futures.as_completed(futures),1):
   result[futures[f]]=f.result()
   if i%20==0:print(i,'/',len(jobs),flush=True)
 (args.work/'pages.json').write_text(json.dumps(result,ensure_ascii=False))
 print('Extracted',len(result),'source/continuation pages from',len(doc),'PDF pages')
if __name__=='__main__':main()
