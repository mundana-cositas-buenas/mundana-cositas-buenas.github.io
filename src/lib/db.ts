// Minimal IndexedDB wrapper with explicit, ordered schema migrations.

export interface Registro {
  id: string;
  actualizadoEn: string; // ISO 8601
}

export type StoreName =
  | 'insumos'
  | 'recetas'
  | 'recetaLineas'
  | 'productos'
  | 'movimientos'
  | 'meta';

export const DB_NAME = 'mundana';

// MIGRATIONS[i] upgrades the schema from version i to i + 1.
// Never edit a released migration: append a new one instead.
type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

const MIGRATIONS: Migration[] = [
  (db) => {
    db.createObjectStore('insumos', { keyPath: 'id' });
    db.createObjectStore('recetas', { keyPath: 'id' });
    db.createObjectStore('recetaLineas', { keyPath: 'id' }).createIndex('recetaId', 'recetaId');
    db.createObjectStore('productos', { keyPath: 'id' });
    db.createObjectStore('movimientos', { keyPath: 'id' }).createIndex('productoId', 'productoId');
    db.createObjectStore('meta', { keyPath: 'id' });
  },
];

export const DB_VERSION = MIGRATIONS.length;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openDB(name = DB_NAME, migrations: Migration[] = MIGRATIONS): Promise<DB> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, migrations.length);
    r.onupgradeneeded = (ev) => {
      const tx = r.transaction!;
      for (let v = ev.oldVersion; v < migrations.length; v++) migrations[v](r.result, tx);
    };
    r.onsuccess = () => resolve(new DB(r.result));
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('La base está abierta en otra pestaña; cerrala y recargá.'));
  });
}

let shared: Promise<DB> | undefined;

/** The app-wide connection, opened on first use. */
export function getDB(): Promise<DB> {
  shared ??= openDB();
  return shared;
}

export function newId(): string {
  return crypto.randomUUID();
}

export class DB {
  constructor(readonly idb: IDBDatabase) {
    // Another tab is upgrading the schema: step aside so it isn't blocked.
    idb.onversionchange = () => idb.close();
  }

  get version(): number {
    return this.idb.version;
  }

  close(): void {
    this.idb.close();
  }

  /** Runs `fn` in one transaction; resolves with its result once the transaction commits. */
  async tx<T>(
    stores: StoreName | StoreName[],
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction) => Promise<T> | T,
  ): Promise<T> {
    const tx = this.idb.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
      tx.onerror = () => reject(tx.error);
    });
    let result: T;
    try {
      result = await fn(tx);
    } catch (e) {
      try {
        tx.abort();
      } catch {
        // already finished
      }
      await done.catch(() => {});
      throw e;
    }
    await done;
    return result;
  }

  get<T extends Registro>(store: StoreName, id: string): Promise<T | undefined> {
    return this.tx(store, 'readonly', (tx) => req<T | undefined>(tx.objectStore(store).get(id)));
  }

  list<T extends Registro>(store: StoreName): Promise<T[]> {
    return this.tx(store, 'readonly', (tx) => req<T[]>(tx.objectStore(store).getAll()));
  }

  listBy<T extends Registro>(store: StoreName, index: string, value: IDBValidKey): Promise<T[]> {
    return this.tx(store, 'readonly', (tx) =>
      req<T[]>(tx.objectStore(store).index(index).getAll(value)),
    );
  }

  /** Stores a record, stamping `actualizadoEn`. Returns the stored record. */
  put<T extends Registro>(store: StoreName, record: T): Promise<T> {
    const r = { ...record, actualizadoEn: new Date().toISOString() };
    return this.tx(store, 'readwrite', async (tx) => {
      await req(tx.objectStore(store).put(r));
      return r;
    });
  }

  delete(store: StoreName, id: string): Promise<void> {
    return this.tx(store, 'readwrite', async (tx) => {
      await req(tx.objectStore(store).delete(id));
    });
  }

  clear(store: StoreName): Promise<void> {
    return this.tx(store, 'readwrite', async (tx) => {
      await req(tx.objectStore(store).clear());
    });
  }
}

export { req as idbRequest };
