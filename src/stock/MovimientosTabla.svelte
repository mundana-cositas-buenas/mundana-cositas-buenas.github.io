<script lang="ts">
  import type { DB } from '../lib/db';
  import { formatNumero } from '../lib/money';
  import { formatFechaHora } from '../lib/texto';
  import { efecto } from './logic';
  import { anularMovimiento } from './repo';
  import type { Movimiento, Producto } from './types';
  import { TIPOS } from './validar';

  let {
    db,
    filas,
    onanulado,
  }: {
    db: DB;
    // `producto` shows the product column; `saldo` the stock after each movement.
    filas: { mov: Movimiento; producto?: Producto; saldo?: number }[];
    onanulado: (m: Movimiento) => void;
  } = $props();

  const conProducto = $derived(filas.some((f) => f.producto));
  const conSaldo = $derived(filas.some((f) => f.saldo !== undefined));
  const titulo = (m: Movimiento) => TIPOS.find((t) => t.id === m.tipo)?.titulo ?? m.tipo;
  let error = $state('');

  function signo(m: Movimiento): string {
    const e = m.tipo === 'venta' ? -m.cantidad : m.cantidad;
    return e > 0 ? `+${formatNumero(e)}` : formatNumero(e);
  }

  async function anular(m: Movimiento, p?: Producto) {
    const de = p ? ` de "${p.nombre}"` : '';
    const texto = `¿Anular ${titulo(m).toLowerCase()}${de} (${signo(m)}) del ${formatFechaHora(m.fecha)}?`;
    if (!confirm(`${texto}\nQueda en el historial, pero deja de contar para el stock.`)) return;
    try {
      onanulado(await anularMovimiento(db, m.id));
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
      <th>Fecha</th>
      {#if conProducto}<th>Producto</th>{/if}
      <th>Tipo</th>
      <th class="num">Cantidad</th>
      {#if conSaldo}<th class="num">Stock</th>{/if}
      <th>Nota</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {#each filas as { mov: m, producto: p, saldo } (m.id)}
      <tr class:anulado={!!m.anuladoEn}>
        <td>{formatFechaHora(m.fecha)}</td>
        {#if conProducto}
          <td>
            {#if p}<a href="#/stock/producto/{p.id}">{p.nombre}</a>{:else}<span class="muted">(borrado)</span>{/if}
          </td>
        {/if}
        <td>{titulo(m)}</td>
        <td class="num" class:fuerte={efecto(m) !== 0}>{signo(m)}</td>
        {#if conSaldo}<td class="num">{saldo === undefined ? '' : formatNumero(saldo)}</td>{/if}
        <td>{m.nota ?? ''}</td>
        <td class="acciones">
          {#if m.anuladoEn}
            <span class="muted" title="Anulado el {formatFechaHora(m.anuladoEn)}">anulado</span>
          {:else}
            <button type="button" class="secundario peligro" onclick={() => anular(m, p)}>Anular</button>
          {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>
