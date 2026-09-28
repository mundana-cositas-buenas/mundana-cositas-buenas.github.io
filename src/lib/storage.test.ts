import { describe, expect, it } from 'vitest';
import { requestPersistence } from './storage';

const fake = (persisted: boolean, grant: boolean) => {
  let asked = 0;
  return {
    asked: () => asked,
    storage: {
      persisted: async () => persisted,
      persist: async () => {
        asked++;
        return grant;
      },
    },
  };
};

describe('requestPersistence', () => {
  it('does not ask again when already persisted', async () => {
    const f = fake(true, false);
    expect(await requestPersistence(f.storage)).toBe('persistente');
    expect(f.asked()).toBe(0);
  });

  it('reports the browser answer', async () => {
    expect(await requestPersistence(fake(false, true).storage)).toBe('persistente');
    expect(await requestPersistence(fake(false, false).storage)).toBe('no-persistente');
  });

  it('handles missing API and errors', async () => {
    expect(await requestPersistence(undefined)).toBe('no-soportado');
    const broken = { persisted: async () => { throw new Error('x'); }, persist: async () => true };
    expect(await requestPersistence(broken)).toBe('no-persistente');
  });
});
