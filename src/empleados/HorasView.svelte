<script lang="ts">
  import type { DB } from '../lib/db';
  import { diaLocal } from '../lib/texto';
  import { abierto, diaDe, formatDuracion, horasPorEmpleado, mesDe, moverRango, semanaDe, type Rango } from './logic';
  import { listarEmpleados, listarTurnos } from './repo';
  import type { Empleado, Turno } from './types';

  let { db }: { db: DB } = $props();

  let empleados = $state<Empleado[]>([]);
  let turnos = $state<Turno[]>([]);
  let cargando = $state(true);

  const hoy = diaLocal(new Date().toISOString());
  let tipo = $state<'semana' | 'mes' | 'otro'>('semana');
  let rango = $state<Rango>(semanaDe(hoy));

  const horas = $derived(horasPorEmpleado(turnos, rango.desde, rango.hasta));
  // Employees with hours in the range, plus the active ones (with zero).
  const filas = $derived(empleados.filter((e) => e.activo || horas.has(e.id)));
  const total = $derived([...horas.values()].reduce((s, h) => s + h.minutos, 0));
  const abiertos = $derived(turnos.filter((t) => abierto(t) && diaDe(t) >= rango.desde && diaDe(t) <= rango.hasta).length);
  const valido = $derived(!!rango.desde && !!rango.hasta && rango.desde <= rango.hasta);

  async function cargar() {
    [empleados, turnos] = await Promise.all([listarEmpleados(db), listarTurnos(db)]);
    cargando = false;
  }
  cargar();

  function elegir(t: 'semana' | 'mes') {
    tipo = t;
    rango = t === 'semana' ? semanaDe(hoy) : mesDe(hoy);
  }

  function mover(paso: number) {
    if (tipo !== 'otro') rango = moverRango(rango, tipo, paso);
  }

  const formatDia = (dia: string) => dia.split('-').reverse().join('/');
</script>

<div class="barra">
  <button type="button" class:secundario={tipo !== 'semana'} onclick={() => elegir('semana')}>Esta semana</button>
  <button type="button" class:secundario={tipo !== 'mes'} onclick={() => elegir('mes')}>Este mes</button>
  {#if tipo !== 'otro'}
    <button type="button" class="secundario" onclick={() => mover(-1)} aria-label="Anterior">‹</button>
    <button type="button" class="secundario" onclick={() => mover(1)} aria-label="Siguiente">›</button>
  {/if}
  <label>Desde <input type="date" bind:value={rango.desde} oninput={() => (tipo = 'otro')} /></label>
  <label>Hasta <input type="date" bind:value={rango.hasta} oninput={() => (tipo = 'otro')} /></label>
</div>

{#if cargando}
  <p class="muted">Cargando…</p>
{:else if !valido}
  <p class="error" role="alert">Elegí un rango válido: "desde" no puede ser posterior a "hasta".</p>
{:else}
  <p>
    Del {formatDia(rango.desde)} al {formatDia(rango.hasta)}. Cuentan los turnos que empezaron en esos días.
    {#if abiertos}<span class="aviso">{abiertos} {abiertos === 1 ? 'turno abierto no se cuenta' : 'turnos abiertos no se cuentan'} hasta que se cierren.</span>{/if}
  </p>
  {#if !filas.length}
    <p class="muted">Todavía no hay empleados. Se agregan en <a href="#/empleados">Fichar</a>.</p>
  {:else}
    <table class="tabla">
      <thead>
        <tr>
          <th>Empleado</th>
          <th class="num">Turnos</th>
          <th class="num">Horas</th>
        </tr>
      </thead>
      <tbody>
        {#each filas as e (e.id)}
          {@const h = horas.get(e.id)}
          <tr class:inactivo={!e.activo}>
            <td><a href="#/empleados/{e.id}">{e.nombre}</a>{#if !e.activo} <span class="muted">(inactivo)</span>{/if}</td>
            <td class="num">{h?.turnos ?? 0}</td>
            <td class="num fuerte">{formatDuracion(h?.minutos ?? 0)}</td>
          </tr>
        {/each}
        <tr class="fuerte">
          <td>Total</td>
          <td class="num">{[...horas.values()].reduce((s, h) => s + h.turnos, 0)}</td>
          <td class="num fuerte">{formatDuracion(total)}</td>
        </tr>
      </tbody>
    </table>
  {/if}
  {#if empleados.some((e) => !e.activo && !horas.has(e.id))}
    <p class="muted">
      Inactivos sin horas en el rango:
      {#each empleados.filter((e) => !e.activo && !horas.has(e.id)) as e, i (e.id)}{i ? ', ' : ''}<a href="#/empleados/{e.id}">{e.nombre}</a>{/each}.
    </p>
  {/if}
{/if}
