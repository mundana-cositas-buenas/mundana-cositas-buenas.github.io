import { describe, expect, it } from 'vitest';
import type { LineaCostoFijo, LineaInsumo, Receta } from './types';
import {
  cabeceraDesde,
  filaDesde,
  leerFila,
  leerNumero,
  leerPesos,
  numeroEditable,
  validarCabecera,
  validarInsumo,
  type InsumoForm,
} from './validar';

describe('leerNumero / leerPesos', () => {
  it('parses and checks ranges', () => {
    expect(leerNumero('1,5')).toEqual({ ok: true, valor: 1.5 });
    expect(leerNumero('')).toEqual({ ok: false, error: 'Requerido' });
    expect(leerNumero('x')).toEqual({ ok: false, error: 'Número inválido' });
    expect(leerNumero('-1', { min: 0 })).toEqual({ ok: false, error: 'No puede ser negativo' });
    expect(leerNumero('0', { mayorQue: 0 }).ok).toBe(false);
    expect(leerNumero('100', { min: 0, menorQue: 100 }).ok).toBe(false);
    expect(leerPesos('1.000')).toEqual({ ok: true, valor: 100000 });
    expect(leerPesos('-1').ok).toBe(false);
  });
});

describe('validarInsumo', () => {
  const form: InsumoForm = { nombre: ' Harina ', unidadBase: 'g', precio: '1000', cantidad: '1', unidadCompra: 'kg' };

  it('builds the record', () => {
    expect(validarInsumo(form)).toEqual({
      ok: true,
      datos: { nombre: 'Harina', unidadBase: 'g', precioCompra: 100000, cantidadCompra: 1, unidadCompra: 'kg' },
    });
  });

  it('reports every field error', () => {
    const r = validarInsumo({ ...form, nombre: '', precio: 'x', cantidad: '0' });
    expect(r.ok).toBe(false);
    expect(!r.ok && Object.keys(r.errores).sort()).toEqual(['cantidad', 'nombre', 'precio']);
  });

  it('rejects duplicate names and mixed units', () => {
    expect(validarInsumo(form, ['harina'])).toMatchObject({ ok: false, errores: { nombre: expect.any(String) } });
    expect(validarInsumo({ ...form, unidadCompra: 'l' })).toMatchObject({
      ok: false,
      errores: { unidadCompra: expect.stringMatching(/incompatible/) },
    });
  });
});

describe('recipe header', () => {
  const receta: Receta = {
    id: 'r',
    actualizadoEn: '',
    nombre: 'Pan',
    rendimiento: 1.5,
    unidadRendimiento: 'kg',
    margen: 40,
    notas: 'n',
  };

  it('round-trips through the form', () => {
    expect(numeroEditable(1500.25)).toBe('1500,25');
    expect(cabeceraDesde(receta)).toEqual({ nombre: 'Pan', rendimiento: '1,5', unidadRendimiento: 'kg', margen: '40', notas: 'n' });
    expect(validarCabecera(cabeceraDesde(receta))).toEqual({
      ok: true,
      datos: { nombre: 'Pan', rendimiento: 1.5, unidadRendimiento: 'kg', margen: 40, notas: 'n' },
    });
  });

  it('requires a name and a positive yield; empty margin is 0', () => {
    const f = cabeceraDesde(receta);
    expect(validarCabecera({ ...f, margen: '' })).toMatchObject({ ok: true, datos: { margen: 0 } });
    const r = validarCabecera({ ...f, nombre: ' ', rendimiento: '0', margen: '-5' });
    expect(!r.ok && Object.keys(r.errores).sort()).toEqual(['margen', 'nombre', 'rendimiento']);
  });
});

describe('recipe lines', () => {
  const li: LineaInsumo = {
    id: 'l',
    actualizadoEn: '',
    recetaId: 'r',
    orden: 0,
    tipo: 'insumo',
    insumoId: 'i',
    cantidad: 0.25,
    unidad: 'kg',
    mermaPct: 0,
  };
  const lf: LineaCostoFijo = { id: 'f', actualizadoEn: '', recetaId: 'r', orden: 1, tipo: 'costoFijo', descripcion: 'gas', monto: 12345 };

  it('round-trips lines', () => {
    expect(filaDesde(li)).toMatchObject({ cantidad: '0,25', merma: '' });
    expect(leerFila(filaDesde(li))).toEqual({ linea: li, errores: {} });
    expect(filaDesde(lf)).toMatchObject({ monto: '123,45' });
    expect(leerFila(filaDesde(lf))).toEqual({ linea: lf, errores: {} });
  });

  it('marks invalid fields as NaN with an error', () => {
    const f = filaDesde(li);
    if (f.tipo !== 'insumo') throw new Error();
    const r = leerFila({ ...f, cantidad: 'x', merma: '100' });
    expect(Object.keys(r.errores).sort()).toEqual(['cantidad', 'merma']);
    expect(r.linea.tipo === 'insumo' && r.linea.cantidad).toBeNaN();
  });
});
