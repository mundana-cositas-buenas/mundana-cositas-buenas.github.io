<script lang="ts">
  import type { DB } from '../lib/db';
  import AlertasView from './AlertasView.svelte';
  import MovimientosView from './MovimientosView.svelte';
  import ProductoDetalle from './ProductoDetalle.svelte';
  import ProductosView from './ProductosView.svelte';

  let { db, ruta, alertas }: { db: DB; ruta: string[]; alertas: number } = $props();

  const vista = $derived(
    ruta[0] === 'movimientos' || ruta[0] === 'alertas' ? ruta[0] : ruta[0] === 'producto' && ruta[1] ? 'producto' : 'productos',
  );
</script>

<div class="titulo">
  <h1>Stock</h1>
  <nav class="sub" aria-label="Stock">
    <a href="#/stock" aria-current={vista === 'productos' || vista === 'producto' ? 'page' : undefined}>Productos</a>
    <a href="#/stock/movimientos" aria-current={vista === 'movimientos' ? 'page' : undefined}>Movimientos</a>
    <a href="#/stock/alertas" aria-current={vista === 'alertas' ? 'page' : undefined}>
      Alertas{#if alertas}&nbsp;<span class="badge">{alertas}</span>{/if}
    </a>
  </nav>
</div>

{#if vista === 'movimientos'}
  <MovimientosView {db} />
{:else if vista === 'alertas'}
  <AlertasView {db} />
{:else if vista === 'producto'}
  <ProductoDetalle {db} id={ruta[1]} />
{:else}
  <ProductosView {db} />
{/if}
