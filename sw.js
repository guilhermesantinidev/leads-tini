// sw.js — cache básico (app shell), suficiente pra instalabilidade e pra
// abrir mais rápido em conexão ruim. Os dados em si (leads) vêm sempre do
// Firestore ao vivo, não são cacheados aqui.

const CACHE_NAME = "leads-shell-v3"; // versão nova pra forçar atualização do cache
const SHELL_FILES = [
  "./index.html",
  "./lead-detail.html",
  "./lead-detail.js",
  "./style.css",
  "./app.js",
  "./firebase-config.js",
  "./manifest.json",
  "./share-target.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Só intercepta GET pro app shell — Firestore/Auth (fetch/XHR pro Google)
  // passa direto, sem cache, sempre precisa ser dado ao vivo.
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});