/* =============================================
   Personal Countdown Hub — sw.js
   Service Worker: cache-first offline strategy
   Version bump CACHE_NAME to force refresh
   after any project update.
   ============================================= */

'use strict';

const CACHE_NAME = 'pch-v1';

/* Files to pre-cache on install.
   All paths are relative to the SW's location (project root).
   The Google Fonts request is network-only — we do not cache
   third-party font URLs because they set cross-origin headers
   that can break opaque response caching unexpectedly.
   The app renders fine with system fallback fonts offline. */
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

/* ── Install: pre-cache all core assets ─────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

/* ── Activate: delete stale caches ──────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())  // take control of open pages
  );
});

/* ── Fetch: cache-first, network fallback ────── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Let non-GET requests (form posts etc.) pass straight through */
  if (event.request.method !== 'GET') return;

  /* Google Fonts: network-first, no cache storage.
     Fail gracefully — the page still works with fallback fonts. */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(event.request).catch(() => new Response('', {
        status: 503,
        statusText: 'Offline — fonts unavailable'
      }))
    );
    return;
  }

  /* All other requests: cache-first */
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        /* Not in cache — try the network and cache the response */
        return fetch(event.request)
          .then(networkResponse => {
            /* Only cache valid same-origin responses */
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === 'basic'
            ) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          })
          .catch(() => {
            /* Network failed and not in cache.
               Return the cached index.html as the offline fallback
               for navigation requests (the app shell). */
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            /* For non-navigation resources, return empty 503 */
            return new Response('Resource unavailable offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});
