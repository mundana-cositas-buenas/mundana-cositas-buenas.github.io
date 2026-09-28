import { describe, expect, it } from 'vitest';
import { costoLineaInsumo, costoPorUnidadBase, costoReceta, porId } from './calc';
import type { Insumo, LineaCostoFijo, LineaInsumo } from './types';

const insumo = (id: string, o: Partial<Insumo> = {}): Insumo => ({
  id,
  actualizadoEn: '',
  nombre: id,
  unidadBase: 'g',
  precioCompra: 100000, // $1000
  cantidadCompra: 1,
  unidadCompra: 'kg',
  ...o,
});

let n = 0;
const linea = (insumoId: string, cantidad: number, o: Partial<LineaInsumo> = {}): LineaInsumo => ({
  id: `l${n++}`,
  actualizadoEn: '',
  recetaId: 'r',
  orden: n,
  tipo: 'insumo',
  insumoId,
  cantidad,
  unidad: 'g',
  mermaPct: 0,
  ...o,
});

const fijo = (monto: number): LineaCostoFijo => ({
  id: `f${n++}`,
  actualizadoEn: '',
  recetaId: 'r',
  orden: n,
  tipo: 'costoFijo',
  descripcion: 'gas',
  monto,
});

const harina = insumo('harina');
const leche = insumo('leche', { unidadBase: 'ml', precioCompra: 150000, cantidadCompra: 1, unidadCompra: 'l' });
const huevo = insumo('huevo', { unidadBase: 'u', precioCompra: 360000, cantidadCompra: 30, unidadCompra: 'u' });
const insumos = porId([harina, leche, huevo]);

describe('costoPorUnidadBase', () => {
  it('divides price by quantity in the base unit', () => {
    expect(costoPorUnidadBase(harina)).toEqual({ ok: true, valor: 100 }); // 100 cents per g
    expect(costoPorUnidadBase(huevo)).toEqual({ ok: true, valor: 12000 });
    expect(costoPorUnidadBase(insumo('x', { cantidadCompra: 500, unidadCompra: 'g' }))).toEqual({ ok: true, valor: 200 });
  });

  it('reports invalid purchases', () => {
    expect(costoPorUnidadBase(insumo('x', { cantidadCompra: 0 })).ok).toBe(false);
    expect(costoPorUnidadBase(insumo('x', { unidadCompra: 'l' })).ok).toBe(false);
    expect(costoPorUnidadBase(insumo('x', { precioCompra: NaN })).ok).toBe(false);
  });
});

describe('costoLineaInsumo', () => {
  it('reference: flour at $1000/kg, 100 g → $100', () => {
    expect(costoLineaInsumo(linea('harina', 100), insumos)).toEqual({ ok: true, valor: 10000 });
  });

  it('converts the line unit', () => {
    expect(costoLineaInsumo(linea('harina', 0.25, { unidad: 'kg' }), insumos)).toEqual({ ok: true, valor: 25000 });
    expect(costoLineaInsumo(linea('leche', 200, { unidad: 'ml' }), insumos)).toEqual({ ok: true, valor: 30000 });
    expect(costoLineaInsumo(linea('huevo', 3, { unidad: 'u' }), insumos)).toEqual({ ok: true, valor: 36000 });
  });

  it('applies waste', () => {
    const r = costoLineaInsumo(linea('harina', 100, { mermaPct: 20 }), insumos);
    expect(r.ok && r.valor).toBeCloseTo(12500);
  });

  it('errors on mixed families, missing ingredient or bad numbers', () => {
    const mix = costoLineaInsumo(linea('harina', 1, { unidad: 'l' }), insumos);
    expect(mix).toMatchObject({ ok: false, error: expect.stringMatching(/incompatible/) });
    expect(costoLineaInsumo(linea('nada', 1), insumos)).toMatchObject({ ok: false });
    expect(costoLineaInsumo(linea('harina', -1), insumos)).toMatchObject({ ok: false });
    expect(costoLineaInsumo(linea('harina', 1, { mermaPct: 100 }), insumos)).toMatchObject({ ok: false });
  });
});

describe('costoReceta', () => {
  it('sums lines and fixed costs, divides by yield and applies margin', () => {
    const lineas = [linea('harina', 500), linea('huevo', 2, { unidad: 'u' }), fijo(5000)];
    const c = costoReceta({ rendimiento: 10, margen: 50 }, lineas, insumos);
    // 50000 + 24000 + 5000
    expect(c.costoTotal).toBe(79000);
    expect(c.costoPorUnidad).toBe(7900);
    expect(c.precioSugerido).toBe(11850);
    expect(c.errores).toBe(0);
    expect(c.lineas.get(lineas[2].id)).toEqual({ ok: true, valor: 5000 });
  });

  it('excludes and counts erroneous lines', () => {
    const malo = linea('harina', 1, { unidad: 'u' });
    const c = costoReceta({ rendimiento: 1, margen: 0 }, [linea('harina', 100), malo], insumos);
    expect(c.errores).toBe(1);
    expect(c.costoTotal).toBe(10000);
    expect(c.lineas.get(malo.id)?.ok).toBe(false);
  });

  it('has no per-unit cost without a positive yield', () => {
    const c = costoReceta({ rendimiento: 0, margen: 0 }, [fijo(100)], insumos);
    expect(c.costoTotal).toBe(100);
    expect(c.costoPorUnidad).toBeNaN();
    expect(c.precioSugerido).toBeNaN();
  });

  it('propagates ingredient price changes (cost is never stored)', () => {
    const lineas = [linea('harina', 100)];
    const caro = porId([insumo('harina', { precioCompra: 200000 })]);
    expect(costoReceta({ rendimiento: 1, margen: 0 }, lineas, insumos).costoTotal).toBe(10000);
    expect(costoReceta({ rendimiento: 1, margen: 0 }, lineas, caro).costoTotal).toBe(20000);
  });
});
