// Sales math: pure functions. A sale's lines are 'venta' movements that carry the unit price
// they were sold at, so later price changes don't rewrite past sales. Promos sold are kept on
// the sale with their price; their components are movements with a promoId and price 0.

import { leerNumero, porNombre } from '../lib/campos';
import type { Centavos } from '../lib/money';
import { diaLocal } from '../lib/texto';
import { problemaPromo } from './promos';
import type { Categoria, Movimiento, Producto, Promo, Venta } from './types';

/** A line of the sale being entered. */
export interface LineaEnCurso {
  producto: Producto;
  cantidad: number;
}

/** A promo line of the sale being entered. */
export interface PromoEnCurso {
  promo: Promo;
  cantidad: number;
}

/** A stored sale with its lines (movements). */
export interface VentaConLineas {
  venta: Venta;
  lineas: Movimiento[];
}

export interface Totales {
  subtotal: Centavos; // of the products sold on their own
  descuento: Centavos; // over that subtotal only: promos already have their own price
  promos: Centavos; // of the promos
  total: Centavos;
}

const redondear = (n: number) => Math.round(n * 1e6) / 1e6;

/** Line amount in whole cents (quantities can be decimal, e.g. kg). */
export const importe = (cantidad: number, precioUnitario: Centavos): Centavos => Math.round(cantidad * precioUnitario);

/**
 * subtotal = sum of the product line amounts; descuento = subtotal * % / 100, rounded to cents;
 * promos = sum of precio * cantidad; total = subtotal - descuento + promos.
 */
export function totales(
  lineas: readonly { cantidad: number; precioUnitario: Centavos }[],
  descuentoPct: number,
  promos: readonly { cantidad: number; precio: Centavos }[] = [],
): Totales {
  const subtotal = lineas.reduce((s, l) => s + importe(l.cantidad, l.precioUnitario), 0);
  const descuento = Math.round((subtotal * descuentoPct) / 100);
  const enPromos = promos.reduce((s, p) => s + importe(p.cantidad, p.precio), 0);
  return { subtotal, descuento, promos: enPromos, total: subtotal - descuento + enPromos };
}

export function totalesEnCurso(lineas: readonly LineaEnCurso[], descuentoPct: number, promos: readonly PromoEnCurso[] = []): Totales {
  return totales(
    lineas.map((l) => ({ cantidad: l.cantidad, precioUnitario: l.producto.precioVenta ?? 0 })),
    descuentoPct,
    promos.map((p) => ({ cantidad: p.cantidad, precio: p.promo.precio })),
  );
}

/** Product lines of a stored sale: its movements, minus the promo components (their price is in the promo). */
export const lineasSueltas = (v: VentaConLineas) => v.lineas.filter((m) => m.promoId === undefined);

export function totalesDe(v: VentaConLineas): Totales {
  return totales(
    lineasSueltas(v).map((m) => ({ cantidad: m.cantidad, precioUnitario: m.precioUnitario ?? 0 })),
    v.venta.descuentoPct,
    v.venta.promos ?? [],
  );
}

export const SIN_PRECIO = 'Sin precio: cargalo en el producto';

export type LineaLeida =
  | { ok: true; linea: LineaEnCurso }
  | { ok: false; campo: 'producto' | 'cantidad'; error: string };

/** A line to add from the picker: an active product with a sale price, and a positive quantity (empty = 1). */
export function leerLinea(producto: Producto | undefined, productoTexto: string, cantidad: string): LineaLeida {
  if (!producto) {
    const error = productoTexto.trim() ? 'No hay un único producto activo con ese nombre' : 'Elegí un producto';
    return { ok: false, campo: 'producto', error };
  }
  if (producto.precioVenta === undefined) return { ok: false, campo: 'producto', error: SIN_PRECIO };
  const c = leerNumero(cantidad.trim() || '1', { mayorQue: 0 });
  if (!c.ok) return { ok: false, campo: 'cantidad', error: c.error };
  return { ok: true, linea: { producto, cantidad: c.valor } };
}

export type PromoLeida = { ok: true; linea: PromoEnCurso } | { ok: false; campo: 'producto' | 'cantidad'; error: string };

/** A promo line to add from the picker: every component still active, and a positive quantity (empty = 1). */
export function leerPromo(promo: Promo, cantidad: string, productos: ReadonlyMap<string, Producto>): PromoLeida {
  const problema = problemaPromo(promo, productos);
  if (problema) return { ok: false, campo: 'producto', error: problema };
  const c = leerNumero(cantidad.trim() || '1', { mayorQue: 0 });
  if (!c.ok) return { ok: false, campo: 'cantidad', error: c.error };
  return { ok: true, linea: { promo, cantidad: c.valor } };
}

/** A button in the sale's pick-by-click dialog: a product or a promo, with why it can't be added. */
export type ItemParaElegir =
  | { tipo: 'producto'; producto: Producto; problema?: string }
  | { tipo: 'promo'; promo: Promo; problema?: string };

/** A button of the row above the sale: a category, "Sin categoría" or "Promos", with what it offers. */
export interface GrupoParaElegir {
  clave: string; // the category id, 'sin' or 'promos'
  nombre: string;
  items: ItemParaElegir[];
}

/**
 * The groups to pick sale items by click: one per category with active products (by name), then
 * the active products without a (still existing) category, then the active promos; items by name.
 * Products without a price and promos with a problem are listed with it, to show them disabled.
 */
export function gruposParaElegir(
  productos: readonly Producto[],
  categorias: readonly Categoria[],
  promos: readonly Promo[],
): GrupoParaElegir[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const existe = new Set(categorias.map((c) => c.id));
  const item = (producto: Producto): ItemParaElegir =>
    producto.precioVenta === undefined ? { tipo: 'producto', producto, problema: 'Sin precio' } : { tipo: 'producto', producto };
  const activos = productos.filter((p) => p.activo).sort(porNombre);
  const grupos: GrupoParaElegir[] = [...categorias]
    .sort(porNombre)
    .map((c) => ({ clave: c.id, nombre: c.nombre, items: activos.filter((p) => p.categoriaId === c.id).map(item) }));
  grupos.push({
    clave: 'sin',
    nombre: 'Sin categoría',
    items: activos.filter((p) => !p.categoriaId || !existe.has(p.categoriaId)).map(item),
  });
  grupos.push({
    clave: 'promos',
    nombre: 'Promos',
    items: promos
      .filter((p) => p.activo)
      .sort(porNombre)
      .map((promo) => {
        const problema = problemaPromo(promo, porId);
        return problema ? { tipo: 'promo', promo, problema } : { tipo: 'promo', promo };
      }),
  });
  return grupos.filter((g) => g.items.length);
}

/** Adds a promo line; a promo already in the sale gets the quantity added to its line. */
export function agregarPromo(promos: readonly PromoEnCurso[], nueva: PromoEnCurso): PromoEnCurso[] {
  const i = promos.findIndex((p) => p.promo.id === nueva.promo.id);
  if (i < 0) return [...promos, nueva];
  return promos.map((p, j) => (j === i ? { ...p, cantidad: redondear(p.cantidad + nueva.cantidad) } : p));
}

export function quitarPromo(promos: readonly PromoEnCurso[], promoId: string): PromoEnCurso[] {
  return promos.filter((p) => p.promo.id !== promoId);
}

/** Adds a line; a product already in the sale gets the quantity added to its line. */
export function agregarLinea(lineas: readonly LineaEnCurso[], nueva: LineaEnCurso): LineaEnCurso[] {
  const i = lineas.findIndex((l) => l.producto.id === nueva.producto.id);
  if (i < 0) return [...lineas, nueva];
  return lineas.map((l, j) => (j === i ? { ...l, cantidad: redondear(l.cantidad + nueva.cantidad) } : l));
}

export function quitarLinea(lineas: readonly LineaEnCurso[], productoId: string): LineaEnCurso[] {
  return lineas.filter((l) => l.producto.id !== productoId);
}

/** What the sale takes from each product: its own line plus its share of every promo. */
export function pedidoPorProducto(
  lineas: readonly LineaEnCurso[],
  promos: readonly PromoEnCurso[],
  productos: ReadonlyMap<string, Producto>,
): Map<string, { producto: Producto; cantidad: number }> {
  const pedido = new Map<string, { producto: Producto; cantidad: number }>();
  const sumar = (producto: Producto | undefined, cantidad: number) => {
    if (!producto) return;
    const p = pedido.get(producto.id);
    pedido.set(producto.id, { producto, cantidad: redondear((p?.cantidad ?? 0) + cantidad) });
  };
  for (const l of lineas) sumar(l.producto, l.cantidad);
  for (const p of promos) for (const c of p.promo.componentes) sumar(productos.get(c.productoId), c.cantidad * p.cantidad);
  return pedido;
}

/**
 * Products that would go below zero (only those not already negative, like single movements),
 * counting both product lines and promo components.
 */
export function quedanNegativos(
  lineas: readonly LineaEnCurso[],
  stock: ReadonlyMap<string, number>,
  promos: readonly PromoEnCurso[] = [],
  productos: ReadonlyMap<string, Producto> = new Map(),
): { producto: Producto; despues: number }[] {
  return [...pedidoPorProducto(lineas, promos, productos).values()].flatMap(({ producto, cantidad }) => {
    const actual = stock.get(producto.id) ?? 0;
    const despues = redondear(actual - cantidad);
    return despues < 0 && actual >= 0 ? [{ producto, despues }] : [];
  });
}

/** Newest first; ties broken by id so the order is stable. */
export const ventaMasNueva = (a: VentaConLineas, b: VentaConLineas) =>
  b.venta.fecha.localeCompare(a.venta.fecha) || b.venta.id.localeCompare(a.venta.id);

/** Groups movements into their sales, newest sale first. Movements without a sale are ignored. */
export function agruparVentas(ventas: readonly Venta[], movs: readonly Movimiento[]): VentaConLineas[] {
  const porVenta = new Map<string, VentaConLineas>(ventas.map((venta) => [venta.id, { venta, lineas: [] }]));
  for (const m of movs) if (m.ventaId) porVenta.get(m.ventaId)?.lineas.push(m);
  return [...porVenta.values()].sort(ventaMasNueva);
}

export interface Dia {
  dia: string; // local day, "2026-03-05"
  ventas: VentaConLineas[]; // newest first, voided ones included
  cantidad: number; // sales that count (not voided)
  total: Centavos; // of the sales that count
}

/** Sales by local day, newest day first; voided sales are listed but don't count. */
export function ventasPorDia(ventas: readonly VentaConLineas[]): Dia[] {
  const dias = new Map<string, Dia>();
  for (const v of [...ventas].sort(ventaMasNueva)) {
    const dia = diaLocal(v.venta.fecha);
    let d = dias.get(dia);
    if (!d) dias.set(dia, (d = { dia, ventas: [], cantidad: 0, total: 0 }));
    d.ventas.push(v);
    if (!v.venta.anuladoEn) {
      d.cantidad++;
      d.total += totalesDe(v).total;
    }
  }
  return [...dias.values()].sort((a, b) => b.dia.localeCompare(a.dia));
}

/**
 * Splits `total` (whole cents) in proportion to `pesos`, so the parts add up exactly to it:
 * each part is rounded down and the cents left go to the largest remainders.
 */
export function repartir(total: Centavos, pesos: readonly Centavos[]): Centavos[] {
  const suma = pesos.reduce((s, p) => s + p, 0);
  if (!suma) return pesos.map(() => 0);
  const exactos = pesos.map((p) => (total * p) / suma);
  const partes = exactos.map(Math.floor);
  let resto = total - partes.reduce((s, p) => s + p, 0);
  const orden = exactos.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of orden) {
    if (resto <= 0) break;
    partes[i]++;
    resto--;
  }
  return partes;
}

export interface VentaCategoria {
  tipo: 'categoria' | 'sin' | 'promos'; // 'sin': products without a category (or deleted ones)
  categoria?: Categoria; // on 'categoria' rows
  total: Centavos;
}

/**
 * What the sales that count (not voided) took in, by the products' current category: each
 * sale's discount is split among its categories in proportion to their amounts, and promos are
 * their own row, so the rows add up to the sales' total. Categories by name, then "sin", then promos.
 */
export function ventasPorCategoria(
  ventas: readonly VentaConLineas[],
  productos: readonly Producto[],
  categorias: readonly Categoria[],
): VentaCategoria[] {
  const deProducto = new Map(productos.map((p) => [p.id, p.categoriaId]));
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const SIN = '';
  const totalesPor = new Map<string, Centavos>();
  let promos: Centavos | undefined;
  for (const v of ventas) {
    if (v.venta.anuladoEn) continue;
    const montos = new Map<string, Centavos>();
    for (const m of lineasSueltas(v)) {
      const id = deProducto.get(m.productoId);
      const clave = id && porId.has(id) ? id : SIN;
      montos.set(clave, (montos.get(clave) ?? 0) + importe(m.cantidad, m.precioUnitario ?? 0));
    }
    const t = totalesDe(v);
    const claves = [...montos.keys()];
    const descuentos = repartir(t.descuento, [...montos.values()]);
    claves.forEach((k, i) => totalesPor.set(k, (totalesPor.get(k) ?? 0) + montos.get(k)! - descuentos[i]));
    if (v.venta.promos?.length) promos = (promos ?? 0) + t.promos;
  }
  const filas: VentaCategoria[] = [...totalesPor]
    .filter(([k]) => k !== SIN)
    .map(([k, total]) => ({ tipo: 'categoria' as const, categoria: porId.get(k)!, total }))
    .sort((a, b) => a.categoria.nombre.localeCompare(b.categoria.nombre, 'es', { sensitivity: 'base' }));
  if (totalesPor.has(SIN)) filas.push({ tipo: 'sin', total: totalesPor.get(SIN)! });
  if (promos !== undefined) filas.push({ tipo: 'promos', total: promos });
  return filas;
}
