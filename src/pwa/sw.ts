// Service worker: thin wrapper over ./logic. Built to /sw.js by the `precache` plugin
// in vite.config.ts, which replaces __PRECACHE__ and __VERSION__ after bundling.
import { cachesViejos, esMensajeActivar, estrategia, nombreCache, urlsPrecache } from './logic';

declare const __PRECACHE__: string[];
declare const __VERSION__: string;

// Minimal worker types (the app tsconfig uses the DOM lib, which lacks them).
interface EventoExtensible extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface EventoFetch extends EventoExtensible {
  request: Request;
  respondWith(r: Promise<Response>): void;
}
interface EventoMensaje extends EventoExtensible {
  data: unknown;
}
interface Ambito {
  registration: { scope: string };
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(tipo: 'install' | 'activate', fn: (e: EventoExtensible) => void): void;
  addEventListener(tipo: 'fetch', fn: (e: EventoFetch) => void): void;
  addEventListener(tipo: 'message', fn: (e: EventoMensaje) => void): void;
}

const sw = self as unknown as Ambito;
const scope = sw.registration.scope;
const CACHE = nombreCache(__VERSION__);
const URLS = urlsPrecache(__PRECACHE__, scope);
const PRECACHE = new Set(URLS);

sw.addEventListener('install', (e) => {
  // No skipWaiting: a new version waits until the user accepts the update prompt.
  e.waitUntil(
    // `reload` skips the HTTP cache, so a stale index.html can't be mixed with new assets.
    caches.open(CACHE).then((c) => c.addAll(URLS.map((u) => new Request(u, { cache: 'reload' })))),
  );
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      await Promise.all(cachesViejos(await caches.keys(), CACHE).map((k) => caches.delete(k)));
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('fetch', (e) => {
  const est = estrategia(e.request, scope, PRECACHE);
  if (est.tipo === 'red') return;
  e.respondWith(caches.match(est.clave, { cacheName: CACHE }).then((r) => r ?? fetch(e.request)));
});

sw.addEventListener('message', (e) => {
  if (esMensajeActivar(e.data)) e.waitUntil(sw.skipWaiting());
});
