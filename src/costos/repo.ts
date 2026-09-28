// Persistence for the costing module, on top of db.ts.

import { idbRequest as req, newId, type DB, type Registro } from '../lib/db';
import type { Insumo, Receta, RecetaLinea } from './types';

const sello = <T extends Registro>(r: T): T => ({ ...r, actualizadoEn: new Date().toISOString() });

export const porNombre = <T extends { nombre: string }>(a: T, b: T) =>
  a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });

const porOrden = (a: RecetaLinea, b: RecetaLinea) => a.orden - b.orden;

export async function listarInsumos(db: DB): Promise<Insumo[]> {
  return (await db.list<Insumo>('insumos')).sort(porNombre);
}

export function guardarInsumo(db: DB, i: Insumo): Promise<Insumo> {
  return db.put('insumos', i);
}

export class InsumoEnUso extends Error {
  constructor(readonly recetas: string[]) {
    super(`No se puede borrar: se usa en ${recetas.length === 1 ? 'la receta' : 'las recetas'} ${recetas.join(', ')}.`);
  }
}

/** Names of the recipes that use an ingredient. */
export function recetasQueUsan(db: DB, insumoId: string): Promise<string[]> {
  return db.tx(['recetaLineas', 'recetas'], 'readonly', async (tx) => {
    const lineas = await req<RecetaLinea[]>(tx.objectStore('recetaLineas').index('insumoId').getAll(insumoId));
    const ids = [...new Set(lineas.map((l) => l.recetaId))];
    const recetas = await Promise.all(ids.map((id) => req<Receta | undefined>(tx.objectStore('recetas').get(id))));
    return recetas.map((r) => r?.nombre ?? '(sin nombre)').sort((a, b) => a.localeCompare(b, 'es'));
  });
}

/** Deletes an ingredient; throws InsumoEnUso (and deletes nothing) if a recipe uses it. */
export async function borrarInsumo(db: DB, id: string): Promise<void> {
  await db.tx(['insumos', 'recetaLineas', 'recetas'], 'readwrite', async (tx) => {
    const lineas = await req<RecetaLinea[]>(tx.objectStore('recetaLineas').index('insumoId').getAll(id));
    if (lineas.length) {
      const ids = [...new Set(lineas.map((l) => l.recetaId))];
      const recetas = await Promise.all(ids.map((rid) => req<Receta | undefined>(tx.objectStore('recetas').get(rid))));
      throw new InsumoEnUso(recetas.map((r) => r?.nombre ?? '(sin nombre)'));
    }
    await req(tx.objectStore('insumos').delete(id));
  });
}

export function nuevaReceta(nombre = 'Receta nueva'): Receta {
  return { id: newId(), actualizadoEn: '', nombre, rendimiento: 1, unidadRendimiento: 'unidades', margen: 0, notas: '' };
}

export async function listarRecetas(db: DB): Promise<Receta[]> {
  return (await db.list<Receta>('recetas')).sort(porNombre);
}

/** All lines grouped by recipe id, each group sorted by `orden`. */
export async function lineasPorReceta(db: DB): Promise<Map<string, RecetaLinea[]>> {
  const m = new Map<string, RecetaLinea[]>();
  for (const l of await db.list<RecetaLinea>('recetaLineas')) {
    const g = m.get(l.recetaId);
    if (g) g.push(l);
    else m.set(l.recetaId, [l]);
  }
  for (const g of m.values()) g.sort(porOrden);
  return m;
}

export async function obtenerReceta(db: DB, id: string): Promise<{ receta: Receta; lineas: RecetaLinea[] } | undefined> {
  return db.tx(['recetas', 'recetaLineas'], 'readonly', async (tx) => {
    const receta = await req<Receta | undefined>(tx.objectStore('recetas').get(id));
    if (!receta) return undefined;
    const lineas = await req<RecetaLinea[]>(tx.objectStore('recetaLineas').index('recetaId').getAll(id));
    return { receta, lineas: lineas.sort(porOrden) };
  });
}

export function guardarReceta(db: DB, r: Receta): Promise<Receta> {
  return db.put('recetas', r);
}

export function guardarLinea(db: DB, l: RecetaLinea): Promise<RecetaLinea> {
  return db.put('recetaLineas', l);
}

export function borrarLinea(db: DB, id: string): Promise<void> {
  return db.delete('recetaLineas', id);
}

/** Deletes a recipe and all its lines atomically. */
export async function borrarReceta(db: DB, id: string): Promise<void> {
  await db.tx(['recetas', 'recetaLineas'], 'readwrite', async (tx) => {
    const lineas = tx.objectStore('recetaLineas');
    const ids = await req(lineas.index('recetaId').getAllKeys(id));
    for (const k of ids) await req(lineas.delete(k));
    await req(tx.objectStore('recetas').delete(id));
  });
}

/** Copies a recipe and its lines under new ids. Returns the new recipe. */
export async function duplicarReceta(db: DB, id: string): Promise<Receta> {
  return db.tx(['recetas', 'recetaLineas'], 'readwrite', async (tx) => {
    const recetas = tx.objectStore('recetas');
    const lineas = tx.objectStore('recetaLineas');
    const orig = await req<Receta | undefined>(recetas.get(id));
    if (!orig) throw new Error('La receta no existe');
    const copia = sello({ ...orig, id: newId(), nombre: `${orig.nombre} (copia)` });
    await req(recetas.put(copia));
    for (const l of await req<RecetaLinea[]>(lineas.index('recetaId').getAll(id))) {
      await req(lineas.put(sello({ ...l, id: newId(), recetaId: copia.id })));
    }
    return copia;
  });
}
