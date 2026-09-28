import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { newId, openDB, type DB } from '../lib/db';
import {
  borrarInsumo,
  borrarLinea,
  borrarReceta,
  duplicarReceta,
  guardarInsumo,
  guardarLinea,
  guardarReceta,
  InsumoEnUso,
  lineasPorReceta,
  listarInsumos,
  listarRecetas,
  nuevaReceta,
  obtenerReceta,
  recetasQueUsan,
} from './repo';
import type { Insumo, LineaCostoFijo, LineaInsumo } from './types';

let n = 0;
const open: DB[] = [];

async function fresh(): Promise<DB> {
  const db = await openDB(`costos-${n++}`);
  open.push(db);
  return db;
}

afterEach(() => {
  open.splice(0).forEach((db) => db.close());
});

const insumo = (nombre: string): Insumo => ({
  id: newId(),
  actualizadoEn: '',
  nombre,
  unidadBase: 'g',
  precioCompra: 100000,
  cantidadCompra: 1,
  unidadCompra: 'kg',
});

const linea = (recetaId: string, insumoId: string, orden: number): LineaInsumo => ({
  id: newId(),
  actualizadoEn: '',
  recetaId,
  orden,
  tipo: 'insumo',
  insumoId,
  cantidad: 100,
  unidad: 'g',
  mermaPct: 0,
});

const fijo = (recetaId: string, orden: number): LineaCostoFijo => ({
  id: newId(),
  actualizadoEn: '',
  recetaId,
  orden,
  tipo: 'costoFijo',
  descripcion: 'gas',
  monto: 500,
});

describe('insumos', () => {
  it('lists sorted by name, ignoring case and accents', async () => {
    const db = await fresh();
    for (const nombre of ['sal', 'Azúcar', 'harina']) await guardarInsumo(db, insumo(nombre));
    expect((await listarInsumos(db)).map((i) => i.nombre)).toEqual(['Azúcar', 'harina', 'sal']);
  });

  it('blocks deleting an ingredient used by a recipe', async () => {
    const db = await fresh();
    const harina = await guardarInsumo(db, insumo('harina'));
    const pan = await guardarReceta(db, nuevaReceta('Pan'));
    const l = await guardarLinea(db, linea(pan.id, harina.id, 0));

    expect(await recetasQueUsan(db, harina.id)).toEqual(['Pan']);
    const e = await borrarInsumo(db, harina.id).catch((e) => e);
    expect(e).toBeInstanceOf(InsumoEnUso);
    expect(e.recetas).toEqual(['Pan']);
    expect(await listarInsumos(db)).toHaveLength(1);

    await borrarLinea(db, l.id);
    await borrarInsumo(db, harina.id);
    expect(await listarInsumos(db)).toEqual([]);
  });
});

describe('recetas', () => {
  it('loads a recipe with its lines in order', async () => {
    const db = await fresh();
    const r = await guardarReceta(db, nuevaReceta('Pan'));
    const a = await guardarLinea(db, fijo(r.id, 2));
    const b = await guardarLinea(db, linea(r.id, 'x', 1));
    await guardarLinea(db, fijo('otra', 0));
    const got = await obtenerReceta(db, r.id);
    expect(got?.receta.nombre).toBe('Pan');
    expect(got?.lineas.map((l) => l.id)).toEqual([b.id, a.id]);
    expect(await obtenerReceta(db, 'nada')).toBeUndefined();
    expect((await lineasPorReceta(db)).get(r.id)?.map((l) => l.id)).toEqual([b.id, a.id]);
  });

  it('deletes a recipe with its lines only', async () => {
    const db = await fresh();
    const r = await guardarReceta(db, nuevaReceta('Pan'));
    const otra = await guardarReceta(db, nuevaReceta('Torta'));
    await guardarLinea(db, fijo(r.id, 0));
    await guardarLinea(db, linea(r.id, 'x', 1));
    const queda = await guardarLinea(db, fijo(otra.id, 0));
    await borrarReceta(db, r.id);
    expect((await listarRecetas(db)).map((x) => x.nombre)).toEqual(['Torta']);
    expect((await db.list('recetaLineas')).map((l) => l.id)).toEqual([queda.id]);
  });

  it('duplicates a recipe and its lines under new ids', async () => {
    const db = await fresh();
    const r = await guardarReceta(db, { ...nuevaReceta('Pan'), margen: 40 });
    const l1 = await guardarLinea(db, linea(r.id, 'x', 0));
    const l2 = await guardarLinea(db, fijo(r.id, 1));
    const copia = await duplicarReceta(db, r.id);
    expect(copia.id).not.toBe(r.id);
    expect(copia).toMatchObject({ nombre: 'Pan (copia)', margen: 40 });
    const got = await obtenerReceta(db, copia.id);
    expect(got?.lineas).toHaveLength(2);
    expect(got?.lineas.map((l) => l.id)).not.toContain(l1.id);
    expect(got?.lineas.map(({ tipo, orden }) => ({ tipo, orden }))).toEqual([
      { tipo: l1.tipo, orden: 0 },
      { tipo: l2.tipo, orden: 1 },
    ]);
    // the original is untouched
    expect((await obtenerReceta(db, r.id))?.lineas.map((l) => l.id)).toEqual([l1.id, l2.id]);
  });
});
