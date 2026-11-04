import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Insumo, LineaCostoFijo, LineaInsumo, PrecioHistorico, Receta } from '../costos/types';
import { cambiosStock } from '../stock/repo';
import type { Categoria, Movimiento, OperacionProveedor, Producto, Promo, Proveedor, Venta } from '../stock/types';
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
const precio: PrecioHistorico = { id: 'h1', actualizadoEn: T, insumoId: 'i1', fecha: T, unidadBase: 'g', costoPorUnidadBase: 100 };
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
const producto: Producto = { id: 'p1', actualizadoEn: T, nombre: 'Miel', unidad: 'frasco', stockMinimo: 2, costo: 120000, activo: true, proveedorId: 'pv1', categoriaId: 'c1' };
const categoria: Categoria = { id: 'c1', actualizadoEn: T, nombre: 'Almacén' };
const proveedor: Proveedor = { id: 'pv1', actualizadoEn: T, nombre: 'Apícola Sur', plazoDias: 15, activo: true, telefono: '099 123 456', rut: '21', cuenta: '001-2' };
const operaciones: OperacionProveedor[] = [
  { id: 'o1', actualizadoEn: T, proveedorId: 'pv1', tipo: 'compra', importe: 500000, fecha: T, nota: 'factura 12' },
  { id: 'o2', actualizadoEn: T, proveedorId: 'pv1', tipo: 'pago', importe: 200000, fecha: T, medioPago: 'transferencia' },
  { id: 'o3', actualizadoEn: T, proveedorId: 'pv1', tipo: 'ajuste', importe: -1000, fecha: T, anuladoEn: T },
];
const movs: Movimiento[] = [
  { id: 'm1', actualizadoEn: T, productoId: 'p1', tipo: 'entrada', cantidad: 10, fecha: T },
  { id: 'm2', actualizadoEn: T, productoId: 'p1', tipo: 'venta', cantidad: 3, fecha: T, nota: 'feria', anuladoEn: T },
  { id: 'm3', actualizadoEn: T, productoId: 'p1', tipo: 'ajuste', cantidad: -1.5, fecha: T },
  { id: 'm4', actualizadoEn: T, productoId: 'p1', tipo: 'venta', cantidad: 2, fecha: T, ventaId: 'v1', precioUnitario: 150000 },
  { id: 'm5', actualizadoEn: T, productoId: 'p1', tipo: 'venta', cantidad: 2, fecha: T, ventaId: 'v1', precioUnitario: 0, promoId: 'pr1' },
  { id: 'm6', actualizadoEn: T, productoId: 'p1', tipo: 'entrada', cantidad: 5, fecha: T, proveedorId: 'pv1', importe: 600000 },
];
const promo: Promo = { id: 'pr1', actualizadoEn: T, nombre: 'Miel x2', precio: 200000, activo: true, componentes: [{ productoId: 'p1', cantidad: 2 }] };
const venta: Venta = {
  id: 'v1',
  actualizadoEn: T,
  fecha: T,
  descuentoPct: 10,
  nota: 'mostrador',
  promos: [{ promoId: 'pr1', nombre: 'Miel x2', precio: 200000, cantidad: 1 }],
};

const backup = (): Backup => ({
  formato: FORMATO,
  version: VERSION,
  exportadoEn: T,
  datos: {
    insumos: [structuredClone(insumo)],
    historialPrecios: [structuredClone(precio)],
    recetas: [structuredClone(receta)],
    recetaLineas: [structuredClone(lineaInsumo), structuredClone(lineaFija)],
    productos: [structuredClone(producto)],
    promos: [structuredClone(promo)],
    ventas: [structuredClone(venta)],
    movimientos: structuredClone(movs),
    proveedores: [structuredClone(proveedor)],
    operacionesProveedor: structuredClone(operaciones),
    categorias: [structuredClone(categoria)],
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
    await importar(db, { ...backup(), datos: { insumos: [], historialPrecios: [], recetas: [], recetaLineas: [], productos: [], promos: [], ventas: [], movimientos: [], proveedores: [], operacionesProveedor: [], categorias: [] } });
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
    expect(contarBackup(b)).toEqual({
      insumos: 1,
      historialPrecios: 1,
      recetas: 1,
      recetaLineas: 2,
      proveedores: 1,
      categorias: 1,
      productos: 1,
      promos: 1,
      ventas: 1,
      movimientos: 6,
      operacionesProveedor: 3,
    });
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
    expect(errores('[]')).toEqual(['El archivo no es un backup de Ona.']);
    expect(errores(json((b) => (b.formato = 'otro')))).toEqual(['El archivo no es un backup de Ona.']);
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
    // Products saved before the sale price became required may lack it.
    expect(backup().datos.productos[0].precioVenta).toBeUndefined();
    expect(errores(json((b) => (b.datos.productos[0].precioVenta = 1500)))).toEqual([]);
    expect(errores(json((b) => (b.datos.productos[0].precioVenta = '15')))).toHaveLength(1);
    expect(errores(json((b) => (b.datos.productos[0].costo = 900)))).toEqual([]);
    expect(errores(json((b) => (b.datos.productos[0].costo = -1)))).toHaveLength(1);
    expect(errores(json((b) => (b.datos.productos[0].costo = 9.5)))).toHaveLength(1);
    expect(errores(json((b) => (b.datos.movimientos[1].anuladoEn = 'ayer')))).toHaveLength(1);
  });

  it('rejects repeated ids and dangling references', () => {
    expect(errores(json((b) => b.datos.movimientos.push(b.datos.movimientos[0])))).toEqual([
      'Movimientos de stock, registro 7: id repetido (m1).',
    ]);
    expect(errores(json((b) => (b.datos.recetaLineas[0].insumoId = 'nada')))).toEqual([
      'Líneas de receta, registro 1: "insumoId" apunta a un registro que no está en el backup.',
    ]);
    // 6 movements and the promo's component.
    expect(errores(json((b) => (b.datos.productos = [])))).toHaveLength(7);
    expect(errores(json((b) => (b.datos.proveedores = [])))).toEqual([
      'Productos, registro 1: "proveedorId" apunta a un registro que no está en el backup.',
      'Movimientos de stock, registro 6: "proveedorId" apunta a un registro que no está en el backup.',
      'Operaciones con proveedores, registro 1: "proveedorId" apunta a un registro que no está en el backup.',
      'Operaciones con proveedores, registro 2: "proveedorId" apunta a un registro que no está en el backup.',
      'Operaciones con proveedores, registro 3: "proveedorId" apunta a un registro que no está en el backup.',
    ]);
    expect(errores(json((b) => (b.datos.ventas = [])))).toEqual([
      'Movimientos de stock, registro 4: "ventaId" apunta a un registro que no está en el backup.',
      'Movimientos de stock, registro 5: "ventaId" apunta a un registro que no está en el backup.',
    ]);
  });

  it('upgrades version 1 files, which had no price history nor sales', () => {
    const sinVentas = (b: Record<string, any>) => {
      delete b.datos.ventas;
      b.datos.movimientos = b.datos.movimientos.filter((m: Movimiento) => !m.ventaId);
    };
    const r = leerBackup(
      json((b) => {
        b.version = 1;
        delete b.datos.historialPrecios;
        sinVentas(b);
      }),
    );
    const esperado = backup();
    esperado.datos.historialPrecios = [];
    esperado.datos.ventas = [];
    esperado.datos.movimientos = esperado.datos.movimientos.filter((m) => !m.ventaId);
    expect(r).toEqual({ ok: true, backup: esperado });
    // From version 2 on the list is required.
    expect(errores(json((b) => delete b.datos.historialPrecios))).toEqual(['Historial de precios: falta la lista.']);
  });

  it('upgrades version 2 files, which had no sales', () => {
    const r = leerBackup(
      json((b) => {
        b.version = 2;
        delete b.datos.ventas;
        b.datos.movimientos = b.datos.movimientos.filter((m: Movimiento) => !m.ventaId);
      }),
    );
    expect(r.ok && r.backup.version).toBe(VERSION);
    expect(r.ok && r.backup.datos.ventas).toEqual([]);
    // From version 3 on the list is required.
    expect(errores(json((b) => delete b.datos.ventas))).toContain('Ventas: falta la lista.');
  });

  it('upgrades version 3 files, which had no promos', () => {
    const r = leerBackup(
      json((b) => {
        b.version = 3;
        delete b.datos.promos;
        delete b.datos.ventas[0].promos;
        b.datos.movimientos = b.datos.movimientos.filter((m: Movimiento) => !m.promoId);
      }),
    );
    expect(r.ok && r.backup.version).toBe(VERSION);
    expect(r.ok && r.backup.datos.promos).toEqual([]);
    // From version 4 on the list is required.
    expect(errores(json((b) => delete b.datos.promos))).toContain('Promos: falta la lista.');
  });

  it('upgrades version 4 files, which had no suppliers', () => {
    const r = leerBackup(
      json((b) => {
        b.version = 4;
        delete b.datos.proveedores;
        delete b.datos.operacionesProveedor;
        delete b.datos.productos[0].proveedorId;
        b.datos.movimientos = b.datos.movimientos.filter((m: Movimiento) => !m.proveedorId);
      }),
    );
    expect(r.ok && r.backup.version).toBe(VERSION);
    expect(r.ok && r.backup.datos.proveedores).toEqual([]);
    expect(r.ok && r.backup.datos.operacionesProveedor).toEqual([]);
    // From version 5 on the lists are required.
    expect(errores(json((b) => delete b.datos.proveedores))).toContain('Proveedores: falta la lista.');
    expect(errores(json((b) => delete b.datos.operacionesProveedor))).toContain('Operaciones con proveedores: falta la lista.');
  });

  it('upgrades version 5 files, which had no categories', () => {
    const r = leerBackup(
      json((b) => {
        b.version = 5;
        delete b.datos.categorias;
        delete b.datos.productos[0].categoriaId;
      }),
    );
    expect(r.ok && r.backup.version).toBe(VERSION);
    expect(r.ok && r.backup.datos.categorias).toEqual([]);
    // From version 6 on the list is required.
    expect(errores(json((b) => delete b.datos.categorias))).toContain('Categorías: falta la lista.');
  });

  it('checks categories and the products that refer to them', () => {
    expect(errores(json((b) => (b.datos.categorias[0].nombre = 3)))).toEqual(['Categorías, registro 1: "nombre" falta o es inválido.']);
    expect(errores(json((b) => (b.datos.productos[0].categoriaId = 7)))).toEqual(['Productos, registro 1: "categoriaId" falta o es inválido.']);
    expect(errores(json((b) => (b.datos.categorias = [])))).toEqual([
      'Productos, registro 1: "categoriaId" apunta a un registro que no está en el backup.',
    ]);
    // Products without a category (saved before categories existed) are fine.
    expect(errores(json((b) => delete b.datos.productos[0].categoriaId))).toEqual([]);
  });

  it('checks suppliers, their account entries and the entries that add to an account', () => {
    const campo = (store: string, i: number, k: string) => `${store}, registro ${i}: "${k}" falta o es inválido.`;
    expect(errores(json((b) => (b.datos.proveedores[0].plazoDias = 1.5)))).toEqual([campo('Proveedores', 1, 'plazoDias')]);
    expect(errores(json((b) => (b.datos.proveedores[0].rut = 21)))).toEqual([campo('Proveedores', 1, 'rut')]);
    const ops = 'Operaciones con proveedores';
    expect(errores(json((b) => (b.datos.operacionesProveedor[0].importe = 0)))).toEqual([campo(ops, 1, 'importe')]);
    expect(errores(json((b) => (b.datos.operacionesProveedor[0].importe = 10.5)))).toEqual([campo(ops, 1, 'importe')]);
    expect(errores(json((b) => (b.datos.operacionesProveedor[1].importe = -5)))).toEqual([campo(ops, 2, 'importe')]);
    expect(errores(json((b) => (b.datos.operacionesProveedor[2].importe = 0)))).toEqual([campo(ops, 3, 'importe')]);
    expect(errores(json((b) => (b.datos.operacionesProveedor[0].tipo = 'regalo')))).toEqual([campo(ops, 1, 'tipo')]);
    // A payment has a known method; nothing else has one.
    expect(errores(json((b) => delete b.datos.operacionesProveedor[1].medioPago))).toEqual([campo(ops, 2, 'medioPago')]);
    expect(errores(json((b) => (b.datos.operacionesProveedor[1].medioPago = 'bitcoin')))).toEqual([campo(ops, 2, 'medioPago')]);
    expect(errores(json((b) => (b.datos.operacionesProveedor[0].medioPago = 'efectivo')))).toEqual([campo(ops, 1, 'medioPago')]);
    // proveedorId and importe go together, and only on an entrada.
    const movs = 'Movimientos de stock';
    expect(errores(json((b) => delete b.datos.movimientos[5].importe))).toEqual([campo(movs, 6, 'importe')]);
    expect(errores(json((b) => delete b.datos.movimientos[5].proveedorId))).toEqual([campo(movs, 6, 'proveedorId')]);
    expect(errores(json((b) => (b.datos.movimientos[2].importe = 100)))).toEqual([campo(movs, 3, 'importe')]);
  });

  it('checks promos, the promos of a sale and their components', () => {
    expect(errores(json((b) => (b.datos.promos[0].componentes = [])))).toEqual(['Promos, registro 1: "componentes" falta o es inválido.']);
    expect(errores(json((b) => (b.datos.promos[0].componentes[0].cantidad = 0)))).toEqual([
      'Promos, registro 1: "componentes" falta o es inválido.',
    ]);
    expect(errores(json((b) => b.datos.promos[0].componentes.push({ productoId: 'p1', cantidad: 1 })))).toEqual([
      'Promos, registro 1: "componentes" falta o es inválido.',
    ]);
    expect(errores(json((b) => (b.datos.promos[0].componentes[0].productoId = 'nada')))).toEqual([
      'Promos, registro 1: "componentes" apunta a un registro que no está en el backup.',
    ]);
    expect(errores(json((b) => (b.datos.ventas[0].promos[0].precio = 1.5)))).toEqual(['Ventas, registro 1: "promos" falta o es inválido.']);
    expect(errores(json((b) => b.datos.ventas[0].promos.push(b.datos.ventas[0].promos[0])))).toEqual([
      'Ventas, registro 1: "promos" falta o es inválido.',
    ]);
    // Deleting the promo leaves the sale and the movement pointing to nothing.
    expect(errores(json((b) => (b.datos.promos = [])))).toEqual([
      'Ventas, registro 1: "promos" apunta a un registro que no está en el backup.',
    ]);
  });

  it('checks the movements of a promo', () => {
    expect(errores(json((b) => (b.datos.movimientos[4].precioUnitario = 100)))).toEqual([
      'Movimientos de stock, registro 5: "precioUnitario" falta o es inválido.',
    ]);
    expect(errores(json((b) => delete b.datos.movimientos[4].ventaId))).toEqual([
      'Movimientos de stock, registro 5: "ventaId" falta o es inválido.',
    ]);
    expect(errores(json((b) => delete b.datos.ventas[0].promos))).toEqual([
      'Movimientos de stock, registro 5: "promoId" no es una promo de su venta.',
    ]);
  });

  it('checks sales and their lines', () => {
    expect(errores(json((b) => (b.datos.ventas[0].descuentoPct = 101)))).toEqual([
      'Ventas, registro 1: "descuentoPct" falta o es inválido.',
    ]);
    expect(errores(json((b) => delete b.datos.ventas[0].nota))).toEqual([]);
    expect(errores(json((b) => (b.datos.ventas[0].anuladoEn = 'nunca')))).toHaveLength(1);
    // A sale line must be a 'venta' with its unit price; other movements may lack a price.
    expect(errores(json((b) => delete b.datos.movimientos[3].precioUnitario))).toEqual([
      'Movimientos de stock, registro 4: "precioUnitario" falta o es inválido.',
    ]);
    expect(errores(json((b) => (b.datos.movimientos[3].tipo = 'entrada')))).toEqual([
      'Movimientos de stock, registro 4: "tipo" falta o es inválido.',
    ]);
    expect(errores(json((b) => (b.datos.movimientos[3].precioUnitario = 1.5)))).toHaveLength(1);
  });

  it('checks the price history and its ingredient', () => {
    expect(errores(json((b) => (b.datos.historialPrecios[0].costoPorUnidadBase = -1)))).toEqual([
      'Historial de precios, registro 1: "costoPorUnidadBase" falta o es inválido.',
    ]);
    expect(errores(json((b) => (b.datos.historialPrecios[0].insumoId = 'nada')))).toEqual([
      'Historial de precios, registro 1: "insumoId" apunta a un registro que no está en el backup.',
    ]);
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
    expect(nombreArchivo(new Date(2026, 2, 5, 23, 59))).toBe('ona-2026-03-05.json');
    expect(nombreArchivo(new Date(2026, 11, 31), 'antes-de-importar')).toBe('ona-2026-12-31-antes-de-importar.json');
    expect(nombreArchivo(new Date(2026, 0, 2), 'productos', 'csv')).toBe('ona-2026-01-02-productos.csv');
  });
});
