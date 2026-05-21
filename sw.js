const CACHE_NAME = 'condosys-v3';
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
  // Apenas faz cache de requisições GET (ignora API calls POST/PUT/DELETE)
  if (event.request.method !== 'GET') return;

  // Não faz fallback para a API
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchRes) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      });
    }).catch(() => {
      // Se offline e falhar ao buscar, podemos retornar uma página offline.html genérica se quisermos
      if (event.request.mode === 'navigate') {
        return caches.match('/login.html');
      }
    })
  );
});
