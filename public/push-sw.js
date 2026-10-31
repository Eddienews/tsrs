// Notifications from TSRS (the night shift's dailies), on this device. Only
// push: it serves no page and caches nothing, so it never gets in the way of
// the app (registered with a scope of its own, /__tsrs/push/).
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(self.registration.showNotification(data.title || 'TSRS', { body: data.body || '', icon: '/icon-192.png', data: { url: data.url || '/' } }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/'))
})
