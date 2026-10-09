var CACHE = 'voyager-v23'; // change this number every time you publish an update
var PAGE = '/voyagerApp/index.html';
var FILES = [
  '/voyagerApp/',
  '/voyagerApp/index.html',
  '/voyagerApp/manifest.json',
  '/voyagerApp/icons/icon-192.png',
  '/voyagerApp/icons/icon-512.png'
];
var ASSETS = 'voyager-assets'; // fonts & libraries: kept across versions so they work offline
var NET_TIMEOUT = 2500;
// Other apps on ronen1m.github.io share this browser storage, and some delete every cache that isn't theirs.
// So the page is ALSO kept in IndexedDB ('voyager-sw'), which they don't touch.
function swDb(){ return new Promise(function(res, rej){
  var r = indexedDB.open('voyager-sw', 1);
  r.onupgradeneeded = function(){ r.result.createObjectStore('files'); };
  r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); };
}); }
function backupPage(res){
  return res.clone().text().then(function(html){
    if (html.indexOf('<html') < 0 && html.indexOf('<!DOCTYPE') < 0) return;
    return swDb().then(function(db){ return new Promise(function(ok){
      var tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(html, PAGE);
      tx.oncomplete = ok; tx.onerror = ok;
    }); });
  }).catch(function(){});
}
function backupGet(){
  return swDb().then(function(db){ return new Promise(function(ok){
    var tx = db.transaction('files', 'readonly'), q = tx.objectStore('files').get(PAGE);
    q.onsuccess = function(){ ok(q.result || null); }; q.onerror = function(){ ok(null); };
  }); }).catch(function(){ return null; });
} // ms to wait for the internet before opening the saved copy

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // 'reload' skips the browser's HTTP cache so we always store the newest files.
      // The page itself must be saved; icons/manifest are best-effort.
      return Promise.all(FILES.map(function(u){
        var job = fetch(new Request(u, {cache:'reload'})).then(function(res){
          if (!res.ok) throw new Error(u + ' ' + res.status);
          return (u === PAGE ? backupPage(res) : Promise.resolve()).then(function(){ return c.put(u, res); });
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
      return Promise.all(keys.filter(function(k){ return k.indexOf('voyager-')===0 && k!==CACHE && k!==ASSETS; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

function savedPage(){
  return caches.open(CACHE).then(function(c){ return c.match(PAGE).then(function(r){ return r || c.match('/voyagerApp/'); }); })
    .then(function(r){ return r || caches.match(PAGE, {ignoreSearch:true, ignoreVary:true}); })
    .then(function(r){
      if (r) return r;
      return backupGet().then(function(html){
        if (!html) return null;
        var resp = new Response(html, {headers:{'Content-Type':'text/html; charset=utf-8'}});
        caches.open(CACHE).then(function(c){ c.put(PAGE, resp.clone()); }).catch(function(){});
        return resp;
      });
    }).catch(function(){ return backupGet().then(function(html){ return html ? new Response(html, {headers:{'Content-Type':'text/html; charset=utf-8'}}) : null; }); });
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
        backupPage(res);
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
