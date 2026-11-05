// IndexedDB access for employees and their shifts.

import { porNombre } from '../lib/campos';
import { idbRequest as req, newId, type DB } from '../lib/db';
import { aMinuto, problemaTurno, turnosPendientes } from './logic';
import type { Empleado, Turno } from './types';
import type { DatosTurno } from './validar';

/** Fires 'cambio' after every write, so the nav badge (shifts left open) can refresh. */
export const cambiosEmpleados = new EventTarget();
const avisar = () => cambiosEmpleados.dispatchEvent(new Event('cambio'));

export async function listarEmpleados(db: DB): Promise<Empleado[]> {
  return (await db.list<Empleado>('empleados')).sort(porNombre);
}

export function obtenerEmpleado(db: DB, id: string): Promise<Empleado | undefined> {
  return db.get<Empleado>('empleados', id);
}

export async function guardarEmpleado(db: DB, e: Empleado): Promise<Empleado> {
  const r = await db.put('empleados', e);
  avisar();
  return r;
}

export class EmpleadoEnUso extends Error {
  constructor() {
    super('No se puede borrar: tiene turnos registrados. Desmarcalo como activo en lugar de borrarlo.');
  }
}

/** Deletes an employee; throws EmpleadoEnUso (and deletes nothing) if any shift, even a voided one, is theirs. */
export async function borrarEmpleado(db: DB, id: string): Promise<void> {
  await db.tx(['empleados', 'turnos'], 'readwrite', async (tx) => {
    if (await req(tx.objectStore('turnos').index('empleadoId').count(id))) throw new EmpleadoEnUso();
    await req(tx.objectStore('empleados').delete(id));
  });
  avisar();
}

const porEntrada = (a: Turno, b: Turno) => a.entrada.localeCompare(b.entrada);

/** Every shift, oldest first. */
export async function listarTurnos(db: DB): Promise<Turno[]> {
  return (await db.list<Turno>('turnos')).sort(porEntrada);
}

/** One employee's shifts, oldest first. */
export async function turnosDe(db: DB, empleadoId: string): Promise<Turno[]> {
  return (await db.listBy<Turno>('turnos', 'empleadoId', empleadoId)).sort(porEntrada);
}

/** Open shifts that started before today (forgotten clock-outs), for the nav badge. */
export async function cargarPendientes(db: DB, ahora = new Date()): Promise<Turno[]> {
  return turnosPendientes(await db.list<Turno>('turnos'), ahora);
}

/** Checks a shift against the employee's others and stores it, all in one transaction. */
async function guardarTurno(db: DB, t: Turno, ahora: Date, soloActivo = false): Promise<Turno> {
  await db.tx(['empleados', 'turnos'], 'readwrite', async (tx) => {
    const e = await req<Empleado | undefined>(tx.objectStore('empleados').get(t.empleadoId));
    if (!e) throw new Error('El empleado no existe');
    if (soloActivo && !e.activo) throw new Error(`${e.nombre} está inactivo`);
    const otros = await req<Turno[]>(tx.objectStore('turnos').index('empleadoId').getAll(t.empleadoId));
    const problema = problemaTurno(t, otros, ahora);
    if (problema) throw new Error(problema);
    await req(tx.objectStore('turnos').put(t));
  });
  avisar();
  return t;
}

/** Clocks in now (to the minute): opens a shift. Fails if the employee is inactive or already has one open. */
export function ficharEntrada(db: DB, empleadoId: string, ahora = new Date()): Promise<Turno> {
  const t: Turno = { id: newId(), actualizadoEn: ahora.toISOString(), empleadoId, entrada: aMinuto(ahora).toISOString() };
  return guardarTurno(db, t, ahora, true);
}

/** A whole shift typed by hand. */
export function cargarTurno(db: DB, empleadoId: string, datos: DatosTurno, ahora = new Date()): Promise<Turno> {
  const t: Turno = { id: newId(), actualizadoEn: ahora.toISOString(), empleadoId, ...datos, manual: true };
  return guardarTurno(db, t, ahora);
}

/** Sets the exit of an open shift, checked in the same transaction as the write. */
async function cerrar(db: DB, id: string, salida: string, ahora: Date, manual: boolean): Promise<Turno> {
  const r = await db.tx('turnos', 'readwrite', async (tx) => {
    const store = tx.objectStore('turnos');
    const t = await req<Turno | undefined>(store.get(id));
    if (!t) throw new Error('El turno no existe');
    if (t.anuladoEn) throw new Error('El turno está anulado');
    if (t.salida) throw new Error('El turno ya estaba cerrado');
    const cerrado: Turno = { ...t, salida, actualizadoEn: ahora.toISOString(), ...(manual ? { salidaManual: true as const } : {}) };
    const problema = problemaTurno(cerrado, await req<Turno[]>(store.index('empleadoId').getAll(t.empleadoId)), ahora);
    if (problema) throw new Error(problema);
    await req(store.put(cerrado));
    return cerrado;
  });
  avisar();
  return r;
}

/** Clocks out now (to the minute): closes an open shift. */
export function ficharSalida(db: DB, id: string, ahora = new Date()): Promise<Turno> {
  return cerrar(db, id, aMinuto(ahora).toISOString(), ahora, false);
}

/** Sets the exit (ISO) of a shift left open, typed by hand: the only change a shift accepts. */
export function cerrarTurno(db: DB, id: string, salida: string, ahora = new Date()): Promise<Turno> {
  return cerrar(db, id, salida, ahora, true);
}

/** Voids a shift: it stays in the history but no longer counts. */
export async function anularTurno(db: DB, id: string, ahora = new Date()): Promise<Turno> {
  const r = await db.tx('turnos', 'readwrite', async (tx) => {
    const store = tx.objectStore('turnos');
    const t = await req<Turno | undefined>(store.get(id));
    if (!t) throw new Error('El turno no existe');
    if (t.anuladoEn) throw new Error('El turno ya estaba anulado');
    const anulado: Turno = { ...t, anuladoEn: ahora.toISOString(), actualizadoEn: ahora.toISOString() };
    await req(store.put(anulado));
    return anulado;
  });
  avisar();
  return r;
}

/** Deletes a voided shift for good. It no longer counted, so no total changes. */
export async function borrarTurno(db: DB, id: string): Promise<void> {
  await db.tx('turnos', 'readwrite', async (tx) => {
    const store = tx.objectStore('turnos');
    const t = await req<Turno | undefined>(store.get(id));
    if (!t) throw new Error('El turno no existe');
    if (!t.anuladoEn) throw new Error('Solo se puede borrar un turno anulado');
    await req(store.delete(id));
  });
  avisar();
}
