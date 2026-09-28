// CSV exports of the costing module.

import { aCsv, pesosCsv } from '../lib/csv';
import { unidadMayor } from '../lib/units';
import { costoPorUnidadBase, costoReceta, porId } from './calc';
import type { Insumo, Receta, RecetaLinea } from './types';

export function csvInsumos(insumos: readonly Insumo[]): string {
  return aCsv([
    ['Insumo', 'Precio de compra', 'Cantidad de compra', 'Unidad de compra', 'Costo', 'Por'],
    ...insumos.map((i) => {
      const c = costoPorUnidadBase(i);
      const mayor = unidadMayor(i.unidadBase);
      return [i.nombre, pesosCsv(i.precioCompra), i.cantidadCompra, i.unidadCompra, c.ok ? pesosCsv(c.valor * mayor.factor) : '', mayor.unidad];
    }),
  ]);
}

export function csvRecetas(recetas: readonly Receta[], lineas: ReadonlyMap<string, RecetaLinea[]>, insumos: readonly Insumo[]): string {
  const porInsumo = porId(insumos);
  return aCsv([
    ['Receta', 'Rendimiento', 'Unidad', 'Costo total', 'Costo por unidad', 'Margen %', 'Precio sugerido', 'Líneas con error'],
    ...recetas.map((r) => {
      const c = costoReceta(r, lineas.get(r.id) ?? [], porInsumo);
      return [
        r.nombre,
        r.rendimiento,
        r.unidadRendimiento,
        pesosCsv(c.costoTotal),
        pesosCsv(c.costoPorUnidad),
        r.margen,
        pesosCsv(c.precioSugerido),
        c.errores,
      ];
    }),
  ]);
}
