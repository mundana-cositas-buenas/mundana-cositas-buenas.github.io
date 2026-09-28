<script lang="ts">
  import type { DB } from '../lib/db';
  import { formatNumero } from '../lib/money';
  import { buscarPorNombre } from '../lib/texto';
  import { efecto } from './logic';
  import { registrarMovimiento } from './repo';
  import type { Movimiento, Producto, TipoMovimiento } from './types';
  import { TIPOS, validarMovimiento } from './validar';

  let {
    db,
    productos,
    stock,
    fijo,
    onregistrado,
  }: {
    db: DB;
    productos: Producto[];
    stock: ReadonlyMap<string, number>;
    fijo?: Producto; // the product is fixed (product history page)
    onregistrado: (m: Movimiento) => void;
  } = $props();

  let tipo = $state<TipoMovimiento>('venta');
  let productoTexto = $state('');
  let cantidad = $state('');
  let nota = $state('');
  let error = $state('');
  let guardando = $state(false);
  let productoInput: HTMLInputElement | undefined = $state();
  let cantidadInput: HTMLInputElement | undefined = $state();

  const activos = $derived(productos.filter((p) => p.activo));
  const producto = $derived(fijo ?? buscarPorNombre(activos, productoTexto));
  const v = $derived(validarMovimiento({ tipo, cantidad, nota }));
  const actual = $derived(producto ? (stock.get(producto.id) ?? 0) : 0);
  const despues = $derived(v.ok ? actual + efecto(v.datos) : undefined);

  // The movements page exists to register movements: start there.
  $effect(() => {
    if (!fijo) productoInput?.focus();
  });

  async function registrar() {
    if (guardando) return;
    if (!producto) {
      error = productoTexto.trim() ? 'No hay un único producto activo con ese nombre' : 'Elegí un producto';
      productoInput?.focus();
      return;
    }
    if (!v.ok) {
      error = `Cantidad: ${v.errores.cantidad}`;
      cantidadInput?.focus();
      return;
    }
    if (despues !== undefined && despues < 0 && actual >= 0) {
      const ok = confirm(
        `El stock de "${producto.nombre}" quedaría en ${formatNumero(despues)}.\n` +
          `Puede que falte cargar una entrada. ¿Registrar igual?`,
      );
      if (!ok) return;
    }
    guardando = true;
    try {
      onregistrado(await registrarMovimiento(db, producto.id, v.datos));
      error = '';
      cantidad = '';
      nota = '';
      if (fijo) cantidadInput?.focus();
      else {
        productoTexto = '';
        productoInput?.focus();
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      guardando = false;
    }
  }
</script>

<!-- Enter in any field submits: no keydown handling needed. -->
<form
  class="rapido"
  onsubmit={(e) => {
    e.preventDefault();
    registrar();
  }}
  aria-label="Registrar movimiento"
>
  <select bind:value={tipo} aria-label="Tipo de movimiento">
    {#each TIPOS as t (t.id)}
      <option value={t.id}>{t.titulo}</option>
    {/each}
  </select>
  {#if !fijo}
    <input
      bind:this={productoInput}
      bind:value={productoTexto}
      data-atajo="nuevo"
      list="productos-activos"
      placeholder="Producto…"
      aria-label="Producto"
      aria-invalid={!!productoTexto.trim() && !producto}
    />
    <datalist id="productos-activos">
      {#each activos as p (p.id)}
        <option value={p.nombre}></option>
      {/each}
    </datalist>
  {/if}
  <input
    bind:this={cantidadInput}
    data-atajo={fijo ? 'nuevo' : undefined}
    class="num corto"
    inputmode="decimal"
    bind:value={cantidad}
    placeholder={tipo === 'ajuste' ? '±cant.' : 'cant.'}
    aria-label="Cantidad"
    title={tipo === 'ajuste' ? 'Con signo: -2 descuenta, 3 suma' : undefined}
    aria-invalid={!!cantidad.trim() && !v.ok}
  />
  <input bind:value={nota} placeholder="Nota (opcional)" aria-label="Nota" />
  <button type="submit" disabled={guardando}>Registrar</button>
  <span class="muted">
    {#if producto}
      {#if !fijo}{producto.nombre}:{/if}
      stock {formatNumero(actual)}{#if despues !== undefined}&nbsp;→ <span class:error={despues < 0}>{formatNumero(despues)}</span>{/if}
      {producto.unidad}
    {/if}
  </span>
</form>
{#if error}
  <p class="error" role="alert">{error}</p>
{/if}
