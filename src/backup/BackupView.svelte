<script lang="ts">
  import { csvInsumos, csvRecetas } from '../costos/csv';
  import { lineasPorReceta, listarInsumos, listarRecetas } from '../costos/repo';
  import {
    backupVencido,
    contar,
    contarBackup,
    diasDesde,
    exportar,
    importar,
    leerBackup,
    NOMBRES,
    nombreArchivo,
    registrarBackup,
    serializar,
    STORES,
    ultimoBackup,
    type Conteo,
    type Lectura,
  } from '../lib/backup';
  import type { DB } from '../lib/db';
  import { descargar } from '../lib/descarga';
  import { formatFechaHora } from '../lib/texto';
  import { csvProductos } from '../stock/csv';
  import { listarProductos, stockActualDe } from '../stock/repo';

  let { db }: { db: DB } = $props();

  let conteo = $state<Conteo | undefined>();
  let ultimo = $state<string | undefined>();
  let mensaje = $state('');
  let error = $state('');
  let ocupado = $state(false);

  let lectura = $state<Lectura | undefined>();
  let archivo = $state('');
  let input = $state<HTMLInputElement>();

  const total = (c: Conteo | undefined) => (c ? STORES.reduce((s, k) => s + c[k], 0) : 0);
  const hayDatos = $derived(total(conteo) > 0);
  const dias = $derived(diasDesde(ultimo));
  const vencido = $derived(backupVencido(ultimo, hayDatos));
  const entrante = $derived(lectura?.ok ? contarBackup(lectura.backup) : undefined);

  async function cargar() {
    [conteo, ultimo] = await Promise.all([contar(db), ultimoBackup(db)]);
  }
  cargar();

  const JSON_TIPO = 'application/json';

  async function hacer(fn: () => Promise<void>) {
    ocupado = true;
    mensaje = error = '';
    try {
      await fn();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      ocupado = false;
    }
  }

  const exportarTodo = () =>
    hacer(async () => {
      const ahora = new Date();
      descargar(nombreArchivo(ahora), serializar(await exportar(db, ahora)), JSON_TIPO);
      await registrarBackup(db, ahora);
      await cargar();
      mensaje = 'Backup descargado. Guardalo fuera del navegador (pendrive, nube, mail).';
    });

  async function elegir(ev: Event) {
    const f = (ev.currentTarget as HTMLInputElement).files?.[0];
    mensaje = error = '';
    lectura = undefined;
    if (!f) return;
    archivo = f.name;
    try {
      lectura = leerBackup(await f.text());
    } catch {
      lectura = { ok: false, errores: ['No se pudo leer el archivo.'] };
    }
  }

  function cancelar() {
    lectura = undefined;
    archivo = '';
    if (input) input.value = '';
  }

  const confirmarImportacion = () =>
    hacer(async () => {
      if (!lectura?.ok) return;
      const backup = lectura.backup;
      const habiaDatos = hayDatos;
      // Safety copy of what is about to be replaced.
      if (habiaDatos) {
        const ahora = new Date();
        descargar(nombreArchivo(ahora, 'antes-de-importar'), serializar(await exportar(db, ahora)), JSON_TIPO);
      }
      await importar(db, backup);
      cancelar();
      await cargar();
      mensaje = habiaDatos
        ? 'Datos importados. Se descargó una copia de los datos anteriores ("antes-de-importar").'
        : 'Datos importados.';
    });

  const exportarCsv = (sufijo: string, generar: () => Promise<string>) =>
    hacer(async () => descargar(nombreArchivo(new Date(), sufijo, 'csv'), await generar(), 'text/csv;charset=utf-8'));

  const csvDeProductos = async () => csvProductos(await listarProductos(db), await stockActualDe(db));
  const csvDeInsumos = async () => csvInsumos(await listarInsumos(db));
  const csvDeRecetas = async () => {
    const [recetas, lineas, insumos] = await Promise.all([listarRecetas(db), lineasPorReceta(db), listarInsumos(db)]);
    return csvRecetas(recetas, lineas, insumos);
  };
</script>

<h1>Backup</h1>

<p class="muted">
  Los datos se guardan solo en este navegador. Si se borran los datos del navegador o se cambia de equipo, se pierden: hacé un
  backup seguido y guardalo en otro lado.
</p>

{#if mensaje}
  <p class="aviso" role="status">{mensaje}</p>
{/if}
{#if error}
  <p class="error" role="alert">{error}</p>
{/if}

<h2>Exportar</h2>
{#if conteo}
  <dl class="resumen">
    <dt>Último backup</dt>
    <dd class:bajo={vencido}>
      {#if ultimo}
        {formatFechaHora(ultimo)} ({dias === 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`})
      {:else}
        Nunca
      {/if}
    </dd>
    {#each STORES as s (s)}
      <dt>{NOMBRES[s]}</dt>
      <dd>{conteo[s]}</dd>
    {/each}
  </dl>
{/if}
<div class="barra">
  <button type="button" onclick={exportarTodo} disabled={ocupado}>Descargar backup (JSON)</button>
</div>

<h2>Importar</h2>
<p class="muted">Importar <strong>reemplaza todos los datos</strong> actuales por los del archivo. Antes se descarga una copia de los datos actuales.</p>
<div class="barra">
  <input bind:this={input} type="file" accept=".json,application/json" onchange={elegir} disabled={ocupado} aria-label="Archivo de backup" />
</div>

{#if lectura && !lectura.ok}
  <div class="error" role="alert">
    <p>"{archivo}" no se puede importar:</p>
    <ul>
      {#each lectura.errores as e, i (i)}
        <li>{e}</li>
      {/each}
    </ul>
  </div>
{:else if lectura?.ok && entrante && conteo}
  <p>
    Backup "{archivo}", exportado el {formatFechaHora(lectura.backup.exportadoEn)}.
  </p>
  <table class="tabla compacta">
    <thead>
      <tr>
        <th></th>
        <th class="num">Ahora</th>
        <th class="num">En el backup</th>
      </tr>
    </thead>
    <tbody>
      {#each STORES as s (s)}
        <tr>
          <td>{NOMBRES[s]}</td>
          <td class="num">{conteo[s]}</td>
          <td class="num fuerte">{entrante[s]}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="barra">
    <button type="button" class="peligro-fuerte" onclick={confirmarImportacion} disabled={ocupado}>Reemplazar mis datos con este backup</button>
    <button type="button" class="secundario" onclick={cancelar} disabled={ocupado}>Cancelar</button>
  </div>
{/if}

<h2>Exportar a planilla (CSV)</h2>
<p class="muted">Para abrir en Excel u otra planilla. No sirve para restaurar: para eso está el backup JSON.</p>
<div class="barra">
  <button type="button" class="secundario" onclick={() => exportarCsv('productos', csvDeProductos)} disabled={ocupado}>Productos</button>
  <button type="button" class="secundario" onclick={() => exportarCsv('insumos', csvDeInsumos)} disabled={ocupado}>Insumos</button>
  <button type="button" class="secundario" onclick={() => exportarCsv('recetas', csvDeRecetas)} disabled={ocupado}>Recetas</button>
</div>
