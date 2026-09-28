import { describe, expect, it } from 'vitest';
import { aCsv, pesosCsv } from './csv';

describe('aCsv', () => {
  it('uses ; and CRLF, with a BOM, and comma decimals', () => {
    expect(aCsv([['a', 1.5], ['b', 1234]])).toBe('﻿a;1,5\r\nb;1234\r\n');
  });

  it('quotes cells with separators, quotes or line breaks', () => {
    expect(aCsv([['x;y', 'di "hola"', 'l1\nl2', 'ok']])).toBe('﻿"x;y";"di ""hola""";"l1\nl2";ok\r\n');
  });

  it('leaves missing and invalid numbers empty', () => {
    expect(aCsv([[undefined, NaN, 0]])).toBe('﻿;;0\r\n');
  });
});

describe('pesosCsv', () => {
  it('formats cents without the currency sign', () => {
    expect(pesosCsv(123450)).toBe('1234,50');
    expect(pesosCsv(10.6)).toBe('0,11');
    expect(pesosCsv(undefined)).toBe('');
    expect(pesosCsv(NaN)).toBe('');
  });
});
