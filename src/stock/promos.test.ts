import { describe, expect, it } from 'vitest';
import { agregarComponente, ahorro, detalleComponentes, nombreEnVenta, precioSeparado, problemaPromo } from './promos';
import type { Producto, Promo } from './types';

const producto = (nombre: string, precioVenta?: number, activo = true): Producto => ({
  id: nombre,
  actualizadoEn: '',
  nombre,
  unidad: 'u',
  stockMinimo: 0,
  activo,
  ...(precioVenta === undefined ? {} : { precioVenta }),
});

const jugo = producto('Jugo', 150000);
const ensalada = producto('Ensalada', 400000);
const porId = (...ps: Producto[]) => new Map(ps.map((p) => [p.id, p]));

const promo: Promo = {
  id: 'pr',
  actualizadoEn: '',
  nombre: 'Jugo + ensalada',
  precio: 500000,
  activo: true,
  componentes: [
    { productoId: 'Jugo', cantidad: 1 },
    { productoId: 'Ensalada', cantidad: 1 },
  ],
};

describe('promos', () => {
  it('is named with a prefix in the sale picker', () => {
    expect(nombreEnVenta(promo)).toBe('Promo: Jugo + ensalada');
  });

  it('adds a product already in the promo to its component', () => {
    const cs = agregarComponente(promo.componentes, { productoId: 'Jugo', cantidad: 0.5 });
    expect(cs).toEqual([
      { productoId: 'Jugo', cantidad: 1.5 },
      { productoId: 'Ensalada', cantidad: 1 },
    ]);
    expect(agregarComponente([], { productoId: 'Jugo', cantidad: 2 })).toEqual([{ productoId: 'Jugo', cantidad: 2 }]);
  });

  it('compares the price with buying the components one by one', () => {
    expect(precioSeparado(promo.componentes, porId(jugo, ensalada))).toEqual({ total: 550000, sinPrecio: 0 });
    expect(ahorro(promo, porId(jugo, ensalada))).toBe(50000);
    // A component without a price (or deleted) leaves the comparison incomplete.
    expect(precioSeparado(promo.componentes, porId(jugo, producto('Ensalada')))).toEqual({ total: 150000, sinPrecio: 1 });
    expect(ahorro(promo, porId(jugo))).toBeUndefined();
  });

  it("can't be sold with a deleted or deactivated component", () => {
    expect(problemaPromo(promo, porId(jugo, ensalada))).toBeUndefined();
    expect(problemaPromo(promo, porId(jugo))).toBe('Incluye un producto que ya no existe');
    expect(problemaPromo(promo, porId(jugo, producto('Ensalada', 1, false)))).toBe('Incluye un producto desactivado: Ensalada');
    expect(problemaPromo(promo, porId(producto('Jugo', 1, false), producto('Ensalada', 1, false)))).toBe(
      'Incluye productos desactivados: Jugo, Ensalada',
    );
    expect(problemaPromo({ componentes: [] }, porId())).toBe('No tiene productos');
  });

  it('describes its components', () => {
    expect(detalleComponentes(promo.componentes, porId(jugo))).toBe('Jugo × 1, (borrado) × 1');
  });
});
