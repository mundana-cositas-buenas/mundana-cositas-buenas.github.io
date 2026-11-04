// CSV export of the stock module.

import { aCsv, pesosCsv } from '../lib/csv';
import { formatNumero } from '../lib/money';
import { formatFechaHora } from '../lib/texto';
import { nivel, rentabilidad, valorStock } from './logic';
import { cuentaCorriente, efectoAsiento, estadoCuenta, tituloMedio, TIPOS_OPERACION, type Asiento } from './proveedores';
import type { Producto, Proveedor } from './types';

const ESTADO = { ok: 'OK', bajo: 'Bajo el mínimo', agotado: 'Sin stock' };

export function csvProductos(
  productos: readonly Producto[],
  stock: ReadonlyMap<string, number>,
  proveedores: readonly Proveedor[] = [],
): string {
  const nombreProveedor = new Map(proveedores.map((p) => [p.id, p.nombre]));
  return aCsv([
    ['Producto', 'Proveedor', 'Unidad', 'Stock', 'Mínimo', 'Costo', 'Precio de venta', 'Ganancia', 'Margen %', 'Valor del stock', 'Activo', 'Estado'],
    ...productos.map((p) => {
      const s = stock.get(p.id) ?? 0;
      const r = rentabilidad(p);
      return [
        p.nombre,
        (p.proveedorId && nombreProveedor.get(p.proveedorId)) ?? '',
        p.unidad,
        s,
        p.stockMinimo,
        pesosCsv(p.costo),
        pesosCsv(p.precioVenta),
        pesosCsv(r?.ganancia),
        r?.margen === undefined ? undefined : Math.round(r.margen * 10) / 10,
        pesosCsv(valorStock(s, p.costo)),
        p.activo ? 'Sí' : 'No',
        ESTADO[nivel(s, p.stockMinimo)],
      ];
    }),
  ]);
}

export function csvProveedores(proveedores: readonly Proveedor[], cuentas: ReadonlyMap<string, readonly Asiento[]>, ahora = new Date()): string {
  return aCsv([
    ['Proveedor', 'Plazo (días)', 'Saldo', 'Vencido', 'Vence pronto', 'Teléfono', 'RUT', 'Número de cuenta', 'Notas', 'Activo'],
    ...proveedores.map((p) => {
      const e = estadoCuenta(cuentas.get(p.id) ?? [], p.plazoDias, ahora);
      return [
        p.nombre,
        p.plazoDias,
        pesosCsv(e.saldo),
        pesosCsv(e.vencido),
        pesosCsv(e.porVencer),
        p.telefono,
        p.rut,
        p.cuenta,
        p.nota,
        p.activo ? 'Sí' : 'No',
      ];
    }),
  ]);
}

const tituloAsiento = (a: Asiento) => (a.tipo === 'entrada' ? 'Entrada de stock' : (TIPOS_OPERACION.find((t) => t.id === a.tipo)?.titulo ?? a.tipo));

/** Every supplier's account, oldest first, with the running balance per supplier. Voided lines show with their amount but don't count. */
export function csvCuentasProveedores(
  proveedores: readonly Proveedor[],
  cuentas: ReadonlyMap<string, readonly Asiento[]>,
  productos: readonly Producto[] = [],
): string {
  const nombreProducto = new Map(productos.map((p) => [p.id, p.nombre]));
  const filas = proveedores.flatMap((p) =>
    cuentaCorriente(cuentas.get(p.id) ?? [])
      .reverse()
      .map(({ asiento: a, saldo }) => {
        const importe = a.anulado ? efectoAsiento({ ...a, anulado: false } as Asiento) : efectoAsiento(a);
        const detalle =
          a.tipo === 'entrada'
            ? `${nombreProducto.get(a.mov.productoId) ?? '(producto borrado)'} × ${formatNumero(a.mov.cantidad)}${a.mov.nota ? ` · ${a.mov.nota}` : ''}`
            : (a.op.nota ?? '');
        return [
          formatFechaHora(a.fecha),
          p.nombre,
          tituloAsiento(a),
          a.tipo === 'pago' ? tituloMedio(a.op.medioPago) : '',
          pesosCsv(importe),
          pesosCsv(saldo),
          detalle,
          a.anulado ? 'Sí' : 'No',
        ];
      }),
  );
  return aCsv([['Fecha', 'Proveedor', 'Tipo', 'Medio de pago', 'Importe', 'Saldo', 'Detalle', 'Anulado'], ...filas]);
}
