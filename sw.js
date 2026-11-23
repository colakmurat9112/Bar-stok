/* Bar Stok – Service Worker v2.1
 * - Uygulama kabuğu + docx kütüphanesi önbelleğe alınır (Word çıktısı çevrimdışı çalışır)
 * - Önbellekten anında açılır, arka planda günceller (stale-while-revalidate)
 * - Yeni sürüm "waiting" durumunda bekler; sayfadaki "Yenile" ile SKIP_WAITING gönderilir
 */
'use strict';

var VERSION = 'v2.1';
var PREFIX = 'bar-stok-';
var CACHE = PREFIX + VERSION;

// Bunlar yoksa kurulum başarısız olur
var CORE = [
  './',
  './index.html',
  './manifest.json'
];
// Bunlar eksikse kurulum yine de devam eder
var OPTIONAL = [
  './docx.min.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

function fresh(url) { return new Request(url, { cache: 'reload' }); }

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(CORE.map(fresh)).then(function () {
        return Promise.all(OPTIONAL.map(function (u) {
          return cache.add(fresh(u)).catch(function () {});
        }));
      });
    })
  );
  // skipWaiting YOK: kullanıcı "Yenile"ye basınca devreye girer (yarım kalan sayım bölünmesin)
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(PREFIX) === 0 && k !== CACHE) return caches.delete(k);
        // v1 başka isimle önbellek açtıysa onu da temizle (veriler localStorage'da, etkilenmez)
        if (k.indexOf(PREFIX) !== 0 && /bar.?stok/i.test(k)) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isCacheable(res) {
  return res && res.ok && (res.type === 'basic' || res.type === 'default');
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  // Sayfa açılışları: her zaman index.html kabuğu
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match('./index.html').then(function (cached) {
          var net = fetch(req).then(function (res) {
            if (isCacheable(res)) cache.put('./index.html', res.clone());
            return res;
          });
          if (cached) {
            event.waitUntil(net.catch(function () {}));
            return cached;
          }
          return net.catch(function () {
            return new Response('<h1>Çevrimdışı</h1>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          });
        });
      })
    );
    return;
  }

  // Diğer dosyalar: önbellekten ver, arka planda tazele
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (cached) {
        var net = fetch(req).then(function (res) {
          if (isCacheable(res)) cache.put(req, res.clone());
          return res;
        });
        if (cached) {
          event.waitUntil(net.catch(function () {}));
          return cached;
        }
        return net;
      });
    })
  );
});
