import type { Registro } from '../lib/db';
import type { Centavos } from '../lib/money';

export interface Producto extends Registro {
  nombre: string;
  unidad: string; // free text: "botella", "kg", "paquete"
  stockMinimo: number;
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
}
