// Persistence for the stock module, on top of db.ts.

import { porNombre } from '../lib/campos';
import { idbRequest as req, newId, type DB } from '../lib/db';
import { alertas, porFecha, stockPorProducto, type Alerta } from './logic';
import type { Movimiento, Producto } from './types';
import type { DatosMovimiento } from './validar';

/** Fires 'cambio' after every stock write, so the nav badge can refresh. */
export const cambiosStock = new EventTarget();
const avisar = () => cambiosStock.dispatchEvent(new Event('cambio'));

export async function listarProductos(db: DB): Promise<Producto[]> {
  return (await db.list<Producto>('productos')).sort(porNombre);
}

export function obtenerProducto(db: DB, id: string): Promise<Producto | undefined> {
  return db.get<Producto>('productos', id);
}

export async function guardarProducto(db: DB, p: Producto): Promise<Producto> {
  const r = await db.put('productos', p);
  avisar();
  return r;
}

export function contarMovimientos(db: DB, productoId: string): Promise<number> {
  return db.tx('movimientos', 'readonly', (tx) => req(tx.objectStore('movimientos').index('productoId').count(productoId)));
}

/** Deletes a product and all its movements atomically. */
export async function borrarProducto(db: DB, id: string): Promise<void> {
  await db.tx(['productos', 'movimientos'], 'readwrite', async (tx) => {
    const movs = tx.objectStore('movimientos');
    for (const k of await req(movs.index('productoId').getAllKeys(id))) await req(movs.delete(k));
    await req(tx.objectStore('productos').delete(id));
  });
  avisar();
}

/** All movements, newest first. */
export async function listarMovimientos(db: DB): Promise<Movimiento[]> {
  return (await db.list<Movimiento>('movimientos')).sort(porFecha).reverse();
}

export function movimientosDe(db: DB, productoId: string): Promise<Movimiento[]> {
  return db.listBy<Movimiento>('movimientos', 'productoId', productoId);
}

/** Current stock by product id (products without movements are missing: stock 0). */
export async function stockActualDe(db: DB): Promise<Map<string, number>> {
  return stockPorProducto(await db.list<Movimiento>('movimientos'));
}

export async function cargarAlertas(db: DB): Promise<Alerta[]> {
  const [productos, stock] = await Promise.all([listarProductos(db), stockActualDe(db)]);
  return alertas(productos, stock);
}

/** Records a movement dated now; fails if the product doesn't exist. */
export async function registrarMovimiento(db: DB, productoId: string, datos: DatosMovimiento, fecha = new Date()): Promise<Movimiento> {
  const ahora = new Date().toISOString();
  const m: Movimiento = { ...datos, id: newId(), actualizadoEn: ahora, productoId, fecha: fecha.toISOString() };
  await db.tx(['productos', 'movimientos'], 'readwrite', async (tx) => {
    if (!(await req(tx.objectStore('productos').count(productoId)))) throw new Error('El producto no existe');
    await req(tx.objectStore('movimientos').put(m));
  });
  avisar();
  return m;
}

/** Voids a movement: it stays in the history but no longer counts toward the stock. */
export async function anularMovimiento(db: DB, id: string): Promise<Movimiento> {
  const r = await db.tx('movimientos', 'readwrite', async (tx) => {
    const store = tx.objectStore('movimientos');
    const m = await req<Movimiento | undefined>(store.get(id));
    if (!m) throw new Error('El movimiento no existe');
    if (m.anuladoEn) throw new Error('El movimiento ya estaba anulado');
    const ahora = new Date().toISOString();
    const anulado: Movimiento = { ...m, anuladoEn: ahora, actualizadoEn: ahora };
    await req(store.put(anulado));
    return anulado;
  });
  avisar();
  return r;
}
