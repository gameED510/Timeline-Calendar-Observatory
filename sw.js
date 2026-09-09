const CACHE_NAME = "tl-calendar-shell-v19";
const APP_SHELL = [
  "./",
  "./index.html",
  "./theme.js?v=1",
  "./styles.css?v=18",
  "./vendor/motion.js?v=1",
  "./calendar-motion.js?v=10",
  "./app.js?v=17",
  "./vendor/lucide.min.js?v=5",
  "./vendor/supabase-client.js?v=2",
  "./favicon.svg",
  "./site.webmanifest"
];
const shellUrls = new Set(APP_SHELL.map((path) => new URL(path, self.location.href).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("tl-calendar-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  if (!shellUrls.has(url.href) && request.mode !== "navigate") return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
          await cache.put("./index.html", response.clone());
          return response;
        }
        return (await cache.match("./index.html")) || response;
      } catch {
        return (await cache.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
