const CACHE_NAME = 'futurestaff-agent-public-__BUILD__'
const PUBLIC_FILES = ['/', '/index.html', '/app.__BUILD__.js', '/app.__BUILD__.css', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable.png', '/apple-touch-icon.png']
const ALLOWED_PATHS = new Set(PUBLIC_FILES)
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_FILES)))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('futurestaff-agent-public-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.search || url.hash) return
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE_NAME).then(cache => cache.match('/index.html'))))
    return
  }
  if (!ALLOWED_PATHS.has(url.pathname)) return
  event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(url.pathname)) || fetch(request)))
})
