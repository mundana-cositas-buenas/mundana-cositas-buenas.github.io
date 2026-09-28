import { describe, expect, it } from 'vitest';
import { describirErrores, leerNumero, leerPesos, NUMERO_INVALIDO, nombreRepetido, numeroEditable, porNombre } from './campos';

describe('leerNumero / leerPesos', () => {
  it('parses and checks ranges', () => {
    expect(leerNumero('1,5')).toEqual({ ok: true, valor: 1.5 });
    expect(leerNumero('')).toEqual({ ok: false, error: 'Requerido' });
    expect(leerNumero('x')).toEqual({ ok: false, error: NUMERO_INVALIDO });
    expect(leerNumero('-1', { min: 0 })).toEqual({ ok: false, error: 'No puede ser negativo' });
    expect(leerNumero('0', { mayorQue: 0 }).ok).toBe(false);
    expect(leerNumero('100', { min: 0, menorQue: 100 }).ok).toBe(false);
    expect(leerPesos('1.000')).toEqual({ ok: true, valor: 100000 });
    expect(leerPesos('-1')).toEqual({ ok: false, error: 'No puede ser negativo' });
  });

  it('says "negative" rather than a bare range when the floor is zero', () => {
    expect(leerNumero('-2', { mayorQue: 0 })).toEqual({ ok: false, error: 'No puede ser negativo' });
    expect(leerNumero('0', { mayorQue: 0 })).toEqual({ ok: false, error: 'Debe ser mayor que 0' });
    expect(leerNumero('-5', {})).toEqual({ ok: true, valor: -5 });
    expect(leerNumero('99,95', { menorQue: 99.9 })).toEqual({ ok: false, error: 'Debe ser menor que 99,9' });
  });
});

describe('helpers', () => {
  it('describirErrores labels each field and skips empty ones', () => {
    expect(describirErrores({ nombre: 'Requerido', precio: 'No puede ser negativo', general: 'Falló' }, { nombre: 'Nombre', precio: 'Precio' })).toBe(
      'Nombre: Requerido · Precio: No puede ser negativo · Falló',
    );
    expect(describirErrores({ nombre: undefined }, { nombre: 'Nombre' })).toBe('');
  });

  it('numeroEditable drops thousands separators', () => {
    expect(numeroEditable(1500.25)).toBe('1500,25');
  });

  it('nombreRepetido ignores case, accents and spaces', () => {
    expect(nombreRepetido(' azucar ', ['Harina', 'Azúcar'])).toBe(true);
    expect(nombreRepetido('sal', ['salsa'])).toBe(false);
  });

  it('porNombre sorts ignoring case and accents', () => {
    expect(['sal', 'Azúcar', 'harina'].map((nombre) => ({ nombre })).sort(porNombre).map((x) => x.nombre)).toEqual([
      'Azúcar',
      'harina',
      'sal',
    ]);
  });
});
