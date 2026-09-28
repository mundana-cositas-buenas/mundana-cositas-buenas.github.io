// CSV export of the stock module.

import { aCsv, pesosCsv } from '../lib/csv';
import { nivel } from './logic';
import type { Producto } from './types';

const ESTADO = { ok: 'OK', bajo: 'Bajo el mínimo', agotado: 'Sin stock' };

export function csvProductos(productos: readonly Producto[], stock: ReadonlyMap<string, number>): string {
  return aCsv([
    ['Producto', 'Unidad', 'Stock', 'Mínimo', 'Precio de venta', 'Activo', 'Estado'],
    ...productos.map((p) => {
      const s = stock.get(p.id) ?? 0;
      return [p.nombre, p.unidad, s, p.stockMinimo, pesosCsv(p.precioVenta), p.activo ? 'Sí' : 'No', ESTADO[nivel(s, p.stockMinimo)]];
    }),
  ]);
}
