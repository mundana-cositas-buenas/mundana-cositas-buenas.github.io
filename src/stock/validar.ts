// Parsing and validation of user-typed stock forms (strings) into records.

import { leerNumero, leerPesos, nombreRepetido, numeroEditable, type Errores, type Validado } from '../lib/campos';
import { pesosEditable, type Centavos } from '../lib/money';
import { rentabilidad } from './logic';
import type { ComponentePromo, Movimiento, Producto, Promo, TipoMovimiento, Venta } from './types';

export interface ProductoForm {
  nombre: string;
  unidad: string;
  stockMinimo: string;
  costo: string;
  precioVenta: string;
  activo: boolean;
}

export const ETIQUETAS_PRODUCTO: Record<keyof ProductoForm, string> = {
  nombre: 'Nombre',
  unidad: 'Unidad',
  stockMinimo: 'Stock mínimo',
  costo: 'Costo',
  precioVenta: 'Precio de venta',
  activo: 'Activo',
};

// Old products may lack a sale price, but every save sets one.
export type DatosProducto = Omit<Producto, 'id' | 'actualizadoEn' | 'precioVenta'> & { precioVenta: Centavos };

export const productoVacio = (): ProductoForm => ({ nombre: '', unidad: '', stockMinimo: '', costo: '', precioVenta: '', activo: true });

export function productoFormDesde(p: Producto): ProductoForm {
  return {
    nombre: p.nombre,
    unidad: p.unidad,
    stockMinimo: numeroEditable(p.stockMinimo),
    costo: p.costo === undefined ? '' : pesosEditable(p.costo),
    precioVenta: p.precioVenta === undefined ? '' : pesosEditable(p.precioVenta),
    activo: p.activo,
  };
}

/** Empty unit means "u", empty minimum means 0, empty cost means none; the sale price is required (zero allowed). */
export function validarProducto(f: ProductoForm, otrosNombres: readonly string[] = []): Validado<DatosProducto, ProductoForm> {
  const errores: Errores<ProductoForm> = {};
  const nombre = f.nombre.trim();
  if (!nombre) errores.nombre = 'Requerido';
  else if (nombreRepetido(nombre, otrosNombres)) errores.nombre = 'Ya existe un producto con ese nombre';
  const minimo = leerNumero(f.stockMinimo || '0', { min: 0 });
  if (!minimo.ok) errores.stockMinimo = minimo.error;
  const costo = f.costo.trim() ? leerPesos(f.costo) : undefined;
  if (costo && !costo.ok) errores.costo = costo.error;
  const precio = leerPesos(f.precioVenta);
  if (!precio.ok) errores.precioVenta = precio.error;
  if (Object.keys(errores).length || !minimo.ok || (costo && !costo.ok) || !precio.ok) return { ok: false, errores };
  const datos: DatosProducto = { nombre, unidad: f.unidad.trim() || 'u', stockMinimo: minimo.valor, precioVenta: precio.valor, activo: f.activo };
  if (costo) datos.costo = costo.valor;
  return { ok: true, datos };
}

/** Warnings that don't block saving, as field → message (selling at a loss can be on purpose). */
export function avisosProducto(d: DatosProducto): Errores<ProductoForm> {
  const r = rentabilidad(d);
  return r && r.ganancia < 0 ? { costo: 'Es mayor que el precio de venta' } : {};
}

export const TIPOS: readonly { id: TipoMovimiento; titulo: string }[] = [
  { id: 'venta', titulo: 'Venta' },
  { id: 'entrada', titulo: 'Entrada' },
  { id: 'ajuste', titulo: 'Ajuste' },
];

/** Types in the quick movement form: sales are entered as a Venta. */
export const TIPOS_RAPIDOS = TIPOS.filter((t) => t.id !== 'venta');

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

export interface VentaForm {
  descuento: string; // %
  nota: string;
}

export const ETIQUETAS_VENTA: Record<keyof VentaForm, string> = {
  descuento: 'Descuento',
  nota: 'Nota',
};

export type DatosVenta = Pick<Venta, 'descuentoPct' | 'nota'>;

/** Empty discount means 0 %; otherwise 0 to 100, decimals allowed. */
export function validarVenta(f: VentaForm): Validado<DatosVenta, VentaForm> {
  const d = leerNumero(f.descuento.trim() || '0', { min: 0, max: 100 });
  if (!d.ok) return { ok: false, errores: { descuento: d.error } };
  const datos: DatosVenta = { descuentoPct: d.valor };
  const nota = f.nota.trim();
  if (nota) datos.nota = nota;
  return { ok: true, datos };
}

export interface ComponenteForm {
  productoId: string;
  cantidad: string;
}

export interface PromoForm {
  nombre: string;
  precio: string;
  activo: boolean;
  componentes: ComponenteForm[];
}

export const ETIQUETAS_PROMO: Record<keyof PromoForm, string> = {
  nombre: 'Nombre',
  precio: 'Precio',
  activo: 'Activa',
  componentes: 'Productos',
};

export type DatosPromo = Omit<Promo, 'id' | 'actualizadoEn'>;

export const promoVacia = (): PromoForm => ({ nombre: '', precio: '', activo: true, componentes: [] });

export function promoFormDesde(p: Promo): PromoForm {
  return {
    nombre: p.nombre,
    precio: pesosEditable(p.precio),
    activo: p.activo,
    componentes: p.componentes.map((c) => ({ productoId: c.productoId, cantidad: numeroEditable(c.cantidad) })),
  };
}

/** A component's quantity: positive, decimals allowed. */
export const leerCantidadComponente = (cantidad: string) => leerNumero(cantidad, { mayorQue: 0 });

/** Name required and unique among promos, price required (zero allowed), at least one product, positive quantities. */
export function validarPromo(f: PromoForm, otrosNombres: readonly string[] = []): Validado<DatosPromo, PromoForm> {
  const errores: Errores<PromoForm> = {};
  const nombre = f.nombre.trim();
  if (!nombre) errores.nombre = 'Requerido';
  else if (nombreRepetido(nombre, otrosNombres)) errores.nombre = 'Ya existe una promo con ese nombre';
  const precio = leerPesos(f.precio);
  if (!precio.ok) errores.precio = precio.error;
  const componentes: ComponentePromo[] = [];
  let malas = 0;
  for (const c of f.componentes) {
    const n = leerCantidadComponente(c.cantidad);
    if (!n.ok) malas++;
    else {
      // The same product twice is one component with both quantities.
      const igual = componentes.find((x) => x.productoId === c.productoId);
      if (igual) igual.cantidad = Math.round((igual.cantidad + n.valor) * 1e6) / 1e6;
      else componentes.push({ productoId: c.productoId, cantidad: n.valor });
    }
  }
  if (!f.componentes.length) errores.componentes = 'Agregá al menos un producto';
  else if (malas) errores.componentes = malas === 1 ? 'Hay una cantidad inválida' : `Hay ${malas} cantidades inválidas`;
  if (Object.keys(errores).length || !precio.ok) return { ok: false, errores };
  return { ok: true, datos: { nombre, precio: precio.valor, activo: f.activo, componentes } };
}
