<script lang="ts">
  import { tick } from 'svelte';
  import { porNombre } from '../lib/campos';
  import { newId, type DB } from '../lib/db';
  import { borrarCategoria, CategoriaEnUso, guardarCategoria, listarCategorias, listarProductos, productosEnCategoria } from './repo';
  import type { Categoria, Producto } from './types';
  import { validarCategoria } from './validar';

  let { db }: { db: DB } = $props();

  let categorias = $state<Categoria[]>([]);
  let productos = $state<Producto[]>([]);
  let cargando = $state(true);
  let mensaje = $state('');

  let nuevo = $state('');
  let errorNuevo = $state('');
  let nuevoInput: HTMLInputElement | undefined = $state();

  let editando = $state<string | null>(null);
  let nombreEditado = $state('');
  let errorEditado = $state('');

  const cuantos = $derived(
    productos.reduce((m, p) => (p.categoriaId ? m.set(p.categoriaId, (m.get(p.categoriaId) ?? 0) + 1) : m), new Map<string, number>()),
  );
  const nombresSalvo = (id?: string) => categorias.filter((c) => c.id !== id).map((c) => c.nombre);

  async function cargar() {
    [categorias, productos] = await Promise.all([listarCategorias(db), listarProductos(db)]);
    cargando = false;
  }
  cargar();

  async function agregar() {
    const v = validarCategoria({ nombre: nuevo }, nombresSalvo());
    if (!v.ok) {
      errorNuevo = v.errores.nombre ?? '';
      nuevoInput?.focus();
      return;
    }
    try {
      const c = await guardarCategoria(db, { ...v.datos, id: newId(), actualizadoEn: '' });
      categorias = [...categorias, c].sort(porNombre);
      nuevo = '';
      errorNuevo = '';
      mensaje = '';
    } catch (e) {
      errorNuevo = e instanceof Error ? e.message : String(e);
    }
    nuevoInput?.focus();
  }

  function editar(c: Categoria) {
    editando = c.id;
    nombreEditado = c.nombre;
    errorEditado = '';
  }

  /** Leaves edit mode, putting the keyboard focus back on the row's Edit button. */
  async function terminarEdicion(id: string) {
    editando = null;
    await tick();
    document.querySelector<HTMLElement>(`[data-editar="${id}"]`)?.focus();
  }

  async function guardar(c: Categoria) {
    const v = validarCategoria({ nombre: nombreEditado }, nombresSalvo(c.id));
    if (!v.ok) {
      errorEditado = v.errores.nombre ?? '';
      return;
    }
    try {
      const r = await guardarCategoria(db, { ...c, ...v.datos });
      categorias = categorias.map((x) => (x.id === r.id ? r : x)).sort(porNombre);
      mensaje = '';
      terminarEdicion(r.id);
    } catch (e) {
      errorEditado = e instanceof Error ? e.message : String(e);
    }
  }

  async function borrar(c: Categoria) {
    const n = await productosEnCategoria(db, c.id);
    if (n) {
      mensaje = new CategoriaEnUso(n).message;
      return;
    }
    if (!confirm(`¿Borrar la categoría "${c.nombre}"?`)) return;
    try {
      await borrarCategoria(db, c.id);
      categorias = categorias.filter((x) => x.id !== c.id);
      mensaje = '';
    } catch (e) {
      mensaje = e instanceof Error ? e.message : String(e);
    }
  }

  function teclasEdicion(ev: KeyboardEvent, c: Categoria) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      guardar(c);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      terminarEdicion(c.id);
    }
  }
</script>

{#if mensaje}
  <p class="error" role="alert">{mensaje}</p>
{/if}

<table class="tabla compacta">
  <thead>
    <tr>
      <th>Nombre</th>
      <th class="num">Productos</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr class="editando">
      <td>
        <input
          bind:this={nuevoInput}
          bind:value={nuevo}
          data-atajo="nuevo"
          placeholder="Nueva categoría…"
          aria-label="Nueva categoría"
          aria-invalid={!!errorNuevo}
          title={errorNuevo}
          onkeydown={(ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              agregar();
            }
          }}
        />
      </td>
      <td></td>
      <td class="acciones"><button type="button" onclick={agregar}>Agregar</button></td>
    </tr>
    {#if errorNuevo}
      <tr class="errores"><td colspan="3">Nombre: {errorNuevo}</td></tr>
    {/if}
    {#if cargando}
      <tr><td colspan="3" class="muted">Cargando…</td></tr>
    {:else if !categorias.length}
      <tr><td colspan="3" class="muted">Todavía no hay categorías. Cada producto necesita una.</td></tr>
    {/if}
    {#each categorias as c (c.id)}
      {#if editando === c.id}
        <tr class="editando">
          <td>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              bind:value={nombreEditado}
              autofocus
              aria-label="Nombre"
              aria-invalid={!!errorEditado}
              title={errorEditado}
              onkeydown={(ev) => teclasEdicion(ev, c)}
            />
          </td>
          <td class="num">{cuantos.get(c.id) ?? 0}</td>
          <td class="acciones">
            <button type="button" onclick={() => guardar(c)}>Guardar</button>
            <button type="button" class="secundario" onclick={() => terminarEdicion(c.id)}>Cancelar</button>
          </td>
        </tr>
        {#if errorEditado}
          <tr class="errores"><td colspan="3">Nombre: {errorEditado}</td></tr>
        {/if}
      {:else}
        <tr ondblclick={() => editar(c)}>
          <td>{c.nombre}</td>
          <td class="num">{cuantos.get(c.id) ?? 0}</td>
          <td class="acciones">
            <button type="button" class="secundario" data-editar={c.id} onclick={() => editar(c)}>Editar</button>
            <button type="button" class="secundario peligro" onclick={() => borrar(c)}>Borrar</button>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>
