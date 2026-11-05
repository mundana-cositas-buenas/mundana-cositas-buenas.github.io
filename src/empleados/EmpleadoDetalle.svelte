<script lang="ts">
  import { describirErrores } from '../lib/campos';
  import type { DB } from '../lib/db';
  import { diaLocal, formatFecha, formatFechaHora, formatHora } from '../lib/texto';
  import { abierto, diaDe, formatDuracion, horasPorEmpleado, HORAS_AVISO, largo, mesDe, minutosDe, moverRango } from './logic';
  import {
    anularTurno,
    borrarEmpleado,
    borrarTurno,
    cargarTurno,
    cerrarTurno,
    EmpleadoEnUso,
    guardarEmpleado,
    listarEmpleados,
    obtenerEmpleado,
    turnosDe,
  } from './repo';
  import type { Empleado, Turno } from './types';
  import {
    empleadoFormDesde,
    ETIQUETAS_CIERRE,
    ETIQUETAS_EMPLEADO,
    ETIQUETAS_TURNO,
    validarCierre,
    validarEmpleado,
    validarTurno,
    type EmpleadoForm,
    type TurnoForm,
  } from './validar';

  let { db, id }: { db: DB; id: string } = $props();

  let estado = $state<'cargando' | 'ok' | 'no-existe'>('cargando');
  let empleado = $state<Empleado | undefined>();
  let form = $state<EmpleadoForm>({ nombre: '', activo: true });
  let otrosNombres = $state<string[]>([]);
  let turnos = $state<Turno[]>([]);
  let intentado = $state(false);
  let mensaje = $state('');
  let error = $state('');

  const ahora = new Date();
  const hoy = diaLocal(ahora.toISOString());
  let rango = $state(mesDe(hoy));
  const v = $derived(validarEmpleado(form, otrosNombres));
  const erroresDatos = $derived(intentado && !v.ok ? describirErrores(v.errores, ETIQUETAS_EMPLEADO) : '');
  const abiertoAhora = $derived(turnos.find(abierto));
  const delMes = $derived(turnos.filter((t) => diaDe(t) >= rango.desde && diaDe(t) <= rango.hasta).reverse());
  const totalMes = $derived(horasPorEmpleado(turnos, rango.desde, rango.hasta).get(id));
  const nombreMes = $derived(
    new Date(rango.desde + 'T12:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
  );

  async function cargar() {
    const [e, todos] = await Promise.all([obtenerEmpleado(db, id), listarEmpleados(db)]);
    if (!e) {
      estado = 'no-existe';
      return;
    }
    otrosNombres = todos.filter((x) => x.id !== e.id).map((x) => x.nombre);
    empleado = e;
    form = empleadoFormDesde(e);
    turnos = await turnosDe(db, e.id);
    estado = 'ok';
  }
  cargar();

  const recargarTurnos = async () => (turnos = await turnosDe(db, id));
  const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

  async function guardar(ev: SubmitEvent) {
    ev.preventDefault();
    intentado = true;
    mensaje = '';
    if (!v.ok || !empleado) return;
    try {
      empleado = await guardarEmpleado(db, { ...empleado, ...v.datos });
      form = empleadoFormDesde(empleado);
      intentado = false;
      mensaje = 'Datos guardados.';
      error = '';
    } catch (e) {
      error = `No se pudo guardar: ${mensajeDe(e)}`;
    }
  }

  async function borrar() {
    if (!empleado) return;
    if (turnos.length) {
      error = new EmpleadoEnUso().message;
      return;
    }
    if (!confirm(`¿Borrar el empleado "${empleado.nombre}"?`)) return;
    try {
      await borrarEmpleado(db, empleado.id);
      location.hash = '#/empleados';
    } catch (e) {
      error = mensajeDe(e);
    }
  }

  // --- Closing a shift left open ---

  let cierre = $state({ salida: '' });
  let cierreIntentado = $state(false);
  const vc = $derived(abiertoAhora ? validarCierre(cierre, abiertoAhora.entrada) : undefined);
  const erroresCierre = $derived(cierreIntentado && vc && !vc.ok ? describirErrores(vc.errores, ETIQUETAS_CIERRE) : '');

  async function cerrar(ev: SubmitEvent) {
    ev.preventDefault();
    cierreIntentado = true;
    if (!abiertoAhora || !vc?.ok) return;
    try {
      await cerrarTurno(db, abiertoAhora.id, vc.datos);
      cierre = { salida: '' };
      cierreIntentado = false;
      error = '';
      await recargarTurnos();
    } catch (e) {
      error = mensajeDe(e);
    }
  }

  // --- A whole shift typed by hand ---

  let manual = $state<TurnoForm>({ dia: hoy, entrada: '', salida: '' });
  let manualIntentado = $state(false);
  let entradaInput: HTMLInputElement | undefined = $state();
  const vm = $derived(validarTurno(manual));
  const erroresManual = $derived(manualIntentado && !vm.ok ? describirErrores(vm.errores, ETIQUETAS_TURNO) : '');

  async function cargarManual(ev: SubmitEvent) {
    ev.preventDefault();
    manualIntentado = true;
    if (!vm.ok) return;
    try {
      await cargarTurno(db, id, vm.datos);
      manual = { dia: manual.dia, entrada: '', salida: '' };
      manualIntentado = false;
      error = '';
      await recargarTurnos();
      entradaInput?.focus();
    } catch (e) {
      error = mensajeDe(e);
    }
  }

  // --- History ---

  function describir(t: Turno): string {
    return `el turno del ${formatFechaHora(t.entrada)}${t.salida ? ` a ${formatFechaHora(t.salida)}` : ' (abierto)'}`;
  }

  async function anular(t: Turno) {
    if (!confirm(`¿Anular ${describir(t)}?\nQueda en el historial, pero deja de contar para las horas.`)) return;
    try {
      await anularTurno(db, t.id);
      error = '';
      await recargarTurnos();
    } catch (e) {
      error = mensajeDe(e);
    }
  }

  async function borrarT(t: Turno) {
    if (!confirm(`¿Borrar ${describir(t)}, que está anulado?\nSe elimina del historial; no cambia las horas.`)) return;
    try {
      await borrarTurno(db, t.id);
      error = '';
      await recargarTurnos();
    } catch (e) {
      error = mensajeDe(e);
    }
  }

  function carga(t: Turno): string {
    if (t.manual) return 'a mano';
    return t.salidaManual ? 'fichado, salida a mano' : 'fichado';
  }
</script>

<p><a href="#/empleados">← Fichar</a> · <a href="#/empleados/horas">Horas</a></p>

{#if estado === 'cargando'}
  <p class="muted">Cargando…</p>
{:else if estado === 'no-existe'}
  <p class="error">El empleado no existe (¿fue borrado?).</p>
{:else if empleado}
  <h2>{empleado.nombre}{#if !empleado.activo} <span class="muted">(inactivo)</span>{/if}</h2>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <form class="cabecera" onsubmit={guardar} aria-label="Datos del empleado">
    <label class="ancho">
      Nombre
      <input bind:value={form.nombre} aria-invalid={intentado && !v.ok && !!v.errores.nombre} />
    </label>
    <label>
      Activo
      <input type="checkbox" bind:checked={form.activo} />
    </label>
    <div class="acciones">
      <button type="submit">Guardar datos</button>
      <button type="button" class="secundario peligro" onclick={borrar}>Borrar empleado</button>
    </div>
  </form>
  {#if erroresDatos}
    <p class="error" role="alert">{erroresDatos}</p>
  {:else if mensaje}
    <p class="muted" role="status">{mensaje}</p>
  {/if}

  {#if abiertoAhora}
    <h2>Turno abierto</h2>
    <p class:aviso={largo(abiertoAhora, ahora)}>
      Entró el {formatFechaHora(abiertoAhora.entrada)} ({formatDuracion(minutosDe(abiertoAhora, ahora))} h hasta ahora{largo(abiertoAhora, ahora)
        ? `: más de ${HORAS_AVISO} h, ¿se olvidó de fichar la salida?`
        : ''}).
    </p>
    <form class="rapido" onsubmit={cerrar} aria-label="Cargar la salida del turno abierto">
      <label>
        Salida a las
        <input type="time" bind:value={cierre.salida} aria-invalid={!!erroresCierre} />
      </label>
      <button type="submit">Cerrar turno</button>
      <span class="muted">Si la hora es anterior a la de entrada, se toma el día siguiente.</span>
    </form>
    {#if erroresCierre}
      <p class="error" role="alert">{erroresCierre}</p>
    {/if}
  {/if}

  <h2>Cargar un turno a mano</h2>
  <form class="rapido" onsubmit={cargarManual} aria-label="Cargar un turno a mano">
    <label>
      Día
      <input type="date" bind:value={manual.dia} max={hoy} aria-invalid={manualIntentado && !vm.ok && !!vm.errores.dia} />
    </label>
    <label>
      Entrada
      <input
        type="time"
        data-atajo="nuevo"
        bind:this={entradaInput}
        bind:value={manual.entrada}
        aria-invalid={manualIntentado && !vm.ok && !!vm.errores.entrada}
      />
    </label>
    <label>
      Salida
      <input type="time" bind:value={manual.salida} aria-invalid={manualIntentado && !vm.ok && !!vm.errores.salida} />
    </label>
    <button type="submit">Cargar turno</button>
  </form>
  {#if erroresManual}
    <p class="error" role="alert">{erroresManual}</p>
  {/if}
  <p class="muted">Para un turno que pasa la medianoche, poné la salida del día siguiente (ej.: 20:00 a 01:00).</p>

  <h2>Turnos</h2>
  <div class="barra">
    <button type="button" class="secundario" onclick={() => (rango = moverRango(rango, 'mes', -1))} aria-label="Mes anterior">‹</button>
    <span class="fuerte">{nombreMes}</span>
    <button type="button" class="secundario" onclick={() => (rango = moverRango(rango, 'mes', 1))} aria-label="Mes siguiente">›</button>
    <span>Total: <strong>{formatDuracion(totalMes?.minutos ?? 0)} h</strong> en {totalMes?.turnos ?? 0} {totalMes?.turnos === 1 ? 'turno' : 'turnos'}</span>
  </div>
  {#if !delMes.length}
    <p class="muted">Sin turnos en este mes.</p>
  {:else}
    <table class="tabla">
      <thead>
        <tr>
          <th>Día</th>
          <th>Entrada</th>
          <th>Salida</th>
          <th class="num">Duración</th>
          <th>Carga</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each delMes as t (t.id)}
          <tr class:anulado={!!t.anuladoEn} class={largo(t, ahora) ? 'bajo' : ''}>
            <td>{formatFecha(t.entrada)}</td>
            <td>{formatHora(t.entrada)}</td>
            <td>
              {#if t.salida}
                {formatHora(t.salida)}{#if diaLocal(t.salida) !== diaDe(t)} <span class="muted">({formatFecha(t.salida)})</span>{/if}
              {:else}
                <span class="muted">abierto</span>
              {/if}
            </td>
            <td class="num">{formatDuracion(minutosDe(t, ahora))}{#if largo(t, ahora)}&nbsp;<span title="Más de {HORAS_AVISO} h">⚠</span>{/if}</td>
            <td>{carga(t)}</td>
            <td class="acciones">
              {#if t.anuladoEn}
                <span class="muted">anulado</span>
                <button type="button" class="secundario peligro" onclick={() => borrarT(t)}>Borrar</button>
              {:else}
                <button type="button" class="secundario peligro" onclick={() => anular(t)}>Anular</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/if}
