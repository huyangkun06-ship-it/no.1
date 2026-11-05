# 考研英语写作背诵网站

网站以原上传的《写作背诵网页.html》为基础，根目录 `index.html` 为首页。保留 83 个话题、101 条句型、原有布局和背诵功能，无后端、数据库或框架依赖。

## 当前部署状态

代码与 GitHub 官方 Pages Actions 工作流已准备。仓库原为私有仓库，尚不能据此声称网站已经上线。免费账户请先将此专用仓库改为 Public，再开启 Pages。

1. 仓库 Settings → General → Danger Zone → Change repository visibility → Public。
2. Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
3. Actions → Deploy static site to GitHub Pages → Run workflow → main。
4. 等待工作流成功，以 Pages 设置页或部署任务给出的 HTTPS 链接为准。预期地址为 `https://huyangkun06-ship-it.github.io/no.1/`，在部署成功前该地址不是已验证的网站。
5. Pages 设置中确认 Enforce HTTPS 已开启（github.io 默认域名支持 HTTPS）。

工作流位于 `.github/workflows/pages.yml`，使用 GitHub 官方 checkout / configure-pages / upload-pages-artifact / deploy-pages，发布白名单中的 HTML、manifest 和两个图标文件。

## 更新网站

在 GitHub 打开根目录 `index.html`，点击铅笔编辑并提交到 `main`；若有新的完整 HTML，可在仓库首页 Add file → Upload files，上传同名 `index.html` 替换，再提交。Pages 启用后会自动重新部署。更新时保留 `kaoyanWritingStudyProgressV2` 存储键及题目 ID，避免学习记录关联发生变化。

## 学习记录与跨设备

- 进度、评分和收藏仍保存在当前浏览器的 localStorage 中。
- 不同设备、浏览器和主屏幕应用之间不会自动同步；用“导出学习记录备份”下载 JSON，再在另一设备“导入学习记录”。
- 从本地 HTML 改用 HTTPS 网站后，网址来源变化，旧记录不会自动迁移。先在原页面导出 JSON，再到新网站导入。
- 清理浏览器数据或使用无痕模式可能导致记录丢失，请定期导出备份。
- 没有云同步、登录、付费服务或上传学习记录的服务器。

## 添加到主屏幕

- iPad / iPhone Safari：打开部署后的 HTTPS 网页 → 分享 → 添加到主屏幕。
- 安卓 Chrome：菜单 → 添加到主屏幕；不同浏览器菜单名称略有差异。
- manifest 使用相对路径，支持 `/no.1/` 项目路径；无需额外域名。
- 未添加 Service Worker，不承诺离线使用。

## 最小修复

- 按实际顶部高度计算锚点滚动偏移，避免标题被 sticky 顶部遮住。
- 搜索改为用普通 DOM 判断替代 `:has()` 选择器，兼容更多 Safari 版本。
- 导出链接挂载到 DOM 后触发下载，并延长 Blob URL 生命周期，以改善移动 Safari 下载兼容性。
- 添加主屏幕 manifest、图标及 Apple 配置，未改动教学内容。

## 验证范围

Chromium 中检查 320 / 375 / 768 / 1024 / 1440 像素宽度。原话题卡片与句型卡片逐项对比，教学 HTML 完整一致；83 个话题和 101 条句型进入抽背题库。遮挡、显隐模式、中文提示、英文答案、随机抽背、三档评分、收藏、刷新持久化、JSON 导入导出、搜索、折叠导航、锚点和回到顶部均完成本地验收，无页面 JavaScript 错误及横向溢出。

当前环境无法下载 WebKit 测试运行时，因此尚未完成真实 iPad Safari 或安卓真机验证。线上 HTTPS 首页验收必须在 Pages 开启并部署后进行。
