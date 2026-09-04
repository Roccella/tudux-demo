const SW_VERSION = '13b655270c';
// El SW se copia verbatim desde public/, así que Vite no le reescribe nada con base.
// La saca de su propia URL: '/' en prod, '/tudux-demo/' servido bajo ese subpath.
const BASE = new URL('./', self.location).pathname;
const CACHE_PREFIX = 'tudux-v-';
const DIAG_CACHE = 'sw-diag';

// --- Diagnostic logging ---

async function swLog(entry) {
  try {
    entry.ts = new Date().toISOString();
    entry.swVersion = SW_VERSION;
    const cache = await caches.open(DIAG_CACHE);
    const key = `/_log/${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await cache.put(key, new Response(JSON.stringify(entry)));
  } catch { /* never break the SW for logging */ }
}

async function readLogs() {
  try {
    const cache = await caches.open(DIAG_CACHE);
    const keys = await cache.keys();
    const entries = [];
    for (const req of keys) {
      const res = await cache.match(req);
      if (res) entries.push(JSON.parse(await res.text()));
    }
    entries.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    return entries;
  } catch { return []; }
}

async function clearLogs() {
  try { await caches.delete(DIAG_CACHE); } catch {}
}

function diagnosticPage(extraInfo) {
  // Self-contained HTML page that reads sw-diag cache and displays logs
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tudux SW Diagnostic</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#e0e0e0;font:13px/1.5 monospace;padding:16px;padding-top:max(16px,env(safe-area-inset-top))}
h1{font-size:16px;margin-bottom:8px;color:#9070D0}
.info{color:#9aa0a6;margin-bottom:12px;font-size:12px}
.log{background:#1a1a1a;border-radius:6px;padding:12px;margin-bottom:8px;font-size:11px;word-break:break-all;white-space:pre-wrap}
.log .ev{color:#48B880;font-weight:bold}
.log .err{color:#D07070}
.actions{display:flex;gap:8px;margin:16px 0}
button{background:#2a2a2a;color:#e0e0e0;border:1px solid #444;border-radius:6px;padding:8px 16px;font:13px monospace;cursor:pointer}
button:active{background:#444}
.extra{background:#1e1e1e;padding:12px;border-radius:6px;margin-bottom:12px;font-size:11px;color:#C89840}
</style></head><body>
<h1>SW Diagnostic</h1>
<div class="info">SW_VERSION: <strong>${SW_VERSION}</strong></div>
${extraInfo ? '<div class="extra">' + extraInfo + '</div>' : ''}
<div class="actions">
<button onclick="copyLogs()">Copiar logs</button>
<button onclick="location.reload()">Reintentar</button>
<button onclick="clearAndReload()">Limpiar logs + reload</button>
</div>
<div id="logs">Cargando logs...</div>
<script>
async function loadLogs(){
  try {
    const cache = await caches.open('${DIAG_CACHE}');
    const keys = await cache.keys();
    const entries = [];
    for (const req of keys) {
      const res = await cache.match(req);
      if (res) entries.push(JSON.parse(await res.text()));
    }
    entries.sort((a,b)=>(a.ts||'').localeCompare(b.ts||''));
    const el = document.getElementById('logs');
    if (!entries.length) { el.innerHTML='<div class="log">No hay logs.</div>'; return; }
    el.innerHTML = entries.map(e => {
      const cls = e.error ? 'err' : 'ev';
      return '<div class="log"><span class="' + cls + '">[' + (e.event||'?') + ']</span> ' + JSON.stringify(e, null, 1) + '</div>';
    }).join('');
  } catch(err) {
    document.getElementById('logs').innerHTML='<div class="log err">Error leyendo logs: '+err.message+'</div>';
  }
}
function copyLogs(){
  const el = document.getElementById('logs');
  navigator.clipboard.writeText(el.innerText).then(()=>alert('Copiado')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=el.innerText;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();alert('Copiado');
  });
}
async function clearAndReload(){
  try { await caches.delete('${DIAG_CACHE}'); } catch{}
  location.reload();
}
loadLogs();
</script></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

// --- SW lifecycle ---

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await clearLogs();
    await swLog({ event: 'install-start' });
    try {
      const res = await fetch(BASE + 'asset-manifest.json', { cache: 'no-store' });
      await swLog({
        event: 'install-manifest-fetch',
        status: res.status,
        redirected: res.redirected,
        type: res.type,
        url: res.url,
      });

      if (!res.ok || res.redirected) {
        await swLog({ event: 'install-abort', error: 'manifest fetch not ok or redirected' });
        // Don't skipWaiting — let old SW stay active
        return;
      }

      const manifest = await res.json();
      await swLog({ event: 'install-manifest-parsed', version: manifest.version, fileCount: manifest.files.length });

      const cache = await caches.open(CACHE_PREFIX + manifest.version);
      await cache.addAll(manifest.files);
      await swLog({ event: 'install-cached', cacheKey: CACHE_PREFIX + manifest.version, fileCount: manifest.files.length });

      self.skipWaiting();
      await swLog({ event: 'install-done' });
    } catch (err) {
      await swLog({ event: 'install-error', error: err.message, stack: err.stack });
      throw err; // Let the install fail properly
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const currentCacheName = CACHE_PREFIX + SW_VERSION;
    const toDelete = keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== currentCacheName);

    await swLog({
      event: 'activate',
      currentCacheName,
      allCaches: keys,
      deleting: toDelete,
      keeping: keys.filter((k) => !toDelete.includes(k)),
    });

    await Promise.all(toDelete.map((k) => caches.delete(k)));
    await self.clients.claim();
    await swLog({ event: 'activate-done' });
  })());
});

// --- Fetch handling ---

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: network only (sync handles its own logic)
  if (url.pathname.startsWith(BASE + 'api/')) return;

  // Diagnostic page: always available
  if (url.pathname === BASE + '__sw-diag') {
    event.respondWith(diagnosticPage());
    return;
  }

  // Navigation requests and index.html: cache-first, handle CF Access redirects
  if (event.request.mode === 'navigate' || url.pathname === BASE + 'index.html') {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  // Hashed assets and fonts: cache-first (immutable)
  if (url.pathname.startsWith(BASE + 'assets/') || url.pathname.startsWith(BASE + 'fonts/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else: cache-first with network fallback
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // Never serve redirected responses for sub-resources either
    if (response.redirected || response.type === 'opaqueredirect') {
      return new Response('', { status: 503 });
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function handleNavigation(request) {
  try {
    // Check all caches (not just current version) for any cached index.html
    const cached = await caches.match(request)
      || await caches.match(BASE + 'index.html')
      || await caches.match(BASE);

    const allKeys = await caches.keys();
    const appCaches = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));

    await swLog({
      event: 'nav',
      requestUrl: request.url,
      requestMode: request.mode,
      cacheHit: !!cached,
      appCaches,
      allCaches: allKeys,
    });

    if (cached) {
      // Revalidate in background (fire and forget)
      revalidateNavigation(request);
      return cached;
    }

    // No cache: must fetch from network
    const response = await fetch(request);

    await swLog({
      event: 'nav-fetch',
      status: response.status,
      redirected: response.redirected,
      type: response.type,
      responseUrl: response.url,
    });

    if (response.redirected || response.type === 'opaqueredirect') {
      return response;
    }

    if (response.ok) {
      await cacheNavResponse(request, response.clone());
    }
    return response;
  } catch (err) {
    await swLog({ event: 'nav-error', error: err.message, stack: err.stack });
    // Instead of letting Safari show its generic error, show diagnostic page
    return diagnosticPage('Navigation error: ' + err.message);
  }
}

function revalidateNavigation(request) {
  fetch(request).then(async (response) => {
    if (response.ok && !response.redirected) {
      await cacheNavResponse(request, response.clone());
    }
  }).catch(() => {});
}

async function cacheNavResponse(request, response) {
  const keys = await caches.keys();
  const currentCache = keys.find((k) => k.startsWith(CACHE_PREFIX));
  if (currentCache) {
    const cache = await caches.open(currentCache);
    await cache.put(request, response);
  }
}

