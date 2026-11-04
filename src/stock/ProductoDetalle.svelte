<script lang="ts">
  import type { DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { historial, nivel, rentabilidad, stockActual, valorStock } from './logic';
  import MovimientoRapido from './MovimientoRapido.svelte';
  import MovimientosTabla from './MovimientosTabla.svelte';
  import { listarCategorias, listarProveedores, movimientosDe, obtenerProducto } from './repo';
  import type { Categoria, Movimiento, Producto, Proveedor } from './types';

  let { db, id }: { db: DB; id: string } = $props();

  let producto = $state<Producto | undefined>();
  let movimientos = $state<Movimiento[]>([]);
  let proveedores = $state<Proveedor[]>([]);
  let categorias = $state<Categoria[]>([]);
  let cargando = $state(true);

  const stock = $derived(stockActual(movimientos));
  const estado = $derived(producto ? nivel(stock, producto.stockMinimo) : 'ok');
  const filas = $derived(historial(movimientos));
  const renta = $derived(producto && rentabilidad(producto));
  const valor = $derived(producto && valorStock(stock, producto.costo));
  const categoria = $derived(producto?.categoriaId ? categorias.find((c) => c.id === producto!.categoriaId) : undefined);
  const proveedor = $derived(producto?.proveedorId ? proveedores.find((p) => p.id === producto!.proveedorId) : undefined);

  async function cargar(id: string) {
    cargando = true;
    [producto, movimientos, proveedores, categorias] = await Promise.all([
      obtenerProducto(db, id),
      movimientosDe(db, id),
      listarProveedores(db),
      listarCategorias(db),
    ]);
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
    <dt>Categoría</dt>
    <dd>{#if categoria}{categoria.nombre}{:else}<span class="aviso">Sin categoría</span>{/if}</dd>
    <dt>Proveedor</dt>
    <dd>{#if proveedor}<a href="#/proveedores/{proveedor.id}">{proveedor.nombre}</a>{:else}<span class="aviso">Sin proveedor</span>{/if}</dd>
    <dt>Stock</dt>
    <dd class="fuerte {estado}">{formatNumero(stock)} {producto.unidad}</dd>
    <dt>Mínimo</dt>
    <dd>{formatNumero(producto.stockMinimo)}</dd>
    {#if producto.costo !== undefined}
      <dt>Costo</dt>
      <dd>{formatPesos(producto.costo)}</dd>
    {/if}
    <dt>Precio de venta</dt>
    <dd>{#if producto.precioVenta === undefined}<span class="aviso">Sin precio</span>{:else}{formatPesos(producto.precioVenta)}{/if}</dd>
    {#if renta}
      <dt>Ganancia</dt>
      <dd class:error={renta.ganancia < 0}>{formatPesos(renta.ganancia)}</dd>
      {#if renta.margen !== undefined}
        <dt>Margen</dt>
        <dd class:error={renta.ganancia < 0}>{formatNumero(renta.margen, 1)} %</dd>
      {/if}
    {/if}
    {#if valor !== undefined}
      <dt>Valor del stock</dt>
      <dd>{formatPesos(valor)}</dd>
    {/if}
  </dl>

  {#if producto.activo}
    <MovimientoRapido
      {db}
      productos={[producto]}
      {proveedores}
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
    <MovimientosTabla
      {db}
      {filas}
      onanulado={(m) => (movimientos = movimientos.map((x) => (x.id === m.id ? m : x)))}
      onborrado={(id) => (movimientos = movimientos.filter((x) => x.id !== id))}
    />
  {/if}
{/if}
