#!/usr/bin/env python3
"""Source-aware extraction. Requires PyMuPDF, Pillow, tesseract chi_sim+eng.

PDFs remain local. Cache is disposable; native text, OCR boxes, confidence and
image locations are retained for reproducibility. No generated factual answers.
"""
import argparse, concurrent.futures, csv, hashlib, io, json, os, re, subprocess
from pathlib import Path
import fitz
from PIL import Image

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2))

def ocr_job(job):
    key, png, box, cache, tessdata = job
    target = cache / (key + '-tsv2.json')
    if target.exists(): return json.loads(target.read_text())
    args = ['tesseract', 'stdin', 'stdout', '-l', 'chi_sim+eng', '--psm', '3']
    if tessdata: args += ['--tessdata-dir', tessdata]
    env = dict(os.environ, OMP_THREAD_LIMIT='1')
    out = subprocess.run(args + ['-c', 'tessedit_create_tsv=1'], input=png, capture_output=True, check=True, env=env).stdout.decode()
    groups = {}
    scale = Image.open(io.BytesIO(png)).width / (box[2]-box[0])
    header = out.find('level\tpage_num\t')
    if header < 0:
        # Tesseract emits no TSV for an empty/decorative crop. The source image
        # remains in the page audit and in question excerpts; never invent text.
        dump(target, [])
        return []
    out = out[header:]
    for r in csv.DictReader(io.StringIO(out), delimiter='\t', quoting=csv.QUOTE_NONE):
        if r['level'] != '5' or not r['text'].strip(): continue
        k = (r['block_num'], r['par_num'], r['line_num'])
        groups.setdefault(k, []).append(r)
    lines = []
    for words in groups.values():
        x = min(int(w['left']) for w in words); y = min(int(w['top']) for w in words)
        right = max(int(w['left'])+int(w['width']) for w in words)
        bottom = max(int(w['top'])+int(w['height']) for w in words)
        text = ' '.join(w['text'] for w in words)
        text = re.sub(r'(?<=[\u3400-\u9fff]) (?=[\u3400-\u9fff])', '', text)
        lines.append({'text':text, 'bbox':[box[0]+x/scale,box[1]+y/scale,box[0]+right/scale,box[1]+bottom/scale],
                      'ocr':True, 'confidence':round(sum(float(w['conf']) for w in words)/len(words),1)})
    dump(target, lines)
    return lines

def prepare(path, kind, cache, tessdata, workers):
    doc=fitz.open(path); pages=[]; jobs=[]
    for i,p in enumerate(doc):
        native=[]; images=[]
        for b in p.get_text('dict')['blocks']:
            if b['type']==0:
                for l in b['lines']:
                    spans=l['spans']; text=''.join(s['text'] for s in spans).strip()
                    if text: native.append({'text':text,'bbox':list(l['bbox']), 'ocr':False,
                                            'colors':list(set(s['color'] for s in spans)),
                                            'size':max(s['size'] for s in spans)})
            elif b['type']==1:
                box=list(b['bbox']); w=box[2]-box[0]; h=box[3]-box[1]
                # Changes pages contain a repeated watermark and Notein footer.
                if kind=='changes' and ((b['width'],b['height']) in [(2000,1125),(563,120)] or b['width']<10): continue
                if kind=='original' and i<18: continue
                images.append(box)
                if w>110 and h>30:
                    clip=fitz.Rect(box)&p.rect
                    pix=p.get_pixmap(matrix=fitz.Matrix(2.7,2.7),clip=clip)
                    key=f'{kind}-{i+1}-{len(images)}'
                    jobs.append((i,(key,pix.tobytes('png'),list(clip),cache,tessdata)))
        pages.append({'page':i+1,'width':p.rect.width,'height':p.rect.height,'native':native,'images':images,'ocr':[]})
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures={executor.submit(ocr_job,j):i for i,j in jobs}
        for count,f in enumerate(concurrent.futures.as_completed(futures),1):
            pages[futures[f]]['ocr'].extend(f.result())
            if count%20==0: print(kind,'OCR',count,'/',len(jobs),flush=True)
    for p in pages:
        # Images sometimes have a searchable OCR overlay. Prefer its native text.
        p['ocr']=[l for l in p['ocr'] if not any((fitz.Rect(l['bbox'])&fitz.Rect(n['bbox'])).get_area()>fitz.Rect(l['bbox']).get_area()*.45 for n in p['native'])]
    return {'source':Path(path).name,'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),
            'pageCount':len(doc),'pagesWithSparseText':[p['page'] for p in pages if sum(len(l['text']) for l in p['native'])<50],
            'ocrImageRegions':len(jobs),'pages':pages}

def main():
    a=argparse.ArgumentParser();a.add_argument('--original',required=True);a.add_argument('--changes',required=True)
    a.add_argument('--work',type=Path,default=Path('work/environment'));a.add_argument('--tessdata');a.add_argument('--workers',type=int,default=4)
    args=a.parse_args(); cache=args.work/'cache';cache.mkdir(parents=True,exist_ok=True)
    for kind in ['original','changes']:
        result=prepare(getattr(args,kind),kind,cache,args.tessdata,args.workers)
        dump(args.work/(kind+'-pages.json'),result)
        print(kind,result['pageCount'],'pages',result['ocrImageRegions'],'OCR regions',flush=True)
if __name__=='__main__':main()
