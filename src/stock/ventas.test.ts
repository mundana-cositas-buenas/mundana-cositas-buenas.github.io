import { describe, expect, it } from 'vitest';
import type { Movimiento, Producto, Venta } from './types';
import {
  agregarLinea,
  agruparVentas,
  importe,
  leerLinea,
  quedanNegativos,
  quitarLinea,
  SIN_PRECIO,
  totales,
  totalesDe,
  totalesEnCurso,
  ventasPorDia,
  type VentaConLineas,
} from './ventas';

const producto = (nombre: string, precioVenta?: number): Producto => ({
  id: nombre,
  actualizadoEn: '',
  nombre,
  unidad: 'u',
  stockMinimo: 0,
  activo: true,
  ...(precioVenta === undefined ? {} : { precioVenta }),
});

const jugo = producto('jugo', 150000);
const ensalada = producto('ensalada', 400000);

const venta = (id: string, fecha: Date, descuentoPct = 0, anuladoEn?: string): Venta => ({
  id,
  actualizadoEn: '',
  fecha: fecha.toISOString(),
  descuentoPct,
  ...(anuladoEn ? { anuladoEn } : {}),
});

const linea = (ventaId: string, productoId: string, cantidad: number, precioUnitario: number): Movimiento => ({
  id: `${ventaId}-${productoId}`,
  actualizadoEn: '',
  productoId,
  tipo: 'venta',
  cantidad,
  fecha: '',
  ventaId,
  precioUnitario,
});

describe('totales', () => {
  it('adds the lines and takes the discount off, in whole cents', () => {
    const lineas = [
      { cantidad: 2, precioUnitario: 150000 },
      { cantidad: 1, precioUnitario: 400000 },
    ];
    expect(totales(lineas, 0)).toEqual({ subtotal: 700000, descuento: 0, total: 700000 });
    expect(totales(lineas, 10)).toEqual({ subtotal: 700000, descuento: 70000, total: 630000 });
    expect(totales(lineas, 100)).toEqual({ subtotal: 700000, descuento: 700000, total: 0 });
  });

  it('rounds decimal quantities and percentages to cents', () => {
    expect(importe(0.333, 1000)).toBe(333);
    expect(importe(1.5, 99)).toBe(149); // 148.5 → 149
    expect(totales([{ cantidad: 1, precioUnitario: 999 }], 12.5)).toEqual({ subtotal: 999, descuento: 125, total: 874 });
  });

  it('is zero for an empty sale', () => {
    expect(totales([], 50)).toEqual({ subtotal: 0, descuento: 0, total: 0 });
  });

  it('uses the price of the product while entering, and the stored price afterwards', () => {
    expect(totalesEnCurso([{ producto: jugo, cantidad: 2 }], 0).total).toBe(300000);
    const v: VentaConLineas = { venta: venta('v', new Date()), lineas: [linea('v', 'jugo', 2, 100000)] };
    expect(totalesDe(v).total).toBe(200000);
  });
});

describe('leerLinea', () => {
  it('takes a product and a positive quantity, 1 when empty', () => {
    expect(leerLinea(jugo, 'jugo', '')).toEqual({ ok: true, linea: { producto: jugo, cantidad: 1 } });
    expect(leerLinea(jugo, 'jugo', '1,5')).toEqual({ ok: true, linea: { producto: jugo, cantidad: 1.5 } });
    expect(leerLinea(jugo, 'jugo', '0')).toMatchObject({ ok: false, campo: 'cantidad' });
    expect(leerLinea(jugo, 'jugo', 'x')).toMatchObject({ ok: false, campo: 'cantidad' });
  });

  it('needs a single product, with a sale price (zero is fine)', () => {
    expect(leerLinea(undefined, '', '1')).toEqual({ ok: false, campo: 'producto', error: 'Elegí un producto' });
    expect(leerLinea(undefined, 'ju', '1')).toMatchObject({ ok: false, campo: 'producto' });
    expect(leerLinea(producto('viejo'), 'viejo', '1')).toEqual({ ok: false, campo: 'producto', error: SIN_PRECIO });
    expect(leerLinea(producto('regalo', 0), 'regalo', '1').ok).toBe(true);
  });
});

describe('agregarLinea / quitarLinea', () => {
  it('adds new products at the end and merges repeated ones', () => {
    let l = agregarLinea([], { producto: jugo, cantidad: 1 });
    l = agregarLinea(l, { producto: ensalada, cantidad: 1 });
    l = agregarLinea(l, { producto: jugo, cantidad: 0.1 });
    l = agregarLinea(l, { producto: jugo, cantidad: 0.2 });
    expect(l.map((x) => [x.producto.id, x.cantidad])).toEqual([
      ['jugo', 1.3],
      ['ensalada', 1],
    ]);
    expect(quitarLinea(l, 'jugo').map((x) => x.producto.id)).toEqual(['ensalada']);
  });
});

describe('quedanNegativos', () => {
  it('lists the products that would go below zero, unless they already were', () => {
    const otro = producto('otro', 100);
    const stock = new Map([
      ['jugo', 2],
      ['ensalada', -1],
    ]);
    const lineas = [
      { producto: jugo, cantidad: 3 },
      { producto: ensalada, cantidad: 1 },
      { producto: otro, cantidad: 1 },
    ];
    expect(quedanNegativos(lineas, stock)).toEqual([
      { producto: jugo, despues: -1 },
      { producto: otro, despues: -1 },
    ]);
    expect(quedanNegativos([{ producto: jugo, cantidad: 2 }], stock)).toEqual([]);
  });
});

describe('agruparVentas / ventasPorDia', () => {
  // Local dates: days are counted in the browser's time zone.
  const dia1 = (h: number) => new Date(2026, 10, 2, h);
  const dia2 = (h: number) => new Date(2026, 10, 3, h);

  it('groups the lines into their sales, newest first, ignoring movements without a sale', () => {
    const ventas = [venta('a', dia1(10)), venta('b', dia2(9))];
    const suelto: Movimiento = { id: 'x', actualizadoEn: '', productoId: 'jugo', tipo: 'venta', cantidad: 1, fecha: '' };
    const r = agruparVentas(ventas, [linea('a', 'jugo', 1, 100), linea('b', 'jugo', 2, 100), linea('a', 'ensalada', 1, 50), suelto]);
    expect(r.map((v) => [v.venta.id, v.lineas.map((m) => m.productoId)])).toEqual([
      ['b', ['jugo']],
      ['a', ['jugo', 'ensalada']],
    ]);
  });

  it('sums each local day, newest day first, leaving voided sales out of the totals', () => {
    const ventas: VentaConLineas[] = [
      { venta: venta('a', dia1(23)), lineas: [linea('a', 'jugo', 2, 1000)] },
      { venta: venta('b', dia2(0), 10), lineas: [linea('b', 'jugo', 1, 1000)] },
      { venta: venta('c', dia2(12), 0, 'x'), lineas: [linea('c', 'jugo', 5, 1000)] },
      { venta: venta('d', dia2(18)), lineas: [linea('d', 'ensalada', 1, 500)] },
    ];
    const dias = ventasPorDia(ventas);
    expect(dias.map((d) => [d.dia, d.cantidad, d.total, d.ventas.map((v) => v.venta.id)])).toEqual([
      ['2026-11-03', 2, 1400, ['d', 'c', 'b']],
      ['2026-11-02', 1, 2000, ['a']],
    ]);
  });

  it('keeps a day whose sales were all voided, with zero', () => {
    const dias = ventasPorDia([{ venta: venta('a', dia1(10), 0, 'x'), lineas: [linea('a', 'jugo', 1, 1000)] }]);
    expect(dias).toMatchObject([{ dia: '2026-11-02', cantidad: 0, total: 0 }]);
  });
});
