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
  it('lists stock, minimum, cost, price, profit, stock value and status', () => {
    const csv = csvProductos(
      [
        p('a', 'Miel', { costo: 150000, precioVenta: 250050 }),
        p('b', 'Dulce', { activo: false }),
        p('c', 'Té', { costo: 3000, precioVenta: 2000 }),
        p('d', 'Agua', { costo: 0, precioVenta: 500 }),
      ],
      new Map([
        ['a', 1.5],
        ['c', 7],
        ['d', -2],
      ]),
    );
    expect(csv.slice(1).trimEnd().split('\r\n')).toEqual([
      'Producto;Unidad;Stock;Mínimo;Costo;Precio de venta;Ganancia;Margen %;Valor del stock;Activo;Estado',
      'Miel;frasco;1,5;2;1500,00;2500,50;1000,50;66,7;2250,00;Sí;Bajo el mínimo',
      'Dulce;frasco;0;2;;;;;;No;Sin stock',
      'Té;frasco;7;2;30,00;20,00;-10,00;-33,3;210,00;Sí;OK',
      'Agua;frasco;-2;2;0,00;5,00;5,00;;0,00;Sí;Sin stock',
    ]);
  });
});
