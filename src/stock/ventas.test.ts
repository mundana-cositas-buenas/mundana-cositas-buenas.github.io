import { describe, expect, it } from 'vitest';
import type { Categoria, Movimiento, Producto, Promo, Venta } from './types';
import {
  agregarLinea,
  agregarPromo,
  leerPromo,
  lineasSueltas,
  pedidoPorProducto,
  quitarPromo,
  agruparVentas,
  importe,
  leerLinea,
  quedanNegativos,
  quitarLinea,
  SIN_PRECIO,
  totales,
  totalesDe,
  totalesEnCurso,
  repartir,
  ventasPorCategoria,
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
    expect(totales(lineas, 0)).toEqual({ subtotal: 700000, descuento: 0, promos: 0, total: 700000 });
    expect(totales(lineas, 10)).toEqual({ subtotal: 700000, descuento: 70000, promos: 0, total: 630000 });
    expect(totales(lineas, 100)).toEqual({ subtotal: 700000, descuento: 700000, promos: 0, total: 0 });
  });

  it('rounds decimal quantities and percentages to cents', () => {
    expect(importe(0.333, 1000)).toBe(333);
    expect(importe(1.5, 99)).toBe(149); // 148.5 → 149
    expect(totales([{ cantidad: 1, precioUnitario: 999 }], 12.5)).toEqual({ subtotal: 999, descuento: 125, promos: 0, total: 874 });
  });

  it('is zero for an empty sale', () => {
    expect(totales([], 50)).toEqual({ subtotal: 0, descuento: 0, promos: 0, total: 0 });
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

describe('promos in a sale', () => {
  const promo: Promo = {
    id: 'combo',
    actualizadoEn: '',
    nombre: 'Jugo + ensalada',
    precio: 500000,
    activo: true,
    componentes: [
      { productoId: 'jugo', cantidad: 1 },
      { productoId: 'ensalada', cantidad: 1 },
    ],
  };
  const productos = new Map([jugo, ensalada].map((p) => [p.id, p]));

  it('adds promos to the total, and the discount is only over the products sold on their own', () => {
    const t = totalesEnCurso([{ producto: jugo, cantidad: 2 }], 10, [{ promo, cantidad: 2 }]);
    expect(t).toEqual({ subtotal: 300000, descuento: 30000, promos: 1000000, total: 1270000 });
    expect(totales([], 50, [{ cantidad: 1, precio: 500000 }])).toEqual({ subtotal: 0, descuento: 0, promos: 500000, total: 500000 });
  });

  it('uses the price kept on a stored sale, not its zero-priced component movements', () => {
    const v: VentaConLineas = {
      venta: { ...venta('v', new Date(), 10), promos: [{ promoId: 'combo', nombre: 'Combo', precio: 450000, cantidad: 1 }] },
      lineas: [linea('v', 'jugo', 1, 150000), { ...linea('v', 'ensalada', 1, 0), id: 'c1', promoId: 'combo' }, { ...linea('v', 'jugo', 1, 0), id: 'c2', promoId: 'combo' }],
    };
    expect(lineasSueltas(v).map((m) => m.productoId)).toEqual(['jugo']);
    expect(totalesDe(v)).toEqual({ subtotal: 150000, descuento: 15000, promos: 450000, total: 585000 });
  });

  it('reads a promo line: a positive quantity, 1 when empty, and every component active', () => {
    expect(leerPromo(promo, '', productos)).toEqual({ ok: true, linea: { promo, cantidad: 1 } });
    expect(leerPromo(promo, '0', productos)).toMatchObject({ ok: false, campo: 'cantidad' });
    const sinEnsalada = new Map([...productos, ['ensalada', { ...ensalada, activo: false }]]);
    expect(leerPromo(promo, '1', sinEnsalada)).toEqual({ ok: false, campo: 'producto', error: 'Incluye un producto desactivado: ensalada' });
  });

  it('merges a repeated promo and removes it', () => {
    let ps = agregarPromo([], { promo, cantidad: 1 });
    ps = agregarPromo(ps, { promo, cantidad: 2 });
    expect(ps).toEqual([{ promo, cantidad: 3 }]);
    expect(quitarPromo(ps, 'combo')).toEqual([]);
  });

  it('counts promo components with the loose lines for the stock', () => {
    const pedido = pedidoPorProducto([{ producto: jugo, cantidad: 1 }], [{ promo, cantidad: 2 }], productos);
    expect([...pedido.values()].map((p) => [p.producto.id, p.cantidad])).toEqual([
      ['jugo', 3],
      ['ensalada', 2],
    ]);
    const stock = new Map([
      ['jugo', 2],
      ['ensalada', 5],
    ]);
    expect(quedanNegativos([{ producto: jugo, cantidad: 1 }], stock, [{ promo, cantidad: 2 }], productos)).toEqual([
      { producto: jugo, despues: -1 },
    ]);
  });
});

describe('repartir', () => {
  it('splits in proportion, adding up exactly', () => {
    expect(repartir(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(repartir(10, [300, 100])).toEqual([8, 2]);
    expect(repartir(7, [0, 5])).toEqual([0, 7]);
    expect(repartir(0, [3, 4])).toEqual([0, 0]);
    expect(repartir(5, [0, 0])).toEqual([0, 0]);
    expect(repartir(5, [])).toEqual([]);
  });
});

describe('ventasPorCategoria', () => {
  const cat = (id: string, nombre: string): Categoria => ({ id, actualizadoEn: '', nombre });
  const categorias = [cat('b', 'Bebidas'), cat('a', 'Almacén')];
  const agua = { ...producto('agua', 100000), categoriaId: 'b' };
  const jugoB = { ...jugo, categoriaId: 'b' };
  const arroz = { ...producto('arroz', 200000), categoriaId: 'a' };
  const miel = producto('miel', 300000); // no category
  const productos = [agua, jugoB, arroz, miel];
  const d = new Date(Date.UTC(2026, 2, 5, 12));
  const con = (v: Venta, lineas: Movimiento[]): VentaConLineas => ({ venta: v, lineas });

  it('sums each category, then products without one, then promos, adding up to the total', () => {
    const v1 = con(venta('v1', d, 10), [linea('v1', 'agua', 2, 100000), linea('v1', 'arroz', 1, 200000), linea('v1', 'miel', 1, 300000)]);
    const v2 = con({ ...venta('v2', d), promos: [{ promoId: 'pr', nombre: 'Combo', precio: 50000, cantidad: 2 }] }, [
      linea('v2', 'jugo', 1, 150000),
      { ...linea('v2', 'arroz', 1, 0), id: 'v2-c', promoId: 'pr' },
    ]);
    const anulada = con(venta('v3', d, 0, d.toISOString()), [linea('v3', 'arroz', 5, 200000)]);
    const filas = ventasPorCategoria([v1, v2, anulada], productos, categorias);
    expect(filas).toEqual([
      { tipo: 'categoria', categoria: categorias[1], total: 180000 }, // arroz 2000 - 10 %
      { tipo: 'categoria', categoria: categorias[0], total: 180000 + 150000 }, // agua 2000 - 10 %, jugo
      { tipo: 'sin', total: 270000 }, // miel 3000 - 10 %
      { tipo: 'promos', total: 100000 },
    ]);
    const total = filas.reduce((s, f) => s + f.total, 0);
    expect(total).toBe(totalesDe(v1).total + totalesDe(v2).total);
  });

  it('splits an odd discount without losing cents, and counts deleted products as without a category', () => {
    const v = con(venta('v1', d, 50), [linea('v1', 'agua', 1, 1), linea('v1', 'arroz', 1, 1), linea('v1', 'borrado', 1, 1)]);
    const filas = ventasPorCategoria([v], productos, categorias);
    expect(filas.map((f) => f.tipo)).toEqual(['categoria', 'categoria', 'sin']);
    expect(filas.reduce((s, f) => s + f.total, 0)).toBe(totalesDe(v).total);
  });

  it('is empty without sales that count', () => {
    expect(ventasPorCategoria([con(venta('v', d, 0, d.toISOString()), [linea('v', 'agua', 1, 100)])], productos, categorias)).toEqual([]);
  });
});
