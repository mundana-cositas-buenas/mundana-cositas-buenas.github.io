<script lang="ts">
  import type { DB } from '../lib/db';
  import { coincide } from '../lib/texto';
  import { efecto } from './logic';
  import MovimientoRapido from './MovimientoRapido.svelte';
  import MovimientosTabla from './MovimientosTabla.svelte';
  import { listarMovimientos, listarProductos, stockActualDe } from './repo';
  import type { Movimiento, Producto } from './types';

  let { db }: { db: DB } = $props();

  const MAX = 200;

  let productos = $state<Producto[]>([]);
  let movimientos = $state<Movimiento[]>([]); // newest first
  let stock = $state(new Map<string, number>());
  let cargando = $state(true);
  let busqueda = $state('');

  const porId = $derived(new Map(productos.map((p) => [p.id, p])));
  const filtrados = $derived(
    movimientos.filter((m) => !busqueda.trim() || coincide(porId.get(m.productoId)?.nombre ?? '', busqueda)),
  );
  const filas = $derived(filtrados.slice(0, MAX).map((mov) => ({ mov, producto: porId.get(mov.productoId) })));

  async function cargar() {
    [productos, movimientos, stock] = await Promise.all([listarProductos(db), listarMovimientos(db), stockActualDe(db)]);
    cargando = false;
  }
  cargar();

  function mover(id: string, delta: number) {
    stock = new Map(stock).set(id, (stock.get(id) ?? 0) + delta);
  }

  function registrado(m: Movimiento) {
    movimientos = [m, ...movimientos];
    mover(m.productoId, efecto(m));
  }

  function anulado(m: Movimiento) {
    const antes = movimientos.find((x) => x.id === m.id);
    movimientos = movimientos.map((x) => (x.id === m.id ? m : x));
    if (antes) mover(m.productoId, -efecto(antes));
  }
</script>

{#if cargando}
  <p class="muted">Cargando…</p>
{:else if !productos.some((p) => p.activo)}
  <p class="muted">Todavía no hay productos activos. <a href="#/stock">Cargá los productos</a> para registrar movimientos.</p>
{:else}
  <MovimientoRapido {db} {productos} {stock} onregistrado={registrado} />
{/if}

<h2>Últimos movimientos</h2>
<div class="barra">
  <input type="search" data-atajo="buscar" bind:value={busqueda} placeholder="Filtrar por producto…" aria-label="Filtrar por producto" />
  <span class="muted">
    {filas.length < filtrados.length ? `los últimos ${filas.length} de ${filtrados.length}` : `${filtrados.length}`}
  </span>
</div>
<MovimientosTabla {db} {filas} onanulado={anulado} />
