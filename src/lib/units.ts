// Units and conversions. Conversions only happen within a family (mass, volume, count).

export type UnidadBase = 'g' | 'ml' | 'u';
export type Unidad = UnidadBase | 'kg' | 'l';

export const UNIDADES_BASE: readonly UnidadBase[] = ['g', 'ml', 'u'];

const DEF: Record<Unidad, { base: UnidadBase; factor: number }> = {
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  u: { base: 'u', factor: 1 },
};

const NOMBRE_FAMILIA: Record<UnidadBase, string> = { g: 'peso', ml: 'volumen', u: 'unidades' };

export function esUnidad(x: unknown): x is Unidad {
  return typeof x === 'string' && Object.hasOwn(DEF, x);
}

export function esUnidadBase(x: unknown): x is UnidadBase {
  return esUnidad(x) && DEF[x].base === x;
}

export function baseDe(u: Unidad): UnidadBase {
  return DEF[u].base;
}

/** Units that can be converted to `base`, base first. */
export function unidadesDe(base: UnidadBase): Unidad[] {
  return (Object.keys(DEF) as Unidad[]).filter((u) => DEF[u].base === base);
}

export class UnidadIncompatible extends Error {
  constructor(
    readonly desde: Unidad,
    readonly hacia: UnidadBase,
  ) {
    super(
      `Unidad incompatible: ${desde} es ${NOMBRE_FAMILIA[baseDe(desde)]} y el insumo se mide en ${hacia} (${NOMBRE_FAMILIA[hacia]})`,
    );
  }
}

/** Converts `cantidad` in `unidad` to `base`. Throws UnidadIncompatible across families. */
export function aBase(cantidad: number, unidad: Unidad, base: UnidadBase): number {
  const d = DEF[unidad];
  if (d.base !== base) throw new UnidadIncompatible(unidad, base);
  return cantidad * d.factor;
}

/** Larger display unit for a base unit (g → kg, ml → l), with its factor. */
export function unidadMayor(base: UnidadBase): { unidad: Unidad; factor: number } {
  if (base === 'g') return { unidad: 'kg', factor: 1000 };
  if (base === 'ml') return { unidad: 'l', factor: 1000 };
  return { unidad: 'u', factor: 1 };
}
