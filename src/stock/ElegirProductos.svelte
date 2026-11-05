<script lang="ts">
  import { formatNumero, formatPesos, type Centavos } from '../lib/money';
  import type { Categoria, Producto, Promo } from './types';
  import { gruposParaElegir, type GrupoParaElegir, type LineaEnCurso, type PromoEnCurso } from './ventas';

  // Pick sale items by mouse: a button per category opens a dialog with a button per product;
  // each click adds one unit and the dialog stays open. The text picker stays for the keyboard.
  let {
    productos,
    categorias,
    promos,
    lineas,
    promosEnVenta,
    total,
    onproducto,
    onpromo,
  }: {
    productos: Producto[];
    categorias: Categoria[];
    promos: Promo[];
    lineas: readonly LineaEnCurso[];
    promosEnVenta: readonly PromoEnCurso[];
    total: Centavos;
    onproducto: (p: Producto) => void;
    onpromo: (p: Promo) => void;
  } = $props();

  let dialogo: HTMLDialogElement | undefined = $state();
  let clave = $state('');

  const grupos = $derived(gruposParaElegir(productos, categorias, promos));
  const abierto = $derived<GrupoParaElegir | undefined>(grupos.find((g) => g.clave === clave));
  const enVenta = $derived(
    new Map<string, number>([
      ...lineas.map((l) => [`producto-${l.producto.id}`, l.cantidad] as const),
      ...promosEnVenta.map((l) => [`promo-${l.promo.id}`, l.cantidad] as const),
    ]),
  );

  function abrir(g: GrupoParaElegir) {
    clave = g.clave;
    dialogo?.showModal();
  }
</script>

{#if grupos.length}
  <div class="elegir" role="group" aria-label="Elegir por categoría">
    {#each grupos as g (g.clave)}
      <button type="button" class="secundario" onclick={() => abrir(g)}>{g.nombre}</button>
    {/each}
  </div>
{/if}

<!-- A click on the backdrop (the dialog itself, outside its content) closes it, like Escape. -->
<dialog
  bind:this={dialogo}
  class="elegir"
  aria-label={abierto?.nombre}
  onclick={(e) => {
    if (e.target === dialogo) dialogo.close();
  }}
>
  <div class="contenido">
    <h2>{abierto?.nombre}</h2>
    <div class="items">
      {#each abierto?.items ?? [] as i (i.tipo === 'producto' ? `producto-${i.producto.id}` : `promo-${i.promo.id}`)}
        {@const id = i.tipo === 'producto' ? `producto-${i.producto.id}` : `promo-${i.promo.id}`}
        {@const nombre = i.tipo === 'producto' ? i.producto.nombre : i.promo.nombre}
        {@const cantidad = enVenta.get(id)}
        <button
          type="button"
          class="secundario item"
          class:elegido={cantidad !== undefined}
          disabled={!!i.problema}
          title={i.problema}
          onclick={() => (i.tipo === 'producto' ? onproducto(i.producto) : onpromo(i.promo))}
        >
          {nombre}
          {#if cantidad !== undefined}<strong class="cantidad">×{formatNumero(cantidad)}</strong>{/if}
          {#if i.problema}<span class="muted problema">{i.problema}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="pie">
      <strong>Total {formatPesos(total)}</strong>
      <button type="button" onclick={() => dialogo?.close()}>Listo</button>
    </div>
  </div>
</dialog>
