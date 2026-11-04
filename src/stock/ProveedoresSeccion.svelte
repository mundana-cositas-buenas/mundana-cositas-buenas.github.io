<script lang="ts">
  import type { DB } from '../lib/db';
  import ProveedorDetalle from './ProveedorDetalle.svelte';
  import ProveedoresView from './ProveedoresView.svelte';

  let { db, ruta }: { db: DB; ruta: string[] } = $props();
</script>

<div class="titulo">
  <h1>Proveedores</h1>
</div>

{#if ruta[0]}
  {#key ruta[0]}
    <ProveedorDetalle {db} id={ruta[0]} />
  {/key}
{:else}
  <ProveedoresView {db} />
{/if}
