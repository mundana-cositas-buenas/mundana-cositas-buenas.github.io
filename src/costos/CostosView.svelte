<script lang="ts">
  import type { DB } from '../lib/db';
  import InsumosView from './InsumosView.svelte';
  import RecetaDetalle from './RecetaDetalle.svelte';
  import RecetasView from './RecetasView.svelte';

  let { db, ruta }: { db: DB; ruta: string[] } = $props();

  const vista = $derived(ruta[0] === 'insumos' ? 'insumos' : ruta[0] === 'receta' && ruta[1] ? 'receta' : 'recetas');
</script>

<div class="titulo">
  <h1>Costos de recetas</h1>
  <nav class="sub" aria-label="Costos">
    <a href="#/costos" aria-current={vista !== 'insumos' ? 'page' : undefined}>Recetas</a>
    <a href="#/costos/insumos" aria-current={vista === 'insumos' ? 'page' : undefined}>Insumos</a>
  </nav>
</div>

{#if vista === 'insumos'}
  <InsumosView {db} />
{:else if vista === 'receta'}
  <RecetaDetalle {db} id={ruta[1]} />
{:else}
  <RecetasView {db} />
{/if}
