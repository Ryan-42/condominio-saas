const CACHE_NAME = 'condosys-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/login.html',
  '/registro.html',
  '/resetar-senha.html',
  '/onboarding.html',
  '/portal.html',
  '/privacidade.html',
  '/termos.html',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/auth_client.js',
  '/Space.js',
  '/config.js',
  '/manifest.json',
  '/assets/icon-192.svg',
  '/assets/icon-512.svg',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Só faz cache dos assets estáticos da lista — chamadas à API passam direto
  const url = new URL(event.request.url);
  const isStaticAsset = ASSETS_TO_CACHE.some(
    (asset) => asset === url.pathname || asset === event.request.url
  );
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchRes) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('/login.html');
      }
    })
  );
});
