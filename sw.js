const CACHE = 'pc-manager-v2'
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
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return
  // API istekleri service worker'a hiç girmesin: oturum/yetki hataları (401/403)
  // olduğu gibi uygulamaya ulaşmalı ve asla önbellekten ya da boş yanıtla maskelenmemeli
  if (url.pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(r => r || Response.error()))
  )
})
