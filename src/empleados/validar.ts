// Employee and shift forms (strings) → records. Times come from <input type="date"> ("2026-03-05")
// and <input type="time"> ("09:30"), read as local time.

import { nombreRepetido, type Errores, type Validado } from '../lib/campos';
import { diaLocal } from '../lib/texto';
import { aMinuto, fechaDeDia } from './logic';
import type { Empleado } from './types';

export interface EmpleadoForm {
  nombre: string;
  activo: boolean;
}

export const ETIQUETAS_EMPLEADO: Record<keyof EmpleadoForm, string> = { nombre: 'Nombre', activo: 'Activo' };

export type DatosEmpleado = Omit<Empleado, 'id' | 'actualizadoEn'>;

export const empleadoVacio = (): EmpleadoForm => ({ nombre: '', activo: true });

export const empleadoFormDesde = (e: Empleado): EmpleadoForm => ({ nombre: e.nombre, activo: e.activo });

export function validarEmpleado(f: EmpleadoForm, otrosNombres: readonly string[] = []): Validado<DatosEmpleado, EmpleadoForm> {
  const nombre = f.nombre.trim();
  if (!nombre) return { ok: false, errores: { nombre: 'Requerido' } };
  if (nombreRepetido(nombre, otrosNombres)) return { ok: false, errores: { nombre: 'Ya existe un empleado con ese nombre' } };
  return { ok: true, datos: { nombre, activo: f.activo } };
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA = /^(\d{1,2}):(\d{2})$/;

/** "2026-03-05" if it's a real date. */
function leerDia(texto: string): string | undefined {
  const m = DIA.exec(texto.trim());
  if (!m) return undefined;
  const d = fechaDeDia(m[0]);
  return d.getFullYear() === +m[1] && d.getMonth() + 1 === +m[2] && d.getDate() === +m[3] ? m[0] : undefined;
}

/** Minutes since midnight for "9:30" / "09:30". */
function leerHora(texto: string): number | undefined {
  const m = HORA.exec(texto.trim());
  if (!m) return undefined;
  const [h, min] = [+m[1], +m[2]];
  return h < 24 && min < 60 ? h * 60 + min : undefined;
}

const enDia = (dia: string, minutos: number, diasMas = 0) => {
  const d = fechaDeDia(dia);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diasMas, Math.floor(minutos / 60), minutos % 60);
};

const HORA_INVALIDA = 'No es una hora (ej.: 09:30)';
const FUTURO = 'No puede ser en el futuro';

export interface TurnoForm {
  dia: string; // the day the shift starts
  entrada: string; // "09:30"
  salida: string; // "17:00"; earlier than the entry = the next day
}

export const ETIQUETAS_TURNO: Record<keyof TurnoForm, string> = { dia: 'Día', entrada: 'Entrada', salida: 'Salida' };

export interface DatosTurno {
  entrada: string; // ISO 8601
  salida: string; // ISO 8601
}

/** A whole shift typed by hand. A shift crossing midnight is typed with the exit time of the next day. */
export function validarTurno(f: TurnoForm, ahora = new Date()): Validado<DatosTurno, TurnoForm> {
  const errores: Errores<TurnoForm> = {};
  const dia = leerDia(f.dia);
  const entrada = leerHora(f.entrada);
  const salida = leerHora(f.salida);
  if (!f.dia.trim()) errores.dia = 'Requerido';
  else if (!dia) errores.dia = 'No es una fecha';
  if (!f.entrada.trim()) errores.entrada = 'Requerido';
  else if (entrada === undefined) errores.entrada = HORA_INVALIDA;
  if (!f.salida.trim()) errores.salida = 'Requerido';
  else if (salida === undefined) errores.salida = HORA_INVALIDA;
  else if (salida === entrada) errores.salida = 'Tiene que ser distinta de la entrada';
  if (!dia || entrada === undefined || salida === undefined || errores.salida) return { ok: false, errores };
  const e = enDia(dia, entrada);
  const s = enDia(dia, salida, salida < entrada ? 1 : 0);
  if (e > ahora) errores.entrada = FUTURO;
  else if (s > aMinuto(ahora)) errores.salida = FUTURO;
  if (Object.keys(errores).length) return { ok: false, errores };
  return { ok: true, datos: { entrada: e.toISOString(), salida: s.toISOString() } };
}

export interface CierreForm {
  salida: string; // "17:00"
}

export const ETIQUETAS_CIERRE: Record<keyof CierreForm, string> = { salida: 'Salida' };

/**
 * The exit of an open shift that started at `entrada` (ISO): the first time with that hour after the entry,
 * so the same day, or the next one if the hour is earlier (a shift is never longer than a day).
 */
export function validarCierre(f: CierreForm, entrada: string, ahora = new Date()): Validado<string, CierreForm> {
  if (!f.salida.trim()) return { ok: false, errores: { salida: 'Requerido' } };
  const salida = leerHora(f.salida);
  if (salida === undefined) return { ok: false, errores: { salida: HORA_INVALIDA } };
  const e = new Date(entrada);
  const minutosEntrada = e.getHours() * 60 + e.getMinutes();
  if (salida === minutosEntrada) return { ok: false, errores: { salida: 'Tiene que ser distinta de la entrada' } };
  const s = enDia(diaLocal(entrada), salida, salida < minutosEntrada ? 1 : 0);
  if (s > aMinuto(ahora)) return { ok: false, errores: { salida: FUTURO } };
  return { ok: true, datos: s.toISOString() };
}
