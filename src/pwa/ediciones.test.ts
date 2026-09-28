import { describe, expect, it } from 'vitest';
import { Ediciones } from './ediciones';

const campo = (value = '') => ({ value, isConnected: true });

describe('Ediciones', () => {
  it('has nothing pending until the user types', () => {
    const e = new Ediciones();
    const c = campo('abc');
    e.foco(c);
    expect(e.pendientes()).toBe(false);
  });

  it('is pending while a typed field differs from its value on focus', () => {
    const e = new Ediciones();
    const c = campo('100');
    e.foco(c);
    c.value = '1000';
    e.input(c);
    expect(e.pendientes()).toBe(true);
    c.value = '100';
    expect(e.pendientes()).toBe(false);
  });

  it('keeps the original snapshot across refocus while edits are pending', () => {
    const e = new Ediciones();
    const c = campo('');
    e.foco(c);
    c.value = 'harina';
    e.input(c);
    e.foco(c); // focus again: must not take 'harina' as the new baseline
    expect(e.pendientes()).toBe(true);
  });

  it('forgets fields that were saved and reset or removed from the page', () => {
    const e = new Ediciones();
    const nuevo = campo('');
    e.foco(nuevo);
    nuevo.value = 'x';
    e.input(nuevo);
    nuevo.value = ''; // form reset after saving
    const fila = campo('a');
    e.foco(fila);
    fila.value = 'b';
    e.input(fila);
    fila.isConnected = false; // edit row closed
    expect(e.pendientes()).toBe(false);
    // Once cleared, a later edit counts from the new value.
    e.foco(nuevo);
    expect(e.pendientes()).toBe(false);
  });

  it('assumes an empty baseline if it never saw the focus', () => {
    const e = new Ediciones();
    const c = campo('x');
    e.input(c);
    expect(e.pendientes()).toBe(true);
  });
});
