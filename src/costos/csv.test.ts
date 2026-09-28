import { describe, expect, it } from 'vitest';
import { csvInsumos, csvRecetas } from './csv';
import type { Insumo, Receta, RecetaLinea } from './types';

const harina: Insumo = { id: 'i1', actualizadoEn: '', nombre: 'Harina', unidadBase: 'g', precioCompra: 100000, cantidadCompra: 1, unidadCompra: 'kg' };
const pan: Receta = { id: 'r1', actualizadoEn: '', nombre: 'Pan', rendimiento: 2, unidadRendimiento: 'panes', margen: 50, notas: '' };
const lineas: RecetaLinea[] = [
  { id: 'l1', actualizadoEn: '', recetaId: 'r1', orden: 0, tipo: 'insumo', insumoId: 'i1', cantidad: 100, unidad: 'g', mermaPct: 0 },
  { id: 'l2', actualizadoEn: '', recetaId: 'r1', orden: 1, tipo: 'insumo', insumoId: 'x', cantidad: 1, unidad: 'g', mermaPct: 0 },
];

const filas = (csv: string) => csv.slice(1).trimEnd().split('\r\n');

describe('csvInsumos', () => {
  it('lists price and cost per larger unit', () => {
    expect(filas(csvInsumos([harina]))[1]).toBe('Harina;1000,00;1;kg;1000,00;kg');
  });
});

describe('csvRecetas', () => {
  it('computes costs and counts line errors', () => {
    const csv = filas(csvRecetas([pan], new Map([['r1', lineas]]), [harina]));
    expect(csv[0]).toMatch(/^Receta;/);
    // $100 of flour over 2 loaves = $50 each, +50 % = $75.
    expect(csv[1]).toBe('Pan;2;panes;100,00;50,00;50;75,00;1');
  });

  it('leaves costs per unit empty when the yield is zero', () => {
    expect(filas(csvRecetas([{ ...pan, rendimiento: 0 }], new Map(), []))[1]).toBe('Pan;0;panes;0,00;;50;;0');
  });
});
