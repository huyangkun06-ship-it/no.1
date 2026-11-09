#!/usr/bin/env python3
"""Apply explicit, source-linked exercise answers. No network or generation.
Run standalone to refresh an existing bundle, or from build_environment.py.
"""
import hashlib,json
from pathlib import Path
SITE=Path(__file__).resolve().parents[1]
PREVIOUS='原资料仅列出题目，未提供参考答案。待核对。'
STARTS=[19,33,52,75,101,116,131,144,151,159,172,183,189,207,220,235,258,270,286,301]

def apply_additions(records):
 p=SITE/'data/exercise-answer-additions.json'
 if not p.exists():return
 additions=json.loads(p.read_text());byid={x['id']:x for x in records}
 assert len(additions['items'])==114
 for entry in additions['items']:
  q=byid[entry['id']];assert q['category']=='exercise' and q['question']==entry['question']
  q['answer']=entry['answer'];q['answerKind']='compiled';q['answerRevision']=additions['revision']
  q['answerSources']=[{'title':'环境学导论：对应章节知识点','url':'https://drive.google.com/file/d/1PU17frjos8-m8u2OiRKgXwy2QO-ofBgi/view#page='+str(STARTS[q['originalChapterNumber']-1])}]
  q['answerSources'] += [additions['sources'][k] for k in entry['sourceKeys']]
  q['reviewReasons']=[entry['reviewNote']] if entry.get('reviewNote') else []
  q['needsReview']=bool(q['reviewReasons']);q['verified']=False
  q['answerStatus']='教材与公开资料整理，非原书标准答案'
 assert all(x['answerKind']=='compiled' for x in records if x['category']=='exercise')

def write_js(records):
 raw=json.dumps(records,ensure_ascii=False,separators=(',',':'))
 version='environment-'+hashlib.sha256(raw.encode()).hexdigest()[:12]
 updates={x['id']:{'previousAnswer':PREVIOUS,'revision':x['answerRevision']} for x in records if x.get('answerRevision')}
 (SITE/'data/environment.js').write_text('"use strict";\nconst ENVIRONMENT_VERSION='+json.dumps(version)+';\nconst ENVIRONMENT_SEED='+raw+';\nconst ENVIRONMENT_ANSWER_UPDATES='+json.dumps(updates,ensure_ascii=False,separators=(',',':'))+';\n')

def refresh():
 p=SITE/'data/environment.json';bundle=json.loads(p.read_text());apply_additions(bundle['items'])
 stats=bundle['statistics'];stats['needsReview']=sum(q['needsReview'] for q in bundle['items']);stats['totalNeedsReview']=211+stats['needsReview']
 stats['exerciseAnswersCompiled']=139;stats['exerciseAnswersResearched']=114;stats['exerciseAnswersUnavailable']=0
 p.write_text(json.dumps(bundle,ensure_ascii=False,indent=2));write_js(bundle['items'])
 audit=json.loads((SITE/'data/environment-audit.json').read_text());audit['statistics']=stats
 audit['reviewItems']=[{'id':q['id'],'title':q['title'],'source':q['source'],'page':q['page'],'reasons':q['reviewReasons']} for q in bundle['items'] if q['needsReview']]
 (SITE/'data/environment-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
 print(json.dumps(stats,ensure_ascii=False))
if __name__=='__main__':refresh()
