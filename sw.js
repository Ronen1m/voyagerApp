var CACHE = 'voyager-v9'; // change this number every time you publish an update
var FILES = [
  '/voyagerApp/',
  '/voyagerApp/index.html'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(FILES); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  // Never cache live flight data or non-GET requests
  if (e.request.method !== 'GET' || e.request.url.indexOf('airlabs.co') >= 0 || e.request.url.indexOf('rapidapi.com') >= 0) return;
  e.respondWith(
    caches.match(e.request).then(function(r){
      return r || fetch(e.request).then(function(res){
        return caches.open(CACHE).then(function(c){
          c.put(e.request, res.clone());
          return res;
        });
      });
    }).catch(function(){
      return caches.match('/voyagerApp/');
    })
  );
});
