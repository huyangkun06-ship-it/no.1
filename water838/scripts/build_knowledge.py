#!/usr/bin/env python3
"""Deterministic, additive knowledge build. Never writes the original banks.

Primary water snapshot is the complete Drive readable-text response, NOT page
OCR verification. Unreviewed extraction is kept as sourceText, never promoted
to a reference answer. Re-run after editing knowledge/data/editorial.json.
"""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
DEST = SITE / 'knowledge/data'
SUBJECTS = ['environment-intro', 'water-pollution']
WATER_CHAPTERS = [
    '污水水质与处理目标', '物理预处理与固液分离', '生物处理基础与氧传递',
    '活性污泥法', '生物膜法', '生物脱氮除磷', '厌氧与自然生态处理',
    '化学与物理化学处理', '深度处理与污水回用', '污泥处理与最终处置',
    '工业废水与污水厂工程管理', '工艺对比与设计计算专题',
]

def read(p):
    return json.loads(p.read_text())

def digest(s):
    return hashlib.sha256(s.encode()).hexdigest()[:14]

def write(name, obj):
    (DEST / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

def outline(text):
    """Hints are source-derived short clauses; full text lives separately."""
    parts = re.split(r'\n(?=[①-⑳一二三四五六七八九十（(\d])|(?=[①-⑳])', text)
    labels = []
    for p in parts:
        p = re.sub(r'^[\s①-⑳一二三四五六七八九十、.：:（）()\d]+', '', p).strip()
        if not p:
            continue
        first = re.split(r'[。；;\n：:]', p)[0]
        if len(first) > 28:
            first = first[:24] + '…'
        if first and first not in labels:
            labels.append(first)
    return labels[:12] or ['参照来源中的论述顺序']

def water_group(ch, section, title=''):
    if ch == 4 and '第8节' in section or ch == 3 and '脱氮除磷' in title:
        return 6
    if ch == 4 and '第5节' in section:
        return 3
    return {1:1, 2:2, 3:3, 4:4, 5:5, 6:7, 7:7, 8:8, 9:9, 10:10, 11:11, 12:11, 13:12}[ch]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--water-text', type=Path, default=DEST / 'water-primary-text.txt')
    args = ap.parse_args()
    env = read(SITE / 'data/environment.json')
    notes = read(SITE / 'data/environment-source-notes.json')
    legacy = json.loads((SITE / 'index.html').read_text().split('const FULL_SEED=')[1].split(';const BUNDLE_VERSION=')[0])
    images = read(SITE / 'data/water-excerpts.json')
    editorial = read(DEST / 'editorial.json')
    raw = args.water_text.read_text().replace('\r', '')
    nodes, contents, rows = {}, {}, []
    roots = {s: [] for s in SUBJECTS}
    def add(id, subject, title, type, parent=None, **kw):
        assert id not in nodes, id
        nodes[id] = dict(id=id, subject=subject, title=title, type=type, parentId=parent,
                         childIds=[], order=len(nodes), **kw)
        if parent:
            nodes[parent]['childIds'].append(id)
        else:
            roots[subject].append(id)
        return id
    def section(parent, title):
        id = parent + '-s-' + digest(title)
        if id not in nodes:
            add(id, nodes[parent]['subject'], title, 'section', parent)
        return id
    def attach(id, text, source, *, question=None, hints=None, blocks=None,
               status='migrated_pending', questionIds=None, note='', version=None, draft=False):
        subject = nodes[id]['subject']
        hints = hints or outline(text)
        contents[id] = dict(contentBlocks=blocks if blocks is not None else ([dict(type='text', text=text)] if text else []),
                            source=source, verificationStatus=status, verificationNote=note,
                            recall=dict(question=question or nodes[id]['title'], outline=hints,
                                        answerAvailable=bool(text or blocks) and not draft),
                            questionIds=questionIds or [], relatedIds=[], version=version)
        # Recursive tree: topic -> answer framework -> source detail.
        if not draft and (text or blocks):
            for i, label in enumerate(hints):
                bid = id + '-frame-' + digest(label)
                add(bid, subject, label, 'framework', id, contentId=id)
                if text:
                    # The complete answer is preserved in contents, not repeated in DOM.
                    paragraphs = re.split(r'\n(?=[①-⑳一二三四五六七八九十（(\d])|(?=[①-⑳])', text)
                    detail = paragraphs[min(i, len(paragraphs)-1)].strip()
                    if detail:
                        add(bid+'-detail', subject, detail, 'detail', bid, contentId=id)
        rows.append(dict(id=id, subject=subject, originalChapter=source.get('chapter',''),
                         originalSection=source.get('section',''), title=nodes[id]['title'],
                         source=source, migrated=True, answerOrganized=not draft and bool(text or blocks),
                         tableVerified=False, formulaVerified=False, status=status,
                         conflicts=note, questionIds=questionIds or []))
    # Original 20 chapters, never infer missing chapter titles from the task example.
    for c in env['chapterMapping']:
        cid = 'env-chapter-%02d' % c['originalChapter']
        add(cid, SUBJECTS[0], f"第{c['originalChapter']}章 {c['originalTitle']}", 'chapter',
            mapping=f"新版第{c['newChapter']}章 {c['newTitle']}（{c['status']}）")
    supplement_first_seven = 0
    for x in env['items']:
        ch = x.get('originalChapterNumber') or x['chapterNumber']
        # Changes have an explicit source-to-new chapter correction (e.g. CO2).
        if x.get('sourceKind') == 'changes':
            ch = x['chapterNumber']
            if ch <= 7 and x['category'] == 'supplement':
                supplement_first_seven += 1
        cid = 'env-chapter-%02d' % ch
        stitle = x.get('originalSection') or x.get('section') or '资料补充'
        if x.get('sourceKind') == 'changes':
            stitle = x.get('section') or stitle
            # Merge abbreviated section headings into the original full heading.
            number = re.match(r'第(\d+)节', stitle)
            if number:
                match = next((nodes[i]['title'] for i in nodes[cid]['childIds']
                              if nodes[i]['title'].startswith(number[0])), None)
                stitle = match or stitle
        sid = section(cid, stitle)
        add(x['id'], SUBJECTS[0], x.get('title') or x['question'], 'topic', sid,
            category=x.get('category'), archived=x['version'] in ['removed','original-only','replaced'])
        pages = sorted({e['page'] for e in x.get('excerpts', [])} or {x.get('page')})
        source = dict(document=x['source'], url=x.get('sourceUrl'), pages=pages,
                      chapter=x.get('originalChapter',x['chapter']), section=x.get('originalSection',x['section']),
                      sourceRange=x.get('sourceRange'), excerpts=x.get('excerpts', []),
                      additionalSources=x.get('answerSources', []))
        attach(x['id'], x['answer'], source, question=x['question'], questionIds=[x['id']],
               note='；'.join(x.get('reviewReasons', [])), version=x['version'],
               status='verified' if x.get('verified') else 'migrated_pending')
    # All source notes survive, including ambiguous OCR, with exact coordinates.
    grouped_notes = collections.defaultdict(list)
    for n in notes:
        grouped_notes[n['page']].append(n)
    env_ranges = [(x.get('page', 0), x.get('originalChapterNumber', 1))
                  for x in env['items'] if x.get('sourceKind') == 'original']
    for page, ns in grouped_notes.items():
        chapter = max((p, c) for p, c in env_ranges if p <= page)[1] if any(p <= page for p,c in env_ranges) else 1
        parent = section('env-chapter-%02d' % chapter, '原资料章首提示与未入题备注（待核对）')
        id = f'env-source-notes-{page}'
        add(id, SUBJECTS[0], f'PDF第{page}页备注', 'source-note', parent)
        contents[id] = dict(contentBlocks=[dict(type='sourceText', text='\n'.join(n['text'] for n in ns))],
                            source=dict(document='环境学导论.pdf', pages=[page], lines=ns),
                            verificationStatus='migrated_pending', verificationNote='原始OCR备注；不作为正式答案。',
                            relatedIds=[], questionIds=[])
    for i, title in enumerate(WATER_CHAPTERS, 1):
        add(f'water-chapter-{i:02}', SUBJECTS[1], f'{i:02} {title}', 'chapter')
    # Primary source segmentation. Keep every non-header line and its line range.
    body_start = raw.index('小黄学长——水控通关攻略')
    body = raw[body_start:]
    lines = body.splitlines()
    ch, ctitle, stitle, printed = 1, '', '', 1
    current, chunks, preamble = None, [], []
    def flush():
        nonlocal current
        if current and current['lines']:
            current['text'] = '\n'.join(current.pop('lines')).strip()
            chunks.append(current)
        current = None
    for n, line in enumerate(lines, 1):
        page = re.match(r'^[-‐−]\s*(\d+)\s*[-‐−]', line.strip())
        if page:
            printed = int(page[1]) + 1
            continue
        if line.startswith(('小黄学长——','本资料有效期')) or not line.strip():
            continue
        clean = re.sub(r'\s+', '', line)
        chapter = re.match(r'^第(\d+)章(.+)', clean)
        sec = re.match(r'^第(\d+)节(.+)', clean)
        point = re.match(r'^知\s*识\s*点\s*([\dI]+)\s*(.+)', line)
        if chapter:
            flush(); ch = int(chapter[1]); ctitle = line.strip(); stitle = '章首说明'
            continue
        if sec:
            flush(); stitle = re.sub(r'\s+', '', line)
            current = dict(ch=ch, chapter=ctitle, section=stitle, title=stitle, startLine=n,
                           pages=[printed], lines=[], kind='section-text')
            continue
        if point:
            flush()
            current = dict(ch=ch, chapter=ctitle, section=stitle, title=point[2].strip(), startLine=n,
                           pages=[printed], lines=[], kind='knowledge')
            continue
        if current is None:
            current = dict(ch=ch, chapter=ctitle, section=stitle, title=stitle or ctitle,
                           startLine=n, pages=[printed], lines=[], kind='section-text')
        current['lines'].append(line)
        current['endLine'] = n
        if printed not in current['pages']:
            current['pages'].append(printed)
    flush()
    used_editorial = set()
    for x in chunks:
        group = water_group(x['ch'], x['section'], x['title'])
        sid = section(f'water-chapter-{group:02}', x['chapter']+' / '+x['section'])
        edit = next((e for e in editorial['topics'] if e.get('sourceTitle') == x['title']
                     and e.get('sourceChapter',x['ch']) == x['ch']), None)
        id = edit['id'] if edit else 'water-primary-'+digest(f"{x['ch']}|{x['section']}|{x['title']}")
        add(id, SUBJECTS[1], edit.get('title',x['title']) if edit else x['title'], 'topic', sid)
        source = dict(document='水污染控制工程.pdf', url='https://drive.google.com/file/d/1djkRuKy5EKqbGRi1Flg_enOHZwCzgWVl/view',
                      printedPages=x['pages'], pages=[], pageNote='书内页码；不是PDF实际页序',
                      chapter=x['chapter'], section=x['section'], textSnapshot='water-primary-text.txt',
                      bodyLineRange=[x['startLine'], x.get('endLine',x['startLine'])])
        if edit:
            used_editorial.add(id)
            text = '\n\n'.join(b.get('text','') for b in edit['blocks'] if b['type']=='text')
            attach(id, text, source, question=edit.get('question'), hints=edit['outline'], blocks=edit['blocks'],
                   questionIds=edit.get('questionIds',[]), note=edit.get('note','整理释义；原PDF图表与具体数值仍待逐页核对。'))
            contents[id]['comparison'] = edit.get('comparison',{})
        else:
            attach(id, '', source, hints=outline(x['text']), draft=True,
                   blocks=[], note='来源文本已迁移，表格错序、公式缺字及图像未逐页核实；未生成正式参考答案。')
        contents[id]['sourceText'] = x['text']
    for edit in editorial['topics']:
        if edit['id'] in used_editorial:
            continue
        assert not edit.get('sourceTitle'), 'Editorial source heading not found: '+str(edit)
        sid = section(f"water-chapter-{edit['group']:02}", '原理与易混概念')
        add(edit['id'], SUBJECTS[1], edit['title'], 'topic', sid)
        source = dict(document='水污染控制工程.pdf', url='https://drive.google.com/file/d/1djkRuKy5EKqbGRi1Flg_enOHZwCzgWVl/view',
                      printedPages=edit['pages'], pages=[], pageNote='书内页码；整理释义，非逐字标准答案',
                      chapter=WATER_CHAPTERS[edit['group']-1], section='原理与易混概念')
        text = '\n\n'.join(b.get('text','') for b in edit['blocks'] if b['type']=='text')
        attach(edit['id'], text, source, hints=edit['outline'], blocks=edit['blocks'],
               question=edit.get('question'), questionIds=edit.get('questionIds',[]), note=edit.get('note','依据所列书内页整理，原PDF图表待核对。'))
        contents[edit['id']]['comparison'] = edit.get('comparison',{})
    # Original question text is never promoted to a cleaned reference answer.
    for x in legacy:
        ch = int(re.search(r'\d+',x['chapter'])[0]) - 8
        group = water_group(ch, x.get('section',''), x['question'])
        sid = section(f'water-chapter-{group:02}', '原背诵题库 / '+x['chapter'])
        add(x['id'], SUBJECTS[1], x['question'], 'question', sid)
        im = images['items'][x['id']]
        source = dict(document=images['source']['name'], url=images['source']['url'], pages=[e['page'] for e in im['excerpts']],
                      chapter=x['chapter'], section=x.get('section',''), excerpts=im['excerpts'], sourceRange=im['sourceRange'])
        attach(x['id'], '', source, hints=outline(x.get('hint') or x['answer']), questionIds=[x['id']], draft=True,
               note='原211题保留，OCR题干/答案未改写；请以对应原文裁图为准。')
        contents[x['id']]['sourceText'] = x['answer']
    for e in editorial['topics']:
        id = e['id']
        for other in e.get('relatedIds',[])+e.get('questionIds',[]):
            assert other in nodes, (id,other)
            if other not in contents[id]['relatedIds']:
                contents[id]['relatedIds'].append(other)
            if id not in contents[other]['relatedIds']:
                contents[other]['relatedIds'].append(id)
    # Exact phrase relationships across the two subjects, not arbitrary link counts.
    for x in env['items']:
        matches = [e['id'] for e in editorial['topics'] if len(e['title'])>=4 and e['title'] in x['title']]
        for id in matches[:3]:
            contents[x['id']]['relatedIds'].append(id)
            contents[id]['relatedIds'].append(x['id'])
    missing = [dict(id='missing-env-fused-map', document='环境学导论_20章_融合新增内容.xmind / .md / environment_study_20_chapters.md',
                    status='source_incomplete', note='本地与Drive未找到，不能声称已导入该融合版。'),
               dict(id='missing-env-first-seven',document='环导新增——前七章',status='not_migrated',
                    note='未找到同名或可确认等同文件；已有环导变动PDF中的前七章补充已融入，不能视为同一资料。'),
               dict(id='water-primary-visuals',document='水污染控制工程.pdf',status='source_incomplete',
                    note='Drive可读文本已取得；36,749,782字节原件超过执行器32MiB传输上限，直取链接返回403。主PDF公式、表格、插图未完成原页核验；旧辅助教辅裁图可用。')]
    for gap in env.get('sourceGaps',[]):
        missing.append(dict(id='env-gap-'+digest(str(gap)), document='环导原资料/变动PDF',status='source_incomplete',note=gap))
    stats = dict(environmentOriginalChapters=20, environmentRecords=len(env['items']),
                 environmentKnowledge=sum(x['category']!='exercise' for x in env['items']),
                 environmentExercises=sum(x['category']=='exercise' for x in env['items']),
                 environmentSourceNotes=len(notes), environmentFirstSevenSupplements=supplement_first_seven,
                 waterLogicalChapters=12, waterPrimarySections=len(chunks),
                 waterOrganizedTopics=len(editorial['topics']), waterLegacyQuestions=len(legacy),
                 sourceGaps=len(missing), verified=sum(r['status']=='verified' for r in rows),
                 pending=sum(r['status']=='migrated_pending' for r in rows),
                 treeNodes=len(nodes))
    manifest = dict(schemaVersion=1, treeVersion=1, title='838 知识体系', subjects=[
        dict(id=SUBJECTS[0],title='环境学导论',rootIds=roots[SUBJECTS[0]]),
        dict(id=SUBJECTS[1],title='水污染控制工程',rootIds=roots[SUBJECTS[1]])],
        statistics=stats, sourceGaps=missing, chapterMapping=env['chapterMapping'],
        comparisons=editorial['comparisons'], sources=env['sources']+[
            dict(source='水污染控制工程.pdf / Drive文字快照',sha256=hashlib.sha256(raw.encode()).hexdigest(),
                 snapshot='water-primary-text.txt', visualVerification='pending')])
    write('tree.json',dict(schemaVersion=1,treeVersion=1,nodes=nodes))
    for subject in SUBJECTS:
        write(subject+'.json',{id:c for id,c in contents.items() if nodes[id]['subject']==subject})
    write('manifest.json',manifest)
    write('coverage.json',dict(statistics=stats,rows=rows,sourceGaps=missing,
                              sourceNoteCount=len(notes),chapterMapping=env['chapterMapping']))
    print(json.dumps(stats,ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
