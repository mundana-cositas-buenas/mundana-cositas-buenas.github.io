import { describe, expect, it } from 'vitest';
import { csvProductos } from './csv';
import type { Producto } from './types';

const p = (id: string, nombre: string, extra: Partial<Producto> = {}): Producto => ({
  id,
  actualizadoEn: '',
  nombre,
  unidad: 'frasco',
  stockMinimo: 2,
  activo: true,
  ...extra,
});

describe('csvProductos', () => {
  it('lists stock, minimum, price and status', () => {
    const csv = csvProductos([p('a', 'Miel', { precioVenta: 250050 }), p('b', 'Dulce', { activo: false })], new Map([['a', 1.5]]));
    expect(csv.slice(1).trimEnd().split('\r\n')).toEqual([
      'Producto;Unidad;Stock;Mínimo;Precio de venta;Activo;Estado',
      'Miel;frasco;1,5;2;2500,50;Sí;Bajo el mínimo',
      'Dulce;frasco;0;2;;No;Sin stock',
    ]);
  });
});
