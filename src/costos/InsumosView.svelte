<script lang="ts">
  import { porNombre } from '../lib/campos';
  import { newId, type DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { coincide } from '../lib/texto';
  import { unidadMayor } from '../lib/units';
  import { costoPorUnidadBase } from './calc';
  import InsumoFila from './InsumoFila.svelte';
  import { borrarInsumo, guardarInsumo, InsumoEnUso, listarInsumos, recetasQueUsan } from './repo';
  import type { Insumo } from './types';

  let { db }: { db: DB } = $props();

  let insumos = $state<Insumo[]>([]);
  let cargando = $state(true);
  let busqueda = $state('');
  let editando = $state<string | null>(null);
  let mensaje = $state('');

  const visibles = $derived(insumos.filter((i) => coincide(i.nombre, busqueda)));

  async function cargar() {
    insumos = await listarInsumos(db);
    cargando = false;
  }
  cargar();

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
    editando = null;
    mensaje = '';
  }

  async function borrar(i: Insumo) {
    if (!confirm(`¿Borrar el insumo "${i.nombre}"?`)) return;
    try {
      await borrarInsumo(db, i.id);
      insumos = insumos.filter((x) => x.id !== i.id);
      mensaje = '';
    } catch (e) {
      mensaje = e instanceof InsumoEnUso ? `"${i.nombre}": ${e.message}` : String(e);
    }
  }
</script>

<div class="barra">
  <input type="search" bind:value={busqueda} placeholder="Buscar insumo…" aria-label="Buscar insumo" />
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
          oncancelar={() => (editando = null)}
        />
      {:else}
        <tr ondblclick={() => (editando = i.id)}>
          <td>{i.nombre}</td>
          <td>{i.unidadBase}</td>
          <td class="num">{formatPesos(i.precioCompra)}</td>
          <td>{formatNumero(i.cantidadCompra)} {i.unidadCompra}</td>
          <td class="num">{costo(i)}</td>
          <td class="acciones">
            <button type="button" class="secundario" onclick={() => (editando = i.id)}>Editar</button>
            <button type="button" class="secundario peligro" onclick={() => borrar(i)}>Borrar</button>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>
