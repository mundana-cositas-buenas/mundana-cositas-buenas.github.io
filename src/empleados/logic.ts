// Pure shift math: durations, overlaps, pending (forgotten) shifts and hour totals.

import { diaLocal } from '../lib/texto';
import type { Turno } from './types';

/** A shift longer than this many hours gets a warning (likely a forgotten clock-out). */
export const HORAS_AVISO = 14;

const MINUTO = 60_000;

/** The date with seconds and milliseconds dropped: shifts are recorded to the minute. */
export function aMinuto(d: Date): Date {
  return new Date(Math.floor(d.getTime() / MINUTO) * MINUTO);
}

/** Whole minutes between two ISO dates. */
export function minutosEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / MINUTO);
}

/** A closed shift's length in minutes; an open one counts up to `ahora`. */
export function minutosDe(t: Pick<Turno, 'entrada' | 'salida'>, ahora = new Date()): number {
  return minutosEntre(t.entrada, t.salida ?? aMinuto(ahora).toISOString());
}

/** Minutes as "h:mm" ("7:45", "0:05", "123:00"). */
export function formatDuracion(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Minutes as decimal hours, rounded to two decimals (for spreadsheets). */
export const horasDecimales = (minutos: number) => Math.round((minutos / 60) * 100) / 100;

/** The local day a shift belongs to: the day it started ("2026-03-05"). */
export const diaDe = (t: Pick<Turno, 'entrada'>) => diaLocal(t.entrada);

export const abierto = (t: Turno) => !t.salida && !t.anuladoEn;

/** True if the shift (an open one up to now) is long enough to be suspicious. */
export const largo = (t: Turno, ahora = new Date()) => !t.anuladoEn && minutosDe(t, ahora) > HORAS_AVISO * 60;

/**
 * An open shift that started on an earlier day and is already too long: someone forgot to clock out.
 * (A night shift still open after midnight isn't pending until it gets too long.)
 */
export const pendiente = (t: Turno, ahora = new Date()) => abierto(t) && diaDe(t) < diaLocal(ahora.toISOString()) && largo(t, ahora);

export function turnosPendientes(turnos: readonly Turno[], ahora = new Date()): Turno[] {
  return turnos.filter((t) => pendiente(t, ahora)).sort((a, b) => a.entrada.localeCompare(b.entrada));
}

const limites = (t: Pick<Turno, 'entrada' | 'salida'>): [number, number] => [Date.parse(t.entrada), t.salida ? Date.parse(t.salida) : Infinity];

/** The first non-voided shift in `otros` (other than `t` itself) that overlaps `t`. An open shift runs until it's closed. */
export function superpuesto(t: Pick<Turno, 'id' | 'entrada' | 'salida'>, otros: readonly Turno[]): Turno | undefined {
  const [a, b] = limites(t);
  return otros.find((o) => {
    if (o.id === t.id || o.anuladoEn) return false;
    const [c, d] = limites(o);
    return a < d && c < b;
  });
}

/**
 * Why a new or changed shift can't be saved, or undefined if it can: not in the future, exit after entry,
 * and no overlap with the employee's other shifts (which also means at most one open shift).
 */
export function problemaTurno(t: Pick<Turno, 'id' | 'entrada' | 'salida'>, otros: readonly Turno[], ahora = new Date()): string | undefined {
  const tope = ahora.getTime();
  if (Date.parse(t.entrada) > tope) return 'La entrada no puede ser en el futuro';
  if (t.salida) {
    if (Date.parse(t.salida) > tope) return 'La salida no puede ser en el futuro';
    if (minutosEntre(t.entrada, t.salida) < 1) return 'La salida tiene que ser posterior a la entrada';
  }
  const o = superpuesto(t, otros);
  if (!o) return undefined;
  if (!o.salida) return `Ya tiene un turno abierto desde ${describirMomento(o.entrada)}: cerralo primero`;
  return `Se superpone con el turno de ${describirMomento(o.entrada)} a ${describirMomento(o.salida)}`;
}

const dos = (n: number) => String(n).padStart(2, '0');

function describirMomento(iso: string): string {
  const d = new Date(iso);
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export interface Horas {
  minutos: number;
  turnos: number;
}

/**
 * Worked time per employee id, over the closed, non-voided shifts that started between the local days
 * `desde` and `hasta` ("2026-03-05", both included). Open shifts don't count until they're closed.
 */
export function horasPorEmpleado(turnos: readonly Turno[], desde: string, hasta: string): Map<string, Horas> {
  const r = new Map<string, Horas>();
  for (const t of turnos) {
    if (t.anuladoEn || !t.salida) continue;
    const dia = diaDe(t);
    if (dia < desde || dia > hasta) continue;
    const h = r.get(t.empleadoId) ?? { minutos: 0, turnos: 0 };
    h.minutos += minutosDe(t);
    h.turnos++;
    r.set(t.empleadoId, h);
  }
  return r;
}

export interface Rango {
  desde: string;
  hasta: string;
}

const diaDeFecha = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

/** "2026-03-05" as a local Date at midnight. */
export function fechaDeDia(dia: string): Date {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The week (Monday to Sunday) of a local day. */
export function semanaDe(dia: string): Rango {
  const d = fechaDeDia(dia);
  const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
  return { desde: diaDeFecha(lunes), hasta: diaDeFecha(domingo) };
}

/** The calendar month of a local day. */
export function mesDe(dia: string): Rango {
  const d = fechaDeDia(dia);
  return { desde: diaDeFecha(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: diaDeFecha(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

/** The same kind of range moved back (-1) or forward (+1): a week by 7 days, a month by one month. */
export function moverRango(r: Rango, tipo: 'semana' | 'mes', paso: number): Rango {
  const d = fechaDeDia(r.desde);
  return tipo === 'semana'
    ? semanaDe(diaDeFecha(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * paso)))
    : mesDe(diaDeFecha(new Date(d.getFullYear(), d.getMonth() + paso, 1)));
}
