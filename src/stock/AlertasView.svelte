<script lang="ts">
  import type { DB } from '../lib/db';
  import { formatNumero } from '../lib/money';
  import type { Alerta } from './logic';
  import { cargarAlertas } from './repo';

  let { db }: { db: DB } = $props();

  let lista = $state<Alerta[]>([]);
  let cargando = $state(true);

  async function cargar() {
    lista = await cargarAlertas(db);
    cargando = false;
  }
  cargar();
</script>

{#if cargando}
  <p class="muted">Cargando…</p>
{:else if !lista.length}
  <p>Sin alertas: todos los productos activos están por encima de su mínimo.</p>
{:else}
  <table class="tabla">
    <thead>
      <tr>
        <th>Producto</th>
        <th>Estado</th>
        <th class="num">Stock</th>
        <th class="num">Mínimo</th>
        <th class="num">Falta para el mínimo</th>
      </tr>
    </thead>
    <tbody>
      {#each lista as a (a.producto.id)}
        <tr class={a.nivel}>
          <td><a href="#/stock/producto/{a.producto.id}">{a.producto.nombre}</a></td>
          <td>{a.nivel === 'agotado' ? 'Sin stock' : 'Bajo el mínimo'}</td>
          <td class="num fuerte">{formatNumero(a.stock)} {a.producto.unidad}</td>
          <td class="num">{formatNumero(a.producto.stockMinimo)}</td>
          <td class="num">{a.faltante ? formatNumero(a.faltante) : ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
