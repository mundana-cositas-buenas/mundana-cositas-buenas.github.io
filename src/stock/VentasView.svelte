<script lang="ts">
  import type { DB } from '../lib/db';
  import type { Ediciones } from '../pwa/ediciones';
  import { listarProductos, listarVentas, stockActualDe } from './repo';
  import type { Producto } from './types';
  import VentaEnCurso from './VentaEnCurso.svelte';
  import VentasDias from './VentasDias.svelte';
  import type { VentaConLineas } from './ventas';

  let { db, ediciones }: { db: DB; ediciones: Ediciones } = $props();

  let productos = $state<Producto[]>([]);
  let stock = $state(new Map<string, number>());
  let ventas = $state<VentaConLineas[]>([]);
  let cargando = $state(true);

  async function cargar() {
    [productos, stock, ventas] = await Promise.all([listarProductos(db), stockActualDe(db), listarVentas(db)]);
    cargando = false;
  }
  cargar();

  async function registrada(v: VentaConLineas) {
    ventas = [v, ...ventas];
    stock = await stockActualDe(db);
  }

  async function anulada(v: VentaConLineas) {
    ventas = ventas.map((x) => (x.venta.id === v.venta.id ? v : x));
    stock = await stockActualDe(db);
  }
</script>

<div class="titulo">
  <h1>Ventas</h1>
</div>

{#if cargando}
  <p class="muted">Cargando…</p>
{:else}
  {#if !productos.some((p) => p.activo)}
    <p class="muted">Todavía no hay productos activos. <a href="#/stock">Cargá los productos</a> para registrar ventas.</p>
  {:else}
    <VentaEnCurso {db} {productos} {stock} {ediciones} onregistrada={registrada} />
  {/if}

  <h2>Ventas por día</h2>
  {#if !ventas.length}
    <p class="muted">Todavía no hay ventas.</p>
  {:else}
    <VentasDias {db} {ventas} {productos} onanulada={anulada} />
  {/if}
{/if}
