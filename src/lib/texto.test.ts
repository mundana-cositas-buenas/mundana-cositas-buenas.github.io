import { describe, expect, it } from 'vitest';
import { coincide, normalizar } from './texto';

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
