<script lang="ts">
  import { tick } from 'svelte';
  import { describirErrores, numeroEditable } from '../lib/campos';
  import { newId, type DB } from '../lib/db';
  import { formatNumero, formatPesos, parsePesos } from '../lib/money';
  import { buscarPorNombre } from '../lib/texto';
  import type { Ediciones } from '../pwa/ediciones';
  import { precioSeparado } from './promos';
  import { borrarPromo, guardarPromo, listarProductos, listarPromos, obtenerPromo, PromoEnVentas, ventasConPromo } from './repo';
  import type { ComponentePromo, Producto, Promo } from './types';
  import { ETIQUETAS_PROMO, leerCantidadComponente, promoFormDesde, promoVacia, validarPromo, type PromoForm } from './validar';

  // `id` is 'nueva' for a promo not saved yet.
  let { db, id, ediciones }: { db: DB; id: string; ediciones: Ediciones } = $props();

  let estado = $state<'cargando' | 'ok' | 'no-existe'>('cargando');
  let promo = $state<Promo | undefined>();
  let form = $state<PromoForm>(promoVacia());
  let guardado = $state(JSON.stringify(promoVacia()));
  let productos = $state<Producto[]>([]);
  let otrosNombres = $state<string[]>([]);
  let intentado = $state(false);
  let guardando = $state(false);
  let mensaje = $state('');
  let agregarTexto = $state('');
  let agregarCantidad = $state('');
  let agregarError = $state('');
  let nombreInput: HTMLInputElement | undefined = $state();
  let agregarInput: HTMLInputElement | undefined = $state();

  const porId = $derived(new Map(productos.map((p) => [p.id, p])));
  const activos = $derived(productos.filter((p) => p.activo));
  const v = $derived(validarPromo(form, otrosNombres));
  const errores = $derived(intentado && !v.ok ? describirErrores(v.errores, ETIQUETAS_PROMO) : '');
  // Live comparison with the components whose quantity is valid so far.
  const validos = $derived(
    form.componentes.flatMap((c): ComponentePromo[] => {
      const n = leerCantidadComponente(c.cantidad);
      return n.ok ? [{ productoId: c.productoId, cantidad: n.valor }] : [];
    }),
  );
  const separado = $derived(precioSeparado(validos, porId));
  const precio = $derived(parsePesos(form.precio));

  async function cargar() {
    const [p, ps, todas] = await Promise.all([id === 'nueva' ? undefined : obtenerPromo(db, id), listarProductos(db), listarPromos(db)]);
    productos = ps;
    otrosNombres = todas.filter((x) => x.id !== p?.id).map((x) => x.nombre);
    if (id !== 'nueva' && !p) {
      estado = 'no-existe';
      return;
    }
    promo = p;
    form = p ? promoFormDesde(p) : promoVacia();
    guardado = JSON.stringify(form);
    estado = 'ok';
    if (!p) {
      await tick();
      nombreInput?.focus();
    }
  }
  cargar();

  // Unsaved changes count as pending input ("Recargar" asks first); the fields alone don't cover the product list.
  $effect(() => {
    ediciones.marcar('promo', estado === 'ok' && JSON.stringify(form) !== guardado);
  });
  $effect(() => () => ediciones.marcar('promo', false));

  function agregar(ev: SubmitEvent) {
    ev.preventDefault();
    const p = buscarPorNombre(activos, agregarTexto);
    if (!p) {
      agregarError = agregarTexto.trim()
        ? `No hay un único producto activo que coincida con "${agregarTexto.trim()}". Elegilo de la lista o escribí más.`
        : 'Escribí el nombre del producto.';
      agregarInput?.focus();
      return;
    }
    const n = leerCantidadComponente(agregarCantidad.trim() || '1');
    if (!n.ok) {
      agregarError = `Cantidad: ${n.error}`;
      return;
    }
    // A product already in the promo gets the quantity added (or replaced, if its own is invalid).
    const igual = form.componentes.find((c) => c.productoId === p.id);
    if (igual) {
      const suya = leerCantidadComponente(igual.cantidad);
      igual.cantidad = numeroEditable(suya.ok ? Math.round((suya.valor + n.valor) * 1e6) / 1e6 : n.valor);
    } else form.componentes.push({ productoId: p.id, cantidad: numeroEditable(n.valor) });
    agregarTexto = agregarCantidad = agregarError = '';
    agregarInput?.focus();
  }

  function quitar(i: number) {
    form.componentes.splice(i, 1);
    agregarInput?.focus();
  }

  async function guardar(ev?: SubmitEvent) {
    ev?.preventDefault();
    if (guardando) return;
    intentado = true;
    if (!v.ok) {
      if (v.errores.nombre) nombreInput?.focus();
      else if (v.errores.componentes && !form.componentes.length) agregarInput?.focus();
      return;
    }
    guardando = true;
    try {
      const r = await guardarPromo(db, { ...v.datos, id: promo?.id ?? newId(), actualizadoEn: promo?.actualizadoEn ?? '' });
      promo = r;
      form = promoFormDesde(r);
      guardado = JSON.stringify(form);
      location.hash = '#/stock/promos';
    } catch (e) {
      mensaje = `No se pudo guardar: ${e instanceof Error ? e.message : e}`;
    } finally {
      guardando = false;
    }
  }

  async function borrar() {
    if (!promo) return;
    const ventas = await ventasConPromo(db, promo.id);
    if (ventas) {
      mensaje = new PromoEnVentas(ventas).message;
      return;
    }
    if (!confirm(`¿Borrar la promo "${promo.nombre}"?`)) return;
    try {
      await borrarPromo(db, promo.id);
      guardado = JSON.stringify(form);
      location.hash = '#/stock/promos';
    } catch (e) {
      mensaje = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<p><a href="#/stock/promos">← Promos</a></p>

{#if estado === 'cargando'}
  <p class="muted">Cargando…</p>
{:else if estado === 'no-existe'}
  <p class="error">La promo no existe (¿fue borrada?).</p>
{:else}
  <h2>{promo ? promo.nombre : 'Nueva promo'}</h2>
  {#if mensaje}
    <p class="error" role="alert">{mensaje}</p>
  {/if}

  <!-- Enter in the name or price saves. -->
  <form id="promo-form" class="cabecera" onsubmit={guardar}>
    <label class="ancho">
      Nombre
      <input bind:this={nombreInput} bind:value={form.nombre} aria-invalid={intentado && !v.ok && !!v.errores.nombre} />
    </label>
    <label>
      Precio
      <input class="num corto" inputmode="decimal" bind:value={form.precio} aria-invalid={intentado && !v.ok && !!v.errores.precio} />
    </label>
    <label>
      Activa
      <input type="checkbox" bind:checked={form.activo} />
    </label>
  </form>

  <table class="tabla">
    <thead>
      <tr>
        <th>Producto</th>
        <th class="num">Cantidad</th>
        <th class="num">Precio de venta</th>
        <th class="num">Por separado</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each form.componentes as c, i (c.productoId)}
        {@const p = porId.get(c.productoId)}
        {@const n = leerCantidadComponente(c.cantidad)}
        <tr>
          <td>
            {#if p}{p.nombre}{#if !p.activo}&nbsp;<span class="aviso">desactivado</span>{/if}{:else}<span class="muted">(borrado)</span>{/if}
          </td>
          <td class="num">
            <input
              class="num corto"
              inputmode="decimal"
              bind:value={c.cantidad}
              aria-label="Cantidad de {p?.nombre ?? 'producto'}"
              aria-invalid={!n.ok}
              title={n.ok ? undefined : n.error}
            />
            {p?.unidad ?? ''}
          </td>
          <td class="num">
            {#if p?.precioVenta === undefined}<span class="aviso">Sin precio</span>{:else}{formatPesos(p.precioVenta)}{/if}
          </td>
          <td class="num">{n.ok && p?.precioVenta !== undefined ? formatPesos(Math.round(n.valor * p.precioVenta)) : ''}</td>
          <td class="acciones">
            <button type="button" class="secundario" title="Quitar" aria-label="Quitar {p?.nombre ?? 'producto'}" onclick={() => quitar(i)}>✕</button>
          </td>
        </tr>
      {/each}
      <tr>
        <td colspan="5" class="agregar">
          <form onsubmit={agregar} aria-label="Agregar producto a la promo">
            <input
              bind:this={agregarInput}
              bind:value={agregarTexto}
              data-atajo="nuevo"
              list="productos-promo"
              placeholder="Agregar producto…"
              aria-label="Producto a agregar"
            />
            <datalist id="productos-promo">
              {#each activos as p (p.id)}
                <option value={p.nombre}></option>
              {/each}
            </datalist>
            <input class="num corto" inputmode="decimal" bind:value={agregarCantidad} placeholder="1" aria-label="Cantidad" title="Vacío = 1" />
            <button type="submit" class="secundario">Agregar</button>
          </form>
          {#if agregarError}<span class="error">{agregarError}</span>{/if}
        </td>
      </tr>
    </tbody>
  </table>

  <dl class="resumen">
    <dt>Por separado</dt>
    <dd>
      {formatPesos(separado.total)}
      {#if separado.sinPrecio}<span class="aviso">({separado.sinPrecio} sin precio de venta)</span>{/if}
    </dd>
    {#if !Number.isNaN(precio)}
      <dt>Precio de la promo</dt>
      <dd class="fuerte">{formatPesos(precio)}</dd>
      {#if !separado.sinPrecio && validos.length}
        <dt>Ahorro</dt>
        <dd class:error={separado.total < precio}>
          {formatPesos(separado.total - precio)}
          {#if separado.total}({formatNumero(((separado.total - precio) / separado.total) * 100, 1)} %){/if}
        </dd>
      {/if}
    {/if}
  </dl>

  {#if errores}
    <p class="error" role="alert">{errores}</p>
  {/if}

  <div class="barra">
    <button type="submit" form="promo-form" disabled={guardando}>Guardar</button>
    <a href="#/stock/promos">Cancelar</a>
    <span class="empuje"></span>
    {#if promo}
      <button type="button" class="secundario peligro" onclick={borrar}>Borrar promo</button>
    {/if}
  </div>
{/if}
