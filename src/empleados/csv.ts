// CSV export of the employees module.

import { aCsv } from '../lib/csv';
import { formatFechaHora } from '../lib/texto';
import { formatDuracion, horasDecimales, minutosDe } from './logic';
import type { Empleado, Turno } from './types';

function carga(t: Turno): string {
  if (t.manual) return 'A mano';
  return t.salidaManual ? 'Fichado, salida a mano' : 'Fichado';
}

/** Every shift, oldest first: open ones without exit or duration. */
export function csvTurnos(turnos: readonly Turno[], empleados: readonly Empleado[]): string {
  const nombre = new Map(empleados.map((e) => [e.id, e.nombre]));
  return aCsv([
    ['Empleado', 'Entrada', 'Salida', 'Duración', 'Horas', 'Carga', 'Anulado'],
    ...[...turnos]
      .sort((a, b) => a.entrada.localeCompare(b.entrada))
      .map((t) => {
        const min = t.salida ? minutosDe(t) : undefined;
        return [
          nombre.get(t.empleadoId) ?? '',
          formatFechaHora(t.entrada),
          t.salida ? formatFechaHora(t.salida) : '',
          min === undefined ? '' : formatDuracion(min),
          min === undefined ? undefined : horasDecimales(min),
          carga(t),
          t.anuladoEn ? 'Sí' : 'No',
        ];
      }),
  ]);
}
