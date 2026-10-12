/* PolloconCurry: pagina e icone in memoria, dati dalla rete con ultima copia come riserva. Versione 6f01effc4c */
const V = '6f01effc4c', SHELL = 'shell-' + V, DATA = 'dati', FONTS = 'font';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function dataFirstNetwork(req) {
  const cache = await caches.open(DATA);
  try {
    const r = await fetch(req, {cache: 'no-store'});
    if (r.ok) cache.put('data.json', r.clone());
    return r;
  } catch (err) {
    const old = await cache.match('data.json');
    if (!old) throw err;
    const h = new Headers(old.headers); h.set('x-pcc-offline', '1');   // la pagina lo scrive: "dati salvati"
    return new Response(await old.blob(), {status: 200, headers: h});
  }
}
async function pageFirstNetwork(req) {
  try {
    const r = await fetch(req);
    if (r.ok) (await caches.open(SHELL)).put(req, r.clone());
    return r;
  } catch (err) {
    return (await caches.match(req, {ignoreSearch: true})) || (await caches.match('index.html'));
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(FONTS), hit = await cache.match(req);
  const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    if (url.pathname.endsWith('/data.json')) return e.respondWith(dataFirstNetwork(req));
    return e.respondWith(pageFirstNetwork(req));
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(staleWhileRevalidate(req));
});
