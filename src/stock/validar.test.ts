import { describe, expect, it } from 'vitest';
import type { Producto } from './types';
import { productoFormDesde, productoVacio, validarMovimiento, validarProducto, type MovimientoForm } from './validar';

describe('validarProducto', () => {
  it('fills defaults for empty optional fields', () => {
    expect(validarProducto({ ...productoVacio(), nombre: ' Vino ' })).toEqual({
      ok: true,
      datos: { nombre: 'Vino', unidad: 'u', stockMinimo: 0, activo: true },
    });
  });

  it('round-trips through the form', () => {
    const p: Producto = { id: 'p', actualizadoEn: '', nombre: 'Queso', unidad: 'kg', stockMinimo: 1.5, precioVenta: 1234550, activo: false };
    expect(productoFormDesde(p)).toEqual({ nombre: 'Queso', unidad: 'kg', stockMinimo: '1,5', precioVenta: '12345,50', activo: false });
    expect(validarProducto(productoFormDesde(p))).toEqual({
      ok: true,
      datos: { nombre: 'Queso', unidad: 'kg', stockMinimo: 1.5, precioVenta: 1234550, activo: false },
    });
  });

  it('reports every field error, including duplicate names', () => {
    const r = validarProducto({ ...productoVacio(), stockMinimo: '-1', precioVenta: 'x' });
    expect(!r.ok && Object.keys(r.errores).sort()).toEqual(['nombre', 'precioVenta', 'stockMinimo']);
    expect(validarProducto({ ...productoVacio(), nombre: 'vino' }, ['Vino'])).toMatchObject({
      ok: false,
      errores: { nombre: expect.any(String) },
    });
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
