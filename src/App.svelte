<script lang="ts">
  import BackupView from './backup/BackupView.svelte';
  import CostosView from './costos/CostosView.svelte';
  import { ATAJOS, atajoDe } from './lib/atajos';
  import { backupVencido, cambiosBackup, contar, diasDesde, ultimoBackup } from './lib/backup';
  import type { DB } from './lib/db';
  import { SECCIONES, seccionDesdeHash, subruta } from './lib/nav';
  import { requestPersistence, type PersistState } from './lib/storage';
  import type { Ediciones } from './pwa/ediciones';
  import { aplicarVersion, aviso, avisosVersion, type AvisoVersion } from './pwa/registro';
  import { cambiosStock, cargarAlertas } from './stock/repo';
  import StockView from './stock/StockView.svelte';

  let {
    persistencia: pedida,
    db,
    ediciones,
  }: { persistencia: Promise<PersistState>; db: Promise<DB>; ediciones: Ediciones } = $props();

  // Asked again once installed: Chrome tends to grant persistence to installed apps.
  // svelte-ignore state_referenced_locally
  let persistencia = $state(pedida);
  $effect(() => {
    const alInstalar = () => (persistencia = requestPersistence());
    window.addEventListener('appinstalled', alInstalar);
    return () => window.removeEventListener('appinstalled', alInstalar);
  });

  let enLinea = $state(navigator.onLine);

  // New service worker waiting (or activated from another tab). Reloading is always the user's call.
  let version = $state<AvisoVersion | undefined>(aviso);
  $effect(() => {
    const nueva = () => (version = 'nueva');
    const activada = () => (version = 'activada');
    avisosVersion.addEventListener('nueva', nueva);
    avisosVersion.addEventListener('activada', activada);
    return () => {
      avisosVersion.removeEventListener('nueva', nueva);
      avisosVersion.removeEventListener('activada', activada);
    };
  });

  function recargar() {
    if (ediciones.pendientes() && !confirm('Hay datos escritos sin guardar. Si recargás ahora se pierden. ¿Recargar igual?'))
      return;
    aplicarVersion();
  }

  let ayuda = $state(false);

  function teclas(ev: KeyboardEvent) {
    if (ev.defaultPrevented || ev.repeat) return;
    if (ev.key === 'Escape' && ayuda) {
      ayuda = false;
      return;
    }
    const a = atajoDe(ev, ev.target instanceof HTMLElement ? ev.target : null);
    if (!a) return;
    ev.preventDefault();
    if (a.tipo === 'ayuda') ayuda = !ayuda;
    else if (a.tipo === 'ir') location.hash = a.hash;
    else {
      const el = document.querySelector<HTMLElement>(`[data-atajo="${a.objetivo}"]`);
      el?.focus();
      if (el instanceof HTMLInputElement) el.select();
    }
  }

  let hash = $state(location.hash);
  const seccion = $derived(seccionDesdeHash(hash));
  const ruta = $derived(subruta(hash));

  // Low-stock count for the nav badge, refreshed after every stock write.
  let alertas = $state(0);
  $effect(() => {
    const actualizar = async () => (alertas = (await cargarAlertas(await db)).length);
    actualizar().catch(() => {});
    cambiosStock.addEventListener('cambio', actualizar);
    return () => cambiosStock.removeEventListener('cambio', actualizar);
  });

  // Stale-backup warning: rechecked on navigation (costos writes don't notify) and after a backup.
  let sinBackup = $state<{ dias: number | undefined } | undefined>();
  $effect(() => {
    void hash;
    const actualizar = async () => {
      const d = await db;
      const [ultimo, conteo] = await Promise.all([ultimoBackup(d), contar(d)]);
      const hayDatos = Object.values(conteo).some((c) => c > 0);
      sinBackup = backupVencido(ultimo, hayDatos) ? { dias: diasDesde(ultimo) } : undefined;
    };
    actualizar().catch(() => {});
    cambiosBackup.addEventListener('cambio', actualizar);
    return () => cambiosBackup.removeEventListener('cambio', actualizar);
  });
</script>

<svelte:window
  onkeydown={teclas}
  onhashchange={() => (hash = location.hash)}
  ononline={() => (enLinea = true)}
  onoffline={() => (enLinea = false)}
/>

<header>
  <strong class="marca">Mundana</strong>
  <nav>
    {#each SECCIONES as s (s.id)}
      <a href="#/{s.id}" aria-current={seccion === s.id ? 'page' : undefined}>
        {s.titulo}{#if s.id === 'stock' && alertas}&nbsp;<span class="badge" title="Productos con stock bajo">{alertas}</span>{/if}
      </a>
    {/each}
  </nav>
</header>

{#if version}
  <div class="version" role="status">
    {version === 'nueva' ? 'Hay una versión nueva de la app.' : 'Se activó una versión nueva de la app.'}
    <button onclick={recargar}>Recargar</button>
    <button class="secundario" onclick={() => (version = undefined)}>Más tarde</button>
  </div>
{/if}

<main>
  {#await db}
    <p>Abriendo base de datos…</p>
  {:then db}
    {#if sinBackup && seccion !== 'backup'}
      <p class="aviso aviso-backup" role="status">
        {sinBackup.dias === undefined ? 'Todavía no hiciste ningún backup.' : `Hace ${sinBackup.dias} días que no hacés un backup.`}
        <a href="#/backup">Hacer backup</a>
      </p>
    {/if}
    {#if seccion === 'costos'}
      <CostosView {db} {ruta} />
    {:else if seccion === 'stock'}
      <StockView {db} {ruta} {alertas} />
    {:else}
      <BackupView {db} />
    {/if}
  {:catch err}
    <p class="error">No se pudo abrir la base de datos: {err instanceof Error ? err.message : err}</p>
  {/await}
</main>

{#if ayuda}
  <aside class="atajos" aria-label="Atajos de teclado">
    <h2>Atajos de teclado</h2>
    <p class="muted">Funcionan cuando no estás escribiendo en un campo.</p>
    <table class="tabla compacta">
      <tbody>
        {#each ATAJOS as a (a.tecla)}
          <tr><td><kbd>{a.tecla}</kbd></td><td>{a.descripcion}</td></tr>
        {/each}
        <tr><td><kbd>Enter</kbd></td><td>Guardar la fila o el movimiento que estás escribiendo</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Cancelar la edición de una fila / cerrar esta ayuda</td></tr>
        <tr><td><kbd>Tab</kbd></td><td>Pasar al campo siguiente</td></tr>
      </tbody>
    </table>
    <button type="button" class="secundario" onclick={() => (ayuda = false)}>Cerrar</button>
  </aside>
{/if}

<footer>
  <button type="button" class="enlace" onclick={() => (ayuda = !ayuda)} title="Atajos de teclado">Atajos (?)</button>
  {#if !enLinea}
    <span class="sin-conexion" title="La app funciona igual: los datos están en este navegador.">Sin conexión</span>
  {/if}
  {#await persistencia then p}
    {#if p !== 'persistente'}
      <span class="aviso">El navegador puede borrar los datos si falta espacio. Hacé backups seguido.</span>
    {/if}
  {/await}
</footer>
