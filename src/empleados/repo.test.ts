import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId, openDB, type DB } from '../lib/db';
import {
  anularTurno,
  borrarEmpleado,
  borrarTurno,
  cambiosEmpleados,
  cargarPendientes,
  cargarTurno,
  cerrarTurno,
  EmpleadoEnUso,
  ficharEntrada,
  ficharSalida,
  guardarEmpleado,
  listarEmpleados,
  listarTurnos,
  turnosDe,
} from './repo';

let n = 0;
const open: DB[] = [];

async function fresh(): Promise<DB> {
  const db = await openDB(`empleados-${n++}`);
  open.push(db);
  return db;
}

afterEach(() => {
  open.splice(0).forEach((db) => db.close());
});

const local = (d: number, h: number, m = 0, s = 0) => new Date(2026, 2, d, h, m, s);
const iso = (d: number, h: number, m = 0) => local(d, h, m).toISOString();

async function conEmpleado(nombre = 'Ana', activo = true) {
  const db = await fresh();
  const e = await guardarEmpleado(db, { id: newId(), actualizadoEn: '', nombre, activo });
  return { db, e };
}

describe('employees', () => {
  it('lists by name and saves changes', async () => {
    const db = await fresh();
    await guardarEmpleado(db, { id: 'b', actualizadoEn: '', nombre: 'bruno', activo: true });
    const a = await guardarEmpleado(db, { id: 'a', actualizadoEn: '', nombre: 'Ana', activo: true });
    expect((await listarEmpleados(db)).map((e) => e.nombre)).toEqual(['Ana', 'bruno']);
    await guardarEmpleado(db, { ...a, activo: false });
    expect((await listarEmpleados(db))[0].activo).toBe(false);
  });

  it('can only delete an employee without shifts, voided ones included', async () => {
    const { db, e } = await conEmpleado();
    const t = await cargarTurno(db, e.id, { entrada: iso(5, 9), salida: iso(5, 17) }, local(10, 12));
    await anularTurno(db, t.id);
    await expect(borrarEmpleado(db, e.id)).rejects.toBeInstanceOf(EmpleadoEnUso);
    await borrarTurno(db, t.id);
    await borrarEmpleado(db, e.id);
    expect(await listarEmpleados(db)).toEqual([]);
  });
});

describe('clocking in and out', () => {
  it('opens a shift to the minute and closes it', async () => {
    const { db, e } = await conEmpleado();
    const t = await ficharEntrada(db, e.id, local(5, 9, 2, 40));
    expect(t).toMatchObject({ empleadoId: e.id, entrada: iso(5, 9, 2) });
    expect(t.salida).toBeUndefined();
    const c = await ficharSalida(db, t.id, local(5, 17, 30, 10));
    expect(c).toMatchObject({ entrada: iso(5, 9, 2), salida: iso(5, 17, 30) });
    expect(c.salidaManual).toBeUndefined();
    expect(await turnosDe(db, e.id)).toEqual([c]);
  });

  it('allows only one open shift, and no clock-in for inactive employees', async () => {
    const { db, e } = await conEmpleado();
    await ficharEntrada(db, e.id, local(5, 9));
    await expect(ficharEntrada(db, e.id, local(5, 10))).rejects.toThrow('Ya tiene un turno abierto desde 05/03 09:00');
    const otro = await guardarEmpleado(db, { id: newId(), actualizadoEn: '', nombre: 'Beto', activo: false });
    await expect(ficharEntrada(db, otro.id, local(5, 10))).rejects.toThrow('Beto está inactivo');
    await expect(ficharEntrada(db, 'nadie', local(5, 10))).rejects.toThrow('El empleado no existe');
    expect(await listarTurnos(db)).toHaveLength(1);
  });

  it('a shift needs at least a minute', async () => {
    const { db, e } = await conEmpleado();
    const t = await ficharEntrada(db, e.id, local(5, 9, 0, 10));
    await expect(ficharSalida(db, t.id, local(5, 9, 0, 50))).rejects.toThrow('La salida tiene que ser posterior a la entrada');
  });
});

describe('fixing shifts', () => {
  it('closes a forgotten shift by hand, only once', async () => {
    const { db, e } = await conEmpleado();
    const t = await ficharEntrada(db, e.id, local(5, 9));
    expect((await cargarPendientes(db, local(6, 12))).map((x) => x.id)).toEqual([t.id]);
    await expect(cerrarTurno(db, t.id, iso(7, 9), local(6, 12))).rejects.toThrow('La salida no puede ser en el futuro');
    const c = await cerrarTurno(db, t.id, iso(5, 17), local(6, 12));
    expect(c).toMatchObject({ salida: iso(5, 17), salidaManual: true });
    expect(await cargarPendientes(db, local(6, 12))).toEqual([]);
    await expect(cerrarTurno(db, t.id, iso(5, 18), local(6, 12))).rejects.toThrow('El turno ya estaba cerrado');
  });

  it('loads whole shifts by hand, without overlaps', async () => {
    const { db, e } = await conEmpleado();
    const ahora = local(10, 12);
    const t = await cargarTurno(db, e.id, { entrada: iso(5, 9), salida: iso(5, 13) }, ahora);
    expect(t.manual).toBe(true);
    await expect(cargarTurno(db, e.id, { entrada: iso(5, 12), salida: iso(5, 15) }, ahora)).rejects.toThrow(/^Se superpone/);
    await cargarTurno(db, e.id, { entrada: iso(5, 13), salida: iso(5, 15) }, ahora);
    // A voided shift no longer blocks its time.
    await anularTurno(db, t.id);
    await cargarTurno(db, e.id, { entrada: iso(5, 10), salida: iso(5, 12) }, ahora);
    // Before an open shift is fine; after its entry is not.
    await ficharEntrada(db, e.id, local(9, 9));
    await cargarTurno(db, e.id, { entrada: iso(8, 9), salida: iso(8, 17) }, ahora);
    await expect(cargarTurno(db, e.id, { entrada: iso(9, 10), salida: iso(9, 11) }, ahora)).rejects.toThrow(/^Ya tiene un turno abierto/);
    expect((await turnosDe(db, e.id)).map((x) => x.entrada)).toEqual([iso(5, 9), iso(5, 10), iso(5, 13), iso(8, 9), iso(9, 9)]);
  });

  it('voids, then deletes; voided shifts can not be closed', async () => {
    const { db, e } = await conEmpleado();
    const t = await ficharEntrada(db, e.id, local(5, 9));
    await expect(borrarTurno(db, t.id)).rejects.toThrow('Solo se puede borrar un turno anulado');
    const a = await anularTurno(db, t.id, local(5, 10));
    expect(a.anuladoEn).toBe(local(5, 10).toISOString());
    await expect(anularTurno(db, t.id)).rejects.toThrow('El turno ya estaba anulado');
    await expect(ficharSalida(db, t.id, local(5, 17))).rejects.toThrow('El turno está anulado');
    // Voided, it no longer counts as open.
    await ficharEntrada(db, e.id, local(5, 11));
    await borrarTurno(db, t.id);
    expect(await turnosDe(db, e.id)).toHaveLength(1);
  });
});

it('every write notifies the nav badge', async () => {
  const db = await fresh();
  const f = vi.fn();
  cambiosEmpleados.addEventListener('cambio', f);
  try {
    const e = await guardarEmpleado(db, { id: newId(), actualizadoEn: '', nombre: 'Ana', activo: true });
    const t = await ficharEntrada(db, e.id, local(5, 9));
    await ficharSalida(db, t.id, local(5, 17));
    await anularTurno(db, t.id);
    await borrarTurno(db, t.id);
    const m = await cargarTurno(db, e.id, { entrada: iso(6, 9), salida: iso(6, 17) }, local(10, 9));
    await anularTurno(db, m.id);
    await borrarTurno(db, m.id);
    const o = await ficharEntrada(db, e.id, local(7, 9));
    await cerrarTurno(db, o.id, iso(7, 12), local(10, 9));
    expect(f).toHaveBeenCalledTimes(10);
  } finally {
    cambiosEmpleados.removeEventListener('cambio', f);
  }
});
