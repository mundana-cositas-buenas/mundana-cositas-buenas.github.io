<script lang="ts">
  import { porNombre } from '../lib/campos';
  import { newId, type DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { coincide } from '../lib/texto';
  import { nivel } from './logic';
  import ProductoFila from './ProductoFila.svelte';
  import { borrarProducto, contarMovimientos, guardarProducto, listarProductos, stockActualDe } from './repo';
  import type { Producto } from './types';
  import type { DatosProducto } from './validar';

  let { db }: { db: DB } = $props();

  let productos = $state<Producto[]>([]);
  let stock = $state(new Map<string, number>());
  let cargando = $state(true);
  let busqueda = $state('');
  let verInactivos = $state(false);
  let editando = $state<string | null>(null);
  let mensaje = $state('');

  const visibles = $derived(productos.filter((p) => (verInactivos || p.activo) && coincide(p.nombre, busqueda)));
  const inactivos = $derived(productos.filter((p) => !p.activo).length);

  async function cargar() {
    [productos, stock] = await Promise.all([listarProductos(db), stockActualDe(db)]);
    cargando = false;
  }
  cargar();

  const nombresSalvo = (id?: string) => productos.filter((p) => p.id !== id).map((p) => p.nombre);
  const stockDe = (p: Producto) => stock.get(p.id) ?? 0;

  async function agregar(datos: DatosProducto) {
    const p = await guardarProducto(db, { ...datos, id: newId(), actualizadoEn: '' });
    productos = [...productos, p].sort(porNombre);
    mensaje = '';
  }

  async function actualizar(orig: Producto, datos: DatosProducto) {
    // Replace, not merge: an emptied sale price must disappear.
    const p = await guardarProducto(db, { ...datos, id: orig.id, actualizadoEn: orig.actualizadoEn });
    productos = productos.map((x) => (x.id === p.id ? p : x)).sort(porNombre);
    editando = null;
    mensaje = '';
  }

  async function borrar(p: Producto) {
    const n = await contarMovimientos(db, p.id);
    const aviso = n
      ? `"${p.nombre}" tiene ${n} ${n === 1 ? 'movimiento' : 'movimientos'}, que se van a borrar también.\n` +
        `Si ya no lo vendés, podés desmarcarlo como activo y conservar el historial.\n\n¿Borrarlo igual?`
      : `¿Borrar el producto "${p.nombre}"?`;
    if (!confirm(aviso)) return;
    try {
      await borrarProducto(db, p.id);
      productos = productos.filter((x) => x.id !== p.id);
      mensaje = '';
    } catch (e) {
      mensaje = String(e);
    }
  }
</script>

<div class="barra">
  <input type="search" bind:value={busqueda} placeholder="Buscar producto…" aria-label="Buscar producto" />
  <label><input type="checkbox" bind:checked={verInactivos} /> Ver inactivos ({inactivos})</label>
  <span class="muted">{visibles.length} de {productos.length}</span>
</div>

{#if mensaje}
  <p class="error" role="alert">{mensaje}</p>
{/if}

<table class="tabla">
  <thead>
    <tr>
      <th>Nombre</th>
      <th>Unidad</th>
      <th class="num">Stock</th>
      <th class="num">Mínimo</th>
      <th class="num">Precio de venta</th>
      <th>Activo</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <ProductoFila otrosNombres={nombresSalvo()} onguardar={agregar} />
    {#if cargando}
      <tr><td colspan="7" class="muted">Cargando…</td></tr>
    {/if}
    {#each visibles as p (p.id)}
      {#if editando === p.id}
        <ProductoFila
          inicial={p}
          stock={stockDe(p)}
          enfocar
          otrosNombres={nombresSalvo(p.id)}
          onguardar={(d) => actualizar(p, d)}
          oncancelar={() => (editando = null)}
        />
      {:else}
        {@const n = p.activo ? nivel(stockDe(p), p.stockMinimo) : 'ok'}
        <tr class={n} class:inactivo={!p.activo} ondblclick={() => (editando = p.id)}>
          <td><a href="#/stock/producto/{p.id}">{p.nombre}</a></td>
          <td>{p.unidad}</td>
          <td class="num fuerte" title={n === 'agotado' ? 'Sin stock' : n === 'bajo' ? 'Bajo el mínimo' : undefined}>
            {formatNumero(stockDe(p))}
          </td>
          <td class="num">{formatNumero(p.stockMinimo)}</td>
          <td class="num">{p.precioVenta === undefined ? '' : formatPesos(p.precioVenta)}</td>
          <td>{p.activo ? 'sí' : 'no'}</td>
          <td class="acciones">
            <button type="button" class="secundario" onclick={() => (editando = p.id)}>Editar</button>
            <button type="button" class="secundario peligro" onclick={() => borrar(p)}>Borrar</button>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>
