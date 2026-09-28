// Pure service-worker logic, shared by the SW (src/pwa/sw.ts), the build plugin
// (vite.config.ts) and the page (registro.ts). No DOM/worker globals here.

export const PREFIJO_CACHE = 'mundana-';

export const nombreCache = (version: string) => PREFIJO_CACHE + version;

/** Our caches other than the current one (to delete on `activate`). Foreign caches are left alone. */
export const cachesViejos = (nombres: string[], actual: string) =>
  nombres.filter((n) => n.startsWith(PREFIJO_CACHE) && n !== actual);

/** Files of the build that must not be precached: the SW itself and source maps. */
const EXCLUIDOS = [/^sw\.js$/, /\.map$/, /(^|\/)\./];

/** Build-relative paths (`assets/x.js`) to precache, sorted and without duplicates. */
export function listaPrecache(archivos: string[]): string[] {
  const rel = archivos.map((a) => a.replace(/\\/g, '/').replace(/^\/+/, ''));
  return [...new Set(rel)].filter((a) => a && !EXCLUIDOS.some((re) => re.test(a))).sort();
}

/** FNV-1a (32 bit) over name + content of every file: changes whenever any precached byte changes. */
export function versionBuild(archivos: { nombre: string; contenido: string | Uint8Array }[]): string {
  const enc = new TextEncoder();
  let h = 0x811c9dc5;
  const mezclar = (bytes: Uint8Array) => {
    for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  };
  for (const a of [...archivos].sort((x, y) => (x.nombre < y.nombre ? -1 : x.nombre > y.nombre ? 1 : 0))) {
    mezclar(enc.encode(a.nombre + '\0'));
    mezclar(typeof a.contenido === 'string' ? enc.encode(a.contenido) : a.contenido);
    mezclar(enc.encode('\0'));
  }
  return h.toString(16).padStart(8, '0');
}

/** Absolute URLs to precache, resolved against the SW scope (works at `/` or `/repo/`). */
export const urlsPrecache = (rutas: string[], scope: string) => rutas.map((r) => new URL(r, scope).href);

export type Estrategia = { tipo: 'red' } | { tipo: 'cache'; clave: string };

/**
 * Cache-first for everything precached; navigations inside the scope get the cached
 * `index.html` (hash routing, so there is a single page). Anything else goes to the network.
 */
export function estrategia(
  req: { method: string; url: string; mode: string },
  scope: string,
  precache: ReadonlySet<string>,
): Estrategia {
  if (req.method !== 'GET' || !req.url.startsWith(scope)) return { tipo: 'red' };
  const u = new URL(req.url);
  u.hash = '';
  if (precache.has(u.href)) return { tipo: 'cache', clave: u.href };
  if (req.mode === 'navigate') return { tipo: 'cache', clave: new URL('index.html', scope).href };
  return { tipo: 'red' };
}

/**
 * Message the page sends to a waiting SW when the user accepts the update. The page may only
 * import this *type* from here: a value import would put this module in a chunk shared with
 * the SW, and sw.js must stay self-contained (the build plugin fails otherwise).
 */
export type MensajeActivar = { tipo: 'activar' };

export const esMensajeActivar = (m: unknown): m is MensajeActivar =>
  typeof m === 'object' && m !== null && (m as { tipo?: unknown }).tipo === 'activar';
