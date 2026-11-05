import { describe, expect, it } from 'vitest';
import {
  aMinuto,
  formatDuracion,
  horasDecimales,
  horasPorEmpleado,
  largo,
  mesDe,
  minutosDe,
  moverRango,
  pendiente,
  problemaTurno,
  semanaDe,
  superpuesto,
  turnosPendientes,
} from './logic';
import type { Turno } from './types';

/** Local time, as ISO. */
const en = (d: number, h: number, m = 0, mes = 3) => new Date(2026, mes - 1, d, h, m).toISOString();

const turno = (id: string, entrada: string, salida?: string, extra: Partial<Turno> = {}): Turno => ({
  id,
  actualizadoEn: '',
  empleadoId: 'e1',
  entrada,
  ...(salida ? { salida } : {}),
  ...extra,
});

describe('durations', () => {
  it('drops seconds', () => {
    expect(aMinuto(new Date(2026, 2, 5, 9, 30, 59, 999))).toEqual(new Date(2026, 2, 5, 9, 30));
  });

  it('counts whole minutes, an open shift up to now', () => {
    expect(minutosDe(turno('a', en(5, 9), en(5, 17, 45)))).toBe(525);
    expect(minutosDe(turno('a', en(5, 22), en(6, 1, 30)))).toBe(210); // across midnight
    expect(minutosDe(turno('a', en(5, 9)), new Date(2026, 2, 5, 10, 15, 40))).toBe(75);
  });

  it('formats as h:mm and decimal hours', () => {
    expect(formatDuracion(525)).toBe('8:45');
    expect(formatDuracion(5)).toBe('0:05');
    expect(formatDuracion(7380)).toBe('123:00');
    expect(horasDecimales(465)).toBe(7.75);
    expect(horasDecimales(20)).toBe(0.33);
  });
});

describe('pending and long shifts', () => {
  const abierto = turno('a', en(5, 9));

  it('warns about shifts longer than 14 hours', () => {
    expect(largo(abierto, new Date(2026, 2, 5, 23))).toBe(false);
    expect(largo(abierto, new Date(2026, 2, 5, 23, 1))).toBe(true);
    expect(largo(turno('b', en(5, 9), en(5, 23, 30)))).toBe(true);
    expect(largo(turno('b', en(5, 9), en(5, 23, 30), { anuladoEn: en(6, 9) }))).toBe(false);
  });

  it('an open shift is pending once it started on an earlier day and is too long', () => {
    expect(pendiente(abierto, new Date(2026, 2, 5, 23, 30))).toBe(false); // same day
    expect(pendiente(abierto, new Date(2026, 2, 6, 8))).toBe(true);
    // A night shift still open after midnight isn't pending yet.
    const noche = turno('n', en(5, 20));
    expect(pendiente(noche, new Date(2026, 2, 6, 1))).toBe(false);
    expect(pendiente(noche, new Date(2026, 2, 6, 10, 1))).toBe(true);
    // Closed or voided ones never are.
    expect(pendiente(turno('c', en(1, 9), en(1, 17)), new Date(2026, 2, 6))).toBe(false);
    expect(pendiente({ ...abierto, anuladoEn: en(5, 10) }, new Date(2026, 2, 7))).toBe(false);
  });

  it('lists pending shifts oldest first', () => {
    const r = turnosPendientes([turno('b', en(4, 9)), turno('a', en(3, 9)), turno('c', en(6, 9))], new Date(2026, 2, 6, 12));
    expect(r.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('overlaps and rules', () => {
  const otros = [turno('a', en(5, 9), en(5, 13)), turno('x', en(5, 14), en(5, 18), { anuladoEn: en(5, 19) })];
  const ahora = new Date(2026, 2, 10);

  it('finds overlapping shifts, ignoring voided ones and the shift itself', () => {
    expect(superpuesto(turno('n', en(5, 12), en(5, 15)), otros)?.id).toBe('a');
    expect(superpuesto(turno('n', en(5, 13), en(5, 15)), otros)).toBeUndefined(); // touching is fine
    expect(superpuesto(turno('n', en(5, 8), en(5, 9)), otros)).toBeUndefined();
    expect(superpuesto(turno('n', en(5, 14), en(5, 18)), otros)).toBeUndefined(); // only the voided one
    expect(superpuesto(otros[0], otros)).toBeUndefined();
  });

  it('an open shift runs until closed', () => {
    const abierto = [turno('o', en(5, 9))];
    expect(superpuesto(turno('n', en(6, 9), en(6, 10)), abierto)?.id).toBe('o');
    expect(superpuesto(turno('n', en(5, 7), en(5, 9)), abierto)).toBeUndefined();
    expect(problemaTurno(turno('n', en(6, 9)), abierto, ahora)).toMatch(/^Ya tiene un turno abierto desde 05\/03 09:00/);
  });

  it('rejects future times, empty or negative shifts, and overlaps', () => {
    expect(problemaTurno(turno('n', en(5, 14), en(5, 18)), otros, ahora)).toBeUndefined();
    expect(problemaTurno(turno('n', en(11, 9)), [], ahora)).toBe('La entrada no puede ser en el futuro');
    expect(problemaTurno(turno('n', en(9, 20), en(10, 1)), [], ahora)).toBe('La salida no puede ser en el futuro');
    expect(problemaTurno(turno('n', en(5, 9), en(5, 9)), [], ahora)).toBe('La salida tiene que ser posterior a la entrada');
    expect(problemaTurno(turno('n', en(5, 9), en(5, 8)), [], ahora)).toBe('La salida tiene que ser posterior a la entrada');
    expect(problemaTurno(turno('n', en(5, 12), en(5, 15)), otros, ahora)).toBe('Se superpone con el turno de 05/03 09:00 a 05/03 13:00');
  });
});

describe('hours by employee', () => {
  it('adds closed, non-voided shifts that started within the range', () => {
    const ts: Turno[] = [
      turno('a', en(2, 9), en(2, 17)), // 8 h
      turno('b', en(8, 22), en(9, 2)), // 4 h, starts on the 8th: counts there
      turno('c', en(9, 9), en(9, 10)), // out of range
      turno('d', en(3, 9), en(3, 17), { anuladoEn: en(4, 9) }), // voided
      turno('e', en(4, 9)), // open
      { ...turno('f', en(5, 9), en(5, 10, 30)), empleadoId: 'e2' },
    ];
    const r = horasPorEmpleado(ts, '2026-03-02', '2026-03-08');
    expect(r.get('e1')).toEqual({ minutos: 720, turnos: 2 });
    expect(r.get('e2')).toEqual({ minutos: 90, turnos: 1 });
    expect(horasPorEmpleado(ts, '2026-03-10', '2026-03-31').size).toBe(0);
  });
});

describe('ranges', () => {
  it('weeks go Monday to Sunday', () => {
    expect(semanaDe('2026-03-05')).toEqual({ desde: '2026-03-02', hasta: '2026-03-08' }); // Thursday
    expect(semanaDe('2026-03-02')).toEqual({ desde: '2026-03-02', hasta: '2026-03-08' }); // Monday
    expect(semanaDe('2026-03-08')).toEqual({ desde: '2026-03-02', hasta: '2026-03-08' }); // Sunday
    expect(semanaDe('2026-01-01')).toEqual({ desde: '2025-12-29', hasta: '2026-01-04' });
  });

  it('months', () => {
    expect(mesDe('2026-02-14')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(mesDe('2024-02-14')).toEqual({ desde: '2024-02-01', hasta: '2024-02-29' });
  });

  it('moves back and forward', () => {
    expect(moverRango(semanaDe('2026-03-05'), 'semana', -1)).toEqual({ desde: '2026-02-23', hasta: '2026-03-01' });
    expect(moverRango(mesDe('2026-01-31'), 'mes', -1)).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(moverRango(mesDe('2026-01-31'), 'mes', 1)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });
});
