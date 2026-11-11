(() => {
  "use strict";
  const KEY = "yanxicang_838_water_v1";
  const $ = (id) => document.getElementById(id);
  // Review dates are displayed as calendar dates in China standard time.
  const reviewDay = (time) => Math.floor((Number(time) + 8 * 3600000) / 86400000);
  function isDue(item, now = Date.now()) {
    const time = Number(item.next);
    return !!item.history?.length && Number.isFinite(time) && time >= 0 &&
      reviewDay(time) <= reviewDay(now);
  }
  const scheduler = ReviewScheduler;
  let beyondBudget = false;
  let formalReview = false, reviewIds = null, queueDay = null, shownAt = Date.now();
  let storageReadable = true;
  let state = { items: [] };
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s !== null) {
      if (!s || !Array.isArray(s.items)) throw Error("Invalid stored record");
      state = s;
    }
  } catch (e) {
    storageReadable = false;
    alert(
      "本地数据读取失败，原始记录已保留。请先下载原始记录，再导入备份恢复。",
    );
  }
  // Preserve the exact pre-upgrade JSON before any migration can write.
  if (storageReadable && !state.scheduleVersion) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw && !localStorage.getItem(KEY + '.before-smart-review')) {
        if (!Array.isArray(JSON.parse(raw).items)) throw Error('Invalid backup');
        localStorage.setItem(KEY + '.before-smart-review', raw);
        if (localStorage.getItem(KEY + '.before-smart-review') !== raw) throw Error('Backup failed');
      }
    } catch (_) { storageReadable = false; alert('升级备份未完成，已阻止写入。请先导出原始记录。'); }
  }
  if (storageReadable && state.bundledVersion !== BUNDLE_VERSION) {
    const previous = state.items
      .filter((x) => /^pdf-water-ch9-review-/.test(x.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    const old8 = FULL_SEED.filter(
      (x) => x.chapter.startsWith("第9章") && x.section === "课后习题详解",
    ).slice(0, 8);
    for (let i = 0; i < Math.min(previous.length, old8.length); i++) {
      old8[i].history = previous[i].history || [];
      old8[i].next = previous[i].next || 0;
      old8[i].interval = previous[i].interval || 0;
      old8[i].master = !!previous[i].master;
      old8[i].star = !!previous[i].star;
    }
    state.items = state.items.filter(
      (x) => !/^pdf-water-ch9-review-/.test(x.id),
    );
    const ids = new Set(state.items.map((x) => x.id));
    for (const x of FULL_SEED) {
      if (!ids.has(x.id)) {
        state.items.push(x);
        ids.add(x.id);
      }
    }
    state.bundledVersion = BUNDLE_VERSION;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert("浏览器空间不足，题库已加载但进度可能无法永久保存，请导出备份。");
    }
  }
  // Additive migration, independent of the preserved water bundle and its IDs.
  if (storageReadable && state.environmentVersion !== ENVIRONMENT_VERSION) {
    const ids = new Set(state.items.map((x) => x.id));
    for (const item of ENVIRONMENT_SEED) {
      if (!ids.has(item.id)) state.items.push(structuredClone(item));
    }
    // Upgrade shipped answers only when the stored answer still equals its
    // previous bundled value. User edits and all recall history stay intact.
    const bundled = new Map(ENVIRONMENT_SEED.map((x) => [x.id, x]));
    for (const item of state.items) {
      const update = ENVIRONMENT_ANSWER_UPDATES[item.id];
      if (!update || item.answer !== update.previousAnswer) continue;
      const fresh = bundled.get(item.id);
      for (const field of ["answer", "answerKind", "answerSources", "answerRevision",
        "answerStatus", "reviewReasons", "needsReview", "verified"])
        item[field] = structuredClone(fresh[field]);
    }
    state.environmentVersion = ENVIRONMENT_VERSION;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (_) { alert("题库已加载，浏览器空间不足，请导出备份以保留记录。"); }
  }
  scheduler.migrate(state);
  let current = null,
    queue = [],
    pdfUrl = null;
  const validTypes = ["名词解释", "填空题", "简答题", "论述题", "计算分析题"];
  function save() {
    if (!storageReadable) {
      alert("原始记录尚未恢复，已阻止覆盖。请先下载原始记录。");
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert("保存失败：浏览器存储空间不足。请先导出备份。");
    }
    renderStats();
  }
  function unique() {
    return (
      "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
    );
  }
  function norm(x) {
    const v = { ...x };
    v.chapter = String(x.chapter || x["章节"] || "未分类").trim();
    v.type = String(x.type || x["题型"] || "简答题").trim();
    v.question = String(x.question || x.title || x["题目"] || x["原题"] || "").trim();
    v.answer = String(x.answer || x["答案"] || "").trim();
    v.topic = String(x.topic || x["知识点"] || "").trim();
    v.source = String(x.source || x["来源"] || "").trim();
    v.hint = String(x.hint || x["提示"] || "").trim();
    v.verified =
      x.verified === true || x.verified === "true" || x["已核对"] === true;
    v.id = x.id || unique();
    for (const field of ["pastExamYears", "reviewReasons", "excerpts", "references", "additionalSources", "replaces", "answerSources"]) {
      if (typeof v[field] === "string" && v[field]) { try { v[field] = JSON.parse(v[field]); } catch (_) { v[field] = []; } }
    }
    if (v.needsReview === "true") v.needsReview = true;
    if (v.needsReview === "false") v.needsReview = false;
    v.history = Array.isArray(x.history) ? x.history : [];
    v.next = Number(x.next) || 0;
    v.interval = Number(x.interval) || 0;
    v.star = !!x.star;
    v.master = !!x.master;
    return v;
  }
  function eligible(x) {
    return (
      x.question &&
      validTypes.includes(x.type) &&
      !/选择题|单项选择|多项选择|单选|多选/.test(x.type)
    );
  }
  const categoryNames = { knowledge: "知识点背诵", exercise: "课后习题", supplement: "新版新增" };
  const subjectOf = (x) => x.subject || "水污染控制工程";
  const categoryOf = (x) => x.category || (/课后习题/.test(x.section || "") ? "exercise" : "knowledge");
  const archived = (x) => ["removed", "replaced", "original-only"].includes(x.version);
  function scopeMatches(x, prefix) {
    const subject = $(prefix + "Subject").value, category = $(prefix + "Category").value,
      version = $(prefix + "Version").value;
    return (!subject || subjectOf(x) === subject) && (!category || categoryOf(x) === category) &&
      (version === "all" || (version === "current" && !archived(x)) ||
       (version === "archive" && archived(x)) || (version === "original" && x.version !== "new"));
  }
  function chapters(prefix) {
    return [...new Set(state.items.filter((x) => !prefix || scopeMatches(x, prefix)).map((x) => x.chapter))].sort((a, b) =>
      a.localeCompare(b, "zh-CN", { numeric: true }),
    );
  }
  function fillSelect(el, all = "全部章节") {
    const old = el.value;
    el.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = all;
    el.append(option);
    for (const c of chapters(el.id === "bankChapter" ? "bank" : "study")) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      el.append(o);
    }
    el.value = [...el.options].some((o) => o.value === old) ? old : "";
  }
  function renderStats() {
    const a = state.items,
      now = Date.now();
    $("sTotal").textContent = a.length;
    $("sDone").textContent = a.filter((x) => x.history.length).length;
    $("sDue").textContent = a.filter(
      (x) => isDue(x, now),
    ).length;
    $("sMaster").textContent = a.filter((x) => x.master).length;
    fillSelect($("chapterFilter"));
    fillSelect($("bankChapter"));
    renderBank();
    renderDashboard();
    renderReview();
  }
  function show(view) {
    document
      .querySelectorAll("main section")
      .forEach((x) => x.classList.toggle("hidden", x.id !== view));
    const active = ["edit", "data", "pdf"].includes(view) ? "tools" : view;
    document.querySelectorAll("[data-view]").forEach((x) => {
      x.classList.toggle("active", x.dataset.view === active);
      if (x.dataset.view === active) x.setAttribute("aria-current", "page");
      else x.removeAttribute("aria-current");
    });
    $("breadcrumb").textContent = {
      home: "学习首页",
      study: "闭卷背诵",
      bank: "章节题库",
      review: "复习记录",
      tools: "工具与设置",
      edit: "录入题目",
      data: "导入与备份",
      pdf: "PDF 对照",
    }[view];
    document.querySelector(".nav-more").open = false;
    document.querySelector(".nav-more > summary").classList.toggle("active", ["review", "tools"].includes(active));
    document.body.classList.toggle("studying", view === "study");
    if (view === "bank") renderBank();
    if (view === "review" || view === "home") refreshReviewStatus();
    scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
  // Keep the lightweight navigation menu dismissible with touch and keyboard.
  const moreMenu = document.querySelector(".nav-more");
  document.addEventListener("click", (event) => {
    if (!moreMenu.contains(event.target)) moreMenu.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && moreMenu.open) {
      moreMenu.open = false;
      moreMenu.querySelector("summary").focus();
    }
  });
  function pool() {
    const ch = $("chapterFilter").value,
      ty = $("typeFilter").value,
      m = $("modeFilter").value,
      now = Date.now();
    if (m === "due") {
      if (!reviewIds || queueDay !== reviewDay(now)) {
        reviewIds = scheduler.plan(state).selected.map(x => x.id); queueDay = reviewDay(now);
      }
      return reviewIds.map(id => state.items.find(x => x.id === id)).filter(x => x &&
        !x.history.some(h => h.kind === 'review' && scheduler.day(h.at) === scheduler.day(Date.now()))).slice(0, beyondBudget ? Infinity : scheduler.plan(state, now).capacity);
    }
    return state.items.filter(
      (x) =>
        scopeMatches(x, "study") &&
        (!ch || x.chapter === ch) &&
        (!ty || x.type === ty) &&
        (m === "all" ||
          (m === "due" && isDue(x, now)) ||
          (m === "new" && !x.history.length) ||
          (m === "weak" && x.history.length && x.history.at(-1).grade <= 1) ||
          (m === "star" && x.star)),
    );
  }
  function next(step = 1) {
    const p = pool();
    if (!p.length) {
      $("studyEmpty").textContent = $("modeFilter").value === 'due'
        ? '本轮已完成或今日预算已用完。未完成到期题仍保留，可返回首页或选择继续预算外复习。'
        : state.items.length
        ? "当前筛选条件下没有题目，请切换章节或复习范围。"
        : "题库为空。先添加或导入已核对的主观题。";
      $("studyEmpty").classList.remove("hidden");
      $("qArea").classList.add("hidden");
      current = null;
      $("studyPosition").textContent = "暂无匹配题目";
      return;
    }
    let x;
    if ($("orderMode").value === "random") {
      const others = p.filter((y) => y.id !== current);
      const a = others.length ? others : p;
      x = a[Math.floor(Math.random() * a.length)];
    } else {
      const idx = p.findIndex((y) => y.id === current);
      const nextIdx =
        idx < 0
          ? step < 0
            ? p.length - 1
            : 0
          : Math.max(0, Math.min(p.length - 1, idx + step));
      x = p[nextIdx];
    }
    showQ(x);
  }
  function showQ(x) {
    current = x.id;
    shownAt = Date.now();
    const list = pool();
    const idx = list.findIndex((y) => y.id === x.id);
    $("studyPosition").textContent =
      idx >= 0
        ? `第 ${idx + 1} / ${list.length} 题`
        : "当前题目（不在筛选范围内）";
    $("prev").disabled = $("orderMode").value === "sequential" && idx <= 0;
    $("studyEmpty").classList.add("hidden");
    $("qArea").classList.remove("hidden");
    $("meta").textContent = [
      subjectOf(x), categoryNames[categoryOf(x)], archived(x) ? "旧版保留" : "",
      x.importance == null ? "" : "★".repeat(x.importance), (x.pastExamYears || []).join("、"),
      x.chapter,
      x.type,
      x.topic,
      x.source,
      x.verified ? "已核对" : x.subject ? (x.needsReview ? "待核对" : "原文提取") : "OCR待核对",
    ]
      .filter(Boolean)
      .join(" · ");
    $("readingMeta").textContent = x.chapter + " · " + x.type;
    $("qText").textContent = x.question;
    const pg = document.getElementById("pageJump");
    if (pg) {
      pg.href =
        (x.sourceUrl || "https://drive.google.com/file/d/1WTmRkDTVCt8E8jOl35EtkEe0UWXHWeM7/view") + "#page=" +
        (x.page || 1);
      pg.textContent = "查看原PDF第" + (x.page || "?") + "页（联网）";
    }
    renderAnswer($("answer"), x);
    $("hint").textContent = x.hint || x.topic || "这道题暂无提示。";
    $("hint").classList.add("hidden");
    $("answer").classList.add("hidden");
    $("selfGrade").classList.add("hidden");
    $("lastRecall").textContent = lastRecall(x);
    $("starBtn").textContent = x.star ? "★ 已收藏" : "☆ 收藏";
    $("quickJump").replaceChildren(
      ...list.map((q, i) => {
        const o = elt(
          "option",
          String(i + 1) + " · " + q.question.slice(0, 26),
        );
        o.value = q.id;
        return o;
      }),
    );
    $("quickJump").value = x.id;
    $("roundProgress").max = Math.max(1, list.length);
    $("roundProgress").value = idx + 1;
    try {
      localStorage.setItem("838.lastQuestion", x.id);
    } catch (_) {}
    $("revealBtn").textContent = "显示答案";
    $("revealBtn").setAttribute("aria-expanded", "false");
    $("hintBtn").setAttribute("aria-expanded", "false");
  }
  $("next").onclick = () => next(1);
  $("prev").onclick = () => next(-1);
  $("orderMode").onchange = () => {
    current = null;
    $("next").textContent =
      $("orderMode").value === "random" ? "随机抽一题" : "下一题 →";
    $("prev").classList.toggle("hidden", $("orderMode").value === "random");
    next();
  };
  $("hintBtn").onclick = () => {
    const hidden = $("hint").classList.toggle("hidden");
    $("hintBtn").setAttribute("aria-expanded", String(!hidden));
  };
  $("revealBtn").onclick = () => {
    const hidden = $("answer").classList.toggle("hidden");
    $("revealBtn").textContent = hidden ? "显示答案" : "收起答案";
    $("revealBtn").setAttribute("aria-expanded", String(!hidden));
    $("selfGrade").classList.toggle(
      "hidden",
      hidden || !state.items.find((y) => y.id === current)?.answer.trim(),
    );
  };
  $("starBtn").onclick = () => {
    let x = state.items.find((x) => x.id === current);
    if (!x) return;
    x.star = !x.star;
    save();
    $("starBtn").textContent = x.star ? "★ 已收藏" : "☆ 收藏";
  };
  document.querySelectorAll("[data-grade]").forEach(
    (b) =>
      (b.onclick = () => {
        const x = state.items.find((y) => y.id === current);
        if (!x || !x.answer.trim()) return;
        const grade = +b.dataset.grade;
        scheduler.grade(state, x, grade, Date.now(),
          formalReview && !document.hidden ? (Date.now() - shownAt) / 1000 : null,
          formalReview && $("modeFilter").value === 'due');
        save();
        next();
      }),
  );
  function elt(tag, text, cls) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }
  function lastRecall(x) {
    const h = x.history?.at(-1);
    if (!h) return "未背过";
    const date = new Date(h.at).toLocaleDateString("zh-CN", {
      timeZone: "Asia/Shanghai", month: "numeric", day: "numeric",
    });
    return `上次 ${date} · ${gradeLabels[h.grade] || "未评分"}`;
  }
  function renderAnswer(root, x) {
    root.replaceChildren(elt("div", (x.answerKind === "compiled" ? (/^整理答案/.test(x.answer) ? "" : "整理答案：\n") :
      x.answerKind === "unavailable" ? "待核对：\n" : "参考答案：\n") +
      (x.answer || "原资料未提供答案，待核对。")));
    for (const note of x.reviewReasons || []) root.append(elt("p", "待核对：" + note, "mini"));
    if (x.references?.length) root.append(elt("p", "教材关联：" + x.references.map((r) => r.title).join("；"), "mini"));
    if (x.answerSources?.length) {
      const sources = elt("details", undefined, "answer-sources");
      sources.append(elt("summary", "整理答案 · 来源"));
      for (const source of x.answerSources) {
        if (!/^https:\/\//.test(source.url)) continue;
        const line = elt("div"), link = elt("a", source.title);
        link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer";
        line.append(link); sources.append(line);
      }
      root.append(sources);
    }
    const excerpts = x.excerpts?.length ? x.excerpts :
      (WATER_SOURCE_EXCERPTS.items[x.id]?.excerpts || []);
    if (excerpts.length) {
      const details = elt("details", undefined, "source-excerpts");
      details.append(elt("summary", "查看对应原文（含图片、公式与表格）"));
      for (const excerpt of excerpts) {
        const fig = elt("figure"), img = elt("img");
        img.src = excerpt.src; img.alt = `${x.question} · 原PDF第${excerpt.page}页`; img.loading = "lazy";
        fig.append(img, elt("figcaption", `原PDF第${excerpt.page}页${excerpt.printedPage == null ? "" : ` · 书内第${excerpt.printedPage}页`}`, "mini")); details.append(fig);
      }
      root.append(details);
    }
  }
  function renderBank() {
    const root = $("bankItems"),
      open = new Set(
        [...root.querySelectorAll("details[open]")].map(
          (d) => d.dataset.chapter,
        ),
      );
    root.replaceChildren();
    const key = $("search").value.trim().toLowerCase(),
      ch = $("bankChapter").value,
      ty = $("bankType").value,
      status = $("bankStatus").value;
    const arr = state.items.filter(
      (x) =>
        scopeMatches(x, "bank") &&
        (!ch || x.chapter === ch) &&
        (!ty || x.type === ty) &&
        (!key ||
          [x.question, x.chapter, x.topic, x.source, ...(x.pastExamYears || [])]
            .join(" ")
            .toLowerCase()
            .includes(key)) &&
        (status === "all" ||
          (status === "star" && x.star) ||
          (status === "master" && x.master) ||
          (status === "new" && !x.history.length) ||
          (status === "weak" &&
            x.history.length &&
            x.history.at(-1).grade <= 1)),
    );
    $("bankCount").textContent = `符合条件 ${arr.length} 题 · 按章节浏览`;
    if (!arr.length) {
      root.append(elt("p", "没有匹配题目，请调整筛选条件。", "muted"));
      return;
    }
    for (const chapter of [...new Set(arr.map((x) => subjectOf(x) + " · " + x.chapter))]) {
      const group = elt("details");
      group.dataset.chapter = chapter;
      group.open = !!key || !!ch || open.has(chapter);
      const items = arr.filter((x) => subjectOf(x) + " · " + x.chapter === chapter);
      group.append(elt("summary", chapter + " · " + items.length + " 题"));
      for (const x of items) {
        const d = elt("div", undefined, "listItem"),
          l = elt("div");
        l.style.flex = "1";
        l.append(elt("div", x.question, "title"));
        l.append(elt("div", lastRecall(x), "last-recall"));
        l.append(
          elt(
            "div",
            [
              x.type,
              categoryNames[categoryOf(x)], archived(x) ? "旧版保留" : "",
              x.topic || "未标注知识点",
              x.master ? "已掌握" : x.history.length ? "学习中" : "未学习",
              x.verified ? "已核对" : x.subject ? (x.needsReview ? "待核对" : "原文提取") : "OCR待核对",
              x.source,
            ].join(" · "),
            "mini",
          ),
        );
        const answerToggle = elt("details", undefined, "bank-answer");
        answerToggle.append(elt("summary", "显示 / 隐藏答案"));
        answerToggle.addEventListener("toggle", () => {
          if (answerToggle.open && answerToggle.children.length === 1) {
            const content = elt("div", undefined, "answer-text");
            renderAnswer(content, x); answerToggle.append(content);
          }
        });
        l.append(answerToggle);
        const b = elt("div", undefined, "actions"),
          study = elt("button", "背诵"),
          star = elt("button", x.star ? "★ 已收藏" : "☆ 收藏"),
          edit = elt("button", "编辑"),
          del = elt("button", "删除");
        study.onclick = () => {
          $("studySubject").value = subjectOf(x);
          $("studyCategory").value = categoryOf(x);
          $("studyVersion").value = archived(x) ? "archive" : "current";
          fillSelect($("chapterFilter")); $("chapterFilter").value = x.chapter;
          show("study");
          showQ(x);
        };
        star.onclick = () => {
          x.star = !x.star;
          save();
        };
        star.setAttribute(
          "aria-label",
          (x.star ? "取消收藏：" : "收藏：") + x.question,
        );
        edit.onclick = () => editItem(x);
        del.onclick = () => {
          if (confirm("确定删除该题及其复习记录？")) {
            state.items = state.items.filter((y) => y.id !== x.id);
            save();
            if (current === x.id) next();
          }
        };
        b.append(study, star, edit, del);
        d.append(l, b);
        group.append(d);
      }
      root.append(group);
    }
  }
  $("bankType").onchange = renderBank;
  $("bankStatus").onchange = renderBank;
  $("search").oninput = renderBank;
  $("bankChapter").onchange = renderBank;
  for (const prefix of ["study", "bank"]) {
    for (const field of ["Subject", "Category", "Version"]) {
      $(prefix + field).onchange = () => {
        fillSelect($(prefix === "study" ? "chapterFilter" : "bankChapter"));
        if (prefix === "study") { current = null; next(); } else renderBank();
      };
    }
  }
  function editItem(x) {
    $("qid").value = x.id;
    for (const [id, k] of [
      ["qChapter", "chapter"],
      ["qType", "type"],
      ["qQuestion", "question"],
      ["qAnswer", "answer"],
      ["qTopic", "topic"],
      ["qSource", "source"],
      ["qHint", "hint"],
    ])
      $(id).value = x[k] || "";
    $("qVerified").checked = x.verified;
    $("editHeading").textContent = "编辑题目";
    show("edit");
  }
  function resetForm() {
    $("qForm").reset();
    $("qid").value = "";
    $("editHeading").textContent = "录入原题";
  }
  $("resetForm").onclick = resetForm;
  $("editCurrent").onclick = () => {
    const x = state.items.find((y) => y.id === current);
    if (x) editItem(x);
  };
  $("qForm").onsubmit = (e) => {
    e.preventDefault();
    const id = $("qid").value;
    const old = state.items.find((x) => x.id === id) || {};
    const x = norm({
      ...old,
      id: id || unique(),
      chapter: $("qChapter").value,
      type: $("qType").value,
      question: $("qQuestion").value,
      answer: $("qAnswer").value,
      topic: $("qTopic").value,
      source: $("qSource").value,
      hint: $("qHint").value,
      verified: $("qVerified").checked,
    });
    if (!eligible(x)) {
      alert("请输入非选择题原题。");
      return;
    }
    if (id) {
      state.items = state.items.map((v) => (v.id === id ? x : v));
    } else state.items.push(x);
    save();
    resetForm();
    alert("已保存到本机题库。");
    show("bank");
  };
  function parseCSV(s) {
    s = s.replace(/^\ufeff/, "");
    const rows = [],
      line = [];
    let cell = "",
      quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') {
        if (quoted && s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = !quoted;
      } else if (c === "," && !quoted) {
        line.push(cell);
        cell = "";
      } else if ((c === "\n" || c === "\r") && !quoted) {
        if (c === "\r" && s[i + 1] === "\n") i++;
        line.push(cell);
        if (line.some((x) => x.trim())) rows.push(line.slice());
        line.length = 0;
        cell = "";
      } else cell += c;
    }
    line.push(cell);
    if (line.some((x) => x.trim())) rows.push(line);
    const headers = rows.shift() || [];
    return rows.map((r) =>
      Object.fromEntries(headers.map((h, i) => [h.trim(), r[i] || ""])),
    );
  }
  $("importFile").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const raw = file.name.toLowerCase().endsWith(".csv")
        ? parseCSV(txt)
        : JSON.parse(txt);
      const data = Array.isArray(raw) ? raw : raw.items;
      if (!Array.isArray(data)) throw Error("文件中没有题目数组");
      const fullBackup = !Array.isArray(raw) && Array.isArray(raw.items) &&
        !file.name.toLowerCase().endsWith('.csv');
      const arr = data.map(x => fullBackup && typeof x.id === 'string' &&
        typeof x.question === 'string' && typeof x.answer === 'string' && Array.isArray(x.history)
        ? { ...x } : norm(x)).filter(eligible);
      const skipped = data.length - arr.length;
      let merged = $("replaceImport").checked ? [] : state.items.slice();
      const ids = new Set(merged.map((x) => x.id));
      for (const x of arr) {
        if (
          file.name.toLowerCase().endsWith(".csv") &&
          !$("replaceImport").checked
        ) {
          const existing = merged.find(
            (y) =>
              subjectOf(y) === subjectOf(x) && categoryOf(y) === categoryOf(x) &&
              y.version === x.version && y.section === x.section &&
              y.chapter === x.chapter &&
              y.type === x.type &&
              y.question === x.question,
          );
          if (existing) x.id = existing.id;
        }
        if (ids.has(x.id)) {
          const i = merged.findIndex((y) => y.id === x.id);
          merged[i] = file.name.toLowerCase().endsWith(".csv")
            ? {
                ...merged[i], ...x,
                history: merged[i].history,
                next: merged[i].next,
                interval: merged[i].interval,
                master: merged[i].master,
                star: merged[i].star,
              }
            : x;
        } else {
          merged.push(x);
          ids.add(x.id);
        }
      }
      if (
        !confirm(
          `识别出 ${arr.length} 道非选择题，排除 ${skipped} 条无效或选择题记录。${$("replaceImport").checked ? "将替换现有题库。" : "将合并到现有题库。"}继续吗？`,
        )
      )
        return;
      // Keep a recoverable full snapshot before the user-confirmed import.
      const beforeImport = localStorage.getItem(KEY);
      if (beforeImport) localStorage.setItem(KEY + '.before-import', beforeImport);
      // Retain existing learning records even when replacing/importing an older backup.
      for (const old of state.items.filter(x => x.history?.length)) {
        const incoming = merged.find(x => x.id === old.id);
        if (!incoming) { merged.push(old); continue; }
        const records = new Map();
        for (const h of [...old.history, ...incoming.history]) records.set(JSON.stringify(h), h);
        const newestOld = old.history.at(-1)?.at || 0;
        const newestIncoming = incoming.history.at(-1)?.at || 0;
        if (newestOld > newestIncoming) {
          for (const field of ['schedule', 'next', 'interval', 'master']) incoming[field] = old[field];
        }
        incoming.history = [...records.values()].sort((a,b) => a.at-b.at);
      }
      storageReadable = true;
      // JSON restores the full top-level scheduling structure as well as items.
      if (!Array.isArray(raw) && !file.name.toLowerCase().endsWith('.csv')) {
        state = { ...state, ...raw, items: merged };
      } else state.items = merged;
      scheduler.migrate(state);
      syncReviewSettings();
      reviewIds = null;
      formalReview = false;
      save();
      alert("导入完成。");
    } catch (err) {
      alert("导入失败：" + err.message);
    }
    e.target.value = "";
  };
  function download(name, txt, type) {
    const url = URL.createObjectURL(new Blob([txt], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  $("exportJson").onclick = () =>
    download(
      "838背诵完整备份.json",
      JSON.stringify(
        { ...state, exportedAt: new Date().toISOString() },
        null,
        2,
      ),
      "application/json",
    );
  $("exportCsv").onclick = () => {
    const cols = [
      "id",
      "chapter",
      "type",
      "question",
      "answer",
      "topic",
      "source",
      "hint",
      "verified", "subject", "section", "category", "version", "importance", "pastExamYears",
      "needsReview", "reviewReasons", "answerKind", "sourceUrl", "page", "excerpts", "references",
      "originalChapter", "originalSection", "additionalSources", "replacedBy", "replaces",
      "answerSources", "answerRevision", "answerStatus",
    ];
    const quote = (x) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
    download(
      "838题库.csv",
      "\ufeff" +
        [
          cols.join(","),
          ...state.items.map((x) => cols.map((k) => quote(typeof x[k] === "object" ? JSON.stringify(x[k]) : x[k])).join(",")),
        ].join("\r\n"),
      "text/csv;charset=utf-8",
    );
  };
  $("clearData").onclick = () => {
    if (
      prompt("此操作不能撤销。输入「清空」确认删除所有本机题目和进度") !==
      "清空"
    )
      return;
    state = { items: [], bundledVersion: BUNDLE_VERSION };
    save();
    next();
  };
  $("pdfFile").onchange = (e) => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    const f = e.target.files[0];
    if (!f) return;
    pdfUrl = URL.createObjectURL(f);
    $("pdfViewer").src = pdfUrl;
    $("pdfContainer").classList.remove("hidden");
  };
  $("chapterFilter").onchange = () => {
    current = null;
    next();
  };
  $("typeFilter").onchange = () => {
    current = null;
    next();
  };
  $("modeFilter").onchange = () => {
    formalReview = $("modeFilter").value === "due"; beyondBudget = false; reviewIds = null;
    current = null;
    next();
  };
  function startReview(id) {
    $("studySubject").value = "";
    $("studyCategory").value = "";
    $("studyVersion").value = "all";
    fillSelect($("chapterFilter"));
    $("chapterFilter").value = "";
    $("typeFilter").value = "";
    $("modeFilter").value = "due";
    formalReview = true; beyondBudget = false;
    reviewIds = scheduler.plan(state).selected.map(x => x.id); queueDay = reviewDay(Date.now());
    state.reviewPlan = { day: reviewDay(Date.now()), ids: reviewIds.slice(), beyondBudget: false };
    for (const x of state.items) if (reviewIds.includes(x.id)) x.schedule.lastScheduledDay = state.reviewPlan.day;
    save();
    current = null;
    const item = typeof id === "string" && state.items.find((x) => x.id === id);
    if (item && reviewIds.includes(item.id)) showQ(item);
    else next();
    show("study");
  }
  function refreshReviewStatus() {
    $("sDue").textContent = state.items.filter((x) => isDue(x)).length;
    renderDashboard();
    renderReview();
    if (!$("study").classList.contains("hidden") &&
        $("modeFilter").value === "due" && !current) next();
  }
  function renderDashboard() {
    const now = Date.now(),
      today = reviewDay(now),
      a = state.items;
    const attempts = a
      .flatMap((x) => x.history)
      .filter((h) => reviewDay(h.at) === today).length;
    const due = a.filter((x) => isDue(x, now)).length;
    $("todayDate").textContent = new Date().toLocaleDateString("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
    $("todayMessage").textContent = attempts
      ? `今天已完成 ${attempts} 次主动回忆`
      : "从一道题开始，进入学习状态";
    const plan = scheduler.plan(state, now), config = state.reviewSettings;
    const learned = a.filter(x => x.schedule.learnedAt != null && reviewDay(x.schedule.learnedAt) === today).length;
    const reviewed = a.filter(x => x.history.some(h => h.kind === 'review' && reviewDay(h.at) === today)).length;
    $("sTotal").textContent = learned;
    $("sDone").textContent = reviewed;
    $("sMaster").textContent = (plan.backlogSeconds / (config.minutes * 60)).toFixed(1);
    $("todaySummary").textContent = `${due} 题到期未完成 · 积压约 ${Math.ceil(plan.backlogSeconds / 60)} 分钟 · 今日预算剩余可安排 ${plan.capacity} 题。` +
      (plan.backlogSeconds > config.minutes * 60 ? '复习压力较大，可分段完成或手动调整预算；新背数量不限。' : '可以随时停止，未完成题继续保留。');
    const root = $("chapterProgress");
    root.replaceChildren();
    for (const ch of chapters()) {
      const list = a.filter((x) => x.chapter === ch),
        done = list.filter((x) => x.history.length).length,
        master = list.filter((x) => x.master).length;
      const row = elt("button", undefined, "chapter-row");
      const title = elt("span", subjectOf(list[0]) + " · " + ch);
      const detail = elt(
        "span",
        `${done} / ${list.length} 已练习 · ${master} 已掌握`,
        "mini",
      );
      const bar = elt("progress");
      bar.max = list.length;
      bar.value = done;
      bar.setAttribute("aria-label", ch + "练习进度");
      row.append(title, bar, detail);
      row.onclick = () => {
        $("studySubject").value = subjectOf(list[0]);
        $("studyCategory").value = ""; $("studyVersion").value = "current";
        fillSelect($("chapterFilter"));
        $("chapterFilter").value = ch;
        $("typeFilter").value = "";
        $("modeFilter").value = "all";
        current = null;
        next();
        show("study");
      };
      root.append(row);
    }
  }
  const gradeLabels = ["完全不会", "需要提示", "有少量遗漏", "独立完整回答"];
  function renderReview() {
    const due = state.items.filter(
      (x) => isDue(x),
    );
    $("reviewSummary").textContent =
      `今天有 ${due.length} 道到期题目。复习后按真实表现评分。`;
    $("reviewDue").disabled = !due.length;
    $("startDue").disabled = !due.length;
    const root = $("dueItems");
    root.replaceChildren();
    if (!due.length)
      root.append(elt("p", "暂时没有到期题目，可以继续学习新题。", "empty"));
    for (const x of due) {
      const b = elt("button", x.question, "review-question");
      b.onclick = () => startReview(x.id);
      root.append(b);
    }
    const mastery = $("masterySummary");
    mastery.replaceChildren();
    for (let g = 3; g >= 0; g--) {
      const n = state.items.filter(
        (x) => x.history.length && x.history.at(-1).grade === g,
      ).length;
      const d = elt("div");
      d.append(elt("strong", String(n)), elt("span", gradeLabels[g], "mini"));
      mastery.append(d);
    }
    const history = state.items
        .flatMap((x) => x.history.map((h) => ({ x, h })))
        .sort((a, b) => b.h.at - a.h.at)
        .slice(0, 100),
      list = $("historyItems");
    list.replaceChildren();
    if (!history.length)
      list.append(
        elt("p", "完成第一次自评后，复习记录会出现在这里。", "empty"),
      );
    for (const { x, h } of history) {
      const d = elt("div", undefined, "history-row");
      const b = elt("button", x.question, "history-question");
      b.onclick = () => {
        show("study");
        showQ(x);
      };
      d.append(
        b,
        elt(
          "div",
          `${new Date(h.at).toLocaleString("zh-CN")} · ${gradeLabels[h.grade] || "未评分"}${h === x.history.at(-1) ? " · 间隔 " + x.interval + " 天 · 下次 " + new Date(x.next).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : ""}`,
          "mini",
        ),
      );
      list.append(d);
    }
  }
  $("continueStudy").onclick = () => {
    formalReview = false; reviewIds = null;
    $("modeFilter").value = 'new';
    let id;
    try {
      id = localStorage.getItem("838.lastQuestion");
    } catch (_) {}
    const x = state.items.find((x) => x.id === id);
    show("study");
    if (x && !x.history.length) showQ(x);
    else { current = null; next(); }
  };
  $("startDue").onclick = startReview;
  $("reviewDue").onclick = startReview;
  $("quickJump").onchange = (e) => {
    const x = state.items.find((x) => x.id === e.target.value);
    if (x) showQ(x);
  };
  $("focusToggle").onclick = () => {
    const enabled = document.body.classList.toggle("focus");
    $("focusToggle").textContent = enabled ? "退出沉浸" : "进入沉浸";
    $("focusToggle").setAttribute("aria-pressed", String(enabled));
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("focus"))
      $("focusToggle").click();
    if (
      !document.body.classList.contains("studying") ||
      /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName) ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
    if (e.key === "ArrowLeft" && $("orderMode").value === "sequential") {
      e.preventDefault();
      next(-1);
    }
  });
  const FONT_KEY = "838.fontSizes";
  const fontFields = {
    Question: { property: "--reading-question", target: "qText", min: 19, max: 48 },
    Answer: { property: "--reading-answer", target: "answer", min: 16, max: 32 },
    Auxiliary: { property: "--reading-auxiliary", target: "lastRecall", min: 10, max: 18 },
  };
  let fontSizes = {};
  try {
    const stored = JSON.parse(localStorage.getItem(FONT_KEY));
    for (const [name, config] of Object.entries(fontFields)) {
      const value = stored?.[name];
      if (Number.isInteger(value) && value >= config.min && value <= config.max)
        fontSizes[name] = value;
    }
  } catch (_) {}
  function renderFontSizes() {
    for (const [name, config] of Object.entries(fontFields)) {
      if (fontSizes[name] !== undefined)
        document.documentElement.style.setProperty(config.property, fontSizes[name] + "px");
      else document.documentElement.style.removeProperty(config.property);
      const value = fontSizes[name] ?? Math.round(parseFloat(getComputedStyle($(config.target)).fontSize));
      $("font" + name).value = value;
      $("font" + name + "Value").textContent = value + " px";
    }
  }
  for (const name of Object.keys(fontFields)) {
    $("font" + name).addEventListener("input", (event) => {
      const value = Number(event.target.value), config = fontFields[name];
      if (!Number.isInteger(value) || value < config.min || value > config.max) return;
      fontSizes[name] = value;
      renderFontSizes();
      try { localStorage.setItem(FONT_KEY, JSON.stringify(fontSizes)); } catch (_) {}
    });
  }
  $("resetFonts").onclick = () => {
    fontSizes = {};
    try { localStorage.removeItem(FONT_KEY); } catch (_) {}
    renderFontSizes();
  };
  renderFontSizes();
  function updateTheme() {
    const dark = document.documentElement.dataset.theme === "dark";
    $("themeToggle").textContent = dark ? "切换浅色模式" : "切换深色模式";
    $("themeToggle").setAttribute("aria-pressed", String(dark));
    document.querySelector('meta[name="theme-color"]').content = dark
      ? "#191b19"
      : "#FAFAF8";
  }
  $("themeToggle").onclick = () => {
    document.documentElement.dataset.theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("838.theme", document.documentElement.dataset.theme);
    } catch (_) {}
    updateTheme();
  };
  updateTheme();
  $("sidebarToggle").onclick = () => {
    const collapsed = document.body.classList.toggle("sidebar-collapsed");
    $("sidebarToggle").setAttribute("aria-expanded", String(!collapsed));
    $("sidebarToggle").textContent = collapsed ? "展开次级导航" : "紧凑导航";
    $("sidebarToggle").setAttribute(
      "aria-label",
      collapsed ? "展开次级导航" : "切换紧凑导航",
    );
  };
  $("migrationBackup").onclick = () => download('838升级前完整备份.json',
    localStorage.getItem(KEY + '.before-smart-review') || localStorage.getItem(KEY) || '{}', 'application/json');
  $("rawBackup").onclick = () => {
    try {
      download(
        "838原始存储记录.json",
        localStorage.getItem(KEY) || "{}",
        "application/json",
      );
    } catch (_) {
      alert("浏览器不允许读取本地记录。");
    }
  };
  // Associate all form labels, including the retained original forms.
  document.querySelectorAll("label").forEach((l) => {
    if (l.querySelector('input[type="checkbox"]'))
      l.classList.add("checkbox-label");
    const el = l.nextElementSibling;
    if (!l.htmlFor && el?.id && /INPUT|SELECT|TEXTAREA/.test(el.tagName))
      l.htmlFor = el.id;
  });
  function offlineMessage(message) {
    $("offlineStatus").textContent = message;
  }
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    const hadOfflineController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then(async (registration) => {
        const worker = registration.installing || registration.waiting;
        if (registration.active)
          offlineMessage("离线缓存已就绪 · 学习记录保存在本机");
        if (worker)
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated")
              offlineMessage("离线缓存已就绪 · 学习记录保存在本机");
          });
      })
      .catch(() => offlineMessage("离线缓存未完成，请联网后重试"));
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      offlineMessage("离线缓存已就绪 · 学习记录保存在本机");
      // Refresh the complete new shell after an update. Keep unsaved editor
      // input in place; the new release will be used on the next navigation.
      if (hadOfflineController && !["edit", "data", "pdf"].some(
        (id) => !$(id).classList.contains("hidden"))) location.reload();
    });
  } else offlineMessage("当前环境不支持网页离线缓存");

  if (window.visualViewport) {
    const syncKeyboard = () => {
      const field = document.activeElement;
      const editing = /INPUT|TEXTAREA|SELECT/.test(field?.tagName || "");
      const open = editing && visualViewport.height < window.innerHeight * 0.78;
      document.body.classList.toggle("keyboard-open", open);
      if (open)
        requestAnimationFrame(() =>
          field.scrollIntoView({ block: "center", behavior: "instant" }),
        );
    };
    visualViewport.addEventListener("resize", syncKeyboard);
    document.addEventListener("focusout", () =>
      requestAnimationFrame(syncKeyboard),
    );
  }
  const compactStudy = matchMedia("(max-width:700px)");
  const syncStudyFilters = () => {
    $("studyFilters").open = false;
  };
  syncStudyFilters();
  if (compactStudy.addEventListener)
    compactStudy.addEventListener("change", syncStudyFilters);
  else compactStudy.addListener(syncStudyFilters);
  window.addEventListener("focus", refreshReviewStatus);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshReviewStatus();
  });
  setInterval(() => {
    if (!document.hidden) refreshReviewStatus();
  }, 60000);
  const settingsRoot = $("reviewSettings");
  function syncReviewSettings() {
    const s = state.reviewSettings;
    $("reviewMinutes").value = s.minutes;
    $("reviewSeconds").value = Math.round(s.seconds * 10) / 10;
    $("reviewSmart").checked = s.smart;
    $("reviewIntervals").value = s.intervals.join(',');
    $("reviewSuccess").value = s.success.join(',');
  }
  syncReviewSettings();
  settingsRoot.onsubmit = event => {
    event.preventDefault();
    const intervals = $("reviewIntervals").value.split(/[,，]/).map(Number);
    const success = $("reviewSuccess").value.split(/[,，]/).map(Number);
    if (intervals.length !== 4 || success.length !== 4 || [...intervals,...success].some(v=>!Number.isFinite(v)||v<1||v>365)) {
      alert('请分别填写四个 1～365 天的间隔，以逗号分隔。'); return;
    }
    state.reviewSettings = scheduler.settings({ ...state.reviewSettings, minutes: +$("reviewMinutes").value,
      seconds: +$("reviewSeconds").value, smart: $("reviewSmart").checked, intervals, success });
    reviewIds = null; save(); syncReviewSettings();
  };
  $("stopReview").onclick = () => { formalReview = false; reviewIds = null; current = null; show('home'); };
  $("extraReview").onclick = () => {
    if (!confirm('继续复习可能超出今日时间预算，是否继续？')) return;
    formalReview = true; beyondBudget = true;
    reviewIds = scheduler.plan(state, Date.now(), true).selected.map(x=>x.id); queueDay = reviewDay(Date.now());
    state.reviewPlan = { day: reviewDay(Date.now()), ids: reviewIds.slice(), beyondBudget: true };
    for (const x of state.items) if (reviewIds.includes(x.id)) x.schedule.lastScheduledDay = state.reviewPlan.day;
    save();
    $("modeFilter").value = 'due'; current = null; next(); show('study');
  };
  document.addEventListener('visibilitychange', () => { shownAt = Date.now(); });
  renderStats();
  let lastId;
  try {
    lastId = localStorage.getItem("838.lastQuestion");
  } catch (_) {}
  const lastQuestion = state.items.find((x) => x.id === lastId);
  if (lastQuestion) showQ(lastQuestion);
  else next();
  show("home");
})();
