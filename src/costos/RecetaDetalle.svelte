<script lang="ts">
  import { tick } from 'svelte';
  import { describirErrores } from '../lib/campos';
  import { newId, type DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { buscarPorNombre } from '../lib/texto';
  import { baseDe, unidadesDe, type Unidad } from '../lib/units';
  import { costoReceta, porId } from './calc';
  import { borrarLinea, borrarReceta, duplicarReceta, guardarLinea, guardarReceta, listarInsumos, obtenerReceta } from './repo';
  import type { Insumo, Receta, RecetaLinea } from './types';
  import {
    cabeceraDesde,
    ETIQUETAS_CABECERA,
    filaDesde,
    leerFila,
    mensajeFila,
    validarCabecera,
    type CabeceraForm,
    type Fila,
  } from './validar';

  let { db, id, nueva = false }: { db: DB; id: string; nueva?: boolean } = $props();

  let estado = $state<'cargando' | 'ok' | 'no-existe'>('cargando');
  let receta = $state<Receta>();
  let cab = $state<CabeceraForm>({ nombre: '', rendimiento: '', unidadRendimiento: '', margen: '', notas: '' });
  let filas = $state<Fila[]>([]);
  let insumos = $state<Insumo[]>([]);
  let mensaje = $state('');
  let tabla: HTMLTableElement | undefined = $state();
  let nombreInput: HTMLInputElement | undefined = $state();
  let agregarInput: HTMLInputElement | undefined = $state();
  let agregarTexto = $state('');
  let agregarError = $state('');

  const insumosPorId = $derived(porId(insumos));
  const cabValida = $derived(validarCabecera(cab));
  const leidas = $derived(filas.map(leerFila));
  const costo = $derived(
    costoReceta(
      cabValida.ok ? cabValida.datos : { rendimiento: NaN, margen: NaN },
      leidas.map((l) => l.linea),
      insumosPorId,
    ),
  );

  async function cargar(recetaId: string) {
    estado = 'cargando';
    const [r, is] = await Promise.all([obtenerReceta(db, recetaId), listarInsumos(db)]);
    insumos = is;
    if (!r) {
      estado = 'no-existe';
      return;
    }
    receta = r.receta;
    cab = cabeceraDesde(r.receta);
    filas = r.lineas.map(filaDesde);
    estado = 'ok';
    if (nueva) {
      // Just created or duplicated: ready to type the name. Drop `/nueva` so a reload doesn't repeat it.
      await tick();
      nombreInput?.focus();
      nombreInput?.select();
      history.replaceState(history.state, '', `#/costos/receta/${encodeURIComponent(recetaId)}`);
    }
  }

  $effect(() => {
    cargar(id);
  });

  async function guardando(fn: () => Promise<void>) {
    try {
      await fn();
      mensaje = '';
    } catch (e) {
      mensaje = `No se pudo guardar: ${e instanceof Error ? e.message : e}`;
    }
  }

  function guardarCabecera() {
    if (!receta || !cabValida.ok) return;
    const datos = { ...$state.snapshot(receta), ...cabValida.datos };
    guardando(async () => {
      receta = await guardarReceta(db, datos);
    });
  }

  function guardarFila(f: Fila) {
    const { linea, errores } = leerFila(f);
    if (Object.keys(errores).length) return;
    guardando(async () => {
      f.linea = (await guardarLinea(db, $state.snapshot(linea))) as typeof f.linea;
    });
  }

  function cambiarInsumo(f: Fila, insumoId: string) {
    if (f.tipo !== 'insumo') return;
    f.linea.insumoId = insumoId;
    const ins = insumosPorId.get(insumoId);
    if (ins && baseDe(f.linea.unidad) !== ins.unidadBase) f.linea.unidad = ins.unidadBase;
    guardarFila(f);
  }

  const siguienteOrden = () => Math.max(-1, ...filas.map((f) => f.linea.orden)) + 1;

  async function agregar(linea: RecetaLinea, enfocar: string) {
    await guardando(async () => {
      const guardada = await guardarLinea(db, linea);
      filas.push(filaDesde(guardada));
      await tick();
      tabla?.querySelector<HTMLElement>(`[data-linea="${guardada.id}"] [data-campo="${enfocar}"]`)?.focus();
    });
  }

  function agregarInsumo(ev: SubmitEvent) {
    ev.preventDefault();
    if (!receta) return;
    const ins = buscarPorNombre(insumos, agregarTexto);
    if (!ins) {
      agregarError = agregarTexto.trim()
        ? `No hay un único insumo que coincida con "${agregarTexto.trim()}". Elegilo de la lista o escribí más.`
        : 'Escribí el nombre del insumo.';
      agregarInput?.focus();
      return;
    }
    agregarTexto = agregarError = '';
    const base = { id: newId(), actualizadoEn: '', recetaId: receta.id, orden: siguienteOrden() };
    agregar({ ...base, tipo: 'insumo', insumoId: ins.id, cantidad: 0, unidad: ins.unidadBase, mermaPct: 0 }, 'cantidad');
  }

  function agregarCostoFijo() {
    if (!receta) return;
    agregar(
      { id: newId(), actualizadoEn: '', recetaId: receta.id, orden: siguienteOrden(), tipo: 'costoFijo', descripcion: '', monto: 0 },
      'descripcion',
    );
  }

  function quitar(f: Fila) {
    guardando(async () => {
      await borrarLinea(db, f.linea.id);
      filas = filas.filter((x) => x.linea.id !== f.linea.id);
    });
  }

  function duplicar() {
    if (!receta) return;
    const r = receta;
    guardando(async () => {
      location.hash = `#/costos/receta/${(await duplicarReceta(db, r.id)).id}/nueva`;
    });
  }

  function borrar() {
    if (!receta || !confirm(`¿Borrar la receta "${receta.nombre}" con todas sus líneas?`)) return;
    const r = receta;
    guardando(async () => {
      await borrarReceta(db, r.id);
      location.hash = '#/costos';
    });
  }

  function unidadesPara(f: Fila & { tipo: 'insumo' }): Unidad[] {
    const ins = insumosPorId.get(f.linea.insumoId);
    const us = ins ? unidadesDe(ins.unidadBase) : [];
    // Keep a now-incompatible unit visible so its error shows on the line.
    return us.includes(f.linea.unidad) ? us : [f.linea.unidad, ...us];
  }

  const errorCampo = (i: number, campo: string): string | undefined => leidas[i]?.errores[campo];

  /** Enter in a line: done with it (its change event saves it), on to the next ingredient. */
  function siguiente(ev: KeyboardEvent) {
    if (ev.key !== 'Enter' || !(ev.target instanceof HTMLInputElement)) return;
    ev.preventDefault();
    ev.target.blur();
    agregarInput?.focus();
  }
</script>

<p><a href="#/costos">← Recetas</a></p>

{#if estado === 'cargando'}
  <p class="muted">Cargando…</p>
{:else if estado === 'no-existe'}
  <p class="error">La receta no existe (¿fue borrada?).</p>
{:else}
  {#if mensaje}
    <p class="error" role="alert">{mensaje}</p>
  {/if}

  <div class="cabecera">
    <label class="ancho">
      Nombre
      <input
        bind:this={nombreInput}
        bind:value={cab.nombre}
        onchange={guardarCabecera}
        aria-invalid={!cabValida.ok && !!cabValida.errores.nombre}
      />
    </label>
    <label>
      Rinde
      <input
        class="num corto"
        inputmode="decimal"
        bind:value={cab.rendimiento}
        onchange={guardarCabecera}
        aria-invalid={!cabValida.ok && !!cabValida.errores.rendimiento}
      />
    </label>
    <label>
      Unidad
      <input bind:value={cab.unidadRendimiento} onchange={guardarCabecera} placeholder="panes, porciones…" />
    </label>
    <label>
      Margen %
      <input
        class="num corto"
        inputmode="decimal"
        bind:value={cab.margen}
        onchange={guardarCabecera}
        aria-invalid={!cabValida.ok && !!cabValida.errores.margen}
      />
    </label>
    <div class="acciones">
      <button type="button" class="secundario" onclick={duplicar}>Duplicar</button>
      <button type="button" class="secundario peligro" onclick={borrar}>Borrar receta</button>
    </div>
  </div>
  {#if !cabValida.ok}
    <p class="error">
      {describirErrores(cabValida.errores, ETIQUETAS_CABECERA)} (no se guarda hasta corregirlo)
    </p>
  {/if}

  <table class="tabla" bind:this={tabla}>
    <thead>
      <tr>
        <th>Ingrediente / concepto</th>
        <th class="num">Cantidad</th>
        <th>Unidad</th>
        <th class="num">Merma %</th>
        <th class="num">Costo</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each filas as f, i (f.linea.id)}
        {@const r = costo.lineas.get(f.linea.id)}
        {@const tecleo = mensajeFila(leidas[i]?.errores ?? {})}
        <tr data-linea={f.linea.id} onkeydown={siguiente}>
          {#if f.tipo === 'insumo'}
            <td>
              <select value={f.linea.insumoId} onchange={(e) => cambiarInsumo(f, e.currentTarget.value)} aria-label="Insumo">
                {#if !insumosPorId.has(f.linea.insumoId)}
                  <option value={f.linea.insumoId}>(insumo borrado)</option>
                {/if}
                {#each insumos as ins (ins.id)}
                  <option value={ins.id}>{ins.nombre}</option>
                {/each}
              </select>
            </td>
            <td class="num">
              <input
                class="num corto"
                inputmode="decimal"
                data-campo="cantidad"
                bind:value={f.cantidad}
                onchange={() => guardarFila(f)}
                aria-label="Cantidad"
                aria-invalid={!!errorCampo(i, 'cantidad')}
                title={errorCampo(i, 'cantidad')}
              />
            </td>
            <td>
              <select bind:value={f.linea.unidad} onchange={() => guardarFila(f)} aria-label="Unidad">
                {#each unidadesPara(f) as u (u)}
                  <option value={u}>{u}</option>
                {/each}
              </select>
            </td>
            <td class="num">
              <input
                class="num corto"
                inputmode="decimal"
                bind:value={f.merma}
                onchange={() => guardarFila(f)}
                placeholder="0"
                aria-label="Merma %"
                aria-invalid={!!errorCampo(i, 'merma')}
                title={errorCampo(i, 'merma')}
              />
            </td>
          {:else}
            <td colspan="3">
              <input
                class="ancho"
                data-campo="descripcion"
                bind:value={f.linea.descripcion}
                onchange={() => guardarFila(f)}
                placeholder="Costo fijo: gas, packaging, mano de obra…"
                aria-label="Descripción"
              />
            </td>
            <td class="num">
              <input
                class="num corto"
                inputmode="decimal"
                bind:value={f.monto}
                onchange={() => guardarFila(f)}
                placeholder="$"
                aria-label="Monto"
                aria-invalid={!!errorCampo(i, 'monto')}
                title={errorCampo(i, 'monto')}
              />
            </td>
          {/if}
          <td class="num">
            {#if tecleo}
              <span class="error" title="La línea no se guarda hasta corregirlo">{tecleo} (sin guardar)</span>
            {:else if r?.ok}
              {formatPesos(r.valor)}
            {:else}
              <span class="error">{r?.error}</span>
            {/if}
          </td>
          <td class="acciones">
            <button type="button" class="secundario" onclick={() => quitar(f)} aria-label="Quitar línea" title="Quitar línea">✕</button>
          </td>
        </tr>
      {/each}
      {#if !filas.length}
        <tr><td colspan="6" class="muted">Sin líneas. Agregá insumos o costos fijos.</td></tr>
      {/if}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6" class="agregar">
          <form onsubmit={agregarInsumo} aria-label="Agregar insumo">
            <input
              bind:this={agregarInput}
              bind:value={agregarTexto}
              oninput={() => (agregarError = '')}
              data-atajo="nuevo"
              list="insumos-receta"
              placeholder={insumos.length ? 'Agregar insumo…' : 'No hay insumos cargados'}
              aria-label="Agregar insumo"
              aria-invalid={!!agregarError}
              disabled={!insumos.length}
            />
            <datalist id="insumos-receta">
              {#each insumos as ins (ins.id)}
                <option value={ins.nombre}></option>
              {/each}
            </datalist>
            <button type="submit" class="secundario" disabled={!insumos.length}>+ Insumo</button>
          </form>
          <button type="button" class="secundario" onclick={agregarCostoFijo}>+ Costo fijo</button>
          {#if !insumos.length}
            <a href="#/costos/insumos">Cargar insumos</a>
          {/if}
        </td>
      </tr>
      {#if agregarError}
        <tr class="errores"><td colspan="6">{agregarError}</td></tr>
      {/if}
    </tfoot>
  </table>

  <dl class="resumen">
    <dt>Costo total</dt>
    <dd>{formatPesos(costo.costoTotal)}</dd>
    <dt>Costo por unidad</dt>
    <dd>{formatPesos(costo.costoPorUnidad)}</dd>
    <dt>Margen</dt>
    <dd>{cabValida.ok ? `${formatNumero(cabValida.datos.margen)} %` : '—'}</dd>
    <dt>Precio sugerido</dt>
    <dd class="fuerte">{formatPesos(costo.precioSugerido)}</dd>
  </dl>
  {#if costo.errores}
    <p class="error">
      ⚠ {costo.errores === 1 ? 'Una línea tiene' : `${costo.errores} líneas tienen`} error y no se suma{costo.errores === 1 ? '' : 'n'} al
      costo.
    </p>
  {/if}

  <label class="notas">
    Notas
    <textarea bind:value={cab.notas} onchange={guardarCabecera} rows="3"></textarea>
  </label>
{/if}
