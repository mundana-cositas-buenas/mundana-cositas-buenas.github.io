<script lang="ts">
  import { tick } from 'svelte';
  import { describirErrores, type Errores } from '../lib/campos';
  import { formatNumero } from '../lib/money';
  import type { Producto } from './types';
  import { ETIQUETAS_PRODUCTO, productoFormDesde, productoVacio, validarProducto, type DatosProducto, type ProductoForm } from './validar';

  let {
    inicial,
    stock,
    otrosNombres,
    onguardar,
    oncancelar,
    enfocar = false,
  }: {
    inicial?: Producto;
    stock?: number;
    otrosNombres: string[];
    onguardar: (datos: DatosProducto) => Promise<void>;
    oncancelar?: () => void;
    enfocar?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally
  let form = $state<ProductoForm>(inicial ? productoFormDesde(inicial) : productoVacio());
  let guardando = $state(false);
  let nombreInput: HTMLInputElement | undefined = $state();
  let fila: HTMLTableRowElement | undefined = $state();

  // Errors show after the first save attempt, then follow the typing.
  let intentado = $state(false);
  let errorGeneral = $state('');
  const validado = $derived(validarProducto(form, otrosNombres));
  const errores: Errores<ProductoForm> = $derived({
    ...(intentado && !validado.ok ? validado.errores : {}),
    ...(errorGeneral ? { general: errorGeneral } : {}),
  });

  $effect(() => {
    if (enfocar) nombreInput?.focus();
  });

  async function guardar() {
    if (guardando) return;
    errorGeneral = '';
    const v = validado;
    if (!v.ok) {
      intentado = true;
      await tick();
      fila?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    guardando = true;
    try {
      await onguardar(v.datos);
      if (!inicial) {
        form = productoVacio();
        intentado = false;
        nombreInput?.focus();
      }
    } catch (e) {
      errorGeneral = e instanceof Error ? e.message : String(e);
    } finally {
      guardando = false;
    }
  }

  function teclas(ev: KeyboardEvent) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      guardar();
    } else if (ev.key === 'Escape' && oncancelar) {
      ev.preventDefault();
      oncancelar();
    }
  }
</script>

<tr class="editando" bind:this={fila} onkeydown={teclas}>
  <td>
    <input
      bind:this={nombreInput}
      bind:value={form.nombre}
      data-atajo={inicial ? undefined : 'nuevo'}
      placeholder={inicial ? '' : 'Nuevo producto…'}
      aria-label="Nombre"
      aria-invalid={!!errores.nombre}
      title={errores.nombre}
    />
  </td>
  <td><input class="corto" bind:value={form.unidad} placeholder="u" aria-label="Unidad" /></td>
  <td class="num muted">{stock === undefined ? '' : formatNumero(stock)}</td>
  <td class="num">
    <input
      class="num corto"
      inputmode="decimal"
      bind:value={form.stockMinimo}
      placeholder="0"
      aria-label="Stock mínimo"
      aria-invalid={!!errores.stockMinimo}
      title={errores.stockMinimo}
    />
  </td>
  <td class="num">
    <input
      class="num"
      inputmode="decimal"
      bind:value={form.precioVenta}
      placeholder="$ (opcional)"
      aria-label="Precio de venta"
      aria-invalid={!!errores.precioVenta}
      title={errores.precioVenta}
    />
  </td>
  <td><input type="checkbox" bind:checked={form.activo} aria-label="Activo" /></td>
  <td class="acciones">
    <button type="button" onclick={guardar} disabled={guardando}>{inicial ? 'Guardar' : 'Agregar'}</button>
    {#if oncancelar}
      <button type="button" class="secundario" onclick={oncancelar}>Cancelar</button>
    {/if}
  </td>
</tr>
{#if Object.keys(errores).length}
  <tr class="errores">
    <td colspan="7">{describirErrores(errores, ETIQUETAS_PRODUCTO)}</td>
  </tr>
{/if}
