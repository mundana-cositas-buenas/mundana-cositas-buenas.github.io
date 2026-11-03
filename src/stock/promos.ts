// Promos: pure functions. A promo is a bundle of products with its own price; selling it
// takes its components out of the stock, and the sale keeps the promo's name and price.

import { formatNumero, type Centavos } from '../lib/money';
import type { ComponentePromo, Producto, Promo } from './types';

/** How promos are named in the sale's product picker, so they can't be confused with products. */
export const PREFIJO_PROMO = 'Promo: ';

export const nombreEnVenta = (p: Pick<Promo, 'nombre'>) => `${PREFIJO_PROMO}${p.nombre}`;

const redondear = (n: number) => Math.round(n * 1e6) / 1e6;

/** Adds a component; a product already in the promo gets the quantity added to it. */
export function agregarComponente(cs: readonly ComponentePromo[], nuevo: ComponentePromo): ComponentePromo[] {
  const i = cs.findIndex((c) => c.productoId === nuevo.productoId);
  if (i < 0) return [...cs, nuevo];
  return cs.map((c, j) => (j === i ? { ...c, cantidad: redondear(c.cantidad + nuevo.cantidad) } : c));
}

/** Why the promo can't be sold now (undefined if it can): a component deleted or deactivated. */
export function problemaPromo(promo: Pick<Promo, 'componentes'>, productos: ReadonlyMap<string, Producto>): string | undefined {
  if (!promo.componentes.length) return 'No tiene productos';
  const inactivos: string[] = [];
  for (const c of promo.componentes) {
    const p = productos.get(c.productoId);
    if (!p) return 'Incluye un producto que ya no existe';
    if (!p.activo) inactivos.push(p.nombre);
  }
  if (!inactivos.length) return undefined;
  return `Incluye ${inactivos.length === 1 ? 'un producto desactivado' : 'productos desactivados'}: ${inactivos.join(', ')}`;
}

/** What buying the components one by one would cost, at their current sale prices. */
export interface PrecioSeparado {
  total: Centavos;
  sinPrecio: number; // components left out of the total: no sale price, or deleted
}

export function precioSeparado(componentes: readonly ComponentePromo[], productos: ReadonlyMap<string, Producto>): PrecioSeparado {
  let total = 0;
  let sinPrecio = 0;
  for (const c of componentes) {
    const precio = productos.get(c.productoId)?.precioVenta;
    if (precio === undefined) sinPrecio++;
    else total += Math.round(c.cantidad * precio);
  }
  return { total, sinPrecio };
}

/** Savings over buying the components one by one; undefined if some component has no price. */
export function ahorro(promo: Pick<Promo, 'precio' | 'componentes'>, productos: ReadonlyMap<string, Producto>): Centavos | undefined {
  const s = precioSeparado(promo.componentes, productos);
  return s.sinPrecio ? undefined : s.total - promo.precio;
}

/** "Jugo × 1, Ensalada × 1", in the promo's order. */
export function detalleComponentes(componentes: readonly ComponentePromo[], productos: ReadonlyMap<string, Producto>): string {
  return componentes.map((c) => `${productos.get(c.productoId)?.nombre ?? '(borrado)'} × ${formatNumero(c.cantidad)}`).join(', ');
}
