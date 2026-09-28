// Full JSON backup: export every data store, validate a file, and replace everything with it.

import type { Insumo, PrecioHistorico, Receta, RecetaLinea } from '../costos/types';
import { cambiosStock } from '../stock/repo';
import type { Movimiento, Producto } from '../stock/types';
import { idbRequest as req, type DB, type Registro, type StoreName } from './db';
import { esUnidad, esUnidadBase } from './units';

export const FORMATO = 'mundana-backup';
// Bump when the shape of the records changes, and teach leerBackup to upgrade older files.
// 2: adds historialPrecios (v1 files are read with an empty history).
export const VERSION = 2;

/** Data stores, in dependency order. `meta` (e.g. the last backup date) is not exported. */
export const STORES = ['insumos', 'historialPrecios', 'recetas', 'recetaLineas', 'productos', 'movimientos'] as const;
export type StoreDatos = (typeof STORES)[number];

export const NOMBRES: Record<StoreDatos, string> = {
  insumos: 'Insumos',
  historialPrecios: 'Historial de precios',
  recetas: 'Recetas',
  recetaLineas: 'Líneas de receta',
  productos: 'Productos',
  movimientos: 'Movimientos de stock',
};

export interface Datos {
  insumos: Insumo[];
  historialPrecios: PrecioHistorico[];
  recetas: Receta[];
  recetaLineas: RecetaLinea[];
  productos: Producto[];
  movimientos: Movimiento[];
}

export interface Backup {
  formato: typeof FORMATO;
  version: number;
  exportadoEn: string; // ISO 8601
  datos: Datos;
}

export type Conteo = Record<StoreDatos, number>;

/** Fires 'cambio' after a backup is exported or imported, so the staleness warning can refresh. */
export const cambiosBackup = new EventTarget();
const avisar = () => {
  cambiosBackup.dispatchEvent(new Event('cambio'));
};

const ULTIMO = 'ultimoBackup';

interface MetaUltimo extends Registro {
  fecha: string; // ISO 8601
}

export async function exportar(db: DB, ahora = new Date()): Promise<Backup> {
  const datos = await db.tx([...STORES], 'readonly', async (tx) => {
    const d: Partial<Datos> = {};
    for (const s of STORES) Object.assign(d, { [s]: await req(tx.objectStore(s).getAll()) });
    return d as Datos;
  });
  return { formato: FORMATO, version: VERSION, exportadoEn: ahora.toISOString(), datos };
}

export function serializar(b: Backup): string {
  return JSON.stringify(b, null, 1);
}

const dos = (n: number) => String(n).padStart(2, '0');

/** `mundana-AAAA-MM-DD.json` (local date), with an optional suffix before the extension. */
export function nombreArchivo(fecha: Date, sufijo = '', ext = 'json'): string {
  const dia = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
  return `mundana-${dia}${sufijo ? `-${sufijo}` : ''}.${ext}`;
}

export function contarBackup(b: Backup): Conteo {
  return Object.fromEntries(STORES.map((s) => [s, b.datos[s].length])) as Conteo;
}

/** Record count of every data store. */
export function contar(db: DB): Promise<Conteo> {
  return db.tx([...STORES], 'readonly', async (tx) => {
    const c: Partial<Conteo> = {};
    for (const s of STORES) c[s] = await req(tx.objectStore(s).count());
    return c as Conteo;
  });
}

/** Replaces every data store with the backup's records, atomically, and records it as the last backup. */
export async function importar(db: DB, b: Backup, ahora = new Date()): Promise<void> {
  const stores: StoreName[] = [...STORES, 'meta'];
  await db.tx(stores, 'readwrite', async (tx) => {
    for (const s of STORES) {
      const store = tx.objectStore(s);
      await req(store.clear());
      for (const r of b.datos[s]) await req(store.put(r));
    }
    await req(tx.objectStore('meta').put(metaUltimo(ahora)));
  });
  cambiosStock.dispatchEvent(new Event('cambio'));
  avisar();
}

const metaUltimo = (fecha: Date): MetaUltimo => ({ id: ULTIMO, actualizadoEn: fecha.toISOString(), fecha: fecha.toISOString() });

export async function registrarBackup(db: DB, fecha = new Date()): Promise<void> {
  await db.put('meta', metaUltimo(fecha));
  avisar();
}

/** ISO date of the last export or import, if any. */
export async function ultimoBackup(db: DB): Promise<string | undefined> {
  return (await db.get<MetaUltimo>('meta', ULTIMO))?.fecha;
}

const DIA = 24 * 60 * 60 * 1000;

/** Whole days since `iso` (undefined if never). */
export function diasDesde(iso: string | undefined, ahora = new Date()): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : Math.floor((ahora.getTime() - t) / DIA);
}

/** True if there is data and no backup in more than `dias` days. */
export function backupVencido(ultimo: string | undefined, hayDatos: boolean, ahora = new Date(), dias = 7): boolean {
  if (!hayDatos) return false;
  const d = diasDesde(ultimo, ahora);
  return d === undefined || d > dias;
}

// --- Validation of an imported file ---

type Chequeo = (v: unknown) => boolean;

const texto: Chequeo = (v) => typeof v === 'string';
const noVacio: Chequeo = (v) => typeof v === 'string' && v.trim() !== '';
const numero: Chequeo = (v) => typeof v === 'number' && Number.isFinite(v);
const noNegativo: Chequeo = (v) => numero(v) && (v as number) >= 0;
const positivo: Chequeo = (v) => numero(v) && (v as number) > 0;
const centavos: Chequeo = (v) => Number.isInteger(v) && (v as number) >= 0;
const booleano: Chequeo = (v) => typeof v === 'boolean';
const fecha: Chequeo = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const merma: Chequeo = (v) => noNegativo(v) && (v as number) < 100;
const opcional =
  (c: Chequeo): Chequeo =>
  (v) =>
    v === undefined || c(v);
const unoDe =
  (...xs: unknown[]): Chequeo =>
  (v) =>
    xs.includes(v);

type Esquema = Record<string, Chequeo>;

const REGISTRO: Esquema = { id: noVacio, actualizadoEn: texto };

const LINEA: Esquema = { ...REGISTRO, recetaId: noVacio, orden: numero };

function esquemaDe(store: StoreDatos, r: Record<string, unknown>): Esquema | string {
  switch (store) {
    case 'insumos':
      return {
        ...REGISTRO,
        nombre: texto,
        unidadBase: esUnidadBase,
        precioCompra: centavos,
        cantidadCompra: noNegativo,
        unidadCompra: esUnidad,
      };
    case 'historialPrecios':
      return { ...REGISTRO, insumoId: noVacio, fecha, unidadBase: esUnidadBase, costoPorUnidadBase: noNegativo };
    case 'recetas':
      return { ...REGISTRO, nombre: texto, rendimiento: noNegativo, unidadRendimiento: texto, margen: numero, notas: texto };
    case 'recetaLineas':
      if (r.tipo === 'insumo') return { ...LINEA, insumoId: noVacio, cantidad: noNegativo, unidad: esUnidad, mermaPct: merma };
      if (r.tipo === 'costoFijo') return { ...LINEA, descripcion: texto, monto: centavos };
      return 'tipo de línea desconocido';
    case 'productos':
      return { ...REGISTRO, nombre: texto, unidad: texto, stockMinimo: noNegativo, precioVenta: opcional(centavos), activo: booleano };
    case 'movimientos':
      return {
        ...REGISTRO,
        productoId: noVacio,
        tipo: unoDe('entrada', 'venta', 'ajuste'),
        cantidad: r.tipo === 'ajuste' ? numero : positivo,
        fecha,
        nota: opcional(texto),
        anuladoEn: opcional(fecha),
      };
  }
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export type Lectura = { ok: true; backup: Backup } | { ok: false; errores: string[] };

const MAX_ERRORES = 20;

/** Parses and validates a backup file: format, version, every record's fields, unique ids and references. */
export function leerBackup(contenido: string): Lectura {
  let json: unknown;
  try {
    json = JSON.parse(contenido);
  } catch {
    return { ok: false, errores: ['El archivo no es un JSON válido.'] };
  }
  if (!esObjeto(json) || json.formato !== FORMATO) return { ok: false, errores: ['El archivo no es un backup de Mundana.'] };
  const v = json.version;
  if (!Number.isInteger(v) || (v as number) < 1) return { ok: false, errores: ['El backup no tiene una versión válida.'] };
  if ((v as number) > VERSION) {
    return {
      ok: false,
      errores: [`El backup es de una versión más nueva de la app (${v}; esta usa la ${VERSION}). Actualizá la app y probá de nuevo.`],
    };
  }

  const errores: string[] = [];
  if (!fecha(json.exportadoEn)) errores.push('Falta la fecha de exportación o es inválida.');
  const datos = json.datos;
  if (!esObjeto(datos)) return { ok: false, errores: [...errores, 'Faltan los datos.'] };
  if (v === 1 && datos.historialPrecios === undefined) datos.historialPrecios = [];

  const ids = {} as Record<StoreDatos, Set<string>>;
  for (const s of STORES) {
    ids[s] = new Set();
    const lista = datos[s];
    if (!Array.isArray(lista)) {
      errores.push(`${NOMBRES[s]}: falta la lista.`);
      continue;
    }
    lista.forEach((r, i) => {
      const donde = `${NOMBRES[s]}, registro ${i + 1}`;
      if (!esObjeto(r)) return errores.push(`${donde}: no es un objeto.`);
      const esquema = esquemaDe(s, r);
      if (typeof esquema === 'string') errores.push(`${donde}: ${esquema}.`);
      else {
        const malos = Object.keys(esquema).filter((k) => !esquema[k](r[k]));
        if (malos.length) errores.push(`${donde}: ${malos.map((k) => `"${k}"`).join(', ')} falta o es inválido.`);
      }
      if (typeof r.id !== 'string') return;
      if (ids[s].has(r.id)) errores.push(`${donde}: id repetido (${r.id}).`);
      ids[s].add(r.id);
    });
  }

  // References to ids that exist in the file (even if that record has other errors, reported above).
  const ref = (s: StoreDatos, campo: string, destino: StoreDatos) => {
    const lista = datos[s];
    if (!Array.isArray(lista) || !Array.isArray(datos[destino])) return;
    lista.forEach((r, i) => {
      if (esObjeto(r) && typeof r[campo] === 'string' && !ids[destino].has(r[campo])) {
        errores.push(`${NOMBRES[s]}, registro ${i + 1}: "${campo}" apunta a un registro que no está en el backup.`);
      }
    });
  };
  ref('historialPrecios', 'insumoId', 'insumos');
  ref('recetaLineas', 'recetaId', 'recetas');
  ref('recetaLineas', 'insumoId', 'insumos');
  ref('movimientos', 'productoId', 'productos');

  if (errores.length) {
    const extra = errores.length - MAX_ERRORES;
    return { ok: false, errores: extra > 0 ? [...errores.slice(0, MAX_ERRORES), `…y ${extra} errores más.`] : errores };
  }
  return { ok: true, backup: { ...(json as unknown as Backup), version: VERSION } };
}
