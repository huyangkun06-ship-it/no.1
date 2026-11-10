# 838 · 背诵系统

项目地址：https://huyangkun06-ship-it.github.io/no.1/water838/

这是无运行时依赖的静态学习工作台，继续由原 GitHub Pages 工作流发布。根目录英语站点保持原有功能。提交到 `main` 后，Pages 工作流先校验，再发布 `water838/` 整个目录；线上验收工作流随后在 Chromium 和 WebKit 中运行。

## 文件

- `index.html`：五模块页面与原始 211 条 OCR 数据，覆盖第9—20章。
- `styles.css`：米白 / 鼠尾草绿设计、深色主题、电脑侧栏、平板布局、手机底栏与触控适配。
- `app.js`：背诵、题库、复习记录、录题、CSV / JSON、PDF、本地记录兼容与界面逻辑。
- `sw.js`：仅缓存本项目学习页面、脚本、样式、manifest 和图标。
- `manifest.webmanifest`、`icon.svg`：838 品牌与安装配置；原 Apple 图标仍引用上级目录资源。

## 数据兼容

继续使用 `yanxicang_838_water_v1`，题目 ID、`bundledVersion` 和原题库结构保持兼容。已有编辑、收藏、自定义题、历史作答、掌握状态和复习间隔不会因界面更新重置。原章节9旧 ID 的迁移逻辑保留。本次没有新增题库结构版本，也不把 OCR 内容标为已核对。

复习算法保持：完全不会1天、需要提示2天、有少量遗漏3天、独立完整回答首次5天；已有间隔至少4天时翻倍并四舍五入，最长45天。跳过不写入评分。

新界面偏好单独使用 `838.theme` 和 `838.lastQuestion`，不混入题库。存储内容无法解析时，阻止默认题库覆盖旧记录，工具中可下载原始记录后恢复。JSON 完整备份仍包含题库与历史；CSV 是题库交换格式，现包含 ID，合并同题时保留原历史、间隔与收藏。勾选替换会在确认后显式替换现有题库。

## 离线与更新

首次必须联网打开，学习首页显示“离线缓存已就绪”后才可断网刷新。已缓存的学习、评分、收藏、编辑和导入导出可离线使用。原 PDF 外链仍需联网；本机选择 PDF 不上传，不纳入 Service Worker 缓存，重新打开页面时需重新选择。

Service Worker 限定于 `water838/`，不会接管根目录英语站点。缓存采用完整版本，不混合不同版本的脚本与页面。后续修改发布资源时应同步递增 `sw.js` 的 `CACHE` 名称；新缓存安装完整后才激活，旧缓存随后清理，localStorage 不受缓存更新影响。

## 构建与测试

无需 npm 安装或前端打包。校验与静态产物组装命令：

```sh
node .github/scripts/water838-build.cjs --out /tmp/838-pages-build
```

构建校验锁定原始题库 SHA-256，检查211条唯一ID、12章、待核对标记、名称、相对资源路径、manifest和JavaScript语法。产物同时保留原英语首页。

浏览器测试工具只在开发 / CI 中安装，不随站点发布：

```sh
PAGE_URL=https://huyangkun06-ship-it.github.io/no.1/water838/ node .github/scripts/water838-check.cjs
PAGE_URL=https://huyangkun06-ship-it.github.io/no.1/water838/ node .github/scripts/water838-workbench-check.cjs
```

本地可设置 `LOCAL_CHROME=/usr/bin/chromium` 使用系统 Chromium。完整测试覆盖320、375、390、768、820、1024、1440像素，原有功能、数据兼容、旧ID迁移、答案折叠、主题记忆、复习历史、沉浸模式、断网刷新和离线评分持久化。

本次本地未能下载 WebKit（环境网络策略拒绝浏览器下载域名）；已更新 GitHub Actions 保留 Chromium / WebKit 双引擎验收。浏览器引擎与尺寸模拟不替代 iPhone、iPad 和安卓真机测试。


## 环境学导论资料扩充

本次新增资料、统计、待核对清单与复现命令见 [ENVIRONMENT_IMPORT.md](./ENVIRONMENT_IMPORT.md)。原211题与旧存储键保持兼容，使用独立环境题库版本进行增量导入。


## 到期复习修复（2026-11-10）

到期判断统一使用北京时间的日期：计划复习日为今天或之前、且存在背诵记录的题，列入到期复习。保留已有next时间戳与全部历史，不批量改写排程。首页与复习页共用判断，页面每分钟及恢复可见/焦点时刷新。全局“复习到期题目”清除科目、类别、章节、题型和版本限制，包含已背过的旧版保留内容；用户在背诵筛选内手动选择“今日到期”仍遵循所选筛选。

回归：`LOCAL_CHROME=/usr/bin/chromium PAGE_URL=http://localhost:8000/no.1/water838/ node .github/scripts/water838-due-check.cjs`，覆盖北京时间跨日、日期/时刻差异、残留筛选、旧版到期题和原记录保留。


## 水控原文配图

原211道水控题已配277张原文图片，63道含跨页裁图。来源、定位核验、复现和测试命令见 [WATER_SOURCE_IMAGES.md](./WATER_SOURCE_IMAGES.md)。
