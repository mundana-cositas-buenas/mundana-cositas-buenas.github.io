import { describe, expect, it } from 'vitest';
import type { Producto } from './types';
import { avisosProducto, productoFormDesde, productoVacio, validarMovimiento, validarProducto, type MovimientoForm } from './validar';

describe('validarProducto', () => {
  it('fills defaults for empty optional fields', () => {
    expect(validarProducto({ ...productoVacio(), nombre: ' Vino ', precioVenta: '1500' })).toEqual({
      ok: true,
      datos: { nombre: 'Vino', unidad: 'u', stockMinimo: 0, precioVenta: 150000, activo: true },
    });
  });

  it('requires a sale price, zero included', () => {
    expect(validarProducto({ ...productoVacio(), nombre: 'Vino' })).toEqual({ ok: false, errores: { precioVenta: 'Requerido' } });
    expect(validarProducto({ ...productoVacio(), nombre: 'Vino', precioVenta: '  ' })).toEqual({ ok: false, errores: { precioVenta: 'Requerido' } });
    expect(validarProducto({ ...productoVacio(), nombre: 'Vino', precioVenta: '-1' })).toMatchObject({ ok: false, errores: { precioVenta: expect.any(String) } });
    expect(validarProducto({ ...productoVacio(), nombre: 'Vino', precioVenta: '0' })).toMatchObject({ ok: true, datos: { precioVenta: 0 } });
  });

  it('asks an old product without a price for one when edited', () => {
    const viejo: Producto = { id: 'p', actualizadoEn: '', nombre: 'Miel', unidad: 'u', stockMinimo: 0, activo: true };
    expect(productoFormDesde(viejo).precioVenta).toBe('');
    expect(validarProducto(productoFormDesde(viejo))).toEqual({ ok: false, errores: { precioVenta: 'Requerido' } });
  });

  it('round-trips through the form', () => {
    const p: Producto = { id: 'p', actualizadoEn: '', nombre: 'Queso', unidad: 'kg', stockMinimo: 1.5, costo: 800000, precioVenta: 1234550, activo: false };
    expect(productoFormDesde(p)).toEqual({
      nombre: 'Queso',
      unidad: 'kg',
      stockMinimo: '1,5',
      costo: '8000,00',
      precioVenta: '12345,50',
      activo: false,
    });
    expect(validarProducto(productoFormDesde(p))).toEqual({
      ok: true,
      datos: { nombre: 'Queso', unidad: 'kg', stockMinimo: 1.5, costo: 800000, precioVenta: 1234550, activo: false },
    });
  });

  it('reports every field error, including duplicate names', () => {
    const r = validarProducto({ ...productoVacio(), stockMinimo: '-1', costo: '-5', precioVenta: 'x' });
    expect(!r.ok && Object.keys(r.errores).sort()).toEqual(['costo', 'nombre', 'precioVenta', 'stockMinimo']);
    expect(validarProducto({ ...productoVacio(), nombre: 'Vino', costo: 'mucho', precioVenta: '1' })).toMatchObject({ ok: false, errores: { costo: expect.any(String) } });
    expect(validarProducto({ ...productoVacio(), nombre: 'vino', precioVenta: '1' }, ['Vino'])).toMatchObject({
      ok: false,
      errores: { nombre: expect.any(String) },
    });
  });

  it('takes an optional cost, zero included', () => {
    const vino = { ...productoVacio(), nombre: 'Vino', precioVenta: '2000' };
    expect(validarProducto({ ...vino, costo: '0' })).toMatchObject({ ok: true, datos: { costo: 0 } });
    expect(validarProducto({ ...vino, costo: '1.250,50' })).toMatchObject({ ok: true, datos: { costo: 125050 } });
    const sinCosto = validarProducto({ ...vino, costo: '  ' });
    expect(sinCosto.ok && 'costo' in sinCosto.datos).toBe(false);
  });
});

describe('avisosProducto', () => {
  const datos = { nombre: 'Vino', unidad: 'u', stockMinimo: 0, precioVenta: 1000, activo: true };

  it('warns when the cost is over the sale price, without blocking the save', () => {
    const v = validarProducto({ ...productoVacio(), nombre: 'Vino', costo: '1500', precioVenta: '1000' });
    expect(v.ok).toBe(true);
    expect(v.ok && avisosProducto(v.datos)).toEqual({ costo: expect.any(String) });
  });

  it('says nothing at break-even, with a profit, or with the cost missing', () => {
    expect(avisosProducto({ ...datos, costo: 1000 })).toEqual({});
    expect(avisosProducto({ ...datos, costo: 1000, precioVenta: 1500 })).toEqual({});
    expect(avisosProducto(datos)).toEqual({});
  });
});

describe('validarMovimiento', () => {
  const f = (tipo: MovimientoForm['tipo'], cantidad: string, nota = ''): MovimientoForm => ({ tipo, cantidad, nota });

  it('requires a positive quantity for entries and sales', () => {
    expect(validarMovimiento(f('venta', '2', ' fiado '))).toEqual({ ok: true, datos: { tipo: 'venta', cantidad: 2, nota: 'fiado' } });
    expect(validarMovimiento(f('entrada', '1,5'))).toEqual({ ok: true, datos: { tipo: 'entrada', cantidad: 1.5 } });
    expect(validarMovimiento(f('venta', '-2')).ok).toBe(false);
    expect(validarMovimiento(f('entrada', '0')).ok).toBe(false);
    expect(validarMovimiento(f('venta', '')).ok).toBe(false);
  });

  it('takes a signed, non-zero quantity for adjustments', () => {
    expect(validarMovimiento(f('ajuste', '-3'))).toEqual({ ok: true, datos: { tipo: 'ajuste', cantidad: -3 } });
    expect(validarMovimiento(f('ajuste', '0'))).toMatchObject({ ok: false, errores: { cantidad: 'No puede ser cero' } });
  });
});
