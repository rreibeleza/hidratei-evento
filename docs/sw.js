// Deixa o app abrir e funcionar sem internet. Mudou QUALQUER arquivo (termo, config, tela)? Suba VERSAO —
// é assim que o tablet percebe a versão nova (ela entra quando o app voltar à tela inicial).
const VERSAO = 'v3';
const ARQUIVOS = [
  './', 'index.html', 'estilo.css', 'app.js', 'logica.js', 'banco.js', 'config.js', 'termo.js',
  'logo.svg', 'icone-192.png', 'icone-512.png', 'manifest.webmanifest',
  'fonts/outfit.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Só os arquivos do próprio app; o envio à planilha (outra origem, POST) passa direto.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true })
    .then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : fetch(e.request))));
});
