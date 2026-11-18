/* 金消予定日アプリ Service Worker
 * - アプリ本体（HTML/JS/アイコン/ライブラリ）は「ネット優先・だめならキャッシュ」：
 *   オンラインなら常に最新、電波が無い所でも画面は開ける。
 * - Supabase（データ通信）は一切キャッシュしない：古い案件を見せんため。
 * - Googleフォントは「キャッシュ優先」で裏で更新。
 */
const VER = 'kinsho-v14.0.1';
const SHELL = [
  './', 'index.html', 'app.js?v=14.0.0', 'manifest.webmanifest',
  'vendor/react.production.min.js', 'vendor/react-dom.production.min.js',
  'vendor/supabase.js', 'config.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase など他サーバーへのデータ通信は触らん
  if (url.hostname.endsWith('supabase.co')) return;

  // Googleフォント：キャッシュ優先
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(VER).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // 同じサイト内：ネット優先 → だめならキャッシュ
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VER).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: false }).then((hit) => hit || caches.match('index.html')))
    );
  }
});
