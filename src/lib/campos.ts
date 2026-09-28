// Shared parsing of user-typed form fields (strings) into values, for every module.

import { formatNumero, parseDecimal, parsePesos } from './money';
import { normalizar } from './texto';

export type Resultado = { ok: true; valor: number } | { ok: false; error: string };

export type Errores<F> = Partial<Record<keyof F | 'general', string>>;

export type Validado<T, F> = { ok: true; datos: T } | { ok: false; errores: Errores<F> };

interface Rango {
  min?: number; // inclusive
  mayorQue?: number; // exclusive
  menorQue?: number; // exclusive
}

/** Parses a decimal field and checks its range. */
export function leerNumero(texto: string, r: Rango = {}): Resultado {
  if (!texto.trim()) return { ok: false, error: 'Requerido' };
  const n = parseDecimal(texto);
  if (Number.isNaN(n)) return { ok: false, error: 'Número inválido' };
  if (r.min !== undefined && n < r.min) return { ok: false, error: n < 0 ? 'No puede ser negativo' : `Mínimo ${r.min}` };
  if (r.mayorQue !== undefined && n <= r.mayorQue) return { ok: false, error: `Debe ser mayor que ${r.mayorQue}` };
  if (r.menorQue !== undefined && n >= r.menorQue) return { ok: false, error: `Debe ser menor que ${r.menorQue}` };
  return { ok: true, valor: n };
}

/** Parses a non-negative amount of pesos into cents. */
export function leerPesos(texto: string): Resultado {
  if (!texto.trim()) return { ok: false, error: 'Requerido' };
  const c = parsePesos(texto);
  if (Number.isNaN(c)) return { ok: false, error: 'Monto inválido' };
  if (c < 0) return { ok: false, error: 'No puede ser negativo' };
  return { ok: true, valor: c };
}

/** A number as an editable string: comma decimals, no thousands separator. */
export function numeroEditable(n: number): string {
  return formatNumero(n, 6).replaceAll('.', '');
}

/** True if `nombre` matches one of `otros`, ignoring case, accents and surrounding spaces. */
export function nombreRepetido(nombre: string, otros: readonly string[]): boolean {
  const n = normalizar(nombre);
  return otros.some((o) => normalizar(o) === n);
}

export const porNombre = <T extends { nombre: string }>(a: T, b: T) =>
  a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
