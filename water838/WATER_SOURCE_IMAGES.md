# 水污染控制工程原文配图

为原有211道水控题增加独立的原文图片映射，共286张原文裁图，沿用环境学导论的答案内“查看对应原文（含图片、公式与表格）”展示。原题、答案、稳定ID和全部学习记录不改写。

来源为网站原先关联的《电子版水控辅助教辅.pdf》，269个实际PDF页面，文件约60 MB。正文为扫描图片，少量页眉和页脚有文字层。原件SHA-256保存于 `data/water-excerpts.json`。PDF第1页为封面，实际页码比书内页脚大1，图片同时标注两种页码。

## 提取与关联

- 对题目所在页及可能的后续页共120页进行中文OCR，利用文字与坐标定位。
- 独立匹配各题，而不假设原OCR题库顺序就是纸面顺序。
- 按下一原题、题型标题或章节标题限定范围，保留跨页正文、公式、表格及流程图。
- 低把握的标题以及跨行题干已复核定位，修正坐标见 `data/water-excerpt-overrides.json`。
- 原题库中第30、32条为同一道计算题的步骤片段，保留原ID并配同一原题完整解答；第201条是已有知识片段记录，配其对应段落。没有因此新增或删除题目。
- 第190条原题标题只有跨行题干尾部，图片向前补到题干首行。
- 原OCR文字中的错字、乱码及原本混入的其他题答案不在本次改写范围；对应图片按纸面真实题目边界关联，方便对照原文。

## 数据和运行方式

`data/water-excerpts.json` 供审查，`data/water-excerpts.js` 为静态运行映射；`assets/water/` 为原图裁片。应用按现有题目ID读取图片，不向localStorage的题目记录追加字段，所以不会覆盖用户编辑、历史、收藏或掌握状态。

图片在隐藏答案内按需展开，已查看图片加入本项目离线缓存；题库读取不依赖浏览器访问Google Drive。未查看的图片首次仍需联网。继续支持手机和平板阅读、字号调整、抽背、筛选与到期复习。

## 复现

需要PyMuPDF、Pillow及带chi_sim/eng语言的Tesseract，把原PDF放入work目录后执行：

```sh
python water838/scripts/extract_water_pages.py --pdf work/电子版水控辅助教辅.pdf --work work/water
python water838/scripts/build_water_excerpts.py --pdf work/电子版水控辅助教辅.pdf --ocr work/water/pages.json
node .github/scripts/water838-build.cjs
LOCAL_CHROME=/usr/bin/chromium PAGE_URL=http://localhost:8000/no.1/water838/ node .github/scripts/water838-water-images-check.cjs
```

自定义语言目录可向提取脚本传 `--tessdata /path/to/tessdata`。低把握匹配会阻止生成正式映射，需先对照原图复核坐标。校验锁定原211条JSON的SHA-256，并检查全部ID配图、实际文件、页码范围、跨页样例和运行包一致性。
