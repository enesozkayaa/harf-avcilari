// =============================================================
// Harf Avcıları - servis çalışanı (service worker)
// Telefonda "ana ekrana ekle" ve APK için gerekli. Oyun dosyalarını telefona kaydeder:
// internet varken her zaman en yeni dosyalar indirilir (oyun güncellenince herkes yenisini alır),
// internet yoksa kaydedilmiş kopya açılır. Online oynamak için yine internet gerekir.
// =============================================================

const ONBELLEK = 'harf-avcilari-v1';
const DOSYALAR = [
  './', 'index.html', 'style.css', 'game.js', 'tahta3d.js', 'ses.js', 'ag.js', 'kelimeler.js',
  'manifest.webmanifest', 'ikonlar/ikon-192.png', 'ikonlar/ikon-512.png',
];

self.addEventListener('install', olay => {
  olay.waitUntil(caches.open(ONBELLEK).then(onbellek => onbellek.addAll(DOSYALAR)));
  self.skipWaiting();
});

// Eski sürümün kayıtlarını temizle
self.addEventListener('activate', olay => {
  olay.waitUntil(caches.keys().then(adlar =>
    Promise.all(adlar.filter(ad => ad !== ONBELLEK).map(ad => caches.delete(ad)))));
  self.clients.claim();
});

// Önce internetten dene (en yeni sürüm), olmazsa kaydedilmiş kopyayı ver
self.addEventListener('fetch', olay => {
  if (olay.request.method !== 'GET') return;
  olay.respondWith(
    fetch(olay.request)
      .then(cevap => {
        if (cevap.ok) {
          const kopya = cevap.clone();
          caches.open(ONBELLEK).then(onbellek => onbellek.put(olay.request, kopya));
        }
        return cevap;
      })
      .catch(() => caches.match(olay.request)),
  );
});
