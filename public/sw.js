const CACHE = "khoram2ry-shell-v3";
const SHELL = ["/", "/index.html", "/manifest.json", "/icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("khoram2ry-") && key !== CACHE).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache subscriptions, token-bearing URLs, external hosts or API responses.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.search) return;
  const navigation = request.mode === "navigate";
  if (!navigation && !SHELL.includes(url.pathname) && !url.pathname.startsWith("/assets/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (!navigation) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(navigation ? "/index.html" : request, response.clone());
      return response;
    } catch {
      return (await cache.match(navigation ? "/index.html" : request)) || Response.error();
    }
  })());
});