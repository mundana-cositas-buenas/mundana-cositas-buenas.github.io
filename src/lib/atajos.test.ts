import { describe, expect, it } from 'vitest';
import { ATAJOS, atajoDe, enCampo } from './atajos';
import { SECCIONES, seccionDesdeHash } from './nav';

const tecla = (key: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

const body = { tagName: 'BODY' };

describe('atajos', () => {
  it('maps keys to actions outside fields', () => {
    expect(atajoDe(tecla('i'), body)).toEqual({ tipo: 'ir', hash: '#/costos/insumos' });
    expect(atajoDe(tecla('M'), body)).toEqual({ tipo: 'ir', hash: '#/stock/movimientos' }); // Caps Lock
    expect(atajoDe(tecla('/'), null)).toEqual({ tipo: 'foco', objetivo: 'buscar' });
    expect(atajoDe(tecla('?'), body)).toEqual({ tipo: 'ayuda' });
    expect(atajoDe(tecla('x'), body)).toBeUndefined();
    expect(atajoDe(tecla('Enter'), body)).toBeUndefined();
  });

  it('leaves modified keys to the browser', () => {
    expect(atajoDe(tecla('r', { ctrlKey: true }), body)).toBeUndefined();
    expect(atajoDe(tecla('p', { altKey: true }), body)).toBeUndefined();
    expect(atajoDe(tecla('b', { metaKey: true }), body)).toBeUndefined();
  });

  it('does not fire while typing', () => {
    for (const d of [
      { tagName: 'INPUT' },
      { tagName: 'input', type: 'search' },
      { tagName: 'INPUT', type: 'text' },
      { tagName: 'TEXTAREA' },
      { tagName: 'SELECT' },
      { tagName: 'DIV', isContentEditable: true },
    ]) {
      expect(enCampo(d)).toBe(true);
      expect(atajoDe(tecla('r'), d)).toBeUndefined();
    }
    expect(atajoDe(tecla('r'), { tagName: 'INPUT', type: 'checkbox' })).toBeDefined();
    expect(atajoDe(tecla('r'), { tagName: 'BUTTON' })).toBeDefined();
  });

  it('has unique keys and routes to real sections', () => {
    const teclas = ATAJOS.map((a) => a.tecla);
    expect(new Set(teclas).size).toBe(teclas.length);
    for (const { atajo } of ATAJOS) {
      if (atajo.tipo !== 'ir') continue;
      const id = atajo.hash.replace(/^#\//, '').split('/')[0];
      expect(SECCIONES.map((s) => s.id)).toContain(id);
      expect(seccionDesdeHash(atajo.hash)).toBe(id);
    }
  });
});
