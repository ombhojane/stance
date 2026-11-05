/* Stance service worker: installable, fast repeat visits, works offline. */
const VERSION = "stance-v2";
const PAGES = ["/", "/make", "/make/review", "/make/done", "/positions", "/house", "/signals"];
const EXTRA = ["/manifest.webmanifest", "/icons/192", "/icons/512"];

// Cache every page plus every hashed asset (JS, CSS, fonts) those pages reference,
// so the whole app works offline right after the first visit.
async function precache() {
  const cache = await caches.open(VERSION);
  const assets = new Set(EXTRA);
  await Promise.allSettled(
    PAGES.map(async (url) => {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) return;
      await cache.put(url, res.clone());
      const html = await res.text();
      for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) assets.add(m[0]);
    }),
  );
  await Promise.allSettled([...assets].map((url) => cache.add(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets, fonts, images, icons: cache-first (they never change under the same URL).
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/art/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: network-first so content stays fresh, fall back to cache offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          // query strings (?amount=…) don't change the page shell, so ignore them offline
          const hit = await caches.match(req, { ignoreSearch: true });
          if (hit) return hit;
          // any stance detail page shares one shell; reuse one we've seen
          if (url.pathname.startsWith("/positions/")) {
            const cache = await caches.open(VERSION);
            const key = (await cache.keys()).find((k) => new URL(k.url).pathname.startsWith("/positions/"));
            if (key) return cache.match(key);
          }
          return caches.match("/");
        }),
    );
  }
});
