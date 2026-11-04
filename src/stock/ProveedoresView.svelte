<script lang="ts">
  import type { DB } from '../lib/db';
  import { formatPesos } from '../lib/money';
  import { coincide, formatFecha } from '../lib/texto';
  import { conAviso, describirVencimiento, estadoCuenta, type Asiento, type EstadoCuenta } from './proveedores';
  import { borrarProveedor, cuentas, listarProductos, listarProveedores, ProveedorEnUso } from './repo';
  import type { Proveedor } from './types';

  let { db }: { db: DB } = $props();

  let proveedores = $state<Proveedor[]>([]);
  let porProveedor = $state(new Map<string, Asiento[]>());
  let productosDe = $state(new Map<string, number>());
  let cargando = $state(true);
  let busqueda = $state('');
  let verInactivos = $state(false);
  let mensaje = $state('');

  const ahora = new Date();
  const estados = $derived(new Map(proveedores.map((p) => [p.id, estadoCuenta(porProveedor.get(p.id) ?? [], p.plazoDias, ahora)])));
  // Inactive suppliers still show while they have payments due.
  const visibles = $derived(
    proveedores.filter((p) => (verInactivos || p.activo || conAviso(estados.get(p.id)!)) && coincide(p.nombre, busqueda)),
  );
  const inactivos = $derived(proveedores.filter((p) => !p.activo).length);
  const total = $derived([...estados.values()].reduce((s, e) => s + e.saldo, 0));

  async function cargar() {
    const [ps, cs, productos] = await Promise.all([listarProveedores(db), cuentas(db), listarProductos(db)]);
    const n = new Map<string, number>();
    for (const p of productos) if (p.proveedorId) n.set(p.proveedorId, (n.get(p.proveedorId) ?? 0) + 1);
    [proveedores, porProveedor, productosDe] = [ps, cs, n];
    cargando = false;
  }
  cargar();

  function claseDe(e: EstadoCuenta): string {
    return e.vencido ? 'agotado' : e.porVencer ? 'bajo' : '';
  }

  function vencimientoDe(e: EstadoCuenta): string {
    const p = e.proximo;
    if (!p) return '';
    return `${formatFecha(p.vence.toISOString())} (${describirVencimiento(p.dias)})`;
  }

  async function borrar(p: Proveedor) {
    if ((productosDe.get(p.id) ?? 0) > 0 || (porProveedor.get(p.id) ?? []).length) {
      mensaje = new ProveedorEnUso().message;
      return;
    }
    if (!confirm(`¿Borrar el proveedor "${p.nombre}"?`)) return;
    try {
      await borrarProveedor(db, p.id);
      proveedores = proveedores.filter((x) => x.id !== p.id);
      mensaje = '';
    } catch (e) {
      mensaje = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<div class="barra">
  <button type="button" data-atajo="nuevo" onclick={() => (location.hash = '#/proveedores/nuevo')}>Nuevo proveedor</button>
  <input type="search" data-atajo="buscar" bind:value={busqueda} placeholder="Buscar proveedor…" aria-label="Buscar proveedor" />
  <label><input type="checkbox" bind:checked={verInactivos} /> Ver inactivos ({inactivos})</label>
  <span class="muted">{visibles.length} de {proveedores.length}</span>
  {#if proveedores.length}
    <span>Total adeudado: <strong>{formatPesos(total)}</strong></span>
  {/if}
</div>

{#if mensaje}
  <p class="error" role="alert">{mensaje}</p>
{/if}

{#if cargando}
  <p class="muted">Cargando…</p>
{:else if !proveedores.length}
  <p class="muted">Todavía no hay proveedores. Cada producto del stock tiene que tener uno.</p>
{:else}
  <table class="tabla">
    <thead>
      <tr>
        <th>Nombre</th>
        <th class="num">Saldo</th>
        <th class="num">Vencido</th>
        <th class="num">Vence pronto</th>
        <th>Próximo vencimiento</th>
        <th class="num">Plazo</th>
        <th class="num">Productos</th>
        <th>Activo</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each visibles as p (p.id)}
        {@const e = estados.get(p.id)!}
        <tr class={claseDe(e)} class:inactivo={!p.activo}>
          <td><a href="#/proveedores/{p.id}">{p.nombre}</a></td>
          <td class="num fuerte">{formatPesos(e.saldo)}</td>
          <td class="num">{e.vencido ? formatPesos(e.vencido) : ''}</td>
          <td class="num">{e.porVencer ? formatPesos(e.porVencer) : ''}</td>
          <td>{vencimientoDe(e)}</td>
          <td class="num">{p.plazoDias} {p.plazoDias === 1 ? 'día' : 'días'}</td>
          <td class="num">{productosDe.get(p.id) ?? 0}</td>
          <td>{p.activo ? 'sí' : 'no'}</td>
          <td class="acciones">
            <button type="button" class="secundario" onclick={() => (location.hash = `#/proveedores/${p.id}`)}>Ver cuenta</button>
            <button type="button" class="secundario peligro" onclick={() => borrar(p)}>Borrar</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
