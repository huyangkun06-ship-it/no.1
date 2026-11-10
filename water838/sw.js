"use strict";
const CACHE = "838-workbench-water-images-v7";
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=water-images-20261110-1",
  "./app.js?v=water-images-20261110-1",
  "./data/environment.js?v=water-images-20261110-1",
  "./data/water-excerpts.js?v=water-images-20261110-1",
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
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !(CORE.some((p) => new URL(p, self.registration.scope).href === url.href) ||
      ["./assets/environment/", "./assets/water/"].some((p) =>
        url.pathname.startsWith(new URL(p, self.registration.scope).pathname)))
  )
    return;
  // A cache version contains a complete shell so offline loads never mix releases.
  event.respondWith(
    caches
      .open(CACHE)
      .then(
        async (cache) =>
          (await cache.match(event.request)) || fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }),
      ),
  );
});
