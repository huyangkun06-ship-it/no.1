const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync(
  process.env.SOURCE_HTML || "water838/index.html",
  "utf8",
);
const seed = JSON.parse(
  source.split("const FULL_SEED=")[1].split(";const BUNDLE_VERSION=")[0],
);
const key = "yanxicang_838_water_v1";
(async () => {
  const engines = process.env.LOCAL_CHROME
    ? { chromium }
    : { chromium, webkit };
  for (const [engine, launcher] of Object.entries(engines)) {
    const browser = await launcher.launch(
      process.env.LOCAL_CHROME
        ? { executablePath: process.env.LOCAL_CHROME, args: ["--no-sandbox"] }
        : {},
    );
    for (const width of [320, 375, 390, 768, 820, 1024, 1440]) {
      const p = await browser.newPage({
        viewport: { width, height: 1000 },
        hasTouch: width < 1000,
      });
      p.setDefaultTimeout(20000);
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      const alerts = [];
      p.on("dialog", async (d) => {
        alerts.push(d.message());
        await d.accept();
      });
      const response = await p.goto(process.env.PAGE_URL, {
        waitUntil: "networkidle",
      });
      assert.equal(response.status(), 200);
      if (!process.env.LOCAL_CHROME)
        assert.equal(new URL(p.url()).protocol, "https:");
      const state = () =>
        p.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
      assert.deepEqual((await state()).items, seed);
      assert.equal(seed.length, 211);
      assert.equal(new Set(seed.map((x) => x.chapter)).size, 12);
      assert.equal(await p.locator("#sTotal").textContent(), "211");
      const noOverflow = async () =>
        assert.equal(
          await p.evaluate(() => document.documentElement.scrollWidth),
          width,
        );
      await noOverflow();
      assert.equal(await p.title(), "838 · 背诵系统");
      await p.locator("nav [data-view=study]").click();
      assert.equal(await p.locator("#orderMode").inputValue(), "sequential");
      assert.equal(await p.locator("#qText").textContent(), seed[0].question);
      await p.locator("#next").click();
      assert.equal(await p.locator("#qText").textContent(), seed[1].question);
      await p.locator("#prev").click();
      assert.equal(await p.locator("#qText").textContent(), seed[0].question);
      await p.locator("#hintBtn").click();
      assert(await p.locator("#hint").isVisible());
      await p.locator("#revealBtn").click();
      assert(await p.locator("#answer").isVisible());
      assert(
        (await p.locator("#answer").textContent()).includes(seed[0].answer),
      );
      await p.locator("#starBtn").click();
      assert((await state()).items[0].star);
      await p.locator("#myAnswer").fill("本次测试作答");
      for (const [i, grade] of [0, 1, 2, 3].entries()) {
        if (!(await p.locator("#answer").isVisible()))
          await p.locator("#revealBtn").click();
        await p.locator(`[data-grade="${grade}"]`).click();
        const x = (await state()).items[i];
        assert.equal(x.history.at(-1).grade, grade);
        assert.equal(x.master, grade === 3);
        assert(x.next > Date.now());
      }
      assert.equal(
        (await state()).items[0].history[0].response,
        "本次测试作答",
      );
      await p.locator("#studyFilters").evaluate((d) => (d.open = true));
      await p.locator("#modeFilter").selectOption("star");
      assert.equal(await p.locator("#qText").textContent(), seed[0].question);
      await p.locator("#modeFilter").selectOption("weak");
      assert.match(await p.locator("#studyPosition").textContent(), /\/ 2 题/);
      await p.locator("#modeFilter").selectOption("due");
      assert(await p.locator("#studyEmpty").isVisible());
      await p.locator("#modeFilter").selectOption("all");
      await p.locator("#orderMode").selectOption("random");
      const random = await p.locator("#qText").textContent();
      await p.locator("#next").click();
      assert.notEqual(await p.locator("#qText").textContent(), random);
      assert(!(await p.locator("#prev").isVisible()));
      await p.locator("#chapterFilter").selectOption(seed.at(-1).chapter);
      assert(
        (await p.locator("#meta").textContent()).includes(seed.at(-1).chapter),
      );
      await p.locator("#chapterFilter").selectOption("");
      await p.locator("#orderMode").selectOption("sequential");
      await p.locator('nav [data-view="bank"]').click();
      assert.equal(await p.locator("#bankItems .listItem").count(), 211);
      await noOverflow();
      await p.locator("#search").fill("水质污染指标");
      assert((await p.locator("#bankItems .listItem").count()) > 0);
      await p.locator("#search").fill("");
      await p.locator("nav [data-view=tools]").click();
      await p.locator('[data-view="edit"]').click();
      await noOverflow();
      await p.locator("#qChapter").fill("部署验收临时章节");
      await p.locator("#qQuestion").fill("部署验收临时题目");
      await p.locator("#qAnswer").fill("临时参考答案");
      await p.locator('#qForm button[type="submit"]').click();
      await p.waitForFunction(
        () => document.getElementById("sTotal").textContent === "212",
      );
      await p.locator("#search").fill("部署验收临时题目");
      await p.locator("#bankItems button").filter({ hasText: "编辑" }).click();
      await p.locator("#qAnswer").fill("临时答案已修改");
      await p.locator('#qForm button[type="submit"]').click();
      assert((await state()).items.some((x) => x.answer === "临时答案已修改"));
      await p.locator("#search").fill("部署验收临时题目");
      await p.locator("#bankItems button").filter({ hasText: "删除" }).click();
      await p.waitForFunction(
        () => document.getElementById("sTotal").textContent === "211",
      );
      await p.locator("nav [data-view=tools]").click();
      await p.locator('[data-view="data"]').click();
      await noOverflow();
      const downloadPromise = p.waitForEvent("download");
      await p.locator("#exportJson").click();
      const backup = JSON.parse(
        fs.readFileSync(await (await downloadPromise).path(), "utf8"),
      );
      assert.equal(backup.items.length, 211);
      assert(backup.items[0].star);
      assert.equal(backup.items[0].history.length, 1);
      const csvPromise = p.waitForEvent("download");
      await p.locator("#exportCsv").click();
      const csv = fs.readFileSync(await (await csvPromise).path(), "utf8");
      assert(csv.includes("chapter,type,question,answer"));
      assert(csv.includes(seed[0].question));
      await p.reload();
      assert((await state()).items[0].star);
      assert.equal((await state()).items[0].history.length, 1);
      // Simulate a fresh device before importing the complete JSON backup.
      await p.evaluate((k) => localStorage.removeItem(k), key);
      await p.reload();
      assert.equal((await state()).items[0].history.length, 0);
      await p.locator("nav [data-view=tools]").click();
      await p.locator('[data-view="data"]').click();
      await p.locator("#replaceImport").check();
      await p.locator("#importFile").setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup)),
      });
      await p.waitForFunction(
        (k) =>
          JSON.parse(localStorage.getItem(k)).items[0].history.length === 1,
        key,
      );
      assert((await state()).items[0].star);
      // CSV replacement is explicit; merge must preserve existing progress.
      await p.locator("#replaceImport").uncheck();
      await p.locator("#importFile").setInputFiles({
        name: "bank.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      });
      await p.waitForTimeout(100);
      assert.equal((await state()).items[0].history.length, 1);
      assert.equal((await state()).items.length, 211);
      await p.locator("#replaceImport").check();
      await p.locator("#importFile").setInputFiles({
        name: "bank.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      });
      await p.waitForFunction(
        (k) =>
          JSON.parse(localStorage.getItem(k)).items[0].history.length === 0,
        key,
      );
      assert.equal((await state()).items.length, 211);
      await p.locator("nav [data-view=tools]").click();
      await p.locator('[data-view="pdf"]').click();
      await noOverflow();
      await p.locator("#pdfFile").setInputFiles({
        name: "test.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(
          "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
        ),
      });
      assert(await p.locator("#pdfContainer").isVisible());
      assert.match(await p.locator("#pdfViewer").getAttribute("src"), /^blob:/);
      await p.locator('nav [data-view="study"]').click();
      assert.match(
        await p.locator("#pageJump").getAttribute("href"),
        /^https:\/\/drive.google.com\/.+#page=\d+$/,
      );
      const manifest = await p.request.get(
        new URL("manifest.webmanifest", process.env.PAGE_URL).href,
      );
      assert.equal(manifest.status(), 200);
      assert.equal((await manifest.json()).start_url, "./");
      const allContentOverflow = await p.evaluate((k) => {
        const a = JSON.parse(localStorage.getItem(k)).items;
        const bad = [];
        document.getElementById("answer").classList.remove("hidden");
        for (const x of a) {
          document.getElementById("qText").textContent = x.question;
          document.getElementById("answer").textContent = x.answer;
          if (document.documentElement.scrollWidth > innerWidth) bad.push(x.id);
        }
        return bad;
      }, key);
      assert.deepEqual(allContentOverflow, []);
      assert.deepEqual(errors, []);
      assert(alerts.some((x) => x === "导入完成。"));
      console.log(
        `PASS ${engine} ${width}px: 211 original questions, 12 chapters, sequential/random study, hints/answers, 4 grades, stars, filters, CRUD, persistence, JSON/CSV export/import, PDF selection, no overflow or JS errors`,
      );
      await p.close();
    }
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
