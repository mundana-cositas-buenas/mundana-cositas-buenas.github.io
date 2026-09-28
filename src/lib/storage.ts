export type PersistState = 'persistente' | 'no-persistente' | 'no-soportado';

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage,
): Promise<PersistState> {
  if (!storage?.persist) return 'no-soportado';
  try {
    if (await storage.persisted()) return 'persistente';
    return (await storage.persist()) ? 'persistente' : 'no-persistente';
  } catch {
    return 'no-persistente';
  }
}
