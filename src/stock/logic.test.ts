import { describe, expect, it } from 'vitest';
import { alertas, efecto, historial, nivel, stockActual, stockPorProducto } from './logic';
import type { Movimiento, Producto, TipoMovimiento } from './types';

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
