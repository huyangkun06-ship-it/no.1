// Additional workbench acceptance checks. Browser packages are CI/development only.
const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync(
  process.env.SOURCE_HTML || "water838/index.html",
  "utf8",
);
const seed = JSON.parse(
  html.split("const FULL_SEED=")[1].split(";const BUNDLE_VERSION=")[0],
);
const KEY = "yanxicang_838_water_v1",
  url = process.env.PAGE_URL;
const engines = process.env.LOCAL_CHROME ? { chromium } : { chromium, webkit };
(async () => {
  for (const [engine, launcher] of Object.entries(engines)) {
    const browser = await launcher.launch(
      process.env.LOCAL_CHROME
        ? { executablePath: process.env.LOCAL_CHROME, args: ["--no-sandbox"] }
        : {},
    );
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const p = await context.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    const old = {
      items: structuredClone(seed),
      bundledVersion: "full-pdf-ocr-211-v1",
      customMetadata: { keep: true },
    };
    old.items[0].answer = "用户校订的答案，不得覆盖";
    old.items[0].topic = "用户知识点";
    old.items[0].verified = true;
    old.items[0].star = true;
    old.items[0].history = [
      { at: Date.now() - 86400000 * 8, grade: 3, response: "原作答" },
    ];
    old.items[0].next = Date.now() - 100;
    old.items[0].interval = 10;
    old.items[0].master = true;
    old.items.push({
      ...structuredClone(seed[1]),
      id: "custom-question",
      question: "自定义题目",
      history: [],
    });
    await context.addInitScript(
      ({ KEY, old }) => {
        if (!localStorage.getItem("test.initialized")) {
          localStorage.setItem(KEY, JSON.stringify(old));
          localStorage.setItem("838.lastQuestion", old.items[30].id);
          localStorage.setItem("test.initialized", "yes");
        }
      },
      { KEY, old },
    );
    await p.goto(url);
    await p.waitForFunction(
      () => document.querySelector("#sTotal").textContent === "212",
    );
    const state = () =>
      p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    assert.deepEqual(
      await state(),
      old,
      "Existing records must be byte-equivalent as parsed JSON",
    );
    await p.locator("#continueStudy").click();
    assert.equal(await p.locator("#qText").textContent(), seed[30].question);
    await p.locator("#quickJump").selectOption(seed[0].id);
    assert.match(await p.locator("#meta").textContent(), /用户知识点/);
    assert(!(await p.locator("#answer").isVisible()));
    await p.locator("#revealBtn").click();
    assert(await p.locator("#answer").isVisible());
    await p.locator("#revealBtn").click();
    assert(!(await p.locator("#answer").isVisible()));
    assert(!(await p.locator("#selfGrade").isVisible()));
    await p.locator("#focusToggle").click();
    assert(await p.locator("#sidebar").isHidden());
    assert(await p.locator("#focusToggle").isVisible());
    await p.keyboard.press("Escape");
    assert(await p.locator("#sidebar").isVisible());
    await p.locator("nav [data-view=bank]").click();
    assert.equal(await p.locator("#bankItems details").count(), 12);
    await p.locator("#bankStatus").selectOption("star");
    assert.equal(await p.locator("#bankItems .listItem").count(), 1);
    await p.locator("#bankItems summary").click();
    await p
      .locator("#bankItems .actions button")
      .filter({ hasText: "已收藏" })
      .click();
    assert.equal(await p.locator("#bankItems .listItem").count(), 0);
    await p.locator("#bankStatus").selectOption("all");
    await p.locator("#bankType").selectOption("名词解释");
    assert(
      (await p.locator("#bankItems .mini").allTextContents()).every((t) =>
        t.includes("名词解释"),
      ),
    );
    await p.locator("nav [data-view=review]").click();
    assert.match(await p.locator("#reviewSummary").textContent(), /1 道/);
    assert.equal(await p.locator("#historyItems .history-row").count(), 1);
    await p.locator("#reviewDue").click();
    assert.match(
      await p.locator("#qText").textContent(),
      new RegExp(seed[0].question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    await p.locator("#revealBtn").click();
    await p.locator('[data-grade="3"]').click();
    assert.equal((await state()).items[0].interval, 20);
    assert.equal((await state()).items[0].history.length, 2);
    // Cap at 45 days, with the original rule, and keep verification untouched.
    await p.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k));
      s.items[0].interval = 30;
      localStorage.setItem(k, JSON.stringify(s));
    }, KEY);
    await p.reload();
    await p.locator("nav [data-view=study]").click();
    await p.locator("#quickJump").selectOption(seed[0].id);
    await p.locator("#revealBtn").click();
    await p.locator('[data-grade="3"]').click();
    assert.equal((await state()).items[0].interval, 45);
    assert.equal((await state()).items[1].verified, false);
    await p.locator("nav [data-view=tools]").click();
    await p.locator("#themeToggle").click();
    const theme = await p.locator("html").getAttribute("data-theme");
    await p.waitForFunction(() => getComputedStyle(document.getElementById("themeToggle")).color === getComputedStyle(document.body).color);
    await p.reload();
    assert.equal(await p.locator("html").getAttribute("data-theme"), theme);
    // Exercise all layouts and all primary modules, including dark mode.
    for (const width of [320, 375, 390, 768, 820, 1024, 1440]) {
      await p.setViewportSize({ width, height: width === 1024 ? 768 : 1000 });
      for (const view of ["home", "study", "bank", "review", "tools"]) {
        await p.locator(`nav [data-view=${view}]`).click();
        assert.equal(
          await p.evaluate(() => document.documentElement.scrollWidth),
          width,
          `${view} ${width} overflow`,
        );
      }
      if (width < 701) {
        const nav = await p.locator("#sidebar").boundingBox();
        assert(nav.y + nav.height <= 1001);
        assert.equal(Math.round(nav.width), width);
      }
      if (width === 1440) {
        await p.locator("#sidebarToggle").click();
        assert.equal(
          Math.round((await p.locator("#sidebar").boundingBox()).width),
          78,
        );
        await p.locator("#sidebarToggle").click();
      }
    }
    // Cached shell must reload with the network disabled, with progress intact.
    await p.evaluate(() =>
      navigator.serviceWorker.ready.then(
        () =>
          new Promise((resolve) => {
            if (navigator.serviceWorker.controller) return resolve();
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => resolve(),
              { once: true },
            );
          }),
      ),
    );
    const beforeOffline = await state();
    await context.setOffline(true);
    await p.reload({ waitUntil: "load" });
    await p.locator("nav [data-view=study]").click();
    await p.locator("#quickJump").selectOption(seed[5].id);
    await p.locator("#revealBtn").click();
    assert(await p.locator("#answer").isVisible());
    await p.locator('[data-grade="2"]').click();
    const offlineState = await state();
    assert.equal(offlineState.items[5].interval, 3);
    assert.equal(
      offlineState.items[0].history.length,
      beforeOffline.items[0].history.length,
    );
    await p.reload({ waitUntil: "load" });
    assert.equal((await state()).items[5].interval, 3);
    await context.setOffline(false);
    assert.deepEqual(errors, []);
    await context.close();
    // Unreadable records are never silently reseeded or overwritten.
    const corrupt = await browser.newContext();
    await corrupt.addInitScript(
      (k) => localStorage.setItem(k, "{broken-original-data"),
      KEY,
    );
    const q = await corrupt.newPage();
    q.on("dialog", (d) => d.accept());
    await q.goto(url);
    assert.equal(
      await q.evaluate((k) => localStorage.getItem(k), KEY),
      "{broken-original-data",
    );
    await q.reload();
    assert.equal(
      await q.evaluate((k) => localStorage.getItem(k), KEY),
      "{broken-original-data",
    );
    await corrupt.close();
    // Historical chapter-9 IDs migrate to the original corresponding records.
    const legacy = await browser.newContext();
    const legacyItem = {
      ...structuredClone(seed[0]),
      id: "pdf-water-ch9-review-001",
      star: true,
      master: true,
      interval: 12,
      next: Date.now() + 5000,
      history: [{ at: 123, grade: 3, response: "旧记录" }],
    };
    await legacy.addInitScript(
      ({ KEY, item }) => {
        if (!localStorage.getItem(KEY))
          localStorage.setItem(KEY, JSON.stringify({ items: [item] }));
      },
      { KEY, item: legacyItem },
    );
    const l = await legacy.newPage();
    await l.goto(url);
    const migrated = await l.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)),
      KEY,
    );
    assert.equal(migrated.items.length, 211);
    assert.deepEqual(migrated.items[0].history, legacyItem.history);
    assert.equal(migrated.items[0].interval, 12);
    assert(migrated.items[0].star);
    assert.equal(migrated.items[0].verified, false);
    await legacy.close();
    console.log(
      `PASS ${engine}: existing data preservation, resume, answer toggle, immersion, chapter/status/type filters, review history, unchanged 20/45-day scheduling, theme, 7 responsive sizes, offline reload/grading/persistence, corrupt-data protection, legacy migration; no JS errors`,
    );
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
