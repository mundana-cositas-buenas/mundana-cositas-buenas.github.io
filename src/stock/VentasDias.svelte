<script lang="ts">
  import type { DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { diaLocal, formatFechaHora, formatHora } from '../lib/texto';
  import { anularVenta } from './repo';
  import type { Producto } from './types';
  import { totalesDe, ventasPorDia, type VentaConLineas } from './ventas';

  let {
    db,
    ventas,
    productos,
    onanulada,
  }: {
    db: DB;
    ventas: VentaConLineas[];
    productos: Producto[];
    onanulada: (v: VentaConLineas) => void;
  } = $props();

  const hoy = diaLocal(new Date().toISOString());
  const dias = $derived(ventasPorDia(ventas));
  const porId = $derived(new Map(productos.map((p) => [p.id, p])));
  let abiertos = $state(new Set([hoy]));
  let error = $state('');

  const formatDia = (dia: string) => dia.split('-').reverse().join('/');

  function alternar(dia: string) {
    const s = new Set(abiertos);
    if (!s.delete(dia)) s.add(dia);
    abiertos = s;
  }

  /** "Jugo × 2, Ensalada × 1", by product name. */
  function detalle(v: VentaConLineas): string {
    return v.lineas
      .map((m) => ({ nombre: porId.get(m.productoId)?.nombre ?? '(borrado)', cantidad: m.cantidad }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
      .map((l) => `${l.nombre} × ${formatNumero(l.cantidad)}`)
      .join(', ');
  }

  async function anular(v: VentaConLineas) {
    const texto = `¿Anular la venta del ${formatFechaHora(v.venta.fecha)} (${formatPesos(totalesDe(v).total)})?`;
    if (!confirm(`${texto}\nQueda en el historial, pero deja de contar para el stock y los totales.`)) return;
    try {
      onanulada(await anularVenta(db, v.venta.id));
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

{#if error}
  <p class="error" role="alert">{error}</p>
{/if}

<table class="tabla">
  <thead>
    <tr>
      <th>Día</th>
      <th class="num">Ventas</th>
      <th class="num">Total</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {#each dias as d (d.dia)}
      {@const abierto = abiertos.has(d.dia)}
      <tr>
        <td>{formatDia(d.dia)}{#if d.dia === hoy}&nbsp;<span class="muted">(hoy)</span>{/if}</td>
        <td class="num">{d.cantidad}</td>
        <td class="num fuerte">{formatPesos(d.total)}</td>
        <td class="acciones">
          <button type="button" class="secundario" aria-expanded={abierto} onclick={() => alternar(d.dia)}>
            {abierto ? 'Ocultar' : 'Ver ventas'}
          </button>
        </td>
      </tr>
      {#if abierto}
        <tr class="historial">
          <td colspan="4">
            <table class="tabla">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Productos</th>
                  <th class="num">Descuento</th>
                  <th class="num">Total</th>
                  <th>Nota</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {#each d.ventas as v (v.venta.id)}
                  {@const t = totalesDe(v)}
                  <tr class:anulado={!!v.venta.anuladoEn}>
                    <td>{formatHora(v.venta.fecha)}</td>
                    <td>{detalle(v)}</td>
                    <td class="num">
                      {#if v.venta.descuentoPct}{formatNumero(v.venta.descuentoPct, 2)} % (-{formatPesos(t.descuento)}){/if}
                    </td>
                    <td class="num">{formatPesos(t.total)}</td>
                    <td>{v.venta.nota ?? ''}</td>
                    <td class="acciones">
                      {#if v.venta.anuladoEn}
                        <span class="muted" title="Anulada el {formatFechaHora(v.venta.anuladoEn)}">anulada</span>
                      {:else}
                        <button type="button" class="secundario peligro" onclick={() => anular(v)}>Anular</button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>
