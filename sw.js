/* PolloconCurry: pagina e icone in memoria, dati dalla rete con ultima copia come riserva. Versione f504873898 */
const V = 'f504873898', SHELL = 'shell-' + V, DATA = 'dati', FONTS = 'font';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'];

self.addEventListener('install', e => {
  // anche una prima copia dei dati: dalla visita dopo la pagina sa che i dati sono sul telefono (salta l'avvio, funziona offline)
  const data = caches.open(DATA).then(c => fetch('data.json', {cache: 'no-store'}).then(r => r.ok ? c.put('data.json', r) : null)).catch(() => {});
  // cache:'reload': i file della nuova versione dal sito, non dalla cache HTTP del browser (che può avere la pagina di prima)
  e.waitUntil(Promise.all([caches.open(SHELL).then(c => c.addAll(FILES.map(u => new Request(u, {cache: 'reload'})))), data]).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rete lenta: la rete ha WAIT ms per rispondere, poi si usa la copia salvata. La risposta della rete, se arriva dopo,
// aggiorna comunque la copia (waitUntil tiene vivo il service worker finché non è salvata).
const WAIT = 3000;
const within = (p, ms) => new Promise(res => { const t = setTimeout(() => res(null), ms); p.then(r => { clearTimeout(t); res(r); }, () => { clearTimeout(t); res(null); }); });

function dataFirstNetwork(e, name) {   // name: 'data.json' o 'cerca.json'
  const req = e.request, open = caches.open(DATA);
  let saved = null;
  const net = fetch(req, {cache: 'no-store'}).then(r => { if (r.ok) { const c = r.clone(); saved = open.then(cache => cache.put(name, c)); } return r; });
  e.waitUntil(net.then(() => saved, () => null).catch(() => null));
  return (async () => {
    // "tira giù per aggiornare" (cache:'no-cache') vuole i dati nuovi: lì si aspetta la rete come prima
    const r = req.cache === 'no-cache' ? await net.catch(() => null) : await within(net, WAIT);
    if (r) return r;
    const old = await (await open).match(name);
    if (!old) return net;   // nessuna copia salvata: si aspetta la rete (o il suo errore)
    const h = new Headers(old.headers); h.set('x-pcc-offline', '1');   // la pagina lo scrive: "dati salvati"
    return new Response(await old.blob(), {status: 200, headers: h});
  })();
}
function pageFirstNetwork(e) {
  const req = e.request;
  let saved = null, failed = false;
  // ricontrolla sempre sul sito: niente copia vecchia di 10 minuti dalla cache del browser
  const net = fetch(req, {cache: 'no-cache'}).then(r => { if (r.ok) { const c = r.clone(); saved = caches.open(SHELL).then(cache => cache.put(req, c)); } return r; });
  net.catch(() => { failed = true; });
  e.waitUntil(net.then(() => saved, () => null).catch(() => null));
  return (async () => {
    const r = await within(net, WAIT);
    if (r) return r;
    const hit = await caches.match(req, {ignoreSearch: true});
    if (hit) return hit;
    // senza rete la pagina salvata vale per ogni indirizzo (come prima); se la rete è solo lenta, solo per le pagine
    const page = failed || req.mode === 'navigate' ? await caches.match('index.html') : null;
    return page || net;
  })();
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
    if (url.pathname.endsWith('/data.json')) return e.respondWith(dataFirstNetwork(e, 'data.json'));
    if (url.pathname.endsWith('/cerca.json')) return e.respondWith(dataFirstNetwork(e, 'cerca.json'));
    return e.respondWith(pageFirstNetwork(e));
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(staleWhileRevalidate(req));
});
