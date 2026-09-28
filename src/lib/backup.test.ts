import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Insumo, LineaCostoFijo, LineaInsumo, Receta } from '../costos/types';
import { cambiosStock } from '../stock/repo';
import type { Movimiento, Producto } from '../stock/types';
import {
  backupVencido,
  cambiosBackup,
  contar,
  contarBackup,
  diasDesde,
  exportar,
  FORMATO,
  importar,
  leerBackup,
  nombreArchivo,
  registrarBackup,
  serializar,
  STORES,
  ultimoBackup,
  VERSION,
  type Backup,
} from './backup';
import { openDB, type DB } from './db';

let n = 0;
const open: DB[] = [];

async function fresh(): Promise<DB> {
  const db = await openDB(`backup-${n++}`);
  open.push(db);
  return db;
}

afterEach(() => {
  open.splice(0).forEach((db) => db.close());
});

const T = '2026-01-01T00:00:00.000Z';

const insumo: Insumo = {
  id: 'i1',
  actualizadoEn: T,
  nombre: 'Harina',
  unidadBase: 'g',
  precioCompra: 100000,
  cantidadCompra: 1,
  unidadCompra: 'kg',
};
const receta: Receta = { id: 'r1', actualizadoEn: T, nombre: 'Pan', rendimiento: 10, unidadRendimiento: 'panes', margen: 50, notas: '' };
const lineaInsumo: LineaInsumo = {
  id: 'l1',
  actualizadoEn: T,
  recetaId: 'r1',
  orden: 0,
  tipo: 'insumo',
  insumoId: 'i1',
  cantidad: 100,
  unidad: 'g',
  mermaPct: 0,
};
const lineaFija: LineaCostoFijo = { id: 'l2', actualizadoEn: T, recetaId: 'r1', orden: 1, tipo: 'costoFijo', descripcion: 'Gas', monto: 5000 };
const producto: Producto = { id: 'p1', actualizadoEn: T, nombre: 'Miel', unidad: 'frasco', stockMinimo: 2, activo: true };
const movs: Movimiento[] = [
  { id: 'm1', actualizadoEn: T, productoId: 'p1', tipo: 'entrada', cantidad: 10, fecha: T },
  { id: 'm2', actualizadoEn: T, productoId: 'p1', tipo: 'venta', cantidad: 3, fecha: T, nota: 'feria', anuladoEn: T },
  { id: 'm3', actualizadoEn: T, productoId: 'p1', tipo: 'ajuste', cantidad: -1.5, fecha: T },
];

const backup = (): Backup => ({
  formato: FORMATO,
  version: VERSION,
  exportadoEn: T,
  datos: {
    insumos: [structuredClone(insumo)],
    recetas: [structuredClone(receta)],
    recetaLineas: [structuredClone(lineaInsumo), structuredClone(lineaFija)],
    productos: [structuredClone(producto)],
    movimientos: structuredClone(movs),
  },
});

/** A valid backup as plain JSON, modified by `f`. */
function json(f: (b: Record<string, any>) => void = () => {}): string {
  const b = JSON.parse(JSON.stringify(backup()));
  f(b);
  return JSON.stringify(b);
}

const errores = (texto: string) => {
  const r = leerBackup(texto);
  return r.ok ? [] : r.errores;
};

async function sembrar(db: DB): Promise<void> {
  await importar(db, backup());
}

describe('exportar / importar', () => {
  it('round-trips: export, wipe, import gives identical data', async () => {
    const db = await fresh();
    await sembrar(db);
    const antes = await exportar(db, new Date(T));

    const texto = serializar(antes);
    await importar(db, { ...backup(), datos: { insumos: [], recetas: [], recetaLineas: [], productos: [], movimientos: [] } });
    expect(Object.values(await contar(db)).every((c) => c === 0)).toBe(true);

    const r = leerBackup(texto);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await importar(db, r.backup);
    expect(await exportar(db, new Date(T))).toEqual(antes);
    // actualizadoEn is kept as it was, not re-stamped.
    expect(antes.datos.insumos[0].actualizadoEn).toBe(T);
  });

  it('exports every data store with format, version and date', async () => {
    const db = await fresh();
    await sembrar(db);
    const b = await exportar(db, new Date(T));
    expect(b.formato).toBe(FORMATO);
    expect(b.version).toBe(VERSION);
    expect(b.exportadoEn).toBe(T);
    expect(Object.keys(b.datos).sort()).toEqual([...STORES].sort());
    expect(contarBackup(b)).toEqual({ insumos: 1, recetas: 1, recetaLineas: 2, productos: 1, movimientos: 3 });
    expect(await contar(db)).toEqual(contarBackup(b));
  });

  it('import replaces existing data instead of merging', async () => {
    const db = await fresh();
    await sembrar(db);
    const otro = backup();
    otro.datos.productos = [{ ...producto, id: 'p2', nombre: 'Aceite' }];
    otro.datos.movimientos = [];
    await importar(db, otro);
    const b = await exportar(db);
    expect(b.datos.productos.map((p) => p.nombre)).toEqual(['Aceite']);
    expect(b.datos.movimientos).toEqual([]);
  });

  it('import is all-or-nothing', async () => {
    const db = await fresh();
    await sembrar(db);
    const roto = backup();
    // Not structured-cloneable: the put fails mid-transaction.
    (roto.datos.productos[0] as unknown as Record<string, unknown>).f = () => {};
    await expect(importar(db, roto)).rejects.toThrow();
    expect(await contar(db)).toEqual(contarBackup(backup()));
  });

  it('import notifies the stock badge and the backup warning, and records the date', async () => {
    const db = await fresh();
    const stock = vi.fn();
    const bk = vi.fn();
    cambiosStock.addEventListener('cambio', stock);
    cambiosBackup.addEventListener('cambio', bk);
    try {
      await importar(db, backup(), new Date(T));
    } finally {
      cambiosStock.removeEventListener('cambio', stock);
      cambiosBackup.removeEventListener('cambio', bk);
    }
    expect(stock).toHaveBeenCalledOnce();
    expect(bk).toHaveBeenCalledOnce();
    expect(await ultimoBackup(db)).toBe(T);
  });

  it('meta is neither exported nor wiped by an import', async () => {
    const db = await fresh();
    await registrarBackup(db, new Date(T));
    const b = await exportar(db);
    expect(Object.keys(b.datos)).not.toContain('meta');
    await importar(db, b, new Date('2026-02-01T00:00:00.000Z'));
    expect(await ultimoBackup(db)).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('leerBackup', () => {
  it('accepts a valid backup', () => {
    const r = leerBackup(json());
    expect(r).toEqual({ ok: true, backup: backup() });
  });

  it('rejects malformed JSON and foreign files', () => {
    expect(errores('{nope')).toEqual(['El archivo no es un JSON válido.']);
    expect(errores('[]')).toEqual(['El archivo no es un backup de Mundana.']);
    expect(errores(json((b) => (b.formato = 'otro')))).toEqual(['El archivo no es un backup de Mundana.']);
  });

  it('rejects unknown versions', () => {
    expect(errores(json((b) => (b.version = VERSION + 1)))[0]).toMatch(/versión más nueva/);
    expect(errores(json((b) => (b.version = 0)))).toEqual(['El backup no tiene una versión válida.']);
    expect(errores(json((b) => delete b.version))).toEqual(['El backup no tiene una versión válida.']);
  });

  it('reports missing stores and missing or invalid fields', () => {
    expect(errores(json((b) => delete b.datos))).toContain('Faltan los datos.');
    expect(errores(json((b) => delete b.datos.movimientos))).toEqual(['Movimientos de stock: falta la lista.']);
    expect(errores(json((b) => delete b.exportadoEn))).toEqual(['Falta la fecha de exportación o es inválida.']);
    expect(errores(json((b) => delete b.datos.productos[0].nombre))).toEqual([
      'Productos, registro 1: "nombre" falta o es inválido.',
    ]);
    expect(
      errores(
        json((b) => {
          b.datos.insumos[0].unidadBase = 'kg';
          b.datos.insumos[0].precioCompra = 10.5;
        }),
      ),
    ).toEqual(['Insumos, registro 1: "unidadBase", "precioCompra" falta o es inválido.']);
    expect(errores(json((b) => (b.datos.recetaLineas[0].tipo = 'otro')))).toEqual([
      'Líneas de receta, registro 1: tipo de línea desconocido.',
    ]);
    expect(errores(json((b) => (b.datos.movimientos[0].cantidad = -1)))).toEqual([
      'Movimientos de stock, registro 1: "cantidad" falta o es inválido.',
    ]);
    expect(errores(json((b) => (b.datos.recetas[0] = 'x')))[0]).toBe('Recetas, registro 1: no es un objeto.');
  });

  it('allows optional fields to be absent but not wrong', () => {
    expect(errores(json((b) => (b.datos.productos[0].precioVenta = 1500)))).toEqual([]);
    expect(errores(json((b) => (b.datos.productos[0].precioVenta = '15')))).toHaveLength(1);
    expect(errores(json((b) => (b.datos.movimientos[1].anuladoEn = 'ayer')))).toHaveLength(1);
  });

  it('rejects repeated ids and dangling references', () => {
    expect(errores(json((b) => b.datos.movimientos.push(b.datos.movimientos[0])))).toEqual([
      'Movimientos de stock, registro 4: id repetido (m1).',
    ]);
    expect(errores(json((b) => (b.datos.recetaLineas[0].insumoId = 'nada')))).toEqual([
      'Líneas de receta, registro 1: "insumoId" apunta a un registro que no está en el backup.',
    ]);
    expect(errores(json((b) => (b.datos.productos = [])))).toHaveLength(3);
  });

  it('caps the error list', () => {
    const e = errores(json((b) => (b.datos.movimientos = Array.from({ length: 30 }, () => ({})))));
    expect(e).toHaveLength(21);
    expect(e[20]).toBe('…y 10 errores más.');
  });
});

describe('último backup', () => {
  it('is recorded and read back', async () => {
    const db = await fresh();
    expect(await ultimoBackup(db)).toBeUndefined();
    await registrarBackup(db, new Date(T));
    expect(await ultimoBackup(db)).toBe(T);
  });

  it('counts whole days', () => {
    const ahora = new Date('2026-01-08T12:00:00.000Z');
    expect(diasDesde(undefined, ahora)).toBeUndefined();
    expect(diasDesde('2026-01-08T00:00:00.000Z', ahora)).toBe(0);
    expect(diasDesde(T, ahora)).toBe(7);
  });

  it('warns after more than 7 days, or never, but only with data', () => {
    const ahora = new Date('2026-01-08T12:00:00.000Z');
    expect(backupVencido(T, true, ahora)).toBe(false);
    expect(backupVencido('2025-12-31T00:00:00.000Z', true, ahora)).toBe(true);
    expect(backupVencido(undefined, true, ahora)).toBe(true);
    expect(backupVencido(undefined, false, ahora)).toBe(false);
  });
});

describe('nombreArchivo', () => {
  it('uses the local date', () => {
    expect(nombreArchivo(new Date(2026, 2, 5, 23, 59))).toBe('mundana-2026-03-05.json');
    expect(nombreArchivo(new Date(2026, 11, 31), 'antes-de-importar')).toBe('mundana-2026-12-31-antes-de-importar.json');
    expect(nombreArchivo(new Date(2026, 0, 2), 'productos', 'csv')).toBe('mundana-2026-01-02-productos.csv');
  });
});
