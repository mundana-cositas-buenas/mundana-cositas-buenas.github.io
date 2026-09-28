import type { Registro } from '../lib/db';
import type { Centavos } from '../lib/money';
import type { Unidad, UnidadBase } from '../lib/units';

export interface Insumo extends Registro {
  nombre: string;
  unidadBase: UnidadBase;
  precioCompra: Centavos;
  cantidadCompra: number; // in unidadCompra
  unidadCompra: Unidad;
}

export interface Receta extends Registro {
  nombre: string;
  rendimiento: number;
  unidadRendimiento: string; // free text: "panes"
  margen: number; // %
  notas: string;
}

interface LineaBase extends Registro {
  recetaId: string;
  orden: number;
}

export interface LineaInsumo extends LineaBase {
  tipo: 'insumo';
  insumoId: string;
  cantidad: number; // in unidad
  unidad: Unidad;
  mermaPct: number;
}

export interface LineaCostoFijo extends LineaBase {
  tipo: 'costoFijo';
  descripcion: string;
  monto: Centavos;
}

export type RecetaLinea = LineaInsumo | LineaCostoFijo;
