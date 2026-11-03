import { describe, expect, it } from 'vitest';
import { seccionDesdeHash, subruta } from './nav';

describe('seccionDesdeHash', () => {
  it('parses known sections', () => {
    expect(seccionDesdeHash('#/stock')).toBe('stock');
    expect(seccionDesdeHash('#backup')).toBe('backup');
    expect(seccionDesdeHash('#/costos/receta/123')).toBe('costos');
  });

  it('defaults to ventas, the home page', () => {
    expect(seccionDesdeHash('')).toBe('ventas');
    expect(seccionDesdeHash('#/nada')).toBe('ventas');
    expect(seccionDesdeHash('#/ventas')).toBe('ventas');
  });
});

describe('subruta', () => {
  it('returns the segments after the section', () => {
    expect(subruta('#/costos/receta/abc')).toEqual(['receta', 'abc']);
    expect(subruta('#/costos/insumos/')).toEqual(['insumos']);
    expect(subruta('#/costos')).toEqual([]);
    expect(subruta('')).toEqual([]);
  });
});
