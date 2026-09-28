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

export const NUMERO_INVALIDO = 'No es un número (ej.: 1,5 o 1.250)';
export const MONTO_INVALIDO = 'No es un monto (ej.: 1.500 o 1500,50)';

/** Parses a decimal field and checks its range. */
export function leerNumero(texto: string, r: Rango = {}): Resultado {
  if (!texto.trim()) return { ok: false, error: 'Requerido' };
  const n = parseDecimal(texto);
  if (Number.isNaN(n)) return { ok: false, error: NUMERO_INVALIDO };
  const piso = r.min ?? r.mayorQue;
  if (n < 0 && piso !== undefined && piso >= 0) return { ok: false, error: 'No puede ser negativo' };
  if (r.min !== undefined && n < r.min) return { ok: false, error: `Mínimo ${formatNumero(r.min)}` };
  if (r.mayorQue !== undefined && n <= r.mayorQue) return { ok: false, error: `Debe ser mayor que ${formatNumero(r.mayorQue)}` };
  if (r.menorQue !== undefined && n >= r.menorQue) return { ok: false, error: `Debe ser menor que ${formatNumero(r.menorQue)}` };
  return { ok: true, valor: n };
}

/** Parses a non-negative amount of pesos into cents. */
export function leerPesos(texto: string): Resultado {
  if (!texto.trim()) return { ok: false, error: 'Requerido' };
  const c = parsePesos(texto);
  if (Number.isNaN(c)) return { ok: false, error: MONTO_INVALIDO };
  if (c < 0) return { ok: false, error: 'No puede ser negativo' };
  return { ok: true, valor: c };
}

/** Field errors as one readable line, each prefixed by its field's label: "Nombre: Requerido · Precio: …". */
export function describirErrores(errores: Partial<Record<string, string>>, etiquetas: Partial<Record<string, string>>): string {
  return Object.entries(errores)
    .filter(([, e]) => e)
    .map(([k, e]) => (etiquetas[k] ? `${etiquetas[k]}: ${e}` : e))
    .join(' · ');
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
