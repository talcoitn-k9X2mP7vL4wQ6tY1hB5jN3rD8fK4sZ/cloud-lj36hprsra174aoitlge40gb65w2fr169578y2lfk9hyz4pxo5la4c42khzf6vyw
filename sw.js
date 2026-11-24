/* TalcoCloud : service worker. La version est mise à jour par tools/build.py */
const CACHE = "talcocloud-b599905cea";
const SHELL = ["./", "index.html", "style.css", "glass.css", "app.js", "shell.js", "firebase.js", "util.js", "settings.js", "profile.js",
  "pwa.js", "viewport.js", "community.js", "settingsui.js", "manifest.webmanifest", "favicon.svg", "favicon.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const HOSTS = ["www.gstatic.com", "fonts.gstatic.com", "fonts.googleapis.com", "res.cloudinary.com", "natlacaxi.github.io"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || !(u.origin === location.origin || HOSTS.includes(u.hostname))) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r && (r.ok || r.type === "opaque")) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
