import { mount } from 'svelte';
import App from './App.svelte';
import { getDB } from './lib/db';
import { requestPersistence } from './lib/storage';
import './app.css';

const persistencia = requestPersistence();
const db = getDB();

export default mount(App, {
  target: document.getElementById('app')!,
  props: { persistencia, db },
});
