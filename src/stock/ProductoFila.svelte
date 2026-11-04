<script lang="ts">
  import { tick } from 'svelte';
  import { describirErrores, type Errores } from '../lib/campos';
  import { formatNumero } from '../lib/money';
  import type { Categoria, Producto, Proveedor } from './types';
  import { avisosProducto, ETIQUETAS_PRODUCTO, productoFormDesde, productoVacio, validarProducto, type DatosProducto, type ProductoForm } from './validar';

  let {
    inicial,
    stock,
    otrosNombres,
    proveedores,
    categorias,
    onguardar,
    oncancelar,
    enfocar = false,
  }: {
    inicial?: Producto;
    stock?: number;
    otrosNombres: string[];
    proveedores: Proveedor[];
    categorias: Categoria[];
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
  // Active suppliers, plus the product's own one if it was deactivated.
  const elegibles = $derived(proveedores.filter((p) => p.activo || p.id === inicial?.proveedorId));
  // Warnings don't block saving, so they show right away.
  const avisos = $derived(validado.ok ? avisosProducto(validado.datos) : {});

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
        // Keep the category: products are often entered several of the same kind in a row.
        form = { ...productoVacio(), categoriaId: form.categoriaId };
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
  <td class="apilado">
    <input
      bind:this={nombreInput}
      bind:value={form.nombre}
      data-atajo={inicial ? undefined : 'nuevo'}
      placeholder={inicial ? '' : 'Nuevo producto…'}
      aria-label="Nombre"
      aria-invalid={!!errores.nombre}
      title={errores.nombre}
    />
    <select bind:value={form.categoriaId} aria-label="Categoría" aria-invalid={!!errores.categoriaId} title={errores.categoriaId}>
      <option value="">{categorias.length ? 'Categoría…' : 'Sin categorías'}</option>
      {#each categorias as c (c.id)}
        <option value={c.id}>{c.nombre}</option>
      {/each}
    </select>
  </td>
  <td>
    <select bind:value={form.proveedorId} aria-label="Proveedor" aria-invalid={!!errores.proveedorId} title={errores.proveedorId}>
      <option value="">{elegibles.length ? 'Proveedor…' : 'Sin proveedores'}</option>
      {#each elegibles as p (p.id)}
        <option value={p.id}>{p.nombre}{p.activo ? '' : ' (inactivo)'}</option>
      {/each}
    </select>
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
      bind:value={form.costo}
      placeholder="$ (opcional)"
      aria-label="Costo"
      aria-invalid={!!errores.costo}
      title={errores.costo ?? avisos.costo}
    />
  </td>
  <td class="num">
    <input
      class="num"
      inputmode="decimal"
      bind:value={form.precioVenta}
      placeholder="$"
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
    <td colspan="9">{describirErrores(errores, ETIQUETAS_PRODUCTO)}</td>
  </tr>
{:else if Object.keys(avisos).length}
  <tr class="avisos">
    <td colspan="9">{describirErrores(avisos, ETIQUETAS_PRODUCTO)}</td>
  </tr>
{/if}
