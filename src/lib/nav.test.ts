import { describe, expect, it } from 'vitest';
import { seccionDesdeHash, subruta } from './nav';

describe('seccionDesdeHash', () => {
  it('parses known sections', () => {
    expect(seccionDesdeHash('#/stock')).toBe('stock');
    expect(seccionDesdeHash('#backup')).toBe('backup');
    expect(seccionDesdeHash('#/costos/receta/123')).toBe('costos');
  });

  it('defaults to costos', () => {
    expect(seccionDesdeHash('')).toBe('costos');
    expect(seccionDesdeHash('#/nada')).toBe('costos');
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
