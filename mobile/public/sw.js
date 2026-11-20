// Minimal service worker so the web app can be installed (and appear in the Android share sheet).
// It doesn't cache anything: recipes are stored in the page's localStorage.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
