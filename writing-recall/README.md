# 写作语料 · 回忆训练

原生 HTML/CSS/JavaScript，83 个话题、249 句。无需注册、接口或运行时依赖。

## 使用

打开 `index.html` 即可使用，也可在 GitHub Pages 访问 `/no.1/writing-recall/`。首次联网缓存成功后，可在同一浏览器离线重开地址。直接下载 `index.html` 也包含全部题库、样式和逻辑，可以离线打开。`sw.js` 仅为通过网站地址离线重开提供缓存。

默认顺序背诵；随机模式按 Fisher–Yates 洗牌，一轮不重复，支持指定编号范围。上一题沿原队列返回。「重新抽取」会把当前题与尚未出现的题交换，原题仍留在本轮。稍后再背独立保存并支持顺序或随机。所有提示独立开关，英文可逐句或一次揭晓并复制。←/→ 切题，1–4 开关提示，空格切换英文答案区域。输入框内不触发快捷键。手机支持以水平动作为主的滑动切题。

## 文件

- `index.html`：完整可运行页面，包含题库、CSS、JavaScript。
- `topics.json`：独立可维护题库，保留原始话题 ID、标题、中英文、短语、原编号。
- `app.js`、`styles.css`、`template.html`：维护源码。
- `build.py`：修改源码或题库后执行 `python3 build.py`，重新生成完整 HTML。
- `sw.js`：仅作用于本目录的离线缓存。
- `check.cjs`：执行 `node check.cjs` 检查数据和嵌入版本。
- `CONTENT-AUDIT.md`：原文核对、编号异常、分类结果。
- `TESTING.md`：验证结果与设备测试限制。

## GitHub Pages

本仓库已有 `.github/workflows/pages.yml`，在推送 main 后自动构建部署。流程在保留现有网站的基础上，检查并复制本目录到 Pages 产物中的 `writing-recall/`。页面无登录要求。

本地预览：`python3 -m http.server 8000`，打开 `http://localhost:8000/`。更新网站时同步修改 `sw.js` 缓存版本，便于旧缓存清理。

## 数据与进度

浏览器 localStorage 保存当前模式、范围、两个顺序位置、两个随机队列及位置、稍后再背列表。跨设备不自动同步；清理浏览器数据会清除进度。存储被禁用时仍可背诵并显示提示。题库直接内置，不使用 CDN、AI、远程数据库或付费 API。
