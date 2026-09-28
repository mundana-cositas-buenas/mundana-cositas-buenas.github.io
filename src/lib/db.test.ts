import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Insumo as InsumoCostos, PrecioHistorico } from '../costos/types';
import { DB, DB_VERSION, idbRequest, MIGRATIONS, newId, openDB, type Registro } from './db';

interface Insumo extends Registro {
  nombre: string;
}

let n = 0;
const open: DB[] = [];

async function fresh(): Promise<DB> {
  const db = await openDB(`test-${n++}`);
  open.push(db);
  return db;
}

afterEach(() => {
  open.splice(0).forEach((db) => db.close());
});

describe('openDB', () => {
  it('creates every store at the current version', async () => {
    const db = await fresh();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.idb.objectStoreNames].sort()).toEqual(
      ['historialPrecios', 'insumos', 'meta', 'movimientos', 'productos', 'recetaLineas', 'recetas'].sort(),
    );
    const lineas = db.idb.transaction('recetaLineas').objectStore('recetaLineas');
    expect([...lineas.indexNames].sort()).toEqual(['insumoId', 'recetaId']);
  });

  it('runs only the pending migrations when upgrading', async () => {
    const name = `migrate-${n++}`;
    const ran: number[] = [];
    const m1 = () => {
      ran.push(1);
    };
    const m2 = (idb: IDBDatabase) => {
      ran.push(2);
      idb.createObjectStore('extra', { keyPath: 'id' });
    };
    (await openDB(name, [m1])).close();
    expect(ran).toEqual([1]);
    const db = await openDB(name, [m1, m2]);
    open.push(db);
    expect(ran).toEqual([1, 2]);
    expect(db.version).toBe(2);
    expect(db.idb.objectStoreNames.contains('extra')).toBe(true);
  });

  it('v3 seeds the price history with the current cost of every ingredient', async () => {
    const name = `historial-${n++}`;
    const v2 = await openDB(name, MIGRATIONS.slice(0, 2));
    const base = { unidadBase: 'g', precioCompra: 100000, cantidadCompra: 1, unidadCompra: 'kg' } as const;
    await v2.put<InsumoCostos>('insumos', { id: 'h', actualizadoEn: '', nombre: 'Harina', ...base });
    await v2.put<InsumoCostos>('insumos', { id: 'x', actualizadoEn: '', nombre: 'Rota', ...base, cantidadCompra: 0 });
    v2.close();

    const db = await openDB(name);
    open.push(db);
    const h = await db.list<PrecioHistorico>('historialPrecios');
    expect(h).toHaveLength(1); // the one that can't be costed is skipped
    expect(h[0]).toMatchObject({ insumoId: 'h', unidadBase: 'g', costoPorUnidadBase: 100 });
    expect(await db.listBy('historialPrecios', 'insumoId', 'h')).toHaveLength(1);
  });

  it('lets a migration transform existing data', async () => {
    const name = `data-${n++}`;
    const m1 = (idb: IDBDatabase) => {
      idb.createObjectStore('insumos', { keyPath: 'id' });
    };
    const v1 = await openDB(name, [m1]);
    await v1.put<Insumo>('insumos', { id: 'a', nombre: 'harina', actualizadoEn: '' });
    v1.close();

    const m2 = (_: IDBDatabase, tx: IDBTransaction) => {
      const store = tx.objectStore('insumos');
      store.openCursor().onsuccess = (ev) => {
        const cur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cur) return;
        cur.update({ ...cur.value, nombre: cur.value.nombre.toUpperCase() });
        cur.continue();
      };
    };
    const v2 = await openDB(name, [m1, m2]);
    open.push(v2);
    expect((await v2.get<Insumo>('insumos', 'a'))?.nombre).toBe('HARINA');
  });
});

describe('CRUD', () => {
  it('put stamps actualizadoEn and get/list return the record', async () => {
    const db = await fresh();
    const saved = await db.put<Insumo>('insumos', { id: newId(), nombre: 'azúcar', actualizadoEn: '' });
    expect(saved.actualizadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await db.get('insumos', saved.id)).toEqual(saved);
    expect(await db.list('insumos')).toEqual([saved]);
  });

  it('put overwrites, delete and clear remove', async () => {
    const db = await fresh();
    const a = await db.put<Insumo>('insumos', { id: 'a', nombre: 'x', actualizadoEn: '' });
    await db.put<Insumo>('insumos', { ...a, nombre: 'y' });
    await db.put<Insumo>('insumos', { id: 'b', nombre: 'z', actualizadoEn: '' });
    expect((await db.get<Insumo>('insumos', 'a'))?.nombre).toBe('y');
    await db.delete('insumos', 'a');
    expect(await db.get('insumos', 'a')).toBeUndefined();
    await db.clear('insumos');
    expect(await db.list('insumos')).toEqual([]);
  });

  it('listBy queries an index', async () => {
    const db = await fresh();
    const mov = (id: string, productoId: string) => ({ id, productoId, actualizadoEn: '' });
    await db.put('movimientos', mov('1', 'p1'));
    await db.put('movimientos', mov('2', 'p2'));
    await db.put('movimientos', mov('3', 'p1'));
    const ids = (await db.listBy('movimientos', 'productoId', 'p1')).map((m) => m.id).sort();
    expect(ids).toEqual(['1', '3']);
  });
});

describe('tx', () => {
  it('commits writes across several stores atomically', async () => {
    const db = await fresh();
    await db.tx(['recetas', 'recetaLineas'], 'readwrite', async (tx) => {
      await idbRequest(tx.objectStore('recetas').put({ id: 'r', actualizadoEn: '' }));
      await idbRequest(tx.objectStore('recetaLineas').put({ id: 'l', recetaId: 'r', actualizadoEn: '' }));
    });
    expect(await db.get('recetas', 'r')).toBeDefined();
    expect(await db.get('recetaLineas', 'l')).toBeDefined();
  });

  it('rolls back everything when the callback throws', async () => {
    const db = await fresh();
    await expect(
      db.tx(['recetas', 'recetaLineas'], 'readwrite', async (tx) => {
        await idbRequest(tx.objectStore('recetas').put({ id: 'r', actualizadoEn: '' }));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.get('recetas', 'r')).toBeUndefined();
  });
});
