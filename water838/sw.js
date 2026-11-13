"use strict";
const CACHE = "838-workbench-knowledge-v14";
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=smart-20261111-1",
  "./scheduler.js?v=smart-20261111-1",
  "./app.js?v=smart-20261111-1",
  "./data/environment.js?v=smart-20261111-1",
  "./data/water-excerpts.js?v=smart-20261111-1",
  "./knowledge/",
  "./knowledge/index.html",
  "./knowledge/knowledge.css",
  "./knowledge/knowledge.js",
  "./knowledge/data/manifest.json",
  "./knowledge/data/tree.json",
  "./knowledge/data/environment-intro.json",
  "./knowledge/data/water-pollution.json",
  "./knowledge/data/coverage.json",
  "./knowledge/vendor/katex.min.js",
  "./knowledge/vendor/katex.min.css",
  "./knowledge/vendor/fonts/KaTeX_AMS-Regular.woff2",
  "./knowledge/vendor/fonts/KaTeX_Caligraphic-Bold.woff2",
  "./knowledge/vendor/fonts/KaTeX_Caligraphic-Regular.woff2",
  "./knowledge/vendor/fonts/KaTeX_Fraktur-Bold.woff2",
  "./knowledge/vendor/fonts/KaTeX_Fraktur-Regular.woff2",
  "./knowledge/vendor/fonts/KaTeX_Main-Bold.woff2",
  "./knowledge/vendor/fonts/KaTeX_Main-BoldItalic.woff2",
  "./knowledge/vendor/fonts/KaTeX_Main-Italic.woff2",
  "./knowledge/vendor/fonts/KaTeX_Main-Regular.woff2",
  "./knowledge/vendor/fonts/KaTeX_Math-BoldItalic.woff2",
  "./knowledge/vendor/fonts/KaTeX_Math-Italic.woff2",
  "./knowledge/vendor/fonts/KaTeX_SansSerif-Bold.woff2",
  "./knowledge/vendor/fonts/KaTeX_SansSerif-Italic.woff2",
  "./knowledge/vendor/fonts/KaTeX_SansSerif-Regular.woff2",
  "./knowledge/vendor/fonts/KaTeX_Script-Regular.woff2",
  "./knowledge/vendor/fonts/KaTeX_Size1-Regular.woff2",
  "./knowledge/vendor/fonts/KaTeX_Size2-Regular.woff2",
  "./knowledge/vendor/fonts/KaTeX_Size3-Regular.woff2",
  "./knowledge/vendor/fonts/KaTeX_Size4-Regular.woff2",
  "./knowledge/vendor/fonts/KaTeX_Typewriter-Regular.woff2",
  "./manifest.webmanifest",
  "./icon.svg",
  "../icon-192.png",
  "../icon-512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("838-workbench-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const shellNavigation = event.request.mode === "navigate" &&
    ["./", "./index.html", "./knowledge/", "./knowledge/index.html"].some((p) => url.pathname === new URL(p, self.registration.scope).pathname);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !(shellNavigation || CORE.some((p) => new URL(p, self.registration.scope).href === url.href) ||
      ["./assets/environment/", "./assets/water/", "./knowledge/vendor/fonts/"].some((p) =>
        url.pathname.startsWith(new URL(p, self.registration.scope).pathname)))
  )
    return;
  // A cache version contains a complete shell so offline loads never mix releases.
  event.respondWith(
    caches
      .open(CACHE)
      .then(
        async (cache) =>
          (await cache.match(shellNavigation ? new URL(url.pathname.includes("/knowledge/") ? "./knowledge/index.html" : "./index.html", self.registration.scope).href : event.request)) || fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }),
      ),
  );
});
