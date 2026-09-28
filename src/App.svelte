<script lang="ts">
  import CostosView from './costos/CostosView.svelte';
  import type { DB } from './lib/db';
  import { SECCIONES, seccionDesdeHash, subruta } from './lib/nav';
  import type { PersistState } from './lib/storage';
  import { cambiosStock, cargarAlertas } from './stock/repo';
  import StockView from './stock/StockView.svelte';

  let { persistencia, db }: { persistencia: Promise<PersistState>; db: Promise<DB> } = $props();

  let hash = $state(location.hash);
  const seccion = $derived(seccionDesdeHash(hash));
  const ruta = $derived(subruta(hash));

  // Low-stock count for the nav badge, refreshed after every stock write.
  let alertas = $state(0);
  $effect(() => {
    const actualizar = async () => (alertas = (await cargarAlertas(await db)).length);
    actualizar().catch(() => {});
    cambiosStock.addEventListener('cambio', actualizar);
    return () => cambiosStock.removeEventListener('cambio', actualizar);
  });
</script>

<svelte:window onhashchange={() => (hash = location.hash)} />

<header>
  <strong class="marca">Mundana</strong>
  <nav>
    {#each SECCIONES as s (s.id)}
      <a href="#/{s.id}" aria-current={seccion === s.id ? 'page' : undefined}>
        {s.titulo}{#if s.id === 'stock' && alertas}&nbsp;<span class="badge" title="Productos con stock bajo">{alertas}</span>{/if}
      </a>
    {/each}
  </nav>
</header>

<main>
  {#await db}
    <p>Abriendo base de datos…</p>
  {:then db}
    {#if seccion === 'costos'}
      <CostosView {db} {ruta} />
    {:else if seccion === 'stock'}
      <StockView {db} {ruta} {alertas} />
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
