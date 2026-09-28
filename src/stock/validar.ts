// Parsing and validation of user-typed stock forms (strings) into records.

import { leerNumero, leerPesos, nombreRepetido, numeroEditable, type Errores, type Validado } from '../lib/campos';
import { pesosEditable } from '../lib/money';
import type { Movimiento, Producto, TipoMovimiento } from './types';

export interface ProductoForm {
  nombre: string;
  unidad: string;
  stockMinimo: string;
  precioVenta: string;
  activo: boolean;
}

export type DatosProducto = Omit<Producto, 'id' | 'actualizadoEn'>;

export const productoVacio = (): ProductoForm => ({ nombre: '', unidad: '', stockMinimo: '', precioVenta: '', activo: true });

export function productoFormDesde(p: Producto): ProductoForm {
  return {
    nombre: p.nombre,
    unidad: p.unidad,
    stockMinimo: numeroEditable(p.stockMinimo),
    precioVenta: p.precioVenta === undefined ? '' : pesosEditable(p.precioVenta),
    activo: p.activo,
  };
}

/** Empty unit means "u", empty minimum means 0, empty price means none. */
export function validarProducto(f: ProductoForm, otrosNombres: readonly string[] = []): Validado<DatosProducto, ProductoForm> {
  const errores: Errores<ProductoForm> = {};
  const nombre = f.nombre.trim();
  if (!nombre) errores.nombre = 'Requerido';
  else if (nombreRepetido(nombre, otrosNombres)) errores.nombre = 'Ya existe un producto con ese nombre';
  const minimo = leerNumero(f.stockMinimo || '0', { min: 0 });
  if (!minimo.ok) errores.stockMinimo = minimo.error;
  const precio = f.precioVenta.trim() ? leerPesos(f.precioVenta) : undefined;
  if (precio && !precio.ok) errores.precioVenta = precio.error;
  if (Object.keys(errores).length || !minimo.ok || (precio && !precio.ok)) return { ok: false, errores };
  const datos: DatosProducto = { nombre, unidad: f.unidad.trim() || 'u', stockMinimo: minimo.valor, activo: f.activo };
  if (precio) datos.precioVenta = precio.valor;
  return { ok: true, datos };
}

export const TIPOS: readonly { id: TipoMovimiento; titulo: string }[] = [
  { id: 'venta', titulo: 'Venta' },
  { id: 'entrada', titulo: 'Entrada' },
  { id: 'ajuste', titulo: 'Ajuste' },
];

export interface MovimientoForm {
  tipo: TipoMovimiento;
  cantidad: string;
  nota: string;
}

export type DatosMovimiento = Pick<Movimiento, 'tipo' | 'cantidad' | 'nota'>;

/** Entries and sales take a positive quantity; adjustments a non-zero signed one. */
export function validarMovimiento(f: MovimientoForm): Validado<DatosMovimiento, MovimientoForm> {
  const c = leerNumero(f.cantidad, f.tipo === 'ajuste' ? {} : { mayorQue: 0 });
  if (!c.ok) return { ok: false, errores: { cantidad: c.error } };
  if (c.valor === 0) return { ok: false, errores: { cantidad: 'No puede ser cero' } };
  const datos: DatosMovimiento = { tipo: f.tipo, cantidad: c.valor };
  const nota = f.nota.trim();
  if (nota) datos.nota = nota;
  return { ok: true, datos };
}
