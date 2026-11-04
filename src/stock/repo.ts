// Persistence for the stock module, on top of db.ts.

import { porNombre } from '../lib/campos';
import { idbRequest as req, newId, type DB } from '../lib/db';
import { alertas, porFecha, stockPorProducto, type Alerta } from './logic';
import { asientos, asientosPorProveedor, avisosPago, type AvisoPago, type Asiento } from './proveedores';
import type { Categoria, Movimiento, OperacionProveedor, Producto, Promo, PromoVendida, Proveedor, Venta } from './types';
import type { DatosMovimiento, DatosOperacion, DatosVenta } from './validar';
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

export class ProductoEnPromos extends Error {
  constructor(readonly promos: readonly string[]) {
    super(
      `No se puede borrar: está en ${promos.length === 1 ? 'la promo' : 'las promos'} ${promos.map((n) => `"${n}"`).join(', ')}. ` +
        'Sacalo de la promo, o desmarcalo como activo en lugar de borrarlo.',
    );
  }
}

const nombresConProducto = (promos: readonly Promo[], productoId: string) =>
  promos.filter((p) => p.componentes.some((c) => c.productoId === productoId)).map((p) => p.nombre);

/** Names of the promos (active or not) that include this product. */
export async function promosConProducto(db: DB, productoId: string): Promise<string[]> {
  return nombresConProducto(await listarPromos(db), productoId);
}

/**
 * Deletes a product and all its movements atomically. Deletes nothing and throws
 * ProductoEnVentas if it is in a sale, even a voided one, or ProductoEnPromos if it is in a promo.
 */
export async function borrarProducto(db: DB, id: string): Promise<void> {
  await db.tx(['productos', 'movimientos', 'promos'], 'readwrite', async (tx) => {
    const movs = tx.objectStore('movimientos');
    const suyos = await req<Movimiento[]>(movs.index('productoId').getAll(id));
    const ventas = new Set(suyos.flatMap((m) => (m.ventaId ? [m.ventaId] : [])));
    if (ventas.size) throw new ProductoEnVentas(ventas.size);
    const promos = nombresConProducto(await req<Promo[]>(tx.objectStore('promos').getAll()), id).sort();
    if (promos.length) throw new ProductoEnPromos(promos);
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

/**
 * Records a movement dated now; fails if the product doesn't exist. An entrada with an `importe`
 * adds to the account of the product's supplier (kept on the movement); fails if it has none.
 */
export async function registrarMovimiento(db: DB, productoId: string, datos: DatosMovimiento, fecha = new Date()): Promise<Movimiento> {
  const ahora = new Date().toISOString();
  const m: Movimiento = { ...datos, id: newId(), actualizadoEn: ahora, productoId, fecha: fecha.toISOString() };
  if (m.importe !== undefined && m.tipo !== 'entrada') throw new Error('Solo una entrada puede sumar a la cuenta del proveedor');
  await db.tx(['productos', 'proveedores', 'movimientos'], 'readwrite', async (tx) => {
    const p = await req<Producto | undefined>(tx.objectStore('productos').get(productoId));
    if (!p) throw new Error('El producto no existe');
    if (m.importe !== undefined) {
      if (!p.proveedorId || !(await req(tx.objectStore('proveedores').count(p.proveedorId)))) {
        throw new Error(`"${p.nombre}" no tiene proveedor: no puede sumar a ninguna cuenta`);
      }
      m.proveedorId = p.proveedorId;
    }
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

/** Deletes a voided movement for good. It no longer counted, so the stock doesn't change. */
export async function borrarMovimiento(db: DB, id: string): Promise<void> {
  await db.tx('movimientos', 'readwrite', async (tx) => {
    const store = tx.objectStore('movimientos');
    const m = await req<Movimiento | undefined>(store.get(id));
    if (!m) throw new Error('El movimiento no existe');
    if (m.ventaId) throw new Error('El movimiento es parte de una venta: borrá la venta completa');
    if (!m.anuladoEn) throw new Error('Solo se puede borrar un movimiento anulado');
    await req(store.delete(id));
  });
  avisar();
}

/** Every sale with its lines, newest first. */
export function listarVentas(db: DB): Promise<VentaConLineas[]> {
  return db.tx(['ventas', 'movimientos'], 'readonly', async (tx) => {
    const ventas = await req<Venta[]>(tx.objectStore('ventas').getAll());
    const lineas = await req<Movimiento[]>(tx.objectStore('movimientos').index('ventaId').getAll());
    return agruparVentas(ventas, lineas);
  });
}

const redondear = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Records a sale dated now: the sale and one 'venta' movement per line, atomically.
 * Each product line takes the product's current sale price; fails if a product is missing or has none.
 * Each promo line is kept on the sale with the promo's current name and price, and adds one movement
 * per component (price 0, with the promoId); fails if the promo or a component is missing or inactive.
 */
export async function registrarVenta(
  db: DB,
  lineas: readonly { productoId: string; cantidad: number }[],
  datos: DatosVenta,
  fecha = new Date(),
  promos: readonly { promoId: string; cantidad: number }[] = [],
): Promise<VentaConLineas> {
  if (!lineas.length && !promos.length) throw new Error('La venta no tiene productos');
  if (new Set(promos.map((p) => p.promoId)).size !== promos.length) throw new Error('Una promo está repetida en la venta');
  const ahora = new Date().toISOString();
  const venta: Venta = { ...datos, id: newId(), actualizadoEn: ahora, fecha: fecha.toISOString() };
  const r = await db.tx(['productos', 'promos', 'ventas', 'movimientos'], 'readwrite', async (tx) => {
    const movs: Movimiento[] = [];
    const vendidas: PromoVendida[] = [];
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
    for (const l of promos) {
      const promo = await req<Promo | undefined>(tx.objectStore('promos').get(l.promoId));
      if (!promo) throw new Error('Una de las promos ya no existe');
      if (!promo.activo) throw new Error(`La promo "${promo.nombre}" no está activa`);
      if (!(l.cantidad > 0)) throw new Error(`${promo.nombre}: la cantidad debe ser mayor que 0`);
      for (const c of promo.componentes) {
        const p = await req<Producto | undefined>(tx.objectStore('productos').get(c.productoId));
        if (!p) throw new Error(`La promo "${promo.nombre}" incluye un producto que ya no existe`);
        if (!p.activo) throw new Error(`La promo "${promo.nombre}" incluye un producto desactivado: ${p.nombre}`);
        movs.push({
          id: newId(),
          actualizadoEn: ahora,
          productoId: p.id,
          tipo: 'venta',
          cantidad: redondear(c.cantidad * l.cantidad),
          fecha: venta.fecha,
          ventaId: venta.id,
          precioUnitario: 0,
          promoId: promo.id,
        });
      }
      vendidas.push({ promoId: promo.id, nombre: promo.nombre, precio: promo.precio, cantidad: l.cantidad });
    }
    if (vendidas.length) venta.promos = vendidas;
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

/**
 * Deletes a voided sale and all its lines together, for good. They no longer counted, so neither
 * the stock nor the sales totals change.
 */
export async function borrarVenta(db: DB, id: string): Promise<void> {
  await db.tx(['ventas', 'movimientos'], 'readwrite', async (tx) => {
    const ventas = tx.objectStore('ventas');
    const v = await req<Venta | undefined>(ventas.get(id));
    if (!v) throw new Error('La venta no existe');
    if (!v.anuladoEn) throw new Error('Solo se puede borrar una venta anulada');
    const movs = tx.objectStore('movimientos');
    for (const k of await req<IDBValidKey[]>(movs.index('ventaId').getAllKeys(id))) await req(movs.delete(k));
    await req(ventas.delete(id));
  });
  avisar();
}

// --- Categories ---

export async function listarCategorias(db: DB): Promise<Categoria[]> {
  return (await db.list<Categoria>('categorias')).sort(porNombre);
}

export function guardarCategoria(db: DB, c: Categoria): Promise<Categoria> {
  return db.put('categorias', c);
}

export class CategoriaEnUso extends Error {
  constructor(readonly productos: number) {
    super(
      `No se puede borrar: tiene ${productos === 1 ? 'un producto' : `${productos} productos`}. ` +
        'Pasalos a otra categoría antes de borrarla.',
    );
  }
}

/** How many products (active or not) are in this category. */
export function productosEnCategoria(db: DB, categoriaId: string): Promise<number> {
  return db.tx('productos', 'readonly', (tx) => req(tx.objectStore('productos').index('categoriaId').count(categoriaId)));
}

/** Deletes a category; throws CategoriaEnUso (and deletes nothing) if some product is in it. */
export async function borrarCategoria(db: DB, id: string): Promise<void> {
  await db.tx(['productos', 'categorias'], 'readwrite', async (tx) => {
    const n = await req(tx.objectStore('productos').index('categoriaId').count(id));
    if (n) throw new CategoriaEnUso(n);
    await req(tx.objectStore('categorias').delete(id));
  });
}

// --- Promos ---

export async function listarPromos(db: DB): Promise<Promo[]> {
  return (await db.list<Promo>('promos')).sort(porNombre);
}

export function obtenerPromo(db: DB, id: string): Promise<Promo | undefined> {
  return db.get<Promo>('promos', id);
}

/** Stores a promo (stamping `actualizadoEn`); fails if one of its products doesn't exist. */
export async function guardarPromo(db: DB, p: Promo): Promise<Promo> {
  const r: Promo = { ...p, actualizadoEn: new Date().toISOString() };
  await db.tx(['productos', 'promos'], 'readwrite', async (tx) => {
    for (const c of r.componentes) {
      if (!(await req(tx.objectStore('productos').count(c.productoId)))) throw new Error('Uno de los productos de la promo ya no existe');
    }
    await req(tx.objectStore('promos').put(r));
  });
  return r;
}

export class PromoEnVentas extends Error {
  constructor(readonly ventas: number) {
    super(
      `No se puede borrar: se vendió en ${ventas === 1 ? 'una venta' : `${ventas} ventas`}. ` +
        'Desmarcala como activa en lugar de borrarla.',
    );
  }
}

const vendidaEn = (ventas: readonly Venta[], promoId: string) => ventas.filter((v) => v.promos?.some((p) => p.promoId === promoId)).length;

/** How many sales (voided ones included) have this promo. */
export async function ventasConPromo(db: DB, promoId: string): Promise<number> {
  return vendidaEn(await db.list<Venta>('ventas'), promoId);
}

/** Deletes a promo; throws PromoEnVentas (and deletes nothing) if it was sold, even in a voided sale. */
export async function borrarPromo(db: DB, id: string): Promise<void> {
  await db.tx(['ventas', 'promos'], 'readwrite', async (tx) => {
    const n = vendidaEn(await req<Venta[]>(tx.objectStore('ventas').getAll()), id);
    if (n) throw new PromoEnVentas(n);
    await req(tx.objectStore('promos').delete(id));
  });
}

// --- Suppliers ---

export async function listarProveedores(db: DB): Promise<Proveedor[]> {
  return (await db.list<Proveedor>('proveedores')).sort(porNombre);
}

export function obtenerProveedor(db: DB, id: string): Promise<Proveedor | undefined> {
  return db.get<Proveedor>('proveedores', id);
}

export async function guardarProveedor(db: DB, p: Proveedor): Promise<Proveedor> {
  const r = await db.put('proveedores', p);
  avisar();
  return r;
}

/** The account lines of one supplier, oldest first. */
export function cuentaDe(db: DB, proveedorId: string): Promise<Asiento[]> {
  return db.tx(['operacionesProveedor', 'movimientos'], 'readonly', async (tx) => {
    const ops = await req<OperacionProveedor[]>(tx.objectStore('operacionesProveedor').index('proveedorId').getAll(proveedorId));
    const movs = await req<Movimiento[]>(tx.objectStore('movimientos').index('proveedorId').getAll(proveedorId));
    return asientos(ops, movs);
  });
}

/** The account lines of every supplier, by supplier id (suppliers without any are missing). */
export function cuentas(db: DB): Promise<Map<string, Asiento[]>> {
  return db.tx(['operacionesProveedor', 'movimientos'], 'readonly', async (tx) => {
    const ops = await req<OperacionProveedor[]>(tx.objectStore('operacionesProveedor').getAll());
    const movs = await req<Movimiento[]>(tx.objectStore('movimientos').index('proveedorId').getAll());
    return asientosPorProveedor(ops, movs);
  });
}

export async function cargarAvisosPago(db: DB, ahora = new Date()): Promise<AvisoPago[]> {
  const [proveedores, porProveedor] = await Promise.all([listarProveedores(db), cuentas(db)]);
  return avisosPago(proveedores, porProveedor, ahora);
}

/** Records a manual account entry dated now; fails if the supplier doesn't exist. */
export async function registrarOperacion(db: DB, proveedorId: string, datos: DatosOperacion, fecha = new Date()): Promise<OperacionProveedor> {
  const ahora = new Date().toISOString();
  const o: OperacionProveedor = { ...datos, id: newId(), actualizadoEn: ahora, proveedorId, fecha: fecha.toISOString() };
  await db.tx(['proveedores', 'operacionesProveedor'], 'readwrite', async (tx) => {
    if (!(await req(tx.objectStore('proveedores').count(proveedorId)))) throw new Error('El proveedor no existe');
    await req(tx.objectStore('operacionesProveedor').put(o));
  });
  avisar();
  return o;
}

/** Voids an account entry: it stays in the account but no longer counts. */
export async function anularOperacion(db: DB, id: string): Promise<OperacionProveedor> {
  const r = await db.tx('operacionesProveedor', 'readwrite', async (tx) => {
    const store = tx.objectStore('operacionesProveedor');
    const o = await req<OperacionProveedor | undefined>(store.get(id));
    if (!o) throw new Error('La operación no existe');
    if (o.anuladoEn) throw new Error('La operación ya estaba anulada');
    const ahora = new Date().toISOString();
    const anulada: OperacionProveedor = { ...o, anuladoEn: ahora, actualizadoEn: ahora };
    await req(store.put(anulada));
    return anulada;
  });
  avisar();
  return r;
}

/** Deletes a voided account entry for good. It no longer counted, so the balance doesn't change. */
export async function borrarOperacion(db: DB, id: string): Promise<void> {
  await db.tx('operacionesProveedor', 'readwrite', async (tx) => {
    const store = tx.objectStore('operacionesProveedor');
    const o = await req<OperacionProveedor | undefined>(store.get(id));
    if (!o) throw new Error('La operación no existe');
    if (!o.anuladoEn) throw new Error('Solo se puede borrar una operación anulada');
    await req(store.delete(id));
  });
  avisar();
}

export class ProveedorEnUso extends Error {
  constructor() {
    super('No se puede borrar: tiene productos o movimientos en su cuenta. Desmarcalo como activo en lugar de borrarlo.');
  }
}

/** Deletes a supplier; throws ProveedorEnUso (and deletes nothing) if a product or an account line refers to it. */
export async function borrarProveedor(db: DB, id: string): Promise<void> {
  await db.tx(['productos', 'operacionesProveedor', 'movimientos', 'proveedores'], 'readwrite', async (tx) => {
    const productos = await req<Producto[]>(tx.objectStore('productos').getAll());
    const ops = await req(tx.objectStore('operacionesProveedor').index('proveedorId').count(id));
    const movs = await req(tx.objectStore('movimientos').index('proveedorId').count(id));
    if (ops || movs || productos.some((p) => p.proveedorId === id)) throw new ProveedorEnUso();
    await req(tx.objectStore('proveedores').delete(id));
  });
  avisar();
}
