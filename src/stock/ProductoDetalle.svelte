<script lang="ts">
  import type { DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { historial, nivel, stockActual } from './logic';
  import MovimientoRapido from './MovimientoRapido.svelte';
  import MovimientosTabla from './MovimientosTabla.svelte';
  import { movimientosDe, obtenerProducto } from './repo';
  import type { Movimiento, Producto } from './types';

  let { db, id }: { db: DB; id: string } = $props();

  let producto = $state<Producto | undefined>();
  let movimientos = $state<Movimiento[]>([]);
  let cargando = $state(true);

  const stock = $derived(stockActual(movimientos));
  const estado = $derived(producto ? nivel(stock, producto.stockMinimo) : 'ok');
  const filas = $derived(historial(movimientos));

  async function cargar(id: string) {
    cargando = true;
    [producto, movimientos] = await Promise.all([obtenerProducto(db, id), movimientosDe(db, id)]);
    cargando = false;
  }
  $effect(() => {
    cargar(id);
  });
</script>

{#if cargando}
  <p class="muted">Cargando…</p>
{:else if !producto}
  <p class="error">El producto no existe. <a href="#/stock">Volver a productos</a></p>
{:else}
  <p><a href="#/stock">← Productos</a></p>
  <h2>{producto.nombre}{#if !producto.activo} <span class="muted">(inactivo)</span>{/if}</h2>
  <dl class="resumen">
    <dt>Stock</dt>
    <dd class="fuerte {estado}">{formatNumero(stock)} {producto.unidad}</dd>
    <dt>Mínimo</dt>
    <dd>{formatNumero(producto.stockMinimo)}</dd>
    {#if producto.precioVenta !== undefined}
      <dt>Precio de venta</dt>
      <dd>{formatPesos(producto.precioVenta)}</dd>
    {/if}
  </dl>

  {#if producto.activo}
    <MovimientoRapido
      {db}
      productos={[producto]}
      stock={new Map([[producto.id, stock]])}
      fijo={producto}
      onregistrado={(m) => (movimientos = [...movimientos, m])}
    />
  {:else}
    <p class="muted">Para registrar movimientos, marcalo como activo en la lista de productos.</p>
  {/if}

  <h2>Historial</h2>
  {#if !filas.length}
    <p class="muted">Sin movimientos todavía.</p>
  {:else}
    <MovimientosTabla {db} {filas} onanulado={(m) => (movimientos = movimientos.map((x) => (x.id === m.id ? m : x)))} />
  {/if}
{/if}
