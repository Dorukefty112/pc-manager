const CACHE = 'pc-manager-v1'
const ASSETS = ['/', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.url.startsWith(self.location.origin) && e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    )
  }
})
