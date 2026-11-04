import { describe, expect, it } from 'vitest';
import { agruparPorCategoria, alertas, efecto, historial, nivel, rentabilidad, stockActual, stockPorProducto, valorInventario, valorStock } from './logic';
import type { Categoria, Movimiento, Producto, TipoMovimiento } from './types';

let n = 0;
const mov = (tipo: TipoMovimiento, cantidad: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${n}`,
  actualizadoEn: '',
  productoId: 'p',
  tipo,
  cantidad,
  fecha: `2026-01-01T00:00:${String(n++).padStart(2, '0')}Z`,
  ...extra,
});

const producto = (nombre: string, stockMinimo: number, activo = true): Producto => ({
  id: nombre,
  actualizadoEn: '',
  nombre,
  unidad: 'u',
  stockMinimo,
  activo,
});

describe('stock', () => {
  it('adds entries, subtracts sales, applies signed adjustments', () => {
    expect(efecto(mov('entrada', 5))).toBe(5);
    expect(efecto(mov('venta', 2))).toBe(-2);
    expect(efecto(mov('ajuste', -1))).toBe(-1);
    expect(stockActual([mov('entrada', 10), mov('venta', 3), mov('ajuste', -2), mov('ajuste', 1)])).toBe(6);
    expect(stockActual([])).toBe(0);
  });

  it('ignores voided movements', () => {
    expect(stockActual([mov('entrada', 10), mov('venta', 3, { anuladoEn: '2026-01-02T00:00:00Z' })])).toBe(10);
  });

  it('rounds decimal quantities', () => {
    expect(stockActual([mov('entrada', 0.1), mov('entrada', 0.2)])).toBe(0.3);
  });

  it('groups by product', () => {
    const s = stockPorProducto([mov('entrada', 5), mov('entrada', 4, { productoId: 'q' }), mov('venta', 1)]);
    expect(Object.fromEntries(s)).toEqual({ p: 4, q: 4 });
  });

  it('builds the history newest first with the running balance', () => {
    const a = mov('entrada', 10);
    const b = mov('venta', 3);
    const c = mov('venta', 5, { anuladoEn: 'x' });
    const d = mov('ajuste', -1);
    expect(historial([d, b, c, a]).map((h) => [h.mov.id, h.saldo])).toEqual([
      [d.id, 6],
      [c.id, 7],
      [b.id, 7],
      [a.id, 10],
    ]);
  });
});

describe('alertas', () => {
  it('classifies the level against the minimum', () => {
    expect(nivel(0, 5)).toBe('agotado');
    expect(nivel(-1, 0)).toBe('agotado');
    expect(nivel(5, 5)).toBe('bajo');
    expect(nivel(6, 5)).toBe('ok');
    expect(nivel(1, 0)).toBe('ok');
  });

  it('lists active low products, out of stock first', () => {
    const productos = [producto('vino', 5), producto('aceite', 2), producto('sal', 3), producto('miel', 1, false), producto('te', 0)];
    const stock = new Map([
      ['vino', 3],
      ['aceite', 10],
      ['sal', 0],
    ]);
    expect(alertas(productos, stock).map((a) => [a.producto.nombre, a.nivel, a.stock, a.faltante])).toEqual([
      ['sal', 'agotado', 0, 3],
      ['te', 'agotado', 0, 0],
      ['vino', 'bajo', 3, 2],
    ]);
  });
});

describe('rentabilidad', () => {
  it('gives profit per unit and margin over the cost', () => {
    expect(rentabilidad({ costo: 100000, precioVenta: 150000 })).toEqual({ ganancia: 50000, margen: 50 });
  });

  it('shows a loss as negative', () => {
    expect(rentabilidad({ costo: 2000, precioVenta: 1500 })).toEqual({ ganancia: -500, margen: -25 });
  });

  it('has no margin with a zero cost', () => {
    expect(rentabilidad({ costo: 0, precioVenta: 1500 })).toEqual({ ganancia: 1500 });
  });

  it('needs both cost and sale price', () => {
    expect(rentabilidad({ costo: 1000 })).toBeUndefined();
    expect(rentabilidad({ precioVenta: 1000 })).toBeUndefined();
  });
});

describe('valorStock', () => {
  it('multiplies stock by cost, rounding to whole cents', () => {
    expect(valorStock(20, 100000)).toBe(2000000);
    expect(valorStock(0.333, 1000)).toBe(333);
  });

  it('is zero without stock and undefined without a cost', () => {
    expect(valorStock(0, 1000)).toBe(0);
    expect(valorStock(-3, 1000)).toBe(0);
    expect(valorStock(5, undefined)).toBeUndefined();
  });
});

describe('valorInventario', () => {
  it('adds active and inactive products, and counts the ones with stock but no cost', () => {
    const ps = [
      { ...producto('miel', 0), costo: 1000 },
      { ...producto('dulce', 0, false), costo: 500 },
      producto('vino', 0), // stock, no cost
      producto('te', 0), // no stock, no cost: doesn't count as missing
      { ...producto('agua', 0), costo: 100 }, // negative stock
    ];
    const stock = new Map([
      ['miel', 3],
      ['dulce', 2],
      ['vino', 4],
      ['agua', -1],
    ]);
    expect(valorInventario(ps, stock)).toEqual({ total: 4000, sinCosto: 1 });
    expect(valorInventario([], stock)).toEqual({ total: 0, sinCosto: 0 });
  });
});

describe('agruparPorCategoria', () => {
  const cat = (id: string, nombre: string): Categoria => ({ id, actualizadoEn: '', nombre });
  const en = (nombre: string, categoriaId?: string): Producto => ({ ...producto(nombre, 0), ...(categoriaId ? { categoriaId } : {}) });

  it('groups by category name, keeps the product order, and puts products without one last', () => {
    const categorias = [cat('b', 'bebidas'), cat('a', 'Almacén'), cat('v', 'Vacía')];
    const productos = [en('agua', 'b'), en('arroz', 'a'), en('miel'), en('jugo', 'b'), en('raro', 'borrada')];
    const g = agruparPorCategoria(productos, categorias);
    expect(g.map((x) => [x.categoria?.nombre, x.productos.map((p) => p.nombre)])).toEqual([
      ['Almacén', ['arroz']],
      ['bebidas', ['agua', 'jugo']],
      [undefined, ['miel', 'raro']],
    ]);
  });

  it('has no "without a category" group when every product has one', () => {
    expect(agruparPorCategoria([en('agua', 'b')], [cat('b', 'Bebidas')]).map((x) => x.categoria?.id)).toEqual(['b']);
    expect(agruparPorCategoria([], [cat('b', 'Bebidas')])).toEqual([]);
  });
});
