import { describe, expect, it } from 'vitest';
import type { Producto, Promo, Proveedor } from './types';
import {
  avisosProducto,
  promoFormDesde,
  promoVacia,
  validarPromo,
  proveedorFormDesde,
  proveedorVacio,
  validarOperacion,
  validarProveedor,
  type OperacionForm,
  productoFormDesde, productoVacio, validarCategoria, TIPOS_RAPIDOS, validarMovimiento, validarProducto, validarVenta, type MovimientoForm, type PromoForm } from './validar';

// A product form with a supplier and a category chosen, the only way to save one.
const vacio = () => ({ ...productoVacio(), proveedorId: 'pv', categoriaId: 'c' });

describe('validarProducto', () => {
  it('fills defaults for empty optional fields', () => {
    expect(validarProducto({ ...vacio(), nombre: ' Vino ', precioVenta: '1500' })).toEqual({
      ok: true,
      datos: { nombre: 'Vino', unidad: 'u', stockMinimo: 0, precioVenta: 150000, activo: true, proveedorId: 'pv', categoriaId: 'c' },
    });
  });

  it('requires a supplier and a category', () => {
    expect(validarProducto({ ...productoVacio(), nombre: 'Vino', precioVenta: '1' })).toEqual({
      ok: false,
      errores: { proveedorId: 'Elegí un proveedor', categoriaId: 'Elegí una categoría' },
    });
    expect(validarProducto({ ...vacio(), categoriaId: '', nombre: 'Vino', precioVenta: '1' })).toEqual({
      ok: false,
      errores: { categoriaId: 'Elegí una categoría' },
    });
  });

  it('requires a sale price, zero included', () => {
    expect(validarProducto({ ...vacio(), nombre: 'Vino' })).toEqual({ ok: false, errores: { precioVenta: 'Requerido' } });
    expect(validarProducto({ ...vacio(), nombre: 'Vino', precioVenta: '  ' })).toEqual({ ok: false, errores: { precioVenta: 'Requerido' } });
    expect(validarProducto({ ...vacio(), nombre: 'Vino', precioVenta: '-1' })).toMatchObject({ ok: false, errores: { precioVenta: expect.any(String) } });
    expect(validarProducto({ ...vacio(), nombre: 'Vino', precioVenta: '0' })).toMatchObject({ ok: true, datos: { precioVenta: 0 } });
  });

  it('asks an old product without a price, a supplier or a category for them when edited', () => {
    const viejo: Producto = { id: 'p', actualizadoEn: '', nombre: 'Miel', unidad: 'u', stockMinimo: 0, activo: true };
    expect(productoFormDesde(viejo).precioVenta).toBe('');
    expect(productoFormDesde(viejo).proveedorId).toBe('');
    expect(productoFormDesde(viejo).categoriaId).toBe('');
    expect(validarProducto(productoFormDesde(viejo))).toEqual({
      ok: false,
      errores: { precioVenta: 'Requerido', proveedorId: 'Elegí un proveedor', categoriaId: 'Elegí una categoría' },
    });
  });

  it('round-trips through the form', () => {
    const p: Producto = { id: 'p', actualizadoEn: '', nombre: 'Queso', unidad: 'kg', stockMinimo: 1.5, costo: 800000, precioVenta: 1234550, activo: false, proveedorId: 'pv', categoriaId: 'c' };
    expect(productoFormDesde(p)).toEqual({
      nombre: 'Queso',
      unidad: 'kg',
      stockMinimo: '1,5',
      costo: '8000,00',
      precioVenta: '12345,50',
      activo: false,
      proveedorId: 'pv',
      categoriaId: 'c',
    });
    expect(validarProducto(productoFormDesde(p))).toEqual({
      ok: true,
      datos: { nombre: 'Queso', unidad: 'kg', stockMinimo: 1.5, costo: 800000, precioVenta: 1234550, activo: false, proveedorId: 'pv', categoriaId: 'c' },
    });
  });

  it('reports every field error, including duplicate names', () => {
    const r = validarProducto({ ...vacio(), stockMinimo: '-1', costo: '-5', precioVenta: 'x' });
    expect(!r.ok && Object.keys(r.errores).sort()).toEqual(['costo', 'nombre', 'precioVenta', 'stockMinimo']);
    expect(validarProducto({ ...vacio(), nombre: 'Vino', costo: 'mucho', precioVenta: '1' })).toMatchObject({ ok: false, errores: { costo: expect.any(String) } });
    expect(validarProducto({ ...vacio(), nombre: 'vino', precioVenta: '1' }, ['Vino'])).toMatchObject({
      ok: false,
      errores: { nombre: expect.any(String) },
    });
  });

  it('takes an optional cost, zero included', () => {
    const vino = { ...vacio(), nombre: 'Vino', precioVenta: '2000' };
    expect(validarProducto({ ...vino, costo: '0' })).toMatchObject({ ok: true, datos: { costo: 0 } });
    expect(validarProducto({ ...vino, costo: '1.250,50' })).toMatchObject({ ok: true, datos: { costo: 125050 } });
    const sinCosto = validarProducto({ ...vino, costo: '  ' });
    expect(sinCosto.ok && 'costo' in sinCosto.datos).toBe(false);
  });
});

describe('avisosProducto', () => {
  const datos = { nombre: 'Vino', unidad: 'u', stockMinimo: 0, precioVenta: 1000, activo: true, proveedorId: 'pv', categoriaId: 'c' };

  it('warns when the cost is over the sale price, without blocking the save', () => {
    const v = validarProducto({ ...vacio(), nombre: 'Vino', costo: '1500', precioVenta: '1000' });
    expect(v.ok).toBe(true);
    expect(v.ok && avisosProducto(v.datos)).toEqual({ costo: expect.any(String) });
  });

  it('says nothing at break-even, with a profit, or with the cost missing', () => {
    expect(avisosProducto({ ...datos, costo: 1000 })).toEqual({});
    expect(avisosProducto({ ...datos, costo: 1000, precioVenta: 1500 })).toEqual({});
    expect(avisosProducto(datos)).toEqual({});
  });
});

describe('validarCategoria', () => {
  it('trims the name and requires it, unique ignoring case and accents', () => {
    expect(validarCategoria({ nombre: ' Bebidas ' })).toEqual({ ok: true, datos: { nombre: 'Bebidas' } });
    expect(validarCategoria({ nombre: '  ' })).toEqual({ ok: false, errores: { nombre: 'Requerido' } });
    expect(validarCategoria({ nombre: 'bebidas' }, ['Bebidas'])).toEqual({ ok: false, errores: { nombre: 'Ya existe una categoría con ese nombre' } });
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

  it('reads an importe (zero allowed) only for an entrada that adds to the account', () => {
    expect(validarMovimiento({ ...f('entrada', '2'), importe: '1.500,50' })).toEqual({ ok: true, datos: { tipo: 'entrada', cantidad: 2, importe: 150050 } });
    expect(validarMovimiento({ ...f('entrada', '2'), importe: '0' })).toMatchObject({ ok: true, datos: { importe: 0 } });
    expect(validarMovimiento({ ...f('entrada', '2'), importe: '' })).toEqual({ ok: false, errores: { importe: 'Requerido' } });
    expect(validarMovimiento({ ...f('entrada', '0'), importe: '-1' })).toEqual({
      ok: false,
      errores: { cantidad: expect.any(String), importe: 'No puede ser negativo' },
    });
    expect(validarMovimiento({ ...f('ajuste', '2'), importe: '100' })).toEqual({ ok: true, datos: { tipo: 'ajuste', cantidad: 2 } });
  });
});

describe('validarProveedor', () => {
  it('takes a unique name, a term in whole days (15 when empty) and optional text fields', () => {
    expect(validarProveedor({ ...proveedorVacio(), nombre: ' Apícola ', telefono: ' 099 ', nota: '  ' })).toEqual({
      ok: true,
      datos: { nombre: 'Apícola', plazoDias: 15, activo: true, telefono: '099' },
    });
    expect(validarProveedor({ ...proveedorVacio(), nombre: 'A', plazo: '0' })).toMatchObject({ ok: true, datos: { plazoDias: 0 } });
    expect(validarProveedor({ ...proveedorVacio(), nombre: 'A', plazo: '1,5' })).toEqual({
      ok: false,
      errores: { plazo: 'Tiene que ser una cantidad entera de días' },
    });
    expect(validarProveedor({ ...proveedorVacio(), plazo: '-1' })).toEqual({ ok: false, errores: { nombre: 'Requerido', plazo: 'No puede ser negativo' } });
    expect(validarProveedor({ ...proveedorVacio(), nombre: 'apicola' }, ['Apícola'])).toMatchObject({ ok: false, errores: { nombre: expect.any(String) } });
  });

  it('round-trips through the form', () => {
    const p: Proveedor = { id: 'x', actualizadoEn: '', nombre: 'Apícola', plazoDias: 30, activo: false, rut: '21', cuenta: '001-2', nota: 'llamar' };
    expect(validarProveedor(proveedorFormDesde(p))).toEqual({
      ok: true,
      datos: { nombre: 'Apícola', plazoDias: 30, activo: false, rut: '21', cuenta: '001-2', nota: 'llamar' },
    });
  });
});

describe('validarOperacion', () => {
  const o = (tipo: OperacionForm['tipo'], importe: string, nota = ''): OperacionForm => ({ tipo, importe, medioPago: 'transferencia', nota });

  it('takes a positive amount for purchases and payments, keeping the method only on payments', () => {
    expect(validarOperacion(o('compra', '1.500', ' fact. 3 '))).toEqual({ ok: true, datos: { tipo: 'compra', importe: 150000, nota: 'fact. 3' } });
    expect(validarOperacion(o('pago', '200,5'))).toEqual({ ok: true, datos: { tipo: 'pago', importe: 20050, medioPago: 'transferencia' } });
    expect(validarOperacion(o('pago', '-1'))).toEqual({ ok: false, errores: { importe: 'No puede ser negativo' } });
    expect(validarOperacion(o('compra', '0'))).toEqual({ ok: false, errores: { importe: 'No puede ser cero' } });
    expect(validarOperacion(o('compra', ''))).toEqual({ ok: false, errores: { importe: 'Requerido' } });
    expect(validarOperacion({ ...o('pago', '1'), medioPago: 'bitcoin' as never })).toEqual({ ok: false, errores: { medioPago: expect.any(String) } });
  });

  it('takes a signed, non-zero amount for adjustments', () => {
    expect(validarOperacion(o('ajuste', '-1.000'))).toEqual({ ok: true, datos: { tipo: 'ajuste', importe: -100000 } });
    expect(validarOperacion(o('ajuste', '50'))).toEqual({ ok: true, datos: { tipo: 'ajuste', importe: 5000 } });
    expect(validarOperacion(o('ajuste', '0'))).toEqual({ ok: false, errores: { importe: 'No puede ser cero' } });
    expect(validarOperacion(o('ajuste', 'x'))).toMatchObject({ ok: false, errores: { importe: expect.any(String) } });
  });
});

describe('validarVenta', () => {
  it('takes an optional discount from 0 to 100 %, with decimals', () => {
    expect(validarVenta({ descuento: '', nota: '' })).toEqual({ ok: true, datos: { descuentoPct: 0 } });
    expect(validarVenta({ descuento: '12,5', nota: ' feria ' })).toEqual({ ok: true, datos: { descuentoPct: 12.5, nota: 'feria' } });
    expect(validarVenta({ descuento: '100', nota: '' }).ok).toBe(true);
    expect(validarVenta({ descuento: '100,5', nota: '' })).toEqual({ ok: false, errores: { descuento: 'Máximo 100' } });
    expect(validarVenta({ descuento: '-5', nota: '' })).toEqual({ ok: false, errores: { descuento: 'No puede ser negativo' } });
    expect(validarVenta({ descuento: 'diez', nota: '' }).ok).toBe(false);
  });

  it('leaves sales out of the quick movement form', () => {
    expect(TIPOS_RAPIDOS.map((t) => t.id)).toEqual(['entrada', 'ajuste']);
  });
});

describe('validarPromo', () => {
  const form = (f: Partial<PromoForm> = {}): PromoForm => ({
    ...promoVacia(),
    nombre: ' Combo ',
    precio: '5.000',
    componentes: [
      { productoId: 'jugo', cantidad: '1' },
      { productoId: 'ensalada', cantidad: '0,5' },
    ],
    ...f,
  });

  it('reads name, price and components', () => {
    expect(validarPromo(form())).toEqual({
      ok: true,
      datos: {
        nombre: 'Combo',
        precio: 500000,
        activo: true,
        componentes: [
          { productoId: 'jugo', cantidad: 1 },
          { productoId: 'ensalada', cantidad: 0.5 },
        ],
      },
    });
    expect(validarPromo(form({ precio: '0' })).ok).toBe(true);
  });

  it('merges a product added twice', () => {
    const r = validarPromo(form({ componentes: [{ productoId: 'jugo', cantidad: '1' }, { productoId: 'jugo', cantidad: '2' }] }));
    expect(r.ok && r.datos.componentes).toEqual([{ productoId: 'jugo', cantidad: 3 }]);
  });

  it('reports every invalid field', () => {
    expect(validarPromo(form({ nombre: '', precio: '', componentes: [] }))).toEqual({
      ok: false,
      errores: { nombre: 'Requerido', precio: 'Requerido', componentes: 'Agregá al menos un producto' },
    });
    expect(validarPromo(form(), ['combo'])).toMatchObject({ ok: false, errores: { nombre: 'Ya existe una promo con ese nombre' } });
    const malas = form({ componentes: [{ productoId: 'jugo', cantidad: '0' }, { productoId: 'x', cantidad: 'a' }] });
    expect(validarPromo(malas)).toEqual({ ok: false, errores: { componentes: 'Hay 2 cantidades inválidas' } });
  });

  it('round-trips through the form', () => {
    const p: Promo = { id: 'p', actualizadoEn: '', nombre: 'Combo', precio: 123450, activo: false, componentes: [{ productoId: 'jugo', cantidad: 1.5 }] };
    const r = validarPromo(promoFormDesde(p));
    expect(r).toEqual({ ok: true, datos: { nombre: 'Combo', precio: 123450, activo: false, componentes: [{ productoId: 'jugo', cantidad: 1.5 }] } });
  });
});
