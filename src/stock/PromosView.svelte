<script lang="ts">
  import type { DB } from '../lib/db';
  import { formatPesos } from '../lib/money';
  import { coincide } from '../lib/texto';
  import { detalleComponentes, precioSeparado, problemaPromo } from './promos';
  import { borrarPromo, listarProductos, listarPromos, PromoEnVentas, ventasConPromo } from './repo';
  import type { Producto, Promo } from './types';

  let { db }: { db: DB } = $props();

  let promos = $state<Promo[]>([]);
  let productos = $state<Producto[]>([]);
  let cargando = $state(true);
  let busqueda = $state('');
  let verInactivas = $state(false);
  let mensaje = $state('');

  const porId = $derived(new Map(productos.map((p) => [p.id, p])));
  const visibles = $derived(promos.filter((p) => (verInactivas || p.activo) && coincide(p.nombre, busqueda)));
  const inactivas = $derived(promos.filter((p) => !p.activo).length);

  async function cargar() {
    [promos, productos] = await Promise.all([listarPromos(db), listarProductos(db)]);
    cargando = false;
  }
  cargar();

  async function borrar(p: Promo) {
    const ventas = await ventasConPromo(db, p.id);
    if (ventas) {
      mensaje = new PromoEnVentas(ventas).message;
      return;
    }
    if (!confirm(`¿Borrar la promo "${p.nombre}"?`)) return;
    try {
      await borrarPromo(db, p.id);
      promos = promos.filter((x) => x.id !== p.id);
      mensaje = '';
    } catch (e) {
      mensaje = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<div class="barra">
  <button type="button" data-atajo="nuevo" onclick={() => (location.hash = '#/stock/promo/nueva')}>Nueva promo</button>
  <input type="search" data-atajo="buscar" bind:value={busqueda} placeholder="Buscar promo…" aria-label="Buscar promo" />
  <label><input type="checkbox" bind:checked={verInactivas} /> Ver inactivas ({inactivas})</label>
  <span class="muted">{visibles.length} de {promos.length}</span>
</div>

<p class="muted">
  Una promo vende varios productos juntos a su propio precio: se agrega a la venta como un producto más, y descuenta el stock de cada uno.
  El descuento % de la venta no se aplica a las promos.
</p>

{#if mensaje}
  <p class="error" role="alert">{mensaje}</p>
{/if}

<table class="tabla">
  <thead>
    <tr>
      <th>Nombre</th>
      <th>Productos</th>
      <th class="num">Precio</th>
      <th class="num">Por separado</th>
      <th class="num">Ahorro</th>
      <th>Activa</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {#if cargando}
      <tr><td colspan="7" class="muted">Cargando…</td></tr>
    {:else if !promos.length}
      <tr><td colspan="7" class="muted">Todavía no hay promos.</td></tr>
    {/if}
    {#each visibles as p (p.id)}
      {@const separado = precioSeparado(p.componentes, porId)}
      {@const problema = p.activo ? problemaPromo(p, porId) : undefined}
      <tr class:inactivo={!p.activo}>
        <td><a href="#/stock/promo/{p.id}">{p.nombre}</a></td>
        <td>
          {detalleComponentes(p.componentes, porId)}
          {#if problema}<br /><span class="aviso" title="No se puede vender hasta que lo resuelvas">{problema}</span>{/if}
        </td>
        <td class="num fuerte">{formatPesos(p.precio)}</td>
        <td class="num" title={separado.sinPrecio ? 'Algún producto no tiene precio de venta' : undefined}>
          {formatPesos(separado.total)}{#if separado.sinPrecio}&nbsp;<span class="aviso">+?</span>{/if}
        </td>
        <td class="num" class:error={!separado.sinPrecio && separado.total < p.precio}>
          {separado.sinPrecio ? '' : formatPesos(separado.total - p.precio)}
        </td>
        <td>{p.activo ? 'sí' : 'no'}</td>
        <td class="acciones">
          <button type="button" class="secundario" onclick={() => (location.hash = `#/stock/promo/${encodeURIComponent(p.id)}`)}>Editar</button>
          <button type="button" class="secundario peligro" onclick={() => borrar(p)}>Borrar</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
