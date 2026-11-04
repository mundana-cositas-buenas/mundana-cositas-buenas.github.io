import { describe, expect, it } from 'vitest';
import {
  asientos,
  asientosPorProveedor,
  avisosPago,
  cuentaCorriente,
  describirVencimiento,
  diasHasta,
  estadoCuenta,
  importePropuesto,
  pendientes,
  saldo,
  vencimiento,
} from './proveedores';
import type { Movimiento, OperacionProveedor, Proveedor, TipoOperacion } from './types';

// Local dates, at noon so no timezone moves them to another day.
const dia = (d: number, mes = 0) => new Date(2026, mes, d, 12).toISOString();

let n = 0;
const op = (tipo: TipoOperacion, importe: number, d: number, extra: Partial<OperacionProveedor> = {}): OperacionProveedor => ({
  id: `o${++n}`,
  actualizadoEn: '',
  proveedorId: 'pv',
  tipo,
  importe,
  fecha: dia(d),
  ...(tipo === 'pago' ? { medioPago: 'efectivo' } : {}),
  ...extra,
});
const entrada = (importe: number | undefined, d: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${++n}`,
  actualizadoEn: '',
  productoId: 'p',
  tipo: 'entrada',
  cantidad: 1,
  fecha: dia(d),
  ...(importe === undefined ? {} : { proveedorId: 'pv', importe }),
  ...extra,
});

describe('asientos / saldo / cuentaCorriente', () => {
  it('adds purchases, entries and adjustments, subtracts payments, and skips voided lines', () => {
    const as = asientos(
      [op('compra', 10000, 1), op('pago', 3000, 3), op('ajuste', -500, 4), op('ajuste', 200, 5), op('compra', 99999, 6, { anuladoEn: 'x' })],
      [entrada(4000, 2), entrada(undefined, 2), entrada(7777, 7, { anuladoEn: 'x' })],
    );
    // The entry without importe is not part of the account.
    expect(as.map((a) => a.tipo)).toEqual(['compra', 'entrada', 'pago', 'ajuste', 'ajuste', 'compra', 'entrada']);
    expect(saldo(as)).toBe(10000 + 4000 - 3000 - 500 + 200);
    const cc = cuentaCorriente(as);
    expect(cc.map((c) => c.saldo)).toEqual([10700, 10700, 10700, 10500, 11000, 14000, 10000]);
    expect(cc[0].asiento.tipo).toBe('entrada');
  });

  it('groups every line by supplier', () => {
    const m = asientosPorProveedor(
      [op('compra', 100, 1), op('compra', 200, 1, { proveedorId: 'otro' })],
      [entrada(50, 2), entrada(undefined, 2)],
    );
    expect(saldo(m.get('pv')!)).toBe(150);
    expect(saldo(m.get('otro')!)).toBe(200);
    expect(m.size).toBe(2);
  });
});

describe('vencimientos', () => {
  it('is due the term in days after the purchase date, counting calendar days', () => {
    expect(vencimiento(dia(20), 15)).toEqual(new Date(2026, 1, 4));
    expect(vencimiento(new Date(2026, 0, 31, 23, 59).toISOString(), 0)).toEqual(new Date(2026, 0, 31));
    expect(diasHasta(new Date(2026, 0, 10), new Date(2026, 0, 7, 23))).toBe(3);
    expect(diasHasta(new Date(2026, 0, 10), new Date(2026, 0, 12, 1))).toBe(-2);
  });

  it('describes the days left', () => {
    expect(describirVencimiento(-1)).toBe('vencido hace 1 día');
    expect(describirVencimiento(-3)).toBe('vencido hace 3 días');
    expect(describirVencimiento(0)).toBe('vence hoy');
    expect(describirVencimiento(1)).toBe('vence en 1 día');
    expect(describirVencimiento(4)).toBe('vence en 4 días');
  });

  it('pays the oldest debt first and lists what is still pending of each purchase', () => {
    const as = asientos([op('compra', 1000, 1), op('compra', 2000, 5), op('pago', 1500, 6), op('ajuste', -100, 7)], [entrada(400, 8)]);
    const ps = pendientes(as, 10, new Date(2026, 0, 12));
    // 1600 of credit: pays the first purchase and 600 of the second.
    expect(ps.map((p) => [p.asiento.tipo, p.pendiente, p.dias])).toEqual([
      ['compra', 1400, 3],
      ['entrada', 400, 6],
    ]);
  });

  it('counts positive adjustments as debt that never falls due', () => {
    // The initial balance (an adjustment) is paid first, so the purchase is still pending.
    const as = asientos([op('ajuste', 5000, 1), op('compra', 1000, 2), op('pago', 5000, 3)], []);
    expect(pendientes(as, 0, new Date(2026, 0, 20)).map((p) => [p.asiento.tipo, p.pendiente])).toEqual([['compra', 1000]]);
    // An unpaid adjustment alone warns about nothing.
    const solo = estadoCuenta(asientos([op('ajuste', 5000, 1)], []), 0, new Date(2026, 5, 1));
    expect(solo).toEqual({ saldo: 5000, vencido: 0, porVencer: 0, proximo: undefined });
  });

  it('ignores voided lines and has nothing pending when paid in full or in advance', () => {
    const as = asientos([op('pago', 3000, 1), op('compra', 1000, 2), op('compra', 9000, 3, { anuladoEn: 'x' })], [entrada(1500, 4)]);
    expect(pendientes(as, 0, new Date(2026, 1, 1))).toEqual([]);
    expect(saldo(as)).toBe(-500);
  });

  it('splits what is overdue from what is due within 3 days', () => {
    const as = asientos([op('compra', 100, 1), op('compra', 200, 10), op('compra', 300, 12), op('compra', 400, 14)], []);
    // Term 5: due on the 6th, 15th, 17th and 19th; today is the 14th.
    const e = estadoCuenta(as, 5, new Date(2026, 0, 14, 9));
    expect(e).toMatchObject({ saldo: 1000, vencido: 100, porVencer: 200 + 300 });
    expect(e.proximo?.dias).toBe(-8);
  });
});

describe('avisosPago', () => {
  const pv = (id: string, nombre: string, extra: Partial<Proveedor> = {}): Proveedor => ({
    id,
    actualizadoEn: '',
    nombre,
    plazoDias: 15,
    activo: true,
    ...extra,
  });

  it('lists the suppliers with payments due, inactive ones too, most overdue first', () => {
    const lista = [pv('a', 'Aceites'), pv('b', 'Bebidas', { activo: false }), pv('c', 'Carnes'), pv('d', 'Dulces')];
    const cuentas = asientosPorProveedor(
      [
        op('compra', 100, 10, { proveedorId: 'a' }), // due on the 25th: in 3 days
        op('compra', 100, 1, { proveedorId: 'b' }), // due on the 16th: overdue
        op('compra', 100, 15, { proveedorId: 'c' }), // due on the 30th: not yet
        op('compra', 100, 1, { proveedorId: 'd' }),
        op('pago', 100, 2, { proveedorId: 'd' }), // paid
      ],
      [],
    );
    const avisos = avisosPago(lista, cuentas, new Date(2026, 0, 22));
    expect(avisos.map((a) => [a.proveedor.nombre, a.estado.proximo?.dias])).toEqual([
      ['Bebidas', -6],
      ['Aceites', 3],
    ]);
  });
});

describe('importePropuesto', () => {
  it('is the cost times the quantity, in whole cents, when there is a cost and a quantity', () => {
    expect(importePropuesto(150000, 3)).toBe(450000);
    expect(importePropuesto(333, 1.5)).toBe(500);
    expect(importePropuesto(0, 2)).toBe(0);
    expect(importePropuesto(undefined, 2)).toBeUndefined();
    expect(importePropuesto(100, Number.NaN)).toBeUndefined();
    expect(importePropuesto(100, 0)).toBeUndefined();
  });
});
