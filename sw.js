var CACHE = 'voyager-v13'; // change this number every time you publish an update
var FILES = [
  '/voyagerApp/',
  '/voyagerApp/index.html'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // 'reload' skips the browser's HTTP cache so we always store the newest files
      return Promise.all(FILES.map(function(u){
        return fetch(new Request(u, {cache:'reload'})).then(function(res){ return c.put(u, res); });
      }));
    })
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
  var req = e.request;
  // Never cache live flight data or non-GET requests
  if (req.method !== 'GET' || req.url.indexOf('airlabs.co') >= 0 || req.url.indexOf('rapidapi.com') >= 0) return;

  var isPage = req.mode === 'navigate' || /\/voyagerApp\/(index\.html)?(\?.*)?$/.test(req.url);
  if (isPage) {
    // App page: always try the newest version online; use saved copy only when offline
    e.respondWith(
      fetch(req, {cache:'no-cache'}).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put('/voyagerApp/index.html', copy); });
        return res;
      }).catch(function(){
        return caches.match('/voyagerApp/index.html').then(function(r){ return r || caches.match('/voyagerApp/'); });
      })
    );
    return;
  }

  // Everything else (icons, fonts): saved copy first, then network
  e.respondWith(
    caches.match(req).then(function(r){
      return r || fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      });
    })
  );
});
