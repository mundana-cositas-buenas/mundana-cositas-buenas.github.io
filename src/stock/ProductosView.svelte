<script lang="ts">
  import { tick } from 'svelte';
  import { porNombre } from '../lib/campos';
  import { newId, type DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { coincide } from '../lib/texto';
  import { agruparPorCategoria, nivel, valorInventario } from './logic';
  import ProductoFila from './ProductoFila.svelte';
  import {
    borrarProducto,
    contarMovimientos,
    guardarProducto,
    listarCategorias,
    listarProductos,
    listarProveedores,
    ProductoEnPromos,
    ProductoEnVentas,
    promosConProducto,
    stockActualDe,
    ventasConProducto,
  } from './repo';
  import type { Categoria, Producto, Proveedor } from './types';
  import type { DatosProducto } from './validar';

  let { db }: { db: DB } = $props();

  let productos = $state<Producto[]>([]);
  let stock = $state(new Map<string, number>());
  let proveedores = $state<Proveedor[]>([]);
  let categorias = $state<Categoria[]>([]);
  let cargando = $state(true);
  let busqueda = $state('');
  let verInactivos = $state(false);
  let editando = $state<string | null>(null);
  let mensaje = $state('');

  /** Leaves edit mode, putting the keyboard focus back on the row's Edit button. */
  async function terminarEdicion(id: string) {
    editando = null;
    await tick();
    document.querySelector<HTMLElement>(`[data-editar="${id}"]`)?.focus();
  }

  const visibles = $derived(productos.filter((p) => (verInactivos || p.activo) && coincide(p.nombre, busqueda)));
  const inactivos = $derived(productos.filter((p) => !p.activo).length);
  // Over every product, not just the visible ones; hidden until some product has a cost.
  const conCosto = $derived(productos.some((p) => p.costo !== undefined));
  const inventario = $derived(valorInventario(productos, stock));
  // Groups of the visible products; each group's stock value is over all its products, like the total.
  const grupos = $derived(agruparPorCategoria(visibles, categorias));
  const todosPorGrupo = $derived(new Map(agruparPorCategoria(productos, categorias).map((g) => [g.categoria?.id ?? '', g.productos])));
  const valorDe = (categoriaId: string) => valorInventario(todosPorGrupo.get(categoriaId) ?? [], stock).total;

  async function cargar() {
    [productos, stock, proveedores, categorias] = await Promise.all([
      listarProductos(db),
      stockActualDe(db),
      listarProveedores(db),
      listarCategorias(db),
    ]);
    cargando = false;
  }
  cargar();

  const nombresSalvo = (id?: string) => productos.filter((p) => p.id !== id).map((p) => p.nombre);
  const stockDe = (p: Producto) => stock.get(p.id) ?? 0;
  const proveedorPorId = $derived(new Map(proveedores.map((p) => [p.id, p])));
  const sinProveedor = $derived(productos.filter((p) => !p.proveedorId).length);
  const categoriaIds = $derived(new Set(categorias.map((c) => c.id)));
  const sinCategoria = $derived(productos.filter((p) => !p.categoriaId || !categoriaIds.has(p.categoriaId)).length);

  async function agregar(datos: DatosProducto) {
    const p = await guardarProducto(db, { ...datos, id: newId(), actualizadoEn: '' });
    productos = [...productos, p].sort(porNombre);
    mensaje = '';
  }

  async function actualizar(orig: Producto, datos: DatosProducto) {
    // Replace, not merge: an emptied cost must disappear.
    const p = await guardarProducto(db, { ...datos, id: orig.id, actualizadoEn: orig.actualizadoEn });
    productos = productos.map((x) => (x.id === p.id ? p : x)).sort(porNombre);
    terminarEdicion(p.id);
    mensaje = '';
  }

  async function borrar(p: Producto) {
    const ventas = await ventasConProducto(db, p.id);
    if (ventas) {
      mensaje = new ProductoEnVentas(ventas).message;
      return;
    }
    const promos = await promosConProducto(db, p.id);
    if (promos.length) {
      mensaje = new ProductoEnPromos(promos.sort()).message;
      return;
    }
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
      mensaje = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<div class="barra">
  <input type="search" data-atajo="buscar" bind:value={busqueda} placeholder="Buscar producto…" aria-label="Buscar producto" />
  <label><input type="checkbox" bind:checked={verInactivos} /> Ver inactivos ({inactivos})</label>
  <span class="muted">{visibles.length} de {productos.length}</span>
  {#if conCosto}
    <span>
      Valor del stock: <strong>{formatPesos(inventario.total)}</strong>
      {#if inventario.sinCosto}
        <span class="muted">({inventario.sinCosto} {inventario.sinCosto === 1 ? 'producto' : 'productos'} con stock sin costo)</span>
      {/if}
    </span>
  {/if}
</div>

{#if mensaje}
  <p class="error" role="alert">{mensaje}</p>
{/if}
{#if !cargando && !proveedores.some((p) => p.activo)}
  <p class="aviso">Cada producto necesita un proveedor: <a href="#/proveedores/nuevo">cargá un proveedor</a> antes de agregar productos.</p>
{:else if sinProveedor}
  <p class="aviso">
    {sinProveedor === 1 ? 'Hay un producto' : `Hay ${sinProveedor} productos`} sin proveedor: editalos para elegirlo. Sus entradas no
    suman a ninguna cuenta.
  </p>
{/if}
{#if !cargando && !categorias.length}
  <p class="aviso">Cada producto necesita una categoría: <a href="#/stock/categorias">cargá una categoría</a> antes de agregar productos.</p>
{:else if sinCategoria}
  <p class="aviso">
    {sinCategoria === 1 ? 'Hay un producto' : `Hay ${sinCategoria} productos`} sin categoría: editalos para elegirla.
  </p>
{/if}

<table class="tabla">
  <thead>
    <tr>
      <th>Nombre</th>
      <th>Proveedor</th>
      <th>Unidad</th>
      <th class="num">Stock</th>
      <th class="num">Mínimo</th>
      <th class="num">Costo</th>
      <th class="num">Precio de venta</th>
      <th>Activo</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <ProductoFila otrosNombres={nombresSalvo()} {proveedores} {categorias} onguardar={agregar} />
    {#if cargando}
      <tr><td colspan="9" class="muted">Cargando…</td></tr>
    {/if}
  </tbody>
  {#each grupos as g (g.categoria?.id ?? '')}
    <tbody>
      <tr class="grupo">
        <th colspan="9">
          {#if g.categoria}{g.categoria.nombre}{:else}<span class="aviso">Sin categoría</span>{/if}
          <span class="muted">
            {g.productos.length} {g.productos.length === 1 ? 'producto' : 'productos'}{#if conCosto}
              · Valor del stock: {formatPesos(valorDe(g.categoria?.id ?? ''))}{/if}
          </span>
        </th>
      </tr>
      {#each g.productos as p (p.id)}
        {#if editando === p.id}
          <ProductoFila
            inicial={p}
            stock={stockDe(p)}
            enfocar
            otrosNombres={nombresSalvo(p.id)}
            {proveedores}
            {categorias}
            onguardar={(d) => actualizar(p, d)}
            oncancelar={() => terminarEdicion(p.id)}
          />
        {:else}
          {@const n = p.activo ? nivel(stockDe(p), p.stockMinimo) : 'ok'}
          {@const prov = p.proveedorId ? proveedorPorId.get(p.proveedorId) : undefined}
          <tr class={n} class:inactivo={!p.activo} ondblclick={() => (editando = p.id)}>
            <td><a href="#/stock/producto/{p.id}">{p.nombre}</a></td>
            <td>{#if prov}<a href="#/proveedores/{prov.id}">{prov.nombre}</a>{:else}<span class="aviso">Sin proveedor</span>{/if}</td>
            <td>{p.unidad}</td>
            <td class="num fuerte" title={n === 'agotado' ? 'Sin stock' : n === 'bajo' ? 'Bajo el mínimo' : undefined}>
              {formatNumero(stockDe(p))}
            </td>
            <td class="num">{formatNumero(p.stockMinimo)}</td>
            <td class="num">{p.costo === undefined ? '' : formatPesos(p.costo)}</td>
            <td class="num">
              {#if p.precioVenta === undefined}<span class="aviso">Sin precio</span>{:else}{formatPesos(p.precioVenta)}{/if}
            </td>
            <td>{p.activo ? 'sí' : 'no'}</td>
            <td class="acciones">
              <button type="button" class="secundario" data-editar={p.id} onclick={() => (editando = p.id)}>Editar</button>
              <button type="button" class="secundario peligro" onclick={() => borrar(p)}>Borrar</button>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  {/each}
</table>
