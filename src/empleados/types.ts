import type { Registro } from '../lib/db';

export interface Empleado extends Registro {
  nombre: string; // unique among employees
  activo: boolean; // inactive ones can't clock in, but keep their shifts
}

/**
 * A work shift: clocked in and out, or typed by hand. Never edited: voided (`anuladoEn`), then deletable.
 * The only change allowed is setting the exit of an open shift.
 */
export interface Turno extends Registro {
  empleadoId: string;
  entrada: string; // ISO 8601, whole minutes
  salida?: string; // ISO 8601, whole minutes; missing while the shift is open
  manual?: true; // typed by hand as a whole shift (not clocked in)
  salidaManual?: true; // an open shift whose exit was typed by hand (forgot to clock out)
  anuladoEn?: string;
}
