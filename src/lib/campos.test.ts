import { describe, expect, it } from 'vitest';
import { leerNumero, leerPesos, nombreRepetido, numeroEditable, porNombre } from './campos';

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

describe('helpers', () => {
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
