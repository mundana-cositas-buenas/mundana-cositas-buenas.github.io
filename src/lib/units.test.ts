import { describe, expect, it } from 'vitest';
import { aBase, baseDe, esUnidad, esUnidadBase, UnidadIncompatible, unidadesDe, unidadMayor } from './units';

describe('aBase', () => {
  it('converts within a family', () => {
    expect(aBase(1, 'kg', 'g')).toBe(1000);
    expect(aBase(0.25, 'kg', 'g')).toBe(250);
    expect(aBase(100, 'g', 'g')).toBe(100);
    expect(aBase(1.5, 'l', 'ml')).toBe(1500);
    expect(aBase(330, 'ml', 'ml')).toBe(330);
    expect(aBase(12, 'u', 'u')).toBe(12);
  });

  it('rejects mixing families', () => {
    expect(() => aBase(1, 'kg', 'ml')).toThrow(UnidadIncompatible);
    expect(() => aBase(1, 'l', 'g')).toThrow(UnidadIncompatible);
    expect(() => aBase(1, 'u', 'g')).toThrow(/peso/);
    expect(() => aBase(1, 'g', 'u')).toThrow(/Unidad incompatible/);
  });
});

describe('unit helpers', () => {
  it('knows families', () => {
    expect(baseDe('kg')).toBe('g');
    expect(baseDe('l')).toBe('ml');
    expect(unidadesDe('g')).toEqual(['g', 'kg']);
    expect(unidadesDe('ml')).toEqual(['ml', 'l']);
    expect(unidadesDe('u')).toEqual(['u']);
    expect(unidadMayor('g')).toEqual({ unidad: 'kg', factor: 1000 });
    expect(unidadMayor('u')).toEqual({ unidad: 'u', factor: 1 });
  });

  it('validates unit strings', () => {
    expect(esUnidad('kg')).toBe(true);
    expect(esUnidad('lb')).toBe(false);
    expect(esUnidad('toString')).toBe(false);
    expect(esUnidadBase('g')).toBe(true);
    expect(esUnidadBase('kg')).toBe(false);
  });
});
