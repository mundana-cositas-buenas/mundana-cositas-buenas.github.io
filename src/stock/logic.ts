// Stock math: pure functions. Current stock is never stored, it is the sum of the movements.

import type { Movimiento, Producto } from './types';

// Quantities can be decimal (kg); round sums so 0.1 + 0.2 shows as 0.3.
const redondear = (n: number) => Math.round(n * 1e6) / 1e6;

/** Signed effect of a movement on the stock; 0 if voided. */
export function efecto(m: Pick<Movimiento, 'tipo' | 'cantidad' | 'anuladoEn'>): number {
  if (m.anuladoEn) return 0;
  return m.tipo === 'venta' ? -m.cantidad : m.cantidad;
}

export function stockActual(movs: readonly Movimiento[]): number {
  return redondear(movs.reduce((s, m) => s + efecto(m), 0));
}

/** Current stock of every product with movements, by product id. */
export function stockPorProducto(movs: readonly Movimiento[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const mov of movs) m.set(mov.productoId, (m.get(mov.productoId) ?? 0) + efecto(mov));
  for (const [id, s] of m) m.set(id, redondear(s));
  return m;
}

/** Oldest first; ties broken by id so the order is stable. */
export const porFecha = (a: Movimiento, b: Movimiento) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id);

/** The movements of one product, newest first, each with the stock right after it. */
export function historial(movs: readonly Movimiento[]): { mov: Movimiento; saldo: number }[] {
  let saldo = 0;
  return [...movs]
    .sort(porFecha)
    .map((mov) => ({ mov, saldo: (saldo = redondear(saldo + efecto(mov))) }))
    .reverse();
}

export type Nivel = 'ok' | 'bajo' | 'agotado';

/** agotado: nothing left (or negative); bajo: at or under the minimum. */
export function nivel(stock: number, stockMinimo: number): Nivel {
  if (stock <= 0) return 'agotado';
  if (stock <= stockMinimo) return 'bajo';
  return 'ok';
}

export interface Alerta {
  producto: Producto;
  stock: number;
  nivel: Exclude<Nivel, 'ok'>;
  faltante: number; // to get back to the minimum
}

/** Active products that are low or out of stock: out of stock first, then by name. */
export function alertas(productos: readonly Producto[], stock: ReadonlyMap<string, number>): Alerta[] {
  const res: Alerta[] = [];
  for (const producto of productos) {
    if (!producto.activo) continue;
    const s = stock.get(producto.id) ?? 0;
    const n = nivel(s, producto.stockMinimo);
    if (n !== 'ok') res.push({ producto, stock: s, nivel: n, faltante: redondear(Math.max(0, producto.stockMinimo - s)) });
  }
  return res.sort(
    (a, b) =>
      Number(b.nivel === 'agotado') - Number(a.nivel === 'agotado') ||
      a.producto.nombre.localeCompare(b.producto.nombre, 'es', { sensitivity: 'base' }),
  );
}
