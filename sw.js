/* Spokiy service worker — shell cache */
const CACHE = "spokiy-shell-20260908";
const SHELL = ["/", "/css/styles.css", "/js/changelog.js", "/js/content.js", "/js/storage.js", "/js/safeguard.js", "/js/rituals.js", "/js/recovery-art.js", "/js/app.js", "/manifest.webmanifest", "/icon-192.png", "/favicon.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok && (url.pathname.startsWith("/css/") || url.pathname.startsWith("/js/") || url.pathname === "/" || url.pathname.endsWith(".png") || url.pathname.endsWith(".webmanifest"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
