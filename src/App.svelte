<script lang="ts">
  import type { DB } from './lib/db';
  import { SECCIONES, seccionDesdeHash } from './lib/nav';
  import type { PersistState } from './lib/storage';

  let { persistencia, db }: { persistencia: Promise<PersistState>; db: Promise<DB> } = $props();

  let seccion = $state(seccionDesdeHash(location.hash));
</script>

<svelte:window onhashchange={() => (seccion = seccionDesdeHash(location.hash))} />

<header>
  <strong class="marca">Mundana</strong>
  <nav>
    {#each SECCIONES as s (s.id)}
      <a href="#/{s.id}" aria-current={seccion === s.id ? 'page' : undefined}>{s.titulo}</a>
    {/each}
  </nav>
</header>

<main>
  {#await db}
    <p>Abriendo base de datos…</p>
  {:then}
    {#if seccion === 'costos'}
      <h1>Costos de recetas</h1>
      <p class="pendiente">Próximamente: insumos y recetas.</p>
    {:else if seccion === 'stock'}
      <h1>Stock</h1>
      <p class="pendiente">Próximamente: productos, movimientos y alertas.</p>
    {:else}
      <h1>Backup</h1>
      <p class="pendiente">Próximamente: exportar e importar.</p>
    {/if}
  {:catch err}
    <p class="error">No se pudo abrir la base de datos: {err instanceof Error ? err.message : err}</p>
  {/await}
</main>

<footer>
  {#await persistencia then p}
    {#if p !== 'persistente'}
      <span class="aviso">El navegador puede borrar los datos si falta espacio. Hacé backups seguido.</span>
    {/if}
  {/await}
</footer>
