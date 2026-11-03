<script lang="ts">
  import type { DB } from '../lib/db';
  import type { Ediciones } from '../pwa/ediciones';
  import AlertasView from './AlertasView.svelte';
  import MovimientosView from './MovimientosView.svelte';
  import ProductoDetalle from './ProductoDetalle.svelte';
  import ProductosView from './ProductosView.svelte';
  import PromoDetalle from './PromoDetalle.svelte';
  import PromosView from './PromosView.svelte';

  let { db, ruta, alertas, ediciones }: { db: DB; ruta: string[]; alertas: number; ediciones: Ediciones } = $props();

  const vista = $derived(
    ruta[0] === 'movimientos' || ruta[0] === 'alertas' || ruta[0] === 'promos'
      ? ruta[0]
      : (ruta[0] === 'producto' || ruta[0] === 'promo') && ruta[1]
        ? ruta[0]
        : 'productos',
  );
</script>

<div class="titulo">
  <h1>Stock</h1>
  <nav class="sub" aria-label="Stock">
    <a href="#/stock" aria-current={vista === 'productos' || vista === 'producto' ? 'page' : undefined}>Productos</a>
    <a href="#/stock/promos" aria-current={vista === 'promos' || vista === 'promo' ? 'page' : undefined}>Promos</a>
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
{:else if vista === 'promos'}
  <PromosView {db} />
{:else if vista === 'promo'}
  {#key ruta[1]}
    <PromoDetalle {db} id={ruta[1]} {ediciones} />
  {/key}
{:else}
  <ProductosView {db} />
{/if}
