import { mount } from 'svelte';
import App from './App.svelte';
import { getDB } from './lib/db';
import { requestPersistence } from './lib/storage';
import { seguirEdiciones } from './pwa/ediciones';
import { registrarSW } from './pwa/registro';
import './app.css';

const persistencia = requestPersistence();
const db = getDB();
const ediciones = seguirEdiciones();

export default mount(App, {
  target: document.getElementById('app')!,
  props: { persistencia, db, ediciones },
});

// No SW in dev: it would cache the dev server's modules.
if (import.meta.env.PROD) registrarSW().catch((e) => console.error('Service worker:', e));
