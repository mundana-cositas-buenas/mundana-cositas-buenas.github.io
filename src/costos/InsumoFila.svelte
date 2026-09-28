<script lang="ts">
  import { numeroEditable, type Errores } from '../lib/campos';
  import { formatPesos, pesosEditable } from '../lib/money';
  import { baseDe, UNIDADES_BASE, unidadesDe, unidadMayor, type UnidadBase } from '../lib/units';
  import { costoPorUnidadBase } from './calc';
  import type { Insumo } from './types';
  import { validarInsumo, type InsumoForm } from './validar';

  let {
    inicial,
    otrosNombres,
    onguardar,
    oncancelar,
    enfocar = false,
  }: {
    inicial?: Insumo;
    otrosNombres: string[];
    onguardar: (datos: Omit<Insumo, 'id' | 'actualizadoEn'>) => Promise<void>;
    oncancelar?: () => void;
    enfocar?: boolean;
  } = $props();

  const vacio = (): InsumoForm => ({ nombre: '', unidadBase: 'g', precio: '', cantidad: '1', unidadCompra: 'kg' });

  function desde(i: Insumo | undefined): InsumoForm {
    if (!i) return vacio();
    return {
      nombre: i.nombre,
      unidadBase: i.unidadBase,
      precio: pesosEditable(i.precioCompra),
      cantidad: numeroEditable(i.cantidadCompra),
      unidadCompra: i.unidadCompra,
    };
  }

  // svelte-ignore state_referenced_locally
  let form = $state(desde(inicial));
  let errores = $state<Errores<InsumoForm>>({});
  let guardando = $state(false);
  let nombreInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (enfocar) nombreInput?.focus();
  });

  const vista = $derived.by(() => {
    const v = validarInsumo(form, otrosNombres);
    if (!v.ok) return '';
    const c = costoPorUnidadBase(v.datos);
    if (!c.ok) return '';
    const m = unidadMayor(v.datos.unidadBase);
    return `${formatPesos(c.valor * m.factor)} / ${m.unidad}`;
  });

  function cambiarBase(b: UnidadBase) {
    form.unidadBase = b;
    if (baseDe(form.unidadCompra) !== b) form.unidadCompra = unidadMayor(b).unidad;
  }

  async function guardar() {
    if (guardando) return;
    const v = validarInsumo(form, otrosNombres);
    if (!v.ok) {
      errores = v.errores;
      return;
    }
    errores = {};
    guardando = true;
    try {
      await onguardar(v.datos);
      if (!inicial) {
        form = vacio();
        nombreInput?.focus();
      }
    } catch (e) {
      errores = { general: e instanceof Error ? e.message : String(e) };
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

<tr class="editando" onkeydown={teclas}>
  <td>
    <input
      bind:this={nombreInput}
      bind:value={form.nombre}
      placeholder={inicial ? '' : 'Nuevo insumo…'}
      aria-label="Nombre"
      aria-invalid={!!errores.nombre}
      title={errores.nombre}
    />
  </td>
  <td>
    <select value={form.unidadBase} onchange={(e) => cambiarBase(e.currentTarget.value as UnidadBase)} aria-label="Se mide en">
      {#each UNIDADES_BASE as b (b)}
        <option value={b}>{b === 'g' ? 'peso (g)' : b === 'ml' ? 'volumen (ml)' : 'unidades (u)'}</option>
      {/each}
    </select>
  </td>
  <td class="num">
    <input
      class="num"
      inputmode="decimal"
      bind:value={form.precio}
      placeholder="$"
      aria-label="Precio de compra"
      aria-invalid={!!errores.precio}
      title={errores.precio}
    />
  </td>
  <td class="compra">
    <input
      class="num corto"
      inputmode="decimal"
      bind:value={form.cantidad}
      aria-label="Cantidad comprada"
      aria-invalid={!!errores.cantidad}
      title={errores.cantidad}
    />
    <select bind:value={form.unidadCompra} aria-label="Unidad de compra" aria-invalid={!!errores.unidadCompra}>
      {#each unidadesDe(form.unidadBase) as u (u)}
        <option value={u}>{u}</option>
      {/each}
    </select>
  </td>
  <td class="num muted">{vista}</td>
  <td class="acciones">
    <button type="button" onclick={guardar} disabled={guardando}>{inicial ? 'Guardar' : 'Agregar'}</button>
    {#if oncancelar}
      <button type="button" class="secundario" onclick={oncancelar}>Cancelar</button>
    {/if}
  </td>
</tr>
{#if Object.keys(errores).length}
  <tr class="errores">
    <td colspan="6">{Object.values(errores).join(' · ')}</td>
  </tr>
{/if}
