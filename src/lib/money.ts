// Money is integer cents. Intermediate costs (e.g. cost per gram) may be fractional
// cents; they are rounded only when formatted.

export type Centavos = number;

/**
 * Parses a user-typed decimal number, Argentine style or not:
 * "1.234,5", "1234,5", "1234.5", "1.500" (thousands), "$ 2.000". Returns NaN if invalid.
 */
export function parseDecimal(texto: string): number {
  let s = texto.replace(/[\s$ ]/g, '');
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  let entero: string;
  let decimales = '';
  if (coma >= 0 && punto >= 0) {
    // The last separator is the decimal one; the other groups thousands.
    const dec = Math.max(coma, punto);
    const miles = coma > punto ? '.' : ',';
    const grupos = s.slice(0, dec).split(miles);
    if (!/^\d{1,3}$/.test(grupos[0]) || !grupos.slice(1).every((g) => /^\d{3}$/.test(g))) return NaN;
    entero = grupos.join('');
    decimales = s.slice(dec + 1);
    if (/[.,]/.test(decimales)) return NaN;
  } else if (coma >= 0) {
    if (s.indexOf(',') !== coma) return NaN;
    entero = s.slice(0, coma);
    decimales = s.slice(coma + 1);
  } else if (punto >= 0) {
    // "1.500" and "1.234.567" are thousands; "1.5" is a decimal.
    const grupos = s.split('.');
    if (grupos.length > 2 || grupos[1].length === 3) {
      if (!grupos.slice(1).every((g) => g.length === 3)) return NaN;
      entero = grupos.join('');
    } else {
      [entero, decimales] = grupos;
    }
  } else {
    entero = s;
  }
  const n = Number(`${entero || '0'}.${decimales || '0'}`);
  return neg ? -n : n;
}

/** Parses pesos into integer cents (NaN if invalid). */
export function parsePesos(texto: string): Centavos {
  const n = parseDecimal(texto);
  return Number.isNaN(n) ? NaN : Math.round(n * 100);
}

function agrupar(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formats a number with comma decimals, dot thousands and up to `maxDecimales` decimals. */
export function formatNumero(n: number, maxDecimales = 3): string {
  if (!Number.isFinite(n)) return '—';
  const [ent, dec = ''] = Math.abs(n).toFixed(maxDecimales).split('.');
  const d = dec.replace(/0+$/, '');
  const s = agrupar(ent) + (d ? `,${d}` : '');
  return n < 0 && s !== '0' ? `-${s}` : s;
}

/** "$ 1.234,56". Rounds fractional cents. */
export function formatPesos(c: Centavos): string {
  if (!Number.isFinite(c)) return '—';
  const r = Math.round(c);
  const abs = Math.abs(r);
  const s = `$ ${agrupar(String(Math.floor(abs / 100)))},${String(abs % 100).padStart(2, '0')}`;
  return r < 0 ? `-${s}` : s;
}

/** Cents as an editable string without the currency sign: "1234,50". */
export function pesosEditable(c: Centavos): string {
  const r = Math.round(c);
  const abs = Math.abs(r);
  return `${r < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
