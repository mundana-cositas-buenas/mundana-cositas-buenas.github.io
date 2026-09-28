// CSV for spreadsheets set to Spanish (Argentina): `;` separator, comma decimals, UTF-8 BOM so Excel reads accents.

import { numeroEditable } from './campos';
import { pesosEditable, type Centavos } from './money';

export type Celda = string | number | undefined;

function celda(c: Celda): string {
  if (c === undefined || (typeof c === 'number' && !Number.isFinite(c))) return '';
  const s = typeof c === 'number' ? numeroEditable(c) : c;
  return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function aCsv(filas: readonly (readonly Celda[])[]): string {
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
}

/** Cents as a plain amount ("1234,50"); empty if missing or invalid. */
export function pesosCsv(c: Centavos | undefined): string {
  return c === undefined || !Number.isFinite(c) ? '' : pesosEditable(c);
}
