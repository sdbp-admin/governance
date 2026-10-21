/* Board-only worker: push display, icon badge and notification navigation. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("message", event => {
  if (event.data?.type !== "BOARD_BADGE") return;
  event.waitUntil(setBadge(event.data.count));
});

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data?.json() || {}; } catch { /* Always display a fallback. */ }
    const count = Number(data.badgeCount);
    const url = typeof data.url === "string" && data.url.startsWith("/governance/")
      ? data.url : "/governance/board/";
    await Promise.all([
      self.registration.showNotification(typeof data.title === "string" ? data.title : "SDBP Board", {
        body: typeof data.body === "string" ? data.body : "Something new needs your attention.",
        icon: "/governance/board-icon-192.png",
        badge: "/governance/board-icon-192.png",
        tag: typeof data.tag === "string" ? data.tag : undefined,
        data: { url },
      }),
      Number.isFinite(count) ? setBadge(count) : Promise.resolve(),
    ]);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const windowClient of windows) windowClient.postMessage({ type: "BOARD_REFRESH" });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = event.notification.data?.url || "/governance/board/";
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const windowClient of windows) {
      if (windowClient.url.startsWith(self.location.origin + "/governance/board/")) {
        await windowClient.navigate(url);
        return windowClient.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});

function setBadge(value) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  if (count && self.navigator.setAppBadge) return self.navigator.setAppBadge(count);
  if (!count && self.navigator.clearAppBadge) return self.navigator.clearAppBadge();
  return Promise.resolve();
}
