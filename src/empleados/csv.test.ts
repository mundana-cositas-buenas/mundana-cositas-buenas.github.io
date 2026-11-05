import { describe, expect, it } from 'vitest';
import { csvTurnos } from './csv';
import type { Empleado, Turno } from './types';

const iso = (d: number, h: number, m = 0) => new Date(2026, 2, d, h, m).toISOString();

describe('csvTurnos', () => {
  it('lists every shift oldest first, with duration in h:mm and decimal hours', () => {
    const empleados: Empleado[] = [{ id: 'e1', actualizadoEn: '', nombre: 'Ana', activo: true }];
    const turnos: Turno[] = [
      { id: 'b', actualizadoEn: '', empleadoId: 'e1', entrada: iso(6, 9) },
      { id: 'a', actualizadoEn: '', empleadoId: 'e1', entrada: iso(5, 9), salida: iso(5, 16, 45), manual: true },
      { id: 'c', actualizadoEn: '', empleadoId: 'x', entrada: iso(4, 22), salida: iso(5, 1), salidaManual: true, anuladoEn: iso(5, 9) },
    ];
    const filas = csvTurnos(turnos, empleados).replace(/^﻿/, '').trimEnd().split('\r\n');
    expect(filas).toEqual([
      'Empleado;Entrada;Salida;Duración;Horas;Carga;Anulado',
      ';04/03/2026 22:00;05/03/2026 01:00;3:00;3;Fichado, salida a mano;Sí',
      'Ana;05/03/2026 09:00;05/03/2026 16:45;7:45;7,75;A mano;No',
      'Ana;06/03/2026 09:00;;;;Fichado;No',
    ]);
  });
});
