// Persistence for the stock module, on top of db.ts.

import { porNombre } from '../lib/campos';
import { idbRequest as req, newId, type DB } from '../lib/db';
import { alertas, porFecha, stockPorProducto, type Alerta } from './logic';
import type { Movimiento, Producto, Venta } from './types';
import type { DatosMovimiento, DatosVenta } from './validar';
import { agruparVentas, SIN_PRECIO, type VentaConLineas } from './ventas';

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

export class ProductoEnVentas extends Error {
  constructor(readonly ventas: number) {
    super(
      `No se puede borrar: está en ${ventas === 1 ? 'una venta' : `${ventas} ventas`}. ` +
        'Desmarcalo como activo en lugar de borrarlo.',
    );
  }
}

/** How many sales (voided ones included) have a line of this product. */
export async function ventasConProducto(db: DB, productoId: string): Promise<number> {
  const movs = await movimientosDe(db, productoId);
  return new Set(movs.flatMap((m) => (m.ventaId ? [m.ventaId] : []))).size;
}

/**
 * Deletes a product and all its movements atomically.
 * Throws ProductoEnVentas (and deletes nothing) if it is in a sale, even a voided one.
 */
export async function borrarProducto(db: DB, id: string): Promise<void> {
  await db.tx(['productos', 'movimientos'], 'readwrite', async (tx) => {
    const movs = tx.objectStore('movimientos');
    const suyos = await req<Movimiento[]>(movs.index('productoId').getAll(id));
    const ventas = new Set(suyos.flatMap((m) => (m.ventaId ? [m.ventaId] : [])));
    if (ventas.size) throw new ProductoEnVentas(ventas.size);
    for (const m of suyos) await req(movs.delete(m.id));
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
    if (m.ventaId) throw new Error('El movimiento es parte de una venta: anulá la venta completa');
    if (m.anuladoEn) throw new Error('El movimiento ya estaba anulado');
    const ahora = new Date().toISOString();
    const anulado: Movimiento = { ...m, anuladoEn: ahora, actualizadoEn: ahora };
    await req(store.put(anulado));
    return anulado;
  });
  avisar();
  return r;
}

/** Every sale with its lines, newest first. */
export function listarVentas(db: DB): Promise<VentaConLineas[]> {
  return db.tx(['ventas', 'movimientos'], 'readonly', async (tx) => {
    const ventas = await req<Venta[]>(tx.objectStore('ventas').getAll());
    const lineas = await req<Movimiento[]>(tx.objectStore('movimientos').index('ventaId').getAll());
    return agruparVentas(ventas, lineas);
  });
}

/**
 * Records a sale dated now: the sale and one 'venta' movement per line, atomically.
 * Each line takes the product's current sale price; fails if a product is missing or has none.
 */
export async function registrarVenta(
  db: DB,
  lineas: readonly { productoId: string; cantidad: number }[],
  datos: DatosVenta,
  fecha = new Date(),
): Promise<VentaConLineas> {
  if (!lineas.length) throw new Error('La venta no tiene productos');
  const ahora = new Date().toISOString();
  const venta: Venta = { ...datos, id: newId(), actualizadoEn: ahora, fecha: fecha.toISOString() };
  const r = await db.tx(['productos', 'ventas', 'movimientos'], 'readwrite', async (tx) => {
    const movs: Movimiento[] = [];
    for (const l of lineas) {
      const p = await req<Producto | undefined>(tx.objectStore('productos').get(l.productoId));
      if (!p) throw new Error('Uno de los productos ya no existe');
      if (p.precioVenta === undefined) throw new Error(`${p.nombre}: ${SIN_PRECIO}`);
      if (!(l.cantidad > 0)) throw new Error(`${p.nombre}: la cantidad debe ser mayor que 0`);
      movs.push({
        id: newId(),
        actualizadoEn: ahora,
        productoId: p.id,
        tipo: 'venta',
        cantidad: l.cantidad,
        fecha: venta.fecha,
        ventaId: venta.id,
        precioUnitario: p.precioVenta,
      });
    }
    await req(tx.objectStore('ventas').put(venta));
    for (const m of movs) await req(tx.objectStore('movimientos').put(m));
    return { venta, lineas: movs };
  });
  avisar();
  return r;
}

/** Voids a sale and all its lines together: they stay in the history but no longer count. */
export async function anularVenta(db: DB, id: string): Promise<VentaConLineas> {
  const r = await db.tx(['ventas', 'movimientos'], 'readwrite', async (tx) => {
    const ventas = tx.objectStore('ventas');
    const v = await req<Venta | undefined>(ventas.get(id));
    if (!v) throw new Error('La venta no existe');
    if (v.anuladoEn) throw new Error('La venta ya estaba anulada');
    const ahora = new Date().toISOString();
    const venta: Venta = { ...v, anuladoEn: ahora, actualizadoEn: ahora };
    await req(ventas.put(venta));
    const movs = tx.objectStore('movimientos');
    const lineas: Movimiento[] = [];
    for (const m of await req<Movimiento[]>(movs.index('ventaId').getAll(id))) {
      const anulado: Movimiento = m.anuladoEn ? m : { ...m, anuladoEn: ahora, actualizadoEn: ahora };
      await req(movs.put(anulado));
      lineas.push(anulado);
    }
    return { venta, lineas };
  });
  avisar();
  return r;
}
