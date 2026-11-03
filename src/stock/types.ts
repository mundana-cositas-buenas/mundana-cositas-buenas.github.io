import type { Registro } from '../lib/db';
import type { Centavos } from '../lib/money';

export interface Producto extends Registro {
  nombre: string;
  unidad: string; // free text: "botella", "kg", "paquete"
  stockMinimo: number;
  costo?: Centavos; // per unit, typed by hand
  precioVenta?: Centavos;
  activo: boolean;
}

export type TipoMovimiento = 'entrada' | 'venta' | 'ajuste';

export interface Movimiento extends Registro {
  productoId: string;
  tipo: TipoMovimiento;
  cantidad: number; // positive for entrada/venta; signed for ajuste
  fecha: string; // ISO 8601
  nota?: string;
  anuladoEn?: string; // ISO 8601; a voided movement stays in the history but no longer counts
  // Only on sale lines registered as part of a Venta (older sales have neither):
  ventaId?: string;
  precioUnitario?: Centavos; // the product's sale price when it was sold
}

/** A sale of one or more products: each line is a 'venta' movement with this `ventaId`. */
export interface Venta extends Registro {
  fecha: string; // ISO 8601, the same as its movements'
  descuentoPct: number; // 0 to 100, over the whole sale
  nota?: string;
  anuladoEn?: string; // ISO 8601; voids the sale and all its movements together
}
