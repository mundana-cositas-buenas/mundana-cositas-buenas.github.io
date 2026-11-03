import { describe, expect, it } from 'vitest';
import { buscarPorNombre, coincide, diaLocal, formatFecha, formatFechaHora, formatHora, normalizar } from './texto';

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

describe('buscarPorNombre', () => {
  const ps = ['Vino tinto', 'Vino blanco', 'Té', 'Té verde'].map((nombre) => ({ nombre }));

  it('prefers an exact name, then a single partial match', () => {
    expect(buscarPorNombre(ps, 'te')?.nombre).toBe('Té');
    expect(buscarPorNombre(ps, 'tin')?.nombre).toBe('Vino tinto');
    expect(buscarPorNombre(ps, 'vino bla')?.nombre).toBe('Vino blanco');
  });

  it('returns nothing when ambiguous, unknown or empty', () => {
    expect(buscarPorNombre(ps, 'vino')).toBeUndefined();
    expect(buscarPorNombre(ps, 'miel')).toBeUndefined();
    expect(buscarPorNombre(ps, ' ')).toBeUndefined();
  });
});

describe('formatFecha / formatHora / diaLocal', () => {
  it('use the local date and time', () => {
    const iso = new Date(2026, 2, 5, 9, 7).toISOString();
    expect(formatFecha(iso)).toBe('05/03/2026');
    expect(formatHora(iso)).toBe('09:07');
    expect(diaLocal(iso)).toBe('2026-03-05');
    expect(diaLocal(new Date(2026, 2, 5, 23, 59).toISOString())).toBe('2026-03-05');
    expect(formatFecha('x')).toBe('—');
    expect(formatHora('x')).toBe('—');
  });
});
