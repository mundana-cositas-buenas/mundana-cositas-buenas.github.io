import { describe, expect, it } from 'vitest';
import { csvCuentasProveedores, csvProductos, csvProveedores } from './csv';
import { asientosPorProveedor } from './proveedores';
import type { Movimiento, OperacionProveedor, Producto, Proveedor } from './types';

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
        p('a', 'Miel', { costo: 150000, precioVenta: 250050, proveedorId: 'pv' }),
        p('b', 'Dulce', { activo: false }),
        p('c', 'Té', { costo: 3000, precioVenta: 2000 }),
        p('d', 'Agua', { costo: 0, precioVenta: 500 }),
      ],
      new Map([
        ['a', 1.5],
        ['c', 7],
        ['d', -2],
      ]),
      [{ id: 'pv', actualizadoEn: '', nombre: 'Apícola', plazoDias: 15, activo: true }],
    );
    expect(csv.slice(1).trimEnd().split('\r\n')).toEqual([
      'Producto;Proveedor;Unidad;Stock;Mínimo;Costo;Precio de venta;Ganancia;Margen %;Valor del stock;Activo;Estado',
      'Miel;Apícola;frasco;1,5;2;1500,00;2500,50;1000,50;66,7;2250,00;Sí;Bajo el mínimo',
      'Dulce;;frasco;0;2;;;;;;No;Sin stock',
      'Té;;frasco;7;2;30,00;20,00;-10,00;-33,3;210,00;Sí;OK',
      'Agua;;frasco;-2;2;0,00;5,00;5,00;;0,00;Sí;Sin stock',
    ]);
  });
});

describe('csvProveedores / csvCuentasProveedores', () => {
  const pv: Proveedor = { id: 'pv', actualizadoEn: '', nombre: 'Apícola', plazoDias: 10, activo: true, rut: '21; 3', telefono: '099' };
  const otro: Proveedor = { id: 'x', actualizadoEn: '', nombre: 'Sin cuenta', plazoDias: 15, activo: false };
  const ops: OperacionProveedor[] = [
    { id: 'o1', actualizadoEn: '', proveedorId: 'pv', tipo: 'compra', importe: 100000, fecha: new Date(2026, 0, 1, 10).toISOString(), nota: 'fact. 1' },
    { id: 'o2', actualizadoEn: '', proveedorId: 'pv', tipo: 'pago', importe: 30000, fecha: new Date(2026, 0, 5, 10).toISOString(), medioPago: 'transferencia' },
    { id: 'o3', actualizadoEn: '', proveedorId: 'pv', tipo: 'ajuste', importe: -500, fecha: new Date(2026, 0, 6, 10).toISOString(), anuladoEn: 'x' },
  ];
  const movs: Movimiento[] = [
    { id: 'm1', actualizadoEn: '', productoId: 'a', tipo: 'entrada', cantidad: 2, fecha: new Date(2026, 0, 8, 10).toISOString(), proveedorId: 'pv', importe: 50000 },
  ];
  const cuentas = asientosPorProveedor(ops, movs);

  it('lists each supplier with its balance and what is due', () => {
    const csv = csvProveedores([pv, otro], cuentas, new Date(2026, 0, 12));
    expect(csv.slice(1).trimEnd().split('\r\n')).toEqual([
      'Proveedor;Plazo (días);Saldo;Vencido;Vence pronto;Teléfono;RUT;Número de cuenta;Notas;Activo',
      // The compra (due Jan 11) is overdue for what the payment left; the entrada is due Jan 18.
      'Apícola;10;1200,00;700,00;0,00;099;"21; 3";;;Sí',
      'Sin cuenta;15;0,00;0,00;0,00;;;;;No',
    ]);
  });

  it('lists every account line oldest first with its running balance', () => {
    const csv = csvCuentasProveedores([pv, otro], cuentas, [p('a', 'Miel')]);
    expect(csv.slice(1).trimEnd().split('\r\n')).toEqual([
      'Fecha;Proveedor;Tipo;Medio de pago;Importe;Saldo;Detalle;Anulado',
      '01/01/2026 10:00;Apícola;Compra;;1000,00;1000,00;fact. 1;No',
      '05/01/2026 10:00;Apícola;Pago;Transferencia;-300,00;700,00;;No',
      '06/01/2026 10:00;Apícola;Ajuste;;-5,00;700,00;;Sí',
      '08/01/2026 10:00;Apícola;Entrada de stock;;500,00;1200,00;Miel × 2;No',
    ]);
  });
});
