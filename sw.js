// Offline-Cache: Dateien kommen sofort aus dem Cache und werden im Hintergrund aktualisiert (stale-while-revalidate).
// Neue Version wirkt also beim übernächsten Laden. CACHE hochzählen, um alles sofort zu verwerfen.
const CACHE = 'gd-v1';
const FILES = ['./', 'index.html', 'editor.html', 'config.js', 'levels.js', 'patterns.js', 'bot.js', 'game.js', 'editor.js', 'audio/music.mp3', 'audio/death.wav'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Audio-Elemente fragen mit Range-Header; aus dem Cache eine passende 206-Antwort bauen
async function rangeResponse(res, range) {
  const buf = await res.arrayBuffer(), m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = +m[1] || 0, end = m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
    'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' } });
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const key = url.origin + url.pathname; // ohne Hash/Query
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key), range = req.headers.get('range');
    if (range) return hit ? rangeResponse(hit, range) : fetch(req); // Audio: nicht bei jedem Range-Teilstück neu laden
    const net = fetch(key).then(r => { if (r.status === 200) c.put(key, r.clone()); return r; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
