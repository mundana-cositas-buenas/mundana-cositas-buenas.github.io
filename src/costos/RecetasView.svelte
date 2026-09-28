<script lang="ts">
  import type { DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { coincide } from '../lib/texto';
  import { costoReceta, porId, type CostoReceta } from './calc';
  import { borrarReceta, duplicarReceta, guardarReceta, lineasPorReceta, listarInsumos, listarRecetas, nuevaReceta } from './repo';
  import type { Receta } from './types';

  let { db }: { db: DB } = $props();

  let filas = $state<{ receta: Receta; costo: CostoReceta }[]>([]);
  let cargando = $state(true);
  let busqueda = $state('');
  let mensaje = $state('');

  const visibles = $derived(filas.filter((f) => coincide(f.receta.nombre, busqueda)));

  async function cargar() {
    const [recetas, lineas, insumos] = await Promise.all([listarRecetas(db), lineasPorReceta(db), listarInsumos(db)]);
    const porInsumo = porId(insumos);
    filas = recetas.map((receta) => ({ receta, costo: costoReceta(receta, lineas.get(receta.id) ?? [], porInsumo) }));
    cargando = false;
  }
  cargar();

  const abrir = (id: string) => (location.hash = `#/costos/receta/${id}`);

  async function crear() {
    abrir((await guardarReceta(db, nuevaReceta())).id);
  }

  async function duplicar(r: Receta) {
    abrir((await duplicarReceta(db, r.id)).id);
  }

  async function borrar(r: Receta) {
    if (!confirm(`¿Borrar la receta "${r.nombre}" con todas sus líneas?`)) return;
    try {
      await borrarReceta(db, r.id);
      filas = filas.filter((f) => f.receta.id !== r.id);
    } catch (e) {
      mensaje = String(e);
    }
  }
</script>

<div class="barra">
  <button type="button" onclick={crear}>Nueva receta</button>
  <input type="search" bind:value={busqueda} placeholder="Buscar receta…" aria-label="Buscar receta" />
  <span class="muted">{visibles.length} de {filas.length}</span>
</div>

{#if mensaje}
  <p class="error" role="alert">{mensaje}</p>
{/if}

<table class="tabla">
  <thead>
    <tr>
      <th>Receta</th>
      <th class="num">Rinde</th>
      <th class="num">Costo total</th>
      <th class="num">Costo por unidad</th>
      <th class="num">Margen</th>
      <th class="num">Precio sugerido</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {#if cargando}
      <tr><td colspan="7" class="muted">Cargando…</td></tr>
    {:else if !filas.length}
      <tr><td colspan="7" class="muted">Todavía no hay recetas. Cargá primero los insumos y después creá una receta.</td></tr>
    {/if}
    {#each visibles as { receta: r, costo: c } (r.id)}
      <tr>
        <td>
          <a href="#/costos/receta/{r.id}">{r.nombre}</a>
          {#if c.errores}
            <span class="error" title="Hay líneas con error que no se suman al costo">⚠ {c.errores} con error</span>
          {/if}
        </td>
        <td class="num">{formatNumero(r.rendimiento)} {r.unidadRendimiento}</td>
        <td class="num">{formatPesos(c.costoTotal)}</td>
        <td class="num">{formatPesos(c.costoPorUnidad)}</td>
        <td class="num">{formatNumero(r.margen)} %</td>
        <td class="num fuerte">{formatPesos(c.precioSugerido)}</td>
        <td class="acciones">
          <button type="button" class="secundario" onclick={() => duplicar(r)}>Duplicar</button>
          <button type="button" class="secundario peligro" onclick={() => borrar(r)}>Borrar</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
