import { describe, expect, it } from 'vitest';
import { validarCierre, validarEmpleado, validarTurno } from './validar';

const local = (d: number, h: number, m = 0) => new Date(2026, 2, d, h, m).toISOString();
const ahora = new Date(2026, 2, 10, 12, 0, 30);

describe('validarEmpleado', () => {
  it('requires a unique name', () => {
    expect(validarEmpleado({ nombre: '  Ana ', activo: true })).toEqual({ ok: true, datos: { nombre: 'Ana', activo: true } });
    expect(validarEmpleado({ nombre: ' ', activo: true })).toEqual({ ok: false, errores: { nombre: 'Requerido' } });
    expect(validarEmpleado({ nombre: 'ana', activo: true }, ['Ána'])).toEqual({
      ok: false,
      errores: { nombre: 'Ya existe un empleado con ese nombre' },
    });
  });
});

describe('validarTurno', () => {
  it('reads a shift on one day, or across midnight', () => {
    expect(validarTurno({ dia: '2026-03-05', entrada: '9:00', salida: '17:30' }, ahora)).toEqual({
      ok: true,
      datos: { entrada: local(5, 9), salida: local(5, 17, 30) },
    });
    expect(validarTurno({ dia: '2026-03-05', entrada: '20:00', salida: '01:00' }, ahora)).toEqual({
      ok: true,
      datos: { entrada: local(5, 20), salida: local(6, 1) },
    });
  });

  it('reports missing and invalid fields', () => {
    expect(validarTurno({ dia: '', entrada: '', salida: '' }, ahora)).toEqual({
      ok: false,
      errores: { dia: 'Requerido', entrada: 'Requerido', salida: 'Requerido' },
    });
    expect(validarTurno({ dia: '2026-02-30', entrada: '25:00', salida: '9:60' }, ahora)).toEqual({
      ok: false,
      errores: { dia: 'No es una fecha', entrada: 'No es una hora (ej.: 09:30)', salida: 'No es una hora (ej.: 09:30)' },
    });
    expect(validarTurno({ dia: '2026-03-05', entrada: '09:00', salida: '09:00' }, ahora)).toEqual({
      ok: false,
      errores: { salida: 'Tiene que ser distinta de la entrada' },
    });
  });

  it('rejects the future', () => {
    expect(validarTurno({ dia: '2026-03-10', entrada: '12:01', salida: '13:00' }, ahora)).toMatchObject({ errores: { entrada: 'No puede ser en el futuro' } });
    expect(validarTurno({ dia: '2026-03-10', entrada: '09:00', salida: '12:01' }, ahora)).toMatchObject({ errores: { salida: 'No puede ser en el futuro' } });
    expect(validarTurno({ dia: '2026-03-10', entrada: '09:00', salida: '12:00' }, ahora).ok).toBe(true);
    expect(validarTurno({ dia: '2026-03-09', entrada: '20:00', salida: '13:00' }, ahora)).toMatchObject({ errores: { salida: 'No puede ser en el futuro' } });
  });
});

describe('validarCierre', () => {
  it('takes the first time with that hour after the entry', () => {
    expect(validarCierre({ salida: '17:00' }, local(5, 9), ahora)).toEqual({ ok: true, datos: local(5, 17) });
    expect(validarCierre({ salida: '02:00' }, local(5, 20), ahora)).toEqual({ ok: true, datos: local(6, 2) });
  });

  it('reports invalid, equal and future times', () => {
    expect(validarCierre({ salida: '' }, local(5, 9), ahora)).toEqual({ ok: false, errores: { salida: 'Requerido' } });
    expect(validarCierre({ salida: 'tarde' }, local(5, 9), ahora)).toEqual({ ok: false, errores: { salida: 'No es una hora (ej.: 09:30)' } });
    expect(validarCierre({ salida: '09:00' }, local(5, 9), ahora)).toEqual({ ok: false, errores: { salida: 'Tiene que ser distinta de la entrada' } });
    expect(validarCierre({ salida: '13:00' }, local(10, 9), ahora)).toEqual({ ok: false, errores: { salida: 'No puede ser en el futuro' } });
  });
});
