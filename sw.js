// Service Worker para Evaluación Criterial TEC4 — Versión Online
// Cacheo de recursos para funcionamiento offline.
// Hosting: https://angelmicelti.github.io/AppCalificaActividadesTEC4V2/

const CACHE_VERSION = 'v1.0.6';
const CACHE_NAME = `evaltec4-online-${CACHE_VERSION}`;
const BASE_PATH = './';

// Recursos principales a cachear (rutas relativas para funcionar en GitHub Pages)
const PRECACHE_URLS = [
    BASE_PATH,
    BASE_PATH + 'index.html',
    BASE_PATH + 'manifest.json',
    BASE_PATH + 'icons/icon-192x192.png',
    BASE_PATH + 'icons/icon-512x512.png',
    BASE_PATH + 'icons/apple-touch-icon.png',
    BASE_PATH + 'icons/favicon-96x96.png',
    BASE_PATH + 'icons/favicon.ico',
    BASE_PATH + 'icons/maskable-192x192.png',
    BASE_PATH + 'icons/maskable-512x512.png',
    BASE_PATH + 'icons/icon.svg',
    // CDN externos (se cachearán si se cargan correctamente)
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/js/bootstrap.bundle.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
    // Firebase SDK
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

// =========================================================================
// INSTALL: pre-cachear recursos principales
// =========================================================================
self.addEventListener('install', event => {
    console.log('[SW] Instalando service worker, versión:', CACHE_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Pre-cacheando recursos...');
                // Cachear uno a uno para evitar que un fallo en un CDN rompa todo
                return Promise.allSettled(
                    PRECACHE_URLS.map(url =>
                        cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url, err))
                    )
                );
            })
            .then(() => {
                console.log('[SW] Pre-cacheo completado.');
                return self.skipWaiting();
            })
    );
});

// =========================================================================
// ACTIVATE: limpiar cachés antiguas
// =========================================================================
self.addEventListener('activate', event => {
    console.log('[SW] Activando service worker, versión:', CACHE_VERSION);
    event.waitUntil(
        caches.keys()
            .then(keyList => {
                return Promise.all(
                    keyList.map(key => {
                        if (key !== CACHE_NAME) {
                            console.log('[SW] Eliminando caché antigua:', key);
                            return caches.delete(key);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

// =========================================================================
// FETCH: estrategia cache-first para recursos estáticos, network-first para navegación
// =========================================================================
self.addEventListener('fetch', event => {
    const request = event.request;

    // Ignorar peticiones que no son GET
    if (request.method !== 'GET') return;

    // Ignorar peticiones a Firebase (deben ir siempre a la red)
    const url = new URL(request.url);
    if (url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('gstatic.com') && !PRECACHE_URLS.includes(request.url)) {
        return;
    }

    // Estrategia para navegación (HTML): network-first con fallback a caché
    if (request.mode === 'navigate' ||
        (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Guardar copia fresca en caché
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
                    return response;
                })
                .catch(() => {
                    // Si no hay red, servir desde caché
                    return caches.match(request)
                        .then(cached => cached || caches.match(BASE_PATH + 'index.html'));
                })
        );
        return;
    }

    // Estrategia para recursos estáticos: cache-first con fallback a red
    event.respondWith(
        caches.match(request)
            .then(cached => {
                if (cached) {
                    // Devolver de caché y actualizar en segundo plano
                    fetch(request).then(response => {
                        if (response && response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
                        }
                    }).catch(() => {});
                    return cached;
                }
                // No está en caché: ir a la red
                return fetch(request).then(response => {
                    if (!response || response.status !== 200 || response.type === 'opaque') {
                        return response;
                    }
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
                    return response;
                }).catch(() => {
                    // Si es un icono o imagen, servir un placeholder
                    if (request.destination === 'image') {
                        return caches.match(BASE_PATH + 'icons/icon-192x192.png');
                    }
                });
            })
    );
});

// =========================================================================
// MESSAGE: permitir forzar actualización del SW
// =========================================================================
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
