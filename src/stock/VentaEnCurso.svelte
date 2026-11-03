<script module lang="ts">
  import type { LineaEnCurso } from './ventas';

  // The sale being entered survives going to another page and back (not a reload).
  const borrador = $state({ lineas: [] as LineaEnCurso[], descuento: '', nota: '' });
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { describirErrores } from '../lib/campos';
  import type { DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { buscarPorNombre } from '../lib/texto';
  import type { Ediciones } from '../pwa/ediciones';
  import { registrarVenta } from './repo';
  import type { Producto } from './types';
  import { ETIQUETAS_VENTA, validarVenta } from './validar';
  import { agregarLinea, importe, leerLinea, quedanNegativos, quitarLinea, totalesEnCurso, type VentaConLineas } from './ventas';

  let {
    db,
    productos,
    stock,
    ediciones,
    onregistrada,
  }: {
    db: DB;
    productos: Producto[];
    stock: ReadonlyMap<string, number>;
    ediciones: Ediciones;
    onregistrada: (v: VentaConLineas) => void;
  } = $props();

  let productoTexto = $state('');
  let cantidad = $state('');
  let error = $state('');
  let intentado = $state(false);
  let guardando = $state(false);
  let productoInput: HTMLInputElement | undefined = $state();
  let cantidadInput: HTMLInputElement | undefined = $state();
  let descuentoInput: HTMLInputElement | undefined = $state();

  const activos = $derived(productos.filter((p) => p.activo));
  const producto = $derived(buscarPorNombre(activos, productoTexto));
  const v = $derived(validarVenta(borrador));
  const t = $derived(totalesEnCurso(borrador.lineas, v.ok ? v.datos.descuentoPct : 0));
  const errorDescuento = $derived(!v.ok && (intentado || borrador.descuento.trim()) ? describirErrores(v.errores, ETIQUETAS_VENTA) : '');

  // A draft kept from before uses the products as they are now (price, name, still active).
  $effect(() => {
    const porId = new Map(productos.map((p) => [p.id, p]));
    untrack(() => {
      borrador.lineas = borrador.lineas.flatMap((l) => {
        const p = porId.get(l.producto.id);
        return p?.activo && p.precioVenta !== undefined ? [{ ...l, producto: p }] : [];
      });
    });
  });

  // An unregistered sale counts as unsaved input ("Recargar" asks first).
  $effect(() => {
    ediciones.marcar('venta', borrador.lineas.length > 0 || !!borrador.descuento.trim() || !!borrador.nota.trim());
  });

  // The home page exists to register sales: start there.
  $effect(() => {
    productoInput?.focus();
  });

  function agregar() {
    const r = leerLinea(producto, productoTexto, cantidad);
    if (!r.ok) {
      error = r.error;
      (r.campo === 'producto' ? productoInput : cantidadInput)?.focus();
      return;
    }
    borrador.lineas = agregarLinea(borrador.lineas, r.linea);
    productoTexto = '';
    cantidad = '';
    error = '';
    productoInput?.focus();
  }

  function quitar(id: string) {
    borrador.lineas = quitarLinea(borrador.lineas, id);
    productoInput?.focus();
  }

  async function registrar() {
    if (guardando) return;
    intentado = true;
    if (!borrador.lineas.length) {
      error = 'Agregá al menos un producto';
      productoInput?.focus();
      return;
    }
    if (!v.ok) {
      error = '';
      descuentoInput?.focus();
      return;
    }
    const negativos = quedanNegativos(borrador.lineas, stock);
    if (negativos.length) {
      const lista = negativos.map((n) => `· ${n.producto.nombre}: ${formatNumero(n.despues)} ${n.producto.unidad}`).join('\n');
      if (!confirm(`El stock quedaría negativo:\n${lista}\nPuede que falte cargar una entrada. ¿Registrar igual?`)) return;
    }
    const datos = v.datos;
    const lineas = borrador.lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad }));
    guardando = true;
    try {
      const r = await registrarVenta(db, lineas, datos);
      borrador.lineas = [];
      borrador.descuento = '';
      borrador.nota = '';
      error = '';
      intentado = false;
      onregistrada(r);
      productoInput?.focus();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      guardando = false;
    }
  }
</script>

<section aria-label="Venta en curso">
  <!-- Enter in the product or quantity adds the line. -->
  <form
    class="rapido"
    onsubmit={(e) => {
      e.preventDefault();
      agregar();
    }}
    aria-label="Agregar producto a la venta"
  >
    <input
      bind:this={productoInput}
      bind:value={productoTexto}
      data-atajo="nuevo"
      list="productos-venta"
      placeholder="Producto…"
      aria-label="Producto"
      aria-invalid={!!productoTexto.trim() && !producto}
    />
    <datalist id="productos-venta">
      {#each activos as p (p.id)}
        <option value={p.nombre}></option>
      {/each}
    </datalist>
    <input
      bind:this={cantidadInput}
      class="num corto"
      inputmode="decimal"
      bind:value={cantidad}
      placeholder="1"
      aria-label="Cantidad"
      title="Vacío = 1"
    />
    <button type="submit" class="secundario">Agregar</button>
    <span class="muted">
      {#if producto}
        {producto.nombre}:
        {#if producto.precioVenta === undefined}<span class="aviso">Sin precio</span>{:else}{formatPesos(producto.precioVenta)}{/if}
        · stock {formatNumero(stock.get(producto.id) ?? 0)} {producto.unidad}
      {/if}
    </span>
  </form>

  {#if borrador.lineas.length}
    <table class="tabla venta">
      <thead>
        <tr>
          <th>Producto</th>
          <th class="num">Cantidad</th>
          <th class="num">Precio</th>
          <th class="num">Importe</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each borrador.lineas as l (l.producto.id)}
          <tr>
            <td>{l.producto.nombre}</td>
            <td class="num">{formatNumero(l.cantidad)} {l.producto.unidad}</td>
            <td class="num">{formatPesos(l.producto.precioVenta ?? 0)}</td>
            <td class="num">{formatPesos(importe(l.cantidad, l.producto.precioVenta ?? 0))}</td>
            <td class="acciones">
              <button type="button" class="secundario" title="Quitar" aria-label="Quitar {l.producto.nombre}" onclick={() => quitar(l.producto.id)}>
                ✕
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        {#if t.descuento}
          <tr>
            <td colspan="3">Subtotal</td>
            <td class="num">{formatPesos(t.subtotal)}</td>
            <td></td>
          </tr>
          <tr>
            <td colspan="3">Descuento {v.ok ? formatNumero(v.datos.descuentoPct, 2) : ''} %</td>
            <td class="num">-{formatPesos(t.descuento)}</td>
            <td></td>
          </tr>
        {/if}
        <tr class="total">
          <td colspan="3">Total</td>
          <td class="num">{formatPesos(t.total)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  {/if}

  <!-- Enter in the discount or the note registers the sale. -->
  <form
    class="rapido"
    onsubmit={(e) => {
      e.preventDefault();
      registrar();
    }}
    aria-label="Registrar venta"
  >
    <label>
      Descuento
      <input
        bind:this={descuentoInput}
        class="num corto"
        inputmode="decimal"
        bind:value={borrador.descuento}
        placeholder="0"
        aria-label="Descuento en porcentaje"
        aria-invalid={!!errorDescuento}
      />
      %
    </label>
    <input bind:value={borrador.nota} placeholder="Nota (opcional)" aria-label="Nota de la venta" />
    <button type="submit" disabled={guardando}>Registrar venta</button>
    {#if borrador.lineas.length}<strong>Total {formatPesos(t.total)}</strong>{/if}
  </form>
  {#if error || errorDescuento}
    <p class="error" role="alert">{error || errorDescuento}</p>
  {/if}
</section>
