// Recipe costing: pure functions. Results are fractional cents; round only on display.

import type { Resultado } from '../lib/campos';
import type { Centavos } from '../lib/money';
import { aBase } from '../lib/units';
import type { Insumo, LineaInsumo, PrecioHistorico, Receta, RecetaLinea } from './types';

const ok = (valor: number): Resultado => ({ ok: true, valor });
const err = (error: string): Resultado => ({ ok: false, error });

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** precioCompra / (cantidadCompra in the base unit). */
export function costoPorUnidadBase(i: Pick<Insumo, 'precioCompra' | 'cantidadCompra' | 'unidadCompra' | 'unidadBase'>): Resultado {
  if (!(i.precioCompra >= 0)) return err('Precio de compra inválido');
  let cantidad: number;
  try {
    cantidad = aBase(i.cantidadCompra, i.unidadCompra, i.unidadBase);
  } catch (e) {
    return err(mensaje(e));
  }
  if (!(cantidad > 0)) return err('La cantidad de compra debe ser mayor que cero');
  return ok(i.precioCompra / cantidad);
}

/** cantidad (base unit) * costoPorUnidadBase / (1 - merma). */
export function costoLineaInsumo(
  l: Pick<LineaInsumo, 'insumoId' | 'cantidad' | 'unidad' | 'mermaPct'>,
  insumos: ReadonlyMap<string, Insumo>,
): Resultado {
  const insumo = insumos.get(l.insumoId);
  if (!insumo) return err('Insumo inexistente');
  if (!(l.cantidad >= 0)) return err('Cantidad inválida');
  if (!(l.mermaPct >= 0 && l.mermaPct < 100)) return err('La merma debe estar entre 0 y 99,9 %');
  const cpub = costoPorUnidadBase(insumo);
  if (!cpub.ok) return err(`Insumo "${insumo.nombre}": ${cpub.error}`);
  let cantidad: number;
  try {
    cantidad = aBase(l.cantidad, l.unidad, insumo.unidadBase);
  } catch (e) {
    return err(mensaje(e));
  }
  return ok((cantidad * cpub.valor) / (1 - l.mermaPct / 100));
}

export function costoLinea(l: RecetaLinea, insumos: ReadonlyMap<string, Insumo>): Resultado {
  if (l.tipo === 'insumo') return costoLineaInsumo(l, insumos);
  return l.monto >= 0 ? ok(l.monto) : err('Monto inválido');
}

export interface CostoReceta {
  lineas: Map<string, Resultado>; // by line id
  errores: number; // lines that couldn't be costed (excluded from the total)
  costoTotal: Centavos;
  costoPorUnidad: Centavos; // NaN if rendimiento <= 0
  precioSugerido: Centavos; // NaN if rendimiento <= 0
}

export function costoReceta(
  receta: Pick<Receta, 'rendimiento' | 'margen'>,
  lineas: readonly RecetaLinea[],
  insumos: ReadonlyMap<string, Insumo>,
): CostoReceta {
  const res = new Map<string, Resultado>();
  let total = 0;
  let errores = 0;
  for (const l of lineas) {
    const r = costoLinea(l, insumos);
    res.set(l.id, r);
    if (r.ok) total += r.valor;
    else errores++;
  }
  const porUnidad = receta.rendimiento > 0 ? total / receta.rendimiento : NaN;
  return {
    lineas: res,
    errores,
    costoTotal: total,
    costoPorUnidad: porUnidad,
    precioSugerido: porUnidad * (1 + receta.margen / 100),
  };
}

export function porId<T extends { id: string }>(xs: readonly T[]): Map<string, T> {
  return new Map(xs.map((x) => [x.id, x]));
}

// --- Price history ---

/** A history entry with the ingredient's current cost, or undefined if it can't be costed. */
export function entradaHistorial(i: Insumo, id: string, fecha: string): PrecioHistorico | undefined {
  const c = costoPorUnidadBase(i);
  if (!c.ok) return undefined;
  return { id, actualizadoEn: fecha, insumoId: i.id, fecha, unidadBase: i.unidadBase, costoPorUnidadBase: c.valor };
}

/** True if `nueva` records a different cost than the last entry (renames and same-cost edits don't count). */
export function cambioDeCosto(ultima: PrecioHistorico | undefined, nueva: PrecioHistorico): boolean {
  if (!ultima || ultima.unidadBase !== nueva.unidadBase) return true;
  const a = ultima.costoPorUnidadBase;
  const b = nueva.costoPorUnidadBase;
  return Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export interface Variacion {
  entrada: PrecioHistorico;
  pct?: number; // change vs the previous entry, if it's in the same unit family and not zero
}

/** History newest first, each entry with its % change vs the one before it. */
export function variaciones(historial: readonly PrecioHistorico[]): Variacion[] {
  const orden = [...historial].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return orden
    .map((entrada, i): Variacion => {
      const prev = orden[i - 1];
      if (!prev || prev.unidadBase !== entrada.unidadBase || !(prev.costoPorUnidadBase > 0)) return { entrada };
      return { entrada, pct: (entrada.costoPorUnidadBase / prev.costoPorUnidadBase - 1) * 100 };
    })
    .reverse();
}
