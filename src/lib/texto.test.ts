import { describe, expect, it } from 'vitest';
import { coincide, formatFechaHora, normalizar } from './texto';

describe('texto', () => {
  it('normalizes case and accents', () => {
    expect(normalizar(' Azúcar Ñandú ')).toBe('azucar nandu');
  });

  it('matches every word', () => {
    expect(coincide('Harina 000', '')).toBe(true);
    expect(coincide('Azúcar impalpable', 'azucar')).toBe(true);
    expect(coincide('Azúcar impalpable', 'imp azu')).toBe(true);
    expect(coincide('Azúcar impalpable', 'harina')).toBe(false);
  });
});

describe('formatFechaHora', () => {
  it('formats in local time, day first', () => {
    expect(formatFechaHora(new Date(2026, 2, 5, 14, 7).toISOString())).toBe('05/03/2026 14:07');
    expect(formatFechaHora('x')).toBe('—');
  });
});
