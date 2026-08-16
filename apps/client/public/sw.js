/* Drillhall service worker.
 *
 * Deliberately small and conservative. Two rules govern everything here:
 *
 *   1. NEVER cache /api/* — those responses are per-user and session-scoped.
 *      A cached authenticated response is a real hazard on a shared device,
 *      and stale study data is worse than no study data.
 *   2. Navigations are network-first. A cache-first shell is the classic PWA
 *      trap where users keep running an old build after every deploy; here
 *      the cached shell exists only as an offline fallback.
 *
 * Static assets are safe to cache aggressively because Vite content-hashes
 * their filenames — a changed file is a different URL.
 */

const VERSION = "v1";
const SHELL_CACHE = `drillhall-shell-${VERSION}`;
const ASSET_CACHE = `drillhall-assets-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.add("/"))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Rule 1: the API is never cached, and never served from cache.
  if (url.pathname.startsWith("/api/")) return;

  // Rule 2: navigations go to the network, falling back to the cached shell
  // only when the network genuinely fails.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/").then((r) => r ?? Response.error())),
    );
    return;
  }

  // Hashed assets: cache-first is safe, since the URL changes when the file does.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
  }
});
