// sw.js — dahej PWA + Web Push
const CACHE = "dahej-v2";
const ASSETS = ["/", "/index.html", "/icon.svg", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // don't cache api / admin / og
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/og/")) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((resp) => {
          if (resp.ok && e.request.method === "GET" && url.origin === location.origin) {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Web Push — show notification (tickle: fetch last payload from KV)
self.addEventListener("push", (e) => {
  let data = {};
  try {
    if (e.data) data = e.data.json();
  } catch (_) {
    try { if (e.data) data = { body: e.data.text() }; } catch (_) {}
  }
  const hasData = data && (data.title || data.body);
  if (hasData) {
    const title = data.title || "Dahej Calculator";
    const body = data.body || "Hisab ready — tap to open";
    const url = data.url || "/";
    e.waitUntil(
      self.registration.showNotification(title, {
        body, icon: "/icon.svg", badge: "/icon.svg",
        data: { url }, vibrate: [120, 40, 120], tag: data.tag || "dahej", renotify: !!data.tag
      })
    );
  } else {
    // tickle — fetch last pushed payload
    e.waitUntil(
      fetch("/api/push/last", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => self.registration.showNotification(d.title || "Dahej Calculator", {
          body: d.body || "Hisab ready — tap to open",
          icon: "/icon.svg", badge: "/icon.svg",
          data: { url: d.url || "/" }, vibrate: [120, 40, 120], tag: d.tag || "dahej", renotify: !!d.tag
        }))
        .catch(() => self.registration.showNotification("Dahej Calculator", {
          body: "Hisab ready — tap to open", icon: "/icon.svg", badge: "/icon.svg",
          data: { url: "/" }, vibrate: [120, 40, 120]
        }))
    );
  }
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(self.location.origin) && "focus" in w) return w.focus();
      }
      return clients.openWindow(url);
    })
  );
});
