// Service Worker der Codeschmiede – NUR für Push-Nachrichten aufs Handy (Befund L3, Datenbank 0053). Kein Zwischenspeicher:
// die Oberfläche kommt immer frisch von codeschmiede.pages.dev (sonst sähe man nach einer neuen Version den alten Stand).
// Inhalt einer Nachricht: { title, body, url, tag } – ohne Personendaten, Ende-zu-Ende verschlüsselt (RFC 8291).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = {}; }
  const pfad = typeof d.url === "string" && /^\/[A-Za-z0-9/?=&_.-]{0,120}$/.test(d.url) ? d.url : "/";
  event.waitUntil(self.registration.showNotification(String(d.title || "Codeschmiede").slice(0, 80), {
    body: String(d.body || "Es wartet etwas auf dich.").slice(0, 160),
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: typeof d.tag === "string" ? d.tag.slice(0, 60) : undefined,
    renotify: !!d.tag,
    data: { url: pfad },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ziel = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const alle = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of alle) {
      if (c.url.startsWith(self.location.origin)) { try { await c.navigate(ziel); } catch (_) { /* älterer Browser */ } return c.focus(); }
    }
    return self.clients.openWindow(ziel);
  })());
});
