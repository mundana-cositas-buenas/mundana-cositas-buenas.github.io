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
  precioUnitario?: Centavos; // the product's sale price when it was sold (0 for promo components)
  promoId?: string; // a component of a promo sold in this sale: its price is in the sale's `promos`
}

/** A sale of one or more products: each line is a 'venta' movement with this `ventaId`. */
export interface Venta extends Registro {
  fecha: string; // ISO 8601, the same as its movements'
  descuentoPct: number; // 0 to 100, over the whole sale
  nota?: string;
  anuladoEn?: string; // ISO 8601; voids the sale and all its movements together
  promos?: PromoVendida[]; // promos sold, at most one entry per promo (older sales have none)
}

export interface ComponentePromo {
  productoId: string;
  cantidad: number; // per promo
}

/** A bundle of products sold at its own price. It has no stock: selling it takes stock from its components. */
export interface Promo extends Registro {
  nombre: string;
  precio: Centavos;
  activo: boolean;
  componentes: ComponentePromo[]; // at least one, one entry per product
}

/** A promo line of a sale: name and price as they were when sold. */
export interface PromoVendida {
  promoId: string;
  nombre: string;
  precio: Centavos; // per promo
  cantidad: number;
}
