// Parsing and validation of user-typed stock forms (strings) into records.

import { leerNumero, leerPesos, MONTO_INVALIDO, nombreRepetido, numeroEditable, type Errores, type Validado } from '../lib/campos';
import { parsePesos, pesosEditable, type Centavos } from '../lib/money';
import { rentabilidad } from './logic';
import { MEDIOS_PAGO, PLAZO_DEFAULT } from './proveedores';
import type { Categoria, ComponentePromo, MedioPago, Movimiento, OperacionProveedor, Producto, Promo, Proveedor, TipoMovimiento, TipoOperacion, Venta } from './types';

export interface ProductoForm {
  nombre: string;
  unidad: string;
  stockMinimo: string;
  costo: string;
  precioVenta: string;
  activo: boolean;
  proveedorId: string; // '' = none chosen
  categoriaId: string; // '' = none chosen
}

export const ETIQUETAS_PRODUCTO: Record<keyof ProductoForm, string> = {
  nombre: 'Nombre',
  unidad: 'Unidad',
  stockMinimo: 'Stock mínimo',
  costo: 'Costo',
  precioVenta: 'Precio de venta',
  activo: 'Activo',
  proveedorId: 'Proveedor',
  categoriaId: 'Categoría',
};

// Old products may lack a sale price, a supplier or a category, but every save sets them.
export type DatosProducto = Omit<Producto, 'id' | 'actualizadoEn' | 'precioVenta' | 'proveedorId' | 'categoriaId'> & {
  precioVenta: Centavos;
  proveedorId: string;
  categoriaId: string;
};

export const productoVacio = (): ProductoForm => ({
  nombre: '',
  unidad: '',
  stockMinimo: '',
  costo: '',
  precioVenta: '',
  activo: true,
  proveedorId: '',
  categoriaId: '',
});

export function productoFormDesde(p: Producto): ProductoForm {
  return {
    nombre: p.nombre,
    unidad: p.unidad,
    stockMinimo: numeroEditable(p.stockMinimo),
    costo: p.costo === undefined ? '' : pesosEditable(p.costo),
    precioVenta: p.precioVenta === undefined ? '' : pesosEditable(p.precioVenta),
    activo: p.activo,
    proveedorId: p.proveedorId ?? '',
    categoriaId: p.categoriaId ?? '',
  };
}

/**
 * Empty unit means "u", empty minimum means 0, empty cost means none; the sale price is required
 * (zero allowed), and so are the supplier and the category.
 */
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
  if (!f.proveedorId) errores.proveedorId = 'Elegí un proveedor';
  if (!f.categoriaId) errores.categoriaId = 'Elegí una categoría';
  if (Object.keys(errores).length || !minimo.ok || (costo && !costo.ok) || !precio.ok) return { ok: false, errores };
  const datos: DatosProducto = {
    nombre,
    unidad: f.unidad.trim() || 'u',
    stockMinimo: minimo.valor,
    precioVenta: precio.valor,
    activo: f.activo,
    proveedorId: f.proveedorId,
    categoriaId: f.categoriaId,
  };
  if (costo) datos.costo = costo.valor;
  return { ok: true, datos };
}

/** Warnings that don't block saving, as field → message (selling at a loss can be on purpose). */
export function avisosProducto(d: DatosProducto): Errores<ProductoForm> {
  const r = rentabilidad(d);
  return r && r.ganancia < 0 ? { costo: 'Es mayor que el precio de venta' } : {};
}

export interface CategoriaForm {
  nombre: string;
}

export const ETIQUETAS_CATEGORIA: Record<keyof CategoriaForm, string> = { nombre: 'Nombre' };

export type DatosCategoria = Omit<Categoria, 'id' | 'actualizadoEn'>;

export function validarCategoria(f: CategoriaForm, otrosNombres: readonly string[] = []): Validado<DatosCategoria, CategoriaForm> {
  const nombre = f.nombre.trim();
  if (!nombre) return { ok: false, errores: { nombre: 'Requerido' } };
  if (nombreRepetido(nombre, otrosNombres)) return { ok: false, errores: { nombre: 'Ya existe una categoría con ese nombre' } };
  return { ok: true, datos: { nombre } };
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
  importe?: string; // only for an entrada that adds to the supplier's account
}

export const ETIQUETAS_MOVIMIENTO: Record<keyof MovimientoForm, string> = {
  tipo: 'Tipo',
  cantidad: 'Cantidad',
  nota: 'Nota',
  importe: 'Importe',
};

// The supplier is not typed: the repo takes it from the product.
export type DatosMovimiento = Pick<Movimiento, 'tipo' | 'cantidad' | 'nota' | 'importe'>;

/**
 * Entries and sales take a positive quantity; adjustments a non-zero signed one.
 * An importe (zero allowed) is only read for an entrada.
 */
export function validarMovimiento(f: MovimientoForm): Validado<DatosMovimiento, MovimientoForm> {
  const errores: Errores<MovimientoForm> = {};
  const c = leerNumero(f.cantidad, f.tipo === 'ajuste' ? {} : { mayorQue: 0 });
  if (!c.ok) errores.cantidad = c.error;
  else if (c.valor === 0) errores.cantidad = 'No puede ser cero';
  const importe = f.tipo === 'entrada' && f.importe !== undefined ? leerPesos(f.importe) : undefined;
  if (importe && !importe.ok) errores.importe = importe.error;
  if (Object.keys(errores).length || !c.ok) return { ok: false, errores };
  const datos: DatosMovimiento = { tipo: f.tipo, cantidad: c.valor };
  if (importe?.ok) datos.importe = importe.valor;
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

// --- Suppliers ---

export interface ProveedorForm {
  nombre: string;
  plazo: string; // days
  activo: boolean;
  telefono: string;
  rut: string;
  cuenta: string;
  nota: string;
}

export const ETIQUETAS_PROVEEDOR: Record<keyof ProveedorForm, string> = {
  nombre: 'Nombre',
  plazo: 'Plazo de pago',
  activo: 'Activo',
  telefono: 'Teléfono',
  rut: 'RUT',
  cuenta: 'Número de cuenta',
  nota: 'Notas',
};

export type DatosProveedor = Omit<Proveedor, 'id' | 'actualizadoEn'>;

export const proveedorVacio = (): ProveedorForm => ({ nombre: '', plazo: '', activo: true, telefono: '', rut: '', cuenta: '', nota: '' });

export function proveedorFormDesde(p: Proveedor): ProveedorForm {
  return {
    nombre: p.nombre,
    plazo: String(p.plazoDias),
    activo: p.activo,
    telefono: p.telefono ?? '',
    rut: p.rut ?? '',
    cuenta: p.cuenta ?? '',
    nota: p.nota ?? '',
  };
}

/** Name required and unique among suppliers; empty term means the default; the other fields are optional text. */
export function validarProveedor(f: ProveedorForm, otrosNombres: readonly string[] = []): Validado<DatosProveedor, ProveedorForm> {
  const errores: Errores<ProveedorForm> = {};
  const nombre = f.nombre.trim();
  if (!nombre) errores.nombre = 'Requerido';
  else if (nombreRepetido(nombre, otrosNombres)) errores.nombre = 'Ya existe un proveedor con ese nombre';
  const plazo = f.plazo.trim() ? leerNumero(f.plazo, { min: 0 }) : { ok: true as const, valor: PLAZO_DEFAULT };
  if (!plazo.ok) errores.plazo = plazo.error;
  else if (!Number.isInteger(plazo.valor)) errores.plazo = 'Tiene que ser una cantidad entera de días';
  if (Object.keys(errores).length || !plazo.ok) return { ok: false, errores };
  const datos: DatosProveedor = { nombre, plazoDias: plazo.valor, activo: f.activo };
  for (const k of ['telefono', 'rut', 'cuenta', 'nota'] as const) {
    const v = f[k].trim();
    if (v) datos[k] = v;
  }
  return { ok: true, datos };
}

export interface OperacionForm {
  tipo: TipoOperacion;
  importe: string;
  medioPago: MedioPago;
  nota: string;
}

export const ETIQUETAS_OPERACION: Record<keyof OperacionForm, string> = {
  tipo: 'Tipo',
  importe: 'Importe',
  medioPago: 'Medio de pago',
  nota: 'Nota',
};

export type DatosOperacion = Pick<OperacionProveedor, 'tipo' | 'importe' | 'medioPago' | 'nota'>;

/** Purchases and payments take a positive amount; adjustments a non-zero signed one. Payments keep their method. */
export function validarOperacion(f: OperacionForm): Validado<DatosOperacion, OperacionForm> {
  let importe: number;
  if (!f.importe.trim()) return { ok: false, errores: { importe: 'Requerido' } };
  if (f.tipo === 'ajuste') {
    importe = parsePesos(f.importe);
    if (Number.isNaN(importe)) return { ok: false, errores: { importe: MONTO_INVALIDO } };
  } else {
    const r = leerPesos(f.importe);
    if (!r.ok) return { ok: false, errores: { importe: r.error } };
    importe = r.valor;
  }
  if (importe === 0) return { ok: false, errores: { importe: 'No puede ser cero' } };
  if (f.tipo === 'pago' && !MEDIOS_PAGO.some((m) => m.id === f.medioPago)) return { ok: false, errores: { medioPago: 'Elegí un medio de pago' } };
  const datos: DatosOperacion = { tipo: f.tipo, importe };
  if (f.tipo === 'pago') datos.medioPago = f.medioPago;
  const nota = f.nota.trim();
  if (nota) datos.nota = nota;
  return { ok: true, datos };
}
