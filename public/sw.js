const CACHE_NAME = 'premiumflix-v1'
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icon.svg',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (event.request.method !== 'GET') return

  const neverCache = [
    '/pmapi/',
    '/api/',
    '/imdbapi/',
    '/scenenzbsapi/',
    '/ossub/',
    'premiumize.me',
    'themoviedb.org',
    'api.imdbapi.dev',
    'scenenzbs.com',
    'opensubtitles.org',
    'cdn77',
    'energycdn.com',
    'googleapis.com',
    'gstatic.com',
    'image.tmdb.org',
  ]

  if (neverCache.some((p) => url.href.includes(p))) return

  // Never touch dev server / module requests (Vite, HMR, source modules) —
  // caching these breaks hot reload and serves stale HTML for JS.
  const isDevAsset =
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/') ||
    url.searchParams.has('t') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.tsx')
  if (isDevAsset) return

  // App navigations: network-first so deploys show up immediately,
  // with the cached shell as offline fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone))
          }
          return response
        })
        .catch(() =>
          caches.match('/index.html').then(
            (cached) => cached || new Response('Offline', { status: 503, statusText: 'Offline' })
          )
        )
    )
    return
  }

  // Other same-origin assets: cached-first with background refresh
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
            }
            return response
          })
          .catch(() =>
            // Never leave respondWith without a Response
            new Response('', { status: 504, statusText: 'Gateway Timeout' })
          )

        return cached || fetchPromise
      })
    )
  }
})
