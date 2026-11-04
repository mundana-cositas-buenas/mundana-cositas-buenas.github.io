<script lang="ts">
  import { tick } from 'svelte';
  import { describirErrores } from '../lib/campos';
  import { newId, type DB } from '../lib/db';
  import { formatNumero, formatPesos } from '../lib/money';
  import { formatFecha, formatFechaHora } from '../lib/texto';
  import {
    cuentaCorriente,
    describirVencimiento,
    DIAS_AVISO,
    efectoAsiento,
    estadoCuenta,
    MEDIOS_PAGO,
    PLAZO_DEFAULT,
    pendientes,
    tituloMedio,
    TIPOS_OPERACION,
    type Asiento,
  } from './proveedores';
  import {
    anularMovimiento,
    anularOperacion,
    borrarMovimiento,
    borrarOperacion,
    cuentaDe,
    guardarProveedor,
    listarProductos,
    listarProveedores,
    obtenerProveedor,
    registrarOperacion,
  } from './repo';
  import type { Producto, Proveedor } from './types';
  import {
    ETIQUETAS_OPERACION,
    ETIQUETAS_PROVEEDOR,
    proveedorFormDesde,
    proveedorVacio,
    validarOperacion,
    validarProveedor,
    type OperacionForm,
    type ProveedorForm,
  } from './validar';

  // `id` is 'nuevo' for a supplier not saved yet.
  let { db, id }: { db: DB; id: string } = $props();

  let estado = $state<'cargando' | 'ok' | 'no-existe'>('cargando');
  let proveedor = $state<Proveedor | undefined>();
  let form = $state<ProveedorForm>(proveedorVacio());
  let otrosNombres = $state<string[]>([]);
  let productos = $state<Producto[]>([]);
  let lineas = $state<Asiento[]>([]);
  let intentado = $state(false);
  let guardando = $state(false);
  let mensaje = $state('');
  let error = $state('');
  let nombreInput: HTMLInputElement | undefined = $state();

  const ahora = new Date();
  const v = $derived(validarProveedor(form, otrosNombres));
  const erroresDatos = $derived(intentado && !v.ok ? describirErrores(v.errores, ETIQUETAS_PROVEEDOR) : '');
  const porId = $derived(new Map(productos.map((p) => [p.id, p])));
  const suyos = $derived(proveedor ? productos.filter((p) => p.proveedorId === proveedor!.id) : []);
  const cuenta = $derived(estadoCuenta(lineas, proveedor?.plazoDias ?? PLAZO_DEFAULT, ahora));
  const pendienteDe = $derived(new Map(pendientes(lineas, proveedor?.plazoDias ?? PLAZO_DEFAULT, ahora).map((p) => [p.asiento.id, p])));
  const filas = $derived(cuentaCorriente(lineas));

  async function cargar() {
    const [p, todos, ps] = await Promise.all([id === 'nuevo' ? undefined : obtenerProveedor(db, id), listarProveedores(db), listarProductos(db)]);
    otrosNombres = todos.filter((x) => x.id !== p?.id).map((x) => x.nombre);
    productos = ps;
    if (id !== 'nuevo' && !p) {
      estado = 'no-existe';
      return;
    }
    proveedor = p;
    form = p ? proveedorFormDesde(p) : proveedorVacio();
    lineas = p ? await cuentaDe(db, p.id) : [];
    estado = 'ok';
    if (!p) {
      await tick();
      nombreInput?.focus();
    }
  }
  cargar();

  async function guardar(ev?: SubmitEvent) {
    ev?.preventDefault();
    if (guardando) return;
    intentado = true;
    mensaje = '';
    if (!v.ok) {
      if (v.errores.nombre) nombreInput?.focus();
      return;
    }
    guardando = true;
    try {
      const r = await guardarProveedor(db, { ...v.datos, id: proveedor?.id ?? newId(), actualizadoEn: proveedor?.actualizadoEn ?? '' });
      if (!proveedor) {
        location.hash = `#/proveedores/${r.id}`;
        return;
      }
      proveedor = r;
      form = proveedorFormDesde(r);
      intentado = false;
      mensaje = 'Datos guardados.';
    } catch (e) {
      error = `No se pudo guardar: ${e instanceof Error ? e.message : e}`;
    } finally {
      guardando = false;
    }
  }

  // --- Account entries ---

  const operacionVacia = (): OperacionForm => ({ tipo: 'pago', importe: '', medioPago: 'efectivo', nota: '' });
  let op = $state<OperacionForm>(operacionVacia());
  let opIntentada = $state(false);
  let registrando = $state(false);
  let importeInput: HTMLInputElement | undefined = $state();
  const vop = $derived(validarOperacion(op));
  const erroresOp = $derived(opIntentada && !vop.ok ? describirErrores(vop.errores, ETIQUETAS_OPERACION) : '');

  async function registrar(ev: SubmitEvent) {
    ev.preventDefault();
    if (!proveedor || registrando) return;
    opIntentada = true;
    if (!vop.ok) {
      importeInput?.focus();
      return;
    }
    registrando = true;
    try {
      await registrarOperacion(db, proveedor.id, vop.datos);
      lineas = await cuentaDe(db, proveedor.id);
      op = { ...operacionVacia(), tipo: op.tipo, medioPago: op.medioPago };
      opIntentada = false;
      error = '';
      importeInput?.focus();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      registrando = false;
    }
  }

  const tituloDe = (a: Asiento) => (a.tipo === 'entrada' ? 'Entrada de stock' : (TIPOS_OPERACION.find((t) => t.id === a.tipo)?.titulo ?? a.tipo));
  // A voided line shows the amount it had, struck through.
  const importeDe = (a: Asiento) => efectoAsiento({ ...a, anulado: false } as Asiento);
  const conSigno = (c: number) => (c > 0 ? `+${formatPesos(c)}` : formatPesos(c));

  function describir(a: Asiento): string {
    return `${tituloDe(a).toLowerCase()} de ${formatPesos(Math.abs(importeDe(a)))} del ${formatFechaHora(a.fecha)}`;
  }

  async function anular(a: Asiento) {
    const extra = a.tipo === 'entrada' ? '\nEs una entrada de stock: también deja de contar para el stock del producto.' : '';
    if (!confirm(`¿Anular ${describir(a)}?\nQueda en la cuenta, pero deja de contar para el saldo.${extra}`)) return;
    try {
      if (a.tipo === 'entrada') await anularMovimiento(db, a.id);
      else await anularOperacion(db, a.id);
      lineas = await cuentaDe(db, proveedor!.id);
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function borrar(a: Asiento) {
    if (!confirm(`¿Borrar ${describir(a)}, que está anulada?\nSe elimina de la cuenta; no cambia el saldo.`)) return;
    try {
      if (a.tipo === 'entrada') await borrarMovimiento(db, a.id);
      else await borrarOperacion(db, a.id);
      lineas = lineas.filter((x) => x.id !== a.id);
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<p><a href="#/proveedores">← Proveedores</a></p>

{#if estado === 'cargando'}
  <p class="muted">Cargando…</p>
{:else if estado === 'no-existe'}
  <p class="error">El proveedor no existe (¿fue borrado?).</p>
{:else}
  <h2>{proveedor ? proveedor.nombre : 'Nuevo proveedor'}{#if proveedor && !proveedor.activo} <span class="muted">(inactivo)</span>{/if}</h2>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <!-- Enter in any one-line field saves. -->
  <form class="cabecera" onsubmit={guardar} aria-label="Datos del proveedor">
    <label class="ancho">
      Nombre
      <input bind:this={nombreInput} bind:value={form.nombre} aria-invalid={intentado && !v.ok && !!v.errores.nombre} />
    </label>
    <label>
      Plazo de pago (días)
      <input
        class="num corto"
        inputmode="numeric"
        bind:value={form.plazo}
        placeholder={String(PLAZO_DEFAULT)}
        aria-invalid={intentado && !v.ok && !!v.errores.plazo}
      />
    </label>
    <label>
      Teléfono
      <input type="tel" bind:value={form.telefono} />
    </label>
    <label>
      RUT
      <input bind:value={form.rut} />
    </label>
    <label>
      Número de cuenta
      <input bind:value={form.cuenta} />
    </label>
    <label>
      Activo
      <input type="checkbox" bind:checked={form.activo} />
    </label>
    <label class="notas ancho">
      Notas
      <textarea rows="2" bind:value={form.nota}></textarea>
    </label>
    <div class="acciones">
      <button type="submit" disabled={guardando}>{proveedor ? 'Guardar datos' : 'Crear proveedor'}</button>
      {#if !proveedor}<a href="#/proveedores">Cancelar</a>{/if}
    </div>
  </form>
  {#if erroresDatos}
    <p class="error" role="alert">{erroresDatos}</p>
  {:else if mensaje}
    <p class="muted" role="status">{mensaje}</p>
  {/if}

  {#if proveedor}
    <dl class="resumen">
      <dt>Saldo</dt>
      <dd class="fuerte">
        {formatPesos(cuenta.saldo)}{#if cuenta.saldo < 0}&nbsp;<span class="muted">(a favor)</span>{/if}
      </dd>
      {#if cuenta.vencido}
        <dt>Vencido</dt>
        <dd class="agotado">{formatPesos(cuenta.vencido)}</dd>
      {/if}
      {#if cuenta.porVencer}
        <dt>Vence pronto</dt>
        <dd class="bajo">{formatPesos(cuenta.porVencer)}</dd>
      {/if}
      {#if cuenta.proximo}
        <dt>Próximo vencimiento</dt>
        <dd>{formatFecha(cuenta.proximo.vence.toISOString())} ({describirVencimiento(cuenta.proximo.dias)})</dd>
      {/if}
    </dl>

    <h2>Registrar</h2>
    <form class="rapido" onsubmit={registrar} aria-label="Registrar operación">
      <select bind:value={op.tipo} aria-label="Tipo de operación">
        {#each TIPOS_OPERACION as t (t.id)}
          <option value={t.id}>{t.titulo}</option>
        {/each}
      </select>
      <input
        bind:this={importeInput}
        data-atajo="nuevo"
        class="num"
        inputmode="decimal"
        bind:value={op.importe}
        placeholder={op.tipo === 'ajuste' ? '± $' : '$'}
        aria-label="Importe"
        title={op.tipo === 'ajuste' ? 'Con signo: positivo suma a lo que se debe, negativo resta' : undefined}
        aria-invalid={opIntentada && !vop.ok && !!vop.errores.importe}
      />
      {#if op.tipo === 'pago'}
        <select bind:value={op.medioPago} aria-label="Medio de pago">
          {#each MEDIOS_PAGO as m (m.id)}
            <option value={m.id}>{m.titulo}</option>
          {/each}
        </select>
      {/if}
      <input bind:value={op.nota} placeholder="Nota (opcional)" aria-label="Nota" />
      <button type="submit" disabled={registrando}>Registrar</button>
    </form>
    {#if erroresOp}
      <p class="error" role="alert">{erroresOp}</p>
    {/if}
    <p class="muted">
      Las compras (y las entradas de stock que suman a la cuenta) vencen {proveedor.plazoDias}
      {proveedor.plazoDias === 1 ? 'día' : 'días'} después de su fecha. Los pagos cancelan primero la deuda más vieja.
    </p>

    <h2>Cuenta corriente</h2>
    {#if !filas.length}
      <p class="muted">Sin movimientos todavía.</p>
    {:else}
      <table class="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Detalle</th>
            <th class="num">Importe</th>
            <th class="num">Saldo</th>
            <th>Vencimiento</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each filas as { asiento: a, saldo } (a.id)}
            {@const p = pendienteDe.get(a.id)}
            <tr class:anulado={a.anulado} class={p ? (p.dias < 0 ? 'agotado' : p.dias <= DIAS_AVISO ? 'bajo' : '') : ''}>
              <td>{formatFechaHora(a.fecha)}</td>
              <td>{tituloDe(a)}{#if a.tipo === 'pago'} <span class="muted">({tituloMedio(a.op.medioPago)})</span>{/if}</td>
              <td>
                {#if a.tipo === 'entrada'}
                  {@const prod = porId.get(a.mov.productoId)}
                  {#if prod}<a href="#/stock/producto/{prod.id}">{prod.nombre}</a>{:else}<span class="muted">(borrado)</span>{/if}
                  × {formatNumero(a.mov.cantidad)}{#if a.mov.nota} · {a.mov.nota}{/if}
                {:else}
                  {a.op.nota ?? ''}
                {/if}
              </td>
              <td class="num fuerte">{conSigno(importeDe(a))}</td>
              <td class="num">{formatPesos(saldo)}</td>
              <td>
                {#if p}
                  {formatFecha(p.vence.toISOString())}: {describirVencimiento(p.dias)}
                  {#if p.pendiente !== importeDe(a)}<span class="muted">(quedan {formatPesos(p.pendiente)})</span>{/if}
                {/if}
              </td>
              <td class="acciones">
                {#if a.anulado}
                  <span class="muted">anulado</span>
                  <button type="button" class="secundario peligro" onclick={() => borrar(a)}>Borrar</button>
                {:else}
                  <button type="button" class="secundario peligro" onclick={() => anular(a)}>Anular</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <h2>Productos</h2>
    {#if !suyos.length}
      <p class="muted">Ningún producto tiene este proveedor. Se elige al cargar o editar cada producto en <a href="#/stock">Stock</a>.</p>
    {:else}
      <ul>
        {#each suyos as p (p.id)}
          <li><a href="#/stock/producto/{p.id}">{p.nombre}</a>{#if !p.activo} <span class="muted">(inactivo)</span>{/if}</li>
        {/each}
      </ul>
    {/if}
  {/if}
{/if}
