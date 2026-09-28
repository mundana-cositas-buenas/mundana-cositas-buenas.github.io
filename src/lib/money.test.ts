import { describe, expect, it } from 'vitest';
import { formatNumero, formatPesos, parseDecimal, parsePesos, pesosEditable } from './money';

describe('parseDecimal', () => {
  it('accepts comma or dot decimals', () => {
    expect(parseDecimal('12')).toBe(12);
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal('0,25')).toBe(0.25);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('  7 ')).toBe(7);
  });

  it('understands thousands separators', () => {
    expect(parseDecimal('1.500')).toBe(1500);
    expect(parseDecimal('1.234.567')).toBe(1234567);
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('1,234.56')).toBe(1234.56);
    expect(parseDecimal('$ 2.000')).toBe(2000);
  });

  it('handles negatives', () => {
    expect(parseDecimal('-3,5')).toBe(-3.5);
  });

  it('rejects garbage', () => {
    for (const s of ['', ' ', 'abc', '1,2,3', '1.23.4', '1,2.3,4', '.', '--1', '1e3']) {
      expect(parseDecimal(s), s).toBeNaN();
    }
  });
});

describe('parsePesos', () => {
  it('returns integer cents', () => {
    expect(parsePesos('1000')).toBe(100000);
    expect(parsePesos('1.234,56')).toBe(123456);
    expect(parsePesos('0,1')).toBe(10);
    expect(parsePesos('19,999')).toBe(2000);
    expect(parsePesos('x')).toBeNaN();
  });
});

describe('formatting', () => {
  it('formats pesos', () => {
    expect(formatPesos(0)).toBe('$ 0,00');
    expect(formatPesos(10000)).toBe('$ 100,00');
    expect(formatPesos(123456789)).toBe('$ 1.234.567,89');
    expect(formatPesos(33.4)).toBe('$ 0,33');
    expect(formatPesos(-150)).toBe('-$ 1,50');
    expect(formatPesos(NaN)).toBe('—');
  });

  it('formats numbers', () => {
    expect(formatNumero(1500)).toBe('1.500');
    expect(formatNumero(0.25)).toBe('0,25');
    expect(formatNumero(1 / 3)).toBe('0,333');
    expect(formatNumero(-2.5)).toBe('-2,5');
    expect(formatNumero(-0.0001)).toBe('0');
  });

  it('round-trips editable pesos', () => {
    expect(pesosEditable(123450)).toBe('1234,50');
    expect(parsePesos(pesosEditable(123456))).toBe(123456);
    expect(pesosEditable(5)).toBe('0,05');
  });
});
