// Parsing and validation of user-typed form values (strings) into records.

import { describirErrores, leerNumero, leerPesos, nombreRepetido, numeroEditable, type Errores, type Resultado, type Validado } from '../lib/campos';
import { pesosEditable } from '../lib/money';
import type { Unidad, UnidadBase } from '../lib/units';
import { costoPorUnidadBase } from './calc';
import type { Insumo, LineaCostoFijo, LineaInsumo, Receta, RecetaLinea } from './types';

export interface InsumoForm {
  nombre: string;
  unidadBase: UnidadBase;
  precio: string;
  cantidad: string;
  unidadCompra: Unidad;
}

export const ETIQUETAS_INSUMO: Record<keyof InsumoForm, string> = {
  nombre: 'Nombre',
  unidadBase: 'Se mide en',
  precio: 'Precio de compra',
  cantidad: 'Cantidad comprada',
  unidadCompra: 'Unidad de compra',
};

type DatosInsumo = Omit<Insumo, 'id' | 'actualizadoEn'>;

export function validarInsumo(f: InsumoForm, otrosNombres: readonly string[] = []): Validado<DatosInsumo, InsumoForm> {
  const errores: Errores<InsumoForm> = {};
  const nombre = f.nombre.trim();
  if (!nombre) errores.nombre = 'Requerido';
  else if (nombreRepetido(nombre, otrosNombres))
    errores.nombre = 'Ya existe un insumo con ese nombre';
  const precio = leerPesos(f.precio);
  if (!precio.ok) errores.precio = precio.error;
  const cantidad = leerNumero(f.cantidad, { mayorQue: 0 });
  if (!cantidad.ok) errores.cantidad = cantidad.error;
  if (Object.keys(errores).length || !precio.ok || !cantidad.ok) return { ok: false, errores };
  const datos: DatosInsumo = {
    nombre,
    unidadBase: f.unidadBase,
    precioCompra: precio.valor,
    cantidadCompra: cantidad.valor,
    unidadCompra: f.unidadCompra,
  };
  const c = costoPorUnidadBase(datos);
  if (!c.ok) return { ok: false, errores: { unidadCompra: c.error } };
  return { ok: true, datos };
}

export interface CabeceraForm {
  nombre: string;
  rendimiento: string;
  unidadRendimiento: string;
  margen: string;
  notas: string;
}

export const ETIQUETAS_CABECERA: Record<keyof CabeceraForm, string> = {
  nombre: 'Nombre',
  rendimiento: 'Rinde',
  unidadRendimiento: 'Unidad',
  margen: 'Margen',
  notas: 'Notas',
};

type DatosCabecera = Pick<Receta, 'nombre' | 'rendimiento' | 'unidadRendimiento' | 'margen' | 'notas'>;

export function cabeceraDesde(r: Receta): CabeceraForm {
  return {
    nombre: r.nombre,
    rendimiento: numeroEditable(r.rendimiento),
    unidadRendimiento: r.unidadRendimiento,
    margen: numeroEditable(r.margen),
    notas: r.notas,
  };
}

export function validarCabecera(f: CabeceraForm): Validado<DatosCabecera, CabeceraForm> {
  const errores: Errores<CabeceraForm> = {};
  const nombre = f.nombre.trim();
  if (!nombre) errores.nombre = 'Requerido';
  const rendimiento = leerNumero(f.rendimiento, { mayorQue: 0 });
  if (!rendimiento.ok) errores.rendimiento = rendimiento.error;
  const margen = leerNumero(f.margen || '0', { min: 0 });
  if (!margen.ok) errores.margen = margen.error;
  if (!rendimiento.ok || !margen.ok || errores.nombre) return { ok: false, errores };
  return {
    ok: true,
    datos: { nombre, rendimiento: rendimiento.valor, unidadRendimiento: f.unidadRendimiento.trim(), margen: margen.valor, notas: f.notas },
  };
}

/** A recipe line being edited: numeric fields as typed text. */
export type Fila =
  | { tipo: 'insumo'; linea: LineaInsumo; cantidad: string; merma: string }
  | { tipo: 'costoFijo'; linea: LineaCostoFijo; monto: string };

export function filaDesde(l: RecetaLinea): Fila {
  if (l.tipo === 'insumo')
    return { tipo: 'insumo', linea: l, cantidad: numeroEditable(l.cantidad), merma: l.mermaPct ? numeroEditable(l.mermaPct) : '' };
  return { tipo: 'costoFijo', linea: l, monto: pesosEditable(l.monto) };
}

/**
 * The line as currently typed (invalid numbers become NaN, which calc reports as a line error),
 * plus the field errors. Save it only when there are no errors.
 */
export function leerFila(f: Fila): { linea: RecetaLinea; errores: Record<string, string> } {
  const errores: Record<string, string> = {};
  const valor = (campo: string, r: Resultado) => {
    if (r.ok) return r.valor;
    errores[campo] = r.error;
    return NaN;
  };
  if (f.tipo === 'insumo') {
    const cantidad = valor('cantidad', leerNumero(f.cantidad, { min: 0 }));
    const mermaPct = valor('merma', leerNumero(f.merma || '0', { min: 0, menorQue: 100 }));
    return { linea: { ...f.linea, cantidad, mermaPct }, errores };
  }
  const monto = valor('monto', leerPesos(f.monto));
  return { linea: { ...f.linea, descripcion: f.linea.descripcion.trim(), monto }, errores };
}

const ETIQUETAS_LINEA: Record<string, string> = { cantidad: 'Cantidad', merma: 'Merma', monto: 'Monto' };

/** The typing errors of a line as one message ("Cantidad: No puede ser negativo"), or '' if none. */
export function mensajeFila(errores: Record<string, string>): string {
  return describirErrores(errores, ETIQUETAS_LINEA);
}
