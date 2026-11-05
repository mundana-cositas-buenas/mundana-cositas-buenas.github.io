<script lang="ts">
  import { describirErrores } from '../lib/campos';
  import { newId, type DB } from '../lib/db';
  import { diaLocal, formatFechaHora, formatHora } from '../lib/texto';
  import { abierto, diaDe, formatDuracion, HORAS_AVISO, largo, minutosDe, turnosPendientes } from './logic';
  import { ficharEntrada, ficharSalida, guardarEmpleado, listarEmpleados, listarTurnos } from './repo';
  import type { Empleado, Turno } from './types';
  import { ETIQUETAS_EMPLEADO, validarEmpleado } from './validar';

  let { db }: { db: DB } = $props();

  let empleados = $state<Empleado[]>([]);
  let turnos = $state<Turno[]>([]);
  let cargando = $state(true);
  let error = $state('');
  let ocupado = $state(false);
  // Refreshed every minute, so the running shifts' durations move.
  let ahora = $state(new Date());
  $effect(() => {
    const t = setInterval(() => (ahora = new Date()), 60_000);
    return () => clearInterval(t);
  });

  const hoy = $derived(diaLocal(ahora.toISOString()));
  const activos = $derived(empleados.filter((e) => e.activo));
  const nombreDe = $derived(new Map(empleados.map((e) => [e.id, e.nombre])));
  const abiertoDe = $derived(new Map(turnos.filter(abierto).map((t) => [t.empleadoId, t])));
  const pendientes = $derived(turnosPendientes(turnos, ahora));
  const deHoy = $derived(turnos.filter((t) => !t.anuladoEn && (diaDe(t) === hoy || abierto(t))).reverse());

  async function cargar() {
    [empleados, turnos] = await Promise.all([listarEmpleados(db), listarTurnos(db)]);
    ahora = new Date();
    cargando = false;
  }
  cargar();

  async function hacer(fn: () => Promise<unknown>) {
    if (ocupado) return;
    ocupado = true;
    try {
      await fn();
      error = '';
      await cargar();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      ocupado = false;
    }
  }

  const entrar = (e: Empleado) => hacer(() => ficharEntrada(db, e.id));

  function salir(e: Empleado, t: Turno) {
    const n = new Date();
    if (largo(t, n)) {
      const texto = `${e.nombre} tiene un turno abierto desde ${formatFechaHora(t.entrada)} (${formatDuracion(minutosDe(t, n))} h).`;
      if (!confirm(`${texto}\n¿Fichar la salida ahora?\nSi se olvidó de fichar, mejor cargá la hora real de salida en su página.`)) return;
    }
    hacer(() => ficharSalida(db, t.id));
  }

  // Quick add: just a name.
  let nombre = $state('');
  let intentado = $state(false);
  const v = $derived(validarEmpleado({ nombre, activo: true }, empleados.map((e) => e.nombre)));
  const erroresAlta = $derived(intentado && !v.ok ? describirErrores(v.errores, ETIQUETAS_EMPLEADO) : '');

  async function agregar(ev: SubmitEvent) {
    ev.preventDefault();
    intentado = true;
    if (!v.ok) return;
    const datos = v.datos;
    await hacer(() => guardarEmpleado(db, { ...datos, id: newId(), actualizadoEn: '' }));
    if (!error) {
      nombre = '';
      intentado = false;
    }
  }
</script>

{#if error}
  <p class="error" role="alert">{error}</p>
{/if}

{#if cargando}
  <p class="muted">Cargando…</p>
{:else}
  {#if pendientes.length}
    <div class="aviso" role="status">
      <p>Turnos de días anteriores sin salida (¿se olvidaron de fichar?). Cargá la hora real de salida, o anulalos:</p>
      <ul>
        {#each pendientes as t (t.id)}
          <li>
            <a href="#/empleados/{t.empleadoId}">{nombreDe.get(t.empleadoId) ?? '(borrado)'}</a>: entró el {formatFechaHora(t.entrada)}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if !activos.length}
    <p class="muted">Todavía no hay empleados activos. Agregá uno abajo.</p>
  {:else}
    <table class="tabla fichar">
      <thead>
        <tr>
          <th>Empleado</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each activos as e (e.id)}
          {@const t = abiertoDe.get(e.id)}
          <tr class={t && largo(t, ahora) ? 'bajo' : ''}>
            <td><a href="#/empleados/{e.id}">{e.nombre}</a></td>
            <td>
              {#if t}
                Trabajando desde {diaDe(t) === hoy ? formatHora(t.entrada) : formatFechaHora(t.entrada)}
                <span class="muted">({formatDuracion(minutosDe(t, ahora))})</span>
                {#if largo(t, ahora)}<span class="fuerte">: más de {HORAS_AVISO} h, ¿se olvidó de fichar la salida?</span>{/if}
              {:else}
                <span class="muted">No está trabajando</span>
              {/if}
            </td>
            <td class="acciones">
              {#if t}
                <button type="button" onclick={() => salir(e, t)} disabled={ocupado}>Salir</button>
              {:else}
                <button type="button" onclick={() => entrar(e)} disabled={ocupado}>Entrar</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <form class="rapido" onsubmit={agregar} aria-label="Agregar empleado">
    <input data-atajo="nuevo" bind:value={nombre} placeholder="Nombre del empleado nuevo" aria-label="Nombre del empleado nuevo" aria-invalid={!!erroresAlta} />
    <button type="submit" class="secundario" disabled={ocupado}>Agregar empleado</button>
    {#if empleados.length > activos.length}
      <span class="muted">Inactivos: {empleados.length - activos.length} (no aparecen para fichar; ver en Horas)</span>
    {/if}
  </form>
  {#if erroresAlta}
    <p class="error" role="alert">{erroresAlta}</p>
  {/if}

  <h2>Turnos de hoy</h2>
  {#if !deHoy.length}
    <p class="muted">Nadie fichó hoy todavía.</p>
  {:else}
    <table class="tabla compacta">
      <thead>
        <tr>
          <th>Empleado</th>
          <th>Entrada</th>
          <th>Salida</th>
          <th class="num">Duración</th>
        </tr>
      </thead>
      <tbody>
        {#each deHoy as t (t.id)}
          <tr>
            <td><a href="#/empleados/{t.empleadoId}">{nombreDe.get(t.empleadoId) ?? '(borrado)'}</a></td>
            <td>{diaDe(t) === hoy ? formatHora(t.entrada) : formatFechaHora(t.entrada)}</td>
            <td>{t.salida ? formatHora(t.salida) : 'trabajando'}</td>
            <td class="num">{formatDuracion(minutosDe(t, ahora))}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/if}
