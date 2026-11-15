const CACHE = "cohort-v1"; // change this number when you publish an update
const SHELL = ["./", "index.html", "style.css", "chat.css", "app.js", "chat.js", "cloud.js",
  "firebase-config.js", "logo.svg", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  const own = u.origin === location.origin, lib = u.hostname === "www.gstatic.com";
  if (!own && !lib) return;               // live Firebase traffic is never cached here
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => {
    const net = fetch(r).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => hit || (r.mode === "navigate" ? caches.match("index.html") : undefined));
    return hit || net;
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow("./"));
});
