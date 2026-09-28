import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId, openDB, type DB } from '../lib/db';
import {
  anularMovimiento,
  borrarProducto,
  cambiosStock,
  cargarAlertas,
  contarMovimientos,
  guardarProducto,
  listarMovimientos,
  listarProductos,
  movimientosDe,
  registrarMovimiento,
  stockActualDe,
} from './repo';
import type { Producto } from './types';

let n = 0;
const open: DB[] = [];

async function fresh(): Promise<DB> {
  const db = await openDB(`stock-${n++}`);
  open.push(db);
  return db;
}

afterEach(() => {
  open.splice(0).forEach((db) => db.close());
});

const producto = (nombre: string, stockMinimo = 0): Producto => ({
  id: newId(),
  actualizadoEn: '',
  nombre,
  unidad: 'u',
  stockMinimo,
  activo: true,
});

const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));

describe('productos', () => {
  it('lists sorted by name', async () => {
    const db = await fresh();
    for (const nombre of ['vino', 'Aceite', 'miel']) await guardarProducto(db, producto(nombre));
    expect((await listarProductos(db)).map((p) => p.nombre)).toEqual(['Aceite', 'miel', 'vino']);
  });

  it('deletes a product with its movements only', async () => {
    const db = await fresh();
    const vino = await guardarProducto(db, producto('vino'));
    const miel = await guardarProducto(db, producto('miel'));
    await registrarMovimiento(db, vino.id, { tipo: 'entrada', cantidad: 5 });
    await registrarMovimiento(db, vino.id, { tipo: 'venta', cantidad: 1 });
    const queda = await registrarMovimiento(db, miel.id, { tipo: 'entrada', cantidad: 2 });
    expect(await contarMovimientos(db, vino.id)).toBe(2);
    await borrarProducto(db, vino.id);
    expect((await listarProductos(db)).map((p) => p.nombre)).toEqual(['miel']);
    expect((await listarMovimientos(db)).map((m) => m.id)).toEqual([queda.id]);
  });
});

describe('movimientos', () => {
  it('computes stock from movements, newest first', async () => {
    const db = await fresh();
    const vino = await guardarProducto(db, producto('vino'));
    const a = await registrarMovimiento(db, vino.id, { tipo: 'entrada', cantidad: 10 }, t(1));
    const b = await registrarMovimiento(db, vino.id, { tipo: 'venta', cantidad: 3, nota: 'fiado' }, t(2));
    expect(b).toMatchObject({ productoId: vino.id, tipo: 'venta', cantidad: 3, nota: 'fiado', fecha: t(2).toISOString() });
    expect((await listarMovimientos(db)).map((m) => m.id)).toEqual([b.id, a.id]);
    expect(await movimientosDe(db, vino.id)).toHaveLength(2);
    expect((await stockActualDe(db)).get(vino.id)).toBe(7);
  });

  it('refuses movements for unknown products', async () => {
    const db = await fresh();
    await expect(registrarMovimiento(db, 'nada', { tipo: 'entrada', cantidad: 1 })).rejects.toThrow('no existe');
    expect(await listarMovimientos(db)).toEqual([]);
  });

  it('voids a movement once, keeping it in the history', async () => {
    const db = await fresh();
    const vino = await guardarProducto(db, producto('vino'));
    await registrarMovimiento(db, vino.id, { tipo: 'entrada', cantidad: 10 });
    const venta = await registrarMovimiento(db, vino.id, { tipo: 'venta', cantidad: 4 });
    const anulado = await anularMovimiento(db, venta.id);
    expect(anulado.anuladoEn).toBeTruthy();
    expect(await movimientosDe(db, vino.id)).toHaveLength(2);
    expect((await stockActualDe(db)).get(vino.id)).toBe(10);
    await expect(anularMovimiento(db, venta.id)).rejects.toThrow('ya estaba anulado');
    await expect(anularMovimiento(db, 'nada')).rejects.toThrow('no existe');
  });

  it('reports alerts and notifies changes', async () => {
    const db = await fresh();
    const escucha = vi.fn();
    cambiosStock.addEventListener('cambio', escucha);
    const vino = await guardarProducto(db, producto('vino', 5));
    await guardarProducto(db, producto('miel', 1));
    await registrarMovimiento(db, vino.id, { tipo: 'entrada', cantidad: 6 });
    expect((await cargarAlertas(db)).map((a) => a.producto.nombre)).toEqual(['miel']);
    await registrarMovimiento(db, vino.id, { tipo: 'venta', cantidad: 1 });
    expect((await cargarAlertas(db)).map((a) => [a.producto.nombre, a.nivel])).toEqual([
      ['miel', 'agotado'],
      ['vino', 'bajo'],
    ]);
    cambiosStock.removeEventListener('cambio', escucha);
    expect(escucha).toHaveBeenCalledTimes(4);
  });
});
