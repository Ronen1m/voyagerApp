var CACHE = 'voyager-v22'; // change this number every time you publish an update
var PAGE = '/voyagerApp/index.html';
var FILES = [
  '/voyagerApp/',
  '/voyagerApp/index.html',
  '/voyagerApp/manifest.json',
  '/voyagerApp/icons/icon-192.png',
  '/voyagerApp/icons/icon-512.png'
];
var ASSETS = 'voyager-assets'; // fonts & libraries: kept across versions so they work offline
var NET_TIMEOUT = 2500; // ms to wait for the internet before opening the saved copy

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // 'reload' skips the browser's HTTP cache so we always store the newest files.
      // The page itself must be saved; icons/manifest are best-effort.
      return Promise.all(FILES.map(function(u){
        var job = fetch(new Request(u, {cache:'reload'})).then(function(res){
          if (!res.ok) throw new Error(u + ' ' + res.status);
          return c.put(u, res);
        });
        return (u === PAGE) ? job : job.catch(function(){});
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE && k!==ASSETS; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

function savedPage(){
  return caches.match(PAGE).then(function(r){ return r || caches.match('/voyagerApp/'); })
    .then(function(r){ return r || caches.match(PAGE, {ignoreSearch:true, ignoreVary:true}); });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  // Never cache live flight data or non-GET requests
  if (req.method !== 'GET' || req.url.indexOf('airlabs.co') >= 0 || req.url.indexOf('rapidapi.com') >= 0) return;

  var isPage = req.mode === 'navigate' || /\/voyagerApp\/(index\.html)?(\?.*)?$/.test(req.url);
  if (isPage) {
    // App page: newest version if the internet answers quickly; otherwise the saved copy.
    // (A weak "connected but not working" network must not leave the screen blank.)
    e.respondWith(new Promise(function(resolve){
      var done = false;
      function finish(r){ if (!done && r) { done = true; resolve(r); } }
      var timer = setTimeout(function(){ savedPage().then(finish); }, NET_TIMEOUT);
      fetch(PAGE, {cache:'no-cache'}).then(function(res){
        if (!res.ok) throw new Error('status ' + res.status);
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(PAGE, copy); });
        clearTimeout(timer); finish(res);
      }).catch(function(){
        clearTimeout(timer);
        savedPage().then(function(r){ finish(r || Response.error()); });
      });
    }));
    return;
  }

  // Everything else (icons, fonts, libraries): saved copy first, then network (saved for next time)
  e.respondWith(
    caches.match(req).then(function(r){
      return r || fetch(req).then(function(res){
        if (res && (res.ok || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(req.url.indexOf(self.location.origin) === 0 ? CACHE : ASSETS).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
