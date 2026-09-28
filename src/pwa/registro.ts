// Page side of the service worker: registration and update detection. Browser-only.
import type { MensajeActivar } from './logic';

/** 'nueva': a new version is installed and waiting. 'activada': another tab already activated it. */
export type AvisoVersion = 'nueva' | 'activada';

/** Dispatches 'nueva' / 'activada'; `aviso` keeps the last one for late listeners. */
export const avisosVersion = new EventTarget();
export let aviso: AvisoVersion | undefined;

let registro: ServiceWorkerRegistration | undefined;
let pedida = false;

const HORA = 60 * 60 * 1000;

function avisar(a: AvisoVersion) {
  aviso = a;
  avisosVersion.dispatchEvent(new Event(a));
}

export async function registrarSW(url = `${import.meta.env.BASE_URL}sw.js`) {
  const sw = navigator.serviceWorker;
  if (!sw) return;

  // The first controllerchange is the very first install claiming the page: nothing to do.
  let controlada = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (!controlada) {
      controlada = true;
      return;
    }
    // Reload only when this tab asked for it (the user clicked and confirmed); never on our own.
    if (pedida) location.reload();
    else avisar('activada');
  });

  const reg = (registro = await sw.register(url));
  const vigilar = (w: ServiceWorker | null) =>
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && sw.controller) avisar('nueva');
    });
  if (reg.waiting && sw.controller) avisar('nueva');
  vigilar(reg.installing);
  reg.addEventListener('updatefound', () => vigilar(reg.installing));

  // Hash navigation never triggers the browser's own update check, so poll (fails silently offline).
  const buscar = () => reg.update().catch(() => {});
  setInterval(buscar, HORA);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && buscar());
}

/** Switches to the new version: activates the waiting SW (the page reloads on controllerchange). */
export function aplicarVersion() {
  const w = registro?.waiting;
  if (!w) return location.reload();
  pedida = true;
  w.postMessage({ tipo: 'activar' } satisfies MensajeActivar);
}
