<script lang="ts">
  import type { DB } from '../lib/db';
  import EmpleadoDetalle from './EmpleadoDetalle.svelte';
  import FicharView from './FicharView.svelte';
  import HorasView from './HorasView.svelte';

  let { db, ruta, turnosPendientes }: { db: DB; ruta: string[]; turnosPendientes: number } = $props();

  const vista = $derived(ruta[0] === 'horas' ? 'horas' : ruta[0] ? 'empleado' : 'fichar');
</script>

<div class="titulo">
  <h1>Empleados</h1>
  <nav class="sub" aria-label="Empleados">
    <a href="#/empleados" aria-current={vista !== 'horas' ? 'page' : undefined}>
      Fichar{#if turnosPendientes}&nbsp;<span class="badge" title="Turnos de días anteriores sin salida">{turnosPendientes}</span>{/if}
    </a>
    <a href="#/empleados/horas" aria-current={vista === 'horas' ? 'page' : undefined}>Horas</a>
  </nav>
</div>

{#if vista === 'horas'}
  <HorasView {db} />
{:else if vista === 'empleado'}
  {#key ruta[0]}
    <EmpleadoDetalle {db} id={ruta[0]} />
  {/key}
{:else}
  <FicharView {db} />
{/if}
