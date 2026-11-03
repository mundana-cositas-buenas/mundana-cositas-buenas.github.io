// CSV export of the stock module.

import { aCsv, pesosCsv } from '../lib/csv';
import { nivel, rentabilidad, valorStock } from './logic';
import type { Producto } from './types';

const ESTADO = { ok: 'OK', bajo: 'Bajo el mínimo', agotado: 'Sin stock' };

export function csvProductos(productos: readonly Producto[], stock: ReadonlyMap<string, number>): string {
  return aCsv([
    ['Producto', 'Unidad', 'Stock', 'Mínimo', 'Costo', 'Precio de venta', 'Ganancia', 'Margen %', 'Valor del stock', 'Activo', 'Estado'],
    ...productos.map((p) => {
      const s = stock.get(p.id) ?? 0;
      const r = rentabilidad(p);
      return [
        p.nombre,
        p.unidad,
        s,
        p.stockMinimo,
        pesosCsv(p.costo),
        pesosCsv(p.precioVenta),
        pesosCsv(r?.ganancia),
        r?.margen === undefined ? undefined : Math.round(r.margen * 10) / 10,
        pesosCsv(valorStock(s, p.costo)),
        p.activo ? 'Sí' : 'No',
        ESTADO[nivel(s, p.stockMinimo)],
      ];
    }),
  ]);
}
