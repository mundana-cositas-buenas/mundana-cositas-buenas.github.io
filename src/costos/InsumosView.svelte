<script lang="ts">
  import { tick } from 'svelte';
  import { porNombre } from '../lib/campos';
  import { newId, type DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { coincide, formatFechaHora } from '../lib/texto';
  import { unidadMayor } from '../lib/units';
  import { costoPorUnidadBase, variaciones, type Variacion } from './calc';
  import InsumoFila from './InsumoFila.svelte';
  import { borrarInsumo, guardarInsumo, historialDe, InsumoEnUso, listarInsumos, recetasQueUsan } from './repo';
  import type { Insumo } from './types';

  let { db }: { db: DB } = $props();

  let insumos = $state<Insumo[]>([]);
  let cargando = $state(true);
  let busqueda = $state('');
  let editando = $state<string | null>(null);
  let mensaje = $state('');

  /** Leaves edit mode, putting the keyboard focus back on the row's Edit button. */
  async function terminarEdicion(id: string) {
    editando = null;
    await tick();
    document.querySelector<HTMLElement>(`[data-editar="${id}"]`)?.focus();
  }

  const visibles = $derived(insumos.filter((i) => coincide(i.nombre, busqueda)));

  async function cargar() {
    insumos = await listarInsumos(db);
    cargando = false;
  }
  cargar();

  // Price history of one ingredient at a time, shown under its row.
  let historial = $state<{ id: string; filas: Variacion[] } | null>(null);

  async function verHistorial(id: string) {
    historial = historial?.id === id ? null : { id, filas: variaciones(await historialDe(db, id)) };
  }

  function porMayor(v: Variacion): string {
    const m = unidadMayor(v.entrada.unidadBase);
    return `${formatPesos(v.entrada.costoPorUnidadBase * m.factor)} / ${m.unidad}`;
  }

  const pct = (n: number) => `${n > 0 ? '+' : ''}${formatNumero(n, 1)} %`;

  const nombresSalvo = (id?: string) => insumos.filter((i) => i.id !== id).map((i) => i.nombre);

  function costo(i: Insumo): string {
    const c = costoPorUnidadBase(i);
    if (!c.ok) return c.error;
    const m = unidadMayor(i.unidadBase);
    return `${formatPesos(c.valor * m.factor)} / ${m.unidad}`;
  }

  async function agregar(datos: Omit<Insumo, 'id' | 'actualizadoEn'>) {
    const i = await guardarInsumo(db, { ...datos, id: newId(), actualizadoEn: '' });
    insumos = [...insumos, i].sort(porNombre);
    mensaje = '';
  }

  async function actualizar(orig: Insumo, datos: Omit<Insumo, 'id' | 'actualizadoEn'>) {
    if (datos.unidadBase !== orig.unidadBase) {
      const usan = await recetasQueUsan(db, orig.id);
      if (
        usan.length &&
        !confirm(
          `"${orig.nombre}" se usa en: ${usan.join(', ')}.\n` +
            `Al cambiar de ${orig.unidadBase} a ${datos.unidadBase}, las líneas con unidades de otra familia van a mostrar error hasta que las corrijas.\n\n¿Continuar?`,
        )
      )
        return;
    }
    const i = await guardarInsumo(db, { ...orig, ...datos });
    insumos = insumos.map((x) => (x.id === i.id ? i : x)).sort(porNombre);
    if (historial?.id === i.id) historial = { id: i.id, filas: variaciones(await historialDe(db, i.id)) };
    terminarEdicion(i.id);
    mensaje = '';
  }

  async function borrar(i: Insumo) {
    if (!confirm(`¿Borrar el insumo "${i.nombre}"?`)) return;
    try {
      await borrarInsumo(db, i.id);
      insumos = insumos.filter((x) => x.id !== i.id);
      if (historial?.id === i.id) historial = null;
      mensaje = '';
    } catch (e) {
      mensaje = e instanceof InsumoEnUso ? `"${i.nombre}": ${e.message}` : String(e);
    }
  }
</script>

<div class="barra">
  <input type="search" data-atajo="buscar" bind:value={busqueda} placeholder="Buscar insumo…" aria-label="Buscar insumo" />
  <span class="muted">{visibles.length} de {insumos.length}</span>
</div>

{#if mensaje}
  <p class="error" role="alert">{mensaje}</p>
{/if}

<table class="tabla">
  <thead>
    <tr>
      <th>Nombre</th>
      <th>Se mide en</th>
      <th class="num">Precio de compra</th>
      <th>Por</th>
      <th class="num">Costo</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <InsumoFila otrosNombres={nombresSalvo()} onguardar={agregar} />
    {#if cargando}
      <tr><td colspan="6" class="muted">Cargando…</td></tr>
    {/if}
    {#each visibles as i (i.id)}
      {#if editando === i.id}
        <InsumoFila
          inicial={i}
          enfocar
          otrosNombres={nombresSalvo(i.id)}
          onguardar={(d) => actualizar(i, d)}
          oncancelar={() => terminarEdicion(i.id)}
        />
      {:else}
        <tr ondblclick={() => (editando = i.id)}>
          <td>{i.nombre}</td>
          <td>{i.unidadBase}</td>
          <td class="num">{formatPesos(i.precioCompra)}</td>
          <td>{formatNumero(i.cantidadCompra)} {i.unidadCompra}</td>
          <td class="num">{costo(i)}</td>
          <td class="acciones">
            <button type="button" class="secundario" aria-expanded={historial?.id === i.id} onclick={() => verHistorial(i.id)}>
              Historial
            </button>
            <button type="button" class="secundario" data-editar={i.id} onclick={() => (editando = i.id)}>Editar</button>
            <button type="button" class="secundario peligro" onclick={() => borrar(i)}>Borrar</button>
          </td>
        </tr>
      {/if}
      {#if historial?.id === i.id}
        <tr class="historial">
          <td colspan="6">
            {#if !historial.filas.length}
              <span class="muted">Sin historial todavía: se registra cada vez que cambia el costo.</span>
            {:else}
              <table class="tabla compacta">
                <thead>
                  <tr><th>Desde</th><th class="num">Costo</th><th class="num">Cambio</th></tr>
                </thead>
                <tbody>
                  {#each historial.filas as v (v.entrada.id)}
                    <tr>
                      <td>{formatFechaHora(v.entrada.fecha)}</td>
                      <td class="num">{porMayor(v)}</td>
                      <td class="num" class:sube={v.pct !== undefined && v.pct > 0}>{v.pct === undefined ? '' : pct(v.pct)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>
