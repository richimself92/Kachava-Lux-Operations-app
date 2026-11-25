/* Kachava Lux Maintenance — web push service worker.
 *
 * Receives the FCM "new work order" pushes sent by functions/src/notify.ts and shows them as
 * system notifications (the OS plays its notification sound). Handles the push event directly,
 * so no Firebase SDK is loaded here. Registered from src/services/push.ts.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Apple WebKit (iPhone, iPad, Safari on Mac): Safari revokes push permission for pushes that do
// not show a notification, so there it is always shown.
const ALWAYS_SHOW = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent)
  && !/Chrome|CriOS|Firefox|FxiOS|Edg/.test(self.navigator.userAgent);

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const n = payload.notification || {};
  const data = payload.data || {};
  const link = (payload.fcmOptions && payload.fcmOptions.link) || data.link || '/';

  event.waitUntil(
    (async () => {
      // While the app is visible it plays its own chime and shows a notice; skip the duplicate.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = windows.some((w) => w.visibilityState === 'visible');
      if (visible && !ALWAYS_SHOW) return;
      await self.registration.showNotification(n.title || 'Kachava Lux', {
        body: n.body || '',
        icon: n.icon || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: n.tag || data.requestId || undefined,
        renotify: true,
        data: { link },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.link) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && 'navigate' in w) {
          await w.focus();
          return w.navigate(target);
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
