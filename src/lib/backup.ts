// Full JSON backup: export every data store, validate a file, and replace everything with it.

import type { Insumo, PrecioHistorico, Receta, RecetaLinea } from '../costos/types';
import { cambiosEmpleados } from '../empleados/repo';
import type { Empleado, Turno } from '../empleados/types';
import { cambiosStock } from '../stock/repo';
import { MEDIOS_PAGO } from '../stock/proveedores';
import type { Categoria, Movimiento, OperacionProveedor, Producto, Promo, Proveedor, Venta } from '../stock/types';
import { idbRequest as req, type DB, type Registro, type StoreName } from './db';
import { esUnidad, esUnidadBase } from './units';

export const FORMATO = 'mundana-backup';
// Bump when the shape of the records changes, and teach leerBackup to upgrade older files.
// 2: adds historialPrecios (v1 files are read with an empty history).
// 3: adds ventas, and ventaId/precioUnitario on sale movements (older files are read with no sales).
// 4: adds promos, promos on sales and promoId on their movements (older files are read with no promos).
// 5: adds proveedores and operacionesProveedor, proveedorId on products, and proveedorId/importe on
//    entries (older files are read with no suppliers).
// 6: adds categorias and categoriaId on products (older files are read with no categories).
// 7: recipe lines drop mermaPct (older files are read without it, so their waste is ignored).
// 8: adds empleados and turnos (older files are read with no employees).
export const VERSION = 8;

/** Data stores, in dependency order. `meta` (e.g. the last backup date) is not exported. */
export const STORES = [
  'insumos',
  'historialPrecios',
  'recetas',
  'recetaLineas',
  'proveedores',
  'categorias',
  'productos',
  'promos',
  'ventas',
  'movimientos',
  'operacionesProveedor',
  'empleados',
  'turnos',
] as const;
export type StoreDatos = (typeof STORES)[number];

export const NOMBRES: Record<StoreDatos, string> = {
  insumos: 'Insumos',
  historialPrecios: 'Historial de precios',
  recetas: 'Recetas',
  recetaLineas: 'Líneas de receta',
  proveedores: 'Proveedores',
  categorias: 'Categorías',
  productos: 'Productos',
  promos: 'Promos',
  ventas: 'Ventas',
  movimientos: 'Movimientos de stock',
  operacionesProveedor: 'Operaciones con proveedores',
  empleados: 'Empleados',
  turnos: 'Turnos de empleados',
};

export interface Datos {
  insumos: Insumo[];
  historialPrecios: PrecioHistorico[];
  recetas: Receta[];
  recetaLineas: RecetaLinea[];
  proveedores: Proveedor[];
  categorias: Categoria[];
  productos: Producto[];
  promos: Promo[];
  ventas: Venta[];
  movimientos: Movimiento[];
  operacionesProveedor: OperacionProveedor[];
  empleados: Empleado[];
  turnos: Turno[];
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

/** `ona-AAAA-MM-DD.json` (local date), with an optional suffix before the extension. */
export function nombreArchivo(fecha: Date, sufijo = '', ext = 'json'): string {
  const dia = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
  return `ona-${dia}${sufijo ? `-${sufijo}` : ''}.${ext}`;
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
  cambiosEmpleados.dispatchEvent(new Event('cambio'));
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
const centavosPositivos: Chequeo = (v) => Number.isInteger(v) && (v as number) > 0;
const centavosNoCero: Chequeo = (v) => Number.isInteger(v) && v !== 0;
const diasEnteros: Chequeo = (v) => Number.isInteger(v) && (v as number) >= 0;
const booleano: Chequeo = (v) => typeof v === 'boolean';
const fecha: Chequeo = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const porcentaje: Chequeo = (v) => noNegativo(v) && (v as number) <= 100;
const opcional =
  (c: Chequeo): Chequeo =>
  (v) =>
    v === undefined || c(v);
const unoDe =
  (...xs: unknown[]): Chequeo =>
  (v) =>
    xs.includes(v);
const ausente: Chequeo = (v) => v === undefined;

type Esquema = Record<string, Chequeo>;

const cumple = (esquema: Esquema, v: unknown) => esObjeto(v) && Object.keys(esquema).every((k) => esquema[k](v[k]));

/** A list of objects that each match `esquema`; optionally non-empty and with no two sharing `unico`. */
const listaDe =
  (esquema: Esquema, { noVacia = false, unico }: { noVacia?: boolean; unico?: string } = {}): Chequeo =>
  (v) =>
    Array.isArray(v) &&
    (!noVacia || v.length > 0) &&
    v.every((x) => cumple(esquema, x)) &&
    (!unico || new Set(v.map((x: Record<string, unknown>) => x[unico])).size === v.length);

const COMPONENTE: Esquema = { productoId: noVacio, cantidad: positivo };
const PROMO_VENDIDA: Esquema = { promoId: noVacio, nombre: texto, precio: centavos, cantidad: positivo };

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
      if (r.tipo === 'insumo') return { ...LINEA, insumoId: noVacio, cantidad: noNegativo, unidad: esUnidad };
      if (r.tipo === 'costoFijo') return { ...LINEA, descripcion: texto, monto: centavos };
      return 'tipo de línea desconocido';
    case 'productos':
      return {
        ...REGISTRO,
        nombre: texto,
        unidad: texto,
        stockMinimo: noNegativo,
        costo: opcional(centavos),
        precioVenta: opcional(centavos),
        activo: booleano,
        proveedorId: opcional(noVacio),
        categoriaId: opcional(noVacio),
      };
    case 'categorias':
      return { ...REGISTRO, nombre: texto };
    case 'proveedores':
      return {
        ...REGISTRO,
        nombre: texto,
        plazoDias: diasEnteros,
        activo: booleano,
        telefono: opcional(texto),
        rut: opcional(texto),
        cuenta: opcional(texto),
        nota: opcional(texto),
      };
    case 'operacionesProveedor':
      return {
        ...REGISTRO,
        proveedorId: noVacio,
        tipo: unoDe('compra', 'pago', 'ajuste'),
        importe: r.tipo === 'ajuste' ? centavosNoCero : centavosPositivos,
        fecha,
        medioPago: r.tipo === 'pago' ? unoDe(...MEDIOS_PAGO.map((m) => m.id)) : ausente,
        nota: opcional(texto),
        anuladoEn: opcional(fecha),
      };
    case 'promos':
      return { ...REGISTRO, nombre: texto, precio: centavos, activo: booleano, componentes: listaDe(COMPONENTE, { noVacia: true, unico: 'productoId' }) };
    case 'ventas':
      return {
        ...REGISTRO,
        fecha,
        descuentoPct: porcentaje,
        nota: opcional(texto),
        anuladoEn: opcional(fecha),
        promos: opcional(listaDe(PROMO_VENDIDA, { unico: 'promoId' })),
      };
    case 'empleados':
      return { ...REGISTRO, nombre: texto, activo: booleano };
    case 'turnos':
      return {
        ...REGISTRO,
        empleadoId: noVacio,
        entrada: fecha,
        salida: opcional(fecha),
        manual: opcional(unoDe(true)),
        salidaManual: opcional(unoDe(true)),
        anuladoEn: opcional(fecha),
      };
    case 'movimientos': {
      // A sale line (with ventaId) must be a 'venta' and carry its unit price;
      // a promo component (with promoId) must be a sale line with price 0;
      // only an entrada can add to a supplier's account, with both proveedorId and importe.
      const deVenta = r.ventaId !== undefined;
      const dePromo = r.promoId !== undefined;
      const aCuenta = r.tipo === 'entrada' && (r.proveedorId !== undefined || r.importe !== undefined);
      return {
        ...REGISTRO,
        productoId: noVacio,
        tipo: deVenta ? unoDe('venta') : unoDe('entrada', 'venta', 'ajuste'),
        cantidad: r.tipo === 'ajuste' ? numero : positivo,
        fecha,
        nota: opcional(texto),
        anuladoEn: opcional(fecha),
        ventaId: dePromo ? noVacio : opcional(noVacio),
        precioUnitario: dePromo ? unoDe(0) : deVenta ? centavos : opcional(centavos),
        promoId: opcional(noVacio),
        proveedorId: aCuenta ? noVacio : ausente,
        importe: aCuenta ? centavos : ausente,
      };
    }
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
  if (!esObjeto(json) || json.formato !== FORMATO) return { ok: false, errores: ['El archivo no es un backup de Ona.'] };
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
  if ((v as number) < 3 && datos.ventas === undefined) datos.ventas = [];
  if ((v as number) < 4 && datos.promos === undefined) datos.promos = [];
  if ((v as number) < 5 && datos.proveedores === undefined) datos.proveedores = [];
  if ((v as number) < 5 && datos.operacionesProveedor === undefined) datos.operacionesProveedor = [];
  if ((v as number) < 6 && datos.categorias === undefined) datos.categorias = [];
  if ((v as number) < 8 && datos.empleados === undefined) datos.empleados = [];
  if ((v as number) < 8 && datos.turnos === undefined) datos.turnos = [];
  // Recipe lines no longer have a waste percentage: drop it so it doesn't get back into the database.
  if (Array.isArray(datos.recetaLineas)) for (const l of datos.recetaLineas) if (esObjeto(l)) delete l.mermaPct;

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
  ref('movimientos', 'ventaId', 'ventas');
  ref('productos', 'proveedorId', 'proveedores');
  ref('productos', 'categoriaId', 'categorias');
  ref('movimientos', 'proveedorId', 'proveedores');
  ref('operacionesProveedor', 'proveedorId', 'proveedores');
  ref('turnos', 'empleadoId', 'empleados');
  // Inside lists: a promo's components → products; a sale's promos → promos.
  const refEnLista = (s: StoreDatos, lista: string, campo: string, destino: StoreDatos) => {
    const registros = datos[s];
    if (!Array.isArray(registros) || !Array.isArray(datos[destino])) return;
    registros.forEach((r, i) => {
      if (!esObjeto(r) || !Array.isArray(r[lista])) return;
      if (r[lista].some((x: unknown) => esObjeto(x) && typeof x[campo] === 'string' && !ids[destino].has(x[campo]))) {
        errores.push(`${NOMBRES[s]}, registro ${i + 1}: "${lista}" apunta a un registro que no está en el backup.`);
      }
    });
  };
  refEnLista('promos', 'componentes', 'productoId', 'productos');
  refEnLista('ventas', 'promos', 'promoId', 'promos');
  // A promo component's sale must include that promo.
  if (Array.isArray(datos.movimientos) && Array.isArray(datos.ventas)) {
    const promosDe = new Map<string, Set<unknown>>();
    for (const r of datos.ventas) {
      if (esObjeto(r) && typeof r.id === 'string') {
        promosDe.set(r.id, new Set(Array.isArray(r.promos) ? r.promos.map((p: unknown) => esObjeto(p) && p.promoId) : []));
      }
    }
    datos.movimientos.forEach((r, i) => {
      if (!esObjeto(r) || typeof r.promoId !== 'string' || typeof r.ventaId !== 'string') return;
      if (promosDe.has(r.ventaId) && !promosDe.get(r.ventaId)!.has(r.promoId)) {
        errores.push(`${NOMBRES.movimientos}, registro ${i + 1}: "promoId" no es una promo de su venta.`);
      }
    });
  }

  if (errores.length) {
    const extra = errores.length - MAX_ERRORES;
    return { ok: false, errores: extra > 0 ? [...errores.slice(0, MAX_ERRORES), `…y ${extra} errores más.`] : errores };
  }
  return { ok: true, backup: { ...(json as unknown as Backup), version: VERSION } };
}
