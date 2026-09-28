import { describe, expect, it } from 'vitest';
import { seccionDesdeHash } from './nav';

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
